"use client"

// Ticket detail — one ticket as a tabbed record: a status STEPPER (the hero control)
// above Conversation / Overview / Activity tabs. Conversation = the chat (library
// TicketThread), Overview = audit metadata (DescriptionList), Activity = the
// ticket's history (the GENERIC record-activity feed). Edit + every status move are
// gated PURELY by help:edit. Replies echo instantly (optimistic) and reconcile with
// the server reply. Host-composed, like role-detail.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import {
  DescriptionList,
  defaultDescriptionListConfig,
} from "@kwapso/ui/registry/collections/description-list/description-list"
import {
  ActivityFeed,
  defaultActivityFeedConfig,
} from "@kwapso/ui/registry/collections/activity-feed/activity-feed"
import {
  TicketThread,
  type TicketMember,
  type TicketStatus,
} from "@kwapso/ui/registry/collections/ticket-thread/ticket-thread"
import { ArchiveRestore, ArrowDown, ArrowUp, Archive, Hammer, Languages, Mail, Pencil, Send } from "lucide-react"

import type {
  Account,
  HelpMessage,
  HelpStakeholder,
  HelpTicket,
  SelectableValue,
  TeamMember,
} from "@shared/types"
import { ApiFailure, content, dataOps, tenancy } from "@/lib/api"
import { auditItems } from "@/lib/audit-overview"
import { useFollowNewest } from "@shared/web/follow-newest"
import { formatRelative } from "@shared/web/format"
import { personName } from "@/lib/identity"
import { usePermissions } from "@/lib/perms"
import { invalidate, primeCache, useCached, useCachedValue } from "@shared/web/store"
import { formatCount } from "@shared/web/format-count"
import { recordActivityKey, useRecordActivity } from "@/lib/use-record-activity"
import { HelpFormDialog } from "@/components/help-form-dialog"
import { LoadMore } from "@/components/load-more"
import { MailReplyDialog } from "@/components/mail-reply-dialog"
import { HelpStakeholders } from "@/components/help-stakeholders"
import { HelpStatusStepper, type HelpStatusValue } from "@/components/help-status-stepper"
import { ResolveDialog, type ResolveFormValues } from "@/components/resolve-dialog"
import { StoryFormDialog } from "@/components/story-form-dialog"
import { createStoryFrom, useStoryFormOptions } from "@/components/stories-screen"
import { StoriesPanel, sliceKey } from "@/components/work-panels"
import { accountsKey, totalKey } from "@/lib/live-resources"
import { CONCEPT_ICON } from "@/lib/pages"

// LIBRARY ⇄ SERVER status. These were one-to-one until the work engine gave the
// ticket its five states (SCOPE ch.07); the library's `TicketStatus` has four,
// and the library is a separate repo we do not edit from here (UI-CONVENTIONS,
// "the library is lego"). So this is a MAPPING, not a mismatch — and the
// narrowing only reaches the library's own badge, because the real control is
// HelpStatusStepper below, which speaks all five.
const TO_LIBRARY: Record<HelpTicket["status"], TicketStatus> = {
  // Read but not started, and read and triaged, are both "with us, not begun".
  new: "open",
  triaged: "open",
  in_progress: "in-progress",
  // Every story is done and the client has not been told yet — still in motion,
  // because the telling is the part that finishes it.
  ready: "in-progress",
  resolved: "resolved",
}
const TO_SERVER: Record<TicketStatus, HelpTicket["status"]> = {
  open: "new",
  "in-progress": "in_progress",
  resolved: "resolved",
  // The library's "reopened" is a staff member pulling a ticket back into play,
  // which in our five states is exactly `triaged`: read, and not yet started.
  reopened: "triaged",
}
const STATUS_LABEL: Record<HelpTicket["status"], string> = {
  new: "New",
  triaged: "Triaged",
  in_progress: "In progress",
  ready: "Ready",
  resolved: "Resolved",
}

export function HelpDetailScreen({
  teamId,
  helpId,
  myUserId,
  basePath,
}: {
  teamId: string
  helpId: string
  myUserId: string | null
  /** the tickets list in the URL form we arrived through (/tickets or
   * /t/<team>/tickets) — a cross-link off this record stays in that shape. */
  basePath: string
}) {
  const ticketsQ = useCached<HelpTicket[]>(`help:${teamId}`, () =>
    content.help("all").then((r) => r.tickets)
  )
  const ticket = ticketsQ.data?.find((t) => t.id === helpId) ?? null

  const repliesQ = useCached<HelpMessage[]>(`help-thread:${helpId}`, () =>
    content.helpThread(helpId).then((r) => {
      // R16: the badge shows the door's exact COUNT(*), never the (capped) list length.
      primeCache(`total:help-thread:${helpId}`, r.total)
      return r.replies
    })
  )
  const threadTotal = useCachedValue<number>(`total:help-thread:${helpId}`)
  const membersQ = useCached<TeamMember[]>(`members:${teamId}`, () =>
    tenancy.members().then((r) => r.members)
  )
  // The generic record feed (Law R5) + the exact server total its tab badges
  // (R8 for the place, R16 for the number — never the loaded page's length).
  const activity = useRecordActivity("help", helpId)
  const selectableQ = useCached<SelectableValue[]>(`selectable:${teamId}`, () =>
    tenancy.selectable().then((r) => r.values)
  )
  const stakeholdersQ = useCached<HelpStakeholder[]>(`help-stakeholders:${helpId}`, () =>
    content.helpStakeholders(helpId).then((r) => r.stakeholders)
  )

  const stakeholderBadge = formatCount(stakeholdersQ.data?.length)
  const { can } = usePermissions(teamId)
  const canEdit = can("help", "edit") // single source — gates Edit, the stepper, and the thread's resolve
  // Writing work down is the WORK module's right, not the ticket's: a person who
  // may read and answer requests is not necessarily a person who may put things
  // on the team's backlog, and all three routes to a story respect that.
  const canWriteWork = can("work", "create")
  // REPLYING FROM YOUR OWN MAILBOX. `google:edit` is "you may use your own
  // connection"; the send half needs the owner's second switch as well, and the
  // dialog asks for it separately — writing a draft changes nothing outside the
  // building, sending it does.
  const canMail = can("google", "edit")
  const canSendMail = can("google_mail", "create")

  const [tab, setTab] = React.useState("conversation")
  const [editing, setEditing] = React.useState(false)
  const [resolving, setResolving] = React.useState(false)
  const [translating, setTranslating] = React.useState(false)
  const [statusBusy, setStatusBusy] = React.useState(false)
  // THE WORK ANSWERING THIS REQUEST. One story may answer many tickets and one
  // ticket may need many stories (the owner's ruling), so this is a collection
  // on the record rather than a field on it. Its exact total badges the tab.
  const storiesTotal = useCachedValue<number>(totalKey("stories-ticket", helpId))
  const [storyOpen, setStoryOpen] = React.useState(false)
  // THE TRIAGE PROMPT — the third of the three ways a ticket becomes a story.
  // Set the moment a status move lands on `triaged`, which is exactly when a
  // person has decided the request is real and not yet decided what to do about
  // it. Held in state rather than the URL because it is a suggestion, not a
  // destination: dismissing it should not be a page in the back history.
  const [promptStory, setPromptStory] = React.useState(false)
  const [mailing, setMailing] = React.useState(false)
  const [ranking, setRanking] = React.useState(false)
  const options = useStoryFormOptions(teamId)
  const host = { base: basePath.replace(/\/tickets$/, "") }
  // WHO TO WRITE TO, when we already know. A cache READ, never a fetch: if the
  // accounts list is warm (you came through it, or the assistant loaded it) the
  // client's address fills itself in; if it is cold, or their account sits past
  // page one, the box is simply empty and a person types it. Costing every
  // ticket screen a round-trip to save one line of typing is the wrong trade.
  const accounts = useCachedValue<Account[]>(accountsKey(teamId))

  // Land on the newest reply, and follow the one you just sent — the same
  // behaviour the client gets on their side of this same conversation, from the
  // same seam, so the two can't drift. It sits here, above the three early
  // returns below, because it is a hook.
  //
  // The optimistic echo makes this fire twice on a send (once for the local
  // `optimistic-…` row, once when the server's real id reconciles) and that is
  // correct — both are yours, so both follow.
  const replyRows = repliesQ.data ?? []
  const newestReply = replyRows[replyRows.length - 1]
  useFollowNewest(newestReply?.id ?? null, Boolean(myUserId) && newestReply?.authorId === myUserId)

  const helpTypeOptions = (selectableQ.data ?? [])
    .filter((v) => v.type === "Ticket type")
    .map((v) => v.value)

  async function changeStatus(next: HelpStatusValue) {
    setStatusBusy(true)
    try {
      const { tickets } = await content.setHelpStatus(helpId, next)
      primeCache(`help:${teamId}`, tickets)
      invalidate(recordActivityKey("help", helpId))
      toast.success("Status updated.")
      // Triaged means "we have read it and it is real". That is the moment to
      // ask what we are going to DO about it — and only when nothing has been
      // written down yet, because a ticket that already has work on it has been
      // answered and the prompt would be noise.
      if (next === "triaged" && (ticket?.storyCount ?? 0) === 0) setPromptStory(true)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't update the status.")
    } finally {
      setStatusBusy(false)
    }
  }

  async function editTicket(input: { description: string; helpType?: string }) {
    const { tickets } = await content.updateHelp({
      id: helpId,
      description: input.description,
      helpType: input.helpType,
    })
    primeCache(`help:${teamId}`, tickets)
    invalidate(recordActivityKey("help", helpId))
    toast.success("Ticket updated.")
  }

  async function addStakeholder(userId: string) {
    const { stakeholders } = await content.addStakeholder(helpId, userId)
    primeCache(`help-stakeholders:${helpId}`, stakeholders)
    invalidate(recordActivityKey("help", helpId))
  }

  async function onReply(body: string, _files: File[], mentions: TicketMember[]) {
    const prev = repliesQ.data ?? []
    const optimistic: HelpMessage = {
      id: `optimistic-${Date.now()}`,
      ticketId: helpId,
      body,
      taggedUserIds: mentions.map((m) => m.id),
      isAgent: false,
      authorId: myUserId ?? "",
      authorName: "You",
      createdAt: new Date().toISOString(),
    }
    primeCache(`help-thread:${helpId}`, [...prev, optimistic]) // ~instant echo (WhatsApp-style)
    try {
      const { replies } = await content.replyHelp(
        helpId,
        body,
        mentions.map((m) => m.id)
      )
      primeCache(`help-thread:${helpId}`, replies) // reconcile with server truth
      invalidate(`help:${teamId}`)
    } catch (err) {
      primeCache(`help-thread:${helpId}`, prev) // rollback the echo
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't post your reply.")
    }
  }

  /** PUT IT AWAY, or take it back out. The door has answered this since archive
   * shipped and no screen ever called it, so a ticket could be archived by the
   * assistant and then be unreachable by a person. Nothing is deleted: the
   * conversation and the history survive exactly as they were. */
  async function setArchived(archived: boolean) {
    setStatusBusy(true)
    try {
      const { tickets } = await content.archiveHelp(helpId, archived)
      primeCache(`help:${teamId}`, tickets)
      invalidate(recordActivityKey("help", helpId))
      toast.success(archived ? "Put away." : "Taken back out.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't change that.")
    } finally {
      setStatusBusy(false)
    }
  }

  /** WHERE THE PERSON PUT IT. Drag-rank is the only priority signal in the
   * product (SCOPE ch.07 — there is no priority dropdown and there will not be
   * one) and it had no control on any screen: the door shipped, the sparse-key
   * algorithm shipped, and the order could only ever be the order rows arrived
   * in. The door takes NEIGHBOURS rather than a position, which is what lets two
   * people reorder at once without fighting over a number. */
  async function move(delta: -1 | 1) {
    const order = ticketsQ.data ?? []
    const at = order.findIndex((t) => t.id === helpId)
    if (at < 0) return
    const target = at + delta
    // The list reads highest-rank-first, so moving UP means landing between the
    // two rows above this one.
    const below = delta === -1 ? order[target - 1] : order[target]
    const above = delta === -1 ? order[target] : order[target + 1]
    setRanking(true)
    try {
      const { tickets } = await content.rankHelp(helpId, below?.id ?? null, above?.id ?? null)
      primeCache(`help:${teamId}`, tickets)
      toast.success("Moved.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't move that.")
    } finally {
      setRanking(false)
    }
  }

  /** ANSWER IT: resolve, append to the conversation, email the client — one call,
   * because they are one act and a half-done answer is the worst of the three. */
  async function resolve(values: ResolveFormValues) {
    await content.resolveHelp(helpId, values.resolution)
    invalidate(`help:${teamId}`)
    invalidate(`help-thread:${helpId}`)
    invalidate(recordActivityKey("help", helpId))
    toast.success("Answered — and emailed to them.")
  }

  /** TRANSLATE AND SET IT. The door spends one unit of the team's AI allowance
   * and refunds it if nothing usable came back, so a failure here costs nothing
   * but the second it took. */
  async function translate() {
    setTranslating(true)
    try {
      await dataOps.translateTicket(helpId)
      invalidate(`help:${teamId}`)
      toast.success("Translated.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't translate that.")
    } finally {
      setTranslating(false)
    }
  }

  if (ticketsQ.error) return <p className="text-destructive text-sm">Couldn&apos;t load the ticket.</p>
  if (ticketsQ.data === undefined) return <Skeleton variant="list" lines={4} />
  if (!ticket) return <p className="text-muted-foreground text-sm">That ticket no longer exists.</p>

  // self-tag fix: you can't @mention yourself
  const mentionableMembers: TicketMember[] = (membersQ.data ?? [])
    .filter((m) => m.userId !== myUserId)
    .map((m) => ({ id: m.userId, name: personName(m) }))

  const replies = (repliesQ.data ?? []).map((r) => ({
    id: r.id,
    author: r.authorName || "Member",
    time: formatRelative(r.createdAt),
    body: r.body,
    aiDrafted: r.isAgent,
  }))

  const overviewItems = [
    { label: "Type", value: ticket.helpType || "General" },
    // BOTH TITLES, and the German one first when it is the original. 788 of the
    // requests arriving from the previous system exist ONLY in German (BUILD-1
    // §8), so "the title" is two fields here and the screen says so rather than
    // picking one and hoping.
    { label: "Title", value: ticket.titleDe || "" },
    { label: "Title (English)", value: ticket.titleEn || "" },
    { label: "Raised from", value: ticket.sourceScreen || "" },
    ...auditItems({
      createdByName: ticket.raiserName,
      createdAt: ticket.createdAt,
      editedByName: ticket.editorName,
      updatedAt: ticket.updatedAt,
      status: STATUS_LABEL[ticket.status],
    }),
    { label: "Resolved", value: ticket.resolvedAt ? formatRelative(ticket.resolvedAt) : "" },
  ]


  const tabsConfig = {
    ...defaultTabsConfig,
    variant: "line" as const,
    tabs: [
      {
        value: "conversation",
        label: "Conversation",
        icon: "messages-square",
        badge: formatCount(threadTotal),
        badgeVariant: "" as const,
      },
      { value: "overview", label: "Overview", icon: "info", badge: "", badgeVariant: "" as const },
      {
        value: "activity",
        label: "Activity",
        icon: "history",
        badge: formatCount(activity.total),
        badgeVariant: "" as const,
      },
      {
        value: "stories",
        label: "Related stories",
        icon: CONCEPT_ICON.stories,
        badge: formatCount(storiesTotal),
        badgeVariant: "" as const,
      },
      {
        value: "stakeholders",
        label: "Stakeholders",
        icon: "users",
        // The stakeholder set is COMPUTED in full (raiser + admins + mentions + adds),
        // not a capped table read — its size IS the true total, shown via the one seam.
        badge: stakeholderBadge,
        badgeVariant: "" as const,
      },
    ],
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            {/* THE NUMBER THE CLIENT QUOTES. It has existed on this record since
                the work engine landed and appeared on no screen — the one thing
                a person needs when a client rings up saying "about BERG-T0412". */}
            {(ticket.ref || ticket.archivedAt) && (
              <p className="text-muted-foreground mb-0.5 flex flex-wrap items-center gap-2 text-xs">
                {ticket.ref && <span>{ticket.ref}</span>}
                {ticket.archivedAt && (
                  <span className="text-muted-foreground">Archived</span>
                )}
              </p>
            )}
            <p className="truncate text-sm font-medium">{ticket.description}</p>
          </div>
          {/* TRANSLATE, on a ticket that has a German title and no English one
              yet. It SETS the field rather than showing a preview (BUILD-1 §8):
              a preview is a thing one person reads once, and a set field is a
              thing the whole team, the search and the assistant read afterwards.
              It disappears the moment there is an English title, because there
              is then nothing to ask for. */}
          {canEdit && ticket.titleDe && !ticket.titleEn && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void translate()}
              disabled={translating}
              className="shrink-0 gap-1.5"
            >
              <Languages className="size-3.5" />
              {translating ? "Translating…" : "Translate"}
            </Button>
          )}
          {/* ANSWER IT — the second and last thing in the product that emails a
              client, so it is a deliberate button with a dialog behind it and
              never a side effect of the stepper. Gone once it is answered. */}
          {canEdit && ticket.status !== "resolved" && (
            <Button size="sm" onClick={() => setResolving(true)} className="shrink-0 gap-1.5">
              <Send className="size-3.5" />
              Answer
            </Button>
          )}
          {/* REPLY BY EMAIL — the owner's own sentence, as a control: write it
              into your Gmail drafts and click through to it there, or send it
              from here. It is beside Answer rather than replacing it, because
              they are different acts: Answer resolves the request and emails the
              resolution; this is one letter to one person, out of your own
              mailbox, leaving the ticket exactly where it is. */}
          {canMail && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMailing(true)}
              className="shrink-0 gap-1.5"
            >
              <Mail className="size-3.5" />
              Reply by email
            </Button>
          )}
          {/* MAKE IT A STORY — the first of the three ways (the owner asked for
              all three): a button on the ticket. It opens the story form with
              THIS request already filled in, so the link cannot be mistyped. */}
          {canWriteWork && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStoryOpen(true)}
              className="shrink-0 gap-1.5"
            >
              <Hammer className="size-3.5" />
              Make it a story
            </Button>
          )}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              className="shrink-0 gap-1.5"
            >
              <Pencil className="size-3.5" />
              Edit
            </Button>
          )}
          {/* PUT IT AWAY. Available from any state (SCOPE ch.07), destructive in
              colour because it takes the request out of the everyday lists —
              and reversible, which the confirm-free restore says out loud. */}
          {canEdit &&
            (ticket.archivedAt ? (
              <Button
                variant="outline"
                size="sm"
                disabled={statusBusy}
                onClick={() => void setArchived(false)}
                className="shrink-0 gap-1.5"
              >
                <ArchiveRestore className="size-3.5" />
                Take it back out
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={statusBusy}
                onClick={() => void setArchived(true)}
                className="text-destructive hover:text-destructive shrink-0 gap-1.5"
              >
                <Archive className="size-3.5" />
                Archive
              </Button>
            ))}
        </div>
        <HelpStatusStepper
          status={ticket.status}
          canEdit={canEdit}
          onChange={(n) => void changeStatus(n)}
          busy={statusBusy}
        />
        {/* WHERE IT SITS IN THE ORDER — the only priority signal in the product,
            and until now the only one with no control anywhere. */}
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-sm">Order in the list</span>
            <Button
              variant="outline"
              size="sm"
              disabled={ranking}
              onClick={() => void move(-1)}
              className="gap-1.5"
            >
              <ArrowUp className="size-3.5" />
              Move up
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={ranking}
              onClick={() => void move(1)}
              className="gap-1.5"
            >
              <ArrowDown className="size-3.5" />
              Move down
            </Button>
          </div>
        )}
      </div>

      {/* THE TRIAGE PROMPT — the third way in. It appears the moment somebody
          moves this request to triaged with no work written down against it,
          which is precisely the moment the question is live. */}
      {promptStory && canWriteWork && (
        <div className="border-border/60 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2">
          <p className="min-w-0 flex-1 text-sm">
            Read and real. What are we going to do about it?
          </p>
          <Button size="sm" onClick={() => setStoryOpen(true)} className="gap-1.5">
            <Hammer className="size-3.5" />
            Write the first story
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPromptStory(false)}>
            Not yet
          </Button>
        </div>
      )}

      <TabsView
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(t) => {
          if (t.value === "overview")
            return (
              <DescriptionList
                config={{ ...defaultDescriptionListConfig, columns: 1 }}
                items={overviewItems}
              />
            )
          if (t.value === "activity")
            return (
              // R14: the badge above counts the WHOLE history, so the feed under
              // it must be able to reach all of it — page one, then Load more.
              <div className="flex flex-col gap-4">
                <ActivityFeed
                  config={{
                    ...defaultActivityFeedConfig,
                    emptyText: "No activity yet.",
                  }}
                  items={activity.items}
                />
                <LoadMore
                  listKey={activity.listKey}
                  fetchPage={activity.fetchPage}
                  label="Load more activity"
                />
              </div>
            )
          // THE SECOND WAY IN — a tab on the ticket where MORE work can be
          // added. One story may answer many tickets and one ticket may need
          // many stories, so this is a collection with its own create action.
          if (t.value === "stories")
            return (
              <StoriesPanel
                ownerKind="ticket"
                ownerId={helpId}
                filter={{ ticketId: helpId }}
                host={host}
                onNew={canWriteWork ? () => setStoryOpen(true) : undefined}
                emptyText="No work written down against this request yet."
              />
            )
          if (t.value === "stakeholders")
            return (
              <HelpStakeholders
                stakeholders={stakeholdersQ.data ?? []}
                members={membersQ.data ?? []}
                canAdd={can("help", "read")}
                onAdd={addStakeholder}
              />
            )
          return (
            <TicketThread
              ticket={{
                description: ticket.description,
                type: ticket.helpType || "General",
                status: TO_LIBRARY[ticket.status],
                fromScreen: ticket.sourceScreen ? { label: ticket.sourceScreen } : undefined,
              }}
              replies={replies}
              members={mentionableMembers}
              canResolve={canEdit}
              showStatusControl={false}
              onReply={onReply}
              onStatusChange={(s) => void changeStatus(TO_SERVER[s])}
            />
          )
        }}
      />

      <ResolveDialog
        open={resolving}
        onOpenChange={setResolving}
        draft={ticket.draftResolution}
        draftKey={`help:resolve:${helpId}`}
        onSubmit={resolve}
      />

      {/* All three ways in open this ONE form, with the request already filled
          in and unchangeable — three doors into one room, which is the point. */}
      <StoryFormDialog
        open={storyOpen}
        onOpenChange={setStoryOpen}
        sprints={options.sprints}
        apps={options.apps}
        tickets={options.tickets}
        fixedTicket={{
          id: helpId,
          label: ticket.ref ? `${ticket.ref} · ${ticket.description}` : ticket.description,
        }}
        members={options.members}
        draftKey={`story:add:ticket:${helpId}`}
        onSubmit={async (v) => {
          await createStoryFrom(teamId, v)
          invalidate(sliceKey("stories-ticket", helpId))
          invalidate(`help:${teamId}`)
          setPromptStory(false)
        }}
      />

      {/* The subject carries the reference number the client quotes, when the
          ticket has one — it is the whole reason that number exists. The body
          starts from our own working text if there is any, because the alternative
          is somebody retyping what the app already wrote down. */}
      <MailReplyDialog
        open={mailing}
        onOpenChange={setMailing}
        draftKey={`help:mail:${helpId}`}
        defaultTo={
          (accounts ?? []).find((a) => a.id === ticket.accountId)?.email ?? ""
        }
        defaultSubject={ticket.ref ? `${ticket.ref} · ${ticket.description}` : ticket.description}
        defaultBody={ticket.draftResolution ?? ""}
        canSend={canSendMail}
      />

      <HelpFormDialog
        open={editing}
        onOpenChange={setEditing}
        draftKey={`help:edit:${helpId}`}
        teamId={teamId}
        helpTypeOptions={helpTypeOptions}
        initial={{ description: ticket.description, helpType: ticket.helpType }}
        onSubmit={editTicket}
      />
    </div>
  )
}
