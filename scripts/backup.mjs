// backup — take a copy of every database this environment owns, to disk.
//
//   node scripts/backup.mjs staging
//   node scripts/backup.mjs production
//   node scripts/backup.mjs production --out ~/kwapso-backups
//
// READ-ONLY. It runs `d1 export` and writes files; it never executes a statement
// against a database and has no code path that could. It is the exact mirror of
// `reset-all.mjs`, which is why it borrows that script's account guard verbatim:
// the two scripts point at the same estate, and only one of them is allowed to
// change it.
//
// WHY THIS EXISTS AT ALL. Cloudflare keeps 30 days of Time Travel per D1
// database, which is a genuine safety net and is NOT what this replaces. Time
// Travel restores a database that still exists, in an account that still exists,
// to a point inside 30 days. It does nothing about a database somebody deleted
// and noticed in week six, an account-level problem, or a migration that
// corrupted rows slowly enough that every point in the window is already wrong.
// A file on disk answers those; Time Travel answers the common case faster.
// Keep both — RESILIENCE.md § "Live data can be recovered" says which to reach
// for when.
//
// WHAT THIS DOES NOT CAPTURE, said out loud because a backup you believe is
// complete is worse than one you know the edges of:
//   • R2 buckets (uploaded media, learning attachments, the agency's own files)
//   • the Vectorize index — DERIVED, and rebuildable from the team databases by
//     the knowledge sweep; nothing is lost, it just re-embeds
//   • Durable Object state — TeamChannel holds open sockets and no app data
//   • secrets (RESEND_API_KEY, GOOGLE_*, CF_D1_TOKEN, INTERNAL_KEY)
// The manifest written beside the dumps repeats this list, so the person holding
// the folder in two years does not have to find this comment.

import { execSync } from "node:child_process"
import { mkdirSync, writeFileSync, statSync, readFileSync } from "node:fs"
import { join } from "node:path"

const GLOBAL_DB = { staging: "kwapso-core-staging", production: "kwapso-core" }

// The one account these databases live in. Read-only or not, a script that names
// databases may not infer the account from ambient login state — wrangler picks
// whatever the machine is logged into, and on the machine this was written for
// that is a different client's account. Same guard, same reason, as reset-all.
const KWAPSO_ACCOUNT_ID = "b5bb3d84a59c029ea5e0fe164dab1cf7"
if (process.env.CLOUDFLARE_ACCOUNT_ID !== KWAPSO_ACCOUNT_ID) {
  console.error(
    `Refusing to run: CLOUDFLARE_ACCOUNT_ID is ${process.env.CLOUDFLARE_ACCOUNT_ID ?? "unset"},\n` +
      `and this script only ever reads ${KWAPSO_ACCOUNT_ID}.\n\n` +
      `Run it through cf-exec, or set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN first.`
  )
  process.exit(2)
}

const env = process.argv[2]
if (!GLOBAL_DB[env]) {
  console.error("Usage: node scripts/backup.mjs <staging|production> [--out <dir>]")
  process.exit(2)
}
const outFlag = process.argv.indexOf("--out")
const baseDir = outFlag > -1 ? process.argv[outFlag + 1] : join(process.cwd(), "backups")

const sh = (cmd) => execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] })

/** Run a read query against a database, return its rows. */
function query(db, sql) {
  const out = sh(`npx wrangler d1 execute ${db} --remote --json --command ${JSON.stringify(sql)}`)
  return JSON.parse(out.slice(out.indexOf("[")))[0]?.results ?? []
}

// A folder per run, stamped, so two backups never overwrite each other and the
// order on disk is the order they were taken.
const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const dir = join(baseDir, `${env}-${stamp}`)
mkdirSync(dir, { recursive: true })

const core = GLOBAL_DB[env]
console.log(`\n=== BACKUP ${env.toUpperCase()} → ${dir} ===`)

const nameByUuid = Object.fromEntries(
  JSON.parse(sh("npx wrangler d1 list --json")).map((d) => [d.uuid, d.name])
)

let failures = 0
const captured = []

/** Export one database and prove the file that came back is worth keeping.
 *
 * "It ran without erroring" is not the test. `d1 export` exits 0 on a database
 * it reached and found nothing in, and a zero-byte file in a backup folder is
 * the single most expensive kind of success — you learn it was empty on the day
 * you need it. So every dump is read back and must contain at least one
 * statement before it counts. */
function dump(name, label) {
  const file = join(dir, `${name}.sql`)
  try {
    sh(`npx wrangler d1 export ${name} --remote --output ${JSON.stringify(file)}`)
  } catch (e) {
    console.log(`  FAIL  ${label} (${name}) — export failed: ${e.message.split("\n")[0]}`)
    failures++
    return
  }
  const bytes = statSync(file).size
  const hasStatements = /CREATE TABLE|INSERT INTO/i.test(readFileSync(file, "utf8"))
  if (!hasStatements) {
    console.log(`  FAIL  ${label} (${name}) — dump has no schema or rows (${bytes} bytes)`)
    failures++
    return
  }
  console.log(`  ok    ${label} (${name}) — ${bytes.toLocaleString()} bytes`)
  captured.push({ database: name, label, file: `${name}.sql`, bytes })
}

// 1 · the global core: identity, teams, the card catalog, the error store.
dump(core, "core")

// 2 · every team database this environment's own core points at — the same two
// sources reset-all reads, so backup and reset can never disagree about which
// databases belong to this environment.
const teamDbIds = [
  ...new Set(
    [
      ...query(core, "SELECT database_id AS id FROM teams WHERE database_id IS NOT NULL"),
      ...query(core, "SELECT database_id AS id FROM team_module_databases"),
    ].map((r) => r.id)
  ),
]
console.log(`team databases: ${teamDbIds.length}`)
for (const id of teamDbIds) {
  const name = nameByUuid[id]
  if (!name) {
    // Referenced by core but absent from the account. Not a warning to swallow:
    // it means a team's rows are already gone, and the backup is the moment that
    // becomes visible.
    console.log(`  FAIL  team database ${id} is referenced by core but does not exist`)
    failures++
    continue
  }
  dump(name, "team")
}

// 3 · the manifest — what this folder is, and what it is NOT.
const manifest = {
  environment: env,
  takenAt: new Date().toISOString(),
  account: KWAPSO_ACCOUNT_ID,
  coreDatabase: core,
  captured,
  notCaptured: [
    "R2 buckets (uploaded media, learning attachments, internal files)",
    "the Vectorize index (derived — rebuilt by the knowledge sweep from the team databases)",
    "Durable Object state (TeamChannel holds sockets, not app data)",
    "secrets (RESEND_API_KEY, GOOGLE_*, CF_D1_TOKEN, INTERNAL_KEY, GOOGLE_TOKEN_KEY)",
  ],
  restoreWith: "RESILIENCE.md § Live data can be recovered",
}
writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)

console.log(
  failures
    ? `\n${failures} problem(s) — this backup is NOT complete. Do not rely on it.`
    : `\nBacked up ${captured.length} database(s) to ${dir}`
)
process.exit(failures ? 1 : 0)
