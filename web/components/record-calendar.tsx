"use client"

// THE CALENDAR — one component, every calendar screen, and every record on it
// opens.
//
// WHY IT IS HERE AND NOT THE LIBRARY'S. The library's `CalendarView` draws a
// month grid on which nothing is clickable: an event is a plain `<div>`, the
// component exposes no `onSelect` / `onEventClick` of any kind, and "+6 more" is
// a second `<div>` naming records that no gesture can reach. So a task on the
// grid was a picture of a task, and the six hidden behind "+6 more" were a
// sentence about records with no way in. The library is lego and this repo does
// not edit it (UI-GAPS #22 carries the exact prop it should grow, so the owner
// can hand it over), so the grid is composed here from primitives the library
// DOES provide — the same reason `role-detail.tsx` and `paged-find.tsx` are
// host-composed.
//
// TWO WAYS TO READ ONE MONTH. The GRID is for a desktop, where a thousand pixels
// can hold a month at a glance. The AGENDA is that same month as a list, day by
// day, and it is what a PHONE opens on: a month grid at 375px is six rows of
// cells about three characters wide, which is not information. Both open records
// the same way and both show the same period, so flipping between them is a
// change of shape and never a change of subject.
//
// WHAT IT DELIBERATELY IS NOT. It is not a scheduler: nothing here drags, and no
// record moves by being dropped on a day. A calendar in this app is a way IN to
// records that already have a date; the date itself is changed on the record's
// own form, where it is validated at the door like every other field.

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
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, ListOrdered } from "@shared/ui/foundations/icons"

import { useIsPhone } from "@/lib/use-is-phone"
import { formatDate } from "@shared/web/format"
import { useT } from "@shared/web/language"

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
// chart-3 today.
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
function formatDayKey(key: string | null): string {
  if (!key) return ""
  const [y, m, d] = key.split("-").map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ""
  return formatDate(new Date(y, m - 1, d).toISOString())
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

const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  // 5 Jan 1970 was a Monday, so this is Mon…Sun with no magic numbers.
  new Date(1970, 0, 5 + i).toLocaleDateString(undefined, { weekday: "short" })
)

/* -------------------------------- the entry ------------------------------- */

/** ONE RECORD ON THE GRID, and the whole point of this file: a `<button>`, not a
 * `<div>`. Keyboard-reachable, named for a screen reader, and it opens the
 * record — which is what the library's version could not do at any price. */
function EntryChip({ entry, onOpen }: { entry: CalendarEntry; onOpen: (id: string) => void }) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={() => onOpen(entry.id)}
      title={entry.title}
      aria-label={t("Open {name}", { name: entry.title })}
      className="bg-accent hover:bg-muted motion-hover flex w-full items-center gap-1 rounded-pill px-1.5 py-0.5 text-left text-xs"
    >
      {entry.accent ? (
        <span aria-hidden className={`size-1.5 shrink-0 rounded-pill ${accentClass(entry.accent)}`} />
      ) : null}
      <span className="truncate">{entry.title}</span>
    </button>
  )
}

/** A day's records as a LIST — the shape the agenda is made of and the shape the
 * "+N more" dialog opens into. One renderer, so a record read on a phone and the
 * same record read out of a crowded square carry the same two lines. */
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
  unloaded,
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
  /** R14 — WHAT IS NOT LOADED. On a keyset-PAGED collection the rows in hand are
   *  the newest page, so a month starting before the oldest loaded record is not
   *  a month with nothing in it, it is a month nobody has read yet. A screen over
   *  a paged collection passes the sentence (and its Load more) here, and the
   *  calendar shows it exactly on the months that are lying. A BOUNDED collection
   *  passes nothing, because there is nothing beyond what is drawn. */
  unloaded?: React.ReactNode
  /** how many entries a square shows before it collapses to "+N more" */
  maxPerDay?: number
  /** WHICH MONTH IS ON SCREEN, told to the host as `YYYY-MM`, on mount and on
   * every move.
   *
   * The calendar owns the month — a person moves it with the arrows, and that is
   * the right place for it. But a screen over a PAGED collection cannot answer
   * for a month it was never given: the meetings list pages newest-first, so the rows in
   * hand are the furthest-out future and the month being drawn is usually not
   * among them. Without this, the grid renders whatever happened to be loaded and
   * calls the rest an empty month. So the calendar says what it is showing, and
   * the screen goes and gets it. */
  onMonthChange?: (month: string) => void
}) {
  const t = useT()
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

  // THE OLDEST RECORD WE HOLD. On a paged collection this is the horizon: before
  // it, an empty square means "not read yet" rather than "nothing happened".
  const oldestLoaded = React.useMemo(
    () => entries.reduce<string | null>((min, e) => (min === null || e.day < min ? e.day : min), null),
    [entries]
  )

  const mode: Mode = picked ?? (isPhone ? "agenda" : "month")
  const squares = monthSquares(month)
  const monthStart = dayKey(startOfMonth(month))
  const today = dayKey(new Date())
  // The month's own records, in day order — what the agenda lists, and what tells
  // an empty month from a full one.
  const inMonth = entries
    .filter((e) => e.day.slice(0, 7) === monthStart.slice(0, 7))
    .sort((a, b) => (a.day === b.day ? a.title.localeCompare(b.title) : a.day.localeCompare(b.day)))
  const agendaDays = [...new Set(inMonth.map((e) => e.day))]
  // R14 again: say it only where it is true. A month wholly inside the loaded
  // window is not hiding anything, and a sentence on every month would be noise
  // people learn to ignore — which is how a true one gets missed.
  const beyondHorizon = unloaded != null && oldestLoaded != null && monthStart < oldestLoaded

  const dayEntries = openDay ? (byDay.get(openDay) ?? []) : []

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
        <>
          <div className="text-muted-foreground grid grid-cols-7 gap-1 text-center text-xs">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {squares.map((d) => {
              const key = dayKey(d)
              const here = byDay.get(key) ?? []
              const hidden = here.length - maxPerDay
              return (
                <div
                  key={key}
                  className={[
                    // THROUGH THE TOKENS, not through two hexes (R32). The hover
                    // line was `#a8a59f`, a grey that exists in no palette here —
                    // C10 says there is ONE ink stepped by opacity and never a
                    // grey ramp, so it is the ink at 30%. Today's fill was
                    // `#ffe9b0`, which is `brand.accentHex.surface` written out
                    // by hand: the same soft mango `--secondary` already resolves
                    // to, so a rebrand now reaches the calendar like everything
                    // else. Mango is still never a border, which is the rule this
                    // square was drawn to obey.
                    "motion-hover flex min-h-20 flex-col gap-1 rounded-[var(--radius)] border p-1.5 hover:border-foreground/30 hover:bg-accent",
                    d.getMonth() === month.getMonth() ? "" : "opacity-40",
                    key === today ? "bg-secondary" : "",
                  ].join(" ")}
                >
                  <div
                    className={`text-right text-xs ${key === today ? "text-foreground font-medium" : ""}`}
                  >
                    {d.getDate()}
                  </div>
                  <div className="flex flex-col gap-1">
                    {here.slice(0, maxPerDay).map((e) => (
                      <EntryChip key={e.id} entry={e} onOpen={onOpen} />
                    ))}
                    {hidden > 0 && (
                      // "+6 more" USED TO BE DEAD TEXT — a line naming six records
                      // with no way to reach any of them, which is worse than not
                      // mentioning them. It is a button now, and it opens the day.
                      <Button
                        variant="link"
                        type="button"
                        onClick={() => setOpenDay(key)}
                        className="text-muted-foreground hover:text-foreground text-xs"
                      >
                        {t("+{n} more", { n: hidden })}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        // THE AGENDA — the same month, day by day, every row a way in. This is
        // what a calendar is FOR on a phone: what is on, in the order it happens,
        // with room for the second line the grid has to throw away.
        <div className="flex flex-col gap-4">
          {agendaDays.length === 0 ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <CalendarRange aria-hidden className="size-4 shrink-0" />
              {emptyText}
            </p>
          ) : (
            agendaDays.map((day) => (
              <section key={day} className="flex flex-col gap-2">
                <h3
                  className={`text-micro uppercase ${
                    day === today ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {formatDayKey(day)}
                  {day === today ? ` · ${t("Today")}` : ""}
                </h3>
                <DayRows entries={byDay.get(day) ?? []} onOpen={onOpen} />
              </section>
            ))
          )}
        </div>
      )}

      {beyondHorizon && <div className="flex flex-col gap-2">{unloaded}</div>}

      {/* THE DAY, opened from "+N more". Everything on that day, not just the
          overflow: a person who clicked "+6 more" on a square showing three is
          looking for one of nine, and showing six of them would be a second way
          to hide records. */}
      <Dialog open={openDay !== null} onOpenChange={(next) => !next && setOpenDay(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{formatDayKey(openDay)}</DialogTitle>
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
