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
  /** The SHARED media bucket, and the only one BOTH front doors serve (`/media/*`
   * on the agency gateway and on the portal gateway alike). A to-do's attachment
   * goes here rather than into HELP_MEDIA for exactly that reason: the client
   * uploads it from the portal and we read it in the agency app, so a bucket only
   * one door can serve would be a file one of the two sides cannot open. */
  MEDIA: R2Bucket
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
  /** THE KNOWLEDGE BASE'S VECTOR INDEX — one index for the whole account, with
   * every team in its own NAMESPACE (a hard partition applied before the search)
   * and every chunk carrying the labels the router narrows by. The whole
   * argument, and what would change our mind, is at the top of
   * lib/knowledge-vectors.ts.
   *
   * OPTIONAL ON PURPOSE. A binding that is not there is a deployment fact, and
   * the knowledge base answers from its word index alone rather than throwing on
   * every question — degraded, and visibly so, instead of down. BOOTSTRAP.md
   * creates the index and its nine metadata indexes BEFORE anything is ingested:
   * Vectorize does not index metadata retrospectively. */
  KNOWLEDGE_INDEX?: VectorizeIndex

  /** How close a passage must be to the question to count as evidence at all,
   * as a cosine in 0…1. Unset means the measured default in lib/knowledge.ts —
   * this exists because the number belongs to the MODEL, so changing the model
   * without being able to change the floor would mean shipping code to change a
   * threshold. Raise it and the base refuses more; lower it and it starts
   * answering questions it has nothing on. */
  KNOWLEDGE_MIN_SCORE?: string

  /** The embedding model id, so swapping it is config rather than a deploy of
   * new code. Whatever it is, it must be the SAME model that wrote the vectors
   * already stored — a change here makes every existing embedding incomparable,
   * and `similarity` reads that as "no evidence" (0) rather than as a wrong
   * answer, so the base degrades to its lexical half until the sweep re-indexes.
   * AND IT MUST MATCH THE INDEX'S DIMENSIONS, which are fixed when the index is
   * created — so this is now a deploy-time pair, not a lone switch.
   *
   * Defaults to @cf/baai/bge-m3 (1024 dimensions), which replaced
   * bge-small-en-v1.5 (384) for a reason that is specific to this app: half the
   * agency's tickets are in German and the rest are in English, often in the
   * same thread. bge-small is English-only, so every German ticket was being
   * embedded by a model that could not read it. bge-m3 is multilingual, and at
   * $0.012 per million tokens the whole difference is pennies a month. */
  KNOWLEDGE_EMBED_MODEL?: string

  // ── GOOGLE CONNECTIONS ──────────────────────────────────────────────────────
  // A DIFFERENT OAuth app from the one that signs people in (auth's
  // GOOGLE_CLIENT_ID). That app asks Google "who is this?" and needs no review;
  // this one asks for Drive, Gmail, Calendar and Chat, goes through Google's
  // verification, and shows a consent screen nobody should be walked past just
  // to log in. Unset = the Connect button is not offered and nothing else in the
  // product changes.
  /** The connect app's client id. */
  GOOGLE_CONNECT_CLIENT_ID?: string
  /** Its secret (wrangler secret put). */
  GOOGLE_CONNECT_CLIENT_SECRET?: string
  /** 32 random bytes, base64 — the key the stored Google tokens are encrypted
   * under (lib/google-crypto.ts). Held nowhere the database is: a dump of
   * `google_connections` without this is a list of email addresses. Unset = no
   * connection can be made, deliberately, rather than a token written in the
   * clear "for now". */
  GOOGLE_TOKEN_KEY?: string
  /** Local development only: drop `Secure` from the one-shot OAuth cookie so the
   * round-trip works over plain http on localhost. Never set in either deployed
   * environment — the same switch auth carries, for the same reason. */
  INSECURE_COOKIE?: string
}
