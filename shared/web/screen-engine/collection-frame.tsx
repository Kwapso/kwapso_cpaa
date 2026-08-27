"use client"

// CollectionFrame — the shared "chrome" every collection wears. You hand it the
// FULL row array plus a function that renders one page of rows; it applies the
// Glide-style collection config for you:
//   • title           — an optional header
//   • filter / sort    — EXECUTED here (via selectRows) from the config's rules
//   • searchable       — a debounced SearchInput that filters the named columns
//   • userFilter       — a FilterBar of `filterFacets` (dropdowns / chips)
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
import { ArrowUpDown, ChevronLeft, ChevronRight } from "@shared/ui/icons"
import { Filter } from "@shared/ui/icons"
import { kitIcon } from "./tabs-view"

import { selectRows } from "./collection"
import { type CollectionConfig } from "./config"
import { cn } from "@shared/ui/lib/utils"
import { useT } from "@shared/web/language"
import { Button } from "@shared/ui/controls/button/button"
import { FilterBar } from "./filter-bar"
import { SortControl } from "@shared/ui/controls/sort-control/sort-control"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@shared/ui/controls/popover/popover"
import { SearchInput } from "@shared/ui/controls/search-input/search-input"
import { useDebouncedCallback } from "@shared/ui/controls/use-debounce/use-debounce"
import { useIsVisible } from "./visibility"

function CollectionFrame<T>({
  config,
  data,
  searchKeys,
  renderItems,
  serverSide = false,
  onQueryChange,
  modal = false,
  className,
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
  className?: string
}) {
  const t = useT()
  const [query, setQuery] = React.useState("")
  // The OLD SearchInput debounced internally; the kit's is a plain input, so
  // the debounce lives here now — same 300ms the old control used.
  const debouncedSetQuery = useDebouncedCallback((next: string) => setQuery(next), 300)
  const [facetValues, setFacetValues] = React.useState<Record<string, string>>(
    {}
  )
  // The user's LIVE sort, seeded from the declared config sort. Config stays
  // declarative (it says where sorting starts); this is the runtime choice —
  // exactly the split between builder `filter` and user `facetValues`.
  const [sortBy, setSortBy] = React.useState(config.sortBy)
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">(config.sortDir)
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

  const showFilterBar = config.userFilter && config.filterFacets.length > 0
  const showSort = config.sortable && config.sortOptions.length > 0
  const showHeader =
    config.title ||
    config.showCount ||
    config.searchable ||
    showFilterBar ||
    showSort
  const canClear =
    query !== "" || Object.values(facetValues).some((v) => v !== "")

  const setFacet = (field: string, value: string) =>
    setFacetValues((s) => {
      const next = { ...s }
      if (value === "") delete next[field]
      else next[field] = value
      return next
    })

  const clearAll = () => {
    setQuery("")
    setFacetValues({})
  }

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
              onClearAll={clearAll}
              canClear={canClear}
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

          return (
            <>
              {/* Mobile (< sm): ONE compact row — a stretching search field + a
                  funnel that opens the same FilterBar in a popover. Left-to-right,
                  never wrapping into 2–3 stacked rows. */}
              <div className="flex items-center gap-2 sm:hidden">
                {config.searchable ? (
                  <SearchInput
                    defaultValue={query}
                    onChange={(e) => debouncedSetQuery(e.currentTarget.value)}
                    placeholder={mobilePlaceholder}
                    className="min-w-0 flex-1"
                  />
                ) : (
                  <div className="min-w-0 flex-1">{titleBlock}</div>
                )}
                {(showFilterBar || showSort) && (
                  <Popover modal={modal}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        aria-label={
                          showFilterBar && showSort
                            ? t("Filters and sort")
                            : showSort
                              ? t("Sort")
                              : t("Filters")
                        }
                        className="relative size-8 shrink-0"
                      >
                        {showFilterBar ? <Filter /> : <ArrowUpDown />}
                        {canClear && (
                          <span
                            aria-hidden
                            className="absolute top-1 right-1 size-1.5 rounded-pill bg-primary"
                          />
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      className="flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-3"
                    >
                      {/* The same controls the desktop layout renders (built
                          once above) — just stacked into a popover, since the
                          phone header is ONE row: search + this trigger. */}
                      {sortControl}
                      {filterBar}
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              {/* ≥ sm: the desktop/tablet layout — UNCHANGED. "inline" = title +
                  search + filters on one wrapping row; "stacked" (default) =
                  title+search row with the filter bar on its own line below. */}
              {/* ≥ sm: "inline" = title + search + filters + sort on one
                  wrapping row; "stacked" (default) = title+search row with the
                  filters and sort together on the row below — sort is IN the
                  header, aligned with the filters, never a bolted-on strip. */}
              <div className="hidden sm:block">
                {config.headerLayout === "inline" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {titleBlock}
                    {searchBox}
                    {filterBar}
                    {sortControl}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {titleBlock}
                      {searchBox}
                    </div>
                    {(filterBar || sortControl) && (
                      <div className="flex flex-wrap items-center gap-2">
                        {filterBar}
                        {sortControl}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )
        })()}

      {filtered.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-dashed p-8 text-center text-sm text-muted-foreground">
          {/* aria-hidden by construction: the sentence under it already says
              what this is. The icon comes from the kit's set by name; a name
              the kit lacks renders nothing, same contract as the old
              DynamicIcon fallback. */}
          {config.emptyIcon ? (
            <span aria-hidden className="mx-auto mb-3 block w-fit [&_svg]:size-8">
              {kitIcon(config.emptyIcon)}
            </span>
          ) : null}
          {t(config.emptyText)}
        </div>
      ) : (
        renderItems(visible)
      )}

      {!serverSide && config.itemsPerPage != null && pageCount > 1 && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("Page {page} of {pages}", { page: current + 1, pages: pageCount })}
          </span>
          <div className="flex gap-1">
            <Button
              variant="secondary"
              size="sm"
              disabled={current === 0}
              onClick={() => goTo(current - 1)}
            >
              <ChevronLeft /> {t("Prev")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={current >= pageCount - 1}
              onClick={() => goTo(current + 1)}
            >
              {t("Next")} <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export { CollectionFrame }
