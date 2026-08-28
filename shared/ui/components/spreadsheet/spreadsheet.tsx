/* ============================================================================
   Spreadsheet — CH19 view 06: the dense spreadsheet, cells edit in place.

   DESIGN SOURCE
   `Kwapso UI Kit.dc.html`, chapter 19, view 06 — the kit's own caption row is
   `['table', 'Dense spreadsheet, cells edit in place', 'Hours, invoices,
   licences', 'Table']`. The specimen (`tableCells`) states every figure:

     grid-template-columns: 150px repeat(6, 1fr); gap: 1px;
     background: rgba(26,25,24,.10); border-radius: 24px; overflow: hidden
     cell: padding: 10px 12px; tabular-nums; nowrap + ellipsis
     header cell:  11 / 500, var(--fg3), on PAPER  — SENTENCE CASE
     first column: 13 / 500, on PAPER              — frozen + bold
     body cell:    13 / 300, var(--fg), on BEIGE (var(--card))
     caption under it, 12 / var(--fg3), padding 10px 12px, verbatim:
       "First column frozen · cells edit in place"

   Ruled to ship 2026-08-27 — D13-BUILD on `verify/decide-3.html` §D13, which
   drew this specimen beside DataTable's row model and named every deviation.
   KWAPSO-SPEC.md register row 78. Register row 75 (D14 = "keep") is the
   OTHER half of the same day's rulings and does not collide: it declines
   view 06's 13 as an argument to move the TABLE PRIMITIVE's density, while
   D13 ships the drawing as its own object — which is the same distinction
   the audit drew when it refused a silent density.

   THIS IS NOT `data-table` AND NOT `data-preview-table` — A THIRD OBJECT.
   The audit (L19-2, quoted in full in decide-3 §D13) established it, and the
   next census must not "deduplicate" it back:
     · its header is SENTENCE CASE at 11/500 with the eyebrow's tracking and
       uppercase both reset — not the uppercase eyebrow the other two wear;
     · its grid is `gap: 1px` filled with a GRIDLINE GROUND — not per-row
       inset hairline shadows;
     · its cells are 10/12, which BREAKS ruling 28's fixed 56 row — the
       chapter itself draws against the standing row rule, which is exactly
       why the audit refused to fold this into DataTable as a silent density;
     · its first column is frozen and bold, on the header's paper;
     · its cells edit in place. `DataTable` is read-only by law (its state
       10), and `data-preview-table` is the import wizard's preview of rows
       BEFORE they are committed — different object, different chapter.

   THE GRIDLINE IS A MINTED TOKEN, NOT AN ANONYMOUS RGBA. The drawn ground is
   charcoal at 10%, which is none of the standing hairline tiers (6/8/20).
   The kit's HTML writes the exact value out — `rgba(26,25,24,.10)` — so
   tokens.css mints `--hair-grid` at exactly that, dark by the kit's own
   method (carry the alpha, flip the ink). decide-3's own drawing used --hair
   (8%) only because no name existed, and said so in its foot.

   THE LAW THIS FILE OBEYS
   · THE FROZEN COLUMN IS STICKY POSITIONING INSIDE ONE SCROLL SHELL — the
     same mechanism as `data-table`'s sticky header: one `overflow-auto` box,
     `position: sticky` against it, and the pinned cell OPAQUE (the header
     paper) so rows slide under it rather than through it. The pinned cells
     also carry a 1px drop of the gridline ground on their trailing edge: at
     rest it lands exactly inside the grid's own 1px gap (same colour, no
     doubling), and once scrolled it keeps ruling the boundary the gap has
     scrolled away from.
   · EDIT-IN-PLACE IS WHAT THE ARTIFACT DRAWS, NO MORE. The kit draws resting
     cells and the caption's promise; it draws no validation, no dirty
     marker, no save choreography. So a cell is an `Input`-bare field taking
     the cell's own inset and type, it commits on blur or Enter (only when
     the value changed), Escape puts the drawn value back, and
     `onCellCommit` is the one change event. Uncommitted-value semantics —
     what to do with the committed string — belong to the application.
   · Focus is ONE global rule (tokens.css §8). Nothing here rings, nothing
     writes `outline`, and the scroll shell carries `scroll-p-1` so a ring on
     an off-screen cell is scrolled into view whole. A field has no hover
     (override 42), so no cell washes under the pointer.
   · Disabled is a fill and an ink (`--btn-disabled-fill` /
     `--btn-disabled-label`), per row, and a disabled row draws NO editor at
     all rather than a dead one — `data-table`'s own precedent for its open
     button.
   · Exclusive states resolved in JS (PATTERN §4): loading beats error beats
     empty; row-disabled beats editable.
   · Tokens only. The one drawn figure with no ladder rung is the 10 block
     inset, which IS on the half-step ladder as `--space-2h`; 150px is
     9.375rem, the same figure `matrix` already writes for the same drawn
     column.
   · No product vocabulary. Columns, rows, cells, values.

   RENDERING CONTEXT
   `"use client"`. Event handlers are created during render for the editing
   cells.
   ========================================================================= */

"use client";

import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { CollectionRegister } from "../collection-frame/collection-frame";

/* ----------------------------------------------------------------------------
   One cell's skin — the three drawn kinds. A cva because the three are
   exclusive and share the drawn box (10/12 inset, nowrap + ellipsis,
   tabular figures).
   ------------------------------------------------------------------------- */
const cellVariants = cva(
  [
    "min-w-0 truncate",                       // nowrap + ellipsis, drawn on every cell
    "px-3 py-[var(--space-2h)]",              // the drawn 10 / 12
    "tabular-nums",                           // drawn on every cell
  ],
  {
    variants: {
      kind: {
        /** 11 / 500 tertiary on the panel paper — SENTENCE CASE: the
            eyebrow's tracking and uppercase are both reset ON PURPOSE;
            `text-micro` bakes in 0.08em, and this header is the one drawn
            without it (the L19-2 finding). */
        header:
          "bg-surface-panel text-micro tracking-normal normal-case font-[var(--font-weight-medium)] text-ink-tertiary",
        /** The frozen column: 13 / 500 on the header's paper. */
        frozen:
          "bg-surface-panel text-caption font-[var(--font-weight-medium)] text-foreground",
        /** A value cell: 13 / 300 on `--card`. */
        body: "bg-card text-caption font-[var(--font-weight-light)] text-foreground",
      },
    },
    defaultVariants: { kind: "body" },
  },
);

/* The frozen column's mechanism, shared by its header and body cells: sticky
   against the one scroll shell, opaque by its own paper (above), over the
   scrolling cells, and carrying the 1px gridline drop on its trailing edge —
   see the law block. */
const FROZEN_STICKY = "sticky start-0 z-[1] shadow-[1px_0_0_0_var(--hair-grid)]";

/* Disabled: a fill and an ink, appended after the cva result so
   tailwind-merge drops the cell's own paper. Never an opacity. */
const CELL_DISABLED = "bg-[var(--btn-disabled-fill)] text-[var(--btn-disabled-label)]";

export interface SpreadsheetRow {
  /** Stable key. Falls back to the index. */
  id?: string;
  /**
   * The frozen first cell — the record's key. Chapter 17's rule ("first
   * column is always the record name") is why this cell is never editable:
   * it is the row's identity, not one of its values.
   */
  label: React.ReactNode;
  /**
   * One value per column, in `columns` order, as strings because they are
   * what the editor holds. A short array leaves the remaining cells blank
   * rather than shifting the row (PATTERN §4's "nothing over an invented
   * dash", the same rule `matrix` writes down).
   */
  cells: readonly string[];
  /** Cannot be acted on. The fill and the ink; its cells draw no editor. */
  disabled?: boolean;
}

export interface SpreadsheetProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  /**
   * The value columns' headings, sentence case — the drawing's own headers
   * are words like "Module", "Hours", "Rate", never uppercase. The caller's
   * words; this component styles them and never re-cases them.
   */
  columns: readonly React.ReactNode[];
  /** The frozen column's heading. The kit's specimen writes "Ticket" as DATA, not as a drawn constant, so there is no invented default. */
  labelHeader?: React.ReactNode;
  /** The rows, in the order they should read. This component never sorts. */
  rows: readonly SpreadsheetRow[];

  /**
   * A value was committed — the reader left a changed cell by blur or Enter.
   * PASSING IT IS WHAT MAKES CELLS EDIT IN PLACE; omitted, every cell draws
   * as read-only text (state 10). Called only when the value actually
   * changed; Escape restores the drawn value and commits nothing.
   */
  onCellCommit?: (
    row: SpreadsheetRow,
    rowIndex: number,
    columnIndex: number,
    value: string,
  ) => void;
  /**
   * One editing cell's accessible name — a bare `<input>` in a grid of
   * bare inputs is a wall of nameless fields. Given the row and column so
   * the sentence can name both. Falls back to "row, column" positions.
   */
  getCellLabel?: (row: SpreadsheetRow, rowIndex: number, columnIndex: number) => string;

  /** How wide the frozen column is. The kit's 150px, in rem. */
  labelWidth?: string;
  /**
   * The width below which the sheet scrolls inside its own shell instead of
   * crushing its columns. Undefined lets the columns compress, which is the
   * same default `Table` and `matrix` keep.
   */
  minWidth?: string;

  /**
   * The line under the sheet, in the caption's quiet ink. The default is the
   * kit's own drawn caption, verbatim. `null` draws none.
   */
  caption?: React.ReactNode;
  /** The sheet's accessible name. */
  label?: string;

  /* ---- the three registers ---------------------------------------------- */
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

/* ----------------------------------------------------------------------------
   One editing cell. The input takes the cell's whole box — the cell drops its
   own inset so the field's hit area is the drawn cell, the same division
   `data-table` uses for its open button. Uncontrolled per cell, re-keyed on
   the drawn value, so a caller committing a change round-trips cleanly.
   ------------------------------------------------------------------------- */
function EditingCell({
  value,
  ariaLabel,
  onCommit,
}: {
  value: string;
  ariaLabel: string;
  onCommit: (next: string) => void;
}) {
  return (
    <input
      key={value}
      type="text"
      data-slot="spreadsheet-editor"
      defaultValue={value}
      aria-label={ariaLabel}
      className={cn(
        "block w-full min-w-0 appearance-none bg-transparent",
        "px-3 py-[var(--space-2h)]",                     // the cell's own 10 / 12
        "text-caption font-[var(--font-weight-light)] tabular-nums text-foreground",
      )}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();                    // blur is the one commit path
        } else if (event.key === "Escape") {
          event.currentTarget.value = value;             // the drawn value comes back
        }
      }}
      onBlur={(event) => {
        if (event.currentTarget.value !== value) onCommit(event.currentTarget.value);
      }}
    />
  );
}

/**
 * CH19 view 06 — the dense spreadsheet. Frozen bold first column, 1px
 * gridlines on `--hair-grid`, sentence-case headers, cells edit in place.
 *
 * TEN STATES
 *  1. default        — the 1px gridline lattice on `--hair-grid`, header and
 *                      frozen column on the panel paper, value cells on
 *                      `--card` at the drawn 10/12 inset. NOT ruling 28's 56
 *                      row — the chapter's own drawing breaks it, which is
 *                      why this is its own object and not a DataTable
 *                      density.
 *  2. hover          — does not apply. A cell is a field, and a field has no
 *                      hover (override 42). Nothing washes.
 *  3. focus-visible  — NOT here. tokens.css §8 rings the editing cell at
 *                      once; the scroll shell is `overflow-auto`, never
 *                      `hidden`, and carries `scroll-p-1` so a ring on an
 *                      off-screen cell scrolls into view whole.
 *  4. active/pressed — does not apply. A cell is entered, not pressed; the
 *                      editor's caret is the entered state.
 *  5. disabled       — per row: `--btn-disabled-fill` / `--btn-disabled-label`,
 *                      a fill and an ink, and NO editor is drawn at all
 *                      rather than a dead one. Never an opacity.
 *  6. loading        — `loading`: the busy register in place of the sheet.
 *                      Like `matrix`, no skeleton: the sheet's shape is its
 *                      data's.
 *  7. empty          — no rows or `empty`: the quiet register. A header row
 *                      over nothing reads as a broken sheet.
 *  8. error          — `error`: the register with the poppy dot. Beats empty.
 *  9. selected       — does not apply. The drawing selects nothing; a chosen
 *                      record is a collection concern, and this view's unit
 *                      is the cell.
 * 10. read-only      — the default WITHOUT `onCellCommit`: the same sheet,
 *                      plain text cells, no fields. The frozen column is
 *                      read-only always — it is the record's key.
 *
 * THREE BREAKPOINTS
 *  mobile   — the sheet SCROLLS ON THE INLINE AXIS inside its own shell, and
 *             the frozen column holds still over it: that is the view's whole
 *             contract and it is not a wide-screen luxury. It does not
 *             restack and it does not drop a column — `table.tsx`'s argument,
 *             inherited whole. A caller who knows the column count passes
 *             `minWidth` so the columns hold their measure.
 *  tablet   — the same sheet, usually with little left to scroll.
 *  desktop  — UNCHANGED. The type steps and the cell inset are the same at
 *             every width.
 *
 * RTL — LTR only (ruling 10). Every inset is logical; the frozen edge's 1px
 * drop is a physical `1px 0` shadow and is the one mark that would need a
 * mirror.
 */
const Spreadsheet = React.forwardRef<HTMLDivElement, SpreadsheetProps>(
  (
    {
      className,
      columns,
      labelHeader,
      rows,
      onCellCommit,
      getCellLabel,
      labelWidth = "9.375rem",
      minWidth,
      caption = "First column frozen · cells edit in place",
      label = "Spreadsheet",
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
      style,
      ...props
    },
    ref,
  ) => {
    /* Exclusive states resolved in JS (PATTERN §4): loading beats error
       beats empty. */
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
        <div data-slot="spreadsheet" data-state={state} aria-busy={loading || undefined}>
          {register}
        </div>
      );
    }

    /* The drawn geometry — a fixed record column, a fraction per value
       column. One string, written once, shared by every row so the columns
       cannot drift apart. `minmax(4rem, 1fr)` rather than a bare `1fr` so a
       long value truncates (the drawn ellipsis) instead of growing its
       column past its siblings'. */
    const template = `${labelWidth} repeat(${String(columns.length)}, minmax(4rem, 1fr))`;

    return (
      <div
        ref={ref}
        data-slot="spreadsheet"
        data-state="default"
        className={cn("flex min-w-0 flex-col", className)}
        style={style}
        {...props}
      >
        {/* THE SCROLL SHELL — one box, the element `sticky` resolves
            against, exactly `data-table`'s arrangement for its sticky
            header. It carries the drawn 24 radius and the clip, so the
            sheet's corners round whether or not it scrolls. */}
        <div className="w-full overflow-x-auto scroll-p-1 rounded-[var(--radius)]">
          {/* THE SHEET — the drawn `gap: 1px` lattice. The ground behind the
              gaps is the minted `--hair-grid`; rows are transparent so both
              axes' gaps read the same 1px line.

              `w-max min-w-full` IS LOAD-BEARING, NOT COSMETIC. The rows are
              grid containers whose tracks have a floor (the label width, the
              4rem column minimum), so in a narrow shell the TRACKS overflow
              the row's own box unless the box follows them. Measured live at
              380 before this pair was written: the lattice's box stayed at
              the shell's width, so (a) the gridline ground stopped painting
              past it — bare gaps in the scrolled region — and (b) the frozen
              cell's sticky containing block was the too-narrow grid area and
              the column DID NOT HOLD. `max-content` makes every row's box
              span its own tracks; `min-w-full` keeps a small sheet filling
              its shell; `minWidth` (a caller's stated measure) still raises
              the floor further via `min-inline-size`. */}
          <div
            role="table"
            aria-label={label}
            className="flex w-max min-w-full flex-col gap-px bg-[var(--hair-grid)]"
            style={minWidth === undefined ? undefined : { minInlineSize: minWidth }}
          >
            <div role="row" className="grid gap-px" style={{ gridTemplateColumns: template }}>
              <div
                role="columnheader"
                className={cn(cellVariants({ kind: "header" }), FROZEN_STICKY)}
              >
                {labelHeader}
              </div>
              {columns.map((column, columnIndex) => (
                <div
                  key={columnIndex}
                  role="columnheader"
                  className={cellVariants({ kind: "header" })}
                >
                  {column}
                </div>
              ))}
            </div>

            {rows.map((row, rowIndex) => {
              const disabled = row.disabled === true;
              return (
                <div
                  key={row.id ?? String(rowIndex)}
                  role="row"
                  className="grid gap-px"
                  style={{ gridTemplateColumns: template }}
                >
                  <div
                    role="rowheader"
                    className={cn(
                      cellVariants({ kind: "frozen" }),
                      FROZEN_STICKY,
                      disabled && CELL_DISABLED,
                    )}
                  >
                    {row.label}
                  </div>

                  {columns.map((_, columnIndex) => {
                    const value = row.cells[columnIndex] ?? "";
                    /* Editable only when the caller listens AND the row is
                       live — a disabled row draws its values as text, never
                       as a dead field. */
                    const edits = onCellCommit !== undefined && !disabled;
                    return (
                      <div
                        key={columnIndex}
                        role="cell"
                        className={cn(
                          cellVariants({ kind: "body" }),
                          /* The editor takes the cell's whole box, so the
                             cell's own inset would double it. */
                          edits && "p-0",
                          disabled && CELL_DISABLED,
                        )}
                      >
                        {edits ? (
                          <EditingCell
                            value={value}
                            ariaLabel={
                              getCellLabel?.(row, rowIndex, columnIndex) ??
                              `Row ${String(rowIndex + 1)}, column ${String(columnIndex + 1)}`
                            }
                            onCommit={(next) => {
                              onCellCommit(row, rowIndex, columnIndex, next);
                            }}
                          />
                        ) : (
                          value
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* The drawn caption — 12 / tertiary at the cell inset, under the
            sheet, outside the lattice. */}
        {caption !== undefined && caption !== null ? (
          <div
            data-slot="spreadsheet-caption"
            className="px-3 py-[var(--space-2h)] text-badge text-ink-tertiary"
          >
            {caption}
          </div>
        ) : null}
      </div>
    );
  },
);

Spreadsheet.displayName = "Spreadsheet";

export { Spreadsheet, cellVariants as spreadsheetCellVariants };
