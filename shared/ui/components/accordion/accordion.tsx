/* ============================================================================
   Accordion — the drawn disclosure, one of a set (16 direct call sites).

   DESIGN SOURCE
   THE ARTIFACT'S OWN CH13 DRAWING — "Kwapso UI Kit.dc.html", chapter 13,
   the "Accordion" card. GAPS-D ACC-1 recorded "the kit draws no accordion"
   against the mothership's CSS specimens and assembled one from `.kw-list__item`
   plus a rotating chevron; that finding predates the artifact-page audits and
   is FALSE against the artifact, which draws the accordion in full:

     · each item is its OWN CARD — `background: var(--card)`,
       `border-radius: 24px`, `padding: 4px 18px` — and the set stacks them
       at `gap: 8px`. NOT one flat list with hairlines between rows.
     · the header row is `padding: 14px 0`, `gap: 12px`, question at
       13.5 / 500 (snapped to 14 — the control-label step, per the half-step
       role rule in GAPS-FIDELITY-A L3: an accordion header IS a control).
     · the marker is a TEXT GLYPH — "+" closed, "−" open — at 18 in
       tertiary ink. A glyph SWAP, not a rotation; `.motion-disclosure-marker`
       is not used here any more.
     · the answer is 13.5 in `--fg2` at line-height 1.55, `padding: 0 0 16px`,
       capped at 58ch (13.5 snapped to 13, the caption step — prose, not a
       control label).

   Re-audited against the client's PDF (page 5) 2026-08-26 on their
   instruction; no register row covers the accordion, so the drawing wins.
   motion/motion.css §9 → `.motion-disclosure` still animates the height.

   THE LAW THIS FILE OBEYS
   · A CARD's ground is the panel tone (PATTERN §11): the item fills `--card`,
     which flips against the soft-paper panel CH13 draws the set on. No
     hairline is needed between items any more — the 8 gap and the card edge
     do that job — so none is drawn.
   · Hover on a row is `--accent`, the kit's neutral row/item wash. NEVER
     `--primary`: mango is a brand fill, never a hover. (The artifact draws
     no hover here at all — `cursor: pointer` only; the wash is the system's
     standing row treatment, kept, and logged in GAPS-D ACC-2.)
   · Disabled is a fill and an ink, never an opacity. An unavailable item takes
     `--btn-disabled-fill` / `--btn-disabled-label`, the same pair a disabled
     Button takes, and loses the hover wash so it cannot look clickable.
   · Only four radii exist. The item card is `--radius` (24), as drawn.
   · Focus is ONE global rule (tokens.css §8). The trigger is a real button
     inside a real heading; this file defines no ring and writes no
     `outline: none`.
   · No transition or keyframe is written here. `.motion-disclosure` (height,
     off Radix's measurement) is attached; the marker swap is a state swap,
     which the kit treats as instant.

   RENDERING CONTEXT
   `"use client"`. Radix's Accordion holds the open item(s).
   ========================================================================= */

"use client";

import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";

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
 *  1. default        — a stack of item cards at the kit's 8 gap.
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
 *                      second treatment beyond the swapped marker. Radix's
 *                      `data-state="open"` is on the item, the trigger and the
 *                      content for any call site that wants more.
 * 10. read-only      — expressed as `disabled`. There is no second skin for
 *                      "readable but not toggleable".
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The kit states one item inset
 *  (4 / 18) at every width and the item is full-width, so the accordion takes
 *  the parent's width and nothing stacks, collapses or grows on its own. A
 *  composition that shows tabs at desktop and an accordion at mobile mounts
 *  the two components; neither one morphs into the other.
 *
 * RTL — safe. Every inset is logical (`px-*` is padding-inline), the marker
 * is pushed by `ms-auto` (margin-inline-start), and "+" / "−" are symmetric
 * glyphs that need no mirroring.
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
      /* CH13: the items are separate cards, stacked at the kit's 8. */
      className={cn("flex w-full flex-col gap-2", className)}
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
 * drawing of its own: the CARD it is — CH13's `background: var(--card)` at
 * the box radius with the drawn `4 / 18` inset. The card flips against the
 * panel it sits on, which is what separates two touching items; no hairline
 * is drawn between them any more.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED.
 *
 * RTL — safe. `px-*` is padding-inline.
 */
const AccordionItem = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Item>,
  AccordionItemProps
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    data-slot="accordion-item"
    /* CH13's item card: `background: var(--card); border-radius: 24px;
       padding: 4px 18px` — 18 is `--space-4h`, the panel inset half-step. */
    className={cn(
      "rounded-[var(--radius)] bg-card px-[var(--space-4h)] py-1",
      className,
    )}
    {...props}
  />
));

AccordionItem.displayName = "AccordionItem";

export interface AccordionTriggerProps
  extends React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> {
  /**
   * Replace the marker. Undefined draws CH13's own: a "+" that becomes a "−"
   * while the panel is open — a glyph swap at 18 in tertiary ink, exactly as
   * the artifact renders it (it draws no chevron anywhere in this chapter).
   * Pass `null` for a row that discloses without a marker (a whole-row
   * trigger in a dense panel, where the kit lets the wash carry it).
   */
  marker?: React.ReactNode;
}

/**
 * The header row. Always inside a `<h3>` (Radix's `Header`), so a screen
 * reader gets the document outline a list of panels is supposed to have.
 *
 * TEN STATES
 *  1. default        — CH13's header row: 14 block / 0 inline (the item card
 *                      already carries the 18), ink primary at the control
 *                      step, "+" at the inline end.
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
 *                      what swaps the "+" to the "−". The row takes no extra
 *                      fill when open: the kit gives an open row none, and
 *                      adding one would make the open row compete with the
 *                      panel it introduces.
 * 10. read-only      — expressed as `disabled`.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The row is `w-full` and 14/0 at
 *  every width; the label wraps rather than truncating, because a disclosure
 *  whose label you cannot read is a disclosure you cannot choose.
 *
 * RTL — safe. `ms-auto` pushes the marker to the inline-end, `text-start` is
 * logical, and the two marker glyphs are symmetric.
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
        // Reset — the kit's own opening line on every bare control. NOT
        // `[font:inherit]`: Tailwind emits that arbitrary property AFTER the
        // named utilities in the bundle, so the shorthand was silently
        // overriding the `text-sm` + weight below and the trigger rendered at
        // whatever type surrounded it (measured 15/300 in the demo panel).
        // The browser preflight already gives a <button> `font: inherit`;
        // the two classes below then own size and weight.
        "group/accordion-trigger",
        "flex w-full cursor-pointer appearance-none items-center gap-3 border-0 bg-transparent",
        "text-start text-inherit",
        // CH13's header row: `padding: 14px 0; gap: 12px` — the inline inset
        // is the item card's own 18, not the trigger's.
        "rounded-[var(--radius)] px-0 py-[var(--space-3h)]",
        // Drawn 13.5 / 500, snapped UP to 14 — the control label step — per
        // the half-step role rule (GAPS-FIDELITY-A L3): a trigger is a control.
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
        /* CH13's marker: `font-size: 18px; color: var(--fg3); line-height: 1`
           — "+" closed, "−" open. 18 is `text-lg`; the swap keys on Radix's
           `data-state` via the named group above. U+2212 MINUS SIGN, the
           artifact's own glyph, not a hyphen. */
        <span aria-hidden="true" className="ms-auto text-lg leading-none text-ink-tertiary">
          <span className="group-data-[state=open]/accordion-trigger:hidden">+</span>
          <span className="hidden group-data-[state=open]/accordion-trigger:inline">
            {"−"}
          </span>
        </span>
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
 *  mobile / tablet / desktop — UNCHANGED. The item card carries the inline
 *  inset (18) at every width so the label and the prose it introduces sit on
 *  one line; the panel adds only its drawn 16 under the prose.
 *
 * RTL — safe. No inline inset of its own; the measure caps the line.
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
    {/* CH13's answer: 13.5 in `--fg2`, `padding: 0 0 16px`, `max-width: 58ch`
        — 13.5 snapped DOWN to 13 (`text-caption`), the prose side of the
        half-step rule. The item card already carries the 18 inline inset. */}
    <div className="max-w-[58ch] pb-4 text-caption text-ink-secondary">{children}</div>
  </AccordionPrimitive.Content>
));

AccordionContent.displayName = "AccordionContent";

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
