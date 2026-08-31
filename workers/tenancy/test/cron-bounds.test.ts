// The nightly size check does UNATTENDED work: nobody is watching it, and a tick
// that tries to do too much doesn't fail loudly — it just dies partway and
// reports nothing at all. So the work per tick is bounded (CRON_ALERT_CAP alarms)
// and the tick says so. This locks that, with an account holding far more
// over-threshold databases than one run may alarm on.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CRON_ALERT_CAP } from "@shared/workers/limits"
import { ALERT_THRESHOLD_BYTES, checkDatabaseSizes } from "../src/lib/sharding"
import type { Env } from "../src/env"

const CFG = { accountId: "acct", apiToken: "tok" }

afterEach(() => vi.unstubAllGlobals())

/** Every team database is over the threshold; none has an open alert yet.
 * `extra` names databases that are NOT team ones — the core database, mostly. */
function stubAccount(teamDbs: number, extra: string[] = []) {
  const page = [
    ...Array.from({ length: teamDbs }, (_, i) => ({
      uuid: `u${i}`,
      name: `team-${i}`,
      file_size: ALERT_THRESHOLD_BYTES + 1,
    })),
    ...extra.map((name, i) => ({
      uuid: `x${i}`,
      name,
      file_size: ALERT_THRESHOLD_BYTES + 1,
    })),
  ]
  vi.stubGlobal("fetch", () =>
    // ONE short page: the listing is complete, so nothing here is testing the
    // page ceiling (that lives in d1-rest.test.ts) — only the alarm ceiling.
    new Response(JSON.stringify({ success: true, errors: [], result: page }), { status: 200 })
  )
}

/** A core DB that answers "no open alert", counts the alarm rows written, and
 * says WHICH databases are ours.
 *
 * `owned` is not decoration. The Cloudflare account is shared with other
 * products, so `checkDatabaseSizes` now subtracts anything that is not in core's
 * own `teams` table (see test/db-ownership.test.ts). A fixture that claimed
 * nothing would make every test here assert zero, and a fixture that claimed
 * everything would hide the subtraction — so each test below states its estate. */
function fakeCoreDb(owned: string[] = []) {
  const inserted: string[] = []
  const rows = owned.map((database_id) => ({ database_id }))
  const db = {
    prepare(sql: string) {
      if (sql.includes("FROM teams")) return { all: async () => ({ results: rows }) }
      return {
        bind(...params: unknown[]) {
          if (sql.includes("INSERT INTO db_alerts")) inserted.push(String(params[2]))
          return {
            first: async () => null, // no open alert for any database
            run: async () => ({}),
            all: async () => ({ results: [] }),
          }
        },
      }
    },
  }
  return { db: db as unknown as Env["DB"], inserted }
}

/** The uuids `stubAccount` gives its team databases and its `extra` ones. */
const teamIds = (n: number) => Array.from({ length: n }, (_, i) => `u${i}`)
const extraIds = (n: number) => Array.from({ length: n }, (_, i) => `x${i}`)

describe("the nightly size check does bounded work per tick", () => {
  it("stops at the alarm ceiling and says the run was capped", async () => {
    const over = CRON_ALERT_CAP + 20
    stubAccount(over)
    const { db, inserted } = fakeCoreDb(teamIds(over))

    const result = await checkDatabaseSizes({ DB: db } as Env, CFG as never)

    expect(result.checked, "it still SEES every team database of OURS").toBe(over)
    expect(inserted.length, "but writes at most CRON_ALERT_CAP alarms").toBe(CRON_ALERT_CAP)
    expect(result.alerted.length).toBe(CRON_ALERT_CAP)
    expect(result.capped, "a capped run must report itself, not look complete").toBe(true)
  })

  it("alarms on everything and reports NOT capped when it fits", async () => {
    stubAccount(3)
    const { db, inserted } = fakeCoreDb(teamIds(3))

    const result = await checkDatabaseSizes({ DB: db } as Env, CFG as never)

    expect(inserted.length).toBe(3)
    expect(result.capped).toBe(false)
  })
})

// THE ONE DATABASE IT COULD NEVER ALARM ON WAS THE SHARED ONE.
//
// The scan filtered `db.name.startsWith("team-")`, which reads like a tidy scope
// and was a blind spot over `kwapso-core`: every user, session, team, error log
// and usage row in the platform, the only database strangers can grow (sign-in
// codes come from an unauthenticated door), and the only one whose 10GB ceiling
// takes the WHOLE product down instead of one tenant. It sat at 100% in silence,
// because its name does not begin with "team-".
describe("the nightly check watches the SHARED core database too", () => {
  it("alarms on kwapso-core when it crosses the threshold", async () => {
    stubAccount(1, ["kwapso-core"])
    const { db, inserted } = fakeCoreDb(teamIds(1))

    // Core is claimed by CORE_DATABASE_ID — it is in no team row, which is
    // precisely why the old `team-` prefix could never see it.
    const result = await checkDatabaseSizes(
      { DB: db, CORE_DATABASE_ID: extraIds(1)[0] } as Env,
      CFG as never
    )

    expect(result.alerted, "the core database raises an alarm like any other").toContain("kwapso-core")
    expect(inserted).toContain("kwapso-core")
    expect(result.checked, "and it is counted among what was checked").toBe(2)
  })

  it("does NOT watch a database nobody claimed — the deliberate cost of a shared account", async () => {
    // THIS TEST USED TO ASSERT THE OPPOSITE, and its old name said why: "watches
    // anything else the account holds, without being told its name", on the
    // reasoning that an app owns its Cloudflare account so a database added
    // tomorrow is watched the day it exists. That reasoning is false here — the
    // account is shared with two other products — and this test passing is what
    // made the bug look intended.
    //
    // The cost is real and is not hidden: a future database of ours that is
    // neither core nor a team row goes unwatched until somebody claims it. That
    // is the maintenance burden the prefix filter was dropped to escape, taken
    // back on purpose, because the alternative is alarming on another company's
    // production database. The tick logs how many it did not claim so the gap is
    // visible; `some-future-store` below is exactly that case.
    stubAccount(0, ["kwapso-core", "some-future-store"])
    const { db } = fakeCoreDb([])

    const result = await checkDatabaseSizes(
      { DB: db, CORE_DATABASE_ID: extraIds(1)[0] } as Env,
      CFG as never
    )

    expect(result.alerted, "core is claimed; the unclaimed one is not").toEqual(["kwapso-core"])
  })
})

// STOPPING EARLY IS NOT THE SAME AS FINDING NOTHING.
//
// The nightly size check has a ceiling, and hitting it means team databases over
// 80% full went un-alarmed for the night. That is not a crash, so the handler's
// catch never sees it — and the only thing written down was a cheerful
// "N alarm(s)" success line. Someone reading the logs would conclude the estate
// was healthy on precisely the night it was most crowded.
//
// So the ceiling is recorded when it bites. R12's letter is about cron FAILURES;
// its spirit is that unattended work with nobody watching must not go quiet.
describe("the nightly check says when it stopped early", () => {
  const handler = readFileSync(join(__dirname, "../src/index.ts"), "utf8")

  /** The body of `async scheduled(...)`, brace-balanced. */
  function scheduledBody(): string {
    const at = handler.indexOf("async scheduled(")
    expect(at, "the cron handler must exist").toBeGreaterThan(-1)
    const open = handler.indexOf("{", at)
    let depth = 0
    for (let i = open; i < handler.length; i++) {
      if (handler[i] === "{") depth++
      else if (handler[i] === "}" && --depth === 0) return handler.slice(open + 1, i)
    }
    return ""
  }

  it("reads the ceiling flag the size check returns", () => {
    // The flag existed and nothing consumed it — the check that was supposed to
    // cover this only grepped for recordWorkerError anywhere after `scheduled(`,
    // which the catch block already satisfied. So it asserts the FLAG is read.
    expect(scheduledBody(), "result.capped must be consulted").toMatch(/result\.capped/)
  })

  it("records it, rather than only logging it", () => {
    const body = scheduledBody()
    const at = body.indexOf("result.capped")
    // The recording must belong to the capped branch, not to the catch below it.
    const branch = body.slice(at, at + 700)
    expect(branch, "a capped run must reach the error store").toMatch(/recordWorkerError/)
  })

  it("says what was NOT done, not just that something happened", () => {
    const body = scheduledBody()
    const at = body.indexOf("result.capped")
    const branch = body.slice(at, at + 700)
    expect(branch.toLowerCase()).toMatch(/were not alarmed|un-?alarmed|not alarmed/)
  })
})
