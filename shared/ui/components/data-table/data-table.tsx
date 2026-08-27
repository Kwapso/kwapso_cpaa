/* ============================================================================
   DataTable — the real table: sort, select, sticky header, row hover,
   pagination, virtualisation.

   DESIGN SOURCE
   Nothing new is drawn here. Every mark on the screen already exists as a
   primitive and this file only assembles them:

     `Table` / `TableHeader` / `TableBody` / `TableRow` / `TableHead` /
     `TableCell` / `TableCaption`   — the kit's `.kw-matrix` (f3.css), the
                                      56 row, the hairlines, the row wash
     `Checkbox`                     — chapter 10's mark, including the mixed bar
     `Pagination*`                  — the page strip
     `SortControl`                  — the key-and-direction pair
     `Skeleton`                     — the loading rows
     `Button` / `buttonVariants`    — every control, including the header sorter
     `useVirtualRows`               — which rows exist in the DOM
     kwapso-ui.css `.kw-empty`      — the centred empty register
     kwapso-patterns.css `.kw-register` (CH21) — the error register

   If a class in this file draws a cell, a rule, a fill or a radius that a
   primitive already draws, that is a bug in this file.

   THE LAW THIS FILE OBEYS
   · THE ROW IS 56 AT EVERY WIDTH. `TableRow` sets it from
     `--control-height-row` and this file never overrides it. There is no
     dense DataTable, because ruling 28 names one number for a table row.
   · THE MOBILE ANSWER IS SCROLL, NOT RESTACK, AND NOT COLUMN-DROPPING.
     Inherited verbatim from `table.tsx`, which argues it at length: a card
     stack breaks the one thing a table is for (reading a column down), and a
     table that hides a column at a width has changed WHAT IT SAYS rather than
     how it looks. So this file offers no `hideBelow` on a column. What it
     DOES offer at mobile is a second way IN to the same sort state — see
     `showSortControl`.
   · SORT IS ONE STATE WITH TWO DOORS. The header cell's button and the
     `SortControl` above the table drive the same `sortKey` / `sortDirection`.
     Two controls that disagreed about the order of the same rows would be a
     worse bug than either being absent.
   · SELECTION IS A `Checkbox`, AND THE HEADER ONE GOES MIXED. Chapter 10
     draws "inverse fill + light bar" for the mixed state and `Checkbox`
     already carries it; `checked="indeterminate"` is passed, never faked.
   · A STICKY HEADER MUST BE OPAQUE, AND IT MUST STICK TO SOMETHING. It sticks
     to the element this file gives the `maxHeight` to, which is also the
     element `useVirtualRows` scrolls. `TableHeader sticky` takes
     `--background`; a table dropped on a card passes `headerClassName="bg-card"`,
     the surface swap `table.tsx` says the call site owns (GAPS-D TBL-2).
   · Focus is ONE global rule (tokens.css §8). Nothing here rings, nothing
     here writes `outline`, and the scroll shell carries `scroll-p-1` so a
     ring on a control in an off-screen column is scrolled into view whole.
   · Disabled is a fill and an ink. `TableRow disabled` already is one.
   · Every user-facing string is a prop with a default, including the ones
     only a screen reader hears.
   · No product vocabulary (commission §11). Rows, columns, keys, pages.

   WHY THE SCROLL SHELL IS THIS FILE'S AND NOT `Table`'S
   `Table` renders its own container with `overflow-x: auto`, which is right
   for a table that scrolls the page vertically. A table with a STICKY HEADER
   or a VIRTUAL WINDOW needs a bounded, vertically scrolling box, and it needs
   a ref onto it — `Table`'s `containerProps` is `ComponentPropsWithoutRef`, so
   a ref cannot be passed through it. So this file wraps its own shell, takes
   both axes, and neutralises `Table`'s inner overflow with
   `containerClassName="overflow-x-visible"`. One scroll container, which is
   the only arrangement in which `position: sticky` resolves against the box
   the reader is actually scrolling. GAPS-COL2 DTB-1.

   RENDERING CONTEXT
   `"use client"`. Hooks (`useVirtualRows`, `useState`, `useMemo`,
   `useCallback`) and event handlers created during render.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { buttonVariants } from "../button/button";
import { Checkbox } from "../checkbox/checkbox";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../pagination/pagination";
import { Skeleton } from "../skeleton/skeleton";
import { SortControl, type SortDirection } from "../sort-control/sort-control";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../table/table";
import {
  SPACER_ATTR,
  VIRTUALIZE_THRESHOLD,
  useVirtualRows,
} from "../use-virtual-rows/use-virtual-rows";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "../../foundations/icons";
import { CollectionRegister } from "../collection-frame/collection-frame";

export type { SortDirection };

/* ============================================================================
   A column
   ========================================================================= */

export interface DataTableColumn<TRow> {
  /**
   * Stable key. Also the sort key handed to `onSortChange`, so it is the
   * name the caller's own ordering already uses.
   */
  key: string;
  /** The column heading. A node, so a unit or a tooltip may ride along. */
  header: React.ReactNode;
  /** How one cell of this column is drawn. The value, not the cell chrome. */
  cell: (row: TRow, index: number) => React.ReactNode;
  /**
   * This column can order the table. Draws the header sorter and adds the
   * column to the `SortControl`'s options.
   */
  sortable?: boolean;
  /**
   * `end` for a column of numbers, so the digits line up on their units. The
   * heading moves with the values, because a heading over the wrong edge of
   * its own column is worse than no alignment at all.
   */
  align?: "start" | "end";
  /**
   * A width for this column, in rem. Undefined lets the browser measure, which
   * is right for text; a column of fixed-width marks (a status pill, a row
   * action) should say its measure so it does not grow with the widest cell.
   */
  width?: string;
  /** Extra classes on this column's `<th>`. */
  headClassName?: string;
  /** Extra classes on this column's `<td>`. */
  cellClassName?: string;
  /**
   * The heading a screen reader hears, when the visible one is a mark rather
   * than words — an actions column, an icon column. A column whose `header`
   * is a node with no text MUST set this or it is a nameless column.
   */
  headerLabel?: string;
}

/* ============================================================================
   The registers — both transcribed, both local
   ========================================================================= */

/* `.kw-empty` (kwapso-ui.css, the last block in the file): a centred column,
   `--space-2` between its lines, `--space-8` / `--space-6` inset, tertiary ink
   at the 14 step. Placed inside a full-width cell, because only this
   component knows the column count — which is exactly the division of labour
   `table.tsx` states in its own state 7. */
function EmptyRegister({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-slot="data-table-empty"
      /* Left-aligned -- 27.21, DEF-2. */
      className="flex flex-col items-start gap-2 px-6 py-[var(--space-8)] text-start text-sm text-ink-tertiary"
    >
      {children}
    </div>
  );
}

/* ============================================================================
   THE ERROR REGISTER IS THE SHARED ONE — `CollectionRegister`.

   CH21's `.kw-register` was declared LOCALLY in six files, byte-for-byte the
   same markup in every one of them, and one record could show two different
   copies of it at once (a `detail-view` rendering a `DescriptionList`). The
   values inside all six were corrected in place on 2026-08-23, so nothing
   drew wrongly; six chances to drift is the defect, and this is the follow-up
   GAPS-FIDELITY-DE L-2 wrote out. `variant="block"` IS `.kw-register` — the
   panel tone at the 24 radius, `--space-7` inset, left-aligned per 27.21 —
   and `tone="error"` is the 7px poppy dot CH21 puts on exactly one of its
   four registers.

   `.kw-empty` STAYS LOCAL, and that is not an oversight. It is a different
   kit object: one line of words at the 14 step in tertiary ink, not an
   eyebrow / title / body / action column. `CollectionRegister`'s `inline`
   variant carries `.kw-empty`'s box but not its step or its ink, so folding
   the two together would either shrink this register's words or hand every
   inline register a container ink its title would inherit. Logged rather
   than forced.
   ========================================================================= */

/* ----------------------------------------------------------------------------
   The header sorter.

   It wears `buttonVariants({ variant: "ghost", size: "sm" })` — the SAME skin
   `Button` draws, taken from the exported cva rather than re-written — plus
   the header cell's own type (`text-micro uppercase`, tertiary ink), which
   `TableHead` sets on the cell and a `<button>` inside it would otherwise
   reset. `-mx-3 px-3` cancels the cell's own 12 inset so the 32 hover pill
   reaches the cell's edges instead of floating inside them.

   `aria-sort` goes on the `<th>`, not here: it is a property of the column,
   and a screen reader reads it from the header cell.
   ------------------------------------------------------------------------- */
function HeaderSorter({
  active,
  direction,
  align,
  ascendingLabel,
  descendingLabel,
  unsortedLabel,
  onPress,
  children,
}: {
  active: boolean;
  direction: SortDirection;
  align: "start" | "end";
  ascendingLabel: string;
  descendingLabel: string;
  unsortedLabel: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const state = !active ? unsortedLabel : direction === "asc" ? ascendingLabel : descendingLabel;

  return (
    <button
      type="button"
      data-slot="data-table-sorter"
      data-active={active ? "" : undefined}
      onClick={onPress}
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "-mx-3 px-3",
        // The header's own type, restated because a `<button>` resets it.
        "text-micro uppercase font-[var(--font-weight-medium)]",
        active ? "text-foreground" : "text-ink-tertiary",
        align === "end" && "flex-row-reverse",
      )}
    >
      <span className="min-w-0 whitespace-nowrap">{children}</span>
      {/* The glyph is decoration; the state is announced by the words beside
          it and by `aria-sort` on the cell. Colour never carries it alone. */}
      <span aria-hidden="true" className="inline-flex">
        {!active ? <ChevronsUpDown /> : direction === "asc" ? <ArrowUp /> : <ArrowDown />}
      </span>
      {/* The column's NAME is already the visible text above; only the
          ORDER needs saying in words, because the glyph must not carry it
          alone (ruling 26). `aria-sort` on the cell says it a second way. */}
      <span className="sr-only">{state}</span>
    </button>
  );
}

/* ----------------------------------------------------------------------------
   The page strip's numbers.

   Which numbers to show is arithmetic, not design: the first page, the last
   page, `siblingCount` either side of the current one, and an ellipsis where
   a run is elided. Returned as a list of numbers and `null`s so the caller
   renders `PaginationEllipsis` for the holes.
   ------------------------------------------------------------------------- */
function pageWindow(page: number, pageCount: number, siblingCount: number): Array<number | null> {
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

/* ============================================================================
   DataTable
   ========================================================================= */

export interface DataTableProps<TRow>
  extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  /** The columns, in the order they should read. */
  columns: Array<DataTableColumn<TRow>>;
  /** The rows for the page being shown. This component never paginates data itself. */
  rows: TRow[];
  /**
   * A stable id per row — the React key, and the value selection is kept in.
   * Required rather than defaulted to the index, because an index changes when
   * the table is re-sorted and a selection kept by index then follows the
   * position instead of the record.
   */
  getRowId: (row: TRow, index: number) => string;

  /* ---- sort --------------------------------------------------------------- */
  /** Controlled sort key. One of the columns' `key`s, or undefined for unsorted. */
  sortKey?: string;
  /** Uncontrolled starting key. */
  defaultSortKey?: string;
  /** Controlled direction. */
  sortDirection?: SortDirection;
  /** Uncontrolled starting direction. */
  defaultSortDirection?: SortDirection;
  /**
   * The order changed. Called with the new key and direction together, never
   * separately: a caller that received two calls would fetch twice and show
   * whichever answer landed last.
   */
  onSortChange?: (key: string, direction: SortDirection) => void;
  /**
   * Draw a `SortControl` above the table as a second door into the same sort
   * state. Default `true`, and it is the mobile answer: a header cell that has
   * scrolled off the inline axis cannot be pressed, and the table's own ruling
   * forbids restacking to reach it. It is `sm:hidden` by default — see
   * `sortControlAlways`.
   */
  showSortControl?: boolean;
  /** Keep the `SortControl` at every width, not only below 40rem. */
  sortControlAlways?: boolean;

  /* ---- selection ---------------------------------------------------------- */
  /** Draw the leading checkbox column and the select-all in the header. */
  selectable?: boolean;
  /** Controlled selection, as row ids. */
  selectedIds?: readonly string[];
  /** Uncontrolled starting selection. */
  defaultSelectedIds?: readonly string[];
  /** The selection changed. Called with the whole new set of ids. */
  onSelectionChange?: (ids: string[]) => void;
  /** A row that may not be chosen — one already committed, one the reader may not touch. */
  isRowSelectable?: (row: TRow, index: number) => boolean;

  /* ---- opening a record ---------------------------------------------------
     THE RULE IS THE ARTIFACT'S, AND IT IS ONE RULE. Chapter 26 §3, the
     list/collection page dev note, verbatim: "A row's name is always the
     first, widest column and always clickable to open the detail page or a
     quick-view." So the press target is the NAME CELL, not the `<tr>`.

     That single sentence answers the three things a pressable row usually
     has to argue about, which is why it is followed rather than improved on:

       · KEYBOARD. The name becomes a real `<button>`. It is focusable
         because it is a button, Enter and Space work because it is a button,
         and it lands in the tab order in reading position. Nothing here sets
         `role`, `tabIndex` or a key handler. Chapter 06 requires exactly
         this — "nothing interactive may be built from a non-focusable
         element … real buttons, inputs and links, or an element with a role
         and a tabindex" — and a `<tr onClick>` would have broken it.

       · NESTED CONTROLS. A row that opens a record and a row carrying a
         checkbox, a menu and inline controls do not fight, because the open
         target never covers them: it is one cell wide. There is no
         `stopPropagation`, no "the row opens except on a control" exception,
         and therefore no per-screen special case. The artifact rules nothing
         on nested controls (checked: no click-target, hit-area or
         propagation guidance anywhere in the document) — it does not need
         to, because confining the target removes the collision instead of
         adjudicating it.

       · THE ROW'S OWN STATES ARE UNTOUCHED. `TableRow` already draws the
         hover wash (`--accent`) and the chosen wash (`--surface-selected`,
         override 44) and this file adds neither. `--surface-selected` was
         read and does NOT apply here: it is the CHOSEN-record paper, the one
         the checkbox sets, and a row that can be opened is not thereby
         chosen. Painting it on press or hover would make "openable" and
         "ticked" the same colour and tell the reader nothing — the same
         argument `table.tsx` already makes for why selected cannot take
         `--accent`.

     Chapter 17 and 27.1 contradict each other here and neither is followed:
     17 draws an inert row whose only live things are the checkbox and an
     unexplained pinned arrow, 27.1 makes the whole row `onClick → toggle`
     so that clicking anywhere SELECTS. The chapter 26 dev note is the only
     place in the document that rules on opening a record from a row, so it
     wins. Logged in KWAPSO-SPEC.md register row 58.
     ---------------------------------------------------------------------- */
  /**
   * Open the record behind a row. Draws the first column's cell as a button.
   * Omit it — do not pass a no-op — for a collection with no record behind a
   * row; a table that passes nothing draws exactly what it drew before.
   */
  onRowSelect?: (row: TRow, index: number) => void;
  /**
   * The open button's accessible name. The visible name cell is often a node
   * — a pill, an avatar and a name — and a button whose only name is
   * assembled from that is read badly. Falls back to the cell's own text.
   */
  getRowOpenLabel?: (row: TRow, index: number) => string;
  /**
   * Which column carries the record name, by `key`. Defaults to the first
   * column, which is chapter 17's own rule ("first column is always the
   * record name") and chapter 26's ("the first, widest column"). It exists
   * for the one collection whose leading column is a mark rather than a name.
   */
  recordColumnKey?: string;

  /* ---- row state ---------------------------------------------------------- */
  /** A row that cannot be acted on. `TableRow disabled` — a fill and an ink. */
  isRowDisabled?: (row: TRow, index: number) => boolean;
  /** Extra classes per row, for a call site that marks its own rows. */
  rowClassName?: (row: TRow, index: number) => string | undefined;

  /* ---- the frame ---------------------------------------------------------- */
  /** Pin the header. Needs `maxHeight` to mean anything — see the breakpoint block. */
  stickyHeader?: boolean;
  /**
   * Bound the table's height so it scrolls inside itself. rem only. Undefined
   * lets the page scroll, which is what most tables in an application want.
   */
  maxHeight?: string;
  /** Extra classes on the sticky header band — `bg-card` for a table on a card. */
  headerClassName?: string;
  /**
   * A width below which the table overflows and scrolls rather than crushing
   * its columns. Passed straight to `Table`, which imposes none of its own
   * because the kit calls its specimen's `min-width` "specimen chrome only".
   */
  minWidth?: string;
  /** The table's own name, below the data. `TableCaption` draws it. */
  caption?: React.ReactNode;
  /** The table's accessible name, when there is no visible caption. */
  label?: string;

  /* ---- pagination --------------------------------------------------------- */
  /** The page being shown, 1-based. Without `pageCount` no strip is drawn. */
  page?: number;
  /** How many pages there are. `1` or fewer draws no strip: a single page is not a choice. */
  pageCount?: number;
  /** A page was chosen. */
  onPageChange?: (page: number) => void;
  /** How many numbers either side of the current one. */
  siblingCount?: number;
  /** Draw no page strip even when `pageCount` is greater than one. */
  hidePagination?: boolean;

  /* ---- virtualisation ----------------------------------------------------- */
  /**
   * Force the window on or off. Left undefined, `rows.length >
   * virtualizeThreshold` decides, which is `use-virtual-rows`'s own rule.
   * `false` is the escape hatch for print and for find-in-page.
   */
  virtualize?: boolean;
  /** Where windowing starts. Defaults to the primitive's `VIRTUALIZE_THRESHOLD`. */
  virtualizeThreshold?: number;
  /**
   * One row's height in CSS pixels, for the window arithmetic only. It is a
   * measurement, never a design value, and it never reaches a class name —
   * the primitive measures a real row and corrects itself from the first
   * frame. Defaults to the kit's table row, 56.
   */
  rowHeight?: number;

  /* ---- the three states --------------------------------------------------- */
  /**
   * The rows have not arrived. Draws `Skeleton` cells in `loadingRows` rows
   * and KEEPS THE HEADER — replacing the whole table would take the columns
   * away and make the page jump when they return.
   */
  loading?: boolean;
  /** How many placeholder rows to draw while `loading`. */
  loadingRows?: number;
  /** The request failed. Draws CH21's register instead of the body. */
  error?: boolean;
  /** The register's eyebrow. Ruling 26: the poppy dot never speaks alone. */
  errorEyebrow?: string;
  /** The register's title line. */
  errorTitle?: string;
  /** The register's sentence. Says what happened. */
  errorBody?: React.ReactNode;
  /** The register's one next step — a `Button`, usually `variant="secondary"` (T21-3). */
  errorAction?: React.ReactNode;
  /** The words when the request succeeded and there is nothing in it. */
  emptyLabel?: string;
  /** A control under the empty words — "clear the filters", "add the first row". */
  emptyAction?: React.ReactNode;

  /* ---- CH17's bulk bar and foot row --------------------------------------
     Chapter 17's own strapline is "Selection, sort, bulk bar — live", and
     both objects below are the chapter's. All four are OPTIONAL and default
     to undefined, so no existing call site changes: a table that passes
     none of them draws exactly what it drew before. GAPS-FIDELITY-DE L-4
     and L-5. ------------------------------------------------------------ */

  /**
   * THE BULK BAR'S ACTIONS — chapter 17's `Stage`, `Assign`, `Export`.
   *
   * The bar appears only while something is selected AND one of these two
   * slots is filled. A PLACEMENT, not a drawing: the bar is drawn here
   * (charcoal, pill, `padding: 10px 12px 10px 22px`, `margin-top: 14px`),
   * the CONTROLS are the call site's, because chapter 17 draws them at the
   * standing 32-tall quiet height that `Button size="sm"` already ships and
   * a table may not decide what a selection can be done to.
   *
   * The bar's own hairline divider takes the flipped `--hair-strong` that
   * `.bg-surface-inverse` rebinds, which is the artifact's `--invhair2`.
   */
  bulkActions?: React.ReactNode;
  /**
   * THE ONE CONTROL AT THE BAR'S TRAILING END — chapter 17 draws `Open` in
   * mango. Separate from `bulkActions` because it is pinned to the far end
   * with `margin-inline-start: auto`, and because the chapter allows exactly
   * one of it: the bar's mango is the view's one mango ACTION (override 17).
   */
  bulkPrimaryAction?: React.ReactNode;

  /**
   * THE FOOT ROW'S READING-START FIGURE — chapter 17's `5 of 478 rows`.
   * Drawn `padding: 14px 18px; font-size: 12.5px; color: var(--fg3)` as the
   * last row inside the rows box, under the last row's hairline. A node, not
   * a number: the chapter's own figure is a sentence with two numbers in it
   * and only the caller knows the total behind the page.
   */
  footSummary?: React.ReactNode;
  /**
   * THE FOOT ROW'S TRAILING FIGURE — chapter 17's `Total tickets 12`,
   * tabular, pushed to the inline end of the same row. A column total is the
   * caller's arithmetic; this component never sums a column.
   */
  footTotal?: React.ReactNode;

  /* ---- strings ------------------------------------------------------------ */
  /** The select-all checkbox's accessible name. */
  selectAllLabel?: string;
  /** One row's checkbox name. Given the row, so it can name the record. */
  getRowSelectLabel?: (row: TRow, index: number) => string;
  /** The `SortControl`'s own name. */
  sortLabel?: string;
  /** Announced for an ascending column, and as the direction control's state. */
  ascendingLabel?: string;
  /** Announced for a descending column. */
  descendingLabel?: string;
  /** Announced for a sortable column that is not the current one. */
  unsortedLabel?: string;
  /** The page strip's landmark name. */
  paginationLabel?: string;
  /** The previous-page control's label. */
  previousLabel?: string;
  /** The next-page control's label. */
  nextLabel?: string;
  /** What a screen reader hears where page numbers are elided. */
  ellipsisLabel?: string;
  /**
   * Announced as the count of chosen rows. Given the number, returns the
   * sentence.
   *
   * IT NAMES THE BULK BAR TOO, and the two behave differently on purpose.
   * The standalone live-region sentence is still drawn only when this prop is
   * SUPPLIED — adding a default would have made a sentence appear over every
   * selectable table already shipped. The bar cannot do that, because a bar
   * with no count is not the chapter's object, so it falls back to the
   * artifact's own wording, `{{ selCount }} selected`.
   */
  formatSelectedCount?: (count: number) => string;
  /**
   * How a page number is printed. Defaults to the runtime's own numbering
   * system through `Intl`, so an Arabic, Urdu or Persian locale gets its own
   * digits without a fork. A prop, because a locale that groups or pads
   * differently cannot be expressed by a default.
   */
  formatPage?: (page: number) => string;
}

/**
 * The system's table.
 *
 * TEN STATES
 *  1. default        — the header band on `--hair-strong`, 56 rows on
 *                      `--border`, the page strip under it. Nothing drawn
 *                      here that a primitive does not draw.
 *  2. hover          — `bg-accent` on the row, from `TableRow`. The kit's
 *                      neutral wash, never mango, never an opacity. The
 *                      header sorter takes `Button variant="ghost"`'s own
 *                      `--accent`, which is the same wash — correct, because
 *                      both are "the thing under the pointer".
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the control's own radius. This file adds none and
 *                      hides none: the scroll shell is `overflow-auto` and
 *                      never `hidden`, and it carries `scroll-p-1` (4) —
 *                      more than the ring's 2 offset plus 2 width — so
 *                      tabbing to a control in an off-screen column brings it
 *                      into view ring and all. A sticky header is
 *                      `position: sticky`, which paints in place without
 *                      clipping, so a ring on a pinned sorter is whole.
 *  4. active/pressed — the controls': the sorter takes `Button`'s 1px nudge,
 *                      the page links take theirs. A ROW is not pressed — a
 *                      table row is not a button (`table.tsx` state 4), and a
 *                      row that navigates puts a control in its first cell.
 *  5. disabled       — per row, via `isRowDisabled`: `TableRow disabled`,
 *                      which is `--btn-disabled-fill` / `--btn-disabled-label`
 *                      with the hover dropped, plus `aria-disabled`. Its
 *                      checkbox is disabled with it. A fill and an ink; no
 *                      opacity is written anywhere in this file.
 *  6. loading        — `loading`: `Skeleton` cells in `loadingRows` rows, the
 *                      HEADER KEPT, `aria-busy` on the shell, the empty
 *                      register suppressed, and the page strip and the sort
 *                      controls frozen — re-sorting a list that is still
 *                      arriving asks the server twice and shows whichever
 *                      answer lands last (`sort-control.tsx`'s own reason).
 *  7. empty          — `.kw-empty`, the centred register, inside one
 *                      full-width cell, with the header still above it so the
 *                      reader can see what the table WOULD have shown. Never
 *                      a skeleton: a skeleton over an established emptiness is
 *                      a lie. `emptyAction` puts one next step under it.
 *  8. error          — `.kw-register`, the left-aligned panel card: a 7 poppy
 *                      dot, its eyebrow, a title, a sentence and one next
 *                      step. Announced as an alert. It replaces the BODY, not
 *                      the frame, so the columns stay legible.
 *  9. selected       — per row: `TableRow selected` (`--surface-panel`, and
 *                      `data-state="selected"`), plus the row's `Checkbox`.
 *                      Both channels, always — colour alone must never carry
 *                      a meaning. The header checkbox goes
 *                      `checked="indeterminate"` on a partial selection, which
 *                      is chapter 10's drawn mixed state and not a faked one.
 *                      ACROSS THE TABLE it is CH17's BULK BAR: a charcoal
 *                      pill in normal flow 14 under the rows, holding the
 *                      count, a divider, the actions and one mango control.
 *                      It is drawn only when `bulkActions` or
 *                      `bulkPrimaryAction` is given, and it TAKES OVER the
 *                      live-region sentence rather than sitting beside it.
 *                      Nothing here floats: SHELL.md's law is that a
 *                      selection takes an existing slot, never the bottom of
 *                      the viewport.
 * 10. read-only      — the default and the only mode. This component displays
 *                      rows; an editable grid is a call site putting `Input`
 *                      inside `column.cell`, and every field it puts there
 *                      draws its own states.
 *
 * THREE BREAKPOINTS
 *  mobile   — the table SCROLLS ON THE INLINE AXIS inside its own shell. It
 *             does NOT restack into cards and it does NOT drop a column —
 *             both are argued in full in `table.tsx`'s header and in the law
 *             block above. What changes instead is the way IN to the sort:
 *             the `SortControl` above the table is visible below 40rem, so
 *             the order can be changed without reaching a header cell that
 *             has scrolled out of sight. The page strip WRAPS to a second
 *             line (`PaginationContent`'s own answer) rather than shrinking,
 *             and a caller who wants fewer numbers passes `siblingCount={0}`.
 *  tablet   — the same table, usually with nothing left to scroll. The
 *             `SortControl` is withdrawn at 40rem, because the header cells
 *             are now reachable and two visible doors into one state is
 *             clutter. `sortControlAlways` keeps it.
 *  desktop  — UNCHANGED. The row is 56 at all three widths, the type step is
 *             one step at all three, and the only variable is whether the
 *             shell has anything to scroll. A sticky header, where asked for,
 *             is sticky at every width: it is the columns staying over their
 *             data, which is not a wide-screen luxury.
 *
 * RTL — safe. `overflow` mirrors with the writing direction; every inset is
 * `px-*` / `-mx-*` (padding- and margin-inline); the sorter's glyph is
 * vertical (up/down) and needs no mirroring; the page strip's own chevrons
 * are `pagination.tsx`'s business and it mirrors them itself. No `left`,
 * `right`, `pl-*` or `pr-*` appears in this file.
 */
function DataTableInner<TRow>(
  {
    className,
    columns,
    rows,
    getRowId,
    sortKey,
    defaultSortKey,
    sortDirection,
    defaultSortDirection = "asc",
    onSortChange,
    showSortControl = true,
    sortControlAlways = false,
    selectable = false,
    selectedIds,
    defaultSelectedIds,
    onSelectionChange,
    isRowSelectable,
    onRowSelect,
    getRowOpenLabel,
    recordColumnKey,
    isRowDisabled,
    rowClassName,
    stickyHeader = false,
    maxHeight,
    headerClassName,
    minWidth,
    caption,
    label,
    page,
    pageCount,
    onPageChange,
    siblingCount = 1,
    hidePagination = false,
    virtualize,
    virtualizeThreshold = VIRTUALIZE_THRESHOLD,
    rowHeight = 56,
    loading = false,
    loadingRows = 6,
    error = false,
    errorEyebrow = "Load failed",
    errorTitle = "These rows could not be loaded",
    errorBody,
    errorAction,
    emptyLabel = "Nothing to show yet",
    emptyAction,
    bulkActions,
    bulkPrimaryAction,
    footSummary,
    footTotal,
    selectAllLabel = "Select every row",
    getRowSelectLabel,
    sortLabel = "Order by",
    ascendingLabel = "Ascending",
    descendingLabel = "Descending",
    unsortedLabel = "Not ordered by this column",
    paginationLabel = "Pages",
    previousLabel = "Previous",
    nextLabel = "Next",
    ellipsisLabel = "More pages",
    formatSelectedCount,
    formatPage,
    style,
    ...props
  }: DataTableProps<TRow>,
  ref: React.ForwardedRef<HTMLDivElement>,
) {
  /* --- sort: one state, two doors ---------------------------------------- */
  const [ownKey, setOwnKey] = React.useState<string | undefined>(defaultSortKey);
  const [ownDirection, setOwnDirection] = React.useState<SortDirection>(defaultSortDirection);
  const activeKey = sortKey ?? ownKey;
  const activeDirection = sortDirection ?? ownDirection;

  const applySort = React.useCallback(
    (key: string, direction: SortDirection) => {
      if (sortKey === undefined) setOwnKey(key);
      if (sortDirection === undefined) setOwnDirection(direction);
      onSortChange?.(key, direction);
    },
    [sortKey, sortDirection, onSortChange],
  );

  /* Pressing a column's own heading: a new column starts ascending, the
     current column turns round. That is the behaviour every table in every
     application already has, and doing anything else here would surprise. */
  const pressHeader = React.useCallback(
    (key: string) => {
      if (key === activeKey) {
        applySort(key, activeDirection === "asc" ? "desc" : "asc");
      } else {
        applySort(key, "asc");
      }
    },
    [activeKey, activeDirection, applySort],
  );

  const sortOptions = React.useMemo(
    () =>
      columns
        .filter((column) => column.sortable === true)
        .map((column) => ({
          value: column.key,
          label: column.headerLabel ?? (typeof column.header === "string" ? column.header : column.key),
        })),
    [columns],
  );

  /* --- selection --------------------------------------------------------- */
  const [ownSelection, setOwnSelection] = React.useState<readonly string[]>(
    defaultSelectedIds ?? [],
  );
  const selection = selectedIds ?? ownSelection;
  const selectionSet = React.useMemo(() => new Set(selection), [selection]);

  const applySelection = React.useCallback(
    (next: string[]) => {
      if (selectedIds === undefined) setOwnSelection(next);
      onSelectionChange?.(next);
    },
    [selectedIds, onSelectionChange],
  );

  const selectableRows = React.useMemo(
    () =>
      rows.filter((row, index) => (isRowSelectable ? isRowSelectable(row, index) : true)),
    [rows, isRowSelectable],
  );
  const selectableIds = React.useMemo(
    () => selectableRows.map((row, index) => getRowId(row, index)),
    [selectableRows, getRowId],
  );
  const chosenOnPage = selectableIds.filter((id) => selectionSet.has(id)).length;
  const allChosen = selectableIds.length > 0 && chosenOnPage === selectableIds.length;
  const someChosen = chosenOnPage > 0 && !allChosen;

  const toggleAll = React.useCallback(() => {
    if (allChosen) {
      const drop = new Set(selectableIds);
      applySelection(selection.filter((id) => !drop.has(id)));
    } else {
      const next = new Set(selection);
      for (const id of selectableIds) next.add(id);
      applySelection([...next]);
    }
  }, [allChosen, selectableIds, selection, applySelection]);

  const toggleRow = React.useCallback(
    (id: string) => {
      if (selectionSet.has(id)) {
        applySelection(selection.filter((other) => other !== id));
      } else {
        applySelection([...selection, id]);
      }
    },
    [selectionSet, selection, applySelection],
  );

  /* --- the window -------------------------------------------------------- */
  const virtual = useVirtualRows<HTMLDivElement>({
    count: rows.length,
    rowHeight,
    threshold: virtualizeThreshold,
    // A window needs something to scroll. Without a bounded height the shell
    // never scrolls, so windowing would render one screen and never move.
    enabled: maxHeight === undefined ? false : virtualize,
  });

  const columnCount = columns.length + (selectable ? 1 : 0);
  const busy = loading;
  const isEmpty = !busy && !error && rows.length === 0;

  /* Which cell opens the record. `undefined` — no `onRowSelect`, or a
     `recordColumnKey` naming a column that is not there — means no cell does,
     and the table draws exactly what it drew before this prop existed. A
     mistyped key falling back to the first column would put the open target
     on a status pill silently, so it deliberately draws nothing instead. */
  const openableColumnKey =
    onRowSelect === undefined
      ? undefined
      : recordColumnKey === undefined
        ? columns[0]?.key
        : columns.some((column) => column.key === recordColumnKey)
          ? recordColumnKey
          : undefined;

  /* The two spacer heights ride on the `<td>`, because a height on a `<tr>`
     is advisory in every engine. The rest of the props — `aria-hidden` and
     `SPACER_ATTR` — stay on the `<tr>` so a differ can find the row. */
  const { style: startSpacerStyle, ...startSpacerRest } = virtual.startSpacerProps;
  const { style: endSpacerStyle, ...endSpacerRest } = virtual.endSpacerProps;

  const renderedIndices = virtual.virtualized
    ? virtual.rows
    : rows.map((_row, index) => index);

  /* CH17'S BULK BAR — "Selection, sort, bulk bar — live", the chapter's own
     strapline. The bar exists only while something IS selected and the call
     site has given it something to do; a charcoal pill holding a count and
     no control would be a decoration. GAPS-FIDELITY-DE L-4. */
  const showBulkBar =
    !error && selection.length > 0 && (bulkActions !== undefined || bulkPrimaryAction !== undefined);

  /* The artifact's own wording — `{{ selCount }} selected`. Used ONLY by the
     bar; see the note on `formatSelectedCount` for why the standalone
     sentence keeps its "supplied or nothing" rule instead. */
  const bulkCount = (formatSelectedCount ?? ((n: number) => `${String(n)} selected`))(
    selection.length,
  );

  /* THE TWO SELECTION VOICES ARE ONE AT A TIME. The bar is itself a
     `role="status"` region carrying the same sentence, so drawing the
     standalone paragraph beside it would have a screen reader count the
     selection twice on every press. */
  const selectedSentence =
    !showBulkBar && formatSelectedCount !== undefined && selection.length > 0
      ? formatSelectedCount(selection.length)
      : undefined;

  const hasFoot = footSummary !== undefined || footTotal !== undefined;

  return (
    <div
      ref={ref}
      data-slot="data-table"
      className={cn("flex min-w-0 flex-col gap-4", className)}
      style={style}
      {...props}
    >
      {/* The second door into the sort state. Hidden at 40rem unless asked
          to stay, because two visible controls for one state is clutter. */}
      {showSortControl && sortOptions.length > 0 ? (
        <div className={cn("min-w-0", sortControlAlways ? "" : "sm:hidden")}>
          <SortControl
            options={sortOptions}
            value={activeKey}
            direction={activeDirection}
            label={sortLabel}
            ascendingLabel={ascendingLabel}
            descendingLabel={descendingLabel}
            loading={busy}
            onValueChange={(key) => {
              applySort(key, activeDirection);
            }}
            onDirectionChange={(direction) => {
              if (activeKey !== undefined) applySort(activeKey, direction);
            }}
          />
        </div>
      ) : null}

      {/* Counting the selection out loud. A polite region rather than an
          alert: it changes on every press and must not interrupt. */}
      {selectedSentence !== undefined ? (
        <p data-slot="data-table-selection" role="status" className="text-caption text-ink-secondary">
          {selectedSentence}
        </p>
      ) : null}

      {error ? (
        <CollectionRegister
          variant="block"
          tone="error"
          role="alert"
          eyebrow={errorEyebrow}
          title={errorTitle}
          body={errorBody}
          actions={errorAction}
        />
      ) : (
        /* THE ROWS GROUP — the scroll shell, then CH17's foot row, then
           CH17's bulk bar. It exists so those three carry the chapter's OWN
           measures instead of the root column's 16 gap: the foot is flush
           under the last row's hairline (it is the last row INSIDE the rows
           box) and the bar takes the drawn `margin-top: 14px`. */
        <div className="flex min-w-0 flex-col">
        {/* THE SCROLL SHELL. One box, both axes, and the element `sticky`
            resolves against — see the note in the file header. `scroll-p-1`
            keeps a focus ring inside it. */}
        <div
          ref={virtual.scrollRef}
          data-slot="data-table-scroll"
          aria-busy={busy || undefined}
          className="relative w-full overflow-auto scroll-p-1"
          style={maxHeight === undefined ? undefined : { maxHeight }}
        >
          <Table
            minWidth={minWidth}
            aria-label={label}
            /* `Table` draws its own `overflow-x-auto` container, which would
               become a second scroll box and steal `sticky` from the shell
               above. Neutralised, not removed: the container still supplies
               the `relative` positioning context. */
            containerClassName="overflow-x-visible"
          >
            {caption !== undefined && caption !== null ? (
              <TableCaption>{caption}</TableCaption>
            ) : null}

            <TableHeader sticky={stickyHeader} className={headerClassName}>
              {/* A header row is not a record, so it does not take the row
                  wash. `TableRow` applies it to every row it draws, so it is
                  cancelled here — the one place that knows this row is a
                  heading. `table.tsx`'s own `TableHeader` state 2 says the
                  same thing in words. */}
              <TableRow className="hover:bg-transparent">
                {selectable ? (
                  <TableHead>
                    <Checkbox
                      checked={allChosen ? true : someChosen ? "indeterminate" : false}
                      disabled={busy || selectableIds.length === 0}
                      aria-label={selectAllLabel}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                ) : null}

                {columns.map((column) => {
                  const active = column.key === activeKey;
                  const align = column.align ?? "start";
                  return (
                    <TableHead
                      key={column.key}
                      scope="col"
                      aria-sort={
                        column.sortable !== true
                          ? undefined
                          : active
                            ? activeDirection === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                      }
                      style={column.width === undefined ? undefined : { width: column.width }}
                      className={cn(align === "end" && "text-end", column.headClassName)}
                    >
                      {column.sortable === true ? (
                        <HeaderSorter
                          active={active}
                          direction={activeDirection}
                          align={align}
                          ascendingLabel={ascendingLabel}
                          descendingLabel={descendingLabel}
                          unsortedLabel={unsortedLabel}
                          onPress={() => {
                            if (!busy) pressHeader(column.key);
                          }}
                        >
                          {column.header}
                        </HeaderSorter>
                      ) : column.headerLabel !== undefined ? (
                        <React.Fragment>
                          <span aria-hidden="true">{column.header}</span>
                          <span className="sr-only">{column.headerLabel}</span>
                        </React.Fragment>
                      ) : (
                        column.header
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>

            <TableBody>
              {busy ? (
                Array.from({ length: Math.max(loadingRows, 0) }, (_, rowIndex) => (
                  <TableRow key={`placeholder-${rowIndex}`}>
                    {selectable ? (
                      <TableCell>
                        <Skeleton className="size-[1.375rem] rounded-select" announce={false} />
                      </TableCell>
                    ) : null}
                    {columns.map((column, cellIndex) => (
                      <TableCell key={column.key} className={column.cellClassName}>
                        <Skeleton
                          className={cellIndex === 0 ? "w-2/3" : "w-1/2"}
                          announce={rowIndex === 0 && cellIndex === 0}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : isEmpty ? (
                <TableRow className="hover:bg-transparent">
                  {/* One full-width cell. `first:font-medium first:whitespace-nowrap`
                      is `TableCell`'s name-column treatment and is wrong for a
                      register, so both are cancelled here rather than in the
                      primitive. */}
                  <TableCell
                    colSpan={columnCount}
                    className="first:font-[var(--font-weight-light)] first:whitespace-normal"
                  >
                    <EmptyRegister>
                      <span role="status">{emptyLabel}</span>
                      {emptyAction}
                    </EmptyRegister>
                  </TableCell>
                </TableRow>
              ) : (
                <React.Fragment>
                  {virtual.virtualized ? (
                    <tr {...startSpacerRest}>
                      <td colSpan={columnCount} style={startSpacerStyle} />
                    </tr>
                  ) : null}

                  {renderedIndices.map((index) => {
                    const row = rows[index];
                    if (row === undefined) return null;
                    const id = getRowId(row, index);
                    const disabled = isRowDisabled ? isRowDisabled(row, index) : false;
                    const chooseable = isRowSelectable ? isRowSelectable(row, index) : true;
                    const chosen = selectionSet.has(id);

                    return (
                      <TableRow
                        key={id}
                        ref={index === virtual.startIndex ? virtual.measureRef : undefined}
                        selected={chosen}
                        disabled={disabled}
                        aria-posinset={index + 1}
                        aria-setsize={rows.length}
                        className={rowClassName?.(row, index)}
                      >
                        {selectable ? (
                          <TableCell>
                            <Checkbox
                              checked={chosen}
                              disabled={disabled || !chooseable}
                              aria-label={getRowSelectLabel?.(row, index)}
                              onCheckedChange={() => {
                                toggleRow(id);
                              }}
                            />
                          </TableCell>
                        ) : null}

                        {columns.map((column) => {
                          const value = column.cell(row, index);
                          /* The record cell, and only it, becomes the press
                             target — see the `onRowSelect` prop note. A
                             disabled row draws no button at all rather than a
                             dead one: `TableRow disabled` already says the
                             record cannot be acted on, and a focusable
                             control that refuses is worse than none. */
                          const opens = openableColumnKey === column.key && !disabled;
                          return (
                            <TableCell
                              key={column.key}
                              className={cn(
                                (column.align ?? "start") === "end" && "text-end tabular-nums",
                                // The button is the cell's whole box, so the
                                // cell's own inset would double it.
                                opens && "p-0",
                                column.cellClassName,
                              )}
                            >
                              {opens ? (
                                <button
                                  type="button"
                                  data-slot="data-table-open"
                                  aria-label={getRowOpenLabel?.(row, index)}
                                  onClick={() => {
                                    onRowSelect?.(row, index);
                                  }}
                                  className={cn(
                                    // A button that is a table cell: it must
                                    // fill the cell so the whole name is the
                                    // target, and inherit type so the name
                                    // column's medium weight survives. That
                                    // inheritance is the preflight's own
                                    // `button { font: inherit }`, NOT a
                                    // `[font:inherit]` utility: Tailwind emits
                                    // the arbitrary property AFTER the named
                                    // utilities in the bundle, where it
                                    // silently outranks any control's own
                                    // type step (the accordion/mode-toggle
                                    // bug). Measured identical live with it
                                    // gone — the preflight already does this
                                    // job.
                                    "flex h-full w-full items-center px-3 py-[var(--space-2h)]",
                                    "appearance-none border-0 bg-transparent",
                                    "cursor-pointer text-start text-inherit",
                                    /* The radius exists ONLY so the global
                                       focus ring has a shape to follow — the
                                       token layer's rule is "it follows the
                                       control's own radius" and a bare button
                                       would ring as a hard rectangle. `List`'s
                                       pressable row is the precedent and takes
                                       `--radius`, so this takes the same.
                                       (Chapter 06 says every ring is a pill;
                                       the built kit rings to the control's own
                                       radius and `List` already diverges the
                                       same way. Matched rather than re-argued
                                       — flagged, not silently split.) */
                                    "rounded-[var(--radius)]",
                                    /* CLIENT OVERRIDE, 2026-08-26 — READ BEFORE
                                       RE-ADDING AN UNDERLINE HERE.

                                       This cell used to carry
                                       `no-underline underline-offset-[0.1875rem]
                                       hover:underline` — the kit's own
                                       inline-pressable-text treatment, copied
                                       off `Button variant="link"`: "ink-
                                       coloured, no underline at rest, an
                                       underline on hover. NOT mango". That was
                                       a considered decision, not an oversight,
                                       and the reasoning against mango still
                                       stands (a mango name on every row would
                                       spend override 17's one action per
                                       screen many times over).

                                       The client compared two live screenshots
                                       and ruled against the underline
                                       specifically, verbatim: "i want that the
                                       navigation is like in the first
                                       screenshot (the whole row is marked as
                                       hover) not like in the second one (the
                                       title gets underlined)." This is a new
                                       ruling overriding the old one, not a bug
                                       fix — the underline was doing exactly
                                       what it was built to do.

                                       So the underline is gone and NOTHING
                                       replaces it on this button: the ROW
                                       already washes the whole row on hover —
                                       `table.tsx`'s `TableRow` carries
                                       `ROW_DEFAULT = "motion-row-hover
                                       hover:bg-accent"` underneath every cell
                                       in this row, unmodified — so removing
                                       the underline is the whole change. Two
                                       hover treatments on one row was already
                                       one too many before this ruling; it
                                       would still be one too many if this
                                       button grew a fill of its own now. */
                                    (column.align ?? "start") === "end" && "justify-end",
                                  )}
                                >
                                  {value}
                                </button>
                              ) : (
                                value
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}

                  {virtual.virtualized ? (
                    <tr {...endSpacerRest}>
                      <td colSpan={columnCount} style={endSpacerStyle} />
                    </tr>
                  ) : null}
                </React.Fragment>
              )}
            </TableBody>
          </Table>
        </div>

        {/* CH17'S FOOT ROW — `display: flex; align-items: center; gap: 14px;
            padding: 14px 18px; font-size: 12.5px; color: var(--fg3)`, inside
            the rows box, under the last row's hairline. The chapter draws
            `5 of 478 rows` at the reading start and `Total tickets 12`
            tabular at the trailing end. 12.5 lands on `text-xs`, which is
            the half-step rule `activity-feed` already writes down: the type
            ladder has no 12.5 rung and the kit's 12.5s take the 12.
            GAPS-FIDELITY-DE L-5. */}
        {hasFoot && !busy ? (
          <div
            data-slot="data-table-foot"
            className="flex min-w-0 flex-wrap items-center gap-[var(--space-3h)] px-[var(--space-4h)] py-[var(--space-3h)] text-xs text-ink-tertiary"
          >
            {footSummary !== undefined ? <span className="min-w-0">{footSummary}</span> : null}
            {footTotal !== undefined ? (
              /* `margin-inline-start: auto` — the chapter's own trailing
                 figure, direction-safe, and tabular because it is one. */
              <span className="ms-auto min-w-0 tabular-nums">{footTotal}</span>
            ) : null}
          </div>
        ) : null}

        {/* CH17'S BULK BAR. Drawn: `margin-top: 14px; display: flex;
            align-items: center; gap: 12px; flex-wrap: wrap; background:
            var(--inv); color: var(--invfg); border-radius: 999px; padding:
            10px 12px 10px 22px`, holding `{{ selCount }} selected` at 13.5 /
            500 tabular, a 1-wide `--invhair2` divider, the quiet actions,
            and the mango control at the far end.

            THE ONE FIGURE THAT IS NOT THE CHAPTER'S IS THE 22, AND IT IS
            SAID OUT LOUD: ruling 28's ladder is eleven 4px steps plus four
            2px half-steps (6, 10, 14, 18), and 22 is on neither. Override 41
            already set the precedent for exactly this case — a drawn inset
            off the ladder steps to its ladder neighbour — so the leading
            inset is `--space-5` (20). Every other figure here is drawn.

            IT REPLACES THE SELECTION SENTENCE, IT DOES NOT FLOAT. Nothing in
            this system rises off the bottom of the viewport: SHELL.md's rule
            is that a selection "takes the toolbar's exact slot and height",
            and CH17's own drawing puts this bar in normal flow 14 under the
            rows. `.bg-surface-inverse` rebinds `--hair`, `--hair-strong` and
            the descendants' `--focus` (tokens.css), so the divider and every
            ring inside the bar flip with the ground and no colour is written
            here. GAPS-FIDELITY-DE L-4. */}
        {showBulkBar ? (
          <div
            data-slot="data-table-bulk-bar"
            role="status"
            /* THE TWO INKS ARE REBOUND FOR THE SUBTREE, NOT WRITTEN ON THE
               CHILDREN. tokens.css already does exactly this on
               `.bg-surface-inverse` for `--hair`, `--hair-strong` and the
               descendants' `--focus`; it does NOT do it for the two text
               inks, so `Button variant="ghost"` — the kit's own quiet
               control, and what a caller reaches for here — printed
               `--ink-tertiary` (a charcoal grey) on a charcoal bar, and its
               hover went to `--foreground`, which is charcoal outright.
               Rebinding is the same mechanism and reaches every control a
               call site puts in the bar, instead of making each one know it
               is standing on ink. THE DURABLE FIX BELONGS IN tokens.css's
               `.bg-surface-inverse` BLOCK and is owed — logged in
               GAPS-KIT-DE.md; `tokens/tokens.css` is not this pass's to
               edit. Neither value is invented: `--ink-on-inverse-secondary`
               is the artifact's own `--invfg2` (override 13) and
               `--ink-on-inverse` is its `--invfg`. */
            style={
              {
                "--ink-tertiary": "var(--ink-on-inverse-secondary)",
                "--foreground": "var(--ink-on-inverse)",
              } as React.CSSProperties
            }
            className="mt-[var(--space-3h)] flex min-w-0 flex-wrap items-center gap-3 rounded-pill bg-surface-inverse py-[var(--space-2h)] ps-[var(--space-5)] pe-3 text-ink-on-inverse"
          >
            <span className="text-caption font-[var(--font-weight-medium)] tabular-nums">
              {bulkCount}
            </span>
            {bulkActions !== undefined ? (
              <React.Fragment>
                {/* The drawn `width: 1px; height: 20px; background:
                    var(--invhair2)`. `--hair-strong` IS `--invhair2` inside
                    a `.bg-surface-inverse` region. */}
                <span
                  aria-hidden="true"
                  className="h-5 w-px shrink-0 bg-[var(--hair-strong)]"
                />
                {bulkActions}
              </React.Fragment>
            ) : null}
            {bulkPrimaryAction !== undefined ? (
              <span className="ms-auto inline-flex min-w-0 items-center">{bulkPrimaryAction}</span>
            ) : null}
          </div>
        ) : null}
        </div>
      )}

      {/* A single page is not a choice, so no strip is drawn for it — the
          decision `pagination.tsx` says belongs to this component. */}
      {!hidePagination && !error && pageCount !== undefined && pageCount > 1 ? (
        <Pagination label={paginationLabel}>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                label={previousLabel}
                srLabel={previousLabel}
                disabled={busy || (page ?? 1) <= 1}
                href={onPageChange === undefined ? undefined : "#"}
                onClick={(event) => {
                  event.preventDefault();
                  if (!busy && (page ?? 1) > 1) onPageChange?.((page ?? 1) - 1);
                }}
              />
            </PaginationItem>

            {pageWindow(page ?? 1, pageCount, Math.max(siblingCount, 0)).map((entry, index) =>
              entry === null ? (
                <PaginationItem key={`gap-${index}`}>
                  <PaginationEllipsis label={ellipsisLabel} />
                </PaginationItem>
              ) : (
                <PaginationItem key={entry}>
                  <PaginationLink
                    isActive={entry === (page ?? 1)}
                    disabled={busy}
                    href={onPageChange === undefined ? undefined : "#"}
                    onClick={(event) => {
                      event.preventDefault();
                      if (!busy) onPageChange?.(entry);
                    }}
                  >
                    {(formatPage ?? plainNumber)(entry)}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}

            <PaginationItem>
              <PaginationNext
                label={nextLabel}
                srLabel={nextLabel}
                disabled={busy || (page ?? 1) >= pageCount}
                href={onPageChange === undefined ? undefined : "#"}
                onClick={(event) => {
                  event.preventDefault();
                  if (!busy && (page ?? 1) < pageCount) onPageChange?.((page ?? 1) + 1);
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </div>
  );
}

/* `forwardRef` cannot carry a type parameter through on its own, so the
   generic component is declared above and the ref-forwarding wrapper is cast
   once, here. The public type keeps `TRow`, which is what a call site needs. */
const DataTable = React.forwardRef(DataTableInner) as unknown as <TRow>(
  props: DataTableProps<TRow> & { ref?: React.ForwardedRef<HTMLDivElement> },
) => React.ReactElement | null;

(DataTable as unknown as { displayName: string }).displayName = "DataTable";

export { DataTable, SPACER_ATTR, VIRTUALIZE_THRESHOLD };
