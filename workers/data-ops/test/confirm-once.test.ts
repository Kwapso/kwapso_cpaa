// THE APPROVAL GATE HAS ONE JOB: a dangerous call runs when — and only when —
// the person approved it. It ran TWICE on a double-tap.
//
// confirmAndRun read the stored proposal, executed every call in it, and only
// then marked it "done" with an UPDATE that checked nothing. So two /confirm
// posts (a double-click, a retried request, a reconnecting stream) both read the
// same "proposed" calls and both executed them — a second invite, a second row,
// a second of whatever the model had asked permission for.
//
// The shape is CONCURRENCY.md's "a retryable operation that must run at most once
// claims it first" — the CSV importer's planned→running flip is its twin, locked
// the same way next door in import-idempotency.test.ts.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const lib = (name: string) => readFileSync(join(__dirname, "..", "src", "lib", name), "utf8")
const threads = lib("threads.ts")
const agent = lib("agent.ts")

const confirmBody = (() => {
  const start = agent.indexOf("export async function confirmAndRun")
  const next = agent.indexOf("\nexport ", start + 1)
  return agent.slice(start, next === -1 ? undefined : next)
})()

describe("an approved proposal runs at most once", () => {
  it("the consume is a compare-and-swap, not a blind overwrite", () => {
    const body = (() => {
      const start = threads.indexOf("export async function consumePendingProposal")
      const next = threads.indexOf("\nexport ", start + 1)
      return threads.slice(start, next === -1 ? undefined : next)
    })()
    expect(body, "consumePendingProposal must exist").toBeTruthy()
    // The row must still hold the text we read — that predicate IS the claim.
    expect(
      /UPDATE agent_messages[\s\S]*WHERE[\s\S]*AND tool_calls_json = /.test(body),
      "the claim must ride the write, or two confirms both 'win' it"
    ).toBe(true)
    // …and it must report who won, or checking it is impossible.
    expect(/Promise<boolean>/.test(body)).toBe(true)
  })

  it("confirmAndRun claims the proposal BEFORE it runs anything", () => {
    expect(confirmBody, "confirmAndRun must exist").toBeTruthy()
    const claimAt = confirmBody.indexOf("consumePendingProposal(")
    const runAt = confirmBody.indexOf("runToolCall(")
    expect(claimAt, "the claim must be in confirmAndRun").toBeGreaterThan(-1)
    expect(runAt, "the calls must be in confirmAndRun").toBeGreaterThan(-1)
    expect(runAt, "claim first, execute second — or a lost race still executes").toBeGreaterThan(claimAt)
  })

  it("…and the caller that LOSES the claim proceeds no further", () => {
    // Not fire-and-forget: the answer has to be read, and the loser has to stop
    // before the credit is metered and before any write happens.
    const claim = confirmBody.slice(confirmBody.indexOf("consumePendingProposal("))
    expect(
      /^[\s\S]{0,80}\)\)\s*\{/.test(claim) || /if\s*\([\s\S]{0,120}consumePendingProposal\(/.test(confirmBody),
      "the claim's result must gate what follows it"
    ).toBe(true)
    const meterAt = confirmBody.indexOf("consumeAiUnit(")
    expect(
      confirmBody.indexOf("consumePendingProposal("),
      "the loser must be turned away before the team is charged for a turn it won't run"
    ).toBeLessThan(meterAt)
  })
})
