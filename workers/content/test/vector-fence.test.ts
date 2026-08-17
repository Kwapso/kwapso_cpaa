// LAW R26 — THE VECTOR INDEX NARROWS; THE TEAM'S DATABASE DECIDES.
//
// The knowledge base's search moved out of the per-team database and into one
// account-wide Vectorize index. That trades a structural property for a
// performance one, and the trade is only acceptable because the structure is
// rebuilt twice on the other side. This suite is where that is proved rather
// than asserted, in three parts:
//
//   1. TENANCY IS A PARTITION. Every call into the store carries
//      `namespace: guard.teamId`, built in ONE function from the guard. Read off
//      disk, so a call added later without one is a failing build — and RUN, so
//      a namespace that was passed but ignored is caught too.
//
//   2. NOTHING READABLE COMES BACK. The store is asked for ids and scores:
//      `returnValues: false`, `returnMetadata: "none"`. Every passage in every
//      answer is then read out of the team's own database, under the caller's
//      own owner clause, with excluded sources gone. So a mislabelled vector can
//      cost a relevant passage; it cannot produce one the caller may not read.
//
//   3. THE DATABASE REALLY IS THE DECIDER. A vector whose labels LIE — one that
//      says it is on the team shelf when its source is private, and one whose
//      source has been taken away — is planted in the index, and the answer is
//      checked for it. This is the part a source scan cannot do: it is the
//      difference between "the code looks right" and "wrong labels cannot hurt
//      anybody".
//
// SABOTAGE (each one was run, watched go red, and restored):
//   • delete `namespace: namespaceFor(guard)` from searchVectors → 2 of 7 fail:
//     the source scan, and the run-time check that every query names this team.
//     WORTH SAYING PRECISELY: the cross-team plant still does NOT reach the
//     answer, because the second fence catches it — the chunk is not a row in
//     this team's database, so there is nothing to read. That is the design
//     working, not the test missing it, and it is why the partition can be a
//     performance decision rather than the only thing between two tenants.
//   • change `returnMetadata: "none"` to `"all"` → 2 fail (the scan, and the
//     run-time assertion on what every query asked for).
//   • open the personal fence on retrieve()'s passage read → 2 fail, and the
//     second is the real one: "expected [ 'My note on the renewal' ] to not
//     include 'My note on the renewal'" — a colleague's answer citing another
//     member's private note.
//   • let an excluded source back into that read → 2 fail, the second being
//     "expected [ 'Old pricing, withdrawn' ] to not include 'Old pricing,
//     withdrawn'" — material somebody deliberately took away, answering again.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { stripComments } from "@shared/rules/source-scan"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
import { buildSpineDb, IDS, makeEnv } from "../../tenancy/test/spine-harness"
import { fakeVectorize } from "./fake-vectorize"
import { tokenise } from "../src/lib/knowledge-text"
import type { KnowledgeAnswer, KnowledgeSource } from "@shared/types"

const VECTORS = join(__dirname, "..", "src", "lib", "knowledge-vectors.ts")
const LIB = join(__dirname, "..", "src", "lib", "knowledge.ts")

const db = () => holder.db as DatabaseSync
const OTHER_STAFF = "U_STAFF_2"

let vectorIndex = fakeVectorize()

function fakeVector(text: string): number[] {
  const v = Array.from({ length: 256 }, () => 0)
  for (const [term, weight] of tokenise(text)) {
    let h = 0
    for (let i = 0; i < term.length; i++) h = (h * 31 + term.charCodeAt(i)) >>> 0
    v[h % 256] += weight
  }
  return v
}

function env(userId: string) {
  return {
    ...(makeEnv(() => db(), userId) as unknown as Record<string, unknown>),
    INTERNAL_KEY: "k",
    KNOWLEDGE_INDEX: vectorIndex.binding,
    KNOWLEDGE_MIN_SCORE: "0.35",
    AI: { run: async (_m: string, i: { text: string[] }) => ({ data: i.text.map(fakeVector) }) },
    REALTIME: { fetch: async () => new Response("{}") },
  } as never
}

const call = (userId: string, route: string, body?: unknown, query = "") => {
  const [method, path] = route.split(" ")
  return worker.fetch(
    new Request(`https://content${path}${query}`, {
      method,
      headers: { Cookie: "session=x", "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    }),
    env(userId) as never
  )
}

async function addSource(
  userId: string,
  input: { title: string; body?: string; visibility?: string }
): Promise<string> {
  const res = await call(userId, "POST /api/content/knowledge", input)
  expect(res.status, `adding "${input.title}"`).toBe(200)
  return ((await res.json()) as { source: KnowledgeSource }).source.id
}

async function ask(userId: string, question: string): Promise<KnowledgeAnswer> {
  const res = await call(userId, "GET /api/content/knowledge/ask", undefined, `?q=${encodeURIComponent(question)}`)
  expect(res.status).toBe(200)
  return (await res.json()) as KnowledgeAnswer
}

beforeEach(() => {
  vectorIndex = fakeVectorize()
  holder.db = buildSpineDb()
  db().exec(
    `INSERT INTO users (id, email, first_name, current_team_id) VALUES ('${OTHER_STAFF}', 'aurora@kwapso.app', 'Aurora', '${IDS.team}');
     INSERT INTO team_members (id, team_id, user_id, role_id, created_at) VALUES ('m5', '${IDS.team}', '${OTHER_STAFF}', '${IDS.adminRole}', '2026-01-01');
     INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
       VALUES ('${IDS.adminRole}_knowledge', '${IDS.adminRole}', 'knowledge', 1, 1, 1, 1);`
  )
})

describe("R26 part 1 — tenancy is a partition, not a filter", () => {
  const src = stripComments(readFileSync(VECTORS, "utf8"))

  it("every call into the store passes a namespace, and it is built from the guard", () => {
    // The three verbs the store exposes. Each must name the namespace, and the
    // namespace must come from namespaceFor(guard) — never from a request, a
    // label, or a parameter a caller chose.
    for (const verb of ["upsert", "query"])
      expect(
        new RegExp(`\\.${verb}\\(`).test(src),
        `knowledge-vectors.ts must still call ${verb} — this scan has gone blind`
      ).toBe(true)
    // Every verb resolves its namespace from the guard. `upsert` holds it in a
    // local because it batches; `query` names it inline. Both count.
    expect([...src.matchAll(/namespaceFor\(guard\)/g)].length).toBeGreaterThanOrEqual(2)
    // One builder, and it reads the GUARD's team — the whole partition rests on
    // this line being the only source of a namespace.
    expect([...src.matchAll(/export function namespaceFor\(/g)]).toHaveLength(1)
    expect(src).toMatch(/const ns = guard\.teamId/)
    // …and nothing else in the file invents one.
    const built = [...src.matchAll(/namespace:\s*([A-Za-z0-9_.()]+)/g)].map((m) => m[1])
    expect(built.every((b) => b === "namespaceFor(guard)" || b === "namespace")).toBe(true)
  })

  it("nothing readable is ever asked for", () => {
    expect(src).toMatch(/returnValues:\s*false/)
    expect(src).toMatch(/returnMetadata:\s*"none"/)
    // The hit type is the proof that carried through: ids and scores, no text
    // field, so a future edit that returned one would not typecheck into an
    // answer without being noticed.
    expect(src).toMatch(/export type VectorHit = \{ id: string; score: number \}/)
  })

  it("the answer's words are read out of the database, not out of the index", () => {
    const lib = stripComments(readFileSync(LIB, "utf8"))
    // The one read that materialises a passage, and the clause that fences it.
    // A passage is built from `row`, which came from d1Query.
    expect(lib).toMatch(/FROM knowledge_chunks c JOIN knowledge_sources s/)
    // ONE CLAUSE, BOTH FENCES, and it is read off the SOURCE row (`s.`) rather
    // than the chunk's denormalised copy: 12.3 added a second answer to "who may
    // read this" — the people staffed to one app — and a fence assembled from two
    // clauses at four call sites is a fence with a call site somebody forgets.
    // `readerClause` is that one place; this is the assertion that it is used here.
    expect(lib).toMatch(/AND s\.deactivated_at IS NULL AND \$\{reader\.sql\}/)
    expect(lib).toMatch(/const reader = readerClause\(guard, "s\."\)/)
    // Both halves live in it — the personal owner and the app's own staffing
    // rule — so neither can be dropped without this going red.
    expect(lib).toMatch(/function readerClause[\s\S]{0,400}?ownerClause\(guard/)
    expect(lib).toMatch(/function readerClause[\s\S]{0,400}?appClause\(guard/)
    expect(lib).toMatch(/text: plainText\(row\.text\)/)
    // …and the search's own results are never read for anything but their id.
    expect(lib).not.toMatch(/hit\.(text|title|metadata)/)
  })
})

describe("R26 part 2 — the fence is exercised, not asserted", () => {
  it("a search names this team's namespace and asks for nothing readable", async () => {
    await addSource(IDS.staffUser, {
      title: "Dispatch rollout",
      body: "The dispatch rollout is paused until the invoice run is fixed.",
    })
    await ask(IDS.staffUser, "why is the dispatch rollout paused?")
    const queries = vectorIndex.queries()
    expect(queries.length).toBeGreaterThan(0)
    for (const q of queries) {
      expect(q.namespace, "every query must be inside this team's partition").toBe(IDS.team)
      expect(q.returnValues).toBe(false)
      expect(q.returnMetadata).toBe("none")
    }
  })

  it("another team's vectors are not reachable, whatever their labels say", async () => {
    await addSource(IDS.staffUser, {
      title: "Dispatch rollout",
      body: "The dispatch rollout is paused until the invoice run is fixed.",
    })
    // A vector in ANOTHER namespace, wearing this team's compartment and the
    // team shelf — every metadata filter this search applies would pass it.
    await vectorIndex.binding.upsert([
      {
        id: "OTHERTEAM:00000",
        values: fakeVector("the dispatch rollout is paused until the invoice run is fixed"),
        namespace: "SOME_OTHER_TEAM",
        metadata: { level: "chunk", compartment: "agency", owner: "team", kind: "note" },
      },
    ])
    const answer = await ask(IDS.staffUser, "why is the dispatch rollout paused?")
    expect(answer.found).toBe(true)
    expect(answer.passages.map((p) => p.sourceId)).not.toContain("OTHERTEAM")
    expect(answer.citations.map((c) => c.title)).toEqual(["Dispatch rollout"])
  })
})

describe("R26 part 3 — a lying label cannot get past the database", () => {
  it("a vector claiming the team shelf cannot expose a private source", async () => {
    const id = await addSource(IDS.staffUser, {
      title: "My note on the renewal",
      body: "The finance lead wants a discount before signing the renewal.",
      visibility: "private",
    })
    // The index is told this chunk is the team's. It is not — the SOURCE is
    // private, and the source is what the database knows.
    const chunkId = `${id}:00000`
    await vectorIndex.binding.upsert([
      {
        id: chunkId,
        values: fakeVector("the finance lead wants a discount before signing the renewal"),
        namespace: IDS.team,
        metadata: { level: "chunk", compartment: "agency", owner: "team", kind: "note" },
      },
    ])
    const mine = await ask(IDS.staffUser, "what does the finance lead want before signing?")
    expect(mine.citations.map((c) => c.title)).toContain("My note on the renewal")

    // The colleague's answer is where the lie would show. It does not.
    const theirs = await ask(OTHER_STAFF, "what does the finance lead want before signing?")
    expect(theirs.citations.map((c) => c.title)).not.toContain("My note on the renewal")
    expect(theirs.found).toBe(false)
  })

  it("a vector left behind by an excluded source cannot be cited", async () => {
    const id = await addSource(IDS.staffUser, {
      title: "Old pricing, withdrawn",
      body: "The dispatch module used to cost four hundred a month.",
    })
    expect((await ask(IDS.staffUser, "what did the dispatch module cost?")).found).toBe(true)

    await call(IDS.staffUser, "POST /api/content/knowledge/active", { id, active: false })
    // THE HALF-FAILED REMOVAL: the chunk row AND its vector are both put back by
    // hand — a retry that landed after the source was excluded, or a delete that
    // died between its two statements. Only the source row still says "not in
    // use", so this is precisely the case where the deactivated_at clause on the
    // passage read is the last thing standing between an excluded source and an
    // answer built on it.
    db()
      .prepare(
        "INSERT INTO knowledge_chunks (id, source_id, compartment, owner_user_id, seq, text, embedding, created_at) VALUES (?, ?, 'agency', NULL, 0, ?, NULL, '2026-01-01')"
      )
      .run(`${id}:00000`, id, "The dispatch module used to cost four hundred a month.")
    await vectorIndex.binding.upsert([
      {
        id: `${id}:00000`,
        values: fakeVector("the dispatch module used to cost four hundred a month"),
        namespace: IDS.team,
        metadata: { level: "chunk", compartment: "agency", owner: "team", kind: "note" },
      },
    ])
    const answer = await ask(IDS.staffUser, "what did the dispatch module cost?")
    expect(answer.citations.map((c) => c.title)).not.toContain("Old pricing, withdrawn")
  })
})
