// THE ONE BOUNDED COLLECTION COUNT (R16, amended 2026-08-14).
//
// R16 has always demanded an EXACT server `COUNT(*)` behind every badge, and it
// was right about the failure it was written for: a 24,011-row catalogue
// advertising "1000", which was a capped list's LENGTH wearing a total's clothes.
// What it did not distinguish is exactness from unboundedness. A `COUNT(*)` over a
// GROWING table reads every row that matches, for ever, on every page of a paged
// screen — the one query in the app whose cost has no ceiling at all.
//
// THE AMENDMENT IS NARROWER THAN "ALLOW AN APPROXIMATE COUNT", and the narrowness
// is the whole point:
//
//   A collection total is counted EXACTLY up to a ceiling, and the count stops
//   there. Below the ceiling nothing changes — same number, same rendering, byte
//   for byte. At or above it the door reports "at least N", and SAYS SO in the
//   same object (`totalCapped`), so no caller can mistake the one for the other.
//
// IT CAN ONLY EVER DO LESS WORK THAN BEFORE. `SELECT COUNT(*) FROM (SELECT 1 FROM t
// WHERE <fence> LIMIT CAP + 1)` is identical work below the ceiling and strictly
// less above it, because the inner LIMIT stops a scan that previously ran to the
// end. That was the owner's condition — "as long as you don't slow down the way my
// app works" — and it is met by construction rather than by measurement.
//
// WHY A CAP AND NOT A BRIEF CACHE — the (a)-over-(b) decision, recorded because it
// was argued and lost by the more obvious option. The alternative was to keep the
// count exact and cache it for a minute per collection per team. It was rejected
// for two reasons, and the second is the one that decided it:
//
//   1. A CACHE FIGHTS A MECHANISM THAT ALREADY EXISTS. `web/components/app-shell.tsx`
//      bumps the primed `total:` sidecar by ±1 on every add/remove ping, so the
//      badge is already correct BETWEEN fetches. A 60-second server cache would be
//      overwritten back to the stale value by the next list fetch: create a ticket,
//      the badge goes 222 → 223, then jumps BACK to 222 for a minute. A badge that
//      moves backwards is worse than one that says "at least", and it is exactly
//      the quietly-wrong number R16 exists to prevent. Invalidation does not rescue
//      it — the mutation runs in a different isolate from the one holding the
//      cache, so cross-isolate invalidation would cost a Durable Object round-trip
//      on every count read, which is MORE work than today.
//
//   2. THE CACHE KEY WOULD HAVE TO BE THE CALLER'S FENCE, NOT THE COLLECTION.
//      These counts are permission-dependent: the activity total varies with the
//      caller's module rights (R18) and their account fence, tickets with
//      `ticketFence`, knowledge with `ownerClause`. Keyed by `(team, collection)`
//      it discloses one caller's count to another; keyed correctly (the exact SQL
//      and params) it fragments until the hit rate stops being the win. This
//      codebase has been bitten twice by that substitution — R21's "enumerate by
//      what a client can REACH, never by what a module owns".
//
// AND THE CEILING IS A MILLION, not the fifty thousand first proposed, because a
// cap set too low trades a performance problem for a usefulness one: at 100,000
// rows a badge reading "50k+" tells a manager LESS than "100k" does. At a million
// the hedge only appears where "1m+" is genuinely as informative as "1,043,221".
// It is deliberately the SAME number as the search ceiling (`TOTAL_COUNT_CAP`), so
// the app has one place where counting stops rather than two.
//
// MEASURED, NOT ASSUMED. Against live staging data on 14 Aug 2026 the largest
// collection in the app is the activity feed at 2,253 rows; knowledge sources 858,
// stories 320, tickets 222. The ceiling is roughly 400× beyond the largest thing
// that exists, so no screen in the product renders differently today — the
// amendment is a ceiling installed while the room is empty.
//
// HONEST LIMITATION, worth not re-deriving: a one-million-row bounded scan is a
// CEILING, not a cheap query. This bounds the worst case and removes the unbounded
// growth; it does not make the count O(1). A constant-time count needs a counter
// maintained by every write, which costs every mutation — named here and not taken.
//
// SCOPED TO GROWING_COLLECTIONS, deliberately. A bounded collection (roles,
// members, dropdown values) has a natural ceiling already: its count cannot run
// away because the collection cannot. Wrapping those would be ceremony.

import { d1Query, type D1Rest } from "./d1-rest"
import { TOTAL_COUNT_CAP } from "./limits"

/** One row per collection member, BOUNDED — the subquery every count here wraps.
 *
 * `LIMIT CAP + 1` rather than `CAP`: the extra row is how "exactly at the cap" is
 * told apart from "past it" without a second query, exactly as `toPage` uses a
 * spare row to learn `hasMore`.
 *
 * Exported because one caller cannot use the helpers below — the work-log total
 * computes a capped count and an EXACT sum in one statement — and a door that
 * bounded its own scan with its own hand-written number is how the one ceiling
 * becomes two. */
export function boundedInner(inner: string): string {
  return `(${inner} LIMIT ${TOTAL_COUNT_CAP + 1})`
}

/** What a door reports for a count that may have stopped early.
 *
 * At or beyond the cap it reports the cap itself, which the badge renders "1m+".
 * A collection holding EXACTLY the cap therefore wears a "+" it has not quite
 * earned — over-claiming UNCERTAINTY by one row, never over-claiming SIZE, which
 * is the same direction `formatCount` already floors in. */
export function reportedTotal(counted: number): number {
  return Math.min(counted, TOTAL_COUNT_CAP)
}

/** Did this count stop early? THE ONE PREDICATE — `pagedJson` asks it so every
 * paged door answers `totalCapped` without being told to, and no door can promise
 * an exactness it did not pay for. */
export function isCapped(reported: number): boolean {
  return reported >= TOTAL_COUNT_CAP
}

/** THE COUNT. `inner` is the collection's OWN question — the same FROM, the same
 * joins, the same WHERE the page read used, selecting one row per member.
 *
 * It must be the same question, and that is not new: R16 has always required the
 * total and the page to agree, because a badge counting more than its list can show
 * is itself the leak. What is new is only where the counting stops.
 *
 * Returns the total, already clamped. A door needing a second aggregate beside the
 * count (a "mine" tally) uses `countCollectionWith`. */
export async function countCollection(
  cfg: D1Rest,
  databaseId: string,
  inner: string,
  params: (string | number | null)[] = []
): Promise<number> {
  return reportedTotal(await countRaw(cfg, databaseId, inner, params))
}

/** THE SAME COUNT, ACROSS A SPLIT MODULE'S SHARDS — and the one aggregate that
 * genuinely CAN be merged, which is why it lives here rather than being refused
 * by `d1QueryAcross`.
 *
 * That refusal is right about aggregates in general: run `SELECT COUNT(*)` across
 * three databases and you get three rows, and every caller in the base reads
 * `rows[0].n`, so a split module would report the FIRST shard's count as the whole
 * total — R16's number, quietly wrong. What makes THIS case different is that the
 * fold is known: a row belongs to exactly one shard, so the total is the SUM of
 * the per-shard counts, and there is nothing to sort or de-duplicate. A page
 * cannot be merged that way (the rows must be ordered BETWEEN shards, and the
 * cursor is a position in an ordering no single shard has), so paging stays
 * refused. Counting was never the hard half; it was only ever grouped with it.
 *
 * IT SUMS BEFORE IT CLAMPS, which is what keeps it exact. Each shard counts to
 * CAP + 1, so if the true total is under the ceiling no shard truncated and the
 * sum is the exact number. If the sum lands over the ceiling — whether because one
 * shard truncated or because several honest counts added up — it is clamped once,
 * at the end, and reports as capped. Clamping each shard first would throw away
 * the very information the sum needs.
 *
 * ONE DATABASE IS THE ORDINARY CASE and costs nothing extra: the loop runs once. */
export async function countCollectionAcross(
  cfg: D1Rest,
  databaseIds: string[],
  inner: string,
  params: (string | number | null)[] = []
): Promise<number> {
  const counts = await Promise.all(
    databaseIds.map((id) => countRaw(cfg, id, inner, params))
  )
  return reportedTotal(counts.reduce((a, b) => a + b, 0))
}

/** One shard's bounded count, UNCLAMPED — the number `countCollectionAcross` has
 * to add up before it decides whether the total reached the ceiling. */
async function countRaw(
  cfg: D1Rest,
  databaseId: string,
  inner: string,
  params: (string | number | null)[]
): Promise<number> {
  const rows = await d1Query<{ n: number }>(
    cfg,
    databaseId,
    `SELECT COUNT(*) AS n FROM ${boundedInner(inner)}`,
    params
  )
  return rows[0]?.n ?? 0
}

/** The same bounded subquery, with more than one number computed over it.
 *
 * `aggregates` names what to compute (`COUNT(*) AS total, SUM(is_mine) AS mine`),
 * and `inner` must SELECT the per-row values those aggregates read. The caller
 * clamps its own numbers with `reportedTotal` — there is no single "the total" here
 * to clamp on its behalf, and guessing which of two numbers is the count is the
 * kind of helpfulness that eventually clamps the wrong one.
 *
 * A SUM over a truncated set is a PARTIAL SUM. Every aggregate passed here is
 * therefore a DISPLAY tally that rides beside a display count — the two "mine"
 * badges. A number that feeds a DECISION (billable seconds, an export's
 * completeness) must not come through here; `countWorkLogs` is the worked example
 * of splitting the two apart. */
export async function countCollectionWith<Row extends Record<string, unknown>>(
  cfg: D1Rest,
  databaseId: string,
  inner: string,
  aggregates: string,
  params: (string | number | null)[] = []
): Promise<Row | undefined> {
  const rows = await d1Query<Row>(
    cfg,
    databaseId,
    `SELECT ${aggregates} FROM ${boundedInner(inner)}`,
    params
  )
  return rows[0]
}
