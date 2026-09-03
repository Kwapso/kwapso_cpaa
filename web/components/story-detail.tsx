"use client"

// STORY DETAIL — one piece of work at /stories/<id>, as a tabbed record (Law
// R2): Overview / Time / Activity.
//
// A story row in the backlog opened NOTHING before this: the recipe registry
// pointed at a story-detail.tsx that had never been written, so tapping a story
// resolved to "that screen doesn't exist". It is the record the whole work
// engine converges on — the only place an assignee and a due date live, the
// thing time is logged against, and the thing whose closing note becomes what a
// client is eventually told — so it is also where the cross-links belong: up to
// its app, its sprint and the request it answers.
//
// Host-composed: the status STEPPER and the time logged against it are controls
// no engine block draws.

import * as React from "react"

import { Badge } from "@shared/ui/components/badge/badge"
import { Button } from "@shared/ui/components/button/button"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { toast } from "@shared/ui/components/sonner/sonner"
import { TabsView } from "@shared/web/screen-engine/tabs-view"
import { useRemembered } from "@shared/web/remembered"
import { Check, CheckSquare, PencilSimple } from "@shared/ui/foundations/icons"

import { StoryFormDialog, type StoryFormValues } from "@/components/story-form-dialog"
import { ReviewDialog, type ReviewFormValues } from "@/components/review-dialog"
import { useStoryFormOptions } from "@/components/stories-screen"
import { STORY_STATUS_LABEL } from "@/components/work-panels"
import { storyStatusDotTone } from "@shared/status-tones"
import { WorkLogsPanel, workLogsTotalKey } from "@/components/work-logs-panel"
import { StoryAttachmentsPanel } from "@/components/story-attachments"
import { RecordTimerButton } from "@/components/timer-bar"
import { OverviewList } from "@/components/overview-list"
import { ActivityPanel } from "@/components/activity-panel"
import { TranslateAction, useHumanTranslation } from "@/components/translate-human-text"
import { ApiFailure, content as contentApi } from "@/lib/api"
import {
  RecordActionsMenu,
  RecordChipLink,
  RecordScreen,
  STICKY_TABS,
  RECORD_TABS_CONFIG,
  type RecordAction,
} from "@/components/record-chrome"
import { MARK_GROUP, typeMark } from "@/lib/type-marks"
import { formatCount } from "@shared/web/format-count"
import { formatDate } from "@shared/web/format"
import { storiesKey, storyAttachmentsKey } from "@/lib/live-resources"
import { CONCEPT_ICON } from "@/lib/pages"
import { usePermissions } from "@/lib/perms"
import { useRecordActivity } from "@/lib/use-record-activity"
import { useRecordCounts } from "@/lib/use-record-counts"
import type { Story } from "@shared/types"
import { invalidate, useCached, useCachedValue } from "@shared/web/store"
import { useLanguage } from "@shared/web/language"
import { RichText } from "@shared/web/rich-text-view"

export function StoryDetailScreen({
  teamId,
  storyId,
  basePath,
}: {
  teamId: string
  storyId: string
  /** the stories list in the URL form we arrived through */
  basePath: string
}) {
  const { t, lang } = useLanguage()
  // The backlog is PAGED, so a story reached by a deep link may sit past page
  // one — it is fetched by id and kept in its own cache key, exactly as the
  // knowledge base does for a source past its first page.
  const storyQ = useCached<Story | null>(`story:one:${storyId}`, () => contentApi.storyOne(storyId))
  const activity = useRecordActivity("stories", storyId)
  // The exact number of entries on THIS story, for the tab badge (R16), fetched
  // when the STORY opens rather than when the tab is clicked. It used to wait for
  // the WorkLogsPanel below to mount, and a panel does not mount until its tab is
  // active — so the badge was missing exactly when a reader needed it to decide
  // whether the tab was worth opening (shared/record-counts.ts). One exported key
  // function is still what keeps the panel's own refresh and this badge on the
  // same string.
  useRecordCounts("stories", storyId)
  const timeTotal = useCachedValue<number | null>(workLogsTotalKey("stories", storyId))
  // R16: the Files and links tab badges the door's exact COUNT(*), answered by
  // the counts read above when the STORY opens rather than when the tab is
  // clicked — a badge that is blank until you open the tab reads as an empty tab,
  // which is exactly the complaint this screen is being fixed for. `null` is the
  // third answer beside a number and an absence (the role may not read `work`),
  // and it renders as nothing, exactly as a zero does.
  const attachmentsTotal = useCachedValue<number | null>(`total:${storyAttachmentsKey(storyId)}`)

  const { can } = usePermissions(teamId)
  const canEdit = can("work", "edit")
  // The timer asks for the right its own door asks for (`work:create`), not the
  // one that governs editing the story — a person who may log time but not
  // rewrite the work was being offered neither.
  const canLogTime = can("work", "create")
  // Precomputed with the outer `t`: `renderPanel` below names its own tab-item
  // parameter `t`, which would otherwise shadow the translation function right
  // where the Activity tab's note field needs it.
  const notePlaceholder = t("Add a note")

  // The open tab is remembered per record for as long as this document
  // lives (web/lib/nav-memory.ts) — leaving to another section and coming
  // back lands on the tab she was reading, and a miss lands on "overview".
  const [tab, setTab] = useRemembered("tab", "overview")
  const [editOpen, setEditOpen] = React.useState(false)
  const [reviewOpen, setReviewOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const options = useStoryFormOptions(teamId)
    // NEST, DON'T REPLACE. This used to strip the collection segment off the path
  // before the panels appended to it, so opening a related record from here
  // threw away the record you opened it FROM — a story reached from a client
  // landed on /stories/<id> with no way back to the client. The base is now this
  // record's own address, so a related record lands INSIDE it and the trail is
  // in the URL for the crumbs, the Back button and anybody you send it to.
  const host = { base: `${basePath}/${storyId}` }

  const refresh = React.useCallback(() => {
    invalidate(`story:one:${storyId}`)
    invalidate(storiesKey(teamId))
    invalidate(`activity:record:stories:${storyId}`)
  }, [storyId, teamId])

  // READ THIS STORY IN YOUR OWN LANGUAGE, if you ask. Everything on it somebody
  // typed goes in one array, so one press is one call. A hook, so it sits above
  // the three early returns below.
  const translation = useHumanTranslation(teamId, [
    storyQ.data?.title,
    storyQ.data?.detail,
    storyQ.data?.reviewNote,
    storyQ.data?.closingNote,
  ])

  /** Run a write, say plainly if it was refused, and re-read. */
  async function run(what: () => Promise<unknown>, done: string, fallback: string) {
    setBusy(true)
    try {
      await what()
      refresh()
      toast.success(done)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : fallback)
    } finally {
      setBusy(false)
    }
  }

  async function save(values: StoryFormValues) {
    await contentApi.updateStory({
      id: storyId,
      title: values.title,
      storyType: values.storyType,
      detail: values.detail || undefined,
      sprintId: values.sprintId || undefined,
      appId: values.appId || undefined,
      ticketId: values.ticketId || undefined,
      assigneeId: values.assigneeId || undefined,
      processIds: values.processIds,
      changesNoStep: values.changesNoStep,
    })
    refresh()
    toast.success(t("Story updated."))
  }

  /** READY FOR REVIEW (CHECKLIST 6.9) — refused until every timer on this story
   * is stopped and an explanation is written. Both refusals live at the door, so
   * this panel only has to collect the words; the file is optional, which is
   * Aurora's ruling over "all three always" — plenty of work has nothing to show.
   */
  async function sendToReview(values: ReviewFormValues) {
    await contentApi.setStoryStatus(storyId, "in_review", undefined, {
      reviewNote: values.reviewNote,
      reviewFileUrl: values.reviewFileUrl || undefined,
      reviewFileName: values.reviewFileName || undefined,
    })
    refresh()
    toast.success(t("Sent for review."))
  }

  // THE CHROME STAYS, ONLY THE PANEL SPINS (RecordChrome's law 4) — rolled out
  // from the help-detail prototype (73414c58). Same shape: each branch below
  // still returns before the "ready" body, so no hook order changed.
  if (storyQ.error)
    return (
      <RecordScreen
        title={<Skeleton className="h-7 w-48" />}
        state="error"
        copy={{ errorTitle: t("Couldn't load the story.") }}
        errorAction={
          <Button variant="secondary" onClick={() => invalidate(`story:one:${storyId}`)}>
            {t("Try again")}
          </Button>
        }
      />
    )
  if (storyQ.data === undefined)
    return <RecordScreen title={<Skeleton className="h-7 w-48" />} state="loading" />
  const story = storyQ.data
  if (!story)
    return (
      <RecordScreen
        title={t("Story")}
        state="empty"
        copy={{ emptyTitle: t("That story no longer exists."), emptyDescription: "" }}
      />
    )

  const overviewItems = [
    { label: t("Status"), value: STORY_STATUS_LABEL[story.status] },
    { label: t("Type"), value: story.storyType || "—" },
    { label: t("Reference"), value: story.ref || "—" },
    { label: t("Who's doing it"), value: story.assigneeName || "Nobody yet" },
    // INHERITED, not typed. A story is due when the block it was sold inside is
    // due, so this is the SPRINT's end date — the story's own date field went on
    // 17 Aug 2026 rather than let two dates disagree about one promise. A story
    // with no sprint has no deadline to show, which is the honest answer.
    { label: t("Deadline"), value: formatDate(story.sprintEndsOn, lang) || "—" },
    // The three fields somebody TYPED — the detail, what was done, and what the
    // client will be told — read through `of`, so the reader who pressed
    // Translate sees them in their own language and nobody else's row changed.
    // Then through RichText, because they are typed in an editor now: translate
    // first, render second, and the sanitizer runs on what comes back.
    {
      label: t("Detail"),
      value: story.detail ? <RichText html={translation.of(story.detail)} /> : "—",
    },
    {
      label: t("Processes it changes"),
      value: story.changesNoStep
        ? "None"
        : story.processIds.map((id) => options.processNames.get(id) ?? id).join(", ") || "—",
    },
    { label: t("What was done"), value: translation.of(story.reviewNote) || "—" },
    { label: t("What we'll tell them"), value: translation.of(story.closingNote) || "—" },
    // The audit rows moved to the footer at the foot of the record (D7 /
    // CHECKLIST 11.3); the status is on the header band's own line.
  ]

  const tabsConfig = {
    ...RECORD_TABS_CONFIG,
    tabs: [
      { value: "overview", label: t("Overview"), icon: "info", badge: "", badgeVariant: "" as const },
      {
        // CHECKLIST 6.8: "a work logs tab on the story, and on every other detail
        // screen that captures time". The tab was already here and called Time;
        // Work logs is the word the glossary and the section both use now.
        value: "time",
        label: t("Work logs"),
        icon: CONCEPT_ICON.time,
        badge: formatCount(timeTotal),
        badgeVariant: "" as const,
      },
      {
        value: "activity",
        label: t("Activity"),
        icon: CONCEPT_ICON.activity,
        badge: formatCount(activity.total),
        badgeVariant: "" as const,
      },
      // WHAT THE STORY SHOWS FOR ITSELF. The same words the ticket's own tab
      // uses, because it is the same collection one record along and a second
      // name for it would be a second thing for a reader to learn (R6/R34).
      {
        value: "files",
        label: t("Files and links"),
        icon: "paperclip",
        badge: formatCount(attachmentsTotal),
        badgeVariant: "" as const,
      },
    ],
  }

  /* B1 / CHECKLIST 11.2 — one primary, one secondary, and a menu. The act that
   * MOVES THE STORY FORWARD is the primary (ready for review, then done: only
   * ever one is offered, because they belong to different stages), the clock is
   * the secondary, and Edit goes into the three-dot menu. */
  const overflow: RecordAction[] = canEdit
    ? [
        {
          key: "edit",
          label: t("Edit"),
          icon: <PencilSimple className="size-3.5" />,
          onSelect: () => setEditOpen(true),
        },
      ]
    : []

  return (
    <RecordScreen
      mark={typeMark(options.selectableValues, MARK_GROUP.story, story.storyType)}
      // NO EYEBROW — client ruling, 2026-09-03, verbatim: "I want you to remove
      // the eyebrow on the title on main screens. Remove that eyebrow, kill it."
      // The prop this line used to pass is deleted from `RecordScreen` itself
      // (record-chrome.tsx says why it had outlived the 2026-09-01 ruling that
      // took the eyebrow out of the full header); the breadcrumb above this
      // header is what names the record type now.
      // D4: the type word and the reference, above the title.
      recordNumber={story.ref || undefined}
      collectionLabel={story.storyType || t("Story")}
      // THE SECOND PILL, WITH A COLOUR (client ruling, 2026-08-31: "the status
      // scheme is not only for tickets … map colors"). `storyStatusDotTone`
      // (shared/status-tones.ts) reuses the same four-value enum the header's
      // own stage stepper used to draw before the 2026-08-31 "nothing after
      // chips" ruling removed it (see `actions`'s own note below) — this chip
      // is now the only place that fact reads.
      //
      // THE THIRD PILL, "the most relevant container parent" (client ruling,
      // 2026-08-31). The glossary's own words settle which of the three
      // cross-links below is that one: "story: … it lives in a SPRINT" — the
      // sprint is the story's literal container, so it is the chip; the app and
      // the ticket had no chip of their own and are gone from the header
      // entirely (see this file's own note further down).
      chips={
        <>
          <Badge variant="status" dot={storyStatusDotTone(story.status)}>
            {STORY_STATUS_LABEL[story.status]}
          </Badge>
          {story.sprintId && story.sprintName ? (
            <RecordChipLink href={`${host.base}/sprints/${story.sprintId}`}>
              {story.sprintName}
            </RecordChipLink>
          ) : null}
        </>
      }
      title={translation.of(story.title)}
      // CLIENT RULING, 2026-08-31, VERBATIM: "what is this 3rd component in
      // the title under the chips? kill everywhere. chips is the last
      // component of headers!" Overrides the D5 trim above, which had kept
      // assignee/deadline here — both are already rows in the Overview tab
      // (`overviewItems`: "Who's doing it", "Deadline"), so nothing is lost.
      // `status` maps to `RecordChrome`'s `meta`, which the kit draws right
      // under the chips row (`data-record-region="header"`) — exactly the
      // region the ruling forbids.
      actions={
        <>
          {/* START, AND STOP. It used to be a permanent "Start timer" that could
              not see the timer already running on this very story, so pressing it
              again asked the door a question it had to refuse. The shared control
              reads the same running-timers cache the header bar reads. */}
          <RecordTimerButton
            teamId={teamId}
            targetTable="stories"
            targetId={storyId}
            canLog={canLogTime}
            disabled={story.status === "done"}
          />
          {/* READY FOR REVIEW (CHECKLIST 6.9). Offered only while the work is
              actually in hand: a story nobody has started has nothing to explain,
              and one already in review or done has been explained. The panel
              collects the words; the door refuses if a timer is still running. */}
          {canEdit && (story.status === "open" || story.status === "in_progress") && (
            <Button disabled={busy} onClick={() => setReviewOpen(true)} className="gap-1">
              <CheckSquare className="size-3.5" />
              {t("Ready for review")}
            </Button>
          )}
          {/* ONE DONE BUTTON, TOP RIGHT (CHECKLIST 6.10). It appears only on a
              story that has been reviewed, so "done" stays downstream of somebody
              having looked. */}
          {canEdit && story.status === "in_review" && (
            <Button
              disabled={busy}
              onClick={() =>
                void run(
                  () => contentApi.setStoryStatus(storyId, "done", story.closingNote ?? undefined),
                  "Done.",
                  "Couldn't close that story."
                )
              }
              className="gap-1"
            >
              <Check className="size-3.5" />
              {t("Done")}
            </Button>
          )}
          <RecordActionsMenu actions={overflow} />
        </>
      }
      // THE STAGE STEPPER AND THE APP/TICKET CROSS-LINKS ARE GONE — CLIENT
      // RULING, 2026-08-31, VERBATIM: "what is this 3rd component in the
      // title under the chips? kill everywhere. chips is the last component
      // of headers!" `headerExtra` maps to `RecordChrome`'s `hero` prop,
      // which the kit draws in its own `data-record-region="hero"` block —
      // directly under the header block that carries the chips, still above
      // the tab strip, so on the rendered page it reads as more content
      // under the pills exactly as the ruling describes. The stepper stops
      // being a text duplicate the moment it's a stepper, and the ruling
      // says so anyway: "it doesn't matter whether the information is a
      // duplicate or not." The app/ticket links are not shown anywhere else
      // on this screen (confirmed against `overviewItems`, which has no App
      // or Ticket row) — dropped from the header per this explicit ruling,
      // not carried anywhere else; a reader can still reach the app from the
      // Sprint the story links to, and the ticket from Tickets.
      // D7 / CHECKLIST 11.3 — who made it and when, now the kit's own ink
      // footer's Record column.
      audit={{
        createdByName: story.createdByName,
        createdAt: story.createdAt,
        editedByName: story.editedByName,
        updatedAt: story.updatedAt,
      }}
      activity={activity}
      onAddNote={can("work", "create") ? activity.addNote : undefined}
      notePlaceholder={notePlaceholder}
    >

      <TabsView
        className={STICKY_TABS}
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(t) => {
          if (t.value === "time")
            return (
              <WorkLogsPanel
                targetTable="stories"
                targetId={storyId}
                recordLabel={story.ref ? `${story.ref} · ${story.title}` : story.title}
                canEdit={canEdit}
                canLog={canLogTime}
                onActivityChanged={() => invalidate(`activity:record:stories:${storyId}`)}
              />
            )
          if (t.value === "activity")
            return (
              <ActivityPanel
                activity={activity}
                onAddNote={can("work", "create") ? activity.addNote : undefined}
                notePlaceholder={notePlaceholder}
              />
            )
          // `work:edit`, which is what BOTH attachment doors gate on — not the
          // read right the ticket's panel takes, and not `canLogTime`. A button
          // drawn on a wider right is a button whose every press is a 403.
          if (t.value === "files")
            return <StoryAttachmentsPanel storyId={storyId} canEdit={canEdit} />
          return (
            <>
              {/* Above the fields it acts on, and out of the header's one-primary
                  -one-secondary-and-a-menu discipline — this is a thing somebody
                  presses while reading and presses back a moment later. */}
              <div className="flex justify-end">
                <TranslateAction translation={translation} />
              </div>
              <OverviewList items={overviewItems} />
            </>
          )
        }}
      />

      <StoryFormDialog
        teamId={teamId}
        open={editOpen}
        onOpenChange={setEditOpen}
        sprints={options.sprints}
        apps={options.apps}
        tickets={options.tickets}
        members={options.members}
        appStaff={options.appStaff}
        processes={options.processes}
        storyTypes={options.storyTypes}
        storyId={story.id}
        initial={{
          title: story.title,
          detail: story.detail ?? "",
          sprintId: story.sprintId ?? "",
          appId: story.appId ?? "",
          ticketId: story.ticketId ?? "",
          assigneeId: story.assigneeId ?? "",
          storyType: story.storyType ?? "",
          processIds: story.processIds,
          changesNoStep: story.changesNoStep,
        }}
        draftKey={`story:edit:${storyId}`}
        onSubmit={save}
      />
      <ReviewDialog
        storyId={storyId}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        draftKey={`story:review:${storyId}`}
        initial={{
          reviewNote: story.reviewNote ?? "",
          reviewFileUrl: story.reviewFileUrl ?? "",
          reviewFileName: story.reviewFileName ?? "",
        }}
        onSubmit={sendToReview}
      />
    </RecordScreen>
  )
}
