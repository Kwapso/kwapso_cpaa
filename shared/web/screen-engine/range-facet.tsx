"use client"

// RangeFacet — the `control:"range"` filter facet. Split out of filter-bar.tsx
// so each facet control is one readable file; FilterBar itself is now just the
// row that chooses between them.

import * as React from "react"
import { ChevronsUpDown, X } from "@shared/ui/icons"

import { type FilterFacet } from "./config"
import { formatRange, parseRange } from "./range"
import { cn } from "@shared/ui/lib/utils"
import { useT } from "@shared/web/language"
import { Button } from "@shared/ui/controls/button/button"
import { Input } from "@shared/ui/controls/input/input"
import { Popover, PopoverContent, PopoverTrigger } from "@shared/ui/controls/popover/popover"
import { Slider } from "@shared/ui/controls/slider/slider"

/** A `control:"range"` facet: a compact trigger + a min/max editor in a popover.
 * With BOTH `min` and `max` bounds it's a two-thumb Slider; otherwise two number
 * inputs (so an unbounded field still works). Reports "min..max" through the
 * SAME onChange every other facet uses — empty clears it. */
function RangeFacet({
  facet,
  value,
  onChange,
  modal,
}: {
  facet: FilterFacet
  value: string
  onChange: (value: string) => void
  /** See FilterBar's `modal` — needed when the bar renders inside a Dialog. */
  modal?: boolean
}) {
  const t = useT()
  const { label, min: lo, max: hi, step = 1 } = facet
  const [open, setOpen] = React.useState(false)
  const { min, max } = parseRange(value)
  const bounded = lo != null && hi != null

  // Raw text mirrors, so a half-typed "-" or "1" isn't clobbered mid-keystroke.
  // Re-synced from `value` each time the popover opens (which also picks up an
  // outside "Clear all"), and the inputs own the text while it's open.
  const [rawMin, setRawMin] = React.useState("")
  const [rawMax, setRawMax] = React.useState("")
  React.useEffect(() => {
    if (!open) return
    const p = parseRange(value)
    setRawMin(p.min == null ? "" : String(p.min))
    setRawMax(p.max == null ? "" : String(p.max))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toNum = (raw: string) => {
    const t = raw.trim()
    if (t === "") return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }

  const summary =
    min != null && max != null
      ? `${min} – ${max}`
      : min != null
        ? `≥ ${min}`
        : max != null
          ? `≤ ${max}`
          : label

  // The clear ✕ is a SIBLING of the trigger, never a child of it. Button's base
  // class carries `[&_svg]:pointer-events-none`, so an <X> nested inside the
  // trigger is invisible to hit-testing: the click lands on the Button, Radix
  // opens the popover, and the X's own onClick never runs (its
  // preventDefault/stopPropagation was dead code). A real sibling <button> also
  // gives the control a focus stop and a keyboard path, which the SVG never had.
  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen} modal={modal}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            aria-label={label}
            className="h-8 w-auto max-w-[14rem] min-w-[8rem] justify-between gap-1 font-normal"
          >
            <span
              className={cn(
                "truncate",
                value === "" && "text-muted-foreground"
              )}
            >
              {summary}
            </span>
            <ChevronsUpDown
              className="size-3.5 shrink-0 opacity-50"
              aria-hidden
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(16rem,calc(100vw-2rem))] p-3"
        >
          {bounded ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium">{label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {min ?? lo} – {max ?? hi}
                </span>
              </div>
              <Slider
                aria-label={label}
                min={lo}
                max={hi}
                step={step}
                value={[min ?? lo, max ?? hi]}
                onValueChange={([a, b]) => onChange(formatRange(a, b))}
              />
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <label className="flex-1 text-xs text-muted-foreground">
                {t("Min")}
                <Input
                  type="number"
                  inputMode="numeric"
                  min={lo}
                  max={hi}
                  step={step}
                  value={rawMin}
                  aria-label={`${label} minimum`}
                  onChange={(e) => {
                    setRawMin(e.target.value)
                    onChange(formatRange(toNum(e.target.value), toNum(rawMax)))
                  }}
                  className="mt-1 h-8"
                />
              </label>
              <label className="flex-1 text-xs text-muted-foreground">
                {t("Max")}
                <Input
                  type="number"
                  inputMode="numeric"
                  min={lo}
                  max={hi}
                  step={step}
                  value={rawMax}
                  aria-label={`${label} maximum`}
                  onChange={(e) => {
                    setRawMax(e.target.value)
                    onChange(formatRange(toNum(rawMin), toNum(e.target.value)))
                  }}
                  className="mt-1 h-8"
                />
              </label>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {value !== "" && (
        <button
          type="button"
          aria-label={`Clear ${label}`}
          onClick={() => onChange("")}
          className="shrink-0 rounded-pill p-0.5 text-muted-foreground motion-hover hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}

export { RangeFacet }
