/* ============================================================================
   CardGrid — a wall of record cards (0 direct call sites).

   DESIGN SOURCE
   Kit chapter 19 ("Collection views"), view 03 ("grid"), and the two other
   places the kit lays cards out in a wall, all read out of
   `Design Mothership/kit-current/Kwapso UI Kit.dc.html`:

     · view 03 "grid"    — `grid-template-columns: repeat(4, 1fr); gap: 10px`,
                           each cell a `--card` box at radius 24, inset 14
     · view 11 "gallery" — `repeat(3, 1fr); gap: 14px`, cell inset 10, a 4/3
                           media block at the same radius
     · chapter 18's KPI strip and its two card rows —
                           `repeat(auto-fit, minmax(210px, 1fr)); gap: 14px`
                           and `minmax(300px, 1fr)` for the taller blocks

   Three drawings, three column counts and three gaps: the kit lays cards out
   in a wall constantly and never states one figure for it. What it DOES state
   is the gap, in `tokens/tokens.css`'s own spacing table, where `--space-3`
   (0.75rem) is annotated "control gap, card grid gap". So 12 is the default
   here and the kit's 10 and 14 are read as drawings either side of it.
   Logged as GAPS-COL1 CG-1.

   THE LAW THIS FILE OBEYS
   · This component is a GRID and nothing else. The cell is `Card`, which
     already owns the fill, the radius, the inset and the hover; a card grid
     that drew its own cells would be a second card in the system. That is
     also why there is no `items` prop: a record card's contents are the
     composition's, not this file's.
   · The wall's ground is `--surface-panel` when it paints one at all
     (PATTERN §11). In light `--background`, `--card` and `--surface-raised`
     are the same colour, so a `Card` on the page tone is invisible; a wall of
     invisible cards is the worst case of that bug. The default here is
     therefore `tone="panel"`, not transparent.
   · Cells stretch to a common height. A wall whose cards are three different
     heights per row reads as debris, and the kit's every drawing of it is a
     flush grid.
   · Focus is one global rule (tokens.css §8). The grid holds no control.
   · No product vocabulary. These are CARDS about RECORDS.

   RENDERING CONTEXT
   No `"use client"`. It forwards props and a ref, holds no state, calls no
   hook and creates no handler during its own render.
   ========================================================================= */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { Skeleton } from "../skeleton/skeleton";
import { CollectionRegister } from "../collection-frame/collection-frame";

/* ----------------------------------------------------------------------------
   The column ladders.

   Written out rather than interpolated, because Tailwind compiles the class
   names it can SEE: a template string like `lg:grid-cols-${n}` produces no
   rule at all and the wall silently collapses to one column. Three
   breakpoints, three entries each.
   ------------------------------------------------------------------------- */
const COLUMNS = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
} as const;

export type CardGridColumns = keyof typeof COLUMNS;

const cardGridVariants = cva(["grid min-w-0 items-stretch"], {
  variants: {
    /** The gap between cells. `--space-3` is the token table's own card grid gap. */
    gap: {
      default: "gap-3",
      /** The kit's view-03 figure, snapped to the ladder's half-step. */
      compact: "gap-[var(--space-2h)]",
      /** The kit's chapter-18 figure, snapped to the ladder's half-step. */
      loose: "gap-[var(--space-3h)]",
    },
    /**
     * The ground the wall is drawn on. **`bare` IS THE DEFAULT** — see
     * `defaultVariants` below — because CH19 view 03 draws the cards straight
     * on the frame's soft paper with no wall band behind them, and a wall
     * inside a `CollectionFrame` already has its ground. `panel` is for a
     * wall standing on the PAGE, where a `--card` cell measures 1.000 against
     * the page tone and would be held up by its shadow alone (PATTERN §11).
     * This comment said "`panel` is the default" and had not been true since
     * the default was moved; corrected 2026-08-24, no behaviour change.
     */
    tone: {
      /** Soft paper, with the wall's own inset. */
      panel: "rounded-[var(--radius)] bg-surface-panel p-6 lg:p-[var(--space-7)]",
      /** No ground and no inset — for a wall already inside a `CollectionFrame`. */
      bare: "",
    },
  },
  defaultVariants: { gap: "default", tone: "bare" },
});

export interface CardGridProps
  extends React.ComponentPropsWithoutRef<"div">,
    VariantProps<typeof cardGridVariants> {
  /**
   * How many columns the wall reaches at DESKTOP. Mobile is always one and
   * tablet is always two; see the breakpoint note. Ignored when `fluid`.
   */
  columns?: CardGridColumns;
  /**
   * Let the wall choose its own column count from the cell width, the way
   * chapter 18's strips do (`repeat(auto-fit, minmax(…, 1fr))`). Use this
   * where the cell has a natural minimum — a figure, a mark and a line — and
   * the fixed ladder would leave one card stranded on its own row.
   */
  fluid?: boolean;
  /**
   * The narrowest a cell may be before the wall drops a column. Only read
   * when `fluid`. The kit's two figures are 210 and 300; the default is the
   * smaller, which is the one that survives a phone.
   */
  minItemWidth?: string;
  /** Render as a list, where the wall really is one. The cells stay `div`s. */
  as?: "div" | "ul";

  /** The wall has not arrived. Cold cache only. */
  loading?: boolean;
  /** How many placeholder cells to draw while `loading`. */
  loadingCells?: number;
  /** The request failed. Beats `empty`. */
  error?: boolean;
  /** Force the empty register even with children present. */
  empty?: boolean;
  loadingState?: React.ReactNode;
  emptyState?: React.ReactNode;
  errorState?: React.ReactNode;
  loadingLabel?: string;
  emptyLabel?: string;
  emptyBody?: string;
  errorLabel?: string;
  errorBody?: string;
  /** Accessible name for the wall as a whole. */
  label?: string;
}

/**
 * A wall of record cards.
 *
 * TEN STATES
 *  1. default        — a flush grid of equal-height cells at the token gap.
 *  2. hover          — belongs to the CELL, not to the wall. A `Card` that is
 *                      a target takes `interactive`, which gives it `--accent`
 *                      and motion.css's `motion-hover-lift`. A grid that
 *                      washed under the pointer would light rows the reader
 *                      is not pointing at.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the control's own radius. The wall sets no
 *                      `overflow: hidden`, so a focused card shows its ring in
 *                      full rather than having the corners shaved off.
 *  4. active/pressed — belongs to the cell, or to the link wrapping it.
 *  5. disabled       — does not apply. A wall is a layout. An unavailable
 *                      record disables its own controls and keeps its paper;
 *                      dimming a cell would be an opacity, which is a
 *                      rejection.
 *  6. loading        — `loading`: `Skeleton variant="card"` in the same grid,
 *                      so the placeholder wall is the shape of the real one
 *                      and nothing reflows when the data lands. Cold cache
 *                      only, per the kit's third loading tier.
 *  7. empty          — no children, or `empty`: the quiet register, spanning
 *                      the whole grid. NOT `null` — a search that matched
 *                      nothing must say so, and the register is where the one
 *                      next step lives.
 *  8. error          — `error`: the register with a poppy dot and its own
 *                      wording, also spanning the grid. Beats `empty`: a
 *                      request that failed has not come back empty.
 *  9. selected       — belongs to the cell. The kit draws no selected card
 *                      (logged in GAPS-F CRD-3 against `Card` itself), and a
 *                      grid may not invent one on its behalf.
 * 10. read-only      — always. A layout holds no value.
 *
 * THREE BREAKPOINTS — and here the answer is the whole component.
 *  · mobile (base) — ONE column. Two cards side by side at 320 leaves 150 a
 *    card, which is narrower than the 24 mark plus a two-word name, and the
 *    kit's own status pill would wrap inside every cell.
 *  · tablet (`sm:`, 40rem) — TWO columns, at every `columns` setting. 640
 *    carries two of the kit's 210-wide cells with the page inset left over;
 *    three would put them under the 210 minimum the chapter-18 strip states.
 *  · desktop (`lg:`, 64rem) — `columns` columns: 2, 3 or 4. Four is the kit's
 *    view-03 figure and three is its gallery figure; both are drawn, so both
 *    are offered and neither is imposed. With `fluid` the count is computed
 *    from `minItemWidth` instead and no breakpoint is used at all — the wall
 *    reflows continuously, which is what `auto-fit` is for.
 *  The wall's own inset follows `Card`'s: 24 to `lg:`, 32 above, so a wall and
 *  a card inside it stay in register.
 *
 * RTL — safe, and unused: the system is LTR only. A grid's column order
 * follows the writing direction on its own and nothing here names a side.
 */
const CardGrid = React.forwardRef<HTMLDivElement, CardGridProps>(
  (
    {
      className,
      gap = "default",
      tone = "bare",
      columns = 3,
      fluid = false,
      minItemWidth = "13.125rem",
      as = "div",
      loading = false,
      loadingCells = 6,
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
      label,
      children,
      ...props
    },
    ref,
  ) => {
    /* Narrowed for the ref: `ul` and `div` do not share one element type, and
       the root is the same box either way. */
    const Root = as as "div";
    const cells = React.Children.toArray(children);

    /* Exclusive states resolved in JS (PATTERN §4): loading beats error beats
       empty. */
    const state = loading
      ? "loading"
      : error
        ? "error"
        : cells.length === 0 || empty
          ? "empty"
          : "default";

    /* `auto-fit` needs a real length in the template, which no utility can
       express because the length is a prop. It is a rem string, never a px —
       the default is the kit's 210 at the 16 authoring base. */
    const fluidStyle = fluid
      ? { gridTemplateColumns: `repeat(auto-fit, minmax(min(${minItemWidth}, 100%), 1fr))` }
      : undefined;

    /* A register is one cell that must cover the whole wall, or it sits in
       column one with empty columns beside it. */
    const register = (node: React.ReactNode) => (
      <div className="col-span-full min-w-0">{node}</div>
    );

    return (
      <Root
        ref={ref as React.Ref<HTMLDivElement>}
        data-slot="card-grid"
        data-state={state}
        aria-busy={loading || undefined}
        aria-label={label}
        style={{ ...fluidStyle, ...props.style }}
        className={cn(
          cardGridVariants({ gap, tone }),
          !fluid && COLUMNS[columns],
          // Every cell fills its row's height, so the wall is flush.
          "[&>*]:h-full",
          className,
        )}
        {...props}
      >
        {state === "loading"
          ? (loadingState ??
            Array.from({ length: loadingCells }, (_, i) => (
              <Skeleton
                key={i}
                variant="card"
                label={loadingLabel}
                /* Only the first placeholder announces. Six voices saying
                   "Loading" at once is worse than one. */
                announce={i === 0}
                className="h-[9rem]"
              />
            )))
          : null}

        {state === "error"
          ? register(
              errorState ?? (
                <CollectionRegister tone="error" eyebrow={errorLabel} body={errorBody} />
              ),
            )
          : null}

        {state === "empty"
          ? register(
              emptyState ?? (
                <CollectionRegister tone="quiet" eyebrow={emptyLabel} body={emptyBody} />
              ),
            )
          : null}

        {state === "default" ? children : null}
      </Root>
    );
  },
);

CardGrid.displayName = "CardGrid";

export { CardGrid, cardGridVariants };
