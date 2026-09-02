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
// ── THE POPOVER IS GONE — CLIENT RULING, 2026-09-02 ──────────────────────────
//
// Until that night the "+ filter"/count slot opened a floating, portaled
// Popover holding every facet's own control, stacked one per line. The client,
// against a confirmed mockup: the slot now toggles a SECOND ROW open directly
// under the WHOLE toolbar — not a popover, not an overlay, an actual sibling
// line. Nothing about the facet controls THEMSELVES changed to do this: every
// facet was already rendered by mapping `facets` once, in one place
// (`RangeFacet`/`SelectFacet`, below), so the panel already showed every
// facet's own field at once. And nothing here inserts an "Apply" step: a pick
// calls `onChange` directly, which is what the client asked to keep — "the
// moment I select sth on a dropdown its applied", and, the same day, "remember
// we dont want apply buton".
//
// ── THE PANEL'S GEOMETRY, IN THREE PASSES. READ ALL THREE ────────────────────
//
// PASS ONE — A FLEX SIBLING INSIDE THE PILL, AND THE BLOB. The first cut made
// the panel a genuine flex child of the toolbar's own `rounded-pill` TRACK
// (this component's root was a `<>` fragment for exactly that). It solved
// WIDTH — the panel's `w-full` finally meant the whole pill once nothing
// capped it — and broke HEIGHT: the panel is several facets deep, `flex-wrap`
// folded it onto a second line INSIDE the pill's own box, and a `rounded-pill`
// (999px) box that tall draws a stadium wide enough to read as a giant oval
// with the controls scattered around it. Caught live on a screenshot; the
// client's words were "lol what is this shit".
//
// PASS TWO — `position: absolute`, AND THE OVERLAY. The fix was to take the
// panel out of normal flow entirely (`absolute inset-x-0 top-full` against a
// `relative` track), so its height could never reach the pill's box model no
// matter how many facets a screen adds. That held the pill's shape and cost
// the other half of the behaviour: an open panel FLOATED over the collection
// instead of moving it, which the client then ruled on — verbatim, 2026-09-02:
// "the expanded toolbar shoudl not be an overlay, but literaly expand the
// space".
//
// PASS THREE — THE COLUMN, WHICH IS NEITHER OF THE TWO. Both earlier passes
// took the same thing for granted: that the panel's only possible parent is
// the pill track. It is not. `FilterPanelColumn` below wraps a host's toolbar
// in a plain `flex-col`, whose children are (a) the pill track, unchanged and
// still fixed-shape, and (b) an OUTLET beneath it that the panel renders into.
// The panel is then a NORMAL-FLOW SIBLING of the track rather than a child of
// it: it occupies real space and pushes the collection down (the ruling), and
// its height feeds the COLUMN's box model and never the pill's, because the
// pill is a different box — pass one's bug is structurally impossible now
// rather than merely unlikely. Deleting `absolute`/`top-full` and stopping
// there is pass one again, so `web/test/filter-row-is-the-kits.test.tsx` locks
// the difference: it renders the real `ToolbarRow`, opens the panel, and
// asserts the pill track's own subtree is byte-identical open and closed and
// never contains the panel.
//
// THE PANEL REACHES ITS OUTLET THROUGH A PORTAL, and that is what lets one
// component keep owning the whole row. The "Filter" pill has to sit INSIDE the
// track (it is a toolbar control) and the panel has to sit OUTSIDE it, and a
// React element renders into exactly one parent. `createPortal` into a DOM
// node the column publishes through context is the smallest thing that puts
// two nodes in two places without splitting this component in two, or making
// four hosts hold the open state and re-plumb every facet prop twice. A portal
// into a real element is ordinary flow AT that element — nothing here floats.
//
// WITHOUT A COLUMN the panel simply renders in place, which is correct for a
// host that is not a pill and for a test harness, and is the shape pass one
// had. `FilterPanelColumn` is therefore mandatory for a `rounded-pill` toolbar
// and optional everywhere else; a census in `filter-row-is-the-kits.test.tsx`
// holds every host that draws this bar to it.
//
// ── THE TOOLBAR SAYS A COUNT, NEVER THE FILTERS — CLIENT RULING, 2026-09-02 ──
//
// Verbatim: "when activce filters, do not display them in the toolbar. only a
// count niside the filter pill (like in artifact)". So the kit's CHIP HALF —
// one removable chip per active facet, which this adapter used to build out of
// `facets` + `values` — is not rendered at all. `KitFilterBar` is still what
// draws the row, with no `filters` and no `onRemove`: what survives is its
// "+ filter" slot, which is the pill, reading `Filter` or `Filter (3)`.
//
// What went with the chips, deliberately and completely: the `said` ref that
// remembered a picked value's WORDS so a chip could not end up naming a ULID
// after its option left the loaded page (nothing names a value any more, so
// there is nothing to go stale), `rangeSaid` that turned a numeric bound into
// chip text, the per-chip remove control and its `t("Remove filter: {what}")`
// sentence, and the wrapped-and-truncated chip label. A count cannot clip and
// cannot go stale, which is most of what those existed to survive.
//
// ── WHERE "CLEAR FILTERS" WENT, AND WHY THERE IS STILL EXACTLY ONE ───────────
//
// It was the kit's own control at the end of the chip row, and the kit only
// draws it when there ARE chips (`hasChips` in the kit's file), so with the
// chips gone that control cannot appear and passing `onClear` would be dead
// wiring. The two places it could go are beside the pill, or inside the panel.
//
// IT IS INSIDE THE PANEL, with the fields it clears. Three reasons, in order
// of weight. First, the row it used to belong to is gone: beside the pill it
// would be a second toolbar control that appears and disappears with the
// filter state, changing the track's own contents underneath a person — and
// the pill's count already reports that state, so the toolbar would be saying
// the same thing twice in two shapes. Second, clearing is an edit to the
// facets, and the facets are in the panel; a control standing where the thing
// it acts on is visible is the whole of why the kit drew it beside the chips
// in the first place. Third, the client's own reference artifact draws a Clear
// inside the panel. It is also the reading that keeps the app honest about
// "exactly one": the no-results register already offers its own "Clear
// filters" when a narrowed collection comes back empty
// (`collection-frame.tsx`), and a toolbar control would stand beside that one
// permanently, where this one is on screen only while somebody has the panel
// open.
//
// ── THE THREE TOOLBAR PILLS ARE ONE FAMILY — CLIENT RULING, 2026-09-02 ───────
//
// Verbatim: "the filter button-pill it's still differnet than the other 2. fix
// and uniform it". MEASURED, not eyeballed, against the two pills standing
// beside it — `SortControl`'s field and `ViewSwitch`, which both draw through
// the kit's `SelectTrigger` and both override it the same way:
//
//                     Filter (kit `CHIP_ADD`)      Sort / View (`SelectTrigger`)
//   height            40 (--control-height-button) 40  — already equal
//   radius            rounded-pill                 rounded-pill — already equal
//   resting fill      --btn-secondary-fill         --btn-secondary-fill — equal
//   inline padding    12 (px-3)                    18 (--space-4h)
//   type step         12 (--text-badge), leading 1 14 (--text-sm), leading 1.45
//   weight            inherited (300)              500 (--font-weight-medium)
//
// So three real differences, every one of them making the pill read SMALLER,
// plus a fourth this file was itself causing: the hover override that used to
// live here forced `--accent` onto the add slot. That was right when the kit
// drew that slot with `bg-transparent` (a 5% wash tinting the page behind it)
// and is wrong now that it is an opaque `--btn-secondary-fill` pill — the wash
// REPLACES the fill rather than tinting it, and measured against the dark
// palette it comes out darker than resting, i.e. the pill dimming on hover
// where the other two light up. The kit already hovers it to
// `--btn-secondary-hover`, the same token the other two use, so the override
// is deleted rather than corrected.
//
// The three remaining deltas are closed HERE and not in the kit, through the
// kit's own stable `data-slot="filter-bar-add"` hook and the
// `[&_[data-slot=X]]:` pattern `web/components/auth-card.tsx` documents — so a
// design-sync re-pull never has to notice this exists. `shared/ui/` is
// hash-pinned and a hand-edit there turns the build red (R39). The UPSTREAM
// fix is for the kit's own `CHIP_ADD` to take `SelectTrigger`'s padding, type
// step and weight the same way it already took its height and its fill, and it
// is filed for the design-kit pipeline beside the two gaps below. Only the
// pill's BOX is matched here — height, radius, fill, padding, type — and
// deliberately not its contents: the kit's sort and view pills are being
// re-drawn upstream (their chevrons come off, the view pill gains a leading
// icon), and none of that moves the box these three share.
//
// ── ONE COMPOSITION CANNOT MARK ITS OWN SLOT ─────────────────────────────────
//
// The vendored kit's OWN `CollectionFrame` gives `filters` a wrapping box of
// its own and offers no slot BELOW its toolbar, so the engine's `useKitPanel`
// branch puts the outlet at the top of the frame's BODY instead — directly
// under the toolbar, above the rows, which is where the panel belongs and what
// the ruling asks for. A slot of the frame's own between toolbar and body is
// the upstream fix, logged for the design-kit pipeline.
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
// `selectRows` compiles it and the kit draws it.
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
// Filed for the design-kit pipeline with the two gaps above.
//
// ── SINGLE-SELECT, AND WHY IT IS NOT A THEMING DECISION ──────────────────────
//
// The doors take one value per query parameter and validate it positionally
// (R20); a comma list would be a change to six doors, their filter parity on
// the machine surface (R19) and their tests. A `Select` is single-valued by
// construction — and the day a door learns a list, this adapter is still the
// one place that changes. Clearing one facet is `ANY_VALUE` below, because
// Radix refuses an empty string as an item value; the door still receives "".

import * as React from "react"
import { createPortal } from "react-dom"

import { Button } from "@shared/ui/components/button/button"
import { FilterBar as KitFilterBar, RangeFacet } from "@shared/ui/components/filter-bar/filter-bar"
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

/** THE THREE MEASURED DELTAS between the kit's "+ filter" chip and the sort
 * and view pills standing beside it — inline padding, type step and weight.
 * The numbers, and why this is an app-side override rather than a kit edit,
 * are in the header under "THE THREE TOOLBAR PILLS ARE ONE FAMILY". Reached
 * from outside through the kit's own stable `data-slot="filter-bar-add"` hook,
 * on this adapter's own wrapping `<div>`, so a design-sync re-pull never has
 * to notice it exists; `[&_…]` gives each rule two selector steps against the
 * kit's one utility class, so the override wins on specificity rather than on
 * emission order. HEIGHT, RADIUS AND FILL ARE NOT HERE: the kit already draws
 * all three the same on all three pills, and restating them would be three
 * more lines free to drift. */
const FILTER_PILL_MATCHES_THE_OTHER_TWO =
  "[&_[data-slot=filter-bar-add]]:px-[var(--space-4h)] " +
  "[&_[data-slot=filter-bar-add]]:text-sm " +
  "[&_[data-slot=filter-bar-add]]:leading-[var(--text-sm--line-height)] " +
  "[&_[data-slot=filter-bar-add]]:font-[var(--font-weight-medium)]"

/** THE PANEL'S PLACE IN THE DOCUMENT, published by whoever owns the toolbar.
 * `null` until the outlet mounts, and `null` for good in a host that offers
 * none — see `FilterPanelColumn`, and the header's third pass for why the
 * panel cannot simply render where the pill is. */
const PanelSlot = React.createContext<{
  outlet: HTMLElement | null
  register: (el: HTMLDivElement | null) => void
} | null>(null)

/** Publishes a panel outlet to every `FilterBar` beneath it. Reach for this
 * directly only where the outlet cannot be a sibling of the toolbar — the
 * engine's `useKitPanel` branch, where the kit's own frame owns the markup
 * between its toolbar and its rows. Everywhere else `FilterPanelColumn` is the
 * whole answer. */
function FilterPanelProvider({ children }: { children: React.ReactNode }) {
  const [outlet, register] = React.useState<HTMLDivElement | null>(null)
  const slot = React.useMemo(() => ({ outlet, register }), [outlet])
  return <PanelSlot.Provider value={slot}>{children}</PanelSlot.Provider>
}

/** WHERE THE OPEN PANEL LANDS. `display: contents` on purpose: the outlet must
 * add nothing to its parent while it is empty, and a plain empty `<div>` in a
 * `gap`-ed flex column is a gap. With `contents` it generates no box at all,
 * so a closed panel costs exactly nothing, and an open one becomes a direct
 * child of the column and takes the column's own gap. */
function FilterPanelOutlet() {
  const slot = React.useContext(PanelSlot)
  return <div ref={slot?.register} className="contents" />
}

/**
 * THE TOOLBAR, AND THE SPACE UNDER IT. Wrap a `rounded-pill` toolbar track in
 * this and an open filter panel becomes a normal-flow sibling BENEATH the
 * track: it pushes the collection down (client ruling, 2026-09-02) and its
 * height feeds this column's box model instead of the pill's, which is what
 * stops the track being drawn as a giant oval. Both halves of that, and the
 * two earlier shapes that each got one of them and not the other, are in this
 * file's header.
 */
function FilterPanelColumn({
  className,
  children,
}: {
  /** Goes on the COLUMN, not on the track — the track is `children` and keeps
   * its own classes. `flex`/`flex-col` here are defaults a caller may replace
   * (`cn` resolves the conflict), which is how a responsive host hides the
   * whole column at one breakpoint. */
  className?: string
  children: React.ReactNode
}) {
  return (
    <FilterPanelProvider>
      <div data-slot="filter-panel-column" className={cn("flex min-w-0 flex-col gap-2", className)}>
        {children}
        <FilterPanelOutlet />
      </div>
    </FilterPanelProvider>
  )
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
   * there is no "Apply" step, on the panel exactly as there was none on the
   * popover it replaces. */
  onChange: (field: string, value: string) => void
  /** Drop every facet at once — the PANEL's own "Clear filters", and the only
   * one this row has (the header says why it is not beside the pill). NOT the
   * search box: what somebody typed is cleared by the search field's own ✕
   * (`SearchInput onClear`), which is why this prop was renamed from
   * `onClearAll`, which had been clearing something it did not name. */
  onClearFacets: () => void
  /** Announced politely to screen readers when results change. */
  resultCount?: number
  /** Applied to the pill's own wrapping box — NOT to the open panel, which
   * belongs to the column beneath the toolbar and takes its width from there.
   * No call site uses this today. */
  className?: string
}) {
  const t = useT()
  /** Is the panel open? Replaces the old Popover's own `open` state — same
   * idea (a facet's controls are hidden until asked for), a plain toggle
   * instead of a floating, portaled surface. */
  const [open, setOpen] = React.useState(false)
  const slot = React.useContext(PanelSlot)
  /** THE OPEN PANEL ITSELF — focus lands on its first control the moment it
   * appears, since (unlike the popover it replaces) nothing here traps focus
   * or needs to hand it back: the "Filter" pill never unmounts, so leaving the
   * panel open or closed never moves focus anywhere the reader didn't ask
   * for. */
  const panel = React.useRef<HTMLDivElement>(null)
  const wasOpen = React.useRef(false)
  React.useEffect(() => {
    if (open && !wasOpen.current) {
      panel.current?.querySelector<HTMLElement>("input, button")?.focus()
    }
    wasOpen.current = open
  }, [open])

  if (facets.length === 0) return null

  const optionsFor = (f: FilterFacet): FacetOption[] => f.options ?? facetOptions(data, f.field)

  /** HOW MANY FACETS ARE ON. The one definition in this row — the pill's count
   * reads it, and so does the panel's "Clear filters", which is not worth
   * drawing over nothing. Counted off `facets` rather than off `values`, so a
   * stale field left behind in a caller's own query object cannot inflate it. */
  const activeCount = facets.reduce((n, f) => n + ((values[f.field] ?? "") === "" ? 0 : 1), 0)

  // THE "FILTER" PILL'S OWN LABEL. The bare word while the panel is open (it
  // is its own explanation once the fields are in front of you), and the bare
  // word while nothing is on — a count only earns its place once BOTH "there
  // is something to report" and "the panel that would show it is shut" are
  // true. Since the chips went (client ruling, 2026-09-02) this count is the
  // ONLY thing the toolbar says about what is narrowing the list.
  const addFilterLabel =
    !open && activeCount > 0 ? t("Filter ({count})", { count: activeCount }) : t("Filter")

  const panelNode = open ? (
    // NO `role="group"`/`aria-label` OF ITS OWN — the pill's own cluster
    // already carries `role="group" aria-label="Filters"` (the kit's own
    // `KitFilterBar` root), and each facet inside here names ITSELF
    // (`RangeFacet`/`SelectFacet`'s own `role="group" aria-labelledby=…`). A
    // second "Filters, group" landmark wrapping both would tell a screen
    // reader the same thing twice for no reason; this div is layout only.
    //
    // A NORMAL BLOCK, and every class that made it an overlay is gone:
    // `absolute inset-x-0 top-full`, the `z-20` it needed to clear the rows it
    // painted over, and `shadow-[var(--shadow-overlay)]`, the kit's
    // floating-surface elevation — nothing here floats any more, so an
    // elevation would be saying something untrue about the surface. What is
    // left is the panel's own paper: `bg-background`, the same step the
    // toolbar track above it stands on, so the two read as one piece of
    // furniture rather than a card dropped under a row. `min-w-*` is for the
    // one host that can only offer a narrow outlet (the engine's
    // `useKitPanel` branch), so the panel keeps a usable measure instead of
    // being squeezed to the width of the "Filter" pill.
    <div
      ref={panel}
      data-slot="filter-bar-row"
      className="flex min-w-[min(26rem,calc(100vw-3rem))] flex-wrap items-start gap-4 rounded-[var(--radius)] bg-background p-4"
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
              onPick={(next) => onChange(f.field, next)}
            />
          </div>
        )
      })}

      {/* THE ONE "CLEAR FILTERS" — the header says why it is here and not
          beside the pill. Drawn only when something is on, which is the kit's
          own rule for the control it replaces ("a control that does nothing is
          worse than no control"). `secondary` is the neutral paper pill every
          other control in this row stands on, and the one Button variant that
          carries no brand fill; `sm` is the dense height the facet fields
          take, and `self-end` lines it up with the fields rather than with
          their captions. */}
      {activeCount > 0 && (
        <Button variant="secondary" size="sm" className="self-end" onClick={onClearFacets}>
          {t("Clear filters")}
        </Button>
      )}
    </div>
  ) : null

  return (
    <>
      <div
        className={cn(
          "flex min-w-0 flex-wrap items-center gap-2",
          FILTER_PILL_MATCHES_THE_OTHER_TWO,
          className
        )}
      >
        {/* NO `filters`, NO `onRemove`, NO `onClear` — client ruling,
            2026-09-02: the toolbar shows a count and nothing else (see the
            header). What is left of the kit's bar is its "+ filter" slot,
            which is the pill this row is. */}
        <KitFilterBar
          label={t("Filters")}
          addFilterLabel={addFilterLabel}
          onAddFilter={() => setOpen((o) => !o)}
        />
      </div>

      {/* INTO THE COLUMN'S OUTLET when a host published one — a real element
          beneath the toolbar track, so this is ordinary flow there and the
          collection below moves down. In place otherwise, which is right for a
          host that is not a pill and for a test harness. */}
      {panelNode && slot?.outlet ? createPortal(panelNode, slot.outlet) : panelNode}

      <span aria-live="polite" className="sr-only">
        {resultCount != null ? t("{count} results", { count: resultCount }) : ""}
      </span>
    </>
  )
}

export { FilterBar, FilterPanelColumn, FilterPanelProvider, FilterPanelOutlet }
