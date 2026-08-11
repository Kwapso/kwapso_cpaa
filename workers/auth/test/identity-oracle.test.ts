// TWO WAYS THE IDENTITY DOORS ANSWERED A QUESTION NOBODY WAS ENTITLED TO ASK.
//
// 1 · THE ENUMERATION ORACLE. `verifyEmailChange` re-checked "is this address
//     already taken?" as its FIRST act — before the code row was even looked up,
//     before the attempt cap, before the hash comparison. So any signed-in caller
//     could post {email: "someone@elsewhere.com", code: "000000"} and read the
//     answer off the status: 409 means that address holds an account, 400 means it
//     does not. No code needed, no pending change needed, no counter touched — and
//     this door has no throttle of its own (they all live on .../change/start).
//     In an invite-only product the global `users` table IS the agency's staff and
//     client-contact roster, and `/api/auth/*` is forwarded BY PREFIX at the agency
//     origin, so a client-portal contact reaches it too.
//
//     The fix is an ORDERING, which is why it needs a test that can tell the two
//     orders apart: the uniqueness check now sits AFTER the hash comparison, so it
//     only ever answers someone already holding a live code for that address.
//
// 2 · THE WRONG-TYPED PROFILE FIELD. `POST /api/auth/profile` read its body with a
//     bare cast and handed the whole object to updateProfile, which did
//     `(input.firstName ?? "").trim()`. `??` does not catch a number, so
//     {"firstName": 1} was a TypeError → a 500 → an error_logs row in the GLOBAL
//     core database, from any session, at BOTH front doors. R20's own scanner could
//     not see it: it follows `<binding>.<field>` reads in the file that bound the
//     body, and this door read no fields at all.
//
// Real SQLite, real migrations — the ordering question is about what the database
// is asked and when, so a stub would agree with either order.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync, type SqlValue } from "node:sqlite"
import { describe, expect, it } from "vitest"

import { sha256Hex } from "../src/lib/crypto"
import { verifyEmailChange } from "../src/lib/email-change"
import { updateProfile } from "../src/lib/profile"
import type { UserRow } from "../src/lib/users"
import type { Env } from "../src/env"

const CORE = join(__dirname, "..", "..", "..", "db", "core")
const migration = (name: string) => readFileSync(join(CORE, name), "utf8")

function coreDb() {
  const db = new DatabaseSync(":memory:")
  const base = migration("0001_core_auth.sql")
  db.exec(/CREATE TABLE users[\s\S]*?\);/.exec(base)![0])
  db.exec("ALTER TABLE users ADD COLUMN current_team_id TEXT;")
  db.exec(migration("0003_remove_google.sql"))
  db.exec(migration("0005_email_change.sql"))
  db.exec(migration("0007_account_activity.sql"))
  return db
}

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
        async first<T>() {
          return (stmt.get(...(args as SqlValue[])) ?? null) as T | null
        },
        async all<T>() {
          return { results: stmt.all(...(args as SqlValue[])) as T[] }
        },
        async run() {
          return { meta: { changes: Number(stmt.run(...(args as SqlValue[])).changes) } }
        },
      }
      return bound
    },
  }
}

const envFor = (db: DatabaseSync): Env =>
  ({ DB: d1(db), REALTIME: { fetch: async () => new Response("{}") } }) as unknown as Env

/** A row in `users`, and the SessionUser-ish shape the doors take. */
function makeUser(db: DatabaseSync, id: string, email: string): UserRow {
  db.prepare(
    "INSERT INTO users (id, email, first_name, last_name, onboarding_completed_at, created_at, updated_at) VALUES (?, ?, 'A', 'B', '2026-01-01', '2026-01-01', '2026-01-01')"
  ).run(id, email)
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as unknown as UserRow
}

describe("the email-change door is not an address oracle", () => {
  it("answers a WRONG CODE identically whether the address exists or not", async () => {
    const db = coreDb()
    const env = envFor(db)
    const me = makeUser(db, "U_ME", "me@example.com")
    // A colleague's real address, and one nobody holds.
    makeUser(db, "U_OTHER", "cfo@rival-client.com")

    const taken = await verifyEmailChange(env, me, "cfo@rival-client.com", "000000", "")
    const free = await verifyEmailChange(env, me, "nobody@nowhere.example", "000000", "")

    // THE WHOLE POINT: the two answers must be indistinguishable. Before the fix
    // the first was 409 email_taken and the second 400 code_expired — one request
    // per guess, and the global users table falls out.
    expect(taken).toEqual(free)
    expect(taken).toMatchObject({ status: 400 })
    expect((taken as { error: string }).error).not.toBe("email_taken")
  })

  it("still refuses a taken address to someone who DOES hold the code", async () => {
    const db = coreDb()
    const env = envFor(db)
    const me = makeUser(db, "U_ME", "me@example.com")
    makeUser(db, "U_OTHER", "taken@example.com")
    // A live, correct code for the address they are trying to move to.
    db.prepare(
      `INSERT INTO email_change_codes (id, user_id, new_email, code_hash, attempts, expires_at, created_at)
       VALUES ('C1', 'U_ME', 'taken@example.com', ?, 0, '2099-01-01', '2026-01-01')`
    ).run(await sha256Hex("123456:taken@example.com"))

    const r = await verifyEmailChange(env, me, "taken@example.com", "123456", "")
    // The check did not disappear — it moved behind the proof of the code.
    expect(r).toMatchObject({ error: "email_taken", status: 409 })
  })
})

describe("the profile door refuses a wrong-typed field instead of crashing", () => {
  // updateProfile is where the crash lived. The door (src/index.ts) now validates
  // through the shared seam before calling it, and auth's own boundary scan holds
  // that line — but the lib must not be the thing standing between a number and a
  // TypeError, so these prove the CRASH is gone rather than merely unreachable.
  const cases: [string, Record<string, unknown>][] = [
    ["a number for firstName", { firstName: 1, lastName: "B" }],
    ["an object for lastName", { firstName: "A", lastName: {} }],
    ["an array for imageDataUrl", { firstName: "A", lastName: "B", imageDataUrl: [] }],
  ]
  for (const [what, input] of cases)
    it(`answers, never throws, for ${what}`, async () => {
      const db = coreDb()
      const env = envFor(db)
      const me = makeUser(db, "U_ME", "me@example.com")
      // The contract of this lib is "returns an answer" — either the updated user
      // or an {error, message}. A THROW here is the 500 (and the global error_logs
      // row) this suite exists to prevent.
      const r = await updateProfile(env, me, input as never).catch((e) => ({ threw: String(e) }))
      expect(r, `updateProfile threw on ${what} — that is the 500`).not.toHaveProperty("threw")
    })
})

// THE DOOR, not just the lib: the fields have to be validated where R20's scanner
// can see them, which is the half that stops this class coming back. Read off disk.
describe("the profile door validates at the boundary", () => {
  const src = readFileSync(join(__dirname, "..", "src", "index.ts"), "utf8")

  it("puts all three profile fields through the validation seam", () => {
    for (const field of ["firstName", "lastName", "imageDataUrl"])
      expect(
        src,
        `body.${field} must be validated in the handler, not cast and passed one frame down — that is precisely how the scanner lost sight of this door`
      ).toContain(`body.${field},`)
  })

  it("no longer casts the raw body straight into updateProfile", () => {
    expect(src).not.toContain("as ProfileInput\n  const result = await updateProfile(env, user, input)")
  })
})
