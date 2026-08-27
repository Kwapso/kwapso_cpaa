/* ============================================================================
   ProgressDashboard — progress across many items (0 direct call sites; the
   commission's own note is that "a zero does not mean unused").

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" → chapter 18 "Data display", the panel headed
   "Progress". Read off the specimen's inline styles, figure by figure — and
   it draws THREE different rows, which is why this file has three kinds:

     · the panel      — `background:var(--sheet); border-radius:24px;
                         padding:24px`, a 13/500 title, then
                         `display:flex; flex-direction:column; gap:16px;
                         margin-top:18px`.
     · a BAR row      — `gap:14px`; a 13 secondary label at a fixed
                         `width:92px; flex:0 0 92px`; a `flex:1 1 auto`
                         track at `height:10px; border-radius:999px` over a
                         10% charcoal fill; a 13 tabular value at
                         `width:34px; text-align:right`.
     · a SEGMENT row  — `gap:12px`; the label, then five
                         `18 × 8` pills at 999px — filled `--inv`, unfilled
                         14% charcoal — then "3 / 5" at 12.5 tertiary,
                         tabular.
     · a SWEEP row    — the label, then a `height:4px` track with a 40%
                         `--inv` runner on the kit's 1.4s bar animation. That
                         is `Progress`'s indeterminate state exactly.

   The BAR itself is `progress.tsx`, transcribed from `.kw-bar`. It is not
   redrawn here: this file sizes it, labels it and lays the rows out.

   WHERE THIS FILE DEPARTS FROM CHAPTER 18, AND WHY
   · RADIUS. ch18 draws the 10-tall bar at 999. `progress.tsx` already ruled
     the other way on the kit's own authority — "A bar takes `--radius-sm`
     (4). A bar is not a box", ruling 03 over `.kw-bar`'s `--radius-pill`,
     logged there as GAPS-E PRG-1 — and two bars in one system must be one
     drawing. The bar keeps `--radius-sm`. GAPS-COL3 PRG-1.
   · COLOUR. ch18 draws three bars in forest, sky and mango. `progress.tsx`
     rules the runner CHARCOAL, "never mango. Mango is a brand fill, never a
     status and never a data colour." So the default tone here is charcoal
     and the accents are opt-in per row, reached through the primitive's
     published `data-slot="progress-fill"` rather than by redrawing the bar.
     `brand` is offered because ch18 draws it, and it stays one per view.
     GAPS-COL3 PRG-2.

   THE LAW THIS FILE OBEYS
   · A value that has not arrived renders NOTHING, never "0" — a bar with an
     unknown amount is the INDETERMINATE bar, which is what that state is
     for, and a figure that has not arrived is simply absent.
   · Permissions HIDE (ch24.6). A row the reader may not see is absent, and a
     dashboard whose every row is hidden renders `null`.
   · Every number is tabular, and the value column is fixed-width, so a
     column of figures does not shuffle as digits change.
   · Only four radii, no px, no hex, no font size. Focus is one global rule
     (tokens.css §8) — nothing here is focusable, and nothing here rings.

   RENDERING CONTEXT
   No `"use client"`. Every part forwards props; there is no hook, no state,
   no browser API and no event handler in this file.
   ========================================================================= */

import * as React from "react";

import { cn } from "../../lib/utils";
import { Card, CardContent } from "../card/card";
import { Progress } from "../progress/progress";
import { Skeleton } from "../skeleton/skeleton";
import { ScreenRegister } from "../screen-renderer/screen-renderer";

/** Which of chapter 18's three rows this is. */
export type ProgressRowKind = "bar" | "segments" | "sweep";

/**
 * The fill's colour. `default` is the charcoal runner `progress.tsx` rules
 * for; the three accents are chapter 18's own and are opt-in.
 */
export type ProgressTone = "default" | "success" | "info" | "brand";

/* Reached through the primitive's published `data-slot`, which is exactly
   what PATTERN says a slot is for: "Compositions target it; it costs
   nothing." No bar is redrawn and no fill rule is duplicated. */
const TONE_FILL: Record<ProgressTone, string> = {
  default: "",
  /** ch18's forest bar. */
  success: "[&_[data-slot=progress-fill]]:bg-success",
  /** ch18's sky bar. */
  info: "[&_[data-slot=progress-fill]]:bg-info",
  /** ch18's mango bar. One per view; never a status. */
  brand: "[&_[data-slot=progress-fill]]:bg-primary",
};

const TONE_SEGMENT: Record<ProgressTone, string> = {
  default: "bg-surface-inverse",
  success: "bg-success",
  info: "bg-info",
  brand: "bg-primary",
};

export interface ProgressRow {
  /** Stable key. Falls back to the index. */
  id?: string;
  /** What is progressing. The kit's "Bookings", "Sprint days", "Uploading". */
  label: React.ReactNode;
  /** Which row. `bar` is the default and the one chapter 18 draws three of. */
  kind?: ProgressRowKind;
  /**
   * How far along, against `max`. `null` or absent on a `bar` row makes it
   * the SWEEP — the honest drawing for an amount nobody knows yet. A bar
   * drawn at 0 would state that no progress has been made, which is a
   * different and usually wrong claim.
   */
  value?: number | null;
  /** What counts as complete. Defaults to 100 so `value` reads as a percent. */
  max?: number;
  /**
   * The figure at the end of the row, already formatted — the kit's "34",
   * "3 / 5". A node, because a component that formatted it would have to
   * know a locale it cannot see. Absent renders nothing, never "0".
   */
  display?: React.ReactNode;
  /** How many marks a `segments` row draws. The kit's own row draws five. */
  segments?: number;
  /** How many of them are filled. */
  filled?: number;
  /** The fill's colour. `default` is charcoal; the accents are opt-in. */
  tone?: ProgressTone;
  /**
   * The bar's accessible name. Undefined lets the visible label name it
   * through `aria-labelledby`, which this file wires — so no string is
   * hardcoded and none has to be passed twice.
   */
  ariaLabel?: string;
  /**
   * Turns the amount into words for `aria-valuetext`. Undefined lets
   * assistive technology announce its own localised percentage, which is
   * already correct in Arabic, Urdu and Persian.
   */
  formatValue?: (value: number, max: number) => string;
  /**
   * The reader may not see this row. `false` renders NOTHING — no
   * placeholder, no lock. Defaults to `true`.
   */
  visible?: boolean;
}

export interface ProgressDashboardProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title" | "children"> {
  /** The rows, in order. All hidden, or none given, renders `null`. */
  rows: readonly ProgressRow[];
  /** The panel's heading — the kit's own 13/500 line above the rows. */
  title?: React.ReactNode;
  /**
   * Draw the `--card` panel around the rows. On by default, because chapter
   * 18 draws one. Off for a dashboard already inside a card, where a second
   * shell would stack two radii.
   */
  panel?: boolean;
  /**
   * The reader may not see the dashboard at all. `false` renders NOTHING.
   */
  visible?: boolean;
  /** Which body is drawn. Only the rows swap; the title stays. */
  state?: "ready" | "loading" | "empty" | "error";
  /** The group's accessible name, when there is no visible `title`. */
  label?: string;
  /** How many skeleton rows the loading body draws. */
  loadingRows?: number;
  /** What a screen reader hears while the rows load. */
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

/**
 * Progress across many items.
 *
 * TEN STATES
 *  1. default        — a column of rows, each label / track / figure.
 *  2. hover          — does not apply. A dashboard reports; it is not a
 *                      target and carries no pointer affordance. Where a row
 *                      opens the records behind it, the call site wraps the
 *                      row's label in a `Button variant="link"` and that
 *                      control owns the hover.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      and nothing in this file is focusable.
 *  4. active/pressed — does not apply.
 *  5. disabled       — does not apply. A figure cannot be switched off. A
 *                      row the reader may not see is HIDDEN (ch24.6), not
 *                      greyed — a greyed bar tells a client there is a number
 *                      they are not allowed to see.
 *  6. loading        — `state="loading"`: skeleton rows in place of the bars,
 *                      the title kept. Per row, an absent `value` is the
 *                      SWEEP, which is the honest drawing for an amount
 *                      nobody knows — never a bar at 0, which claims that no
 *                      progress has been made.
 *  7. empty          — `state="empty"`, or no visible rows: chapter 21's
 *                      register, or `null` when there is nothing to say
 *                      either. A dashboard never draws an empty panel.
 *  8. error          — `state="error"`: the register in its error tone,
 *                      `role="alert"`. A single bar has no error skin: a
 *                      poppy bar reads as a bad number rather than a failed
 *                      request.
 *  9. selected       — does not apply. A figure is not a choice.
 * 10. read-only      — always. Nothing here is editable; a bar the reader
 *                      drags is `Slider`, a different primitive.
 *
 * THREE BREAKPOINTS
 *  mobile   — the label column keeps its 5.75rem (the kit's 92) and the
 *             track absorbs the difference, because a label column that
 *             collapsed would stop the labels lining up, and lining up is
 *             the only reason a fixed column exists. The label TRUNCATES
 *             rather than wrapping, so every row stays one line and the
 *             column of tracks stays a column. A `segments` row WRAPS its
 *             marks rather than shrinking them: eight 18-wide pills do not
 *             fit at 320, and a shrunk mark stops being countable, which is
 *             the whole point of drawing marks instead of a bar.
 *  tablet   — unchanged.
 *  desktop  — unchanged in structure; the panel's inset opens from 24 to 32
 *             at `lg:`, which is `CardContent`'s own response and not
 *             something this file adds.
 *
 * RTL — safe. The bar fills in reading order (`Progress` mirrors its own
 * `transform-origin`), the segments are laid out by `flex` in DOM order and
 * therefore fill from the reading start, every inset is logical, and the
 * figure column uses `text-end` rather than a physical side.
 */
const ProgressDashboard = React.forwardRef<HTMLDivElement, ProgressDashboardProps>(
  (
    {
      className,
      rows,
      title,
      panel = true,
      visible = true,
      state = "ready",
      label,
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
    /* Every bar is named by the label beside it rather than by a duplicated
       string, so a call site writes each name once. The id has to be stable
       across renders and unique on the page; it is derived from React's own
       instance id.

       THE HOOK COMES BEFORE THE GUARD, AND IT HAS TO. `useId` used to sit
       under `if (!visible) return null`, which is a CONDITIONAL HOOK: the
       moment a permission flips `visible` from false to true React counts
       one more hook than it did on the previous render and throws "Rendered
       more hooks than during the previous render", taking the whole tree
       down with it. Nothing about the drawing changes; the call simply has
       to be unconditional. */
    const reactId = React.useId();

    /* Permissions HIDE. Nothing at all — not a placeholder, not a band. */
    if (!visible) return null;

    const shown = rows.filter((row) => row.visible !== false);
    const resolved = state === "ready" && shown.length === 0 ? "empty" : state;

    let inner: React.ReactNode;

    if (resolved === "loading") {
      inner = (
        <div className="flex flex-col gap-4">
          {Array.from({ length: loadingRows }, (_, index) => (
            <Skeleton
              key={`loading-${index}`}
              announce={index === 0}
              label={loadingLabel}
              className="w-full"
            />
          ))}
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
      // Nothing to show and nothing to say: nothing at all.
      if (register === null && title === undefined) return null;
      inner = register;
    } else {
      inner = (
        /* `gap:16px` between rows — the kit's own figure. */
        <div className="flex flex-col gap-4">
          {shown.map((row, index) => {
            const key = row.id ?? String(index);
            const labelId = `${reactId}-${key}`;
            const kind = row.kind ?? "bar";
            const tone = row.tone ?? "default";

            return (
              <div
                key={key}
                data-slot="progress-row"
                data-kind={kind}
                /* `gap:14px` on a bar row, 12 on a segment row. */
                className={cn(
                  "flex items-center",
                  kind === "segments" ? "flex-wrap gap-3" : "gap-[var(--space-3h)]",
                )}
              >
                {/* 13 / secondary / a fixed 92 so the tracks line up. */}
                <span
                  id={labelId}
                  data-slot="progress-label"
                  className={cn(
                    "truncate text-caption text-ink-secondary",
                    kind === "segments" ? "flex-none" : "w-[5.75rem] flex-none",
                  )}
                >
                  {row.label}
                </span>

                {kind === "segments" ? (
                  /* 18 × 8 pills, filled `--inv`, unfilled on the quiet fill
                     that `Progress`'s own track uses — the kit's 14% charcoal
                     is between two palette steps and no new token is invented
                     for it (GAPS-COL3 PRG-3). The group is one
                     `role="progressbar"` so a screen reader hears "3 of 5"
                     rather than five unlabelled marks. */
                  <span
                    role="progressbar"
                    aria-labelledby={row.ariaLabel ? undefined : labelId}
                    aria-label={row.ariaLabel}
                    aria-valuemin={0}
                    aria-valuemax={row.segments ?? 0}
                    aria-valuenow={row.filled ?? 0}
                    aria-valuetext={
                      row.formatValue
                        ? row.formatValue(row.filled ?? 0, row.segments ?? 0)
                        : undefined
                    }
                    className="flex flex-wrap items-center gap-1"
                  >
                    {Array.from({ length: row.segments ?? 0 }, (_, mark) => (
                      <span
                        key={mark}
                        aria-hidden="true"
                        className={cn(
                          "h-2 w-[var(--space-4h)] rounded-pill",
                          mark < (row.filled ?? 0)
                            ? TONE_SEGMENT[tone]
                            : "bg-surface-quiet",
                        )}
                      />
                    ))}
                  </span>
                ) : (
                  /* `Progress` draws the bar. This file only sets its height
                     — 10, the kit's figure for a labelled row, against the
                     primitive's own 4 for the loading tier — and, on an
                     accented row, the fill colour through the published slot. */
                  <Progress
                    value={kind === "sweep" ? null : (row.value ?? null)}
                    max={row.max}
                    indeterminate={kind === "sweep"}
                    label={row.ariaLabel}
                    aria-labelledby={row.ariaLabel ? undefined : labelId}
                    formatValue={row.formatValue}
                    className={cn(
                      "h-2.5 min-w-0 flex-1",
                      // The sweep row keeps the primitive's own 4.
                      kind === "sweep" && "h-1",
                      TONE_FILL[tone],
                    )}
                  />
                )}

                {/* 13 tabular at a fixed 34, ranged to the inline end.
                    Absent renders nothing — never a "0" standing in for a
                    figure that has not arrived.

                    FOUND 2026-08-24, NOT FIXED — a caller can overflow the
                    page through this slot. `w-[2.125rem] flex-none` is a
                    fixed 34 that cannot shrink, and the text does not wrap,
                    so a `display` longer than about four characters renders
                    at its own intrinsic width and pushes out of every
                    ancestor. `compositions/screens/portal-impact.tsx` passes
                    "31 a week, from 74", "61% this month" and "3 this month,
                    from 22"; at a 380 viewport the first of those measures
                    119px in a 113px parent and the row's right edge lands at
                    479 against a 380 window.

                    IT IS A REAL HORIZONTAL OVERFLOW AND `documentElement.
                    scrollWidth` DOES NOT REPORT IT, which is why it went
                    unnoticed — it was found by measuring each element's own
                    right edge against the viewport.

                    Whose bug it is, is a design question and not a filing
                    one: either this slot should wrap and shrink (and stop
                    being a fixed column), or the type should refuse prose
                    and `portal-impact` should move those sentences into
                    `caption`. Left alone deliberately — the restructure this
                    was found during is a move, a delete and a relabel, and
                    changing what this draws is neither. */}
                {row.display !== undefined && row.display !== null ? (
                  <span
                    data-slot="progress-value"
                    className={cn(
                      "text-caption tabular-nums",
                      kind === "segments"
                        ? "text-ink-tertiary"
                        : "w-[2.125rem] flex-none text-end",
                    )}
                  >
                    {row.display}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      );
    }

    const body = (
      <>
        {title !== undefined && title !== null ? (
          /* The kit's 13/500 panel heading, 18 over the rows. */
          <div
            data-slot="progress-dashboard-title"
            className="mb-[var(--space-4h)] text-caption font-[var(--font-weight-medium)]"
          >
            {title}
          </div>
        ) : null}
        {inner}
      </>
    );

    return (
      <div
        ref={ref}
        data-slot="progress-dashboard"
        data-state={resolved}
        role={label ? "group" : undefined}
        aria-label={label}
        className={cn("w-full min-w-0", className)}
        {...props}
      >
        {panel ? (
          <Card variant="raised">
            <CardContent>{body}</CardContent>
          </Card>
        ) : (
          body
        )}
      </div>
    );
  },
);

ProgressDashboard.displayName = "ProgressDashboard";

export { ProgressDashboard };
