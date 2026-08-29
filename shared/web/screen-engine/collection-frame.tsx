"use client"

// CollectionFrame — the shared "chrome" every collection wears. You hand it the
// FULL row array plus a function that renders one page of rows; it applies the
// Glide-style collection config for you:
//   • title           — an optional header
//   • filter / sort    — EXECUTED here (via selectRows) from the config's rules
//   • searchable       — a debounced SearchInput that filters the named columns
//   • userFilter       — a FilterBar of `filterFacets` (the design kit's own
//                        filter row: a chip per facet that is on, and the facet
//                        controls behind its "+ filter" slot)
//   • showCount        — a LIVE "Showing X of Y" that reacts to search + facets
//   • limit            — caps the TOTAL rows (e.g. "only ever show 50")
//   • itemsPerPage     — paginates the (filtered) rows, with a Prev/Next pager
// The data math lives in lib/collection (selectRows) so it stays unit-tested;
// one component so List, Card, Table, etc. all behave identically — no repeat.
//
// SERVER-SIDE seam: pass `serverSide` + `onQueryChange` and the frame stops
// filtering in memory — it emits the (debounced) query + facets and renders
// whatever `data` it's handed, so an app can refetch (?q= / FTS5) later.

import * as React from "react"
import { ArrowUpDown } from "@shared/ui/foundations/icons"

import { facetOptions, selectRows } from "./collection"
import { useRemembered } from "@shared/web/remembered"
import { type CollectionConfig } from "./config"
import { cn } from "@shared/ui/lib/utils"
import { useT } from "@shared/web/language"
import { Button } from "@shared/ui/components/button/button"
import { FilterBar } from "./filter-bar"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@shared/ui/components/pagination/pagination"
import { SortControl } from "@shared/ui/components/sort-control/sort-control"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@shared/ui/components/popover/popover"
import { SearchInput } from "@shared/ui/components/search-input/search-input"
import { Text } from "@shared/ui/components/typography/typography"
import { useDebouncedCallback } from "@shared/ui/components/use-debounce/use-debounce"
import { useIsVisible } from "./visibility"
import { ShapeStateBody, type ShapeStateCopy } from "@shared/ui/compositions/states/states"

/** THE SECTION'S OWN CREATE ACTION, published to the collection inside it.
 *
 * An empty collection is the FIRST thing a new team meets on every screen, and
 * it was a dashed box, an optional glyph and one grey sentence with no way out
 * of it — sixteen times over. The one thing a zero state has to do is name the
 * next act, and the frame could not: the create button lives in the host ABOVE
 * the collection (`SectionWithCreate`), and the frame is handed only rows and a
 * config.
 *
 * So the host publishes what it already has — the label it puts on that button,
 * its glyph, and its handler — and the frame reads it where it needs it. A
 * context rather than a prop because the frame is reached through the screen
 * engine, several layers below the host, and threading one optional action
 * through every recipe path would be the same decision written eleven times.
 * It is the arrangement R16's count arbitration already uses for the same
 * reason. A collection with no host above it (the client portal draws its own)
 * simply gets `null` and renders the sentence alone, exactly as before. */
export type CollectionCreateAction = {
  /** The host's own word for the act — already translated where it is set. */
  label: string
  /** The host's glyph, so the two buttons for one act cannot disagree. */
  icon?: React.ReactNode
  onCreate: () => void
}

const CreateActionContext = React.createContext<CollectionCreateAction | null>(null)

export function CollectionCreateActionProvider({
  action,
  children,
}: {
  action: CollectionCreateAction | null
  children: React.ReactNode
}) {
  return <CreateActionContext.Provider value={action}>{children}</CreateActionContext.Provider>
}

function CollectionFrame<T>({
  config,
  data,
  searchKeys,
  renderItems,
  serverSide = false,
  onQueryChange,
  modal = false,
  memoryKey,
  className,
  state = "ready",
  copy,
  errorAction,
}: {
  config: CollectionConfig
  data: T[]
  /** Object keys searched when the user types in the search box. */
  searchKeys: (keyof T)[]
  /** Render one page of rows (the frame slices them for you). */
  renderItems: (rows: T[]) => React.ReactNode
  /** When true, the frame does NOT filter/search/sort/paginate in memory — it
   * renders `data` as given and emits the query state via `onQueryChange` (the
   * app refetches). */
  serverSide?: boolean
  /** Notified (query already debounced by SearchInput) whenever the user changes
   * WHAT THEY'RE ASKING FOR — query, facets, or sort. One seam, not three: this
   * is everything a server-side host needs to build its next request. */
  onQueryChange?: (state: {
    query: string
    facetValues: Record<string, string>
    sortBy: string
    sortDir: "asc" | "desc"
  }) => void
  /** Set `true` when the collection can render inside a Dialog/Sheet, so the
   *  filter/sort popovers stay scrollable under the dialog's scroll lock. */
  modal?: boolean
  /** WHICH COLLECTION THIS IS, for the nav memory — the module a recipe binds
   * to, where a caller knows it. Two collections on one screen need two names or
   * they would hand each other their search box; a caller that says nothing gets
   * one derived from the config, which is stable for as long as the screen is.
   * Nothing is remembered at all where no host has provided a memory (the client
   * portal), so this is inert there. */
  memoryKey?: string
  className?: string
  /**
   * Loading, or a failed read. Law 4: the header (search/filter/sort) stays
   * drawn and only the rows region swaps — the same rule the record screens
   * were just migrated to (RecordScreen's `state`). Omit for a caller not yet
   * passing one; `"ready"` is the default and every existing call site keeps
   * behaving exactly as it did before this prop existed. A caller in
   * `"loading"`/`"error"` may pass `data={[]}` — it is never read as "the
   * collection is empty" the way it would have been before, because
   * `filtered.length === 0` is only consulted once `state` is `"ready"`.
   */
  state?: "ready" | "loading" | "error"
  /** Per-locale words for the loading/empty/no-results/error registers. */
  copy?: Partial<ShapeStateCopy>
  /** The one next step offered on a failed read (a Retry button, typically). */
  errorAction?: React.ReactNode
}) {
  const t = useT()
  const createAction = React.useContext(CreateActionContext)
  // ── WHAT THIS COLLECTION WAS BEING ASKED, WHEN SHE LEFT IT ─────────────────
  //
  // The four controls in this header are the "what she had typed" and "which
  // filters were set" halves of the nav memory. They are remembered as ONE slot
  // because they are one question: a search with the filters dropped off it is
  // a different question, and restoring half of it would be worse than
  // restoring none. `slot` names this collection within the screen — see the
  // `memoryKey` prop.
  //
  // THE PAGE IS DELIBERATELY NOT IN IT. Two reasons, and they are the same
  // reason twice. A GROWING collection (R14) does not have pages: it has a
  // cursor, its rows accumulate in the shared store, and that store already
  // survives navigation — so there is nothing here to remember and a cursor
  // minted before the rows moved would be R14's silent loss, answering about a
  // window that has shifted. A BOUNDED one is paged in memory over rows that
  // are live (R15), so "page three" names a position in a list that may have
  // re-sorted under her: the same number, a different three rows. The filter is
  // the durable half of what she was doing; the offset into it is not. She
  // comes back to the top of her filtered list.
  const slot = `find:${memoryKey ?? (config.title || searchKeys.join(","))}`
  const [asked, remember] = useRemembered<{
    query: string
    facetValues: Record<string, string>
    sortBy: string
    sortDir: "asc" | "desc"
  }>(
    slot,
    () => ({ query: "", facetValues: {}, sortBy: config.sortBy, sortDir: config.sortDir }),
    (found) => {
      // A REMEMBERED FILTER WHOSE OPTION NO LONGER EXISTS. A dropdown value can
      // be retired while she is away, and a facet's choices are often derived
      // from the rows themselves — so a remembered selection is checked against
      // what this collection can actually offer TODAY, and a selection nothing
      // can satisfy is dropped rather than restored. The rest of the question
      // survives: losing one retired filter should not throw away her search.
      // A `range` facet has no option list to check against, so its value is
      // syntax rather than vocabulary and is kept.
      if (!found || typeof found !== "object") return undefined
      const was = found as Record<string, unknown>
      const facets: Record<string, string> = {}
      for (const [field, value] of Object.entries(
        (was.facetValues as Record<string, string>) ?? {}
      )) {
        const facet = config.filterFacets.find((f) => f.field === field)
        if (!facet) continue
        if (facet.control === "range") {
          facets[field] = value
          continue
        }
        const offered = facet.options ?? facetOptions(data, facet.field)
        if (offered.some((o) => o.value === value)) facets[field] = value
      }
      return {
        query: typeof was.query === "string" ? was.query : "",
        facetValues: facets,
        // A sort by a column this collection no longer offers falls back to the
        // declared one, for the same reason a retired filter does.
        sortBy:
          typeof was.sortBy === "string" &&
          (was.sortBy === config.sortBy ||
            config.sortOptions.some((o) => o.value === was.sortBy))
            ? was.sortBy
            : config.sortBy,
        sortDir: was.sortDir === "asc" || was.sortDir === "desc" ? was.sortDir : config.sortDir,
      }
    }
  )
  const { query, facetValues, sortBy, sortDir } = asked
  const setQuery = (next: string) => remember((q) => ({ ...q, query: next }))
  // The OLD SearchInput debounced internally; the kit's is a plain input, so
  // the debounce lives here now — same 300ms the old control used.
  const debouncedSetQuery = useDebouncedCallback((next: string) => setQuery(next), 300)
  const setSortBy = (next: string) => remember((q) => ({ ...q, sortBy: next }))
  const setSortDir = (next: "asc" | "desc") => remember((q) => ({ ...q, sortDir: next }))
  const [page, setPage] = React.useState(0)
  const rootRef = React.useRef<HTMLDivElement>(null)

  // A new search/facet/sort resets to the first page so results are never
  // off-screen.
  React.useEffect(() => setPage(0), [query, facetValues, sortBy, sortDir])

  // Emit the query state to the app (skip the initial mount). The query is
  // already debounced upstream by SearchInput; facet + sort changes are immediate.
  const mounted = React.useRef(false)
  React.useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    onQueryChange?.({ query, facetValues, sortBy, sortDir })
  }, [query, facetValues, sortBy, sortDir, onQueryChange])

  const visibleConfig = useIsVisible(config)
  if (!visibleConfig) return null

  // limit → (builder filter + facets) → search → sort → paginate (see selectRows).
  // The user's live sort overrides the declared one; everything else is config.
  // serverSide: skip the in-memory pipeline entirely — render whatever `data`
  // we're given and let the app sort at the source (we only emit).
  const slice = serverSide
    ? {
        visible: data,
        filtered: data,
        total: data.length,
        pageCount: 1,
        page: 0,
      }
    : selectRows(
        data,
        { ...config, sortBy, sortDir },
        { query, searchKeys, page, facetValues }
      )
  const { visible, filtered, pageCount, page: current } = slice

  // IS ANYTHING NARROWING THIS LIST RIGHT NOW? The zero state below turns on
  // this and nothing else: a search with text in it, or one facet set. It is
  // read after `selectRows` so it describes the same pass that produced
  // `filtered`. (`asked` is taken in this file — it is the remembered question
  // itself, which is the thing this is a predicate about.)
  const narrowed = query.trim() !== "" || Object.keys(facetValues).length > 0

  const showFilterBar = config.userFilter && config.filterFacets.length > 0
  const showSort = config.sortable && config.sortOptions.length > 0
  const showHeader =
    config.title ||
    config.showCount ||
    config.searchable ||
    showFilterBar ||
    showSort
  const setFacet = (field: string, value: string) =>
    remember((q) => {
      const next = { ...q.facetValues }
      if (value === "") delete next[field]
      else next[field] = value
      return { ...q, facetValues: next }
    })

  // Page change: optionally scroll the collection's top back into view.
  const goTo = (p: number) => {
    setPage(p)
    if (config.scrollToTop)
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <div ref={rootRef} className={cn("flex w-full flex-col gap-3", className)}>
      {showHeader &&
        (() => {
          const titleBlock = (
            <div className="flex items-baseline gap-2">
              {config.title && (
                <h3 className="text-sm font-medium">{config.title}</h3>
              )}
              {config.showCount && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {t("Showing {shown} of {total}", { shown: visible.length, total: filtered.length })}
                </span>
              )}
            </div>
          )
          const searchBox = config.searchable ? (
            <SearchInput
              defaultValue={query}
              onChange={(e) => debouncedSetQuery(e.currentTarget.value)}
              // THE SEARCH CLEARS ITSELF (the kit's own ✕). It used to be
              // cleared by the filter row's "Clear all", which was one control
              // quietly owning two questions; the kit's bar says "Clear
              // filters" and now means only that. Cleared THROUGH the debounce
              // rather than around it, so a keystroke still in flight cannot
              // land after the ✕ and put the text back.
              onClear={() => debouncedSetQuery("")}
              placeholder={config.searchPlaceholder}
              className="w-44"
            />
          ) : null
          const filterBar = showFilterBar ? (
            <FilterBar
              facets={config.filterFacets}
              values={facetValues}
              data={data}
              onChange={setFacet}
              onClearFacets={() => remember((q) => ({ ...q, facetValues: {} }))}
              resultCount={filtered.length}
              modal={modal}
            />
          ) : null
          const sortControl = showSort ? (
            <SortControl
              options={config.sortOptions}
              value={sortBy}
              onValueChange={setSortBy}
              direction={sortDir}
              onDirectionChange={setSortDir}
            />
          ) : null

          // Mobile: fold the live count into the search placeholder (e.g.
          // "Search 3 roles…") so the header can stay ONE row with no separate
          // count line. (Only rewrites a placeholder that starts with "Search".)
          const mobilePlaceholder = config.showCount
            ? config.searchPlaceholder.replace(
                /^Search\b/i,
                (m) => `${m} ${filtered.length}`
              )
            : config.searchPlaceholder

          // THE FILTER ROW LEFT THE FUNNEL, AND THAT IS THE POINT OF THE SWAP.
          // The phone header used to hide the filters behind a funnel because
          // the old row was a strip of dropdown triggers that could not fit
          // beside a search box. The kit's bar answers the same question itself
          // and answers it the other way round — below `sm` its chips become a
          // one-line horizontal SCROLLER, and its own file says why in as many
          // words: "the moment they are hidden, people forget they are on and
          // read a filtered list as an empty one". So the funnel now holds the
          // SORT and nothing else, and what is narrowing the list is on screen
          // at every width. It cost the dot the funnel used to wear, which was
          // the app telling somebody a filter was on without telling them which.
          return (
            <>
              {/* Mobile (< sm): ONE compact row — a stretching search field + a
                  sort funnel. Left-to-right, never wrapping into stacked rows.
                  The filter bar is its own row below, at every width. */}
              <div className="flex items-center gap-2 sm:hidden">
                {config.searchable ? (
                  <SearchInput
                    defaultValue={query}
                    onChange={(e) => debouncedSetQuery(e.currentTarget.value)}
                    onClear={() => debouncedSetQuery("")}
                    placeholder={mobilePlaceholder}
                    className="min-w-0 flex-1"
                  />
                ) : (
                  <div className="min-w-0 flex-1">{titleBlock}</div>
                )}
                {showSort && (
                  <Popover modal={modal}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        aria-label={t("Sort")}
                        className="size-8 shrink-0"
                      >
                        <ArrowUpDown />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      className="flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-3"
                    >
                      {/* The same control the desktop layout renders (built
                          once above) — just moved into a popover, since the
                          phone header is ONE row: search + this trigger. */}
                      {sortControl}
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              {/* ≥ sm: "inline" = title + search + sort on one wrapping row;
                  "stacked" (default) = a title+search row with the sort on the
                  row below. Sort is IN the header either way, never a bolted-on
                  strip. */}
              <div className="hidden sm:block">
                {config.headerLayout === "inline" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {titleBlock}
                    {searchBox}
                    {sortControl}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {titleBlock}
                      {searchBox}
                    </div>
                    {sortControl && (
                      <div className="flex flex-wrap items-center gap-2">
                        {sortControl}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* THE FILTERS, AT EVERY WIDTH, on their own full-width row. */}
              {filterBar}
            </>
          )
        })()}

      {state === "loading" ? (
        // LAW 4, THE SAME RULE THE RECORD SCREENS WERE JUST MIGRATED TO
        // (RecordScreen's `state`, 73414c58 and its rollout): the header above
        // — search, filters, sort — stays drawn from what the app already
        // knows, and only this region swaps. `filtered.length` is not
        // consulted here on purpose: a `data={[]}` passed in because the
        // fetch has not answered yet must never be read as "the collection is
        // empty", which is exactly the claim a caller with no loading state
        // had no way to avoid making.
        <ShapeStateBody shape="collectionScreen" state="loading" copy={copy} />
      ) : state === "error" ? (
        <ShapeStateBody
          shape="collectionScreen"
          state="error"
          copy={copy}
          action={errorAction}
        />
      ) : filtered.length === 0 ? (
        // ── THE ZERO STATE, AND IT IS TWO STATES ──────────────────────────
        //
        // It used to be one: a dashed box saying "No tickets yet." whether the
        // collection was genuinely empty or a search had simply matched
        // nothing. That sentence is a claim about the COLLECTION and it is
        // plainly untrue mid-search — the same fault `paged-find` names on the
        // server-side path and answers there. So what is said follows what was
        // asked, and only the genuinely-empty half offers the create action:
        // pointing at "New ticket" when a filter is hiding twelve of them would
        // be worse than the grey line it replaces.
        //
        // Drawn through the kit's own composition (`ShapeStateBody`, shape
        // "collectionScreen") rather than the hand-rolled dashed box this used
        // to be — the same register the record screens' empty/error states
        // already draw through. `filtered` picks empty vs no-results for it;
        // it is never guessed, ch27's own rule for exactly this switch.
        //
        // The action is the section's own button, published by the host above
        // (see `CollectionCreateActionProvider`) — the same word and the same
        // glyph, so the zero state cannot invent a second name for one act.
        // A NO-RESULTS zero state offers a way out where one can be run safely
        // — "Clear filters", the exact handler the filter bar's own control
        // runs — rather than the dead end of a sentence with nothing to press.
        // ONLY when a FACET is set: `SearchInput` owns its displayed text
        // itself (`defaultValue`, uncontrolled), so a button that reset the
        // remembered `query` too would tell the reader the box was cleared
        // while the letters they typed stayed on screen. A search-only
        // narrowing keeps the plain sentence, same as before this change.
        //
        // NO ICON HERE ANY MORE — `config.emptyIcon` (a per-recipe glyph) has
        // no seam into `ShapeStateBody`: the composition's own law is "it
        // never draws a mark of its own", which is the kit's considered
        // reading of ch27.21's "no empty-box drawing, no mascot … type and one
        // button carry it". Dropping the icon is that law, not a shim I could
        // not find; a recipe's `emptyIcon` is simply unread from here now.
        <ShapeStateBody
          shape="collectionScreen"
          state="empty"
          filtered={narrowed}
          copy={{ emptyTitle: t(config.emptyText), ...copy }}
          action={
            narrowed
              ? Object.keys(facetValues).length > 0 && (
                  <Button
                    variant="secondary"
                    onClick={() => remember((q) => ({ ...q, facetValues: {} }))}
                  >
                    {t("Clear filters")}
                  </Button>
                )
              : createAction && (
                  <Button onClick={createAction.onCreate} className="gap-1">
                    {createAction.icon}
                    {createAction.label}
                  </Button>
                )
          }
        />
      ) : (
        renderItems(visible)
      )}

      {!serverSide && config.itemsPerPage != null && pageCount > 1 && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <Text as="span" size="caption" tone="tertiary" numeric>
            {t("Page {page} of {pages}", { page: current + 1, pages: pageCount })}
          </Text>
          <Pagination label={t("Pagination")} className="w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  label={t("Prev")}
                  srLabel={t("Prev")}
                  size="sm"
                  disabled={current === 0}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    goTo(current - 1)
                  }}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  label={t("Next")}
                  srLabel={t("Next")}
                  size="sm"
                  disabled={current >= pageCount - 1}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    goTo(current + 1)
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  )
}

export { CollectionFrame }
