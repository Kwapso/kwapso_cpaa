// Personal access tokens (the MCP front desk's front door). The secret is shown
// ONCE at creation and only its sha256 is stored; a token is pinned to ONE team,
// EXPIRES (expires_at — a key with no end date is a key forever), and is
// revocable (revoked_at — deactivate-not-delete). Verification happens on EVERY
// MCP request, so both a revoke and an expiry bite immediately even while a
// bridged session is still alive.

import { GuardError } from "@shared/workers/gating"
import { ulid } from "@shared/workers/id"
import type { Env } from "../env"
import { brand } from "@shared/brand"
import {
  LIST_HARD_CAP, // R14 hard cap
  MAX_ACTIVE_MCP_TOKENS_PER_USER,
  MCP_TOKEN_TTL_DAYS,
} from "@shared/workers/limits"

export type McpTokenRow = {
  id: string
  user_id: string
  team_id: string
  label: string
  created_at: string
  expires_at: string | null
  last_used_at: string | null
  revoked_at: string | null
}

/** The columns a token row is read with — never token_hash. */
const TOKEN_COLUMNS = "id, user_id, team_id, label, created_at, expires_at, last_used_at, revoked_at"

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/** 32 random bytes, hex — prefixed so a leaked string is recognizable in scans. */
export function newTokenSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  // Derived from the brand seam so a FORK re-brands its token prefix in one
  // file — while for THIS product the value stays byte-identical to the
  // external contract every doc, validator and live token already carries
  // (`kwapso_mcp_<64 hex>`). The prefix is an identity, not a secret.
  return `${brand.name}_mcp_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`
}

/** Create a token for the signed-in caller, pinned to their CURRENT team. The
 * plain secret is returned ONCE — only its hash is stored. */
export async function createToken(
  env: Env,
  userId: string,
  teamId: string,
  label: string
): Promise<{ row: McpTokenRow; secret: string }> {
  const secret = newTokenSecret()
  const id = ulid()
  const now = new Date()
  const nowIso = now.toISOString()
  const expiresAt = new Date(now.getTime() + MCP_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  // The cap RIDES THE WRITE (CONCURRENCY.md): counting first and inserting after
  // lets a burst of clicks — or a script — put any number of live keys on one
  // person, which is exactly what buries a token past the list cap. Zero rows
  // inserted = that person is full.
  const res = await env.DB.prepare(
    `INSERT INTO mcp_tokens (id, user_id, team_id, label, token_hash, created_at, expires_at)
     SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM mcp_tokens
              WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?) < ?`
  )
    .bind(
      id, userId, teamId, label, await sha256Hex(secret), nowIso, expiresAt,
      userId, nowIso, MAX_ACTIVE_MCP_TOKENS_PER_USER
    )
    .run()
  if (!res.meta.changes)
    throw new GuardError(
      409,
      "too_many_tokens",
      `You already have ${MAX_ACTIVE_MCP_TOKENS_PER_USER} active tokens. Revoke one you no longer use, then try again.`
    )
  return {
    row: {
      id,
      user_id: userId,
      team_id: teamId,
      label,
      created_at: nowIso,
      expires_at: expiresAt,
      last_used_at: null,
      revoked_at: null,
    },
    secret,
  }
}

/** The caller's own tokens (never the hashes). LIVE ONES FIRST: the cap below is
 * a hard ceiling (R14), and revoked history is the one thing that grows without
 * limit here — sorted by date alone, a long-lived token could be pushed past the
 * ceiling by its owner's own churn and become impossible to revoke from the app.
 * Unrevoked rows sort first, newest first inside each group, and one person may
 * hold only MAX_ACTIVE_MCP_TOKENS_PER_USER live ones — so a usable token is
 * always on the first page, always revocable by id. */
export async function listTokens(env: Env, userId: string): Promise<McpTokenRow[]> {
  const rows = await env.DB.prepare(
    `SELECT ${TOKEN_COLUMNS}
     FROM mcp_tokens WHERE user_id = ?
     ORDER BY (revoked_at IS NULL) DESC, created_at DESC LIMIT ${LIST_HARD_CAP}`
  )
    .bind(userId)
    .all<McpTokenRow>()
  return rows.results ?? []
}

/** Revoke ONE of the caller's own tokens BY ID (idempotent). The id is all it
 * takes — reaching it never depends on the token appearing in a capped list. */
export async function revokeToken(env: Env, userId: string, tokenId: string): Promise<void> {
  const res = await env.DB.prepare(
    "UPDATE mcp_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL"
  )
    .bind(new Date().toISOString(), tokenId, userId)
    .run()
  if (!res.meta.changes)
    throw new GuardError(404, "token_not_found", "That token doesn't exist or is already revoked.")
}

/** Verify a bearer secret → the live token row (or a clean 401). Stamps
 * last_used_at (best-effort). Called on EVERY MCP request. */
export async function verifyToken(env: Env, bearer: string): Promise<McpTokenRow> {
  const row = await env.DB.prepare(`SELECT ${TOKEN_COLUMNS} FROM mcp_tokens WHERE token_hash = ?`)
    .bind(await sha256Hex(bearer))
    .first<McpTokenRow>()
  if (!row || row.revoked_at)
    throw new GuardError(401, "bad_token", "That access token isn't valid (wrong, or revoked).")
  // FAIL CLOSED on the deadline: a missing expiry counts as expired, so a row
  // written by anything that skipped the rule is refused rather than immortal.
  if (!row.expires_at || row.expires_at <= new Date().toISOString())
    throw new GuardError(401, "token_expired", "That access token has expired. Create a new one in Settings.")
  await env.DB.prepare("UPDATE mcp_tokens SET last_used_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), row.id)
    .run()
  return row
}
