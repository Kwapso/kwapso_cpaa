// Everything the tenancy worker is given from outside.
export type Env = {
  /** The global core database (users, teams, team_members, invite_index). */
  DB: D1Database
  /** The auth worker — used to answer "who is making this request?". */
  AUTH: Fetcher
  /** The realtime worker — pinged after a write so open screens refresh live. */
  REALTIME: Fetcher
  /** Team logos (uploaded), served by the gateway at /media/teams/<id>. */
  MEDIA: R2Bucket

  /** Cloudflare account id (plain var) — for creating/querying team DBs. */
  CF_ACCOUNT_ID: string
  /** THE UUID OF THE DATABASE `DB` ABOVE IS BOUND TO, spelled out.
   *
   * A D1 binding does not expose its own id, and the nightly growth watch has to
   * recognise core in a listing of the whole Cloudflare ACCOUNT — core is the
   * one database that is ours but is in no team row, and the most important one
   * to watch (it is the only one strangers can grow, and its ceiling takes the
   * whole product down rather than one tenant).
   *
   * Set per env in wrangler vars, three lines from the binding it names, and
   * `workers/tenancy/test/db-ownership.test.ts` reads BOTH out of that file and
   * refuses to let them drift. Optional in the type only so a test env need not
   * set it; unset means core is simply not claimed, which loses a reading and
   * can never claim somebody else's database by mistake. */
  CORE_DATABASE_ID?: string
  /** The public WEB origin the SPA is served on (the gateway's public URL),
   *  used for links in outbound emails. Set per env in wrangler vars. */
  PUBLIC_APP_URL?: string
  /** The client portal's origin. Tenancy sends exactly one email to a
   * CLIENT — the portal welcome — and that link must never carry the
   * agency's hostname (R30 · shared/workers/record-link.ts). */
  PUBLIC_PORTAL_URL?: string
  /** Comma-separated addresses that receive the nightly growth alarm. Optional:
   *  unset means nobody is mailed, and the cron RECORDS that rather than going
   *  quiet (ARCHITECTURE §7 — an alarm nobody receives is just a table). */
  ALERT_TO?: string

  // Secrets (wrangler secret put):
  /** API token scoped to Account → D1 → Edit. Without it, team databases
   *  can't be created or queried — bootstrap fails with a clear message. */
  CF_D1_TOKEN?: string
  /** Protects the migrate-all-team-DBs maintenance endpoint. */
  ADMIN_KEY?: string
  /** Shared secret sent to auth's /internal/send-email (must match auth's
   * INTERNAL_KEY). Defense-in-depth alongside workers_dev:false. */
  INTERNAL_KEY?: string
  /** Per-user ceiling on CREATED teams (each provisions a database). The owner's
   * override: set it higher per environment; unset falls back to the code default. */
  MAX_TEAMS_PER_USER?: string
  /** Workers AI — reading a call into a proposed process map
   *  (lib/process-extract.ts). OPTIONAL: without it that ONE door refuses with a
   *  503 that says so, rather than throwing at the top of somebody's call notes. */
  AI?: Ai
  /** Swap the cheap model without a code change. Same var name as data-ops and
   *  content, so one setting moves the whole cheap path. */
  WORKERS_AI_MODEL?: string
  /** The free daily AI allowance — MUST match data-ops and content, or one
   *  allowance is enforced at two different heights. */
  AGENT_FREE_DAILY?: string
  /** WHICH ENGINE THE ASSISTANT RUNS ON — read here only to PRICE what it spent.
   * Tenancy makes no model call; the nightly ops digest reads the tokens
   * `agent_usage_log` recorded and turns them into money, and it cannot do that
   * without knowing which rate card applies. Unset means the digest reports
   * tokens and says "unpriced" rather than guessing a rate — and
   * `no-quiet-downgrade.test.ts` reads every wrangler config off disk and fails
   * the build if any of them names an engine the code does not, so this second
   * mention can never drift away from data-ops' pin. */
  AGENT_MODEL?: string
  AGENT_NO_DAILY_CAP?: string
}
