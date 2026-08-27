"use client"

// FilterBar — the user-facing filter row for collections. Renders each
// `FilterFacet` as a dropdown (control:"select"), a searchable combobox, a set
// of removable chips (control:"chips"), or a numeric range — plus a single
// "Clear all" when anything is active. The chosen value is reported via
// onChange; the collection turns it into an `is` Rule (see lib/collection
// selectRows). Keyboard-operable, aria-labelled per facet, with a polite live
// count. Wraps — it never widens its parent.
//
// The two richer controls live beside this file (range-facet, searchable-facet)
// so each stays readable on its own.

import * as React from "react"
import { X } from "@shared/ui/foundations/icons"
import { Filter } from "@shared/ui/foundations/icons"

import { facetOptions } from "./collection"
import { SEARCHABLE_THRESHOLD, type FilterFacet } from "./config"
import { cn } from "@shared/ui/lib/utils"
import { useT } from "@shared/web/language"
import { Badge } from "@shared/ui/components/badge/badge"
import { Button } from "@shared/ui/components/button/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/components/select/select"
import { RangeFacet } from "./range-facet"
import { SearchableFacet } from "./searchable-facet"

function FilterBar<T>({
  facets,
  values,
  data,
  onChange,
  onClearAll,
  canClear,
  resultCount,
  modal,
  className,
}: {
  facets: FilterFacet[]
  /** Current selection per facet field ({} = none). */
  values: Record<string, string>
  /** The FULL data — distinct values are derived from it when a facet omits
   * `options` (so choices don't vanish as you filter). */
  data: T[]
  /** Empty `value` clears that facet. */
  onChange: (field: string, value: string) => void
  onClearAll: () => void
  /** Show the "Clear all" control (true when any facet OR the search is active). */
  canClear: boolean
  /** Announced politely to screen readers when results change. */
  resultCount?: number
  /** Set `true` when the bar can render inside a Dialog/Sheet. Facet popovers
   *  are portaled out of the dialog, so the dialog's scroll lock would kill
   *  wheel/touch scrolling in an open facet list. See popover.tsx. */
  modal?: boolean
  className?: string
}) {
  // Hook before the early return so hook order stays stable.
  const t = useT()
  if (facets.length === 0 && !canClear) return null

  const optionsFor = (f: FilterFacet) =>
    f.options ?? facetOptions(data, f.field)

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Filter className="size-4 shrink-0 text-muted-foreground" aria-hidden />

      {facets.map((f) => {
        const val = values[f.field] ?? ""

        // control: "range" → a numeric min/max control. Its value is "min..max",
        // compiled to inclusive gte/lte rules by selectRows. Handled before the
        // option list is derived — a range facet has no options to scan for.
        if (f.control === "range") {
          return (
            <RangeFacet
              key={f.field}
              facet={f}
              value={val}
              onChange={(v) => onChange(f.field, v)}
              modal={modal}
            />
          )
        }

        const opts = optionsFor(f)

        if (f.control === "chips") {
          return (
            <div
              key={f.field}
              role="group"
              aria-label={f.label}
              className="flex flex-wrap items-center gap-1.5"
            >
              {opts.map((o) => {
                const selected = val === o.value
                return (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${f.label}: ${o.label}`}
                    onClick={() => onChange(f.field, selected ? "" : o.value)}
                    // The ring follows the control's own radius (tokens.css §8),
                    // and the control here is a PILL — the Badge inside it. At
                    // `--radius` the outline rang a 24-corner box around a 26
                    // pill. The element stays a bare <button>: a kit Button
                    // would put a second fill and a second height around a chip
                    // that already draws both.
                    className="rounded-pill"
                  >
                    <Badge
                      variant={selected ? "default" : "secondary"}
                      className="cursor-pointer gap-1"
                    >
                      {o.label}
                      {selected && <X className="size-3" aria-hidden />}
                    </Badge>
                  </button>
                )
              })}
            </div>
          )
        }

        // control: "select" → a combobox when it searches itself, else the plain
        // dropdown. `searchable` is OPT-OUT past SEARCHABLE_THRESHOLD options:
        // a host can't accidentally ship an unsearchable 200-item dropdown, and
        // small facets stay plain (a search box over 3 options is noise). The
        // triggers are near-identical either way — only the popover adapts.
        const searchable = f.searchable ?? opts.length > SEARCHABLE_THRESHOLD
        if (searchable) {
          return (
            <SearchableFacet
              key={f.field}
              facet={f}
              value={val}
              options={opts}
              onChange={(v) => onChange(f.field, v)}
              modal={modal}
            />
          )
        }

        // control: "select" — a plain dropdown. Radix Select has no "clear", so
        // an active one gets its own ✕ beside it: clearing ONE facet shouldn't
        // mean "Clear all" and rebuilding the rest of the selection.
        return (
          <div key={f.field} className="flex items-center gap-1">
            {/* Two separate things were wrong here. `val || undefined` handed
                Radix `undefined`, which switches the Select to UNCONTROLLED;
                and even controlled with "", Radix's SelectValue caches the
                chosen item's text node, so clearing does NOT restore the
                placeholder — the trigger kept reading "Active" after the facet
                was cleared (this bit "Clear all" too, not just the per-facet
                ✕). Remounting on the set↔empty transition is the reliable
                reset: the key changes only on that transition, not per pick.
                NB jsdom does not reproduce this — verify in a real browser. */}
            <Select
              key={val === "" ? "empty" : "set"}
              value={val}
              onValueChange={(v) => onChange(f.field, v)}
            >
              <SelectTrigger
                aria-label={f.label}
                className="h-8 w-auto max-w-[14rem] min-w-[8rem] gap-1"
              >
                <SelectValue placeholder={f.label} />
              </SelectTrigger>
              <SelectContent>
                {opts.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {val !== "" && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Clear ${f.label}`}
                onClick={() => onChange(f.field, "")}
                // 32, not the kit's standing 40: `--control-height-dense` is
                // the height the SelectTrigger beside it already is. Same
                // control, same token, in all three facet files.
                className="size-[var(--control-height-dense)] shrink-0"
              >
                <X aria-hidden />
              </Button>
            )}
          </div>
        )
      })}

      {canClear && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClearAll}
          // `ghost` IS this treatment — tertiary ink that goes to full ink on
          // hover, no fill — and `sm` is the same 32 the facets beside it are.
          // The radius comes with the control: the hand-rolled one rang at
          // `--radius` around a 32-tall box, which is not the shape it is.
          className="shrink-0"
        >
          <X aria-hidden /> {t("Clear all")}
        </Button>
      )}

      <span aria-live="polite" className="sr-only">
        {resultCount != null ? `${resultCount} results` : ""}
      </span>
    </div>
  )
}

export { FilterBar }
