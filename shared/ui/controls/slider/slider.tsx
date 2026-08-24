/* ============================================================================
   Slider — the continuous value (0 direct call sites; the commission is all 65).

   DESIGN SOURCE
   design-mothership/specimens/_fragments/t10.css → `.kw-slider__range`
     (`accent-color: var(--ink-primary)` — the thumb is INK), and
     `.kw-slider__mirror` / `.kw-slider__fill` (the bar: 0.5rem tall at r999,
     track `--surface-quiet`, fill MANGO).
   design-mothership/specimens/_fragments/t10-selection.html → the drawn
     specimen, a labelled range with its bar beneath it.
   t10-gaps.md: "The mirror bar's 0.5rem height and r999, the quiet track and
   the mango fill are kit-stated and not part of this gap."

   THE LAW THIS FILE OBEYS
   · The bar IS the track. Chapter 10 draws a native range and a mirror bar
     beneath it because a static specimen cannot skin a range thumb; a real
     component has one control, and it takes the bar's geometry with the
     range's ink thumb. Recorded in GAPS-B.md SLD-1.
   · The fill is MANGO, and this is the one place in the family the brand
     colour appears. The kit says so outright — "the one place in the chapter
     the accent appears, and it is the brand fill, not a status". It is NOT a
     hover, it is NOT a status, and nothing else in this batch may reach for
     it.
   · The thumb is `--ink-primary`, from the range's `accent-color`. It flips
     with the palette for free.
   · Focus is ONE global rule (tokens.css §8). No ring here; the thumb is the
     focusable node and takes the ring at its own pill radius.
   · Disabled is a fill and an ink, never an opacity.
   · The fill grows from the reading START, which is the opposite end of the
     track in Arabic, Urdu and Persian. Radix mirrors it from `dir`.

   RENDERING CONTEXT
   `"use client"`. `@radix-ui/react-slider` holds state, measures the track
   and attaches pointer handlers.
   ========================================================================= */

"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "../../lib/utils";

const sliderRootClasses = [
  "relative flex w-full touch-none select-none items-center",
  "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-auto",
  "data-[orientation=vertical]:flex-col",
  "data-[disabled]:cursor-not-allowed",
];

const sliderTrackClasses = [
  // The kit's mirror bar: 8 tall at r999 on the quiet well.
  "relative grow overflow-hidden rounded-pill bg-surface-quiet",
  "h-2 w-full",
  "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2",
  // Dead: the well drops to the faintest tone the system has.
  "group-data-[disabled]:bg-hair-faint",
];

const sliderRangeClasses = [
  // MANGO. Kit-stated, and the only mango in chapter 10.
  "absolute rounded-pill bg-surface-brand",
  "h-full data-[orientation=vertical]:w-full data-[orientation=vertical]:h-auto",
  "transition-colors duration-[var(--duration-colour)] ease-kwapso",
  // Dead: the brand fill withdraws — a disabled control must not be the
  // brightest thing on the page. Derived (GAPS-B.md SLD-2).
  "group-data-[disabled]:bg-surface-quiet",
];

const sliderThumbClasses = [
  // The range's ink thumb, at the switch knob's diameter — the only knob the
  // kit draws, so the family has one disc size. Derived (GAPS-B.md SLD-3).
  "block size-[1.25rem] shrink-0 rounded-pill bg-foreground border-0",
  "cursor-grab active:cursor-grabbing",
  "transition-colors duration-[var(--duration-colour)] ease-kwapso",
  "data-[disabled]:cursor-not-allowed data-[disabled]:bg-ink-disabled",
];

export interface SliderProps
  extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  /**
   * One accessible name per thumb, in thumb order. Undefined by default, so
   * this component hardcodes no string at all and there is nothing here that
   * an Arabic, Urdu or Persian build has to translate around. A single-value
   * slider normally needs none — the `Label` beside it already names the
   * control — and a two-thumb range normally needs two ("Minimum",
   * "Maximum"), which only the call site can word.
   */
  thumbLabels?: string[];
}

/**
 * The system's slider.
 *
 * The number of thumbs follows `value` / `defaultValue`, so a range is
 * `defaultValue={[20, 80]}` and needs no second component.
 *
 * TEN STATES
 *  1. default        — 8 pill track on `--surface-quiet`, mango fill, ink
 *                      thumb at 20.
 *  2. hover          — NOT drawn. The kit gives the bar no hover, and the
 *                      thumb's own hover would have to be an ink the palette
 *                      does not contain. Nothing was added; the cursor
 *                      changes to `grab`, which is a pointer affordance and
 *                      not a colour. GAPS-B.md SEL-3.
 *  3. focus-visible  — NOT here. The thumb is the focusable node and
 *                      tokens.css §8 rings it at its own pill radius.
 *  4. active/pressed — `cursor-grabbing` while dragging. No colour move: the
 *                      thing that changes under the finger is the VALUE, and
 *                      the fill already shows it.
 *  5. disabled       — `--hair-faint` track, `--surface-quiet` fill,
 *                      `--ink-disabled` thumb, not-allowed. A fill and an
 *                      ink; the mango withdraws because a dead control must
 *                      not be the loudest thing on the page.
 *  6. loading        — does not apply, and deliberately. A slider that has
 *                      not loaded must not render at its minimum — that is a
 *                      value, and a wrong one. The caller shows a `Skeleton`
 *                      until the number exists (GAPS-B.md SEL-5).
 *  7. empty          — does not apply. A slider always sits somewhere between
 *                      `min` and `max`; there is no empty position.
 *  8. error          — does not apply. A slider cannot produce an
 *                      out-of-range value: `min`, `max` and `step` bound it
 *                      before the user can. `aria-invalid` passes through for
 *                      a form library that wants to say otherwise, and gets
 *                      no visual, deliberately.
 *  9. selected       — does not apply. The fill is not a selection; it is a
 *                      quantity. The equivalent moment is state 4.
 * 10. read-only      — does not apply. Radix exposes none, and a value the
 *                      user may not move is `disabled`.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. `w-full` at every width; the track
 *  takes the column it is given. The thumb is 20 and therefore under the 44
 *  touch row, which the kit accepts by drawing the slider full-width with a
 *  readout beside it — a wide track is its own large target. Where a phone
 *  needs a bigger grip, the composition passes it (GAPS-B.md SLD-3).
 *
 * RTL — handled by Radix, which mirrors the fill and the arrow keys from the
 * document direction. Radix reads direction from its own `DirectionProvider`
 * or from a `dir` prop, NOT from `document.dir`, so an app that renders
 * Arabic must mount `DirectionProvider` once at the root or pass `dir` here.
 * `dir` passes straight through. See GAPS-B.md SLD-4.
 */
const Slider = React.forwardRef<
  React.ComponentRef<typeof SliderPrimitive.Root>,
  SliderProps
>(({ className, thumbLabels, value, defaultValue, min = 0, max = 100, ...props }, ref) => {
  // One thumb per value. Radix requires the count to be stable, so it is
  // derived from whichever of the two the caller controls the slider with.
  const positions = value ?? defaultValue ?? [min];

  return (
    <SliderPrimitive.Root
      ref={ref}
      data-slot="slider"
      // `group` so the track and the fill can read the root's disabled state,
      // which is where Radix puts it.
      className={cn("group", sliderRootClasses, className)}
      value={value}
      defaultValue={defaultValue}
      min={min}
      max={max}
      {...props}
    >
      <SliderPrimitive.Track className={cn(sliderTrackClasses)}>
        <SliderPrimitive.Range className={cn(sliderRangeClasses)} />
      </SliderPrimitive.Track>
      {positions.map((_, index) => (
        <SliderPrimitive.Thumb
          key={index}
          data-slot="slider-thumb"
          aria-label={thumbLabels?.[index]}
          className={cn(sliderThumbClasses)}
        />
      ))}
    </SliderPrimitive.Root>
  );
});

Slider.displayName = "Slider";

export { Slider, sliderRootClasses, sliderTrackClasses, sliderRangeClasses, sliderThumbClasses };
