/* ============================================================================
   DatePicker — the date field, its month panel and its clock (0 direct calls
   today; the screen engine reaches it, and every retainer period in the
   product is a date).

   THREE MODES (added in review round 1)
   `mode="date"` (the default, unchanged), `mode="datetime"` — the month grid
   with an hour and a minute under it — and `mode="time"` — the clock alone,
   no calendar, no month stepper. One component, because the field, the paper,
   the radius and the on-state are the same in all three; only the panel's
   contents change.

   HOW A DATE IS WRITTEN, AND WHY NOTHING IS HARDCODED
   Ruling 07: "Dates follow the app language, not the browser: 13 Jun 2026,
   14:05 in English, 13. Juni 2026, 14:05 in German. The sortable 2026-06-13
   form is for machine columns and exports only." Both of those strings fall
   out of `Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year:
   "numeric", hour: "2-digit", minute: "2-digit" })` with no format string
   anywhere in this file — en-GB returns "13 Jun 2026, 14:05" and de-DE
   returns "13. Juni 2026, 14:05", including the comma and the 24-hour clock.
   The locale is the CALLER's (`locale`), never the browser's, which is the
   whole of the ruling. The sortable form appears in exactly one place: the
   hidden input a plain form post reads, which is a machine column.

   DESIGN SOURCE
   design-mothership/specimens/_fragments/t9.css → `.kw-affix` and
     `.kw-affix__glyph` — chapter 9's date control IS the affix pill: 44 tall,
     one hairline, full pill, page fill, a calendar glyph in tertiary ink
     leading a tabular value ("11 Aug — 24 Aug"). The trigger below is that
     drawing and nothing else.
   design-mothership/specimens/_fragments/t10.css → the chapter 10 on-state
     law, `--surface-inverse` fill with `--ink-on-inverse` ink, which is what
     a chosen day takes. Never mango: the accent is a brand fill, not a
     selection.
   design-mothership/specimens/kwapso-ui.css → `.kw-card` for the panel's
     paper (`--popover`, `--radius`, `--shadow-overlay`).

   THE KIT DRAWS NO CALENDAR GRID. The cell size, the today mark, the weekday
   row and the two footer actions are assembled from parts the kit does draw
   and are logged as GAPS-C.md DTP-1 … DTP-3.

   THE LAW THIS FILE OBEYS
   · The trigger is a field and carries CH09's TWO hairline strengths —
     `--hair-strong` at rest, `--border` (8%) disabled, override 42 —
     as an inset shadow rather than a `border` property.
   · Four radii only. The trigger is `--radius-pill`, the panel is `--radius`
     (24), and a day cell is `--radius-select` (6), which is the radius that
     exists precisely for "marks and selection controls".
   · Focus is ONE global rule (tokens.css §8). No ring is defined here, and
     nothing sets `outline: none`. The trigger moves its own HAIRLINE to ink
     while the panel is open, which is a fill colour, not a ring.
   · Disabled is a fill and an ink, never an opacity — for the control AND for
     a disabled date, which takes `--ink-disabled` and no fill at all, because
     a fill would read as a selection.
   · Error is chapter 9's 65% poppy hairline via `color-mix`, so dark
     re-resolves to poppy-lift.
   · The month stepper MIRRORS. The two chevrons swap glyph direction under
     `dir="rtl"`, and the grid's reading order follows the document, so an
     Arabic, Urdu or Persian month steps the way its reader expects.
   · Every user-facing string is a prop with a default, and every string that
     depends on the calendar or the clock — month name, weekday, the spoken
     date, the hour, the minute — comes from `Intl` rather than from a table
     in this file.
   · NO CSS `border`. The field's hairline is an inset shadow, which is how
     the artifact draws its own (`box-shadow: inset 0 0 0 1px var(--hair)`,
     CH19) and how `select.tsx` and `sort-control.tsx` now draw the same
     field.

   RENDERING CONTEXT
   `"use client"`. Open state, roving focus, a document listener, and refs.
   ========================================================================= */

"use client";

import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { Button } from "../button/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../select/select";
import {
  Calendar,
  CaretLeft,
  CaretRight,
  Clock,
} from "../../foundations/icons";

/* ----------------------------------------------------------------------------
   Date arithmetic — local, not exported. Plain `Date`, no library: the
   commission's dependency list has no date package on it and none is needed
   for a month grid.
   ------------------------------------------------------------------------- */
function startOfDay(date: Date): Date {
  const copy = new Date(date.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, count: number): Date {
  const copy = startOfDay(date);
  copy.setDate(copy.getDate() + count);
  return copy;
}

function addMonths(date: Date, count: number): Date {
  const copy = startOfDay(date);
  copy.setDate(1);
  copy.setMonth(copy.getMonth() + count);
  return copy;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Six rows of seven, always. A fixed row count keeps the panel one height, so
 * stepping from a 4-row February to a 6-row March does not make the paper
 * jump under the pointer.
 */
function buildGrid(view: Date, weekStartsOn: number): Date[] {
  const first = startOfDay(new Date(view.getFullYear(), view.getMonth(), 1));
  const offset = (first.getDay() - weekStartsOn + 7) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

/** Same clock, a different hour and minute. Never mutates. */
function withTime(date: Date, hours: number, minutes: number): Date {
  const copy = new Date(date.getTime());
  copy.setHours(hours, minutes, 0, 0);
  return copy;
}

function pad2(value: number, locale?: string | string[]): string {
  return new Intl.NumberFormat(locale, {
    minimumIntegerDigits: 2,
    useGrouping: false,
  }).format(value);
}

const HOURS = Array.from({ length: 24 }, (_, index) => index);

const triggerVariants = cva(
  [
    "flex w-full min-w-0 items-center gap-2",
    // `.kw-affix`: 44 tall, 18 inline padding (`--space-4h`, CH09), full pill,
    // one hairline (FLD-B2) — and
    // the hairline is an inset shadow, never a CSS border.
    "h-[var(--control-height-input)] px-[var(--space-4h)] rounded-pill",
    "bg-background text-start",
    "text-sm font-[var(--font-weight-light)]",
    "transition-[box-shadow,background-color]",
    "duration-[var(--duration-colour)] ease-kwapso",
  ],
  {
    variants: {
      /** Mutually exclusive. Resolved once, in JS, below. */
      state: {
        default: [
          "cursor-pointer text-foreground",
          /* OVERRIDE 42 — the trigger is a FIELD, so CH09's two strengths
             govern it: `var(--hair2)` at rest and `var(--hair)` disabled.
             The build had them swapped and promoted 8% to 20% on hover, so a
             resting trigger and a disabled one carried the same stroke. The
             hover is gone with no replacement — it came from kwapso-ui.css
             and the artifact draws none. Only the INK moves; the stroke
             keeps its `inset 0 0 0 0.0625rem` shape. */
          "shadow-[inset_0_0_0_0.0625rem_var(--hair-strong)]",
          // Open is this control's pressed moment, and it takes the same ink
          // hairline focus does. The panel is the feedback.
          "data-[open=true]:shadow-[inset_0_0_0_0.0625rem_var(--foreground)]",
        ],
        /** Chapter 9's 65%, token-driven so dark re-resolves to poppy-lift. */
        error: [
          "cursor-pointer text-foreground",
          "shadow-[inset_0_0_0_0.0625rem_color-mix(in_srgb,var(--destructive)_65%,transparent)]",
        ],
        /** "System-set values lose the border entirely." Faint fill, no hairline. */
        readOnly: "bg-hair-faint text-foreground shadow-none",
        /* A fill, an ink and the WEAK edge — `--border` is 8% against the
           resting trigger's 20%, which is what tells the two apart
           (override 42). The `hover:` freezes in this variant and in `error`
           held the default's hover still; there is no hover left to hold. */
        disabled: [
          "cursor-not-allowed bg-hair-faint text-ink-disabled",
          "shadow-[inset_0_0_0_0.0625rem_var(--border)]",
        ],
      },
    },
    defaultVariants: { state: "default" },
  },
);

const dayVariants = cva(
  [
    "grid place-content-center border-0 bg-transparent",
    // 32 square — `--control-height-dense`, the kit's smallest control — at
    // the 6 selection radius, which exists for exactly this kind of mark.
    "size-[var(--control-height-dense)] rounded-[var(--radius-select)]",
    "text-sm tabular-nums",
    "transition-colors duration-[var(--duration-colour)] ease-kwapso",
  ],
  {
    variants: {
      tone: {
        /** In the month being shown. */
        default: "cursor-pointer text-foreground hover:bg-accent",
        /** Spilled in from the month before or after. Tertiary ink, still pickable. */
        outside: "cursor-pointer text-ink-tertiary hover:bg-accent",
        /**
         * Chapter 10's on-state: inverse fill, light mark. Hover holds it —
         * a chosen day that pales under the cursor reads as unselected.
         */
        selected:
          "cursor-pointer bg-surface-inverse text-ink-on-inverse hover:bg-surface-inverse",
        /**
         * An ink and no fill. A fill here would read as a second selection,
         * which is the one thing a disabled day must not look like.
         */
        disabled: "cursor-not-allowed text-ink-disabled",
      },
    },
    defaultVariants: { tone: "default" },
  },
);

/**
 * What the control asks for. `date` is the default and is the drawing this
 * component has always had; the other two were added in review round 1.
 */
export type DatePickerMode = "date" | "datetime" | "time";

export interface DatePickerProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onChange" | "defaultValue"> {
  /**
   * `date` — the month grid alone, and the value is written "13 Jun 2026".
   * `datetime` — the grid with an hour and a minute under it, written
   *   "13 Jun 2026, 14:05". Choosing a day does NOT close the panel: the
   *   reader has not finished answering yet.
   * `time` — the hour and the minute alone, written "14:05". No calendar, no
   *   month stepper, and the value's DATE part is whatever it already was
   *   (today, if nothing was set), because a time still needs a day behind it.
   * Every one of those strings is `Intl`'s, from `locale` — see the header.
   */
  mode?: DatePickerMode;
  /**
   * How far apart the minutes in the list are. `1` — every minute — is the
   * default because it invents nothing; the artifact names no granularity, so
   * a 5 or a 15 is the CALLER's decision about their own data, not a design
   * value this component may choose for them. Logged as GAPS-REVIEW1B DTP-6.
   */
  minuteStep?: number;
  /** The hour list's accessible name. Translatable. */
  hourLabel?: string;
  /** The minute list's accessible name. Translatable. */
  minuteLabel?: string;
  /** The chosen day, controlled. `null` is "nothing chosen". */
  value?: Date | null;
  /** The chosen day, uncontrolled. */
  defaultValue?: Date | null;
  /** Fired with the new day, or `null` when it is cleared. */
  onValueChange?: (value: Date | null) => void;
  /**
   * BCP-47 tag for the month name, the weekday row and the spoken date. Left
   * undefined the runtime's own locale is used — pass it explicitly when the
   * page is server-rendered, so the server and the browser agree.
   */
  locale?: string | string[];
  /** 0 Sunday … 6 Saturday. Defaults to Monday; see GAPS-C.md DTP-3. */
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Nothing before this day may be chosen. */
  min?: Date;
  /** Nothing after this day may be chosen. */
  max?: Date;
  /** Anything else that cannot be chosen — a closed day, a booked slot. */
  isDateDisabled?: (date: Date) => boolean;
  /** Shown in the pill while nothing is chosen. Tertiary ink. */
  placeholder?: string;
  /**
   * Replace the way a chosen day is written in the pill. The default is
   * `Intl`, so it already follows the locale and needs no translation.
   */
  formatValue?: (value: Date) => string;
  /** The jump-to-this-month action. Translatable. */
  todayLabel?: string;
  /** The clear action, shown only once something is chosen. Translatable. */
  clearLabel?: string;
  /** The month stepper's accessible names. Translatable. */
  previousMonthLabel?: string;
  nextMonthLabel?: string;
  /**
   * The panel's accessible name. Translatable. Left undefined it follows the
   * mode, so a time panel is not announced as "Choose a date".
   */
  panelLabel?: string;
  /** Panel visibility, controlled. Leave undefined and the component owns it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Failed validation: 65% poppy border. The message belongs to `field`. */
  error?: boolean;
  /** The value has not arrived. Read-only skin, non-interactive, `aria-busy`. */
  loading?: boolean;
  /** A fill and an ink; the panel cannot be opened. */
  disabled?: boolean;
  /** A system-set date: the border goes, and the panel cannot be opened. */
  readOnly?: boolean;
  /** Emits the chosen day as `YYYY-MM-DD` in a hidden input, for a plain form post. */
  name?: string;
  /** Forwarded to the trigger, so `field` can wire the label to it. */
  id?: string;
}

/**
 * The system's date field.
 *
 * TEN STATES
 *  1. default        — the affix pill: glyph, tabular value, one hairline at
 *                      `--hair-strong` (override 42).
 *                      `date` shows "13 Jun 2026", `datetime` shows
 *                      "13 Jun 2026, 14:05", `time` shows "14:05" — all three
 *                      from `Intl` and the caller's locale (ruling 07).
 *  2. hover          — does not apply to the TRIGGER. CH09 draws a field at
 *                      rest, at focus and disabled and no hover for any of
 *                      them; the one this file carried came from
 *                      kwapso-ui.css, and the 20% it promoted to is now the
 *                      resting edge (override 42). Nothing replaces it. A day
 *                      cell inside the panel still hovers on `--accent` —
 *                      that is a menu row, not a field edge.
 *  3. focus-visible  — NOT here. tokens.css §8 rings the trigger, the two
 *                      steppers and the focused day cell. This file adds none.
 *  4. active/pressed — OPEN is this control's pressed moment: the border goes
 *                      to ink and the panel is the feedback. There is no
 *                      separate pressed tone.
 *  5. disabled       — `--hair-faint` fill, `--ink-disabled` ink, the WEAK 8%
 *                      edge against the resting trigger's 20% (override 42),
 *                      the panel cannot open. A disabled DATE inside the grid
 *                      is an ink with no fill, and is not focusable.
 *  6. loading        — `loading`: the read-only skin, `aria-busy`, the panel
 *                      cannot open. Same reasoning as `input.tsx` — a date
 *                      chosen before the stored one arrives is discarded.
 *  7. empty          — the placeholder in tertiary ink. Nothing else marks an
 *                      unset date; a dash would be a value. In `datetime` and
 *                      `time` the two clock pickers show their own names
 *                      ("Hour", "Minute") until an hour is answered.
 *  8. error          — `error`: 65% poppy border. The MESSAGE beside it is ink
 *                      and belongs to `field` (chapter 9: "error text
 *                      poppy-free").
 *  9. selected       — the chosen day takes the inverse fill and the light
 *                      ink, chapter 10's on-state for every mark in the
 *                      system. `aria-selected` says the same thing.
 * 10. read-only      — `readOnly`: the border goes away entirely, faint fill,
 *                      panel sealed. The value is still selectable text.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED, in all three modes. The trigger is
 *  `w-full` and 44 tall, already the touch row; the panel is one fixed grid of
 *  32 cells at every width, and the clock is two dense pickers that size
 *  themselves, because a calendar that reflowed would stop being a calendar. A
 *  phone that wants the panel as a sheet asks `sheet` for one — that is the
 *  composition's decision and not this field's (GAPS-C.md DTP-4).
 *
 * RTL — handled, not merely safe. The two stepper glyphs rotate under
 * `dir="rtl"` so "previous" still points backwards in reading order, the grid
 * columns lay out from the reading start because the rows are plain flex, and
 * every inset is logical. The panel is anchored with `start-0`, not a side.
 */
const DatePicker = React.forwardRef<HTMLDivElement, DatePickerProps>(
  (
    {
      className,
      mode = "date",
      minuteStep = 1,
      hourLabel = "Hour",
      minuteLabel = "Minute",
      value,
      defaultValue = null,
      onValueChange,
      locale,
      weekStartsOn = 1,
      min,
      max,
      isDateDisabled,
      placeholder,
      formatValue,
      todayLabel = "Today",
      clearLabel = "Clear",
      previousMonthLabel = "Previous month",
      nextMonthLabel = "Next month",
      panelLabel,
      open: openProp,
      onOpenChange,
      error = false,
      loading = false,
      disabled = false,
      readOnly = false,
      name,
      id,
      ...props
    },
    ref,
  ) => {
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const gridRef = React.useRef<HTMLDivElement | null>(null);

    const controlledValue = value !== undefined;
    const [ownValue, setOwnValue] = React.useState<Date | null>(defaultValue);
    const selected = controlledValue ? (value ?? null) : ownValue;

    const controlledOpen = openProp !== undefined;
    const [ownOpen, setOwnOpen] = React.useState(false);
    const open = controlledOpen ? openProp : ownOpen;

    const locked = readOnly || loading;
    const inert = disabled || locked;

    const [view, setView] = React.useState<Date>(() =>
      startOfDay(selected ?? new Date()),
    );
    const [focused, setFocused] = React.useState<Date>(() =>
      startOfDay(selected ?? new Date()),
    );
    // Only move focus into the grid on a step the reader made, never on the
    // first paint of the panel's month.
    const shouldFocusCell = React.useRef(false);

    const captionId = React.useId();

    const setOpen = React.useCallback(
      (next: boolean) => {
        if (!controlledOpen) setOwnOpen(next);
        onOpenChange?.(next);
      },
      [controlledOpen, onOpenChange],
    );

    /* Outside pointer and Escape both close. `pointerdown` rather than
       `click`, so the panel is gone before the thing under the pointer
       reacts. */
    React.useEffect(() => {
      if (!open) return;
      const onPointerDown = (event: PointerEvent) => {
        const target = event.target as Element | null;
        if (rootRef.current?.contains(target as Node)) return;
        /* The hour and minute lists are Radix poppers and are portalled to
           the document body, so they are outside this panel in the DOM and
           inside it to a reader. Pressing 14 must not close the calendar the
           14 belongs to. */
        if (target?.closest?.("[data-radix-popper-content-wrapper]")) return;
        setOpen(false);
      };
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") setOpen(false);
      };
      document.addEventListener("pointerdown", onPointerDown);
      document.addEventListener("keydown", onKeyDown);
      return () => {
        document.removeEventListener("pointerdown", onPointerDown);
        document.removeEventListener("keydown", onKeyDown);
      };
    }, [open, setOpen]);

    React.useEffect(() => {
      if (!open || !shouldFocusCell.current) return;
      shouldFocusCell.current = false;
      const cell = gridRef.current?.querySelector<HTMLButtonElement>('[data-focused="true"]');
      cell?.focus();
    });

    /* Ruling 07, straight out of `Intl` with the CALLER's locale and no
       format string: en-GB gives "13 Jun 2026" / "13 Jun 2026, 14:05" /
       "14:05", de-DE gives "13. Juni 2026" / "13. Juni 2026, 14:05" /
       "14:05". The clock convention is the locale's too — nothing here
       forces `hour12`, because forcing it would be exactly the hardcoded
       format the ruling forbids. */
    const dateFormat = React.useMemo(
      () =>
        new Intl.DateTimeFormat(locale, {
          ...(mode === "time"
            ? null
            : { day: "numeric", month: "short", year: "numeric" }),
          ...(mode === "date" ? null : { hour: "2-digit", minute: "2-digit" }),
        }),
      [locale, mode],
    );
    const hourFormat = React.useMemo(
      () => new Intl.DateTimeFormat(locale, { hour: "2-digit" }),
      [locale],
    );
    const captionFormat = React.useMemo(
      () => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }),
      [locale],
    );
    const spokenFormat = React.useMemo(
      () => new Intl.DateTimeFormat(locale, { dateStyle: "long" }),
      [locale],
    );
    /* The minute list. `minuteStep` defaults to 1, so the default list is
       every minute and no granularity is invented. */
    const minutes = React.useMemo(() => {
      const step = Number.isFinite(minuteStep) && minuteStep >= 1 ? Math.floor(minuteStep) : 1;
      const out: number[] = [];
      for (let m = 0; m < 60; m += step) out.push(m);
      return out;
    }, [minuteStep]);
    const weekdayFormat = React.useMemo(
      () => new Intl.DateTimeFormat(locale, { weekday: "short" }),
      [locale],
    );
    const dayFormat = React.useMemo(
      () => new Intl.DateTimeFormat(locale, { day: "numeric" }),
      [locale],
    );

    // Seven names taken off a real week, so they carry the locale's own
    // abbreviation and its own casing. 2024-01-01 was a Monday.
    const weekdays = React.useMemo(() => {
      const monday = startOfDay(new Date(2024, 0, 1));
      return Array.from({ length: 7 }, (_, index) =>
        weekdayFormat.format(addDays(monday, ((weekStartsOn + 6) % 7) + index)),
      );
    }, [weekdayFormat, weekStartsOn]);

    const days = React.useMemo(() => buildGrid(view, weekStartsOn), [view, weekStartsOn]);

    const dayDisabled = React.useCallback(
      (date: Date) => {
        if (min && date < startOfDay(min)) return true;
        if (max && date > startOfDay(max)) return true;
        return isDateDisabled?.(date) ?? false;
      },
      [min, max, isDateDisabled],
    );

    const commit = (date: Date | null) => {
      if (!controlledValue) setOwnValue(date);
      onValueChange?.(date);
      if (date) {
        setView(startOfDay(date));
        setFocused(startOfDay(date));
      }
    };

    /* Choosing a DAY keeps whatever hour is already answered, so picking
       "the 14th" after picking "14:05" does not silently throw the time
       away. On `datetime` the panel STAYS OPEN: the reader has answered half
       the question. */
    const choose = (date: Date) => {
      if (dayDisabled(date)) return;
      const base = selected ?? new Date();
      const kept =
        mode === "date"
          ? startOfDay(date)
          : withTime(date, base.getHours(), selected ? base.getMinutes() : 0);
      commit(kept);
      if (mode === "date") setOpen(false);
    };

    /* Choosing an hour or a minute. With nothing chosen yet the DATE part is
       today — a time still needs a day behind it — and the panel stays open
       because the other half of the clock is still unanswered. */
    const chooseTime = (hours: number, minutes: number) => {
      const base = selected ?? new Date();
      commit(withTime(base, hours, minutes));
    };

    const moveFocus = (next: Date) => {
      shouldFocusCell.current = true;
      setFocused(next);
      if (next.getMonth() !== view.getMonth() || next.getFullYear() !== view.getFullYear()) {
        setView(startOfDay(new Date(next.getFullYear(), next.getMonth(), 1)));
      }
    };

    const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      // The two inline arrows are read against the document's direction, so a
      // reader of Arabic, Urdu or Persian moves the way the row runs.
      const rtl =
        typeof window !== "undefined" && rootRef.current
          ? getComputedStyle(rootRef.current).direction === "rtl"
          : false;
      const inline = rtl ? -1 : 1;

      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          moveFocus(addDays(focused, -inline));
          break;
        case "ArrowRight":
          event.preventDefault();
          moveFocus(addDays(focused, inline));
          break;
        case "ArrowUp":
          event.preventDefault();
          moveFocus(addDays(focused, -7));
          break;
        case "ArrowDown":
          event.preventDefault();
          moveFocus(addDays(focused, 7));
          break;
        case "Home":
          event.preventDefault();
          moveFocus(addDays(focused, -((focused.getDay() - weekStartsOn + 7) % 7)));
          break;
        case "End":
          event.preventDefault();
          moveFocus(addDays(focused, 6 - ((focused.getDay() - weekStartsOn + 7) % 7)));
          break;
        case "PageUp":
          event.preventDefault();
          moveFocus(addMonths(focused, -1));
          break;
        case "PageDown":
          event.preventDefault();
          moveFocus(addMonths(focused, 1));
          break;
        default:
          break;
      }
    };

    const step = (count: number) => setView(addMonths(view, count));

    const state = disabled ? "disabled" : locked ? "readOnly" : error ? "error" : "default";
    const shown = selected
      ? (formatValue ?? ((date: Date) => dateFormat.format(date)))(selected)
      : undefined;

    const showsCalendar = mode !== "time";
    const showsClock = mode !== "date";
    const TriggerGlyph = mode === "time" ? Clock : Calendar;
    const panelName =
      panelLabel ??
      (mode === "time"
        ? "Choose a time"
        : mode === "datetime"
          ? "Choose a date and time"
          : "Choose a date");

    /* The clock, shared by `datetime` and `time`. Two kit pickers rather than
       two scrolling columns: `Select` already owns the paper, the radius, the
       overlay shadow, the highlighted row and — the reason it matters here —
       its own measured maximum height, so no list length is invented. */
    const clock = showsClock ? (
      <div data-slot="date-picker-time" className="flex items-center gap-2">
        <Select
          value={selected ? String(selected.getHours()) : undefined}
          onValueChange={(next) =>
            chooseTime(Number(next), selected ? selected.getMinutes() : 0)
          }
        >
          <SelectTrigger
            aria-label={hourLabel}
            className="h-[var(--control-height-dense)] w-auto min-w-0 px-3"
          >
            <SelectValue placeholder={hourLabel} />
          </SelectTrigger>
          <SelectContent>
            {HOURS.map((hour) => (
              <SelectItem key={hour} value={String(hour)}>
                {hourFormat.format(withTime(selected ?? new Date(), hour, 0))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span aria-hidden="true" className="text-sm text-ink-tertiary">
          :
        </span>

        <Select
          value={selected ? String(selected.getMinutes()) : undefined}
          onValueChange={(next) =>
            chooseTime(selected ? selected.getHours() : 0, Number(next))
          }
        >
          <SelectTrigger
            aria-label={minuteLabel}
            className="h-[var(--control-height-dense)] w-auto min-w-0 px-3"
          >
            <SelectValue placeholder={minuteLabel} />
          </SelectTrigger>
          <SelectContent>
            {minutes.map((minute) => (
              <SelectItem key={minute} value={String(minute)}>
                {pad2(minute, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    ) : null;

    return (
      <div
        ref={(node) => {
          rootRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) (ref as { current: HTMLDivElement | null }).current = node;
        }}
        data-slot="date-picker"
        data-mode={mode}
        data-state={state}
        className={cn("relative w-full min-w-0", className)}
        {...props}
      >
        <button
          type="button"
          id={id}
          data-slot="date-picker-trigger"
          data-open={open ? "true" : undefined}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-invalid={error || undefined}
          aria-busy={loading || undefined}
          onClick={() => {
            if (inert) return;
            shouldFocusCell.current = true;
            setOpen(!open);
          }}
          className={cn(triggerVariants({ state }))}
        >
          <TriggerGlyph
            size={16}
            aria-hidden="true"
            className={disabled ? "text-ink-disabled" : "text-ink-tertiary"}
          />
          {shown !== undefined ? (
            <span className="truncate tabular-nums">{shown}</span>
          ) : (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          )}
        </button>

        {name ? (
          <input
            type="hidden"
            name={name}
            /* The MACHINE column, ruling 07: sortable, ASCII digits, never
               localised. `YYYY-MM-DD` for a date, `YYYY-MM-DDTHH:mm` for a
               date and a time, `HH:mm` for a time. */
            value={selected ? machineValue(selected, mode) : ""}
            readOnly
          />
        ) : null}

        {open && !inert ? (
          <div
            role="dialog"
            aria-label={panelName}
            data-slot="date-picker-panel"
            data-side="bottom"
            className={cn(
              // Raised paper: the popover tone, the 24 box radius, the overlay
              // shadow. `motion-anchored` is motion.css's entrance; this file
              // writes no keyframe and no duration.
              "motion-anchored absolute top-full z-50 mt-2 start-0 w-max",
              "rounded-[var(--radius)] bg-popover p-4 text-popover-foreground shadow-xl",
            )}
          >
            {showsCalendar ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={previousMonthLabel}
                onClick={() => step(-1)}
                className={cn(
                  "grid size-[var(--control-height-dense)] shrink-0 place-content-center",
                  "cursor-pointer rounded-pill border-0 bg-transparent text-ink-secondary",
                  "hover:bg-accent hover:text-foreground",
                  "transition-colors duration-[var(--duration-colour)] ease-kwapso",
                )}
              >
                {/* Mirrored, not swapped: the same glyph turns so "previous"
                    keeps pointing backwards in reading order. */}
                <CaretLeft size={16} aria-hidden="true" className="rtl:rotate-180" />
              </button>

              <div
                id={captionId}
                aria-live="polite"
                className="flex-1 text-center text-sm font-[var(--font-weight-medium)]"
              >
                {captionFormat.format(view)}
              </div>

              <button
                type="button"
                aria-label={nextMonthLabel}
                onClick={() => step(1)}
                className={cn(
                  "grid size-[var(--control-height-dense)] shrink-0 place-content-center",
                  "cursor-pointer rounded-pill border-0 bg-transparent text-ink-secondary",
                  "hover:bg-accent hover:text-foreground",
                  "transition-colors duration-[var(--duration-colour)] ease-kwapso",
                )}
              >
                <CaretRight size={16} aria-hidden="true" className="rtl:rotate-180" />
              </button>
            </div>
            ) : null}

            {showsCalendar ? (
            <div
              ref={gridRef}
              role="grid"
              aria-labelledby={captionId}
              onKeyDown={onGridKeyDown}
              className="mt-3 flex flex-col gap-1"
            >
              <div role="row" className="flex gap-1">
                {weekdays.map((day, index) => (
                  <div
                    key={index}
                    role="columnheader"
                    /* `abbr` is a <th> attribute and is invalid on a div — it
                       typechecked as an error and would have been dropped from
                       the DOM, leaving the column header unlabelled for a
                       screen reader. aria-label carries the same information on
                       the role the element actually has. */
                    aria-label={day}
                    className="grid size-[var(--control-height-dense)] place-content-center text-badge text-ink-tertiary"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {[0, 1, 2, 3, 4, 5].map((week) => (
                <div key={week} role="row" className="flex gap-1">
                  {days.slice(week * 7, week * 7 + 7).map((date) => {
                    const outside = date.getMonth() !== view.getMonth();
                    const isSelected = selected ? isSameDay(date, selected) : false;
                    const off = dayDisabled(date);
                    const isFocused = isSameDay(date, focused);
                    const tone = off
                      ? "disabled"
                      : isSelected
                        ? "selected"
                        : outside
                          ? "outside"
                          : "default";

                    return (
                      <button
                        key={date.getTime()}
                        type="button"
                        role="gridcell"
                        aria-selected={isSelected}
                        aria-disabled={off || undefined}
                        aria-label={spokenFormat.format(date)}
                        data-today={isToday(date) ? "true" : undefined}
                        data-outside={outside ? "true" : undefined}
                        data-focused={isFocused ? "true" : undefined}
                        tabIndex={isFocused ? 0 : -1}
                        onClick={() => choose(date)}
                        onFocus={() => setFocused(startOfDay(date))}
                        className={cn(
                          dayVariants({ tone }),
                          /* Today, when it is not the chosen day: an inset
                             hairline, the same device chapter 10 uses on an
                             unchecked mark so the cell stays exactly 32.
                             Not a fill — a fill would read as a selection. */
                          !isSelected &&
                            "data-[today=true]:shadow-[inset_0_0_0_0.0625rem_var(--hair-strong)]",
                        )}
                      >
                        {dayFormat.format(date)}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            ) : null}

            {clock ? (
              <div className={cn(showsCalendar && "mt-3")}>{clock}</div>
            ) : null}

            <div className="mt-3 flex items-center gap-2">
              {showsCalendar ? (
              <Button
                type="button"
                variant="text"
                size="sm"
                onClick={() => {
                  const today = startOfDay(new Date());
                  setView(today);
                  moveFocus(today);
                }}
              >
                {todayLabel}
              </Button>
              ) : null}
              {selected ? (
                <Button
                  type="button"
                  variant="text"
                  size="sm"
                  onClick={() => {
                    commit(null);
                    setOpen(false);
                  }}
                >
                  {clearLabel}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  },
);

/**
 * The sortable spelling ruling 07 reserves for machine columns and exports.
 * ASCII digits and never `Intl`: this string is read by a server, not a
 * person.
 */
function machineValue(date: Date, mode: DatePickerMode): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  const time = `${p(date.getHours())}:${p(date.getMinutes())}`;
  if (mode === "time") return time;
  if (mode === "datetime") return `${day}T${time}`;
  return day;
}

/** Today, in the reader's own clock. Only ever called inside the open panel. */
function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

DatePicker.displayName = "DatePicker";

export { DatePicker, triggerVariants as datePickerTriggerVariants, dayVariants as datePickerDayVariants };
