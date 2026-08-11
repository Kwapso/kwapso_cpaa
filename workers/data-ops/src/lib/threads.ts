// The agent's saved conversations (per-team memory), in the team's OWN database.
// agent_threads = one conversation; agent_messages = each turn, including the agent's
// tool-calls (the audit of what it did) + the source (in-app vs which MCP client).
// This is also the agent audit log: human turns are role "user"; agent output is
// "assistant"/"tool"; `source` tags where the request came from.

import { d1ExecScript, d1Query, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { GuardError, type MemberGuard } from "@shared/workers/gating"
import type { AgentMessage, AgentThread } from "@shared/types"
import { LIST_HARD_CAP, THREAD_HARD_CAP } from "@shared/workers/limits"

type ThreadRow = { id: string; title: string | null; last_message_at: string | null; created_at: string }
type MsgRow = {
  id: string
  thread_id: string
  role: string
  content: string | null
  tool_calls_json: string | null
  source: string | null
  created_at: string
}

function toThread(r: ThreadRow): AgentThread {
  return { id: r.id, title: r.title, lastMessageAt: r.last_message_at, createdAt: r.created_at }
}

function toMessage(r: MsgRow): AgentMessage {
  let toolCalls: AgentMessage["toolCalls"]
  if (r.tool_calls_json) {
    try {
      toolCalls = JSON.parse(r.tool_calls_json)
    } catch {
      toolCalls = undefined
    }
  }
  return {
    id: r.id,
    threadId: r.thread_id,
    role: (r.role === "assistant" || r.role === "tool" ? r.role : "user") as AgentMessage["role"],
    content: r.content,
    toolCalls,
    source: r.source,
    createdAt: r.created_at,
  }
}

/** The caller's own saved conversations, newest activity first. */
export async function listThreads(cfg: D1Rest, guard: MemberGuard): Promise<AgentThread[]> {
  const rows = await d1Query<ThreadRow>(
    cfg,
    guard.databaseId,
    `SELECT id, title, last_message_at, created_at FROM agent_threads WHERE creator_id = ? ORDER BY COALESCE(last_message_at, created_at) DESC LIMIT ${LIST_HARD_CAP}`, // R14 hard cap
    [guard.userId]
  )
  return rows.map(toThread)
}

/** Every message in a thread, oldest first. Throws 404 if the thread isn't the
 * caller's (own conversations only). */
export async function listMessages(
  cfg: D1Rest,
  guard: MemberGuard,
  threadId: string
): Promise<AgentMessage[]> {
  await ownThreadOrThrow(cfg, guard, threadId)
  const rows = await d1Query<MsgRow>(
    cfg,
    guard.databaseId,
    `SELECT id, thread_id, role, content, tool_calls_json, source, created_at FROM agent_messages WHERE thread_id = ? ORDER BY created_at ASC LIMIT ${THREAD_HARD_CAP}`, // R14 hard cap
    [threadId]
  )
  return rows.map(toMessage)
}

/** The READ half of "own conversations only" — and it answers the same sentence
 * its write-side sibling does.
 *
 * `requireOwnThread`, forty lines down, resolves ownership INSIDE the WHERE and
 * says why in one line: "404, not 403: 'that thread isn't yours' confirms the
 * thread exists." This one read the row first and then judged it, so it split the
 * two answers apart — a colleague's thread id came back 403 and a made-up one
 * 404, which is a working existence oracle over every private conversation in the
 * team, from the door that exists to keep them private. The same door, on the
 * same table, telling two callers apart in the one way it had promised not to.
 *
 * Ownership rides the statement now, exactly as the sibling does it. Outside your
 * own conversations, a real id and an invented one are the same sentence. */
async function ownThreadOrThrow(cfg: D1Rest, guard: MemberGuard, threadId: string): Promise<void> {
  const rows = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    "SELECT id FROM agent_threads WHERE id = ? AND creator_id = ? LIMIT 1",
    [threadId, guard.userId]
  )
  if (!rows[0]) throw new GuardError(404, "thread_not_found", "That conversation doesn't exist.")
}

export async function createThread(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: { id: string; email: string; name: string },
  title: string
): Promise<string> {
  const id = ulid()
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO agent_threads (id, title, last_message_at, created_at, creator_id, creator_email, creator_name) VALUES (${sqlString(id)}, ${sqlString(title.slice(0, 80) || null)}, ${sqlString(now)}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
  return id
}

/** A thread the CALLER owns, or a refusal. The chat entry point used to append
 * straight into whatever `threadId` arrived in the body: same team, so no tenant
 * was crossed, but a colleague's private conversation with the agent is not
 * yours to write into — or to read back on the next turn. Checked BEFORE the
 * first write, because an appended message can't be un-appended. */
export async function requireOwnThread(
  cfg: D1Rest,
  guard: MemberGuard,
  actorId: string,
  threadId: string
): Promise<void> {
  const rows = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    "SELECT id FROM agent_threads WHERE id = ? AND creator_id = ? LIMIT 1",
    [threadId, actorId]
  )
  // 404, not 403: "that thread isn't yours" confirms the thread exists.
  if (!rows[0]) throw new GuardError(404, "not_found", "That conversation doesn't exist.")
}

export async function appendMessage(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: { id: string; email: string; name: string },
  threadId: string,
  msg: { role: "user" | "assistant" | "tool"; content: string; toolCallsJson?: string; source: string }
): Promise<string> {
  const id = ulid()
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO agent_messages (id, thread_id, role, content, tool_calls_json, source, created_at) VALUES (${sqlString(id)}, ${sqlString(threadId)}, ${sqlString(msg.role)}, ${sqlString(msg.content || null)}, ${sqlString(msg.toolCallsJson ?? null)}, ${sqlString(msg.source)}, ${sqlString(now)});
UPDATE agent_threads SET last_message_at = ${sqlString(now)} WHERE id = ${sqlString(threadId)};`
  )
  return id
}

/** The dangerous calls the LAST turn proposed for this thread (name + input), read
 * from the most recent assistant message's stored proposal. The confirm path runs
 * exactly these — not whatever the client sends — so a client can't approve a call
 * the model never proposed. Owner-scoped (ownThreadOrThrow). */
export async function getPendingProposal(
  cfg: D1Rest,
  guard: MemberGuard,
  threadId: string
): Promise<{ name: string; input: Record<string, unknown> }[]> {
  await ownThreadOrThrow(cfg, guard, threadId)
  const rows = await d1Query<{ tool_calls_json: string | null }>(
    cfg,
    guard.databaseId,
    "SELECT tool_calls_json FROM agent_messages WHERE thread_id = ? AND role = 'assistant' AND tool_calls_json IS NOT NULL ORDER BY created_at DESC LIMIT 1",
    [threadId]
  )
  const raw = rows[0]?.tool_calls_json
  if (!raw) return []
  try {
    const arr = JSON.parse(raw) as { tool?: string; input?: unknown; status?: string }[]
    if (!Array.isArray(arr)) return []
    return arr
      .filter((x) => x && x.status === "proposed" && typeof x.tool === "string")
      .map((x) => ({
        name: x.tool as string,
        input: (x.input && typeof x.input === "object" ? x.input : {}) as Record<string, unknown>,
      }))
  } catch {
    return []
  }
}

/** SPEND the pending proposal: flip its statuses "proposed" → `outcome` and report
 * whether THIS caller is the one that won it. Rewrites the SAME row
 * getPendingProposal reads (owner-scoped).
 *
 * Called BEFORE the approved calls run, not after — the CONCURRENCY.md shape for
 * "a retryable multi-row operation that must run at most once" (the CSV importer's
 * planned→running flip is its twin). Read-then-write ran the proposal after the
 * work and checked nothing, so two /confirm posts — a double-tap, a retried
 * request — both read the same "proposed" calls and both EXECUTED them: the
 * approval gate's one job is that a dangerous call runs when the person approved
 * it, and it ran twice. The claim is a compare-and-swap on the exact stored text,
 * so only one caller can win it; a failure mid-run leaves the proposal spent
 * (safe — nothing duplicates) and the person asks the agent again.
 *
 * `outcome` is REQUIRED, not defaulted, because BOTH answers spend a proposal and
 * the audit has to tell them apart. "no" is an answer: a decline that only
 * appended a sentence left the calls at "proposed" for ever, and a later
 * {approve:true} on the same thread executed exactly what the person had refused.
 * A declined proposal marked "done" would be the same lie from the other side —
 * these rows ARE the agent's audit log (top of this file). The compare-and-swap
 * is a bonus here: a decline racing an approve means one of them wins and the
 * calls run once or not at all, never both. */
export async function consumePendingProposal(
  cfg: D1Rest,
  guard: MemberGuard,
  threadId: string,
  outcome: "done" | "declined"
): Promise<boolean> {
  await ownThreadOrThrow(cfg, guard, threadId)
  const rows = await d1Query<{ id: string; tool_calls_json: string | null }>(
    cfg,
    guard.databaseId,
    "SELECT id, tool_calls_json FROM agent_messages WHERE thread_id = ? AND role = 'assistant' AND tool_calls_json IS NOT NULL ORDER BY created_at DESC LIMIT 1",
    [threadId]
  )
  const row = rows[0]
  if (!row?.tool_calls_json) return false
  let updated: string
  try {
    const arr = JSON.parse(row.tool_calls_json) as { status?: string }[]
    if (!Array.isArray(arr)) return false
    updated = JSON.stringify(arr.map((x) => (x && x.status === "proposed" ? { ...x, status: outcome } : x)))
  } catch {
    return false
  }
  // The predicate rides the write: the row must still hold the text we read.
  // Whoever gets here second finds it already rewritten and moves zero rows.
  const claimed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE agent_messages SET tool_calls_json = ${sqlString(updated)} WHERE id = ${sqlString(row.id)} AND tool_calls_json = ${sqlString(row.tool_calls_json)} RETURNING id;`
  )
  return claimed.length > 0
}
