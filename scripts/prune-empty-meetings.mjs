// CLEAR THE MEETINGS NOBODY HELD AND NOBODY WROTE ON — the mess, after the maker
// has been fixed.
//
// WHAT THIS IS FOR. A recurring series files one knowledge source per occurrence,
// for ever forwards. With no agenda, no notes and no transcript, the whole body
// such a source can build is its own first line — "🧡 Team Assembly is a meeting
// of ours, on 2027-05-19." — about a day that has not arrived. Staging held
// hundreds. Asked "what came out of the Team Assembly?" the base returned six
// passages and six citations and every one was a 2027 placeholder, while the
// 92-chunk transcript of the real August meeting was not among them.
//
// THE MAKER IS FIXED FIRST, and this script is second on purpose: the `meeting`
// lane in knowledge-ingest.ts no longer files these, and its textVersion bump
// makes the sweep walk back and retire the ones already filed. So THIS SCRIPT
// DOES NOTHING THE NEXT SWEEP WOULD NOT DO. Its value is that it does it now,
// visibly, and in a dry run first — a preview of the blast radius before the
// deploy, rather than a surprise afterwards.
//
// THE DEFINITION IS NOT A HEURISTIC, and that is the point. It does not guess
// from `chunk_count`; it joins the source back to the `meetings` row and applies
// the SAME four conditions the ingest lane applies, read from the same columns.
// A cleanup that used its own definition could disagree with the fix, and the
// direction it would disagree in is the one that destroys a transcript.
//
// REVERSIBLE, AND HERE IS EXACTLY HOW FAR. No `meetings` row and no
// `knowledge_sources` row is deleted; `deactivated_at` is set, as everywhere else
// in this codebase, and `--undo` puts back precisely what this script switched
// off and nobody else's work (it stamps its own deactivator name to find it).
//
// The DERIVED rows — the chunks and their postings — are cleared, because a
// source that stops being readable while its passages stay quotable is the worst
// of both. They are rebuilt rather than restored: the clear also nulls
// `content_hash`, which is the flag the sweep reads as "index this again". So the
// full undo is `--undo` followed by a sweep, and that is a sentence somebody
// running this should read before they need it, not after.
//
//   node scripts/prune-empty-meetings.mjs                 # DRY RUN on staging
//   node scripts/prune-empty-meetings.mjs --apply         # do it, on staging
//   node scripts/prune-empty-meetings.mjs --undo          # put back what it did
//   node scripts/prune-empty-meetings.mjs --production --apply --yes-production
//
// Production needs BOTH extra flags and is refused otherwise. This is one team's
// imported customer material; the approval that covers staging does not cover it.

import { execSync } from "node:child_process"

const APPLY = process.argv.includes("--apply")
/** Clear the vectors for rows this script already retired, and nothing else.
 * Exists because the first run did not, and see the essay at `dropVectors`. */
const VECTORS_ONLY = process.argv.includes("--vectors")
const UNDO = process.argv.includes("--undo")
const PRODUCTION = process.argv.includes("--production")
const CONFIRMED = process.argv.includes("--yes-production")

if (PRODUCTION && !CONFIRMED) {
  console.error(
    "Refusing production without --yes-production. This is imported customer material,\n" +
      "and the approval that covers staging does not reach it. Ask the owner, then pass both flags."
  )
  process.exit(1)
}

/** THE SAFETY RAIL, and it guards the one outcome that would be unrecoverable in
 * practice. The junk rows carry a single chunk — a title and a date. The
 * transcripts that SHARE THEIR TITLES carry ninety-odd. If anything in the set
 * has more than this, the definition has drifted and the script stops without
 * writing: destroying a 96-chunk "Week recap" transcript because it is named like
 * the placeholders is the worst thing available here. */
const MAX_CHUNKS_IN_SET = 3

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "b5bb3d84a59c029ea5e0fe164dab1cf7"
const TOKEN =
  process.env.CLOUDFLARE_API_TOKEN ||
  execSync("security find-generic-password -s cloudflare-token-kwapso -w").toString().trim()
const CORE = PRODUCTION
  ? process.env.KB_CORE_PROD || "e55a2c0f-346a-4056-b01c-7869a8b253dc"
  : process.env.KB_CORE || "1df02340-fc91-4cac-8ccb-d19528dcd9f7"
/** The name this script stamps, so `--undo` can find exactly its own work. */
const ACTOR = "prune-empty-meetings"
const INDEX = PRODUCTION
  ? process.env.KB_INDEX_PROD || "kwapso-knowledge"
  : process.env.KB_INDEX || "kwapso-knowledge-staging"

const CF = "https://api.cloudflare.com/client/v4"
async function sql(db, statement, params = []) {
  const res = await fetch(`${CF}/accounts/${ACCOUNT}/d1/database/${db}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql: statement, params }),
    signal: AbortSignal.timeout(60_000),
  })
  const json = await res.json()
  if (!json.success) throw new Error(`${statement.slice(0, 60)}…: ${JSON.stringify(json.errors).slice(0, 300)}`)
  return json.result[0].results
}

/** THE SAME FOUR CONDITIONS THE INGEST LANE APPLIES, read off the same columns —
 * see knowledge-ingest.ts, the `meeting` kind's `retired`. Nothing about
 * `chunk_count` is in the WHERE: the count is REPORTED so a human can check the
 * rail above, never used to decide. */
const FIND = `
  SELECT s.id, s.title, s.chunk_count, substr(m.starts_at, 1, 10) AS day
    FROM knowledge_sources s
    JOIN meetings m ON m.id = s.origin_row_id
   WHERE s.origin_table = 'meetings'
     AND s.deactivated_at IS NULL
     AND COALESCE(m.agenda, '') = ''
     AND COALESCE(m.notes, '') = ''
     AND COALESCE(m.transcript_text, '') = ''
     AND m.starts_at > ?
   ORDER BY s.title, day`

/** THE VECTORS GO TOO, AND LEAVING THEM WAS A REAL MISTAKE.
 *
 * The first version of this script left them, with a comment saying R26 makes a
 * stale id safe — a ghost reads back as no row, never as somebody else's
 * paragraph. That is true and it is not sufficient, and the bench said so within
 * a minute of the run: "summarise the week recap meeting" went from six passages
 * to a REFUSAL. Safe is not the same as harmless. Those 468 stale vectors are
 * still the nearest neighbours of every question about the week recap, so they
 * filled the ranking, read back as nothing, and the base answered that it holds
 * nothing about a meeting it holds two 96-chunk transcripts of.
 *
 * The app's own `clearIndex` deletes them for exactly this reason. A cleanup
 * script that skips a step the application does not skip is not a lighter touch,
 * it is a different and worse operation.
 *
 * Derived ids (`chunkVectorId` / `recordVectorId`): `<sourceId>:00000` for each
 * chunk and `<sourceId>:summary` for the record's own cover. Every row in this
 * set held one chunk — the rail above refuses to run otherwise — and a few extra
 * sequences are asked for anyway, because deleting an id that is not there costs
 * nothing and missing one costs an answer. */
const VECTOR_DELETE_BATCH = 100
async function dropVectors(ids) {
  const vectorIds = ids.flatMap((id) => [
    `${id}:summary`,
    ...Array.from({ length: MAX_CHUNKS_IN_SET }, (_, seq) => `${id}:${String(seq).padStart(5, "0")}`),
  ])
  let gone = 0
  // 100 A CALL — Vectorize's own ceiling, refused loudly on the first run at 500.
  for (let i = 0; i < vectorIds.length; i += VECTOR_DELETE_BATCH) {
    const res = await fetch(`${CF}/accounts/${ACCOUNT}/vectorize/v2/indexes/${INDEX}/delete_by_ids`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ids: vectorIds.slice(i, i + VECTOR_DELETE_BATCH) }),
      signal: AbortSignal.timeout(60_000),
    })
    const json = await res.json()
    if (!json.success) throw new Error(`vectorize: ${JSON.stringify(json.errors).slice(0, 300)}`)
    gone += vectorIds.slice(i, i + VECTOR_DELETE_BATCH).length
  }
  return gone
}

const where = PRODUCTION ? "PRODUCTION" : "staging"
console.log(`prune-empty-meetings — ${where}${APPLY || UNDO ? "" : "  (DRY RUN, nothing will be written)"}\n`)

const teams = await sql(CORE, "SELECT id, name, database_id FROM teams WHERE database_id IS NOT NULL")
let totalFound = 0
let totalWritten = 0

for (const team of teams) {
  const db = team.database_id
  if (VECTORS_ONLY) {
    const mine = await sql(
      db,
      "SELECT id FROM knowledge_sources WHERE deactivator_name = ? AND deactivated_at IS NOT NULL",
      [ACTOR]
    )
    if (!mine.length) {
      console.log(`${team.name}: nothing this script retired`)
      continue
    }
    const gone = await dropVectors(mine.map((r) => r.id))
    console.log(`${team.name}: asked the index to drop ${gone} ids for ${mine.length} sources`)
    totalWritten += mine.length
    continue
  }
  if (UNDO) {
    const back = await sql(
      db,
      `UPDATE knowledge_sources SET deactivated_at = NULL, deactivator_name = NULL, updated_at = ?
        WHERE deactivator_name = ? AND deactivated_at IS NOT NULL RETURNING id`,
      [new Date().toISOString(), ACTOR]
    )
    console.log(
      `${team.name}: put back ${back.length}` +
        (back.length ? " — run the sweep to rebuild their chunks (content_hash was cleared)" : "")
    )
    totalWritten += back.length
    continue
  }

  const rows = await sql(db, FIND, [new Date().toISOString()])
  if (!rows.length) {
    console.log(`${team.name}: nothing to do`)
    continue
  }
  totalFound += rows.length

  // THE RAIL, CHECKED BEFORE ANYTHING IS WRITTEN and reported in the dry run too.
  const biggest = rows.reduce((a, r) => Math.max(a, r.chunk_count), 0)
  const fat = rows.filter((r) => r.chunk_count > MAX_CHUNKS_IN_SET)
  console.log(`${team.name}: ${rows.length} sources, largest ${biggest} chunk(s)`)
  const byTitle = new Map()
  for (const r of rows) byTitle.set(r.title, (byTitle.get(r.title) ?? 0) + 1)
  for (const [title, n] of [...byTitle].sort((a, b) => b[1] - a[1]))
    console.log(`   ${String(n).padStart(4)}  ${title}`)
  if (fat.length) {
    console.error(
      `\nSTOPPING. ${fat.length} row(s) in the set carry more than ${MAX_CHUNKS_IN_SET} chunks, ` +
        `which means the definition has drifted onto real material:\n` +
        fat.map((r) => `   ${r.chunk_count} chunks — ${r.title} (${r.day})`).join("\n")
    )
    process.exit(1)
  }

  // WHAT IT IS LEAVING BEHIND, so the dry run can be read for false NEGATIVES as
  // well as false positives — the transcripts that share these titles, which must
  // survive, and any thin meeting it deliberately did not take.
  //
  // ASKED AS THE COMPLEMENT, not as "everything except these ids". Binding the
  // ids meant 234 parameters against D1's ceiling of 100, and it failed on the
  // first run — the same cap the workers are held to (R14). Negating the four
  // conditions needs one parameter and a handful of titles.
  const kept = await sql(
    db,
    `SELECT s.title, s.chunk_count, substr(m.starts_at, 1, 10) AS day
       FROM knowledge_sources s JOIN meetings m ON m.id = s.origin_row_id
      WHERE s.origin_table = 'meetings' AND s.deactivated_at IS NULL
        AND s.title IN (${[...byTitle.keys()].map(() => "?").join(", ")})
        AND NOT (COALESCE(m.agenda, '') = '' AND COALESCE(m.notes, '') = ''
                 AND COALESCE(m.transcript_text, '') = '' AND m.starts_at > ?)
      ORDER BY s.chunk_count DESC LIMIT 12`,
    [...byTitle.keys(), new Date().toISOString()]
  )
  console.log(`   — keeping ${kept.length ? "" : "nothing "}under the same titles:`)
  for (const k of kept) console.log(`     ${String(k.chunk_count).padStart(3)} chunks  ${k.day}  ${k.title}`)

  if (!APPLY) continue
  const now = new Date().toISOString()
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50)
    const done = await sql(
      db,
      // R17's discipline: the predicate rides the UPDATE, so re-running this
      // moves zero rows rather than re-stamping somebody else's retirement.
      `UPDATE knowledge_sources SET deactivated_at = ?, deactivator_name = ?, updated_at = ?
        WHERE id IN (${batch.map(() => "?").join(", ")}) AND deactivated_at IS NULL RETURNING id`,
      [now, ACTOR, now, ...batch.map((r) => r.id)]
    )
    totalWritten += done.length
  }
  // The chunks go with it, or the source stops being readable while its passages
  // stay quotable. The sweep's own retire path calls indexSource for this; here
  // the derived rows are cleared directly, in the same order: postings, chunks.
  const ids = rows.map((r) => r.id)
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    const marks = batch.map(() => "?").join(", ")
    await sql(
      db,
      `DELETE FROM knowledge_terms WHERE chunk_id IN
         (SELECT id FROM knowledge_chunks WHERE source_id IN (${marks}))`,
      batch
    )
    await sql(db, `DELETE FROM knowledge_chunks WHERE source_id IN (${marks})`, batch)
    await sql(
      db,
      `UPDATE knowledge_sources SET chunk_count = 0, indexed_chunks = 0, indexed_at = NULL,
              content_hash = NULL WHERE id IN (${marks})`,
      batch
    )
  }
  const dropped = await dropVectors(ids)
  console.log(`   dropped ${dropped} vector ids for ${ids.length} sources`)
}

console.log(
  UNDO
    ? `\nput back ${totalWritten}`
    : APPLY
      ? `\nswitched off ${totalWritten} of ${totalFound}`
      : `\nDRY RUN — would switch off ${totalFound}. Nothing was written. Re-run with --apply.`
)
console.log(
  "\nThe vectors go with the chunks. R26 makes a stale id SAFE — it reads back as no row, never as\n" +
    "somebody else's paragraph — but safe is not harmless: a stale id is still a nearest neighbour, so\n" +
    "it fills the ranking and the answer comes back empty. Measured, the first time this ran."
)
