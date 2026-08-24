/* ============================================================================
   Shape states — the loading, empty and error version of every shape in this
   folder (imported by all eleven of them; shape 12 of 12).

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" chapter 27, four compositions and one law:

     ch27 · Law 4 · A state is a body swap, verbatim:
       "Loading, empty and archived are the same composition with the body
        replaced; adding, editing and denial are the same composition with a
        layer over it. Either way the rail, header and tabs stay drawn and
        stay put. Only a whole-page failure is allowed to replace the frame."

     ch27.6 loading, verbatim: "A loading screen in kwapso is the destination
       screen with its body unfilled. Rail, header, title and tabs render
       immediately from what the app already knows, so the page never appears
       to be built twice." And what it forbids: "A centred spinner on an empty
       page, a percentage that isn't real, a 'please wait' sentence."

     ch27.21 empty and ch27.22 no-results are DIFFERENT SCREENS and the kit
       says so: "It is a different screen from 27.21 and must never be
       mistaken for it: nothing here is missing, something here is switched
       on." Empty carries the one mango create; no-results carries no mango
       at all, "because clearing filters is a retreat".

     ch27.23 not found: the frame stays. "Only a whole-page failure or a dead
       session (27.19) may replace the frame."

   THE LAW THIS FILE OBEYS
   · IT NEVER DRAWS A REGISTER OF ITS OWN. `ScreenRegister` (tier 2) already
     draws all four tones with the marks ruled in GAPS-COL3 SCR-4. This file
     chooses the tone and supplies the words; it writes no layout, no ink and
     no mark.
   · EMPTY AND NO-RESULTS ARE NEVER THE SAME REGISTER. `filtered` picks the
     tone, and the two carry different copy and different actions, because
     ch27.22 says offering "Add a record" to somebody whose filter is too
     narrow makes them create a duplicate.
   · A STATE IS THE BODY, NEVER THE FRAME. `ShapeStateBody` returns the body
     only. Every shape here keeps its heading, tabs and toolbar drawn while
     it is in one of these states — that is law 4, and each shape enforces it
     by passing `state` down to the collection that owns its body rather than
     replacing itself.
   · ONE COPY OBJECT PER SHAPE, NOT THIRTY PROPS. PATTERN §7 requires every
     user-facing string to be a prop with a default. Eleven shapes × eight
     strings is eighty-eight props, so each shape takes one `copy` prop of
     `Partial<ShapeStateCopy>` merged over its default. Every string is still
     overridable per locale, which is the rule's actual purpose.
   · Focus is one global rule. No radius, no colour and no size is decided
     here — this file is words and routing.

   WHY THE SHELL MEASURE LIVES HERE
   `SHAPE_SHELL` is the two-door measure from commission §9, copied from
   `ScreenRenderer`'s own map so the two can never drift. It sits in this file
   because this is the module every other shape already imports; a thirteenth
   file for one record of two strings would be worse. Logged as SHP-1 in
   GAPS-SHAPES.md.

   RENDERING CONTEXT
   No `"use client"`. This module holds no state, calls no hook and creates no
   handler during its own render.
   ========================================================================= */

import * as React from "react";

import {
  ScreenRegister,
  type ScreenDensity,
  type ScreenRegisterTone,
  type ScreenState,
} from "../../structures/screen-renderer/screen-renderer";

/**
 * The four states a shape can be in. Deliberately the SAME type
 * `ScreenRenderer` already publishes rather than a second vocabulary: a
 * shape's state and a screen's state are the same thing and must stay so.
 */
export type ShapeState = ScreenState;

/** The eleven shapes this file carries the states for. */
export type ShapeName =
  | "recordChrome"
  | "collectionScreen"
  | "statStrip"
  | "stepperHero"
  | "formScreen"
  | "assistant"
  | "signIn"
  | "importFlow"
  | "searchResults"
  | "portalHome"
  | "portalConversation";

/** Every user-facing string a shape's three states need. */
export interface ShapeStateCopy {
  /** Announced while the body is unfilled. Never drawn — ch27.6 forbids a "please wait" sentence. */
  loadingLabel: string;
  /** Nothing has been created yet. ch27.21. */
  emptyTitle: string;
  /** ch27.21: "One sentence naming the two routes". */
  emptyDescription: string;
  /** Things exist; a filter or a term excluded them. ch27.22. */
  noResultsTitle: string;
  /** ch27.22: name the cause, not the absence. */
  noResultsDescription: string;
  /** Ruling 06's block-level failure. */
  errorTitle: string;
  /** What to do next, in one line. */
  errorDescription: string;
  /** The label on the retry control a call site may pass as `action`. */
  retryLabel: string;
}

/* The kit's own words wherever it has them. `errorTitle` is ruling 06's
   sentence verbatim; `emptyDescription` for a collection is ch27.21's
   verbatim "Records land here when someone adds one, or when a client raises
   a request." Where the kit draws no copy — the assistant, the portal home —
   the sentence is written to the same law (say what happened, then the one
   next step, ch21's subtitle) and logged in GAPS-SHAPES.md. */
const ERROR_TITLE = "We can't show this right now";
const ERROR_BODY = "Try again, or come back in a moment.";
const RETRY = "Retry";
const LOADING = "Loading…";

function copyFor(partial: Partial<ShapeStateCopy>): ShapeStateCopy {
  return {
    loadingLabel: LOADING,
    emptyTitle: "Nothing here yet",
    emptyDescription: "",
    noResultsTitle: "No matches",
    noResultsDescription: "Close a filter to see more.",
    errorTitle: ERROR_TITLE,
    errorDescription: ERROR_BODY,
    retryLabel: RETRY,
    ...partial,
  };
}

/**
 * The default words for each shape, per state. Every one is overridable
 * through the shape's own `copy` prop, which is how a locale replaces them.
 */
export const SHAPE_STATE_COPY: Record<ShapeName, ShapeStateCopy> = {
  recordChrome: copyFor({
    emptyTitle: "This tab has nothing in it yet",
    emptyDescription: "It fills as work happens on this record.",
    noResultsTitle: "Nothing matches here",
  }),
  collectionScreen: copyFor({
    emptyTitle: "Nothing here yet",
    /* ch27.21, verbatim. */
    emptyDescription:
      "Records land here when someone adds one, or when a client raises a request.",
    noResultsTitle: "No records match",
    /* ch27.22: name the total and the narrowest facet. A call site with the
       numbers should pass a sentence that carries them. */
    noResultsDescription: "Every record is filtered out. Close a filter to see them again.",
  }),
  statStrip: copyFor({
    emptyTitle: "No figures yet",
    emptyDescription: "Numbers appear once there is something to count.",
    noResultsTitle: "No figures for this period",
  }),
  stepperHero: copyFor({
    emptyTitle: "No stages set",
    emptyDescription: "A record shows its progression once it has one.",
  }),
  formScreen: copyFor({
    emptyTitle: "Nothing to fill in",
    emptyDescription: "This form has no fields for you.",
  }),
  assistant: copyFor({
    /* ch19: "a refusal is a sentence — never an empty panel". */
    emptyTitle: "Ask a question",
    emptyDescription: "It can read your work. It never writes without you pressing something.",
    errorDescription: "The answer did not arrive. Ask again.",
  }),
  signIn: copyFor({
    emptyTitle: "Sign in",
    emptyDescription: "Use the address your account is registered to.",
    errorDescription: "We could not reach the sign-in service. Try again.",
  }),
  importFlow: copyFor({
    emptyTitle: "No file yet",
    emptyDescription: "Choose a spreadsheet to begin. Nothing is written until the last step.",
    errorDescription: "The file could not be read. Nothing was written.",
  }),
  searchResults: copyFor({
    emptyTitle: "Search across everything",
    emptyDescription: "Type to look through records, files and messages.",
    noResultsTitle: "Nothing matched",
    noResultsDescription: "Try fewer words, or look in the archive.",
  }),
  portalHome: copyFor({
    emptyTitle: "Nothing is waiting on you",
    emptyDescription: "We will say so here the moment we need something.",
  }),
  portalConversation: copyFor({
    emptyTitle: "No messages yet",
    emptyDescription: "Write below and the team will see it.",
  }),
};

/** Merge a call site's override over a shape's defaults. */
export function shapeCopy(
  shape: ShapeName,
  override?: Partial<ShapeStateCopy>,
): ShapeStateCopy {
  return override === undefined
    ? SHAPE_STATE_COPY[shape]
    : { ...SHAPE_STATE_COPY[shape], ...override };
}

/**
 * Which register a state draws. `ready` draws none — that is the point.
 * `filtered` is what separates ch27.22 from ch27.21 and it is never guessed:
 * a shape passes it because it knows a facet or a term is switched on.
 */
export function shapeStateTone(
  state: ShapeState,
  filtered = false,
): ScreenRegisterTone | null {
  if (state === "ready") return null;
  if (state === "loading") return "loading";
  if (state === "error") return "error";
  return filtered ? "noResults" : "empty";
}

export interface ShapeStateBodyProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title" | "action"> {
  /** Which shape's words to use. */
  shape: ShapeName;
  /** The state to draw. `ready` renders `null`. */
  state: ShapeState;
  /** A term or a facet is switched on, so the empty case is no-results. */
  filtered?: boolean;
  /**
   * The one next step. ch27.21 allows a mango create here — it is the only
   * empty state that may carry one. ch27.22 forbids mango entirely, so a
   * no-results action must be a secondary or a text button.
   */
  action?: React.ReactNode;
  /** Per-locale words. */
  copy?: Partial<ShapeStateCopy>;
  /** How many skeleton lines the loading body draws. ch27.6: same shape as loaded. */
  lines?: number;
}

/**
 * The body a shape swaps in for loading, empty, no-results or error.
 *
 * TEN STATES — this component IS three of them and the rest do not apply.
 *  1. default        — `state="ready"` renders `null`.
 *  2. hover          — does not apply. A register is text; only its action is
 *                      a control, and `Button` owns that hover.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — does not apply, same reason as hover.
 *  5. disabled       — does not apply. There is nothing here to switch off.
 *  6. loading        — `tone="loading"`: skeleton lines, never a spinner.
 *  7. empty          — `tone="empty"`, or `noResults` when `filtered`.
 *  8. error          — `tone="error"`, ruling 06's sentence and a Retry.
 *  9. selected       — does not apply.
 * 10. read-only      — does not apply.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. `ScreenRegister` is a single column
 *  at every width and the kit draws it the same in both renders; a register
 *  that restacked would jump when data arrived, which ch27.6 forbids.
 *
 * RTL — LTR only by client ruling. Nothing here is directional.
 */
function ShapeStateBody({
  shape,
  state,
  filtered = false,
  action,
  copy,
  lines,
  ...props
}: ShapeStateBodyProps) {
  const tone = shapeStateTone(state, filtered);
  if (tone === null) return null;

  const words = shapeCopy(shape, copy);

  const title =
    tone === "error"
      ? words.errorTitle
      : tone === "noResults"
        ? words.noResultsTitle
        : tone === "empty"
          ? words.emptyTitle
          : undefined;

  const description =
    tone === "error"
      ? words.errorDescription
      : tone === "noResults"
        ? words.noResultsDescription
        : tone === "empty"
          ? words.emptyDescription || undefined
          : undefined;

  return (
    <ScreenRegister
      data-slot="shape-state-body"
      tone={tone}
      title={title}
      description={description}
      action={action}
      lines={lines}
      loadingLabel={words.loadingLabel}
      {...props}
    />
  );
}

ShapeStateBody.displayName = "ShapeStateBody";

/**
 * The two doors, as measures. Commission §9: the system app is "dense, wide";
 * the portal is "narrow, calm". Copied from `ScreenRenderer`'s own map so a
 * shape and a rendered screen can never sit at two different widths.
 * GAPS-COL3 SCR-2 records that the calm measure is a chosen number.
 */
export const SHAPE_SHELL: Record<ScreenDensity, string> = {
  comfortable: "gap-6",
  calm: "gap-[var(--space-7)] mx-auto w-full max-w-[60rem]",
};

/** The heading step each door takes, matching `ScreenRenderer` exactly. */
export const SHAPE_HEADING_SIZE: Record<ScreenDensity, "h2" | "h3"> = {
  comfortable: "h2",
  calm: "h3",
};

export { ShapeStateBody };
export type { ScreenDensity };
