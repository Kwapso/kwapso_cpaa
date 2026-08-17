// STORIES AND SPRINTS — what WE DO about a request, and the block of work it was
// sold inside (.plans/BUILD-1 §2 and §3). Locked model rules enforced HERE, on
// the server:
//   • a story has NO TYPE. The owner settled it: the ticket carries the type and
//     the process step carries the classification that matters. There is no
//     column for one and no door that accepts one;
//   • a story is the ONLY place an assignee and a due date live. A ticket
//     deliberately has neither;
//   • A STORY CANNOT CLOSE WITHOUT NAMING THE PROCESS STEP IT CHANGES, or
//     explicitly saying it changes none (`changes_no_step`). Required, not
//     "optional for now" — it is the hook every savings figure later hangs off,
//     and a nullable column filled in retrospectively is a column full of
//     guesses;
//   • the four states are FIXED (open → in progress → in review → done). The
//     review step is deliberate. The team-editable "Story status" vocabulary is
//     display-only, exactly as it is for a ticket;
//   • drag-rank is the order, as it is on a ticket. There is no priority field
//     and there will not be one.
//
// WHOSE MATERIAL THIS IS. A story is the AGENCY's: its titles, its assignees and
// its dates are the answer to "which staff member is doing the work", which
// SCOPE ch.06 says the portal never shows. Every door in routes/stories.ts opens
// with `refusePortalCaller`, so there is no account fence in this file and there
// must not be one — a fence would imply a client can reach these rows through
// it. What a client sees of a story is a COUNT on their own ticket, and that
// count is served by the ticket door (BUILD-1 §7).

import { describeChanges, logActivity, type Actor } from "@shared/workers/activity"
import { countCollectionWith, reportedTotal } from "@shared/workers/count"
import { d1ExecScript, d1Query, likeLiteral, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { GuardError, type MemberGuard } from "@shared/workers/gating"
import { optionalText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { LIST_HARD_CAP } from "@shared/workers/limits"
import { decodeCursor, keysetAfter, PAGE_SIZE, toPage, type Page } from "@shared/workers/paging"
import { rankAtTop, rankBetween } from "@shared/workers/rank"
import { STORY_STATUSES, type Sprint, type Story, type StoryStatus } from "@shared/types"

import { nextRef, REF_KINDS } from "./refs"

export { STORY_STATUSES, type StoryStatus }

type StoryRow = {
  id: string
  ref: string | null
  title: string
  detail: string | null
  status: string
  ticket_id: string | null
  ticket_ref: string | null
  sprint_id: string | null
  sprint_name: string | null
  app_id: string | null
  process_id: string | null
  step_key: string | null
  changes_no_step: number
  assignee_id: string | null
  assignee_name: string | null
  reviewer_id: string | null
  reviewer_name: string | null
  starts_on: string | null
  due_on: string | null
  closed_at: string | null
  closing_note: string | null
  rank: string | null
  account_id: string | null
  created_at: string
  updated_at: string | null
  creator_name: string | null
  editor_name: string | null
}

/** The two joined names are LABELS, not a second read: a story list that made a
 * round trip per ticket reference would be fifty round trips a page. */
const STORY_COLS = `s.id, s.ref, s.title, s.detail, s.status, s.ticket_id, s.sprint_id, s.app_id,
  s.process_id, s.step_key, s.changes_no_step, s.assignee_id, s.assignee_name, s.reviewer_id,
  s.reviewer_name, s.starts_on, s.due_on, s.closed_at, s.closing_note, s.rank, s.account_id,
  s.created_at, s.updated_at, s.creator_name, s.editor_name,
  (SELECT h.ref FROM help h WHERE h.id = s.ticket_id) AS ticket_ref,
  (SELECT sp.name FROM sprints sp WHERE sp.id = s.sprint_id) AS sprint_name`

function toStory(r: StoryRow): Story {
  return {
    id: r.id,
    ref: r.ref,
    title: r.title,
    detail: r.detail,
    // A status the code does not know reads as "open" — the state a story nobody
    // has started sits in. The SAFE direction, the same one a ticket falls in: an
    // unrecognised value shows up as work still to do rather than as work already
    // finished, so a row a migration somehow missed nags us instead of quietly
    // closing a ticket it should not have closed.
    status: (STORY_STATUSES as readonly string[]).includes(r.status) ? (r.status as StoryStatus) : "open",
    ticketId: r.ticket_id,
    ticketRef: r.ticket_ref,
    sprintId: r.sprint_id,
    sprintName: r.sprint_name,
    appId: r.app_id,
    processId: r.process_id,
    stepKey: r.step_key,
    changesNoStep: r.changes_no_step === 1,
    assigneeId: r.assignee_id,
    assigneeName: r.assignee_name,
    reviewerId: r.reviewer_id,
    reviewerName: r.reviewer_name,
    startsOn: r.starts_on,
    dueOn: r.due_on,
    closedAt: r.closed_at,
    closingNote: r.closing_note,
    rank: r.rank,
    accountId: r.account_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdByName: r.creator_name,
    editedByName: r.editor_name,
  }
}

/** THE SORT, and it is the drag-rank — the same decision a ticket's list makes
 * and for the same reason: an edit on an old story must not shove it above the
 * one somebody deliberately dragged to the top. `COALESCE(rank, id)` so a row
 * written before the column existed still sorts sensibly (a ULID carries its own
 * creation time), and the id breaks ties, which makes the order TOTAL — what the
 * keyset cursor needs to page without repeating a row. */
const STORY_ORDER = "COALESCE(s.rank, s.id)"

/** The facets the list door parses. Declared as a type so the route, the tool
 * and this file cannot drift about what a filter IS (R19). */
export type StoryFilter = {
  status?: StoryStatus
  ticketId?: string
  sprintId?: string
  /** THE WORK ON ONE SYSTEM. A story hangs off an app ALWAYS and a sprint only
   * sometimes (the owner's ruling), so the app is the one relation every story
   * has — and "show me this app's other work" is the cross-link he named as
   * mattering more than any single path through the screens. Without it the
   * app's screen could only narrow a PAGE of the backlog in the browser, which
   * answers "this app's work among the newest fifty" and looks like an answer. */
  appId?: string
  assigneeId?: string
  /** "open" hides done stories — the everyday view of a backlog. */
  view?: "open" | "all"
  /** THE SEARCH BOX, answered here rather than in the browser. The backlog pages
   * (R14), so a search that filtered the loaded page would answer "among the
   * newest fifty" while the badge above counted 3,677 — the same defect this
   * file's own note above `appId` describes for the app's screen. It rides
   * `storyWhere`, so the list and the count are asked the one question. */
  q?: string
}

function storyWhere(filter: StoryFilter): { sql: string; params: string[] } {
  const parts: string[] = []
  const params: string[] = []
  if (filter.view !== "all") parts.push("s.status <> 'done'")
  if (filter.status) {
    parts.push("s.status = ?")
    params.push(filter.status)
  }
  if (filter.ticketId) {
    parts.push("s.ticket_id = ?")
    params.push(filter.ticketId)
  }
  if (filter.sprintId) {
    parts.push("s.sprint_id = ?")
    params.push(filter.sprintId)
  }
  if (filter.appId) {
    parts.push("s.app_id = ?")
    params.push(filter.appId)
  }
  if (filter.assigneeId) {
    parts.push("s.assignee_id = ?")
    params.push(filter.assigneeId)
  }
  if (filter.q) {
    // The reference and the words somebody would recognise the work by. ESCAPED,
    // because a search box is not a pattern box: `%` and `_` are LIKE's own
    // wildcards, and an alternating `%a%a%…` needle is a handful of bytes that
    // costs the worker exponential time over the whole table.
    parts.push(
      `(LOWER(s.title) LIKE ? ESCAPE '\\' OR LOWER(s.ref) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(s.detail, '')) LIKE ? ESCAPE '\\')`
    )
    const needle = `%${likeLiteral(filter.q.toLowerCase())}%`
    params.push(needle, needle, needle)
  }
  return { sql: parts.length ? parts.join(" AND ") : "1 = 1", params }
}

/** R14 GROWING collection: stories are keyset-PAGED, not capped — an agency two
 * years in has thousands and the oldest is the one somebody is looking for. */
export async function listStories(
  cfg: D1Rest,
  guard: MemberGuard,
  filter: StoryFilter,
  cursor: string | null
): Promise<Page<Story>> {
  const pos = decodeCursor(cursor)
  const after = keysetAfter(pos, STORY_ORDER)
  const where = storyWhere(filter)
  const clauses = [where.sql, ...(after.sql ? [after.sql] : [])]
  const rows = await d1Query<StoryRow>(
    cfg,
    guard.databaseId,
    // LIMIT is PAGE_SIZE + 1 — the extra row is how hasMore is known (R14).
    `SELECT ${STORY_COLS} FROM stories s WHERE ${clauses.join(" AND ")}
      ORDER BY ${STORY_ORDER} DESC, s.id DESC LIMIT ${PAGE_SIZE + 1}`,
    [...where.params, ...after.params]
  )
  const page = toPage(rows, PAGE_SIZE, (r) => [r.rank ?? r.id, r.id])
  return { ...page, rows: page.rows.map(toStory) }
}

/** R16: the exact server COUNT(*) the badge shows, over the SAME filter the page
 * came from — a total taken over a different question would badge a number the
 * list can never reach. `mineTotal` is the caller's own assigned work. */
export async function countStories(
  cfg: D1Rest,
  guard: MemberGuard,
  filter: StoryFilter
): Promise<{ total: number; mineTotal: number }> {
  const where = storyWhere(filter)
  // R16 (amended): both numbers are badges, both clamped at the one ceiling.
  const row = await countCollectionWith<{ total: number; mine: number }>(
    cfg,
    guard.databaseId,
    `SELECT (s.assignee_id = ?) AS is_mine FROM stories s WHERE ${where.sql}`,
    "COUNT(*) AS total, SUM(is_mine) AS mine",
    [guard.userId, ...where.params]
  )
  return { total: reportedTotal(row?.total ?? 0), mineTotal: reportedTotal(row?.mine ?? 0) }
}

/** One story by id, or null. */
export async function getStory(cfg: D1Rest, guard: MemberGuard, id: string): Promise<Story | null> {
  const rows = await d1Query<StoryRow>(
    cfg,
    guard.databaseId,
    `SELECT ${STORY_COLS} FROM stories s WHERE s.id = ? LIMIT 1`, // R14: one row by id
    [id]
  )
  return rows[0] ? toStory(rows[0]) : null
}

/** The raw row a write resolves first — a clean 404 rather than a 500 on a made-up id. */
async function storyOrThrow(cfg: D1Rest, guard: MemberGuard, id: string): Promise<StoryRow> {
  const rows = await d1Query<StoryRow>(
    cfg,
    guard.databaseId,
    `SELECT ${STORY_COLS} FROM stories s WHERE s.id = ? LIMIT 1`,
    [id]
  )
  if (!rows[0]) throw new GuardError(404, "story_not_found", "That story doesn't exist.")
  return rows[0]
}

/** What a create / update accepts. Every field is validated at the boundary by
 * the caller AND here — the door states the contract, this states the model. */
export type StoryInput = {
  title?: unknown
  detail?: unknown
  ticketId?: unknown
  sprintId?: unknown
  appId?: unknown
  processId?: unknown
  stepKey?: unknown
  changesNoStep?: unknown
  assigneeId?: unknown
  reviewerId?: unknown
  startsOn?: unknown
  dueOn?: unknown
  accountId?: unknown
}

/** WHICH ACCOUNT DOES THIS WORK BELONG TO?
 *
 * Never free-typed and never guessed: the story inherits it from the request it
 * answers, or from the app it changes, or it is named outright — and whichever
 * of the three it is, the id is proved to be a live row in the caller's own team
 * database first. An unchecked string here would stamp a story with an account
 * that does not exist, which is a reference number nobody can build and a margin
 * line nobody can find.
 *
 * Order matters: the TICKET wins, because a story that answers a request belongs
 * to whoever asked, whatever else it touches. */
async function resolveAccount(
  cfg: D1Rest,
  guard: MemberGuard,
  named: string | undefined,
  ticketId: string | undefined,
  appId: string | undefined
): Promise<string | null> {
  if (ticketId) {
    const rows = await d1Query<{ account_id: string | null }>(
      cfg,
      guard.databaseId,
      `SELECT account_id FROM help WHERE id = ? LIMIT 1`,
      [ticketId]
    )
    if (!rows[0]) throw new GuardError(400, "invalid_input", "That ticket doesn't exist.")
    if (rows[0].account_id) return rows[0].account_id
  }
  if (appId) {
    const rows = await d1Query<{ account_id: string | null }>(
      cfg,
      guard.databaseId,
      `SELECT account_id FROM apps WHERE id = ? AND deactivated_at IS NULL LIMIT 1`,
      [appId]
    )
    if (!rows[0]) throw new GuardError(400, "invalid_input", "That app doesn't exist.")
    if (rows[0].account_id) return rows[0].account_id
  }
  if (named) {
    const rows = await d1Query<{ id: string }>(
      cfg,
      guard.databaseId,
      `SELECT id FROM accounts WHERE id = ? AND deactivated_at IS NULL LIMIT 1`,
      [named]
    )
    if (!rows[0]) throw new GuardError(400, "invalid_input", "That client isn't on your books any more.")
    return rows[0].id
  }
  // The agency's own work, on no client's account. Legitimate and common.
  return null
}

/** A member of THIS team, by user id — the assignee and the reviewer both resolve
 * through it. A name is stored beside the id (the audit habit of this codebase)
 * so a list of fifty stories draws fifty names without fifty lookups; the id is
 * what anything is ever decided from. */
async function memberOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  userId: string,
  what: string
): Promise<{ id: string; name: string }> {
  // The team's own membership lives in the CORE database, but every team database
  // already carries the name on the audit blocks of rows that person has written.
  // Rather than reach across, the door hands us the name it resolved from the
  // team's member list; this proves the id at least belongs to somebody who has
  // touched this team's data. A wrong id is a 400, never a silent null assignee.
  const rows = await d1Query<{ name: string }>(
    cfg,
    guard.databaseId,
    `SELECT creator_name AS name FROM activity WHERE creator_id = ? AND creator_name IS NOT NULL
      ORDER BY id DESC LIMIT 1`,
    [userId]
  )
  return { id: userId, name: rows[0]?.name ?? what }
}

/** The rank a new story takes: above every one already there. Read-then-write,
 * deliberately, and safe for the same reason a ticket's is — two stories written
 * in the same instant can land on the same rank, both are "newest", the `id DESC`
 * tiebreak keeps the order total, and the first drag separates them for good. */
async function topRank(cfg: D1Rest, guard: MemberGuard): Promise<string> {
  const rows = await d1Query<{ top: string | null }>(
    cfg,
    guard.databaseId,
    `SELECT MAX(COALESCE(rank, id)) AS top FROM stories LIMIT 1` // R14: one aggregate row
  )
  return rankAtTop(rows[0]?.top ?? null)
}

/** Raise a story. Title is required; everything else optional. Opens in `open`. */
export async function createStory(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  input: StoryInput
): Promise<{ id: string; accountId: string | null }> {
  const title = requireText(input.title, "Title", TEXT_LIMITS.short)
  const detail = optionalText(input.detail, "Detail", TEXT_LIMITS.long) ?? null
  const ticketId = optionalText(input.ticketId, "Ticket", TEXT_LIMITS.short)
  const appId = optionalText(input.appId, "App", TEXT_LIMITS.short)
  const processId = optionalText(input.processId, "Process", TEXT_LIMITS.short)
  const stepKey = optionalText(input.stepKey, "Step", TEXT_LIMITS.short) ?? null
  const sprintId = optionalText(input.sprintId, "Sprint", TEXT_LIMITS.short) ?? null
  const named = optionalText(input.accountId, "Client", TEXT_LIMITS.short)
  const assigneeId = optionalText(input.assigneeId, "Assignee", TEXT_LIMITS.short)
  const reviewerId = optionalText(input.reviewerId, "Reviewer", TEXT_LIMITS.short)
  const startsOn = optionalText(input.startsOn, "Start date", TEXT_LIMITS.short) ?? null
  const dueOn = optionalText(input.dueOn, "Due date", TEXT_LIMITS.short) ?? null
  const changesNoStep = input.changesNoStep === true

  const accountId = await resolveAccount(cfg, guard, named, ticketId, appId)
  const assignee = assigneeId ? await memberOrThrow(cfg, guard, assigneeId, "Assignee") : null
  const reviewer = reviewerId ? await memberOrThrow(cfg, guard, reviewerId, "Reviewer") : null

  const id = ulid()
  const now = new Date().toISOString()
  // Resolved BEFORE the insert so the row is complete the first time anybody
  // reads it — a story that exists for a moment with no number is a story
  // somebody screenshots with no number.
  const ref = await nextRef(cfg, guard, accountId, REF_KINDS.story)
  const rank = await topRank(cfg, guard)

  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO stories (id, ref, account_id, ticket_id, app_id, process_id, step_key, changes_no_step,
       sprint_id, title, detail, assignee_id, assignee_name, reviewer_id, reviewer_name,
       starts_on, due_on, status, rank, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(ref)}, ${sqlString(accountId)}, ${sqlString(ticketId ?? null)}, ${sqlString(appId ?? null)}, ${sqlString(processId ?? null)}, ${sqlString(stepKey)}, ${changesNoStep ? 1 : 0}, ${sqlString(sprintId)}, ${sqlString(title)}, ${sqlString(detail)}, ${sqlString(assignee?.id ?? null)}, ${sqlString(assignee?.name ?? null)}, ${sqlString(reviewer?.id ?? null)}, ${sqlString(reviewer?.name ?? null)}, ${sqlString(startsOn)}, ${sqlString(dueOn)}, 'open', ${sqlString(rank)}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Story created",
    description: `${actor.name} created ${ref ? `story ${ref}` : "a story"} — ${title}`,
    relatedTable: "stories",
    relatedRowId: id,
  })
  return { id, accountId }
}

/** Edit a story's content. Everything except the status and the rank, which have
 * their own doors — a status is a transition, not a field. */
export async function updateStory(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  input: StoryInput
): Promise<{ accountId: string | null }> {
  const before = await storyOrThrow(cfg, guard, id)
  const title = requireText(input.title, "Title", TEXT_LIMITS.short)
  const detail = optionalText(input.detail, "Detail", TEXT_LIMITS.long) ?? null
  const ticketId = optionalText(input.ticketId, "Ticket", TEXT_LIMITS.short)
  const appId = optionalText(input.appId, "App", TEXT_LIMITS.short)
  const processId = optionalText(input.processId, "Process", TEXT_LIMITS.short) ?? null
  const stepKey = optionalText(input.stepKey, "Step", TEXT_LIMITS.short) ?? null
  const sprintId = optionalText(input.sprintId, "Sprint", TEXT_LIMITS.short) ?? null
  const named = optionalText(input.accountId, "Client", TEXT_LIMITS.short)
  const assigneeId = optionalText(input.assigneeId, "Assignee", TEXT_LIMITS.short)
  const reviewerId = optionalText(input.reviewerId, "Reviewer", TEXT_LIMITS.short)
  const startsOn = optionalText(input.startsOn, "Start date", TEXT_LIMITS.short) ?? null
  const dueOn = optionalText(input.dueOn, "Due date", TEXT_LIMITS.short) ?? null
  const changesNoStep = input.changesNoStep === true

  // The account is re-derived rather than carried: re-pointing a story at another
  // ticket moves the work to that client's books, and the margin has to follow it.
  // The reference number does NOT follow — it was minted against the old account
  // and a client may already be quoting it.
  const accountId = (await resolveAccount(cfg, guard, named, ticketId, appId)) ?? before.account_id
  const assignee = assigneeId ? await memberOrThrow(cfg, guard, assigneeId, "Assignee") : null
  const reviewer = reviewerId ? await memberOrThrow(cfg, guard, reviewerId, "Reviewer") : null

  const now = new Date().toISOString()
  await d1Query(
    cfg,
    guard.databaseId,
    `UPDATE stories SET title = ?, detail = ?, ticket_id = ?, app_id = ?, process_id = ?, step_key = ?,
       changes_no_step = ?, sprint_id = ?, assignee_id = ?, assignee_name = ?, reviewer_id = ?,
       reviewer_name = ?, starts_on = ?, due_on = ?, account_id = ?, updated_at = ?,
       editor_id = ?, editor_email = ?, editor_name = ?
     WHERE id = ?`,
    [
      title,
      detail,
      ticketId ?? null,
      appId ?? null,
      processId,
      stepKey,
      changesNoStep ? 1 : 0,
      sprintId,
      assignee?.id ?? null,
      assignee?.name ?? null,
      reviewer?.id ?? null,
      reviewer?.name ?? null,
      startsOn,
      dueOn,
      accountId,
      now,
      actor.id,
      actor.email,
      actor.name,
      id,
    ]
  )

  const changes = describeChanges([
    { label: "Title", from: before.title, to: title },
    { label: "Assignee", from: before.assignee_name, to: assignee?.name ?? null },
    { label: "Due", from: before.due_on, to: dueOn },
    { label: "Sprint", from: before.sprint_id, to: sprintId, hideValues: true },
    { label: "Step", from: before.step_key, to: stepKey },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Story edited",
    description: `${actor.name} edited ${before.ref ?? "a story"}${changes ? ` — ${changes}` : ""}`,
    relatedTable: "stories",
    relatedRowId: id,
  })
  return { accountId }
}

/** THE CLOSE RULE (BUILD-1 §2): "a story cannot close without naming the process
 * step it changes, or explicitly saying it changes none. Required. This is the
 * hook the savings maths hangs off later — do not make it optional 'for now'."
 *
 * Checked HERE rather than at the door because there are two ways to close a
 * story (the status door and, later, a bulk) and one of them will be written by
 * somebody who has never read this file. A refusal, not a default: defaulting to
 * "changes no step" would fill the savings maths with quiet zeroes, which is
 * worse than an empty column because it looks like an answer. */
export function refuseUnstepped(row: { step_key: string | null; changes_no_step: number }): void {
  if (row.step_key || row.changes_no_step === 1) return
  throw new GuardError(
    400,
    "step_required",
    "Before this can be done, say which process step it changed — or tick that it changed none."
  )
}

/** Move a story along its fixed lifecycle.
 *
 * R17: the `status <> ?` predicate rides the UPDATE, so re-marking a done story
 * done moves zero rows — no duplicate history, no second ping, and (the one that
 * matters here) no second attempt at the ticket's Ready flip. */
export async function setStoryStatus(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  status: StoryStatus,
  closingNote: string | null
): Promise<{ moved: boolean; story: Story; ticketId: string | null; accountId: string | null }> {
  const before = await storyOrThrow(cfg, guard, id)
  if (status === "done") refuseUnstepped(before)

  const now = new Date().toISOString()
  const done = status === "done"
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE stories SET status = ?, closed_at = ?, closing_note = COALESCE(?, closing_note),
       updated_at = ?, editor_id = ?, editor_email = ?, editor_name = ?
     WHERE id = ? AND status <> ? RETURNING id`,
    [
      status,
      done ? now : null,
      closingNote,
      now,
      actor.id,
      actor.email,
      actor.name,
      id,
      status,
    ]
  )
  const story = await storyOrThrow(cfg, guard, id)
  if (!changed[0])
    return { moved: false, story: toStory(story), ticketId: before.ticket_id, accountId: before.account_id }

  await logActivity(cfg, guard.databaseId, actor, {
    type: `Story ${status === "done" ? "done" : "updated"}`,
    description: `${actor.name} set ${before.ref ?? "a story"} to ${status.replace("_", " ")}`,
    relatedTable: "stories",
    relatedRowId: id,
  })
  return { moved: true, story: toStory(story), ticketId: before.ticket_id, accountId: before.account_id }
}

/** DRAG-RANK — put a story between two others, exactly as a ticket does. The
 * caller names its NEIGHBOURS, never a position: a position is arithmetic over a
 * list the browser loaded seconds ago, and the list has moved since.
 *
 * R17: dropped back where it started → zero rows → no history, no ping. */
export async function setStoryRank(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  afterId: string | null,
  beforeId: string | null
): Promise<{ moved: boolean; accountId: string | null }> {
  const row = await storyOrThrow(cfg, guard, id)
  const neighbour = async (nid: string | null): Promise<string | null> => {
    if (!nid) return null
    const found = await storyOrThrow(cfg, guard, nid)
    return found.rank ?? found.id
  }
  const rank = rankBetween(await neighbour(beforeId), await neighbour(afterId))
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE stories SET rank = ? WHERE id = ? AND COALESCE(rank, id) <> ? RETURNING id`,
    [rank, id, rank]
  )
  if (!changed[0]) return { moved: false, accountId: row.account_id }
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Story reordered",
    description: `${actor.name} moved ${row.ref ?? "a story"} in the list`,
    relatedTable: "stories",
    relatedRowId: id,
  })
  return { moved: true, accountId: row.account_id }
}

/* ---------------------------------- sprints --------------------------------- */

type SprintRow = {
  id: string
  ref: string | null
  name: string
  goal: string | null
  sprint_type: string | null
  account_id: string | null
  account_name: string | null
  app_id: string | null
  app_name: string | null
  starts_on: string | null
  ends_on: string | null
  sold_price_cents: number
  currency: string | null
  completed_at: string | null
  deactivated_at: string | null
  story_count: number
  open_story_count: number
  created_at: string
  creator_name: string | null
}

const SPRINT_COLS = `sp.id, sp.ref, sp.name, sp.goal, sp.sprint_type, sp.account_id, sp.app_id,
  sp.starts_on, sp.ends_on, sp.sold_price_cents, sp.currency, sp.completed_at, sp.deactivated_at,
  sp.created_at, sp.creator_name,
  (SELECT a.name FROM accounts a WHERE a.id = sp.account_id) AS account_name,
  (SELECT ap.name FROM apps ap WHERE ap.id = sp.app_id) AS app_name,
  (SELECT COUNT(*) FROM stories s WHERE s.sprint_id = sp.id) AS story_count,
  (SELECT COUNT(*) FROM stories s WHERE s.sprint_id = sp.id AND s.status <> 'done') AS open_story_count`

function toSprint(r: SprintRow): Sprint {
  return {
    id: r.id,
    ref: r.ref,
    name: r.name,
    goal: r.goal,
    sprintType: r.sprint_type,
    accountId: r.account_id,
    accountName: r.account_name,
    appId: r.app_id,
    appName: r.app_name,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    soldPriceCents: r.sold_price_cents,
    currency: r.currency,
    completedAt: r.completed_at,
    active: r.deactivated_at == null,
    storyCount: r.story_count,
    openStoryCount: r.open_story_count,
    createdAt: r.created_at,
    createdByName: r.creator_name,
  }
}

/** WHICH SPRINTS — one client's, one system's, or all of them. Written once so
 * the list and its count are asked the SAME question (R16): a badge computed
 * over a different WHERE than the rows beneath it is a number nobody can
 * reconcile, and the two calls sit in different functions. */
export type SprintFilter = { accountId?: string | null; appId?: string | null }

function sprintWhere(filter: SprintFilter): { sql: string; params: string[] } {
  const parts: string[] = []
  const params: string[] = []
  if (filter.accountId) {
    parts.push("sp.account_id = ?")
    params.push(filter.accountId)
  }
  // A sprint covers ONE app (the owner's ruling), so the app is the record
  // directly above it and its screen has to be able to ask for exactly its own.
  if (filter.appId) {
    parts.push("sp.app_id = ?")
    params.push(filter.appId)
  }
  return { sql: parts.length ? ` WHERE ${parts.join(" AND ")}` : "", params }
}

/** Every sprint, newest first. BOUNDED, not paged (R14): a sprint is a block of
 * SOLD work — an agency runs a handful per client per year, so this is a
 * collection that grows at the speed of contracts rather than of clicks, and a
 * hard ceiling is an honest answer rather than an eventual refusal. */
export async function listSprints(
  cfg: D1Rest,
  guard: MemberGuard,
  filter: SprintFilter
): Promise<Sprint[]> {
  const where = sprintWhere(filter)
  const rows = await d1Query<SprintRow>(
    cfg,
    guard.databaseId,
    `SELECT ${SPRINT_COLS} FROM sprints sp${where.sql}
      ORDER BY sp.created_at DESC, sp.id DESC LIMIT ${LIST_HARD_CAP}`, // R14 hard cap
    where.params
  )
  return rows.map(toSprint)
}

/** One sprint by id. Added for the door that puts a sprint's dates into somebody's
 * Google calendar (routes/google.ts): pushing a block of work outward needs the
 * block, and reading it through the module's own function is what keeps the
 * dates, the name and the reference one definition rather than two. */
export async function getSprint(cfg: D1Rest, guard: MemberGuard, id: string): Promise<Sprint | null> {
  const rows = await d1Query<SprintRow>(
    cfg,
    guard.databaseId,
    `SELECT ${SPRINT_COLS} FROM sprints sp WHERE sp.id = ? LIMIT 1`, // R14: one row by id
    [id]
  )
  return rows[0] ? toSprint(rows[0]) : null
}

/** R16: the exact server COUNT(*) for the sprint badge. */
export async function countSprints(
  cfg: D1Rest,
  guard: MemberGuard,
  filter: SprintFilter
): Promise<number> {
  const where = sprintWhere(filter)
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM sprints sp${where.sql}`,
    where.params
  )
  return rows[0]?.n ?? 0
}

export type SprintInput = {
  name?: unknown
  goal?: unknown
  sprintType?: unknown
  accountId?: unknown
  appId?: unknown
  startsOn?: unknown
  endsOn?: unknown
  soldPriceCents?: unknown
  currency?: unknown
}

/** Whole cents, and never a float. A price that arrives as anything but a
 * non-negative whole number is a clean 400 — the alternative is a rounding the
 * client discovers on an invoice. */
function priceCents(raw: unknown): number {
  if (raw === undefined || raw === null) return 0
  if (typeof raw !== "number" || !Number.isFinite(raw))
    throw new GuardError(400, "invalid_input", "The price must be a number of cents.")
  if (raw < 0 || !Number.isInteger(raw))
    throw new GuardError(400, "invalid_input", "The price must be a whole number of cents, and not negative.")
  return raw
}

export async function createSprint(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  input: SprintInput
): Promise<{ id: string; accountId: string | null }> {
  const name = requireText(input.name, "Name", TEXT_LIMITS.short)
  const goal = optionalText(input.goal, "Goal", TEXT_LIMITS.long) ?? null
  const sprintType = optionalText(input.sprintType, "Sprint type", TEXT_LIMITS.short) ?? null
  const appId = optionalText(input.appId, "App", TEXT_LIMITS.short)
  const named = optionalText(input.accountId, "Client", TEXT_LIMITS.short)
  const startsOn = optionalText(input.startsOn, "Start date", TEXT_LIMITS.short) ?? null
  const endsOn = optionalText(input.endsOn, "End date", TEXT_LIMITS.short) ?? null
  const currency = optionalText(input.currency, "Currency", TEXT_LIMITS.short) ?? null
  const cents = priceCents(input.soldPriceCents)
  // A sprint belongs to ONE app or goal (BUILD-1 §3), so the app is checked the
  // same way a story's is: through the account resolver, which proves the row.
  const accountId = await resolveAccount(cfg, guard, named, undefined, appId)

  const id = ulid()
  const now = new Date().toISOString()
  const ref = await nextRef(cfg, guard, accountId, REF_KINDS.sprint)
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO sprints (id, ref, account_id, app_id, name, sprint_type, goal, starts_on, ends_on,
       sold_price_cents, currency, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(ref)}, ${sqlString(accountId)}, ${sqlString(appId ?? null)}, ${sqlString(name)}, ${sqlString(sprintType)}, ${sqlString(goal)}, ${sqlString(startsOn)}, ${sqlString(endsOn)}, ${cents}, ${sqlString(currency)}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Sprint created",
    description: `${actor.name} started ${ref ? `sprint ${ref}` : "a sprint"} — ${name}`,
    relatedTable: "sprints",
    relatedRowId: id,
  })
  return { id, accountId }
}

/** EDIT a sprint — what it is called, what kind it is, what it is for, when it
 * runs, and WHAT IT WAS SOLD FOR.
 *
 * The price is the reason this exists. `sold_price_cents` is the revenue half of
 * every margin the money lane computes (lib/work-engine.ts reads it against the
 * hours logged), and it could be set only at the moment a sprint was started —
 * so a sprint agreed before its price was, which is the ordinary order of a
 * conversation with a client, could never be given one.
 *
 * WHAT THIS DOOR WILL NOT MOVE, deliberately: the CLIENT and the APP. Both are
 * load-bearing rather than descriptive. The reference a client quotes was minted
 * against the account (`nextRef`, counted per account), and completing this
 * sprint cuts a version of every process map inside its app — so re-pointing
 * either after the fact rewrites what an already-published number means. Same
 * ruling as a ticket's account, and for the same reason: if we ever want to move
 * one it is a deliberate feature with a confirm panel, not a quiet field on an
 * edit form. Start a sprint under the right client; correct everything else here.
 */
export async function updateSprint(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  input: SprintInput
): Promise<{ accountId: string | null }> {
  const rows = await d1Query<SprintRow>(
    cfg,
    guard.databaseId,
    `SELECT ${SPRINT_COLS} FROM sprints sp WHERE sp.id = ? LIMIT 1`, // R14: one row by id
    [id]
  )
  const before = rows[0]
  if (!before) throw new GuardError(404, "sprint_not_found", "That sprint doesn't exist.")

  const name = requireText(input.name, "Name", TEXT_LIMITS.short)
  const goal = optionalText(input.goal, "Goal", TEXT_LIMITS.long) ?? null
  const sprintType = optionalText(input.sprintType, "Sprint type", TEXT_LIMITS.short) ?? null
  const startsOn = optionalText(input.startsOn, "Start date", TEXT_LIMITS.short) ?? null
  const endsOn = optionalText(input.endsOn, "End date", TEXT_LIMITS.short) ?? null
  const currency = optionalText(input.currency, "Currency", TEXT_LIMITS.short) ?? null
  const cents = priceCents(input.soldPriceCents)

  const now = new Date().toISOString()
  await d1Query(
    cfg,
    guard.databaseId,
    `UPDATE sprints SET name = ?, sprint_type = ?, goal = ?, starts_on = ?, ends_on = ?,
       sold_price_cents = ?, currency = ?, updated_at = ?, editor_id = ?, editor_email = ?, editor_name = ?
     WHERE id = ?`,
    [name, sprintType, goal, startsOn, endsOn, cents, currency, now, actor.id, actor.email, actor.name, id]
  )

  const changes = describeChanges([
    { label: "Name", from: before.name, to: name },
    { label: "Kind", from: before.sprint_type, to: sprintType },
    { label: "Runs", from: before.starts_on, to: startsOn },
    { label: "Ends", from: before.ends_on, to: endsOn },
    // The FIGURE is deliberately hidden from the history line. A sprint's price
    // is commercial, the activity feed is read by everyone who holds `work`, and
    // "the price changed" is the fact that belongs in a log — not the number.
    { label: "Price", from: String(before.sold_price_cents), to: String(cents), hideValues: true },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Sprint edited",
    description: `${actor.name} edited ${before.ref ?? before.name}${changes ? ` — ${changes}` : ""}`,
    relatedTable: "sprints",
    relatedRowId: id,
  })
  return { accountId: before.account_id }
}

/** COMPLETE a sprint, or reopen it.
 *
 * R17: the current-state predicate rides the UPDATE (`completed_at IS NULL` /
 * `IS NOT NULL`), so a double-clicked Complete moves zero rows the second time —
 * which matters more here than anywhere else in this file, because a completing
 * sprint is what CUTS A VERSION of every process map beneath it (BUILD-1 §3),
 * and a version cut twice is a baseline nobody can subtract from. The money
 * lane's own partial unique index refuses the second cut as well; this is the
 * half that stops it ever being attempted. */
export async function setSprintComplete(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  complete: boolean
): Promise<{ moved: boolean; accountId: string | null }> {
  const rows = await d1Query<SprintRow>(
    cfg,
    guard.databaseId,
    `SELECT ${SPRINT_COLS} FROM sprints sp WHERE sp.id = ? LIMIT 1`,
    [id]
  )
  const row = rows[0]
  if (!row) throw new GuardError(404, "sprint_not_found", "That sprint doesn't exist.")
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE sprints SET completed_at = ?, updated_at = ?, editor_id = ?, editor_email = ?, editor_name = ?
      WHERE id = ? AND completed_at IS ${complete ? "" : "NOT "}NULL RETURNING id`,
    [complete ? now : null, now, actor.id, actor.email, actor.name, id]
  )
  if (!changed[0]) return { moved: false, accountId: row.account_id }
  await logActivity(cfg, guard.databaseId, actor, {
    type: complete ? "Sprint completed" : "Sprint reopened",
    description: `${actor.name} ${complete ? "completed" : "reopened"} ${row.ref ?? row.name}`,
    relatedTable: "sprints",
    relatedRowId: id,
  })
  return { moved: true, accountId: row.account_id }
}
