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
import { departmentAsks, priorityScore } from "@shared/departments"
import type { Task, TaskViewName } from "@shared/types"

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
  account_name: string | null
  important: number
  urgent: number
  department: string | null
  app_id: string | null
  app_name: string | null
  file_url: string | null
  file_name: string | null
  created_at: string
  creator_name: string | null
}

const TASK_COLS = `t.id, t.ref, t.title, t.detail, t.assignee_id, t.assignee_name, t.due_on, t.status,
  t.completed_at, t.account_id, t.important, t.urgent, t.department, t.app_id,
  t.file_url, t.file_name, t.created_at, t.creator_name,
  (SELECT a.name FROM accounts a WHERE a.id = t.account_id) AS account_name,
  (SELECT p.name FROM apps p WHERE p.id = t.app_id) AS app_name`

function toTask(r: TaskRow): Task {
  const important = r.important === 1
  const urgent = r.urgent === 1
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
    accountName: r.account_name,
    important,
    urgent,
    // DERIVED, never stored — one formula, in the shared file both front doors
    // and this worker read, so a screen and a door can never score the same two
    // ticks differently.
    priority: priorityScore(important, urgent),
    department: r.department,
    appId: r.app_id,
    appName: r.app_name,
    fileUrl: r.file_url,
    fileName: r.file_name,
    createdAt: r.created_at,
    createdByName: r.creator_name,
  }
}

/** TODAY, as the date half of an ISO moment — the boundary the three dated views
 * and the progress bar are all cut on.
 *
 * UTC, deliberately and honestly: a worker has no reader's clock, and the
 * alternative (guessing a timezone from the request) is a wrong answer wearing a
 * right one's clothes. The cost is that a deadline flips overdue at midnight UTC
 * rather than midnight in Munich, which is an hour or two either way on a field
 * whose unit is a day. `due_on` is stored as a full ISO moment, so the string
 * comparison is exact: '2026-08-16T09:00:00Z' < '2026-08-17' is true and
 * '2026-08-17T00:00:00Z' < '2026-08-17' is false. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Tomorrow's date, which is how "due today or earlier" is asked: `due_on <
 * tomorrow` catches every moment of today without needing to know the end of it. */
function tomorrowIso(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** WHAT EACH OF THE SIX VIEWS ASKS FOR, as a WHERE fragment — written once so
 * the list and the counts beside it can never be asked different questions
 * (R16). `?` is the date the caller passes; the count query below spells the
 * same six conditions out as CASE arms, which is the only duplication here and
 * the reason there is a test that runs both. */
function viewClause(view: TaskViewName): { sql: string | null; dated: "today" | "tomorrow" | null } {
  if (view === "all") return { sql: null, dated: null }
  if (view === "overdue")
    return { sql: "t.status <> 'done' AND t.due_on IS NOT NULL AND t.due_on < ?", dated: "today" }
  if (view === "upcoming")
    return { sql: "t.status <> 'done' AND t.due_on IS NOT NULL AND t.due_on >= ?", dated: "today" }
  if (view === "completed") return { sql: "t.status = 'done'", dated: null }
  // THE CALENDAR shows what has a date on it, finished or not — a month grid
  // with the done ones missing is a month grid that lies about last week.
  if (view === "calendar") return { sql: "t.due_on IS NOT NULL", dated: null }
  return { sql: "t.status <> 'done'", dated: null }
}

export type TaskFilter = {
  view?: TaskViewName
  /** narrow to one person's — also how "you may only see your own" is applied,
   * so there is ONE clause rather than a filter and a fence saying the same
   * thing in two places. */
  assigneeId?: string
}

function taskWhere(filter: TaskFilter): { sql: string; params: string[] } {
  const clauses: string[] = []
  const params: string[] = []
  const view = viewClause(filter.view ?? "open")
  if (view.sql) {
    clauses.push(view.sql)
    if (view.dated === "today") params.push(todayIso())
    if (view.dated === "tomorrow") params.push(tomorrowIso())
  }
  if (filter.assigneeId) {
    clauses.push("t.assignee_id = ?")
    params.push(filter.assigneeId)
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "", params }
}

/** The team's own admin list. BOUNDED (R14): admin is a handful of things at a
 * time and the done ones fall out of the default view, so this is a collection
 * that shrinks as fast as it grows. Most urgent and most overdue first, then by
 * deadline — the order the person reading it is standing in. */
export async function listTasks(
  cfg: D1Rest,
  guard: MemberGuard,
  filter: TaskFilter
): Promise<Task[]> {
  const { sql, params } = taskWhere(filter)
  const rows = await d1Query<TaskRow>(
    cfg,
    guard.databaseId,
    `SELECT ${TASK_COLS} FROM tasks t${sql}
      ORDER BY (t.status = 'done'), ((t.important * 2) + t.urgent) DESC,
               t.due_on IS NULL, t.due_on, t.id DESC LIMIT ${LIST_HARD_CAP}`, // R14 hard cap
    params
  )
  return rows.map(toTask)
}

/** EVERY BADGE ON THE STRIP, AND THE PROGRESS BAR, IN ONE READ.
 *
 * R16 wants an exact server COUNT(*) per tab, and there are six tabs plus a
 * progress bar — which as separate queries is eight round trips through the REST
 * door for one screen. They are eight questions about the same rows, so they are
 * one SELECT of conditional sums: exact, consistent with each other (nobody can
 * tick a task off between count three and count four), and one trip.
 *
 * `dueToday` is the progress bar's pair — everything due TODAY OR EARLIER, and
 * how many of those are done. Deliberately not "due today": a thing that was due
 * on Friday is still today's problem, which is what the tester means by the
 * number she wants at the top of every tab. */
export type TaskCounts = {
  open: number
  overdue: number
  upcoming: number
  completed: number
  calendar: number
  all: number
  dueToday: number
  dueTodayDone: number
}

export async function countTasks(
  cfg: D1Rest,
  guard: MemberGuard,
  filter: { assigneeId?: string }
): Promise<TaskCounts> {
  const clauses: string[] = []
  const params: string[] = [todayIso(), todayIso(), tomorrowIso(), tomorrowIso()]
  if (filter.assigneeId) {
    clauses.push("t.assignee_id = ?")
    params.push(filter.assigneeId)
  }
  const rows = await d1Query<Record<string, number>>(
    cfg,
    guard.databaseId,
    `SELECT
       SUM(CASE WHEN t.status <> 'done' THEN 1 ELSE 0 END) AS open_n,
       SUM(CASE WHEN t.status <> 'done' AND t.due_on IS NOT NULL AND t.due_on < ? THEN 1 ELSE 0 END) AS overdue_n,
       SUM(CASE WHEN t.status <> 'done' AND t.due_on IS NOT NULL AND t.due_on >= ? THEN 1 ELSE 0 END) AS upcoming_n,
       SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS completed_n,
       SUM(CASE WHEN t.due_on IS NOT NULL THEN 1 ELSE 0 END) AS calendar_n,
       COUNT(*) AS all_n,
       SUM(CASE WHEN t.due_on IS NOT NULL AND t.due_on < ? THEN 1 ELSE 0 END) AS due_today_n,
       SUM(CASE WHEN t.due_on IS NOT NULL AND t.due_on < ? AND t.status = 'done' THEN 1 ELSE 0 END) AS due_today_done_n
     FROM tasks t${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""}`,
    params
  )
  const r = rows[0] ?? {}
  // SUM over no rows is NULL, not 0 — a brand-new team's screen would otherwise
  // badge every tab with nothing at all.
  const n = (key: string) => Number(r[key] ?? 0)
  return {
    open: n("open_n"),
    overdue: n("overdue_n"),
    upcoming: n("upcoming_n"),
    completed: n("completed_n"),
    calendar: n("calendar_n"),
    all: n("all_n"),
    dueToday: n("due_today_n"),
    dueTodayDone: n("due_today_done_n"),
  }
}

/** What a caller may write onto a piece of our own admin. */
export type TaskInput = {
  title: string
  detail?: string
  dueOn?: string
  assigneeId?: string
  assigneeName?: string
  accountId?: string
  important?: boolean
  urgent?: boolean
  department?: string
  appId?: string
  fileUrl?: string
  fileName?: string
}

/** Write down a piece of our own admin. */
export async function createTask(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  input: TaskInput
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
  // The same proof for the app, and for the same reason: a Production task that
  // names an app nobody can open is a task filed under nothing.
  let appId: string | null = null
  if (input.appId) {
    const rows = await d1Query<{ id: string }>(
      cfg,
      guard.databaseId,
      `SELECT id FROM apps WHERE id = ? AND deactivated_at IS NULL LIMIT 1`,
      [input.appId]
    )
    if (!rows[0]) throw new GuardError(400, "invalid_input", "That app isn't one of ours any more.")
    appId = rows[0].id
  }

  // THE DEPARTMENT'S OWN RULE, applied at the DOOR and not only on the form.
  // "A Production task must name an app" is a product decision (c6), so it is
  // enforced where a decision has to be enforced — a form can be bypassed and a
  // machine caller never sees one. The sentence itself lives in
  // shared/departments.ts, once, so the field the form REVEALS and the field the
  // door REQUIRES cannot drift apart.
  const asks = departmentAsks(input.department ?? null)
  if (asks.required && asks.field === "app" && !appId)
    throw new GuardError(400, "invalid_input", `A ${input.department} task has to name the app it is on.`)
  if (asks.required && asks.field === "account" && !accountId)
    throw new GuardError(400, "invalid_input", `A ${input.department} task has to name the client it is for.`)

  const id = ulid()
  const now = new Date().toISOString()
  // Usually null: our own admin belongs to no client, and a reference is built
  // out of an account's short code. A number nobody can quote is worse than none.
  const ref = await nextRef(cfg, guard, accountId, REF_KINDS.task)
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO tasks (id, ref, account_id, app_id, title, detail, assignee_id, assignee_name, due_on,
  important, urgent, department, file_url, file_name,
  status, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(ref)}, ${sqlString(accountId)}, ${sqlString(appId)}, ${sqlString(input.title)}, ${sqlString(input.detail ?? null)}, ${sqlString(input.assigneeId ?? null)}, ${sqlString(input.assigneeId ? (input.assigneeName ?? actor.name) : null)}, ${sqlString(input.dueOn ?? null)}, ${input.important ? 1 : 0}, ${input.urgent ? 1 : 0}, ${sqlString(input.department ?? null)}, ${sqlString(input.fileUrl ?? null)}, ${sqlString(input.fileName ?? null)}, 'open', ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
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
    `SELECT ${TASK_COLS} FROM tasks t WHERE t.id = ? LIMIT 1`,
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
