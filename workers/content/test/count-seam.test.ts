// THE BOUNDED COUNT SEAM (R16, amended 2026-08-14) — the behaviour the law's
// source-scan cannot see. The scan proves every growing collection CALLS this
// seam; this proves the seam does what the law says when it is called.
//
// Three properties, and each one is a way the amendment could have gone wrong:
//   • the scan is BOUNDED, and by the one shared cap — a door counting to its own
//     number is how a badge and a door come to disagree;
//   • it can only do LESS work than an unbounded count, which was the owner's
//     condition — so the ceiling must ride the INNER query, never the outer one;
//   • it never over-claims SIZE. At the ceiling it reports the ceiling, which the
//     badge renders "1m+" — over-claiming uncertainty by a row, never rows.

import { beforeEach, describe, expect, it, vi } from "vitest"

// The transport is the only thing stubbed: `d1Query` records the statement it was
// handed and answers a canned row. That is the whole point of this suite — the
// property under test is the SQL the seam builds, so reading it back is the test.
const seen = vi.hoisted(() => ({
  sql: "",
  params: [] as unknown[],
  row: {} as Record<string, unknown>,
  /** Per-database answers, for the sharded case: databaseId -> count. */
  perDb: null as Record<string, number> | null,
}))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  return {
    ...actual,
    d1Query: async (_cfg: unknown, db: string, sql: string, params: unknown[] = []) => {
      seen.sql = sql
      seen.params = params
      if (seen.perDb) return [{ n: seen.perDb[db] ?? 0 }]
      return Object.keys(seen.row).length ? [seen.row] : []
    },
  }
})

import {
  boundedInner,
  countCollection,
  countCollectionAcross,
  countCollectionWith,
  isCapped,
  reportedTotal,
} from "@shared/workers/count"
import { TOTAL_COUNT_CAP } from "@shared/workers/limits"
import type { D1Rest } from "@shared/workers/d1-rest"

const cfg = { accountId: "acct", apiToken: "tok" } satisfies D1Rest

/** Arrange the one row the door will answer with. */
function answers(row: Record<string, unknown>): void {
  seen.row = row
}

beforeEach(() => {
  seen.sql = ""
  seen.params = []
  seen.row = {}
  seen.perDb = null
})

describe("the bounded count seam (R16, amended)", () => {
  it("bounds the INNER query — so it can only ever do LESS work than before", () => {
    const inner = boundedInner("SELECT 1 FROM activity WHERE team_id = ?")
    // The LIMIT sits inside the subquery being counted, not on the COUNT — a
    // `LIMIT` on the outer aggregate bounds a one-row result and stops nothing.
    expect(inner).toBe(`(SELECT 1 FROM activity WHERE team_id = ? LIMIT ${TOTAL_COUNT_CAP + 1})`)
    // CAP + 1, not CAP: the spare row is how "exactly at the cap" is told from
    // "past it" without a second query — the same trick toPage uses for hasMore.
    expect(inner).toContain(String(TOTAL_COUNT_CAP + 1))
  })

  it("counts through one statement, with the caller's params untouched", async () => {
    answers({ n: 42 })
    const total = await countCollection(cfg, "db1", "SELECT 1 FROM meetings WHERE account_id = ?", ["a1"])
    expect(total).toBe(42)
    expect(seen.sql).toBe(
      `SELECT COUNT(*) AS n FROM (SELECT 1 FROM meetings WHERE account_id = ? LIMIT ${TOTAL_COUNT_CAP + 1})`
    )
    expect(seen.params, "the fence's parameters ride through unchanged").toEqual(["a1"])
  })

  it("below the ceiling the number is EXACT — the amendment's whole premise", async () => {
    // Every collection that exists today is here: the largest on staging (the
    // activity feed) is 2,253 rows. None of these may be touched by the cap.
    for (const n of [0, 1, 222, 858, 2_253, 24_011, 100_000, TOTAL_COUNT_CAP - 1]) {
      answers({ n })
      expect(await countCollection(cfg, "db1", "SELECT 1 FROM activity"), `${n} must be exact`).toBe(n)
      expect(isCapped(n), `${n} is not a capped total`).toBe(false)
    }
  })

  it("at and past the ceiling it reports the ceiling, and says so", async () => {
    for (const n of [TOTAL_COUNT_CAP, TOTAL_COUNT_CAP + 1, 9_000_000]) {
      answers({ n })
      const total = await countCollection(cfg, "db1", "SELECT 1 FROM activity")
      expect(total, "never reports more than it counted to").toBe(TOTAL_COUNT_CAP)
      expect(isCapped(total)).toBe(true)
    }
    // The direction matters: a collection holding EXACTLY the cap wears a "+" it
    // has not quite earned. Over-claiming UNCERTAINTY by one row is safe; the
    // opposite — a "1m" that is really 4m — is the failure R16 exists to prevent.
    expect(reportedTotal(TOTAL_COUNT_CAP)).toBe(TOTAL_COUNT_CAP)
    expect(reportedTotal(5)).toBe(5)
  })

  it("a missing row is zero, not a crash", async () => {
    answers({})
    expect(await countCollection(cfg, "db1", "SELECT 1 FROM activity")).toBe(0)
  })

  it("countCollectionWith computes several numbers over the SAME bounded set", async () => {
    answers({ total: 12, mine: 5 })
    const row = await countCollectionWith<{ total: number; mine: number }>(
      cfg,
      "db1",
      "SELECT (creator_id = ?) AS is_mine FROM help WHERE archived_at IS NULL",
      "COUNT(*) AS total, SUM(is_mine) AS mine",
      ["u1"]
    )
    expect(row).toEqual({ total: 12, mine: 5 })
    expect(seen.sql).toBe(
      "SELECT COUNT(*) AS total, SUM(is_mine) AS mine FROM " +
        `(SELECT (creator_id = ?) AS is_mine FROM help WHERE archived_at IS NULL LIMIT ${TOTAL_COUNT_CAP + 1})`
    )
    // It does NOT clamp on the caller's behalf. Two numbers come back and only
    // the caller knows which is a count — guessing is how the wrong one gets
    // clamped, and clamping a SUM is how a display cap becomes a billing error.
    expect(row?.mine, "returned as counted; the caller clamps what it knows is a count").toBe(5)
  })
})

// THE ONE AGGREGATE THAT CAN BE MERGED. `d1QueryAcross` refuses aggregates across
// shards because every caller reads `rows[0]`, so a split module would report the
// FIRST shard's count as the whole total. A collection count is the exception, and
// the reason is structural rather than convenient: a row lives in exactly one
// shard, so the total is the SUM, with nothing to order or de-duplicate. A PAGE
// still cannot be merged — its rows must be ordered BETWEEN shards and its cursor
// is a position in an ordering no single shard has — so paging stays refused.
describe("counting across a split module's shards", () => {
  it("sums the shards — exact whenever the true total is under the ceiling", async () => {
    seen.perDb = { a: 120, b: 33, c: 0 }
    expect(await countCollectionAcross(cfg, ["a", "b", "c"], "SELECT 1 FROM activity")).toBe(153)
  })

  it("one database is the ordinary case and answers exactly", async () => {
    seen.perDb = { solo: 2_253 }
    expect(await countCollectionAcross(cfg, ["solo"], "SELECT 1 FROM activity")).toBe(2_253)
  })

  it("SUMS BEFORE IT CLAMPS — clamping each shard first would lose the total", async () => {
    // Three honest, untruncated shards that add up past the ceiling. Had each been
    // clamped on its own, every one would have passed through untouched and the
    // sum would have quietly exceeded the number the badge is allowed to show.
    const each = Math.floor(TOTAL_COUNT_CAP * 0.4)
    seen.perDb = { a: each, b: each, c: each }
    const total = await countCollectionAcross(cfg, ["a", "b", "c"], "SELECT 1 FROM activity")
    expect(each * 3, "the fixture really does cross the ceiling").toBeGreaterThan(TOTAL_COUNT_CAP)
    expect(total).toBe(TOTAL_COUNT_CAP)
    expect(isCapped(total)).toBe(true)
  })

  it("a truncated shard makes the whole answer a floor, never an over-claim", async () => {
    seen.perDb = { a: TOTAL_COUNT_CAP + 1, b: 5 }
    const total = await countCollectionAcross(cfg, ["a", "b"], "SELECT 1 FROM activity")
    expect(total).toBe(TOTAL_COUNT_CAP)
    expect(isCapped(total)).toBe(true)
  })

  it("no shards is zero, not a crash", async () => {
    seen.perDb = {}
    expect(await countCollectionAcross(cfg, [], "SELECT 1 FROM activity")).toBe(0)
  })
})
