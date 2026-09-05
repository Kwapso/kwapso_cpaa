// THE FOUR NUMBERS — how long one read, one write, one delete and one bulk run
// actually take, against REAL staging data, without deploying anything.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// `shared/workers/limits.ts` states a budget for each of the four classes of
// operation. A budget nobody measures against is a wish, and until 5 Sep 2026
// exactly one of the four had ever been timed: READ, from outside, twice. WRITE,
// DELETE and BULK had no number anywhere, from anybody, ever — which meant the
// slowest thing in the product (a CSV import) was slow by INFERENCE, and the day
// of work proposed to fix it rested on a multiplication nobody had checked.
//
// So this takes the four numbers, and it can be re-run by anybody:
//
//   node --experimental-transform-types scripts/speed-bench.mjs          # reads only
//   node --experimental-transform-types scripts/speed-bench.mjs --writes # all four
//
// `--experimental-transform-types`, NOT `--experimental-strip-types`: strip mode
// cannot compile the constructor parameter properties in shared/workers/gating.ts.
// Same reason query-bench.mjs and kb-bench.mjs both say so.
//
// ── IT MEASURES A BRANCH, WITHOUT DEPLOYING ANYTHING ────────────────────────
//
// The same three properties query-bench.mjs stands on:
//
//   • The libs are IMPORTED FROM A WORKING TREE — this one by default, or
//     another via `SB_REPO=/path/to/other/checkout`. So a change can be measured
//     against the code it replaces, on the same database, in the same session,
//     which is the only way a "this removed three round trips" claim is a
//     measurement rather than an argument.
//   • D1 NEEDS NO STAND-IN. `d1Query` already speaks to Cloudflare's REST door,
//     so the rows come out of the real database exactly as they do in production
//     and the round trip being measured is the real round trip.
//   • The GATE is not re-implemented. This constructs the `MemberGuard` a door
//     would have handed the lib; permission is proved by the door's own suites
//     (gating-seam, client-reachable-doors), and a bench that re-implemented a
//     gate would be measuring its own copy of one.
//
// ── WHAT IT WRITES, AND WHAT IT PUTS BACK ───────────────────────────────────
//
// Reads are the default and touch nothing. `--writes` raises tickets through the
// shipped `createTicket`, moves one through the shipped status door, and then
// HARD DELETES every row it created, by the exact ids it created, plus their
// activity rows. That is a deliberate exception to deactivate-not-delete: these
// rows were never a person's record of anything, and leaving benchmark tickets
// in a staging list is worse than removing them.
//
// THE ONE RESIDUE it cannot put back is the reference counter. `nextTeamRef`
// mints "T0412" and the sequence has no way to give a number back, so a run of
// twenty-four leaves a gap of twenty-four in the T sequence. Stated here rather
// than discovered later; it is why the write half is opt-in and why the counts
// below are small.
//
// ── WHERE THE ACCOUNT COMES FROM ────────────────────────────────────────────
//
// `scripts/lib/cf-credentials.mjs`, which resolves the FOLDER to an account. Run
// it from a registered checkout: this machine hosts more than one Cloudflare
// account and eleven of the sixteen databases on this one belong to other
// businesses.

import "./lib/shared-alias.mjs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { cloudflareCredentials } from "./lib/cf-credentials.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
/** WHICH WORKING TREE'S CODE IS BEING MEASURED. Defaults to this script's own
 * repo; `SB_REPO` points it at another checkout so a branch and the main line
 * can be timed against the same rows minutes apart. */
const REPO = process.env.SB_REPO ? process.env.SB_REPO : join(HERE, "..")

// DYNAMIC, not static: every static import is resolved before any of them runs,
// so an `@shared/*` specifier at the top of this file would be looked up before
// the hook that teaches Node what it means has run.
const { sqlString } = await import(join(REPO, "shared", "workers", "d1-rest.ts"))
// THE YARDSTICK COMES FROM THIS CHECKOUT, NOT FROM THE CODE UNDER TEST. When
// `SB_REPO` points at another tree the budgets must still be the ones being
// measured against, or a comparison would be scored by two different rulers —
// and an older tree may not have the constants at all.
const { LATENCY_BUDGET_MS, BULK_CONCURRENCY, MEASURED_MS, MEASURED_ON } = await import(
  join(HERE, "..", "shared", "workers", "limits.ts")
)
const help = await import(join(REPO, "workers", "content", "src", "lib", "help.ts"))
const workLogs = await import(join(REPO, "workers", "content", "src", "lib", "work-logs.ts"))

const { account: ACCOUNT, token: TOKEN } = cloudflareCredentials()
const CORE = process.env.SB_CORE || "1df02340-fc91-4cac-8ccb-d19528dcd9f7" // kwapso-core-staging
const TEAM_NAME = process.env.SB_TEAM || "Kwapso"
const WRITES = process.argv.includes("--writes")
/** Rows the bulk comparison raises PER ARM. Two arms (serial, then waves), so a
 * run creates twice this. Small on purpose — see the reference-counter residue
 * in the header. Twenty-four is two full waves of `BULK_CONCURRENCY`. */
const BULK_ROWS = Number(process.env.SB_BULK_ROWS || 24)
/** Samples per read. The first is always the slowest (connection setup), so the
 * median of five is what is reported and the spread is printed beside it. */
const SAMPLES = Number(process.env.SB_SAMPLES || 5)
/** Samples per WRITE. Fewer than the reads by default because each one leaves a
 * gap in the reference sequence (see the header). Raise it with
 * `SB_WRITE_SAMPLES` when comparing two trees: the laptop-to-Cloudflare leg
 * drifts by hundreds of milliseconds over a few minutes, so a three-sample
 * median can report a change that is really the weather. `SB_BULK_ROWS=0`
 * skips the bulk arm, which is what an A/B on the create path wants. */
const WRITE_SAMPLES = Number(process.env.SB_WRITE_SAMPLES || 3)

const CF = "https://api.cloudflare.com/client/v4"
async function raw(db, sql, params = []) {
  const res = await fetch(`${CF}/accounts/${ACCOUNT}/d1/database/${db}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(60_000),
  })
  const json = await res.json()
  if (!json.success) throw new Error(JSON.stringify(json.errors).slice(0, 300))
  return json.result[0]
}

const [team] = (await raw(CORE, "SELECT id, database_id FROM teams WHERE name = ? LIMIT 1", [TEAM_NAME])).results
if (!team?.database_id) throw new Error(`no team called "${TEAM_NAME}" with a database`)

const guard = { userId: "speed-bench", teamId: team.id, roleId: "speed-bench", databaseId: team.database_id }
const actor = { id: "speed-bench", email: "speed-bench@kwapso.app", name: "Speed bench" }
const scope = { kind: "staff" }

/** A fresh trip collector per timed operation, so `trips` is this operation's
 * own count and not a running total. Same array the workers hang on the config. */
function freshCfg() {
  const stats = []
  return { cfg: { accountId: ACCOUNT, apiToken: TOKEN, stats }, stats }
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

async function time(label, budgetKey, run, samples = SAMPLES) {
  const wall = []
  let trips = 0
  let d1ms = 0
  for (let i = 0; i < samples; i++) {
    const { cfg, stats } = freshCfg()
    const started = Date.now()
    await run(cfg)
    wall.push(Date.now() - started)
    trips = stats.length
    d1ms = stats.reduce((s, x) => s + x.ms, 0)
  }
  const ms = median(wall)
  const budget = LATENCY_BUDGET_MS[budgetKey]
  const verdict = ms <= budget ? "within" : `${(ms / budget).toFixed(1)}x over`
  // BESIDE THE RECORDED READING, not on its own. One number is an opinion; this
  // one against the figure in limits.ts is a trend, and a drift shows up the
  // moment somebody runs the bench rather than the next time somebody complains.
  const was = MEASURED_MS[budgetKey]
  const drift = was
    ? ` · ${MEASURED_ON} said ${was}ms (${ms > was ? "+" : ""}${Math.round(((ms - was) / was) * 100)}%)`
    : ""
  console.log(
    `  ${label.padEnd(42)} ${String(ms).padStart(6)}ms  ` +
      `(${Math.min(...wall)}–${Math.max(...wall)})  ${String(trips).padStart(3)} trips, ` +
      `${d1ms}ms in D1  —  ${budgetKey} budget ${budget}ms: ${verdict}${drift}`
  )
  return { ms, trips, d1ms }
}

console.log(`\nspeed-bench — team "${TEAM_NAME}" on staging, code from ${REPO}`)
console.log(`  ${new Date().toISOString()}  ·  median of ${SAMPLES}  ·  writes ${WRITES ? "ON" : "off"}\n`)

const counts = (await raw(team.database_id,
  "SELECT (SELECT COUNT(*) FROM help) h, (SELECT COUNT(*) FROM work_logs) w, (SELECT COUNT(*) FROM activity) a, (SELECT COUNT(*) FROM selectable_data) s"
)).results[0]
console.log(`  rows: help ${counts.h} · work_logs ${counts.w} · activity ${counts.a} · selectable_data ${counts.s}\n`)

console.log("READ")
await time("tickets, one page of 50", "read", (cfg) => help.listTickets(cfg, guard, scope, {}, null))
await time("tickets, exact count", "read", (cfg) => help.countTickets(cfg, guard, scope, {}))
await time("work logs, one page (team-wide)", "read", (cfg) => workLogs.listWorkLogs(cfg, guard, {}, null))
await time("work logs, the whole insights panel", "read", (cfg) => workLogs.summariseWorkLogs(cfg, guard, {}, new Date()))

if (!WRITES) {
  console.log("\n  (write / delete / bulk skipped — re-run with --writes)\n")
  process.exit(0)
}

// A REALISTIC TICKET, not the cheapest one. Every optional field on a ticket is
// a preflight check the door makes before it writes — the client, the app, the
// section of that app, the person who asked — and a create that names none of
// them skips four of the six round trips and reports a number no real form ever
// produces. So the ids come off the team's own rows, and the bench raises the
// ticket a person raises.
const [ref] = (await raw(team.database_id,
  `SELECT (SELECT id FROM accounts WHERE deactivated_at IS NULL AND id IN (SELECT account_id FROM help WHERE account_id IS NOT NULL LIMIT 1) LIMIT 1) AS account_id,
          (SELECT id FROM apps WHERE deactivated_at IS NULL LIMIT 1) AS app_id`
)).results
const [mod] = (await raw(team.database_id,
  `SELECT id FROM app_modules WHERE deactivated_at IS NULL AND app_id = ? LIMIT 1`, [ref?.app_id ?? ""]
)).results
const [contact] = (await raw(team.database_id,
  `SELECT p.id FROM accounts p WHERE p.deactivated_at IS NULL AND (p.id = ? OR EXISTS (
     SELECT 1 FROM account_links l WHERE l.person_account_id = p.id AND l.account_id = ? AND l.deactivated_at IS NULL)) LIMIT 1`,
  [ref?.account_id ?? "", ref?.account_id ?? ""]
)).results
const shape = [
  ref?.account_id && "client", ref?.app_id && "app", mod?.id && "module", contact?.id && "contact",
].filter(Boolean)
console.log(`  a bench ticket names: ${shape.join(", ") || "nothing (no live rows found — the create will be cheaper than a real one)"}\n`)

const raised = []
async function raise(cfg, n) {
  const out = await help.createTicket(cfg, guard, scope, actor, {
    description: `speed-bench ${new Date().toISOString()} #${n}`,
    accountId: ref?.account_id ?? undefined,
    appId: ref?.app_id ?? undefined,
    moduleId: mod?.id ?? undefined,
    raisedByContactId: contact?.id ?? undefined,
  })
  raised.push(out.id)
  return out
}

try {
  console.log("\nWRITE")
  let n = 0
  await time("raise a ticket (gated create, end to end)", "write", (cfg) => raise(cfg, n++), WRITE_SAMPLES)

  console.log("\nDELETE")
  // The app deactivates rather than deletes, so the delete class IS a status
  // move with R17's predicate riding the UPDATE. Measured on rows this run made.
  const victim = raised[0]
  await time("move a ticket's status (a deactivate)", "delete",
    (cfg) => help.setStatus(cfg, guard, scope, actor, victim, "resolved"), 1)

  if (BULK_ROWS > 0) {
  console.log("\nBULK — the import's inner loop, both ways")
  // WHAT THIS IS AND IS NOT. The import calls a gated create once per row over a
  // service binding; a service binding has no stand-in in Node, so what is timed
  // here is the CREATE ITSELF, once per row, which is everything the door does
  // except the hop into it. The row RATE is the number the import's wall clock
  // is made of, and it is the number the serial-vs-waves change moves.
  const { cfg: serialCfg } = freshCfg()
  let t0 = Date.now()
  for (let i = 0; i < BULK_ROWS; i++) await raise(serialCfg, 1000 + i)
  const serialMs = Date.now() - t0

  const { cfg: waveCfg } = freshCfg()
  t0 = Date.now()
  for (let i = 0; i < BULK_ROWS; i += BULK_CONCURRENCY) {
    const wave = []
    for (let k = i; k < Math.min(i + BULK_CONCURRENCY, BULK_ROWS); k++) wave.push(raise(waveCfg, 2000 + k))
    await Promise.all(wave)
  }
  const waveMs = Date.now() - t0

  const per = (ms) => (ms / BULK_ROWS).toFixed(0)
  console.log(`  ${String(BULK_ROWS).padStart(3)} rows, one at a time            ${String(serialMs).padStart(6)}ms  (${per(serialMs)}ms/row)`)
  console.log(`  ${String(BULK_ROWS).padStart(3)} rows, ${BULK_CONCURRENCY} at a time            ${String(waveMs).padStart(6)}ms  (${per(waveMs)}ms/row)`)
  console.log(`  → ${(serialMs / waveMs).toFixed(1)}x`)
  console.log(
    `  a 1,000-row file at those rates: serial ${(serialMs / BULK_ROWS * 1000 / 60000).toFixed(1)} min` +
      ` · waves ${(waveMs / BULK_ROWS * 1000 / 60000).toFixed(1)} min` +
      `  —  bulk budget ${(LATENCY_BUDGET_MS.bulk / 60000).toFixed(0)} min`
  )
  }
} finally {
  // PUT IT BACK. Hard delete, by the exact ids this run created, plus the
  // activity rows that name them. `finally`, so a bench that threw halfway does
  // not leave its rows behind — the failure mode that turns a benchmark into a
  // data-cleanup job for somebody else.
  if (raised.length) {
    const ids = raised.map((id) => sqlString(id)).join(", ")
    await raw(team.database_id, `DELETE FROM help WHERE id IN (${ids})`)
    await raw(team.database_id, `DELETE FROM activity WHERE related_table = 'help' AND related_row_id IN (${ids})`)
    console.log(`\n  cleaned up ${raised.length} bench rows (the T-sequence keeps its gap — see the header)`)
  }
}
console.log()
