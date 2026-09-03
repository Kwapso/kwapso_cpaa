"use client";

/* ============================================================================
   HomeRoute — `/home`, the system door's ONE landing screen. Figures, then
   the work.

   THERE USED TO BE TWO OF THESE
   Two agents independently built the same screen: `dashboard.tsx` at `/` and
   this file at `/home`. Client ruling G, 2026-08-22, verbatim: "landing for
   the system is always home." This file survived, `dashboard.tsx` is gone,
   and `/` is a redirect declared as `SYSTEM_ROOT_REDIRECT` in the barrel.
   What `dashboard.tsx` had and this file did not was merged in first — the
   fifth analytical tile, `onFigureSelect`, and `figuresVisible`; each is
   marked "from dashboard.tsx (ruling G)" where it lands. See GAPS-RULINGS.md.

   ASSEMBLED FROM TWO SHAPES, NOT DESIGNED
     · StatStrip          — the headline numbers (shape 3)
     · CollectionScreen   — heading, tabs, toolbar, rows, pager (shape 2)
   The strip is handed to the collection's own `figures` slot rather than
   stacked above it, because ch27.1 fixes the region order — figures, folder
   tabs, then the panel with toolbar, rows and pager inside it — and law 1
   forbids a screen inventing a second spine to hold them apart.

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" chapter 27.1 (main page) and 27.11 (dashboard).

     ch27.1, the region order, verbatim:
       "Figures, folder tabs, then the collection panel — toolbar, rows, pager
        inside it. A collection may drop the figure strip; it may not reorder
        what remains, and filters never sit above the tabs."

     ch27.11 on what a figure is for, verbatim:
       "A figure or a card is a link to the collection that produced it,
        filtered the same way. A dashboard that cannot be opened into its
        records is a poster."

     ch27.1 on the figures themselves, verbatim: "Three or four counts a
       person would act on. The strip is not an analytics surface — a fifth
       number belongs on the dashboard."

   THE LAW THIS FILE OBEYS
   · IT DRAWS NOTHING. Every element on this page comes out of a shape. This
     file supplies content, wiring and words, and writes no layout of its own
     beyond the one wrapper the shapes are handed to each other through.
   · THE SYSTEM DOOR IS `comfortable`. Commission §9: "The system app is
     dense, wide, and used all day by staff."
   · FIVE FIGURES, AND THE FIFTH IS THE QUESTION. From dashboard.tsx, ruling
     G. ch27.1 caps the strip at four "and a fifth number belongs on the
     dashboard" — this screen IS the dashboard now, so `maxFigures={5}` and
     the fifth tile is 27.11's "one chart that answers a stated question",
     two columns wide, its label the question. Nowhere else gets five.
   · NEVER MORE THAN THREE SERIES. The one three-series spark plots build,
     support and overrun, which is the ceiling: `--chart-4` and `--chart-5`
     repeat 1 and 2 today, so a fourth would draw two indistinguishable pairs.
   · EVERY NUMBER IS A LINK (27.11). From dashboard.tsx, ruling G. Each
     default tile carries an `onSelect` built from `onFigureSelect`, because
     "a dashboard that cannot be opened into its records is a poster".
   · ONE MANGO ON THE PAGE. The primary create is last in the action row and
     nothing else on the screen is filled. No tile takes `tone="brand"`.
   · A FIGURE THE READER MAY NOT SEE RENDERS NOTHING (ch24.6). From
     dashboard.tsx, ruling G: `figuresVisible={false}` draws no strip at all,
     never a greyed one.
   · EVERY STRING IS A PROP. Headings, tab labels, column headers, action
     labels and the empty-state words all default here and all override.

   RENDERING CONTEXT
   `"use client"`. Both shapes it composes are client components.
   ========================================================================= */

import * as React from "react";

import { Badge } from "../../components/badge/badge";
import { Button } from "../../components/button/button";
import { Text } from "../../components/typography/typography";
import type { DataTableColumn } from "../../components/data-table/data-table";
import type { CollectionFrameTab } from "../../components/collection-frame/collection-frame";
import type { FilterChip } from "../../components/filter-bar/filter-bar";
import type { SortOption } from "../../components/sort-control/sort-control";
import { Plus } from "../../foundations/icons";
import { CollectionScreen, StatStrip, type StatStripFigure } from "../templates";
import { type ShapeState, type ShapeStateCopy } from "../states";

/**
 * WHERE `/` GOES. Client ruling G, 2026-08-22, verbatim: "landing for the
 * system is always home."
 *
 * There is no second landing screen and no screen at `/` at all — the system
 * door has exactly one, and it is this file at `/home`. This repository ships
 * no router, so the redirect is declared rather than performed: an
 * application mounts `/` on whatever its own router calls a redirect and
 * reads the target from here, so the path is written down once. The portal's
 * `/` is a different thing and stays a real screen (`PortalIndexRoute`),
 * because it decides between `/home` and `/login` and this one does not
 * decide anything.
 */
export const SYSTEM_ROOT_REDIRECT = "/home";

/** One line of the system's own work queue. */
export interface HomeTicket {
  /** Stable id. Also the reference a person reads out loud. */
  id: string;
  /** What the ticket asks for. */
  title: string;
  /** Which client account it belongs to. */
  account: string;
  /** Where it is in the seven-stage progression, as a word. */
  stage: string;
  /** Who owns it today. */
  owner: string;
  /** Which sprint it is committed to, or undefined for the backlog. */
  sprint?: string;
  /** How long it has been open, already formatted by the app. */
  age: string;
  /** This one is past the date it was promised for. */
  overdue?: boolean;
}

export interface HomeRouteProps
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
  /** The micro line above the heading. */
  eyebrow?: React.ReactNode;
  /** The page heading. */
  heading?: React.ReactNode;
  /** The exact number of tickets behind the current tab. A zero is drawn. */
  count?: number;

  /** The headline numbers. Defaults to this route's own five. */
  figures?: readonly StatStripFigure[];
  /** Accessible name for the figure strip. */
  figuresLabel?: string;
  /**
   * The reader may see the strip. `false` renders NOTHING (ch24.6).
   * From dashboard.tsx, ruling G.
   */
  figuresVisible?: boolean;
  /**
   * Open the records behind a figure, filtered the same way (ch27.11). Wired
   * into every default tile, so a route that passes none ships a poster.
   * From dashboard.tsx, ruling G.
   */
  onFigureSelect?: (id: string) => void;

  /** The tabs. Every one could be written as a filter — that is the test. */
  tabs?: CollectionFrameTab[];
  /** Which tab is on. */
  tab?: string;
  /** Tab changed. It belongs in the URL. */
  onTabChange?: (value: string) => void;
  /** Accessible name for the tab row. */
  tabsLabel?: string;

  /** The rows. */
  tickets?: readonly HomeTicket[];
  /** Open one. */
  onTicketSelect?: (ticket: HomeTicket) => void;

  /** The term in the search field. */
  searchValue?: string;
  /** Term changed. */
  onSearchChange?: (value: string) => void;
  /** The field's own clear. */
  onSearchClear?: () => void;
  /** The field's placeholder. */
  searchPlaceholder?: string;
  /**
   * THE THREE ACCESSIBLE NAMES THIS SCREEN USED TO OWN.
   *
   * `countLabel`, `searchLabel` and `bodyLabel` were written into the call
   * below as the literals "tickets", "MagnifyingGlass tickets" and "Open tickets",
   * while every neighbour on the same call — `railLabel`, `figuresLabel`,
   * `tabsLabel`, `searchPlaceholder`, `columnLabels` — was a prop. Nothing
   * distinguished them; they were simply missed, and the cost falls on the
   * one reader who cannot see the screen: a person using a screen reader in
   * German heard three English words on the app's landing page and had no
   * way to change them.
   *
   * Undefined keeps the words that shipped.
   */
  countLabel?: string;
  /** What a screen reader calls the search field. */
  searchLabel?: string;
  /** What a screen reader calls the row region. */
  bodyLabel?: string;

  /** Active facets, as removable chips. */
  filters?: FilterChip[];
  /** Drop one facet. */
  onFilterRemove?: (id: string) => void;
  /** Drop them all. */
  onFiltersClear?: () => void;

  /** Which key the rows are ordered on. */
  sortValue?: string;
  /** Order changed. */
  onSortChange?: (value: string) => void;

  /** Which page is shown, one-based. */
  page?: number;
  /** How many there are. */
  pageCount?: number;
  /** Page changed. */
  onPageChange?: (page: number) => void;

  /** Start a ticket. The one mango on the page. */
  onCreate?: () => void;
  /** Its label. */
  createLabel?: React.ReactNode;
  /** Take the current view away as a file. */
  onExport?: () => void;
  /** Its label. */
  exportLabel?: React.ReactNode;

  /** The column headings. */
  columnLabels?: Partial<Record<HomeColumnKey, string>>;
  /** Loading, empty, no-results or error. The frame stays drawn (ch27 law 4). */
  state?: ShapeState;
  /** Per-locale words for the three registers. */
  copy?: Partial<ShapeStateCopy>;
  /** Try the page again after a block failure. */
  onRetry?: () => void;
  /** Its label. */
  retryLabel?: React.ReactNode;
  /** Drop every facet from the no-results register. */
  onClearFilters?: () => void;
  /** Its label. */
  clearFiltersLabel?: React.ReactNode;
}

/** The keys the table's columns are addressed by. */
export type HomeColumnKey = "title" | "account" | "stage" | "owner" | "sprint" | "age";

const COLUMN_LABELS: Record<HomeColumnKey, string> = {
  title: "Ticket",
  account: "Account",
  stage: "Stage",
  owner: "Owner",
  sprint: "Sprint",
  age: "Open for",
};

/* Obviously-fictional system content. Every account, person and reference
   below is invented for this file; none of it is a real client. */
const TICKETS: readonly HomeTicket[] = [
  {
    id: "TKT-4192",
    title: "Booking widget drops the second court",
    account: "Fernbank Sports",
    stage: "In build",
    owner: "Anja Kessler",
    sprint: "S-41",
    age: "3d",
  },
  {
    id: "TKT-4188",
    title: "Retainer report is a day behind the ledger",
    account: "Tidewell Group",
    stage: "Waiting on client",
    owner: "Tomás Reiner",
    sprint: "S-41",
    age: "9d",
    overdue: true,
  },
  {
    id: "TKT-4181",
    title: "Second warehouse needs its own stock module",
    account: "Brightsilo",
    stage: "Scoping",
    owner: "Marta Lindqvist",
    age: "12d",
  },
  {
    id: "TKT-4176",
    title: "Invoice mail lands in promotions",
    account: "Havenlark",
    stage: "In review",
    owner: "Yusuf Aydın",
    sprint: "S-40",
    age: "5d",
  },
  {
    id: "TKT-4170",
    title: "Add a Dutch locale to the member portal",
    account: "Orrery Labs",
    stage: "Triage",
    owner: "Owen Bray",
    age: "2d",
  },
];

/* OVERRIDE 47 (2026-08-23) — AN INVENTED SUBSET WORD IS AN EMPTY SLOT NOW.
   The entries below with no label appear in NO chapter. The register's N4 TAIL
   swept them and logged rather than stripped them, because the last unilateral
   vocabulary sweep by the design side (override 35) had to be withdrawn within
   three hours; the client ruled on 2026-08-23 that they go. What a collection
   calls its subsets is the dev team's information architecture.
   THE `value` IDS STAY AS SLOTS, exactly as override 35 left `CompanyHubLabels`
   -- an application passes `tabs` and the words come back. A count goes with
   the label it belonged to: an unnamed slot counts nothing.
   A label the kit STATES is untouched: CH27.13's All / Mine / Waiting /
   Archived are the artifact's own. */
const TABS: CollectionFrameTab[] = [
  { value: "all", label: "All", count: 24 },
  { value: "mine", label: "Mine", count: 6 },
  { value: "waiting", label: "Waiting on client", count: 4 },
  { value: "overdue", label: "" },
];

const SORTS: SortOption[] = [
  { value: "age", label: "Open for" },
  { value: "account", label: "Account" },
  { value: "stage", label: "Stage" },
  { value: "owner", label: "Owner" },
];

/* The three-series spark behind the fifth tile. From dashboard.tsx, ruling G.
   Three is the ceiling: `--chart-4` and `--chart-5` repeat 1 and 2, so a
   fourth series would draw two indistinguishable pairs. */
const HOURS_SPARK: Array<Record<string, unknown>> = [
  { period: "W31", build: 74, support: 32, overrun: 12 },
  { period: "W32", build: 79, support: 34, overrun: 13 },
  { period: "W33", build: 84, support: 36, overrun: 13 },
  { period: "W34", build: 88, support: 39, overrun: 15 },
];

/**
 * ch27.11 — each figure is a link into the collection that produced it, so
 * every one carries an `onSelect`. `select` is built from the route's
 * `onFigureSelect`; a route that passes none gets tiles that are not controls,
 * which is 27.11's "poster" and is the call site's choice to make, not this
 * file's to paper over. From dashboard.tsx, ruling G.
 */
function buildFigures(
  select: (id: string) => (() => void) | undefined,
): readonly StatStripFigure[] {
  return [
  {
    id: "open",
    label: "Open tickets",
    value: "24",
    support: "across 6 accounts",
    delta: "+3 on last week",
    deltaDirection: "up",
    spark: {
      type: "bar",
      xKey: "week",
      data: [
        { week: "W34", open: 18 },
        { week: "W35", open: 21 },
        { week: "W36", open: 19 },
        { week: "W37", open: 24 },
      ],
      series: [{ key: "open", label: "Open" }],
      summary: "Open tickets rose from eighteen to twenty-four over four weeks.",
    },
    onSelect: select("open"),
  },
  {
    id: "build",
    label: "In build",
    value: "9",
    support: "two ship this sprint",
    onSelect: select("build"),
  },
  {
    id: "waiting",
    label: "Waiting on client",
    value: "4",
    support: "all chased",
    onSelect: select("waiting"),
  },
  {
    id: "retainer",
    label: "Retainer used",
    value: "87%",
    support: "of contracted hours",
    delta: "−4 on last month",
    deltaDirection: "down",
    onSelect: select("retainer"),
  },
  {
    /* The fifth tile, from dashboard.tsx (ruling G). ch27.11's "one chart
       that answers a stated question" — the label IS the question and the
       spark is the shape the answer takes. Two columns wide, because four
       weeks of three series needs the room. The twelve shapes hold no
       dashboard CARD and no titled chart panel, which is why the question is
       drawn as a strip tile at all; that gap was SYS2-1 and is restated in
       GAPS-RULINGS.md now that this screen is the only landing screen. */
    id: "hours",
    label: "Where did the hours go?",
    value: "142 h",
    support: "per week · W31–W34",
    span: 2,
    spark: {
      type: "bar",
      xKey: "period",
      data: HOURS_SPARK,
      series: [
        { key: "build", label: "Build" },
        { key: "support", label: "Support" },
        { key: "overrun", label: "Overrun" },
      ],
      summary:
        "Hours per week, W31 to W34. Build 74, 79, 84, 88. Support 32, 34, 36, 39. Overrun 12, 13, 13, 15.",
    },
    onSelect: select("hours"),
  },
  ];
}

/**
 * The system home screen.
 *
 * TEN STATES — every one belongs to a shape, and none is redrawn here.
 *  1. default        — figures, tabs, toolbar, rows, pager.
 *  2. hover          — the row wash, owned by `DataTable`.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by `Button` and by the row control.
 *  5. disabled       — does not apply to the page. A reader who may not
 *                      create is passed no `onCreate` and sees no button.
 *  6. loading        — `state="loading"`: the same table, unfilled, heading
 *                      and tabs still drawn.
 *  7. empty          — `state="empty"` with no facet on: the one mango create.
 *  8. error          — `state="error"`: the block failure inside the panel.
 *  9. selected       — row selection, owned by `DataTable`.
 * 10. read-only      — no `onCreate` and no `onExport`: rows and figures only.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — the strip rewraps on its own tile measure, the
 *  toolbar condenses rather than being dropped, and the table scrolls inside
 *  its own region. All three behaviours belong to the shapes.
 *
 * RTL — LTR only by client ruling.
 */
function HomeRoute({
  rail,
  railLabel,
  eyebrow = "Today",
  heading = "Work",
  count = 24,
  figures,
  figuresLabel = "Headline figures",
  figuresVisible = true,
  onFigureSelect,
  tabs = TABS,
  tab,
  onTabChange,
  tabsLabel = "Ticket subsets",
  tickets = TICKETS,
  onTicketSelect,
  searchValue,
  onSearchChange,
  onSearchClear,
  searchPlaceholder = "MagnifyingGlass tickets",
  /* The three that were literals in the call below. Defaulted HERE so the
     words are declared once, beside their neighbours, instead of buried
     three hundred lines down in the render. */
  countLabel = "tickets",
  searchLabel = "MagnifyingGlass tickets",
  bodyLabel = "Open tickets",
  filters,
  onFilterRemove,
  onFiltersClear,
  sortValue,
  onSortChange,
  page,
  pageCount,
  onPageChange,
  onCreate,
  createLabel = "New ticket",
  onExport,
  exportLabel = "Export",
  columnLabels,
  state = "ready",
  copy,
  onRetry,
  retryLabel = "Try again",
  onClearFilters,
  clearFiltersLabel = "Clear filters",
  ...props
}: HomeRouteProps) {
  /* A tab nobody has named is not drawn, and a strip of one tab is not a
     choice: below two named tabs this route draws NO strip at all, which is
     27.43's own picture rather than a hole. Override 47. */
  const namedTabs = tabs.filter((tab) => tab.label !== "");

  /* The same test the shape makes, made here for one reason only: to know
     whether the register or the header band is holding the screen's one
     mango. Override 17 counts ACTIONS, and the empty register's create is
     one. */
  const filtered =
    (searchValue !== undefined && searchValue.length > 0) ||
    (filters !== undefined && filters.length > 0);
  const registerHasMango = state === "empty" && !filtered;
  const labels = { ...COLUMN_LABELS, ...columnLabels };

  /* ch27.11 — every number opens the records behind it, filtered the same
     way. From dashboard.tsx, ruling G. */
  const select = (id: string) =>
    onFigureSelect === undefined ? undefined : () => { onFigureSelect(id); };
  const strip = figures ?? buildFigures(select);

  const columns: Array<DataTableColumn<HomeTicket>> = [
    {
      key: "title",
      header: labels.title,
      sortable: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          {/* `DataTable` already draws the first column at the record-name
              weight, so nothing here restates it. */}
          <span>{row.title}</span>
          <Text as="span" size="sm" tone="tertiary" numeric>
            {row.id}
          </Text>
        </span>
      ),
    },
    { key: "account", header: labels.account, sortable: true, cell: (row) => row.account },
    {
      key: "stage",
      header: labels.stage,
      cell: (row) => <Badge>{row.stage}</Badge>,
    },
    { key: "owner", header: labels.owner, sortable: true, cell: (row) => row.owner },
    {
      key: "sprint",
      header: labels.sprint,
      cell: (row) => (row.sprint === undefined ? null : <Badge variant="outline">{row.sprint}</Badge>),
    },
    {
      key: "age",
      header: labels.age,
      align: "end",
      sortable: true,
      cell: (row) => (
        <Text as="span" size="sm" tone={row.overdue ? "default" : "secondary"} numeric>
          {row.age}
        </Text>
      ),
    },
  ];

  return (
    <CollectionScreen<HomeTicket>
      rail={rail}
      railLabel={railLabel}
      data-slot="system-home"
      density="comfortable"
      eyebrow={eyebrow}
      heading={heading}
      count={count}
      /* FORWARDED, NOT WRITTEN — see the props. */
      countLabel={countLabel}
      figures={
        <StatStrip
          figures={strip}
          visible={figuresVisible}
          /* THE ONE SCREEN WHOSE FIGURES ARE IN CARDS, AND IT IS NAMED.
             `SHELL.md`: "the figure strip on a main screen — bare on the body
             pane, NOT in cards … the one exception is the dashboard (27.11),
             where the figures ARE in cards." Ruling G makes this screen the
             dashboard, so `card` is written here on purpose and this is the
             only main screen in either door allowed to say it. */
          surface="card"
          /* ch27.1 caps the strip at four and says "a fifth number belongs on
             the dashboard". Ruling G makes this screen the dashboard, so five
             is the ceiling here and nowhere else. From dashboard.tsx. */
          maxFigures={5}
          label={figuresLabel}
          /* VERBATIM, NO TERNARY — see accounts.tsx. This read
             `state === "error" ? "ready" : state` and put "OPEN TICKETS 24
             across 6 accounts" over a body that could not load the tickets.
             T3B-6. */
          state={state}
        />
      }
      tabs={namedTabs.length > 1 ? namedTabs : undefined}
      tab={tab}
      defaultTab={namedTabs[0]?.value}
      onTabChange={onTabChange}
      tabsLabel={tabsLabel}
      searchValue={searchValue}
      onSearchChange={onSearchChange}
      onSearchClear={onSearchClear}
      searchPlaceholder={searchPlaceholder}
      searchLabel={searchLabel}
      filters={filters}
      onFilterRemove={onFilterRemove}
      onFiltersClear={onFiltersClear}
      sortOptions={SORTS}
      sortValue={sortValue}
      onSortChange={onSortChange}
      rows={[...tickets]}
      getRowId={(row) => row.id}
      columns={columns}
      /* WIRED. `onTicketSelect` was declared, destructured and then passed
         nowhere at all — a second dead handler beside the one in
         `CollectionScreen`, and the reason the dashboard's ticket table could
         not reach a ticket. 27.8 is what a row opens into. */
      onRowSelect={
        onTicketSelect === undefined
          ? undefined
          : (row) => {
              onTicketSelect(row);
            }
      }
      bodyLabel={bodyLabel}
      page={page}
      pageCount={pageCount}
      onPageChange={onPageChange}
      /* THE ONE MANGO, AND IT IS A GLYPH IN THE HEADER BAND. `SHELL.md`:
         "Create is always the glyph, never the word" — so the word that used
         to sit on this button is now the control's accessible name, and the
         button itself is `MainScreen`'s `onCreate`, one level above the
         toolbar it used to be drawn in. It steps DOWN to a paper glyph when
         the empty register is holding the screen's mango instead. */
      actions={
        <React.Fragment>
          {onExport === undefined ? null : (
            <Button variant="secondary" onClick={onExport}>
              {exportLabel}
            </Button>
          )}
          {onCreate === undefined || !registerHasMango ? null : (
            <Button
              variant="secondary"
              size="icon"
              aria-label={typeof createLabel === "string" ? createLabel : undefined}
              onClick={onCreate}
            >
              <Plus aria-hidden="true" />
            </Button>
          )}
        </React.Fragment>
      }
      onCreate={registerHasMango ? undefined : onCreate}
      /* CLIENT FEEDBACK ROUND 1, ITEM 3 — "everytime i see a collection, on the
         toolbar, at least i need to have the + button". The panel's CHARCOAL
         `+` is now `CollectionScreen`'s default, and this is the UNGATED
         handler it needs: the line above stands the header's MANGO down on the
         empty screen so 27.21's register holds the screen's one mango, and
         keying the toolbar's create off the same expression would have deleted
         it on exactly the screen where creating matters most. */
      onToolbarCreate={onCreate}
      createLabel={typeof createLabel === "string" ? createLabel : undefined}
      state={state}
      copy={copy}
      emptyAction={
        onCreate === undefined ? undefined : <Button onClick={onCreate}>{createLabel}</Button>
      }
      /* ch27.22 forbids mango here: clearing a filter is a retreat. */
      noResultsAction={
        onClearFilters === undefined ? undefined : (
          <Button variant="secondary" onClick={onClearFilters}>
            {clearFiltersLabel}
          </Button>
        )
      }
      errorAction={
        onRetry === undefined ? undefined : (
          <Button variant="secondary" onClick={onRetry}>
            {retryLabel}
          </Button>
        )
      }
      {...props}
    />
  );
}

HomeRoute.displayName = "HomeRoute";

export { HomeRoute };
