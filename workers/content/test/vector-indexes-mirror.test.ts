// A FRESH ENVIRONMENT BUILT WRONG, UNDER A GREEN BUILD.
//
// Vectorize will not index retrospectively: an index created without a
// metadata property can never filter on it, and the fix is to rebuild the
// index and re-embed everything. BOOTSTRAP.md's setup block creates them one
// `wrangler` line at a time, and it mirrors `METADATA_INDEXES` (beside
// `VectorLabels`) BY HAND — which the doc says out loud, because until now
// nothing read that constant at all. So a tenth label could be added to the
// code, shipped green, and the next environment stood up without it: the
// failure would surface months later as a filter that silently matches
// nothing, on data that has to be re-embedded to fix.
//
// This is the check the docstring used to promise. Named by the round-three
// lean review as the highest consequence per point on its list.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { METADATA_INDEXES } from "../src/lib/knowledge-vectors"

const BOOTSTRAP = readFileSync(join(__dirname, "..", "..", "..", "BOOTSTRAP.md"), "utf8")

describe("the runbook's Vectorize indexes mirror the code's", () => {
  /** Every `create-metadata-index` line in the runbook, as (property, type). */
  function fromRunbook(): { property: string; type: string }[] {
    return [
      ...BOOTSTRAP.matchAll(
        /create-metadata-index[^\n]*--property-name=(\S+)\s*--type=(\w+)/g
      ),
    ].map((m) => ({ property: m[1], type: m[2] }))
  }

  it("names the same properties, with the same types, in the same order", () => {
    const runbook = fromRunbook()
    // Tripwire: a runbook whose block moved or was reformatted must fail LOUD
    // rather than pass by matching nothing.
    expect(runbook.length, "BOOTSTRAP.md's create-metadata-index block did not parse").toBeGreaterThan(3)
    expect(
      runbook,
      "BOOTSTRAP.md's Vectorize block and METADATA_INDEXES disagree — a new environment " +
        "would be stood up with the wrong filters, and Vectorize cannot add one afterwards " +
        "(the index must be rebuilt and everything re-embedded). Edit both."
    ).toEqual(METADATA_INDEXES.map((i) => ({ property: String(i.property), type: i.type })))
  })

  it("leaves room: Vectorize allows ten metadata indexes per index", () => {
    // The runbook's own note says the tenth slot is deliberately free. If a
    // tenth is ever spent, that sentence has to move too — this is what makes
    // spending it a decision rather than an accident.
    expect(METADATA_INDEXES.length).toBeLessThanOrEqual(10)
  })
})
