/* ============================================================================
   ProgressToggle — the segmented progress whose segments are the control
   (0 direct call sites; reached through the screen engine).

   WHAT THIS IS, AND WHY — READ THIS FIRST
   The commission names `progress-toggle` / `ProgressToggle` and describes it
   nowhere: no variants, no props, no drawing, and the string "progress
   toggle" does not occur anywhere in the kit. The name was resolved rather
   than guessed silently, and the reasoning is in GAPS-CE PGT-1 together with
   the two readings that were rejected. In short: the kit DOES draw a
   segmented progress, and its segments are the only thing in the system that
   is both a progress and a toggle.

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" chapter 18, the "Progress" card, the row labelled
   "Sprint days":

       three 18 x 8 pills on `var(--inv)`, two on `rgba(26,25,24,.14)`,
       4 apart, followed by a tabular "3 / 5"

   The done fill is `--surface-inverse`, which is chapter 10's on-state for
   every selection control in the system, so a segment that is "done" is
   drawn exactly like a mark that is "checked". The remaining fill is the
   kit's 14% ink, which is `--surface-quiet` — the same tone the empty star
   in `rating` and the bare track in `progress` already take.

   THE LAW THIS FILE OBEYS
   · A bar is not a box, but these are PILLS, not bars: the kit draws them at
     999 and so does this file. `--radius-sm` (4) belongs to the continuous
     bar in `progress`, which is a different drawing of a different thing.
   · The done fill is INVERSE, never mango. Mango is a brand fill, never a
     status and never a data colour.
   · Disabled is a fill and an ink, never an opacity: the segments drop to
     `--hair-faint` and the readout to `--ink-disabled`.
   · Focus is ONE global rule (tokens.css §8). Each segment is a real button
     and the ring lands on it at its own radius. Nothing here defines a ring.
   · Motion is `.motion-step` from motion/motion.css and nothing else — the
     segment changes colour, which is exactly what that class transitions. No
     keyframe, no duration and no curve is written in this file.
   · Every announced string is a prop with a default, and the readout is a
     formatter prop so its digits follow the document's numbering system.

   RENDERING CONTEXT
   `"use client"`. This module resolves an uncontrolled value and attaches
   click and keyboard handlers during its own render.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";

/* The kit's segment: 18 x 8 at the pill radius. Both numbers are off the
   ruling-28 ladder and have no token; they are kept as the kit's own
   measurements in rem rather than snapped (GAPS-CE PGT-2). */
const segmentClasses = [
  "h-2 w-[1.125rem] shrink-0 rounded-pill border-0 p-0",
  // motion.css: background-color on --duration-colour. No literal anywhere.
  "motion-step",
];

const readoutClasses = ["text-badge tabular-nums text-ink-tertiary"];

export interface ProgressToggleProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onChange" | "defaultValue"> {
  /** How many segments are done, controlled. */
  value?: number;
  /** How many are done when the control manages its own. */
  defaultValue?: number;
  /** How many segments there are. The kit's row draws five. */
  max?: number;
  /**
   * Fired with the new count. Absent, the control is display-only and the
   * segments are not rendered as buttons at all — a control that silently
   * does nothing is worse than a picture.
   */
  onValueChange?: (value: number) => void;
  /**
   * Pressing the segment that is already the last done one clears back to it
   * minus one, so a mis-tap is undone by tapping the same place. Default
   * `true`; set `false` where the count may only ever go up.
   */
  toggleable?: boolean;
  /** The count may be read but not set. Segments stay, buttons do not. */
  readOnly?: boolean;
  /** The control cannot be used. A fill and an ink, never an opacity. */
  disabled?: boolean;
  /** Draw the kit's "3 / 5" readout after the segments. Default `true`. */
  showValue?: boolean;
  /**
   * The control's accessible name. Defaulted so no call site ships a nameless
   * meter, and a prop because the apps run in Arabic, Urdu and Persian.
   */
  label?: string;
  /**
   * The readout, and `aria-valuetext`. The kit prints "3 / 5" — two numbers
   * and a separator, so the sentence itself carries no language and only the
   * digits need localising, which `formatNumber` does.
   */
  formatValue?: (value: number, max: number) => string;
  /**
   * One segment's accessible name — what pressing it would mean. A different
   * sentence from the readout in every language, so it is a different prop.
   */
  formatItem?: (position: number, max: number) => string;
  /**
   * Turns a number into digits. Defaults to the runtime's own locale, so a
   * document in `ur-PK-u-nu-arabext` gets its own numerals without this file
   * knowing anything about numbering systems.
   */
  formatNumber?: (value: number) => string;
}

/** The runtime's own numerals. No locale is named, so the document's wins. */
function defaultFormatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { useGrouping: false }).format(value);
}

/**
 * The system's segmented progress.
 *
 * TEN STATES
 *  1. default        — `value` segments on `--surface-inverse`, the rest on
 *                      `--surface-quiet`, and the tabular readout after them.
 *  2. hover          — the segment under the cursor takes `--hair-strong`
 *                      while it is still undone, which is one defined step
 *                      between `--surface-quiet` and the inverse it would
 *                      become. A colour swap, never a fade, and suppressed
 *                      when the control is not operable. Derived — the kit
 *                      draws the row static (GAPS-CE PGT-3).
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the segment's own pill radius.
 *  4. active/pressed — does not apply. A segment's press IS its state change
 *                      and the change is instant; the kit draws no pressed
 *                      skin for a selection mark and this is one.
 *  5. disabled       — segments to `--hair-faint`, readout to
 *                      `--ink-disabled`, `cursor: not-allowed`, out of the tab
 *                      order. A fill and an ink, never an opacity.
 *  6. loading        — does not apply, deliberately. A count rendered at zero
 *                      while it loads states "none done", which is a wrong
 *                      answer rather than a missing one. The caller renders a
 *                      `Skeleton` in its place until the value exists — the
 *                      rule GAPS-B.md SEL-5 sets for every control that holds
 *                      a value.
 *  7. empty          — `value={0}`: every segment `--surface-quiet` and the
 *                      readout reads zero of max. That is correct rather than
 *                      absent — the work is known and none of it is done.
 *                      `max={0}` renders `null`; a progression with no steps
 *                      is not a control.
 *  8. error          — does not apply, and must not be faked. A count cannot
 *                      be invalid; a step that FAILED is a status and belongs
 *                      to the row it lives on, drawn by `Badge` or `Alert`. A
 *                      poppy segment here would put a status colour into a
 *                      data mark, which ruling 26 forbids.
 *  9. selected       — a done segment IS the selected state, and it is
 *                      INVERSE. Chapter 10's on-state, not mango.
 * 10. read-only      — `readOnly`, or simply omitting `onValueChange`: the
 *                      segments render as spans inside one `role="meter"`,
 *                      so there are no tab stops that do nothing.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The kit states one segment size
 *  (18 x 8) and one gap (4) and varies neither by width; the row is
 *  `inline-flex` and `flex-wrap`, so a long progression wraps rather than
 *  overflowing a phone, which is the same answer `.kw-stages` gives in
 *  chapter 23. An 8-tall segment is far under the 44 touch row; where the
 *  count is meant to be SET on a phone the composition should be using a
 *  `Slider`, and that is stated rather than solved by growing the mark
 *  (GAPS-CE PGT-4).
 *
 * RTL — safe, and it matters here: progress runs in reading order. The
 * segments are laid out by `flex` in DOM order with no side named, so
 * segment 1 sits at the reading start in Arabic, Urdu and Persian and the
 * row fills towards the reading end. The readout follows the segments by
 * DOM order, not by a margin.
 */
const ProgressToggle = React.forwardRef<HTMLDivElement, ProgressToggleProps>(
  (
    {
      className,
      value,
      defaultValue = 0,
      max = 5,
      onValueChange,
      toggleable = true,
      readOnly = false,
      disabled = false,
      showValue = true,
      label = "Progress",
      formatValue,
      formatItem,
      formatNumber = defaultFormatNumber,
      ...props
    },
    ref,
  ) => {
    const controlled = value !== undefined;
    const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
    const current = Math.min(Math.max(value ?? uncontrolled, 0), Math.max(max, 0));

    // Empty: a progression with no steps is not a control.
    if (max <= 0) return null;

    const operable = Boolean(onValueChange) && !readOnly && !disabled;
    const describe =
      formatValue ?? ((v: number, m: number) => `${formatNumber(v)} / ${formatNumber(m)}`);
    const describeItem = formatItem ?? describe;

    const commit = (position: number) => {
      if (!operable) return;
      // Pressing the last done segment steps back one, so a mis-tap is undone
      // where it was made rather than somewhere else.
      const next = toggleable && position === current ? position - 1 : position;
      if (!controlled) setUncontrolled(next);
      onValueChange?.(next);
    };

    const segments = Array.from({ length: max }, (_, i) => i + 1);

    const fill = (done: boolean) => {
      if (disabled) return "bg-hair-faint";
      return done ? "bg-surface-inverse" : "bg-surface-quiet";
    };

    return (
      <div
        ref={ref}
        data-slot="progress-toggle"
        data-state={current >= max ? "complete" : current > 0 ? "partial" : "empty"}
        data-disabled={disabled ? "" : undefined}
        // Operable, it is a group of toggles; otherwise it is a reading of a
        // quantity, which is what `meter` is for.
        role={operable ? "group" : "meter"}
        aria-label={label}
        aria-valuemin={operable ? undefined : 0}
        aria-valuemax={operable ? undefined : max}
        aria-valuenow={operable ? undefined : current}
        aria-valuetext={operable ? undefined : describe(current, max)}
        aria-disabled={disabled || undefined}
        className={cn("inline-flex flex-wrap items-center gap-3", className)}
        {...props}
      >
        <span className="inline-flex flex-wrap items-center gap-1">
          {segments.map((position) => {
            const done = position <= current;

            if (!operable) {
              return (
                <span
                  key={position}
                  aria-hidden="true"
                  data-slot="progress-toggle-segment"
                  data-done={done ? "" : undefined}
                  className={cn(segmentClasses, fill(done))}
                />
              );
            }

            return (
              <button
                key={position}
                type="button"
                data-slot="progress-toggle-segment"
                data-done={done ? "" : undefined}
                aria-pressed={done}
                aria-label={describeItem(position, max)}
                onClick={() => commit(position)}
                className={cn(
                  segmentClasses,
                  fill(done),
                  "cursor-pointer",
                  /* RULED 2026-08-22 (1B, verify/open-decisions.html). The
                     drawn segment is 18x8 — the kit's geometry, unchanged —
                     but that is the whole click target, and WCAG 2.5.8 asks
                     for 24x24. A pseudo-element grows the TARGET without
                     touching a single drawn pixel: it has no fill, no border
                     and no radius, so nothing appears. `relative` is what
                     gives it something to anchor to.
                     -8px block / -3px inline off an 18x8 box lands on 24x24.
                     Expressed in rem so it tracks the text-size control. */
                  "relative before:absolute before:-inset-y-[0.5rem]",
                  "before:-inset-x-[0.1875rem] before:content-['']",
                  // Only while undone, so hovering a done segment cannot
                  // fight the inverse fill: the two selectors are mutually
                  // exclusive rather than equally specific.
                  !done && "hover:bg-hair-strong",
                )}
              />
            );
          })}
        </span>

        {showValue ? (
          <span
            data-slot="progress-toggle-value"
            aria-hidden="true"
            className={cn(readoutClasses, disabled && "text-ink-disabled")}
          >
            {describe(current, max)}
          </span>
        ) : null}
      </div>
    );
  },
);

ProgressToggle.displayName = "ProgressToggle";

export { ProgressToggle };
