// THE DOOR CHOOSES ITS PIPE BY DATABASE ID, AND BY NOTHING ELSE.
//
// Team databases are reached over Cloudflare's REST API because a database made
// at runtime cannot be named in a config that shipped before it existed. That
// door costs ~400ms per statement (measured, staging, 24 Aug 2026) for SQL the
// database itself finishes in about one millisecond. Where a deployment DOES
// hold a binding for a team's database, the same statement goes direct.
//
// The owner approved this on one condition: that it "doesn't break any of our
// architecture security rules and does not expose unnecessary data to people who
// don't need it". These are that condition, written down.
//
// THE ARGUMENT, IN ONE LINE: the native map is keyed by DATABASE ID, and the
// only database id that reaches the data door is `guard.databaseId` — read by
// `requireMember` out of the `teams` row for the team the caller belongs to.
// So the direct path is reachable exactly where the REST path was reachable, by
// exactly the same caller, for exactly the same rows. What follows proves the
// keying really is by id (an unknown id finds nothing and falls through), that
// parameters are still bound rather than pasted, and that an env with no
// bindings behaves precisely as the app did before any of this existed.

import { describe, expect, it, vi } from "vitest"

import { d1Query, type D1Rest } from "@shared/workers/d1-rest"
import { nativeTeamDatabases } from "@shared/workers/gating"

const OURS = "727537f7-aaaa-bbbb-cccc-000000000001"
const THEIRS = "727537f7-aaaa-bbbb-cccc-000000000002"

/** A stand-in for a D1 binding that records how it was called. */
function fakeBinding(rows: Record<string, unknown>[]) {
  const calls: { sql: string; params: unknown[] }[] = []
  const binding = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          calls.push({ sql, params })
          return { all: async () => ({ results: rows }) }
        },
      }
    },
    exec: async () => undefined,
  }
  return { binding, calls }
}

/** A config with no bindings at all — the shape every environment had before
 * this existed, and the shape a newly created team still has. */
function restOnly(): D1Rest {
  return { accountId: "acct", apiToken: "token" }
}

describe("the direct path is chosen by database id", () => {
  it("a database this deployment binds is read WITHOUT the REST door", async () => {
    const { binding, calls } = fakeBinding([{ id: "R1" }])
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const cfg: D1Rest = { ...restOnly(), natives: { [OURS]: binding as never } }

    const rows = await d1Query(cfg, OURS, "SELECT id FROM roles WHERE team_id = ?", ["T1"])

    expect(rows).toEqual([{ id: "R1" }])
    expect(calls).toHaveLength(1)
    expect(fetchSpy, "nothing may go out to the management API").not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it("the parameters are still BOUND, never pasted into the statement", async () => {
    // The whole of R20 rests on untrusted text never becoming SQL. Changing the
    // pipe must not change that, so the needle arrives as a parameter and the
    // statement still carries its placeholder.
    const { binding, calls } = fakeBinding([])
    const cfg: D1Rest = { ...restOnly(), natives: { [OURS]: binding as never } }
    const needle = "'; DROP TABLE roles; --"

    await d1Query(cfg, OURS, "SELECT id FROM roles WHERE name = ?", [needle])

    expect(calls[0].params).toEqual([needle])
    expect(calls[0].sql, "the statement is the one we wrote").toBe(
      "SELECT id FROM roles WHERE name = ?"
    )
    expect(calls[0].sql).not.toContain("DROP TABLE")
  })

  it("a database this deployment does NOT bind falls through, and is still fenced to that id", async () => {
    // The fall-through is the property that lets a team created after the last
    // deploy keep working. It must ask for THAT team's database and no other.
    const { binding } = fakeBinding([])
    const cfg: D1Rest = { ...restOnly(), natives: { [OURS]: binding as never } }
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true, errors: [], result: [{ results: [] }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )

    await d1Query(cfg, THEIRS, "SELECT 1", [])

    const url = String(fetchSpy.mock.calls[0][0])
    expect(url, "the REST call names the database it was asked for").toContain(THEIRS)
    expect(url, "and never the one we happen to hold a binding for").not.toContain(OURS)
    fetchSpy.mockRestore()
  })

  it("an unknown id finds no binding — the map cannot be tricked into a near miss", async () => {
    const { binding, calls } = fakeBinding([])
    const cfg: D1Rest = { ...restOnly(), natives: { [OURS]: binding as never } }
    // A FRESH Response per call: a body can only be read once, so a single
    // mocked response would fail the second call for a reason unrelated to what
    // this is testing.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({ success: true, errors: [], result: [{ results: [] }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    )

    // Prefix, suffix and case variations of a bound id are all simply absent.
    for (const id of [OURS.slice(0, -1), OURS + "x", OURS.toUpperCase()])
      await d1Query(cfg, id, "SELECT 1", [])

    expect(calls, "no near miss reached the binding").toHaveLength(0)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    fetchSpy.mockRestore()
  })

  it("no bindings at all = exactly the behaviour that shipped before this existed", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true, errors: [], result: [{ results: [] }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )

    await d1Query(restOnly(), OURS, "SELECT 1", [])

    expect(String(fetchSpy.mock.calls[0][0])).toContain("api.cloudflare.com")
    fetchSpy.mockRestore()
  })
})

describe("what the env scan will and will not accept", () => {
  const db = { prepare: () => ({}) } as never

  it("a binding paired with its id is offered", () => {
    const map = nativeTeamDatabases({ TEAM_DB_0: db, TEAM_DB_0_ID: OURS } as never)
    expect(Object.keys(map)).toEqual([OURS])
  })

  it("a binding with NO id var is skipped rather than guessed at", () => {
    // Guessing would mean pointing a team's reads at a database nobody named.
    expect(nativeTeamDatabases({ TEAM_DB_0: db } as never)).toEqual({})
  })

  it("an id var with no binding offers nothing", () => {
    expect(nativeTeamDatabases({ TEAM_DB_0_ID: OURS } as never)).toEqual({})
  })

  it("an empty id is not an id", () => {
    expect(nativeTeamDatabases({ TEAM_DB_0: db, TEAM_DB_0_ID: "" } as never)).toEqual({})
  })

  it("several teams are each offered under their own id", () => {
    const map = nativeTeamDatabases({
      TEAM_DB_0: db,
      TEAM_DB_0_ID: OURS,
      TEAM_DB_1: db,
      TEAM_DB_1_ID: THEIRS,
    } as never)
    expect(Object.keys(map).sort()).toEqual([OURS, THEIRS].sort())
  })

  it("the CORE binding is not swept up by the scan", () => {
    // `DB` is the global database and is already native everywhere. It must
    // never end up in the per-team routing map.
    const map = nativeTeamDatabases({ DB: db, TEAM_DB_0: db, TEAM_DB_0_ID: OURS } as never)
    expect(Object.values(map)).toHaveLength(1)
  })
})
