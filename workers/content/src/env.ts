// Everything the content worker is given from outside. This shape structurally
// satisfies the shared GatingEnv (AUTH + DB + the Cloudflare D1 credentials), so
// teamContext / requireRight work here exactly as they do in tenancy.
export type Env = {
  /** The global core database (users, teams, team_members) — read by gating. */
  DB: D1Database
  /** The auth worker — used to answer "who is making this request?". */
  AUTH: Fetcher
  /** The realtime worker — pinged after a write so open screens refresh live. */
  REALTIME: Fetcher
  /** Learning media (uploaded files), served by the gateway. */
  LEARNING_MEDIA: R2Bucket
  /** Ticket media (screen recordings, attachments), served by the gateway. */
  HELP_MEDIA: R2Bucket
  /** The agency's OWN files — brand assets, staff photos, certificate PDFs —
   * served by the gateway at /media/internal/. ONE bucket for the four internal
   * modules rather than four: they hold the same kind of object for the same
   * audience, and a bucket per module would be four more things to create on a
   * fresh account (BOOTSTRAP.md) for no isolation anybody can point at. The
   * per-team prefix inside it is what keeps teams apart, exactly as it does in
   * the learning and ticket buckets. */
  INTERNAL_MEDIA: R2Bucket

  /** Cloudflare account id (plain var) — for reaching per-team databases. */
  CF_ACCOUNT_ID: string
  /** The app's public origin — the only way an email's logo can be absolute. */
  PUBLIC_APP_URL?: string

  // Secrets (wrangler secret put):
  /** API token scoped to Account → D1 → Edit. Without it, team databases
   *  can't be reached — handlers fail with a clear cloud_key_missing message. */
  CF_D1_TOKEN?: string
  /** Shared secret for any internal worker-to-worker call (defense-in-depth
   * alongside workers_dev:false). */
  INTERNAL_KEY?: string

  /** Cloudflare Workers AI — the knowledge base's embedding model, and nothing
   * else on this worker. No external key, no external socket: it is a binding,
   * so R11's timeout law is satisfied the way a service binding satisfies it. */
  AI: Ai
  /** The embedding model id, so swapping it is config rather than a deploy of
   * new code. Whatever it is, it must be the SAME model that wrote the vectors
   * already stored — a change here makes every existing embedding incomparable,
   * and `similarity` reads that as "no evidence" (0) rather than as a wrong
   * answer, so the base degrades to its lexical half until the sweep re-indexes.
   * Defaults to @cf/baai/bge-small-en-v1.5 (384 dimensions). */
  KNOWLEDGE_EMBED_MODEL?: string
}
