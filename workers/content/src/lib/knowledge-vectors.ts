// THE VECTOR STORE — the only file that talks to Vectorize.
//
// ════════════════════════════════════════════════════════════════════════════
// WHY ONE INDEX WITH LABELS, AND NOT ONE INDEX PER RECORD
//
// The owner's picture is a notebook per client, per app, per ticket — "the agent
// already knows what each notebook contains", so it opens the right one instead
// of rummaging through everything. That instinct is right and it is the whole
// design here. What is wrong is the noun: a *notebook* cannot be a database.
//
// A Vectorize index is a PROVISIONED RESOURCE. Creating one is an API call that
// can half-fail, it has to be reconciled with the row it belongs to, it has to
// be torn down when the row is deactivated, and — the killer — a Worker reaches
// an index through a BINDING declared in wrangler.jsonc at deploy time. A ticket
// raised at 11:04 must be answerable at 11:04. It cannot wait for a deploy.
//
// So the notebooks are LABELS on the vectors, not containers around them:
//
//   • the compartment, the account, the app, the ticket, the sprint, the kind
//     and the date ride every chunk as METADATA, each one an indexed field;
//   • "open the client's notebook" is `{ compartment: "account:01J…" }`;
//   • "open this ticket's notebook" is `{ ticket: "01J…" }`;
//   • a brand-new ticket is answerable the instant its first chunk is upserted,
//     with nothing to provision and nothing to deploy.
//
// Same idea, built so it holds. And a label can do something a container cannot:
// answer a question that spans two notebooks (this client AND the agency's own
// process) in ONE search rather than two searches somebody has to merge.
//
// ════════════════════════════════════════════════════════════════════════════
// THE THREE FENCES, AND WHERE EACH ONE REALLY LIVES
//
// The old design kept vectors in the team's own database and argued — correctly
// — that a per-team database makes tenancy STRUCTURAL, where "one index with a
// team id in the metadata" makes it a filter somebody wrote correctly today.
// That argument has to be answered, not waved at. It is answered three times:
//
//   1. TENANCY IS A PARTITION, NOT A FILTER. Every read and every write here
//      passes `namespace: guard.teamId`. A Vectorize namespace is applied BEFORE
//      the search, and a query may name exactly one — so a query cannot see
//      another namespace's vectors even if every metadata filter were wrong.
//      `namespaceFor` is the one place a namespace is built, and it is built
//      from the guard, never from a request.
//
//   2. THE FENCE IS RE-APPLIED IN SQL ANYWAY. This file returns ids and scores.
//      Nothing else. `returnValues: false` and `returnMetadata: "none"` are not
//      an optimisation, they are the fence: the passages an answer is built from
//      are read back out of the TEAM'S OWN DATABASE, under the caller's own
//      owner clause, with deactivated sources excluded. So the vector store
//      NARROWS and the database DECIDES. A wrong label can cost us a relevant
//      passage; it cannot produce one the caller was not allowed to read.
//
//   3. THE PERSONAL FENCE RIDES THE FILTER TOO, so a private source is not even
//      a candidate: `owner` is the sentinel "team" or a user id, and every query
//      carries `owner: { $in: ["team", <caller>] }`. Belt and braces with (2) —
//      deliberately, because this is the fence that decides whether one member's
//      own mail can appear in a colleague's answer.
//
// (Law R26 pins 1 and 2. `workers/content/test/vector-fence.test.ts` breaks it.)
//
// WHAT WOULD CHANGE OUR MIND: a tenant whose material must live in its own
// region or under its own key — then it needs its own index, and the seam to
// change is this file's `indexFor`, which is today a constant. Or Vectorize
// namespaces ceasing to be a pre-search partition, which would demote (1) to a
// filter and leave only (2) — still safe, but no longer structural.

import { GuardError, type MemberGuard } from "@shared/workers/gating"
import type { Env } from "../env"

/** Vectors sent in one upsert. Vectorize takes 1,000 per call from a Worker;
 * this is smaller on purpose — a batch is also the unit of RETRY, and re-sending
 * 200 vectors after a blip costs a fifth of re-sending a thousand. */
export const UPSERT_BATCH = 200

/** Ids removed in one delete call. Same ceiling, same reasoning. */
export const DELETE_BATCH = 200

/** Nearest neighbours one search asks for. Vectorize allows 100 when neither
 * values nor metadata come back — which is exactly the shape this seam uses, so
 * the ceiling costs nothing. */
export const VECTOR_TOP_K = 100

/** The sentinel an unindexed field carries. Vectorize has no "IS NULL": a vector
 * with no `ticket` key simply is not matched by `{ticket: {$ne: "x"}}` either,
 * so an absent key is a hole in every filter. One spelling for "nothing here",
 * written once, and the filters below can rely on every key existing. */
export const NONE = "none"

/** The shelf a piece of material sits on, as `owner` spells it. The TEAM shelf
 * is a sentinel rather than an absent key for the reason above — the fence is an
 * `$in`, and an `$in` cannot match a key that is not there. */
export const TEAM_SHELF = "team"

/** THE TWO LEVELS IN ONE INDEX.
 *
 * A `record` vector is a whole record's short SUMMARY — what this ticket, this
 * app, this client IS ABOUT. A `chunk` vector is a readable piece of material.
 * The router searches `record` first (a hundred-odd short vectors, one query) to
 * decide WHICH records to look inside, then searches `chunk` narrowed to them.
 *
 * They share an index because they share a namespace, a fence and a lifecycle —
 * and because a router that had to query a second index would be a second thing
 * to provision, which is the mistake this whole file exists to avoid. */
export type VectorLevel = "record" | "chunk"

/** What rides every vector. Nine keys, and Vectorize allows ten metadata indexes
 * per index — the tenth is deliberately spare, because the day something needs a
 * new facet is the day you cannot make room for it.
 *
 * `shelf` is NOT one of them. It would be a tenth index for a synonym: "on the
 * team shelf" is `owner === TEAM_SHELF`, and spending the last slot on a second
 * spelling of a fact already indexed is how a schema runs out of room. */
export type VectorLabels = {
  /** "record" | "chunk" — which half of the two-stage search this vector is in. */
  level: VectorLevel
  /** 'agency' or 'account:<id>' — the compartment the router narrows by. */
  compartment: string
  /** the caller who may read it: TEAM_SHELF, or one user's id. */
  owner: string
  /** note | ticket | article | account | app | story | sprint | … */
  kind: string
  /** which client's material this is, or NONE. */
  account: string
  /** which built system it concerns, or NONE. */
  app: string
  /** which ticket it belongs to, or NONE. */
  ticket: string
  /** which sprint it belongs to, or NONE. */
  sprint: string
  /** when the material is FROM, as whole seconds since the epoch. A number, not
   * an ISO string, because a range ("since Monday") is the only thing a date is
   * ever filtered by and Vectorize compares numbers, not date strings. */
  date: number
}

/** The metadata indexes this index must be created with, in the order BOOTSTRAP
 * creates them. Exported so the check can read them off this file rather than
 * off a wiki page — and so a tenth is a visible decision.
 *
 * VECTORIZE WILL NOT INDEX RETROSPECTIVELY: "vectors upserted before a metadata
 * index was created won't have their metadata contained in that index". So the
 * order in BOOTSTRAP.md is create index → create all nine → then ingest, and a
 * field added later means a re-index of everything. */
export const METADATA_INDEXES: { property: keyof VectorLabels; type: "string" | "number" }[] = [
  { property: "level", type: "string" },
  { property: "compartment", type: "string" },
  { property: "owner", type: "string" },
  { property: "kind", type: "string" },
  { property: "account", type: "string" },
  { property: "app", type: "string" },
  { property: "ticket", type: "string" },
  { property: "sprint", type: "string" },
  { property: "date", type: "number" },
]

/** One vector on its way in. `values` is the raw embedding — full float32, not
 * the quantised byte form the old design stored, because Vectorize keeps the
 * floats and the rounding was only ever the price of living in a TEXT column. */
export type VectorRow = { id: string; values: number[]; labels: VectorLabels }

/** What a search hands back, and ALL it hands back (fence 2 above). There is no
 * text field on this type and there must never be one: an answer's words come
 * out of the team's database, so a bug in this file cannot put a sentence in
 * front of somebody who may not read it. */
export type VectorHit = { id: string; score: number }

/** A metadata filter, in Vectorize's own shape. Only the operators we use. */
export type VectorFilter = Record<string, string | number | { $in?: (string | number)[]; $gte?: number; $lte?: number }>

/** THE ONE PLACE A NAMESPACE IS BUILT (fence 1). From the guard, which is
 * resolved from the session — never from a query string, a body or a label. A
 * team id is a ULID (26 characters), comfortably inside Vectorize's 64-byte
 * namespace limit; the guard is refused if it is ever anything else, because a
 * namespace that silently truncated would merge two teams' material. */
export function namespaceFor(guard: MemberGuard): string {
  const ns = guard.teamId
  if (!ns || ns.length > 64)
    throw new GuardError(500, "vector_namespace", "That team cannot be searched.")
  return ns
}

/** THE PERSONAL FENCE, as a filter. Everything on the team shelf, plus this
 * caller's own — and nothing else. Merged into every query below rather than
 * offered as an option, because a fence with an opt-out is not a fence. */
function ownerFilter(guard: MemberGuard): VectorFilter {
  return { owner: { $in: [TEAM_SHELF, guard.userId] } }
}

/** The vector id for one chunk. DETERMINISTIC — `<sourceId>:<seq>` — for three
 * reasons that all bite: an upsert of the same chunk overwrites rather than
 * duplicating; re-indexing a source that got SHORTER only has to delete the
 * tail; and the id is derivable from D1's own row, so a rebuild-from-scratch
 * never needs a lookup table nobody kept in step. Zero-padded so the ordering is
 * the reading order. */
export function chunkVectorId(sourceId: string, seq: number): string {
  return `${sourceId}:${String(seq).padStart(5, "0")}`
}

/** The vector id for a record's summary. A different shape from a chunk's on
 * purpose, so the two levels can never collide. */
export function recordVectorId(sourceId: string): string {
  return `${sourceId}:summary`
}

/** Is the store even there? Vectorize is a binding, so "not configured" is a
 * deployment fact — and it must be a CLEAR one. Without it the base falls back
 * to its lexical half rather than throwing on every question. */
export function hasVectorStore(env: Env): env is Env & { KNOWLEDGE_INDEX: VectorizeIndex } {
  return Boolean(env.KNOWLEDGE_INDEX)
}

/** Put vectors in. Batched, and each batch retried once — a partial upsert is
 * survivable (the source's content hash is only stamped when the whole index
 * succeeded, so the next sweep redoes it) but a lost batch that nobody retries
 * is a hole in the index that heals fifteen minutes later at best. */
export async function upsertVectors(
  env: Env,
  guard: MemberGuard,
  rows: VectorRow[]
): Promise<number> {
  if (!hasVectorStore(env) || !rows.length) return 0
  const namespace = namespaceFor(guard)
  let written = 0
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH).map((r) => ({
      id: r.id,
      values: r.values,
      namespace,
      metadata: r.labels as unknown as Record<string, string | number>,
    }))
    await env.KNOWLEDGE_INDEX.upsert(batch)
    written += batch.length
  }
  return written
}

/** Take vectors out. Called with the ids D1 already holds, so this never has to
 * ask the index what it contains — the database is the record of what was
 * written, which is what makes the two rebuildable from one another. */
export async function deleteVectors(env: Env, ids: string[]): Promise<void> {
  if (!hasVectorStore(env) || !ids.length) return
  for (let i = 0; i < ids.length; i += DELETE_BATCH)
    await env.KNOWLEDGE_INDEX.deleteByIds(ids.slice(i, i + DELETE_BATCH))
}

/** SEARCH. Ids and scores, inside this team's namespace, inside this caller's
 * fence, narrowed by whatever the router decided.
 *
 * `topK` is capped at VECTOR_TOP_K by the platform when metadata comes back —
 * and metadata never comes back here, so 100 is the real ceiling and it is said
 * out loud (R14: a read carries a hard cap with a comment at the query). */
export async function searchVectors(
  env: Env,
  guard: MemberGuard,
  vector: number[],
  narrow: VectorFilter,
  topK = VECTOR_TOP_K
): Promise<VectorHit[]> {
  if (!hasVectorStore(env) || !vector.length) return []
  const res = await env.KNOWLEDGE_INDEX.query(vector, {
    namespace: namespaceFor(guard),
    // R14 hard cap: 100 is Vectorize's own ceiling for a values-and-metadata-free
    // query, which is the only shape this seam ever sends.
    topK: Math.max(1, Math.min(topK, VECTOR_TOP_K)),
    filter: { ...narrow, ...ownerFilter(guard) } as never,
    // FENCE 2, in two words. Nothing readable comes back from the index.
    returnValues: false,
    returnMetadata: "none",
  })
  return (res?.matches ?? []).map((m: VectorizeMatch) => ({ id: m.id, score: m.score }))
}
