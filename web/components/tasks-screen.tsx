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

import { Button } from "@shared/ui/components/button/button"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { toast } from "@shared/ui/components/sonner/sonner"
import { KpiProgress } from "@shared/ui/components/kpi-progress/kpi-progress"
import { SearchInput } from "@shared/ui/components/search-input/search-input"
import { ShapeStateBody } from "@shared/ui/compositions/states/states"
import type {
  ScreenActionContext,
  ScreenIntent,
} from "@shared/web/screen-engine/screen-renderer"
import type { ScreenRecipe, ScreenRights } from "@shared/web/screen-engine/recipe"
import { type CollectionConfig } from "@shared/web/screen-engine/config"
import { ClipboardText } from "@shared/ui/foundations/icons"

import { defaultTabsConfig } from "@shared/web/screen-engine/tabs-view"

import { CollectionHeading } from "@/components/collection-heading"
import { CountedAbove } from "@/components/counted-tabs"
import { RecordCalendar, type CalendarEntry } from "@/components/record-calendar"
import { RecordTable, visibleActions } from "@/components/record-table"
import { SectionWithCreate, AddButton, ToolbarRow } from "@/components/deep-link/screen-bits"
import { TaskFormDialog, type TaskFormValues } from "@/components/task-form-dialog"
import { useTaskFormOptions } from "@/lib/use-task-form-options"
import { TodoFormDialog, type TodoFormValues } from "@/components/todo-form-dialog"
import { TodosPanel } from "@/components/work-panels"
import { content as contentApi } from "@/lib/api"
import { usePermissions } from "@/lib/perms"
import { listFetch, tasksKey, todosKey, type TaskView } from "@/lib/live-resources"
import { field, translateFields, withDataDrivenCollection } from "@/lib/screens"
import { PRIORITY_LABEL, departmentGlyph } from "@shared/departments"
import type { Task } from "@shared/types"
import { formatCount } from "@shared/web/format-count"
import { formatDate, formatDateSortable } from "@shared/web/format"
import { RecordMark } from "@shared/web/record-mark"
import { invalidate, useCached } from "@shared/web/store"
import { useLanguage } from "@shared/web/language"
import type { Language } from "@shared/i18n"

/** One task, as a row. Every column the six views need is on it, so the two
 * column sets below are a CHOICE of what to show rather than two shapings that
 * could disagree about what a task is. */
function shapeTasks(tasks: Task[], lang: Language) {
  return {
    rows: tasks.map((t) => {
      const mark = departmentGlyph(t.department)
      return {
        id: t.id,
        // THE DEPARTMENT'S GLYPH IN THE SLOT (R35). It was already computed one
        // line up and spent entirely on the `department` COLUMN — concatenated
        // into that word, which is a pictograph inside a sentence, and invisible
        // on the list view where the column is not shown at all.
        mark: <RecordMark mark={mark || null} name={t.title} />,
        // NO REFERENCE PREFIX — the 2026-08-31 ruling puts a task in the same
        // no-reference category as a process, a role or a dropdown value.
        name: t.title,
        detail:
          [
            t.status === "done" ? "Done" : "Open",
            PRIORITY_LABEL[t.priority],
            t.assigneeName ?? "nobody yet",
            t.dueOn ? `deadline ${formatDate(t.dueOn, lang)}` : null,
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
  field("name", "Task"),
  field("priority", "Priority"),
  field("department", "Department"),
  field("assignee", "Who has it"),
  field("deadline", "Deadline"),
]
const COMPLETED_COLUMNS = [
  field("department", "Department"),
  field("app", "App"),
  field("important", "Important"),
  field("urgent", "Urgent"),
  field("deadline", "Deadline"),
  field("closed", "Closed"),
]

/** THE SIX TABS, in the tester's order. Written as data so the strip, the fetch
 * key and the badge cannot fall out of step with each other. */
const TASK_TABS: { value: TaskView; label: string; icon: string }[] = [
  { value: "overdue", label: "Overdue", icon: "warning" },
  { value: "open", label: "List", icon: "clipboard-text" },
  { value: "calendar", label: "Calendar", icon: "calendar-blank" },
  { value: "completed", label: "Completed", icon: "check" },
  { value: "upcoming", label: "Upcoming", icon: "clock" },
  { value: "all", label: "All tasks", icon: "list" },
]

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
  const { t, lang } = useLanguage()
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
  // THE CALENDAR'S OWN SEARCH — client ruling, 2026-09-03: "the toolbar,
  // including the search, should be absolutely everywhere we have a data view
  // or a collection view. Stop hardcoding this." This tab's toolbar used to be
  // a bare button (`RecordCalendar` never touches `CollectionFrame`, so the
  // other five tabs' engine-drawn search never reaches it) — a silent,
  // per-screen opt-out of exactly the kind the ruling is aimed at, not a
  // reasoned exemption. In-browser over `calendarEntries` below, the same
  // bounded shape the other five tabs already search in memory.
  const [calendarQuery, setCalendarQuery] = React.useState("")

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
    <section className="flex flex-col gap-2" aria-label={t("Today's tasks")}>
      <KpiProgress
        label={t("Today's tasks")}
        value={
          dueToday === 0
            ? t("Nothing due today or before.")
            : t("{done} / {due} done", { done: doneToday, due: dueToday })
        }
        percent={dueToday === 0 ? 100 : Math.round((doneToday / dueToday) * 100)}
      />
      {!seesEveryones && (
        <p className="text-muted-foreground text-xs">
          {t("These are the tasks assigned to you. Seeing everyone's is a separate access right.")}
        </p>
      )}
    </section>
  )

  if (tasksQ.error)
    return (
      <ShapeStateBody
        shape="collectionScreen"
        state="error"
        copy={{ errorTitle: t("Couldn't load the tasks.") }}
        action={
          <Button variant="secondary" onClick={() => tasksQ.refresh()}>
            {t("Try again")}
          </Button>
        }
      />
    )
  if (tasksQ.data === undefined) return <Skeleton variant="list" lines={4} />

  const data = shapeTasks(tasksQ.data, lang)
  const columns = view === "completed" ? COMPLETED_COLUMNS : EVERYDAY_COLUMNS
  // A TABLE, not a two-line list, and that is what makes the four priority levels
  // distinct: each is its own sortable, filterable column rather than the fourth
  // clause of a summary sentence nobody reads to the end of.
  // THE DISPLAY IS DECIDED FIRST, then the collection is tuned to the rows — not
  // the other way round. A table's column headers ARE its sort control, and the
  // tuner stands its own picker down when it can see it is drawing one
  // (`frameSortOptions`); spreading the display on afterwards would hide that
  // fact from it and put two sort controls on one screen.
  const tableRecipe = withDataDrivenCollection(
    // TRANSLATED HERE, because `resolveRecipe` translated the recipe before this
    // screen got it and these columns are the host's own — spread on afterwards,
    // they had never been through the pass, so every heading in this table
    // rendered in English whatever language the reader chose.
    { ...recipe, display: "table" as const, fields: translateFields(columns, t) },
    data.rows
  )
  // BOUNDED (R14): the whole list is in the browser, so the headers order it
  // here and order ALL of it — no `order` prop, `RecordTable` owns the answer.
  // The door's priority-first default is what the rows arrive in and what the
  // third click on a header returns to.
  //
  // It is NOT the engine's table: `ScreenRenderer` draws headers that cannot
  // sort, which is what this screen shipped with (record-table.tsx has the
  // whole sentence, and UI-GAPS #22(b) has the library's half).
  // Every column orders, and the name it orders by is its own key, because the
  // comparing happens here over rows that are all here.
  const tableColumns = tableRecipe.fields.map((f) => ({
    key: f.column,
    label: f.field.label,
    sort: f.column,
  }))

  // THE CALENDAR — the host's own (components/record-calendar.tsx), given the
  // same rows. It wants a bare day, so the deadline's day is what it is keyed on;
  // the department colour-codes the entry, which is the one thing you can read
  // from across a room. The second line is what the AGENDA has room for and a
  // square has not: how urgent it is, and whose it is.
  //
  // AND EVERY ONE OF THEM OPENS. `onOpen` is the engine's own `open` intent, so
  // a task reached from a square lands on exactly the screen the list reaches.
  const calendarEntries: CalendarEntry[] = tasksQ.data
    .filter((r) => r.dueOn)
    // THE CALENDAR'S OWN SEARCH (see `calendarQuery` above) — the title is the
    // one word every square already shows, so it is what a query narrows by,
    // the same bounded in-memory match `CollectionFrame`'s own search runs for
    // the other five tabs.
    .filter((r) => r.title.toLowerCase().includes(calendarQuery.trim().toLowerCase()))
    .map((r) => ({
      id: r.id,
      day: (r.dueOn as string).slice(0, 10),
      // NO REFERENCE PREFIX — see the same note on the list row above.
      title: r.title,
      accent: r.department ?? "",
      detail: [PRIORITY_LABEL[r.priority], r.assigneeName].filter(Boolean).join(" · "),
    }))

  return (
    <CountedAbove active={openBadge !== ""}>
    <div className="flex flex-col gap-6">
      {/* R16: the count lives in ONE place. The strip below badges all six views,
          so the heading stands down through the arbitration context rather than
          saying the same number twice. */}
      <CollectionHeading sectionKey="tasks" total={total} />

      <SectionWithCreate
        show={canCreate}
        label={t("New task")}
        icon="plus"
        onCreate={() => setTaskOpen(true)}
        // The progress bar SUMMARISES the collection, so it sits above the card
        // and outside it.
        aboveCard={progressBar}
        // The six views are the card's own tab strip: six filters on one kind
        // of record, drawn flush against the card the way `FolderTabStrip`
        // always has (the name predates v1.2.28's retirement of the folder
        // SHAPE — see tabs-view.tsx's header — the slot's own rule, "tabs
        // alone, nothing beside them," is unchanged). TABS ALONE now (client
        // ruling, 2026-08-31, correcting the earlier fix that shared this row
        // with "New task") — see the button below instead.
        folderTabs={{
          config: {
            ...defaultTabsConfig,
            tabs: TASK_TABS.map((tab) => ({
              value: tab.value,
              label: t(tab.label),
              icon: tab.icon,
              badge: badges[tab.value],
              badgeVariant: "" as const,
            })),
          },
          value: view,
          onValueChange: (v) => onViewChange(v as TaskView),
        }}
        // KIT PANEL ON EVERY TAB EXCEPT CALENDAR. `RecordCalendar` never touches
        // `CollectionFrame` (it is a month grid, not a collection body), so it has
        // no toolbar and no create-button context to draw into — turning the kit
        // panel on for that tab would strip its `CollectionCard` box and leave it
        // with neither box nor create button. The other five tabs are all
        // `RecordTable`, which now forwards this flag straight to the same
        // `CollectionFrame` every other flipped collection draws through.
        useKitPanel={view !== "calendar"}
      >
        {view === "calendar" ? (
          <div className="flex flex-col">
            {/* THE TOOLBAR, NOW WITH ITS OWN SEARCH — CLIENT RULING,
                2026-09-03, SUPERSEDING THE "BUTTON ONLY" NOTE THIS USED TO
                CARRY. Verbatim: "the toolbar, including the search, should be
                absolutely everywhere we have a data view or a collection
                view. Stop hardcoding this." `RecordCalendar` still never
                touches `CollectionFrame` (it is a month grid, not a
                collection body), so it still cannot inherit the other five
                tabs' engine-drawn search — but that is a reason this row
                needs its OWN search box, not a reason to have none. See
                `calendarQuery` above for the filter this narrows. */}
            <ToolbarRow
              search={
                calendarEntries.length > 0 || calendarQuery !== "" ? (
                  <SearchInput
                    value={calendarQuery}
                    onChange={(e) => setCalendarQuery(e.target.value)}
                    onClear={() => setCalendarQuery("")}
                    placeholder={t("Search tasks…")}
                    className="w-full"
                  />
                ) : null
              }
              actions={canCreate && <AddButton label={t("New task")} onClick={() => setTaskOpen(true)} />}
            />
            <RecordCalendar
              entries={calendarEntries}
              onOpen={(id) => onIntent({ kind: "open", module: "tasks", id })}
              emptyText={calendarQuery !== "" ? t("No tasks match your search.") : t("Nothing due this month.")}
            />
          </div>
        ) : (
          <RecordTable
            columns={tableColumns}
            rows={data.rows}
            config={tableRecipe.collection as CollectionConfig}
            actions={visibleActions(tableRecipe, rights, onAction)}
            onRowClick={(row) => onIntent({ kind: "open", module: "tasks", id: String(row.id) })}
            useKitPanel
          />
        )}
      </SectionWithCreate>

      {/* R14: BOUNDED, not paged — admin is ticked off as fast as it arrives. */}

      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground flex items-center gap-1 text-sm font-medium">
          <ClipboardText className="size-3.5" />
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
