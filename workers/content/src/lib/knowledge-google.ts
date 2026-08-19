// GOOGLE MATERIAL, AS KNOWLEDGE SOURCES — the four kinds that make a named Drive
// folder, a named Chat space, scoped mail and the diary answerable.
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

import { d1Query, likeLiteral, type D1Rest } from "@shared/workers/d1-rest"
import type { MemberGuard } from "@shared/workers/gating"
import { GOOGLE_SERVICES, type GoogleItem, type GoogleService } from "@shared/types"
import type { Env } from "../env"
import { accessTokenFor, listConnections, listNamedSources } from "./google"
import { googlePresence, type ProbableService } from "./google-api"
import { hydrateText, readGoogleMaterial } from "./google-read"
import { indexSource } from "./knowledge"
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
function googleStateKey(service: GoogleService, userId: string): string {
  return `${KIND_OF[service]}:${userId}`
}

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
    if (!hydrate || wanted.length === 0) return wanted
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
    return wanted.map((r) => ({ ...r, body: textById.get(r.originRowId) || r.body }))
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
      textVersion: 1,
      // READING FROM THE CALENDAR IS WHAT TELLS THE KNOWLEDGE BASE WHAT WAS
      // AGREED WHEN. A meeting's title and the note somebody put in the
      // description are usually the only written record that a decision was
      // taken on a Tuesday in March — and "when did we agree that?" is a question
      // no other table in this app can answer.
      read: (_cfg, _guard, cursor, limit) =>
        slice("calendar", cursor, limit, (items) =>
          items.map((item) => ({
            originRowId: rowId(item),
            sortAt: moment(item.updatedAt),
            title: item.title,
            body: [`Met on ${(moment(item.updatedAt) || "an unknown date").slice(0, 10)}.`, item.text]
              .filter(Boolean)
              .join("\n\n"),
            sourceUrl: item.url,
            ...fencing(item),
          }))
        ),
    },
    {
      kind: KIND_OF.chat,
      stateKey: googleStateKey("chat", guard.userId),
      table: "google_chat",
      label: "Chat spaces",
      windowed: true,
      textVersion: 1,
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
            title: item.title,
            // ALREADY ATTRIBUTED, line by line, by `chatThreads`. It used to be
            // re-attributed here from the title, which is why every line read
            // "Somebody in this space: Somebody in this space:" the moment the
            // reader started doing it properly.
            body: item.text,
            // AND IT LINKS BACK. This was `null` — so Chat was the one Google
            // kind the assistant could quote and nobody could go and read.
            sourceUrl: item.url,
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
): Promise<{ results: SweepResult[]; skipped: boolean }> {
  const connected = new Set(
    (await listConnections(cfg, guard)).filter((c) => c.active).map((c) => c.service)
  )
  const seen = new Map<GoogleService, Set<string>>()
  const kinds = googleIngestKinds(env, cfg, guard, seen).filter((k) =>
    connected.has(serviceOfStateKey(k.stateKey as string, guard.userId))
  )
  if (kinds.length === 0) return { results: [], skipped: false }

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
    if (recent) return { results: recent, skipped: true }
  }

  const results = await sweepKinds(env, cfg, guard, kinds, options.limit ?? INGEST_SOURCES_PER_TICK)
  // AFTER the sweep, never instead of it: the reads above are what filled `seen`,
  // and a retire pass that ran first would be reasoning about last tick's world.
  await retireVanished(env, cfg, guard, seen)
  return { results, skipped: false }
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
    `UPDATE knowledge_sources SET deactivated_at = ?, deactivator_name = 'kwapso', updated_at = ?
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
    for (const held of candidates)
      if ((await googlePresence(service, token, held.externalId)) === "gone")
        await retire(env, cfg, guard, held.id)
  }
}
