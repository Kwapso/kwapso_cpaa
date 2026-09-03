"use client"

// THE TICKETS SCREEN — one tab strip, one collection, and a triage queue.
//
// It lived inside the deep-link host's collection switch, which was fine while it
// was one strip. CHECKLIST 5.1 added a second ("sub-tabs by TYPE beneath the
// existing All / My / Archived strip") and 5.11 added a queue that is not a
// filter of the list at all, and both needed state of their own — so this is a
// component rather than a branch. The host renders it and hands over the things
// only the host knows: the recipe, the rights, and the two action callbacks.
//
// ── THE REDESIGN, 2026-08-31 ─────────────────────────────────────────────────
//
// This screen used to stack TWO folder tab strips (CHECKLIST 5.1's own
// description above is the fossil of that: "sub-tabs … beneath the existing …
// strip"). The owner had ruled, 2026-08-28, to keep both rather than move one
// into the toolbar ("there's no way out .. lets' keep 2 tabs but both as the
// folder tabs" — `web/test/rules.test.ts`'s `TWO_STRIPS_OK` carried that
// ruling). The CLIENT overruled it the next business day, verbatim: "there can
// never be 2 rows of tabs, no folder tabs, no line tabs. just never." Not a
// narrower version of the 28 Aug ruling — the opposite of it — so this is a
// genuine redesign, not a spacing fix.
//
// WHAT THE TWO STRIPS WERE ASKING were always two different questions:
//
//   the OLD OUTER strip was WHOSE and WHERE — All tickets / Archived, a raiser-
//   scope-turned-VIEW the door has answered as a server scope since tickets
//   started paging;
//
//   the strip that REMAINS is WHAT KIND and HOW FAR ALONG — Ready, then one tab
//   per live `Ticket type` value, then Closed, then All. DERIVED from the
//   team's own vocabulary rather than hard-coded: deactivating "Bug" on the
//   Dropdown values screen takes its tab away, and adding a word adds one.
//
// THREE SHAPES WERE ON THE TABLE. (a) fold Archived in as one more value on the
// remaining strip — rejected, because Archived is orthogonal to kind/stage (an
// archived ticket can be any type, at any stage) and folding it in as a sibling
// of Ready/Issue/Closed would have made "archived Ready tickets" unreachable,
// a real capability the two stacked strips already gave away. (b) move it to
// the toolbar as a plain control — too vague to be a decision. What shipped is
// closer to (c): Archived becomes a real FILTER (`COLLECTION_FILTERS.help`,
// field `view`), the exact shape Accounts' own "Archived" toggle already uses
// beside its Companies/All tab (`web/lib/collection-filters.ts`) — so scope and
// kind/stage stay two REAL, independently-askable questions, just never drawn
// as two tab strips. A tab and a filter compose for free through
// `<PagedFind>`'s own `query` object (paged-find.tsx), so "archived Ready
// tickets" is still one search away, through the toolbar's Filter control
// rather than a second folder strip.
//
// THE TOOLBAR MOVES INSIDE THE CARD, the other half of the same client note
// (verbatim on a screenshot of THIS screen: the search/sort sat on the base
// background, above the peachy panel holding the rows). Accounts hit the
// identical defect the same day and fixed it the identical way
// (`collection-content.tsx`, `accountTabs`): `<PagedFind>`'s `wrap` boxes the
// toolbar AND the rows in one `CollectionCard`, and the tab strip sits directly
// above it with zero gap. Before v1.2.28 that gap had to stay zero so the
// folder tab's own pulled-down feet (`--folder-tab-overlap`) melted into the
// card rather than showing on the base background; the folder shape is gone
// now (tabs-view.tsx's own header has the client's 2026-09-02 ruling) and the
// flush join is kept on its own merits. Tickets and Accounts draw the same
// join.
//
// THE TOOLBAR GAINS A FILTER AND A CREATE BUTTON, the two pieces the old
// search-and-sort-only bar was missing next to Accounts' fixed one: the
// Archived filter above, and a "Raise ticket" button beside the tab row where
// Accounts' New/Import/Export row sits. There is no Export/Import button here
// because there is no export or import door for tickets (SCOPE ch.07 — a
// ticket is a conversation, not an importable record; `internal-money.ts`'s
// neighbour AGENTIC-IMPORT.md says the same about what earns a target). A
// "view selector" beyond the tab strip and the Archived filter is not drawn
// either. The kit's own `ViewSwitch` (`shared/ui/components/collection-frame/
// view-switch.tsx`) is genuinely reached elsewhere now (Apps' Tiles/List,
// Waves' List/Timeline, 1 Sep 2026) — the reason it stays off THIS screen is
// that a ticket has no second real way to look at the same rows, not that
// the control is unproven. A Board grouped by `status` was analysed and
// flagged as real future work (per-status paged reads, an R16 arbitration
// question), not a "no view exists yet" gap.
//
// Every narrowing is still the DOOR's (R14 + R16). Filtering the loaded page
// would answer "the questions among the newest fifty" while the badge above
// counted all of them, which is the failure R16 exists for and the one a
// manager reported as "filter by type, the count doesn't change".
//
// AND ONE TAB IS STILL NOT A FILTER. "Triage" swaps the collection for the
// queue of requests nobody has read — and the DOOR decides whether this caller
// is given that queue at all (CHECKLIST 5.11: only the person on duty sees
// it). A screen that hid a list it had already been handed would be a
// curtain, not a rule.

import * as React from "react"

import { Text } from "@shared/ui/components/typography/typography"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { SearchInput } from "@shared/ui/components/search-input/search-input"
import { defaultTabsConfig, renderFolderTabs } from "@shared/web/screen-engine/tabs-view"
import { CollectionCreateActionProvider } from "@shared/web/screen-engine/collection-frame"
import { ShapeStateBody } from "@shared/ui/compositions/states/states"
import { useRemembered } from "@shared/web/remembered"
import { Button } from "@shared/ui/components/button/button"
import { toast } from "@shared/ui/components/sonner/sonner"
import { ScreenRenderer, type ScreenActionContext, type ScreenIntent } from "@shared/web/screen-engine/screen-renderer"
import type { ScreenRecipe, ScreenRights } from "@shared/web/screen-engine/recipe"
import { Alarm, ArrowUpRight, EnvelopeOpen, PencilSimple, Plus, PaperPlaneTilt } from "@shared/ui/foundations/icons"

import { CollectionHeading } from "@/components/collection-heading"
import { CountedAbove } from "@/components/counted-tabs"
import { LoadMore } from "@/components/load-more"
import { PagedFind } from "@/components/paged-find"
import { COLLECTION_SORTS, translatedSorts } from "@/lib/collection-sorts"
import { translatedFacets } from "@/lib/collection-filters"
import { AddButton, CollectionCard, EmptyLine, ToolbarRow } from "@/components/deep-link/screen-bits"
import { TriageStrip } from "@/components/triage-strip"
import { TicketStagesCard, TicketsByAccountCard } from "@/components/pulse"
import { CONCEPT_ICON } from "@/lib/pages"
import { tenancy } from "@/lib/api/tenancy"
import { MARK_GROUP, markMap } from "@/lib/type-marks"
import { shapeHelpList } from "@/components/deep-link/shape"
import { ApiFailure, content as contentApi } from "@/lib/api"
import type { TriageWaiting } from "@/lib/api/content"
import type { TriageGap } from "@shared/triage-readiness"
import { HelpFormDialog } from "@/components/help-form-dialog"
import { TriageReplyDialog } from "@/components/triage-reply-dialog"
import {
  accountsKey,
  appModulesKey,
  helpFacetFilter,
  helpFacetKey,
  helpKey,
  listFetch,
  totalKey,
  triageKey,
  type HelpFacet,
} from "@/lib/live-resources"
import { withDataDrivenCollection } from "@/lib/screens"
import { formatCount } from "@shared/web/format-count"
import { formatRelative } from "@shared/web/format"
import { primeCache, invalidate,
  mergePage, useCached, useCachedValue } from "@shared/web/store"
import { useLanguage, useT } from "@shared/web/language"
import type { Account, AppModule, HelpTicket, SelectableValue } from "@shared/types"
import { richTextPlain } from "@shared/web/rich-text"

/** The two facets that are STAGES rather than kinds, and the tab each one is.
 * Named here so the strip's shape is readable in one place: Ready first because
 * it is the pile somebody should act on, Closed last because it is the pile
 * nobody should. */
const READY: HelpFacet = "status:ready"
const CLOSED: HelpFacet = "status:resolved"
const TRIAGE: HelpFacet = "triage"
const ALL: HelpFacet = "all"
/** THE ONE OTHER NON-NARROWING TAB, following Triage's own precedent (the
 * file header, "THE REDESIGN, 2026-08-31"): a different screen wearing the
 * same strip, not a filter of the list. `helpFacetFilter` already returns `{}`
 * for any value it doesn't recognise, so this needs no change there — only
 * the render switch below and the `narrowed` check needed to know about it. */
const DASHBOARD: HelpFacet = "dashboard"

export function TicketsCollection({
  teamId,
  recipe,
  rights,
  helpTypeOptions,
  totals,
  can,
  onCreate,
  onAction,
  onIntent,
}: {
  teamId: string
  recipe: ScreenRecipe
  rights: ScreenRights
  /** the team's live `Ticket type` values — the tab strip is built from these */
  helpTypeOptions: string[]
  totals: { help?: number }
  can: (module: string, right: "read" | "create" | "edit" | "delete") => boolean
  onCreate: () => void
  onAction: (actionId: string, ctx: ScreenActionContext) => void
  onIntent: (intent: ScreenIntent) => void
}) {
  const t = useT()
  // Which type of ticket she was looking at, remembered with the rest of the
  // screen — the sub-tab is as much "where she was" as the search box under it.
  const [facet, setFacet] = useRemembered<HelpFacet>("ticket-facet", ALL)
  // TRIAGE'S OWN SEARCH lives INSIDE `TriageQueue` now (R50): the toolbar
  // above it has to answer "is the queue empty" to know whether to draw
  // itself at all, and only `TriageQueue` — which fetches the queue — ever
  // knows that. See its own header comment.

  // The team's own glyphs, scanned once for the whole strip rather than once
  // per tab. The vocabulary is a cache this screen's siblings already hold and
  // the live registry keeps current, so an emoji edited on the Dropdown values
  // screen repaints these tabs on the next ping.
  const selectableQ = useCached<SelectableValue[]>(`selectable:${teamId}`, () =>
    tenancy.selectable().then((r) => r.values)
  )
  const ticketMarks = markMap(selectableQ.data, MARK_GROUP.ticket)
  // THE TWO NEW TOOLBAR FACETS (Client, Module) — read unconditionally, like
  // Processes' own `appId` facet reads `appsKey` (processes-screen.tsx), because
  // narrowing by either is a READ act available to anyone who can see this
  // screen at all, not something gated behind creating a ticket. Modules are a
  // BOUNDED, whole-team read (help-form-dialog.tsx reads the identical
  // `appModulesKey` the same way, for the same reason: "a team's systems, not a
  // feed"). Accounts is the one with a real caveat: `tenancy.accounts()` is
  // page ONE of a GROWING_COLLECTIONS list (R14) — exactly the defect
  // help-form-dialog.tsx's own account picker was rewritten off of ("offered
  // the newest fifty companies and had no opinion about the rest"). This facet
  // inherits that same limitation rather than fixing it: a live, searched
  // facet option list is a capability no facet control in this app has today
  // (shared/web/screen-engine/filter-bar.tsx's own header says the async
  // option-provider was removed as dead code, and — since 2 Sep 2026 — that a
  // facet is a compact `Select`, which scrolls and type-aheads but does not
  // search; re-adding a searched one is outside this fix's remit). Filed as a
  // known gap rather than silently shipped as if it were complete.
  const accountsQ = useCached<Account[]>(accountsKey(teamId), () =>
    tenancy.accounts().then((r) => r.accounts)
  )
  const modulesQ = useCached<AppModule[]>(appModulesKey(teamId), () =>
    tenancy.appModules().then((r) => r.modules)
  )
  // THE RESTING CACHE — always the LIVE list now that Archived has moved off a
  // tab and onto the toolbar's Filter (see the header comment). It never holds
  // archived rows: those are an ACTIVE question, asked through `<PagedFind>`'s
  // own `facets` below exactly the way a search or a sort already is, so they
  // land in that find's own cache key rather than a resting one here.
  const allQ = useCached<HelpTicket[]>(helpKey(teamId, "all"), () => listFetch.help(teamId))
  // …and ONE more for whichever sub-tab is open. DASHBOARD is excluded for the
  // same reason TRIAGE is: neither narrows the list, both swap in a different
  // screen, so neither should open a facet read of its own.
  const narrowed = facet !== ALL && facet !== TRIAGE && facet !== DASHBOARD
  const facetQ = useCached<HelpTicket[]>(
    narrowed ? helpFacetKey(teamId, "all", facet) : null,
    () => listFetch.helpFacet(teamId, "all", facet)
  )
  // R16: every badge on the strip is the door's own grouped COUNT(*), primed by
  // whichever ticket read ran last and counted over the list IGNORING the kind
  // and stage facets — so opening "Questions" does not make every other badge
  // read zero.
  const byType = useCachedValue<Record<string, number>>(`help-by-type:${teamId}`)
  const byStatus = useCachedValue<Record<string, number>>(`help-by-status:${teamId}`)

  const scopedQ = narrowed ? facetQ : allQ
  // The list key is written out at BOTH call sites below rather than held in a
  // variable: the paging and search checks read the JSX and look for the key the
  // door's own page lands in (`helpKey(`), which is the honest thing to look for
  // — a variable could be anything by the time it reaches the prop.
  const facetTotal = useCachedValue<number>(
    totalKey(`help-facet:all:${facet}`, teamId)
  )
  const scopeTotal = totals.help
  const shownTotal = narrowed ? facetTotal : scopeTotal

  // THE ONE STRIP LEFT (2026-08-31's redesign — see the file header). Ready,
  // then a tab per live ticket type, then Closed, then All — and Triage on the
  // end, which is a different screen rather than a narrower list. Archived
  // used to be a second strip above this one; it is a toolbar Filter now
  // (`COLLECTION_FILTERS.help`, below), because it narrows a different, ORTHOGONAL
  // question — a ticket's stage in the archive, not its kind or lifecycle stage.
  const tabsConfig = {
    ...defaultTabsConfig,
    // Tickets is a collection on a main screen, and this is now its ONLY
    // strip — the one shape a tab strip draws anywhere in the app since
    // v1.2.28 (Tasks, Sprints, Apps, Accounts included; tabs-view.tsx's own
    // header has the ruling). Inherited rather than spelled: `defaultTabsConfig`
    // already is it.
    tabs: [
      { value: READY, label: t("Ready"), icon: "", badge: formatCount(byStatus?.ready), badgeVariant: "" as const },
      // THE TEAM'S OWN MARK, at last. `TabItem.icon` took a lucide NAME until
      // library v0.11.0 and drew nothing for a pictograph, so ⚠️ beside Issue and
      // ❓ beside Question were stored on the dropdown row and rendered on no tab
      // — the owner edited an emoji and watched it change nowhere. It is a NODE
      // now, and the glyph comes from the vocabulary rather than from a map here,
      // so a team that renames a type or picks a new emoji is obeyed without a
      // deploy. A type with no mark passes "" and the tab is the word alone,
      // exactly as before.
      ...helpTypeOptions.map((v) => ({
        value: `type:${v}`,
        label: v,
        icon: ticketMarks.get(v) ?? "",
        badge: formatCount(byType?.[v]),
        badgeVariant: "" as const,
      })),
      { value: CLOSED, label: t("Closed"), icon: "", badge: formatCount(byStatus?.resolved), badgeVariant: "" as const },
      { value: ALL, label: t("All"), icon: "", badge: formatCount(scopeTotal), badgeVariant: "" as const },
      // THE OTHER NON-NARROWING TAB (2026-09-01, beside Triage below): the
      // Opus-analysis dashboard — which client is generating the most work,
      // and where the tickets are sitting. No badge, for the same reason
      // Triage carries none — it is not a count of a narrower slice of THIS
      // list, so a number here would be R16's exact violation (a collection's
      // count shown more than once).
      { value: DASHBOARD, label: t("Dashboard"), icon: CONCEPT_ICON.dashboard, badge: "", badgeVariant: "" as const },
      // The one tab on this strip whose idea has a concept icon of its own. The
      // four KIND tabs beside it carry the team's own type MARKS on every other
      // surface (a ticket's header band, its detail) and cannot carry one here:
      // `TabsView` resolves `icon` as a lucide NAME, so a pictograph in that slot
      // Triage's own idea has a CONCEPT icon (a lucide name), which the same
      // prop still resolves — a string is read as a name and a node is drawn as
      // given, so the two kinds of mark sit on one strip without either being
      // written into a LABEL, the one shape UI-CONVENTIONS §5 refuses.
      { value: TRIAGE, label: t("Triage"), icon: CONCEPT_ICON.triage, badge: "", badgeVariant: "" as const },
    ],
  }

  const canCreateTicket = can("help", "create")

  return (
    <CountedAbove active={formatCount(totals.help) !== ""}>
      <div className="flex flex-col gap-6">
        <CollectionHeading sectionKey="tickets" total={shownTotal} />
        {/* ONE STRIP, DRAWN THROUGH THE ONE SEAM — the client's 2026-08-31
            rulings, both on this exact screen: "there can never be 2 rows of
            tabs … just never", "toolbar must be inside of card background",
            and — once "Raise ticket" had moved to share the tab row — "never
            align the button with the tabs … that button belongs in the right
            of the toolbar, part of the toolbar". So the strip carries nothing
            but the tabs.

            IT GOES THROUGH `renderFolderTabs` NOW, 2026-09-03, and that is the
            whole of this screen's share of the client's spacing ruling ("go and
            uniform that … don't hard-code page by page, but rather you change
            the rule and you apply it everywhere"). This was the fourth
            collection strip in the app and the only one drawing its own bare
            `<TabsView>`: `SectionWithCreate`'s `folderTabs` slot (apps,
            sprints, tasks) and `PagedFind`'s `tabs` (accounts, contacts,
            meetings, and this screen's own rows below) both go through
            `renderFolderTabs`, which is where the sticky rule and the
            tab-to-content gap live. Drawing its own strip meant Tickets was
            the one main screen whose tabs did NOT pin on scroll, and the one
            place a fourth copy of the gap would have had to be written by
            hand. Same three arguments, one seam, and the difference disappears
            rather than being maintained. */}
        <div className="flex flex-col">
          {renderFolderTabs({ config: tabsConfig, value: facet, onValueChange: (v) => setFacet(v as HelpFacet) })}

          {facet === TRIAGE ? (
            <CollectionCard>
              {/* THE TOOLBAR, WITH ITS OWN SEARCH — CLIENT RULING, 2026-09-03,
                  SUPERSEDING THE "BUTTON ONLY" NOTE THIS USED TO CARRY. Triage
                  still has no `<PagedFind>` to share a search box with (it is
                  a small, whole-team-fetched queue, not a paged door read) —
                  but "no shared box" is a reason to draw its own, not a
                  reason to draw none, and "Raise ticket" still lives below
                  the tabs rather than beside them (client ruling, 2026-08-31).
                  DRAWN BY `TriageQueue` ITSELF NOW, NOT HERE (R50, 2026-09-03
                  second pass) — this component only ever knows whether the
                  reader is ON triage, never whether the queue they'd be
                  searching has anything in it, so the toolbar used to render
                  regardless, a lone "Raise ticket" pill above an empty queue
                  and no message at all for whoever was not on duty this week.
                  `TriageQueue` fetches the queue, so it is the one place that
                  can answer "is it empty" honestly — see its own header. */}
              <TriageQueue
                teamId={teamId}
                canTriage={can("help", "edit")}
                canEdit={can("help", "edit")}
                helpTypeOptions={helpTypeOptions}
                canCreateTicket={canCreateTicket}
                onCreate={onCreate}
                // The engine's open intent carries a URL SEGMENT, not a permission
                // module — its only consumer builds an address out of it
                // (deep-link-screen.tsx). Everywhere else in the app the two words
                // are the same string, so passing `help` here looked right and
                // produced `/help/<id>`, which is not a route: triage's Open button
                // answered 404 for as long as the tab has existed. `tickets` is the
                // segment; MODULE_PERMISSION is where it becomes `help` again.
                onOpen={(id) => onIntent({ kind: "open", module: "tickets", id })}
              />
            </CollectionCard>
          ) : facet === DASHBOARD ? (
            /* THE DASHBOARD (2026-09-01) — two charts and no numbers (R16: a
               tab strip badge and a stat tile would both be counting the same
               collection twice). Tickets by client is the door's own
               `byAccount` facet, never drawn before tonight; Where the
               tickets are sitting is `TicketStagesCard`, MOVED here from
               below the list (see the note there) rather than duplicated. */
            <CollectionCard>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <TicketsByAccountCard teamId={teamId} />
                <TicketStagesCard teamId={teamId} />
              </div>
            </CollectionCard>
          ) : scopedQ.error ? (
            <CollectionCard>
              <ShapeStateBody
                shape="collectionScreen"
                state="error"
                copy={{ errorTitle: t("Couldn't load the tickets.") }}
                action={
                  <Button variant="secondary" onClick={() => scopedQ.refresh()}>
                    {t("Try again")}
                  </Button>
                }
              />
            </CollectionCard>
          ) : scopedQ.data === undefined ? (
            <CollectionCard>
              <Skeleton variant="list" lines={4} />
            </CollectionCard>
          ) : (
            <PagedFind<HelpTicket>
              listKey={narrowed ? helpFacetKey(teamId, "all", facet) : helpKey(teamId, "all")}
              placeholder={t("Search tickets…")}
              matches={{
                none: t("No tickets match"),
                one: t("1 ticket matches"),
                many: t("{count} tickets match"),
              }}
              sorts={translatedSorts("help", t)}
              defaultSort={COLLECTION_SORTS.help.defaultSort}
              // R50 — whichever tab is open, `scopedQ` is its own resting read
              // (the "all" list, or the sub-tab's own facet read), so this is
              // the one honest "is THIS tab's collection empty" answer.
              restingEmpty={scopedQ.data.length === 0}
              // CLIENT, MODULE, ARCHIVED — the toolbar spec Aurora approved
              // overnight (2026-09-01) names Client and Module as the ticket
              // screen's own worked example of "real filter facet chips"; the
              // Status select the old frame drew is still gone (the tab strip
              // above still narrows kind/stage AT THE DOOR — spread into
              // `fetchPage` below, NOT through `facets`, so there are never two
              // controls asking the same field — "the Accounts tab is a bit
              // confusing"). All three are rows/options `COLLECTION_FILTERS.help`
              // now declares; Client and Module are filled in from the accounts
              // and modules this screen reads above, Archived is the closed
              // `view` vocabulary it always was.
              facets={translatedFacets("help", t, {
                accountId: (accountsQ.data ?? [])
                  .filter((a) => a.active)
                  .map((a) => ({ value: a.id, label: a.name })),
                moduleId: (modulesQ.data ?? [])
                  .filter((m) => m.active)
                  .map((m) => ({ value: m.id, label: `${m.appName} · ${m.name}` })),
              })}
              // "RAISE TICKET", AT THE RIGHT OF THE TOOLBAR — PagedFind's own
              // `actions` slot (client ruling, 2026-08-31). No Export/Import
              // beside it: unlike Accounts, tickets has no export or import
              // door (a ticket is a raised conversation, not an importable
              // record — AGENTIC-IMPORT.md), so there is nothing else to draw.
              actions={() => (canCreateTicket ? <AddButton label={t("Raise ticket")} onClick={onCreate} /> : null)}
              // The tab strip's own kind/stage narrowing is NOT `fixed`, and the
              // difference matters: `fixed` makes a find ACTIVE unconditionally,
              // and this strip is already in `listKey` above — passing it here
              // too would move the RESTING screen into a `find:` cache key the
              // live registry does not patch (R15), for no gain. The Archived
              // filter above has no such cost: untouched, a facet contributes
              // nothing to `query`, so the resting cache stays exactly as live
              // as it was before this toolbar could ask it anything.
              fetchPage={(query, cursor) =>
                contentApi
                  .help({
                    // The strip's own choice, then whatever the toolbar is
                    // asking (search, sort, the Archived filter) spread whole
                    // over it: `listQuery` forwards every key, so a narrowing
                    // cannot be lost between these controls and the door.
                    scope: "all",
                    view: "live",
                    ...helpFacetFilter(facet),
                    ...query,
                    cursor,
                  })
                  .then((r) => ({ rows: r.tickets, nextCursor: r.nextCursor, total: r.total }))
              }
              // THE ONE CARD — toolbar, then rows — the same join Accounts draws
              // (`collection-content.tsx`'s own `wrap`): zero gap to the tab row
              // above, which is this component's own flex column rather than a
              // second `gap-*` here.
              wrap={(inner) => <CollectionCard>{inner}</CollectionCard>}
            >
              {(found) => {
                const rows = found.active ? found.rows : scopedQ.data
                if (rows === null || rows === undefined) return <Skeleton variant="list" lines={4} />
                const data = shapeHelpList(rows, ticketMarks)
                const listRecipe = withDataDrivenCollection(recipe, data.rows ?? [], found.emptyText)
                return (
                  // THE SAME ACTION, PUBLISHED DOWNWARDS (screen-bits.tsx's own
                  // `SectionWithCreate` does this identically) — the create
                  // button now lives in the toolbar above; the engine's
                  // zero-state still needs to name the next act.
                  <CollectionCreateActionProvider
                    action={
                      canCreateTicket
                        ? { label: t("Raise ticket"), icon: <Plus className="size-4" />, onCreate }
                        : null
                    }
                  >
                    {/* No `useKitPanel`: `CollectionCard` above (drawn by `wrap`)
                        is the ONE box now — Accounts dropped it for the same
                        reason the same day ("the broken combination",
                        screen-bits.tsx's own doc on `CollectionCard`). */}
                    <ScreenRenderer
                      recipe={listRecipe}
                      data={data}
                      rights={rights}
                      onAction={onAction}
                      onIntent={onIntent}
                      band={
                        // ARCHIVED IS A QUESTION NOW, not a screen this
                        // component sits on — so this band reads the ACTIVE
                        // question (the same `queryString` the Accounts export
                        // href narrows by) rather than a second copy of the
                        // toolbar's own state.
                        found.queryString.includes("view=archived") ? (
                          <Text as="p" size="sm" tone="secondary">
                            {t(
                              "Archived tickets keep their history and stay searchable. They don't count toward the figures above."
                            )}
                          </Text>
                        ) : undefined
                      }
                    />
                    <LoadMore
                      listKey={
                        found.listKey ??
                        (narrowed ? helpFacetKey(teamId, "all", facet) : helpKey(teamId, "all"))
                      }
                      label={t("Load more tickets")}
                      fetchPage={found.fetchPage}
                    />
                  </CollectionCreateActionProvider>
                )
              }}
            </PagedFind>
          )}
        </div>

        {/* THE ONE PANEL THAT IS NOT THE LIST, and it is UNDER it now. WHOSE
            WEEK IT IS was written above the list because "it is the sentence a
            person needs before they look, and a page they have to go and open
            is a page nobody opens" (BUILD-1 §6). The person came for the list,
            so the list comes first and this is a scroll away, which the owner
            explicitly asked people to be happy to do. Nothing is hidden,
            nothing is conditional on who is reading.

            WHERE THE WORK IS SITTING used to render here too (N2's original
            complaint: a reader crossed FIVE blocks — a duty band, a stage
            chart, the tab strip, the search bar and an action row — before
            reaching the list itself). It moved to the Dashboard tab
            (2026-09-01, alongside the new Tickets-by-client chart): a chart
            about the whole pipeline is a screen's worth of its own, the same
            argument that already gave Triage's queue a tab rather than a
            panel here, so it is absent on Dashboard's own tab (a screen does
            not repeat its own reason for being one) and on Triage's, same as
            before. */}
        {facet !== TRIAGE && facet !== DASHBOARD && (
          <TriageStrip teamId={teamId} canSetDuty={can("help", "edit")} />
        )}
      </div>
    </CountedAbove>
  )
}

/** THE TRIAGE QUEUE (CHECKLIST 5.11) — the requests nobody has read, and the one
 * act that moves them along.
 *
 * "Only the person on duty sees what is waiting to be triaged" is enforced by the
 * DOOR: it answers `yours` and hands back an empty list to anybody else. This
 * component renders what it was given and says plainly why it is empty, which is
 * the honest shape — a screen cannot keep a secret it has been told.
 *
 * "Mark it read" is the one judgement in the whole ticket lifecycle that nothing
 * can infer. Every stage after it happens by itself. */
function TriageQueue({
  teamId,
  canTriage,
  canEdit,
  helpTypeOptions,
  canCreateTicket,
  onCreate,
  onOpen,
}: {
  teamId: string
  canTriage: boolean
  canEdit: boolean
  helpTypeOptions: string[]
  /** present = the reader may raise one, and this opens the form — the
   * toolbar's own "Raise ticket" button, moved in from the parent along with
   * the toolbar itself (see the header comment on why). */
  canCreateTicket: boolean
  onCreate: () => void
  onOpen: (id: string) => void
}) {
  const { t, lang } = useLanguage()
  const triageQ = useCached(triageKey(teamId), () => contentApi.triage())
  const [busy, setBusy] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState<TriageWaiting | null>(null)
  const [replying, setReplying] = React.useState<TriageWaiting | null>(null)
  // THE QUEUE'S OWN SEARCH — moved in from the parent (R50, 2026-09-03 second
  // pass): the toolbar this narrows and the row count that gates it now live
  // in the same component, so "never toolbar on empty collection" can be
  // answered honestly instead of drawn unconditionally one component up from
  // the fetch that actually knows.
  const [query, setQuery] = React.useState("")

  /** WHAT THE ROW IS STILL MISSING, in the reader's own language. The gaps
   * themselves are decided by the door (shared/triage-readiness.ts) and arrive
   * as machine words; only the wording is chosen here, because a worker's
   * strings are outside the translation catalogue and a screen's are not. */
  const GAP_WORD: Record<TriageGap, string> = {
    type: t("a ticket type"),
    client: t("a client"),
    app: t("an app"),
    raisedBy: t("who raised it"),
  }

  async function markRead(id: string) {
    setBusy(id)
    try {
      const r = await contentApi.triageRead(id)
      invalidate(triageKey(teamId))
      // The door returns the fresh page — merge it (round-two speed review).
      mergePage(helpKey(teamId, "all"), "id", r.tickets as unknown as Record<string, unknown>[])
      if (r.byType) primeCache(`help-by-type:${teamId}`, r.byType)
      if (r.byStatus) primeCache(`help-by-status:${teamId}`, r.byStatus)
      if (r.byAccount) primeCache(`help-by-account:${teamId}`, r.byAccount)
      toast.success(t("Marked as read."))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't do that."))
    } finally {
      setBusy(null)
    }
  }

  /** Edit the ticket without leaving the queue. The SAME dialog and the SAME
   * door the ticket's own screen uses — triage was the one place in the app that
   * could see a request and not change it, which is what made the readiness rule
   * feel like a wall rather than a step. */
  async function saveEdit(input: {
    description: string
    helpType?: string
    accountId?: string
    appId?: string
    moduleId?: string
    raisedByContactId?: string
  }) {
    if (!editing) return
    const { tickets, byType, byStatus, byAccount } = await contentApi.updateHelp({ id: editing.id, ...input })
    invalidate(triageKey(teamId))
    // The door's response IS the fresh first page — this used to be thrown
    // away and the same ~1s five-read rebuild fetched again one frame later.
    // Merged by id so rows scrolled in past page one survive the patch.
    mergePage(helpKey(teamId, "all"), "id", tickets as unknown as Record<string, unknown>[])
    // …and the facet badges from the same response — merging the rows while
    // the strip's counts stayed stale left the editor's own tabs lying
    // (round-two realtime review).
    if (byType) primeCache(`help-by-type:${teamId}`, byType)
    if (byStatus) primeCache(`help-by-status:${teamId}`, byStatus)
    if (byAccount) primeCache(`help-by-account:${teamId}`, byAccount)
    toast.success(t("Ticket updated."))
  }

  /** Answer it without leaving the queue. The same door the ticket's own thread
   * posts through — this is a shorter route to it, not a second one. */
  async function sendReply(body: string) {
    if (!replying) return
    await contentApi.replyHelp(replying.id, body)
    // A reply re-sorts one ticket to the top; the row-level live ping the door
    // publishes patches that. The full-list refetch here paid the whole
    // five-read rebuild to move one row.
    toast.success(t("Reply sent."))
  }

  if (triageQ.data === undefined) return <Skeleton variant="list" lines={3} />
  const view = triageQ.data
  // GENUINELY EMPTY, TWO WAYS — NEITHER DRAWS THE TOOLBAR (R50: never toolbar
  // on empty collection). Whoever is not on duty has no rows of THEIRS to
  // search or raise a ticket over from here; a real empty queue has nothing
  // to search either. Only once there is at least one waiting row does the
  // toolbar (search + "Raise ticket") appear at all — which is also why it
  // has to live in this component rather than the parent: the parent knows
  // neither of these two facts.
  if (!view.yours)
    return (
      <p className="text-muted-foreground text-sm">
        {view.onDuty?.userName
          ? `${view.onDuty.userName} is on triage this week, so the queue is theirs.`
          : t("Nobody is on triage this week.")}
      </p>
    )
  if (view.waiting.length === 0)
    return <EmptyLine concept="triage">{t("Nothing has been sitting unread. ")}</EmptyLine>

  // THE TOOLBAR'S SEARCH, APPLIED — the row's own reference and description
  // are the two facts already on screen, so a query narrows by either. This
  // is the separate, ordinary "your search matched nothing" case — the
  // toolbar (with its search box) stays up so it can be cleared or changed,
  // exactly as `narrowed` does everywhere else in the app.
  const narrowed = query.trim() !== ""
  const q = query.trim().toLowerCase()
  const waiting = narrowed
    ? view.waiting.filter(
        (w) => (w.ref ?? "").toLowerCase().includes(q) || richTextPlain(w.description).toLowerCase().includes(q)
      )
    : view.waiting

  return (
    <>
      <ToolbarRow
        // Reached this line only past both genuinely-empty returns above, so
        // the queue always has at least one waiting row here.
        empty={false}
        search={
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery("")}
            placeholder={t("Search the triage queue…")}
            className="w-full"
          />
        }
        actions={canCreateTicket && <AddButton label={t("Raise ticket")} onClick={onCreate} />}
      />
      {waiting.length === 0 ? (
        <EmptyLine concept="triage">{t("No entries in the triage queue match your search.")}</EmptyLine>
      ) : (
    <ul className="divide-border divide-y">
      {waiting.map((w) => (
        <li key={w.id} className="flex flex-wrap items-center gap-2 py-3">
          <Alarm className="text-destructive size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm">
              {[w.ref, richTextPlain(w.description)].filter(Boolean).join(" · ")}
            </span>
            {/* WHY IT CANNOT MOVE, said on the row. A ticket used to sit here
                with a button that would fail and no explanation — the owner
                asked for a pre-triage state, and what was actually missing was
                never a state but a REASON. */}
            {w.missing.length > 0 && (
              <span className="text-muted-foreground block truncate text-xs">
                {t("Needs {gaps} before it can be triaged", {
                  gaps: w.missing.map((g) => GAP_WORD[g]).join(", "),
                })}
              </span>
            )}
          </div>
          <span className="text-muted-foreground text-xs tabular-nums">
            {t("{days} days · {when}", { days: w.days, when: formatRelative(w.createdAt, t, lang) })}
          </span>
          {/* ICON-ONLY (client ruling, 2026-08-31: "edit, only the pencil icon"). */}
          {canEdit && (
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setEditing(w)}
              className="shrink-0"
              aria-label={t("Edit")}
            >
              <PencilSimple className="size-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReplying(w)}
            className="shrink-0 gap-1"
          >
            <PaperPlaneTilt className="size-3.5" />
            {t("Reply")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpen(w.id)}
            className="shrink-0 gap-1"
          >
            <ArrowUpRight className="size-3.5" />
            {t("Open")}
          </Button>
          {canTriage && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy === w.id || w.missing.length > 0}
              title={
                w.missing.length > 0
                  ? t("Needs {gaps} before it can be triaged", {
                      gaps: w.missing.map((g) => GAP_WORD[g]).join(", "),
                    })
                  : undefined
              }
              onClick={() => void markRead(w.id)}
              className="shrink-0 gap-1"
            >
              <EnvelopeOpen className="size-3.5" />
              {t("Mark it read")}
            </Button>
          )}
        </li>
      ))}
      <HelpFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        draftKey={`help:triage:${editing?.id ?? "none"}`}
        teamId={teamId}
        helpTypeOptions={helpTypeOptions}
        initial={
          editing
            ? {
                description: editing.description,
                helpType: editing.helpType ?? undefined,
                accountId: editing.accountId ?? undefined,
                appId: editing.appId ?? undefined,
                moduleId: editing.moduleId ?? undefined,
                raisedByContactId: editing.raisedByContactId ?? undefined,
              }
            : undefined
        }
        onSubmit={saveEdit}
        helpId={editing?.id}
        canAttach={canEdit}
      />
      <TriageReplyDialog
        open={replying !== null}
        onOpenChange={(o) => !o && setReplying(null)}
        draftKey={`help:triage-reply:${replying?.id ?? "none"}`}
        onSubmit={sendReply}
      />
    </ul>
      )}
    </>
  )
}
