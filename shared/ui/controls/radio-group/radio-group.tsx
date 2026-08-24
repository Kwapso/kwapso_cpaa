/* ============================================================================
   RadioGroup · RadioGroupItem — the round mark and the set it belongs to
   (2 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/_fragments/t10.css → `.kw-radio::after`
     ("on = inverse + light dot; off = raised + hairline — inherited from the
     .kw-check re-skin, markup carries both classes").
   design-mothership/specimens/kwapso-ui.css → `.kw-radio` for the geometry:
     "A radio is the same control at pill radius", dot 8×8.
   design-mothership/specimens/_fragments/t10-selection.html → the two
     `.kw-choice` rows the chapter draws.

   THE ONE CONFLICT THIS FILE RULES ON
   Chapter 10 draws the selected radio INVERSE with a light dot. kwapso-ui.css
   ships it MANGO. Chapter 10 is built here, for the same reason and with the
   same consequence as `checkbox`. Both sides named in GAPS-B.md SEL-1.

   THE LAW THIS FILE OBEYS
   · A radio is the checkbox at pill radius. Same 22 mark, same two hairline
     strengths — `--hair-strong` unchosen, `--hair` disabled, override 42 —
     same
     inverse-when-on. It is the one member of the family whose circle is not
     an exception to ruling 03 — a radio has always been round, and the kit
     draws it that way in both specimens.
   · The hairline is drawn as an inset shadow, never a `border`.
   · Focus is ONE global rule (tokens.css §8). No ring here.
   · Disabled is a fill and an ink (`--hair-faint` / `--ink-disabled`).

   WHY `enabled:` / `disabled:` AND NOT A JS-RESOLVED DISABLED
   A radio item is disabled by its own prop OR by the group's, and only the
   native attribute knows both. `:enabled` and `:disabled` are mutually
   exclusive on one element, so exactly one class set can match and there is
   no same-specificity race for PATTERN.md §4 to object to. Everything
   interactive is `enabled:`-guarded; everything dead is `disabled:`-prefixed
   and outranks the unprefixed base.

   RENDERING CONTEXT
   `"use client"`. `@radix-ui/react-radio-group` holds state, owns roving
   focus and attaches its own handlers.
   ========================================================================= */

"use client";

import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";

import { cn } from "../../lib/utils";

const radioGroupClasses = [
  // A column of choice rows. The kit draws the rows but states no gap between
  // them; `--space-3` is the control gap, and it is what the rest of the
  // system puts between two stacked controls. Derived — GAPS-B.md SEL-7.
  "grid gap-3",
  // A horizontal set is the caller's layout, not this component's: the group
  // inherits `grid-flow-col` or a flex row from `className` without a variant.
];

const radioGroupItemClasses = [
  "inline-grid place-content-center shrink-0",

  // The same 22 mark as the checkbox, at pill radius. 22 is off the ruling-28
  // scale and has no token; kept as the literal the kit already uses (T10-2).
  "size-[1.375rem] rounded-pill",

  /* Off: raised paper behind a hairline. `bg-card` is `--surface-raised`.
     No `border` property — review 1A · fix 2. ch02's carve-out covers
     selection controls, and the artifact draws that edge as an inset shadow. */
  /* OVERRIDE 42 — the resting edge is `--hair-strong`. CH10 draws the
     unchosen radio as `inset 0 0 0 1px var(--hair2)`, 20%, and the disabled
     one keeps CH09's `var(--hair)`, 8%. The build had the two swapped. */
  "bg-card shadow-[var(--hairline-strong)]",

  // The dot inherits this — a LIGHT mark on the inverse, in both palettes.
  "text-ink-on-inverse",

  "cursor-pointer",
  "transition-[background-color,box-shadow]",
  "duration-[var(--duration-colour)] ease-kwapso",

  /* ---- On. Chapter 10's inverse, not kwapso-ui.css's mango. ------------- */
  "enabled:data-[state=checked]:bg-surface-inverse",
  "enabled:data-[state=checked]:shadow-none",

  /* ---- Hover. THERE IS NONE, and nothing replaces it — override 42. The
     rule that stood here promoted the unchosen edge from 8% to 20% while off,
     derived from the field's own hover, which was itself an invention of
     kwapso-ui.css (GAPS-B.md SEL-3). The 20% is now the resting edge, so the
     state it expressed is the state the radio is already in. ----------- */

  /* ---- Disabled. The faint fill, the disabled ink and the not-allowed
     cursor chapter 10 gives its locked mark. The radius does NOT change:
     a radio is round in every state, as a checkbox is square in every
     state (review 1A · fix 3). ---------------------------------------- */
  "disabled:cursor-not-allowed",
  "disabled:bg-hair-faint disabled:shadow-[var(--hairline)] disabled:text-ink-disabled",
];

export type RadioGroupProps = React.ComponentPropsWithoutRef<
  typeof RadioGroupPrimitive.Root
>;

export type RadioGroupItemProps = React.ComponentPropsWithoutRef<
  typeof RadioGroupPrimitive.Item
>;

/**
 * The set. Exactly one member is chosen; there is no clearing it by clicking
 * again, which is the whole difference from a checkbox.
 *
 * TEN STATES
 *  1. default        — a column of rows at the `--space-3` control gap.
 *  2. hover          — does not apply to the SET. The rows hover; the box
 *                      around them is not a control and has no skin at all.
 *  3. focus-visible  — NOT here. Radix gives the group roving focus, so the
 *                      ring lands on whichever ITEM holds the tab stop, and
 *                      tokens.css §8 draws it.
 *  4. active/pressed — does not apply to the set.
 *  5. disabled       — passes to every item through the native attribute;
 *                      the group itself has nothing to grey.
 *  6. loading        — does not apply. A set whose value has not arrived must
 *                      not render one member as chosen; the caller shows a
 *                      `Skeleton` in its place (GAPS-B.md SEL-5).
 *  7. empty          — no children renders an empty box. A radio group with
 *                      no options is a question with no answers and should
 *                      not be on the page; the kit draws no such case.
 *  8. error          — `aria-invalid` passes through to the group for the
 *                      screen reader. The VISUAL error is on the items, which
 *                      the kit does not draw for a mark — the message beside
 *                      the set is ink and belongs to `field` (chapter 9:
 *                      "error text poppy-free"). See GAPS-B.md SEL-4.
 *  9. selected       — belongs to the items, one at a time.
 * 10. read-only      — does not apply. HTML has no read-only radio; a set the
 *                      user may not change is `disabled`.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. One column at every width. A
 *  horizontal set at wide widths is the composition's grid, passed in through
 *  `className`, not a variant here.
 *
 * RTL — safe. A grid column has no side, and Radix mirrors its own arrow-key
 * handling from the document direction. `dir` passes through for a call site
 * that needs to force it.
 */
const RadioGroup = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Root>,
  RadioGroupProps
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root
    ref={ref}
    data-slot="radio-group"
    className={cn(radioGroupClasses, className)}
    {...props}
  />
));

RadioGroup.displayName = "RadioGroup";

/**
 * One member of the set.
 *
 * TEN STATES
 *  1. default        — 22 circle, raised paper, one hairline at
 *                      `--hair-strong` (override 42).
 *  2. hover          — does not apply. CH10 draws no hover on a selection
 *                      mark; the one this file carried came from the field's
 *                      invented hover, and the 20% it promoted to is now the
 *                      resting edge (override 42). Nothing replaces it
 *                      (GAPS-B.md SEL-3).
 *  3. focus-visible  — NOT here. tokens.css §8 rings it, at the pill radius
 *                      the mark already has.
 *  4. active/pressed — does not apply. A mark's press IS its state change.
 *  5. disabled       — `--hair-faint` fill, `--ink-disabled` dot, the WEAK 8%
 *                      edge against the unchosen radio's 20% (override 42),
 *                      not-allowed. Inherited from the group or set here.
 *  6. loading        — does not apply; see the group.
 *  7. empty          — does not apply. Unchosen is a value, not a hole.
 *  8. error          — not drawn for a mark (GAPS-B.md SEL-4).
 *  9. selected       — `--surface-inverse` fill, `--ink-on-inverse` dot.
 *                      Chapter 10 over kwapso-ui.css (SEL-1).
 * 10. read-only      — does not apply.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. 22 at every width; the LABEL beside
 *  it carries the touch target (GAPS-B.md SEL-6).
 *
 * RTL — safe. A circle has no direction and no side is named.
 */
const RadioGroupItem = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Item>,
  RadioGroupItemProps
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    data-slot="radio-group-item"
    className={cn(radioGroupItemClasses, className)}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="grid place-content-center">
      {/* The kit's 8×8 dot, in `currentColor` so the mark's own ink drives it
          and the palette flip is free. */}
      <span aria-hidden="true" className="size-2 rounded-pill bg-current" />
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
));

RadioGroupItem.displayName = "RadioGroupItem";

export { RadioGroup, RadioGroupItem, radioGroupItemClasses };
