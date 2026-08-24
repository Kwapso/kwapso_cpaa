/* ============================================================================
   Tooltip — the charcoal pill (0 direct call sites today; reached through the
   screen engine and reserved for the next application).

   DESIGN SOURCE
   design-mothership/specimens/_fragments/t12.css + t12-overlaysmall.html
   (chapter 12) → `.kw-tooltip`. The kit's sentence, verbatim:

       "Charcoal pill, 12.5px [→badge], one line, 8px above the trigger.
        200ms fade. No arrow."

   Every clause of that is in this file. The padding is the one thing the kit
   leaves open and t12-gaps.md T12-1 already settled it at
   `--space-1h` / `--space-3`; that decision is carried, not re-derived.
   Motion is motion/motion.css §4 (`.motion-anchored`), whose entrance runs on
   `--duration-entrance` — which IS the kit's 200ms, as T12-1 records.

   THE LAW THIS FILE OBEYS
   · THE TOOLTIP IS THE EXCEPTION TO THE OVERLAY SURFACE. Every other floating
     thing in chapter 12 is `--popover` at 24 under `--shadow-overlay`. This one
     is `--surface-inverse` with `--ink-on-inverse` at `--radius-pill`, and it
     carries NO shadow — the kit gives it none, and a shadow under a charcoal
     pill on unlit paper is invisible anyway.
   · ONE LINE. `whitespace-nowrap` is the design, not a convenience. A tooltip
     that wraps is a popover that has not admitted it.
   · No arrow. Chapter 12 draws no arrow anywhere, so no `TooltipArrow` is
     exported and none is added.
   · Focus is ONE global rule (tokens.css §8). No ring here — and the tooltip
     itself is never focusable; it describes the thing that is.
   · Every string is a prop with a default. This file holds none of its own:
     the tooltip's text IS its children.

   RENDERING CONTEXT
   `"use client"`. Radix Tooltip holds open state and timers, reads provider
   context and portals.
   ========================================================================= */

"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "../../lib/utils";

/* `.kw-tooltip`. `text-badge` sets the 12 step with its own leading and
   tracking in one class; the kit then pins the leading to 1 for the pill, so
   `leading-none` follows it and is the only property overridden.

   z 70 keeps the small floating layer above the modal scrim (60) and the
   drawer scrim (55), so a tooltip inside a dialog is not clipped behind it.
   Chapter 12 states no z — GAPS-A.md ANC-1. */
const SURFACE = [
  "z-[70] w-fit whitespace-nowrap",
  "bg-surface-inverse text-ink-on-inverse",
  /* CH12 draws the pill `padding: 7px 14px`. The inline half is `--space-3h`
     exactly; the block half has no token — 7 is off the scale entirely — so it
     stays at `--space-1h` (6) and the one-pixel shortfall is logged rather
     than invented. GAPS-FIDELITY-BC TIP-B1. */
  "rounded-pill px-[var(--space-3h)] py-[var(--space-1h)]",
  "text-badge leading-none",
  "motion-anchored",
] as const;

/**
 * The tooltip provider. Owns the open/close delays for every tooltip beneath
 * it, so a toolbar of eight controls behaves as one group rather than eight
 * independent timers.
 *
 * The delays are Radix's own defaults, deliberately: the kit states a 200ms
 * FADE and says nothing about how long a pointer must rest before the fade
 * starts, and inventing a hover delay would be inventing a behaviour rather
 * than reading one. GAPS-A.md TT-1.
 *
 * TEN STATES — none apply. A provider renders no DOM at all; it is context.
 * THREE BREAKPOINTS — UNCHANGED, for the same reason.
 * RTL — nothing to mirror.
 */
const TooltipProvider = TooltipPrimitive.Provider;

/**
 * A tooltip. Wraps its own provider so a single tooltip works with no setup;
 * nesting inside an app-level `TooltipProvider` is harmless and is what a
 * toolbar should do, because the outer provider is the one that owns the
 * shared skip-delay.
 *
 * TEN STATES — none apply to the root; it is state, not a surface.
 * THREE BREAKPOINTS — UNCHANGED. RTL — nothing to mirror.
 */
const Tooltip = ({
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>) => (
  <TooltipPrimitive.Provider>
    <TooltipPrimitive.Root {...props}>{children}</TooltipPrimitive.Root>
  </TooltipPrimitive.Provider>
);

Tooltip.displayName = "Tooltip";

const TooltipTrigger = TooltipPrimitive.Trigger;

/**
 * The pill.
 *
 * TEN STATES
 *  1. default        — charcoal pill, off-beige ink, 12/500 on one line, 8
 *                      clear of the trigger, no arrow, no shadow. It flips
 *                      with the palette on its own: `--surface-inverse` is
 *                      off-beige in dark and `--ink-on-inverse` is charcoal,
 *                      so the pill stays the inverse of the page in both
 *                      themes without a second drawing.
 *  2. hover          — does not apply, and it is the interesting one: hover is
 *                      what SUMMONS this component. The pill itself is
 *                      `pointer-events: none` by nature — Radix does not let
 *                      it take the pointer — so there is nothing to hover.
 *  3. focus-visible  — NOT here, twice over. tokens.css §8 rings every control
 *                      at once, and the tooltip is never a control: it is
 *                      `role="tooltip"` describing the trigger, which is what
 *                      keeps it out of the tab order.
 *  4. active/pressed — does not apply. A tooltip cannot be pressed.
 *  5. disabled       — does not apply to the pill. A DISABLED trigger is the
 *                      real case, and it is a genuine trap: a disabled button
 *                      fires no pointer events, so its tooltip never opens.
 *                      The fix is at the call site — wrap the disabled control
 *                      in a focusable span — and it is written here rather
 *                      than solved silently, because solving it would mean
 *                      this component overriding a call site's `disabled`.
 *                      GAPS-A.md TT-2.
 *  6. loading        — does not apply. A tooltip's text is known before it
 *                      opens; a tooltip that has to fetch is a `hover-card`.
 *  7. empty          — a tooltip with no children renders an empty pill. It is
 *                      not defended against with a hardcoded fallback string,
 *                      because that string could not be translated; a tooltip
 *                      with nothing to say should not be rendered.
 *  8. error          — does not apply. A validation message is `field`'s, and
 *                      the kit puts it beside the field in ink, not in a pill.
 *  9. selected       — does not apply.
 * 10. read-only      — does not apply; a tooltip is nothing but read-only.
 *
 * THREE BREAKPOINTS
 *  mobile   — UNCHANGED in drawing, and effectively absent: touch has no
 *             hover, and Radix does not open a tooltip on tap. Nothing is
 *             invented to compensate — a tooltip must never be the only place
 *             a piece of information exists, which is the rule that makes the
 *             phone case correct rather than broken.
 *  tablet   — UNCHANGED. Pointer present, behaves as desktop; pointer absent,
 *             behaves as mobile. One class covers both.
 *  desktop  — the kit's pill, one line, at 8 from the trigger. It never wraps,
 *             so its width is its text; Radix's collision handling slides it
 *             back inside the viewport rather than breaking the line.
 *
 * RTL — safe. `px-*` is padding-inline, the side is Radix's, and a one-line
 * pill has no internal direction of its own.
 */
const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 8, collisionPadding = 8, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      data-slot="tooltip-content"
      /* "8px above the trigger" — kit-stated, and it is `--space-2`. Passed as
         the unitless number Radix's positioner requires, so it is the one
         measurement in this file that does not scale with the text-size
         control. GAPS-A.md ANC-2. */
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(SURFACE, className)}
      {...props}
    />
  </TooltipPrimitive.Portal>
));

TooltipContent.displayName = "TooltipContent";

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
