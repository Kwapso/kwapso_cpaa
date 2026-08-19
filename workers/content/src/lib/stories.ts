// STORIES AND SPRINTS — what WE DO about a request, and the block of work it was
// sold inside (.plans/BUILD-1 §2 and §3). Locked model rules enforced HERE, on
// the server:
//   • a story HAS a type — Fix, Feature or Change, required on the way in and
//     editable on the Dropdown values screen (CHECKLIST 6.2). This file said the
//     opposite until 17 Aug 2026 ("the ticket carries the type"), and the owner
//     reversed it: the ticket's type says what a CLIENT asked for, and this says
//     what WE are doing about it, which is a different sentence. Nullable in the
//     column and only in the column, because 3,677 stories arrived from the
//     previous system without one;
//   • a story is the ONLY place an assignee lives. A ticket deliberately has
//     none, and the DATE is the sprint's (CHECKLIST 3.15);
//   • A STORY NAMES THE PROCESSES IT CHANGES, or explicitly says it changes none
//     (`changes_no_step`) — checked when it is WRITTEN (CHECKLIST 6.5, Aurora's
//     ts4: the "no process" answer has to be chosen, not left blank). And it
//     cannot CLOSE without naming the step inside one of those maps, or the same
//     tick. Two rules, two moments, one hook: every savings figure hangs off it,
//     and a nullable column filled in retrospectively is a column full of
//     guesses;
//   • the four states are FIXED (open → in progress → in review → done) and two
//     of them are FACTS rather than choices: a timer start moves a story to `in
//     progress` (routes/work-logs.ts), and `in review` is refused while any timer
//     on it is still running or until an explanation is written. The review step
//     is deliberate. The team-editable "Story status" vocabulary is display-only,
//     exactly as it is for a ticket;
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

import { countStoryAttachments } from "./story-attachments"
import { describeChanges, logActivity, type Actor } from "@shared/workers/activity"
import { countCollectionWith, reportedTotal } from "@shared/workers/count"
import { d1ExecScript, d1Query, likeLiteral, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { GuardError, type MemberGuard } from "@shared/workers/gating"
import { optionalText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { LIST_HARD_CAP, STORY_PROCESS_CAP } from "@shared/workers/limits"
import { decodeCursor, keysetAfter, PAGE_SIZE, toPage, type Page } from "@shared/workers/paging"
import { orderBy, resolveOrdering, type Ordering, type SortMenu } from "@shared/workers/sorting"
import { rankAtTop } from "@shared/workers/rank"
import { STORY_STATUSES, type Sprint, type Story, type StoryStatus } from "@shared/types"

import type { Env } from "../env"
import { teamMemberNames } from "./notify"
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
  sprint_ends_on?: string | null
  closed_at: string | null
  closing_note: string | null
  story_type: string | null
  review_note: string | null
  review_file_url: string | null
  review_file_name: string | null
  process_ids: string | null
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
  s.story_type, s.review_note, s.review_file_url, s.review_file_name,
  s.created_at, s.updated_at, s.creator_name, s.editor_name,
  -- EVERY MAP THIS WORK TOUCHES, as one string rather than a second round trip.
  -- A story list that made a query per story to learn its processes would be
  -- fifty queries a page, which is the objection the two joined names above
  -- already answer. Split on the comma in \`toStory\`; the ids are ULIDs, so a
  -- comma can never appear inside one.
  (SELECT GROUP_CONCAT(sp2.process_id) FROM story_processes sp2 WHERE sp2.story_id = s.id) AS process_ids,
  (SELECT h.ref FROM help h WHERE h.id = s.ticket_id) AS ticket_ref,
  (SELECT sp.name FROM sprints sp WHERE sp.id = s.sprint_id) AS sprint_name,
  -- WHEN THIS IS DUE, AND WHY IT IS NOT A COLUMN ON THIS TABLE ANY MORE.
  -- A story is one piece of work inside a block that was sold with an end date
  -- on it, so the block's end date IS the story's deadline: two dates for one
  -- promise is two dates that disagree the first time a sprint moves. The owner
  -- retired the story's own due date on 17 Aug 2026 and it is inherited from the
  -- sprint instead. \`s.due_on\` is still selected above and still answered as
  -- \`dueOn\` — the column keeps what anybody typed before the change (a column
  -- dropped is the one migration you cannot take back) — and every screen reads
  -- the inherited date beside it.
  (SELECT sp.ends_on FROM sprints sp WHERE sp.id = s.sprint_id) AS sprint_ends_on`

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
    sprintEndsOn: r.sprint_ends_on ?? null,
    closedAt: r.closed_at,
    closingNote: r.closing_note,
    storyType: r.story_type,
    reviewNote: r.review_note,
    reviewFileUrl: r.review_file_url,
    reviewFileName: r.review_file_name,
    // The FIRST of these is still `processId` above — the savings maths and the
    // import both address a story's map by one id, and this is the full set.
    processIds: r.process_ids ? r.process_ids.split(",").filter(Boolean) : [],
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

/** WHAT THE BACKLOG MAY BE ORDERED BY (shared/workers/sorting.ts), with the
 * drag-rank as the fallback for the reason above: a screen that asks for no
 * ordering gets the order somebody arranged by hand.
 *
 * `deadline` is the one worth naming. A due date is the question a backlog is
 * most often asked ("what is late?"), and it is exactly the column the browser
 * could never sort correctly — the row prints "14 Apr 2025" and the library
 * compares that as text. Here it is the stored date, compared as a date, over
 * the whole backlog rather than the loaded page. */
export const STORY_SORTS: SortMenu<StoryRow> = {
  rank: { expr: STORY_ORDER, dir: "desc", key: (r) => r.rank ?? r.id },
  created: { expr: "s.created_at", dir: "desc", key: (r) => r.created_at },
  deadline: { expr: "s.due_on", dir: "asc", key: (r) => r.due_on },
  title: { expr: "s.title", dir: "asc", key: (r) => r.title },
  status: { expr: "s.status", dir: "asc", key: (r) => r.status },
  assignee: { expr: "s.assignee_name", dir: "asc", key: (r) => r.assignee_name },
}

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
  cursor: string | null,
  ordering: Ordering<StoryRow> = resolveOrdering(STORY_SORTS, "rank", undefined, undefined)
): Promise<Page<Story>> {
  // One ordering feeds the ORDER BY, the keyset predicate and the next cursor.
  const pos = decodeCursor(cursor, ordering.sig)
  const after = keysetAfter(pos, ordering.expr, ordering.dir, "s.id")
  const where = storyWhere(filter)
  const clauses = [where.sql, ...(after.sql ? [after.sql] : [])]
  const rows = await d1Query<StoryRow>(
    cfg,
    guard.databaseId,
    // LIMIT is PAGE_SIZE + 1 — the extra row is how hasMore is known (R14).
    `SELECT ${STORY_COLS} FROM stories s WHERE ${clauses.join(" AND ")}
      ${orderBy(ordering, "s.id")} LIMIT ${PAGE_SIZE + 1}`,
    [...where.params, ...after.params]
  )
  const page = toPage(rows, PAGE_SIZE, (r) => [ordering.key(r), r.id], ordering.sig)
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
  /** EVERY map this work touches (CHECKLIST 6.5). One piece of work commonly
   * changes two, so the relation is many — and an EMPTY list is only allowed when
   * `changesNoStep` is ticked, which is Aurora's ruling that "no process" must be
   * CHOSEN rather than left blank. */
  processIds?: unknown
  stepKey?: unknown
  changesNoStep?: unknown
  assigneeId?: unknown
  reviewerId?: unknown
  startsOn?: unknown
  dueOn?: unknown
  accountId?: unknown
  /** Fix / Feature / Change — REQUIRED (CHECKLIST 6.2), and drawn from the team's
   * own `Story type` dropdown values so it stays theirs to rename. */
  storyType?: unknown
}

/** WHICH MAPS — proved to be live processes in the caller's own team database,
 * and refused when there are none and nobody said there were none.
 *
 * "An explicit 'no process' choice that must be CHOSEN rather than left blank"
 * (Aurora's ts4, over the owner's "truly required"). The tick is `changesNoStep`,
 * which this table already had for the STEP half of the same sentence — so the
 * two are one decision rather than two switches that can disagree.
 *
 * Bounded by construction: the list is capped before it is read, so a body
 * carrying ten thousand ids is a clean 400 rather than a statement with ten
 * thousand placeholders. */
async function resolveProcesses(
  cfg: D1Rest,
  guard: MemberGuard,
  raw: unknown,
  changesNoStep: boolean
): Promise<string[]> {
  // R20 positional: `Array.isArray` is the check, and every element goes through
  // `requireText` below. Untrusted, so a non-array reads as "none said" rather
  // than as an error — the refusal that follows is the one a person understands.
  const ids = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []
  if (!ids.length) {
    if (changesNoStep) return []
    throw new GuardError(
      400,
      "process_required",
      "Say which process this work changes, or tick that it changes none."
    )
  }
  if (ids.length > STORY_PROCESS_CAP)
    throw new GuardError(400, "too_many", `One piece of work links to at most ${STORY_PROCESS_CAP} processes.`)
  for (const id of ids) requireText(id, "Process", TEXT_LIMITS.short)
  const unique = [...new Set(ids)]
  const rows = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `SELECT id FROM processes WHERE deactivated_at IS NULL AND id IN (${unique.map(() => "?").join(", ")})`,
    unique
  )
  if (rows.length !== unique.length)
    throw new GuardError(400, "invalid_input", "One of those processes isn't there any more.")
  return unique
}

/** Write the story↔process links, replacing whatever was there. Delete-then-insert
 * rather than a diff: the set is at most a handful, and a diff is three statements
 * where one pair does the same thing with no order to get wrong. This is the ONE
 * place in the codebase that deletes rather than deactivates, and it is right:
 * a link row carries no history of its own — the story's activity feed already
 * records that its processes changed, and a deactivated link would make
 * `GROUP_CONCAT` above need a clause it can silently lose. */
async function setProcesses(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  storyId: string,
  processIds: string[]
): Promise<void> {
  const now = new Date().toISOString()
  const inserts = processIds
    .map(
      (pid) =>
        `INSERT INTO story_processes (id, story_id, process_id, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(ulid())}, ${sqlString(storyId)}, ${sqlString(pid)}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
    )
    .join("\n")
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `DELETE FROM story_processes WHERE story_id = ${sqlString(storyId)};\n${inserts}`
  )
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
  env: Env,
  guard: MemberGuard,
  userId: string,
  what: string
): Promise<{ id: string; name: string }> {
  // THE MEMBER LIST, NOT THE ACTIVITY FEED. It used to read the newest
  // `creator_name` this person had written into the team database — which is a
  // name they once typed under, not the name they are called — and fell back to
  // the literal label when there was none. So a story handed to somebody in
  // their first week, before they had touched a single row, stored
  // `assignee_name = "Assignee"`, and that is what every list drew.
  //
  // Membership and identity both live in the CORE database, so ask it: the same
  // read the to-do door already uses, and the same one `listMembers` answers the
  // picker from. A name is still STORED beside the id (the audit habit of this
  // codebase) so fifty stories draw fifty names without fifty lookups; the id is
  // what anything is ever decided from. And an id belonging to nobody on the
  // team is now the 400 the old comment already claimed it was.
  const member = (await teamMemberNames(env, guard.teamId)).find((m) => m.userId === userId)
  if (!member)
    throw new GuardError(400, "invalid_input", `That ${what.toLowerCase()} isn't on the team.`)
  return { id: userId, name: member.name }
}

/* ------------------- the app's own people decide two things ---------------- */

/** WHO IS ON THIS APP, and which of them leads it. Read out of the tenancy
 * build's `app_staff` table, which lives in the SAME team database — the two
 * workers are two brains over one set of books, and a story asking "who is on
 * the system this work is about?" is a read, not a reach.
 *
 * Returns an empty set for a story with no app, which is what makes both rules
 * below fail OPEN in exactly the case where they have nothing to say. */
async function appStaff(
  cfg: D1Rest,
  guard: MemberGuard,
  appId: string | null
): Promise<{ userIds: Set<string>; leadUserId: string | null }> {
  if (!appId) return { userIds: new Set(), leadUserId: null }
  const rows = await d1Query<{ user_id: string; is_lead: number }>(
    cfg,
    guard.databaseId,
    // R14 hard cap — one app's staff is bounded by the size of the team.
    `SELECT user_id, is_lead FROM app_staff WHERE app_id = ? AND deactivated_at IS NULL LIMIT ${LIST_HARD_CAP}`,
    [appId]
  )
  return {
    userIds: new Set(rows.map((r) => r.user_id)),
    leadUserId: rows.find((r) => r.is_lead === 1)?.user_id ?? null,
  }
}

/** CHECKLIST 6.6: "who's doing it" limits to the staff on that app.
 *
 * At the DOOR and not only in the picker, because a narrowed dropdown is a
 * suggestion and this is a rule. It is deliberately silent when the app has NO
 * staff yet: an app nobody has been assigned to would otherwise refuse every
 * assignee on it, which would make recording who is doing the work impossible
 * on precisely the apps that most need it. Somebody being staffed is what turns
 * the rule on. */
async function refuseOffAppAssignee(
  cfg: D1Rest,
  guard: MemberGuard,
  appId: string | null,
  assigneeId: string | null,
  what: string
): Promise<void> {
  if (!assigneeId) return
  const { userIds } = await appStaff(cfg, guard, appId)
  if (userIds.size === 0 || userIds.has(assigneeId)) return
  throw new GuardError(
    400,
    "not_on_app",
    `${what} isn't on this app. Add them to the app's team first, then give them the work.`
  )
}

/** CHECKLIST 6.10: the reviewer's one Done button belongs to the app's TEAM LEAD.
 *
 * Aurora's answer over the owner's "anyone with the right". Silent when the app
 * has no lead — and that is not a loophole, it is the migration path: 3,677
 * stories arrived from the previous system on apps nobody has staffed, and a
 * rule that locked all of them behind a person who does not exist would have
 * frozen the backlog on the day it shipped. Name a lead and the button becomes
 * theirs. */
async function refuseDoneByAnybodyElse(
  cfg: D1Rest,
  guard: MemberGuard,
  appId: string | null
): Promise<void> {
  const { leadUserId } = await appStaff(cfg, guard, appId)
  if (!leadUserId || leadUserId === guard.userId) return
  throw new GuardError(
    403,
    "not_team_lead",
    "Only this app's team lead can mark the work done. Ask them to take a look."
  )
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
  env: Env,
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
  // REQUIRED (CHECKLIST 6.2). Not checked against the team's list: the words are
  // theirs to rename on the Dropdown values screen, and a door that validated
  // against today's three would refuse a fourth the moment somebody added one.
  const storyType = requireText(input.storyType, "Story type", TEXT_LIMITS.short)

  const accountId = await resolveAccount(cfg, guard, named, ticketId, appId)
  const processIds = await resolveProcesses(cfg, guard, input.processIds, changesNoStep)
  // 6.6 — the work goes to somebody who is on this app, or nowhere.
  await refuseOffAppAssignee(cfg, guard, appId ?? null, assigneeId ?? null, "That person")
  const assignee = assigneeId ? await memberOrThrow(env, guard, assigneeId, "Assignee") : null
  const reviewer = reviewerId ? await memberOrThrow(env, guard, reviewerId, "Reviewer") : null

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
       sprint_id, title, detail, story_type, assignee_id, assignee_name, reviewer_id, reviewer_name,
       starts_on, due_on, status, rank, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(ref)}, ${sqlString(accountId)}, ${sqlString(ticketId ?? null)}, ${sqlString(appId ?? null)}, ${sqlString(processId ?? processIds[0] ?? null)}, ${sqlString(stepKey)}, ${changesNoStep ? 1 : 0}, ${sqlString(sprintId)}, ${sqlString(title)}, ${sqlString(detail)}, ${sqlString(storyType)}, ${sqlString(assignee?.id ?? null)}, ${sqlString(assignee?.name ?? null)}, ${sqlString(reviewer?.id ?? null)}, ${sqlString(reviewer?.name ?? null)}, ${sqlString(startsOn)}, ${sqlString(dueOn)}, 'open', ${sqlString(rank)}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
  await setProcesses(cfg, guard, actor, id, processIds)

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Story created",
    description: `${actor.name} created ${ref ? `story ${ref}` : "a story"}, ${title}`,
    relatedTable: "stories",
    relatedRowId: id,
  })
  return { id, accountId }
}

/** Edit a story's content. Everything except the status and the rank, which have
 * their own doors — a status is a transition, not a field. */
export async function updateStory(
  env: Env,
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
  const storyType = requireText(input.storyType, "Story type", TEXT_LIMITS.short)

  // The account is re-derived rather than carried: re-pointing a story at another
  // ticket moves the work to that client's books, and the margin has to follow it.
  // The reference number does NOT follow — it was minted against the old account
  // and a client may already be quoting it.
  const accountId = (await resolveAccount(cfg, guard, named, ticketId, appId)) ?? before.account_id
  const processIds = await resolveProcesses(cfg, guard, input.processIds, changesNoStep)
  // 6.6 — asked of the app this edit is LEAVING the story on, so moving work to
  // another system and handing it to somebody who is not on that system is one
  // refusal rather than two edits that each looked fine.
  await refuseOffAppAssignee(cfg, guard, appId ?? before.app_id, assigneeId ?? null, "That person")
  const assignee = assigneeId ? await memberOrThrow(env, guard, assigneeId, "Assignee") : null
  const reviewer = reviewerId ? await memberOrThrow(env, guard, reviewerId, "Reviewer") : null

  const now = new Date().toISOString()
  await d1Query(
    cfg,
    guard.databaseId,
    `UPDATE stories SET title = ?, detail = ?, ticket_id = ?, app_id = ?, process_id = ?, step_key = ?,
       changes_no_step = ?, sprint_id = ?, story_type = ?, assignee_id = ?, assignee_name = ?, reviewer_id = ?,
       reviewer_name = ?, starts_on = ?, due_on = ?, account_id = ?, updated_at = ?,
       editor_id = ?, editor_email = ?, editor_name = ?
     WHERE id = ?`,
    [
      title,
      detail,
      ticketId ?? null,
      appId ?? null,
      // The single `process_id` column follows the FIRST of the many, so the two
      // can never disagree about which map this work is filed under.
      processId ?? processIds[0] ?? null,
      stepKey,
      changesNoStep ? 1 : 0,
      sprintId,
      storyType,
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
  await setProcesses(cfg, guard, actor, id, processIds)

  const changes = describeChanges([
    { label: "Title", from: before.title, to: title },
    { label: "Type", from: before.story_type, to: storyType },
    { label: "Assignee", from: before.assignee_name, to: assignee?.name ?? null },
    { label: "Due", from: before.due_on, to: dueOn },
    { label: "Sprint", from: before.sprint_id, to: sprintId, hideValues: true },
    { label: "Step", from: before.step_key, to: stepKey },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Story edited",
    description: `${actor.name} edited ${before.ref ?? "a story"}${changes ? `, ${changes}` : ""}`,
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
    "Before this can be done, say which process step it changed, or tick that it changed none."
  )
}

/** Move a story along its fixed lifecycle.
 *
 * R17: the `status <> ?` predicate rides the UPDATE, so re-marking a done story
 * done moves zero rows — no duplicate history, no second ping, and (the one that
 * matters here) no second attempt at the ticket's Ready flip. */
/** THE REVIEW RULE (CHECKLIST 6.9): a story cannot go to review while a timer is
 * still running on it, and not without a sentence saying what was done.
 *
 * WHY THE TIMER HALF IS THE IMPORTANT HALF. "Review" means "I have stopped, come
 * and look" — a clock still ticking says the opposite, and the hours that land
 * after somebody else has signed the work off are hours nobody reviewed. It is
 * also the exact inversion the tester asked for: a status used to START a timer,
 * and now a timer is what a status has to wait for.
 *
 * THE FILE IS NOT REQUIRED, and that is Aurora's ruling over the owner's "all
 * three always": plenty of real work has nothing to show, and a required upload
 * on work with no screenshot is a rule people satisfy with a blank image.
 *
 * Checked HERE rather than at the door, for `refuseUnstepped`'s reason: there is
 * more than one way to move a story, and one of them will be written by somebody
 * who has never read this file. */
async function refuseUnreviewable(
  cfg: D1Rest,
  guard: MemberGuard,
  id: string,
  reviewNote: string | null,
  existingNote: string | null
): Promise<void> {
  if (!reviewNote && !existingNote)
    throw new GuardError(
      400,
      "review_note_required",
      "Before this goes for review, say what you did, a line or two is plenty."
    )
  // AND SOMETHING TO LOOK AT (owner, 19 Aug 2026): "An explanation text plus one
  // or more files or images are required to send a story for review."
  //
  // This REVERSES Aurora's ruling, which made the file optional because "a
  // required upload on work with nothing to show is a rule people satisfy with a
  // blank image". That risk is real and the owner overruled it knowing so; the
  // note is kept here rather than deleted, because the day somebody finds a
  // folder of blank screenshots this is the sentence that explains them.
  //
  // COUNTED, NOT PASSED IN — the same shape as `existingNote` above. A person who
  // uploaded three images on Tuesday and pressed the button on Thursday sends no
  // files with the request, and refusing them would be the rule punishing the
  // orderly. What the story CARRIES is what counts.
  const shown = await countStoryAttachments(cfg, guard, id)
  if (shown === 0)
    throw new GuardError(
      400,
      "review_file_required",
      "Attach at least one file or link showing what you did, then send it for review."
    )
  const running = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    // ANY running timer, not just the caller's: two people can be on one piece of
    // work, and "come and look at it" is false while either of them is still on it.
    `SELECT COUNT(*) AS n FROM work_logs
      WHERE target_table = 'stories' AND target_id = ? AND ended_at IS NULL AND discarded_at IS NULL`, // R14: one aggregate row
    [id]
  )
  if ((running[0]?.n ?? 0) > 0)
    throw new GuardError(
      409,
      "timer_running",
      "Stop the timer on this first, work still being clocked isn't finished work."
    )
}

export async function setStoryStatus(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  status: StoryStatus,
  closingNote: string | null,
  review?: { note?: string | null; fileUrl?: string | null; fileName?: string | null }
): Promise<{ moved: boolean; story: Story; ticketId: string | null; accountId: string | null }> {
  const before = await storyOrThrow(cfg, guard, id)
  // 6.10 — one Done button, and it belongs to the app's team lead.
  if (status === "done") await refuseDoneByAnybodyElse(cfg, guard, before.app_id)
  if (status === "done") refuseUnstepped(before)
  const reviewNote = review?.note ?? null
  if (status === "in_review")
    await refuseUnreviewable(cfg, guard, id, reviewNote, before.review_note)

  const now = new Date().toISOString()
  const done = status === "done"
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    // The review block is COALESCEd like the closing note, and for the same
    // reason: an explanation typed on Tuesday is still the explanation on
    // Thursday, and a move that did not re-type it must not erase it.
    `UPDATE stories SET status = ?, closed_at = ?, closing_note = COALESCE(?, closing_note),
       review_note = COALESCE(?, review_note),
       review_file_url = COALESCE(?, review_file_url),
       review_file_name = COALESCE(?, review_file_name),
       updated_at = ?, editor_id = ?, editor_email = ?, editor_name = ?
     WHERE id = ? AND status <> ? RETURNING id`,
    [
      status,
      done ? now : null,
      closingNote,
      reviewNote,
      review?.fileUrl ?? null,
      review?.fileName ?? null,
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

/** THE STORY'S OWN AUTOMATIC FLIP (CHECKLIST 6.7: "the status is a label; a timer
 * moves it. Today it is backwards.").
 *
 * Shaped exactly like the ticket's (lib/ready-flip): the states a start may claim
 * are named IN the statement rather than checked beforehand, so "this never drags
 * work backwards" is readable in the SQL. A story already in progress moves zero
 * rows; one in review or done is not somewhere a clock can pull it out of —
 * putting a story back to `in_progress` because somebody re-read the timesheet
 * would un-review reviewed work. */
export async function storyProgressFlip(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  storyId: string
): Promise<{ moved: boolean }> {
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE stories SET status = 'in_progress', updated_at = ?, editor_id = ?, editor_email = ?, editor_name = ?
      WHERE id = ? AND status IN ('open') RETURNING id`,
    [now, actor.id, actor.email, actor.name, storyId]
  )
  if (!changed[0]) return { moved: false }
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Story in progress",
    description: `${actor.name} started working on this`,
    relatedTable: "stories",
    relatedRowId: storyId,
  })
  return { moved: true }
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
export type SprintFilter = {
  accountId?: string | null
  appId?: string | null
  /** WHICH BLOCKS ARE STILL WORTH PUTTING WORK IN (CHECKLIST 6.3): "current or
   * future only". `open` hides the ones that have finished — a sprint that has
   * been completed, or whose end date is behind us. Anything else is `all`, which
   * is what the sprints page itself shows. */
  when?: "open" | "all"
}

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
  // CURRENT OR FUTURE. Two facts, not one: a sprint somebody marked complete is
  // finished whatever its dates say, and a sprint whose end date has passed is
  // finished whether or not anyone got round to marking it. A sprint with NO end
  // date has not ended — `ends_on IS NULL` survives, which is the honest reading
  // of a block nobody has dated yet.
  //
  // ANSWERED HERE rather than in the browser, for R14's reason: the picker offers
  // what the door returns, and a page filtered after the fact offers "the open
  // sprints among the newest thousand".
  if (filter.when === "open") {
    parts.push("sp.completed_at IS NULL AND sp.deactivated_at IS NULL AND (sp.ends_on IS NULL OR sp.ends_on >= ?)")
    params.push(new Date().toISOString().slice(0, 10))
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
    description: `${actor.name} started ${ref ? `sprint ${ref}` : "a sprint"}, ${name}`,
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
    { label: "Type", from: before.sprint_type, to: sprintType },
    { label: "Runs", from: before.starts_on, to: startsOn },
    { label: "Ends", from: before.ends_on, to: endsOn },
    // The FIGURE is deliberately hidden from the history line. A sprint's price
    // is commercial, the activity feed is read by everyone who holds `work`, and
    // "the price changed" is the fact that belongs in a log — not the number.
    { label: "Price", from: String(before.sold_price_cents), to: String(cents), hideValues: true },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Sprint edited",
    description: `${actor.name} edited ${before.ref ?? before.name}${changes ? `, ${changes}` : ""}`,
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
