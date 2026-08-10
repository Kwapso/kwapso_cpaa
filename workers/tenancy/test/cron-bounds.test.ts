// The nightly size check does UNATTENDED work: nobody is watching it, and a tick
// that tries to do too much doesn't fail loudly — it just dies partway and
// reports nothing at all. So the work per tick is bounded (CRON_ALERT_CAP alarms)
// and the tick says so. This locks that, with an account holding far more
// over-threshold databases than one run may alarm on.

import { afterEach, describe, expect, it, vi } from "vitest"

import { CRON_ALERT_CAP } from "../../../shared/workers/limits"
import { ALERT_THRESHOLD_BYTES, checkDatabaseSizes } from "../src/lib/sharding"
import type { Env } from "../src/env"

const CFG = { accountId: "acct", apiToken: "tok" }

afterEach(() => vi.unstubAllGlobals())

/** Every team database is over the threshold; none has an open alert yet. */
function stubAccount(teamDbs: number) {
  const page = Array.from({ length: teamDbs }, (_, i) => ({
    uuid: `u${i}`,
    name: `team-${i}`,
    file_size: ALERT_THRESHOLD_BYTES + 1,
  }))
  vi.stubGlobal("fetch", () =>
    // ONE short page: the listing is complete, so nothing here is testing the
    // page ceiling (that lives in d1-rest.test.ts) — only the alarm ceiling.
    new Response(JSON.stringify({ success: true, errors: [], result: page }), { status: 200 })
  )
}

/** A core DB that answers "no open alert" and counts the alarm rows written. */
function fakeCoreDb() {
  const inserted: string[] = []
  const db = {
    prepare(sql: string) {
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

describe("the nightly size check does bounded work per tick", () => {
  it("stops at the alarm ceiling and says the run was capped", async () => {
    const over = CRON_ALERT_CAP + 20
    stubAccount(over)
    const { db, inserted } = fakeCoreDb()

    const result = await checkDatabaseSizes({ DB: db } as Env, CFG as never)

    expect(result.checked, "it still SEES every team database").toBe(over)
    expect(inserted.length, "but writes at most CRON_ALERT_CAP alarms").toBe(CRON_ALERT_CAP)
    expect(result.alerted.length).toBe(CRON_ALERT_CAP)
    expect(result.capped, "a capped run must report itself, not look complete").toBe(true)
  })

  it("alarms on everything and reports NOT capped when it fits", async () => {
    stubAccount(3)
    const { db, inserted } = fakeCoreDb()

    const result = await checkDatabaseSizes({ DB: db } as Env, CFG as never)

    expect(inserted.length).toBe(3)
    expect(result.capped).toBe(false)
  })
})
