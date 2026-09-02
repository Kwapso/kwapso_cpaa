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
// (`RangeFacet`/`CompactFacet`, below), so the panel already showed every
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
// the pill track. It is not. A column wrapping a host's toolbar in a plain
// `flex-col`, whose children are (a) the pill track, unchanged and still
// fixed-shape, and (b) the panel rendered as its own sibling beneath it, makes
// the panel a NORMAL-FLOW SIBLING of the track rather than a child of it: it
// occupies real space and pushes the collection down (the ruling), and its
// height feeds the COLUMN's box model and never the pill's, because the pill
// is a different box — pass one's bug is structurally impossible now rather
// than merely unlikely. Deleting `absolute`/`top-full` and stopping there is
// pass one again, so `web/test/filter-row-is-the-kits.test.tsx` locks the
// difference: it renders the real `ToolbarRow`, opens the panel, and asserts
// the pill track's own subtree is byte-identical open and closed and never
// contains the panel.
//
// PASS FOUR, SUPERSEDING PASS THREE'S OWN MECHANISM — v1.2.27. Pass three's
// column reached its outlet through a PORTAL: the "Filter" pill has to sit
// INSIDE the track (it is a toolbar control) and the panel has to sit OUTSIDE
// it, and a React element renders into exactly one parent, so a bespoke
// context (`PanelSlot` + `FilterPanelProvider` + `FilterPanelOutlet` +
// `FilterPanelColumn`, ~62 lines) published a DOM node for `createPortal` to
// target — built because neither `ToolbarRow` (screen-bits.tsx) nor the
// kit's own `CollectionFrame` offered a real position to hand a panel node
// to. `CollectionFrame` gained one (`toolbarPanel`) the same release this
// facet work landed in, which is the proof a portal was never the point —
// a POSITION was. `useFilterBar` below returns `{ pill, panel }` as two
// ordinary values instead of rendering both itself, so the CALLER holds both
// pieces already and can hand each to wherever it belongs — `filters` and
// `toolbarPanel`, on `ToolbarRow` or on the kit's `CollectionFrame` directly —
// in one render pass, with no context and no portal. `web/test/filter-row-
// is-the-kits.test.tsx`'s byte-identical assertion above is unchanged: the
// pill track still never contains the panel, because the panel is a
// different VALUE the caller places in a different DOM position, not a
// different kind of proof.
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
// ── THE THREE TOOLBAR PILLS ARE ONE FAMILY — CLIENT RULING, 2026-09-02,
// SUPERSEDED v1.2.27 ──────────────────────────────────────────────────────
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
// THE UPSTREAM FIX LANDED, v1.2.27: the kit's own `CHIP_ADD` now takes
// `SelectTrigger`'s padding, type step and weight the same way it already took
// its height and its fill, closing the three real deltas measured above. The
// app-side override that used to close them here (`FILTER_PILL_MATCHES_THE_OTHER_TWO`,
// reached through the kit's stable `data-slot="filter-bar-add"` hook) is
// therefore deleted along with its application — restating a class the kit
// already states is three lines free to drift out of step with the very thing
// they claim to match, and `web/test/filter-row-is-the-kits.test.tsx` rot-checks
// that it stays gone.
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
// 2026-09-02, AGAINST HER OWN CONFIRMED ARTIFACT. SUPERSEDED IN PART, v1.2.27 ─
//
// `control: "select"` was drawn by the kit's `SearchableFacet`, which is an
// always-expanded panel: a heading, a search pill, then every option as a
// checkbox row. Two facets of it is a full screen of controls hanging under a
// toolbar, and it is what the client's screenshot caught — a "Search client…"
// box over a scrolling list of every client, where her artifact draws one
// short labelled field reading "Any client". The declared control said
// `select` all along; nothing was drawing one. So on 2026-09-02 this file
// composed one out of the kit's own `Select` — a hand-assembled compact field,
// not a hand-rolled trigger, but still this adapter's own composition rather
// than a kit part with a name.
//
// v1.2.27 CLOSED THE GAP UPSTREAM: the kit shipped `CompactFacet` — "one short
// field, and the same filtered list `SearchableFacet` draws, behind it" (the
// kit's own header, `components/filter-bar/filter-bar.tsx`) — built from the
// SAME `selectTriggerVariants` recipe the sort and view pills stand on, so a
// compact facet beside them cannot drift from them the way `CHIP_ADD` did.
// This file's own hand-assembled `Select` composition is deleted in favour of
// it: `SelectFacet` and its `ANY_VALUE` sentinel are gone, and the facet
// branch below draws `<CompactFacet>` directly. `CompactFacet` already draws
// its own `role="group"` + `FacetLabel` frame — matching `RangeFacet`'s, so
// the two facet kinds still read as one family — so this file no longer wraps
// one of its own around it either.
//
// AND THE FEATURE THE FIRST CUT COST COMES BACK. `CompactFacet` is optionally
// `searchable`: the SAME filtered list `SearchableFacet` draws, now reachable
// from behind a short trigger instead of paying for it with an
// always-expanded panel. Waves' own note ("an agency with 131 clients on
// staging") is exactly the case a plain `Select` could not serve — a Radix
// select scrolls and takes type-ahead but does not search — so `wave-finder.tsx`
// turns `searchable` on for its Company facet. The kit's own guidance
// ("`searchable` defaults to FALSE — a facet over eight words does not need a
// search field, and drawing one there would be a control that never earns its
// keystroke") sets the threshold this adapter measures against: `searchable`
// is on wherever a facet's OWN option count exceeds eight, computed per facet
// rather than guessed at a call site, so a vocabulary that grows past the
// threshold turns its own facet searchable without anybody revisiting it.
//
// ── SINGLE-SELECT, AND WHY IT IS NOT A THEMING DECISION ──────────────────────
//
// The doors take one value per query parameter and validate it positionally
// (R20); a comma list would be a change to six doors, their filter parity on
// the machine surface (R19) and their tests. Both the old `Select` composition
// and the kit's own `CompactFacet` are single-valued by construction — and the
// day a door learns a list, this adapter is still the one place that changes.
//
// CLEARING A FACET IS `null` NOW, NOT A SENTINEL STRING. The old `Select`
// composition needed `ANY_VALUE`, a two-underscore placeholder, because Radix
// reserves the empty string for `SelectItem`'s own placeholder state and
// throws if an item declares it — a workaround for a control that speaks in
// strings only. `CompactFacet`'s own `value`/`onValueChange` speak `string |
// null`, `null` already meaning "off" (its own contract: "`null` is the
// facet turned off"), so there is no reserved string to dodge and nothing to
// convert through a sentinel — only the boundary conversion every facet still
// needs, because the app's OWN convention, shared with every door and every
// other facet in this file, is `""` for off: `null` in, `""` out, both ways,
// where this file calls `CompactFacet`.

import * as React from "react"

import { Button } from "@shared/ui/components/button/button"
import {
  CompactFacet,
  FilterBar as KitFilterBar,
  RangeFacet,
} from "@shared/ui/components/filter-bar/filter-bar"
import { cn } from "@shared/ui/lib/utils"
import { useT } from "@shared/web/language"

import { facetOptions } from "./collection"
import { type FacetOption, type FilterFacet } from "./config"
import { formatRange, parseRange } from "./range"

/** THE COMPACT FACET SEARCHES PAST THIS MANY OPTIONS. The kit's own threshold,
 * stated in its `CompactFacet` header: "a facet over eight words does not need
 * a search field, and drawing one there would be a control that never earns
 * its keystroke." Measured per facet, off its own resolved option list —
 * `optionsFor` below, declared or derived from the loaded rows either way — so
 * a vocabulary that grows past eight turns searchable on its own; nobody
 * revisits a call site to flip it. */
const SEARCHABLE_PAST = 8

/**
 * THE FILTER ROW, SPLIT IN TWO — `pill` (the toolbar's own "Filter" control)
 * and `panel` (what it opens), returned separately rather than as one
 * component's markup.
 *
 * SUPERSEDED MACHINERY, v1.2.27. This used to be a single component,
 * `<FilterBar>`, that rendered the pill in place and `createPortal`'d the
 * panel into a DOM node a bespoke context (`PanelSlot` + `FilterPanelProvider`
 * + `FilterPanelOutlet` + `FilterPanelColumn`, ~62 lines) published from
 * wherever the host's toolbar happened to sit — because neither `ToolbarRow`
 * (screen-bits.tsx) nor the kit's own `CollectionFrame` offered a real
 * position for a panel that must land BELOW the whole toolbar rather than
 * inside the pill (the header's three-pass saga explains why one is needed at
 * all). `CollectionFrame` gained a real `toolbarPanel` prop the same release
 * this facet work landed in, so the host itself can now place a panel node
 * exactly where the ruling wants it, in ONE render pass, with no cross-tree
 * portal and no context. A HOOK returning both pieces is the app-side twin of
 * that prop: the CALLER (a screen, or `ToolbarRow`'s own caller) holds `pill`
 * and `panel` as two ordinary values and hands each to wherever it belongs —
 * `filters` and `toolbarPanel` on `ToolbarRow`, or `filters` and `toolbarPanel`
 * on the kit's own `CollectionFrame` directly. The context and its portal are
 * therefore deleted rather than repointed at the kit's new slot: a value
 * returned from a hook reaches two places in a parent's own render without
 * needing either.
 */
function useFilterBar<T>({
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
   * takes its width from wherever the caller places `panel`. No call site
   * uses this today. */
  className?: string
}): { pill: React.ReactNode; panel: React.ReactNode } {
  const t = useT()
  /** Is the panel open? Replaces the old Popover's own `open` state — same
   * idea (a facet's controls are hidden until asked for), a plain toggle
   * instead of a floating, portaled surface. */
  const [open, setOpen] = React.useState(false)
  /** THE OPEN PANEL ITSELF — focus lands on its first control the moment it
   * appears, since (unlike the popover it replaces) nothing here traps focus
   * or needs to hand it back: the "Filter" pill never unmounts, so leaving the
   * panel open or closed never moves focus anywhere the reader didn't ask
   * for. */
  const panelRef = React.useRef<HTMLDivElement>(null)
  const wasOpen = React.useRef(false)
  React.useEffect(() => {
    if (open && !wasOpen.current) {
      panelRef.current?.querySelector<HTMLElement>("input, button")?.focus()
    }
    wasOpen.current = open
  }, [open])

  if (facets.length === 0) return { pill: null, panel: null }

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

  const panel = open ? (
    // NO `role="group"`/`aria-label` OF ITS OWN — the pill's own cluster
    // already carries `role="group" aria-label="Filters"` (the kit's own
    // `KitFilterBar` root), and each facet inside here names ITSELF
    // (`RangeFacet`/`CompactFacet`'s own `role="group"`). A second "Filters,
    // group" landmark wrapping both would tell a screen reader the same thing
    // twice for no reason; this div is layout only.
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
      ref={panelRef}
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
        const facetOptionList = optionsFor(f)
        return (
          <div key={f.field} className="min-w-[11rem] max-w-[15rem] flex-1">
            <CompactFacet
              label={f.label}
              placeholder={t("Any {what}", { what: f.label.toLowerCase() })}
              options={facetOptionList}
              // `null` in, `""` out — the boundary conversion the header
              // explains: the kit's own `null` means off, the app's own `""`
              // does.
              value={val === "" ? null : val}
              onValueChange={(next) => onChange(f.field, next ?? "")}
              // The dense control height, the height the kit's own facet
              // fields take when they stand in a panel rather than a form
              // (`CompactFacet`'s own `size` doc).
              size="dense"
              searchable={facetOptionList.length > SEARCHABLE_PAST}
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

  const pill = (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>
      {/* NO `filters`, NO `onRemove`, NO `onClear` — client ruling,
          2026-09-02: the toolbar shows a count and nothing else (see the
          header). What is left of the kit's bar is its "+ filter" slot,
          which is the pill this row is. */}
      <KitFilterBar
        label={t("Filters")}
        addFilterLabel={addFilterLabel}
        onAddFilter={() => setOpen((o) => !o)}
      />
      <span aria-live="polite" className="sr-only">
        {resultCount != null ? t("{count} results", { count: resultCount }) : ""}
      </span>
    </div>
  )

  return { pill, panel }
}

export { useFilterBar }
