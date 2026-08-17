// TO-DO and TASK routes — the two nouns that are the same shape and opposite
// audiences, kept apart at the door as well as in the tables.
//
// The to-do doors carry the ACCOUNT FENCE: a client login reaches two of them
// (the list and the complete) and sees their own company's, exactly as they do
// with tickets. The task doors REFUSE a portal caller outright, like the rest of
// the work engine, because a task is our own admin and no client has any business
// knowing it exists.
//
// Two of these doors are on the portal gateway's surface and the rest are not,
// which is the same statement made in a second place — see PORTAL_DOORS and the
// PORTAL_VISIBLE_* tables in shared/rules/registry.ts.

import { fail, json } from "@shared/workers/http"
import { optionalMoment, optionalText, queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { hasRight } from "@shared/workers/gating"
import { accountScope, refusePortalCaller, type AccountScope } from "@shared/workers/account-scope"
import { gated, gatedBody } from "@shared/workers/route"
import { mediaKey, parseUploadDataUrl } from "@shared/workers/image"
import { cancelTodo, clientSprints, completeTodo, countTodos, createTodo, listTodos } from "../lib/todos"
import { countTasks, createTask, listTasks, setTaskDone, type TaskFilter } from "../lib/tasks"
import { notifyTodoRaised, teamMemberNames } from "../lib/notify"
import { TASK_VIEWS, type TaskViewName } from "@shared/types"
import type { Env } from "../env"

/** WHOSE WORLD IS THIS CALLER STANDING IN? Resolved once per request, the same
 * sentence every to-do door speaks — including the WRITE, because the write is
 * the one a client makes.
 *
 * A `function`, deliberately, not a `const` arrow: the portal-fence walk follows
 * route-LOCAL helpers by reading function declarations off disk, and a helper it
 * cannot see through is a fence it cannot prove. */
async function callerScope(
  cfg: Parameters<typeof listTodos>[0],
  guard: Parameters<typeof listTodos>[1]
): Promise<AccountScope> {
  return accountScope(cfg, guard)
}

/** What a client may send us against a to-do. Generous for a logo or a signed
 * PDF, small enough that one door cannot be used as free storage. */
const MAX_TODO_FILE_BYTES = 10 * 1024 * 1024

/** GET /api/content/todos — what we are waiting on. Fenced: a client login sees
 * their company's, staff see everyone's (?accountId narrows to one client). */
export async function getTodos(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "todos", "read")
  const scope = await callerScope(cfg, guard)
  const url = new URL(request.url)
  const filter = {
    accountId: queryText(url.searchParams.get("accountId"), "Client"),
    view: queryText(url.searchParams.get("view"), "View") === "all" ? ("all" as const) : ("open" as const),
  }
  return json({
    todos: await listTodos(cfg, guard, scope, filter),
    // R16: the exact server count, over the same question the list asked.
    total: await countTodos(cfg, guard, scope, filter),
  })
}

/** POST /api/content/todos — ask a client for something (todos:create).
 *
 * STAFF ONLY. A client writing themselves a to-do would be a note, and notes go
 * on the ticket where we can see them.
 *
 * THIS DOOR SENDS EMAIL — one of only two things in the product that does
 * (BUILD-1 §7). That is why it is the one to-do door a client login cannot pass:
 * everything else here changes a row, and this reaches into somebody's inbox. */
export async function postCreateTodo(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    accountId?: unknown
    title?: unknown
    detail?: unknown
    dueOn?: unknown
    ticketId?: unknown
  }>(request, env, "todos", "create")
  const scope = await refusePortalCaller(cfg, guard)
  const created = await createTodo(cfg, guard, actor, {
    accountId: requireText(body.accountId, "Client", TEXT_LIMITS.short),
    title: requireText(body.title, "What we need", TEXT_LIMITS.short),
    detail: optionalText(body.detail, "Detail", TEXT_LIMITS.long),
    dueOn: optionalMoment(body.dueOn, "Due"),
    ticketId: optionalText(body.ticketId, "Ticket", TEXT_LIMITS.short),
  })
  await publishChange(env, guard.teamId, "todos", created.id, "add", created.accountId)
  // Best-effort, and after the write: a failed email must never fail the to-do
  // that triggered it. The row is already saved and already on their screen.
  await notifyTodoRaised(env, cfg, guard, created.id)
  const filter = { view: "open" as const }
  return json({
    todos: await listTodos(cfg, guard, scope, filter),
    total: await countTodos(cfg, guard, scope, filter),
  })
}

/** POST /api/content/todos/complete — the client's own act (todos:EDIT).
 *
 * They may attach one file while they are at it, which is the other half of
 * SCOPE ch.06's "complete a to-do and upload a file against it". The file is
 * parsed and capped at the boundary through the same seam every upload in the
 * base uses, and the KEY is the credential — the gateways serve /media/* with no
 * session, so every object carries a random ULID segment.
 *
 * R17: completing a completed to-do moves zero rows and publishes nothing. */
export async function postCompleteTodo(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    id?: unknown
    fileDataUrl?: unknown
    fileName?: unknown
  }>(request, env, "todos", "edit")
  // The fence decides whose to-do this is BEFORE anything is written — 404, never
  // 403, so "not yours" never confirms the to-do exists.
  const scope = await callerScope(cfg, guard)
  const id = requireText(body.id, "To-do", TEXT_LIMITS.short)

  let file: { url: string; name: string } | null = null
  if (body.fileDataUrl !== undefined && body.fileDataUrl !== null) {
    const parsed = parseUploadDataUrl(body.fileDataUrl, MAX_TODO_FILE_BYTES)
    if (!parsed) return fail(400, "invalid_input", "That file isn't one we can take (max 10 MB).")
    const key = mediaKey("todo", guard.teamId)
    await env.MEDIA.put(key, parsed.bytes, { httpMetadata: { contentType: parsed.contentType } })
    file = {
      url: `/media/${key}`,
      name: optionalText(body.fileName, "File name", TEXT_LIMITS.short) ?? "attachment",
    }
  }

  const { moved, todo, accountId } = await completeTodo(cfg, guard, scope, actor, id, file)
  if (moved) await publishChange(env, guard.teamId, "todos", id, "edit", accountId)
  return json({ todo })
}

/** POST /api/content/todos/cancel — we stopped needing it (todos:delete). Staff
 * only, and nothing is deleted: the row leaves the client's list and the decision
 * stays on it. */
export async function postCancelTodo(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown }>(request, env, "todos", "delete")
  const scope = await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "To-do", TEXT_LIMITS.short)
  const { moved, accountId } = await cancelTodo(cfg, guard, actor, id)
  if (moved) await publishChange(env, guard.teamId, "todos", id, "edit", accountId ?? undefined)
  const filter = { view: "open" as const }
  return json({
    todos: await listTodos(cfg, guard, scope, filter),
    total: await countTodos(cfg, guard, scope, filter),
  })
}

/** GET /api/content/portal/delivery — the client's own picture of the work they
 * bought: their sprints, as named blocks with dates and two counts.
 *
 * GATED ON `help:read`, which is the right every client login already holds to
 * see their own requests — and that is the honest gate rather than a convenient
 * one: a client's window on our delivery is the same window as their requests,
 * opened by the same grant, and inventing a second module for it would be a
 * permission an owner has to reason about for no extra decision.
 *
 * FENCED, and the SHAPE is the second fence: `ClientSprint` has nowhere to put a
 * price, so this door cannot leak one however it is called (R24's reasoning, one
 * table along — a shape that cannot carry a number is stronger than a condition
 * that decides not to). What they were CHARGED, when the owner has switched it
 * on for them, comes from the value door in tenancy and nowhere else. */
export async function getPortalDelivery(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "help", "read")
  const scope = await callerScope(cfg, guard)
  return json({ sprints: await clientSprints(cfg, guard, scope) })
}

/* ----------------------------------- tasks ---------------------------------- */

/** What a piece of our own admin may arrive with. Generous for a photo of a
 * letter, small enough that one door cannot be used as free storage — the same
 * ceiling a to-do's attachment carries, for the same reason. */
const MAX_TASK_FILE_BYTES = 10 * 1024 * 1024

/** The filters this door parses — one place, so the list and its counts can never
 * be asked different questions (R16) and the machine surface has one thing to
 * mirror (R19).
 *
 * `view` is matched against the SIX the app knows through the shared list, which
 * is a positional allow-list check (R20) and not a cast: anything else falls back
 * to the everyday pile rather than reaching SQL. */
function taskFilterFrom(url: URL): TaskFilter {
  const asked = queryText(url.searchParams.get("view"), "View")
  return {
    view: (TASK_VIEWS as readonly string[]).includes(asked ?? "") ? (asked as TaskViewName) : "open",
    assigneeId: queryText(url.searchParams.get("assigneeId"), "Assignee"),
  }
}

/** Every task response carries EVERY view's count (R16) and the progress pair.
 *
 * The screen has a six-tab strip on it, and the badge on a view you are NOT
 * looking at cannot be counted from the rows you ARE — an open list has no idea
 * how many finished ones are behind it. All eight numbers come out of ONE read
 * (see countTasks), so they are exact and consistent with each other.
 *
 * `total` stays the count over what was LISTED, so the sidebar badge goes on
 * meaning "what is still on our list". */
async function taskPage(
  cfg: Parameters<typeof listTasks>[0],
  guard: Parameters<typeof listTasks>[1],
  filter: TaskFilter
): Promise<Response> {
  const [tasks, counts] = await Promise.all([
    listTasks(cfg, guard, filter),
    countTasks(cfg, guard, { assigneeId: filter.assigneeId }),
  ])
  const view = filter.view ?? "open"
  return json({
    tasks,
    total: counts[view],
    openTotal: counts.open,
    allTotal: counts.all,
    overdueTotal: counts.overdue,
    upcomingTotal: counts.upcoming,
    completedTotal: counts.completed,
    calendarTotal: counts.calendar,
    // THE PROGRESS BAR at the top of every tab: how many of the things due today
    // or earlier are done, out of how many there are.
    dueTodayTotal: counts.dueToday,
    dueTodayDone: counts.dueTodayDone,
  })
}

/** GET /api/content/tasks — our own admin (work:read). Refused to a client login:
 * a task is the agency's, and its list is a list of what we are behind on.
 *
 * `?view=` is how the other five piles are seen — overdue, upcoming, completed,
 * calendar, all. Two of the six shipped with the door and the screen sent
 * neither, so the app had one view of a six-view collection and no way to say so
 * — the tester's "cannot switch the view, I only see open ones".
 *
 * WHOSE TASKS COME BACK IS NOW A PERMISSION (4.9). `work:read` opens the screen;
 * `all_tasks:read` decides whether the screen is the whole team's list or your
 * own. Without it the caller's own user id REPLACES whatever `assigneeId` the
 * request asked for — narrowed rather than refused, because "show me Ana's
 * tasks" from somebody who may not see them is a question with a perfectly good
 * answer (yours), and a 403 on a list door teaches a screen to hide a tab
 * instead of showing the right rows.
 *
 * It rides the filter the door ALREADY parses, so the list, all eight counts and
 * the progress bar are narrowed by construction — they are all built from this
 * one object (see `taskPage`), and there is no second place to forget. */
export async function getTasks(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "work", "read")
  await refusePortalCaller(cfg, guard)
  const filter = taskFilterFrom(new URL(request.url))
  const everyones = await hasRight(cfg, guard, "all_tasks", "read")
  return taskPage(cfg, guard, everyones ? filter : { ...filter, assigneeId: guard.userId })
}

/** POST /api/content/tasks — write down a piece of admin (work:create).
 *
 * THE DEPARTMENT DECIDES THE SECOND FIELD, and the door decides whether it is
 * there: `createTask` refuses a Production task with no app and a Sales task
 * with no client, out of the one sentence in shared/departments.ts the form also
 * reads. A rule only the form knows is a rule a machine caller never meets. */
export async function postCreateTask(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    title?: unknown
    detail?: unknown
    dueOn?: unknown
    assigneeId?: unknown
    accountId?: unknown
    appId?: unknown
    department?: unknown
    important?: unknown
    urgent?: unknown
    fileDataUrl?: unknown
    fileName?: unknown
  }>(request, env, "work", "create")
  await refusePortalCaller(cfg, guard)

  const assigneeId = optionalText(body.assigneeId, "Assignee", TEXT_LIMITS.short)
  // WHOSE NAME GOES ON IT. The row keeps a name beside the id so a list does not
  // need the core database to render — and it used to keep the CREATOR's name
  // whoever the task was for, because the insert reached for `actor.name`. The
  // members read is the one place that name honestly exists.
  const assigneeName = assigneeId
    ? ((await teamMemberNames(env, guard.teamId)).find((m) => m.userId === assigneeId)?.name ?? null)
    : null
  if (assigneeId && !assigneeName)
    return fail(400, "invalid_input", "That person isn't on the team any more.")

  // ONE FILE, taken at the boundary through the same seam every upload uses, and
  // put in the AGENCY's own bucket: /media/internal/ is served by the agency
  // gateway alone, so a task's evidence has nowhere to be redeemed at the
  // client's hostname (R21). The KEY is the credential — the door has no session
  // — so every object carries a random ULID segment.
  let file: { url: string; name: string } | null = null
  if (body.fileDataUrl !== undefined && body.fileDataUrl !== null) {
    const parsed = parseUploadDataUrl(body.fileDataUrl, MAX_TASK_FILE_BYTES)
    if (!parsed) return fail(400, "invalid_input", "That file isn't one we can take (max 10 MB).")
    const key = mediaKey(guard.teamId, "tasks")
    await env.INTERNAL_MEDIA.put(key, parsed.bytes, { httpMetadata: { contentType: parsed.contentType } })
    file = {
      url: `/media/internal/${key}`,
      name: optionalText(body.fileName, "File name", TEXT_LIMITS.short) ?? "attachment",
    }
  }

  const { id, accountId } = await createTask(cfg, guard, actor, {
    title: requireText(body.title, "What needs doing", TEXT_LIMITS.short),
    detail: optionalText(body.detail, "Detail", TEXT_LIMITS.long),
    dueOn: optionalMoment(body.dueOn, "Deadline"),
    assigneeId,
    assigneeName: assigneeName ?? undefined,
    accountId: optionalText(body.accountId, "Client", TEXT_LIMITS.short),
    appId: optionalText(body.appId, "App", TEXT_LIMITS.short),
    department: optionalText(body.department, "Department", TEXT_LIMITS.short),
    // THE EISENHOWER PAIR. A `typeof` operand, never a cast: "important" arriving
    // as the string "false" would otherwise be a task marked important by a typo.
    important: typeof body.important === "boolean" ? body.important : false,
    urgent: typeof body.urgent === "boolean" ? body.urgent : false,
    fileUrl: file?.url,
    fileName: file?.name,
  })
  await publishChange(env, guard.teamId, "tasks", id, "add", accountId ?? undefined)
  return taskPage(cfg, guard, { view: "open" })
}

/** POST /api/content/tasks/done — tick it, or put it back (work:edit).
 * R17: ticking a done task moves zero rows and writes no second history line. */
export async function postTaskDone(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown; done?: unknown }>(
    request,
    env,
    "work",
    "edit"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Task", TEXT_LIMITS.short)
  if (typeof body.done !== "boolean") return fail(400, "invalid_input", "done must be true or false.")
  const { moved, accountId } = await setTaskDone(cfg, guard, actor, id, body.done)
  if (moved) await publishChange(env, guard.teamId, "tasks", id, "edit", accountId ?? undefined)
  return taskPage(cfg, guard, { view: "open" })
}
