"use client"

// FIND — the search box, the filter bar and the SORT a PAGED collection (R14)
// has to wear, and the one place any of the three is answered.
//
// `tabs` + `wrap` + `actions` below are ALSO one of the two general
// mechanisms every main screen's tab strip draws through — see the rule at the
// top of `web/components/deep-link/screen-bits.tsx` for the other half (a
// BOUNDED collection's `folderTabs`) and the shape both must land on. `tabs`
// (a `FolderTabStrip` — config/value/onValueChange, screen-engine/tabs-view.tsx)
// draws ONLY the tab strip, because that is all its shape CAN draw; `actions`
// draws the row's own buttons (New/Import/Export…) at the right of the
// TOOLBAR below it, inside `wrap`'s box — never sharing the tab strip's own
// line (client ruling, 2026-08-31, correcting that same day's earlier fix).
// It used to be `renderAbove`, a `(ctx) => ReactNode` render prop — which
// could just as easily have returned a tab strip WITH a button beside it, the
// exact shape the ruling forbids, and did for a few hours. A spec object with
// no ReactNode parameter cannot.
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
import { type FolderTabStrip, renderFolderTabs } from "@shared/web/screen-engine/tabs-view"

import type { CollectionOrder } from "@/lib/collection-sorts"
import { cursorKey } from "@/lib/live-resources"
import { fill } from "@shared/i18n"
import { formatSearchTotal } from "@shared/web/format-count"
import { primeCache, useCached, useCachedValue } from "@shared/web/store"
import { useRemembered } from "@shared/web/remembered"

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
  /** THE SAME QUESTION, structured — exactly what `queryString` is built from
   * (search + facets + `fixed` + sort, once one is on). For a caller that
   * needs to forward a NARROWED copy of it to a second door rather than a URL
   * — the meetings screen's own month-scoped calendar read is the one that
   * exists today, which used to read a fixed month and nothing else and so
   * never narrowed with the search box above it. */
  query: FindQuery
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
  tabs,
  wrap,
  actions,
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
  /**
   * Rendered BEFORE the toolbar row, OUTSIDE whatever `wrap` boxes the toolbar
   * and the rendered rows in — a folder tab strip that must sit OUTSIDE that
   * box with no gap, the way a folder tab's own negative-margin overlap needs
   * a real, adjacent sibling to melt into (tabs-view.tsx: "any gap here would
   * pull them apart"). A `FolderTabStrip` (config/value/onValueChange), never
   * a `ReactNode` — see this file's header comment for why the shape changed:
   * the slot renders `<TabsView>` from it, so a caller cannot fold an action
   * button in beside the tabs the way `renderAbove`'s old render-prop shape
   * once let one in for a few hours (client ruling, 2026-08-31: the toolbar's
   * own action buttons live in `actions` below, never beside the tab strip).
   * `undefined` where a collection has no tab strip at all (Knowledge).
   */
  tabs?: FolderTabStrip
  /**
   * Boxes the toolbar row(s) and the rendered rows together. Identity (no box)
   * by default — every existing call site keeps its current, naked toolbar.
   * Pass a `CollectionCard`-shaped wrapper to read the toolbar and the list as
   * ONE panel, e.g. when a folder tab strip above (`tabs`) needs a real,
   * zero-gap card to attach to (screen-bits.tsx's own `CollectionCard`,
   * `attached`).
   */
  wrap?: (toolbarAndRows: React.ReactNode) => React.ReactNode
  /**
   * THE ROW'S OWN ACTION BUTTONS (New/Import/Export/Raise ticket…), rendered
   * at the FAR RIGHT of the toolbar's own first line — beside search and sort,
   * inside `wrap`'s box, never beside the `tabs` strip (client ruling,
   * 2026-08-31, correcting the same day's earlier fix: "never align the
   * button with the tabs — that button belongs in the right of the toolbar,
   * part of the toolbar"). Handed the same `queryString` the CSV export href
   * narrows by, so an Export href moved here still narrows by what is on
   * screen — `tabs` carries no such context, on purpose: a `FolderTabStrip`
   * has nowhere to put an action even if it wanted to. `undefined` by
   * default, which is every existing call site's markup, unchanged.
   */
  actions?: (ctx: { queryString: string }) => React.ReactNode
  children: (found: Found<T>) => React.ReactNode
}) {
  // ── WHAT SHE WAS ASKING THIS DOOR, WHEN SHE LEFT ───────────────────────────
  //
  // The same sentence CollectionFrame's header carries, one layer down: the
  // search box, the filters and the order are ONE question and are remembered
  // as one slot, keyed by the collection's own cache key — which is already
  // unique per collection per team, so two paged lists on one screen can never
  // read each other's.
  //
  // NO CURSOR IS REMEMBERED, and that is the R14 half of this. Paging here is
  // `loadMore` appending into the shared store, and the store already survives
  // navigation (shared/web/store.ts, bounded and LRU) — so what she had loaded
  // is still loaded, without this file storing anything. A cursor is minted
  // against an ordering at a moment in time; replaying one after the rows have
  // moved is exactly the silent loss R14 exists to prevent. She comes back to
  // her question, freshly answered.
  //
  // Debounced upstream by SearchInput (200ms), so a keystroke is not a request.
  const [question, remember] = useRemembered<{
    text: string
    values: Record<string, string>
    sortBy: string
    sortDir: "asc" | "desc" | null
  }>(
    `find:${listKey}`,
    () => ({ text: "", values: {}, sortBy: defaultSort, sortDir: null }),
    (found) => {
      if (!found || typeof found !== "object") return undefined
      const was = found as Record<string, unknown>
      // A FILTER WHOSE OPTION HAS BEEN RETIRED is dropped, not restored: every
      // facet here declares the vocabulary its DOOR knows, and a value outside
      // it is a clean 400 the moment the screen asks. The rest of the question
      // survives, which is the point — one retired dropdown value should not
      // cost her the search she typed.
      const kept: Record<string, string> = {}
      for (const [field, value] of Object.entries(
        (was.values as Record<string, string>) ?? {}
      )) {
        const facet = facets.find((f) => f.field === field)
        if (facet?.options?.some((o) => o.value === value)) kept[field] = value
      }
      return {
        text: typeof was.text === "string" ? was.text : "",
        values: kept,
        // Likewise an order this collection no longer offers: back to the
        // door's own default, which asks the door nothing at all.
        sortBy:
          typeof was.sortBy === "string" &&
          (was.sortBy === defaultSort || sorts.some((o) => o.value === was.sortBy))
            ? was.sortBy
            : defaultSort,
        sortDir: was.sortDir === "asc" || was.sortDir === "desc" ? was.sortDir : null,
      }
    }
  )
  const { text, values, sortBy, sortDir } = question
  const setText = (next: string) => remember((q) => ({ ...q, text: next }))
  const setValues = (next: Record<string, string>) => remember((q) => ({ ...q, values: next }))
  const setSortBy = (next: string) => remember((q) => ({ ...q, sortBy: next }))
  const setSortDir = (next: "asc" | "desc" | null) => remember((q) => ({ ...q, sortDir: next }))

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

  const showFilters = facets.length > 0
  const showSort = sorts.length > 0

  // NOTHING FOUND is a sentence, not a blank. "No accounts yet." is the
  // collection's empty state and it is simply untrue mid-search — but an empty
  // TAB is not a failed search either, so the sentence follows what was asked.
  const emptyText = asked ? `Nothing matched. Try fewer words, or clear the filters.` : undefined

  // Computed once, ahead of the toolbar and the `children` call below, so
  // `actions` and the CSV export href (inside `children`) narrow by the exact
  // same question. `tabs` gets none of it — a `FolderTabStrip` draws only
  // itself, never a narrowing that would need this.
  const queryString = active ? `?${new URLSearchParams(query).toString()}` : ""

  const toolbarAndRows = (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-pill bg-background py-1.5 pe-1.5 ps-4">
        {/* THE TRACK — same treatment as `ToolbarRow` (screen-bits.tsx): every
            control sits inside one pill, `bg-background` against the card's
            own `bg-surface-panel`, not floating loose on the panel's bare
            paper (client, 1 Sep 2026, pointing at her own reference artifact). */}
        {/* THE SEARCH CLEARS ITSELF (the kit's own ✕). It used to be cleared by
            the filter row's "Clear all" — one control quietly owning two
            questions — and the kit's bar says "Clear filters" and now means
            only that. */}
        <SearchInput
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          onClear={() => setText("")}
          placeholder={placeholder}
          className="w-56"
        />
        {/* THE FACET CHIPS, BETWEEN SEARCH AND SORT — ONE ROW, ALWAYS (client
            ruling, 2026-09-01, the toolbar spec Aurora approved that night
            against a real Tickets mockup: search, then the facet chips, then
            "+ Filter", then sort, then create, pinned right). This used to be
            a full-width sibling BELOW this row — the same two-row shape her
            Apps screenshot caught — on the reasoning that the kit's own
            `FilterBar` (`shared/ui/components/filter-bar/filter-bar.tsx`)
            hard-codes `w-full` on its root and so "can never sit beside
            `SearchInput`/`SortControl`". That reasoning did not survive
            contact with the two OTHER places this exact bug was fixed in the
            same pass (`screen-bits.tsx`'s `ToolbarRow` and this file's
            sibling fix in `collection-frame.tsx`'s legacy header): a `w-full`
            child only claims the WHOLE row when it is a DIRECT child of it.
            Wrapped first in its own non-growing flex box — `min-w-0`, no
            `w-full` of its OWN — the wrapper's width is resolved from its
            CONTENT before the child's `100%` has anything to resolve
            against (a percentage on an indeterminate box is treated as
            `auto` for that computation, CSS Sizing §5.3), so the wrapper sizes
            to the chip row's actual content width, and only THEN does the
            `w-full` child fill exactly that box rather than the row. Same
            technique, same reason, third call site — no adapter change and
            no kit change (R39) needed, because the kit was never the thing
            forcing the second row. */}
        {showFilters && (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <FilterBar
              facets={facets}
              values={values}
              // Empty on purpose: every facet above carries its own options, so
              // there is nothing for the bar to derive from the rows on screen.
              data={[]}
              onChange={(field, value) => {
                const next = { ...values }
                if (value === "") delete next[field]
                else next[field] = value
                setValues(next)
              }}
              onClearFacets={() => setValues({})}
              resultCount={total}
            />
          </div>
        )}
        {/* THE ORDER, after search and the facet chips because the three are
            asked with the same gesture — you type, you narrow, then you say
            what order. What it changes is what the DOOR is asked, so the
            answer spans the whole collection rather than the page in front
            of you. */}
        {showSort && (
          <SortControl
            options={sorts}
            value={sortBy}
            onValueChange={(by) => setSortBy(by)}
            direction={sortDir ?? landsOn}
            onDirectionChange={(dir) => setSortDir(dir)}
            hideLabel
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
        {/* THE ROW'S OWN ACTIONS, LAST IN THE ROW — client, 2 Sep 2026,
            correcting the `ml-auto` this slot carried until then. Her
            reference artifact never stretches the track open to park the
            button at its far edge; it is just the last chip in the same
            left-packed cluster as search/filters/sort/the match count
            (still rightmost of what's showing, part of the toolbar, never
            beside the tab strip — the 2026-08-31 ruling — just not pushed
            there by a growing gap). */}
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions({ queryString })}</div>
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
        queryString,
        query,
        fetchPage: (cursor: string) =>
          fetchPage(askedRef.current, cursor).then((p) => ({ rows: p.rows, nextCursor: p.nextCursor })),
      })}
    </div>
  )

  // ZERO GAP, on purpose — the same reason `screen-bits.tsx`'s own `folderTabs`
  // slot draws its column with no `gap-4`: a folder tab strip pulled down by
  // `--folder-tab-overlap` needs its ACTUAL next sibling to be the panel it
  // melts into, and a `gap` here (even the outer column's) would put daylight
  // back between them. A caller with no `tabs` gets one more `<div>` around
  // exactly the markup this returned before — no gap to apply with a single
  // child, so nothing moves.
  return (
    <div className="flex w-full flex-col">
      {renderFolderTabs(tabs)}
      {wrap ? wrap(toolbarAndRows) : toolbarAndRows}
    </div>
  )
}
