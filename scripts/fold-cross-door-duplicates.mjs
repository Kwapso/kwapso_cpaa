// ONE EVENT, ONE RECORD — retire the sources that are a second door onto
// something the base already holds.
//
// ── THE SHAPE OF THE WASTE ──────────────────────────────────────────────────
//
// A single meeting can arrive as up to five sources: the meeting itself, the
// notes document Gemini left in Drive, Google's own "Invitation:" mail, the
// "Accepted:" mail each guest's acceptance produces, and the calendar entry.
// Five titles, one subject. An answer built from six passages has then told the
// reader one thing five times, and the four slots it spent are slots a different
// real source did not get. The bench measures exactly this as `spread`.
//
// THE APP'S OWN RECORD IS CANONICAL. A meeting row is the thing; a Drive file
// that IS that meeting's transcript is the same words at a second address; a
// Google notice about a calendar entry we already hold is an announcement of a
// record, not a record.
//
// ── HOW IT DECIDES, AND WHAT IT REFUSES TO DECIDE ───────────────────────────
//
// TWO INDEPENDENT AGREEMENTS PER CLASS, or the row is skipped. This is the
// discipline retire-stranded-chat-echoes.mjs established and the reason it could
// be trusted over rows nothing can re-read: one derivation is a rule, two
// agreeing derivations are evidence.
//
//   A DRIVE DOCUMENT THAT IS A MEETING'S TRANSCRIPT
//     1. Its own identity ends with a meeting's `transcript_file_id`. A document
//        source's `origin_row_id` is `<userId>:<driveFileId>` (one person's sight
//        of a file), and the meeting stores the bare file id — so the join is on
//        the suffix, and it is an ID join, not a title guess.
//     2. That meeting's OWN source is live and really carries words. Retiring the
//        duplicate while the original is retired or empty would leave the base
//        with neither copy, which is the one outcome worse than the duplication.
//
//   A CALENDAR ECHO MAIL
//     1. Its title opens with one of Google's own calendar-notice prefixes.
//     2. The event it names is ALREADY HELD as a live `event` or `meeting`
//        source. This is the clause that matters: an invitation to something the
//        base does not otherwise know about is the ONLY record of it, and
//        retiring it would lose the event rather than deduplicate it. Measured on
//        staging: 162 echoes, 155 name something already held, 7 do not — and
//        those seven stay.
//
// "Notes:" MAIL IS NOT AN ECHO AND IS NOT TOUCHED. It carries the meeting's
// actual minutes, and the retrieval bench cites one as a correct answer. A rule
// that swept it up would look like the same rule and would be deleting material.
//
// ── WHAT IT DOES, WHICH IS WHAT THE SWEEP DOES ──────────────────────────────
//
// `deactivated_at` set, `deactivator_id` LEFT NULL — the machine-retirement mark
// (lib/knowledge-ingest.ts), so a source whose condition stops being true is
// REVIVED by the engine rather than staying dead. Nothing is deleted, here or
// ever. The index goes with it — chunks, terms, the Vectorize ids and the four
// counters — because a source that stops being readable while its passages stay
// quotable is the worst of both.
//
//   node scripts/fold-cross-door-duplicates.mjs              # DRY RUN
//   node scripts/fold-cross-door-duplicates.mjs --apply --guard-deployed
//   node scripts/fold-cross-door-duplicates.mjs --audit      # did any come back?
//
// STAGING ONLY, and it refuses production outright rather than offering a flag.

import { readFileSync } from "node:fs"

import { cloudflareCredentials } from "./lib/cf-credentials.mjs"

const APPLY = process.argv.includes("--apply")
const AUDIT = process.argv.includes("--audit")
const GUARD_DEPLOYED = process.argv.includes("--guard-deployed")
const SAMPLE = 10

if (process.argv.includes("--production")) {
  console.error(
    "This script is staging-only. Production holds no team data, so there is nothing to fold."
  )
  process.exit(1)
}

// THE GUARD HAS TO BE IN THE DEPLOYED WORKER, NOT IN THIS WORKING COPY.
//
// The sweep runs every fifteen minutes. A source retired here is met again by
// whatever worker is actually deployed, and a worker that predates the fold rule
// sees an ordinary live file, files it, and undoes the whole run — silently,
// because the sweep swallows nothing and reports success. That is not a
// hypothetical: it cost four billable hours on 31 Aug 2026, on the transcript
// clear-out, and the guard below is that lesson written down.
const RULE_IN_SOURCE = readFileSync(
  new URL("../workers/content/src/lib/knowledge-google.ts", import.meta.url),
  "utf8"
).includes("FOLD_TO_THE_APP_S_OWN_RECORD")
if (APPLY) {
  if (!RULE_IN_SOURCE) {
    console.error(
      "Refusing: workers/content/src/lib/knowledge-google.ts carries no fold rule, so the\n" +
        "sweep will re-file every source this retires within fifteen minutes."
    )
    process.exit(1)
  }
  if (!GUARD_DEPLOYED) {
    console.error(
      "Refusing without --guard-deployed.\n\n" +
        "  The fold rule is in this working copy. That is NOT the question. The cron meets\n" +
        "  these sources again within fifteen minutes in the DEPLOYED worker, and a worker\n" +
        "  that predates the rule re-files every one of them.\n\n" +
        "  Deploy content first, then re-run with --guard-deployed. `--audit` counts how\n" +
        "  many came back if it goes wrong anyway."
    )
    process.exit(1)
  }
}

const { account: ACCOUNT, token: TOKEN } = cloudflareCredentials()
const CORE = process.env.KB_CORE || "1df02340-fc91-4cac-8ccb-d19528dcd9f7"
const INDEX = process.env.KB_INDEX || "kwapso-knowledge-staging"
/** What the sweep stamps when the APP retires a source (shared/brand.ts). */
const ACTOR_NAME = "kwapso"

/** Google's own calendar-notice openings, in the language the mail arrives in.
 * A prefix and not a substring: "Invitation: …" is a notice, and a mail whose
 * SUBJECT happens to contain the word invitation is somebody writing to us. */
const NOTICE_PREFIXES = [
  "Invitation: ",
  "Accepted: ",
  "Declined: ",
  "Tentative: ",
  "Canceled: ",
  "Cancelled: ",
  "Updated invitation: ",
  "Updated invitation with note: ",
]

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
    throw new Error(`${statement.slice(0, 70)}…: ${JSON.stringify(json.errors).slice(0, 300)}`)
  return json.result[0].results
}

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
    throw new Error(
      `REFUSING to read ${name} (${db}): not a Brimba team schema. Has: ${found.join(", ") || "(none)"}. ` +
        `This Cloudflare account is shared with other companies.`
    )
}

/** The event a calendar notice is ABOUT — its own title, with Google's prefix and
 * its " @ <when>" tail removed. Returns null when the title is not a notice, so
 * "is this a notice" and "what is it about" are one decision in one place. */
export function eventNamedBy(title) {
  const text = String(title ?? "")
  const prefix = NOTICE_PREFIXES.find((p) => text.startsWith(p))
  if (!prefix) return null
  const rest = text.slice(prefix.length)
  const at = rest.indexOf(" @ ")
  const named = (at === -1 ? rest : rest.slice(0, at)).trim()
  return named.length ? named : null
}

/** The Drive file a document source is one person's sight of — the tail of
 * `<userId>:<driveFileId>`. Null when the id is not that shape, which is the
 * honest answer for a source this join was never meant to reach. */
export function driveFileIdOf(originRowId) {
  const at = String(originRowId ?? "").indexOf(":")
  if (at === -1) return null
  const id = originRowId.slice(at + 1).trim()
  return id.length ? id : null
}

async function dropVectors(ids) {
  if (!ids.length) return 0
  for (let i = 0; i < ids.length; i += 100) {
    const res = await fetch(`${CF}/accounts/${ACCOUNT}/vectorize/v2/indexes/${INDEX}/delete_by_ids`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ids.slice(i, i + 100) }),
      signal: AbortSignal.timeout(60_000),
    })
    const json = await res.json()
    if (!json.success) throw new Error(`vectorize: ${JSON.stringify(json.errors).slice(0, 300)}`)
  }
  return ids.length
}

console.log(
  `fold-cross-door-duplicates — staging${APPLY ? "" : AUDIT ? "  (AUDIT)" : "  (DRY RUN, nothing will be written)"}\n`
)

const teams = await sql(CORE, "SELECT id, name, database_id FROM teams WHERE database_id IS NOT NULL")
let totalRetired = 0
let totalCorpus = 0
let totalFold = 0

for (const team of teams) {
  await proveTeamDatabase(team.database_id, team.name)

  // R14: bounded by one team's own corpus, and stated at the statement.
  const live = await sql(
    team.database_id,
    `SELECT id, kind, title, origin_row_id, chunk_count, indexed_chunks, body_bytes
       FROM knowledge_sources WHERE deactivated_at IS NULL ORDER BY id LIMIT 20000`
  )
  totalCorpus += live.length
  if (!live.length) continue

  // ── THE TWO ORACLES THE DECISIONS ARE MADE AGAINST ────────────────────────
  // Both read off the base itself rather than off a rule's own output.
  const transcripts = await sql(
    team.database_id,
    `SELECT id, title, transcript_file_id, LENGTH(COALESCE(transcript_text,'')) AS words
       FROM meetings
      WHERE transcript_file_id IS NOT NULL AND transcript_file_id <> '' LIMIT 20000`
  )
  const meetingByFile = new Map(transcripts.map((m) => [m.transcript_file_id, m]))
  /** Which meeting rows the base holds a LIVE, non-empty source for. A duplicate
   * may only be retired when the original is really there. */
  const liveMeetingTitles = new Set(
    live.filter((s) => s.kind === "meeting" && (s.body_bytes ?? 0) > 0).map((s) => s.title)
  )
  // THE SAME ORACLE THE SHIPPED RULE READS, and they must not differ by a word.
  //
  // Caught by measuring: this script first asked only its own LIVE sources of
  // kind event/meeting, while `readFoldTargets` in the sweep asks the `meetings`
  // TABLE plus live event sources. Those disagree exactly where a meeting row
  // exists but its knowledge source was retired — the 232 empty future shells
  // meeting v3 retired — so the script would have quoted the owner a number the
  // deployed rule does not produce. A dry run that describes something other than
  // what happens is worse than no dry run.
  //
  // THE RULE'S READING IS THE ONE KEPT: the app's own record is canonical, and a
  // meeting ROW is that record whether or not its searchable copy survived. The
  // transcript half's own second agreement (the meeting must hold WORDS) is what
  // stops that being a licence to lose material.
  const heldEventTitles = new Set([
    ...transcripts.map((m) => m.title),
    ...(
      await sql(
        team.database_id,
        `SELECT title FROM meetings WHERE deactivated_at IS NULL LIMIT 20000`
      )
    ).map((m) => m.title),
    ...live.filter((s) => s.kind === "event").map((s) => s.title),
  ])
  /** A SECOND, WIDER ORACLE — REPORTED, NEVER APPLIED.
   *
   * Gemini leaves a notes document titled `<event title> - <date> IST - Notes by
   * Gemini`. Where one of those exists the base already holds what was SAID at
   * the event, so an "Invitation:" mail for it adds only the guest list and the
   * time — a duplicate by the same argument as the rest of this script. But it is
   * a different claim from "we hold the event", and widening a retirement rule on
   * my own judgement is exactly what the dry-run discipline exists to prevent.
   * So the count is printed beside the applied one and the owner decides. The
   * join is a PREFIX (`<named> - `), not a substring: a document whose title
   * merely mentions the event is not the event. */
  const notesDocTitles = live
    .filter((s) => s.kind === "document")
    .map((s) => String(s.title ?? ""))
  const heldAsNotes = (named) => notesDocTitles.some((t) => t.startsWith(`${named} - `))

  const docFolds = []
  const echoFolds = []
  const echoKept = []

  for (const s of live) {
    if (s.kind === "document") {
      const fileId = driveFileIdOf(s.origin_row_id)
      const meeting = fileId ? meetingByFile.get(fileId) : undefined
      if (!meeting) continue
      // SECOND AGREEMENT: the app's own record really holds the words.
      if (!(meeting.words > 0) || !liveMeetingTitles.has(meeting.title)) {
        echoKept.push({ ...s, why: `the meeting "${meeting.title}" has no live source with words` })
        continue
      }
      docFolds.push({ ...s, meeting: meeting.title })
      continue
    }
    if (s.kind === "email") {
      const named = eventNamedBy(s.title)
      if (!named) continue
      // SECOND AGREEMENT: we already hold the thing it announces.
      if (!heldEventTitles.has(named)) {
        echoKept.push({
          ...s,
          alsoNotes: heldAsNotes(named),
          why: heldAsNotes(named)
            ? `no event or meeting source holds "${named}", but a Gemini notes document does`
            : `nothing else in the base holds "${named}" — this notice is the only record`,
        })
        continue
      }
      echoFolds.push({ ...s, event: named })
    }
  }

  const fold = [...docFolds, ...echoFolds]
  totalFold += fold.length
  const pct = live.length ? ((fold.length / live.length) * 100).toFixed(1) : "0.0"
  console.log(`  ${team.name}: ${live.length} live sources`)
  console.log(`    ${docFolds.length} Drive documents that ARE a meeting's transcript`)
  console.log(`    ${echoFolds.length} calendar-notice mails for an event the base already holds`)
  console.log(`    ${fold.length} to retire — ${pct}% of this team's corpus`)
  if (echoKept.length) {
    const byNotes = echoKept.filter((r) => r.alsoNotes).length
    console.log(`    ${echoKept.length} LEFT ALONE because the second agreement failed:`)
    if (byNotes)
      console.log(
        `      · ${byNotes} of them DO have a Gemini notes document for the same event — a wider\n` +
          `        rule would fold these too, taking the total to ${fold.length + byNotes}. Reported, not applied:\n` +
          `        widening a retirement rule is the owner's call, not this script's.`
      )
    for (const r of echoKept.slice(0, SAMPLE))
      console.log(`        ${String(r.title).slice(0, 58).padEnd(58)}  ${r.why}`)
  }
  if (fold.length) {
    console.log(`    a sample a person can check:`)
    for (const r of fold.slice(0, SAMPLE))
      console.log(
        `        [${r.kind}] ${String(r.title).slice(0, 62).padEnd(62)} → ${r.meeting ?? r.event}`
      )
  }

  if (AUDIT) {
    // DID ANYTHING COME BACK? The condition is the same one; a row that is live
    // again is a row the deployed sweep re-filed after a retirement.
    console.log(`    audit: ${fold.length} sources match the fold condition and are LIVE right now.`)
    console.log("")
    continue
  }
  if (!APPLY || !fold.length) {
    console.log("")
    continue
  }

  const now = new Date().toISOString()
  for (const r of fold) {
    // IDEMPOTENT: the predicate rides the UPDATE, exactly as the sweep's own
    // retire branch does. A second run moves zero rows.
    await sql(
      team.database_id,
      `UPDATE knowledge_sources SET deactivated_at = ?, deactivator_name = ?, updated_at = ?
        WHERE id = ? AND deactivated_at IS NULL`,
      [now, ACTOR_NAME, now, r.id]
    )
    const written = Math.max(r.chunk_count ?? 0, r.indexed_chunks ?? 0, 0)
    await dropVectors([
      `${r.id}:summary`,
      ...Array.from({ length: written }, (_, i) => `${r.id}:${String(i).padStart(5, "0")}`),
    ])
    await sql(
      team.database_id,
      "DELETE FROM knowledge_terms WHERE chunk_id IN (SELECT id FROM knowledge_chunks WHERE source_id = ?)",
      [r.id]
    )
    await sql(team.database_id, "DELETE FROM knowledge_chunks WHERE source_id = ?", [r.id])
    await sql(
      team.database_id,
      `UPDATE knowledge_sources
          SET chunk_count = 0, indexed_chunks = 0, indexed_at = NULL, content_hash = NULL, index_error = NULL
        WHERE id = ?`,
      [r.id]
    )
    totalRetired++
  }
  console.log(`    retired ${fold.length}\n`)
}

console.log("")
if (AUDIT) {
  console.log(`audit: ${totalFold} sources across staging match the fold condition and are live.`)
  console.log("After an --apply run this number should be 0. Anything else is the deployed sweep re-filing them.")
} else if (APPLY) {
  console.log(`retired ${totalRetired} of ${totalCorpus} live sources across staging.`)
  console.log("Re-run with --audit in twenty minutes: the sweep will have run, and the count must still be 0.")
} else {
  console.log(
    `Dry run. ${totalFold} of ${totalCorpus} live sources would be retired ` +
      `(${totalCorpus ? ((totalFold / totalCorpus) * 100).toFixed(1) : "0.0"}% of the corpus). Nothing was written.`
  )
}
