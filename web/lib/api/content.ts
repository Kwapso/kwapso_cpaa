// CONTENT — tickets, the work engine and the knowledge base.
//
// One of the five door lists behind `@/lib/api`. They are split by WORKER,
// because that is the boundary the doors already have: a path under
// `/api/content/…` is answered by the content worker and nothing else.
//
// THE WHOLE DIRECTORY IS THE ATTACK SURFACE the two gateway suites derive from —
// workers/gateway/test/agency-door.test.ts walks every file here to prove each
// door reaches a worker, and workers/portal-gateway/test/portal-door.test.ts
// walks the same files to prove none of them reaches the CLIENT door. They read
// the DIRECTORY, not one file, so a door added in a new domain file is covered
// the day it lands.

import type {
  BrandAsset,
  DriveFileRow,
  GoogleConnection,
  GoogleService,
  GoogleShelf,
  GoogleSource,
  GoogleSourceKind,
  HelpAttachment,
  HelpMessage,
  HelpStakeholder,
  HelpTicket,
  KnowledgeAnswer,
  KnowledgeSource,
  RunningTimer,
  Sprint,
  Story,
  Task,
  TaskViewName,
  TeamPulse,
  Todo,
  WorkLog,
  WorkLogSummary,
  Meeting,
  MeetingPersonLink,
  MeetingPurpose,
  StaffCertificate,
  StaffProfile,
} from "@shared/types"
import type { RecordCounts } from "@shared/record-counts"
import { api, enc, post } from "@shared/web/api"

/** SEND A FILE AS THE BODY — the client half of the four streaming upload doors.
 *
 * The form fields in this app produce a base64 data URL (that is what a file input
 * plus a downsize step hands back), and the browser was never the constrained end:
 * the 25 MB ceiling was the WORKER's, three copies of the file in a 128 MB isolate.
 * So the data URL stays on this side and turns back into bytes here, at the edge of
 * the network call, so the request carries the file itself and the worker streams it
 * to storage without ever holding it.
 *
 * One helper for all four doors. The old base64 doors are still live for tabs that
 * were open before the deploy — they simply are not called from this build. */
async function sendFile<T>(path: string, dataUrl: string): Promise<T> {
  const blob = await (await fetch(dataUrl)).blob()
  return api<T>(path, {
    method: "POST",
    // The file's own type — a LABEL the door holds to its allow-list before it
    // stores anything under it.
    headers: { "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  })
}

import type { PagedResponse } from "@shared/web/api"

/** The facets the story list door parses — mirrored here so a caller cannot
 * invent one the server ignores in silence. */
export type StoryQuery = {
  status?: Story["status"]
  ticketId?: string
  sprintId?: string
  /** all the work on one system — a story always has an app, and only sometimes
   * a sprint, so this is the one narrowing every story answers to. */
  appId?: string
  assigneeId?: string
  /** "all" includes finished work; the default backlog view hides it. */
  view?: "open" | "all"
  /** the screen's search box — the reference, the title and the detail, matched
   * by the DOOR (the backlog pages, so a browser could only search page one). */
  q?: string
}

/** What a story create / edit may set. */
export type StoryWrite = {
  title: string
  detail?: string
  ticketId?: string
  sprintId?: string
  appId?: string
  processId?: string
  /** EVERY map this work touches (CHECKLIST 6.5) — sent WHOLE, because the set
   * replaces the one the story carries. An empty list is only accepted when
   * `changesNoStep` is ticked: "no process" is Aurora's explicit CHOICE, not a
   * field somebody left blank. */
  processIds?: string[]
  stepKey?: string
  changesNoStep?: boolean
  assigneeId?: string
  reviewerId?: string
  startsOn?: string
  dueOn?: string
  accountId?: string
  /** Fix / Feature / Change — REQUIRED (CHECKLIST 6.2), and editable on the
   * Dropdown values screen like every other vocabulary in the app. */
  storyType: string
}

/** The facets the work-log list door parses. */
/** What every tasks door answers with: the rows for the view asked for, the
 * count over that view, and EVERY view's count for the strip's six badges (R16)
 * — plus the pair the progress bar at the top of every tab is made of. All of
 * them come out of one server read, so no two can disagree. */
export type TaskListResponse = {
  tasks: Task[]
  total: number
  openTotal: number
  allTotal: number
  overdueTotal: number
  upcomingTotal: number
  completedTotal: number
  calendarTotal: number
  /** everything due today or earlier, and how many of those are done */
  dueTodayTotal: number
  dueTodayDone: number
}

export type LogQuery = {
  scope?: "mine" | "all"
  targetTable?: string
  targetId?: string
  userId?: string
}

function logQuery(filter: LogQuery | undefined, cursor: string | null | undefined): string {
  const q = new URLSearchParams()
  if (filter?.scope) q.set("scope", filter.scope)
  if (filter?.targetTable) q.set("targetTable", filter.targetTable)
  if (filter?.targetId) q.set("targetId", filter.targetId)
  if (filter?.userId) q.set("userId", filter.userId)
  if (cursor) q.set("cursor", cursor)
  const s = q.toString()
  return s ? `?${s}` : ""
}

function storyQuery(
  filter: StoryQuery | undefined,
  cursor: string | null | undefined,
  // The ORDER is not a filter and does not travel in one: a filter says which
  // rows, this says in what sequence. Kept apart so a caller cannot narrow by
  // accident while meaning to sort.
  order?: { sort?: string; dir?: string }
): string {
  const q = new URLSearchParams()
  if (filter?.status) q.set("status", filter.status)
  if (filter?.ticketId) q.set("ticketId", filter.ticketId)
  if (filter?.sprintId) q.set("sprintId", filter.sprintId)
  if (filter?.appId) q.set("appId", filter.appId)
  if (filter?.assigneeId) q.set("assigneeId", filter.assigneeId)
  if (filter?.view) q.set("view", filter.view)
  if (filter?.q) q.set("q", filter.q)
  if (order?.sort) q.set("sort", order.sort)
  if (order?.dir) q.set("dir", order.dir)
  if (cursor) q.set("cursor", cursor)
  const s = q.toString()
  return s ? `?${s}` : ""
}

/** Content worker — Tickets, the work engine and the knowledge base. */
export const content = {
  /** R14: a PAGE of tickets (a GROWING collection) — hand back `nextCursor` from
   * the previous response to get the next one. `total`/`mineTotal` are exact. */
  help: (
    scope: "mine" | "all" = "all",
    cursor?: string | null,
    view: "live" | "archived" = "live",
    /** the search box, answered by the DOOR — the list pages, so a browser could
     * only ever search the page it had loaded. `total` counts the same question. */
    q?: string,
    /** one client's tickets — the door narrows, so the rows and the exact total
     * beside them answer the same question (R16). */
    accountId?: string,
    /** THE SUB-TAB STRIP (CHECKLIST 5.1), and both halves are the DOOR's filters
     * rather than the browser's: the list pages, so narrowing a loaded page to
     * "Questions" would answer "the questions among the newest fifty" while the
     * badge above it counted them all. `byType` / `byStatus` come back with every
     * page and are what the badges read. */
    helpType?: string,
    status?: HelpTicket["status"],
    /** ONE SYSTEM'S tickets — the app record's Tickets tab (CHECKLIST 8.6). The
     * door narrows and counts the same narrowed question, so the tab badge and
     * the rows under it are one answer (R16). */
    appId?: string,
    /** WHAT ORDER — a name out of the door's own TICKET_SORTS, with `dir`
     * flipping it. ONE trailing object rather than two more positional
     * parameters on a function that already takes eight: the door's default is
     * the drag-rank, so omitting this is the order the list has always had. */
    order?: { sort?: string; dir?: string }
  ) =>
    api<
      PagedResponse<{
        tickets: HelpTicket[]
        mineTotal: number
        byType: Record<string, number>
        byStatus: Record<string, number>
      }>
    >(
      `/api/content/help?scope=${scope}&view=${view}${q ? `&q=${enc(q)}` : ""}${
        accountId ? `&accountId=${enc(accountId)}` : ""
      }${appId ? `&appId=${enc(appId)}` : ""}${helpType ? `&helpType=${enc(helpType)}` : ""}${
        status ? `&status=${enc(status)}` : ""
      }${order?.sort ? `&sort=${enc(order.sort)}` : ""}${order?.dir ? `&dir=${enc(order.dir)}` : ""}${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
      }`
    ),
  /** PUT IT AWAY, or take it back out. The door has answered this since archive
   * shipped; nothing on any screen called it, so a ticket could be archived by
   * the assistant and then never found again by a person. */
  archiveHelp: (id: string, archived: boolean) =>
    api<PagedResponse<{ tickets: HelpTicket[]; mineTotal: number }>>(
      "/api/content/help/archive",
      post({ id, archived })
    ),
  helpOne: (id: string) =>
    api<{ tickets: HelpTicket[] }>(`/api/content/help?id=${enc(id)}`).then((r) => r.tickets[0] ?? null),
  helpThread: (id: string) =>
    api<{ replies: HelpMessage[]; total: number }>(`/api/content/help/thread?id=${enc(id)}`),
  // `accountId` names the CLIENT the ticket is raised for. Staff only, and the
  // door decides that — a portal caller's account comes from the guard corridor
  // and the body is never consulted (workers/content/src/lib/help.ts).
  createHelp: (input: {
    description: string
    helpType?: string
    sourceScreen?: string
    accountId?: string
    /** WHICH SYSTEM (5.8) and WHO ASKED (5.9). The contact is checked against the
     * account's own live links, so a ticket can never name a stranger. */
    appId?: string
    raisedByContactId?: string
  }) => api<{ tickets: HelpTicket[] }>("/api/content/help", post(input)),
  updateHelp: (input: {
    id: string
    description: string
    helpType?: string
    accountId?: string
    appId?: string
    raisedByContactId?: string
  }) => api<{ tickets: HelpTicket[] }>("/api/content/help/update", post(input)),
  setHelpStatus: (id: string, status: HelpTicket["status"]) =>
    api<{ tickets: HelpTicket[] }>("/api/content/help/status", post({ id, status })),
  /** SOMEBODY HAS READ IT — the one judgement in the ticket lifecycle nothing can
   * infer, and the only act the triage screen performs (5.11). Everything after
   * it happens by itself. */
  triageRead: (id: string) =>
    api<{ tickets: HelpTicket[] }>("/api/content/help/triage-read", post({ id })),
  /** THE CLIENT SAYS YES (5.13). Staff press it too, for the answer that arrives
   * by phone; a client presses it in their own portal. */
  validateHelp: (id: string) =>
    api<{ tickets: HelpTicket[] }>("/api/content/help/validate", post({ id })),
  /** ANSWER IT AND TELL THEM (5.6 + 5.7). The resolution is REQUIRED — the door
   * refuses without it, which is the whole of 5.6 — and the send goes to whoever
   * raised it and that client's main stakeholder. */
  resolveHelp: (id: string, resolution: string) =>
    api<{ sent: boolean; alreadyResolved: boolean }>("/api/content/help/resolve", post({ id, resolution })),
  /** Several files and several links on one ticket (5.10). The same three doors
   * the client portal calls — this is one record with one list, not two. */
  helpAttachments: (id: string) =>
    api<{ attachments: HelpAttachment[]; total: number }>(`/api/content/help/attachments?id=${enc(id)}`),
  addHelpAttachment: (input: {
    id: string
    kind: "file" | "link"
    label: string
    url?: string
    fileDataUrl?: string
  }) => api<{ attachments: HelpAttachment[]; total: number }>("/api/content/help/attachments", post(input)),
  removeHelpAttachment: (id: string, attachmentId: string) =>
    api<{ attachments: HelpAttachment[]; total: number }>(
      "/api/content/help/attachments/remove",
      post({ id, attachmentId })
    ),
  replyHelp: (helpId: string, body: string, taggedUserIds?: string[]) =>
    api<{ replies: HelpMessage[]; total: number }>("/api/content/help/reply", post({ helpId, body, taggedUserIds })),
  helpStakeholders: (id: string) =>
    api<{ stakeholders: HelpStakeholder[] }>(`/api/content/help/stakeholders?id=${enc(id)}`),
  addStakeholder: (id: string, userId: string) =>
    api<{ stakeholders: HelpStakeholder[] }>("/api/content/help/stakeholders", post({ id, userId })),

  /* --------------------------- the work engine ----------------------------- */
  /** R14: a PAGE of stories (a GROWING collection) — hand `nextCursor` back to
   * get the next one. `total`/`mineTotal` are the exact server counts, taken
   * over the SAME filter the page came from. */
  stories: (opts: { filter?: StoryQuery; order?: { sort?: string; dir?: string }; cursor?: string | null } = {}) =>
    api<PagedResponse<{ stories: Story[]; mineTotal: number }>>(
      `/api/content/stories${storyQuery(opts.filter, opts.cursor, opts.order)}`
    ),
  storyOne: (id: string) =>
    api<{ stories: Story[] }>(`/api/content/stories?id=${enc(id)}`).then((r) => r.stories[0] ?? null),
  createStory: (input: StoryWrite) => api<{ stories: Story[] }>("/api/content/stories", post(input)),
  updateStory: (input: StoryWrite & { id: string }) =>
    api<{ stories: Story[] }>("/api/content/stories/update", post(input)),
  /** Move a story. `review` carries what 6.9 requires before `in_review`: the
   * explanation, and optionally something to show for it. The door refuses the
   * move while a timer on the story is still running. */
  setStoryStatus: (
    id: string,
    status: Story["status"],
    closingNote?: string,
    review?: { reviewNote?: string; reviewFileUrl?: string; reviewFileName?: string }
  ) =>
    api<{ stories: Story[] }>(
      "/api/content/stories/status",
      post({ id, status, closingNote, ...review })
    ),
  sprints: (filter: { accountId?: string; appId?: string; when?: "open" | "all" } = {}) => {
    const q = new URLSearchParams()
    if (filter.accountId) q.set("accountId", filter.accountId)
    if (filter.appId) q.set("appId", filter.appId)
    // CHECKLIST 6.3: the story form asks for current-or-future blocks only, and
    // the DOOR decides which those are — a browser filtering on `completedAt`
    // alone would keep offering a sprint that ended in March.
    if (filter.when) q.set("when", filter.when)
    const qs = q.toString()
    return api<{ sprints: Sprint[]; total: number }>(`/api/content/sprints${qs ? `?${qs}` : ""}`)
  },
  sprintOne: (id: string) =>
    api<{ sprints: Sprint[] }>("/api/content/sprints").then(
      (r) => r.sprints.find((s) => s.id === id) ?? null
    ),
  createSprint: (input: {
    name: string
    goal?: string
    sprintType?: string
    accountId?: string
    appId?: string
    startsOn?: string
    endsOn?: string
    soldPriceCents?: number
    currency?: string
  }) => api<{ sprints: Sprint[]; total: number }>("/api/content/sprints", post(input)),
  /** Edit a sprint. No `accountId` / `appId`: the door will not move a sprint to
   * another client or another app (workers/content/src/lib/stories.ts says why). */
  updateSprint: (input: {
    id: string
    name: string
    goal?: string
    sprintType?: string
    startsOn?: string
    endsOn?: string
    soldPriceCents?: number
    currency?: string
  }) => api<{ sprints: Sprint[]; total: number }>("/api/content/sprints/update", post(input)),
  setSprintComplete: (id: string, complete: boolean) =>
    api<{ sprints: Sprint[]; total: number }>("/api/content/sprints/complete", post({ id, complete })),

  /* --------------------------------- triage --------------------------------- */
  /** Whose week it is, and the requests nobody has read past three days. One
   * door, because the screen asks them as one question. Internal only — the door
   * refuses a client login. */
  triage: (week?: string) =>
    api<{
      onDuty: { userId: string; userName: string | null; weekStart: string } | null
      /** CHECKLIST 5.11 — is this caller the one on duty? The DOOR decides, and
       * `waiting` is empty when they are not. A screen that hid a list it had
       * already been handed would be a curtain rather than a rule. */
      yours: boolean
      waiting: { id: string; ref: string | null; description: string; createdAt: string; days: number }[]
      total: number
    }>(`/api/content/triage${week ? `?week=${enc(week)}` : ""}`),
  setTriageDuty: (userId: string, week?: string) =>
    api<{ onDuty: { userId: string; userName: string | null } | null; total: number }>(
      "/api/content/triage",
      post({ userId, week })
    ),

  /* --------------------------------- the pulse ------------------------------ */
  /** THE TEAM'S WEEK IN NUMBERS — the one read behind Home's big numbers and its
   * two charts. Internal only (the door refuses a client login), and gated
   * SECTION by section: a section comes back `null` when the caller's role
   * cannot read that module, which is why every screen reading this must render
   * nothing for a null rather than an empty state (R18). */
  insights: () => api<TeamPulse>("/api/content/insights"),

  /** HOW MANY OF EACH THING HANG OFF ONE RECORD — this worker's half (sprints,
   * stories, to-dos, tickets, meetings, a ticket's files). Asked when the record
   * opens so its tabs are badged before anybody clicks one; the rows behind each
   * tab stay lazy. */
  recordCounts: (table: string, id: string) =>
    api<RecordCounts>(`/api/content/record-counts?table=${enc(table)}&id=${enc(id)}`),

  /* ---------------------------- to-dos and tasks ---------------------------- */
  /** What we are waiting on a client for. Fenced: a client login sees their own
   * company's. Bounded rather than paged — a to-do is a thing we are WAITING on. */
  todos: (opts: { accountId?: string; view?: "open" | "all" } = {}) =>
    api<{ todos: Todo[]; total: number }>(
      `/api/content/todos${opts.accountId || opts.view ? `?${new URLSearchParams({ ...(opts.accountId ? { accountId: opts.accountId } : {}), ...(opts.view ? { view: opts.view } : {}) }).toString()}` : ""}`
    ),
  todoOne: (id: string) =>
    api<{ todos: Todo[] }>("/api/content/todos?view=all").then((r) => r.todos.find((t) => t.id === id) ?? null),
  raiseTodo: (input: { accountId: string; title: string; detail?: string; dueOn?: string; ticketId?: string }) =>
    api<{ todos: Todo[]; total: number }>("/api/content/todos", post(input)),
  /** The client's own act — mark it done, and attach the one file they were asked
   * for. `fileDataUrl` is a base64 data URL; the door caps and parses it. */
  completeTodo: (id: string, file?: { dataUrl: string; name: string }) =>
    api<{ todo: Todo }>(
      "/api/content/todos/complete",
      post({ id, fileDataUrl: file?.dataUrl, fileName: file?.name })
    ),
  cancelTodo: (id: string) => api<{ todos: Todo[]; total: number }>("/api/content/todos/cancel", post({ id })),
  /** Our own admin, in one of six views. Every view's count comes back whichever
   * one was asked for (R16) — the badge on a tab you are not looking at cannot be
   * derived from the rows on the one you are. `total` is the count over what was
   * listed. */
  tasks: (view?: TaskViewName) =>
    api<TaskListResponse>(`/api/content/tasks${view ? `?view=${view}` : ""}`),
  taskOne: (id: string) =>
    api<{ tasks: Task[] }>("/api/content/tasks?view=all").then((r) => r.tasks.find((t) => t.id === id) ?? null),
  /** `fileDataUrl` is a base64 data URL — the door caps it, parses it and puts
   * the bytes in the agency's own bucket, exactly as a to-do's attachment is. */
  createTask: (input: {
    title: string
    detail?: string
    dueOn?: string
    assigneeId?: string
    accountId?: string
    appId?: string
    department?: string
    important?: boolean
    urgent?: boolean
    fileDataUrl?: string
    fileName?: string
  }) => api<TaskListResponse>("/api/content/tasks", post(input)),
  setTaskDone: (id: string, done: boolean) =>
    api<TaskListResponse>("/api/content/tasks/done", post({ id, done })),

  /* ---------------------------------- time ---------------------------------- */
  /** R14: a PAGE of time. `total` is the row count and `totalSeconds` is the
   * number anybody actually reads — both exact, both over the same filter. */
  workLogs: (opts: { filter?: LogQuery; cursor?: string | null } = {}) =>
    api<PagedResponse<{ logs: WorkLog[]; totalSeconds: number }>>(
      `/api/content/work-logs${logQuery(opts.filter, opts.cursor)}`
    ),
  /** THE NUMBERS ON TOP OF A RECORD'S TIME — the same filter as the page above,
   * answered in aggregate by the same door's own parser, so the header and the
   * rows are one question (R16). Never summed in the browser: the list is a
   * PAGE, so adding up what is loaded would answer about the newest fifty. */
  workLogSummary: (filter?: LogQuery) =>
    api<WorkLogSummary>(`/api/content/work-logs/summary${logQuery(filter, null)}`),
  /** One row of time, read back off its own page — there is no by-id door,
   * because a work log is only ever read in a list of its neighbours. */
  workLogOne: (id: string) =>
    api<PagedResponse<{ logs: WorkLog[]; totalSeconds: number }>>("/api/content/work-logs").then(
      (r) => r.logs.find((l) => l.id === id) ?? null
    ),
  runningTimers: () => api<{ timers: RunningTimer[] }>("/api/content/work-logs/running"),
  startTimer: (targetTable: string, targetId: string, note?: string) =>
    api<{ timers: RunningTimer[] }>("/api/content/work-logs/start", post({ targetTable, targetId, note })),
  stopTimer: (id: string, endedAt?: string) =>
    api<{ timers: RunningTimer[] }>("/api/content/work-logs/stop", post({ id, endedAt })),
  logTime: (input: {
    targetTable: string
    targetId: string
    startedAt: string
    endedAt: string
    note?: string
    kind?: string
    billable?: boolean
  }) => api<PagedResponse<{ logs: WorkLog[]; totalSeconds: number }>>("/api/content/work-logs", post(input)),
  updateWorkLog: (input: {
    id: string
    startedAt?: string
    endedAt?: string
    note?: string
    kind?: string
    billable?: boolean
  }) =>
    api<PagedResponse<{ logs: WorkLog[]; totalSeconds: number }>>(
      "/api/content/work-logs/update",
      post(input)
    ),
  /** The Monday morning answer: keep the whole thing, stop it at a moment you
   * name, or bin it. Never automatic. */
  resolveRunaway: (id: string, answer: "keep" | "stopAt" | "discard", at?: string) =>
    api<{ timers: RunningTimer[] }>("/api/content/work-logs/runaway", post({ id, answer, at })),
  setTimerAutoStop: (on: boolean) =>
    api<{ ok: true; autoStop: boolean }>("/api/content/work-logs/auto-stop", post({ on })),

  /* ------------------------------- knowledge ------------------------------- */
  /** R14: a PAGE of sources (a GROWING collection) — hand `nextCursor` back to
   * get the next one. `total` is the exact server count the badge shows. */
  knowledge: (cursor?: string | null, find: { q?: string; kind?: string; compartment?: string } = {}) => {
    // The door's own three filters (SEARCH.md layer 2). The list pages, so the
    // search box has to be answered here — page one of a thousand sources is not
    // the knowledge base, it is the newest fifty of it.
    const p = new URLSearchParams()
    if (find.q) p.set("q", find.q)
    if (find.kind) p.set("kind", find.kind)
    if (find.compartment) p.set("compartment", find.compartment)
    if (cursor) p.set("cursor", cursor)
    const qs = p.toString()
    return api<PagedResponse<{ sources: KnowledgeSource[] }>>(
      `/api/content/knowledge${qs ? `?${qs}` : ""}`
    )
  },
  knowledgeOne: (id: string) =>
    api<{ sources: KnowledgeSource[] }>(`/api/content/knowledge?id=${enc(id)}`).then(
      (r) => r.sources[0] ?? null
    ),
  /** Ask the knowledge base a question. Answers with the passages plus the sources
   * they came from (Law R23) and, when `compose` is set, the answer written out of
   * exactly those passages — which costs one unit of the team's AI allowance and
   * needs the assistant right, so the screen only asks when the person has it. */
  askKnowledge: (question: string, accountId?: string | null, compose?: boolean) =>
    api<KnowledgeAnswer>(
      `/api/content/knowledge/ask?q=${enc(question)}${accountId ? `&accountId=${enc(accountId)}` : ""}${
        compose ? "&compose=1" : ""
      }`
    ),
  knowledgeStatus: () =>
    api<{
      ingest: {
        kind: string
        lastRunAt: string | null
        lastOkAt: string | null
        lastError: string | null
        sourcesIndexed: number
      }[]
    }>("/api/content/knowledge/sync"),
  createKnowledge: (input: {
    title: string
    body?: string | null
    sourceUrl?: string | null
    accountId?: string | null
    visibility?: string
    /** 12.3: limit it to the people staffed to one app. The door refuses an app
     * the caller is not on, so this can never lock somebody out of their own. */
    visibleToAppId?: string | null
  }) => api<{ source: KnowledgeSource | null; total: number }>("/api/content/knowledge", post(input)),
  /** Hand the knowledge base a FILE. One call, one record: the bytes and the row
   * are written together, so closing the tab halfway can never leave a stored
   * file nothing points at. The answer is the source itself — read `fileNote` to
   * find out whether its words are searchable or whether it is only kept.
   *
   * THE BYTES GO AS THE BODY, not inside it (`/upload-stream`). The old door
   * (`/upload`) took a base64 data URL in a JSON envelope, which the worker had to
   * materialise whole before it could validate anything — a 25 MB file became
   * ~33 MB of base64, plus the decoded copy, plus the JSON around them, in a
   * 128 MB isolate. That was the real ceiling, and it was the SERVER's.
   *
   * It stays a data URL on THIS side, because that is what the file field
   * produces and the browser was never the constrained end. The conversion back
   * to bytes happens here, at the edge of the network call, so the request
   * carries the file itself and the worker streams it to storage without ever
   * holding it. The metadata rides the query string for the same reason — there
   * is no JSON body left to put it in.
   *
   * The old door is still there and still works. A browser holds its own copy of
   * this app for as long as the tab is open, so a build shipped before today keeps
   * uploading through the door it knows about. */
  uploadKnowledgeFile: async (input: {
    fileName: string
    fileDataUrl: string
    title?: string
    accountId?: string | null
    visibility?: string
    visibleToAppId?: string | null
  }) => {
    const blob = await (await fetch(input.fileDataUrl)).blob()
    const q = new URLSearchParams({ fileName: input.fileName })
    if (input.title) q.set("title", input.title)
    if (input.accountId) q.set("accountId", input.accountId)
    if (input.visibility) q.set("visibility", input.visibility)
    if (input.visibleToAppId) q.set("visibleToAppId", input.visibleToAppId)
    return api<{ source: KnowledgeSource | null; total: number }>(
      `/api/content/knowledge/upload-stream?${q}`,
      {
        method: "POST",
        // The file's own type, so the converter can pick a reader. It is a LABEL:
        // the object is stored under a neutral type whatever this says.
        headers: { "Content-Type": blob.type || "application/octet-stream" },
        body: blob,
      }
    )
  },
  updateKnowledge: (input: {
    id: string
    title: string
    body?: string | null
    sourceUrl?: string | null
    accountId?: string | null
    visibility?: string
    visibleToAppId?: string | null
  }) =>
    api<{ source: KnowledgeSource | null; total: number }>("/api/content/knowledge/update", post(input)),
  setKnowledgeActive: (id: string, active: boolean) =>
    api<{ source: KnowledgeSource | null; total: number }>(
      "/api/content/knowledge/active",
      post({ id, active })
    ),
  /** One bounded slice of the sweep. `caughtUp` false means there is more to do —
   * the screen calls again rather than waiting a quarter of an hour. */
  syncKnowledge: () =>
    api<{
      results: { kind: string; read: number; indexed: number; caughtUp: boolean; error?: string }[]
      caughtUp: boolean
      total: number
    }>("/api/content/knowledge/sync", post({})),
  /** The PERSONAL half of the sweep: my own Drive folders, spaces, mail and
   * diary, read through MY connection. Empty results mean I have connected
   * nothing yet — the consent screen is a browser round-trip nobody can do for
   * me. */
  /** `onlyIfStale` is what the app-open catch-up sends (14.12): don't ask Google
   * when this person's kinds were swept inside the door's five-minute floor.
   * The Settings BUTTON leaves it off — a deliberate press always asks. */
  syncGoogleKnowledge: (onlyIfStale = false) =>
    api<{
      results: { kind: string; read: number; indexed: number; caughtUp: boolean; error?: string }[]
      /** true = we did NOT ask Google, because this person's kinds were already
       * brought into step inside the door's five-minute floor (14.12). The
       * results are then the state as of that last real sweep. */
      skipped: boolean
      caughtUp: boolean
      total: number
    }>("/api/content/knowledge/sync-google", post({ onlyIfStale })),

  /* -------------------------------- meetings -------------------------------- */
  /** R14: a PAGE of meetings (a GROWING collection — an event is never curated
   * away) — hand `nextCursor` back for the next one. `total` is the exact server
   * count the heading shows. `view` is 'upcoming' by default. */
  meetings: (
    cursor?: string | null,
    view?: "upcoming" | "week" | "all",
    /** the diary's search box, answered by the DOOR — the list pages, and the
     * meeting somebody digs for is the OLD one. */
    q?: string,
    /** one client's diary — the door already parses it; this is the web half. */
    accountId?: string,
    /** ONE SYSTEM'S diary, for the app record's own Meetings tab. Asked of the
     * SERVER rather than filtered in the browser: the diary pages, so "this
     * app's meetings among the newest fifty" is an answer that looks like one. */
    appId?: string,
    /** WHAT ORDER — a name out of the door's own MEETING_SORTS, with `dir`
     * flipping it. One trailing object, as on `help` above and for the same
     * reason. Omit it for the diary's own order, most recent first. */
    order?: { sort?: string; dir?: string }
  ) =>
    api<PagedResponse<{ meetings: Meeting[]; weekTotal: number }>>(
      `/api/content/meetings?view=${enc(view ?? "all")}${q ? `&q=${enc(q)}` : ""}${
        accountId ? `&accountId=${enc(accountId)}` : ""
      }${appId ? `&appId=${enc(appId)}` : ""}${order?.sort ? `&sort=${enc(order.sort)}` : ""}${
        order?.dir ? `&dir=${enc(order.dir)}` : ""
      }${cursor ? `&cursor=${enc(cursor)}` : ""}`
    ),
  /** BRING THE CALENDAR AND THE DIARY INTO STEP, BOTH WAYS (9.7, and the owner's
   * "it should also update consistently if it's a past event").
   *
   * Three counts, because the sweep does three things over a window that reaches
   * a fortnight back and four weeks on: repeating entries with no record become
   * one (`created`), every meeting in the window has its Google facts refreshed
   * (`updated`), and one called off in Google is cancelled here (`cancelled`).
   * `ahead` is the instances beyond the horizon, read-only. */
  syncCalendar: () =>
    api<{
      created: number
      updated: number
      cancelled: number
      ahead: { eventId: string; title: string; startsAt: string; url: string | null }[]
    }>("/api/content/meetings/sync-calendar", post({})),
  /** WHAT WAS SAID, in full — read off the meeting row rather than from Google,
   * so any colleague who may read meetings can read it. Its own call because of
   * its size: a page of the diary is fifty meetings and a transcript is up to a
   * megabyte. */
  meetingTranscript: (id: string) =>
    api<{
      text: string
      /** present only when the transcript was longer than one row may hold. */
      note: string | null
      url: string | null
      foundBy: string | null
      capturedAt: string | null
    }>(`/api/content/meetings/transcript?id=${enc(id)}`),
  /** WHICH OF THE PEOPLE ON THE INVITATION WE KNOW — a colleague, or a contact on
   * one of our accounts. A read rather than a column, because a contact added
   * next week should light up on a meeting held last week. */
  meetingPeople: (id: string) =>
    api<{ links: MeetingPersonLink[] }>(`/api/content/meetings/people?id=${enc(id)}`),
  meetingOne: (id: string) =>
    api<{ meetings: Meeting[] }>(`/api/content/meetings?id=${enc(id)}`).then((r) => r.meetings[0] ?? null),
  createMeeting: (input: {
    title: string
    startsAt: string
    endsAt?: string | null
    accountId?: string | null
    appId?: string | null
    purposeId?: string | null
    agenda?: string | null
    notes?: string | null
    location?: string | null
  }) => api<{ meeting: Meeting | null; total: number }>("/api/content/meetings", post(input)),
  updateMeeting: (input: { id: string } & Partial<Meeting>) =>
    api<{ meeting: Meeting | null; total: number }>("/api/content/meetings/update", post(input)),
  setMeetingHeld: (id: string, held: boolean) =>
    api<{ meeting: Meeting | null; total: number }>("/api/content/meetings/held", post({ id, held })),
  setMeetingActive: (id: string, active: boolean) =>
    api<{ meeting: Meeting | null; total: number }>("/api/content/meetings/active", post({ id, active })),
  /** READ THE TRANSCRIPT and do what its arrival means (9.4 + 9.2): the meeting
   * is ticked held and a row of time is written for each of OUR people who was
   * in the room. Idempotent — a second press does nothing. */
  readMeetingTranscript: (id: string) =>
    api<{
      captured: boolean
      fileId: string | null
      fileName: string | null
      logsWritten: number
      note: string | null
      meeting: Meeting | null
    }>("/api/content/meetings/transcript", post({ id })),

  /* ------------------- the agency's own housekeeping ------------------------
   * Two modules, both CAPPED rather than paged (R14) — an authored library and a
   * settled taxonomy, so each door answers with the whole collection plus its
   * exact `total` for the badge (R16). */
  brandAssets: () => api<{ assets: BrandAsset[]; total: number }>("/api/content/brand-assets"),
  brandAssetOne: (id: string) =>
    api<{ assets: BrandAsset[] }>(`/api/content/brand-assets?id=${enc(id)}`).then((r) => r.assets[0] ?? null),
  createBrandAsset: (input: Partial<BrandAsset>) =>
    api<{ assets: BrandAsset[]; total: number }>("/api/content/brand-assets", post(input)),
  updateBrandAsset: (input: Partial<BrandAsset> & { id: string }) =>
    api<{ assets: BrandAsset[]; total: number }>("/api/content/brand-assets/update", post(input)),
  setBrandAssetActive: (id: string, active: boolean) =>
    api<{ assets: BrandAsset[]; total: number }>("/api/content/brand-assets/active", post({ id, active })),
  /** Upload the bytes behind an asset (gated brand_assets:create). Streams the
   * bytes as the request body; get back the served /media/internal URL. */
  uploadBrandAssetFile: (dataUrl: string) =>
    sendFile<{ url: string; contentType: string }>("/api/content/brand-assets/upload-stream", dataUrl),

  meetingPurposes: () => api<{ purposes: MeetingPurpose[]; total: number }>("/api/content/delivery/purposes"),
  meetingPurposeOne: (id: string) =>
    api<{ purposes: MeetingPurpose[] }>(`/api/content/delivery/purposes?id=${enc(id)}`).then(
      (r) => r.purposes[0] ?? null
    ),
  createMeetingPurpose: (input: Partial<MeetingPurpose>) =>
    api<{ purposes: MeetingPurpose[]; total: number }>("/api/content/delivery/purposes", post(input)),
  updateMeetingPurpose: (input: Partial<MeetingPurpose> & { id: string }) =>
    api<{ purposes: MeetingPurpose[]; total: number }>("/api/content/delivery/purposes/update", post(input)),
  setMeetingPurposeActive: (id: string, active: boolean) =>
    api<{ purposes: MeetingPurpose[]; total: number }>("/api/content/delivery/purposes/active", post({ id, active })),

  staffProfiles: () => api<{ profiles: StaffProfile[]; total: number }>("/api/content/staff/profiles"),
  /** Write a colleague's profile — one door for "there wasn't one" and "there
   * was" (see workers/content/src/routes/staff.ts for why it is not two). */
  saveStaffProfile: (input: Partial<StaffProfile> & { userId: string }) =>
    api<{ profiles: StaffProfile[]; total: number }>("/api/content/staff/profiles", post(input)),
  setStaffProfileActive: (id: string, active: boolean) =>
    api<{ profiles: StaffProfile[]; total: number }>("/api/content/staff/profiles/active", post({ id, active })),
  /** A profile photo or a certificate, streamed as the request body. */
  uploadStaffFile: (dataUrl: string) =>
    sendFile<{ url: string; contentType: string }>("/api/content/staff/upload-stream", dataUrl),

  /** `userId` narrows at the DOOR, not in the client: a member's page shows one
   * person's certificates, and filtering a capped list afterwards would disagree
   * with the count beside it (R16). */
  staffCertificates: (userId?: string) =>
    api<{ certificates: StaffCertificate[]; total: number }>(
      `/api/content/staff/certificates${userId ? `?userId=${enc(userId)}` : ""}`
    ),
  createStaffCertificate: (input: Partial<StaffCertificate> & { userId: string }) =>
    api<{ certificates: StaffCertificate[]; total: number }>("/api/content/staff/certificates", post(input)),
  updateStaffCertificate: (input: Partial<StaffCertificate> & { id: string }) =>
    api<{ certificates: StaffCertificate[]; total: number }>("/api/content/staff/certificates/update", post(input)),
  setStaffCertificateActive: (id: string, active: boolean) =>
    api<{ certificates: StaffCertificate[]; total: number }>(
      "/api/content/staff/certificates/active",
      post({ id, active })
    ),

  // ── GOOGLE ─────────────────────────────────────────────────────────────────
  // Your own connections, and what you have chosen to share through them. Every
  // door here answers about the CALLER — there is no `userId` to pass and no way
  // to ask about a colleague's Drive, which is the module's whole promise
  // expressed as an absence.
  //
  // `/start` is deliberately NOT here: it is a 302 to Google's consent screen, so
  // the browser navigates to it (`window.location.href`) rather than fetching it.
  // A door that answers with a redirect is not an API call, and wrapping it in
  // one would only produce a promise that resolves to a page nobody rendered.
  googleConnections: () =>
    api<{ connections: GoogleConnection[]; sources: GoogleSource[]; ready: boolean }>(
      "/api/content/google/connections"
    ),
  /** Finish a handshake. Takes nothing: the authorization code is in an HttpOnly
   * cookie the callback left, which is why it never reached this code at all. */
  googleConnect: () =>
    api<{ connections: GoogleConnection[]; sources: GoogleSource[] }>(
      "/api/content/google/connect",
      post({})
    ),
  googleDisconnect: (service: GoogleService) =>
    api<{
      changed: boolean
      revokedAtGoogle: boolean
      connections: GoogleConnection[]
      sources: GoogleSource[]
    }>("/api/content/google/disconnect", post({ service })),

  /** What could I name? Folders or FILES (Drive), or spaces (Chat), this person
   * can see. `named` false on a Chat option means the label is one WE wrote from
   * the space's type — Google leaves the name of a direct message empty — so the
   * picker can say so rather than presenting our sentence as Google's. */
  googlePick: (service: "drive" | "chat", q?: string, kind?: "folder" | "file") =>
    api<{
      options: {
        externalId: string
        name: string
        named: boolean
        iconUrl: string | null
        mimeType: string
        /** whether Google can render a picture of it — the FACT, not the link
         * (that one is authenticated and expires). Ask
         * `googleDriveThumbnailUrl` for the picture itself. */
        hasThumbnail: boolean
      }[]
    }>(
      `/api/content/google/pick?service=${enc(service)}${kind ? `&kind=${enc(kind)}` : ""}${
        q ? `&q=${enc(q)}` : ""
      }`
    ),
  /** Share SEVERAL — and say, in the same call, who may read them AND whose
   * material they are. Both questions are about where the contents end up,
   * neither can be read back off the contents afterwards, and both are the same
   * answer for every item in one act of sharing, which is why the list is in the
   * call rather than the call being made once per item. */
  googleAddSources: (input: {
    service: "drive" | "chat"
    items: { externalId: string; name: string; kind: GoogleSourceKind }[]
    shelf: GoogleShelf
    accountId?: string | null
  }) => api<{ sources: GoogleSource[]; shared: number }>("/api/content/google/sources", post(input)),
  googleSetSourceActive: (id: string, active: boolean) =>
    api<{ sources: GoogleSource[] }>("/api/content/google/sources/active", post({ id, active })),

  /** Files in the folders I named PLUS the files I named one by one. Each row
   * carries Google's own icon for its type — an unauthenticated static link,
   * which is why it can go straight into a page where `thumbnailUrl` cannot
   * (that one needs `googleDriveThumbnailUrl` below). */
  googleDriveFiles: (q?: string) =>
    api<{ files: DriveFileRow[] }>(`/api/content/google/drive/files${q ? `?q=${enc(q)}` : ""}`),
  /** THE ADDRESS OF A PREVIEW, not the preview — a src for an `<img>`.
   *
   * Google's own `thumbnailLink` is authenticated and expires within hours, so
   * it cannot be put in a page; this points at our own door, which fetches the
   * picture with the caller's token and never stores it. A plain string rather
   * than a fetch because that is what an `<img src>` wants, and because the
   * browser's own cache is then the thing that stops a list asking twice. */
  googleDriveThumbnailUrl: (fileId: string) =>
    `/api/content/google/drive/thumbnail?fileId=${enc(fileId)}`,
  googleMail: (q?: string) =>
    api<{ messages: MailSummary[]; contactsUsed: number; note?: string }>(
      `/api/content/google/gmail/messages${q ? `?q=${enc(q)}` : ""}`
    ),
  /** Write a reply and leave it in the person's OWN Gmail drafts. Nothing is
   * sent — the answer carries the link that opens it, and the id that the send
   * door can then send. */
  googleDraftMail: (input: { to: string; subject: string; body: string; threadId?: string }) =>
    api<{ draft: { draftId: string; messageId: string; threadId: string; url: string } }>(
      "/api/content/google/gmail/draft",
      post(input)
    ),
  /** "Send it from kwapso" — the button beside the draft link. It needs the
   * role's own send switch, exactly as the assistant does. */
  googleSendMail: (input: {
    draftId?: string
    to?: string
    subject?: string
    body?: string
    threadId?: string
  }) => api<{ sent: { messageId: string; threadId: string } }>("/api/content/google/gmail/send", post(input)),

  googleEvents: (from?: string, to?: string) =>
    api<{ events: CalendarEntry[] }>(
      `/api/content/google/calendar/events${from || to ? `?from=${enc(from ?? "")}&to=${enc(to ?? "")}` : ""}`
    ),
  googleCreateEvent: (input: {
    summary: string
    description?: string
    start: string
    end: string
    allDay?: boolean
  }) => api<{ event: CalendarEntry }>("/api/content/google/calendar/events", post(input)),
  /** A sprint's dates, in your calendar — the one FROM-kwapso push that has a
   * record to push today. */
  googleSprintToCalendar: (sprintId: string) =>
    api<{ event: CalendarEntry }>("/api/content/google/calendar/sprint", post({ sprintId })),
  /** The other half: a meeting booked here, in my own calendar. `alreadyThere`
   * is how the screen says "it is already in your diary" instead of quietly
   * making a second entry. */
  googleMeetingToCalendar: (meetingId: string) =>
    api<{ event: { id: string; url: string | null }; alreadyThere: boolean }>(
      "/api/content/google/calendar/meeting",
      post({ meetingId })
    ),

  googleChat: (sourceId: string) =>
    api<{ messages: ChatLine[]; space: string }>(
      `/api/content/google/chat/messages?sourceId=${enc(sourceId)}`
    ),
  googlePostChat: (sourceId: string, text: string) =>
    api<{ message: ChatLine }>("/api/content/google/chat/messages", post({ sourceId, text })),
}

/** What the mail list shows — a subject, who it is with, and the link that opens
 * it in the person's own Gmail. Declared here rather than in shared/types
 * because it is a SHAPE OF AN ANSWER from Google, not a record this product
 * owns: nothing writes one, nothing stores one, and a type in the shared file
 * would invite somebody to try. */
export type MailSummary = {
  id: string
  threadId: string
  from: string
  to: string
  subject: string
  snippet: string
  date: string | null
  url: string
}

export type CalendarEntry = {
  id: string
  summary: string
  description: string
  start: string
  end: string
  url: string | null
}

export type ChatLine = {
  id: string
  space: string
  sender: string
  text: string
  createdAt: string | null
}

/** Data-ops worker — the agentic file import + the AI agent. */
