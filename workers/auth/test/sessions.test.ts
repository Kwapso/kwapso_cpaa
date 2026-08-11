// THE SESSION ITSELF — the file every other guard in this codebase stands on,
// and until now the only one in `workers/auth/src/lib/` with no test at all.
//
// Nothing here was suspected of being wrong. That is the point: `sessions.ts`
// decides what a cookie carries, what is stored when someone signs in, when a
// session stops being one, and which team a request acts in — and every one of
// those is a property nothing was watching. The nearest thing to coverage was a
// source-order assertion in the MCP suite, which proves an ordering in a
// different file.
//
// Against a real SQLite database running the REAL core migration, because every
// property below lives in a WHERE clause or a stored value, and a stub that
// "understands" the SQL agrees with a broken one.

import { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it } from "vitest"

import { sha256Hex } from "../src/lib/crypto"
import {
  SESSION_COOKIE,
  createPinnedSession,
  createSession,
  destroySession,
  getSessionUser,
  readCookie,
  signOutOtherSessions,
} from "../src/lib/sessions"
import { d1, migration } from "./core-sqlite"

let db: DatabaseSync
const env = (extra: Record<string, string> = {}) => ({ DB: d1(db), ...extra }) as never

/** A request carrying (or not carrying) a session cookie. */
const withCookie = (raw?: string) =>
  new Request("https://auth/api/auth/me", raw ? { headers: { Cookie: raw } } : undefined)

/** The cookie VALUE out of a Set-Cookie line — the token the browser will send. */
const tokenOf = (setCookie: string) => setCookie.slice(setCookie.indexOf("=") + 1, setCookie.indexOf(";"))

beforeEach(() => {
  db = new DatabaseSync(":memory:")
  const base = migration("0001_core_auth.sql")
  db.exec(/CREATE TABLE users[\s\S]*?\);/.exec(base)![0])
  db.exec(/CREATE TABLE sessions[\s\S]*?\);/.exec(base)![0])
  // `team_pin` and the team pointer arrive in later migrations; applied here the
  // same way, off disk, so a column that moves breaks the suite rather than
  // silently changing what it proves.
  db.exec("ALTER TABLE sessions ADD COLUMN team_pin TEXT;")
  db.exec("ALTER TABLE users ADD COLUMN current_team_id TEXT;")
  db.exec(
    `INSERT INTO users (id, email, created_at, updated_at, onboarding_completed_at)
     VALUES ('U1', 'a@x.com', '2026-01-01', '2026-01-01', '2026-01-01');`
  )
})

describe("what a sign-in stores, and what it hands back", () => {
  it("stores the HASH and never the token", async () => {
    const { setCookie } = await createSession(env(), "U1")
    const token = tokenOf(setCookie)
    expect(token.length, "an empty token would match every row that has none").toBeGreaterThan(20)
    const row = db.prepare("SELECT token_hash FROM sessions").get() as { token_hash: string }
    expect(row.token_hash).toBe(await sha256Hex(token))
    // The thing that matters: a dump of this table is not a set of live keys.
    expect(row.token_hash).not.toBe(token)
    expect(JSON.stringify(db.prepare("SELECT * FROM sessions").all())).not.toContain(token)
  })

  it("the cookie is HttpOnly, SameSite=Lax and Secure", async () => {
    const { setCookie } = await createSession(env(), "U1")
    expect(setCookie).toContain("HttpOnly")
    expect(setCookie).toContain("SameSite=Lax")
    expect(setCookie).toContain("; Secure")
    expect(setCookie).toContain("Path=/")
  })

  // THE ONE LOCK NOTHING WAS WATCHING. `Secure` is dropped only when
  // INSECURE_COOKIE is the exact string "1" — a local-dev escape hatch so the
  // cookie works over http://localhost. It is not set in either wrangler
  // environment, so a deployed worker can only get it by hand — but nothing
  // stopped a refactor inverting the test, and nothing would have noticed: every
  // other assertion in this file passes either way.
  describe("the INSECURE_COOKIE escape hatch fails SECURE", () => {
    it('drops Secure for exactly "1", and nothing else', async () => {
      const drop = async (v: Record<string, string>) =>
        (await createSession(env(v), "U1")).setCookie.includes("; Secure")
      expect(await drop({ INSECURE_COOKIE: "1" }), "the local-dev hatch still works").toBe(false)
      // Every other spelling a careless config could produce stays Secure.
      for (const value of ["0", "", "true", "yes", "1 ", "01"])
        expect(await drop({ INSECURE_COOKIE: value }), `INSECURE_COOKIE=${JSON.stringify(value)}`).toBe(true)
      expect(await drop({}), "unset is Secure").toBe(true)
    })

    it("and HttpOnly / SameSite are not on the hatch at all", async () => {
      const { setCookie } = await createSession(env({ INSECURE_COOKIE: "1" }), "U1")
      expect(setCookie).toContain("HttpOnly")
      expect(setCookie).toContain("SameSite=Lax")
    })
  })
})

describe("who a request is", () => {
  it("no cookie is nobody, and a wrong token is nobody", async () => {
    expect(await getSessionUser(env(), withCookie())).toBeNull()
    await createSession(env(), "U1")
    expect(await getSessionUser(env(), withCookie(`${SESSION_COOKIE}=not-a-real-token`))).toBeNull()
  })

  it("a live session is its user", async () => {
    const { setCookie } = await createSession(env(), "U1")
    const me = await getSessionUser(env(), withCookie(`${SESSION_COOKIE}=${tokenOf(setCookie)}`))
    expect(me?.id).toBe("U1")
  })

  it("an EXPIRED session is nobody, and the row is gone", async () => {
    const { setCookie } = await createSession(env(), "U1")
    db.exec("UPDATE sessions SET expires_at = '2020-01-01T00:00:00.000Z';")
    expect(await getSessionUser(env(), withCookie(`${SESSION_COOKIE}=${tokenOf(setCookie)}`))).toBeNull()
    expect((db.prepare("SELECT COUNT(*) n FROM sessions").get() as { n: number }).n).toBe(0)
  })

  it("a DEACTIVATED user is nobody, even with a live session", async () => {
    const { setCookie } = await createSession(env(), "U1")
    db.exec("UPDATE users SET deactivated_at = '2026-06-01';")
    expect(await getSessionUser(env(), withCookie(`${SESSION_COOKIE}=${tokenOf(setCookie)}`))).toBeNull()
  })

  it("a cookie value containing '=' survives the parse (a token is base64url-ish)", () => {
    expect(readCookie(withCookie("other=1; kwapso_session=a=b=c"), SESSION_COOKIE)).toBe("a=b=c")
    expect(readCookie(withCookie("other=1"), SESSION_COOKIE)).toBeNull()
  })
})

describe("a pinned session acts in the TOKEN's team, and stays short", () => {
  it("overrides the human's current team", async () => {
    db.exec("UPDATE users SET current_team_id = 'T_APP';")
    const { token } = await createPinnedSession(env(), "U1", "T_TOKEN")
    const me = await getSessionUser(env(), withCookie(`${SESSION_COOKIE}=${token}`))
    expect(me?.current_team_id, "every downstream gate reads this field").toBe("T_TOKEN")
  })

  it("lives an hour, not a month", async () => {
    await createPinnedSession(env(), "U1", "T_TOKEN")
    const row = db.prepare("SELECT created_at, expires_at FROM sessions").get() as {
      created_at: string
      expires_at: string
    }
    const hours = (Date.parse(row.expires_at) - Date.parse(row.created_at)) / 3_600_000
    expect(hours).toBeCloseTo(1, 1)
  })

  it("and is NEVER slid — a use must not extend a machine's key", async () => {
    const { token } = await createPinnedSession(env(), "U1", "T_TOKEN")
    const before = (db.prepare("SELECT expires_at FROM sessions").get() as { expires_at: string }).expires_at
    await getSessionUser(env(), withCookie(`${SESSION_COOKIE}=${token}`))
    const after = (db.prepare("SELECT expires_at FROM sessions").get() as { expires_at: string }).expires_at
    expect(after, "a slid pin would outlive the 60 minutes MCP.md promises").toBe(before)
  })

  it("a browser session, close to expiry, DOES slide", async () => {
    const { setCookie } = await createSession(env(), "U1")
    const soon = new Date(Date.now() + 3 * 86400000).toISOString()
    db.prepare("UPDATE sessions SET expires_at = ?").run(soon)
    await getSessionUser(env(), withCookie(`${SESSION_COOKIE}=${tokenOf(setCookie)}`))
    const after = (db.prepare("SELECT expires_at FROM sessions").get() as { expires_at: string }).expires_at
    expect(after > soon, "an active session must not log a person out mid-month").toBe(true)
  })
})

describe("signing out", () => {
  it("destroySession forgets the row and blanks the cookie", async () => {
    const { setCookie } = await createSession(env(), "U1")
    const out = await destroySession(env(), withCookie(`${SESSION_COOKIE}=${tokenOf(setCookie)}`))
    expect(out.setCookie).toContain("Max-Age=0")
    expect((db.prepare("SELECT COUNT(*) n FROM sessions").get() as { n: number }).n).toBe(0)
  })

  it("signOutOtherSessions keeps exactly the one it was told to keep", async () => {
    const keep = await createSession(env(), "U1")
    await createSession(env(), "U1")
    await createSession(env(), "U1")
    const keptHash = await sha256Hex(tokenOf(keep.setCookie))
    expect(await signOutOtherSessions(env(), "U1", keptHash)).toBe(2)
    const rows = db.prepare("SELECT token_hash FROM sessions").all() as { token_hash: string }[]
    expect(rows.map((r) => r.token_hash)).toEqual([keptHash])
  })

  // The guard the function states in a comment — "never wipe everything by
  // accident". An empty hash matches no row, so without the early return the
  // DELETE would take every session this user has, including the live one.
  it("and refuses to run at all with no session to keep", async () => {
    await createSession(env(), "U1")
    expect(await signOutOtherSessions(env(), "U1", "")).toBe(0)
    expect((db.prepare("SELECT COUNT(*) n FROM sessions").get() as { n: number }).n).toBe(1)
  })
})
