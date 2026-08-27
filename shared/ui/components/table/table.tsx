/* ============================================================================
   Table — rows and columns of record data (16 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/_fragments/f3.css → `.kw-matrix`, the kit's own
   drawn table (chapter 07's state matrix). Every decision below is transcribed
   from it rather than taken from a shadcn default:
     · `border-collapse: collapse`, `width: 100%`, body type at `--text-body-s`.
     · `th` is a MICRO UPPERCASE eyebrow in tertiary ink at the 0.08em
       eyebrow tracking, aligned to the inline start, on a
       `--hair-strong` rule — the section-rule weight, because the header is a
       section boundary and not a same-tone split.
     · `td` sits on a `--hair` rule; `tr:last-child td` drops it.
     · `td:first-child` is `--weight-strong` and `white-space: nowrap` — the
       record's name column does not wrap.
     · `.kw-matrix-scroll { overflow-x: auto }` is the container, and the kit
       says in f3-gaps F3-3 that its `min-width` is "specimen chrome only —
       not kit law".
   design-mothership/specimens/kwapso-ui.css → `.kw-list__item:hover`, the
   neutral row wash, for the hover.
   motion/motion.css §7 → `.motion-row-hover`, `.motion-row-enter`,
   `.motion-row-exit`, `.motion-row-move`.

   THE LAW THIS FILE OBEYS
   · THE ROW IS 56. `--control-height-row`, fixed. Ruling 28 lists the control
     heights as "32 dense · 38 field inside a row · 40 control · 44 touch row"
     and then keeps 56 for this one thing. It does not shrink at mobile, it
     does not grow at desktop, and a dense table is not a variant this file
     offers, because the ruling names one number.
   · A table's rules are the legitimate hairline, drawn as INSET SHADOWS and
     never as `border` properties (review 1A · fix 2). `--hair` between rows,
     `--hair-strong` under the header and above the footer. Never a hairline
     on a button or a coloured pill inside a cell — those keep their own law.
   · Row hover is `--accent`, the kit's neutral wash. NEVER `--primary`:
     mango is a brand fill, and a hovered table would otherwise go mango row
     by row.
   · Disabled is a fill and an ink, never an opacity. On a row that is
     `--btn-disabled-fill` / `--btn-disabled-label`, and the hover is dropped
     so a dead row cannot look clickable.
   · Focus is ONE global rule (tokens.css §8). Nothing here sets a ring, and
     the sticky header and the scroll container are built so they cannot hide
     one — see the two notes at `Table` and `TableHeader`.
   · No px, no hex, no font size. `text-micro`, `text-sm` and `text-caption`
     are real utilities (tokens.css §10) and each sets size, leading and
     tracking together.

   THE MOBILE ANSWER, STATED
   The table SCROLLS ON THE INLINE AXIS INSIDE ITS OWN CONTAINER. It does not
   restack into cards.

   Why, in three parts. (a) It is the kit's own answer: f3.css meets exactly
   this problem with `.kw-matrix-scroll { overflow-x: auto }` and scrolls.
   (b) A stacked card form breaks the one thing a table is for — comparing the
   same field down a column. Once every row is its own card, the reader can no
   longer scan a column, and the component has quietly changed what it does at
   a width rather than how it looks. (c) The row is 56 by ruling; a card stack
   has no 56-tall row in it, so the restack would have to abandon a stated
   number.
   The scroll needs the table to be wider than the viewport to engage, and the
   kit calls its own `min-width` specimen chrome, so this file imposes none and
   exposes `minWidth` instead (GAPS-D TBL-1). The two structural nudges the kit
   DOES state are kept: header cells and the first body cell never wrap, which
   is what makes a narrow table overflow rather than crush its name column.

   RENDERING CONTEXT
   No `"use client"`. Every part forwards props and refs; the one piece of
   logic (the row's exclusive state) is a plain expression, not a hook. These
   render inside a Server Component unchanged.
   ========================================================================= */

import * as React from "react";

import { cn } from "../../lib/utils";

/* ============================================================================
   Table
   ========================================================================= */

export interface TableProps extends React.ComponentPropsWithoutRef<"table"> {
  /** Classes for the scroll container that wraps the table. */
  containerClassName?: string;
  /** Props for the scroll container — a ref onto the scrolling element, mostly. */
  containerProps?: Omit<React.ComponentPropsWithoutRef<"div">, "className">;
  /**
   * A width below which the table overflows its container and scrolls rather
   * than crushing its columns. Undefined by default: the kit calls the
   * `min-width` on its own drawn table "specimen chrome only — not kit law"
   * (design-mothership F3-3), so no number is invented here. A call site that
   * knows its column count passes one — e.g. `minWidth="42rem"`, which is
   * what the kit's own specimen uses. rem only.
   */
  minWidth?: string;
}

/**
 * The table, inside the container that scrolls it.
 *
 * `className` lands on the `<table>`, because that is what 16 call sites
 * already style; the container is reached through `containerClassName`.
 *
 * TEN STATES
 *  1. default        — 100% wide, collapsed cells, body type at 14/300.
 *  2. hover          — belongs to the row.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      The container scrolls rather than hiding: it sets
 *                      `overflow-x-auto` and never `overflow: hidden`, and it
 *                      carries `scroll-p-1` (0.25rem) — more than the ring's
 *                      2px offset plus 2px width — so tabbing to a control in
 *                      an off-screen column brings it into view ring and all.
 *                      Cell padding (`--space-3`, 12) and the 56 row height
 *                      leave that 4px reach inside the container on both axes,
 *                      so nothing clips.
 *  4. active/pressed — belongs to the row.
 *  5. disabled       — belongs to the row.
 *  6. loading        — does not apply to the table element. A table waiting on
 *                      its data renders `Skeleton` rows inside `TableBody`;
 *                      replacing the whole table would take the header away
 *                      and make the page jump when it returns.
 *  7. empty          — an empty `TableBody` renders an empty `<tbody>` and the
 *                      header stays. The empty REGISTER — the `.kw-empty`
 *                      illustration and its line of text — is a composition
 *                      (`data-table`), because only the composition knows the
 *                      column count a full-width empty cell would need.
 *  8. error          — does not apply. A table reports nothing; a failed fetch
 *                      is an `Alert` above it.
 *  9. selected       — belongs to the row.
 * 10. read-only      — always, for this primitive. An editable grid is
 *                      `data-table`'s, built from `Input` inside `TableCell`.
 *
 * THREE BREAKPOINTS
 *  mobile   — scrolls on the inline axis inside its own container. Stated in
 *             full in the file header; it does not restack into cards.
 *  tablet   — the same, and usually no longer scrolling.
 *  desktop  — the same. Nothing about the drawing changes at any width: the
 *             row is 56 at all three, the type step is one step at all three,
 *             and the only variable is whether the container has anything to
 *             scroll.
 *
 * RTL — safe. `overflow-x` mirrors with the writing direction, every cell
 * inset is `px-*` (padding-inline), and `text-start` is logical throughout.
 */
const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, containerClassName, containerProps, minWidth, style, ...props }, ref) => (
    <div
      data-slot="table-container"
      /* NOT `overflow-hidden`, and not `overflow-auto` on both axes by
         choice — `overflow-x: auto` alone already computes `overflow-y: auto`,
         which is what lets a sticky header work. Nothing here clips. */
      className={cn("relative w-full overflow-x-auto scroll-p-1", containerClassName)}
      {...containerProps}
    >
      <table
        ref={ref}
        data-slot="table"
        style={minWidth ? { minWidth, ...style } : style}
        className={cn(
          // `.kw-matrix`: collapsed, full width, one type step for the body.
          "w-full caption-bottom border-collapse text-sm",
          className,
        )}
        {...props}
      />
    </div>
  ),
);

Table.displayName = "Table";

/* ============================================================================
   TableHeader
   ========================================================================= */

export interface TableHeaderProps extends React.ComponentPropsWithoutRef<"thead"> {
  /**
   * Pin the header to the top of the scroll container. Off by default: a
   * sticky header only means anything inside a bounded, vertically scrolling
   * box, and most tables in these apps scroll the page instead.
   *
   * A sticky header must be opaque or the rows read straight through it. It
   * takes `--background`, the page paper. A table dropped on a card passes
   * `className="bg-card"` — a surface swap the call site knows and this file
   * cannot (GAPS-D TBL-2).
   */
  sticky?: boolean;
}

/**
 * The header band.
 *
 * TEN STATES
 *  1. default        — a row of eyebrow cells on the `--hair-strong` rule.
 *  2. hover          — does not apply. A header row is not a record and does
 *                      not take the row wash; only `TableHead sortable` (a
 *                      button inside the cell) responds to a pointer, and that
 *                      button is `Button`'s job, not this one's.
 *  3. focus-visible  — NOT here, and specifically NOT hidden here either: the
 *                      sticky header is `position: sticky`, which paints in
 *                      place without clipping, so a ring on a sort button in a
 *                      pinned header is fully visible. `z-10` keeps the header
 *                      above the rows; it does not hide anything inside it.
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply. A header is not a control.
 *  6. loading        — does not apply. The header is the part that must NOT
 *                      disappear while the body loads; that is the whole
 *                      reason the skeleton goes in `TableBody`.
 *  7. empty          — a header with no cells renders an empty row and the
 *                      rule under it. A table with no columns is a call-site
 *                      bug and is not papered over.
 *  8. error          — does not apply.
 *  9. selected       — does not apply. A select-all checkbox lives in a
 *                      `TableHead`, and it is `Checkbox` that draws selected.
 * 10. read-only      — always.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The header scrolls with the table on
 *  the inline axis, which is the only way the columns stay over their data.
 *
 * RTL — safe. `top-0` is on the block axis; nothing is placed by side.
 */
const TableHeader = React.forwardRef<HTMLTableSectionElement, TableHeaderProps>(
  ({ className, sticky = false, ...props }, ref) => (
    <thead
      ref={ref}
      data-slot="table-header"
      data-sticky={sticky ? "" : undefined}
      className={cn(sticky && "sticky top-0 z-10 bg-background", className)}
      {...props}
    />
  ),
);

TableHeader.displayName = "TableHeader";

/* ============================================================================
   TableBody
   ========================================================================= */

export interface TableBodyProps extends React.ComponentPropsWithoutRef<"tbody"> {}

/**
 * The records.
 *
 * Drops the rule under the final row (`.kw-matrix tr:last-child td`), so a
 * table does not end on a hairline separating it from nothing.
 *
 * TEN STATES — the row's block covers all ten; the body adds none.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED.
 *
 * RTL — safe.
 */
const TableBody = React.forwardRef<HTMLTableSectionElement, TableBodyProps>(
  ({ className, ...props }, ref) => (
    <tbody
      ref={ref}
      data-slot="table-body"
      /* The last row drops its rule: a hairline under the final row is a
         hairline under nothing. Targets the CELLS, because that is where the
         row's own rule is drawn — see `TableRow`. */
      className={cn("[&_tr:last-child>*]:shadow-none", className)}
      {...props}
    />
  ),
);

TableBody.displayName = "TableBody";

/* ============================================================================
   TableFooter
   ========================================================================= */

export interface TableFooterProps extends React.ComponentPropsWithoutRef<"tfoot"> {}

/**
 * The totals band.
 *
 * A section rule above it (`--hair-strong`, the same weight the header uses
 * below itself — a footer is the other end of the same section) and the kit's
 * one "bold". No fill: the kit draws no footer band, and inventing a tone for
 * it would put a fifth surface into a table that already has three
 * (GAPS-D TBL-3).
 *
 * TEN STATES — as `TableHeader`; a footer is a header at the other end and
 * responds to nothing.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED.
 *
 * RTL — safe. Numbers are `tabular-nums`, which is direction-neutral.
 */
const TableFooter = React.forwardRef<HTMLTableSectionElement, TableFooterProps>(
  ({ className, ...props }, ref) => (
    <tfoot
      ref={ref}
      data-slot="table-footer"
      className={cn(
        "[&>tr>*]:shadow-[var(--hairline-over-strong)] font-[var(--font-weight-medium)]",
        className,
      )}
      {...props}
    />
  ),
);

TableFooter.displayName = "TableFooter";

/* ============================================================================
   TableRow
   ========================================================================= */

/* The row's exclusive states, resolved in JS and emitted as ONE class set.
   `data-[state=selected]:bg-x`, `[aria-disabled]:bg-y` and `hover:bg-z` carry
   identical specificity, so which one paints would otherwise be decided by
   Tailwind's emission order — which a component may not depend on
   (PATTERN §4). Precedence, written down once:

       disabled  >  selected  >  default (which is the only one that hovers)   */
const ROW_DEFAULT = "motion-row-hover hover:bg-accent";

/* Selected takes `--surface-selected`, a paper of its own. It cannot
   take `--accent`: that is the hover wash, and a selected row that looks
   exactly like a hovered one tells the reader nothing. The kit names no
   selected-row fill at all — logged as GAPS-D TBL-4. A selected row does not
   change again on hover, because it is already the loudest row on screen.

   OVERRIDE 40 (2026-08-23) confirmed ONE answer for a chosen record: `List`,
   `map`'s list row and `Card` all take the same string, and `map`'s charcoal
   row is gone. That part stands. The PAPER moved with override 44 — see
   below. */
/* OVERRIDE 44 (2026-08-23) — the selected paper is its own token now.
   Override 40 pointed this at `--surface-panel`. The K1 reversal then moved
   the papers underneath it: a row now sits INSIDE a soft-paper panel, so the
   "selected" wash painted the row the paper it was already standing on and
   measured 1.000. `--surface-selected` is the paper one rung further from the
   page than the panel -- #EFE6DD in light, --kw-unlit-quiet in dark. Still
   ONE answer for a chosen record: `TableRow`, `List`, `map`'s list row and
   `Card` all take this exact string. */
const ROW_SELECTED = "bg-surface-selected";

/* A fill and an ink. Never an opacity, and no hover, so a dead row cannot
   look clickable. */
const ROW_DISABLED =
  "cursor-not-allowed bg-[var(--btn-disabled-fill)] text-[var(--btn-disabled-label)]";

export interface TableRowProps extends React.ComponentPropsWithoutRef<"tr"> {
  /**
   * The record this row shows is chosen. Also readable as
   * `data-state="selected"`, which is what the applications' existing call
   * sites write, and both are honoured.
   */
  selected?: boolean;
  /**
   * The record cannot be acted on. A fill and an ink; the row still reads.
   * `aria-disabled` is set rather than anything that removes it from the
   * accessibility tree — an unavailable record is still a record.
   */
  disabled?: boolean;
  /**
   * The row has just arrived: `.motion-row-enter`, the tight 4px rise.
   * Opt-in, because only the list knows which rows are new — motion.css §7
   * warns that twenty rows rising at once is a wave, and a wave is the
   * parallax ruling in disguise.
   */
  entering?: boolean;
  /** The row is leaving: `.motion-row-exit`, the shorter fall on `--ease-exit`. */
  exiting?: boolean;
  /**
   * The row is being re-ordered: `.motion-row-move`, a transition on the
   * transform a FLIP measurement puts on it. The measurement belongs to the
   * list; this class only decides how long the trip takes.
   */
  moving?: boolean;
}

/**
 * One record.
 *
 * TEN STATES
 *  1. default        — 56 tall, on a `--hair` hairline.
 *  2. hover          — `bg-accent`, the kit's neutral row wash, with
 *                      `.motion-row-hover` timing it. Only on a row that is
 *                      neither selected nor disabled — the precedence above is
 *                      resolved in JS, so there is no race to lose.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once. A
 *                      `<tr>` is not focusable; the controls inside it are.
 *  4. active/pressed — does not apply. A row is not a button. Where a whole
 *                      row navigates, the call site puts a `Button
 *                      variant="link"` in the first cell and that control owns
 *                      the press (GAPS-D TBL-5).
 *  5. disabled       — `--btn-disabled-fill` / `--btn-disabled-label`,
 *                      `aria-disabled`, no hover.
 *  6. loading        — does not apply to a row. A row waiting for its own data
 *                      renders `Skeleton` in its cells and keeps its 56.
 *  7. empty          — a row with no cells renders an empty 56-tall row.
 *                      Nothing is invented; the empty register belongs to the
 *                      collection.
 *  8. error          — does not apply as a skin. A row whose record failed
 *                      says so in a cell, with a `Badge variant="destructive"`
 *                      — colour is the whole treatment and it belongs on the
 *                      pill, not smeared across the row.
 *  9. selected       — `bg-surface-selected` and `data-state="selected"`.
 * 10. read-only      — always, for this primitive.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED, and this is the load-bearing one:
 *  56 at every width, by ruling 28. The row does not become 44 on a phone and
 *  it does not become dense on a wide screen.
 *
 * RTL — safe. Height and rules are on the block axis; the cells inside are
 * logical.
 */
const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(
  (
    {
      className,
      selected,
      disabled = false,
      entering = false,
      exiting = false,
      moving = false,
      ...rest
    },
    ref,
  ) => {
    /* Honour the `data-state="selected"` the applications' existing call sites
       already write, as well as the `selected` prop. `data-*` is not part of
       the `<tr>` prop type, so it is read through one narrow cast rather than
       by widening the whole interface. */
    const passed = (rest as { "data-state"?: string })["data-state"];
    const isSelected = selected ?? passed === "selected";
    const state = disabled ? "disabled" : isSelected ? "selected" : "default";

    return (
      <tr
        ref={ref}
        {...rest}
        data-slot="table-row"
        data-state={isSelected ? "selected" : passed}
        aria-disabled={disabled || undefined}
        className={cn(
          // 56 — `--control-height-row`, ruling 28. The one fixed height here.
          /* ch17: "8% hairline under each row". Drawn as the artifact draws
             it — `inset 0 -1px 0 var(--hair)`, never a `border` (review 1A ·
             fix 2). It goes on the CELLS rather than the `<tr>`: a collapsed
             table does not paint a box-shadow on a row box, and the run of
             cells is the same line. */
          "h-[var(--control-height-row)] [&>*]:shadow-[var(--hairline-under)]",
          state === "default" && ROW_DEFAULT,
          state === "selected" && ROW_SELECTED,
          state === "disabled" && ROW_DISABLED,
          entering && "motion-row-enter",
          exiting && "motion-row-exit",
          moving && "motion-row-move",
          className,
        )}
      />
    );
  },
);

TableRow.displayName = "TableRow";

/* ============================================================================
   TableHead
   ========================================================================= */

export interface TableHeadProps extends React.ComponentPropsWithoutRef<"th"> {}

/**
 * A column heading.
 *
 * `.kw-matrix th`: micro UPPERCASE at the 0.08em eyebrow tracking, tertiary
 * ink, aligned to the start — the kit's specimen says "align everything to
 * the left", which here is `text-start`, so it is the inline start in Arabic
 * too — on the `--hair-strong` section rule. `text-micro` is a real
 * utility and carries the size, the leading and that tracking together, so no
 * arbitrary value is needed and none is written.
 *
 * TEN STATES — the header's block covers all ten. A sortable heading puts a
 * `Button variant="ghost"` inside itself; every interactive state then belongs
 * to that button, including its ring.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED, and `whitespace-nowrap` is part of
 *  the mobile answer: a header that wrapped would let the table squeeze
 *  instead of overflowing, and the container would never scroll.
 *
 * RTL — safe. `text-start` and `px-3` are logical.
 */
const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      data-slot="table-head"
      className={cn(
        "px-3 text-start align-middle whitespace-nowrap",
        "text-micro uppercase font-[var(--font-weight-medium)] text-ink-tertiary",
        /* The header's rule is the 20% section hairline, as an inset shadow. */
        "shadow-[var(--hairline-under-strong)]",
        // A header cell holding a checkbox is square at the row height.
        "[&:has([role=checkbox])]:w-[var(--control-height-row)]",
        className,
      )}
      {...props}
    />
  ),
);

TableHead.displayName = "TableHead";

/* ============================================================================
   TableCell
   ========================================================================= */

export interface TableCellProps extends React.ComponentPropsWithoutRef<"td"> {}

/**
 * One value.
 *
 * `.kw-matrix td`: `--space-3` inline padding, middle-aligned against the 56
 * row, at the normal leading. The FIRST cell in a row is the kit's name
 * column — `--weight-strong` and never wrapping — which is drawn here with
 * `first:` rather than asked of every call site.
 *
 * TEN STATES — the row's block covers all ten. A cell adds nothing: whatever
 * is inside it (a `Badge`, a `Button`, an `Input`) brings its own states, and
 * a cell that drew its own would fight them.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. Ordinary cells WRAP (a long note
 *  must stay readable) and the row grows past 56 when they do — `h-*` is a
 *  minimum on a table row, which is the correct reading: 56 is the row's
 *  height, not a clip.
 *
 * RTL — safe. `px-3` is padding-inline; `first:` is DOM order, which is
 * already the inline-start column in both directions.
 */
const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      data-slot="table-cell"
      className={cn(
        "px-3 align-middle",
        // The name column: the kit's one "bold", and it does not wrap.
        "first:font-[var(--font-weight-medium)] first:whitespace-nowrap",
        // A cell holding a checkbox is square at the row height, like its head.
        "[&:has([role=checkbox])]:w-[var(--control-height-row)]",
        className,
      )}
      {...props}
    />
  ),
);

TableCell.displayName = "TableCell";

/* ============================================================================
   TableCaption
   ========================================================================= */

export interface TableCaptionProps extends React.ComponentPropsWithoutRef<"caption"> {}

/**
 * The table's own name, under it.
 *
 * `caption-bottom` because the kit puts a table's label below the data, with
 * its other captions and timestamps: `--text-caption` (13) in tertiary ink.
 * `text-caption` is a real utility (tokens.css §10).
 *
 * TEN STATES
 *  1. default        — 13/tertiary, below the table, inline-start aligned.
 *  2-6, 8-10         — do not apply. A caption is a label: it has no pointer
 *                      response, is not focusable, cannot be pressed,
 *                      disabled, busy, wrong or selected, and is always
 *                      read-only.
 *  7. empty          — a caption with no children renders an empty element and
 *                      only the `mt-4` gap. A call site with nothing to say
 *                      should not render one; a primitive must not guess a
 *                      title for a table it cannot see.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. It wraps, at every width.
 *
 * RTL — safe. `text-start` is logical.
 */
const TableCaption = React.forwardRef<HTMLTableCaptionElement, TableCaptionProps>(
  ({ className, ...props }, ref) => (
    <caption
      ref={ref}
      data-slot="table-caption"
      className={cn("mt-4 text-start text-caption text-ink-tertiary", className)}
      {...props}
    />
  ),
);

TableCaption.displayName = "TableCaption";

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
};
