// THE PROMISE THE RUNTIME CAN KEEP. The agent is TOLD a bulk cap (the tool schema
// declares maxItems, the prose repeats it) and the door ENFORCES that cap — but a
// third number decides whether the call ever arrives: how much the model may emit
// in one turn. If the declared cap doesn't fit under the reply ceiling, a
// perfectly-legal bulk call truncates mid-JSON: no error, no rows changed, a dead
// turn. So the cap is DERIVED from the ceiling in one file, and this test asserts
// the arithmetic still holds — including that the tool schemas declare the same
// number the door refuses past.

import { describe, expect, it } from "vitest"

import {
  AGENT_MAX_TOKENS,
  AGENT_REPLY_ENVELOPE_TOKENS,
  BULK_IDS_LIMIT,
  TOKENS_PER_EMITTED_ID,
} from "../../../shared/workers/limits"
import { TOOL_CATALOG } from "../src/lib/tools"

describe("the agent's reply ceiling and the bulk cap are one number", () => {
  it("a full bulk id list physically fits in one model turn", () => {
    const needed = BULK_IDS_LIMIT * TOKENS_PER_EMITTED_ID + AGENT_REPLY_ENVELOPE_TOKENS
    expect(
      needed,
      `a ${BULK_IDS_LIMIT}-id call needs ~${needed} tokens but the ceiling is ${AGENT_MAX_TOKENS} — the model would truncate mid-JSON`
    ).toBeLessThanOrEqual(AGENT_MAX_TOKENS)
  })

  it("the cap is derived from the ceiling, not hand-picked alongside it", () => {
    expect(BULK_IDS_LIMIT).toBe(Math.floor((AGENT_MAX_TOKENS - AGENT_REPLY_ENVELOPE_TOKENS) / TOKENS_PER_EMITTED_ID))
    // A ceiling raise must BUY capacity, or the derivation is decorative.
    expect(BULK_IDS_LIMIT, "the derived cap must leave a bulk write worth doing").toBeGreaterThanOrEqual(100)
  })

  it("every bulk tool schema declares that same derived cap", () => {
    const bulk = TOOL_CATALOG.filter((t) => {
      const ids = (t.schema as { properties?: Record<string, { type?: string; maxItems?: number }> }).properties?.ids
      return ids?.type === "array"
    })
    expect(bulk.length, "the bulk tools must be findable by their ids array").toBeGreaterThan(0)
    for (const t of bulk) {
      const ids = (t.schema as { properties: Record<string, { maxItems?: number }> }).properties.ids
      expect(ids.maxItems, `${t.name} must declare the derived cap, not a literal`).toBe(BULK_IDS_LIMIT)
    }
  })
})
