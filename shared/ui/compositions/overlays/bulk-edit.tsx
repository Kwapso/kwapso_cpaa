"use client";

/* ============================================================================
   BulkEditScreen — composition 27.32.

   THE ONE SENTENCE
   "Changing several records at once. The bulk bar replaces the toolbar in
   place (27.1) and the panel that opens is the edit panel from 27.3 with one
   difference: every field says what it will do to how many records."

   DESIGN SOURCE — "Kwapso UI Kit.dc.html" chapter 27.32, verbatim:

     THE COUNT IS IN EVERY SENTENCE
       "Title, helper line, each field's note and the commit button all carry
        the number. 'Edit' with no count is how somebody changes 240 records
        meaning to change four."

     UNTOUCHED FIELDS STAY UNTOUCHED
       "A bulk panel opens with nothing filled. Only fields the reader
        actually sets are written; the rest are left exactly as they are per
        record, and the panel says so in prose above the fields."

     MIXED VALUES ARE NAMED, NOT BLANKED
       "A field whose records disagree reads 'Mixed — leave as they are' in
        tertiary ink rather than showing empty. Blank would imply the change
        is to clear it."

     IT SAYS HOW MANY WILL ACTUALLY CHANGE
       "Under a set field: changes 6 records, 4 are already In review. The
        difference between selected and affected is exactly what a reader
        wants to know before pressing."

     THE SELECTION STAYS VISIBLE
       "The list keeps its ticks and its selected fills beside the panel, so
        the subject of the edit is never off-screen. Nothing collapses to '6
        items'."

     ONE LOG LINE PER RECORD
       "A bulk change writes an ordinary activity line on each record, not one
        'bulk operation' entry. A record's own history must be complete
        without knowing about the batch."

     DOORS DIFFER
       "The portal has no bulk edit and no row checkboxes at all: a client
        acts on one request at a time, which is also why its rows carry no
        selection column."

   THE LAW THIS FILE OBEYS
   · THE BAR REPLACES THE TOOLBAR IN PLACE. It goes into `CollectionFrame`'s
     own toolbar slot and the search, the facets and the page actions are not
     passed while a selection is live. The frame does not move, nothing is
     stacked above it, and no second row appears — "in place" is the whole
     instruction.
   · EVERY FIELD NAMES ITS OWN BLAST RADIUS, AND IT IS COMPUTED, NOT TYPED.
     `formatChanges` is given the selected count and the already-at-this-value
     count; a field that is SET draws the note and a field that is untouched
     draws nothing, because there is nothing yet to describe.
   · MIXED IS WORDS IN TERTIARY INK, NEVER A BLANK CONTROL. It rides the
     `Select`'s placeholder, which ruling 25/27 already puts in tertiary — so
     the ink is the kit's, not a colour chosen here.
   · ONE LOG LINE PER RECORD IS SAID ON THE SCREEN. It is the save bar's meta
     line, beside the commit, because the promise is about what the press
     does.
   · ONE MANGO, AND IT IS "Change 6". Every control in the bulk bar is paper
     EXCEPT Delete, which p36 draws as the poppy fill at both widths
     (`background: var(--poppy)`, charcoal label) — the one filled red pill
     the compositions draw outside 27.4's confirmation. 27.20's "never a
     filled red button in a list" governs LISTS; the bulk bar is a toolbar
     replacement acting on a counted selection, and the artifact's own
     drawing separates the two. The code follows the drawing.
   · THERE IS NO `door` PROP. The portal has no bulk edit and no row
     checkboxes; a prop offering a portal variant would imply one exists.
   · EVERY STRING IS A PROP with a default (PATTERN §7).
   · No CSS `border`, no px, no literal colour, no gradient, no illustration.
   · Focus is one global rule. Dark is a token flip.

   THE COLLECTION BEHIND THE PANEL IS A MAIN SCREEN, AND IT IS DRAWN AS ONE
   THIS COMPOSITION AS A WHOLE IS NEITHER OF THE TWO SCREENS — it is a
   selection STATE plus an overlay, and `SHELL.md` gives selection its own
   treatment rather than a screen of its own. But the collection UNDER the
   overlay is an ordinary main screen: it is in the navbar, it has an eyebrow
   with a count, tabs and a toolbar. So it is drawn by `MainScreen`
   rather than assembled here.

   It used to hand `eyebrow` and `heading` straight to a bare
   `CollectionFrame`. That is 26.03's anatomy diagram, not a screen: it draws
   level 4 (the panel) and the off-beige ground under it, and simply omits
   level 1 (the page), level 2 (the soft-paper SCREEN CARD) and the header
   band that lies on it. `SHELL.md` is the law being followed — "the eyebrow
   and the title are in the HEADER BAND, on the screen card's soft paper" —
   and `MainScreen`'s own header says why a route may not shortcut it: "this
   file does not simply hand `CollectionFrame` a heading."

   DO NOT PUT IT BACK. No route paints its own idea of the page; the four
   levels are written down in exactly one place, `screen-shell.tsx`, and
   reaching past `MainScreen` to `CollectionFrame` is how they went missing
   the first time. The OVERLAY is untouched by this and stays what it is.

   Two of `MainScreen`'s slots are deliberately NOT used here. `meta` is a
   description line under the heading and 27.32 draws none. `panel={false}`
   would remove the soft-paper panel and with it the toolbar and the folder
   tabs — which is the opposite of what this screen needs, since the toolbar's
   slot is the whole subject of the bulk bar below.

   WHY THE PANEL IS A `Sheet` HERE AND NOT `FormScreen`
   `FormScreen surface="panel"` is 27.3's edit panel and would be the obvious
   reach, but it pins `side="right"` — and 27.32's narrow render is explicit:
   "the panel is a bottom sheet". So the panel is assembled from the same
   parts `FormScreen` uses — `Sheet`, `Form`, `Field`, `FormActions` — with
   the side chosen by width. Nothing is redrawn; one prop is chosen that the
   shape does not expose. Logged as T3B-9 in GAPS-TRACK3B.md, because the
   shape should probably grow the prop rather than every caller repeating
   this.

   RENDERING CONTEXT
   `"use client"`. A media subscription, Radix `Sheet`, and the selection and
   field handlers built during this module's own render.
   ========================================================================= */

import * as React from "react";

import { Button } from "../../components/button/button";
import { Field } from "../../components/field/field";
import { Input } from "../../components/input/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/select/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../components/sheet/sheet";
import { Text } from "../../components/typography/typography";
import { type CollectionFrameTab } from "../../components/collection-frame/collection-frame";
import {
  DataTable,
  type DataTableColumn,
} from "../../components/data-table/data-table";
import { Form, FormActions } from "../../components/form/form";
import { Check, Download, EditPencil, List } from "../../foundations/icons";
import { cn } from "../../lib/utils";
import { MainScreen } from "../templates";

/** One record in the list behind the panel. */
export interface BulkRecord {
  /** Stable id. Also the selection key. */
  id: string;
  /** The record number the row leads with. */
  number: string;
  /** What it is called. */
  title: string;
  /** Where it stands. */
  status: string;
  /** Who has it. */
  owner: string;
}

/** One option in a bulk field. */
export interface BulkFieldOption {
  value: string;
  label: string;
}

/**
 * One field in the bulk panel. Every one of them can say what it will do to
 * how many records, which is the single difference between this panel and
 * 27.3's.
 */
export interface BulkField {
  /** Stable key, handed back by `onFieldChange`. */
  id: string;
  /** The words above the control. */
  label: string;
  /** A list to pick from, or a line to type. */
  kind?: "select" | "text";
  /** The options, for `kind: "select"`. */
  options?: readonly BulkFieldOption[];
  /**
   * What the reader has SET. `undefined` is the resting state and the whole
   * point of the panel: an untouched field is not written.
   */
  value?: string;
  /**
   * The selected records disagree about this field. Draws "Mixed — leave as
   * they are" where the value would be, in tertiary ink, rather than a blank
   * control.
   */
  mixed?: boolean;
  /**
   * The line inside an unset text field — "Add a tag to all 6". `%s` is
   * replaced with the number of records selected, so the count in it cannot
   * go stale when the selection changes.
   */
  placeholder?: string;
  /**
   * How many of the selected records already hold the value that has been
   * set. The second half of "changes 6 records · 4 are already In review".
   */
  alreadyCount?: number;
}

/** Every user-facing string on this screen. */
export interface BulkEditLabels {
  /** The micro line over the heading, at rest. */
  eyebrow: string;
  /** The micro line over the heading while a selection is live, on narrow. */
  eyebrowSelected: string;
  /** The collection's name. */
  heading: string;
  /** The tab strip's accessible name. */
  tabsLabel: string;
  /** The bulk bar's accessible name. */
  barLabel: string;
  /** The bar's five controls. */
  edit: string;
  assign: string;
  exportLabel: string;
  deleteLabel: string;
  clear: string;
  /** The table's accessible name and its three columns. */
  bodyLabel: string;
  columnRecord: string;
  columnStatus: string;
  columnOwner: string;
  /** The panel's prose, above the fields. Desktop. */
  panelBody: string;
  /** The same sentence, as the artifact shortens it on narrow. */
  panelBodyNarrow: string;
  /** What a field whose records disagree reads. */
  mixed: string;
  /** Said beside the commit. */
  logLine: string;
  /** Retreating. Never mango. */
  cancel: string;
  /** The panel's close chip. */
  closeLabel: string;
  /** The accessible name of one row's tick. `%s` is the record. */
  rowSelectLabel: string;
  /** The accessible name of the select-all tick. */
  selectAllLabel: string;
}

const DEFAULT_LABELS: BulkEditLabels = {
  eyebrow: "Group · 24 open",
  eyebrowSelected: "Group · 6 selected",
  heading: "Collection",
  tabsLabel: "Collection subsets",
  barLabel: "Actions on the selected records",
  edit: "Edit",
  assign: "Assign",
  exportLabel: "Export",
  deleteLabel: "Delete",
  clear: "Clear",
  bodyLabel: "Records",
  columnRecord: "Record",
  columnStatus: "Status",
  columnOwner: "Owner",
  panelBody:
    "Only the fields you touch are changed. Everything else stays as it is on each record.",
  panelBodyNarrow: "Only the fields you touch are changed.",
  mixed: "Mixed — leave as they are",
  logLine: "One log line per record.",
  cancel: "Cancel",
  closeLabel: "Close",
  rowSelectLabel: "Select %s",
  selectAllLabel: "Select every record on this page",
};

const DEFAULT_TABS: CollectionFrameTab[] = [
  { value: "all", label: "All", count: 24 },
  { value: "mine", label: "Mine", count: 6 },
  { value: "archived", label: "Archived", count: 118 },
];

/* The artifact's own five rows, its own numbers. */
const DEFAULT_RECORDS: readonly BulkRecord[] = [
  { id: "4182", number: "4182", title: "Record title goes here", status: "In build", owner: "Owner" },
  { id: "4179", number: "4179", title: "Second record title", status: "In build", owner: "Owner" },
  { id: "4176", number: "4176", title: "Third record title", status: "In build", owner: "Owner" },
  { id: "4171", number: "4171", title: "Fourth record title", status: "In build", owner: "Owner" },
  { id: "4168", number: "4168", title: "Fifth record title", status: "In build", owner: "Owner" },
  /* A SIXTH ROW THE ARTIFACT DOES NOT DRAW. Its own render shows five rows and
     says "6 records selected" in every sentence around them — the list is
     simply cut off in the drawing. Six rows are shipped here so that the count
     on the screen is the count of the ticks on the screen; a composition whose
     own numbers do not add up is not a specimen. T3B-10. */
  { id: "4165", number: "4165", title: "Sixth record title", status: "In review", owner: "Owner" },
];

const STATUS_OPTIONS: readonly BulkFieldOption[] = [
  { value: "In build", label: "In build" },
  { value: "In review", label: "In review" },
  { value: "Shipped", label: "Shipped" },
];

const OWNER_OPTIONS: readonly BulkFieldOption[] = [
  { value: "Anja Kessler", label: "Anja Kessler" },
  { value: "Tomás Reiner", label: "Tomás Reiner" },
  { value: "Marta Lindqvist", label: "Marta Lindqvist" },
];

/* The artifact's own three fields, in its own order and its own state:
   Status SET to In review with four records already there, Owner MIXED, Tags
   an empty line. */
const DEFAULT_FIELDS: readonly BulkField[] = [
  {
    id: "status",
    label: "Status",
    kind: "select",
    options: STATUS_OPTIONS,
    value: "In review",
    alreadyCount: 4,
  },
  { id: "owner", label: "Owner", kind: "select", options: OWNER_OPTIONS, mixed: true },
  /* `%s` is the selection count. THE COUNT IS IN EVERY SENTENCE — including
     the line inside an empty field, which is where the artifact puts it. */
  { id: "tags", label: "Tags", kind: "text", placeholder: "Add a tag to all %s" },
];

/* ----------------------------------------------------------------------------
   Is there room for the side panel, or is this the bottom sheet? The same
   device `quick-view.tsx` and `export.tsx` use, so the three overlays cannot
   part company at three different widths. The server answer is the WIDE one.
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

export interface BulkEditScreenProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  /* ---- The shell's rail -------------------------------------------------
     The screen this composition renders behind its overlay is one of the two
     the kit has, and both of them carry the same rail: `SHELL.md`, "the shell
     above is identical on both. The rail never changes between them." The
     rail's CONTENTS are the application's navigation, so they arrive as a
     node; its placement, its measure and the one law about it — dropped
     entirely below the narrow breakpoint, because the kit draws no hamburger
     anywhere — all belong to `ScreenShell` and are not this file's to
     decide. */

  /** The navigation rail's contents. Placed by the shell, dropped narrow. */
  rail?: React.ReactNode;
  /** Accessible name for the rail. */
  railLabel?: string;
  /** Per-locale words. */
  labels?: Partial<BulkEditLabels>;
  /** The rows on this page. */
  records?: readonly BulkRecord[];
  /** The tabs over them. */
  tabs?: CollectionFrameTab[];
  /** Which tab is open. */
  tab?: string;
  /** Tab changed. */
  onTabChange?: (value: string) => void;

  /** Which rows are ticked. Controlled. */
  selectedIds?: readonly string[];
  /** Uncontrolled starting selection. */
  defaultSelectedIds?: readonly string[];
  /** The selection changed. */
  onSelectionChange?: (ids: string[]) => void;
  /** How "6 records selected" reads. */
  formatSelected?: (count: number) => string;
  /** How the bar's short label reads on narrow. */
  formatSelectedNarrow?: (count: number) => string;

  /** The panel is open. */
  open?: boolean;
  /** The panel opened or closed. */
  onOpenChange?: (open: boolean) => void;
  /** How the panel's title reads. */
  formatPanelTitle?: (count: number) => string;
  /** How the commit control reads. The count is never dropped. */
  formatCommit?: (count: number) => string;
  /**
   * The per-field note. Given the selection size, how many already hold the
   * value, and the value's own words.
   */
  formatChanges?: (count: number, already: number | undefined, value: string) => string;

  /** The fields in the panel. */
  fields?: readonly BulkField[];
  /** A field was set. */
  onFieldChange?: (id: string, value: string) => void;

  /** The bar's Edit — opens the panel. */
  onEdit?: () => void;
  /** The bar's Assign. */
  onAssign?: () => void;
  /** The bar's Export. */
  onExport?: () => void;
  /** The bar's Delete — opens 27.4, which is where the poppy lives. */
  onDelete?: () => void;
  /** The bar's Clear. */
  onClear?: () => void;
  /** Write the change. THE ONE MANGO. */
  onCommit?: () => void;
}

/**
 * A collection with a live selection, and the panel that edits it.
 *
 * TEN STATES
 *  1. default        — the frame, the bulk bar in the toolbar's place, the
 *                      ticked rows, and the panel beside them.
 *  2. hover          — the row wash is `DataTable`'s; the controls' is
 *                      `Button`'s. Nothing here draws one.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — the controls' own.
 *  5. disabled       — does not apply. A record the reader may not change is
 *                      not selectable in the first place
 *                      (`DataTable isRowSelectable`), which is ch24.6's hide
 *                      rather than dim, one level down.
 *  6. loading        — does not apply. The rows are already on screen; that
 *                      is how they got ticked. A change IN FLIGHT is the
 *                      commit control's own spinner, which `Button` draws.
 *  7. empty          — NOT A STATE OF THIS SCREEN. With nothing ticked there
 *                      is no bulk bar and no panel: the collection is 27.1
 *                      again, which is what `selectedIds` being empty draws.
 *  8. error          — does not apply here. A change that failed is reported
 *                      per record, because the promise this screen makes is
 *                      one log line per record.
 *  9. selected       — THE SUBJECT OF THE WHOLE SCREEN. `DataTable` draws the
 *                      ticks and the selected fills, and they stay drawn
 *                      beside the panel: "nothing collapses to '6 items'".
 * 10. read-only      — a reader with no bulk right is passed no handlers, so
 *                      the bar's controls are absent rather than dimmed.
 *
 * NARROW (380px), STATED — the artifact's own second render
 *  · THE BULK BAR WRAPS. It stays in the toolbar's place and does not become
 *    a second row or a floating bar; it is a wrapping flex row, so the count
 *    and Clear take the first line and the actions fall to the next.
 *  · EXPORT LEAVES THE BAR. The artifact's narrow bar carries Edit, Assign
 *    and Delete. Export of a selection is available from the page's own
 *    export (27.31), so nothing is lost.
 *  · THE EYEBROW SAYS THE SELECTION. "Group · 6 selected" replaces "Group ·
 *    24 open" while something is ticked, because at this width the bar's own
 *    count can be below the fold.
 *  · THE PANEL IS A BOTTOM SHEET, not the right-hand drawer. The list stays
 *    above it, still ticked.
 *  · THE PROSE SHORTENS. "Only the fields you touch are changed." — the
 *    artifact's own narrow wording.
 *  · EVERY COUNT STAYS. Title, each set field's note and the commit control
 *    all keep their number at 380 exactly as at 1440. That is the rule this
 *    composition exists for.
 *
 * RTL — LTR only by client ruling.
 */
function BulkEditScreen({
  className,
  rail,
  railLabel,
  labels,
  records = DEFAULT_RECORDS,
  tabs = DEFAULT_TABS,
  tab,
  onTabChange,
  selectedIds,
  defaultSelectedIds,
  onSelectionChange,
  formatSelected = (count) => `${count} records selected`,
  formatSelectedNarrow = (count) => `${count} selected`,
  open = true,
  onOpenChange,
  formatPanelTitle = (count) => `Edit ${count} records`,
  formatCommit = (count) => `Change ${count}`,
  formatChanges = (count, already, value) =>
    already === undefined
      ? `Changes ${count} records`
      : `Changes ${count} records · ${already} are already ${value}`,
  fields = DEFAULT_FIELDS,
  onFieldChange,
  onEdit,
  onAssign,
  onExport,
  onDelete,
  onClear,
  onCommit,
  ...props
}: BulkEditScreenProps) {
  const words: BulkEditLabels = { ...DEFAULT_LABELS, ...labels };
  const hasRoom = useHasRoom();

  const [uncontrolled, setUncontrolled] = React.useState<readonly string[]>(
    () => defaultSelectedIds ?? records.slice(0, 6).map((record) => record.id),
  );
  const selection = selectedIds ?? uncontrolled;

  const setSelection = (ids: string[]) => {
    if (selectedIds === undefined) setUncontrolled(ids);
    onSelectionChange?.(ids);
  };

  const count = selection.length;
  const live = count > 0;

  const columns: Array<DataTableColumn<BulkRecord>> = [
    {
      key: "record",
      header: words.columnRecord,
      cell: (row) => (
        <span className="flex min-w-0 items-baseline gap-2">
          <Text as="span" size="sm" tone="tertiary" numeric>
            {row.number}
          </Text>
          <Text as="span" size="sm" tone="tertiary" aria-hidden="true">
            ·
          </Text>
          <Text as="span" size="sm" className="min-w-0 truncate">
            {row.title}
          </Text>
        </span>
      ),
    },
    {
      key: "status",
      header: words.columnStatus,
      cell: (row) => (
        <Text as="span" size="sm" tone="secondary">
          {row.status}
        </Text>
      ),
    },
    {
      key: "owner",
      header: words.columnOwner,
      cell: (row) => (
        <Text as="span" size="sm" tone="secondary">
          {row.owner}
        </Text>
      ),
    },
  ];

  /* THE BULK BAR. It goes into the frame's own toolbar slot; nothing else is
     passed to the toolbar while it is live, so it REPLACES rather than joins.
     A wrapping row, which is the narrow render's stated behaviour. */
  const bar = !live ? null : (
    <div
      data-slot="bulk-bar"
      role="group"
      aria-label={words.barLabel}
      className="flex min-w-0 flex-1 flex-wrap items-center gap-x-[var(--space-4)] gap-y-3"
    >
      {/* THE COUNT LEADS THE BAR AND THE ACTIONS FOLLOW IT. p36 draws
          "6 records selected", then Edit, Assign, Export and Delete, all at
          the reading start, with `Clear` pushed alone to the far trailing
          end. The count used to carry `me-auto`, which threw every control
          including Clear to the end and left the sentence stranded. */}
      <Text as="span" size="sm" numeric>
        <span className="hidden sm:inline">{formatSelected(count)}</span>
        <span className="sm:hidden">{formatSelectedNarrow(count)}</span>
      </Text>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        {/* Each bar word leads with its glyph — p36/p37 draw ✎ Edit, the
            list mark on Assign and the download mark on Export; the slots
            waited on the icon pack, which is on main now. */}
        {onEdit === undefined ? null : (
          <Button variant="secondary" size="sm" onClick={onEdit}>
            <EditPencil aria-hidden="true" />
            {words.edit}
          </Button>
        )}
        {onAssign === undefined ? null : (
          <Button variant="secondary" size="sm" onClick={onAssign}>
            <List aria-hidden="true" />
            {words.assign}
          </Button>
        )}
        {/* The artifact's narrow bar drops Export and keeps the other four. */}
        {onExport === undefined ? null : (
          <Button variant="secondary" size="sm" className="hidden sm:inline-flex" onClick={onExport}>
            <Download aria-hidden="true" />
            {words.exportLabel}
          </Button>
        )}
        {/* SOLID POPPY, and it is the drawing on both renders. p36 and p37
            both draw `Delete` in the destructive fill inside the bulk bar —
            it was paper on the reading that "the irreversible press is
            27.4's, in the dialog this control opens". The dialog is still
            where the press happens; the bar still has to say which of its
            five words is the dangerous one, and 27.4's own rule card gives
            the fill: "Solid #E94A32 with charcoal type in light". Override 19
            forbids a filled red button in a LIST — this is a toolbar. */}
        {onDelete === undefined ? null : (
          <Button variant="destructive" size="sm" onClick={onDelete}>
            {words.deleteLabel}
          </Button>
        )}
        {/* Alone at the far trailing end, as drawn. */}
        {onClear === undefined ? null : (
          <Button variant="text" size="sm" className="ms-auto" onClick={onClear}>
            {words.clear}
          </Button>
        )}
      </div>
    </div>
  );

  const panelFields = fields.map((field) => {
    const set = field.value !== undefined && field.value !== "";
    const chosen =
      field.options?.find((option) => option.value === field.value)?.label ?? field.value ?? "";

    return (
      <Field
        key={field.id}
        label={field.label}
        /* IT SAYS HOW MANY WILL ACTUALLY CHANGE — but only once something is
           actually set. An untouched field has nothing to describe. */
        help={set ? formatChanges(count, field.alreadyCount, chosen) : undefined}
      >
        {field.kind === "text" ? (
          <Input
            value={field.value ?? ""}
            placeholder={field.placeholder?.replace("%s", String(count))}
            onChange={
              onFieldChange === undefined
                ? undefined
                : (event) => {
                    onFieldChange(field.id, event.currentTarget.value);
                  }
            }
          />
        ) : (
          <Select
            value={field.value}
            onValueChange={
              onFieldChange === undefined
                ? undefined
                : (value) => {
                    onFieldChange(field.id, value);
                  }
            }
          >
            <SelectTrigger>
              {/* MIXED IS NAMED, NOT BLANKED. The placeholder is already
                  tertiary ink by ruling 27, so no colour is chosen here. */}
              <SelectValue placeholder={field.mixed ? words.mixed : undefined} />
            </SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
    );
  });

  return (
    <div
      data-slot="bulk-edit-screen"
      className={cn("flex w-full min-w-0 flex-col", className)}
      {...props}
    >
      {/* THE COLLECTION BEHIND THE OVERLAY, ON THE MODEL. `MainScreen` draws
          the four levels and puts the eyebrow and the title in the header
          band; the tabs and the toolbar are the panel's own first rows,
          one level down. See the header block on why this is not a bare
          `CollectionFrame`. */}
      <MainScreen
        rail={rail}
        railLabel={railLabel}
        eyebrow={
          <React.Fragment>
            <span className={live ? "hidden sm:inline" : undefined}>{words.eyebrow}</span>
            {live ? <span className="sm:hidden">{words.eyebrowSelected}</span> : null}
          </React.Fragment>
        }
        title={words.heading}
        tabs={tabs}
        tab={tab}
        defaultTab={tabs[0]?.value}
        onTabChange={onTabChange}
        tabsLabel={words.tabsLabel}
        /* THE BAR REPLACES THE TOOLBAR IN PLACE: it takes the leading slot and
           nothing else is passed, so the row it sits in is the toolbar's own
           row and no second band appears. `MainScreen` forwards this to the
           same `CollectionFrame` slot it always went to, so the re-base does
           not move it — `SHELL.md`: "Selection REPLACES the toolbar in place …
           Nothing floats up from the bottom of the viewport."

           There is no `onCreate` either: the header's mango `+` would be a
           second mango beside the panel's "Change 6", and a screen with a live
           selection is not a screen anybody is adding a record from. */
        search={bar}
        body={
          <DataTable<BulkRecord>
            columns={columns}
            rows={[...records]}
            getRowId={(row) => row.id}
            selectable
            selectedIds={selection}
            onSelectionChange={setSelection}
            selectAllLabel={words.selectAllLabel}
            getRowSelectLabel={(row) => words.rowSelectLabel.replace("%s", row.title)}
            label={words.bodyLabel}
          />
        }
      />

      {/* THE EDIT PANEL. Right-hand drawer where there is room, bottom sheet
          at 380 — the artifact draws both. The list keeps its ticks behind
          it either way. */}
      <Sheet open={open && live} onOpenChange={onOpenChange}>
        <SheetContent
          side={hasRoom ? "right" : "bottom"}
          data-slot="bulk-edit-panel"
          data-width={hasRoom ? "wide" : "narrow"}
          closeLabel={words.closeLabel}
          className="flex flex-col"
        >
          <SheetHeader>
            {/* THE COUNT IS IN EVERY SENTENCE — 1 of 4. */}
            <SheetTitle>{formatPanelTitle(count)}</SheetTitle>
            <SheetDescription>
              <span className="hidden sm:inline">{words.panelBody}</span>
              <span className="sm:hidden">{words.panelBodyNarrow}</span>
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <Form
              columns={1}
              hideActions
              onSubmit={(event) => {
                event.preventDefault();
                onCommit?.();
              }}
            >
              {panelFields}
            </Form>
          </div>

          <FormActions
            meta={
              /* ONE LOG LINE PER RECORD — said before the press. */
              <span>{words.logLine}</span>
            }
            hairline
          >
            <Button variant="cancel" onClick={() => onOpenChange?.(false)}>
              {words.cancel}
            </Button>
            {/* THE ONE MANGO, AND IT CARRIES THE COUNT — 4 of 4. */}
            <Button onClick={onCommit}>
              {/* p36 draws the ✓ on the commit at both widths. */}
              <Check aria-hidden="true" />
              {formatCommit(count)}
            </Button>
          </FormActions>
        </SheetContent>
      </Sheet>
    </div>
  );
}

BulkEditScreen.displayName = "BulkEditScreen";

export { BulkEditScreen };
