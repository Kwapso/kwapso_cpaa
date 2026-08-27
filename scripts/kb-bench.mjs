// THE RETRIEVAL BENCH — what the knowledge base actually answers, measured
// against the agency's own material rather than against books.
//
// ── IT MEASURES A BRANCH, WITHOUT DEPLOYING ANYTHING ────────────────────────
//
// That is the whole property, and it is the reason a retrieval change can be
// judged at all. A bench that asked the deployed door would measure whatever is
// deployed — so a change sitting on a branch could not be measured before it
// shipped, and "ship it and see" is a hope, not a gate. Three things make the
// other way possible, and the third is the one nobody guesses:
//
//   • `retrieve` is IMPORTED FROM THE WORKING TREE. The code under test is the
//     file you just edited, not a copy of it and not a deployment of it.
//   • env.KNOWLEDGE_INDEX and env.AI are one small object each — Vectorize and
//     bge-m3 over their REST doors, same index, same namespace, same filter,
//     same model. A Worker gives a binding; Node gives a `fetch`. Nothing else
//     differs, and the fence is exercised rather than asserted.
//   • D1 NEEDS NO STAND-IN AT ALL. `d1Query` already speaks to Cloudflare's REST
//     door, so pointing `cfg` at the real team database means the WORDS come out
//     of the real database under the real reader clause (R26), exactly as they
//     do in production.
//
// So: real code, real index, real embeddings, real rows, real fences — and no
// deploy. Run it on `main`, run it on your branch, read the difference.
//
// ── HOW TO RUN IT ───────────────────────────────────────────────────────────
//
//   node --experimental-transform-types scripts/kb-bench.mjs
//   node --experimental-transform-types scripts/kb-bench.mjs --verbose
//
// `--experimental-transform-types`, NOT `--experimental-strip-types`: the strip
// mode cannot compile the constructor parameter properties in
// shared/workers/gating.ts and dies before the first question. `@shared/*` is
// resolved by scripts/lib/shared-alias.mjs, imported on the first line below.
//
// KB_INDEX / KB_CORE / KB_TEAM point it at another environment; it is read-only
// in every one of them.
//
// ── WHAT IT COSTS ───────────────────────────────────────────────────────────
//
// One embedding call per question (a few thousand tokens, on Workers AI) and one
// Vectorize query each. It never asks for `compose`, so it spends nothing from
// the team's own AI allowance — composing is the only act on this module that
// draws it. The token comes from the Keychain, like every other script here.
// Nothing is written: every statement this runs is a SELECT.
//
import "./lib/shared-alias.mjs"

import { execSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, "..")
const VERBOSE = process.argv.includes("--verbose")

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "b5bb3d84a59c029ea5e0fe164dab1cf7"
const TOKEN =
  process.env.CLOUDFLARE_API_TOKEN ||
  execSync("security find-generic-password -s cloudflare-token-kwapso -w").toString().trim()
const CORE = process.env.KB_CORE || "1df02340-fc91-4cac-8ccb-d19528dcd9f7" // kwapso-core-staging
const INDEX = process.env.KB_INDEX || "kwapso-knowledge-staging"
const TEAM_NAME = process.env.KB_TEAM || "Kwapso"

const { retrieve } = await import(join(REPO, "workers", "content", "src", "lib", "knowledge.ts"))

/* ------------------------------ the REST doors ----------------------------- */

const CF = "https://api.cloudflare.com/client/v4"
async function cf(path, body) {
  const res = await fetch(`${CF}/accounts/${ACCOUNT}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    // R11's spirit: a bench that hangs is a bench nobody runs.
    signal: AbortSignal.timeout(60_000),
  })
  const json = await res.json()
  if (!json.success && json.errors) throw new Error(`${path}: ${JSON.stringify(json.errors).slice(0, 300)}`)
  return json.result
}

const sql = async (db, statement, params = []) =>
  (await cf(`/d1/database/${db}/query`, { sql: statement, params }))[0].results

/** VECTORIZE, AS THE BINDING LOOKS FROM INSIDE THE WORKER. `searchVectors` is
 * the only caller and it sends exactly one shape — namespace, topK, filter, and
 * neither values nor metadata (R26's second fence) — so this implements that
 * shape and nothing else. NDJSON in, matches out. */
function vectorizeStandIn() {
  return {
    async query(vector, opts) {
      const res = await fetch(`${CF}/accounts/${ACCOUNT}/vectorize/v2/indexes/${INDEX}/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          vector,
          topK: opts.topK,
          namespace: opts.namespace,
          filter: opts.filter,
          returnValues: false,
          returnMetadata: "none",
        }),
        signal: AbortSignal.timeout(60_000),
      })
      const json = await res.json()
      if (!json.success) throw new Error(`vectorize: ${JSON.stringify(json.errors).slice(0, 300)}`)
      return { matches: json.result?.matches ?? [] }
    },
  }
}

/** The embedding model, over REST rather than over a binding. Same model id the
 * worker defaults to, so the numbers are on the same scale as production's. */
const AI = {
  async run(model, input) {
    const res = await fetch(`${CF}/accounts/${ACCOUNT}/ai/run/${model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(60_000),
    })
    const json = await res.json()
    if (!json.success) throw new Error(`ai: ${JSON.stringify(json.errors).slice(0, 300)}`)
    return json.result
  },
}

/* ------------------------------ who is asking ------------------------------ */

const [team] = await sql(CORE, "SELECT id, database_id FROM teams WHERE name = ? LIMIT 1", [TEAM_NAME])
if (!team?.database_id) throw new Error(`no team called "${TEAM_NAME}" with a database`)
const TEAM_DB = team.database_id

// A REAL MEMBER, read out of the real tables — not a synthetic guard. The
// personal and app fences are read off this, so asking as somebody who does not
// exist would measure a knowledge base nobody can see.
//
// TWO DATABASES, because membership and rights live in different ones:
// `team_members` is global core (who is on which team), `role_permissions` is
// the team's own (what that role may do). The bench asks as the first member
// whose role can read the module — never as an invented one.
const members = await sql(
  CORE,
  `SELECT user_id, role_id FROM team_members WHERE team_id = ? AND deactivated_at IS NULL ORDER BY created_at`,
  [team.id]
)
const readers = await sql(
  TEAM_DB,
  `SELECT role_id FROM role_permissions WHERE module = 'knowledge' AND can_read = 1`
)
const canRead = new Set(readers.map((r) => r.role_id))
const member = members.find((m) => canRead.has(m.role_id))
if (!member) throw new Error("no member of this team may read the knowledge base")

const guard = {
  userId: member.user_id,
  teamId: team.id,
  roleId: member.role_id,
  databaseId: TEAM_DB,
}
const cfg = { accountId: ACCOUNT, apiToken: TOKEN }
const env = { AI, KNOWLEDGE_INDEX: vectorizeStandIn() }

/* -------------------------------- the questions ---------------------------- */

const { QUESTIONS } = await import(join(HERE, "kb-bench-questions.mjs"))

/* --------------------------------- scoring --------------------------------- */

/** DID IT ANSWER THE QUESTION? Three shapes, and each is a different claim:
 *
 *   cites  — one of these strings appears in a cited title. The base found the
 *            right document; that is what retrieval is FOR.
 *   refuse — the base must say it has nothing. A question about something that
 *            never happened is not a question with a best-effort answer.
 *   spread — the answer must not be one thing said several ways: at least this
 *            many DISTINCT real subjects among the citations.
 *
 * A question may set more than one. All of them must hold. */
function judge(q, answer) {
  const titles = answer.citations.map((c) => c.title)
  const reasons = []
  if (q.refuse && answer.found) reasons.push(`answered out of ${titles.join(" / ") || "?"}`)
  if (q.cites) {
    const hit = q.cites.some((want) => titles.some((t) => t.toLowerCase().includes(want.toLowerCase())))
    if (!hit) reasons.push(`wanted ${q.cites.join(" or ")}, cited ${titles.join(" / ") || "nothing"}`)
  }
  if (q.spread) {
    const subjects = new Set(titles.map((t) => t.toLowerCase().replace(/^(invitation|accepted|declined|notes|updated invitation|canceled|cancelled):\s*/i, "").replace(/[“”"]/g, "").trim()))
    if (subjects.size < q.spread) reasons.push(`only ${subjects.size} distinct subjects among ${titles.length} citations`)
  }
  return reasons
}

/* ---------------------------------- the run -------------------------------- */

console.log(`kb-bench — ${QUESTIONS.length} questions against ${INDEX} (team ${team.id})\n`)
let passed = 0
const rows = []
for (const [i, q] of QUESTIONS.entries()) {
  const label = `Q${String(i + 1).padStart(2, "0")}`
  let answer
  try {
    answer = await retrieve(env, cfg, guard, { question: q.q })
  } catch (e) {
    rows.push({ label, ok: false, why: [`threw: ${String(e).slice(0, 120)}`], q })
    console.log(`${label} FAIL  ${q.q.slice(0, 68)}`)
    continue
  }
  const why = judge(q, answer)
  const ok = why.length === 0
  if (ok) passed++
  rows.push({ label, ok, why, q, answer })
  console.log(
    `${label} ${ok ? "PASS" : "FAIL"}  ${q.q.slice(0, 62).padEnd(64)} ` +
      `${answer.found ? `${answer.passages.length}p/${answer.citations.length}c` : "refused"}` +
      `${ok ? "" : `  — ${why.join("; ")}`}`
  )
  if (VERBOSE && answer.citations.length)
    for (const c of answer.citations) console.log(`      · ${c.title}`)
}

console.log(`\nSCORE ${passed}/${QUESTIONS.length}`)
if (!VERBOSE && passed < QUESTIONS.length)
  console.log("re-run with --verbose to see every citation behind a failure")
process.exit(0)
