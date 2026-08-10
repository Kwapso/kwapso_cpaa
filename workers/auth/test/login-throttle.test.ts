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
// AND THEN THE CURE BECAME THE DISEASE, TWICE. Both halves are in here now:
//   • the environment-wide ceiling was a hard refusal, so ten source IPs could
//     spend it and lock EVERY legitimate person out of the only entrance to the
//     product for the rest of the hour. It rations now instead of refusing, and
//     the tests below prove an ordinary person still gets a code mid-flood.
//   • the verify door's attempt cap was one shared pool, so five junk requests
//     killed a freshly minted code and the person who asked for it could not sign
//     in. The five tries are two lanes now, and the tests prove a junk burst
//     leaves the owner's lane untouched.
// A test that only checks a cap still holds is testing the old fear. Both are
// here: the cap AND the lockout it must not become.
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
  MAX_CODE_ATTEMPTS,
  MAX_CODE_ATTEMPTS_ELSEWHERE,
  MAX_CODES_PER_HOUR,
  MAX_SENDS_PER_IP_PER_HOUR,
  MAX_SENDS_PER_IP_WHEN_RATIONED,
  SENDS_EVERYWHERE_BEFORE_RATIONING,
  MAX_TEST_LOGIN_SENDS_PER_HOUR,
  TEST_LOGIN_BUCKET,
} from "../src/lib/constants"
import { clientIp, mintLoginCode, verifyLoginCode } from "../src/lib/login-codes"

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
  db.exec(migration("0017_login_send_ledger.sql")) // the send ledger the budget reads
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
/** Whoever is posting junk at someone else's code. Never the address that asked. */
const STRANGER_IP = "198.51.100.66"

/** A 6-digit code that is definitely NOT the real one (which is random). */
const wrong = (real: string) => (real === "000000" ? "111111" : "000000")

function fresh() {
  const db = coreDb()
  const door = d1(db)
  const ask = (email = EMAIL, ip = IP) => mintLoginCode({ DB: door } as never, email, ip)
  const verify = (code: string, ip = IP, email = EMAIL) =>
    verifyLoginCode({ DB: door } as never, email, code, ip)
  /** Ask, and hand back the plain code the inbox would have received. */
  const askForCode = async (email = EMAIL, ip = IP) => {
    const r = await mintLoginCode({ DB: door } as never, email, ip)
    if (!("code" in r)) throw new Error(`expected a code, got ${JSON.stringify(r)}`)
    return r.code
  }
  const rows = () => db.prepare("SELECT * FROM login_codes ORDER BY created_at DESC").all() as unknown as Row[]
  /** Move every stored row `seconds` further into the past (no clock mocking). */
  const age = (seconds: number) => {
    // The ledger ages with the codes — otherwise every budget test is really a
    // cooldown test, and the number it thinks it is measuring never moves.
    for (const s of db.prepare("SELECT id, created_at FROM login_sends").all() as unknown as { id: string; created_at: string }[])
      db.prepare("UPDATE login_sends SET created_at = ? WHERE id = ?").run(
        new Date(Date.parse(s.created_at) - seconds * 1000).toISOString(),
        s.id
      )
    for (const r of rows())
      db.prepare("UPDATE login_codes SET created_at = ? WHERE id = ?").run(
        new Date(Date.parse(r.created_at) - seconds * 1000).toISOString(),
        r.id
      )
  }
  /** Age the CODES only, leaving the send ledger where it is.
   *
   * The cooldown lives on login_codes; the budget window lives on login_sends.
   * Ageing both together slides the budget's own hour out from under the test,
   * so a budget test using `age` measures nothing and passes over the bug. */
  const passCooldown = (seconds = 61) => {
    for (const r of rows())
      db.prepare("UPDATE login_codes SET created_at = ? WHERE id = ?").run(
        new Date(Date.parse(r.created_at) - seconds * 1000).toISOString(),
        r.id
      )
  }
  const consumeAll = () => db.prepare("UPDATE login_codes SET consumed_at = 'used'").run()
  /** Sends this hour, everywhere — the number the rationing line is drawn on. */
  const sentEverywhere = () =>
    (db.prepare("SELECT COUNT(*) AS n FROM login_sends").get() as { n: number }).n
  return { db, door, ask, askForCode, verify, rows, age, passCooldown, consumeAll, sentEverywhere }
}

/** Put the environment past its hourly line the only way an attacker can: many
 * separate callers, none of them near their OWN ceiling. `per` stays well under
 * MAX_SENDS_PER_IP_PER_HOUR so nothing here is refused by the per-caller cap —
 * what the tests below observe must be the environment's line, not that one. */
async function flood(t: ReturnType<typeof fresh>, callers: number, per: number) {
  for (let c = 0; c < callers; c++)
    for (let i = 0; i < per; i++)
      expect(await t.ask(`flood-${c}-${i}@example.com`, `192.0.2.${c}`), "the flood itself is not refused").toHaveProperty("code")
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

// The environment-wide number used to be a hard refusal on both write paths. That
// made it a lockout switch for the whole product: ten source IPs, a tenth of a
// request per second each, and nobody gets a sign-in code for the rest of the
// hour — on either public door, with no password and no other way in. The bound
// meant to shrink an attack had turned it into a better one.
//
// It rations now instead of refusing. Over the line, every caller narrows to a
// small share, so the flood — far over that share — is what stops. The two tests
// below are the two halves of that sentence, and BOTH have to hold: the old
// "prove the ceiling still refuses at 300" test was retired here on purpose,
// because passing it is now the bug.
describe("a crowded hour rations the crowd — it does not close the door", () => {
  /** Enough separate callers, five sends each, to put the hour past its line. */
  const CALLERS = Math.ceil(SENDS_EVERYWHERE_BEFORE_RATIONING / MAX_SENDS_PER_IP_WHEN_RATIONED) + 2

  it("a flood from many addresses can't stop an ordinary person getting a code", async () => {
    const t = fresh()
    await flood(t, CALLERS, MAX_SENDS_PER_IP_WHEN_RATIONED)
    expect(t.sentEverywhere(), "the flood really did cross the line").toBeGreaterThanOrEqual(
      SENDS_EVERYWHERE_BEFORE_RATIONING
    )

    // Someone who has asked for nothing this hour, signing in for the first time,
    // mid-flood. Under the old hard ceiling this was `too_many_sends` — a stranger
    // spending a shared number they had no part in.
    expect(
      await t.ask("newcomer@example.com", "203.0.113.200"),
      "an ordinary person must never be collateral for someone else's flood"
    ).toHaveProperty("code")
  })

  it("…and the flood's own callers are the ones the ration refuses", async () => {
    const t = fresh()
    await flood(t, CALLERS, MAX_SENDS_PER_IP_WHEN_RATIONED)

    // Each flood caller sits at exactly the rationed share and nowhere near its
    // own hourly ceiling — so a refusal here can only be the ration biting.
    const again = await t.ask("flood-0-again@example.com", "192.0.2.0")
    expect(again, "over the line, a caller past their share stops").toMatchObject({
      status: 429,
      error: "too_many_sends",
    })
    expect(
      MAX_SENDS_PER_IP_WHEN_RATIONED,
      "the ration must bite long before the per-caller ceiling, or this proves nothing"
    ).toBeLessThan(MAX_SENDS_PER_IP_PER_HOUR)
  })

  it("under the line the environment's number is silent", async () => {
    const t = fresh()
    // A busy but ordinary hour: nowhere near the line, so one caller may still
    // spend their full per-caller ceiling — the ration must not leak downward
    // into normal traffic.
    for (let i = 0; i < MAX_SENDS_PER_IP_WHEN_RATIONED + 3; i++)
      expect(await t.ask(`quiet${i}@example.com`, "203.0.113.44")).toHaveProperty("code")
    expect(t.sentEverywhere()).toBeLessThan(SENDS_EVERYWHERE_BEFORE_RATIONING)
  })
})

// ANYONE WHO KNOWS AN EMAIL ADDRESS COULD LOCK THAT PERSON OUT. The verify door is
// unauthenticated and keyed on the address alone, and it used to burn an attempt
// slot for EVERY caller before comparing the hash — so five junk requests against
// a freshly minted code destroyed it, and the person who actually asked could not
// sign in. Sign-in is the only way into the product; there is no password.
//
// The five tries are two lanes now: whoever the code was last sent to (sent_ip —
// earned by paying the send throttle's price) keeps all five, and everybody else
// shares a small one. The cap itself is untouched — a 6-digit code is a million
// guesses, and five is what stops it being walked.
describe("a stranger's wrong guesses cost the stranger, not the person signing in", () => {
  it("a burst of junk verify attempts does NOT stop the real person signing in", async () => {
    const t = fresh()
    const code = await t.askForCode(EMAIL, IP) // the victim asked; the code is in their inbox

    for (let i = 0; i < MAX_CODE_ATTEMPTS * 4; i++) {
      const junk = await t.verify(wrong(code), STRANGER_IP)
      expect(junk, "junk from elsewhere is always refused").toHaveProperty("error")
    }

    expect(
      await t.verify(code, IP),
      "the person who asked for the code must still be able to use it"
    ).toHaveProperty("id")
  })

  it("rotating addresses buys a guesser nothing — the small lane is the code's, not the caller's", async () => {
    const t = fresh()
    const code = await t.askForCode(EMAIL, IP)
    for (let i = 0; i < 40; i++) await t.verify(wrong(code), `198.51.100.${i}`)
    expect(
      t.rows()[0].attempts,
      "every stranger, however many addresses they own, shares ONE small lane"
    ).toBe(MAX_CODE_ATTEMPTS_ELSEWHERE)
    expect(await t.verify(code, IP), "…and the owner's tries were never touched").toHaveProperty("id")
  })

  it("the lane rides the write — simultaneous guesses can't each read a stale count", async () => {
    const t = fresh()
    const code = await t.askForCode(EMAIL, IP)
    const at_once = await Promise.all(
      Array.from({ length: 20 }, () => t.verify(wrong(code), STRANGER_IP))
    )
    expect(
      at_once.filter((r) => "error" in r && r.error === "wrong_code").length,
      "read-then-write would have let all twenty through at once"
    ).toBe(MAX_CODE_ATTEMPTS_ELSEWHERE)
    expect(t.rows()[0].attempts).toBe(MAX_CODE_ATTEMPTS_ELSEWHERE)
  })

  // THE CAP IS STILL THE CAP. It is the only thing standing between a 6-digit
  // code and a million tries, so widening a lane must never widen the total.
  it("five wrong guesses is still the whole budget, right code or not", async () => {
    const t = fresh()
    const code = await t.askForCode(EMAIL, IP)
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++)
      expect(await t.verify(wrong(code), IP), `guess ${i + 1}`).toMatchObject({ error: "wrong_code" })

    expect(await t.verify(wrong(code), IP), "the sixth guess").toMatchObject({
      status: 429,
      error: "too_many_attempts",
    })
    expect(
      await t.verify(code, IP),
      "not even the RIGHT code past the cap — otherwise a brute-forcer who finally lands on it walks in"
    ).toMatchObject({ error: "too_many_attempts" })
    expect(t.rows()[0].consumed_at, "…and nothing was consumed").toBeNull()
  })

  it("a correct code costs no try at all — the cap counts failures now, not attempts", async () => {
    const t = fresh()
    const code = await t.askForCode(EMAIL, IP)
    expect(await t.verify(wrong(code), IP)).toMatchObject({ error: "wrong_code" })

    expect(await t.verify(code, IP)).toHaveProperty("id")
    expect(t.rows()[0].attempts, "one mistype charged, the right code free").toBe(1)
    expect(t.rows()[0].consumed_at, "and spent, so it can't be replayed").not.toBeNull()
  })

  it("asking again takes the lane back, with a clean budget", async () => {
    const t = fresh()
    await t.askForCode(EMAIL, IP)
    // A stranger asks for a code too: it goes to the inbox's OWNER, and it costs
    // the stranger a send — but it does move the reserved lane to them.
    t.age(61)
    await t.askForCode(EMAIL, STRANGER_IP)
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) await t.verify("000000", STRANGER_IP)
    expect(t.rows()[0].attempts, "the stranger spent the whole budget while holding the lane").toBe(
      MAX_CODE_ATTEMPTS
    )

    // The owner's answer is the one they always had, and it is under a minute
    // away: ask again. (Rotation's own budget reset is locked further up.)
    t.age(61)
    const mine = await t.askForCode(EMAIL, IP)
    expect(t.rows()[0].attempts, "a fresh code comes with a clean budget").toBe(0)
    expect(await t.verify(mine, IP), "…and the reserved lane comes back with it").toHaveProperty("id")
  })

  it("an expired code is expired, whoever asks", async () => {
    const t = fresh()
    const code = await t.askForCode(EMAIL, IP)
    t.db.prepare("UPDATE login_codes SET expires_at = '2000-01-01T00:00:00.000Z'").run()
    expect(await t.verify(code, IP)).toMatchObject({ status: 400, error: "code_expired" })
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

// THE VERIFICATION MUST NOT BE ABLE TO LOCK ITSELF OUT.
//
// The non-production test-login door mints a code and hands it back to the
// TEST_LOGIN_KEY holder. It sends no email. But it used to charge the send to
// the calling machine's address, so it shared the thirty-an-hour budget meant to
// bound anonymous mail — and running the smoke suite twice in an hour refused
// the smoke suite. A budget that stops us checking whether the door works is not
// protecting the door.
//
// Found by running the real smoke against staging and being refused.
describe("the test door has a budget of its own", () => {
  it("mints far past the hourly ceiling a person would hit", async () => {
    const { ask } = fresh()
    // Comfortably past MAX_SENDS_PER_IP_PER_HOUR (30): a person is capped here,
    // the automation must not be.
    for (let i = 0; i < 60; i++) {
      const out = await ask(`run${i}@example.com`, TEST_LOGIN_BUCKET)
      expect(out, `mint ${i + 1} must succeed`).not.toHaveProperty("error")
    }
  })

  it("does not spend the budget an ordinary caller needs", async () => {
    const { ask } = fresh()
    for (let i = 0; i < 60; i++) await ask(`run${i}@example.com`, TEST_LOGIN_BUCKET)
    // A real person, on a real address, arriving after all that: still served.
    expect(await ask("someone@example.com", "203.0.113.9")).not.toHaveProperty("error")
  })

  it("is still bounded — it is a bigger budget, not an absent one", async () => {
    const { ask } = fresh()
    let refused = false
    for (let i = 0; i < MAX_TEST_LOGIN_SENDS_PER_HOUR + 5; i++) {
      const out = await ask(`bulk${i}@example.com`, TEST_LOGIN_BUCKET)
      if ("error" in out) { refused = true; break }
    }
    expect(refused, "the test door must have a ceiling of its own").toBe(true)
  })
})

// A LEDGER THAT CAN CHANGE HANDS IS NOT A LEDGER.
//
// The budget used to be SUM(login_codes.sends) keyed on login_codes.sent_ip —
// but `sent_ip` legitimately MOVES on a rotation, because whoever just asked is
// the person about to type the code, and that is what earns them the reserved
// attempt lane. The accumulated `sends` moved with it. So the charge was a token
// held by whoever wrote last:
//
//   • two addresses taking turns on one email never paid — at each write the
//     heavy row belonged to the OTHER one, so each writer's own bucket read
//     near zero and the per-caller ceiling never bit;
//   • and the whole accumulated charge landed on the next honest asker, who was
//     then refused for sends they had never made, and told it was "a lot of
//     sign-in codes from one place".
//
// One row per send now (migration 0017), attributed when it happens and never
// reassigned.
describe("the send ledger cannot be handed to someone else", () => {
  it("two addresses taking turns both pay their own way", async () => {
    const { ask, passCooldown } = fresh()
    const A = "198.51.100.7"
    const B = "203.0.113.7"
    let refusedA = 0
    let refusedB = 0
    // ONE address, alternating callers — because the transfer only happens on a
    // ROTATION, and a rotation needs a live code for the same email. Distinct
    // emails would mint a fresh row each time, `sent_ip` would never move, and
    // the test would pass just as happily over the bug.
    //
    // The COOLDOWN is cleared between asks; the ledger is left alone, so what
    // is measured is the budget's own trailing hour.
    for (let i = 0; i < MAX_SENDS_PER_IP_PER_HOUR + 8; i++) {
      passCooldown()
      if ("error" in (await ask(EMAIL, A))) refusedA++
      passCooldown()
      if ("error" in (await ask(EMAIL, B))) refusedB++
    }
    // Under the old ledger both were ZERO: at each write the accumulated charge
    // sat on the row, which belonged to the OTHER caller, so each writer's own
    // bucket read about one.
    expect(refusedA, "A must hit its own ceiling").toBeGreaterThan(0)
    expect(refusedB, "…and so must B — neither can hide behind the other").toBeGreaterThan(0)
  })

  it("does not dump one caller's charge on the next honest person", async () => {
    const { ask, passCooldown } = fresh()
    const attacker = "198.51.100.9"
    // The attacker works the victim's address up to their own ceiling.
    for (let i = 0; i < MAX_SENDS_PER_IP_PER_HOUR + 5; i++) { passCooldown(); await ask(EMAIL, attacker) }
    passCooldown()
    // Now the owner of that inbox asks, from their own address, for the first time.
    const owner = await ask(EMAIL, "192.0.2.44")
    expect(owner, "the person who has sent nothing must not be refused").not.toHaveProperty("error")
  })

  it("a rotation is charged to whoever asked for it, not to the row", async () => {
    const { ask, db, passCooldown } = fresh()
    const first = "198.51.100.1"
    const second = "203.0.113.1"
    await ask(EMAIL, first)
    passCooldown()
    await ask(EMAIL, second) // rotates the live row, moving sent_ip to `second`
    const rows = db
      .prepare("SELECT ip, COUNT(*) AS n FROM login_sends GROUP BY ip ORDER BY ip")
      .all() as { ip: string; n: number }[]
    // One send each, on the ledger, permanently.
    expect(rows.map((r) => [r.ip, r.n])).toEqual([
      [first, 1],
      [second, 1],
    ])
  })
})
