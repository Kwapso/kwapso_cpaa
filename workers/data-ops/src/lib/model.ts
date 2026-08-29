// The swappable MODEL seam. The agent loop talks to this interface only — switching
// providers is a one-line change in selectModel(), never a rewrite. It is Claude
// (Anthropic Messages API, full tool use), and a worker with no ANTHROPIC_API_KEY
// has no assistant rather than a quietly weaker one — see selectModel for the
// ruling and what that costs. The cheap INLINE path is a different question and
// still runs on Workers AI: shared/workers/model-text.ts.

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
 *  an absent number is left absent rather than reported as zero). */
export type ModelReply = { text: string; toolCalls: ToolCall[]; usage?: TokenUsage }

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
 * and NOTHING SAYS SO. */
export const DEFAULT_AGENT_MODEL = "@cf/zai-org/glm-5.3-flash"

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
   *  one-shot call sends no empty header. */
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
      choices?: { message?: { content?: string; tool_calls?: OpenAiToolCall[] } }[]
      usage?: WorkersAiUsage
    }
    const msg = data?.choices?.[0]?.message
    if (!msg) throw modelHttpError(502, `the model returned no message: ${JSON.stringify(data).slice(0, 200)}`)
    return { text: msg.content ?? "", toolCalls: toCalls(msg.tool_calls), usage: readUsage(data.usage) }
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
        choices?: { delta?: { content?: string; tool_calls?: (OpenAiToolCall & { index?: number })[] } }[]
        usage?: WorkersAiUsage
      }
      try {
        ev = JSON.parse(body)
      } catch {
        continue // a half-written chunk; the next read completes it
      }
      if (ev.usage) usage = readUsage(ev.usage)
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
  }
}

// The ONE-SHOT CHEAP CALL (the help-reply draft, the conversation title) used to
// live here. It moved to shared/workers/cheap-text.ts the day a SECOND worker
// needed it — content, to write out the answer the knowledge base found (R23) —
// because the alternative was two `env.AI.run` calls in two workers with one
// model id between them. Import it from there; `selectModel` above is still the
// seam for an AGENTIC turn, which is a different question (it calls tools).
