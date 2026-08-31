// CLEAR THE SIZE READINGS THAT WERE NEVER OURS — the mess, after the maker has
// been fixed.
//
// WHAT THIS IS FOR. The nightly watch listed every database on the Cloudflare
// ACCOUNT and treated the answer as ours. The account is shared with two other
// products, so `db_growth` filled with their databases: on 31 Aug 2026, 13 of
// the 17 rows in BOTH cores named a database that is not ours — and three of
// those name databases their owner has since DELETED, leaving our table as the
// last record of them.
//
// THE MAKER IS FIXED FIRST, and this is second on purpose: `checkDatabaseSizes`
// now subtracts anything core's own `teams` table does not claim, so no new
// foreign row can be written. THIS SCRIPT DOES NOTHING THE FIX WOULD NOT
// EVENTUALLY MAKE TRUE — except that `db_growth` is an UPSERT table keyed by
// database_id, so a row nobody writes again is never revisited either. It would
// sit there for ever. That is why the cleanup is a separate act.
//
// THE DEFINITION IS THE FIX'S OWN, NOT A SECOND ONE. The predicate below is
// `ourDatabases` written as SQL: in the `teams` table, or the core database
// itself. A cleanup that invented its own definition could disagree with the
// code, and the direction it would disagree in is the one that deletes our own
// history.
//
// WHAT IT DELETES BEYOND THE FOREIGN ROWS, said plainly, because the number is
// bigger than "another company's":
//   • PRODUCTION core holds readings for our own STAGING databases, because both
//     environments' crons listed the whole account. Production's `teams` table is
//     empty, so production legitimately watches only `kwapso-core` — every other
//     row there is one it will never refresh again, and a stale row in a growth
//     table is worse than none (the whole point of the table is a RATE).
//   • Nothing of ours is orphaned by this. Verified before the first run: all
//     five kwapso databases keep a history — `kwapso-core` in production core,
//     and `kwapso-core-staging` plus its three team databases in staging core,
//     with identical readings, because both crons recorded the same numbers.
//
//   node scripts/prune-foreign-db-growth.mjs                  # DRY RUN on staging
//   node scripts/prune-foreign-db-growth.mjs --apply          # do it, on staging
//   node scripts/prune-foreign-db-growth.mjs --production --apply --yes-production
//
// Production needs BOTH extra flags and is refused otherwise — it is owner-gated
// (CLAUDE.md), and the approval that covers staging does not reach it.

import { execSync } from "node:child_process"

const APPLY = process.argv.includes("--apply")
const PRODUCTION = process.argv.includes("--production")
const CONFIRMED = process.argv.includes("--yes-production")

if (PRODUCTION && !CONFIRMED) {
  console.error(
    "Refusing production without --yes-production. Production is owner-gated; ask, then pass both flags."
  )
  process.exit(1)
}

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "b5bb3d84a59c029ea5e0fe164dab1cf7"
const TOKEN =
  process.env.CLOUDFLARE_API_TOKEN ||
  execSync("security find-generic-password -s cloudflare-token-kwapso -w").toString().trim()
/** The core to clean, and its OWN uuid — the same pair the worker is given as the
 * `DB` binding and `CORE_DATABASE_ID`, because this predicate has to mean exactly
 * what the code's does. */
const CORE = PRODUCTION
  ? { id: "e55a2c0f-346a-4056-b01c-7869a8b253dc", name: "kwapso-core" }
  : { id: "1df02340-fc91-4cac-8ccb-d19528dcd9f7", name: "kwapso-core-staging" }

const CF = "https://api.cloudflare.com/client/v4"
async function sql(statement, params = []) {
  const res = await fetch(`${CF}/accounts/${ACCOUNT}/d1/database/${CORE.id}/query`, {
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

/** PROVE IT IS A CORE DATABASE FROM ITS SCHEMA, not from the name above. The
 * account is shared; `db_growth` + `db_alerts` + `teams` + `users` together are a
 * kwapso core and nothing else is. */
const FINGERPRINT = ["db_growth", "db_alerts", "teams", "users"]
const found = (
  await sql(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${FINGERPRINT.map(() => "?").join(",")})`,
    FINGERPRINT
  )
).map((r) => r.name)
if (found.length !== FINGERPRINT.length) {
  console.error(
    `REFUSING: ${CORE.name} (${CORE.id}) does not carry a kwapso core schema.\n` +
      `  expected all of: ${FINGERPRINT.join(", ")}\n  it has: ${found.join(", ") || "(none)"}`
  )
  process.exit(1)
}

/** `ourDatabases` as SQL. Kept in this shape deliberately so the two can be read
 * side by side. */
const NOT_OURS = `database_id <> ? AND database_id NOT IN (SELECT database_id FROM teams WHERE database_id IS NOT NULL)`

console.log(
  `prune-foreign-db-growth — ${CORE.name}${APPLY ? "" : "  (DRY RUN, nothing will be written)"}\n`
)

const going = await sql(`SELECT database_name, database_id, at FROM db_growth WHERE ${NOT_OURS} ORDER BY database_name`, [CORE.id])
const staying = await sql(
  `SELECT database_name FROM db_growth WHERE NOT (${NOT_OURS}) ORDER BY database_name`,
  [CORE.id]
)

console.log(`  ${going.length} rows are not this environment's to hold:`)
for (const r of going) console.log(`    delete  ${r.database_name}  (last read ${String(r.at).slice(0, 10)})`)
console.log(`\n  ${staying.length} rows remain:`)
for (const r of staying) console.log(`    keep    ${r.database_name}`)

if (!APPLY) {
  console.log(`\nDry run. Re-run with --apply.`)
  process.exit(0)
}

// IDEMPOTENT: the predicate rides the DELETE, so a second run matches nothing.
await sql(`DELETE FROM db_growth WHERE ${NOT_OURS}`, [CORE.id])
// `db_alerts` gets the same treatment. It is empty today — nothing on the account
// is within 1.5% of the 8 GiB line, so the alarm never fired — but a cleanup that
// only knew about the table that happened to be dirty would leave the more
// dangerous one for somebody else to find.
await sql(`DELETE FROM db_alerts WHERE ${NOT_OURS}`, [CORE.id])

const left = await sql(`SELECT count(*) AS n FROM db_growth WHERE ${NOT_OURS}`, [CORE.id])
const alerts = await sql(`SELECT count(*) AS n FROM db_alerts WHERE ${NOT_OURS}`, [CORE.id])
console.log(
  `\ndone — ${left[0].n} foreign growth rows and ${alerts[0].n} foreign alert rows remain in ${CORE.name}.`
)
