"use client";

/* ============================================================================
   NoResultsScreen — composition 27.22.

   THE ONE SENTENCE
   "A collection with records in it, showing none — because a search or a
   facet excluded them all. It is a different screen from 27.21 and must never
   be mistaken for it: nothing here is missing, something here is switched
   on."

   DESIGN SOURCE — "Kwapso UI Kit.dc.html" chapter 27.22, verbatim:

     IT IS NOT THE SAME SCREEN AS EMPTY
       "Empty (27.21) offers a create button; no-results offers a way back.
        Showing 'Add a record' to someone whose filter is too narrow makes
        them create a duplicate of something they already have."

     THE FILTERS STAY ON SCREEN, IN INK
       "Active facets take the charcoal fill with an × on each, so the cause
        of the emptiness is visible and removable in one press. A no-results
        body under a toolbar that looks unset is an unsolvable puzzle."

     IT COUNTS WHAT DROPPING ONE WOULD GIVE
       "The body names the collection total and what removing the narrowest
        facet would show. That sentence is the difference between guessing and
        knowing which chip to close."

     CLEAR IS PAPER, NEVER MANGO
       "No mango on this screen at all: clearing filters is a retreat, not the
        thing the screen is for. The page-level mango + stays in the header
        where it always is."

     THE SEARCH TERM IS QUOTED BACK
       "Whatever was typed sits in the field with its own × — never silently
        cleared, never re-run differently. If a term matched nothing, that is
        a fact about the term and the reader needs to see it."

     ARCHIVE IS OFFERED, NOT SEARCHED SILENTLY
       "A link offers the archive as a second place to look; the app never
        widens the search on its own. Results are what was asked for, always."

     DOORS DIFFER
       "The portal has search and its three tabs, and no builder" (27.33) —
       the portal keeps this screen unchanged; only the facet set is smaller.

   HOW THIS IS KEPT DISTINCT FROM 27.21, 27.23 AND 27.7
     · The register carries NO mango and NO create. The way out is Clear.
     · The facets are still on screen, each with its own ×, above the body.
     · The heading count is the REAL total (24), not a zero — the collection
       is full; the view is narrow. 27.21's zeros would be a lie here.
     · The body counts what dropping ONE facet would show. Neither 27.21,
       27.23 nor 27.7 states a number about other records.

   IT IS A MAIN SCREEN IN ITS NO-RESULTS REGISTER
   `SHELL.md`: "a main screen is in the navbar; a detail screen has
   breadcrumbs." A collection is in the navbar whatever its facets are doing,
   so this screen is `MainScreen` with `state="empty"` and its own register in
   the body slot. 27.22's own narrow render draws the rail, the header band,
   the tabs and the toolbar unchanged, which is the same law from the other
   side.

   What the shell sweep fixed here, off `SHELL.md`'s own list of errors:

     · THE OFF-BEIGE BODY PANE. This file used to return a bare `div` holding
       `CollectionFrame`, so the page, the screen card, the rail and the body
       pane were all missing and a soft-paper panel stood on the document.
     · EXPORT AND THE MANGO `+` ARE IN THE HEADER BAND. They were in
       `CollectionFrame`'s `actions`, which is the TOOLBAR inside the panel.
       The artifact's header row is `Group · 24 records` / `Collection` /
       `Export` / `+`, in that order, and 27.22 says so in words: "the
       page-level mango + stays IN THE HEADER where it always is."
     · THE COUNT CHIP IS GONE, AND THE NUMBER IS NOT. `count={total}` drew a
       `Badge` beside the heading saying 24 while the eyebrow one line above
       it already said "Group · 24 records". `SHELL.md` puts a main screen's
       count in the eyebrow, and the artifact draws no chip. The 24 in the
       body's sentence is untouched — that one is the argument of the screen.
     · NO FOOTER, AND IT CANNOT GROW ONE. `MainScreen` has no footer slot.

   THE MANGO STAYS IN THE HEADER, AND THAT IS NOT A SLIP
   Read whole, 27.22's paragraph is two sentences and they are about two
   different places: "CLEAR IS PAPER, NEVER MANGO. No mango on this screen at
   all: clearing filters is a retreat, not the thing the screen is for. The
   page-level mango + stays in the header where it always is." The heading and
   the first sentence govern the BODY — the register's way out — and the
   second sentence keeps the header's `+` by name. Three things agree with
   that reading and nothing disagrees with it:

     · the artifact's own header row for 27.22 draws `Export` and `+`;
     · `SHELL.md` names the screens with NO mango at all and lists exactly
       three — "on Archive, Activity log and Link sent there is no mango at
       all". 27.22 is not one of them;
     · the migrated shape encodes it. `collection-screen.tsx` computes
       `registerHasMango = state === "empty" && !filtered`, so in the FILTERED
       case — which is this screen — `onCreate` is passed through to the
       header band and the register gets a paper action instead.

   So: `onCreate` is passed, the header draws the unlabelled mango `+`, and
   the body carries Clear (paper) and the archive offer (text) and no mango.

   ONE THING THE BUILD AND THE ARTIFACT DISAGREE ABOUT
   27.22 says the active facets "take the charcoal fill". `FilterBar`'s chip is
   drawn on `--surface-raised` with primary ink, which is the kit's own resting
   chip everywhere else. This file does NOT hand-roll a charcoal chip — that
   would be rebuilding a primitive — so it uses `FilterBar` and the conflict is
   logged as T3B-2 in GAPS-TRACK3B.md.

   THE LAW THIS FILE OBEYS
   · NO MANGO IN THE BODY. Clear is `secondary` (paper) and the archive offer
     is `text`. The only mango on the screen is the header's create, which
     27.22 explicitly leaves where it always is.
   · THE TERM IS NEVER SILENTLY CLEARED. `searchValue` is rendered into the
     field and `onSearchClear` draws the field's own ×.
   · EVERY STRING IS A PROP with a default.
   · No CSS `border`, no px, no literal colour, no gradient, no illustration.
   · Focus is one global rule. Dark is a token flip.

   RENDERING CONTEXT
   `"use client"`. Chips, search and the two body controls all carry handlers.
   ========================================================================= */

import * as React from "react";

import { Button } from "../../controls/button/button";
import { Headline, Text } from "../../controls/typography/typography";
import { SearchInput } from "../../controls/search-input/search-input";
import {
  FilterBar,
  type FilterChip,
} from "../../controls/filter-bar/filter-bar";
import type { CollectionFrameTab } from "../../structures/collection-frame/collection-frame";
import { Plus } from "../../icons";
import { MainScreen } from "../templates";

/** One tab over the collection. Counts are real: the collection is full. */
export interface NoResultsTab {
  value: string;
  label: string;
  count: number;
  /** Kept below `sm`. The artifact's narrow render drops Archived. */
  narrow?: boolean;
}

/** Every user-facing string on this screen. */
export interface NoResultsLabels {
  eyebrow: string;
  heading: string;
  exportLabel: string;
  /** The header's create. An icon, so this is its accessible name. */
  createLabel: string;
  searchLabel: string;
  searchPlaceholder: string;
  /** The chip-row control that opens 27.33. An icon; this names it. */
  addFilterLabel: string;
  tabsLabel: string;
  filtersLabel: string;
  /** The body's one sentence. */
  title: string;
  /** "There are" — the words before the collection total. */
  countLead: string;
  /** The noun after the total. Dropped below `sm`: "There are 24 in this…". */
  countNoun: string;
  /** "in this collection." */
  countTail: string;
  /** "Dropping" — the words before the narrowest facet's name. */
  dropLead: string;
  /** "would show" — the words between the facet and its number. */
  dropTail: string;
  /** The way back. Paper, never mango. */
  clear: string;
  /** The second place to look. Offered, never searched silently. */
  archive: string;
}

const DEFAULT_LABELS: NoResultsLabels = {
  eyebrow: "Group · 24 records",
  heading: "Collection",
  exportLabel: "Export",
  createLabel: "Add a record",
  searchLabel: "Search this collection",
  searchPlaceholder: "Search",
  addFilterLabel: "Add a filter",
  tabsLabel: "Collection subsets",
  filtersLabel: "Active filters",
  title: "No records match these three filters.",
  countLead: "There are",
  countNoun: "records",
  countTail: "in this collection.",
  dropLead: "Dropping",
  dropTail: "would show",
  clear: "Clear filters",
  archive: "Search the archive instead",
};

const DEFAULT_TABS: readonly NoResultsTab[] = [
  { value: "all", label: "All", count: 24, narrow: true },
  { value: "mine", label: "Mine", count: 6, narrow: true },
  { value: "archived", label: "Archived", count: 118 },
];

const DEFAULT_FILTERS: readonly FilterChip[] = [
  { id: "status", label: "Status · Blocked" },
  { id: "owner", label: "Owner · Member name" },
];

export interface NoResultsScreenProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  /* ---- The shell's rail -------------------------------------------------
     `SHELL.md`: "the shell above is identical on both. The rail never changes
     between them." The rail's CONTENTS are the application's navigation, so
     they arrive as a node; its placement, its measure and the one law about
     it — dropped entirely below the narrow breakpoint, because the kit draws
     no hamburger anywhere — all belong to `ScreenShell`. */

  /** The navigation rail's contents. Placed by the shell, dropped narrow. */
  rail?: React.ReactNode;
  /** Accessible name for the rail. */
  railLabel?: string;

  /** Per-locale words. */
  labels?: Partial<NoResultsLabels>;
  /** The tab strip, with real counts. */
  tabs?: readonly NoResultsTab[];
  /** Which tab is open. */
  tab?: string;
  /** Tab changed. */
  onTabChange?: (value: string) => void;
  /** Whatever was typed. Quoted back into the field, never cleared for them. */
  searchValue?: string;
  /** Term changed. */
  onSearchChange?: (value: string) => void;
  /** The field's own ×. */
  onSearchClear?: () => void;
  /** The active facets. Each carries an ×. */
  filters?: readonly FilterChip[];
  /** Drop one facet. */
  onFilterRemove?: (id: string) => void;
  /** How many records the collection holds, ignoring the filters. */
  total?: number;
  /** The narrowest facet, named in the body — "Status · Blocked". */
  narrowestFacet?: string;
  /** How many records dropping that one facet would show. */
  narrowestWouldShow?: number;
  /** The way back. Paper. */
  onClear?: () => void;
  /** The second place to look. */
  onArchive?: () => void;
  /** Open 27.33. */
  onAddFilter?: () => void;
  /** The header's export. */
  onExport?: () => void;
  /** The header's create — the page-level mango, where it always is. */
  onCreate?: () => void;
}

/**
 * A collection whose filters excluded everything.
 *
 * TEN STATES
 *  1. default        — THIS IS the state.
 *  2. hover          — owned by the chips, the field and the two Buttons.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by `Button` and by each chip's two targets.
 *  5. disabled       — per chip, via `FilterChip.disabled`: a facet the reader
 *                      may see but not drop. A fill and an ink, never a fade.
 *  6. loading        — does not apply. A query still in flight is 27.6.
 *  7. empty          — the collection is NOT empty; that is 27.21 and a
 *                      different file. This screen never says "nothing yet".
 *  8. error          — does not apply. A search that FAILED is ruling 06's
 *                      block failure, not a search that matched nothing.
 *  9. selected       — the open tab, and every chip drawn IS a selection.
 * 10. read-only      — a reader with no create right is passed no `onCreate`.
 *
 * NARROW (380px), STATED — the artifact's caption is "the facets stay in ink,
 * the count stays in words":
 *  · The facets do NOT collapse into a count. `FilterBar` turns its chip row
 *    into a single-line horizontal scroller below `sm`, so all three stay
 *    reachable and every × stays pressable.
 *  · Tabs marked `narrow: false` are hidden below `sm`; All and Mine survive.
 *  · The toolbar condenses: the field takes its own line and the chips sit
 *    under it. THE RAIL AND THE HEADER'S CONTROLS ARE GONE — `SHELL.md`,
 *    "drops the rail entirely … drops controls, never counts", so Export and
 *    the mango `+` go and every tab count and the body's 24 stay. That is
 *    also the artifact's narrow render for 27.22, which draws neither.
 *  · The body's noun is dropped — "There are 24 in this collection." — which
 *    is the artifact's own narrow sentence.
 *  · Clear and the archive offer stack, Clear first.
 *
 * RTL — LTR only by client ruling.
 */
function NoResultsScreen({
  className,
  rail,
  railLabel,
  labels,
  tabs = DEFAULT_TABS,
  tab,
  onTabChange,
  searchValue = "roster export",
  onSearchChange,
  onSearchClear,
  filters = DEFAULT_FILTERS,
  onFilterRemove,
  total = 24,
  narrowestFacet = "Status · Blocked",
  narrowestWouldShow = 4,
  onClear,
  onArchive,
  onAddFilter,
  onExport,
  onCreate,
  ...props
}: NoResultsScreenProps) {
  const words: NoResultsLabels = { ...DEFAULT_LABELS, ...labels };

  const frameTabs: CollectionFrameTab[] = tabs.map((entry) => ({
    value: entry.value,
    label: (
      <span className={entry.narrow ? undefined : "hidden sm:inline"}>{entry.label}</span>
    ),
    count: entry.count,
  }));

  return (
    <MainScreen
      data-slot="no-results-screen"
      className={className}
      rail={rail}
      railLabel={railLabel}
      /* THE REAL TOTAL, IN THE EYEBROW WHERE A MAIN SCREEN KEEPS IT — the
         default reads "Group · 24 records". Not a zero: the collection is
         full and the view is narrow, and 27.22 exists to say exactly that.
         No chip beside the heading; the artifact draws none and it would be
         the same number twice. */
      eyebrow={words.eyebrow}
      title={words.heading}
      tabs={frameTabs}
      tab={tab}
      defaultTab={tabs[0]?.value}
      onTabChange={onTabChange}
      tabsLabel={words.tabsLabel}
      search={
        /* "Whatever was typed sits in the field with its own ×." */
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
        /* The facets stay ON SCREEN, each with its own ×. No `onClear` is
           passed: 27.22 puts the clear in the BODY, in paper, and a second
           clear living in the chip row would be two ways to say one thing. */
        <FilterBar
          filters={filters as FilterChip[]}
          onRemove={onFilterRemove}
          label={words.filtersLabel}
        />
      }
      /* The chip row's own "+", which opens 27.33. It sits after the chips,
         inside the toolbar, which is where the artifact draws it;
         `CollectionFrame` fixes that position as the view-switch slot. It is
         not a create — it adds a facet.

         CHARCOAL, NOT PAPER. p31 draws it as a solid charcoal disc at the
         trailing end of the toolbar, the same fill the two active facets take
         beside it, and `SHELL.md`'s pair rule is "the header's `+` is mango,
         the panel's own `+` is charcoal". It was `secondary`, which on the
         body pane is the panel's paper and left the pair with no charcoal in
         it at all. `inverse` is the kit's charcoal fill with an off-beige
         label, and it flips with the palette. */
      viewSwitch={
        <Button
          variant="inverse"
          size="icon"
          aria-label={words.addFilterLabel}
          onClick={onAddFilter}
        >
          <Plus aria-hidden="true" />
        </Button>
      }
      /* THE HEADER BAND'S PAPER PILLS. Export and nothing else: the mango is
         `onCreate`'s and `MainScreen` draws it after these, as a glyph. */
      actions={
        <Button variant="secondary" onClick={onExport}>
          {words.exportLabel}
        </Button>
      }
      /* THE ONE MANGO, AND IT IS THE HEADER'S. 27.22: "the page-level mango +
         stays in the header where it always is" — the "no mango on this
         screen at all" in the sentence before it is about the register, whose
         way out is Clear, in paper. See the header block for the whole
         reading. `MainScreen` draws it unlabelled; the word becomes the
         control's accessible name. */
      onCreate={onCreate}
      createLabel={words.createLabel}
      state="empty"
      emptyBody={
        <div
          data-slot="no-results-body"
          className="flex min-w-0 flex-col items-start gap-3 py-[var(--space-7)]"
        >
          <Headline as="h3" size="h3">
            {words.title}
          </Headline>
          <Text as="p" size="sm" tone="secondary" measure>
            {words.countLead}{" "}
            <Text as="span" size="sm" numeric>
              {total}
            </Text>{" "}
            <span className="hidden sm:inline">{words.countNoun} </span>
            {words.countTail} {words.dropLead}{" "}
            <Text as="span" size="sm">
              {narrowestFacet}
            </Text>{" "}
            {words.dropTail}{" "}
            <Text as="span" size="sm" numeric>
              {narrowestWouldShow}
            </Text>
            .
          </Text>
          <div className="mt-2 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
            {/* PAPER. 27.22: "Clear is paper, never mango." */}
            <Button variant="secondary" onClick={onClear}>
              {words.clear}
            </Button>
            {/* Offered, not searched silently. */}
            <Button variant="text" onClick={onArchive}>
              {words.archive}
            </Button>
          </div>
        </div>
      }
      {...props}
    />
  );
}

NoResultsScreen.displayName = "NoResultsScreen";

export { NoResultsScreen };
