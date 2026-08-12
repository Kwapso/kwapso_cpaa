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

import { CollectionHeading } from "@/components/collection-heading"
import { SectionWithCreate } from "@/components/deep-link/screen-bits"
import { TaskFormDialog, type TaskFormValues } from "@/components/task-form-dialog"
import { TodoFormDialog, type TodoFormValues } from "@/components/todo-form-dialog"
import { TodosPanel } from "@/components/work-panels"
import { content as contentApi } from "@/lib/api"
import { listFetch, tasksKey, todosKey } from "@/lib/live-resources"
import { withDataDrivenCollection } from "@/lib/screens"
import type { Task } from "@shared/types"
import { invalidate, useCached } from "@shared/web/store"

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
          t.dueOn ? `due ${t.dueOn.slice(0, 10)}` : null,
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
  canCreate: boolean
  canRaiseTodo: boolean
  canCancelTodo: boolean
  onAction: (actionId: string, ctx: ScreenActionContext) => void
  onIntent: (intent: ScreenIntent) => void
}) {
  const tasksQ = useCached<Task[]>(tasksKey(teamId), () => listFetch.tasks(teamId))
  const [taskOpen, setTaskOpen] = React.useState(false)
  const [todoOpen, setTodoOpen] = React.useState(false)

  async function addTask(values: TaskFormValues) {
    await contentApi.createTask({
      title: values.title,
      detail: values.detail || undefined,
      dueOn: values.dueOn ? new Date(values.dueOn).toISOString() : undefined,
    })
    invalidate(tasksKey(teamId))
    toast.success("Task added.")
  }

  async function raiseTodo(values: TodoFormValues) {
    await contentApi.raiseTodo({
      accountId: values.accountId,
      title: values.title,
      detail: values.detail || undefined,
      dueOn: values.dueOn ? new Date(values.dueOn).toISOString() : undefined,
    })
    invalidate(todosKey(teamId))
    toast.success("Asked — and emailed to them.")
  }

  if (tasksQ.error) return <p className="text-destructive text-sm">Couldn&apos;t load the tasks.</p>
  if (tasksQ.data === undefined) return <Skeleton variant="list" lines={4} />

  const data = shapeTasks(tasksQ.data)
  const listRecipe = withDataDrivenCollection(recipe, data.rows)

  return (
    <div className="flex flex-col gap-4">
      {/* R16: a sidebar page has no tab strip to badge, so the count lives in the
          heading — and it is the door's exact COUNT(*). */}
      <CollectionHeading sectionKey="tasks" total={total} />

      <SectionWithCreate
        show={canCreate}
        label="New task"
        icon="plus"
        onCreate={() => setTaskOpen(true)}
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
          Waiting on clients
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
  )
}
