/* ============================================================================
   Matrix — records down, periods or people across, a totals column.

   DESIGN SOURCE
   `KWAPSO-SPEC.md` CH19 view 07. The chapter draws the specimen with its own
   template holes, which name every part of it:

       Member · {{ w }} · Total · {{ m.name }} · {{ cell }} · {{ m.total }}

   and its drawn value settles the whole geometry in one line:

       grid-template-columns: 150px repeat(6, 1fr) 70px

   — a fixed record column, a period column per period, and a fixed totals
   column at the inline end. The cell inset the chapter draws beside it is
   `padding: 10px 12px`.

   The kit's own name for its table specimen is `.kw-matrix`, transcribed in
   `components/primitives/table/table.tsx`. This view is that table with a
   stated column ladder and every figure tabular; nothing about the row, the
   hairline or the header type is redrawn here.

   THE LAW THIS FILE OBEYS
   · THE TABLE IS `Table`. The row height, the 8% hairline under a row as an
     inset shadow, the 20% rule under the header, the cell inset and the
     header's micro uppercase all belong to the primitive. If this file wrote
     a cell's padding it would have gone wrong.
   · EVERY FIGURE IS TABULAR. `tabular-nums` on the cells, the totals and the
     header, so a column of numbers is a column and not a ragged edge. Chapter
     19 says so in the view's own name; `Badge` already obeys the same rule.
   · THE TOTALS COLUMN IS A COLUMN, NOT A ROW STYLE. It is the last column, at
     its own fixed width, at the medium weight, ranged to the inline end. A
     matrix without totals passes `totals={false}` and the column is not drawn
     at all rather than drawn empty.
   · Colour states nothing here. A matrix is figures; the kit heat-shades a
     heat map (CH19's twelve-column drawing), not this. No cell in this file
     takes an accent, and none takes mango.
   · Focus is one global rule (tokens.css §8). `Table`'s container scrolls
     rather than hiding, so a control inside a cell rings in full.
   · No `border` property anywhere. Every rule is `Table`'s inset shadow.
   · rem only, every string a prop with a default, LTR only.

   RENDERING CONTEXT
   No `"use client"`. This module holds no state, calls no hook and builds no
   handler during its own render — it forwards nodes into `Table`.
   ========================================================================= */

import * as React from "react";

import { cn } from "../../lib/utils";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "../../controls/table/table";
import { CollectionRegister } from "../collection-frame/collection-frame";

export interface MatrixRow {
  /** Stable key. Falls back to the index. */
  id?: string;
  /** The record's name — the first column, which chapter 17 says is always it. */
  label: React.ReactNode;
  /**
   * One value per column, in `columns` order. A short array leaves the
   * remaining cells blank rather than shifting the row: the system prefers
   * nothing to a dash (PATTERN §4).
   */
  cells: readonly React.ReactNode[];
  /** The row's figure at the inline end. Undefined draws an empty cell. */
  total?: React.ReactNode;
  /** Chosen. `TableRow` owns the drawing. */
  selected?: boolean;
  /** Cannot be acted on. `TableRow` owns the fill and the ink. */
  disabled?: boolean;
}

export interface MatrixProps
  extends Omit<React.ComponentPropsWithoutRef<"table">, "children"> {
  /**
   * The columns across the top — weeks, or people. Already formatted by the
   * caller: ruling 07 makes date wording follow the app language.
   */
  columns: readonly React.ReactNode[];
  /** The records, in the order they should read. This component never sorts. */
  rows: readonly MatrixRow[];

  /** The first column's heading. The kit's own drawing says "Member". */
  rowHeader?: React.ReactNode;
  /** The last column's heading. The kit's own drawing says "Total". */
  totalHeader?: React.ReactNode;
  /** Draw the totals column at all. */
  totals?: boolean;

  /**
   * The column totals, along the foot. Not drawn by chapter 19 — the kit's
   * specimen totals rows only — so it is off unless a caller passes one, and
   * it is logged in GAPS-TRACK2A (MTX-3).
   */
  footer?: {
    label?: React.ReactNode;
    cells?: readonly React.ReactNode[];
    total?: React.ReactNode;
  };

  /** How wide the record column is. The kit's figure, in rem. */
  labelWidth?: string;
  /** How wide the totals column is. The kit's figure, in rem. */
  totalWidth?: string;
  /**
   * The width below which the table scrolls inside its own container instead
   * of crushing its columns. Undefined lets `Table` decide, which is to let
   * the columns crush — see the breakpoint note.
   */
  minWidth?: string;

  /** A line under the table, in the caption's quiet ink. */
  caption?: React.ReactNode;
  /** The table's accessible name. */
  label?: string;

  /* ---- the three registers ------------------------------------------------ */
  loading?: boolean;
  error?: boolean;
  empty?: boolean;
  loadingState?: React.ReactNode;
  emptyState?: React.ReactNode;
  errorState?: React.ReactNode;
  loadingLabel?: string;
  emptyLabel?: string;
  emptyBody?: string;
  errorLabel?: string;
  errorBody?: string;
}

/**
 * Records down, periods or people across.
 *
 * TEN STATES
 *  1. default        — header row, a row per record, an optional totals
 *                      column, every figure tabular.
 *  2. hover          — `TableRow`'s own neutral wash. Nothing is added here;
 *                      a matrix that lit a CELL under the pointer would be
 *                      claiming the cell is a target, and it is not.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      Nothing in this file sets `overflow: hidden`.
 *  4. active/pressed — does not apply. A figure is read, not pressed. A cell
 *                      that IS a control is a node the caller passed in, and
 *                      it carries its own press.
 *  5. disabled       — per row, via `TableRow`'s fill and ink. Never an
 *                      opacity.
 *  6. loading        — `loading`: the busy register in place of the table.
 *                      Unlike a list, neither the row count nor the column
 *                      count is known before the data lands, so there is no
 *                      known shape to draw a skeleton of.
 *  7. empty          — no rows, or `empty`: the quiet register. A header row
 *                      over nothing reads as a broken table.
 *  8. error          — `error`: the register with a poppy dot. Beats empty.
 *  9. selected       — per row, `TableRow`'s own `--surface-panel`.
 * 10. read-only      — always. A matrix shows values. Chapter 19's note about
 *                      cells editing in place is logged as a question rather
 *                      than built (GAPS-TRACK2A MTX-1): an editable grid is
 *                      `data-table`'s job, and a caller who needs one passes
 *                      an `Input` as the cell node.
 *
 * THREE BREAKPOINTS
 *  · mobile — the table SCROLLS ON THE INLINE AXIS inside `Table`'s own
 *    container, which is the primitive's stated behaviour and the same answer
 *    the kit's own tables give. It does not restack into cards: a matrix
 *    restacked is a list of lists, and the whole value of the view is reading
 *    ACROSS. A caller that knows its column count passes `minWidth` so the
 *    columns hold their ladder and the container scrolls; without one the
 *    columns compress, which is `Table`'s default and not this file's to
 *    change. Chapter 19 states no narrow render for this view — logged as
 *    GAPS-TRACK2A MTX-2.
 *  · tablet / desktop — unchanged, and usually with nothing left to scroll.
 *
 * RTL — LTR only (ruling 10). Every inset is `Table`'s, which is logical.
 */
const Matrix = React.forwardRef<HTMLTableElement, MatrixProps>(
  (
    {
      className,
      columns,
      rows,
      /* The artifact draws both words as STATIC text, not template holes:
         "Member" over the record column and "Total" over the last. They had
         no defaults, so an unqualified matrix shipped two nameless columns.
         Defaults only — the props, their names and their types are
         untouched, and a caller in another language still overrides them. */
      rowHeader = "Member",
      totalHeader = "Total",
      totals = true,
      footer,
      labelWidth = "9.375rem",
      totalWidth = "4.375rem",
      minWidth,
      caption,
      label = "Matrix",
      loading = false,
      error = false,
      empty = false,
      loadingState,
      emptyState,
      errorState,
      loadingLabel = "Loading…",
      emptyLabel = "Nothing here",
      emptyBody = "Nothing matches what you are looking at right now.",
      errorLabel = "Unavailable",
      errorBody = "We can’t show this right now. Try again in a moment.",
      ...props
    },
    ref,
  ) => {
    /* Exclusive states resolved in JS (PATTERN §4): loading beats error beats
       empty. */
    const state = loading
      ? "loading"
      : error
        ? "error"
        : empty || rows.length === 0 || columns.length === 0
          ? "empty"
          : "default";

    if (state !== "default") {
      const register =
        state === "loading"
          ? (loadingState ?? (
              <CollectionRegister tone="busy" eyebrow={loadingLabel} busyLabel={loadingLabel} />
            ))
          : state === "error"
            ? (errorState ?? <CollectionRegister tone="error" eyebrow={errorLabel} body={errorBody} />)
            : (emptyState ?? <CollectionRegister tone="quiet" eyebrow={emptyLabel} body={emptyBody} />);

      return (
        <div data-slot="matrix" data-state={state} aria-busy={loading || undefined}>
          {register}
        </div>
      );
    }

    /* TWO figure skins, not one, because the artifact ranges only ONE column
       to the inline end. CH19 view 07 draws every period head and every
       period cell with a `font-variant-numeric: tabular-nums` and NO
       `text-align`, and writes `text-align: right` on exactly two cells —
       the "Total" head and each row's total. Ranging the six period columns
       to the end as well pushed every week's figure against the next week's
       heading, which is the one thing the drawn alignment avoids. */
    const period = "tabular-nums";
    const figure = "text-end tabular-nums";

    return (
      <Table
        ref={ref}
        data-slot="matrix"
        data-state="default"
        aria-label={label}
        minWidth={minWidth}
        className={cn(className)}
        {...props}
      >
        {caption !== undefined && caption !== null ? <TableCaption>{caption}</TableCaption> : null}

        <TableHeader>
          <TableRow>
            {/* The record column, at the kit's fixed width. */}
            <TableHead style={{ width: labelWidth }}>{rowHeader}</TableHead>

            {columns.map((column, i) => (
              <TableHead key={i} className={period}>
                {column}
              </TableHead>
            ))}

            {totals ? (
              <TableHead style={{ width: totalWidth }} className={figure}>
                {totalHeader}
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow
              key={row.id ?? String(rowIndex)}
              selected={row.selected}
              disabled={row.disabled}
            >
              {/* `TableCell` already gives the first cell the kit's one
                  "bold" and stops it wrapping. Nothing is added here. */}
              <TableCell>{row.label}</TableCell>

              {columns.map((_, i) => (
                <TableCell key={i} className={period}>
                  {row.cells[i]}
                </TableCell>
              ))}

              {totals ? (
                <TableCell className={cn(figure, "font-[var(--font-weight-medium)]")}>
                  {row.total}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>

        {footer ? (
          <TableFooter>
            <TableRow>
              <TableCell>{footer.label}</TableCell>
              {columns.map((_, i) => (
                <TableCell key={i} className={period}>
                  {footer.cells?.[i]}
                </TableCell>
              ))}
              {totals ? <TableCell className={figure}>{footer.total}</TableCell> : null}
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
    );
  },
);

Matrix.displayName = "Matrix";

export { Matrix };
