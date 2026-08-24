"use client";

/* ============================================================================
   SearchResults — one search's answer: facets, sort, results grouped by kind,
   the exact total, and pages. The body chapter 27.40 pages, in either door.

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" chapter 27.40 (find), chapter 19 (the one toolbar
   contract), 27.21 (empty) and 27.22 (no results).

     ch27.40 on what it is, verbatim:
       "Search across everything, opened from anywhere with one key. It is the
        palette from chapter 12 grown up: the same overlay, now paging real
        results from every kind of thing in the system. There is no find page
        to navigate to — that is the point."

     ch27.40 on paging, verbatim:
       "Eight results a page, counted — '1–8 of 214'. A person looking for one
        thing needs to know how much is left, and an infinite list can never
        tell them."

     ch27.40 on grouping, verbatim:
       "Records first, then files and words. The groups are fixed so the shape
        of the answer is the same every time, and a kind with no hits is left
        out rather than shown empty."

     ch27.40 on the keyboard, verbatim: "Opened with a key, moved with arrows,
       opened with return, paged with the right arrow. The mouse works, but
       the hints stay visible — this is the one place the kit teaches
       shortcuts."

     ch27.40, doors differ, verbatim: "The portal searches its own three kinds
       only — its requests, its deliverables and its own messages. It never
       returns an internal record, and the empty state says so in words rather
       than returning nothing."

     ch19, the toolbar contract, verbatim: "Every view carries the same
       contract: search, filters, three actions, view switch. Only the body
       below the toolbar changes."

   THIS IS A BODY, NOT A PAGE — AND THAT IS 27.40's OWN RULE
   The kit says in as many words that there is no find PAGE, and ch27 law 1
   forbids a screen inventing a second spine. So this shape draws no rail, no
   header band and no dialog: it is the region an overlay pages, and the same
   region a route can drop into a `CollectionFrame` body. It has one column
   and it never splits. Recorded as SR-1 in GAPS-SHAPES2.md.

   THE LAW THIS FILE OBEYS
   · A KIND WITH NO HITS IS LEFT OUT. Structural, not a call-site courtesy:
     `visibleGroups` drops every group with no results before anything is
     drawn, so an empty band cannot be rendered at all.
   · THE COUNT IS EXACT, AND IT IS NOT A `Badge`. `Badge` abbreviates (1.3k,
     2m+) and renders nothing for zero, which is right for a live collection
     count and wrong here: 27.40 states "1–8 of 214" and a reader deciding
     whether to type another word needs the real number. The range line is
     tabular text. SR-2 in GAPS-SHAPES2.md.
   · EMPTY IS NOT NO-RESULTS. `filtered` is computed from what is switched on
     — a term in the field or a chip in the bar — and it chooses between
     ch27.21's register and ch27.22's. ch27.22 forbids mango on that screen.
   · LOADING KEEPS THE ROW SHAPE. ch27.6 wants the same row heights as the
     loaded state, so the loading body is a `List` in its own loading state at
     the page size, never a spinner and never a generic busy register.
   · THE HINTS ARE A PROMISE, SO THEY HAVE NO DEFAULT. `search-input.tsx`
     already ruled this for its own shortcut chip: "the chip is a promise
     about a keyboard shortcut, and a component cannot know whether the app
     kept it." This shape binds no keys — `Command` owns them — so it will not
     print "↑↓ move" on a surface that may not answer an arrow.
   · THE PORTAL SEARCHES THREE KINDS. `door="portal"` says so in development
     rather than quietly returning an internal kind to a client.
   · Focus is one global rule. No ring, no radius, no fill written here.

   RENDERING CONTEXT
   `"use client"`. Search, facets, sort and paging all build handlers during
   this module's own render.
   ========================================================================= */

import * as React from "react";

import {
  FilterBar,
  type FilterChip,
} from "../../controls/filter-bar/filter-bar";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../../controls/pagination/pagination";
import { SearchInput } from "../../controls/search-input/search-input";
import {
  SortControl,
  type SortDirection,
  type SortOption,
} from "../../controls/sort-control/sort-control";
import { Title } from "../../controls/title/title";
import { Text } from "../../controls/typography/typography";
import { List, type ListRow } from "../../structures/list/list";
import { cn } from "../../lib/utils";
import {
  SHAPE_SHELL,
  ShapeStateBody,
  shapeCopy,
  type ScreenDensity,
  type ShapeState,
  type ShapeStateCopy,
} from "../states/states";

/** Which door is searching. Ruling 04's two vocabularies, applied to find. */
export type SearchDoor = "system" | "portal";

/** ch27.40 — "Eight results a page, counted". */
export const SEARCH_PAGE_SIZE = 8;

/**
 * ch27.40, doors differ — the portal searches "its own three kinds only".
 * A fourth band in the portal is a leak, not a layout choice.
 */
export const SEARCH_PORTAL_KINDS = 3;

/**
 * One kind of thing the search found. The kit's own two bands are "Records"
 * and "Files and words"; the set and its order belong to the application,
 * because only it knows what kinds exist.
 */
export interface SearchResultGroup {
  /** Stable key, and the value handed back with a selection. */
  id: string;
  /** The band's quiet label — the kit's "Records", "Files and words". */
  label: React.ReactNode;
  /** The hits on THIS page, already ranked. An empty band is never drawn. */
  results: readonly ListRow[];
  /**
   * The band's accessible name, when `label` is not a plain string. Undefined
   * lets `List` keep its own default rather than hardcoding one here.
   */
  ariaLabel?: string;
}

export interface SearchResultsProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "children" | "onChange" | "title"> {
  /** Which door. Sets the measure and the kind-count check. */
  door?: SearchDoor;
  /** The wide staff measure or the narrow calm one (commission §9). */
  density?: ScreenDensity;

  /** Draw the query field. Off inside a `Command` overlay, which owns its own. */
  searchable?: boolean;
  /** The term. ch27.22: what was typed stays in the field, never silently cleared. */
  searchValue?: string;
  /** Term changed. */
  onSearchChange?: (value: string) => void;
  /** The field's own clear. */
  onSearchClear?: () => void;
  /** Accessible name for the field. */
  searchLabel?: string;
  /** Placeholder. */
  searchPlaceholder?: string;
  /** The query is in flight. The field stays editable — `SearchInput`'s rule. */
  searching?: boolean;

  /** Active facets, as removable chips. ch27.22 wants the cause visible. */
  filters?: FilterChip[];
  /** Remove one facet. */
  onFilterRemove?: (id: string) => void;
  /** Remove them all. */
  onFiltersClear?: () => void;
  /** Label on the clear-all control. */
  filtersClearLabel?: string;
  /** Accessible name for the bar. */
  filtersLabel?: string;
  /** Facet pickers that live in the bar beside the chips. */
  filterControls?: React.ReactNode;

  /** How the answer can be ordered. No options renders no control. */
  sortOptions?: SortOption[];
  /** Which order is on. */
  sortValue?: string;
  /** Order changed. */
  onSortChange?: (value: string) => void;
  /** Which way. */
  sortDirection?: SortDirection;
  /** Direction changed. */
  onSortDirectionChange?: (direction: SortDirection) => void;
  /** Label on the sort control. */
  sortLabel?: string;

  /** The bands, in the order they should read. Empty bands are dropped. */
  groups?: readonly SearchResultGroup[];
  /** A hit was opened. */
  onResultSelect?: (group: SearchResultGroup, index: number, row: ListRow) => void;

  /**
   * The EXACT number of hits across every band and every page. Absent, no
   * range line and no pager are drawn — a count nobody supplied is never
   * guessed from the rows on screen.
   */
  total?: number;
  /** Which page is shown. One-based. */
  page?: number;
  /** ch27.40's eight. */
  pageSize?: number;
  /** How many pages there are. Derived from `total` and `pageSize` when absent. */
  pageCount?: number;
  /** Page changed. */
  onPageChange?: (page: number) => void;
  /** How many numbers sit either side of the current page. */
  siblingCount?: number;
  /** Accessible name for the page strip. */
  paginationLabel?: string;
  /** Label on the back arrow. */
  previousLabel?: string;
  /** Label on the forward arrow. */
  nextLabel?: string;
  /** What a screen reader hears where numbers are elided. */
  ellipsisLabel?: string;

  /**
   * "1–8 of 214", in the reader's own language. The default joins the three
   * numbers with the kit's own English; a locale passes its own.
   */
  formatRange?: (from: number, to: number, total: number) => string;
  /** Accessible name for the range line. */
  rangeLabel?: string;

  /**
   * The keyboard hints ch27.40 keeps visible. NO DEFAULT, deliberately: this
   * shape binds no keys, and a printed "⏎ open" that nothing answers is a lie
   * the reader cannot check. The surface that binds them passes them.
   */
  hints?: React.ReactNode;

  /** Loading, empty, no-results or error. The toolbar stays drawn (law 4). */
  state?: ShapeState;
  /** Per-locale words. */
  copy?: Partial<ShapeStateCopy>;
  /** ch27.22's way back, offered when a term or a facet excluded everything. */
  noResultsAction?: React.ReactNode;
  /** The retry on a block failure. */
  errorAction?: React.ReactNode;
}

/* ----------------------------------------------------------------------------
   Which page numbers to draw.

   Arithmetic, not design: the first page, the last page, `siblingCount`
   either side of the current one, and `null` where a run is elided. The same
   shape `data-table.tsx` computes for its own strip — that function is
   private to that file, and duplicating fifteen lines of arithmetic is a
   smaller cost than exporting a collection's internals. Logged as SR-3.
   ------------------------------------------------------------------------- */
function pageWindow(
  page: number,
  pageCount: number,
  siblingCount: number,
): Array<number | null> {
  if (pageCount <= 0) return [];
  const first = 1;
  const last = pageCount;
  const from = Math.max(first, page - siblingCount);
  const to = Math.min(last, page + siblingCount);

  const out: Array<number | null> = [];
  if (from > first) {
    out.push(first);
    if (from > first + 1) out.push(null);
  }
  for (let index = from; index <= to; index += 1) out.push(index);
  if (to < last) {
    if (to < last - 1) out.push(null);
    out.push(last);
  }
  return out;
}

/** One number in the runtime's own numbering system, ungrouped. */
function plainNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { useGrouping: false }).format(value);
}

/** One number in the runtime's own numbering system, grouped as it groups. */
function groupedNumber(value: number): string {
  return new Intl.NumberFormat(undefined).format(value);
}

/** ch27.40's own line: "1–8 of 214". */
function defaultFormatRange(from: number, to: number, total: number): string {
  return `${groupedNumber(from)}–${groupedNumber(to)} of ${groupedNumber(total)}`;
}

/**
 * A search's answer.
 *
 * TEN STATES
 *  1. default        — toolbar, then a band per kind, then the range and the
 *                      pager.
 *  2. hover          — the row wash, owned by `List`.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — not drawn for a hit: opening one navigates, and the
 *                      acknowledgement is the destination (GAPS-COL3 LST-4).
 *                      The pager's controls take the kit's own nudge.
 *  5. disabled       — does not apply to the region. A reader who may not open
 *                      a kind is not returned that kind, which is ch24.6's
 *                      rule and happens above this component.
 *  6. loading        — one `List` at the page size in ITS loading state, so
 *                      the rows do not jump when the answer lands. The field
 *                      stays editable and takes `searching` instead.
 *  7. empty          — nothing typed yet: ch27.21's register, "Search across
 *                      everything". No mango — there is nothing to create.
 *  8. error          — ruling 06's block failure, with the retry.
 *  9. selected       — does not apply. A hit is a link, not a choice.
 * 10. read-only      — always. A search result is never editable.
 *
 * NO-RESULTS IS A NINTH THING, AND IT IS NOT STATE 7. ch27.22: "It is a
 * different screen from 27.21 and must never be mistaken for it." `filtered`
 * routes to it, and it carries a way back rather than a create.
 *
 * THREE BREAKPOINTS
 *  mobile   — 27.40's own narrow render: "the overlay becomes the screen".
 *             The toolbar WRAPS rather than dropping a control (ch27.1: "The
 *             toolbar is never dropped — it condenses"), the range line and
 *             the hints wrap onto their own lines, and the page strip drops
 *             to one line of arrows and numbers — `PaginationContent`'s own
 *             answer, not one added here.
 *  tablet   — unchanged.
 *  desktop  — unchanged in structure; `density` sets the measure.
 *
 * RTL — LTR only by client ruling. Logical properties throughout.
 */
function SearchResults({
  className,
  door = "system",
  density,
  searchable = true,
  searchValue,
  onSearchChange,
  onSearchClear,
  searchLabel = "Search everything",
  searchPlaceholder = "Search",
  searching = false,
  filters,
  onFilterRemove,
  onFiltersClear,
  filtersClearLabel,
  filtersLabel,
  filterControls,
  sortOptions,
  sortValue,
  onSortChange,
  sortDirection,
  onSortDirectionChange,
  sortLabel = "Sort",
  groups,
  onResultSelect,
  total,
  page = 1,
  pageSize = SEARCH_PAGE_SIZE,
  pageCount,
  onPageChange,
  siblingCount = 1,
  paginationLabel,
  previousLabel,
  nextLabel,
  ellipsisLabel,
  formatRange = defaultFormatRange,
  rangeLabel,
  hints,
  state = "ready",
  copy,
  noResultsAction,
  errorAction,
  ...props
}: SearchResultsProps) {
  const measure: ScreenDensity = density ?? (door === "portal" ? "calm" : "comfortable");
  const words = shapeCopy("searchResults", copy);

  /* ch27.40 — "a kind with no hits is left out rather than shown empty". Done
     here rather than asked of the call site, so an empty band cannot be
     drawn at all. */
  const visibleGroups = (groups ?? []).filter((group) => group.results.length > 0);

  if (
    process.env.NODE_ENV !== "production" &&
    door === "portal" &&
    visibleGroups.length > SEARCH_PORTAL_KINDS
  ) {
    console.warn(
      `SearchResults: door="portal" searches ${SEARCH_PORTAL_KINDS} kinds — its requests, its deliverables and its own messages — and got ${visibleGroups.length}.`,
    );
  }

  /* ch27.22's whole distinction, computed rather than guessed: something is
     switched on, so the absence has a cause and a way back. */
  const filtered =
    (searchValue !== undefined && searchValue.length > 0) ||
    (filters !== undefined && filters.length > 0);

  const resolvedPageCount =
    pageCount ?? (total === undefined ? undefined : Math.max(1, Math.ceil(total / pageSize)));

  /* "1–8 of 214". The last page is short, so the upper bound is the total. */
  const rangeFrom = total === undefined || total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = total === undefined ? 0 : Math.min(page * pageSize, total);

  const toolbar =
    !searchable &&
    filters === undefined &&
    filterControls === undefined &&
    sortOptions === undefined ? null : (
      /* ch19's order: search, then facets, then sort. It wraps; it is never
         dropped. */
      <div
        data-slot="search-results-toolbar"
        className="flex min-w-0 flex-wrap items-center gap-3"
      >
        {searchable ? (
          <SearchInput
            value={searchValue}
            onChange={
              onSearchChange === undefined
                ? undefined
                : (event) => {
                    onSearchChange(event.currentTarget.value);
                  }
            }
            onClear={onSearchClear}
            label={searchLabel}
            placeholder={searchPlaceholder}
            loading={searching}
            className="min-w-0 flex-1"
          />
        ) : null}

        {filters === undefined && filterControls === undefined ? null : (
          <FilterBar
            filters={filters}
            onRemove={onFilterRemove}
            onClear={onFiltersClear}
            clearLabel={filtersClearLabel}
            label={filtersLabel}
            loading={state === "loading"}
          >
            {filterControls}
          </FilterBar>
        )}

        {sortOptions === undefined ? null : (
          <SortControl
            options={sortOptions}
            value={sortValue}
            onValueChange={onSortChange}
            direction={sortDirection}
            onDirectionChange={onSortDirectionChange}
            label={sortLabel}
            loading={state === "loading"}
            className="ms-auto"
          />
        )}
      </div>
    );

  /* ch27.6 — the unfilled body is the SAME body at the same row heights, so
     nothing jumps when the answer lands. Never a spinner. */
  const body =
    state === "loading" ? (
      <List
        rows={[]}
        state="loading"
        loadingLines={pageSize}
        loadingLabel={words.loadingLabel}
      />
    ) : state === "error" ? (
      <ShapeStateBody
        shape="searchResults"
        state="error"
        copy={copy}
        action={errorAction}
      />
    ) : visibleGroups.length === 0 ? (
      <ShapeStateBody
        shape="searchResults"
        state="empty"
        filtered={filtered}
        copy={copy}
        /* ch27.22 forbids mango here: clearing a filter is a retreat. There is
           deliberately no `emptyAction` on this shape — a search has nothing
           to create. */
        action={filtered ? noResultsAction : undefined}
      />
    ) : (
      <div data-slot="search-results-groups" className="flex min-w-0 flex-col gap-6">
        {visibleGroups.map((group) => (
          <div key={group.id} className="flex min-w-0 flex-col gap-3">
            {/* The band label is the kit's quiet micro line, which is exactly
                what `Title`'s eyebrow already is — a heading step here would
                make a two-row band shout louder than the hits inside it. The
                list below carries the same words as its accessible name. */}
            <Title as="h3" eyebrow={group.label} rule={false} />
            <List
              rows={group.results}
              label={group.ariaLabel}
              onRowSelect={
                onResultSelect === undefined
                  ? undefined
                  : (index, row) => {
                      onResultSelect(group, index, row);
                    }
              }
            />
          </div>
        ))}
      </div>
    );

  const showRange = total !== undefined && state === "ready";
  const showPager =
    state === "ready" && resolvedPageCount !== undefined && resolvedPageCount > 1;

  const footer =
    !showRange && !showPager && hints === undefined ? null : (
      <div data-slot="search-results-footer" className="flex min-w-0 flex-col gap-3">
        {!showRange && hints === undefined ? null : (
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {showRange ? (
              /* Exact, tabular, and never a `Badge`: an abbreviated total is
                 the wrong answer to "how much is left". */
              <Text as="p" size="caption" tone="tertiary" numeric aria-label={rangeLabel}>
                {formatRange(rangeFrom, rangeTo, total)}
              </Text>
            ) : null}
            {hints === undefined ? null : (
              <Text as="p" size="caption" tone="tertiary" className="ms-auto">
                {hints}
              </Text>
            )}
          </div>
        )}

        {showPager ? (
          <Pagination label={paginationLabel}>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  label={previousLabel}
                  srLabel={previousLabel}
                  disabled={page <= 1}
                  href={onPageChange === undefined ? undefined : "#"}
                  onClick={(event) => {
                    event.preventDefault();
                    if (page > 1) onPageChange?.(page - 1);
                  }}
                />
              </PaginationItem>

              {pageWindow(page, resolvedPageCount, Math.max(siblingCount, 0)).map(
                (entry, index) =>
                  entry === null ? (
                    <PaginationItem key={`gap-${index}`}>
                      <PaginationEllipsis label={ellipsisLabel} />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={entry}>
                      <PaginationLink
                        isActive={entry === page}
                        href={onPageChange === undefined ? undefined : "#"}
                        onClick={(event) => {
                          event.preventDefault();
                          onPageChange?.(entry);
                        }}
                      >
                        {plainNumber(entry)}
                      </PaginationLink>
                    </PaginationItem>
                  ),
              )}

              <PaginationItem>
                <PaginationNext
                  label={nextLabel}
                  srLabel={nextLabel}
                  disabled={page >= resolvedPageCount}
                  href={onPageChange === undefined ? undefined : "#"}
                  onClick={(event) => {
                    event.preventDefault();
                    if (page < resolvedPageCount) onPageChange?.(page + 1);
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        ) : null}
      </div>
    );

  return (
    <div
      data-slot="search-results"
      data-door={door}
      data-density={measure}
      data-state={state}
      className={cn("flex w-full min-w-0 flex-col", SHAPE_SHELL[measure], className)}
      {...props}
    >
      {toolbar}
      {body}
      {footer}
    </div>
  );
}

SearchResults.displayName = "SearchResults";

export { SearchResults };
