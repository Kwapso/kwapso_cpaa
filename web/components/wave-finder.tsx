"use client"

// FINDING A WAVE — the one search, filter and sort, wherever waves are listed.
//
// WHY THIS IS A FILE RATHER THAN A TOOLBAR ON THE WAVES PAGE. Waves are listed
// in two places and will be listed in more: the sidebar collection, and the
// client's own record. A screen that grew its own search box would give the
// second list a different vocabulary from the first — a different placeholder,
// a different sort, "Switched off" spelled two ways — which is the drift the
// glossary law exists to stop and which no law catches inside a component.
//
// CLIENT-SIDE, DELIBERATELY, AND THE REASON IS R14.
// A wave is something the agency SELLS. The collection grows at the speed of
// contracts, not of clicks, so the door reads it WHOLE under a hard cap and
// there is no page two to be wrong about. That makes filtering in the browser
// the honest shape here: everything that can match is already in front of us.
// The moment waves are paged (they are not, and would not be for years) this
// has to move to the door, for the reason paged-find.tsx spells out — a filter
// over page one answers "the open ones among the first fifty", which is a
// different and worse sentence.
//
// SELECTION IS A PURE FUNCTION so it can be tested without a screen, and the
// toolbar below is only the controls that feed it.

import * as React from "react"

import { cn } from "@shared/ui/lib/utils"
import { SearchInput } from "@shared/ui/components/search-input/search-input"
import { SortControl } from "@shared/ui/components/sort-control/sort-control"
import { ViewSwitch } from "@shared/ui/components/collection-frame/view-switch"
import { List, ChartBarHorizontal } from "@shared/ui/foundations/icons"
import { useFilterBar } from "@shared/web/screen-engine/filter-bar"
import type { FilterFacet } from "@shared/web/screen-engine/config"
import { useT } from "@shared/web/language"
import type { Account } from "@shared/types"
import type { Wave } from "@shared/waves"

/** LIST, or the Gantt-drawn TIMELINE (waves-screen.tsx's `waveTimelineWindow`).
 * List is the first-run default — D7-5's "table-first" rule, spelled for a
 * collection whose default body is a plain list rather than a table. */
export type WaveView = "list" | "timeline"

/** What a wave can be ordered by. The words are the SCREEN's, not the column's. */
export type WaveOrder = "name" | "runs" | "sprints" | "client" | "newest"

export type WaveQuery = {
  q: string
  /** "" = every client */
  accountId: string
  /** "" = both · "on" · "off" */
  status: string
  sortBy: WaveOrder
  dir: "asc" | "desc"
}

export const EMPTY_WAVE_QUERY: WaveQuery = {
  q: "",
  accountId: "",
  status: "",
  sortBy: "newest",
  dir: "desc",
}

/** Is anything actually being asked? Drives the "Clear all" control and the
 * empty state's wording — "nothing matched" and "nothing here yet" are two
 * different sentences and a screen that says the wrong one sends somebody
 * looking for a wave that was never sold. */
export function waveQueryIsActive(query: WaveQuery): boolean {
  return query.q.trim() !== "" || query.accountId !== "" || query.status !== ""
}

/** A number that sorts null-last in both directions: a wave with no sprints yet
 * has no dates, and that is an ordinary state rather than "the year zero". */
const dateKey = (d: string | null): number => (d ? Date.parse(d) : Number.NaN)

function compare(a: Wave, b: Wave, by: WaveOrder): number {
  if (by === "name") return a.name.localeCompare(b.name)
  if (by === "client") return (a.accountName ?? "").localeCompare(b.accountName ?? "")
  if (by === "sprints") return a.sprintCount - b.sprintCount
  if (by === "runs") {
    const x = dateKey(a.startsOn)
    const y = dateKey(b.startsOn)
    // Undated last whichever way the arrow points — see dateKey.
    if (Number.isNaN(x) && Number.isNaN(y)) return 0
    if (Number.isNaN(x)) return 1
    if (Number.isNaN(y)) return -1
    return x - y
  }
  return Date.parse(a.createdAt) - Date.parse(b.createdAt)
}

/** SEARCH, FILTER, SORT — in that order, over the whole bounded collection. */
export function selectWaves(rows: Wave[], query: WaveQuery): Wave[] {
  const needle = query.q.trim().toLowerCase()
  const matched = rows.filter((w) => {
    if (query.accountId && w.accountId !== query.accountId) return false
    if (query.status === "on" && !w.active) return false
    if (query.status === "off" && w.active) return false
    if (!needle) return true
    // The client's name is searched too: "Hogo" is how somebody looks for the
    // package they sold Hogo, and it is on the row already.
    return [w.name, w.accountName ?? "", w.goal ?? ""].some((s) => s.toLowerCase().includes(needle))
  })
  const sorted = [...matched].sort((a, b) => compare(a, b, query.sortBy))
  // A sort with an undated tail keeps that tail at the bottom in both
  // directions, so reversing never promotes "we haven't planned this" to the top.
  if (query.dir === "desc") {
    if (query.sortBy !== "runs") return sorted.reverse()
    const dated = sorted.filter((w) => w.startsOn)
    const undated = sorted.filter((w) => !w.startsOn)
    return [...dated.reverse(), ...undated]
  }
  return sorted
}

export function WaveFinder({
  query,
  onChange,
  clients,
  /** Omit the client filter where the list is already one client's. */
  showClientFilter = true,
  resultCount,
  view,
  onViewChange,
  period,
  actions,
}: {
  query: WaveQuery
  onChange: (next: WaveQuery) => void
  clients: Account[]
  showClientFilter?: boolean
  resultCount?: number
  /** LIST/TIMELINE — CH19's third toolbar zone ("search, then filters, then
   * view switcher, then actions pinned right", CH27.13), the kit's own
   * `ViewSwitch`. Waves offers exactly two and no more, so it is always drawn
   * here rather than made conditional — `ViewSwitch` itself renders nothing
   * for fewer than two (view-switch.tsx's own state 7). */
  view?: WaveView
  onViewChange?: (view: WaveView) => void
  /** CH27.26's `‹ 6 months ›` — override 28 puts the stepper "between the
   * search field and the view switch". `GanttPeriodStepper` renders nothing
   * with no handlers and no label (its own state 7/10), so an idle List view
   * or a Timeline whose data fits inside six months passes nothing here and
   * this slot draws empty air rather than a control with nowhere to go. */
  period?: React.ReactNode
  /** THE ROW'S OWN ACTION BUTTONS ("Sell a wave"…), last in THIS toolbar's
   * first line — the same slot `<PagedFind>`'s own `actions` draws, so a
   * bare collection's toolbar and a paged one's read as the same control in
   * two places. No longer pushed to the far edge with `ml-auto` (client,
   * 2 Sep 2026: her reference artifact packs it as the last chip in the
   * same left-clustered row, not stretched open to the far side). Waves is
   * the one bounded, single-view collection whose search/sort/filter is a
   * component of its own rather than the frame's, so the button lives HERE,
   * beside search and sort, instead of in a row of its own above this one
   * (client ruling, 2026-08-31: an action button never gets a separate row
   * from the toolbar it belongs to). */
  actions?: React.ReactNode
}) {
  const t = useT()

  const facets: FilterFacet[] = [
    ...(showClientFilter
      ? [
          {
            field: "accountId",
            label: t("Client"),
            control: "select" as const,
            // No `searchable` flag here: a facet declares its OPTIONS and
            // nothing about how they are picked over (`FilterFacet`,
            // config.ts) — whether the panel offers a search field is one
            // decision in one place, `filter-bar.tsx`'s own `SEARCHABLE_PAST`
            // threshold, measured off this facet's own resolved option count.
            // This is the exact list that threshold exists for — an agency
            // with 131 clients on staging, more than the kit's own `Select`
            // (2026-09-02 through v1.2.26) could search, only scroll — the
            // kit's `CompactFacet` (v1.2.27) answers it now, and the toolbar's
            // own search box beside it is untouched.
            options: clients.map((a) => ({ value: a.id, label: a.name })),
          },
        ]
      : []),
    {
      field: "status",
      label: t("Status"),
      control: "select" as const,
      options: [
        { value: "on", label: t("On") },
        { value: "off", label: t("Switched off") },
      ],
    },
  ]

  const { pill: filterPill, panel: filterPanel } = useFilterBar({
    facets,
    values: { accountId: query.accountId, status: query.status },
    // Empty on purpose: both facets carry their own options, so there is
    // nothing for the bar to derive from the rows on screen — and a client
    // whose only wave is filtered out must not vanish from the filter.
    data: [],
    onChange: (field, value) => onChange({ ...query, [field]: value }),
    onClearFacets: () =>
      onChange({ ...EMPTY_WAVE_QUERY, q: query.q, sortBy: query.sortBy, dir: query.dir }),
    resultCount,
  })

  // ONE ROW, ALWAYS (client ruling, 2026-09-01 — the toolbar spec Aurora
  // approved that night, which supersedes this file's own earlier reasoning
  // below). The filter bar used to be drawn as this row's own sibling BELOW
  // it — the same shape her Apps screenshot caught: search+sort(+actions) on
  // one line, the filter chips stranded on a second, disconnected one. The
  // CONTROL is a flex item of this one row now, the same technique the kit's
  // OWN toolbar uses for its `filters` slot (`shared/ui/components/
  // collection-frame/collection-frame.tsx`). What is NOT in the row is its
  // open panel, and that is a different question with a different answer —
  // see the column below.
  // ONE CONTAINER, GROWING — CLIENT RULING, 2026-09-03, MIRRORING THE FIX
  // `ToolbarRow` (screen-bits.tsx) ALREADY CARRIES. Verbatim: "what this is
  // doing is creating a new card underneath... it kind of creates a second
  // toolbar... merge this with the main toolbar so that it's one single
  // background or container, more like expand behaviour rather than
  // open-a-new-one behaviour." This track used to carry its own
  // `rounded-pill bg-background` unconditionally, with the panel one `gap-2`
  // below it as a second sibling — two same-toned boxes with air between
  // them, exactly the "second toolbar" she is naming. The fix is the same one
  // `ToolbarRow` carries: the fill and the radius move to the OUTER column,
  // chosen by `Boolean(filterPanel)` (R31 — two radii, never a third, never
  // both at once), and the track keeps only its own padding/gap. No gap
  // between the track and the panel either.
  const filterPanelOpen = Boolean(filterPanel)
  return (
    <div
      data-slot="toolbar-row-column"
      className={cn(
        "flex w-full min-w-0 flex-col bg-background",
        filterPanelOpen ? "rounded-[var(--radius)]" : "rounded-pill"
      )}
    >
      <div
        data-slot="toolbar-row-track"
        className="flex w-full flex-wrap items-center gap-2 py-1.5 pe-1.5 ps-4"
      >
        {/* THE ONLY GROWING SLOT — client, 2 Sep 2026, "cluster to the right!!!!
            like in your atifact": the reference artifact's search element is
            `flex: 1 1 auto`, not a fixed width, so it grows to push the filter
            pill/sort/period after it to the track's far edge instead of sitting
            immediately after a narrow box. */}
        <div className="flex min-w-[10rem] flex-1 flex-wrap items-center gap-2">
          <SearchInput
            value={query.q}
            onChange={(e) => onChange({ ...query, q: e.currentTarget.value })}
            // THE SEARCH CLEARS ITSELF. It used to be cleared by the filter row's
            // "Clear all", which was one control quietly owning two questions; the
            // kit's bar says "Clear filters" and now means only that.
            onClear={() => onChange({ ...query, q: "" })}
            placeholder={t("Search waves…")}
            className="w-full"
          />
        </div>
        {/* NO WRAPPING BOX AROUND THE PILL — `filterPill` renders inline as a
            normal flex child (wrapping itself in a non-growing box internally),
            and its open PANEL is the separate `filterPanel` value, rendered
            into the column below rather than into this row — the split
            `useFilterBar` itself returns (v1.2.27). The pill says a COUNT and
            never the filters themselves — client, 2026-09-02: "when activce
            filters, do not display them in the toolbar. only a count niside
            the filter pill". See `filter-bar.tsx`'s own header for the full
            account. */}
        {filterPill}
        <SortControl
          options={[
            { value: "newest", label: t("Newest first") },
            { value: "name", label: t("Name") },
            { value: "client", label: t("Client") },
            { value: "runs", label: t("When it runs") },
            { value: "sprints", label: t("Sprints inside it") },
          ]}
          value={query.sortBy}
          onValueChange={(by) => onChange({ ...query, sortBy: by as WaveOrder })}
          direction={query.dir}
          onDirectionChange={(dir) => onChange({ ...query, dir })}
          label={t("Sort by")}
          hideLabel
        />
        {period}
        {view && onViewChange ? (
          <ViewSwitch
            views={[
              { value: "list", label: t("List"), icon: <List size={16} /> },
              { value: "timeline", label: t("Timeline"), icon: <ChartBarHorizontal size={16} /> },
            ]}
            value={view}
            onValueChange={(v) => onViewChange(v as WaveView)}
            label={t("View")}
          />
        ) : null}
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {filterPanel}
    </div>
  )
}
