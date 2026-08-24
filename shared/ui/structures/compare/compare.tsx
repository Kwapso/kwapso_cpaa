/* ============================================================================
   Compare — collection view 22, "two to four records as columns" (0 direct
   call sites; a body swap for `CollectionFrame`).

   DESIGN SOURCE
   Kit chapter 19 ("Collection views"), view 22, read out of
   `Design Mothership/kit-current/Kwapso UI Kit.dc.html`. The chapter's own
   line for it, verbatim from the view table:

       compare · "Two to four records as columns"
               · fits "Audit findings, options, quotes"
               · switch label "Compare"

   and the contract the whole chapter is built on, also verbatim:

       "Every view carries the same contract: search, filters, three actions,
        view switch. Only the body below the toolbar changes."

   THE DRAWING, transcribed
     · the frame  — `grid-template-columns: 130px repeat(3, 1fr)`, `gap: 12px`
     · the labels — a column with `padding-top: 54px`, which is what clears
                    the head of the record columns beside it, then one label
                    per row at 12px tertiary, `padding: 9px 0`, each on
                    `inset 0 -1px 0 var(--hair)`
     · a column   — `var(--card)` at radius 24, `padding: 14px 16px`,
                    `gap: 4px`; the record name at 14/500 with
                    `padding-bottom: 12px`; then one value per row at 13px,
                    `padding: 9px 0`, the same hairline under each, tabular

   TWO TO FOUR, AND THE ARTIFACT MEANS IT
   The prose says two to four and the drawing shows three. Fewer than two is
   not a comparison — it is a record, and `DetailView` draws that. More than
   four does not fit the frame at any width the system supports. So: fewer
   than two renders the empty register, and columns past the fourth are
   dropped rather than squeezed. Neither is invented; both are the sentence.

   COMPOSE, DO NOT REBUILD
   A column is a `Card`. The hairline under every row is `--hairline-under`,
   the named form of the artifact's own `inset 0 -1px 0 var(--hair)`. There is
   no `border` in this file, on anything, in any state.

   ROWS ARE POSITIONAL, AND THAT IS LOAD-BEARING
   Row three of the label column has to be row three of every record column
   or the comparison lies. `values` is therefore indexed against `labels`, and
   a column with fewer values draws its missing rows as `emptyValueLabel` —
   which has NO default, because the system prefers nothing to an invented
   dash (PATTERN §4) and only the call site knows whether a blank means
   "none" or "not asked".

   RENDERING CONTEXT
   No `"use client"`. It forwards props and a ref, holds no state, calls no
   hook and creates no handler during its own render.
   ========================================================================= */

import * as React from "react";

import { cn } from "../../lib/utils";
import { Card } from "../../controls/card/card";
import { Skeleton } from "../../controls/skeleton/skeleton";
import { CollectionRegister } from "../collection-frame/collection-frame";

/** The artifact's own bounds: "Two to four records as columns". */
export const MIN_COMPARE_COLUMNS = 2;
export const MAX_COMPARE_COLUMNS = 4;

export interface CompareColumn {
  /**
   * React key. Required: a comparison is re-picked constantly and a
   * positional key would carry one record's values under another's name.
   */
  id: string;
  /** The record's name, at the head of its column. */
  name: React.ReactNode;
  /**
   * The values, indexed against `labels`. Position is meaning here: value
   * three sits on row three, whatever it is.
   */
  values: React.ReactNode[];
}

export interface CompareProps extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  /** The row labels, down the inline start. Their COUNT is the number of rows. */
  labels?: React.ReactNode[];
  /** The records, as columns. Two to four; the fifth onward is dropped. */
  columns?: CompareColumn[];
  /**
   * How wide the label column is. The artifact's figure is 130 at the 16
   * authoring base. rem only.
   */
  labelWidth?: string;
  /**
   * What a missing value prints. NO DEFAULT, deliberately: the system prefers
   * nothing to an invented dash, and only the call site knows what a blank
   * cell means.
   */
  emptyValueLabel?: React.ReactNode;
  /** Accessible name for the comparison as a whole. */
  label?: string;

  /** The comparison has not arrived. Cold cache only. */
  loading?: boolean;
  /** How many placeholder columns to draw while `loading`. */
  loadingColumns?: number;
  /** How many placeholder rows each placeholder column draws. */
  loadingRows?: number;
  /** The request failed. Beats `empty`. */
  error?: boolean;
  /** Force the empty register even with columns present. */
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
 * Two to four records, side by side, row for row.
 *
 * TEN STATES
 *  1. default        — a label column and two to four record columns.
 *  2. hover          — NONE. A comparison is a reading; the artifact draws no
 *                      hover on a column or a row, and a row that washed
 *                      under the pointer would suggest it can be pressed.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      This body holds no control.
 *  4. active/pressed — does not apply, for the same reason as hover.
 *  5. disabled       — does not apply. A comparison is a layout. A record the
 *                      reader may not open is absent from it (ch24.6:
 *                      permissions hide), never a greyed column.
 *  6. loading        — `loading`: `Skeleton` rows inside the real column
 *                      shells, so the frame does not move when the values
 *                      land.
 *  7. empty          — fewer than two columns, no labels, or `empty`: the
 *                      quiet register. One record is not a comparison, and
 *                      saying so is better than drawing half a table.
 *  8. error          — `error`: the register with a poppy dot. Beats `empty`.
 *  9. selected       — does not apply. The artifact marks no column as the
 *                      chosen one; its own drawing puts the recommendation in
 *                      a row called "Decision", in WORDS. This view may not
 *                      invent a highlighted column, which would also be a
 *                      second mango on the screen.
 * 10. read-only      — always. A comparison holds no value.
 *
 * THREE BREAKPOINTS, and the 380 answer
 *  · mobile (base) — the comparison SCROLLS sideways inside its own box, with
 *    the label column keeping its measure and each record column keeping a
 *    readable minimum. It does NOT restack into one column per record: a
 *    comparison whose columns are stacked is no longer a comparison, it is
 *    two records in a row, and row three of one no longer sits beside row
 *    three of the other. The kit states no narrow behaviour for this view —
 *    logged as GAPS-TRACK2B CMP-2, and this is the reading that keeps the
 *    view's one purpose intact.
 *  · tablet (`sm:`) / desktop (`lg:`) — UNCHANGED, and by then it fits. The
 *    record columns are `1fr` and share the width, exactly as drawn.
 *
 * RTL — safe, and unused: the system is LTR only (ruling 10). Every inset is
 * logical and no side is named.
 */
const Compare = React.forwardRef<HTMLDivElement, CompareProps>(
  (
    {
      className,
      labels = [],
      columns = [],
      labelWidth = "8.125rem",
      emptyValueLabel,
      label,
      /* The drawn row inset is `padding: 9px 0`, which is off ruling 28's
         grid ("4px, half-steps at 2px, and there is no fifth"). Both the
         label rows and the value rows take `--space-2h` (10), the nearest
         step, on the same reasoning `CardGrid` applied to chapter 19's 10 and
         14 gaps. GAPS-TRACK2B CMP-1. */
      loading = false,
      loadingColumns = 3,
      loadingRows = 5,
      error = false,
      empty = false,
      loadingState,
      emptyState,
      errorState,
      loadingLabel = "Loading…",
      emptyLabel = "Nothing to compare",
      emptyBody = "Pick at least two records to put them side by side.",
      errorLabel = "Unavailable",
      errorBody = "We can’t show this right now. Try again in a moment.",
      ...props
    },
    ref,
  ) => {
    /* "Two to four records as columns" — the sentence, enforced. */
    const shown = columns.slice(0, MAX_COMPARE_COLUMNS);

    /* Exclusive states resolved in JS (PATTERN §4). */
    const state = loading
      ? "loading"
      : error
        ? "error"
        : shown.length < MIN_COMPARE_COLUMNS || labels.length === 0 || empty
          ? "empty"
          : "default";

    const count = state === "loading" ? loadingColumns : shown.length;
    const rowCount = state === "loading" ? loadingRows : labels.length;

    /* A count and a length, neither of which a utility can see. rem and
       tokens only. The record columns take a readable minimum so the frame
       scrolls at 380 instead of crushing four columns into nothing. */
    const template = {
      gridTemplateColumns: `${labelWidth} repeat(${count}, minmax(9rem, 1fr))`,
    } satisfies React.CSSProperties;

    const showFrame = state === "default" || state === "loading";

    return (
      <div
        ref={ref}
        data-slot="compare"
        data-state={state}
        aria-busy={loading || undefined}
        aria-label={label}
        className={cn("min-w-0", className)}
        {...props}
      >
        {state === "error"
          ? (errorState ?? (
              <CollectionRegister tone="error" eyebrow={errorLabel} body={errorBody} />
            ))
          : null}

        {state === "empty"
          ? (emptyState ?? (
              <CollectionRegister tone="quiet" eyebrow={emptyLabel} body={emptyBody} />
            ))
          : null}

        {state === "loading" && loadingState ? loadingState : null}

        {showFrame && !(state === "loading" && loadingState) ? (
          <div className="min-w-0 overflow-x-auto">
            <div className="grid min-w-max items-start gap-3" style={template}>
              {/* The label column. `padding-top: 54px` is what puts label one
                  level with value one, past the record name above it. */}
              <div
                data-slot="compare-labels"
                className="flex min-w-0 flex-col gap-1 pt-[3.375rem]"
              >
                {Array.from({ length: rowCount }, (_, i) => (
                  <span
                    key={i}
                    className="min-w-0 text-xs text-ink-tertiary shadow-[var(--hairline-under)] py-[var(--space-2h)]"
                  >
                    {labels[i]}
                  </span>
                ))}
              </div>

              {state === "loading"
                ? Array.from({ length: count }, (_, i) => (
                    <Card key={i} variant="raised" className="gap-1 px-4 py-[var(--space-3h)]">
                      <Skeleton
                        className="mb-3 h-5 w-2/3"
                        announce={i === 0}
                        label={loadingLabel}
                      />
                      {Array.from({ length: rowCount }, (_, r) => (
                        <Skeleton key={r} className="my-[var(--space-2h)]" announce={false} />
                      ))}
                    </Card>
                  ))
                : shown.map((column) => (
                    <Card
                      key={column.id}
                      data-slot="compare-column"
                      variant="raised"
                      className="gap-1 px-4 py-[var(--space-3h)]"
                    >
                      <span className="min-w-0 truncate pb-3 text-sm font-[var(--font-weight-medium)]">
                        {column.name}
                      </span>

                      {Array.from({ length: rowCount }, (_, i) => {
                        const value = column.values[i];
                        const printed =
                          value === undefined || value === null ? emptyValueLabel : value;

                        return (
                          <span
                            key={i}
                            data-slot="compare-value"
                            className="min-w-0 text-caption tabular-nums shadow-[var(--hairline-under)] py-[var(--space-2h)]"
                          >
                            {printed}
                          </span>
                        );
                      })}
                    </Card>
                  ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  },
);

Compare.displayName = "Compare";

export { Compare };
