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

import { describe, expect, it } from "vitest"

import { MAX_CODES_PER_HOUR } from "../src/lib/constants"
import { mintLoginCode } from "../src/lib/login-codes"

type Row = { id: string; email: string; code_hash: string; created_at: string; consumed_at: string | null }

/** A stub core DB that understands only the statements this path issues. Rows
 * store the timestamp the code itself bound, so no clock mocking is needed —
 * "time passes" by ageing the stored rows (see `age`). */
function fakeDb() {
  const rows: Row[] = []
  const statements: string[] = []
  const db = {
    rows,
    statements,
    prepare(sql: string) {
      const flat = sql.replace(/\s+/g, " ").trim()
      statements.push(flat)
      let a: unknown[] = []
      const api = {
        bind(...args: unknown[]) {
          a = args
          return api
        },
        async first<T>(): Promise<T | null> {
          const [email, since] = [String(a[0]), String(a[1])]
          let matching = rows.filter((r) => r.email === email && r.created_at > since)
          if (flat.includes("COUNT(*)")) return { n: matching.length } as T
          // the cooldown probe only sees UNCONSUMED codes
          if (flat.includes("consumed_at IS NULL")) matching = matching.filter((r) => r.consumed_at === null)
          return (matching[0] ? ({ id: matching[0].id } as T) : null)
        },
        async run() {
          if (flat.startsWith("UPDATE login_codes")) {
            const [hash, , createdAt, email] = [String(a[0]), a[1], String(a[2]), String(a[3])]
            const live = rows
              .filter((r) => r.email === email && r.consumed_at === null)
              .sort((x, y) => (x.created_at < y.created_at ? 1 : -1))[0]
            if (!live) return { meta: { changes: 0 } }
            live.code_hash = hash
            live.created_at = createdAt
            return { meta: { changes: 1 } }
          }
          rows.push({
            id: String(a[0]),
            email: String(a[1]),
            code_hash: String(a[2]),
            created_at: String(a[4]),
            consumed_at: null,
          })
          return { meta: { changes: 1 } }
        },
      }
      return api
    },
  }
  return db
}

const EMAIL = "person@example.com"
const ask = (db: ReturnType<typeof fakeDb>) => mintLoginCode({ DB: db } as never, EMAIL)
/** Move every stored row `seconds` further into the past. */
const age = (db: ReturnType<typeof fakeDb>, seconds: number) => {
  for (const r of db.rows) r.created_at = new Date(Date.parse(r.created_at) - seconds * 1000).toISOString()
}

/** Fill the hourly quota, spacing each request past the cooldown. */
async function fillQuota(db: ReturnType<typeof fakeDb>) {
  for (let i = 0; i < MAX_CODES_PER_HOUR; i++) {
    expect(await ask(db), `code ${i + 1} of the cap`).toHaveProperty("code")
    age(db, 61)
  }
}

describe("login-code throttle", () => {
  it("a second request inside the cooldown is refused — in SECONDS, not an hour", async () => {
    const db = fakeDb()
    expect(await ask(db)).toHaveProperty("code")
    const again = await ask(db)
    expect(again).toMatchObject({ status: 429, error: "too_soon" })
    expect(JSON.stringify(again), "the refusal must never say 'hour'").not.toMatch(/hour/i)
  })

  it("past the hourly cap the owner of the inbox STILL gets a code", async () => {
    const db = fakeDb()
    await fillQuota(db)
    expect(db.rows.length).toBe(MAX_CODES_PER_HOUR)

    const past = await ask(db) // the request that used to be a one-hour lockout
    expect(past, "past the cap must still yield a usable code").toHaveProperty("code")
    expect(db.rows.length, "rotation must not grow the table").toBe(MAX_CODES_PER_HOUR)
    expect(db.statements.some((s) => s.startsWith("UPDATE login_codes")), "it rotated in place").toBe(true)
  })

  it("rotation issues a NEW secret and resets the attempt budget", async () => {
    const db = fakeDb()
    await fillQuota(db)
    const hashesBefore = db.rows.map((r) => r.code_hash)
    await ask(db)
    const changed = db.rows.filter((r, i) => r.code_hash !== hashesBefore[i])
    expect(changed.length, "exactly one row rotated").toBe(1)
    const update = db.statements.find((s) => s.startsWith("UPDATE login_codes")) as string
    expect(update, "a rotated code starts its attempt budget again").toContain("attempts = 0")
    expect(update, "…and only an unconsumed code may be rotated").toContain("consumed_at IS NULL")
  })

  // EARNED, not designed: the first cooldown counted consumed codes too, so
  // signing in on a laptop and then a phone made the second device wait a minute.
  it("a CONSUMED code doesn't hold the cooldown — laptop, then phone", async () => {
    const db = fakeDb()
    expect(await ask(db)).toHaveProperty("code")
    db.rows.forEach((r) => (r.consumed_at = "used")) // signed in on the laptop
    expect(
      await ask(db),
      "the phone must get a code straight away — the first one is already spent"
    ).toHaveProperty("code")
  })

  it("with nothing live to rotate it mints, so a returning user is never stuck", async () => {
    const db = fakeDb()
    await fillQuota(db)
    db.rows.forEach((r) => (r.consumed_at = "used"))
    expect(await ask(db), "every code consumed → mint a fresh one").toHaveProperty("code")
  })
})
