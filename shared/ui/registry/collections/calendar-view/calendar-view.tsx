"use client"

// Calendar view — a month grid that drops your records onto their dates
// (think a content calendar or schedule). You pick which field holds the date
// and which holds the title; events can be colour-coded by a category field.

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { type BaseConfig, defaultBaseConfig } from "../../../lib/config"
import { cn } from "../../../lib/utils"
import { Button } from "../../primitives/button/button"
import { useIsVisible } from "../../primitives/visibility/visibility"

/* ------------------------------- config ------------------------------- */

export type WeekStart = "sunday" | "monday"

/** Every field is required on purpose — see ARCHITECTURE.md "Configuration". */
export interface CalendarViewConfig extends BaseConfig {
  /** Field holding an ISO date string, e.g. "2024-06-11". */
  dateField: string
  /** Field used as the event's label. */
  titleField: string
  /** Field whose value colour-codes the event ("" = one neutral colour). */
  accentField: string
  weekStartsOn: WeekStart
  /** How many events to show in a day before collapsing to "+N more". */
  maxPerDay: number
}

export const defaultCalendarViewConfig: CalendarViewConfig = {
  ...defaultBaseConfig,
  dateField: "date",
  titleField: "title",
  accentField: "",
  weekStartsOn: "sunday",
  maxPerDay: 3,
}

/* ------------------------------ component ------------------------------ */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]
const ACCENTS = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
]

// Stable index into the accent palette from any category string.
function accentIndex(v: string) {
  let h = 0
  for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) >>> 0
  return h % ACCENTS.length
}

// Local YYYY-MM-DD (matches the format expected in the data).
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`
}

export interface CalendarViewProps<T extends Record<string, unknown>> {
  data: T[]
  config: CalendarViewConfig
  /** Month to open on (defaults to the current month). */
  initialMonth?: Date
  className?: string
}

function CalendarView<T extends Record<string, unknown>>({
  data,
  config,
  initialMonth,
  className,
}: CalendarViewProps<T>) {
  const [cursor, setCursor] = React.useState(() => {
    const d = initialMonth ?? new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  // Resolved on the client only, so SSR and hydration agree (no mismatch).
  const [todayIso, setTodayIso] = React.useState("")
  React.useEffect(() => setTodayIso(iso(new Date())), [])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  const byDate = React.useMemo(() => {
    const map: Record<string, T[]> = {}
    for (const row of data) {
      const key = String(row[config.dateField] ?? "")
      ;(map[key] ||= []).push(row)
    }
    return map
  }, [data, config.dateField])

  const weekdays =
    config.weekStartsOn === "monday"
      ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  // First visible cell = the Sun/Mon on or before the 1st of the month.
  const firstWeekday = new Date(year, month, 1).getDay()
  const offset =
    config.weekStartsOn === "monday" ? (firstWeekday + 6) % 7 : firstWeekday
  const start = new Date(year, month, 1 - offset)
  const days = Array.from(
    { length: 42 },
    (_, i) =>
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
  )

  if (!useIsVisible(config)) return null

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">
          {MONTHS[month]} {year}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCursor(
                new Date(new Date().getFullYear(), new Date().getMonth(), 1)
              )
            }
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Previous month"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Next month"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {weekdays.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          const key = iso(d)
          const inMonth = d.getMonth() === month
          const isToday = key === todayIso
          const events = byDate[key] ?? []
          return (
            <div
              key={i}
              className={cn(
                "flex min-h-20 flex-col gap-1 rounded-lg border p-1.5 transition-colors hover:border-primary/40 hover:bg-accent/40",
                !inMonth && "opacity-40",
                isToday && "border-primary/50 bg-primary/5"
              )}
            >
              <div
                className={cn(
                  "text-right text-xs",
                  isToday && "font-semibold text-primary"
                )}
              >
                {d.getDate()}
              </div>
              <div className="flex flex-col gap-0.5">
                {events.slice(0, config.maxPerDay).map((ev, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1 rounded bg-accent px-1 py-0.5 text-xs"
                  >
                    {config.accentField !== "" && (
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          ACCENTS[
                            accentIndex(String(ev[config.accentField] ?? ""))
                          ]
                        )}
                      />
                    )}
                    <span className="truncate">
                      {String(ev[config.titleField] ?? "")}
                    </span>
                  </div>
                ))}
                {events.length > config.maxPerDay && (
                  <div className="px-1 text-xs text-muted-foreground">
                    +{events.length - config.maxPerDay} more
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export { CalendarView }
