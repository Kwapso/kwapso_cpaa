// THE RECORD WAS MENDED AND THE PASSAGES WERE NOT.
//
// ── WHAT IS ACTUALLY WRONG, AND WHY "NOTHING IS BROKEN" WAS THE WRONG TEST ──
//
// Google's own profile carried the owner's display name mis-decoded ("Ãlaap"),
// and wrote that spelling into everything it composed. `repair-mangled-titles`
// mended the SOURCE rows on 31 Aug 2026 and `shared/workers/mojibake.ts` now
// mends on the way in, so nothing new arrives wrong.
//
// The CHUNKS were built from the pre-repair text and were never rebuilt.
// Measured on staging, 1 Sep 2026:
//
//     23 chunks across 17 sources still contain "Ã"
//     0 of those 17 SOURCES contain it — every one of them is already clean
//
// So open the record and his name is right; let the assistant QUOTE it and his
// name is wrong. That is the literal complaint this whole workstream opened on,
// surviving in the one place a reader actually meets it.
//
// I FIRST CHECKED THE WRONG THING and it is worth writing down: the 17 are fully
// chunked, fully indexed, fully embedded and carry no index error, so "is this
// broken?" answered no — a true measurement of a question nobody asked. The
// question is whether what a person READS says the right thing.
//
// ── WHY IT WILL NEVER HEAL ON ITS OWN ───────────────────────────────────────
//
// `content_hash IS NULL` means "re-chunk me when you next read me", and for a
// windowed Google lane the next read only comes if the row is still inside
// Google's listing. These 17 have aged out of it. Nothing will ever meet them
// again, so the flag is a request nobody will service — the same class
// `repair-mangled-titles.mjs` closes on ("the rows that have already fallen out
// of Google's window and will never be swept again").
//
// ── HOW IT MENDS THEM: BY RUNNING THE APP'S OWN CODE ────────────────────────
//
// It imports `indexSource` from the working tree and calls it with `force`,
// exactly as the sweep would. Not a reimplementation — the same chunker, the
// same embedding model, the same vector ids, the same counters. A script that
// wrote its own version of this would be a second definition of what a passage
// is, and the day the two drifted the base would hold chunks nothing else could
// reproduce. `env.AI` and `env.KNOWLEDGE_INDEX` are the REST doors standing in
// for the bindings, which is the shape kb-bench.mjs already proved.
//
// COST: about 23 embeddings, a few neurons. Nothing else is touched.
//
//   node --experimental-transform-types scripts/rechunk-stale-passages.mjs
//   node --experimental-transform-types scripts/rechunk-stale-passages.mjs --apply
//
// STAGING ONLY.

import "./lib/shared-alias.mjs"

import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { cloudflareCredentials } from "./lib/cf-credentials.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, "..")
const APPLY = process.argv.includes("--apply")

if (process.argv.includes("--production")) {
  console.error("This script is staging-only. Production holds no team data.")
  process.exit(1)
}

/** THE MARK the mis-decoding always leaves. One character, and it cannot occur in
 * correctly-decoded UTF-8 text this app produces — `repair-mangled-titles.mjs`
 * uses the same one, so both scripts agree about what "mangled" means. */
const MARKER = "Ã"

const { account: ACCOUNT, token: TOKEN } = cloudflareCredentials()
const CORE = process.env.KB_CORE || "1df02340-fc91-4cac-8ccb-d19528dcd9f7"
const INDEX = process.env.KB_INDEX || "kwapso-knowledge-staging"

const CF = "https://api.cloudflare.com/client/v4"
async function cf(path, body) {
  const res = await fetch(`${CF}/accounts/${ACCOUNT}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  })
  const json = await res.json()
  if (!json.success && json.errors)
    throw new Error(`${path}: ${JSON.stringify(json.errors).slice(0, 300)}`)
  return json.result
}
const sql = async (db, statement, params = []) =>
  (await cf(`/d1/database/${db}/query`, { sql: statement, params }))[0].results

/** Vectorize and Workers AI as the bindings look from inside the worker — the
 * same two stand-ins kb-bench.mjs uses, and the same argument: a Worker gives a
 * binding, Node gives a `fetch`, and nothing else about the call differs. */
const KNOWLEDGE_INDEX = {
  async upsert(vectors) {
    const ndjson = vectors.map((v) => JSON.stringify(v)).join("\n")
    const res = await fetch(`${CF}/accounts/${ACCOUNT}/vectorize/v2/indexes/${INDEX}/upsert`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/x-ndjson" },
      body: ndjson,
      signal: AbortSignal.timeout(120_000),
    })
    const json = await res.json()
    if (!json.success) throw new Error(`vectorize upsert: ${JSON.stringify(json.errors).slice(0, 300)}`)
    return json.result
  },
  async deleteByIds(ids) {
    if (!ids.length) return
    const res = await fetch(`${CF}/accounts/${ACCOUNT}/vectorize/v2/indexes/${INDEX}/delete_by_ids`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
      signal: AbortSignal.timeout(60_000),
    })
    const json = await res.json()
    if (!json.success) throw new Error(`vectorize delete: ${JSON.stringify(json.errors).slice(0, 300)}`)
  },
}
const AI = {
  async run(model, input) {
    const res = await fetch(`${CF}/accounts/${ACCOUNT}/ai/run/${model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(120_000),
    })
    const json = await res.json()
    if (!json.success) throw new Error(`ai: ${JSON.stringify(json.errors).slice(0, 300)}`)
    return json.result
  },
}

const { indexSource } = await import(join(REPO, "workers", "content", "src", "lib", "knowledge.ts"))

const FINGERPRINT = ["knowledge_sources", "knowledge_chunks", "internal_rates", "google_sources"]
async function proveTeamDatabase(db, name) {
  const found = (
    await sql(
      db,
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${FINGERPRINT.map(() => "?").join(",")})`,
      FINGERPRINT
    )
  ).map((r) => r.name)
  if (found.length !== FINGERPRINT.length)
    throw new Error(`REFUSING to touch ${name} (${db}): not a Brimba team schema.`)
}

console.log(
  `rechunk-stale-passages — staging${APPLY ? "" : "  (DRY RUN, nothing will be written)"}\n`
)

const teams = await sql(CORE, "SELECT id, name, database_id FROM teams WHERE database_id IS NOT NULL")
const cfg = { accountId: ACCOUNT, apiToken: TOKEN }
const env = { AI, KNOWLEDGE_INDEX, DB: null }
let totalRebuilt = 0

for (const team of teams) {
  await proveTeamDatabase(team.database_id, team.name)

  // THE SOURCES WHOSE PASSAGES DISAGREE WITH THEM. Both halves are required:
  // a chunk still carrying the mark, and a source that no longer does. A source
  // that is ITSELF still mangled is a different job (repair-mangled-titles) and
  // re-chunking it would faithfully rebuild the mangling.
  // R14: bounded by the mark, which is a handful of rows.
  const stale = await sql(
    team.database_id,
    `SELECT s.id, s.title, s.kind, s.owner_user_id,
            (SELECT COUNT(*) FROM knowledge_chunks c WHERE c.source_id = s.id AND c.text LIKE ?) AS bad
       FROM knowledge_sources s
      WHERE s.deactivated_at IS NULL
        AND s.title NOT LIKE ? AND COALESCE(s.body, '') NOT LIKE ?
        AND EXISTS (SELECT 1 FROM knowledge_chunks c WHERE c.source_id = s.id AND c.text LIKE ?)
      ORDER BY s.id LIMIT 500`,
    [`%${MARKER}%`, `%${MARKER}%`, `%${MARKER}%`, `%${MARKER}%`]
  )
  const chunks = stale.reduce((n, r) => n + Number(r.bad ?? 0), 0)
  console.log(`  ${team.name}: ${stale.length} sources whose passages are stale (${chunks} chunks)`)
  for (const r of stale.slice(0, 10)) console.log(`    [${r.kind}] ${String(r.title).slice(0, 68)}`)
  if (!stale.length || !APPLY) {
    console.log("")
    continue
  }

  for (const r of stale) {
    // THE APP'S OWN CODE, forced past the hash so it really rebuilds. `guard` is
    // shaped exactly as the worker builds it; the OWNER clause inside indexSource
    // reads `owner_user_id` off the row, so passing the source's own owner keeps
    // a personal source personal.
    const guard = {
      userId: r.owner_user_id ?? "",
      teamId: team.id,
      roleId: "",
      databaseId: team.database_id,
    }
    let progress = await indexSource(env, cfg, guard, r.id, { force: true })
    // A long source indexes in slices; keep going until it says it is done, the
    // same loop the sweep runs.
    let guardCount = 0
    while (!progress.done && guardCount++ < 50)
      progress = await indexSource(env, cfg, guard, r.id, {})
    totalRebuilt++
  }
  console.log(`    rebuilt ${stale.length}\n`)
}

// ── READ BACK OFF THE DATABASE, never off what this script believes it did ──
let remaining = 0
for (const team of teams) {
  const [row] = await sql(
    team.database_id,
    `SELECT COUNT(*) AS n FROM knowledge_chunks c JOIN knowledge_sources s ON s.id = c.source_id
      WHERE c.text LIKE ? AND s.deactivated_at IS NULL`,
    [`%${MARKER}%`]
  )
  remaining += Number(row.n ?? 0)
}
console.log("")
console.log(
  APPLY
    ? `rebuilt ${totalRebuilt} sources; ${remaining} passages still carry "${MARKER}" across staging.`
    : `Dry run. ${remaining} passages carry "${MARKER}" right now. Re-run with --apply.`
)
