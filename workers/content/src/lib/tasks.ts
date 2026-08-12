// TASKS — kwapso's own internal admin (.plans/BUILD-1 §2). The owner's test:
// "Aurora spends forty minutes writing kwapso's own quarterly VAT return" is one
// of these; "Marta at Bergman still hasn't sent us her brand logo" is a to-do,
// and lives in the file next door.
//
// A SEPARATE FILE FROM lib/todos.ts, and the reason is worth stating rather than
// assuming: the two are the same SHAPE — a title, a due date, a done flag — and
// opposite AUDIENCES. A to-do appears on a client's screen; a task must never.
// One file with a `kind` parameter would put the agency's internal chores one
// forgotten argument away from a client's portal. Here they are not in a table
// this side can name, which is the same reasoning that split the two rate cards.
//
// WORK LOGS DO ATTACH (unlike a to-do), which is the whole reason a task is a
// record and not a checklist somewhere: forty minutes on our own VAT return is
// real time, it is ours, and it costs us the same as forty minutes of delivery.

import { logActivity, type Actor } from "@shared/workers/activity"
import { d1ExecScript, d1Query, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { GuardError, type MemberGuard } from "@shared/workers/gating"
import { LIST_HARD_CAP } from "@shared/workers/limits"
import type { Task } from "@shared/types"

import { nextRef, REF_KINDS } from "./refs"

type TaskRow = {
  id: string
  ref: string | null
  title: string
  detail: string | null
  assignee_id: string | null
  assignee_name: string | null
  due_on: string | null
  status: string
  completed_at: string | null
  account_id: string | null
  created_at: string
  creator_name: string | null
}

const TASK_COLS = `id, ref, title, detail, assignee_id, assignee_name, due_on, status,
  completed_at, account_id, created_at, creator_name`

function toTask(r: TaskRow): Task {
  return {
    id: r.id,
    ref: r.ref,
    title: r.title,
    detail: r.detail,
    assigneeId: r.assignee_id,
    assigneeName: r.assignee_name,
    dueOn: r.due_on,
    // Two states, not four. A task is admin: it is either done or it is not, and
    // "in review" on the VAT return would be a process nobody asked for.
    status: r.status === "done" ? "done" : "open",
    completedAt: r.completed_at,
    accountId: r.account_id,
    createdAt: r.created_at,
    createdByName: r.creator_name,
  }
}

/** The team's own admin list. BOUNDED (R14): admin is a handful of things at a
 * time and the done ones fall out of the default view, so this is a collection
 * that shrinks as fast as it grows. Open first, then by due date. */
export async function listTasks(
  cfg: D1Rest,
  guard: MemberGuard,
  filter: { view?: "open" | "all"; assigneeId?: string }
): Promise<Task[]> {
  const clauses: string[] = []
  const params: string[] = []
  if (filter.view !== "all") clauses.push("status <> 'done'")
  if (filter.assigneeId) {
    clauses.push("assignee_id = ?")
    params.push(filter.assigneeId)
  }
  const rows = await d1Query<TaskRow>(
    cfg,
    guard.databaseId,
    `SELECT ${TASK_COLS} FROM tasks${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY (status = 'done'), due_on IS NULL, due_on, id DESC LIMIT ${LIST_HARD_CAP}`, // R14 hard cap
    params
  )
  return rows.map(toTask)
}

/** R16: the exact server COUNT(*), over the SAME question the list asked. */
export async function countTasks(
  cfg: D1Rest,
  guard: MemberGuard,
  filter: { view?: "open" | "all"; assigneeId?: string }
): Promise<number> {
  const clauses: string[] = []
  const params: string[] = []
  if (filter.view !== "all") clauses.push("status <> 'done'")
  if (filter.assigneeId) {
    clauses.push("assignee_id = ?")
    params.push(filter.assigneeId)
  }
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM tasks${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""}`,
    params
  )
  return rows[0]?.n ?? 0
}

/** Write down a piece of our own admin. */
export async function createTask(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  input: { title: string; detail?: string; dueOn?: string; assigneeId?: string; accountId?: string }
): Promise<{ id: string; accountId: string | null }> {
  // A task that names a client is proved against the books first, exactly as a
  // story is: an unchecked id would put this task's hours in a margin nobody can
  // find.
  let accountId: string | null = null
  if (input.accountId) {
    const rows = await d1Query<{ id: string }>(
      cfg,
      guard.databaseId,
      `SELECT id FROM accounts WHERE id = ? AND deactivated_at IS NULL LIMIT 1`,
      [input.accountId]
    )
    if (!rows[0]) throw new GuardError(400, "invalid_input", "That client isn't on your books any more.")
    accountId = rows[0].id
  }

  const id = ulid()
  const now = new Date().toISOString()
  // Usually null: our own admin belongs to no client, and a reference is built
  // out of an account's short code. A number nobody can quote is worse than none.
  const ref = await nextRef(cfg, guard, accountId, REF_KINDS.task)
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO tasks (id, ref, account_id, title, detail, assignee_id, assignee_name, due_on, status, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(ref)}, ${sqlString(accountId)}, ${sqlString(input.title)}, ${sqlString(input.detail ?? null)}, ${sqlString(input.assigneeId ?? null)}, ${sqlString(input.assigneeId ? actor.name : null)}, ${sqlString(input.dueOn ?? null)}, 'open', ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Task created",
    description: `${actor.name} wrote down a task — ${input.title}`,
    relatedTable: "tasks",
    relatedRowId: id,
  })
  return { id, accountId }
}

/** Mark a task done, or put it back.
 *
 * R17: the `status <> ?` predicate rides the UPDATE, so ticking a done task moves
 * zero rows and writes no second line into its history. */
export async function setTaskDone(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  done: boolean
): Promise<{ moved: boolean; accountId: string | null }> {
  const rows = await d1Query<TaskRow>(
    cfg,
    guard.databaseId,
    `SELECT ${TASK_COLS} FROM tasks WHERE id = ? LIMIT 1`,
    [id]
  )
  const row = rows[0]
  if (!row) throw new GuardError(404, "task_not_found", "That task doesn't exist.")
  const now = new Date().toISOString()
  const status = done ? "done" : "open"
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE tasks SET status = ?, completed_at = ?, updated_at = ?, editor_id = ?, editor_email = ?, editor_name = ?
      WHERE id = ? AND status <> ? RETURNING id`,
    [status, done ? now : null, now, actor.id, actor.email, actor.name, id, status]
  )
  if (!changed[0]) return { moved: false, accountId: row.account_id }
  await logActivity(cfg, guard.databaseId, actor, {
    type: done ? "Task done" : "Task reopened",
    description: `${actor.name} ${done ? "finished" : "reopened"} ${row.ref ?? row.title}`,
    relatedTable: "tasks",
    relatedRowId: id,
  })
  return { moved: true, accountId: row.account_id }
}
