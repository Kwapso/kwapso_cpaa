// MEETINGS — the conversations we have, with the agenda and the notes kept.
//
// THE RECORD GLIDE THREW AWAY. Its 350 meetings were reconciled into work logs,
// because a work log was the only row that carried a date, a duration and a
// client. That kept the HOURS and lost the MEETING: a work log has no field that
// can answer "what did we agree in March". Two columns here are the whole reason
// this module exists — `agenda` and `notes` — and everything else on the row is
// what makes them findable a year later.
//
// TIME IS STILL A WORK LOG. A meeting that ran ninety minutes is two facts, not
// one: a conversation that happened, and ninety minutes that cost us something.
// Joining them would make either one lie the moment the other is corrected, so
// they are joined by nothing at all — the same reasoning that keeps tasks and
// to-dos in two tables (lib/tasks.ts says it there).
//
// WHY IT PAGES (R14). A meeting is an EVENT: rows accumulate with ordinary use
// and are never curated away, because a cancelled meeting is still an answer to
// "didn't we have a call in March?". Glide's own two years are 350 rows, so a
// hard cap would be a ceiling this collection reaches rather than a bound it
// never touches. Keyset, newest first, exactly like the ticket list.

import { describeChanges, logActivity, type Actor } from "@shared/workers/activity"
import { countCollection } from "@shared/workers/count"
import { d1ExecScript, d1Query, likeLiteral, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { GuardError, type MemberGuard } from "@shared/workers/gating"
import { accessTokenFor } from "./google"
import { calendarGet, calendarList, type CalendarEvent } from "./google-api"
import { capToRow } from "./knowledge-files"
import { findTranscript, type TranscriptRoute } from "./google-transcript"
import { MEETING_LOG_KIND } from "./work-logs"
import type { Env } from "../env"

/** How long a meeting with no finish time is assumed to run. An hour is what a
 * diary assumes and what a person will correct if it is wrong; the alternative —
 * writing no time at all for a call whose end nobody recorded — would lose the
 * hours of exactly the meetings people arrange in a hurry. */
const DEFAULT_MEETING_MS = 60 * 60 * 1000
import { ulid } from "@shared/workers/id"
import { LIST_HARD_CAP } from "@shared/workers/limits"
import { decodeCursor, keysetAfter, PAGE_SIZE, toPage, type Page } from "@shared/workers/paging"
import { orderBy, resolveOrdering, type Ordering, type SortMenu } from "@shared/workers/sorting"
import { optionalMoment, optionalText, requireMoment, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import type { Meeting, MeetingAttachment, MeetingGuest, MeetingPersonLink } from "@shared/types"

import { nextRef, REF_KINDS } from "./refs"

type MeetingRow = {
  id: string
  ref: string | null
  title: string
  account_id: string | null
  account_name: string | null
  app_id: string | null
  app_name: string | null
  purpose_id: string | null
  purpose_name: string | null
  agenda: string | null
  notes: string | null
  location: string | null
  starts_at: string
  ends_at: string | null
  google_event_id: string | null
  google_event_url: string | null
  transcript_file_id: string | null
  transcript_captured_at: string | null
  transcript_url: string | null
  transcript_found_by: string | null
  recurring_event_id: string | null
  google_join_url: string | null
  google_organizer: string | null
  google_attendees_json: string | null
  google_attachments_json: string | null
  google_status: string | null
  google_recurrence: string | null
  google_time_zone: string | null
  google_updated_at: string | null
  google_synced_at: string | null
  from_calendar: number | null
  created_at: string
  creator_name: string | null
  updated_at: string | null
  editor_name: string | null
  deactivated_at: string | null
}

/** The two names ride the read rather than a second lookup: a meeting is only
 * ever useful with the client and the purpose spelled out, and a list of fifty
 * would otherwise be a hundred round trips through the REST door. */
const MEETING_COLS = `m.id, m.ref, m.title, m.account_id, m.app_id, m.purpose_id, m.agenda, m.notes, m.location,
  m.starts_at, m.ends_at, m.google_event_id, m.google_event_url,
  m.transcript_file_id, m.transcript_captured_at, m.transcript_url, m.transcript_found_by,
  m.recurring_event_id,
  m.google_join_url, m.google_organizer, m.google_attendees_json, m.google_attachments_json,
  m.google_status, m.google_recurrence, m.google_time_zone, m.google_updated_at, m.google_synced_at,
  m.from_calendar,
  m.created_at, m.creator_name, m.updated_at, m.editor_name, m.deactivated_at,
  (SELECT a.name FROM accounts a WHERE a.id = m.account_id) AS account_name,
  (SELECT ap.name FROM apps ap WHERE ap.id = m.app_id) AS app_name,
  (SELECT p.name FROM meeting_purposes p WHERE p.id = m.purpose_id) AS purpose_name`

/** The sort a meeting list is keyed by: when it is / was, newest first. A diary
 * read backwards is what somebody wants — the thing that just happened is the
 * thing they are looking for — and the future sits at the top where it belongs. */
const MEETING_ORDER = "m.starts_at"

/** WHAT THE DIARY MAY BE ORDERED BY (shared/workers/sorting.ts). `when` is the
 * fallback and is the order above; the rest are the columns the "All" view
 * already shows in a table, which is the view a person reads across rather than
 * scans — and therefore the one they want ordered by client, or by when it was
 * added.
 *
 * THERE WAS A `status` ORDER HERE and it went with the status: `when` IS the
 * order by whether a meeting has happened, because the start time is the only
 * fact that ever answered that question. */
export const MEETING_SORTS: SortMenu<Meeting> = {
  when: { expr: MEETING_ORDER, dir: "desc", key: (m) => m.startsAt },
  title: { expr: "m.title", dir: "asc", key: (m) => m.title },
  client: { expr: "(SELECT a.name FROM accounts a WHERE a.id = m.account_id)", dir: "asc", key: (m) => m.accountName },
  added: { expr: "m.created_at", dir: "desc", key: (m) => m.createdAt },
}

/** A JSON MIRROR COLUMN, READ DEFENSIVELY.
 *
 * These columns hold what Google said, written by a sweep, read by a screen —
 * and a database is not a place where a shape is guaranteed. A half-written
 * value, a column from before a migration, a hand-edited row: none of them is a
 * reason to fail a whole meetings list. An unreadable mirror is EMPTY, which is
 * the same thing the row says before it has ever been swept, and the screens
 * already know how to say "we haven't read that from Google yet".
 *
 * The alternative — trusting the parse — turns one malformed row into a 500 on
 * the diary, which is the collection somebody opens to find out what today
 * holds. */
function readJsonList<T>(raw: string | null): T[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function toMeeting(r: MeetingRow): Meeting {
  return {
    id: r.id,
    ref: r.ref,
    title: r.title,
    accountId: r.account_id,
    accountName: r.account_name,
    appId: r.app_id,
    appName: r.app_name,
    purposeId: r.purpose_id,
    purposeName: r.purpose_name,
    agenda: r.agenda,
    notes: r.notes,
    location: r.location,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    // NO `status` AND NO `heldAt`. The column is still on the table (history
    // stays true) and is read by nothing: whether a meeting has happened is
    // `startsAt` against the clock, which is one fact instead of two that can
    // disagree. The header says the whole of it.
    googleEventId: r.google_event_id,
    googleEventUrl: r.google_event_url,
    transcriptFileId: r.transcript_file_id,
    transcriptCapturedAt: r.transcript_captured_at,
    transcriptUrl: r.transcript_url,
    transcriptFoundBy: r.transcript_found_by,
    recurringEventId: r.recurring_event_id,
    googleJoinUrl: r.google_join_url,
    googleOrganizer: r.google_organizer,
    googleStatus: r.google_status,
    googleTimeZone: r.google_time_zone,
    googleRecurrence: r.google_recurrence,
    googleGuests: readJsonList<MeetingGuest>(r.google_attendees_json),
    googleAttachments: readJsonList<MeetingAttachment>(r.google_attachments_json),
    googleSyncedAt: r.google_synced_at,
    fromCalendar: r.from_calendar === 1,
    active: r.deactivated_at === null,
    createdAt: r.created_at,
    creatorName: r.creator_name,
    updatedAt: r.updated_at,
    editorName: r.editor_name,
  }
}

/** What narrows a meetings read. Every one of these is a filter the machine
 * surface must expose too (R19) — the list is derived from this type's own
 * fields at the door. */
export type MeetingFilter = {
  accountId?: string
  /** WHICH SYSTEM IT WAS ABOUT. The app record's own Meetings tab asks the
   * SERVER by this rather than narrowing a loaded page in the browser — the
   * diary is paged, and "this app's meetings among the newest fifty" is an
   * answer that looks like an answer. */
  appId?: string
  purposeId?: string
  /** 'upcoming' is what has not started yet, BY THE CLOCK — it used to be
   * "everything nobody has ticked", which is a different set the moment somebody
   * forgets to tick. 'week' is the week we are in, past and upcoming both (9.1);
   * 'all' shows the lot, cancelled ones included. */
  view?: string
  q?: string
}

/** The WHERE both the list and its count are built from — one function, so the
 * badge can never count a different question from the one the rows answered
 * (R16 is only true if the two statements agree). */
/** MONDAY TO SUNDAY, IN UTC, as two ISO moments. The week is computed on the
 * SERVER because the count and the rows must agree about which week they mean —
 * a browser working out its own boundary and a door working out another is the
 * R16 failure in its quietest form, two true numbers about different weeks.
 *
 * UTC rather than the reader's zone, deliberately and with the cost named: an
 * agency in Berlin sees Monday's 00:30 stand-up in the right week and a meeting
 * at 01:30 on Monday morning would land in the previous one. The alternative is
 * a timezone travelling on every request and being wrong in a different way. */
function thisWeek(): { from: string; to: string } {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  // getUTCDay is 0 for Sunday, so Sunday is six days after the Monday it belongs to.
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 7)
  return { from: start.toISOString(), to: end.toISOString() }
}

function whereFor(filter: MeetingFilter): { sql: string; params: (string | number)[] } {
  const where: string[] = []
  const params: (string | number)[] = []
  // A cancelled meeting is hidden from every view but `all` — it is retired, not
  // deleted, so it stays readable by id and by asking for everything.
  if (filter.view !== "all") where.push("m.deactivated_at IS NULL")
  // STILL TO COME, BY THE CLOCK. It used to read `m.status <> 'held'`, which is
  // a different question wearing the same clothes: it answered "has anybody
  // ticked this", so a meeting from March that nobody ticked sat in "upcoming"
  // for ever and one ticked early vanished from a day it had not reached. The
  // start time is the fact, and it needs nobody to remember anything.
  if (filter.view === "upcoming") {
    where.push("m.starts_at >= ?")
    params.push(new Date().toISOString())
  }
  // THIS WEEK — past AND upcoming (CHECKLIST 9.1). Monday to Sunday, so a
  // Friday afternoon still shows Monday's kickoff: "this week" means the week
  // somebody is IN, not the days that are left of it.
  if (filter.view === "week") {
    const { from, to } = thisWeek()
    where.push("m.starts_at >= ? AND m.starts_at < ?")
    params.push(from, to)
  }
  if (filter.accountId) {
    where.push("m.account_id = ?")
    params.push(filter.accountId)
  }
  if (filter.appId) {
    where.push("m.app_id = ?")
    params.push(filter.appId)
  }
  if (filter.purposeId) {
    where.push("m.purpose_id = ?")
    params.push(filter.purposeId)
  }
  if (filter.q) {
    // The needle is a LIKE PATTERN, not just a bound value — likeLiteral is what
    // stops `%` meaning "everything" (shared/workers/d1-rest.ts).
    where.push("(LOWER(m.title) LIKE ? ESCAPE '\\' OR LOWER(m.agenda) LIKE ? ESCAPE '\\' OR LOWER(m.notes) LIKE ? ESCAPE '\\')")
    const needle = `%${likeLiteral(filter.q.toLowerCase())}%`
    params.push(needle, needle, needle)
  }
  return { sql: where.length ? where.join(" AND ") : "1 = 1", params }
}

/** The team's meetings, newest first. R14 GROWING collection: keyset-PAGED, not
 * capped — see the header. `cursor` is the opaque one from the previous page. */
export async function listMeetings(
  cfg: D1Rest,
  guard: MemberGuard,
  filter: MeetingFilter,
  cursor: string | null,
  ordering: Ordering<Meeting> = resolveOrdering(MEETING_SORTS, "when", undefined, undefined)
): Promise<Page<Meeting>> {
  const base = whereFor(filter)
  // One ordering feeds the ORDER BY, the keyset predicate and the next cursor.
  const after = keysetAfter(decodeCursor(cursor, ordering.sig), ordering.expr, ordering.dir, "m.id")
  const params = [...base.params, ...after.params]
  const rows = await d1Query<MeetingRow>(
    cfg,
    guard.databaseId,
    `SELECT ${MEETING_COLS} FROM meetings m
      WHERE ${base.sql}${after.sql ? ` AND ${after.sql}` : ""}
      ${orderBy(ordering, "m.id")} LIMIT ${PAGE_SIZE + 1}`,
    params
  )
  return toPage(rows.map(toMeeting), PAGE_SIZE, (m) => [ordering.key(m), m.id], ordering.sig)
}

/** R16: the exact server COUNT(*), over the SAME question the list asked. */
export async function countMeetings(
  cfg: D1Rest,
  guard: MemberGuard,
  filter: MeetingFilter
): Promise<number> {
  const base = whereFor(filter)
  // R16 (amended): counted exactly to TOTAL_COUNT_CAP, then "at least".
  return countCollection(
    cfg,
    guard.databaseId,
    `SELECT 1 FROM meetings m WHERE ${base.sql}`,
    base.params
  )
}

/** One meeting by id, or null. Reads a cancelled one too: the record survives
 * its cancellation, and a link somebody has kept must still open. */
export async function getMeeting(
  cfg: D1Rest,
  guard: MemberGuard,
  id: string
): Promise<Meeting | null> {
  const rows = await d1Query<MeetingRow>(
    cfg,
    guard.databaseId,
    // R14: one row by primary key.
    `SELECT ${MEETING_COLS} FROM meetings m WHERE m.id = ? LIMIT 1`,
    [id]
  )
  return rows[0] ? toMeeting(rows[0]) : null
}

/** The same read, throwing the clean 404 every write opens with. */
async function meetingOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  id: string
): Promise<Meeting> {
  const found = await getMeeting(cfg, guard, id)
  if (!found) throw new GuardError(404, "meeting_not_found", "That meeting doesn't exist.")
  return found
}

/** What a create or an edit accepts, straight off the request body. Every field
 * is `unknown` because that is what it is — the validation below is the boundary
 * (R20), and it is positional: each one sits as the first argument to a checker. */
export type MeetingInput = {
  title?: unknown
  accountId?: unknown
  appId?: unknown
  purposeId?: unknown
  agenda?: unknown
  notes?: unknown
  location?: unknown
  startsAt?: unknown
  endsAt?: unknown
}

type ReadInput = {
  title: string
  accountId: string | null
  appId: string | null
  purposeId: string | null
  agenda: string | null
  notes: string | null
  location: string | null
  startsAt: string
  endsAt: string | null
}

/** The fields a create and an edit share, validated identically so the two can't
 * drift into different shapes. A meeting's start is REQUIRED and its end is not:
 * "Tuesday at ten" is how a meeting is arranged, and how long it will run is
 * usually not decided until it is over. */
function readInput(input: MeetingInput): ReadInput {
  const startsAt = requireMoment(input.startsAt, "When")
  const endsAt = optionalMoment(input.endsAt, "Until") ?? null
  // A meeting that ends before it starts is not a meeting, and the row would
  // sort and render perfectly — the worst kind of bad data (internal-fields.ts
  // makes the same argument about a date that nearly parses).
  if (endsAt && Date.parse(endsAt) < Date.parse(startsAt))
    throw new GuardError(400, "invalid_input", "A meeting can't end before it starts.")
  return {
    title: requireText(input.title, "What it is about", TEXT_LIMITS.short),
    accountId: optionalText(input.accountId, "Client", TEXT_LIMITS.short) ?? null,
    appId: optionalText(input.appId, "App", TEXT_LIMITS.short) ?? null,
    purposeId: optionalText(input.purposeId, "Why we are meeting", TEXT_LIMITS.short) ?? null,
    agenda: optionalText(input.agenda, "Agenda", TEXT_LIMITS.long) ?? null,
    notes: optionalText(input.notes, "Notes", TEXT_LIMITS.long) ?? null,
    location: optionalText(input.location, "Where", TEXT_LIMITS.short) ?? null,
    startsAt,
    endsAt,
  }
}

/** The client and the purpose have to be rows this team really has. An id
 * nobody owns would file this meeting's notes in a compartment nothing can ever
 * reach again — the same argument lib/knowledge.ts makes about a source. */
async function requireReferences(
  cfg: D1Rest,
  guard: MemberGuard,
  v: { accountId: string | null; appId: string | null; purposeId: string | null }
): Promise<void> {
  if (v.accountId) {
    const rows = await d1Query<{ id: string }>(
      cfg,
      guard.databaseId,
      // R14: one row by primary key.
      "SELECT id FROM accounts WHERE id = ? AND deactivated_at IS NULL LIMIT 1",
      [v.accountId]
    )
    if (!rows[0]) throw new GuardError(400, "invalid_input", "That client isn't on your books any more.")
  }
  if (v.appId) {
    const rows = await d1Query<{ id: string }>(
      cfg,
      guard.databaseId,
      // R14: one row by primary key.
      "SELECT id FROM apps WHERE id = ? AND deactivated_at IS NULL LIMIT 1",
      [v.appId]
    )
    if (!rows[0]) throw new GuardError(400, "invalid_input", "That app isn't one of ours any more.")
  }
  if (v.purposeId) {
    const rows = await d1Query<{ id: string }>(
      cfg,
      guard.databaseId,
      // R14: one row by primary key.
      "SELECT id FROM meeting_purposes WHERE id = ? AND deactivated_at IS NULL LIMIT 1",
      [v.purposeId]
    )
    if (!rows[0]) throw new GuardError(400, "invalid_input", "That isn't a meeting purpose we use.")
  }
}

/** Put a meeting in the diary. Returns its id and the account it names, because
 * the door needs the second one for the live ping's fence. */
export async function createMeeting(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  input: MeetingInput
): Promise<{ id: string; accountId: string | null }> {
  const v = readInput(input)
  await requireReferences(cfg, guard, v)
  const id = ulid()
  const now = new Date().toISOString()
  // Null for an internal meeting: a reference is built out of a client's short
  // code, and a number nobody can quote is worse than none (lib/refs.ts).
  const ref = await nextRef(cfg, guard, v.accountId, REF_KINDS.meeting)
  await d1ExecScript(
    cfg,
    guard.databaseId,
    // `status` is not named: the column keeps its own default and nothing reads
    // it any more (see toMeeting).
    `INSERT INTO meetings (id, ref, account_id, app_id, purpose_id, title, agenda, notes, location,
        starts_at, ends_at, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(ref)}, ${sqlString(v.accountId)}, ${sqlString(v.appId)}, ${sqlString(v.purposeId)},
        ${sqlString(v.title)}, ${sqlString(v.agenda)}, ${sqlString(v.notes)}, ${sqlString(v.location)},
        ${sqlString(v.startsAt)}, ${sqlString(v.endsAt)},
        ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Meeting arranged",
    description: `${actor.name} put "${v.title}" in the diary for ${v.startsAt.slice(0, 10)}`,
    relatedTable: "meetings",
    relatedRowId: id,
  })
  return { id, accountId: v.accountId }
}

/** Correct a meeting — including, and mostly, writing the notes up afterwards. */
export async function updateMeeting(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  input: MeetingInput
): Promise<{ accountId: string | null }> {
  const before = await meetingOrThrow(cfg, guard, id)
  const v = readInput(input)
  await requireReferences(cfg, guard, v)
  const now = new Date().toISOString()
  await d1Query(
    cfg,
    guard.databaseId,
    `UPDATE meetings SET title = ?, account_id = ?, app_id = ?, purpose_id = ?, agenda = ?, notes = ?, location = ?,
        starts_at = ?, ends_at = ?, updated_at = ?, editor_id = ?, editor_email = ?, editor_name = ?
      WHERE id = ?`,
    [
      v.title,
      v.accountId,
      v.appId,
      v.purposeId,
      v.agenda,
      v.notes,
      v.location,
      v.startsAt,
      v.endsAt,
      now,
      actor.id,
      actor.email,
      actor.name,
      id,
    ]
  )
  const changes = describeChanges([
    { label: "Title", from: before.title, to: v.title },
    { label: "When", from: before.startsAt, to: v.startsAt },
    { label: "Where", from: before.location, to: v.location },
    // The two long fields are reported as CHANGED and never quoted: a meeting's
    // notes are the most sensitive prose in this module, and an activity feed
    // that repeats them is a second copy nobody meant to make.
    { label: "Agenda", from: before.agenda, to: v.agenda, hideValues: true },
    { label: "Notes", from: before.notes, to: v.notes, hideValues: true },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Meeting updated",
    description: `${actor.name} updated "${v.title}"${changes ? `, ${changes}` : ""}`,
    relatedTable: "meetings",
    relatedRowId: id,
  })
  return { accountId: v.accountId }
}

/* MARKING A MEETING HELD WAS A FUNCTION HERE, AND THE IDEA IS RETIRED.
 *
 * The owner, 18 August 2026: "this held mark is held release. I don't care. It's
 * too complicated." He is right, and the reason is worth keeping: a meeting's
 * own START TIME already says whether it has happened. A status column was a
 * second source of truth for a question the clock answers, so the two could
 * disagree in both directions — a March meeting nobody ticked stayed "upcoming",
 * and one ticked on Monday morning left the day it belonged to.
 *
 * WHAT TOOK OVER ITS THREE JOBS. The `upcoming` view keys off `starts_at`
 * (`whereFor`, above). The notes are always editable, because "the writing-up is
 * done" was never a fact the app could know. And the transcript capture, which
 * used to tick it, now writes the transcript and the work logs alone — its
 * idempotence never rode the status, it rides `transcript_captured_at IS NULL`,
 * which is why a second import still cannot double anybody's hours.
 *
 * The COLUMN stays (deactivate-never-delete: it records what people ticked while
 * the idea existed) and nothing reads it.
 */

/** Cancel a meeting, or put it back. Deactivate-never-delete: the row survives,
 * so "didn't we have a call in March?" stays answerable after somebody tidies.
 *
 * R17: the current-status predicate rides the UPDATE; zero rows moved = no
 * history row and no ping. */
export async function setMeetingActive(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  active: boolean
): Promise<{ moved: boolean; accountId: string | null }> {
  const before = await meetingOrThrow(cfg, guard, id)
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    active
      ? `UPDATE meetings SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL,
            deactivator_name = NULL, updated_at = ?
          WHERE id = ? AND deactivated_at IS NOT NULL RETURNING id`
      : `UPDATE meetings SET deactivated_at = ?, deactivator_id = ${sqlString(actor.id)},
            deactivator_email = ${sqlString(actor.email)}, deactivator_name = ${sqlString(actor.name)},
            updated_at = ?
          WHERE id = ? AND deactivated_at IS NULL RETURNING id`,
    active ? [now, id] : [now, now, id]
  )
  if (!changed[0]) return { moved: false, accountId: before.accountId }
  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "Meeting reinstated" : "Meeting cancelled",
    description: `${actor.name} ${active ? "put" : "took"} "${before.title}" ${active ? "back in" : "out of"} the diary`,
    relatedTable: "meetings",
    relatedRowId: id,
  })
  return { moved: true, accountId: before.accountId }
}

/* `claimCalendarEvent` LIVED HERE — the write half of "a meeting booked in
 * kwapso appears in Google Calendar". There is no write half any more: the
 * calendar is read-only in this product, so a meeting arranged here stays here
 * and a meeting arranged in Google arrives here on the next sweep with its
 * guests, its join link and its attachments.
 *
 * `google_event_id` and its unique partial index are untouched and still doing
 * the work that matters — they are how the sweep recognises an entry it has
 * already made a record of, which is what stops one diary entry becoming two
 * meetings. The idempotence outlived the write it was invented for.
 */

/* ------------------ the transcript, and what it sets off ------------------- */
//
// CHECKLIST 9.2. A transcript arriving writes a work log per participant — one
// moment, one door. It used to tick a "held" status in the same breath (9.4);
// that status is retired (see above), and losing it cost this act nothing,
// because the tick was never what made it safe to run twice.
//
// OUR OWN STAFF ONLY (Aurora's tk1, over the owner's "every participant"). A
// client's hour is not our cost, and a work log is a cost record. So the
// attendee list off the calendar entry is INTERSECTED with the team's own
// members — an address we do not employ produces nothing at all, silently and
// correctly. It also means the door cannot be used to invent a person: every
// log it writes points at a `user_id` that is already a member of this team.
//
// IDEMPOTENT, AND THAT IS THE HARD PART. Reading a transcript twice must not
// write a second set of logs, or double the hours in a margin. The predicate
// rides the UPDATE that CLAIMS the transcript (`transcript_captured_at IS
// NULL`), so the claim is what is raced for — zero rows changed means somebody
// else got there and this call writes nothing (R17 for a job rather than a
// status). THIS IS THE PREDICATE, and it always was: it is a fact about the
// JOB — has the transcript been read — rather than about the meeting, which is
// exactly why retiring the held status left it standing. A status predicate
// would also have been the wrong one, because a meeting can be held without a
// transcript and the logs are written by the transcript.

/** The two facts a captured transcript leaves on the row. */
export type TranscriptCapture = {
  captured: boolean
  fileId: string | null
  fileName: string | null
  /** WHICH HUNT FOUND IT — the calendar entry's own attachment, a shared Drive
   * folder, or a notice from Google in the mail. Null when nothing was found. */
  foundBy: TranscriptRoute | null
  /** how many work logs were written — our staff who were in the room. */
  logsWritten: number
  /** why nothing happened, in a sentence a person can act on. */
  note: string | null
}

/** WHO IN THIS ROOM IS OURS. The calendar entry's attendee addresses, resolved
 * against the team's own membership in the GLOBAL core database. Anybody we do
 * not employ simply is not in the answer. */
async function ourStaffAmong(
  env: Env,
  teamId: string,
  emails: string[]
): Promise<{ userId: string; name: string }[]> {
  const list = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
  if (!list.length) return []
  // Bounded by the calendar read itself (EVENT_ATTENDEE_CAP is 50), which keeps
  // this under D1's bound-parameter ceiling with room to spare.
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.email, u.first_name, u.last_name FROM users u
       JOIN team_members tm ON tm.user_id = u.id
      WHERE tm.team_id = ? AND tm.deactivated_at IS NULL
        AND LOWER(u.email) IN (${list.map(() => "?").join(", ")})`
  )
    .bind(teamId, ...list)
    .all<{ id: string; email: string; first_name: string | null; last_name: string | null }>()
  return (results ?? []).map((r) => ({
    userId: r.id,
    name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email,
  }))
}

/** READ THE TRANSCRIPT FOR THIS MEETING, and do what its arrival means.
 *
 * THE HUNT ITSELF MOVED OUT (lib/google-transcript.ts) the day it stopped being
 * one search. It is now three, in an order of proof — the file Google attached
 * to this very entry, then a document in a folder this person named, then
 * Google's own notice in the mail — and the route that found it is kept on the
 * row, because "how do you know that is the transcript of THIS call" has a
 * different and honest answer for each of the three.
 *
 * AND THE WORDS ARE KEPT, not merely the file id. That is the change the owner
 * asked for in four words — "the call transcript should automatically be here" —
 * and it is also what makes a transcript ANSWERABLE without a second ingestion
 * path: text in a column is swept by the ordinary `meeting` kind, on the cron,
 * in the client's own compartment, with no Google token in sight.
 */
export async function captureTranscript(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string
): Promise<TranscriptCapture> {
  const meeting = await meetingOrThrow(cfg, guard, id)
  const nothing = (note: string): TranscriptCapture => ({
    captured: false,
    fileId: null,
    fileName: null,
    foundBy: null,
    logsWritten: 0,
    note,
  })
  if (!meeting.googleEventId)
    return nothing("This meeting isn't in a calendar yet, so there's nowhere to look for a transcript.")
  if (meeting.transcriptCapturedAt)
    return nothing("The transcript for this meeting has already been read.")

  const { token: calendarToken } = await accessTokenFor(env, cfg, guard, "calendar")
  const event = await calendarGet(calendarToken, meeting.googleEventId)
  const found = await findTranscript(env, cfg, guard, event)
  if (!found)
    return nothing(
      "No transcript for this meeting yet, not on the calendar entry, not in the folders you've shared, and not in any notice from Google."
    )

  // THE WORDS came back WITH the find, and that is the fix for the row that used
  // to say "captured" over nothing.
  //
  // It used to read the text here, after the hunt, and file whatever came back —
  // including "". A transcript of zero characters ticked the meeting held, wrote
  // a work log for everybody in the room, and set `transcript_captured_at`,
  // which is the column that means "do not look again". So one unreadable file
  // ended the search for that conversation permanently. The hunt now proves it
  // can read a candidate before calling it a transcript (google-transcript.ts),
  // so reaching this line means there are words; and a meeting whose transcript
  // could not be read stays unclaimed and is tried again next time.
  const words = capToRow(found.text)

  // THE CLAIM, AND IT IS THE WHOLE OF THE IDEMPOTENCE. Everything below happens
  // exactly once because this statement moves exactly one row exactly once. It
  // used to tick a `held` status in the same breath; that clause is gone with
  // the concept and the predicate is untouched, which is the point — the claim
  // was never on the status, so a second import still writes no second set of
  // work logs and cannot double anybody's hours.
  const now = new Date().toISOString()
  const claimed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE meetings SET transcript_file_id = ?, transcript_captured_at = ?, transcript_text = ?,
        transcript_note = ?, transcript_url = ?, transcript_found_by = ?,
        updated_at = ?, editor_id = ?, editor_email = ?, editor_name = ?
      WHERE id = ? AND transcript_captured_at IS NULL RETURNING id`,
    [
      found.fileId,
      now,
      words.text,
      words.note,
      found.url,
      found.foundBy,
      now,
      actor.id,
      actor.email,
      actor.name,
      id,
    ]
  )
  if (!claimed[0]) return nothing("The transcript for this meeting has already been read.")

  // A WORK LOG PER PARTICIPANT — ours only (9.2), marked as meeting time (9.3).
  // The duration is the meeting's own: an hour in the diary is an hour off the
  // day, and inventing a finer figure out of a transcript's timestamps would be
  // inventing a fact. A meeting with no end runs the default hour.
  const staff = await ourStaffAmong(env, guard.teamId, event.attendees.map((a) => a.email))
  const endsAt = meeting.endsAt ?? new Date(Date.parse(meeting.startsAt) + DEFAULT_MEETING_MS).toISOString()
  const seconds = Math.max(0, Math.round((Date.parse(endsAt) - Date.parse(meeting.startsAt)) / 1000))
  for (const person of staff)
    await d1ExecScript(
      cfg,
      guard.databaseId,
      `INSERT INTO work_logs (id, account_id, target_table, target_id, user_id, user_name, kind, note,
         started_at, ended_at, seconds, billable, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(ulid())}, ${sqlString(meeting.accountId)}, 'meetings', ${sqlString(id)}, ${sqlString(person.userId)}, ${sqlString(person.name)}, ${sqlString(MEETING_LOG_KIND)}, ${sqlString(`In "${meeting.title}"`)}, ${sqlString(meeting.startsAt)}, ${sqlString(endsAt)}, ${seconds}, 1, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
    )

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Meeting transcript read",
    description: `${actor.name} read the transcript of "${meeting.title}", and ${staff.length} ${
      staff.length === 1 ? "person's time was" : "people's time was"
    } logged`,
    relatedTable: "meetings",
    relatedRowId: id,
  })
  return {
    captured: true,
    fileId: found.fileId,
    fileName: found.name,
    foundBy: found.foundBy,
    logsWritten: staff.length,
    // The one note worth carrying up: a transcript longer than a row may hold
    // was CUT, and the person is told so rather than left to discover that the
    // assistant only knows the first half of the conversation.
    note: words.note,
  }
}

/* ------------- the calendar, read into the diary. ONE WAY -------------------- */
//
// THE DIRECTION IS THE DESIGN, and the owner settled it on 18 August 2026:
//
//   "Just remember we want a one-way sync of whatever is in Google Calendar,
//    including: meeting notes, Google Docs attached to it, attachments,
//    location. All of that should be synced with the link to the meeting for
//    future and past events all the time. Anything in my calendar should be up
//    to date here. That's all."
//
// So Google's diary is the source and this database is the copy. Nothing below
// writes to a calendar and there is no function left in lib/google-api.ts that
// could. The sweep does three things:
//
//   • CREATES — an entry with no record yet becomes one, including one in the
//     PAST, which is how a freshly connected calendar gets last week's stand-up
//     and therefore last week's transcript. There is no test on WHICH entries
//     qualify beyond "it has not already been called off": his instruction is
//     not a narrower rule, it is the absence of one. (It used to be `if
//     (!event.recurringEventId) continue`, which on his own calendar meant 21
//     recurring rows and 0 one-offs, so a real client meeting read back
//     perfectly from Google and never appeared in the diary.)
//   • REFRESHES — every meeting whose entry is in the window has its `google_*`
//     mirror rewritten: the description, the location, the guest list and what
//     each person answered, the organiser, the join link, the attachments (which
//     is where an attached Google Doc lives), the zone, the repeat rule, and the
//     link back to the entry in Google Calendar.
//   • RETIRES — an entry cancelled in Google cancels the meeting here, which is
//     a fact only visible on request (a cancelled instance simply stops being
//     returned, which is indistinguishable from the window having moved past it
//     — hence `showDeleted`).
//
// ── HOW IT REACHES "ANYTHING IN MY CALENDAR" WITHOUT AN UNBOUNDED READ ───────
//
// Two windows, and they are two different jobs.
//
// THE LIVE WINDOW is swept on EVERY call: a fortnight back to four weeks on. It
// is what makes the diary current, and the backward half is why transcripts land
// at all — everything interesting about a meeting arrives AFTER it (the
// transcript, the recording, the notes doc somebody attaches walking back to
// their desk), so a sweep that only looked forward saw each meeting exactly once,
// at the moment when the least was known about it.
//
// THE BACKFILL is one SLICE of the wider window per call, from a cursor kept on
// the caller's own calendar connection. It walks FORWARD, monotonically, from
// five years ago to a year ahead. Forward-only is the whole safety of it: a
// single frontier cannot leave a gap behind it, where a pair of frontiers
// crawling outwards from today can and does the first time a slice truncates.
// And when a slice DOES truncate — more entries in ninety days than one bounded
// read will walk — the cursor advances only to the last entry actually read, so
// the next call resumes inside the same slice instead of stepping over the tail.
//
// That is R14 honoured rather than dodged: every call is bounded, and "the whole
// calendar" is reached by repetition rather than by one enormous read. A five-
// year history is about twenty-four slices, so a person who opens Meetings a few
// times has their whole diary; and once the cursor reaches the ceiling it simply
// keeps pace with it, a slice at a time, for ever.
//
// WHOSE WORDS WIN. A meeting typed in kwapso keeps kwapso's title, times and
// place; a meeting read IN off a diary takes Google's. That is `from_calendar`,
// decided once at insert. `notes` is never touched by any sync — it is the one
// column here that only a person writes.
//
// IDEMPOTENT, AND CHEAPLY (R17). Google stamps every entry with `updated`. An
// entry whose stamp has not moved since we last mirrored it is skipped entirely
// — no statement, no activity row, no ping — rather than being compared field by
// field or rewritten identically. That is also exactly the signal this needs:
// attaching a transcript to an event IS an edit of the event, so the one stamp
// that says "look again" is the one that moves when a transcript lands.

/** How far ahead a calendar entry becomes a real record IN THE LIVE WINDOW. Four
 * weeks, so there is a month to prepare (Aurora's tk3). Entries beyond it are
 * still reached — by the backfill, a slice at a time — so this is now "how soon
 * it is certainly a record" rather than "how far we ever look". */
const SERIES_HORIZON_DAYS = 28

/** WHAT TO CALL AN ENTRY THAT NEVER GOT A NAME. Said once because the insert and
 * the refresh both need it and a row whose title changed on its second sync
 * would look like somebody had renamed it. */
function titleOf(event: CalendarEvent): string {
  return event.summary || "A meeting with no title"
}

/** HOW FAR BACK THE LIVE WINDOW RE-READS, ON EVERY CALL.
 *
 * Two weeks. The owner's own reason sets the floor — "all transcripts will
 * always come in a few minutes or an hour after the event is over" — so a day
 * would technically do for the transcript itself. It is longer than that for the
 * things that arrive on a human timescale rather than a machine one: the notes
 * doc a colleague attaches on Monday about Friday's call, the guest who finally
 * accepts, the room that changed. A fortnight covers a holiday weekend and a
 * week off; re-reading a quarter on every single call would be paying for
 * meetings nobody will touch again, for ever. Everything older is the backfill's,
 * which reaches it once and then leaves it alone. */
const CATCH_UP_DAYS = 14

/** HOW FAR BACK "EVERYTHING IN MY CALENDAR" REACHES. Five years, chosen against
 * the thing being read rather than against a round number: kwapso's own history
 * before this app is two years of Glide (glide/RECONCILIATION.md), and an agency
 * diary older than five years is not a record anybody is going to ask a question
 * about. It is a FLOOR, not a promise about Google — a calendar that starts three
 * years ago simply runs out of entries and the walk finishes early. */
const BACKFILL_YEARS_BACK = 5

/** …AND HOW FAR FORWARD. A year, because that is where a real diary stops: an
 * annual review booked next spring is a real appointment, and a weekly stand-up
 * repeating for ever would otherwise hand back an infinite series. */
const BACKFILL_DAYS_AHEAD = 365

/** ONE SLICE OF THE BACKFILL. Ninety days per call, so five years is about
 * twenty-four calls. Big enough that a person who opens Meetings a handful of
 * times has their history; small enough that one slice of one quiet quarter is
 * one or two Google reads. When a slice holds more entries than a bounded read
 * will walk, the cursor stops at the last one read (see `syncCalendar`), so a
 * busy quarter takes several calls and loses nothing. */
const BACKFILL_SLICE_DAYS = 90

/** One instance of a repeating entry that is NOT yet a record — read-only, and
 * shown so nobody is surprised by it. */
export type AheadOfUs = {
  eventId: string
  title: string
  startsAt: string
  url: string | null
}

/** What one sweep did, in the three verbs above — plus where the backfill has
 * got to, which is the one fact a person needs to know whether "everything" is
 * everything yet. */
export type CalendarSync = {
  created: number
  updated: number
  cancelled: number
  ahead: AheadOfUs[]
  /** the moment the resumable walk has read up to, or null when there is no
   * connection row to keep a cursor on. */
  swept: string | null
  /** true once the walk has reached the far end of the wide window: from here on
   * it only has to keep pace with the calendar rather than catch up with it. */
  caughtUp: boolean
}

/** THE MIRROR, AS COLUMNS. One place that turns a Google event into the
 * `google_*` half of a meeting row, so the insert and the refresh below can
 * never write two different versions of the same fact. */
function mirrorOf(event: CalendarEvent, at: string): string {
  return `google_event_id = ${sqlString(event.id)},
    google_event_url = ${sqlString(event.url)},
    google_join_url = ${sqlString(event.joinUrl)},
    google_organizer = ${sqlString(event.organizer.email || null)},
    google_attendees_json = ${sqlString(JSON.stringify(event.attendees))},
    google_attachments_json = ${sqlString(JSON.stringify(event.attachments))},
    google_status = ${sqlString(event.status || null)},
    google_recurrence = ${sqlString(event.recurrence.join("\n") || null)},
    google_time_zone = ${sqlString(event.timeZone || null)},
    google_updated_at = ${sqlString(event.updatedAt)},
    google_synced_at = ${sqlString(at)},
    recurring_event_id = ${sqlString(event.recurringEventId || null)}`
}

/** What a row has to say for itself before the sweep decides whether to touch
 * it. Deliberately six columns and not the whole meeting: the sweep asks two
 * questions — has Google moved since we looked, and whose words are these — and
 * reading a page of full meetings to answer them would be paying for the notes
 * of every meeting in a fortnight. */
type SyncedRow = {
  id: string
  google_event_id: string
  google_updated_at: string | null
  google_synced_at: string | null
  from_calendar: number | null
  deactivated_at: string | null
}

/**
 * BRING THE CALENDAR INTO STEP — see the essay above for what that now means.
 *
 * IDEMPOTENT BY THE INDEX for the creates, not by a check: `idx_meetings_event`
 * is unique on `google_event_id`, so an instance that already has a record
 * cannot get a second one however many times this runs.
 *
 * EVERY ENTRY IN THE WINDOW BECOMES A RECORD. It used to be the repeating ones
 * alone; the essay above this function is the bug report that changed it and the
 * owner's sentence that settled it. An entry that is ALREADY a record here
 * (somebody pushed it out from kwapso) is refreshed whatever it looks like,
 * because that is a meeting we own and Google has facts about it.
 */
export async function syncCalendar(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor
): Promise<CalendarSync> {
  const { token, connectionId } = await accessTokenFor(env, cfg, guard, "calendar")
  const now = new Date()
  const since = new Date(now.getTime() - CATCH_UP_DAYS * 24 * 60 * 60 * 1000)
  const horizon = new Date(now.getTime() + SERIES_HORIZON_DAYS * 24 * 60 * 60 * 1000)
  // WHERE THE WIDE WALK HAS GOT TO. Read before the calendar so that all four
  // reads below can go out together.
  const cursor = await backfillCursor(cfg, guard, connectionId, now)
  // FOUR READS, AND THE FIRST TWO ARE SEPARATE FOR A REASON THAT COST A BUG.
  //
  // The obvious shape is ONE read from `since` to `horizon`, straddling today.
  // It is wrong, and silently: every Google list here asks for one page of
  // GOOGLE_PAGE_SIZE entries ordered by start time, so a six-week window over a
  // busy diary returns the OLDEST fifty and stops. On a real calendar read while
  // building this — ten entries in two days — fifty events is about a week, so
  // the single-window version would have spent its whole page on the past and
  // never reached tomorrow. Repeating meetings would quietly stop being created,
  // and nothing would report an error: the sweep would succeed, every time,
  // doing half its job.
  //
  // So the past and the future get a page each. They are asking two different
  // questions anyway — what has FINISHED and might have grown a transcript, and
  // what is COMING and might need a record — and giving each its own page is
  // what makes both answers complete.
  //
  // ALL THREE OF THE FIRST READS ASK FOR CANCELLED ENTRIES, because a
  // cancellation is a fact only ever visible on request (see calendarList): with
  // `singleEvents=true` a cancelled instance is not returned at all unless it is
  // asked for, which is indistinguishable from the window having moved past it.
  //
  // THE THIRD IS THE BACKFILL SLICE — one bounded step of the walk that makes
  // "anything in my calendar" true. It is an ordinary window like the other two;
  // the only thing that makes it a walk is the cursor it starts from and the one
  // it leaves behind.
  //
  // The fourth read is what to SHOW rather than what to make — the instances
  // beyond the live horizon. Deliberately short: "there is a stand-up every
  // Monday for ever" is not information.
  const [past, future, slice, beyond] = await Promise.all([
    calendarList(token, { from: since.toISOString(), to: now.toISOString(), showDeleted: true }),
    calendarList(token, { from: now.toISOString(), to: horizon.toISOString(), showDeleted: true }),
    cursor
      ? calendarList(token, { from: cursor.from, to: cursor.to, showDeleted: true })
      : Promise.resolve({ events: [], truncated: false }),
    calendarList(token, {
      from: horizon.toISOString(),
      to: new Date(horizon.getTime() + SERIES_HORIZON_DAYS * 2 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  ])
  // ONE PASS OVER ALL THREE, de-duplicated by event id: the backfill slice can
  // overlap the live window (it walks through today on its way to the ceiling),
  // and treating one entry twice in one sweep would count one create as two.
  const inWindow = [...new Map(
    [...past.events, ...future.events, ...slice.events].map((e) => [e.id, e])
  ).values()]

  // WHICH OF THESE WE ALREADY HAVE. One read for the whole window rather than a
  // lookup per event.
  //
  // THE ARITHMETIC MATTERS AND IS SAID OUT LOUD, because the cap below is not a
  // decoration: three calendar reads feed `inWindow` (past, future, backfill
  // slice) and each is bounded by CALENDAR_MAX_PAGES × GOOGLE_PAGE_SIZE = 250,
  // so the `IN` list is at most 750 ids and the answer at most 750 rows —
  // comfortably under LIST_HARD_CAP (1,000). That headroom is what makes the
  // LIMIT a safety net rather than a silent truncation: a `known` map missing a
  // row would make the loop below try to INSERT a meeting that already exists
  // and hit the unique index. A FOURTH window feeding `inWindow` would cross
  // 1,000 and would need this read paged instead.
  const known = new Map<string, SyncedRow>()
  if (inWindow.length) {
    const rows = await d1Query<SyncedRow>(
      cfg,
      guard.databaseId,
      // R14: bounded by the three calendar reads that produced the ids — see above.
      `SELECT id, google_event_id, google_updated_at, google_synced_at, from_calendar, deactivated_at
         FROM meetings
        WHERE google_event_id IN (${inWindow.map((e) => sqlString(e.id)).join(", ")})
        LIMIT ${LIST_HARD_CAP}`
    )
    for (const r of rows) known.set(r.google_event_id, r)
  }

  const at = new Date().toISOString()
  let created = 0
  let updated = 0
  let cancelled = 0

  for (const event of inWindow) {
    const row = known.get(event.id)

    if (!row) {
      // Everything the diary holds becomes a record — see the essay above for
      // why there is no second test here any more — except an entry that was
      // already called off, which would be a meeting put in the diary purely in
      // order to cancel it.
      if (event.status === "cancelled") continue
      const id = ulid()
      await d1ExecScript(
        cfg,
        guard.databaseId,
        // `status` and `held_at` are not named. A meeting brought in from the
        // past used to arrive already ticked `held`; the tick meant nothing to
        // anybody the moment the start time became the answer, and writing it
        // would be writing a column nothing reads.
        `INSERT INTO meetings (id, title, agenda, location, starts_at, ends_at,
           recurring_event_id, from_calendar,
           google_event_id, google_event_url, google_join_url, google_organizer,
           google_attendees_json, google_attachments_json, google_status, google_recurrence,
           google_time_zone, google_updated_at, google_synced_at,
           created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(titleOf(event))}, ${sqlString(event.description || null)}, ${sqlString(event.location || null)}, ${sqlString(event.start)}, ${sqlString(event.end || null)}, ${sqlString(event.recurringEventId || null)}, 1, ${sqlString(event.id)}, ${sqlString(event.url)}, ${sqlString(event.joinUrl)}, ${sqlString(event.organizer.email || null)}, ${sqlString(JSON.stringify(event.attendees))}, ${sqlString(JSON.stringify(event.attachments))}, ${sqlString(event.status || null)}, ${sqlString(event.recurrence.join("\n") || null)}, ${sqlString(event.timeZone || null)}, ${sqlString(event.updatedAt)}, ${sqlString(at)}, ${sqlString(at)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
      )
      created++
      continue
    }

    // CALLED OFF IN GOOGLE → called off here, once. The predicate rides the
    // UPDATE (R17), so a sweep that runs every hour over a fortnight of
    // cancelled entries writes nothing after the first one.
    if (event.status === "cancelled") {
      const moved = await d1Query<{ id: string }>(
        cfg,
        guard.databaseId,
        `UPDATE meetings SET deactivated_at = ?, deactivator_id = ?, deactivator_email = ?,
            deactivator_name = ?, google_status = 'cancelled', google_updated_at = ?, google_synced_at = ?,
            updated_at = ?
          WHERE id = ? AND deactivated_at IS NULL RETURNING id`,
        [at, actor.id, actor.email, actor.name, event.updatedAt, at, at, row.id]
      )
      if (moved[0]) cancelled++
      continue
    }

    // NOTHING MOVED AT GOOGLE'S END. The stamp is the whole comparison — see the
    // essay above for why it is also the right one for a late-arriving
    // transcript. A row that has never been mirrored is always due.
    if (row.google_synced_at && row.google_updated_at && row.google_updated_at === event.updatedAt) continue

    // Google's words for a row Google authored; only the mirror for one of ours.
    const ownWords =
      row.from_calendar === 1
        ? `, title = ${sqlString(titleOf(event))},
             starts_at = ${sqlString(event.start)},
             ends_at = ${sqlString(event.end || null)},
             location = ${sqlString(event.location || null)},
             agenda = ${sqlString(event.description || null)}`
        : ""
    await d1ExecScript(
      cfg,
      guard.databaseId,
      `UPDATE meetings SET ${mirrorOf(event, at)}${ownWords} WHERE id = ${sqlString(row.id)};`
    )
    updated++
  }

  // THE CURSOR MOVES LAST, and only over ground this call actually covered.
  // Advancing it before the writes would step over a slice a failed request
  // never read, and a gap in a forward-only walk never closes.
  const swept = cursor ? await advanceBackfill(cfg, guard, connectionId, cursor, slice) : null

  // ONE HISTORY LINE FOR THE WHOLE SWEEP, and only when it did something. A row
  // per refreshed meeting would bury a person's own edits under a machine's
  // bookkeeping — the activity feed is a record of what PEOPLE did, and "the
  // guest list on Tuesday's stand-up now says Ana accepted" is not that.
  if (created + updated + cancelled > 0)
    await logActivity(cfg, guard.databaseId, actor, {
      type: "Calendar brought into step",
      description: `${actor.name} brought the calendar into step, ${[
        created ? `${created} new ${created === 1 ? "meeting" : "meetings"}` : "",
        updated ? `${updated} brought up to date` : "",
        cancelled ? `${cancelled} called off` : "",
      ]
        .filter(Boolean)
        .join(", ")}`,
      relatedTable: "meetings",
    })

  return {
    created,
    updated,
    cancelled,
    // Read-only, and shown as such: these are entries the live window has not
    // reached yet. They are not a promise that nothing was stored — the backfill
    // slice may well have made records of some of them on its way past, and a
    // second call will show a shorter list for exactly that reason.
    ahead: beyond.events
      .filter((e) => e.status !== "cancelled")
      .map((e) => ({ eventId: e.id, title: titleOf(e), startsAt: e.start, url: e.url })),
    swept,
    caughtUp: swept !== null && Date.parse(swept) >= backfillCeiling(now).getTime(),
  }
}

/* ---------------- the resumable walk over the WHOLE calendar --------------- */

/** WHERE THE WALK STOPS. Today plus a year, recomputed on every call so it moves
 * with the clock — once the cursor has caught up, "keep pace" and "catch up" are
 * the same code doing less work. */
function backfillCeiling(now: Date): Date {
  return new Date(now.getTime() + BACKFILL_DAYS_AHEAD * 24 * 60 * 60 * 1000)
}

/** THE SLICE THIS CALL WILL READ, or null when there is nothing left to walk (or
 * nowhere to keep a cursor). `from` is where the last call stopped; a connection
 * that has never been swept starts at the floor, five years back. */
async function backfillCursor(
  cfg: D1Rest,
  guard: MemberGuard,
  connectionId: string,
  now: Date
): Promise<{ from: string; to: string } | null> {
  if (!connectionId) return null
  const rows = await d1Query<{ calendar_swept_through: string | null }>(
    cfg,
    guard.databaseId,
    // R14: one row by primary key.
    "SELECT calendar_swept_through FROM google_connections WHERE id = ? LIMIT 1",
    [connectionId]
  )
  if (!rows[0]) return null
  const floor = new Date(now.getTime() - BACKFILL_YEARS_BACK * 365 * 24 * 60 * 60 * 1000)
  const parsed = Date.parse(rows[0].calendar_swept_through ?? "")
  // A cursor that is unreadable, or older than the floor because the floor moved
  // with the clock, is the floor. Reading a bad value as "start again" is the
  // safe direction: it costs repeated work, never a gap.
  const from = Number.isFinite(parsed) && parsed > floor.getTime() ? new Date(parsed) : floor
  const ceiling = backfillCeiling(now)
  if (from.getTime() >= ceiling.getTime()) return null
  const to = new Date(Math.min(from.getTime() + BACKFILL_SLICE_DAYS * 24 * 60 * 60 * 1000, ceiling.getTime()))
  return { from: from.toISOString(), to: to.toISOString() }
}

/** MOVE THE CURSOR, honestly.
 *
 * A slice that came back WHOLE has been read, so the cursor goes to the end of
 * it. A slice that was TRUNCATED has not: Google returned entries in start
 * order and stopped, so the cursor goes to the START OF THE LAST ENTRY WE READ
 * and the next call resumes there. That re-reads one entry — which costs a
 * skipped write, because its `updated` stamp has not moved — and skips none.
 *
 * The one degenerate case is a truncated slice whose last entry starts no later
 * than the cursor already sits (a quarter of a million entries at one instant).
 * The walk takes the slice end rather than standing still for ever, because a
 * cursor that cannot move is a sweep that never reaches tomorrow; `calendarList`
 * has already shouted about the truncation in the log. */
async function advanceBackfill(
  cfg: D1Rest,
  guard: MemberGuard,
  connectionId: string,
  cursor: { from: string; to: string },
  slice: { events: CalendarEvent[]; truncated: boolean }
): Promise<string> {
  let next = cursor.to
  if (slice.truncated) {
    const last = slice.events[slice.events.length - 1]
    const at = Date.parse(last?.start ?? "")
    if (Number.isFinite(at) && at > Date.parse(cursor.from)) next = new Date(at).toISOString()
  }
  await d1Query(
    cfg,
    guard.databaseId,
    "UPDATE google_connections SET calendar_swept_through = ? WHERE id = ?",
    [next, connectionId]
  )
  return next
}

/* --------------- the two reads the meeting DETAIL screen makes ------------- */

/** The transcript's own words, off the row. Null when there is no such meeting;
 * a meeting with nothing captured yet answers with empty text and a null stamp,
 * which is a different sentence from "that meeting doesn't exist" and the screen
 * says a different thing for each. */
export async function readTranscript(
  cfg: D1Rest,
  guard: MemberGuard,
  id: string
): Promise<{
  text: string
  note: string | null
  url: string | null
  foundBy: string | null
  capturedAt: string | null
} | null> {
  const rows = await d1Query<{
    transcript_text: string | null
    transcript_note: string | null
    transcript_url: string | null
    transcript_found_by: string | null
    transcript_captured_at: string | null
  }>(
    cfg,
    guard.databaseId,
    // R14: one row by primary key.
    `SELECT transcript_text, transcript_note, transcript_url, transcript_found_by, transcript_captured_at
       FROM meetings WHERE id = ? LIMIT 1`,
    [id]
  )
  const row = rows[0]
  if (!row) return null
  return {
    text: row.transcript_text ?? "",
    note: row.transcript_note,
    url: row.transcript_url,
    foundBy: row.transcript_found_by,
    capturedAt: row.transcript_captured_at,
  }
}

/**
 * WHICH OF THESE ADDRESSES DO WE KNOW — one of our own people, or a contact on
 * one of our accounts.
 *
 * TWO DATABASES, and that is why this is one function rather than a join. Our
 * members live in the GLOBAL core database (a team's own database has no users
 * table, which is the same reason `staff_profiles.user_id` carries no foreign
 * key); the accounts live in the team's. So the addresses are asked of each in
 * turn and the two answers are merged onto one line per person.
 *
 * A CONTACT RESOLVES TO ITS PARENT, exactly as the mail fence does: Marta — a
 * person account sitting under Bergman — is BERGMAN's contact, and naming Marta
 * would send a reader to a record that is not the client they meant. The rule
 * lives in two places because the two reads are for two different purposes, and
 * lib/google-read.ts's `knownContacts` says the whole of it.
 *
 * BOTH HALVES CAN BE NULL and usually one of them is. Most addresses on most
 * invitations are neither a colleague nor a client, and a screen that implies
 * otherwise is a screen inventing relationships.
 */
export async function linkGuests(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  emails: string[]
): Promise<MeetingPersonLink[]> {
  const list = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
  if (!list.length) return []
  // Bounded by the guest list that produced it (EVENT_ATTENDEE_CAP is 50), which
  // keeps both statements under D1's bound-parameter ceiling with room to spare.
  const placeholders = list.map(() => "?").join(", ")
  const [members, contacts] = await Promise.all([
    env.DB.prepare(
      `SELECT LOWER(u.email) AS email, u.id, u.first_name, u.last_name FROM users u
         JOIN team_members tm ON tm.user_id = u.id
        WHERE tm.team_id = ? AND tm.deactivated_at IS NULL AND LOWER(u.email) IN (${placeholders})`
    )
      .bind(guard.teamId, ...list)
      .all<{ email: string; id: string; first_name: string | null; last_name: string | null }>(),
    d1Query<{ email: string; account_id: string; account_name: string | null }>(
      cfg,
      guard.databaseId,
      // R14: bounded by the named address list above. GROUPED for the same
      // reason `knownContacts` is — two contact rows can share one address, and
      // a row per duplicate would put the same person on the screen twice.
      //
      // THE PARENT IS RESOLVED BY A SELF-JOIN, in this one statement, rather
      // than by a second read of the ids this one produced. That was the first
      // shape and the parameter-cap suite refused it, correctly: a second `IN`
      // list built from the answer to the first is a placeholder count nothing
      // in the source bounds, however small it happens to be in practice.
      //
      // `min(...)` is what makes the two bare columns deterministic: SQLite
      // takes them from the row that produced the minimum, so the name and the
      // id are always the same account rather than two arbitrary rows of a
      // group.
      `SELECT LOWER(c.email) AS email,
              min(COALESCE(p.id, c.id)) AS account_id,
              COALESCE(p.name, c.name) AS account_name
         FROM accounts c LEFT JOIN accounts p ON p.id = c.parent_account_id
        WHERE c.email IS NOT NULL AND LOWER(c.email) IN (${placeholders})
        GROUP BY LOWER(c.email) LIMIT ${LIST_HARD_CAP}`,
      list
    ),
  ])
  const memberBy = new Map(
    (members.results ?? []).map((r) => [
      r.email,
      { id: r.id, name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email },
    ])
  )
  const contactBy = new Map(contacts.map((c) => [c.email, c]))

  return list.map((email) => {
    const member = memberBy.get(email) ?? null
    const contact = contactBy.get(email) ?? null
    return {
      email,
      memberUserId: member?.id ?? null,
      memberName: member?.name ?? null,
      accountId: contact?.account_id ?? null,
      accountName: contact?.account_name ?? null,
    }
  })
}
