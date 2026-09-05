// The swappable MODEL seam. The agent loop talks to this interface only — switching
// providers is a one-line change in selectModel(), never a rewrite.
//
// CORRECTED 2026-09-05. This header said "It is Claude (Anthropic Messages API,
// full tool use), and a worker with no ANTHROPIC_API_KEY has no assistant" for a
// week after that stopped being true: the owner moved the assistant onto
// Cloudflare on 28 Aug, `selectModel` returns `new WorkersAiModel(...)` on its one
// branch, `no-quiet-downgrade.test.ts` asserts the Anthropic adapter cannot come
// back, and no worker in this repository calls Anthropic at all. A stale header
// is not a cosmetic defect on a file like this one: the next person costing this
// app reads the first paragraph and prices it at Anthropic's rates, which is a
// three-times error on the largest line in the bill, and that nearly happened on
// 2026-09-05.
//
// IT IS A WORKERS AI MODEL, over the `AI` binding, named by `AGENT_MODEL` in
// wrangler and by DEFAULT_AGENT_MODEL below (the two are held together by
// `no-quiet-downgrade.test.ts`, which reads every wrangler config off disk). It
// bills Cloudflare NEURONS; the published per-token rates and the neuron
// equivalents live in `shared/workers/pricing.ts`, and COSTS.md is where a turn
// is priced. The cheap INLINE path is a different question and runs on the same
// binding: shared/workers/model-text.ts.

import type { Env } from "../env"
import { NO_TOKENS, type TokenUsage } from "@shared/workers/credits"

/** The agent's output budget per model turn — ONE constant for BOTH providers
 * (Claude + Workers AI), and the number BULK_IDS_LIMIT is DERIVED from, so the cap
 * the model is told is one it can physically write. Lives in shared/workers/limits
 * with the caps it governs; re-exported here because this is where it is spent. */
export { AGENT_MAX_TOKENS } from "@shared/workers/limits"
import { AGENT_MAX_TOKENS } from "@shared/workers/limits"

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool"
  content: string
  /** for role:"tool" — the tool call this result answers + the tool's name. */
  toolCallId?: string
  toolName?: string
  /** for role:"assistant" — the tool calls it made (so the adapter can rebuild the
   *  provider's tool_use blocks and pair them with the following tool results). */
  toolCalls?: ToolCall[]
}

/** A tool the model may call, described to it (JSON-schema input). */
export type ToolSpec = { name: string; description: string; schema: Record<string, unknown> }

/** One tool call the model decided to make. */
export type ToolCall = { id: string; name: string; input: Record<string, unknown> }

/** The model's reply: free text and/or tool calls to run, plus what the turn cost
 *  in tokens WHEN the provider reports it (Claude does; Workers AI does not, and
 *  an absent number is left absent rather than reported as zero).
 *
 *  `truncated` is `finish_reason === "length"` — the model was still writing when
 *  its `max_tokens` ran out, so `text` ends mid-thought (sometimes mid-word) with
 *  nothing else in the reply saying so. Read in ONE place (readFinishReason) and
 *  carried through both the complete() and stream() paths, so a step-cap failure
 *  can never reach the caller looking identical to a clean stop. */
export type ModelReply = { text: string; toolCalls: ToolCall[]; usage?: TokenUsage; truncated?: boolean }

/** `finish_reason` DECIDES NOTHING BY ITSELF — it only tells the caller whether
 *  `text` is the whole of what the model wrote. "length" is the one value that
 *  matters here: the budget ran out mid-generation, not "the model chose to
 *  stop" (`stop`) or "the model chose to call a tool" (`tool_calls`). Read this
 *  way in both complete() and the SSE parser rather than compared inline twice,
 *  so the two paths can never disagree about what counts as truncated. */
function readFinishReason(reason: string | undefined): boolean {
  return reason === "length"
}

/* ------------------------- the tool-result fence -------------------------- */

// THE MARKER AND THE WRAPPER MOVED TO shared/workers/model-text.ts, and the reason
// is the one the fence itself is about: the same untrusted paragraph reaches a
// model down two paths now — as a flattened tool result here, and as a knowledge
// passage in the content worker's answer-writer. Two fences would be two promises,
// and only one of them would have been kept. Re-exported here because this is the
// transport that writes it, and the test that proves the Workers AI path is fenced
// reads it beside the flattening it guards.
export { TOOL_RESULT_TAG, fenceToolResult } from "@shared/workers/model-text"
import { ModelError, classifyModelHttp } from "@shared/workers/model-failure"

export interface Model {
  readonly name: string
  /** true if this provider can actually call tools (act); false = answers only. */
  readonly canActWithTools: boolean
  /** true if this provider can stream text deltas (implements stream()); when false
   *  callers fall back to complete() — the run still works, tokens just arrive at once. */
  readonly canStream: boolean
  complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ModelReply>
  /** Stream the turn: fire onText for each text delta as it arrives, and return the
   *  FULL reply (accumulated text + any tool calls) when the turn ends — same shape as
   *  complete(), so the loop treats a streamed turn identically once it finishes. */
  stream?(messages: ChatMessage[], tools: ToolSpec[], onText: (delta: string) => void): Promise<ModelReply>
}

/* --------------------------------- Claude --------------------------------- */
/** The model's own numbers for one turn. Workers AI reports prompt and completion
 * tokens; it reports no cache split on this path, so those two stay zero rather
 * than being invented. `neurons` is Cloudflare's own billing unit and is the
 * number the account's analytics agree with. */
type WorkersAiUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
}

export function readUsage(raw: WorkersAiUsage | undefined): TokenUsage {
  if (!raw) return NO_TOKENS
  const cached = raw.prompt_tokens_details?.cached_tokens ?? 0
  return {
    // Cached prompt tokens are billed at a fifth here, so they are reported
    // separately for the same reason they were on the old path: it is the only
    // place the cache can be observed, and a turn that pays full price for a
    // prefix it should have re-read is a cost bug nothing else would surface.
    input: Math.max(0, (raw.prompt_tokens ?? 0) - cached),
    output: raw.completion_tokens ?? 0,
    cacheWrite: 0,
    cacheRead: cached,
  }
}

function modelHttpError(status: number, detail: string): ModelError {
  return new ModelError(classifyModelHttp(status, detail), `model_error: ${detail.slice(0, 300)}`)
}

/**
 * OUR MESSAGES → THE CHAT-COMPLETIONS SHAPE.
 *
 * Workers AI's newer models (glm, gpt-oss, qwen, granite) speak OpenAI's chat
 * format, which is a straight mapping from ours and needs no flattening: an
 * assistant turn carries `tool_calls`, and a result comes back as its own
 * `role:"tool"` message keyed by `tool_call_id`.
 *
 * THIS IS NOT TRUE OF EVERY MODEL ON THAT PLATFORM, and the difference is why
 * the fence exists. `@cf/meta/llama-*` answers in a different shape and its chat
 * template refuses a replayed tool round-trip, which is what forced tool results
 * to arrive as ordinary user turns wrapped in TOOL_RESULT_TAG. Measured on
 * 2026-08-28 against glm-5.3-flash: a replayed `role:"tool"` message is accepted,
 * read, and answered from — it was handed `{"tickets":[],"total":448}` and said
 * 448, then remarked that the row list was empty. So the round-trip is real here.
 * The fence stays regardless: it is a security boundary, not a transport
 * workaround, and everything inside a tool result is still untrusted.
 */
export function toOpenAiMessages(messages: ChatMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const m of messages) {
    if (m.role === "tool") {
      out.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content })
      continue
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      out.push({
        role: "assistant",
        content: m.content ?? "",
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.input ?? {}) },
        })),
      })
      continue
    }
    out.push({ role: m.role, content: m.content })
  }
  return out
}

/** The one request body both complete() and stream() send. Exported so a test can
 * read what goes on the wire without a network call — the property the old
 * `anthropicBody` had, kept. */
export function workersAiBody(opts: {
  messages: ChatMessage[]
  tools: ToolSpec[]
  stream: boolean
}): Record<string, unknown> {
  return {
    messages: toOpenAiMessages(opts.messages),
    max_tokens: AGENT_MAX_TOKENS,
    ...(opts.stream ? { stream: true } : {}),
    ...(opts.tools.length
      ? {
          tools: opts.tools.map((t) => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.schema },
          })),
        }
      : {}),
  }
}

type OpenAiToolCall = { id?: string; function?: { name?: string; arguments?: string } }

/** A tool call's arguments arrive as a JSON STRING, and a model can write a
 * malformed one. A tool called with no arguments is a question the door can
 * refuse cleanly; a turn that dies parsing is not. */
function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw)
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function toCalls(raw: OpenAiToolCall[] | undefined): ToolCall[] {
  return (raw ?? []).map((c, i) => ({
    id: c.id || `call_${i}`,
    name: c.function?.name ?? "",
    input: parseArgs(c.function?.arguments),
  }))
}

/**
 * THE ASSISTANT'S BRAIN, ON CLOUDFLARE.
 *
 * It was Anthropic's Claude until 2026-08-28. The owner moved it, and the move
 * was not only about price: he had disabled the Anthropic key, and because a
 * previous ruling of his removed the quiet-downgrade fallback, the assistant was
 * ANSWERING NOTHING until this landed. So this is a repair as much as a change.
 *
 * WHAT WAS MEASURED BEFORE THE SWAP, on the shipped prompt and the whole
 * 192-tool catalogue (scripts/agent-routing-bench.mjs, 22 real questions):
 *
 *     which door it opens first      claude-sonnet-5  22/22    glm-5.3-flash  21/22
 *     counting questions stay live            10/10                   10/10
 *     cost of the whole run                   $0.365                  $0.119
 *
 * And the round-trip, which is the thing that actually decides whether an agent
 * loop is possible at all — see toOpenAiMessages.
 *
 * WHAT WAS NOT MEASURED, and is the honest gap: a full twelve-step turn. First-
 * tool accuracy does not predict whether a model holds a plan together across
 * steps, and one wobble was seen while testing — the same question answered
 * correctly with 10 and 25 tools offered, not at all with 50, and wrongly with
 * 100. That is what the loop tests after this are for.
 *
 * Swapping the brain is one edit here, or the AGENT_MODEL var.
 */
export function selectModel(env: Env, sessionKey?: string): Model {
  return new WorkersAiModel(env, env.AGENT_MODEL || DEFAULT_AGENT_MODEL, sessionKey)
}

/** The model the assistant runs on. Named here rather than only in wrangler so a
 * worker deployed with no vars still has a working assistant.
 *
 * IT WENT gpt-oss -> glm -> gpt-oss -> glm, and only the last hop was about the
 * model. On 28 Aug glm began refusing every request carrying our catalogue —
 * 0/15 against gpt-oss's 15/15, AiError 3048 / HTTP 503, same body, same minute,
 * over both the binding and the REST door. Cloudflare had production down at the
 * time. That was an OUTAGE being read as a verdict, and the comment that replaced
 * it said so: "glm is worth revisiting when it is stable."
 *
 * Revisited 29 Aug, four consecutive calls each, same 6.6K prefix:
 *
 *     glm-5.3-flash   4/4 answered   cached 0, 6592, 6592, 6592   (99.6% after the first)
 *     gpt-oss-120b    4/4 answered   cached 0, 0, 0, 0
 *
 * The availability is back AND the caching is the whole point: gpt-oss-120b has
 * no cached-token rate at all, so every step of every turn re-reads the 37.6K
 * preamble at full price. glm bills a cached token at $0.03/M against $0.15
 * fresh, so the same preamble costs a fifth once warm — and the prefill it skips
 * is the latency, not just the money.
 *
 * The header below is what makes that real; without it the cache is 0 forever
 * and NOTHING SAYS SO.
 *
 * ── AND ON 30 AUG THE DEFAULT WENT BACK TO gpt-oss, because the paragraph above
 *    measured the wrong thing and the deployment had been quietly right all along.
 *
 * `wrangler.jsonc` had pinned `AGENT_MODEL` to gpt-oss-120b since 28 Aug, in both
 * environments (it pins kimi-k2.6 now — see the 1 Sep block below; this paragraph
 * is the record of a decision made on 30 Aug and is left in its own tense). So the 29 Aug revisit changed this constant and changed NOTHING a
 * person experiences: the var wins in `selectModel`, and every turn the owner has
 * complained about was gpt-oss. A default that disagrees with the deployment is
 * not a preference, it is a decision nobody is making.
 *
 * Re-measured against the shape that actually failed — 49KB, 40 tools, a real
 * preamble, which is what "carrying our catalogue" meant. The 29 Aug numbers came
 * from a 6.6K prefix with NO TOOLS, so they never re-tested the thing that broke.
 * Both models are healthy and both call tools 3/3. What separates them is speed:
 *
 *     gpt-oss-120b            2429ms  2583ms  3363ms      cached 0 (it has no rate)
 *     glm-5.3-flash           7168ms  8868ms  9751ms      cached 0
 *     glm + affinity header  10368ms  4691ms  5879ms  3809ms   cached 0, 9600, 11776, 11776
 *
 * The cache is real over REST and reaches 99.5% — and glm WARM is still slower
 * than gpt-oss COLD. The caching argument was about money, and it was read as
 * though it were about latency. Worse, the note below this one records that the
 * affinity header does nothing through `env.AI.run`, which is the door the worker
 * actually uses — so shipping glm would have bought the 7-10s column and no cache
 * at all.
 *
 * ── AND THAT LAST CLAUSE IS NOT TRUE OF THE SHIPPED PATH (2026-09-05) ───────
 *
 * "The affinity header does nothing through `env.AI.run`" was measured on glm
 * over eight calls and then carried forward as a fact about the BINDING. The
 * meter says otherwise for the engine we actually ship. Read off
 * `agent_usage_log` on staging (`node scripts/ai-spend.mjs`), where `readUsage`
 * puts `prompt_tokens_details.cached_tokens` into `cache_read_tokens`:
 *
 *     Aug 2026   6,291,515 fresh input   5,945,863 cached   657,244 cache-WRITE
 *     Sep 2026     902,555 fresh input   1,778,240 cached         0 cache-write
 *
 * September is entirely on this path — the Anthropic key went on 28 Aug, and the
 * zero cache-write column is the tell, because Cloudflare reports a cached count
 * and never a write. So roughly two thirds of September's prompt tokens were
 * served from a prefix cache that the paragraph above says cannot exist here.
 *
 * WHAT IT SAVES IS STILL UNKNOWN, and that is the honest end of this. Cloudflare
 * publishes ONE input rate for kimi-k2.6 and no cached rate beside it (read
 * 2026-09-05), so `shared/workers/pricing.ts` prices a cached token at full
 * input rate — conservative, and the only thing the published table supports.
 * The claim to retire is not "the cache saves money"; it is "there is no cache
 * on this path", which the meter has now contradicted twice.
 *
 * The owner's "the assistant is still replying very slowly" is therefore NOT a
 * wrong model. gpt-oss is the fast one and it is the one deployed. The remaining
 * cost is structural: gpt-oss has no cached-token rate, so every step of every
 * turn re-reads the whole preamble at full price, and a turn is several steps.
 * The lever is fewer steps or a smaller preamble, not a swap.
 *
 * One earlier confound, recorded so nobody repeats it: at `max_tokens` 128 glm
 * returns `finish_reason: "length"` with an empty `content` and a filled
 * `reasoning_content`, and emits no tool call — it spends the budget thinking. It
 * reads exactly like "glm cannot use our tools" and it is not. Give it room
 * before you judge it. */
/** ── AND ON 1 SEP 2026 THE DEPLOYMENT WENT TO kimi-k2.6, MEASURED TWICE ─────
 *
 * `wrangler.jsonc` pins `@cf/moonshotai/kimi-k2.6` in BOTH environments, AND SO
 * DOES THIS CONSTANT — change both or neither, which is `no-quiet-downgrade`'s
 * own sentence and it is right. I first left this at gpt-oss-120b reasoning that
 * the fallback should be "the incumbent, for an environment that has not
 * chosen", and the check refused it: nothing in production reads this, so the
 * only reader is a FRESH environment, and handing that one a different assistant
 * from the one anybody has measured is exactly the quiet downgrade the law is
 * named for. The measured engine is the default.
 *
 * WHAT WAS MEASURED, on the owner's own staging, real prompt, real catalogue,
 * 22 real questions, and the switch made LAST so every other change in the
 * knowledge-base refit was measured on a constant engine first:
 *
 *     gpt-oss-120b   19/22, 19/22   (the incumbent, two runs)
 *     kimi-k2.6      21/22, 21/22   (measured before the refit)
 *     kimi-k2.6      21/22, 22/22   (re-measured 1 Sep, after the refit)
 *
 * Four runs, never below 21, and it reaches for the knowledge base more often.
 * The rule set before running was that it had to beat 21/22 TWICE or the switch
 * would not be made — a model that does not beat the incumbent twice is not a
 * win, and going last is what made the comparison clean.
 *
 * AND WHAT IT COSTS, off the METER rather than a price sheet: 16,593 neurons for
 * both runs, about $0.18 — against the bench's own per-token estimate of $1.92
 * PER RUN, which was computed at Claude's prices because kimi had no line in
 * that table.
 *
 * ── THAT $0.18 DOES NOT RECONCILE, AND IT IS RECORDED HERE RATHER THAN QUIETLY
 *    RE-USED (2026-09-05) ────────────────────────────────────────────────────
 *
 * Two runs is 44 model calls, each carrying the whole preamble. Three of this
 * repo's own measurements agree on what that preamble is and disagree with the
 * $0.18:
 *
 *   · `node scripts/measure-preamble.mjs` — 132,528 chars, ~34,672 tokens.
 *   · The bench's own header, from the PROVIDER's tokenizer on 29 Aug:
 *     775,265 input tokens over 22 questions = 35,239 per step.
 *   · The bench's own note, from the METER on 30 Aug: ~880 neurons per question
 *     on gpt-oss-120b with this catalogue.
 *
 * gpt-oss meters 31,818 neurons per M input tokens and kimi meters 86,364 — 2.7x
 * — so the same question should meter roughly 2,400 neurons on kimi, and 44 of
 * them roughly 105,000, not 16,593. `--dry` now derives that figure from the
 * rate card and prints ~65,877 neurons for ONE run before you agree to it.
 *
 * The most likely explanation is the analytics WINDOW: a meter read that missed
 * most of the calls looks exactly like a cheap run. It is not settled, and it is
 * not settled by reasoning — it is settled by running a KNOWN number of turns and
 * reading `aiInferenceAdaptiveGroups` for exactly that window. Until somebody
 * does, treat $0.18 as a floor of unknown depth and COSTS.md's rate-derived
 * figures as the number to plan with. Cloudflare does bill neurons and a metered
 * model can exceed its price sheet (deepseek-v4-pro metered 24x), which is an
 * argument for reading the meter — never for reading it once. */
export const DEFAULT_AGENT_MODEL = "@cf/moonshotai/kimi-k2.6"

class WorkersAiModel implements Model {
  readonly canActWithTools = true
  readonly canStream = true
  constructor(
    private env: Env,
    readonly name: string,
    /** Cloudflare caches a prompt PREFIX, but only when the request lands on the
     *  GPU that still holds it, and the only thing that steers it there is this
     *  header. One value per conversation (the thread id), so a turn's every step
     *  — which share a 37.6K preamble byte for byte — go to the same instance.
     *
     *  Undefined is legal and means "no affinity", which is right for a one-shot
     *  call with nothing to reuse. It is NOT right for a turn, and the failure is
     *  silent: no error, no warning, just full price forever. That is why
     *  prompt-cache.test.ts asserts the header leaves the building. */
    private sessionKey?: string
  ) {}

  /** The options every call shares. Omitted entirely when there is no key, so a
   *  one-shot call sends no empty header.
   *
   *  MEASURED, AND IT DOES NOT WORK THROUGH THE BINDING — 29 Aug 2026. This is
   *  Cloudflare's own documented shape (third argument, extraHeaders,
   *  x-session-affinity) and over the REST door it caches 99.6%: eight calls on
   *  the shipped prompt gave cached 0, 33216, 33216, 33216 with the header.
   *  Through `env.AI.run` on deployed staging, five consecutive steps behind a
   *  near-identical 27K prefix reported:
   *
   *      {"prompt_tokens":26806,...,"prompt_tokens_details":{"cached_tokens":0}}
   *      ... 27117, 27185, 26839, 27604 — cached_tokens 0 every time
   *
   *  So the field IS reported by the binding and is genuinely zero: the meter
   *  works and the cache is not hitting. The header stays because it is correct,
   *  costs nothing, and starts working the day the binding forwards it. The
   *  alternative — calling the REST door from the worker with a token — is a new
   *  secret and a second code path for the same call, and is the owner's decision
   *  rather than a silent one. Delete this note the day a deployed turn reports a
   *  non-zero cached_tokens. */
  private affinity(): Record<string, unknown> {
    return this.sessionKey ? { extraHeaders: { "x-session-affinity": this.sessionKey } } : {}
  }

  /** THE BINDING RETURNS TWO DIFFERENT THINGS and getting that wrong is a silent
   *  outage, which is exactly how this shipped the first time: `env.AI.run(model,
   *  body)` resolves to the PARSED OBJECT, and only `{ returnRawResponse: true }`
   *  hands back a `Response`. The non-streaming path wants the object; the
   *  streaming path needs the raw body to read the SSE off. So the two call it
   *  differently rather than sharing a wrapper that has to guess. */
  async complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ModelReply> {
    const data = (await this.env.AI.run(
      this.name as never,
      workersAiBody({ messages, tools, stream: false }) as never,
      this.affinity() as never
    )) as {
      choices?: { message?: { content?: string; tool_calls?: OpenAiToolCall[] }; finish_reason?: string }[]
      usage?: WorkersAiUsage
    }
    const choice = data?.choices?.[0]
    const msg = choice?.message
    if (!msg) throw modelHttpError(502, `the model returned no message: ${JSON.stringify(data).slice(0, 200)}`)
    return {
      text: msg.content ?? "",
      toolCalls: toCalls(msg.tool_calls),
      usage: readUsage(data.usage),
      truncated: readFinishReason(choice?.finish_reason),
    }
  }

  /** Stream the turn and parse the chat-completions SSE: each `data:` line is a
   *  chunk whose `choices[0].delta` carries either text or a slice of a tool
   *  call's argument JSON, keyed by the call's INDEX because the id only appears
   *  on the first chunk of each. */
  async stream(
    messages: ChatMessage[],
    tools: ToolSpec[],
    onText: (delta: string) => void
  ): Promise<ModelReply> {
    const res = (await this.env.AI.run(
      this.name as never,
      workersAiBody({ messages, tools, stream: true }) as never,
      { returnRawResponse: true, ...this.affinity() } as never
    )) as unknown as Response
    if (!(res instanceof Response)) throw modelHttpError(502, "the AI binding streamed no response")
    if (!res.ok) throw modelHttpError(res.status, await res.text().catch(() => ""))
    return parseOpenAiStream(res.body, onText)
  }
}

/** One tool call being assembled as its argument chunks arrive. */
type ToolBuild = { id: string; name: string; json: string }

export async function parseOpenAiStream(
  body: ReadableStream<Uint8Array> | null,
  onText: (delta: string) => void
): Promise<ModelReply> {
  const reader = body?.getReader()
  if (!reader) throw modelHttpError(502, "the model streamed no body")
  const decoder = new TextDecoder()
  let buffer = ""
  let text = ""
  let usage: TokenUsage | undefined
  let finishReason: string | undefined
  const calls = new Map<number, ToolBuild>()

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data:")) continue
      const body = line.slice(5).trim()
      if (!body || body === "[DONE]") continue
      let ev: {
        choices?: {
          delta?: { content?: string; tool_calls?: (OpenAiToolCall & { index?: number })[] }
          finish_reason?: string | null
        }[]
        usage?: WorkersAiUsage
      }
      try {
        ev = JSON.parse(body)
      } catch {
        continue // a half-written chunk; the next read completes it
      }
      if (ev.usage) usage = readUsage(ev.usage)
      // finish_reason arrives on its OWN chunk, after the last content delta —
      // `delta` there is `{}`, not absent, so this has to read before the
      // `!delta` guard below would otherwise skip it.
      if (ev.choices?.[0]?.finish_reason) finishReason = ev.choices[0].finish_reason
      const delta = ev.choices?.[0]?.delta
      if (!delta) continue
      if (delta.content) {
        text += delta.content
        onText(delta.content)
      }
      for (const [i, tc] of (delta.tool_calls ?? []).entries()) {
        const at = tc.index ?? i
        const build = calls.get(at) ?? { id: "", name: "", json: "" }
        if (tc.id) build.id = tc.id
        if (tc.function?.name) build.name = tc.function.name
        if (tc.function?.arguments) build.json += tc.function.arguments
        calls.set(at, build)
      }
    }
  }

  return {
    text,
    toolCalls: [...calls.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([i, b]) => ({ id: b.id || `call_${i}`, name: b.name, input: parseArgs(b.json) })),
    usage,
    truncated: readFinishReason(finishReason),
  }
}

// The ONE-SHOT CHEAP CALL (the help-reply draft, the conversation title) used to
// live here. It moved to shared/workers/cheap-text.ts the day a SECOND worker
// needed it — content, to write out the answer the knowledge base found (R23) —
// because the alternative was two `env.AI.run` calls in two workers with one
// model id between them. Import it from there; `selectModel` above is still the
// seam for an AGENTIC turn, which is a different question (it calls tools).
