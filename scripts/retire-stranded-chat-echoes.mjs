// RETIRE THE NOTIFICATION ECHOES THE SWEEP CAN NEVER REACH.
//
// ── WHY A SCRIPT AT ALL, WHEN A RULE ALREADY DOES THIS ──────────────────────
//
// The chat lane retires a conversation every one of whose voices is an app
// (lib/knowledge-google.ts). It works: on 31 Aug 2026 it retired 15 of 15 it
// met, with nothing wrongly retired. But it can only decide about a conversation
// the sweep READS, and the Google reader asks for the newest 50 messages per
// space (`GOOGLE_PAGE_SIZE`). A thread whose messages have fallen behind that
// window is not in the listing, so the sweep never meets it again — no cursor
// rewind and no `textVersion` bump reaches it, because there is nothing to read.
//
// EVIDENCE IT IS THE WINDOW AND NOT SOMETHING SLOWER. Inside every affected
// space, every thread the sweep re-read is strictly NEWER than every thread it
// did not, and the cut falls on a different date in each space:
//     spaces/AAQA2dMAK0o   seen >= 31 Aug 08:01   unseen <= 28 Aug 12:15
//     spaces/AAQAT-RDqLA   seen >= 28 Aug 06:37   unseen <= 27 Aug 10:54
//     spaces/AAQA8Ob_Ssc   seen >= 25 Aug 16:32   unseen  = 24 Aug 07:08
// Three independent cuts at three dates is what ONE fixed window produces across
// spaces of different busyness. It is not ageing (the retired set reaches back
// to 20 Aug, further than the stranded band) and not an unshared space (all
// three are being swept and hold re-read threads).
//
// ── HOW IT DECIDES, AND THE LIMITATION SAID OUT LOUD ────────────────────────
//
// The rule reads Google's own `sender.type === "BOT"`. THIS SCRIPT CANNOT: the
// very reason these rows are stranded is that Google no longer returns them, so
// there is no sender type left to ask for. What survives is the reader's own
// record of it — `chatThreads` writes each line as "<speaker>: <text>", and the
// speaker reads "An app" ONLY where `toChatSender` took its `type === "BOT"`
// branch. So the label in the body is a DERIVED RECORD of the sender type at the
// moment it was read, and it is the strongest evidence that still exists.
//
// I rejected matching that same string as the RULE's discriminator, and still
// would: for live material the type itself is available, and matching our own
// prose would make the app's output decide the app's behaviour. Backwards, over
// rows nothing can re-read, it is the only oracle there is — and it is used here
// with two guards rather than on its own.
//
// TWO INDEPENDENT DERIVATIONS MUST AGREE, or the row is skipped:
//   1. THE BODY, per line, which is the primary test — every speaker "An app".
//   2. THE TITLE's voice list, which `chatThreads` computes by a different path
//      (a Set of senders, joined) — must be exactly "An app" too.
// A thread where they disagree is not retired. Not selected by "in the Portal",
// not by the message format, and NOT by whether the sweep reached it: the script
// considers every live chat thread and lets the app-only test decide, so
// reachability and app-onlyness stay the independent questions they are.
//
// FAIL-SAFE IN THE RIGHT DIRECTION. A named bot's label is its display name, so
// this test SKIPS it rather than retiring it. A human line that happens to parse
// oddly makes the thread not-all-app, so it is skipped. Every ambiguity leaves
// the conversation alone, because a knowledge base that drops real material is
// worse than one carrying noise.
//
// ── WHAT IT DOES, WHICH IS WHAT THE SWEEP DOES ──────────────────────────────
//
// `deactivated_at` set, `deactivator_id` LEFT NULL — the machine-retirement mark
// (lib/knowledge-ingest.ts). So if one of these conversations ever gains a human
// reply AND comes back inside Google's window, the sweep meets a live row, the
// condition has stopped being true, and the engine revives it exactly as it would
// any other. Nothing is deleted, here or ever.
//
// The index goes too, the same way `clearIndex` does it: chunks, terms, the
// Vectorize ids (`<sourceId>:00000…` and `<sourceId>:summary`), and the four
// counters. A source that stops being readable while its passages stay quotable
// is the worst of both, which prune-empty-meetings learned the hard way.
//
//   node scripts/retire-stranded-chat-echoes.mjs           # DRY RUN
//   node scripts/retire-stranded-chat-echoes.mjs --apply
//
// STAGING ONLY, and it refuses production outright rather than offering a flag:
// production holds no team data, so there is nothing there to retire and no
// reason to build a door to it.

import { cloudflareCredentials } from "./lib/cf-credentials.mjs"

const APPLY = process.argv.includes("--apply")
if (process.argv.includes("--production")) {
  console.error(
    "This script is staging-only. Production holds no team data, so there is nothing to retire.\n" +
      "If that changes, add the path deliberately — do not reach for a flag that was left out on purpose."
  )
  process.exit(1)
}

const { account: ACCOUNT, token: TOKEN } = cloudflareCredentials()
const CORE = process.env.KB_CORE || "1df02340-fc91-4cac-8ccb-d19528dcd9f7"
const INDEX = process.env.KB_INDEX || "kwapso-knowledge-staging"
/** What the sweep stamps when the APP retires a source (shared/brand.ts). */
const ACTOR_NAME = "kwapso"
/** The label `toChatSender` emits for a speaker Google typed as BOT. */
const APP_LABEL = "An app"

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

/** THE PRIMARY TEST: every speaker in the body is the app. Continuation lines of
 * a multi-line message carry no speaker and inherit the last one, which is why
 * the scan carries `current` forward rather than skipping them. */
function bodyIsAppOnly(body) {
  const speakers = new Set()
  let current = null
  for (const line of String(body ?? "").split("\n")) {
    const m = /^([^:]{1,60}): /.exec(line)
    if (m) current = m[1]
    if (current) speakers.add(current)
  }
  if (speakers.size === 0) return false
  return [...speakers].every((s) => s === APP_LABEL)
}

/** THE CORROBORATION: the title's voice list, computed by `chatThreads` from a
 * Set of senders — a different path over the same messages. `<space> — <voices>`,
 * split on the LAST separator so a space whose own name contains one is read
 * correctly. */
function titleIsAppOnly(title) {
  const at = String(title ?? "").lastIndexOf(" — ")
  if (at === -1) return false
  return title.slice(at + 3).trim() === APP_LABEL
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
      `REFUSING to write to ${name} (${db}): not a Brimba team schema. Has: ${found.join(", ") || "(none)"}. ` +
        `This Cloudflare account is shared with other companies.`
    )
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

console.log(`retire-stranded-chat-echoes — staging${APPLY ? "" : "  (DRY RUN, nothing will be written)"}\n`)

const teams = await sql(CORE, "SELECT id, name, database_id FROM teams WHERE database_id IS NOT NULL")
let totalRetired = 0

for (const team of teams) {
  await proveTeamDatabase(team.database_id, team.name)

  // EVERY LIVE CHAT THREAD, not the stranded ones. Reachability is a separate
  // question from app-onlyness and only the second justifies retiring anything.
  // R14: bounded by the chat kind's own size, which is one team's conversations.
  const live = await sql(
    team.database_id,
    `SELECT id, title, body, chunk_count, indexed_chunks FROM knowledge_sources
      WHERE origin_table = 'google_chat' AND deactivated_at IS NULL
      ORDER BY id LIMIT 5000`
  )

  const decided = live.map((r) => ({
    ...r,
    byBody: bodyIsAppOnly(r.body),
    byTitle: titleIsAppOnly(r.title),
  }))
  const retire = decided.filter((r) => r.byBody && r.byTitle)
  const disagreed = decided.filter((r) => r.byBody !== r.byTitle)

  console.log(`  ${team.name}: ${live.length} live chat threads, ${retire.length} prove app-only`)
  if (disagreed.length) {
    // LOUD, because a disagreement between the two derivations is the one thing
    // that would mean this script's oracle is not sound.
    console.log(`    ⚠ ${disagreed.length} where body and title DISAGREE — skipped, not retired:`)
    for (const r of disagreed)
      console.log(`        ${r.id}  body=${r.byBody} title=${r.byTitle}  ${String(r.title).slice(0, 60)}`)
  }
  if (!retire.length) continue

  for (const r of retire) console.log(`    ${r.id}  ${r.title}`)

  if (!APPLY) {
    console.log("")
    continue
  }

  const now = new Date().toISOString()
  for (const r of retire) {
    // IDEMPOTENT: the predicate rides the UPDATE, exactly as the sweep's own
    // retire branch does. A second run moves zero rows.
    await sql(
      team.database_id,
      `UPDATE knowledge_sources
          SET deactivated_at = ?, deactivator_name = ?, updated_at = ?
        WHERE id = ? AND deactivated_at IS NULL`,
      [now, ACTOR_NAME, now, r.id]
    )
    // …AND THE INDEX GOES WITH IT, the same four steps as `clearIndex`.
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
  console.log(`    retired ${retire.length}\n`)
}

if (APPLY) {
  let stillLive = 0
  for (const team of teams) {
    const rows = await sql(
      team.database_id,
      `SELECT id, title, body FROM knowledge_sources
        WHERE origin_table = 'google_chat' AND deactivated_at IS NULL LIMIT 5000`
    )
    stillLive += rows.filter((r) => bodyIsAppOnly(r.body) && titleIsAppOnly(r.title)).length
  }
  console.log(`retired ${totalRetired}; ${stillLive} app-only threads remain live across staging.`)
} else {
  console.log("Dry run. Re-run with --apply.")
}
