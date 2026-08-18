// READING WHAT A MODEL SAID — the shared seam both workers spend a model
// through, and the two things about a provider's answer that a caller cannot
// see from the words alone.
//
// WHY THIS FILE EXISTS. On 2026-08-18 the on-demand translation of a knowledge
// source failed for EVERY input, in two different ways, and both of them were
// here rather than in the door:
//
//   • Workers AI PARSES the model's output when the whole of it is valid JSON,
//     and hands the parsed value back in `response`. A prompt that asks for a
//     JSON array therefore gets a real array on the calls the model got RIGHT —
//     and `(out.response ?? "").trim()` threw `trim is not a function` on exactly
//     those. Same model, same prompt, two types, decided by the content.
//   • Left unset, the provider allows 256 completion tokens. A 3.3 KB source
//     needs a thousand, so the array came back cut off mid-string, would not
//     parse, and the screen said "the translation came back empty" about an
//     answer that was interrupted rather than empty.
//
// So the seam is asked, not read: every shape below is one a provider has
// actually returned. It is exercised from data-ops because that is where the
// fault was reported; the seam is shared, and content's answer-writer stands on
// the same reading.

import { describe, expect, it } from "vitest"

import { cheapAnswer, cheapText, PROVIDER_DEFAULT_MAX_TOKENS } from "@shared/workers/model-text"
import type { CheapTextEnv } from "@shared/workers/model-text"

/** A Workers AI binding that answers one fixed envelope and records what it was
 * asked for — the two halves of every test here. */
function fakeAi(answer: unknown) {
  const asked: Record<string, unknown>[] = []
  return {
    asked,
    env: {
      AI: {
        run: async (_model: string, body: Record<string, unknown>) => {
          asked.push(body)
          return answer
        },
      },
    } as unknown as CheapTextEnv,
  }
}

describe("the words, whatever shape they arrive in", () => {
  it("reads a plain string answer, trimmed", async () => {
    const { env } = fakeAi({ response: "  Good day  " })
    expect((await cheapAnswer(env, "sys", "user")).text).toBe("Good day")
  })

  it("reads an ARRAY back as the JSON the model wrote — the reported fault", async () => {
    // The provider parsed it on the way past. The caller asked for text and must
    // get text; `readTranslations` parses it again, which is its job.
    const { env } = fakeAi({ response: ["Good day", "The form does not load"] })
    const said = (await cheapAnswer(env, "sys", "user")).text
    expect(said).toBe('["Good day","The form does not load"]')
    expect(JSON.parse(said)).toEqual(["Good day", "The form does not load"])
  })

  it("reads an OBJECT back the same way, rather than throwing", async () => {
    const { env } = fakeAi({ response: { title: "Good day" } })
    expect((await cheapAnswer(env, "sys", "user")).text).toBe('{"title":"Good day"}')
  })

  it("falls back to the OpenAI-shaped answer beside it", async () => {
    // A model whose `response` is missing is still one whose words are right
    // there in the same envelope.
    const { env } = fakeAi({ choices: [{ message: { content: "Good day" } }] })
    expect((await cheapAnswer(env, "sys", "user")).text).toBe("Good day")
  })

  it("answers an empty string for nothing at all, and never throws", async () => {
    for (const shape of [{}, { response: null }, { response: undefined }, { choices: [] }]) {
      const { env } = fakeAi(shape)
      await expect(cheapAnswer(env, "sys", "user")).resolves.toEqual({ text: "", truncated: false })
    }
  })

  it("cheapText is the same reading, for a caller that only wants the words", async () => {
    const { env } = fakeAi({ response: ["Good day"] })
    expect(await cheapText(env, "sys", "user")).toBe('["Good day"]')
  })
})

describe("whether it FINISHED, which the words never say", () => {
  it("says truncated when the provider stopped it for length", async () => {
    const { env } = fakeAi({ response: '["Good day', choices: [{ finish_reason: "length" }] })
    expect((await cheapAnswer(env, "sys", "user")).truncated).toBe(true)
  })

  it("every other reason to stop is the model having finished", async () => {
    for (const reason of ["stop", "tool_calls", undefined]) {
      const { env } = fakeAi({ response: "Good day", choices: [{ finish_reason: reason }] })
      expect((await cheapAnswer(env, "sys", "user")).truncated, String(reason)).toBe(false)
    }
  })
})

describe("the ceiling on the answer", () => {
  it("asks for nothing when the caller asked for nothing — the reply draft's own behaviour", async () => {
    const { asked, env } = fakeAi({ response: "ok" })
    await cheapAnswer(env, "sys", "user")
    expect(asked[0]).not.toHaveProperty("max_tokens")
  })

  it("forwards the caller's ceiling untouched", async () => {
    const { asked, env } = fakeAi({ response: "ok" })
    await cheapAnswer(env, "sys", "user", { maxTokens: 4_096 })
    expect(asked[0].max_tokens).toBe(4_096)
  })

  it("names the provider's own default, because a caller has to know what silence buys", () => {
    // 256 tokens is roughly a paragraph. Any job whose answer is longer than a
    // paragraph must say so, and this constant is what it says it against.
    expect(PROVIDER_DEFAULT_MAX_TOKENS).toBe(256)
  })
})
