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

import type { D1Rest } from "@shared/workers/d1-rest"
import type { MemberGuard } from "@shared/workers/gating"
import { GOOGLE_SERVICES, type GoogleItem, type GoogleService } from "@shared/types"
import type { Env } from "../env"
import { listConnections } from "./google"
import { hydrateText, readGoogleMaterial } from "./google-read"
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
export function googleIngestKinds(env: Env, cfg: D1Rest, guard: MemberGuard): IngestKind[] {
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
      // ONE SOURCE PER SPACE, NOT PER MESSAGE. A chat message on its own is four
      // words with no subject; the thing worth answering from is the
      // CONVERSATION, which is the same reason a ticket's replies are folded into
      // the ticket rather than indexed one by one. Fifty messages also means
      // fifty sources, fifty upserts and fifty embedding calls for a morning's
      // chatter.
      read: (_cfg, _guard, cursor, limit) =>
        slice("chat", cursor, limit, (items) => {
          const bySpace = new Map<string, GoogleItem[]>()
          for (const item of items) {
            const key = item.sourceId ?? item.externalId
            bySpace.set(key, [...(bySpace.get(key) ?? []), item])
          }
          return [...bySpace.values()]
            .filter((group) => group.length > 0)
            .map((group) => {
              // Google hands the newest first; a conversation reads forwards.
              const ordered = [...group].reverse()
              const newest = group.reduce((a, b) => (moment(a.updatedAt) > moment(b.updatedAt) ? a : b))
              const first = ordered[0] as GoogleItem
              return {
                // The SPACE is the row, so its id is what the source is keyed on.
                originRowId: `${first.ownerUserId}:${first.sourceId ?? first.externalId}`,
                // The newest message decides where the space sits in the window:
                // a space somebody spoke in this morning is the one that changed.
                sortAt: moment(newest.updatedAt),
                // "Space — sender" is the item title; the space's own name is
                // everything before the dash, and it is what a person recognises.
                title: first.title.split(" — ")[0] || first.title,
                body: ordered.map((m) => `${m.title.split(" — ")[1] ?? "Someone"}: ${m.text}`).join("\n"),
                sourceUrl: null,
                ...fencing(first),
              }
            })
        }),
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
  const kinds = googleIngestKinds(env, cfg, guard).filter((k) =>
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

  return {
    results: await sweepKinds(env, cfg, guard, kinds, options.limit ?? INGEST_SOURCES_PER_TICK),
    skipped: false,
  }
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
