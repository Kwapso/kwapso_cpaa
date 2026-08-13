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
import { d1ExecScript, d1Query, likeLiteral, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { GuardError, type MemberGuard } from "@shared/workers/gating"
import { ulid } from "@shared/workers/id"
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
  created_at: string
  creator_name: string | null
  updated_at: string | null
  editor_name: string | null
  deactivated_at: string | null
}

/** The two names ride the read rather than a second lookup: a meeting is only
 * ever useful with the client and the purpose spelled out, and a list of fifty
 * would otherwise be a hundred round trips through the REST door. */
const MEETING_COLS = `m.id, m.ref, m.title, m.account_id, m.purpose_id, m.agenda, m.notes, m.location,
  m.starts_at, m.ends_at, m.status, m.held_at, m.google_event_id, m.google_event_url,
  m.created_at, m.creator_name, m.updated_at, m.editor_name, m.deactivated_at,
  (SELECT a.name FROM accounts a WHERE a.id = m.account_id) AS account_name,
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
  purposeId?: string
  status?: string
  /** 'upcoming' (the default view) hides what has already been held; 'all'
   * shows the lot, cancelled ones included. */
  view?: string
  q?: string
}

/** The WHERE both the list and its count are built from — one function, so the
 * badge can never count a different question from the one the rows answered
 * (R16 is only true if the two statements agree). */
function whereFor(filter: MeetingFilter): { sql: string; params: (string | number)[] } {
  const where: string[] = []
  const params: (string | number)[] = []
  // A cancelled meeting is hidden from every view but `all` — it is retired, not
  // deleted, so it stays readable by id and by asking for everything.
  if (filter.view !== "all") where.push("m.deactivated_at IS NULL")
  if (filter.view === "upcoming") where.push("m.status <> 'held'")
  if (filter.accountId) {
    where.push("m.account_id = ?")
    params.push(filter.accountId)
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
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM meetings m WHERE ${base.sql}`,
    base.params
  )
  return rows[0]?.n ?? 0
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
export async function meetingOrThrow(
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
  v: { accountId: string | null; purposeId: string | null }
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
    `INSERT INTO meetings (id, ref, account_id, purpose_id, title, agenda, notes, location,
        starts_at, ends_at, status, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(ref)}, ${sqlString(v.accountId)}, ${sqlString(v.purposeId)},
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
    `UPDATE meetings SET title = ?, account_id = ?, purpose_id = ?, agenda = ?, notes = ?, location = ?,
        starts_at = ?, ends_at = ?, updated_at = ?, editor_id = ?, editor_email = ?, editor_name = ?
      WHERE id = ?`,
    [
      v.title,
      v.accountId,
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
