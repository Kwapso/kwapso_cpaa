// THROTTLE THE SEND, NEVER THE SIGN-IN.
//
// The old rule refused for an HOUR once five codes had been asked for. Two ways
// that bit: an anonymous caller could burn a real person's five and lock them out
// of their own account, and — the one that actually happened — an operator
// retrying a flaky email locked themselves out of their own staging.
//
// The replacement: a short cooldown limits how often mail goes out, and past the
// hourly cap a request ROTATES the live code in place rather than being refused,
// so the row count stays bounded AND the person who owns the inbox always gets in.
// (Rotation is the only option anyway — codes are hashed at rest, so nothing can
// re-send digits that already went out.)
//
// EVERY rule above is per ADDRESS, and that was the hole: an anonymous caller
// could walk a mailing list one send each, mail-bombing strangers and growing the
// core DB without bound from an unauthenticated door. So the CALLER now carries
// two ceilings of its own, and — the second half — every limit RIDES THE WRITE
// (CONCURRENCY.md): a read-then-write throttle is a suggestion under load.
//
// These tests run against a REAL SQLite database with the REAL migrations applied
// (0001 + 0015), because a stub that "understands" the statements would happily
// agree with a broken WHERE clause, and the whole point here is what SQL does
// when two requests arrive at once.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync, type SqlValue } from "node:sqlite"
import { describe, expect, it } from "vitest"

import {
  MAX_CODES_PER_HOUR,
  MAX_SENDS_GLOBAL_PER_HOUR,
  MAX_SENDS_PER_IP_PER_HOUR,
} from "../src/lib/constants"
import { clientIp, mintLoginCode } from "../src/lib/login-codes"

const CORE = join(__dirname, "..", "..", "..", "db", "core")
const migration = (name: string) => readFileSync(join(CORE, name), "utf8")

type Row = {
  id: string
  email: string
  code_hash: string
  attempts: number
  created_at: string
  consumed_at: string | null
  sent_ip: string | null
  sends: number
}

/** The core DB's login_codes table, built from the migrations THEMSELVES — so a
 * migration that forgets a column fails here, not in production. */
function coreDb() {
  const db = new DatabaseSync(":memory:")
  const base = migration("0001_core_auth.sql")
  db.exec(/CREATE TABLE login_codes[\s\S]*?\);/.exec(base)![0])
  db.exec(/CREATE INDEX idx_login_codes_email[^;]*;/.exec(base)![0])
  db.exec(migration("0015_login_send_throttle.sql")) // the throttle's own columns
  return db
}

/** The slice of the D1 binding this path uses, over real SQLite. Each statement
 * runs ATOMICALLY (as D1 does); the awaits in between are where concurrent
 * requests interleave — which is exactly the race being tested. */
function d1(db: DatabaseSync) {
  const statements: string[] = []
  return {
    statements,
    prepare(sql: string) {
      statements.push(sql.replace(/\s+/g, " ").trim())
      const stmt = db.prepare(sql)
      let args: unknown[] = []
      const api = {
        bind(...a: unknown[]) {
          args = a
          return api
        },
        async first<T>(): Promise<T | null> {
          return (stmt.get(...(args as SqlValue[])) ?? null) as T | null
        },
        async run() {
          const r = stmt.run(...(args as SqlValue[]))
          return { meta: { changes: Number(r.changes) } }
        },
      }
      return api
    },
  }
}

const EMAIL = "person@example.com"
const IP = "203.0.113.7"

function fresh() {
  const db = coreDb()
  const door = d1(db)
  const ask = (email = EMAIL, ip = IP) => mintLoginCode({ DB: door } as never, email, ip)
  const rows = () => db.prepare("SELECT * FROM login_codes ORDER BY created_at DESC").all() as unknown as Row[]
  /** Move every stored row `seconds` further into the past (no clock mocking). */
  const age = (seconds: number) => {
    for (const r of rows())
      db.prepare("UPDATE login_codes SET created_at = ? WHERE id = ?").run(
        new Date(Date.parse(r.created_at) - seconds * 1000).toISOString(),
        r.id
      )
  }
  const consumeAll = () => db.prepare("UPDATE login_codes SET consumed_at = 'used'").run()
  return { db, door, ask, rows, age, consumeAll }
}

/** Fill ONE address's hourly quota, spacing each request past the cooldown. */
async function fillQuota(t: ReturnType<typeof fresh>) {
  for (let i = 0; i < MAX_CODES_PER_HOUR; i++) {
    expect(await t.ask(), `code ${i + 1} of the cap`).toHaveProperty("code")
    t.age(61)
  }
}

describe("login-code throttle (per address)", () => {
  it("a second request inside the cooldown is refused — in SECONDS, not an hour", async () => {
    const t = fresh()
    expect(await t.ask()).toHaveProperty("code")
    const again = await t.ask()
    expect(again).toMatchObject({ status: 429, error: "too_soon" })
    expect(JSON.stringify(again), "the refusal must never say 'hour'").not.toMatch(/hour/i)
  })

  it("past the hourly cap the owner of the inbox STILL gets a code", async () => {
    const t = fresh()
    await fillQuota(t)
    expect(t.rows().length).toBe(MAX_CODES_PER_HOUR)

    const past = await t.ask() // the request that used to be a one-hour lockout
    expect(past, "past the cap must still yield a usable code").toHaveProperty("code")
    expect(t.rows().length, "rotation must not grow the table").toBe(MAX_CODES_PER_HOUR)
    expect(
      t.door.statements.some((s) => s.startsWith("UPDATE login_codes")),
      "it rotated in place"
    ).toBe(true)
  })

  it("rotation issues a NEW secret and resets the attempt budget", async () => {
    const t = fresh()
    await fillQuota(t)
    const before = t.rows()
    t.db.prepare("UPDATE login_codes SET attempts = 3 WHERE id = ?").run(before[0].id)

    await t.ask()
    const after = t.rows()
    expect(after.filter((r, i) => r.code_hash !== before[i].code_hash).length, "exactly one row rotated").toBe(1)
    expect(after[0].attempts, "a rotated code starts its attempt budget again").toBe(0)
    // …and only an UNCONSUMED code may be rotated (a spent code stays spent).
    const update = t.door.statements.find((s) => s.startsWith("UPDATE login_codes")) as string
    expect(update).toContain("consumed_at IS NULL")
  })

  // EARNED, not designed: the first cooldown counted consumed codes too, so
  // signing in on a laptop and then a phone made the second device wait a minute.
  it("a CONSUMED code doesn't hold the cooldown — laptop, then phone", async () => {
    const t = fresh()
    expect(await t.ask()).toHaveProperty("code")
    t.consumeAll() // signed in on the laptop
    expect(
      await t.ask(),
      "the phone must get a code straight away — the first one is already spent"
    ).toHaveProperty("code")
  })

  it("with nothing live to rotate it mints, so a returning user is never stuck", async () => {
    const t = fresh()
    await fillQuota(t)
    t.consumeAll()
    expect(await t.ask(), "every code consumed → mint a fresh one").toHaveProperty("code")
  })
})

describe("the throttle rides the write (a burst can't outrun it)", () => {
  it("ten simultaneous requests for ONE address send exactly ONE code", async () => {
    const t = fresh()
    const results = await Promise.all(Array.from({ length: 10 }, () => t.ask()))
    const sent = results.filter((r) => "code" in r)
    expect(sent.length, "read-then-write let every request through the cooldown at once").toBe(1)
    expect(t.rows().length, "…and each one wrote a row").toBe(1)
    for (const r of results.filter((x) => "error" in x)) expect(r).toMatchObject({ status: 429 })
  })

  it("one caller can't walk a mailing list — the per-IP budget holds under a burst", async () => {
    const t = fresh()
    const asks = Array.from({ length: MAX_SENDS_PER_IP_PER_HOUR + 20 }, (_, i) =>
      t.ask(`victim${i}@example.com`)
    )
    const results = await Promise.all(asks)
    const sent = results.filter((r) => "code" in r)
    expect(sent.length, "the caller's hourly send budget is the ceiling").toBe(MAX_SENDS_PER_IP_PER_HOUR)
    expect(t.rows().length).toBe(MAX_SENDS_PER_IP_PER_HOUR)
    expect(results.filter((r) => "error" in r && r.error === "too_many_sends").length).toBe(20)
  })

  it("a fresh IP per request still can't outrun the GLOBAL ceiling", async () => {
    const t = fresh()
    const n = MAX_SENDS_GLOBAL_PER_HOUR + 20
    const results = await Promise.all(
      Array.from({ length: n }, (_, i) => t.ask(`stranger${i}@example.com`, `198.51.100.${i}`))
    )
    expect(
      results.filter((r) => "code" in r).length,
      "a botnet spreads across IPs — only the global ceiling sees that"
    ).toBe(MAX_SENDS_GLOBAL_PER_HOUR)
  })

  // A ROTATION emails a fresh code without inserting a row. Counting rows would
  // have let a caller pay for a handful of rows once, then rotate them forever —
  // one mail a minute per address, past every budget. So sends are counted.
  it("a rotation is charged to the caller's budget too", async () => {
    const t = fresh()
    await fillQuota(t) // 5 rows = 5 sends
    let rotations = 0
    for (let i = 0; i < MAX_SENDS_PER_IP_PER_HOUR; i++) {
      const r = await t.ask()
      if ("code" in r) rotations++
      else {
        expect(r).toMatchObject({ error: "too_many_sends" })
        break
      }
      t.age(61)
    }
    expect(rotations, "rotations spend the same budget as mints").toBe(
      MAX_SENDS_PER_IP_PER_HOUR - MAX_CODES_PER_HOUR
    )
    expect(t.rows().length, "…while still not growing the table").toBe(MAX_CODES_PER_HOUR)
  })
})

describe("the caller's identity fails toward refusing", () => {
  const req = (headers: Record<string, string> = {}) =>
    new Request("https://app.example/api/auth/email/start", { method: "POST", headers })

  it("the edge header names the bucket", () => {
    expect(clientIp(req({ "CF-Connecting-IP": "203.0.113.9" }))).toBe("203.0.113.9")
  })

  it("no header is not a free pass — every header-less caller shares ONE bucket", async () => {
    expect(clientIp(req()), "an absent header must never become an unlimited one").toBe("unknown")
    const t = fresh()
    const mine = clientIp(req())
    const theirs = clientIp(req({ "CF-Connecting-IP": "   " })) // blank counts as absent too
    expect(theirs).toBe(mine)

    const results = await Promise.all(
      Array.from({ length: MAX_SENDS_PER_IP_PER_HOUR + 5 }, (_, i) =>
        t.ask(`anon${i}@example.com`, i % 2 ? mine : theirs)
      )
    )
    expect(
      results.filter((r) => "code" in r).length,
      "two header-less callers must spend ONE budget between them"
    ).toBe(MAX_SENDS_PER_IP_PER_HOUR)
  })

  it("a hostile header can't break the write (NULs stripped, length capped)", async () => {
    // Straight from a header the runtime accepts: over-long, so it gets capped.
    expect(clientIp(req({ "CF-Connecting-IP": "9".repeat(200) })).length).toBeLessThanOrEqual(45)
    // A NUL byte can't ride a real Header (the runtime refuses to build one), so
    // the strip is proved against the raw value — belt and braces, because D1
    // turns an embedded NUL into a 500 and this door is pre-authentication.
    const nasty = `1.2.3.4${String.fromCharCode(0)}${"9".repeat(200)}`
    const bucket = clientIp({ headers: { get: () => nasty } } as unknown as Request)
    expect(bucket).not.toContain(String.fromCharCode(0))
    expect(bucket.length).toBeLessThanOrEqual(45)
    const t = fresh()
    expect(await t.ask(EMAIL, bucket), "a strange header must not break sign-in").toHaveProperty("code")
  })
})
