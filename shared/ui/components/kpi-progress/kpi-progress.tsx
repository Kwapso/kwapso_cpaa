/* ============================================================================
   KpiProgress — a labelled metric with a fill bar (0 direct call sites;
   chapter 18's own "Progress" card, extended by one field).

   NOT `Progress`. `components/progress/progress.tsx` is chapter 20's bare
   loading indicator — determinate or a sweeping runner, no label, no value,
   the second of the kit's three loading tiers. This is a DATA-DISPLAY
   pattern with a metric attached: a name, what it is measuring, a bar, and
   the number the bar stands for, all visible at once and none of it a wait.
   The two share nothing but a rectangle that fills; `Progress` is reused
   nowhere in this file, on purpose, so a caller cannot mistake a KPI row for
   a spinner with a percentage on it.

   DESIGN SOURCE
   Kit chapter 18 ("Data display"), the "Progress" card's row —
   "Bookings … 78% … 34" read off the specimen verbatim:

       <span style="font-size:13px;color:var(--fg2);width:92px">Bookings</span>
       <span style="height:10px;border-radius:999px;
                     background:rgba(26,25,24,.10)">
         <span style="height:10px;width:78%;border-radius:999px;
                       background:var(--forest)"></span>
       </span>
       <span style="font-size:13px;font-variant-numeric:tabular-nums">34</span>

   Label, track, fill, trailing value — all four are here, at the artifact's
   own 10-tall pill track. What the artifact does NOT draw is a SUB-LABEL
   under the label; the client's reference screenshots ask for one plainly
   ("Retention" over "Growth, last year", then a bar, then "78%") and this
   file adds exactly that one field beyond the specimen. Flagged here rather
   than silently folded in, because it is the one piece of this component's
   shape that has no artifact drawing behind it — everything else does.

   THE TRACK COLOUR IS A REPORTED GAP, NOT A GUESS. The artifact's track is
   `rgba(26,25,24,.10)` — 10% ink — and tokens.css has no 10% step: it has
   `--hair-faint` at 6%, `--border`/`--hair` at 8%, and `--hair-strong` at
   20%. `--hair` is used here, the closer of the two real candidates (2
   points off against 10, versus `--hair-strong`'s 10), the same style of
   call `chart.tsx` already makes for its own un-tokened 14% baseline
   (GAPS-COL1 CHT-4) — logged, not invented.

   THE CLIENT'S "7px track" IS A SECOND FIGURE FOR THE SAME ROW, AND IT LOSES
   TO THE ARTIFACT'S OWN 10. Per this batch's own instruction — build to the
   artifact's specimen where one exists, and the screenshots are what
   surfaced the gap rather than the spec to build to — the track height here
   is chapter 18's 10 (`0.625rem`), a bare mark rather than a token for the
   same reason `chart.tsx`'s `CURVE_WIDTH` is: a bar's own thickness is a
   mark on the picture, not a distance in the layout, so it does not travel
   the spacing scale.

   THE LAW THIS FILE OBEYS
   · The track is `--radius-pill` (999) and the fill matches it exactly —
     the artifact's own drawing, both ends.
   · The fill takes a token colour, defaulting to `--chart-1`; never mango,
     for the reason every other data-display file in this batch gives —
     a measurement is not a brand fill.
   · Every number is tabular.
   · A bar answers no click and takes no `role="progressbar"` VALUE beyond
     stating one in `aria-valuenow` — it is a reading, styled by chapter 18's
     own row, not a native `<progress>` element, because the label and the
     value are as much this component's content as the bar is.
   · Focus is one global rule; this component is not a control.

   RENDERING CONTEXT
   No `"use client"`. No hook, no state — percent arrives as a prop and
   leaves as a width.
   ========================================================================= */

import * as React from "react";

import { cn } from "../../lib/utils";

export interface KpiProgressProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  /** What the metric is called — chapter 18's "Bookings". */
  label: React.ReactNode;
  /** A second line under the label. The one field this file adds beyond the
   *  artifact's own row — see the file header. Undefined draws none. */
  subLabel?: React.ReactNode;
  /** How far the fill runs, 0–100. */
  percent: number;
  /** The trailing figure, already formatted — "34", "78%". A node, not a
   *  number: a caller's own locale and unit are not this file's to guess. */
  value: React.ReactNode;
  /** A token reference for the fill. Defaults to `--chart-1`. */
  color?: string;
  /** Accessible name for the bar, when `label` alone (an icon, say) would
   *  not read as one. Defaults to `label`. */
  ariaLabel?: string;
}

/**
 * A metric's label, an optional sub-label, a fill bar and the figure it
 * stands for.
 *
 * TEN STATES
 *  1. default        — the label, the sub-label when given, the bar at
 *                      `percent`, and the trailing value.
 *  2. hover          — none drawn; a KPI row is read, not a target.
 *  3. focus-visible  — does not apply. `role="progressbar"` names a value,
 *                      not a control, and takes no tab stop.
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply; a metric nobody may see is not
 *                      rendered by its caller, the same rule `StatGrid`'s
 *                      `visible` prop states at the tile level.
 *  6. loading        — does not apply as a state of this component; a list
 *                      of rows loading together is the caller's register,
 *                      the same shape `Checklist`'s call sites already use.
 *  7. empty          — `percent={0}` draws an empty bar; the value still
 *                      prints.
 *  8. error          — does not apply, same reasoning as loading.
 *  9. selected       — does not apply.
 * 10. read-only      — always; the bar states a value, it does not collect
 *                      one.
 */
const KpiProgress = React.forwardRef<HTMLDivElement, KpiProgressProps>(
  (
    {
      className,
      label,
      subLabel,
      percent,
      value,
      color = "var(--chart-1)",
      ariaLabel,
      ...props
    },
    ref,
  ) => {
    const filled = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;

    return (
      <div
        ref={ref}
        data-slot="kpi-progress"
        className={cn("flex min-w-0 items-center gap-[var(--space-4)]", className)}
        {...props}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-[var(--space-1)]">
          <span className="truncate text-sm text-foreground">{label}</span>
          {subLabel ? (
            <span className="truncate text-caption text-ink-tertiary">{subLabel}</span>
          ) : null}
          <div
            role="progressbar"
            aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
            aria-valuenow={Math.round(filled)}
            aria-valuemin={0}
            aria-valuemax={100}
            /* 10 — chapter 18's own track height, a mark and not a token.
               See the file header for why 7 (the client's figure for the
               same row) loses to it. */
            className="relative h-[0.625rem] w-full overflow-hidden rounded-pill bg-[var(--hair)]"
          >
            <span
              /* `Progress`'s own `.motion-progress-fill` transitions
                 `transform`, because that primitive moves its runner with a
                 `scaleX`. This bar's width is the value itself, not a
                 runner's position, so it transitions `width` directly, on
                 the same duration and curve token motion.css already names
                 for an advance. */
              className="block h-full rounded-pill transition-[width] duration-[var(--duration-advance)] ease-kwapso"
              style={{ width: `${String(filled)}%`, background: color }}
            />
          </div>
        </div>
        <span className="shrink-0 text-sm tabular-nums text-foreground">{value}</span>
      </div>
    );
  },
);

KpiProgress.displayName = "KpiProgress";

export { KpiProgress };
