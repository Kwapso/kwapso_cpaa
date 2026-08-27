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
//   vocabulary rather than hard-coded: deactivating "Bug" on the Dropdown values
//   screen takes its tab away, and adding a word adds one.
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

import { Button } from "@shared/ui/components/button/button"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { TabsView, defaultTabsConfig } from "@shared/web/screen-engine/tabs-view"
import { toast } from "@shared/ui/components/sonner/sonner"
import { ScreenRenderer, type ScreenActionContext, type ScreenIntent } from "@shared/web/screen-engine/screen-renderer"
import type { ScreenRecipe, ScreenRights } from "@shared/web/screen-engine/recipe"
import { AlarmClock, ArrowUpRight, MailOpen, Pencil, Send } from "@shared/ui/foundations/icons"

import { CollectionHeading } from "@/components/collection-heading"
import { CountedAbove } from "@/components/counted-tabs"
import { LoadMore } from "@/components/load-more"
import { PagedFind } from "@/components/paged-find"
import { COLLECTION_SORTS, translatedSorts } from "@/lib/collection-sorts"
import { EmptyLine, SectionWithCreate } from "@/components/deep-link/screen-bits"
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
import { primeCache, invalidate,
  mergePage, useCached, useCachedValue } from "@shared/web/store"
import { useT } from "@shared/web/language"
import type { HelpTicket, SelectableValue } from "@shared/types"
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
  // The team's own glyphs, scanned once for the whole strip rather than once
  // per tab. The vocabulary is a cache this screen's siblings already hold and
  // the live registry keeps current, so an emoji edited on the Dropdown values
  // screen repaints these tabs on the next ping.
  const selectableQ = useCached<SelectableValue[]>(`selectable:${teamId}`, () =>
    tenancy.selectable().then((r) => r.values)
  )
  const ticketMarks = markMap(selectableQ.data, MARK_GROUP.ticket)
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
    // A LINE, not the folder. This strip filters WITHIN the collection the outer
    // folder already chose, and a folder tab is drawn to sit attached to a card —
    // there is no second card under this one to attach to. (`pill` used to be
    // spelled here; the kit has no pill tab and drew it as a line anyway.)
    variant: "line" as const,
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

  return (
    <CountedAbove active={formatCount(totals.help) !== ""}>
      <div className="flex flex-col gap-6">
        <CollectionHeading sectionKey="tickets" total={shownTotal} />
        {/* BOTH STRIPS STAY `line`, and that is a decision rather than an
            oversight. The kit's folder tab is drawn to be ATTACHED: it pulls
            itself down under the panel below so the panel's edge covers its cut
            feet, which is the whole of why the active one reads as a folder in
            a drawer. On this screen a search box and the create row sit between
            these strips and the list's card, so there is nothing for them to
            attach to — a folder tab hanging in mid-air with its feet showing is
            worse than the line tab it replaced. Tasks, Sprints, Apps and
            Accounts introduce their card directly and take the shape; this one
            takes it the day its search moves above the strips. */}
        <div className="flex flex-col gap-2">
          <TabsView config={outerTabs} value={helpScope} onValueChange={(v) => setHelpScope(v as HelpScope)} />
          <TabsView config={innerTabs} value={facet} onValueChange={(v) => setFacet(v as HelpFacet)} />
        </div>

        {facet === TRIAGE ? (
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
        ) : scopedQ.error ? (
          <p className="text-destructive text-sm">{t("Couldn't load the tickets.")}</p>
        ) : scopedQ.data === undefined ? (
          <Skeleton variant="list" lines={4} />
        ) : (
          <PagedFind<HelpTicket>
            listKey={narrowed ? helpFacetKey(teamId, helpScope, facet) : helpKey(teamId, helpScope)}
            placeholder={t("Search tickets…")}
            matches={{
              none: t("No tickets match"),
              one: t("1 ticket matches"),
              many: t("{count} tickets match"),
            }}
            sorts={translatedSorts("help", t)}
            defaultSort={COLLECTION_SORTS.help.defaultSort}
            // NO `facets` HERE, deliberately. The recipe used to declare a
            // Status select, which the frame answered over the loaded fifty; the
            // inner strip above already narrows the same field AT THE DOOR, and
            // two controls on one field is the clutter the accounts screen
            // removed ("the Accounts tab is a bit confusing"). One control, and
            // it is the one that can see past the cursor.
            //
            // The strip's own narrowing is NOT `fixed` either, and the difference
            // matters: `fixed` makes a find ACTIVE, and these two strips are
            // already in `listKey` above. Passing them there would move the
            // resting screen into a `find:` cache key the live registry does not
            // patch (R15) — a ticket list that stops updating itself, in exchange
            // for nothing.
            fetchPage={(query, cursor) =>
              contentApi
                .help({
                  // What the strips chose, then the person's own question spread
                  // whole over it: `listQuery` forwards every key, so a narrowing
                  // cannot be lost between these controls and the door.
                  scope: helpScope === "archived" ? "all" : helpScope,
                  view: helpScope === "archived" ? "archived" : "live",
                  ...helpFacetFilter(facet),
                  ...query,
                  cursor,
                })
                .then((r) => ({ rows: r.tickets, nextCursor: r.nextCursor, total: r.total }))
            }
          >
            {(found) => {
              const rows = found.active ? found.rows : scopedQ.data
              if (rows === null || rows === undefined) return <Skeleton variant="list" lines={4} />
              const data = shapeHelpList(rows, ticketMarks)
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
  const t = useT()
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
            {t("{days} days · {when}", { days: w.days, when: formatRelative(w.createdAt, t) })}
          </span>
          {canEdit && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing(w)}
              className="shrink-0 gap-1"
            >
              <Pencil className="size-3.5" />
              {t("Edit")}
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
