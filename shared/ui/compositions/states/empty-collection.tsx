"use client";

/* ============================================================================
   EmptyCollectionScreen — composition 27.21.

   THE ONE SENTENCE
   "A collection nobody has added to. The rail, header, tabs and toolbar all
   stay drawn (law 4): only the rows are replaced. It is the one empty state
   allowed to carry an action, because the action is the whole point of the
   screen."

   DESIGN SOURCE — "Kwapso UI Kit.dc.html" chapter 27.21, verbatim:

     THE FRAME NEVER GOES AWAY
       "Rail, header, figures, tabs and toolbar stay exactly where they are —
        only the rows are replaced. A member should be able to search, switch
        tab or add a record from an empty collection without the page changing
        shape when the first record arrives."

     FIGURES READ ZERO, IN DISABLED INK
       "Zeros are shown, not hidden. A blank strip looks broken; a zero in
        disabled ink says the count is real and the collection is simply new."

     TWO ACTIONS, AND THE MANGO IS THE FIRST RECORD
       "Add the first takes the one mango — the only place a labelled create
        button is allowed, because there is no toolbar + to lean on and the
        screen exists to be filled. Import sits beside it in paper."

     IT SAYS WHERE RECORDS COME FROM
       "One sentence naming the two routes — someone adds one, or a client
        raises one. An empty state that only says 'no records' teaches nothing
        and gets screenshotted into a support thread."

     NO ILLUSTRATION, EVER
       "No empty-box drawing, no mascot, no dashed placeholder rectangle. Type
        and one button carry it, left-aligned like everything else. The brand
        does not draw pictures of absence."

     DOORS DIFFER
       "The portal's empty collection drops Import and says 'Raise your first
        request', because a client cannot add records on someone else's
        behalf. Everything else is identical."

   FOUR SCREENS, NEVER CONFLATED — 27.21 · 27.22 · 27.23 · 27.7
   The chapter's own group heading is "Three different emptinesses, three
   different answers. They must never be mistaken for one another", and 27.7
   is a fourth thing again. What separates THIS file from the other three:
     · 27.21 (here)  — nothing has been created. The frame stays, the figures
                       read ZERO, and this is THE ONE empty state that carries
                       a labelled mango create.
     · 27.22 no-results — records exist and a facet excluded them. No mango in
                       the body at all; the facets stay on screen with an ×.
     · 27.23 not-found  — one record's URL is dead. The body names the record
                       NUMBER and hands back a route.
     · 27.7 denial      — a dialog over the blurred page naming who can grant
                       access. Never a code.

   IT IS A MAIN SCREEN IN ITS EMPTY REGISTER
   `SHELL.md`: "a main screen is in the navbar; a detail screen has
   breadcrumbs." A collection is in the navbar whether or not anybody has
   added to it, so this screen is `MainScreen` with `state="empty"` — and
   27.21's own first sentence is the same law from the other side: "The frame
   never goes away … rail, header, figures, tabs and toolbar stay exactly
   where they are — only the rows are replaced."

   What the shell sweep fixed here, off `SHELL.md`'s own list of errors:

     · THE OFF-BEIGE BODY PANE. This file used to return a bare `div` holding
       `CollectionFrame`, so the page, the screen card, the rail and the body
       pane were all missing — and 27.21's sentence names the rail first.
     · THE FIGURE STRIP LIES BARE. The three zeros were in `StatGrid`'s CARDS.
       `SHELL.md`: "the figure strip on a main screen — bare on the body pane,
       NOT in cards … the one exception is the dashboard (27.11)". They are a
       `StatStrip surface="bare"` now, and the zeros are unchanged.
     · EXPORT AND THE STEPPED-DOWN CREATE ARE IN THE HEADER BAND. They were in
       `CollectionFrame`'s `actions`, which is the TOOLBAR inside the panel;
       the artifact draws both beside the heading.
     · NO FOOTER, AND IT CANNOT GROW ONE. `MainScreen` has no footer slot.

   WHY THE BODY IS STILL COMPOSED HERE AND NOT `ShapeStateBody`'s
   `ShapeStateBody` routes through `ScreenRegister`, which is CENTRED and
   draws a MARK above the title. 27.21 forbids both in the same breath —
   "left-aligned like everything else" and "no empty-box drawing" — so the
   body is composed here from `Headline`, `Text` and two `Button`s and handed
   to `MainScreen`'s `emptyBody` slot, which exists for exactly this: a shape
   that owns a screen's words handing its own register down rather than
   taking `CollectionFrame`'s default. Nothing here draws a fill or a radius.

   AND WHY THE STRIP GOES THROUGH `figureStrip` RATHER THAN `figures`
   `MainScreen` hands its `figures` DATA to `StatStrip` along with the
   screen's `state`, and a `StatStrip` in the empty state draws the register
   instead of its tiles. That is right for a collection whose numbers came out
   of a request that returned nothing, and it is exactly wrong here: 27.21
   wants the zeros DRAWN, in disabled ink, because "a blank strip looks
   broken". So the strip is passed as the node `MainScreen` keeps for a route
   that has to keep its own — and it is the route's job to keep it bare, which
   is why `surface="bare"` is written out below.

   THE LAW THIS FILE OBEYS
   · ONE MANGO, AND IT IS "ADD THE FIRST". The header band's create steps down
     to a paper glyph on this screen so the screen never carries two, and
     `onCreate` is withheld from `MainScreen` so no second one can be drawn.
     Override 17 counts ACTIONS, not objects, and the register's create is one.
   · A ZERO IS DRAWN, IN DISABLED INK. `Badge count={0}` renders NOTHING by
     kit law, so the tab counts and the figure values are passed as nodes in
     `--ink-disabled` rather than as counts. That is the artifact's sentence,
     not a workaround.
   · EVERY STRING IS A PROP with a default (PATTERN §7).
   · NO CSS `border`, no px, no literal colour, no gradient, no illustration.
   · Focus is one global rule. Dark is a token flip.

   RENDERING CONTEXT
   `"use client"`. The toolbar, the tabs and the two actions all carry
   handlers built during this module's own render.
   ========================================================================= */

import * as React from "react";

import { Button } from "../../components/button/button";
import { Headline, Text } from "../../components/typography/typography";
import { SearchInput } from "../../components/search-input/search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/select/select";
import type { CollectionFrameTab } from "../../components/collection-frame/collection-frame";
import { Plus } from "../../foundations/icons";
import { MainScreen, StatStrip, type StatStripFigure } from "../templates";

/** Which door. The portal drops Import and asks for a request instead. */
export type EmptyCollectionDoor = "system" | "portal";

/** One figure over an empty collection. Its value is always the zero. */
export interface EmptyFigure {
  /** Stable key. */
  id: string;
  /** What the number would count — "Open", "In build", "Waiting". */
  label: string;
}

/** One tab over an empty collection. Its count is always the zero. */
export interface EmptyTab {
  /** The value the strip switches on. */
  value: string;
  /** What the tab says. */
  label: string;
  /**
   * Hidden below `sm`. 27.21's narrow render drops Archived and keeps the
   * other five, so the call site says which tabs survive the fold.
   */
  narrow?: boolean;
}

/** Every user-facing string on this screen. */
export interface EmptyCollectionLabels {
  /** The micro line over the heading. */
  eyebrow: string;
  /** The collection's name. */
  heading: string;
  /** The toolbar's export control. */
  exportLabel: string;
  /** The toolbar's create control — an icon, so this is its accessible name. */
  createLabel: string;
  /** The facet's visible name. */
  filterLabel: string;
  /** The facet's resting value. */
  filterAny: string;
  /** The search field's accessible name. */
  searchLabel: string;
  /** The search field's placeholder. */
  searchPlaceholder: string;
  /** The strip's accessible name. */
  figuresLabel: string;
  /** The tab strip's accessible name. */
  tabsLabel: string;
  /** The zero every figure and every tab reads. Translatable numeral. */
  zero: string;
  /** The body's one sentence. */
  title: string;
  /** Where records come from — the two routes, named. */
  body: string;
  /**
   * The tail of that sentence, dropped below `sm`. 27.21's narrow render
   * stops at "…or when a client raises a request."
   */
  bodyTail: string;
  /** The one mango on this screen. */
  create: string;
  /** The paper action beside it. The portal has none. */
  secondary: string;
}

const SYSTEM_LABELS: EmptyCollectionLabels = {
  eyebrow: "Group · no records",
  heading: "Collection",
  exportLabel: "Export",
  createLabel: "Add a record",
  filterLabel: "Status",
  filterAny: "Any",
  searchLabel: "MagnifyingGlass this collection",
  searchPlaceholder: "Search",
  figuresLabel: "Figures",
  tabsLabel: "Collection subsets",
  zero: "0",
  title: "Nothing in this collection yet.",
  /* 27.21, verbatim — the two routes, named. */
  body:
    "Records land here when someone adds one, or when a client raises a request from the portal.",
  bodyTail: " The first one takes about a minute.",
  create: "Add the first",
  secondary: "Import a list",
};

/* 27.21 doors differ, verbatim: "The portal's empty collection drops Import
   and says 'Raise your first request', because a client cannot add records on
   someone else's behalf. Everything else is identical." */
const PORTAL_LABELS: EmptyCollectionLabels = {
  ...SYSTEM_LABELS,
  create: "Raise your first request",
  secondary: "",
};

const DEFAULT_FIGURES: readonly EmptyFigure[] = [
  { id: "open", label: "Open" },
  { id: "in-build", label: "In build" },
  { id: "waiting", label: "Waiting" },
];

const DEFAULT_TABS: readonly EmptyTab[] = [
  { value: "all", label: "All", narrow: true },
  { value: "mine", label: "Mine", narrow: true },
  { value: "archived", label: "Archived" },
];

const DEFAULT_FILTER_OPTIONS: readonly string[] = ["Any", "Open", "In build", "Waiting"];

export interface EmptyCollectionScreenProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  /* ---- The shell's rail -------------------------------------------------
     27.21 names the rail in its own first sentence — "rail, header, figures,
     tabs and toolbar stay exactly where they are" — and `SHELL.md` adds that
     the rail is identical on both screens and never changes between them.
     Its CONTENTS are the application's navigation, so they arrive as a node;
     its placement, its measure and the one law about it (dropped entirely
     below the narrow breakpoint, because the kit draws no hamburger) all
     belong to `ScreenShell`. */

  /** The navigation rail's contents. Placed by the shell, dropped narrow. */
  rail?: React.ReactNode;
  /** Accessible name for the rail. */
  railLabel?: string;

  /** Which door. The portal drops the second action. */
  door?: EmptyCollectionDoor;
  /** Per-locale words. */
  labels?: Partial<EmptyCollectionLabels>;
  /** The figures over the collection. Every one reads zero. */
  figures?: readonly EmptyFigure[];
  /** The tab strip. Every count reads zero. */
  tabs?: readonly EmptyTab[];
  /** What the status facet can be set to. */
  filterOptions?: readonly string[];
  /** Which tab is open. */
  tab?: string;
  /** Tab changed. */
  onTabChange?: (value: string) => void;
  /** The term. Empty on this screen, but the field still works (law 4). */
  searchValue?: string;
  /** Term changed. */
  onSearchChange?: (value: string) => void;
  /** The one mango: add the first record. */
  onCreate?: () => void;
  /** The paper action beside it: import a list. Absent in the portal. */
  onSecondary?: () => void;
  /** The toolbar's export. */
  onExport?: () => void;
}

/**
 * A collection with nothing in it.
 *
 * TEN STATES
 *  1. default        — THIS IS the state. The screen exists to be one.
 *  2. hover          — owned by the two Buttons and the toolbar controls.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by `Button`.
 *  5. disabled       — does not apply. Nothing on an empty collection is
 *                      switched off; the zeros are DISABLED INK, which is a
 *                      colour for a real count, not a disabled control.
 *  6. loading        — does not apply here. A collection whose rows have not
 *                      arrived is 27.6, a different composition: it keeps the
 *                      row geometry rather than saying "nothing yet".
 *  7. empty          — see 1.
 *  8. error          — does not apply. A collection that FAILED is ruling
 *                      06's block failure, not an empty one.
 *  9. selected       — the open tab, owned by `CollectionFrame`.
 * 10. read-only      — a reader with no create right is passed no `onCreate`;
 *                      the control is then absent, never dimmed (ch24.6).
 *
 * NARROW (380px), STATED
 *  · The frame does NOT change: header, figures, tabs and toolbar all stay
 *    drawn. 27.21's narrow render is the same screen, not a reduction.
 *  · THE RAIL AND THE HEADER CONTROLS ARE THE TWO EXCEPTIONS, and they are
 *    `SHELL.md`'s, not this screen's: "drops the rail entirely — no hamburger
 *    is drawn anywhere in the kit. Drops controls, never counts." Export and
 *    the stepped-down create go with it; every zero stays, which is the one
 *    thing 27.21's own narrow caption asks for ("zeros stay"). The register's
 *    "Add the first" is in the BODY, not the header band, so it survives —
 *    which is the whole point of the screen.
 *  · The figure strip rewraps to one column on its own `auto-fit` grid; the
 *    zeros stay ("zeros stay" is the narrow render's own caption).
 *  · Tabs marked `narrow: false` are hidden below `sm` — the artifact's narrow
 *    render carries All / Mine and drops Archived.
 *  · The toolbar condenses rather than being dropped (27.1): the search field
 *    takes its own full-width line and the facet, export and create sit under
 *    it.
 *  · The two actions STACK, mango first, and the body's tail sentence is
 *    dropped — both are the artifact's own narrow drawing.
 *
 * RTL — LTR only by client ruling.
 */
function EmptyCollectionScreen({
  className,
  rail,
  railLabel,
  door = "system",
  labels,
  figures = DEFAULT_FIGURES,
  tabs = DEFAULT_TABS,
  filterOptions = DEFAULT_FILTER_OPTIONS,
  tab,
  onTabChange,
  searchValue,
  onSearchChange,
  onCreate,
  onSecondary,
  onExport,
  ...props
}: EmptyCollectionScreenProps) {
  const words: EmptyCollectionLabels = {
    ...(door === "portal" ? PORTAL_LABELS : SYSTEM_LABELS),
    ...labels,
  };

  /* 27.21: "Zeros are shown, not hidden … a zero in disabled ink says the
     count is real and the collection is simply new." `Badge count={0}` draws
     nothing by kit law, so the zero is a node in the disabled ink token.

     CORRECTLY DIVERGENT — do not "fix" either of these to tertiary.
     GAPS-CONTRAST §2 rows 6 and 10 measure both at 2.433:1 light / 3.321:1
     dark. The register figure below is the one that matters: at 41.25px it
     is LARGE TEXT, so its threshold is 3.0 rather than 4.5 — and it misses
     even that, in light, by 0.567. It stays, because the artifact asks for
     this tier by name and gives its reason: 27.21's heading is "Figures read
     zero, in disabled ink" and its body is "A blank strip looks broken; a
     zero in disabled ink says the count is real and the collection is simply
     new."

     Worth saying out loud, since the artifact chose an exempt tier for the
     largest number on the screen: a zero here is not a disabled control. It
     is the answer to "how many are there", drawn at 41px precisely so it
     carries — and then painted in the one ink that is excused from being
     legible. Recorded in GAPS-CONTRAST "Resolved" as a ruled divergence with
     the measurement beside it. Reversing it is the artifact's call. */
  const zero = (
    <Text as="span" size="sm" numeric className="text-ink-disabled">
      {words.zero}
    </Text>
  );

  const items: StatStripFigure[] = figures.map((figure) => ({
    id: figure.id,
    label: figure.label,
    value: (
      <span data-slot="empty-figure-zero" className="text-ink-disabled">
        {words.zero}
      </span>
    ),
  }));

  const frameTabs: CollectionFrameTab[] = tabs.map((entry) => ({
    value: entry.value,
    label: (
      <span
        className={
          entry.narrow
            ? "inline-flex items-center gap-2"
            : "hidden items-center gap-2 sm:inline-flex"
        }
      >
        {entry.label}
        {zero}
      </span>
    ),
  }));

  return (
    <MainScreen
      data-slot="empty-collection-screen"
      data-door={door}
      className={className}
      /* The two-door measure. The portal is the calm one (commission §9);
         27.21's "everything else is identical" is about the WORDS and the
         second action, and the measure was never one of the differences. */
      door={door}
      rail={rail}
      railLabel={railLabel}
      eyebrow={words.eyebrow}
      title={words.heading}
      /* No count chip: the eyebrow already says "no records", and the header
         band of a main screen has no count of its own to put a second zero
         in. `SHELL.md`: "counts render empty when zero, never '0'." */
      /* THE STRIP LIES BARE ON THE BODY PANE, and it is passed as a node
         rather than as data so `state="empty"` cannot blank it — see the
         header block. The zeros are unchanged: 27.21 wants them drawn. */
      figureStrip={<StatStrip figures={items} surface="bare" label={words.figuresLabel} />}
      tabs={frameTabs}
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
              : (event) => {
                  onSearchChange(event.currentTarget.value);
                }
          }
        />
      }
      filters={
        <Select defaultValue={filterOptions[0]}>
          <SelectTrigger aria-label={words.filterLabel}>
            <SelectValue placeholder={words.filterAny} />
          </SelectTrigger>
          <SelectContent>
            {filterOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      actions={
        <Button variant="secondary" onClick={onExport}>
          {words.exportLabel}
        </Button>
      }
      /* THE HEADER'S `+` IS MANGO, AND IT IS DRAWN. It used to be stepped
         down to a paper glyph in `actions`, with `onCreate` withheld from
         `MainScreen`, so that the screen carried exactly one mango. p30 draws
         it MANGO beside a white `Export`, and 27.22's own rule card settles
         it in words: *"The page-level mango + stays in the header where it
         always is."* `SHELL.md` names the three screens that carry no mango
         at all — Archive, Activity log and Link sent — and the empty
         collection is not one of them.

         So this screen carries TWO mango actions, and that is the drawing:
         the header's `+`, which acts on the page, and the register's
         `Add the first`, which is "the only place a labelled create button is
         allowed". Override 17 is not stretched to cover it — it says a mark
         is not an action, and both of these are actions. This is the page
         over law 2, recorded at EMPTY-1 in GAPS-KIT-F.md. */
      onCreate={onCreate}
      createLabel={words.createLabel}
      /* THE PANEL'S OWN CLUSTER. 27.1: "Every screen with a collection
         carries that cluster — a collection without its own actions is
         unfinished", and p30 draws it on this screen: `Export` in white and
         a CHARCOAL round `+` at the trailing end of the toolbar. It was
         missing entirely. Charcoal is `variant="inverse"`; `secondary` is the
         paper pill and would have left the pair with no charcoal in it.
         27.21's rule card says "there is no toolbar + to lean on", which its
         own render contradicts — see EMPTY-2. */
      toolbarActions={
        <React.Fragment>
          <Button variant="secondary" onClick={onExport}>
            {words.exportLabel}
          </Button>
          <Button
            variant="inverse"
            size="icon"
            aria-label={words.createLabel}
            onClick={onCreate}
          >
            <Plus aria-hidden="true" />
          </Button>
        </React.Fragment>
      }
      state="empty"
      emptyBody={
        /* Left-aligned, type only. 27.21: "No empty-box drawing, no mascot,
           no dashed placeholder rectangle." */
        <div
          data-slot="empty-collection-body"
          className="flex min-w-0 flex-col items-start gap-3 py-[var(--space-7)]"
        >
          <Headline as="h3" size="h3">
            {words.title}
          </Headline>
          <Text as="p" size="sm" tone="secondary" measure>
            {words.body}
            {/* The artifact's narrow render stops one sentence earlier. */}
            <span className="hidden sm:inline">{words.bodyTail}</span>
          </Text>
          <div className="mt-2 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
            {/* THE ONE MANGO ON THIS SCREEN, AND THE ONE LABELLED CREATE THE
                KIT ALLOWS ANYWHERE: 27.21's "Add the first" is "the only
                place a labelled create button is allowed". The word stands. */}
            <Button onClick={onCreate}>{words.create}</Button>
            {door === "system" && words.secondary ? (
              <Button variant="secondary" onClick={onSecondary}>
                {words.secondary}
              </Button>
            ) : null}
          </div>
        </div>
      }
      {...props}
    />
  );
}

EmptyCollectionScreen.displayName = "EmptyCollectionScreen";

export { EmptyCollectionScreen };
