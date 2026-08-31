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
// ── DEFECT 2 IS A CLOSED, DEFINITIVE NEGATIVE RESULT — 31 AUG 2026, ON
//    @cf/openai/gpt-oss-120b. READ THIS BEFORE TRYING AN EIGHTH ROUND.
//
// Seven rounds, each 5 trials, none of them moved "does the reply leak a real
// tool name or say run/call" off 0/5:
//
//   round 1  baseline (no change at all)                                0/5
//   round 2  system-prompt rule, short ("never name a tool...")         1/5 (fluke — never replicated)
//   round 3  system-prompt rule, + a concrete before/after example      0/5
//   round 4  system-prompt rule, names the `message` field explicitly
//            as "written for you, not to relay"                        0/5
//   round 5  get_meeting_transcript's `message` field (meetings.ts)
//            rewritten as a fact, no tool name in it at all             0/5
//   round 6  round 5's rewrite, PLUS the tool's own static description
//            (tool-catalog.ts) also stripped of the tool-name mention   0/5
//   round 7  = round 6, re-confirmed after the stale `list_meetings`
//            cross-reference was fixed in the same edit                 0/5
//
// Rounds 2-4 were reverted (workers/data-ops/src/lib/agent.ts is back to its
// pre-investigation state). Rounds 5-6 were KEPT — both are real, independent
// improvements (a fact instead of an instruction; a stale `list_meetings`
// reference from an unrelated fold, fixed) — but neither closed the leak, and
// nothing in round 7 did either.
//
// THE READING: every text source that could plausibly be "the instruction the
// model is echoing" was tried and removed — the system prompt, the runtime
// `message` field, the tool's own schema description — and the leak did not
// move once. That rules out "the model is quoting nearby text" as the
// mechanism. What's left: a tool's NAME is in its JSON schema, sent on every
// single step regardless of any description, and the model treats that
// identifier as ordinary, correct vocabulary for describing what it's about to
// do — the same reflex a coding assistant has saying "run npm install". No
// content edit reaches that, because the content isn't where it comes from.
//
// NOT BUILT: an output-side guard that scans the model's own reply for
// tool-name-shaped strings before it reaches the user (pagingGuard's shape,
// applied to content instead of call counts). Owner-adjacent call, 31 Aug
// 2026: declined for now — new machinery on every turn's output path for a
// symptom hit once, real risk of mangling a correct answer, and "too much
// code is a defect" is a standing law here. Left as the honest next idea for
// whoever revisits this, one they should weigh rather than reach for first:
// tool names that read as ENGLISH PROSE rather than snake_case identifiers
// might dissolve the reflex on its own, since the leak is arguably the names
// being quotable at all — but R19, R22 and R27 all key off the literal name,
// so that is a rename across the whole machine surface, not a today decision.
//
// ── DEFECT 1, BUILT — see query-grammar.ts's `staleCheck` and query-engine.ts's
//    `unlinked` field. The suggested prompt-only fallback (an explicit "repeat
//    the query without the account filter before answering" instruction) was
//    tried here first and never produced a single broadened follow-up call in
//    5 trials — the model answered straight from the stale row every time.
//    That is why the fix moved into the DOOR rather than staying a sentence:
//    see the query-engine.ts header for the shape.
//
//    VERIFIED IT SHIPS (npm run check, 5 new tests in query-engine.test.ts,
//    mutation-proved). THEN ONE BENCH ROUND, `BENCH_ONLY=defect1_staleness`,
//    to answer the only question that mattered once the field existed: does
//    the model actually read it? Same synthetic conversation as before, one
//    change — the FLUCLINIC_MEETINGS_RESULT fixture now carries the real
//    shape the door actually returns (`records`, not the old fixture's
//    `meetings` — its own long-standing inaccuracy) plus `unlinked: {count:
//    3}`, the real number measured on staging, and the tool's own
//    description (tool-catalog.ts) tells the model to look for and use it.
//
//      round 8 (payload carries `unlinked`, description documents it)   0/5
//      round 9 (description's wording mirrors `unmatched`'s own MUST-say
//               pattern — the one proven case in this exact door — instead
//               of a field left to be discovered)                       0/5
//
// Round 9 was the best remaining hypothesis and it was worth the one round:
// `unmatched` works because its description doesn't just mention the field,
// it says MUST and gives the sentence shape, in the SAME description this
// tool already carries. Rewriting `unlinked`'s own sentence to match that
// pattern exactly — MUST, same sentence as the count, a worked example — was
// the cheapest test of "is this a wording problem or a field-shape problem"
// available, and it used a pattern already proven in this file rather than
// inventing a third approach. Still 0/5. So it is not that the field was
// merely undocumented — a `MUST` sentence sitting right beside a working one
// did not move it either, and the reasonable conclusion is that this
// particular model does not reliably act on an instruction to relay a
// SECOND, unscoped fact next to the one it was actually asked for, at least
// not from a sibling JSON field, however it's described. HARD STOP here —
// no round 10.
//
// A payload field the model never reads is exactly the dead weight this
// verification step existed to catch, and it caught it: none of the ten
// trials across both rounds mentioned the field, the count, or anything
// resembling the hedge, and several made the SAME single-meeting follow-up
// call defect 2's scenario measures, ignoring the `unlinked` count sitting
// one field over in the same tool result — the two defects share a
// trajectory a real turn could hit at once, worth knowing for whoever works
// either one next. Reported rather than chased further: the door change
// stands on its own merits regardless of what this one model does with it —
// an MCP caller, a script, a person reading the JSON, and every FUTURE model
// get an honest signal that did not exist before, built at the data layer,
// opt-in, bounded, mutation-proved through a real HTTP route against a real
// database. What is unfixed is one specific chat model choosing to relay it.
// Those are two different sentences, and this file should never be read as
// saying only one of them.
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

// UPDATED after query-engine.ts's staleCheck shipped: `records` (not
// `meetings` — that was this fixture's own inaccuracy; query_records answers
// through pagedJson("records", …) regardless of module) now carries the real
// `unlinked` field the door actually computes for this exact query shape
// (accountId eq A_FLU… on a module that declares staleCheck) — three, the
// real count measured on staging 31 Aug 2026.
const FLUCLINIC_MEETINGS_RESULT = JSON.stringify({
  records: [
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
  unlinked: { count: 3 },
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
        /not (yet )?(been )?(linked|tagged)|hasn'?t been (linked|tagged)|may (not )?be (more recent|newer|others)|more recent .* (not|un)linked|broader search|search (by|for) name|without the account filter|unlinked|3 more|three more/.test(
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

const ONLY = process.env.BENCH_ONLY
for (const s of ONLY ? SCENARIOS.filter((s) => s.key === ONLY) : SCENARIOS) {
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
