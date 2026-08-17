"use client"

// FIND — the search box and filter bar a PAGED collection (R14) has to wear, and
// the one place either one is answered.
//
// WHY THIS EXISTS. The library's CollectionFrame searches and filters IN MEMORY,
// over the array it was handed. On a bounded list (members, roles, dropdowns)
// that is exactly right and costs nothing. On a GROWING one it is a lie with a
// straight face: the browser holds page one, so typing "Confia" matched the
// newest fifty accounts and silently answered "no" about every one past the
// cursor — under a badge (R16) correctly counting all of them. Two numbers, both
// true, neither about what the person asked.
//
// So on a paged collection the question goes to the DOOR, which is Layer 2 of
// SEARCH.md and was always where a growing list's search belonged. The frame
// keeps drawing rows; this owns what is asked for. Concretely:
//
//   • the recipe turns its own search box OFF (`listCollection`, paged: true) —
//     one box on the screen, and it is the honest one;
//   • what the person types + picks becomes the door's OWN query parameters, so
//     the answer spans the whole collection rather than the loaded prefix;
//   • the matches land in a cache key of their own, with their own cursor
//     sidecar, so <LoadMore> pages the SEARCH and not the list underneath it;
//   • the exact server total of THAT question renders through `formatSearchTotal`
//     — the one seam in the app allowed to end in a "+" — beside the collection's
//     own R16 badge above, which never moves. A collection total and a filtered
//     total are two different numbers and the screen now says both, each labelled.
//
// It is a render-prop rather than a hook so a screen that is still a branch of
// the host's switch (accounts, tickets, the knowledge base) can use it without
// being turned into a component first: hooks cannot be called from inside a
// `module === "…"` branch, and rewriting three screens to fix a search box is
// the kind of change this codebase calls a defect.

import * as React from "react"

import { FilterBar } from "@kwapso/ui/registry/primitives/filter-bar/filter-bar"
import { SearchInput } from "@kwapso/ui/registry/primitives/search-input/search-input"
import type { FilterFacet } from "@kwapso/ui/lib/config"

import { cursorKey } from "@/lib/live-resources"
import { formatSearchTotal } from "@shared/web/format-count"
import { primeCache, useCached, useCachedValue } from "@shared/web/store"

/** One page of an answer from a list door: the rows, and where the next page
 * starts (null = that was the last one). `total` is the door's exact COUNT(*)
 * over the SAME question — never the page's length. */
export type FindPage<T> = { rows: T[]; nextCursor: string | null; total: number }

/** What the door is being asked, as its own query parameters. `q` is the search
 * box; everything else is a facet the door parses. */
export type FindQuery = Record<string, string>

/** What the screen gets back: what to render, and how to page it. */
export type Found<T> = {
  /** is anything being asked at all? When false the screen renders its own list,
   * exactly as it did before there was a find bar. */
  active: boolean
  /** the door's matches — null while the first page of THIS question is still on
   * its way (or when nothing is being asked). */
  rows: T[] | null
  loading: boolean
  error: unknown
  /** the empty-state line to use while a find is on (the collection's own
   * "No accounts yet." is a different, and untrue, sentence during a search). */
  emptyText?: string
  /** the cache key the paging control must page — null when nothing is being
   * asked, so the screen falls back to its own list key. */
  listKey: string | null
  /** the question as a query string ("" when nothing is asked) — for the doors a
   * screen reaches by URL rather than by fetch. The CSV export is the one that
   * matters: its door narrows by the same words as the list on purpose, so
   * "export what I'm looking at" and "list what I'm looking at" must not be two
   * different books. */
  queryString: string
  /** page two OF WHAT IS ON SCREEN: the find's next page, or the list's. */
  fetchPage: (cursor: string) => Promise<{ rows: T[]; nextCursor: string | null }>
}

/** The cache key one asked-for question lands in — the list's own key plus the
 * question, canonically ordered so the same search typed twice is one key (and
 * so backspacing lands straight back on a warm answer). The rows live here
 * rather than in the list's key because they are a DIFFERENT collection: the
 * list underneath must still be there, unfiltered, when the box is cleared. */
function findKeyFor(listKey: string, query: FindQuery): string {
  const asked = Object.keys(query)
    .sort()
    .map((k) => `${k}=${query[k]}`)
    .join("&")
  return `find:${listKey}:${asked}`
}

export function PagedFind<T>({
  listKey,
  fetchPage,
  placeholder,
  noun,
  facets = [],
  children,
}: {
  /** the collection's OWN cache key (accountsKey(teamId), …) */
  listKey: string
  /** ask the door ONE page of a question. The screen owns this because it owns
   * which door it reads; everything else about finding is the same everywhere. */
  fetchPage: (query: FindQuery, cursor: string | null) => Promise<FindPage<T>>
  /** the search box's placeholder, in the recipe's own words */
  placeholder: string
  /** what the rows ARE, for the match line ("accounts", "tickets") — a glossary
   * word, never a synonym. */
  noun: string
  /** the facets the DOOR parses, each `field` being its query parameter and each
   * option's `value` the word the door matches. Every facet declares its own
   * options, because the door's vocabulary is not the loaded page's: a facet the
   * door cannot answer does not belong here at all, which is the defect this
   * whole file is about. */
  facets?: FilterFacet[]
  children: (found: Found<T>) => React.ReactNode
}) {
  // Debounced upstream by SearchInput (200ms), so a keystroke is not a request.
  const [text, setText] = React.useState("")
  const [values, setValues] = React.useState<Record<string, string>>({})

  const query: FindQuery = {}
  for (const [field, value] of Object.entries(values)) if (value) query[field] = value
  const q = text.trim()
  if (q) query.q = q
  const active = Object.keys(query).length > 0
  const findKey = active ? findKeyFor(listKey, query) : null

  // The current question, held in a ref so the two fetchers below never go stale
  // between a keystroke and the response — and so `useCached`'s fetcher identity
  // (it keeps one in a ref of its own) can't pin an old query.
  const askedRef = React.useRef<FindQuery>(query)
  askedRef.current = query

  const found = useCached<T[]>(findKey, async () => {
    const key = findKey as string
    const page = await fetchPage(askedRef.current, null)
    // The two sidecars this answer owns: where ITS next page starts, and how many
    // there are of it. Both keyed off the find, so neither can touch the
    // collection's own cursor or the R16 badge above.
    primeCache(cursorKey(key), page.nextCursor)
    primeCache(`total:${key}`, page.total)
    return page.rows
  })
  const total = useCachedValue<number>(findKey ? `total:${findKey}` : null)

  const clearAll = () => {
    setText("")
    setValues({})
  }
  const canClear = active
  const showFilters = facets.length > 0

  // NOTHING FOUND is a sentence, not a blank. "No accounts yet." is the
  // collection's empty state and it is simply untrue mid-search.
  const emptyText = active ? `Nothing matched. Try fewer words, or clear the filters.` : undefined

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={text} onChange={setText} placeholder={placeholder} className="w-56" />
        {showFilters && (
          <FilterBar
            facets={facets}
            values={values}
            // Empty on purpose: every facet above carries its own options, so
            // there is nothing for the bar to derive from the rows on screen.
            data={[]}
            onChange={(field, value) =>
              setValues((s) => {
                const next = { ...s }
                if (value === "") delete next[field]
                else next[field] = value
                return next
              })
            }
            onClearAll={clearAll}
            canClear={canClear}
            resultCount={total}
          />
        )}
        {/* THE FILTERED TOTAL — the exact server count of the question being
            asked, through the one seam allowed to end in a "+" (the collection's
            own count above is exact and never does). It appears only while
            something IS being asked, so an unfiltered screen looks exactly as it
            did before. */}
        {active && !found.loading && (
          <span className="text-muted-foreground text-xs tabular-nums" aria-live="polite">
            {total ? `${formatSearchTotal(total)} ${noun} match` : `No ${noun} match`}
          </span>
        )}
      </div>

      {children({
        active,
        rows: active ? (found.data ?? null) : null,
        loading: found.loading,
        error: found.error,
        emptyText,
        listKey: findKey,
        queryString: active ? `?${new URLSearchParams(query).toString()}` : "",
        fetchPage: (cursor: string) =>
          fetchPage(askedRef.current, cursor).then((p) => ({ rows: p.rows, nextCursor: p.nextCursor })),
      })}
    </div>
  )
}
