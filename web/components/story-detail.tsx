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

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import { Check, ClipboardCheck, Pencil } from "lucide-react"

import { StoryFormDialog, type StoryFormValues } from "@/components/story-form-dialog"
import { ReviewDialog, type ReviewFormValues } from "@/components/review-dialog"
import { useStoryFormOptions } from "@/components/stories-screen"
import { STORY_STATUS_LABEL } from "@/components/work-panels"
import { WorkLogsPanel, workLogsTotalKey } from "@/components/work-logs-panel"
import { StoryStatusStepper } from "@/components/story-status-stepper"
import { RecordTimerButton } from "@/components/timer-bar"
import { OverviewList } from "@/components/overview-list"
import { ActivityPanel } from "@/components/activity-panel"
import { TranslateAction, useHumanTranslation } from "@/components/translate-human-text"
import { ApiFailure, content as contentApi } from "@/lib/api"
import {
  RecordActionsMenu,
  RecordFooter,
  RecordScreen,
  STICKY_TABS,
  type RecordAction,
} from "@/components/record-chrome"
import { MARK_GROUP, typeMark } from "@/lib/type-marks"
import { formatCount } from "@shared/web/format-count"
import { formatDate } from "@shared/web/format"
import { storiesKey } from "@/lib/live-resources"
import { softNavigate } from "@/lib/nav"
import { CONCEPT_ICON } from "@/lib/pages"
import { usePermissions } from "@/lib/perms"
import { useRecordActivity } from "@/lib/use-record-activity"
import { useRecordCounts } from "@/lib/use-record-counts"
import type { Story } from "@shared/types"
import { invalidate, useCached, useCachedValue } from "@shared/web/store"
import { useT } from "@shared/web/language"
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
  const t = useT()
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

  const { can } = usePermissions(teamId)
  const canEdit = can("work", "edit")
  // The timer asks for the right its own door asks for (`work:create`), not the
  // one that governs editing the story — a person who may log time but not
  // rewrite the work was being offered neither.
  const canLogTime = can("work", "create")

  const [tab, setTab] = React.useState("overview")
  const [editOpen, setEditOpen] = React.useState(false)
  const [reviewOpen, setReviewOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const options = useStoryFormOptions(teamId)
  const host = { base: basePath.replace(/\/stories$/, "") }

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

  if (storyQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the story.")}</p>
  if (storyQ.data === undefined) return <Skeleton variant="list" lines={5} />
  const story = storyQ.data
  if (!story) return <p className="text-muted-foreground text-sm">{t("That story no longer exists.")}</p>

  const overviewItems = [
    { label: t("Status"), value: STORY_STATUS_LABEL[story.status] },
    { label: t("Type"), value: story.storyType || "—" },
    { label: t("Reference"), value: story.ref || "—" },
    { label: t("Who's doing it"), value: story.assigneeName || "Nobody yet" },
    // INHERITED, not typed. A story is due when the block it was sold inside is
    // due, so this is the SPRINT's end date — the story's own date field went on
    // 17 Aug 2026 rather than let two dates disagree about one promise. A story
    // with no sprint has no deadline to show, which is the honest answer.
    { label: t("Deadline"), value: formatDate(story.sprintEndsOn) || "—" },
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
    ...defaultTabsConfig,
    variant: "line" as const,
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
          icon: <Pencil className="size-3.5" />,
          onSelect: () => setEditOpen(true),
        },
      ]
    : []

  return (
    <RecordScreen
      mark={typeMark(options.selectableValues, MARK_GROUP.story, story.storyType)}
      // D4: the type word and the reference, above the title.
      eyebrow={[story.storyType || t("Story"), story.ref].filter(Boolean).join(" · ")}
      title={translation.of(story.title)}
      // D5: where it is, who has it, when it is due. Three facts, no more.
      status={[
        STORY_STATUS_LABEL[story.status],
        story.assigneeName ?? undefined,
        formatDate(story.sprintEndsOn) || undefined,
      ]
        .filter(Boolean)
        .join(" · ")}
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
              <ClipboardCheck className="size-3.5" />
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
      /* THE LIFECYCLE AS A FACT (CHECKLIST 6.7). It used to be four buttons, and
         pressing "in progress" started a timer — the tester asked for that
         inversion and this is it: a timer start moves the story, and the track
         reports where it got to. */
      headerExtra={
        <>
          <StoryStatusStepper status={story.status} />
          {/* THE CROSS-LINKS UP THE TREE, the app the work is on, the sprint it
              was sold inside, and the request it answers. The owner's answer on
              which path a person takes was "all three should get her there", and
              this is the other end of all three. */}
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {story.ref && <span>{story.ref}</span>}
            {story.appId && (
              <button
                type="button"
                onClick={() => softNavigate(`${host.base}/apps/${story.appId}`)}
                className="hover:text-foreground underline-offset-2 hover:underline"
              >
                {options.appNames.get(story.appId) ?? t("Its app")}
              </button>
            )}
            {story.sprintId && story.sprintName && (
              <button
                type="button"
                onClick={() => softNavigate(`${host.base}/sprints/${story.sprintId}`)}
                className="hover:text-foreground underline-offset-2 hover:underline"
              >
                {t("In")} {story.sprintName}
              </button>
            )}
            {story.ticketId && (
              <button
                type="button"
                onClick={() => softNavigate(`${host.base}/tickets/${story.ticketId}`)}
                className="hover:text-foreground underline-offset-2 hover:underline"
              >
                {t("Answers")} {story.ticketRef ?? t("a ticket")}
              </button>
            )}
          </p>
        </>
      }
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
            return <ActivityPanel activity={activity} />
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

      {/* D7 / CHECKLIST 11.3, the audit line, grey, at the foot of the record. */}
      <RecordFooter
        audit={{
          createdByName: story.createdByName,
          createdAt: story.createdAt,
          editedByName: story.editedByName,
          updatedAt: story.updatedAt,
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
