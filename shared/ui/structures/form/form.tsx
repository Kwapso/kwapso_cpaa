/* ============================================================================
   Form — the shell every form in both apps renders through.

   DESIGN SOURCE
   design-mothership/specimens/_fragments/t9.css → chapter 9's form layout,
   transcribed figure for figure:

     .kw-form        display: grid; grid-template-columns: 1fr;
                     gap: var(--space-4) var(--space-6);
     @media (min-width: 48rem) { .kw-form { grid-template-columns: 1fr 1fr } }
     .kw-form__full  grid-column: 1 / -1;

   The kit's own words above that block: "Two columns on desktop, 16px row
   gap, 22px column gap; a form never exceeds two columns." The 22 is off the
   spacing ladder and the kit snapped it to `--space-6` (24) itself, logging
   the snap as T9-5; the breakpoint is the kit's own provisional 48rem (T9-6).
   Both are taken as given here rather than re-derived.

     .kw-savebar        display: flex; flex-wrap: wrap; align-items: center;
                        gap: var(--space-3);
                        border-top: 1px solid var(--hair);
                        padding-top: var(--space-4);
     .kw-savebar__meta  margin-left: auto;

   design-mothership/specimens/kwapso-patterns.css → `.kw-modal__fields`
   (`padding: var(--space-6)`, a column at `--space-4`) for the section stack,
   and CH21's `.kw-register` for the error register.

   THE LAW THIS FILE OBEYS
   · A FORM IS A GRID OF `Field`s AND NOTHING ELSE. This file draws no label,
     no help line, no error message and no control. `field.tsx` owns all four
     and is called 154 times; a second drawing of a form row here would be two
     systems for one job. What this file owns is the GRID, the SECTIONS, the
     SUMMARY and the SAVE BAR.
   · NEVER A THIRD COLUMN. The kit says it in those words. `columns` accepts
     `1` and `2`; there is no `3`, and adding one would be inventing a layout
     the kit refused.
   · THE SAVE BAR IS END-ALIGNED, PRIMARY LAST. Ruled 2026-08-22 and inherited
     here rather than re-argued — the kit's own `.kw-savebar` is start-aligned,
     and it loses for the two reasons written in `sheet.tsx`'s footer. This
     file therefore keeps the save bar's RULE, INSET and META SLOT from the
     kit and takes its alignment from `ActionRow align="end"`, which already
     encodes the ruling including the reversed column below 40rem.
   · A SUBMITTING FORM IS NOT A DISABLED FORM. `loading` sets `aria-busy`,
     puts the spinner in the submit control and freezes the fieldset so the
     same form cannot be sent twice — but the fields keep their own fills. A
     greyed-out form mid-submit says the request failed.
   · Disabled is a fill and an ink. It is delivered by a real
     `<fieldset disabled>`, so every control inside reaches its OWN disabled
     skin — which is a fill and an ink in every primitive already. No opacity
     is written here and none is needed.
   · Focus is ONE global rule (tokens.css §8). This file rings nothing and
     writes no `outline`.
   · Every user-facing string is a prop with a default.
   · No product vocabulary (commission §11). The words here are "form",
     "section", "field", "summary".

   WHY THE ERROR SUMMARY IS AN `Alert` AND THE FAILED SAVE IS A REGISTER
   Two different failures, two different drawings, and conflating them is the
   commonest form bug in an application:
     · `errors` — the form was filled in wrongly. The fields are still there
       and still correct to show. That is an inline `Alert variant="destructive"`
       at the head of the form, listing what to fix, with each entry able to
       carry the id of the field it belongs to.
     · `error` — the form could not be LOADED. There is nothing to fill in.
       That is CH21's `.kw-register` INSTEAD of the form, with one next step.

   RENDERING CONTEXT
   `"use client"`. `React.useId` is a hook, used to tie the summary to the
   form; the module also creates a submit handler during its own render.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { ActionRow } from "../../controls/action-row/action-row";
import { Alert, AlertDescription, AlertTitle } from "../../controls/alert/alert";
import { Button, buttonVariants } from "../../controls/button/button";
import { Headline, Hint, Text } from "../../controls/typography/typography";

/* ============================================================================
   The error summary's entries
   ========================================================================= */

export interface FormErrorItem {
  /** React key, and the value handed back by `onErrorSelect`. */
  id: string;
  /** What is wrong, in words. The field draws its own message too; this is the list. */
  message: React.ReactNode;
  /**
   * The `id` of the control this entry belongs to. Given one, the entry is a
   * real in-page link, so a keyboard reader lands on the field rather than
   * hunting for it. `Field` mints exactly this id and hands it to the control.
   */
  fieldId?: string;
}

/* ============================================================================
   The registers — transcribed, local
   ========================================================================= */

/* `.kw-register` (kwapso-patterns.css CH21 — "Say what happened, then the one
   next step"): panel tone at the 24 radius, `--space-7` inset, an eyebrow led
   by the 7 poppy dot (t21.css `.t21-dot`), the h3 title at `--space-3`, a 40ch
   sentence at `--space-2` in secondary ink, one action row at `--space-5`.
   `--text-h3` is 24 with the h3 tracking, which is `text-2xl` here.

   The eyebrow's words are not optional: ruling 26 says a mark never carries
   meaning alone, so the dot may not appear without them. */
function Register({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: React.ReactNode;
  title?: React.ReactNode;
  body?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      data-slot="form-register"
      role="alert"
      className="rounded-[var(--radius)] bg-surface-panel p-[var(--space-7)]"
    >
      {/* Chapter 21's failure eyebrow, exactly: a 7px poppy dot, 10 of air,
          then the word at 11 / 500 / uppercase / 0.08em. `text-micro` sets
          the step, the leading and the tracking but NOT the weight, so this
          line was printing at the page's 300 while every other eyebrow in
          the kit carries the 500. */}
      <span className="inline-flex items-center gap-[var(--space-2h)]">
        <span
          aria-hidden="true"
          className="size-[var(--dot-status)] shrink-0 rounded-pill bg-destructive"
        />
        <span className="text-micro font-[var(--font-weight-medium)] uppercase text-ink-tertiary">
          {eyebrow}
        </span>
      </span>
      {title !== undefined && title !== null ? (
        <p className="mt-3 text-2xl font-[var(--font-weight-medium)] text-foreground">{title}</p>
      ) : null}
      {body !== undefined && body !== null ? (
        <p className="mt-2 max-w-[40ch] text-caption leading-[var(--leading-normal)] text-ink-secondary">
          {body}
        </p>
      ) : null}
      {action !== undefined && action !== null ? (
        /* `gap: 10px`, chapter 21's own. */
        <div className="mt-5 flex flex-wrap gap-[var(--space-2h)]">{action}</div>
      ) : null}
    </div>
  );
}

/* ============================================================================
   FormSection
   ========================================================================= */

export interface FormSectionProps
  extends Omit<React.ComponentPropsWithoutRef<"fieldset">, "title"> {
  /** The section's name. Rendered as the `<legend>`, so it names the group for real. */
  title?: React.ReactNode;
  /** A line under the name. Secondary ink at the 14 step. */
  description?: React.ReactNode;
  /**
   * Columns INSIDE this section. Left undefined it inherits the form's, which
   * is what almost every section wants. `1` is for a section of long values —
   * an address, a note — inside a two-column form.
   */
  columns?: 1 | 2;
  /** A rule above the section, for the second and later sections of a long form. */
  divided?: boolean;
}

/**
 * A named group of fields.
 *
 * A real `<fieldset>` and `<legend>`, not a `<div>` and an `<h3>`: a screen
 * reader announces the legend with every control inside the group, which is
 * the only way "Postcode" is heard as "Delivery address, Postcode".
 *
 * TEN STATES
 *  1. default        — the legend, the description, the grid.
 *  2. hover          — does not apply. A section is a container, not a target.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once; a
 *                      `<fieldset>` is not focusable and the fields inside it
 *                      ring themselves.
 *  4. active/pressed — does not apply.
 *  5. disabled       — the native `disabled` attribute, which disables every
 *                      control inside at once. Each one then draws its OWN
 *                      disabled skin — a fill and an ink in every primitive —
 *                      so nothing here writes a state. The legend keeps its
 *                      primary ink: a group that cannot be filled in still
 *                      needs saying what it is.
 *  6. loading        — does not apply to a section. The FORM is what goes
 *                      busy; a section whose values are still arriving passes
 *                      `loading` to its own fields, which take the read-only
 *                      skin (`input.tsx`).
 *  7. empty          — no children renders the legend and an empty grid. A
 *                      section with nothing in it is a call-site bug and is
 *                      not papered over.
 *  8. error          — does not apply at the section level. An invalid FIELD
 *                      draws its own 65% poppy border and its ink message;
 *                      colouring a whole group would say every field in it is
 *                      wrong.
 *  9. selected       — does not apply.
 * 10. read-only      — passed to the fields, which lose their borders
 *                      (chapter 9: "system-set values lose the border").
 *
 * THREE BREAKPOINTS
 *  mobile   — one column, from the grid below.
 *  tablet   — two columns from 48rem, unless `columns={1}`.
 *  desktop  — UNCHANGED from tablet. Never a third column; the kit says so.
 *
 * RTL — safe. `border-t` and `pt-*` are on the block axis; the grid follows
 * the document direction; nothing is positioned by side.
 */
const FormSection = React.forwardRef<HTMLFieldSetElement, FormSectionProps>(
  ({ className, title, description, columns, divided = false, children, ...props }, ref) => (
    <fieldset
      ref={ref}
      data-slot="form-section"
      className={cn(
        "min-w-0 border-0 p-0",
        // `.kw-modal__fields` — a column at --space-4 between the head and
        // the grid. The grid supplies its own row gap below.
        "flex flex-col gap-4",
        divided && "shadow-[var(--hairline-over)] pt-[var(--space-6)]",
        className,
      )}
      {...props}
    >
      {title !== undefined && title !== null ? (
        <legend className="min-w-0 p-0">
          <Headline as="div" size="h4">
            {title}
          </Headline>
        </legend>
      ) : null}

      {description !== undefined && description !== null ? (
        <Text as="p" size="sm" tone="secondary" className="min-w-0">
          {description}
        </Text>
      ) : null}

      <div data-slot="form-grid" className={cn(formGridClasses(columns))}>{children}</div>
    </fieldset>
  ),
);

FormSection.displayName = "FormSection";

/* ============================================================================
   FormActions
   ========================================================================= */

export interface FormActionsProps extends React.ComponentPropsWithoutRef<"div"> {
  /**
   * The kit's `.kw-savebar__meta` slot — "last saved 12:04", a record count,
   * an autosave note. Pushed to the far end with `me-auto` on the actions
   * rather than `ms-auto` on the meta, so it stays at the reading start in
   * Arabic, Urdu and Persian as it does in English.
   */
  meta?: React.ReactNode;
  /**
   * Drop the rule above the bar. For a save bar that is already the last
   * thing inside a `Card`, whose `CardFooter` draws the rule itself.
   */
  hairline?: boolean;
}

/**
 * The save bar.
 *
 * `.kw-savebar` supplies the rule and the 16 above it; `ActionRow align="end"`
 * supplies the alignment, the 12 gap and the reversed column below 40rem. The
 * two are kept apart on purpose: 229 footers across the system take their
 * alignment from `ActionRow`, and a form that aligned its own would be the
 * one place the ruling did not reach.
 *
 * TEN STATES — the bar itself has none; every one belongs to the Buttons in
 * it, exactly as `ActionRow` states. It paints one hairline and a gap.
 *  1. default        — the rule, the meta, the children.
 *  2. hover          — the children's (`--btn-*-hover`).
 *  3. focus-visible  — NOT here. tokens.css §8 rings the children.
 *  4. active/pressed — the children's 1px nudge.
 *  5. disabled       — the children's, as a fill and an ink.
 *  6. loading        — the children's; `Button loading` keeps its fill.
 *  7. empty          — no children and no meta renders `null`. An empty bar
 *                      leaves a hairline under a form for nothing.
 *  8. error          — does not apply. A bar reports nothing; the summary above
 *                      the form does.
 *  9. selected       — does not apply.
 * 10. read-only      — does not apply.
 *
 * THREE BREAKPOINTS
 *  mobile   — the actions become a reversed column (inherited from
 *             `ActionRow align="end"`), so the commit control spans the row
 *             and is reachable with a thumb, while staying LAST in the DOM so
 *             the tab order still ends on it. The meta wraps above them.
 *  tablet   — the wrapping, end-aligned row, from 40rem.
 *  desktop  — UNCHANGED from tablet.
 *
 * RTL — safe. `me-auto` is margin-inline-end; `border-t` and `pt-*` are on
 * the block axis. No physical side appears.
 */
const FormActions = React.forwardRef<HTMLDivElement, FormActionsProps>(
  ({ className, meta, hairline = true, children, ...props }, ref) => {
    if (React.Children.count(children) === 0 && (meta === undefined || meta === null)) {
      return null;
    }

    return (
      <div
        ref={ref}
        data-slot="form-actions"
        className={cn(
          // `.kw-savebar` — the rule and the 20 above it. CH09 draws the
          // bar `padding-top: 20px` over `inset 0 1px 0 var(--hair)`; 16 was
          // the mothership CSS's figure, not the chapter's.
          "flex flex-wrap items-center gap-3",
          hairline && "shadow-[var(--hairline-over)] pt-[var(--space-5)]",
          className,
        )}
        {...props}
      >
        {meta !== undefined && meta !== null ? (
          <Hint as="div" className="me-auto min-w-0">
            {meta}
          </Hint>
        ) : null}
        <ActionRow align="end" className={cn(meta === undefined || meta === null ? "w-full" : "")}>
          {children}
        </ActionRow>
      </div>
    );
  },
);

FormActions.displayName = "FormActions";

/* ============================================================================
   Form
   ========================================================================= */

/**
 * The grid, as a class set. One column below 48rem, two at and above it, and
 * never a third — the kit's own `.kw-form`, gap 16 rows / 24 columns.
 * `columns={1}` keeps one column at every width, for a form of long values.
 */
function formGridClasses(columns: 1 | 2 | undefined): string {
  return cn(
    "grid min-w-0 grid-cols-1 gap-x-6 gap-y-4",
    columns !== 1 && "md:grid-cols-2",
    // `.kw-form__full` — a field that spans the measure marks itself with
    // `data-full`, so a call site does not have to know the column count.
    "[&>[data-full]]:col-span-full",
  );
}

export interface FormProps extends Omit<React.ComponentPropsWithoutRef<"form">, "title"> {
  /** The form's own name. Rendered at the h3 step above everything else. */
  title?: React.ReactNode;
  /** A sentence under the name, in secondary ink at the 14 step. */
  description?: React.ReactNode;
  /**
   * One column at every width, or the kit's two from 48rem. There is no `3`:
   * chapter 9 says "a form never exceeds two columns" and this is the whole
   * enforcement of it.
   */
  columns?: 1 | 2;
  /**
   * The list of things to fix. Drawn as one `Alert variant="destructive"` at
   * the head of the form, ABOVE the fields, with each entry linking to its
   * own control where `fieldId` is given. The fields draw their own messages
   * too; this is the summary a keyboard reader lands on after a failed
   * submit, and it is why `announce` defaults on.
   */
  errors?: FormErrorItem[];
  /** The summary's heading. */
  errorsTitle?: string;
  /**
   * Announce the summary as it appears. Default `true` — unlike a single
   * field's message, a summary appears exactly once per submit and is the
   * only thing that tells a reader whose focus is on the submit control that
   * anything happened.
   */
  announceErrors?: boolean;
  /** Called with an entry's `id` when it is pressed and it has no `fieldId` to link to. */
  onErrorSelect?: (id: string) => void;
  /**
   * The form itself could not be LOADED — not "it was filled in wrongly".
   * Draws CH21's register INSTEAD of the form, because there is nothing to
   * fill in. A node is the sentence; `true` uses `errorBody`.
   */
  error?: React.ReactNode | boolean;
  /** The register's eyebrow. Ruling 26: the poppy dot never speaks alone. */
  errorEyebrow?: string;
  /** The register's title line. */
  errorTitle?: string;
  /** The register's sentence, when `error` is `true` rather than a node. */
  errorBody?: React.ReactNode;
  /** The register's one next step — a `Button`, usually `variant="secondary"` (T21-3). */
  errorAction?: React.ReactNode;
  /**
   * The form is being submitted. `aria-busy`, the fieldset freezes so it
   * cannot be sent twice, and the submit control keeps its fill and grows a
   * spinner. The fields keep their own skins: a greyed-out form mid-submit
   * says the request failed.
   */
  loading?: boolean;
  /** Nothing may be filled in. A real `<fieldset disabled>`; every control draws its own. */
  disabled?: boolean;
  /** The submit control's label. */
  submitLabel?: React.ReactNode;
  /** The cancel control's label. Rendered only when `onCancel` is given. */
  cancelLabel?: React.ReactNode;
  /** Pressing cancel. Without it, no cancel control is drawn. */
  onCancel?: () => void;
  /**
   * Replace the save bar's controls wholesale — a destructive action beside
   * the save, a second commit, a split control. Given this, `submitLabel` and
   * `cancelLabel` are ignored.
   */
  actions?: React.ReactNode;
  /** The `.kw-savebar__meta` slot: "last saved 12:04", an autosave note. */
  meta?: React.ReactNode;
  /** Draw no save bar at all — a form whose commit control lives in a drawer footer. */
  hideActions?: boolean;
  /**
   * The fields. Either bare `Field`s, which are placed straight into the
   * grid, or `FormSection`s, which bring their own grid. Mixing the two is
   * fine: `sectioned` decides whether this component supplies a grid of its
   * own.
   */
  children?: React.ReactNode;
  /**
   * The children are `FormSection`s and bring their own grids, so this
   * component stacks them at `--space-6` instead of gridding them. Left
   * undefined it is inferred: any child that is a `FormSection` switches it on.
   */
  sectioned?: boolean;
}

/**
 * The shell every form renders through.
 *
 * TEN STATES
 *  1. default        — title, description, summary slot, the grid, save bar.
 *  2. hover          — does not apply to the shell. Every hover belongs to a
 *                      control inside it; a form that washed under the
 *                      pointer would fight the field the pointer is over.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the control's own radius. A `<form>` is not
 *                      focusable and this file adds no ring and no
 *                      `outline: none`.
 *  4. active/pressed — does not apply to the shell; the submit control has it.
 *  5. disabled       — `disabled`: a real `<fieldset disabled>` around the
 *                      fields, so every control reaches its own disabled skin,
 *                      which is a fill and an ink in every primitive. The save
 *                      bar's controls are disabled too — a form nobody may
 *                      fill in cannot be submitted. No opacity anywhere.
 *  6. loading        — `loading`: `aria-busy` on the form, the fieldset frozen
 *                      so it cannot be sent twice, and the submit control
 *                      keeping its own fill with a spinner (`button.tsx`'s
 *                      rule: the kit draws a submitting button as itself, not
 *                      as a dead one). The FIELDS keep their skins.
 *  7. empty          — no children renders the head and the save bar with an
 *                      empty grid between them. A form with no fields is a
 *                      call-site bug and is not papered over — and it must
 *                      still show its commit control, because a form whose
 *                      only content is a confirmation is a real form.
 *  8. error          — TWO, and they are different things. `errors` is "you
 *                      filled it in wrongly": an inline `Alert
 *                      variant="destructive"` at the head, listing what to
 *                      fix, each entry linking to its control. `error` is
 *                      "there is no form to fill in": CH21's `.kw-register`
 *                      INSTEAD of the form, with one next step.
 *  9. selected       — does not apply. A form is not a chooser; the selected
 *                      thing is a value inside a control.
 * 10. read-only      — passed down. Each control loses its border (chapter 9:
 *                      "system-set values lose the border") and the save bar
 *                      is the caller's to withdraw with `hideActions`.
 *
 * THREE BREAKPOINTS
 *  mobile   — ONE column. The kit's `.kw-form` starts at `1fr` and this is
 *             it, unchanged. The save bar becomes a reversed column so the
 *             commit control spans the row.
 *  tablet   — TWO columns from 48rem — chapter 9's own provisional breakpoint
 *             (t9.css, T9-6), 16 between rows and 24 between the columns. The
 *             save bar becomes the end-aligned row at 40rem, which is
 *             `ActionRow`'s breakpoint and lands first.
 *  desktop  — UNCHANGED from tablet, and this is the load-bearing one: the
 *             kit says "and never a third". A wider viewport gives each field
 *             more measure, not the form more columns.
 *
 * RTL — safe. The grid is on the inline axis and follows the document
 * direction; `gap-x-*`, `me-auto`, `px-*` and `col-span-full` carry no side.
 * The summary's links are ordinary in-page anchors and need nothing.
 */
const Form = React.forwardRef<HTMLFormElement, FormProps>(
  (
    {
      className,
      title,
      description,
      columns = 2,
      errors,
      errorsTitle = "This form could not be saved",
      announceErrors = true,
      onErrorSelect,
      error,
      errorEyebrow = "Load failed",
      errorTitle = "This form could not be opened",
      errorBody,
      errorAction,
      loading = false,
      disabled = false,
      submitLabel = "Save",
      cancelLabel = "Cancel",
      onCancel,
      actions,
      meta,
      hideActions = false,
      children,
      sectioned,
      ...props
    },
    ref,
  ) => {
    const summaryId = React.useId();

    /* `true` means "failed, and the sentence is `errorBody`"; a node is the
       sentence itself. An empty string is neither. */
    const failed = error !== undefined && error !== null && error !== false && error !== "";
    const failedBody = typeof error === "boolean" ? errorBody : error;

    if (failed) {
      return (
        <Register
          eyebrow={errorEyebrow}
          title={errorTitle}
          body={failedBody}
          action={errorAction}
        />
      );
    }

    /* A section brings its own grid, so the form must not put one round it.
       Inferred rather than required, because a call site that composes
       `FormSection` should not also have to remember a flag. */
    const inferredSectioned =
      sectioned ??
      React.Children.toArray(children).some(
        (child) => React.isValidElement(child) && child.type === FormSection,
      );

    const problems = errors ?? [];
    const frozen = disabled || loading;

    return (
      <form
        ref={ref}
        data-slot="form"
        data-columns={columns}
        aria-busy={loading || undefined}
        aria-describedby={problems.length > 0 ? summaryId : undefined}
        className={cn("flex min-w-0 flex-col gap-[var(--space-6)]", className)}
        {...props}
      >
        {title !== undefined && title !== null ? (
          <div className="flex min-w-0 flex-col gap-2">
            <Headline as="h2" size="h3">
              {title}
            </Headline>
            {description !== undefined && description !== null ? (
              <Text as="p" size="sm" tone="secondary">
                {description}
              </Text>
            ) : null}
          </div>
        ) : null}

        {problems.length > 0 ? (
          <Alert
            id={summaryId}
            data-slot="form-summary"
            variant="destructive"
            /* `role="alert"` IS the announcement — it implies an assertive
               live region. Setting `aria-live` as well makes some screen
               readers say the whole summary twice, so only one is written. */
            role={announceErrors ? "alert" : undefined}
          >
            <AlertTitle>{errorsTitle}</AlertTitle>
            <AlertDescription>
              <ul className="flex flex-col gap-1">
                {problems.map((problem) => (
                  <li key={problem.id} className="min-w-0">
                    {problem.fieldId !== undefined ? (
                      /* A real in-page anchor, so a keyboard reader LANDS on
                         the field instead of hunting for it. It wears
                         `buttonVariants({ variant: "link" })` — the same skin
                         `Button` draws, taken from the exported cva rather
                         than re-written, because an `<a href>` must be an
                         anchor and `Button` renders a `<button>`.
                         tokens.css §8 rings it. */
                      <a
                        href={`#${problem.fieldId}`}
                        className={cn(buttonVariants({ variant: "link" }))}
                        onClick={() => {
                          onErrorSelect?.(problem.id);
                        }}
                      >
                        {problem.message}
                      </a>
                    ) : onErrorSelect !== undefined ? (
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => {
                          onErrorSelect(problem.id);
                        }}
                      >
                        {problem.message}
                      </Button>
                    ) : (
                      problem.message
                    )}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        {/* The one `<fieldset disabled>` that freezes everything at once.
            Every control inside then draws its OWN disabled skin, which is a
            fill and an ink in each primitive; nothing here writes a state. */}
        <fieldset
          data-slot="form-fields"
          disabled={frozen || undefined}
          className={cn(
            "min-w-0 border-0 p-0",
            inferredSectioned
              ? "flex flex-col gap-[var(--space-6)]"
              : formGridClasses(columns),
          )}
        >
          {children}
        </fieldset>

        {hideActions ? null : (
          <FormActions meta={meta}>
            {actions ?? (
              <React.Fragment>
                {onCancel !== undefined ? (
                  <Button type="button" variant="cancel" disabled={frozen} onClick={onCancel}>
                    {cancelLabel}
                  </Button>
                ) : null}
                <Button type="submit" loading={loading} disabled={disabled}>
                  {submitLabel}
                </Button>
              </React.Fragment>
            )}
          </FormActions>
        )}
      </form>
    );
  },
);

Form.displayName = "Form";

export { Form, FormSection, FormActions, formGridClasses };
