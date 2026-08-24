/* ============================================================================
   Accordion — the drawn disclosure, one of a set (16 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/kwapso-ui.css → `.kw-list__item`: the kit's row
   is `--space-4` block / `--space-5` inline padding at `--radius-card` (24),
   washing to the second paper tone on hover. An accordion header IS that row;
   nothing else in the kit is closer, and drawing a second row shape for it
   would be inventing one.
   design-mothership/specimens/_fragments/f3.css → `.kw-matrix td`, the
   1px `--hair` rule between sibling rows, and `tr:last-child { border: 0 }`.
   motion/motion.css §9 → `.motion-disclosure` and `.motion-disclosure-marker`.

   THE LAW THIS FILE OBEYS
   · A hairline between items is the BLESSED case — same-tone separation — so
     `--border` is legitimate here in a way it never is on a button or a
     coloured pill. The last item drops it, as the kit's own table does.
   · Hover on a row is `--accent`, the kit's neutral row/item wash (the command
     palette's active row). NEVER `--primary`: mango is a brand fill, never a
     hover, or every open panel in a settings page turns mango.
   · Disabled is a fill and an ink, never an opacity. An unavailable item takes
     `--btn-disabled-fill` / `--btn-disabled-label`, the same pair a disabled
     Button takes, and loses the hover wash so it cannot look clickable.
   · Only four radii exist. The row wash is `--radius` (24), the box radius, as
     `.kw-list__item` draws it. There is no "slightly rounded" here.
   · Focus is ONE global rule (tokens.css §8). The trigger is a real button
     inside a real heading; this file defines no ring and writes no
     `outline: none`.
   · No transition or keyframe is written here. `.motion-disclosure` (height,
     off Radix's measurement) and `.motion-disclosure-marker` (the chevron
     ROTATES, never swaps to a second glyph) already exist and are attached.

   RENDERING CONTEXT
   `"use client"`. Radix's Accordion holds the open item(s).
   ========================================================================= */

"use client";

import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";

import { ChevronDown } from "../../icons";
import { cn } from "../../lib/utils";

/* A type alias and not an interface: Radix's Root props are a DISCRIMINATED
   UNION on `type` ("single" carries `collapsible`, "multiple" carries an array
   value), and an interface cannot extend a union. Preserving the union is the
   point — it is what makes `<Accordion type="single" collapsible>` type-check
   and `<Accordion type="multiple" collapsible>` not. */
export type AccordionProps = React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Root>;

/**
 * A set of disclosures, of which one (`type="single"`) or many
 * (`type="multiple"`) may be open.
 *
 * TEN STATES
 *  1. default        — a stack of rows separated by one hairline each.
 *  2. hover          — belongs to the trigger, not the set.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — belongs to the trigger.
 *  5. disabled       — `disabled` on the root marks every item `data-disabled`
 *                      and Radix blocks every toggle; the trigger's skin
 *                      follows. A fill and an ink, never an opacity.
 *  6. loading        — does not apply to the set. A panel whose CONTENTS have
 *                      not arrived renders a `Skeleton` inside its content;
 *                      that is the skeleton primitive's job. Collapsing the
 *                      whole accordion while one panel loads would move rows
 *                      the reader is aiming at.
 *  7. empty          — no children renders an empty element and no rules,
 *                      because the rule belongs to the item. An accordion with
 *                      nothing in it draws nothing, exactly as a badge with no
 *                      count does. The empty REGISTER (an illustration and a
 *                      line of text) is `.kw-empty`, a composition, not this.
 *  8. error          — does not apply. A disclosure reports nothing; a panel
 *                      that failed to load says so with an `Alert` inside its
 *                      own content.
 *  9. selected       — open is not selected, and the kit gives an open row no
 *                      second treatment beyond the rotated marker. Radix's
 *                      `data-state="open"` is on the item, the trigger and the
 *                      content for any call site that wants more.
 * 10. read-only      — expressed as `disabled`. There is no second skin for
 *                      "readable but not toggleable".
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The kit states one row padding
 *  (16 / 20) at every width and the row is `w-full`, so the accordion takes
 *  the parent's width and nothing stacks, collapses or grows on its own. A
 *  composition that shows tabs at desktop and an accordion at mobile mounts
 *  the two components; neither one morphs into the other.
 *
 * RTL — safe. Every inset is logical (`px-*` is padding-inline), the marker
 * is pushed by `ms-auto` (margin-inline-start), and the chevron rotates about
 * its own centre so it needs no mirroring — a down-chevron is down in every
 * writing direction.
 */
const Accordion = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Root>,
  AccordionProps
>((props, ref) => {
  const { className, ...rest } = props;
  return (
    <AccordionPrimitive.Root
      ref={ref}
      data-slot="accordion"
      className={cn("w-full", className)}
      /* The rest of a discriminated union loses its discriminant to TS's
         object-rest, but not at runtime — `type` is still in `rest`. One
         narrow cast restores what the compiler dropped; nothing is widened. */
      {...(rest as AccordionPrimitive.AccordionSingleProps)}
    />
  );
});

Accordion.displayName = "Accordion";

export interface AccordionItemProps
  extends React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item> {}

/**
 * One disclosure in the set: a header row and the panel under it.
 *
 * TEN STATES — the set's block covers all ten. The item adds exactly one
 * drawing of its own: the 1px `--border` hairline beneath it, dropped on the
 * last item so a stack does not end on a rule that separates it from nothing.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED.
 *
 * RTL — safe. A block-end border has no side.
 */
const AccordionItem = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Item>,
  AccordionItemProps
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    data-slot="accordion-item"
    /* One hairline between disclosures — ch02's same-tone separation, drawn
       as `inset 0 -1px 0 var(--hair)` and never as a border (review 1A · fix
       2). The last item drops it: a rule under the final row is a rule under
       nothing. */
    className={cn("shadow-[var(--hairline-under)] last:shadow-none", className)}
    {...props}
  />
));

AccordionItem.displayName = "AccordionItem";

export interface AccordionTriggerProps
  extends React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> {
  /**
   * Replace the chevron. Undefined draws `ChevronDown` with
   * `.motion-disclosure-marker`, which ROTATES on open rather than swapping to
   * a second glyph. Pass `null` for a row that discloses without a marker (a
   * whole-row trigger in a dense panel, where the kit lets the wash carry it).
   */
  marker?: React.ReactNode;
}

/**
 * The header row. Always inside a `<h3>` (Radix's `Header`), so a screen
 * reader gets the document outline a list of panels is supposed to have.
 *
 * TEN STATES
 *  1. default        — `.kw-list__item` geometry: 16 block / 20 inline, ink
 *                      primary at the control step, marker pointing down.
 *  2. hover          — `bg-accent`, the kit's neutral row wash, at
 *                      `--radius` (24). Guarded with `enabled:` so a disabled
 *                      row never matches a hover rule in the first place.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the control's own radius — which is why the row
 *                      carries its 24 radius at rest and not only on hover.
 *  4. active/pressed — no nudge. `button.tsx` drops a filled control by one
 *                      hairline on press; a full-width row doing that would
 *                      shift the hairline under it and read as a jump. The
 *                      press is carried by the panel opening, which is the
 *                      most legible possible acknowledgement.
 *  5. disabled       — `--btn-disabled-fill` / `--btn-disabled-label` and
 *                      `cursor-not-allowed`, composed in JS via `data-disabled`
 *                      so it cannot lose a specificity race with the hover.
 *  6. loading        — does not apply to the row; see the set's block.
 *  7. empty          — an unlabelled trigger renders an empty row. Nothing is
 *                      invented to fill it.
 *  8. error          — does not apply.
 *  9. selected       — open. Radix sets `data-state="open"` here, which is
 *                      what `.motion-disclosure-marker` reads to rotate. The
 *                      row takes no extra fill when open: the kit gives an
 *                      open row none, and adding one would make the open row
 *                      compete with the panel it introduces.
 * 10. read-only      — expressed as `disabled`.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The row is `w-full` and 16/20 at
 *  every width; the label wraps rather than truncating, because a disclosure
 *  whose label you cannot read is a disclosure you cannot choose.
 *
 * RTL — safe. `px-5` is padding-inline, `ms-auto` pushes the marker to the
 * inline-end, `text-start` is logical, and the chevron is vertical.
 */
const AccordionTrigger = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Trigger>,
  AccordionTriggerProps
>(({ className, children, marker, disabled, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex" data-slot="accordion-header">
    <AccordionPrimitive.Trigger
      ref={ref}
      data-slot="accordion-trigger"
      disabled={disabled}
      className={cn(
        // Reset — the kit's own opening line on every bare control.
        "flex w-full cursor-pointer appearance-none items-center gap-4 border-0 bg-transparent",
        "text-start text-inherit [font:inherit]",
        // `.kw-list__item`: 16 block / 20 inline at the box radius.
        "rounded-[var(--radius)] px-5 py-4",
        // 14 / 500 — the control label step, at the kit's one "bold".
        "text-sm font-[var(--font-weight-medium)] text-foreground",
        "transition-colors duration-[var(--duration-colour)] ease-kwapso",
        // Hover is the neutral row wash, and only while the row is live.
        "enabled:hover:bg-accent",
        // Disabled is a fill and an ink. Emitted last so tailwind-merge drops
        // the resting ink and fill rather than leaving the two to fight over
        // stylesheet order.
        "disabled:cursor-not-allowed disabled:bg-[var(--btn-disabled-fill)]",
        "disabled:text-[var(--btn-disabled-label)]",
        className,
      )}
      {...props}
    >
      {children}
      {marker === undefined ? (
        <ChevronDown
          aria-hidden="true"
          className="motion-disclosure-marker ms-auto size-[var(--icon-16)]"
        />
      ) : (
        marker
      )}
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));

AccordionTrigger.displayName = "AccordionTrigger";

export interface AccordionContentProps
  extends React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content> {}

/**
 * The panel.
 *
 * The padding lives on an inner element, not on the animating one: Radix
 * animates the content's HEIGHT from its measured value, and vertical padding
 * on the animating box makes the panel jump by exactly that padding at both
 * ends of the run. This is the single most common way an accordion animation
 * is got wrong, so it is written down rather than left to be rediscovered.
 *
 * TEN STATES — the set's block covers all ten. The panel adds none.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The inline padding matches the
 *  trigger's (`--space-5`) at every width so the label and the prose it
 *  introduces sit on one line.
 *
 * RTL — safe. `px-5` is padding-inline.
 */
const AccordionContent = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Content>,
  AccordionContentProps
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    data-slot="accordion-content"
    className={cn("motion-disclosure", className)}
    {...props}
  >
    <div className="px-5 pb-4 text-sm text-ink-secondary">{children}</div>
  </AccordionPrimitive.Content>
));

AccordionContent.displayName = "AccordionContent";

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
