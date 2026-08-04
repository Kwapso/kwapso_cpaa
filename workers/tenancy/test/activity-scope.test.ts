// R18, the part a source-scan cannot see. The team activity feed is the one read
// that returns EVERY module's rows behind a single gate, so its visibility filter
// is load-bearing — and the way it failed was not a missing gate but an omission:
// `?scope=user` with no `id` matched no branch, left the WHERE empty, and handed
// the whole team's cross-module history (with before→after values) to anyone with
// team_members:read. A scan that asserts "the clause exists" stays green through
// that. So this test RUNS the reader over every scope/id shape it can be called
// with and asserts the SQL that comes out is never an unfiltered whole-table read.

import { beforeEach, describe, expect, it, vi } from "vitest"

const queries: string[] = []
vi.mock("../../../shared/workers/d1-rest", () => ({
  d1Query: vi.fn(async (_cfg: unknown, _db: string, sql: string) => {
    queries.push(sql)
    return sql.includes("COUNT(*)") ? [{ n: 0 }] : []
  }),
}))

const { getActivity } = await import("../src/lib/activity-read")

const cfg = {} as never
const guard = { databaseId: "db", teamId: "t", userId: "u" } as never
/** the caller may read ONE module — the R18 filter must appear in every read. */
const ALLOWED = ["learning"]

/** true when a statement reads the feed with no WHERE at all. */
const unfiltered = (sql: string) => /FROM activity(?!\s|\S)/.test(sql) || !/WHERE/i.test(sql)

beforeEach(() => (queries.length = 0))

describe("activity scopes fail CLOSED (R18)", () => {
  it("the team feed always carries the visibility filter", async () => {
    await getActivity(cfg, guard, "team", undefined, undefined, ALLOWED)
    expect(queries.length).toBeGreaterThan(0)
    for (const q of queries) {
      expect(q, `unfiltered team read: ${q}`).toMatch(/WHERE/i)
      expect(q, "the R18 clause must ride BOTH the page read and the COUNT").toContain("related_table")
    }
  })

  it("an id-scope with NO id returns nothing — never the whole feed", async () => {
    for (const scope of ["user", "role", "invite", "record"] as const) {
      queries.length = 0
      const out = await getActivity(cfg, guard, scope, undefined, undefined, null)
      expect(out.rows, `${scope} without an id must return no rows`).toEqual([])
      expect(out.total, `${scope} without an id must report no total`).toBe(0)
      expect(queries.filter(unfiltered), `${scope} without an id issued an unfiltered read`).toEqual([])
    }
  })

  it("a record scope with no table returns nothing", async () => {
    const out = await getActivity(cfg, guard, "record", "row1", undefined, null)
    expect(out.rows).toEqual([])
    expect(queries.filter(unfiltered)).toEqual([])
  })

  it("an UNKNOWN scope string still gets the team filter, never a bare read", async () => {
    // The route validates the scope, but the reader must not depend on that:
    // two independent layers, because the cost of this one being wrong is a leak.
    await getActivity(cfg, guard, "everything" as never, undefined, undefined, ALLOWED)
    for (const q of queries) expect(q, `unfiltered read for an unknown scope: ${q}`).toMatch(/WHERE/i)
  })

  it("a caller allowed NOTHING sees only rows that name no record", async () => {
    await getActivity(cfg, guard, "team", undefined, undefined, [])
    for (const q of queries) expect(q).toContain("related_table IS NULL")
  })

  it("an id-scope WITH its id is scoped to that record", async () => {
    queries.length = 0
    await getActivity(cfg, guard, "user", "user-9", undefined, null)
    expect(queries.every((q) => /related_table = 'users'/.test(q))).toBe(true)
  })
})
