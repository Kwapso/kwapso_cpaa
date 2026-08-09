"use client"

// The ONE web-side read of a RECORD's activity — the client half of Law R5's
// generic (table, id) path: any module's history with no per-module code. It
// carries TWO things because the door already returns both, and splitting them
// is what let them drift:
//
//   • the rows — page one of the feed, cache-first + live (the live registry's
//     `deps` invalidate this key when the record changes, and the refetch
//     re-primes the total below in the same round-trip);
//   • the TOTAL — the exact server COUNT(*) of that record's history, which the
//     Activity TAB badges (R8 says the tab carries the count, R16 says the
//     number is a server total through `formatCount`). The feed is PAGED, so
//     the loaded rows' length is a ceiling, not a total — a record with 200
//     events would badge "50" forever.

import { tenancy } from "@/lib/api"
import { primeCache, useCached, useCachedValue } from "@/lib/store"
import type { ActivityItem } from "@shared/types"

/** The cache key holding one record's activity rows. The same key the live
 * registry names in its `deps`, so a change to the record refreshes its feed. */
export function recordActivityKey(table: string, id: string): string {
  return `activity:record:${table}:${id}`
}

/** One record's activity: its rows (page one) plus the exact server total the
 * Activity tab badges. `total` is undefined until the first load lands — which
 * `formatCount` renders as nothing, never a "0" that reads as "no history". */
export function useRecordActivity(
  table: string,
  id: string
): { rows: ActivityItem[]; total: number | undefined; error: unknown } {
  const key = recordActivityKey(table, id)
  const query = useCached<ActivityItem[]>(key, () =>
    tenancy.recordActivity(table, id).then((r) => {
      primeCache(`total:${key}`, r.total)
      return r.activity
    })
  )
  return { rows: query.data ?? [], total: useCachedValue<number>(`total:${key}`), error: query.error }
}
