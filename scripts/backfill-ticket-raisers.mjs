// WHO RAISED THIS TICKET — the one column the Glide import left empty.
//
//   node scripts/backfill-ticket-raisers.mjs <team-db>            # dry run, writes nothing
//   node scripts/backfill-ticket-raisers.mjs <team-db> --apply    # writes
//
// The import landed 1,820 legacy tickets with their app and their module and
// never resolved a raiser, so every one of them was attributed to nobody. A
// client opening the portal would see two years of their own history with no
// name on it, which reads as a bug rather than as a gap. Aurora's audit module
// wants the same join (a person, a record, a role), so this is worth fixing once
// rather than working around twice.
//
// THE JOIN IS TWO KEYS, because neither one alone reaches far enough. Glide's
// ticket number becomes our `ref` (`CONFIA-T0061` ← code `CONFIA`, number 61),
// which covers the rows whose app code survived the transform unchanged; the
// rest are matched on `created_at`, which came straight out of Glide to the
// second. Taken together they reach 96% of the imported tickets; ref alone
// reaches 90% and so does created_at, and they fail on DIFFERENT rows.
//
// A TIMESTAMP IS ONLY A KEY WHILE IT IS UNIQUE. Sixteen Glide rows share a
// created_at with another row, and those are skipped rather than guessed —
// attributing a ticket to the wrong person is worse than leaving it blank,
// because a wrong name looks answered and a blank one looks like what it is.
//
// IDEMPOTENT. Only rows where the column IS NULL are written, so a second run
// changes nothing and an interrupted run resumes. It writes `raised_by_contact_id`
// and NOTHING else — no audit block, because this is the import finishing its own
// job rather than a person editing a ticket.

import { readFileSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"

const DB = process.argv[2]
const APPLY = process.argv.includes("--apply")

if (!DB || DB.startsWith("--")) {
  console.error("Usage: node scripts/backfill-ticket-raisers.mjs <team-db> [--apply]")
  process.exit(1)
}

/** Glide's own field ids, the same ones `glide-transform.mjs` names. */
const F = { appCode: "i3vbH", number: "fGKgz", createdAt: "72pZY", reporterEmail: "Gehuq" }

/** One D1 read through wrangler, under `cf-exec` so it cannot reach the wrong
 * Cloudflare account. The banner lines before the JSON are why this looks for
 * the array rather than parsing stdout whole. */
function d1(sql) {
  const out = execFileSync(
    "cf-exec",
    ["npx", "wrangler", "d1", "execute", DB, "--remote", "--json", "--command", sql],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  )
  return JSON.parse(out.slice(out.indexOf("[\n  {"))) [0].results
}

const rows = JSON.parse(readFileSync("glide/data/agency.tickets.json", "utf8")).rows

// ── the two keys, built off the export ───────────────────────────────────────
const byRef = new Map()
const byCreated = new Map()
for (const r of rows) {
  const email = String(r[F.reporterEmail] ?? "").trim().toLowerCase()
  if (!email) continue
  const code = r[F.appCode]
  const num = r[F.number]
  if (code && num !== null && num !== undefined && num !== "") {
    byRef.set(`${code}-T${String(num).padStart(4, "0")}`, email)
  }
  const at = r[F.createdAt]
  if (at) byCreated.set(at, byCreated.has(at) ? null : email) // null = ambiguous, never guessed
}

// ── the people, off the live database ────────────────────────────────────────
// `individual` only: five COMPANY rows carry a raiser's address as their own
// contact email, and a company is not who raised a ticket.
const people = new Map(
  d1(
    "SELECT id, LOWER(email) AS email FROM accounts WHERE account_type = 'individual' AND email IS NOT NULL AND email <> ''"
  ).map((p) => [p.email, p.id])
)

const tickets = d1(
  "SELECT id, ref, created_at FROM help WHERE app_id IS NOT NULL AND raised_by_contact_id IS NULL"
)

const updates = []
const unresolved = { noGlideRow: 0, ambiguousTime: 0, noSuchPerson: new Map() }
for (const t of tickets) {
  let email = byRef.get(t.ref)
  if (!email) {
    if (byCreated.has(t.created_at) && byCreated.get(t.created_at) === null) {
      unresolved.ambiguousTime++
      continue
    }
    email = byCreated.get(t.created_at)
  }
  if (!email) {
    unresolved.noGlideRow++
    continue
  }
  const personId = people.get(email)
  if (!personId) {
    unresolved.noSuchPerson.set(email, (unresolved.noSuchPerson.get(email) ?? 0) + 1)
    continue
  }
  updates.push([t.id, personId])
}

console.log(`tickets still unattributed : ${tickets.length}`)
console.log(`  resolvable               : ${updates.length}`)
console.log(`  no matching Glide row    : ${unresolved.noGlideRow}`)
console.log(`  timestamp not unique     : ${unresolved.ambiguousTime}`)
console.log(`  raiser is not a contact  : ${[...unresolved.noSuchPerson.values()].reduce((a, b) => a + b, 0)}`)
for (const [email, n] of unresolved.noSuchPerson) console.log(`      ${n} × ${email}`)

if (!updates.length) process.exit(0)

// One statement per row, batched into files small enough for the REST door. A
// CASE expression over 1,700 ids would be one statement and one failure.
const sql = updates
  .map(([id, personId]) => `UPDATE help SET raised_by_contact_id = '${personId}' WHERE id = '${id}' AND raised_by_contact_id IS NULL;`)
  .join("\n")
const path = `/tmp/backfill-raisers-${DB}.sql`
writeFileSync(path, sql)

if (!APPLY) {
  console.log(`\nDRY RUN — ${updates.length} statements written to ${path}. Re-run with --apply to write.`)
  process.exit(0)
}

execFileSync("cf-exec", ["npx", "wrangler", "d1", "execute", DB, "--remote", "--yes", "--file", path], {
  stdio: "inherit",
})
console.log(`\napplied ${updates.length} rows.`)
