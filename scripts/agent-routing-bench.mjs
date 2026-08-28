// THE ROUTING BENCH — which door the assistant reaches for FIRST, measured.
//
// A prompt change that tells the model "prefer the knowledge base" is a hope
// until something reads what the model actually did with it. This is that
// something. It asks ONE question per call, with the SHIPPED system prompt and
// the SHIPPED tool catalogue, and records the tool names the model chose. It
// never executes a tool, so nothing is read, written or billed on our side
// beyond the one model turn.
//
// ── WHY IT CAN JUDGE A BRANCH ───────────────────────────────────────────────
//
// `systemFor` and `toolSpecs` are IMPORTED FROM THE WORKING TREE, and the model
// is built by the shipped `selectModel`. So the prompt under test is the file
// you just edited and the catalogue is the one the worker will send. Run it on
// `main`, run it on your branch, read the difference. (The same property
// kb-bench.mjs has, for the retrieval half.)
//
// ── HOW TO RUN IT ───────────────────────────────────────────────────────────
//
//   node --experimental-transform-types scripts/agent-routing-bench.mjs --dry
//   node --experimental-transform-types scripts/agent-routing-bench.mjs
//   node --experimental-transform-types scripts/agent-routing-bench.mjs --verbose
//
// `--dry` spends NOTHING: it builds the prompt, prints its size and the question
// set, and stops. Run it first — it is how you learn what the real run will cost
// before you agree to it.
//
// ── WHAT IT COSTS ───────────────────────────────────────────────────────────
//
// One Claude turn per question, on the model the worker is configured with
// (claude-sonnet-5, low effort). The prompt is a ~40K-token prefix that is
// IDENTICAL on every question, so the first call writes the cache and the rest
// read it at a tenth — which is why the questions run in sequence rather than in
// parallel. The run prints what it spent, and it prints it BEFORE it exits.
//
import "./lib/shared-alias.mjs"

import { execSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, "..")
const DRY = process.argv.includes("--dry")
const VERBOSE = process.argv.includes("--verbose")

const { systemFor } = await import(join(REPO, "workers", "data-ops", "src", "lib", "agent.ts"))
const { toolSpecs } = await import(join(REPO, "workers", "data-ops", "src", "lib", "tools.ts"))
const { selectModel } = await import(join(REPO, "workers", "data-ops", "src", "lib", "model.ts"))

/* ------------------------------ the question set ------------------------- */

// AUTHORED OFF THE MATERIAL the staging base really holds (the same subjects
// kb-bench-questions.mjs was authored against), so the model is choosing between
// doors for a question somebody could really ask here.
//
// `want` is the door the question SHOULD open, and the three classes are three
// different judgements:
//
//   knowledge  What the team KNOWS — said, agreed, decided, written down. The
//              knowledge base holds it and nothing else does.
//   live       What retrieval structurally CANNOT answer: a count, a whole list,
//              a sort, a filter, "all of X". Reaching for the knowledge base
//              here is the failure in the other direction and it is worse,
//              because it answers confidently from a sample.
//   knowledge  (again) for the AMBIGUOUS ones — a question ABOUT a record. These
//              are the owner's complaint: the base mirrors the app's own rows and
//              every citation carries the row's `liveStatus` read at the moment
//              of asking, so one call answers what a rummage takes four to reach.
const QUESTIONS = [
  // ── what the team knows ────────────────────────────────────────────────
  { q: "What did we agree with Assecuranz about their file import?", want: "knowledge" },
  { q: "What was discussed on the HOGO sync?", want: "knowledge" },
  { q: "How do we record a damage case?", want: "knowledge" },
  { q: "What is the process for taking on a new insurance client?", want: "knowledge" },
  { q: "What came out of the Team Assembly?", want: "knowledge" },
  { q: "Remind me what we decided about issuing vouchers to a pharmacy.", want: "knowledge" },
  // ── what only a live read can answer ───────────────────────────────────
  { q: "How many open tickets are there right now?", want: "live" },
  { q: "List everyone on the team and the role each one holds.", want: "live" },
  { q: "Which tickets have nobody assigned to them?", want: "live" },
  { q: "What roles exist on this team?", want: "live" },
  { q: "How many accounts do we have?", want: "live" },
  { q: "Show me every ticket raised this week, newest first.", want: "live" },
  // ── about a record: the owner's complaint ──────────────────────────────
  { q: "What's going on with the HOGO account?", want: "knowledge" },
  { q: "Where do things stand with task 3144?", want: "knowledge" },
  { q: "Tell me about FluClinic.", want: "knowledge" },
  { q: "What's the latest on Assecuranz?", want: "knowledge" },
  { q: "Catch me up on the Kwapso CPAA work.", want: "knowledge" },
  { q: "What do we know about handing a vehicle to a new driver?", want: "knowledge" },
  // ── the control: questions the new rule could OVER-steer ──────────────
  // A rule that sends everything to the knowledge base would score full marks
  // above and be wrong. These four are doors the base must not swallow: three
  // writes, and the one read that asks about the base itself.
  { q: "Raise a ticket for Assecuranz about the failed file import.", want: "live" },
  { q: "Invite maria@fluclinic.se to the team as an admin.", want: "live" },
  { q: "Change ticket 3144 to resolved.", want: "live" },
  { q: "Is the knowledge base up to date?", want: "live" },
]

/* ------------------------------ the verdict ------------------------------ */

const ASK = "ask_knowledge"
/** A live read is any catalogue tool that is not the knowledge door — the point
 * of the `live` class is that the model went and looked the records up. */
const judge = (want, tools) => {
  const first = tools[0] ?? null
  if (want === "knowledge") return first === ASK
  return first !== null && first !== ASK
}

/* ------------------------------ the run ---------------------------------- */

const system = systemFor(null)
const tools = toolSpecs()

if (DRY) {
  console.log(`system prompt   ${system.length.toLocaleString()} chars  (~${Math.round(system.length / 4).toLocaleString()} tokens)`)
  const toolChars = JSON.stringify(tools).length
  console.log(`tool catalogue  ${tools.length} tools, ${toolChars.toLocaleString()} chars  (~${Math.round(toolChars / 4).toLocaleString()} tokens)`)
  console.log(`questions       ${QUESTIONS.length}  (${QUESTIONS.filter((q) => q.want === "knowledge").length} knowledge, ${QUESTIONS.filter((q) => q.want === "live").length} live)`)
  const prefix = Math.round((system.length + toolChars) / 4)
  const est = (prefix * 3.75 + prefix * (QUESTIONS.length - 1) * 0.3 + QUESTIONS.length * 300 * 15) / 1_000_000
  console.log(`estimated spend ~$${est.toFixed(2)}  (one cache write, ${QUESTIONS.length - 1} cache reads, ~300 output tokens each)`)
  process.exit(0)
}

const key =
  process.env.ANTHROPIC_API_KEY ||
  execSync("security find-generic-password -s anthropic-api-key -w").toString().trim()

const model = selectModel({
  ANTHROPIC_API_KEY: key,
  AGENT_MODEL: process.env.AGENT_MODEL || "claude-sonnet-5",
  AGENT_EFFORT: process.env.AGENT_EFFORT || "low",
  AGENT_PROMPT_CACHE: process.env.AGENT_PROMPT_CACHE || "1h",
})

const spend = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }
const rows = []

for (const item of QUESTIONS) {
  const reply = await model.complete(
    [
      { role: "system", content: system },
      { role: "user", content: item.q },
    ],
    tools
  )
  for (const k of Object.keys(spend)) spend[k] += reply.usage?.[k] ?? 0
  const called = reply.toolCalls.map((t) => t.name)
  rows.push({ ...item, called, pass: judge(item.want, called) })
  if (VERBOSE && reply.text) console.log(`   ${item.q}\n   → ${reply.text.slice(0, 200)}\n`)
}

/* ------------------------------ the report ------------------------------- */

const pad = (s, n) => String(s).padEnd(n)
console.log()
for (const r of rows) {
  console.log(
    `${r.pass ? "  ok  " : "  MISS"} ${pad(r.want, 10)} ${pad(r.called.join(" → ") || "(answered without a tool)", 46)} ${r.q}`
  )
}

const by = (want) => rows.filter((r) => r.want === want)
const score = (list) => `${list.filter((r) => r.pass).length}/${list.length}`
console.log()
console.log(`knowledge questions reaching ${ASK} first   ${score(by("knowledge"))}`)
console.log(`live questions going to a live read first    ${score(by("live"))}`)
console.log(`overall                                      ${score(rows)}`)
console.log(`${ASK} called anywhere in the turn           ${rows.filter((r) => r.called.includes(ASK)).length}/${rows.length}`)
console.log(`tool calls per question                      ${(rows.reduce((n, r) => n + r.called.length, 0) / rows.length).toFixed(2)}`)

// THE SPEND LINE SITS HERE, ABOVE ANY EXIT. It was written below one once and
// two paid runs reported no cost at all — a cost print that never runs is the
// same class of fault this whole bench exists to catch.
// claude-sonnet-5: $3/M in, $15/M out, cache write 1.25x, cache read 0.1x.
const usd =
  (spend.input * 3 + spend.cacheWrite * 3.75 + spend.cacheRead * 0.3 + spend.output * 15) / 1_000_000
console.log()
console.log(
  `spent  $${usd.toFixed(3)}   in ${spend.input.toLocaleString()}  cache w ${spend.cacheWrite.toLocaleString()} r ${spend.cacheRead.toLocaleString()}  out ${spend.output.toLocaleString()}`
)
