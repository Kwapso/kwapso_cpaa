// A CONCATENATION CANNOT PAGE, SORT OR COUNT.
//
// `d1QueryAcross` runs one statement against several databases and returns every
// row as one list. That is exactly right for "give me the rows", and quietly wrong
// for the three shapes below — each of which looks like it works while there is
// only ONE database, which is every environment until the mover runs:
//
//   • LIMIT n     → each shard returns up to n, so the caller gets the top n OF
//                   EACH shard, up to n × shards rows. A keyset page built on that
//                   has the wrong rows in it and takes its `nextCursor` from the
//                   last row of a concatenation — a position in no shard's order.
//                   Page two repeats and skips, silently.
//   • ORDER BY    → sorted within each shard, unsorted between them.
//   • COUNT(…)    → one row per shard, and every caller in this base reads
//                   `rows[0].n`. R16's exact total would report the FIRST shard's
//                   count as the whole thing.
//
// Nothing paged goes through the split path today, so this refuses nothing that
// currently runs. It is the tripwire for the day somebody points a paged or counted
// read at it and gets a plausible answer.

import { describe, expect, it, vi, afterEach } from "vitest"

import { d1QueryAcross } from "@shared/workers/d1-rest"

const CFG = { accountId: "a", apiToken: "t" }

afterEach(() => vi.unstubAllGlobals())

/** Every database answers one row, so a concatenation is visibly a concatenation. */
function stubShards() {
  vi.stubGlobal("fetch", async () =>
    new Response(JSON.stringify({ success: true, errors: [], result: [{ results: [{ n: 1 }] }] }), {
      status: 200,
    })
  )
}

describe("one database is a plain read — nothing is refused", () => {
  it("allows a LIMIT, an ORDER BY and a COUNT against a single database", async () => {
    stubShards()
    // Every read in the base today is this call. It must be untouched.
    await expect(
      d1QueryAcross(CFG, ["only"], "SELECT COUNT(*) AS n FROM help ORDER BY created_at DESC LIMIT 51")
    ).resolves.toEqual([{ n: 1 }])
  })
})

describe("two or more databases refuse what a concatenation cannot answer", () => {
  const SHARDS = ["one", "two"]

  it("refuses a LIMIT", async () => {
    stubShards()
    await expect(d1QueryAcross(CFG, SHARDS, "SELECT id FROM help LIMIT 51")).rejects.toThrow(/LIMIT/)
  })

  it("refuses an ORDER BY", async () => {
    stubShards()
    await expect(
      d1QueryAcross(CFG, SHARDS, "SELECT id FROM help ORDER BY created_at DESC")
    ).rejects.toThrow(/ORDER BY/)
  })

  it("refuses an aggregate — the one that would make R16's exact count wrong", async () => {
    stubShards()
    for (const sql of [
      "SELECT COUNT(*) AS n FROM help",
      "SELECT SUM(minutes) AS n FROM work_logs",
      "SELECT MAX(rank) AS top FROM stories",
    ])
      await expect(d1QueryAcross(CFG, SHARDS, sql)).rejects.toThrow(/aggregate/)
  })

  it("still allows a plain row read across shards — the thing the path is FOR", async () => {
    stubShards()
    await expect(
      d1QueryAcross(CFG, SHARDS, "SELECT id, title FROM help WHERE account_id = ?", ["A1"])
    ).resolves.toEqual([{ n: 1 }, { n: 1 }])
  })

  it("says what to do instead, not just that it refused", async () => {
    stubShards()
    await expect(d1QueryAcross(CFG, SHARDS, "SELECT id FROM help LIMIT 5")).rejects.toThrow(
      /read one database, or give this path a real merge/i
    )
  })
})
