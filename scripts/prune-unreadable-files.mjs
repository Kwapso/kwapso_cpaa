// CLEAR THE FILES WE NEVER MANAGED TO READ — the mess, after the maker is fixed.
//
// WHAT THIS IS FOR. The largest "documents" the agency held were not documents:
// Adobe Illustrator logos, Outlook templates and vectorised PDFs, chunked and
// embedded as if they were prose. Because they were the biggest sources they
// carried weight in every neighbourhood while saying nothing.
//
// THE MAKER IS FIXED FIRST and this is second, exactly as the meetings prune was:
// `driveFileText` now applies the prose guard on the path that skipped it, a PDF
// must read like words as well as look readable, and .eps/.oft/.otf are opaque so
// nothing is downloaded at all. This script does not invent a definition — it
// imports THE SAME FUNCTIONS and asks them about the text already stored. A
// cleanup with its own definition could disagree with the fix, and the direction
// it would disagree in is the one that deletes a power of attorney.
//
// TWO SENTENCES CARRIED OVER FROM THE MEETINGS PRUNE, because they cost an
// answer the first time and they are the most reusable thing in either script:
//
//   SAFE IS NOT HARMLESS. That run left the vectors behind, reasoning that R26
//   makes a stale id read back as no row rather than as somebody else's
//   paragraph. True, and beside the point: a stale id is still a nearest
//   neighbour, so 468 of them filled the ranking for every week-recap question
//   and the base began REFUSING a question it had answered with six passages a
//   minute earlier.
//
//   A CLEANUP THAT SKIPS A STEP THE APPLICATION DOES NOT SKIP is not a lighter
//   touch, it is a different and worse operation. `clearIndex` drops the vectors;
//   so does this, in the same order: postings, chunks, vectors.
//
//   node scripts/prune-unreadable-files.mjs                 # DRY RUN on staging
//   node scripts/prune-unreadable-files.mjs --apply         # do it, on staging
//   node scripts/prune-unreadable-files.mjs --undo          # put back what it did
//   node scripts/prune-unreadable-files.mjs --production --apply --yes-production
//
// Reversible as far as it can be: no row is deleted, `deactivated_at` is set, and
// `--undo` finds its own work by the name it stamps. The derived rows are REBUILT
// rather than restored — the clear nulls `content_hash`, which is the flag the
// sweep reads as "index this again" — so a full undo is `--undo` then a sweep.
//
// Run with: node --experimental-transform-types (it imports the shipped lib).

import "./lib/shared-alias.mjs"

import { execSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const { fileShape, looksLikeProse, readsLikeWords } = await import(
  join(HERE, "..", "workers", "content", "src", "lib", "file-text.ts")
)

const APPLY = process.argv.includes("--apply")
const UNDO = process.argv.includes("--undo")
const PRODUCTION = process.argv.includes("--production")
const CONFIRMED = process.argv.includes("--yes-production")
if (PRODUCTION && !CONFIRMED) {
  console.error("Refusing production without --yes-production. Ask the owner, then pass both flags.")
  process.exit(1)
}

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "b5bb3d84a59c029ea5e0fe164dab1cf7"
const TOKEN =
  process.env.CLOUDFLARE_API_TOKEN ||
  execSync("security find-generic-password -s cloudflare-token-kwapso -w").toString().trim()
const CORE = PRODUCTION
  ? process.env.KB_CORE_PROD || "e55a2c0f-346a-4056-b01c-7869a8b253dc"
  : process.env.KB_CORE || "1df02340-fc91-4cac-8ccb-d19528dcd9f7"
const INDEX = PRODUCTION
  ? process.env.KB_INDEX_PROD || "kwapso-knowledge"
  : process.env.KB_INDEX || "kwapso-knowledge-staging"
const ACTOR = "prune-unreadable-files"
const VECTOR_DELETE_BATCH = 100

/** THE RAIL. A file we could not read has no words in it, so nothing in the set
 * should score anywhere near prose. If something does, the definition has drifted
 * onto real material and the script stops without writing — deleting a power of
 * attorney because it sits in a folder of logos is the worst outcome here. */
const MAX_WORDISH_IN_SET = 0.2

const CF = "https://api.cloudflare.com/client/v4"
async function sql(db, statement, params = []) {
  const res = await fetch(`${CF}/accounts/${ACCOUNT}/d1/database/${db}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql: statement, params }),
    signal: AbortSignal.timeout(60_000),
  })
  const json = await res.json()
  if (!json.success) throw new Error(`${statement.slice(0, 50)}…: ${JSON.stringify(json.errors).slice(0, 300)}`)
  return json.result[0].results
}

async function dropVectors(ids, chunkCounts) {
  const vectorIds = ids.flatMap((id) => [
    `${id}:summary`,
    ...Array.from({ length: (chunkCounts.get(id) ?? 0) + 1 }, (_, seq) => `${id}:${String(seq).padStart(5, "0")}`),
  ])
  for (let i = 0; i < vectorIds.length; i += VECTOR_DELETE_BATCH) {
    const res = await fetch(`${CF}/accounts/${ACCOUNT}/vectorize/v2/indexes/${INDEX}/delete_by_ids`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ids: vectorIds.slice(i, i + VECTOR_DELETE_BATCH) }),
      signal: AbortSignal.timeout(60_000),
    })
    const json = await res.json()
    if (!json.success) throw new Error(`vectorize: ${JSON.stringify(json.errors).slice(0, 300)}`)
  }
  return vectorIds.length
}

/** The wordish share, the number the rail is expressed in — the same measure
 * `readsLikeWords` decides on, reported so a human can see the margin rather than
 * a yes or a no. */
function wordish(text) {
  const tokens = String(text || "").slice(0, 4000).split(/\s+/).filter(Boolean)
  // NULL, NOT 1, WHEN THERE IS NOTHING TO JUDGE. Returning 1 made an image with
  // an empty body look like perfect prose, which fired the rail on every .png in
  // the set and would have stopped the script on its own junk.
  if (tokens.length < 10) return null
  return tokens.filter((t) => /^[\p{L}][\p{L}'’-]{1,23}[.,;:!?)"'’]?$/u.test(t)).length / tokens.length
}

console.log(
  `prune-unreadable-files — ${PRODUCTION ? "PRODUCTION" : "staging"}` +
    `${APPLY || UNDO ? "" : "  (DRY RUN, nothing will be written)"}\n`
)

const teams = await sql(CORE, "SELECT id, name, database_id FROM teams WHERE database_id IS NOT NULL")
let totalFound = 0
for (const team of teams) {
  const db = team.database_id
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
    continue
  }

  // EVERY SOURCE THAT CAME OUT OF A FILE, judged by the shipped functions on the
  // text that is actually stored. `chunk_count` decides nothing; it is reported.
  //
  // SELECTED BY ORIGIN, NOT BY `file_name`, which was the first attempt and found
  // nothing at all: `file_name` is set for a file somebody UPLOADED through the
  // door, and every one of these came through the Drive mirror, where it is null.
  // The origin table is the fact that does not depend on which door a file
  // arrived by.
  const rows = await sql(
    db,
    `SELECT id, title, chunk_count, substr(body, 1, 6000) AS head
       FROM knowledge_sources
      WHERE deactivated_at IS NULL AND chunk_count > 0
        AND (file_name IS NOT NULL OR origin_table = 'google_drive')`
  )
  const doomed = []
  for (const r of rows) {
    // The mirror puts the title in front of the body; take it off before judging,
    // exactly as `indexableText` put it on.
    const body = String(r.head).replace(r.title, " ").trim()
    const shape = fileShape(r.title, "")
    const w = wordish(body)
    const unreadable =
      shape === "opaque" || !looksLikeProse(body) || (shape === "pdf" && !readsLikeWords(body))
    // IF IT READS LIKE WORDS, IT IS MATERIAL, whatever else is wrong with its
    // bytes — and this clause exists because the rail below caught a real one.
    // `RÜCKGABEPROTOKOLL` is a German return protocol with no extension in its
    // title; enough of its bytes are odd that `looksLikeProse` refused it, while
    // three quarters of its tokens are ordinary German words. The alarm was right
    // and turning it into a RULE is better than reading it every time: a document
    // that reads like prose is never junk, so it is never in the set.
    if (unreadable && !(w !== null && w > MAX_WORDISH_IN_SET)) doomed.push({ ...r, w, shape })
  }
  if (!doomed.length) {
    console.log(`${team.name}: nothing to do`)
    continue
  }
  totalFound += doomed.length
  const chunks = doomed.reduce((a, r) => a + r.chunk_count, 0)
  console.log(`${team.name}: ${doomed.length} sources, ${chunks} chunks`)
  for (const r of [...doomed].sort((a, b) => b.chunk_count - a.chunk_count))
    console.log(
      `   ${String(r.chunk_count).padStart(4)}ch  wordish ${r.w === null ? "  n/a" : r.w.toFixed(3)}` +
        `  ${r.shape.padEnd(7)} ${String(r.title).slice(0, 52)}`
    )

  // THE THING WHOSE CONTENT IS REAL AND WHOSE BYTES ARE NOT, said out loud rather
  // than left in a list of a hundred and thirty.
  //
  // Every PDF in this base is stored as BYTES — Drive files were never
  // text-extracted — so a power of attorney and a vectorised logo are equally
  // unreadable HERE even though only one of them is meaningless. Nothing in the
  // text can tell them apart, because the text does not exist. Retiring one loses
  // nothing that was ever answerable and loses the ROW, so the fix that makes it
  // readable has to re-file it: it is not a substitute for extraction.
  const substantial = doomed.filter((r) => r.chunk_count >= 5 && r.shape === "pdf")
  if (substantial.length) {
    console.log(
      `\n   !! ${substantial.length} of these are PDFs carrying five chunks or more. Their CONTENT may be\n` +
        `      real — every PDF here is stored as raw bytes, so a power of attorney and a logo\n` +
        `      look identical to any text test. A human should read this list:`
    )
    for (const r of substantial) console.log(`      ${String(r.chunk_count).padStart(3)}ch  ${r.title}`)
  }

  // JUDGED ONLY WHERE THERE IS ENOUGH TEXT TO JUDGE.
  const fat = doomed.filter((r) => r.w !== null && r.w > MAX_WORDISH_IN_SET)
  if (fat.length) {
    console.error(
      `\nSTOPPING. ${fat.length} row(s) read too much like prose to be junk:\n` +
        fat.map((r) => `   ${r.w.toFixed(3)}  ${r.title}`).join("\n")
    )
    process.exit(1)
  }

  // AND WHAT IT KEEPS, so the dry run can be read for false NEGATIVES too — the
  // real documents that sit in the same folders and must survive.
  const kept = rows
    .filter((r) => !doomed.some((d) => d.id === r.id))
    .map((r) => ({ ...r, w: wordish(String(r.head).replace(r.title, " ")) ?? 0 }))
    .sort((a, b) => b.chunk_count - a.chunk_count)
    .slice(0, 8)
  console.log(`   — keeping ${rows.length - doomed.length} readable files, largest:`)
  for (const k of kept)
    console.log(`     ${String(k.chunk_count).padStart(4)}ch  wordish ${k.w.toFixed(3)}  ${String(k.title).slice(0, 52)}`)

  if (!APPLY) continue
  const now = new Date().toISOString()
  const ids = doomed.map((r) => r.id)
  const counts = new Map(doomed.map((r) => [r.id, r.chunk_count]))
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    const marks = batch.map(() => "?").join(", ")
    await sql(
      db,
      `UPDATE knowledge_sources SET deactivated_at = ?, deactivator_name = ?, updated_at = ?
        WHERE id IN (${marks}) AND deactivated_at IS NULL`,
      [now, ACTOR, now, ...batch]
    )
    await sql(
      db,
      `DELETE FROM knowledge_terms WHERE chunk_id IN (SELECT id FROM knowledge_chunks WHERE source_id IN (${marks}))`,
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
  console.log(`   switched off ${ids.length}, dropped ${await dropVectors(ids, counts)} vector ids`)
}

console.log(
  UNDO ? "" : APPLY ? `\ndone` : `\nDRY RUN — would switch off ${totalFound}. Nothing was written.`
)
