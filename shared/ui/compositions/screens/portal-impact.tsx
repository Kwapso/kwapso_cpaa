"use client";

/* ============================================================================
   PortalImpactRoute — `/impact` in the client portal: what the work changed,
   and the arithmetic behind the claim.

   THE SHAPE
   `PortalHome` (shape 10 of the twelve), `density="calm"`, `ambient={false}`.

   WHY THIS ROUTE USES THE PORTAL-HOME SHAPE
   Because of the one rule that governs this screen more than any other: THE
   SAVINGS FIGURE ALWAYS RENDERS ITS EXPLANATION. That guarantee is built into
   `PortalHome` / `PortalSavingsFigure` three ways at once — there is no
   `figure` prop, `explanation` is not optional in the type, and an empty
   explanation deletes the NUMBER rather than the sentence. An impact screen
   assembled out of a `StatStrip` and some prose would have routed around all
   three, and the commission says in as many words not to. So the shape is
   reused rather than replaced, and the two regions this route needs — the
   measures and the saving — are the shape's own second and third bands.

   WHAT IS DIFFERENT FROM `/home`, AND WHY
     · NO "WAITING ON YOU" BAND. This screen is a report, not a to-do list.
       `waiting` is not passed, so the region is absent rather than empty.
     · `ambient={false}`. Ruling 05/06 scopes the mango field to "auth, splash
       and portal home" — three screens, and this is not one of them.
     · The heading and the band labels are this screen's.

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" chapter 27.11 and chapter 4.

     ch27.11 on stating a period, verbatim: "Every other number in the system
       is stated with the period it belongs to — this week, W34, today — and
       never moves while you look at it."

     ch27.11, doors differ, verbatim: "The portal's dashboard shows only that
       client's own numbers, drops Retainer used unless their contract has
       one, and never shows team, owner or capacity figures."

     chapter 4 on a saving that goes the wrong way, verbatim: "A negative bar
       — the portal keeps its axis because savings can regress — is poppy at
       each mode's value."

   THE LAW THIS FILE OBEYS
   · A SAVING THAT REGRESSED IS STILL DRAWN. `delta` and `deltaDirection` take
     whatever the quarter actually did; there is no branch in this file that
     hides a bad number, and the axis stays (chapter 4).
   · EVERY NUMBER CARRIES ITS PERIOD (ch27.11), in the same object as the
     number, so the two cannot be separated by a layout change.
   · THE EXPLANATION NAMES ITS INPUTS in words a client can check with a
     calculator. The kit still owes "the rule for showing a calculation's
     inputs" (GAPS-SHAPES2 PH-2), so the shape of that sentence is this
     route's, and it is a sentence rather than a formula.
   · NO CHART. Never more than three series anywhere, and the safest way to
     obey that on a screen about one number is to plot nothing.
   · ONE MANGO (law 2): "Ask about these numbers", which is also the honest
     invitation — a figure a client cannot question is a boast.
   · EVERY USER-FACING STRING IS A PROP (PATTERN §7).
   · No fill, no radius, no ring and no type step is written in this file.

   RENDERING CONTEXT
   `"use client"`. Handlers are built during this module's own render.
   ========================================================================= */

import * as React from "react";

import { Button } from "../../controls/button/button";
import type { ProgressRow } from "../../structures/progress-dashboard/progress-dashboard";
import { PortalHome } from "../templates";
import type { PortalSavings } from "../templates";
import type { ShapeState, ShapeStateCopy } from "../states";

/** Every user-facing string on this route. */
export interface PortalImpactLabels {
  eyebrow: string;
  heading: string;
  meta: string;
  primary: string;
  retry: string;
  measuresTitle: string;
  measuresLabel: string;
  savingsLabel: string;
  savingsInputsLabel: string;
  savingsTotalLabel: string;
}

const DEFAULT_LABELS: PortalImpactLabels = {
  eyebrow: "Nordlicht Sport",
  heading: "What the work changed",
  meta: "Every number here is for this quarter, and every one is explained.",
  primary: "Ask about these numbers",
  retry: "Retry",
  measuresTitle: "The measures you set",
  measuresLabel: "Measures",
  savingsLabel: "Hours given back this quarter",
  savingsInputsLabel: "How this figure was worked out",
  savingsTotalLabel: "The total",
};

const DEFAULT_COPY: Partial<ShapeStateCopy> = {
  emptyTitle: "Nothing to report yet",
  emptyDescription: "The first quarter's numbers appear here once there is a quarter to compare.",
  errorDescription: "We could not load your numbers. Try again, or ask us for them in a request.",
};

/**
 * The measures the client themselves set, each as a progress row with a real
 * denominator. A measure with no denominator is a sentence, not a bar, and
 * belongs in the explanation below rather than here.
 */
const DEFAULT_MEASURES: ProgressRow[] = [
  {
    id: "calls",
    label: "Calls to the desk about bookings",
    value: 31,
    max: 74,
    display: "31 a week, from 74",
  },
  {
    id: "forms",
    label: "Sign-ups finished in one sitting",
    value: 61,
    max: 100,
    display: "61% this month",
  },
  {
    id: "roster",
    label: "Shift swaps needing a manager",
    value: 3,
    max: 22,
    display: "3 this month, from 22",
  },
];

/**
 * The figure and the arithmetic behind it, as ONE object.
 *
 * RULING D7-3 = 3A, 2026-08-24: the inputs are rows now rather than a
 * sentence, and they reconcile — 19 x 2 h 15 = 42 h 45, less 4 h 45 = 38 h.
 * Same figure and same rows as the portal home, deliberately: two screens
 * quoting one number must quote one sum with it.
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

export interface PortalImpactRouteProps {
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
  /** The measures, each with a real denominator. */
  measures?: readonly ProgressRow[];
  /** The client may see them. `false` renders NOTHING (ch24.6). */
  measuresVisible?: boolean;
  /**
   * The saving and the words that explain it. One object or none — there is
   * no way to pass the number by itself, and this route does not offer one.
   */
  savings?: PortalSavings;
  /** Loading, empty or error. */
  state?: ShapeState;
  /** Per-locale words for the registers. */
  copy?: Partial<ShapeStateCopy>;
  /** Per-locale words for the screen. */
  labels?: Partial<PortalImpactLabels>;

  /** Raise a question about the numbers. The screen's one mango. */
  onAsk?: () => void;
  /** The client may act. `false` draws no actions at all (ch24.6). */
  actionsVisible?: boolean;
  /** Try again after a failure. */
  onRetry?: () => void;
}

/**
 * The client's impact report.
 *
 * TEN STATES — `PortalHome`'s. The one this route adds nothing to and takes
 * nothing from: a loading savings tile keeps its label AND its explanation
 * while the number is missing, because the sentence is true before the number
 * is — that is the shape's behaviour and this route relies on it.
 *
 * THREE BREAKPOINTS — one column at every width inside the calm measure. The
 * explanation wraps and is never truncated: a half-shown reason is the exact
 * failure the savings component exists to prevent.
 *
 * RTL — LTR only by client ruling.
 */
function PortalImpactRoute({
  rail,
  railLabel,
  measures = DEFAULT_MEASURES,
  measuresVisible = true,
  savings = DEFAULT_SAVINGS,
  state = "ready",
  copy,
  labels,
  onAsk,
  actionsVisible = true,
  onRetry,
}: PortalImpactRouteProps) {
  const words: PortalImpactLabels = { ...DEFAULT_LABELS, ...labels };

  return (
    <PortalHome
      rail={rail}
      railLabel={railLabel}
      density="calm"
      /* Ruling 05/06 — the flourish belongs to auth, splash and portal home.
         This is a fourth screen, so it does not get one. */
      ambient={false}
      eyebrow={words.eyebrow}
      heading={words.heading}
      meta={words.meta}
      actions={onAsk === undefined ? undefined : <Button onClick={onAsk}>{words.primary}</Button>}
      actionsVisible={actionsVisible}
      /* REGION 1 — the saving, which on this screen is the whole subject.
         Since ruling D7-4 the figure strip is the FIRST region on this shape,
         and for a report that is right: the boast argument that used to put
         it last was about placing a figure above something a client is
         BLOCKED on, and this screen has no waiting rows at all. */
      savings={savings}
      figuresLabel={words.savingsLabel}
      savingsInputsLabel={words.savingsInputsLabel}
      savingsTotalLabel={words.savingsTotalLabel}
      /* REGION 3 — no list. This screen is a report, not a to-do list, so the
         region is absent rather than drawn empty. */
      /* REGION 4 — the measures. `/impact` is the screen that still draws
         progress bands; the home dropped them (ruling D7-4). */
      deliveries={measures}
      deliveriesTitle={words.measuresTitle}
      deliveriesLabel={words.measuresLabel}
      deliveriesVisible={measuresVisible}
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

PortalImpactRoute.displayName = "PortalImpactRoute";

export { PortalImpactRoute };
