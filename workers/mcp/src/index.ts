// kwapso MCP worker — the external machine surface (ARCHITECTURE: the MCP front
// desk). This file is the SWITCHBOARD:
//
//   POST /mcp                    -> the MCP endpoint (JSON-RPC 2.0 over HTTP):
//                                   initialize · tools/list · tools/call.
//                                   Auth: `Authorization: Bearer <token>` — a
//                                   personal access token, verified on EVERY
//                                   request, bridged to a team-pinned session.
//
// THIS SURFACE IS THE AGENCY'S, not its clients'. A client-portal login is an
// ordinary team member by construction, so "signed in" never distinguished them
// — both doors that hand out power (minting a token, and acting with one) ask
// tenancy which kind of caller this is first. See lib/staff.ts.
//   GET  /api/mcp/tokens         -> the signed-in caller's tokens (never hashes)
//   POST /api/mcp/tokens         -> create one (label; pinned to the CURRENT team;
//                                   the secret is returned ONCE)
//   POST /api/mcp/tokens/revoke  -> revoke one of the caller's own tokens
//   GET  /api/mcp/health
//
// THE LIVE-SYNC SEAM (CACHING.md "Every mutation publishes"): the token routes are
// housekeeping — a token row is CALLER-PRIVATE bookkeeping in the core DB (the
// settings screen refetches synchronously after each action; no other member can
// see it), the same reviewed class as auth's session rows. Tool calls themselves
// mutate nothing here — the REAL doors they forward to publish their own pings.

import { fail, json } from "@shared/workers/http"
import { GuardError, whoAmI } from "@shared/workers/gating"
import { callerHasBudget, TOO_FAST } from "@shared/workers/rate-limit"
import { requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { recordWorkerError } from "@shared/workers/error-log"
import { requestId } from "@shared/workers/trace"
import type { Env } from "./env"
import { createToken, listTokens, revokeToken, verifyToken } from "./lib/tokens"
import { dropCachedSession, sessionCookieFor } from "./lib/bridge"
import { requireStaff } from "./lib/staff"
import { forwardTool, getMcpTool, MCP_TOOLS } from "./lib/tools"

const PROTOCOL_VERSION = "2025-06-18"

/* ------------------------------- JSON-RPC bits ------------------------------- */

type RpcRequest = { jsonrpc?: string; id?: number | string | null; method?: string; params?: Record<string, unknown> }

const rpcResult = (id: number | string | null, result: unknown) =>
  json({ jsonrpc: "2.0", id, result })
const rpcError = (id: number | string | null, code: number, message: string) =>
  json({ jsonrpc: "2.0", id, error: { code, message } })

/** One MCP request: verify the bearer token, dispatch the method. Stateless —
 * no server-held MCP session; every request re-verifies the token (so a revoke
 * bites immediately) and rides a cached-or-fresh team-pinned session cookie. */
async function handleMcp(request: Request, env: Env): Promise<Response> {
  const bearer = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (!bearer)
    return fail(401, "no_token", "Send a personal access token: Authorization: Bearer <token>.")
  const token = await verifyToken(env, bearer)

  // THE MACHINE SURFACE'S OWN CEILING, spent per TOKEN OWNER and separately from
  // their budget inside the app (rate-limit.ts). It sits here because this is where
  // the caller becomes known, exactly as `teamContext` is that point for the app —
  // and it is worth having on top of the per-worker budgets behind it, because one
  // JSON-RPC call can become several forwarded door calls: refusing the loop at the
  // front is cheaper than refusing each of its consequences.
  if (!(await callerHasBudget(env, token.user_id, "machine")))
    throw new GuardError(429, "too_many_requests", TOO_FAST)

  const rpc = (await request.json().catch(() => null)) as RpcRequest | null
  if (!rpc || rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string")
    return rpcError(null, -32600, "Expected a JSON-RPC 2.0 request.")
  const id = rpc.id ?? null

  switch (rpc.method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "kwapso-mcp", version: "1.0.0" },
        instructions:
          "kwapso's machine surface. Every tool acts AS the token's owner, capped by their live role, inside the token's pinned team only. AI-costed tools (plan_import, agent_chat) draw from the team's assistant quota.",
      })
    case "notifications/initialized":
      return new Response(null, { status: 202 })
    case "ping":
      return rpcResult(id, {})
    case "tools/list":
      return rpcResult(id, {
        tools: MCP_TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      })
    case "tools/call": {
      const name = String(rpc.params?.name ?? "")
      const tool = getMcpTool(name)
      if (!tool) return rpcError(id, -32602, `No such tool: ${name}.`)
      const input = (rpc.params?.arguments ?? {}) as Record<string, unknown>
      const cookie = await sessionCookieFor(env, token)
      const out = await forwardTool(env, tool, input, cookie)
      return rpcResult(id, {
        content: [{ type: "text", text: out.text }],
        isError: !out.ok,
      })
    }
    default:
      return rpcError(id, -32601, `Unknown method: ${rpc.method}.`)
  }
}

/* ----------------------------- token management ----------------------------- */

/** The signed-in caller (session cookie via the gateway) — token management is a
 * HUMAN action from the app, never available to a bearer token itself. */
async function requireUser(request: Request, env: Env) {
  const user = await whoAmI(request, env)
  if (!user) throw new GuardError(401, "signed_out", "Not signed in.")
  return user
}

async function getTokens(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const rows = await listTokens(env, user.id)
  return json({
    tokens: rows.map((t) => ({
      id: t.id,
      label: t.label,
      teamId: t.team_id,
      createdAt: t.created_at,
      // A token expires (0016). The screen shows the deadline, so "active" on
      // this list means usable — not merely un-revoked.
      expiresAt: t.expires_at,
      lastUsedAt: t.last_used_at,
      revokedAt: t.revoked_at,
    })),
  })
}

async function postToken(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  if (!user.currentTeamId)
    return fail(409, "no_team", "Pick a team first — a token is pinned to one team.")
  // A CLIENT LOGIN MINTS NOTHING. They are a team member by construction, so
  // "signed in" was never the question — see lib/staff.ts. Asked with the
  // caller's OWN cookie, before the label is even read.
  await requireStaff(env, request.headers.get("Cookie") ?? "")
  const body = (await request.json().catch(() => ({}))) as { label?: unknown }
  const label = requireText(body.label, "Name", TEXT_LIMITS.short)
  const { row, secret } = await createToken(env, user.id, user.currentTeamId, label)
  // The ONE time the secret leaves the server.
  return json({
    token: {
      id: row.id,
      label: row.label,
      teamId: row.team_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    },
    secret,
  })
}

async function postRevoke(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  // R20, properly. This used to be a cast plus `if (!body.id)` — the two shapes
  // the law names as NOT checks. A truthiness guard passes `{}`, `[]` and `1`,
  // and an object then reaches D1's `.bind()` in revokeToken, which raises a type
  // error: a 500 and a global error_logs row, per request, from any session. The
  // RAW_BODY_EXEMPT line that covered this said "an unrecognised value refuses
  // rather than reaching anything", which was true of a wrong STRING and false of
  // a wrong TYPE — the distinction the law exists for.
  const body = (await request.json().catch(() => ({}))) as { id?: unknown }
  const id = requireText(body.id, "Token", TEXT_LIMITS.short)
  await revokeToken(env, user.id, id)
  dropCachedSession(id)
  return json({ ok: true })
}

/* --------------------------------- switchboard -------------------------------- */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    const route = `${request.method} ${pathname}`
    try {
      switch (route) {
        case "POST /mcp":
          return await handleMcp(request, env)
        case "GET /api/mcp/tokens":
          return await getTokens(request, env)
        case "POST /api/mcp/tokens":
          return await postToken(request, env)
        case "POST /api/mcp/tokens/revoke":
          return await postRevoke(request, env)
        case "GET /api/mcp/health":
          return json({ ok: true })
        default:
          return fail(404, "not_found", "No such MCP action.")
      }
    } catch (e) {
      if (e instanceof GuardError) return fail(e.status, e.code, e.message)
      console.error("mcp worker error:", e)
      await recordWorkerError(env.DB, "mcp", `${request.method} ${pathname}`, e, requestId(request))
      return fail(500, "internal", "Something went wrong on our side. Try again.")
    }
  },
} satisfies ExportedHandler<Env>
