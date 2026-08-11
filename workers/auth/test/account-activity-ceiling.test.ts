// THE SHARED DATABASE IS EVERYBODY'S, SO EVERY REPEATABLE WRITE INTO IT IS CAPPED.
//
// A team's own database can only be filled by that team, and filling it is their
// problem. `kwapso-core` is different: it holds every user, session, team and log
// in the platform, and when it hits D1's 10GB ceiling nobody has an app. So a
// write into core that an ordinary signed-in session can repeat at will needs a
// per-caller ceiling — and `logAccountActivity` had none. Setting your first name
// to "a", then "b", then "a" again appends a row every single time, and pings your
// live channel every single time, from a door any signed-in person can hold open.
//
// The ceiling RIDES THE INSERT (CONCURRENCY.md). A read-then-write ceiling is a
// suggestion under load: N concurrent renames all read "under the line" and all
// write. These tests run against real SQLite with the real migration so the WHERE
// clause is the thing being measured, not a stub's opinion of it.
//
// And the ceiling drops the ROW, never the CHANGE. The rename has already
// happened by the time this is called; a history note that could undo the thing
// it describes would be a worse bug than the one being fixed.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync, type SqlValue } from "node:sqlite"
import { describe, expect, it } from "vitest"

import { ACCOUNT_ACTIVITY_PER_HOUR } from "../../../shared/workers/limits"
import { logAccountActivity } from "../src/lib/account-activity"

const CORE = join(__dirname, "..", "..", "..", "db", "core")

/** The real tables, from the real migrations — a stub table would happily agree
 * with a broken WHERE clause, which is the only thing under test here. `users`
 * comes along because the row carries a foreign key to it, and node:sqlite
 * enforces those. */
function coreDb() {
  const db = new DatabaseSync(":memory:")
  const auth = readFileSync(join(CORE, "0001_core_auth.sql"), "utf8")
  db.exec(/CREATE TABLE users[\s\S]*?\);/.exec(auth)![0])
  const sql = readFileSync(join(CORE, "0007_account_activity.sql"), "utf8")
  db.exec(/CREATE TABLE account_activity[\s\S]*?\);/.exec(sql)![0])
  db.exec(/CREATE INDEX idx_account_activity_user[^;]*;/.exec(sql)![0])
  const now = new Date().toISOString()
  for (const id of ["U1", "U2"])
    db.prepare("INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)").run(
      id,
      `${id}@example.com`,
      now,
      now
    )
  return db
}

function harness() {
  const db = coreDb()
  /** Every live ping the writer sent — the fan-out that used to be as unbounded
   * as the rows. */
  const pings: string[] = []
  const env = {
    DB: {
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
    },
    REALTIME: {
      fetch: async (_url: string, init: { body?: string }) => {
        pings.push(String(init?.body ?? ""))
        return new Response("{}")
      },
    },
    INTERNAL_KEY: "k",
  } as never

  const write = (n = 1) =>
    logAccountActivity(env, "U1", { type: "name_changed", description: `rename ${n}` })
  const rows = (user = "U1") =>
    (db.prepare("SELECT COUNT(*) AS n FROM account_activity WHERE user_id = ?").get(user) as { n: number }).n
  /** Move every stored row further into the past — no clock mocking. */
  const age = (hours: number) =>
    db
      .prepare("UPDATE account_activity SET created_at = ?")
      .run(new Date(Date.now() - hours * 60 * 60 * 1000).toISOString())

  return { db, env, pings, write, rows, age }
}

describe("one person's account history is capped per hour", () => {
  it("writes up to the ceiling and refuses the row after it", async () => {
    const h = harness()
    for (let i = 0; i < ACCOUNT_ACTIVITY_PER_HOUR; i++) await h.write(i)
    expect(h.rows(), "everything under the line lands").toBe(ACCOUNT_ACTIVITY_PER_HOUR)

    await h.write(999)
    await h.write(1000)
    expect(h.rows(), "and nothing over it does").toBe(ACCOUNT_ACTIVITY_PER_HOUR)
  })

  it("a dropped row publishes nothing", async () => {
    const h = harness()
    for (let i = 0; i < ACCOUNT_ACTIVITY_PER_HOUR; i++) await h.write(i)
    const sent = h.pings.length
    expect(sent, "a written row does ping").toBe(ACCOUNT_ACTIVITY_PER_HOUR)

    await h.write(999)
    // A ping naming a row that was never written is a live event the feed can
    // only answer with a hole — and it is the half of the cost that leaves this
    // worker and lands on a Durable Object.
    expect(h.pings.length, "a refused row is silent").toBe(sent)
  })

  it("the window MOVES — yesterday's rows don't hold today's budget", async () => {
    const h = harness()
    for (let i = 0; i < ACCOUNT_ACTIVITY_PER_HOUR; i++) await h.write(i)
    h.age(2)
    await h.write(999)
    expect(h.rows(), "an hour later the person may write again").toBe(ACCOUNT_ACTIVITY_PER_HOUR + 1)
  })

  it("it is PER PERSON — one loud user doesn't silence anyone else", async () => {
    const h = harness()
    for (let i = 0; i < ACCOUNT_ACTIVITY_PER_HOUR + 5; i++) await h.write(i)
    await logAccountActivity(h.env, "U2", { type: "name_changed", description: "someone else" })
    expect(h.rows("U2")).toBe(1)
  })

  it("the profile change itself survives its own refused history note", async () => {
    // logAccountActivity is best-effort by contract: the rename already happened,
    // so hitting the ceiling must return quietly rather than throw back into the
    // handler that called it.
    const h = harness()
    for (let i = 0; i < ACCOUNT_ACTIVITY_PER_HOUR; i++) await h.write(i)
    await expect(h.write(999)).resolves.toBeUndefined()
  })
})
