"use client"

// THE DATE SLIDER — the map, on any day it changed.
//
// ITS STOPS ARE THE DAYS SOMETHING HAPPENED, not a continuous range. A slider
// over every date between the audit and today would spend most of its travel on
// days nothing changed, and a person dragging it would learn nothing between
// stops. Every position on this one is a real state of the client's business.
//
// SO THE STOPS ARE DRAWN. That is the difference between a scrubber and a bar
// you drag: a mark under the track for every day this map changed, the audit
// date marked apart from the rest, and the one you are on filled. Without them
// the control cannot say how many states there are or where you are among them,
// which is most of what somebody wants from it before they touch it.
//
// THE AUDIT DATE IS ALWAYS A STOP, even when no step changed on it, because it
// is the day every figure is measured FROM. Landing on it shows the "before"
// the whole savings figure subtracts — which is what makes the number checkable
// rather than asserted.
//
// The kit's `Slider` carries the interaction: its own track, fill and thumb, and
// Radix's keyboard and screen-reader behaviour underneath. This file draws the
// stops and nothing else.

import * as React from "react"

import { Badge } from "@shared/ui/controls/badge/badge"
import { Button } from "@shared/ui/controls/button/button"
import { Slider } from "@shared/ui/controls/slider/slider"
import { useT } from "@shared/web/language"

export function ProcessDateSlider({
  dates,
  auditDate,
  value,
  onChange,
}: {
  /** every day this map changed, oldest first, with the audit date among them */
  dates: string[]
  auditDate: string
  /** the day being shown, or null for today's live map */
  value: string | null
  onChange: (day: string | null) => void
}) {
  const t = useT()
  // TODAY IS THE LAST STOP AND IT IS NOT A DATE. Parking on "now" reads the live
  // rows rather than the history, which is one fewer query and — more
  // importantly — is the only position that stays correct as the day passes.
  const stops = React.useMemo(() => [...dates, null], [dates])
  const index = value === null ? stops.length - 1 : Math.max(0, dates.indexOf(value))

  if (dates.length < 2)
    return (
      <p className="text-muted-foreground text-sm">
        {t("This map has only ever said one thing. There is nothing to slide through yet.")}
      </p>
    )

  const shown = stops[index]
  const last = stops.length - 1

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {shown === null ? t("As it is today") : `${t("As it was on")} ${shown}`}
          </span>
          {shown === auditDate && <Badge variant="secondary">{t("the audit date")}</Badge>}
        </div>
        {shown !== null && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            {t("Back to today")}
          </Button>
        )}
      </div>

      <div className="px-1">
        <Slider
          min={0}
          max={last}
          step={1}
          value={[index]}
          thumbLabels={[t("Which day to show this map as it was on")]}
          onValueChange={([i]) => onChange(stops[i] ?? null)}
        />

        {/* THE STOPS. Positioned by share of the travel so they sit under the
            thumb at every width, and inset by the thumb's own half-width so the
            first and last marks line up with its two extremes rather than with
            the track's. */}
        <div className="relative mt-2 h-3" aria-hidden>
          {stops.map((stop, i) => (
            <span
              key={stop ?? "today"}
              style={{ left: `calc(${(i / last) * 100}% )` }}
              className={`absolute top-0 -translate-x-1/2 rounded-pill ${
                stop === auditDate ? "bg-primary h-3 w-[3px]" : "bg-border h-2 w-px"
              } ${i === index ? "bg-foreground" : ""}`}
            />
          ))}
        </div>

        <div className="text-muted-foreground flex justify-between text-xs">
          <span>{dates[0]}</span>
          <span>{t("today")}</span>
        </div>
      </div>
    </div>
  )
}
