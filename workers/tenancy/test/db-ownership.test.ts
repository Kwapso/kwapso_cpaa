// THE CLOUDFLARE ACCOUNT IS SHARED WITH OTHER COMPANIES, AND THE NIGHTLY WATCH
// MUST SUBTRACT THEM.
//
// ── THE BUG THESE LOCK SHUT ─────────────────────────────────────────────────
//
// `d1ListDatabases` lists every database on the ACCOUNT — `/d1/database?page=…`
// and no filter, because the Cloudflare API offers no owner parameter. The
// nightly `checkDatabaseSizes` treated that answer as "ours", on a comment that
// said so outright: "an app owns its Cloudflare account, so every database this
// listing returns IS every database we run."
//
// MEASURED, 31 Aug 2026: 16 databases on the Kwapso account, ELEVEN belonging to
// two other products (rest-o and Base One) that share it. 13 of the 17 rows in
// `db_growth` named a database that is not ours — in BOTH cores — and three of
// those name databases their owner has since deleted, so our table was the last
// record of them. `recordGrowth` takes the LARGEST first, which is exactly where
// a foreign production database ranks.
//
// The alarm loop is the half that matters: it opens a `db_alerts` row against a
// foreign id and logs "D1 SIZE ALARM: <their database name> … Run the module
// mover" — an instruction, naming another company's production database, pointed
// at a human. It has never fired (nothing on the account is within 1.5% of the
// 8 GiB line), so today's harm is metadata and tomorrow's is not.
//
// ── WHY A NAME FILTER IS NOT THE FIX ────────────────────────────────────────
//
// The obvious repair is a prefix. It cannot work HERE: the other products are
// forks of this same base, so their per-team databases are named `team-<ulid>`
// exactly as ours are. A prefix test would look right and keep the wrong rows.
// Ownership comes from OUR OWN RECORD of what we made — the core `teams` table,
// plus core itself — and never from a string.
//
// If you are reading this because a test failed after you simplified the filter
// away: the account is shared. Check `npx wrangler d1 list` before concluding
// that everything it returns is ours.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { stripJsoncComments } from "@shared/rules/source-scan"

import { ACCOUNT_STORAGE_ID, checkDatabaseSizes, ourDatabases } from "../src/lib/sharding"
import type { Env } from "../src/env"

const CFG = { accountId: "acct", apiToken: "tok" }
const OUR_CORE = "core-uuid-ours"
const OUR_TEAM = "team-uuid-ours"
/** Another company's, and deliberately named the way ours are — that collision
 * IS the reason this rule exists, so the fixture must reproduce it. */
const THEIR_TEAM = "team-uuid-theirs"
const THEIR_CORE = "rest-o-core-uuid"

afterEach(() => vi.unstubAllGlobals())

/** The account listing, with two of ours and two of somebody else's. The foreign
 * ones are the BIGGEST, because that is how they really rank and because
 * `recordGrowth` takes the largest first — a fixture where they were smallest
 * would pass a laxer test. */
function stubAccount() {
  const page = [
    { uuid: THEIR_CORE, name: "rest-o-core", file_size: 9_000_000 },
    { uuid: THEIR_TEAM, name: "team-01kzxr4fw998yth2gkr1s598t2", file_size: 8_000_000 },
    { uuid: OUR_TEAM, name: "team-01kzwxfd86n0k3rzrbhkmkrwys", file_size: 2_000_000 },
    { uuid: OUR_CORE, name: "kwapso-core", file_size: 1_000_000 },
  ]
  vi.stubGlobal("fetch", async (url: string) => {
    const at = Number(/[?&]page=(\d+)/.exec(url)?.[1] ?? "1")
    return new Response(
      JSON.stringify({ success: true, errors: [], result: at === 1 ? page : [] }),
      { status: 200 }
    )
  })
}

/** A core DB that answers the ownership query and records what it was written. */
function fakeCore(teamRows: { database_id: string }[] = [{ database_id: OUR_TEAM }]) {
  const growth: unknown[][] = []
  const alerts: unknown[][] = []
  const db = {
    prepare(sql: string) {
      if (sql.includes("FROM teams"))
        return {
          all: async () => ({ results: teamRows }),
          bind: () => ({ all: async () => ({ results: teamRows }) }),
        }
      return {
        bind(...params: unknown[]) {
          if (sql.includes("INSERT INTO db_growth")) growth.push(params)
          if (sql.includes("INSERT INTO db_alerts")) alerts.push(params)
          return { first: async () => null, run: async () => ({}), all: async () => ({ results: [] }) }
        },
      }
    },
  }
  return { db: db as unknown as Env["DB"], growth, alerts }
}

const env = (core: ReturnType<typeof fakeCore>): Env =>
  ({ DB: core.db, CORE_DATABASE_ID: OUR_CORE }) as Env

describe("the nightly watch sizes only databases we own", () => {
  it("writes a growth reading for OUR databases and none for another company's", async () => {
    stubAccount()
    const core = fakeCore()
    const result = await checkDatabaseSizes(env(core), CFG as never)

    // `bind(database_id, database_name, …)` — the first parameter is the uuid.
    // The account's own total is written under a sentinel that is not a uuid; it
    // is subtracted here because this test is about WHOSE DATABASES we name, and
    // that row names nobody. Its own arithmetic is pinned in db-growth.test.ts.
    const written = core.growth.map((p) => p[0]).filter((id) => id !== ACCOUNT_STORAGE_ID)
    expect(written.sort()).toEqual([OUR_CORE, OUR_TEAM].sort())
    expect(written, "another company's database is not ours to measure").not.toContain(THEIR_TEAM)
    expect(written).not.toContain(THEIR_CORE)
    // COUNTED, NEVER NAMED — and this is the one figure where the other
    // companies' bytes legitimately COUNT, because D1's 1 TB ceiling is charged
    // to the account and not to the app. So the total is over all four databases
    // while only two of them are named anywhere.
    expect(
      result.accountBytes,
      "D1's 1 TB ceiling is charged to the ACCOUNT, so their bytes fill ours"
    ).toBe(9_000_000 + 8_000_000 + 2_000_000 + 1_000_000)
    expect(result.ourBytes, "and our own share is reported beside it").toBe(2_000_000 + 1_000_000)
    expect(result.sampled).toBe(2)
    expect(result.checked, "and the count reports what we sized, not what the account holds").toBe(2)
  })

  it("MUTATION PROOF: without the subtraction the foreign databases DO get written", async () => {
    // The test above can only fail if the filter breaks; this one fails if the
    // filter is ever DELETED as redundant. It reproduces the pre-fix behaviour by
    // handing `ourDatabases` an env that claims everything, and asserts the bug is
    // still reachable — so the two together say "the filter is what does this",
    // rather than "something does this".
    stubAccount()
    const everything = [
      { uuid: THEIR_CORE },
      { uuid: THEIR_TEAM },
      { uuid: OUR_TEAM },
      { uuid: OUR_CORE },
    ]
    const claimsAll = fakeCore(everything.map((d) => ({ database_id: d.uuid })))
    const unfiltered = await ourDatabases(env(claimsAll), everything)
    expect(
      unfiltered.map((d) => d.uuid),
      "with every id claimed, nothing is subtracted — so the subtraction is real"
    ).toContain(THEIR_TEAM)

    const core = fakeCore()
    const filtered = await ourDatabases(env(core), everything)
    expect(filtered.map((d) => d.uuid)).not.toContain(THEIR_TEAM)
  })

  it("never alarms on a database that is not ours, however large it is", async () => {
    // The dangerous half. A foreign database over the threshold must produce no
    // `db_alerts` row and no "run the module mover" line naming it.
    const page = [
      { uuid: THEIR_TEAM, name: "team-01kzxr4fw998yth2gkr1s598t2", file_size: 9 * 1024 * 1024 * 1024 },
      { uuid: OUR_TEAM, name: "team-01kzwxfd86n0k3rzrbhkmkrwys", file_size: 9 * 1024 * 1024 * 1024 },
    ]
    vi.stubGlobal("fetch", async (url: string) => {
      const at = Number(/[?&]page=(\d+)/.exec(url)?.[1] ?? "1")
      return new Response(JSON.stringify({ success: true, errors: [], result: at === 1 ? page : [] }), {
        status: 200,
      })
    })
    const core = fakeCore()
    const result = await checkDatabaseSizes(env(core), CFG as never)
    expect(result.alerted, "ours alarms").toEqual(["team-01kzwxfd86n0k3rzrbhkmkrwys"])
    expect(
      core.alerts.map((p) => p[1]),
      "theirs does not — an alarm names a database and tells a person to move data in it"
    ).toEqual([OUR_TEAM])
  })

  it("claims core, which is in no team row and is the one that matters most", async () => {
    // The prefix filter this replaced could never see core (it does not begin
    // "team-"), which was the hole that removed the filter in the first place.
    // Re-narrowing must not re-open it.
    const core = fakeCore([])
    const only = await ourDatabases(env(core), [{ uuid: OUR_CORE }, { uuid: THEIR_CORE }])
    expect(only.map((d) => d.uuid)).toEqual([OUR_CORE])
  })

  it("keeps watching a DEACTIVATED team's database", async () => {
    // Deactivate-never-delete: the rows are still there and still growing toward
    // the same ceiling. The read carries no `deactivated_at` predicate on purpose,
    // and this is what says so.
    const core = fakeCore([{ database_id: OUR_TEAM }])
    const seen = await ourDatabases(env(core), [{ uuid: OUR_TEAM }])
    expect(seen).toHaveLength(1)
  })

  it("fails CLOSED when the teams table cannot be read", async () => {
    // Falling back to the whole listing on an error would restore the bug exactly
    // when something is already wrong. A missing night is visible in the table;
    // an alarm against somebody else's production database is not recoverable.
    const db = {
      prepare(sql: string) {
        if (sql.includes("FROM teams")) return { all: async () => { throw new Error("no such table: teams") } }
        return { bind: () => ({ first: async () => null, run: async () => ({}) }) }
      },
    } as unknown as Env["DB"]
    const kept = await ourDatabases({ DB: db, CORE_DATABASE_ID: OUR_CORE } as Env, [
      { uuid: OUR_CORE },
      { uuid: THEIR_TEAM },
    ])
    expect(kept.map((d) => d.uuid), "core only, never everything").toEqual([OUR_CORE])
  })
})

describe("CORE_DATABASE_ID cannot drift from the binding it names", () => {
  it("matches the DB binding's database_id in every environment", () => {
    // ROT CHECK. The var is a hand-copy of an id three lines above it, and a
    // hand-copy is a thing that goes stale. If they ever disagree, the growth
    // watch stops recognising core — silently, because an unclaimed database
    // simply is not measured. Read out of the wrangler file itself so the test
    // cannot agree with a stale copy of its own.
    // The kit's own JSONC stripper, not a hand-rolled one — a second parser here
    // would be a second thing that can disagree with how wrangler reads the file.
    const raw = readFileSync(join(__dirname, "..", "wrangler.jsonc"), "utf8")
    const json = JSON.parse(stripJsoncComments(raw)) as {
      d1_databases: { binding: string; database_id: string }[]
      vars: Record<string, string>
      env: Record<string, { d1_databases?: { binding: string; database_id: string }[]; vars?: Record<string, string> }>
    }

    const envs: [string, { d1_databases?: typeof json.d1_databases; vars?: Record<string, string> }][] = [
      ["production", { d1_databases: json.d1_databases, vars: json.vars }],
      ...Object.entries(json.env),
    ]
    let checked = 0
    for (const [name, cfg] of envs) {
      const binding = cfg.d1_databases?.find((d) => d.binding === "DB")
      if (!binding) continue
      expect(cfg.vars?.CORE_DATABASE_ID, `${name}: CORE_DATABASE_ID is not set`).toBeTruthy()
      expect(
        cfg.vars?.CORE_DATABASE_ID,
        `${name}: CORE_DATABASE_ID does not match the DB binding — the growth watch would stop seeing core`
      ).toBe(binding.database_id)
      checked++
    }
    expect(checked, "the scan found no environment — it has gone blind").toBeGreaterThanOrEqual(2)
  })
})
