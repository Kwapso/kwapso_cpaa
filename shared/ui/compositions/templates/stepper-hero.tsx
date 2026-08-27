"use client";

/* ============================================================================
   StepperHero — the stage progression that sits above the tab strip. Seven
   stages in the system app, three in the portal, four for a step rail.

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" chapter 23 ("Record hero with the stages in it"),
   ruling 04, and chapters 27.30 / 27.44 for the four-step rail.

     ch23, the hero's whole specification, verbatim:
       "Stage pills … done takes the paper fill, current takes mango with a
        charcoal label, later stages take the quiet fill with disabled ink · a
        stage is pressable and scrolls the record to that stage's panel · over
        five stages the tail folds into '+n' · the portal collapses the same
        seven into with us / with you / done"

     ch23 on why the numbers matter, verbatim: "Stage numbers are tabular and
       never drop, because 'we are at three of seven' is the sentence a client
       repeats back. The words alone do not carry that."

     ch23 on the one mango, verbatim: "The current stage carries the only
       mango in the hero, so Edit drops to the paper secondary when a stage is
       highlighted. Two mangos in one header is the most common way this
       composition goes wrong."

     Ruling 04, verbatim: "Two vocabularies, one colour scale. The system
       reads seven stages; a client only ever sees three, because the portal
       answers one question: is this with you or with us. Triage and blocking
       are operations language and never reach the client."

   THE LAW THIS FILE OBEYS
   · IT DRAWS NO PILL. `StatusStepper` already draws the done / current /
     later fills, the tabular numerals, the fold into "+n" and the pressable
     stage. This file chooses the door, the fold point and the meta line.
   · SEVEN, THREE, OR FOUR — AND IT SAYS SO. The count is checked against the
     door in development. A portal record drawn with seven stages leaks
     operations language to a client, which ruling 04 forbids in those words.
   · NO STAGE LABEL IS SHIPPED. The kit names five of the system's seven in
     one render and none of them as a canonical list, so inventing a
     vocabulary here would be a guess dressed as law (PATTERN §9, Honesty).
     Labels are always the caller's. SHP-2 in GAPS-SHAPES.md.
   · THE HERO CARRIES THE ONLY MANGO. When this component is drawn with a
     current stage, the screen's Edit must drop to the paper secondary. That
     is the call site's job and it is written here so it is not forgotten.
   · Focus is one global rule. No fill, no radius, no size decided here.

   RENDERING CONTEXT
   `"use client"`. `StatusStepper` is interactive and this module forwards a
   select handler built during its own render.
   ========================================================================= */

import * as React from "react";

import {
  StatusStepper,
  type StatusStage,
} from "../../components/status-stepper/status-stepper";
import { Text } from "../../components/typography/typography";
import { cn } from "../../lib/utils";
import { useHasRoom } from "../../lib/use-has-room";
import {
  ShapeStateBody,
  type ShapeState,
  type ShapeStateCopy,
} from "../states/states";

/**
 * Which progression this is.
 *
 * `system` and `portal` are ruling 04's two vocabularies. `delivery` is the
 * commission's four-stage progression; the kit draws no four-STAGE record
 * vocabulary — its only four-step progression is the import rail (27.30,
 * 27.44) — so `delivery` takes the numbered step drawing rather than the
 * stage drawing. Both sides are named in GAPS-SHAPES.md SHP-2.
 */
export type StepperDoor = "system" | "portal" | "delivery";

/** How many stages each door is meant to have. */
export const STEPPER_STAGE_COUNT: Record<StepperDoor, number> = {
  system: 7,
  portal: 3,
  delivery: 4,
};

/** ch23 — "over five stages the tail folds into '+n'". */
export const STEPPER_FOLD_AFTER = 5;

export interface StepperHeroProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  /** The stages, in workflow order. Labels are always the caller's. */
  stages: readonly StatusStage[];
  /** Which one the record is at, zero-based. */
  current?: number;
  /** Which progression this is. Sets the drawing and the count check. */
  door?: StepperDoor;
  /**
   * Which way the rail runs. **Defaults from the door**, because the artifact
   * gives the two doors two different answers and neither is a preference:
   *
   *   · `delivery` → `vertical`. Every wizard in the artifact draws a LEFT
   *     rail, 4 of 4, and 27.38 states it as a system rule in words: "All
   *     three multi-step things in the system — onboarding, import, this —
   *     use the same left rail and the same button order." 27.44 is the most
   *     explicit — "The four steps sit down the left, current in mango, done
   *     in paper, later in disabled ink" — and 27.14 and 27.30 draw the same
   *     column. This shape drew a TOP rail on all three. That was L-F7/L-F17.
   *
   *   · `system` and `portal` → `horizontal`. These are chapter 23's RECORD
   *     stage hero, which is a row of pills above a tab strip and has no
   *     vertical drawing anywhere in the artifact. Defaulting the whole shape
   *     to vertical would have turned every record hero on its side to fix
   *     three wizards, so the default is per-door rather than per-component.
   *
   * The two horizontal steppers the artifact does draw — chapter 15's
   * "Stepper — programme phases" and chapter 19's "steps" collection view —
   * are NOT wizards; one is a navigation component and one is a view type for
   * displaying ordered stages of records. They are why the raw tally is 4:2
   * rather than 4:0, and they do not move this default.
   *
   * BELOW 45rem A VERTICAL RAIL IS NOT DRAWN AT ALL — see the breakpoint
   * block. That is the artifact's answer, read off all four of its narrow
   * renders, and it is not the same as lying the rail down.
   */
  orientation?: "horizontal" | "vertical";
  /** Press a stage to move the record to that stage's panel (ch23). */
  onStageSelect?: (index: number, stage: StatusStage) => void;
  /** Where the tail folds. */
  maxVisible?: number;
  /** How the fold reads. */
  formatOverflow?: (count: number) => string;
  /** "three of seven", for the reader who cannot see colour. */
  formatProgress?: (position: number, total: number) => string;
  /** Accessible name for the progression. */
  label?: string;
  /** The line beneath the stages — since when, and who owns it. */
  meta?: React.ReactNode;
  /** The reader has the right to see the progression. `false` renders NOTHING. */
  visible?: boolean;
  /** Nothing is pressable. */
  disabled?: boolean;

  /** Loading, empty or error. A call site passes `state={state}` VERBATIM. */
  state?: ShapeState;
  /** Per-locale words. */
  copy?: Partial<ShapeStateCopy>;
  /** The retry on a block failure. Only drawn when `errorRegister` is on. */
  errorAction?: React.ReactNode;
  /**
   * Whether a FAILED rail says so, or says nothing.
   *
   * Off by default — T3B-6's ruling, applied to the object it was written
   * about. A stage rail is always a hero OVER a body, and the two fail
   * together: all four call sites in this repo put a `FormScreen` or a
   * `RecordChrome` panel underneath, and every one of them already takes the
   * same `state`. With this on, one failure printed ruling 06's sentence
   * TWICE, stacked — once from the rail and once from the body. The artifact
   * draws no stage hero in a failed register anywhere (ch23, 27.30, 27.38 and
   * 27.44 all draw a rail with its stages in it), so the rail going quiet is
   * the faithful reading as well as the legible one.
   *
   * Turn it ON where the rail is the ONLY block on the page and nothing below
   * it would carry the failure.
   */
  errorRegister?: boolean;
}

/**
 * The stage hero.
 *
 * TEN STATES
 *  1. default        — the pills, the current one carrying the only mango.
 *  2. hover          — owned by `StatusStepper`'s pressable stage.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — not drawn. Pressing a stage scrolls the record; the
 *                      acknowledgement is arriving there (GAPS-COL3 LST-4's
 *                      ruling, applied to a stage by status-stepper.tsx).
 *  5. disabled       — `disabled` hands the whole strip to `StatusStepper`,
 *                      which draws a fill and an ink. Never an opacity.
 *  6. loading        — `state="loading"`: skeleton lines in place of the strip.
 *  7. empty          — `state="empty"`: a record with no progression set.
 *  8. error          — `state="error"`: the stages go, because they came out
 *                      of the request that just failed, and by default the
 *                      rail then draws NOTHING — the form or the panel below
 *                      it carries the failure, and two blocks saying "we
 *                      can't show this right now" one above the other is
 *                      worse than one. `errorRegister` opts a standalone rail
 *                      back in to ruling 06's sentence. T3B-6.
 *  9. selected       — the current stage. `StatusStepper` owns that drawing.
 * 10. read-only      — no `onStageSelect`: the strip states, and nothing moves.
 *
 * THREE BREAKPOINTS
 *  mobile (below 45rem) — A VERTICAL RAIL IS NOT DRAWN. `door="delivery"`
 *    draws a left rail from 45rem up and NOTHING below it. All four of the
 *    artifact's wizard narrow renders drop the rail, none of them lies it
 *    down, and every one of them states the step count in words instead —
 *    which is the call site's line, not this shape's. The replacement varies
 *    per composition (27.14 dots, 27.44 a bar, 27.30 and 27.38 nothing at
 *    all), so it is deliberately not chosen here. Full working at the
 *    resolution below.
 *  tablet / desktop — the resolved orientation, unchanged between the two.
 *  `door="system"` and `door="portal"` are chapter 23's record hero and are
 *    horizontal at every width, so nothing about them changes here. The fold
 *    into "+n" is still what the kit uses instead of a responsive rule for
 *    the strip, so only its tail length differs across widths.
 *
 * RTL — LTR only by client ruling. Logical properties throughout.
 */
function StepperHero({
  className,
  stages,
  current,
  door = "system",
  orientation,
  onStageSelect,
  maxVisible = STEPPER_FOLD_AFTER,
  formatOverflow,
  formatProgress,
  label,
  meta,
  visible = true,
  disabled,
  state = "ready",
  copy,
  errorAction,
  errorRegister = false,
  ...props
}: StepperHeroProps) {
  /* FIRST, and unconditionally — every return below this line is an early one
     and a hook may not sit behind any of them. */
  const hasRoom = useHasRoom();

  if (!visible) return null;

  if (process.env.NODE_ENV !== "production" && stages.length > 0) {
    const expected = STEPPER_STAGE_COUNT[door];
    if (stages.length !== expected) {
      console.warn(
        `StepperHero: door="${door}" expects ${expected} stages, got ${stages.length}. Ruling 04 keeps the two vocabularies apart.`,
      );
    }
  }

  /* A failed rail draws NOTHING unless it is the only block on the page.
     T3B-6's ruling, applied here on 2026-08-23. See `errorRegister` for why —
     and note that the alternative the four call sites had each reached for,
     `state === "error" ? "ready" : state`, is strictly worse than either
     answer: it leaves the rail asserting "you are at step 2 of 3" out of the
     request that has just failed. That is the accounts.tsx / home.tsx /
     time.tsx bug, on a different shape. */
  if (state === "error" && !errorRegister) return null;

  if (state !== "ready" || stages.length === 0) {
    return (
      <ShapeStateBody
        data-slot="stepper-hero"
        shape="stepperHero"
        state={state === "ready" ? "empty" : state}
        copy={copy}
        action={state === "error" ? errorAction : undefined}
        lines={1}
        className={className}
        {...props}
      />
    );
  }

  /* THE ORIENTATION, RESOLVED. The door decides unless the call site says
     otherwise — see the `orientation` prop for the artifact behind each side.

     BELOW 45rem A VERTICAL RAIL IS NOT DRAWN. Not lain down — DROPPED. That
     was checked against the artifact rather than reasoned about, because the
     obvious answer (fall back to the horizontal strip) is drawn in none of
     the four narrow renders. What they actually draw, verbatim:

       · 27.14 onboarding — "Below 720px the rail becomes three dots at the
         top, the active one a stretched pill, and each step fills the
         screen." Mock caption: "Narrow · one step per screen, dots for the
         rest", and the mock states "Step 2 of 3".
       · 27.38 multi-step form — "Narrow · one step per screen, the summary
         above the buttons". NO rail and NO dots in the mock: the step's
         title, "Step 2 of 3" in words, the content, the summary, Back/Next.
       · 27.30 import — "Narrow · one column pair per row, the step count
         stated". Again no rail: "Match the columns / Step 3 of 4".
       · 27.44 import proposal — "Narrow: the steps become a bar, one field
         at a time", stating "Mapping 02 of 04".

     Four narrow renders, four treatments, and exactly two things every one of
     them agrees on: THE RAIL IS NEVER DRAWN AS A RAIL, and THE COUNT IS
     ALWAYS STATED IN WORDS. Those two are what this shape implements. The
     treatment that replaces it — dots, a bar, or nothing at all — differs per
     composition and is the CALL SITE's, because only three of the four are
     the same shape and picking one here would impose 27.14's dots on 27.30
     and 27.38, which draw none. `screens/onboarding.tsx` already draws
     27.14's dots itself for exactly this reason.

     THE COUNT IS THE CALL SITE'S OBLIGATION and it is not optional: dropping
     the rail with nothing said leaves a phone reader with no idea how many
     steps there are. All three call sites state it — `multi-step-form` in
     `FormScreen`'s description, `screens/onboarding` in its own eyebrow at
     every width, `system/onboarding` in an eyebrow added with this change.

     45rem is 720px at the 16px authoring base — 27.14's own stated figure,
     `useHasRoom`'s threshold, and the constant `screens/onboarding.tsx`
     already collapses at, so all three agree by construction. */
  const resolvedOrientation =
    orientation ?? (door === "delivery" ? "vertical" : "horizontal");

  if (resolvedOrientation === "vertical" && !hasRoom) return null;

  const drawnOrientation = resolvedOrientation;

  return (
    <div
      data-slot="stepper-hero"
      data-door={door}
      data-orientation={drawnOrientation}
      className={cn("flex min-w-0 flex-col gap-3", className)}
      {...props}
    >
      <StatusStepper
        stages={stages}
        current={current}
        /* `steps` is the numbered rail the kit draws for a four-step process;
           `stages` is the record progression. */
        variant={door === "delivery" ? "steps" : "stages"}
        orientation={drawnOrientation}
        maxVisible={maxVisible}
        onStageSelect={onStageSelect}
        disabled={disabled}
        label={label}
        formatOverflow={formatOverflow}
        formatProgress={formatProgress}
      />
      {meta === undefined ? null : (
        <Text as="p" size="sm" tone="secondary">
          {meta}
        </Text>
      )}
    </div>
  );
}

StepperHero.displayName = "StepperHero";

export { StepperHero };
