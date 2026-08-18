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
//
// ── SIX VIEWS, ONE READ ────────────────────────────────────────────────────────
//
// Overdue, List, Calendar, Completed, Upcoming, All — the tester's own order, and
// every one of them a SERVER view (R14/R16): the list is capped, so sieving the
// loaded rows for the overdue ones would show "the overdue among the newest N"
// under a badge counting all of them. Whichever tab is open fetches its own pile,
// and every OTHER tab's count comes back with it, which is why six badges cost
// one request and not six.

import * as React from "react"

import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { Progress } from "@kwapso/ui/registry/primitives/progress/progress"
import {
  ScreenRenderer,
  type ScreenActionContext,
  type ScreenIntent,
} from "@kwapso/ui/registry/collections/screen-renderer/screen-renderer"
import {
  CalendarView,
  defaultCalendarViewConfig,
} from "@kwapso/ui/registry/collections/calendar-view/calendar-view"
import type { RecipeField, ScreenRecipe, ScreenRights } from "@kwapso/ui/lib/recipe"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"
import { Inbox } from "lucide-react"

import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"

import { CollectionHeading } from "@/components/collection-heading"
import { CountedAbove } from "@/components/counted-tabs"
import { SectionWithCreate } from "@/components/deep-link/screen-bits"
import { TaskFormDialog, type TaskFormValues } from "@/components/task-form-dialog"
import { TodoFormDialog, type TodoFormValues } from "@/components/todo-form-dialog"
import { TodosPanel } from "@/components/work-panels"
import { content as contentApi, tenancy } from "@/lib/api"
import { usePermissions } from "@/lib/perms"
import { appsKey, listFetch, tasksKey, todosKey, type TaskView } from "@/lib/live-resources"
import { SELECTABLE_GROUPS } from "@shared/selectable-groups"
import { withDataDrivenCollection } from "@/lib/screens"
import { PRIORITY_LABEL, departmentGlyph } from "@shared/departments"
import type { AppRow, Account, SelectableValue, Task, TeamMember } from "@shared/types"
import { formatCount } from "@shared/web/format-count"
import { formatDate, formatDateSortable } from "@shared/web/format"
import { invalidate, useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"
import { assignableMembers } from "@/lib/people"

/** One task, as a row. Every column the six views need is on it, so the two
 * column sets below are a CHOICE of what to show rather than two shapings that
 * could disagree about what a task is. */
function shapeTasks(tasks: Task[]) {
  return {
    rows: tasks.map((t) => {
      const mark = departmentGlyph(t.department)
      return {
        id: t.id,
        name: t.ref ? `${t.ref} · ${t.title}` : t.title,
        detail:
          [
            t.status === "done" ? "Done" : "Open",
            PRIORITY_LABEL[t.priority],
            t.assigneeName ?? "nobody yet",
            t.dueOn ? `deadline ${formatDate(t.dueOn)}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "—",
        // The four Eisenhower levels as their own column, so they are distinct on
        // the row, sortable in the table and narrowable in the filter bar — one
        // question ("how urgent AND how important?") answered in one word.
        priority: `${t.priority} · ${PRIORITY_LABEL[t.priority]}`,
        // The department's own mark leads its name, in the colour the agency
        // already chose for it. A word a team invented itself has no mark and
        // simply reads as itself.
        department: t.department ? `${mark} ${t.department}`.trim() : "—",
        app: t.appName ?? "—",
        client: t.accountName ?? "—",
        important: t.important ? "Yes" : "No",
        urgent: t.urgent ? "Yes" : "No",
        // THE TWO TABLE COLUMNS PEOPLE SORT, so they are the sortable spelling
        // of a date rather than the warm one (shared/web/format.ts says why).
        // The summary line above keeps `formatDate`: it is read, not compared.
        deadline: t.dueOn ? formatDateSortable(t.dueOn) : "—",
        closed: t.completedAt ? formatDateSortable(t.completedAt) : "—",
        // Facet columns (read by the filter engine, not the renderer).
        status: t.status === "done" ? "Done" : "Open",
        assignee: t.assigneeName ?? "Nobody yet",
      }
    }),
  }
}

const column =(col: string, label: string): RecipeField => ({
  column: col,
  type: "text",
  field: { ...defaultFieldConfig, label },
})

/** WHAT EACH VIEW PUTS IN FRONT OF YOU.
 *
 * The everyday piles answer "what is on my plate and how urgent is it". The
 * COMPLETED one answers a different question — what got done, for whom, and
 * whether it mattered — so it is the six columns the tester listed (department,
 * app, important, urgent, deadline, closed) and not the same table twice.
 *
 * Host-composed rather than a second recipe key: a screen choosing which of its
 * own columns to show is not a new screen, and a recipe a team can override
 * should stay one thing they can reason about. */
const EVERYDAY_COLUMNS = [
  column("name", "Task"),
  column("priority", "Priority"),
  column("department", "Department"),
  column("assignee", "Who has it"),
  column("deadline", "Deadline"),
]
const COMPLETED_COLUMNS = [
  column("department", "Department"),
  column("app", "App"),
  column("important", "Important"),
  column("urgent", "Urgent"),
  column("deadline", "Deadline"),
  column("closed", "Closed"),
]

/** THE SIX TABS, in the tester's order. Written as data so the strip, the fetch
 * key and the badge cannot fall out of step with each other. */
const TASK_TABS: { value: TaskView; label: string; icon: string }[] = [
  { value: "overdue", label: "Overdue", icon: "alert-triangle" },
  { value: "open", label: "List", icon: "inbox" },
  { value: "calendar", label: "Calendar", icon: "calendar" },
  { value: "completed", label: "Completed", icon: "check" },
  { value: "upcoming", label: "Upcoming", icon: "clock" },
  { value: "all", label: "All tasks", icon: "list" },
]

/** WHAT A TASK NEEDS TO BE WRITTEN AT ALL — the people it can be given to, the
 * apps a Production one must name, the clients a Sales one must name, and the
 * agency's own five departments. Every one is a cache another screen already
 * holds, so opening this form costs a team that has been anywhere else nothing. */
function useTaskFormOptions(teamId: string) {
  const membersQ = useCached<TeamMember[]>(`members:${teamId}`, () =>
    tenancy.members().then((r) => r.members)
  )
  const appsQ = useCached<AppRow[]>(appsKey(teamId), () => listFetch.apps(teamId))
  const accountsQ = useCached<Account[]>(`accounts:${teamId}`, () => listFetch.accounts(teamId))
  const valuesQ = useCached<SelectableValue[]>(`selectable:${teamId}`, () => listFetch.selectable(teamId))
  return {
    // Who's doing it: OUR people. A client login is an ordinary member and
    // was in this dropdown until the one seam started deciding (lib/people).
    members: assignableMembers(membersQ.data),
    apps: (appsQ.data ?? []).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name })),
    accounts: (accountsQ.data ?? []).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name })),
    // A retired department never appears as a pickable option, exactly as a
    // retired ticket type does not — but a task already filed under one still
    // reads truthfully.
    departments: (valuesQ.data ?? [])
      .filter((v) => v.active && v.type === SELECTABLE_GROUPS.department)
      .map((v) => v.value),
  }
}

export function TasksScreen({
  teamId,
  recipe,
  rights,
  total,
  canCreate,
  counts,
  view,
  onViewChange,
  myUserId,
  canRaiseTodo,
  canCancelTodo,
  onAction,
  onIntent,
}: {
  teamId: string
  recipe: ScreenRecipe
  rights: ScreenRights
  /** the exact server total of the OPEN pile (R16) — never a loaded list's length */
  total: number | undefined
  /** the other five tabs' exact totals, plus the progress bar's pair */
  counts: {
    all: number | undefined
    overdue: number | undefined
    upcoming: number | undefined
    completed: number | undefined
    calendar: number | undefined
    dueToday: number | undefined
    dueTodayDone: number | undefined
  }
  /** which pile is showing — a SERVER view, owned by the host so the reads can
   * key off it (see useScreenData) */
  view: TaskView
  onViewChange: (v: TaskView) => void
  /** whoever is signed in — the assignee a new task defaults to */
  myUserId: string | null
  canCreate: boolean
  canRaiseTodo: boolean
  canCancelTodo: boolean
  onAction: (actionId: string, ctx: ScreenActionContext) => void
  onIntent: (intent: ScreenIntent) => void
}) {
  const t = useT()
  const tasksQ = useCached<Task[]>(tasksKey(teamId, view), () => listFetch.tasks(teamId, view))
  const options = useTaskFormOptions(teamId)
  // WHOSE LIST THIS IS (4.9). The DOOR decides — a caller without
  // `all_tasks:read` is narrowed to their own name there, and every count above
  // comes back narrowed with it. This only says so, because a list that is
  // quietly shorter than a colleague's is the kind of thing people work around
  // for months rather than ask about. The same shape as 8.11: the door withholds,
  // the screen explains.
  const seesEveryones = usePermissions(teamId).can("all_tasks", "read")
  const [taskOpen, setTaskOpen] = React.useState(false)
  const [todoOpen, setTodoOpen] = React.useState(false)

  async function addTask(values: TaskFormValues) {
    await contentApi.createTask({
      title: values.title,
      detail: values.detail || undefined,
      dueOn: values.dueOn ? new Date(values.dueOn).toISOString() : undefined,
      assigneeId: values.assigneeId || undefined,
      department: values.department || undefined,
      appId: values.appId || undefined,
      accountId: values.accountId || undefined,
      important: values.important,
      urgent: values.urgent,
      fileDataUrl: values.fileDataUrl || undefined,
      fileName: values.fileName || undefined,
    })
    // A new task belongs in SEVERAL piles and only one of them is on screen.
    for (const v of TASK_TABS) invalidate(tasksKey(teamId, v.value))
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
    toast.success(t("Asked, and emailed to them."))
  }

  // R16: the badge on every tab is an exact server count, all seven numbers out
  // of the ONE read that fetched whichever pile is showing.
  const openBadge = formatCount(total)
  const badges: Record<TaskView, string> = {
    overdue: formatCount(counts.overdue),
    open: openBadge,
    calendar: formatCount(counts.calendar),
    completed: formatCount(counts.completed),
    upcoming: formatCount(counts.upcoming),
    all: formatCount(counts.all),
  }

  // TODAY'S TASKS, above the strip so it is on every tab rather than one of them:
  // how many of the things due today or earlier are done, out of how many there
  // are. It is deliberately not "due today" — Friday's unfinished job is still
  // today's problem, and a bar that forgot it every midnight would flatter us.
  const dueToday = counts.dueToday ?? 0
  const doneToday = counts.dueTodayDone ?? 0
  const progressBar = (
    <section className="flex flex-col gap-1.5" aria-label={t("Today's tasks")}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">{t("Today's tasks")}</h2>
        <p className="text-muted-foreground text-xs tabular-nums">
          {dueToday === 0
            ? t("Nothing due today or before.")
            : `${doneToday} / ${dueToday} ${t("done")}`}
        </p>
      </div>
      <Progress value={dueToday === 0 ? 100 : Math.round((doneToday / dueToday) * 100)} />
      {!seesEveryones && (
        <p className="text-muted-foreground text-xs">
          {t("These are the tasks assigned to you. Seeing everyone's is a separate access right.")}
        </p>
      )}
    </section>
  )

  if (tasksQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the tasks.")}</p>
  if (tasksQ.data === undefined) return <Skeleton variant="list" lines={4} />

  const data = shapeTasks(tasksQ.data)
  const columns = view === "completed" ? COMPLETED_COLUMNS : EVERYDAY_COLUMNS
  // A TABLE, not a two-line list, and that is what makes the four priority levels
  // distinct: each is its own sortable, filterable column rather than the fourth
  // clause of a summary sentence nobody reads to the end of.
  // THE DISPLAY IS DECIDED FIRST, then the collection is tuned to the rows — not
  // the other way round. A table's column headers ARE its sort control, and the
  // tuner stands its own picker down when it can see it is drawing one
  // (`frameSortOptions`); spreading the display on afterwards would hide that
  // fact from it and put two sort controls on one screen.
  const listRecipe = withDataDrivenCollection(
    { ...recipe, display: "table" as const, fields: columns },
    data.rows
  )

  // THE MONTH GRID — the library's own calendar-view, given the same rows. It
  // wants a bare date, so the deadline's day is what it is keyed on; the
  // department colour-codes the entry, which is the one thing you can read from
  // across a room.
  const calendarRows = tasksQ.data
    .filter((r) => r.dueOn)
    .map((r) => ({
      id: r.id,
      date: (r.dueOn as string).slice(0, 10),
      title: r.title,
      accent: r.department ?? "",
    }))

  return (
    <CountedAbove active={openBadge !== ""}>
    <div className="flex flex-col gap-4">
      {/* R16: the count lives in ONE place. The strip below badges all six views,
          so the heading stands down through the arbitration context rather than
          saying the same number twice. */}
      <CollectionHeading sectionKey="tasks" total={total} />

      <SectionWithCreate
        show={canCreate}
        label={t("New task")}
        icon="plus"
        onCreate={() => setTaskOpen(true)}
        // The progress bar and the six-view strip, above the boxed list — they
        // scope (and summarise) what the collection card shows, so neither is
        // part of that unit.
        aboveCard={
          <div className="flex flex-col gap-4">
            {progressBar}
            <TabsView
              config={{
                ...defaultTabsConfig,
                variant: "line",
                tabs: TASK_TABS.map((tab) => ({
                  value: tab.value,
                  label: t(tab.label),
                  icon: tab.icon,
                  badge: badges[tab.value],
                  badgeVariant: "" as const,
                })),
              }}
              value={view}
              onValueChange={(v) => onViewChange(v as TaskView)}
            />
          </div>
        }
      >
        {view === "calendar" ? (
          <CalendarView
            data={calendarRows}
            config={{
              ...defaultCalendarViewConfig,
              dateField: "date",
              titleField: "title",
              accentField: "accent",
              weekStartsOn: "monday",
            }}
          />
        ) : (
          <ScreenRenderer
            recipe={listRecipe}
            data={data}
            rights={rights}
            onAction={onAction}
            onIntent={onIntent}
          />
        )}
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
        teamId={teamId}
        members={options.members}
        apps={options.apps}
        accounts={options.accounts}
        departments={options.departments}
        defaultAssigneeId={myUserId ?? ""}
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
