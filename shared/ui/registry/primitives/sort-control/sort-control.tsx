"use client"

// SortControl — the user-facing "sort by" control for collections, built to sit
// on the SAME header row as search and the FilterBar (CollectionFrame places it).
// Two parts: a field picker + an asc/desc toggle. The picker is the `Choice`
// primitive in single-dropdown mode, so past SEARCHABLE_THRESHOLD options it
// searches itself for free — no second combobox implementation here.
//
// Three rules the shape encodes (each one is a bug someone shipped first):
//   • Per-option default direction — picking "Date added" applies its
//     `defaultDir` ("desc"), so you get newest-first, not oldest-first.
//   • A `directionless` option (best-match relevance) DISABLES the toggle
//     rather than silently ignoring it.
//   • Nothing selected → the toggle is disabled too (there's no axis to flip).

import * as React from "react"
import { ArrowDownZA, ArrowUpAZ } from "lucide-react"

import { SEARCHABLE_THRESHOLD, type SortOption } from "../../../lib/config"
import { cn } from "../../../lib/utils"
import { Button } from "../button/button"
import { Choice, defaultChoiceConfig } from "../choice/choice"

function SortControl({
  options,
  sortBy,
  sortDir,
  onChange,
  modal,
  className,
}: {
  options: SortOption[]
  /** The active field ("" = none chosen). */
  sortBy: string
  sortDir: "asc" | "desc"
  /** Fired with the next (field, direction). Picking a field applies that
   * option's `defaultDir`; the toggle flips only the direction. */
  onChange: (sortBy: string, sortDir: "asc" | "desc") => void
  /** See Choice's `modal` — needed when the control renders inside a Dialog. */
  modal?: boolean
  className?: string
}) {
  if (options.length === 0) return null

  const active = options.find((o) => o.value === sortBy)
  // No axis to flip: nothing chosen, or the field has no meaningful direction.
  const toggleDisabled = active == null || active.directionless === true

  const pick = (value: string) => {
    const next = options.find((o) => o.value === value)
    onChange(value, next?.defaultDir ?? "asc")
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Choice
        modal={modal}
        options={options.map((o) => ({ value: o.value, label: o.label }))}
        value={sortBy ? [sortBy] : []}
        onChange={(v) => v[0] && pick(v[0])}
        config={{
          ...defaultChoiceConfig,
          mode: "single",
          display: "dropdown",
          // A collection is always in SOME order — there's nothing to clear to.
          clearable: false,
          searchable: options.length > SEARCHABLE_THRESHOLD,
          placeholder: "Sort by",
          searchPlaceholder: "Search fields…",
        }}
        className="h-8 w-auto min-w-[8rem]"
      />
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="size-8 shrink-0"
        disabled={toggleDisabled}
        aria-label={
          toggleDisabled
            ? "Sort direction (unavailable for this field)"
            : sortDir === "asc"
              ? "Sorted ascending — switch to descending"
              : "Sorted descending — switch to ascending"
        }
        onClick={() => onChange(sortBy, sortDir === "asc" ? "desc" : "asc")}
      >
        {sortDir === "asc" ? <ArrowUpAZ /> : <ArrowDownZA />}
      </Button>
    </div>
  )
}

export { SortControl }
