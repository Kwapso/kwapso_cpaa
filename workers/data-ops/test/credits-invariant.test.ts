// Money-safety invariants for the agent credit meter, checked by READING the source
// off disk (like publish-seam) — so a future refactor of credits.ts can't quietly
// drop the guard that keeps a paid balance from going negative. The concurrency rule
// (CONCURRENCY.md): the PAID decrement must be atomic + never-negative; the FREE
// counter is deliberately best-effort (over-serving a free unit costs nothing).
//
// EVERY ASSERTION HERE IS POSITIONAL, and that is the whole point. The first version
// of this file asked `toMatch(/changes/)` — and credits.ts says "changes" in three
// places, so deleting the out-of-credits guard outright left the test GREEN. It also
// read the file WITH its comments, so `AGENT_FREE_DAILY` was satisfied by a sentence
// describing the knob rather than by code reading it. A guard that cannot go red is
// worse than no guard: it buys confidence without paying for it.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { stripComments } from "@shared/rules/source-scan"

const SRC = readFileSync(join(__dirname, "../src/lib/credits.ts"), "utf8")

/** Comments are NOT code: this file's comments DISCUSS every invariant below, so
 * an unstripped scan can be satisfied by prose describing the very line that was
 * deleted. The one shared stripper does it (shared/rules/source-scan.ts). */
const CODE = stripComments(SRC)

/** Where the PAID decrement is — every guard below is asserted RELATIVE to it, so
 * a sibling statement's `changes` can never stand in for this one's. */
const PAID_AT = CODE.indexOf("UPDATE agent_credits SET balance = balance - 1")
const AFTER_PAID = CODE.slice(PAID_AT, PAID_AT + 600)

describe("credit meter money-safety (source invariants)", () => {
  it("decrements the paid balance atomically and NEVER below zero", () => {
    // One UPDATE that both subtracts and guards `balance > 0` in the same statement —
    // so two concurrent spends can't drive real money negative (D1 applies each atomically).
    expect(PAID_AT, "the paid decrement statement must exist").toBeGreaterThan(-1)
    expect(
      AFTER_PAID.slice(0, 200),
      "the never-negative predicate must ride the decrementing UPDATE itself"
    ).toMatch(/UPDATE\s+agent_credits\s+SET\s+balance\s*=\s*balance\s*-\s*1[^"]*balance\s*>\s*0/i)
  })

  it("treats a no-op decrement (nothing changed) as out-of-credits, not success", () => {
    // If the guarded UPDATE changed 0 rows, the balance was already empty → refuse.
    // Asserted as: right after the paid UPDATE, a zero-changes test whose branch
    // returns ok:false. Delete that branch and the spend reports success on an
    // empty balance — which is exactly what this must catch.
    expect(
      AFTER_PAID,
      "after the paid UPDATE, zero changed rows must return ok:false (out of credits), never fall through to success"
    ).toMatch(/\(\s*res\.meta\.changes\s*\?\?\s*0\s*\)\s*===\s*0[\s\S]{0,160}?ok:\s*false/)
    // …and the refusal must come BEFORE the success return, or the guard is decoration.
    const refuseAt = AFTER_PAID.search(/ok:\s*false/)
    const succeedAt = AFTER_PAID.search(/source:\s*"credit"/)
    expect(refuseAt, "the out-of-credits refusal must precede the success return").toBeGreaterThan(-1)
    expect(refuseAt).toBeLessThan(succeedAt === -1 ? Number.MAX_SAFE_INTEGER : succeedAt)
  })

  it("keeps the free daily allowance configurable per env (AGENT_FREE_DAILY)", () => {
    // A hard-coded number here is the drift the docs kept tripping on — lock the knob:
    // the env var must be READ (through the numberVar seam), not merely mentioned.
    expect(CODE, "the cap must be read from the env var, not hard-coded").toMatch(
      /numberVar\(\s*env\.AGENT_FREE_DAILY\s*,\s*FREE_DAILY\s*\)/
    )
    expect(CODE, "the fallback constant must be a real exported number").toMatch(
      /export const FREE_DAILY\s*=\s*\d+/
    )
    // The gate that SPENDS a unit must consult the configurable cap — not just the
    // snapshot reader beside it. Two call sites; both are load-bearing.
    expect(
      (CODE.match(/numberVar\(\s*env\.AGENT_FREE_DAILY/g) ?? []).length,
      "both the quota snapshot and the consume gate must read the configured cap"
    ).toBeGreaterThanOrEqual(2)
  })
})
