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

import { Button } from "@shared/ui/components/button/button"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { TabsView, defaultTabsConfig } from "@shared/web/screen-engine/tabs-view"
import { useRemembered } from "@shared/web/remembered"
import { Check, Pencil, Undo2 } from "@shared/ui/foundations/icons"

import { ActivityPanel } from "@/components/activity-panel"
import { TaskFormDialog, type TaskFormValues } from "@/components/task-form-dialog"
import { OverviewList } from "@/components/overview-list"
import { RecordFooter, RecordScreen, STICKY_TABS } from "@/components/record-chrome"
import { RecordTimerButton } from "@/components/timer-bar"
import { WorkLogsPanel, workLogsTotalKey } from "@/components/work-logs-panel"
import { CONCEPT_ICON } from "@/lib/pages"
import { content } from "@/lib/api"
import { tasksKey } from "@/lib/live-resources"
import { useTaskFormOptions } from "@/lib/use-task-form-options"
import { usePermissions } from "@/lib/perms"
import { useRecordActivity } from "@/lib/use-record-activity"
import { useRecordCounts } from "@/lib/use-record-counts"
import type { Task } from "@shared/types"
import { RecordMark } from "@shared/web/record-mark"
import { formatCount } from "@shared/web/format-count"
import { formatDate } from "@shared/web/format"
import { RichText } from "@shared/web/rich-text-view"
import { toast } from "@shared/ui/components/sonner/sonner"
import { invalidate, primeCache, useCachedValue } from "@shared/web/store"
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
  // The open tab is remembered per record for as long as this document
  // lives (web/lib/nav-memory.ts) — leaving to another section and coming
  // back lands on the tab she was reading, and a miss lands on "overview".
  const [tab, setTab] = useRemembered("tab", "overview")
  // CORRECTING THE TASK. The pickers come from the same hook the create form
  // uses, so the two forms cannot offer different clients or a different
  // department list; they are read only when this person could open the form at
  // all, the rule every other detail's pickers follow.
  const [editing, setEditing] = React.useState(false)
  const options = useTaskFormOptions(canEdit ? teamId : null)

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
          {/* CORRECT IT. There was no edit door at all until 19 Aug 2026, so this
              button had nothing to open: a task could be written and ticked and
              nothing else, and the two ticks the priority score is derived from
              were fixed at the moment somebody typed it. A ticked task is a
              record of something that happened — the door refuses one, and the
              button stands down rather than opening a form that will be
              rejected. */}
          {canEdit && !done && (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)} className="gap-1">
              <Pencil className="size-3.5" />
              {t("Edit")}
            </Button>
          )}
          {canEdit && (
            <Button size="sm" variant="secondary" onClick={onToggleDone} className="gap-1">
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

      <TaskFormDialog
        open={editing}
        onOpenChange={setEditing}
        draftKey={`task:edit:${taskId}`}
        teamId={teamId}
        members={options.members}
        apps={options.apps}
        accounts={options.accounts}
        departments={options.departments}
        defaultAssigneeId={task.assigneeId ?? ""}
        // THE TASK AS IT STANDS. The door replaces every field with what arrives,
        // so the form has to open holding the whole task — a blank form would
        // clear the four fields nobody touched.
        initial={{
          title: task.title,
          detail: task.detail ?? "",
          dueOn: task.dueOn ?? "",
          assigneeId: task.assigneeId ?? "",
          department: task.department ?? "",
          appId: task.appId ?? "",
          accountId: task.accountId ?? "",
          important: task.important,
          urgent: task.urgent,
          fileDataUrl: "",
          fileName: "",
        }}
        onSubmit={async (values: TaskFormValues) => {
          const { tasks } = await content.updateTask({
            id: taskId,
            title: values.title,
            detail: values.detail || undefined,
            dueOn: values.dueOn || undefined,
            assigneeId: values.assigneeId || undefined,
            accountId: values.accountId || undefined,
            appId: values.appId || undefined,
            department: values.department || undefined,
            important: values.important,
            urgent: values.urgent,
          })
          primeCache(tasksKey(teamId), tasks)
          invalidate(`activity:record:tasks:${taskId}`)
          toast.success(t("Task updated."))
        }}
      />

      {/* D7 / CHECKLIST 11.3 — who made it and when, grey, at the foot. */}
      <RecordFooter audit={{ createdByName: task.createdByName, createdAt: task.createdAt }} />
    </RecordScreen>
  )
}
