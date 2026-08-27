"use client";

/* ============================================================================
   ArchiveScreen — composition 27.5.

   THE ONE SENTENCE
   "A tab on the collection, never a screen in the rail."

   DESIGN SOURCE — "Kwapso UI Kit.dc.html" chapter 27.5, verbatim:

     WHAT IT IS
       "Archive is the softer route the delete dialog points at. It is the
        last tab of every collection — same toolbar, same rows, one extra band
        saying where you are and one action per row."

     WHY IT IS NOT BURIED
       ch27.4, on the delete dialog: "Every delete dialog names archive as the
       alternative, in prose. That is why 27.5 exists and why archive is never
       buried in a menu."

     NO MANGO ON THIS TAB
       "There is nothing to create in an archive, so the header's primary
        drops to Export. Restore is a text action at the end of each row — one
        word, no button."

     SAY WHAT ARCHIVING MEANS
       "The band states the consequences in one line: history kept, still
        searchable, not counted in the figures. Users archive far more readily
        when the cost is written down."

     ARCHIVED ROWS GO QUIET, NOT GREY-BOXED
       "Titles drop to secondary ink and metadata to tertiary. No
        strikethrough, no opacity, no disabled fill — the record is intact,
        just out of the way."

     COLUMNS CHANGE, STRUCTURE DOESN'T
       "Status and Updated are replaced by Archived by and Archived — the only
        tab allowed to swap columns, because the stage of an archived record
        is not news."

     DOORS DIFFER
       "The portal calls it Done rather than Archived, has no Restore, and
        shows the closing note instead of who archived it."

   WHAT THE ARTIFACT ACTUALLY DRAWS, TRANSCRIBED
   Eyebrow "Group · 118 archived" over the heading "Collection" — that order,
   the same one ch27.1 draws ("Group · 24 open" over "Collection"), so the
   number rides in the micro line and NOT in a count chip. One header action,
   Export, in the paper fill. Four folder tabs — All · Mine · Waiting ·
   Archived — with Archived last, active, and the ONLY one carrying a count
   (118); the other three are drawn with no number at all. Then the panel,
   whose first child is the band, then the toolbar (a field placeheld "Search
   archived" and one facet chip reading "Archived · Any time"), then a
   three-column table plus a headerless action column, at the artifact's
   `min-width: 640px`.

   IT IS A MAIN SCREEN, AND SINCE THE SHELL SWEEP IT SAYS SO IN CODE
   `SHELL.md`, the merged law: "a main screen is in the navbar; a detail
   screen has breadcrumbs." 27.5's own sentence is "a tab on the collection,
   never a screen in the rail" — but the thing this file draws is the
   COLLECTION with its last tab open, and a collection is in the navbar. So
   this is `MainScreen`, and the tab that is open is the archive.

   What that fixed, all of it off `SHELL.md`'s own list of errors:

     · THE OFF-BEIGE BODY PANE. This file used to return a bare `div` holding
       `CollectionFrame`, so the page, the screen card, the rail and the body
       pane were all missing and a soft-paper panel stood on whatever the
       document happened to be. Four levels now, drawn once, in
       `screen-shell.tsx`.
     · EXPORT IS IN THE HEADER BAND, NOT THE TOOLBAR. `CollectionFrame`'s
       `actions` slot is the TOOLBAR's, pinned inside the panel; the artifact
       draws Export beside the heading, and 27.5's own sentence is "the
       HEADER's primary drops to Export". It is `MainScreen`'s `actions` now,
       which is the header band's paper pills.
     · STILL NO MANGO, AND NOW BY CONSTRUCTION. No `onCreate` is passed, so
       `MainScreen` draws no control at all — not a disabled one, which
       ch24.6 forbids. `SHELL.md` names this screen in the same breath:
       "on Archive, Activity log and Link sent there is no mango at all."
     · NO FOOTER, AND IT CANNOT GROW ONE. `MainScreen` has no footer slot.

   THE LAW THIS FILE OBEYS
   · NO MANGO. Not in the header, not in a row, not in the band. Ruling Q2
     (2026-08-23) counts ACTIONS, not objects, and this screen's two actions
     are Export (paper) and Restore (text). The count is zero and that is the
     chapter's own instruction, not a shortfall. The record cell became
     pressable on 2026-08-24 and the count is still zero: `DataTable` draws
     that target in the ROW'S OWN INK with no underline at rest — a mango name
     on every row would spend override 17's one action many times over, which
     is the argument `data-table.tsx` already makes for itself.
   · THE BAND IS PLACED, NOT DRAWN TWICE. It goes in the `band` slot —
     `MainScreen` forwards it to `CollectionFrame`, which puts it inside the
     panel above the toolbar, which is where the artifact puts it and the only
     place ruling J2 leaves for it. `MainScreen`'s own note calls this the one
     band the kit draws: "Only Archive draws one." See ARCH-1 in
     GAPS-ARCHIVE.md.
   · THE ROWS GO QUIET IN INK ONLY. Titles are `Text tone="secondary"`, the
     reference and both metadata columns are `tertiary`. No strikethrough, no
     opacity, no `disabled` row — `isRowDisabled` is deliberately NOT passed,
     because the kit draws that as a fill and an ink and the chapter forbids
     both.
   · NO COUNT CHIP BESIDE THE HEADING. The artifact's header holds the eyebrow,
     the heading and Export, and nothing else. The number rides in the micro
     line, and `MainScreen`'s header band has no count of its own to pass one
     to — which is `SHELL.md`'s eyebrow, `GROUP · 118 ARCHIVED`, exactly.
   · EVERY STRING IS A PROP with a default.
   · No CSS `border`, no px, no literal colour, no gradient, no illustration,
     no `text-align`. Registers are left-aligned by override 27.21.
   · Focus is one global rule. Dark is a token flip.

   AN ARCHIVE ROW OPENS THE RECORD — CLIENT RULING, 2026-08-24, "6 YES"
   The earlier audit read this tab correctly against the artifact and reported
   what it found: 27.5 draws ONE action per row and that action is Restore, so
   the archive reached no record. It was flagged as correct-per-artifact and
   worth confirming, and the client confirmed the opposite. Asked *"should
   clicking an archive row open the record?"*, the answer was verbatim
   **"6 yes"**. Register row 70.

   IT IS THE SAME MECHANISM AS EVERYWHERE ELSE, NOT A SECOND ONE. Chapter 26
   §3: "A row's name is always the first, widest column and always clickable
   to open the detail page or a quick-view." `DataTable` already implements
   exactly that as `onRowSelect` — the press target is the NAME CELL, the cell
   becomes a real `<button>`, and nothing sets `role`, `tabIndex` or a key
   handler because a button does not need them. This file passes the handler
   through and adds nothing: no `<tr onClick>`, no second pattern.

   AND IT IS WHY RESTORE AND OPEN DO NOT FIGHT. The open target is ONE CELL
   WIDE, so it never covers the Restore at the end of the row. There is no
   `stopPropagation`, no "the row opens except on the action" exception and no
   per-screen special case — the collision is removed rather than adjudicated,
   which is `data-table.tsx`'s own argument for confining the target.

   THE ROW STAYS QUIET. The record cell keeps `Text tone="secondary"` and the
   reference stays `tertiary`; `DataTable`'s open button inherits its ink from
   the cell and takes no mango, so 27.5's "titles drop to secondary ink" and
   "no strikethrough, no opacity, no disabled fill" both survive being
   pressable. A reader who may not open a record is passed no `onRecordSelect`
   and the cell draws as plain text — ch24.6's hide-rather-than-dim, the same
   rule Restore already follows.

   TWO THINGS THIS FILE DELIBERATELY DOES NOT BUILD, BOTH LOGGED
   · THE ARCHIVE DIALOG. 27.5's second half draws it — "Archive 4182 — Record
     title goes here?", a required reason field, Keep beside a MANGO Archive.
     It is a dialog, not this tab, and it is raised from the row menu of every
     collection rather than from here. ARCH-2 in GAPS-ARCHIVE.md.
   · THE PORTAL DOOR. Two of its three stated differences are buildable ("Done"
     for "Archived", no Restore); the third is not — the artifact never gives
     the column heading that replaces "Archived by" when the cell holds a
     closing note. A door built on two thirds of a sentence would put an
     invented word on screen, so the door is logged instead. ARCH-3.

   RENDERING CONTEXT
   `"use client"`. The field, the chips, the tabs and every Restore create
   handlers during this module's own render.
   ========================================================================= */

import * as React from "react";

import { Button } from "../../components/button/button";
import { Text } from "../../components/typography/typography";
import { SearchInput } from "../../components/search-input/search-input";
import {
  FilterBar,
  type FilterChip,
} from "../../components/filter-bar/filter-bar";
import type { CollectionFrameTab } from "../../components/collection-frame/collection-frame";
import {
  DataTable,
  type DataTableColumn,
} from "../../components/data-table/data-table";
import { MainScreen } from "../templates";

/** One tab over the collection. Archived is last and it is the open one. */
export interface ArchiveTab {
  value: string;
  label: string;
  /**
   * A count after the label. The artifact numbers ARCHIVED ONLY — All, Mine
   * and Waiting are drawn bare on this tab, unlike ch27.1 where all four
   * carry a figure. Undefined draws no number.
   */
  count?: number;
}

/** One archived record. */
export interface ArchiveRow {
  /** Stable identity. Never the index. */
  id: string;
  /** The record's own number, printed before the title in tertiary. */
  reference: string;
  /** What the record is called. */
  title: string;
  /** Who put it here. */
  archivedBy: string;
  /** When. */
  archived: string;
}

/** Every user-facing string on this screen. */
export interface ArchiveLabels {
  /** The micro line. The artifact carries the count here, not in a chip. */
  eyebrow: string;
  heading: string;
  /** The header's one action. Paper — the primary "drops to Export". */
  exportLabel: string;
  tabsLabel: string;
  /** The band's first line: where you are. */
  bandTitle: string;
  /** The band's second line: what it costs. */
  bandBody: string;
  searchLabel: string;
  searchPlaceholder: string;
  filtersLabel: string;
  /** Column one. */
  recordColumn: string;
  /** Column two — the one that replaces Status. */
  archivedByColumn: string;
  /** Column three — the one that replaces Updated. */
  archivedColumn: string;
  /**
   * The action column has no visible heading in the artifact, so this is the
   * name a screen reader hears for it. Nothing draws it.
   */
  rowActionColumn: string;
  /** The one action per row. One word. */
  restore: string;
  /**
   * The accessible name of the press target on the record cell, with the
   * record's own title appended. The visible cell is a reference number and a
   * title in two inks, and a button whose only name is assembled from that
   * reads badly, so the name is given rather than inferred. Client ruling
   * "6 yes", 2026-08-24 — see the header.
   */
  open: string;
}

const DEFAULT_LABELS: ArchiveLabels = {
  eyebrow: "Group · 118 archived",
  heading: "Collection",
  exportLabel: "Export",
  tabsLabel: "Collection subsets",
  bandTitle: "Showing archived records",
  bandBody:
    "They keep their history and stay searchable. Nothing here is counted in the figures above.",
  searchLabel: "Search archived",
  searchPlaceholder: "Search archived",
  filtersLabel: "Active filters",
  recordColumn: "Record",
  archivedByColumn: "Archived by",
  archivedColumn: "Archived",
  rowActionColumn: "Row action",
  restore: "Restore",
  open: "Open",
};

/** All · Mine · Waiting · Archived. Archived is LAST, and it is the open one. */
const DEFAULT_TABS: readonly ArchiveTab[] = [
  { value: "all", label: "All" },
  { value: "mine", label: "Mine" },
  { value: "waiting", label: "Waiting" },
  { value: "archived", label: "Archived", count: 118 },
];

/** The one facet the artifact draws: field · value, the kit's chip sentence. */
const DEFAULT_FILTERS: readonly FilterChip[] = [
  { id: "archived", label: "Archived · Any time" },
];

/* The artifact's own three rows. Obviously-fictional content. */
const DEFAULT_ROWS: readonly ArchiveRow[] = [
  {
    id: "3907",
    reference: "3907",
    title: "Record title goes here",
    archivedBy: "Member name",
    archived: "02 Apr 2026",
  },
  {
    id: "3881",
    reference: "3881",
    title: "Second record title",
    archivedBy: "Member name",
    archived: "28 Mar 2026",
  },
  {
    id: "3874",
    reference: "3874",
    title: "Third record title",
    archivedBy: "Member name",
    archived: "21 Mar 2026",
  },
];

export interface ArchiveScreenProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  /* ---- The shell's rail -------------------------------------------------
     The screen this file renders is one of the two the kit has, and both of
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
  labels?: Partial<ArchiveLabels>;
  /** The tab strip. Archived last. */
  tabs?: readonly ArchiveTab[];
  /** Which tab is open. Defaults to the LAST one, which is the archive. */
  tab?: string;
  /** Tab changed. The tab belongs in the URL. */
  onTabChange?: (value: string) => void;
  /** The archived records. */
  rows?: readonly ArchiveRow[];
  /** Whatever was typed. Never silently cleared. */
  searchValue?: string;
  /** Term changed. */
  onSearchChange?: (value: string) => void;
  /** The field's own ×. */
  onSearchClear?: () => void;
  /** The facets. */
  filters?: readonly FilterChip[];
  /** Drop one facet. */
  onFilterRemove?: (id: string) => void;
  /** Put one record back. The one action per row; a reader who may not
      restore is passed no handler and the column draws nothing. */
  onRestore?: (row: ArchiveRow) => void;
  /**
   * OPEN THE RECORD BEHIND A ROW. Client ruling "6 yes", 2026-08-24: clicking
   * an archive row opens the record. The press target is the RECORD CELL, not
   * the `<tr>` — chapter 26 §3, and `DataTable`'s `onRowSelect` is the one
   * implementation of it in the kit. Omit it — never pass a no-op — for a
   * reader who may not reach the record; the cell then draws as plain text
   * and nothing else on the row changes. It does not fight `onRestore`: the
   * target is one cell wide and never covers the action column.
   */
  onRecordSelect?: (row: ArchiveRow) => void;
  /** The header's one action. */
  onExport?: () => void;
}

/**
 * The last tab of a collection.
 *
 * TEN STATES
 *  1. default        — THIS IS the state. The archive is not a register: it
 *                      has rows, and they are the point.
 *  2. hover          — the row wash, owned by `DataTable`; Restore and Export
 *                      carry their own.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by `Button`, and by `DataTable`'s record-cell
 *                      button since the row started opening the record
 *                      (client "6 yes"). The `<tr>` itself is still not a
 *                      target — the press is one cell wide, which is chapter
 *                      26 §3 and is why it does not reach Restore.
 *  5. disabled       — does not apply, and the chapter says so twice over:
 *                      "no strikethrough, no opacity, no disabled fill — the
 *                      record is intact". A reader who may not restore is
 *                      passed no `onRestore`, which is ch24.6's rule, and the
 *                      column then draws nothing rather than a dead word.
 *  6. loading        — does not apply here; a tab whose rows are in flight is
 *                      27.6, drawn by `CollectionFrame`'s own `loading`.
 *  7. empty          — an archive with nothing in it is 27.21's register with
 *                      no create, which is `EmptyCollectionScreen`. This file
 *                      never draws "nothing yet": it exists to show what was
 *                      put away.
 *  8. error          — does not apply. A failed fetch is ruling 06's block
 *                      failure, drawn by the frame.
 *  9. selected       — the open tab, which is Archived. Rows are not
 *                      selectable: bulk archive raises the dialog from the
 *                      collection's own tabs, not from inside the archive.
 * 10. read-only      — an archive with no `onRestore` and no `onExport`. It
 *                      still reads at full strength; nothing is dimmed.
 *
 * THREE BREAKPOINTS
 *  · mobile (base, and 380 is the tested width) — the RAIL IS GONE and so is
 *    Export. `SHELL.md`: narrow "drops controls, never counts — Export, the
 *    mango `+`, the third tab and the charcoal footer all go; every figure
 *    stays", and `MainScreen`'s `narrowActions={false}` default is that
 *    sentence. The 118 on the Archived tab and the eyebrow's own number both
 *    stay, because they are counts. The tab strip
 *    scrolls on its own axis and keeps all four tabs reachable; none is
 *    dropped, because the one that would be dropped is the open one. The band
 *    wraps into two lines, its title over its sentence, at the panel's full
 *    measure. The toolbar condenses rather than being dropped (ch27.1): the
 *    field takes its own line and the facet chip sits under it. The table
 *    holds the artifact's `min-width: 640px` and scrolls inside its own
 *    region, so Archived by is reached by pushing the row sideways rather
 *    than by being thrown away.
 *  · tablet (`sm:`, 40rem) — the toolbar becomes one line and the table stops
 *    needing its scroller.
 *  · desktop (`lg:`, 64rem) — unchanged in structure; the frame and panel
 *    insets step to 32 with `CollectionFrame`.
 *
 * RTL — LTR only by client ruling. Every inset here is logical.
 */
function ArchiveScreen({
  className,
  rail,
  railLabel,
  labels,
  tabs = DEFAULT_TABS,
  tab,
  onTabChange,
  rows = DEFAULT_ROWS,
  searchValue,
  onSearchChange,
  onSearchClear,
  filters = DEFAULT_FILTERS,
  onFilterRemove,
  onRestore,
  onRecordSelect,
  onExport,
  ...props
}: ArchiveScreenProps) {
  const words: ArchiveLabels = { ...DEFAULT_LABELS, ...labels };

  const frameTabs: CollectionFrameTab[] = tabs.map((entry) => ({
    value: entry.value,
    label: entry.label,
    count: entry.count,
  }));

  /* The archive is the LAST tab, and it is the one this screen is. Reading it
     off the end of the array rather than naming "archived" keeps the default
     right for a caller who renames or reorders its own subsets. */
  const openTab = tabs[tabs.length - 1]?.value;

  const columns: Array<DataTableColumn<ArchiveRow>> = [
    {
      key: "record",
      header: words.recordColumn,
      cell: (row) => (
        /* "Titles drop to secondary ink and metadata to tertiary." The number
           is metadata, so it is the quieter of the two even inside one cell —
           exactly as the artifact draws it. */
        <Text as="span" size="sm" tone="secondary">
          <Text as="span" size="sm" tone="tertiary" numeric>
            {row.reference}
          </Text>{" "}
          · {row.title}
        </Text>
      ),
    },
    {
      key: "archivedBy",
      header: words.archivedByColumn,
      /* 130px in the artifact's own grid, on the kit's rem step. */
      width: "8rem",
      cell: (row) => (
        <Text as="span" size="sm" tone="tertiary">
          {row.archivedBy}
        </Text>
      ),
    },
    {
      key: "archived",
      header: words.archivedColumn,
      /* 118px. */
      width: "7.5rem",
      cell: (row) => (
        <Text as="span" size="sm" tone="tertiary" numeric>
          {row.archived}
        </Text>
      ),
    },
    {
      key: "restore",
      /* Headerless in the artifact — the fourth `<span>` is empty — so the
         column is named for a screen reader and drawn as nothing. */
      header: null,
      headerLabel: words.rowActionColumn,
      align: "end",
      /* 76px. */
      width: "5rem",
      cell: (row) =>
        onRestore === undefined ? null : (
          /* "ONE WORD, NO BUTTON", and `link` is the only variant that is
             literally that: ch26 · 01's `.kw-link`, "occupies no box"
             (`h-auto p-0`), no underline at rest, ink inherited from the row.
             `text` is the variant whose NAME matches the chapter's phrase
             "text action" and it is the wrong drawing — the kit skins it as a
             32px box carrying a permanent underline, and 27.5 draws Restore
             as bare medium-weight type at the end of the row. The phrase and
             the drawing disagree; the drawing wins, and ARCH-6 in
             GAPS-ARCHIVE.md records that they do. */
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              onRestore(row);
            }}
          >
            {words.restore}
          </Button>
        ),
    },
  ];

  return (
    <MainScreen
      data-slot="archive-screen"
      className={className}
      rail={rail}
      railLabel={railLabel}
      /* The number rides in the micro line, which is `SHELL.md`'s eyebrow —
         "GROUP · 24 RECORDS", the scope then the count. No chip beside the
         heading, as ch27.1 and ch27.5 both draw it. */
      eyebrow={words.eyebrow}
      title={words.heading}
      /* NO `onCreate`. `SHELL.md`: "on Archive, Activity log and Link sent
         there is no mango at all." With no handler `MainScreen` draws no
         control, which is ch24.6's hide-rather-than-dim. */
      tabs={frameTabs}
      tab={tab}
      defaultTab={openTab}
      onTabChange={onTabChange}
      tabsLabel={words.tabsLabel}
      /* THE ONE EXTRA BAND. Inside the panel, above the toolbar. A row that
         wraps: title, then the sentence that says what archiving costs. */
      band={
        <div
          data-slot="archive-band"
          className="flex min-w-0 flex-wrap items-center gap-[var(--space-3h)]"
        >
          <Text as="span" size="sm" className="font-[var(--font-weight-medium)]">
            {words.bandTitle}
          </Text>
          <Text as="span" size="caption" tone="secondary">
            {words.bandBody}
          </Text>
        </div>
      }
      search={
        <SearchInput
          value={searchValue}
          label={words.searchLabel}
          placeholder={words.searchPlaceholder}
          onChange={
            onSearchChange === undefined
              ? undefined
              : (event) => {
                  onSearchChange(event.currentTarget.value);
                }
          }
          onClear={onSearchClear}
        />
      }
      filters={
        <FilterBar
          filters={filters as FilterChip[]}
          onRemove={onFilterRemove}
          label={words.filtersLabel}
        />
      }
      actions={
        /* THE HEADER BAND'S ONE ACTION, AND IT IS PAPER. "There is nothing to
           create in an archive, so the HEADER's primary drops to Export."
           This is `MainScreen`'s `actions`, which is the header band beside
           the heading — where the artifact draws it — and not
           `CollectionFrame`'s `actions`, which is the toolbar inside the
           panel and is where this used to sit. No mango anywhere. */
        <Button variant="secondary" onClick={onExport}>
          {words.exportLabel}
        </Button>
      }
      body={
        <DataTable<ArchiveRow>
          columns={columns}
          rows={rows as ArchiveRow[]}
          getRowId={(row) => row.id}
          label={words.heading}
          /* THE ROW OPENS THE RECORD — client "6 yes", 2026-08-24. Handed to
             `DataTable` and nothing more: it draws the RECORD CELL as a real
             `<button>`, which is chapter 26 §3's rule and the one way this
             kit opens a record from a row. `recordColumnKey` is not passed
             because the record IS the first column here, which is the
             default. No handler means no button, so an archive a reader may
             only browse is unchanged. */
          onRowSelect={
            onRecordSelect === undefined
              ? undefined
              : (row) => {
                  onRecordSelect(row);
                }
          }
          getRowOpenLabel={(row) => `${words.open} ${row.title}`}
          /* The artifact's own `min-width: 640px`: below it the row scrolls
             sideways instead of crushing four columns into a phone. */
          minWidth="40rem"
        />
      }
      {...props}
    />
  );
}

ArchiveScreen.displayName = "ArchiveScreen";

export { ArchiveScreen };
