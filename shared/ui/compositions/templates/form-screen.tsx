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

import { Button } from "../../components/button/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../components/sheet/sheet";
import { Hint, Text } from "../../components/typography/typography";
import {
  Form,
  FormSection,
  type FormErrorItem,
} from "../../components/form/form";
import { Upload } from "../../foundations/icons";
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
  /**
   * The panel's drawn measure, when it comes from the side. ch27.2 draws the
   * ADD panel at 484px, max 78% of the window; ch27.3 draws the EDIT panel at
   * 512px, max 80% — "Add and Edit are one composition with two headers", and
   * the width is the one other thing that differs. Ignored for the bottom
   * sheet, which is always the full width.
   */
  panelWidth?: "add" | "edit";
  open?: boolean;
  /** The panel opened or closed. A stray click behind it closes it (ch27.2). */
  onOpenChange?: (open: boolean) => void;
  /** The ✕'s accessible name. */
  closeLabel?: string;

  /**
   * The quiet context line ABOVE the panel's title — ch27.2 draws
   * "Collection · New" over "New record", and 27.3 draws
   * "Collection · 4182 · editing" over the record's title. Panel surface
   * only; a page form's context is the screen's own header band.
   */
  eyebrow?: React.ReactNode;
  /** What this form is for. In a panel it is the sheet's title. */
  title?: React.ReactNode;
  /** A line under the title. */
  description?: React.ReactNode;
  /**
   * The identity chips under the panel's title — ch27.3's edit header draws
   * the record's status pill, relation, owner and "Opened 13 Jun 2026" in a
   * row below "Record title goes here". Panel surface only; an add form has
   * none, because a record that does not exist yet has no identity to state.
   */
  chips?: React.ReactNode;

  /** The groups. */
  sections?: FormScreenSection[];
  /** Fields, when the form has no groups. */
  children?: React.ReactNode;
  /** One column or two, for an ungrouped form. */
  columns?: 1 | 2;

  /**
   * The fields that need attention, one entry per problem. ON A PANEL these
   * are NOT drawn as a head summary — ch27.35: "Never a red banner at the top
   * of the panel, never a tooltip, never a dialog listing errors. The count
   * sits above the button" — so the panel draws the attention card directly
   * above Cancel and Save instead: the count in words, the reassurance, and
   * "Go to the first". On a page the head summary stands (it is the reachable
   * in-page anchor list a long page needs).
   */
  errors?: FormErrorItem[];
  /** The summary's heading. Page surface only. */
  errorsTitle?: string;
  /** Jump to a field from the summary or from "Go to the first". */
  onErrorSelect?: (id: string) => void;
  /** How the attention card's count reads. ch27.35: "Two fields need attention." */
  formatAttention?: (count: number) => string;
  /** The sentence after the count. */
  attentionReassurance?: React.ReactNode;
  /** The narrow render's shorter sentence — "Nothing is lost." */
  attentionReassuranceNarrow?: React.ReactNode;
  /** "Go to the first" — walks to the first field named. */
  goToFirstLabel?: React.ReactNode;

  /**
   * THE SAVE ITSELF FAILED — ch27.35's second case, kept apart from
   * validation: "A server refusal keeps its own card: it says the change was
   * refused, not lost, offers Retry with the same values, and offers to copy
   * what was written." Never a toast, never a dialog; the panel stays open
   * and the values stay in the fields.
   */
  refused?: boolean;
  /** The refusal card's title. */
  refusedTitle?: React.ReactNode;
  /** Its sentence. */
  refusedBody?: React.ReactNode;
  /** Sends exactly what is on screen. */
  onRetry?: () => void;
  /** Its label. */
  retryLabel?: React.ReactNode;
  /** Puts what was written on the clipboard. */
  onCopyDraft?: () => void;
  /** Its label — "Copy what I wrote". */
  copyDraftLabel?: React.ReactNode;

  /**
   * The names of the required fields still empty. ch27.2 puts the count and
   * the names beside the commit, in tertiary, rather than in a tooltip.
   */
  missing?: readonly string[];
  /** How that sentence reads. */
  formatMissing?: (names: readonly string[]) => string;
  /** Anything else beside the commit. Drawn after the missing sentence. */
  meta?: React.ReactNode;

  /**
   * The names of the fields changed and not saved — ch27.3's dirty state.
   * Non-empty, the panel pins ONE MANGO BAND directly above Discard and Save:
   * "how many fields changed, then which ones. It is the one place mango
   * appears as a band rather than a button — the warning and the decision it
   * concerns are never separated by a scroll." Panel surface only.
   */
  changed?: readonly string[];
  /** How the band's first sentence reads. The count is a word, as ch27.2's. */
  formatChanged?: (names: readonly string[]) => string;
  /**
   * "Review" — the word at the band's trailing end. Omitted, the word is not
   * drawn; the band still states the count and the names.
   */
  onReview?: () => void;
  /** Its label. */
  reviewLabel?: React.ReactNode;

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

/* ch27.2 writes the count as a WORD — "Two required fields are empty — Title,
   Owner" — not a digit. Ten and up falls back to figures, which is the usual
   English typographic rule and past any count a form footer should reach. */
const COUNT_WORDS = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
] as const;

function defaultFormatMissing(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `One required field is empty — ${names[0]}`;
  const count = COUNT_WORDS[names.length] ?? String(names.length);
  return `${count} required fields are empty — ${names.join(", ")}`;
}

/* ch27.35's card writes its count as a word too: "Two fields need
   attention." */
function defaultFormatAttention(count: number): string {
  if (count === 1) return "One field needs attention.";
  const word = COUNT_WORDS[count] ?? String(count);
  return `${word} fields need attention.`;
}

/* ch27.3's band writes its count the same way: "Two fields changed and not
   saved", then the names beside it in their own quieter span. */
function defaultFormatChanged(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return "One field changed and not saved";
  const count = COUNT_WORDS[names.length] ?? String(names.length);
  return `${count} fields changed and not saved`;
}

/* ch27.2 draws the ADD panel "position: absolute … width: 484px; max-width:
   78%" and ch27.3 the EDIT panel at 512px / 80%. Both beat the CH20 drawer's
   generic 420, which stays the default for every other sheet. Side panels
   only — the bottom sheet is full-width. */
const PANEL_WIDTH: Record<"add" | "edit", string> = {
  add: "w-[30.25rem] max-w-[78%]",
  edit: "w-[32rem] max-w-[80%]",
};

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
  panelWidth = "add",
  density = "comfortable",
  open,
  onOpenChange,
  closeLabel,
  eyebrow,
  title,
  description,
  chips,
  sections,
  children,
  columns,
  errors,
  errorsTitle,
  onErrorSelect,
  formatAttention = defaultFormatAttention,
  attentionReassurance = "Nothing has been saved and nothing you typed is lost.",
  attentionReassuranceNarrow = "Nothing is lost.",
  goToFirstLabel = "Go to the first",
  refused = false,
  refusedTitle = "This could not be saved",
  refusedBody = "The change was refused, not lost. Your text is still in the fields above and Retry sends exactly what you see.",
  onRetry,
  retryLabel = "Retry",
  onCopyDraft,
  copyDraftLabel = "Copy what I wrote",
  missing,
  formatMissing = defaultFormatMissing,
  meta,
  changed,
  formatChanged = defaultFormatChanged,
  onReview,
  reviewLabel = "Review",
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

  const dirty = changed !== undefined && changed.length > 0;
  /* THE DIRTY BAND — ch27.3, drawn: a full-bleed mango strip directly above
     the footer row, charcoal ink, the count at 13.5/500, the names beside it
     one step down, "Review" at the trailing end. The narrow render keeps the
     sentence alone, inset and rounded, and drops the names and the word. */
  const changedBand = !dirty ? null : (
    <div
      data-slot="form-screen-changed"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1",
        "bg-surface-brand text-ink-on-accent",
        "px-[var(--space-6)] py-[var(--space-3)]",
        "max-sm:mx-[var(--space-4)] max-sm:rounded-[var(--radius)] max-sm:px-[var(--space-4)]",
      )}
    >
      <Text
        as="span"
        size="sm"
        tone="inherit"
        className="font-[var(--font-weight-medium)]"
      >
        {formatChanged(changed)}
      </Text>
      <Text as="span" size="sm" tone="inherit" className="hidden sm:inline">
        {changed.join(", ")}
      </Text>
      {onReview === undefined ? null : (
        <button
          type="button"
          onClick={onReview}
          /* Bare medium type at the band's end, as the artifact draws it —
             a pill here would be a second button over the two the footer
             already holds. tokens.css §8 rings it. */
          className="ms-auto hidden cursor-pointer border-0 bg-transparent p-0 text-sm font-[var(--font-weight-medium)] text-current sm:inline"
        >
          {reviewLabel}
        </button>
      )}
    </div>
  );

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

  /* THE ATTENTION CARD — ch27.35, drawn: a hairlined off-beige card directly
     above the buttons, opening on the 8 poppy dot; the count at 500, the
     reassurance after it in the same sentence, "Go to the first" underlined
     at the trailing end. Narrow: a soft-paper strip, the short reassurance,
     no link — the first field is one thumb-scroll away. Panel surface only;
     a page keeps its head summary, which is the reachable anchor list a long
     page needs. */
  const hasAttention =
    surface === "panel" && errors !== undefined && errors.length > 0;
  const goToFirst = () => {
    const first = errors?.[0];
    if (first === undefined) return;
    if (first.fieldId !== undefined) {
      document.getElementById(first.fieldId)?.focus();
    }
    onErrorSelect?.(first.id);
  };
  const attentionCard = !hasAttention ? null : (
    <div
      data-slot="form-screen-attention"
      className={cn(
        "mx-[var(--space-6)] flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1",
        "rounded-[var(--radius)] px-[var(--space-4h)] py-[var(--space-4)]",
        "bg-card shadow-[var(--hairline-strong)]",
        "max-sm:mx-[var(--space-4)] max-sm:bg-surface-panel max-sm:shadow-none",
      )}
    >
      <span
        aria-hidden="true"
        className="size-[var(--dot-status)] shrink-0 rounded-pill bg-destructive"
      />
      <Text as="span" size="sm" className="min-w-0 flex-1">
        <span className="font-[var(--font-weight-medium)]">
          {formatAttention(errors.length)}
        </span>{" "}
        <span className="hidden sm:inline">{attentionReassurance}</span>
        <span className="sm:hidden">{attentionReassuranceNarrow}</span>
      </Text>
      <Button
        type="button"
        variant="text"
        className="ms-auto hidden sm:inline-flex"
        onClick={goToFirst}
      >
        {goToFirstLabel}
      </Button>
    </div>
  );

  /* THE REFUSAL CARD — ch27.35's second case: "it says the change was
     refused, not lost, offers Retry with the same values, and offers to copy
     what was written." A soft-paper card, the poppy dot on the title, Retry
     as a paper pill with the send-up glyph, the copy offer underlined. It
     never becomes a toast, and the panel it sits in stays open. */
  const refusedCard = !refused ? null : (
    <div
      data-slot="form-screen-refused"
      role="alert"
      className={cn(
        "mx-[var(--space-6)] flex min-w-0 flex-col gap-[var(--space-2h)]",
        "rounded-[var(--radius)] bg-surface-panel p-[var(--space-5)]",
        "max-sm:mx-[var(--space-4)]",
      )}
    >
      <span className="inline-flex items-center gap-[var(--space-2h)] text-base font-[var(--font-weight-medium)] text-foreground">
        <span
          aria-hidden="true"
          className="size-[var(--dot-status)] shrink-0 rounded-pill bg-destructive"
        />
        {refusedTitle}
      </span>
      <Text as="p" size="sm" tone="secondary">
        {refusedBody}
      </Text>
      <div className="flex flex-wrap items-center gap-[var(--space-2h)] pt-1">
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          <Upload aria-hidden="true" />
          {retryLabel}
        </Button>
        {onCopyDraft === undefined ? null : (
          <Button type="button" variant="text" onClick={onCopyDraft}>
            {copyDraftLabel}
          </Button>
        )}
      </div>
    </div>
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
            {eyebrow === undefined ? null : <Hint as="span">{eyebrow}</Hint>}
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
      /* ch27.35 forbids the head banner ON A PANEL — "never a red banner at
         the top of the panel, never a dialog listing errors" — so the panel
         keeps the messages at their fields and counts them on the attention
         card above the buttons instead. The page keeps its summary. */
      errors={surface === "panel" ? undefined : errors}
      errorsTitle={errorsTitle}
      onErrorSelect={onErrorSelect}
      /* THE FIELDS STAY LIVE WHILE THE COMMIT IS CLOSED. ch27.2 closes the
         BUTTON — "quiet-fill button in disabled ink" — and its sentence names
         the fields still to fill; freezing the fieldset on `blocked` locked a
         reader out of the very fields the sentence told them to go back to. */
      disabled={disabled}
      submitDisabled={blocked}
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
        className={cn(
          "flex flex-col",
          /* The chapter's own measures, not CH20's generic 420 — ch27.2:
             "the form enters as a 484px panel"; ch27.3: "a 512px panel". */
          resolvedSide === "right" && PANEL_WIDTH[panelWidth],
          className,
        )}
      >
        <SheetHeader>
          {eyebrow === undefined ? null : <Hint as="span">{eyebrow}</Hint>}
          <SheetTitle>{title}</SheetTitle>
          {description === undefined ? null : (
            <SheetDescription>{description}</SheetDescription>
          )}
          {/* ch27.3's edit header: the record's chips in a row under the
              title — status, relation, owner, "Opened 13 Jun 2026". */}
          {chips === undefined ? null : (
            <div
              data-slot="form-screen-chips"
              className="flex min-w-0 flex-wrap items-center gap-2"
            >
              {chips}
            </div>
          )}
        </SheetHeader>

        {/* The fields scroll; the footer below does not. ch27.2 pins the
            buttons to the panel's bottom edge, "where the scrolling ends". */}
        <div className="min-h-0 flex-1 overflow-y-auto">{formNode}</div>

        {/* THE PINNED FOOT — ch27.2: "a footer pinned to the panel's bottom
            edge, same paper as the form, separated by one hairline — no
            second tone … the hint or reference against the left edge, then
            Cancel, then Create. On narrow the two buttons share a row at half
            width each, primary on the right, with the hint above them." The
            dirty band (ch27.3) sits inside the same pinned block, directly
            above the buttons, so the warning and the decision it concerns
            are never separated by a scroll. */}
        <div
          data-slot="form-screen-foot"
          className="flex shrink-0 flex-col gap-[var(--space-3)] pt-[var(--space-3)] shadow-[var(--hairline-over)]"
        >
          {refusedCard}
          {attentionCard}
          {changedBand}
          <div className="flex min-w-0 flex-wrap items-center gap-3 px-[var(--space-6)] pb-[var(--space-6)] pt-[var(--space-1)]">
            {footerMeta === undefined ? null : (
              <span className="w-full min-w-0 sm:me-auto sm:w-auto sm:max-w-[50%]">
                {footerMeta}
              </span>
            )}
            {actions ?? (
              <React.Fragment>
                {onCancel === undefined ? null : (
                  <Button
                    type="button"
                    variant="cancel"
                    disabled={disabled || submitting}
                    onClick={onCancel}
                    className="flex-1 sm:flex-initial"
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
                  className="flex-1 sm:flex-initial"
                >
                  {submitLabel}
                </Button>
              </React.Fragment>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

FormScreen.displayName = "FormScreen";

export { FormScreen };
