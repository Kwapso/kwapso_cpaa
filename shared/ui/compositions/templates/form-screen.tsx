"use client";

/* ============================================================================
   FormScreen — the one shell every form in both apps renders through. Either
   a panel over the work, or the full content area.

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" chapter 27.2 (add form), 27.3 (record edit), 27.35
   (validation), 27.30 / 27.38 (the full-width variants) and chapter 09.

     ch27.2 on where a form lives, verbatim:
       "Creating a record slides a panel in from the right over the collection
        you were reading — from the bottom on a phone — while the page behind
        blurs back and stops responding. It still has its own URL, so a
        half-finished record survives a reload. Centred modals are for
        confirmations only."

     ch27.2 on the inside of the panel, verbatim:
       "No cards inside the panel — the panel is the sheet. Fields are
        off-beige fills laid directly on it, and a group starts with a hairline
        and an uppercase eyebrow, nothing more. Required group first, optional
        second, never mixed; a form with one group has no eyebrow at all.
        Stacked cards inside a form read as several forms and are not used
        here."

     ch27.2 on the footer, verbatim:
       "Filling a form means scrolling down, so the buttons are where the
        scrolling ends: a footer pinned to the panel's bottom edge, same paper
        as the form, separated by one hairline — no second tone. One order
        everywhere … the hint or reference against the left edge, then Cancel,
        then Create. The header carries the title and one ✕, never a commit."

     ch27.2 on why the footer states the reason, verbatim:
       "A field is checked when it loses focus, and its message sits under that
        field. But the commit is where the scrolling ends, so the footer
        carries the reason too … 'Two required fields are empty — Title,
        Owner'. Nobody should reach the bottom of a long form and have to
        guess."

   THE LAW THIS FILE OBEYS
   · NO CARD INSIDE A FORM. Groups are `FormSection`, which is a fieldset with
     an eyebrow and a hairline — never a `Card`. ch27.2 forbids the stack.
   · THE FOOTER IS PINNED IN A PANEL AND FLOWS ON A PAGE. In panel mode the
     commit sits in the sheet's own footer and is bound to the form by `form=`,
     so it stays visible while the fields scroll. On a page the form's own
     `FormActions` carries it, in the flow, where the scrolling ends.
   · CONTEXT LEFT, PRIMARY LAST. `FormActions` is end-aligned with the primary
     last, and the missing-field sentence rides the `meta` slot on the left.
     That is both ch27.2's order and this repo's own settled ruling.
   · THE TITLE IS IN THE HEADER, NEVER A SECOND TIME. In panel mode the title
     goes to `SheetTitle` and the form draws none, so a reader never meets the
     same heading twice.
   · A DISABLED COMMIT STATES ITS CONDITION. `missing` produces the sentence
     beside the button rather than a tooltip on it.
   · Focus is one global rule. No ring, no radius, no fill written here.

   RENDERING CONTEXT
   `"use client"`. `useId`, Radix Sheet, and submit handlers built during this
   module's own render.
   ========================================================================= */

import * as React from "react";

import { Button } from "../../controls/button/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../controls/sheet/sheet";
import { Text } from "../../controls/typography/typography";
import {
  Form,
  FormActions,
  FormSection,
  type FormErrorItem,
} from "../../structures/form/form";
import { cn } from "../../lib/utils";
import { useHasRoom } from "../../lib/use-has-room";
import {
  SHAPE_SHELL,
  ShapeStateBody,
  type ScreenDensity,
  type ShapeState,
  type ShapeStateCopy,
} from "../states/states";

/** Where the form is drawn. */
export type FormSurface = "page" | "panel";

/**
 * One group of fields. ch27.2: required group first, optional second, never
 * mixed; a form with one group has no eyebrow at all — so a single section
 * with no `title` draws no eyebrow, which is `FormSection`'s own behaviour.
 */
export interface FormScreenSection {
  /** Stable key. */
  id: string;
  /** The uppercase eyebrow. Omit it on a one-group form. */
  title?: React.ReactNode;
  /** A line under the eyebrow. */
  description?: React.ReactNode;
  /** One column or two. Chapter 09's one stated breakpoint does the rest. */
  columns?: 1 | 2;
  /** Draw the group's hairline. */
  divided?: boolean;
  /** The fields. */
  children?: React.ReactNode;
}

export interface FormScreenProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title" | "onSubmit"> {
  /** A panel over the work, or the whole content area. */
  surface?: FormSurface;
  /** The wide staff door or the narrow calm one. Page surface only. */
  density?: ScreenDensity;

  /** The panel is open. Panel surface only. */
  /**
   * Which edge the panel comes from. Omit it and the shape decides by width:
   * the side where there is room, the bottom where there is not.
   *
   * RULED W1, 2026-08-23, verify/decisions.html W. This was hardcoded
   * `side="right"`, and 27.32's narrow render says "the panel is a bottom
   * sheet" -- so at 380 a bulk edit drew a full-width side panel instead. Two
   * screens had already assembled the panel out of this shape's own parts to
   * get around it, which is the signal that the shape is wrong rather than the
   * screens. Pass it explicitly only to override the width answer.
   */
  side?: "right" | "bottom";
  open?: boolean;
  /** The panel opened or closed. A stray click behind it closes it (ch27.2). */
  onOpenChange?: (open: boolean) => void;
  /** The ✕'s accessible name. */
  closeLabel?: string;

  /** What this form is for. In a panel it is the sheet's title. */
  title?: React.ReactNode;
  /** A line under the title. */
  description?: React.ReactNode;

  /** The groups. */
  sections?: FormScreenSection[];
  /** Fields, when the form has no groups. */
  children?: React.ReactNode;
  /** One column or two, for an ungrouped form. */
  columns?: 1 | 2;

  /** The summary at the top, one line per problem, each a link to its field. */
  errors?: FormErrorItem[];
  /** The summary's heading. */
  errorsTitle?: string;
  /** Jump to a field from the summary. */
  onErrorSelect?: (id: string) => void;

  /**
   * The names of the required fields still empty. ch27.2 puts the count and
   * the names beside the commit, in tertiary, rather than in a tooltip.
   */
  missing?: readonly string[];
  /** How that sentence reads. */
  formatMissing?: (names: readonly string[]) => string;
  /** Anything else beside the commit. Drawn after the missing sentence. */
  meta?: React.ReactNode;

  /** Commit. */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  /** The commit's label. ch27.2: the word for what it does, never "Submit". */
  submitLabel?: React.ReactNode;
  /** Retreat. Never mango, even alone (ch27 law 2). */
  onCancel?: () => void;
  /** The retreat's label. */
  cancelLabel?: React.ReactNode;
  /** Replace the two buttons entirely. */
  actions?: React.ReactNode;
  /** The commit is running. The button keeps its fill and grows a spinner. */
  submitting?: boolean;
  /** Nothing may be typed or pressed. */
  disabled?: boolean;

  /** Loading, empty or error. */
  state?: ShapeState;
  /** Per-locale words. */
  copy?: Partial<ShapeStateCopy>;
  /** The retry on a block failure. */
  errorAction?: React.ReactNode;
}

function defaultFormatMissing(names: readonly string[]): string {
  if (names.length === 0) return "";
  return names.length === 1
    ? `One required field is empty — ${names[0]}`
    : `${names.length} required fields are empty — ${names.join(", ")}`;
}

/**
 * The one form shell.
 *
 * TEN STATES
 *  1. default        — title, groups, footer.
 *  2. hover          — owned by the fields and the buttons.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by `Button`.
 *  5. disabled       — `disabled` freezes the whole form through `Form`'s one
 *                      `<fieldset disabled>`; every control then draws its own
 *                      fill and ink. Never an opacity.
 *  6. loading        — `submitting` keeps the commit's fill and grows a
 *                      spinner (PATTERN §4); `state="loading"` unfills the body
 *                      while the record is being fetched.
 *  7. empty          — `state="empty"`: a form with no fields for this reader.
 *                      ch24.6 hides rather than disables, so this is a real
 *                      case and not a placeholder.
 *  8. error          — two kinds, kept apart: `errors` is per-field validation
 *                      with a summary, `state="error"` is ruling 06's block
 *                      failure where the form could not be built at all.
 *  9. selected       — does not apply to the shell.
 * 10. read-only      — pass `disabled` with no `onSubmit`: the values are
 *                      readable and nothing commits.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — chapter 09's one stated form breakpoint is
 *  48rem, and `Form`'s own grid owns it: one column below, two above, never
 *  three. In panel mode `Sheet` rises from the bottom on a phone, which is
 *  `sheetVariants`' own behaviour and not re-decided here.
 *
 * RTL — LTR only by client ruling. `"right"` is the physical value the sheet
 * primitive takes; with RTL out of scope it is the inline end. At narrow the
 * panel is a bottom sheet instead (27.32, ruling W1), which has no side at all.
 */
function FormScreen({
  className,
  surface = "page",
  side,
  density = "comfortable",
  open,
  onOpenChange,
  closeLabel,
  title,
  description,
  sections,
  children,
  columns,
  errors,
  errorsTitle,
  onErrorSelect,
  missing,
  formatMissing = defaultFormatMissing,
  meta,
  onSubmit,
  submitLabel = "Save",
  onCancel,
  cancelLabel = "Cancel",
  actions,
  submitting = false,
  disabled = false,
  state = "ready",
  copy,
  errorAction,
  ...props
}: FormScreenProps) {
  /* The width answer, unless the caller overrode it. `useHasRoom` is the one
     45rem query the whole system shares, so two overlays on one screen cannot
     part company at different widths. RULED W1. */
  const hasRoom = useHasRoom();
  const resolvedSide = side ?? (hasRoom ? "right" : "bottom");

  const formId = React.useId();

  const blocked = missing !== undefined && missing.length > 0;
  const missingLine = blocked ? formatMissing(missing) : undefined;

  const footerMeta =
    missingLine === undefined && meta === undefined ? undefined : (
      <span className="flex min-w-0 flex-col gap-1">
        {missingLine === undefined ? null : (
          <Text as="span" size="sm" tone="tertiary">
            {missingLine}
          </Text>
        )}
        {meta}
      </span>
    );

  const fields =
    sections === undefined ? (
      children
    ) : (
      <React.Fragment>
        {sections.map((section) => (
          <FormSection
            key={section.id}
            title={section.title}
            description={section.description}
            columns={section.columns}
            divided={section.divided}
          >
            {section.children}
          </FormSection>
        ))}
      </React.Fragment>
    );

  if (state === "loading" || state === "empty" || state === "error") {
    const register = (
      <ShapeStateBody
        shape="formScreen"
        state={state}
        copy={copy}
        action={state === "error" ? errorAction : undefined}
      />
    );

    if (surface === "page") {
      return (
        <div
          data-slot="form-screen"
          data-surface="page"
          data-density={density}
          className={cn("flex w-full min-w-0 flex-col", SHAPE_SHELL[density], className)}
          {...props}
        >
          {register}
        </div>
      );
    }

    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side={resolvedSide} closeLabel={closeLabel}>
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            {description === undefined ? null : (
              <SheetDescription>{description}</SheetDescription>
            )}
          </SheetHeader>
          {register}
        </SheetContent>
      </Sheet>
    );
  }

  const formNode = (
    <Form
      id={formId}
      /* In a panel the sheet header already carries the title, so the form
         draws none — ch27.2: the header carries the title and one ✕. */
      title={surface === "panel" ? undefined : title}
      description={surface === "panel" ? undefined : description}
      columns={columns}
      sectioned={sections !== undefined}
      errors={errors}
      errorsTitle={errorsTitle}
      onErrorSelect={onErrorSelect}
      disabled={disabled || blocked}
      loading={submitting}
      submitLabel={submitLabel}
      cancelLabel={cancelLabel}
      onCancel={onCancel}
      actions={actions}
      meta={footerMeta}
      hideActions={surface === "panel"}
      onSubmit={onSubmit}
    >
      {fields}
    </Form>
  );

  if (surface === "page") {
    return (
      <div
        data-slot="form-screen"
        data-surface="page"
        data-density={density}
        className={cn("flex w-full min-w-0 flex-col", SHAPE_SHELL[density], className)}
        {...props}
      >
        {formNode}
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={resolvedSide}
        closeLabel={closeLabel}
        aria-busy={submitting || undefined}
        className={cn("flex flex-col", className)}
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description === undefined ? null : (
            <SheetDescription>{description}</SheetDescription>
          )}
        </SheetHeader>

        {/* The fields scroll; the footer below does not. ch27.2 pins the
            buttons to the panel's bottom edge, "where the scrolling ends". */}
        <div className="min-h-0 flex-1 overflow-y-auto">{formNode}</div>

        <FormActions meta={footerMeta} hairline>
          {actions ?? (
            <React.Fragment>
              {onCancel === undefined ? null : (
                <Button
                  type="button"
                  variant="cancel"
                  disabled={disabled || submitting}
                  onClick={onCancel}
                >
                  {cancelLabel}
                </Button>
              )}
              <Button
                type="submit"
                form={formId}
                loading={submitting}
                disabled={disabled || blocked}
                aria-describedby={undefined}
              >
                {submitLabel}
              </Button>
            </React.Fragment>
          )}
        </FormActions>
      </SheetContent>
    </Sheet>
  );
}

FormScreen.displayName = "FormScreen";

export { FormScreen };
