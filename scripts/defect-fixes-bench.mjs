// THE TWO-DEFECT BENCH — does the model's FINAL TEXT change with the two new
// prompt sentences (staleness honesty, no internal tool names), given the SAME
// synthetic tool result both times?
//
// Unlike agent-routing-bench.mjs (which measures which door a FRESH question
// opens), this measures what the model SAYS after a tool has already answered —
// so the conversation here is three turns: system, user question, an assistant
// tool call + its result, then the model's follow-up text. The tool results are
// built from REAL staging data (FluClinic's actual meeting rows and the actual
// get_meeting_transcript "not found" message), so the model is judging real
// material, not an invented shape.
//
// Reads AGENT_MODEL off wrangler.jsonc, same refusal-on-disagreement guard as
// agent-routing-bench.mjs. Run it against a candidate prompt change and against
// the baseline (`git stash` the change between runs, since both live in the
// same working tree) — never against DEFAULT_AGENT_MODEL.
//
//   node --experimental-transform-types scripts/defect-fixes-bench.mjs --dry
//   node --experimental-transform-types scripts/defect-fixes-bench.mjs
//
// ── MEASURED, 31 AUG 2026, ON @cf/openai/gpt-oss-120b ───────────────────────
//
// Three phrasings of each rule were tried and benched here, each 5 trials:
//
//   defect1_staleness       0/5 baseline, 0/5, 0/5, 0/5 across three rewrites
//   defect2_no_tool_names   0/5 baseline, 0/5, 0/5, 0/5 across three rewrites
//
// No phrasing moved either number off zero — not worse, just no measured
// effect, the same shape as the reverted KNOWLEDGE_FIRST_RULE superlative
// (agent-routing-bench.mjs's own header). Both prompt additions were reverted
// rather than shipped for a preamble cost with no proven benefit.
//
// THE REAL MECHANISM, found by reading what the model actually said: for
// defect2, `get_meeting_transcript`'s own `message` field (shared/workers/
// tool-catalog.ts) reads "...To go and look for one, use
// read_meeting_transcript" — an instruction addressed to the MODEL, not the
// user, and the model quotes it back verbatim almost every time regardless of
// what the system prompt says not to do. A system-prompt sentence competing
// against a concrete, tool-name-bearing instruction sitting in the message it
// is actively reading loses. The more promising fix is likely in that message
// text itself (rephrase it so no tool name appears in a sentence shaped like an
// instruction) — untried here, since it is a tool-catalogue change and outside
// this bench's own prompt-only brief.
//
// For defect1, even the suggested fallback (an explicit "repeat the query
// without the account filter before answering" instruction) never produced a
// single broadened follow-up call in 5 trials — the model answered straight
// from the stale row every time. Whether a MECHANICAL guard (comparable to
// pagingGuard, checking the returned row's own staleness before the model ever
// sees it) is worth building is a question for whoever picks this up next.
import "./lib/shared-alias.mjs"

import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, "..")
const DRY = process.argv.includes("--dry")
const TRIALS = Number(process.env.BENCH_TRIALS ?? 5)

const { systemFor } = await import(join(REPO, "workers", "data-ops", "src", "lib", "agent.ts"))
const { toolSpecs } = await import(join(REPO, "workers", "data-ops", "src", "lib", "tools.ts"))

function deployedModel() {
  const src = readFileSync(join(REPO, "workers", "data-ops", "wrangler.jsonc"), "utf8")
  const pinned = [...src.matchAll(/"AGENT_MODEL":\s*"([^"]+)"/g)].map((m) => m[1])
  if (!pinned.length) throw new Error("no AGENT_MODEL pin in wrangler.jsonc — refusing to guess which model ships")
  if (new Set(pinned).size !== 1)
    throw new Error(`environments disagree on AGENT_MODEL (${[...new Set(pinned)].join(" vs ")}) — fix the config first`)
  return pinned[0]
}
const runModel = deployedModel()
const system = systemFor(null)
const tools = toolSpecs()

/* ------------------------------ the scenarios ----------------------------- */
// Both built from what was actually on staging 31 Aug 2026: FluClinic's account
// id, its two ACCOUNT-LINKED meetings (6 Aug, no transcript; 22 Jul, no
// transcript) and the real get_meeting_transcript "not found" message text.

const FLUCLINIC_MEETINGS_RESULT = JSON.stringify({
  meetings: [
    {
      id: "01KZXFK9KMCRKVJ1B3RM0JBS5D",
      title: "Validation FluClinic",
      accountId: "01KZXBT88GFJM8XFDCT441RNSC",
      startsAt: "2026-08-06T10:00:00.000Z",
      agenda: null,
      notes: null,
      transcriptCapturedAt: null,
    },
    {
      id: "01KZXFK15FZ0GTB2S2KY02H5YE",
      title: "Validation · FluClinic",
      accountId: "01KZXBT88GFJM8XFDCT441RNSC",
      startsAt: "2026-07-22T13:00:00.000Z",
      agenda: null,
      notes: null,
      transcriptCapturedAt: null,
    },
  ],
  total: 2,
})

const NO_TRANSCRIPT_RESULT = JSON.stringify({
  found: false,
  message:
    "No transcript has been captured for this meeting. The meeting is real and this is its final answer — asking again, or asking about another meeting, will not produce words. To go and look for one, use read_meeting_transcript. To find the meetings that DO have words, ask list_meetings for the ones with a transcript.",
})

const SCENARIOS = [
  {
    key: "defect1_staleness",
    question: "What was discussed on the latest FluClinic call, and who was involved?",
    // TWO prior tool turns, not one — measured live on staging 31 Aug 2026, the
    // model's first move after the meetings read was exactly to go read that
    // record whole (get_meeting_transcript), which is KNOWLEDGE_FIRST_RULE's own
    // advice working correctly. The bug is in what it says AFTER that read comes
    // back empty too — so this scenario supplies both turns and judges the
    // final answer, rather than judging a mid-trajectory decision that was fine.
    steps: [
      {
        toolName: "query_records",
        toolArgs: {
          module: "meetings",
          where: [{ field: "accountId", op: "eq", value: "01KZXBT88GFJM8XFDCT441RNSC" }],
          sort: "startsAt",
          dir: "desc",
        },
        toolResult: FLUCLINIC_MEETINGS_RESULT,
      },
      {
        toolName: "get_meeting_transcript",
        toolArgs: { id: "01KZXFK9KMCRKVJ1B3RM0JBS5D" },
        toolResult: NO_TRANSCRIPT_RESULT,
      },
      {
        toolName: "get_meeting_people",
        toolArgs: { id: "01KZXFK9KMCRKVJ1B3RM0JBS5D" },
        toolResult: JSON.stringify({ links: [] }),
      },
    ],
    // A pass is EITHER text that names the date it found and signals the result
    // may not be the whole story ("not linked"/"tagged", or proposing a broader
    // search), OR the model just going and DOING the broader search itself —
    // a follow-up query_records call with no accountId filter, or one that
    // widens to a name/title search. Both are the honest move the new sentence
    // asks for; only silently presenting the stale row as the answer is a miss.
    judge: (text, toolCalls) => {
      const t = text.toLowerCase()
      const namesDate = /6 aug|august 6|2026-08-06|06 aug/.test(t)
      const hedges =
        /not (yet )?(been )?(linked|tagged)|hasn'?t been (linked|tagged)|may (not )?be (more recent|newer|others)|more recent .* (not|un)linked|broader search|search (by|for) name|without the account filter/.test(
          t
        )
      const broadened = toolCalls.some((c) => {
        if (c.name !== "query_records") return false
        try {
          const args = JSON.parse(c.args ?? "{}")
          const where = Array.isArray(args.where) ? args.where : []
          return !where.some((w) => w.field === "accountId")
        } catch {
          return false
        }
      })
      return { pass: (namesDate && hedges) || broadened, namesDate, hedges, broadened }
    },
  },
  {
    key: "defect2_no_tool_names",
    question: "Is there a transcript for that meeting? If not, what should happen next?",
    steps: [{ toolName: "get_meeting_transcript", toolArgs: { id: "01KZXFK9KMCRKVJ1B3RM0JBS5D" }, toolResult: NO_TRANSCRIPT_RESULT }],
    // A pass never leaks a real tool name and never tells the user to "run" or
    // "call" something.
    judge: (text) => {
      const realNames = toolSpecs().map((t) => t.name)
      const leaked = realNames.filter((n) => text.includes(n))
      const instructed = /\b(run|call)\b[^.]{0,40}\b([a-z]+_[a-z_]+)\b/i.test(text)
      return { pass: text.length > 0 && leaked.length === 0 && !instructed, leaked, instructed }
    },
  },
]

if (DRY) {
  console.log(`model  ${runModel}`)
  console.log(`system prompt  ${system.length.toLocaleString()} chars`)
  console.log(`scenarios  ${SCENARIOS.length}, ${TRIALS} trials each = ${SCENARIOS.length * TRIALS} calls`)
  process.exit(0)
}

// SENDS RAW OPENAI-SHAPE MESSAGES, unlike agent-routing-bench.mjs's wrapper —
// this needs a real `role:"tool"` turn keyed by `tool_call_id`, exactly the
// shape `toOpenAiMessages` in workers/data-ops/src/lib/model.ts builds for this
// model (gpt-oss speaks native tool-call turns; no fence is applied on this
// path — see that function's own comment).
function workersAiModel(name) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID || "b5bb3d84a59c029ea5e0fe164dab1cf7"
  const token =
    process.env.CLOUDFLARE_API_TOKEN ||
    execSync("security find-generic-password -s cloudflare-token-kwapso -w").toString().trim()
  return {
    async complete(openAiMessages) {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${name}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: openAiMessages,
          tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.schema } })),
        }),
        signal: AbortSignal.timeout(180_000),
      })
      const json = await res.json()
      if (!json.success && JSON.stringify(json.errors).includes("8005")) {
        await new Promise((r) => setTimeout(r, 2000))
        return this.complete(openAiMessages)
      }
      if (!json.success) throw new Error(`workers-ai: ${JSON.stringify(json.errors).slice(0, 300)}`)
      const msg = json.result.choices?.[0]?.message ?? {}
      const usage = json.result.usage ?? {}
      return {
        text: msg.content ?? "",
        toolCalls: (msg.tool_calls ?? []).map((c) => ({ name: c.function?.name ?? c.name, args: c.function?.arguments })),
        usage: { input: usage.prompt_tokens ?? 0, output: usage.completion_tokens ?? 0 },
      }
    },
  }
}

const model = workersAiModel(runModel)
const spend = { input: 0, output: 0 }

for (const s of SCENARIOS) {
  console.log(`\n=== ${s.key} ===`)
  let passed = 0
  for (let i = 0; i < TRIALS; i++) {
    const messages = [{ role: "system", content: system }, { role: "user", content: s.question }]
    s.steps.forEach((step, idx) => {
      const id = `t${idx + 1}`
      messages.push({
        role: "assistant",
        content: "",
        tool_calls: [{ id, type: "function", function: { name: step.toolName, arguments: JSON.stringify(step.toolArgs) } }],
      })
      messages.push({ role: "tool", tool_call_id: id, content: step.toolResult })
    })
    const reply = await model.complete(messages)
    spend.input += reply.usage.input
    spend.output += reply.usage.output
    const verdict = s.judge(reply.text, reply.toolCalls)
    if (verdict.pass) passed++
    console.log(`  ${verdict.pass ? "ok  " : "MISS"} ${JSON.stringify(verdict)}`)
    if (reply.toolCalls.length) console.log(`       tool calls: ${reply.toolCalls.map((c) => `${c.name}(${c.args})`).join(", ")}`)
    console.log(`       "${reply.text.slice(0, 220).replace(/\n/g, " ")}"`)
  }
  console.log(`  ${s.key}: ${passed}/${TRIALS}`)
}

const CF_RATES = { "@cf/openai/gpt-oss-120b": [0.35, 0.75] }
const rate = CF_RATES[runModel] ?? null
const usd = rate ? (spend.input * rate[0] + spend.output * rate[1]) / 1_000_000 : null
console.log(`\nspent  ${usd !== null ? `$${usd.toFixed(3)}` : "(no rate on file)"}   in ${spend.input.toLocaleString()}  out ${spend.output.toLocaleString()}`)
