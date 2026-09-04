// FOLD THE HEADSTONES A RE-SHARE LEFT BEHIND.
//
// -- WHAT HAPPENED -----------------------------------------------------------
//
// `addNamedSource` looked for an existing row with `AND deactivated_at IS NULL`,
// so a source somebody had stopped sharing was invisible to it and re-sharing
// INSERTED a second row. Every toggle left a headstone; every RECONNECT left one
// too, because `disconnect` retires a connection's sources with it and the next
// connection has a new id. Measured on the Kwapso staging team database
// (727537f7-653d-4114-af23-332d1aae0f90) on 3 Sep 2026:
//
//     spaces/AAQAT-RDqLA (FluClinic)                  7 rows, 1 live
//     duplicated (external_id, service) pairs                      14
//     chat    37 rows for   8 live shares
//     drive   35 rows for   3 live shares
//
// And the visible half: the spaces door built its lookup off a `Map`, which
// keeps the LAST entry for a key, over a `created_at DESC` list -- so the OLDEST
// row won, and the assistant told the owner a space he had shared "hasn't been
// shared with kwapso yet".
//
// BOTH CAUSES ARE FIXED IN THE CODE (workers/content/src/lib/google.ts --
// re-sharing revives the row; workers/content/src/routes/google.ts -- the door
// answers off a LIVE row whatever order it reads them in). This script is for
// the rows already written, which no deploy removes.
//
// -- WHAT IT DOES, AND WHAT IT DELIBERATELY DOES NOT -------------------------
//
// DELETES NOTHING. This app's rule is deactivate-never-delete and a repair does
// not get an exemption from it: the headstones already carry the audit block
// that says who stopped sharing what and when, and that is a real history of a
// real decision. What they must stop doing is COMPETING with the live row, and
// after the two fixes they no longer can -- every reader but the one door
// already filtered on `active`, and that door now does too.
//
// SO IT WRITES TO EXACTLY ONE SHAPE: a source with MORE THAN ONE LIVE ROW. That
// is the only shape that is actually wrong rather than merely untidy, because
// two live rows are two answers to "which id do I use?" and one of them is
// silently shadowing the other downstream (the messages door, the sweep's
// `heldSources`). The partial unique index makes it impossible WITHIN one
// connection and possible ACROSS two, which is exactly what a reconnect used to
// produce. A source with 0 or 1 live rows is REPORTED and left alone.
//
// It does not touch `knowledge_sources`. Google material is keyed there by
// `<userId>:<googleExternalId>` (lib/knowledge-google.ts, `rowId`) and never by
// a `google_sources` row id, so the duplicates never duplicated a single indexed
// passage. Checked before this script was written, because a repair that assumes
// a blast radius it has not measured is how a repair becomes an outage.
//
// -- HOW TO RUN IT -----------------------------------------------------------
//
//     node scripts/fold-duplicate-google-sources.mjs            # dry run
//     node scripts/fold-duplicate-google-sources.mjs --apply    # write
//
// STAGING ONLY, and it refuses production outright rather than offering a flag,
// for the same reason its siblings do: production holds no team data.

import { cloudflareCredentials } from "./lib/cf-credentials.mjs"

const APPLY = process.argv.includes("--apply")
if (process.argv.includes("--production")) {
  console.error(
    "This script is staging-only. Production holds no team data, so there is nothing to fold.\n" +
      "If that changes, add the path deliberately - do not reach for a flag that was left out on purpose."
  )
  process.exit(1)
}

const { account: ACCOUNT, token: TOKEN } = cloudflareCredentials()
const CORE = process.env.KB_CORE || "1df02340-fc91-4cac-8ccb-d19528dcd9f7"
/** What the app stamps when the APP, not a person, retires something. */
const ACTOR_NAME = "kwapso"

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
    throw new Error(`${statement.slice(0, 70)}: ${JSON.stringify(json.errors).slice(0, 300)}`)
  return json.result[0].results
}

// THE DATABASE IS PROVED BEFORE IT IS WRITTEN TO. This Cloudflare account is
// shared with other companies -- eleven of sixteen D1 databases on it are not
// ours -- and a team id is not proof of whose schema it is. Four tables together
// are: `help_threads` alone is shared with another app on this account.
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
      `REFUSING to write to ${name} (${db}): not a kwapso team schema. Has: ${found.join(", ") || "(none)"}. ` +
        `This Cloudflare account is shared with other companies.`
    )
}

console.log(
  `fold-duplicate-google-sources - staging${APPLY ? "" : "  (DRY RUN, nothing will be written)"}\n`
)

const teams = await sql(CORE, "SELECT id, name, database_id FROM teams WHERE database_id IS NOT NULL")
let totalRetired = 0
let totalDuplicated = 0

for (const team of teams) {
  await proveTeamDatabase(team.database_id, team.name)

  // R14: one team's hand-named folders and spaces, which is a small list by
  // construction -- the ceiling is a backstop, not a paging decision.
  const rows = await sql(
    team.database_id,
    `SELECT id, user_id, service, external_id, name, connection_id, created_at, deactivated_at
       FROM google_sources ORDER BY created_at DESC LIMIT 2000`
  )

  // Grouped the way the fixed `addNamedSource` keys them: the PERSON, the
  // service, and Google's own id. Not the connection -- a reconnect writes a new
  // one, and grouping on it would leave every reconnection's headstone in its
  // own group of one, which is precisely the shape that hid this.
  const groups = new Map()
  for (const r of rows) {
    const key = `${r.user_id} ${r.service} ${r.external_id}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }

  const duplicated = [...groups.values()].filter((g) => g.length > 1)
  const multiLive = duplicated.filter((g) => g.filter((r) => !r.deactivated_at).length > 1)
  totalDuplicated += duplicated.length

  console.log(
    `  ${team.name}: ${rows.length} source rows, ${groups.size} distinct sources, ` +
      `${duplicated.length} carrying headstones, ${multiLive.length} with MORE THAN ONE LIVE ROW`
  )
  for (const g of duplicated) {
    const live = g.filter((r) => !r.deactivated_at).length
    console.log(
      `      ${String(g[0].service).padEnd(9)} ${String(g[0].external_id).slice(0, 42).padEnd(44)} ` +
        `${String(g.length).padStart(2)} rows, ${live} live  "${String(g[0].name).slice(0, 30)}"`
    )
  }

  if (!multiLive.length) {
    console.log(
      duplicated.length
        ? "    nothing to write: every source has at most one live row, which is the state the code now keeps\n"
        : "    nothing to write\n"
    )
    continue
  }

  if (!APPLY) {
    for (const g of multiLive) {
      const live = g.filter((r) => !r.deactivated_at).length
      console.log(`    would retire ${live - 1} of ${live} live rows for ${g[0].external_id}`)
    }
    console.log("")
    continue
  }

  const now = new Date().toISOString()
  for (const g of multiLive) {
    // Rows arrive newest-first, so the newest LIVE one is the keeper: it is the
    // row the last person to share this actually made.
    const [, ...shadowed] = g.filter((r) => !r.deactivated_at)
    for (const r of shadowed) {
      // IDEMPOTENT, the same shape as every other status move in this app (R17):
      // the current-status predicate rides the UPDATE, so a second run of this
      // script moves zero rows and writes nothing.
      await sql(
        team.database_id,
        `UPDATE google_sources
            SET deactivated_at = ?, deactivator_name = ?, updated_at = ?
          WHERE id = ? AND deactivated_at IS NULL`,
        [now, ACTOR_NAME, now, r.id]
      )
      console.log(`    retired shadow row ${r.id}  ${r.service}  ${r.external_id}`)
      totalRetired++
    }
  }
  console.log("")
}

console.log(
  `${totalDuplicated} sources carry headstones. ` +
    (APPLY ? `Retired ${totalRetired} shadowed live rows.` : "Dry run - nothing written.")
)
