// THE BACKFILL, MEASURED — the knowledge base built over the agency's OWN
// history (1,820 tickets and 123 accounts out of the two Glide apps this product
// replaces), through the shipped sweep door, against a real SQLite database
// running the real team migrations.
//
// The 223 legacy ARTICLES are no longer part of this fixture. Learning was
// purged on 17 Aug 2026 and its table with it; the articles that had already
// been indexed live on as sources with kind `article`, which is why lib
// knowledge.ts keeps that kind with no sweep behind it.
//
// WHY THIS IS A TEST AND NOT A SCRIPT. Two jobs, one fixture:
//   • it MEASURES — chunks, index size, time, embedding tokens, and a real
//     retrieval score with the protocol written down, because ".plans" asks for
//     "the retrieval quality you actually measured (not an impression)";
//   • it PROVES the pipeline survives real data — German and English in one row,
//     empty bodies, 5,100-character walls of pasted text, 11 tickets with no
//     client at all. A synthetic fixture cannot fail in any of those ways.
//
// IT SKIPS ITSELF when glide/normalised.json is absent, which is everywhere
// except a machine that has pulled the customer data (it is git-ignored, and it
// must never be committed). So `npm run check` is unaffected on any other
// machine, and the numbers below are reproducible on one that has it.
//
// THE VECTOR STAGE IS OFF for the score. Workers AI is a binding, so there is no
// model here; the fake returns nothing and every embedding stores as NULL. That
// makes the number a FLOOR — the lexical stage alone, which is the stage that
// decides which chunks the vector stage is even allowed to re-rank. Measuring
// the blend would need the real model against real spend, which belongs on
// staging, not in a test.

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { beforeAll, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
import { buildSpineDb, IDS, makeEnv } from "../../tenancy/test/spine-harness"
import { INGEST_KINDS } from "../src/lib/knowledge-ingest"
import { tokenise } from "../src/lib/knowledge-text"
import type { KnowledgeAnswer } from "@shared/types"

const HISTORY = join(__dirname, "..", "..", "..", "glide", "normalised.json")
const db = () => holder.db as DatabaseSync

/** WHAT AN EMBEDDING COSTS, as arithmetic anybody can redo.
 *
 * The token count is MEASURED (characters ÷ 4, the usual English estimate; the
 * German half of this corpus runs a little denser, so the real number is
 * slightly higher). The RATE is the one number here that is not measured — check
 * it against Cloudflare's current Workers AI price list before quoting the euro
 * figure to anybody. It is a named constant precisely so that nobody has to go
 * looking for where a number came from. */
const CHARS_PER_TOKEN = 4
const NEURONS_PER_MILLION_TOKENS = 1_841 // @cf/baai/bge-small-en-v1.5 — VERIFY before quoting
const USD_PER_1K_NEURONS = 0.011
const USD_TO_EUR = 0.92
const MONTHLY_CEILING_EUR = 50

type Normalised = {
  accounts: { glideId: string; kind: string; name: string; code: string | null; email: string | null; phone: string | null; address: string | null; status: string | null }[]
  helpRequests: {
    glideId: string
    number: string | null
    accountGlideId: string | null
    helpType: string | null
    description: string | null
    titleDe: string | null
    titleEn: string | null
    resolved: boolean
    createdAt: string | null
    solution: string | null
    replies?: { body: string; createdAt: string; authorName: string | null }[]
  }[]
}

const present = existsSync(HISTORY)
const q = (v: unknown) => (v === null || v === undefined ? "NULL" : `'${String(v).replaceAll("'", "''")}'`)

/** Load the agency's real history into a fresh team database, in the shape the
 * app itself holds it (this is the state AFTER the Glide migration lane's seed —
 * the rows are the INPUT to what is being measured, never the thing measured). */
function loadHistory(): { accounts: number; tickets: number; replies: number } {
  const data = JSON.parse(readFileSync(HISTORY, "utf8")) as Normalised
  const sql: string[] = []
  for (const a of data.accounts)
    sql.push(
      `INSERT INTO accounts (id, account_type, name, email, phone, address, code, status, created_at, creator_name)
       VALUES (${q(a.glideId)}, ${q(a.kind === "entity" ? "entity" : "individual")}, ${q(a.name)}, ${q(a.email)}, ${q(a.phone)}, ${q(a.address)}, ${q(a.code)}, ${q(a.status ?? "client")}, '2025-01-01', 'kwapso');`
    )
  let replies = 0
  const known = new Set(data.accounts.map((a) => a.glideId))
  for (const h of data.helpRequests) {
    // A ticket whose account did not survive the migration keeps NULL rather
    // than a dangling reference — 11 of them, and they are the agency's own.
    const account = h.accountGlideId && known.has(h.accountGlideId) ? h.accountGlideId : null
    // NO `ref`. Glide's ticket numbers are not unique — 13 of them are used
    // by two or three tickets each (2857 appears three times), and the work
    // engine's `idx_help_ref` is a UNIQUE index, so carrying them across would
    // be rejected on the way in. The app allocates its OWN per-account
    // reference (BERG-T0412) when a ticket is raised; inventing one here would
    // be inventing a reference the app never issued. Worth knowing for whoever
    // imports this history for real.
    sql.push(
      `INSERT INTO help (id, description, help_type, status, resolved, account_id, title_de, title_en, created_at, creator_name)
       VALUES (${q(h.glideId)}, ${q(h.description ?? h.titleEn ?? h.titleDe ?? "(no description)")}, ${q(h.helpType)}, ${q(h.resolved ? "resolved" : "new")}, ${h.resolved ? 1 : 0}, ${q(account)}, ${q(h.titleDe)}, ${q(h.titleEn)}, ${q(h.createdAt ?? "2025-01-01")}, 'kwapso');`
    )
    // The conversation, and the closing note — both are part of what makes a
    // ticket worth reading a year later, and both are what the sweep folds in.
    const thread = [...(h.replies ?? [])]
    if (h.solution) thread.push({ body: h.solution, createdAt: h.createdAt ?? "2025-01-01", authorName: null })
    thread.forEach((r, i) => {
      replies++
      sql.push(
        `INSERT INTO help_threads (id, help_id, message_body, created_at, creator_name)
         VALUES (${q(`${h.glideId}-r${i}`)}, ${q(h.glideId)}, ${q(r.body)}, ${q(r.createdAt)}, ${q(r.authorName)});`
      )
    })
  }
  // In batches: one statement string of this size is a needless spike.
  for (let i = 0; i < sql.length; i += 500) db().exec(sql.slice(i, i + 500).join("\n"))
  return { accounts: data.accounts.length, tickets: data.helpRequests.length, replies }
}

/** Embedding is OFF (see the header) — the model answers with nothing, which is
 * the same path a Workers AI outage takes, so this also exercises that. */
function env() {
  const base = makeEnv(() => db(), IDS.staffUser) as unknown as Record<string, unknown>
  return {
    ...base,
    INTERNAL_KEY: "k",
    AI: { run: async () => ({ data: [] }) },
    REALTIME: { fetch: async () => new Response("{}") },
  } as never
}

const call = (route: string, body?: unknown, query = "") => {
  const [method, path] = route.split(" ")
  return worker.fetch(
    new Request(`https://content${path}${query}`, {
      method,
      headers: { Cookie: "session=x", "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    }),
    env()
  )
}

const one = (sql: string): Record<string, number> => db().prepare(sql).get() as never

describe.skipIf(!present)("the backfill, over the agency's own history", () => {
  const stats = {
    loaded: { accounts: 0, tickets: 0, replies: 0 },
    ticks: 0,
    sweepMs: 0,
    sources: 0,
    chunks: 0,
    terms: 0,
    chars: 0,
  }

  beforeAll(async () => {
    holder.db = buildSpineDb()
    db().exec(
      `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
       VALUES ('admin_knowledge', '${IDS.adminRole}', 'knowledge', 1, 1, 1, 1);`
    )
    // The fixture ships one ticket of its own; drop it so the counts below are
    // the agency's history and nothing else.
    db().exec("DELETE FROM help; DELETE FROM help_threads;")
    stats.loaded = loadHistory()

    const started = Date.now()
    // THE BACKFILL IS A LOOP OVER THE SAME DOOR THE CRON CALLS — not a second
    // ingestion path. `caughtUp` on every kind is how the caller knows to stop,
    // which is exactly what scripts/knowledge-backfill.mjs does against a live
    // environment. The ceiling is a safety net, not the expected end.
    for (let i = 0; i < 400; i++) {
      stats.ticks++
      const res = await call("POST /api/content/knowledge/sync", {})
      expect(res.status).toBe(200)
      const { caughtUp } = (await res.json()) as { caughtUp: boolean }
      if (caughtUp) break
    }
    stats.sweepMs = Date.now() - started
    stats.sources = one("SELECT COUNT(*) AS n FROM knowledge_sources").n
    stats.chunks = one("SELECT COUNT(*) AS n FROM knowledge_chunks").n
    stats.terms = one("SELECT COUNT(*) AS n FROM knowledge_terms").n
    stats.chars = one("SELECT COALESCE(SUM(LENGTH(text)), 0) AS n FROM knowledge_chunks").n
  }, 600_000)

  it("mirrors every row of the agency's history, exactly once", () => {
    // One source per row, no duplicates: the partial unique index on
    // (origin_table, origin_row_id) is what makes a re-run safe, and 87 ticks
    // over one corpus is a re-run 87 times over.
    // Counted off the DATABASE rather than off what the loader thinks it wrote:
    // the shared fixture ships accounts of its own, and an expectation built
    // from the loader's own tally would have quietly excused them.
    // AN ARCHIVED TICKET IS MIRRORED, NOT SKIPPED, and that is the point rather
    // than an off-by-one. A row that leaves the part of the app its kind mirrors
    // is written as a source and DEACTIVATED — the difference between "the
    // assistant stops quoting it" and "the assistant quotes it forever because
    // the sweep never visits it again". So the expectation counts every ticket,
    // and the assertion below proves the archived ones arrived switched off.
    //
    // DERIVED FROM THE KINDS, not from a list written here. The sweep grew three
    // more of them the day apps, stories and sprints started carrying summaries,
    // and an expectation naming three tables would have gone on passing while
    // silently describing a smaller app. Each kind names its own table.
    const mirrorable = INGEST_KINDS.reduce((n: number, k: { table: string }) => {
      const t = k.table
      const live =
        t === "help"
          ? "SELECT COUNT(*) AS n FROM help"
          : `SELECT COUNT(*) AS n FROM ${t} WHERE deactivated_at IS NULL`
      try {
        return n + one(live).n
      } catch {
        // the fixture does not ship this table — nothing to mirror from it
        return n
      }
    }, 0)
    expect(stats.sources).toBe(mirrorable)
    const archived = one("SELECT COUNT(*) AS n FROM help WHERE archived_at IS NOT NULL").n
    if (archived > 0)
      expect(
        one(
          `SELECT COUNT(*) AS n FROM knowledge_sources s JOIN help h ON h.id = s.origin_row_id
            WHERE s.origin_table = 'help' AND h.archived_at IS NOT NULL AND s.deactivated_at IS NULL`
        ).n,
        "an archived ticket must arrive switched off — a live source the sweep will never revisit is quoted forever"
      ).toBe(0)
    const dupes = one(
      `SELECT COUNT(*) AS n FROM (SELECT origin_table, origin_row_id FROM knowledge_sources
        WHERE origin_row_id IS NOT NULL GROUP BY 1, 2 HAVING COUNT(*) > 1)`
    ).n
    expect(dupes).toBe(0)
    // Every source that has text got chunks. (A handful genuinely have none —
    // an account row with no address, phone or reference still has a name, so in
    // practice this is all of them.)
    const unchunked = one("SELECT COUNT(*) AS n FROM knowledge_sources WHERE chunk_count = 0").n
    expect(unchunked).toBe(0)
  })

  it("files each client's material in that client's own compartment", () => {
    const agency = one(`SELECT COUNT(*) AS n FROM knowledge_sources WHERE compartment = 'agency'`).n
    const client = one(`SELECT COUNT(*) AS n FROM knowledge_sources WHERE compartment LIKE 'account:%'`).n
    // Every account IS its own compartment; a ticket goes wherever its client
    // is, and the eleven with no client stay ours.
    expect(client).toBeGreaterThan(stats.loaded.accounts)
    expect(agency).toBeGreaterThan(0)
    expect(agency + client).toBe(stats.sources)
  })

  it("answers a known-item question out of the right source, and reports the score", async () => {
    // THE PROTOCOL, written down so the number means something and can be redone:
    //
    //   • sample every 37th TICKET (a stride, so the sample spans the whole
    //     corpus — oldest to newest — rather than one end of it);
    //   • build the question from the ticket's OWN BODY, not its title: take its
    //     first eight indexable words, in order. That is the honest shape of a
    //     real question ("what did we say about the Schadensfall email import?")
    //     — it shares content words with the material without being a copy of
    //     the title, which would make this trivial;
    //   • a HIT is the ticket's own source appearing in the answer's citations;
    //     rank 1 is it appearing first. Everything is the lexical stage alone.
    const sampled: { id: string; question: string }[] = []
    const rows = db()
      .prepare(
        `SELECT s.id, s.body FROM knowledge_sources s WHERE s.kind = 'ticket' ORDER BY s.origin_row_id`
      )
      .all() as { id: string; body: string }[]
    for (let i = 0; i < rows.length; i += 37) {
      const words = [...tokenise(rows[i].body).keys()].slice(0, 8)
      if (words.length >= 4) sampled.push({ id: rows[i].id, question: words.join(" ") })
    }
    expect(sampled.length, "the sample must not be empty").toBeGreaterThan(20)

    let hits = 0
    let firsts = 0
    let reciprocal = 0
    let empty = 0
    for (const s of sampled) {
      const res = await call("GET /api/content/knowledge/ask", undefined, `?q=${encodeURIComponent(s.question)}`)
      const answer = (await res.json()) as KnowledgeAnswer
      if (!answer.found) {
        empty++
        continue
      }
      const at = answer.citations.findIndex((c) => c.sourceId === s.id)
      if (at === -1) continue
      hits++
      if (at === 0) firsts++
      reciprocal += 1 / (at + 1)
    }

    const pct = (n: number) => `${((n / sampled.length) * 100).toFixed(1)}%`
    const tokens = Math.round(stats.chars / CHARS_PER_TOKEN)
    const usd = (tokens / 1_000_000) * NEURONS_PER_MILLION_TOKENS * (USD_PER_1K_NEURONS / 1_000)
    const eur = usd * USD_TO_EUR

    console.log(
      [
        "",
        "──────── THE BACKFILL, MEASURED ────────",
        `history loaded      ${stats.loaded.tickets} tickets (+${stats.loaded.replies} replies), ${stats.loaded.accounts} accounts`,
        `sweep               ${stats.ticks} ticks × ${25} rows, ${(stats.sweepMs / 1000).toFixed(1)}s in-process (no network, no model)`,
        `index built         ${stats.sources} sources · ${stats.chunks} chunks · ${stats.terms.toLocaleString()} postings · ${(stats.chars / 1e6).toFixed(2)} MB of text`,
        `embedding cost      ~${tokens.toLocaleString()} tokens → ~$${usd.toFixed(2)} (~€${eur.toFixed(2)}) ONE-OFF, against the €${MONTHLY_CEILING_EUR}/mo ceiling`,
        `                    the steady state is ~€0: an unchanged row is skipped before it is chunked`,
        "",
        `retrieval (LEXICAL STAGE ONLY — the floor; the vector re-rank is off)`,
        `  known-item queries ${sampled.length} (every 37th ticket, first 8 content words of its body)`,
        `  found something    ${pct(sampled.length - empty)}`,
        `  right source cited ${pct(hits)}   (recall)`,
        `  cited FIRST        ${pct(firsts)}   (precision at 1)`,
        `  MRR                ${(reciprocal / sampled.length).toFixed(3)}`,
        "────────────────────────────────────────",
        "",
      ].join("\n")
    )

    // The assertion is deliberately a FLOOR, not the measured number: this runs
    // over live customer data that changes, so pinning today's percentage would
    // make the suite fail on a data pull rather than on a regression. What must
    // never happen is the search stopping working on real material.
    expect(hits / sampled.length, "the lexical stage must find the right ticket most of the time").toBeGreaterThan(
      0.6
    )
    expect(empty / sampled.length, "a question built from a ticket's own words must rarely find nothing").toBeLessThan(
      0.1
    )
  }, 600_000)
})
