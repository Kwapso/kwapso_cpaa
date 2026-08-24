"use client"

// THE DATE SLIDER — the map, on any day it changed.
//
// ITS STOPS ARE THE DAYS SOMETHING HAPPENED, not a continuous range. A slider
// over every date between the audit and today would spend most of its travel on
// days nothing changed, and a person dragging it would learn nothing between
// stops. Every position on this one is a real state of the client's business.
//
// THE AUDIT DATE IS ALWAYS A STOP, even when no step changed on it, because it
// is the day every figure is measured FROM. Landing on it shows the "before" the
// whole savings figure subtracts — which is what makes the number checkable
// rather than asserted.
//
// It is a native range input on purpose. It is keyboard-operable, it is
// announced by a screen reader, and the alternative is re-implementing all of
// that around a div.

import * as React from "react"

import { Badge } from "@shared/ui/controls/badge/badge"
import { Button } from "@shared/ui/controls/button/button"
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
      <input
        type="range"
        min={0}
        max={stops.length - 1}
        step={1}
        value={index}
        aria-label={t("Which day to show this map as it was on")}
        onChange={(e) => {
          const i = Number(e.target.value)
          onChange(stops[i] ?? null)
        }}
        className="accent-primary w-full"
      />
      <div className="text-muted-foreground flex justify-between text-xs">
        <span>{dates[0]}</span>
        <span>{t("today")}</span>
      </div>
    </div>
  )
}
