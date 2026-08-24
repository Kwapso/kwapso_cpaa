/* ============================================================================
   ImportWizard — upload → plan → review → run → report.

   DESIGN SOURCE
   Nothing new is drawn. Every part of the screen already exists and this file
   only sequences them:

     the rail            `StatusStepper variant="steps"` — chapter 15's
                         equal-column rail with the connector and the label
                         beneath each mark
     the drop zone       `FileUpload` — chapter 9's zone, its hint, its file
                         rows and its per-file message
     the mapping         `Form` + `Field` + `Select` — chapter 9's form grid,
                         one column below 48rem and two above, never a third
     the preview         `DataPreviewTable`, which is `DataTable` and so
                         `Table` / `Checkbox` / `Pagination` / `Skeleton` /
                         `useVirtualRows`
     the run             `Progress` — the two-tier bar, determinate and sweep
     the report          `DataPreviewTable` again, with the outcomes filled in
     the footer          `ActionRow align="end"` — the settled footer ruling,
                         including the reversed column below 40rem
     the registers       `.kw-empty` (kwapso-ui.css) and `.kw-register`
                         (kwapso-patterns.css CH21)

   THE LAW THIS FILE OBEYS
   · A PROPOSAL IS NOT AN ACTION. Ruling 33, verbatim: "Where the system
     guesses — the import mapping today, anything else later — the guess is
     shown with a confidence per field, the unsure ones are surfaced first,
     and nothing is written until a person presses Approve." That ruling names
     THIS component. So: a guessed mapping carries a quiet chip saying it was
     guessed, the unsure rows are sorted to the TOP of the plan step, and the
     review step's control is the only thing that starts the run.
   · THE RUN IS NOT REVERSIBLE, SO THE STEP BEFORE IT IS THE GATE. `review` is
     the last step with a back door; once `run` starts, `Back` is withdrawn
     rather than left there looking pressable.
   · THE STEPS DO NOT RENUMBER. Five stages, always all five, `maxVisible={0}`
     so the kit's over-five fold never engages on a five-stage rail. A wizard
     whose step count changed with its own progress would be unreadable.
   · Focus is ONE global rule (tokens.css §8). Nothing here rings.
   · Disabled is a fill and an ink; every control that goes dead here is a
     `Button`, which already draws one.
   · Every user-facing string is a prop with a default — including all five
     step names, which are the most-read words in the component.
   · No product vocabulary (commission §11). Sources, columns, rows, mappings,
     outcomes.

   RENDERING CONTEXT
   `"use client"`. State for the uncontrolled step, and handlers made during
   render.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { ActionRow } from "../../controls/action-row/action-row";
import { Badge } from "../../controls/badge/badge";
import { Button } from "../../controls/button/button";
import { Field } from "../../controls/field/field";
import { FileUpload, type FileUploadItem } from "../../controls/file-upload/file-upload";
import { Progress } from "../../controls/progress/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../controls/select/select";
import { StatusStepper, type StatusStage } from "../../controls/status-stepper/status-stepper";
import { Headline, Text } from "../../controls/typography/typography";
import {
  DataPreviewTable,
  type DataPreviewColumn,
  type DataPreviewRow,
} from "../data-preview-table/data-preview-table";
import { Form } from "../form/form";
import { CollectionRegister } from "../collection-frame/collection-frame";

/* ============================================================================
   The five steps
   ========================================================================= */

/** The sequence, in order. There is no sixth and none is skippable. */
export type ImportWizardStep = "upload" | "plan" | "review" | "run" | "report";

const STEP_ORDER: readonly ImportWizardStep[] = [
  "upload",
  "plan",
  "review",
  "run",
  "report",
] as const;

/* 27.30'S OWN FOUR NAMES, VERBATIM, PLUS THE REPORT. Override 23: "27.30's
   four names survive verbatim — the file, what it is, match the columns,
   check and commit — and the report is added after them." The defaults here
   were paraphrases ("Choose a source", "Map the columns", "Review",
   "Write"), while `compositions/screens/import.tsx` already shipped the
   chapter's words — so one import screen read the artifact and the other
   read the kit.

   THE TWO SEQUENCES STILL DO NOT LINE UP ONE-TO-ONE, and that is logged
   rather than papered over: the artifact's second stage is "what it is" and
   there is no `run` in it, while this component's stages are upload · plan ·
   review · run · report. Reconciling the STAGES changes the exported
   `ImportWizardStep` union, so only the WORDS move here. */
const DEFAULT_STEP_LABELS: Record<ImportWizardStep, string> = {
  upload: "The file",
  plan: "Match the columns",
  review: "Check and commit",
  run: "Write",
  report: "The report",
};

/* ============================================================================
   A mapping row
   ========================================================================= */

export interface ImportMappingOption {
  /** The value handed back by `onMappingChange`. */
  value: string;
  /** What the row says. Translatable at the call site, where the field names are. */
  label: string;
  disabled?: boolean;
}

export interface ImportMapping {
  /** Stable id, and the handle `onMappingChange` is called with. */
  id: string;
  /** The column in the reader's own source — the spreadsheet heading. */
  sourceLabel: React.ReactNode;
  /** A sample value or two from that column, so the reader can recognise it. */
  sampleLabel?: React.ReactNode;
  /** What it is currently mapped to. Undefined means "not mapped yet". */
  value?: string;
  /** Everything it could be mapped to. */
  options: ImportMappingOption[];
  /**
   * The system GUESSED this one and is not sure. Ruling 33: the unsure ones
   * are SURFACED FIRST, so this flag also decides the order of the plan step.
   */
  unsure?: boolean;
  /** This one must be mapped before the plan is complete. */
  required?: boolean;
  /** The quiet line under the control. */
  help?: React.ReactNode;
  /** This mapping is wrong. A node is the message; the control takes the poppy border. */
  error?: React.ReactNode;
}

/* ============================================================================
   The registers — transcribed, local
   ========================================================================= */

/* `.kw-empty` (kwapso-ui.css, the last block): a centred column, `--space-2`
   between its lines, `--space-8` / `--space-6` inset, tertiary ink at 14. */
function EmptyRegister({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-slot="import-wizard-empty"
      /* Left-aligned -- 27.21, DEF-2. */
      className="flex flex-col items-start gap-2 px-6 py-[var(--space-8)] text-start text-sm text-ink-tertiary"
    >
      {children}
    </div>
  );
}

/* ============================================================================
   THE ERROR REGISTER IS THE SHARED ONE — `CollectionRegister`.

   CH21's `.kw-register` was declared LOCALLY in six files, byte-for-byte the
   same markup in every one of them, and one record could show two different
   copies of it at once (a `detail-view` rendering a `DescriptionList`). The
   values inside all six were corrected in place on 2026-08-23, so nothing
   drew wrongly; six chances to drift is the defect, and this is the follow-up
   GAPS-FIDELITY-DE L-2 wrote out. `variant="block"` IS `.kw-register` — the
   panel tone at the 24 radius, `--space-7` inset, left-aligned per 27.21 —
   and `tone="error"` is the 7px poppy dot CH21 puts on exactly one of its
   four registers.

   `.kw-empty` STAYS LOCAL, and that is not an oversight. It is a different
   kit object: one line of words at the 14 step in tertiary ink, not an
   eyebrow / title / body / action column. `CollectionRegister`'s `inline`
   variant carries `.kw-empty`'s box but not its step or its ink, so folding
   the two together would either shrink this register's words or hand every
   inline register a container ink its title would inherit. Logged rather
   than forced.
   ========================================================================= */

/* ============================================================================
   ImportWizard
   ========================================================================= */

export interface ImportWizardProps
  extends Omit<React.ComponentPropsWithoutRef<"section">, "onChange" | "title"> {
  /* ---- the sequence ------------------------------------------------------- */
  /** Controlled step. */
  step?: ImportWizardStep;
  /** Uncontrolled starting step. */
  defaultStep?: ImportWizardStep;
  /** The step changed — through the rail, `Back`, or `Continue`. */
  onStepChange?: (step: ImportWizardStep) => void;
  /** The five step names. Every one is overridable; every one has a default. */
  stepLabels?: Partial<Record<ImportWizardStep, string>>;
  /**
   * A finished step may be returned to by pressing it on the rail. Default
   * `true` up to `review` and never once `run` has started — see the law
   * block. `false` makes the rail a pure indicator.
   */
  railNavigable?: boolean;
  /** The rail's accessible name. */
  railLabel?: string;

  /** The whole component's name, above the rail. */
  title?: React.ReactNode;
  /** A sentence under it, in secondary ink. */
  description?: React.ReactNode;

  /* ---- step 1 · upload ---------------------------------------------------- */
  /** What has been chosen so far. Rendered as `FileUpload`'s rows. */
  files?: FileUploadItem[];
  /** Something was dropped or picked. */
  onFilesSelected?: (files: File[]) => void;
  /** A chosen file was removed. */
  onFileRemove?: (id: string) => void;
  /** What the zone accepts — `.csv`, `text/csv`, whatever the caller allows. */
  accept?: string;
  /** More than one source at a time. */
  multiple?: boolean;
  /** The words in the middle of the zone. */
  uploadPrompt?: React.ReactNode;
  /** The quiet line under the zone's control — "CSV, up to 10 MB". */
  uploadHint?: React.ReactNode;
  /** Replace the whole upload step. */
  uploadContent?: React.ReactNode;

  /* ---- step 2 · plan ------------------------------------------------------ */
  /**
   * One row per column in the source. Rendered as `Field` + `Select` inside
   * `Form`'s own grid, with the UNSURE ones first — ruling 33's "the unsure
   * ones are surfaced first", done here rather than asked of the caller.
   */
  mappings?: ImportMapping[];
  /** A mapping changed. */
  onMappingChange?: (id: string, value: string) => void;
  /** The chip beside a guessed mapping. Ruling 33's "confidence", in words. */
  guessedLabel?: string;
  /** The `Select`'s placeholder when a column is not mapped. */
  unmappedLabel?: string;
  /** The words when there are no columns to map. */
  planEmptyLabel?: string;
  /** Replace the whole plan step. */
  planContent?: React.ReactNode;

  /* ---- step 3 · review ---------------------------------------------------- */
  /** The preview's columns. Handed to `DataPreviewTable` untouched. */
  previewColumns?: DataPreviewColumn[];
  /** The preview's rows, in source order. */
  previewRows?: DataPreviewRow[];
  /** Rows may be taken out of the batch before it is written. */
  previewSelectable?: boolean;
  /** Which rows will be written. Controlled. */
  includedIds?: readonly string[];
  /** The included set changed. */
  onIncludedChange?: (ids: string[]) => void;
  /** Bound the preview's height so it scrolls inside itself. rem only. */
  previewMaxHeight?: string;
  /** Replace the whole review step. */
  reviewContent?: React.ReactNode;

  /* ---- step 4 · run ------------------------------------------------------- */
  /**
   * How far the write has got, against `runMax`. `null` or `undefined` runs
   * the bar indeterminate, which is `Progress`'s own convention.
   */
  runValue?: number | null;
  /** What counts as finished. */
  runMax?: number;
  /** The bar's accessible name. */
  runLabel?: string;
  /** Turns the bar's value into words. Passed to `Progress` untouched. */
  formatRunValue?: (value: number, max: number) => string;
  /** A line under the bar — a count, a rate, the row being written. */
  runMeta?: React.ReactNode;
  /** Replace the whole run step. */
  runContent?: React.ReactNode;

  /* ---- step 5 · report ---------------------------------------------------- */
  /** The report's columns. Falls back to `previewColumns`. */
  reportColumns?: DataPreviewColumn[];
  /** The report's rows, with their outcomes filled in. Falls back to `previewRows`. */
  reportRows?: DataPreviewRow[];
  /** The words when the run wrote nothing. */
  reportEmptyLabel?: string;
  /** Replace the whole report step. */
  reportContent?: React.ReactNode;

  /* ---- the footer --------------------------------------------------------- */
  /** Going back. Without it the control is not drawn. */
  onBack?: () => void;
  /** Going on. Without it the control is not drawn. */
  onContinue?: () => void;
  /** The back control's label. */
  backLabel?: string;
  /** The continue control's label. */
  continueLabel?: string;
  /** The label on the step that starts the write — the one irreversible press. */
  startLabel?: string;
  /** The label on the last step. */
  finishLabel?: string;
  /** The continue control is not available yet — a required mapping is missing. */
  canContinue?: boolean;
  /** Replace the footer's controls wholesale. */
  actions?: React.ReactNode;
  /** The `.kw-savebar__meta` slot — a count, a file name, a warning. */
  meta?: React.ReactNode;

  /* ---- the three states --------------------------------------------------- */
  /** The step's own data is arriving. Passed down to whichever step is showing. */
  loading?: boolean;
  /** The step failed. CH21's register instead of the step's panel. */
  error?: boolean;
  /** The register's eyebrow. Ruling 26: the poppy dot never speaks alone. */
  errorEyebrow?: string;
  /** The register's title line. */
  errorTitle?: string;
  /** The register's sentence. */
  errorBody?: React.ReactNode;
  /** The register's one next step — usually `Button variant="secondary"` (T21-3). */
  errorAction?: React.ReactNode;
}

/**
 * The five-step import.
 *
 * TEN STATES
 *  1. default        — the rail, the step's own panel, the footer.
 *  2. hover          — the controls' only. A step panel is a region, not a
 *                      target; a rail stage that can be returned to takes
 *                      `StatusStepper`'s own hover, which is one defined step
 *                      from its own fill and never mango.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the control's own radius. Nothing in this file adds
 *                      or hides a ring, and no panel sets `overflow: hidden`.
 *  4. active/pressed — the controls'. `StatusStepper` and `Button` each own
 *                      their own press.
 *  5. disabled       — the continue control while `canContinue` is false, the
 *                      back control once the write has started, and the rail
 *                      while the write is in flight. Each is a `Button` or a
 *                      `StatusStepper`, and each draws a fill and an ink. No
 *                      opacity is written in this file.
 *  6. loading        — two different waits. `loading` is the STEP's own data
 *                      arriving: the panel's own component takes it —
 *                      `DataPreviewTable` shows skeleton rows, the plan step
 *                      shows its fields busy. The `run` step is not "loading"
 *                      at all: it is a determinate `Progress`, because the
 *                      number of rows is known, and the kit's own rule is
 *                      "never a spinner where a shape is known".
 *  7. empty          — per step. No columns to map: `.kw-empty` in the plan
 *                      panel. No rows in the source: `DataPreviewTable`'s own
 *                      empty register. Nothing written: `.kw-empty` in the
 *                      report panel. The rail and the footer stay in all
 *                      three, because the way OUT of an empty step is the
 *                      thing the reader now needs.
 *  8. error          — `error`: `.kw-register` replaces the step's panel and
 *                      keeps the rail, so the reader can see where they are
 *                      and go back. Announced as an alert. A per-ROW failure
 *                      is not this: it is an outcome in the report table,
 *                      drawn as a `Badge` and chapter 9's ink message.
 *  9. selected       — the current step, on the rail: `StatusStepper`'s mango
 *                      current stage with its charcoal label, plus
 *                      `aria-current`. Both channels, because colour alone
 *                      must never carry a meaning. Row selection inside the
 *                      review step is `DataPreviewTable`'s.
 * 10. read-only      — the `run` and `report` steps are read-only by nature:
 *                      nothing on them can be changed, so neither draws a
 *                      control that suggests otherwise. `Back` is withdrawn
 *                      from `run` rather than disabled — a control that will
 *                      never become available should not be on the screen.
 *
 * THREE BREAKPOINTS
 *  mobile   — ONE column throughout. The rail keeps its equal columns and
 *             ellipsises its labels rather than stacking, which is
 *             `StatusStepper`'s own stated answer and the reason the five
 *             names here are short. The plan step's grid is one column (the
 *             kit's `.kw-form` below 48rem). The preview scrolls on the
 *             inline axis inside its own shell. The footer becomes a reversed
 *             column so the commit control spans the row and stays LAST in
 *             the DOM.
 *  tablet   — the plan step goes to TWO columns at 48rem — chapter 9's own
 *             breakpoint, inherited through `Form` rather than restated. The
 *             footer becomes the end-aligned row at 40rem, which is
 *             `ActionRow`'s breakpoint and lands first.
 *  desktop  — UNCHANGED from tablet. Never a third column in the plan step;
 *             the kit says "a form never exceeds two columns" and the plan
 *             step IS a form. The preview simply has less left to scroll.
 *
 * RTL — safe. The rail's connector fills in reading order (motion.css flips
 * its `transform-origin` under `[dir="rtl"]`); the footer is `ActionRow`,
 * which names no side; the plan grid and the preview both follow the document
 * direction. Nothing here writes `left`, `right`, `pl-*` or `pr-*`.
 */
const ImportWizard = React.forwardRef<HTMLElement, ImportWizardProps>(
  (
    {
      className,
      step,
      defaultStep = "upload",
      onStepChange,
      stepLabels,
      railNavigable = true,
      railLabel = "Import steps",
      title,
      description,
      files,
      onFilesSelected,
      onFileRemove,
      accept,
      multiple = false,
      uploadPrompt,
      uploadHint,
      uploadContent,
      mappings,
      onMappingChange,
      guessedLabel = "Guessed",
      /* 27.30 draws the word: "Columns can be left out, shown as
         'Not imported' in disabled ink rather than hidden." */
      unmappedLabel = "Not imported",
      planEmptyLabel = "This source has no columns to map",
      planContent,
      previewColumns,
      previewRows,
      previewSelectable = true,
      includedIds,
      onIncludedChange,
      previewMaxHeight,
      reviewContent,
      runValue,
      runMax = 100,
      runLabel,
      formatRunValue,
      runMeta,
      runContent,
      reportColumns,
      reportRows,
      reportEmptyLabel = "Nothing was written",
      reportContent,
      onBack,
      onContinue,
      backLabel = "Back",
      continueLabel = "Continue",
      startLabel = "Write these rows",
      finishLabel = "Done",
      canContinue = true,
      actions,
      meta,
      loading = false,
      error = false,
      errorEyebrow = "This step failed",
      errorTitle = "This step could not be completed",
      errorBody,
      errorAction,
      ...props
    },
    ref,
  ) => {
    const [ownStep, setOwnStep] = React.useState<ImportWizardStep>(defaultStep);
    const current = step ?? ownStep;
    const currentIndex = Math.max(STEP_ORDER.indexOf(current), 0);

    const words = React.useMemo(
      () => ({ ...DEFAULT_STEP_LABELS, ...stepLabels }),
      [stepLabels],
    );

    /* Once the write has started there is no going back — see the law block.
       The rail is frozen with it, so a stage cannot be pressed either. */
    const running = current === "run";
    const finished = current === "report";
    const canGoBack = onBack !== undefined && currentIndex > 0 && !running && !finished;

    const goTo = (next: ImportWizardStep) => {
      if (step === undefined) setOwnStep(next);
      onStepChange?.(next);
    };

    const stages: StatusStage[] = STEP_ORDER.map((id) => ({ id, label: words[id] }));

    /* Ruling 33: "the unsure ones are surfaced first". Done here rather than
       asked of the caller, because a caller who forgot would silently break a
       ruling. A stable sort, so everything else keeps the source's order. */
    const plan = React.useMemo(() => {
      const rows = mappings ?? [];
      return rows
        .map((mapping, index) => ({ mapping, index }))
        .sort((a, b) => {
          const unsureA = a.mapping.unsure === true ? 0 : 1;
          const unsureB = b.mapping.unsure === true ? 0 : 1;
          if (unsureA !== unsureB) return unsureA - unsureB;
          return a.index - b.index;
        })
        .map((entry) => entry.mapping);
    }, [mappings]);

    const commitLabel = current === "review" ? startLabel : finished ? finishLabel : continueLabel;

    return (
      <section
        ref={ref}
        data-slot="import-wizard"
        data-step={current}
        aria-busy={loading || undefined}
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

        {/* Five stages, always all five. `maxVisible={0}` turns off the kit's
            over-five fold, which would otherwise never fire on five but would
            fire the moment anyone added a sixth — and a wizard that hid a step
            behind "+1" would be unreadable. */}
        <StatusStepper
          stages={stages}
          current={currentIndex}
          variant="steps"
          maxVisible={0}
          label={railLabel}
          disabled={running || loading}
          onStageSelect={
            railNavigable && !running && !finished
              ? (index) => {
                  // Only backwards. Pressing a step ahead of the current one
                  // would skip the gates the steps exist to be.
                  if (index < currentIndex) goTo(STEP_ORDER[index]);
                }
              : undefined
          }
        />

        {error ? (
          <CollectionRegister
            variant="block"
            tone="error"
            role="alert"
            eyebrow={errorEyebrow}
            title={errorTitle}
            body={errorBody}
            actions={errorAction}
          />
        ) : (
          <div data-slot="import-wizard-panel" className="min-w-0">
            {current === "upload" ? (
              uploadContent ?? (
                <FileUpload
                  files={files}
                  accept={accept}
                  multiple={multiple}
                  prompt={uploadPrompt}
                  hint={uploadHint}
                  loading={loading}
                  onFilesSelected={onFilesSelected}
                  onRemove={onFileRemove}
                />
              )
            ) : null}

            {current === "plan" ? (
              planContent ??
              (plan.length === 0 && !loading ? (
                <EmptyRegister>
                  <span role="status">{planEmptyLabel}</span>
                </EmptyRegister>
              ) : (
                /* `Form` supplies chapter 9's grid — one column below 48rem,
                   two above, never a third — and nothing else. Its own save
                   bar is withdrawn: the wizard's footer is the commit. */
                <Form hideActions columns={2}>
                  {plan.map((mapping) => (
                    <Field
                      key={mapping.id}
                      label={
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <span className="min-w-0">{mapping.sourceLabel}</span>
                          {/* Ruling 33's "confidence per field", said in
                              words. Quiet by ruling — a plan of thirty
                              guessed columns must not be thirty mango
                              chips. */}
                          {mapping.unsure === true ? <Badge>{guessedLabel}</Badge> : null}
                        </span>
                      }
                      help={mapping.help ?? mapping.sampleLabel}
                      error={mapping.error}
                      required={mapping.required}
                      disabled={loading}
                    >
                      {(control) => (
                        <Select
                          value={mapping.value}
                          disabled={loading}
                          onValueChange={(value) => {
                            onMappingChange?.(mapping.id, value);
                          }}
                        >
                          {/* 27.30 makes the DISABLED ink load-bearing here:
                              "Columns can be left out, shown as 'Not imported'
                              in disabled ink rather than hidden", drawn
                              `color: var(--fgdis)`. `SelectTrigger`'s own
                              placeholder ink is tertiary, which says "quiet"
                              where the chapter says "switched off". This is
                              the one place in the kit where `--ink-disabled`
                              is the RIGHT tier and not the wrong one. */}
                          <SelectTrigger
                            {...control}
                            className={cn(
                              "data-[placeholder]:text-ink-disabled",
                              (control as { className?: string }).className,
                            )}
                          >
                            <SelectValue placeholder={unmappedLabel} />
                          </SelectTrigger>
                          <SelectContent>
                            {mapping.options.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                                disabled={option.disabled}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </Field>
                  ))}
                </Form>
              ))
            ) : null}

            {current === "review" ? (
              reviewContent ?? (
                <DataPreviewTable
                  columns={previewColumns ?? []}
                  rows={previewRows ?? []}
                  selectable={previewSelectable}
                  includedIds={includedIds}
                  onIncludedChange={onIncludedChange}
                  maxHeight={previewMaxHeight}
                  loading={loading}
                />
              )
            ) : null}

            {current === "run" ? (
              runContent ?? (
                <div className="flex min-w-0 flex-col gap-3">
                  {/* Determinate wherever the caller knows the count. The kit's
                      own rule is "never a spinner where a shape is known", and
                      the shape here is a number of rows. */}
                  <Progress
                    value={runValue}
                    max={runMax}
                    label={runLabel}
                    formatValue={formatRunValue}
                  />
                  {runMeta !== undefined && runMeta !== null ? (
                    <Text as="p" size="caption" tone="tertiary" numeric>
                      {runMeta}
                    </Text>
                  ) : null}
                </div>
              )
            ) : null}

            {current === "report" ? (
              reportContent ??
              ((reportRows ?? previewRows ?? []).length === 0 && !loading ? (
                <EmptyRegister>
                  <span role="status">{reportEmptyLabel}</span>
                </EmptyRegister>
              ) : (
                <DataPreviewTable
                  columns={reportColumns ?? previewColumns ?? []}
                  rows={reportRows ?? previewRows ?? []}
                  maxHeight={previewMaxHeight}
                  loading={loading}
                  emptyLabel={reportEmptyLabel}
                />
              ))
            ) : null}
          </div>
        )}

        {/* The footer. `.kw-savebar`'s rule and inset; `ActionRow align="end"`
            for the alignment and the reversed column below 40rem. */}
        {actions !== undefined || onBack !== undefined || onContinue !== undefined ? (
          <div
            data-slot="import-wizard-footer"
            className="flex flex-wrap items-center gap-3 shadow-[var(--hairline-over)] pt-[var(--space-5)]"
          >
            {meta !== undefined && meta !== null ? (
              <Text as="div" size="caption" tone="tertiary" className="me-auto min-w-0">
                {meta}
              </Text>
            ) : null}
            <ActionRow align="end" className={meta === undefined ? "w-full" : undefined}>
              {actions ?? (
                <React.Fragment>
                  {canGoBack ? (
                    <Button type="button" variant="cancel" onClick={onBack}>
                      {backLabel}
                    </Button>
                  ) : null}
                  {onContinue !== undefined ? (
                    <Button
                      type="button"
                      loading={running && loading}
                      disabled={!canContinue || (running && !finished)}
                      onClick={onContinue}
                    >
                      {commitLabel}
                    </Button>
                  ) : null}
                </React.Fragment>
              )}
            </ActionRow>
          </div>
        ) : null}
      </section>
    );
  },
);

ImportWizard.displayName = "ImportWizard";

export { ImportWizard };
