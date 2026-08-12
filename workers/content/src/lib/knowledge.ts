// THE KNOWLEDGE BASE — one knowledge base, many compartments, chosen for the
// reader rather than by them.
//
// ════════════════════════════════════════════════════════════════════════════
// THE ARCHITECTURAL DECISION, written down where the code it governs lives,
// because a decision recorded anywhere else is a decision the next person
// relitigates.
//
// 1. IT IS A MODULE ON `workers/content`, NOT A NINTH WORKER. (Unchanged, and
//    the argument still holds.)
//
//    For: CLAUDE.md's first directive ("a route on an existing worker beats a
//    new worker"), and precedent — content already owns learning and tickets,
//    already reaches the team's own database over the one REST door, already
//    binds R2. A source row is shaped exactly like a learning row.
//
//    Against, and it is a real argument: ingestion is a different shape from
//    everything else here — scheduled, resumable, fanned out over thousands of
//    documents — and `workers/content` is on the CLIENT PORTAL's critical path.
//
//    Decided for the module, on three grounds: ingestion never touches the
//    request path for longer than one bounded slice; the isolation a worker
//    boundary buys is bought more provably by the fence the base already has
//    (every door here refuses a portal caller AT THE DOOR, machine-checked,
//    where "it is on another worker" is a deployment fact no law reads); and a
//    ninth worker is four law SCANS whose worker lists would each have to learn
//    about it, every one a place a new worker is silently un-measured.
//
// 2. THE SEARCH LIVES IN VECTORIZE. THE ANSWER STILL COMES OUT OF THE TEAM'S
//    OWN DATABASE. (This replaced the original decision. Here is why, and what
//    the original got right.)
//
//    WHAT WAS THERE BEFORE, and why it was reasonable: vectors were stored in
//    the team's own D1, and a search was two stages — a lexical narrowing to at
//    most 200 candidate chunks, then a cosine re-rank over exactly those. It
//    kept tenancy structural (a guard resolves one database id and the SQL
//    cannot name another) and it needed no new platform resource. At three
//    thousand chunks it worked.
//
//    WHAT WAS WRONG WITH IT, measured rather than assumed. The stages were
//    SERIAL, and the wrong one was first. The meaning stage only ever saw what
//    the word stage handed it, so a question asked in different words from the
//    material could not be answered no matter how good the embedding was — and
//    the "top-up" that was supposed to save it (fill the candidate set with the
//    compartment's newest chunks) is recency, not search. Against seven whole
//    books — 5.5 MB, 7,441 chunks, real embeddings, 142 questions with known
//    answers — the shipped design found the right passage in its top six on
//    46.5% of them. The same corpus, the same embeddings, the same questions,
//    with the two arms run SIDE BY SIDE and fused: see the numbers in
//    .plans/BUILD-4-knowledge-retrieval.md. The prefilter was the ceiling.
//
//    So the fix is not "Vectorize instead of D1". The fix is LEXICAL AND VECTOR
//    AS PEERS, and Vectorize is what makes the vector arm affordable when it can
//    no longer be a re-rank of two hundred rows: an approximate-nearest-neighbour
//    search over every chunk in the compartment, in one call, at any size.
//
//    THE FENCES DID NOT MOVE — see the header of knowledge-vectors.ts for the
//    full argument. In one line: the vector store NARROWS and the database
//    DECIDES. Vectorize is asked for ids and scores only (`returnValues: false`,
//    `returnMetadata: "none"`); every passage in every answer is then read back
//    out of the team's own database, under the caller's own owner clause, with
//    excluded sources gone. A mislabelled vector can cost a relevant passage; it
//    cannot produce one the caller was never allowed to read. Law R26.
//
// 3. THE ROUTER READS THE COVERS FIRST — AND SAYS WHAT IT READ, RATHER THAN
//    QUIETLY RE-ORDERING THE EVIDENCE.
//
//    Every record the base mirrors carries a short written SUMMARY of itself
//    (knowledge-summary.ts), embedded alongside the material at `level:
//    "record"`. A question searches the summaries first. That is the owner's
//    "the agent already knows what each notebook contains", and it is built.
//
//    WHAT THE SUMMARIES ARE NOT ALLOWED TO DO IS RANK THE PASSAGES, and this is
//    the sharpest thing the measurements taught. Two ways of letting a record
//    hint move a chunk were tried on the same corpus:
//      • as a PREFERENCE (lift the chunks of the top three records): recall@6
//        62.7% → 54.2% at book shape, → 14.8% when the same text was re-cut into
//        250 small records;
//      • as a NARROWING (search only inside the top records): → 34.5% (top 1),
//        49.3% (top 3), and 10.6% / 18.3% at record shape.
//    Both are worse, and the second is catastrophic, for the same reason: a
//    router is a GUESS about which notebook, and a guess placed in front of the
//    search can hide the answer completely. The search is very good at finding
//    the passage; it does not need to be told where to look.
//
//    So the summaries inform the ANSWER, not the ranking. The route narrows by
//    COMPARTMENT — which is a fact, not a guess: the caller is standing on a
//    client's record, or the question names one — and the records the summaries
//    matched ride the answer as `records`, so the assistant and the reader can
//    see what this question looks like it is about. Wrong, that is visible and
//    harmless. Wrong as a filter, it is invisible and fatal.
//
// ════════════════════════════════════════════════════════════════════════════
//
// THREE FENCES, and they are not the same fence — the comment is here because
// conflating any two of them is how this kind of module leaks:
//   • TENANCY   — the team's own database, and the vector index's namespace.
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
import { numberVar } from "@shared/workers/limits"
import { optionalDocument, optionalText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
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
  encodeEmbedding,
  MAX_CHUNKS_PER_SOURCE,
  plainText,
  questionTerms,
  tokenise,
} from "./knowledge-text"
import { buildSummary } from "./knowledge-summary"
import {
  chunkVectorId,
  deleteVectors,
  hasVectorStore,
  NONE,
  recordVectorId,
  searchVectors,
  TEAM_SHELF,
  upsertVectors,
  type VectorFilter,
  type VectorLabels,
  type VectorRow,
} from "./knowledge-vectors"

/** The kinds of material a source can be. `note` is typed by a person; the rest
 * MIRROR a row the app already owns and are kept in step by the sweep. Data, not
 * a code path — a new kind is a line here plus a reader in knowledge-ingest.ts. */
export const KNOWLEDGE_KINDS = ["note", "ticket", "article", "account", "app", "story", "sprint"] as const
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number]

/** The agency's own compartment — everything not owned by one client. */
export const AGENCY_COMPARTMENT = "agency"

/** One client's compartment. The ONE place the string is built, so a reader and
 * a writer can never spell it differently. */
export const accountCompartment = (accountId: string): string => `account:${accountId}`

/** Chunks the LEXICAL arm returns, and how loudly it votes.
 *
 * BOTH NUMBERS ARE MEASURED, and the first sweep got them wrong. Run as an EQUAL
 * peer of the vector arm, the word match COST nine points of recall against the
 * vector arm alone (53.5% vs 62.7% — .plans/BUILD-4-knowledge-retrieval.md): its
 * hundred best guesses at an ordinary question are long chunks full of ordinary
 * words, and an equal vote puts them above the passage that answers it.
 *
 * So it is small, and it is GATED (see `hasExactTerm`). What it is for is the
 * one thing an embedding is indifferent to: something a person typed EXACTLY —
 * a ticket reference, an invoice number, an error code. */
const LEXICAL_TOP_K = 10
const LEXICAL_WEIGHT = 0.1

/** Chunks the fused list hands on to be READ out of the database. Bounded
 * because every one is a row; comfortably more than one answer carries, so the
 * personal fence and the excluded-source filter can drop rows without the answer
 * running short. */
const RANKING_POOL = 24

/** Passages one answer carries. Enough for a real answer with more than one
 * source behind it; small enough that the assistant's context stays cheap. */
const DEFAULT_PASSAGES = 6

/** HOW CLOSE IS CLOSE ENOUGH TO COUNT AS EVIDENCE.
 *
 * A vector search always returns something. There is always a nearest
 * neighbour, so without a floor the knowledge base would answer every question
 * ever asked, confidently, out of whatever happened to be least unlike it — and
 * R23's whole point is that "we have nothing on this" is a different KIND of
 * answer, not a shorter one. The old design got this by accident (its lexical
 * stage returned nothing, so there was nothing to rank); here it has to be a
 * decision, and a decision needs a number somebody measured.
 *
 * MEASURED, on 7,441 chunks with the shipped model (bge-m3), against 142
 * questions the corpus can answer and 16 it cannot:
 *
 *   answerable questions   min 0.507   5th pct 0.550   median 0.624
 *   unanswerable ones      max 0.519   95th pct 0.505  median 0.459
 *
 *   floor   real questions still answered   unanswerable ones refused
 *   0.40              100%                            13%
 *   0.45              100%                            38%
 *   0.50              100%                            88%
 *   0.55               95%                           100%
 *
 * 0.50 is the last floor that costs nothing. Going further buys the remaining
 * refusals with real answers, and a knowledge base that starts saying "nothing
 * on that" about things it holds is one nobody asks twice.
 *
 * IT IS A PROPERTY OF THE MODEL, not of the app — which is why it is a VAR and
 * not a constant. Cosine scales differ between embedding models: change
 * KNOWLEDGE_EMBED_MODEL and this number has to be measured again (the harness
 * that measured it is kept — see .plans/BUILD-4-knowledge-retrieval.md). A test
 * running against a stand-in model sets its own, for the same reason. */
const MIN_VECTOR_SCORE = 0.5

/** Reciprocal-rank fusion's smoothing constant. The two arms score on scales
 * that have nothing to do with one another (a cosine and a sum of term weights),
 * so they are fused by RANK. 60 is the value the method was published with and
 * it behaves like a prior: it takes a big rank difference to overturn agreement
 * between the two arms. */
const RRF_K = 60

/** Records the router names. It is answering "what is this question ABOUT",
 * which is a short list or it is not an answer. */
const ROUTER_TOP_RECORDS = 3

/** Terms one question contributes to the lexical arm. A question is short; this
 * is a ceiling on a pathological one (a pasted log file in the question box),
 * and it bounds the `IN (…)` list — and therefore the bound parameters — the
 * statement carries. D1 refuses a statement past 100 of those. */
const MAX_QUESTION_TERMS = 24

/** Chunk rows written per statement. A source's chunks go in as several scripts
 * rather than one, so a 1,700-chunk contract can't build a megabyte of SQL —
 * D1 refuses a statement over 100 KB. */
const CHUNK_WRITE_BATCH = 20

/** Texts handed to the embedding model in one call. Workers AI takes 100. */
const EMBED_BATCH = 100

/** Chunks one INDEXING SLICE does. The unit of resumable work: a slice embeds,
 * writes and upserts this many chunks and then records where it got to. */
const INDEX_CHUNKS_PER_SLICE = 300

/** Slices one invocation will run before handing the rest back to the next
 * caller. 6 × 300 = 1,800 chunks, which is more than the largest document the
 * door will accept — so in practice a whole 300-page contract is indexed inside
 * the request that added it, and the ceiling exists for the case that isn't. */
const INDEX_SLICES_PER_CALL = 6

/* --------------------------------- reading -------------------------------- */

type SourceRow = {
  id: string
  kind: string
  origin_table: string | null
  origin_row_id: string | null
  compartment: string
  account_id: string | null
  app_id: string | null
  ticket_id: string | null
  sprint_id: string | null
  record_date: string | null
  title: string
  summary: string | null
  body: string | null
  body_bytes: number
  source_url: string | null
  owner_user_id: string | null
  indexed_at: string | null
  chunk_count: number
  indexed_chunks: number
  index_error: string | null
  created_at: string
  creator_name: string | null
  editor_name: string | null
  updated_at: string | null
  deactivated_at: string | null
}

/** The columns a LIST carries — everything except the material itself.
 *
 * `body` is deliberately absent. A source can now be a 300-page contract, and a
 * page of fifty of them would have been forty megabytes of JSON on the way to a
 * screen that shows titles. The summary is what a list is for; the body is what
 * a detail is for. */
const LIST_COLS = `id, kind, origin_table, origin_row_id, compartment, account_id, app_id, ticket_id, sprint_id,
  record_date, title, summary, NULL AS body, body_bytes, source_url, owner_user_id, indexed_at,
  chunk_count, indexed_chunks, index_error,
  created_at, creator_name, editor_name, updated_at, deactivated_at`

/** The columns ONE source carries. The body comes too — but only as far as a
 * person can read (see BODY_INLINE_CHARS), because a detail screen is a screen. */
const DETAIL_COLS = LIST_COLS.replace("NULL AS body", `substr(body, 1, ${bodyInlineChars()}) AS body`)

/** How much of a source's material a screen is handed inline. This is a DISPLAY
 * decision and nothing else: the whole document is stored and every word of it
 * is searchable. `bodyBytes` on the row says how much there really is, so the
 * screen can say "showing the first part of 412 KB" rather than quietly
 * presenting an excerpt as the whole thing. */
function bodyInlineChars(): number {
  return TEXT_LIMITS.long
}

function toSource(r: SourceRow): KnowledgeSource {
  const shown = r.body ?? null
  return {
    id: r.id,
    kind: (KNOWLEDGE_KINDS as readonly string[]).includes(r.kind) ? (r.kind as KnowledgeKind) : "note",
    originTable: r.origin_table,
    originRowId: r.origin_row_id,
    compartment: r.compartment,
    accountId: r.account_id,
    appId: r.app_id,
    ticketId: r.ticket_id,
    sprintId: r.sprint_id,
    recordDate: r.record_date,
    title: r.title,
    summary: r.summary,
    body: shown,
    bodyBytes: r.body_bytes,
    // TRUE when what the screen was handed is less than what is stored — the one
    // fact that stops an excerpt from being mistaken for the document.
    bodyTruncated: shown !== null && r.body_bytes > shown.length,
    sourceUrl: r.source_url,
    // The FIELD a person edits is "who may this be read by", so the wire says
    // that rather than making every reader remember what a null id means.
    visibility: r.owner_user_id ? "private" : "team",
    ownerUserId: r.owner_user_id,
    indexedAt: r.indexed_at,
    chunkCount: r.chunk_count,
    indexedChunks: r.indexed_chunks,
    indexError: r.index_error,
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
    // worker exponential time (see shared/workers/d1-rest.ts). It searches the
    // title and the SUMMARY rather than the body: a LIKE over 300-page documents
    // is a full scan of every byte the team owns, and the summary is the part
    // that says what each one is.
    where.push(`(LOWER(title) LIKE ? ESCAPE '\\' OR LOWER(summary) LIKE ? ESCAPE '\\')`)
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
    `SELECT ${LIST_COLS} FROM knowledge_sources
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
    `SELECT ${DETAIL_COLS} FROM knowledge_sources WHERE id = ? AND ${owner.sql}`,
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
 * drift into different shapes.
 *
 * THE BODY IS A DOCUMENT, NOT A PARAGRAPH. It goes through `optionalDocument`,
 * which caps BYTES rather than characters and refuses — in words, saying both
 * numbers — rather than trimming. The old cap was TEXT_LIMITS.long, twenty
 * thousand characters, which is about eight pages: two whole books handed to
 * this door came back refused, and a 300-page contract could not go in at all. */
function readInput(input: SourceInput): {
  title: string
  body: string | null
  sourceUrl: string | null
  accountId: string | null
  privateToMe: boolean
} {
  return {
    title: requireText(input.title, "Title", TEXT_LIMITS.short),
    body: optionalDocument(input.body, "The material") ?? null,
    sourceUrl: optionalText(input.sourceUrl, "Link", TEXT_LIMITS.link) ?? null,
    accountId: optionalText(input.accountId, "Account", TEXT_LIMITS.short) ?? null,
    privateToMe: input.visibility === "private",
  }
}

/** The account a source is filed under must be one this team really has — a
 * compartment built from an id nobody owns would be a slice of the knowledge
 * base nothing can ever reach again. */
async function requireAccount(
  cfg: D1Rest,
  guard: MemberGuard,
  accountId: string
): Promise<{ id: string; name: string }> {
  const rows = await d1Query<{ id: string; name: string }>(
    cfg,
    guard.databaseId,
    "SELECT id, name FROM accounts WHERE id = ? LIMIT 1",
    [accountId]
  )
  if (!rows[0]) throw new GuardError(404, "not_found", "That account doesn't exist.")
  return rows[0]
}

/** Write a source a PERSON typed, and index it in the same call so the assistant
 * knows about it before they have finished reading the toast. Returns its id.
 *
 * THE BODY GOES IN AS A BOUND PARAMETER, not through `sqlString`. D1 refuses a
 * SQL statement over 100 KB, so the interpolated write this used to do put a
 * hard ceiling of about a hundred kilobytes on the material — one nobody had
 * chosen and nothing said out loud. A bound parameter carries the value beside
 * the statement instead of inside it, and the only ceiling left is the one in
 * the validator, which is a decision with a sentence attached. */
export async function createSource(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  input: SourceInput
): Promise<string> {
  const v = readInput(input)
  const account = v.accountId ? await requireAccount(cfg, guard, v.accountId) : null
  const id = ulid()
  const now = new Date().toISOString()
  const compartment = account ? accountCompartment(account.id) : AGENCY_COMPARTMENT
  const summary = buildSummary({
    noun: "note",
    title: v.title,
    accountName: account?.name ?? null,
    detail: v.body ?? "",
  })
  await d1Query(
    cfg,
    guard.databaseId,
    `INSERT INTO knowledge_sources (id, kind, compartment, account_id, title, summary, body, body_bytes, source_url,
       owner_user_id, record_date, created_at, creator_id, creator_email, creator_name)
     VALUES (?, 'note', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      compartment,
      v.accountId,
      v.title,
      summary,
      v.body,
      byteLength(v.body),
      v.sourceUrl,
      v.privateToMe ? guard.userId : null,
      now,
      now,
      actor.id,
      actor.email,
      actor.name,
    ]
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

/** How big a piece of material really is, measured the way the database
 * measures it and the way the validator refuses it. */
function byteLength(text: string | null): number {
  return text ? new TextEncoder().encode(text).length : 0
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
  const account = v.accountId ? await requireAccount(cfg, guard, v.accountId) : null
  const mirrored = before.originRowId !== null
  const title = mirrored ? before.title : v.title
  // A mirrored source's body is never read back here (the list does not carry it
  // and the detail carries only as much as a screen shows), so an edit leaves
  // the stored body alone rather than writing an excerpt over the document.
  const compartment = account ? accountCompartment(account.id) : AGENCY_COMPARTMENT
  const owner = v.privateToMe ? guard.userId : null
  const now = new Date().toISOString()
  if (mirrored) {
    await d1Query(
      cfg,
      guard.databaseId,
      `UPDATE knowledge_sources SET account_id = ?, compartment = ?, owner_user_id = ?, updated_at = ?,
         editor_id = ?, editor_email = ?, editor_name = ? WHERE id = ?`,
      [v.accountId, compartment, owner, now, actor.id, actor.email, actor.name, id]
    )
  } else {
    await d1Query(
      cfg,
      guard.databaseId,
      `UPDATE knowledge_sources SET title = ?, body = ?, body_bytes = ?, summary = ?, source_url = ?,
         account_id = ?, compartment = ?, owner_user_id = ?, updated_at = ?,
         editor_id = ?, editor_email = ?, editor_name = ? WHERE id = ?`,
      [
        title,
        v.body,
        byteLength(v.body),
        buildSummary({ noun: "note", title, accountName: account?.name ?? null, detail: v.body ?? "" }),
        v.sourceUrl,
        v.accountId,
        compartment,
        owner,
        now,
        actor.id,
        actor.email,
        actor.name,
        id,
      ]
    )
  }
  // The chunks and the vectors carry the compartment and the owner too (both
  // arms narrow on them without a join), so a re-filing has to travel down or
  // the index would answer for a client whose material this no longer is.
  await indexSource(env, cfg, guard, id, { force: true })
  const changes = describeChanges([
    { label: "Title", from: before.title, to: title },
    { label: "Filed under", from: before.compartment, to: compartment },
    { label: "Visible to", from: before.visibility, to: owner ? "private" : "team" },
    { label: "Body", from: before.body, to: mirrored ? before.body : v.body, hideValues: true },
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
 * and its CHUNKS AND VECTORS do not — an excluded source has to stop being
 * retrievable in the same instant, or "remove something wrong" is a promise the
 * search breaks. The sweep skips an excluded source rather than re-adding it.
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
  if (active) await indexSource(env, cfg, guard, id, { force: true })
  else await clearIndex(env, cfg, guard, id)
  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "Knowledge source restored" : "Knowledge source removed",
    description: `${actor.name} ${active ? "gave the assistant back" : "took away the assistant's sight of"} "${source.title}"`,
    relatedTable: "knowledge_sources",
    relatedRowId: id,
  })
  return true
}

/* -------------------------------- indexing -------------------------------- */

/** Everything derived FROM a source: its chunks, their postings, and its
 * vectors. The chunk rows are two keyed deletes; the vectors are removed by
 * DERIVED id — `<sourceId>:<seq>` for every sequence the row says it had, plus
 * its summary — so the index can be cleaned without first asking Vectorize what
 * it holds, and a source that got SHORTER loses its tail rather than keeping
 * orphan vectors nothing will ever overwrite. */
async function clearIndex(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  sourceId: string,
  known?: { chunkCount: number; indexedChunks: number }
): Promise<void> {
  const counts =
    known ??
    (
      await d1Query<{ chunk_count: number; indexed_chunks: number }>(
        cfg,
        guard.databaseId,
        "SELECT chunk_count, indexed_chunks FROM knowledge_sources WHERE id = ? LIMIT 1",
        [sourceId]
      )
    )[0] ?? { chunk_count: 0, indexed_chunks: 0 }
  const written = Math.max(
    "chunkCount" in counts ? counts.chunkCount : counts.chunk_count,
    "indexedChunks" in counts ? counts.indexedChunks : counts.indexed_chunks,
    0
  )
  await deleteVectors(env, [
    recordVectorId(sourceId),
    ...Array.from({ length: written }, (_, seq) => chunkVectorId(sourceId, seq)),
  ])
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
    "UPDATE knowledge_sources SET chunk_count = 0, indexed_chunks = 0, indexed_at = NULL, content_hash = NULL, index_error = NULL WHERE id = ?",
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

/** WHAT A CHUNK IS EMBEDDED AS — the chunk, and nothing else.
 *
 * THIS FUNCTION EXISTS TO RECORD A NEGATIVE RESULT, because without it the next
 * person will re-add the thing it names. Embedding each chunk with its record's
 * name (and summary) in front of it — "contextual retrieval", the standard
 * remedy for a sentence that means nothing out of its document — was built and
 * measured on the same corpus. With the record's SUMMARY in front: recall@6
 * 62.7% → 38.7%, because a four-hundred-character preamble shared by thirty
 * chunks makes those thirty chunks resemble each other more than they resemble
 * any question. With just the record's NAME: 62.7% → 62.7% at book shape and
 * → 59.2% when the same text was cut into 250 small records. Neutral at best,
 * and worse the moment a title is poor.
 *
 * WHAT WOULD CHANGE OUR MIND: a measurement on the AGENCY'S OWN material rather
 * than on books. The argument for the prefix is strongest exactly where this
 * corpus is weakest — three hundred tickets that all say "we tried again and it
 * still failed" — and the harness takes any corpus. */
export function embeddableText(_source: unknown, chunk: string): string {
  return chunk
}

/** Ask the model for one embedding per text. Best-effort BY DESIGN: an embedding
 * failure must not fail an ingest, because the alternative is a knowledge base
 * that refuses to accept a note when Workers AI has a bad minute. A null
 * embedding stores as NULL, that chunk gets no vector, and the source's content
 * hash is left un-stamped so the next sweep tries again. */
async function embed(env: Env, texts: string[]): Promise<(number[] | null)[]> {
  const out: (number[] | null)[] = []
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH)
    try {
      const model = env.KNOWLEDGE_EMBED_MODEL || "@cf/baai/bge-m3"
      const res = (await env.AI.run(model as never, { text: batch } as never)) as {
        data?: number[][]
      }
      const vectors = Array.isArray(res?.data) ? res.data : []
      for (let j = 0; j < batch.length; j++) out.push(vectors[j] ?? null)
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

/** How far one source's indexing got. Returned so a door can tell a person, and
 * so a sweep knows whether to come back. */
export type IndexProgress = { total: number; indexed: number; done: boolean }

/** (Re)build one source's chunks, postings and vectors from its own text — in
 * SLICES, so a document of any size the door accepts is indexed by repeating one
 * bounded piece of work rather than by one call that has to finish.
 *
 * WHY STAGED AT ALL, in numbers: the largest document this door accepts is 1.5
 * MB, which is about 1,700 chunks. That is 17 embedding calls, ~85 SQL writes
 * and 9 vector upserts. A Worker may make 1,000 sub-requests per invocation, so
 * it fits — but only just, and only because the ceiling is where it is. A staged
 * indexer does not care where the ceiling is: it does 300 chunks, writes down
 * where it stopped, and the next call carries on. Nothing has to finish.
 *
 * IDEMPOTENT, AND RESUMABLE ACROSS A CHANGE. `content_hash` is the hash of the
 * text being indexed, stamped at the START of a rebuild; `indexed_chunks` is how
 * far that rebuild got. So "is this source current?" is `hash matches AND
 * indexed_chunks >= chunk_count`, and a source whose text changed halfway
 * through starts again rather than finishing a document that no longer exists.
 * A tick that dies leaves a source the next tick finishes. */
export async function indexSource(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  sourceId: string,
  opts: { force?: boolean; slices?: number } = {}
): Promise<IndexProgress> {
  const rows = await d1Query<SourceRow & { content_hash: string | null }>(
    cfg,
    guard.databaseId,
    `SELECT id, kind, title, summary, body, compartment, account_id, app_id, ticket_id, sprint_id, record_date,
            owner_user_id, content_hash, chunk_count, indexed_chunks, deactivated_at, created_at
       FROM knowledge_sources WHERE id = ? LIMIT 1`,
    [sourceId]
  )
  const source = rows[0]
  if (!source) return { total: 0, indexed: 0, done: true }
  // An excluded source is not indexed, ever — that is what excluding it means.
  if (source.deactivated_at !== null) {
    await clearIndex(env, cfg, guard, sourceId, {
      chunkCount: source.chunk_count,
      indexedChunks: source.indexed_chunks,
    })
    return { total: 0, indexed: 0, done: true }
  }

  const text = indexableText(source)
  const hash = contentHash(text)
  const chunks = chunkText(text)
  const total = Math.min(chunks.length, MAX_CHUNKS_PER_SOURCE)
  // NOT SILENT. A mirrored row bigger than the indexer's ceiling keeps the part
  // that fits — making an existing record unfindable would be a worse answer
  // than an incomplete one — but it SAYS SO on the row, in both numbers, where
  // the sync screen and the machine surface both read it. (An UPLOAD past the
  // ceiling never gets here: the door refuses it outright, and nothing is saved.)
  const overflow =
    chunks.length > MAX_CHUNKS_PER_SOURCE
      ? `Too big to index whole: the first ${MAX_CHUNKS_PER_SOURCE} of ${chunks.length} pieces are searchable.`
      : null

  let from = source.indexed_chunks
  const restart = opts.force || source.content_hash !== hash || from > total
  if (restart) {
    await clearIndex(env, cfg, guard, sourceId, {
      chunkCount: source.chunk_count,
      indexedChunks: source.indexed_chunks,
    })
    from = 0
    await d1Query(
      cfg,
      guard.databaseId,
      "UPDATE knowledge_sources SET content_hash = ?, chunk_count = ?, indexed_chunks = 0, index_error = ? WHERE id = ?",
      [hash, total, overflow, sourceId]
    )
  }
  if (!total || from >= total) return { total, indexed: from, done: true }

  const labels = labelsFor(source)
  const now = new Date().toISOString()
  const slices = Math.max(1, opts.slices ?? INDEX_SLICES_PER_CALL)

  for (let slice = 0; slice < slices && from < total; slice++) {
    const piece = chunks.slice(from, Math.min(from + INDEX_CHUNKS_PER_SLICE, total))
    const vectors = await embed(env, piece.map((c) => embeddableText(source, c)))
    const upserts: VectorRow[] = []

    for (let start = 0; start < piece.length; start += CHUNK_WRITE_BATCH) {
      const statements: string[] = []
      piece.slice(start, start + CHUNK_WRITE_BATCH).forEach((chunk, offset) => {
        const seq = from + start + offset
        const chunkId = chunkVectorId(sourceId, seq)
        const vector = vectors[start + offset]
        statements.push(
          `INSERT INTO knowledge_chunks (id, source_id, compartment, owner_user_id, seq, text, embedding, created_at) VALUES (${sqlString(chunkId)}, ${sqlString(sourceId)}, ${sqlString(source.compartment)}, ${sqlString(source.owner_user_id)}, ${seq}, ${sqlString(chunk)}, ${sqlString(vector ? encodeEmbedding(vector) : null)}, ${sqlString(now)});`
        )
        for (const [term, weight] of tokenise(chunk))
          statements.push(
            `INSERT INTO knowledge_terms (term, chunk_id, compartment, owner_user_id, weight) VALUES (${sqlString(term)}, ${sqlString(chunkId)}, ${sqlString(source.compartment)}, ${sqlString(source.owner_user_id)}, ${weight});`
          )
        if (vector) upserts.push({ id: chunkId, values: vector, labels: { ...labels, level: "chunk" } })
      })
      await d1ExecScript(cfg, guard.databaseId, statements.join("\n"))
    }

    await upsertVectors(env, guard, upserts)
    from += piece.length
    await d1Query(cfg, guard.databaseId, "UPDATE knowledge_sources SET indexed_chunks = ?, indexed_at = ? WHERE id = ?", [
      from,
      now,
      sourceId,
    ])
  }

  // THE SUMMARY VECTOR — the record's own cover, written once the material has
  // started going in. It is what the router searches before it searches
  // anything, so a record with no summary is a record the router cannot prefer;
  // it is still perfectly findable through its chunks.
  if (restart && source.summary) {
    const [summaryVector] = await embed(env, [`${source.title}\n\n${source.summary}`])
    if (summaryVector) {
      await upsertVectors(env, guard, [
        { id: recordVectorId(sourceId), values: summaryVector, labels: { ...labels, level: "record" } },
      ])
      await d1Query(cfg, guard.databaseId, "UPDATE knowledge_sources SET summary_embedding = ? WHERE id = ?", [
        encodeEmbedding(summaryVector),
        sourceId,
      ])
    }
  }

  // THE HASH IS THE "DON'T DO THIS AGAIN" FLAG, and it is only trusted together
  // with `indexed_chunks`. If the model was down, this source is chunked but has
  // no vectors — blanking the hash is what makes the next sweep pick it up again
  // instead of skipping it forever as "unchanged". Self-healing without a repair
  // door anybody has to remember.
  const embedded = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    "SELECT COUNT(*) AS n FROM knowledge_chunks WHERE source_id = ? AND embedding IS NOT NULL",
    [sourceId]
  )
  if (!(embedded[0]?.n ?? 0))
    await d1Query(cfg, guard.databaseId, "UPDATE knowledge_sources SET content_hash = NULL WHERE id = ?", [sourceId])

  return { total, indexed: from, done: from >= total }
}

/** THE LABELS ON EVERY VECTOR A SOURCE PRODUCES — the notebook it belongs to,
 * built in ONE place so a chunk and its record's summary can never disagree
 * about whose material they are. Every key is present on every vector, because
 * Vectorize has no "is null": an absent key is a hole in every filter, so
 * "nothing here" has a spelling of its own. */
function labelsFor(source: {
  kind: string
  compartment: string
  account_id: string | null
  app_id: string | null
  ticket_id: string | null
  sprint_id: string | null
  record_date: string | null
  created_at: string
  owner_user_id: string | null
}): VectorLabels {
  const when = Date.parse(source.record_date ?? source.created_at)
  return {
    level: "chunk",
    compartment: source.compartment,
    owner: source.owner_user_id ?? TEAM_SHELF,
    kind: source.kind,
    account: source.account_id ?? NONE,
    app: source.app_id ?? NONE,
    ticket: source.ticket_id ?? NONE,
    sprint: source.sprint_id ?? NONE,
    date: Number.isFinite(when) ? Math.floor(when / 1000) : 0,
  }
}

/* ------------------------------- the router ------------------------------- */

/** Which slice of the knowledge base a question is answered from, WHY, and which
 * records to prefer inside it.
 *
 * The reasoning is the product: the owner's complaint about the tools he uses
 * today is that he has to KEEP a notebook per project by hand. So nobody picks a
 * compartment here — it is derived from where the asker is standing, from what
 * they said, and from what the records themselves say they are about; and the
 * answer carries the sentence explaining the choice, so a wrong one is visible
 * instead of mysterious.
 *
 * `compartments` empty means "no narrowing" — the whole knowledge base the
 * caller may read. That is the honest answer to a question that names no client. */
export type CompartmentChoice = {
  compartments: string[]
  reason: string
  /** the records this question looks like it is about, best first. It rides the
   * ANSWER and never the ranking (see §3 in the header) — a wrong guess here is
   * something a reader can disagree with, not something that hid the passage. */
  records: { sourceId: string; title: string }[]
}

export async function deriveCompartment(
  cfg: D1Rest,
  guard: MemberGuard,
  input: { question: string; accountId?: string | null }
): Promise<{ compartments: string[]; reason: string }> {
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

/** The full route: the compartment decision above, plus the record-level
 * preference that only a vector search can give. */
async function deriveRoute(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  input: { question: string; accountId?: string | null; asked: number[] | null }
): Promise<CompartmentChoice> {
  const choice = await deriveCompartment(cfg, guard, input)
  if (!input.asked || !hasVectorStore(env)) return { ...choice, records: [] }

  // THE COVERS, READ FIRST. One query over the record summaries — a few hundred
  // short vectors, never the material — narrowed to whatever the compartment
  // decision already settled.
  const hits = await searchVectors(
    env,
    guard,
    input.asked,
    { level: "record", ...compartmentFilter(choice.compartments) },
    ROUTER_TOP_RECORDS
  )
  if (!hits.length) return { ...choice, records: [] }
  const titles = await sourceTitles(
    cfg,
    guard,
    hits.map((h) => h.id.replace(/:summary$/, ""))
  )
  const records = [...titles.entries()].map(([sourceId, title]) => ({ sourceId, title }))
  return {
    ...choice,
    records,
    reason: records.length
      ? `${choice.reason} It reads like a question about ${records.map((r) => `"${r.title}"`).join(", ")}.`
      : choice.reason,
  }
}

/** The compartment decision, as a vector filter. Empty means no narrowing. */
function compartmentFilter(compartments: string[]): VectorFilter {
  return compartments.length ? { compartment: { $in: compartments } } : {}
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

/** The titles of a handful of sources, for the sentence the router says out
 * loud. Fenced like every other read here. */
async function sourceTitles(
  cfg: D1Rest,
  guard: MemberGuard,
  ids: string[]
): Promise<Map<string, string>> {
  if (!ids.length) return new Map()
  const owner = ownerClause(guard)
  const rows = await d1Query<{ id: string; title: string }>(
    cfg,
    guard.databaseId,
    // R14 hard cap: `ids` is at most ROUTER_TOP_RECORDS, and the LIMIT says so
    // at the statement. The ids are ULIDs this worker wrote and read back, never
    // anything off a request, so they are interpolated like every other
    // server-owned value (CONVENTIONS) and the statement binds one parameter.
    `SELECT id, title FROM knowledge_sources
      WHERE id IN (${ids.map((id) => sqlString(id)).join(", ")}) AND ${owner.sql} AND deactivated_at IS NULL
      LIMIT ${ROUTER_TOP_RECORDS}`,
    owner.params
  )
  return new Map(rows.map((r) => [r.id, r.title]))
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
  /** what the record summaries said this question is about. Evidence for the
   * reader, never an input to the ranking (§3). */
  records: { sourceId: string; title: string }[]
  passages: KnowledgePassage[]
  candidates: number
  /** what the live rows say RIGHT NOW about the records being cited — see
   * `crossCheck`. Attached to the citation it belongs to, never to the passage:
   * the passage is what the index remembered, and these two must stay visibly
   * different things. */
  live?: Map<string, { status: string; checkedAt: string }>
}): KnowledgeAnswer {
  const citations: KnowledgeCitation[] = []
  for (const p of input.passages)
    if (!citations.some((c) => c.sourceId === p.sourceId)) {
      const live = input.live?.get(p.sourceId)
      citations.push({
        sourceId: p.sourceId,
        title: p.title,
        kind: p.kind,
        url: p.url,
        liveStatus: live?.status ?? null,
        checkedAt: live?.checkedAt ?? null,
      })
    }
  const found = citations.length > 0
  const stale = citations.filter((c) => c.liveStatus)
  return {
    question: input.question,
    found,
    // Said in the assistant's own voice, because this sentence is what it must
    // repeat rather than inventing an answer around an empty result.
    message: found
      ? `${citations.length} source${citations.length === 1 ? "" : "s"} in the knowledge base answer this.${
          stale.length
            ? ` I checked the live record${stale.length === 1 ? "" : "s"} just now — say what ${stale.length === 1 ? "it says" : "they say"} today, not what the passage says.`
            : ""
        }`
      : "The knowledge base has nothing on this. Say so plainly — do not answer from memory.",
    compartments: input.compartments,
    reason: input.reason,
    records: input.records,
    passages: found ? input.passages : [],
    citations,
    candidates: input.candidates,
  }
}

type CandidateRow = { chunk_id: string; lex: number; hits: number }

/** How much of a question a chunk must actually CONTAIN before the word match
 * will call it evidence.
 *
 * The vector arm has a floor (MIN_VECTOR_SCORE) and the word arm needs one for
 * the same reason: a chunk sharing one word out of eight is not an answer, it is
 * a coincidence, and without a floor "we have nothing on that" would become
 * impossible to say the moment the word arm was allowed to run alone. Its only
 * honest unit is how many of the question's own terms are in it. */
const MIN_TERM_SHARE = 0.5

/** DID SOMEBODY TYPE SOMETHING EXACT? A token with a digit in it — a ticket
 * reference, an invoice number, an error code, a date — or a phrase they put in
 * quotation marks. That, and only that, is what the word match is better at than
 * the vector, so that is the only thing it is asked about.
 *
 * The alternative (always run it, fuse the two as equals) was measured and it
 * cost nine points of recall. A gate is not timidity here; it is the difference
 * between an arm that helps on the questions it understands and one that votes
 * loudly on every question it does not. */
export function hasExactTerm(question: string): boolean {
  if (/["“][^"”]{3,}["”]/.test(question)) return true
  return questionTerms(question, MAX_QUESTION_TERMS).some((t) => /\d/.test(t))
}

/** THE LEXICAL ARM. One keyed read over the inverted index, fenced by the reader
 * and narrowed by the compartment.
 *
 * It used to be stage ONE, and everything else only saw what it handed on. Now
 * it runs beside the vector arm, gated and quiet, and neither can cap the other.
 * It is still here, and it must stay: a reference code, an error string, an
 * invoice number are things a person types EXACTLY, and an embedding is
 * indifferent to exactly. */
async function lexicalArm(
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
  const rows = await d1Query<CandidateRow>(
    cfg,
    guard.databaseId,
    // R14 hard cap: the lexical arm returns at most LEXICAL_TOP_K rows, whatever
    // the compartment holds. The statement binds at most 24 terms + 1 owner + a
    // handful of compartments — D1 refuses a statement past 100 parameters.
    //
    // `hits` counts the DISTINCT terms of the question this chunk contains; the
    // primary key is (term, chunk_id), so a row per term is a term. That is the
    // number the floor below is expressed in — SUM(weight) says how loudly a
    // chunk matched, and only this says how MUCH of the question it answered.
    `SELECT chunk_id, SUM(weight) AS lex, COUNT(*) AS hits FROM knowledge_terms
      WHERE ${where.join(" AND ")}
      GROUP BY chunk_id ORDER BY lex DESC LIMIT ${LEXICAL_TOP_K}`,
    params
  )
  const needed = Math.max(1, Math.ceil(terms.length * MIN_TERM_SHARE))
  return rows.filter((r) => r.hits >= needed)
}

type ScoredRow = {
  id: string
  source_id: string
  seq: number
  text: string
  title: string
  kind: string
  source_url: string | null
  compartment: string
  origin_table: string | null
  origin_row_id: string | null
}

/** WEIGHTED RECIPROCAL RANK FUSION. Two ranked lists whose scores mean entirely
 * different things (a cosine, and a sum of term weights), combined by the one
 * thing they share — position. Each contributes weight/(K + rank).
 *
 * The WEIGHT is the part that was measured and got wrong first time round. At
 * parity the word match drags an ordinary question's answer down nine points;
 * at a tenth of a vote, gated to questions that contain something exact, it is
 * invisible on questions it has nothing to say about and decisive on the ones
 * it does. Nothing else is added here — no record hint, no recency, no
 * hand-tuned boost. Every one of those was tried and every one was worse. */
function fuse(vector: { id: string }[], lexical: CandidateRow[]): { id: string; score: number }[] {
  const fused = new Map<string, number>()
  vector.forEach((hit, rank) => fused.set(hit.id, (fused.get(hit.id) ?? 0) + 1 / (RRF_K + rank + 1)))
  lexical.forEach((row, rank) =>
    fused.set(row.chunk_id, (fused.get(row.chunk_id) ?? 0) + LEXICAL_WEIGHT / (RRF_K + rank + 1))
  )
  return [...fused.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
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

  const [asked] = await embed(env, [question])
  const route = await deriveRoute(env, cfg, guard, {
    question,
    accountId: input.accountId ?? null,
    asked,
  })

  // THE TWO ARMS, SIDE BY SIDE. Neither narrows the other; that was the bug.
  const terms = questionTerms(question, MAX_QUESTION_TERMS)
  const hits =
    asked && hasVectorStore(env)
      ? await searchVectors(env, guard, asked, {
          level: "chunk",
          ...compartmentFilter(route.compartments),
        })
      : []
  // NOT EVERY NEAREST NEIGHBOUR IS EVIDENCE. There is always a closest thing;
  // below the floor it is merely the least unlike, and letting it through is how
  // a knowledge base answers a question about parental leave out of a note about
  // dispatch outages.
  const vector = hits.filter((h) => h.score >= numberVar(env.KNOWLEDGE_MIN_SCORE, MIN_VECTOR_SCORE))

  // WHEN THE WORD MATCH RUNS, in two cases and for two different reasons:
  //   • the question contains something EXACT (a reference, an invoice number).
  //     Then it runs BESIDE the vector arm, quietly, at a tenth of a vote,
  //     because "exactly this string" is the one thing an embedding is
  //     indifferent to;
  //   • the vector arm found NO evidence — no store bound, the question could
  //     not be embedded, this material was ingested while the model was down so
  //     it has no vector, or nothing in the base is close enough. Then it is not
  //     a peer, it is everything we have.
  // The second case is only safe because the word arm has a floor of its own
  // (MIN_TERM_SHARE): a chunk has to contain half the question before it counts.
  // Without that, letting it run whenever the vector arm drew a blank would turn
  // every honest "we have nothing on this" into a bag of vaguely related
  // paragraphs — which is the failure R23 exists to prevent.
  const lexical =
    hasExactTerm(question) || !vector.length
      ? await lexicalArm(cfg, guard, terms, route.compartments)
      : []

  const fused = fuse(vector, lexical)
  if (!fused.length)
    return knowledgeAnswer({
      question,
      compartments: route.compartments,
      reason: route.reason,
      records: route.records,
      passages: [],
      candidates: 0,
    })

  // THE DATABASE DECIDES (R26). Everything above chose ids; the words come from
  // here, out of the team's own database, under the caller's own fence, with
  // excluded sources gone. Nothing readable ever left the vector store.
  const pool = fused.slice(0, RANKING_POOL)
  const owner = ownerClause(guard, "c.owner_user_id")
  const rows = await d1Query<ScoredRow>(
    cfg,
    guard.databaseId,
    // R14 hard cap: the pool is already bounded by RANKING_POOL; the LIMIT says
    // so at the statement, where the next reader is looking. The ids are this
    // worker's own, read back out of its own table, so they are interpolated
    // (CONVENTIONS) and the statement stays under D1's 100-parameter ceiling.
    `SELECT c.id, c.source_id, c.seq, c.text, s.title, s.kind, s.source_url, s.compartment,
            s.origin_table, s.origin_row_id
       FROM knowledge_chunks c JOIN knowledge_sources s ON s.id = c.source_id
      WHERE c.id IN (${pool.map(({ id }) => sqlString(id)).join(", ")})
        AND s.deactivated_at IS NULL AND ${owner.sql}
      LIMIT ${RANKING_POOL}`,
    owner.params
  )

  const ranked = rankPassages(fused, rows)
  const passages: KnowledgePassage[] = ranked.slice(0, want).map(({ row, score }) => ({
    sourceId: row.source_id,
    title: row.title,
    kind: row.kind,
    url: row.source_url,
    compartment: row.compartment,
    seq: row.seq,
    text: plainText(row.text),
    score: Math.round(score * 1000) / 1000,
  }))
  const live = await crossCheck(cfg, guard, ranked.slice(0, want).map((r) => r.row))
  return knowledgeAnswer({
    question,
    compartments: route.compartments,
    reason: route.reason,
    records: route.records,
    passages,
    candidates: fused.length,
    live,
  })
}

/** THE ORDER THE FUSION DECIDED, joined to the rows the database handed back.
 *
 * THERE IS NO CROSS-ENCODER RE-RANK HERE, AND THAT IS A MEASUREMENT, NOT AN
 * OMISSION. The obvious next move — take the top two dozen, have a cross-encoder
 * read the question and each passage together, re-order — is the standard way to
 * turn "roughly right" into "the right paragraph", and the latency and cost for
 * it were explicitly authorised. It was built and measured. The only re-ranker
 * Cloudflare offers (@cf/baai/bge-reranker-base — the v2/large/jina ones return
 * "no route for that URI") made every slice of the corpus WORSE: recall@6 62.7%
 * → 47.9% over a pool of 24, → 41.5% over a pool of 50. So it is not shipped,
 * and the seam it would slot into is this function.
 *
 * WHAT WOULD CHANGE OUR MIND: a stronger re-ranker on Workers AI (the seam is
 * one `env.AI.run` here, and the harness that measured it is kept), or a bigger
 * question set showing the loss is our sample rather than the model. It stays on
 * Cloudflare either way — no outside provider sees this text. */
function rankPassages(
  fused: { id: string; score: number }[],
  rows: ScoredRow[]
): { row: ScoredRow; score: number }[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  return fused
    .map((f) => ({ row: byId.get(f.id), score: f.score }))
    .filter((r): r is { row: ScoredRow; score: number } => Boolean(r.row))
}

/** WHAT THE LIVE ROW SAYS RIGHT NOW.
 *
 * The index is a memory of a row, and a memory goes stale between the moment it
 * was written and the moment somebody asks. A ticket that was "in progress" when
 * it was indexed and is "done" now would otherwise be quoted, accurately and
 * uselessly, as in progress. So before the answer leaves, the records it is
 * about are read AGAIN — the real rows, in the team's own database, at the
 * moment of asking — and what they say today rides the citation.
 *
 * Always, not only when the ranking looked uncertain: it is one grouped read per
 * table over at most six cited records, the owner authorised the latency, and a
 * rule that fires only sometimes is a rule nobody can rely on.
 *
 * It reads no more than the index already carries — the status is inside the
 * indexed text of every mirrored source — so it widens nobody's sight of
 * anything; it only stops the answer being out of date. */
const LIVE_STATUS: Record<string, { table: string; status: string }> = {
  help: { table: "help", status: "status" },
  stories: { table: "stories", status: "status" },
  sprints: { table: "sprints", status: `CASE WHEN completed_at IS NULL THEN 'running' ELSE 'completed' END` },
  apps: { table: "apps", status: "stage" },
  accounts: { table: "accounts", status: "status" },
}

async function crossCheck(
  cfg: D1Rest,
  guard: MemberGuard,
  rows: ScoredRow[]
): Promise<Map<string, { status: string; checkedAt: string }>> {
  const out = new Map<string, { status: string; checkedAt: string }>()
  const byTable = new Map<string, { sourceId: string; rowId: string }[]>()
  for (const r of rows) {
    if (!r.origin_table || !r.origin_row_id || !LIVE_STATUS[r.origin_table]) continue
    if (!byTable.has(r.origin_table)) byTable.set(r.origin_table, [])
    const list = byTable.get(r.origin_table) as { sourceId: string; rowId: string }[]
    if (!list.some((x) => x.rowId === r.origin_row_id))
      list.push({ sourceId: r.source_id, rowId: r.origin_row_id })
  }
  const checkedAt = new Date().toISOString()
  await Promise.all(
    [...byTable.entries()].map(async ([table, wanted]) => {
      const def = LIVE_STATUS[table]
      const live = await d1Query<{ id: string; status: string | null }>(
        cfg,
        guard.databaseId,
        // R14 hard cap: `wanted` is at most the passages one answer carries, and
        // the LIMIT says so. Row ids come from this module's own rows.
        `SELECT id, ${def.status} AS status FROM ${def.table}
          WHERE id IN (${wanted.map((w) => sqlString(w.rowId)).join(", ")}) LIMIT ${wanted.length}`
      )
      const statusById = new Map(live.map((l) => [l.id, l.status]))
      for (const w of wanted) {
        const status = statusById.get(w.rowId)
        // A row that is GONE is news too — an answer built on a record that no
        // longer exists must say so rather than quoting it confidently.
        out.set(w.sourceId, {
          status: status ? String(status).replace(/_/g, " ") : "no longer in the app",
          checkedAt,
        })
      }
    })
  )
  return out
}
