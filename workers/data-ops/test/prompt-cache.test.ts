// THE PREFIX EVERY TURN RE-SENDS, and whether it can be cached.
//
// An agent turn re-sends its whole preamble — the system prompt plus the tool
// catalogue — on every model call, and a turn makes about three. Measured on the
// shipped build that is roughly 46,000 tokens before the user has typed anything,
// of which the catalogue is about 84%. So whether that prefix is BYTE-IDENTICAL
// between callers is not a tidiness question: it is the difference between paying
// full price three times a turn and paying a fifth.
//
// THIS FILE USED TO TEST ANTHROPIC'S `cache_control` MARKERS. That mechanism went
// with the transport on 2026-08-28 (the owner moved the assistant to Cloudflare
// and disabled the Anthropic key). glm-5.3-flash caches too — its own published
// rate is $0.03/M against $0.15/M for uncached input — but it caches
// AUTOMATICALLY on a repeated prefix rather than on a marker somebody places. So
// there is no longer a marker to assert, and what is left is the property the
// markers existed to serve, which was always the load-bearing half.
//
// CORRECTED 2026-08-29: "caches AUTOMATICALLY on a repeated prefix" was half the
// sentence. Cloudflare caches a prefix on the GPU that computed it, and a
// request only reuses it by LANDING ON THAT GPU — which is steered by an
// `x-session-affinity` header and by nothing else. Measured against the live
// account, four calls each behind one 6.6K prefix:
//
//     glm-5.3-flash  cached 0, 6592, 6592, 6592   (99.6% once warm)
//     gpt-oss-120b   cached 0,    0,    0,    0   (no cached rate at all)
//
// We shipped 16 turns with no header and no cached token, at 4.2x the cold input
// per turn, and nothing anywhere said so — a missing header is not an error, it
// is a bill. Hence the last describe in this file, which asserts the header
// leaves the building; the rest of the list is what makes the hit worth having:
//
//   · the prefix is the same bytes for every caller, so a cache CAN hit;
//   · the stable part comes before the conversational part, so the hit is long;
//   · the tools arrive untouched, so the catalogue is not silently re-ordered;
//   · and the turn's cost comes back, cached tokens counted separately, because
//     this is the only place the cache can be observed at all.

import { describe, expect, it } from "vitest"

import { SYSTEM, systemFor } from "../src/lib/agent"
import { DEFAULT_AGENT_MODEL, readUsage, selectModel, workersAiBody, type ChatMessage } from "../src/lib/model"
import { toolSpecs } from "../src/lib/tools"

const TOOLS = toolSpecs()

/** A realistic mid-plan conversation: the system prompt, the user's question, an
 * assistant turn that called a tool, and the tool's result. This is the shape the
 * preamble is re-sent on top of, so it is the shape the property has to survive. */
function convo(language: string | null, question: string): ChatMessage[] {
  return [
    { role: "system", content: systemFor(language) },
    { role: "user", content: question },
    {
      role: "assistant",
      content: "Let me look.",
      toolCalls: [{ id: "t1", name: "list_help_tickets", input: { status: "open" } }],
    },
    { role: "tool", content: '{"tickets":[],"total":448}', toolCallId: "t1", toolName: "list_help_tickets" },
  ]
}

const bodyFor = (language: string | null, question: string) =>
  workersAiBody({ messages: convo(language, question), tools: TOOLS, stream: false })

describe("the prefix really is the same bytes for every caller", () => {
  it("two different people asking two different things send an identical catalogue and prompt", () => {
    const a = bodyFor(null, "how many open tickets are there?")
    const b = bodyFor(null, "what did we agree with Assecuranz?")
    expect(JSON.stringify(a.tools)).toBe(JSON.stringify(b.tools))
    const sysA = (a.messages as { role: string; content: string }[])[0]
    const sysB = (b.messages as { role: string; content: string }[])[0]
    expect(sysA.content).toBe(sysB.content)
  })

  it("a reader in another language keeps the CATALOGUE identical — only the prompt moves", () => {
    // The language rule is appended to the SYSTEM prompt, never to a tool
    // description, so a German reader shares the whole catalogue with an English
    // one. That is the larger half of the prefix by a wide margin.
    const en = bodyFor(null, "how many open tickets are there?")
    const de = bodyFor("de", "how many open tickets are there?")
    expect(JSON.stringify(en.tools)).toBe(JSON.stringify(de.tools))
    const sysEn = (en.messages as { content: string }[])[0].content
    const sysDe = (de.messages as { content: string }[])[0].content
    expect(sysDe.startsWith(sysEn), "the German prompt is the English one plus a rule").toBe(true)
  })

  it("the capability brief is generated but deterministic — same bytes on every build", () => {
    expect(systemFor(null)).toBe(systemFor(null))
    expect(SYSTEM).toBe(systemFor(null))
  })

  it("the prefix is big enough for caching to be worth anything", () => {
    const chars = JSON.stringify(bodyFor(null, "x").tools).length + SYSTEM.length
    expect(chars, "the preamble this property exists to cache").toBeGreaterThan(60_000)
  })
})

describe("the stable part comes before the conversational part", () => {
  it("the system prompt is the FIRST message and the question follows it", () => {
    const msgs = bodyFor(null, "how many open tickets are there?").messages as { role: string }[]
    expect(msgs[0].role).toBe("system")
    expect(msgs[1].role).toBe("user")
  })

  it("every tool is passed through untouched — same count, same order, same schema", () => {
    const sent = bodyFor(null, "x").tools as { function: { name: string; parameters: unknown } }[]
    expect(sent).toHaveLength(TOOLS.length)
    expect(sent.map((t) => t.function.name)).toEqual(TOOLS.map((t) => t.name))
    for (const [i, t] of TOOLS.entries())
      expect(JSON.stringify(sent[i].function.parameters)).toBe(JSON.stringify(t.schema))
  })

  it("streaming changes the stream flag and nothing else", () => {
    const off = workersAiBody({ messages: convo(null, "x"), tools: TOOLS, stream: false })
    const on = workersAiBody({ messages: convo(null, "x"), tools: TOOLS, stream: true })
    expect(on.stream).toBe(true)
    expect(off.stream).toBeUndefined()
    expect(JSON.stringify({ ...on, stream: undefined })).toBe(JSON.stringify({ ...off, stream: undefined }))
  })
})

describe("what a turn cost comes back", () => {
  it("cached prompt tokens are counted apart from the ones paid for in full", () => {
    // The whole point of the split: at $0.15/M against $0.03/M, a turn that paid
    // full price for a prefix it should have re-read is a cost bug, and this is
    // the only place it is visible.
    expect(readUsage({ prompt_tokens: 41_000, completion_tokens: 52, prompt_tokens_details: { cached_tokens: 40_000 } })).toEqual(
      { input: 1_000, output: 52, cacheWrite: 0, cacheRead: 40_000 }
    )
  })

  it("no cache reported reads as all-full-price, never as a negative", () => {
    expect(readUsage({ prompt_tokens: 812, completion_tokens: 44 })).toEqual({
      input: 812,
      output: 44,
      cacheWrite: 0,
      cacheRead: 0,
    })
  })

  it("a missing or nonsense usage block reads as zero, never as a throw", () => {
    expect(readUsage(undefined)).toEqual({ input: 0, output: 0, cacheWrite: 0, cacheRead: 0 })
    // cached greater than the total would make `input` negative; it is floored.
    expect(readUsage({ prompt_tokens: 10, prompt_tokens_details: { cached_tokens: 99 } })).toEqual({
      input: 0,
      output: 0,
      cacheWrite: 0,
      cacheRead: 99,
    })
  })
})


// ── THE HEADER, which is the whole mechanism ────────────────────────────────
//
// The properties above make a prefix that CAN be cached. This makes it actually
// happen. There is no observable difference between a working cache and a broken
// one from inside the worker — same answer, same latency band, just five times
// the bill — so the seam is asserted here rather than trusted.

describe("the affinity header", () => {
  /** Captures what the binding was handed. The third argument is the one under
   *  test; the first two only have to be plausible. */
  function spyEnv() {
    const seen: { model: string; options: Record<string, unknown> | undefined }[] = []
    return {
      seen,
      env: {
        AI: {
          run: async (model: string, _body: unknown, options?: Record<string, unknown>) => {
            seen.push({ model, options })
            return { choices: [{ message: { content: "ok" } }], usage: {} }
          },
        },
      } as never,
    }
  }

  it("sends the thread id as x-session-affinity, so every step of a turn lands on one GPU", async () => {
    const { env, seen } = spyEnv()
    await selectModel(env, "thread_01ABC").complete([{ role: "user", content: "hi" }], [])
    const headers = seen[0]?.options?.extraHeaders as Record<string, string> | undefined
    expect(headers?.["x-session-affinity"]).toBe("thread_01ABC")
  })

  it("sends the SAME key for every call in one conversation", async () => {
    const { env, seen } = spyEnv()
    const model = selectModel(env, "thread_01ABC")
    await model.complete([{ role: "user", content: "one" }], [])
    await model.complete([{ role: "user", content: "two" }], [])
    const keys = seen.map((c) => (c.options?.extraHeaders as Record<string, string>)?.["x-session-affinity"])
    expect(keys).toEqual(["thread_01ABC", "thread_01ABC"])
  })

  it("gives different conversations different keys, so one does not evict the other", async () => {
    const { env, seen } = spyEnv()
    await selectModel(env, "thread_A").complete([{ role: "user", content: "hi" }], [])
    await selectModel(env, "thread_B").complete([{ role: "user", content: "hi" }], [])
    const keys = seen.map((c) => (c.options?.extraHeaders as Record<string, string>)?.["x-session-affinity"])
    expect(new Set(keys).size).toBe(2)
  })

  it("sends no header at all when there is no conversation to pin", async () => {
    const { env, seen } = spyEnv()
    await selectModel(env).complete([{ role: "user", content: "hi" }], [])
    expect(seen[0]?.options?.extraHeaders).toBeUndefined()
  })

  // THIS ASSERTION USED TO PIN THE ENGINE TO glm, and it was wrong — green, and
  // asserting the wrong intent, which is the failure CLAUDE.md's planning ritual
  // names in point 6.
  //
  // Its reasoning was "the header is worthless on a model with no cached rate, so
  // the default must be a model that has one". The premise is true and the
  // conclusion does not follow: the cached rate is about MONEY, and the engine is
  // chosen on LATENCY. Re-measured 30 Aug 2026 against a real 40-tool catalogue,
  // three runs each — gpt-oss 2429/2583/3363ms with no cache at all; glm
  // 7168/8868/9751ms cold, and 3809-5879ms once its cache reaches 99.5% with the
  // affinity header. glm WARM is slower than gpt-oss COLD. And the note in
  // model.ts records that the header does nothing through `env.AI.run` anyway,
  // which is the door the deployed worker uses.
  //
  // Worse, the assertion was inert as a safety net: `wrangler.jsonc` had pinned
  // AGENT_MODEL to gpt-oss since 28 Aug and the var wins in `selectModel`, so
  // this test was pinning a constant that no deployed turn ever read. It passed
  // for two days while describing an assistant nobody was running.
  //
  // What is asserted instead is the property this file actually protects: the
  // header goes out when there is a conversation to pin. Whether the engine of
  // the day bills a cached rate is a separate decision, and whether it MATCHES
  // the deployment is locked in no-quiet-downgrade.test.ts, off the wrangler
  // config, which is the check that would have caught the drift.
  it("the header is sent for a pinned conversation, whatever engine is current", async () => {
    const { env, seen } = spyEnv()
    await selectModel(env, "thread_A").complete([{ role: "user", content: "hi" }], [])
    const sent = (seen[0]?.options?.extraHeaders as Record<string, string>)?.["x-session-affinity"]
    expect(sent, "a turn's steps must be steerable to one instance").toBe("thread_A")
    expect(DEFAULT_AGENT_MODEL, "an engine must still be named in code").toBeTruthy()
  })
})
