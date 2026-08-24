/* ============================================================================
   HoverCard — the preview that opens on hover (0 direct call sites today;
   reached through the screen engine and reserved for the next application).

   DESIGN SOURCE
   design-mothership/specimens/_fragments/t12.css (chapter 12) → `.kw-popover`.
   The kit draws FOUR members of the small floating layer — tooltip, dropdown,
   popover, command palette — and a hover card is not one of them. It is
   therefore drawn as the popover, which is chapter 12's surface for "a panel
   of content anchored to something", and the difference is the trigger, not
   the drawing. Recorded as GAPS-A.md HC-1 rather than presented as kit law.
   Chapter 12's rule, verbatim: "Overlay shadow, 24px radius, no blur."
   Motion is motion/motion.css §4 (`.motion-anchored`).

   WHY IT IS NOT DRAWN AS A TOOLTIP
   The tooltip is the one exception to the overlay surface — a charcoal pill
   holding one line. A hover card holds a record: a name, a mark, two lines of
   metadata. Putting that on the charcoal pill would either force the pill to
   grow into a panel, which contradicts "one line", or force the record to
   shrink into a sentence, which is what the tooltip is already for.

   THE LAW THIS FILE OBEYS
   · The surface is `--popover` at `--radius` (24) under `--shadow-overlay`,
     padded 20, 300 wide. No blur, no arrow, no border.
   · Focus is ONE global rule (tokens.css §8). No ring here.
   · No duration, no curve, no keyframe. `.motion-anchored` carries both
     directions off Radix's `data-side` / `data-state`.
   · A hover card must never be the only route to its content: it opens on
     hover and on focus (Radix does both), and anything inside it that matters
     has to exist somewhere a touch device can reach. Stated here because it is
     the one accessibility trap this component has.

   RENDERING CONTEXT
   `"use client"`. Radix HoverCard holds open state and timers, and portals.
   ========================================================================= */

"use client";

import * as React from "react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";

import { cn } from "../../lib/utils";

/* `.kw-popover`, reused. z 70 keeps the small floating layer above the modal
   scrim (60) and the drawer scrim (55) — GAPS-A.md ANC-1. */
const SURFACE = [
  "z-[70] w-[18.75rem] max-w-[var(--radix-hover-card-content-available-width)]",
  "bg-popover text-popover-foreground",
  "rounded-[var(--radius)] shadow-xl", // bridged to --shadow-overlay
  "p-[var(--space-5)]",
  "motion-anchored",
] as const;

const HoverCard = HoverCardPrimitive.Root;
const HoverCardTrigger = HoverCardPrimitive.Trigger;

/**
 * The preview panel.
 *
 * TEN STATES
 *  1. default        — `--popover` at 24 under `--shadow-overlay`, 20 inset,
 *                      300 wide.
 *  2. hover          — does not apply to the surface, and the distinction
 *                      matters here: hover is what OPENS this component, not
 *                      something it paints. The panel stays open while the
 *                      pointer is over it (Radix), and draws no wash of its
 *                      own for that.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      Radix opens the card on trigger focus as well as on
 *                      hover, which is what makes it keyboard-reachable.
 *  4. active/pressed — does not apply. A hover card is not pressed; a surface
 *                      that responds to a click should be a `popover`.
 *  5. disabled       — does not apply to the surface. A trigger that must not
 *                      preview simply does not render a HoverCard.
 *  6. loading        — does not apply to the surface, and it is a real
 *                      decision: the panel keeps its frame and puts a
 *                      `skeleton` in its body while the record arrives. A card
 *                      that resizes under a hovering pointer moves itself out
 *                      from under the pointer and closes.
 *  7. empty          — a card with no children renders as a bare 20-padded
 *                      surface. Nothing is invented to fill it.
 *  8. error          — does not apply to the surface; a failed preview shows
 *                      an `alert` in the body, or the call site does not open
 *                      the card at all.
 *  9. selected       — does not apply.
 * 10. read-only      — does not apply. A hover card is read-only by nature;
 *                      there is no second, writable state to distinguish it
 *                      from.
 *
 * THREE BREAKPOINTS
 *  mobile   — UNCHANGED in drawing, and unreachable in practice: a touch
 *             device has no hover, so the card opens only on focus. That is
 *             why the law above says the content must exist elsewhere. No
 *             phone-only variant is invented here, because a hover card that
 *             silently becomes a tap target on a phone would swallow the tap
 *             the trigger was for.
 *  tablet   — UNCHANGED. A tablet with a pointer behaves as desktop; one
 *             without behaves as mobile, and the same class covers both.
 *  desktop  — 300 wide, capped by Radix's measured available width.
 *
 * RTL — safe. No physical side is named; Radix mirrors `align`.
 */
const HoverCardContent = React.forwardRef<
  React.ComponentRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = "center", sideOffset = 8, collisionPadding = 8, ...props }, ref) => (
  <HoverCardPrimitive.Portal>
    <HoverCardPrimitive.Content
      ref={ref}
      data-slot="hover-card-content"
      align={align}
      /* 8 is `--space-2`, the kit's stated offset for the floating layer,
         passed as the unitless number Radix's positioner requires — it does
         not scale with the text-size control. GAPS-A.md ANC-2. */
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(SURFACE, className)}
      {...props}
    />
  </HoverCardPrimitive.Portal>
));

HoverCardContent.displayName = "HoverCardContent";

export { HoverCard, HoverCardTrigger, HoverCardContent };
