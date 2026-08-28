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

/** Which Claude models accept `output_config.effort`. The Sonnet-5 / Opus-4.7+ /
 * Fable family support it; older tiers (Haiku 4.5, Sonnet/Opus ≤4.6) 400 on it. We
 * match by family so a dated id (e.g. `claude-sonnet-5-20260930`) still resolves. A
 * new/unknown id is treated as NOT supporting it — the safe default (a missing knob
 * just costs a little more; an unsupported one is a hard 400). */
export function supportsEffort(model: string): boolean {
  return /claude-(sonnet-5|opus-4-(7|8)|fable|mythos)/.test(model)
}

/** Our internal ChatMessage[] → the Anthropic Messages array. This is the canonical
 *  wire shape and the ONE place it's built, so complete() and stream() can't drift:
 *   • system messages are pulled out separately (not here) — dropped from this list;
 *   • a role:"tool" result becomes a `tool_result` block on a USER message;
 *   • consecutive same-role messages are COALESCED into one message of content blocks
 *     (the API rejects two user or two assistant messages in a row) — so a multi-tool
 *     turn's results collapse into ONE user message of tool_result blocks, and a
 *     trailing text note (e.g. the failure wrap-up ask) rides that same user turn;
 *   • an assistant turn that made tool calls becomes one assistant message carrying its
 *     text block (if any) + a tool_use block per call;
 *   • empty-text turns are skipped (the API rejects an empty text block).
 *  Exported pure so a unit test can lock the coalescing without a network call. */
export function toAnthropicMessages(messages: ChatMessage[]): { role: string; content: unknown[] }[] {
  const msgs: { role: string; content: unknown[] }[] = []
  const push = (role: string, blocks: unknown[]) => {
    const last = msgs[msgs.length - 1]
    if (last && last.role === role) last.content.push(...blocks)
    else msgs.push({ role, content: blocks })
  }
  for (const m of messages) {
    if (m.role === "system") continue
    if (m.role === "tool") {
      push("user", [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }])
    } else if (m.role === "assistant" && m.toolCalls && m.toolCalls.length) {
      const blocks: unknown[] = []
      if (m.content) blocks.push({ type: "text", text: m.content })
      for (const tc of m.toolCalls)
        blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input })
      push("assistant", blocks)
    } else if (m.content) {
      push(m.role, [{ type: "text", text: m.content }])
    }
  }
  return msgs
}

/* ---------------------------- the prompt cache ---------------------------- */

// THE PREAMBLE IS THE BILL, and it is the same bytes every time.
//
// Every model turn re-sends the whole stable prefix: 163 tool definitions
// (~92 KB serialised) and the system prompt with its generated capability brief
// (~20 KB). A question that runs three tools is four turns, so that block goes
// over the wire four times for one answer. It is about nine tenths of the input
// tokens the assistant spends, and none of it changes between turns.
//
// Anthropic's prompt cache exists for exactly this. A `cache_control` marker
// says "everything up to here is stable"; the first request writes it at a
// premium and every later one reads it at a tenth of the input price.
//
// TWO BREAKPOINTS, AND THE SECOND ONE IS NOT REDUNDANT. The API renders a prompt
// as tools → system → messages, and caching is a PREFIX match, so a marker on
// the last system block already covers the tools before it. But the two live in
// separate cache tiers: editing the system prompt invalidates the system entry
// and leaves the TOOLS entry standing. So the tool block is marked in its own
// right, and the ~26k tokens of catalogue survive both the per-language
// paragraph `systemFor` appends and the next edit anybody makes to the prompt.
//
// NOTHING MOVES. This is the part that had to be true before any of it was worth
// doing: the marker is an ADDED KEY, never a rearrangement. The tools array, the
// system text and the messages are byte-for-byte what they were with caching
// off — `prompt-cache.test.ts` builds both bodies and diffs them to prove it, so
// the model reads exactly the same tokens either way and the answer cannot
// change. (The system prompt becomes a one-element block array rather than a
// bare string, because a marker has to sit ON a content block; the string inside
// it is the same string.)
export type CacheMode = "off" | "5m" | "1h"

/** `AGENT_PROMPT_CACHE` → a mode. Default ON at the provider's own 5-minute TTL.
 *  An unrecognised value reads as the default rather than as "off": a typo in a
 *  var must not quietly quadruple the bill, and caching changes no behaviour, so
 *  on is the safe way to be wrong. `1h` costs more to write and is worth it when
 *  turns arrive further apart than five minutes (see the arithmetic in
 *  `prompt-cache.test.ts`). */
export function cacheMode(raw: string | undefined): CacheMode {
  return raw === "off" || raw === "1h" ? raw : "5m"
}

/** The marker itself — ONE function, so the two breakpoints can never end up
 *  carrying different TTLs (which would be two cache entries, not one prefix). */
function cacheMark(mode: CacheMode): Record<string, unknown> {
  if (mode === "off") return {}
  return { cache_control: mode === "1h" ? { type: "ephemeral", ttl: "1h" } : { type: "ephemeral" } }
}

/** The Anthropic `usage` block, in our words. Missing/odd numbers read as 0 —
 *  a usage figure is telemetry, and telemetry never throws. */
type AnthropicUsage = {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

export function readUsage(raw: AnthropicUsage | undefined): TokenUsage {
  const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0)
  return {
    input: n(raw?.input_tokens),
    output: n(raw?.output_tokens),
    cacheWrite: n(raw?.cache_creation_input_tokens),
    cacheRead: n(raw?.cache_read_input_tokens),
  }
}

/** A provider HTTP failure → the typed error the loop can explain. The status
 * and the body BOTH ride the message, because the message is what lands in the
 * error store for an owner to read; the `reason` is what the person on the
 * screen is told. Two audiences, one throw. */
function modelHttpError(status: number, detail: string): ModelError {
  return new ModelError(
    classifyModelHttp(status, detail),
    `model_error: Claude returned ${status}. ${detail.slice(0, 200)}`
  )
}

/** THE ONE REQUEST BODY both complete() and stream() send — same messages, tools,
 *  effort and cache rules; only the `stream` flag differs. Exported pure so the
 *  byte-identical proof can build it twice (cache on, cache off) with no network.
 *
 *  Key order in this object is presentation only: the API renders tools → system
 *  → messages whatever order the JSON arrives in. It is written in that order
 *  anyway, so a reader checking "is the stable part first?" can see that it is. */
export function anthropicBody(opts: {
  model: string
  effort: string
  messages: ChatMessage[]
  tools: ToolSpec[]
  stream: boolean
  cache: CacheMode
}): Record<string, unknown> {
  const system = opts.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n")
  const mark = cacheMark(opts.cache)
  return {
    model: opts.model,
    // Tool turns must be able to EMIT a whole bulk call — the old 1024 cap
    // silently truncated mid-JSON (a promise the runtime cannot keep is worse
    // than a smaller one). AGENT_MAX_TOKENS is the one constant both providers
    // use, sized so a BULK_IDS_LIMIT id list physically fits.
    max_tokens: AGENT_MAX_TOKENS,
    // Effort controls reasoning depth + overall token spend (GA on the Sonnet-5 /
    // Opus-4.7+ family, no beta header). "low" = terse, consolidated tool calls —
    // the cheap setting. We leave `thinking` unset on purpose: those models run
    // adaptive thinking by default and keep it minimal at low effort, which also
    // keeps them willing to reach for tools. `effort` is sent ONLY to models that
    // support it — older tiers (e.g. Haiku 4.5) reject `output_config.effort` with
    // a 400, so swapping AGENT_MODEL to one of those must not carry it. (Never send
    // temperature/top_p or budget_tokens on the 4.7+ family — each is a 400.)
    ...(supportsEffort(opts.model) ? { output_config: { effort: opts.effort } } : {}),
    ...(opts.stream ? { stream: true } : {}),
    // Breakpoint 1 — the LAST tool definition, so the whole catalogue caches as
    // one prefix and stays cached when the system prompt after it changes.
    ...(opts.tools.length
      ? {
          tools: opts.tools.map((t, i) => ({
            name: t.name,
            description: t.description,
            input_schema: t.schema,
            ...(i === opts.tools.length - 1 ? mark : {}),
          })),
        }
      : {}),
    // Breakpoint 2 — the system prompt. A block array rather than a bare string
    // because `cache_control` has to sit on a content block; the text is the
    // identical string the bare-string form carried.
    ...(system ? { system: [{ type: "text", text: system, ...mark }] } : {}),
    messages: toAnthropicMessages(opts.messages),
  }
}

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }

class ClaudeModel implements Model {
  readonly canActWithTools = true
  readonly canStream = true
  constructor(
    private apiKey: string,
    readonly name: string,
    /** Reasoning effort: low | medium | high | xhigh | max. "low" keeps the agent
     *  cheap (owner is on a tight budget) while staying tool-capable; raise it via
     *  the AGENT_EFFORT var when more capability is worth the extra token cost. */
    private effort: string = "low",
    /** Whether the stable prefix (tools + system prompt) is marked cacheable, and
     *  at which TTL. Off changes nothing but the markers — see anthropicBody. */
    private cache: CacheMode = "5m"
  ) {}

  /** The one request body both complete() and stream() send. The building itself
   *  lives in the exported pure function so a test can diff cache-on against
   *  cache-off without a network call. */
  private buildBody(messages: ChatMessage[], tools: ToolSpec[], stream: boolean): Record<string, unknown> {
    return anthropicBody({ model: this.name, effort: this.effort, messages, tools, stream, cache: this.cache })
  }

  private headers(): Record<string, string> {
    return {
      "x-api-key": this.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    }
  }

  async complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ModelReply> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(messages, tools, false)),
      signal: AbortSignal.timeout(120_000), // LAW R11: ceiling a hung model call (generous — a turn finishes well under this)
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      throw modelHttpError(res.status, detail)
    }
    const data = (await res.json()) as { content?: AnthropicBlock[]; usage?: AnthropicUsage }
    const blocks = data.content ?? []
    const text = blocks
      .filter((b): b is Extract<AnthropicBlock, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("")
    const toolCalls = blocks
      .filter((b): b is Extract<AnthropicBlock, { type: "tool_use" }> => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: b.input ?? {} }))
    return { text, toolCalls, usage: readUsage(data.usage) }
  }

  /** Stream the turn (POST with "stream": true) and parse the Messages SSE: a
   *  content_block_start opens a text or tool_use block at an index; content_block_delta
   *  carries text_delta (→ onText, appended to that block's text) or input_json_delta
   *  (the tool's input JSON, accumulated as a string per index). message_stop ends it;
   *  we then parse each tool block's collected JSON and return the FULL reply. Errors
   *  surface as the same typed model_error the loop already turns into a clean message. */
  async stream(
    messages: ChatMessage[],
    tools: ToolSpec[],
    onText: (delta: string) => void
  ): Promise<ModelReply> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(messages, tools, true)),
      signal: AbortSignal.timeout(120_000), // LAW R11: ceiling a hung stream (generous — a turn finishes well under this)
    })
    if (!res.ok || !res.body) {
      const detail = res.body ? await res.text().catch(() => "") : ""
      throw modelHttpError(res.status, detail)
    }
    return parseAnthropicStream(res.body, onText)
  }
}

/** One tool_use block being assembled as its input_json_delta chunks arrive. */
type ToolBuild = { id: string; name: string; json: string }

/** Parse an Anthropic Messages SSE stream: fire onText for each text delta and return
 *  the full {text, toolCalls} once the stream ends. Exported so the test can feed it a
 *  hand-built ReadableStream (no network). */
export async function parseAnthropicStream(
  body: ReadableStream<Uint8Array>,
  onText: (delta: string) => void
): Promise<ModelReply> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let text = ""
  const tools = new Map<number, ToolBuild>() // block index → the tool_use being built
  // WHAT THE STREAMED TURN COST, assembled from two frames: `message_start`
  // carries the PROMPT side (input + the cache write/read split — the numbers
  // the whole caching change is judged on), and `message_delta` carries the
  // running output total. A stream that ends early simply reports what arrived;
  // telemetry never throws and never blocks the reply.
  const usage: TokenUsage = { ...NO_TOKENS }

  const handle = (data: string): void => {
    if (data === "[DONE]") return
    let ev: {
      type?: string
      index?: number
      message?: { usage?: AnthropicUsage }
      usage?: AnthropicUsage
      content_block?: { type?: string; id?: string; name?: string }
      delta?: { type?: string; text?: string; partial_json?: string }
    }
    try {
      ev = JSON.parse(data)
    } catch {
      return // ignore a keep-alive / unparsable frame
    }
    if (ev.type === "message_start") {
      const u = readUsage(ev.message?.usage)
      usage.input = u.input
      usage.cacheWrite = u.cacheWrite
      usage.cacheRead = u.cacheRead
      if (u.output) usage.output = u.output
      return
    }
    if (ev.type === "message_delta") {
      // Anthropic reports output_tokens here as the running total for the
      // message, so the last frame wins rather than the frames summing.
      const u = readUsage(ev.usage)
      if (u.output) usage.output = u.output
      return
    }
    if (ev.type === "content_block_start" && ev.content_block?.type === "tool_use")
      tools.set(ev.index ?? 0, {
        id: ev.content_block.id ?? "",
        name: ev.content_block.name ?? "",
        json: "",
      })
    else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
      const d = ev.delta.text ?? ""
      if (d) {
        text += d
        onText(d)
      }
    } else if (ev.type === "content_block_delta" && ev.delta?.type === "input_json_delta") {
      const b = tools.get(ev.index ?? 0)
      if (b) b.json += ev.delta.partial_json ?? ""
    }
  }

  // SSE frames are separated by a blank line; each `data:` line carries one JSON event.
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep: number
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      for (const line of frame.split("\n"))
        if (line.startsWith("data:")) handle(line.slice(5).trim())
    }
  }

  const toolCalls = [...tools.values()].map((b) => {
    let input: Record<string, unknown> = {}
    if (b.json.trim()) {
      try {
        const parsed = JSON.parse(b.json)
        if (parsed && typeof parsed === "object") input = parsed as Record<string, unknown>
      } catch {
        /* a truncated/garbled tool input just runs empty — the door re-validates */
      }
    }
    return { id: b.id, name: b.name, input }
  })
  return { text, toolCalls, usage }
}

/* -------------------------------- selection -------------------------------- */

/**
 * THE AGENTIC MODEL. Claude, and only Claude.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * THE ESCAPE HATCH IS GONE (2026-08-27, the owner's ruling, in his own words:
 * "kill the escape hatch"). This function used to end `return new
 * WorkersAiModel(…)` whenever `ANTHROPIC_API_KEY` was unset, and the whole
 * `WorkersAiModel` adapter went with it.
 *
 * WHY, and it is not tidiness. A missing key is nearly always an accident — a
 * secret that never got set on a new environment, a rotation that half
 * happened — and the fallback made that accident INVISIBLE. The assistant kept
 * answering, from a much weaker engine, with nobody told: no banner, no log
 * line, no difference a person could see except that the answers got worse.
 * Somebody judging the assistant in that state is judging a product they were
 * never shown, and the most likely somebody is the owner. AN HONEST FAILURE
 * BEATS A QUIET DEMOTION, and the quieter the demotion the truer that is.
 *
 * WHAT A MISSING KEY DOES NOW: it throws `unconfigured`, which the loop turns
 * into a saved turn and the screen turns into a plain sentence saying the
 * assistant is not set up here and who can fix it. Loud, honest and actionable
 * — the three things the fallback was not.
 *
 * WHAT WAS DELETED WITH IT. `WorkersAiModel` was ~100 lines of adapter only this
 * branch could reach, so leaving it would have left a dead engine beside a live
 * one, one edit from being wired back in by somebody reading this comment as a
 * suggestion. The tool-result FENCE it needed (`fenceToolResult`, and the
 * flattening it defends) is NOT gone and was never only its: tenancy's process
 * extraction and content's composed knowledge answer both fence untrusted text
 * through the same seam, and its own suite still proves a fence cannot be closed
 * from the inside.
 *
 * WHAT THIS COSTS, said here rather than discovered later: a fork of this base
 * with no Anthropic key now has no assistant at all, where before it had a weak
 * one. That is the trade the ruling makes and it is the right way round — "there
 * is no assistant here" is a sentence somebody can act on; "the assistant is
 * quietly worse than the one you were shown" is not.
 *
 * Swapping the brain is still one edit here (or the AGENT_MODEL var).
 */
export function selectModel(env: Env): Model {
  if (!env.ANTHROPIC_API_KEY)
    throw new ModelError(
      "unconfigured",
      "model_error: no ANTHROPIC_API_KEY is set on this worker, so there is no assistant to call."
    )
  return new ClaudeModel(
    env.ANTHROPIC_API_KEY,
    env.AGENT_MODEL || "claude-sonnet-5",
    env.AGENT_EFFORT || "low",
    cacheMode(env.AGENT_PROMPT_CACHE)
  )
}

// The ONE-SHOT CHEAP CALL (the help-reply draft, the conversation title) used to
// live here. It moved to shared/workers/cheap-text.ts the day a SECOND worker
// needed it — content, to write out the answer the knowledge base found (R23) —
// because the alternative was two `env.AI.run` calls in two workers with one
// model id between them. Import it from there; `selectModel` above is still the
// seam for an AGENTIC turn, which is a different question (it calls tools).
