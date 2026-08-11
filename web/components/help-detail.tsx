"use client"

// Help detail — one ticket as a tabbed record: a status STEPPER (the hero control)
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
import { Pencil } from "lucide-react"

import type {
  HelpMessage,
  HelpStakeholder,
  HelpTicket,
  SelectableValue,
  TeamMember,
} from "@shared/types"
import { ApiFailure, content, tenancy } from "@/lib/api"
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
import { HelpStakeholders } from "@/components/help-stakeholders"
import { HelpStatusStepper, type HelpStatusValue } from "@/components/help-status-stepper"

// library (hyphen) ⇄ server (underscore) status — only "in progress" differs.
const TO_SERVER: Record<TicketStatus, HelpTicket["status"]> = {
  open: "open",
  "in-progress": "in_progress",
  resolved: "resolved",
  reopened: "reopened",
}
const TO_LIBRARY: Record<HelpTicket["status"], TicketStatus> = {
  open: "open",
  in_progress: "in-progress",
  resolved: "resolved",
  reopened: "reopened",
}
const STATUS_LABEL: Record<HelpTicket["status"], string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  reopened: "Reopened",
}

export function HelpDetailScreen({
  teamId,
  helpId,
  myUserId,
}: {
  teamId: string
  helpId: string
  myUserId: string | null
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

  const [tab, setTab] = React.useState("conversation")
  const [editing, setEditing] = React.useState(false)
  const [statusBusy, setStatusBusy] = React.useState(false)

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
    .filter((v) => v.type === "Help type")
    .map((v) => v.value)

  async function changeStatus(next: HelpStatusValue) {
    setStatusBusy(true)
    try {
      const { tickets } = await content.setHelpStatus(helpId, next)
      primeCache(`help:${teamId}`, tickets)
      invalidate(recordActivityKey("help", helpId))
      toast.success("Status updated.")
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
        <div className="flex items-start gap-3">
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{ticket.description}</p>
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
        </div>
        <HelpStatusStepper
          status={ticket.status}
          canEdit={canEdit}
          onChange={(n) => void changeStatus(n)}
          busy={statusBusy}
        />
      </div>

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
