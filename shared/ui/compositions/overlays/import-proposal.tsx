"use client";

/* ============================================================================
   ImportProposalScreen — composition 27.44, and ruling 33.

   THE ONE SENTENCE
   "The import that maps itself. The system reads the file, proposes a field
   for every column with a confidence, and asks a person to approve it. This
   is the one overlay in the kit that owns the window — a half-finished import
   must not be abandoned by a stray click behind it."

   DESIGN SOURCE — "Kwapso UI Kit.dc.html" chapter 27.44, verbatim:

     A PROPOSAL IS NEVER APPLIED BY ARRIVING
       "Nothing is written until Approve is pressed, and the screen says so
        beside the button. Confidence is shown per field so the person
        approving knows which line they are actually vouching for."

     LOW CONFIDENCE IS A DOT AND A SENTENCE
       "A field the system is unsure about takes a poppy dot, a plain count in
        the header — '1 needs you' — and the real values from the file so the
        guess can be judged. Never a percentage alone."

     STEPS STAY VISIBLE AND REVISITABLE
       "The four steps sit down the left, current in mango, done in paper,
        later in disabled ink. Going back a step keeps the proposal — a person
        checking their work should not have to re-upload."

     IT IS THE ONLY OVERLAY THAT OWNS THE WINDOW
       "The floating layer never dims the page; this does, because an
        abandoned half-mapped import is worse than an interruption. Escape
        asks before it discards (ruling 11)."

     DOORS DIFFER
       "Clients never import. A file a client sends arrives as an attachment
        on a request, and a member runs this composition against it — so the
        confidence and the approval always belong to someone at kwapso."

   AND RULING 33, verbatim — the ruling that names this screen:
     "Where the system guesses — the import mapping today, anything else
      later — the guess is shown with a confidence per field, the unsure ones
      are surfaced first, and nothing is written until a person presses
      Approve."

   THIS IS NOT 27.30. SEE THE SAME NOTE IN `import.tsx`.
   The two are separate compositions in separate groups and the chapter draws
   them separately. In one line each: 27.30 is a full-width PAGE where a
   PERSON maps six columns by hand across a rail of four ticked steps, and
   commits with the row count on the button. 27.44 is an OVERLAY THAT OWNS THE
   WINDOW where the SYSTEM has already proposed every mapping with a
   percentage, the unsure ones are surfaced with a poppy dot and a count, and
   the commit is the single word Approve. Nothing in this file counts rows on
   its commit control and nothing in `import.tsx` states a confidence.

   THE LAW THIS FILE OBEYS
   · CONFIDENCE PER FIELD, ON EVERY FIELD. `confidence` is required on a
     `ProposedMapping`, not optional. Ruling 33 says "a confidence per field",
     and an optional confidence is a confidence that gets dropped.
   · THE UNSURE ONES ARE SURFACED FIRST. This file sorts them to the top
     itself rather than asking the call site to — the same thing
     `ImportWizard` does with its own `unsure` flag, for the same reason.
   · NEVER A PERCENTAGE ALONE. A field under `needsYouBelow` draws three
     things together: the poppy dot, the words "Needs you", and the REAL
     VALUES out of the file. The percentage rides beside them; it is never
     the only signal, and the dot is never the only signal either (ruling 26).
   · THE COUNT IS PLAIN WORDS IN THE HEADER. "1 needs you" — a count and a
     sentence, not a badge with a number in it.
   · NOTHING IS WRITTEN UNTIL APPROVE, AND IT IS SAID BESIDE THE BUTTON. The
     sentence sits in the footer's meta slot, on the same row as Approve.
   · ESCAPE ASKS BEFORE IT DISCARDS. This overlay does NOT close itself.
     Escape, the scrim and the close chip all call `onRequestClose`; ruling
     11's confirmation is the application's to draw, and this screen refuses
     to guess that a stray keypress meant "throw the mapping away".
   · ONE MANGO, AND IT IS APPROVE. Cancel is paper — retreating is never the
     primary action.
   · THERE IS NO `door` PROP. Clients never import; a prop offering a portal
     variant would imply one exists.
   · EVERY STRING IS A PROP with a default (PATTERN §7).
   · No CSS `border`, no px, no literal colour, no gradient, no illustration.
     The dim is `Dialog`'s own scrim — a `color-mix` fill, not an opacity and
     not a blur.
   · Focus is one global rule. Dark is a token flip.

   WHAT THE ARTIFACT DRAWS TWICE, DIFFERENTLY
   In the desktop render the unsure row's field cell holds the PROBLEM —
   `Needs you — "14.08.26", "ASAP", "—"` — and no proposed field. In the
   narrow render the same column carries a proposed field ("Due date") AND the
   values. The proposal plainly exists at both widths, so this file draws the
   union: the control with the proposal in it, and the dot, the words and the
   real values under it. Logged as T3B-4 in GAPS-TRACK3B.md.

   RENDERING CONTEXT
   `"use client"`. Radix `Dialog`, one piece of disclosure state for the
   narrow summary, and select handlers built during this module's own render.
   ========================================================================= */

import * as React from "react";

import { Button } from "../../components/button/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/dialog/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/select/select";
import {
  StatusStepper,
  type StatusStage,
} from "../../components/status-stepper/status-stepper";
import { Headline, Hint, Text } from "../../components/typography/typography";
import { cn } from "../../lib/utils";

/** The four steps, in the artifact's own words. */
export type ProposalStep = "file" | "mapping" | "review" | "import";

export const PROPOSAL_STEPS: readonly ProposalStep[] = [
  "file",
  "mapping",
  "review",
  "import",
] as const;

/** One field the system could map a column into. */
export interface ProposalFieldOption {
  /** The value handed back by `onMappingChange`. */
  value: string;
  /** What the row says. */
  label: string;
}

/** One column, the field the system proposes for it, and how sure it is. */
export interface ProposedMapping {
  /** Stable key. Normally the column heading in the file. */
  id: string;
  /** The heading as the file spells it. */
  source: string;
  /** The field the system proposes. Ruling 33: a guess, never an action. */
  value: string;
  /**
   * How sure the system is, 0–100. REQUIRED. Ruling 33 asks for "a confidence
   * per field", and an optional one is one that gets left off.
   */
  confidence: number;
  /**
   * The real values out of the file for this column, already joined by the
   * application — `"14.08.26", "ASAP", "—"`. Drawn under a field the system
   * is unsure about "so the guess can be judged". Required there; ignored on
   * a confident field, where three sample values are noise.
   */
  samples?: string;
}

/** Every user-facing string on this screen. */
export interface ImportProposalLabels {
  /** The overlay's own name. */
  title: string;
  /** The rail's accessible name. */
  stepsLabel: string;
  /** The four step names, in order. */
  stepFile: string;
  stepMapping: string;
  stepReview: string;
  stepImport: string;
  /** The file, already named by the application. */
  fileName: string;
  /** How many rows it holds, already formatted by the application (ruling 07). */
  rowCount: string;
  /** The panel's heading. */
  proposalTitle: string;
  /** The two column headings, and the confidence column's. */
  columnInFile: string;
  fieldInSystem: string;
  sure: string;
  /** The accessible name of one row's field control. `%s` is the column. */
  fieldControlLabel: string;
  /** The words beside the poppy dot on an unsure field. */
  needsYou: string;
  /** The narrow card's two paper controls. */
  note: string;
  skip: string;
  /** The narrow disclosure, opening and closing. */
  show: string;
  hide: string;
  /** Said beside the commit control. */
  nothingWritten: string;
  /** Retreating. Never mango. */
  cancel: string;
  /** THE ONE MANGO. Ruling 33's own word. */
  approve: string;
  /** The close chip's accessible name. */
  closeLabel: string;
}

const DEFAULT_LABELS: ImportProposalLabels = {
  title: "Import",
  stepsLabel: "Import steps",
  stepFile: "File",
  stepMapping: "Mapping",
  stepReview: "Review",
  stepImport: "Import",
  fileName: "orders-2026-08.csv",
  rowCount: "1,204 rows",
  proposalTitle: "Proposed mapping",
  columnInFile: "Column in the file",
  fieldInSystem: "Field in the system",
  sure: "Sure",
  fieldControlLabel: "Field for %s",
  needsYou: "Needs you",
  note: "Note",
  skip: "Skip",
  show: "Show",
  hide: "Hide",
  nothingWritten: "Nothing is written until you press Approve",
  cancel: "Cancel",
  approve: "Approve",
  closeLabel: "Close",
};

const DEFAULT_FIELDS: readonly ProposalFieldOption[] = [
  { value: "account", label: "Account" },
  { value: "title", label: "Record title" },
  { value: "value", label: "Value" },
  { value: "due", label: "Due date" },
];

/* The artifact's own four columns, its own percentages, its own samples. */
const DEFAULT_MAPPINGS: readonly ProposedMapping[] = [
  { id: "kunde", source: "Kunde", value: "account", confidence: 96 },
  { id: "auftrag", source: "Auftrag", value: "title", confidence: 91 },
  { id: "betrag", source: "Betrag", value: "value", confidence: 88 },
  {
    id: "frist",
    source: "Frist",
    value: "due",
    confidence: 41,
    samples: '"14.08.26", "ASAP", "—"',
  },
];

/**
 * Below this, the system is not vouching for its own guess. The artifact
 * draws 41% as "needs you" and 88% as sure, and states no threshold between
 * them; the midpoint is not a kwapso value and is not presented as one — it
 * is a default a call site is expected to set from its own model. Logged as
 * T3B-5 in GAPS-TRACK3B.md.
 */
export const NEEDS_YOU_BELOW = 65;

/** The three tracks. One column below `sm` — the narrow render is cards. */
const ROW_GRID =
  "grid min-w-0 gap-x-[var(--space-5)] gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] sm:items-start";

export interface ImportProposalScreenProps {
  /** The overlay is up. */
  open: boolean;
  /**
   * Something asked for the overlay to go — Escape, the scrim, the close
   * chip, or Cancel. It is NOT `onOpenChange`: this screen never closes
   * itself, because ruling 11 says the ask comes first.
   */
  onRequestClose?: () => void;
  /** Per-locale words. */
  labels?: Partial<ImportProposalLabels>;
  /** Which of the four steps is open. */
  step?: ProposalStep;
  /** A step was pressed. "Going back a step keeps the proposal." */
  onStepSelect?: (step: ProposalStep) => void;
  /** Every field a column can be mapped into. */
  fields?: readonly ProposalFieldOption[];
  /** The proposal, one row per column in the file. */
  mappings?: readonly ProposedMapping[];
  /** A proposed field was changed by the person approving it. */
  onMappingChange?: (id: string, value: string) => void;
  /** Under this confidence, the field needs a person. */
  needsYouBelow?: number;
  /** How a confidence reads. Percent by default. */
  formatConfidence?: (confidence: number) => string;
  /** How the header's count reads. Never a bare number. */
  formatNeedsYou?: (count: number) => string;
  /** How the narrow summary reads. */
  formatMapped?: (count: number) => string;
  /** How the narrow step bar reads. */
  formatStep?: (position: number, total: number) => string;
  /** Write a note against one column. Narrow only — see the breakpoint note. */
  onNote?: (id: string) => void;
  /** Leave one column out. Narrow only — see the breakpoint note. */
  onSkip?: (id: string) => void;
  /** Retreating. Paper. */
  onCancel?: () => void;
  /** THE ONE MANGO. The only thing on this screen that writes. */
  onApprove?: () => void;
}

/**
 * The overlay that proposes a mapping and asks to be approved.
 *
 * TEN STATES
 *  1. default        — the rail, the proposal, the sentence, the two buttons.
 *  2. hover          — the controls'. Nothing in this file draws a wash.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      and Radix traps focus inside the overlay while it is
 *                      open — which is the point of an overlay that owns the
 *                      window.
 *  4. active/pressed — `Button`'s, `Select`'s and `StatusStepper`'s.
 *  5. disabled       — a LATER step, drawn by `StatusStepper` as the quiet
 *                      fill with disabled ink, which is the artifact's own
 *                      words for it. Nothing else here is switched off:
 *                      Approve stays live with an unsure field on screen,
 *                      because ruling 33 asks a person to vouch, not the
 *                      model to be certain.
 *  6. loading        — does not apply. A file still being read is step 01; a
 *                      proposal still being computed has not opened this
 *                      screen yet.
 *  7. empty          — does not apply. A file with no columns produces no
 *                      proposal and this overlay is not raised.
 *  8. error          — does not apply to the overlay. A file that could not
 *                      be read fails at step 01 with the file named; a low
 *                      confidence is NOT an error and must never be drawn as
 *                      one — it is a question, and the answer is a person.
 *  9. selected       — the current step, `StatusStepper`'s mango pill with
 *                      `aria-current="step"`. Colour never alone.
 * 10. read-only      — does not apply. There is exactly one reader of this
 *                      screen and they are the approver.
 *
 * NARROW (380px), STATED — the artifact's own second render
 *  · THE STEPS BECOME A BAR. The four pills down the left do not survive 380,
 *    so the rail is replaced by the step's name and "02 of 04" on one line —
 *    the artifact's own words.
 *  · ONE FIELD AT A TIME. Each unsure column becomes a card carrying its own
 *    heading, its real values, its proposed field and two paper controls,
 *    Note and Skip. The confident columns collapse behind one line — "13
 *    columns mapped" with a Show — so the screen opens on the work rather
 *    than on the thirteen rows nobody needs to read. Note and Skip are drawn
 *    at this width only, because it is the only width where the row is a card
 *    with room for them; on desktop, skipping a column is the field control's
 *    own job. Logged as T3B-4.
 *  · THE HEADER COUNT STAYS. "1 needs you" is the first thing on the panel at
 *    both widths — it is the reason the screen is open.
 *  · THE SENTENCE STAYS BESIDE THE BUTTON. `DialogFooter` reverses to a
 *    column below 40rem, so Approve spans the row with Cancel under it and
 *    "Nothing is written until you press Approve" above both.
 *  · THE OVERLAY STILL OWNS THE WINDOW, and at 380 that is the whole screen
 *    inside the scrim's own inset.
 *
 * RTL — LTR only by client ruling.
 */
function ImportProposalScreen({
  open,
  onRequestClose,
  labels,
  step = "mapping",
  onStepSelect,
  fields = DEFAULT_FIELDS,
  mappings = DEFAULT_MAPPINGS,
  onMappingChange,
  needsYouBelow = NEEDS_YOU_BELOW,
  formatConfidence = (confidence) => `${confidence}%`,
  formatNeedsYou = (count) => `${count} needs you`,
  formatMapped = (count) => `${count} columns mapped`,
  formatStep = (position, total) =>
    `${String(position).padStart(2, "0")} of ${String(total).padStart(2, "0")}`,
  onNote,
  onSkip,
  onCancel,
  onApprove,
}: ImportProposalScreenProps) {
  const words: ImportProposalLabels = { ...DEFAULT_LABELS, ...labels };

  /* The narrow summary's disclosure. Closed to start: the screen opens on the
     work, not on the thirteen columns that are already right. */
  const [showMapped, setShowMapped] = React.useState(false);

  const stepIndex = Math.max(0, PROPOSAL_STEPS.indexOf(step));

  const stages: StatusStage[] = [
    { id: "file", label: words.stepFile },
    { id: "mapping", label: words.stepMapping },
    { id: "review", label: words.stepReview },
    { id: "import", label: words.stepImport },
  ];

  const stepTitle = [words.stepFile, words.stepMapping, words.stepReview, words.stepImport][
    stepIndex
  ];

  const unsure = (mapping: ProposedMapping) => mapping.confidence < needsYouBelow;

  /* RULING 33: "the unsure ones are surfaced first". Done here rather than
     asked of the caller, and stably — two unsure columns keep the file's own
     order between themselves. */
  const ordered = [...mappings].sort((a, b) => Number(unsure(b)) - Number(unsure(a)));
  const needsYouCount = mappings.filter(unsure).length;
  const mappedCount = mappings.length - needsYouCount;

  /* The poppy dot. Ruling 26: it never carries the meaning alone, which is
     why `words.needsYou` is beside it every time it is drawn. */
  const dot = (
    <span
      aria-hidden="true"
      /* `--space-1` lifts the 7 dot onto the caption's baseline. It is the
         first step of the spacing scale, not an optical nudge off it. */
      className="mt-[var(--space-1)] size-[var(--dot-status)] shrink-0 rounded-pill bg-destructive"
    />
  );

  const fieldControl = (mapping: ProposedMapping) => (
    <Select
      value={mapping.value}
      onValueChange={
        onMappingChange === undefined
          ? undefined
          : (value) => {
              onMappingChange(mapping.id, value);
            }
      }
    >
      <SelectTrigger
        aria-label={words.fieldControlLabel.replace("%s", mapping.source)}
        className="w-full min-w-0"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {fields.map((field) => (
          <SelectItem key={field.value} value={field.value}>
            {field.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  /* NEVER A PERCENTAGE ALONE: the dot, the words, and the real values out of
     the file, together, under the control they are about. */
  const needsYouLine = (mapping: ProposedMapping) =>
    !unsure(mapping) ? null : (
      <span className="flex min-w-0 items-start gap-2">
        {dot}
        <Text as="span" size="sm" className="min-w-0">
          {words.needsYou}
          {mapping.samples === undefined ? null : ` — ${mapping.samples}`}
        </Text>
      </span>
    );

  return (
    <Dialog open={open}>
      <DialogContent
        data-slot="import-proposal-screen"
        /* IT OWNS THE WINDOW. `DialogContent` is the kit's 460 modal; this is
           the one composition the chapter exempts, so the box takes the whole
           positioner — which is the viewport inside the scrim's own inset, so
           the 24 corners and the overlay shadow are still drawn. */
        className="h-full w-full max-w-full"
        closeLabel={words.closeLabel}
        /* ESCAPE ASKS BEFORE IT DISCARDS (ruling 11). Every exit is
           intercepted and handed to the application, which draws the ask.
           Nothing here closes the overlay on its own. */
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          onRequestClose?.();
        }}
        onPointerDownOutside={(event) => {
          event.preventDefault();
          onRequestClose?.();
        }}
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{words.title}</DialogTitle>
          <DialogDescription>
            {words.fileName} · {words.rowCount}
          </DialogDescription>
        </DialogHeader>

        {/* `content-start` because the box is `flex-1` inside the overlay: without
            it the grid stretches its rows to the window's height and the narrow
            step bar floats half a screen above the proposal. */}
        <div className="mt-[var(--space-6)] grid min-h-0 flex-1 grid-cols-1 content-start gap-[var(--space-7)] sm:grid-cols-[auto_minmax(0,1fr)]">
          {/* THE FOUR STEPS SIT DOWN THE LEFT — current in mango, done in
              paper, later in disabled ink, which is exactly what
              `StatusStepper`'s stage pills already draw. Numbered 01–04 by
              `formatNumber`'s own two-digit pad. */}
          <StatusStepper
            className="hidden flex-col items-stretch sm:flex"
            variant="stages"
            stages={stages}
            current={stepIndex}
            maxVisible={0}
            label={words.stepsLabel}
            onStageSelect={
              onStepSelect === undefined
                ? undefined
                : (index) => {
                    onStepSelect(PROPOSAL_STEPS[index] as ProposalStep);
                  }
            }
          />

          {/* Narrow: the steps become a bar. */}
          <div className="flex items-baseline gap-3 sm:hidden">
            <Headline as="h2" size="h4">
              {stepTitle}
            </Headline>
            <Hint as="span" numeric>
              {formatStep(stepIndex + 1, PROPOSAL_STEPS.length)}
            </Hint>
          </div>

          <div className="flex min-w-0 flex-col gap-[var(--space-5)]">
            <div className="flex flex-wrap items-baseline justify-between gap-x-[var(--space-5)] gap-y-2">
              <Headline as="h2" size="h4" className="hidden sm:block">
                {words.proposalTitle}
              </Headline>
              {/* THE COUNT, IN PLAIN WORDS, WITH THE DOT. */}
              {needsYouCount === 0 ? null : (
                <span className="flex items-start gap-2">
                  {dot}
                  <Text as="span" size="sm" numeric>
                    {formatNeedsYou(needsYouCount)}
                  </Text>
                </span>
              )}
            </div>

            {/* ---- desktop: the three columns ------------------------------ */}
            <div className="hidden min-w-0 flex-col sm:flex">
              <div
                aria-hidden="true"
                className={cn(ROW_GRID, "pb-2 shadow-[var(--hairline-under)]")}
              >
                <span className="text-micro uppercase text-ink-tertiary">
                  {words.columnInFile}
                </span>
                <span className="text-micro uppercase text-ink-tertiary">
                  {words.fieldInSystem}
                </span>
                <span className="text-micro uppercase text-ink-tertiary">{words.sure}</span>
              </div>

              {ordered.map((mapping) => (
                <div
                  key={mapping.id}
                  data-slot="proposal-row"
                  data-unsure={unsure(mapping) ? "" : undefined}
                  className={cn(ROW_GRID, "py-[var(--space-3)] shadow-[var(--hairline-under)]")}
                >
                  <Text as="span" size="sm" className="sm:pt-[var(--space-2)]">
                    {mapping.source}
                  </Text>
                  <span className="flex min-w-0 flex-col gap-2">
                    {fieldControl(mapping)}
                    {needsYouLine(mapping)}
                  </span>
                  {/* The percentage. Beside the dot and the words on an
                      unsure field, never instead of them. */}
                  <Text
                    as="span"
                    size="sm"
                    tone="tertiary"
                    numeric
                    className="sm:pt-[var(--space-2)] sm:text-end"
                  >
                    {formatConfidence(mapping.confidence)}
                  </Text>
                </div>
              ))}
            </div>

            {/* ---- narrow: one field at a time ----------------------------- */}
            <div className="flex min-w-0 flex-col gap-[var(--space-4)] sm:hidden">
              {ordered
                .filter((mapping) => unsure(mapping) || showMapped)
                .map((mapping) => (
                  <div
                    key={mapping.id}
                    data-slot="proposal-card"
                    data-unsure={unsure(mapping) ? "" : undefined}
                    className="flex min-w-0 flex-col gap-3 pb-[var(--space-4)] shadow-[var(--hairline-under)]"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <Headline as="h3" size="h4">
                        {mapping.source}
                      </Headline>
                      <Hint as="span" numeric>
                        {formatConfidence(mapping.confidence)}
                      </Hint>
                    </div>
                    {needsYouLine(mapping)}
                    {fieldControl(mapping)}
                    {!unsure(mapping) ||
                    (onNote === undefined && onSkip === undefined) ? null : (
                      <div className="flex flex-wrap gap-3">
                        {onNote === undefined ? null : (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onNote(mapping.id)}
                          >
                            {words.note}
                          </Button>
                        )}
                        {onSkip === undefined ? null : (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onSkip(mapping.id)}
                          >
                            {words.skip}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}

              {mappedCount === 0 ? null : (
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <Text as="span" size="sm" tone="secondary" numeric>
                    {formatMapped(mappedCount)}
                  </Text>
                  <Button
                    variant="text"
                    size="sm"
                    aria-expanded={showMapped}
                    onClick={() => setShowMapped((value) => !value)}
                  >
                    {showMapped ? words.hide : words.show}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          {/* SAID BESIDE THE BUTTON. */}
          <Hint as="p" className="sm:me-auto">
            {words.nothingWritten}
          </Hint>
          <Button
            variant="secondary"
            onClick={() => {
              onCancel?.();
              onRequestClose?.();
            }}
          >
            {words.cancel}
          </Button>
          {/* THE ONE MANGO, AND THE ONLY THING HERE THAT WRITES. */}
          <Button onClick={onApprove}>{words.approve}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

ImportProposalScreen.displayName = "ImportProposalScreen";

export { ImportProposalScreen };
