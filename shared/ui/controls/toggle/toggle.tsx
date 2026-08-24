/* ============================================================================
   Toggle — a control that stays pressed (0 direct call sites; the commission
   is all 65, and `toggle-group` reuses this skin at 3 more).

   DESIGN SOURCE
   design-mothership/specimens/_fragments/t10.css → `.kw-seg__btn` and
     `.kw-seg__btn--active` (chapter 10, the segmented control — the only
     control the kit draws that holds a pressed state):
       off     background: none · color: var(--ink-secondary)
       hover   color: var(--ink-primary)                — an ink shift, no wash
       on      background: var(--surface-inverse)
               color: var(--ink-on-inverse)
               font-weight: var(--weight-strong)
     at `--control-height-dense`, `--space-4` inline padding, `--radius-pill`.
   design-mothership/specimens/kwapso-ui.css → `.kw-btn` for the size ladder
     and the press.

   THE ONE CONFLICT THIS FILE RULES ON
   Chapter 10 draws every on-state INVERSE; kwapso-ui.css ships the family's
   on-states MANGO. Chapter 10 is built here, matching `checkbox`,
   `radio-group` and `switch`. Both sides named in GAPS-B.md SEL-1.

   THE LAW THIS FILE OBEYS
   · A pressed toggle is INVERSE, at weight 500. Not mango, not an outline
     that thickens, not an opacity.
   · Hover is an ink shift, never a wash. That is what `.kw-seg__btn:hover`
     draws, and a wash under a segment would fight the inverse of the segment
     beside it.
   · `variant="default"` carries NO border in any state — it is a button, and
     ruling: buttons carry no border. `variant="outline"` is the commission's
     requirement and is the single exception in this file; it borrows the
     FIELD hairline (`--border`), because that is the only hairline the system
     has. Logged as GAPS-B.md TGL-1.
   · Focus is ONE global rule (tokens.css §8). No ring here.
   · Disabled is a fill and an ink (`--btn-disabled-fill` /
     `--btn-disabled-label`), never an opacity — and a variant with no box to
     fill takes the ink only, exactly as `button.tsx` splits it.
   · The press is the kit's 1px nudge, in rem, the same one `button.tsx`
     writes.

   WHY `enabled:` GUARDS EVERYTHING INTERACTIVE
   `disabled:bg-x` and `data-[state=on]:bg-y` carry the same specificity, so
   which one paints would be decided by the order Tailwind emits them in —
   PATTERN.md §4's exact objection. Guarding every live class with `enabled:`
   makes the two sets mutually exclusive selectors instead of competitors:
   `:enabled` and `:disabled` can never both match one element. The same trick
   separates hover from the on-state (`data-[state=off]:hover:` against
   `data-[state=on]:`), so a hovered pressed toggle has exactly one answer.
   It also survives a ToggleGroup disabling its items, which a JS-resolved
   state would not see.

   RENDERING CONTEXT
   `"use client"`. `@radix-ui/react-toggle` holds state and attaches handlers.
   ========================================================================= */

"use client";

import * as React from "react";
import * as TogglePrimitive from "@radix-ui/react-toggle";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const toggleVariants = cva(
  [
    // Shape. `border-0` is stated, not assumed: `variant="outline"` is the
    // only thing allowed to put one back.
    "inline-flex shrink-0 items-center justify-center gap-2 border-0",
    "cursor-pointer rounded-pill whitespace-nowrap select-none",

    // Type. 14/300 at rest; the kit thickens the ACTIVE segment to 500, which
    // is written with the on-state below and not here.
    "text-sm leading-none font-[var(--font-weight-light)]",

    // Off: no fill, secondary ink.
    "bg-transparent text-ink-secondary",

    "transition-[background-color,color,translate]",
    "duration-[var(--duration-colour)] ease-kwapso",

    // Icon slot — any SVG child sits at `--icon-button` and never shrinks.
    "[&_svg]:pointer-events-none [&_svg]:size-[var(--icon-button)] [&_svg]:shrink-0",

    /* ---- Hover. An ink shift, never a wash, and only while OFF so it cannot
       compete with the inverse of a pressed toggle. --------------------- */
    "enabled:data-[state=off]:hover:text-foreground",

    /* ---- On. Chapter 10's inverse at weight 500. ------------------------ */
    "enabled:data-[state=on]:bg-surface-inverse",
    "enabled:data-[state=on]:text-ink-on-inverse",
    "enabled:data-[state=on]:font-[var(--font-weight-medium)]",

    /* ---- Pressed. The kit drops the control one hairline. 1px is an optical
       nudge, one of the two values tokens.css allows off the scale; written
       in rem so it never becomes a px in a component. ------------------- */
    "enabled:active:translate-y-[0.0625rem]",

    /* ---- Disabled. The ink always; the fill only where there is a box, which
       is the outline variant's business below. -------------------------- */
    "disabled:cursor-not-allowed disabled:text-[var(--btn-disabled-label)]",
    "disabled:translate-y-0",
  ],
  {
    variants: {
      variant: {
        /**
         * `.kw-seg__btn` — no box at all until it is pressed. This is the
         * kit's drawing, and it is why a disabled default toggle takes an ink
         * and no fill: a fill there would invent a shape.
         */
        default: "bg-transparent",

        /**
         * Commission §6 requires the NAME; the kit draws no outlined toggle,
         * and review 1A · fix 2 says a control may not carry a border at all.
         * A toggle is a button, so ruling 01 decides how it reads instead:
         * "a secondary button is a filled paper button in the other tone".
         * This variant is therefore the FILLED paper toggle — the same
         * `--btn-secondary-*` pair the secondary button uses, so a band and
         * its toggles are never the same tone either. The name is kept for
         * API compatibility; the drawing is a fill. GAPS-B.md TGL-1.
         */
        outline: [
          "bg-[var(--btn-secondary-fill)]",
          "enabled:data-[state=off]:hover:bg-[var(--btn-secondary-hover)]",
          "disabled:bg-[var(--btn-disabled-fill)]",
        ],
      },

      size: {
        /** 32 — `--control-height-dense`. The height chapter 10 draws the
         *  segmented control at, which is why `toggle-group` defaults here.
         *
         *  SEG-C1 — the inline inset is 18 (`--space-4h`), not 16. CH10 draws
         *  the segment `height: 32px; padding: 0 18px`, and that is the only
         *  place the artifact draws a 32-tall toggle at all, so it is the
         *  value for this height. NOTE for a later reader: `Button`'s own
         *  `sm` stays at 16 — the artifact never draws a 32-tall BUTTON, so
         *  there is nothing to move it to — and a segment set beside a small
         *  button is therefore 2px wider on each side. That is the artifact's
         *  asymmetry, not a slip. */
        sm: "h-[var(--control-height-dense)] px-[var(--space-4h)]",
        /** 40 — `--control-height-button`, the kit's standing control height. */
        default: "h-[var(--control-height-button)] px-5",
        /** 44 — `--control-height-input`, the touch row. Padding continues the
         *  16 → 20 → 24 progression `button.tsx` establishes (GAPS.md BTN-3). */
        lg: "h-[var(--control-height-input)] px-6",
      },
    },

    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ToggleProps
  extends React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root>,
    VariantProps<typeof toggleVariants> {}

/**
 * The system's toggle: a button that stays pressed.
 *
 * An icon-only toggle needs an `aria-label` from the call site — there is no
 * default here, because a string baked into a component cannot be translated
 * and both apps run in Arabic, Urdu and Persian.
 *
 * TEN STATES
 *  1. default        — no fill, secondary ink, pill, 40 tall.
 *  2. hover          — ink to `--foreground`, and only while off. The kit's
 *                      `.kw-seg__btn:hover` is an ink shift and nothing else;
 *                      `variant="outline"` also moves its hairline to
 *                      `--hair-strong`, matching the field.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — a 1px nudge, the same one `button.tsx` writes. Note
 *                      that "pressed" (the finger is down) and "on" (the
 *                      control is holding a value) are different states here,
 *                      and this is the first: state 9 is the second.
 *  5. disabled       — `--btn-disabled-label` ink always; `outline` also
 *                      takes `--btn-disabled-fill`, `default` does not,
 *                      because it has no box to fill. A disabled ON toggle
 *                      reads as disabled and loses the inverse: a dead
 *                      control that still looks selected invites a click.
 *  6. loading        — does not apply. A toggle's value is known before the
 *                      control renders; a toggle whose change is in flight is
 *                      `disabled` until it lands, which the call site does.
 *                      A spinner inside a 32-tall segment would not fit.
 *  7. empty          — does not apply. A toggle always carries a label or an
 *                      icon; an icon-only toggle needs `aria-label`, which is
 *                      why no default exists.
 *  8. error          — does not apply. Error is a property of the field or
 *                      the form, not of the control that changes a view.
 *  9. selected       — this IS the on state: `--surface-inverse` fill,
 *                      `--ink-on-inverse` label, weight 500. Chapter 10 over
 *                      kwapso-ui.css (SEL-1).
 * 10. read-only      — does not apply to a button.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The kit states one height per size
 *  at every width, so the toggle does not grow, stack or collapse on its own.
 *  Where a 44 touch target is wanted the call site asks for `size="lg"`.
 *
 * RTL — safe. Every inset is logical (`px-*` is padding-inline), the icon slot
 * is order-driven by `gap`, and the press moves on the block axis, which does
 * not mirror.
 */
const Toggle = React.forwardRef<
  React.ComponentRef<typeof TogglePrimitive.Root>,
  ToggleProps
>(({ className, variant = "default", size = "default", ...props }, ref) => (
  <TogglePrimitive.Root
    ref={ref}
    data-slot="toggle"
    className={cn(toggleVariants({ variant, size }), className)}
    {...props}
  />
));

Toggle.displayName = "Toggle";

export { Toggle, toggleVariants };
