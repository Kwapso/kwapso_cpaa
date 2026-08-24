/* ============================================================================
   AspectRatio — a box that holds its proportion (0 direct call sites).

   DESIGN SOURCE
   Kit chapter 13's media card, which is the only place the kit reserves space
   for a picture. Its caption is the rule this component exists to serve:

       "Photography is inset and contained, corners rounded to 24 — never a
        full-bleed background."

   The drawing is `border-radius: 24px; overflow: hidden;` around a media slot
   inside a card that is padded 12 — the photograph is INSET from the card
   edge, never bled to it.

   THE LAW THIS FILE OBEYS
   · The ratio is a number, never a pair of px. The modern `aspect-ratio`
     property takes it directly, so nothing here computes a percentage padding
     and nothing writes a length.
   · This box paints NOTHING — no fill, no radius, no clip. Chapter 13's
     radius and its `overflow: hidden` belong to the media itself (`image`,
     `video`, `map` are their own folders and own that skin), because the same
     proportioned box also holds a chart and a map, and neither of those wants
     its corners shaved. Logged as GAPS-F ASP-1.
   · Not clipping is also the focus law: tokens.css §8 rings every control at
     once, and a box with `overflow: hidden` around a focusable child eats
     part of that ring.

   RENDERING CONTEXT
   No `"use client"`. `@radix-ui/react-aspect-ratio` is not a dependency of
   this repository and none was added; the CSS property does the whole job
   with no measurement, no state and no effect, so this renders inside a
   Server Component unchanged. The DOM shape still matches Radix's — an outer
   proportioned box and an inner filling layer — so a call site written
   against Radix behaves identically. Logged as GAPS-F ASP-2.
   ========================================================================= */

import * as React from "react";

import { cn } from "../../lib/utils";

export interface AspectRatioProps extends React.ComponentPropsWithoutRef<"div"> {
  /**
   * Width divided by height. `16 / 9` for video, `4 / 3` for the kit's own
   * message-thread media block, `1` for a square. One is the default, which
   * is the value the shape this replaces also defaults to, so no call site
   * changes meaning.
   */
  ratio?: number;
  /** Escape hatch onto the inner filling layer, where the child actually sits. */
  contentClassName?: string;
}

/**
 * A box that keeps its proportion whatever width it is given.
 *
 * TEN STATES
 *  1. default        — an invisible box at `ratio`, as wide as its parent.
 *  2. hover          — does not apply. It is a measurement, not a target. A
 *                      picture inside one that responds to a pointer is a
 *                      `Card interactive` around it, which carries the wash
 *                      and the lift.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      and this box deliberately does not clip, so a focusable
 *                      child sitting flush inside it keeps its whole ring.
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply. A proportion cannot be switched off.
 *  6. loading        — does not apply here, and that is the reason the
 *                      component earns its place: the box holds its height
 *                      from the first frame, so a picture arriving late does
 *                      not shove the page down. The placeholder inside it
 *                      while it waits is a `Skeleton`.
 *  7. empty          — no children renders the empty proportioned box, NOT
 *                      `null`. This is the one component in the batch where
 *                      the empty case is the useful one: reserving the space
 *                      is the whole job.
 *  8. error          — does not apply. A failed picture is `image`'s story to
 *                      tell, inside this box.
 *  9. selected       — does not apply.
 * 10. read-only      — always.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED, and the component is the reason a
 *  breakpoint is not needed: the box takes its width from the parent and
 *  derives its height from that width, so it responds continuously at every
 *  size instead of in three steps. A call site that genuinely needs a
 *  different SHAPE at a different width — a 16:9 hero that becomes 4:3 on a
 *  phone — changes `ratio` at the composition, because that is an editorial
 *  decision about the crop and not something a primitive can guess.
 *
 * RTL — safe. A proportion has no direction, `inset-0` is symmetrical, and
 * nothing here names a side.
 */
const AspectRatio = React.forwardRef<HTMLDivElement, AspectRatioProps>(
  ({ className, contentClassName, ratio = 1, children, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="aspect-ratio"
      /* A unitless number, straight into the CSS property. No length, so
         nothing here can become a px and nothing stops scaling. */
      style={{ "--aspect-ratio": ratio } as React.CSSProperties}
      className={cn("relative w-full aspect-[var(--aspect-ratio)]", className)}
      {...props}
    >
      <div
        data-slot="aspect-ratio-content"
        /* The filling layer, matching the DOM the Radix shape produces, so a
           child styled `object-cover` behaves the same way it does today. */
        className={cn("absolute inset-0 size-full", contentClassName)}
      >
        {children}
      </div>
    </div>
  ),
);

AspectRatio.displayName = "AspectRatio";

export { AspectRatio };
