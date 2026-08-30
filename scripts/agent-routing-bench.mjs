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
// runs on the model the DEPLOYMENT pins (read off wrangler.jsonc, not off
// model.ts's inert constant). So the prompt under test is the file you just
// edited, the catalogue is the one the worker will send, and the model is the
// one that answers the owner. Run it on
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
// ── RUN IT TWICE A SIDE. ONE RUN EACH IS NOT A COMPARISON ───────────────────
//
// Measured on 29 Aug 2026, comparing the query-grammar branch against main, on
// the shipped model (glm-5.3-flash), two runs each:
//
//   main      22/22, then 18/22
//   branch    21/22, then 18/22
//
// The run-to-run variance is LARGER than the branch-to-branch difference. One
// run each would have produced "21 against 22" and a written-up regression that
// does not exist — and the second runs, which land in the same place, are the
// only thing that says so. So: run it twice a side, and treat a single-run gap
// of one or two as noise until a second run agrees with it.
//
// The low runs fail the same way on both sides — three knowledge questions
// answered with NO tool call at all. That is glm flakiness, not routing, and it
// is worth knowing separately because it predates any catalogue change and glm
// is now the shipped model.
//
// ── IT ALSO PRICES A STEP ───────────────────────────────────────────────────
//
// Every question is ONE model call carrying the same preamble, so `in` divided
// by the question count is the real tokenizer's answer to "what does a step of
// this catalogue cost", which is the number `agent_usage_log.input_tokens` sums
// over a turn. The same two runs above:
//
//   main      775,265 / 22 = 35,239 input tokens per step
//   branch    727,855 / 22 = 33,084 input tokens per step   (−2,155, −6.1%)
//
// Uncached on purpose. The prompt cache is a separate effect on the same column,
// so measuring a step without it is what keeps the two apart.
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
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, "..")
const DRY = process.argv.includes("--dry")
const VERBOSE = process.argv.includes("--verbose")

const { systemFor } = await import(join(REPO, "workers", "data-ops", "src", "lib", "agent.ts"))
const { toolSpecs } = await import(join(REPO, "workers", "data-ops", "src", "lib", "tools.ts"))
const { DEFAULT_AGENT_MODEL } = await import(join(REPO, "workers", "data-ops", "src", "lib", "model.ts"))

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

/** THE MODEL THE DEPLOYMENT ACTUALLY RUNS — read off wrangler.jsonc, never off
 * model.ts's constant. `selectModel` is `env.AGENT_MODEL || DEFAULT_AGENT_MODEL`
 * and both environments pin AGENT_MODEL, so the constant is inert; a bench that
 * reads it measures a model nobody runs. That happened: three runs of a routing
 * question were scored against glm-5.3-flash while every deployed turn was on
 * gpt-oss-120b, and the two disagree completely on this question (6/6 against
 * 1/5). Refuses rather than guesses if the pin is missing or the environments
 * disagree — a bench that quietly falls back is the failure it exists to catch. */
function deployedModel() {
  const src = readFileSync(join(REPO, "workers", "data-ops", "wrangler.jsonc"), "utf8")
  const pinned = [...src.matchAll(/"AGENT_MODEL":\s*"([^"]+)"/g)].map((m) => m[1])
  if (!pinned.length) throw new Error("no AGENT_MODEL pin in wrangler.jsonc — refusing to guess which model ships")
  if (new Set(pinned).size !== 1)
    throw new Error(`environments disagree on AGENT_MODEL (${[...new Set(pinned)].join(" vs ")}) — fix the config before benchmarking`)
  return pinned[0]
}
const ACCOUNT_HINT = process.env.CLOUDFLARE_ACCOUNT_ID || "the kwapso Cloudflare account"
const runModel = process.env.BENCH_CF_MODEL || deployedModel()

if (DRY) {
  console.log(`system prompt   ${system.length.toLocaleString()} chars  (~${Math.round(system.length / 4).toLocaleString()} tokens)`)
  const toolChars = JSON.stringify(tools).length
  console.log(`tool catalogue  ${tools.length} tools, ${toolChars.toLocaleString()} chars  (~${Math.round(toolChars / 4).toLocaleString()} tokens)`)
  console.log(`questions       ${QUESTIONS.length}  (${QUESTIONS.filter((q) => q.want === "knowledge").length} knowledge, ${QUESTIONS.filter((q) => q.want === "live").length} live)`)
  // WHICH MODEL, AND THEREFORE WHOSE BILL. Said here rather than assumed,
  // because the answer changed and this line did not: `selectModel` reads
  // `env.AGENT_MODEL || DEFAULT_AGENT_MODEL` and wrangler.jsonc pins
  // AGENT_MODEL in both environments, so the shipped assistant runs on a
  // WORKERS AI model and bills Cloudflare NEURONS. There is no Anthropic
  // spend on that path at all.
  //
  // This block used to print an Anthropic dollar estimate — "one cache write,
  // 21 cache reads" — for a run that cannot take that path, and on 30 Aug 2026
  // a lane budgeted against it and reported a spend of $0.43 that was never
  // charged to anybody. A stale number is worse than no number, because
  // somebody plans with it.
  console.log(`model           ${runModel}${runModel === DEFAULT_AGENT_MODEL ? "" : `  (wrangler's pin; model.ts's ${DEFAULT_AGENT_MODEL} is inert)`}`)
  console.log(
    `spend           Cloudflare NEURONS on ${ACCOUNT_HINT}, not the Anthropic key.` +
      ` Measured 30 Aug 2026: ~880 neurons per question on gpt-oss-120b with this` +
      ` catalogue, so ~${(QUESTIONS.length * 880).toLocaleString()} for this run.` +
      ` Read the real figure off the line the run prints when it finishes.`
  )
  process.exit(0)
}

/* WORKERS AI, for comparing a Cloudflare-hosted model against Claude on the SAME
 * questions, the SAME prompt and the SAME 192-tool catalogue. The newer models
 * (glm, gpt-oss, qwen) answer in the OpenAI chat-completions shape — a `choices`
 * array with `message.tool_calls` — which is NOT the `response`/`tool_calls`
 * shape @cf/meta/llama-* uses, and reading the wrong field makes a working model
 * look like one that never calls a tool. Checked against both before trusting it. */
function workersAiModel(name) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID || "b5bb3d84a59c029ea5e0fe164dab1cf7"
  const token =
    process.env.CLOUDFLARE_API_TOKEN ||
    execSync("security find-generic-password -s cloudflare-token-kwapso -w").toString().trim()
  return {
    name,
    async complete(messages, tools) {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${name}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          tools: tools.map((t) => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.schema },
          })),
        }),
        signal: AbortSignal.timeout(180_000),
      })
      const json = await res.json()
      // Workers AI answers 8005 "Internal server error" intermittently on a large
      // request — seen once in a bisect that then passed at every size. A transient
      // 500 is not a routing result, so it is retried rather than scored.
      if (!json.success && JSON.stringify(json.errors).includes("8005")) {
        await new Promise((r) => setTimeout(r, 2000))
        return this.complete(messages, tools)
      }
      if (!json.success) throw new Error(`workers-ai: ${JSON.stringify(json.errors).slice(0, 300)}`)
      const msg = json.result.choices?.[0]?.message ?? {}
      const usage = json.result.usage ?? {}
      return {
        text: msg.content ?? "",
        toolCalls: (msg.tool_calls ?? []).map((c, i) => ({
          id: String(i),
          name: c.function?.name ?? c.name,
          input: {},
        })),
        // Priced per token, no prompt cache on this path — mapped onto the same
        // shape so the spend line below needs no special case.
        usage: { input: usage.prompt_tokens ?? 0, output: usage.completion_tokens ?? 0, cacheWrite: 0, cacheRead: 0 },
        neurons: usage.neurons ?? 0,
      }
    },
  }
}

// One path, because there is only one: every model this can reach is a Workers
// AI model, so the run goes over the REST door with the account token.
const model = workersAiModel(runModel)

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
// The rate depends on WHICH model ran. Printing Claude's rates for a Cloudflare
// run overstated a 12-cent bench as $2.40 — a cost line that is wrong is worse
// than none, because it is quoted.
// claude-sonnet-5: $3/M in, $15/M out, cache write 1.25x, cache read 0.1x.
// Cloudflare rates below are the account's own published per-million prices.
const CF_RATES = {
  "@cf/zai-org/glm-5.3-flash": [0.15, 0.5],
  "@cf/zai-org/glm-4.7-flash": [0.0605, 0.4],
  "@cf/openai/gpt-oss-120b": [0.35, 0.75],
  "@cf/openai/gpt-oss-20b": [0.2, 0.3],
  "@cf/qwen/qwen3-30b-a3b-fp8": [0.0509, 0.335],
  "@cf/ibm-granite/granite-4.0-h-micro": [0.017, 0.112],
  "@cf/meta/llama-4-scout-17b-16e-instruct": [0.27, 0.85],
}
const rate = CF_MODEL ? CF_RATES[CF_MODEL] : null
if (CF_MODEL && !rate) console.log(`(no published rate on file for ${CF_MODEL} — cost not computed)`)
const usd = rate
  ? (spend.input * rate[0] + spend.output * rate[1]) / 1_000_000
  : (spend.input * 3 + spend.cacheWrite * 3.75 + spend.cacheRead * 0.3 + spend.output * 15) / 1_000_000
console.log()
console.log(
  `spent  $${usd.toFixed(3)}   in ${spend.input.toLocaleString()}  cache w ${spend.cacheWrite.toLocaleString()} r ${spend.cacheRead.toLocaleString()}  out ${spend.output.toLocaleString()}`
)
