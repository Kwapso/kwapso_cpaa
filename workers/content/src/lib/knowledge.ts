// THE KNOWLEDGE BASE — one knowledge base, many compartments, chosen for the
// reader rather than by them.
//
// ════════════════════════════════════════════════════════════════════════════
// THE ARCHITECTURAL DECISION (.plans/BUILD-2-knowledge-base.md §4), written down
// where the code it governs lives, because a decision recorded anywhere else is
// a decision the next person relitigates.
//
// 1. IT IS A MODULE ON `workers/content`, NOT A NINTH WORKER.
//
//    For: CLAUDE.md's first directive ("a route on an existing worker beats a
//    new worker"), and precedent — content already owns learning and tickets,
//    already reaches the team's own database over the one REST door, already
//    binds R2. A source row is shaped exactly like a learning row.
//
//    Against, and it is a real argument: ingestion is a different shape from
//    everything else here — scheduled, resumable, fanned out over thousands of
//    documents — and `workers/content` is on the CLIENT PORTAL's critical path
//    (portal-gateway forwards the ticket doors to it). Google's org-wide
//    credentials would eventually sit beside the doors a client's browser talks
//    to.
//
//    Decided for the module, on three grounds:
//      • Ingestion never touches the request path. The sweep is a cron handler
//        doing a BOUNDED slice per tick (INGEST_SOURCES_PER_TICK) with its
//        position in `knowledge_ingest`. A separate worker would isolate a
//        workload that is, by construction, a series of small bounded jobs.
//      • The isolation a worker boundary buys is bought more provably by the
//        fence the base already has: every door here refuses a portal caller AT
//        THE DOOR (R21), which is machine-checked, where "it is on another
//        worker" is a deployment fact no law reads.
//      • A ninth worker is not one wrangler file. It is two gateway bindings, a
//        step in the ordered deploy chain, its own seam suites — and four law
//        SCANS whose worker lists would each have to learn about it (R19/R22's
//        door census, R21's reachable-door walk, R1's publisher roster, R10's
//        gating seam). Every one of those is a place a new worker is silently
//        un-measured on the day it ships. On content, these doors are inside
//        every existing scan the moment they exist.
//
//    WHAT WOULD FLIP IT: ingestion needing to hold a connection open, a single
//    sweep tick no longer fitting a cron invocation's CPU budget, or Google
//    credentials that must not sit on the worker the portal talks to. The module
//    boundary is drawn so that move is a file move: everything is in
//    lib/knowledge*.ts + routes/knowledge.ts, and nothing else imports them.
//
// 2. THE VECTORS LIVE IN THE TEAM'S OWN DATABASE, NOT IN VECTORIZE.
//
//    §4's own words: "do not put every team's vectors in one undifferentiated
//    index and rely on a filter you wrote correctly today." Vectorize bindings
//    are STATIC — an index is declared in wrangler and bound at deploy — so
//    "one index per team" would mean creating an index per team over its REST
//    API and reconciling a second per-team resource lifecycle beside the D1
//    database (with its own half-created failure state). The per-team database
//    already exists, is already created and migrated by the team factory, and
//    already makes tenancy structural: a caller's guard resolves ONE database id
//    and the SQL cannot name another. That is the property §4 asks for, and it
//    is the property we already have.
//
//    So retrieval is two-stage, both stages inside the team's database:
//      • stage one, LEXICAL — the inverted index (`knowledge_terms`), an
//        ordinary keyed table, narrowed by compartment, capped at
//        CANDIDATE_CAP rows;
//      • stage two, VECTOR — exact cosine over just those candidates' stored
//        embeddings, which is a few hundred short byte arrays, not a scan.
//    A compartment with nothing lexical to match still reaches stage two,
//    because the candidate set is TOPPED UP with the compartment's newest chunks
//    (`topUpCandidates`) — otherwise a question whose words appear nowhere would
//    never be answered semantically, which is the whole point of vectors.
//
//    WHEN A COMPARTMENT OUTGROWS IT: stage one is a keyed read whose cost is the
//    number of POSTINGS for the question's terms inside the compartment. That
//    stays flat into the low millions of chunks and then stops being flat. The
//    escape hatch is deliberate and narrow — `retrieve()` is the only function
//    that searches, and `searchCandidates` is the only thing inside it that
//    touches storage. A per-team Vectorize index over its REST door (the same
//    shape as the D1 REST door we already own) replaces that ONE function.
//
// ════════════════════════════════════════════════════════════════════════════
//
// THREE FENCES, and they are not the same fence — the comment is here because
// conflating any two of them is how this kind of module leaks:
//   • TENANCY   — the team's own database. Structural; no clause expresses it.
//   • THE CLIENT — `refusePortalCaller`, at every door (R21). The knowledge base
//     holds the agency's internal material; a client login never reaches it.
//   • THE PERSON — `owner_user_id`. Material that arrived through one member's
//     own sight of it is readable only in THEIR answers.
// A COMPARTMENT IS NOT A FENCE. It is relevance: which slice of the team's own
// material answers this question. Every compartment belongs to the same team and
// the same staff readers; narrowing to one is about a better answer, never about
// permission.

import { describeChanges, logActivity, type Actor } from "@shared/workers/activity"
import { d1ExecScript, d1Query, likeLiteral, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { GuardError, type MemberGuard } from "@shared/workers/gating"
import { ulid } from "@shared/workers/id"
import { decodeCursor, keysetAfter, PAGE_SIZE, toPage, type Page } from "@shared/workers/paging"
import { optionalText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import type {
  KnowledgeAnswer,
  KnowledgeCitation,
  KnowledgePassage,
  KnowledgeSource,
} from "@shared/types"
import type { Env } from "../env"
import {
  chunkText,
  contentHash,
  decodeEmbedding,
  encodeEmbedding,
  plainText,
  questionTerms,
  similarity,
  tokenise,
} from "./knowledge-text"

/** The kinds of material a source can be. `note` is typed by a person; the rest
 * MIRROR a row the app already owns and are kept in step by the sweep. Data, not
 * a code path — a new kind is a line here plus a reader in knowledge-ingest.ts. */
export const KNOWLEDGE_KINDS = ["note", "ticket", "article", "account"] as const
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number]

/** The agency's own compartment — everything not owned by one client. */
export const AGENCY_COMPARTMENT = "agency"

/** One client's compartment. The ONE place the string is built, so a reader and
 * a writer can never spell it differently. */
export const accountCompartment = (accountId: string): string => `account:${accountId}`

/** Rows stage one may hand to stage two. The bound on the WHOLE search: stage two
 * decodes this many embeddings and nothing more, whatever the compartment holds. */
const CANDIDATE_CAP = 200

/** Passages one answer carries. Enough for a real answer with more than one
 * source behind it; small enough that the assistant's context stays cheap. */
const DEFAULT_PASSAGES = 6

/** How much of the score is the vector's and how much the lexical index's. The
 * vector leads because it is the thing that understands a question asked in
 * different words; the lexical half keeps a literal match (a reference code, an
 * error string) from being out-voted by something merely on-topic. */
const VECTOR_WEIGHT = 0.7

/** Terms one question contributes to stage one. A question is short; this is a
 * ceiling on a pathological one (a pasted log file in the question box), and it
 * bounds the `IN (…)` list the statement carries. */
const MAX_QUESTION_TERMS = 24

/** Chunk rows written per statement. A source's chunks go in as a few scripts
 * rather than one, so a 200-chunk transcript can't build a megabyte of SQL. */
const CHUNK_WRITE_BATCH = 20

/** Texts handed to the embedding model in one call. */
const EMBED_BATCH = 25

/* --------------------------------- reading -------------------------------- */

type SourceRow = {
  id: string
  kind: string
  origin_table: string | null
  origin_row_id: string | null
  compartment: string
  account_id: string | null
  title: string
  body: string | null
  source_url: string | null
  owner_user_id: string | null
  indexed_at: string | null
  chunk_count: number
  created_at: string
  creator_name: string | null
  editor_name: string | null
  updated_at: string | null
  deactivated_at: string | null
}

const SOURCE_COLS = `id, kind, origin_table, origin_row_id, compartment, account_id, title, body,
  source_url, owner_user_id, indexed_at, chunk_count,
  created_at, creator_name, editor_name, updated_at, deactivated_at`

function toSource(r: SourceRow): KnowledgeSource {
  return {
    id: r.id,
    kind: (KNOWLEDGE_KINDS as readonly string[]).includes(r.kind) ? (r.kind as KnowledgeKind) : "note",
    originTable: r.origin_table,
    originRowId: r.origin_row_id,
    compartment: r.compartment,
    accountId: r.account_id,
    title: r.title,
    body: r.body,
    sourceUrl: r.source_url,
    // The FIELD a person edits is "who may this be read by", so the wire says
    // that rather than making every reader remember what a null id means.
    visibility: r.owner_user_id ? "private" : "team",
    ownerUserId: r.owner_user_id,
    indexedAt: r.indexed_at,
    chunkCount: r.chunk_count,
    active: r.deactivated_at === null,
    createdAt: r.created_at,
    creatorName: r.creator_name,
    editorName: r.editor_name,
    updatedAt: r.updated_at,
  }
}

/** THE PERSONAL FENCE, as SQL. A source with an owner is readable only by that
 * owner: it arrived through what THEY can see (their own connection, or a note
 * they marked private), so it is theirs to be answered from. Everything else is
 * the team's. Applied to every read on this module, including the search — a
 * fence with an exception is not a fence. */
function ownerClause(guard: MemberGuard, column = "owner_user_id"): { sql: string; params: string[] } {
  return { sql: `(${column} IS NULL OR ${column} = ?)`, params: [guard.userId] }
}

/** The sort a source list is keyed by: newest first, id breaking ties. */
const SOURCE_ORDER = "COALESCE(updated_at, created_at)"

/** The team's sources, newest first. R14 GROWING collection: keyset-PAGED, not
 * capped — the agency's own history alone is thousands of sources, so the door
 * answers "here is a page and where the next one starts" rather than refusing
 * past a ceiling. `cursor` is the opaque one from the previous page. */
export async function listSources(
  cfg: D1Rest,
  guard: MemberGuard,
  filter: { kind?: string; compartment?: string; q?: string },
  cursor: string | null
): Promise<Page<KnowledgeSource>> {
  const owner = ownerClause(guard)
  const where: string[] = [owner.sql]
  const params: (string | number)[] = [...owner.params]
  if (filter.kind) {
    where.push("kind = ?")
    params.push(filter.kind)
  }
  if (filter.compartment) {
    where.push("compartment = ?")
    params.push(filter.compartment)
  }
  if (filter.q) {
    // The needle is a LIKE PATTERN, not just a bound value — likeLiteral is what
    // stops `%` meaning "everything" and an alternating pattern costing the
    // worker exponential time (see shared/workers/d1-rest.ts).
    where.push(`(LOWER(title) LIKE ? ESCAPE '\\' OR LOWER(body) LIKE ? ESCAPE '\\')`)
    const needle = `%${likeLiteral(filter.q.toLowerCase())}%`
    params.push(needle, needle)
  }
  const after = keysetAfter(decodeCursor(cursor), SOURCE_ORDER)
  if (after.sql) {
    where.push(after.sql)
    params.push(...after.params)
  }
  const rows = await d1Query<SourceRow>(
    cfg,
    guard.databaseId,
    `SELECT ${SOURCE_COLS} FROM knowledge_sources
      WHERE ${where.join(" AND ")}
      ORDER BY ${SOURCE_ORDER} DESC, id DESC LIMIT ${PAGE_SIZE + 1}`,
    params
  )
  return toPage(rows.map(toSource), PAGE_SIZE, (s) => [s.updatedAt ?? s.createdAt, s.id])
}

/** R16: the exact server COUNT(*) for the badge — never rows.length. Carries the
 * same personal fence as the list, or the badge would count sources the reader
 * cannot see. */
export async function countSources(cfg: D1Rest, guard: MemberGuard): Promise<number> {
  const owner = ownerClause(guard)
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM knowledge_sources WHERE ${owner.sql}`,
    owner.params
  )
  return rows[0]?.n ?? 0
}

/** One source by id, or null. */
export async function getSource(
  cfg: D1Rest,
  guard: MemberGuard,
  id: string
): Promise<KnowledgeSource | null> {
  const owner = ownerClause(guard)
  const rows = await d1Query<SourceRow>(
    cfg,
    guard.databaseId,
    `SELECT ${SOURCE_COLS} FROM knowledge_sources WHERE id = ? AND ${owner.sql}`,
    [id, ...owner.params]
  )
  return rows[0] ? toSource(rows[0]) : null
}

/** The same read, throwing the clean 404 every write opens with. Outside the
 * caller's fence a real row and a made-up id answer identically. */
async function sourceOrThrow(cfg: D1Rest, guard: MemberGuard, id: string): Promise<KnowledgeSource> {
  const found = await getSource(cfg, guard, id)
  if (!found) throw new GuardError(404, "knowledge_not_found", "That source doesn't exist.")
  return found
}

/* --------------------------------- writing -------------------------------- */

/** What a create / edit accepts. `compartment` is not here on purpose: it is
 * DERIVED from `accountId`, so the two can never disagree. */
export type SourceInput = {
  title?: unknown
  body?: unknown
  sourceUrl?: unknown
  accountId?: unknown
  visibility?: unknown
}

/** The fields a create and an edit share, validated identically so the two can't
 * drift into different shapes. */
function readInput(input: SourceInput): {
  title: string
  body: string | null
  sourceUrl: string | null
  accountId: string | null
  privateToMe: boolean
} {
  return {
    title: requireText(input.title, "Title", TEXT_LIMITS.short),
    body: optionalText(input.body, "Body", TEXT_LIMITS.long) ?? null,
    sourceUrl: optionalText(input.sourceUrl, "Link", TEXT_LIMITS.link) ?? null,
    accountId: optionalText(input.accountId, "Account", TEXT_LIMITS.short) ?? null,
    privateToMe: input.visibility === "private",
  }
}

/** The account a source is filed under must be one this team really has — a
 * compartment built from an id nobody owns would be a slice of the knowledge
 * base nothing can ever reach again. */
async function requireAccount(cfg: D1Rest, guard: MemberGuard, accountId: string): Promise<void> {
  const rows = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    "SELECT id FROM accounts WHERE id = ? LIMIT 1",
    [accountId]
  )
  if (!rows[0]) throw new GuardError(404, "not_found", "That account doesn't exist.")
}

/** Write a source a PERSON typed, and index it in the same call so the assistant
 * knows about it before they have finished reading the toast. Returns its id. */
export async function createSource(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  input: SourceInput
): Promise<string> {
  const v = readInput(input)
  if (v.accountId) await requireAccount(cfg, guard, v.accountId)
  const id = ulid()
  const now = new Date().toISOString()
  const compartment = v.accountId ? accountCompartment(v.accountId) : AGENCY_COMPARTMENT
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO knowledge_sources (id, kind, compartment, account_id, title, body, source_url, owner_user_id, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, 'note', ${sqlString(compartment)}, ${sqlString(v.accountId)}, ${sqlString(v.title)}, ${sqlString(v.body)}, ${sqlString(v.sourceUrl)}, ${sqlString(v.privateToMe ? guard.userId : null)}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
  await indexSource(env, cfg, guard, id)
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Knowledge source added",
    description: `${actor.name} added "${v.title}" to the knowledge base`,
    relatedTable: "knowledge_sources",
    relatedRowId: id,
  })
  return id
}

/** Correct a source. A MIRRORED source's body belongs to the row it mirrors, so
 * only its filing (which client, who may read it) is editable here — the sweep
 * would overwrite anything else on its next tick, which would be a worse lie
 * than refusing. A typed note is editable in full. */
export async function updateSource(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  input: SourceInput
): Promise<void> {
  const before = await sourceOrThrow(cfg, guard, id)
  const v = readInput(input)
  if (v.accountId) await requireAccount(cfg, guard, v.accountId)
  const mirrored = before.originRowId !== null
  const title = mirrored ? before.title : v.title
  const body = mirrored ? before.body : v.body
  const sourceUrl = mirrored ? before.sourceUrl : v.sourceUrl
  const compartment = v.accountId ? accountCompartment(v.accountId) : AGENCY_COMPARTMENT
  const owner = v.privateToMe ? guard.userId : null
  const now = new Date().toISOString()
  await d1Query(
    cfg,
    guard.databaseId,
    `UPDATE knowledge_sources SET title = ?, body = ?, source_url = ?, account_id = ?, compartment = ?,
       owner_user_id = ?, updated_at = ?, editor_id = ?, editor_email = ?, editor_name = ?
     WHERE id = ?`,
    [title, body, sourceUrl, v.accountId, compartment, owner, now, actor.id, actor.email, actor.name, id]
  )
  // The chunks carry the compartment and the owner too (stage one reads them
  // without a join), so a re-filing has to travel down or the index would answer
  // for a client whose material this no longer is.
  await indexSource(env, cfg, guard, id)
  const changes = describeChanges([
    { label: "Title", from: before.title, to: title },
    { label: "Filed under", from: before.compartment, to: compartment },
    { label: "Visible to", from: before.visibility, to: owner ? "private" : "team" },
    { label: "Body", from: before.body, to: body, hideValues: true },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Knowledge source edited",
    description: `${actor.name} corrected "${title}" in the knowledge base${changes ? ` — ${changes}` : ""}`,
    relatedTable: "knowledge_sources",
    relatedRowId: id,
  })
}

/** Take a source away from the assistant, or give it back. Deactivate-never-
 * delete: the ROW survives (so the decision, and who made it, survive with it)
 * and its CHUNKS do not — an excluded source has to stop being retrievable in
 * the same instant, or "remove something wrong" is a promise the search breaks.
 * The sweep skips an excluded source rather than re-adding it.
 *
 * R17: the current-status predicate rides the UPDATE, so a double click moves
 * zero rows and writes no second line of history. */
export async function setSourceActive(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  active: boolean
): Promise<boolean> {
  const source = await sourceOrThrow(cfg, guard, id)
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    active
      ? `UPDATE knowledge_sources SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL, deactivator_name = NULL, updated_at = ? WHERE id = ? AND deactivated_at IS NOT NULL RETURNING id`
      : `UPDATE knowledge_sources SET deactivated_at = ?, deactivator_id = ${sqlString(actor.id)}, deactivator_email = ${sqlString(actor.email)}, deactivator_name = ${sqlString(actor.name)}, updated_at = ? WHERE id = ? AND deactivated_at IS NULL RETURNING id`,
    active ? [now, id] : [now, now, id]
  )
  if (!changed[0]) return false
  if (active) await indexSource(env, cfg, guard, id)
  else await clearChunks(cfg, guard, id)
  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "Knowledge source restored" : "Knowledge source removed",
    description: `${actor.name} ${active ? "gave the assistant back" : "took away the assistant's sight of"} "${source.title}"`,
    relatedTable: "knowledge_sources",
    relatedRowId: id,
  })
  return true
}

/* -------------------------------- indexing -------------------------------- */

/** Everything derived FROM a source: its chunks and their postings. One keyed
 * delete each, which is why the inverted index is an ordinary table. */
async function clearChunks(cfg: D1Rest, guard: MemberGuard, sourceId: string): Promise<void> {
  await d1Query(
    cfg,
    guard.databaseId,
    "DELETE FROM knowledge_terms WHERE chunk_id IN (SELECT id FROM knowledge_chunks WHERE source_id = ?)",
    [sourceId]
  )
  await d1Query(cfg, guard.databaseId, "DELETE FROM knowledge_chunks WHERE source_id = ?", [sourceId])
  await d1Query(
    cfg,
    guard.databaseId,
    "UPDATE knowledge_sources SET chunk_count = 0, indexed_at = NULL, content_hash = NULL WHERE id = ?",
    [sourceId]
  )
}

/** The text a source is indexed FROM: its title and its body, together. The
 * title is indexed with the body deliberately — a note called "Bergman dispatch
 * rollout" whose body never repeats the name would otherwise be unfindable by
 * the words a person would actually use. */
export function indexableText(source: { title: string; body: string | null }): string {
  return [source.title, source.body ?? ""].join("\n\n").trim()
}

/** Ask the model for one embedding per text. Best-effort BY DESIGN: an embedding
 * failure must not fail an ingest, because the alternative is a knowledge base
 * that refuses to accept a note when Workers AI has a bad minute. A null
 * embedding stores as NULL and that chunk is ranked by its lexical score alone
 * until the next re-index picks it up. */
async function embed(env: Env, texts: string[]): Promise<(string | null)[]> {
  const out: (string | null)[] = []
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH)
    try {
      const model = env.KNOWLEDGE_EMBED_MODEL || "@cf/baai/bge-small-en-v1.5"
      const res = (await env.AI.run(model as never, { text: batch } as never)) as {
        data?: number[][]
      }
      const vectors = Array.isArray(res?.data) ? res.data : []
      for (let j = 0; j < batch.length; j++) out.push(encodeEmbedding(vectors[j] ?? []))
    } catch (e) {
      // Loud in the log, silent to the caller: the ingest continues without
      // vectors rather than losing the material. ERROR-HANDLING.md's rule is
      // never to swallow — the cron's own failure recording (R12) is what makes
      // this visible to somebody, and it records the run, not each chunk.
      console.error("knowledge embed failed:", e)
      for (let j = 0; j < batch.length; j++) out.push(null)
    }
  }
  return out
}

/** (Re)build one source's chunks, postings and vectors from its own text. The
 * whole pipeline, in one place, so ingesting a ticket and typing a note produce
 * exactly the same index.
 *
 * Idempotent: it deletes what the source had before writing what it has now, and
 * stamps the content hash LAST, so a tick that dies halfway leaves a source that
 * the next tick re-indexes rather than one that claims to be current. */
export async function indexSource(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  sourceId: string
): Promise<number> {
  const rows = await d1Query<{
    id: string
    title: string
    body: string | null
    compartment: string
    owner_user_id: string | null
    deactivated_at: string | null
  }>(
    cfg,
    guard.databaseId,
    "SELECT id, title, body, compartment, owner_user_id, deactivated_at FROM knowledge_sources WHERE id = ? LIMIT 1",
    [sourceId]
  )
  const source = rows[0]
  if (!source) return 0
  // An excluded source is not indexed, ever — that is what excluding it means.
  if (source.deactivated_at !== null) {
    await clearChunks(cfg, guard, sourceId)
    return 0
  }

  const chunks = chunkText(indexableText(source))
  await clearChunks(cfg, guard, sourceId)
  if (!chunks.length) return 0

  const vectors = await embed(env, chunks)
  const now = new Date().toISOString()
  const compartment = sqlString(source.compartment)
  const owner = sqlString(source.owner_user_id)

  for (let start = 0; start < chunks.length; start += CHUNK_WRITE_BATCH) {
    const statements: string[] = []
    chunks.slice(start, start + CHUNK_WRITE_BATCH).forEach((text, offset) => {
      const seq = start + offset
      const chunkId = ulid()
      statements.push(
        `INSERT INTO knowledge_chunks (id, source_id, compartment, owner_user_id, seq, text, embedding, created_at) VALUES (${sqlString(chunkId)}, ${sqlString(sourceId)}, ${compartment}, ${owner}, ${seq}, ${sqlString(text)}, ${sqlString(vectors[seq])}, ${sqlString(now)});`
      )
      for (const [term, weight] of tokenise(text))
        statements.push(
          `INSERT INTO knowledge_terms (term, chunk_id, compartment, owner_user_id, weight) VALUES (${sqlString(term)}, ${sqlString(chunkId)}, ${compartment}, ${owner}, ${weight});`
        )
    })
    await d1ExecScript(cfg, guard.databaseId, statements.join("\n"))
  }

  // THE HASH IS THE "DON'T DO THIS AGAIN" FLAG, so it is only stamped when the
  // work really finished. If the model was down, every vector came back null and
  // this source is chunked but not searchable by meaning — leaving the hash NULL
  // is what makes the next sweep tick pick it up again instead of skipping it
  // forever as "unchanged". Self-healing without a repair door to remember.
  const embedded = vectors.some((v) => v !== null)
  await d1Query(
    cfg,
    guard.databaseId,
    "UPDATE knowledge_sources SET chunk_count = ?, indexed_at = ?, content_hash = ? WHERE id = ?",
    [chunks.length, now, embedded ? contentHash(indexableText(source)) : null, sourceId]
  )
  return chunks.length
}

/* ------------------------------- compartment ------------------------------ */

/** Which slice of the knowledge base a question is answered from, and WHY.
 *
 * The reasoning is the product (§1): the owner's complaint about the tools he
 * uses today is that he has to KEEP a notebook per project by hand. So nobody
 * picks a compartment here — it is derived from where the asker is standing and
 * what they said, and the answer carries the sentence explaining the choice so a
 * wrong one is visible instead of mysterious.
 *
 * An empty `compartments` means "no narrowing" — the whole knowledge base the
 * caller may read. That is the honest answer to a question that names no client. */
export type CompartmentChoice = { compartments: string[]; reason: string }

export async function deriveCompartment(
  cfg: D1Rest,
  guard: MemberGuard,
  input: { question: string; accountId?: string | null }
): Promise<CompartmentChoice> {
  // 1. THE RECORD THEY ARE STANDING ON wins. If the caller asked from a client's
  //    screen (or a tool passed that client's id), that is not a guess.
  if (input.accountId) {
    const named = await accountById(cfg, guard, input.accountId)
    if (named)
      return {
        compartments: [accountCompartment(named.id), AGENCY_COMPARTMENT],
        reason: `You asked from ${named.name}'s record, so I searched ${named.name}'s material and the agency's own.`,
      }
  }
  // 2. THE QUESTION NAMES A CLIENT. Matched on the account's own name and
  //    reference, and confirmed word by word (below) so "new" cannot match
  //    "Newton Ltd".
  const named = await accountNamedIn(cfg, guard, input.question)
  if (named)
    return {
      compartments: [accountCompartment(named.id), AGENCY_COMPARTMENT],
      reason: `The question names ${named.name}, so I searched ${named.name}'s material and the agency's own.`,
    }
  // 3. NOTHING NAMED. Search everything — a question about our own process has
  //    no client in it, and neither does a vague one.
  return {
    compartments: [],
    reason: "The question named no client, so I searched the whole knowledge base.",
  }
}

async function accountById(
  cfg: D1Rest,
  guard: MemberGuard,
  id: string
): Promise<{ id: string; name: string } | null> {
  const rows = await d1Query<{ id: string; name: string }>(
    cfg,
    guard.databaseId,
    "SELECT id, name FROM accounts WHERE id = ? LIMIT 1",
    [id]
  )
  return rows[0] ?? null
}

/** The account a question names, or null. Two passes on purpose: SQL NARROWS
 * (one LIKE per question word, so the read is bounded by the team's own account
 * list), then code CONFIRMS — every word of the account's own name has to appear
 * in the question. Without the second pass a three-letter word inside a longer
 * name would file a question under a client it never mentioned. */
async function accountNamedIn(
  cfg: D1Rest,
  guard: MemberGuard,
  question: string
): Promise<{ id: string; name: string } | null> {
  const terms = questionTerms(question, 8)
  if (!terms.length) return null
  const clauses = terms.map(() => `LOWER(name) LIKE ? ESCAPE '\\'`).concat(terms.map(() => "LOWER(code) = ?"))
  const params = [...terms.map((t) => `%${likeLiteral(t)}%`), ...terms]
  const candidates = await d1Query<{ id: string; name: string; code: string | null }>(
    cfg,
    guard.databaseId,
    // R14 hard cap: a question can only ever pull back a handful of candidates,
    // however many accounts happen to contain one of its words.
    `SELECT id, name, code FROM accounts
      WHERE deactivated_at IS NULL AND (${clauses.join(" OR ")})
      ORDER BY LENGTH(name) DESC LIMIT 10`,
    params
  )
  const asked = new Set(terms)
  for (const c of candidates) {
    if (c.code && asked.has(c.code.toLowerCase())) return { id: c.id, name: c.name }
    const nameTerms = [...tokenise(c.name).keys()]
    if (nameTerms.length && nameTerms.every((t) => asked.has(t))) return { id: c.id, name: c.name }
  }
  return null
}

/* -------------------------------- retrieval ------------------------------- */

/** THE ONE ANSWER BUILDER (Law R23). An answer with no source is not a
 * shorter answer, it is a different kind of thing — so it is built here, once,
 * and the shape makes the two cases impossible to confuse: no citations means
 * `found: false`, no passages at all, and a sentence that says so in words a
 * person can read. A door that assembled this by hand could ship half of it,
 * which is exactly how a confident, sourceless answer gets in front of a client. */
export function knowledgeAnswer(input: {
  question: string
  compartments: string[]
  reason: string
  passages: KnowledgePassage[]
  candidates: number
}): KnowledgeAnswer {
  const citations: KnowledgeCitation[] = []
  for (const p of input.passages)
    if (!citations.some((c) => c.sourceId === p.sourceId))
      citations.push({ sourceId: p.sourceId, title: p.title, kind: p.kind, url: p.url })
  const found = citations.length > 0
  return {
    question: input.question,
    found,
    // Said in the assistant's own voice, because this sentence is what it must
    // repeat rather than inventing an answer around an empty result.
    message: found
      ? `${citations.length} source${citations.length === 1 ? "" : "s"} in the knowledge base answer this.`
      : "The knowledge base has nothing on this. Say so plainly — do not answer from memory.",
    compartments: input.compartments,
    reason: input.reason,
    passages: found ? input.passages : [],
    citations,
    candidates: input.candidates,
  }
}

type CandidateRow = { chunk_id: string; lex: number }

/** STAGE ONE — the lexical narrowing. One keyed read over the inverted index,
 * fenced by the reader and narrowed by the compartment, capped at CANDIDATE_CAP.
 *
 * This is the ONLY function in the module that decides which stored rows a
 * search may look at; the Vectorize escape hatch at the top of this file
 * replaces this function and nothing else. */
async function searchCandidates(
  cfg: D1Rest,
  guard: MemberGuard,
  terms: string[],
  compartments: string[]
): Promise<CandidateRow[]> {
  if (!terms.length) return []
  const owner = ownerClause(guard)
  const where = [`term IN (${terms.map(() => "?").join(", ")})`, owner.sql]
  const params: (string | number)[] = [...terms, ...owner.params]
  if (compartments.length) {
    where.push(`compartment IN (${compartments.map(() => "?").join(", ")})`)
    params.push(...compartments)
  }
  return d1Query<CandidateRow>(
    cfg,
    guard.databaseId,
    // R14 hard cap: the whole search is bounded here — stage two never sees more
    // rows than this, whatever the compartment holds.
    `SELECT chunk_id, SUM(weight) AS lex FROM knowledge_terms
      WHERE ${where.join(" AND ")}
      GROUP BY chunk_id ORDER BY lex DESC LIMIT ${CANDIDATE_CAP}`,
    params
  )
}

/** The newest chunks in the compartment, to top the candidate set up when the
 * lexical stage found little.
 *
 * This is what stops a lexical prefilter from quietly capping what the VECTORS
 * can reach: a question asked in words that appear nowhere in the material
 * ("what did they complain about?" against "the dispatch screen keeps logging
 * people out") returns nothing from stage one, and without this it would return
 * nothing at all. Bounded by the same cap, so the cost of the search does not
 * change. */
async function topUpCandidates(
  cfg: D1Rest,
  guard: MemberGuard,
  compartments: string[],
  want: number
): Promise<CandidateRow[]> {
  if (want <= 0) return []
  const owner = ownerClause(guard)
  const where = [owner.sql]
  const params: (string | number)[] = [...owner.params]
  if (compartments.length) {
    where.push(`compartment IN (${compartments.map(() => "?").join(", ")})`)
    params.push(...compartments)
  }
  const rows = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    // R14 hard cap: `want` is CANDIDATE_CAP minus what stage one already found.
    `SELECT id FROM knowledge_chunks WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ${Math.min(want, CANDIDATE_CAP)}`,
    params
  )
  return rows.map((r) => ({ chunk_id: r.id, lex: 0 }))
}

type ScoredRow = {
  id: string
  source_id: string
  seq: number
  text: string
  embedding: string | null
  title: string
  kind: string
  source_url: string | null
  compartment: string
}

/** Answer a question from the team's own material.
 *
 * Never generates prose. It returns the passages and their citations, and the
 * assistant writes the answer with them in front of it — which is what makes
 * "every answer cites its sources" a property of the DATA rather than a habit we
 * hope a model keeps. */
export async function retrieve(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  input: { question: string; accountId?: string | null; limit?: number }
): Promise<KnowledgeAnswer> {
  const question = requireText(input.question, "Question", TEXT_LIMITS.message)
  const want = Math.max(1, Math.min(input.limit ?? DEFAULT_PASSAGES, 20))
  const choice = await deriveCompartment(cfg, guard, { question, accountId: input.accountId ?? null })

  const terms = questionTerms(question, MAX_QUESTION_TERMS)
  const lexical = await searchCandidates(cfg, guard, terms, choice.compartments)
  const seen = new Set(lexical.map((c) => c.chunk_id))
  const topUp = (await topUpCandidates(cfg, guard, choice.compartments, CANDIDATE_CAP - lexical.length)).filter(
    (c) => !seen.has(c.chunk_id)
  )
  const candidates = [...lexical, ...topUp].slice(0, CANDIDATE_CAP)
  if (!candidates.length)
    return knowledgeAnswer({ question, ...choice, passages: [], candidates: 0 })

  const ids = candidates.map((c) => c.chunk_id)
  // ONE BOUND PARAMETER PER CANDIDATE IS ONE TOO MANY.
  //
  // This asked for the candidate rows as `IN (?, ?, … )` with an id bound to each
  // placeholder — up to CANDIDATE_CAP of them. D1 refuses a statement carrying
  // more than 100 bound parameters ("too many SQL variables"), and the top-up
  // fills the candidate set to the cap on any question the lexical stage does not
  // already answer. So EVERY question against a base holding more than a hundred
  // chunks came back a 500, and the door had never once answered on real
  // infrastructure. It went unseen because the suites run against local SQLite,
  // whose limit is 999 — the harness was more permissive than the thing it stood
  // in for, which is the only kind of harness gap that matters.
  //
  // These ids are ULIDs this worker generated and just read back out of its own
  // table, never anything off a request, so they are interpolated through
  // sqlString like every other server-owned value in this codebase (CONVENTIONS)
  // and the statement carries no bound parameters at all.
  const rows = await d1Query<ScoredRow>(
    cfg,
    guard.databaseId,
    // R14 hard cap: the candidate list is already bounded by CANDIDATE_CAP; the
    // LIMIT says so at the statement, where the next reader is looking.
    `SELECT c.id, c.source_id, c.seq, c.text, c.embedding, s.title, s.kind, s.source_url, s.compartment
       FROM knowledge_chunks c JOIN knowledge_sources s ON s.id = c.source_id
      WHERE c.id IN (${ids.map((id) => sqlString(id)).join(", ")}) AND s.deactivated_at IS NULL
      LIMIT ${CANDIDATE_CAP}`
  )

  // STAGE TWO — the vector, over exactly those rows. One embedding call for the
  // question; if it fails, every similarity is 0 and the lexical half decides,
  // which is a worse answer and not a broken one.
  const [asked] = await embed(env, [question])
  const askedVector = decodeEmbedding(asked)
  const lexBy = new Map(candidates.map((c) => [c.chunk_id, c.lex]))
  const topLex = Math.max(1, ...candidates.map((c) => c.lex))
  const scored = rows
    .map((r) => {
      const vector = similarity(askedVector, decodeEmbedding(r.embedding))
      const lex = (lexBy.get(r.id) ?? 0) / topLex
      return {
        row: r,
        // Both halves are 0…1 here: the vector's is a cosine clamped at zero
        // (a NEGATIVE cosine means "about something else", which is not evidence
        // against the lexical match, it is no evidence), the lexical half is
        // relative to the best match this question found.
        score: VECTOR_WEIGHT * Math.max(0, vector) + (1 - VECTOR_WEIGHT) * lex,
      }
    })
    // A candidate that matched nothing lexically AND has no vector is a row the
    // top-up dragged in; it is not evidence and must not become a citation.
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, want)

  const passages: KnowledgePassage[] = scored.map(({ row, score }) => ({
    sourceId: row.source_id,
    title: row.title,
    kind: row.kind,
    url: row.source_url,
    compartment: row.compartment,
    seq: row.seq,
    text: plainText(row.text),
    score: Math.round(score * 1000) / 1000,
  }))
  return knowledgeAnswer({ question, ...choice, passages, candidates: candidates.length })
}
