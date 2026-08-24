"use client";

/* ============================================================================
   ImportFlow — bringing a spreadsheet into a collection. Five steps, and the
   last one is a per-row failure report.

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" chapter 27.30 (import), 27.44 (import proposal) and
   27.35 (validation).

     ch27.30 on why it is a page, verbatim:
       "It is a full-width page, not a modal, because column mapping needs
        room, and it never commits anything the reader has not seen."

     ch27.30 on the rail, verbatim: "The file, what it is, match the columns,
       check and commit. The rail names all four from the start and marks the
       ones behind you with a tick, so nobody is walked blind through someone
       else's data."

     ch27.30 on saying it twice, verbatim: "Said twice — in the rail and above
       the buttons — because the fear of an import is that half of it already
       happened. Leaving mid-way loses the mapping and nothing else."

     ch27.30 on dropped columns, verbatim: "Columns can be left out, shown as
       'Not imported' in disabled ink rather than hidden. A silently dropped
       column is how a business discovers six months later that its legacy ids
       are gone."

     ch27.30 on unusable rows, verbatim: "Rows with a value the collection does
       not use are counted, told what they will become, and offered a mapping.
       Import is not refused over four rows — it is explained."

     ch27.30 on the commit, verbatim: "Check 148 rows, then Import 148
       records — the number is on the button."

   THE COMMISSION AND THE KIT DISAGREE ON THE STEP COUNT
   Commission §9 asks for "five steps including a per-row failure report".
   ch27.30's rail "names all four". `ImportWizard` (tier 2) ships five —
   upload, plan, review, run, report — which is the kit's four with the write
   and the report separated. FIVE is what is built, because tier 2 and the
   commission agree and because a report the reader can read is the whole
   point of the last step. GAPS-SHAPES.md SHP-13.

   THE LAW THIS FILE OBEYS
   · NOTHING IS WRITTEN UNTIL THE LAST STEP, AND IT SAYS SO TWICE. The note
     rides the wizard's `meta` slot above the buttons; the rail says it by
     marking every step from the start.
   · A DROPPED COLUMN IS SHOWN, NOT HIDDEN. Every mapping is given a
     "Not imported" option unless it already has one, so leaving a column out
     is a visible choice rather than an omission.
   · THE NUMBER IS ON THE BUTTON. `rowCount` produces both the review label
     and the commit label, so a reader never presses an unquantified Import.
   · A FAILURE IS PER ROW, WITH ITS REASON. Failures become preview rows at
     `outcome: "invalid"` carrying their own issue, which is what
     `DataPreviewTable` already draws.
   · THERE IS NO IMPORT IN THE PORTAL (ch27.30). This shape has no `door`
     because only one door has it.
   · Focus is one global rule. No ring, no radius, no fill written here.

   RENDERING CONTEXT
   `"use client"`. Step state, file handlers and mapping handlers all built
   during this module's own render.
   ========================================================================= */

import * as React from "react";

import type { FileUploadItem } from "../../controls/file-upload/file-upload";
import type {
  DataPreviewColumn,
  DataPreviewRow,
} from "../../structures/data-preview-table/data-preview-table";
import {
  ImportWizard,
  type ImportMapping,
  type ImportMappingOption,
  type ImportWizardStep,
} from "../../structures/import-wizard/import-wizard";
import { cn } from "../../lib/utils";
import {
  SHAPE_SHELL,
  shapeCopy,
  type ScreenDensity,
  type ShapeState,
  type ShapeStateCopy,
} from "../states/states";

/** The five steps, in order. */
export const IMPORT_STEPS: readonly ImportWizardStep[] = [
  "upload",
  "plan",
  "review",
  "run",
  "report",
] as const;

/** One row the import could not take, and why. */
export interface ImportFailure {
  /** Stable key. Normally the source row number. */
  id: string;
  /** The row's values, keyed by column. */
  values?: Record<string, React.ReactNode>;
  /** What is wrong with it, in words. ch27.30: counted, and told what it will become. */
  issue: React.ReactNode;
  /** Per-cell reasons, when more than one cell is at fault. */
  issues?: Record<string, React.ReactNode>;
  /** Where it came from — the file and the line. */
  origin?: React.ReactNode;
}

export interface ImportFlowProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title" | "onChange"> {
  /** The wide staff door. There is no import in the portal (ch27.30). */
  density?: ScreenDensity;

  /** Which step. */
  step?: ImportWizardStep;
  /** Uncontrolled first step. */
  defaultStep?: ImportWizardStep;
  /** Step changed. */
  onStepChange?: (step: ImportWizardStep) => void;
  /** Per-locale step names. */
  stepLabels?: Partial<Record<ImportWizardStep, string>>;
  /** Completed steps are clickable — "a person checking their work should not have to re-upload". */
  railNavigable?: boolean;
  /** Accessible name for the rail. */
  railLabel?: string;

  /** What this import is. */
  title?: React.ReactNode;
  /** A line under it. */
  description?: React.ReactNode;

  /** The chosen file. */
  files?: FileUploadItem[];
  /** A file was chosen. */
  onFilesSelected?: (files: File[]) => void;
  /** A file was removed. */
  onFileRemove?: (id: string) => void;
  /** Which file types. */
  accept?: string;
  /** The drop zone's prompt. */
  uploadPrompt?: React.ReactNode;
  /** The line under it. */
  uploadHint?: React.ReactNode;

  /** The column map. */
  mappings?: ImportMapping[];
  /** A column was mapped. */
  onMappingChange?: (id: string, value: string) => void;
  /** The word beside a guessed mapping. */
  guessedLabel?: string;
  /**
   * The option that leaves a column out. Added to every mapping that has no
   * option with this value, because ch27.30 requires the choice to be visible.
   */
  notImportedValue?: string;
  /** What that option says. */
  notImportedLabel?: string;

  /** The check step's columns. */
  previewColumns?: DataPreviewColumn[];
  /** The check step's rows. */
  previewRows?: DataPreviewRow[];
  /** Rows can be ticked out of the import. */
  previewSelectable?: boolean;
  /** Which rows are in. */
  includedIds?: readonly string[];
  /** The selection changed. */
  onIncludedChange?: (ids: string[]) => void;

  /** How far the write has got. */
  runValue?: number | null;
  /** Out of how many. */
  runMax?: number;
  /** What the bar says. */
  runLabel?: string;
  /** Anything beside the bar. */
  runMeta?: React.ReactNode;

  /** The report's columns. */
  reportColumns?: DataPreviewColumn[];
  /** The rows that could not be taken, each with its reason. */
  failures?: readonly ImportFailure[];
  /** What the report says when nothing failed. */
  reportEmptyLabel?: string;
  /** Anything above the report table — the line saying what came in. */
  reportContent?: React.ReactNode;

  /**
   * How many rows the file holds. Puts the number on the review and commit
   * labels, which ch27.30 requires.
   */
  rowCount?: number;
  /** How the review label reads. */
  formatReviewLabel?: (count: number) => string;
  /** How the commit label reads. */
  formatCommitLabel?: (count: number) => string;

  /** Back a step. */
  onBack?: () => void;
  /** Forward a step. */
  onContinue?: () => void;
  /** Back's label. */
  backLabel?: string;
  /** Forward's label, on the steps that carry no count. */
  continueLabel?: string;
  /** The last step's label. */
  finishLabel?: string;
  /** Forward is available. */
  canContinue?: boolean;
  /** Anything else in the footer. */
  actions?: React.ReactNode;

  /**
   * The line above the buttons. ch27.30 wants it said twice, so this has a
   * default rather than being optional in practice.
   */
  commitNote?: React.ReactNode;

  /** Loading or error. */
  state?: ShapeState;
  /** Per-locale words. */
  copy?: Partial<ShapeStateCopy>;
  /** The retry on a block failure. */
  errorAction?: React.ReactNode;
}

function defaultReviewLabel(count: number): string {
  return `Check ${count} rows`;
}

function defaultCommitLabel(count: number): string {
  return `Import ${count} records`;
}

/**
 * The import, arranged.
 *
 * TEN STATES
 *  1. default        — the rail, the step's body, the note, the two buttons.
 *  2. hover          — owned by the rail, the drop zone and the buttons.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by `Button` and the rail's step control.
 *  5. disabled       — `canContinue={false}` leaves the forward button in its
 *                      disabled fill and ink, with the reason stated in the
 *                      note beside it rather than in a tooltip.
 *  6. loading        — the `run` step IS the loading state, and it is a real
 *                      progress value, never an invented percentage (ch27.6).
 *                      `state="loading"` is the different case where the
 *                      wizard itself has not arrived.
 *  7. empty          — no failures on the report step: the report says so in
 *                      words rather than drawing an empty table.
 *  8. error          — two kinds, kept apart: a per-row failure is data on the
 *                      report step, and `state="error"` is ruling 06's block
 *                      failure where the file could not be read at all.
 *  9. selected       — rows ticked in or out on the check step, owned by
 *                      `DataPreviewTable`.
 * 10. read-only      — a report reopened after the fact: pass the report step
 *                      with no `onContinue`.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — owned by `ImportWizard`. ch27.30: "Mapping six
 *  columns needs the width of the screen and a scroll of its own", so the
 *  mapping table scrolls inside itself rather than the page.
 *
 * RTL — LTR only by client ruling.
 */
function ImportFlow({
  className,
  density = "comfortable",
  step,
  defaultStep,
  onStepChange,
  stepLabels,
  railNavigable = true,
  railLabel,
  title,
  description,
  files,
  onFilesSelected,
  onFileRemove,
  accept,
  uploadPrompt,
  uploadHint,
  mappings,
  onMappingChange,
  guessedLabel,
  notImportedValue = "",
  notImportedLabel = "Not imported",
  previewColumns,
  previewRows,
  previewSelectable = true,
  includedIds,
  onIncludedChange,
  runValue,
  runMax,
  runLabel,
  runMeta,
  reportColumns,
  failures,
  reportEmptyLabel = "Every row came in.",
  reportContent,
  rowCount,
  formatReviewLabel = defaultReviewLabel,
  formatCommitLabel = defaultCommitLabel,
  onBack,
  onContinue,
  backLabel,
  continueLabel,
  finishLabel,
  canContinue,
  actions,
  commitNote = "Nothing is written until the last step. Leaving now loses the mapping, not any records.",
  state = "ready",
  copy,
  errorAction,
  ...props
}: ImportFlowProps) {
  const words = shapeCopy("importFlow", copy);

  /* ch27.30 — a column left out must be a visible choice. Every mapping gets
     the "Not imported" option unless the caller already supplied one. */
  const mapped = React.useMemo<ImportMapping[] | undefined>(() => {
    if (mappings === undefined) return undefined;
    return mappings.map((mapping) => {
      const has = mapping.options.some((option) => option.value === notImportedValue);
      if (has) return mapping;
      const option: ImportMappingOption = {
        value: notImportedValue,
        label: notImportedLabel,
      };
      return { ...mapping, options: [...mapping.options, option] };
    });
  }, [mappings, notImportedValue, notImportedLabel]);

  /* A failed row is a preview row at `invalid`. `DataPreviewTable` already
     draws the outcome chip, the per-cell reasons and the summary counts. */
  const reportRows = React.useMemo<DataPreviewRow[] | undefined>(() => {
    if (failures === undefined) return undefined;
    return failures.map((failure) => ({
      id: failure.id,
      values: failure.values,
      issues: failure.issues,
      issue: failure.issue,
      origin: failure.origin,
      outcome: "invalid" as const,
    }));
  }, [failures]);

  const activeStep = step ?? defaultStep ?? "upload";
  const counted = rowCount !== undefined;
  const stepContinueLabel =
    counted && activeStep === "plan"
      ? formatReviewLabel(rowCount)
      : counted && activeStep === "review"
        ? formatCommitLabel(rowCount)
        : continueLabel;

  return (
    <div
      data-slot="import-flow"
      data-density={density}
      className={cn("flex w-full min-w-0 flex-col", SHAPE_SHELL[density], className)}
      {...props}
    >
      <ImportWizard
        step={step}
        defaultStep={defaultStep}
        onStepChange={onStepChange}
        stepLabels={stepLabels}
        railNavigable={railNavigable}
        railLabel={railLabel}
        title={title}
        description={description}
        files={files}
        onFilesSelected={onFilesSelected}
        onFileRemove={onFileRemove}
        accept={accept}
        uploadPrompt={uploadPrompt}
        uploadHint={uploadHint}
        mappings={mapped}
        onMappingChange={onMappingChange}
        guessedLabel={guessedLabel}
        unmappedLabel={notImportedLabel}
        previewColumns={previewColumns}
        previewRows={previewRows}
        previewSelectable={previewSelectable}
        includedIds={includedIds}
        onIncludedChange={onIncludedChange}
        runValue={runValue}
        runMax={runMax}
        runLabel={runLabel}
        runMeta={runMeta}
        reportColumns={reportColumns}
        reportRows={reportRows}
        reportEmptyLabel={reportEmptyLabel}
        reportContent={reportContent}
        onBack={onBack}
        onContinue={onContinue}
        backLabel={backLabel}
        continueLabel={stepContinueLabel}
        startLabel={counted ? formatCommitLabel(rowCount) : undefined}
        finishLabel={finishLabel}
        canContinue={canContinue}
        actions={actions}
        /* Said twice: the rail names every step from the start, and this is
           the second saying, immediately above the buttons. */
        meta={commitNote}
        loading={state === "loading"}
        error={state === "error"}
        errorTitle={words.errorTitle}
        errorBody={words.errorDescription}
        errorAction={errorAction}
      />
    </div>
  );
}

ImportFlow.displayName = "ImportFlow";

export { ImportFlow };
