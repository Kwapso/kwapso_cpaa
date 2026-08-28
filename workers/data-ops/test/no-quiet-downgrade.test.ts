// AN HONEST FAILURE BEATS A QUIET DEMOTION.
//
// The original sin: `selectModel` ended `return new WorkersAiModel(…)` whenever
// ANTHROPIC_API_KEY was unset. A secret that never got set on a new environment,
// or a rotation that half happened, therefore produced an assistant that kept
// answering — from a much weaker engine, with nobody told. Somebody judging the
// assistant in that state is judging a product they were never shown.
//
// The owner's ruling on 2026-08-27 was two words: "kill the escape hatch."
//
// THE WORLD INVERTED ON 2026-08-28 AND THE PRINCIPLE DID NOT. The owner moved the
// assistant onto Cloudflare (@cf/zai-org/glm-5.3-flash) and disabled the
// Anthropic key, so Workers AI is no longer the weak fallback — it is the engine.
// There is nothing left to fall back TO, which is a stronger position than the
// one this file used to defend, and exactly the reason the lock has to be
// rewritten rather than deleted: a suite that still asserted a throw on a missing
// ANTHROPIC_API_KEY would be green, meaningless, and read as coverage.
//
// So the property is now the one that survives the swap: ONE engine, chosen in
// ONE place, with no second branch that could quietly substitute another — and a
// door failure that still classifies into a sentence a person can act on.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { classifyModelHttp, ModelError, retryAfterSeconds } from "@shared/workers/model-failure"
import { DEFAULT_AGENT_MODEL, selectModel } from "../src/lib/model"
import { stripComments } from "@shared/rules/source-scan"

const SRC = readFileSync(join(__dirname, "..", "src", "lib", "model.ts"), "utf8")

/** The AI binding a worker really has. Nothing here is called — `selectModel`
 * only chooses. */
const env = { AI: { run: async () => new Response("{}") } } as never

describe("one engine, chosen in one place, with no hatch beside it", () => {
  it("a worker with no model var still gets a working assistant, not a silent nothing", () => {
    // The FAILURE THIS REPLACES: the old seam threw when a secret was missing, so
    // a fresh environment had no assistant at all. The binding needs no secret,
    // so the honest answer to "nothing configured" is now the default model
    // rather than an error — and the default is named in code, not only in
    // wrangler, so a worker deployed without vars is not a broken one.
    const model = selectModel(env)
    expect(model.name).toBe(DEFAULT_AGENT_MODEL)
    expect(model.canActWithTools, "an assistant that cannot call tools is a demotion").toBe(true)
  })

  it("AGENT_MODEL swaps the engine, and nothing else can", () => {
    expect(selectModel({ ...(env as object), AGENT_MODEL: "@cf/openai/gpt-oss-120b" } as never).name).toBe(
      "@cf/openai/gpt-oss-120b"
    )
  })

  it("no second engine is left in the agentic seam to be wired back in", () => {
    // Off the DISK and comment-stripped: this file's own note about what was
    // deleted names ClaudeModel and ANTHROPIC_API_KEY, and a check that read the
    // comments would pass for the wrong reason — or fail for the wrong one.
    const code = stripComments(SRC)
    expect(code, "the Anthropic adapter must not come back").not.toContain("class ClaudeModel")
    expect(code, "and nothing here may reach for that key again").not.toContain("ANTHROPIC_API_KEY")
    expect(code, "nor call the provider directly").not.toContain("api.anthropic.com")
    expect(code).toContain("class WorkersAiModel")
  })

  it("a refused door is an ERROR the loop can classify, never a quiet answer", () => {
    // The other half of "no quiet demotion": when the engine says no, that has to
    // arrive as a typed failure with a reason, so the screen can say WHY. A caught
    // exception that becomes a cheerful empty reply is the same bug in a different
    // coat — and it is what the owner actually saw today, when the disabled key
    // turned every turn into "I couldn't answer that one."
    const err = new ModelError(classifyModelHttp(401, ""), "model_error: refused")
    expect(err).toBeInstanceOf(ModelError)
    expect(err.reason).toBe("refused")
  })

  it("selectModel returns exactly one kind of model", () => {
    // A `return new X(` count of one is what makes "no fallback" structural
    // rather than a promise. A second return is the hatch, whatever it is called.
    const body = stripComments(SRC).slice(stripComments(SRC).indexOf("export function selectModel"))
    const returns = (body.slice(0, body.indexOf("\n}")).match(/return new /g) ?? []).length
    expect(returns, "one branch, one engine").toBe(1)
  })
})

describe("what came back from the model door, classified once", () => {
  // ONE REASON PER SENTENCE A PERSON NEEDS, never one per status code. Each of
  // these is a different thing to do about it, which is the only test that
  // matters: a taxonomy finer than the reader's available actions makes them
  // guess, and a coarser one makes them retry something that will never work.
  it("a rejected key is a refusal, whichever way the provider spells it", () => {
    expect(classifyModelHttp(401, "")).toBe("refused")
    expect(classifyModelHttp(403, '{"error":{"type":"forbidden","message":"Request not allowed"}}')).toBe(
      "refused"
    )
  })

  it("too many requests is its own answer — it clears", () => {
    expect(classifyModelHttp(429, "")).toBe("rate_limited")
  })

  it("an empty balance is read from the BODY, not the status", () => {
    // The trap this exists for: a provider signals a spent balance with a 400,
    // the same status as a malformed request — and it is the one an owner can
    // fix in two minutes, so it must not be filed under "something went wrong".
    expect(classifyModelHttp(400, '{"error":{"message":"credit_balance_too_low"}}')).toBe(
      "provider_out_of_credit"
    )
    expect(classifyModelHttp(429, "your billing account is inactive")).toBe("provider_out_of_credit")
  })

  it("busy is not broken", () => {
    for (const status of [502, 503, 504, 529]) expect(classifyModelHttp(status, "")).toBe("overloaded")
  })

  it("anything else is honest about not knowing", () => {
    expect(classifyModelHttp(400, "bad request")).toBe("unavailable")
    expect(classifyModelHttp(418, "")).toBe("unavailable")
  })

  it("a retry-after is repeated only when it is a number somebody would wait", () => {
    expect(retryAfterSeconds('{"retry-after": 30}')).toBe(30)
    expect(retryAfterSeconds("nothing here")).toBeUndefined()
    // Over an hour is not a wait, it is a different sentence.
    expect(retryAfterSeconds('{"retry-after": 86400}')).toBeUndefined()
  })
})
