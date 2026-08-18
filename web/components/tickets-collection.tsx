"use client"

// THE TICKETS SCREEN — two tab strips, one collection, and a triage queue.
//
// It lived inside the deep-link host's collection switch, which was fine while it
// was one strip. CHECKLIST 5.1 adds a second ("sub-tabs by TYPE beneath the
// existing All / My / Archived strip") and 5.11 adds a queue that is not a filter
// of the list at all, and both need state of their own — so this is a component
// rather than a branch. The host renders it and hands over the four things only
// the host knows: the recipe, the rights, and the two action callbacks.
//
// THE TWO STRIPS COMPOSE, and that is the whole shape:
//
//   the OUTER strip is WHOSE and WHERE — All / My / Archived. Two of the three
//   are a raiser filter and one is a view, and the door has answered all three as
//   server scopes since tickets started paging;
//
//   the INNER strip is WHAT KIND and HOW FAR ALONG — Ready, then one tab per live
//   `Ticket type` value, then Closed, then All. DERIVED from the team's own
//   vocabulary rather than hard-coded: retiring "Bug" on the Dropdown values
//   screen retires its tab, and adding a word adds one.
//
// Every narrowing is the DOOR's (R14 + R16). Filtering the loaded page would
// answer "the questions among the newest fifty" while the badge above counted all
// of them, which is the failure R16 exists for and the one a manager reported as
// "filter by type, the count doesn't change".
//
// AND ONE TAB IS NOT A FILTER. "Triage" swaps the collection for the queue of
// requests nobody has read — and the DOOR decides whether this caller is given
// that queue at all (CHECKLIST 5.11: only the person on duty sees it). A screen
// that hid a list it had already been handed would be a curtain, not a rule.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { ScreenRenderer, type ScreenActionContext, type ScreenIntent } from "@kwapso/ui/registry/collections/screen-renderer/screen-renderer"
import type { ScreenRecipe, ScreenRights } from "@kwapso/ui/lib/recipe"
import { AlarmClock, MailOpen } from "lucide-react"

import { CollectionHeading } from "@/components/collection-heading"
import { CountedAbove } from "@/components/counted-tabs"
import { LoadMore } from "@/components/load-more"
import { PagedFind } from "@/components/paged-find"
import { COLLECTION_SORTS, translatedSorts } from "@/lib/collection-sorts"
import { SectionWithCreate } from "@/components/deep-link/screen-bits"
import { TriageStrip } from "@/components/triage-strip"
import { TicketStagesCard } from "@/components/pulse"
import { CONCEPT_ICON } from "@/lib/pages"
import { shapeHelpList } from "@/components/deep-link/shape"
import { ApiFailure, content as contentApi } from "@/lib/api"
import {
  helpFacetFilter,
  helpFacetKey,
  helpKey,
  listFetch,
  totalKey,
  triageKey,
  type HelpFacet,
  type HelpScope,
} from "@/lib/live-resources"
import { withDataDrivenCollection } from "@/lib/screens"
import { formatCount } from "@shared/web/format-count"
import { formatRelative } from "@shared/web/format"
import { invalidate, useCached, useCachedValue } from "@shared/web/store"
import { useT } from "@shared/web/language"
import type { HelpTicket } from "@shared/types"
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
  helpScope,
  setHelpScope,
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
  helpScope: HelpScope
  setHelpScope: (v: HelpScope) => void
  /** the team's live `Ticket type` values — the inner strip is built from these */
  helpTypeOptions: string[]
  totals: { help?: number; helpArchived?: number }
  can: (module: string, right: "read" | "create" | "edit" | "delete") => boolean
  onCreate: () => void
  onAction: (actionId: string, ctx: ScreenActionContext) => void
  onIntent: (intent: ScreenIntent) => void
}) {
  const t = useT()
  const [facet, setFacet] = React.useState<HelpFacet>(ALL)

  // THE TWO SCOPE CACHES: each is a server scope with its own page. There were
  // three until "My tickets" went (live-resources.ts says why).
  const allQ = useCached<HelpTicket[]>(helpKey(teamId, "all"), () => listFetch.help(teamId))
  const archivedQ = useCached<HelpTicket[]>(
    helpScope === "archived" ? helpKey(teamId, "archived") : null,
    () => listFetch.helpArchived(teamId)
  )
  // …and ONE more for whichever sub-tab is open, keyed by BOTH strips because the
  // two compose: "my questions" and "all questions" are different pages.
  const narrowed = facet !== ALL && facet !== TRIAGE
  const facetQ = useCached<HelpTicket[]>(
    narrowed ? helpFacetKey(teamId, helpScope, facet) : null,
    () => listFetch.helpFacet(teamId, helpScope, facet)
  )
  // R16: every badge on the inner strip is the door's own grouped COUNT(*),
  // primed by whichever ticket read ran last and counted over the list IGNORING
  // the kind and stage facets — so opening "Questions" does not make every other
  // badge read zero.
  const byType = useCachedValue<Record<string, number>>(`help-by-type:${teamId}`)
  const byStatus = useCachedValue<Record<string, number>>(`help-by-status:${teamId}`)

  const scopedQ = narrowed ? facetQ : helpScope === "archived" ? archivedQ : allQ
  // The list key is written out at BOTH call sites below rather than held in a
  // variable: the paging and search checks read the JSX and look for the key the
  // door's own page lands in (`helpKey(`), which is the honest thing to look for
  // — a variable could be anything by the time it reaches the prop.
  const facetTotal = useCachedValue<number>(
    totalKey(`help-facet:${helpScope}:${facet}`, teamId)
  )
  const scopeTotal =
    helpScope === "archived" ? totals.helpArchived : totals.help
  const shownTotal = narrowed ? facetTotal : scopeTotal

  const outerTabs = {
    ...defaultTabsConfig,
    variant: "line" as const,
    tabs: [
      { value: "all", label: t("All tickets"), icon: "inbox", badge: formatCount(totals.help), badgeVariant: "" as const },
      // THE PUT-AWAY PILE. Archive shipped as a door with no button; giving it a
      // button without giving the pile a screen would have moved the dead end one
      // step along instead of ending it.
      { value: "archived", label: t("Archived"), icon: "archive", badge: formatCount(totals.helpArchived), badgeVariant: "" as const },
    ],
  }

  // THE INNER STRIP, built from the team's own words. Ready, then a tab per live
  // ticket type, then Closed, then All — and Triage on the end, which is a
  // different screen rather than a narrower list.
  const innerTabs = {
    ...defaultTabsConfig,
    variant: "pill" as const,
    tabs: [
      { value: READY, label: t("Ready"), icon: "", badge: formatCount(byStatus?.ready), badgeVariant: "" as const },
      ...helpTypeOptions.map((v) => ({
        value: `type:${v}`,
        label: v,
        icon: "",
        badge: formatCount(byType?.[v]),
        badgeVariant: "" as const,
      })),
      { value: CLOSED, label: t("Closed"), icon: "", badge: formatCount(byStatus?.resolved), badgeVariant: "" as const },
      { value: ALL, label: t("All"), icon: "", badge: formatCount(scopeTotal), badgeVariant: "" as const },
      // The one tab on this strip whose idea has a concept icon of its own. The
      // four KIND tabs beside it carry the team's own type MARKS on every other
      // surface (a ticket's header band, its detail) and cannot carry one here:
      // `TabsView` resolves `icon` as a lucide NAME, so a pictograph in that slot
      // renders nothing at all. Logged as UI-GAPS #17 rather than worked around
      // by writing a glyph into the LABEL, which is the one shape
      // UI-CONVENTIONS §5 refuses (a pictograph inside a sentence).
      { value: TRIAGE, label: t("Triage"), icon: CONCEPT_ICON.triage, badge: "", badgeVariant: "" as const },
    ],
  }

  return (
    <CountedAbove active={formatCount(totals.help) !== ""}>
      <div className="flex flex-col gap-6">
        <CollectionHeading sectionKey="tickets" total={shownTotal} />
        <div className="flex flex-col gap-2">
          <TabsView config={outerTabs} value={helpScope} onValueChange={(v) => setHelpScope(v as HelpScope)} />
          <TabsView config={innerTabs} value={facet} onValueChange={(v) => setFacet(v as HelpFacet)} />
        </div>

        {facet === TRIAGE ? (
          <TriageQueue teamId={teamId} canTriage={can("help", "edit")} />
        ) : scopedQ.error ? (
          <p className="text-destructive text-sm">{t("Couldn't load the tickets.")}</p>
        ) : scopedQ.data === undefined ? (
          <Skeleton variant="list" lines={4} />
        ) : (
          <PagedFind<HelpTicket>
            listKey={narrowed ? helpFacetKey(teamId, helpScope, facet) : helpKey(teamId, helpScope)}
            placeholder={t("Search tickets…")}
            noun="tickets"
            sorts={translatedSorts("help", t)}
            defaultSort={COLLECTION_SORTS.help.defaultSort}
            fetchPage={(query, cursor) => {
              // The search rides the SAME two narrowings the tab strip chose, so
              // "search my questions" means exactly that.
              const f = helpFacetFilter(facet)
              return contentApi
                .help(
                  helpScope === "archived" ? "all" : helpScope,
                  cursor,
                  helpScope === "archived" ? "archived" : "live",
                  query.q,
                  undefined,
                  f.helpType,
                  f.status as HelpTicket["status"] | undefined,
                  undefined,
                  { sort: query.sort, dir: query.dir }
                )
                .then((r) => ({ rows: r.tickets, nextCursor: r.nextCursor, total: r.total }))
            }}
          >
            {(found) => {
              const rows = found.active ? found.rows : scopedQ.data
              if (rows === null || rows === undefined) return <Skeleton variant="list" lines={4} />
              const data = shapeHelpList(rows)
              const listRecipe = withDataDrivenCollection(recipe, data.rows ?? [], found.emptyText)
              return (
                <>
                  <SectionWithCreate
                    show={can("help", "create")}
                    label={t("Raise ticket")}
                    icon="plus"
                    onCreate={onCreate}
                  >
                    <ScreenRenderer
                      recipe={listRecipe}
                      data={data}
                      rights={rights}
                      onAction={onAction}
                      onIntent={onIntent}
                    />
                  </SectionWithCreate>
                  <LoadMore
                    listKey={
                      found.listKey ??
                      (narrowed ? helpFacetKey(teamId, helpScope, facet) : helpKey(teamId, helpScope))
                    }
                    label={t("Load more tickets")}
                    fetchPage={found.fetchPage}
                  />
                </>
              )
            }}
          </PagedFind>
        )}

        {/* THE TWO PANELS THAT ARE NOT THE LIST, and they are UNDER it now.
            WHOSE WEEK IT IS was written above the list because "it is the
            sentence a person needs before they look, and a page they have to go
            and open is a page nobody opens" (BUILD-1 §6) — the first half of
            which is still true and the second half is what put it here rather
            than on a screen of its own. WHERE THE WORK IS SITTING went above for
            the same reason: the strip badges Ready, each kind and Closed and
            says nothing about the four stages in between.

            What neither argument answered is N2. Between the heading and the
            first ticket a reader was crossing SIX blocks — a duty band about ONE
            person, a stage chart about the whole pipeline, two tab strips, a
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
function TriageQueue({ teamId, canTriage }: { teamId: string; canTriage: boolean }) {
  const t = useT()
  const triageQ = useCached(triageKey(teamId), () => contentApi.triage())
  const [busy, setBusy] = React.useState<string | null>(null)

  async function markRead(id: string) {
    setBusy(id)
    try {
      await contentApi.triageRead(id)
      invalidate(triageKey(teamId))
      invalidate(helpKey(teamId, "all"))
      toast.success(t("Marked as read."))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't do that.")
    } finally {
      setBusy(null)
    }
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
    return <p className="text-muted-foreground text-sm">{t("Nothing has been sitting unread. ")}</p>

  return (
    <ul className="divide-border divide-y">
      {view.waiting.map((w) => (
        <li key={w.id} className="flex flex-wrap items-center gap-3 py-3">
          <AlarmClock className="text-destructive size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-sm">
            {[w.ref, richTextPlain(w.description)].filter(Boolean).join(" · ")}
          </span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {`${w.days} days · ${formatRelative(w.createdAt)}`}
          </span>
          {canTriage && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy === w.id}
              onClick={() => void markRead(w.id)}
              className="shrink-0 gap-1.5"
            >
              <MailOpen className="size-3.5" />
              {t("Mark it read")}
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}
