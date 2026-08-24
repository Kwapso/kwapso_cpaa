/* ============================================================================
   RunSteps — a sequence executing, with per-step state (1 direct call site).

   DESIGN SOURCE
   Three parts of the kit, and all three are named:

     · "Kwapso UI Kit.dc.html" → chapter 19's `checklist` view, whose own
       catalogue entry reads verbatim:
           "checklist — Ordered steps with owner and sign-off ·
            Audits, handover, go-live · Steps"
       and whose row is drawn as a two-digit number, a title, an owner and a
       time. The chapter's `steps` view is its sibling: "Ordered stages with
       a progress bar".
     · Chapter 15's "Stepper — programme phases": four equal columns, a 26
       mark over a hairline connector, the label beneath. That is already
       transcribed into `status-stepper.tsx` as `variant="steps"`, and this
       file COMPOSES it for the rail rather than drawing a second one.
     · Chapter 07's state matrix, Loading row — "700ms spin / 1.4s bar" —
       which is `spinner.tsx`. A step that is RUNNING carries the kit's 22
       ring; nothing else in this file turns.

   ch27.44 "Import proposal" is the composition this component was built for:
   "Overlay screen · steps down the side · approve is a press".

   THE LAW THIS FILE OBEYS
   · THE RAIL IS `StatusStepper`, THE RING IS `Spinner`. Not one stage class
     and not one keyframe is written here. If a mark needed a fill this file
     did not have, that would be a gap to log, not a class to invent.
   · POPPY MEANS BLOCKED. A failed step takes `Badge variant="destructive"`
     — colour on the pill, never smeared across the row (ruling 26: "colour
     is the whole treatment"). The row itself keeps its paper, and the words
     always say what happened; the mark never carries it alone.
   · `--warning` is the quiet chip and is provisional (tokens.css §3 resolves
     it to poppy), so a SKIPPED step does not reach for it: skipped is the
     quiet fill with disabled ink, which is exactly how the kit already draws
     a stage that is not the present.
   · A step that has not started renders its NUMBER, not a zero and not a
     dash — the same two-digit tabular figure `StatusStepper` formats.
   · Disabled is a fill and an ink. Hover is a token. Never an opacity.
   · Focus is ONE global rule (tokens.css §8). A pressable step is a real
     button and takes the ring at its own radius.

   RENDERING CONTEXT
   `"use client"`. A pressable step means this module builds an event handler
   during its own render, and `StatusStepper` is a client module.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { Badge } from "../../controls/badge/badge";
import { Spinner } from "../../controls/spinner/spinner";
import {
  StatusStepper,
  type StatusStage,
  type StatusStageState,
} from "../../controls/status-stepper/status-stepper";
import { Check, TriangleAlert } from "../../icons";
import { ScreenRegister } from "../screen-renderer/screen-renderer";

/**
 * Where one step stands.
 *
 * Five, not three, because a run is not a progression: a sequence that is
 * actually executing can fail one step and skip another, and a component that
 * could only say done / current / later would have to lie about both.
 */
export type RunStepState = "pending" | "running" | "done" | "failed" | "skipped";

export interface RunStep {
  /** Stable key, and the value handed to `onStepSelect`. Falls back to the index. */
  id?: string;
  /** What the step does. The words always say it; the mark never carries it alone. */
  label: React.ReactNode;
  /** The quiet line under it — what it is waiting on, or what it found. */
  description?: React.ReactNode;
  /** Where it stands. Defaults to `pending`. */
  state?: RunStepState;
  /**
   * The trailing chip — a count, a duration, an owner. A node, so a `Badge`
   * or an `Avatar` rides along without this file choosing one.
   */
  meta?: React.ReactNode;
  /** Nothing may be pressed on this step. A fill and an ink, never an opacity. */
  disabled?: boolean;
  /**
   * The reader may not see this step. `false` renders NOTHING — ch24.6:
   * permissions hide, they do not disable. Defaults to `true`.
   */
  visible?: boolean;
}

/* The 26 mark. Chapter 15's own size (`--control-height-pill`), drawn here
   only as a container: what goes INSIDE it is a tick, a ring or a number, and
   each of those is a component or a formatted figure, never a hand-drawn
   shape. */
const markClasses = [
  "inline-grid size-[var(--control-height-pill)] shrink-0 place-content-center",
  "rounded-pill border-0",
  /* 12 / 500. CH19 view 17 states `font-weight: 500` on every mark;
     `text-badge` sets the step and the leading but no weight, so a pending
     number was printing at the page's default. */
  "text-badge font-[var(--font-weight-medium)] leading-none tabular-nums",
  "motion-step",
];

/* The five marks. Each is a fill and an ink — never an opacity — and each is
   the fill the kit already uses for that meaning:
     done     — the inverse mark chapter 15 draws for a completed phase
     running  — MANGO with a charcoal glyph. Both of the artifact's steppers
                fill the CURRENT mark that way: CH19 view 17's `stepColors`
                gives `current: [MANGO, ONACC]` and CH15 draws
                `background: var(--mango)` with `color: #1A1918`.
                `StatusStepper` already does this on the rail
                (status-stepper.tsx), so the row and the rail had been
                disagreeing with each other. Override 17 licenses it: a mark
                is not an ACTION, and only actions are counted. The `Spinner`
                inside it keeps the ring, which is still the only thing on
                the row that moves.
     failed   — poppy with a CHARCOAL glyph. Never white on red.
     skipped  — the quiet fill with disabled ink: `.kw-stage--later`'s pair
     pending  — raised paper with a hairline and a tertiary number, exactly
                as `StatusStepper variant="steps"` draws a later mark

   THE `skipped` MARK IS A KNOWN DIVERGENCE — do not re-flag it, and do not
   move it alone. GAPS-CONTRAST §2 row 8 names "`run-step-mark` pending" at
   2.335:1 light / 3.979:1 dark. THE LABEL IN THAT ROW IS WRONG: `pending` is
   `--ink-tertiary` on card and measures 6.506 light / 7.928 dark. The mark
   that sits in the exempt tier is `skipped` — one instance in the demo, step
   07, "Archive the source file".

   It stays because it is the SAME OBJECT as a later stage, drawn once. The
   artifact rules that pair directly — CH23's "Later is disabled ink, not
   hidden" — and this line takes it deliberately so the run row and the
   stepper rail do not draw one meaning two ways, which is the drift this
   file was already corrected for once (see `running`, above). Unlike the
   other four members of that family, no chapter names a SKIPPED run step, so
   this is a DERIVATION from `.kw-stage--later`, labelled one, and cheaper to
   overturn than any of them. If CH23's pair ever moves to tertiary, this
   moves with it in the same edit.

   What is actually at risk is small and worth stating: the mark carries only
   the ordinal, and the row's own label and description — "Skipped: the file
   came from a connector, not an upload" — are in full ink and unaffected. */
const MARK_SKIN: Record<RunStepState, string> = {
  done: "bg-surface-inverse text-ink-on-inverse",
  running: "bg-surface-brand text-ink-on-accent",
  failed: "bg-destructive text-destructive-foreground",
  skipped: "bg-surface-idle text-ink-disabled",
  pending: "bg-card text-ink-tertiary shadow-[var(--hairline)]",
};

/* The row. A step that is running is the one the reader is watching, so it
   takes the second paper tone — the same fill `TableRow` and `List` give a
   selected row, for the same reason: it is the loudest row on screen and it
   does not change again on hover. */
const ROW_SKIN: Partial<Record<RunStepState, string>> = {
  running: "bg-surface-panel",
};

const ROW_DISABLED =
  "cursor-not-allowed bg-[var(--btn-disabled-fill)] text-[var(--btn-disabled-label)]";

/** How a run's five states collapse onto the rail's three. */
const RAIL_STATE: Record<RunStepState, StatusStageState> = {
  done: "done",
  // A skipped step is behind the run, so the rail shows it as passed.
  skipped: "done",
  running: "current",
  // A failed step is where the run stopped, so the rail still points at it.
  failed: "current",
  pending: "later",
};

/** Two tabular digits in the runtime's own numbering system. */
function twoDigits(value: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumIntegerDigits: 2,
    useGrouping: false,
  }).format(value);
}

export interface RunStepsProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  /** The sequence, in order. An empty array draws the empty register. */
  steps: readonly RunStep[];
  /**
   * Draw chapter 15's rail above the rows. On by default: a run of more than
   * three steps is much easier to place at a glance from the rail than from
   * counting rows. `StatusStepper variant="steps"` draws it, in full.
   */
  rail?: boolean;
  /** The rail's accessible name, handed to `StatusStepper`. */
  railLabel?: string;
  /** Pressing a step opens it. Absent, the rows render as plain blocks. */
  onStepSelect?: (index: number, step: RunStep) => void;
  /** Nothing may be pressed. A fill and an ink, never an opacity. */
  disabled?: boolean;
  /** Which body is drawn. Only the rows swap; the rail stays. */
  state?: "ready" | "loading" | "empty" | "error";
  /** The sequence's accessible name. Defaulted so no call site ships a nameless list. */
  label?: string;
  /**
   * What a screen reader hears on a step's mark, which has no words of its
   * own. One string per state, all overridable, because a bare tick or a
   * bare ring announces nothing.
   */
  stateLabels?: Partial<Record<RunStepState, string>>;
  /** The number printed in a pending mark. Defaults to two tabular digits. */
  formatNumber?: (value: number) => string;
  /** How many skeleton rows the loading body draws. */
  loadingRows?: number;
  /** What a screen reader hears while the sequence loads. */
  loadingLabel?: string;
  /** The empty register's sentence. */
  emptyTitle?: React.ReactNode;
  /** The line under it. */
  emptyDescription?: React.ReactNode;
  /** The error register's sentence. */
  errorTitle?: React.ReactNode;
  /** The line under it. */
  errorDescription?: React.ReactNode;
  /** The retry. */
  errorAction?: React.ReactNode;
}

const DEFAULT_STATE_LABELS: Record<RunStepState, string> = {
  pending: "Not started",
  running: "Running",
  done: "Done",
  failed: "Failed",
  skipped: "Skipped",
};

/**
 * A sequence executing.
 *
 * TEN STATES
 *  1. default        — the rail, then one row per step: mark, label,
 *                      description, meta.
 *  2. hover          — only on a pressable row, and then it is `--accent`,
 *                      the neutral wash, timed by `.motion-row-hover`. Never
 *                      mango, never an opacity, and never on the running row
 *                      — that row already carries the loudest fill on screen
 *                      and a hover on top of it would say nothing.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      Nothing here sets `overflow: hidden`, so a pressed
 *                      row's ring shows in full at the row's own radius.
 *  4. active/pressed — does not apply as a skin. Pressing a step opens its
 *                      detail; the acknowledgement is the detail arriving.
 *  5. disabled       — per step or whole run: `--btn-disabled-fill` /
 *                      `--btn-disabled-label`, `aria-disabled`, no hover, and
 *                      the row is a block rather than a button so there is no
 *                      tab stop that does nothing.
 *  6. loading        — TWO different things, kept apart. A STEP that is
 *                      running is `state="running"` and carries the kit's
 *                      ring — that is not a loading state, it is the
 *                      component's subject. The SEQUENCE that has not arrived
 *                      is `state="loading"` on the component, and it draws
 *                      skeleton rows with the rail kept, so the page does not
 *                      jump when the steps land.
 *  7. empty          — `state="empty"`, or `steps: []`: chapter 21's
 *                      register, or `null` when there is nothing to say
 *                      either. A run with no steps is not drawn as an empty
 *                      rail.
 *  8. error          — TWO different things again. A STEP that failed is
 *                      `state="failed"`: poppy on the mark and a destructive
 *                      `Badge`, with the words saying what happened — colour
 *                      on the pill, never across the row. The whole SEQUENCE
 *                      failing to load is `state="error"` and draws the
 *                      register.
 *  9. selected       — the RUNNING step is the one the reader is on:
 *                      `--surface-panel` and `aria-current="step"`. A run has
 *                      no second notion of selection.
 * 10. read-only      — always. A run reports what is happening; starting,
 *                      retrying and cancelling are Buttons the call site puts
 *                      beside it, not controls this component owns.
 *
 * THREE BREAKPOINTS
 *  mobile   — the rows keep their shape and the label TRUNCATES; the
 *             description wraps under it. Nothing restacks. The RAIL keeps
 *             its equal columns and ellipsises its labels, which is
 *             `StatusStepper`'s own stated behaviour and the right one:
 *             stacking a rail turns a stepper into a list and loses the
 *             spine that makes it readable as a progression at a glance.
 *  tablet   — unchanged.
 *  desktop  — unchanged. Neither the rail nor the rows change size or count
 *             with width; a run of twelve steps is a run of twelve steps on
 *             a phone, and `StatusStepper` does not fold in its `steps`
 *             variant.
 *
 * RTL — safe. The mark is first in DOM order and therefore at the reading
 * start in Arabic, Urdu and Persian; the tick and the warning glyph are
 * symbols and are not mirrored; the rail's connector fills in reading order
 * because motion.css mirrors its own `transform-origin`; every inset is
 * logical and the meta is pushed with `ms-auto`.
 */
const RunSteps = React.forwardRef<HTMLDivElement, RunStepsProps>(
  (
    {
      className,
      steps,
      rail = true,
      railLabel,
      onStepSelect,
      disabled = false,
      state = "ready",
      label = "Steps",
      stateLabels,
      formatNumber = twoDigits,
      loadingRows = 4,
      loadingLabel = "Loading…",
      emptyTitle,
      emptyDescription,
      errorTitle,
      errorDescription,
      errorAction,
      ...props
    },
    ref,
  ) => {
    const announce = React.useMemo(
      () => ({ ...DEFAULT_STATE_LABELS, ...stateLabels }),
      [stateLabels],
    );

    /* Permissions HIDE. A hidden step is not on the rail either — a rail
       that counted steps the reader cannot see would tell them one exists. */
    const shown = steps.filter((step) => step.visible !== false);
    const resolved = state === "ready" && shown.length === 0 ? "empty" : state;
    const pressable = Boolean(onStepSelect) && !disabled;

    /* The rail is `StatusStepper variant="steps"`, fed from the same array.
       The current index is the first step that is not behind the run; a run
       that has finished points at its last step, which is what the kit's own
       four-phase rail does at the end of a programme. */
    const railStages: StatusStage[] = shown.map((step, index) => ({
      id: step.id ?? String(index),
      label: step.label,
      state: RAIL_STATE[step.state ?? "pending"],
    }));
    const railCurrent = Math.max(
      0,
      shown.findIndex((step) => {
        const value = step.state ?? "pending";
        return value === "running" || value === "failed" || value === "pending";
      }),
    );

    const railNode =
      rail && resolved !== "empty" && railStages.length > 0 ? (
        <StatusStepper
          variant="steps"
          stages={railStages}
          current={railCurrent}
          maxVisible={0}
          label={railLabel}
        />
      ) : null;

    let body: React.ReactNode;

    if (resolved === "loading") {
      body = (
        <div className="flex flex-col gap-3">
          {Array.from({ length: loadingRows }, (_, index) => (
            <div key={`loading-${index}`} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="size-[var(--control-height-pill)] shrink-0 animate-pulse rounded-pill bg-surface-quiet motion-reduce:animate-none"
              />
              <span className="min-w-0 flex-1">
                <span
                  aria-hidden="true"
                  className="block h-3 w-2/5 animate-pulse rounded-pill bg-surface-quiet motion-reduce:animate-none"
                />
              </span>
            </div>
          ))}
          {/* One announcement for the whole wait, not one per row. */}
          <span className="sr-only" role="status" aria-busy="true">
            {loadingLabel}
          </span>
        </div>
      );
    } else if (resolved !== "ready") {
      const register =
        resolved === "error" ? (
          <ScreenRegister
            tone="error"
            title={errorTitle}
            description={errorDescription}
            action={errorAction}
          />
        ) : (
          <ScreenRegister tone="empty" title={emptyTitle} description={emptyDescription} />
        );
      if (register === null) return null;
      body = register;
    } else {
      body = (
        <div role="list" aria-label={label} className="flex flex-col">
          {shown.map((step, index) => {
            const value = step.state ?? "pending";
            const stepDisabled = disabled || step.disabled === true;
            const stepPressable = pressable && !stepDisabled;
            const key = step.id ?? String(index);

            const mark = (
              <span
                data-slot="run-step-mark"
                data-state={value}
                className={cn(markClasses, MARK_SKIN[value])}
              >
                {value === "done" ? (
                  <Check size={16} aria-hidden="true" />
                ) : value === "failed" ? (
                  <TriangleAlert size={16} aria-hidden="true" />
                ) : value === "running" ? (
                  /* The kit's ring, at the size that fits a 26 mark.
                     `announce={false}`: the row already says "Running"
                     through its own visually-hidden line, and two live
                     regions saying it at once is worse than one. */
                  <Spinner size="sm" announce={false} />
                ) : (
                  formatNumber(index + 1)
                )}
              </span>
            );

            const inner = (
              <>
                {mark}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={cn(
                      "truncate text-sm",
                      value === "running" && "font-[var(--font-weight-medium)]",
                      value === "skipped" && "text-ink-tertiary",
                    )}
                  >
                    {step.label}
                  </span>
                  {step.description !== undefined && step.description !== null ? (
                    <span className="mt-1 text-caption text-ink-tertiary">
                      {step.description}
                    </span>
                  ) : null}
                </span>
                <span className="ms-auto flex flex-none items-center gap-2">
                  {/* Colour on the pill, never across the row. The words say
                      what happened; the colour only repeats it. */}
                  {value === "failed" ? (
                    <Badge variant="destructive">{announce.failed}</Badge>
                  ) : null}
                  {step.meta}
                </span>
                {/* The mark has no words of its own, so the state is
                    announced once, in the reader's language. */}
                <span className="sr-only">{announce[value]}</span>
              </>
            );

            const rowClasses = cn(
              "flex w-full items-center gap-3 rounded-[var(--radius)] text-start",
              "px-4 py-3 min-h-[var(--control-height-input)]",
              "motion-row-hover",
              ROW_SKIN[value],
              stepPressable && value !== "running" && "cursor-pointer hover:bg-accent",
              stepPressable && value === "running" && "cursor-pointer",
              // Last, so tailwind-merge drops the loser rather than leaving
              // two same-specificity rules to race (PATTERN §4).
              stepDisabled && ROW_DISABLED,
            );

            return (
              /* A real wrapper rather than `display: contents`: a listitem
                 that generates no box is dropped from the accessibility tree
                 in more than one engine, and `role` cannot go on the row
                 itself when that row is a `<button>`. */
              <div key={key} role="listitem" data-slot="run-step">
                {stepPressable ? (
                  <button
                    type="button"
                    data-state={value}
                    aria-current={value === "running" ? "step" : undefined}
                    onClick={() => onStepSelect?.(index, step)}
                    className={cn(
                      "appearance-none border-0 bg-transparent [font:inherit] text-inherit",
                      rowClasses,
                    )}
                  >
                    {inner}
                  </button>
                ) : (
                  <span
                    data-state={value}
                    aria-current={value === "running" ? "step" : undefined}
                    aria-disabled={stepDisabled || undefined}
                    className={rowClasses}
                  >
                    {inner}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        data-slot="run-steps"
        data-state={resolved}
        className={cn("flex w-full min-w-0 flex-col gap-6", className)}
        {...props}
      >
        {railNode}
        {body}
      </div>
    );
  },
);

RunSteps.displayName = "RunSteps";

export { RunSteps };
