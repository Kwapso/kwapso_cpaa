// PUT BACK THE CHARACTERS THAT WERE LOST ON THE WAY IN — the mess, after the
// maker has been fixed, and only as far as the truth is actually KNOWN.
//
// ── WHAT IS WRONG ────────────────────────────────────────────────────────────
//
// 113 knowledge titles on staging carry hex C3 83 — the character "Ã" — where a
// letter belongs, plus the same sequence through the bodies. Two DIFFERENT
// faults wearing the same face, and they are repaired here for two different
// reasons:
//
//   109 rows   "Ãlaap Kanchawala"      the Google display name itself
//     4 rows   "… Ã¢Â€Â” sweep"        an em dash this app mangled on the way out
//
// ── WHY THIS IS A TABLE OF KNOWN STRINGS AND NOT AN ALGORITHM ────────────────
//
// The principled repair for mojibake is a round trip: re-encode as CP1252,
// decode as strict UTF-8, and accept the result only if both steps are lossless.
// It is safe, it is general, and IT DOES NOT WORK HERE — measured on these exact
// rows, 31 Aug 2026:
//
//   "kwapso sweep … Ã¢Â€Â” sweep"        round-trips to "… â sweep"   (still wrong)
//   "Re: kwapso sweep … ÃƒÂƒÃ‚Â¢…"       round-trips to itself        (refuses)
//   "Ãlaap Kanchawala"                   round-trips to itself        (refuses)
//
// Because the damage is LOSSY. CP1252 leaves five bytes undefined (81, 8D, 8F,
// 90, 9D) and the decoder that mangled these DROPPED them rather than failing.
// "Á" is UTF-8 C3 81; read as CP1252 with 81 discarded it becomes "Ã" and the
// second byte is simply gone. No algorithm inverts a deletion. Anything that
// claimed to would be guessing, and guessing at somebody's NAME in 109 rows is
// exactly the kind of confident wrongness this codebase legislates against.
//
// So each repair below carries the SOURCE of its truth, from outside the
// mangled data, and nothing is repaired that has none.
//
// ── AND IT IS TEMPORARY, WHICH THE OPERATOR MUST KNOW BEFORE RUNNING IT ──────
//
// The Google kinds are `windowed` (knowledge-ingest.ts): the sweep re-walks what
// Google currently hands back, every tick, and the upsert sets `title =
// excluded.title` unconditionally. So for any row still inside Google's sliding
// window, THIS REPAIR IS UNDONE BY THE NEXT SWEEP. That is not a flaw in the
// script, it is the honest shape of the problem:
//
//   • The 4 em-dash rows had a fault in OUR code — `encodeMessage` put raw UTF-8
//     bytes in a MIME header. That is fixed, so no NEW mail is mangled. The four
//     already sent are mangled in Gmail itself and will return while they remain
//     in the window.
//   • The 109 name rows are mangled IN GOOGLE'S OWN PROFILE DATA. Proof, from a
//     single Google-composed email body in this base: "⋅" and "–" decode
//     perfectly, and the name beside them does not — same string, same decoder.
//     Our decode path is sound.
//
//     THE REAL FIX IS ONE EDIT, AND IT IS NOT IN THIS REPOSITORY: correct the
//     display name on the Google account (myaccount.google.com → Personal info →
//     Name). Every one of the 109 then heals ITSELF on the next sweep, because
//     the same unconditional upsert that undoes this script is what would carry
//     the corrected name in. Run this to clear the screens today; do that to keep
//     them clear.
//
//   node scripts/repair-mangled-titles.mjs                  # DRY RUN on staging
//   node scripts/repair-mangled-titles.mjs --apply          # do it, on staging
//   node scripts/repair-mangled-titles.mjs --production --apply --yes-production
//
// Production needs BOTH extra flags and is refused otherwise.

import { execSync } from "node:child_process"

const APPLY = process.argv.includes("--apply")
const PRODUCTION = process.argv.includes("--production")
const CONFIRMED = process.argv.includes("--yes-production")

if (PRODUCTION && !CONFIRMED) {
  console.error(
    "Refusing production without --yes-production. Ask the owner, then pass both flags."
  )
  process.exit(1)
}

/** EVERY REPAIR CARRIES THE SOURCE OF ITS TRUTH. A line without one does not
 * belong here — that is the whole discipline of this file. */
const REPAIRS = [
  {
    from: "Ãlaap",
    to: "Alaap",
    why:
      "The Google account's own display name, mangled upstream. Ground truth from OUTSIDE the " +
      "mangled data, twice: a meeting-notes email in this same base writes 'Alaap Kanchawala' in " +
      "plain ASCII, and the core `users` row for alaap@kwapso.com reads first_name 'Alaap'. " +
      "The lost byte cannot be recovered — 'Á', 'Í', 'Ï', 'Ð' and 'Ý' all collapse to 'Ã' when " +
      "CP1252 drops their second byte — so this restores the name the app itself uses rather " +
      "than choosing between five accents nobody can distinguish from here.",
  },
  {
    from: "ÃƒÂƒÃ‚Â¢ÃƒÂ‚Ã¢Â‚Â¬ÃƒÂ‚Ã¢Â€Â ",
    to: "—",
    why:
      "An em dash that went through the send/receive loop TWICE. Ground truth is this repo: " +
      "scripts/google-sweep.mjs sends `${tag} — sweep`. Longest pattern first, so it is " +
      "matched before its own single-round prefix below.",
  },
  {
    from: "Ã¢Â€Â”",
    to: "—",
    why:
      "The same em dash, one round of mangling. Same ground truth: scripts/google-sweep.mjs.",
  },
]

/** The one sequence that says a row is damaged. Every repair above contains it,
 * and the verification at the end counts it. */
const MARKER = "Ã"

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "b5bb3d84a59c029ea5e0fe164dab1cf7"
const TOKEN =
  process.env.CLOUDFLARE_API_TOKEN ||
  execSync("security find-generic-password -s cloudflare-token-kwapso -w").toString().trim()
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

/** PROVE THE DATABASE FROM ITS SCHEMA, NOT ITS NAME — the check that stands
 * between this script and another company's production data.
 *
 * This Cloudflare account is SHARED. Ten `team-<ulid>` databases live in it and
 * six belong to somebody else; one of those six is live production. A name tells
 * you nothing: they are all spelled `team-<ulid>`, and the ulid is not ours to
 * recognise.
 *
 * TWO INDEPENDENT ORACLES, because either alone can be talked round. The list of
 * databases comes from THIS environment's core `teams` table, so a database the
 * other company owns is never even named here. And then each one must still
 * PROVE ITSELF from its own `sqlite_master`: four tables that only a current
 * Brimba team database has together. The other company's production database
 * shares exactly one of them (`help_threads`, from an older fork), which is why
 * the test is the conjunction and not any single table. */
const FINGERPRINT = ["knowledge_sources", "knowledge_chunks", "internal_rates", "google_sources"]
async function proveTeamDatabase(db, name) {
  const rows = await sql(
    db,
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${FINGERPRINT.map(() => "?").join(",")})`,
    FINGERPRINT
  )
  const found = rows.map((r) => r.name).sort()
  if (found.length !== FINGERPRINT.length) {
    throw new Error(
      `REFUSING TO WRITE to ${name} (${db}): it does not carry a Brimba team schema.\n` +
        `  expected all of: ${[...FINGERPRINT].sort().join(", ")}\n` +
        `  it has:          ${found.join(", ") || "(none of them)"}\n` +
        `  This account is shared with another company. Stopping.`
    )
  }
}

const where = PRODUCTION ? "PRODUCTION" : "staging"
console.log(
  `repair-mangled-titles — ${where}${APPLY ? "" : "  (DRY RUN, nothing will be written)"}\n`
)

const teams = await sql(CORE, "SELECT id, name, database_id FROM teams WHERE database_id IS NOT NULL")
console.log(`${teams.length} team databases named by ${where} core:\n`)

let totalRows = 0
let totalWritten = 0

for (const team of teams) {
  const db = team.database_id
  await proveTeamDatabase(db, team.name)

  // EVERY COLUMN A PERSON READS THE DAMAGE IN. `summary` matters as much as the
  // title: the Google kinds have no summary of their own, so the engine falls
  // back to the title and that is the sentence the router reads.
  const hit = await sql(
    db,
    `SELECT id, title, summary, body FROM knowledge_sources
      WHERE title LIKE ? OR summary LIKE ? OR body LIKE ?
      ORDER BY id`,
    [`%${MARKER}%`, `%${MARKER}%`, `%${MARKER}%`]
  )
  if (!hit.length) {
    console.log(`  ${team.name}: clean`)
    continue
  }

  const mend = (v) => {
    if (typeof v !== "string") return v
    let out = v
    for (const r of REPAIRS) out = out.split(r.from).join(r.to)
    return out
  }

  const changed = hit
    .map((r) => ({
      id: r.id,
      title: [r.title, mend(r.title)],
      summary: [r.summary, mend(r.summary)],
      body: [r.body, mend(r.body)],
    }))
    .filter((r) => r.title[0] !== r.title[1] || r.summary[0] !== r.summary[1] || r.body[0] !== r.body[1])

  totalRows += changed.length
  console.log(
    `\n  ${team.name} (${db}): ${hit.length} rows carry "${MARKER}", ${changed.length} of them repairable\n`
  )

  // ── THE TEN-ROW PREVIEW, before anything is written ──────────────────────
  //
  // TITLES FIRST, because a title is what a person SEES in the list and it is
  // the count this repair is measured by. Ordering by id instead showed ten
  // meeting transcripts whose titles were never damaged, which is true and is
  // not the thing being checked.
  const titleFirst = [
    ...changed.filter((r) => r.title[0] !== r.title[1]),
    ...changed.filter((r) => r.title[0] === r.title[1]),
  ]
  const titlesDamaged = changed.filter((r) => r.title[0] !== r.title[1]).length
  console.log(`    ${titlesDamaged} of them in the TITLE, ${changed.length - titlesDamaged} in the body or summary only\n`)
  for (const r of titleFirst.slice(0, 10)) {
    if (r.title[0] !== r.title[1]) {
      console.log(`    before  ${JSON.stringify(r.title[0]).slice(0, 110)}`)
      console.log(`    after   ${JSON.stringify(r.title[1]).slice(0, 110)}`)
    } else {
      console.log(`    (title clean) ${JSON.stringify(r.title[0]).slice(0, 90)}`)
      const at = r.body[0].indexOf(MARKER)
      console.log(`    body  before  …${JSON.stringify(r.body[0].slice(Math.max(0, at - 30), at + 40))}`)
      console.log(`    body  after   …${JSON.stringify(mend(r.body[0]).slice(Math.max(0, at - 30), at + 40))}`)
    }
    console.log("")
  }
  if (titleFirst.length > 10) console.log(`    … and ${titleFirst.length - 10} more\n`)

  // ANYTHING STILL DAMAGED AFTER THE REPAIR is reported rather than hidden: a
  // sequence this table has no ground truth for must not leave silently.
  const residue = changed.filter((r) => [r.title[1], r.summary[1], r.body[1]].some((v) => typeof v === "string" && v.includes(MARKER)))
  if (residue.length)
    console.log(`    ⚠ ${residue.length} rows still carry "${MARKER}" after repair — no ground truth for that sequence.`)

  if (!APPLY) continue

  for (const r of changed) {
    // R17 IN SPIRIT: the predicate rides the UPDATE. A second run matches
    // nothing, because the row no longer holds the text it is asked to replace.
    //
    // `content_hash = NULL` is what makes the repair reach the INDEX. The chunks
    // were built from the mangled body and would go on being quoted with it —
    // the same "readable row, stale passages" split prune-empty-meetings learned
    // the hard way. Nulling the hash is the flag the sweep reads as "index this
    // again".
    const res = await sql(
      db,
      `UPDATE knowledge_sources
          SET title = ?, summary = ?, body = ?, content_hash = NULL
        WHERE id = ? AND title = ? AND body IS ?`,
      [r.title[1], r.summary[1], r.body[1], r.id, r.title[0], r.body[0]]
    )
    void res
    totalWritten++
  }
  console.log(`    wrote ${changed.length} rows`)
}

// ── THE COUNT, READ BACK OFF THE DATABASE ───────────────────────────────────
console.log("")
let remaining = 0
for (const team of teams) {
  const [row] = await sql(
    team.database_id,
    `SELECT count(*) AS n FROM knowledge_sources WHERE title LIKE ? OR summary LIKE ? OR body LIKE ?`,
    [`%${MARKER}%`, `%${MARKER}%`, `%${MARKER}%`]
  )
  remaining += row.n
}
console.log(
  APPLY
    ? `repaired ${totalWritten} rows; ${remaining} rows still carry "${MARKER}" across ${where}.`
    : `${totalRows} rows would be repaired. Re-run with --apply. (${remaining} carry "${MARKER}" now.)`
)
if (APPLY && remaining === 0)
  console.log(
    `\nNOTE: the Google kinds are windowed — the sweep re-reads Google every tick and the upsert\n` +
      `overwrites the title. Rows still inside Google's window WILL come back mangled until the\n` +
      `display name is corrected on the Google account itself. See the header of this file.`
  )
