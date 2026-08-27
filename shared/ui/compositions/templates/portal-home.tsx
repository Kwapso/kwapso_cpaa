"use client";

/* ============================================================================
   PortalHome — the client's landing screen: what we are waiting on them for,
   how their deliverables are progressing, and what the work has saved them.
   The savings figure CANNOT be rendered without the arithmetic behind it.

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" — and the honest first sentence is that the kit
   does not draw this screen. Chapter 27's closing paragraph names it as owed,
   verbatim: "Still owed, and named so it cannot be forgotten: the process
   map's editing state, a citation format for assistant answers, the rule for
   showing a calculation's inputs, a portal home of its own, and the saved
   switch between calendar and table — the portal's differences live inside
   each composition."

   So this file is assembled from the rules the kit DOES state about the
   portal, each quoted where it is used:

     ch27.41, doors differ, verbatim: "Clients never see this. The portal
       equivalent is 'waiting on you', which lists the three things it needs
       from them with no queue mechanics at all."

     ch27.34, doors differ, verbatim: "The portal notifies on three things
       only: kwapso replied, a deliverable is ready to review, and we are
       waiting on you. No assignments, no mentions, no automations."

     ch27.11, doors differ, verbatim: "The portal's dashboard shows only that
       client's own numbers, drops Retainer used unless their contract has
       one, and never shows team, owner or capacity figures. Three stages, so
       its chart has three series."

     ch27.11 on stating a period, verbatim: "Every other number in the system
       is stated with the period it belongs to … and never moves while you
       look at it."

     ruling 05/06 on where the flourish is allowed, verbatim: "The mango
       ambient field stays, scoped to auth, splash and portal home."

     chapter 4 on a savings figure that goes the wrong way, verbatim: "A
       negative bar — the portal keeps its axis because savings can regress —
       is poppy at each mode's value."

     ch24.6 on rights, verbatim: "Permissions HIDE actions rather than
       disabling them, so a client never sees a button they can't press."

   IT IS A MAIN SCREEN, AND SINCE 2026-08-23 IT SAYS SO IN CODE
   The client's test: "a main screen is in the navbar; a detail screen has
   breadcrumbs." The portal's landing screen is the portal's navbar, so it is
   a main screen and it now renders `MainScreen` — which is `ScreenShell`'s
   four levels. Before this it returned a bare `div` with a measure on it: no
   page, no screen card, no rail and no OFF-BEIGE BODY PANE, which is the
   level `SHELL.md` says the whole rebuild turned on.

   IT KEEPS THE PANEL, AND THE FIRST PASS AT THIS GOT IT WRONG. The reasoning
   for dropping it was that a landing screen is not a collection, so level 4 —
   "the collection / the record body" — is not there. Measured, that was
   false: `ProgressDashboard` draws the deliveries band as a
   `Card variant="raised"`, and `card.tsx` says a raised card "only reads as
   raised when it sits inside a `--surface-panel` band". `--card` and
   `--surface-page` are the same hex in light, `#FFFEF9`, so the band measured
   1.000 against the pane and was not an object at all. `SHELL.md`'s nesting
   is body pane → soft-paper PANEL → cards, and the bands are the cards. The
   panel is drawn; no toolbar and no folder tab come with it, because none is
   passed, which is right — ch27.41 says this list takes "no queue mechanics
   at all", and it has no subsets to cut.

   THE FIELD MOVED, AND IT IS RECORDED RATHER THAN QUIET. Ruling 05/06 allows
   the mango flourish here. It used to lie behind the whole screen because the
   screen was one transparent column; it now lies on the SCREEN CARD, under
   the rail and the header band, because the body pane above it is opaque and
   a field behind an opaque pane is a field nobody sees. `ScreenShell` takes
   it as a node so the ruling's scoping stays at the three call sites that
   have it.

   THE FIGURE AND ITS ARITHMETIC ARE ONE OBJECT
   Commission §9 item 10: the savings figure "must always render its
   explanation beside it". RULING D7-3 = 3A (2026-08-24) then said what that
   explanation IS — the arithmetic, always open, never a sentence and never a
   link. A prop that can be omitted is not good enough for either, so the
   guarantee is built three ways at once and none of them can be routed
   around:

     1. THERE IS NO `figure` PROP. `PortalHome` takes one `savings` object or
        none at all. The number and the sum are fields of the SAME object, and
        `inputs` is not optional in the type — leaving it out is a compile
        error at the call site, not a runtime surprise.
     2. THERE IS NO CODE PATH THAT EMITS THE NUMBER ALONE. `PortalSavingsFigure`
        builds exactly one tile, and the tile is only built after the
        arithmetic has been checked. There is no `hideInputs`, no `compact`,
        no slot override, and no branch that skips it.
     3. EMPTY INPUTS DELETE THE FIGURE, NOT THE SUM. A caller reaching this
        from untyped JavaScript with `inputs: []`, or with rows whose labels
        and values are all blank, gets `null` for the whole block and a
        development warning. The number is what disappears, because a number
        nobody can check is worse than no number at all.

   PH-2 IS CLOSED. It was logged in GAPS-SHAPES2.md because "the kit owes the
   rule for showing a calculation's inputs", so the shape of the explanation
   had to stay the caller's own node. The rule now exists and the shape is
   `PortalSavingsInput[]`.

   THE PORTAL'S LARGER TYPE IS THE ROOT SCALE, NOT A SIZE PER COMPONENT
   Commission §9 calls the portal "narrow, calm, larger type"; GAPS-COL3 SCR-3
   left the last of those three open. The position taken here, and the reason,
   is in this file's header rather than buried: `density="calm"` sets the
   MEASURE and the heading step, and the type ladder is moved by the app
   setting `data-scale="large"` on `<html>`. tokens.css §1 already ships three
   root sizes for exactly this, manifest.json already records that "the portal
   deliberately sits one step above the system app", and a shape that bumped
   its own steps would fork the ladder for one door — every component would
   need the same fork, dark would stop being a token flip, and the reader's
   own text-size control would fight it. Recorded as PH-1 in GAPS-SHAPES2.md.

   ============================================================================
   RULING D7-4, 2026-08-24 — THE PORTAL'S HOME, AND THE REGION ORDER REVERSES
   ============================================================================
   The client, on `verify/decide-2.html` §D7 proposal 4: "your proposal i like
   it." The proposal is ruling G's frame with the portal's own contents and
   four named differences, and all four are built here.

   FIRST, THE CORRECTION THE DRAWING ITSELF CARRIES. Ruling G settled which
   FILE is the system's home; it did not settle a layout. The layout is
   CH27.1's, which predates it and states the region order for a main screen,
   verbatim: "Figures, folder tabs, then the collection panel — toolbar, rows,
   pager inside it. A collection may drop the figure strip; it may not reorder
   what remains, and filters never sit above the tabs."

   THE FOUR DIFFERENCES, EACH ONE STRUCTURAL RATHER THAN ADVISED:
     1. TWO FIGURES, NOT FIVE. "A client has no ticket queue to count." The
        strip is `savings` plus `figure`, and `figure` is SINGULAR — there is
        no array to grow and no third slot.
     2. NO FOLDER TABS. "The middle region is optional in CH27.1 and the
        portal has no folders." There is no `tabs` prop; the region is an
        absence, not a flag.
     3. THE SAVINGS FIGURE CARRIES ITS EXPLANATION INSIDE THE TILE, "because
        PH-5 makes them inseparable and that is not negotiable here" — and
        since ruling D7-3 the explanation is the arithmetic.
     4. WAITING-ON-YOU FIRST, THEN DELIVERED. "The portal's list is a to-do,
        not a queue." One list, and the two arrays are joined by the component
        in that order.

   WHAT THIS REVERSES, SAID PLAINLY. This file's own law used to read: "THE
   REGION ORDER IS NOT THE CALL SITE'S. Waiting, then deliveries, then the
   savings. A figure above a thing the client is blocked on tells them we are
   pleased with ourselves while they wait." That reasoning was sound and it is
   overruled: the client saw the figure-first drawing and took it. What
   survives of it is the half that was never about order — the order is still
   not the call site's, it is just a different order. GAPS-SHAPES2 PH-3 is
   updated rather than quietly left standing.

   THE HOME DROPS A REGION; IT DOES NOT DELETE ONE. `ProgressDashboard` stays
   on this shape as region 4 because `/impact` needs it, and CH27.1's rule is
   that a screen may DROP a region rather than that every screen carries the
   same ones. The home passes no `deliveries`: its deliverables are the
   strip's count and the list's delivered rows, which is what the drawing
   draws.

   THE LAW THIS FILE OBEYS
   · NO QUEUE MECHANICS ON "WAITING ON YOU" (ch27.41). Structural: this shape
     offers no sort, no facets, no pager and no tabs for that list. They are
     not defaulted off; they are absent.
   · THE REGION ORDER IS NOT THE CALL SITE'S. Figures, then the list, then the
     progress bands. A call site chooses which regions it HAS and never where
     they sit — CH27.1's own rule.
   · A REGION THE READER MAY NOT SEE RENDERS NOTHING. `visible={false}` on the
     deliveries and the savings is `ProgressDashboard`'s and `StatGrid`'s own
     rule (ch24.6) and is not reimplemented here.
   · NEVER MORE THAN THREE SERIES anywhere near this screen — `--chart-4` and
     `--chart-5` repeat 1 and 2. This shape plots nothing at all, which is the
     safest way to obey it; a spark belongs to `StatStrip`, which cuts to
     three and says so.
   · Focus is one global rule. No ring, no radius, no fill written here.

   RENDERING CONTEXT
   `"use client"`. The rows carry select handlers built during this module's
   own render.
   ========================================================================= */

import * as React from "react";

import { AmbientBackground } from "../../components/ambient-background/ambient-background";
import { Title } from "../../components/title/title";
import { List, type ListRow } from "../../components/list/list";
import {
  DescriptionList,
  type DescriptionListItem,
} from "../../components/description-list/description-list";
import {
  ProgressDashboard,
  type ProgressRow,
} from "../../components/progress-dashboard/progress-dashboard";
import {
  StatGrid,
  type StatDeltaDirection,
  type StatItem,
} from "../../components/stat-grid/stat-grid";
import { cn } from "../../lib/utils";
import { MainScreen } from "./main-screen";
import {
  ShapeStateBody,
  shapeCopy,
  type ScreenDensity,
  type ShapeState,
  type ShapeStateCopy,
} from "../states/states";

/* ============================================================================
   The savings figure — and the reason it is its own component
   ========================================================================= */

/**
 * One line of the arithmetic — RULING D7-3 = 3A, 2026-08-24.
 *
 * "Hours removed · 460 h". A label and a value, and nothing else: an input
 * that needed a sentence to explain it is not an input, it is a second
 * calculation.
 */
export interface PortalSavingsInput {
  /**
   * React key. Required rather than positional: a caller re-orders these
   * whenever its own data changes and a positional key would carry the
   * wrong value over.
   */
  id: string;
  /** What went into the sum — "Hours removed", "Blended rate". */
  label: React.ReactNode;
  /**
   * What it was, already formatted — "460 h", "€45 / h". Drawn tabular and
   * pushed to the tile's inline end, because a column of figures a client is
   * meant to add up has to line up. Ruling R2.
   */
  value: React.ReactNode;
}

/**
 * The strip's SECOND figure — RULING D7-4, 2026-08-24. A count and its word,
 * and nothing else: "In build · 3". It carries no arithmetic because it is
 * not a calculation; it is a number of things, and a client can see the
 * things.
 */
export interface PortalFigure {
  /** Stable key. */
  id: string;
  /** What the number counts — "In build". */
  label: React.ReactNode;
  /** The number, already formatted. */
  value: React.ReactNode;
  /** The quiet line under it, if one is needed. */
  support?: React.ReactNode;
  /** The reader may see it. `false` renders NOTHING (ch24.6). */
  visible?: boolean;
  /** Open what the number counts. */
  onSelect?: () => void;
}

/* ============================================================================
   RULING D7-3 = 3A, 2026-08-24 — THE RULE FOR SHOWING A CALCULATION'S INPUTS
   ============================================================================
   CH27's closing paragraph owed "the rule for showing a calculation's
   inputs", and `verify/open.html` §C21 named the screen it blocked and the
   exact question, verbatim: "PH-5 already makes the figure and its
   explanation inseparable, so the number never appears alone — but the RULE
   for showing the inputs behind it is the part the artifact owes. Owed: does
   the client see the arithmetic, a sentence, or a link."

   The client answered `3A`, which `verify/decide-2.html` §D7 drew as "the
   arithmetic, always open": "The inputs sit under the figure permanently, as
   label / value pairs over a rule. Nothing is hidden and nothing has to be
   pressed." Its drawing, transcribed:

       Saved this quarter
       €18,400
       Hours removed            460 h
       Blended rate             €45 / h
       Licences retired         €2,700
       ────────────────────────────────
       Q3, to 24 Aug            €18,400

   THE ARITHMETIC IS NOW WHAT SATISFIES THE GUARANTEE, AND THAT IS A REAL
   CHANGE, NOT A RESTATEMENT. `inputs` is REQUIRED and `explanation` is now
   OPTIONAL — the exact reverse of what this file shipped yesterday. The
   reason is that 3B was the sentence and 3B is the REJECTED option: if prose
   still satisfied the requirement and the numbers were optional, a caller
   could ship 3B and the ruling would buy nothing. So the thing that cannot be
   left out is the thing the client ruled for. The guarantee itself is
   untouched in strength and is arguably stronger: an empty `inputs` deletes
   the FIGURE, exactly as an empty explanation used to, because a number
   nobody can check is worse than no number at all.

   `explanation` SURVIVES AS AN OPTIONAL SENTENCE, drawn between the figure
   and the arithmetic where `StatGrid` already puts the support line. 3A's
   drawing carries none, so nothing in the kit renders one by default; a
   caller with something to say that is not an input may still say it.

   THE TOTAL ROW IS THE PERIOD AND THE FIGURE, NOT A NEW PROP. The drawing's
   last line is "Q3, to 24 Aug · €18,400", which is `period` and `figure`,
   both of which already exist. It is drawn under the rule whenever there is
   a `period` — and ch27.11 requires one on every number in the system, so in
   practice always. With no period there is no rule either: a rule under
   nothing is a rule under nothing.

   WHAT THE DRAWING SAYS IT IS MADE OF, AND THE ONE PLACE THIS DEPARTS
   3A's own "Made of" line: "`StatGrid`'s tile with `DescriptionList` in place
   of the sparkline slot; the rule is `--hair-strong`, the figures are
   `tabular-nums` per ruling R2. No new component." All four are honoured —
   the pairs are a real `DescriptionList` in `StatItem.chart`, which is the
   sparkline slot, and no component is added. The one adjustment: the
   drawing pushes every value to the tile's INLINE END and `DescriptionList`
   left-aligns its value inside a `1fr` column. Rather than grow the
   component a per-item alignment it has never needed, the label track is
   `max-content` and each value node carries `block text-end` — so the figures
   line up at the edge the drawing lines them up at, and `DescriptionList` is
   unmodified.
   ========================================================================= */

/**
 * A saving, and how it was arrived at. ONE object, because the halves are
 * one claim: commission §9 item 10 requires the explanation "beside it", and
 * a component that accepted the number on its own would let a call site make
 * an unfalsifiable claim to a client.
 */
export interface PortalSavings {
  /** What the figure counts — "Hours saved", "Cost avoided". */
  label: React.ReactNode;
  /**
   * The figure itself, already formatted. A node, not a number: "38 h",
   * "€3,610" and "−4 h" all belong here and a component that formatted them
   * would have to know a locale and a currency it cannot see.
   */
  figure: React.ReactNode;
  /**
   * THE ARITHMETIC. RULING D7-3 = 3A: the inputs sit under the figure
   * permanently, as label / value pairs over a rule — "Hours removed · 460 h",
   * "Blended rate · €45 / h". Nothing is hidden and nothing has to be pressed.
   *
   * NOT OPTIONAL, and an empty list deletes the FIGURE rather than the
   * arithmetic. This is the prop PH-2 was owed and it is no longer owed.
   */
  inputs: readonly PortalSavingsInput[];
  /**
   * A sentence, if there is one worth saying that is not an input — "the
   * booking flow took the desk out of nineteen changes". OPTIONAL since
   * ruling D7-3: 3B was the sentence and 3B is the rejected option, so the
   * sentence can no longer stand in for the numbers. Drawn between the figure
   * and the arithmetic, in `StatGrid`'s own support slot.
   */
  explanation?: React.ReactNode;
  /**
   * The period the number belongs to — "this quarter", "since March".
   * ch27.11: every number is stated with its period.
   */
  period?: React.ReactNode;
  /**
   * The change since last period, already formatted and already signed. A
   * saving can regress and the portal keeps its axis when it does, so a
   * negative is drawn as the words say and never hidden.
   */
  delta?: React.ReactNode;
  /** Which way the change went. The words carry the meaning; the dot follows. */
  deltaDirection?: StatDeltaDirection;
  /** Open the records the figure was computed from. */
  onSelect?: () => void;
  /** The figure has not arrived. Never "0" — a total that is late is not zero. */
  loading?: boolean;
  /** The reader may see this figure. `false` renders NOTHING (ch24.6). */
  visible?: boolean;
}

/**
 * Is there actually something here? A required prop satisfies the compiler;
 * this satisfies the rule. Whitespace is not an explanation and neither is
 * `false`.
 */
function hasExplanation(node: React.ReactNode): boolean {
  if (node === undefined || node === null || node === false || node === true) return false;
  if (typeof node === "string") return node.trim().length > 0;
  if (typeof node === "number") return true;
  if (Array.isArray(node)) return node.some((child) => hasExplanation(child));
  return true;
}

/**
 * The sum's two tracks, at every width — and the flexible one is the LABEL,
 * not the figure. 3A's drawing says exactly this in its own CSS: the row is
 * `display: flex` with `min-inline-size: 0`, and the value is
 * `margin-inline-start: auto; flex: none` — the words give way, the number
 * never does. Built the other way round (`max-content 1fr`) the value track
 * measured **0px** at 380 against a 158.6 label, the figure overflowed its
 * cell by 3.4 and the total row stopped lining up with the inputs above it.
 * Both breakpoints are named so `DescriptionList`'s own `md:` rule, which is
 * right for a record's facts and wrong for a sum, does not come back at
 * 48rem.
 */
const ARITHMETIC_COLUMNS =
  "grid-cols-[minmax(0,1fr)_max-content] md:grid-cols-[minmax(0,1fr)_max-content] gap-x-4";

/**
 * Is there actually arithmetic here? RULING D7-3's guarantee, and it is the
 * same shape as the sentence guarantee it replaces: a caller reaching this
 * from untyped JavaScript with `inputs: []`, or with three rows whose values
 * are all blank, has not shown the client anything to check.
 */
function hasArithmetic(inputs: readonly PortalSavingsInput[] | undefined): boolean {
  if (inputs === undefined || inputs.length === 0) return false;
  return inputs.some(
    (input) => hasExplanation(input.label) && hasExplanation(input.value),
  );
}

export interface PortalSavingsFigureProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  /** The figure and its arithmetic, as one object. There is no second way in. */
  savings: PortalSavings;
  /** Accessible name for the block. */
  label?: string;
  /** Accessible name for the list of inputs. RULING D7-3. */
  inputsLabel?: string;
  /** Accessible name for the line under the rule. RULING D7-3. */
  totalLabel?: string;
}

/**
 * The savings tile, assembled in exactly one place — and it is the ONLY place
 * a savings figure is ever built. Returns `null` rather than a figure when
 * there is no arithmetic to check it against, which is RULING D7-3's
 * guarantee living in the one function both callers pass through.
 *
 * Not exported. `PortalSavingsFigure` draws it alone; `PortalHome` drops it
 * into the figure strip beside the second figure.
 *
 * TEN STATES — every one belongs to `StatGrid`'s tile, which already draws
 * them. This component chooses the tile's content and refuses to build it
 * without the sentence; it writes no fill, no ink, no radius and no size.
 *  1. default        — label, figure, explanation, period.
 *  2. hover          — `Card interactive`'s wash, and only with `onSelect`.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — the tile control's, when it is one.
 *  5. disabled       — does not apply. A figure the reader may not see is
 *                      ABSENT (`visible: false`), never dimmed — ch24.6.
 *  6. loading        — `loading`: the shell and the label stay, a `Skeleton`
 *                      stands where the number will be. The explanation is
 *                      still drawn, because it is true before the number is.
 *  7. empty          — no explanation: `null`, plus a development warning.
 *                      A figure with nothing behind it is not a quieter tile.
 *  8. error          — does not apply. A figure that failed to arrive is the
 *                      screen's `state="error"`, not a red number.
 *  9. selected       — does not apply.
 * 10. read-only      — always.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — one tile at full width, which is what an
 *  auto-fit grid of one does. The explanation wraps and is never truncated:
 *  a half-shown reason is the failure this whole component exists to prevent.
 *
 * RTL — LTR only by client ruling. Nothing here is directional.
 */
function savingsItem(
  savings: PortalSavings,
  inputsLabel: string,
  totalLabel: string,
): StatItem | null {
  if (savings.visible === false) return null;

  /* THE GUARANTEE, RE-POINTED BY RULING D7-3 AT THE ARITHMETIC. Not a warning
     that lets the number through — the number is what goes. Everything below
     this line has a sum to draw. */
  if (!hasArithmetic(savings.inputs)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "PortalHome: ruling D7-3 = 3A — a savings figure always shows the arithmetic behind it, as label / value pairs under the figure. The figure was dropped because there were no inputs to check it against.",
      );
    }
    return null;
  }

  /* 3A's pairs. `DescriptionList` in the sparkline slot, exactly as the
     drawing's own "Made of" line says — with the label track at its natural
     width and each value pushed to the tile's inline end, tabular, so a
     column of figures a client is meant to add up lines up. */
  const inputRows: DescriptionListItem[] = savings.inputs.map((input) => ({
    id: input.id,
    label: input.label,
    value: (
      <span className="block text-end tabular-nums">{input.value}</span>
    ),
  }));

  const arithmetic = (
    <span className="flex min-w-0 flex-col gap-[var(--space-1h)]">
      <DescriptionList
        items={inputRows}
        layout="rows"
        density="dense"
        /* AND IT STAYS TWO COLUMNS AT EVERY WIDTH. `layout="rows"` is
           `grid-cols-1` below 48rem — the label above its value — which is
           right for a record's facts and wrong for a sum: an arithmetic that
           stacks is an arithmetic nobody adds up. 3A's own drawing has no
           breakpoint (`.inputs div { display: flex }`), and these pairs are
           short enough to sit on one line at 380. `cn` lets a call site's
           class beat the component's, so this is one class rather than a
           change to `DescriptionList`. */
        className={cn(ARITHMETIC_COLUMNS)}
        aria-label={inputsLabel}
      />
      {savings.period === undefined ? null : (
        <>
          {/* The drawing's rule, and its own token: `--hair-strong`. A 1px
              rule is a FILL, never a border (PATTERN §9). */}
          <span aria-hidden="true" className="block h-px bg-hair-strong" />
          <DescriptionList
            items={[
              {
                id: "total",
                /* The last line is the period and the figure again. Both
                   already exist; neither is a new prop. */
                label: savings.period,
                value: (
                  <span className="block text-end tabular-nums">{savings.figure}</span>
                ),
              },
            ]}
            layout="rows"
            density="dense"
            className={cn(ARITHMETIC_COLUMNS)}
            aria-label={totalLabel}
          />
        </>
      )}
    </span>
  );

  const item: StatItem = {
    id: "savings",
    label: savings.label,
    value: savings.figure,
    /* The optional sentence, where the tile already draws its support line —
       between the figure and the arithmetic. 3A draws none by default. */
    support: hasExplanation(savings.explanation) ? savings.explanation : undefined,
    /* §9.3's sparkline slot, which is where 3A puts the sum. */
    chart: arithmetic,
    delta: savings.delta,
    deltaDirection: savings.deltaDirection,
    loading: savings.loading,
    onSelect: savings.onSelect,
  };

  return item;
}

/**
 * The savings figure, with its arithmetic under it — and never without.
 *
 * ONE TILE, BUILT IN ONE PLACE, AND SINCE RULING D7-4 THERE ARE TWO CALLERS.
 * `PortalHome`'s figure strip needs the savings tile INSIDE the same
 * `StatGrid` as the strip's second figure — 3A's own drawing is one
 * `repeat(auto-fit, minmax(7rem, 1fr))` grid, which is `StatGrid`'s grid —
 * so the tile is assembled by `savingsItem` above and both callers go through
 * it. That is deliberately NOT a second code path to the number: the guard is
 * in the builder, so neither caller can reach a figure without its sum, and
 * `savingsItem` is not exported. This component stays for the case where the
 * figure is drawn on its own.
 */
function PortalSavingsFigure({
  className,
  savings,
  label,
  inputsLabel = "How this figure was worked out",
  totalLabel = "The total",
  ...props
}: PortalSavingsFigureProps) {
  const item = savingsItem(savings, inputsLabel, totalLabel);
  if (item === null) return null;

  return (
    <StatGrid
      data-slot="portal-savings"
      className={cn(className)}
      items={[item]}
      label={label}
      {...props}
    />
  );
}

PortalSavingsFigure.displayName = "PortalSavingsFigure";

/* ============================================================================
   The screen
   ========================================================================= */

export interface PortalHomeProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "children" | "title"> {
  /**
   * The measure. `calm` by default — this screen only exists behind the
   * narrow door. Commission §9: "narrow, calm, larger type"; the type is the
   * root scale, see this file's header.
   */
  density?: ScreenDensity;
  /**
   * The mango flourish. On by default: ruling 05/06 scopes it to "auth,
   * splash and portal home", and this is the third of those three. It lies on
   * the SCREEN CARD — see this file's header for why it is no longer behind
   * the whole screen.
   */
  ambient?: boolean;

  /* ---- The shell. `MainScreen`'s, which is `ScreenShell`'s. ------------- */

  /** The navigation rail's contents. Placed by the shell, dropped narrow. */
  rail?: React.ReactNode;
  /** Accessible name for the rail. */
  railLabel?: string;
  /** `false` when the document already paints the off-beige page. */
  page?: boolean;

  /** The micro line over the heading. */
  eyebrow?: React.ReactNode;
  /** What the screen is called. */
  heading?: React.ReactNode;
  /** The quiet line under it. */
  meta?: React.ReactNode;
  /** Controls at the inline end of the heading row. The mango sits last. */
  actions?: React.ReactNode;
  /** The reader may act. `false` draws no actions at all, never a dead one. */
  actionsVisible?: boolean;

  /* ---- REGION 1 · the figure strip ------------------------------------
     RULING D7-4's first difference: TWO figures, not five. That is a type,
     not a guideline — the strip is the savings figure and AT MOST ONE more,
     because `figure` is singular. A client has no ticket queue to count and
     there is no third slot to put one in. */

  /**
   * The saving, and the arithmetic behind it. One object or none: there is
   * no way to pass the number by itself. See this file's header.
   *
   * FIRST TILE IN THE STRIP since ruling D7-4. It used to be the last band on
   * the screen; see the region-order note in this file's header for why the
   * reasoning that put it there no longer holds.
   */
  savings?: PortalSavings;
  /** Accessible name for the figure strip. */
  figuresLabel?: string;
  /** Accessible name for the savings tile's list of inputs. RULING D7-3. */
  savingsInputsLabel?: string;
  /** Accessible name for the savings tile's total line. RULING D7-3. */
  savingsTotalLabel?: string;
  /**
   * THE SECOND FIGURE, AND THERE IS NO THIRD. The proposal's "In build · 3".
   * Singular on purpose — see the note above.
   */
  figure?: PortalFigure;

  /* ---- REGION 4 · the progress bands ------------------------------------
     NOT ON THE HOME since ruling D7-4 — the home's deliverables became the
     strip's second figure ("In build · 3") and the list's delivered rows.
     `/impact` still passes them, because a report about numbers is not the
     landing screen and CH27.1's rule is that a screen may DROP a region, not
     that every screen has the same ones. */

  /** How the client's work is progressing. Dropped by the home. */
  deliveries?: readonly ProgressRow[];
  /** The band label over them. */
  deliveriesTitle?: React.ReactNode;
  /** Accessible name for the group. */
  deliveriesLabel?: string;
  /** The reader may see them. `false` renders NOTHING (ch24.6). */
  deliveriesVisible?: boolean;

  /* ---- REGION 2 · the folder tabs, WHICH ARE NOT HERE -------------------
     RULING D7-4's second difference, and it is an absence rather than a
     prop set to false: CH27.1 lets a screen drop the middle region and the
     portal has no folders. There is no `tabs` prop to pass. */

  /* ---- REGION 3 · the list -------------------------------------------- */

  /**
   * What we need from the client. ch27.41: "no queue mechanics at all" — so
   * this list takes no sort, no facets and no pager, and none is offered.
   * Each row's own `action` carries the one thing to press.
   *
   * DRAWN FIRST, ALWAYS. RULING D7-4's fourth difference — "the rows are
   * waiting-on-you first, then delivered; the portal's list is a to-do, not
   * a queue" — is structural: the two arrays are concatenated in this order
   * by the component and there is no slot that reverses them.
   */
  waiting?: readonly ListRow[];
  /**
   * What is already done, newest first. Drawn UNDER the waiting rows, in the
   * same list, because the drawing draws one list and not two.
   */
  delivered?: readonly ListRow[];
  /** The delivered rows may be seen. `false` renders NOTHING (ch24.6). */
  deliveredVisible?: boolean;
  /** The band label over the list. The drawing carries none. */
  waitingTitle?: React.ReactNode;
  /** Accessible name for the list. */
  waitingLabel?: string;
  /** A row was opened. The index is into the list as drawn. */
  onWaitingSelect?: (index: number, row: ListRow) => void;
  /** Nothing is waiting on them. The band renders its own quiet register. */
  waitingEmptyTitle?: React.ReactNode;
  /** The line under it. */
  waitingEmptyDescription?: React.ReactNode;

  /** Loading, empty or error. The heading stays drawn (ch27 law 4). */
  state?: ShapeState;
  /** Per-locale words. */
  copy?: Partial<ShapeStateCopy>;
  /** The retry on a block failure. */
  errorAction?: React.ReactNode;
  /** How many placeholder rows each band draws while it waits. */
  loadingRows?: number;
}

/**
 * The client's landing screen.
 *
 * TEN STATES
 *  1. default        — heading, the figure strip, the list, and (only where
 *                      a screen has them) the progress bands, in that order.
 *                      RULING D7-4.
 *  2. hover          — the row wash, owned by `List`, and only where a row
 *                      opens something.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — not drawn for a row: pressing one navigates, and the
 *                      acknowledgement is the destination (GAPS-COL3 LST-4).
 *  5. disabled       — does not apply. A client who may not act is passed no
 *                      action, which is ch24.6's rule and not a grey button.
 *  6. loading        — each band unfilled at its own row heights, the heading
 *                      and the band labels kept (ch27.6). Never a spinner.
 *  7. empty          — the screen: "Nothing is waiting on you". A band on its
 *                      own can be empty while the others are not, which is
 *                      law 4 applied inside a panel.
 *  8. error          — ruling 06's block failure, with the retry.
 *  9. selected       — does not apply. Nothing here is a choice.
 * 10. read-only      — the normal case. Nothing on this screen is editable.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — one column at every width, which is the point
 *  of the calm door: there is no second spine to collapse (ch27 law 1). The
 *  bands wrap their own contents, the savings tile fills its row, and the
 *  measure is `density`'s.
 *
 * RTL — LTR only by client ruling. Logical properties throughout.
 */
function PortalHome({
  className,
  density = "calm",
  ambient = true,
  rail,
  railLabel,
  page,
  eyebrow,
  heading,
  meta,
  actions,
  actionsVisible = true,
  savings,
  figuresLabel,
  savingsInputsLabel = "How this figure was worked out",
  savingsTotalLabel = "The total",
  figure,
  deliveries,
  deliveriesTitle,
  deliveriesLabel,
  deliveriesVisible = true,
  waiting,
  delivered,
  deliveredVisible = true,
  waitingTitle,
  waitingLabel,
  onWaitingSelect,
  waitingEmptyTitle,
  waitingEmptyDescription,
  state = "ready",
  copy,
  errorAction,
  loadingRows,
  ...props
}: PortalHomeProps) {
  const words = shapeCopy("portalHome", copy);
  const loading = state === "loading";

  /* REGION 1's contents, in the ruled order: the saving first, then the one
     other figure. `savingsItem` is the only builder for the first tile and it
     returns `null` rather than a number with no sum behind it, so a strip can
     lose its savings figure and still draw the count — which is right, and is
     not the same as drawing the number unexplained. */
  const savingsTile =
    savings === undefined
      ? null
      : savingsItem(
          loading ? { ...savings, loading: true } : savings,
          savingsInputsLabel,
          savingsTotalLabel,
        );
  const figures: StatItem[] = [
    ...(savingsTile === null ? [] : [savingsTile]),
    ...(figure === undefined || figure.visible === false
      ? []
      : [
          {
            id: figure.id,
            label: figure.label,
            value: figure.value,
            support: figure.support,
            loading: loading || undefined,
            onSelect: figure.onSelect,
          } satisfies StatItem,
        ]),
  ];

  /* REGION 3's rows. Waiting first, then delivered — the order is made here
     so a call site cannot make it anything else (RULING D7-4, difference
     four). ch24.6: a client who may not see the delivered rows is passed a
     list without them, never a dimmed one. */
  const deliveredRows = deliveredVisible ? (delivered ?? []) : [];
  const rows =
    waiting === undefined && delivered === undefined
      ? undefined
      : [...(waiting ?? []), ...deliveredRows];

  /* Law 4's one exception does not apply here, so the heading always stays
     drawn and only the bands swap. An error or an empty screen replaces the
     three bands together, because a client with nothing waiting does not need
     to be told three times. */
  const bands =
    state === "error" || state === "empty" ? (
      <ShapeStateBody
        shape="portalHome"
        state={state}
        copy={copy}
        action={state === "error" ? errorAction : undefined}
      />
    ) : (
      <>
        {/* REGION 1 · THE FIGURE STRIP. CH27.1's first region, and RULING
            D7-4's first and third differences at once: two figures, and the
            savings figure carries its arithmetic inside its own tile.

            ONE `StatGrid`, not two. 3A's drawing is a single
            `repeat(auto-fit, minmax(7rem, 1fr))` grid, which is `StatGrid`'s
            own grid, so the tiles share a row and a height instead of being
            two strips that happen to sit next to each other. */}
        {figures.length === 0 ? null : (
          <StatGrid
            data-slot="portal-home-figures"
            items={figures}
            label={figuresLabel}
          />
        )}

        {/* REGION 2 · THE FOLDER TABS. Not drawn, and not droppable-by-prop:
            there is nothing here to drop. CH27.1 makes the middle region
            optional and the portal has no folders (RULING D7-4, difference
            two). This comment is the region. */}

        {/* REGION 3 · THE LIST. CH27.1's collection panel, with the portal's
            contents: what we need from them first, then what is done
            (RULING D7-4, difference four). ONE list, because the drawing
            draws one — the two arrays are joined HERE, in this order, and no
            prop reverses them. ch27.41's "no queue mechanics at all" still
            holds: no toolbar, no tabs, no sort, no pager. */}
        {rows === undefined ? null : (
          <section
            data-slot="portal-home-waiting"
            className="flex min-w-0 flex-col gap-3"
          >
            {waitingTitle === undefined ? null : (
              <Title as="h3" size="h4" rule={false}>
                {waitingTitle}
              </Title>
            )}
            <List
              rows={rows}
              label={waitingLabel}
              state={loading ? "loading" : "ready"}
              loadingLines={loadingRows}
              loadingLabel={words.loadingLabel}
              emptyTitle={waitingEmptyTitle ?? words.emptyTitle}
              emptyDescription={waitingEmptyDescription ?? words.emptyDescription}
              onRowSelect={onWaitingSelect}
            />
          </section>
        )}

        {/* REGION 4 · THE PROGRESS BANDS, for the screen that has them.
            `/impact`'s measures. The HOME drops this region entirely — its
            deliverables are the strip's count and the list's delivered rows
            (RULING D7-4). The ORDER is still the component's: a call site
            chooses which regions it has, never where they sit, which is
            CH27.1's own rule ("a collection may drop the figure strip; it may
            not reorder what remains"). */}
        {deliveries === undefined ? null : (
          <ProgressDashboard
            data-slot="portal-home-deliveries"
            rows={deliveries}
            title={deliveriesTitle}
            label={deliveriesLabel}
            visible={deliveriesVisible}
            state={loading ? "loading" : "ready"}
            loadingRows={loadingRows}
            loadingLabel={words.loadingLabel}
          />
        )}
      </>
    );

  return (
    <MainScreen
      data-slot="portal-home"
      data-density={density}
      data-state={state}
      className={className}
      door="portal"
      density={density}
      rail={rail}
      railLabel={railLabel}
      page={page}
      /* Ruling 05/06 — the flourish is allowed on exactly three screens and
         this is one of them. A node, so the ruling's scope lives at the three
         call sites that have it rather than in a flag every screen can reach.
         Decoration: aria-hidden and click-through, both the component's own. */
      ambient={ambient ? <AmbientBackground variant="brand" /> : undefined}
      eyebrow={eyebrow}
      title={heading}
      meta={meta}
      actions={actions}
      actionsVisible={actionsVisible}
      /* NO CREATE, AND NO PROP THAT COULD ADD ONE. A client does not create
         anything from their landing screen; `SHELL.md`'s mango `+` belongs to
         a collection this screen does not have. */
      /* THE PANEL IS DRAWN, because one of the three bands is a raised card
         and a raised card on off-beige measures 1.000. See this file's
         header. No toolbar and no folder tab come with it: none is passed,
         which is ch27.41's "no queue mechanics at all". */
      state={state}
      body={bands}
      {...props}
    />
  );
}

PortalHome.displayName = "PortalHome";

export { PortalHome, PortalSavingsFigure };
