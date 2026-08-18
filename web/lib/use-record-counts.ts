"use client"

// THE BADGES, BEFORE THE CLICK — the web half of shared/record-counts.ts.
//
// THE BUG IT CLOSES. Every collection tab on a record detail badged a sidecar
// cache key that only the tab PANEL's own list fetch ever primed, and
// `useCachedValue` is a pure cache READ — it never fetches. So the number
// appeared the moment you opened the tab and not one moment before, and because
// `formatCount` renders nothing for a zero AND nothing for a missing number, an
// unopened tab was indistinguishable from an empty one. The owner's words: "until
// I don't click on the tab, I am always assuming that there is no information in
// that tab because there's no badge count."
//
// THE FIX IS HIS: fetch the COUNTS eagerly, keep the ROWS lazy. This hook asks
// whichever doors a record's children live behind (one per worker, in parallel)
// and primes THE SAME `totalKey(...)` sidecars the badges already read — so the
// badge code barely changes, the tab panels keep priming those same keys when
// they eventually load their rows, and R16 still has exactly one counting path
// to arbitrate.
//
// IT DOES NOT BLOCK FIRST PAINT. It is a separate read from the record's own,
// running beside it: the record is what a person came for, and a screen that
// waited for its badges before drawing its content would have traded one
// annoyance for a worse one. Nothing on the screen awaits this hook — the badges
// simply arrive, exactly as the activity total does.
//
// THREE STATES, KEPT APART IN THE DATA (they render the same, which is the whole
// problem):
//   • a NUMBER in the sidecar — counted. `0` means there are none, and we know;
//   • `null` in the sidecar — the caller's role holds no read right on that
//     module, so nobody counted (R18). In practice the tab is not drawn either,
//     because the screen gates it on the same right;
//   • NOTHING in the sidecar — not counted yet. The only state that resolves.

import { content as contentApi, tenancy } from "@/lib/api"
import { RECORD_CHILDREN, type RecordChild } from "@shared/record-counts"
import { primeCache, useCached } from "@shared/web/store"
import { recordCountsKey, totalKey } from "@/lib/live-resources"

/** Which doors a record's children live behind, deduped. A record whose children
 * are all one worker's costs one request; the two that straddle cost two, in
 * parallel. */
function doorsFor(children: RecordChild[]): RecordChild["door"][] {
  return [...new Set(children.map((c) => c.door))]
}

/** The reads currently in the air, by record. `useCached` revalidates once per
 * MOUNTED subscriber, and a company's screen hands an individual straight to the
 * contact screen — so a person's record has two components asking for the same
 * counts in the same tick. One question, one answer: the second caller joins the
 * first flight rather than opening its own.
 *
 * Cleared when the flight settles, so this is never a cache of its own — the
 * store is the cache, and two of those would be the drift this whole file
 * exists to prevent. */
const inFlight = new Map<string, Promise<Record<string, number | null>>>()

/** Ask every door this record needs and prime one sidecar per child collection.
 *
 * The doors are asked TOGETHER and their answers merged, so a record straddling
 * two workers still costs one round trip's worth of waiting. A `null` is primed
 * exactly as a number is: "you may not look" is a fact the cache should hold,
 * not an absence it should keep re-asking about. */
function fetchRecordCounts(table: string, id: string): Promise<Record<string, number | null>> {
  const flightKey = `${table}:${id}`
  const already = inFlight.get(flightKey)
  if (already) return already
  const children = RECORD_CHILDREN[table] ?? []
  const flight = Promise.all(
    doorsFor(children).map((door) =>
      (door === "tenancy" ? tenancy : contentApi).recordCounts(table, id).then((r) => r.counts)
    )
  )
    .then((answers) => {
      const counts = Object.assign({}, ...answers) as Record<string, number | null>
      for (const child of children)
        if (child.key in counts) primeCache(totalKey(child.key, id), counts[child.key])
      return counts
    })
    .finally(() => inFlight.delete(flightKey))
  inFlight.set(flightKey, flight)
  return flight
}

/** Badge this record's tabs on arrival.
 *
 * Call it at the top of a record detail and then ignore the return value — the
 * badges read the sidecars they always read. `table` / `id` may be null (a
 * screen that has not resolved which record it is yet), which fetches nothing.
 *
 * A record kind with no children in the registry fetches nothing either: a role
 * and a source badge only their Activity tab, whose total already comes back with
 * the feed. A task and a meeting were on that list until 2026-08-18 — both carry
 * a Time tab, and both badged a sidecar nothing filled until it was opened. */
export function useRecordCounts(table: string | null, id: string | null): void {
  const on = Boolean(table && id && RECORD_CHILDREN[table as string]?.length)
  useCached<Record<string, number | null>>(
    on ? recordCountsKey(table as string, id as string) : null,
    () => fetchRecordCounts(table as string, id as string)
  )
}
