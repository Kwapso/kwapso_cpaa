import type { RateLimiter } from "@shared/workers/rate-limit"

export interface Env {
  /** the global core DB (native binding) — mcp_tokens live here */
  DB: D1Database
  /** account id (GatingEnv shape — whoAmI/team gating helpers expect it) */
  CF_ACCOUNT_ID: string
  AUTH: Fetcher
  TENANCY: Fetcher
  CONTENT: Fetcher
  DATAOPS: Fetcher
  /** the worker-to-worker shared secret (the auth session-mint bridge) */
  INTERNAL_KEY?: string
  /** Cloudflare's per-caller rate-limit binding. Optional — the seam fails open
   * without it (shared/workers/rate-limit.ts), which is what lets the code deploy
   * before the binding is configured. */
  CALLER_LIMIT?: RateLimiter
}
