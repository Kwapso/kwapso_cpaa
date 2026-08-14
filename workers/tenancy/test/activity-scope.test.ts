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
/** the bound values too: the fixed scopes now name their table as a PARAMETER
 * (they are the generic read with the table supplied by the scope), so a check
 * that only reads SQL text could no longer see which record was asked for. */
const bindings: unknown[][] = []
vi.mock("@shared/workers/d1-rest", () => ({
  d1Query: vi.fn(async (_cfg: unknown, _db: string, sql: string, params: unknown[] = []) => {
    queries.push(sql)
    bindings.push(params)
    return sql.includes("COUNT(*)") ? [{ n: 0 }] : []
  }),
  // THE REAL ONE, deliberately. The fence renders its account ids as literals
  // rather than binding them (D1 refuses a statement past 100 bound parameters,
  // and the activity clause carries the set three times) — so a stubbed
  // `sqlString` would let this suite pass over SQL that no longer escapes
  // anything. The assertions below read the clause as text; they must read the
  // text the door actually sends.
  sqlString: (value: unknown) =>
    value === null || value === undefined ? "NULL" : `'${String(value).replaceAll("'", "''")}'`,
}))

const { getActivity } = await import("../src/lib/activity-read")

const cfg = {} as never
const guard = { databaseId: "db", teamId: "t", userId: "u" } as never
/** the caller may read ONE module — the R18 filter must appear in every read. */
const ALLOWED = ["learning"]

/** A client login standing in one company, and the agency side. */
const PORTAL = {
  kind: "portal",
  personAccountId: "A_ME",
  appRestriction: null,
  roots: ["A_MINE"],
  currentAccountId: "A_MINE",
  accountIds: ["A_MINE", "A_ME"],
} as never
const STAFF = { kind: "staff" } as never

/** true when a statement reads the feed with no WHERE at all. */
const unfiltered = (sql: string) => /FROM activity(?!\s|\S)/.test(sql) || !/WHERE/i.test(sql)

beforeEach(() => {
  queries.length = 0
  bindings.length = 0
})

describe("activity scopes fail CLOSED (R18)", () => {
  it("the team feed always carries the visibility filter", async () => {
    await getActivity(cfg, guard, "team", undefined, undefined, ALLOWED, null, STAFF)
    expect(queries.length).toBeGreaterThan(0)
    for (const q of queries) {
      expect(q, `unfiltered team read: ${q}`).toMatch(/WHERE/i)
      expect(q, "the R18 clause must ride BOTH the page read and the COUNT").toContain("related_table")
    }
  })

  it("an id-scope with NO id returns nothing — never the whole feed", async () => {
    for (const scope of ["user", "role", "invite", "record"] as const) {
      queries.length = 0
      const out = await getActivity(cfg, guard, scope, undefined, undefined, null, null, STAFF)
      expect(out.rows, `${scope} without an id must return no rows`).toEqual([])
      expect(out.total, `${scope} without an id must report no total`).toBe(0)
      expect(queries.filter(unfiltered), `${scope} without an id issued an unfiltered read`).toEqual([])
    }
  })

  it("a record scope with no table returns nothing", async () => {
    const out = await getActivity(cfg, guard, "record", "row1", undefined, null, null, STAFF)
    expect(out.rows).toEqual([])
    expect(queries.filter(unfiltered)).toEqual([])
  })

  it("an UNKNOWN scope string still gets the team filter, never a bare read", async () => {
    // The route validates the scope, but the reader must not depend on that:
    // two independent layers, because the cost of this one being wrong is a leak.
    await getActivity(cfg, guard, "everything" as never, undefined, undefined, ALLOWED, null, STAFF)
    for (const q of queries) expect(q, `unfiltered read for an unknown scope: ${q}`).toMatch(/WHERE/i)
  })

  it("a caller allowed NOTHING sees only rows that name no record", async () => {
    await getActivity(cfg, guard, "team", undefined, undefined, [], null, STAFF)
    for (const q of queries) expect(q).toContain("related_table IS NULL")
  })

  it("an id-scope WITH its id is scoped to that record", async () => {
    await getActivity(cfg, guard, "user", "user-9", undefined, null, null, STAFF)
    expect(queries.length).toBeGreaterThan(0)
    expect(queries.every((q) => /related_table = \? AND related_row_id = \?/.test(q))).toBe(true)
    // BOTH statements — the page read and the COUNT — name the same one record.
    for (const params of bindings) expect(params.slice(0, 2)).toEqual(["users", "user-9"])
  })
})

// THE SECOND LEAK, at the reader. The record scope's fence was applied only when
// the table was one the ACCOUNTS module owns, so `table=help` — a table a client
// login reaches every day — carried no fence at all, and the WHERE was two
// caller-supplied values. The fence is now decided by the table for EVERY table,
// on EVERY (table, id) scope, and closes on the ones nobody has decided about.
describe("a client login's record reads are fenced on every table (the help leak)", () => {
  /** the account clause names the account tables; `0 = 1` is the closed answer. */
  const fenced = (sql: string) => /related_table = 'accounts'/.test(sql) || /0 = 1/.test(sql)

  it("every table the feed answers about carries a fence for a portal caller", async () => {
    for (const table of ["help", "learning", "selectable_data", "users", "member_roles", "invite_logs", "accounts", "account_links", "portal_users"]) {
      queries.length = 0
      await getActivity(cfg, guard, "record", "row-1", table, null, null, PORTAL)
      expect(queries.length, `${table} issued no read at all`).toBeGreaterThan(0)
      for (const q of queries)
        expect(fenced(q), `record scope on "${table}" read with NO fence: ${q}`).toBe(true)
    }
  })

  it("a table nobody has decided about is CLOSED, not open", async () => {
    await getActivity(cfg, guard, "record", "row-1", "invoices", null, null, PORTAL)
    for (const q of queries) expect(q, `an undecided table read openly: ${q}`).toContain("0 = 1")
  })

  it("help — the table the leak went through — reads NOTHING for a client login", async () => {
    await getActivity(cfg, guard, "record", "ticket-1", "help", null, null, PORTAL)
    for (const q of queries) expect(q).toContain("0 = 1")
  })

  it("the fixed scopes (user / role / invite) are fenced too — they were not", async () => {
    for (const scope of ["user", "role", "invite"] as const) {
      queries.length = 0
      await getActivity(cfg, guard, scope, "row-1", undefined, null, null, PORTAL)
      for (const q of queries) expect(q, `the ${scope} scope carried no fence: ${q}`).toContain("0 = 1")
    }
  })

  it("an account-owned record still resolves to the caller's own world", async () => {
    await getActivity(cfg, guard, "record", "A_MINE", "accounts", null, null, PORTAL)
    for (const q of queries) {
      expect(q).toContain("related_table = 'accounts'")
      expect(q, "a closed answer would lock the client out of their own history").not.toContain("0 = 1")
    }
    // The ROW ID is still bound (it arrives from the caller); the fence's own
    // account ids are literals in the clause above. Both halves are asserted, so
    // neither can quietly change into the other.
    for (const params of bindings) expect(params).toContain("A_MINE")
    for (const q of queries)
      expect(q, "the fence's ids are literals, not bound parameters").toContain("'A_MINE'")
  })

  it("STAFF are not fenced (a fence that refuses everybody is a broken door)", async () => {
    for (const table of ["help", "accounts"]) {
      queries.length = 0
      await getActivity(cfg, guard, "record", "row-1", table, null, null, STAFF)
      for (const q of queries) expect(q, `staff were fenced out of ${table}: ${q}`).not.toContain("0 = 1")
    }
  })
})
