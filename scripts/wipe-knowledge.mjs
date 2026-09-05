// wipe-knowledge — empty ONE team's knowledge base, rows and vectors together.
//
//   cf-exec node scripts/wipe-knowledge.mjs staging --dry-run
//   cf-exec node scripts/wipe-knowledge.mjs staging --yes
//
// WHY THIS IS A SCRIPT AND NOT A BUTTON. Emptying the knowledge base is not a
// feature — it is a one-off repair. A door that could do it would be a
// permanent, gated, destructive surface on a live app for the sake of something
// that happens once, and R10's whole argument is that every door is reachable by
// somebody. So it lives out here with the other destructive script, refuses to
// guess its account, and prints exactly what it will remove before it does.
//
// TWO STORES, AND THEY MUST GO TOGETHER. The passages live in the team's own D1
// (`knowledge_sources`, `knowledge_chunks`, `knowledge_terms`) and their
// embeddings live in an account-wide Vectorize index, partitioned by team
// namespace (R26). Emptying one and not the other leaves the search able to
// match a passage the database can no longer read back — which is not an empty
// knowledge base, it is a broken one.
//
// SO THE VECTORS GO BY ID, read out of the rows before the rows are removed,
// never by clearing the index: the index is ACCOUNT-WIDE, and another team's
// namespace is in there.
//
// The cursors go too (`knowledge_ingest`). Leaving them would tell the next
// sweep it had already read everything, and the base would stay empty.

// The account, DERIVED rather than carried: `expectedAccount()` reads the ten
// `CF_ACCOUNT_ID` declarations in the workers' own wrangler configs and requires
// them to agree. See check-cloudflare-account.mjs — its header argued against a
// third literal copy while five of them existed; this is one of the five.
import { expectedAccount } from "./check-cloudflare-account.mjs"

const KWAPSO_ACCOUNT_ID = expectedAccount()
if (process.env.CLOUDFLARE_ACCOUNT_ID !== KWAPSO_ACCOUNT_ID) {
  console.error(
    `Refusing to run: CLOUDFLARE_ACCOUNT_ID is ${process.env.CLOUDFLARE_ACCOUNT_ID ?? "unset"},\n` +
      `and this script only ever touches ${KWAPSO_ACCOUNT_ID}. Run it through cf-exec.`
  )
  process.exit(2)
}

const env = process.argv[2]
const GO = process.argv.includes("--yes")
if (env !== "staging" && env !== "production") {
  console.error("usage: cf-exec node scripts/wipe-knowledge.mjs <staging|production> [--yes]")
  process.exit(2)
}
if (env === "production" && !process.argv.includes("--i-mean-production")) {
  console.error("Refusing production without --i-mean-production.")
  process.exit(2)
}

const CORE = env === "staging" ? "1df02340-fc91-4cac-8ccb-d19528dcd9f7" : null
const INDEX = env === "staging" ? "kwapso-knowledge-staging" : "kwapso-knowledge"

/* THE REST DOOR, BY DATABASE ID — the same door the workers use, and the reason
   is not preference: `wrangler d1 execute` addresses a database by NAME, and the
   core `teams` table records only the id. Looking a name up would mean guessing
   a convention, and a destructive script may not guess. */
const API = "https://api.cloudflare.com/client/v4"
const TOKEN = process.env.CLOUDFLARE_API_TOKEN
if (!TOKEN) {
  console.error("Refusing to run: no CLOUDFLARE_API_TOKEN. Run it through cf-exec.")
  process.exit(2)
}

async function cf(path, body) {
  const r = await fetch(`${API}/accounts/${KWAPSO_ACCOUNT_ID}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const j = await r.json()
  if (!j.success) throw new Error(`${path}: ${JSON.stringify(j.errors ?? j)}`)
  return j.result
}

const d1 = async (dbId, sql) => (await cf(`/d1/database/${dbId}/query`, { sql }))[0]?.results ?? []

/* The team databases this environment's own `teams` table points at — never a
   database found by name in the account, which is how the other script avoids
   another client's data. */
const teams = await d1(CORE, "SELECT id, name, database_id FROM teams WHERE database_id IS NOT NULL")
if (teams.length === 0) {
  console.log("No team databases. Nothing to do.")
  process.exit(0)
}

console.log(`\nwipe-knowledge · ${env}\n${"-".repeat(28)}`)
let totalSources = 0
let totalChunks = 0
const plan = []

for (const team of teams) {
  const db = team.database_id
  const counts = (await d1(
    db,
    "SELECT (SELECT COUNT(*) FROM knowledge_sources) AS sources," +
      " (SELECT COUNT(*) FROM knowledge_chunks) AS chunks," +
      " (SELECT COUNT(*) FROM knowledge_terms) AS terms," +
      " (SELECT COUNT(*) FROM knowledge_ingest) AS cursors"
  ))[0] ?? {}
  plan.push({ team, db, counts })
  totalSources += Number(counts.sources) || 0
  totalChunks += Number(counts.chunks) || 0
  console.log(
    `  ${team.name}\n    sources ${counts.sources} · chunks ${counts.chunks} · ` +
      `terms ${counts.terms} · cursors ${counts.cursors}`
  )
}

console.log(`\n  TOTAL: ${totalSources} sources, ${totalChunks} chunks, and their vectors.`)
console.log(`  The index (${INDEX}) is account-wide — only these ids are deleted from it.\n`)

if (!GO) {
  console.log("  Dry run. Add --yes to actually do it.\n")
  process.exit(0)
}

for (const { team, db } of plan) {
  /* The vector ids, READ BEFORE THE ROWS GO. A chunk's id is its vector's id. */
  const ids = (await d1(db, "SELECT id FROM knowledge_chunks")).map((r) => r.id)
  if (ids.length) {
    /* Vectorize refuses more than 100 ids per call — measured, not assumed:
       it answered 40007 "max id count is 100" to a batch of a thousand. */
    const BATCH = 100
    for (let i = 0; i < ids.length; i += BATCH) {
      await cf(`/vectorize/v2/indexes/${INDEX}/delete_by_ids`, { ids: ids.slice(i, i + BATCH) })
      process.stdout.write(`\r  ${team.name}: ${Math.min(i + BATCH, ids.length)}/${ids.length} vectors`)
    }
    console.log("")
  }
  /* CHUNKS AND TERMS FIRST, then the sources they hang off, then the cursors —
     children before parents, so a foreign key can never refuse half of it. */
  for (const table of ["knowledge_terms", "knowledge_chunks", "knowledge_sources", "knowledge_ingest"])
    await d1(db, `DELETE FROM ${table}`)
  console.log(`  ${team.name}: emptied.`)
}

/* AND READ IT BACK. A wipe that reports success without looking is a claim. */
let bad = 0
for (const { team, db } of plan) {
  const after = (await d1(
    db,
    "SELECT (SELECT COUNT(*) FROM knowledge_sources) AS sources," +
      " (SELECT COUNT(*) FROM knowledge_chunks) AS chunks," +
      " (SELECT COUNT(*) FROM knowledge_ingest) AS cursors"
  ))[0] ?? {}
  const clean = !Number(after.sources) && !Number(after.chunks) && !Number(after.cursors)
  console.log(`  ${clean ? "OK  " : "FAIL"} ${team.name}: ${JSON.stringify(after)}`)
  if (!clean) bad++
}
console.log(bad ? "\nSOMETHING SURVIVED.\n" : "\nEmpty, and the cursors are reset so the next sweep starts from the top.\n")
process.exit(bad ? 1 : 0)
