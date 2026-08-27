"use client";

/* ============================================================================
   Donut — a whole split into segments, a legend beside it, an optional
   number inside the ring (0 direct call sites; a body swap for
   `CollectionFrame`, and chapter 18/19's own data-display figure).

   DESIGN SOURCE
   Two drawings, both the kit's own, and neither is a skin of the other:

     · Kit chapter 19 ("Collection views · 24 view types · one toolbar
       contract"), view 19's own chart specimen, the "Donut — ticket status
       split" card: an SVG ring built from `<circle>` strokes with
       `stroke-dasharray` / `stroke-dashoffset`, and a column beside it —
       a dot then a label, one row per segment. NO number inside the ring.
     · Kit chapter 18 ("Data display"), the "Share of hours" card: the same
       ring (there, a CSS `conic-gradient`) with a NUMBER CENTRED INSIDE it
       — `312h` — and the same dot-then-label column beside it, but with a
       PERCENTAGE printed after each label ("Build 42%").

   This file draws the union of the two: chapter 19's ring-plus-legend
   structure, chapter 18's centre label AND its per-row percentage — because
   both are the kit's own and nothing here is invented. `centerLabel` is
   optional so a caller can draw either reading; `showPercent` defaults to
   on, matching chapter 18's own drawing (the fuller of the two specimens).

   Client's reference screenshots asked for exactly this pairing: "ring with
   legend + percentages beside it, AND a variant with a number/unit centred
   inside the ring." Both are this same component with `centerLabel` present
   or absent — never two components, because the ring, the legend and the
   colours are one drawing whichever way it is read.

   COLOUR. `--chart-1..5`, chart.tsx's own sequence and in the same order —
   never a literal hex, unlike both artifact drawings, which hardcode
   `#1F9259` / `#89BCE6` / `var(--poppy)` plus a bare `rgba(...,.12)` for an
   "Other" slice. The literals are read as instructions to use the DATA
   palette in its stated order, not as licence to reach for raw hex here;
   `--chart-4` and `--chart-5` carry the same placeholder gap chart.tsx logs
   (GAPS-COL1 CHT-1) — a five-segment donut will show two indistinguishable
   slices until the palette gains two more data colours.

   RECHARTS, NOT HAND-ROLLED SVG. `chart.tsx` already depends on recharts for
   bar/line/area; `Pie` is the same library's ring primitive and needs no
   second dependency. THE ARRAY-NOT-FRAGMENT TRAP APPLIES HERE TOO — see
   `chart.tsx`'s own header for the full account of why recharts' internal
   `toArray` silently drops a React 19 fragment. Nothing here hands recharts
   a fragment; the legend is drawn OUTSIDE the `<PieChart>`, in plain JSX,
   because chapter 18 and 19 both draw it as ordinary rows beside the ring,
   never as a recharts `<Legend>`.

   THE LAW THIS FILE OBEYS
   · No colour reaches the ring except `--chart-1..5`. Mango is a fill, never
     a data colour (tokens.css is explicit), so an "Other / uncategorised"
     slice takes `--hair-strong` — a neutral ink wash, not a sixth data hue.
   · The centre label is optional and unstyled beyond the kit's own size —
     `text-sm font-medium`, chapter 18's own `13px / 500` — and takes
     whatever node the caller passes; a component may not decide what a
     figure is measuring.
   · The legend dot is 9px (`0.5625rem`), the same size `chart.tsx`'s
     `LegendRow` and `tiles.tsx` already use for a chart key. Nothing here
     invents a second dot size for the same idea.
   · Every value is tabular where it is a number.
   · Focus is one global rule; the ring is not a control and draws no ring
     of its own (the pun is the artifact's, not this comment's).

   RENDERING CONTEXT
   `"use client"`. recharts measures the DOM.
   ========================================================================= */

import * as React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { cn } from "../../lib/utils";
import { CollectionRegister } from "../collection-frame/collection-frame";

/** Mirrors `chart.tsx`'s `SERIES_COLOURS` exactly — same order, same GAPS-
 *  COL1 CHT-1 hole at 4 and 5. Not imported, because `chart.tsx` does not
 *  export it; duplicated rather than reached for privately across a module
 *  boundary that was never made public. */
const SEGMENT_COLOURS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

/** The "Other / uncategorised" reading — a neutral ink wash, never a sixth
 *  data hue and never mango. */
const OTHER_COLOUR = "var(--hair-strong)";

export interface DonutSegment {
  /** Stable key. */
  id: string;
  /** What the legend row says. */
  label: React.ReactNode;
  /** The raw measure. Percentages are derived from the whole, not supplied. */
  value: number;
  /**
   * Override the colour. Must be a token reference. Defaults to
   * `--chart-1..5` by position; pass `OTHER_COLOUR`'s own token,
   * `"var(--hair-strong)"`, for an explicit "everything else" slice.
   */
  color?: string;
}

export interface DonutProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  data?: DonutSegment[];
  /**
   * The ring's own diameter. A rem string, never px — the applications move
   * the root text size and a fixed-pixel ring would fall out of register
   * with the legend beside it. Chapter 18's own drawing is 108 at the 16px
   * authoring root, which is `6.75rem`.
   */
  size?: string;
  /**
   * A node centred inside the hole — chapter 18's `312h`. Undefined draws
   * chapter 19's plainer ring, with nothing in the middle.
   */
  centerLabel?: React.ReactNode;
  /** Draw the dot-and-label column. Chapter 19 and 18 both draw one. */
  legend?: boolean;
  /**
   * Print each row's share of the whole, chapter 18's own "Build 42%".
   * Defaults on; a caller reading chapter 19's plainer legend passes false.
   */
  showPercent?: boolean;
  /** How a segment's raw value is spelled in a screen reader's summary. */
  formatValue?: (value: number) => string;

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

  /** Accessible name for the figure. */
  label?: string;
  /** The sentence a screen reader is given instead of the picture. No
   *  default — only the caller knows what the split says (PATTERN §7). */
  summary?: string;
}

/**
 * A whole split into segments: a ring, a legend, and — optionally — a number
 * centred in the hole.
 *
 * TEN STATES
 *  1. default        — the ring and, unless turned off, its legend.
 *  2. hover          — none drawn. recharts' own `Pie` ships an active-shape
 *                      hover by default; it is switched off here (chapter 18
 *                      and 19 draw no hover state on either specimen) rather
 *                      than left to invent one this kit never specified.
 *  3. focus-visible  — not here; the SVG is not focusable. Same limitation
 *                      `chart.tsx` logs as GAPS-COL1 CHT-5, and the same
 *                      answer: `summary` carries the reading for a screen
 *                      reader, and a composition that needs the numbers
 *                      keyboard-reachable puts a table beside the ring.
 *  4. active/pressed — does not apply. A donut is read, not pressed.
 *  5. disabled       — does not apply, for the same reason a chart has none.
 *  6. loading        — `loading`: a round `Skeleton` at the ring's own size,
 *                      so nothing reflows when the split lands.
 *  7. empty          — no segments, every value zero, or `empty`: the quiet
 *                      register in the ring's place.
 *  8. error          — `error`: the poppy-dot register. Beats `empty`.
 *  9. selected       — does not apply; a donut has no selection of its own.
 * 10. read-only      — always.
 *
 * THREE BREAKPOINTS — unchanged at all three. The ring is a fixed `size`
 * and the legend wraps under it on a narrow measure by ordinary flex-wrap;
 * chapter 18 and 19 both draw the pairing at one width and state nothing
 * about it changing at another.
 *
 * RTL — safe. The ring has no reading direction and the legend's row order
 * is DOM order, not a physical side.
 */
const Donut = React.forwardRef<HTMLDivElement, DonutProps>(
  (
    {
      className,
      data,
      size = "6.75rem",
      centerLabel,
      legend = true,
      showPercent = true,
      formatValue,
      loading = false,
      error = false,
      empty = false,
      loadingState,
      emptyState,
      errorState,
      loadingLabel = "Loading…",
      emptyLabel = "Nothing here",
      emptyBody = "There is nothing to split for this period.",
      errorLabel = "Figures unavailable",
      errorBody = "We can’t show this right now. Try again in a moment.",
      label,
      summary,
      ...props
    },
    ref,
  ) => {
    const segments = data ?? [];
    const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);

    const state = loading
      ? "loading"
      : error
        ? "error"
        : segments.length === 0 || total <= 0 || empty
          ? "empty"
          : "default";

    const colourFor = (segment: DonutSegment, index: number) =>
      segment.color ?? SEGMENT_COLOURS[index % SEGMENT_COLOURS.length];

    const percentOf = (value: number) =>
      total > 0 ? Math.round((value / total) * 100) : 0;

    return (
      <div
        ref={ref}
        data-slot="donut"
        data-state={state}
        aria-busy={loading || undefined}
        aria-label={label}
        className={cn("flex min-w-0 items-center gap-[var(--space-4)]", className)}
        {...props}
      >
        {summary ? <span className="sr-only">{summary}</span> : null}

        <div
          className="relative shrink-0"
          style={{ width: size, height: size }}
        >
          {state === "loading" ? (
            loadingState ?? (
              /* `Skeleton`'s five variants are a bar, a card block, media at
                 16/9, and two composites — none of them a ring, and a bar
                 forced into a circle with an override className is a merge
                 outcome to trust rather than a shape this file draws on
                 purpose. So the ring's own pulse is drawn directly, with the
                 same fill `Skeleton` itself pulses — `--surface-quiet`,
                 Tailwind's own `animate-pulse` — rather than inventing a
                 second placeholder idiom. */
              <div
                role="status"
                aria-live="polite"
                aria-label={loadingLabel}
                className="size-full rounded-pill bg-surface-quiet animate-pulse motion-reduce:animate-none"
              />
            )
          ) : state === "error" || state === "empty" ? null : (
            <>
              {/* AN ARRAY, NEVER A FRAGMENT — see the file header. `Pie` walks
                  its own `data` prop rather than JSX children, so the trap
                  does not apply to the segments themselves, but `PieChart`
                  still resolves ITS children the same fragile way `chart.tsx`
                  documents; a bare `<Pie>` here is already an array of one
                  and needs no wrapping. */}
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={segments as unknown as Record<string, unknown>[]}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius="66%"
                    outerRadius="100%"
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {segments.map((s, i) => (
                      <Cell key={s.id} fill={colourFor(s, i)} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {centerLabel !== undefined ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-[var(--font-weight-medium)] tabular-nums text-foreground">
                    {centerLabel}
                  </span>
                </div>
              ) : null}
            </>
          )}
        </div>

        {state === "error" ? (
          errorState ?? (
            <CollectionRegister tone="error" eyebrow={errorLabel} body={errorBody} />
          )
        ) : state === "empty" ? (
          emptyState ?? (
            <CollectionRegister tone="quiet" eyebrow={emptyLabel} body={emptyBody} />
          )
        ) : legend && state === "default" ? (
          <div className="flex min-w-0 flex-col gap-[var(--space-2)]">
            {segments.map((s, i) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-[var(--space-2)] text-caption text-ink-secondary"
              >
                <span
                  aria-hidden="true"
                  /* 9 — the same chart-key dot chart.tsx's LegendRow and
                     tiles.tsx already draw at. */
                  className="size-[0.5625rem] shrink-0 rounded-pill"
                  style={{ background: colourFor(s, i) }}
                />
                <span className="min-w-0 truncate">{s.label}</span>
                {showPercent ? (
                  <span className="tabular-nums text-ink-tertiary">
                    {percentOf(s.value)}%
                  </span>
                ) : null}
                {formatValue ? (
                  <span className="ms-auto tabular-nums text-ink-tertiary">
                    {formatValue(s.value)}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  },
);

Donut.displayName = "Donut";

export { Donut };
