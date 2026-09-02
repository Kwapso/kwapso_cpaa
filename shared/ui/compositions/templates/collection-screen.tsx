"use client";

/* ============================================================================
   CollectionScreen — heading, exact count, tabs, filters, search, sort, rows,
   "load more" and empty. The most-visited screen in either door.

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" chapter 27.1 (collection page), chapter 19 (the one
   toolbar contract), 27.13 (tabs), 27.21 (empty) and 27.22 (no results).

     ch27.1, the region order, verbatim:
       "Figures, folder tabs, then the collection panel — toolbar, rows, pager
        inside it. A collection may drop the figure strip; it may not reorder
        what remains, and filters never sit above the tabs."

     ch19, the toolbar contract, verbatim:
       "Every view carries the same contract: search, filters, three actions,
        view switch. Only the body below the toolbar changes."

     ch27.21 on the count, verbatim: "Zeros are shown, not hidden. A blank
       strip looks broken; a zero in disabled ink says the count is real and
       the collection is simply new."

     ch27.22, why empty and no-results are two screens, verbatim: "Empty
       (27.21) offers a create button; no-results offers a way back. Showing
       'Add a record' to someone whose filter is too narrow makes them create
       a duplicate of something they already have."

   ─────────────────────────────────────────────────────────────────────────
   CLIENT FEEDBACK, ROUND 1 — THE TWO THINGS THE TOOLBAR WAS MISSING
   ─────────────────────────────────────────────────────────────────────────

   ITEM 4, verbatim: "you missed a full section of the toolbar which is the
   view selector! review the screenshot from the claude design! its explained
   there! 1 search 2 filters 3 views 4 buttons".

   True, and the miss was total. `CollectionFrame` has carried a `viewSwitch`
   slot from the start and CH19's contract has been quoted in three files, but
   NO CONTROL was ever drawn for it and no route in either door passed one.
   Zone 3 was a hole with a name. `ViewSwitch` is the control the chapter
   draws — a paper caret pill, not a segmented control — and `views` / `view`
   / `onViewChange` are how a route reaches it. Which bodies a collection
   offers is per-collection data (CH27.28), so nothing is defaulted here.

   HOW THE CHOSEN VIEW PERSISTS IS RULED — and this shape still stores
   nothing. CH27's own fifth owed rule, OPEN.md §C21 item 5, decision D7-5.
   Client, 2026-08-24: *"no. this is individual"*. Remembered, per person;
   first run table-first; register row 69. `view` stays CONTROLLED because the
   kit owns neither the user nor the storage policy — the application reads
   the person's stored view in and writes it back out. See the `view` prop.

   ITEM 3, verbatim: "everytime i see a collection, on the toolbar, at least i
   need to have the + button (yes, on every view unless specifically
   specified)."

   So zone 4's charcoal `+` is now the DEFAULT and `toolbarCreate={false}` is
   the opt-out the client's own parenthesis grants. Before this, the `+` was
   opt-in through `toolbarActions` and NO route in either door opted in — so
   the panel's create existed on two screens in the whole build, and below
   `sm`, where `MainScreen` hides the header band's actions, a collection had
   no create control at all. The pair rule is untouched: this one is
   `variant="inverse"`, charcoal, and 27.22's "The page-level mango + stays in
   the header where it always is" is still true because the header's control
   is not touched here.

   IT IS A MAIN SCREEN, AND SINCE 2026-08-23 IT SAYS SO IN CODE
   `SHELL.md`, the merged law: "a main screen is in the navbar; a detail
   screen has breadcrumbs." A collection is in the navbar, so this shape is
   the kit's main screen with a table or a list for a body — and it now
   RENDERS `MainScreen` rather than assembling chrome of its own.

   What that fixed, all of it read off `SHELL.md`'s own list of errors:

     · THE OFF-BEIGE BODY PANE. This file used to return a bare `div` with a
       measure on it and put `CollectionFrame` straight into the document. The
       page, the screen card, the rail and the body pane were all missing, so
       a soft-paper panel stood on whatever the document happened to be. Four
       levels now, drawn once, in `screen-shell.tsx`.
     · THE FIGURE STRIP LIES BARE. It is on the body pane, not in cards. The
       dashboard (27.11) is the one exception the kit names.
     · NO FOOTER. `MainScreen` has no footer slot at all, so this shape cannot
       grow one by accident. The paragraph below about CH27.8 was already the
       right answer and is now enforced by the type.
     · ONE MANGO, AND IT IS A GLYPH. The header band's `+` comes from
       `onCreate` and is unlabelled — "Create is always the glyph, never the
       word". Routes used to pass a labelled `New role` / `New ticket` button
       into `actions`, which put a WORD on the create and a mango inside the
       toolbar instead of the header band. `actions` is now the header band's
       paper pills (Export and its neighbours); the panel's own charcoal `+`
       is drawn from `onToolbarCreate` and `toolbarActions` carries only the
       panel's paper pills beside it.
     · THE TOOLBAR IS INSIDE THE PANEL. It always was — `CollectionFrame`
       draws it as the panel's first row — and it stays there.

   THE EYEBROW CARRIES THE COUNT. `SHELL.md`: a main screen's eyebrow is
   `GROUP · 24 RECORDS`, the scope then the count. The count used to ride
   beside the heading as a `Badge` chip inside the frame; it is the same
   number, in the place the kit draws it, and `countLabel` is the word after
   it. A zero renders as nothing at all rather than "0", which is both
   `SHELL.md`'s sentence and what `Badge` already did.

   THE LAW THIS FILE OBEYS
   · THE ORDER IS NOT THE CALL SITE'S. `CollectionFrame` fixes heading →
     figures → tabs → toolbar → body, and the toolbar fixes search → filters →
     period → view switch → actions. This file passes nodes into those slots
     and cannot reorder them, which is exactly why it uses the frame instead
     of a div. The `period` slot is override 28's (2026-08-23): CH27.26 draws
     `‹ 6 weeks ›` inside the toolbar, so the LIST of slots grew by one while
     the ORDER stayed the frame's. It is forwarded here rather than left
     unreachable, because the override's own words forbid the alternative — a
     call site "smuggling a control into `filters`".
   · THERE IS ONE TAB SHAPE AND THIS FILE STATES NOTHING ABOUT IT. Under
     ruling E of 2026-08-22 ("folder tabs are for main screens, line tabs for
     detail screens") a collection was a main screen and this file wrote
     `tabsVariant="folder"` rather than leaning on `CollectionFrame`'s
     default, so the ruling would be legible in the file it governed. The
     client retired the folder tab variant on 2026-09-02 — "the only tabs that
     we will have are the line tabs because folders will only be used for the
     breadcrumbs" — so there is no shape to choose, no prop to pass and
     nothing for a reader to have to look up. CH27.1's "figures, folder tabs,
     then the collection panel" and CH27.13's "folder tabs belong to
     collections and main screens only" are both stale by one word; their
     ORDER is not, and the frame still enforces it.
   · THERE IS NO INK FOOTER ON THIS SHAPE, AND THAT IS NOT AN OMISSION.
     CH27.8's charcoal two-column card ends a RECORD detail page — "every
     detail page ends with the charcoal card … it appears once per record". A
     collection is not a record and has no Latest activity and no Record block
     of its own; what ends a collection is its pager. Stated here because the
     DEF-1 sweep of 2026-08-23 walked every file that names `RecordChrome`,
     and this one names it only to point at the other half of ruling E.
   · EMPTY IS NOT NO-RESULTS. `filtered` is computed from what is actually
     switched on — a term in the field or a chip in the bar — and it changes
     both the register and the action. ch27.22 forbids mango on that screen.
   · LOADING KEEPS THE ROW SHAPE. ch27.6 wants "same column widths, same row
     heights as the loaded state", so the loading body is the SAME table or
     list in its own loading state, not a generic busy register.
   · THE COUNT IS EXACT AND A ZERO IS DRAWN. `count={0}` renders a quiet zero.
   · Focus is one global rule. Nothing here draws a ring, a radius or a fill.

   RENDERING CONTEXT
   `"use client"`. Search, sort, filters and paging all create handlers during
   this module's own render.
   ========================================================================= */

import * as React from "react";

import { ActionRow } from "../../components/action-row/action-row";
import { Button } from "../../components/button/button";
import {
  FilterBar,
  type FilterChip,
} from "../../components/filter-bar/filter-bar";
import { SearchInput } from "../../components/search-input/search-input";
import {
  SortControl,
  type SortDirection,
  type SortOption,
} from "../../components/sort-control/sort-control";
import type { CollectionFrameTab } from "../../components/collection-frame/collection-frame";
import {
  ViewSwitch,
  type CollectionViewOption,
} from "../../components/collection-frame/view-switch";
import {
  DataTable,
  type DataTableColumn,
} from "../../components/data-table/data-table";
import { List, type ListRow } from "../../components/list/list";
import { Plus } from "../../foundations/icons";
import { MainScreen } from "./main-screen";
import {
  ShapeStateBody,
  shapeCopy,
  type ScreenDensity,
  type ShapeState,
  type ShapeStateCopy,
} from "../states/states";

/** `CollectionFrame`'s own figure, and the kit's: "three actions". Mirrored
    here only so the create's extra seat can be added to it — see
    `frameMaxActions` below. */
const DEFAULT_MAX_ACTIONS = 3;

export interface CollectionScreenProps<TRow>
  extends Omit<
    React.ComponentPropsWithoutRef<"div">,
    "children" | "onChange" | "title"
  > {
  /**
   * Which door. Sets the measure and the heading step, and is what a screen
   * reports as `data-door`. Given without `density`, the system door is the
   * wide one and the portal the calm one.
   */
  door?: "system" | "portal";
  /** The wide staff door or the narrow calm one (commission §9). */
  density?: ScreenDensity;

  /* ---- The shell. `MainScreen`'s, which is `ScreenShell`'s. -------------
     A collection is in the navbar, so it gets the same four levels and the
     same rail a record does. Neither this file nor a route draws either. */

  /** The navigation rail's contents. Placed by the shell, dropped narrow. */
  rail?: React.ReactNode;
  /** Accessible name for the rail. */
  railLabel?: string;

  /** The micro line above the heading. Rendered as `SCOPE · N RECORDS`. */
  eyebrow?: React.ReactNode;
  /** What this collection is called. */
  heading?: React.ReactNode;
  /** The exact number of records. A zero is drawn, never hidden (ch27.21). */
  count?: number;
  /** How the count reads. Grouping and locale belong to the app, not here. */
  formatCount?: (value: number) => string;
  /** Accessible suffix for the count chip. */
  countLabel?: string;
  /** The figure strip. A `StatStrip`. A collection may drop it (ch27.1). */
  figures?: React.ReactNode;

  /** The subsets. Every tab could be written as a filter — that is the test. */
  tabs?: CollectionFrameTab[];
  /** Controlled tab. */
  tab?: string;
  /** Uncontrolled first tab. ch27.13: "All for a collection". */
  defaultTab?: string;
  /** The tab belongs in the URL. */
  onTabChange?: (value: string) => void;
  /** Accessible name for the tab row. */
  tabsLabel?: string;

  /** Draw the search field. A collection you cannot search is not a collection (ch27.1). */
  searchable?: boolean;
  /** The term. ch27.22: whatever was typed stays in the field, never silently cleared. */
  searchValue?: string;
  /** Term changed. */
  onSearchChange?: (value: string) => void;
  /** The field's own clear. */
  onSearchClear?: () => void;
  /** Accessible name for the field. */
  searchLabel?: string;
  /** Placeholder. */
  searchPlaceholder?: string;

  /** Active facets, as removable chips. ch27.22 wants the cause visible and removable. */
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

  /** Sort options. Drawn in the view-switch slot — see SHP-5 in GAPS-SHAPES.md. */
  sortOptions?: SortOption[];
  /** Which sort is on. */
  sortValue?: string;
  /** Sort changed. */
  onSortChange?: (value: string) => void;
  /** Which way. */
  sortDirection?: SortDirection;
  /** Direction changed. */
  onSortDirectionChange?: (direction: SortDirection) => void;
  /** Label on the sort control. */
  sortLabel?: string;

  /**
   * The period stepper — CH27.26's `‹ 6 weeks ›`, between the filters and the
   * view switch. Override 28's grown slot, forwarded to `CollectionFrame`'s
   * own `period` so a timeline or gantt body can put its stepper where the
   * chapter draws it instead of smuggling it into `filters`, which the
   * override forbids by name. A placement, not a drawing: pass
   * `GanttPeriodStepper`, or a control of your own.
   */
  period?: React.ReactNode;
  /**
   * ZONE 3 OF THE TOOLBAR — THE BODIES THIS COLLECTION OFFERS.
   *
   * Client feedback round 1 item 4: *"you missed a full section of the
   * toolbar which is the view selector! … 1 search 2 filters 3 views 4
   * buttons"*. The slot existed on `CollectionFrame` and no control ever
   * stood in it; `ViewSwitch` is that control and these three props are how a
   * route reaches it.
   *
   * WHICH VIEWS, PER COLLECTION, IS DATA. CH27.28: *"Gallery appears in the
   * view switcher for deliverables, assets and screens. It is never offered
   * for tickets, accounts or sprints"*. So there is no default list here and
   * no default labels — the set is the route's, because only the route knows
   * its own vocabulary.
   *
   * FEWER THAN TWO AND NOTHING IS DRAWN. `ViewSwitch`'s own rule: a switcher
   * offering one view is chrome. `/meetings` already worked that way.
   *
   * **PUT THE TABLE FIRST.** `views[0]` is what a reader who has never chosen
   * gets — ruling D7-5, below.
   */
  views?: CollectionViewOption[];
  /**
   * The body on screen. CONTROLLED ONLY, and this shape stores nothing.
   *
   * **D7-5 IS RULED.** Client, 2026-08-24, verbatim: *"no. this is
   * individual"*, to *"when you switch your view, should a colleague's screen
   * change too?"*. The choice is REMEMBERED and it is PER PERSON; first run
   * is table-first. Register row 69.
   *
   * The kit still stores nothing, deliberately: it does not own the user, the
   * workspace or the storage policy, and an app with a real preference store
   * would then have two sources of truth. **What a consuming app must do:**
   * read the person's stored view into this prop, write it back from
   * `onViewChange`, and key the store by the PERSON — never the workspace,
   * the team or the account. An app with nothing better can call
   * `useRememberedView` from `structures/collection-frame/use-remembered-view`,
   * which keeps the choice in that one browser profile.
   */
  view?: string;
  /**
   * The reader picked a different body. Swapping `rows`/`columns` is the
   * route's, and so is writing the choice back to whatever remembers it.
   */
  onViewChange?: (value: string) => void;
  /** What a screen reader hears on the view pill. The kit draws no visible label. */
  viewLabel?: string;
  /** An escape hatch for a switcher this shape cannot build. Drawn after `views`. */
  viewSwitch?: React.ReactNode;
  /**
   * The header band's secondary controls — `⤓ Export` and its neighbours.
   * PAPER PILLS. The screen's one mango is `onCreate`, drawn after them as
   * an unlabelled `+`, and a labelled create passed in here is the error
   * `SHELL.md` names by name.
   */
  actions?: React.ReactNode;
  /**
   * The panel's OWN actions, pinned to the inline end of the toolbar. Paper
   * pills — `Export` and its neighbours. The CHARCOAL `+` is no longer passed
   * in here; it is drawn after these, by default, from `onToolbarCreate` —
   * see below.
   */
  toolbarActions?: React.ReactNode;
  /** How many toolbar actions stay visible before the rest fold into an overflow. */
  maxActions?: number;

  /**
   * ZONE 4'S `+` — THE COLLECTION'S CHARCOAL CREATE, AND IT IS NOW THE
   * DEFAULT RATHER THAN SOMETHING A ROUTE OPTS INTO.
   *
   * Client feedback round 1 item 3, verbatim: *"everytime i see a collection,
   * on the toolbar, at least i need to have the + button (yes, on every view
   * unless specifically specified)."*
   *
   * The state this replaces: `toolbarActions` was wired end to end and passed
   * by ZERO routes, so the charcoal `+` existed on exactly two screens in the
   * whole build and on no collection in either door. Every collection had one
   * create control, the header band's mango — and `MainScreen` hides the
   * header band's actions below `sm`, so at 380 a collection had NO create
   * control at all. Making this the default is what puts one back at every
   * width, which is `SHELL.md`'s own narrow rule read the right way round:
   * narrow "drops controls, never counts", and the control it drops is the
   * header's, not the panel's.
   *
   * IT IS CHARCOAL AND THE PAIR RULE HOLDS. `SHELL.md`: "the page header's
   * `+` is mango; the collection panel's own `+` is charcoal; only one mango
   * in the pair." This one is `variant="inverse"`, so nothing here adds a
   * second mango to any screen, and 27.22's *"The page-level mango + stays in
   * the header where it always is"* stays true — the header's control is
   * untouched.
   *
   * WHY A SEPARATE HANDLER FROM `onCreate`. Every route in the system door
   * gates the header's mango behind `registerHasMango ? undefined : onCreate`
   * — on the empty, unfiltered screen the one mango moves into 27.21's
   * register and the header stands down. Keying the toolbar's `+` off
   * `onCreate` would have made it vanish on exactly the screen where creating
   * matters most. `onToolbarCreate` is the ungated handler, and it falls back
   * to `onCreate` for a call site that has no such dance.
   */
  onToolbarCreate?: () => void;
  /**
   * THE CLIENT'S OWN OPT-OUT: *"unless specifically specified"*. Set `false`
   * on a collection that must not offer a create — Archive, an activity log,
   * a collection a reader may only read. It suppresses the control outright
   * rather than disabling it, which is ch24.6's rule and `SHELL.md`'s.
   *
   * A collection that passes NEITHER `onToolbarCreate` NOR `onCreate` also
   * gets nothing, with no flag needed: no handler, no control.
   */
  toolbarCreate?: boolean;
  /** What a screen reader hears on the toolbar's `+`. Defaults to `createLabel`. */
  toolbarCreateLabel?: string;

  /**
   * The one mango on the screen: an unlabelled `+` in the header band. Omit
   * it and no control is drawn at all — which is Archive, the activity log
   * and Link sent, the three screens `SHELL.md` says carry no mango.
   */
  onCreate?: () => void;
  /** What a screen reader hears on the `+`. Required by the glyph-only rule. */
  createLabel?: string;

  /** A band above the toolbar, inside the panel. Only Archive draws one. */
  band?: React.ReactNode;

  /** The records. */
  rows: TRow[];
  /** A stable key per row. Never an index. */
  getRowId: (row: TRow, index: number) => string;
  /** Table columns. When given, the body is a `DataTable`. */
  columns?: Array<DataTableColumn<TRow>>;
  /** Row projection. When given without `columns`, the body is a `List`. */
  renderRow?: (row: TRow, index: number) => ListRow;
  /**
   * Open a record. Honoured on BOTH bodies — the table draws it on the record
   * cell, the list makes the whole row a button. Omit it, rather than passing
   * a no-op, for a collection with no record behind a row: a handler that is
   * passed is a target that is drawn.
   */
  onRowSelect?: (row: TRow, index: number) => void;
  /** The open target's accessible name, when the record cell is a node. Table body only. */
  getRowOpenLabel?: (row: TRow, index: number) => string;
  /** Which column carries the record name. Defaults to the first. Table body only. */
  recordColumnKey?: string;
  /** Accessible name for the body. */
  bodyLabel?: string;

  /** The pager. ch27.1 puts one inside the panel, after the rows. */
  page?: number;
  /** How many pages there are. */
  pageCount?: number;
  /** Page changed. */
  onPageChange?: (page: number) => void;

  /**
   * The commission's "load more". Opt-in: the kit draws a PAGER, not a
   * continuation button, so this renders only when a route asks for it.
   * SHP-6 in GAPS-SHAPES.md names both sides.
   */
  onLoadMore?: () => void;
  /** The continuation label. */
  loadMoreLabel?: string;
  /** Nothing left to load — the control is not drawn rather than disabled. */
  loadMoreExhausted?: boolean;
  /** The continuation is fetching. */
  loadingMore?: boolean;

  /** Loading, empty or error. The heading, tabs and toolbar stay drawn (law 4). */
  state?: ShapeState;
  /** Per-locale words. */
  copy?: Partial<ShapeStateCopy>;
  /** The one mango create, allowed only on the empty screen (ch27.21). */
  emptyAction?: React.ReactNode;
  /** The way back offered when a facet excluded everything (ch27.22). */
  noResultsAction?: React.ReactNode;
  /** The retry on a block failure. */
  errorAction?: React.ReactNode;
  /** How many placeholder rows the loading body draws. */
  loadingRows?: number;
}

/**
 * A collection screen, arranged.
 *
 * TEN STATES
 *  1. default        — heading, figures, tabs, toolbar, rows, pager.
 *  2. hover          — the row wash, owned by `DataTable` / `List`.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — not drawn for a row: pressing one navigates, and the
 *                      acknowledgement is the destination (GAPS-COL3 LST-4).
 *  5. disabled       — does not apply to the screen. A reader who may not act
 *                      is passed no action, which is ch24.6's rule.
 *  6. loading        — the same body, unfilled, at the same row heights.
 *  7. empty          — ch27.21's register with the one mango create.
 *  8. error          — ruling 06's block failure inside the panel.
 *  9. selected       — row selection, owned by `DataTable`.
 * 10. read-only      — a collection with no actions passed. Nothing is dimmed.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — the toolbar wraps rather than being dropped
 *  (ch27.1: "The toolbar is never dropped — it condenses"), the table scrolls
 *  inside its own region, and `density` sets the measure. Column shedding at
 *  narrow widths is a call-site decision about which columns to pass, because
 *  only the call site knows which three survive.
 *
 * RTL — LTR only by client ruling. Logical properties throughout.
 */
function CollectionScreen<TRow>({
  className,
  door,
  density,
  rail,
  railLabel,
  eyebrow,
  heading,
  count,
  formatCount,
  countLabel,
  figures,
  tabs,
  tab,
  defaultTab,
  onTabChange,
  tabsLabel,
  searchable = true,
  searchValue,
  onSearchChange,
  onSearchClear,
  searchLabel = "Search this collection",
  searchPlaceholder = "Search",
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
  period,
  views,
  view,
  onViewChange,
  viewLabel = "View",
  viewSwitch,
  actions,
  toolbarActions,
  maxActions,
  onToolbarCreate,
  toolbarCreate = true,
  toolbarCreateLabel,
  onCreate,
  createLabel,
  band,
  rows,
  getRowId,
  columns,
  renderRow,
  onRowSelect,
  getRowOpenLabel,
  recordColumnKey,
  bodyLabel,
  page,
  pageCount,
  onPageChange,
  onLoadMore,
  loadMoreLabel = "Load more",
  loadMoreExhausted = false,
  loadingMore = false,
  state = "ready",
  copy,
  emptyAction,
  noResultsAction,
  errorAction,
  loadingRows,
  ...props
}: CollectionScreenProps<TRow>) {
  /* The door sets the measure when a route has not overridden it — the same
     resolution `MainScreen` makes, made here too so that `data-density`, the
     heading step and the frame's own density cannot disagree with it. */
  const measure: ScreenDensity = density ?? (door === "portal" ? "calm" : "comfortable");

  const words = shapeCopy("collectionScreen", copy);

  /* ch27.22's whole distinction, computed rather than guessed: something is
     switched on, so the absence has a cause and a way back. */
  const filtered =
    (searchValue !== undefined && searchValue.length > 0) ||
    (filters !== undefined && filters.length > 0);

  const loading = state === "loading";

  const body =
    columns !== undefined ? (
      /* `onRowSelect` reaches the table as well as the list. It used to be
         forwarded on the `List` branch only, so every collection whose body
         is a TABLE — which is the default body, and therefore most main
         screens in the system — passed a handler that was never called and
         had no way at all to reach a record. `DataTable` draws it on the
         record cell; see its own `onRowSelect` note for why the cell and not
         the `<tr>`. */
      <DataTable<TRow>
        columns={columns}
        rows={rows}
        getRowId={getRowId}
        label={bodyLabel}
        page={page}
        pageCount={pageCount}
        onPageChange={onPageChange}
        loading={loading}
        loadingRows={loadingRows}
        onRowSelect={onRowSelect}
        getRowOpenLabel={getRowOpenLabel}
        recordColumnKey={recordColumnKey}
        rowClassName={undefined}
      />
    ) : renderRow !== undefined ? (
      <List
        rows={rows.map((row, index) => ({
          id: getRowId(row, index),
          ...renderRow(row, index),
        }))}
        label={bodyLabel}
        state={loading ? "loading" : "ready"}
        loadingLines={loadingRows}
        onRowSelect={
          onRowSelect === undefined
            ? undefined
            : (index) => {
                onRowSelect(rows[index], index);
              }
        }
      />
    ) : null;

  /* ch27.1 puts the pager inside the panel, after the rows. A continuation
     button takes the same slot when a route opts into one. */
  const continuation =
    onLoadMore === undefined || loadMoreExhausted || state !== "ready" ? null : (
      <ActionRow align="end">
        <Button variant="secondary" loading={loadingMore} onClick={onLoadMore}>
          {loadMoreLabel}
        </Button>
      </ActionRow>
    );

  const search = searchable ? (
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
    />
  ) : undefined;

  const filterNode =
    filters === undefined && filterControls === undefined ? undefined : (
      <FilterBar
        filters={filters}
        onRemove={onFilterRemove}
        onClear={onFiltersClear}
        clearLabel={filtersClearLabel}
        label={filtersLabel}
      >
        {filterControls}
      </FilterBar>
    );

  /* ZONE 3 — THE VIEW SWITCH, AND THE SORT THAT SHARES ITS PLACE.
     `ViewSwitch` draws nothing below two options, so a collection with one
     body reaches this with `views` set and still gets no pill — which is
     `/meetings`'s standing decision, now the component's rather than a
     route's. `view` is passed straight through and stored NOWHERE, which is
     the answer to D7-5 rather than a gap in it: the choice is remembered per
     person, by the application, because the kit owns no user and no store.

     Sort is not one of ch19's four toolbar slots. It sits where the view
     switcher sits, which ch27.13 already rules is the home of "the view
     switcher and the sub-tab picker" — level-3 controls inside the toolbar.
     SHP-5 in GAPS-SHAPES.md. The VIEW comes last of the three, nearest the
     actions, because that is where CH19 and CH27.24 both draw it. */
  const viewNode =
    views === undefined || view === undefined ? null : (
      <ViewSwitch views={views} value={view} onValueChange={onViewChange} label={viewLabel} />
    );

  const switcher =
    sortOptions === undefined && viewNode === null && viewSwitch === undefined ? undefined : (
      <span className="flex flex-wrap items-center gap-3">
        {sortOptions === undefined ? null : (
          <SortControl
            options={sortOptions}
            value={sortValue}
            onValueChange={onSortChange}
            direction={sortDirection}
            onDirectionChange={onSortDirectionChange}
            label={sortLabel}
          />
        )}
        {viewNode}
        {viewSwitch}
      </span>
    );

  /* ZONE 4 — THE PANEL'S OWN PILLS, THEN THE CHARCOAL `+`.

     The client's item 3 in one expression: the create is drawn unless a route
     says otherwise. `toolbarCreate={false}` is the "unless specifically
     specified" they granted; a collection with no create handler at all needs
     no flag, because there is nothing to call.

     CHARCOAL, NOT MANGO — `variant="inverse"`. `SHELL.md`'s pair rule, and
     the reason this cannot put a second mango on any screen. The glyph and
     never the word, which is the same rule the header's `+` obeys. */
  const toolbarCreateHandler = onToolbarCreate ?? onCreate;

  const toolbarPlus =
    !toolbarCreate || toolbarCreateHandler === undefined ? null : (
      <Button
        variant="inverse"
        size="icon"
        /* The glyph-only rule makes a name mandatory. It falls through to the
           header's own wording, then to `MainScreen`'s default, so the two
           `+` buttons on one screen never announce themselves differently. */
        aria-label={toolbarCreateLabel ?? createLabel ?? "Add a record"}
        onClick={toolbarCreateHandler}
      >
        <Plus aria-hidden="true" />
      </Button>
    );

  const toolbarActionGroup =
    toolbarActions === undefined && toolbarPlus === null ? undefined : (
      <React.Fragment>
        {toolbarActions}
        {toolbarPlus}
      </React.Fragment>
    );

  /* THE `+` IS NOT ONE OF THE THREE ACTIONS THE KIT COUNTS. CH27.13's rule is
     "the 4th+ action collapses under a '···'", and `CollectionFrame` counts
     children to enforce it. The create is the pinned glyph AFTER the actions,
     not one of them — CH19 draws `Export`, `Group` and the `+` and calls two
     of those three actions — so its seat is added to the allowance rather
     than taken out of it. Without this, a collection with three paper pills
     would fold its create button into an overflow menu, which is the one
     place the client's "at least i need to have the + button" would fail. */
  const frameMaxActions =
    toolbarPlus === null ? maxActions : (maxActions ?? DEFAULT_MAX_ACTIONS) + 1;

  /* THE EYEBROW IS `SCOPE · N RECORDS`, AND THE COUNT IS THE SAME NUMBER IT
     ALWAYS WAS. `SHELL.md` puts the count in the eyebrow on a main screen,
     not in a chip beside the heading, so `count` and `countLabel` are joined
     here rather than handed to `CollectionFrame`. Two things are unchanged
     from the `Badge` this replaces: a zero renders NOTHING ("counts render
     empty when zero, never '0'"), and a request still in flight shows no
     count at all rather than a stale one. */
  const countText =
    count === undefined || count === 0 || loading
      ? undefined
      : formatCount !== undefined
        ? formatCount(count)
        : countLabel === undefined
          ? String(count)
          : `${count} ${countLabel}`;

  const bandEyebrow =
    eyebrow === undefined && countText === undefined ? undefined : eyebrow ===
      undefined ? (
      countText
    ) : countText === undefined ? (
      eyebrow
    ) : (
      <React.Fragment>
        {eyebrow}
        {" · "}
        {countText}
      </React.Fragment>
    );

  return (
    <MainScreen
      data-slot="collection-screen"
      data-density={measure}
      className={className}
      door={door}
      density={measure}
      rail={rail}
      railLabel={railLabel}
      eyebrow={bandEyebrow}
      title={heading}
      /* THE HEADER BAND'S PAPER PILLS, THEN THE ONE MANGO. The create is
         `onCreate` and `MainScreen` draws it as a glyph; nothing labelled
         `New …` may be smuggled in through `actions`. */
      actions={actions}
      onCreate={onCreate}
      createLabel={createLabel}
      /* THE STRIP LIES BARE ON THE BODY PANE. It arrives as a node because
         this shape has always taken one, so keeping it bare is the call
         site's — `StatStrip surface="bare"`, which is its own default
         nowhere and the reason the three routes carrying a strip say it. */
      figureStrip={figures}
      tabs={tabs}
      tab={tab}
      defaultTab={defaultTab}
      onTabChange={onTabChange}
      tabsLabel={tabsLabel}
      band={band}
      search={search}
      filters={filterNode}
      period={period}
      viewSwitch={switcher}
      toolbarActions={toolbarActionGroup}
      maxActions={frameMaxActions}
      state={state}
      /* ch27.6 — the unfilled body is the SAME body, so nothing jumps when
         the data arrives. Never a centred spinner. */
      loadingBody={body}
      loadingLabel={words.loadingLabel}
      emptyBody={
        <ShapeStateBody
          shape="collectionScreen"
          state="empty"
          filtered={filtered}
          copy={copy}
          action={filtered ? noResultsAction : emptyAction}
        />
      }
      errorBody={
        <ShapeStateBody
          shape="collectionScreen"
          state="error"
          copy={copy}
          action={errorAction}
        />
      }
      body={
        <div className="flex min-w-0 flex-col gap-6">
          {body}
          {continuation}
        </div>
      }
      {...props}
    />
  );
}

CollectionScreen.displayName = "CollectionScreen";

export { CollectionScreen };
