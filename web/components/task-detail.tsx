"use client"

// TASK DETAIL — one piece of the agency's own admin, as a tabbed record (Law R2):
// Overview / Work logs / Activity.
//
// IT USED TO BE A RECIPE, and the note that made it one was true when it was
// written: a task is "a title, a date and a tick", and there was no control on it
// the engine had no block for. That stopped being true on 18 Aug 2026. The owner
// asked for a work logs tab wherever time is tracked, `tasks` has been a work-log
// target since work logs shipped, and a tab whose panel is a list plus three
// charts is exactly the thing no recipe block draws. The engine kept the record
// for as long as it could describe it, which is the deal — a recipe is not a
// prize a screen keeps after it has outgrown one.
//
// WHAT CARRIES OVER UNCHANGED: the same fields the description block showed, the
// same tick-and-untick door through the same `onAction` seam the recipe used, and
// the same generic (table, id) activity feed (R5). The timer on the header is the
// one the recipe already had, moved from the `above` slot to where a record's
// secondary action belongs.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import { Check, Undo2 } from "lucide-react"

import { ActivityPanel } from "@/components/activity-panel"
import { OverviewList } from "@/components/overview-list"
import { RecordFooter, RecordScreen, STICKY_TABS } from "@/components/record-chrome"
import { RecordTimerButton } from "@/components/timer-bar"
import { WorkLogsPanel, workLogsTotalKey } from "@/components/work-logs-panel"
import { CONCEPT_ICON } from "@/lib/pages"
import { usePermissions } from "@/lib/perms"
import { useRecordActivity } from "@/lib/use-record-activity"
import { useRecordCounts } from "@/lib/use-record-counts"
import type { Task } from "@shared/types"
import { RecordMark } from "@shared/web/record-mark"
import { formatCount } from "@shared/web/format-count"
import { formatDate } from "@shared/web/format"
import { RichText } from "@shared/web/rich-text-view"
import { invalidate, useCachedValue } from "@shared/web/store"
import { useT } from "@shared/web/language"

export function TaskDetailScreen({
  teamId,
  taskId,
  /** The ALL list, not the open one — ticking a task off takes it out of the open
   * collection, so a detail read out of that would answer "that record no longer
   * exists" the instant you used the button on it. Handed in by the host, which
   * already holds it. */
  task,
  loading,
  /** The recipe's own action seam, unchanged: the host owns the write AND the
   * direction (it reads the current status and flips it), so the tick behaves
   * identically to the way it did as `tasks.done`. */
  onToggleDone,
}: {
  teamId: string
  taskId: string
  task: Task | null
  loading: boolean
  onToggleDone: () => void
}) {
  const t = useT()
  const { can } = usePermissions(teamId)
  const canEdit = can("work", "edit")
  // The clock asks for the right its own door asks for (`work:create`).
  const canLogTime = can("work", "create")
  const canSeeTime = can("work", "read")
  const activity = useRecordActivity("tasks", taskId)
  // The Time badge, counted when the TASK opens rather than when its tab is
  // clicked — a badge that arrives with the panel is a badge that is missing
  // exactly when it is being read (shared/record-counts.ts).
  useRecordCounts("tasks", taskId)
  const timeTotal = useCachedValue<number | null>(workLogsTotalKey("tasks", taskId))
  const [tab, setTab] = React.useState("overview")

  if (loading) return <Skeleton variant="list" lines={4} />
  if (!task) return <p className="text-muted-foreground text-sm">{t("That record no longer exists.")}</p>

  const done = task.status === "done"
  const overviewItems = [
    { label: t("Status"), value: done ? t("Done") : t("Open") },
    { label: t("Who has it"), value: task.assigneeName || t("Nobody yet") },
    // DEADLINE, the same word the tasks table, the sort control and the form
    // all use for this column (CHECKLIST 2.5). It read "Due" here, which is a
    // second word for one fact on the record whose table says the first.
    { label: t("Deadline"), value: task.dueOn ? formatDate(task.dueOn) : "" },
    // A React node, not a string: a rich-text body renders as the formatting
    // somebody typed rather than as its own tags.
    { label: t("Detail"), value: task.detail ? <RichText html={task.detail} /> : "" },
  ]

  const tabsConfig = {
    ...defaultTabsConfig,
    variant: "line" as const,
    tabs: [
      { value: "overview", label: t("Overview"), icon: "info", badge: "", badgeVariant: "" as const },
      // WORK LOGS, wherever time is tracked (CHECKLIST 6.8). Forty minutes on the
      // quarterly VAT return costs the agency what forty minutes of delivery
      // costs, which is why `tasks` has been a work-log target all along — and
      // why a task that could be timed and never showed the hours was a
      // capability the code had and no screen finished.
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
        value: "activity",
        label: t("Activity"),
        icon: CONCEPT_ICON.activity,
        badge: formatCount(activity.total),
        badgeVariant: "" as const,
      },
    ],
  }

  return (
    <RecordScreen
      // A DELIBERATE MARK, NEVER AN EMPTY SLOT. This record has no picture and
      // its type carries no glyph, so the square holds the record's own initial —
      // the same box, the same size, the same slot every other record uses
      // (shared/web/record-mark.tsx). Before this, four of the eleven record
      // screens opened with a bare title while the other seven led with a mark,
      // which is the drift a reader feels and never reports.
      leading={<RecordMark name={task.title} size="band" />}
      eyebrow={[t("Task"), task.ref].filter(Boolean).join(" · ")}
      title={task.title}
      status={[done ? t("Done") : t("Open"), task.assigneeName || undefined]
        .filter(Boolean)
        .join(" · ")}
      actions={
        <>
          {/* THE TICK SAYS WHAT IT WILL DO NEXT. Same door, two directions — a
              finished task must not offer to be finished again. No confirm:
              nothing is lost either way, and a confirm on a tick is the kind of
              ceremony that teaches people to click through dialogs. */}
          {canEdit && (
            <Button size="sm" variant="outline" onClick={onToggleDone} className="gap-1">
              {done ? <Undo2 className="size-3.5" /> : <Check className="size-3.5" />}
              {done ? t("Put it back") : t("Tick it off")}
            </Button>
          )}
          {/* A task that is already ticked off has nothing left to time. */}
          <RecordTimerButton
            teamId={teamId}
            targetTable="tasks"
            targetId={taskId}
            canLog={canLogTime}
            disabled={done}
          />
        </>
      }
    >
      <TabsView
        className={STICKY_TABS}
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(panel) => {
          if (panel.value === "time")
            return (
              <WorkLogsPanel
                targetTable="tasks"
                targetId={taskId}
                recordLabel={task.ref ? `${task.ref} · ${task.title}` : task.title}
                canEdit={canEdit}
                canLog={canLogTime}
                onActivityChanged={() => invalidate(`activity:record:tasks:${taskId}`)}
              />
            )
          if (panel.value === "activity") return <ActivityPanel activity={activity} />
          return <OverviewList items={overviewItems} />
        }}
      />

      {/* D7 / CHECKLIST 11.3 — who made it and when, grey, at the foot. */}
      <RecordFooter audit={{ createdByName: task.createdByName, createdAt: task.createdAt }} />
    </RecordScreen>
  )
}
