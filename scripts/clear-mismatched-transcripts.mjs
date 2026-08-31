// UN-CLAIM A MEETING WHOSE TRANSCRIPT IS SOMEBODY ELSE'S CONVERSATION.
//
// ── WHAT WENT WRONG ─────────────────────────────────────────────────────────
//
// The owner asked the assistant about that morning's `⏩ Week planning` and got
// an answer about a meeting SEVEN DAYS EARLIER. The assistant had not invented
// anything: it summarised the document attached to the meeting, faithfully, and
// the document was the wrong one.
//
// `findTranscript` route 2 searches Drive by the meeting's TITLE. A recurring
// meeting wears the same title every week, so every occurrence's notes match,
// and the sort took the most recently MODIFIED hit — which is any week but this
// one. `notesCouldBelongTo` (workers/content/src/lib/google-transcript.ts) now
// rejects a candidate written before its own meeting, so no NEW mismatch can be
// filed. This script is about the ones already on disk.
//
// ── THE INSTRUMENT IS THE DOCUMENT'S OWN DATE, NOT A LIST OF IDS ────────────
//
// It would have been quicker to paste the seven ids. It would also have been a
// claim about the past that nothing could check. Every transcript Google writes
// carries its own date in its first lines, in one of two shapes:
//
//   "✍️ Quick notes\r\n…\r\nAug 24, 2026\r\n…"        the notes doc
//   "HORST errors - 2026/08/13 11:15 IST - Transcript" the verbatim transcript
//
// So the rule is read off the DATA: a conversation cannot have been written down
// before it happened. A stored transcript whose own date precedes its meeting's
// day belongs to a different meeting, and that is the whole test.
//
// IT VERIFIES ITSELF, which is why it is worth the extra work. Measured against
// staging on 2026-08-31 it flags 7 of 40 — and every one of the 7 was found by
// route 2 (`drive`), while all 33 found on the calendar entry itself
// (`attachment`) come back clean. The instrument was not told about routes. If a
// future run ever flags an `attachment` row, the instrument is wrong and the run
// says so rather than quietly deleting something.
//
// A transcript whose date cannot be READ is left alone and counted. Failing
// closed matters more here than coverage: the cost of missing one is that a
// meeting keeps a wrong transcript nobody has noticed; the cost of clearing one
// wrongly is deleting a correct transcript that may no longer be findable.
//
// ── WHAT IT DOES *NOT* TOUCH, AND WHY THAT IS THE CAREFUL PART ──────────────
//
// THE WORK LOGS STAY. Capturing a transcript writes a work log for everyone of
// ours in the room, and those hours are correct — they come from the meeting's
// own start and end, not from the transcript. The seven meetings carry 21 logs
// and 18.25 billable hours between them.
//
// Clearing `transcript_captured_at` is what lets the corrected hunt run again,
// and that column was ALSO the only thing stopping the capture from writing a
// second set of logs. So this repair, run against the code as it stood, would
// have put 18.25 hours nobody worked onto a client's account — silently, with
// the transcript right and the answer right and only the invoice wrong. The
// guard now rides the INSERT instead (`captureTranscript`, R17), proved by
// `transcript-end-to-end.test.ts` › "a re-hunt … does not bill anybody twice",
// which goes red the moment the guard is removed.
//
// Run this only against a build that carries that guard. It checks.
//
//   node scripts/clear-mismatched-transcripts.mjs                 # DRY RUN, staging
//   node scripts/clear-mismatched-transcripts.mjs --apply         # do it, staging
//   node scripts/clear-mismatched-transcripts.mjs --production --apply --yes-production

import { cloudflareCredentials } from "./lib/cf-credentials.mjs"
import { readFileSync } from "node:fs"

const APPLY = process.argv.includes("--apply")
const PRODUCTION = process.argv.includes("--production")
const CONFIRMED = process.argv.includes("--yes-production")

if (PRODUCTION && !CONFIRMED) {
  console.error("Refusing production without --yes-production. Ask the owner, then pass both flags.")
  process.exit(1)
}

// THE GUARD MUST BE IN THE CODE BEFORE THE DATA IS TOUCHED. Read off the source
// rather than assumed: this script's whole safety argument is that a re-capture
// cannot double anybody's hours, and that is a property of the deployed worker,
// not of this file.
const CAPTURE_SRC = new URL("../workers/content/src/lib/meetings.ts", import.meta.url)
if (!readFileSync(CAPTURE_SRC, "utf8").includes("WHERE NOT EXISTS (")) {
  console.error(
    "Refusing to run: workers/content/src/lib/meetings.ts has no NOT EXISTS guard on the meeting\n" +
      "work-log insert. Clearing a transcript without it re-bills every person in the room.\n" +
      "See transcript-end-to-end.test.ts › 'a re-hunt … does not bill anybody twice'."
  )
  process.exit(1)
}

const { account: ACCOUNT, token: TOKEN } = cloudflareCredentials()
const CORE = PRODUCTION
  ? process.env.KB_CORE_PROD || "e55a2c0f-346a-4056-b01c-7869a8b253dc"
  : process.env.KB_CORE || "1df02340-fc91-4cac-8ccb-d19528dcd9f7"

const CF = "https://api.cloudflare.com/client/v4"
async function sql(db, statement, params = []) {
  const res = await fetch(`${CF}/accounts/${ACCOUNT}/d1/database/${db}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql: statement, params }),
    signal: AbortSignal.timeout(60_000),
  })
  const json = await res.json()
  if (!json.success)
    throw new Error(`${statement.slice(0, 60)}…: ${JSON.stringify(json.errors).slice(0, 300)}`)
  return json.result[0].results
}

/** PROVE THE DATABASE FROM ITS SCHEMA, NOT ITS NAME. This Cloudflare account is
 * shared with two other companies and most of its `team-<ulid>` databases are
 * not ours. Two independent oracles: the list comes from THIS environment's core
 * `teams` table, and each database must still carry four tables that only a
 * current team database has together. (The same fence as repair-mangled-titles.) */
const FINGERPRINT = ["knowledge_sources", "knowledge_chunks", "internal_rates", "google_sources"]
async function proveTeamDatabase(db, name) {
  const rows = await sql(
    db,
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${FINGERPRINT.map(() => "?").join(",")})`,
    FINGERPRINT
  )
  if (rows.length !== FINGERPRINT.length)
    throw new Error(
      `REFUSING TO READ ${name} (${db}): it does not carry a Brimba team schema. ` +
        `This account is shared with another company. Stopping.`
    )
}

const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ")

/** THE DATE THE DOCUMENT GIVES ITSELF, as `YYYY-MM-DD`, or null when it does not
 * give one. Only the head is read — a date further down is a date somebody
 * MENTIONED, which is a different sentence entirely. */
export function transcriptOwnDay(text) {
  if (!text) return null
  const head = text.slice(0, 400)
  // "HORST errors - 2026/08/13 11:15 IST - Transcript"
  const slashed = head.match(/\b(\d{4})\/(\d{2})\/(\d{2})\b/)
  if (slashed) return `${slashed[1]}-${slashed[2]}-${slashed[3]}`
  // "Aug 24, 2026", on its own line in the notes document's header block.
  const named = head.match(/(?:^|[\r\n])\s*([A-Z][a-z]{2})[a-z]* (\d{1,2}), (\d{4})\s*(?:[\r\n]|$)/)
  if (named) {
    const m = MONTHS.indexOf(named[1].toLowerCase())
    if (m >= 0)
      return `${named[3]}-${String(m + 1).padStart(2, "0")}-${String(Number(named[2])).padStart(2, "0")}`
  }
  return null
}

const where = PRODUCTION ? "PRODUCTION" : "staging"
console.log(`clear-mismatched-transcripts — ${where}${APPLY ? "" : "  (DRY RUN, nothing will be written)"}\n`)

const teams = await sql(CORE, "SELECT id, name, database_id FROM teams WHERE database_id IS NOT NULL")

let flagged = 0
let unreadable = 0
let cleared = 0
const byRoute = new Map()

for (const team of teams) {
  await proveTeamDatabase(team.database_id, team.name)
  const rows = await sql(
    team.database_id,
    `SELECT id, title, substr(starts_at, 1, 10) AS day, transcript_found_by AS route,
            substr(transcript_text, 1, 400) AS head
       FROM meetings WHERE transcript_captured_at IS NOT NULL ORDER BY starts_at`
  )
  if (!rows.length) {
    console.log(`  ${team.name}: no transcripts`)
    continue
  }

  const judged = rows.map((r) => {
    const own = transcriptOwnDay(r.head)
    return { ...r, own, mismatched: Boolean(own && own < r.day) }
  })
  const bad = judged.filter((r) => r.mismatched)
  const blind = judged.filter((r) => !r.own)
  unreadable += blind.length
  flagged += bad.length

  for (const r of judged) {
    const k = `${r.route ?? "unknown"}`
    const t = byRoute.get(k) ?? { total: 0, bad: 0 }
    t.total++
    if (r.mismatched) t.bad++
    byRoute.set(k, t)
  }

  console.log(
    `  ${team.name}: ${rows.length} transcripts, ${bad.length} carry a document older than their own meeting` +
      `${blind.length ? `, ${blind.length} with no readable date (left alone)` : ""}\n`
  )
  for (const r of bad)
    console.log(`    ${r.day}  ${r.title}\n        holds a document dated ${r.own}   (found by ${r.route})`)
  if (bad.length) console.log("")

  if (!APPLY || !bad.length) continue

  for (const r of bad) {
    // THE PREDICATE RIDES THE UPDATE (R17). A second run matches nothing,
    // because the row it is asked to clear is no longer claimed. The work logs
    // are untouched on purpose — see the header.
    await sql(
      team.database_id,
      `UPDATE meetings
          SET transcript_file_id = NULL, transcript_captured_at = NULL, transcript_text = NULL,
              transcript_note = NULL, transcript_url = NULL, transcript_found_by = NULL
        WHERE id = ? AND transcript_captured_at IS NOT NULL`,
      [r.id]
    )
    cleared++
  }
  console.log(`    cleared ${bad.length}\n`)
}

// ── THE INSTRUMENT CHECKS ITSELF ────────────────────────────────────────────
//
// The rule knows nothing about which route found a document. If it is measuring
// what it claims to, the damage lands on route 2 and nowhere else — so any
// `attachment` row it flags is evidence the RULE is wrong, not the data, and it
// is said loudly rather than folded into a total.
console.log("  by the route that found it:")
for (const [route, t] of [...byRoute].sort()) console.log(`    ${route}: ${t.bad} of ${t.total} mismatched`)
const falseAlarm = (byRoute.get("attachment") ?? { bad: 0 }).bad
if (falseAlarm)
  console.log(
    `\n  ⚠ ${falseAlarm} of the flagged rows were found ON THE CALENDAR ENTRY ITSELF, which route 1\n` +
      `    cannot get wrong. Check the date rule before trusting this run.`
  )

console.log(
  APPLY
    ? `\ncleared ${cleared} mismatched transcripts on ${where}; ${unreadable} had no readable date and were left alone.` +
        `\nThe next transcript hunt will look again, with the corrected rule.`
    : `\n${flagged} would be cleared on ${where} (${unreadable} unreadable, left alone). Re-run with --apply.`
)
