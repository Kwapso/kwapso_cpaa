/* ============================================================================
   Spinner — the rotating ring, the first of the kit's three loading tiers
   (42 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/kwapso-patterns.css → `.kw-loader`, drawn in
     `_fragments/t20-feedback.html` block (f) beside the bar and the skeleton:
     22 across, a 2.5 ring on `--hair-strong` with the head on `--ink-primary`.
   design-mothership/specimens/kwapso-ui.css → `.kw-spinner`, the 14 ring that
     sits INSIDE a button. That is this file's `size="sm"`.
   Kit ch07 state matrix, Loading row: "700ms spin / 1.4s bar".

   THE LAW THIS FILE OBEYS
   · No keyframe, no duration and no curve is written here. `.motion-spinner`
     in motion/motion.css is the one rotation in the system and it is already
     timed at `--duration-spin` (700ms, KIT-STATED) on `--ease-linear`.
   · motion.css §18 keeps `.motion-spinner` running under
     `prefers-reduced-motion` on purpose: a frozen spinner removes the only
     signal that a request is still open. Nothing is written here for it.
     (kwapso-ui.css instead SLOWS the ring to 2.4s; both sides in GAPS-CE
     SPN-2.)
   · The ring is a pill, never a box. 999 is the only radius a circle has.
   · Disabled is a fill and an ink everywhere else in the system; a spinner
     has no disabled state and the JSDoc says so rather than omitting it.
   · Every announced string is a prop with a default.

   WHY THE RING IS DRAWN IN `currentColor` AND NOT IN `--hair-strong`
   `.kw-loader` names `--hair-strong` for the track and `--ink-primary` for
   the head, which is correct on page paper and wrong everywhere else — this
   ring is placed on a mango button, on the charcoal toast, and inside an
   inverse row, where a fixed ink ring disappears. `button.tsx` already ships
   its private ring as `currentColor` at 25% with a `currentColor` head, and
   two spinners in one system must be one drawing. On page paper the two
   formulations resolve to within five percent of each other. GAPS-CE SPN-1.

   RENDERING CONTEXT
   No `"use client"`. No hook, no state, no browser API, no event handler.
   ========================================================================= */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const spinnerVariants = cva(
  [
    "inline-block shrink-0 rounded-pill",
    // The track is the current ink at a quarter strength; the head is the ink
    // itself. `color-mix` keeps the 25% in the stylesheet so the palette flip
    // needs no second value.
    "border-[color-mix(in_srgb,currentColor_25%,transparent)] border-t-current",
    // motion.css: --duration-spin (700ms) on --ease-linear, infinite.
    "motion-spinner",
  ],
  {
    variants: {
      size: {
        /** `.kw-loader` — the standalone tier: 22 across, a 2.5 ring. */
        default: "size-[1.375rem] border-[0.15625rem]",
        /**
         * `.kw-spinner` — the 14 ring the kit draws inside a busy button, on
         * a 2 stroke. This is the value the commission names.
         */
        sm: "size-[0.875rem] border-2",
      },
    },
    defaultVariants: { size: "default" },
  },
);

export interface SpinnerProps
  extends React.ComponentPropsWithoutRef<"span">,
    VariantProps<typeof spinnerVariants> {
  /**
   * What a screen reader says while the work is open. Defaulted so no call
   * site can ship a silent wait, and a prop because the apps run in Arabic,
   * Urdu and Persian and a string baked into a component cannot be
   * translated.
   */
  label?: string;
  /**
   * Announce the wait. Default `true`. Set `false` for a spinner inside a
   * region that already announces — a busy button, a search field, a row that
   * carries its own `aria-busy`. Forty-two spinners all saying "Loading" at
   * once is worse than silence.
   */
  announce?: boolean;
}

/**
 * The system's loading ring.
 *
 * TEN STATES — a spinner IS a state, so most of the ten have nothing to say
 * here and each is named rather than quietly dropped.
 *
 *  1. default        — the ring as drawn, turning.
 *  2. hover          — does not apply. A spinner is not a target; the control
 *                      it stands for is either disabled or absent.
 *  3. focus-visible  — NOT here, and it is not focusable either: tabbing to a
 *                      spinner strands the caret when the work finishes and
 *                      the ring is removed. tokens.css §8 rings every real
 *                      control at once and this file adds nothing.
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply. Work is happening or it is not; a
 *                      greyed-out spinner states nothing. A control that is
 *                      disabled BECAUSE it is busy carries that itself
 *                      (`Button loading`).
 *  6. loading        — THE state. Rendering one IS loading, so there is no
 *                      `loading` prop.
 *  7. empty          — does not apply. There is no zero-value spinner; a wait
 *                      with nothing to wait for is not rendered at all. The
 *                      kit's own rule is that under 200ms nothing should have
 *                      been drawn — "a flash is worse than a wait" — and that
 *                      is the caller's timer, not this file's.
 *  8. error          — does not apply, and must not be faked. A request that
 *                      failed replaces the ring with the error register; a
 *                      spinner left turning over a dead request is a lie. No
 *                      poppy ring.
 *  9. selected       — does not apply.
 * 10. read-only      — does not apply. There is nothing to write to.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED, deliberately. The kit states two
 *  ring sizes and neither is a function of viewport width: 22 standalone, 14
 *  inside a control. A ring that grew on a phone would be a third drawing of
 *  a mark the kit draws twice. Where a call site wants a different size it
 *  passes `className`, which `cn` lets win.
 *
 * RTL — safe, and it is the one thing worth stating. The ring is a circle and
 * its rotation is not a reading direction: a clock turns the same way in
 * Arabic, Urdu and Persian, so the animation is deliberately NOT mirrored.
 * No side is named anywhere in this file.
 */
const Spinner = React.forwardRef<HTMLSpanElement, SpinnerProps>(
  ({ className, size = "default", label = "Loading…", announce = true, ...props }, ref) => {
    // One announcement, on the ring itself; there are no parts to silence.
    const live: React.HTMLAttributes<HTMLSpanElement> = announce
      ? { role: "status", "aria-live": "polite", "aria-label": label }
      : { "aria-hidden": true };

    return (
      <span
        ref={ref}
        data-slot="spinner"
        data-size={size ?? "default"}
        aria-busy="true"
        {...live}
        className={cn(spinnerVariants({ size }), className)}
        {...props}
      />
    );
  },
);

Spinner.displayName = "Spinner";

export { Spinner, spinnerVariants };
