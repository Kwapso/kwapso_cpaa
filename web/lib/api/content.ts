// CONTENT — learning articles and the help desk.
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
  Learning,
  LearningProgressEntry,
} from "@shared/types"
import { api, enc, post } from "@shared/web/api"
import type { PagedResponse } from "@shared/web/api"

/** Content worker — Learning + Help (team-DB content modules). */
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
}

/** Data-ops worker — the agentic file import + the AI agent. */
