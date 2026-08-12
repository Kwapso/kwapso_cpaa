// CONTENT — learning articles and tickets.
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
  GoogleConnection,
  GoogleService,
  GoogleShelf,
  GoogleSource,
  HelpMessage,
  HelpStakeholder,
  HelpTicket,
  KnowledgeAnswer,
  KnowledgeSource,
  Learning,
  LearningProgressEntry,
  RunningTimer,
  Sprint,
  Story,
  Task,
  Todo,
  WorkLog,
  MarketingPost,
  MeetingPurpose,
  Program,
  StaffCertificate,
  StaffProfile,
} from "@shared/types"
import { api, enc, post } from "@shared/web/api"
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
}

/** What a story create / edit may set. */
export type StoryWrite = {
  title: string
  detail?: string
  ticketId?: string
  sprintId?: string
  appId?: string
  processId?: string
  stepKey?: string
  changesNoStep?: boolean
  assigneeId?: string
  reviewerId?: string
  startsOn?: string
  dueOn?: string
  accountId?: string
}

/** The facets the work-log list door parses. */
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

function storyQuery(filter: StoryQuery | undefined, cursor: string | null | undefined): string {
  const q = new URLSearchParams()
  if (filter?.status) q.set("status", filter.status)
  if (filter?.ticketId) q.set("ticketId", filter.ticketId)
  if (filter?.sprintId) q.set("sprintId", filter.sprintId)
  if (filter?.appId) q.set("appId", filter.appId)
  if (filter?.assigneeId) q.set("assigneeId", filter.assigneeId)
  if (filter?.view) q.set("view", filter.view)
  if (cursor) q.set("cursor", cursor)
  const s = q.toString()
  return s ? `?${s}` : ""
}

/** Content worker — Learning + Tickets (team-DB content modules). */
export const content = {
  learning: () => api<{ learning: Learning[]; total: number }>("/api/content/learning"),
  learningOne: (id: string) =>
    api<{ learning: Learning[] }>(`/api/content/learning?id=${enc(id)}`).then((r) => r.learning[0] ?? null),
  createLearning: (input: Partial<Learning>) =>
    api<{ learning: Learning[] }>("/api/content/learning", post(input)),
  updateLearning: (input: Partial<Learning> & { id: string }) =>
    api<{ learning: Learning[] }>("/api/content/learning/update", post(input)),
  setLearningActive: (id: string, active: boolean) =>
    api<{ learning: Learning[] }>("/api/content/learning/active", post({ id, active })),
  /** Upload a file for an article (gated by learning:create). Send the raw
   * base64 data URL; get back the served /media URL + its content type. */
  uploadLearningFile: (dataUrl: string, filename?: string) =>
    api<{ url: string; contentType: string }>(
      "/api/content/learning/upload",
      post({ dataUrl, filename })
    ),
  markLearningDone: (id: string, done: boolean) =>
    api<{ ok: true }>("/api/content/learning/done", post({ id, done })),
  learningProgress: () =>
    api<{ progress: LearningProgressEntry[] }>("/api/content/learning/progress"),

  /** R14: a PAGE of tickets (a GROWING collection) — hand back `nextCursor` from
   * the previous response to get the next one. `total`/`mineTotal` are exact. */
  help: (scope: "mine" | "all" = "all", cursor?: string | null, view: "live" | "archived" = "live") =>
    api<PagedResponse<{ tickets: HelpTicket[]; mineTotal: number }>>(
      `/api/content/help?scope=${scope}&view=${view}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
    ),
  /** PUT IT AWAY, or take it back out. The door has answered this since archive
   * shipped; nothing on any screen called it, so a ticket could be archived by
   * the assistant and then never found again by a person. */
  archiveHelp: (id: string, archived: boolean) =>
    api<PagedResponse<{ tickets: HelpTicket[]; mineTotal: number }>>(
      "/api/content/help/archive",
      post({ id, archived })
    ),
  /** WHERE THE PERSON PUT IT — the body names NEIGHBOURS, never a position, so two
   * people reordering at once cannot fight over a number (shared/workers/rank.ts). */
  rankHelp: (id: string, afterId: string | null, beforeId: string | null) =>
    api<PagedResponse<{ tickets: HelpTicket[]; mineTotal: number }>>(
      "/api/content/help/rank",
      post({ id, afterId, beforeId })
    ),
  helpOne: (id: string) =>
    api<{ tickets: HelpTicket[] }>(`/api/content/help?id=${enc(id)}`).then((r) => r.tickets[0] ?? null),
  helpThread: (id: string) =>
    api<{ replies: HelpMessage[]; total: number }>(`/api/content/help/thread?id=${enc(id)}`),
  createHelp: (input: { description: string; helpType?: string; sourceScreen?: string }) =>
    api<{ tickets: HelpTicket[] }>("/api/content/help", post(input)),
  updateHelp: (input: { id: string; description: string; helpType?: string }) =>
    api<{ tickets: HelpTicket[] }>("/api/content/help/update", post(input)),
  setHelpStatus: (id: string, status: HelpTicket["status"]) =>
    api<{ tickets: HelpTicket[] }>("/api/content/help/status", post({ id, status })),
  replyHelp: (helpId: string, body: string, taggedUserIds?: string[]) =>
    api<{ replies: HelpMessage[]; total: number }>("/api/content/help/reply", post({ helpId, body, taggedUserIds })),
  /** ANSWER IT: resolve the ticket, add the words to its conversation, and email
   * the client. One call, because they are one act — and `alreadyResolved` comes
   * back rather than a second email when the answer has already gone. */
  resolveHelp: (id: string, resolution: string) =>
    api<{ sent: boolean; alreadyResolved: boolean }>("/api/content/help/resolve", post({ id, resolution })),
  helpStakeholders: (id: string) =>
    api<{ stakeholders: HelpStakeholder[] }>(`/api/content/help/stakeholders?id=${enc(id)}`),
  addStakeholder: (id: string, userId: string) =>
    api<{ stakeholders: HelpStakeholder[] }>("/api/content/help/stakeholders", post({ id, userId })),

  /* --------------------------- the work engine ----------------------------- */
  /** R14: a PAGE of stories (a GROWING collection) — hand `nextCursor` back to
   * get the next one. `total`/`mineTotal` are the exact server counts, taken
   * over the SAME filter the page came from. */
  stories: (opts: { filter?: StoryQuery; cursor?: string | null } = {}) =>
    api<PagedResponse<{ stories: Story[]; mineTotal: number }>>(
      `/api/content/stories${storyQuery(opts.filter, opts.cursor)}`
    ),
  storyOne: (id: string) =>
    api<{ stories: Story[] }>(`/api/content/stories?id=${enc(id)}`).then((r) => r.stories[0] ?? null),
  createStory: (input: StoryWrite) => api<{ stories: Story[] }>("/api/content/stories", post(input)),
  updateStory: (input: StoryWrite & { id: string }) =>
    api<{ stories: Story[] }>("/api/content/stories/update", post(input)),
  setStoryStatus: (id: string, status: Story["status"], closingNote?: string) =>
    api<{ stories: Story[] }>("/api/content/stories/status", post({ id, status, closingNote })),
  rankStory: (id: string, afterId: string | null, beforeId: string | null) =>
    api<{ stories: Story[] }>("/api/content/stories/rank", post({ id, afterId, beforeId })),
  /** The blocks of sold work. `accountId` narrows to one client, `appId` to one
   * system — the same two questions the door parses, so a caller cannot invent a
   * third the server ignores in silence. */
  sprints: (filter: { accountId?: string; appId?: string } = {}) => {
    const q = new URLSearchParams()
    if (filter.accountId) q.set("accountId", filter.accountId)
    if (filter.appId) q.set("appId", filter.appId)
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
  setSprintComplete: (id: string, complete: boolean) =>
    api<{ sprints: Sprint[]; total: number }>("/api/content/sprints/complete", post({ id, complete })),

  /* --------------------------------- triage --------------------------------- */
  /** Whose week it is, and the requests nobody has read past three days. One
   * door, because the screen asks them as one question. Internal only — the door
   * refuses a client login. */
  triage: (week?: string) =>
    api<{
      onDuty: { userId: string; userName: string | null; weekStart: string } | null
      waiting: { id: string; ref: string | null; description: string; createdAt: string; days: number }[]
      total: number
    }>(`/api/content/triage${week ? `?week=${enc(week)}` : ""}`),
  setTriageDuty: (userId: string, week?: string) =>
    api<{ onDuty: { userId: string; userName: string | null } | null; total: number }>(
      "/api/content/triage",
      post({ userId, week })
    ),

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
  tasks: (view?: "open" | "all") =>
    api<{ tasks: Task[]; total: number }>(`/api/content/tasks${view ? `?view=${view}` : ""}`),
  taskOne: (id: string) =>
    api<{ tasks: Task[] }>("/api/content/tasks?view=all").then((r) => r.tasks.find((t) => t.id === id) ?? null),
  createTask: (input: { title: string; detail?: string; dueOn?: string; assigneeId?: string; accountId?: string }) =>
    api<{ tasks: Task[]; total: number }>("/api/content/tasks", post(input)),
  setTaskDone: (id: string, done: boolean) =>
    api<{ tasks: Task[]; total: number }>("/api/content/tasks/done", post({ id, done })),

  /* ---------------------------------- time ---------------------------------- */
  /** R14: a PAGE of time. `total` is the row count and `totalSeconds` is the
   * number anybody actually reads — both exact, both over the same filter. */
  workLogs: (opts: { filter?: LogQuery; cursor?: string | null } = {}) =>
    api<PagedResponse<{ logs: WorkLog[]; totalSeconds: number }>>(
      `/api/content/work-logs${logQuery(opts.filter, opts.cursor)}`
    ),
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
  knowledge: (cursor?: string | null) =>
    api<PagedResponse<{ sources: KnowledgeSource[] }>>(
      `/api/content/knowledge${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`
    ),
  knowledgeOne: (id: string) =>
    api<{ sources: KnowledgeSource[] }>(`/api/content/knowledge?id=${enc(id)}`).then(
      (r) => r.sources[0] ?? null
    ),
  /** Ask the knowledge base a question. A READ — it writes nothing and answers
   * with passages plus the sources they came from (Law R23). */
  askKnowledge: (question: string, accountId?: string | null) =>
    api<KnowledgeAnswer>(
      `/api/content/knowledge/ask?q=${enc(question)}${accountId ? `&accountId=${enc(accountId)}` : ""}`
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
  }) => api<{ source: KnowledgeSource | null; total: number }>("/api/content/knowledge", post(input)),
  updateKnowledge: (input: {
    id: string
    title: string
    body?: string | null
    sourceUrl?: string | null
    accountId?: string | null
    visibility?: string
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

  /* ------------------- the agency's own housekeeping ------------------------
   * Four modules, all CAPPED rather than paged (R14) — authored libraries and
   * settled taxonomies, the same shape Learning is, so each door answers with
   * the whole collection plus its exact `total` for the badge (R16). */
  marketing: () => api<{ posts: MarketingPost[]; total: number }>("/api/content/marketing"),
  marketingOne: (id: string) =>
    api<{ posts: MarketingPost[] }>(`/api/content/marketing?id=${enc(id)}`).then((r) => r.posts[0] ?? null),
  createMarketingPost: (input: Partial<MarketingPost>) =>
    api<{ posts: MarketingPost[]; total: number }>("/api/content/marketing", post(input)),
  updateMarketingPost: (input: Partial<MarketingPost> & { id: string }) =>
    api<{ posts: MarketingPost[]; total: number }>("/api/content/marketing/update", post(input)),
  setMarketingPostActive: (id: string, active: boolean) =>
    api<{ posts: MarketingPost[]; total: number }>("/api/content/marketing/active", post({ id, active })),

  brandAssets: () => api<{ assets: BrandAsset[]; total: number }>("/api/content/brand-assets"),
  brandAssetOne: (id: string) =>
    api<{ assets: BrandAsset[] }>(`/api/content/brand-assets?id=${enc(id)}`).then((r) => r.assets[0] ?? null),
  createBrandAsset: (input: Partial<BrandAsset>) =>
    api<{ assets: BrandAsset[]; total: number }>("/api/content/brand-assets", post(input)),
  updateBrandAsset: (input: Partial<BrandAsset> & { id: string }) =>
    api<{ assets: BrandAsset[]; total: number }>("/api/content/brand-assets/update", post(input)),
  setBrandAssetActive: (id: string, active: boolean) =>
    api<{ assets: BrandAsset[]; total: number }>("/api/content/brand-assets/active", post({ id, active })),
  /** Upload the bytes behind an asset (gated brand_assets:create). Send the raw
   * base64 data URL; get back the served /media/internal URL. */
  uploadBrandAssetFile: (dataUrl: string) =>
    api<{ url: string; contentType: string }>("/api/content/brand-assets/upload", post({ dataUrl })),

  programmes: () => api<{ programs: Program[]; total: number }>("/api/content/delivery/programs"),
  programmeOne: (id: string) =>
    api<{ programs: Program[] }>(`/api/content/delivery/programs?id=${enc(id)}`).then((r) => r.programs[0] ?? null),
  createProgramme: (input: Partial<Program>) =>
    api<{ programs: Program[]; total: number }>("/api/content/delivery/programs", post(input)),
  updateProgramme: (input: Partial<Program> & { id: string }) =>
    api<{ programs: Program[]; total: number }>("/api/content/delivery/programs/update", post(input)),
  setProgrammeActive: (id: string, active: boolean) =>
    api<{ programs: Program[]; total: number }>("/api/content/delivery/programs/active", post({ id, active })),

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
  uploadStaffFile: (dataUrl: string) =>
    api<{ url: string; contentType: string }>("/api/content/staff/upload", post({ dataUrl })),

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

  /** What could I name? Folders (Drive) or spaces (Chat) this person can see. */
  googlePick: (service: "drive" | "chat", q?: string) =>
    api<{ options: { externalId: string; name: string }[] }>(
      `/api/content/google/pick?service=${enc(service)}${q ? `&q=${enc(q)}` : ""}`
    ),
  /** Share one — and say, in the same call, who may read it. */
  googleAddSource: (input: {
    service: "drive" | "chat"
    externalId: string
    name: string
    shelf: GoogleShelf
  }) => api<{ sources: GoogleSource[] }>("/api/content/google/sources", post(input)),
  googleSetSourceActive: (id: string, active: boolean) =>
    api<{ sources: GoogleSource[] }>("/api/content/google/sources/active", post({ id, active })),

  googleDriveFiles: (q?: string) =>
    api<{ files: { id: string; name: string; webViewLink: string | null; folderId: string }[] }>(
      `/api/content/google/drive/files${q ? `?q=${enc(q)}` : ""}`
    ),
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
