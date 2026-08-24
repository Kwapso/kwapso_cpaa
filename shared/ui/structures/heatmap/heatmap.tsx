/* ============================================================================
   Heatmap — collection view 16, "density per record per week" (0 direct call
   sites; a body swap for `CollectionFrame`).

   DESIGN SOURCE
   Kit chapter 19 ("Collection views · 24 view types · one toolbar contract"),
   view 16, read out of `Design Mothership/kit-current/Kwapso UI Kit.dc.html`.
   The chapter's own line for it, verbatim from the view table:

       heatmap · "Density per record per week" · fits "Where the work went"
                · switch label "Heat"

   and the contract the whole chapter is built on, also verbatim:

       "Every view carries the same contract: search, filters, three actions,
        view switch. Only the body below the toolbar changes."

   So this file is a BODY and nothing else. It draws no toolbar, no pager and
   no heading; `CollectionFrame` owns all three and this sits inside its one
   panel (ruling J2, override register #11).

   THE DRAWING, transcribed
     · header strip — `grid-template-columns: 150px repeat(12, 1fr)`,
       `gap: 6px`, `padding: 4px 12px 8px`, week labels 10px tertiary,
       tabular
     · a row     — the same template and gap, `align-items: center`,
       `padding: 4px 12px`, the record name at 13px
     · a cell    — `height: 22px`, a fill from the ramp, nothing else: no
       label, no stroke, no hover of its own

   THE MANGO TRAP
   Ruling 26 and chapter 2 rule mango a brand fill and never a data colour.
   This view and `PulseBand` are the two the artifact exempts, by name — kit
   ch17 calls the ramp "the mango ramp from the heat map" and gives its four
   steps. `heat-scale.css` carries them and says the rest. No third component
   may read `--heat-*`.

   THE RADIUS, AND A CONFLICT RESOLVED
   Ruling 03 states the law in full: "24px on every box, 999px on every pill,
   6px on marks and selection controls, 4px on a bar, a heat cell or the
   rotated decision node". The chapter-19 drawing predates it and gives the
   cell `border-radius: 24px` — the same drawing gives its chart bars 24 as
   well, which ruling 03 also overturns ("a bar is not a box"). The ruling
   wins, `tokens.css` already named the value `--radius-sm` / `--radius-bar`
   "bars, heat cells, nodes", and the conflict is logged rather than silently
   corrected: GAPS-TRACK2B HM-4.

   THE LAW THIS FILE OBEYS
   · A ramp is FOUR FILLS, never four alphas of one colour. There is no
     opacity anywhere in this file, in any state.
   · The empty step is a fill too — `--heat-empty`, the quiet well — so a
     week with no work is drawn rather than left as a hole in the strip.
   · Colour here means QUANTITY, not status. Nothing in this file takes
     forest, sky or poppy, and no cell means "blocked".
   · Colour is never the only carrier. Every cell has a text alternative
     built by `cellLabel`, so the strip is readable by a screen reader and by
     a reader who cannot separate the two lightest steps.
   · No `border`. The strip separates by colour, as ch13 demands.
   · Focus is one global rule (tokens.css §8). This body holds no control.
   · No product vocabulary: records and columns, not apps and weeks.

   RENDERING CONTEXT
   No `"use client"`. It forwards props and a ref, holds no state, calls no
   hook and creates no handler during its own render.
   ========================================================================= */

import * as React from "react";

import { cn } from "../../lib/utils";
import { Skeleton } from "../../controls/skeleton/skeleton";
import { CollectionRegister } from "../collection-frame/collection-frame";

/* The four steps and the empty step. A token block that owes itself to
   tokens.css — see the file's own header. */
/* ----------------------------------------------------------------------------
   The ramp, as five named fills.

   Written as a lookup rather than interpolated into a class, because Tailwind
   compiles the class names it can SEE: `bg-[var(--heat-${n})]` produces no
   rule at all and every cell renders transparent.
   ------------------------------------------------------------------------- */
const HEAT_FILL = {
  /** "the quiet fill for a day with nothing" (ch17). */
  0: "bg-[var(--heat-empty)]",
  1: "bg-[var(--heat-1)]",
  2: "bg-[var(--heat-2)]",
  3: "bg-[var(--heat-3)]",
  4: "bg-[var(--heat-4)]",
} as const;

/**
 * How much work a cell carries: `0` is none — the empty step — and `1` to `4`
 * are the four steps of the ramp, lightest to heaviest. There is no fifth
 * step; ch17 says so in as many words.
 */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/** The four steps and the empty one, exported so a call site can bucket its own figures. */
export const HEAT_LEVELS = [0, 1, 2, 3, 4] as const;

export interface HeatmapRow {
  /**
   * React key. Required, because a strip is re-sorted whenever the toolbar
   * sorts the collection and a positional key would carry the wrong record's
   * density over.
   */
  id: string;
  /** The record's name — the first column, at the caption step. */
  name: React.ReactNode;
  /**
   * One level per column, in column order. Short rows are padded with the
   * empty step so every strip is the same length: a strip that stopped early
   * would read as "less work", not "no data".
   */
  cells: HeatLevel[];
}

export interface HeatmapProps extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  /** The records, one strip each, in the order they should read. This view never sorts. */
  rows?: HeatmapRow[];
  /**
   * The column headings — the artifact's twelve week numbers. Their COUNT is
   * the grid's count; a row with more cells than there are columns is cut,
   * and one with fewer is padded.
   */
  columns?: React.ReactNode[];
  /**
   * How wide the record-name column is. The artifact's figure is 150 at the
   * 16 authoring base. rem only — a collection of long names passes its own
   * measure rather than letting every name wrap to three lines.
   */
  nameWidth?: string;
  /**
   * The narrowest a cell may be drawn before the strip scrolls instead of
   * squeezing. `--space-4` is the token table's own 16 and is the smallest
   * square that still reads as a step rather than a tick.
   */
  cellMinWidth?: string;

  /**
   * The words behind a cell, for a screen reader and for the pointer's title.
   * A function, not a template, because the sentence's word order changes per
   * language. Colour never carries the meaning alone (ruling 26).
   */
  cellLabel?: (args: {
    row: HeatmapRow;
    column: React.ReactNode;
    columnIndex: number;
    level: HeatLevel;
  }) => string;
  /** The five step names, used by the default `cellLabel`, lightest first. */
  levelLabels?: [string, string, string, string, string];

  /** Accessible name for the strip as a whole. */
  label?: string;

  /** The strip has not arrived. Cold cache only. */
  loading?: boolean;
  /** How many placeholder strips to draw while `loading`. */
  loadingRows?: number;
  /** The request failed. Beats `empty`. */
  error?: boolean;
  /** Force the empty register even with rows present. */
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
 * Density per record per column.
 *
 * TEN STATES
 *  1. default        — one strip per record, one fill per cell, at the ramp.
 *  2. hover          — NONE, deliberately. A cell is a reading, not a target;
 *                      the artifact draws no hover on it and a strip that lit
 *                      under the pointer would suggest the cell can be
 *                      pressed. The value is already on the cell as its
 *                      `title`.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the control's own radius. This body holds no
 *                      control: nothing in it is focusable.
 *  4. active/pressed — does not apply, for the same reason as hover.
 *  5. disabled       — does not apply. A reading cannot be unavailable. A
 *                      record with no work is the EMPTY STEP, which is a
 *                      fill; it is never a dimmed strip, because dimming is
 *                      an opacity and an opacity is a rejection.
 *  6. loading        — `loading`: `Skeleton` bars in the same grid, so the
 *                      placeholder is the shape of the real strip and nothing
 *                      reflows when the data lands.
 *  7. empty          — no rows, or `empty`: the quiet register in place of
 *                      the strip. NOT `null` — a filter that matched nothing
 *                      must say so.
 *  8. error          — `error`: the register with a poppy dot and its own
 *                      wording. Beats `empty`: a request that failed has not
 *                      come back empty.
 *  9. selected       — does not apply. The artifact draws no selected cell
 *                      and no selected strip, and this view may not invent
 *                      one. Selection in a collection belongs to the row
 *                      views.
 * 10. read-only      — always. A heat map is a reading and holds no value.
 *
 * THREE BREAKPOINTS, and the 380 answer
 *  · mobile (base) — the strip SCROLLS. Twelve columns and a 150 name column
 *    need about 26rem before a cell is narrower than `cellMinWidth`, so at
 *    380 the body scrolls sideways inside its own box and the panel around it
 *    does not. Every cell keeps its drawn height, and the name column keeps
 *    its measure: a heat map whose cells have collapsed to hairlines is not a
 *    smaller heat map, it is an unreadable one. The kit states no narrow
 *    behaviour for this view at all — logged as GAPS-TRACK2B HM-5, and this
 *    is the reading that changes none of its drawn figures.
 *  · tablet (`sm:`) / desktop (`lg:`) — UNCHANGED, and by then the grid fits
 *    without scrolling. The columns are `1fr` and share whatever width there
 *    is, exactly as drawn.
 *
 * RTL — safe, and unused: the system is LTR only (ruling 10). Every inset is
 * logical and the grid's column order follows the document.
 */
const Heatmap = React.forwardRef<HTMLDivElement, HeatmapProps>(
  (
    {
      className,
      rows = [],
      columns = [],
      nameWidth = "9.375rem",
      cellMinWidth = "var(--space-4)",
      cellLabel,
      levelLabels = ["No work", "Light", "Some", "Heavy", "Heaviest"],
      label,
      loading = false,
      loadingRows = 6,
      error = false,
      empty = false,
      loadingState,
      emptyState,
      errorState,
      loadingLabel = "Loading…",
      emptyLabel = "Nothing here",
      emptyBody = "No work has been recorded against these records yet.",
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
        : rows.length === 0 || columns.length === 0 || empty
          ? "empty"
          : "default";

    /* The grid template is a prop and a count, which no utility can express:
       Tailwind cannot see either value. Same reasoning as `CardGrid`'s
       `auto-fit` template. rem and tokens only, never a px. */
    const template = {
      gridTemplateColumns: `${nameWidth} repeat(${columns.length}, minmax(${cellMinWidth}, 1fr))`,
    } satisfies React.CSSProperties;

    const describe =
      cellLabel ??
      (({ row, column, level }: { row: HeatmapRow; column: React.ReactNode; level: HeatLevel }) =>
        `${typeof row.name === "string" ? row.name : ""} ${
          typeof column === "string" ? column : ""
        } — ${levelLabels[level]}`.trim());

    return (
      <div
        ref={ref}
        data-slot="heatmap"
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

        {state === "loading"
          ? (loadingState ?? (
              <div className="flex flex-col gap-1" role="status" aria-label={loadingLabel}>
                {Array.from({ length: loadingRows }, (_, i) => (
                  <Skeleton
                    key={i}
                    className="h-[1.375rem]"
                    /* Only the first placeholder announces. Six voices saying
                       "Loading" at once is worse than one. */
                    announce={i === 0}
                    label={loadingLabel}
                  />
                ))}
              </div>
            ))
          : null}

        {state === "default" ? (
          /* The one scroller. `overflow-x` here and not on the panel, so a
             narrow reader moves the strip and not the whole collection. */
          <div className="min-w-0 overflow-x-auto">
            <div className="min-w-max">
              {/* The column headings. `padding: 4px 12px 8px`, as drawn. */}
              <div
                data-slot="heatmap-columns"
                aria-hidden="true"
                className="grid gap-[var(--space-1h)] px-3 pt-1 pb-2 text-micro text-ink-tertiary tabular-nums"
                style={template}
              >
                <span />
                {columns.map((column, i) => (
                  <span key={i} className="min-w-0 truncate">
                    {column}
                  </span>
                ))}
              </div>

              {rows.map((row) => (
                <div
                  key={row.id}
                  data-slot="heatmap-row"
                  className="grid items-center gap-[var(--space-1h)] px-3 py-1"
                  style={template}
                >
                  <span className="min-w-0 truncate text-caption">{row.name}</span>

                  {columns.map((column, columnIndex) => {
                    const level = row.cells[columnIndex] ?? 0;
                    const words = describe({ row, column, columnIndex, level });

                    return (
                      <span
                        key={columnIndex}
                        data-slot="heatmap-cell"
                        data-level={level}
                        title={words}
                        /* The strip is a list of readings, not a table of
                           controls: each cell states its own value in words
                           so the ramp is never the only carrier. */
                        role="img"
                        aria-label={words}
                        className={cn(
                          "h-[1.375rem] rounded-[var(--radius-bar)]",
                          HEAT_FILL[level],
                        )}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  },
);

Heatmap.displayName = "Heatmap";

export { Heatmap, HEAT_FILL };
