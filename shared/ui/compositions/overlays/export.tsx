"use client";

/* ============================================================================
   ExportScreen — composition 27.31.

   THE ONE SENTENCE
   "Export is the second-most-pressed button in the system and the only
   overlay besides delete and archive. It asks what, which columns and what
   format — then hands over a file and a log line."

   DESIGN SOURCE — "Kwapso UI Kit.dc.html" chapter 27.31, verbatim:

     IT DEFAULTS TO WHAT YOU ARE LOOKING AT
       "The first option is the rows in view, with the count — because the
        reader pressed Export while looking at a filtered list. 'All records'
        is second, never first."

     THE BUTTON CARRIES THE NUMBER
       "Export 6 rows, not Export. The count on the commit button is the last
        chance to notice that the filter was narrower or wider than intended."

     COLUMNS ARE CHECKBOXES WITH A REAL DEFAULT
       "The visible table columns are ticked, the rest are not, and internal
        notes are never ticked by default — an export that leaks internal
        notes to a client folder is the one mistake this dialog exists to
        prevent."

     THREE FORMATS, NO SETTINGS
       "CSV, Excel, PDF as three pills. No delimiter picker, no encoding menu,
        no date-format choice — dates follow the app language (ruling 07) and
        that is the answer."

     SNAPSHOT, SAID IN WORDS
       "One line states that the file is built now and is not a live link,
        because half the support questions about exports are really questions
        about staleness."

     LOGGED, WITH A NAME
       "Every export writes an activity line naming the member, the scope and
        the format. The dialog says so before you press — nothing about data
        leaving is quiet."

     DOORS DIFFER
       "The portal exports the client's own records only, has no
        internal-notes column at all, and offers CSV and PDF — the PDF carries
        the kwapso letterhead, the CSV does not."

   THE LAW THIS FILE OBEYS
   · ROWS IN VIEW IS FIRST, AND IT IS THE DEFAULT VALUE. Both. The order is in
     the DOM and the default is in `defaultScope`; either one alone would let
     a call site quietly invert the chapter's rule.
   · INTERNAL NOTES IS NEVER TICKED BY DEFAULT, AND THE FILE CANNOT BE MADE TO
     DO IT. `defaultColumnIds` is derived from `column.visible`, and the
     internal-notes column is excluded from that derivation by its own
     `sensitive` flag rather than by being named — so a second sensitive
     column added later inherits the rule instead of repeating the bug.
     In the portal the column is not rendered at all, which is the chapter's
     stronger version of the same sentence.
   · THE COUNT IS ON THE BUTTON, ALWAYS. `formatCommit` takes the count; there
     is no label prop that could ship a bare "Export".
   · THREE PILLS, NO SETTINGS. There is no delimiter prop, no encoding prop
     and no date-format prop on this component, deliberately: a prop is an
     invitation, and the chapter closed all three.
   · TWO SENTENCES THAT ARE NOT DECORATION. The snapshot line sits under the
     title; the logging line sits above the buttons. Neither can be turned
     off — the chapter gives a reason for each and both reasons are about what
     a reader will otherwise assume.
   · ONE MANGO, AND IT IS THE COMMIT. Cancel is paper.
   · EVERY STRING IS A PROP with a default (PATTERN §7).
   · No CSS `border`, no px, no literal colour, no gradient, no illustration.
   · Focus is one global rule. Dark is a token flip.

   NARROW IS A BOTTOM SHEET, AND IT IS THE ARTIFACT'S OWN SECOND RENDER
   "Narrow · a bottom sheet, same three questions" — except that the narrow
   drawing carries What and Format and NOT the column list, and shortens the
   commit to "Export 6". Both are reproduced. The columns are not dropped from
   the export: they keep whatever default the chapter set, which is exactly
   why the default has to be right. The threshold is read with `matchMedia`
   through `useSyncExternalStore`, the same device `quick-view.tsx` and
   `Split` use, so there is no hydration mismatch.

   RENDERING CONTEXT
   `"use client"`. A media subscription, Radix `Dialog` and `Sheet`, and
   handlers built during this module's own render.
   ========================================================================= */

import * as React from "react";

import { Button } from "../../components/button/button";
import { Checkbox } from "../../components/checkbox/checkbox";
import { Choice } from "../../components/choice/choice";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/dialog/dialog";
import { RadioGroup, RadioGroupItem } from "../../components/radio-group/radio-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../../components/sheet/sheet";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "../../components/toggle-group/toggle-group";
import { Hint } from "../../components/typography/typography";
import { DownloadSimple } from "../../foundations/icons";

/** Which door. The portal has no internal notes and no Excel. */
export type ExportDoor = "system" | "portal";

/** What is being exported. Rows in view is first and is the default. */
export type ExportScope = "view" | "all";

/** One column the file can carry. */
export interface ExportColumn {
  /** Stable key, and the value in `columnIds`. */
  id: string;
  /** What the row says. */
  label: string;
  /**
   * This column is on the table the reader is looking at. Visible columns are
   * ticked to start with; the rest are not.
   */
  visible?: boolean;
  /**
   * Internal to kwapso. NEVER ticked by default, whatever `visible` says, and
   * never rendered at all in the portal. A flag rather than a hardcoded id,
   * so the next sensitive column inherits the rule.
   */
  sensitive?: boolean;
}

/** One of the three formats. */
export interface ExportFormat {
  /** Stable key. */
  id: string;
  /** What the pill says. */
  label: string;
}

/** Every user-facing string on this overlay. */
export interface ExportLabels {
  /** The overlay's own name. */
  title: string;
  /** The snapshot sentence, under the title. */
  snapshot: string;
  /** The three group headings. */
  whatLabel: string;
  columnsLabel: string;
  formatLabel: string;
  /** The select-all row over the columns. */
  allColumns: string;
  /** The logging sentence, above the buttons. */
  logged: string;
  /** Retreating. Never mango. */
  cancel: string;
  /** The scope group's accessible name, when the heading is not enough. */
  scopeLabel: string;
}

const SYSTEM_LABELS: ExportLabels = {
  title: "Export Collection",
  snapshot: "The file is built now and downloaded once. It is a snapshot, not a live link.",
  whatLabel: "What",
  columnsLabel: "Columns",
  formatLabel: "Format",
  allColumns: "All",
  logged: "Exports are logged with your name.",
  cancel: "Cancel",
  scopeLabel: "What to export",
};

const DEFAULT_COLUMNS: readonly ExportColumn[] = [
  { id: "record", label: "Record", visible: true },
  { id: "status", label: "Status", visible: true },
  { id: "owner", label: "Owner", visible: true },
  { id: "updated", label: "Updated", visible: true },
  { id: "relation", label: "Relation" },
  /* THE ONE MISTAKE THIS DIALOG EXISTS TO PREVENT. */
  { id: "internal-notes", label: "Internal notes", sensitive: true },
];

const SYSTEM_FORMATS: readonly ExportFormat[] = [
  { id: "csv", label: "CSV" },
  { id: "excel", label: "Excel" },
  { id: "pdf", label: "PDF" },
];

/* ch27.31 doors differ: the portal "offers CSV and PDF". */
const PORTAL_FORMATS: readonly ExportFormat[] = [
  { id: "csv", label: "CSV" },
  { id: "pdf", label: "PDF" },
];

/**
 * Which columns start ticked. THE CHAPTER'S SENTENCE, AS CODE: the visible
 * table columns are ticked, the rest are not, and a sensitive column is never
 * ticked whatever else is true of it.
 */
export function defaultColumnIds(columns: readonly ExportColumn[]): string[] {
  return columns
    .filter((column) => column.visible === true && column.sensitive !== true)
    .map((column) => column.id);
}

/* ----------------------------------------------------------------------------
   Is there room for the centred modal, or is this the bottom sheet?
   Lifted verbatim from `quick-view.tsx` so the two overlays cannot part
   company at two different widths. The server answer is the WIDE one.
   ------------------------------------------------------------------------- */
const NARROW_QUERY = "(min-width: 45rem)";

function subscribeToWidth(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readWidth(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia(NARROW_QUERY).matches;
}

function useHasRoom(): boolean {
  return React.useSyncExternalStore(subscribeToWidth, readWidth, () => true);
}

export interface ExportScreenProps {
  /** The overlay is up. */
  open: boolean;
  /** It was dismissed — Escape, the scrim, the close chip, Cancel. */
  onOpenChange: (open: boolean) => void;
  /** Which door. The portal drops internal notes and Excel. */
  door?: ExportDoor;
  /** Per-locale words. */
  labels?: Partial<ExportLabels>;

  /** How many rows the filters and the tab currently show. */
  viewCount?: number;
  /** How many records the collection holds in total. */
  totalCount?: number;
  /** How the first option reads. */
  formatView?: (count: number) => string;
  /** The quiet second line under it. */
  viewHelp?: string;
  /** How the second option reads. */
  formatAll?: (count: number) => string;
  /** The quiet second line under it. */
  allHelp?: string;

  /** Controlled scope. */
  scope?: ExportScope;
  /** Uncontrolled start. `view` — the chapter's rule, and not overridable to `all`
   *  without saying so at the call site. */
  defaultScope?: ExportScope;
  /** The scope changed. */
  onScopeChange?: (scope: ExportScope) => void;

  /** Every column the file could carry. */
  columns?: readonly ExportColumn[];
  /** Controlled tick set. */
  columnIds?: readonly string[];
  /** The tick set changed. */
  onColumnsChange?: (ids: string[]) => void;

  /** The formats. Three in the system, two in the portal. */
  formats?: readonly ExportFormat[];
  /** Controlled format. */
  format?: string;
  /** The format changed. */
  onFormatChange?: (format: string) => void;

  /** How the commit control reads. The count is never dropped. */
  formatCommit?: (count: number) => string;
  /** How the commit control reads on the narrow sheet — the artifact shortens it. */
  formatCommitNarrow?: (count: number) => string;
  /** Build the file. THE ONE MANGO. */
  onExport?: () => void;
}

/**
 * The export overlay.
 *
 * TEN STATES
 *  1. default        — three questions, two sentences, two buttons.
 *  2. hover          — the controls'. Nothing here draws a wash.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      and Radix traps focus inside the overlay.
 *  4. active/pressed — `Button`'s, `Checkbox`'s, `RadioGroupItem`'s and
 *                      `ToggleGroupItem`'s.
 *  5. disabled       — does not apply. A column a reader may not export is
 *                      ABSENT (ch24.6) — which is exactly what the portal
 *                      does with internal notes — never a dimmed tick.
 *  6. loading        — does not apply. The counts and the columns are known
 *                      before the overlay opens; it is raised FROM the list
 *                      that already has them. A file being BUILT is past this
 *                      screen and is 27.6's.
 *  7. empty          — does not apply. Export is not offered on a collection
 *                      with nothing in it; 27.21 has no Export in its body.
 *  8. error          — does not apply to the overlay. A file that failed to
 *                      build is reported where the download would have
 *                      landed, not by re-opening the questions.
 *  9. selected       — the chosen scope, the ticked columns, the chosen
 *                      format. Each drawn by its own control, each with a
 *                      real ARIA state beside the fill.
 * 10. read-only      — a reader with no export right is passed no `onExport`
 *                      and the control that raises this overlay is absent.
 *
 * NARROW (380px), STATED — the artifact's own second render
 *  · IT BECOMES A BOTTOM SHEET. Below 45rem the same three questions rise
 *    from the bottom edge instead of being centred, so the list the reader
 *    pressed Export from stays above it.
 *  · THE COLUMN LIST GOES, THE DEFAULT DOES NOT. The artifact's narrow
 *    drawing carries What and Format only. The columns still export at the
 *    default the chapter set — visible ticked, internal notes never — which
 *    is the reason that default has to be correct rather than convenient.
 *  · THE COMMIT SHORTENS AND KEEPS ITS NUMBER. "Export 6", not "Export 6
 *    rows", and never "Export".
 *  · BOTH SENTENCES STAY. Snapshot under the title, logging above the
 *    buttons.
 *  · THE FOOTER REVERSES. `SheetFooter` is a reversed column below 40rem, so
 *    the mango spans the row with Cancel under it.
 *
 * RTL — LTR only by client ruling.
 */
function ExportScreen({
  open,
  onOpenChange,
  door = "system",
  labels,
  viewCount = 6,
  totalCount = 24,
  formatView = (count) => `These ${count} rows`,
  viewHelp = "the filters and tab in view",
  formatAll = (count) => `All ${count} records`,
  allHelp = "in this collection",
  scope,
  defaultScope = "view",
  onScopeChange,
  columns = DEFAULT_COLUMNS,
  columnIds,
  onColumnsChange,
  formats,
  format,
  onFormatChange,
  formatCommit = (count) => `Export ${count} rows`,
  formatCommitNarrow = (count) => `Export ${count}`,
  onExport,
}: ExportScreenProps) {
  const words: ExportLabels = { ...SYSTEM_LABELS, ...labels };
  const hasRoom = useHasRoom();

  /* THE PORTAL HAS NO INTERNAL-NOTES COLUMN AT ALL. Not hidden, not disabled:
     absent, which is ch24.6 and the chapter's own stronger sentence. */
  const shown = columns.filter((column) => door === "system" || column.sensitive !== true);
  const formatList = formats ?? (door === "portal" ? PORTAL_FORMATS : SYSTEM_FORMATS);

  const [uncontrolledScope, setUncontrolledScope] = React.useState<ExportScope>(defaultScope);
  const currentScope = scope ?? uncontrolledScope;

  const [uncontrolledColumns, setUncontrolledColumns] = React.useState<string[]>(() =>
    defaultColumnIds(shown),
  );
  const currentColumns = columnIds ?? uncontrolledColumns;

  const [uncontrolledFormat, setUncontrolledFormat] = React.useState<string>(
    () => formatList[0]?.id ?? "",
  );
  const currentFormat = format ?? uncontrolledFormat;

  const count = currentScope === "view" ? viewCount : totalCount;

  const setScope = (next: ExportScope) => {
    if (scope === undefined) setUncontrolledScope(next);
    onScopeChange?.(next);
  };

  const setColumns = (next: string[]) => {
    if (columnIds === undefined) setUncontrolledColumns(next);
    onColumnsChange?.(next);
  };

  const toggleColumn = (id: string, on: boolean) => {
    setColumns(
      on
        ? shown.filter((column) => column.id === id || currentColumns.includes(column.id)).map(
            (column) => column.id,
          )
        : currentColumns.filter((value) => value !== id),
    );
  };

  const allOn = shown.length > 0 && shown.every((column) => currentColumns.includes(column.id));
  const someOn = shown.some((column) => currentColumns.includes(column.id));

  const setFormat = (next: string) => {
    /* A segmented control with nothing chosen is not a state this dialog
       has — there are always three formats and one of them is the file. */
    if (next === "") return;
    if (format === undefined) setUncontrolledFormat(next);
    onFormatChange?.(next);
  };

  /* ---- the body, identical in the modal and the sheet ------------------- */
  const what = (
    <section className="flex min-w-0 flex-col gap-3">
      <h3 className="text-micro font-[var(--font-weight-medium)] uppercase text-ink-tertiary">
        {words.whatLabel}
      </h3>
      <RadioGroup
        aria-label={words.scopeLabel}
        value={currentScope}
        onValueChange={(value) => setScope(value as ExportScope)}
        className="flex flex-col gap-2"
      >
        {/* FIRST, AND THE DEFAULT. The reader pressed Export while looking at
            a filtered list. */}
        <Choice label={formatView(viewCount)} description={viewHelp}>
          <RadioGroupItem value="view" />
        </Choice>
        {/* SECOND, NEVER FIRST. */}
        <Choice label={formatAll(totalCount)} description={allHelp}>
          <RadioGroupItem value="all" />
        </Choice>
      </RadioGroup>
    </section>
  );

  /* The artifact's narrow render draws What and Format and not this. */
  const columnList = (
    <section className="hidden min-w-0 flex-col gap-3 sm:flex">
      <h3 className="text-micro font-[var(--font-weight-medium)] uppercase text-ink-tertiary">
        {words.columnsLabel}
      </h3>
      <div className="flex flex-col gap-2">
        <Choice label={words.allColumns}>
          <Checkbox
            checked={allOn ? true : someOn ? "indeterminate" : false}
            onCheckedChange={(next) =>
              setColumns(next === true ? shown.map((column) => column.id) : [])
            }
          />
        </Choice>
        {shown.map((column) => (
          <Choice key={column.id} label={column.label}>
            <Checkbox
              checked={currentColumns.includes(column.id)}
              onCheckedChange={(next) => toggleColumn(column.id, next === true)}
            />
          </Choice>
        ))}
      </div>
    </section>
  );

  const formatPills = (
    <section className="flex min-w-0 flex-col gap-3">
      <h3 className="text-micro font-[var(--font-weight-medium)] uppercase text-ink-tertiary">
        {words.formatLabel}
      </h3>
      {/* THREE PILLS, NO SETTINGS. There is no fourth control in this
          section and no prop that could add one. */}
      <ToggleGroup
        type="single"
        aria-label={words.formatLabel}
        value={currentFormat}
        onValueChange={setFormat}
        className="self-start"
      >
        {formatList.map((entry) => (
          <ToggleGroupItem key={entry.id} value={entry.id}>
            {entry.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </section>
  );

  const body = (
    <div className="flex min-w-0 flex-col gap-[var(--space-6)]">
      {what}
      {columnList}
      {formatPills}
      {/* LOGGED, WITH A NAME — said before the press, not after. It is the
          last line of the body rather than the footer's meta slot: the modal
          is 460 wide, and a sentence this long sharing a row with two buttons
          wraps the commit onto its own line at every width. The artifact
          draws it on its own line above the buttons, which is this. */}
    </div>
  );

  const ways = (
    <React.Fragment>
      {/* THE LOG LINE IS THE FOOTER'S LEADING ITEM. p36 draws "Exports are
          logged with your name." on the SAME row as `Cancel` and the mango
          commit, at the reading start facing them — the shape 27.20's
          "Consequences before the button" gives every footer in the kit, and
          the shape 27.18's invite footer takes. It used to be the last line
          of the body, on the argument that a 460 modal cannot fit three
          things on a row; `DialogFooter` wraps, so where it cannot fit the
          line takes its own row and the pair stays end-aligned under it —
          which is the old drawing, not a worse one. */}
      <Hint as="p" className="min-w-0 sm:me-auto">
        {words.logged}
      </Hint>
      <Button variant="secondary" onClick={() => onOpenChange(false)}>
        {words.cancel}
      </Button>
      {/* THE ONE MANGO, AND IT CARRIES THE NUMBER — and p36's download
          glyph, at both widths. */}
      <Button onClick={onExport}>
        <DownloadSimple aria-hidden="true" />
        {hasRoom ? formatCommit(count) : formatCommitNarrow(count)}
      </Button>
    </React.Fragment>
  );

  if (!hasRoom) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          data-slot="export-screen"
          data-door={door}
          data-width="narrow"
        >
          <SheetHeader>
            <SheetTitle>{words.title}</SheetTitle>
            {/* SNAPSHOT, SAID IN WORDS. */}
            <SheetDescription>{words.snapshot}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-[var(--space-6)] py-[var(--space-4h)]">
            {body}
          </div>
          <SheetFooter>{ways}</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-slot="export-screen" data-door={door} data-width="wide">
        <DialogHeader>
          <DialogTitle>{words.title}</DialogTitle>
          {/* SNAPSHOT, SAID IN WORDS. */}
          <DialogDescription>{words.snapshot}</DialogDescription>
        </DialogHeader>
        <div className="mt-[var(--space-6)] min-w-0">{body}</div>
        <DialogFooter>{ways}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

ExportScreen.displayName = "ExportScreen";

export { ExportScreen };
