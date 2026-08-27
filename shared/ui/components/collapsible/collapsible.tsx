/* ============================================================================
   Collapsible — one thing that opens (0 direct call sites; the unstyled twin
   of `accordion`, reached for wherever a disclosure has no group to belong to
   — a filter facet, a "show more", an audit footer).

   DESIGN SOURCE
   The kit draws no bare disclosure. It draws the disclosure BEHAVIOUR twice:
     · motion/motion.css §9 → `.motion-disclosure-collapsible`, the height
       animation off Radix's own measurement, opening on `--ease-entrance`
       and closing, shorter, on `--ease-exit`.
     · motion/motion.css §9 → `.motion-disclosure-marker`, the chevron that
       ROTATES rather than swapping to a second glyph, because the same mark
       turning is what says the two states are one control.
   Everything visual is deliberately absent: see the note below and GAPS-D
   COL-1.

   THE LAW THIS FILE OBEYS
   · This component draws NOTHING but the reset. `accordion` is the drawn
     disclosure (`.kw-list__item` row, hairline, chevron); `collapsible` is
     the same behaviour with the chrome removed, so that a facet or a "show
     more" does not inherit an accordion row it never asked for. A call site
     that wants the drawn row uses `accordion` with a single item.
   · No transition or keyframe is written here. `.motion-disclosure-collapsible`
     already exists and is attached; the height it animates is Radix's
     `--radix-collapsible-content-height`, which is why the content must not
     be given a height of its own.
   · Disabled is a fill and an ink, never an opacity — here it is an ink only,
     because a trigger with no box has no fill to change (the same reading
     `button.tsx` applies to `ghost` and `link`).
   · Focus is ONE global rule (tokens.css §8). The trigger is a real
     `<button>`; it defines no ring and never writes `outline: none`.

   RENDERING CONTEXT
   `"use client"`. Radix's Collapsible holds open/closed state.
   ========================================================================= */

"use client";

import * as React from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";

import { cn } from "../../lib/utils";

export interface CollapsibleProps
  extends React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Root> {}

/**
 * The disclosure's root. Holds the open state and nothing else — it paints no
 * surface, so it inherits whatever it is dropped into and works in both
 * themes without a token of its own.
 *
 * TEN STATES
 *  1. default        — closed unless `defaultOpen`. `data-state` is on the
 *                      root, the trigger and the content, so a call site can
 *                      style off it without asking this file for a prop.
 *  2. hover          — does not apply to the root; the trigger owns it.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — does not apply to the root.
 *  5. disabled       — `disabled` passes to Radix, which blocks the toggle and
 *                      marks every part `data-disabled`. The trigger's ink
 *                      follows; see `CollapsibleTrigger`.
 *  6. loading        — does not apply. There is no value here to wait for. A
 *                      panel whose CONTENTS are loading renders a `Skeleton`
 *                      inside `CollapsibleContent`, which is that primitive's
 *                      job, not this one's.
 *  7. empty          — content with no children collapses to nothing and the
 *                      animation runs to a height of zero, which is correct:
 *                      an empty disclosure shows an empty disclosure. Whether
 *                      the trigger should then be hidden is the call site's
 *                      decision, not a primitive's.
 *  8. error          — does not apply. A disclosure reports nothing.
 *  9. selected       — does not apply. Open is not selected: a `Collapsible`
 *                      is not one of a set, which is exactly what separates it
 *                      from `accordion`.
 * 10. read-only      — expressed as `disabled`. A disclosure that may be read
 *                      but not toggled is a disabled disclosure, and there is
 *                      no second skin for it.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The root is a plain block that takes
 *  its width from the parent. Progressive disclosure is often what a narrow
 *  width WANTS, which is an argument for a composition to mount this at
 *  mobile and not at desktop — a decision the composition makes by rendering
 *  it or not, never by this file changing shape underneath it.
 *
 * RTL — safe. Nothing is positioned, sized or padded by side.
 */
const Collapsible = React.forwardRef<
  React.ComponentRef<typeof CollapsiblePrimitive.Root>,
  CollapsibleProps
>(({ className, ...props }, ref) => (
  <CollapsiblePrimitive.Root
    ref={ref}
    data-slot="collapsible"
    className={cn(className)}
    {...props}
  />
));

Collapsible.displayName = "Collapsible";

export interface CollapsibleTriggerProps
  extends React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Trigger> {}

/**
 * The control that toggles it.
 *
 * Reset only. A user agent's `<button>` arrives with a border, a grey fill, a
 * centred label and a font that is not the page's; all four are removed so the
 * trigger reads as whatever the call site puts inside it. It gains no height,
 * no padding and no fill of its own, because a disclosure trigger is as often
 * a whole row as it is a word.
 *
 * TEN STATES
 *  1. default        — inherits its ink and its type from the parent.
 *  2. hover          — does not apply by default: with no box there is nothing
 *                      to wash, and the kit's row wash (`--accent`) belongs to
 *                      the drawn row, which is `accordion`. A call site that
 *                      gives the trigger a box adds `hover:bg-accent` with it.
 *                      Never `--primary`: mango is a brand fill.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the control's own radius.
 *  4. active/pressed — does not apply. `button.tsx`'s 1px nudge belongs to a
 *                      filled control; a bare trigger nudging would detach the
 *                      label from the row it names.
 *  5. disabled       — `cursor-not-allowed` + `--ink-disabled`. An ink, not an
 *                      opacity, and no fill because there is no box to fill.
 *  6. loading        — does not apply; the root's entry covers it.
 *  7. empty          — a trigger with no children renders an empty button.
 *                      Nothing is invented: an unlabelled control is a call
 *                      site bug this file must not paper over.
 *  8. error          — does not apply.
 *  9. selected       — expressed by Radix as `data-state="open"`, which is
 *                      also what rotates a `.motion-disclosure-marker` placed
 *                      as a direct child. No second visual is added here.
 * 10. read-only      — expressed as `disabled`, per the root.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The trigger is inline-flex and sized
 *  by its own content at every width.
 *
 * RTL — safe. `text-start` is logical, `gap` is direction-agnostic, and the
 * marker rotates about its own centre so it needs no mirroring.
 */
const CollapsibleTrigger = React.forwardRef<
  React.ComponentRef<typeof CollapsiblePrimitive.Trigger>,
  CollapsibleTriggerProps
>(({ className, ...props }, ref) => (
  <CollapsiblePrimitive.Trigger
    ref={ref}
    data-slot="collapsible-trigger"
    className={cn(
      // The reset. `border-0` is stated rather than assumed, exactly as on
      // Button: a global reset elsewhere must not reintroduce a stroke.
      // `[font:inherit]` is the kit's own reset line (`.kw-btn`,
      // `.kw-tab`, `.kw-seg__btn` all open with `font: inherit`) — one
      // declaration for family, size, weight and leading, so the trigger
      // never carries a UA font.
      "inline-flex cursor-pointer appearance-none items-center gap-2 border-0 bg-transparent p-0",
      "text-start text-inherit [font:inherit]",
      "transition-colors duration-[var(--duration-colour)] ease-kwapso",
      // Disabled: an ink and a cursor. Never an opacity.
      "disabled:cursor-not-allowed disabled:text-ink-disabled",
      className,
    )}
    {...props}
  />
));

CollapsibleTrigger.displayName = "CollapsibleTrigger";

export interface CollapsibleContentProps
  extends React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content> {}

/**
 * What opens.
 *
 * `.motion-disclosure-collapsible` is attached here and is the only motion in
 * this file — it clips while moving (text must not spill past the closed
 * edge), animates to Radix's measured height, and takes `--ease-entrance`
 * opening against the shorter `--ease-exit` closing. tokens.css §9 zeroes both
 * durations under `prefers-reduced-motion`, so nothing extra is written for it.
 *
 * TEN STATES — the root's block covers all ten; the content adds no state of
 * its own beyond the `data-state` Radix already sets.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. Height is measured at whatever width
 *  the parent gives it, so a re-flow at a breakpoint is re-measured for free.
 *
 * RTL — safe. Nothing is positioned by side.
 */
const CollapsibleContent = React.forwardRef<
  React.ComponentRef<typeof CollapsiblePrimitive.Content>,
  CollapsibleContentProps
>(({ className, ...props }, ref) => (
  <CollapsiblePrimitive.Content
    ref={ref}
    data-slot="collapsible-content"
    className={cn("motion-disclosure-collapsible", className)}
    {...props}
  />
));

CollapsibleContent.displayName = "CollapsibleContent";

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
