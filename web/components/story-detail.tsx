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
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
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
import { ArrowDown, ArrowUp, Pencil, Play } from "lucide-react"

import { LoadMore } from "@/components/load-more"
import { StoryFormDialog, type StoryFormValues } from "@/components/story-form-dialog"
import { useStoryFormOptions } from "@/components/stories-screen"
import { STORY_STATUS_LABEL, sliceKey } from "@/components/work-panels"
import { StoryStatusStepper } from "@/components/story-status-stepper"
import { ApiFailure, content as contentApi } from "@/lib/api"
import { auditItems } from "@/lib/audit-overview"
import { formatCount } from "@shared/web/format-count"
import { formatDate } from "@shared/web/format"
import { cursorKey, runningTimersKey, storiesKey, totalKey } from "@/lib/live-resources"
import { softNavigate } from "@/lib/nav"
import { CONCEPT_ICON } from "@/lib/pages"
import { usePermissions } from "@/lib/perms"
import { useRecordActivity } from "@/lib/use-record-activity"
import type { Story, WorkLog } from "@shared/types"
import { invalidate, primeCache, useCached, useCachedValue } from "@shared/web/store"

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
  // The backlog is PAGED, so a story reached by a deep link may sit past page
  // one — it is fetched by id and kept in its own cache key, exactly as the
  // knowledge base does for a source past its first page.
  const storyQ = useCached<Story | null>(`story:one:${storyId}`, () => contentApi.storyOne(storyId))
  const activity = useRecordActivity("stories", storyId)
  // The backlog page this record's neighbours are read out of, for the two
  // reorder controls below. Cache-first: it is already loaded if you arrived
  // from the list, and the controls simply don't offer a move when it isn't.
  const backlogQ = useCached<Story[]>(storiesKey(teamId), () =>
    contentApi.stories().then((r) => r.stories)
  )

  const timeKey = sliceKey("time-story", storyId)
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

  const [tab, setTab] = React.useState("overview")
  const [editOpen, setEditOpen] = React.useState(false)
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

  async function save(values: StoryFormValues) {
    await contentApi.updateStory({
      id: storyId,
      title: values.title,
      detail: values.detail || undefined,
      sprintId: values.sprintId || undefined,
      appId: values.appId || undefined,
      ticketId: values.ticketId || undefined,
      assigneeId: values.assigneeId || undefined,
      dueOn: values.dueOn || undefined,
    })
    refresh()
    toast.success("Story updated.")
  }

  if (storyQ.error) return <p className="text-destructive text-sm">Couldn&apos;t load the story.</p>
  if (storyQ.data === undefined) return <Skeleton variant="list" lines={5} />
  const story = storyQ.data
  if (!story) return <p className="text-muted-foreground text-sm">That story no longer exists.</p>

  // WHERE THE PERSON PUT IT (SCOPE ch.07: drag-rank is the only priority signal
  // in the product). The door takes NEIGHBOURS, never a position, so moving up
  // means "go between the two rows above me" — which is exactly what a drag
  // does, said with a button. It only offers a move it can name both ends of.
  const order = backlogQ.data ?? []
  const at = order.findIndex((s) => s.id === storyId)
  const moveTo = (delta: -1 | 1) => {
    // The list reads highest-rank-first, so "up" is towards index 0 — the row
    // ABOVE becomes the one below us in rank terms. Naming both neighbours is
    // what lets two people reorder at once without fighting over a number.
    const target = at + delta
    const before = delta === -1 ? order[target - 1] : order[target]
    const after = delta === -1 ? order[target] : order[target + 1]
    return run(
      () => contentApi.rankStory(storyId, before?.id ?? null, after?.id ?? null),
      "Moved.",
      "Couldn't move that."
    )
  }
  const canMoveUp = canEdit && at > 0
  const canMoveDown = canEdit && at > -1 && at < order.length - 1

  const overviewItems = [
    { label: "Status", value: STORY_STATUS_LABEL[story.status] },
    { label: "Reference", value: story.ref || "—" },
    { label: "Who's doing it", value: story.assigneeName || "Nobody yet" },
    { label: "Due", value: formatDate(story.dueOn) || "—" },
    { label: "Detail", value: story.detail || "—" },
    { label: "What we'll tell them", value: story.closingNote || "—" },
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
      { value: "overview", label: "Overview", icon: "info", badge: "", badgeVariant: "" as const },
      {
        value: "time",
        label: "Time",
        icon: CONCEPT_ICON.timer,
        badge: formatCount(timeTotal),
        badgeVariant: "" as const,
      },
      {
        value: "activity",
        label: "Activity",
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
                Done
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
                In {story.sprintName}
              </button>
            )}
            {story.ticketId && (
              <button
                type="button"
                onClick={() => softNavigate(`${host.base}/tickets/${story.ticketId}`)}
                className="hover:text-foreground underline-offset-2 hover:underline"
              >
                Answers {story.ticketRef ?? "a request"}
              </button>
            )}
          </p>
        </div>
        {/* ml-auto on the GROUP so a narrow phone reflows instead of clipping. */}
        <div className="flex flex-wrap gap-2 sm:ml-auto sm:shrink-0">
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy || story.status === "done"}
              onClick={() =>
                void run(
                  async () => {
                    await contentApi.startTimer("stories", storyId)
                    // The header bar on every screen and this record's own Time
                    // tab both read a running timer — neither is the cache the
                    // generic refresh above drops.
                    invalidate(runningTimersKey(teamId))
                    invalidate(timeKey)
                  },
                  "Timer started.",
                  "Couldn't start the timer."
                )
              }
              className="gap-1.5"
            >
              {busy ? <Spinner /> : <Play className="size-3.5" />}
              Start timer
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5">
              <Pencil className="size-3.5" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* WHERE IT SITS IN THE ORDER. Drag-rank is the only priority signal in the
          product and it had no control at all — the door shipped and nothing on
          any screen could reach it. */}
      {(canMoveUp || canMoveDown) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">Order in the backlog</span>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !canMoveUp}
            onClick={() => void moveTo(-1)}
            className="gap-1.5"
          >
            <ArrowUp className="size-3.5" />
            Move up
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !canMoveDown}
            onClick={() => void moveTo(1)}
            className="gap-1.5"
          >
            <ArrowDown className="size-3.5" />
            Move down
          </Button>
        </div>
      )}

      {/* THE LIFECYCLE, as a track rather than a dropdown — the same control a
          ticket gets. Closing a story settles the ticket half in the same call,
          which is why the far end of it reads as a decision. */}
      <StoryStatusStepper
        status={story.status}
        canEdit={canEdit}
        busy={busy}
        onChange={(next) =>
          void run(
            () => contentApi.setStoryStatus(storyId, next, story.closingNote ?? undefined),
            `Moved to ${STORY_STATUS_LABEL[next].toLowerCase()}.`,
            "Couldn't move that story."
          )
        }
      />

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
            return (
              // R14: the badge above counts the WHOLE history, so the feed under
              // it must be able to reach all of it — page one, then Load more.
              <div className="flex flex-col gap-4">
                <ActivityFeed
                  config={{ ...defaultActivityFeedConfig, emptyText: "No activity yet." }}
                  items={activity.items}
                />
                <LoadMore listKey={activity.listKey} fetchPage={activity.fetchPage} label="Load more activity" />
              </div>
            )
          return (
            <DescriptionList
              config={{ ...defaultDescriptionListConfig, columns: 1 }}
              items={overviewItems}
            />
          )
        }}
      />

      <StoryFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        sprints={options.sprints}
        apps={options.apps}
        tickets={options.tickets}
        members={options.members}
        initial={{
          title: story.title,
          detail: story.detail ?? "",
          sprintId: story.sprintId ?? "",
          appId: story.appId ?? "",
          ticketId: story.ticketId ?? "",
          assigneeId: story.assigneeId ?? "",
          dueOn: story.dueOn ?? "",
        }}
        draftKey={`story:edit:${storyId}`}
        onSubmit={save}
      />
    </div>
  )
}
