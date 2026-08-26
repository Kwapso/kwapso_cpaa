"use client"

// Ticket detail — one ticket as a tabbed record: a status STEPPER (the hero control)
// above Conversation / Overview / Activity tabs. Conversation = the chat (library
// TicketThread), Overview = audit metadata (OverviewList), Activity = the
// ticket's history (the GENERIC record-activity feed). Edit + every status move are
// gated PURELY by help:edit. Replies echo instantly (optimistic) and reconcile with
// the server reply. Host-composed, like role-detail.

import * as React from "react"

import { Button } from "@shared/ui/controls/button/button"
import { Skeleton } from "@shared/ui/controls/skeleton/skeleton"
import { Badge } from "@shared/ui/controls/badge/badge"
import { toast } from "@shared/ui/controls/sonner/sonner"
import { TabsView, defaultTabsConfig } from "@shared/web/screen-engine/tabs-view"
import { TicketThread } from "@shared/ui/structures/ticket-thread/ticket-thread"

// The old library's thread exported this; the kit's thread is messages-only,
// so the app owns the word now: who can be @mentioned.
type TicketMember = { id: string; name: string }
import { ArchiveRestore, Archive, CheckCheck, Languages, Pencil, Send } from "@shared/ui/icons"

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
import { MARK_GROUP, markMap, typeMark } from "@/lib/type-marks"
import { useFollowNewest } from "@shared/web/follow-newest"
import { formatRelative } from "@shared/web/format"
import { assignableMembers } from "@/lib/members"
import { usePermissions } from "@/lib/perms"
import { mergePage, invalidate, primeCache, useCached, useCachedValue } from "@shared/web/store"
import { formatCount } from "@shared/web/format-count"
import { recordActivityKey, useRecordActivity } from "@/lib/use-record-activity"
import { useRecordCounts } from "@/lib/use-record-counts"
import { HelpAttachmentsPanel, helpAttachmentsKey } from "@/components/help-attachments"
import { HelpFormDialog } from "@/components/help-form-dialog"
import { HelpStakeholders } from "@/components/help-stakeholders"
import { HelpStatusStepper } from "@/components/help-status-stepper"
import { HELP_STATUS } from "@/components/deep-link/shape"
import { ResolveDialog, type ResolveFormValues } from "@/components/resolve-dialog"
import { StoryFormDialog } from "@/components/story-form-dialog"
import { createStoryFrom, useStoryFormOptions } from "@/components/stories-screen"
import { StoriesPanel, sliceKey } from "@/components/work-panels"
import { WorkLogsPanel, workLogsTotalKey } from "@/components/work-logs-panel"
import { RecordTimerButton } from "@/components/timer-bar"
import { OverviewList } from "@/components/overview-list"
import { ActivityPanel } from "@/components/activity-panel"
import { TranslateAction, useHumanTranslation } from "@/components/translate-human-text"
import { totalKey } from "@/lib/live-resources"
import { CONCEPT_ICON } from "@/lib/pages"
import { useT } from "@shared/web/language"
import { RichText } from "@shared/web/rich-text-view"
import { richTextPlain } from "@shared/web/rich-text"

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
    content.help().then((r) => r.tickets)
  )
  // TICKETS ARE THE GROWING COLLECTION (R14), SO THIS LIST IS A PAGE.
  //
  // THE OWNER, 26 Aug 2026, opening a ticket from Triage: "That ticket no longer
  // exists." It existed. It was ticket 1,030 of 1,820 in staging, and this line
  // was the whole of the lookup — a `find` over the newest fifty. Every ticket
  // past the cursor was unreachable by direct link, from the triage queue, from
  // an email button, from a bookmark, and the screen said the most alarming
  // thing it could: that the record was gone.
  //
  // The door has answered `?id` since paging landed, and says why in its own
  // comment ("One ticket by id is a LOOKUP, not a page"). `content.helpOne` was
  // written for it. Nothing had ever called either.
  //
  // Page one first, so a ticket that IS loaded paints with no round trip
  // (CACHING.md is cache-first), and the by-id read only when it is not — the
  // same shape meeting-detail and knowledge-detail already use. The `:one:` key
  // is registered in the live registry beside `help`, or a status change would
  // patch the list and leave this screen showing yesterday.
  const inPage = ticketsQ.data?.find((t) => t.id === helpId) ?? null
  const oneQ = useCached<HelpTicket | null>(
    ticketsQ.data !== undefined && !inPage ? `help:one:${helpId}` : null,
    () => content.helpOne(helpId)
  )
  const ticket = inPage ?? oneQ.data ?? null

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
  // THE BADGES, BEFORE THE CLICK — the work written down against this request,
  // and what is attached to it. One bounded read of both totals when the ticket
  // opens; the rows behind each tab stay lazy (lib/use-record-counts).
  useRecordCounts("help", helpId)
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
  // WRITING WORK DOWN IS THE WORK MODULE'S RIGHT, NOT THE TICKET'S. A person who
  // may read and answer requests is not necessarily a person who may put things
  // on the team's backlog, so the button on the Related stories tab asks the
  // right the STORY door itself gates on (`work:create`) rather than any `help:*`
  // right — the child's right, never the parent's. The door decides either way
  // (R10); this only decides whether we draw a button that would come back 403.
  const canWriteWork = can("work", "create")
  // THE TIME AGAINST THIS REQUEST. Reading it is `work:read` and correcting a row
  // is `work:edit` — the two rights those doors gate on, and neither of them is a
  // ticket right: answering a request and reading the team's timesheet are
  // different things a role may grant separately. A role without `work:read` sees
  // no tab at all rather than a tab that refuses.
  const canSeeTime = can("work", "read")
  const canEditTime = can("work", "edit")
  // R16: the door's exact COUNT(*) over this record's time, fetched by the panel
  // and read back here for the badge.
  const timeTotal = useCachedValue<number | null>(workLogsTotalKey("help", helpId))

  const [tab, setTab] = React.useState("conversation")
  const [editing, setEditing] = React.useState(false)
  // NEW WORK AGAINST THIS REQUEST — and this is NOT "make it a story".
  //
  // CHECKLIST 3.10 took away three controls that CONVERTED a request into a
  // piece of work (the button on the title, the prompt after triage, and this
  // tab's create action), and the first two were right to go: a ticket never
  // becomes a story, it is answered by however many stories the work turns out
  // to need. The third was collateral damage. Writing a NEW story that ANSWERS
  // this request is a different act from turning the request into one, and it is
  // the act that gets a ticket to triaged: the stepper cannot move until there
  // is work booked against it, and until 18 Aug 2026 there was no way to book
  // any from the record you were standing on.
  //
  // So the distinction is this, and it is the reason the two must not be
  // re-merged: the ticket is UNCHANGED by this. Nothing about it is consumed,
  // renamed or replaced — a second story on the same request is as ordinary as
  // the first, which is precisely what a conversion could never express.
  const [storyOpen, setStoryOpen] = React.useState(false)
  const [resolving, setResolving] = React.useState(false)
  const [translating, setTranslating] = React.useState(false)
  const [statusBusy, setStatusBusy] = React.useState(false)
  // R16: the Files and links tab badges the door's exact COUNT(*). `null` there
  // is the third answer beside a number and an absence — the role may not read
  // the module (R18) — and it renders as nothing, exactly as a zero does.
  const attachmentsTotal = useCachedValue<number | null>(`total:${helpAttachmentsKey(helpId)}`)
  // THE WORK ANSWERING THIS REQUEST. One story may answer many tickets and one
  // ticket may need many stories (the owner's ruling), so this is a collection
  // on the record rather than a field on it. Its exact total badges the tab.
  const storiesTotal = useCachedValue<number | null>(totalKey("stories-ticket", helpId))
    // NEST, DON'T REPLACE. This used to strip the collection segment off the path
  // before the panels appended to it, so opening a related record from here
  // threw away the record you opened it FROM — a story reached from a client
  // landed on /stories/<id> with no way back to the client. The base is now this
  // record's own address, so a related record lands INSIDE it and the trail is
  // in the URL for the crumbs, the Back button and anybody you send it to.
  const host = { base: `${basePath}/${helpId}` }
  // WHAT A STORY NEEDS TO BE WRITTEN AT ALL — the same four lists the backlog,
  // the sprint and the app hand this form. A hook, so it sits above the early
  // returns below; every list it reads is a cache another screen already holds.
  const options = useStoryFormOptions(teamId)

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

  // READ THIS CONVERSATION IN YOUR OWN LANGUAGE, if you ask. The whole screen's
  // human-typed words go in one array — the request AND every reply on it — so
  // one press is one call rather than one per paragraph. Nothing is written: the
  // ticket still says exactly what the client typed, and "Show original" puts it
  // straight back. A hook, so it sits above the three early returns below.
  const translation = useHumanTranslation(teamId, [
    ticket?.description,
    ...replyRows.map((r) => r.body),
  ])

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
      // Merge the page the door already returned — this used to prime and then
      // invalidate the SAME key one line later, so the fresh page was thrown
      // away and refetched (the ~1s rebuild, measured; round-two speed review).
      if (r && "tickets" in r) {
        mergePage(`help:${teamId}`, "id", r.tickets as unknown as Record<string, unknown>[])
        const extras = r as { byType?: Record<string, number>; byStatus?: Record<string, number> }
        if (extras.byType) primeCache(`help-by-type:${teamId}`, extras.byType)
        if (extras.byStatus) primeCache(`help-by-status:${teamId}`, extras.byStatus)
      } else invalidate(`help:${teamId}`)
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
    toast.success(r.alreadyResolved ? t("Already answered.") : t("Answered, and they've been told."))
  }

  /** THE WHOLE FORM, FORWARDED — never a hand-listed copy of it.
   *
   * THE OWNER, 26 Aug 2026: "there are some fields in many screens that don't
   * get saved in the edit screen. One example… the ticket modules are not
   * getting saved."
   *
   * This rebuilt the payload field by field, and `moduleId` was not among them.
   * The form offered the picker, the person chose a module, the door was ready
   * to write it — and this function quietly dropped it between the two. Nothing
   * errored, the toast said "Ticket updated", and the field came back as it was.
   *
   * TypeScript could not see it: a handler that accepts FEWER properties is
   * assignable to one that supplies more, so narrowing the parameter type hid
   * the omission rather than reporting it. The two other screens that open this
   * form pass their argument WHOLE (`{ id, ...input }`), which is why the same
   * edit saved from the tickets list and not from here.
   *
   * So it spreads. The door decides what it accepts; this is a courier. */
  async function editTicket(input: {
    description: string
    helpType?: string
    // Naming the client on a ticket that has none. Once it has one the form
    // sends the SAME id back and the door leaves it where it is; it refuses a
    // DIFFERENT one, which is the case this field must never quietly cause.
    accountId?: string
    // These three are correctable, unlike the client: a request filed against
    // the wrong system, the wrong section of it, or a colleague who actually
    // raised it, are all ordinary mistakes.
    appId?: string
    moduleId?: string
    raisedByContactId?: string
  }) {
    const { tickets, byType, byStatus } = await content.updateHelp({ id: helpId, ...input })
    // Merge, don't replace: priming the whole key with this first page threw
    // away rows scrolled in past it (same seam-fix as the collection's edit).
    mergePage(`help:${teamId}`, "id", tickets as unknown as Record<string, unknown>[])
    if (byType) primeCache(`help-by-type:${teamId}`, byType)
    if (byStatus) primeCache(`help-by-status:${teamId}`, byStatus)
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
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't post your reply."))
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
      toast.success(archived ? t("Put away.") : t("Taken back out."))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't change that."))
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
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't translate that."))
    } finally {
      setTranslating(false)
    }
  }

  if (ticketsQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the ticket.")}</p>
  // …AND NOT WHILE THE BY-ID READ IS STILL GOING. "That ticket no longer exists"
  // is a claim, and a claim made before the only read that could disprove it has
  // answered is a lie that happens to be quick.
  if (ticketsQ.data === undefined || (!inPage && oneQ.data === undefined && !oneQ.error))
    return <Skeleton variant="list" lines={4} />
  if (!ticket) return <p className="text-muted-foreground text-sm">{t("That ticket no longer exists.")}</p>

  // WHO YOU CAN TAG. Our own people, minus yourself. A client login is an
  // ordinary team member and used to be offered here, which would have put a
  // "you were mentioned" email in a client's inbox about our internal note —
  // and the portal has never offered mentions in the other direction, on
  // purpose. The one seam decides (lib/members).
  const mentionableMembers: TicketMember[] = assignableMembers(membersQ.data).filter(
    (m) => m.id !== myUserId
  )

  const replies = (repliesQ.data ?? []).map((r) => ({
    id: r.id,
    author: r.authorName || "Member",
    time: formatRelative(r.createdAt, t),
    // The reply as the reader asked for it: what was typed, or the translation
    // they pressed for. Never both, and never a stored rewrite of somebody's
    // words — `of` is a lookup, not a save.
    body: translation.of(r.body),
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
    { label: t("Resolved"), value: ticket.resolvedAt ? formatRelative(ticket.resolvedAt, t) : "" },
  ]


  const tabsConfig = {
    ...defaultTabsConfig,
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
      // WORK LOGS, wherever time can be tracked (CHECKLIST 6.8). A ticket has
      // carried a start/stop timer in its own header since the work engine
      // shipped, and no screen showed what that timer had produced — so the hours
      // on a request could be logged and never read back on the record they were
      // logged against.
      ...(canSeeTime
        ? [
            {
              value: "time",
              label: t("Work logs"),
              icon: CONCEPT_ICON.time,
              badge: formatCount(timeTotal),
              badgeVariant: "" as const,
            },
          ]
        : []),
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
    // GIVE THE TICKET AN ENGLISH TITLE, on one that has a German title and no
    // English one yet. It SETS the field rather than showing a preview (BUILD-1
    // §8): a preview is a thing one person reads once, and a set field is a
    // thing the whole team, the search and the assistant read afterwards. It
    // disappears the moment there is an English title, because there is then
    // nothing to ask for.
    //
    // IT IS NAMED FOR WHAT IT WRITES, not for what it does on the way, because
    // the conversation below now carries a Translate of its own that changes
    // nothing and belongs to one reader. Two buttons called "Translate", one
    // permanent and team-wide and one personal and temporary, is the kind of
    // thing somebody presses once and never trusts again.
    ...(canEdit && ticket.titleDe && !ticket.titleEn
      ? [
          {
            key: "translate",
            label: translating ? t("Translating…") : t("Set an English title"),
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
          className="shrink-0 gap-1"
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
        <Button disabled={statusBusy} onClick={() => setResolving(true)} className="shrink-0 gap-1">
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
      // the conversation below, which is where a person reads it. Translated
      // FIRST, then flattened — a title has to say what the reader just chose.
      title={richTextPlain(translation.of(ticket.description))}
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
        renderPanel={(panel) => {
          if (panel.value === "overview")
            return <OverviewList items={overviewItems} />
          if (panel.value === "activity")
            return <ActivityPanel activity={activity} />
          // A TAB ON THE TICKET WHERE MORE WORK CAN BE ADDED. One story may
          // answer many tickets and one ticket may need many stories, so this is
          // a collection with its own create action — and the button is the
          // create action the comment above it had been promising while handing
          // the panel no `onNew` at all. See the note on `storyOpen` for why
          // adding work here is not the "make it a story" that was removed.
          if (panel.value === "stories")
            return (
              <StoriesPanel
                marks={markMap(selectableQ.data, MARK_GROUP.story)}
                ownerKind="ticket"
                ownerId={helpId}
                filter={{ ticketId: helpId }}
                host={host}
                onNew={canWriteWork ? () => setStoryOpen(true) : undefined}
                emptyText={t("No work written down against this ticket yet.")}
              />
            )
          if (panel.value === "time")
            return (
              <WorkLogsPanel
                targetTable="help"
                targetId={helpId}
                recordLabel={[ticket.ref, richTextPlain(ticket.description)].filter(Boolean).join(" · ")}
                canEdit={canEditTime}
                canLog={canLogTime}
                onActivityChanged={() => invalidate(recordActivityKey("help", helpId))}
              />
            )
          if (panel.value === "files")
            // help:EDIT since the door tightened (e36b254) — read kept the
            // button visible and every press a 403.
            return <HelpAttachmentsPanel ticketId={helpId} canEdit={can("help", "edit")} />
          if (panel.value === "stakeholders")
            return (
              <HelpStakeholders
                stakeholders={stakeholdersQ.data ?? []}
                members={assignableMembers(membersQ.data)}
                canAdd={can("help", "read")}
                onAdd={addStakeholder}
              />
            )
          return (
            <>
              {/* READ IT IN YOUR OWN LANGUAGE — above the conversation, because
                  the conversation is what it acts on. Inline rather than in the
                  three-dot menu: this is a thing somebody presses while reading
                  and presses back a moment later, and it must not be hidden
                  behind a click for a person who cannot read the screen. */}
              <div className="flex justify-end">
                <TranslateAction translation={translation} />
              </div>
              {/* The kit's thread is messages + composer; the old library's
                  carried the ticket header, a status control and an @mention
                  autocomplete inside it. The header rides in the kit's `banner`
                  slot; the status controls stay off exactly as before (the one
                  way to answer this ticket is the panel on the title); and a
                  mention is now read OUT OF the sent text by name-match against
                  the same members list the autocomplete used to offer —
                  autocomplete itself needs a kit spec (logged for Aurora). */}
              <TicketThread
                banner={
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="secondary">{ticket.helpType || t("General")}</Badge>
                    {ticket.sourceScreen && (
                      <span className="text-muted-foreground">{ticket.sourceScreen}</span>
                    )}
                  </div>
                }
                messages={[
                  {
                    id: "description",
                    side: "theirs",
                    author: ticket.raisedByContactName || ticket.raiserName || undefined,
                    body: <RichText html={translation.of(ticket.description)} />,
                  },
                  ...replies.map((r) => ({
                    id: r.id,
                    side: "mine" as const,
                    author: r.author,
                    authorMeta: r.aiDrafted ? t("AI drafted") : undefined,
                    time: r.time,
                    body: typeof r.body === "string" ? <RichText html={r.body} /> : r.body,
                  })),
                ]}
                composer
                onSend={(body) =>
                  onReply(
                    body,
                    [],
                    mentionableMembers.filter((m) => body.includes(`@${m.name}`))
                  )
                }
              />
            </>
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

      {/* NEW WORK ON THIS REQUEST. The ticket rides in as `fixedTicket`: the
          request behind the work is a fact about where you are standing, not a
          question, so it is shown rather than offered and cannot be mistyped.
          The app is left as a question, because a request about one system is
          often answered by work on another.

          The story arrives ALREADY RELATED — that relation is the entire point,
          and it is what makes the list behind this dialog move. `createStoryFrom`
          drops the backlog and the sprints; the slice this record reads is
          dropped here, because it is the one cache that knows about this ticket.
          Everyone else's screen is patched by the publish the door already
          sends (R1/R15). */}
      <StoryFormDialog
          teamId={teamId}
        open={storyOpen}
        onOpenChange={setStoryOpen}
        sprints={options.sprints}
        apps={options.apps}
        fixedTicket={{
          // The same words the picker on this form would have shown, through the
          // same plain-text seam the header uses — a request written in rich text
          // must not arrive in the dialog wearing its markup.
          id: helpId,
          label: [ticket.ref, richTextPlain(ticket.description)].filter(Boolean).join(" · "),
        }}
        tickets={options.tickets}
        members={options.members}
        appStaff={options.appStaff}
        processes={options.processes}
        storyTypes={options.storyTypes}
        draftKey={`story:add:ticket:${helpId}`}
        onSubmit={async (v) => {
          await createStoryFrom(teamId, { ...v, ticketId: helpId }, t)
          invalidate(sliceKey("stories-ticket", helpId))
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
          moduleId: ticket.moduleId,
          raisedByContactId: ticket.raisedByContactId,
        }}
        onSubmit={editTicket}
        helpId={helpId}
        canAttach={canEdit}
      />
    </RecordScreen>
  )
}
