/* ============================================================================
   StatusStepper — the record's progression (2 direct call sites).

   DESIGN SOURCE — CHAPTER 23, NOT 27
   "Kwapso UI Kit.dc.html" → `<section id="ch23">` "Auth & account", the
   sub-specimen headed

       "Record hero with the stages in it"
       "Seven named stages · the portal shows three"

   and its spec line, verbatim and load-bearing:

       "Stage pills 12.5px / 26px tall · done takes the paper fill, current
        takes mango with a charcoal label, later stages take the quiet fill
        with disabled ink · a stage is pressable and scrolls the record to
        that stage's panel · over five stages the tail folds into “+n” · the
        portal collapses the same seven into with us / with you / done"

   Transcribed into design-mothership/specimens/kwapso-patterns.css as
   `.kw-stages`, `.kw-stage`, `.kw-stage__n`, `.kw-stage--current`,
   `.kw-stage--later`, which is where the 12.5 becomes the badge step ("it IS
   status text under ruling 02; the kit's 12.5 is the retired non-step") and
   the height becomes `--control-height-pill` (26).

   The kit ALSO draws a second stepper, in chapter 15 (Navigation), headed
   "Stepper — programme phases": four equal columns, each a 26 mark over a
   hairline connector with the label beneath. That is `variant="steps"`
   below. It is an ADDED variant — the commission lists none for this folder
   and PATTERN §2 permits additions — and it exists because motion/motion.css
   ships `.motion-step-connector` for exactly this drawing and because the
   chapter draws it. Both variants are the kit's own; neither is invented.

   THE LAW THIS FILE OBEYS
   · ONE MANGO PER VIEW, AND IT IS THE PRESENT. The current stage carries the
     only mango in the hero. This is not mango-as-a-status, which ruling 26
     forbids — it is mango marking position, the same use `.kw-stage--current`
     makes and the same use t20-gaps.md T20-3 records as explicitly not
     violating the ruling. Done and later stages carry no accent at all.
   · Charcoal on every accent: the current pill's label is `--ink-on-accent`,
     never white, in both palettes.
   · Every pill is a pill (`--radius-pill`). No box radius reaches this file.
   · Disabled is a fill and an ink — `--surface-idle` with `--ink-disabled` —
     which is exactly how the kit already draws a LATER stage. "Later is
     disabled ink, not hidden": a record that hides its future reads as
     finished.
   · Focus is ONE global rule (tokens.css §8). A pressable stage is a real
     button and the ring lands on it at its own radius. No ring here.
   · Motion is `.motion-step` (colour) and `.motion-step-connector` (the fill
     between two marks, a scaleX whose origin motion.css already mirrors
     under `dir="rtl"`). No keyframe, no duration and no curve is written in
     this file.
   · Numbers are tabular and never drop — "we are at three of seven" is the
     sentence a client repeats back — and they go through `formatNumber`, so
     a document in Arabic, Urdu or Persian gets its own numerals.

   THE SEVEN-STAGE CASE AT MOBILE WIDTH — WHAT IT DOES AND WHY
   The kit answers this itself and the answer is NOT a media query: "over
   five stages the tail folds into '+n'", and the kit's own drawing of the
   seven-stage record shows five pills followed by a "+2". So `maxVisible`
   defaults to 5 and the fold is unconditional — the same at 320 as at 1440.
   Two reasons that is right rather than lazy. A fold that only happened on a
   phone would mean the client and the account manager are looking at two
   different progressions while talking to each other on a call, which is the
   one thing this hero exists to prevent. And a width-triggered fold needs a
   breakpoint the kit never states, which would be an invented value.
   Underneath the fold, `.kw-stages` is `flex-wrap`, so five pills that still
   do not fit at 320 wrap to a second line rather than scrolling out of
   reach. A four-stage progression is under the fold and draws all four,
   which is the other case this component has to handle.

   RENDERING CONTEXT
   `"use client"`. A pressable stage means this module builds an event
   handler during its own render.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { Check } from "../../icons";

/** Where a stage sits relative to the present. */
export type StatusStageState = "done" | "current" | "later";

export interface StatusStage {
  /** Stable key, and the value handed to `onStageSelect`. Falls back to the index. */
  id?: string;
  /** The stage's name. The words always say it; the number never carries it alone. */
  label: React.ReactNode;
  /**
   * Override the position this stage is drawn at. Left unset, everything
   * before `current` is done, `current` is current, and the rest are later.
   */
  state?: StatusStageState;
}

/* `.kw-stage` — the pill. Shared by all three positions so they cannot drift
   apart; the position adds only a fill and an ink. */
const pillClasses = [
  "inline-flex items-center gap-[var(--space-1h)]",
  "h-[var(--control-height-pill)] px-3 rounded-pill",
  // badge · 12 / 500-or-300 by position. `leading-none` is the kit's own
  // `line-height: 1` on a 26 pill.
  "text-badge leading-none whitespace-nowrap",
  "border-0",
  "motion-step",
];

/* The chapter-15 mark: 26 across, a circle, centred content. */
const markClasses = [
  "inline-grid size-[var(--control-height-pill)] shrink-0 place-content-center",
  "rounded-pill border-0",
  "text-badge leading-none tabular-nums",
  "motion-step",
];

export interface StatusStepperProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  /** The progression, in order. Seven and four are both real; see the header. */
  stages: readonly StatusStage[];
  /**
   * Zero-based index of the stage the record is at now. Anything before it is
   * done, anything after it is later. A stage may still override its own
   * position through `stage.state`.
   */
  current?: number;
  /**
   * Which drawing. `stages` is chapter 23's hero — a wrapping row of pills,
   * the default. `steps` is chapter 15's equal-column rail with a connector
   * between the marks and the label beneath each one.
   */
  variant?: "stages" | "steps";
  /**
   * Which way the `steps` rail runs. Ignored by `stages`, which is chapter
   * 23's wrapping row of pills and has no vertical drawing anywhere.
   *
   * `horizontal` is chapter 15's "Stepper — programme phases": equal columns,
   * a connector between the marks, the label beneath each one.
   *
   * `vertical` is the WIZARD rail, and it is a different drawing rather than
   * the same one rotated — read off the artifact's own markup, which is the
   * same in all four flows that draw it (27.14 onboarding, 27.30 import,
   * 27.38 multi-step form, 27.44 import proposal):
   *
   *     <div style="display: flex; flex-direction: column; gap: 14px;">
   *       <div style="display: flex; align-items: center; gap: 10px;">
   *         <span 24px circle>✓</span><span>The file</span>
   *
   * A column of mark-beside-label rows, and NO CONNECTOR — the artifact
   * draws none in any of the four. So vertical does not rotate the connector,
   * it drops it, which is why this is a branch and not a flex-direction.
   */
  orientation?: "horizontal" | "vertical";
  /**
   * How many stages are drawn before the tail folds into "+n". The kit's own
   * figure is five ("over five stages the tail folds into '+n'"). `0` turns
   * the fold off and draws every stage.
   */
  maxVisible?: number;
  /**
   * Pressing a stage moves the record to it. Absent, the stages render as
   * spans: a control that silently does nothing is worse than a label.
   */
  onStageSelect?: (index: number, stage: StatusStage) => void;
  /** Nothing may be pressed. A fill and an ink, never an opacity. */
  disabled?: boolean;
  /**
   * The whole progression's accessible name. Defaulted so no call site ships
   * a nameless list, and a prop because the apps run in Arabic, Urdu and
   * Persian.
   */
  label?: string;
  /**
   * The sentence a screen reader hears for the current stage — the kit's own
   * "we are at three of seven". Both numbers go through `formatNumber`, so
   * only the words here need translating.
   */
  formatProgress?: (position: number, total: number) => string;
  /**
   * The "+2" pill. A prop because the plus sign is punctuation in one
   * alphabet and not in another, and because some locales put the count
   * first.
   */
  formatOverflow?: (count: number) => string;
  /**
   * The number printed inside a stage pill. The kit draws "01", "02" — two
   * digits, tabular, never dropped — so the default pads to two.
   */
  formatNumber?: (value: number) => string;
  /**
   * The accessible name of a done stage's tick, which has no words of its
   * own. Read before the stage's label.
   */
  doneLabel?: string;
}

/** Two tabular digits in the runtime's own numbering system. */
function defaultFormatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumIntegerDigits: 2,
    useGrouping: false,
  }).format(value);
}

/** One number in the runtime's own numbering system, unpadded. */
function plainNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { useGrouping: false }).format(value);
}

/**
 * The system's record progression.
 *
 * TEN STATES
 *  1. default        — the kit's three positions at once: done stages on
 *                      `--surface-raised` with a tertiary-ink number, the
 *                      current stage on mango with a charcoal label at
 *                      weight 500, later stages on `--surface-idle` with
 *                      `--ink-disabled`.
 *  2. hover          — a pressable stage takes one defined step from its own
 *                      fill: `--surface-quiet` for done and later,
 *                      `--btn-primary-hover` for the mango current pill. A
 *                      colour swap, never a fade, and never `--primary`
 *                      itself. The kit draws no hover for `.kw-stage` at all;
 *                      derived, and logged as GAPS-CE STP-2.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the pill's own radius.
 *  4. active/pressed — does not apply as a skin. Pressing a stage navigates;
 *                      the acknowledgement is the record moving, and the kit
 *                      draws no pressed state for a pill that is a link in
 *                      everything but markup. `aria-current` carries which
 *                      one is the present.
 *  5. disabled       — `disabled`: every stage renders as a span, and the
 *                      current pill keeps its mango because the record is
 *                      still at that stage — the progression is not
 *                      switched off, the navigation is. Later stages already
 *                      carry the disabled ink by design.
 *  6. loading        — does not apply, deliberately. A progression drawn
 *                      before its stages arrive would state a position the
 *                      record may not be at. The caller renders a `Skeleton`
 *                      in the hero's place until the stages exist.
 *  7. empty          — `stages` of length zero renders `null`. An empty
 *                      progression rail with no stages in it is noise, and
 *                      the kit never draws one.
 *  8. error          — does not apply, and must not be faked. A BLOCKED
 *                      record is a status and belongs to the status pill
 *                      beside the title (`Badge`, ruling 26's dot plus
 *                      words); a poppy stage would put a status colour into
 *                      a position mark and break "one mango, and it is the
 *                      present". GAPS-CE STP-3.
 *  9. selected       — the current stage IS the selected one. Mango fill,
 *                      charcoal label, `aria-current="step"`.
 * 10. read-only      — every stepper without `onStageSelect` is read-only,
 *                      and that is the default. The stages become spans, so
 *                      there are no tab stops that do nothing.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED BY WIDTH, on purpose, and the header
 *  explains at length why the seven-stage fold is a count rule rather than a
 *  breakpoint. What does change with width is reflow, not drawing: the
 *  `stages` row is `flex-wrap`, exactly as `.kw-stages` is, so pills that do
 *  not fit take a second line; the `steps` rail keeps its equal columns and
 *  ellipsises the labels (`min-w-0` + `truncate`), because stacking a rail
 *  turns a stepper into a list and loses the spine that makes it readable as
 *  a progression at a glance.
 *
 * RTL — this is the component that needed the most care. The `stages` row is
 * ordered by `flex` in DOM order with no side named, so stage 01 sits at the
 * reading start in Arabic, Urdu and Persian. The `steps` connector fills in
 * READING ORDER: it is a `scaleX` and motion.css's `.motion-step-connector`
 * already flips its `transform-origin` to `100% 50%` under `[dir="rtl"]`, so
 * the rail fills the way the reader reads with nothing written here. The tick
 * glyph is not mirrored — a checkmark is a symbol, not a direction.
 */
const StatusStepper = React.forwardRef<HTMLDivElement, StatusStepperProps>(
  (
    {
      className,
      stages,
      current = 0,
      variant = "stages",
      orientation = "horizontal",
      maxVisible = 5,
      onStageSelect,
      disabled = false,
      label = "Progress",
      formatProgress,
      formatOverflow,
      formatNumber = defaultFormatNumber,
      doneLabel = "Done",
      ...props
    },
    ref,
  ) => {
    // Empty: the kit never draws a progression with no stages in it.
    if (stages.length === 0) return null;

    const total = stages.length;
    const pressable = Boolean(onStageSelect) && !disabled;

    const stateOf = (stage: StatusStage, index: number): StatusStageState =>
      stage.state ?? (index < current ? "done" : index === current ? "current" : "later");

    const describeProgress =
      formatProgress ??
      ((position: number, count: number) => `Step ${plainNumber(position)} of ${plainNumber(count)}`);
    const describeOverflow = formatOverflow ?? ((count: number) => `+${plainNumber(count)}`);

    /* "Over five stages the tail folds into '+n'." The fold keeps the CURRENT
       stage visible even when it sits in the tail — a hero that hides where
       the record is has stopped being a hero. */
    const folding = maxVisible > 0 && total > maxVisible;
    let visibleCount = folding ? maxVisible : total;
    if (folding && current >= visibleCount) visibleCount = Math.min(current + 1, total);
    const hidden = total - visibleCount;
    const visible = stages.slice(0, visibleCount);

    const rowProps = {
      "data-slot": "status-stepper",
      "data-variant": variant,
      "data-orientation": variant === "steps" ? orientation : undefined,
      "data-disabled": disabled ? "" : undefined,
      role: "list" as const,
      "aria-label": label,
    };

    /* ---- The wizard rail: a column of mark-beside-label rows, no connector.
       The artifact draws this identically in 27.14, 27.30, 27.38 and 27.44 —
       `flex-direction: column; gap: 14px`, each row `align-items: center;
       gap: 10px`, and no connector in any of the four. 14 and 10 land on
       `--space-3h` and `--space-2h`. The mark is the same mark the horizontal
       rail draws, so the done / current / later skins are not restated.
       ------------------------------------------------------------------- */
    if (variant === "steps" && orientation === "vertical") {
      return (
        <div
          ref={ref}
          {...rowProps}
          className={cn("flex w-full min-w-0 flex-col gap-[var(--space-3h)]", className)}
          {...props}
        >
          {visible.map((stage, index) => {
            const state = stateOf(stage, index);
            const isDone = state === "done";
            const isCurrent = state === "current";
            const key = stage.id ?? String(index);

            const body = (
              <>
                <span
                  data-slot="status-stepper-mark"
                  className={cn(
                    markClasses,
                    isDone && "bg-surface-inverse text-ink-on-inverse",
                    isCurrent &&
                      "bg-[var(--surface-brand)] text-ink-on-accent font-[var(--font-weight-medium)]",
                    !isDone && !isCurrent && "bg-card text-ink-tertiary shadow-[var(--hairline)]",
                  )}
                >
                  {isDone ? (
                    <>
                      <span className="sr-only">{doneLabel}</span>
                      <Check size={16} aria-hidden="true" />
                    </>
                  ) : (
                    formatNumber(index + 1)
                  )}
                </span>
                <span
                  data-slot="status-stepper-label"
                  className={cn(
                    "min-w-0 truncate text-caption",
                    isCurrent && "font-[var(--font-weight-medium)]",
                    state === "later" ? "text-ink-tertiary" : "text-foreground",
                  )}
                >
                  {stage.label}
                </span>
              </>
            );

            const rowClasses = "flex w-full items-center gap-[var(--space-2h)] text-start";

            return (
              <span
                key={key}
                role="listitem"
                data-slot="status-stepper-step"
                data-state={state}
                aria-current={isCurrent ? "step" : undefined}
                className="flex min-w-0"
              >
                {pressable ? (
                  <button
                    type="button"
                    onClick={() => onStageSelect?.(index, stage)}
                    aria-label={isCurrent ? describeProgress(index + 1, total) : undefined}
                    className={cn(
                      rowClasses,
                      "cursor-pointer border-0 bg-transparent p-0 [font:inherit] text-inherit",
                    )}
                  >
                    {body}
                  </button>
                ) : (
                  <span className={rowClasses}>{body}</span>
                )}
              </span>
            );
          })}
          {hidden > 0 ? (
            <span
              role="listitem"
              data-slot="status-stepper-overflow"
              className="text-caption text-ink-tertiary"
            >
              {describeOverflow(hidden)}
            </span>
          ) : null}
        </div>
      );
    }

    /* ---- Chapter 15's rail: equal columns, mark over connector, label under.
       ------------------------------------------------------------------- */
    if (variant === "steps") {
      return (
        <div
          ref={ref}
          {...rowProps}
          className={cn("flex w-full items-start", className)}
          {...props}
        >
          {visible.map((stage, index) => {
            const state = stateOf(stage, index);
            const isDone = state === "done";
            const isCurrent = state === "current";
            const key = stage.id ?? String(index);

            const mark = (
              <span
                data-slot="status-stepper-mark"
                className={cn(
                  markClasses,
                  isDone && "bg-surface-inverse text-ink-on-inverse",
                  isCurrent &&
                    "bg-[var(--surface-brand)] text-ink-on-accent font-[var(--font-weight-medium)]",
                  /* Not yet reached. The paper tone IS the separation; the
                     edge is the artifact's hairline drawn as an inset shadow,
                     never a `border` property (review 1A · fix 2). */
                  !isDone && !isCurrent && "bg-card text-ink-tertiary shadow-[var(--hairline)]",
                )}
              >
                {isDone ? (
                  <>
                    <span className="sr-only">{doneLabel}</span>
                    <Check size={16} aria-hidden="true" />
                  </>
                ) : (
                  formatNumber(index + 1)
                )}
              </span>
            );

            const body = (
              <>
                <span className="flex w-full items-center">
                  {mark}
                  {/* The connector. A hairline track holding a fill that
                      scales from the inline start; motion.css mirrors the
                      origin under dir="rtl". */}
                  <span
                    aria-hidden="true"
                    data-slot="status-stepper-connector"
                    className="h-px flex-1 overflow-hidden bg-border"
                  >
                    <span
                      className="motion-step-connector block h-full w-full bg-surface-inverse"
                      style={{ transform: `scaleX(${isDone ? 1 : 0})` }}
                    />
                  </span>
                </span>
                <span
                  data-slot="status-stepper-label"
                  className={cn(
                    "block w-full truncate pe-[var(--space-2h)] text-caption",
                    isCurrent && "font-[var(--font-weight-medium)]",
                    state === "later" ? "text-ink-tertiary" : "text-foreground",
                  )}
                >
                  {stage.label}
                </span>
              </>
            );

            return (
              <span
                key={key}
                role="listitem"
                data-slot="status-stepper-step"
                data-state={state}
                aria-current={isCurrent ? "step" : undefined}
                className="flex min-w-0 flex-1 flex-col gap-[var(--space-2h)]"
              >
                {pressable ? (
                  <button
                    type="button"
                    onClick={() => onStageSelect?.(index, stage)}
                    aria-label={
                      isCurrent ? describeProgress(index + 1, total) : undefined
                    }
                    className="flex w-full cursor-pointer flex-col gap-[var(--space-2h)] border-0 bg-transparent p-0 text-start"
                  >
                    {body}
                  </button>
                ) : (
                  body
                )}
              </span>
            );
          })}
        </div>
      );
    }

    /* ---- Chapter 23's hero row of pills. ------------------------------- */
    return (
      <div
        ref={ref}
        {...rowProps}
        className={cn("flex flex-wrap items-center gap-2", className)}
        {...props}
      >
        {visible.map((stage, index) => {
          const state = stateOf(stage, index);
          const isCurrent = state === "current";
          const isLater = state === "later";
          const key = stage.id ?? String(index);

          const skin = cn(
            pillClasses,
            isCurrent &&
              "bg-[var(--surface-brand)] text-ink-on-accent font-[var(--font-weight-medium)]",
            /* CORRECTLY DIVERGENT — do not "fix" `isLater` to tertiary.
               GAPS-CONTRAST §2 row 8 measures a later pill at 2.335:1 light /
               3.979:1 dark against 4.5, and it stays: CH23 asks for this pair
               by name, twice. Its specimen line reads "later stages take the
               quiet fill with disabled ink", and it gives the rule its own
               heading — "Later is disabled ink, not hidden … Stages still to
               come stay visible in the quiet fill. A record that hides its
               future reads as finished, and the client cannot see what they
               are waiting for."

               The trade the artifact made, stated: a later stage is NOT a
               disabled control — it is a word ("Versand", "Erledigt") the
               client reads to learn what is coming, and CH23's own next rule
               is that the numbers are "part of the name" because "we are at
               three of seven" is the sentence a client repeats back. That
               sentence is now painted in the one tier excused from being
               legible. Ruled, recorded in GAPS-CONTRAST "Resolved", and the
               artifact's to reverse. The overflow tail below inherits it. */
            isLater && "bg-surface-idle text-ink-disabled",
            !isCurrent && !isLater && "bg-card text-foreground",
            pressable && "cursor-pointer",
            // One defined step from each fill. Never --primary itself.
            pressable && isCurrent && "hover:bg-[var(--btn-primary-hover)]",
            pressable && !isCurrent && "hover:bg-surface-quiet",
          );

          const inner = (
            <>
              <span
                aria-hidden="true"
                data-slot="status-stepper-number"
                className={cn(
                  "tabular-nums",
                  // The current pill's number takes the charcoal label with
                  // the rest of the pill; every other number is one tier down.
                  isCurrent ? "text-ink-on-accent" : isLater ? "text-ink-disabled" : "text-ink-tertiary",
                )}
              >
                {formatNumber(index + 1)}
              </span>
              {stage.label}
              {isCurrent ? <span className="sr-only">{describeProgress(index + 1, total)}</span> : null}
            </>
          );

          return (
            /* A real wrapper rather than `display: contents`: a listitem that
               generates no box is dropped from the accessibility tree in more
               than one engine, and the wrapper costs nothing here because the
               row is `flex-wrap` and the wrapper is the flex item. */
            <span key={key} role="listitem">
              {pressable ? (
                <button
                  type="button"
                  data-slot="status-stepper-stage"
                  data-state={state}
                  aria-current={isCurrent ? "step" : undefined}
                  onClick={() => onStageSelect?.(index, stage)}
                  className={skin}
                >
                  {inner}
                </button>
              ) : (
                <span
                  data-slot="status-stepper-stage"
                  data-state={state}
                  aria-current={isCurrent ? "step" : undefined}
                  className={skin}
                >
                  {inner}
                </span>
              )}
            </span>
          );
        })}

        {hidden > 0 ? (
          // The kit's own tail: `--surface-idle` with disabled ink, no number
          // span, and no gap inside it.
          <span
            data-slot="status-stepper-overflow"
            role="listitem"
            className={cn(pillClasses, "bg-surface-idle text-ink-disabled")}
          >
            {describeOverflow(hidden)}
          </span>
        ) : null}
      </div>
    );
  },
);

StatusStepper.displayName = "StatusStepper";

export { StatusStepper };
