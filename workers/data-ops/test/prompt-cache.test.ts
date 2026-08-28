// THE PROMPT CACHE, AND THE ONE THING THAT HAD TO BE TRUE BEFORE IT COULD SHIP.
//
// The owner's condition was exact: only do this if accuracy in real time is
// unaffected and cost falls by at least 3×. The second half is arithmetic. The
// first half is this file.
//
// A prompt cache is not a summary, a compression or a shortcut — it is the same
// tokens, remembered. So the claim to prove is not "the answers still look fine",
// which no test can check and no amount of manual poking can settle. It is the
// far narrower, entirely checkable claim that THE REQUEST DID NOT CHANGE: the
// JSON that leaves this worker with caching on is byte-for-byte the JSON that
// leaves it with caching off, apart from the `cache_control` markers themselves.
// If that holds, the model reads exactly what it read yesterday, and there is no
// mechanism by which an answer could differ.
//
// So the tests below build both bodies through the real path (a fake fetch
// captures what would have gone over the wire), strip the markers from one, and
// diff the two as strings. No network, no key, no live model.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT IT SAVES, measured rather than assumed. Re-measured 2026-08-26 by the
// round-two spend review (the 2026-08-18 figures below it had drifted 17% as
// the catalogue grew — 163 tools became 191):
//
//   191 tool definitions, serialised as the API receives them     ≈ 109 KB
//   system prompt incl. the generated capability brief (3,670)    ≈  21 KB
//   the per-reader-language paragraph systemFor() appends             594 chars
//                                                        preamble ≈ 130,544 chars
//
// (2026-08-18, for the record: 163 tools / 91,801 chars / ≈112 KB total.)
//
// At roughly 3.5 characters per token on Sonnet 5's tokenizer that is about
// 37,000 tokens of preamble, re-sent on every model turn (the 2026-08-18
// figure was 32,000 — the number that moves when the catalogue grows). A
// question that runs three tools is four turns, so ~148,000 of the ~153,000
// input tokens one question costs are the same block, four times.
//
// Sonnet 5 list prices: input $3.00/MTok, output $15.00/MTok; a cache WRITE is
// 1.25× input ($3.75) at the 5-minute TTL or 2× ($6.00) at one hour; a cache
// READ is 0.1× input ($0.30). So per question, counting only the preamble:
//
//   no cache      4 × 32k × $3.00/M                            = $0.384
//   cache, cold   32k × $3.75/M  +  3 × 32k × $0.30/M          = $0.149
//   cache, warm   4 × 32k × $0.30/M                            = $0.038
//
// Add ~5k tokens of conversation (~$0.015) and ~1.2k output (~$0.018) either way
// and a question costs $0.417 uncached, $0.182 cold, $0.071 warm — blending
// to ≈ $0.081 at the hit rate a 5-minute TTL earns here (~65%+, and the denser
// the traffic the warmer the cache). The owner's stated volume is 20,000+
// replies a month (2026-08-26; this comment modelled 2,600 for a week after
// that number was said out loud), so: ≈ $8,340/month with no cache against
// ≈ $1,620/month with it — the same 3.8× reduction at ~7.7× the old
// arithmetic's stakes. Each ADDED tool costs ≈ $5/month at this volume before
// it is ever called: the catalogue is a bill, not a menu.
//
// THE DATED ITEM: on 1 Sept 2026 list prices move and one reply becomes
// ≈ $0.122 blended — ≈ $2,440/month at the same volume, ≈ +$810. Nothing in
// the code changes; the arithmetic does (round-three spend review).
//
// THE BREAK-EVEN, which is the honest number rather than the flattering one:
// 3× needs the cached cost at or below $0.139 a question, so the warm-start rate
// must be at least **39%** on the 5-minute TTL. Below that the cache still saves
// money, just not threefold. Setting AGENT_PROMPT_CACHE="1h" doubles the write
// premium but makes nearly every question warm — break-even rises to 63% and the
// expected hit rate rises to ~100%. At the owner's 20,000 replies that lands
// near $1,460/month against the 5-minute TTL's $1,620 (the old "$190/month"
// here was this same shape at the retired 2,600-reply volume, left un-derived
// when the volume changed — round-three spend review).
//
// Every figure above is a list-price estimate with the token count derived from
// measured characters; the point of recording usage per turn (migration 0027) is
// that after a week on staging none of it has to be an estimate.

import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { SYSTEM, systemFor } from "../src/lib/agent"
import {
  anthropicBody,
  cacheMode,
  parseAnthropicStream,
  readUsage,
  selectModel,
  type CacheMode,
  type ChatMessage,
} from "../src/lib/model"
import { toolSpecs } from "../src/lib/tools"

const TOOLS = toolSpecs()

/** A realistic mid-plan conversation: the system prompt, the user's question, an
 * assistant turn that called a tool, and the tool's result. This is the shape the
 * preamble is re-sent on top of, so it is the shape the diff has to survive. */
function convo(language: string | null, question: string): ChatMessage[] {
  return [
    { role: "system", content: systemFor(language) },
    { role: "user", content: question },
    {
      role: "assistant",
      content: "Let me look that up.",
      toolCalls: [{ id: "t1", name: "list_help_tickets", input: { status: "open" } }],
    },
    { role: "tool", content: '{"rows":[],"total":3,"hasMore":false}', toolCallId: "t1", toolName: "list_help_tickets" },
  ]
}

function bodyFor(cache: CacheMode, messages = convo(null, "how many open tickets does Confia have?")) {
  return anthropicBody({ model: "claude-sonnet-5", effort: "low", messages, tools: TOOLS, stream: false, cache })
}

/** A deep copy with every `cache_control` key removed — and nothing else touched.
 * Written by hand rather than with a regex over the JSON so it cannot silently
 * "fix" a difference that is actually there. */
function stripMarkers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripMarkers)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "cache_control") continue
      out[k] = stripMarkers(v)
    }
    return out
  }
  return value
}

/** The Anthropic fetch, faked: it records the body it was handed and answers with
 * a plausible reply + usage block. Nothing leaves the machine. */
function captureAnthropic(reply: Record<string, unknown>) {
  const bodies: Record<string, unknown>[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (_url: unknown, init: { body: string }) => {
    bodies.push(JSON.parse(init.body) as Record<string, unknown>)
    return new Response(JSON.stringify(reply), { status: 200, headers: { "content-type": "application/json" } })
  }) as unknown as typeof fetch
  return { bodies, restore: () => { globalThis.fetch = original } }
}

const REPLY = {
  content: [{ type: "text", text: "Confia has three open tickets." }],
  usage: {
    input_tokens: 812,
    output_tokens: 44,
    cache_creation_input_tokens: 31_640,
    cache_read_input_tokens: 0,
  },
}

/* ══════════════════ 1. the accuracy proof ══════════════════ */

describe("caching changes the markers and NOTHING else", () => {
  it("the body sent with the cache on is the body sent with it off, byte for byte", () => {
    const on = bodyFor("5m")
    const off = bodyFor("off")

    // The comparison that matters, done on the serialised bytes rather than on
    // the objects: key ORDER is part of what goes over the wire, and an object
    // comparison would pass while the two requests differed.
    expect(JSON.stringify(stripMarkers(on))).toBe(JSON.stringify(off))

    // …and the test must be capable of failing. If the markers were never added,
    // the line above would pass trivially and prove nothing.
    expect(JSON.stringify(on)).toContain('"cache_control"')
    expect(JSON.stringify(off)).not.toContain("cache_control")
  })

  it("holds for the one-hour TTL too — only the marker's own contents differ", () => {
    expect(JSON.stringify(stripMarkers(bodyFor("1h")))).toBe(JSON.stringify(bodyFor("off")))
    expect(JSON.stringify(bodyFor("1h"))).toContain('"ttl":"1h"')
    expect(JSON.stringify(bodyFor("5m"))).not.toContain("ttl")
  })

  it("holds on a streamed turn, and on a turn with no tools at all", () => {
    const cases: [boolean, typeof TOOLS][] = [[true, TOOLS], [false, []], [true, []]]
    for (const [stream, tools] of cases) {
      const on = anthropicBody({ model: "claude-sonnet-5", effort: "low", messages: convo(null, "hi"), tools, stream, cache: "5m" })
      const off = anthropicBody({ model: "claude-sonnet-5", effort: "low", messages: convo(null, "hi"), tools, stream, cache: "off" })
      expect(JSON.stringify(stripMarkers(on)), `stream:${stream} tools:${tools.length}`).toBe(JSON.stringify(off))
    }
  })

  it("the model still reads the exact system prompt it read before", () => {
    // The one structural change caching required: `system` became a one-element
    // block array, because a marker has to sit ON a content block. The STRING
    // inside it must still be character-for-character what the bare-string form
    // carried, or the prompt has been edited by the plumbing.
    const sys = bodyFor("5m").system as { type: string; text: string }[]
    expect(sys).toHaveLength(1)
    expect(sys[0].type).toBe("text")
    expect(sys[0].text).toBe(SYSTEM)
    expect(sys[0].text).toBe(systemFor(null))
    // Same for a reader in another language: the block carries systemFor's exact
    // output, language paragraph and all.
    const de = anthropicBody({ model: "claude-sonnet-5", effort: "low", messages: convo("de", "hallo"), tools: TOOLS, stream: false, cache: "5m" })
    expect((de.system as { text: string }[])[0].text).toBe(systemFor("de"))
  })

  it("every tool is passed through untouched — same count, same order, same schema", () => {
    const sent = bodyFor("5m").tools as { name: string; description: string; input_schema: unknown }[]
    expect(sent).toHaveLength(TOOLS.length)
    sent.forEach((t, i) => {
      expect(t.name).toBe(TOOLS[i].name)
      expect(t.description).toBe(TOOLS[i].description)
      expect(JSON.stringify(t.input_schema)).toBe(JSON.stringify(TOOLS[i].schema))
    })
  })

  it("through the real path: two live-shaped calls, one with the cache, one without", async () => {
    // Not the pure builder this time — selectModel → ClaudeModel → fetch, so the
    // proof covers the wiring and not just the function.
    const key = { ANTHROPIC_API_KEY: "sk-test-not-a-real-key", AGENT_MODEL: "claude-sonnet-5", AGENT_EFFORT: "low" }
    const messages = convo(null, "who is on the team?")

    const cached = captureAnthropic(REPLY)
    try {
      await selectModel({ ...key, AGENT_PROMPT_CACHE: "5m" } as never).complete(messages, TOOLS)
    } finally {
      cached.restore()
    }
    const plain = captureAnthropic(REPLY)
    try {
      await selectModel({ ...key, AGENT_PROMPT_CACHE: "off" } as never).complete(messages, TOOLS)
    } finally {
      plain.restore()
    }

    expect(cached.bodies).toHaveLength(1)
    expect(plain.bodies).toHaveLength(1)
    expect(JSON.stringify(stripMarkers(cached.bodies[0]))).toBe(JSON.stringify(plain.bodies[0]))
    expect(JSON.stringify(cached.bodies[0])).toContain("cache_control")
  })
})

/* ══════════════════ 2. where the breakpoints sit ══════════════════ */

describe("the breakpoints mark the stable prefix and stop there", () => {
  it("marks the LAST tool definition and the system block — and nothing else", () => {
    const body = bodyFor("5m")
    const tools = body.tools as Record<string, unknown>[]

    expect(tools[tools.length - 1].cache_control, "the last tool opens the catalogue's own cache entry").toBeDefined()
    for (const t of tools.slice(0, -1))
      expect(t.cache_control, `${t.name} must not carry its own breakpoint`).toBeUndefined()
    expect((body.system as Record<string, unknown>[])[0].cache_control).toBeDefined()

    // Two, not four. The API allows at most four breakpoints per request and a
    // marker on a per-turn message would cache something that changes every turn.
    expect((JSON.stringify(body).match(/"cache_control"/g) ?? []).length).toBe(2)
    expect(JSON.stringify(body.messages)).not.toContain("cache_control")
  })

  it("puts the stable part before the conversational part, which is the whole trick", () => {
    // The API renders a prompt tools → system → messages whatever order the JSON
    // arrives in, so this is about what is IN each part, not the key order: the
    // cached prefix must contain nothing that came from this caller or this turn.
    const body = bodyFor("5m", convo(null, "a very distinctive question about Bergman AB"))
    expect(JSON.stringify(body.tools)).not.toContain("Bergman AB")
    expect(JSON.stringify(body.system)).not.toContain("Bergman AB")
    expect(JSON.stringify(body.messages)).toContain("Bergman AB")
  })
})

/* ══════════════════ 3. is the preamble actually invariant? ══════════════════ */

describe("the prefix really is the same bytes for every caller", () => {
  it("two different people asking two different things send an identical catalogue and prompt", () => {
    const a = bodyFor("5m", convo(null, "how many open tickets does Confia have?"))
    const b = bodyFor("5m", convo(null, "invite sam@example.com as a viewer"))
    expect(JSON.stringify(a.tools)).toBe(JSON.stringify(b.tools))
    expect(JSON.stringify(a.system)).toBe(JSON.stringify(b.system))
  })

  it("a reader in another language keeps the CATALOGUE cached, which is why the tools are marked separately", () => {
    // The finding this rule exists for: `systemFor` appends a paragraph per
    // reader language, so the system prompt is NOT invariant across callers. If
    // the only breakpoint were on the system block, a German caller would miss
    // the whole prefix — 163 tool definitions included — over 594 characters.
    // Marking the tools in their own right means the variable part sits AFTER a
    // breakpoint of its own, so a language only ever costs its own system entry.
    const en = bodyFor("5m", convo(null, "hello"))
    const de = bodyFor("5m", convo("de", "hallo"))
    expect(JSON.stringify(de.tools), "the catalogue must not vary by reader language").toBe(JSON.stringify(en.tools))
    expect(JSON.stringify(de.system), "the system prompt does vary — honestly recorded").not.toBe(JSON.stringify(en.system))
  })

  it("the capability brief is generated but deterministic — same bytes on every build", () => {
    // R9's brief is GENERATED from the import catalogue. Generated is fine;
    // non-deterministic would not be, because it would re-write the cache every
    // turn and quietly cost 1.25× rather than saving anything.
    expect(systemFor(null)).toBe(systemFor(null))
    expect(JSON.stringify(bodyFor("5m").system)).toBe(JSON.stringify(bodyFor("5m").system))
  })

  it("the prefix clears the cacheable minimum by a wide margin", () => {
    // Anthropic silently declines to cache a prefix under ~1024 tokens on
    // Sonnet 5 — no error, just no saving. Measured 2026-08-18: 91,801 chars of
    // tool JSON + 20,225 of system prompt, ~32k tokens. If this ever collapses
    // towards the floor the whole justification goes with it.
    const chars = JSON.stringify(bodyFor("off").tools).length + SYSTEM.length
    expect(chars, "the preamble this change exists to cache").toBeGreaterThan(60_000)
  })
})

/* ══════════════════ 4. the saving is measurable ══════════════════ */

describe("what a turn cost comes back, on both transports", () => {
  it("a one-shot turn reports the four counts, cache split included", async () => {
    const cap = captureAnthropic(REPLY)
    try {
      const reply = await selectModel({
        ANTHROPIC_API_KEY: "sk-test-not-a-real-key",
        AGENT_MODEL: "claude-sonnet-5",
      } as never).complete(convo(null, "hi"), TOOLS)
      expect(reply.usage).toEqual({ input: 812, output: 44, cacheWrite: 31_640, cacheRead: 0 })
    } finally {
      cap.restore()
    }
  })

  it("a streamed turn assembles them from message_start + message_delta", async () => {
    // The prompt side (and the whole cache split) arrives once, up front; the
    // output total arrives at the end as a running figure, so the last one wins.
    const frames = [
      'data: {"type":"message_start","message":{"id":"msg_1","usage":{"input_tokens":840,"output_tokens":1,"cache_creation_input_tokens":0,"cache_read_input_tokens":31640}}}\n\n',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Three."}}\n\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":52}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ].join("")
    const reply = await parseAnthropicStream(new Response(frames).body!, () => {})
    expect(reply.text).toBe("Three.")
    expect(reply.usage).toEqual({ input: 840, output: 52, cacheWrite: 0, cacheRead: 31_640 })
  })

  it("a missing or nonsense usage block reads as zero, never as a throw", () => {
    // Telemetry must never be able to break the turn it is measuring.
    expect(readUsage(undefined)).toEqual({ input: 0, output: 0, cacheWrite: 0, cacheRead: 0 })
    expect(readUsage({ input_tokens: -5, output_tokens: Number.NaN } as never)).toEqual({
      input: 0, output: 0, cacheWrite: 0, cacheRead: 0,
    })
  })

  it("a stream that dies mid-flight still reports what it saw", async () => {
    const reply = await parseAnthropicStream(
      new Response('data: {"type":"message_start","message":{"usage":{"input_tokens":9,"cache_read_input_tokens":31640}}}\n\n').body!,
      () => {}
    )
    expect(reply.usage?.cacheRead).toBe(31_640)
  })
})

/* ══════════════════ 5. it is recorded, through the one seam ══════════════════ */

const SRC = (p: string) => readFileSync(join(__dirname, "..", ...p.split("/")), "utf8")
const CREDITS = readFileSync(join(__dirname, "../../../shared/workers/credits.ts"), "utf8")
const AGENT = SRC("src/lib/agent.ts")

describe("the counts reach the usage log rather than a second telemetry channel", () => {
  it("every model reply's tokens are added to the turn's tally", () => {
    // Positional, like the credit invariants beside it: the reply the loop just
    // received must be the thing added, not some other number that happens to be
    // in scope. Drop this line and the log fills with zeroes and looks fine.
    expect(AGENT, "the plan loop must accumulate the reply's usage").toMatch(
      /opts\.tally\.tokens\s*=\s*addTokens\(\s*opts\.tally\.tokens\s*,\s*reply\.usage\s*\)/
    )
    // The unmetered failure wrap-up is a real model call on the most expensive
    // exit there is; if it isn't counted the log under-reports exactly there.
    expect(AGENT, "the failure wrap-up's tokens must be counted too").toMatch(
      /tally\.tokens\s*=\s*addTokens\(\s*tally\.tokens\s*,\s*reply\.usage\s*\)/
    )
  })

  it("the tally is what gets written — both on a fresh row and on a folded one", () => {
    expect(AGENT).toMatch(/logUsage\([\s\S]{0,400}?opts\.tally\.tokens/)
    expect(AGENT).toMatch(/foldUsageIntoLatest\([\s\S]{0,400}?opts\.tally\.tokens/)
  })

  it("logUsage writes the four columns onto the existing row — no second table", () => {
    const insert = CREDITS.slice(CREDITS.indexOf("export async function logUsage"))
    for (const col of ["input_tokens", "output_tokens", "cache_write_tokens", "cache_read_tokens"])
      expect(insert, `logUsage must record ${col}`).toContain(col)
    // A turn nobody measured (the knowledge base spends its unit on a provider
    // that reports nothing) writes NULL, not four zeroes — "not measured" and
    // "measured, and it was free" are different sentences and only one is true.
    expect(insert, "an unmeasured turn must bind NULL rather than 0").toMatch(
      /tokens\?\.input\s*\?\?\s*null/
    )
    // One row per command, still: the fold ADDS to the row the propose turn wrote
    // rather than starting a fresh one, so a command that paused for a confirm
    // has one set of numbers, not two.
    const fold = CREDITS.slice(CREDITS.indexOf("export async function foldUsageIntoLatest"))
    expect(fold).toMatch(/cache_read_tokens\s*=\s*COALESCE\(cache_read_tokens,\s*0\)\s*\+\s*\?/)
  })

  it("the columns the writes name actually exist in a migration", () => {
    const sql = readFileSync(join(__dirname, "../../../db/core/0027_usage_tokens.sql"), "utf8")
    for (const col of ["input_tokens", "output_tokens", "cache_write_tokens", "cache_read_tokens"])
      expect(sql, `migration 0027 must add ${col}`).toMatch(
        new RegExp(`ALTER TABLE agent_usage_log ADD COLUMN ${col}\\b`)
      )
  })
})

/* ═════════════ 6. the marker is built once, and only for Claude ═════════════ */

// This block used to open with "the no-key path selects Workers AI and sends no
// marker anywhere". That path is gone (the escape hatch was killed on
// 2026-08-27 — selectModel's own note says why), so the test that proved the
// OTHER provider never saw a `cache_control` has no other provider to prove it
// about. What survives is the reason it was written: the marker must be built in
// exactly one place, so it cannot leak into whatever is wired in next.

describe("the cache marker is built in one place", () => {
  it("the marker is built in exactly one place, so it cannot leak into another provider", () => {
    const model = SRC("src/lib/model.ts")
    expect(
      (model.match(/cache_control:/g) ?? []).length,
      "cache_control must be constructed only in cacheMark()"
    ).toBe(1)
  })
})

describe("AGENT_PROMPT_CACHE", () => {
  it("is on by default, and a typo does not quietly quadruple the bill", () => {
    expect(cacheMode(undefined)).toBe("5m")
    expect(cacheMode("")).toBe("5m")
    expect(cacheMode("yes please")).toBe("5m")
    expect(cacheMode("OFF"), "only the exact word turns it off").toBe("5m")
  })

  it("turns off, and stretches to an hour, on the exact words", () => {
    expect(cacheMode("off")).toBe("off")
    expect(cacheMode("1h")).toBe("1h")
  })

  it("is declared on both deployment blocks, so the two environments agree", () => {
    type Cfg = { vars?: Record<string, string>; env?: Record<string, { vars?: Record<string, string> }> }
    const cfg = JSON.parse(
      readFileSync(join(__dirname, "..", "wrangler.jsonc"), "utf8").replace(/(?<![:"])\/\/[^\n]*/g, "")
    ) as Cfg
    const live = cfg.vars?.AGENT_PROMPT_CACHE
    const staging = cfg.env?.staging?.vars?.AGENT_PROMPT_CACHE
    // NOT a pinned literal. This used to assert `toBe("5m")` twice, which made
    // the test a COPY of the config rather than a check on it: changing the knob
    // on the owner's word turned the build red for agreeing with him, and the
    // fix was to edit the assertion, which is a test that can only ever say
    // "nobody changed this". What actually matters is the two properties a
    // price knob has to have.
    //
    // i · it is a word the parser recognises EXACTLY. `cacheMode` falls back to
    // "5m" for anything it does not know, so a typo would ship silently at a
    // different price from the one intended.
    expect(live, "the production block must declare the knob").toBeTruthy()
    expect(cacheMode(live), `"${live}" is not a mode — cacheMode would silently fall back`).toBe(live)
    // ii · staging measures what production spends. Two environments on
    // different cache settings make every cost measurement here a guess there.
    expect(staging, "staging and production must agree, or a measurement means nothing").toBe(live)
  })
})
