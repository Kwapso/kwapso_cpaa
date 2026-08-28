// AN HONEST FAILURE BEATS A QUIET DEMOTION.
//
// `selectModel` used to end `return new WorkersAiModel(…)` whenever
// ANTHROPIC_API_KEY was unset. A secret that never got set on a new environment,
// or a rotation that half happened, therefore produced an assistant that kept
// answering — from a much weaker engine, with nobody told. No banner, no log
// line, nothing a person could see except that the answers got worse. Somebody
// judging the assistant in that state is judging a product they were never
// shown, and the most likely somebody is the owner.
//
// The owner's ruling on 2026-08-27 was two words: "kill the escape hatch."
//
// THIS SUITE IS THE LOCK, and it is written so that putting the hatch back is a
// red build rather than a code review nobody schedules. It asserts the throw,
// and it asserts the ABSENCE — because a fallback is added by writing one line
// at the end of a function, which is the easiest thing in the world to do while
// meaning well ("just so a fresh environment still works").

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { classifyModelHttp, ModelError, retryAfterSeconds } from "@shared/workers/model-failure"
import { selectModel } from "../src/lib/model"
import { stripComments } from "@shared/rules/source-scan"

const SRC = readFileSync(join(__dirname, "..", "src", "lib", "model.ts"), "utf8")

describe("a worker with no key has no assistant, and says so", () => {
  it("selectModel THROWS rather than handing back a weaker engine", () => {
    let thrown: unknown
    try {
      selectModel({} as never)
    } catch (e) {
      thrown = e
    }
    expect(thrown, "no key must be a refusal, not a substitution").toBeInstanceOf(ModelError)
    expect((thrown as ModelError).reason).toBe("unconfigured")
  })

  it("…and the message an owner reads names the missing secret", () => {
    // The person on the screen gets a translated sentence from the reason; this
    // string is for the error store, where the only useful thing is WHICH knob.
    try {
      selectModel({} as never)
    } catch (e) {
      expect((e as Error).message).toContain("ANTHROPIC_API_KEY")
    }
  })

  it("no second engine is left in the agentic seam to be wired back in", () => {
    // Off the DISK and comment-stripped: the file's own note about what was
    // deleted names `WorkersAiModel` several times, and a check that read the
    // comments would pass for the wrong reason — or fail for the wrong one.
    const code = stripComments(SRC)
    expect(code, "the deleted adapter must not have come back").not.toContain("class WorkersAiModel")
    expect(code, "and nothing in the agentic seam may call the AI binding").not.toContain("env.AI")
    // The cheap INLINE path is a different question and still runs on Workers AI
    // (shared/workers/model-text.ts). This is about the seam that calls TOOLS.
    expect(code).toContain("new ClaudeModel(")
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
