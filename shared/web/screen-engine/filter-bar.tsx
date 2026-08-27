"use client"

// FilterBar — the app's binding to the DESIGN KIT's own filter row.
//
// ── WHY THIS IS A REWRITE AND NOT A RESKIN ───────────────────────────────────
//
// Until now this file drew a filter row of its OWN: a wrapping strip of compact
// dropdown triggers, one per facet, each opening a popover, with a "Clear all"
// on the end. The kit ships
// `shared/ui/components/filter-bar/filter-bar.tsx` — `FilterBar`,
// `SearchableFacet` and `RangeFacet`, the SAME THREE NAMES — and nothing in
// `web/`, `web-portal/` or `shared/web/` imported a line of it. So every other
// control in this app converges with the designer's build by construction, and
// this one could not, because we were not drawing her component at all. This
// file is now an ADAPTER: it decides nothing about how a filter LOOKS, and the
// three files that used to (`filter-bar` + `range-facet` + `searchable-facet`,
// 618 lines) are one file of wiring.
//
// ── HER SHAPE, WHICH IS NOT THE ONE THIS ROW HAD ─────────────────────────────
//
// The kit's bar is two things stacked: a row of FACET CONTROLS, and under it a
// row of CHIPS — one per facet currently on, each removable, with a dashed
// "+ filter" slot at the end and a "Clear filters" after that. Her facet
// controls are always-EXPANDED panels (a heading, a search pill, a checkbox
// list), not triggers; that is right in a panel and wrong in a toolbar, where
// three of them would put 300px of chrome above every collection in the app,
// permanently. So the composition is the one her props are cut for: the CHIPS
// are the permanent surface, and the "+ filter" slot opens the facet controls
// in a kit Popover. What is on is always visible and always removable in one
// press; what is not on costs one line of the screen.
//
// THE CHIPS ARE NOT MANGO, and that is the ruling this lane exists to carry.
// The old row drew a selected facet as `Badge variant="default"` — measured
// rgb(254,208,105), the brand fill. Her file says three separate times that a
// selected facet is not a brand fill (kit RULES.md §2.5: mango is a brand fill,
// never a status, never a hover, never a data colour), and draws the chip as
// raised paper with primary ink, elevation doing the work. Her treatment wins.
// Nothing in this file passes a colour at all, which is the only way to keep
// that true.
//
// ── WHAT THE APP'S FACET CONTRACT IS, MEASURED RATHER THAN ASSUMED ───────────
//
// Every facet in either front door is `control: "select"`, single-valued, with
// options either declared (a closed door vocabulary — `web/lib/collection-
// filters.ts`) or derived from the loaded rows (`facetOptions`). Nothing sets
// `control: "chips"`, nothing sets `control: "range"`, and nothing sets
// `onSearch`. The async option-provider, its debounce, its request-id race
// guard and the whole chips branch were three code paths no screen reached, so
// they are gone rather than ported. `control: "range"` STAYS, because
// `selectRows` compiles it and the kit draws it; `control: "chips"` does not,
// because in the kit's vocabulary a chip is an ACTIVE FILTER and keeping a
// second meaning of the word in the same row is the drift this lane ends.
//
// ── SINGLE-SELECT, AND WHY IT IS NOT A THEMING DECISION ──────────────────────
//
// Her `SearchableFacet` is MULTI-select (`value: string[]`). The doors take one
// value per query parameter and validate it positionally (R20); a comma list
// would be a change to six doors, their filter parity on the machine surface
// (R19) and their tests. So the array is bound to at most one entry — picking a
// second word replaces the first, picking the one that is on clears it — and
// the day a door learns a list, this adapter is the one place that changes.

import * as React from "react"

import {
  FilterBar as KitFilterBar,
  RangeFacet,
  SearchableFacet,
  type FilterChip,
} from "@shared/ui/components/filter-bar/filter-bar"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@shared/ui/components/popover/popover"
import { cn } from "@shared/ui/lib/utils"
import { useT } from "@shared/web/language"

import { facetOptions } from "./collection"
import { type FacetOption, type FilterFacet } from "./config"
import { formatRange, parseRange } from "./range"

/** What a `control:"range"` facet's chip says. Symbols rather than words, so a
 * bound reads the same in every language and never has to be a sentence. */
function rangeSaid(value: string): string {
  const { min, max } = parseRange(value)
  if (min != null && max != null) return `${min} – ${max}`
  if (min != null) return `≥ ${min}`
  if (max != null) return `≤ ${max}`
  return ""
}

function FilterBar<T>({
  facets,
  values,
  data,
  onChange,
  onClearFacets,
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
  /** Drop every facet at once. NOT the search box: the kit's control says
   * "Clear filters" and now means exactly that. What somebody typed is cleared
   * by the search field's own ✕ (`SearchInput onClear`), which is the kit's
   * answer to the same question one control along — and it is why this prop was
   * renamed from `onClearAll`, which had been clearing something it did not
   * name. */
  onClearFacets: () => void
  /** Announced politely to screen readers when results change. */
  resultCount?: number
  /** Set `true` when the bar can render inside a Dialog/Sheet. The facet panel
   *  is portaled out of the dialog, so the dialog's scroll lock would otherwise
   *  kill wheel/touch scrolling inside an open facet list. See popover.tsx. */
  modal?: boolean
  className?: string
}) {
  // Hooks before the early return so hook order stays stable.
  const t = useT()
  const [open, setOpen] = React.useState(false)
  /** WHAT A PICKED VALUE IS CALLED, remembered from the moment it was picked.
   * A facet over ROWS takes its options from what the screen is holding, so an
   * app archived — or a client that drops out of the loaded page — while its
   * filter is on would leave the chip naming a raw id at somebody. The words
   * are captured where they are known and never go stale, because the value
   * they belong to cannot change under them. */
  const said = React.useRef<Record<string, string>>({})
  /** WHERE FOCUS GOES BACK TO — the node that opened the panel, remembered by
   * hand. Radix hands focus back to a TRIGGER, and the trigger here is the
   * kit's own "+ filter" chip, inside markup we do not write. A browser that
   * does not focus a button on click (Safari) simply restores nothing, which is
   * what it does today. */
  const opener = React.useRef<HTMLElement | null>(null)
  const panel = React.useRef<HTMLDivElement>(null)
  const wasOpen = React.useRef(false)
  /** A dismissal that came from a click SOMEWHERE ELSE. Focus is not dragged
   * back from wherever the person just chose to put it — they clicked the
   * search box because they want to type in it. */
  const leftIt = React.useRef(false)

  /** FOCUS IS PLACED FROM THE OPEN STATE, IN BOTH DIRECTIONS, AND THE REASON IS
   * A MEASUREMENT RATHER THAN A PREFERENCE.
   *
   * Radix moves focus into an anchored surface from FocusScope's MOUNT effect
   * and back out from its UNMOUNT effect. In this app a closed popover NEVER
   * UNMOUNTS: measured 2026-08-27, the node stays in the document at
   * `data-state="closed"` long after its 140ms exit animation has finished, and
   * the kit's own `SortControl` — which this lane did not touch — leaves the
   * same residue on the same page, so it is the primitive's and not this
   * composition's. Logged for the kit.
   *
   * Both halves therefore fire exactly ONCE, on the first open, and never
   * again. The first half was easy to miss and the second half was worse than
   * that: a check that focus came back to the "+ filter" chip PASSED while the
   * panel was not taking focus at all, because focus had never left the chip to
   * be restored to it. Two broken halves reading as one working whole.
   *
   * The consequence lands hardest here, which is why the mitigation is here:
   * every facet lives behind this one panel, so on a second open a keyboard
   * reader would be left standing on the chip with every control portaled to
   * the end of the document. Opening and closing are a state change this file
   * owns, so the focus is placed from it — and it stays correct if the kit is
   * fixed, because Radix's own handlers refuse to move focus when there is no
   * trigger to move it to. */
  React.useEffect(() => {
    if (open) {
      panel.current?.querySelector<HTMLElement>("input, button")?.focus()
    } else if (wasOpen.current) {
      if (!leftIt.current) opener.current?.focus()
      leftIt.current = false
    }
    wasOpen.current = open
  }, [open])

  if (facets.length === 0) return null

  const optionsFor = (f: FilterFacet): FacetOption[] =>
    f.options ?? facetOptions(data, f.field)

  const chips: FilterChip[] = []
  for (const f of facets) {
    const val = values[f.field] ?? ""
    if (val === "") continue
    const key = `${f.field}:${val}`
    const words =
      f.control === "range"
        ? rangeSaid(val)
        : (optionsFor(f).find((o) => o.value === val)?.label ??
          said.current[key] ??
          val)
    chips.push({
      id: f.field,
      // WRAPPED, and this is the trap the kit's skin sets. The chip's label
      // half is `inline-flex`, so a bare string child becomes an anonymous flex
      // item and `text-overflow: ellipsis` silently stops working — the text
      // still clips, at the identical pixel, with no "…" to say it did. These
      // facets carry account and client names, which are exactly the strings
      // long enough to reach it. A real element with its own measure survives.
      label: <span className="block max-w-[14rem] truncate">{`${f.label} · ${words}`}</span>,
      // The kit joins its own remove label off a STRING label; ours is a node,
      // so the whole sentence is given rather than left to fall back to the
      // generic "Remove filter" for every chip on the row.
      removeLabel: t("Remove filter: {what}", { what: `${f.label}: ${words}` }),
      // "Re-open the facet this chip stands for" — every facet lives in the one
      // panel, so re-opening the panel IS that.
      onSelect: () => setOpen(true),
    })
  }

  const pick = (f: FilterFacet, next: string[]) => {
    // See the header: the array carries at most one entry. Picking a second
    // word replaces the first; picking the one that is on clears the facet.
    const current = values[f.field] ?? ""
    const chosen = next.find((v) => v !== current) ?? ""
    if (chosen !== "")
      said.current[`${f.field}:${chosen}`] =
        optionsFor(f).find((o) => o.value === chosen)?.label ?? chosen
    onChange(f.field, chosen)
  }

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen} modal={modal}>
        <PopoverAnchor asChild>
          <KitFilterBar
            label={t("Filters")}
            filters={chips}
            onRemove={(field) => onChange(field, "")}
            onClear={onClearFacets}
            clearLabel={t("Clear filters")}
            addFilterLabel={t("Filter")}
            onAddFilter={() => {
              opener.current = document.activeElement as HTMLElement | null
              setOpen((o) => !o)
            }}
          />
        </PopoverAnchor>
        <PopoverContent
          ref={panel}
          align="start"
          onInteractOutside={() => {
            leftIt.current = true
          }}
          // ONE COLUMN at every width, because the kit's panel already caps
          // itself against the viewport (popover.tsx). Facets side by side
          // would need a breakpoint here and a second measure on a phone; a
          // column needs neither and reads the same on both.
          //
          // AND A CEILING OF ITS OWN, measured rather than guessed: four facets
          // at the kit's own list height is an 834px panel, which does not fit
          // a 900px window — Radix flips it above the anchor, fails to fit it
          // there either, and the panel opens with its top off the screen. How
          // much of a screen a filter panel may take is the COMPOSITION's
          // decision (the primitive only knows the viewport), so it is made
          // here, in the viewport's own units, and the surface's `overflow-y`
          // does the rest.
          className="flex max-h-[min(70vh,32rem)] w-[20rem] flex-col gap-[var(--space-5)]"
        >
          {facets.map((f) => {
            const val = values[f.field] ?? ""

            // A numeric min/max. Either bound may be open; "" clears it.
            if (f.control === "range") {
              const { min, max } = parseRange(val)
              return (
                <RangeFacet
                  key={f.field}
                  label={f.label}
                  minLabel={t("Min")}
                  maxLabel={t("Max")}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={{ min, max }}
                  onValueChange={(next) => onChange(f.field, formatRange(next.min, next.max))}
                  // A bound BELOW its own floor is a range that can only ever
                  // match nothing, and the kit already draws the state — the
                  // old row had no way to say it and quietly answered "none".
                  error={min != null && max != null && min > max}
                  errorLabel={t("The first number must be lower than the second.")}
                />
              )
            }

            return (
              <SearchableFacet
                key={f.field}
                label={f.label}
                options={optionsFor(f)}
                value={val ? [val] : []}
                onValueChange={(next) => pick(f, next)}
                searchLabel={t("Search {what}…", { what: f.label.toLowerCase() })}
                emptyLabel={t("No matches.")}
              />
            )
          })}
        </PopoverContent>
      </Popover>

      <span aria-live="polite" className="sr-only">
        {resultCount != null ? t("{count} results", { count: resultCount }) : ""}
      </span>
    </div>
  )
}

export { FilterBar }
