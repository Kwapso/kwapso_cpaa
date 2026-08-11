// THE ERROR STORE HAS A CEILING, AND IT MUST NOT BECOME A CENSOR.
//
// `POST /api/log/client` on both gateways forwards a browser's crash into the
// GLOBAL core `error_logs`. It has been session-verified since the anonymous-
// write fix, and every FIELD is length-capped in logError — but the ROW COUNT
// was capped nowhere: no rate limit, no per-caller ceiling, no dedup, no
// retention job. One signed-in person with a loop could grow the core database
// until it hit its size alarm, and the store that exists to say what broke would
// be the thing that broke.
//
// So the budget RIDES THE INSERT (the login_sends pattern — CONCURRENCY.md: the
// predicate in the WHERE, never a read-then-write a burst can walk through).
//
// AND THE THREE WAYS THE CURE COULD BE WORSE THAN THE DISEASE, all tested here:
//   • one noisy caller must not spend anybody ELSE's budget — the bucket is per
//     person, so a second person still gets recorded mid-flood;
//   • a flood of client beacons must not spend the budget a crashing WORKER needs
//     to report itself — a row with no user is charged to its source instead;
//   • and going over must never THROW. This seam's whole contract is that
//     recording never breaks the request it is recording, so over the line is
//     silence, exactly as a failed insert already was.
//
// Real SQLite with the real migrations applied (0012 + 0018), because a stub that
// "understands" the statement would happily agree with a broken WHERE clause, and
// what is being tested is what the SQL does.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync, type SqlValue } from "node:sqlite"
import { describe, expect, it } from "vitest"

import { logError, MAX_ERROR_LOGS_PER_HOUR } from "@shared/workers/error-log"

const CORE = join(__dirname, "..", "..", "..", "db", "core")
const migration = (name: string) => readFileSync(join(CORE, name), "utf8")

/** The core DB's error_logs table + its bucket index, built from the migrations
 * THEMSELVES — so a migration that forgets the index fails here, not in
 * production under a table nobody noticed was being scanned. */
function coreDb() {
  const db = new DatabaseSync(":memory:")
  db.exec(migration("0012_error_logs.sql"))
  db.exec(migration("0019_error_log_bound.sql"))
  return db
}

/** The slice of the D1 binding logError uses, over real SQLite. */
function d1(db: DatabaseSync) {
  return {
    prepare(sql: string) {
      const stmt = db.prepare(sql)
      let args: unknown[] = []
      const api = {
        bind(...a: unknown[]) {
          args = a
          return api
        },
        async run() {
          return { meta: { changes: Number(stmt.run(...(args as SqlValue[])).changes) } }
        },
      }
      return api
    },
  }
}

const ALICE = "01USERALICE"
const BOB = "01USERBOB"

function fresh() {
  const db = coreDb()
  const door = d1(db)
  const beacon = (userId: string | undefined, message = "Boom") =>
    logError(door, { source: "web", place: "/t/x", message, userId })
  const count = (where: string) =>
    Number((db.prepare(`SELECT COUNT(*) AS n FROM error_logs WHERE ${where}`).get() as { n: number }).n)
  return { db, beacon, count }
}

/** Push every stored row `minutes` into the past — the window is a trailing hour
 * read off `at`, so this is how a later hour is reached without a clock mock. */
const rewind = (db: DatabaseSync, minutes: number) =>
  db.exec(`UPDATE error_logs SET at = datetime(at, '-${minutes} minutes')`)

describe("the client error beacon is bounded per caller", () => {
  it("records one person's crashes up to the ceiling, then stops", async () => {
    const { beacon, count } = fresh()
    for (let i = 0; i < MAX_ERROR_LOGS_PER_HOUR + 25; i++) await beacon(ALICE, `Boom ${i}`)
    expect(count(`user_id = '${ALICE}'`)).toBe(MAX_ERROR_LOGS_PER_HOUR)
  })

  it("a varied message buys nothing — the bound is on ROWS, not on repeats", async () => {
    // Said out loud because it is why a dedup window alone would not have done:
    // the message is the caller's own body, so anything keyed on its CONTENT is
    // defeated by a counter in the string.
    const { beacon, count } = fresh()
    for (let i = 0; i < MAX_ERROR_LOGS_PER_HOUR + 40; i++) await beacon(ALICE, `Error #${i} at ${Math.random()}`)
    expect(count("1 = 1")).toBe(MAX_ERROR_LOGS_PER_HOUR)
  })

  it("…and NOBODY else pays for it: a second person is still recorded mid-flood", async () => {
    const { beacon, count } = fresh()
    for (let i = 0; i < MAX_ERROR_LOGS_PER_HOUR + 50; i++) await beacon(ALICE, `Boom ${i}`)
    await beacon(BOB, "Bob's real crash")
    expect(count(`user_id = '${BOB}'`), "a flood must never spend someone else's budget").toBe(1)
  })

  it("a flood of beacons must not silence a crashing WORKER", async () => {
    const { db, beacon, count } = fresh()
    for (let i = 0; i < MAX_ERROR_LOGS_PER_HOUR + 50; i++) await beacon(ALICE, `Boom ${i}`)
    // A worker's central catch: no user, so the row is charged to the worker.
    await logError(d1(db), { source: "tenancy", place: "POST /api/tenancy/roles", message: "TypeError" })
    expect(count("user_id IS NULL AND source = 'tenancy'")).toBe(1)
  })

  it("the window is a TRAILING hour — the same person is heard again next hour", async () => {
    const { db, beacon, count } = fresh()
    for (let i = 0; i < MAX_ERROR_LOGS_PER_HOUR + 5; i++) await beacon(ALICE, `Boom ${i}`)
    expect(count("1 = 1")).toBe(MAX_ERROR_LOGS_PER_HOUR)
    rewind(db, 61)
    await beacon(ALICE, "a fresh hour, a real crash")
    expect(count("1 = 1"), "a ceiling that never resets is a mute button").toBe(MAX_ERROR_LOGS_PER_HOUR + 1)
  })

  it("going over is SILENT, never an error — the seam never breaks its caller", async () => {
    const { beacon } = fresh()
    for (let i = 0; i < MAX_ERROR_LOGS_PER_HOUR; i++) await beacon(ALICE, `Boom ${i}`)
    await expect(beacon(ALICE, "one too many")).resolves.toBeUndefined()
    // …and so is a database that isn't there at all (the contract logError has
    // always carried: recording must never change the response).
    await expect(
      logError({ prepare: () => { throw new Error("no such table") } } as never, {
        source: "web",
        place: "/t/x",
        message: "Boom",
        userId: ALICE,
      })
    ).resolves.toBeUndefined()
  })
})
