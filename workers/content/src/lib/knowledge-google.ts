// GOOGLE MATERIAL, AS KNOWLEDGE SOURCES — the four kinds that make a named Drive
// folder, a named Chat space, scoped mail and the calendar answerable.
//
// ══════════════════════════════════════════════════════════════════════════════
// WHY THIS IS A SECOND LIST OF KINDS AND NOT FOUR MORE LINES IN INGEST_KINDS
//
// lib/google-read.ts's header names the one thing this lane must not do: "call
// this on a schedule with a fabricated guard. Everything here is read with ONE
// PERSON'S OWN TOKEN, so a sweep has to run per connected person, as that person,
// or not at all."
//
// A single list would have obeyed that only by ACCIDENT — the cron's guard is a
// user id no row can hold, so `accessTokenFor` would resolve no connection and
// each Google kind would file nothing. Correct, and invisible: a silent no-op
// that looks exactly like "nobody has connected anything", recorded as a clean
// run, for as long as it takes somebody to notice.
//
// So the separation is structural instead. `sweepAll` — the only sweep the
// scheduled handler can call — takes `INGEST_KINDS`, a list this module is not
// in. These kinds are only ever built from a REAL caller's guard, by a door that
// gated on that caller's own `google:read` right. There is no argument the cron
// could pass that reaches them.
//
// WHAT THAT COSTS, said plainly: a person's Google material is brought up to date
// when they (or the assistant acting as them) ask kwapso to, not every fifteen
// minutes. That is the honest shape of a per-person token, and it is why the
// sync screen shows a row per person per service rather than one team-wide "last
// run" that would be a different person's answer every time.
// ══════════════════════════════════════════════════════════════════════════════
//
// TWO FIELDS OFF EVERY ITEM DECIDE WHERE IT LANDS:
//   • `shelf`     → `ownerUserId` on the row. 'private' means this material may
//                   only ever answer its OWNER's question, which the knowledge
//                   base already enforces on every read (its `ownerClause`).
//                   'team' means nobody owns it and everyone who may read the
//                   module may be answered from it.
//   • `accountId` → the COMPARTMENT. The client's, or — when it is null — the
//                   agency's own. Decided by the read that fetched the item (the
//                   folder it came out of, the contact it was with), never by
//                   matching a client's name in the text.
//
// ONE SOURCE PER PERSON PER ITEM. `origin_row_id` carries the reader's user id,
// so a file two colleagues have both named lands as two rows. That is
// deliberate: they are two people's SIGHT of it, and each carries its own shelf —
// one of them may have filed it privately. Sharing one row would make the last
// sweep to run decide who else can read somebody's document.

import { sqlString, d1Query, likeLiteral, type D1Rest } from "@shared/workers/d1-rest"
import type { MemberGuard } from "@shared/workers/gating"
import { mendMojibake } from "@shared/workers/mojibake"
import { GOOGLE_SCOPED_SERVICES, GOOGLE_SERVICES, type GoogleItem, type GoogleService } from "@shared/types"
import type { Env } from "../env"
import { accessTokenFor, googleScope, listConnections, listNamedSources } from "./google"
import { googlePresence, type ProbableService } from "./google-api"
import { hydrateText, readGoogleMaterial } from "./google-read"
import { indexSource } from "./knowledge"
import { withSyncLease } from "./sync-lease"
import { brand } from "@shared/brand"
import {
  INGEST_SOURCES_PER_TICK,
  listIngestState,
  sweepKinds,
  type IngestKind,
  type IngestRow,
  type SweepResult,
} from "./knowledge-ingest"

/** The word each service wears on a source row and in the Knowledge screen's
 * kind filter. Plain nouns rather than product names: somebody filtering the
 * knowledge base is looking for "a document" or "an email", and would have to
 * translate "drive" back into one. */
const KIND_OF: Record<GoogleService, string> = {
  drive: "document",
  gmail: "email",
  calendar: "event",
  chat: "message",
}

/** Which SERVICE a source kind came from — the inverse of KIND_OF, so the
 * knowledge module's kind list and this one can never drift apart. */
export const GOOGLE_SOURCE_KINDS = GOOGLE_SERVICES.map((s) => KIND_OF[s])

/** The state key one person's sweep of one service keeps its place under. The
 * ONE place the string is built, so the sweeper, the screen and the door can
 * never spell it differently. */
export function googleStateKey(service: GoogleService, userId: string): string {
  return `${KIND_OF[service]}:${userId}`
}

/** FORGET WHERE THIS LANE HAD GOT TO, so the next sweep reads it from the start.
 *
 * THE FAULT (owner, 20 Aug 2026). He disconnected Google, pressed "Connect
 * everything", and re-shared five Chat spaces and four Drive folders. The sweep
 * ran twice afterwards and brought in ZERO chat messages, while the knowledge
 * base held 73 chat sources with every one of them deactivated. The material was
 * gone and re-sharing did not bring it back.
 *
 * The cursor is why. A lane keeps its place — `v2|2026-08-20T04:16:39|…` — and
 * resumes from it, which is exactly right while a share is CONTINUOUS: nobody
 * wants a re-read of two years of chat every quarter of an hour. But
 * disconnecting retires the sources (`retireVanished` is correct to do that: the
 * space is genuinely no longer shared) and re-sharing brings the space back
 * while the cursor still points past everything in it. So the lane resumes
 * after the end of material that is no longer there, finds nothing newer, and
 * reports an honest, useless "caught up".
 *
 * SHARING SOMETHING IS THE ONE EVENT THAT MEANS "READ THIS AGAIN". It is rare, a
 * person does it deliberately, and it is the moment they expect the material to
 * appear — so it is the right and only place to give the cursor up. The cost is
 * one re-read of a folder or a space, bounded by the same caps as any other
 * sweep, and the alternative is what happened here: a share that silently does
 * nothing. */
export async function rewindGoogleLane(
  cfg: D1Rest,
  guard: MemberGuard,
  service: GoogleService
): Promise<void> {
  await d1Query(
    cfg,
    guard.databaseId,
    // The row may not exist yet — a first share before a first sweep — and a
    // cursor that was never set is already rewound, so this touches nothing.
    `UPDATE knowledge_ingest SET cursor = NULL WHERE kind = ?`,
    [googleStateKey(service, guard.userId)]
  )
}

/**
 * STOP ANSWERING FROM ONE GOOGLE KIND ALTOGETHER, and read it again from the
 * start — what a person's SCOPE change means for material already brought in.
 *
 * THE PROBLEM IT SOLVES, said plainly. Scope narrows what is READ, which is the
 * right shape and is the whole design (lib/google.ts's SCOPE essay). But a
 * person who narrows their mail on Tuesday has already had six months of it
 * indexed on Monday, and "that source was never in scope" is false for every
 * one of those rows. A narrowing that only reaches the future is a narrowing
 * that leaves the thing somebody was trying to get rid of exactly where it was.
 *
 * WHY IT IS THIS BLUNT. A `knowledge_sources` row does not record WHICH calendar
 * or WHICH label it came through — the origin id is Google's event or message
 * id and nothing else — so the rows that are now out of scope cannot be
 * identified after the fact. They could be, with a column and a migration and a
 * backfill that would still know nothing about the rows written before it. So
 * the honest move is to let go of the whole kind and let the next sweep bring
 * back exactly what is in scope, which is a computation the code already knows
 * how to do correctly.
 *
 * IT IS THE SAME ARGUMENT `rewindGoogleLane` ALREADY MAKES, in the other
 * direction: sharing something is the one event that means "read this again",
 * because it is rare, deliberate, and the moment a person expects the material
 * to move. Changing scope is its mirror and earns the same treatment. The cost
 * is one re-read and one re-embed of that person's own mail or calendar, paid
 * only when somebody deliberately changes their mind, and the screen says so
 * before they confirm.
 *
 * AND THE THING THAT HOLDS AFTERWARDS IS THE SCOPE, NOT THE RETIREMENT — which
 * is what makes it safe to retire with the MACHINE's hand (`retire` below leaves
 * `deactivator_id` null, so `sweepKind` may revive these rows, and that is
 * deliberate). Everything still in scope is read again on the next tick and
 * comes back. Everything OUT of scope is never read again, so there is nothing
 * for a revival to act on: the sweep cannot revive a row it is never handed.
 *
 * That is the distinction the retirement seam turns on, applied to its mirror. A
 * person's decision is not enforced by a deactivated_at that must survive every
 * future housekeeping pass — it is enforced by the read never happening. A flag
 * can be flipped back by a pass nobody thought about; a read that does not occur
 * cannot be undone.
 */
export async function forgetGoogleKind(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  service: GoogleService
): Promise<number> {
  let dropped = 0
  // `heldSources` is capped (R14, RETIRE_SCAN_CAP) and randomised, so one call
  // cannot promise to have seen everything. Walked until a pass finds nothing
  // left rather than once — with a hard ceiling, because a loop whose exit
  // depends on a write succeeding is a loop that can fail to exit.
  for (let pass = 0; pass < FORGET_PASSES; pass++) {
    const held = await heldSources(cfg, guard, `google_${service}`)
    if (held.length === 0) break
    for (const source of held) {
      await retire(env, cfg, guard, source.id)
      dropped++
    }
  }
  await rewindGoogleLane(cfg, guard, service)
  return dropped
}

/** How many capped scans `forgetGoogleKind` will walk. RETIRE_SCAN_CAP is 500,
 * so this reaches five thousand of one person's sources for one service — an
 * order of magnitude past any mailbox this app has met, and a ceiling rather
 * than a number anybody will touch. */
const FORGET_PASSES = 10

/** Every state key one person could have — what the sync screen asks for. */
export function googleStateKeys(userId: string): string[] {
  return GOOGLE_SERVICES.map((s) => googleStateKey(s, userId))
}

/** A moment that SORTS. Google hands back three different shapes of time — an
 * RFC-3339 stamp from Drive and Chat, an RFC-2822 mail header ("Tue, 3 Jun 2026
 * 10:04:00 +0200"), a plain date on an all-day event — and only the first sorts
 * as text. The cursor compares strings, so everything is normalised here or the
 * sweep would walk its window in an order nobody can predict.
 *
 * Unreadable or absent → the empty string, which sorts before everything and is
 * therefore swept FIRST rather than never. A row with no date is not a row to
 * drop; it is a row we know less about. */
function moment(raw: string | null): string {
  if (!raw) return ""
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : ""
}

/** Sort ascending by (moment, id) — the same total order the cursor names, so
 * "everything strictly after this position" is a meaningful sentence about a
 * window whose own order we do not control. */
function inCursorOrder(rows: IngestRow[]): IngestRow[] {
  return [...rows].sort((a, b) =>
    a.sortAt === b.sortAt ? (a.originRowId < b.originRowId ? -1 : 1) : a.sortAt < b.sortAt ? -1 : 1
  )
}

/** Everything strictly after the cursor. The keyset predicate the SQL kinds get
 * from `after()`, done in code — because the rows came back from Google rather
 * than from a statement we could put a WHERE on. */
function afterCursor(rows: IngestRow[], cursor: { at: string; id: string } | null): IngestRow[] {
  if (!cursor) return rows
  return rows.filter((r) => r.sortAt > cursor.at || (r.sortAt === cursor.at && r.originRowId > cursor.id))
}

/** The fence and the filing, off one item. Two lines, in one place, because they
 * are the two things this whole module is for. */
function fencing(item: GoogleItem): { ownerUserId: string | null; accountId: string | null } {
  return {
    // 'team' means NOBODY owns it — which is what a null owner means to every
    // read in lib/knowledge.ts. 'private' names the person whose connection it
    // came through, and only their questions can ever be answered from it.
    ownerUserId: item.shelf === "team" ? null : item.ownerUserId,
    accountId: item.accountId,
  }
}

/** One person's sight of one item, as a source row id. See the header: the
 * reader is IN the id, so two colleagues naming the same folder get a row each. */
function rowId(item: GoogleItem): string {
  return `${item.ownerUserId}:${item.externalId}`
}

/**
 * THE FOUR KINDS, built for ONE person from their own guard.
 *
 * `env`, `cfg` and `guard` are closed over rather than passed through the read
 * signature: a Google read needs a token, a token belongs to a person, and a
 * kind that could be handed somebody else's guard at call time is a kind that
 * could be swept as the wrong person. Bound once, at the only place that has the
 * right to build them.
 */

/** GOOGLE'S OWN CALENDAR-NOTICE OPENINGS. A PREFIX and never a substring: a mail
 * that OPENS "Invitation: " is Google announcing an event, and a mail whose
 * subject merely contains the word is a person writing to us. */
const NOTICE_PREFIXES = [
  "Invitation: ",
  "Accepted: ",
  "Declined: ",
  "Tentative: ",
  "Canceled: ",
  "Cancelled: ",
  "Updated invitation: ",
  "Updated invitation with note: ",
]

/** The event a calendar notice is ABOUT — its own title, with Google's prefix
 * and its " @ <when>" tail removed. Null when the title is not a notice, so "is
 * this a notice" and "what is it about" are one decision in one place. */
export function eventNamedBy(title: string): string | null {
  const prefix = NOTICE_PREFIXES.find((p) => title.startsWith(p))
  if (!prefix) return null
  const rest = title.slice(prefix.length)
  const at = rest.indexOf(" @ ")
  const named = (at === -1 ? rest : rest.slice(0, at)).trim()
  return named.length ? named : null
}

/** The Drive file a document row is one person's sight of — the tail of
 * `<userId>:<driveFileId>`, which is what `rowId` builds. */
export function driveFileIdOf(originRowId: string): string | null {
  const at = originRowId.indexOf(":")
  if (at === -1) return null
  const id = originRowId.slice(at + 1).trim()
  return id.length ? id : null
}

/** WHAT THE APP ALREADY HOLDS, for the fold below — read ONCE per sweep. */
type FoldTargets = { transcripts: Set<string>; events: Set<string> }
async function readFoldTargets(cfg: D1Rest, guard: MemberGuard): Promise<FoldTargets> {
  const [meetings, events] = await Promise.all([
    // R14 hard cap: one team's meetings, stated at the statement.
    d1Query<{ title: string; transcript_file_id: string | null; words: number }>(
      cfg,
      guard.databaseId,
      `SELECT title, transcript_file_id, LENGTH(COALESCE(transcript_text, '')) AS words
         FROM meetings WHERE deactivated_at IS NULL LIMIT ${FOLD_ORACLE_CAP}`
    ),
    // R14 hard cap: the calendar entries this base already mirrors.
    d1Query<{ title: string }>(
      cfg,
      guard.databaseId,
      `SELECT title FROM knowledge_sources
        WHERE kind = 'event' AND deactivated_at IS NULL LIMIT ${FOLD_ORACLE_CAP}`
    ),
  ])
  return {
    // A TRANSCRIPT ONLY COUNTS WHEN THE MEETING REALLY HOLDS THE WORDS. Folding
    // the Drive copy while the app's own row is empty would leave the base with
    // neither, which is the one outcome worse than the duplication.
    transcripts: new Set(
      meetings.filter((m) => m.transcript_file_id && m.words > 0).map((m) => m.transcript_file_id as string)
    ),
    events: new Set([...meetings.map((m) => m.title), ...events.map((e) => e.title)]),
  }
}

/** How many rows either half of the fold oracle will read. One agency's meetings
 * and calendar entries, so a cap is the honest shape (R14) — and a base that
 * outgrows it wants a decision rather than a silent truncation. */
const FOLD_ORACLE_CAP = 20000

export function googleIngestKinds(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  /** WHAT GOOGLE STILL HAD, filled in as each kind reads — the other half of
   * `retireVanished` below, and the reason it costs no extra Google call. The
   * sweep already asks each service what it holds; this keeps the answer instead
   * of throwing it away. Optional, because a caller that only wants to INDEX has
   * no business being made to hold a set it will not read. */
  seen?: Map<GoogleService, Set<string>>
): IngestKind[] {
  /** WHAT GOOGLE SENT, WITH THE KNOWN DAMAGE MENDED — see shared/workers/mojibake.
   *
   * Google's own profile carries the owner's display name mis-decoded ("Ãlaap"),
   * and writes that spelling into everything it composes: an invitation's subject
   * line, a transcript's attendee list, a chat roster. 311 rows on staging.
   *
   * IT HAS TO HAPPEN HERE RATHER THAN IN A REPAIR SCRIPT. These four kinds are
   * `windowed`: the sweep re-reads what Google currently holds every fifteen
   * minutes and the upsert sets `title = excluded.title` unconditionally, so a
   * row repaired in the database is mangled again by the next tick. Correcting
   * the name on the Google account — which the owner has done — fixes everything
   * composed FROM NOW ON and cannot reach a subject line already sent. Of the
   * 311, only the 43 chat threads are rebuilt from the live directory and heal
   * themselves; the other 268 are frozen text that every sweep faithfully
   * re-reads.
   *
   * AND IT SITS ON THE ONE EXIT ALL FOUR LANES SHARE, not on each of the four
   * mappers. A fifth lane added tomorrow is mended because it goes through
   * `slice`, not because somebody remembered.
   *
   * Only known strings with a named source of truth are touched; anything else
   * is left exactly as Google sent it. */
  const mended = (r: IngestRow): IngestRow => ({
    ...r,
    title: mendMojibake(r.title),
    body: mendMojibake(r.body),
  })

  /* ── FOLD_TO_THE_APP_S_OWN_RECORD ─────────────────────────────────────────
   *
   * ONE EVENT, ONE RECORD. A single meeting arrives here as up to five sources:
   * the meeting row this app owns, the notes document Gemini leaves in Drive,
   * Google's "Invitation:" mail, an "Accepted:" mail per guest, and the calendar
   * entry. Five titles, one subject — and an answer built from six passages has
   * then told the reader one thing five times, spending four slots a different
   * real source did not get. Measured on staging 1 Sep 2026: 118 of 3,775 live
   * sources, 3.1% of the corpus.
   *
   * THE APP'S OWN RECORD IS CANONICAL, and the two rules say only that:
   *   · a Drive file that IS some meeting's transcript is the same words at a
   *     second address — an ID join on `transcript_file_id`, not a title guess;
   *   · a Google calendar notice for an event the base ALREADY HOLDS is an
   *     announcement of a record rather than a record.
   *
   * THE SECOND AGREEMENT IS WHAT MAKES EACH SAFE, and it is the same sentence
   * both times: fold only where the original is really there. A transcript
   * counts only if the meeting holds words; a notice folds only if we hold the
   * event. An invitation to something the base does not otherwise know about is
   * the ONLY record of it — measured, 40 of them on staging — and it stays.
   *
   * "Notes:" MAIL IS NOT A NOTICE AND IS NEVER FOLDED. It carries the meeting's
   * actual minutes, and the retrieval bench cites one as a correct answer.
   *
   * RETIRED, NOT SKIPPED. The source is written and DEACTIVATED, which is the
   * difference between "the assistant stops quoting it" and "the assistant
   * quotes it forever because the sweep never visits it again" — and it means a
   * row whose condition stops being true (the meeting's transcript is cleared)
   * is REVIVED by the engine on the next tick, with no repair door to remember.
   *
   * The oracle is read ONCE per sweep and shared by both lanes; a tick that
   * cannot read it folds nothing, which is the safe direction. */
  let oracle: Promise<FoldTargets> | null = null
  const foldTargets = (): Promise<FoldTargets> =>
    (oracle ??= readFoldTargets(cfg, guard).catch(() => ({
      transcripts: new Set<string>(),
      events: new Set<string>(),
    })))

  const folded = (service: GoogleService, r: IngestRow, targets: FoldTargets): IngestRow => {
    if (service === "drive") {
      const fileId = driveFileIdOf(r.originRowId)
      return fileId && targets.transcripts.has(fileId) ? { ...r, retired: true } : r
    }
    if (service === "gmail") {
      const named = eventNamedBy(r.title)
      return named && targets.events.has(named) ? { ...r, retired: true } : r
    }
    return r
  }

  /** List cheaply, walk to the cursor, and only THEN pay for the bodies. A Drive
   * listing is one call for fifty files and their text is fifty more, so
   * hydrating before the slice would pay for forty-nine files this tick is not
   * going to file. */
  const slice = async (
    service: GoogleService,
    cursor: { at: string; id: string } | null,
    limit: number,
    toRows: (items: GoogleItem[]) => IngestRow[],
    hydrate = false
  ): Promise<IngestRow[]> => {
    const { items } = await readGoogleMaterial(env, cfg, guard, { services: [service] })
    // RECORDED BEFORE THE CURSOR NARROWS IT. The slice below is what this tick
    // will FILE; this is everything the service currently holds, which is a
    // different and much larger sentence — and it is the only one that can tell
    // "Google no longer has this" from "the cursor has already passed it".
    if (seen) seen.set(service, new Set(items.map((i) => i.externalId)))
    const wanted = afterCursor(inCursorOrder(toRows(items)), cursor).slice(0, limit)
    // THE FOLD RIDES THE SAME EXIT `mended` DOES, and for the same reason: a
    // fifth lane added tomorrow is covered because it goes through `slice`, not
    // because somebody remembered.
    const targets = await foldTargets()
    const fold = (r: IngestRow) => folded(service, mended(r), targets)
    if (!hydrate || wanted.length === 0) return wanted.map(fold)
    // Hydration is per ITEM, so the slice is mapped back to the items it came
    // from — by the id this module builds, which is the only key both sides share.
    const byId = new Map(items.map((i) => [rowId(i), i]))
    const full = await hydrateText(
      env,
      cfg,
      guard,
      wanted.map((r) => byId.get(r.originRowId)).filter((i): i is GoogleItem => Boolean(i))
    )
    const textById = new Map(full.map((i) => [rowId(i), i.text]))
    return wanted.map((r) => fold({ ...r, body: textById.get(r.originRowId) || r.body }))
  }

  return [
    {
      kind: KIND_OF.drive,
      stateKey: googleStateKey("drive", guard.userId),
      // The `origin_table` is not a table in this database — it is where the row
      // came FROM, and these four came from outside it. Naming them for the
      // service is what keeps `(origin_table, origin_row_id)` unique across the
      // four, and what lets somebody reading a source row see at a glance that
      // its original is not something this app owns.
      table: "google_drive",
      label: "Drive documents",
      windowed: true,
      textVersion: 1,
      read: (_cfg, _guard, cursor, limit) =>
        slice(
          "drive",
          cursor,
          limit,
          (items) =>
            items.map((item) => ({
              originRowId: rowId(item),
              sortAt: moment(item.updatedAt),
              // WHEN THIS IS FROM. Every Google lane already builds this moment
              // for its cursor and none of them wrote it to the row, so 799 of the
              // agency's 4,026 sources — every email, document, chat thread and
              // calendar entry, 20% of the base — carried no date at all. Nothing
              // that reasons about "latest" or "since last week" can see them.
              recordDate: moment(item.updatedAt) || null,
              title: item.title,
              // Empty until hydration — the listing has no text in it at all.
              body: "",
              sourceUrl: item.url,
              ...fencing(item),
            })),
          true
        ),
    },
    {
      kind: KIND_OF.gmail,
      stateKey: googleStateKey("gmail", guard.userId),
      table: "google_gmail",
      label: "mail with a client",
      windowed: true,
      textVersion: 1,
      read: (_cfg, _guard, cursor, limit) =>
        slice(
          "gmail",
          cursor,
          limit,
          (items) =>
            items.map((item) => ({
              originRowId: rowId(item),
              sortAt: moment(item.updatedAt),
              // WHEN THIS IS FROM — the mail's own date. See the drive lane above.
              recordDate: moment(item.updatedAt) || null,
              title: item.title,
              // The snippet until hydration replaces it with the real body. It is
              // a hundred characters, which is enough to be worth having and not
              // enough to answer anything — which is why mail is hydrated.
              body: item.text,
              sourceUrl: item.url,
              ...fencing(item),
            })),
          true
        ),
    },
    {
      kind: KIND_OF.calendar,
      stateKey: googleStateKey("calendar", guard.userId),
      table: "google_calendar",
      label: "calendar entries",
      windowed: true,
      // 2 SINCE 27 AUG 2026 — an occurrence that has not happened is no longer
      // filed (below). The rows already filed sit behind the cursor, so without
      // the bump the 204 of them in staging would stay there for ever: the bump
      // is what makes the sweep walk back and re-decide every entry.
      textVersion: 2,
      // READING FROM THE CALENDAR IS WHAT TELLS THE KNOWLEDGE BASE WHAT WAS
      // AGREED WHEN. A meeting's title and the note somebody put in the
      // description are usually the only written record that a decision was
      // taken on a Tuesday in March — and "when did we agree that?" is a question
      // no other table in this app can answer.
      //
      // ── BUT AN EMPTY ONE THAT HAS NOT HAPPENED IS NOT A RECORD OF ANYTHING ──
      //
      // A recurring series is one calendar entry per occurrence, for ever
      // forwards. With no description on it, every one of those says exactly
      // this and nothing else: "Met on 2027-09-10." — about a day that has not
      // arrived, which is not merely empty but untrue.
      //
      // MEASURED ON STAGING, 27 Aug 2026. 236 of the team's 237 calendar sources
      // had no description at all, and 204 of those were dated in the future. Not
      // 204 subjects: FOUR. "Week recap" ninety-two times, "Week planning"
      // ninety-one, "Team Assembly" twenty, one other.
      //
      // WHAT IT COST, and it is not the disk. Asked "what did we agree in the
      // week recap?", every one of the thirty nearest chunks in the index was one
      // of these placeholders — the title matches what a person types, exactly,
      // ninety-two times over — and the 96-chunk transcript of the meeting they
      // meant never reached the ranking at all. The answer was "we have nothing
      // on that", about a meeting the base holds a full transcript of. A ranking
      // cannot recover from that and neither can the diversifier, which only ever
      // sees what the search already chose.
      //
      // NARROW, AND IT UNDOES ITSELF. Only an entry with NO words of its own and
      // a date still ahead: an agenda somebody typed is kept whatever its date,
      // and a bare PAST entry is kept too — that one really is the record that a
      // meeting happened, which is what the paragraph above defends. And because
      // this retires rather than skips, the day the meeting finally happens the
      // condition stops being true, the sweep meets a live row, and the engine
      // revives it (see `sweepKind` — the app may undo its own retirement).
      read: (_cfg, _guard, cursor, limit) =>
        slice("calendar", cursor, limit, (items) => {
          const now = new Date().toISOString()
          return items.map((item) => {
            const at = moment(item.updatedAt)
            return {
              originRowId: rowId(item),
              sortAt: at,
              // WHEN THIS IS FROM — the entry's own moment. See the drive lane.
              recordDate: at || null,
              title: item.title,
              body: [`Met on ${(at || "an unknown date").slice(0, 10)}.`, item.text]
                .filter(Boolean)
                .join("\n\n"),
              sourceUrl: item.url,
              // An unparseable moment is empty, and "" is never after now — so a
              // date we could not read keeps its entry rather than losing it.
              retired: !item.text && at > now,
              ...fencing(item),
            }
          })
        }),
    },
    {
      kind: KIND_OF.chat,
      stateKey: googleStateKey("chat", guard.userId),
      table: "google_chat",
      label: "Chat conversations",
      windowed: true,
      // 3 SINCE 31 AUG 2026 — the app-only retirement below. It changes no TEXT,
      // so nothing here needs re-embedding; what it needs is for the sweep to
      // MEET the conversations it has already filed, and a cursor is exactly what
      // stops that. A windowed kind does rewind on its own — but only on a tick
      // that finds nothing new (`sweepKind`: `rows.length === 0`), and a space
      // receiving a trickle of messages consumes every tick without ever
      // rewinding. Measured on staging: 90 minutes and seven ticks after the
      // deploy, not one of the 21 notification threads had been re-read, and
      // there was no hour at which it was going to happen. Unbounded, not slow.
      //
      // WHAT THE BUMP COSTS, measured rather than assumed, because this lane
      // first declined to bump on the belief that it would re-embed the lot:
      // one upsert per conversation and NO embedding call, since every hash is
      // unchanged and the hash-skip returns before `indexSource`. On staging,
      // three re-read chat sources kept `indexed_at` values an hour older than
      // the `updated_at` the re-read gave them. `knowledge-coverage.test.ts`
      // holds both halves down now — the rewind, and the skip.
      //
      // 2 SINCE 20 AUG 2026 — the unit changed from a space to a thread and the
      // body changed with it, so every stored cursor has to rewind. Without the
      // bump the sweep kept the position it had reached over the OLD rows, found
      // almost every conversation to be "before" it, and filed one thread out of
      // a hundred while reporting itself caught up. Measured live: `read: 1,
      // indexed: 1, caughtUp: true` against five spaces holding fifty messages
      // each.
      textVersion: 3,
      // ONE SOURCE PER CONVERSATION — not per message, and no longer per space.
      //
      // PER MESSAGE was wrong for the reason this comment has always given: a
      // chat message on its own is four words with no subject, and fifty of them
      // is fifty sources, fifty upserts and fifty embedding calls for a
      // morning's chatter.
      //
      // PER SPACE, which is what replaced it, was wrong in the other direction
      // and less obviously. A space is not a subject either — it is a room that
      // has held every subject for a year. Folding one into a single source
      // meant its ten chunks were cut across unrelated conversations, a citation
      // could only ever say "the FluClinic space", and there was nothing for a
      // link to point AT.
      //
      // A THREAD is the unit a person actually means by "that conversation about
      // the voucher quantity". Google hands us the grouping for free on every
      // message (`thread.name`) and nothing read it until 20 Aug 2026. The
      // folding itself lives in google-read's `chatThreads`, beside the reader
      // that knows what a message is — so by the time an item reaches here it IS
      // a conversation, and this lane has nothing left to group.
      read: (_cfg, _guard, cursor, limit) =>
        slice("chat", cursor, limit, (items) =>
          items.map((item) => ({
            // The THREAD is the row, so the thread's own id is the key. A new
            // reply updates the conversation in place rather than filing a
            // second copy of it.
            originRowId: rowId(item),
            // As recent as its last reply — `chatThreads` stamps the fold with
            // the newest message for exactly this.
            sortAt: moment(item.updatedAt),
            // AND THAT SAME MOMENT IS WHEN THE CONVERSATION IS FROM. A chat thread
            // dated by its newest reply is what makes "the latest on FluClinic"
            // answerable — the question the owner asked that started this.
            recordDate: moment(item.updatedAt) || null,
            title: item.title,
            // ALREADY ATTRIBUTED, line by line, by `chatThreads`. It used to be
            // re-attributed here from the title, which is why every line read
            // "Somebody in this space: Somebody in this space:" the moment the
            // reader started doing it properly.
            body: item.text,
            // AND IT LINKS BACK. This was `null` — so Chat was the one Google
            // kind the assistant could quote and nobody could go and read.
            sourceUrl: item.url,
            // ── THE APP READING ITS OWN NOTIFICATIONS BACK IN ────────────────
            //
            // kwapso posts into a Chat space ("*Request* created by _K. Stehlik_
            // in the Portal"); the Chat sweep then files that post as knowledge.
            // A closed loop. These are genuinely distinct threads with correct
            // composite keys, so this is not duplication and dedup is the wrong
            // tool: every one is a real, separate, worthless conversation, and
            // each occupies a retrieval slot a real question needs. The ticket
            // it announces is already in the base as a `ticket` source with the
            // actual words on it.
            //
            // MEASURED ON STAGING, 31 Aug 2026: 96 chat sources, of which 21 are
            // such threads — every one live — and 6 are the mixed case below,
            // across four spaces —
            //   "HOGO — An app"      "An app: *💭 Request* created by _K. Stehlik_ in the Portal"
            //   "Rest-o — An app"    "An app: 🐛 *Bug Reported*: @Ishita Goyal"
            //   "FluClinic — An app" "An app: 📤 Task ready for your review @Ishita Goyal"
            //
            // ── WHY THE DISCRIMINATOR IS THE SPEAKER AND NOT THE WORDS ───────
            //
            // The obvious filter is the message FORMAT, and it is the dangerous
            // one. In the same four spaces sit SIX threads that open with that
            // exact notification line and then carry the team's reply to it:
            //
            //   "An app: *⚠️ Issue* created by _Paras Maroo_ in the Portal
            //    Aurora Thalassa: @Chilavert George pls review this
            //    Chilavert George: these two emails are sent by me, when I was
            //      working on the stripe workflow.
            //    Chilavert George: I have fixed the issue that caused these emails"
            //
            // That is a decision made in the open with the reasoning attached —
            // precisely what the knowledge base is FOR. Every one of those nine
            // bodies contains the notification line and the words "in the
            // Portal", so a format filter deletes the team's own diagnostic
            // record and leaves a green build behind it. The SPACE discriminates
            // nothing either: HOGO, FluClinic, Assecuranz and Rest-o each hold
            // both kinds.
            //
            // So the test is WHO SPOKE, over the WHOLE thread, and it never
            // reads the body at all — which is why no human sentence can trip
            // it, whatever it says about the Portal. `appOnly` is Google's own
            // `sender.type`, folded across every message by `chatThreads`.
            //
            // WHAT A FALSE POSITIVE COSTS, because a knowledge base that
            // silently drops real material is worse than one carrying noise: a
            // space where an app posts something genuinely useful that no human
            // ever replies to — an alerting, CI or form-response bot — is
            // retired unread. I judge that acceptable and reversible, and it is
            // the real cost rather than a nil one. Reversible twice over: this
            // RETIRES rather than skips, so the row and its history survive
            // (deactivate-never-delete), and the moment one person replies the
            // condition stops being true, the sweep meets a live row and the
            // engine revives it (`sweepKind`) — exactly as the calendar lane's
            // placeholders come back the day the meeting happens. A person who
            // excluded it by hand still keeps that decision; `deactivator_id`
            // is what separates the two.
            retired: item.appOnly === true,
            ...fencing(item),
          }))
        ),
    },
  ]
}

/**
 * BRING ONE PERSON'S GOOGLE MATERIAL INTO STEP — the personal half of the sweep.
 *
 * Only the services they have actually CONNECTED are swept. A person with Drive
 * and nothing else must not have three kinds recording a run each tick, and the
 * empty answer `readGoogleMaterial` gives for an unconnected service would look
 * identical to an empty Drive on the screen — "in step, nothing found" about a
 * mailbox nobody ever attached.
 *
 * Everything else — the cursor, the bounded slice, the hash-skip, R12's failure
 * record — is inherited from the one engine, which is the whole point of a kind
 * being data (lib/knowledge-ingest.ts's header).
 */
export async function sweepGoogle(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  options: {
    /** true = don't ask Google when this person's kinds were all swept inside
     * the five-minute floor; answer with the state as of that sweep instead. */
    onlyIfStale?: boolean
    limit?: number
  } = {}
): Promise<{
  results: SweepResult[]
  skipped: boolean
  connectedServices: GoogleService[]
  /** true = another caller — another tab, another device, this same person —
   * is bringing this in RIGHT NOW, so nothing here was read or written. Kept
   * apart from `skipped` (which means "found nothing to do") because the two
   * need different sentences: one is "up to date", the other is "wait a
   * moment and press again". */
  busy: boolean
}> {
  const connected = new Set(
    (await listConnections(cfg, guard)).filter((c) => c.active).map((c) => c.service)
  )
  // WHAT IS CONNECTED, said out loud. An empty sweep has two very different
  // causes — nothing changed, or nothing was ever connected — and the screen
  // was collapsing both into "Nothing new to bring in" (the owner pressed the
  // button with zero connections and was told there was nothing to fetch, as
  // if a fetch had happened). Derived from the same read as the filter below,
  // in the same breath, so the flag can never disagree with the behaviour.
  const connectedServices = [...connected]
  const seen = new Map<GoogleService, Set<string>>()
  // A KIND SCOPE HAS CLOSED DOES NOT RUN AT ALL, and that is not merely an
  // economy. A closed kind reads nothing, so its `seen` set would be empty —
  // and an empty `seen` is the input `retireVanished` reads as "Google returned
  // none of these", which would send it probing every source this person holds.
  // Not running is the honest state: nothing was asked, so nothing is known.
  const closed = new Set<GoogleService>()
  for (const service of GOOGLE_SCOPED_SERVICES) {
    // Only a service this person actually connected — `googleScope` answers
    // "everything" for one they have not, which is right and is a database read
    // spent learning nothing.
    if (!connected.has(service)) continue
    const scope = await googleScope(cfg, guard, service)
    if (scope.mode === "only" && scope.containers.length === 0) closed.add(service)
  }
  const kinds = googleIngestKinds(env, cfg, guard, seen).filter((k) => {
    const service = serviceOfStateKey(k.stateKey as string, guard.userId)
    return connected.has(service) && !closed.has(service)
  })
  if (kinds.length === 0) return { results: [], skipped: false, connectedServices, busy: false }

  // THE FLOOR (14.12). This door now fires by itself when somebody opens the
  // app, so "how often may it ask Google?" stopped being a question about a
  // button somebody presses and became a question about a page load.
  //
  // IT IS ASKED FOR, AND THAT IS THE WHOLE DESIGN. A floor over EVERY call was
  // written first and was wrong: re-shelving a Drive folder and pressing sync is
  // a deliberate act with an expected result, and a door that answered "already
  // did that four minutes ago" would have broken every proved path in §14 to add
  // this one. So the AUTOMATIC caller opts in and the BUTTON does not — which
  // also means the floor is not a security control and never has to survive a
  // lying client: the cost it bounds is the cost the automatic caller
  // introduced, and a person hammering the button spends their own Google quota
  // exactly as they could before this lane existed. The rights on the door
  // (R10) are what stop a stranger, and they are unchanged.
  //
  // IT IS READ, NOT STORED. `knowledge_ingest.last_run_at` already records when
  // each kind last ran, per person — the row the sweep writes on every tick — so
  // the floor is a comparison rather than a column. Adding a "last pinged"
  // column beside a "last ran" column would have been two facts that must agree.
  //
  // ALL OR NOTHING, per person. A part-skipped sweep would answer with a `read`
  // of 0 for the quiet kinds and look like an empty Drive, which is the exact
  // confusion `sweepGoogle` already refuses to create for an unconnected service.
  if (options.onlyIfStale) {
    const recent = await sweptWithin(cfg, guard, kinds, GOOGLE_SWEEP_FLOOR_MS)
    if (recent) return { results: recent, skipped: true, connectedServices, busy: false }
  }

  // THE LEASE. Everything above this line is a READ (connections, state rows) —
  // cheap, and safe to repeat if two callers land here at once. Everything
  // below WRITES to knowledge_ingest and reads Google with this person's own
  // token, and that is the part that must never run twice at the same instant
  // (migration 0057's header carries the owner's own report). Claimed on the
  // ACT, not the request, so the Meetings page's own knowledge sweep and this
  // one collide correctly.
  const lease = await withSyncLease(
    cfg,
    guard.databaseId,
    `google-knowledge:${guard.userId}`,
    async () => {
      const results = await sweepKinds(env, cfg, guard, kinds, options.limit ?? INGEST_SOURCES_PER_TICK)
      // AFTER the sweep, never instead of it: the reads above are what filled
      // `seen`, and a retire pass that ran first would be reasoning about last
      // tick's world.
      await retireVanished(env, cfg, guard, seen)
      return results
    }
  )
  if (!lease.ran) return { results: [], skipped: true, connectedServices, busy: true }
  return { results: lease.result, skipped: false, connectedServices, busy: false }
}

/** HOW LONG A PERSON'S GOOGLE STAYS "JUST CHECKED" — the floor above. Five
 * minutes: long enough that opening the app repeatedly costs Google nothing,
 * short enough that a document filed during a meeting is answerable by the end
 * of it. */
export const GOOGLE_SWEEP_FLOOR_MS = 5 * 60 * 1000

/** Were ALL of this person's connected kinds swept inside the window? Returns
 * the state as sweep results when they were — read straight off the rows the
 * last real sweep wrote — and null when even one of them is due.
 *
 * `read` and `indexed` are 0 because nothing was read and nothing was indexed:
 * this call did no work and says so. `caughtUp` is true for the same reason a
 * clean tick's is — there is nothing more to bring in *right now*; the caller
 * that wants to push a first fill along is told `skipped` and can come back.
 * A kind that FAILED last time carries its error forward, so a floor can never
 * turn "it has been failing since Tuesday" into a silent success. */
async function sweptWithin(
  cfg: D1Rest,
  guard: MemberGuard,
  kinds: IngestKind[],
  windowMs: number
): Promise<SweepResult[] | null> {
  const keys = kinds.map((k) => (k.stateKey ?? k.kind) as string)
  // The ONE reader of this table (R14's cap is the length of the named list it
  // carries), asked for this caller's own keys and nothing else.
  const state = await listIngestState(cfg, guard, keys)
  const byKind = new Map(state.map((s) => [s.kind, s]))
  const floor = Date.now() - windowMs
  const results: SweepResult[] = []
  for (const key of keys) {
    const row = byKind.get(key)
    const ran = row?.lastRunAt ? Date.parse(row.lastRunAt) : NaN
    // Never run, unreadable stamp, or older than the window → this is a real
    // sweep. `Number.isFinite` rather than a truthiness test, because a stamp we
    // cannot parse must mean "due", never "just now".
    if (!Number.isFinite(ran) || ran < floor) return null
    results.push({
      kind: key,
      read: 0,
      indexed: 0,
      caughtUp: true,
      ...(row?.lastError ? { error: row.lastError } : {}),
    })
  }
  return results
}

/** Which service a state key belongs to — the inverse of googleStateKey, so the
 * filter above reads the same string the key was built from rather than a second
 * spelling of it. */
function serviceOfStateKey(stateKey: string, userId: string): GoogleService {
  return (
    GOOGLE_SERVICES.find((s) => googleStateKey(s, userId) === stateKey) ?? "drive"
  )
}

// ── LETTING GO ───────────────────────────────────────────────────────────────
//
// WHAT HAPPENS WHEN SOMEBODY DELETES A GOOGLE FILE, and what used to.
//
// Every kind this app owns the rows of retires itself. `IngestRow.retired` says
// it in as many words: "TRUE when the row has left the part of the app this kind
// mirrors — archived, switched off, deleted. The source is DEACTIVATED rather
// than skipped, which is the difference between 'the assistant stops quoting it'
// and 'the assistant quotes it forever because the sweep never visits it
// again'." An archived ticket comes back from its own table with a column set,
// and the engine acts on it.
//
// GOOGLE'S FOUR KINDS HAD NO SUCH COLUMN AND SET NO SUCH FLAG. They are not a
// table this app walks; they are a LISTING, and a deleted file is not in it. So
// the sweep moved forward past a source it would never be handed again, and the
// assistant went on quoting a document that no longer existed — indefinitely,
// because nothing in the loop was ever going to visit that row a second time.
// Edits were always fine (the content hash catches a changed file the next time
// its stamp moves). Deletions were the half nobody could see, because the
// symptom is an answer that looks perfectly normal.
//
// THE TWO RULES THIS PASS IS BUILT ON:
//
//   • ABSENCE IS NOT DELETION. A source missing from a listing may have fallen
//     outside a window, slid past a page cap, stopped matching a query, or been
//     invisible for ninety seconds because Google was unwell. Retiring on
//     absence would empty somebody's index during an outage and record it as
//     housekeeping. So absence only makes a source a CANDIDATE, and a candidate
//     is retired only when Google positively says it has gone (`googlePresence`
//     — in the bin, called off, or 404).
//   • RETIRE, NEVER DELETE. Exactly as everywhere else here: `deactivated_at` is
//     set, the chunks are dropped so nothing can be quoted from it, and the row
//     and its whole history stay where they are.
//
// AND ONE SOURCE THAT NEEDS NO GOOGLE CALL AT ALL. A Chat source IS a space
// somebody named in kwapso, so the positive signal for it is that named source
// being switched off — a fact in this app's own database. Nothing is asked of
// Google about a space, which is why `ProbableService` has three members.

/** How many of one person's sources for one kind this pass will LOOK at per
 * tick. R14's hard cap, and generous on purpose: it is one indexed read of one
 * person's own rows, and the number of Google sources anybody can have is itself
 * bounded by the listing sizes that created them. */
const RETIRE_SCAN_CAP = 500

/** How many of those it will ASK GOOGLE about per tick. This is the number that
 * costs something — one round trip each — so it is small, and the scan above is
 * randomised so that a person with more candidates than this does not have the
 * same head of the queue examined for ever while the tail is never reached. */
const RETIRE_PROBES_PER_TICK = 25

/** One live source of this person's, and the Google id behind it. */
type HeldSource = { id: string; externalId: string }

/**
 * THE SOURCES THIS PERSON STILL HOLDS FOR ONE KIND.
 *
 * Keyed on `origin_row_id` rather than on `owner_user_id`, and that is not a
 * shortcut: a source filed as TEAM material has a null owner (see `fencing`), so
 * an owner column cannot find one. The reader's id is the first half of every
 * Google `origin_row_id` by construction (see `rowId`), which makes it the one
 * key that finds this person's rows whichever shelf they sit on.
 */
async function heldSources(
  cfg: D1Rest,
  guard: MemberGuard,
  originTable: string
): Promise<HeldSource[]> {
  const rows = await d1Query<{ id: string; origin_row_id: string }>(
    cfg,
    guard.databaseId,
    // R14 hard cap: RETIRE_SCAN_CAP, said here and named above.
    //
    // RANDOM, and it is the cheapest way to be complete over time. There is no
    // "last checked" column to order by and adding one would be a migration for
    // a housekeeping detail; ordering by anything stable would examine the same
    // head every tick and never reach a person's five-hundred-and-first source.
    // Shuffling costs nothing at this size and means every source is looked at
    // within a handful of ticks.
    `SELECT id, origin_row_id FROM knowledge_sources
      WHERE origin_table = ? AND origin_row_id LIKE ? ESCAPE '\\'
        AND deactivated_at IS NULL
      ORDER BY RANDOM() LIMIT ${RETIRE_SCAN_CAP}`,
    [originTable, `${likeLiteral(guard.userId)}:%`]
  )
  // The id after the reader's own — see `rowId`. A row whose shape does not
  // match is skipped rather than guessed at.
  const prefix = `${guard.userId}:`
  return rows
    .filter((r) => r.origin_row_id.startsWith(prefix))
    .map((r) => ({ id: r.id, externalId: r.origin_row_id.slice(prefix.length) }))
}

/** STOP QUOTING IT. The same two steps the ingest engine takes for an archived
 * ticket, in the same order: mark the source, then re-index it — which, for a
 * deactivated source, is what drops its chunks. */
async function retire(env: Env, cfg: D1Rest, guard: MemberGuard, sourceId: string): Promise<void> {
  const now = new Date().toISOString()
  await d1Query(
    cfg,
    guard.databaseId,
    // R17: the predicate rides the UPDATE, so a source another pass already
    // retired moves zero rows and this one does nothing twice.
    `UPDATE knowledge_sources SET deactivated_at = ?, deactivator_name = ${sqlString(brand.name)}, updated_at = ?
      WHERE id = ? AND deactivated_at IS NULL`,
    [now, now, sourceId]
  )
  await indexSource(env, cfg, guard, sourceId)
}

/**
 * RETIRE WHAT GOOGLE NO LONGER HAS — see the essay above for both rules.
 *
 * `seen` is what each service actually returned this tick. A service MISSING
 * from it was not read at all (its kind errored, or the person has not connected
 * it), and that is the most important case to get right: an unread service must
 * retire nothing, because "we did not ask" and "it is not there" are the two
 * sentences this whole pass exists to keep apart.
 */
/** THE SPACE A THREAD BELONGS TO, off the thread's own name.
 *
 * Google's thread names are `spaces/AAA/threads/BBB`, so the space is the first
 * two segments and needs no lookup. Anything else returns the input unchanged,
 * which is the safe direction: an id this does not recognise will not match a
 * live space, and the caller's own comment explains why that is a retirement
 * rather than a silent keep. */
function spaceOfThread(threadName: string): string {
  const m = /^(spaces\/[^/]+)\//.exec(threadName)
  return m ? m[1] : threadName
}

/** The calendars this person's scope names, or `primary` when they have not
 * narrowed — the same answer `scopedCalendarWindow` reads a window from, so the
 * pass that RETIRES an event can never be asking a different calendar from the
 * one that FILED it. */
async function scopedCalendarIds(cfg: D1Rest, guard: MemberGuard): Promise<string[]> {
  const scope = await googleScope(cfg, guard, "calendar")
  if (scope.mode !== "only" || scope.containers.length === 0) return ["primary"]
  return scope.containers.map((c) => c.externalId)
}

async function retireVanished(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  seen: Map<GoogleService, Set<string>>
): Promise<void> {
  // CHAT FIRST, because it asks Google nothing.
  //
  // A chat source is keyed on a THREAD since 20 Aug 2026, and the thread name
  // CONTAINS its space (`spaces/AAA/threads/T1`), so the question "has this
  // gone?" is still answerable from a fact this app wrote down itself: is the
  // space it came out of still an active share?
  //
  // IT IS DELIBERATELY NOT "was this thread seen this tick". That reads as the
  // obvious rule and is a data-loss bug: a space is read fifty messages at a
  // time, so every conversation older than the last fifty is absent from a
  // normal tick — and absent is not gone. Keying the question on the SPACE is
  // what makes the answer conservative in the right direction, which is the same
  // property the previous space-keyed version had and the reason to keep it.
  if (seen.has("chat")) {
    const liveSpaces = new Set(
      (await listNamedSources(cfg, guard, "chat")).filter((s) => s.active).map((s) => s.externalId)
    )
    for (const held of await heldSources(cfg, guard, "google_chat"))
      if (!liveSpaces.has(spaceOfThread(held.externalId)))
        await retire(env, cfg, guard, held.id)
  }

  for (const service of ["drive", "gmail", "calendar"] as ProbableService[]) {
    const current = seen.get(service)
    // Not read this tick → nothing is knowable, so nothing happens.
    if (!current) continue
    const candidates = (await heldSources(cfg, guard, `google_${service}`))
      .filter((h) => !current.has(h.externalId))
      .slice(0, RETIRE_PROBES_PER_TICK)
    if (candidates.length === 0) continue
    // A token this person has, by definition: the kind was read a moment ago
    // with it. A failure here is not "everything has gone" — it is one service
    // this tick cannot ask about, and it is left alone.
    let token: string
    try {
      token = (await accessTokenFor(env, cfg, guard, service)).token
    } catch {
      continue
    }
    // WHICH CALENDARS TO ASK. Scope made "the calendar" a list, and an event on
    // a named secondary calendar is a 404 on `primary` — which this pass reads
    // as "gone" and acts on. Asking the calendars the person actually named is
    // what keeps that from retiring live material and recording it as
    // housekeeping. Every other service ignores the argument.
    const calendarIds =
      service === "calendar" ? await scopedCalendarIds(cfg, guard) : ["primary"]
    for (const held of candidates)
      if ((await googlePresence(service, token, held.externalId, calendarIds)) === "gone")
        await retire(env, cfg, guard, held.id)
  }
}
