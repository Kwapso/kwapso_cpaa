"use client";

/* ============================================================================
   Radar — multi-axis comparison, two or more series overlaid (0 direct call
   sites; chapter 19's own "Radar — team coverage" chart-view card).

   DESIGN SOURCE
   Kit chapter 19 ("Collection views · 24 view types · one toolbar
   contract"), view 19's chart specimen, the "Radar — team coverage" card:

       <svg viewBox="0 0 140 130">
         <polygon points="{{ radarAxes }}" stroke="rgba(26,25,24,.10)"/>
         <polygon points="{{ radarAxesMid }}" stroke="rgba(26,25,24,.10)"/>
         <polygon points="{{ radarShape }}" fill="#89BCE6" fill-opacity="0.35"
                  stroke="#89BCE6" stroke-width="2"/>
         <circle ... /> (one per axis, the series' own dots)
         <text ...>{{ rl.text }}</text> (one per axis, the axis labels)
       </svg>
       legend: one dot, "Coverage · this quarter"

   ONE SERIES IN THE ARTIFACT, TWO OR MORE IN THE BRIEF — RECONCILED, NOT
   CONTRADICTED. The specimen draws a single shape at `fill-opacity="0.35"`,
   because one shape never overlaps itself. The brief asks for 2+ series
   overlaid, which the artifact never had to draw and so never priced: two
   shapes at 0.35 read as mud where they cross. This file keeps 0.35 as the
   DEFAULT for the reading the artifact actually shows — one series — and
   exposes `fillOpacity` per series for a caller drawing several, where a
   lower figure (the client's own reference states 0.15–0.2 for exactly this
   case) keeps every overlap legible. Nothing here picks 0.15–0.2 as the
   default, because that number belongs to a drawing the artifact does not
   contain; a caller comparing several teams passes it explicitly.

   RECHARTS' `RadarChart`, NOT HAND-ROLLED SVG. `chart.tsx` already
   depends on recharts for the other three shapes; `RadarChart` /
   `PolarGrid` / `PolarAngleAxis` / `Radar` are the same library's polar
   primitives, and a pentagon of manually-computed points would be a second,
   competing way to draw the one thing recharts already draws correctly.
   THE ARRAY-NOT-FRAGMENT TRAP FROM `chart.tsx` APPLIES HERE TOO — the
   furniture passed to `<RadarChart>` is an array of keyed elements, never a
   fragment, for the exact reason that file's header explains at length.

   THE GRID'S COLOUR IS A REPORTED GAP. The artifact's two background
   polygons are `rgba(26,25,24,.10)` — 10% ink, and tokens.css has no 10%
   step (6, 8 and 20 exist; see `kpi-progress.tsx`'s header for the same
   finding on the same value). `--hair` (8%) is used here, the closer token,
   logged rather than invented.

   THE LAW THIS FILE OBEYS
   · Every series takes `--chart-1..5` by position, or an explicit override
     — never mango; several series overlaid is still a measurement, not a
     brand fill, and the artifact's own single series is `#89BCE6`, which is
     `--chart-1` (sky) read as a token instead of a literal.
   · The legend is dot-then-label, chapter 19's own "Coverage · this
     quarter" row, drawn BELOW the shape — the client's own instruction —
     rather than beside it, which is where chapter 18's donut puts its
     column; two different figures, two different legend positions, neither
     invented.
   · Axis labels take `--ink-tertiary`, chapter 19's own quiet ink.
   · Focus is one global rule; a radar is read, not pressed.

   RENDERING CONTEXT
   `"use client"`. recharts measures the DOM.
   ========================================================================= */

import * as React from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  Radar as RechartsRadar,
  RadarChart as RechartsRadarChart,
  ResponsiveContainer,
} from "recharts";

import { cn } from "../../lib/utils";
import { CollectionRegister } from "../collection-frame/collection-frame";

const SERIES_COLOURS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export interface RadarSeries {
  /** The key each axis row carries this series' value under. */
  key: string;
  label?: React.ReactNode;
  color?: string;
  /**
   * The filled shape's opacity, 0–1. Defaults to the artifact's own 0.35
   * for a single series; a caller overlaying several passes something in
   * 0.15–0.2 so the overlaps stay legible. See the file header.
   */
  fillOpacity?: number;
}

export interface RadarProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  /** One row per axis. `axis` is the label; each series reads its own key. */
  data?: Array<{ axis: string } & Record<string, unknown>>;
  series?: RadarSeries[];
  /**
   * How tall the plot is. A rem string, never px — see `chart.tsx`'s own
   * `height` prop for the identical reasoning.
   */
  height?: string;
  legend?: boolean;

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

  label?: string;
  /** The sentence a screen reader is given instead of the picture. No
   *  default — only the caller knows what the comparison says. */
  summary?: string;
}

/**
 * A multi-axis comparison: two or more series overlaid on the same spokes.
 *
 * TEN STATES
 *  1. default        — the grid, the axis labels, every series' shape and,
 *                      unless turned off, the legend.
 *  2. hover          — none drawn, the same ruling `donut.tsx` makes: the
 *                      artifact states no hover for this card and none is
 *                      invented for it.
 *  3. focus-visible  — not here; the SVG is not focusable. `summary` carries
 *                      the reading, the same limitation `chart.tsx` logs
 *                      (GAPS-COL1 CHT-5).
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply.
 *  6. loading        — `loading`: a square `Skeleton`-style pulse at the
 *                      plot's own height.
 *  7. empty          — no axes, no series, or `empty`: the quiet register.
 *  8. error          — `error`: the poppy-dot register. Beats `empty`.
 *  9. selected       — does not apply.
 * 10. read-only      — always.
 *
 * THREE BREAKPOINTS — unchanged at all three, the same ruling `chart.tsx`
 * gives for its own three shapes: a radar chart's geometry describes a
 * fixed relationship between axes, and stretching it at a wider viewport
 * would change what the same data says.
 *
 * RTL — safe. The polygon has no reading direction; the legend row is DOM
 * order.
 */
const Radar = React.forwardRef<HTMLDivElement, RadarProps>(
  (
    {
      className,
      data,
      series,
      height = "16rem",
      legend = true,
      loading = false,
      error = false,
      empty = false,
      loadingState,
      emptyState,
      errorState,
      loadingLabel = "Loading…",
      emptyLabel = "Nothing here",
      emptyBody = "There is nothing to compare for this period.",
      errorLabel = "Figures unavailable",
      errorBody = "We can’t show this right now. Try again in a moment.",
      label,
      summary,
      ...props
    },
    ref,
  ) => {
    const rows = data ?? [];
    const measures = series ?? [];

    const state = loading
      ? "loading"
      : error
        ? "error"
        : rows.length === 0 || measures.length === 0 || empty
          ? "empty"
          : "default";

    const colourFor = (measure: RadarSeries, index: number) =>
      measure.color ?? SERIES_COLOURS[index % SERIES_COLOURS.length];

    /* AN ARRAY, NEVER A FRAGMENT — see `chart.tsx`'s header for the full
       account of recharts' `toArray` silently dropping a React 19 fragment. */
    const furniture = [
      <PolarGrid key="grid" stroke="var(--hair)" />,
      <PolarAngleAxis
        key="angle"
        dataKey="axis"
        tick={{ fill: "var(--ink-tertiary)", fontSize: 11 }}
      />,
    ];

    return (
      <div
        ref={ref}
        data-slot="radar"
        data-state={state}
        aria-busy={loading || undefined}
        aria-label={label}
        className={cn("flex min-w-0 flex-col gap-[var(--space-3)]", className)}
        {...props}
      >
        {summary ? <span className="sr-only">{summary}</span> : null}

        <div style={{ height }} className="min-w-0">
          {state === "loading" ? (
            loadingState ?? (
              <div
                role="status"
                aria-live="polite"
                aria-label={loadingLabel}
                className="size-full rounded-[var(--radius)] bg-surface-quiet animate-pulse motion-reduce:animate-none"
              />
            )
          ) : null}

          {state === "error" ? (
            errorState ?? (
              <CollectionRegister tone="error" eyebrow={errorLabel} body={errorBody} />
            )
          ) : null}

          {state === "empty" ? (
            emptyState ?? (
              <CollectionRegister tone="quiet" eyebrow={emptyLabel} body={emptyBody} />
            )
          ) : null}

          {state === "default" ? (
            <ResponsiveContainer width="100%" height="100%">
              <RechartsRadarChart data={rows as Record<string, unknown>[]}>
                {furniture}
                {measures.map((measure, index) => {
                  const colour = colourFor(measure, index);
                  return (
                    <RechartsRadar
                      key={measure.key}
                      dataKey={measure.key}
                      name={typeof measure.label === "string" ? measure.label : measure.key}
                      stroke={colour}
                      fill={colour}
                      fillOpacity={measure.fillOpacity ?? 0.35}
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  );
                })}
              </RechartsRadarChart>
            </ResponsiveContainer>
          ) : null}
        </div>

        {legend && state === "default" ? (
          <div
            data-slot="radar-legend"
            className="flex flex-wrap items-center justify-center gap-x-[var(--space-3h)] gap-y-2"
          >
            {measures.map((measure, index) => (
              <span
                key={measure.key}
                className="inline-flex items-center gap-2 text-caption text-ink-secondary"
              >
                <span
                  aria-hidden="true"
                  className="size-[0.5625rem] shrink-0 rounded-pill"
                  style={{ background: colourFor(measure, index) }}
                />
                {measure.label ?? measure.key}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  },
);

Radar.displayName = "Radar";

export { Radar };
