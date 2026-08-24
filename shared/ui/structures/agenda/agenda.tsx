/* ============================================================================
   Agenda — day headings over a time column.

   DESIGN SOURCE
   `KWAPSO-SPEC.md` CH19 view 10. The chapter's template holes name the four
   parts and nothing else:

       {{ d.label }} · {{ it.time }} · {{ it.title }} · {{ it.who }}

   and the drawn value settles the row:

       grid-template-columns: 64px 1fr auto

   — a fixed time column, the title, and who it is with pushed to the inline
   end. The day heading above it is the kit's micro uppercase line.

   THE LAW THIS FILE OBEYS
   · THE DRAWING ALREADY EXISTS AND IS NOT REDRAWN HERE. `CalendarView` was
     built from this same view — its file header transcribes chapter 19 view
     10 line for line, including the three columns, the 14 gap, the 12 inset,
     the hairline under each row and the three type steps. `Agenda` is view
     10's own entry in the view switcher: the same body, with the collection's
     vocabulary on its props and its own three registers. If this file drew a
     row it would be a second answer to a settled drawing.
   · THIS COMPONENT DOES NO DATE MATHS. Ruling 07 makes date wording follow
     the APP language rather than the browser, which a component cannot know,
     so every label is a node the caller supplies. No `Intl` call, no week
     start, no locale.
   · A day with no items is DROPPED, not drawn empty. The kit's calendar rule
     is the same one: "a kind with no hits is left out rather than shown
     empty" (CH27.40). An agenda whose every day is empty falls through to the
     empty register instead.
   · Focus is one global rule (tokens.css §8). Disabled is a fill and an ink.
     Never mango, never an opacity, no `border` property, rem only, LTR only.

   RENDERING CONTEXT
   No `"use client"` of its own. It forwards nodes and a callback into
   `CalendarView`, which carries the directive it needs.
   ========================================================================= */

import * as React from "react";

import { cn } from "../../lib/utils";
import { CalendarView } from "../calendar-view/calendar-view";

export interface AgendaItem {
  /** Stable id. The React key, and the handle `onItemSelect` is given. */
  id: string;
  /** When — already formatted by the caller (ruling 07). Tertiary, tabular. */
  time?: React.ReactNode;
  /** The machine-readable instant, for `<time datetime>`. */
  dateTime?: string;
  /** What it is. The row's one full-measure column. */
  title: React.ReactNode;
  /** Who it is with, at the inline end. */
  who?: React.ReactNode;
  /** Cannot be opened. `CalendarView` owns the ink; never an opacity. */
  disabled?: boolean;
}

export interface AgendaDay {
  /** Stable key. Falls back to the index. */
  key?: string;
  /** The day heading — already formatted by the caller (ruling 07). */
  label: React.ReactNode;
  /** The day's items, in time order. Neither this file nor the body sorts. */
  items: readonly AgendaItem[];
}

export interface AgendaProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onSelect"> {
  /** The days, in the order they should read. */
  days: readonly AgendaDay[];
  /** Opening an item. Without it, a row is not a target and takes no tab stop. */
  onItemSelect?: (item: AgendaItem, day: AgendaDay) => void;

  /**
   * Keep a day that holds nothing. Off: the kit leaves an empty group out
   * rather than drawing it. On, a caller can draw a day heading over nothing
   * where the day itself is the fact — a rota with a rest day, say.
   */
  keepEmptyDays?: boolean;

  /* ---- the three registers, which are `CalendarView`'s own ---------------- */
  loading?: boolean;
  error?: boolean;
  empty?: boolean;
  loadingState?: React.ReactNode;
  emptyState?: React.ReactNode;
  errorState?: React.ReactNode;
  loadingLabel?: string;
  emptyLabel?: string;
  emptyBody?: string;
  errorLabel?: string;
  errorBody?: string;

  /** The agenda's accessible name. */
  label?: string;
}

/**
 * Days, each a heading over its rows.
 *
 * TEN STATES — all ten are `CalendarView`'s in `agenda` mode, and are
 * restated here only where this file changes one.
 *  1. default        — a micro uppercase day heading, then a row per item on
 *                      the three-column ladder, hairline-separated.
 *  2. hover          — the row's neutral `--accent` wash, and only where a row
 *                      is a target. Never mango.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — does not apply. Pressing a row opens the record.
 *  5. disabled       — per item, as an ink. Never an opacity.
 *  6. loading        — `loading`: the busy register in place of the days.
 *  7. empty          — no days, no items in any day, or `empty`: the quiet
 *                      register. THIS FILE decides it rather than leaving it
 *                      to the body, because a day heading over nothing is the
 *                      shape the kit rules out.
 *  8. error          — `error`: the register with a poppy dot. Beats empty.
 *  9. selected       — does not apply. An agenda is read down.
 * 10. read-only      — without `onItemSelect` the whole view is read-only.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED, which is `CalendarView`'s own stated
 *  answer for this body: "its three columns are 64 + content + auto" at all
 *  three. The time column is fixed because a ragged time column is unreadable,
 *  the title column takes what is left and the "who" column is `auto`, so at
 *  380 the title shrinks and the two facts either side of it stay whole. The
 *  row never restacks: a two-line agenda row stops being a row you can scan.
 *  Chapter 19 states no narrow render for view 10 — logged as GAPS-TRACK2A
 *  AGD-2.
 *
 * RTL — LTR only (ruling 10).
 */
const Agenda = React.forwardRef<HTMLDivElement, AgendaProps>(
  (
    {
      className,
      days,
      onItemSelect,
      keepEmptyDays = false,
      loading = false,
      error = false,
      empty = false,
      loadingState,
      emptyState,
      errorState,
      loadingLabel,
      emptyLabel,
      emptyBody,
      errorLabel,
      errorBody,
      label = "Agenda",
      ...props
    },
    ref,
  ) => {
    /* A day with nothing in it is left out, not drawn empty. Done here rather
       than in the body, because the body is handed what it should draw. */
    const shown = keepEmptyDays ? days : days.filter((day) => day.items.length > 0);

    /* An agenda with no rows at all IS the empty state, so a caller cannot
       ship a page of bare day headings by forgetting to set `empty`. */
    const nothing = shown.length === 0 || shown.every((day) => day.items.length === 0);

    return (
      <CalendarView
        ref={ref}
        data-slot="agenda"
        view="agenda"
        /* `CalendarView` reads its own empty state off the array it is handed
           — no days IS empty — so an agenda that filtered down to nothing is
           expressed by handing it nothing, rather than by a second flag that
           could disagree with the first. */
        agenda={
          empty || nothing
            ? []
            : shown.map((day, index) => ({
                key: day.key ?? String(index),
                label: day.label,
                items: day.items.map((item) => ({
                  id: item.id,
                  time: item.time,
                  dateTime: item.dateTime,
                  title: item.title,
                  who: item.who,
                  disabled: item.disabled,
                })),
              }))
        }
        onSelectItem={
          onItemSelect
            ? (item, calendarDay) => {
                const day =
                  shown.find((candidate, index) => (candidate.key ?? String(index)) === calendarDay.key) ??
                  shown[0];
                const source = day?.items.find((candidate) => candidate.id === item.id);
                if (day && source) onItemSelect(source, day);
              }
            : undefined
        }
        loading={loading}
        error={error}
        loadingState={loadingState}
        emptyState={emptyState}
        errorState={errorState}
        loadingLabel={loadingLabel}
        emptyLabel={emptyLabel}
        emptyBody={emptyBody}
        errorLabel={errorLabel}
        errorBody={errorBody}
        label={label}
        className={cn("min-w-0", className)}
        {...props}
      />
    );
  },
);

Agenda.displayName = "Agenda";

export { Agenda };
