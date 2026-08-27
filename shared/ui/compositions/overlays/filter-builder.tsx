"use client";

/* ============================================================================
   FilterBuilderScreen — composition 27.33.

   THE ONE SENTENCE
   "What opens behind '+ filter' when one chip is not enough. It is a panel
   over the collection, it reads as prose, and its output is either the
   toolbar's chips or a saved view that becomes a folder tab."

   DESIGN SOURCE — "Kwapso UI Kit.dc.html" chapter 27.33, verbatim:

     IT READS AS A SENTENCE
       "Where · field · operator · value, then 'and' down the left. A filter a
        person can read aloud is a filter they can check; a grid of unlabelled
        dropdowns is not."

     THE MATCH COUNT IS LIVE AND STATED
       "Top right of the panel and on the commit button: 6 of 24 match. Nobody
        should have to apply a filter to find out it returns nothing — that is
        what 27.22 is for, and it should be rare."

     NO GROUPS, NO "OR"
       "Conditions only ever narrow. Nested groups and mixed and/or are
        deliberately out of scope: two saved views are clearer than one filter
        nobody but its author can read."

     ITS OUTPUT IS CHIPS OR A TAB
       "Show applies it as toolbar chips. Save as a tab turns it into a folder
        tab on this collection for everyone — which is how the tab set grows,
        and why saving says who it affects."

     REMOVING IS ONE PRESS PER ROW
       "Each condition carries its own ×, and the toolbar chip says '3
        conditions' with an × that clears the lot. Nothing is only removable
        by re-opening the builder."

     NARROW STACKS, KEEPS THE COUNT
       "Below 720px each condition becomes a card of three stacked fields; the
        match count and Show sit at the bottom in the usual order, context
        left and commit right."

     DOORS DIFFER
       "The portal has search and its three tabs, and no builder — a client
        filtering their own dozen requests is a scroll, not a query."

   THE LAW THIS FILE OBEYS
   · IT READS AS A SENTENCE, AND THE SENTENCE IS IN THE DOM. Where · field ·
     operator · value, in that order, with "and" leading every row after the
     first. The conjunction is a word in tertiary ink in its own column, not
     a control: there is nothing to choose, because there is no "or".
   · NO GROUPS, NO "OR" — AND NO PROP THAT COULD ADD ONE. There is no
     `conjunction` on `FilterCondition`, no `children` on it, and no nesting
     in the type. The out-of-scope sentence is printed on the screen as well,
     because a reader looking for the missing control should find the answer
     rather than the absence.
   · THE COUNT IS LIVE, STATED TWICE, AND NEVER GUESSED. `matchCount` and
     `totalCount` come from the application — this screen counts nothing
     itself — and are drawn top right of the panel and again on the commit
     control. A builder that computed its own count would be lying whenever
     the query and the list disagreed.
   · REMOVING IS ONE PRESS PER ROW. Every condition owns an ×; the toolbar
     chip owns the × that clears the lot. Both are always drawn.
   · SAVING SAYS WHO IT AFFECTS. "Saving adds a folder tab for everyone on
     this collection" sits beside the control that does it, not in a
     confirmation after the fact.
   · ONE MANGO, AND IT IS "Show 6". Clear is a text button and Save as a tab
     is paper: saving is not the primary act, applying is.
   · THERE IS NO `door` PROP. The portal has no builder.
   · EVERY STRING IS A PROP with a default (PATTERN §7).
   · No CSS `border`, no px, no literal colour, no gradient, no illustration.
   · Focus is one global rule. Dark is a token flip.

   THE COLLECTION BEHIND THE PANEL IS A MAIN SCREEN, AND IT IS DRAWN AS ONE
   THIS COMPOSITION AS A WHOLE IS NEITHER OF THE TWO SCREENS — 27.33 is "a
   panel over the collection", and the panel is the subject. But the
   collection UNDER it is an ordinary main screen: it is in the navbar, it has
   an eyebrow with a count, folder tabs and a toolbar. So it is drawn by
   `MainScreen` rather than assembled here.

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
   the first time. The PANEL is untouched by this and stays what it is,
   including the side it rises from — see the next block.

   THE TOOLBAR'S CONTROLS GO TO `toolbarActions`, NOT `actions`. On
   `MainScreen` those are two different rows: `actions` is the HEADER BAND's
   cluster, one level up on the screen card, and `toolbarActions` is the
   panel's own inline end. Export and the collection's `+` are the toolbar's,
   which is where `CollectionFrame`'s `actions` slot always put them, so the
   re-base keeps them where they were drawn. `SHELL.md`: "the page header's `+`
   is mango; the collection panel's own `+` is charcoal" — this screen's one
   mango is "Show 6" in the panel, so no `onCreate` is passed and the header
   band draws no `+` at all.

   Two of `MainScreen`'s slots are deliberately NOT used here. `meta` is a
   description line under the heading and 27.33 draws none. `panel={false}`
   would remove the soft-paper panel and with it the toolbar and the folder
   tabs — which is where this screen's search field, its "3 conditions" chip
   and its `+ filter` live.

   WHY THE PANEL RISES FROM THE BOTTOM RATHER THAN THE SIDE
   The chapter calls it "a panel over the collection" and gives it no side and
   no measure. The kit's side drawer is 26.25rem, and the sentence this panel
   exists to draw — Where · field · operator · value · × — cannot be read at
   that width: every control crushes to two characters and an ellipsis, which
   is precisely the "grid of unlabelled dropdowns" the chapter is arguing
   against. The bottom sheet is the kit's other panel and it is full width, so
   the sentence reads left to right on a desktop and stacks into cards at 380
   exactly as the artifact draws it — and no width is invented to get there.
   The collection stays visible above it either way. Logged as T3B-12 in
   GAPS-TRACK3B.md: if the client wants the drawer, the drawer needs a second,
   wider measure and that is a kwapso value nobody has stated.

   RENDERING CONTEXT
   `"use client"`. A media subscription, Radix `Sheet`, and the condition
   handlers built during this module's own render.
   ========================================================================= */

import * as React from "react";

import { Button } from "../../components/button/button";
import { Input } from "../../components/input/input";
import { SearchInput } from "../../components/search-input/search-input";
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
import { Hint, Text } from "../../components/typography/typography";
import { FilterBar, type FilterChip } from "../../components/filter-bar/filter-bar";
import { type CollectionFrameTab } from "../../components/collection-frame/collection-frame";
import { FormActions } from "../../components/form/form";
import { Check, Plus, X } from "../../foundations/icons";
import { cn } from "../../lib/utils";
import { MainScreen } from "../templates";

/** One option in the field or the operator list. */
export interface FilterOption {
  value: string;
  label: string;
}

/**
 * One condition. Deliberately FLAT and deliberately without a conjunction of
 * its own: conditions only ever narrow, so there is nothing to choose between
 * rows and nothing to nest inside one.
 */
export interface FilterCondition {
  /** Stable key, handed back by every callback. */
  id: string;
  /** Which field it tests. */
  field: string;
  /** How it tests it. */
  operator: string;
  /** What it tests against, already worded by the application (ruling 07 owns dates). */
  value: string;
  /**
   * A list to pick the value from. Without one the value is a line to type,
   * which is what a date or a free term needs.
   */
  valueOptions?: readonly FilterOption[];
}

/** Every user-facing string on this screen. */
export interface FilterBuilderLabels {
  /** The micro line over the heading. */
  eyebrow: string;
  /** The collection's name. */
  heading: string;
  /** The tab strip's accessible name. */
  tabsLabel: string;
  /** The toolbar's search field. */
  searchLabel: string;
  searchPlaceholder: string;
  /** The toolbar's control that opens this panel. */
  openLabel: string;
  /** The toolbar's export and create. */
  exportLabel: string;
  createLabel: string;
  /** The facet bar's accessible name and its clear-all wording. */
  filtersLabel: string;
  removeAllLabel: string;
  /** The panel's own name. */
  title: string;
  /** The line under it. */
  lead: string;
  /** The first row's conjunction, and every later row's. */
  where: string;
  and: string;
  /** The three controls' accessible names. `%s` is the row's field. */
  fieldLabel: string;
  operatorLabel: string;
  valueLabel: string;
  /** One row's remove. `%s` is the row's field. */
  removeLabel: string;
  /** The control that adds a row. */
  addCondition: string;
  /** Why there is no "or". */
  outOfScope: string;
  /** Who a saved view affects. */
  savingAffects: string;
  /** The three footer controls. Only the last is mango. */
  clear: string;
  saveAsTab: string;
  /** The panel's close chip. */
  closeLabel: string;
}

const DEFAULT_LABELS: FilterBuilderLabels = {
  eyebrow: "Group · 24 open",
  heading: "Collection",
  tabsLabel: "Collection subsets",
  searchLabel: "Search this collection",
  searchPlaceholder: "Search",
  openLabel: "Filter",
  exportLabel: "Export",
  createLabel: "Add a record",
  filtersLabel: "Active filters",
  removeAllLabel: "Remove every condition",
  title: "Filter",
  lead: "Reads top to bottom. Every condition narrows the last.",
  where: "Where",
  and: "and",
  fieldLabel: "Field for condition %s",
  operatorLabel: "Operator for condition %s",
  valueLabel: "Value for condition %s",
  removeLabel: "Remove the condition on %s",
  addCondition: "Condition",
  outOfScope:
    'Groups and "or" are out of scope: two saved views are clearer than one nested filter.',
  savingAffects: "Saving adds a folder tab for everyone on this collection.",
  clear: "Clear",
  saveAsTab: "Save as a tab",
  closeLabel: "Close",
};

const DEFAULT_TABS: CollectionFrameTab[] = [
  { value: "all", label: "All", count: 24 },
  { value: "mine", label: "Mine", count: 6 },
  { value: "archived", label: "Archived", count: 118 },
];

const FIELDS: readonly FilterOption[] = [
  { value: "status", label: "Status" },
  { value: "owner", label: "Owner" },
  { value: "opened", label: "Opened" },
];

const OPERATORS: readonly FilterOption[] = [
  { value: "is", label: "is" },
  { value: "is-any-of", label: "is any of" },
  { value: "is-before", label: "is before" },
  { value: "is-after", label: "is after" },
];

const OWNERS: readonly FilterOption[] = [
  { value: "Member name", label: "Member name" },
  { value: "Anja Kessler", label: "Anja Kessler" },
];

/* The artifact's own three conditions, in its own words. */
const DEFAULT_CONDITIONS: readonly FilterCondition[] = [
  { id: "c1", field: "status", operator: "is-any-of", value: "In build, In review" },
  { id: "c2", field: "owner", operator: "is", value: "Member name", valueOptions: OWNERS },
  { id: "c3", field: "opened", operator: "is-before", value: "1 Jun 2026" },
];

/**
 * The sentence's tracks. Below `sm` every condition is a card of stacked
 * fields, which is the narrow render's own words; from `sm` it is one line
 * that reads left to right.
 */
const CONDITION_ROW =
  "grid min-w-0 gap-x-[var(--space-3)] gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-center";

/* ----------------------------------------------------------------------------
   Is there room for the side panel, or is this the bottom sheet? The same
   device `quick-view.tsx`, `export.tsx` and `bulk-edit.tsx` use.
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

export interface FilterBuilderScreenProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  /* ---- The shell's rail -------------------------------------------------
     The screen this composition renders behind its panel is one of the two
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
  labels?: Partial<FilterBuilderLabels>;
  /** The collection behind the panel. */
  tabs?: CollectionFrameTab[];
  /** Which tab is open. */
  tab?: string;
  /** Tab changed. */
  onTabChange?: (value: string) => void;
  /** The rows behind the panel. A node, because the builder does not own them. */
  children?: React.ReactNode;

  /** The panel is open. */
  open?: boolean;
  /** The panel opened or closed. */
  onOpenChange?: (open: boolean) => void;

  /** The conditions, in the order they read. */
  conditions?: readonly FilterCondition[];
  /** Every field a condition can test. */
  fields?: readonly FilterOption[];
  /** Every operator. */
  operators?: readonly FilterOption[];
  /** One part of one condition changed. */
  onConditionChange?: (id: string, part: "field" | "operator" | "value", value: string) => void;
  /** One condition was removed. */
  onConditionRemove?: (id: string) => void;
  /** A condition was added. */
  onConditionAdd?: () => void;

  /** How many records the conditions match. Live, and the application's. */
  matchCount?: number;
  /** How many the collection holds. */
  totalCount?: number;
  /** How the count reads. */
  formatMatch?: (match: number, total: number) => string;
  /** How the commit control reads. The count is never dropped. */
  formatShow?: (match: number) => string;
  /** How the toolbar chip reads. */
  formatChip?: (count: number) => string;

  /** The toolbar's search term. */
  searchValue?: string;
  /** Term changed. */
  onSearchChange?: (value: string) => void;
  /** The toolbar's export. */
  onExport?: () => void;
  /** The toolbar's create. */
  onCreate?: () => void;

  /** Drop every condition. */
  onClear?: () => void;
  /** Turn the conditions into a folder tab for everyone. */
  onSaveAsTab?: () => void;
  /** Apply them as toolbar chips. THE ONE MANGO. */
  onShow?: () => void;
}

/**
 * The filter builder, over its collection.
 *
 * TEN STATES
 *  1. default        — the collection, the chip in its toolbar, and the panel
 *                      over it with the sentence in it.
 *  2. hover          — the controls'. Nothing here draws a wash.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — `Button`'s, `Select`'s and `Input`'s.
 *  5. disabled       — does not apply. A field the reader may not filter on
 *                      is not in `fields` (ch24.6), never a dimmed option.
 *  6. loading        — does not apply to the builder. The FIELD LIST is known
 *                      before the panel opens; the match count arriving late
 *                      is the count's own business and the application holds
 *                      it. Nothing here spins.
 *  7. empty          — NO CONDITIONS: the sentence is just the add control and
 *                      the two notes. The panel is not blanked and no register
 *                      is drawn — an empty builder is a builder waiting, not a
 *                      builder with nothing to say.
 *  8. error          — does not apply. A filter cannot fail; a filter that
 *                      matches nothing is 27.22, on the collection behind,
 *                      and the live count exists so it is seen before it is
 *                      applied.
 *  9. selected       — the chosen field, operator and value on each row, each
 *                      drawn by its own control with a real ARIA state.
 * 10. read-only      — a reader with no filter right is passed no handlers,
 *                      so the toolbar's Filter control is absent.
 *
 * NARROW (380px), STATED — the artifact's own second render
 *  · ONE CONDITION PER CARD. Below 45rem each row becomes a card of stacked
 *    fields: the conjunction and the × on the first line, then field,
 *    operator and value beneath. The sentence still reads top to bottom,
 *    which is the order it reads in at every width.
 *  · THE MATCH COUNT IS PINNED, AND IT MOVES. On desktop it sits top right of
 *    the panel; at 380 it moves into the footer beside the commit — "context
 *    left and commit right" — where it cannot scroll away.
 *  · THE FOOTER IS THE COUNT AND SHOW. Clear and Save as a tab are drawn from
 *    `sm` up, which is what the artifact's narrow render carries. Removal is
 *    not lost with them: each condition keeps its ×, and so does the toolbar
 *    chip.
 *  · THE PANEL IS THE SAME BOTTOM SHEET AT BOTH WIDTHS; what changes inside it
 *    is the sentence, which stacks into cards. The collection stays above it.
 *  · THE TOOLBAR CONDENSES. The chip and its × stay; the search field takes
 *    its own line. Nothing about removing a condition needs the panel.
 *  · BOTH NOTES STAY. The out-of-scope sentence and the who-it-affects
 *    sentence are the two questions this panel gets asked, at any width.
 *
 * RTL — LTR only by client ruling.
 */
function FilterBuilderScreen({
  className,
  rail,
  railLabel,
  labels,
  tabs = DEFAULT_TABS,
  tab,
  onTabChange,
  children,
  open = true,
  onOpenChange,
  conditions = DEFAULT_CONDITIONS,
  fields = FIELDS,
  operators = OPERATORS,
  onConditionChange,
  onConditionRemove,
  onConditionAdd,
  matchCount = 6,
  totalCount = 24,
  formatMatch = (match, total) => `${match} of ${total} match`,
  formatShow = (match) => `Show ${match}`,
  formatChip = (count) => `${count} conditions`,
  searchValue,
  onSearchChange,
  onExport,
  onCreate,
  onClear,
  onSaveAsTab,
  onShow,
  ...props
}: FilterBuilderScreenProps) {
  const words: FilterBuilderLabels = { ...DEFAULT_LABELS, ...labels };
  const hasRoom = useHasRoom();

  const fieldLabelOf = (condition: FilterCondition) =>
    fields.find((option) => option.value === condition.field)?.label ?? condition.field;

  /* THE TOOLBAR CHIP. One chip for the lot, with the × that clears them all —
     the chapter's own wording, and the reason the builder is not the only way
     to undo a filter. */
  const chips: FilterChip[] =
    conditions.length === 0
      ? []
      : [
          {
            id: "conditions",
            label: formatChip(conditions.length),
            removeLabel: words.removeAllLabel,
            onSelect: onOpenChange === undefined ? undefined : () => onOpenChange(true),
          },
        ];

  /* THE COUNT. Drawn twice — see the breakpoint block — from one string, so
     the two can never disagree. */
  const matchLine = (
    <Text as="span" size="sm" tone="secondary" numeric>
      {formatMatch(matchCount, totalCount)}
    </Text>
  );

  const conditionRows = conditions.map((condition, index) => (
    <div
      key={condition.id}
      data-slot="filter-condition"
      className={cn(
        CONDITION_ROW,
        /* The card the narrow render draws. From `sm` it is one line and the
           split under it goes. */
        "pb-[var(--space-4)] shadow-[var(--hairline-under)] sm:pb-[var(--space-3)]",
      )}
    >
      {/* WHERE · and — a word, never a control: there is no "or" to pick. */}
      <div className="flex items-center justify-between gap-3 sm:justify-start">
        <Hint as="span">{index === 0 ? words.where : words.and}</Hint>
        {/* On narrow the × rides the conjunction line, which is what the
            artifact draws; from `sm` it sits at the end of the sentence. */}
        {onConditionRemove === undefined ? null : (
          <Button
            variant="text"
            size="sm"
            className="sm:hidden"
            aria-label={words.removeLabel.replace("%s", fieldLabelOf(condition))}
            onClick={() => onConditionRemove(condition.id)}
          >
            <X />
          </Button>
        )}
      </div>

      <Select
        value={condition.field}
        onValueChange={
          onConditionChange === undefined
            ? undefined
            : (value) => onConditionChange(condition.id, "field", value)
        }
      >
        <SelectTrigger aria-label={words.fieldLabel.replace("%s", String(index + 1))}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fields.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={condition.operator}
        onValueChange={
          onConditionChange === undefined
            ? undefined
            : (value) => onConditionChange(condition.id, "operator", value)
        }
      >
        <SelectTrigger aria-label={words.operatorLabel.replace("%s", String(index + 1))}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {condition.valueOptions === undefined ? (
        <Input
          value={condition.value}
          aria-label={words.valueLabel.replace("%s", String(index + 1))}
          onChange={
            onConditionChange === undefined
              ? undefined
              : (event) =>
                  onConditionChange(condition.id, "value", event.currentTarget.value)
          }
        />
      ) : (
        <Select
          value={condition.value}
          onValueChange={
            onConditionChange === undefined
              ? undefined
              : (value) => onConditionChange(condition.id, "value", value)
          }
        >
          <SelectTrigger aria-label={words.valueLabel.replace("%s", String(index + 1))}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {condition.valueOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {onConditionRemove === undefined ? null : (
        <Button
          variant="text"
          size="icon"
          className="hidden sm:inline-flex"
          aria-label={words.removeLabel.replace("%s", fieldLabelOf(condition))}
          onClick={() => onConditionRemove(condition.id)}
        >
          <X />
        </Button>
      )}
    </div>
  ));

  return (
    <div
      data-slot="filter-builder-screen"
      className={cn("flex w-full min-w-0 flex-col", className)}
      {...props}
    >
      {/* THE COLLECTION BEHIND THE PANEL, ON THE MODEL. `MainScreen` draws the
          four levels and puts the eyebrow and the title in the header band;
          the folder tabs and the toolbar are the panel's own first rows, one
          level down. See the header block on why this is not a bare
          `CollectionFrame`. */}
      <MainScreen
        rail={rail}
        railLabel={railLabel}
        eyebrow={words.eyebrow}
        title={words.heading}
        tabs={tabs}
        tab={tab}
        defaultTab={tabs[0]?.value}
        onTabChange={onTabChange}
        tabsLabel={words.tabsLabel}
        search={
          <SearchInput
            value={searchValue}
            label={words.searchLabel}
            placeholder={words.searchPlaceholder}
            onChange={
              onSearchChange === undefined
                ? undefined
                : (event) => onSearchChange(event.currentTarget.value)
            }
          />
        }
        filters={
          <FilterBar
            filters={chips}
            label={words.filtersLabel}
            onRemove={onClear === undefined ? undefined : () => onClear()}
          >
            {/* What "+ filter" is. It opens the panel below. */}
            {onOpenChange === undefined ? null : (
              <Button variant="secondary" size="sm" onClick={() => onOpenChange(true)}>
                {words.openLabel}
              </Button>
            )}
          </FilterBar>
        }
        /* THE HEADER BAND'S OWN MANGO `+`. p37 draws `Export` and a mango
           `+` on this screen's header band, above the panel, exactly as on
           every other collection screen; 27.22's rule card states it for the
           family — "The page-level mango + stays in the header where it
           always is." It was omitted on the reading that "Show 6" is the
           screen's one mango. Show 6 is the PANEL's commit, in the panel's
           own footer; the header's create acts on the page. See FB-1. */
        onCreate={onCreate}
        createLabel={words.createLabel}
        actions={
          onExport === undefined ? undefined : (
            <Button variant="secondary" onClick={onExport}>
              {words.exportLabel}
            </Button>
          )
        }
        /* THE PANEL'S OWN ROW, not the header band's. On `MainScreen` these
           are two different clusters and `toolbarActions` is the one
           `CollectionFrame`'s `actions` slot always fed. */
        toolbarActions={
          <React.Fragment>
            {onExport === undefined ? null : (
              <Button variant="secondary" onClick={onExport}>
                {words.exportLabel}
              </Button>
            )}
            {/* CHARCOAL. `SHELL.md`'s pair rule: "the header's `+` is mango,
                the panel's own `+` is charcoal", and p37 draws it as a solid
                charcoal disc at the trailing end of this toolbar. It was
                `secondary`, which on the body pane is the panel's own paper,
                so the pair had no charcoal in it. */}
            {onCreate === undefined ? null : (
              <Button variant="inverse" size="icon" aria-label={words.createLabel} onClick={onCreate}>
                <Plus />
              </Button>
            )}
          </React.Fragment>
        }
        body={children}
      />

      {/* THE PANEL OVER THE COLLECTION. */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          /* A PANEL OVER THE COLLECTION, AT BOTH WIDTHS — see the note in the
             header block on why this is the bottom edge and not the drawer. */
          side="bottom"
          data-slot="filter-builder-panel"
          data-width={hasRoom ? "wide" : "narrow"}
          closeLabel={words.closeLabel}
          className="flex flex-col"
        >
          <SheetHeader>
            <SheetTitle>{words.title}</SheetTitle>
            {/* THE COUNT, TOP RIGHT OF THE PANEL — on the lead's row rather
                than the title's, because the title's row already ends in the
                close chip. On narrow it is in the footer instead, where the
                artifact pins it. */}
            <div className="flex items-baseline justify-between gap-[var(--space-5)]">
              <SheetDescription className="min-w-0">{words.lead}</SheetDescription>
              <span className="hidden shrink-0 sm:block">{matchLine}</span>
            </div>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-[var(--space-4)] overflow-y-auto px-[var(--space-6)] py-[var(--space-4h)]">
            <div className="flex min-w-0 flex-col">{conditionRows}</div>

            {onConditionAdd === undefined ? null : (
              <Button variant="secondary" size="sm" className="self-start" onClick={onConditionAdd}>
                <Plus />
                {words.addCondition}
              </Button>
            )}

            {/* The two questions this panel gets asked, answered on it. */}
            <Hint as="p">{words.outOfScope}</Hint>
            <Hint as="p">{words.savingAffects}</Hint>
          </div>

          <FormActions
            /* Narrow: "the match count and Show sit at the bottom in the usual
               order, context left and commit right". */
            meta={<span className="sm:hidden">{matchLine}</span>}
            hairline
          >
            {/* THE ARTIFACT'S NARROW FOOTER IS THE COUNT AND SHOW, AND
                NOTHING ELSE. Clear and Save as a tab are drawn from `sm` up.
                Nothing is stranded by that: every condition keeps its own ×
                at every width, and the toolbar's "3 conditions" chip keeps
                the × that clears the lot — which is the chapter's own
                sentence about removal never needing the panel. Saving a view
                for everyone on the collection is the one act this screen
                does not offer on a phone. Logged as T3B-11. */}
            {/* CLEAR IS A PAPER PILL, NOT A TEXT WORD — p37 draws all three
                footer controls as pills: Clear plain paper, Save as a tab
                paper with the + glyph, Show 6 mango with the ✓. A text-word
                Clear was the build's own reading of "context left". */}
            {onClear === undefined ? null : (
              <Button
                variant="secondary"
                className="hidden sm:inline-flex"
                onClick={onClear}
              >
                {words.clear}
              </Button>
            )}
            {onSaveAsTab === undefined ? null : (
              <Button
                variant="secondary"
                className="hidden sm:inline-flex"
                onClick={onSaveAsTab}
              >
                <Plus aria-hidden="true" />
                {words.saveAsTab}
              </Button>
            )}
            {/* THE ONE MANGO, AND IT CARRIES THE COUNT — and p37's ✓. */}
            <Button onClick={onShow}>
              <Check aria-hidden="true" />
              {formatShow(matchCount)}
            </Button>
          </FormActions>
        </SheetContent>
      </Sheet>
    </div>
  );
}

FilterBuilderScreen.displayName = "FilterBuilderScreen";

export { FilterBuilderScreen };
