// Agent routes: the team's AI quota, the owner credit top-up, and the agent itself —
// chat (run a turn), confirm (approve/decline a proposed dangerous action), and the
// saved conversations. Using the agent is gated by the `agent` module right
// (read = view history; create = use it). The agent's ACTIONS are gated again at the
// real endpoint it calls (act-as-user), so it can never exceed the caller's rights.

import { fail, json } from "@shared/workers/http"
import { optionalText, queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { GuardError, adminGuard, requireRight, teamContext } from "@shared/workers/gating"
import { recordWorkerError } from "@shared/workers/error-log"
import { AGENT_CHAT_MAX_BYTES, AGENT_FILE_MAX_BYTES, AGENT_MAX_FILES } from "@shared/workers/limits"
import { getQuota, grantCredits, readUsageLog } from "../lib/credits"
import { confirmAndRun, runChat, type Emit } from "../lib/agent"
import { listMessages, listThreads } from "../lib/threads"
import type { ChatOutcome, StreamEvent } from "@shared/types"
import type { Env } from "../env"

/** One SSE frame: `data: <json>\n\n` on a text/event-stream body. The whole wire format
 * lives here so both sides agree on it; exported for the unit test. */
export function sseFrame(ev: StreamEvent): string {
  return `data: ${JSON.stringify(ev)}\n\n`
}

/** A finished ChatOutcome → its single TERMINAL stream event. A pause-for-confirm
 * outcome becomes `confirm`; anything else is the completed `final`. (An error is
 * emitted by the run wrapper, never derived here.) */
export function terminalEvent(outcome: ChatOutcome): StreamEvent {
  return outcome.done
    ? { t: "final", outcome }
    : {
        t: "confirm",
        threadId: outcome.threadId,
        calls: outcome.needsConfirm,
        text: outcome.assistantText || undefined,
      }
}

/** True if the client asked for the live stream (Accept: text/event-stream). The JSON
 * endpoints are the fallback for any client that didn't. */
function wantsStream(request: Request): boolean {
  return (request.headers.get("Accept") ?? "").includes("text/event-stream")
}

/** WHICH SURFACE ASKED — the value stamped on every row this turn writes
 * (agent_messages.source, and the usage log's). It used to be the literal
 * "in-app" for BOTH callers, so a turn driven by a personal access token through
 * `agent_chat` was recorded as if a person had typed it in the app. Nothing
 * exceeded its rights either way, but after a token leak the one question the
 * column exists to answer — did a token do this, or did a person? — had no
 * answer anywhere.
 *
 * Derived from the SESSION, not from a header: only auth's internal bridge mints
 * a team-pinned session, and only for a verified token, so `pinnedTeamId` is a
 * claim the caller cannot make about itself. A header would let a browser label
 * its own turn "mcp" (and a machine label itself "in-app"), which is the same
 * hole facing the other way. */
function callerSurface(user: { pinnedTeamId: string | null }): string {
  return user.pinnedTeamId ? "mcp" : "in-app"
}

/** Run an agent turn as an SSE stream: `run(emit)` produces the ChatOutcome while emitting
 * text + step events; when it returns we write the ONE terminal event and close. A
 * thrown GuardError keeps its own clean message (an over-quota or file-too-large
 * refusal must say WHY — never the generic line); anything else becomes the safe
 * generic event AND is recorded in the central error store (the worker's main catch
 * can't see a throw that happens inside the stream). */
function streamRun(env: Env, run: (emit: Emit) => Promise<ChatOutcome>): Response {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const enc = new TextEncoder()
  const write = (ev: StreamEvent) => writer.write(enc.encode(sseFrame(ev)))

  void (async () => {
    try {
      const outcome = await run((ev) => void write(ev))
      await write(terminalEvent(outcome))
    } catch (e) {
      if (e instanceof GuardError) {
        await write({ t: "error", message: e.message })
      } else {
        console.error("agent stream error:", e)
        await recordWorkerError(env.DB, "data-ops", "POST /api/data-ops/agent (stream)", e)
        await write({ t: "error", message: "The assistant had trouble just now. Please try again in a moment." })
      }
    } finally {
      await writer.close().catch(() => {})
    }
  })()

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Defeat proxy/response buffering so deltas reach the browser as they're written.
      "X-Accel-Buffering": "no",
    },
  })
}

/** GET /api/data-ops/agent/usage — the active team's AI quota (free + credits). */
export async function getAgentUsage(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "agent", "read")
  return json({ quota: await getQuota(env, guard.teamId) })
}

/** GET /api/data-ops/agent/usage-log?limit= — the team's AI usage trail, newest-first
 * (one row per turn). Gated + team-scoped exactly like GET /agent/usage. */
export async function getAgentUsageLog(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "agent", "read")
  const raw = Number(new URL(request.url).searchParams.get("limit"))
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.trunc(raw), 200) : 50
  // Pass the viewer's id so the log redacts other members' prompt summaries (privacy).
  return json({ rows: await readUsageLog(env, guard.teamId, actor.id, limit) })
}

/** POST /api/data-ops/admin/grant-credits — owner-only credit top-up (x-admin-key). */
export async function postGrantCredits(request: Request, env: Env): Promise<Response> {
  const blocked = adminGuard(request, env)
  if (blocked) return blocked
  const body = (await request.json().catch(() => ({}))) as { teamId?: unknown; amount?: unknown }
  const teamId = requireText(body.teamId, "Team", TEXT_LIMITS.short)
  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount <= 0 || Math.trunc(amount) !== amount)
    return fail(400, "invalid_input", "teamId and a positive whole amount are required.")
  const balance = await grantCredits(env, teamId, amount)
  await publishChange(env, teamId, "agent_usage")
  return json({ teamId, balance })
}

/** POST /api/data-ops/agent/chat — run one agent turn (answer, or propose/take action).
 * When the client Accepts text/event-stream we stream progress (text deltas + step
 * events) and end with the single terminal event; otherwise we return the JSON outcome. */
export async function postAgentChat(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, user } = await teamContext(request, env)
  await requireRight(cfg, guard, "agent", "create")
  // THE CEILING GOES IN FRONT OF THE PARSE. Every cap below is real and every one
  // of them used to be read AFTER `request.json()` had already buffered and
  // parsed the whole body — so the caps bounded what could be IMPORTED while the
  // parse bounded what could be SENT, and the parse's own bound was 8 × 5 MB of
  // JSON string in a 128 MB isolate. Checking the declared length first costs one
  // header read and turns an out-of-memory into a sentence.
  const declared = Number(request.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > AGENT_CHAT_MAX_BYTES)
    return fail(413, "request_too_large", "That message is too big to send. Attach fewer or smaller files.")
  const body = (await request.json().catch(() => ({}))) as {
    threadId?: unknown
    message?: unknown
    files?: unknown
  }
  const message = requireText(body.message, "Message", TEXT_LIMITS.message)
  const threadId = optionalText(body.threadId, "Thread", 64)
  // Attached CSVs (the chat import): validated here at the boundary; the batch
  // engine re-enforces its own caps (file count, rows, bytes) when they're added.
  let files: { name: string; csv: string }[] | undefined
  if (Array.isArray(body.files) && body.files.length) {
    if (body.files.length > AGENT_MAX_FILES)
      return fail(400, "too_many_files", `Attach up to ${AGENT_MAX_FILES} files at a time.`)
    files = body.files.map((f) => {
      const raw = (f ?? {}) as { name?: unknown; csv?: unknown }
      const name = optionalText(raw.name, "File name", 200) ?? "file"
      if (typeof raw.csv !== "string" || !raw.csv.trim())
        throw new GuardError(400, "invalid_input", "Each attached file needs CSV text.")
      if (raw.csv.length > AGENT_FILE_MAX_BYTES)
        throw new GuardError(413, "file_too_large", `"${name}" is too large. Export a smaller CSV (up to about 5 MB).`)
      return { name, csv: raw.csv }
    })
  }
  const opts = { threadId, message, source: callerSurface(user), files }
  if (wantsStream(request))
    return streamRun(env, (emit) => runChat(env, request, cfg, guard, actor, opts, emit))
  return json(await runChat(env, request, cfg, guard, actor, opts))
}

/** POST /api/data-ops/agent/confirm — approve (or decline) the proposed dangerous
 * action(s) the last turn returned, then resume. */
export async function postAgentConfirm(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, user } = await teamContext(request, env)
  await requireRight(cfg, guard, "agent", "create")
  const body = (await request.json().catch(() => ({}))) as { threadId?: unknown; approve?: unknown }
  const threadId = requireText(body.threadId, "Thread", 64)
  if (typeof body.approve !== "boolean")
    return fail(400, "invalid_input", "threadId and approve are required.")
  // What runs comes from the server's stored proposal (in confirmAndRun), not the
  // client — any client-supplied `calls` are ignored, so nothing un-proposed executes.
  const opts = { threadId, approve: body.approve, source: callerSurface(user) }
  if (wantsStream(request))
    return streamRun(env, (emit) => confirmAndRun(env, request, cfg, guard, actor, opts, emit))
  return json(await confirmAndRun(env, request, cfg, guard, actor, opts))
}

/** GET /api/data-ops/agent/threads — the caller's saved conversations. */
export async function getAgentThreads(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "agent", "read")
  return json({ threads: await listThreads(cfg, guard) })
}

/** GET /api/data-ops/agent/thread?id= — one conversation's messages. */
export async function getAgentThread(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "agent", "read")
  const id = queryText(new URL(request.url).searchParams.get("id"), "Id")
  if (!id) return fail(400, "invalid_input", "A conversation id is required.")
  return json({ messages: await listMessages(cfg, guard, id) })
}
