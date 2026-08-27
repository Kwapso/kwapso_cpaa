/* ============================================================================
   Progress — the determinate and indeterminate bar (2 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/kwapso-patterns.css → `.kw-bar` and
   `.kw-bar::after`, the second of the kit's three loading tiers, drawn in
   `_fragments/t20-feedback.html` block (f) beside the ring and the skeleton.
   Track `--surface-quiet`, runner `--surface-inverse` at 40% of the width,
   4 tall.

   Motion is motion/motion.css and nothing else: `.motion-progress-fill` for
   the advance (`--duration-advance`, `--ease-move`) and
   `.motion-progress-indeterminate` for the sweep (`--duration-bar`, 1.4s,
   kit-stated in the ch07 state matrix as "700ms spin / 1.4s bar"). No
   keyframe, no duration and no curve is written in this file.

   THE LAW THIS FILE OBEYS
   · A bar takes `--radius-sm` (4). "A bar is not a box." The kit's own
     `.kw-bar` reaches for `--radius-pill`; ruling 03 wins — GAPS-E PRG-1.
   · The runner is CHARCOAL (`--surface-inverse`), never mango. Mango is a
     brand fill, never a status and never a data colour. The one kit-stated
     exception is the route-change bar under the header, which is a
     composition, not this primitive.
   · The fill runs in READING ORDER. It is a `scaleX` from the inline start,
     with the origin mirrored under `dir="rtl"` — exactly the technique
     motion.css already uses for `.motion-step-connector`.
   · Reduced motion is already handled: tokens.css §9 zeroes
     `--duration-advance`, and motion.css §18 B replaces the sweep with a
     static full track. Nothing is written here for it.

   RENDERING CONTEXT
   No `"use client"`. No hook, no state, no browser API, no event handler —
   the value arrives as a prop and leaves as a transform.
   ========================================================================= */

import * as React from "react";

import { cn } from "../../lib/utils";

/* `.kw-bar` — the track. The kit draws it 120 wide; a primitive has no
   business choosing its own width, so it fills its parent and the call site
   sizes it (GAPS-E PRG-2). */
const trackClasses = [
  "relative w-full overflow-hidden",
  "h-1", // 4 — the kit's bar height
  "rounded-[var(--radius-sm)]",
  "bg-surface-quiet",
];

/* Shared by both runners so the two tiers cannot drift apart. */
const runnerClasses = ["rounded-[var(--radius-sm)] bg-surface-inverse"];

export interface ProgressProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  /**
   * How far along, between `0` and `max`. `null` or `undefined` means the
   * amount is not known and the bar runs indeterminate — the same convention
   * Radix Progress uses, so a call site written against it keeps working.
   */
  value?: number | null;
  /** The value that counts as complete. Defaults to 100 so `value` reads as a percent. */
  max?: number;
  /**
   * Force the sweep even when a `value` is present — for a request that has
   * reported a number but is no longer making progress.
   */
  indeterminate?: boolean;
  /**
   * The bar's accessible name. No default: a bar labelled "Loading…" beside a
   * heading that already says what is loading is noise, and the best default
   * is no string (PATTERN §7). Pass this, or `aria-labelledby`, at the call site.
   */
  label?: string;
  /**
   * Turns the value into words for `aria-valuetext`. No default, deliberately:
   * with none set, assistive technology announces its own localised percentage
   * from `aria-valuenow` / `aria-valuemax`, which is already correct in Arabic,
   * Urdu and Persian. Pass one only to say something a percentage cannot, e.g.
   * `(v, m) => \`\${v} of \${m} rows\``. See GAPS-E PRG-3 on why the default is
   * not an `Intl` call.
   */
  formatValue?: (value: number, max: number) => string;
}

/**
 * A progress bar.
 *
 * TEN STATES
 *  1. default        — determinate: track plus a charcoal fill at `value`.
 *  2. hover          — does not apply. A bar reports; it is not a target and
 *                      carries no pointer affordance. A draggable bar is
 *                      `Slider`, a different primitive.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      and a bar is not focusable: there is nothing to operate.
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply. Work is either happening or it is not;
 *                      a greyed-out progress bar states nothing.
 *  6. loading        — THE state, in two tiers. A known amount advances over
 *                      `--duration-advance`; an unknown amount sweeps at
 *                      `--duration-bar`. Rendering one IS loading, so there is
 *                      no `loading` prop.
 *  7. empty          — `value={0}` draws the bare track, which is correct: the
 *                      work has been accepted and none of it is done. The bar
 *                      never renders `null`; disappearing is the caller's job
 *                      and the kit's rule is that under 200ms nothing should
 *                      have been drawn at all — "a flash is worse than a wait".
 *  8. error          — does not apply, and must not be faked. A failed request
 *                      replaces the bar with the error register; a bar frozen
 *                      at 60% over a dead request is a lie. No poppy fill.
 *  9. selected       — does not apply.
 * 10. read-only      — every progress bar is read-only. `aria-readonly` is not
 *                      set because `role="progressbar"` is already output-only
 *                      by definition and the attribute would add nothing.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED, and deliberately. The bar inherits
 *  its width from the parent (`w-full`) at every width and keeps its one
 *  stated height (4) at all three, because a bar that thickens on mobile stops
 *  being the same mark. Where a bar should be short and inline, the call site
 *  constrains it; that is the composition's grid.
 *
 * RTL — safe, and it is the one thing in this file that needed care. The fill
 * is a `scaleX` whose `transform-origin` sits at the inline start and mirrors
 * to the inline end under `dir="rtl"`, so the bar fills the way the reader
 * reads. The indeterminate sweep is NOT mirrored — motion.css owns that
 * keyframe and it travels one way only; logged as GAPS-E PRG-4.
 */
const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  (
    { className, value = null, max = 100, indeterminate = false, label, formatValue, ...props },
    ref,
  ) => {
    const safeMax = max > 0 ? max : 100;
    const known = !indeterminate && value !== null && value !== undefined && !Number.isNaN(value);
    const clamped = known ? Math.min(Math.max(value as number, 0), safeMax) : 0;
    const fraction = clamped / safeMax;

    return (
      <div
        ref={ref}
        data-slot="progress"
        data-state={known ? "determinate" : "indeterminate"}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={known ? clamped : undefined}
        aria-valuetext={known && formatValue ? formatValue(clamped, safeMax) : undefined}
        className={cn(trackClasses, className)}
        {...props}
      >
        {known ? (
          <div
            data-slot="progress-fill"
            aria-hidden="true"
            className={cn(
              runnerClasses,
              "absolute inset-0",
              // Reading order. Same mirror motion.css writes for the stepper
              // connector, restated here because this element is not one.
              "[transform-origin:0_50%] rtl:[transform-origin:100%_50%]",
              // The advance. --duration-advance / --ease-move, from motion.css.
              "motion-progress-fill",
            )}
            /* Inline because the number is data, not design. It has to reach the
               `transform` property specifically: motion.css transitions
               `transform`, and Tailwind v4's `scale-*` utilities write the
               separate `scale` property, which that transition would not see. */
            style={{ transform: `scaleX(${fraction})` }}
          />
        ) : (
          <div
            data-slot="progress-runner"
            aria-hidden="true"
            className={cn(
              runnerClasses,
              // 40% of the track, the kit's figure, sweeping the full width.
              "absolute inset-y-0 start-0 w-2/5",
              // --duration-bar (1.4s), and under reduced motion motion.css §18 B
              // turns this into a static full track instead of a moving one.
              "motion-progress-indeterminate",
            )}
          />
        )}
      </div>
    );
  },
);

Progress.displayName = "Progress";

export { Progress };
