// AN ALARM NOBODY RECEIVES IS A TABLE.
//
// `db_alerts` has been written by the nightly size check since the sharding
// machinery was built, and read through an owner-gated route nobody polls. So the
// alarm existed and the notification did not, which ARCHITECTURE §7 records as the
// gap and this closes.
//
// THE CADENCE IS A DECISION, NOT A DEFAULT (owner, 14 Aug 2026): once per NEW
// alarm, both of the owner's addresses, and the growth trend inside the alarm mail
// rather than as a mail of its own. Each of those three is asserted below, because
// each was a choice and a future reader would otherwise have to guess which.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CRON_ALERT_CAP, D1_MAX_BOUND_PARAMS } from "@shared/workers/limits"
import { alertNewAlarms } from "../src/lib/sharding"
import type { Env } from "../src/env"

const GB = 1024 * 1024 * 1024
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

afterEach(() => vi.unstubAllGlobals())

/** A core DB holding growth readings, plus a recorder for what got asked. */
function core(rows: Record<string, { size: number; prev: number | null; prevDays: number }>) {
  const asked: unknown[][] = []
  const DB = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          asked.push(params)
          return {
            async all() {
              if (!sql.includes("db_growth")) return { results: [] }
              return {
                results: params
                  .filter((p) => typeof p === "string" && rows[p])
                  .map((name) => {
                    const r = rows[name as string]
                    return {
                      database_name: name,
                      size_bytes: r.size,
                      at: ago(0),
                      prev_size_bytes: r.prev,
                      prev_at: r.prev === null ? null : ago(r.prevDays),
                    }
                  }),
              }
            },
            async first() {
              return null
            },
            async run() {
              return {}
            },
          }
        },
      }
    },
  }
  return { DB: DB as unknown as Env["DB"], asked }
}

/** The auth worker's internal send door, capturing every message handed to it. */
function mailbox(ok = true) {
  const sent: { to: string; subject: string; text: string }[] = []
  const AUTH = {
    async fetch(_url: string, init: { body: string }) {
      const body = JSON.parse(init.body) as { to: string; subject: string; text: string }
      sent.push(body)
      return new Response(null, { status: ok ? 200 : 500 })
    },
  }
  return { AUTH: AUTH as unknown as Env["AUTH"], sent }
}

function env(
  rows: Parameters<typeof core>[0],
  alertTo: string | undefined,
  ok = true
): { env: Env; sent: { to: string; subject: string; text: string }[]; asked: unknown[][] } {
  const c = core(rows)
  const m = mailbox(ok)
  return {
    env: { DB: c.DB, AUTH: m.AUTH, ALERT_TO: alertTo, INTERNAL_KEY: "k" } as unknown as Env,
    sent: m.sent,
    asked: c.asked,
  }
}

describe("a new alarm reaches a human", () => {
  it("mails every configured recipient, once, for the whole tick", async () => {
    const h = env({ "team-a": { size: 8.4 * GB, prev: 8.0 * GB, prevDays: 1 } }, "a@x.com,b@y.com")

    const out = await alertNewAlarms(h.env, ["team-a"])

    expect(out).toEqual({ mailed: 2, recipients: 2 })
    expect(h.sent.map((m) => m.to)).toEqual(["a@x.com", "b@y.com"])
  })

  it("is ONE mail listing every database, not one mail each", async () => {
    // A bad night for the estate is exactly when 50 separate emails is the wrong
    // answer — and CRON_ALERT_CAP means 50 is the number it could be.
    const rows: Parameters<typeof core>[0] = {}
    const names: string[] = []
    for (let i = 0; i < 12; i++) {
      names.push(`team-${i}`)
      rows[`team-${i}`] = { size: 8.1 * GB, prev: 8.0 * GB, prevDays: 1 }
    }
    const h = env(rows, "one@x.com")

    await alertNewAlarms(h.env, names)

    expect(h.sent.length, "one mail per RECIPIENT, not per database").toBe(1)
    for (const name of names) expect(h.sent[0].text).toContain(name)
  })

  it("trims whitespace and ignores an empty entry in the list", async () => {
    const h = env({ "team-a": { size: 8.1 * GB, prev: 8 * GB, prevDays: 1 } }, " a@x.com , , b@y.com ")
    const out = await alertNewAlarms(h.env, ["team-a"])
    expect(out.recipients).toBe(2)
    expect(h.sent.map((m) => m.to)).toEqual(["a@x.com", "b@y.com"])
  })

  it("says nothing at all when nothing is new — the cadence, not a filter", async () => {
    // ONCE PER NEW ALARM. `checkDatabaseSizes` already suppresses a database with
    // an open alert, so an empty list is the ordinary case on almost every night
    // and it must cost nothing — no read, no mail.
    const h = env({}, "a@x.com")
    const out = await alertNewAlarms(h.env, [])
    expect(out).toEqual({ mailed: 0, recipients: 0 })
    expect(h.sent).toEqual([])
    expect(h.asked, "not even a database read on a quiet night").toEqual([])
  })
})

describe("the trend rides inside the alarm mail", () => {
  it("says how long is left, computed from the two readings", async () => {
    // 0.4 GB a night, sitting at 8.4 of 10 → about four days.
    const h = env({ "team-a": { size: 8.4 * GB, prev: 8.0 * GB, prevDays: 1 } }, "a@x.com")
    await alertNewAlarms(h.env, ["team-a"])
    expect(h.sent[0].text).toMatch(/8\.4 GB of 10 GB/)
    expect(h.sent[0].text).toMatch(/about 4 days left/)
  })

  it("says so in WORDS when the rate cannot be computed", async () => {
    // A database's first night, or one that is not growing. A made-up number here
    // would read as a measurement — the same reason daysUntilFull returns null.
    const h = env({ "team-a": { size: 8.1 * GB, prev: null, prevDays: 0 } }, "a@x.com")
    await alertNewAlarms(h.env, ["team-a"])
    expect(h.sent[0].text).toMatch(/no growth reading yet, or it is not growing/)
    expect(h.sent[0].text, "and never a number it cannot stand behind").not.toMatch(/NaN|Infinity/)
  })

  it("shouts when a database will be full within a day", async () => {
    const h = env({ "team-a": { size: 9.9 * GB, prev: 8.0 * GB, prevDays: 1 } }, "a@x.com")
    await alertNewAlarms(h.env, ["team-a"])
    expect(h.sent[0].text).toContain("FULL WITHIN A DAY")
  })

  it("a database with no growth row still gets named — the mail is about the ALARM", async () => {
    // The growth watch is bounded to the largest CRON_GROWTH_CAP databases, so a
    // database can alarm without having a reading. Dropping it from the mail would
    // be the worst outcome: the one thing the alert exists to say is its name.
    const h = env({}, "a@x.com")
    await alertNewAlarms(h.env, ["team-unwatched"])
    expect(h.sent[0].text).toContain("team-unwatched")
  })

  it("names the action, not only the fact", async () => {
    const h = env({ "team-a": { size: 8.1 * GB, prev: 8 * GB, prevDays: 1 } }, "a@x.com")
    await alertNewAlarms(h.env, ["team-a"])
    expect(h.sent[0].text.toLowerCase()).toContain("mover")
  })
})

describe("a delivery that fails is never silent", () => {
  it("throws when ALERT_TO is unset, naming the databases nobody heard about", async () => {
    const h = env({ "team-a": { size: 8.1 * GB, prev: 8 * GB, prevDays: 1 } }, undefined)
    await expect(alertNewAlarms(h.env, ["team-a"])).rejects.toThrow(/ALERT_TO is not set/)
    await expect(alertNewAlarms(h.env, ["team-a"])).rejects.toThrow(/team-a/)
  })

  it("throws when every send is refused", async () => {
    // The alarm ROW is already written and is the record; this is the notification.
    // The caller catches and records it (R12) rather than failing the whole cron —
    // but it must be told, or "nobody was emailed" looks like "nothing happened".
    const h = env({ "team-a": { size: 8.1 * GB, prev: 8 * GB, prevDays: 1 } }, "a@x.com", false)
    await expect(alertNewAlarms(h.env, ["team-a"])).rejects.toThrow(/could not be emailed/)
  })

  it("the alarm list can never outgrow D1's parameter ceiling", () => {
    // The trend read binds one parameter per alarming database. That is safe only
    // while the alarm ceiling stays under D1's — the check this repo has been bitten
    // by twice, so it is asserted rather than assumed.
    expect(CRON_ALERT_CAP).toBeLessThan(D1_MAX_BOUND_PARAMS)
  })
})

describe("the cron actually calls it, and survives it failing", () => {
  const handler = readFileSync(join(__dirname, "..", "src", "index.ts"), "utf8")

  it("calls the sender from the size-check branch", () => {
    expect(handler, "an unwired sender is the whole finding, again").toMatch(/alertNewAlarms\(/)
  })

  it("wraps it in its OWN try, so a failed mail does not fail the size check", () => {
    const at = handler.indexOf("alertNewAlarms(")
    expect(at).toBeGreaterThan(-1)
    // Look backwards from the call to the nearest `try {` and forwards to its catch:
    // the send must be inside a try of its own, and that catch must record.
    const before = handler.slice(0, at)
    const openedAt = before.lastIndexOf("try {")
    expect(openedAt, "the send must be inside a try").toBeGreaterThan(-1)
    const after = handler.slice(at, at + 900)
    expect(after, "R12: a notification nobody got must reach the error store").toMatch(
      /recordWorkerError\(/
    )
    expect(after).toMatch(/cron\/size-alert/)
  })
})
