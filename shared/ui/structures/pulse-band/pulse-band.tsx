/* ============================================================================
   PulseBand — four weeks by seven days, closed periods only (0 direct call
   sites; a record-page block, not a collection body).

   DESIGN SOURCE
   Kit chapter 17 ("Tables & lists"), the "Pulse band" block, read out of
   `Design Mothership/kit-current/Kwapso UI Kit.dc.html`. Its four panels are
   the whole specification and all four are quoted verbatim:

       "Closed periods, never now
        The band ends at the last completed day. Nothing on it moves, grows or
        animates — it is a record of what happened, which is why it survives
        the standing rule against tickers."

       "It shows when, not how much
        A figure row already states the totals. The band exists to expose the
        shape — the Monday pile-up, the dead Friday — so a founder can argue
        about capacity rather than volume."

       "Four steps and an empty
        The mango ramp from the heat map, plus the quiet fill for a day with
        nothing. No fifth step, no second hue, and never an accent — colour
        here means quantity, not status."

       "Weekends are drawn
        A weekend with no work is shown empty rather than removed. A band that
        hides its zeros makes five days look like seven."

   and the block's own strapline, verbatim: "Four weeks by seven days · closed
   periods only".

   NOTE FOR THE READER OF THE BRIEF: the band is chapter SEVENTEEN, not
   eighteen. Chapter 18 ("Data display") owns the KPIs, the charts, the
   calendar and the board, and draws no band. Logged as GAPS-TRACK2B PB-1.

   THE DRAWING, transcribed
     · the block  — `--sheet` at radius 24, `padding: 24px`, column gap 12
     · the head   — a 13/500 line, and the range pushed to the inline end at
                    12px tertiary, tabular
     · the grid   — `grid-template-columns: 34px repeat(7, minmax(0, 1fr))`,
                    `gap: 6px`, one row of day letters at 11px tertiary and
                    one row per week, `align-items: center`
     · a day cell — `height: 18px`, `border-radius: 6px`, a fill from the ramp
                    (built at 4 - ruling L1 below)
     · the legend — "Light", four 14x10 swatches at `border-radius: 4px`,
                    "Heavy", and the note pushed to the inline end

   THE DAY CELL IS 4, NOT THE 6 IT IS DRAWN AT - RULED L1
   Client ruling L1, 2026-08-23, verify/decisions.html L. The day cell is
   drawn at 6 here and the chapter-19 heat cell at 4, and they are the same
   object: a small square taking a fill from the same four-step ramp. Both
   radii are legal under ruling 03, so both were built as drawn and the
   asymmetry was put to the client rather than reconciled. The answer is that
   the ramp cell is ONE object at ONE radius, which is what `tokens.css`
   already says `--radius-sm` is for: "bars, heat cells, nodes". So the cell
   below takes `--radius-bar`, and the legend swatch, already drawn at 4, was
   right all along. The artifact owes a correction on this chapter, and the
   asymmetry stays logged at GAPS-TRACK2B PB-2.

   THE MANGO TRAP
   Ruling 26 and chapter 2 make mango a brand fill and never a data colour.
   This block and `Heatmap` are the two the artifact exempts, by name. The
   ramp lives in `../heatmap/heat-scale.css`, imported from there rather than
   restated, because chapter 17 says it in those words: "the mango ramp FROM
   THE HEAT MAP". A third consumer of `--heat-*` is a bug.

   NO MOTION, EVER
   "Nothing on it moves, grows or animates." There is no transition, no
   animation and no `motion-*` class in this file, and the loading register is
   the only place a `Skeleton` breathes — which is the shell waiting, not the
   band ticking.

   RENDERING CONTEXT
   No `"use client"`. It forwards props and a ref, holds no state, calls no
   hook and creates no handler during its own render.
   ========================================================================= */

import * as React from "react";

import { cn } from "../../lib/utils";
import { Skeleton } from "../../controls/skeleton/skeleton";
import { CollectionRegister } from "../collection-frame/collection-frame";
import { HEAT_FILL, type HeatLevel } from "../heatmap/heatmap";

/* The same four steps and the same empty step as the heat map. Imported for
   its side effect only — the tokens — exactly as `heatmap.tsx` does. */
/** Seven. The band is four weeks BY SEVEN DAYS and a short week is padded, not shortened. */
const DAYS_IN_WEEK = 7;

export interface PulseWeek {
  /**
   * React key. Required: a band re-based onto a different range replaces
   * every week, and a positional key would carry the old week's shape over.
   */
  id: string;
  /** The week's own label — the artifact draws "W31" … "W34" at the inline start. */
  label: React.ReactNode;
  /**
   * One level per day, Monday first, `0` for a day with nothing. Short weeks
   * are padded to seven with the empty step: "a band that hides its zeros
   * makes five days look like seven".
   */
  days: HeatLevel[];
}

export interface PulseBandProps extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  /**
   * The weeks, oldest first. The artifact draws four. More or fewer are
   * accepted — the number of weeks is the record's, not this file's — and the
   * seven columns are fixed.
   */
  weeks?: PulseWeek[];

  /** The 13/500 line at the head of the block. */
  title?: React.ReactNode;
  /** The range pushed to the inline end of that line — the artifact's "W31–W34". */
  range?: React.ReactNode;

  /**
   * The seven column letters, starting on the day the application's week
   * starts. The artifact draws M T W T F S S; an application whose week
   * starts on Sunday passes its own, and so does one in another language.
   */
  dayLabels?: [string, string, string, string, string, string, string];
  /** How wide the week-label column is. The artifact's figure is 34 at the 16 base. */
  weekLabelWidth?: string;

  /** Whether the ramp legend is drawn under the band. The artifact draws it. */
  legend?: boolean;
  /** The word at the light end of the legend. */
  legendLightLabel?: string;
  /** The word at the heavy end. */
  legendHeavyLabel?: string;
  /** The note pushed to the inline end of the legend row. */
  legendNote?: React.ReactNode;

  /**
   * The words behind one day, for a screen reader and for the pointer's
   * title. A function, not a template: the word order changes per language,
   * and colour may never carry the meaning alone (ruling 26).
   */
  dayLabel?: (args: {
    week: PulseWeek;
    dayIndex: number;
    dayName: string;
    level: HeatLevel;
  }) => string;
  /** The five step names, used by the default `dayLabel`, lightest first. */
  levelLabels?: [string, string, string, string, string];

  /** Accessible name for the band as a whole. */
  label?: string;

  /**
   * The ground the band is drawn on. `panel` is the artifact's own block —
   * soft paper at radius 24 with a 24 inset. `bare` draws neither, for a band
   * already inside a panel.
   */
  ground?: "panel" | "bare";

  /** The band has not arrived. Cold cache only. */
  loading?: boolean;
  /** The request failed. Beats `empty`. */
  error?: boolean;
  /** Force the empty register even with weeks present. */
  empty?: boolean;
  loadingState?: React.ReactNode;
  emptyState?: React.ReactNode;
  errorState?: React.ReactNode;
  loadingLabel?: string;
  emptyLabel?: string;
  emptyBody?: string;
  errorLabel?: string;
  errorBody?: string;
}

/**
 * Where the work fell, over four closed weeks.
 *
 * TEN STATES
 *  1. default        — four rows of seven fills, the ramp, and the legend.
 *  2. hover          — NONE. "Nothing on it moves"; a day is a reading, not a
 *                      target, and its value is already on the cell in words.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      The band holds no control and nothing in it is
 *                      focusable.
 *  4. active/pressed — does not apply, for the same reason as hover.
 *  5. disabled       — does not apply. A day with nothing is the EMPTY STEP,
 *                      which is a fill. It is never a dimmed cell: dimming is
 *                      an opacity and an opacity is a rejection.
 *  6. loading        — `loading`: four `Skeleton` bars in the band's own
 *                      grid, so the placeholder is the shape of the band.
 *  7. empty          — no weeks, or `empty`: the quiet register. A record
 *                      with no closed period yet says so in a sentence; it
 *                      does not draw four rows of empty cells, which would
 *                      claim four weeks of measured nothing.
 *  8. error          — `error`: the register with a poppy dot and its own
 *                      wording. Beats `empty`.
 *  9. selected       — does not apply. The artifact draws no selected day and
 *                      the band answers no click.
 * 10. read-only      — always, and emphatically: "closed periods, never now".
 *                      The band is a record of what happened.
 *
 * THREE BREAKPOINTS, and the 380 answer
 *  · mobile (base) — UNCHANGED, and it fits. Seven `minmax(0, 1fr)` columns
 *    behind a 2.125rem label column leave about 3rem a day at 380, which is
 *    wider than the drawn 18-tall cell needs. The head line and the legend
 *    row both WRAP (`flex-wrap`, as drawn): the range drops under the title
 *    and the note drops under the swatches rather than either being cut.
 *    Nothing scrolls and no column is dropped — dropping a column would drop
 *    a weekend, which is the one thing panel four forbids.
 *  · tablet (`sm:`) / desktop (`lg:`) — UNCHANGED. The artifact draws one
 *    band at one size and the columns simply share more width.
 *
 * RTL — safe, and unused: the system is LTR only (ruling 10). Every inset is
 * logical, `ms-auto` does the pushing, and no side is named.
 */
const PulseBand = React.forwardRef<HTMLDivElement, PulseBandProps>(
  (
    {
      className,
      weeks = [],
      title,
      range,
      dayLabels = ["M", "T", "W", "T", "F", "S", "S"],
      weekLabelWidth = "2.125rem",
      legend = true,
      legendLightLabel = "Light",
      legendHeavyLabel = "Heavy",
      legendNote,
      dayLabel,
      levelLabels = ["Nothing", "Light", "Some", "Heavy", "Heaviest"],
      label,
      ground = "panel",
      loading = false,
      error = false,
      empty = false,
      loadingState,
      emptyState,
      errorState,
      loadingLabel = "Loading…",
      emptyLabel = "Nothing closed yet",
      emptyBody = "The band starts at the first completed day.",
      errorLabel = "Unavailable",
      errorBody = "We can’t show this right now. Try again in a moment.",
      ...props
    },
    ref,
  ) => {
    /* Exclusive states resolved in JS (PATTERN §4). */
    const state = loading
      ? "loading"
      : error
        ? "error"
        : weeks.length === 0 || empty
          ? "empty"
          : "default";

    /* The artifact's own template, with the label column as a prop. A count
       and a length, neither of which a utility can see. */
    const template = {
      gridTemplateColumns: `${weekLabelWidth} repeat(${DAYS_IN_WEEK}, minmax(0, 1fr))`,
    } satisfies React.CSSProperties;

    const describe =
      dayLabel ??
      (({ week, dayName, level }: { week: PulseWeek; dayName: string; level: HeatLevel }) =>
        `${typeof week.label === "string" ? week.label : ""} ${dayName} — ${
          levelLabels[level]
        }`.trim());

    return (
      <div
        ref={ref}
        data-slot="pulse-band"
        data-state={state}
        aria-busy={loading || undefined}
        aria-label={label}
        className={cn(
          "flex min-w-0 flex-col gap-3",
          ground === "panel" && "rounded-[var(--radius)] bg-surface-panel p-6",
          className,
        )}
        {...props}
      >
        {title !== undefined || range !== undefined ? (
          <div className="flex min-w-0 flex-wrap items-baseline gap-3">
            {title !== undefined ? (
              <span className="text-caption font-[var(--font-weight-medium)]">{title}</span>
            ) : null}
            {range !== undefined ? (
              <span className="ms-auto text-xs text-ink-tertiary tabular-nums">{range}</span>
            ) : null}
          </div>
        ) : null}

        {state === "error"
          ? (errorState ?? (
              <CollectionRegister tone="error" eyebrow={errorLabel} body={errorBody} />
            ))
          : null}

        {state === "empty"
          ? (emptyState ?? (
              <CollectionRegister tone="quiet" eyebrow={emptyLabel} body={emptyBody} />
            ))
          : null}

        {state === "loading"
          ? (loadingState ?? (
              <div className="flex flex-col gap-[var(--space-1h)]" role="status" aria-label={loadingLabel}>
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton
                    key={i}
                    className="h-[1.125rem]"
                    announce={i === 0}
                    label={loadingLabel}
                  />
                ))}
              </div>
            ))
          : null}

        {state === "default" ? (
          <div className="flex min-w-0 flex-col gap-[var(--space-1h)]">
            {/* The day letters. Hidden from the reader of the words, because
                every cell already names its own day in full. */}
            <div
              data-slot="pulse-band-days"
              aria-hidden="true"
              className="grid gap-[var(--space-1h)] text-micro text-ink-tertiary"
              style={template}
            >
              <span />
              {dayLabels.map((day, i) => (
                <span key={i}>{day}</span>
              ))}
            </div>

            {weeks.map((week) => (
              <div
                key={week.id}
                data-slot="pulse-band-week"
                className="grid items-center gap-[var(--space-1h)]"
                style={template}
              >
                <span className="text-micro text-ink-tertiary tabular-nums">{week.label}</span>

                {/* Seven, always. "Weekends are drawn." */}
                {Array.from({ length: DAYS_IN_WEEK }, (_, dayIndex) => {
                  const level = week.days[dayIndex] ?? 0;
                  const words = describe({
                    week,
                    dayIndex,
                    dayName: dayLabels[dayIndex] ?? "",
                    level,
                  });

                  return (
                    <span
                      key={dayIndex}
                      data-slot="pulse-band-day"
                      data-level={level}
                      title={words}
                      role="img"
                      aria-label={words}
                      className={cn(
                        /* 4, not the drawn 6. RULED L1 - see the header. */
                        "h-[1.125rem] rounded-[var(--radius-bar)]",
                        HEAT_FILL[level],
                      )}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}

        {legend && state === "default" ? (
          <div
            data-slot="pulse-band-legend"
            className="flex min-w-0 flex-wrap items-center gap-3 text-xs text-ink-tertiary"
          >
            <span className="inline-flex items-center gap-[var(--space-1h)]">
              {legendLightLabel}
              {/* The four steps, lightest first, and only the four: the empty
                  step is not a quantity and has no place on the scale. */}
              <span
                aria-hidden="true"
                className="h-[0.625rem] w-[0.875rem] rounded-[var(--radius-bar)] bg-[var(--heat-1)]"
              />
              <span
                aria-hidden="true"
                className="h-[0.625rem] w-[0.875rem] rounded-[var(--radius-bar)] bg-[var(--heat-2)]"
              />
              <span
                aria-hidden="true"
                className="h-[0.625rem] w-[0.875rem] rounded-[var(--radius-bar)] bg-[var(--heat-3)]"
              />
              <span
                aria-hidden="true"
                className="h-[0.625rem] w-[0.875rem] rounded-[var(--radius-bar)] bg-[var(--heat-4)]"
              />
              {legendHeavyLabel}
            </span>
            {legendNote !== undefined ? <span className="ms-auto">{legendNote}</span> : null}
          </div>
        ) : null}
      </div>
    );
  },
);

PulseBand.displayName = "PulseBand";

export { PulseBand, DAYS_IN_WEEK };
