"use client"

// FIND — the search box, the filter bar and the SORT a PAGED collection (R14)
// has to wear, and the one place any of the three is answered.
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
// AND THE SORT IS THE SAME SENTENCE, arrived at four months later (2026-08-18).
// The library's `selectRows` orders the array the frame is HOLDING, so sorting a
// paged collection orders page one — fifty of 254 tasks, arranged, and nothing on
// the screen saying which fifty. Reported by the owner as "the sort actually
// doesn't work… I don't see the order changing, even though I can see that there
// are different values", which is what it looks like from the outside: a control
// that moves rows around inside a window you cannot see the edges of.
//
// So a sort joins `q` and the facets as an ordinary query parameter, and it gets
// the property that matters for free. A changed sort is a changed QUESTION, so it
// lands in a different cache key — which means page one, a fresh cursor sidecar,
// and a <LoadMore> that pages THIS order. "Changing the sort must reset to page
// one" is therefore structural here rather than something a screen remembers; the
// door's cursor carries its ordering as well (shared/workers/sorting.ts), so even
// a stale one is refused rather than answered.
//
// The DEFAULT sort is deliberately not sent. A screen nobody has touched asks the
// door nothing, reads the collection's own cache key and looks exactly as it did
// before this existed — the sort only becomes a question once somebody asks it.
//
// It is a render-prop rather than a hook so a screen that is still a branch of
// the host's switch (accounts, tickets, the knowledge base) can use it without
// being turned into a component first: hooks cannot be called from inside a
// `module === "…"` branch, and rewriting three screens to fix a search box is
// the kind of change this codebase calls a defect.

import * as React from "react"

import { FilterBar } from "@shared/web/screen-engine/filter-bar"
import { SearchInput } from "@shared/ui/components/search-input/search-input"
import { SortControl } from "@shared/ui/components/sort-control/sort-control"
import type { FilterFacet, SortOption } from "@shared/web/screen-engine/config"

import type { CollectionOrder } from "@/lib/collection-sorts"
import { cursorKey } from "@/lib/live-resources"
import { fill } from "@shared/i18n"
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
  /** THE ORDER, and the handle that changes it — the DOOR's, so a control
   * underneath this bar (a table's column headers, on the meetings list) changes the
   * same question the picker above does rather than arranging the page it can
   * see. Two controls, one state: neither can be showing an order the other one
   * moved away from. `set(null)` is "back to the order the door hands us", which
   * asks the door nothing at all. */
  order: CollectionOrder
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
  matches,
  facets = [],
  sorts = [],
  defaultSort = "",
  fixed,
  children,
}: {
  /** the collection's OWN cache key (accountsKey(teamId), …) */
  listKey: string
  /** ask the door ONE page of a question. The screen owns this because it owns
   * which door it reads; everything else about finding is the same everywhere. */
  fetchPage: (query: FindQuery, cursor: string | null) => Promise<FindPage<T>>
  /** the search box's placeholder, in the recipe's own words */
  placeholder: string
  /** WHAT THE MATCH LINE SAYS — three whole sentences, in the screen's own
   * glossary words, never a synonym.
   *
   * Three, rather than a noun this seam builds a sentence around. The old shape
   * was `` `${total} ${noun} match` ``, which said "1 tickets match" on every
   * paged screen in the app — and the fix is not an `s`. A sentence glued
   * together from a number, a noun and a verb is untranslatable: German inflects
   * the noun, Russian has three number forms and Japanese has none, and none of
   * them puts the pieces in this order. So the whole sentence is the unit — the
   * only thing R28's catalogue can hold and a translator can be asked to
   * preserve — and English's own two forms are the fewest a catalogue can carry.
   *
   * ALREADY TRANSLATED when it arrives: `t("…")` at the call site is what puts a
   * sentence in the catalogue in the first place (the extractor reads `t` calls,
   * not props). `{count}` in `many` is left for this seam, because the total is
   * the one part of the sentence the screen does not know. */
  matches: { none: string; one: string; many: string }
  /** the facets the DOOR parses, each `field` being its query parameter and each
   * option's `value` the word the door matches. Every facet declares its own
   * options, because the door's vocabulary is not the loaded page's: a facet the
   * door cannot answer does not belong here at all, which is the defect this
   * whole file is about. */
  facets?: FilterFacet[]
  /** WHAT THIS COLLECTION MAY BE ORDERED BY — the same names the door's own sort
   * menu declares (ACCOUNT_SORTS, TICKET_SORTS, …), because a name this screen
   * offers and the door does not know is a clean 400 the moment it is picked.
   * Each option's `defaultDir` is the direction it LANDS on when chosen (dates
   * newest-first, names A→Z); the toggle beside it flips from there. Empty = the
   * collection has no sort control, which is the right answer for one whose
   * order IS its meaning. */
  sorts?: SortOption[]
  /** The name the DOOR falls back to. It is never sent — a screen sitting on its
   * default asks the door nothing, so it reads the collection's own cache key and
   * pages the collection's own cursor, exactly as it did before sorting existed.
   * Required whenever `sorts` is given, so the control can show what is already
   * true rather than an empty "Sort by". */
  defaultSort?: string
  /** WHAT THE SCREEN IS ALREADY ASKING, above whatever the person types — a tab
   * strip's own narrowing (`{ type: "entity" }`), forwarded to the door as an
   * ordinary query parameter.
   *
   * It exists so a tab and a search box are ONE question rather than two. A tab
   * that filtered the loaded page would narrow fifty rows under a badge counting
   * all of them, and would leave the CSV export and the paging answering a
   * different question from the screen — the same defect this whole file was
   * written for, committed one control along. */
  fixed?: FindQuery
  children: (found: Found<T>) => React.ReactNode
}) {
  // Debounced upstream by SearchInput (200ms), so a keystroke is not a request.
  const [text, setText] = React.useState("")
  const [values, setValues] = React.useState<Record<string, string>>({})
  // The ORDER, seeded from the door's own default so the control shows what is
  // already true. `null` dir = "whatever that option lands on", which is what
  // the door decides — so an untouched screen sends neither.
  const [sortBy, setSortBy] = React.useState(defaultSort)
  const [sortDir, setSortDir] = React.useState<"asc" | "desc" | null>(null)

  const query: FindQuery = {}
  for (const [field, value] of Object.entries(values)) if (value) query[field] = value
  const q = text.trim()
  if (q) query.q = q
  // WHAT THE PERSON IS ASKING, kept apart from what the SCREEN is asking: the
  // door is given both, but the "N accounts match" line belongs to the question
  // somebody typed. A bare tab is not a search, and a match count under an
  // untouched search box reads as one.
  const asked = Object.keys(query).length > 0
  for (const [field, value] of Object.entries(fixed ?? {})) if (value) query[field] = value
  // …AND NEITHER IS A SORT, which is why it goes in down here, after `asked`.
  // Ordering a list does not narrow it: "254 accounts match" under a screen where
  // somebody pressed "Name A→Z" would be a count of everything, labelled as if it
  // were a result. The DEFAULT order is not sent at all — see the header.
  //
  // "Is this still the default?" is asked of the DIRECTION too, and not by
  // comparing against null: re-picking the option you are already on fires
  // `onChange` with that option's own `defaultDir`, so a screen that only looked
  // at "has a direction been set" would start asking the door for the order it
  // was already in — a second cache key holding the same rows.
  const landsOn = sorts.find((o) => o.value === defaultSort)?.defaultDir ?? "asc"
  const sortedAway = sortBy !== defaultSort || (sortDir !== null && sortDir !== landsOn)
  if (sorts.length > 0 && sortedAway) {
    query.sort = sortBy
    if (sortDir) query.dir = sortDir
  }
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
  const canClear = asked
  const showFilters = facets.length > 0
  const showSort = sorts.length > 0

  // NOTHING FOUND is a sentence, not a blank. "No accounts yet." is the
  // collection's empty state and it is simply untrue mid-search — but an empty
  // TAB is not a failed search either, so the sentence follows what was asked.
  const emptyText = asked ? `Nothing matched. Try fewer words, or clear the filters.` : undefined

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={text} onChange={(e) => setText(e.currentTarget.value)} placeholder={placeholder} className="w-56" />
        {/* THE ORDER, beside the search box and the filters because it is the
            third half of one question and belongs on the same row (the library's
            own CollectionFrame places it exactly here). What it changes is what
            the DOOR is asked, so the answer spans the whole collection rather
            than the page in front of you. */}
        {showSort && (
          <SortControl
            options={sorts}
            value={sortBy}
            onValueChange={(by) => setSortBy(by)}
            direction={sortDir ?? landsOn}
            onDirectionChange={(dir) => setSortDir(dir)}
          />
        )}
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
        {asked && !found.loading && (
          <span className="text-muted-foreground text-xs tabular-nums" aria-live="polite">
            {!total
              ? matches.none
              : total === 1
                ? matches.one
                : fill(matches.many, { count: formatSearchTotal(total) })}
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
        order: {
          by: sortBy,
          dir: sortDir ?? landsOn,
          set: (by, dir) => {
            setSortBy(by ?? defaultSort)
            setSortDir(by === null ? null : dir)
          },
        },
        queryString: active ? `?${new URLSearchParams(query).toString()}` : "",
        fetchPage: (cursor: string) =>
          fetchPage(askedRef.current, cursor).then((p) => ({ rows: p.rows, nextCursor: p.nextCursor })),
      })}
    </div>
  )
}
