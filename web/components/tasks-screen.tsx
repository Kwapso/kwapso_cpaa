"use client"

// TASKS — the agency's own admin, and beside it what we are waiting on clients
// for. Two collections on one screen, and the pairing is the point: they are the
// same shape and opposite audiences, so showing them together is what stops
// somebody raising the wrong one. "Ours to do" is the list; "waiting on them" is
// the panel under it, which is the only place in the agency app that writes a row
// a client will read — so its button says so.
//
// A to-do gets no section of its own for the same reason meeting purposes get
// none: it is the other half of one idea, and a rail that lists both halves reads
// as two ideas.

import * as React from "react"

import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import {
  ScreenRenderer,
  type ScreenActionContext,
  type ScreenIntent,
} from "@kwapso/ui/registry/collections/screen-renderer/screen-renderer"
import type { ScreenRecipe, ScreenRights } from "@kwapso/ui/lib/recipe"
import { Inbox } from "lucide-react"

import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"

import { CollectionHeading } from "@/components/collection-heading"
import { CountedAbove } from "@/components/counted-tabs"
import { SectionWithCreate } from "@/components/deep-link/screen-bits"
import { TaskFormDialog, type TaskFormValues } from "@/components/task-form-dialog"
import { TodoFormDialog, type TodoFormValues } from "@/components/todo-form-dialog"
import { TodosPanel } from "@/components/work-panels"
import { content as contentApi } from "@/lib/api"
import { listFetch, tasksKey, todosKey, type TaskView } from "@/lib/live-resources"
import { withDataDrivenCollection } from "@/lib/screens"
import type { Task } from "@shared/types"
import { formatCount } from "@shared/web/format-count"
import { formatDate } from "@shared/web/format"
import { invalidate, useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"

/** One task, as a row: who has it and when it is due. A task that names a client
 * says so, because that is what puts its time in the right margin. */
function shapeTasks(tasks: Task[]) {
  return {
    rows: tasks.map((t) => ({
      id: t.id,
      name: t.ref ? `${t.ref} · ${t.title}` : t.title,
      detail:
        [
          t.status === "done" ? "Done" : "Open",
          t.assigneeName ?? "nobody yet",
          t.dueOn ? `due ${formatDate(t.dueOn)}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "—",
      // Facet columns (read by the filter engine, not the renderer).
      status: t.status === "done" ? "Done" : "Open",
      assignee: t.assigneeName ?? "Nobody yet",
    })),
  }
}

export function TasksScreen({
  teamId,
  recipe,
  rights,
  total,
  canCreate,
  allTotal,
  view,
  onViewChange,
  canRaiseTodo,
  canCancelTodo,
  onAction,
  onIntent,
}: {
  teamId: string
  recipe: ScreenRecipe
  rights: ScreenRights
  /** the exact server total (R16) — never the loaded list's length */
  total: number | undefined
  /** the same, for the whole pile including the finished ones */
  allTotal: number | undefined
  /** which pile is showing — a SERVER view, owned by the host so the reads can
   * key off it (see useScreenData) */
  view: TaskView
  onViewChange: (v: TaskView) => void
  canCreate: boolean
  canRaiseTodo: boolean
  canCancelTodo: boolean
  onAction: (actionId: string, ctx: ScreenActionContext) => void
  onIntent: (intent: ScreenIntent) => void
}) {
  const t = useT()
  const tasksQ = useCached<Task[]>(tasksKey(teamId, view), () => listFetch.tasks(teamId, view))
  const [taskOpen, setTaskOpen] = React.useState(false)
  const [todoOpen, setTodoOpen] = React.useState(false)

  async function addTask(values: TaskFormValues) {
    await contentApi.createTask({
      title: values.title,
      detail: values.detail || undefined,
      dueOn: values.dueOn ? new Date(values.dueOn).toISOString() : undefined,
    })
    // A new task belongs in BOTH piles, and only one of them is on screen.
    invalidate(tasksKey(teamId, "open"))
    invalidate(tasksKey(teamId, "all"))
    toast.success(t("Task added."))
  }

  async function raiseTodo(values: TodoFormValues) {
    await contentApi.raiseTodo({
      accountId: values.accountId,
      title: values.title,
      detail: values.detail || undefined,
      dueOn: values.dueOn ? new Date(values.dueOn).toISOString() : undefined,
    })
    invalidate(todosKey(teamId))
    toast.success(t("Asked — and emailed to them."))
  }

  if (tasksQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the tasks.")}</p>
  if (tasksQ.data === undefined) return <Skeleton variant="list" lines={4} />

  const data = shapeTasks(tasksQ.data)
  const listRecipe = withDataDrivenCollection(recipe, data.rows)

  // R16: the two badges are exact server counts, both primed by whichever view
  // was fetched — the finished pile cannot be counted from the open rows.
  const openBadge = formatCount(total)

  return (
    <CountedAbove active={openBadge !== ""}>
    <div className="flex flex-col gap-4">
      {/* R16: the count lives in ONE place. The strip below badges both views, so
          the heading stands down through the arbitration context rather than
          saying the same number twice. */}
      <CollectionHeading sectionKey="tasks" total={total} />

      <SectionWithCreate
        show={canCreate}
        label={t("New task")}
        icon="plus"
        onCreate={() => setTaskOpen(true)}
        // OPEN / ALL, above the boxed list — it scopes which tasks the card
        // shows, so it is not part of that unit. It is a SERVER view: the door
        // has parsed `?view=all` since it shipped and nothing ever sent it, so
        // the app had two piles of admin and could only ever show one of them.
        aboveCard={
          <TabsView
            config={{
              ...defaultTabsConfig,
              variant: "line",
              tabs: [
                {
                  value: "open",
                  label: t("Still to do"),
                  icon: "inbox",
                  badge: openBadge,
                  badgeVariant: "",
                },
                {
                  value: "all",
                  label: t("All tasks"),
                  icon: "list",
                  badge: formatCount(allTotal),
                  badgeVariant: "",
                },
              ],
            }}
            value={view}
            onValueChange={(v) => onViewChange(v as TaskView)}
          />
        }
      >
        <ScreenRenderer
          recipe={listRecipe}
          data={data}
          rights={rights}
          onAction={onAction}
          onIntent={onIntent}
        />
      </SectionWithCreate>

      {/* R14: BOUNDED, not paged — admin is ticked off as fast as it arrives. */}

      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
          <Inbox className="size-3.5" />
          {t("Waiting on clients")}
        </h2>
        <TodosPanel
          teamId={teamId}
          canCancel={canCancelTodo}
          onNew={canRaiseTodo ? () => setTodoOpen(true) : undefined}
        />
      </section>

      <TaskFormDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        draftKey={`task:add:${teamId}`}
        onSubmit={addTask}
      />
      <TodoFormDialog
        open={todoOpen}
        onOpenChange={setTodoOpen}
        draftKey={`todo:add:${teamId}`}
        onSubmit={raiseTodo}
      />
    </div>
    </CountedAbove>
  )
}
