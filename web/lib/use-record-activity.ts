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

import { ApiFailure, tenancy } from "@/lib/api"
import { nameInitials } from "@/lib/identity"
import { cursorKey } from "@/lib/live-resources"
import { toast } from "@shared/ui/components/sonner/sonner"
import { formatRelative } from "@shared/web/format"
import { useLanguage } from "@shared/web/language"
import { primeCache, useCached, useCachedValue } from "@shared/web/store"
import type { ActivityItem } from "@shared/types"

/** One activity row, dressed for the library ActivityFeed. Every record detail
 * wrote this same four-line map out for itself — same fields, same date format —
 * which is four places to change the day a feed row grows a field.
 *
 * `initials` rides here rather than being recomputed at each of the two
 * consumers (the record footer's Latest-activity column, the Activity tab's
 * own feed) — the SAME generic-activity-path law (R5) that keeps this one
 * fetch shared keeps its derived display fields shared too, so a mark that
 * renders blank in one place can't happen while the other gets it right.
 *
 * `timestamp` is `formatRelative` — "2d ago", falling back to an absolute date
 * past a week — the SAME treatment the record footer's own audit column
 * already used one field over (`recordAuditEntries`, record-chrome.tsx). Both
 * consumers used to run this through `formatActivityWhen` instead (a raw,
 * sortable "2026-08-13 13:16"), which is a table-column format and reads as
 * a bug sitting next to a relative phrase — the client's own words, "look at
 * the format of the dates! so wrong / i want them all like now the ones on
 * record." `dateTime` rides alongside it, the raw ISO, for the kit's `<time
 * datetime>` attribute — a human string needs its machine value paired with
 * it, not thrown away. */
export type ActivityFeedRow = {
  id: string
  description: string
  actor: string | undefined
  initials: string
  timestamp: string
  dateTime: string
}

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
/**
 * `table` / `id` may be NULL, and that is not a convenience — it is what lets
 * the deep-link host read a record's history at all. The host resolves every
 * module's data in ONE hook (use-screen-data), above a render switch full of
 * early returns, so it cannot call this conditionally from inside a branch. A
 * null pair keys the read to null, which fetches nothing and returns the same
 * empty shape a first render sees.
 */
export function useRecordActivity(
  table: string | null,
  id: string | null
): {
  rows: ActivityItem[]
  /** The same rows, ready to hand straight to the library ActivityFeed. */
  items: ActivityFeedRow[]
  total: number | undefined
  error: unknown
  listKey: string
  fetchPage: (cursor: string) => Promise<{ rows: ActivityItem[]; nextCursor: string | null }>
  /**
   * Add a note to this record — CH27.8's add-a-note field on the kit's ink
   * footer (`RecordScreen`'s `onAddNote`), which draws only when a caller
   * passes this at all. Synchronous, matching the kit's own `(value: string)
   * => void` contract (it clears the field on Enter before any request could
   * have returned); the request runs in the background and toasts on either
   * end.
   *
   * NO explicit cache-priming here, on purpose: the door publishes the SAME
   * resource+id every real edit on this record already does, and that
   * resource's own `TEAM_RESOURCES` entry (web/lib/live-resources.ts) already
   * lists this record's `activity:record:<table>:<id>` key among its deps —
   * the live-sync ping every other note, reply or edit on this record already
   * rides refreshes this one too, with no new listener code (R15).
   */
  addNote: (note: string) => void
} {
  const { t, lang } = useLanguage()
  const on = Boolean(table && id)
  const key = recordActivityKey(table ?? "", id ?? "")
  const query = useCached<ActivityItem[]>(on ? key : null, () =>
    tenancy.recordActivity(table as string, id as string).then((r) => {
      primeCache(`total:${key}`, r.total)
      primeCache(cursorKey(key), r.nextCursor)
      return r.activity
    })
  )
  const rows = query.data ?? []
  return {
    rows,
    items: rows.map((a) => ({
      id: a.id,
      description: a.description,
      actor: a.actorName ?? undefined,
      initials: nameInitials(a.actorName),
      timestamp: formatRelative(a.createdAt, t, lang),
      dateTime: a.createdAt,
    })),
    total: useCachedValue<number>(on ? `total:${key}` : null),
    error: query.error,
    listKey: key,
    fetchPage: (cursor: string) =>
      tenancy
        .recordActivity(table as string, id as string, cursor)
        .then((r) => ({ rows: r.activity, nextCursor: r.nextCursor })),
    addNote: (note: string) => {
      if (!table || !id) return
      tenancy.addNote(table, id, note).then(
        () => toast.success(t("Note added.")),
        (err: unknown) =>
          toast.error(err instanceof ApiFailure ? err.message : t("Couldn't add the note. Try again."))
      )
    },
  }
}
