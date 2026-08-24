/* ============================================================================
   Field — the label + control + help + error wrapper (154 direct call sites,
   the most-called component in the system).

   DESIGN SOURCE
   design-mothership/specimens/kwapso-ui.css → `.kw-field` (column, gap
     `--space-2`), `.kw-field__label` (caption step, weight 500, primary ink),
     `.kw-field__help` (badge step, tertiary ink), `.kw-field--error`.
   design-mothership/specimens/_fragments/t9.css → `.kw-field__error` and
     `.kw-field__error-dot` (chapter 9: the message is INK text led by a small
     poppy dot — "error text poppy-free"), and `.kw-textbox__footer` /
     `.kw-textbox__count` for the counter row.
   design-mothership/specimens/_fragments/t9-inputs.html — the six drawn
     states, and the fact that the error message REPLACES the helper line
     rather than sitting under it.

   THE LAW THIS FILE OBEYS
   · This component draws no box, no fill and no hairline of its own. It is a
     stack: header, control, footer. The pill, the hairline and the 65% poppy
     border all belong to the control inside it (`input`, `textarea`,
     `select`), which already draws them.
   · THE MESSAGE IS INK, NEVER POPPY. Chapter 9 is explicit — the poppy lives
     on the field's border and on the small dot, and the words stay readable.
     kwapso-ui.css colours the whole helper line danger; that is the older
     drawing and it loses here, exactly as `input.tsx` ruled it (GAPS.md
     INP-2, restated in GAPS-C.md FLD-1).
   · Disabled is an ink, never an opacity. The root carries `data-disabled`
     and the label and helper read it through `group-data-[disabled]`, which
     is the hook `label.tsx` already ships.
   · Focus is ONE global rule (tokens.css §8). A Field is not focusable, adds
     no ring and never writes `outline: none`.
   · Every user-facing string is a prop with a default, and the one string
     this file owns — the required marker — is a WORD, not an asterisk. The
     kit's own ruling 26 says the mark never carries meaning alone; a glyph
     that means "required" in one alphabet does not travel to Arabic, Urdu or
     Persian.

   HOW THE CONTROL IS WIRED
   A call site should never have to invent an id. Field mints one, hands it to
   the label, and injects it into the control together with the
   `aria-describedby` chain and `aria-invalid`. Two shapes are accepted:

     <Field label="Account name" help="Shown on every invoice.">
       <Input />
     </Field>

     <Field label="Time zone">
       {(control) => (
         <Select><SelectTrigger {...control}><SelectValue /></SelectTrigger></Select>
       )}
     </Field>

   The second exists because a composed control keeps its accessible identity
   on an inner element — `SelectTrigger`, not `Select` — and a blind clone
   onto the root would put the id on the wrong node.

   ONLY ARIA IS INJECTED, NEVER A COMPONENT PROP. `aria-invalid` reaches the
   skin because `input`, `textarea` and `select` all fold it into their own
   `error` state themselves. Injecting an `error` prop instead would land an
   unknown attribute on a bare `<input>` and warn.

   RENDERING CONTEXT
   `"use client"`. `React.useId` is a hook, so this module cannot render as a
   Server Component even though it attaches no handler of its own.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { Label } from "../label/label";

/* ----------------------------------------------------------------------------
   The props Field injects into the control it wraps. Exported as a type so a
   render-prop call site can name it.
   ------------------------------------------------------------------------- */
export interface FieldControlProps {
  /** The id Field minted (or the one the child already carried). */
  id: string;
  /** The help line, the error line, and anything the child already named. */
  "aria-describedby"?: string;
  /** Set only when the field is in error; `undefined` otherwise, never `false`. */
  "aria-invalid"?: true;
  /** Mirrors Field's own `required`. */
  required?: boolean;
  /** Mirrors Field's own `disabled`. */
  disabled?: boolean;
}

/** Join the ids the control should point at, dropping the ones that are absent. */
function joinIds(...ids: Array<string | undefined>): string | undefined {
  const present = ids.filter((value): value is string => Boolean(value));
  return present.length > 0 ? present.join(" ") : undefined;
}

/* ----------------------------------------------------------------------------
   The error mark — local, not exported.

   Chapter 9 draws a small poppy dot leading an ink message. The kit draws it
   at 6 where `--dot-status` is 7 (t9-gaps.md T9-7 keeps the drawn size rather
   than snapping to the token), so the drawn size is kept here too, in rem.
   ------------------------------------------------------------------------- */
function ErrorDot() {
  return (
    <span
      aria-hidden="true"
      className="size-[0.375rem] shrink-0 rounded-pill bg-destructive"
    />
  );
}

const helpClasses = [
  // badge · 12 / 500 — a real utility; tokens.css §10 registers the step.
  "text-badge text-ink-tertiary",
  "group-data-[disabled]:text-ink-disabled",
  "transition-colors duration-[var(--duration-colour)] ease-kwapso",
];

const errorClasses = [
  // `.kw-field__error`: a row, centred, `--space-2` between dot and words.
  // Centred because that is how chapter 9 draws it; a first-line alignment
  // would need an optical offset the kit does not state.
  "flex items-center gap-2",
  // Ink, never poppy. Chapter 9, and the reason this component exists.
  "text-badge text-foreground",
];

export interface FieldProps extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  /**
   * The words above the control. A node, so a call site may put a tooltip or
   * a unit beside the text. Omit it entirely for a control that is labelled
   * somewhere else.
   */
  label?: React.ReactNode;
  /**
   * Keep the label for screen readers but take it off the screen — a filter
   * row or a table cell where the column heading already says it. The label
   * is still rendered and still associated; it is not dropped.
   */
  hideLabel?: boolean;
  /**
   * The quiet line under the control. Badge step, tertiary ink. Replaced by
   * `error` when there is one, which is how chapter 9 draws it: the specimen
   * error field carries a message where the helper line was, not both.
   */
  help?: React.ReactNode;
  /**
   * The field has failed validation. A node is the message; `true` marks the
   * field invalid without printing one, for a form that reports its errors in
   * a summary elsewhere. Either way the control receives `aria-invalid` and
   * takes its own 65% poppy border.
   */
  error?: React.ReactNode | boolean;
  /**
   * Announce the message as it appears, for a validation pass that runs while
   * focus is somewhere else. Off by default: a live region that re-announces
   * on every keystroke is worse than silence, and a message reached through
   * `aria-describedby` is already read when the control takes focus.
   */
  announce?: boolean;
  /** The control cannot be filled in. Passed down, and the words go to disabled ink. */
  disabled?: boolean;
  /** The control must be filled in. Passed down, and the marker below is drawn. */
  required?: boolean;
  /**
   * The word beside the label of a required field. A word rather than an
   * asterisk, per the kit's own "the mark never carries meaning alone".
   * Translatable; the kit has no English for this, so the plainest is used.
   */
  requiredLabel?: string;
  /**
   * Characters used so far. Draws the counter chapter 9 puts in the textarea
   * shell's footer. `textarea.tsx` hands this job here on purpose: a second
   * bordered shell around a field that already draws its own border would
   * double the hairline.
   */
  count?: number;
  /** The limit the counter counts towards. Usually the control's `maxLength`. */
  countMax?: number;
  /**
   * Replace the counter's formatting. The default prints the kit's own
   * "96 / 400" — two numbers and a separator, so it carries no language.
   */
  formatCount?: (count: number, max?: number) => string;
  /**
   * The control. Either a single element, which is cloned with the wiring
   * above, or a function that receives the wiring and places it itself.
   */
  children?: React.ReactNode | ((control: FieldControlProps) => React.ReactNode);
}

/**
 * The system's form row.
 *
 * TEN STATES
 *  1. default        — label above, control, helper below. No box of its own.
 *  2. hover          — does not apply. A Field is a stack, not a control; the
 *                      control inside it owns the border shift to
 *                      `--hair-strong`, and a wash on the row behind a field
 *                      would fight the field's own fill.
 *  3. focus-visible  — NOT here. tokens.css §8 rings the control at once, and
 *                      the control moves its own border to ink. A Field is
 *                      not in the tab order and adds nothing.
 *  4. active/pressed — does not apply. Nothing here is pressed; a click on
 *                      the label hands focus to the control.
 *  5. disabled       — `data-disabled` on the root; label and helper go to
 *                      `--ink-disabled` through the `group-data-[disabled]`
 *                      hook `label.tsx` already ships. An ink, never an
 *                      opacity. The control takes its own faint fill.
 *  6. loading        — does not apply to the wrapper. A field whose value has
 *                      not arrived takes the read-only skin and announces
 *                      `aria-busy` on the CONTROL (`input`, `textarea`); the
 *                      label and helper are known before the value is, so
 *                      there is nothing here to defer.
 *  7. empty          — the control's placeholder, in tertiary ink. A Field
 *                      with no label, no help and no error renders the
 *                      control alone rather than reserving empty rows.
 *  8. error          — `error`: the helper line is replaced by a small poppy
 *                      dot and an INK message, and the control receives
 *                      `aria-invalid` and draws its own 65% poppy border.
 *  9. selected       — does not apply. A form row is not selectable; the
 *                      selected thing is a value inside the control.
 * 10. read-only      — passed through untouched. The control loses its border
 *                      entirely (chapter 9: "system-set values lose the
 *                      border"); the label and helper are unchanged, because
 *                      a read-only value still needs saying what it is.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. A field row is one column at every
 *  width and takes its width from the parent. Chapter 9's one responsive
 *  statement is the FORM's — one column below 48rem, two above, never three —
 *  and it belongs to the form shell, which places Fields in a grid. A field
 *  that restacked itself would fight that grid.
 *
 * RTL — safe. The stack is vertical, the header and footer rows are ordered by
 * `gap` and `justify-between`, and no side is named. The error dot leads the
 * message on the reading-start side in Arabic, Urdu and Persian because it is
 * the first child, not because it is positioned.
 */
const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  (
    {
      className,
      label,
      hideLabel = false,
      help,
      error,
      announce = false,
      disabled = false,
      required = false,
      requiredLabel = "Required",
      count,
      countMax,
      formatCount,
      children,
      id: idProp,
      ...props
    },
    ref,
  ) => {
    const generatedId = React.useId();
    const fieldId = idProp ?? generatedId;

    // `true` marks the field invalid and prints nothing; a node is the
    // message. An empty string is neither.
    const invalid = error !== undefined && error !== null && error !== false && error !== "";
    const message = typeof error === "boolean" ? undefined : error;
    const showMessage = invalid && message !== undefined && message !== null;

    const helpId = help !== undefined && help !== null && !showMessage ? `${fieldId}-help` : undefined;
    const errorId = showMessage ? `${fieldId}-error` : undefined;

    const control: FieldControlProps = {
      id: fieldId,
      "aria-describedby": joinIds(helpId, errorId),
      "aria-invalid": invalid ? true : undefined,
      required: required || undefined,
      disabled: disabled || undefined,
    };

    /* The child keeps every prop it set itself; Field only fills the holes.
       `aria-describedby` is the one exception and is merged rather than
       chosen, so a control that already points at a unit or a hint keeps
       pointing at it as well as at this row's message. */
    let rendered: React.ReactNode;
    if (typeof children === "function") {
      rendered = children(control);
    } else if (React.isValidElement(children)) {
      const childProps = children.props as Record<string, unknown>;
      const merged: Record<string, unknown> = {
        id: (childProps.id as string | undefined) ?? control.id,
        "aria-describedby": joinIds(
          childProps["aria-describedby"] as string | undefined,
          control["aria-describedby"],
        ),
      };
      if (control["aria-invalid"] && childProps["aria-invalid"] === undefined) {
        merged["aria-invalid"] = true;
      }
      if (control.required && childProps.required === undefined) merged.required = true;
      if (control.disabled && childProps.disabled === undefined) merged.disabled = true;

      rendered = React.cloneElement(children as React.ReactElement<Record<string, unknown>>, merged);
    } else {
      rendered = children;
    }

    const counter =
      count === undefined
        ? null
        : (formatCount ?? defaultFormatCount)(count, countMax);

    const footer = showMessage || helpId !== undefined || counter !== null;

    return (
      <div
        ref={ref}
        data-slot="field"
        data-disabled={disabled ? "" : undefined}
        data-invalid={invalid ? "" : undefined}
        // `group` so the label and the helper can read `data-disabled` above
        // them.
        //
        // FLD-B4 — the column gap is 6 (`--space-1h`), not 8. Every field
        // column in CH09 draws `display: flex; flex-direction: column;
        // gap: 6px`, and the artifact uses the same 6 for the gap ABOVE the
        // control (label → field) and the one BELOW it (field → helper /
        // error / counter), which is why one value on the column is the whole
        // change. The 8 was `.kw-field`'s `--space-2` from kwapso-ui.css.
        className={cn(
          "group flex w-full min-w-0 flex-col gap-[var(--space-1h)]",
          className,
        )}
        {...props}
      >
        {label !== undefined && label !== null ? (
          <div className={cn("flex items-baseline gap-2", hideLabel && "sr-only")}>
            <Label htmlFor={fieldId}>{label}</Label>
            {required ? (
              <span data-slot="field-required" className="text-badge text-ink-tertiary">
                {requiredLabel}
              </span>
            ) : null}
          </div>
        ) : null}

        {rendered}

        {footer ? (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {showMessage ? (
                <p
                  id={errorId}
                  data-slot="field-error"
                  aria-live={announce ? "polite" : undefined}
                  className={cn(errorClasses)}
                >
                  <ErrorDot />
                  <span className="min-w-0">{message}</span>
                </p>
              ) : helpId !== undefined ? (
                <p id={helpId} data-slot="field-help" className={cn(helpClasses)}>
                  {help}
                </p>
              ) : null}
            </div>

            {counter !== null ? (
              /* Chapter 9's `.kw-textbox__count`: badge step, TERTIARY ink,
                 tabular so the number does not jitter as it counts.

                 CORRECTED 2026-08-23 with `CommandShortcut` and
                 `DropdownMenuShortcut`, which carried the identical invented
                 claim. This line used to say "disabled ink" and cite chapter
                 9 for it. **Chapter 9 draws no such thing**: its 150
                 declarations contain `color: var(--fg4)` and `color:
                 var(--fg3)` and never `--fgdis`, and ruling 27 resolves both
                 of those to tertiary's own `#5f5d59`. CH01: "#a8a59f now
                 means disabled and nothing else."

                 GAPS-CONTRAST did not measure this one. Measured here:
                 **2.206:1 light / 3.689:1 dark** against 4.5, on all three
                 of the demo's counters — and the third of those reads
                 "180 / 140". An over-limit counter is the moment the reader
                 most needs the number, this component gives it no separate
                 treatment, and it was being drawn in the one tier excused
                 from being legible. */
              <span
                data-slot="field-count"
                aria-hidden="true"
                className="shrink-0 text-badge tabular-nums text-ink-tertiary"
              >
                {counter}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  },
);

/**
 * The kit's own counter format: "96 / 400". Two numbers and a separator, so
 * the digits come from the runtime's numeral system and nothing needs
 * translating. Replaced wholesale through `formatCount`.
 */
function defaultFormatCount(count: number, max?: number): string {
  return max === undefined ? String(count) : `${count} / ${max}`;
}

Field.displayName = "Field";

export { Field, helpClasses as fieldHelpClasses, errorClasses as fieldErrorClasses };
