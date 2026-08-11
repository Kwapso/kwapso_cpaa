// THE SAME PERSON, TWICE, AT ONCE — the front door under a double submit.
//
// Every path here shared one bug: a rule the SELECT checked and the WRITE didn't.
// A SELECT is not a write. Between the read and the update sits an await, and two
// requests that arrive together both pass a check neither of them then enforced:
//
//   • ONE LOGIN CODE, TWO SESSIONS. The consume was `WHERE id = ? AND <attempts
//     left>` — no `consumed_at IS NULL`, though the SELECT above filtered on it.
//     Two verifies holding one correct code both "consumed" it and both were
//     handed a session.
//   • …AND THE TAIL WAS WORSE. Both then reached findOrCreateUserByEmail, a
//     read-then-insert against the `users.email` UNIQUE index — so a brand-new
//     person who double-submitted got a 500 and a row in the global error_logs on
//     their very first interaction with the product.
//   • The email-change door had the identical consume, plus the identical
//     read-then-write against the same UNIQUE index.
//
// These run against a REAL SQLite database with the REAL migrations applied,
// because a stub that "understands" the statements would happily agree with a
// broken WHERE clause — and what a broken WHERE clause does when two requests
// arrive at once is the entire subject.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync, type SqlValue } from "node:sqlite"
import { describe, expect, it } from "vitest"

import { sha256Hex } from "../src/lib/crypto"
import { verifyEmailChange } from "../src/lib/email-change"
import { mintLoginCode, verifyLoginCode } from "../src/lib/login-codes"
import { findOrCreateUserByEmail, type UserRow } from "../src/lib/users"
import type { Env } from "../src/env"

const CORE = join(__dirname, "..", "..", "..", "db", "core")
const migration = (name: string) => readFileSync(join(CORE, name), "utf8")

/** The core tables these doors touch, built from the migrations THEMSELVES — so a
 * migration that drops a column or a UNIQUE index fails here, not in production.
 * The UNIQUE on `users.email` is the whole point of half this file. */
function coreDb() {
  const db = new DatabaseSync(":memory:")
  const base = migration("0001_core_auth.sql")
  db.exec(/CREATE TABLE users[\s\S]*?\);/.exec(base)![0])
  db.exec(/CREATE TABLE login_codes[\s\S]*?\);/.exec(base)![0])
  db.exec(/CREATE INDEX idx_login_codes_email[^;]*;/.exec(base)![0])
  db.exec("ALTER TABLE users ADD COLUMN current_team_id TEXT;") // 0002's one users column
  db.exec(migration("0003_remove_google.sql")) // users as it is today
  db.exec(migration("0005_email_change.sql"))
  db.exec(migration("0007_account_activity.sql"))
  db.exec(migration("0015_login_send_throttle.sql"))
  db.exec(migration("0017_login_send_ledger.sql"))
  return db
}

/** The slice of the D1 binding these paths use, over real SQLite. Each statement
 * runs ATOMICALLY (as D1 does); the awaits in between are where two concurrent
 * requests interleave — which is exactly the race under test. */
function d1(db: DatabaseSync) {
  return {
    prepare(sql: string) {
      const stmt = db.prepare(sql)
      let args: unknown[] = []
      const bound = {
        bind(...a: unknown[]) {
          args = a
          return bound
        },
        async first<T>(): Promise<T | null> {
          return (stmt.get(...(args as SqlValue[])) ?? null) as T | null
        },
        async all<T>(): Promise<{ results: T[] }> {
          return { results: stmt.all(...(args as SqlValue[])) as T[] }
        },
        async run() {
          const r = stmt.run(...(args as SqlValue[]))
          return { meta: { changes: Number(r.changes) } }
        },
      }
      return bound
    },
    async batch(stmts: { run(): Promise<{ meta: { changes: number } }> }[]) {
      const out = []
      for (const s of stmts) out.push(await s.run())
      return out
    },
  }
}

/** Enough env for these paths: the database, and a realtime binding that answers
 * so the best-effort pings neither fail nor hide a failure. No Resend key, so the
 * notice email is a no-op (it is best-effort by contract either way). */
function envFor(db: DatabaseSync): Env {
  return {
    DB: d1(db),
    REALTIME: { fetch: async () => new Response("{}") },
  } as unknown as Env
}

const EMAIL = "person@example.com"
const IP = "203.0.113.7"

/** Mint a real code the way the door does, and hand back the plain digits. */
async function askForCode(env: Env, email = EMAIL, ip = IP): Promise<string> {
  const r = await mintLoginCode(env, email, ip)
  if (!("code" in r)) throw new Error(`expected a code, got ${JSON.stringify(r)}`)
  return r.code
}

describe("one login code is one session", () => {
  it("two verifies holding the SAME correct code mint ONE session", async () => {
    const db = coreDb()
    const env = envFor(db)
    const code = await askForCode(env)

    // The double submit: one person, one code, two requests in flight.
    const both = await Promise.all([
      verifyLoginCode(env, EMAIL, code, IP),
      verifyLoginCode(env, EMAIL, code, IP),
    ])

    const admitted = both.filter((r) => "id" in r)
    expect(
      admitted.length,
      "without `consumed_at IS NULL` on the consume, both verifies passed and ONE code minted TWO sessions"
    ).toBe(1)
    // …and the loser is told what actually happened, not "too many wrong tries".
    expect(both.find((r) => "error" in r)).toMatchObject({ error: "code_used", status: 400 })

    const row = db.prepare("SELECT consumed_at FROM login_codes").get() as { consumed_at: string | null }
    expect(row.consumed_at, "the code is spent").not.toBeNull()
  })

  it("a spent code stays spent when it is tried again later", async () => {
    const db = coreDb()
    const env = envFor(db)
    const code = await askForCode(env)
    expect(await verifyLoginCode(env, EMAIL, code, IP)).toHaveProperty("id")
    expect(
      await verifyLoginCode(env, EMAIL, code, IP),
      "a replayed code must never be a second session"
    ).toHaveProperty("error")
  })

  // The cap is the only thing between a 6-digit code and a million guesses, so
  // the new predicate must not have loosened it.
  it("…and the attempt lane is still enforced on the consume", async () => {
    const db = coreDb()
    const env = envFor(db)
    const code = await askForCode(env)
    db.prepare("UPDATE login_codes SET attempts = 99").run()
    expect(await verifyLoginCode(env, EMAIL, code, IP)).toMatchObject({
      error: "too_many_attempts",
      status: 429,
    })
  })
})

describe("a brand-new person's first sign-in cannot 500", () => {
  it("two first sign-ins at once make ONE user and throw nothing", async () => {
    const db = coreDb()
    const env = envFor(db)

    // Read-then-insert: both read "no such user", both insert, and the loser hit
    // the users.email UNIQUE index — a 500 and an error_logs row, on the very
    // first thing this person ever did in the product.
    const both = await Promise.all([
      findOrCreateUserByEmail(env, EMAIL),
      findOrCreateUserByEmail(env, EMAIL),
    ])

    const rows = db.prepare("SELECT id FROM users WHERE email = ?").all(EMAIL) as { id: string }[]
    expect(rows.length, "one address is one identity").toBe(1)
    // Both callers are handed the SAME identity — the one that actually exists.
    expect(both[0].user.id).toBe(rows[0].id)
    expect(both[1].user.id).toBe(rows[0].id)
    expect(both.filter((r) => r.isNew).length, "exactly one of them created it").toBe(1)
  })

  it("an existing person is never reported as new", async () => {
    const db = coreDb()
    const env = envFor(db)
    const first = await findOrCreateUserByEmail(env, EMAIL)
    const again = await findOrCreateUserByEmail(env, EMAIL)
    expect(first.isNew).toBe(true)
    expect(again).toMatchObject({ isNew: false })
    expect(again.user.id).toBe(first.user.id)
  })
})

describe("the email-change door has the same two halves", () => {
  /** A user with a live change-code for `newEmail`, ready to verify. */
  async function pending(db: DatabaseSync, userId: string, email: string, newEmail: string) {
    const now = new Date()
    db.prepare("INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)").run(
      userId,
      email,
      now.toISOString(),
      now.toISOString()
    )
    const code = "123456"
    db.prepare(
      `INSERT INTO email_change_codes (id, user_id, new_email, code_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      `code-${userId}`,
      userId,
      newEmail,
      await sha256Hex(`${code}:${newEmail}`),
      new Date(now.getTime() + 600_000).toISOString(),
      now.toISOString()
    )
    return { code, user: { id: userId, email } as UserRow }
  }

  it("one change-code switches the address ONCE", async () => {
    const db = coreDb()
    const env = envFor(db)
    const { code, user } = await pending(db, "01USER", "old@example.com", "new@example.com")

    const both = await Promise.all([
      verifyEmailChange(env, user, "new@example.com", code, ""),
      verifyEmailChange(env, user, "new@example.com", code, ""),
    ])

    expect(both.filter((r) => "user" in r).length, "one code, one change").toBe(1)
    expect(both.find((r) => "error" in r)).toMatchObject({ status: 400 })
    const logs = db.prepare("SELECT id FROM email_change_logs").all() as unknown[]
    expect(
      logs.length,
      "a consume with no predicate wrote the same change into the security history twice"
    ).toBe(1)
  })

  it("an address taken inside the window is a clean refusal, not a crash", async () => {
    const db = coreDb()
    const env = envFor(db)
    // Two DIFFERENT people racing for the same new address. Both pre-checks pass
    // (nobody holds it yet); the UNIQUE index is the only real authority, and it
    // must speak through the door's own words instead of a 500.
    const a = await pending(db, "01USERA", "a@example.com", "wanted@example.com")
    const b = await pending(db, "01USERB", "b@example.com", "wanted@example.com")

    const both = await Promise.all([
      verifyEmailChange(env, a.user, "wanted@example.com", a.code, ""),
      verifyEmailChange(env, b.user, "wanted@example.com", b.code, ""),
    ])

    expect(both.filter((r) => "user" in r).length, "the address goes to exactly one of them").toBe(1)
    expect(
      both.find((r) => "error" in r),
      "the loser must be refused in words, not with an unhandled UNIQUE violation"
    ).toMatchObject({ error: "email_taken", status: 409 })
  })
})
