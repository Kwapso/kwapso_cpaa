// THE WRITE HALF OF THE VECTOR CONTRACT — a batch is only correct against a limit.
//
// `knowledge-vectors.ts` sends its writes in batches, and the loop that does it
// has always been right. The NUMBER was wrong: 200 ids per delete against a
// service that accepts 100, carried by a comment that said "same ceiling, same
// reasoning" about an endpoint with a different ceiling. Vectorize takes 1,000
// vectors per upsert and exactly 100 ids per delete.
//
// It shipped because nothing here was measuring a limit. The stand-in
// implemented the search contract exactly — a namespace really does partition,
// metadata really is withheld — and implemented the write contract not at all:
// `deleteByIds` took an array of any length and did the sensible thing with it.
// Every suite in this folder exercised the batching loop, and none of them could
// tell 100 from 200 from a million, because both batch sizes leave the index in
// precisely the same state. The only difference is the number of CALLS, which
// nothing recorded.
//
// So this suite asserts on the calls, and the stand-in now refuses an oversized
// one exactly as the service does. What it cost: a source with 110 pieces threw
// `VECTOR_DELETE_ERROR (code = 40007)` and took the whole re-index down with it,
// so the knowledge base stopped rebuilding on the first big document while every
// small one kept working.
//
// SABOTAGE (run, watched go red, restored):
//   • DELETE_BATCH back to 200 → "the delete of a source bigger than one batch"
//     fails with the service's own words: too many ids in payload; max id count
//     is 100, got 110. Which is the production error, in a test, before a deploy.
//   • drop the `for` loop in deleteVectors and pass `ids` straight through →
//     same failure. The loop and the constant are checked together, because
//     either one alone is the bug.
//   • UPSERT_BATCH to 1001 → "an upsert never exceeds what Vectorize accepts"
//     fails. That limit has never been breached in production; it is here so the
//     next person to change a batch size finds out from a test.

import { describe, expect, it } from "vitest"

import { deleteVectors, upsertVectors } from "../src/lib/knowledge-vectors"
import type { Env } from "../src/env"
import type { MemberGuard } from "@shared/workers/gating"
import { fakeVectorize } from "./fake-vectorize"

const guard = { teamId: "team_01TEST", memberId: "mem_01TEST" } as unknown as MemberGuard

/** 110 ids is not an arbitrary number: it is the size that failed in production,
 * one record cover plus 109 pieces of one document. */
const OVERSIZED = 110

function harness() {
  const index = fakeVectorize()
  const env = { KNOWLEDGE_INDEX: index.binding } as unknown as Env
  return { index, env }
}

describe("vector writes are batched to what Vectorize actually accepts", () => {
  it("the delete of a source bigger than one batch is split, not refused", async () => {
    const { index, env } = harness()
    const ids = Array.from({ length: OVERSIZED }, (_, i) => `chunk_${i}`)

    // The assertion is that this RESOLVES. Before the fix it rejected with the
    // service's own 40007, which is the failure the owner saw on the screen.
    await expect(deleteVectors(env, ids)).resolves.toBeUndefined()

    const calls = index.writes().filter((w) => w.kind === "delete")
    expect(calls.length).toBe(2)
    expect(calls.every((c) => c.count <= 100)).toBe(true)
    // and every id was actually asked for — a split that drops the remainder
    // would satisfy everything above.
    expect(calls.reduce((n, c) => n + c.count, 0)).toBe(OVERSIZED)
  })

  it("a delete that fits in one batch still goes out as one call", async () => {
    const { index, env } = harness()
    await deleteVectors(
      env,
      Array.from({ length: 100 }, (_, i) => `chunk_${i}`)
    )
    expect(index.writes().filter((w) => w.kind === "delete").length).toBe(1)
  })

  it("an upsert never exceeds what Vectorize accepts, and writes every row", async () => {
    const { index, env } = harness()
    const rows = Array.from({ length: 450 }, (_, i) => ({
      id: `chunk_${i}`,
      values: [1, 0, 0],
      labels: { owner: "team" },
    })) as unknown as Parameters<typeof upsertVectors>[2]

    const written = await upsertVectors(env, guard, rows)

    expect(written).toBe(450)
    expect(index.ids().length).toBe(450)
    expect(index.writes().filter((w) => w.kind === "upsert").every((c) => c.count <= 1000)).toBe(true)
  })

  it("the stand-in refuses an oversized call, so a wrong batch size cannot pass", async () => {
    const { index } = harness()
    // Straight at the binding, bypassing the batching seam: this is the check
    // that the INSTRUMENT works. If this passes, the three tests above are
    // measuring nothing at all.
    await expect(
      index.binding.deleteByIds(Array.from({ length: 101 }, (_, i) => `chunk_${i}`))
    ).rejects.toThrow(/max id count is 100, got 101/)
  })
})
