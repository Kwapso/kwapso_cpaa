/* ============================================================================
   Popover — the anchored confirm panel (3 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/_fragments/t12.css + t12-overlaysmall.html
   (chapter 12) → `.kw-popover`, `.kw-popover__title`, `.kw-popover__body`,
   `.kw-popover__row`. Chapter 12's rule, verbatim: "Overlay shadow, 24px
   radius, no blur." The kit's specimen is a "Move to W35?" confirm with a
   dense Move / Later pair.
   Motion is motion/motion.css §4 (`.motion-anchored`).

   THE LAW THIS FILE OBEYS
   · The surface is `--popover` at `--radius` (24) under `--shadow-overlay`,
     padded 20, capped at 300. No blur, no arrow, no border — chapter 12 draws
     no arrow anywhere in the floating layer, so this file exports no
     `PopoverArrow` and adds none.
   · Focus is ONE global rule (tokens.css §8). No ring here.
   · No duration, no curve, no keyframe. `.motion-anchored` reads Radix's
     `data-side` and `data-state`, so the panel appears to come out of its
     trigger and fades on the way out, in one class.
   · Logical properties only. Radix mirrors `align="start"` / `"end"` with the
     document direction on its own.

   RENDERING CONTEXT
   `"use client"`. Radix Popover holds open state, portals and positions
   against an anchor.
   ========================================================================= */

"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "../../lib/utils";

/* `.kw-popover`. z 70 puts the small floating layer above the modal scrim (60)
   and the drawer scrim (55) so a popover opened inside a dialog is reachable;
   chapter 12 states no z at all — GAPS-A.md ANC-1. */
const SURFACE = [
  "z-[70] w-[18.75rem] max-w-[var(--radix-popover-content-available-width)]",
  "max-h-[var(--radix-popover-content-available-height)] overflow-y-auto",
  "bg-popover text-popover-foreground",
  "rounded-[var(--radius)] shadow-xl", // bridged to --shadow-overlay
  "p-[var(--space-5)]",
  "motion-anchored",
] as const;

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

/**
 * The anchored panel.
 *
 * TEN STATES
 *  1. default        — `--popover` at 24 under `--shadow-overlay`, 20 inset,
 *                      300 wide. The kit's `max-width: 300` is expressed as a
 *                      width so a short panel does not collapse to its text;
 *                      Radix's measured available width still caps it on a
 *                      narrow viewport.
 *  2. hover          — does not apply to the surface. Whatever is inside it —
 *                      a Button pair in the kit's own specimen — carries its
 *                      own hover token.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      Radix moves focus into the panel on open; the ring that
 *                      lands is the token layer's.
 *  4. active/pressed — does not apply to a surface.
 *  5. disabled       — does not apply. A popover is open or it is not; the
 *                      TRIGGER is the thing that can be disabled, and it is a
 *                      Button with a fill and an ink.
 *  6. loading        — does not apply to the surface. A panel that is fetching
 *                      keeps its frame and puts a `skeleton` in its body:
 *                      an anchored surface that resizes while the reader looks
 *                      at it moves out from under the pointer.
 *  7. empty          — a panel with no children renders as a bare 20-padded
 *                      surface. Nothing is invented to fill it, and no string
 *                      is hardcoded here to apologise for it.
 *  8. error          — does not apply to the surface; an error belongs to the
 *                      field or the `alert` inside it.
 *  9. selected       — does not apply.
 * 10. read-only      — does not apply.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED by design. The panel is 300 at every
 *  width, capped by Radix's measured available width so it can never overhang
 *  a 320 phone, and `collisionPadding` keeps it clear of the viewport edge.
 *  It does not become a sheet on a phone: swapping one primitive for another
 *  is a composition's decision, not a primitive's, and 300 already fits inside
 *  the narrowest viewport the apps support.
 *
 * RTL — safe. No physical side is named; `align` is mirrored by Radix.
 */
const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 8, collisionPadding = 8, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      data-slot="popover-content"
      align={align}
      /* 8 is `--space-2`, the kit's stated offset for the floating layer. It
         is a unitless number because Radix's positioner accepts nothing else,
         so it does not scale with the text-size control — GAPS-A.md ANC-2. */
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(SURFACE, className)}
      {...props}
    />
  </PopoverPrimitive.Portal>
));

PopoverContent.displayName = "PopoverContent";

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };
