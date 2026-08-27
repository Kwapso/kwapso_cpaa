/* ============================================================================
   Timeline — collection view 09, "one horizontal spine of dated events"
   (0 direct call sites; a body swap for `CollectionFrame`).

   READ THIS FIRST: VIEW 04 IS ONE VIEW, AND IT IS NOT THIS ONE.
   The batch brief asked whether chapter 19's view 04 is one thing or two, and
   named this file "view 04, the non-Gantt reading". It is not. The chapter's
   own view table has twenty-four rows and TIMELINE IS ROW NINE, with its own
   line, its own fit and its own switch label. Verbatim, both rows:

       04 · gantt    · "Spans across weeks, one row per record"
                     · fits "Sprints, roadmap, phases"    · switch "Gantt"
       09 · timeline · "One horizontal spine of dated events"
                     · fits "Account history, milestones" · switch "Timeline"

   So view 04 is exactly one view — the Gantt — and there is no second reading
   of it to build. Timeline is a separate, numbered, separately drawn view
   that no other agent in this batch holds, and this file is IT, built from
   row nine's own drawing and from nothing else. Logged as GAPS-TRACK2B TL-1.

   THE DRAWING, transcribed
     · the frame — `grid-template-columns: repeat(5, 1fr)` three times over,
                   `padding: 0 6px`, the whole thing vertically centred in the
                   body
     · above     — one cell per event, `gap: 6px`, `padding-bottom: 12px`,
                   `align-items: end`: the title at 12/500 and the meta at 11
                   tertiary under it
     · the spine — an 11-tall strip with one 2px horizontal rule at 16% ink
                   running the full width, and one 11px dot per event centred
                   in its column, above the rule
     · below     — one cell per event, `padding-top: 12px`, the date at 12px
                   tertiary, tabular

   THE SPINE RUNS EDGE TO EDGE, AND THAT IS THE VIEW
   The rule spans the whole width — not first-dot to last-dot — because the
   account did not begin at its first recorded event and has not ended at its
   last. The artifact draws its final dot in mango and labels it "Now"; that
   is DATA, so `tone` is per-event and this file rules nothing about which one
   is current.

   COMPOSE, DO NOT REBUILD
   There is nothing to compose: a spine, a rule and a row of dots are three
   fills. No `Card` (the artifact draws no box), no `border` anywhere, and the
   dot is the system's own status mark at `--dot-status`'s bigger sibling.

   RENDERING CONTEXT
   No `"use client"`. It forwards props and a ref, holds no state, calls no
   hook and creates no handler during its own render.
   ========================================================================= */

import * as React from "react";

import { cn } from "../../lib/utils";
import { Skeleton } from "../skeleton/skeleton";
import { CollectionRegister } from "../collection-frame/collection-frame";

/**
 * The dot's fill. The artifact draws charcoal for a passed milestone and
 * mango for the one that matters now; the rest are the system's status marks,
 * offered because a timeline of releases has a blocked one.
 */
export type TimelineTone = "default" | "brand" | "shipped" | "info" | "blocked";

const DOT_TONE = {
  default: "bg-surface-inverse",
  /* The kit's own mango dot on this view. It is the brand marking WHERE WE
     ARE, not a status — the words beside it say what happened (ruling 26). */
  brand: "bg-surface-brand",
  shipped: "bg-success",
  info: "bg-info",
  blocked: "bg-destructive",
} as const;

export interface TimelineEvent {
  /**
   * React key. Required: a spine is re-based whenever the range changes and a
   * positional key would carry one event's date under another's title.
   */
  id: string;
  /** The event, at 12/500 above the spine. */
  title: React.ReactNode;
  /** The line under the title, quieter. */
  meta?: React.ReactNode;
  /** The date, under the spine, tabular. */
  date?: React.ReactNode;
  /** Which mark sits on the spine. */
  tone?: TimelineTone;
  /**
   * What the mark means, in words. Required by ruling 26 whenever the mark is
   * not the default: colour never carries a state alone.
   */
  toneLabel?: string;
}

export interface TimelineProps extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  /** The events, oldest first. This view never sorts: the spine is the caller's order. */
  events?: TimelineEvent[];
  /** Accessible name for the spine as a whole. */
  label?: string;
  /**
   * The narrowest an event column may be drawn before the spine scrolls
   * instead of squeezing. A title and a date need about this much before they
   * wrap to three lines each.
   */
  eventMinWidth?: string;

  /** The spine has not arrived. Cold cache only. */
  loading?: boolean;
  /** How many placeholder events to draw while `loading`. */
  loadingEvents?: number;
  /** The request failed. Beats `empty`. */
  error?: boolean;
  /** Force the empty register even with events present. */
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
 * One horizontal spine of dated events.
 *
 * TEN STATES
 *  1. default        — titles above, the spine, dates below.
 *  2. hover          — NONE. The artifact draws no hover: a milestone is a
 *                      reading. An event that opens a record is wrapped by
 *                      the call site, which is where the hover then lives.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      This body holds no control.
 *  4. active/pressed — does not apply, for the same reason as hover.
 *  5. disabled       — does not apply. A spine is a layout, and a milestone
 *                      that has not happened is simply not on it. Dimming an
 *                      event would be an opacity, which is a rejection.
 *  6. loading        — `loading`: `Skeleton` blocks in the same columns, so
 *                      the spine does not move when the history lands.
 *  7. empty          — no events, or `empty`: the quiet register. An account
 *                      with no history says so; it does not draw a bare rule,
 *                      which would read as a spine that failed.
 *  8. error          — `error`: the register with a poppy dot. Beats `empty`.
 *  9. selected       — does not apply. The artifact marks no event as chosen;
 *                      its mango dot is "Now", which is data, not selection.
 * 10. read-only      — always. A history holds no value.
 *
 * THREE BREAKPOINTS, and the 380 answer
 *  · mobile (base) — the spine SCROLLS sideways, each event keeping
 *    `eventMinWidth`. It does NOT rotate into a vertical list: a vertical
 *    stack of dated events is the FEED (view 14) and the AGENDA (view 10),
 *    both of which already exist in this chapter, and turning this view into
 *    one of them at 380 would leave the collection with two names for the
 *    same drawing. The spine's whole claim is that time runs across; it keeps
 *    running across. Logged as GAPS-TRACK2B TL-2 — the kit states no narrow
 *    behaviour for this view.
 *  · tablet (`sm:`) / desktop (`lg:`) — UNCHANGED, and by then it fits. The
 *    columns are `1fr` and share the width, exactly as drawn.
 *
 * RTL — safe, and unused: the system is LTR only (ruling 10). The rule is
 * placed with `inset-inline`, and the columns follow the document.
 */
const Timeline = React.forwardRef<HTMLDivElement, TimelineProps>(
  (
    {
      className,
      events = [],
      label,
      eventMinWidth = "7.5rem",
      loading = false,
      loadingEvents = 5,
      error = false,
      empty = false,
      loadingState,
      emptyState,
      errorState,
      loadingLabel = "Loading…",
      emptyLabel = "Nothing recorded yet",
      emptyBody = "There is no history against this record.",
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
        : events.length === 0 || empty
          ? "empty"
          : "default";

    const count = state === "loading" ? loadingEvents : events.length;

    /* A count and a length, neither of which a utility can see. rem only. */
    const template = {
      gridTemplateColumns: `repeat(${count}, minmax(${eventMinWidth}, 1fr))`,
    } satisfies React.CSSProperties;

    return (
      <div
        ref={ref}
        data-slot="timeline"
        data-state={state}
        aria-busy={loading || undefined}
        aria-label={label}
        className={cn("min-w-0", className)}
        {...props}
      >
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

        {state === "loading" && loadingState ? loadingState : null}

        {state === "default" || (state === "loading" && !loadingState) ? (
          <div className="min-w-0 overflow-x-auto">
            <div className="flex min-w-max flex-col justify-center px-[var(--space-1h)]">
              {/* Above the spine. `align-items: end` so every title sits on
                  the rule whatever height its meta line runs to. */}
              <div className="grid items-end gap-3 pb-3" style={template}>
                {state === "loading"
                  ? Array.from({ length: count }, (_, i) => (
                      <Skeleton
                        key={i}
                        className="h-8"
                        announce={i === 0}
                        label={loadingLabel}
                      />
                    ))
                  : events.map((event) => (
                      <div key={event.id} className="flex min-w-0 flex-col gap-[var(--space-1h)]">
                        <span className="text-badge font-[var(--font-weight-medium)]">
                          {event.title}
                        </span>
                        {event.meta === undefined ? null : (
                          <span className="text-micro tracking-[var(--tracking-normal)] text-ink-tertiary">
                            {event.meta}
                          </span>
                        )}
                      </div>
                    ))}
              </div>

              {/* The spine itself: one rule edge to edge, one dot per column
                  over it. A 2px FILL, never a border. */}
              <div
                data-slot="timeline-spine"
                className="relative grid h-[0.6875rem] items-center"
                style={template}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-hair-strong"
                />
                {state === "loading"
                  ? null
                  : events.map((event) => {
                      const tone = event.tone ?? "default";
                      return (
                        <span
                          key={event.id}
                          className="relative z-[1] justify-self-center"
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "block size-[0.6875rem] rounded-pill",
                              DOT_TONE[tone],
                            )}
                          />
                          {/* Ruling 26: the dot never speaks alone. */}
                          {event.toneLabel === undefined ? null : (
                            <span className="sr-only">{event.toneLabel}</span>
                          )}
                        </span>
                      );
                    })}
              </div>

              {/* Under the spine. */}
              <div className="grid gap-3 pt-3" style={template}>
                {state === "loading"
                  ? null
                  : events.map((event) => (
                      <span
                        key={event.id}
                        className="min-w-0 text-badge text-ink-tertiary tabular-nums"
                      >
                        {event.date}
                      </span>
                    ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  },
);

Timeline.displayName = "Timeline";

export { Timeline };
