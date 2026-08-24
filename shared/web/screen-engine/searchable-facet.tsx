"use client"

// SearchableFacet — the `control:"select"` facet rendered as a searchable
// combobox (client-filtered, or async via `onSearch`). Split out of
// filter-bar.tsx; see RangeFacet for the sibling control.

import * as React from "react"
import { Check, ChevronsUpDown, X } from "@shared/ui/icons"

import { type FacetOption, type FilterFacet } from "./config"
import { cn } from "@shared/ui/lib/utils"
import { useT } from "@shared/web/language"
import { Button } from "@shared/ui/controls/button/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@shared/ui/controls/command/command"
import { Popover, PopoverContent, PopoverTrigger } from "@shared/ui/controls/popover/popover"
import { useDebouncedCallback } from "@shared/ui/controls/use-debounce/use-debounce"

/** A `control:"select"` facet rendered as a searchable combobox. Shows `options`
 * up front; when `onSearch` is set it fires (debounced) as the user types and the
 * resolved rows REPLACE the list — so a facet with thousands of values never
 * loads them all. Without `onSearch` it's a plain client-side filtered combobox. */
function SearchableFacet({
  facet,
  value,
  options,
  onChange,
  modal,
}: {
  facet: FilterFacet
  value: string
  /** Options shown before the user types (facet.options or data-derived). */
  options: FacetOption[]
  onChange: (value: string) => void
  /** See FilterBar's `modal` — needed when the bar renders inside a Dialog. */
  modal?: boolean
}) {
  const t = useT()
  const { field, label, onSearch } = facet
  const [open, setOpen] = React.useState(false)
  // null = "no async results yet" → show `options`. onSearch replaces this.
  const [results, setResults] = React.useState<FacetOption[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const reqId = React.useRef(0)

  // Debounced async search (via the shared debounce). A request counter guards
  // against an earlier (slower) response clobbering a newer one.
  const runSearch = useDebouncedCallback((raw: string) => {
    if (!onSearch) return
    const id = ++reqId.current
    Promise.resolve(onSearch(field, raw))
      .then((rows) => {
        if (id === reqId.current) {
          setResults(rows)
          setLoading(false)
        }
      })
      .catch(() => {
        if (id === reqId.current) {
          setResults([])
          setLoading(false)
        }
      })
  }, 200)

  // On each keystroke: mirror immediately, then debounce the fetch. Empty query
  // reverts to `options` and invalidates any in-flight response.
  // (The kit's Command owns the query TEXT itself now; this component only
  // reacts to it, so there is no mirrored state to keep.)
  const onQueryChange = (next: string) => {
    if (!onSearch) return
    const q = next.trim()
    if (q === "") {
      reqId.current++
      setResults(null)
      setLoading(false)
      return
    }
    setLoading(true)
    runSearch(q)
  }

  // Remember labels we've seen so the trigger can name a picked value even after
  // it drops out of the visible (async) list.
  const [labels, setLabels] = React.useState<Record<string, string>>({})
  const shown = onSearch ? (results ?? options) : options
  React.useEffect(() => {
    if (shown.length === 0) return
    setLabels((prev) => {
      let changed = false
      const next = { ...prev }
      for (const o of shown)
        if (next[o.value] !== o.label) {
          next[o.value] = o.label
          changed = true
        }
      return changed ? next : prev
    })
  }, [shown])

  // With onSearch the server already filtered — cmdk must not filter again.
  const shouldFilter = !onSearch
  const triggerLabel = value ? (labels[value] ?? value) : label

  const pick = (v: string) => {
    onChange(v === value ? "" : v)
    setOpen(false)
  }

  return (
    // Clear ✕ is a SIBLING, not a child of the trigger — see RangeFacet above:
    // Button's `[&_svg]:pointer-events-none` makes a nested <X> unclickable, so
    // the click fell through to the trigger and merely opened the popover.
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen} modal={modal}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            role="combobox"
            aria-expanded={open}
            aria-label={label}
            className="h-8 w-auto max-w-[14rem] min-w-[8rem] justify-between gap-1 font-normal"
          >
            <span className={cn("truncate", !value && "text-muted-foreground")}>
              {triggerLabel}
            </span>
            <ChevronsUpDown
              className="size-3.5 shrink-0 opacity-50"
              aria-hidden
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(16rem,calc(100vw-2rem))] p-0"
        >
          <Command filter={shouldFilter ? undefined : () => true}>
            <CommandInput
              onInput={(e: React.FormEvent<HTMLInputElement>) => onQueryChange(e.currentTarget.value)}
              placeholder={t("Search {what}…", { what: label.toLowerCase() })}
            />
            <CommandList>
              {loading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  {t("Searching…")}
                </div>
              ) : (
                <CommandEmpty>{t("No matches.")}</CommandEmpty>
              )}
              <CommandGroup>
                {shown.map((o) => {
                  const selected = value === o.value
                  return (
                    <CommandItem
                      // cmdk matches on `value`; use the label for client-side
                      // filtering, the raw value when the server already filtered.
                      key={o.value}
                      value={onSearch ? o.value : o.label}
                      onSelect={() => pick(o.value)}
                    >
                      <Check
                        className={cn(
                          "size-4 shrink-0",
                          selected ? "opacity-100" : "opacity-0"
                        )}
                        aria-hidden
                      />
                      <span className="flex-1 truncate">{o.label}</span>
                      {o.count != null && (
                        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                          {o.count}
                        </span>
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value !== "" && (
        <button
          type="button"
          aria-label={`Clear ${label}`}
          onClick={() => onChange("")}
          className="shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}

export { SearchableFacet }
