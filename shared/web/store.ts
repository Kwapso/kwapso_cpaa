"use client"

// A tiny cache-first data layer. It does two jobs that, together, make the app
// feel instant AND stay live:
//   • useCached(key, fetcher) returns the cached value IMMEDIATELY when we have
//     it (and refetches quietly in the background — "stale-while-revalidate"),
//     so screens after the first paint with no spinner.
//   • invalidate(key) drops an entry and tells anyone showing it to refetch —
//     this is what a live "X changed" ping calls, so data updates on its own.
// No dependency, ~one Map + a subscriber set. Reusable across every screen.

import * as React from "react"

import { teamLiveSince } from "@shared/web/realtime"

// ── THE CACHE IS BOUNDED, AND IT HAS A MAXIMUM AGE ───────────────────────────
// This was a plain `Map` that only ever grew. Nothing evicted, nothing expired,
// and nothing cleared it when the person or the team changed — so the power user
// CACHING.md is written for, one tab open for a working day, accumulated every
// list they had ever opened (up to LIST_HARD_CAP rows each) plus every page
// `loadMore` had ever appended, for as long as the tab lived. On a big tenant
// that is a browser that gets slower all morning and dies after lunch, and no
// screen was doing anything wrong to cause it.
//
// Three bounds, because there are three ways this fills up:
//   • KEYS    — how many collections are remembered at once,
//   • ROWS    — the number that actually costs memory (a key holding 5,000
//               appended rows is worth 100 holding fifty),
//   • AGE     — the ceiling on staleness that does not depend on a live ping
//               arriving. Realtime patches the rows it knows about; a screen
//               left open through a deploy, a permission change or a dropped
//               socket needs a floor under freshness that is ours, not the
//               socket's.
//
// EVICTION NEVER TAKES A KEY SOMEBODY IS LOOKING AT. A subscribed key is on
// screen, and dropping it would blank a list to make room for one nobody is
// reading. So the sweep skips subscribed keys and takes the least recently used
// of the rest — which is exactly right, because the unsubscribed ones are the
// ones the day's navigation left behind.

/** Collections remembered at once. Generous for real navigation (a day of
 * screens is tens of keys, not hundreds) and a wall for accumulation. */
const MAX_CACHED_KEYS = 120

/** Rows held across every cached array, together. The number that actually
 * bounds memory: one paged feed scrolled all day can hold more rows on its own
 * than forty ordinary lists put together. */
const MAX_CACHED_ROWS = 20_000

/** How long a cached value may be painted without a refetch, live pings or not.
 * Ten minutes: long enough that ordinary back-and-forth navigation is still
 * instant, short enough that nothing a socket missed survives a coffee break. */
const MAX_CACHE_AGE_MS = 10 * 60 * 1000

type Entry = { value: unknown; at: number }

const cache = new Map<string, Entry>()
const subscribers = new Map<string, Set<() => void>>()

function notify(key: string) {
  subscribers.get(key)?.forEach((fn) => fn())
}

/** Is anything on screen reading this key? */
function watched(key: string): boolean {
  return (subscribers.get(key)?.size ?? 0) > 0
}

/** Rows an entry costs. Non-array values (a total, a cursor, one record) count
 * as one — they are not what fills a tab up. */
function rowCost(value: unknown): number {
  return Array.isArray(value) ? value.length : 1
}

/** Bring both ceilings back under the line, oldest-touched first, never taking a
 * key a screen is subscribed to. Runs after every write — the cost is one pass
 * over at most MAX_CACHED_KEYS entries, and only when a bound is actually
 * crossed. */
function evict(): void {
  let rows = 0
  for (const entry of cache.values()) rows += rowCost(entry.value)
  if (cache.size <= MAX_CACHED_KEYS && rows <= MAX_CACHED_ROWS) return
  // Map iterates in insertion order and every write re-inserts, so this walks
  // least-recently-written first. Deleting the CURRENT entry mid-iteration is
  // defined behaviour for a Map iterator, so no copy is needed.
  for (const [key, entry] of cache.entries()) {
    if (cache.size <= MAX_CACHED_KEYS && rows <= MAX_CACHED_ROWS) break
    if (watched(key)) continue
    cache.delete(key)
    rows -= rowCost(entry.value)
  }
}

/** Write an entry, stamp it, and re-insert it so it counts as most recently
 * used. THE one place `cache` is written, so the bounds cannot be bypassed by a
 * future helper that forgets them. */
function store(key: string, value: unknown): void {
  cache.delete(key)
  cache.set(key, { value, at: Date.now() })
  evict()
}

/** The cached value, or undefined if there is none OR it is past
 * MAX_CACHE_AGE_MS. An expired entry is dropped rather than returned, so the
 * caller's own miss path (a real fetch) takes over — there is no second code
 * path for "stale", which is how a maximum age stays one rule. */
function fresh(key: string): Entry | undefined {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (Date.now() - entry.at <= MAX_CACHE_AGE_MS) return entry
  cache.delete(key)
  return undefined
}

/** WHICH KEYS THE LIVE LAYER ACTUALLY KEEPS FRESH.
 *
 * Time alone cannot answer "may I skip this refetch?". A socket carries a `sub=`
 * list and only hears the resources it names, and R15 allows reasoned
 * `DEAF_EXEMPT` entries — so there are keys nothing pings. Skipping a refetch on
 * one of those would paint a value that nothing will ever correct, which is the
 * worst failure the live layer has: not a broken screen, just a quietly wrong
 * one.
 *
 * The registry that knows this lives in each front door (`web/lib/live-resources`
 * and the portal's own), and this file is shared by both, so the host registers
 * the predicate the same way it registers `go()` for navigation — no import
 * cycle, no context provider, and a host that has not registered one gets the
 * old behaviour (always revalidate), which is the safe default. */
let liveCoverage: ((key: string) => boolean) | null = null

export function registerLiveCoverage(fn: (key: string) => boolean): () => void {
  liveCoverage = fn
  return () => {
    if (liveCoverage === fn) liveCoverage = null
  }
}

/** May this key be painted from cache WITHOUT re-asking the server?
 *
 * Three things must all hold, and the entry's own age (MAX_CACHE_AGE_MS, applied
 * by `fresh`) is a fourth on top:
 *   1. a host has said which keys the live layer moves, and this is one of them;
 *   2. the team socket is connected right now;
 *   3. it has been connected continuously since this entry was written — so no
 *      ping about it can have been raised into a gap.
 * Any doubt falls through to a refetch, which is exactly what the app did for
 * every key before this existed. */
function liveHasWatchedSince(key: string, writtenAt: number): boolean {
  if (!liveCoverage?.(key)) return false
  const since = teamLiveSince()
  return since != null && writtenAt >= since
}

/** Drop a cached entry and tell anyone showing it to refetch (live refresh). */
export function invalidate(key: string): void {
  cache.delete(key)
  notify(key)
}

/** Drop every cached entry whose key starts with `prefix`, and tell anyone
 * showing one to refetch.
 *
 * For a collection that is ALSO cached in RECORD-SCOPED slices — the time
 * logged against one story, say — where the live ping cannot name which slice
 * it belongs to. A work-log ping carries the work log's own id; the story it
 * was logged against is on the ROW, which the listener has not read yet and
 * may never read (patchRow does nothing when the team-wide list isn't loaded).
 * So the honest answer is to drop every loaded slice and let the one on screen
 * re-read — the same coarse honesty `help-mine` already gets, for the same
 * reason. Cache-first, so a slice nobody is looking at costs nothing. */
export function invalidatePrefix(prefix: string): void {
  // Snapshot first: `invalidate` notifies, a subscriber may refetch, and a
  // refetch stores — mutating the map that is being walked.
  const keys = [...cache.keys()]
  for (const key of keys) if (key.startsWith(prefix)) invalidate(key)
}

/** WHICH KEYS UNDER A PREFIX ARE ACTUALLY LOADED — for a listener that has to
 * NAME the caches a ping moves and cannot derive their ids from the ping.
 *
 * `invalidatePrefix` above drops a family blindly; this one hands the family
 * back so the caller can decide, which is the difference between "a story
 * changed, drop every record's counts" and "a story changed, drop the counts of
 * the records whose badges count stories" (R15, web/lib/live-resources.ts). The
 * ping carries the CHILD's id — the record it hangs off is on the row, which the
 * listener has not read and may never read — so the parent can only be found by
 * looking at what is on screen.
 *
 * Cache-first, so this is normally one or two keys: a record nobody has open has
 * no entry to return. */
export function cachedKeys(prefix: string): string[] {
  return [...cache.keys()].filter((key) => key.startsWith(prefix))
}

/** FORGET EVERYTHING — sign-out, and switching to another team.
 *
 * Both change WHO IS ASKING, and a cache keyed by resource + team id still holds
 * rows the next identity may not read. The tab used to keep them: a signed-out
 * page could paint a member list from memory, and the caches of a team you no
 * longer belong to sat there until the tab closed. Rows a caller may no longer
 * see are not a memory problem, they are a disclosure — so this is called at the
 * identity boundary rather than left to eviction.
 *
 * Subscribers are notified so anything mounted refetches through the
 * permission-checked door and finds out honestly what it may still have. */
export function clearCache(): void {
  const keys = [...cache.keys()]
  cache.clear()
  for (const key of keys) notify(key)
}

/** Seed/replace a cached entry — e.g. after a mutation returns fresh data, so
 * the screen updates instantly without a round-trip. */
export function primeCache(key: string, value: unknown): void {
  store(key, value)
  notify(key)
}

/** Peek at a cached value without subscribing (e.g. the live handler bumping a
 * primed `total:` sidecar by ±1 on an add/remove ping). */
export function readCache<T>(key: string): T | undefined {
  return fresh(key)?.value as T | undefined
}

/** Subscribe to a cached value WITHOUT a fetcher — for sidecar keys someone else
 * primes (R16: the `total:<resource>:<teamId>` totals a list fetcher primes from
 * the door's COUNT(*)). Returns undefined until primed; re-renders on every
 * prime/invalidate of the key. Never fetches — the data has one owner. */
export function useCachedValue<T>(key: string | null): T | undefined {
  const subscribe = React.useCallback(
    (fn: () => void) => {
      if (!key) return () => {}
      let subs = subscribers.get(key)
      if (!subs) subscribers.set(key, (subs = new Set()))
      subs.add(fn)
      return () => subs.delete(fn)
    },
    [key]
  )
  return React.useSyncExternalStore(
    subscribe,
    () => (key ? (fresh(key)?.value as T | undefined) : undefined),
    () => undefined
  )
}

/** Background-PRIME a key ONLY if it's cold (nothing cached yet) — used to warm
 * always-needed team caches on team entry so the first tap paints from cache
 * instead of a skeleton. It NEVER overwrites a warm or live-patched entry (the
 * `has` guard) and NEVER surfaces an error (a prewarm failure is swallowed — the
 * screen's own useCached will fetch normally). Pure seeding: no cache-first paint
 * or row-level live-sync behaviour changes, it just fills a cold key earlier. */
export function primeCacheIfCold<T>(key: string, fetcher: () => Promise<T>): void {
  if (fresh(key)) return
  void fetcher()
    .then((value) => {
      // Re-check: a real fetch (useCached) or live patch may have landed while we
      // were in flight — don't clobber it with our (now possibly stale) result.
      if (!fresh(key)) primeCache(key, value)
    })
    .catch(() => {
      /* a prewarm miss is silent — the screen fetches on mount as usual */
    })
}

/** ROW-LEVEL live patch: a "row X in this collection changed" ping lands → fetch
 * just that one row (through the permission-checked endpoint) and update ONLY it
 * in the cached list — never refetch the whole collection. The single-row read
 * passes the SAME server filter as the list, so a row that no longer belongs
 * (e.g. a deactivated member) comes back null and is dropped. If the collection
 * isn't loaded (nothing on screen to patch) we do nothing; a fetch hiccup falls
 * back to a coarse invalidate so we never sit on stale data. */
export async function patchRow(
  key: string,
  idField: string,
  id: string,
  fetchOne: () => Promise<Record<string, unknown> | null>
): Promise<void> {
  const cur = fresh(key)?.value as Record<string, unknown>[] | undefined
  if (cur === undefined) return // not loaded (or expired) — nothing visible to patch
  try {
    const row = await fetchOne()
    const latest = fresh(key)?.value as Record<string, unknown>[] | undefined
    if (latest === undefined) return
    let next: Record<string, unknown>[]
    if (row == null) {
      next = latest.filter((r) => r[idField] !== id) // gone / no longer belongs
    } else {
      const idx = latest.findIndex((r) => r[idField] === id)
      next = idx >= 0 ? latest.map((r, i) => (i === idx ? row : r)) : [row, ...latest]
    }
    store(key, next)
    notify(key)
  } catch (e) {
    console.error("patchRow failed; invalidating", key, e)
    invalidate(key)
  }
}

function shallowEqualRow(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ak = Object.keys(a)
  if (ak.length !== Object.keys(b).length) return false
  for (const k of ak) if (a[k] !== b[k]) return false
  return true
}

/** RECONNECT catch-up (decision #10): after a dropped link, re-pull a whole
 * collection and PATCH the cached array by id rather than replacing it — update
 * the rows that actually changed, ADD ones that appeared while we were offline,
 * DROP ones that vanished, all in the server's order. Unchanged rows keep their
 * object identity, so React re-renders only what truly changed (no full-list
 * flush). No-op if the collection isn't loaded (nothing on screen to catch up);
 * a fetch hiccup falls back to a coarse invalidate so we never sit on stale data. */
export async function reconcile(
  key: string,
  idField: string,
  fetchList: () => Promise<Record<string, unknown>[]>
): Promise<void> {
  if (fresh(key) === undefined) return // not loaded (or expired) — nothing to catch up
  try {
    const rows = await fetchList()
    const prev = fresh(key)?.value as Record<string, unknown>[] | undefined
    if (prev === undefined) return
    const prevById = new Map(prev.map((r) => [r[idField], r]))
    const next = rows.map((row) => {
      const old = prevById.get(row[idField])
      return old && shallowEqualRow(old, row) ? old : row // reuse identity if unchanged
    })
    store(key, next)
    notify(key)
  } catch (e) {
    console.error("reconcile failed; invalidating", key, e)
    invalidate(key)
  }
}

/** Merge ONE PAGE into a PAGED collection's cache, keeping the tail.
 *
 * `reconcile` above REPLACES — right for a whole bounded list, where a row the
 * fetch lacks is a row that stopped existing. A paged list is different: the
 * fetch is only the freshest window, and replacing threw away every row past
 * page one that the person had scrolled into. Here the fresh window leads, a
 * row that moved into it is deduped by id, and rows beyond it stay in the
 * order they had — a merge must never know LESS than the screen already does.
 * A row deleted server-side lingers in the tail until the next real load,
 * which is the cheaper wrong. No-op when the key isn't loaded (cache-first). */
export function mergePage(
  key: string,
  idField: string,
  rows: Record<string, unknown>[]
): void {
  const prev = fresh(key)?.value as Record<string, unknown>[] | undefined
  if (prev === undefined) {
    store(key, rows)
    notify(key)
    return
  }
  const prevById = new Map(prev.map((r) => [r[idField], r]))
  const fetched = rows.map((row) => {
    const old = prevById.get(row[idField])
    return old && shallowEqualRow(old, row) ? old : row // reuse identity if unchanged
  })
  const fetchedIds = new Set(fetched.map((r) => r[idField]))
  store(key, [...fetched, ...prev.filter((r) => !fetchedIds.has(r[idField]))])
  notify(key)
}

/** ONE KEY, ONE REQUEST IN THE AIR.
 *
 * Measured on staging, 24 Aug 2026: a story detail made 27 requests on a cold
 * mount and roughly a third of them were the SAME key, asked for again in the
 * same tick by a second component that had no way to know the first was already
 * asking. `useStoryFormOptions` alone fires six reads and is mounted by the
 * stories collection, the story detail AND the ticket detail; the timer bar is
 * mounted twice, one copy hidden by CSS. Every one of those duplicates cost a
 * full round trip to a worker and back.
 *
 * The cache could not help, because a cache answers "what did we get?" and the
 * question here is "is somebody already getting it?" — a gap of a few hundred
 * milliseconds that the cache is empty for and every subscriber walks into.
 *
 * WHY A DELIBERATE REFRESH MUST NOT JOIN. `refresh()` is what a screen calls
 * after it changed something, so joining a request that departed BEFORE that
 * change would hand back the old row and look exactly like a lost write. Forced
 * loads therefore always start their own, and REPLACE the shared one so anybody
 * arriving afterwards joins the newer answer rather than the staler. That
 * distinction is the whole safety of this: dedupe the question everyone is
 * asking at once, never the one somebody asked because they know it changed. */
const inFlight = new Map<string, Promise<unknown>>()

function loadShared<T>(key: string, fetcher: () => Promise<T>, force: boolean): Promise<T> {
  if (!force) {
    const running = inFlight.get(key) as Promise<T> | undefined
    if (running) return running
  }
  const p = fetcher().then((value) => {
    // Stored by the ONE request, not once per joiner — so a patched row is not
    // overwritten N times and `notify` fires against a settled cache.
    store(key, value)
    return value
  })
  inFlight.set(key, p)
  // Every joiner awaits `p` inside its own try/catch, so a rejection is always
  // handled — but if the last joiner unmounts first the runtime would still see
  // an unobserved rejection and log it. This silences that and nothing else.
  void p.catch(() => {}).finally(() => {
    if (inFlight.get(key) === p) inFlight.delete(key)
  })
  return p
}

export function useCached<T>(
  key: string | null,
  fetcher: () => Promise<T>
): { data: T | undefined; loading: boolean; error: unknown; refresh: () => void } {
  const [data, setData] = React.useState<T | undefined>(
    key ? (fresh(key)?.value as T | undefined) : undefined
  )
  const [loading, setLoading] = React.useState<boolean>(key ? !fresh(key) : false)
  const [error, setError] = React.useState<unknown>(null)

  const fetcherRef = React.useRef(fetcher)
  fetcherRef.current = fetcher
  const aliveRef = React.useRef(true)

  const load = React.useCallback(
    async (force = false) => {
      if (!key) return
      try {
        const value = await loadShared(key, fetcherRef.current, force)
        if (!aliveRef.current) return
        setData(value)
        setError(null)
      } catch (e) {
        if (aliveRef.current) setError(e)
      } finally {
        if (aliveRef.current) setLoading(false)
      }
    },
    [key]
  )

  // What a live ping (`notify`) does to a MOUNTED subscriber. If the cache still
  // holds the key, the new value was written by `patchRow` / `reconcile` /
  // `primeCache` — so just re-render from it, NO refetch. This is what makes the
  // row-level patch actually stick: without it, every patch would be immediately
  // clobbered by a full-list GET (the subscriber refetching), defeating the whole
  // "patch the one row, never refetch the collection" goal. Only a cache MISS
  // (an `invalidate` cleared the key) falls through to a real refetch.
  const sync = React.useCallback(() => {
    if (!key) return
    const entry = fresh(key)
    if (entry) {
      if (aliveRef.current) {
        setData(entry.value as T)
        setLoading(false)
      }
    } else {
      void load()
    }
  }, [key, load])

  React.useEffect(() => {
    aliveRef.current = true
    if (!key) return
    const entry = fresh(key)
    if (entry) {
      // Cached and inside MAX_CACHE_AGE_MS → show instantly.
      setData(entry.value as T)
      setLoading(false)
    } else {
      setData(undefined)
      setLoading(true)
    }
    // REVALIDATE ON MOUNT — UNLESS THE SOCKET HAS BEEN WATCHING THIS ALL ALONG.
    //
    // This used to be unconditional, and it is why a screen the app already had
    // in memory still waited on the network: moving from tickets to stories and
    // back re-fetched both collections, every time, while the live channel sat
    // there having reported every change to both. The cache was doing the work
    // the durable object exists to make unnecessary.
    //
    // The skip is not "trust the cache" — it is the much narrower claim that no
    // ping about this key can have been MISSED: the key is one the listener
    // registry moves, the socket is up, and it has been up continuously since
    // this value was written (shared/web/realtime.ts explains why a reconnect
    // resets that window). Anything less and we fetch, exactly as before.
    if (!entry || !liveHasWatchedSince(key, entry.at)) void load()

    const subs = subscribers.get(key) ?? new Set<() => void>()
    subs.add(sync)
    subscribers.set(key, subs)
    return () => {
      aliveRef.current = false
      subs.delete(sync)
    }
  }, [key, load, sync])

  // FORCED — a refresh is somebody saying "I know this changed". See loadShared.
  const refresh = React.useCallback(() => void load(true), [load])
  return { data, loading, error, refresh }
}
