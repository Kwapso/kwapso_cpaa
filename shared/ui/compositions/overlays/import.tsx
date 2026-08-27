"use client";

/* ============================================================================
   ImportScreen — composition 27.30.

   THE ONE SENTENCE
   "Bringing a spreadsheet into a collection — the move the whole practice is
   named after. It is a full-width page, not a modal, because column mapping
   needs room, and it never commits anything the reader has not seen."

   DESIGN SOURCE — "Kwapso UI Kit.dc.html" chapter 27.30, verbatim:

     A PAGE, NEVER A MODAL
       "Mapping six columns needs the width of the screen and a scroll of its
        own. Import takes the whole content area with the rail and header
        intact — the same reason onboarding is a page."

     FOUR STEPS, AND THE COUNT IS STATED — OVERRIDDEN TO FIVE, SEE BELOW
       "The file, what it is, match the columns, check and commit. The rail
        names all four from the start and marks the ones behind you with a
        tick, so nobody is walked blind through someone else's data."

     NOTHING IS WRITTEN BEFORE THE LAST STEP
       "Said twice — in the rail and above the buttons — because the fear of
        an import is that half of it already happened. Leaving mid-way loses
        the mapping and nothing else."

     UNMAPPED IS A CHOICE, IN DISABLED INK
       "Columns can be left out, shown as 'Not imported' in disabled ink
        rather than hidden. A silently dropped column is how a business
        discovers six months later that its legacy ids are gone."

     PROBLEMS ARE COUNTED, NEVER BLOCKING
       "Rows with a value the collection does not use are counted, told what
        they will become, and offered a mapping. Import is not refused over
        four rows — it is explained."

     THE COMMIT BUTTON COUNTS
       "Check 148 rows, then Import 148 records — the number is on the button.
        Afterwards the collection opens with a line saying what came in and
        what was skipped, and the log holds the file name."

     DOORS DIFFER
       "There is no import in the portal. A client with a spreadsheet sends it
        in the thread and kwapso imports it — which is the service, not a
        missing feature."

   THE STEP COUNT IS FIVE, BY CLIENT RULING — OVERRIDE 23
   `verify/decisions.html` U2, ruled 2026-08-23: **the kit's import is FIVE
   steps, not four, and 27.30 is the stale side.** The register entry is
   number 23 in `KWAPSO-SPEC.md`; 27.30's "all four" and its narrow "Step 3 of
   4" are both owed an upstream correction, logged in ARTIFACT CORRECTIONS
   OWED. `GAPS-SHAPES.md` SHP-13 — the disagreement that raised the question —
   now points at the register and is closed, as is `GAPS-TRACK3B.md` T3B-2.

   The fifth step is the one commission §9 asked for: A PER-ROW FAILURE
   REPORT. The artifact's own four names survive intact — the file, what it
   is, match the columns, check and commit — and the report is added after
   them, because the ruling settles the COUNT and touches nothing else 27.30
   states. 27.30 names no fifth step, so its label is `ImportWizard`'s own
   word for the same panel.

   WHY THE PAGE WAS EXTENDED RATHER THAN REPLACED BY `ImportFlow`
   Composing the shape was the preferred route and was tried against both
   files first. It loses five things 27.30 states, and none of them can be
   recovered without editing `ImportWizard`, which this change does not touch:

     1. SAID TWICE. 27.30: "in the rail and above the buttons". `ImportWizard`
        has exactly one slot for the sentence — `meta`, above the buttons.
        There is no slot under the rail; `description` renders ABOVE it, with
        the title. `import-flow.tsx` concedes this in its own header, arguing
        "the rail says it by marking every step from the start" — which is a
        rail, not a second sentence.
     2. UNMAPPED IS DISABLED INK. `ImportFlow` adds the "Not imported" OPTION
        to every mapping, which is the visible choice; nothing draws the
        chosen trigger in `--ink-disabled`. `ImportMapping` has no per-row ink
        or class hook, so the ink cannot be supplied from a call site.
     3. PROBLEMS ARE COUNTED, NEVER BLOCKING. The counted-rows `Alert` and its
        "Map values" answer have no slot on the wizard's plan step; the only
        way in is `planContent`, which replaces the whole panel and so
        hand-builds the thing composing was meant to avoid.
     4. THE RAIL BECOMES A COUNT AT 380. The artifact's second render replaces
        the rail with "Step 3 of 4" — now "Step 3 of 5". `ImportWizard` rules
        the opposite in its own breakpoint block: "the rail keeps its equal
        columns and ellipsises its labels rather than stacking". The ruling
        explicitly preserves the narrow count, so the two cannot both hold.
     5. THE HEADER STAYS INTACT. 27.30 takes "the whole content area with the
        rail and header intact": an eyebrow, an `h1`, and Export / + in paper.
        The wizard's title is an `h2` with no eyebrow and no actions.

   So the page stays hand-composed — but it is still not redrawing anything.
   The four mapping steps are composed from the same parts `ImportWizard`
   uses (`StatusStepper variant="steps"`, `Select`, `Alert`, `ActionRow`), and
   the fifth step is the wizard's OWN report: `DataPreviewTable` with each
   failed row at `outcome: "invalid"` carrying its `issue`, `issues` and
   `origin` — the exact mapping `import-flow.tsx` performs, and against
   `import-flow.tsx`'s own `ImportFailure`, imported as a type and re-exported
   rather than redeclared, so the same array can be handed to either and the
   compiler says so.

   THIS IS NOT 27.44, AND THE TWO MUST NOT BE MERGED
   27.44 (`import-proposal.tsx`) is a different composition and the chapter
   files it in a different group. Held apart on five counts, every one of them
   drawn:
     · 27.30 is a PAGE with the rail and header intact. 27.44 is "the one
       overlay in the kit that owns the window", and it dims the page behind.
     · 27.30's rail carries FIVE steps and 27.44's carries four, numbered
       01–04 — U2 ruled on 27.30's count and nothing else, so the two rails
       are different LENGTHS.
       CORRECTED 2026-08-24 (register 60): this said the two were "different
       axes" too, and that 27.30's steps "run ACROSS the top as chapter 15's
       rail". They do not. 27.30's own markup is
       `display: flex; flex-direction: column; gap: 18px` in the first cell of
       a two-column grid — a LEFT rail, the same axis as 27.44's, and 27.38
       states the rule for all three of them in words: "the same left rail".
       The two are held apart by length, not by axis.
     · 27.30's step 3 is a person mapping columns by hand. 27.44's step 2 is
       the system's OWN PROPOSAL, with a confidence percentage per field.
     · 27.30 counts unusable ROWS ("4 rows have a status the collection does
       not use"). 27.44 counts unsure FIELDS ("1 needs you", with a poppy
       dot).
     · 27.30's commit reads "Check 148 rows" then "Import 148 records".
       27.44's reads "Approve", because approving a proposal is ruling 33's
       word and not a count.
   The one law they share is the one both state in their own words: nothing is
   written until the last press.

   THE LAW THIS FILE OBEYS
   · NOTHING IS WRITTEN UNTIL THE LAST PRESS, AND IT IS SAID TWICE. Once under
     the rail, once above the buttons. Both are props; neither can be turned
     off, because the chapter's reason for saying it twice is the reader's
     fear rather than a layout balance. On the report step — and only there —
     the pair is swapped for 27.30's own after-the-write lines, "what came in
     and what was skipped" and the file name the log holds, because a screen
     that said "nothing is written yet" over a finished import would be lying
     in the one place the reader is checking.
   · UNMAPPED IS DISABLED INK, NOT A HIDDEN ROW. A column mapped to
     `notImportedValue` keeps its row and its trigger takes `--ink-disabled`.
     The control is NOT disabled — it is the live control that undoes the
     choice. Disabled ink here is the kit's ink scale doing what ruling 27
     left it for, on a value that means "nothing".
   · THE NUMBER IS ON THE BUTTON. `rowCount` produces the commit label through
     `formatCommit`, and the write label through `formatWrite`, so no call
     site can ship a bare "Check" or a bare "Import". 27.30 draws both words:
     "Check 148 rows, then Import 148 records".
   · ONE MANGO, AND IT IS THE COMMIT. The header's Export and + step down to
     paper, the same step `empty-collection.tsx` makes for the same reason.
   · THE PAGE IS FULL WIDTH. No `max-w-*` anywhere in this file.
   · EVERY STRING IS A PROP with a default (PATTERN §7).
   · No CSS `border`, no px, no literal colour, no gradient, no illustration.
   · Focus is one global rule. Dark is a token flip.

   RENDERING CONTEXT
   `"use client"`. The mapping selects and every control carry handlers built
   during this module's own render.
   ========================================================================= */

import * as React from "react";

import { ActionRow } from "../../components/action-row/action-row";
import { Alert } from "../../components/alert/alert";
import { Button } from "../../components/button/button";
import { Card, CardContent } from "../../components/card/card";
import {
  DataPreviewTable,
  type DataPreviewColumn,
  type DataPreviewRow,
} from "../../components/data-preview-table/data-preview-table";
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
import { Plus } from "../../foundations/icons";
import { MainScreen } from "../templates";
/* TYPE ONLY. This screen does not compose the shape — see the header — but a
   failed row is the same object on both sides and must stay one declaration. */
import type { ImportFailure } from "../templates/import-flow";

/**
 * The five steps: the chapter's own four, in its own order and its own words,
 * and the per-row failure report ruled onto the end by U2 / override 23.
 */
export type ImportStep = "file" | "what" | "match" | "commit" | "report";

export const IMPORT_STEPS: readonly ImportStep[] = [
  "file",
  "what",
  "match",
  "commit",
  "report",
] as const;

/** One field a column can be mapped into. */
export interface ImportFieldOption {
  /** The value handed back by `onMappingChange`. */
  value: string;
  /** What the row says. */
  label: string;
}

/** One column in the file, and where it is going. */
export interface ImportColumnMapping {
  /** Stable key. Normally the column heading in the file. */
  id: string;
  /** The heading as the spreadsheet spells it. */
  source: string;
  /** Which field it is mapped to. `notImportedValue` means it is being left out. */
  value: string;
  /** The first value in that column, so the reader can recognise it. */
  firstValue: string;
}

/**
 * One row the import could not take, and why.
 *
 * NOT redeclared — this is `compositions/shapes/import-flow.tsx`'s own type,
 * re-exported. A type-only import, so nothing of the shape reaches the bundle;
 * what it buys is that "the same array can be handed to either" is enforced by
 * the compiler instead of promised in a comment.
 */
export type { ImportFailure };

/** Every user-facing string on this screen. */
export interface ImportLabels {
  /** The micro line over the heading. */
  eyebrow: string;
  /** The page's own name, on desktop. */
  heading: string;
  /** The header's export control. */
  exportLabel: string;
  /** The header's create control — an icon-free paper pill on this page. */
  createLabel: string;
  /** The rail's accessible name. */
  stepsLabel: string;
  /** The five step names, in order. */
  stepFile: string;
  stepWhat: string;
  stepMatch: string;
  stepCommit: string;
  /** 27.30 names no fifth step. `ImportWizard`'s own word for the same panel. */
  stepReport: string;
  /** Said under the rail. The first of the two. */
  notYetRail: string;
  /** Said above the buttons. The second of the two. */
  notYetFooter: string;
  /** The file's name, in the meta line. */
  fileName: string;
  /** How many columns the file has, already worded. */
  columnCount: string;
  /** The three column headings over the mapping. */
  columnInFile: string;
  fieldInCollection: string;
  firstValue: string;
  /** The accessible name of one row's field control. `%s` is the column. */
  fieldControlLabel: string;
  /** What a column left out of the import reads. */
  notImportedLabel: string;
  /** The counted problem, and what those rows will become. */
  problem: string;
  /** The control that answers it. */
  mapValues: string;
  /** Retreating. Never mango. Withdrawn on the report — there is nothing to go back to. */
  back: string;
  /**
   * The mango on the report step. NOT `ImportWizard`'s "Done": `StatusStepper`
   * marks every step behind you with an sr-only "Done", so a button of the
   * same word would be the fifth "Done" a screen reader hears on this screen.
   * ch27.30's own sentence for what happens next — "afterwards the collection
   * opens" — is the label instead.
   */
  done: string;
  /** Said above the buttons on the report step, in `notYetFooter`'s place. */
  logNote: string;
  /** The report table's accessible name. */
  reportLabel: string;
  /** What the report says when every row came in. */
  reportEmpty: string;
}

/** The four fields the artifact's own file maps into, plus the way out. */
export const NOT_IMPORTED = "not-imported";

const DEFAULT_LABELS: ImportLabels = {
  eyebrow: "Collection · import",
  heading: "Import records",
  exportLabel: "Export",
  createLabel: "Add a record",
  stepsLabel: "Import steps",
  /* ch27.30, verbatim: "The file, what it is, match the columns, check and
     commit." The fifth is override 23's, and takes `ImportWizard`'s word. */
  stepFile: "The file",
  stepWhat: "What it is",
  stepMatch: "Match the columns",
  stepCommit: "Check and commit",
  stepReport: "The report",
  notYetRail: "Nothing is written until the last step. Leaving now loses the mapping, not any records.",
  notYetFooter: "Two columns will be ignored. Nothing is written yet.",
  fileName: "roster-aug.csv",
  columnCount: "6 columns",
  columnInFile: "Column in the file",
  fieldInCollection: "Field in Collection",
  firstValue: "First value",
  fieldControlLabel: "Field for %s",
  notImportedLabel: "Not imported",
  problem:
    "4 rows have a status the collection does not use. They will import as Pending unless you map the value.",
  mapValues: "Map values",
  back: "Back",
  done: "Open the collection",
  /* ch27.30: "the log holds the file name". */
  logNote: "The log holds the file name.",
  reportLabel: "Rows that could not be written",
  reportEmpty: "Every row came in.",
};

const DEFAULT_FIELDS: readonly ImportFieldOption[] = [
  { value: "title", label: "Record title" },
  { value: "owner", label: "Owner" },
  { value: "status", label: "Status" },
  { value: "opened", label: "Opened" },
  { value: NOT_IMPORTED, label: "Not imported" },
];

/* The artifact's own six columns, its own values. */
const DEFAULT_COLUMNS: readonly ImportColumnMapping[] = [
  { id: "name", source: "name", value: "title", firstValue: "Court 3 booking" },
  { id: "owner_email", source: "owner_email", value: "owner", firstValue: "aurora@kwapso.com" },
  { id: "stage", source: "stage", value: "status", firstValue: "in build" },
  { id: "opened", source: "opened", value: "opened", firstValue: "13/06/2026" },
  { id: "notes", source: "notes", value: NOT_IMPORTED, firstValue: "—" },
  { id: "legacy_id", source: "legacy_id", value: NOT_IMPORTED, firstValue: "88214" },
];

/* The report's columns are the four mapped fields, each naming the column it
   came FROM — which is the single question a report exists to answer, and
   which `DataPreviewTable` already draws as the quiet second line. */
const DEFAULT_REPORT_COLUMNS: readonly DataPreviewColumn[] = [
  { key: "title", header: "Record title", source: "name" },
  { key: "owner", header: "Owner", source: "owner_email" },
  { key: "status", header: "Status", source: "stage" },
  { key: "opened", header: "Opened", source: "opened" },
];

/* Three rows out of the artifact's 148, each with its reason. Not the four
   counted on the mapping step — those import as Pending, which is the whole
   point of "counted, never blocking". */
const DEFAULT_FAILURES: readonly ImportFailure[] = [
  {
    id: "31",
    origin: "Row 31",
    values: {
      title: "Court 3 resurface",
      owner: "lena@",
      status: "in build",
      opened: "13/06/2026",
    },
    issues: { owner: "Not an address in this workspace." },
    issue: "Owner could not be matched, and this collection requires one.",
  },
  {
    id: "88",
    origin: "Row 88",
    values: { title: "—", owner: "aurora@kwapso.com", status: "waiting", opened: "02/07/2026" },
    issues: { title: "Empty." },
    issue: "A record cannot be written without a title.",
  },
  {
    id: "112",
    origin: "Row 112",
    values: {
      title: "Membership renewals",
      owner: "aurora@kwapso.com",
      status: "in build",
      opened: "last spring",
    },
    issues: { opened: "“last spring” could not be read as a date." },
    issue: "Opened is not a date.",
  },
];

/**
 * The mapping grid's tracks. Three columns from `sm` up; ONE below it, which
 * is the narrow render's "one column pair per row" — the first value is the
 * cell that goes, because it is the only one of the three that is context
 * rather than the decision.
 */
const MAP_ROW =
  "grid min-w-0 gap-x-[var(--space-5)] gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] sm:items-center";

export interface ImportScreenProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  /* ---- The shell's rail -------------------------------------------------
     The screen this route renders is one of the two the kit has, and both of
     them carry the same rail: `SHELL.md`, "the shell above is identical on
     both. The rail never changes between them." The rail's CONTENTS are the
     application's navigation, so they arrive as a node; its placement, its
     measure and the one law about it — dropped entirely below the narrow
     breakpoint, because the kit draws no hamburger anywhere — all belong to
     `ScreenShell` and are not this file's to decide. */

  /** The navigation rail's contents. Placed by the shell, dropped narrow. */
  rail?: React.ReactNode;
  /** Accessible name for the rail. */
  railLabel?: string;
  /** Per-locale words. */
  labels?: Partial<ImportLabels>;
  /** Which of the five steps is open. */
  step?: ImportStep;
  /** A step behind this one was pressed. Absent, the rail is a pure indicator. */
  onStepSelect?: (step: ImportStep) => void;
  /** How many rows the file holds. The number on the button. */
  rowCount?: number;
  /** How the check label reads. The count is never dropped. */
  formatCommit?: (count: number) => string;
  /** How the write label reads, on the check-and-commit step. Also counted. */
  formatWrite?: (count: number) => string;
  /** How the row meta reads. */
  formatRows?: (count: number) => string;
  /** How the narrow step count reads. */
  formatStep?: (position: number, total: number) => string;
  /**
   * ch27.30: "a line saying what came in and what was skipped". Said under the
   * rail on the report step, where the two "nothing is written" lines were.
   */
  formatWrote?: (written: number, failed: number) => string;
  /** Every field a column can go into, including the way out. */
  fields?: readonly ImportFieldOption[];
  /** The value that means "leave this column out". */
  notImportedValue?: string;
  /** The columns in the file, and where each is going. */
  columns?: readonly ImportColumnMapping[];
  /** A column was mapped somewhere else. */
  onMappingChange?: (id: string, value: string) => void;
  /** Answer the counted problem. */
  onMapValues?: () => void;
  /** The report's columns. */
  reportColumns?: readonly DataPreviewColumn[];
  /** The rows the import could not take, each with its reason. */
  failures?: readonly ImportFailure[];
  /** Back a step. Never mango. Withdrawn on the report. */
  onBack?: () => void;
  /** On to the next step. THE ONE MANGO. */
  onContinue?: () => void;
  /** The page header's export. */
  onExport?: () => void;
  /** The page header's create. */
  onCreate?: () => void;
}

/**
 * The import page.
 *
 * TEN STATES
 *  1. default        — the header, the five-step rail, the mapping, the two
 *                      sentences and the footer.
 *  2. hover          — the controls'. `Button`, `Select` and `StatusStepper`
 *                      each own theirs; nothing in this file draws a wash.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — `Button`'s and `StatusStepper`'s.
 *  5. disabled       — DOES NOT APPLY, and the distinction matters on this
 *                      screen. "Not imported" is DISABLED INK on a live
 *                      control, not a disabled control: it is the reader's
 *                      choice and it must stay undoable in one press. Nothing
 *                      here is switched off.
 *  6. loading        — does not apply to this step. A file still being read
 *                      is step 1, and a write in flight is past the commit —
 *                      neither is the mapping screen. 27.6 owns both.
 *  7. empty          — the report step with no failures, which is the good
 *                      outcome and says so in words: `DataPreviewTable`'s own
 *                      register carries "Every row came in." The mapping step
 *                      has no empty — a file with no columns never reaches
 *                      it; it fails at step 1 with the file named.
 *  8. error          — NOT A STATE OF THIS SCREEN, by the chapter's own
 *                      instruction: "Import is not refused over four rows —
 *                      it is explained." A problem is COUNTED, in an `Alert`
 *                      that keeps the commit control live, and a row that
 *                      could not be written is DATA on the report step, drawn
 *                      as `DataPreviewTable`'s `invalid` outcome.
 *  9. selected       — the current step, `StatusStepper`'s mango, with
 *                      `aria-current="step"` beside it. Colour never alone.
 * 10. read-only      — the report step is read-only by nature: nothing on it
 *                      can be changed, so `Back` is withdrawn rather than
 *                      drawn dead. A reader with no import right never
 *                      reaches this route at all; the control that opens it
 *                      is absent (ch24.6).
 *
 * NARROW (380px), STATED — the artifact's own second render
 *  · THE PAGE HEADING BECOMES THE STEP. Desktop reads "Import records" with
 *    "Match the columns" over the panel; narrow reads "Match the columns" at
 *    the top and drops the panel's repeat. One DOM, two renders.
 *  · THE RAIL BECOMES A COUNT. Five equal columns do not survive 380, so the
 *    rail is replaced by "Step 3 of 5" — the artifact's own sentence, at the
 *    count override 23 settled, and the reason the count is stated at all.
 *  · ONE COLUMN PAIR PER ROW. The mapping grid drops to a single column:
 *    the file's heading, then the field it goes to. "First value" is the cell
 *    that goes.
 *  · THE REPORT SCROLLS ON ITS OWN AXIS. `DataPreviewTable` puts the grid in
 *    its own scroller and keeps the count strip above it, which is the part
 *    of a long report that fits on a phone. Nothing about it is re-decided
 *    here.
 *  · THE HEADER ACTIONS GO. Export and + are page chrome, not this screen's
 *    work, and the artifact's narrow render draws neither.
 *  · THE COMMIT SITS ABOVE BACK. `ActionRow align="end"` is a reversed column
 *    below 40rem, so the mango spans the row and Back sits under it — which
 *    is the order the artifact's narrow render draws.
 *  · BOTH "nothing is written" SENTENCES STAY. They are the composition's
 *    reason for existing at this width as much as at 1440.
 *
 * RTL — LTR only by client ruling. The arrow between a column and its field
 * is `aria-hidden`, so nothing announces a direction either.
 */
function ImportScreen({
  rail,
  railLabel,
  className,
  labels,
  step = "match",
  onStepSelect,
  rowCount = 148,
  formatCommit = (count) => `Check ${count} rows`,
  formatWrite = (count) => `Import ${count} records`,
  formatRows = (count) => `${count} rows`,
  formatStep = (position, total) => `Step ${position} of ${total}`,
  formatWrote = (written, failed) =>
    failed === 0
      ? `${written} records came in. Nothing was skipped.`
      : `${written} records came in. ${failed} rows could not be written and are listed below.`,
  fields = DEFAULT_FIELDS,
  notImportedValue = NOT_IMPORTED,
  columns = DEFAULT_COLUMNS,
  onMappingChange,
  onMapValues,
  reportColumns = DEFAULT_REPORT_COLUMNS,
  failures = DEFAULT_FAILURES,
  onBack,
  onContinue,
  onExport,
  onCreate,
  ...props
}: ImportScreenProps) {
  const words: ImportLabels = { ...DEFAULT_LABELS, ...labels };

  const stepIndex = Math.max(0, IMPORT_STEPS.indexOf(step));
  /* The one step that is past the write. Everything the two "nothing is
     written" sentences promise is true on the other four and false here. */
  const written = step === "report";

  /* ch27.30: "The rail names all [the steps] from the start and marks the ones
     behind you with a tick." `StatusStepper variant="steps"` is chapter 15's
     rail and draws the tick itself; `maxVisible={0}` turns off the over-five
     fold, which five stages sit exactly on and which must never engage on a
     rail whose whole job is to show the count — `ImportWizard` freezes it for
     the same reason at the same five. */
  const stages: StatusStage[] = [
    { id: "file", label: words.stepFile },
    { id: "what", label: words.stepWhat },
    { id: "match", label: words.stepMatch },
    { id: "commit", label: words.stepCommit },
    { id: "report", label: words.stepReport },
  ];

  const stepTitle = stages[stepIndex]?.label ?? words.stepFile;

  /* A failed row is a preview row at `invalid`. The same mapping
     `import-flow.tsx` performs, so the report is the wizard's report and not
     a second drawing of one. */
  const reportRows: DataPreviewRow[] = failures.map((failure) => ({
    id: failure.id,
    values: failure.values,
    issues: failure.issues,
    issue: failure.issue,
    origin: failure.origin,
    outcome: "invalid" as const,
  }));

  /* THE NUMBER IS ON THE BUTTON, in both of 27.30's words: "Check 148 rows,
     then Import 148 records". The report has neither — it is past the write,
     and the only thing left to press is the way out. */
  const commitLabel = written
    ? words.done
    : step === "commit"
      ? formatWrite(rowCount)
      : formatCommit(rowCount);

  return (
    /* A MAIN SCREEN, AND THE CHAPTER SETTLES IT IN ITS OWN WORDS.

       27.30: "Import takes the whole content area with the RAIL AND HEADER
       INTACT — the same reason onboarding is a page." Content area with the
       rail intact is `ScreenShell`, so this screen is owed the four levels
       and used to have none of them: it returned a bare `div` and the page,
       the screen card, the rail and the OFF-BEIGE BODY PANE were all missing.

       WHICH OF THE TWO, HONESTLY. It fails BOTH halves of the client's test
       read literally — import is not in the navbar and it draws no
       breadcrumb. But `SHELL.md`'s table is the definition, and on all three
       of the differences it names this screen is a main screen: an eyebrow
       and a heading, no identity chip row and no record number, and NO
       FOOTER. A collection is allowed to drop its folder tabs and its figure
       strip; a record cannot drop its identity. So it is `MainScreen` with
       nothing in the collection slots, and the rail keeps the parent
       collection lit exactly as it does on every other main screen.

       IT IS NOT ONBOARDING'S CASE, and 27.14 and 27.30 say opposite things:
       the whole WINDOW with a mark at the top is the auth family's shell, the
       whole CONTENT AREA with the rail intact is this one. `onboarding.tsx`
       sets out both quotations at length.

       `panel={false}`: FULL WIDTH, no measure and no centring — 27.30's first
       rule — and there is no collection here to put in a panel. The wizard's
       own cards stand on the off-beige body pane. */
    <MainScreen
      data-slot="import-screen"
      className={className}
      rail={rail}
      railLabel={railLabel}
      eyebrow={words.eyebrow}
      headingAs="h1"
      panel={false}
      title={
        <React.Fragment>
          <span className="hidden sm:inline">{words.heading}</span>
          <span className="sm:hidden">{stepTitle}</span>
        </React.Fragment>
      }
      /* BOTH IN PAPER. The one mango on this screen is the commit, at the foot
         of the wizard, so neither of these may be one — and the create steps
         down to a PAPER GLYPH rather than keeping its word, because "Create
         is always the glyph, never the word" is about the control and not
         about its colour. `onCreate` is deliberately NOT passed to the shape:
         that prop draws the mango `+`, and this screen's mango is spoken for.
         Narrow drops both, which is the artifact's own second render. */
      actions={
        <React.Fragment>
          <Button variant="secondary" onClick={onExport}>
            {words.exportLabel}
          </Button>
          <Button
            variant="secondary"
            size="icon"
            aria-label={typeof words.createLabel === "string" ? words.createLabel : undefined}
            onClick={onCreate}
          >
            <Plus aria-hidden="true" />
          </Button>
        </React.Fragment>
      }
      body={
      <React.Fragment>
      <div className="flex min-w-0 flex-col gap-3">
        {/* Desktop: the rail, all five named from the start. */}
        <StatusStepper
          className="hidden sm:flex"
          variant="steps"
          stages={stages}
          current={stepIndex}
          maxVisible={0}
          label={words.stepsLabel}
          onStageSelect={
            onStepSelect === undefined
              ? undefined
              : (index) => {
                  onStepSelect(IMPORT_STEPS[index] as ImportStep);
                }
          }
        />
        {/* Narrow: the count, stated. */}
        <Text as="p" size="sm" tone="tertiary" numeric className="sm:hidden">
          {formatStep(stepIndex + 1, IMPORT_STEPS.length)}
        </Text>

        {/* SAID TWICE — 1 of 2, under the rail. On the report the promise has
            been kept, so its place is taken by ch27.30's own after-the-write
            line: what came in and what was skipped. */}
        <Hint as="p" numeric={written}>
          {written ? formatWrote(rowCount - failures.length, failures.length) : words.notYetRail}
        </Hint>
      </div>

      <Card>
        <CardContent className="flex min-w-0 flex-col gap-[var(--space-5)]">
          <div className="flex min-w-0 flex-col gap-1">
            {/* Narrow already carries this as the page heading. */}
            <Headline as="h2" size="h4" className="hidden sm:block">
              {stepTitle}
            </Headline>
            <Hint as="p" numeric>
              <span className="hidden sm:inline">{words.fileName} · </span>
              {formatRows(rowCount)}
              <span className="hidden sm:inline"> · {words.columnCount}</span>
            </Hint>
          </div>

          {written ? (
            /* STEP 5 — THE PER-ROW FAILURE REPORT, commission §9 and override
               23. Nothing new is drawn: this is `DataPreviewTable`, which
               `ImportWizard` and `ImportFlow` both use for the same panel. It
               carries its own count strip and its own poppy-dot-and-ink
               message per cell.

               A report of NOTHING is the words alone, not a header row over
               an empty grid — which is the branch `ImportWizard` takes at
               exactly this point, and the good outcome deserves a sentence
               rather than a table of column names. */
            reportRows.length === 0 ? (
              <Text as="p" size="sm" tone="tertiary" role="status">
                {words.reportEmpty}
              </Text>
            ) : (
              <DataPreviewTable
                columns={[...reportColumns]}
                rows={reportRows}
                label={words.reportLabel}
                emptyLabel={words.reportEmpty}
              />
            )
          ) : (
            <React.Fragment>
              <div className="flex min-w-0 flex-col">
                {/* The headings. A grid is not a table, so the field controls
                    below carry their own accessible names and this row is
                    decoration for the eye. */}
                <div
                  aria-hidden="true"
                  className={cn(
                    MAP_ROW,
                    "hidden pb-2 shadow-[var(--hairline-under)] sm:grid",
                  )}
                >
                  <span className="text-micro uppercase text-ink-tertiary">
                    {words.columnInFile}
                  </span>
                  <span className="text-micro uppercase text-ink-tertiary">
                    {words.fieldInCollection}
                  </span>
                  <span className="text-micro uppercase text-ink-tertiary">
                    {words.firstValue}
                  </span>
                </div>

                {columns.map((column) => {
                  const unmapped = column.value === notImportedValue;

                  return (
                    <div
                      key={column.id}
                      data-slot="import-mapping-row"
                      data-unmapped={unmapped ? "" : undefined}
                      className={cn(
                        MAP_ROW,
                        "py-[var(--space-3)] shadow-[var(--hairline-under)]",
                      )}
                    >
                      <Text as="span" size="sm">
                        {column.source}
                      </Text>

                      <span className="flex min-w-0 items-center gap-2">
                        {/* The arrow the artifact draws between the two. A
                            picture of the mapping, so it is never announced. */}
                        <span aria-hidden="true" className="text-ink-tertiary">
                          →
                        </span>
                        <Select
                          value={column.value}
                          onValueChange={
                            onMappingChange === undefined
                              ? undefined
                              : (value) => {
                                  onMappingChange(column.id, value);
                                }
                          }
                        >
                          <SelectTrigger
                            aria-label={words.fieldControlLabel.replace("%s", column.source)}
                            /* UNMAPPED IS A CHOICE, IN DISABLED INK. The ink
                               only — the control stays live, because leaving a
                               column out has to be undoable in one press. */
                            className={cn("min-w-0 flex-1", unmapped && "text-ink-disabled")}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {fields.map((field) => (
                              <SelectItem key={field.value} value={field.value}>
                                {field.value === notImportedValue
                                  ? words.notImportedLabel
                                  : field.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </span>

                      {/* The narrow render's "one column pair per row": this is
                          the cell that goes. */}
                      <Text as="span" size="sm" tone="tertiary" className="hidden sm:block">
                        {column.firstValue}
                      </Text>
                    </div>
                  );
                })}
              </div>

              {/* PROBLEMS ARE COUNTED, NEVER BLOCKING. `Alert` reports; it does
                  not interrupt, and the commit control below stays live. */}
              <Alert>
                <div className="flex min-w-0 flex-wrap items-center gap-x-[var(--space-5)] gap-y-3">
                  <Text as="p" size="sm" className="min-w-0 flex-1">
                    {words.problem}
                  </Text>
                  {onMapValues === undefined ? null : (
                    <Button variant="secondary" size="sm" onClick={onMapValues}>
                      {words.mapValues}
                    </Button>
                  )}
                </div>
              </Alert>
            </React.Fragment>
          )}
        </CardContent>
      </Card>

      <ActionRow align="end">
        {/* SAID TWICE — 2 of 2, above the buttons. On the report the write has
            happened, so this is ch27.30's other after-the-write line: "the log
            holds the file name". */}
        <Hint as="p" className="me-auto">
          {written ? words.logNote : words.notYetFooter}
        </Hint>
        {/* Withdrawn on the report rather than drawn dead — a control that will
            never become available should not be on the screen. `ImportWizard`
            withdraws it at exactly this point for exactly this reason. On the
            other four steps it is drawn exactly as before. */}
        {written ? null : (
          <Button variant="secondary" onClick={onBack}>
            {words.back}
          </Button>
        )}
        {/* THE ONE MANGO, AND IT CARRIES THE COUNT. */}
        <Button onClick={onContinue}>{commitLabel}</Button>
      </ActionRow>
      </React.Fragment>
      }
      {...props}
    />
  );
}

ImportScreen.displayName = "ImportScreen";

export { ImportScreen };
