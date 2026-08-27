/* ============================================================================
   Gantt — the timeline body: one lane per app or owner, bars across periods.

   DESIGN SOURCE
   `KWAPSO-SPEC.md` CH19 view 04 (the specimen) and CH27.26 "Timeline view ·
   Sprints along a period, one lane per app" (the composition). CH27.26's own
   rules are the brief, verbatim:

       "One lane per record, always labelled — Lanes are apps, accounts or
        members, never nested groups. The label column is fixed at 132 and
        truncates with an ellipsis."

       "Bars take accents, never mango — Sky for build, forest for support,
        poppy for overrun, the same order as every chart in the kit. Type on a
        bar stays charcoal, which is why the accents were chosen: they carry
        ink at both values."

       "Length means duration — A bar spans the weeks the work actually spans,
        with a one-week floor so a short sprint stays clickable. Bars never
        stack vertically inside a lane; two overlapping sprints mean two lanes."

       "This week is marked, not centred — The current period column carries
        the emphasis; the view does not auto-scroll to keep today in the
        middle."

       "Six periods, then it steps — Six columns is the ceiling; beyond that
        the stepper moves the window rather than compressing the grid. A
        timeline never becomes a horizontal scroller inside the panel."

       "Narrow drops the grid, keeps the range — Below 720 each lane becomes a
        row: name, week range in tabular figures, and one bar with its label."

   CH27.26's drawn values, which is where the geometry comes from:
     · `grid-template-columns: minmax(96px, 132px) minmax(180px, 1fr)` — the
       label column and the track
     · `box-shadow: inset -1px 0 0 var(--hair)` — the rule between periods,
       an inset shadow, never a stroke property
     · `left: 0%  width: 34%` · `left: 36%` · `left: 68%  width: 16%` … — bars
       laid out in sixths of the track, which is the six-period ceiling
       showing up in the arithmetic

   OVERRIDE 28 (2026-08-23) — THE STEPPER SITS INSIDE THE TOOLBAR
   CH27.26 draws `‹ 6 weeks ›` inside the collection toolbar, between the
   search field and the view switch. This file used to draw it ABOVE the grid
   when handed `onPrevious`/`onNext`, and a composition that wanted the
   artifact's placement had to smuggle a stepper into the frame's `filters`
   slot. The client ruled for the artifact.

   So the DRAWING stays here — this is where CH27.26 is transcribed — and is
   exported as `GanttPeriodStepper`. The PLACEMENT moved to
   `CollectionFrame`'s new `period` slot. `Gantt` itself no longer renders a
   stepper and no longer takes `onPrevious`, `onNext`, `windowLabel`,
   `previousLabel` or `nextLabel`; a screen hands those to the stepper and the
   stepper to the frame. The consequence for the toolbar contract — that it
   CAN grow a slot — is written out in `collection-frame.tsx`, because that is
   the file the contract lives in.

   THE LAW THIS FILE OBEYS
   · SIX PERIODS IS A CEILING, NOT A HINT. Anything past `maxPeriods` is
     dropped from the window and the stepper is the only way to see it. This
     file sets no `overflow-x` anywhere: a timeline that scrolls sideways
     inside its panel is the thing CH27.26 forbids by name.
   · A BAR IS NEVER SHORTER THAN ONE PERIOD. `span` is floored at 1 before it
     reaches the grid, so a two-day sprint is still a target.
   · BARS ARE PLACED BY GRID COLUMN, NOT BY PERCENTAGE. Same arithmetic, but
     the browser owns it, so a bar cannot drift out of register with the
     column rules behind it and the lane's height is the bar's own.
   · THE ACCENT TONES ARE `--chart-1` / `--chart-2` / `--chart-3` — sky,
     forest, poppy, in the kit's chart order. There is no fourth accent:
     `--chart-4` and `--chart-5` repeat 1 and 2 (spec, still-open register)
     and a timeline that used them would draw two tones that mean different
     things and look the same. Ink on an accent bar is `--ink-on-accent`.
   · TWO MORE FILLS EXIST, AND THEY ARE THE ARTIFACT'S OWN (client re-audit
     2026-08-26, "reference to the pdf"). CH19 view 04 — the gantt the kit
     itself draws — fills its segments five ways: Audit sky, Build MANGO,
     Validation forest, Training poppy, Refinement INK, each label at
     `seg.fg = ONACC` except ink's `ONINK`. This file used to refuse mango
     outright on CH27.26's sentence ("Bars take accents, never mango — sky
     for build, forest for support, poppy for overrun"), and the two chapters
     genuinely disagree: 27.26 rules for its three-tone key, CH19 draws five
     fills. The client's re-audit order points at the PDF, so the DRAWING'S
     two extra fills are now reachable — `tone="brand"` (mango) and
     `tone="inverse"` (charcoal), the same names `tiles` gives the same two
     fills — and nothing else moves: the default stays `build` (sky), the
     legend stays CH27.26's three-tone key, and no tone is applied by this
     file on its own. A brand bar is a MARK, not an action (override 17
     counts actions), and which records take it is the caller's data.
   · Focus is one global rule (tokens.css §8). Nothing here draws a ring, and
     nothing here clips one: no `overflow: hidden` on a lane or a track.
   · Disabled is a fill and an ink (`--btn-disabled-fill` /
     `--btn-disabled-label`), never an opacity.
   · Radii: 24 on the boxes, 4 on a bar and on a legend swatch (ruling 03 —
     "4 on a bar, a heat cell or the rotated decision node").
   · No `border` property. The period rule is `--hairline-start`.
   · rem only. Every user-facing string is a prop with a default. LTR only.

   RENDERING CONTEXT
   `"use client"`. A pressable bar and a stepper mean handlers are built during
   this module's own render.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { Button } from "../button/button";
import { ChevronLeft, ChevronRight } from "../../foundations/icons";
import { CollectionRegister } from "../collection-frame/collection-frame";

/* ----------------------------------------------------------------------------
   The three tones, in the kit's chart order. Written out rather than
   interpolated, because Tailwind compiles the class names it can see.
   ------------------------------------------------------------------------- */
const BAR_TONE = {
  /** Sky — `--chart-1`. CH27.26: "Sky for build". */
  build: "bg-chart-1",
  /** Forest — `--chart-2`. "forest for support". */
  support: "bg-chart-2",
  /** Poppy — `--chart-3`. "poppy for overrun". */
  overrun: "bg-chart-3",
  /** Mango — CH19 view 04's own Build segments. A mark, never an action. */
  brand: "bg-surface-brand",
  /** Charcoal — CH19 view 04's Refinement segments. Off-beige label. */
  inverse: "bg-surface-inverse",
} as const;

/* The label's ink follows the fill: charcoal on every accent and on mango
   (the accent law), off-beige on the charcoal bar — CH19's own `seg.fg`. */
const BAR_INK = {
  build: "text-ink-on-accent",
  support: "text-ink-on-accent",
  overrun: "text-ink-on-accent",
  brand: "text-ink-on-accent",
  inverse: "text-ink-on-inverse",
} as const;

export type GanttTone = keyof typeof BAR_TONE;

export interface GanttBar {
  /** Stable key, and the handle `onBarSelect` is given. Falls back to the index. */
  id?: string;
  /** What the bar says. Charcoal on the accent, and it truncates. */
  label?: React.ReactNode;
  /** Which period the work starts in, zero-based against `periods`. */
  start: number;
  /**
   * How many periods it spans. Floored at 1 — CH27.26's one-week floor — so a
   * short sprint stays clickable. Undefined is one period.
   */
  span?: number;
  /**
   * Sky, forest, poppy — CH27.26's three — plus CH19 view 04's own two:
   * `brand` (mango, the drawing's Build segments) and `inverse` (charcoal,
   * its Refinement segments). Defaults to `build` (sky).
   */
  tone?: GanttTone;
  /**
   * The period range in words, for the narrow row. Undefined derives it from
   * `periods` where those are strings, which is what the kit's own drawing
   * shows ("W32 – W34").
   */
  range?: React.ReactNode;
  /** Cannot be opened. A fill and an ink; the bar still reads. */
  disabled?: boolean;
}

export interface GanttLane {
  /** Stable key. Falls back to the index. */
  id?: string;
  /**
   * The lane's name — an app, an account or a member. CH27.26: never a nested
   * group. Truncates at the fixed label column.
   */
  label: React.ReactNode;
  /**
   * The lane's bars. They may not overlap: CH27.26 rules that two overlapping
   * sprints are two lanes. This file does not stack them and does not sort.
   */
  bars?: readonly GanttBar[];
}

export interface GanttProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onSelect"> {
  /**
   * The columns across the top — weeks, usually. Already formatted by the
   * caller: ruling 07 makes date wording follow the app language, which a
   * component cannot know. Anything past `maxPeriods` is dropped.
   */
  periods: readonly React.ReactNode[];
  /** The lanes, in the order they should read. This component never sorts. */
  lanes: readonly GanttLane[];
  /**
   * Which period is "this week", zero-based. That column carries the
   * emphasis. The view never scrolls to centre it — CH27.26 by name.
   */
  currentPeriod?: number;
  /** The ceiling. Six, and CH27.26 states it as a ceiling rather than a default. */
  maxPeriods?: number;

  /* THE STEPPER IS NOT HERE. Override 28 puts it in the toolbar: pass
     `GanttPeriodStepper` (below) into `CollectionFrame`'s `period` slot. */

  /** Opening a bar. Without it a bar is not a target and takes no tab stop. */
  onBarSelect?: (bar: GanttBar, lane: GanttLane) => void;

  /** How wide the lane label column is. CH27.26 fixes it. rem only. */
  labelWidth?: string;

  /** Draw the three-tone key under the grid, as CH27.26 does. */
  legend?: boolean;
  legendBuildLabel?: string;
  legendSupportLabel?: string;
  legendOverrunLabel?: string;

  /** Joins the two ends of a derived range on the narrow row. */
  rangeSeparator?: string;
  /** What a screen reader hears for the marked column. */
  currentPeriodLabel?: string;

  /* ---- the three registers ------------------------------------------------ */
  /** The lanes have not arrived. Beats `error` and `empty`. */
  loading?: boolean;
  /** The lanes failed to arrive. Beats `empty`. */
  error?: boolean;
  /** Force the empty register. No lanes is already empty. */
  empty?: boolean;
  loadingState?: React.ReactNode;
  emptyState?: React.ReactNode;
  errorState?: React.ReactNode;
  loadingLabel?: string;
  emptyLabel?: string;
  emptyBody?: string;
  errorLabel?: string;
  errorBody?: string;

  /** The grid's accessible name. */
  label?: string;
}

/* ============================================================================
   GanttPeriodStepper — CH27.26's `‹ 6 weeks ›`, drawn here and PLACED in the
   collection toolbar's `period` slot (override 28).
   ========================================================================= */

export interface GanttPeriodStepperProps
  extends React.ComponentPropsWithoutRef<"div"> {
  /** Move the window back. Without it the back control is not rendered. */
  onPrevious?: () => void;
  /** Move the window on. Without it the forward control is not rendered. */
  onNext?: () => void;
  /** What sits between the two arrows — the kit draws the window's size. */
  windowLabel?: React.ReactNode;
  /** The back control's accessible name. */
  previousLabel?: string;
  /** The forward control's accessible name. */
  nextLabel?: string;
}

/**
 * The period stepper.
 *
 * TEN STATES
 *  1. default        — two icon buttons with the window's size between them.
 *  2. hover          — `Button`'s own, on the two arrows.
 *  3. focus-visible  — NOT here. tokens.css §8 rings both arrows at once.
 *  4. active/pressed — `Button`'s 1-hairline nudge.
 *  5. disabled       — an arrow with no handler is NOT RENDERED rather than
 *                      drawn dead: a control that cannot move the window is
 *                      not a control, and a tab stop that does nothing is
 *                      worse than a missing one. That is how the ends of a
 *                      range are expressed.
 *  6. loading        — does not apply. The window's own size is known before
 *                      the lanes in it are.
 *  7. empty          — no `windowLabel` and no handlers: nothing renders.
 *  8. error          — does not apply; the body carries the failure.
 *  9. selected       — does not apply.
 * 10. read-only      — neither handler: the label alone, which is the honest
 *                      read-only for a window you may see but not move.
 *
 * THREE BREAKPOINTS — one drawing. The label never wraps, so the stepper
 * stays one readable control on the toolbar's wrapping row at 380.
 *
 * RTL — safe: the arrows are logical-start and logical-end by DOM order and
 * the row mirrors whole. The system is LTR only.
 */
const GanttPeriodStepper = React.forwardRef<HTMLDivElement, GanttPeriodStepperProps>(
  (
    {
      className,
      onPrevious,
      onNext,
      windowLabel,
      previousLabel = "Earlier",
      nextLabel = "Later",
      ...props
    },
    ref,
  ) => {
    if (!onPrevious && !onNext && (windowLabel === undefined || windowLabel === null)) {
      return null;
    }

    return (
      <div
        ref={ref}
        data-slot="gantt-stepper"
        className={cn("flex items-center gap-2", className)}
        {...props}
      >
        {onPrevious ? (
          <Button variant="secondary" size="icon" aria-label={previousLabel} onClick={onPrevious}>
            <ChevronLeft />
          </Button>
        ) : null}
        {windowLabel === undefined || windowLabel === null ? null : (
          <span className="whitespace-nowrap text-caption tabular-nums text-ink-tertiary">
            {windowLabel}
          </span>
        )}
        {onNext ? (
          <Button variant="secondary" size="icon" aria-label={nextLabel} onClick={onNext}>
            <ChevronRight />
          </Button>
        ) : null}
      </div>
    );
  },
);

GanttPeriodStepper.displayName = "GanttPeriodStepper";

/** Only a string can be joined into a range. A node is left to the caller. */
function asText(node: React.ReactNode): string | null {
  return typeof node === "string" || typeof node === "number" ? String(node) : null;
}

/**
 * Lanes and bars across a bounded window of periods.
 *
 * TEN STATES
 *  1. default        — a head of period names, a lane per record, bars placed
 *                      by grid column, an optional key under it.
 *  2. hover          — on a BAR that is a target, and nowhere else: the tone
 *                      keeps its fill and the bar takes `.motion-hover-lift`'s
 *                      elevation. A named shadow, never an opacity, never a
 *                      second colour — a bar whose fill changed under the
 *                      pointer would be reporting a different state.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once, at
 *                      the control's own radius, which for a bar is 4. No box
 *                      in this file clips it.
 *  4. active/pressed — a bar navigates, and the acknowledgement is the record
 *                      arriving. The stepper's own press belongs to
 *                      `GanttPeriodStepper`, which is in the toolbar.
 *  5. disabled       — per bar: `--btn-disabled-fill` / `--btn-disabled-label`,
 *                      `aria-disabled`, no hover, and no tab stop that does
 *                      nothing. A fill and an ink.
 *  6. loading        — `loading`: the busy register in place of the grid. The
 *                      lane count and the period count are both unknown before
 *                      the data lands, so there is no known shape to draw a
 *                      skeleton of — unlike a list, where the row height is
 *                      stated. Logged in GAPS-TRACK2A (GNT-6).
 *  7. empty          — no lanes, or `empty`: the quiet register. A window with
 *                      no work in it must say so; the period head alone would
 *                      read as a broken grid.
 *  8. error          — `error`: the register with a poppy dot and its own
 *                      wording. Beats empty.
 *  9. selected       — does not apply. A timeline is read and pointed at; the
 *                      kit draws no selected bar, and none is invented.
 * 10. read-only      — without `onBarSelect` the whole view is read-only and
 *                      still reads completely, which is the point of it.
 *
 * THREE BREAKPOINTS
 *  · mobile (base, to 45rem / the kit's 720) — THE GRID GOES. Each lane
 *    becomes a row: the name, the period range in tabular figures, and one
 *    bar with its label. CH27.26: "The proportions go; the facts stay." The
 *    key stays drawn, because the window is still a window — and so does the
 *    stepper, in the toolbar above, where override 28 put it.
 *  · tablet (`min-[45rem]:`) — the grid, at its full width. This is the kit's
 *    own stated threshold, not a Tailwind default, so it is written as one.
 *  · desktop — unchanged in kind. More width is spent on the track; the label
 *    column stays fixed, which is what keeps the lanes readable.
 *
 * RTL — LTR only (ruling 10). Every inset is logical and the one rule between
 * periods is `--hairline-start`, which is on the inline axis.
 */
const Gantt = React.forwardRef<HTMLDivElement, GanttProps>(
  (
    {
      className,
      periods,
      lanes,
      currentPeriod,
      maxPeriods = 6,
      onBarSelect,
      labelWidth = "8.25rem",
      legend = true,
      legendBuildLabel = "Build",
      legendSupportLabel = "Support",
      legendOverrunLabel = "Overrun",
      rangeSeparator = " – ",
      currentPeriodLabel = "This period",
      loading = false,
      error = false,
      empty = false,
      loadingState,
      emptyState,
      errorState,
      loadingLabel = "Loading…",
      emptyLabel = "Nothing here",
      emptyBody = "Nothing runs in this window.",
      errorLabel = "Unavailable",
      errorBody = "We can’t show this right now. Try again in a moment.",
      label = "Timeline",
      style,
      ...props
    },
    ref,
  ) => {
    /* Six is the ceiling. Everything past it belongs to another window and is
       reached with the stepper, never with a scrollbar. */
    const window_ = periods.slice(0, Math.max(1, maxPeriods));
    const count = window_.length;

    /* Exclusive states resolved in JS (PATTERN §4): loading beats error beats
       empty. A request in flight has not failed; a failed one is not empty. */
    const state = loading
      ? "loading"
      : error
        ? "error"
        : empty || lanes.length === 0
          ? "empty"
          : "default";

    const legendNode = legend ? (
      <div
        data-slot="gantt-legend"
        className="flex flex-wrap items-center gap-x-[var(--space-5)] gap-y-2 pt-[var(--space-3h)] shadow-[var(--hairline-over)]"
      >
        {(
          [
            ["build", legendBuildLabel],
            ["support", legendSupportLabel],
            ["overrun", legendOverrunLabel],
          ] as const
        ).map(([tone, text]) => (
          <span key={tone} className="inline-flex items-center gap-2 text-caption text-ink-secondary">
            <span
              aria-hidden="true"
              className={cn(
                // 11, the kit's own legend swatch, at the bar radius.
                "size-[0.6875rem] flex-none rounded-[var(--radius-bar)]",
                BAR_TONE[tone],
              )}
            />
            {text}
          </span>
        ))}
      </div>
    ) : null;

    /* One bar, drawn either into a grid cell or into a narrow row. The tone,
       the ink and the two exclusive skins are decided here once so the two
       renders cannot drift. */
    const renderBar = (bar: GanttBar, lane: GanttLane, index: number, placed: boolean) => {
      const span = Math.max(1, Math.floor(bar.span ?? 1));
      const start = Math.max(0, Math.floor(bar.start));
      const pressable = Boolean(onBarSelect) && bar.disabled !== true;

      const tone = bar.tone ?? "build";
      const skin = bar.disabled
        ? "bg-[var(--btn-disabled-fill)] text-[var(--btn-disabled-label)]"
        : cn(BAR_TONE[tone], BAR_INK[tone], pressable && "motion-hover-lift");

      const classes = cn(
        "flex min-w-0 items-center rounded-[var(--radius-bar)] px-2 py-1",
        /* The bar's own label is drawn `font-size: 10px; font-weight: 500`.
           10 is below the ladder's floor, so it takes `text-micro` (11) —
           the nearest step — with the eyebrow tracking reset, not
           `text-badge` (12), which was two rungs off it. */
        "text-micro tracking-[var(--tracking-normal)] font-[var(--font-weight-medium)] text-start",
        skin,
        pressable && "cursor-pointer",
        bar.disabled && "cursor-not-allowed",
        // In the grid the bar sits inside its columns with the drawn 4 of air.
        placed && "my-1",
      );

      const placement = placed
        ? { gridRow: 1, gridColumn: `${start + 1} / span ${Math.min(span, count - start)}` }
        : undefined;

      const inner = <span className="truncate">{bar.label}</span>;

      return pressable ? (
        <button
          key={bar.id ?? String(index)}
          type="button"
          data-slot="gantt-bar"
          data-tone={bar.tone ?? "build"}
          style={placement}
          onClick={() => onBarSelect?.(bar, lane)}
          /* NOT `[font:inherit]`: Tailwind emits that arbitrary property AFTER
             the named utilities in the bundle, so the shorthand was silently
             overriding the bar's own `text-micro` + 500 in `classes` — a
             pressable bar measured 15/300 (the surrounding type) in the live
             demo while the read-only span bar beside it kept its 10.3/500.
             Preflight already gives a <button> `font: inherit`; the named
             classes then own the step. */
          className={cn("appearance-none", classes)}
        >
          {inner}
        </button>
      ) : (
        <span
          key={bar.id ?? String(index)}
          data-slot="gantt-bar"
          data-tone={bar.tone ?? "build"}
          aria-disabled={bar.disabled || undefined}
          style={placement}
          className={classes}
        >
          {inner}
        </span>
      );
    };

    /* The narrow row's range: the caller's words if it gave any, otherwise the
       two ends of the window it actually spans. Nothing is formatted here. */
    const rangeOf = (bar: GanttBar): React.ReactNode => {
      if (bar.range !== undefined) return bar.range;
      const span = Math.max(1, Math.floor(bar.span ?? 1));
      const from = asText(window_[bar.start]);
      const to = asText(window_[Math.min(count - 1, bar.start + span - 1)]);
      if (from === null || to === null) return null;
      return from === to ? from : `${from}${rangeSeparator}${to}`;
    };

    let body: React.ReactNode = null;

    if (state === "loading") {
      body =
        loadingState ?? <CollectionRegister tone="busy" eyebrow={loadingLabel} busyLabel={loadingLabel} />;
    } else if (state === "error") {
      body = errorState ?? <CollectionRegister tone="error" eyebrow={errorLabel} body={errorBody} />;
    } else if (state === "empty") {
      body = emptyState ?? <CollectionRegister tone="quiet" eyebrow={emptyLabel} body={emptyBody} />;
    } else {
      const tracks = `repeat(${count}, minmax(0, 1fr))`;

      body = (
        <>
          {/* ---- narrow: no grid, one row per lane -------------------------- */}
          <div data-slot="gantt-rows" className="flex flex-col gap-3 min-[45rem]:hidden">
            {lanes.map((lane, laneIndex) => {
              /* CH27.26's narrow row carries ONE bar. Which one it should be
                 is not stated; the first in the lane is taken, because this
                 component never sorts and the caller's order is the answer it
                 already chose. GAPS-TRACK2A GNT-4. */
              const bar = lane.bars?.filter((b) => Math.floor(b.start) < count)[0];
              return (
                <div
                  key={lane.id ?? String(laneIndex)}
                  data-slot="gantt-row"
                  /* `--card`, NOT `--surface-panel`. This lane card stands
                     INSIDE `CollectionFrame`'s panel, and since the K1
                     reversal (override 15) that panel IS `--surface-panel`:
                     a soft-paper card on soft paper measured 1.000 at 380,
                     which is the width this row exists for. `--card` is the
                     off-beige lift every other card inside the panel takes
                     — 1.103 light, 1.111 dark. The kit draws no narrow gantt
                     at all, so only the ground moved; the row itself is
                     27.26's own one-bar-per-lane render (GNT-4). */
                  className="flex min-w-0 flex-col gap-2 rounded-[var(--radius)] bg-card p-[var(--space-3h)]"
                >
                  <span className="flex min-w-0 items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-[var(--font-weight-medium)]">
                      {lane.label}
                    </span>
                    {bar ? (
                      <span className="flex-none text-caption tabular-nums text-ink-tertiary">
                        {rangeOf(bar)}
                      </span>
                    ) : null}
                  </span>
                  {bar ? renderBar(bar, lane, 0, false) : null}
                </div>
              );
            })}
          </div>

          {/* ---- the grid --------------------------------------------------- */}
          <div
            data-slot="gantt-grid"
            aria-label={label}
            className="hidden min-w-0 flex-col min-[45rem]:flex"
          >
            {/* The head: a blank label cell, then the period names. */}
            <div
              data-slot="gantt-head"
              /* The artifact's own inset: `padding: 6px 12px 8px`. The inline
                 12 had been dropped, so the head's first character did not
                 line up with the lane label under it. */
              className="grid items-end gap-[var(--space-3h)] px-3 pt-[var(--space-1h)] pb-2 shadow-[var(--hairline-under)]"
              style={{ gridTemplateColumns: `var(--gantt-label) minmax(0, 1fr)` }}
            >
              <span aria-hidden="true" />
              <div className="grid" style={{ gridTemplateColumns: tracks }}>
                {window_.map((period, i) => (
                  <span
                    key={i}
                    aria-current={i === currentPeriod ? true : undefined}
                    className={cn(
                      /* The period name is NOT an eyebrow. The artifact draws
                         it `font-size: 11px; color: var(--fg3);
                         font-variant-numeric: tabular-nums` — no uppercase,
                         no 500, and tabular, because "W31" and "W8" have to
                         line up down the head. */
                      "min-w-0 truncate px-2 text-micro tracking-[var(--tracking-normal)] tabular-nums",
                      i === currentPeriod ? "text-foreground" : "text-ink-tertiary",
                    )}
                  >
                    {period}
                    {i === currentPeriod ? (
                      /* The mark is a wash, and a wash is not announced. The
                         words are, once, on the column it belongs to. */
                      <span className="sr-only">{` ${currentPeriodLabel}`}</span>
                    ) : null}
                  </span>
                ))}
              </div>
            </div>

            {/* One lane per record. */}
            {lanes.map((lane, laneIndex) => (
              <div
                key={lane.id ?? String(laneIndex)}
                data-slot="gantt-lane"
                /* `padding: 11px 12px` — the block inset snapped to the
                   ladder's 12, the inline 12 exact. `py-1` was 4. */
                className="grid items-center gap-[var(--space-3h)] px-3 py-3 shadow-[var(--hairline-under)] last:shadow-none"
                style={{ gridTemplateColumns: `var(--gantt-label) minmax(0, 1fr)` }}
              >
                <span
                  data-slot="gantt-lane-label"
                  className="min-w-0 truncate text-sm font-[var(--font-weight-medium)]"
                >
                  {lane.label}
                </span>

                {/* The track. The ground cells and the bars share row 1, so a
                    bar sits over its own periods and the lane's height is the
                    bar's own. No overflow is set: the window never scrolls. */}
                <div
                  data-slot="gantt-track"
                  className="grid min-w-0"
                  style={{ gridTemplateColumns: tracks }}
                >
                  {window_.map((_, i) => (
                    <span
                      key={i}
                      aria-hidden="true"
                      data-current={i === currentPeriod || undefined}
                      style={{ gridRow: 1, gridColumn: i + 1 }}
                      className={cn(
                        "h-full min-h-[var(--control-height-pill)]",
                        // The rule between periods, as an inset shadow.
                        i > 0 && "shadow-[var(--hairline-start)]",
                        // Marked, not centred: the emphasis is the neutral wash.
                        i === currentPeriod && "bg-accent",
                      )}
                    />
                  ))}

                  {/* A bar that starts past the window belongs to another
                      window and is reached with the stepper, not drawn at the
                      edge. GAPS-TRACK2A GNT-7. */}
                  {(lane.bars ?? [])
                    .filter((bar) => Math.floor(bar.start) < count)
                    .map((bar, i) => renderBar(bar, lane, i, true))}
                </div>
              </div>
            ))}
          </div>
        </>
      );
    }

    return (
      <div
        ref={ref}
        data-slot="gantt"
        data-state={state}
        aria-busy={loading || undefined}
        style={{ ["--gantt-label" as string]: labelWidth, ...style }}
        className={cn("flex min-w-0 flex-col gap-[var(--space-3h)]", className)}
        {...props}
      >
        {body}
        {state === "default" ? legendNode : null}
      </div>
    );
  },
);

Gantt.displayName = "Gantt";

export { Gantt, GanttPeriodStepper };
