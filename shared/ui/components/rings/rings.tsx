/* ============================================================================
   Rings — a single KPI as an arc, half or full (0 direct call sites; chapter
   19's own "Half rings" and "Full rings" chart-view cards).

   MERGED 2026-08-26. Client, verbatim: "rename halfring/full ring to Rings."
   This file used to export two components, `HalfRingGauge` and
   `FullRingGauge`, and the demo listed them under one slug with the title
   "HalfRingGauge / FullRingGauge" — two names stapled together as a section
   heading. `chart.tsx` had already solved the identical shape: one component,
   a `type` prop (`"bar" | "line" | "area"`), one name, one page, several
   variants shown inside it. This file now follows that same pattern: one
   export, `Rings`, and a `variant` prop (`"half" | "full"`) in `Chart`'s own
   naming style, so a section titled "Rings" is one thing, not two.
   `HalfRingGauge` and `FullRingGauge` are gone; nothing about either shape's
   own geometry, props or behaviour changed in the merge.

   DESIGN SOURCE
   Kit chapter 19 ("Collection views · 24 view types · one toolbar
   contract"), view 19's chart specimen, the two cards headed "Half rings"
   and "Full rings" — three-then-three gauges side by side in each. Both are
   plain SVG, not a chart library primitive:

     half     viewBox="0 0 100 60"
              <path d="M5 55 A45 45 0 0 1 95 55" stroke-width="9"
                    stroke-linecap="round">
              track then progress, the second carrying stroke-dasharray.
              Value sits directly under the arc, label under the value.

     full     viewBox="0 0 36 36", two concentric <circle r="15.5">,
              stroke-width="4", stroke-linecap="round", the progress one
              rotated -90° so it starts at 12 o'clock — the same donut
              geometry `donut.tsx` reads out of chapter 19's chart-19
              donut card, at a single segment. Value and label sit BELOW
              the ring in this specimen.

   HAND-ROLLED SVG, NOT RECHARTS. recharts has no clean half-or-full arc
   gauge primitive — `donut.tsx` and `chart.tsx` both reach for it because
   `Pie`, `Bar`, `Line` and `Area` are its actual shapes; an arc gauge is not
   one of them, so this file draws the path itself, in the same units
   `chart.tsx` already draws `BAR_RADIUS` and `CURVE_WIDTH` in: bare numbers,
   because a stroke width and a path radius are MARKS ON THE PICTURE, not
   distances in the layout, and re-scaling them with the root font size would
   distort the drawing rather than resize it. Each variant's viewBox is the
   artifact's own, verbatim, so what scales is the RENDERED BOX (`size`, a
   rem string) and the ratio of stroke to ring never moves.

   THE CLIENT'S PIXEL SPECS, RECONCILED RATHER THAN CONTRADICTED. Reference
   screenshots (not the artifact) gave exact figures — "Half arc · 200×120,
   20px stroke", "Full ring · 140×140, 14px stroke" — and neither 20 nor 14
   nor 200×120 nor 140×140 is a token; tokens.css carries no stroke-width
   scale at all, which is a real gap and is reported rather than papered
   over with an invented one. Read as PROPORTIONS instead of literals, the
   two readings agree: the client's ring diameter is roughly 160 (200×120
   minus padding) at a 20 stroke, ~12.5%; the artifact's is 90 at a 9
   stroke, 10%. Full ring: the client's ~100 at 14 is 14%; the artifact's 36
   at 4 is 11%. Close enough, at two very different absolute sizes, to read
   as the SAME drawing scaled up — so this file keeps the artifact's exact
   path and stroke numbers and sets `size`'s DEFAULT to the client's stated
   render size per variant (12.5rem × 7.5rem half, 8.75rem × 8.75rem full,
   both at the 16px authoring root), which reproduces both readings from one
   geometry rather than picking a side.

   THE NUMBER'S POSITION IS A DELIBERATE DIVERGENCE ON THE FULL RING, AND
   SAID SO. Chapter 19's own full-ring card prints the value and the label
   BELOW the ring, as two siblings after the `<svg>`. The client's reference
   states plainly: "Number + unit inside." That is a considered instruction
   overriding the compact grid-cell reading, the same shape as the data-
   table hover ruling earlier the same day — so `variant="full"` centres its
   value inside the hole (this file's own centring technique, shared with
   `donut.tsx`'s `centerLabel`) and takes no separate value slot below.
   `variant="half"` keeps the artifact's own placement — "Number lands under
   arc" is the client's own words for the SAME layout the specimen already
   draws, so nothing there needed reconciling.

   THE LAW THIS FILE OBEYS
   · The track is `--hair`, the artifact's own `var(--hair)` — a real token,
     unlike the client's "Soft-paper track" phrase, which names no hex and
     is read as "the same quiet stroke the artifact already draws."
   · The progress arc takes `--chart-1..5` by position, or an explicit
     override — never mango; a KPI ring is a measurement, not a brand fill.
   · `stroke-linecap="round"` on the progress arc only, both variants — the
     artifact's own drawing, and the client's own words, agree exactly.
   · No colour is a literal. No radius here is `--radius-*`: an SVG stroke
     is not a border, and giving it one of the four box radii would be
     naming the wrong kind of round.
   · Focus is one global rule; a gauge is read, not pressed, and draws no
     ring of its own.

   RENDERING CONTEXT
   No `"use client"`. No hook, no state, no browser API — the percent
   arrives as a prop and leaves as a `stroke-dasharray`.
   ========================================================================= */

import * as React from "react";

import { cn } from "../../lib/utils";

/** Clamp a percent into the range the arc can actually draw. */
function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
}

const SERIES_COLOURS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

/* ----------------------------------------------------------------------------
   variant="half" — chapter 19's own semicircle, `M5 55 A45 45 0 0 1 95 55`.
   Arc length = π·r = π·45, the constant chapter 19's own radius implies.
   ------------------------------------------------------------------------- */

const HALF_ARC_D = "M5 55 A45 45 0 0 1 95 55";
const HALF_ARC_LENGTH = Math.PI * 45;
const HALF_STROKE_WIDTH = 9;
const HALF_DEFAULT_SIZE = "12.5rem";

/* ----------------------------------------------------------------------------
   variant="full" — chapter 19's own full circle, r=15.5, rotated -90° so the
   fill starts at 12 o'clock. Circumference = 2π·r.
   ------------------------------------------------------------------------- */

const FULL_RING_RADIUS = 15.5;
const FULL_RING_CIRCUMFERENCE = 2 * Math.PI * FULL_RING_RADIUS;
const FULL_STROKE_WIDTH = 4;
const FULL_DEFAULT_SIZE = "8.75rem";

export interface RingsProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  /** Half arc or full ring. Chapter 19 draws both as separate chart-view
   *  cards; this file draws both from one component, `Chart`'s own
   *  "one component, a variant prop" pattern for `type`. */
  variant?: "half" | "full";
  /** How much of the arc is filled, 0–100. */
  percent: number;
  /** The figure printed for the gauge — already formatted, e.g. "62%".
   *  Sits under the arc on `variant="half"`, centred in the hole on
   *  `variant="full"` — see the file header for why the position differs. */
  value: React.ReactNode;
  /** What the figure is measuring. Printed under the value on `"half"`,
   *  under the ring on `"full"` (never inside it, which is `value`'s place
   *  alone). */
  label?: React.ReactNode;
  /** A token reference for the filled arc. Defaults to `--chart-1..5` by
   *  position when several gauges are drawn side by side. */
  color?: string;
  /** Position among sibling gauges, for the default colour only. */
  index?: number;
  /**
   * The rendered box. A rem string; see the file header for why 12.5rem
   * (half) / 8.75rem (full) are the defaults rather than the artifact's own
   * compact 4.5×2.75 / 140-at-16px readings. Defaults per `variant` when
   * omitted.
   */
  size?: string;
  /** Accessible name, since the arc itself says nothing a screen reader can
   *  read. Defaults to pairing `label` and `value`. */
  ariaLabel?: string;
}

/**
 * A single KPI as an arc: a half-circle with its value under it, or a full
 * ring with its value inside it.
 *
 * TEN STATES
 *  1. default        — the track and the filled arc at `percent`, plus the
 *                      value and its label, placed per `variant` — see the
 *                      file header for why "half" and "full" print the value
 *                      in different spots.
 *  2. hover          — none drawn; the artifact states no hover for either
 *                      card and none is invented for it.
 *  3. focus-visible  — does not apply. The SVG carries `role="img"` and an
 *                      accessible name, not a tab stop — a gauge is read,
 *                      not activated.
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply. A figure nobody may see is not
 *                      rendered, the same rule `StatGrid` and `Chart` obey.
 *  6. loading        — does not apply as a state of THIS component; a
 *                      caller drawing several gauges from one request wraps
 *                      them in its own loading register, the way `Tiles`'
 *                      caller would for a wall of cards.
 *  7. empty          — `percent={0}` draws an empty track/ring and the value
 *                      still prints — "0%" is a real reading, not nothing.
 *  8. error          — does not apply, same reasoning as loading.
 *  9. selected       — does not apply; a gauge has no selection.
 * 10. read-only      — always.
 */
const Rings = React.forwardRef<HTMLDivElement, RingsProps>(
  (
    {
      className,
      variant = "half",
      percent,
      value,
      label,
      color,
      index = 0,
      size,
      ariaLabel,
      ...props
    },
    ref,
  ) => {
    const filled = clampPercent(percent);
    const stroke = color ?? SERIES_COLOURS[index % SERIES_COLOURS.length];
    const ariaText =
      ariaLabel ??
      (label ? `${String(label)}: ${String(value)}` : String(value));

    if (variant === "full") {
      const boxSize = size ?? FULL_DEFAULT_SIZE;
      const dash = (filled / 100) * FULL_RING_CIRCUMFERENCE;

      return (
        <div
          ref={ref}
          data-slot="rings"
          data-variant="full"
          role="img"
          aria-label={ariaText}
          className={cn("flex flex-col items-center gap-[var(--space-2)]", className)}
          {...props}
        >
          <div className="relative" style={{ width: boxSize, height: boxSize }}>
            <svg viewBox="0 0 36 36" className="size-full" aria-hidden="true">
              <circle
                cx="18"
                cy="18"
                r={FULL_RING_RADIUS}
                fill="none"
                stroke="var(--hair)"
                strokeWidth={FULL_STROKE_WIDTH}
              />
              <circle
                cx="18"
                cy="18"
                r={FULL_RING_RADIUS}
                fill="none"
                stroke={stroke}
                strokeWidth={FULL_STROKE_WIDTH}
                strokeLinecap="round"
                strokeDasharray={`${String(dash)} ${String(FULL_RING_CIRCUMFERENCE)}`}
                transform="rotate(-90 18 18)"
              />
            </svg>
            {/* NUMBER + UNIT INSIDE — the client's own override of chapter
                19's below-the-ring placement. See the file header. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-[var(--font-weight-medium)] tabular-nums text-foreground">
                {value}
              </span>
            </div>
          </div>
          {label ? (
            <span className="text-micro text-ink-tertiary">{label}</span>
          ) : null}
        </div>
      );
    }

    const boxSize = size ?? HALF_DEFAULT_SIZE;
    const dash = (filled / 100) * HALF_ARC_LENGTH;
    const [width, height] = [boxSize, `calc(${boxSize} * 0.6)`];

    return (
      <div
        ref={ref}
        data-slot="rings"
        data-variant="half"
        role="img"
        aria-label={ariaText}
        className={cn("flex flex-col items-center", className)}
        {...props}
      >
        <svg viewBox="0 0 100 60" style={{ width, height }} aria-hidden="true">
          <path
            d={HALF_ARC_D}
            fill="none"
            stroke="var(--hair)"
            strokeWidth={HALF_STROKE_WIDTH}
            strokeLinecap="round"
          />
          <path
            d={HALF_ARC_D}
            fill="none"
            stroke={stroke}
            strokeWidth={HALF_STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={`${String(dash)} ${String(HALF_ARC_LENGTH)}`}
          />
        </svg>
        <span className="-mt-[var(--space-3)] text-sm font-[var(--font-weight-medium)] tabular-nums text-foreground">
          {value}
        </span>
        {label ? (
          <span className="text-micro text-ink-tertiary">{label}</span>
        ) : null}
      </div>
    );
  },
);

Rings.displayName = "Rings";

export { Rings };
