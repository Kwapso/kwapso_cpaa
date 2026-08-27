"use client";

/* ============================================================================
   CalendarView — month grid, day cell, event chip, agenda (0 direct call sites).

   DESIGN SOURCE
   Two drawings in `Design Mothership/kit-current/Kwapso UI Kit.dc.html`, read
   directly because neither was ever transcribed into the specimen set:

   Kit chapter 19 ("Collection views"), view 05 "calendar" — the full one:
     · weekday row — `grid-template-columns: repeat(7, 1fr); gap: 6px;
                      padding: 4px 4px 8px`, each label 11 / 500 / uppercase /
                      0.08em tracking, tertiary ink
     · the grid    — `repeat(7, 1fr); grid-auto-rows: 1fr; gap: 6px`
     · a cell      — radius 24, inset 8/9, a column at gap 6, `overflow: hidden`
     · the day     — 11, tabular, quieted
     · an event    — mango pill, charcoal label, 10, inset 2/7, full width,
                     single line, ellipsis

   Kit chapter 18 ("Data display"), the block captioned "August 2026 · week 34
   highlighted" — the small one:
     · cells `aspect-ratio: 1 / 1` at the same radius and inset
     · the day at 12, tabular
     · an event reduced to a 6 dot in `--inv`, because a chip does not fit

   Kit chapter 19, view 10 "agenda" — the list form:
     · day label — 12 / 500 / uppercase / 0.08em, inset 4/12/6
     · a row     — `grid-template-columns: 64px 1fr auto; gap: 14px;
                    align-items: center; padding: 12px;
                    box-shadow: inset 0 -1px 0 var(--hair)`
     · the time  — 13, tertiary, tabular · the title 14 · the who 12, tertiary

   THE LAW THIS FILE OBEYS
   · This component does NO DATE MATHS and holds no calendar. It renders the
     cells it is handed. Ruling 07 makes date format follow the APP language
     rather than the browser — "13 Jun 2026, 14:05 in English, 13. Juni 2026,
     14:05 in German" — which a component cannot know, so every label here is
     a node the caller supplies and nothing is formatted internally. That also
     means no `Intl` call, no week-start assumption, and no locale baked in.
   · Ruling 02: nothing hardcodes 9, 10 or 11 any more, and uppercase eyebrows
     keep 11. So the weekday labels stay at `text-micro` (they ARE uppercase
     eyebrows) and the kit's 10 event chip and 11 day number both step up to
     12 — `text-badge` and `text-xs`. Logged as GAPS-COL1 CV-2.
   · An unqualified event chip is MANGO, which is what the artifact draws.
     OVERRIDE 17 (2026-08-23, verify/decisions.html Q2) settles this: "'One
     mango per screen' counts ACTIONS, not objects. One filled control you
     can press; any number of non-interactive marks." A month's event chips
     are marks that identify a record, not actions, so the twenty-mango-chips
     argument this file used to make is the reading the override retires -
     the same reading that would have taken the mango off 27.34's unread rows
     and off the triage sitting's figure. CH19 view 05 draws
     `background: var(--mango); color: #1A1918`, and that now stands. The
     quiet chip survives as `tone="quiet"` for a caller who wants it.
   · Mango means "where you are" and charcoal means "what you picked" —
     `.kw-stage--current` is mango and the segmented control's on-state
     (`ToggleGroup`, `ModeToggle`) is charcoal. Today is therefore the mango cell and the selected day is the
     charcoal one, which keeps at most one of each on screen.
   · The cell radius is the box radius, 24. There is no fifth radius, and a
     calendar cell is a box.
   · Focus is one global rule (tokens.css §8). A selectable day is a real
     button and is ringed already; the grid sets no `overflow: hidden` on the
     wrapper, so the ring is never shaved.
   · No product vocabulary. These are DAYS and EVENTS.

   RENDERING CONTEXT
   `"use client"` — the day and event handlers are created during this
   module's own render.
   ========================================================================= */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { Button } from "../button/button";
import { Skeleton } from "../skeleton/skeleton";
import { CollectionRegister } from "../collection-frame/collection-frame";
import { ChevronLeft, ChevronRight } from "../../foundations/icons";

/* ----------------------------------------------------------------------------
   The day cell.

   Exclusive states are resolved in JS and emitted as ONE class set, never
   stacked as `disabled:` / `aria-selected:` utilities of equal specificity
   racing each other for who paints (PATTERN §4). Precedence, written down:

       disabled  >  selected  >  today  >  outside  >  default

   A day outside the month that happens to be today is still outside; a day
   you have picked outranks the day it is; and a day you may not pick outranks
   everything, because it is the only one of the five that is a STATE rather
   than a meaning.
   ------------------------------------------------------------------------- */
const dayCellVariants = cva(
  [
    "flex min-w-0 flex-col gap-[var(--space-1h)] overflow-hidden",
    // Box radius and the kit's 8/9 inset.
    "rounded-[var(--radius)] px-[var(--space-2h)] py-2",
    "text-start",
    "transition-colors duration-[var(--duration-colour)] ease-kwapso",
  ],
  {
    variants: {
      state: {
        /** A day in this month. Raised paper on the panel the grid sits on. */
        default: "bg-card text-card-foreground",
        /**
         * A day from the month either side. No fill, TERTIARY ink; still real.
         *
         * Corrected 2026-08-23 with the weekday heads below. This was
         * `--ink-disabled` and measured 2.206:1 light / 3.689:1 dark on the
         * five outside cells the demo draws. GAPS-CONTRAST did not catch it
         * — its row 7 names only this component's weekday heads — but it is
         * the same defect, in the same file, and the old comment convicted
         * itself: "still real". An outside day is not disabled and is not
         * even inert; `pickable` excludes only `day.disabled`, so with
         * `onSelectDay` given, 31 August is a real button whose label sat in
         * the tier exempt from being legible. The `disabled` state below is
         * the one that may keep that ink.
         */
        outside: "bg-transparent text-ink-tertiary",
        /** Today. Mango, charcoal label — the kit's "current" fill. */
        today: "bg-surface-brand text-ink-on-accent",
        /** The day you picked. Charcoal, off-beige label — the kit's chosen fill. */
        selected: "bg-surface-inverse text-ink-on-inverse",
        /** A day that cannot be picked. A fill and an ink, never an opacity. */
        disabled: "cursor-not-allowed bg-surface-quiet text-ink-disabled",
      },
    },
    defaultVariants: { state: "default" },
  },
);

/* ----------------------------------------------------------------------------
   The event chip. Quiet by default; every accent carries a charcoal label,
   both modes, because white type on an accent is a rejection.
   ------------------------------------------------------------------------- */
const eventChipVariants = cva(
  [
    "block w-full truncate rounded-pill px-2",
    // Ruling 02 lifts the kit's 10 to the badge step.
    "text-badge leading-[1.6] font-[var(--font-weight-medium)]",
    "text-start",
  ],
  {
    variants: {
      tone: {
        /** The default, and the reason: see the Badge ruling in the header. */
        quiet: "bg-surface-quiet text-ink-secondary",
        /** The kit's drawn chip. Opt-in, one per view. */
        brand: "bg-surface-brand text-ink-on-accent",
        /** Informational. Charcoal label, as every accent. */
        info: "bg-info text-ink-on-accent",
        /** Shipped, healthy, done. */
        success: "bg-success text-success-foreground",
        /** Blocked, overdue. Poppy means blocked; it is not a "warning" tone. */
        destructive: "bg-destructive text-destructive-foreground",
        /** Charcoal fill, off-beige label. Flips with the palette. */
        inverse: "bg-surface-inverse text-ink-on-inverse",
      },
    },
    defaultVariants: { tone: "brand" },
  },
);

/** The six status-dot tones — one per `--dot-*` token, matching `Badge`'s. */
export type CalendarEventDot =
  | "shipped"
  | "building"
  | "review"
  | "blocked"
  | "archived"
  | "done";

const EVENT_DOT: Record<CalendarEventDot, string> = {
  shipped: "bg-[var(--dot-shipped)]",
  building: "bg-[var(--dot-building)]",
  review: "bg-[var(--dot-review)]",
  blocked: "bg-[var(--dot-blocked)]",
  archived: "bg-[var(--dot-archived)]",
  done: "bg-[var(--dot-done)]",
};

export interface CalendarEvent {
  /** Stable key. */
  id: string;
  /** What it says. Truncates to one line in a cell; wraps nowhere. */
  label: React.ReactNode;
  /** Which chip fill. Quiet unless the caller says otherwise. */
  tone?: VariantProps<typeof eventChipVariants>["tone"];
  /**
   * 27.25's own day chip: "each a status dot plus a truncated title". Given a
   * dot, the chip is the chapter's drawing — the `--card` pill with a 6px
   * status dot before the label — and `tone` is not read. The dot never
   * carries the state alone (ruling 26): the title is beside it.
   */
  dot?: CalendarEventDot;
  /** Accessible name, where the visible label is an abbreviation. */
  title?: string;
}

export interface CalendarDay {
  /** Stable key. */
  key: string;
  /** The number, or whatever the caller wants in the corner. Already formatted. */
  label: React.ReactNode;
  /** Machine-readable date for the cell's `<time datetime>`. */
  dateTime?: string;
  /** What is on. Beyond `maxEvents` the rest collapse into one more-line. */
  events?: CalendarEvent[];
  /** A day belonging to the month either side. */
  outside?: boolean;
  /** Today. Mango — the kit's "current" fill. At most one per view. */
  today?: boolean;
  /** The day the reader picked. Charcoal. At most one per view. */
  selected?: boolean;
  /** A day that cannot be picked. */
  disabled?: boolean;
}

export interface CalendarAgendaItem {
  /** Stable key. */
  id: string;
  /** When, already formatted by the caller (ruling 07). */
  time?: React.ReactNode;
  /** Machine-readable instant for `<time datetime>`. */
  dateTime?: string;
  /** What it is. */
  title: React.ReactNode;
  /** Who it is with. */
  who?: React.ReactNode;
  /** This item cannot be opened. */
  disabled?: boolean;
}

export interface CalendarAgendaDay {
  /** Stable key. */
  key: string;
  /** The day's heading — an uppercase micro line. Already formatted. */
  label: React.ReactNode;
  /** The day's items, in time order. This component does not sort. */
  items: CalendarAgendaItem[];
}

export interface CalendarViewProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onSelect"> {
  /**
   * `month` is the grid, `agenda` is the list, `week` is 27.25's narrow
   * render — seven day-pills over the picked day's rows. All three are
   * drawn by the kit.
   */
  view?: "month" | "agenda" | "week";

  /** The period's name, over the grid. A node; nothing is formatted here. */
  monthLabel?: React.ReactNode;
  /** A quiet note at the inline end of the header — the kit's "week 34 highlighted". */
  monthNote?: React.ReactNode;
  /** Step back. Absent, no back control is drawn. */
  onPrevious?: () => void;
  /** Step forward. Absent, no forward control is drawn. */
  onNext?: () => void;
  /** Accessible names for the two steps. */
  previousLabel?: string;
  nextLabel?: string;

  /**
   * The seven column headings, in the caller's own week order. A prop with a
   * default because the applications run in more than one language AND
   * because the week does not start on the same day everywhere — a component
   * that assumed Monday would be wrong half the time.
   */
  weekdayLabels?: string[];
  /**
   * Which of the seven columns are quieted, by index into `weekdayLabels`.
   * Defaults to the last two, which is right for a Monday-first week and is
   * overridable for every other.
   *
   * A quieted head is a WEIGHT step, not an ink step — 300 against the row's
   * 500, both of them ink-tertiary. It used to be `--ink-disabled`, which
   * made "SAT" and "SUN" the only two column heads a low-vision reader could
   * not read (2.206:1 light). See the weekday row below.
   */
  quietColumns?: number[];

  /** The cells, in reading order, including the days either side of the month. */
  days?: CalendarDay[];
  /** How many event chips a cell shows before the rest collapse into a more-line. */
  maxEvents?: number;
  /** Turns the hidden count into the more-line. The kit draws no such line; see GAPS-COL1 CV-3. */
  formatMoreEvents?: (hidden: number) => string;
  /** Picking a day. Given, every enabled cell becomes a real button. */
  onSelectDay?: (day: CalendarDay) => void;
  /** Picking an event. Given, every chip becomes a real button. */
  onSelectEvent?: (event: CalendarEvent, day: CalendarDay) => void;

  /** The agenda's days, in order. Read only when `view="agenda"`. */
  agenda?: CalendarAgendaDay[];
  /** Opening an agenda item. Given, every enabled row becomes a real button. */
  onSelectItem?: (item: CalendarAgendaItem, day: CalendarAgendaDay) => void;

  /**
   * 27.25's line under the grid — "6 of 24 records carry a date. The rest
   * are in the list view." A calendar can only hold dated records, so the
   * view SAYS what it cannot show rather than silently dropping it. The
   * words are the caller's: only the application knows the two counts.
   */
  footnote?: React.ReactNode;
  /**
   * The far end of the footnote row — 27.25 draws the dot legend there
   * (Meeting · Shipped · Due). A node; pass dot-and-word pairs.
   */
  legend?: React.ReactNode;

  /** The period has not arrived. Cold cache only. */
  loading?: boolean;
  /** The request failed. Beats `empty`. */
  error?: boolean;
  loadingState?: React.ReactNode;
  emptyState?: React.ReactNode;
  errorState?: React.ReactNode;
  loadingLabel?: string;
  emptyLabel?: string;
  emptyBody?: string;
  errorLabel?: string;
  errorBody?: string;
  /** Accessible name for the calendar as a whole. */
  label?: string;
}

/** 27.25's chip when it carries a dot; the cva chip otherwise. */
function eventChipClass(event: CalendarEvent): string {
  return event.dot !== undefined
    ? cn(
        "flex w-full min-w-0 items-center gap-1.5 rounded-pill bg-card px-2",
        "text-badge leading-[1.6] text-start font-[var(--font-weight-medium)] text-foreground",
      )
    : cn(eventChipVariants({ tone: event.tone }));
}

function eventChipBody(event: CalendarEvent): React.ReactNode {
  if (event.dot === undefined) return event.label;
  return (
    <React.Fragment>
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-pill", EVENT_DOT[event.dot])}
      />
      <span className="min-w-0 truncate">{event.label}</span>
    </React.Fragment>
  );
}

/** Which one class set the cell paints. See the precedence note above. */
function resolveDayState(day: CalendarDay): NonNullable<
  VariantProps<typeof dayCellVariants>["state"]
> {
  if (day.disabled) return "disabled";
  if (day.selected) return "selected";
  if (day.today) return "today";
  if (day.outside) return "outside";
  return "default";
}

/**
 * A month grid, and the same period as an agenda.
 *
 * TEN STATES
 *  1. default        — seven columns of paper cells under a quiet weekday
 *                      row, each cell a day number and up to `maxEvents`
 *                      chips; or, in `agenda`, day headings over hairline-
 *                      separated rows.
 *  2. hover          — only on a SELECTABLE cell or chip: `--accent`, the
 *                      neutral row and item wash, and only on the three
 *                      unfilled states. A mango or charcoal cell washed with
 *                      5% charcoal reads as dirt, so those two keep their
 *                      fill — the same reasoning `Card` uses for its two
 *                      coloured variants. Never mango as a hover, never an
 *                      opacity.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the control's own radius. A selectable day is a
 *                      real `button` and is reachable already.
 *  4. active/pressed — does not apply to a cell. The kit draws no pressed
 *                      day, and a cell that nudged would shift the whole row
 *                      it sits in. The header's two steps are Buttons and
 *                      nudge as every Button does.
 *  5. disabled       — per day (`day.disabled`) and per agenda item:
 *                      `--surface-quiet` and `--ink-disabled`, and no button
 *                      is rendered at all, so it is neither hoverable nor
 *                      focusable. A fill and an ink.
 *  6. loading        — `loading`: a placeholder grid of the same shape, so
 *                      nothing reflows when the period lands. Cold cache
 *                      only; a warm re-fetch keeps the month on screen and
 *                      marks it busy, because blanking a calendar the reader
 *                      is scanning loses their place.
 *  7. empty          — a month with no `days` at all is a calendar that has
 *                      not been given one, and shows the quiet register. A
 *                      month with days but NO EVENTS is not empty — it is an
 *                      empty month, and it draws its cells, because the grid
 *                      is the answer. In `agenda`, no days shows the register:
 *                      an agenda with nothing in it has nothing to draw.
 *  8. error          — `error`: the register with a poppy dot and its own
 *                      wording. Beats `empty`.
 *  9. selected       — `day.selected`: the charcoal fill, plus
 *                      `aria-pressed` on the cell so the mark is not colour
 *                      alone. At most one per view by convention; the
 *                      component does not enforce it, because a range
 *                      selection is a real case and enforcing one would
 *                      forbid it.
 * 10. read-only      — no `onSelectDay` and no `onSelectEvent`: the cells
 *                      render as plain elements. The calendar still shows
 *                      everything; only the way in is gone. This is the
 *                      honest read-only, and it is why no cell is ever drawn
 *                      with the disabled skin just because the view is not
 *                      interactive.
 *
 * THREE BREAKPOINTS
 *  · mobile (base) — the grid keeps all seven columns, because six columns is
 *    not a week. The cell becomes SQUARE (`aspect-square`, chapter 18's own
 *    small drawing) and the event CHIPS are replaced by chapter 18's 6 dots —
 *    a 45-wide cell cannot hold a chip with a readable label, and the kit
 *    solved this itself the second time it drew a calendar. The header's two
 *    steps stay at the standing 40 control height.
 *  · tablet (`sm:`, 40rem) — chapter 19's drawing: the cell grows to a 5.5rem
 *    minimum with its height set by its content, and the chips come back.
 *  · desktop — UNCHANGED from tablet. A month is seven columns at every
 *    width above a phone; the cells simply get taller as the column does.
 *  · `agenda` — UNCHANGED at all three. Its three columns are 64 + content +
 *    auto, which fits at 320, and it is the view the month grid would degrade
 *    into anyway.
 *
 * RTL — safe, and unused: the system is LTR only. The grid's column order
 * follows the writing direction, the header's steps are ordered by the
 * document rather than by side, and every inset is logical.
 */
const CalendarView = React.forwardRef<HTMLDivElement, CalendarViewProps>(
  (
    {
      className,
      view = "month",
      monthLabel,
      monthNote,
      onPrevious,
      onNext,
      previousLabel = "Previous period",
      nextLabel = "Next period",
      weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      quietColumns = [5, 6],
      days,
      /* 27.25: "Each day shows up to three chips … then '+2 more'." */
      maxEvents = 3,
      formatMoreEvents = (hidden) => `+${hidden} more`,
      onSelectDay,
      onSelectEvent,
      agenda,
      onSelectItem,
      footnote,
      legend,
      loading = false,
      error = false,
      loadingState,
      emptyState,
      errorState,
      loadingLabel = "Loading…",
      emptyLabel = "Nothing scheduled",
      emptyBody = "There is nothing in this period.",
      errorLabel = "Calendar unavailable",
      errorBody = "We can’t show this right now. Try again in a moment.",
      label,
      ...props
    },
    ref,
  ) => {
    const cells = days ?? [];
    const agendaDays = agenda ?? [];
    const source = view === "agenda" ? agendaDays : cells;

    /* Exclusive states resolved in JS (PATTERN §4): loading beats error beats
       empty. */
    const state = loading
      ? "loading"
      : error
        ? "error"
        : source.length === 0
          ? "empty"
          : "default";

    const header =
      monthLabel !== undefined || monthNote !== undefined || onPrevious || onNext ? (
        <div
          data-slot="calendar-view-header"
          /* Chapter 18's own header row: the period's name, then a quiet note
             pushed to the inline end. */
          className="flex flex-wrap items-center gap-3"
        >
          {monthLabel === undefined || monthLabel === null ? null : (
            <span className="text-caption font-[var(--font-weight-medium)]">{monthLabel}</span>
          )}
          {monthNote === undefined || monthNote === null ? null : (
            <span className="text-xs text-ink-tertiary">{monthNote}</span>
          )}
          {onPrevious || onNext ? (
            <div className="ms-auto flex items-center gap-2">
              {onPrevious ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  aria-label={previousLabel}
                  onClick={onPrevious}
                >
                  <ChevronLeft />
                </Button>
              ) : null}
              {onNext ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  aria-label={nextLabel}
                  onClick={onNext}
                >
                  <ChevronRight />
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null;

    const register =
      state === "loading"
        ? (loadingState ?? (
            <div
              aria-busy="true"
              className="grid grid-cols-7 gap-[var(--space-1h)]"
              role="status"
              aria-label={loadingLabel}
            >
              {Array.from({ length: 28 }, (_, i) => (
                <Skeleton
                  key={i}
                  variant="card"
                  announce={false}
                  className="aspect-square h-auto sm:aspect-auto sm:h-[5.5rem]"
                />
              ))}
            </div>
          ))
        : state === "error"
          ? (errorState ?? (
              <CollectionRegister tone="error" eyebrow={errorLabel} body={errorBody} />
            ))
          : state === "empty"
            ? (emptyState ?? (
                <CollectionRegister tone="quiet" eyebrow={emptyLabel} body={emptyBody} />
              ))
            : null;

    return (
      <div
        ref={ref}
        data-slot="calendar-view"
        data-view={view}
        data-state={state}
        aria-busy={loading || undefined}
        aria-label={label}
        className={cn("flex min-w-0 flex-col gap-4", className)}
        {...props}
      >
        {header}

        {register}

        {state === "default" && view === "month" ? (
          <div data-slot="calendar-view-month" className="flex min-w-0 flex-col gap-2">
            {/* The weekday row. `text-micro` IS the uppercase eyebrow step and
                carries ruling 16's 0.08em tracking in the same class.

                ALL SEVEN HEADS ARE TERTIARY. Corrected 2026-08-23,
                GAPS-CONTRAST §2 row 7. The quiet columns were painted
                `--ink-disabled`, which measured 2.206:1 light / 3.689:1 dark
                against 4.5 while the other five sat at 5.899 / 8.807. A
                Saturday is not a disabled control — it is a day of the week,
                and the reader needs it to know which column they are in.
                This file's own DESIGN SOURCE block, read off CH19 view 05,
                says the weekday label is "11 / 500 / uppercase / 0.08em
                tracking, TERTIARY ink" for every one of the seven; the
                artifact draws no weekend distinction in the head at all.

                `quietColumns` keeps its name, its type and its default —
                the applications import this — but a tier down is now a WEIGHT
                step, 300 against the row's 500. Both weights ship (Saans is
                Light 300 and Medium 500, and `--font-weight-light` is a real
                token), so the column still reads quieter without borrowing
                the one ink that is exempt from being legible. There is no
                readable tone between tertiary and disabled to reach for. */}
            <div
              aria-hidden="true"
              className="grid grid-cols-7 gap-[var(--space-1h)] px-1"
            >
              {weekdayLabels.map((name, index) => (
                <span
                  key={name}
                  className={cn(
                    "truncate text-micro uppercase text-ink-tertiary",
                    quietColumns.includes(index)
                      ? "font-[var(--font-weight-light)]"
                      : "font-[var(--font-weight-medium)]",
                  )}
                >
                  {name}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-[var(--space-1h)] [grid-auto-rows:1fr]">
              {cells.map((day) => {
                const cellState = resolveDayState(day);
                const events = day.events ?? [];
                const shown = events.slice(0, Math.max(0, maxEvents));
                const hidden = events.length - shown.length;
                const pickable = Boolean(onSelectDay) && !day.disabled;

                const body = (
                  <>
                    <time
                      dateTime={day.dateTime}
                      className={cn(
                        "text-xs tabular-nums",
                        // The kit quiets the number with an alpha; an alpha of
                        // an ink is a colour the palette does not contain, so
                        // this is the ink tier instead. On the two filled
                        // states the label inherits, because a tertiary ink on
                        // charcoal would fail contrast.
                        cellState === "default" && "text-ink-tertiary",
                      )}
                    >
                      {day.label}
                    </time>

                    {events.length ? (
                      <>
                        {/* Below `sm:` the chips become chapter 18's dots. */}
                        <span className="flex flex-wrap gap-1 sm:hidden">
                          {shown.map((event) => (
                            <span
                              key={event.id}
                              aria-hidden="true"
                              className={cn(
                                eventChipVariants({ tone: event.tone }),
                                // The chip's own width and inset are dropped;
                                // what is left is its FILL at the dot size.
                                "block size-[var(--dot-status)] rounded-pill p-0",
                              )}
                            />
                          ))}
                        </span>

                        <span className="hidden min-w-0 flex-col gap-1 sm:flex">
                          {shown.map((event) =>
                            onSelectEvent ? (
                              <button
                                key={event.id}
                                type="button"
                                title={event.title}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectEvent(event, day);
                                }}
                                className={cn(eventChipClass(event), "cursor-pointer")}
                              >
                                {eventChipBody(event)}
                              </button>
                            ) : (
                              <span
                                key={event.id}
                                title={event.title}
                                className={eventChipClass(event)}
                              >
                                {eventChipBody(event)}
                              </span>
                            ),
                          )}
                          {hidden > 0 ? (
                            <span className="px-2 text-badge text-ink-tertiary tabular-nums">
                              {formatMoreEvents(hidden)}
                            </span>
                          ) : null}
                        </span>
                      </>
                    ) : null}
                  </>
                );

                const shape = cn(
                  dayCellVariants({ state: cellState }),
                  // Chapter 18's square cell on a phone; chapter 19's
                  // content-height cell from `sm:`.
                  "aspect-square sm:aspect-auto sm:min-h-[5.5rem]",
                );

                if (!pickable) {
                  return (
                    <div key={day.key} data-slot="calendar-day" className={shape}>
                      {body}
                    </div>
                  );
                }

                return (
                  <button
                    key={day.key}
                    type="button"
                    data-slot="calendar-day"
                    aria-pressed={day.selected ?? false}
                    onClick={() => onSelectDay?.(day)}
                    className={cn(
                      shape,
                      "cursor-pointer",
                      // The neutral wash, and only where a wash reads as one:
                      // the two filled states keep their fill.
                      (cellState === "default" ||
                        cellState === "outside") &&
                        "enabled:hover:bg-accent",
                    )}
                  >
                    {body}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* 27.25's NARROW render, as its own view: "Below 720px the month
            becomes seven day-pills with a dot for 'has records', and the
            selected day's records list underneath as normal rows. A 7×6 grid
            on a phone is unreadable and untappable." The SCREEN chooses this
            view below the shared 45rem — the component cannot, because
            picking the shown week is date arithmetic, which this file
            refuses by law. `days` is the week's seven cells; `agenda` is the
            picked day's list. */}
        {state === "default" && view === "week" ? (
          <div data-slot="calendar-view-week" className="flex min-w-0 flex-col gap-4">
            <div className="grid grid-cols-7 gap-1.5">
              {cells.map((day, index) => {
                const cellState = resolveDayState(day);
                const pickable = Boolean(onSelectDay) && !day.disabled;
                const hasRecords = (day.events ?? []).length > 0;
                const pill = (
                  <span className="flex min-w-0 flex-col items-center gap-1">
                    <span className="text-micro uppercase text-ink-tertiary">
                      {weekdayLabels[index % 7]}
                    </span>
                    <span
                      className={cn(
                        "flex size-10 flex-col items-center justify-center rounded-pill",
                        "text-xs tabular-nums",
                        cellState === "today" && "bg-surface-brand text-ink-on-accent",
                        cellState === "selected" && "bg-surface-inverse text-ink-on-inverse",
                        cellState === "disabled" && "bg-surface-quiet text-ink-disabled",
                        (cellState === "default" || cellState === "outside") && "bg-card",
                        cellState === "outside" && "text-ink-tertiary",
                      )}
                    >
                      {day.label}
                      {/* The dot for "has records" — presence, not a status. */}
                      {hasRecords ? (
                        <span
                          aria-hidden="true"
                          className="mt-0.5 size-1 rounded-pill bg-current"
                        />
                      ) : null}
                    </span>
                  </span>
                );
                return pickable ? (
                  <button
                    key={day.key}
                    type="button"
                    data-slot="calendar-week-day"
                    aria-pressed={day.selected ?? false}
                    onClick={() => onSelectDay?.(day)}
                    className="cursor-pointer rounded-[var(--radius)] border-0 bg-transparent p-0"
                  >
                    {pill}
                  </button>
                ) : (
                  <span key={day.key} data-slot="calendar-week-day">
                    {pill}
                  </span>
                );
              })}
            </div>

            {agendaDays.map((day) => (
              <div key={day.key} className="flex min-w-0 flex-col gap-2">
                <span className="text-micro font-[var(--font-weight-medium)] uppercase text-foreground">
                  {day.label}
                </span>
                {day.items.map((item) => {
                  const pickable = Boolean(onSelectItem) && !item.disabled;
                  const inner = (
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="min-w-0 text-sm font-[var(--font-weight-medium)]">
                        {item.title}
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-tertiary">
                        <time dateTime={item.dateTime} className="tabular-nums">
                          {item.time}
                        </time>
                        {item.who}
                      </span>
                    </span>
                  );
                  const card = cn(
                    "w-full rounded-[var(--radius)] bg-surface-panel px-4 py-3 text-start",
                    item.disabled && "bg-surface-quiet text-ink-disabled",
                  );
                  return pickable ? (
                    <button
                      key={item.id}
                      type="button"
                      data-slot="calendar-week-item"
                      onClick={() => onSelectItem?.(item, day)}
                      className={cn(card, "cursor-pointer enabled:hover:bg-accent")}
                    >
                      {inner}
                    </button>
                  ) : (
                    <div key={item.id} data-slot="calendar-week-item" className={card}>
                      {inner}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}

        {/* 27.25's line under the grid, and the dot legend at its far end —
            what the calendar cannot show, said in words. */}
        {state === "default" && (footnote !== undefined || legend !== undefined) ? (
          <div
            data-slot="calendar-view-footnote"
            className="flex min-w-0 flex-wrap items-center gap-2 text-caption text-ink-tertiary"
          >
            {footnote !== undefined ? <span className="min-w-0">{footnote}</span> : null}
            {legend !== undefined ? <span className="ms-auto">{legend}</span> : null}
          </div>
        ) : null}

        {state === "default" && view === "agenda" ? (
          <div data-slot="calendar-view-agenda" className="flex min-w-0 flex-col gap-4">
            {agendaDays.map((day) => (
              <div key={day.key} className="flex min-w-0 flex-col">
                <span
                  className={cn(
                    // The kit's day heading: micro uppercase, 4/12/6 of inset.
                    "px-3 pb-[var(--space-1h)] pt-1",
                    "text-micro font-[var(--font-weight-medium)] uppercase text-foreground",
                  )}
                >
                  {day.label}
                </span>

                {day.items.map((item) => {
                  const pickable = Boolean(onSelectItem) && !item.disabled;

                  const row = cn(
                    // The kit's three columns, with the "who" column pushed
                    // to the inline end.
                    "grid grid-cols-[4rem_1fr_auto] items-center gap-[var(--space-3h)]",
                    /* Inset shadow, not a border - see the note in list.tsx. */
                    "shadow-[var(--hairline-under)] last:shadow-none px-3 py-3 text-start",
                    "transition-colors duration-[var(--duration-colour)] ease-kwapso",
                    item.disabled && "text-ink-disabled",
                  );

                  const inner = (
                    <>
                      <time
                        dateTime={item.dateTime}
                        className="text-caption tabular-nums text-ink-tertiary"
                      >
                        {item.time}
                      </time>
                      <span className="min-w-0 text-sm">{item.title}</span>
                      <span className="text-xs text-ink-tertiary">{item.who}</span>
                    </>
                  );

                  return pickable ? (
                    <button
                      key={item.id}
                      type="button"
                      data-slot="calendar-agenda-item"
                      onClick={() => onSelectItem?.(item, day)}
                      className={cn(
                        row,
                        "-mx-3 w-full cursor-pointer rounded-[var(--radius)] px-3",
                        "enabled:hover:bg-accent",
                      )}
                    >
                      {inner}
                    </button>
                  ) : (
                    <div key={item.id} data-slot="calendar-agenda-item" className={row}>
                      {inner}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  },
);

CalendarView.displayName = "CalendarView";

export { CalendarView, dayCellVariants as calendarDayVariants, eventChipVariants as calendarEventVariants };
