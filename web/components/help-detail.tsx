"use client"

// Ticket detail — one ticket as a tabbed record: a status STEPPER (the hero control)
// above Conversation / Overview / Activity tabs. Conversation = the chat (library
// TicketThread), Overview = audit metadata (OverviewList), Activity = the
// ticket's history (the GENERIC record-activity feed). Edit + every status move are
// gated PURELY by help:edit. Replies echo instantly (optimistic) and reconcile with
// the server reply. Host-composed, like role-detail.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import {
  TicketThread,
  type TicketMember,
  type TicketStatus,
} from "@kwapso/ui/registry/collections/ticket-thread/ticket-thread"
import { ArchiveRestore, Archive, CheckCheck, Languages, Pencil, Send } from "lucide-react"

import type {
  HelpMessage,
  HelpStakeholder,
  HelpTicket,
  SelectableValue,
  TeamMember,
} from "@shared/types"
import { ApiFailure, content, dataOps, tenancy } from "@/lib/api"
import {
  RecordActionsMenu,
  RecordFooter,
  RecordScreen,
  STICKY_TABS,
  type RecordAction,
} from "@/components/record-chrome"
import { MARK_GROUP, typeMark } from "@/lib/type-marks"
import { useFollowNewest } from "@shared/web/follow-newest"
import { formatRelative } from "@shared/web/format"
import { personName } from "@/lib/identity"
import { usePermissions } from "@/lib/perms"
import { invalidate, primeCache, useCached, useCachedValue } from "@shared/web/store"
import { formatCount } from "@shared/web/format-count"
import { recordActivityKey, useRecordActivity } from "@/lib/use-record-activity"
import { HelpAttachmentsPanel, helpAttachmentsKey } from "@/components/help-attachments"
import { HelpFormDialog } from "@/components/help-form-dialog"
import { HelpStakeholders } from "@/components/help-stakeholders"
import { HelpStatusStepper } from "@/components/help-status-stepper"
import { HELP_STATUS } from "@/components/deep-link/shape"
import { ResolveDialog, type ResolveFormValues } from "@/components/resolve-dialog"
import { StoriesPanel } from "@/components/work-panels"
import { RecordTimerButton } from "@/components/timer-bar"
import { OverviewList } from "@/components/overview-list"
import { ActivityPanel } from "@/components/activity-panel"
import { totalKey } from "@/lib/live-resources"
import { CONCEPT_ICON } from "@/lib/pages"
import { useT } from "@shared/web/language"
import { RichText } from "@shared/web/rich-text-view"
import { richTextPlain } from "@shared/web/rich-text"

// LIBRARY ⇄ SERVER status. These were one-to-one until the work engine gave the
// ticket its five states (SCOPE ch.07); the library's `TicketStatus` has four,
// and the library is a separate repo we do not edit from here (UI-CONVENTIONS,
// "the library is lego"). So this is a MAPPING, not a mismatch — and the
// narrowing only reaches the library's own badge, because the real control is
// HelpStatusStepper below, which speaks all five.
const TO_LIBRARY: Record<HelpTicket["status"], TicketStatus> = {
  // Waiting on the client, raised and unread, and read but not begun are all
  // "with us, nothing has started".
  awaiting_validation: "open",
  new: "open",
  triaged: "open",
  // Booked into a sprint IS in motion as far as the library's four words go:
  // there is a date on it now, which is the fact "open" would hide.
  scheduled: "in-progress",
  in_progress: "in-progress",
  // Every story is done and the client has not been told yet — still in motion,
  // because the telling is the part that finishes it.
  ready: "in-progress",
  resolved: "resolved",
}
/** The one map every ticket screen reads. Imported rather than retyped here: this
 * file used to keep its own copy, and a copy is how the list and the record end
 * up calling the same fact two different things. */
const STATUS_LABEL = HELP_STATUS

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
  const t = useT()
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
  // Logging time is `work:create` — the right the start/stop door itself gates
  // on, so the button offers exactly what the server would accept. It is WORK's
  // right and not the ticket's: answering a request and putting hours on the
  // team's timesheet are two different things a role may grant separately.
  const canLogTime = can("work", "create")

  const [tab, setTab] = React.useState("conversation")
  const [editing, setEditing] = React.useState(false)
  const [resolving, setResolving] = React.useState(false)
  const [translating, setTranslating] = React.useState(false)
  const [statusBusy, setStatusBusy] = React.useState(false)
  // R16: the Files and links tab badges the door's exact COUNT(*).
  const attachmentsTotal = useCachedValue<number>(`total:${helpAttachmentsKey(helpId)}`)
  // THE WORK ANSWERING THIS REQUEST. One story may answer many tickets and one
  // ticket may need many stories (the owner's ruling), so this is a collection
  // on the record rather than a field on it. Its exact total badges the tab.
  const storiesTotal = useCachedValue<number>(totalKey("stories-ticket", helpId))
  const host = { base: basePath.replace(/\/tickets$/, "") }

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

  /** THE THREE ACTS THAT ARE LEFT. Everything else about this ticket's stage now
   * happens by itself — a sprint is picked, a timer starts, the last story
   * closes — so what a person can still DO is named rather than picked from a
   * dropdown of seven (CHECKLIST 5.2).
   *
   * `run` is the shape all three share: do it, say plainly if it was refused,
   * re-prime the list cache and the record's own history. */
  async function run(what: () => Promise<{ tickets: HelpTicket[] } | void>, done: string, fallback: string) {
    setStatusBusy(true)
    try {
      const r = await what()
      if (r && "tickets" in r) primeCache(`help:${teamId}`, r.tickets)
      invalidate(`help:${teamId}`)
      invalidate(recordActivityKey("help", helpId))
      toast.success(done)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : fallback)
    } finally {
      setStatusBusy(false)
    }
  }

  /** ANSWER IT AND TELL THEM (CHECKLIST 5.6 + 5.7). The door refuses without the
   * words, which is 5.6 stated where it can be enforced; the send goes to the
   * person who raised it and that client's main stakeholder, which is 5.7 and
   * Aurora's ts3 over the owner's "raiser only".
   *
   * A ticket already answered comes back `alreadyResolved` and emails nobody —
   * R17 is the send guard, so a second press is not a second answer. */
  async function resolve(values: ResolveFormValues) {
    const r = await content.resolveHelp(helpId, values.resolution)
    invalidate(`help:${teamId}`)
    invalidate(`help-thread:${helpId}`)
    invalidate(recordActivityKey("help", helpId))
    toast.success(r.alreadyResolved ? "Already answered." : "Answered, and they've been told.")
  }

  async function editTicket(input: {
    description: string
    helpType?: string
    accountId?: string
    appId?: string
    raisedByContactId?: string
  }) {
    const { tickets } = await content.updateHelp({
      id: helpId,
      description: input.description,
      helpType: input.helpType,
      // Naming the client on a ticket that has none. Once it has one the form
      // sends the SAME id back and the door leaves it where it is; it refuses a
      // DIFFERENT one, which is the case this field must never quietly cause.
      accountId: input.accountId,
      // Both correctable, unlike the client: a request filed against the wrong
      // system, or a colleague who actually raised it, are ordinary mistakes.
      appId: input.appId,
      raisedByContactId: input.raisedByContactId,
    })
    primeCache(`help:${teamId}`, tickets)
    invalidate(recordActivityKey("help", helpId))
    toast.success(t("Ticket updated."))
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

  /** TRANSLATE AND SET IT. The door spends one unit of the team's AI allowance
   * and refunds it if nothing usable came back, so a failure here costs nothing
   * but the second it took. */
  async function translate() {
    setTranslating(true)
    try {
      await dataOps.translateTicket(helpId)
      invalidate(`help:${teamId}`)
      toast.success(t("Translated."))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't translate that.")
    } finally {
      setTranslating(false)
    }
  }

  if (ticketsQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the ticket.")}</p>
  if (ticketsQ.data === undefined) return <Skeleton variant="list" lines={4} />
  if (!ticket) return <p className="text-muted-foreground text-sm">{t("That ticket no longer exists.")}</p>

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
    { label: t("Type"), value: ticket.helpType || "General" },
    // WHICH SYSTEM, AND WHO ASKED (CHECKLIST 5.8 + 5.9). "Who asked" is not "who
    // typed": most of a client's history is written down on their behalf, so the
    // contact and the audit line below are two different people more often than
    // they are one.
    { label: t("App"), value: ticket.appName || "" },
    { label: t("Raised by"), value: ticket.raisedByContactName || "" },
    // BOTH TITLES, and the German one first when it is the original. 788 of the
    // requests arriving from the previous system exist ONLY in German (BUILD-1
    // §8), so "the title" is two fields here and the screen says so rather than
    // picking one and hoping.
    { label: t("Title"), value: ticket.titleDe || "" },
    { label: t("Title (English)"), value: ticket.titleEn || "" },
    { label: t("Raised from"), value: ticket.sourceScreen || "" },
    // The audit rows are NOT here any more: created-by and last-edited-by moved
    // to the footer at the foot of the record (D7 / CHECKLIST 11.3), where they
    // stop pushing the ticket's own facts below the fold. The status is on the
    // header band's own line.
    { label: t("Resolved"), value: ticket.resolvedAt ? formatRelative(ticket.resolvedAt) : "" },
  ]


  const tabsConfig = {
    ...defaultTabsConfig,
    variant: "line" as const,
    tabs: [
      {
        value: "conversation",
        label: t("Conversation"),
        icon: "messages-square",
        badge: formatCount(threadTotal),
        badgeVariant: "" as const,
      },
      { value: "overview", label: t("Overview"), icon: "info", badge: "", badgeVariant: "" as const },
      {
        value: "activity",
        label: t("Activity"),
        icon: "history",
        badge: formatCount(activity.total),
        badgeVariant: "" as const,
      },
      {
        value: "stories",
        label: t("Related stories"),
        icon: CONCEPT_ICON.stories,
        badge: formatCount(storiesTotal),
        badgeVariant: "" as const,
      },
      {
        value: "files",
        label: t("Files and links"),
        icon: "paperclip",
        badge: formatCount(attachmentsTotal),
        badgeVariant: "" as const,
      },
      {
        value: "stakeholders",
        label: t("Stakeholders"),
        icon: "users",
        // The stakeholder set is COMPUTED in full (raiser + admins + mentions + adds),
        // not a capped table read — its size IS the true total, shown via the one seam.
        badge: stakeholderBadge,
        badgeVariant: "" as const,
      },
    ],
  }

  /* ONE PRIMARY, ONE SECONDARY, AND A MENU (UI-RULEBOOK B1, CHECKLIST 11.2).
   *
   * This title carried six controls and was the worst case in the app. The
   * ranking picks the two that stay: the act that MOVES THE TICKET FORWARD is
   * the primary (confirming it, or answering it — only ever one of the two is
   * offered, because they belong to different stages), and the clock is the
   * secondary, because logging time is the thing somebody does on a ticket most
   * often that is not destructive.
   *
   * Translate, Edit and Archive go into the three-dot menu. None of them loses
   * its confirm or its colour by moving. */
  const overflow: RecordAction[] = [
    // TRANSLATE, on a ticket that has a German title and no English one yet. It
    // SETS the field rather than showing a preview (BUILD-1 §8): a preview is a
    // thing one person reads once, and a set field is a thing the whole team,
    // the search and the assistant read afterwards. It disappears the moment
    // there is an English title, because there is then nothing to ask for.
    ...(canEdit && ticket.titleDe && !ticket.titleEn
      ? [
          {
            key: "translate",
            label: translating ? t("Translating…") : t("Translate"),
            icon: <Languages className="size-3.5" />,
            disabled: translating,
            onSelect: () => void translate(),
          },
        ]
      : []),
    ...(canEdit
      ? [
          {
            key: "edit",
            label: t("Edit"),
            icon: <Pencil className="size-3.5" />,
            onSelect: () => setEditing(true),
          },
        ]
      : []),
    // PUT IT AWAY. Available from any state (SCOPE ch.07), destructive in colour
    // because it takes the request out of the everyday lists, and reversible,
    // which the confirm-free restore says out loud.
    ...(canEdit
      ? [
          ticket.archivedAt
            ? {
                key: "unarchive",
                label: t("Take it back out"),
                icon: <ArchiveRestore className="size-3.5" />,
                disabled: statusBusy,
                onSelect: () => void setArchived(false),
              }
            : {
                key: "archive",
                label: t("Archive"),
                icon: <Archive className="size-3.5" />,
                disabled: statusBusy,
                destructive: true,
                onSelect: () => void setArchived(true),
              },
        ]
      : []),
  ]

  const actions = (
    <>
      {/* THE CLIENT SAYS YES (CHECKLIST 5.13). Staff press it for the answer that
          arrives by phone; the client presses the same door in their own portal.
          It appears only while the request is actually waiting, and disappears
          the moment it is not, a control that can only be refused should not be
          a control. */}
      {ticket.status === "awaiting_validation" && (
        <Button
          disabled={statusBusy}
          onClick={() =>
            void run(
              () => content.validateHelp(helpId),
              "Confirmed, it's in the queue.",
              "Couldn't confirm that."
            )
          }
          className="shrink-0 gap-1.5"
        >
          <CheckCheck className="size-3.5" />
          {t("They've confirmed it")}
        </Button>
      )}
      {/* ANSWER IT AND TELL THEM. Offered from READY onward, the stage that means
          every piece of work is done and only the telling is left, and never on a
          ticket already answered. The panel is where the words are written,
          because the door refuses without them (5.6). */}
      {canEdit && ticket.status === "ready" && (
        <Button disabled={statusBusy} onClick={() => setResolving(true)} className="shrink-0 gap-1.5">
          <Send className="size-3.5" />
          {t("Answer and close")}
        </Button>
      )}
      {/* THE CLOCK ON A REQUEST. Reading, triaging and resolving one is real work
          and BUILD-1 §5 is explicit that it is loggable against the request. */}
      <RecordTimerButton
        teamId={teamId}
        targetTable="help"
        targetId={helpId}
        canLog={canLogTime}
        disabled={ticket.status === "resolved"}
      />
      <RecordActionsMenu actions={overflow} />
    </>
  )

  return (
    <RecordScreen
      // The glyph the team set beside this ticket type on the Dropdown values
      // screen, in the square the header band keeps for it (G3).
      mark={typeMark(selectableQ.data, MARK_GROUP.ticket, ticket.helpType)}
      // D4: the type word and THE NUMBER THE CLIENT QUOTES, above the title. The
      // reference had existed on this record since the work engine landed and
      // appeared on no screen — the one thing a person needs when a client rings
      // up saying "about BERG-T0412".
      eyebrow={[ticket.helpType || t("Ticket"), ticket.ref, ticket.archivedAt ? t("Archived") : null]
        .filter(Boolean)
        .join(" · ")}
      // The description is rich text now, and a TITLE is one line: the words,
      // without the markup they were typed with. The body renders formatted in
      // the conversation below, which is where a person reads it.
      title={richTextPlain(ticket.description)}
      // D5: one line, three facts at most.
      status={[STATUS_LABEL[ticket.status], ticket.appName, ticket.raisedByContactName]
        .filter(Boolean)
        .join(" · ")}
      actions={actions}
      /* A STATUS IS A FACT, NOT A BUTTON. The track still says how far along the
         request is, because that is what a track is for — it simply is not
         something anybody can press (CHECKLIST 5.2). */
      headerExtra={<HelpStatusStepper status={ticket.status} />}
    >
      <TabsView
        className={STICKY_TABS}
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(t) => {
          if (t.value === "overview")
            return <OverviewList items={overviewItems} />
          if (t.value === "activity")
            return <ActivityPanel activity={activity} />
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
                emptyText="No work written down against this request yet."
              />
            )
          if (t.value === "files")
            return <HelpAttachmentsPanel ticketId={helpId} canEdit={can("help", "read")} />
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
                description: <RichText html={ticket.description} />,
                type: ticket.helpType || "General",
                status: TO_LIBRARY[ticket.status],
                fromScreen: ticket.sourceScreen ? { label: ticket.sourceScreen } : undefined,
              }}
              replies={replies}
              members={mentionableMembers}
              // NEITHER CONTROL. `showStatusControl` was already off; `canResolve`
              // is off now too, because the library's resolve button moves a
              // status with no words attached and CHECKLIST 5.6 says resolving is
              // refused until a resolution is written. The one way to answer this
              // ticket is the panel on the title, which sends what a person typed.
              canResolve={false}
              showStatusControl={false}
              onReply={onReply}
            />
          )
        }}
      />

      {/* D7 / CHECKLIST 11.3: who made it and who last touched it, grey, at the
          foot of the record rather than five rows in the middle of Overview. */}
      <RecordFooter
        audit={{
          createdByName: ticket.raiserName,
          createdAt: ticket.createdAt,
          editedByName: ticket.editorName,
          updatedAt: ticket.updatedAt,
        }}
      />

      <ResolveDialog
        open={resolving}
        onOpenChange={setResolving}
        draft={ticket.draftResolution}
        draftKey={`help:resolve:${helpId}`}
        onSubmit={resolve}
      />

      <HelpFormDialog
        open={editing}
        onOpenChange={setEditing}
        draftKey={`help:edit:${helpId}`}
        teamId={teamId}
        helpTypeOptions={helpTypeOptions}
        initial={{
          description: ticket.description,
          helpType: ticket.helpType,
          accountId: ticket.accountId,
          appId: ticket.appId,
          raisedByContactId: ticket.raisedByContactId,
        }}
        onSubmit={editTicket}
      />
    </RecordScreen>
  )
}
