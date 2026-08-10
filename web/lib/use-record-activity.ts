"use client"

// The ONE web-side read of a RECORD's activity — the client half of Law R5's
// generic (table, id) path: any module's history with no per-module code. It
// carries THREE things because the door already returns all three, and splitting
// them is what let them drift:
//
//   • the rows — page one of the feed, cache-first + live (the live registry's
//     `deps` invalidate this key when the record changes, and the refetch
//     re-primes the total and the cursor below in the same round-trip);
//   • the TOTAL — the exact server COUNT(*) of that record's history, which the
//     Activity TAB badges (R8 says the tab carries the count, R16 says the
//     number is a server total through `formatCount`). The feed is PAGED, so
//     the loaded rows' length is a ceiling, not a total — a record with 200
//     events would badge "50" forever;
//   • the CURSOR — parked in the sidecar <LoadMore> reads, plus the one fetcher
//     that spends it (R14). Without it the badge above told the truth about a
//     feed with no way to reach the other 93 rows: an exact count of what the
//     screen refuses to show is worse than no count at all.

import { tenancy } from "@/lib/api"
import { cursorKey } from "@/lib/live-resources"
import { primeCache, useCached, useCachedValue } from "@shared/web/store"
import type { ActivityItem } from "@shared/types"

/** The cache key holding one record's activity rows. The same key the live
 * registry names in its `deps`, so a change to the record refreshes its feed. */
export function recordActivityKey(table: string, id: string): string {
  return `activity:record:${table}:${id}`
}

/** One record's activity: its rows (the loaded pages), the exact server total the
 * Activity tab badges, and what <LoadMore> needs to fetch the next page — the
 * list's own key plus the ONE fetcher that spends the cursor. `total` is
 * undefined until the first load lands — which `formatCount` renders as nothing,
 * never a "0" that reads as "no history".
 *
 * A later page appends rows and NEVER touches the total: the count is the whole
 * history's, not the loaded prefix's, so it must not move as you load more. */
export function useRecordActivity(
  table: string,
  id: string
): {
  rows: ActivityItem[]
  total: number | undefined
  error: unknown
  listKey: string
  fetchPage: (cursor: string) => Promise<{ rows: ActivityItem[]; nextCursor: string | null }>
} {
  const key = recordActivityKey(table, id)
  const query = useCached<ActivityItem[]>(key, () =>
    tenancy.recordActivity(table, id).then((r) => {
      primeCache(`total:${key}`, r.total)
      primeCache(cursorKey(key), r.nextCursor)
      return r.activity
    })
  )
  return {
    rows: query.data ?? [],
    total: useCachedValue<number>(`total:${key}`),
    error: query.error,
    listKey: key,
    fetchPage: (cursor: string) =>
      tenancy
        .recordActivity(table, id, cursor)
        .then((r) => ({ rows: r.activity, nextCursor: r.nextCursor })),
  }
}
