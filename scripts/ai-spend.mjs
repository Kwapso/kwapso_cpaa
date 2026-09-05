#!/usr/bin/env node
// WHAT THE ASSISTANT ACTUALLY COST, off the meter, in money.
//
//   node --experimental-transform-types scripts/ai-spend.mjs
//   node --experimental-transform-types scripts/ai-spend.mjs --production
//   node --experimental-transform-types scripts/ai-spend.mjs --days 30
//
// READ-ONLY. Four SELECTs against a core database and nothing else — no model
// call, no write, no billed inference of any kind. Running this to find out what
// you spent must never itself be a thing you spent.
//
// ── WHY IT EXISTS ───────────────────────────────────────────────────────────
//
// Every AI unit a team spends is metered (`agent_usage`), and since core
// migration 0027 every command records the TOKENS the provider reported for it
// (`agent_usage_log.input_tokens` / `output_tokens`). So the estate's real spend
// has been sitting in a table, in the only unit that can be turned into money,
// and nothing turned it into money. The app shows a quota badge in UNITS; the
// bench prints an estimate for a run that has not happened yet; COSTS.md prices
// a hypothetical turn at published rates. None of them answers "what did last
// month cost", which is the question.
//
// This does, and it answers it with the SAME rate card COSTS.md quotes
// (`shared/workers/pricing.ts`), so a figure here and a figure there cannot
// drift apart.
//
// ── WHAT IT REFUSES TO DO ───────────────────────────────────────────────────
//
// It will not price a model it has no rate for. `aiCostUsd` answers
// UNPRICED_MODEL, a negative number, precisely so a missing rate cannot flow
// into a total as "free" — the mistake the bench's own `neurons ?? 0` made in
// miniature. And it says how many rows carried NO token counts, because a total
// computed over half the rows is not a total and the coverage is the first thing
// to check before believing the money.

import "./lib/shared-alias.mjs"

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { cloudflareCredentials } from "./lib/cf-credentials.mjs"

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..")
const { aiCostUsd, aiNeurons, UNPRICED_MODEL, usd, PRICES_READ_ON } = await import(
  join(REPO, "shared", "workers", "pricing.ts")
)

const PRODUCTION = process.argv.includes("--production")
const daysArg = process.argv.indexOf("--days")
const DAYS = daysArg > -1 ? Number(process.argv[daysArg + 1]) : 30
if (!Number.isFinite(DAYS) || DAYS <= 0 || DAYS > 365) {
  console.error("--days wants a whole number of days between 1 and 365.")
  process.exit(1)
}

/** THE CORE DATABASE OF EACH ENVIRONMENT, read out of the wrangler config rather
 * than typed here. This machine hosts more than one Cloudflare account and
 * eleven of the sixteen databases on this one belong to other companies, so a
 * hard-coded id is a decision made months ago by somebody who is not in the
 * room. `CORE_DATABASE_ID` is already in tenancy's config for the growth watch,
 * with a comment saying it must not drift; this reads the same line. */
function coreDatabaseId() {
  const src = readWrangler()
  // The staging block's own id when --production is absent, the top-level (which
  // IS production in this repo's config shape) when it is present.
  const ids = [...src.matchAll(/"CORE_DATABASE_ID":\s*"([^"]+)"/g)].map((m) => m[1])
  if (ids.length < 2)
    throw new Error(
      "could not find both CORE_DATABASE_ID pins in workers/tenancy/wrangler.jsonc — refusing to guess which database to read"
    )
  return PRODUCTION ? ids[0] : ids[1]
}
function readWrangler() {
  return readFileSync(join(REPO, "workers", "tenancy", "wrangler.jsonc"), "utf8")
}

const { account: ACCOUNT, token: TOKEN } = cloudflareCredentials()
const CORE = coreDatabaseId()
const CF = "https://api.cloudflare.com/client/v4"

async function sql(statement, params = []) {
  const res = await fetch(`${CF}/accounts/${ACCOUNT}/d1/database/${CORE}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql: statement, params }),
    // R11's spirit in a script: a hung read must end, not hang a terminal.
    signal: AbortSignal.timeout(60_000),
  })
  const json = await res.json()
  if (!json.success)
    throw new Error(`${statement.slice(0, 70)}: ${JSON.stringify(json.errors).slice(0, 300)}`)
  return json.result[0].results
}

/** WHICH ENGINE PRICED THESE ROWS. `agent_usage_log` records tokens and not the
 * model that produced them, so this reads the deployment's pin — the same source
 * the routing bench reads, and for the same reason: a rate card applied to the
 * wrong engine is a report that is confidently wrong. It is stated in the output
 * rather than assumed, and a run that spans an engine SWITCH is called out. */
function pinnedModel() {
  const src = readFileSync(join(REPO, "workers", "data-ops", "wrangler.jsonc"), "utf8")
  const pins = [...src.matchAll(/"AGENT_MODEL":\s*"([^"]+)"/g)].map((m) => m[1])
  if (new Set(pins).size !== 1)
    throw new Error(`environments disagree on AGENT_MODEL (${[...new Set(pins)].join(" vs ")})`)
  return pins[0]
}

const model = pinnedModel()
const since = new Date(Date.now() - DAYS * 86_400_000).toISOString()

const totals = (
  await sql(
    `SELECT COUNT(*) AS commands,
            COUNT(DISTINCT team_id) AS teams,
            SUM(credits) AS units,
            SUM(COALESCE(input_tokens, 0)) AS input,
            SUM(COALESCE(output_tokens, 0)) AS output,
            SUM(COALESCE(cache_read_tokens, 0)) AS cacheRead,
            SUM(CASE WHEN input_tokens IS NULL THEN 1 ELSE 0 END) AS untokened
       FROM agent_usage_log WHERE created_at > ?`,
    [since]
  )
)[0]

const perTeam = await sql(
  `SELECT team_id AS team, COUNT(*) AS commands, SUM(credits) AS units,
          SUM(COALESCE(input_tokens, 0)) AS input, SUM(COALESCE(output_tokens, 0)) AS output,
          SUM(COALESCE(cache_read_tokens, 0)) AS cacheRead
     FROM agent_usage_log WHERE created_at > ?
    GROUP BY team_id ORDER BY input DESC LIMIT 20`,
  [since]
)

const busiest = await sql(
  `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS commands,
          SUM(COALESCE(input_tokens, 0)) AS input, SUM(COALESCE(output_tokens, 0)) AS output,
          SUM(COALESCE(cache_read_tokens, 0)) AS cacheRead
     FROM agent_usage_log WHERE created_at > ?
    GROUP BY day ORDER BY input DESC LIMIT 5`,
  [since]
)

const usage = (
  await sql(`SELECT COUNT(*) AS rows, SUM(used) AS used FROM agent_usage WHERE period > ?`, [
    since.slice(0, 10),
  ])
)[0]

const spend = aiCostUsd(model, { input: totals.input, output: totals.output, cacheRead: totals.cacheRead })
const neurons = aiNeurons(model, { input: totals.input, output: totals.output, cacheRead: totals.cacheRead })

console.log(`environment      ${PRODUCTION ? "production" : "staging"} core (${CORE})`)
console.log(`window           the last ${DAYS} days, since ${since.slice(0, 10)}`)
console.log(`engine           ${model}   (rates read ${PRICES_READ_ON})`)
console.log()
console.log(`assistant commands  ${Number(totals.commands ?? 0).toLocaleString()} across ${totals.teams ?? 0} team(s)`)
console.log(`AI units metered    ${Number(totals.units ?? 0).toLocaleString()}`)
console.log(`input tokens        ${Number(totals.input ?? 0).toLocaleString()}`)
console.log(`output tokens       ${Number(totals.output ?? 0).toLocaleString()}`)
console.log(
  `cache-read tokens   ${Number(totals.cacheRead ?? 0).toLocaleString()}   ` +
    `(prompt tokens Cloudflare served from its prefix cache — priced at FULL input rate here, ` +
    `because no cached rate is published for this model. See shared/workers/pricing.ts.)`
)
if (spend === UNPRICED_MODEL) {
  console.log()
  console.log(`NO PRICE for ${model} in shared/workers/pricing.ts, so no total is offered.`)
  console.log(`Add it there, with the page you read it from and the day you read it.`)
} else {
  console.log()
  console.log(`COST             ${usd(spend)}   (~${Math.round(neurons).toLocaleString()} neurons)`)
  if (totals.commands > 0)
    console.log(`per command      ${usd(spend / totals.commands)}`)
  if (totals.units > 0) console.log(`per AI unit      ${usd(spend / totals.units)}`)
}

// COVERAGE BEFORE CREDIBILITY. A total over rows that carry no tokens is not a
// total, and the honest failure is to say so rather than to print a small
// number. Rows written before core 0027 have NULL token columns by construction.
if (totals.untokened > 0)
  console.log(
    `\nNOTE  ${Number(totals.untokened).toLocaleString()} of ${Number(totals.commands).toLocaleString()} commands carry no token counts ` +
      `(pre-0027 rows, or a provider reply that reported none). The figure above covers the rest, so read it as a FLOOR.`
  )

if (perTeam.length) {
  console.log(`\nby team (top ${perTeam.length} by input tokens):`)
  for (const r of perTeam) {
    const c = aiCostUsd(model, { input: r.input, output: r.output, cacheRead: r.cacheRead })
    console.log(
      `  ${String(r.team).padEnd(30)} ${String(r.commands).padStart(6)} cmd  ${String(r.units ?? 0).padStart(6)} units  ${
        c === UNPRICED_MODEL ? "unpriced" : usd(c)
      }`
    )
  }
}
if (busiest.length) {
  console.log(`\nbusiest days:`)
  for (const r of busiest) {
    const c = aiCostUsd(model, { input: r.input, output: r.output, cacheRead: r.cacheRead })
    console.log(
      `  ${r.day}  ${String(r.commands).padStart(5)} cmd  ${c === UNPRICED_MODEL ? "unpriced" : usd(c)}`
    )
  }
}
console.log(
  `\nagent_usage rows in window: ${usage.rows ?? 0}, ${Number(usage.used ?? 0).toLocaleString()} unit(s) counted — ` +
    `this is the METER the allowance is enforced against; the token figures above are what those units actually cost.`
)
console.log(
  `\nThe ground truth for the bill is the account's own analytics ` +
    `(aiInferenceAdaptiveGroups { sum { totalNeurons } dimensions { modelId } }) for the same window. ` +
    `The neuron figure above is this arithmetic in that unit, so the two can be compared without converting anything by hand.`
)
