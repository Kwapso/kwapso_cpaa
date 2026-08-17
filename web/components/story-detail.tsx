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

import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import { Check, ClipboardCheck, Pencil } from "lucide-react"

import { LoadMore } from "@/components/load-more"
import { StoryFormDialog, type StoryFormValues } from "@/components/story-form-dialog"
import { ReviewDialog, type ReviewFormValues } from "@/components/review-dialog"
import { useStoryFormOptions } from "@/components/stories-screen"
import { STORY_STATUS_LABEL } from "@/components/work-panels"
import { TimeFormDialog, type TimeFormValues } from "@/components/time-form-dialog"
import { StoryStatusStepper } from "@/components/story-status-stepper"
import { RecordTimerButton } from "@/components/timer-bar"
import { OverviewList } from "@/components/overview-list"
import { ActivityPanel } from "@/components/activity-panel"
import { ApiFailure, content as contentApi } from "@/lib/api"
import { auditItems } from "@/lib/audit-overview"
import { formatCount } from "@shared/web/format-count"
import { formatDate } from "@shared/web/format"
import { cursorKey, recordTimeKey, storiesKey, totalKey } from "@/lib/live-resources"
import { softNavigate } from "@/lib/nav"
import { CONCEPT_ICON } from "@/lib/pages"
import { usePermissions } from "@/lib/perms"
import { useRecordActivity } from "@/lib/use-record-activity"
import type { Story, WorkLog } from "@shared/types"
import { invalidate, primeCache, useCached, useCachedValue } from "@shared/web/store"
import { useT } from "@shared/web/language"

/** Whole seconds → the hours and minutes a person would say. */
function spell(seconds: number): string {
  const m = Math.round(seconds / 60)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`
}

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
  // The time on THIS story. Keyed through recordTimeKey rather than the generic
  // slice key, because that family is the one the live registry drops when any
  // row of time moves (R15) — a stop pressed on the header bar has to land here.
  const timeKey = recordTimeKey("stories", storyId)
  const logsQ = useCached<WorkLog[]>(timeKey, () =>
    contentApi.workLogs({ filter: { targetTable: "stories", targetId: storyId } }).then((r) => {
      primeCache(totalKey("time-story", storyId), r.total)
      primeCache(cursorKey(timeKey), r.nextCursor)
      return r.logs
    })
  )
  const timeTotal = useCachedValue<number>(totalKey("time-story", storyId))

  const { can } = usePermissions(teamId)
  const canEdit = can("work", "edit")
  // The timer asks for the right its own door asks for (`work:create`), not the
  // one that governs editing the story — a person who may log time but not
  // rewrite the work was being offered neither.
  const canLogTime = can("work", "create")

  const [tab, setTab] = React.useState("overview")
  const [editOpen, setEditOpen] = React.useState(false)
  const [reviewOpen, setReviewOpen] = React.useState(false)
  // THE ROW OF TIME BEING CORRECTED. Held rather than routed through the URL,
  // for the reason the Stories page's panel holds its own: a correction is a
  // thing you do to a line you are looking at, and Back should close the form
  // rather than walk you back through every line you opened.
  const [editingLog, setEditingLog] = React.useState<WorkLog | null>(null)
  const [busy, setBusy] = React.useState(false)
  const options = useStoryFormOptions(teamId)
  const host = { base: basePath.replace(/\/stories$/, "") }

  const refresh = React.useCallback(() => {
    invalidate(`story:one:${storyId}`)
    invalidate(storiesKey(teamId))
    invalidate(`activity:record:stories:${storyId}`)
  }, [storyId, teamId])

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

  /** CORRECT A ROW OF TIME, on the record it was logged against. The Time tab
   * listed the hours and offered nothing to do about a wrong one — so a mistyped
   * figure could only be fixed from the Stories page, if you knew it was there.
   * The door keeps the trail (who corrected what, and when). */
  async function correctTime(values: TimeFormValues) {
    if (!editingLog) return
    await contentApi.updateWorkLog({
      id: editingLog.id,
      startedAt: values.startedAt,
      endedAt: values.endedAt,
      note: values.note,
      kind: values.kind,
      billable: values.billable,
    })
    invalidate(timeKey)
    invalidate(`activity:record:stories:${storyId}`)
    toast.success(t("Time corrected."))
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
    { label: t("Kind"), value: story.storyType || "—" },
    { label: t("Reference"), value: story.ref || "—" },
    { label: t("Who's doing it"), value: story.assigneeName || "Nobody yet" },
    // INHERITED, not typed. A story is due when the block it was sold inside is
    // due, so this is the SPRINT's end date — the story's own date field went on
    // 17 Aug 2026 rather than let two dates disagree about one promise. A story
    // with no sprint has no deadline to show, which is the honest answer.
    { label: t("Due"), value: formatDate(story.sprintEndsOn) || "—" },
    { label: t("Detail"), value: story.detail || "—" },
    {
      label: t("Processes it changes"),
      value: story.changesNoStep
        ? "None"
        : story.processIds.map((id) => options.processNames.get(id) ?? id).join(", ") || "—",
    },
    { label: t("What was done"), value: story.reviewNote || "—" },
    { label: t("What we'll tell them"), value: story.closingNote || "—" },
    ...auditItems({
      createdByName: story.createdByName,
      createdAt: story.createdAt,
      editedByName: story.editedByName,
      updatedAt: story.updatedAt,
      status: STORY_STATUS_LABEL[story.status],
    }),
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="truncate">{story.title}</span>
            {story.status === "done" && (
              <Badge variant="secondary" className="text-[10px]">
                {t("Done")}
              </Badge>
            )}
          </h1>
          {/* THE CROSS-LINKS UP THE TREE — the app the work is on, the sprint it
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
                {options.appNames.get(story.appId) ?? "Its app"}
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
                {t("Answers")} {story.ticketRef ?? "a request"}
              </button>
            )}
          </p>
        </div>
        {/* ml-auto on the GROUP so a narrow phone reflows instead of clipping. */}
        <div className="flex flex-wrap gap-2 sm:ml-auto sm:shrink-0">
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
            <Button size="sm" disabled={busy} onClick={() => setReviewOpen(true)} className="gap-1.5">
              <ClipboardCheck className="size-3.5" />
              {t("Ready for review")}
            </Button>
          )}
          {/* ONE DONE BUTTON, TOP RIGHT (CHECKLIST 6.10). Aurora's ts2: the app's
              team lead presses it, not "anyone with the right". The lead is a
              field on an app that does not exist yet (CHECKLIST 8.10, another
              lane) — until it does, this is gated on `work:edit` and it is ONE
              button in ONE place, which is the half of the ask that was about the
              screen. When the lead lands, the condition changes here and nothing
              else moves.
              It appears only on a story that has been reviewed, so "done" stays
              downstream of somebody having looked. */}
          {canEdit && story.status === "in_review" && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(
                  () => contentApi.setStoryStatus(storyId, "done", story.closingNote ?? undefined),
                  "Done.",
                  "Couldn't close that story."
                )
              }
              className="gap-1.5"
            >
              <Check className="size-3.5" />
              {t("Done")}
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5">
              <Pencil className="size-3.5" />
              {t("Edit")}
            </Button>
          )}
        </div>
      </div>

      {/* THE LIFECYCLE AS A FACT (CHECKLIST 6.7). It used to be four buttons, and
          pressing "in progress" started a timer — the tester asked for that
          inversion and this is it: a timer start moves the story, and the track
          reports where it got to. Two of the four stages are reached by a named
          act instead (the two buttons above), and neither of them is on here. */}
      <StoryStatusStepper status={story.status} />

      <TabsView
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(t) => {
          if (t.value === "time")
            return (
              <div className="flex flex-col gap-3">
                {logsQ.data === undefined ? (
                  <Skeleton variant="list" lines={3} />
                ) : logsQ.data.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No time logged against this yet.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {logsQ.data.map((l) => (
                      <li
                        key={l.id}
                        className={`border-border/60 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${
                          l.discarded ? "opacity-60" : ""
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {[l.userName, l.startedAt.slice(0, 10), l.kind, l.note]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {l.endedAt ? spell(l.seconds) : "running"}
                        </span>
                        {l.discarded && (
                          <Badge variant="outline" className="text-muted-foreground text-[10px]">
                            Discarded
                          </Badge>
                        )}
                        {/* FIX A LINE. Only on time that has FINISHED and has
                            not been binned: a running timer is corrected by
                            stopping it (the control for that is on the header
                            bar, on every screen), and a start time you can edit
                            while the clock is still counting is two people
                            writing the same number. */}
                        {canEdit && l.endedAt && !l.discarded && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingLog(l)}
                            className="shrink-0 gap-1.5"
                          >
                            <Pencil className="size-3.5" />
                            Edit
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {/* R14: time is the fastest-growing row in the work engine, so the
                    badge above counts rows this list has to be able to reach. */}
                <LoadMore
                  listKey={timeKey}
                  label="Load more time"
                  fetchPage={(c: string) =>
                    contentApi
                      .workLogs({ filter: { targetTable: "stories", targetId: storyId }, cursor: c })
                      .then((r) => ({ rows: r.logs, nextCursor: r.nextCursor }))
                  }
                />
              </div>
            )
          if (t.value === "activity")
            return <ActivityPanel activity={activity} />
          return <OverviewList items={overviewItems} />
        }}
      />

      <StoryFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        sprints={options.sprints}
        apps={options.apps}
        tickets={options.tickets}
        members={options.members}
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
      <TimeFormDialog
        open={!!editingLog}
        onOpenChange={(o) => !o && setEditingLog(null)}
        draftKey={editingLog ? `work-log:edit:${editingLog.id}` : undefined}
        initial={editingLog}
        onSubmit={correctTime}
      />
    </div>
  )
}
