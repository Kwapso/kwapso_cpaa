// THE TAB THAT IS OPEN ALL DAY.
//
// CACHING.md is written for a power user who opens the app in the morning and does
// not reload. The cache backing every screen was a plain `Map` that only ever grew:
// nothing evicted, nothing expired, and nothing cleared it when the person or the
// team changed. So a day of navigation accumulated every list ever opened (up to
// LIST_HARD_CAP rows each) plus every page `loadMore` had ever appended, and a
// signed-out tab could still paint a member list out of memory.
//
// Three bounds, and one rule about eviction that matters more than the bounds do:
// eviction never takes a key somebody is looking at. Dropping a subscribed key to
// make room for one nobody is reading would blank a live list.

import { describe, expect, it, beforeEach, vi, afterEach } from "vitest"

import { clearCache, primeCache, readCache, useCachedValue } from "@shared/web/store"

/** The bounds under test, restated here so a change to either has to be a change
 * to this file too — a bound nobody asserts is a comment. */
const MAX_CACHED_KEYS = 120
const MAX_CACHED_ROWS = 20_000
const MAX_CACHE_AGE_MS = 10 * 60 * 1000

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}` }))

beforeEach(() => clearCache())
afterEach(() => vi.useRealTimers())

describe("the cache has a key ceiling", () => {
  it("stops growing past MAX_CACHED_KEYS, and keeps the most recent", async () => {
    for (let i = 0; i < MAX_CACHED_KEYS + 40; i++) primeCache(`k${i}`, { i })
    // Count what survived by asking for every key ever written.
    let held = 0
    for (let i = 0; i < MAX_CACHED_KEYS + 40; i++) if (readCache(`k${i}`) !== undefined) held++
    expect(held, "an unbounded Map is the whole finding").toBeLessThanOrEqual(MAX_CACHED_KEYS)
    expect(readCache(`k${MAX_CACHED_KEYS + 39}`), "the newest write survives").toBeDefined()
    expect(readCache("k0"), "the oldest untouched one does not").toBeUndefined()
  })
})

describe("the cache has a ROW ceiling — the number that actually costs memory", () => {
  it("evicts on total rows, not just on key count", () => {
    // Ten keys, well under MAX_CACHED_KEYS, holding far more rows than the budget.
    // A key-only bound would keep every one of them.
    for (let i = 0; i < 10; i++) primeCache(`big${i}`, rows(5_000))
    let heldRows = 0
    for (let i = 0; i < 10; i++) heldRows += (readCache<unknown[]>(`big${i}`) ?? []).length
    expect(heldRows, "one scrolled list must not spend the whole tab's memory").toBeLessThanOrEqual(
      MAX_CACHED_ROWS
    )
  })

  it("a non-array value costs one row, so totals and cursors are not what fills it", () => {
    for (let i = 0; i < 100; i++) primeCache(`total:${i}`, i)
    // 100 scalars is 100 rows — nowhere near the ceiling, so all of them survive.
    let held = 0
    for (let i = 0; i < 100; i++) if (readCache(`total:${i}`) !== undefined) held++
    expect(held).toBe(100)
  })
})

describe("the cache has a maximum age, live pings or not", () => {
  it("stops answering past MAX_CACHE_AGE_MS", () => {
    vi.useFakeTimers()
    primeCache("aging", rows(3))
    expect(readCache("aging"), "fresh, so it paints instantly").toBeDefined()
    vi.advanceTimersByTime(MAX_CACHE_AGE_MS - 1_000)
    expect(readCache("aging"), "still inside the window").toBeDefined()
    vi.advanceTimersByTime(2_000)
    expect(
      readCache("aging"),
      "a socket WILL drop during an eight-hour session; freshness cannot depend on it"
    ).toBeUndefined()
  })

  it("a read refreshes nothing — age is from the WRITE", () => {
    // Otherwise a screen polling its own cache would keep stale rows alive for ever.
    vi.useFakeTimers()
    primeCache("written-once", rows(3))
    vi.advanceTimersByTime(MAX_CACHE_AGE_MS / 2)
    readCache("written-once")
    vi.advanceTimersByTime(MAX_CACHE_AGE_MS / 2 + 1_000)
    expect(readCache("written-once")).toBeUndefined()
  })
})

describe("clearing at the identity boundary", () => {
  it("clearCache forgets everything", () => {
    primeCache("a", rows(2))
    primeCache("b", 7)
    clearCache()
    expect(readCache("a")).toBeUndefined()
    expect(readCache("b")).toBeUndefined()
  })

  it("clearCache notifies subscribers, so a mounted screen re-reads through the door", async () => {
    // A cleared cache that nobody is told about is a screen still showing rows the
    // store no longer holds — which for a sign-out or a team switch is exactly the
    // disclosure the clear exists to prevent. So the proof has to be that a MOUNTED
    // subscriber sees the value go away, not merely that the map is empty.
    const { act, renderHook } = await import("@testing-library/react")
    primeCache("watched", rows(3))
    const { result } = renderHook(() => useCachedValue<unknown[]>("watched"))
    expect(result.current, "it starts by seeing the cached rows").toHaveLength(3)
    // `act` because the notification is what re-renders — outside it React has not
    // flushed and this would read the value from before the clear, which is the
    // failure mode the assertion is about.
    act(() => clearCache())
    expect(result.current, "and it must be told they are gone").toBeUndefined()
  })
})

describe("eviction never takes a key somebody is looking at", () => {
  it("keeps a SUBSCRIBED key while dropping unsubscribed ones", async () => {
    const { renderHook } = await import("@testing-library/react")
    // Mount a subscriber on one key, then flood the cache past both ceilings.
    primeCache("on-screen", rows(6_000))
    const { unmount } = renderHook(() => useCachedValue<unknown[]>("on-screen"))
    for (let i = 0; i < 20; i++) primeCache(`offscreen${i}`, rows(5_000))
    expect(
      readCache<unknown[]>("on-screen"),
      "evicting a live list to make room for one nobody is reading would blank a screen"
    ).toBeDefined()
    unmount()
  })
})
