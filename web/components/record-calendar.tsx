"use client"

// THE CALENDAR — one component, every calendar screen, and every record on it
// opens.
//
// REBUILT ON THE KIT (30 Aug 2026). UI-GAPS #22's blocker — the library's
// `CalendarView` took no click prop of any kind, so a record on the grid was a
// picture of a record — was fixed upstream in kit v1.2.9: `CalendarViewProps`
// now carries `onSelectDay` / `onSelectEvent` / `onSelectItem`. This file is
// now composed from `CalendarView` (the month grid) and `Agenda` (the day-by-day
// list, itself a thin wrapper over `CalendarView`'s own `agenda` view) rather
// than hand-rolling both — the same reason `role-detail.tsx` reaches for the
// kit's parts instead of drawing its own.
//
// WHY A CELL IS NEVER A BUTTON. The kit makes a day cell a real `<button>` when
// `onSelectDay` is given, wrapping its event chips — and a chip becomes its OWN
// `<button>` when `onSelectEvent` is given, which would nest a button inside a
// button. So this file never sets `onSelectDay`: only entries are clickable,
// exactly as before, and the overflow ("+N more") is composed as one more
// `CalendarEvent` per day rather than a second, unclickable line the kit draws
// on its own — the same "+6 more must open something" reasoning UI-GAPS #22
// raised in the first place.
//
// TWO WAYS TO READ ONE MONTH, unchanged. The GRID is for a desktop, where a
// thousand pixels can hold a month at a glance. The AGENDA is that same month
// as a list, day by day, and it is what a PHONE opens on: a month grid at
// 375px is six rows of cells about three characters wide, which is not
// information. Both open records the same way and both show the same period,
// so flipping between them is a change of shape and never a change of subject.
//
// WHAT IT DELIBERATELY IS NOT. It is not a scheduler: nothing here drags, and
// no record moves by being dropped on a day. A calendar in this app is a way
// IN to records that already have a date; the date itself is changed on the
// record's own form, where it is validated at the door like every other field.

import * as React from "react"

import { Button } from "@shared/ui/components/button/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/components/dialog/dialog"
import { List } from "@shared/web/list-compat"
import { ToggleGroup, ToggleGroupItem } from "@shared/ui/components/toggle-group/toggle-group"
import { CalendarView, type CalendarDay, type CalendarEvent } from "@shared/ui/components/calendar-view/calendar-view"
import { Agenda, type AgendaDay } from "@shared/ui/components/agenda/agenda"
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, ListOrdered } from "@shared/ui/foundations/icons"

import { useIsPhone } from "@/lib/use-is-phone"
import { formatDate } from "@shared/web/format"
import { useLanguage } from "@shared/web/language"
import type { Language, Vars } from "@shared/i18n"

/* ------------------------------- what it takes ---------------------------- */

/** ONE RECORD, on a calendar. The screens map their own rows to this, which is
 * why three collections that share no columns share one calendar. */
export type CalendarEntry = {
  /** the record's id — what `onOpen` is handed, so its detail screen can open */
  id: string
  /** the day it sits on, as `YYYY-MM-DD` (lexical order is chronological order) */
  day: string
  /** what the entry says — the record's own name */
  title: string
  /** the value the colour is derived from ("" = one neutral colour) */
  accent?: string
  /** the second line the agenda and the day view read. A grid cell has no room
   *  for it; a list has, and it is the difference between "Standup" and
   *  "09:30 · Standup · Northwind". */
  detail?: string
}

type Mode = "month" | "agenda"

/* --------------------------------- colour --------------------------------- */

// The five chart accents, and the stable hash into them. Copied in shape from
// the library's own calendar (`accentIndex`) rather than imported, because the
// library exports the component and not the helper — so the grid keeps exactly
// the colours it shipped with, and a department that was chart-3 yesterday is
// chart-3 today. The kit's own chip `tone`/`dot` are a small fixed enum
// (status words, not an arbitrary hash), which cannot carry "one colour per
// department" — so the dot is drawn into the chip's own `label` node instead,
// the one slot the kit hands the caller whole.
const ACCENTS = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"]

function accentClass(value: string): string {
  let h = 0
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0
  return ACCENTS[h % ACCENTS.length]
}

/* ---------------------------------- days ---------------------------------- */

/** Local `YYYY-MM-DD` — the same shape the screens slice their date columns to,
 * so a square and a record can never disagree about which day it is. Built from
 * the local parts rather than `toISOString()`, which would be UTC: for anybody
 * east of Greenwich that is the difference between a meeting on Monday and the
 * same meeting on Sunday. */
function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

/** A day key as the sentence a person reads, through the ONE shared formatter.
 *
 * The three lines in the middle are the reason this is a function: the language
 * itself parses a bare `"2026-08-07"` as UTC midnight, which renders as 6 August
 * for everybody west of Greenwich. So the key is read as LOCAL parts first, and
 * a key that is not three numbers renders nothing rather than throwing. */
function formatDayKey(key: string | null, lang: Language): string {
  if (!key) return ""
  const [y, m, d] = key.split("-").map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ""
  return formatDate(new Date(y, m - 1, d).toISOString(), lang)
}

/** The 42 squares a month grid draws: the Monday on or before the 1st, then six
 * weeks. Monday because all three screens already asked the library for
 * `weekStartsOn: "monday"` — one behaviour, not a setting nobody would change. */
function monthSquares(month: Date): Date[] {
  const first = startOfMonth(month)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset)
  return Array.from(
    { length: 42 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
  )
}

/** The month's name and the weekday headings in the READER'S own locale, the way
 * `shared/web/format.ts` already writes every other date in this app. The
 * library's calendar hard-codes twelve English month names; this one does not,
 * so a person reading the app in German reads a German month. */
function monthLabel(month: Date): string {
  return month.toLocaleDateString(undefined, { month: "long", year: "numeric" })
}

// Monday first, matching `monthSquares`. The kit's own `quietColumns` default
// ([5, 6], the last two) is exactly right for this order — Saturday and Sunday.
const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  // 5 Jan 1970 was a Monday, so this is Mon…Sun with no magic numbers.
  new Date(1970, 0, 5 + i).toLocaleDateString(undefined, { weekday: "short" })
)

/* ------------------------------ the overflow ------------------------------- */

// The sentinel id for the "+N more" chip this file adds to a day's own events.
// Unique only WITHIN one day's array (it is a React key there, and the
// argument `onSelectEvent` is handed back), never across the grid.
const OVERFLOW_ID = "__overflow__"

/** One day's events, capped at `maxPerDay`, with the hidden count folded into
 * one more `CalendarEvent` rather than left as the kit's own dead more-line
 * (`formatMoreEvents` only changes the WORDS; the kit draws no click for it).
 * So the overflow is a real chip too, and `onSelectEvent` tells it apart from a
 * record by its id. */
function buildDayEvents(
  entries: CalendarEntry[],
  maxPerDay: number,
  t: (english: string, vars?: Vars) => string
): CalendarEvent[] {
  const shown = entries.slice(0, maxPerDay)
  const hidden = entries.length - shown.length
  const events: CalendarEvent[] = shown.map((e) => ({
    id: e.id,
    title: e.title,
    tone: "quiet",
    label: (
      <span className="flex min-w-0 items-center gap-1">
        {e.accent ? (
          <span aria-hidden className={`size-1.5 shrink-0 rounded-pill ${accentClass(e.accent)}`} />
        ) : null}
        <span className="min-w-0 truncate">{e.title}</span>
      </span>
    ),
  }))
  if (hidden > 0) {
    events.push({ id: OVERFLOW_ID, tone: "quiet", label: t("+{n} more", { n: hidden }) })
  }
  return events
}

/** A day's records as a LIST — the shape the "+N more" dialog opens into. */
function DayRows({
  entries,
  onOpen,
}: {
  entries: CalendarEntry[]
  onOpen: (id: string) => void
}) {
  return (
    <List
      surface="none"
      items={entries.map((e) => ({
        id: e.id,
        // `block` on purpose: the list wraps its leading slot in a plain div, so
        // an inline span would take no width or height at all and the colour
        // would simply not be there. (It was not, for one screenshot.)
        leading: e.accent ? (
          <span
            aria-hidden
            className={`mt-1.5 block size-2.5 shrink-0 rounded-pill ${accentClass(e.accent)}`}
          />
        ) : undefined,
        title: e.title,
        subtitle: e.detail,
      }))}
      onItemClick={(item) => onOpen(item.id)}
    />
  )
}

/* ------------------------------- the calendar ------------------------------ */

export function RecordCalendar({
  entries,
  onOpen,
  emptyText,
  maxPerDay = 3,
  onMonthChange,
}: {
  /** every record with a date, in any order — the grid buckets them itself */
  entries: CalendarEntry[]
  /** open the record. The screens hand this straight to the engine's `open`
   *  intent, so a calendar reaches exactly the detail screen its list does. */
  onOpen: (id: string) => void
  /** what an empty month says, in the screen's own noun */
  emptyText: string
  /** how many entries a square shows before it collapses to "+N more" */
  maxPerDay?: number
  /** WHICH MONTH IS ON SCREEN, told to the host as `YYYY-MM`, on mount and on
   * every move.
   *
   * The calendar owns the month — a person moves it with the arrows, and that is
   * the right place for it. But a screen over a collection that answers "what's
   * in this month" one month at a time (meetings-screen.tsx's own `monthQ`)
   * cannot answer for a month it was never given, so the calendar says what it
   * is showing and the screen goes and gets it. Without this the grid would
   * render whatever happened to already be in hand and call the rest an empty
   * month — R14's failure mode, not this file's to reintroduce. */
  onMonthChange?: (month: string) => void
}) {
  const { t, lang } = useLanguage()
  const isPhone = useIsPhone()
  // WHAT A PHONE OPENS ON. `null` means "nobody has chosen", so the answer keeps
  // following the device — rotate a phone into landscape and the grid arrives.
  // The moment somebody picks, their pick wins and stops moving under them.
  const [picked, setPicked] = React.useState<Mode | null>(null)
  const [month, setMonth] = React.useState(() => startOfMonth(new Date()))
  // Told on mount as well as on every move: the first month a person sees is a
  // month somebody has to fetch, and it is the one they see most often.
  const monthTag = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`
  React.useEffect(() => {
    onMonthChange?.(monthTag)
  }, [monthTag, onMonthChange])
  // Which day the "+N more" control opened, or null. One piece of state: the
  // dialog IS the overflow, so there is no second way to be looking at a day.
  const [openDay, setOpenDay] = React.useState<string | null>(null)

  const byDay = React.useMemo(() => {
    const map = new Map<string, CalendarEntry[]>()
    for (const e of entries) {
      const list = map.get(e.day)
      if (list) list.push(e)
      else map.set(e.day, [e])
    }
    return map
  }, [entries])

  const mode: Mode = picked ?? (isPhone ? "agenda" : "month")
  const squares = monthSquares(month)
  const monthStart = dayKey(startOfMonth(month))
  const today = dayKey(new Date())
  // The month's own records, in day order — what the agenda lists, and what tells
  // an empty month from a full one.
  const inMonth = entries
    .filter((e) => e.day.slice(0, 7) === monthStart.slice(0, 7))
    .sort((a, b) => (a.day === b.day ? a.title.localeCompare(b.title) : a.day.localeCompare(b.day)))
  const agendaDayKeys = [...new Set(inMonth.map((e) => e.day))]

  const dayEntries = openDay ? (byDay.get(openDay) ?? []) : []

  // THE GRID'S OWN CELLS. Never `onSelectDay` — see the file header on nested
  // buttons — so a cell stays a plain `<div>` and only its chips (and the
  // overflow chip) are real buttons.
  const calendarDays: CalendarDay[] = squares.map((d) => {
    const key = dayKey(d)
    return {
      key,
      label: d.getDate(),
      dateTime: key,
      events: buildDayEvents(byDay.get(key) ?? [], maxPerDay, t),
      outside: d.getMonth() !== month.getMonth(),
      today: key === today,
    }
  })

  // THE AGENDA'S OWN DAYS — the same records, grouped and ordered exactly as
  // the grid buckets them, handed to the kit's `Agenda` rather than drawn here.
  const agendaKitDays: AgendaDay[] = agendaDayKeys.map((day) => ({
    key: day,
    label: `${formatDayKey(day, lang)}${day === today ? ` · ${t("Today")}` : ""}`,
    items: (byDay.get(day) ?? []).map((e) => ({
      id: e.id,
      title: (
        <span className="flex min-w-0 items-center gap-1.5">
          {e.accent ? (
            <span aria-hidden className={`size-2 shrink-0 rounded-pill ${accentClass(e.accent)}`} />
          ) : null}
          <span className="min-w-0 truncate">{e.title}</span>
        </span>
      ),
      who: e.detail,
    })),
  }))

  const emptyState = (
    <p className="text-muted-foreground flex items-center gap-2 text-sm">
      <CalendarRange aria-hidden className="size-4 shrink-0" />
      {emptyText}
    </p>
  )

  return (
    <div className="flex w-full flex-col gap-4">
      {/* THE PERIOD, AND THE SHAPE — one row: which month, then how to read it.
          The switch is the library's own segmented control rather than two
          buttons whose variant flips, which is the shape R3 refuses. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">{monthLabel(month)}</div>
        {/* IT WRAPS, AND THE GROUP IS PUSHED WITH `ml-auto` — the house rule for
            every action row in this app (UI-CONVENTIONS C4), which this one was
            not following. Five controls whose widths are TEXT and therefore
            change with the reader's language: the segmented control and the
            three buttons come to about 307px in English, against roughly 309
            inside the page's own padding and the collection card's at 375px. So
            "Next month" was one or two pixels from the edge in English and off
            it in German, where "Agenda" is "Tagesordnung" — and there is no
            scrollable ancestor here, so off the edge means gone.
            `ml-auto` rather than `justify-end` on this row, for the reason C4
            gives: `justify-end` alone pushes the overflow off the LEFT edge,
            where the container hides it instead of showing it. */}
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(v) => v && setPicked(v as Mode)}
            aria-label={t("How to read this month")}
          >
            <ToggleGroupItem value="month" aria-label={t("Month")} className="gap-1 px-2.5">
              <CalendarDays className="size-3.5" />
              <span className="text-xs">{t("Month")}</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="agenda" aria-label={t("Agenda")} className="gap-1 px-2.5">
              <ListOrdered className="size-3.5" />
              <span className="text-xs">{t("Agenda")}</span>
            </ToggleGroupItem>
          </ToggleGroup>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="secondary" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
              {t("Today")}
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="size-8"
              aria-label={t("Previous month")}
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="size-8"
              aria-label={t("Next month")}
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>

      {mode === "month" ? (
        <CalendarView
          view="month"
          weekdayLabels={WEEKDAYS}
          days={calendarDays}
          maxEvents={maxPerDay + 1}
          onSelectEvent={(event, day) => {
            if (event.id === OVERFLOW_ID) setOpenDay(day.key)
            else onOpen(event.id)
          }}
          emptyState={emptyState}
          label={t("Calendar")}
        />
      ) : (
        // THE AGENDA — the same month, day by day, every row a way in. This is
        // what a calendar is FOR on a phone: what is on, in the order it happens.
        <Agenda
          days={agendaKitDays}
          onItemSelect={(item) => onOpen(item.id)}
          emptyState={emptyState}
          label={t("Agenda")}
        />
      )}

      {/* THE DAY, opened from "+N more". Everything on that day, not just the
          overflow: a person who clicked "+6 more" on a square showing three is
          looking for one of nine, and showing six of them would be a second way
          to hide records. */}
      <Dialog open={openDay !== null} onOpenChange={(next) => !next && setOpenDay(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{formatDayKey(openDay, lang)}</DialogTitle>
          </DialogHeader>
          <DayRows
            entries={dayEntries}
            onOpen={(id) => {
              setOpenDay(null)
              onOpen(id)
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
