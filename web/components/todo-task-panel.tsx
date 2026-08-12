"use client"

// THE OTHER TWO NOUNS, side by side on the Work page — and side by side is the
// point. A to-do and a task are the same shape and opposite audiences, and the
// most useful thing a screen can do about that is show them together so a person
// picks the right one: "waiting on THEM" in one column, "ours to do" in the other.
//
// The to-do column is the only place in the agency app that writes a row a client
// will read, so it says so out loud on the button: raising one emails them.

import * as React from "react"

import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { Ban, Check, Inbox, ListTodo, Plus, RotateCcw } from "lucide-react"

import { TodoFormDialog, type TodoFormValues } from "@/components/todo-form-dialog"
import { TaskFormDialog, type TaskFormValues } from "@/components/task-form-dialog"
import { ApiFailure, content as contentApi } from "@/lib/api"
import { listFetch, tasksKey, todosKey } from "@/lib/live-resources"
import type { Task, Todo } from "@shared/types"
import { invalidate, useCached } from "@shared/web/store"

function due(on: string | null): string {
  return on ? `due ${on.slice(0, 10)}` : "no date"
}

export function TodoTaskPanel({
  teamId,
  canRaiseTodo,
  canCancelTodo,
  canWriteTask,
}: {
  teamId: string
  canRaiseTodo: boolean
  canCancelTodo: boolean
  canWriteTask: boolean
}) {
  const todosQ = useCached<Todo[]>(todosKey(teamId), () => listFetch.todos(teamId))
  const tasksQ = useCached<Task[]>(tasksKey(teamId), () => listFetch.tasks(teamId))
  const [todoOpen, setTodoOpen] = React.useState(false)
  const [taskOpen, setTaskOpen] = React.useState(false)

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

  async function cancel(id: string) {
    try {
      await contentApi.cancelTodo(id)
      invalidate(todosKey(teamId))
      toast.success("Withdrawn.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't withdraw that.")
    }
  }

  async function addTask(values: TaskFormValues) {
    await contentApi.createTask({
      title: values.title,
      detail: values.detail || undefined,
      dueOn: values.dueOn ? new Date(values.dueOn).toISOString() : undefined,
    })
    invalidate(tasksKey(teamId))
    toast.success("Task added.")
  }

  async function tick(t: Task) {
    try {
      await contentApi.setTaskDone(t.id, t.status !== "done")
      invalidate(tasksKey(teamId))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't change that task.")
    }
  }

  const todos = todosQ.data ?? []
  const tasks = tasksQ.data ?? []

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
            <Inbox className="size-3.5" />
            Waiting on clients
          </h2>
          {canRaiseTodo && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setTodoOpen(true)}>
              <Plus className="size-3.5" />
              Ask for something
            </Button>
          )}
        </div>
        {todos.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing outstanding with a client.</p>
        ) : (
          <ul className="divide-border divide-y rounded-md border">
            {todos.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {t.ref ? `${t.ref} · ${t.title}` : t.title}
                    {t.completedAt && (
                      <Badge variant="secondary" className="ml-2 align-middle">
                        Done
                      </Badge>
                    )}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {[t.accountName, due(t.dueOn), t.fileName].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {canCancelTodo && !t.completedAt && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Withdraw this to-do"
                    onClick={() => cancel(t.id)}
                  >
                    <Ban className="size-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
            <ListTodo className="size-3.5" />
            Our own admin
          </h2>
          {canWriteTask && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setTaskOpen(true)}>
              <Plus className="size-3.5" />
              New task
            </Button>
          )}
        </div>
        {tasks.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing on our own list.</p>
        ) : (
          <ul className="divide-border divide-y rounded-md border">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {[t.assigneeName, due(t.dueOn)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {canWriteTask && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={t.status === "done" ? "Put it back" : "Tick it off"}
                    onClick={() => tick(t)}
                  >
                    {t.status === "done" ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5" />}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <TodoFormDialog
        open={todoOpen}
        onOpenChange={setTodoOpen}
        draftKey={`todo:add:${teamId}`}
        onSubmit={raiseTodo}
      />
      <TaskFormDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        draftKey={`task:add:${teamId}`}
        onSubmit={addTask}
      />
    </div>
  )
}
