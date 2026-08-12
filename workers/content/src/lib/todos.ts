// TO-DOS — something we are waiting on the CLIENT for (.plans/BUILD-1 §2).
//
// This is the ONE part of the work engine a client login can write to, and the
// only file in it that carries an account fence rather than a flat refusal. The
// difference is the whole design: a story is our work and a client sees a count
// of it; a to-do is aimed AT them, sits in their portal with a due date, and they
// complete it themselves and upload a file against it (SCOPE ch.06 — two of the
// six things a contact can do).
//
// IT IS A SEPARATE TABLE FROM `tasks` AND A SEPARATE FILE FROM lib/tasks.ts, for
// the reason the two rate cards are separate: same shape, opposite audiences. A
// list of the agency's internal chores rendered on a client's screen is one
// forgotten `WHERE kind = 'todo'` away in the one-table version, and no distance
// away at all in this one — the internal chores are not in the table this file
// can name.
//
// NO WORK LOG EVER ATTACHES TO ONE. Enforced where time is written
// (WORK_LOG_TARGETS in lib/work-logs.ts) rather than here, because that is the
// door somebody would have to get past.

import { accountScopeClause, type AccountScope } from "@shared/workers/account-scope"
import { logActivity, type Actor } from "@shared/workers/activity"
import { d1ExecScript, d1Query, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { GuardError, type MemberGuard } from "@shared/workers/gating"
import { LIST_HARD_CAP } from "@shared/workers/limits"
import type { Todo } from "@shared/types"

import { nextRef, REF_KINDS } from "./refs"

type TodoRow = {
  id: string
  ref: string | null
  title: string
  detail: string | null
  due_on: string | null
  completed_at: string | null
  completer_name: string | null
  file_url: string | null
  file_name: string | null
  cancelled_at: string | null
  account_id: string
  account_name: string | null
  ticket_id: string | null
  created_at: string
}

const TODO_COLS = `t.id, t.ref, t.title, t.detail, t.due_on, t.completed_at, t.completer_name,
  t.file_url, t.file_name, t.cancelled_at, t.account_id, t.ticket_id, t.created_at,
  (SELECT a.name FROM accounts a WHERE a.id = t.account_id) AS account_name`

function toTodo(r: TodoRow): Todo {
  return {
    id: r.id,
    ref: r.ref,
    title: r.title,
    detail: r.detail,
    dueOn: r.due_on,
    completedAt: r.completed_at,
    // WHO COMPLETED IT is a name we are always willing to print, unlike every
    // other name in this build — because the only people who complete a to-do are
    // the client's own (it is their job) or a staff member doing it on the phone
    // with them. Neither is a disclosure about who is doing the WORK.
    completedByName: r.completer_name,
    fileUrl: r.file_url,
    fileName: r.file_name,
    cancelled: r.cancelled_at != null,
    accountId: r.account_id,
    accountName: r.account_name,
    ticketId: r.ticket_id,
    createdAt: r.created_at,
  }
}

/** THE FENCE, and it is the ordinary one: the account the to-do is FOR. Same
 * clause as the accounts list and the ticket list, reading a column. Staff get no
 * clause; a client login gets the company they are standing in and everything
 * nested beneath it.
 *
 * `scope` is REQUIRED rather than defaulted, for the reason written over
 * `ticketFence`: a fence that defaults to "not a client" is a fence that fails
 * open the day somebody writes a new reader. */
export function todoFence(scope: AccountScope): { sql: string; params: string[] } {
  return accountScopeClause(scope, "t.account_id")
}

/** Every to-do the caller may see. BOUNDED, not paged (R14): a to-do is a thing
 * we are WAITING on, so an account has a handful open at a time — this is a
 * collection that shrinks as fast as it grows, and a ceiling is an honest answer
 * rather than an eventual refusal. Open ones first, then the completed. */
export async function listTodos(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  filter: { accountId?: string; view?: "open" | "all" }
): Promise<Todo[]> {
  const fence = todoFence(scope)
  const clauses = ["t.cancelled_at IS NULL", ...(fence.sql ? [fence.sql] : [])]
  const params: string[] = [...fence.params]
  if (filter.view !== "all") clauses.push("t.completed_at IS NULL")
  if (filter.accountId) {
    clauses.push("t.account_id = ?")
    params.push(filter.accountId)
  }
  const rows = await d1Query<TodoRow>(
    cfg,
    guard.databaseId,
    `SELECT ${TODO_COLS} FROM todos t WHERE ${clauses.join(" AND ")}
      ORDER BY (t.completed_at IS NOT NULL), t.due_on IS NULL, t.due_on, t.id DESC
      LIMIT ${LIST_HARD_CAP}`, // R14 hard cap
    params
  )
  return rows.map(toTodo)
}

/** R16: the exact server COUNT(*), over the SAME question the list asked. */
export async function countTodos(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  filter: { accountId?: string; view?: "open" | "all" }
): Promise<number> {
  const fence = todoFence(scope)
  const clauses = ["t.cancelled_at IS NULL", ...(fence.sql ? [fence.sql] : [])]
  const params: string[] = [...fence.params]
  if (filter.view !== "all") clauses.push("t.completed_at IS NULL")
  if (filter.accountId) {
    clauses.push("t.account_id = ?")
    params.push(filter.accountId)
  }
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM todos t WHERE ${clauses.join(" AND ")}`,
    params
  )
  return rows[0]?.n ?? 0
}

/** One to-do the caller may see, or a clean 404 — the shape every write resolves
 * first, so "not yours" and "does not exist" are the same sentence. */
export async function todoOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string
): Promise<TodoRow> {
  const fence = todoFence(scope)
  const rows = await d1Query<TodoRow>(
    cfg,
    guard.databaseId,
    `SELECT ${TODO_COLS} FROM todos t WHERE t.id = ?${fence.sql ? ` AND ${fence.sql}` : ""} LIMIT 1`,
    [id, ...fence.params]
  )
  if (!rows[0]) throw new GuardError(404, "todo_not_found", "That to-do doesn't exist.")
  return rows[0]
}

/** Ask a client for something. STAFF ONLY — the door refuses a portal caller, so
 * a client cannot write themselves a to-do (which would be a note, and notes go
 * on the ticket). */
export async function createTodo(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  input: { accountId: string; title: string; detail?: string; dueOn?: string; ticketId?: string }
): Promise<{ id: string; ref: string | null; accountId: string }> {
  const accounts = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `SELECT id FROM accounts WHERE id = ? AND deactivated_at IS NULL LIMIT 1`,
    [input.accountId]
  )
  if (!accounts[0]) throw new GuardError(400, "invalid_input", "That client isn't on your books any more.")

  const id = ulid()
  const now = new Date().toISOString()
  const ref = await nextRef(cfg, guard, input.accountId, REF_KINDS.todo)
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO todos (id, ref, account_id, ticket_id, title, detail, due_on, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(ref)}, ${sqlString(input.accountId)}, ${sqlString(input.ticketId ?? null)}, ${sqlString(input.title)}, ${sqlString(input.detail ?? null)}, ${sqlString(input.dueOn ?? null)}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: "To-do raised",
    description: `${actor.name} asked the client for ${ref ?? "something"} — ${input.title}`,
    relatedTable: "todos",
    relatedRowId: id,
  })
  return { id, ref, accountId: input.accountId }
}

/** COMPLETE IT — the client's own act, and the only write in this build they make
 * on a row we created. Staff may do it too: half of these are completed on the
 * phone, and refusing that would make the app disagree with the conversation.
 *
 * R17: `completed_at IS NULL` rides the UPDATE, so completing a completed to-do
 * moves zero rows, writes no second history line and pings nothing. */
export async function completeTodo(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  file: { url: string; name: string } | null
): Promise<{ moved: boolean; todo: Todo; accountId: string }> {
  const before = await todoOrThrow(cfg, guard, scope, id)
  const now = new Date().toISOString()
  // The write's fence carries the BARE column: an UPDATE has no alias to hang a
  // `t.` on, and a clause written for the read would be a clause the statement
  // silently rejects. Same scope, same set of accounts, one prefix apart.
  const fence = accountScopeClause(scope, "account_id")
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    // The fence rides the WRITE as well as the read above — same sentence, same
    // statement, so neither can be removed while the other keeps the door honest.
    // A file is only ever ADDED here (`COALESCE(?, file_url)`): completing again
    // with nothing attached must not wipe what they already sent.
    `UPDATE todos SET completed_at = ?, completer_id = ?, completer_name = ?,
       file_url = COALESCE(?, file_url), file_name = COALESCE(?, file_name)
     WHERE id = ? AND completed_at IS NULL AND cancelled_at IS NULL${
       fence.sql ? ` AND ${fence.sql}` : ""
     } RETURNING id`,
    [now, actor.id, actor.name, file?.url ?? null, file?.name ?? null, id, ...fence.params]
  )
  const after = await todoOrThrow(cfg, guard, scope, id)
  if (!changed[0]) return { moved: false, todo: toTodo(after), accountId: before.account_id }

  await logActivity(cfg, guard.databaseId, actor, {
    type: "To-do completed",
    description: `${actor.name} completed ${before.ref ?? before.title}${file ? " and sent a file" : ""}`,
    relatedTable: "todos",
    relatedRowId: id,
  })
  return { moved: true, todo: toTodo(after), accountId: before.account_id }
}

/** WITHDRAW one — we stopped needing it. Deactivate-never-delete: the row and the
 * decision survive, it simply leaves the client's list. STAFF only; a client who
 * thinks a request is unnecessary says so on the ticket.
 *
 * R17: `cancelled_at IS NULL` rides the UPDATE. */
export async function cancelTodo(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string
): Promise<{ moved: boolean; accountId: string | null }> {
  const rows = await d1Query<TodoRow>(
    cfg,
    guard.databaseId,
    `SELECT ${TODO_COLS} FROM todos t WHERE t.id = ? LIMIT 1`,
    [id]
  )
  const row = rows[0]
  if (!row) throw new GuardError(404, "todo_not_found", "That to-do doesn't exist.")
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE todos SET cancelled_at = ?, canceller_id = ?, canceller_email = ?, canceller_name = ?
      WHERE id = ? AND cancelled_at IS NULL RETURNING id`,
    [now, actor.id, actor.email, actor.name, id]
  )
  if (!changed[0]) return { moved: false, accountId: row.account_id }
  await logActivity(cfg, guard.databaseId, actor, {
    type: "To-do withdrawn",
    description: `${actor.name} withdrew ${row.ref ?? row.title} — we no longer need it`,
    relatedTable: "todos",
    relatedRowId: id,
  })
  return { moved: true, accountId: row.account_id }
}
