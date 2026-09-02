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
// list), not triggers.
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
// ── THE POPOVER IS GONE — CLIENT RULING, 2026-09-02 ──────────────────────────
//
// Until tonight the "+ filter"/count slot opened a floating, portaled Popover
// holding every facet's own control, stacked one per line. The client, against
// a confirmed mockup: the slot now toggles a SECOND ROW open directly under the
// WHOLE toolbar, inside the same card/track — not a popover, not an overlay,
// an actual sibling line that pushes the rows below it down. Nothing about the
// facet controls THEMSELVES changed to do this: every facet was already
// rendered by mapping `facets` once, in one place (`RangeFacet`/
// `SearchableFacet`, below), so the panel already showed every facet's own
// field at once — a per-facet SEARCH box included, for `SearchableFacet`'s own
// query field (Waves' own comment: "an agency with 131 clients on staging
// needs" its facet's own search). Moving that map from a `<PopoverContent>` to
// a plain `<div>` changes NONE of that; only the toggle's mechanics and the
// row's position changed. And nothing here inserts an "Apply" step: a pick
// already called `onChange`/`pick` directly (see below), which is what the
// client asked to keep — "the moment I select sth on a dropdown its applied."
//
// THE ROW MUST SPAN THE WHOLE TOOLBAR, SO THIS COMPONENT'S ROOT IS A FRAGMENT.
// The chip cluster ("Filter"/count chip + active chips + "Clear filters") has
// to keep sitting INLINE beside search/sort — exactly where it sits today —
// while the open facet row has to span the FULL toolbar pill, including the
// width search and sort occupy. Those are two different widths, so they cannot
// be one child of the same non-growing wrapper the way the chip cluster alone
// used to be: `ToolbarRow`/`PagedFind`/`WaveFinder` all wrap the chip cluster
// in a `flex min-w-0 flex-wrap items-center gap-2` box precisely so that box's
// own `w-full` (CSS Sizing §5.3: a percentage on an indeterminate box resolves
// as `auto`) means "as wide as its content" rather than "the whole row" — the
// the same technique those three files' own comments already document for
// `SearchInput`/`FilterBar` inside `ToolbarRow`. Trapping the open row inside
// that SAME box would cap it at the chip cluster's own width, not the
// toolbar's. So this component returns the chip cluster and the open row as
// TWO SEPARATE TOP-LEVEL ELEMENTS, and the three hosts render `{filters}` bare
// (no wrapping box of their own any more) — each element then lands as its own
// direct flex item of the REAL outer toolbar pill, and the open row's own
// `w-full` finally means what it says, forcing `flex-wrap` to break it onto a
// fresh line spanning the whole pill. See `ToolbarRow`, `PagedFind` and
// `WaveFinder`'s own comments at their `filters` slot for the other half.
//
// ONE COMPOSITION CANNOT TAKE THIS SHAPE: the vendored kit's OWN
// `CollectionFrame` (`shared/ui/components/collection-frame/collection-frame.tsx`,
// R39 — hand-edits turn the build red) wraps whatever it is handed as `filters`
// in exactly that same non-growing box, and that markup is the kit's, not
// ours, so it cannot be changed here. Every screen reached through THAT panel
// (`useKitPanel`, e.g. Member roles, Members, an account's own Apps/Sprints
// tabs) still gets everything else this lane changed — no popover, an
// immediate apply, the count on the trigger — the open row simply renders at
// the width the kit's own toolbar allows a facet cluster rather than the
// full-bleed second line the three bespoke toolbars can offer. A kit change to
// let its `filters` slot opt out of that wrapper is the upstream fix, logged
// for the design-kit pipeline; nothing here fakes it with a hack that would
// only work by accident.
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
import { cn } from "@shared/ui/lib/utils"
import { useT } from "@shared/web/language"

import { facetOptions } from "./collection"
import { type FacetOption, type FilterFacet } from "./config"
import { formatRange, parseRange } from "./range"

/** BUG FIX, 2026-08-31 — client: pill hover must move the pill's own FILL,
 * never just its text. The kit's `FilterBar` (vendored, `shared/ui/
 * components/filter-bar/filter-bar.tsx`, CLAUDE.md R39, do not hand-edit)
 * draws two chip-shaped buttons whose hover is text-only: the "+ filter"/count
 * slot (`CHIP_ADD`: `text-ink-tertiary enabled:hover:text-foreground`, no
 * background rule at all) and "Clear filters" (reuses
 * `filterChipVariants({state:"default"})`'s `bg-[var(--surface-raised)]`
 * plus that same text-only hover). The removable chip's own label button
 * already gets this right (`CHIP_LABEL_INTERACTIVE`: `enabled:hover:bg-
 * accent`) — these two just never picked up the same treatment.
 *
 * App-side override, not a kit edit — the exact `[&_[data-slot=X]]:` pattern
 * `web/components/auth-card.tsx` documents: reached from outside via the
 * kit's own stable `data-slot="filter-bar-add"` / `"filter-bar-clear"`
 * hooks, on this adapter's own wrapping `<div>`, so a design-sync re-pull
 * never has to notice this exists. A fill, never a border: the app's hover
 * law is a fill swap, and neither button's resting border (the add slot's
 * dashed one) is touched.
 *
 * TWO DIFFERENT TOKENS, NOT ONE — measured, not assumed. `--accent`
 * (`CHIP_LABEL_INTERACTIVE`'s own neutral hover, a `rgba(…, .05)` wash) is
 * right for the "+ filter" slot: its resting fill is `bg-transparent`, so
 * the wash tints the OPAQUE surface behind it (the page) and reads as a real
 * highlight. "Clear filters" is not transparent at rest — it reuses
 * `filterChipVariants({state:"default"})`'s OPAQUE `bg-[var(--surface-
 * raised)]` (`--card`) — so `bg-accent` would REPLACE that opaque fill with
 * the 5% wash rather than tint it, composite against whatever sits behind
 * the chip instead, and (measured against the dark palette's page tone) come
 * out DARKER than resting, i.e. the chip dimming on hover rather than
 * lighting up. `--btn-secondary-hover` is `Button`'s own OPAQUE hover token
 * for THE SAME resting fill (`--btn-secondary-fill` is also `--card`) — the
 * exact pairing this chip's own base state already borrows, so its hover
 * state borrows the matching one rather than reaching for the wash. Filed
 * upstream as a kit gap either way. */
const FILTER_BAR_HOVER_FILL =
  "[&_[data-slot=filter-bar-add]]:hover:bg-accent " +
  "[&_[data-slot=filter-bar-clear]]:hover:bg-[var(--btn-secondary-hover)]"

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
  className,
}: {
  facets: FilterFacet[]
  /** Current selection per facet field ({} = none). */
  values: Record<string, string>
  /** The FULL data — distinct values are derived from it when a facet omits
   * `options` (so choices don't vanish as you filter). */
  data: T[]
  /** Empty `value` clears that facet. Called the moment a value is picked —
   * there is no "Apply" step, on the row exactly as there was none on the
   * popover it replaces. */
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
  /** Applied to the chip cluster's own wrapping box — NOT to the open facet
   * row, which has to reach the toolbar's full width regardless of what a
   * caller passes here. No call site uses this today. */
  className?: string
}) {
  const t = useT()
  /** Is the second row open? Replaces the old Popover's own `open` state —
   * same idea (a facet's controls are hidden until asked for), a plain toggle
   * instead of a floating, portaled surface. */
  const [open, setOpen] = React.useState(false)
  /** WHAT A PICKED VALUE IS CALLED, remembered from the moment it was picked.
   * A facet over ROWS takes its options from what the screen is holding, so an
   * app archived — or a client that drops out of the loaded page — while its
   * filter is on would leave the chip naming a raw id at somebody. The words
   * are captured where they are known and never go stale, because the value
   * they belong to cannot change under them. */
  const said = React.useRef<Record<string, string>>({})
  /** THE OPEN ROW ITSELF — focus lands on its first control the moment it
   * appears, since (unlike the popover it replaces) nothing here traps focus
   * or needs to hand it back: the "Filter" chip never unmounts, so leaving the
   * row open or closed never moves focus anywhere the reader didn't ask for. */
  const panel = React.useRef<HTMLDivElement>(null)
  const wasOpen = React.useRef(false)
  React.useEffect(() => {
    if (open && !wasOpen.current) {
      panel.current?.querySelector<HTMLElement>("input, button")?.focus()
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
      // Re-open the row this chip belongs to, if it is not open already —
      // every facet lives in the one row, so opening the row IS re-opening it.
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

  // THE "FILTER" CHIP'S OWN LABEL. The bare word while the row is open (it is
  // its own explanation once the fields are in front of you), and the bare
  // word while nothing is on — a count only earns its place once BOTH "there
  // is something to report" and "the row that would show it is shut" are
  // true. `chips.length` is the SAME source `KitFilterBar` already reads to
  // decide whether "Clear filters" is worth drawing at all (`hasChips` in the
  // kit's own file) — reusing it here rather than a second tally is the
  // point: there is exactly one definition of "how many facets are active" in
  // this row, not one per control that cares.
  const addFilterLabel =
    !open && chips.length > 0 ? t("Filter ({count})", { count: chips.length }) : t("Filter")

  return (
    <>
      <div className={cn("flex min-w-0 flex-wrap items-center gap-2", FILTER_BAR_HOVER_FILL, className)}>
        <KitFilterBar
          label={t("Filters")}
          filters={chips}
          onRemove={(field) => onChange(field, "")}
          onClear={onClearFacets}
          clearLabel={t("Clear filters")}
          addFilterLabel={addFilterLabel}
          onAddFilter={() => setOpen((o) => !o)}
        />
      </div>

      {/* THE SECOND ROW — every facet, all at once, directly under the whole
          toolbar (see the header for why this has to be a sibling of the chip
          cluster above rather than something nested inside it). `flex-wrap`
          so several facets read as a shelf on a wide screen and stack cleanly
          on a narrow one; each facet is individually sized rather than left to
          the kit's own `w-full` default (`SearchableFacet`'s root), which
          would otherwise claim this whole row for the first facet alone. */}
      {open && (
        // NO `role="group"`/`aria-label` OF ITS OWN — the chip cluster above
        // already carries `role="group" aria-label="Filters"` (the kit's own
        // `KitFilterBar` root), and each facet inside here names ITSELF
        // (`RangeFacet`/`SearchableFacet`'s own `role="group"
        // aria-labelledby=…`). A second "Filters, group" landmark wrapping
        // both would tell a screen reader the same thing twice for no reason;
        // this div is layout only.
        <div
          ref={panel}
          data-slot="filter-bar-row"
          className="flex w-full basis-full flex-wrap items-start gap-4 pt-1"
        >
          {facets.map((f) => {
            const val = values[f.field] ?? ""

            // A numeric min/max. Either bound may be open; "" clears it.
            if (f.control === "range") {
              const { min, max } = parseRange(val)
              return (
                <div key={f.field} className="min-w-[12rem]">
                  <RangeFacet
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
                </div>
              )
            }

            return (
              <div key={f.field} className="min-w-[12rem] max-w-xs flex-1">
                <SearchableFacet
                  label={f.label}
                  options={optionsFor(f)}
                  value={val ? [val] : []}
                  onValueChange={(next) => pick(f, next)}
                  searchLabel={t("Search {what}…", { what: f.label.toLowerCase() })}
                  emptyLabel={t("No matches.")}
                  // Six rows fits comfortably beside its siblings on the row
                  // rather than the popover's own taller ceiling — a facet
                  // that needs more room still SEARCHES rather than scrolling
                  // a long, cramped list (Waves' own "131 clients" case).
                  maxHeight="12rem"
                />
              </div>
            )
          })}
        </div>
      )}

      <span aria-live="polite" className="sr-only">
        {resultCount != null ? t("{count} results", { count: resultCount }) : ""}
      </span>
    </>
  )
}

export { FilterBar }
