// A token is a KEY. Three things were wrong with the way this one was cut:
//
//   1. it never expired — a secret pasted into a CI config in 2026 still opened
//      that person's team years later, long after the laptop and often the job;
//   2. nothing capped how many one account could mint;
//   3. and (1)+(2) met the list cap: the settings screen reads a hard-capped
//      1,000 rows (R14), so an account that churned through tokens could bury a
//      LIVE one past the ceiling — invisible in the app, and therefore
//      unrevokable from it, while still working perfectly for whoever held it.
//
// Run against a REAL SQLite database with the REAL migrations applied (0013 +
// 0016), because the fixes ARE the SQL: a predicate riding the INSERT, an
// ordering that keeps live rows on the first page, and a deadline read back on
// every call. A stub would agree with all of it, correct or not.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync, type SqlValue } from "node:sqlite"
import { describe, expect, it } from "vitest"

import {
  LIST_HARD_CAP,
  MAX_ACTIVE_MCP_TOKENS_PER_USER,
  MCP_TOKEN_TTL_DAYS,
} from "../../../shared/workers/limits"
import { createToken, listTokens, revokeToken, sha256Hex, verifyToken } from "../src/lib/tokens"

const CORE = join(__dirname, "..", "..", "..", "db", "core")
const migration = (name: string) => readFileSync(join(CORE, name), "utf8")

/** mcp_tokens, built from the migrations THEMSELVES (no users/teams tables here,
 * so the foreign keys are dropped — everything under test is inside this one). */
function coreDb() {
  const db = new DatabaseSync(":memory:")
  const create = /CREATE TABLE mcp_tokens[\s\S]*?\n\);/.exec(migration("0013_mcp_tokens.sql"))![0]
  db.exec(create.replace(/ REFERENCES \w+ \(id\)/g, ""))
  db.exec(/CREATE INDEX idx_mcp_tokens_user[^;]*;/.exec(migration("0013_mcp_tokens.sql"))![0])
  // The real 0016, verbatim — including its backfill of pre-expiry rows.
  db.exec(migration("0016_mcp_token_life.sql"))
  return db
}

/** The slice of the D1 binding tokens.ts uses, over real SQLite. Each statement
 * is atomic (as D1's are); the awaits between them are where concurrent callers
 * interleave — which is the whole point of the mint-cap test. */
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
        async first<T>(): Promise<T | null> {
          return (stmt.get(...(args as SqlValue[])) ?? null) as T | null
        },
        async all<T>() {
          return { results: stmt.all(...(args as SqlValue[])) as T[] }
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

const USER = "user_alice"
const TEAM = "team_one"

function fresh() {
  const db = coreDb()
  const env = { DB: d1(db) } as never
  return { db, env }
}

const ISO = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString()

describe("an access token has a life", () => {
  it("a new token carries a deadline, and a fresh one verifies", async () => {
    const t = fresh()
    const { row, secret } = await createToken(t.env, USER, TEAM, "CI importer")
    expect(row.expires_at, "every token gets an end date").toBeTruthy()
    const days = (Date.parse(row.expires_at!) - Date.parse(row.created_at)) / 86_400_000
    expect(Math.round(days)).toBe(MCP_TOKEN_TTL_DAYS)
    expect((await verifyToken(t.env, secret)).id).toBe(row.id)
  })

  it("past its deadline the same secret stops working", async () => {
    const t = fresh()
    const { row, secret } = await createToken(t.env, USER, TEAM, "old importer")
    t.db.prepare("UPDATE mcp_tokens SET expires_at = ? WHERE id = ?").run(ISO(-1000), row.id)
    await expect(verifyToken(t.env, secret)).rejects.toMatchObject({
      status: 401,
      code: "token_expired",
    })
  })

  it("a token with NO deadline is refused, not trusted forever", async () => {
    // Fail closed: the column is nullable only because SQLite made it so.
    const t = fresh()
    const { row, secret } = await createToken(t.env, USER, TEAM, "unstamped")
    t.db.prepare("UPDATE mcp_tokens SET expires_at = NULL WHERE id = ?").run(row.id)
    await expect(verifyToken(t.env, secret)).rejects.toMatchObject({ status: 401 })
  })

  it("the migration gives EXISTING tokens a term instead of killing them", async () => {
    // A pre-0016 row, inserted the way the old code did (no expires_at at all).
    const db = new DatabaseSync(":memory:")
    const create = /CREATE TABLE mcp_tokens[\s\S]*?\n\);/.exec(migration("0013_mcp_tokens.sql"))![0]
    db.exec(create.replace(/ REFERENCES \w+ \(id\)/g, ""))
    db.prepare(
      `INSERT INTO mcp_tokens (id, user_id, team_id, label, token_hash, created_at)
       VALUES ('tok_old', ?, ?, 'legacy', ?, ?)`
    ).run(USER, TEAM, await sha256Hex("kwapso_mcp_legacy"), ISO(-90 * 86_400_000))
    db.exec(migration("0016_mcp_token_life.sql"))

    const env = { DB: d1(db) } as never
    const live = await verifyToken(env, "kwapso_mcp_legacy")
    expect(live.expires_at, "a working integration must not break on deploy").toBeTruthy()
    expect(live.expires_at! > new Date().toISOString()).toBe(true)
  })

  it("a revoked token is still refused (expiry didn't replace revocation)", async () => {
    const t = fresh()
    const { row, secret } = await createToken(t.env, USER, TEAM, "leaked")
    await revokeToken(t.env, USER, row.id)
    await expect(verifyToken(t.env, secret)).rejects.toMatchObject({ code: "bad_token" })
  })
})

describe("an account can't mint keys without end", () => {
  it("the cap holds even when every request arrives at once", async () => {
    const t = fresh()
    const tries = MAX_ACTIVE_MCP_TOKENS_PER_USER + 12
    const results = await Promise.allSettled(
      Array.from({ length: tries }, (_, i) => createToken(t.env, USER, TEAM, `token ${i}`))
    )
    const made = results.filter((r) => r.status === "fulfilled")
    expect(made.length, "counting first and inserting after is burstable").toBe(
      MAX_ACTIVE_MCP_TOKENS_PER_USER
    )
    const stored = t.db.prepare("SELECT COUNT(*) AS n FROM mcp_tokens").get() as { n: number }
    expect(stored.n).toBe(MAX_ACTIVE_MCP_TOKENS_PER_USER)
    for (const r of results.filter((x) => x.status === "rejected"))
      expect((r as PromiseRejectedResult).reason).toMatchObject({ status: 409 })
  })

  it("revoking frees a slot — the cap counts LIVE tokens, not history", async () => {
    const t = fresh()
    const first = await createToken(t.env, USER, TEAM, "first")
    for (let i = 1; i < MAX_ACTIVE_MCP_TOKENS_PER_USER; i++)
      await createToken(t.env, USER, TEAM, `filler ${i}`)
    await expect(createToken(t.env, USER, TEAM, "one too many")).rejects.toMatchObject({ status: 409 })
    await revokeToken(t.env, USER, first.row.id)
    await expect(createToken(t.env, USER, TEAM, "replacement")).resolves.toBeTruthy()
  })

  it("the cap is per account — a teammate's tokens don't crowd yours out", async () => {
    const t = fresh()
    for (let i = 0; i < MAX_ACTIVE_MCP_TOKENS_PER_USER; i++)
      await createToken(t.env, USER, TEAM, `mine ${i}`)
    await expect(createToken(t.env, "user_bob", TEAM, "bob's own")).resolves.toBeTruthy()
  })
})

describe("a live token is always reachable, so it can always be revoked", () => {
  it("a live token survives a wall of revoked history past the list cap", async () => {
    const t = fresh()
    const { row } = await createToken(t.env, USER, TEAM, "the one that matters")
    // …then churn: far MORE revoked rows than the list will ever return, every
    // one of them NEWER than the live token (created_at DESC would bury it).
    const insert = t.db.prepare(
      `INSERT INTO mcp_tokens (id, user_id, team_id, label, token_hash, created_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const later = new Date(Date.now() + 60_000).toISOString()
    for (let i = 0; i < LIST_HARD_CAP + 100; i++)
      insert.run(`dead_${i}`, USER, TEAM, `churn ${i}`, `hash_${i}`, later, later, later)

    const listed = await listTokens(t.env, USER)
    expect(listed.length, "the list stays capped (R14)").toBe(LIST_HARD_CAP)
    expect(
      listed.some((x) => x.id === row.id),
      "a token you can still use must be a token you can still see — and revoke"
    ).toBe(true)
    await expect(revokeToken(t.env, USER, row.id)).resolves.toBeUndefined()
  })

  it("revoke works from the id alone — it never needs the list", async () => {
    const t = fresh()
    const { row, secret } = await createToken(t.env, USER, TEAM, "by id")
    await revokeToken(t.env, USER, row.id)
    await expect(verifyToken(t.env, secret)).rejects.toMatchObject({ status: 401 })
    // …and it stays somebody else's token to revoke, never yours.
    const other = await createToken(t.env, "user_bob", TEAM, "bob's")
    await expect(revokeToken(t.env, USER, other.row.id)).rejects.toMatchObject({ status: 404 })
  })
})
