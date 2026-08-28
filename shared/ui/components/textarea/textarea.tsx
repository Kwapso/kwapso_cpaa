/* ============================================================================
   Textarea — the multi-line field (12 direct call sites).

   DESIGN SOURCE
   design-mothership/specimens/kwapso-ui.css → `textarea.kw-field__input`
     (height auto · min-height 6rem · padding-block `--space-3` ·
      `--radius-card` · resize vertical), on top of the `.kw-field__input`
      skin `input.tsx` already carries.
   design-mothership/specimens/_fragments/t9.css → `.kw-textbox__area`
     (the body is the 14 control step on `--leading-normal`, tertiary ink
      placeholder) and `.kw-textbox` (chapter 9: "the one 24px-radius shell
      in the chapter").

   THE LAW THIS FILE OBEYS
   · This is the ONE field that is a box and not a pill. `input.tsx` says so
     in its own header — "the 24 radius belongs to textarea, not here" — and
     this file is the other half of that sentence.
   · One 1px hairline, drawn as an INSET SHADOW and never as a `border`
     property (review 1A · fix 2). Form fields are one of the blessed places a
     hairline is allowed at all; a button still has none. CH09 states TWO
     strengths for it — `--hair2` (20%) at rest, `--hair` (8%) disabled — and
     override 42 puts them back the way the artifact draws them.
   · There is no hover, and nothing replaces it. Override 42.
   · THE EDGE IS NOT CONFORMANT AT EITHER STRENGTH. 1.526 : 1 light against
     WCAG 1.4.11's 3 : 1 for a control boundary; 3 : 1 needs about 47% ink,
     which is a border. Override 42 answers rest-versus-disabled, not that.
   · Focus is ONE global rule (tokens.css §8) and this file adds nothing to
     it — see review 1A · fix 4, and `input.tsx` for the same note.
     Chapter 9's additional "10% ink halo" is deliberately not drawn, for the
     same reason `input.tsx` does not draw it — see GAPS.md INP-1.
   · Disabled is a fill and an ink (`--hair-faint` / `--ink-disabled`), never
     an opacity, and it keeps the 8% edge — a step DOWN from the resting
     field's 20%, which is what tells the two apart.
   · Read-only loses its edge ENTIRELY, and is not tabbable (review 1A ·
     fix 5) — a system-set value is not a field
     you failed to edit.
   · The placeholder is tertiary ink (`--muted-foreground`); ruling 27 folded
     the old hint tier into it.

   WHY THE STATE IS A cva VARIANT AND NOT A STACK OF `disabled:` UTILITIES
   Identical to `input.tsx`, and for the identical reason: `disabled:shadow-x`,
   `[readonly]:shadow-y` and `aria-invalid:shadow-z` carry the same CSS
   specificity, so which one paints would be decided by the order Tailwind
   happens to emit them in. Resolved once, in JS:

     disabled  >  read-only (and loading)  >  error  >  default

   RENDERING CONTEXT
   No `"use client"`. No hook, no state, no browser API, no event handler.
   ========================================================================= */

import * as React from "react";

/** `useLayoutEffect` warns when React renders on the server; the measurement
    must still run before paint in a browser, or a composer that has grown
    arrives one frame late and the sentence jumps under the cursor. The choice
    is made once, here — the same line `tabs.tsx` and `use-debounce.ts` make. */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils";

const textareaVariants = cva(
  [
    "flex w-full min-w-0 appearance-none",

    // The one box-radius field. 96 tall at rest, 16 inline / 14 block
    // padding, one hairline. `min-h` and not `h`, because a textarea grows.
    //
    // FLD-B3 — the block inset is 14 (`--space-3h`), not 12. CH09 draws the
    // textarea shell `padding: 14px 16px`; the 12 came from kwapso-ui.css's
    // `padding-block: --space-3`, and where the two disagree the artifact
    // wins. The INLINE inset stays 16, not the 18 the 44-tall pill fields
    // took in FLD-B2: this is the one box-radius field and CH09 draws it
    // apart from the pills on purpose.
    "min-h-[6rem] px-4 py-[var(--space-3h)] rounded-[var(--radius)]",
    // FLD-B5 — the fill is the CARD tone, not the page. CH09 draws
    // `background: var(--card)` on every field and the spec line reads
    // "off-beige fill on paper": a field flips against its ground exactly as
    // a card does. Identical in light (both `#FFFEF9`); in dark this is the
    // whole fix, because `--background` is the page (`#141310`) and a field
    // drawn in it reads as a hole in the panel instead of raised paper.
    // `search-input` already drew the same shape on `--surface-raised`, so
    // this also ends a disagreement between two fields in the same chapter.
    "bg-card text-foreground",

    // 14/300 — the control step — on the normal leading, because unlike a
    // one-line field this one has more than one line to lead.
    "text-sm font-[var(--font-weight-light)] leading-[var(--leading-normal)]",

    // Placeholders show an example, never repeat the label. Tertiary ink.
    // The empty state IS the placeholder; nothing else marks it.
    "placeholder:text-muted-foreground",

    // Vertical only. A horizontally resizable field breaks the form grid,
    // and the grid is chapter 9's one responsive statement.
    "resize-y",

    "transition-[box-shadow,background-color]",
    "duration-[var(--duration-colour)] ease-kwapso",
  ],
  {
    variants: {
      /** Mutually exclusive. Resolved once, in JS, below. */
      state: {
        default: [
          /* OVERRIDE 42 — the resting edge is `--hair-strong` (CH09's
             `var(--hair2)`, 20%) and the disabled one stays `--hair` (8%).
             The build had them swapped, so a resting field and a disabled
             one carried the same stroke. The hover that used to promote 8%
             to 20% is GONE and nothing replaces it: it came from
             kwapso-ui.css and the artifact draws no hover on a field.
             Identical to `input.tsx`, for the same chapter. */
          "shadow-[var(--hairline-strong)]",
          /* Focus adds nothing: the global ring IS the focus treatment, and
             a second stroke inside it reads as one thick line — review 1A ·
             fix 4, identical to `input.tsx`. */
        ],

        /**
         * Chapter 9: the hairline is poppy at 65% (`--hairline-error`), drawn
         * as an inset shadow like every other edge in the system (review 1A ·
         * fix 2). Same treatment, same contradiction with kwapso-ui.css, as
         * GAPS.md INP-2.
         */
        error: ["shadow-[var(--hairline-error)]"],

        /**
         * "System-set values lose the edge entirely." Faint fill, no
         * hairline, no grab handle, and out of the tab order (review 1A ·
         * fix 5) — there is nothing to resize into and nothing to type.
         */
        readOnly: ["shadow-none bg-hair-faint resize-none"],

        /* A fill, an ink, and the 8% edge — which is now a step DOWN from
           the resting field rather than the same stroke (override 42). The
           `hover:` freezes that used to sit in this variant, in `error` and
           in `readOnly` existed only to hold the default's hover still, and
           there is no longer a hover to hold. */
        disabled: [
          "cursor-not-allowed shadow-[var(--hairline)] bg-hair-faint text-ink-disabled",
          "resize-none",
        ],
      },
    },
    defaultVariants: {
      state: "default",
    },
  },
);

export interface TextareaProps extends React.ComponentPropsWithoutRef<"textarea"> {
  /**
   * The field has failed validation. Also sets `aria-invalid` when the call
   * site has not set it itself. A call site that already passes
   * `aria-invalid` straight from a form library gets the error skin without
   * passing this too.
   */
  error?: boolean;
  /**
   * The value has not arrived yet. The field takes the read-only skin,
   * becomes non-editable and announces `aria-busy` — typing into a field
   * whose value has not loaded discards what you typed. Derived exactly as
   * `input.tsx` derives it: GAPS.md INP-3.
   */
  loading?: boolean;
  /**
   * The field takes the height of what is in it, between one line and
   * whatever `max-height` the call site sets in CSS — and scrolls once it
   * reaches that cap, so nothing a person typed is ever unreachable.
   *
   * OFF by default, because the standing textarea is 96 tall and draggable
   * (`min-h-[6rem]` + `resize-y`) and that is chapter 9's field. This is for
   * the composer shape: one line at rest, growing under the sentence.
   *
   * The CAP STAYS IN CSS. This sets `height` and reads back what the browser
   * allowed, so `max-h-[9rem]` at the call site is still the design decision
   * and this is only the mechanism.
   */
  autoGrow?: boolean;
  /**
   * Told when the field crosses from one line to more, and back. Only fires
   * with `autoGrow`, and only on a CHANGE.
   *
   * It exists so a call site can honour the rule `chat.tsx` states for its own
   * composer — "a pill that has grown three lines tall is a stadium" — without
   * measuring the textarea a second time from outside. `Chat` knows it is
   * multiline because it was TOLD; `AgentChat` grows on its own, so the same
   * fact has to be measured, and it is measured here where the height is
   * already being set.
   */
  onGrownChange?: (grown: boolean) => void;
}

/**
 * The system's multi-line field.
 *
 * TEN STATES
 *  1. default        — page fill, one hairline at `--hair-strong`, the 24 box
 *                      radius.
 *  2. hover          — does not apply. The artifact draws no hover on a field
 *                      in CH09; the one this file carried came from
 *                      kwapso-ui.css (override 42). Nothing replaces it — the
 *                      next thing a field does is state 3.
 *  3. focus-visible  — the RING and nothing else; tokens.css §8
 *                      and this file adds none.
 *  4. active/pressed — does not apply. A text field is not pressed; the
 *                      equivalent moment is focus, which is state 3.
 *  5. disabled       — `--hair-faint` fill, `--ink-disabled` ink, the WEAK 8%
 *                      edge against the resting field's 20% (override 42),
 *                      resize handle withdrawn.
 *  6. loading        — `loading`: read-only skin, non-editable, `aria-busy`.
 *  7. empty          — the placeholder, in tertiary ink. An empty field draws
 *                      nothing else; it is not an error until it is submitted.
 *  8. error          — `error` or `aria-invalid`: poppy hairline at 65%. The
 *                      MESSAGE beside it is ink, never poppy, and belongs to
 *                      `field`, not here (chapter 9: "error text poppy-free").
 *  9. selected       — does not apply. There is no selected text field; it is
 *                      focused (state 3) or it is not. Text selection inside
 *                      it is the platform's, and the kit does not restyle it.
 * 10. read-only      — `readOnly`: the edge goes away entirely, faint fill,
 *                      no resize handle, and out of the tab order (fix 5).
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. `w-full` and 96 min-tall at every
 *  width; the field inherits its column from the parent. The one responsive
 *  move in this chapter is the FORM's — one column below 48rem, two above,
 *  never three — and a textarea normally takes `.kw-form__full`, which is the
 *  form shell's decision and not this component's (GAPS.md INP-4).
 *
 * RTL — safe. `px-*`/`py-*` are padding-inline and padding-block; no side is
 * named. The value's own direction follows the document, and the browser puts
 * the resize grip on the reading-end corner by itself.
 *
 * NOT HERE — the character counter. Chapter 9 draws the textarea inside a
 * `.kw-textbox` shell whose footer carries the helper line and a tabular
 * "96 / 400" count in disabled ink. That shell is a composition of a field, a
 * hint and a count; it belongs to `field`, which has 154 call sites of its
 * own. See GAPS-B.md TXA-1.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      error,
      loading = false,
      disabled = false,
      readOnly = false,
      autoGrow = false,
      onGrownChange,
      "aria-invalid": ariaInvalid,
      ...props
    },
    ref,
  ) => {
    // The element is needed HERE to measure it, and the call site's ref must
    // still be honoured — so one internal ref, handed to both.
    const own = React.useRef<HTMLTextAreaElement | null>(null);
    const attach = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        own.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
      },
      [ref],
    );

    /* GROW TO THE SENTENCE, then scroll.
     *
     * `height: auto` first, because a textarea's `scrollHeight` never SHRINKS
     * below the height it is currently given — measure without resetting and
     * a field that grew to four lines stays four lines when the text is
     * deleted. Then `height` is set to the measured content, and the CSS
     * `max-height` clamps it: the cap is the call site's decision and this
     * only carries it out.
     *
     * The overflow follows the clamp rather than being written down: hidden
     * while the box still fits its text (so no scrollbar flickers over a
     * one-line composer), `auto` the moment it does not. `overflow-hidden`
     * as a fixed class is what made a long question INVISIBLE and
     * unscrollable at the same time.
     *
     * `props.value` is in the dependency list because a controlled field is
     * the shape both composers use; an uncontrolled one still re-measures on
     * every input through the handler below. */
    const wasGrown = React.useRef(false);
    useIsomorphicLayoutEffect(() => {
      const el = own.current;
      if (!autoGrow || !el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
      el.style.overflowY = el.scrollHeight > el.clientHeight ? "auto" : "hidden";

      /* ONE LINE, computed rather than assumed: the line box plus the block
         padding. Not `min-height` — a call site is free to hold the field open
         taller than its text, and then "as tall as the minimum" would report a
         single line as grown. */
      const cs = getComputedStyle(el);
      const line =
        parseFloat(cs.lineHeight || "0") +
        parseFloat(cs.paddingTop || "0") +
        parseFloat(cs.paddingBottom || "0");
      const grown = el.scrollHeight > Math.ceil(line) + 1;
      if (grown !== wasGrown.current) {
        wasGrown.current = grown;
        onGrownChange?.(grown);
      }
    }, [autoGrow, onGrownChange, props.value]);
    // A call site may say it either way: the `error` prop, or `aria-invalid`
    // straight from a form library. Both reach the same skin.
    const invalid = error ?? (ariaInvalid === true || ariaInvalid === "true");
    const locked = readOnly || loading;

    // One exclusive state, resolved here so no two class sets can race.
    const state = disabled ? "disabled" : locked ? "readOnly" : invalid ? "error" : "default";

    return (
      <textarea
        data-slot="textarea"
        data-state={state}
        /* Review 1A · fix 5 — a read-only component is not a focus target. */
        data-readonly={locked ? "true" : undefined}
        tabIndex={locked ? -1 : undefined}
        disabled={disabled}
        readOnly={locked}
        aria-invalid={invalid || undefined}
        aria-busy={loading || undefined}
        className={cn(textareaVariants({ state }), className)}
        {...props}
        ref={attach}
      />
    );
  },
);

Textarea.displayName = "Textarea";

export { Textarea, textareaVariants };
