/* ============================================================================
   Choice — the selection ROW: a mark, the words beside it, and the whole
   thing clickable (0 direct call sites; reached through the screen engine).

   DESIGN SOURCE
   design-mothership/specimens/_fragments/t10.css → `.kw-choice`
     (inline-flex, centred, `--space-2h` between mark and words, body-s,
     `cursor: pointer`) and `.kw-choice--locked` / `.kw-choice--locked
     .kw-choice__label` (not-allowed across the whole row, `--ink-disabled`
     words). TWO things in that first bracket are no longer taken from
     t10.css: the `body-s`, which override 32 replaces with the field label's
     caption step (`label.tsx` supplies it), and the `--space-2h`, which
     SEL-B2 replaces with the artifact's own 12. Everything else on the line
     still holds.
   design-mothership/specimens/_fragments/t10-selection.html — every mark in
     chapter 10 is drawn inside one of these rows: checkbox, radio and switch
     all appear as `<label class="kw-choice">` wrapping the control.
   The second line uses `.kw-field__help` from kwapso-ui.css (badge step,
     tertiary ink), which is the only quiet-line treatment the kit has.

   THE LAW THIS FILE OBEYS
   · THE ROW DRAWS NO MARK AND NO FILL. It is the label side of chapter 10.
     The mark is `Checkbox`, `RadioGroupItem` or `Switch`, passed in as the
     child, and each of those already draws chapter 10's ON-STATE: an
     INVERSE fill (`--surface-inverse`) with an `--ink-on-inverse` mark, not
     kwapso-ui.css's older mango. This file adds NO second selected
     treatment — a wash behind an inverse mark would be two on-states for one
     answer, and the kit draws none. Stated again at state 9.
   · Disabled is an ink, never an opacity: the words go to `--ink-disabled`
     and the whole row takes `cursor: not-allowed`, exactly as
     `.kw-choice--locked` draws it. The mark takes its own faint fill.
   · Focus is ONE global rule (tokens.css §8). A `<label>` is not focusable;
     the ring lands on the mark inside it. Nothing here defines a ring and
     nothing sets `outline: none`.
   · Hover: the kit draws NONE on `.kw-choice` and none is invented. Logged
     as GAPS-CE CHO-3 with the reason.
   · Logical properties only. `gap` orders the row, so the mark leads on the
     reading-start side in Arabic, Urdu and Persian with nothing written.

   HOW IT SITS INSIDE `Field`
   `field.tsx` mints an id and injects `id`, `aria-describedby`,
   `aria-invalid`, `required` and `disabled` into its single child. Landing
   that `id` on this `<label>` would be wrong — the id belongs to the CONTROL
   the label names. So Choice intercepts all five, keeps `htmlFor` for itself,
   and forwards the rest to the mark, adding its own description id to the
   `aria-describedby` chain rather than replacing what Field sent:

     <Field help="Everyone on the account is notified.">
       <Choice label="Notify the account owner">
         <Checkbox />
       </Choice>
     </Field>

   A composed control whose accessible identity lives on an inner node takes
   the render-prop form, the same escape hatch `field.tsx` ships:

     <Choice label="Public status page">
       {(control) => <Switch {...control} />}
     </Choice>

   RENDERING CONTEXT
   `"use client"`. `React.useId` is a hook, so this module cannot render as a
   Server Component even though it attaches no handler of its own.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { Label, labelClasses as fieldLabelClasses } from "../label/label";

/* ----------------------------------------------------------------------------
   What Choice hands to the mark. Exported as a type so a render-prop call
   site can name it, mirroring `FieldControlProps`.
   ------------------------------------------------------------------------- */
export interface ChoiceControlProps {
  /** The id Choice minted, or the one Field (or the call site) already sent. */
  id: string;
  /** Field's chain plus this row's own description line. */
  "aria-describedby"?: string;
  /** Set only when the row is invalid; `undefined` otherwise, never `false`. */
  "aria-invalid"?: true;
  /** Mirrors the row's `required`. */
  required?: boolean;
  /** Mirrors the row's `disabled`. */
  disabled?: boolean;
}

/** Join the ids the mark should point at, dropping the ones that are absent. */
function joinIds(...ids: Array<string | undefined>): string | undefined {
  const present = ids.filter((value): value is string => Boolean(value));
  return present.length > 0 ? present.join(" ") : undefined;
}

/* `.kw-choice` — the row itself. A plain array, not a cva: the row has one
   drawing and its disabled skin is a `group-data-` hook, not a variant
   (PATTERN §1). */
const rowClasses = [
  // `inline-flex`, 12 between mark and words. `group` so the words and the
  // quiet line can read `data-disabled` above them, which is the same hook
  // `label.tsx` already ships.
  //
  // SEL-B2 — the gap is 12, not the 10 `.kw-choice` carried. CH10 draws
  // `gap: 12px` on the checkbox row and on the radio row, and CH16 draws the
  // same 12 on its facet row: three drawings, one value. The chapter's fourth
  // row — the switch, which carries a second line of note under its words —
  // is drawn wider still, so 12 is the floor of the range and never above it.
  // The 10 came from kwapso-ui.css, the same source override 32 already
  // overruled once in this file for the label's step.
  "group inline-flex gap-3",
  // The words are the target as much as the mark is: chapter 10's answer to
  // a 22 mark sitting under the 44 touch row (GAPS-B.md SEL-6).
  "cursor-pointer select-none",
  "data-[disabled]:cursor-not-allowed",
];

/* THE WORDS ARE A FIELD LABEL — override 32, 2026-08-23, verify/open.html
   C17-1. They used to be `text-sm text-foreground`, chapter 10's `.kw-choice`
   step: 14 at weight 300, one size up and one weight down from every
   `.kw-field__label` sitting above them on the same settings panel. The
   client ruled the field label's step wins, so every checkbox, radio and
   switch row in both apps is now 13/500 and a settings screen is one type
   step top to bottom.

   THE STEP IS NOT RE-DECLARED HERE. `Label` is rendered `asChild` over the
   words, so `label.tsx` remains the only file in the system that says what a
   label is made of — which is what `label.tsx`'s own header has always
   claimed ("the field label AND the choice-row label").

   WHY `asChild` AND NOT A PLAIN `<Label>`. `LabelPrimitive.Root` renders a
   `<label>` element, and the choice ROW is already the `<label htmlFor=…>`
   that names the mark. A `<label>` may not contain another one: the HTML
   parser and the accessible-name computation both treat that as a fault, and
   the inner element would compete for the click the row exists to widen.
   `asChild` merges Radix's props onto the `<span>` below instead, so the
   component is used, the element stays a span, and nothing is duplicated.

   NOTHING IS LEFT TO WRITE. `Label` already ships the locked ink in both
   spellings (`peer-disabled` and `group-data-[disabled]`), and the row above
   is the `group`, so `.kw-choice--locked`'s disabled words come for free. It
   ships the colour transition too. This constant is therefore `Label`'s own
   list, re-exported under the name the demo's export sheet already lists, so
   that the two can never be two lists again. */
const labelClasses = fieldLabelClasses;

/* The quiet second line. `.kw-field__help` — badge step, tertiary ink. */
const descriptionClasses = [
  "text-badge text-ink-tertiary",
  "group-data-[disabled]:text-ink-disabled",
  "transition-colors duration-[var(--duration-colour)] ease-kwapso",
];

export interface ChoiceProps
  extends Omit<React.ComponentPropsWithoutRef<"label">, "children"> {
  /**
   * The words beside the mark. A node, so a call site can put a `Badge` or a
   * unit inside them. Omit for a bare mark whose name lives somewhere else —
   * a table's select-all header cell is the real case.
   */
  label?: React.ReactNode;
  /**
   * A glyph between the mark and the words — one of the kit's forty, at the
   * 20 size a row of this height carries. Ruling 34: an option that names a
   * module shows the module's icon, here as much as in the rail.
   */
  icon?: React.ReactNode;
  /**
   * A picture between the mark and the words — a logo, an avatar, a
   * thumbnail. Ruling 30's record mark: a 32 SQUARE at the 6 selection
   * radius, contained rather than cropped, `flex: none`. 32 rather than the
   * menu row's 24 because a choice row is two lines tall and a 24 mark
   * floats in it. Ignored when `icon` is given; a row carries one mark.
   */
  image?: string;
  /**
   * The picture's alternative text. `""` by default: the words beside it
   * already name the option, so the image is decorative and must not be
   * announced twice.
   */
  imageAlt?: string;
  /**
   * A quieter second line under the words: what the option actually does.
   * Wired to the mark through `aria-describedby`, so it is read after the
   * label rather than being invisible to a screen reader.
   */
  description?: React.ReactNode;
  /** The option cannot be chosen. Passed to the mark; the words go to disabled ink. */
  disabled?: boolean;
  /** The option must be answered. Passed to the mark, untouched here. */
  required?: boolean;
  /**
   * The row is part of a field that failed validation. Also accepted as
   * `aria-invalid`, which is the spelling `field.tsx` injects, so both reach
   * the mark. The ROW draws nothing for it: chapter 9 is explicit that the
   * poppy lives on the control and the message, never on the words.
   */
  invalid?: boolean;
  /**
   * The mark. Either a single element, which is cloned with the wiring above,
   * or a function that receives the wiring and places it itself.
   */
  children?: React.ReactNode | ((control: ChoiceControlProps) => React.ReactNode);
}

/**
 * The system's selection row.
 *
 * TEN STATES
 *  1. default        — mark, 10 of air, an optional image or icon, 10 more,
 *                      then the words at the FIELD LABEL's step, 13 / 500 on
 *                      primary ink, rendered through `Label` (override 32).
 *                      Chapter 10's own 14 / 300 is the stale side.
 *  2. hover          — NOT drawn, and that is the kit's drawing rather than
 *                      an omission: `.kw-choice` has no hover rule. A wash
 *                      behind the row would be a second on-state competing
 *                      with the inverse mark, and the mark's own hover (its
 *                      hairline to `--hair-strong`) already answers the
 *                      pointer. GAPS-CE CHO-3.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once
 *                      and the focusable node is the mark inside this row.
 *                      A `<label>` is not in the tab order.
 *  4. active/pressed — does not apply. Pressing the row presses the mark, and
 *                      a selection control's press IS its state change; the
 *                      kit draws no separate pressed skin for one.
 *  5. disabled       — `data-disabled` on the row: `cursor: not-allowed`
 *                      across the whole target and `--ink-disabled` words,
 *                      which is `.kw-choice--locked` exactly. An ink, never
 *                      an opacity. The mark takes its own faint fill.
 *  6. loading        — does not apply, and deliberately. A choice whose value
 *                      has not arrived must not render unanswered — that is a
 *                      wrong answer, not a missing one. The caller renders a
 *                      `Skeleton` in the row's place until the value exists.
 *                      Ruled once for the whole family in GAPS-B.md SEL-5.
 *  7. empty          — no `label`, no `description`, no `image` and no
 *                      `icon` renders the mark alone
 *                      rather than reserving an empty words column. No
 *                      children at all renders the words alone, which is what
 *                      a caller building a custom mark asked for.
 *  8. error          — `invalid` (or `aria-invalid`) is forwarded to the mark,
 *                      which draws chapter 9's 65% poppy hairline. The ROW
 *                      draws nothing: "error text poppy-free". The message
 *                      itself belongs to `Field`.
 *  9. selected       — belongs to the mark, and it is INVERSE:
 *                      `--surface-inverse` fill with an `--ink-on-inverse`
 *                      mark (chapter 10 over kwapso-ui.css's mango,
 *                      GAPS-B.md SEL-1). This row adds no second selected
 *                      treatment on purpose — see the header.
 * 10. read-only      — does not apply. HTML has no read-only checkbox, radio
 *                      or switch; a value the reader may not change is
 *                      `disabled`, which chapter 10 draws as "locked by
 *                      policy".
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED, and the row is the reason the kit
 *  can leave it unchanged: the mark is 22, under the 44 touch row, so chapter
 *  10 makes the WORDS part of the target instead of growing the mark on a
 *  phone. The row is `inline-flex`, so it is exactly as wide as its contents
 *  at every width and a long description wraps under the words rather than
 *  pushing the mark. A column of these takes its gap from the parent —
 *  `--space-3` (12) is what `radio-group` uses (GAPS-B.md SEL-7).
 *
 * RTL — safe. `gap` orders the row, so the mark sits at the reading start in
 * Arabic, Urdu and Persian with no rule written. No physical side is named.
 */
const Choice = React.forwardRef<HTMLLabelElement, ChoiceProps>(
  (
    {
      className,
      label,
      description,
      icon,
      image,
      imageAlt = "",
      disabled = false,
      required = false,
      invalid,
      children,
      id: idProp,
      htmlFor,
      "aria-describedby": describedByProp,
      "aria-invalid": ariaInvalid,
      ...props
    },
    ref,
  ) => {
    const generatedId = React.useId();
    // `id` arrives from `field.tsx`, which means "this is the CONTROL's id".
    const controlId = htmlFor ?? idProp ?? generatedId;
    const descriptionId =
      description !== undefined && description !== null ? `${controlId}-choice-description` : undefined;

    // Two spellings of one thing, folded once so the mark cannot get both.
    const isInvalid = invalid ?? (ariaInvalid === true || ariaInvalid === "true");

    const control: ChoiceControlProps = {
      id: controlId,
      // Field's chain is kept and this row's own line is added to it, never
      // swapped for it.
      "aria-describedby": joinIds(describedByProp, descriptionId),
      "aria-invalid": isInvalid ? true : undefined,
      required: required || undefined,
      disabled: disabled || undefined,
    };

    /* The mark keeps every prop it set itself; Choice only fills the holes.
       `aria-describedby` is merged rather than chosen, so a mark that already
       points at a unit keeps pointing at it as well as at this row's line. */
    let mark: React.ReactNode;
    if (typeof children === "function") {
      mark = children(control);
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

      mark = React.cloneElement(children as React.ReactElement<Record<string, unknown>>, merged);
    } else {
      mark = children;
    }

    const hasWords = label !== undefined && label !== null;
    const hasDescription = description !== undefined && description !== null;

    return (
      <label
        ref={ref}
        htmlFor={controlId}
        data-slot="choice"
        data-disabled={disabled ? "" : undefined}
        data-invalid={isInvalid ? "" : undefined}
        className={cn(
          rowClasses,
          // One line centres on the mark; two lines hang from the top of the
          // words, which is where a 22 mark and the first line already sit
          // level. No optical nudge is invented for it — and none was added
          // when override 32 took that first line from 14/1.45 to the
          // caption step's 13/1.4, because the alignment is `items-start`
          // and does not depend on the leading.
          hasDescription ? "items-start" : "items-center",
          className,
        )}
        {...props}
      >
        {mark}

        {icon !== undefined && icon !== null ? (
          <span
            aria-hidden="true"
            data-slot="choice-icon"
            className={cn(
              "inline-flex size-[var(--icon-20)] shrink-0 items-center justify-center",
              "text-ink-secondary [&_svg]:size-[var(--icon-20)]",
              "group-data-[disabled]:text-ink-disabled",
            )}
          >
            {icon}
          </span>
        ) : image ? (
          <img
            src={image}
            alt={imageAlt}
            data-slot="choice-image"
            className={cn(
              "size-[var(--avatar-md)] shrink-0 object-contain",
              "rounded-[var(--radius-select)] bg-surface-quiet",
            )}
          />
        ) : null}

        {hasWords || hasDescription ? (
          <span className="flex min-w-0 flex-col gap-1">
            {hasWords ? (
              /* `asChild` — see `labelClasses` above. The span carries NO
                 class of its own: the step, the weight, the ink, the locked
                 ink and the colour transition all arrive from `label.tsx`
                 through the slot, and writing them here as well would be the
                 second list this ruling exists to delete. */
              <Label asChild>
                <span data-slot="choice-label">{label}</span>
              </Label>
            ) : null}
            {hasDescription ? (
              <span
                id={descriptionId}
                data-slot="choice-description"
                className={cn(descriptionClasses)}
              >
                {description}
              </span>
            ) : null}
          </span>
        ) : null}
      </label>
    );
  },
);

Choice.displayName = "Choice";

export { Choice, rowClasses as choiceRowClasses, labelClasses as choiceLabelClasses };
