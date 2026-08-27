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
import { countCollection } from "@shared/workers/count"
import { d1ExecScript, d1Query, likeLiteral, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { GuardError, type MemberGuard } from "@shared/workers/gating"
import { ulid } from "@shared/workers/id"
import { decodeCursor, keysetAfter, PAGE_SIZE, toPage, type Page } from "@shared/workers/paging"
import { orderBy, resolveOrdering, type Ordering, type SortMenu } from "@shared/workers/sorting"
import { numberVar } from "@shared/workers/limits"
import {
  DOCUMENT_LIMIT_BYTES,
  optionalDocument,
  optionalText,
  requireText,
  TEXT_LIMITS,
} from "@shared/workers/validate"
import type {
  KnowledgeAnswer,
  KnowledgeCitation,
  KnowledgePassage,
  KnowledgeSource,
} from "@shared/types"
import type { Env } from "../env"
import {
  CHUNK_TARGET_CHARS,
  chunkText,
  contentHash,
  encodeEmbedding,
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
export const KNOWLEDGE_KINDS = [
  "note",
  // A file somebody uploaded. The FILE is the truth and the body is a READING of
  // it, which is why it is its own kind rather than a note with a link on it: a
  // reader who disagrees with an answer needs to be able to tell the difference
  // between words a colleague typed and words a converter produced.
  "file",
  "ticket",
  // ARTICLE — a kind with no mirror behind it any more, and deliberately kept.
  // The Learning module was purged on 17 Aug 2026 and its table went with it,
  // but its 41 articles had already been indexed here, so the material outlived
  // the module. Dropping the kind would orphan those rows: the sweep no longer
  // writes one, and nothing reads `learning` — this word is only what an
  // existing source calls itself, and what a person filters by to find one.
  "article",
  "account",
  // The three record kinds the vector rebuild added — an app, a story and a
  // sprint each carry a summary, so the router knows what a record is ABOUT
  // before it searches.
  "app",
  "story",
  "sprint",
  // THE REST OF WHAT AN AGENCY KNOWS ABOUT A CLIENT. Six kinds that all carry an
  // account id and none of which the sweep could read: a conversation we had, the
  // map of what we actually DO for them, the person we talk to, what we are
  // waiting on them for, and our own jobs about them. `meeting` shipped its
  // reader before it was named here, so every transcript in the base was being
  // listed and filtered as a `note` — the coercion in `toSource` below is what
  // made that silent.
  "meeting",
  "process",
  "contact",
  "todo",
  "task",
  // The four that arrive through somebody's own Google connection. Named for
  // what a person would call the thing rather than for the service it came out
  // of — somebody filtering the knowledge base is looking for "an email", and
  // would have to translate "gmail" back into one. Built in
  // lib/knowledge-google.ts, which is where the readers beside them live.
  "document",
  "email",
  "event",
  "message",
] as const
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

/** WHAT A CHUNK IS WORTH WHEN IT LITERALLY CONTAINS THE REFERENCE SOMEBODY TYPED.
 *
 * `LEXICAL_WEIGHT` is a tenth of a vote, and it was measured: at parity the word
 * match drags an ORDINARY question's answer down nine points. That measurement
 * stands and this does not touch it — but it was taken on ordinary questions, and
 * a question carrying a rare exact token is not one.
 *
 * MEASURED, 27 Aug 2026, and it is the same failure the proportional floor was
 * blamed for and did not cause. "task 3144" answers perfectly: two words, so the
 * embedding of the question is essentially the embedding of "3144" and the vector
 * arm finds the right chunks by itself. Put that reference inside a sentence a
 * person would actually say — "could somebody remind me where things currently
 * stand with task 3144, and whether anybody has replied about it since last
 * week?" — and the embedding is dominated by the polite framing, the vector arm
 * returns three FluClinic meetings, and the word arm, which found the right chunk,
 * is outvoted ten to one by construction. So the fuller and more courteous the
 * question, the worse the answer: exactly backwards.
 *
 * 2, AND THE NUMBER IS DERIVED RATHER THAN CHOSEN. Parity (1) is not enough, and
 * a test with six chatty near-misses around one short handover note is what
 * showed it: a distractor that the vector arm ranks first AND the word arm also
 * returns scores 1/(K+1) + LEXICAL_WEIGHT/(K+2), while the reference chunk scores
 * EXACT_WEIGHT/(K+1) and nothing else, because it matched one term. So parity
 * loses by exactly the tenth of a vote the distractor collects twice over. The
 * break-even is
 *
 *     EXACT_WEIGHT > 1 + LEXICAL_WEIGHT × (K+1)/(K+2)  ≈  1.098
 *
 * and 2 is the next whole number, which leaves room for a distractor that ranks
 * well in both arms rather than only the one that ranks first in each.
 *
 * It is safe above parity ONLY because the token had to be rare to get here
 * (EXACT_TERM_MAX_CHUNKS): "2026" never reaches this line. */
const EXACT_WEIGHT = 2

/** Chunks the fused list hands on to be READ out of the database.
 *
 * IT IS A BUDGET FOR ATTRITION, and 24 was not enough of one. The sentence above
 * this line used to say "comfortably more than one answer carries, so the
 * personal fence and the excluded-source filter can drop rows without the answer
 * running short". The intent was right and the number was measured against
 * nothing.
 *
 * MEASURED, 27 Aug 2026, on the question the owner's complaint is clearest on.
 * "What did we agree in the week recap?" returns 100 neighbours over the
 * relevance floor, and FIFTEEN of them exist: the other 85 are vectors whose
 * source is no longer in the database at all, and the first surviving one is at
 * rank 17. So a pool of 24 was spending 16 of its 24 slots on rows that cannot
 * come back, and what little got through was another person's private calendar
 * material, dropped again by the reader clause. The base answered "we have
 * nothing on that" about a meeting it holds two 96-chunk transcripts of.
 *
 * ATTRITION IS NORMAL, NOT AN OUTAGE, and that is why this is a budget rather
 * than a bug to fix elsewhere. Three separate things thin the pool between the
 * index and the answer, and two of them are permanent by design: the personal
 * fence hides a colleague's own material, an excluded source stays excluded, and
 * a re-index leaves the ids it replaced behind (R26 makes those safe to meet —
 * they read back as no row — but safe is not the same as free, because a ghost is
 * still a nearest neighbour and still takes a slot).
 *
 * 100 is the whole candidate list, so the pool no longer throws away evidence
 * before finding out whether it survives. The cost is ONE read of at most 100
 * rows by primary key — the same single statement, a longer id list — against an
 * answer that carries six. R14 is satisfied by the LIMIT at the statement, which
 * says the number out loud. */
const RANKING_POOL = 100

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

/** HOW MANY OF THE ROUTER'S RECORDS THE LAST-RESORT READ OPENS.
 *
 * Fewer than the router names, deliberately. `ROUTER_TOP_RECORDS` decides what a
 * READER is told the question looks like it is about — a sentence somebody can
 * disagree with, so three is generous. This decides what gets READ when nothing
 * else found anything, and there a third guess is a paragraph from a
 * conversation that merely resembles the right one. The best two, and the
 * diversifier still has the final word on how many of each survive. */
const ROUTER_FALLBACK_RECORDS = 2

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

/** Chunks one source may hold — DERIVED from the ceiling the door enforces, not
 * chosen beside it, so the two numbers cannot disagree.
 *
 * It used to be 200 (about eight pages) and the CHUNKER enforced it by silently
 * returning fewer pieces than the text had. That is the exact shape the owner
 * ruled out: "the upload is REFUSED with a clear message, never silently
 * trimmed." The refusal now happens at the door — `optionalDocument`, in bytes,
 * before anything is saved — and this is only the backstop for material that
 * never passes a door, a mirrored row some import made enormous. `indexSource`
 * indexes what fits and RECORDS the overflow on the row in both numbers, because
 * making an existing record unfindable would be a worse answer than an
 * incomplete one, and neither may be silent.
 *
 * The 1.4 is headroom: text whose paragraphs are shorter than the target cuts
 * into more pieces than its length alone predicts. */
export const MAX_CHUNKS_PER_SOURCE = Math.ceil((DOCUMENT_LIMIT_BYTES / CHUNK_TARGET_CHARS) * 1.4)

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
  file_url: string | null
  file_name: string | null
  file_type: string | null
  file_bytes: number
  file_note: string | null
  owner_user_id: string | null
  visible_to_app_id: string | null
  visible_to_app_name: string | null
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
  record_date, title, summary, NULL AS body, body_bytes, source_url,
  file_url, file_name, file_type, file_bytes, file_note, owner_user_id,
  visible_to_app_id, (SELECT name FROM apps WHERE id = visible_to_app_id) AS visible_to_app_name, indexed_at,
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
    fileUrl: r.file_url,
    fileName: r.file_name,
    fileType: r.file_type,
    fileBytes: r.file_bytes,
    fileNote: r.file_note,
    // The FIELD a person edits is "who may this be read by", so the wire says
    // that rather than making every reader remember what two null ids mean.
    // Three settings, in narrowing order — private beats app, because a source
    // that is both is answerable to one person and the app half is noise.
    visibility: r.owner_user_id ? "private" : r.visible_to_app_id ? "app" : "team",
    ownerUserId: r.owner_user_id,
    visibleToAppId: r.visible_to_app_id,
    // The app's NAME rides the row so a list can say "only the people on
    // Dispatch" without fetching every app to look one id up.
    visibleToAppName: r.visible_to_app_name,
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

/** THE APP FENCE, as SQL — the middle setting the module was missing (12.3).
 *
 * The owner asked to "choose what information in the knowledge base is
 * accessible by whom", and the base had two answers: the whole team, or one
 * person. What was missing is the ordinary case in between — material somebody
 * wants kept off a wider audience INSIDE the agency without making it answerable
 * to themselves alone.
 *
 * IT RIDES A FENCE THE APP ALREADY HAS rather than inventing an access list. The
 * app record already decided who may open it (8.11: the staff on it, plus an
 * admin), and `app_staff` is where that lives. So a source can say "the people on
 * this app", and the sentence a reader must learn is one they already know from
 * every other screen. An access-control table would have been a second, parallel
 * answer to a question this codebase has already answered once.
 *
 * A SUBQUERY, NOT A RESOLVED LIST OF IDS — help.ts's `mineClause` made this
 * argument first and it is the same one: the staffed set is read INSIDE the
 * statement, so a list and the COUNT beside it can never be asked about two
 * different moments, and there is no unbounded `IN (…)` to cap. The admin half is
 * an `EXISTS` over the same statement for the same reason: one round trip, one
 * moment, and no second fetch to forget at a call site.
 *
 * A member staffed to nothing simply matches no restricted source, which is the
 * honest empty answer rather than an error. */
function appClause(guard: MemberGuard, prefix = ""): { sql: string; params: string[] } {
  const col = `${prefix}visible_to_app_id`
  return {
    sql: `(${col} IS NULL
        OR ${col} IN (SELECT app_id FROM app_staff WHERE user_id = ? AND deactivated_at IS NULL)
        OR EXISTS (SELECT 1 FROM member_roles WHERE is_default = 1 AND id = ?))`,
    params: [guard.userId, guard.roleId],
  }
}

/** BOTH FENCES, FOR A READ THAT CAN SEE THE SOURCE ROW. Every read on
 * `knowledge_sources` goes through here — the list, its count, one source by id,
 * and the passage read-back that decides what an answer is made of.
 *
 * WHY THE LEXICAL ARM DOES NOT USE IT, said here because this is where somebody
 * will look for the inconsistency. `knowledge_terms` carries copies of the
 * chunk's `compartment` and `owner_user_id` so stage one is a single-table read,
 * and it carries no app. Rather than denormalise a third column onto two tables
 * and re-index the world to back-fill it, the app half is decided where R26 says
 * decisions are made: the index (and the word-match beside it) NARROWS, and the
 * team's database DECIDES. A restricted chunk can reach the candidate pool and
 * cost a relevant passage its place; it cannot reach an answer, because the
 * read-back below is a join to `knowledge_sources` and this clause is on it. */
function readerClause(guard: MemberGuard, prefix = ""): { sql: string; params: string[] } {
  const owner = ownerClause(guard, `${prefix}owner_user_id`)
  const app = appClause(guard, prefix)
  return { sql: `${owner.sql} AND ${app.sql}`, params: [...owner.params, ...app.params] }
}

/** The sort a source list is keyed by: newest first, id breaking ties. */
const SOURCE_ORDER = "COALESCE(updated_at, created_at)"

/** WHAT THE KNOWLEDGE LIST MAY BE ORDERED BY (shared/workers/sorting.ts).
 * `touched` is the fallback — the order this list has always been in — and the
 * others are the three questions an agency asks of its own history: what is it
 * called, what kind of thing is it, and what is it FROM (which is not when it was
 * filed: a contract signed in March indexed in August is March's).
 *
 * The keys read the CONVERTED source rather than the raw row, because that is
 * what `toPage` is handed here — the menu pairs its SQL with the field that
 * mirrors it, and the field has to be one that exists at the point the cursor is
 * minted. */
export const KNOWLEDGE_SORTS: SortMenu<KnowledgeSource> = {
  touched: { expr: SOURCE_ORDER, dir: "desc", key: (s) => s.updatedAt ?? s.createdAt },
  added: { expr: "created_at", dir: "desc", key: (s) => s.createdAt },
  title: { expr: "title", dir: "asc", key: (s) => s.title },
  kind: { expr: "kind", dir: "asc", key: (s) => s.kind },
  dated: { expr: "COALESCE(record_date, created_at)", dir: "desc", key: (s) => s.recordDate ?? s.createdAt },
}

/** What a caller may narrow a source list to: the search box, the two words a
 * source is filed under, and whether it is still in use.
 *
 * `active` is an ALLOW-LIST of two words rather than a boolean, because it
 * arrives off a query string where everything is text and `"false"` is truthy.
 * "yes" is the sources the assistant may read; "no" is the ones somebody took
 * away and can put back (deactivate-never-delete, so they are still rows). */
export type SourceFilters = { kind?: string; compartment?: string; q?: string; active?: string }

/** THE FENCE PLUS THE FILTERS, built ONCE — because the list and the COUNT have
 * to be the same question. They were not: the count was the fence alone, so a
 * search answering with 12 sources was badged with the whole base's 3,400. R16
 * is about the badge being exact; it is exact about the wrong question if the
 * two clauses drift. One builder, no drift. */
function sourcesWhere(guard: MemberGuard, filter: SourceFilters): { sql: string[]; params: string[] } {
  const reader = readerClause(guard)
  const sql = [reader.sql]
  const params = [...reader.params]
  if (filter.kind) {
    sql.push("kind = ?")
    params.push(filter.kind)
  }
  if (filter.compartment) {
    sql.push("compartment = ?")
    params.push(filter.compartment)
  }
  // Not a parameter: the two words are matched against literals ABOVE this line
  // (the door's own allow-list), so what reaches the statement is our SQL and
  // never the caller's text.
  if (filter.active === "yes") sql.push("deactivated_at IS NULL")
  if (filter.active === "no") sql.push("deactivated_at IS NOT NULL")
  if (filter.q) {
    // The needle is a LIKE PATTERN, not just a bound value — likeLiteral is what
    // stops `%` meaning "everything" and an alternating pattern costing the
    // worker exponential time (see shared/workers/d1-rest.ts). It searches the
    // title and the SUMMARY rather than the body: a LIKE over 300-page documents
    // is a full scan of every byte the team owns, and the summary is the part
    // that says what each one is.
    sql.push(`(LOWER(title) LIKE ? ESCAPE '\\' OR LOWER(summary) LIKE ? ESCAPE '\\')`)
    const needle = `%${likeLiteral(filter.q.toLowerCase())}%`
    params.push(needle, needle)
  }
  return { sql, params }
}

/** The team's sources, newest first. R14 GROWING collection: keyset-PAGED, not
 * capped — the agency's own history alone is thousands of sources, so the door
 * answers "here is a page and where the next one starts" rather than refusing
 * past a ceiling. `cursor` is the opaque one from the previous page. */
export async function listSources(
  cfg: D1Rest,
  guard: MemberGuard,
  filter: SourceFilters,
  cursor: string | null,
  ordering: Ordering<KnowledgeSource> = resolveOrdering(KNOWLEDGE_SORTS, "touched", undefined, undefined)
): Promise<Page<KnowledgeSource>> {
  const narrowed = sourcesWhere(guard, filter)
  const where = [...narrowed.sql]
  const params: (string | number)[] = [...narrowed.params]
  // One ordering feeds the ORDER BY, the keyset predicate and the next cursor.
  const after = keysetAfter(decodeCursor(cursor, ordering.sig), ordering.expr, ordering.dir)
  if (after.sql) {
    where.push(after.sql)
    params.push(...after.params)
  }
  const rows = await d1Query<SourceRow>(
    cfg,
    guard.databaseId,
    `SELECT ${LIST_COLS} FROM knowledge_sources
      WHERE ${where.join(" AND ")}
      ${orderBy(ordering)} LIMIT ${PAGE_SIZE + 1}`,
    params
  )
  return toPage(rows.map(toSource), PAGE_SIZE, (s) => [ordering.key(s), s.id], ordering.sig)
}

/** R16: the exact server COUNT(*) for the badge — never rows.length. Carries the
 * same personal fence as the list, or the badge would count sources the reader
 * cannot see — and the same FILTERS, or a search's own count is a number about
 * somebody else's question. Called with no filter (the default) it is still the
 * whole collection's total, which is what the badge above the list shows.
 *
 * R16 (amended): counted exactly to TOTAL_COUNT_CAP through the one bounded
 * seam, then "at least". The filters ride the same WHERE, so a searched count
 * answers the searched question and is bounded on the same terms. */
export async function countSources(
  cfg: D1Rest,
  guard: MemberGuard,
  filter: SourceFilters = {}
): Promise<number> {
  const narrowed = sourcesWhere(guard, filter)
  return countCollection(
    cfg,
    guard.databaseId,
    `SELECT 1 FROM knowledge_sources WHERE ${narrowed.sql.join(" AND ")}`,
    narrowed.params
  )
}

/** One source by id, or null. */
export async function getSource(
  cfg: D1Rest,
  guard: MemberGuard,
  id: string
): Promise<KnowledgeSource | null> {
  const reader = readerClause(guard)
  const rows = await d1Query<SourceRow>(
    cfg,
    guard.databaseId,
    `SELECT ${DETAIL_COLS} FROM knowledge_sources WHERE id = ? AND ${reader.sql}`,
    [id, ...reader.params]
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
  /** WHICH APP'S PEOPLE may read this (12.3), or absent for the whole team.
   * Deliberately NOT the same field as `appId` on the row: that one is the
   * SWEEP's — it says what a mirrored source is about and is rewritten on every
   * pass — and a person's decision about who may read something cannot live in a
   * column a background job overwrites. */
  visibleToAppId?: unknown
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
  visibleToAppId: string | null
} {
  const privateToMe = input.visibility === "private"
  return {
    title: requireText(input.title, "Title", TEXT_LIMITS.short),
    body: optionalDocument(input.body, "The material") ?? null,
    sourceUrl: optionalText(input.sourceUrl, "Link", TEXT_LIMITS.link) ?? null,
    accountId: optionalText(input.accountId, "Account", TEXT_LIMITS.short) ?? null,
    privateToMe,
    // PRIVATE WINS, AND IT WINS HERE rather than in three write statements.
    // "Only me" and "only the people on this app" are two answers to one
    // question, so a caller sending both gets the narrower one stored — and the
    // row can then never be in a state the reader (`toSource`) has to guess at.
    visibleToAppId: privateToMe
      ? null
      : (optionalText(input.visibleToAppId, "App", TEXT_LIMITS.short) ?? null),
  }
}

/** THE APP A SOURCE MAY BE LIMITED TO must be one this caller can open — the
 * same sentence 8.11 says about the app record itself, asked of the same table.
 *
 * The failure path this closes is the boring one, and it is why the check is a
 * refusal rather than a silent store: somebody files a contract "for the people
 * on Dispatch", is not on Dispatch themselves, and has just written a source
 * they can no longer read, edit or take back. The fence has no exception for its
 * own author — a fence with one is not a fence — so the door refuses the move
 * instead of letting a person lock themselves out of their own material.
 *
 * ONE STATEMENT: the app must exist, and the caller must be staffed to it or
 * hold the locked Admin role. Same shape as the read fence, so the two can never
 * disagree about what "can open" means. */
async function requireOpenableApp(
  cfg: D1Rest,
  guard: MemberGuard,
  appId: string
): Promise<{ id: string; name: string }> {
  const app = appClause(guard)
  const rows = await d1Query<{ id: string; name: string }>(
    cfg,
    guard.databaseId,
    // R14: one row by primary key. `visible_to_app_id` in the fence is spelled by
    // `appClause`, so the id under test is aliased into that name.
    `SELECT id, name FROM (SELECT id, name, id AS visible_to_app_id FROM apps WHERE id = ?)
      WHERE ${app.sql} LIMIT 1`,
    [appId, ...app.params]
  )
  if (!rows[0])
    throw new GuardError(
      400,
      "invalid_input",
      "You can only limit a source to an app you are on, otherwise you'd be the first person locked out of it."
    )
  return rows[0]
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
  if (v.visibleToAppId) await requireOpenableApp(cfg, guard, v.visibleToAppId)
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
       owner_user_id, visible_to_app_id, record_date, created_at, creator_id, creator_email, creator_name)
     VALUES (?, 'note', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      v.visibleToAppId,
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

/** WRITE A SOURCE FROM AN UPLOADED FILE, and index whatever words came out of
 * it — the third way into the knowledge base.
 *
 * It is a sibling of `createSource` rather than a flag on it, because the two
 * differ in the one thing that matters here: what the TRUTH is. A note's truth
 * is its body, so an edit rewrites it. A file's truth is the file, so the body
 * is a READING that must always be traceable back to the thing it was read from
 * — which is why `fileUrl` is written in the same statement as the words, and
 * why `fileNote` is not optional in this function's shape.
 *
 * `extract.text` null is a first-class outcome, not a failure: the row is
 * written, the source is listed, `indexSource` finds no text and indexes nothing
 * — so `chunkCount` stays 0 and every screen reading it says "stored, not
 * searchable" without anybody having to remember to. The one thing that cannot
 * happen is a row that looks indexed and is not.
 *
 * THE BODY GOES IN AS A BOUND PARAMETER, for the reason `createSource` gives:
 * D1 refuses a statement over 100 KB and the material here can be a megabyte. */
export async function createFileSource(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  input: {
    title: string
    accountId: string | null
    privateToMe: boolean
    /** 12.3: limit it to the people on one app. Ignored when `privateToMe` — the
     * narrower answer wins, exactly as it does for a typed note. */
    visibleToAppId?: string | null
    file: { url: string; name: string; type: string; bytes: number }
    extract: { text: string | null; note: string | null }
  }
): Promise<string> {
  const account = input.accountId ? await requireAccount(cfg, guard, input.accountId) : null
  const visibleToAppId = input.privateToMe ? null : (input.visibleToAppId ?? null)
  if (visibleToAppId) await requireOpenableApp(cfg, guard, visibleToAppId)
  const id = ulid()
  const now = new Date().toISOString()
  const compartment = account ? accountCompartment(account.id) : AGENCY_COMPARTMENT
  const summary = buildSummary({
    noun: "file",
    title: input.title,
    accountName: account?.name ?? null,
    // A file we could not read still gets a summary, and the note IS the honest
    // one: "we keep presentations but can't read their words" is a true sentence
    // about this record, and the router prefers records it can describe.
    detail: input.extract.text ?? input.extract.note ?? "",
  })
  await d1Query(
    cfg,
    guard.databaseId,
    `INSERT INTO knowledge_sources (id, kind, compartment, account_id, title, summary, body, body_bytes,
       file_url, file_name, file_type, file_bytes, file_note,
       owner_user_id, visible_to_app_id, record_date, created_at, creator_id, creator_email, creator_name)
     VALUES (?, 'file', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      compartment,
      input.accountId,
      input.title,
      summary,
      input.extract.text,
      byteLength(input.extract.text),
      input.file.url,
      input.file.name,
      input.file.type,
      input.file.bytes,
      input.extract.note,
      input.privateToMe ? guard.userId : null,
      visibleToAppId,
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
    // The history says which of the two happened, because "we have that file"
    // and "the assistant can answer from that file" are different promises and
    // somebody will one day need to know which one was made.
    description: `${actor.name} uploaded "${input.file.name}" to the knowledge base${
      input.extract.text ? "" : ", kept, but not searchable"
    }`,
    relatedTable: "knowledge_sources",
    relatedRowId: id,
  })
  return id
}

/** Correct a source. A MIRRORED source's body belongs to the row it mirrors, so
 * only its filing (which client, who may read it) is editable here — the sweep
 * would overwrite anything else on its next tick, which would be a worse lie
 * than refusing. An UPLOADED FILE's body belongs to the file, so everything but
 * the words is editable, including its name. A typed note is editable in full. */
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
  if (v.visibleToAppId) await requireOpenableApp(cfg, guard, v.visibleToAppId)
  // WHOSE WORDS ARE THESE? Two families answer "not this form's": a MIRRORED
  // source, whose row the sweep would overwrite an edit from; and an UPLOADED
  // FILE, whose truth is the file — its body is a READING of it, and a form is
  // not where a reading is corrected.
  //
  // For the file the argument is sharper than "the sweep would undo it", and it
  // is a real trap rather than a principle: a detail screen is handed only as
  // much body as a person can read (DETAIL_COLS caps it), so a form prefilled
  // from that and saved back would write the EXCERPT over the document — a
  // 300-page contract silently becoming its first eight pages, with the file
  // still sitting there looking untouched. Filing and visibility stay editable,
  // which is everything a person actually wants to change about a file.
  const mirrored = before.originRowId !== null
  const fileBacked = before.fileUrl !== null
  // The TITLE is a different question from the WORDS, and a file answers the two
  // differently: its words belong to it, but nothing owns what we call it — so a
  // file source can be renamed and a mirrored one cannot (the sweep would put
  // the row's own name straight back).
  const title = mirrored ? before.title : v.title
  // A mirrored source's body is never read back here (the list does not carry it
  // and the detail carries only as much as a screen shows), so an edit leaves
  // the stored body alone rather than writing an excerpt over the document.
  const compartment = account ? accountCompartment(account.id) : AGENCY_COMPARTMENT
  const owner = v.privateToMe ? guard.userId : null
  // WHO MAY READ IT is one decision with three answers, and all three families
  // below carry it — a MIRRORED source's filing is exactly the thing that stays
  // editable when its words do not, and limiting a file to one app's people is
  // the commonest reason anybody opens this form at all.
  const visibleToApp = v.visibleToAppId
  const now = new Date().toISOString()
  if (mirrored) {
    await d1Query(
      cfg,
      guard.databaseId,
      `UPDATE knowledge_sources SET account_id = ?, compartment = ?, owner_user_id = ?,
         visible_to_app_id = ?, updated_at = ?,
         editor_id = ?, editor_email = ?, editor_name = ? WHERE id = ?`,
      [v.accountId, compartment, owner, visibleToApp, now, actor.id, actor.email, actor.name, id]
    )
  } else if (fileBacked) {
    // Everything but the words. The body and its summary are left exactly as the
    // reading produced them, for the reason above.
    await d1Query(
      cfg,
      guard.databaseId,
      `UPDATE knowledge_sources SET title = ?, source_url = ?, account_id = ?, compartment = ?,
         owner_user_id = ?, visible_to_app_id = ?, updated_at = ?,
         editor_id = ?, editor_email = ?, editor_name = ? WHERE id = ?`,
      [
        title,
        v.sourceUrl,
        v.accountId,
        compartment,
        owner,
        visibleToApp,
        now,
        actor.id,
        actor.email,
        actor.name,
        id,
      ]
    )
  } else {
    await d1Query(
      cfg,
      guard.databaseId,
      `UPDATE knowledge_sources SET title = ?, body = ?, body_bytes = ?, summary = ?, source_url = ?,
         account_id = ?, compartment = ?, owner_user_id = ?, visible_to_app_id = ?, updated_at = ?,
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
        visibleToApp,
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
    {
      label: "Visible to",
      from: before.visibility,
      to: owner ? "private" : visibleToApp ? "app" : "team",
    },
    {
      label: "Body",
      from: before.body,
      to: mirrored || fileBacked ? before.body : v.body,
      hideValues: true,
    },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Knowledge source edited",
    description: `${actor.name} corrected "${title}" in the knowledge base${changes ? `, ${changes}` : ""}`,
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
 * orphan vectors nothing will ever overwrite.
 *
 * `fromSeq` IS THE DIFFERENCE BETWEEN TAKING A SOURCE AWAY AND REBUILDING IT.
 * Taking it away clears everything (`fromSeq` 0, the default). A REBUILD passes
 * the new chunk total and clears only the TAIL — the sequences the new text no
 * longer has — because every id from 0 upwards is about to be overwritten in
 * place by a write that says so (`ON CONFLICT (id) DO UPDATE`, below). Deleting
 * them first bought nothing and cost the one thing that matters here: while a
 * rebuild is mid-flight the material is GONE, so a second rebuild starting a
 * second later — the owner pressing "Bring it in" while the fifteen-minute
 * sweep is running — used to delete the pieces the first one had already
 * written. Overwrite-in-place plus a tail trim converges instead: two rebuilds
 * of the same text write the same bytes to the same ids, in any order. */
async function clearIndex(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  sourceId: string,
  known?: { chunkCount: number; indexedChunks: number },
  fromSeq = 0
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
    // The record's own cover goes either way: a rebuild re-embeds it a moment
    // later (and a source that LOST its summary must not keep the old one).
    recordVectorId(sourceId),
    ...Array.from({ length: Math.max(written - fromSeq, 0) }, (_, i) =>
      chunkVectorId(sourceId, fromSeq + i)
    ),
  ])
  await d1Query(
    cfg,
    guard.databaseId,
    "DELETE FROM knowledge_terms WHERE chunk_id IN (SELECT id FROM knowledge_chunks WHERE source_id = ? AND seq >= ?)",
    [sourceId, fromSeq]
  )
  await d1Query(cfg, guard.databaseId, "DELETE FROM knowledge_chunks WHERE source_id = ? AND seq >= ?", [
    sourceId,
    fromSeq,
  ])
  // A TAIL TRIM DOES NOT TOUCH THE COUNTERS: its caller sets all four in the
  // very next statement, and zeroing them here would open a window where the
  // row says "nothing indexed" about a source whose chunks are still there.
  if (fromSeq) return
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
 * the words a person would actually use.
 *
 * WITH ONE EXCEPTION, AND IT IS THE WHOLE OF THE UPLOAD PROMISE. A FILE we could
 * not read has no body, and indexing it on its TITLE alone would produce a
 * source with one searchable piece containing nothing but its own name — which
 * is precisely the state this feature is built never to reach. A real upload
 * proved it rather than a test: a .pptx came back "stored, not searchable" in
 * words and `chunkCount: 1` in the same row, so the screen that derives "stored,
 * not searchable" from the count would have called it searchable, and the
 * assistant could have cited a deck it had not read a word of. A title is not
 * material. An unreadable file indexes to nothing, and the number on the row
 * says so. */
export function indexableText(source: {
  title: string
  body: string | null
  file_url?: string | null
}): string {
  if (source.file_url && !source.body) return ""
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
function embeddableText(_source: unknown, chunk: string): string {
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
    // `file_url` rides along because `indexableText` needs it: a file with no
    // body indexes to nothing, and the difference between "no body" and "a file
    // with no body" is the difference between a note somebody left blank and a
    // document we could not read.
    `SELECT id, kind, title, summary, body, file_url, compartment, account_id, app_id, ticket_id, sprint_id, record_date,
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
    // Only the tail — everything below `total` is overwritten in place by the
    // write below. See clearIndex for why razing it first was the bug.
    await clearIndex(
      env,
      cfg,
      guard,
      sourceId,
      { chunkCount: source.chunk_count, indexedChunks: source.indexed_chunks },
      total
    )
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
      const batch = piece.slice(start, start + CHUNK_WRITE_BATCH)
      const ids = batch.map((_, offset) => chunkVectorId(sourceId, from + start + offset))
      // THE POSTINGS THIS BATCH IS ABOUT TO REPLACE. A chunk keeps its id when
      // its text changes, so its old words would otherwise stay in the inverted
      // index pointing at a piece that no longer contains them. On a first write
      // this matches nothing; it is one statement per twenty chunks either way.
      const statements: string[] = [
        `DELETE FROM knowledge_terms WHERE chunk_id IN (${ids.map(sqlString).join(", ")});`,
      ]
      batch.forEach((chunk, offset) => {
        const seq = from + start + offset
        const chunkId = ids[offset]
        const vector = vectors[start + offset]
        // WRITING THE SAME PIECE TWICE IS NOT AN ERROR (R17's discipline, on the
        // one write in this app whose key is DERIVED rather than minted). The id
        // is `<sourceId>:<seq>`, so the same slice re-run — by a retry inside the
        // data door after a request that had already landed, by a tick that wrote
        // its chunks and died before it could record how far it got, or by a
        // second sweep started while this one is running — computes the same ids
        // and used to hit `UNIQUE constraint failed: knowledge_chunks.id`. Now it
        // overwrites, and the guard on the DO UPDATE means an IDENTICAL rewrite
        // moves zero rows and says nothing. `created_at` is deliberately not in
        // the SET list: a piece was first indexed when it was first indexed.
        statements.push(
          `INSERT INTO knowledge_chunks (id, source_id, compartment, owner_user_id, seq, text, embedding, created_at) VALUES (${sqlString(chunkId)}, ${sqlString(sourceId)}, ${sqlString(source.compartment)}, ${sqlString(source.owner_user_id)}, ${seq}, ${sqlString(chunk)}, ${sqlString(vector ? encodeEmbedding(vector) : null)}, ${sqlString(now)})
             ON CONFLICT (id) DO UPDATE SET compartment = excluded.compartment, owner_user_id = excluded.owner_user_id, text = excluded.text, embedding = excluded.embedding
             WHERE knowledge_chunks.text IS NOT excluded.text OR knowledge_chunks.embedding IS NOT excluded.embedding OR knowledge_chunks.compartment IS NOT excluded.compartment OR knowledge_chunks.owner_user_id IS NOT excluded.owner_user_id;`
        )
        for (const [term, weight] of tokenise(chunk))
          statements.push(
            `INSERT INTO knowledge_terms (term, chunk_id, compartment, owner_user_id, weight) VALUES (${sqlString(term)}, ${sqlString(chunkId)}, ${sqlString(source.compartment)}, ${sqlString(source.owner_user_id)}, ${weight})
               ON CONFLICT (term, chunk_id) DO UPDATE SET compartment = excluded.compartment, owner_user_id = excluded.owner_user_id, weight = excluded.weight;`
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

async function deriveCompartment(
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
  // THE REASONING IS HELD TO THE SAME FLOOR AS THE ANSWER. A vector search always
  // returns a nearest neighbour, and this one had no floor at all — so the
  // sentence that rides every answer said "it reads like a question about X, Y,
  // Z" for EVERY question, including the ones the base has nothing on. Asked
  // "what is the capital of France?", the app's own documents come back at 0.32
  // and the reader was told the question was about three of them, next to a
  // refusal. Under R23 the reasoning is part of the answer, so it cannot assert a
  // subject on evidence the answer itself would throw away.
  const near = hits.filter((h) => h.score >= numberVar(env.KNOWLEDGE_MIN_SCORE, MIN_VECTOR_SCORE))
  if (!near.length) return { ...choice, records: [] }
  // In the order the SEARCH put them, best first. Reading them back off the Map
  // handed them over in whatever order the database returned, so "best first" —
  // which is what the sentence claims — was a coincidence of row order.
  const ids = near.map((h) => h.id.replace(/:summary$/, ""))
  const titles = await sourceTitles(cfg, guard, ids)
  const records = ids.flatMap((sourceId) => {
    const title = titles.get(sourceId)
    return title ? [{ sourceId, title }] : []
  })
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
  /** THE ANSWER, ALREADY WRITTEN, when somebody asked for one — composed from the
   * very passages below and nothing else (lib/knowledge-compose.ts). It arrives as
   * an INPUT rather than being produced here, which is the whole of R23 in one
   * line: retrieval still writes nothing, and the decision about whether a written
   * answer may exist is made in the same breath as `found`. No citation, no
   * passage, no answer — one decision, not three. */
  written?: string | null
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
        // THE RECORD ITSELF, one hop past the source. Copied from the passage
        // rather than worked out again here, so the link under a passage and the
        // link under its citation can never point at different rows.
        recordPath: p.recordPath,
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
            ? ` I checked the live record${stale.length === 1 ? "" : "s"} just now. Say what ${stale.length === 1 ? "it says" : "they say"} today, not what the passage says.`
            : ""
        }`
      : "The knowledge base has nothing on this. Say so plainly, do not answer from memory.",
    // A WRITTEN ANSWER CANNOT OUTLIVE ITS SOURCES. It rides the same `found` the
    // passages do, so there is no input at all — not a bug, not a caller mistake
    // — that produces confident prose with nothing behind it.
    answer: found ? (input.written ?? null) : null,
    compartments: input.compartments,
    reason: input.reason,
    records: input.records,
    passages: found ? input.passages : [],
    citations,
    candidates: input.candidates,
  }
}

type CandidateRow = {
  chunk_id: string
  lex: number
  /** How many of the question's RARE exact tokens this chunk contains. Zero for
   * every chunk of a question that had none, which is what keeps `fuse`'s
   * measured behaviour on an ordinary question untouched. */
  exact: number
}

/** How much of a question a chunk must actually CONTAIN before the word match
 * will call it evidence.
 *
 * The vector arm has a floor (MIN_VECTOR_SCORE) and the word arm needs one for
 * the same reason: a chunk sharing one word out of eight is not an answer, it is
 * a coincidence, and without a floor "we have nothing on that" would become
 * impossible to say the moment the word arm was allowed to run alone. Its only
 * honest unit is how many of the question's own terms are in it. */
const MIN_TERM_SHARE = 0.5

/** A question with no room in it for a SHARE. Measured on staging: "What is the
 * capital of France?" tokenises to two terms, and half of two is one — so the
 * knowledge base answered a question about France out of whatever it held that
 * said "capital", confidently, with citations. A share is a proportion, and a
 * proportion of two is not a floor; below this many terms the only honest
 * requirement is all of them. */
const SHORT_QUESTION_TERMS = 3

/** WHY THE WORD MATCH IS RUNNING — three situations, and it may claim something
 * different in each. It used to be a boolean, and the two cases it collapsed
 * together are opposites. */
type LexicalRole =
  /** The vector arm has evidence. This is a tenth of a vote on a list somebody
   * else decided the shape of, and cannot turn a refusal into an answer. */
  | "beside"
  /** NOBODY LOOKED. No vector store bound, the question could not be embedded,
   * or the index came back with no neighbours at all — which is what a base
   * whose material was indexed while the model was down looks like. The word
   * match really is everything we have. */
  | "blind"
  /** THE VECTOR ARM LOOKED AND FOUND NOTHING. Not ignorance: an answer. To speak
   * here is to overturn a semantic search that has already reported the base
   * holds nothing on this. */
  | "overruling"

/** HOW MUCH OF THE QUESTION A CHUNK MUST HOLD — and it is not one number,
 * because the word arm has three jobs and only one of them can lie.
 *
 * BESIDE the vector arm it is a tenth of a vote on a list the vector arm already
 * decided the shape of. It cannot turn a refusal into an answer, so a share is
 * enough and the measured 0.5 stands.
 *
 * BLIND, it decides `found` on its own — the one decision R23 is about — and a
 * short question has to be present in FULL: "capital of France" must mean a
 * chunk that says both, or the base says it has nothing. Beyond that a share,
 * because this is the case where the word match is the only reader the material
 * has and the material is really there (a note written while the model was down
 * is findable by its words alone, deliberately, and there is a test that says
 * so).
 *
 * OVERRULING, the WHOLE question, however long. Measured 27 Aug 2026 on the
 * agency's own material: "what is our parental leave policy and how much notice
 * does it need?" — a policy nobody has ever written down — put the vector arm's
 * best neighbour at 0.451 against a floor of 0.5, so it correctly found nothing.
 * The word match then cleared a proportional floor on "policy", "notice" and
 * "leave" and answered out of a page of Gemini meeting notes. A proportion is
 * the wrong instrument for overturning a search that has already answered: half
 * a question is a coincidence three words wide. The exception is the one thing
 * the word match is genuinely better at, and it is not here — a rare exact token
 * bypasses this floor entirely (see the `rare` clause in `lexicalArm`), which is
 * how "ticket 3144" still reaches its chunk under the strictest of the three.
 *
 * WHAT THIS DOES NOT TOUCH, measured against the real model (bge-m3): a question
 * the base can answer clears the VECTOR floor and is `beside`, never either of
 * the other two. Over the twenty questions in scripts/kb-bench.mjs, every one of
 * the sixteen answerable ones tops 0.502 and every one of the four unanswerable
 * ones tops 0.471 — so the only questions whose behaviour changes here are the
 * ones the vector arm had already refused. */
function termFloor(terms: number, role: LexicalRole): number {
  const share = Math.max(1, Math.ceil(terms * MIN_TERM_SHARE))
  if (role === "beside") return share
  if (role === "overruling") return terms
  return terms <= SHORT_QUESTION_TERMS ? terms : share
}

/** HOW MANY CHUNKS A TOKEN MAY APPEAR IN AND STILL BE "EXACT".
 *
 * `termFloor` says a chunk sharing one word out of eight is a coincidence. The
 * exact-term bypass says THIS word is not a coincidence — and rarity is the only
 * honest way to tell those two apart, because both arrive as a token with a digit
 * in it. A reference identifies one thing; a year identifies a twelfth of the
 * base.
 *
 * 100 IS MEASURED, and the first number here (20) was not — it was a guess, and
 * it was wrong in the direction that matters: it silently switched the bypass OFF
 * for the very reference the bypass was built for. Ticket 3144 is discussed
 * across a dozen records — the meetings about it, their Gemini notes, the
 * calendar invitations — and lands in 56 chunks, so a cap of 20 excluded it and
 * the fix shipped green while the case it was for still failed.
 *
 * The distribution, over the 6,372 digit-bearing terms in the agency's own base
 * (27 Aug 2026), is why 100 rather than any nearby number:
 *
 *      1-20 chunks   6,321 terms      references, amounts, codes
 *     21-60             31            3144 (56) sits here
 *     61-100             5            almost nothing
 *    101-200             9            2027 (170), 2025 (265)
 *      200+              6            2026 (1,424), and format debris
 *                                     ("000z", "30pm", "2fkolkata")
 *
 * The boundary sits in the sparsest band there is, so it is not balanced on a
 * knife edge: moving it to 80 or to 120 changes which side five terms fall on.
 *
 * COUNTED IN CHUNKS RATHER THAN SOURCES, deliberately. Sources is the truer unit
 * — 3144 is 27 sources against 2026's 1,062, an even cleaner separation — but it
 * costs a join from the postings table to the chunks table inside the hot read,
 * and the chunk count separates these two populations perfectly well. If a single
 * enormous document ever makes a real reference look common, sources is the
 * upgrade, and this comment is where to start. */
const EXACT_TERM_MAX_CHUNKS = 100

/** THE TOKENS SOMEBODY TYPED EXACTLY — the digit-bearing subset of the question,
 * which is the definition `questionTerms` itself already sorts by ("rarer-looking
 * words, and anything with a digit in it — a reference, a date, an invoice
 * number — first").
 *
 * NARROWER THAN `hasExactTerm` ON PURPOSE, and the two are answering different
 * questions. That one decides whether the word match RUNS beside the vector arm,
 * and a quoted phrase is good evidence that somebody wants a literal match. This
 * decides which single token may carry a chunk over the proportional floor ALONE,
 * and the words inside a quoted phrase are ordinary words: letting `forms` out of
 * "gravity forms" waive the floor would reinstate the coincidence the floor
 * exists to refuse. */
export function exactTerms(question: string): string[] {
  return questionTerms(question, MAX_QUESTION_TERMS).filter((t) => /\d/.test(t))
}

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
  /** The digit-bearing subset of `terms` — see `exactTerms`. A chunk holding one
   * of these, and rare enough for it to mean something, is evidence whatever the
   * proportional floor says. */
  exact: string[],
  compartments: string[],
  /** What this list is FOR — see `termFloor`, which is where the three jobs stop
   * being the same job. */
  role: LexicalRole
): Promise<CandidateRow[]> {
  if (!terms.length) return []
  const owner = ownerClause(guard)
  const where = [`term IN (${terms.map(() => "?").join(", ")})`, owner.sql]
  const params: (string | number)[] = [...terms, ...owner.params]
  if (compartments.length) {
    where.push(`compartment IN (${compartments.map(() => "?").join(", ")})`)
    params.push(...compartments)
  }
  // THE ONE CLAUSE THAT LETS AN EXACT TERM PAST THE PROPORTIONAL FLOOR, and it
  // is absent — statement for statement, parameter for parameter — from a
  // question that has no exact term in it. The floor's measured behaviour on
  // every other question is therefore untouched by this, which is the whole of
  // what the no-exact-term case is promised.
  //
  // The exact tokens are bound AFTER the WHERE's, because SQLite numbers `?` by
  // where it appears in the text and `rare` is written after the scoped read.
  const rare = exact.filter((t) => terms.includes(t))
  const bypass = rare.length
    ? `OR SUM(CASE WHEN term IN (SELECT term FROM rare) THEN 1 ELSE 0 END) > 0`
    : ""
  if (rare.length) params.push(...rare)
  const rows = await d1Query<CandidateRow>(
    cfg,
    guard.databaseId,
    // R14 hard cap: the lexical arm returns at most LEXICAL_TOP_K rows, whatever
    // the compartment holds. The statement binds at most 24 terms + 1 owner + a
    // handful of compartments + at most those same 24 terms again for the exact
    // list — 53 or so against D1's ceiling of 100, and the term list is capped at
    // MAX_QUESTION_TERMS precisely so this arithmetic stays true.
    //
    // `COUNT(*)` counts the DISTINCT terms of the question this chunk contains;
    // the primary key is (term, chunk_id), so a row per term is a term. That is
    // the number the floor is expressed in — SUM(weight) says how loudly a chunk
    // matched, and only this says how MUCH of the question it answered.
    //
    // THE FLOOR IS A `HAVING`, NOT A FILTER ON WHAT CAME BACK, and that is the
    // second half of the same bug. Filtering afterwards meant the LIMIT chose the
    // ten LOUDEST chunks first and the floor then threw most of them away — so a
    // chunk holding every word of the question could be cut before the floor ever
    // saw it, by ten chunks that repeated one word. Deciding eligibility in the
    // statement makes the ten a page of chunks that already qualify. The number
    // is derived from the question's own term count and is an integer, so it is
    // interpolated like every other server-owned value (CONVENTIONS).
    //
    // THE EXACT TOKEN LEADS THE ORDER, and without that the weight below buys
    // nothing. `lex` is the SUM of term weights, so a chunk echoing a dozen of
    // the question's ordinary words ("could", "somebody", "currently", "week")
    // outranks the one chunk that holds the reference, which matched a single
    // term. Fusion is by RANK, so losing the order loses the fight before the
    // weight is ever applied — which is what a test with six chatty near-misses
    // around one short handover note showed the moment it was written. On a
    // question with no rare exact token `exact` is the literal 0 for every row,
    // so this is `ORDER BY lex DESC` exactly as it was measured.
    `WITH scoped AS (
       SELECT chunk_id, term, weight FROM knowledge_terms WHERE ${where.join(" AND ")}
     )${
       rare.length
         ? `, rare AS (
       SELECT term FROM scoped WHERE term IN (${rare.map(() => "?").join(", ")})
        GROUP BY term HAVING COUNT(*) <= ${EXACT_TERM_MAX_CHUNKS}
     )`
         : ""
     }
     SELECT chunk_id, SUM(weight) AS lex, ${
       rare.length ? "SUM(CASE WHEN term IN (SELECT term FROM rare) THEN 1 ELSE 0 END)" : "0"
     } AS exact FROM scoped
      GROUP BY chunk_id HAVING COUNT(*) >= ${termFloor(terms.length, role)} ${bypass}
      ORDER BY exact DESC, lex DESC LIMIT ${LEXICAL_TOP_K}`,
    params
  )
  return rows
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
    fused.set(
      row.chunk_id,
      // A TENTH OF A VOTE, UNLESS THE CHUNK HOLDS THE REFERENCE ITSELF. See
      // EXACT_WEIGHT: the tenth was measured on ordinary questions and still
      // stands for them, and `exact` is zero for every chunk of every question
      // that carried no rare exact token — so nothing measured moves.
      (fused.get(row.chunk_id) ?? 0) +
        (row.exact > 0 ? EXACT_WEIGHT : LEXICAL_WEIGHT) / (RRF_K + rank + 1)
    )
  )
  return [...fused.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
}

/** Answer a question from the team's own material.
 *
 * IT STILL GENERATES NO PROSE. It finds the passages and their citations; if the
 * caller passed a `compose` writer, that writer is handed EXACTLY the evidence the
 * reader will see and hands back a paragraph — which is R23's own sentence ("the
 * assistant composes the reply with those in front of it") made into a parameter
 * instead of a habit. Nothing here can promote a near-miss, invent a source, or
 * turn a refusal into an answer, because the writer is only ever reached AFTER
 * `found` is already true. */
export async function retrieve(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  input: {
    question: string
    accountId?: string | null
    limit?: number
    /** WRITE THE ANSWER OUT. Absent means the caller wants the evidence only, which
     * is what every caller wanted until the Knowledge tab started answering in
     * words — and is still what an assistant wants, because it writes its own
     * reply. It costs a model call, so the door that supplies it is the door that
     * gates and meters it (routes/knowledge.ts); this function only decides
     * WHETHER there is anything worth writing about. */
    compose?: (material: KnowledgePassage[], sources: KnowledgeCitation[]) => Promise<string | null>
  }
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
  const floor = numberVar(env.KNOWLEDGE_MIN_SCORE, MIN_VECTOR_SCORE)
  const vector = hits.filter((h) => h.score >= floor)



  // WHEN THE WORD MATCH RUNS — and the answer turns on a distinction the old
  // version of this comment did not draw.
  //
  // BESIDE THE VECTOR ARM it is easy: the question contains something EXACT (a
  // reference, an invoice number), so it runs quietly at a tenth of a vote,
  // because "exactly this string" is the one thing an embedding is indifferent
  // to. Nothing below changes that case.
  //
  // ── WHEN THE VECTOR ARM CAME BACK EMPTY, WHICH IS TWO SENTENCES ───────────
  //
  // This used to be one condition (`!vector.length`) covering four situations it
  // called identical: no store bound, the question could not be embedded, the
  // material has no vector because it was indexed while the model was down, or
  // nothing in the base cleared the floor. The first three are IGNORANCE — we
  // did not look, so the word match really is everything we have. The fourth is
  // an ANSWER: a semantic search ran over the whole compartment and reported
  // that nothing in it is about this. Treating an answer as ignorance let the
  // word match overturn it, on shared common words, into a confident reply.
  //
  // MEASURED, 27 Aug 2026, over the agency's own material. Asked "what is our
  // parental leave policy and how much notice does it need?" — a policy the base
  // does not hold and nobody has ever written down — the vector arm topped out
  // at 0.451 against a floor of 0.5 and correctly found nothing. The word arm
  // then ran as sole evidence, cleared the proportional floor on "policy",
  // "notice" and "leave", and answered out of a page of Gemini meeting notes.
  // That is precisely the failure R23 exists to prevent, arriving through the
  // one door that was left open for it.
  //
  // So a search that LOOKED and found nothing stands, with one exception, and it
  // is the same exception the word match exists for: a rare exact token. An
  // embedding is indifferent to "3144" and the inverted index is not, so that
  // one case may still speak. Everything else — a question of ordinary words the
  // semantic search has already answered — is a refusal.
  //
  // The strict floor (`termFloor`'s `sole` branch — a short question present in
  // FULL) still applies whenever the word match stands alone, and is now the
  // second line rather than the only one.
  const role: LexicalRole = vector.length
    ? "beside"
    : !asked || !hasVectorStore(env) || !hits.length
      ? "blind"
      : "overruling"
  const lexical =
    role !== "beside" || hasExactTerm(question)
      ? await lexicalArm(cfg, guard, terms, exactTerms(question), route.compartments, role)
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
  // BOTH FENCES, ON THE SOURCE ROW. The personal one used to be read off the
  // CHUNK's copy of it; it is read off `s` now so that the two halves of "who may
  // read this" are one clause in one place, on the row that owns the decision.
  // The chunk's copy is a denormalisation for the word-match's single-table read,
  // never the authority (see readerClause).
  const reader = readerClause(guard, "s.")
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
        AND s.deactivated_at IS NULL AND ${reader.sql}
      LIMIT ${RANKING_POOL}`,
    reader.params
  )

  // ── WHAT SURVIVED THE READ, AND WHAT TO DO WHEN NOTHING DID ──────────────
  //
  // THE FAULT, isolated on staging on 20 Aug 2026. Three phrasings of one
  // question, one transcript, indexed and chunked:
  //
  //   "Ishita and Alaap one-to-one"                          -> 6 passages
  //   "What was decided in the Ishita and Alaap meeting?"     -> 3 passages
  //   "What was decided in the Ishita and Alaap one-to-one?"  -> NOTHING
  //
  // The refusal came back carrying `candidates: 2` and this sentence: "It reads
  // like a question about \"Ishita x Alaap\"." So the search DID find two
  // chunks and the router DID name the right record — and the answer was still
  // "the knowledge base has nothing on this".
  //
  // Two ids came out of the vector store and NEITHER was in the database. The
  // source itself is wide open (`owner_user_id` null, `visible_to_app_id` null,
  // compartment `agency`, one live chunk), so no fence dropped them: the ids
  // simply no longer exist. Re-indexing replaces a source's chunks — new rows,
  // new ids — and the store can still answer with the ids of the ones it
  // replaced. R26 is what makes that survivable rather than dangerous: the index
  // NARROWS and the database DECIDES, so a ghost id reads back as no row instead
  // of as somebody else's paragraph. But "no row" was being reported as "nothing
  // to say", which is a different and much worse sentence.
  //
  // So when nothing survives the read, the covers get the last word. Those
  // record ids already cleared the SAME floor in `deriveRoute`, and their chunks
  // are read from D1 by source — rows that exist by construction, because the
  // database is what just handed them over.
  //
  // WHY THIS DOES NOT CONTRADICT THE NOTE ON `records`, which says the router's
  // guess "rides the ANSWER and never the ranking — a wrong guess here is
  // something a reader can disagree with, not something that hid the passage".
  // That rule exists so a wrong guess cannot HIDE a passage. This runs only when
  // there is no passage left to hide; it cannot reorder anything, because there
  // is nothing to reorder. And if the covers found no record over the floor —
  // which is what a question the base has nothing on produces — it does not run,
  // and the refusal stands exactly as it always did.
  let ranked = diversify(rankPassages(fused, rows), want)
  if (!ranked.length && route.records.length) {
    const named = route.records.slice(0, ROUTER_FALLBACK_RECORDS).map((r) => r.sourceId)
    const revived = await d1Query<ScoredRow>(
      cfg,
      guard.databaseId,
      // The SAME fence and the SAME columns as the read above — a second way in
      // may not be a wider one. R14: bounded by RANKING_POOL, said here.
      `SELECT c.id, c.source_id, c.seq, c.text, s.title, s.kind, s.source_url, s.compartment,
              s.origin_table, s.origin_row_id
         FROM knowledge_chunks c JOIN knowledge_sources s ON s.id = c.source_id
        WHERE c.source_id IN (${named.map((id) => sqlString(id)).join(", ")})
          AND s.deactivated_at IS NULL AND ${reader.sql}
        ORDER BY c.seq LIMIT ${RANKING_POOL}`,
      reader.params
    )
    // Scored on the scale `fuse` uses, in the order the router put the records
    // and the author put the paragraphs, so everything downstream is handed the
    // shape it already understands.
    ranked = diversify(
      revived.map((row, i) => ({ row, score: 1 / (RRF_K + i) })),
      want
    )
  }
  const passages: KnowledgePassage[] = ranked.slice(0, want).map(({ row, score }) => ({
    sourceId: row.source_id,
    title: row.title,
    kind: row.kind,
    url: row.source_url,
    // The read above already carries `origin_table` and `origin_row_id` for the
    // live cross-check, so the link to the record costs nothing extra.
    recordPath: recordPath(row.origin_table, row.origin_row_id, row.compartment),
    compartment: row.compartment,
    seq: row.seq,
    text: plainText(row.text),
    score: Math.round(score * 1000) / 1000,
  }))
  const live = await crossCheck(cfg, guard, ranked.slice(0, want).map((r) => r.row))
  const evidence = {
    question,
    compartments: route.compartments,
    reason: route.reason,
    records: route.records,
    passages,
    candidates: fused.length,
    live,
  }
  // DECIDED FIRST, WRITTEN SECOND, and the order is the law. The seam settles
  // `found`, which sources are cited and which passages survive; only then is the
  // writer handed that settled evidence — the same object the reader gets — and
  // only if there was any. A writer that ran before this decision could be given
  // material the caller was never going to see.
  const decided = knowledgeAnswer(evidence)
  if (!input.compose || !decided.found) return decided
  const written = await input.compose(decided.passages, decided.citations)
  // Nothing written (the model was unreachable, or said nothing) is not an error:
  // the evidence is still the answer, exactly as it was before any of this.
  return written ? knowledgeAnswer({ ...evidence, written }) : decided
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
/** HOW MANY PASSAGES MAY COME FROM SOURCES SHARING ONE TITLE.
 *
 * Two, because one is too few — a document and its follow-up genuinely both
 * answer some questions — and three is already a page of the same thing. */
const PASSAGES_PER_TITLE = 2

/**
 * DON'T SPEND THE WHOLE ANSWER ON ONE THING SAID FIVE TIMES.
 *
 * ── WHAT THIS FIXES, read off a real answer ─────────────────────────────────
 *
 * Asked "summarise what happened in the Team Assembly meeting", the base
 * returned six passages and five of them were the SAME recurring meeting —
 * different rows, identical titles, and every one of them a future instance
 * that had not happened yet. The one source that described what was actually
 * said got the remaining slot.
 *
 * That is not a scoring bug: a recurring series really does produce many rows
 * that match "Team Assembly" equally well, and the ranking is right that they
 * all match. It is a SELECTION bug. Six of the best matches is not the same
 * thing as the best six-passage answer, and the difference is exactly what a
 * person means when they say an answer was unhelpful.
 *
 * ── HOW ──────────────────────────────────────────────────────────────────────
 *
 * Best first, taking at most two passages from any set of sources that share a
 * title, and then — only if that left fewer than were asked for — filling the
 * rest from what was skipped, best first again. So diversity is preferred and
 * never PAID for: an answer can still be six passages from one document when
 * one document is genuinely all there is.
 *
 * Deliberately on the TITLE and not the source id: several passages from one
 * long document are a good answer to a question about that document, and
 * capping those would make a fifty-page contract quotable twice. What is being
 * spread is the ANSWER across the things it is about.
 */
function diversify(
  ranked: { row: ScoredRow; score: number }[],
  want: number
): { row: ScoredRow; score: number }[] {
  const seen = new Map<string, number>()
  const kept: { row: ScoredRow; score: number }[] = []
  const skipped: { row: ScoredRow; score: number }[] = []
  for (const item of ranked) {
    const key = (item.row.title ?? "").trim().toLowerCase()
    const used = seen.get(key) ?? 0
    if (used < PASSAGES_PER_TITLE) {
      seen.set(key, used + 1)
      kept.push(item)
    } else skipped.push(item)
  }
  // Never fewer than the caller asked for while candidates remain: the cap is a
  // preference between equals, not a reason to answer with less.
  return kept.length >= want ? kept : [...kept, ...skipped]
}

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
  meetings: { table: "meetings", status: "status" },
  tasks: { table: "tasks", status: "status" },
  todos: {
    table: "todos",
    status: `CASE WHEN cancelled_at IS NOT NULL THEN 'called off'
                  WHEN completed_at IS NOT NULL THEN 'sent to us' ELSE 'still waiting' END`,
  },
  // `processes` and `account_links` are absent on purpose: neither has a status
  // column, and a row with nothing to re-read has nothing to be stale about.
}

/** WHERE THE RECORD BEHIND A PASSAGE LIVES, IN THIS APP.
 *
 * The owner's sentence: "the ability to go and check out the links to the
 * sources or to those particular records as well." A citation already opens the
 * SOURCE — the knowledge screen that shows what was indexed and why. This is the
 * other half: one hop further, to the ticket, the map, the meeting itself.
 *
 * A path RELATIVE TO THE TEAM (`tickets/<id>`), because the worker has no
 * business knowing what a front end's URLs look like beyond the segment, and
 * both front ends prefix their own. Null for a source with no record screen — a
 * note somebody typed IS the record, a Google document is reached through `url`,
 * and a to-do or a contact lives inside another record's page rather than on one
 * of its own. Null renders no link; it never renders a broken one.
 *
 * DERIVED, not decided at the door (R23): the map is here, the one call is in
 * `retrieve`, and the citation copies what the passage carries. Every segment is
 * checked against `web/lib/pages.ts` by knowledge-coverage.test.ts, so a page
 * that is renamed cannot leave a dead link behind. */
const RECORD_PATH: Record<string, string> = {
  help: "tickets",
  stories: "stories",
  sprints: "sprints",
  apps: "apps",
  processes: "processes",
  meetings: "meetings",
  accounts: "accounts",
  tasks: "tasks",
}

/** RECORDS THAT LIVE INSIDE ANOTHER RECORD'S PAGE.
 *
 * A contact is not a screen — it is a row on its account's Contacts tab. Same
 * for a to-do, which lives on the account or app it was asked of. So "open the
 * record" for one of these means opening the page it is ON, which is where a
 * person would go to look at it anyway.
 *
 * Before this they resolved to null and rendered no link at all. The owner's
 * sentence was "we should always be able to just link back to the resource", and
 * a citation reading "Roland Golger at HOGO" with nothing to click was the one
 * shape of answer that could not be checked. Measured in the test run: four
 * citations out of six on a question about HOGO's people had no way back. */
const LIVES_ON_ITS_ACCOUNT = new Set(["account_links", "todos"])

export function recordPath(
  originTable: string | null,
  originRowId: string | null,
  /** the source's compartment — `account:<id>` or `agency`. The account id is
   * already on the row the ranker read, so this costs nothing extra. */
  compartment?: string | null
): string | null {
  const segment = originTable ? RECORD_PATH[originTable] : undefined
  if (segment && originRowId) return `${segment}/${originRowId}`
  // The nested kinds, one hop out to the page they sit on. Only ever the
  // account's OWN compartment: `agency` names no record, so a contact filed
  // there still renders no link rather than a broken one.
  if (originTable && LIVES_ON_ITS_ACCOUNT.has(originTable)) {
    const account = /^account:(.+)$/.exec(compartment ?? "")
    if (account) return `accounts/${account[1]}`
  }
  return null
}

async function crossCheck(
  cfg: D1Rest,
  guard: MemberGuard,
  rows: ScoredRow[]
): Promise<Map<string, { status: string; checkedAt: string }>> {
  const out = new Map<string, { status: string; checkedAt: string }>()
  const byTable = new Map<string, { sourceId: string; rowId: string }[]>()
  for (const r of rows) {
    if (!r.origin_table || !r.origin_row_id) continue
    if (!Object.prototype.hasOwnProperty.call(LIVE_STATUS, r.origin_table)) continue
    if (!byTable.has(r.origin_table)) byTable.set(r.origin_table, [])
    const list = byTable.get(r.origin_table) as { sourceId: string; rowId: string }[]
    if (!list.some((x) => x.rowId === r.origin_row_id))
      list.push({ sourceId: r.source_id, rowId: r.origin_row_id })
  }
  const checkedAt = new Date().toISOString()
  await Promise.all(
    [...byTable.entries()].map(async ([table, wanted]) => {
      // Own-row values, but the lookup form is the hardened one anyway — a
      // prototype name in a stored row must skip, not crash.
      const def = Object.prototype.hasOwnProperty.call(LIVE_STATUS, table) ? LIVE_STATUS[table] : undefined
      if (!def) return
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
