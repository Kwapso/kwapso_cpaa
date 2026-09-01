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
// folder tabs" — `web/test/rules.test.ts`'s `TWO_FOLDERS_OK` carried that
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
// above it with zero gap so the folder tab's own pulled-down feet
// (`--folder-tab-overlap`) melt into the card rather than showing themselves
// on the base background — see `web/test/rules.test.ts`'s "tab-shape: only the
// inner filter strips and the record strip override it", which names this
// exact join for Accounts. Tickets now draws the same join.
//
// THE TOOLBAR GAINS A FILTER AND A CREATE BUTTON, the two pieces the old
// search-and-sort-only bar was missing next to Accounts' fixed one: the
// Archived filter above, and a "Raise ticket" button beside the tab row where
// Accounts' New/Import/Export row sits. There is no Export/Import button here
// because there is no export or import door for tickets (SCOPE ch.07 — a
// ticket is a conversation, not an importable record; `internal-money.ts`'s
// neighbour AGENTIC-IMPORT.md says the same about what earns a target). A
// "view selector" beyond the tab strip and the Archived filter is not drawn
// either: the kit's own `ViewSwitch` (`shared/ui/components/collection-frame/
// view-switch.tsx`) is unused everywhere in this app, including Accounts, so
// adding one here would be inventing a control rather than reusing one.
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
import { TabsView, defaultTabsConfig } from "@shared/web/screen-engine/tabs-view"
import { CollectionCreateActionProvider } from "@shared/web/screen-engine/collection-frame"
import { useRemembered } from "@shared/web/remembered"
import { Button } from "@shared/ui/components/button/button"
import { toast } from "@shared/ui/components/sonner/sonner"
import { ScreenRenderer, type ScreenActionContext, type ScreenIntent } from "@shared/web/screen-engine/screen-renderer"
import type { ScreenRecipe, ScreenRights } from "@shared/web/screen-engine/recipe"
import { AlarmClock, ArrowUpRight, MailOpen, Pencil, Plus, Send } from "@shared/ui/foundations/icons"

import { CollectionHeading } from "@/components/collection-heading"
import { CountedAbove } from "@/components/counted-tabs"
import { LoadMore } from "@/components/load-more"
import { PagedFind } from "@/components/paged-find"
import { COLLECTION_SORTS, translatedSorts } from "@/lib/collection-sorts"
import { translatedFacets } from "@/lib/collection-filters"
import { AddButton, CollectionCard, EmptyLine, ToolbarRow } from "@/components/deep-link/screen-bits"
import { TriageStrip } from "@/components/triage-strip"
import { TicketStagesCard } from "@/components/pulse"
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
  // facet option list is a capability `SearchableFacet` does not have today
  // (shared/web/screen-engine/filter-bar.tsx's own header says the async
  // option-provider was removed as dead code, and re-adding it is outside this
  // fix's remit). Filed as a known gap rather than silently shipped as if it
  // were complete.
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
  // …and ONE more for whichever sub-tab is open.
  const narrowed = facet !== ALL && facet !== TRIAGE
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
    // THE FOLDER. Client ruling E: "folder tabs are for main screens, line tabs
    // for detail screens", and ch27.13: "folder tabs belong to collections and
    // main screens only". Tickets is a collection on a main screen, and this is
    // now its ONLY strip — the shape a single folder tab strip on a main
    // screen has always had (Tasks, Sprints, Apps, Accounts). Inherited rather
    // than spelled: `defaultTabsConfig` is already the folder.
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
        {/* ONE STRIP, GENUINELY ATTACHED — the client's 2026-08-31 rulings, both
            on this exact screen: "there can never be 2 rows of tabs … just
            never", "toolbar must be inside of card background", and — once
            "Raise ticket" had moved to share the tab row — "never align the
            button with the tabs … that button belongs in the right of the
            toolbar, part of the toolbar". So the strip carries nothing but
            the tabs, and whatever follows attaches to it with ZERO gap, so
            the folder tab's own pulled-down feet (`--folder-tab-overlap`,
            tabs-view.tsx) melt into that panel instead of showing on the base
            background. This column carries no `gap-*` for exactly that
            reason — the same join `SectionWithCreate`'s `folderTabs` slot
            draws for apps-screen.tsx/sprints-screen.tsx/tasks-screen.tsx, and
            `PagedFind`'s `wrap` now draws for Accounts. */}
        <div className="flex flex-col">
          <TabsView config={tabsConfig} value={facet} onValueChange={(v) => setFacet(v as HelpFacet)} />

          {facet === TRIAGE ? (
            <CollectionCard attached>
              {/* THE TOOLBAR, EVEN WHERE IT HOLDS ONLY THE BUTTON. Triage is a
                  queue, not a `<PagedFind>` toolbar, so there is no search/sort
                  row to share — but "Raise ticket" still lives below the tabs
                  rather than beside them (client ruling, 2026-08-31), so this
                  bare `<ToolbarRow>` is Triage's own toolbar. */}
              {canCreateTicket && (
                <ToolbarRow className="mb-4" actions={<AddButton label={t("Raise ticket")} onClick={onCreate} />} />
              )}
              <TriageQueue
                teamId={teamId}
                canTriage={can("help", "edit")}
                canEdit={can("help", "edit")}
                helpTypeOptions={helpTypeOptions}
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
          ) : scopedQ.error ? (
            <CollectionCard attached>
              <p className="text-destructive text-sm">{t("Couldn't load the tickets.")}</p>
            </CollectionCard>
          ) : scopedQ.data === undefined ? (
            <CollectionCard attached>
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
              wrap={(inner) => <CollectionCard attached>{inner}</CollectionCard>}
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

        {/* THE TWO PANELS THAT ARE NOT THE LIST, and they are UNDER it now.
            WHOSE WEEK IT IS was written above the list because "it is the
            sentence a person needs before they look, and a page they have to go
            and open is a page nobody opens" (BUILD-1 §6) — the first half of
            which is still true and the second half is what put it here rather
            than on a screen of its own. WHERE THE WORK IS SITTING went above for
            the same reason: the strip badges Ready, each kind and Closed and
            says nothing about the four stages in between.

            What neither argument answered is N2. Between the heading and the
            first ticket a reader was crossing FIVE blocks — a duty band about ONE
            person, a stage chart about the whole pipeline, one tab strip, a
            search bar and an action row — before reaching the thing the page is
            named after. That is the "too much in one glance" complaint arriving
            as a stack. The person came for the list, so the list comes first and
            these two are a scroll away, which the owner explicitly asked people
            to be happy to do. Nothing is hidden, nothing is conditional on who is
            reading, and the Triage QUEUE is still its own tab because that is a
            screen's worth. */}
        {facet !== TRIAGE && (
          <>
            <TriageStrip teamId={teamId} canSetDuty={can("help", "edit")} />
            <TicketStagesCard teamId={teamId} />
          </>
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
  onOpen,
}: {
  teamId: string
  canTriage: boolean
  canEdit: boolean
  helpTypeOptions: string[]
  onOpen: (id: string) => void
}) {
  const { t, lang } = useLanguage()
  const triageQ = useCached(triageKey(teamId), () => contentApi.triage())
  const [busy, setBusy] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState<TriageWaiting | null>(null)
  const [replying, setReplying] = React.useState<TriageWaiting | null>(null)

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
    const { tickets, byType, byStatus } = await contentApi.updateHelp({ id: editing.id, ...input })
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

  return (
    <ul className="divide-border divide-y">
      {view.waiting.map((w) => (
        <li key={w.id} className="flex flex-wrap items-center gap-2 py-3">
          <AlarmClock className="text-destructive size-4 shrink-0" />
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
              <Pencil className="size-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReplying(w)}
            className="shrink-0 gap-1"
          >
            <Send className="size-3.5" />
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
              <MailOpen className="size-3.5" />
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
  )
}
