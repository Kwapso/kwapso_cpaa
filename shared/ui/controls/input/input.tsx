/* ============================================================================
   Input — the form field (80 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/kwapso-ui.css → `.kw-field__input`
   design-mothership/specimens/_fragments/t9.css + t9-inputs.html (chapter 9,
   text inputs — the six states the kit actually draws).

   THE LAW THIS FILE OBEYS
   · A field is 44 tall (`--control-height-input`), a full pill, page fill,
     ONE 1px hairline. Form fields are one of the two blessed places a
     hairline is allowed at all — a button still has none.
   · Focus is ONE global rule (tokens.css §8) and this file adds NOTHING to it.
     It used to also drive its own hairline to full ink on focus; that stroke
     sat immediately inside the ring and the pair read as one thick line —
     review 1A · fix 4. The kit's additional "10% ink halo" is deliberately
     not drawn here either — see GAPS.md INP-1, both sides quoted.
   · Disabled is a fill and an ink (`--hair-faint` / `--ink-disabled`), never
     an opacity — plus the 8% edge, which since override 42 is a step DOWN
     from the resting field's 20% rather than the same stroke.
   · There is no hover. Override 42; see the `default` variant.
   · Read-only loses its edge ENTIRELY — a system-set value is not a field you
     failed to edit — and it is NOT a focus target: `tabIndex={-1}` plus
     `data-readonly`, per review 1A · fix 5. Being greyed is the affordance.
   · NO `border` property in any state (review 1A · fix 2). ch02's carve-out
     keeps a hairline on a FIELD, and the artifact draws that hairline as an
     inset shadow — `--hairline-strong` at rest and `--hairline` disabled, per
     CH09's own two values (override 42).
   · THIS EDGE IS NOT CONFORMANT AND THE 20% DOES NOT MAKE IT SO. Measured
     1.526 : 1 in light and 2.142 in dark, and WCAG 1.4.11 asks 3 : 1 of a
     control boundary.
     3 : 1 would need roughly 47% ink, which is a border, and this system has
     no borders. Override 42 is about rest-versus-disabled, not conformance.
   · The placeholder is tertiary ink (`--muted-foreground`); ruling 27 folded
     the old hint tier into it.
   · Radius is `--radius-pill`. The 24 radius belongs to `textarea`, not here.

   WHY THE STATE IS A cva VARIANT AND NOT A STACK OF `disabled:` UTILITIES
   `disabled:shadow-x`, `[readonly]:shadow-y` and `aria-invalid:shadow-z` all
   carry the same CSS specificity, so which one paints is decided by the order
   Tailwind happens to emit them in. A component may not depend on that. The
   field's exclusive state is resolved once in JS and one class set is emitted,
   so the precedence below is a fact of this file rather than of a stylesheet.

     disabled  >  read-only (and loading)  >  error  >  default

   RENDERING CONTEXT
   No `"use client"`. No hook, no state, no browser API, no event handler.
   ========================================================================= */

import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils";

const inputVariants = cva(
  [
    "flex w-full min-w-0 appearance-none",
    // 44 tall · 18 inline padding (`--space-4h`, CH09 `padding: 0 18px`) · full
    // pill · one hairline. FLD-B2: the whole 44-field family moved together.
    "h-[var(--control-height-input)] px-[var(--space-4h)] rounded-pill",
    // FLD-B5 — the fill is the CARD tone, not the page. CH09 draws
    // `background: var(--card)` on every one of its fields and the spec line
    // reads "off-beige fill on paper": the field flips against its ground the
    // way a card does. Identical in light (`--card` and `--background` are
    // both `#FFFEF9`); in dark it is the whole fix, because `--background` is
    // the page (`#141310`) and a field painted in it reads as a hole in the
    // panel rather than as raised paper. `search-input` already drew this
    // same shape on `--surface-raised`, so the two field drawings in this
    // chapter now agree.
    "bg-card text-foreground",
    // 14/300 — the control label step.
    "text-sm font-[var(--font-weight-light)]",
    // Placeholders show an example, never repeat the label. Tertiary ink.
    "placeholder:text-muted-foreground",
    // The empty state IS the placeholder; nothing else marks it.
    "transition-[box-shadow,background-color]",
    "duration-[var(--duration-colour)] ease-kwapso",
    // A file input carries no second box of its own.
    "file:border-0 file:bg-transparent file:text-sm file:text-foreground",
    "file:font-[var(--font-weight-medium)]",
  ],
  {
    variants: {
      /** Mutually exclusive. Resolved once, in JS, below. */
      state: {
        default: [
          /* OVERRIDE 42 — THE RESTING EDGE IS `--hair-strong`, AND THERE IS
             NO HOVER. CH09 draws a resting field as
             `border: 1px solid var(--hair2)` — 20% — and a disabled one as
             `var(--hair)` — 8%. The build had the two swapped: 8% at rest,
             promoted to 20% on hover. Disabled was already right, which is
             what made the swap visible — a resting field and a disabled one
             carried the SAME edge, and telling those apart is the one job
             that edge has. Measured before: 1.175 light / 1.391 dark at
             rest against 1.172 / 1.457 disabled. After: 1.526 / 2.142 at
             rest, disabled untouched. Measured on the built kit, both
             palettes, before and after.

             THE HOVER IS GONE AND NOTHING REPLACES IT. It has no source in
             the artifact; it came from `kwapso-ui.css`. The artifact draws a
             field at rest, at focus and disabled, and that is the set. State
             2 below is therefore marked as not applying, which is the same
             answer `button.tsx` gives for states it does not draw. */
          "shadow-[var(--hairline-strong)]",
          /* Focus adds NOTHING here. This state used to also drive the
             hairline to full ink on focus, which stacked a second heavy
             stroke immediately inside the global 2px ring — that doubling is
             what review 1A · fix 4 reported as "the focus line is too thick".
             The ring is the focus treatment, stated once in tokens.css §8;
             the field's own edge does not move. */
        ],

        /**
         * Chapter 9: the hairline is poppy at 65% (`--hairline-error`). The
         * `color-mix` behind that token keeps the 65% token-driven, so dark
         * re-resolves `--destructive` to poppy-lift and the field is correct
         * in both palettes with no second value. This contradicts
         * kwapso-ui.css, which draws a full-strength edge — GAPS.md INP-2.
         */
        error: ["shadow-[var(--hairline-error)]"],

        /** "System-set values lose the edge entirely." Faint fill, no hairline. */
        readOnly: ["shadow-none bg-hair-faint"],

        /* A fill and an ink — and `--hairline`, the artifact's 8%, which is
           now the WEAKER of the two strengths rather than the same one the
           resting field carries. Override 42. The three `hover:` freezes
           that used to sit here, in `error` and in `readOnly` existed only
           to hold the default's hover still; with no hover to hold, they are
           dead weight and are gone. */
        disabled: ["cursor-not-allowed shadow-[var(--hairline)] bg-hair-faint text-ink-disabled"],
      },
    },
    defaultVariants: {
      state: "default",
    },
  },
);

export interface InputProps extends React.ComponentPropsWithoutRef<"input"> {
  /**
   * The field has failed validation. Also sets `aria-invalid` when the call
   * site has not set it itself. A call site that already passes
   * `aria-invalid` gets the error skin without passing this too.
   */
  error?: boolean;
  /**
   * The value has not arrived yet. The field takes the read-only skin, becomes
   * non-editable and announces `aria-busy` — a field you can type into before
   * its value loads will discard what you typed. Derived, not drawn by the
   * kit: GAPS.md INP-3.
   */
  loading?: boolean;
}

/**
 * The system's text field.
 *
 * TEN STATES
 *  1. default        — page fill, one hairline at `--hair-strong`, pill.
 *  2. hover          — does not apply. The artifact draws a field at rest, at
 *                      focus and disabled, and no hover for any of them; the
 *                      one this file used to carry came from kwapso-ui.css
 *                      and had no source in the kit (override 42). A field is
 *                      not a button and the cursor already changes. NOTHING
 *                      replaces it — the next thing a field does is state 3.
 *  3. focus-visible  — the RING and nothing else (tokens.css §8). The field's
 *                      own hairline does not move; two strokes at once read as
 *                      one thick one (review 1A · fix 4).
 *  4. active/pressed — does not apply. A text field is not pressed; the
 *                      equivalent moment is focus, which is state 3.
 *  5. disabled       — `--hair-faint` fill, `--ink-disabled` ink, and the
 *                      WEAK edge (`--hair`, 8%) against the resting field's
 *                      20% — override 42.
 *  6. loading        — `loading`: read-only skin, non-editable, `aria-busy`.
 *  7. empty          — the placeholder, in tertiary ink. An empty field draws
 *                      nothing else; it is not an error until it is submitted.
 *  8. error          — `error` or `aria-invalid`: poppy hairline at 65%. The
 *                      MESSAGE beside it is ink, never poppy, and belongs to
 *                      `field`, not here (chapter 9: "error text poppy-free").
 *  9. selected       — does not apply. There is no selected text input; a
 *                      field is focused (state 3) or it is not. Text selection
 *                      inside it is the platform's, and the kit does not
 *                      restyle it.
 * 10. read-only      — `readOnly`: the edge goes away entirely, faint fill, and
 *                      the field leaves the tab order (review 1A · fix 5).
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. `w-full` at every width, and 44 tall
 *  at every width, which is already the touch row, so nothing has to grow on a
 *  phone. The one responsive move in this chapter is the FORM's: one column
 *  below 48rem, two above, never three. That belongs to the `form` shell, not
 *  to the field (see GAPS.md INP-4).
 *
 * RTL — safe. `px-*` is padding-inline; no side is named anywhere. The value's
 * own direction follows the document, which is what an Arabic, Urdu or Persian
 * field needs.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type = "text",
      error,
      loading = false,
      disabled = false,
      readOnly = false,
      "aria-invalid": ariaInvalid,
      ...props
    },
    ref,
  ) => {
    // A call site may say it either way: the `error` prop, or `aria-invalid`
    // straight from a form library. Both reach the same skin.
    const invalid = error ?? (ariaInvalid === true || ariaInvalid === "true");
    const locked = readOnly || loading;

    // One exclusive state, resolved here so no two class sets can race.
    const state = disabled ? "disabled" : locked ? "readOnly" : invalid ? "error" : "default";

    return (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        data-state={state}
        /* Review 1A · fix 5: "a read-only component takes no focus outline and
           cannot be tabbed to." `tabIndex={-1}` takes it out of the tab order;
           `data-readonly` kills the ring for a click-through, in tokens.css §8.
           A call site that must keep a read-only field reachable can still
           pass its own `tabIndex` — the spread below wins. */
        data-readonly={locked ? "true" : undefined}
        tabIndex={locked ? -1 : undefined}
        disabled={disabled}
        readOnly={locked}
        aria-invalid={invalid || undefined}
        aria-busy={loading || undefined}
        className={cn(inputVariants({ state }), className)}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

export { Input, inputVariants };
