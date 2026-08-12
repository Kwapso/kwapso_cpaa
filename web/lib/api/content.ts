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
  WorkLog,
} from "@shared/types"
import { api, enc, post } from "@shared/web/api"
import type { PagedResponse } from "@shared/web/api"

/** The facets the story list door parses — mirrored here so a caller cannot
 * invent one the server ignores in silence. */
export type StoryQuery = {
  status?: Story["status"]
  ticketId?: string
  sprintId?: string
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
  help: (scope: "mine" | "all" = "all", cursor?: string | null) =>
    api<PagedResponse<{ tickets: HelpTicket[]; mineTotal: number }>>(
      `/api/content/help?scope=${scope}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
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
  sprints: (accountId?: string) =>
    api<{ sprints: Sprint[]; total: number }>(
      `/api/content/sprints${accountId ? `?accountId=${enc(accountId)}` : ""}`
    ),
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
}

/** Data-ops worker — the agentic file import + the AI agent. */
