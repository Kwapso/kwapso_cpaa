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
// "+ filter" slot at the end and a "Clear filters" after that. The CHIP half is
// hers entirely (`KitFilterBar`, below); which control draws a FACET is settled
// further down, under "a facet is a compact field".
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
// an actual sibling line. Nothing about the facet controls THEMSELVES changed
// to do this: every facet was already rendered by mapping `facets` once, in
// one place (`RangeFacet`/`SelectFacet`, below), so the panel already showed
// every facet's own field at once. Moving that map from a `<PopoverContent>`
// to a plain `<div>` changed only the toggle's mechanics. And nothing here
// inserts an "Apply" step: a pick calls `onChange` directly (see `pick`
// below), which is what the client asked to keep — "the moment I select sth
// on a dropdown its applied", and, the same day, "remember we dont want apply
// buton". CLEARING is one control and it is the kit's own "Clear filters",
// drawn beside the chips by `KitFilterBar`; this file adds no second one,
// because a facet with nothing on it has nothing to clear and two controls
// for one act is the shape the app's own one-mango rule refuses.
//
// THE PANEL IS `position: absolute`, NOT A NORMAL-FLOW SIBLING — SECOND PASS,
// SAME DAY. The first cut made the panel a genuine flex sibling of the chip
// cluster, both landing as direct children of the toolbar's own pill (this
// component's root was a `<>` fragment for exactly that). It solved WIDTH —
// the panel's `w-full` finally meant the whole pill once nothing capped it —
// and broke HEIGHT: the panel was tall (several facets deep, each an expanded
// list of checkbox rows), `flex-wrap` folded it onto a second line INSIDE the
// pill's own box, and a `rounded-pill` box that tall draws a stadium wide
// enough to read as a giant oval. Caught live on a screenshot, the client's
// own words "what is this shit". A pill's radius is only ever right for a
// SHORT box; keeping the panel out of normal flow entirely —
// `position: absolute` — is what stops its height from ever reaching the
// pill's own box model, no matter how many facets a future screen adds. The
// facets are compact fields now (below), which makes the panel short — that
// is a reason the oval is unlikely, never a reason it is impossible, so the
// geometry stays the guarantee and the compactness stays a separate,
// presentational decision. `ToolbarRow`, `PagedFind`, `WaveFinder` and the
// engine's own `CollectionFrame` each mark the box that hosts this bar
// `relative`, so the panel's `top-full`/`inset-x-0` (see `filter-bar-row`'s
// own className below) has something to measure against; see each of their
// comments at the `filters` slot for that other half. The trade this makes,
// deliberately: an open panel now floats ABOVE whatever is below it rather
// than pushing it down. Nothing here re-flows a page's own scroll position or
// row count while the panel is open, which the earlier flex-sibling shape
// could not promise either.
//
// ONE COMPOSITION CANNOT MARK ITS OWN ANCHOR: the vendored kit's OWN
// `CollectionFrame` (`shared/ui/components/collection-frame/collection-frame.tsx`,
// R39 — hand-edits turn the build red) wraps whatever it is handed as `filters`
// in `<div className="flex min-w-0 flex-wrap items-center gap-2">`, with no
// `relative` of its own, and that markup is the kit's, not ours. So the app
// wraps its OWN node in a `relative` box before handing it over
// (`collection-frame.tsx`'s `useKitPanel` branch), which anchors the panel to
// the filters slot rather than to the whole toolbar — a narrower containing
// block, which is why the panel below also carries a `min-w-*`: an anchor
// narrower than the panel's own content must not squeeze it. Marking that
// wrapper `relative` in the kit itself is the upstream fix, logged for the
// design-kit pipeline; nothing here fakes it with a hack that would only work
// by accident.
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
// ── A FACET IS A COMPACT FIELD, NOT AN EXPANDED LIST — CLIENT RULING,
// 2026-09-02, AGAINST HER OWN CONFIRMED ARTIFACT ─────────────────────────────
//
// `control: "select"` was drawn by the kit's `SearchableFacet`, which is an
// always-expanded panel: a heading, a search pill, then every option as a
// checkbox row. Two facets of it is a full screen of controls hanging under a
// toolbar, and it is what the client's screenshot caught — a "Search client…"
// box over a scrolling list of every client, where her artifact draws one
// short labelled field reading "Any client". The declared control said
// `select` all along; nothing was drawing one. So it does now: the kit's own
// `Select` (`@shared/ui/components/select/select`), in the same
// `role="group"` + caption-label frame the kit's own `RangeFacet` puts round
// its number pair, so the two facet kinds read as one family. Not a
// hand-rolled trigger — a hand-rolled look-alike under a kit name is the
// exact failure `web/test/filter-row-is-the-kits.test.tsx` exists to catch,
// and it would be no less a failure for looking right.
//
// WHAT THAT COSTS, SAID PLAINLY: `SearchableFacet` typed to narrow a long
// option list, and a `Select` does not. Waves' own note ("an agency with 131
// clients on staging") is the case that pays for it. A Radix select still
// scrolls and still takes type-ahead, so a long list is reachable rather than
// searchable, and the search BOX on the toolbar beside it is untouched. If
// that turns out to be too little, the answer is a compact TRIGGER over a
// searchable list — one control in the kit, not a second expanded panel here.
// Filed for the design-kit pipeline with the `relative` gap above.
//
// ── SINGLE-SELECT, AND WHY IT IS NOT A THEMING DECISION ──────────────────────
//
// The doors take one value per query parameter and validate it positionally
// (R20); a comma list would be a change to six doors, their filter parity on
// the machine surface (R19) and their tests. A `Select` is single-valued by
// construction, so the adapter no longer has to bind a multi-select array down
// to one entry the way it did while `SearchableFacet` drew this — and the day
// a door learns a list, this adapter is still the one place that changes.
// Clearing one facet is `ANY_VALUE` below, because Radix refuses an empty
// string as an item value; the door still receives "".

import * as React from "react"

import {
  FilterBar as KitFilterBar,
  RangeFacet,
  type FilterChip,
} from "@shared/ui/components/filter-bar/filter-bar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/components/select/select"
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

/** "NOTHING PICKED", as a value a Radix item may carry. `""` is what every
 * caller and every door means by "this facet is off", and it is the one string
 * `SelectPrimitive.Item` refuses — Radix reserves the empty string for the
 * placeholder state, and an item declaring it throws. So the row that turns a
 * facet back off carries this sentinel, converted at both edges below, and the
 * value that leaves this file is still `""`. Two underscores either side so it
 * cannot collide with a door's own vocabulary (`active`, `meeting`, `all`…) or
 * with a ULID. */
const ANY_VALUE = "__any__"

/** ONE FACET AS THE ARTIFACT DRAWS IT: a caption label over one compact field
 * reading "Any client" until something is picked.
 *
 * The frame is the kit's own `RangeFacet` frame, matched deliberately rather
 * than invented — `role="group"` + `aria-labelledby` on a `flex flex-col
 * gap-2` column, with the label at the caption step in secondary ink — so the
 * two facet kinds in this panel read as one family and a screen reader names
 * them the same way. The kit's `FacetLabel` that draws it is private to
 * `filter-bar.tsx`, so the two classes are repeated here; the CONTROL, which
 * is the part that could drift, is the kit's `Select` untouched.
 *
 * `aria-labelledby` rather than an `aria-label`: the group's own heading is
 * already on screen, and pointing the trigger at it is what stops a reader
 * hearing "Client" twice. */
function SelectFacet({
  label,
  anyLabel,
  options,
  value,
  onPick,
}: {
  label: string
  /** What the field says while the facet is off — "Any client". */
  anyLabel: string
  options: FacetOption[]
  /** `""` = off. */
  value: string
  /** `""` clears the facet. Called the moment a row is picked: there is no
   * Apply step here or anywhere else in this file (client ruling, see the
   * header). */
  onPick: (next: string) => void
}) {
  const id = React.useId()
  const labelId = `${id}-label`
  return (
    <div role="group" aria-labelledby={labelId} className="flex min-w-0 flex-col gap-2">
      <span id={labelId} className="text-caption text-ink-secondary">
        {label}
      </span>
      <Select
        value={value === "" ? ANY_VALUE : value}
        onValueChange={(next) => onPick(next === ANY_VALUE ? "" : next)}
      >
        {/* The dense control height, which is the height the kit's own facet
            fields take (`facetFieldVariants`: `--control-height-dense`) — a
            select trigger's own default is the taller form-field height, and
            a filter panel is not a form. */}
        <SelectTrigger aria-labelledby={labelId} className="h-[var(--control-height-dense)]">
          <SelectValue placeholder={anyLabel} />
        </SelectTrigger>
        <SelectContent>
          {/* TURNING THE FACET OFF IS A ROW, not a separate ✕. It reads the
              same as the resting placeholder on purpose: "Any client" is the
              state, so picking it is the reader saying that state out loud. */}
          <SelectItem value={ANY_VALUE}>{anyLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
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

  const pick = (f: FilterFacet, chosen: string) => {
    // Remember the WORDS before handing the value on — see `said` above for
    // why a chip cannot look them up again later. `""` (the facet turned off)
    // has no words and needs none.
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

      {/* THE PANEL — every facet, all at once, in ONE short row directly under
          the toolbar. BUG, 2 Sep 2026, caught live on a screenshot the client
          called "what is this shit": the first cut of this made the panel a
          normal-flow FLEX SIBLING of the pill's other children, `w-full`d to
          reach the toolbar's width. That worked for width, and broke height —
          the panel was TALL (several facets, each an expanded list of
          checkbox rows), `flex-wrap` wrapped it onto a second line INSIDE the
          pill's own box, and a `rounded-pill` (999px) box that tall draws a
          stadium wide enough to read as a giant oval rather than a control. A
          pill's radius is only ever right for a SHORT box; the fix is to keep
          this panel OUT of the box whose radius that is, not to shrink the
          radius. `position: absolute` does that: removed from normal flow
          entirely, this panel cannot feed the pill's own height no matter how
          tall its content gets, so the pill (`relative`, in `ToolbarRow`/
          `PagedFind`/`WaveFinder`/the engine's own `CollectionFrame` — see
          each of their comments at this slot) stays exactly as tall as its own
          one-line content always was. The facets themselves are compact fields
          now (`SelectFacet`), which makes this panel short in the first place;
          the geometry is still what GUARANTEES the pill, because a future
          screen's facet count is not this file's to promise. `top-full`
          anchors it to the host box's bottom edge — that box's `relative`
          positioning is what `full` measures against — and `inset-x-0`
          matches its width. `min-w-*` is for the one host that can only offer
          a narrow anchor (the kit's `CollectionFrame` wraps `filters` in a
          non-growing box; see the header), so the panel keeps a usable measure
          instead of being squeezed to the width of the "Filter" chip. `z-20`
          clears anything the row below might otherwise paint over it, and
          `shadow-[var(--shadow-overlay)]` gives it the kit's own
          floating-surface elevation, since it visually sits ABOVE the content
          below rather than pushing it down — a deliberate trade (see the
          header: nothing here re-flows the page under an open panel). */}
      {open && (
        // NO `role="group"`/`aria-label` OF ITS OWN — the chip cluster above
        // already carries `role="group" aria-label="Filters"` (the kit's own
        // `KitFilterBar` root), and each facet inside here names ITSELF
        // (`RangeFacet`/`SelectFacet`'s own `role="group"
        // aria-labelledby=…`). A second "Filters, group" landmark wrapping
        // both would tell a screen reader the same thing twice for no reason;
        // this div is layout only.
        <div
          ref={panel}
          data-slot="filter-bar-row"
          className="absolute inset-x-0 top-full z-20 mt-2 flex min-w-[min(26rem,calc(100vw-3rem))] flex-wrap items-start gap-4 rounded-[var(--radius)] bg-background p-4 shadow-[var(--shadow-overlay)]"
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

            // ONE COMPACT FIELD PER FACET, side by side (client ruling,
            // 2026-09-02 — see the header). `flex-1` between a floor and a
            // ceiling so two facets share a wide panel evenly and neither
            // grows into a field wider than the words it holds; below the
            // floor the row wraps, which is the only second line this panel
            // ever draws.
            return (
              <div key={f.field} className="min-w-[11rem] max-w-[15rem] flex-1">
                <SelectFacet
                  label={f.label}
                  anyLabel={t("Any {what}", { what: f.label.toLowerCase() })}
                  options={optionsFor(f)}
                  value={val}
                  onPick={(next) => pick(f, next)}
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
