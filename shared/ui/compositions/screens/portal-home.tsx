"use client";

/* ============================================================================
   PortalHomeRoute — `/home` in the client portal.

   THE SHAPE
   `PortalHome` (shape 10 of the twelve), `density="calm"`.

   THE TWO DOORS ARE DELIBERATELY DIFFERENT — WHAT THAT MEANS HERE
   Commission §9: "The system app is dense, wide, and used all day by staff.
   The portal is narrow, calm, larger type, and used occasionally by clients.
   They should read as one family and never as one screen with a different
   logo." In this file that is four concrete things and no fifth:
     1. `density="calm"` — the narrow centred measure and the quieter heading
        step, both from `SHAPE_SHELL` / `SHAPE_HEADING_SIZE`.
     2. No table, no tabs, no sort control, no pager, no facets. A
        client is not working a queue (ch27.41).
     3. Three things only (ch27.34), and the first region is the one they can
        act on.
     4. THE LARGER TYPE IS NOT HERE. It is the root `data-scale="large"` the
        application sets, exactly as GAPS-SHAPES2 PH-1 settled. Not one type
        step is bumped in this file, and doing so for one door would fork the
        ladder for every component in the system.

   RULING D7-4, 2026-08-24 — "your proposal i like it"
   THE KIT NOW DRAWS THIS SCREEN, AND THE LAYOUT IS CH27.1'S, NOT RULING G'S.
   Ruling G settled which FILE is the SYSTEM's home; it never settled a
   layout, and citing it for one would be citing the wrong ruling. The order
   comes from CH27.1, which predates it: "Figures, folder tabs, then the
   collection panel … A collection may drop the figure strip; it may not
   reorder what remains."

   THE FOUR DIFFERENCES THE CLIENT APPROVED, and where each one is in this
   file:
     1. TWO FIGURES, NOT FIVE — `savings` and one `figure`. The shape's
        `figure` prop is singular, so there is no third to pass.
     2. NO FOLDER TABS — no `tabs` prop exists on the shape. An absence.
     3. THE SAVING CARRIES ITS EXPLANATION INSIDE THE TILE — and since ruling
        D7-3 the explanation is the arithmetic, which is `DEFAULT_SAVINGS`
        below and reconciles exactly.
     4. WAITING-ON-YOU FIRST, THEN DELIVERED — one list. This route hands the
        shape two arrays; the shape joins them in that order and this file
        cannot swap them.

   WHAT LEFT THIS SCREEN. The progress bands. Their COUNT is now the strip's
   second figure and their finished items are the list's delivered rows, which
   is what the proposal draws. Nothing was deleted from the kit:
   `ProgressDashboard` is still region 4 of the shape and `/impact` still
   passes it, and `/deliverables` is where a client reads one in full.

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" chapter 27.1 for the region order, and the rules
   the kit states about the portal for the contents.

     ch27.41, doors differ, verbatim: "Clients never see this. The portal
       equivalent is 'waiting on you', which lists the three things it needs
       from them with no queue mechanics at all."

     ch27.34, doors differ, verbatim: "The portal notifies on three things
       only: kwapso replied, a deliverable is ready to review, and we are
       waiting on you. No assignments, no mentions, no automations."

     ruling 05/06, verbatim: "The mango ambient field stays, scoped to auth,
       splash and portal home." This is the third of those three, so `ambient`
       is left at the shape's default of on. It is off on every other portal
       route in this batch.

   THE LAW THIS FILE OBEYS
   · THE SAVINGS FIGURE ALWAYS RENDERS ITS ARITHMETIC. The shape makes that
     structurally unbreakable — one `savings` object whose `explanation` is
     not optional — and this route does not route around it: there is no
     second path to the number in this file, and the explanation names the
     inputs in words a client can check.
   · ONE MANGO (law 2). The heading's "Ask for something" is it. Every row's
     own control is the paper secondary, because five mango buttons down a
     list is the failure the Badge ruling of 2026-08-22 already named.
   · NO QUEUE MECHANICS. Not defaulted off — absent. The shape offers no sort,
     no facets and no pager for the waiting list.
   · EVERY USER-FACING STRING IS A PROP (PATTERN §7).
   · No fill, no radius, no ring and no type step is written in this file.

   RENDERING CONTEXT
   `"use client"`. Row handlers are built during this module's own render.
   ========================================================================= */

import * as React from "react";

import { Button } from "../../components/button/button";
import type { ListRow } from "../../components/list/list";
import { PortalHome } from "../templates";
import type { PortalSavings } from "../templates";
import type { ShapeState, ShapeStateCopy } from "../states";

/** Every user-facing string on this route. */
export interface PortalHomeLabels {
  eyebrow: string;
  heading: string;
  meta: string;
  primary: string;
  retry: string;
  review: string;
  /** Accessible name for the two-figure strip. */
  figuresLabel: string;
  /** The second figure's word. RULING D7-4: there is no third. */
  inBuildLabel: string;
  waitingLabel: string;
  waitingEmptyTitle: string;
  waitingEmptyDescription: string;
  /** What a delivered row's meta reads. */
  deliveredMeta: string;
  /** What a waiting row's meta reads. */
  waitingMeta: string;
}

const DEFAULT_LABELS: PortalHomeLabels = {
  eyebrow: "Nordlicht Sport",
  heading: "Your work with kwapso",
  meta: "Everything on this page is yours. Nothing here is a queue.",
  primary: "Ask for something",
  retry: "Retry",
  review: "Review",
  figuresLabel: "Where you stand",
  inBuildLabel: "In build",
  waitingLabel: "Waiting on you, then what is done",
  waitingEmptyTitle: "Nothing is waiting on you",
  waitingEmptyDescription: "We will say so here the moment we need something.",
  deliveredMeta: "delivered",
  waitingMeta: "waiting on you",
};

const DEFAULT_COPY: Partial<ShapeStateCopy> = {
  emptyTitle: "Nothing is waiting on you",
  emptyDescription: "We will say so here the moment we need something.",
  errorDescription: "We could not load your page. Try again, or write to us in a request.",
};

/**
 * Three things, which is ch27.34's whole list. Each row's control is the one
 * thing to press and it is never mango.
 */
function defaultWaiting(
  review: string,
  waitingMeta: string,
  onReview?: (id: string) => void,
): ListRow[] {
  const control = (id: string) =>
    onReview === undefined ? undefined : (
      <Button variant="secondary" onClick={() => { onReview(id); }}>
        {review}
      </Button>
    );
  return [
    {
      id: "w-1",
      title: "The booking confirmation wording",
      description: "We rewrote it after last week's sitting. Read it and say yes or tell us what to change.",
      /* RULING D7-4's drawing puts the STATE in the row's meta — "waiting on
         you" against "delivered · 21 Aug" — because the list is one list and
         a reader has to be able to tell the two kinds of row apart without a
         heading between them. The age rides with it. */
      meta: `${waitingMeta} · 2 days`,
      action: control("w-1"),
    },
    {
      id: "w-2",
      title: "September's trainer list",
      description: "We need the names before the roster can be switched on.",
      meta: `${waitingMeta} · 5 days`,
      action: control("w-2"),
    },
    {
      id: "w-3",
      title: "Invoice numbering, one decision",
      description: "Restart each month, or run on through the year. Either works; we need you to pick.",
      meta: `${waitingMeta} · 6 days`,
      action: control("w-3"),
    },
  ];
}

/**
 * WHAT IS ALREADY DONE — RULING D7-4's fourth difference. These sit UNDER the
 * waiting rows in the SAME list; the ordering is the shape's, not this file's.
 *
 * The progress bands that used to be a region of their own are gone from this
 * screen: their count is the strip's second figure and their finished items
 * are these rows. `/deliverables` is where a client reads a deliverable in
 * full, and `/impact` still draws progress bands, so nothing was deleted —
 * this screen dropped a region, which is what CH27.1 lets a screen do.
 */
function defaultDelivered(deliveredMeta: string): ListRow[] {
  return [
    {
      id: "dv-1",
      title: "Member sign-up screen",
      description: "Live since Thursday. 46 people have used it so far.",
      meta: `${deliveredMeta} · 21 Aug`,
    },
    {
      id: "dv-2",
      title: "Onboarding pack",
      description: "The six pages your new trainers get on their first day.",
      meta: `${deliveredMeta} · 14 Aug`,
    },
  ];
}

/**
 * The figure and the arithmetic behind it, as ONE object. There is no way to
 * pass the number by itself, and this route does not try.
 *
 * RULING D7-3 = 3A, 2026-08-24: the client sees the sum, always open. So the
 * rows below are a sum that ACTUALLY ADDS UP, and that is not a detail — the
 * moment the inputs are on the screen a client will add them, and fictional
 * content that does not reconcile teaches the reader to stop checking.
 * 19 x 2 h 15 = 42 h 45; 42 h 45 less 4 h 45 = 38 h exactly.
 */
const DEFAULT_SAVINGS: PortalSavings = {
  label: "Hours given back",
  figure: "38 h",
  inputs: [
    { id: "changes", label: "Booking changes handled", value: "19" },
    { id: "each", label: "Each used to take", value: "2 h 15" },
    { id: "removed", label: "Desk time removed", value: "42 h 45" },
    { id: "review", label: "Your team's review time", value: "\u2212 4 h 45" },
  ],
  period: "This quarter, to 22 Aug",
  delta: "+6 h on last quarter",
  deltaDirection: "up",
};

export interface PortalHomeRouteProps {
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
  /** The things we need from them. Drawn FIRST in the one list. */
  waiting?: readonly ListRow[];
  /** What is already done. Drawn UNDER the waiting rows, same list. */
  delivered?: readonly ListRow[];
  /** The reader may see the delivered rows. `false` renders NOTHING (ch24.6). */
  deliveredVisible?: boolean;
  /** How many pieces of work are in build — the strip's second figure. */
  inBuild?: React.ReactNode;
  /** The reader may see the second figure. `false` renders NOTHING (ch24.6). */
  inBuildVisible?: boolean;
  /** The saving, and the arithmetic behind it. One object or none. */
  savings?: PortalSavings;
  /** Loading, empty or error. */
  state?: ShapeState;
  /** Per-locale words for the registers. */
  copy?: Partial<ShapeStateCopy>;
  /** Per-locale words for the screen. */
  labels?: Partial<PortalHomeLabels>;

  /** Open one of the waiting items. */
  onWaitingSelect?: (index: number, row: ListRow) => void;
  /** Press a waiting row's own control. */
  onReview?: (id: string) => void;
  /** Raise a request. The screen's one mango. */
  onAsk?: () => void;
  /** The client may act at all. `false` draws no actions (ch24.6). */
  actionsVisible?: boolean;
  /** Try again after a failure. */
  onRetry?: () => void;
}

/**
 * The client's landing screen.
 *
 * TEN STATES — `PortalHome`'s. This route decides the words, the three rows
 * and the fact that no row control is mango.
 *
 * THREE BREAKPOINTS — one column at every width. That is the point of the
 * calm door: there is no second spine to collapse (ch27 law 1).
 *
 * RTL — LTR only by client ruling.
 */
function PortalHomeRoute({
  rail,
  railLabel,
  waiting,
  delivered,
  deliveredVisible = true,
  inBuild = "3",
  inBuildVisible = true,
  savings = DEFAULT_SAVINGS,
  state = "ready",
  copy,
  labels,
  onWaitingSelect,
  onReview,
  onAsk,
  actionsVisible = true,
  onRetry,
}: PortalHomeRouteProps) {
  const words: PortalHomeLabels = { ...DEFAULT_LABELS, ...labels };

  return (
    <PortalHome
      rail={rail}
      railLabel={railLabel}
      density="calm"
      /* Ruling 05/06 — the flourish is allowed on exactly three screens and
         the portal home is one of them. Every other portal route in this
         batch switches it off. */
      ambient
      eyebrow={words.eyebrow}
      heading={words.heading}
      meta={words.meta}
      actions={onAsk === undefined ? undefined : <Button onClick={onAsk}>{words.primary}</Button>}
      actionsVisible={actionsVisible}
      /* REGION 1 — two figures and no more. The saving carries its own
         arithmetic (ruling D7-3); the count carries nothing, because it is a
         number of things rather than a calculation. */
      savings={savings}
      figuresLabel={words.figuresLabel}
      figure={{
        id: "in-build",
        label: words.inBuildLabel,
        value: inBuild,
        visible: inBuildVisible,
      }}
      /* REGION 2 — the tabs. There is no prop, which is the point. */
      /* REGION 3 — one list: what we need from them, then what is done. The
         ORDER is the shape's; this route supplies two arrays and cannot
         swap them. */
      waiting={waiting ?? defaultWaiting(words.review, words.waitingMeta, onReview)}
      delivered={delivered ?? defaultDelivered(words.deliveredMeta)}
      deliveredVisible={deliveredVisible}
      waitingLabel={words.waitingLabel}
      onWaitingSelect={onWaitingSelect}
      waitingEmptyTitle={words.waitingEmptyTitle}
      waitingEmptyDescription={words.waitingEmptyDescription}
      /* REGION 4 — the progress bands. NOT PASSED. Ruling D7-4 folds this
         screen's deliverables into the count above and the delivered rows
         below; `/impact` is the screen that still draws bands. */
      state={state}
      copy={{ ...DEFAULT_COPY, ...copy }}
      errorAction={
        onRetry === undefined ? undefined : (
          <Button variant="secondary" onClick={onRetry}>
            {words.retry}
          </Button>
        )
      }
    />
  );
}

PortalHomeRoute.displayName = "PortalHomeRoute";

export { PortalHomeRoute };
