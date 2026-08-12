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
  HelpMessage,
  HelpStakeholder,
  HelpTicket,
  KnowledgeAnswer,
  KnowledgeSource,
  Learning,
  LearningProgressEntry,
  MarketingPost,
  MeetingPurpose,
  Program,
  StaffCertificate,
  StaffProfile,
} from "@shared/types"
import { api, enc, post } from "@shared/web/api"
import type { PagedResponse } from "@shared/web/api"

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
}

/** Data-ops worker — the agentic file import + the AI agent. */
