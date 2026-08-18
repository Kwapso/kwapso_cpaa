// A DOOR THAT SPENDS THE TEAM'S MONEY IS AN ASSISTANT DOOR.
//
// `POST /api/data-ops/import/batch/plan` runs a model turn and calls
// `consumeAiUnit`, which spends the free daily allowance and then decrements
// `agent_credits.balance` — credits the owner PAID for. It opened with
// `requireAnyImportRight` and nothing else, so the `agent` module gated the
// assistant everywhere except the one import step that is an assistant.
//
// That is not a theoretical gap: MCP.md §1 recommends, by name, issuing a token
// with import rights and NO agent access as "the safe, zero-AI-cost choice". A
// token created on that advice could loop this door and take the balance to zero
// — and could not even read `get_ai_allowance` to see it happening, because that
// read needs `agent:read`.
//
// Read off the door's own source rather than mocked: what is under test is which
// gates the handler OPENS WITH, and in what order relative to the spend.
//
// IT READS TWO WORKERS NOW, and the second one is why the scan had to widen. The
// knowledge base WRITES its answer (R23) on a cheap model, in the CONTENT worker,
// and that spends the same allowance out of the same two tables — so a law that
// only ever looked at data-ops would have graded the one worker it already knew
// about. The denominator is "every route file that calls consumeAiUnit", derived
// from the routes themselves, so the next worker that starts spending is judged
// the day it does.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { stripComments } from "@shared/rules/source-scan"
import { indexFunctions } from "@shared/rules/seam-scan"

/** Every worker whose routes could spend the allowance. Named, not globbed, so a
 * new worker that starts spending is a deliberate line here rather than a silent
 * addition — and `finds the spenders` below proves each one is really being read. */
const ROUTE_DIRS = [
  join(__dirname, "..", "src", "routes"),
  join(__dirname, "..", "..", "content", "src", "routes"),
]

/** Every handler in those routes/ that spends an AI unit, found by its own source. */
const spenders = ROUTE_DIRS.flatMap((dir) =>
  [...indexFunctions(dir).entries()].filter(([, body]) => stripComments(body).includes("consumeAiUnit("))
)

describe("every door that spends the AI allowance gates on the agent module", () => {
  it("finds the spenders (the scan itself must not go blind)", () => {
    expect(
      spenders.map(([name]) => name),
      "no handler calls consumeAiUnit — the scan has stopped seeing the metered doors"
    ).toContain("postBatchPlan")
    // …and the second worker's spender, so widening the scan cannot silently
    // narrow back to one directory.
    expect(
      spenders.map(([name]) => name),
      "the content worker's answer-writer must be in the census — it spends the same allowance"
    ).toContain("payToWrite")
  })

  it("each one opens with requireRight(agent) BEFORE it spends", () => {
    for (const [name, body] of spenders) {
      const code = stripComments(body)
      const gate = code.search(/requireRight\(\s*cfg,\s*guard,\s*"agent"/)
      expect(gate, `${name} spends the team's AI credits without gating on the agent module`).toBeGreaterThan(-1)
      const spend = code.indexOf("consumeAiUnit(")
      expect(spend, `${name} should call consumeAiUnit`).toBeGreaterThan(-1)
      expect(gate, `${name} gates on agent AFTER it has already spent — the gate must come first`).toBeLessThan(spend)
    }
  })
})

// The other half of the same sweep: a read gated on one module must not ship
// another module's rows. Kept here beside it because both are "the gate at the
// door does not match what the door hands back".
describe("the account detail does not ship the logins module under accounts:read", () => {
  const src = stripComments(
    readFileSync(join(__dirname, "..", "..", "tenancy", "src", "routes", "accounts.ts"), "utf8")
  )
  const handler = src.slice(src.indexOf("export async function getAccountDetail"))
  const body = handler.slice(0, handler.indexOf("\nexport "))

  it("resolves the portal_users right before answering with portal users", () => {
    expect(body).toContain(`hasRight(cfg, guard, "portal_users", "read")`)
    // …and actually USES it on both the rows and the count, rather than reading
    // the right and shipping the rows anyway.
    expect(body).toMatch(/portalUsers:\s*maySeeLogins\s*\?/)
    expect(body).toMatch(/portalUsersTotal:\s*maySeeLogins\s*\?/)
  })
})
