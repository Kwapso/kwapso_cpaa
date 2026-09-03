"use client"

// APPS — the systems we have built. An app belongs to ONE account, always (the
// owner's ruling), and everything else in the work engine hangs off it: a sprint
// covers one app, and a story is on one app whether or not it is in a sprint.
//
// IT IS A WALL OF TILES, NOT A LIST OF ROWS (CHECKLIST 8.1, 17 Aug 2026). An app
// is the one record in this app that a person recognises by SIGHT — it has a
// mark, a client and a stage, and the previous screen spent all three on a
// dot-separated subtitle nobody read. UI-RULEBOOK K9 permits a card grid exactly
// where the record carries an image, and G3 says the mark sits in a rounded
// square where a logo would; both are true here.
//
// TWO TABS, EACH GROUPED BY STAGE (8.2). Active is everything still being worked
// on; Inactive is Completed and Archived, which is the only pair of stages that
// means "done with". Under each tab the tiles group under a plain stage heading
// (UI-RULEBOOK K6), in the order the agency reads them. The count on each tab is
// the exact number of rows behind it, arbitrated through CountedTabs (R16) so
// the heading above stands down rather than saying the number twice.
//
// AN ARCHIVED APP (deactivated_at set) is a different fact from the Archived
// STAGE, and both land in Inactive on purpose: from the reader's side "put away"
// is one idea, and a tile that says "archived" under the heading "Archived" is
// the app agreeing with itself.
//
// A SECOND VIEW, LIST, ADDED 2026-09-01 — Tiles STAYS THE DEFAULT (CHECKLIST
// 8.1, above, is a ruling about which body an app opens on, not a ban on a
// second one). An agency two years in has tens of apps under one stage
// heading, and "which of my clients' systems are in Development" is a
// question a sorted list answers better than a wall of squares. `apps` is
// BOUNDED (R14) — every row narrowed/sorted for Tiles (`shown`, below) is
// already in hand, so List is a pure re-rendering of the same array through
// `appsListRecipe` ("apps.list", web/lib/screens.ts) via `ScreenRenderer`,
// never a second fetch or a second narrowing pass. `ViewSwitch`
// (shared/ui/components/collection-frame/view-switch.tsx) puts `views[0]`
// first as its own first-run default and its own doc recommends the TABLE
// go there — but the kit's doc also says plainly it cannot check which entry
// IS the table, "that route's vocabulary". Apps' vocabulary is CHECKLIST
// 8.1: Tiles is the deliberate default, not a stand-in for a missing table,
// so `views` stays `[Tiles, List]` in that order — don't "fix" it to match
// the kit's generic recommendation.

import * as React from "react"

import { Button } from "@shared/ui/components/button/button"
import { SearchInput } from "@shared/ui/components/search-input/search-input"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { SortControl } from "@shared/ui/components/sort-control/sort-control"
import { ViewSwitch } from "@shared/ui/components/collection-frame/view-switch"
import { List, SquaresFour } from "@shared/ui/foundations/icons"
import { toast } from "@shared/ui/components/sonner/sonner"
import { ShapeStateBody } from "@shared/ui/compositions/states/states"
import { defaultTabsConfig } from "@shared/web/screen-engine/tabs-view"
import { useFilterBar } from "@shared/web/screen-engine/filter-bar"
import { useRemembered } from "@shared/web/remembered"
import {
  ScreenRenderer,
  type ScreenActionContext,
  type ScreenIntent,
} from "@shared/web/screen-engine/screen-renderer"
import type { ScreenRecipe, ScreenRights } from "@shared/web/screen-engine/recipe"
import type { FilterFacet, SortOption } from "@shared/web/screen-engine/config"

import { CollectionHeading } from "@/components/collection-heading"
import { CountedAbove } from "@/components/counted-tabs"
import { SectionWithCreate, AddButton, ToolbarRow } from "@/components/deep-link/screen-bits"
import { CollectionEmptyState, CollectionCreateActionProvider } from "@shared/web/screen-engine/collection-frame"
import { AppFormDialog, type AppFormValues } from "@/components/app-form-dialog"
import { useAssignableMembers } from "@/lib/members"
import { AppTiles } from "@/components/app-tiles"
import { RecordMark } from "@shared/web/record-mark"
import { useAccountNames } from "@/lib/account-names"
import { tenancy } from "@/lib/api"
import { accountsKey, appsKey, listFetch, impactKey } from "@/lib/live-resources"
import { formatCount } from "@shared/web/format-count"
import { APP_STAGES, NO_STAGE, appStageIsActive, appStageMark, appStageOrder } from "@shared/app-stages"
import type { Account, AppRow } from "@shared/types"
import { invalidate, useCached } from "@shared/web/store"
import { withDataDrivenCollection } from "@/lib/screens"
import { useT } from "@shared/web/language"

/** Record an app through the door and re-read what changed. Shared with the maps
 * screen and the account record, both of which can add one. */
export async function createAppFrom(
  teamId: string,
  values: AppFormValues,
  /** The caller's language. A plain function cannot call `useT`, so the one
   * component that CAN hands it down — the same shape `translateRecipe` uses. */
  t: (english: string) => string
): Promise<void> {
  await tenancy.createApp({
    name: values.name,
    accountId: values.accountId || undefined,
    url: values.url || undefined,
    stage: values.stage || undefined,
    logoUrl: values.logoUrl || undefined,
    toolCostCentsPerMonth: values.toolCostCentsPerMonth,
    about: values.about || undefined,
    clientContext: values.clientContext || undefined,
    solution: values.solution || undefined,
    keyActors: values.keyActors || undefined,
    // Who is on it, from the same submit (8.10 + 8.5). Sent even when empty, so
    // recording an app with nobody on it is a deliberate answer rather than a
    // field the door never heard about.
    staffUserIds: values.staffUserIds,
    leadUserId: values.leadUserId || undefined,
    stakeholderContactIds: values.stakeholderContactIds,
    mainStakeholderContactId: values.mainStakeholderContactId || undefined,
  })
  invalidate(appsKey(teamId))
  invalidate(impactKey(teamId))
  toast.success(t("App recorded."))
}

/** Split by stage, in the agency's own reading order, with the apps that carry no
 * stage last under one honest heading. The grouping is a pure function of the
 * rows so the two tabs and the app record can never disagree about which stage a
 * system is in. */
function groupByStage(apps: AppRow[]): { stage: string; apps: AppRow[] }[] {
  const groups = new Map<string, AppRow[]>()
  for (const app of apps) {
    const key = app.stage?.trim() || NO_STAGE
    const list = groups.get(key)
    if (list) list.push(app)
    else groups.set(key, [app])
  }
  return [...groups.entries()]
    .map(([stage, rows]) => ({ stage, apps: rows }))
    .sort((a, b) => {
      if (a.stage === NO_STAGE) return 1
      if (b.stage === NO_STAGE) return -1
      const byOrder = appStageOrder(a.stage) - appStageOrder(b.stage)
      return byOrder !== 0 ? byOrder : a.stage.localeCompare(b.stage)
    })
}

/** Is this app still being worked on? An ARCHIVED row is inactive whatever its
 * stage says, and a stage the code has never met counts as active — the harm of
 * the wrong guess is asymmetric, and an app nobody can find is the worse half. */
function appIsActive(app: AppRow): boolean {
  return app.active && appStageIsActive(app.stage)
}

/** WHAT AN APP MAY BE ORDERED BY. Sorting REORDERS the tiles inside each stage
 * heading (groupByStage still decides which heading a tile lands under, and in
 * which order the headings themselves read) — the same split PagedFind draws
 * between "which rows" and "what order", one layer down for a bounded, grouped
 * screen instead of a paged one. */
const APP_SORTS: SortOption[] = [
  { value: "name", label: "Name" },
  { value: "client", label: "Client" },
  { value: "created", label: "Created", defaultDir: "desc" },
]

/** A date that sorts null-last whichever way the arrow points — an app with no
 * recorded creation date (a row from before the column existed) is an ordinary
 * state, not "the year zero". */
function dateKey(iso: string | null | undefined): number {
  return iso ? Date.parse(iso) : Number.NaN
}

/** `dir` is applied INSIDE, never by negating the whole comparator at the call
 * site — a null `createdAt` must sort last whichever way the arrow points, and
 * multiplying the null tie-break by -1 would put an app with no recorded date
 * FIRST the moment somebody flips to descending (caught live, verification
 * harness: "Archived draft SOP" jumped to the top of a newest-first sort). */
function compareApps(
  a: AppRow,
  b: AppRow,
  by: string,
  accountNames: Map<string, string>,
  dir: "asc" | "desc"
): number {
  const dirMul = dir === "desc" ? -1 : 1
  if (by === "client") {
    const an = a.accountId ? (accountNames.get(a.accountId) ?? "") : ""
    const bn = b.accountId ? (accountNames.get(b.accountId) ?? "") : ""
    return an.localeCompare(bn) * dirMul
  }
  if (by === "created") {
    const ad = dateKey(a.createdAt)
    const bd = dateKey(b.createdAt)
    if (Number.isNaN(ad) && Number.isNaN(bd)) return 0
    if (Number.isNaN(ad)) return 1
    if (Number.isNaN(bd)) return -1
    return (ad - bd) * dirMul
  }
  return a.name.localeCompare(b.name) * dirMul
}

export function AppsScreen({
  teamId,
  recipe,
  rights,
  total,
  canCreate,
  onAction,
  onIntent,
}: {
  teamId: string
  recipe: ScreenRecipe
  rights: ScreenRights
  /** the exact server total (R16) — never the loaded list's length */
  total: number | undefined
  canCreate: boolean
  onAction: (actionId: string, ctx: ScreenActionContext) => void
  onIntent: (intent: ScreenIntent) => void
}) {
  const t = useT()
  const appsQ = useCached<AppRow[]>(appsKey(teamId), () => listFetch.apps(teamId))
  // The accounts an app can belong to, for the add-app picker below — page one
  // is plenty for a picker (the same cache the accounts screen holds), and a
  // picker searches rather than trusting page one to hold everything anyway.
  const accountsQ = useCached<Account[]>(accountsKey(teamId), () => listFetch.accounts(teamId))
  // The NAME each tile shows for its account — never page one alone (see
  // web/lib/account-names.ts: page one silently dropped an app's real account
  // for one outside it, 2026-08-31).
  const accountNames = useAccountNames(teamId)
  // Who can be put on an app (8.10) — the team, from the cache four other
  // screens already fill.
  const members = useAssignableMembers(teamId)
  const [addOpen, setAddOpen] = React.useState(false)
  // Which half of the collection she was in, remembered per screen with the
  // rest of what she was looking at (web/lib/nav-memory.ts).
  const [tab, setTab] = useRemembered("tab", "active")
  // THE SEARCH BOX (the owner, 24 Aug 2026: "I cannot search through any of my
  // apps, which is a weird thing to begin with"). It narrows the LOADED set
  // rather than asking the server, and that is the right shape here for the same
  // reason the Active/Inactive split is: this collection is BOUNDED (R14), read
  // whole, and twenty-eight rows are already in the browser. Typing is instant
  // and costs nothing. The door takes a `q` as well, because the assistant and
  // an outside tool cannot hold a list in a browser (R19).
  const [query, setQuery] = useRemembered("search", "")
  // WHICH FACETS ARE ON, {} = none — the same shape WaveFinder's own facet
  // state takes, and for the same reason: this collection is bounded (R14) and
  // read whole, so a facet here is a plain filter over the array in hand rather
  // than a door parameter.
  const [facetValues, setFacetValues] = useRemembered<Record<string, string>>("filters", {})
  // THE ORDER, remembered as one slot with its direction — the field the
  // person is sorting by and which way, so a re-pick and a flip cannot land in
  // two different renders.
  const [sort, setSort] = useRemembered<{ by: string; dir: "asc" | "desc" }>("sort", {
    by: "name",
    dir: "asc",
  })
  // WHICH BODY — Tiles or List, remembered per screen exactly like `tab`/
  // `query`/`facetValues`/`sort` above (the kit's `ViewSwitch` doc calls this
  // choice "remembered, per person" and leaves the STORE to the app; this is
  // the app's one seam for that, already scoped to one browser's own tab).
  // TILES FIRST, ALWAYS — CHECKLIST 8.1 (top of file) is a product ruling
  // that this collection opens on a wall of tiles, not the kit's own
  // generic "put the table first" recommendation (view-switch.tsx says
  // plainly it cannot check which entry IS the table — "that route's
  // vocabulary"). Don't reorder `views` below to match the kit's default.
  const [view, setView] = useRemembered<"tiles" | "list">("view", "tiles")

  // WHO AN APP MAY BE FILED UNDER, and WHICH STAGE — both derived from the
  // WHOLE collection (never `matching`/`shown`), so a facet's own options never
  // vanish as another control narrows the list (the same rule FilterBar's own
  // header names: "distinct values are derived from it when a facet omits
  // options … so choices don't vanish as you filter"). "Ours" (no account) has
  // no facet value of its own — an empty facet value already means "off" — the
  // same limit WaveFinder's client facet accepts for the same field.
  //
  // COMPUTED AHEAD OF THE TWO EARLY RETURNS BELOW (`appsQ.data ?? []`), so
  // `useFilterBar` — a HOOK — can be called unconditionally alongside every
  // other hook here, same discipline `shared/web/screen-engine/
  // collection-frame.tsx` keeps for its own `useFilterBar` call. A `<FilterBar>`
  // COMPONENT could mount and unmount freely with the loading state; a hook
  // cannot skip renders the same way.
  const loadedApps = appsQ.data ?? []
  const clientOptions = Array.from(
    new Set(loadedApps.filter((a): a is AppRow & { accountId: string } => Boolean(a.accountId)).map((a) => a.accountId))
  )
    .map((id) => ({ value: id, label: accountNames.get(id) ?? t("A client") }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const usedStages = new Set(loadedApps.map((a) => a.stage).filter((s): s is string => Boolean(s)))
  const stageOptions = APP_STAGES.filter((s) => usedStages.has(s.name)).map((s) => ({
    value: s.name,
    label: t(s.name),
  }))
  const facets: FilterFacet[] = [
    { field: "accountId", label: t("Client"), control: "select", options: clientOptions },
    { field: "stage", label: t("Stage"), control: "select", options: stageOptions },
  ]
  const sortOptions = APP_SORTS.map((o) => ({ ...o, label: t(o.label) }))

  // Searched FIRST, so the two tab badges count what the search left — a badge
  // saying 28 over a list showing 3 is R16's exact complaint, and the fact that
  // this split is counted in the browser does not excuse it from being honest.
  const needle = query.trim().toLowerCase()
  let matching = needle
    ? loadedApps.filter((a) => a.name.toLowerCase().includes(needle))
    : loadedApps
  // …THEN THE FACETS, same reason: the badges below must count what a facet
  // left too, not just what the search box left.
  if (facetValues.accountId) matching = matching.filter((a) => a.accountId === facetValues.accountId)
  if (facetValues.stage) matching = matching.filter((a) => a.stage === facetValues.stage)
  const narrowed = needle !== "" || Object.keys(facetValues).length > 0
  const active = matching.filter(appIsActive)
  const inactive = matching.filter((a) => !appIsActive(a))
  const preSort = tab === "inactive" ? inactive : active
  // …AND THE SORT LAST — it reorders what is left, it never narrows it, so it
  // has no business in the counts above. groupByStage still decides which
  // heading each tile lands under; this decides the order INSIDE one.
  const shown = [...preSort].sort((a, b) => compareApps(a, b, sort.by, accountNames, sort.dir))

  // CALLED UNCONDITIONALLY — `useFilterBar`'s own `{ pill, panel }` split
  // (v1.2.27), used below only once the data has actually loaded.
  const { pill: filterPill, panel: filterPanel } = useFilterBar({
    facets,
    values: facetValues,
    data: loadedApps,
    onChange: (field, value) =>
      setFacetValues((prev) => {
        const next = { ...prev }
        if (value === "") delete next[field]
        else next[field] = value
        return next
      }),
    onClearFacets: () => setFacetValues({}),
    resultCount: matching.length,
  })

  if (appsQ.error)
    return (
      <ShapeStateBody
        shape="collectionScreen"
        state="error"
        copy={{ errorTitle: t("Couldn't load the apps.") }}
        action={
          <Button variant="secondary" onClick={() => appsQ.refresh()}>
            {t("Try again")}
          </Button>
        }
      />
    )
  if (appsQ.data === undefined) return <Skeleton variant="list" lines={4} />

  // THE LIST VIEW'S ROWS — the SAME `shown` array Tiles renders below, shaped
  // once for `appsListRecipe` ("apps.list", web/lib/screens.ts). No second
  // fetch and no second narrowing pass: search, the facets and the sort above
  // already produced `shown`, and this is only ever a rendering of it.
  const listRows: Record<string, unknown>[] = shown.map((app) => {
    const client = app.accountId ? (accountNames.get(app.accountId) ?? t("A client")) : t("Ours")
    const stage = app.stage ? t(app.stage) : null
    return {
      id: app.id,
      // THE RECORD'S OWN FACE (R35) — the same picture-or-stage-mark
      // `AppMark` draws on the tile (app-tiles.tsx), built with `RecordMark`
      // directly rather than through that wrapper: `list-compat.tsx`'s
      // `leadingMarkFor` unwraps a `mark` field into the kit List's own
      // circular Avatar ONLY when the element's type is `RecordMark` itself
      // — every other list shaper in this file's own package (members,
      // roles, meetings…) makes the same call for the same reason. Through
      // `AppMark` this would still render, just doubly boxed.
      mark: <RecordMark picture={app.logoUrl} mark={appStageMark(app.stage)} name={app.name} size="row" />,
      name: app.active ? app.name : `${app.name} (archived)`,
      detail: [client, stage].filter(Boolean).join(" · ") || "—",
    }
  })
  // `withDataDrivenCollection` tunes the recipe's chrome to real data, then
  // its OWN search/filter/sort/count are switched off deliberately: the
  // ToolbarRow above is the one control surface for both views, and leaving
  // the engine's copies on would be a second, disconnected search box (and,
  // per R16, a second count — "Showing X of Y" beside the tab badge that
  // already carries the exact one).
  const listRecipeBase = withDataDrivenCollection(recipe, listRows)
  const listRecipe: ScreenRecipe = listRecipeBase.collection
    ? {
        ...listRecipeBase,
        collection: {
          ...listRecipeBase.collection,
          searchable: false,
          userFilter: false,
          sortable: false,
          showCount: false,
        },
      }
    : listRecipeBase

  const activeBadge = formatCount(active.length)
  const inactiveBadge = formatCount(inactive.length)
  const tabsConfig = {
    ...defaultTabsConfig,
    tabs: [
      { value: "active", label: t("Active"), icon: "app-window", badge: activeBadge, badgeVariant: "" as const },
      { value: "inactive", label: t("Inactive"), icon: "archive", badge: inactiveBadge, badgeVariant: "" as const },
    ],
  }

  return (
    // R16 ARBITRATION: the two tabs carry the split, so the heading stands down
    // rather than saying a third number two lines above them. Same shape as the
    // tasks screen's six views, and for the same reason.
    <CountedAbove active={activeBadge !== "" || inactiveBadge !== ""}>
    <div className="flex flex-col gap-6">
      <CollectionHeading sectionKey="apps" total={total} />

      <SectionWithCreate
        show={canCreate}
        label={t("Record an app")}
        icon="plus"
        onCreate={() => setAddOpen(true)}
        // Active and Inactive are one kind of record with a filter on it, which
        // is the kit's own test for the folder shape. `folderTabs` now draws
        // the tabs ALONE (client ruling, 2026-08-31, correcting the earlier
        // fix that shared this row with "Record an app") — the button moves
        // into the search row below instead, the toolbar this screen already
        // has.
        folderTabs={{ config: tabsConfig, value: tab, onValueChange: setTab }}
      >
        {/* THE TOOLBAR IS INSIDE THE CARD, BELOW THE TABS — the canonical
            shape (client ruling, 2026-08-31): a tab strip's own toolbar sits
            inside the SAME card as the rows it narrows, never on the base
            background between the strip and the card, and its own action
            button sits at the toolbar's right — never beside the tabs. The
            split is still computed over what the search left ("searched
            FIRST" above), so the box still narrows the collection and the
            tabs still divide what is left; only where the button is DRAWN has
            moved a second time.
            ONE ROW, ALWAYS (client ruling, 2026-09-01 — the toolbar spec
            Aurora approved that night): search, the filter chips, sort, then
            the create button pinned right, ALL through `<ToolbarRow>`
            (screen-bits.tsx). `filters` used to be a `<FilterBar>` drawn as
            this row's own sibling below it — the client's screenshot of
            exactly this screen ("Search apps… / Sort by / Name" on one row, a
            stranded dashed "Filter" chip under it) — so it is a slot of the
            row now instead of a second row beside it; its open panel is the
            separate `toolbarPanel` slot (v1.2.27's `useFilterBar` split).
            Options come from the WHOLE collection (see above), so narrowing
            by one facet never hides the other's choices. */}
        <ToolbarRow
          search={
            appsQ.data.length > 0 && (
              <SearchInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("Search apps…")}
                className="w-full"
              />
            )
          }
          filters={appsQ.data.length > 0 && filterPill}
          toolbarPanel={appsQ.data.length > 0 && filterPanel}
          sort={
            appsQ.data.length > 0 && (
              <SortControl
                options={sortOptions}
                value={sort.by}
                onValueChange={(by) => {
                  const opt = APP_SORTS.find((o) => o.value === by)
                  setSort({ by, dir: opt?.defaultDir ?? "asc" })
                }}
                direction={sort.dir}
                onDirectionChange={(dir) => setSort((s) => ({ ...s, dir }))}
                label={t("Sort by")}
                hideLabel
              />
            )
          }
          view={
            appsQ.data.length > 0 && (
              <ViewSwitch
                // TILES FIRST — CHECKLIST 8.1's own ruling, not the kit's
                // generic table-first default (see the state declaration
                // above and the file's header comment).
                views={[
                  { value: "tiles", label: t("Tiles"), icon: <SquaresFour size={16} /> },
                  { value: "list", label: t("List"), icon: <List size={16} /> },
                ]}
                value={view}
                onValueChange={(next) => setView(next as "tiles" | "list")}
                label={t("View")}
              />
            )
          }
          actions={canCreate && <AddButton label={t("Record an app")} onClick={() => setAddOpen(true)} />}
        />
        {shown.length === 0 ? (
          narrowed ? (
            <p className="text-muted-foreground text-sm">{t("No apps match that.")}</p>
          ) : tab === "inactive" ? (
            <p className="text-muted-foreground text-sm">{t("Nothing is finished or put away yet.")}</p>
          ) : (
            // GENUINELY EMPTY (no search, the Active tab): the kit's own
            // 27.21 register, not the plain sentence — there is no apps
            // import target (`workers/data-ops/src/lib/targets.ts` has none),
            // so this is "Add the first" alone, never a second button that
            // would point nowhere.
            <CollectionEmptyState
              title={t("No apps yet.")}
              onCreate={canCreate ? () => setAddOpen(true) : undefined}
            />
          )
        ) : view === "list" ? (
          // THE LIST BODY — the engine's own renderer, fed the identical
          // `shown` rows the tiles below draw, through the recipe already
          // handed to this screen (`recipe`, "apps.list"). `action={null}`
          // overrides the ambient create action `SectionWithCreate` publishes
          // above (`CollectionCreateActionProvider`) so the panel's own
          // toolbar draws no second + button — this screen's own AddButton,
          // in the ToolbarRow above, is the one mango for the act.
          <CollectionCreateActionProvider action={null}>
            <ScreenRenderer
              recipe={listRecipe}
              data={{ rows: listRows }}
              rights={rights}
              onAction={onAction}
              onIntent={onIntent}
              useKitPanel
            />
          </CollectionCreateActionProvider>
        ) : (
          <div className="flex flex-col gap-12">
            {groupByStage(shown).map((group) => (
              <section key={group.stage} className="flex flex-col gap-4">
                <h2 className="text-lg font-medium">{t(group.stage)}</h2>
                <AppTiles apps={group.apps} accountNames={accountNames} />
              </section>
            ))}
          </div>
        )}
      </SectionWithCreate>

      {/* R14: BOUNDED, not paged — an agency has tens of apps, not thousands.
          The collection that grows underneath is the process maps. */}

      <AppFormDialog
        members={members}
        open={addOpen}
        onOpenChange={setAddOpen}
        teamId={teamId}
        accounts={(accountsQ.data ?? [])
          .filter((a) => a.active && a.accountType === "entity")
          .map((a) => ({ id: a.id, name: a.name }))}
        draftKey={`app:add:${teamId}`}
        onSubmit={(v) => createAppFrom(teamId, v, t)}
      />
    </div>
    </CountedAbove>
  )
}
