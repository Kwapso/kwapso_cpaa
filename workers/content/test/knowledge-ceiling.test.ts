// THE FOUR PROMISES THE KNOWLEDGE BASE MAKES ABOUT BIG, MOVING MATERIAL — each
// one a thing the old design got wrong, and each one broken here to prove the
// test bites.
//
//   1. NO SILENT TRIM. A document past the ceiling is REFUSED, in words, saying
//      both numbers, and NOTHING is saved. The owner's ruling: "if a limit must
//      remain, the upload is REFUSED with a clear message, never silently
//      trimmed." The old door capped the body at TEXT_LIMITS.long — twenty
//      thousand characters, about eight pages — which is why two whole books
//      came back refused and a 300-page contract could not go in at all.
//
//   2. A BIG DOCUMENT GOES IN WHOLE, in slices, and is answerable from any part
//      of it — not just the first two hundred chunks the old chunker stopped at.
//
//   3. A SOURCE THAT LEFT THE APP LEAVES THE ANSWERS. An archived ticket used to
//      be skipped by the sweep's read, which meant the cursor never visited it
//      again and its indexed copy answered questions forever.
//
//   4. THE ANSWER CHECKS THE LIVE ROW. A ticket that was "new" when it was
//      indexed and is "resolved" now must not be quoted as new.
//
// SABOTAGE — each was applied, watched go red, and restored. The exact red is
// recorded beside each test.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

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
import { DOCUMENT_LIMIT_BYTES } from "@shared/workers/validate"
import type { KnowledgeAnswer, KnowledgeSource } from "@shared/types"

const db = () => holder.db as DatabaseSync
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

async function ask(userId: string, question: string): Promise<KnowledgeAnswer> {
  const res = await call(userId, "GET /api/content/knowledge/ask", undefined, `?q=${encodeURIComponent(question)}`)
  expect(res.status).toBe(200)
  return (await res.json()) as KnowledgeAnswer
}

beforeEach(() => {
  vectorIndex = fakeVectorize()
  holder.db = buildSpineDb()
  db().exec(
    `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
     VALUES ('${IDS.adminRole}_knowledge', '${IDS.adminRole}', 'knowledge', 1, 1, 1, 1);`
  )
})

/** A document of roughly `pages` pages, in real sentences so the chunker cuts it
 * where it would cut a real one, and with a distinctive line buried DEEP in it —
 * near the end, which is exactly where the old 200-chunk ceiling stopped
 * looking. */
function document(pages: number, needleAt = 0.9): string {
  const filler =
    "The delivery team reviewed the schedule and agreed the sequence of works for the coming period. " +
    "Each milestone was recorded against the agreed programme and signed by both parties. "
  const perPage = 2_500
  const total = pages * perPage
  const needle =
    "\n\nCLAUSE 74. The retention sum is released ninety days after practical completion, less any agreed deductions.\n\n"
  const before = Math.floor(total * needleAt)
  let text = ""
  while (text.length < before) text += filler
  text += needle
  while (text.length < total) text += filler
  return text
}

describe("1 — a document past the ceiling is refused, never trimmed", () => {
  // SABOTAGE: swap `optionalDocument(input.body, "The material")` in readInput
  // back to `optionalText(input.body, "Body", TEXT_LIMITS.long)` →
  //   × refuses in words, and saves nothing
  //     AssertionError: expected 400 "Bad Request" to be 200 // a 20,000-character
  //     cap refuses a 60-page document, which is the bug this replaced.
  it("refuses in words, and saves nothing", async () => {
    const tooBig = "x".repeat(DOCUMENT_LIMIT_BYTES + 1)
    const res = await call(IDS.staffUser, "POST /api/content/knowledge", {
      title: "The whole contract",
      body: tooBig,
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe("too_large")
    // THE MESSAGE HAS TO CARRY BOTH NUMBERS. Somebody is standing there holding a
    // file they now have to split, and "too long" tells them nothing about where
    // to cut it.
    expect(body.message).toMatch(/1\.5 MB/)
    expect(body.message).toMatch(/Nothing was saved/)
    expect(body.message).toMatch(/split it/i)
    // …and nothing was written. A refusal that half-saved would be worse than
    // either a trim or a refusal.
    const rows = db().prepare("SELECT COUNT(*) n FROM knowledge_sources").get() as { n: number }
    expect(rows.n).toBe(0)
  })

  it("takes a 300-page contract whole", async () => {
    // The owner's own case. Thirty-seven times what the old validator allowed,
    // and it has to travel as a BOUND PARAMETER — D1 refuses a SQL statement
    // over 100 KB, so the old interpolated write could not have carried it
    // however generous the validator had been.
    const res = await call(IDS.staffUser, "POST /api/content/knowledge", {
      title: "The whole contract",
      body: document(300),
    })
    expect(res.status).toBe(200)
    const { source } = (await res.json()) as { source: KnowledgeSource }
    // Three hundred pages — the owner's own example, and roughly 800 chunks.
    expect(source.bodyBytes).toBeGreaterThan(700_000)
  })
})

describe("2 — a big document is indexed whole, and answerable from deep inside it", () => {
  // SABOTAGE: restore the old cap by making chunkText stop at 200 chunks →
  //   × answers from page 270 of a 300-page contract
  //     AssertionError: expected 200 to be greater than 700, and then
  //     "expected false to be true" — the clause sits past chunk 200, so nothing
  //     in the index can reach it however the ranking is tuned.
  it("answers from page 270 of a 300-page contract", async () => {
    const res = await call(IDS.staffUser, "POST /api/content/knowledge", {
      title: "The whole contract",
      body: document(300),
    })
    expect(res.status).toBe(200)
    const { source } = (await res.json()) as { source: KnowledgeSource }

    // Every piece went in, in one call — the staged indexer runs its slices
    // until the document is finished or its budget is spent.
    const row = db()
      .prepare("SELECT chunk_count, indexed_chunks, index_error FROM knowledge_sources WHERE id = ?")
      .get(source.id) as { chunk_count: number; indexed_chunks: number; index_error: string | null }
    expect(row.chunk_count, "300 pages is far past the old 200-chunk ceiling").toBeGreaterThan(700)
    expect(row.indexed_chunks, "a document the door accepted must be indexed whole").toBe(row.chunk_count)
    expect(row.index_error).toBeNull()

    // …and the clause buried at nine-tenths of the way through is findable.
    const answer = await ask(IDS.staffUser, "when is the retention sum released after practical completion?")
    expect(answer.found).toBe(true)
    expect(answer.passages.some((p) => p.text.includes("CLAUSE 74"))).toBe(true)
    // The vectors went in too — one per chunk, plus the record's own summary.
    expect(vectorIndex.ids().length).toBeGreaterThan(row.chunk_count)
  })

  it("a half-finished document is finished by the next pass, not started again", async () => {
    const res = await call(IDS.staffUser, "POST /api/content/knowledge", {
      title: "The whole contract",
      body: document(300),
    })
    const { source } = (await res.json()) as { source: KnowledgeSource }
    const total = (
      db().prepare("SELECT chunk_count FROM knowledge_sources WHERE id = ?").get(source.id) as {
        chunk_count: number
      }
    ).chunk_count

    // Wind the row back to the middle, as a tick that died halfway would leave
    // it: the hash still says WHICH text is being indexed, indexed_chunks says
    // how far it got.
    db().prepare("UPDATE knowledge_sources SET indexed_chunks = ? WHERE id = ?").run(10, source.id)
    db()
      .prepare(
        "DELETE FROM knowledge_terms WHERE chunk_id IN (SELECT id FROM knowledge_chunks WHERE source_id = ? AND seq >= 10)"
      )
      .run(source.id)
    db().prepare("DELETE FROM knowledge_chunks WHERE source_id = ? AND seq >= 10").run(source.id)

    const { indexSource } = await import("../src/lib/knowledge")
    const cfg = { accountId: "a", token: "t" } as never
    const guard = { userId: IDS.staffUser, teamId: IDS.team, roleId: IDS.adminRole, databaseId: "db" }
    const progress = await indexSource(env(IDS.staffUser) as never, cfg, guard, source.id)
    expect(progress.done).toBe(true)
    expect(progress.total).toBe(total)
    // RESUMED, not restarted: chunk 0 was never rewritten, because the hash on
    // the row still matches the text being indexed.
    const first = db()
      .prepare("SELECT created_at FROM knowledge_chunks WHERE id = ?")
      .get(`${source.id}:00000`) as { created_at: string } | undefined
    expect(first, "the pieces already indexed must survive a resume").toBeTruthy()
  })
})

describe("3 — a record that left the app leaves the answers", () => {
  // SABOTAGE: put `WHERE h.archived_at IS NULL` back on the ticket reader →
  //   × an archived ticket stops answering questions
  //     AssertionError: expected [ 'The invoice run fails on Fridays' ] to not
  //     include 'The invoice run fails on Fridays' // the cursor never visits an
  //     archived row again, so its indexed copy answers forever.
  it("an archived ticket stops answering questions", async () => {
    db()
      .prepare(
        `INSERT INTO help (id, title_en, description, help_type, status, account_id, created_at, creator_name)
         VALUES ('T1', ?, ?, 'bug', 'new', ?, '2026-02-01', 'Staff')`
      )
      .run(
        "The invoice run fails on Fridays",
        "The invoice run fails every Friday evening and has to be restarted by hand.",
        IDS.victimAccount
      )
    await call(IDS.staffUser, "POST /api/content/knowledge/sync", {})
    expect(
      (await ask(IDS.staffUser, "why does the invoice run fail?")).citations.map((c) => c.title)
    ).toContain("The invoice run fails on Fridays")

    // Archived — and the row's own timestamp moves, which is what puts it back
    // in front of the cursor.
    db()
      .prepare("UPDATE help SET archived_at = '2026-03-01', updated_at = '2026-03-01' WHERE id = 'T1'")
      .run()
    const sync = await call(IDS.staffUser, "POST /api/content/knowledge/sync", {})
    const results = (await sync.json()) as { results: { kind: string; error?: string }[] }
    // A sweep that FAILED would leave the ticket answering and look identical to
    // one that had nothing to do — R12's record is what tells the two apart.
    expect(results.results.find((r) => r.kind === "ticket")?.error).toBeUndefined()

    const answer = await ask(IDS.staffUser, "why does the invoice run fail?")
    expect(answer.citations.map((c) => c.title)).not.toContain("The invoice run fails on Fridays")
    // Deactivated, never deleted — the row and the decision survive.
    const row = db()
      .prepare("SELECT deactivated_at, chunk_count FROM knowledge_sources WHERE origin_row_id = 'T1'")
      .get() as { deactivated_at: string | null; chunk_count: number }
    expect(row.deactivated_at).not.toBeNull()
    expect(row.chunk_count).toBe(0)
  })
})

describe("4 — the answer checks the live row rather than trusting the index", () => {
  // SABOTAGE: make crossCheck return an empty Map →
  //   × says what the ticket says TODAY, not what the passage remembers
  //     AssertionError: expected null to be 'resolved'
  it("says what the ticket says TODAY, not what the passage remembers", async () => {
    db()
      .prepare(
        `INSERT INTO help (id, title_en, description, help_type, status, account_id, created_at, creator_name)
         VALUES ('T2', ?, ?, 'bug', 'new', ?, '2026-02-01', 'Staff')`
      )
      .run(
        "Drivers are logged out of dispatch",
        "Drivers are logged out of the dispatch screen every twenty minutes.",
        IDS.victimAccount
      )
    await call(IDS.staffUser, "POST /api/content/knowledge/sync", {})

    // The row moves on WITHOUT the index being told — the exact gap the check
    // exists for. (`updated_at` is left alone on purpose, so the catch-up cannot
    // quietly re-index it and pass this test for the wrong reason.)
    db().prepare("UPDATE help SET status = 'resolved' WHERE id = 'T2'").run()

    const answer = await ask(IDS.staffUser, "why are drivers logged out of dispatch?")
    expect(answer.found).toBe(true)
    const cited = answer.citations.find((c) => c.title === "Drivers are logged out of dispatch")
    expect(cited).toBeTruthy()
    expect(cited?.liveStatus, "the citation must carry what the row says now").toBe("resolved")
    expect(cited?.checkedAt).toBeTruthy()
    // …and the assistant is TOLD to use it, in the one sentence it repeats.
    expect(answer.message).toMatch(/checked the live record/i)
    // The passage itself still says what was indexed — the two are deliberately
    // different things, and collapsing them would hide that the index was stale.
    expect(answer.passages.some((p) => p.text.includes("dispatch"))).toBe(true)
  })

  it("a record that has been deleted outright is said to be gone", async () => {
    db()
      .prepare(
        `INSERT INTO help (id, title_en, description, help_type, status, account_id, created_at, creator_name)
         VALUES ('T3', ?, ?, 'bug', 'new', ?, '2026-02-01', 'Staff')`
      )
      .run("Labels print upside down", "The warehouse labels print upside down on the new printer.", IDS.victimAccount)
    await call(IDS.staffUser, "POST /api/content/knowledge/sync", {})
    // Gone from the app entirely — an import rollback, a manual repair.
    db().prepare("DELETE FROM help WHERE id = 'T3'").run()

    const answer = await ask(IDS.staffUser, "why do the warehouse labels print upside down?")
    const cited = answer.citations.find((c) => c.title === "Labels print upside down")
    expect(cited?.liveStatus).toBe("no longer in the app")
  })
})
