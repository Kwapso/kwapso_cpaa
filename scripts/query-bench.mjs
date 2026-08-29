// THE QUERY BENCH — what the query door answers, against REAL staging data,
// without deploying anything.
//
// The lane that built the door was opened by one measured question:
//
//   "how many open tickets from flu clinic, confia and HORSt combined and how
//    many resolved in july 2026 across all?"
//
// Under the old catalogue that cost 369,193 input tokens in a single turn and
// gave up. Three clients meant three calls, and "resolved in July" was
// INEXPRESSIBLE — the ticket door parsed twelve filters, every one single-valued
// and not one of them a date — so the only route to an answer was paging 1,820
// tickets by hand.
//
// This asks it against the same 1,820 tickets, through the shipped engine, and
// prints what it cost.
//
// ── IT MEASURES A BRANCH, WITHOUT DEPLOYING ANYTHING ────────────────────────
//
// Same three properties kb-bench.mjs stands on, and the same reasons:
//
//   • `parseQuery` and `runQuery` are IMPORTED FROM THE WORKING TREE. The code
//     under test is the file you just edited, not a deployment of it.
//   • D1 NEEDS NO STAND-IN. `d1Query` already speaks to Cloudflare's REST door,
//     so pointing `cfg` at the real team database means the rows come out of the
//     real database, exactly as they do in production.
//   • NOTHING IS WRITTEN. Every statement this runs is a SELECT, and the engine
//     it runs has no other kind.
//
// It deliberately does NOT drive the assistant. A model turn on staging spends
// the team's own allowance and would fold two changes into one number — the
// grammar, and whatever else is deployed. What is measured here is the thing
// this lane owns: how many CALLS the question takes, what each one returns, and
// how much of it the model would have to read.
//
// ── HOW TO RUN IT ───────────────────────────────────────────────────────────
//
//   node --experimental-transform-types scripts/query-bench.mjs
//
// `--experimental-transform-types`, NOT `--experimental-strip-types`: strip mode
// cannot compile the constructor parameter properties in shared/workers/gating.ts.
// QB_CORE / QB_TEAM point it at another environment; it is read-only in all of them.

import "./lib/shared-alias.mjs"

import { execSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..")

// DYNAMIC, not static. Every static import in a module is RESOLVED before any of
// them is evaluated, so an `@shared/*` specifier at the top of this file is
// looked up before the hook that teaches Node what it means has run. kb-bench.mjs
// reaches for the shipped code the same way, for the same reason.
const { QUERY_MODULES, queryModule } = await import(join(REPO, "shared", "workers", "query-grammar.ts"))
const { parseQuery, runQuery } = await import(
  join(REPO, "workers", "tenancy", "src", "lib", "query-engine.ts")
)

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "b5bb3d84a59c029ea5e0fe164dab1cf7"
const TOKEN =
  process.env.CLOUDFLARE_API_TOKEN ||
  execSync("security find-generic-password -s cloudflare-token-kwapso -w").toString().trim()
const CORE = process.env.QB_CORE || "1df02340-fc91-4cac-8ccb-d19528dcd9f7" // kwapso-core-staging
const TEAM_NAME = process.env.QB_TEAM || "Kwapso"

const CF = "https://api.cloudflare.com/client/v4"
async function cf(path, body) {
  const res = await fetch(`${CF}/accounts/${ACCOUNT}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  })
  const json = await res.json()
  if (!json.success && json.errors) throw new Error(`${path}: ${JSON.stringify(json.errors).slice(0, 300)}`)
  return json.result
}
const sql = async (db, statement, params = []) =>
  (await cf(`/d1/database/${db}/query`, { sql: statement, params }))[0].results

const [team] = await sql(CORE, "SELECT id, database_id FROM teams WHERE name = ? LIMIT 1", [TEAM_NAME])
if (!team?.database_id) throw new Error(`no team called "${TEAM_NAME}" with a database`)

const cfg = { accountId: ACCOUNT, apiToken: TOKEN }
/** The guard the engine reads: which database, and nothing else. The PERMISSION
 * half lives at the door (requireRight + refusePortalCaller) and is exercised by
 * workers/tenancy/test/query-fence.test.ts against the real route table — a
 * bench that re-implemented a gate would be measuring its own copy of one. */
const guard = { userId: "bench", teamId: team.id, roleId: "bench", databaseId: team.database_id }

/** CHARS PER TOKEN, calibrated on the measurement this lane started from: 192
 * tool definitions serialised to 118,850 characters and 31,094 tokens. Stated
 * rather than assumed, because a token count nobody can reproduce is a number
 * that quietly drifts. */
const CHARS_PER_TOKEN = 118850 / 31094

async function ask(label, module, request) {
  const mod = queryModule(module)
  if (!mod) throw new Error(`no module "${module}" — have: ${Object.keys(QUERY_MODULES).join(", ")}`)
  const started = Date.now()
  const answer = await runQuery(cfg, guard, mod, parseQuery(mod, request), QUERY_MODULES)
  const payload = {
    records: answer.page.rows,
    total: answer.total,
    hasMore: answer.page.hasMore,
    ...(answer.groups ? { groups: answer.groups, groupsTruncated: answer.groupsTruncated } : {}),
  }
  const chars = JSON.stringify(payload).length
  console.log(
    `\n── ${label}\n   ${JSON.stringify(request)}\n   → total ${answer.total}` +
      (answer.groups
        ? `, ${answer.groups.length} groups: ${answer.groups
            .map((g) => `${g.label ?? Object.values(g.key)[0]}=${g.count}`)
            .join(", ")}`
        : `, ${answer.page.rows.length} rows`) +
      (answer.unmatched?.length
        ? `\n   NAMED NOTHING: ${answer.unmatched.map((u) => `${u.field}=${u.values.join("/")}`).join(", ")}`
        : "") +
      `\n   ${chars} chars back (~${Math.round(chars / CHARS_PER_TOKEN)} tokens), ${Date.now() - started}ms`
  )
  return { answer, chars }
}

console.log(`team "${TEAM_NAME}" · database ${team.database_id}`)
const [{ n: ticketCount }] = await sql(team.database_id, "SELECT COUNT(*) AS n FROM help")
console.log(`the book being asked about: ${ticketCount} tickets`)

/* ─────────────────────── the question, in two calls ─────────────────────── */

const open = await ask(
  "CALL 1 — open tickets from the three clients, per client",
  "tickets",
  {
    where: [
      // The needles a model lands on from the question's own words. "flu clinic"
      // with a space matches nothing — the company is called "FluClinic" — which
      // is the honest behaviour of a substring search and worth seeing.
      { field: "accountId", op: "contains", value: ["flu", "confia", "horst"] },
      // "horst" is in here ON PURPOSE. It names no client in this base, and the
      // answer has to SAY so rather than quietly counting two — see `Unmatched`
      // in the engine for the sentence that made that a requirement.
      { field: "status", op: "ne", value: "resolved" },
    ],
    groupBy: ["accountId"],
  }
)

const july = await ask("CALL 2 — resolved in July 2026, across every client", "tickets", {
  where: [{ field: "resolvedAt", op: "between", value: ["2026-07-01", "2026-07-31"] }],
  // A "how many" question wants the number. Without this the door hands back a
  // page of fifty tickets as well — 23,250 characters, measured, to say 206.
  countOnly: true,
})

const combined = open.answer.groups.reduce((n, g) => n + g.count, 0)
console.log(
  `\n══ THE ANSWER, in ${2} calls\n` +
    `   ${combined} open across ${open.answer.groups.length} clients ` +
    `(${open.answer.groups.map((g) => `${g.label}: ${g.count}`).join(", ")})\n` +
    `   ${july.answer.total} resolved in July 2026, across all clients\n` +
    (open.answer.unmatched?.length
      ? `   …and the answer says which of the names asked about is not a client here: ` +
        `${open.answer.unmatched.flatMap((u) => u.values).join(", ")}\n`
      : "") +
    `   tool output the model has to read: ${open.chars + july.chars} chars ` +
    `(~${Math.round((open.chars + july.chars) / CHARS_PER_TOKEN)} tokens)`
)

/* ── what the old route would have cost, counted rather than guessed ──────── */

// PAGING, which is what the assistant actually did: fifty tickets a page, every
// page re-sent on top of the whole conversation so far. The rows are counted
// here (not fetched) — the point is the SHAPE of the cost, and one page of real
// rows is enough to price it.
const page = await ask("(for comparison) one page of the same tickets, unfiltered", "tickets", {})
const PAGE_ROWS = page.answer.page.rows.length
const pages = Math.ceil(ticketCount / Math.max(1, PAGE_ROWS))
console.log(
  `\n══ THE OLD ROUTE, priced\n` +
    `   ${ticketCount} tickets ÷ ${PAGE_ROWS} a page = ${pages} pages, and "resolved in July" ` +
    `could not be filtered at all\n` +
    `   ~${Math.round((page.chars * pages) / CHARS_PER_TOKEN).toLocaleString()} tokens of ROWS alone, ` +
    `before the preamble each step re-sends\n` +
    `   (the assistant gave up at 369,193 input tokens in one turn on 27 Aug 2026)`
)

/* ── the names a caller can actually filter on, which is why "horst" misses ── */

// The describe half, priced. Asked before CALL 1 it costs a few hundred
// characters and turns "nothing matched" into "here is how the clients are
// spelled" — the difference between an empty answer a person can act on and one
// they cannot.
const { QUERY_MODULES: MODS } = await import(join(REPO, "shared", "workers", "query-grammar.ts"))
const tickets = MODS.tickets
const inUse = await sql(
  team.database_id,
  `SELECT DISTINCT r.name AS label FROM ${tickets.table} t JOIN accounts r ON r.id = t.account_id
    WHERE t.account_id IS NOT NULL ORDER BY label LIMIT 61`
)
const names = inUse.map((r) => r.label).filter(Boolean)
console.log(
  `\n══ WHAT describe_module WOULD HAVE SAID FIRST\n` +
    `   clients with tickets (${names.length}): ${names.join(", ")}\n` +
    `   ${JSON.stringify(names).length} chars (~${Math.round(JSON.stringify(names).length / CHARS_PER_TOKEN)} tokens)\n` +
    `   — which is where "flu clinic" becomes "FluClinic", and where "horst" is ` +
    `visibly not a client rather than an empty result that says nothing.`
)
