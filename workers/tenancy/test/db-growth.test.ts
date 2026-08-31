// 80% OF A CAP IS A POSITION, NOT A WARNING.
//
// The nightly check has alarmed at 8 GB of D1's 10 GB since sharding was built, and
// that told you WHERE a database is, never how fast it got there. Two databases at
// 8.1 GB raise the identical alarm and are in completely different trouble: one has
// been there a year, the other crossed 6 GB last week and reaches the ceiling on
// Thursday. The mover takes a while and needs a person, so the only question that
// matters is "how long have I got" — and nothing recorded the two readings a rate
// needs.
//
// These cover the arithmetic and the shapes it must REFUSE to answer, because the
// dangerous failure here is not a missing number: it is a confident wrong one.

import { describe, expect, it, vi, afterEach } from "vitest"

import { CRON_GROWTH_CAP } from "@shared/workers/limits"
import {
  ALERT_THRESHOLD_BYTES,
  D1_MAX_DATABASE_BYTES,
  checkDatabaseSizes,
  daysUntilFull,
} from "../src/lib/sharding"
import type { Env } from "../src/env"

const CFG = { accountId: "acct", apiToken: "tok" }
const GB = 1024 * 1024 * 1024

afterEach(() => vi.unstubAllGlobals())

const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString()

describe("days until full, from two readings", () => {
  it("computes headroom ÷ rate", () => {
    // 1 GB a day, sitting at 8 GB of 10 → two days left.
    const days = daysUntilFull({
      size_bytes: 8 * GB,
      at: at(0),
      prev_size_bytes: 7 * GB,
      prev_at: at(1),
    })
    expect(days).toBeCloseTo(2, 1)
  })

  it("measures headroom from the CAP, not from the alarm threshold", () => {
    // A database exactly ON the alarm line still has 2 GB to go. Measuring from
    // ALERT_THRESHOLD_BYTES would answer zero and turn "act this week" into "it is
    // already too late", which is a different and wrong instruction.
    const days = daysUntilFull({
      size_bytes: ALERT_THRESHOLD_BYTES,
      at: at(0),
      prev_size_bytes: ALERT_THRESHOLD_BYTES - GB,
      prev_at: at(1),
    })
    const headroomGb = (D1_MAX_DATABASE_BYTES - ALERT_THRESHOLD_BYTES) / GB
    expect(days).toBeCloseTo(headroomGb, 1)
    expect(days, "an alarm is not a deadline").toBeGreaterThan(0)
  })

  it("refuses to answer on ONE reading", () => {
    // A database's first night. "Unknown" is the honest answer; a very large number
    // would read as a measurement.
    expect(daysUntilFull({ size_bytes: 5 * GB, at: at(0), prev_size_bytes: null, prev_at: null }))
      .toBeNull()
  })

  it("refuses to answer for a database that is not growing", () => {
    for (const prev of [5 * GB, 6 * GB]) // held still, then SHRANK
      expect(
        daysUntilFull({ size_bytes: 5 * GB, at: at(0), prev_size_bytes: prev, prev_at: at(1) }),
        "not growing and growing slowly are different answers, and only one is a number"
      ).toBeNull()
  })

  it("refuses to answer when no time elapsed between the readings", () => {
    // A re-fired tick can put two readings at the same instant. Dividing by that
    // interval is an Infinity dressed as a forecast.
    const same = at(0)
    expect(
      daysUntilFull({ size_bytes: 8 * GB, at: same, prev_size_bytes: 7 * GB, prev_at: same })
    ).toBeNull()
  })

  it("never answers negative — a database already over the cap has no time left", () => {
    const days = daysUntilFull({
      size_bytes: D1_MAX_DATABASE_BYTES + GB,
      at: at(0),
      prev_size_bytes: D1_MAX_DATABASE_BYTES,
      prev_at: at(1),
    })
    expect(days).toBe(0)
  })

  it("uses the STORED interval, so a late or skipped cron is not silently wrong", () => {
    // The same 1 GB of growth over one night and over ten are wildly different
    // rates. Assuming 24 hours would report the ten-day case as ten times too fast,
    // exactly when the job has been unreliable and you are most likely reading it.
    const oneNight = daysUntilFull({ size_bytes: 8 * GB, at: at(0), prev_size_bytes: 7 * GB, prev_at: at(1) })
    const tenNights = daysUntilFull({ size_bytes: 8 * GB, at: at(0), prev_size_bytes: 7 * GB, prev_at: at(10) })
    expect(tenNights).toBeCloseTo((oneNight as number) * 10, 0)
  })
})

describe("the nightly tick records readings, bounded and biggest-first", () => {
  /** An account of `n` databases, all UNDER the alarm line so nothing alarms —
   * the reading must be written on a quiet night too. */
  function stubAccount(n: number) {
    const page = Array.from({ length: n }, (_, i) => ({
      uuid: `u${i}`,
      name: `team-${i}`,
      // ascending, so "the biggest" is the tail — a tick that just took the first
      // N would record the smallest and pass a laxer assertion.
      file_size: i * 1_000_000,
    }))
    // HONOUR THE PAGING. `d1ListDatabases` walks `?page=N&per_page=100` until a
    // SHORT page, so a stub that answers the whole list every time answers a full
    // page every time and the loop runs to its ceiling — 100 × the same 250
    // databases. Slicing by the requested page is what makes `total` mean total.
    vi.stubGlobal("fetch", async (url: string) => {
      const at = Number(/[?&]page=(\d+)/.exec(url)?.[1] ?? "1")
      const slice = page.slice((at - 1) * 100, at * 100)
      return new Response(JSON.stringify({ success: true, errors: [], result: slice }), {
        status: 200,
      })
    })
  }

  /** A core DB that records the growth upserts it was handed, and says which
   * databases are OURS.
   *
   * The account is shared with other products, so the tick subtracts anything
   * core's `teams` table does not claim (test/db-ownership.test.ts). `stubAccount`
   * numbers its databases `u0…uN-1`, so claiming all of them is what keeps these
   * tests measuring what they were written to measure — the BOUND and the
   * biggest-first ordering, not the ownership rule. */
  function fakeCoreDb(owned: string[]) {
    const growth: unknown[][] = []
    const rows = owned.map((database_id) => ({ database_id }))
    const db = {
      prepare(sql: string) {
        if (sql.includes("FROM teams")) return { all: async () => ({ results: rows }) }
        return {
          bind(...params: unknown[]) {
            if (sql.includes("INSERT INTO db_growth")) growth.push(params)
            return {
              first: async () => null,
              run: async () => ({}),
              all: async () => ({ results: [] }),
            }
          },
        }
      },
    }
    return { db: db as unknown as Env["DB"], growth }
  }

  /** The uuids `stubAccount(n)` hands out. */
  const allOf = (n: number) => Array.from({ length: n }, (_, i) => `u${i}`)

  it("writes a reading even when nothing alarms", async () => {
    stubAccount(3)
    const core = fakeCoreDb(allOf(3))
    const result = await checkDatabaseSizes({ DB: core.db } as Env, CFG)
    expect(result.alerted, "nothing is near the cap").toEqual([])
    expect(
      core.growth.length,
      "a trend you start measuring at 80% is a trend you measured too late"
    ).toBe(3)
  })

  it("bounds the readings at CRON_GROWTH_CAP and takes the LARGEST", async () => {
    const total = CRON_GROWTH_CAP + 50
    stubAccount(total)
    const core = fakeCoreDb(allOf(total))
    await checkDatabaseSizes({ DB: core.db } as Env, CFG)
    expect(core.growth.length, "a growth watch must not become the thing that grows").toBe(
      CRON_GROWTH_CAP
    )
    // `bind(database_id, database_name, size_bytes, at, …)` — the smallest of the
    // recorded set must still be bigger than every database left out.
    const sizes = core.growth.map((p) => p[2] as number)
    expect(Math.min(...sizes), "the trend matters where there is a ceiling to reach").toBe(
      (total - CRON_GROWTH_CAP) * 1_000_000
    )
  })

  it("a failed reading never costs the alarms", async () => {
    // The reading runs BEFORE the alarms and is the least important thing the cron
    // does. A throw here used to be impossible because the code did not exist; now
    // it must be impossible because it is caught.
    const page = [{ uuid: "u0", name: "team-0", file_size: ALERT_THRESHOLD_BYTES + 1 }]
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ success: true, errors: [], result: page }), { status: 200 })
    )
    const inserted: string[] = []
    const db = {
      prepare(sql: string) {
        // The one database in this fixture is ours, so the subtraction is not what
        // is under test here — the growth write failing is.
        if (sql.includes("FROM teams"))
          return { all: async () => ({ results: [{ database_id: "u0" }] }) }
        return {
          bind(...params: unknown[]) {
            if (sql.includes("INSERT INTO db_growth")) throw new Error("no such table: db_growth")
            if (sql.includes("INSERT INTO db_alerts")) inserted.push(String(params[2]))
            return { first: async () => null, run: async () => ({}), all: async () => ({ results: [] }) }
          },
        }
      },
    } as unknown as Env["DB"]

    const result = await checkDatabaseSizes({ DB: db } as Env, CFG)

    expect(result.sampled, "the reading failed").toBe(0)
    expect(result.alerted, "and the alarm still fired").toEqual(["team-0"])
    expect(inserted).toEqual(["team-0"])
  })
})
