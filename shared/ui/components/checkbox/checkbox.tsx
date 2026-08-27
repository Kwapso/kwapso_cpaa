/* ============================================================================
   Checkbox — the square mark (8 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/_fragments/t10.css → `.kw-check`,
     `.kw-check:checked`, `.kw-check:indeterminate` / `.kw-check--mixed`,
     `.kw-check--locked` (chapter 10, selection controls).
   design-mothership/specimens/_fragments/t10-selection.html — "Marks are
     22×22 at the 6px selection radius … On is inverse ink, never mango; off
     is raised paper behind an inset hairline."
   design-mothership/specimens/kwapso-ui.css → `.kw-check` for the tick
     geometry only (10 wide, 6 tall, 2-unit strokes).

   THE ONE CONFLICT THIS FILE RULES ON
   Chapter 10 draws the checked mark INVERSE (`--surface-inverse` fill,
   `--ink-on-inverse` tick). `kwapso-ui.css` ships it MANGO (`--accent` fill,
   `--ink-on-accent` tick). They disagree. Chapter 10 is built here — it is
   the later and the more specific drawing, and t10.css itself overrides
   kwapso-ui.css by source order for exactly this. Both sides are named in
   GAPS-B.md SEL-1, together with the three other controls given the same
   resolution so the family is one drawing.

   THE LAW THIS FILE OBEYS
   · `--radius-select` (6), in EVERY state and with no exception. The square
     mark is the reason that radius exists; it is not the card radius and it
     is not a pill. Review 1A · fix 3 withdrew the one exception this file
     used to make — the disabled mark went round and read as a radio.
   · The hairline is `--hair-strong` unchecked and `--hair` disabled — CH10's
     own `var(--hair2)` and CH09's `var(--hair)`, override 42 — drawn as an
     INSET SHADOW, never a `border`
     property (review 1A · fix 2). A mark carries one, a button carries none.
   · Focus is ONE global rule (tokens.css §8). No ring here, and nothing sets
     `outline: none`.
   · Disabled is a fill and an ink (`--hair-faint` / `--ink-disabled`), never
     an opacity.

   WHY `enabled:` / `disabled:` AND NOT A JS-RESOLVED DISABLED
   A checkbox's `disabled` reaches the DOM as the native attribute, so
   `:enabled` and `:disabled` are mutually exclusive selectors on the same
   element and exactly one of the two sets can ever match. That removes the
   race that PATTERN.md §4 warns about without a second source of truth, and
   it keeps working when a parent (a fieldset, a form library) disables the
   control without this component's props knowing. Everything interactive is
   `enabled:`-guarded; everything dead is `disabled:`-prefixed and therefore
   also outranks the unprefixed base on specificity.

   The one state that IS resolved in JS is error, because `error` and
   `aria-invalid` are two spellings of one thing and only JS can fold them.

   RENDERING CONTEXT
   `"use client"`. `@radix-ui/react-checkbox` holds state and attaches its own
   handlers.
   ========================================================================= */

"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils";

/* ----------------------------------------------------------------------------
   The tick and the bar — local, not exported.

   Chapter 10 draws both by hand rather than reaching for an icon: the tick is
   a 10×6 corner with 2-unit strokes, the indeterminate bar is 10 wide at the
   tick's own stroke weight (T10-7). They are transcribed here as inline
   geometry at the same proportions.

   Deliberately NOT a mirrored glyph. A checkmark is a symbol, not a
   direction, and must read the same in Arabic, Urdu and Persian — which is
   why this is a path in a fixed viewBox rather than a rotated pair of logical
   borders. Both take their colour from the mark via `currentColor`, so the
   palette flip is free.
   ------------------------------------------------------------------------- */
function Tick() {
  return (
    <svg
      viewBox="0 0 10 8"
      fill="none"
      aria-hidden="true"
      // 10 units wide rendered at 0.625rem, so the 2-unit stroke lands at
      // 0.125rem — the kit's 2px, in rem, scaling with the text-size control.
      className="w-[0.625rem] h-[0.5rem] group-data-[state=indeterminate]:hidden"
    >
      <path
        d="M1 4.2 3.7 6.9 9 1.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
      />
    </svg>
  );
}

function Bar() {
  return (
    <span
      aria-hidden="true"
      // 10 wide, 2 tall — the tick's width and the tick's stroke — and ROUND.
      // CH10 draws the indeterminate bar `width: 10px; height: 2px;
      // border-radius: 999px`; the radius was missing and a 2px square-ended
      // bar reads as a dash rather than as the kit's mark.
      // GAPS-FIDELITY-BC SEL-B1.
      className="hidden h-0.5 w-[0.625rem] rounded-pill bg-current group-data-[state=indeterminate]:block"
    />
  );
}

const checkboxVariants = cva(
  [
    "group inline-grid place-content-center shrink-0",

    // 22×22 at the selection radius, in EVERY state. Ruling 03 gives 6px to
    // "marks and selection controls" and nothing here is exempt. 22 is off the
    // ruling-28 scale and has no token; kept as the literal the kit already
    // uses (T10-2), not snapped.
    "size-[1.375rem] rounded-[var(--radius-select)]",

    /* No `border`, ever — review 1A · fix 2. ch02's carve-out ("Hairline
       rgba(26,25,24,.08) — fields, SELECTION CONTROLS, same-tone card
       separation") is kept, drawn the way the artifact draws it: an inset
       box-shadow, not a border property. */
    /* OVERRIDE 42 — the resting edge is `--hair-strong`. CH10 draws the
       unchecked box as `inset 0 0 0 1px var(--hair2)` — 20% — and CH09 gives
       the disabled field `var(--hair)` — 8%. The build had them swapped, so
       an unchecked box and a disabled one carried the same stroke. */
    "bg-card shadow-[var(--hairline-strong)]",

    // The tick and the bar inherit this. Chapter 10: a LIGHT mark on the
    // inverse, so the token flip keeps it light in both palettes.
    "text-ink-on-inverse",

    "cursor-pointer",
    "transition-[background-color,box-shadow]",
    "duration-[var(--duration-colour)] ease-kwapso",

    /* ---- On. Chapter 10's inverse, not kwapso-ui.css's mango. The fill IS
       the edge once it is on, so the hairline is withdrawn rather than
       recoloured — the artifact never stacks an edge on a filled mark. ---- */
    "enabled:data-[state=checked]:bg-surface-inverse",
    "enabled:data-[state=checked]:shadow-none",
    "enabled:data-[state=indeterminate]:bg-surface-inverse",
    "enabled:data-[state=indeterminate]:shadow-none",

    /* ---- Hover. THERE IS NONE, and nothing replaces it. Override 42. What
       used to sit here promoted the unchecked edge from 8% to 20% while off;
       it was derived from the field's hover, which was itself an invention of
       kwapso-ui.css — GAPS-B.md SEL-3, and CH10 draws no hover on a mark. The
       20% is now the RESTING edge, so the state this rule expressed is the
       state the box is already in. ------------------------------------- */

    /* ---- Disabled. A fill and an ink, never an opacity.

       Review 1A · fix 3: this used to add `disabled:rounded-pill`, which made
       the disabled checkbox ROUND and therefore read as a radio. The old
       comment called that "chapter 10's locked-by-policy mark" and "the kit's
       own oddity"; the client has ruled it out. Ruling 03 gives 6px to marks
       and selection controls with no state exemption, so a disabled checkbox
       stays the same square as every other checkbox and only its fill, its
       ink and its cursor change. -------------------------------------- */
    "disabled:cursor-not-allowed",
    "disabled:bg-hair-faint disabled:shadow-[var(--hairline)] disabled:text-ink-disabled",
  ],
  {
    variants: {
      /** Folded from `error` + `aria-invalid` in JS; see the header. */
      state: {
        default: [],
        /**
         * Chapter 9's field error, carried to the mark: the hairline goes
         * poppy at 65%, `color-mix` keeping the 65% token-driven so dark
         * re-resolves to poppy-lift. The kit draws no invalid checkbox —
         * GAPS-B.md SEL-4. The fill still flips to inverse when checked, so
         * an invalid-but-ticked box still reads as ticked.
         */
        error: [
          "shadow-[var(--hairline-error)]",
          /* The hover freeze that used to sit here held the default's hover
             still. There is no longer a hover to hold — override 42. */
          "enabled:data-[state=checked]:shadow-[var(--hairline-error)]",
          "enabled:data-[state=indeterminate]:shadow-[var(--hairline-error)]",
        ],
      },
    },
    defaultVariants: { state: "default" },
  },
);

export interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  /**
   * The field has failed validation. Also sets `aria-invalid` when the call
   * site has not set it itself, so a form library that only speaks
   * `aria-invalid` reaches the same skin without this prop.
   */
  error?: boolean;
}

/**
 * The system's checkbox.
 *
 * Pass `checked="indeterminate"` for the mixed state — Radix reports it as
 * `data-state="indeterminate"` and the mark swaps its tick for the bar. The
 * bar is drawn, not borrowed: chapter 10 states "inverse fill + light bar".
 *
 * TEN STATES
 *  1. default        — 22 square, 6 radius, raised paper, one hairline at
 *                      `--hair-strong` (override 42).
 *  2. hover          — does not apply. CH10 draws no hover on a selection
 *                      mark; the one this file carried was derived from the
 *                      field's own invented hover (override 42), and the 20%
 *                      it promoted to is now the resting edge. Nothing
 *                      replaces it (GAPS-B.md SEL-3).
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the control's own radius.
 *  4. active/pressed — does not apply. A mark's press IS its state change,
 *                      and the change is instant; the kit draws no separate
 *                      pressed skin for a selection control.
 *  5. disabled       — `--hair-faint` fill, `--ink-disabled` mark, the WEAK
 *                      8% edge against the unchecked box's 20% (override 42),
 *                      not-allowed. STILL the 6px square (review 1A · fix 3).
 *  6. loading        — does not apply, and deliberately so. A checkbox whose
 *                      value has not arrived must not render as unchecked —
 *                      that is a wrong answer, not a pending one. The row
 *                      shows a `Skeleton` until the value exists; the caller
 *                      chooses, and there is nothing for this file to draw.
 *                      See GAPS-B.md SEL-5.
 *  7. empty          — does not apply. Unchecked is not empty; it is a value.
 *  8. error          — `error` or `aria-invalid`: hairline poppy at 65%,
 *                      matching chapter 9's field. Derived (SEL-4).
 *  9. selected       — this IS the checked state: `--surface-inverse` fill,
 *                      `--ink-on-inverse` mark. Chapter 10 over kwapso-ui.css
 *                      (SEL-1).
 * 10. read-only      — does not apply. HTML has no read-only checkbox and
 *                      Radix exposes none; a value the user may not change is
 *                      `disabled`, which the kit draws as "locked by policy".
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The kit states one mark size (22)
 *  at every width. 22 is under the 44 touch row on its own, which is why the
 *  kit draws the mark inside a `.kw-choice` row: the LABEL is the touch
 *  target and it belongs to `label` / `choice`, not here (GAPS-B.md SEL-6).
 *
 * RTL — safe. The mark is square and centred, the tick is a fixed symbol that
 * must not mirror, and no side is named anywhere in this file.
 */
const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, error, "aria-invalid": ariaInvalid, ...props }, ref) => {
  const invalid = error ?? (ariaInvalid === true || ariaInvalid === "true");

  return (
    <CheckboxPrimitive.Root
      ref={ref}
      data-slot="checkbox"
      aria-invalid={invalid || undefined}
      className={cn(checkboxVariants({ state: invalid ? "error" : "default" }), className)}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="grid place-content-center text-current">
        <Tick />
        <Bar />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});

Checkbox.displayName = "Checkbox";

export { Checkbox, checkboxVariants };
