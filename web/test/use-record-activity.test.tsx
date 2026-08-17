// The RUNTIME half of Law R8's record-detail rule. rules.test.ts proves the tabs
// are wired to a count; this proves the count that arrives is the DOOR'S EXACT
// TOTAL and not the page it came with — the exact confusion the law exists to
// stop (a paged feed's loaded length is a ceiling, so a record with 200 events
// would badge "50" forever).

import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { formatCount } from "@shared/web/format-count"
import { cursorKey, loadMore } from "@/lib/live-resources"
import { invalidate, readCache } from "@shared/web/store"
import { recordActivityKey, useRecordActivity } from "@/lib/use-record-activity"

const recordActivity = vi.fn()
vi.mock("@/lib/api", () => ({
  tenancy: {
    recordActivity: (table: string, id: string, cursor?: string | null) =>
      recordActivity(table, id, cursor),
  },
}))

/** One page of a much longer history — 2 rows on the wire, 143 in the table.
 * `nextCursor` null is the last page (which is how <LoadMore> stops offering). */
const page = (rows: number, total: number, nextCursor: string | null = "opaque", from = 0) => ({
  activity: Array.from({ length: rows }, (_, i) => ({
    id: `a${from + i}`,
    type: "edited",
    description: "changed the title",
    actorName: "Sam",
    createdAt: "2026-08-09T10:00:00Z",
  })),
  total,
  hasMore: nextCursor !== null,
  nextCursor,
})

// The cache is a module singleton — a fresh record id per test so nothing bleeds.
let n = 0
const freshId = () => `rec-${++n}`

// A BLOCK body on purpose: `() => mock.mockReset()` returns the mock, and vitest
// treats a function returned from beforeEach as a teardown callback — it would
// then CALL the mock after each test (hanging on the never-resolving fixture).
beforeEach(() => {
  recordActivity.mockReset()
})

describe("useRecordActivity", () => {
  it("returns page one's rows and the door's EXACT total, not the page length", async () => {
    const id = freshId()
    recordActivity.mockResolvedValue(page(2, 143))
    const { result } = renderHook(() => useRecordActivity("brand_assets", id))

    await waitFor(() => expect(result.current.total).toBe(143))
    expect(result.current.rows).toHaveLength(2) // the page…
    expect(formatCount(result.current.total)).toBe("143") // …the badge counts them all
    expect(recordActivity).toHaveBeenCalledWith("brand_assets", id, undefined) // page one asks for no cursor
  })

  // R14 — the other half of that same truth: a badge counting 143 over a feed
  // frozen at its newest 50 is an exact count of rows the screen refuses to show.
  it("parks the next cursor and appends page two — the badge stays the SERVER total", async () => {
    const id = freshId()
    recordActivity.mockResolvedValue(page(2, 143, "cursor-1"))
    const { result } = renderHook(() => useRecordActivity("help", id))
    await waitFor(() => expect(result.current.total).toBe(143))
    // The cursor sidecar <LoadMore> reads, keyed off the feed's own cache key.
    expect(readCache(cursorKey(recordActivityKey("help", id)))).toBe("cursor-1")

    // <LoadMore> hands the opaque cursor straight back and APPENDS what returns.
    recordActivity.mockResolvedValue(page(2, 143, null, 2))
    await loadMore(result.current.listKey, result.current.fetchPage)

    expect(recordActivity).toHaveBeenLastCalledWith("help", id, "cursor-1")
    await waitFor(() => expect(result.current.rows).toHaveLength(4)) // page one + page two
    expect(result.current.rows.map((r) => r.id)).toEqual(["a0", "a1", "a2", "a3"])
    // R16: loading more must NOT move the count — it was never the loaded length.
    expect(result.current.total).toBe(143)
    // Last page: the sidecar empties, so the button takes itself away.
    expect(readCache(cursorKey(recordActivityKey("help", id)))).toBeNull()
  })

  it("badges nothing until the first page lands (never a '0' that reads as empty)", () => {
    const id = freshId()
    recordActivity.mockReturnValue(new Promise(() => {})) // still in flight
    const { result } = renderHook(() => useRecordActivity("help", id))
    expect(result.current.total).toBeUndefined()
    expect(formatCount(result.current.total)).toBe("")
    expect(result.current.rows).toEqual([])
  })

  it("re-primes the total when the record changes — rows and badge can't drift apart", async () => {
    const id = freshId()
    recordActivity.mockResolvedValue(page(2, 143))
    const { result } = renderHook(() => useRecordActivity("help", id))
    await waitFor(() => expect(result.current.total).toBe(143))

    // A status change invalidates the feed the way the detail screens do.
    recordActivity.mockResolvedValue(page(3, 144))
    invalidate(recordActivityKey("help", id))
    await waitFor(() => expect(result.current.total).toBe(144))
    expect(result.current.rows).toHaveLength(3)
  })

  it("keys the rows where the live registry's deps already point", async () => {
    const id = freshId()
    recordActivity.mockResolvedValue(page(1, 9))
    const { result } = renderHook(() => useRecordActivity("help", id))
    await waitFor(() => expect(result.current.total).toBe(9))
    // live-resources' help deps invalidate `activity:record:help:<id>` — the same
    // string this seam owns. If they ever diverge, a reply stops refreshing the feed.
    expect(recordActivityKey("help", id)).toBe(`activity:record:help:${id}`)
    expect(readCache(recordActivityKey("help", id))).toBeDefined()
  })
})
