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
import { accessTokenFor, listNamedSources } from "./google"
import { calendarGet, calendarList, driveList } from "./google-api"
import { MEETING_LOG_KIND } from "./work-logs"
import type { Env } from "../env"

/** How long a meeting with no finish time is assumed to run — the same hour the
 * calendar push assumes when it creates the entry, said once so a work log and a
 * diary entry can never disagree about the length of the same conversation. */
const DEFAULT_MEETING_MS = 60 * 60 * 1000
import { ulid } from "@shared/workers/id"
import { LIST_HARD_CAP } from "@shared/workers/limits"
import { decodeCursor, keysetAfter, PAGE_SIZE, toPage, type Page } from "@shared/workers/paging"
import { optionalMoment, optionalText, requireMoment, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import type { Meeting } from "@shared/types"

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
  status: string
  held_at: string | null
  google_event_id: string | null
  google_event_url: string | null
  transcript_file_id: string | null
  transcript_captured_at: string | null
  recurring_event_id: string | null
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
  m.starts_at, m.ends_at, m.status, m.held_at, m.google_event_id, m.google_event_url,
  m.transcript_file_id, m.transcript_captured_at, m.recurring_event_id,
  m.created_at, m.creator_name, m.updated_at, m.editor_name, m.deactivated_at,
  (SELECT a.name FROM accounts a WHERE a.id = m.account_id) AS account_name,
  (SELECT ap.name FROM apps ap WHERE ap.id = m.app_id) AS app_name,
  (SELECT p.name FROM meeting_purposes p WHERE p.id = m.purpose_id) AS purpose_name`

/** The sort a meeting list is keyed by: when it is / was, newest first. A diary
 * read backwards is what somebody wants — the thing that just happened is the
 * thing they are looking for — and the future sits at the top where it belongs. */
const MEETING_ORDER = "m.starts_at"

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
    // Anything that is not the one other word is `scheduled`. A status column is
    // read from a database that has had a migration run against it, so the read
    // decides rather than trusting — the same shape lib/tasks.ts uses.
    status: r.status === "held" ? "held" : "scheduled",
    heldAt: r.held_at,
    googleEventId: r.google_event_id,
    googleEventUrl: r.google_event_url,
    transcriptFileId: r.transcript_file_id,
    transcriptCapturedAt: r.transcript_captured_at,
    recurringEventId: r.recurring_event_id,
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
  status?: string
  /** 'upcoming' (the default view) hides what has already been held; 'week' is
   * the week we are in, past and upcoming both (9.1); 'all' shows the lot,
   * cancelled ones included. */
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
  if (filter.view === "upcoming") where.push("m.status <> 'held'")
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
  if (filter.status) {
    where.push("m.status = ?")
    params.push(filter.status)
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
  cursor: string | null
): Promise<Page<Meeting>> {
  const base = whereFor(filter)
  const after = keysetAfter(decodeCursor(cursor), MEETING_ORDER)
  const params = [...base.params, ...after.params]
  const rows = await d1Query<MeetingRow>(
    cfg,
    guard.databaseId,
    `SELECT ${MEETING_COLS} FROM meetings m
      WHERE ${base.sql}${after.sql ? ` AND ${after.sql}` : ""}
      ORDER BY ${MEETING_ORDER} DESC, m.id DESC LIMIT ${PAGE_SIZE + 1}`,
    params
  )
  return toPage(rows.map(toMeeting), PAGE_SIZE, (m) => [m.startsAt, m.id])
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
    `INSERT INTO meetings (id, ref, account_id, app_id, purpose_id, title, agenda, notes, location,
        starts_at, ends_at, status, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(ref)}, ${sqlString(v.accountId)}, ${sqlString(v.appId)}, ${sqlString(v.purposeId)},
        ${sqlString(v.title)}, ${sqlString(v.agenda)}, ${sqlString(v.notes)}, ${sqlString(v.location)},
        ${sqlString(v.startsAt)}, ${sqlString(v.endsAt)}, 'scheduled',
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
    description: `${actor.name} updated "${v.title}"${changes ? ` — ${changes}` : ""}`,
    relatedTable: "meetings",
    relatedRowId: id,
  })
  return { accountId: v.accountId }
}

/** Mark a meeting held, or put it back in the diary.
 *
 * R17: the current-status predicate rides the UPDATE, so marking a held meeting
 * held moves zero rows — no second history line, no ping. */
export async function setMeetingHeld(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  held: boolean
): Promise<{ moved: boolean; accountId: string | null }> {
  const before = await meetingOrThrow(cfg, guard, id)
  const now = new Date().toISOString()
  const status = held ? "held" : "scheduled"
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE meetings SET status = ?, held_at = ?, updated_at = ?, editor_id = ?, editor_email = ?, editor_name = ?
      WHERE id = ? AND status <> ? RETURNING id`,
    [status, held ? now : null, now, actor.id, actor.email, actor.name, id, status]
  )
  if (!changed[0]) return { moved: false, accountId: before.accountId }
  await logActivity(cfg, guard.databaseId, actor, {
    type: held ? "Meeting held" : "Meeting back in the diary",
    description: `${actor.name} marked "${before.title}" as ${held ? "held" : "still to come"}`,
    relatedTable: "meetings",
    relatedRowId: id,
  })
  return { moved: true, accountId: before.accountId }
}

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

/**
 * REMEMBER THE CALENDAR ENTRY THIS MEETING BECAME.
 *
 * The write half of "a meeting booked in kwapso appears in Google Calendar".
 * It is a CLAIM, not an overwrite: the predicate `google_event_id IS NULL` rides
 * the UPDATE, so two tabs pressing the button at the same instant produce one
 * winner and one caller who is told to use the entry that already exists. The
 * unique partial index behind it is the second lock (CONCURRENCY rule 2).
 *
 * Returns false when the row already had an entry — the door then answers with
 * the one it has rather than making a second copy of the same meeting in
 * somebody's diary.
 */
export async function claimCalendarEvent(
  cfg: D1Rest,
  guard: MemberGuard,
  id: string,
  event: { id: string; url: string | null }
): Promise<boolean> {
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE meetings SET google_event_id = ?, google_event_url = ?, updated_at = ?
      WHERE id = ? AND google_event_id IS NULL RETURNING id`,
    [event.id, event.url, new Date().toISOString(), id]
  )
  return Boolean(changed[0])
}

/* ------------------ the transcript, and what it sets off ------------------- */
//
// CHECKLIST 9.4 AND 9.2, AND THEY ARE ONE ACT. "Meeting held" ticks itself when
// a transcript arrives, and the same arrival writes a work log per participant.
// Two asks, one moment, one door — because a transcript existing is the ONLY
// evidence the app ever gets that a conversation actually happened, and making
// somebody press two buttons about the same fact is how the second one stops
// being pressed.
//
// OUR OWN STAFF ONLY (Aurora's tk1, over the owner's "every participant"). A
// client's hour is not our cost, and a work log is a cost record. So the
// attendee list off the calendar entry is INTERSECTED with the team's own
// members — an address we do not employ produces nothing at all, silently and
// correctly. It also means the door cannot be used to invent a person: every
// log it writes points at a `user_id` that is already a member of this team.
//
// IDEMPOTENT, AND THAT IS THE HARD PART. Reading a transcript twice must not
// tick "held" twice, write a second set of logs, or double the hours in a
// margin. The predicate rides the UPDATE that CLAIMS the transcript
// (`transcript_captured_at IS NULL`), so the claim is what is raced for — zero
// rows changed means somebody else got there and this call writes nothing (R17
// for a job rather than a status).

/** The two facts a captured transcript leaves on the row. */
export type TranscriptCapture = {
  captured: boolean
  fileId: string | null
  fileName: string | null
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
 * The search is the one `GET …/calendar/event/transcript` already does and it is
 * not widened here: only the Drive folders this person has NAMED are looked in,
 * the meeting's title first and its Meet code second. A person who has not
 * shared the folder their transcripts land in gets an honest sentence rather
 * than kwapso reading their whole Drive. */
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
    logsWritten: 0,
    note,
  })
  if (!meeting.googleEventId)
    return nothing("This meeting isn't in a calendar yet, so there's nowhere to look for a transcript.")
  if (meeting.transcriptCapturedAt)
    return nothing("The transcript for this meeting has already been read.")

  const { token: calendarToken } = await accessTokenFor(env, cfg, guard, "calendar")
  const event = await calendarGet(calendarToken, meeting.googleEventId)
  const folders = (await listNamedSources(cfg, guard, "drive")).filter((s) => s.active).map((s) => s.externalId)
  if (folders.length === 0)
    return nothing("No Drive folder is shared, so there's nowhere to look for the transcript.")

  const { token: driveToken } = await accessTokenFor(env, cfg, guard, "drive")
  let found: { id: string; name: string } | null = null
  for (const term of [event.summary, event.meetingCode].filter(Boolean)) {
    const hits = (await driveList(driveToken, folders, term as string))
      .filter((f) => /transcript/i.test(f.name))
      .sort((a, b) => (b.modifiedTime ?? "").localeCompare(a.modifiedTime ?? ""))
    if (hits[0]) {
      found = { id: hits[0].id, name: hits[0].name }
      break
    }
  }
  if (!found) return nothing("No transcript for this meeting in the folders you've shared.")

  // THE CLAIM. Everything below happens exactly once because this statement
  // moves exactly one row exactly once — and it ticks "held" in the same breath
  // (9.4), so the status and the evidence for it can never disagree.
  const now = new Date().toISOString()
  const claimed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE meetings SET transcript_file_id = ?, transcript_captured_at = ?, status = 'held',
        held_at = COALESCE(held_at, ?), updated_at = ?, editor_id = ?, editor_email = ?, editor_name = ?
      WHERE id = ? AND transcript_captured_at IS NULL RETURNING id`,
    [found.id, now, now, now, actor.id, actor.email, actor.name, id]
  )
  if (!claimed[0]) return nothing("The transcript for this meeting has already been read.")

  // A WORK LOG PER PARTICIPANT — ours only (9.2), marked as meeting time (9.3).
  // The duration is the meeting's own: an hour in the diary is an hour off the
  // day, and inventing a finer figure out of a transcript's timestamps would be
  // inventing a fact. A meeting with no end runs the default hour, the same one
  // the calendar push assumes.
  const staff = await ourStaffAmong(env, guard.teamId, event.attendees)
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
    description: `${actor.name} read the transcript of "${meeting.title}" — it was marked held and ${
      staff.length
    } ${staff.length === 1 ? "person's time was" : "people's time was"} logged`,
    relatedTable: "meetings",
    relatedRowId: id,
  })
  return { captured: true, fileId: found.id, fileName: found.name, logsWritten: staff.length, note: null }
}

/* ------------------- the repeating entries in a calendar ------------------- */
//
// CHECKLIST 9.7, and it is Aurora's answer over the owner's "read-only always":
// a repeating Google entry becomes a REAL RECORD four weeks ahead, and the
// instances further out are shown read-only until their turn comes.
//
// WHY FOUR WEEKS. There has to be a month to prepare the notes — an agenda
// written the morning of the call is an agenda nobody read. And there has to be
// a horizon at all: a weekly stand-up with no end date is an infinite series,
// and materialising it would be a table that grows for ever with rows nobody
// will ever open.
//
// WHY THE INSTANCES FURTHER OUT ARE NOT ROWS. A record you can edit is a promise
// that the edit means something, and an instance six months out can be moved,
// renamed or cancelled in Google before it ever happens. So it is SHOWN and not
// STORED — the diary tells you it is coming, and the moment it enters the
// window it becomes a record with somewhere to write.

/** How far ahead a repeating entry becomes a real record. Four weeks, so there
 * is a month to prepare (Aurora's tk3). */
const SERIES_HORIZON_DAYS = 28

/** One instance of a repeating entry that is NOT yet a record — read-only, and
 * shown so nobody is surprised by it. */
export type AheadOfUs = {
  eventId: string
  title: string
  startsAt: string
  url: string | null
}

/** BRING THE REPEATING ENTRIES IN. Reads the caller's own calendar to the
 * horizon, makes a record of every repeating instance inside it that does not
 * have one yet, and hands back the ones beyond it so the diary can show them
 * without pretending they are rows.
 *
 * IDEMPOTENT BY THE INDEX, not by a check: `idx_meetings_event` is unique on
 * `google_event_id`, so an instance that already has a record cannot get a
 * second one however many times this runs. The insert is skipped for ids we can
 * already see and the index is the backstop for the race between two people
 * pressing the button at once.
 *
 * ONLY REPEATING ENTRIES. A one-off in somebody's calendar is their own diary,
 * not the agency's record of a client conversation — importing those would turn
 * the meetings module into a copy of one person's Google account. */
export async function syncCalendarSeries(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor
): Promise<{ created: number; ahead: AheadOfUs[] }> {
  const { token } = await accessTokenFor(env, cfg, guard, "calendar")
  const now = new Date()
  const horizon = new Date(now.getTime() + SERIES_HORIZON_DAYS * 24 * 60 * 60 * 1000)
  // Two reads, because they answer two questions: what to MAKE (inside the
  // horizon) and what to SHOW (beyond it, to the end of the quarter). The second
  // is deliberately short — "there is a stand-up every Monday for ever" is not
  // information, and the calendar read is bounded either way.
  const [inWindow, beyond] = await Promise.all([
    calendarList(token, { from: now.toISOString(), to: horizon.toISOString() }),
    calendarList(token, {
      from: horizon.toISOString(),
      to: new Date(horizon.getTime() + SERIES_HORIZON_DAYS * 2 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  ])
  const repeating = inWindow.filter((e) => e.recurringEventId && e.status !== "cancelled")
  const known = new Set<string>()
  if (repeating.length) {
    const rows = await d1Query<{ google_event_id: string }>(
      cfg,
      guard.databaseId,
      // R14: bounded by the calendar read that produced the ids (GOOGLE_PAGE_SIZE).
      `SELECT google_event_id FROM meetings
        WHERE google_event_id IN (${repeating.map((e) => sqlString(e.id)).join(", ")})
        LIMIT ${LIST_HARD_CAP}`
    )
    for (const r of rows) known.add(r.google_event_id)
  }
  const at = new Date().toISOString()
  let created = 0
  for (const event of repeating) {
    if (known.has(event.id)) continue
    const id = ulid()
    await d1ExecScript(
      cfg,
      guard.databaseId,
      `INSERT INTO meetings (id, title, agenda, location, starts_at, ends_at, status,
         google_event_id, google_event_url, recurring_event_id,
         created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(event.summary || "A repeating meeting")}, ${sqlString(event.description || null)}, ${sqlString(event.location || null)}, ${sqlString(event.start)}, ${sqlString(event.end || null)}, 'scheduled', ${sqlString(event.id)}, ${sqlString(event.url)}, ${sqlString(event.recurringEventId)}, ${sqlString(at)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
    )
    created++
  }
  if (created > 0)
    await logActivity(cfg, guard.databaseId, actor, {
      type: "Repeating meetings brought in",
      description: `${actor.name} brought in ${created} repeating ${
        created === 1 ? "meeting" : "meetings"
      } from their calendar`,
      relatedTable: "meetings",
    })
  return {
    created,
    // Read-only, and shown as such: these are not records and nothing may be
    // written against them until they cross the horizon.
    ahead: beyond
      .filter((e) => e.recurringEventId && e.status !== "cancelled")
      .map((e) => ({ eventId: e.id, title: e.summary || "A repeating meeting", startsAt: e.start, url: e.url })),
  }
}
