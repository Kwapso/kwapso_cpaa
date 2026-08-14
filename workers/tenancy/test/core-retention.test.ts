// A CEILING BOUNDS THE RATE. ONLY A SWEEP BOUNDS THE TOTAL.
//
// The base caps every list, pages every growing collection, and now caps every
// repeatable write into the shared core database. None of that is retention:
// three tables in core are written by callers who are not signed in at all (a
// sign-in code and its ledger row are minted for anyone who types an email
// address), and their totals were bounded by nothing but how long the internet
// stayed bored. Nothing has ever deleted a spent code, a spent send or a session
// that expired last spring.
//
// These run against real SQLite with the real migrations, because the whole
// question is which rows a WHERE clause selects — and a stub would agree with
// whatever clause it was handed.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync, type SqlValue } from "node:sqlite"
import { describe, expect, it } from "vitest"

import {
  AUTH_RETENTION_HOURS,
  ERROR_LOG_RETENTION_DAYS,
  RETENTION_DELETE_CAP,
  RETENTION_PASSES_PER_TICK,
} from "../../../shared/workers/limits"
import { sweepCoreRetention } from "../../../shared/workers/retention"

const CORE = join(__dirname, "..", "..", "..", "db", "core")
const migration = (name: string) => readFileSync(join(CORE, name), "utf8")

const ago = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
const ahead = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()

function coreDb() {
  const db = new DatabaseSync(":memory:")
  const auth = migration("0001_core_auth.sql")
  db.exec(/CREATE TABLE users[\s\S]*?\);/.exec(auth)![0])
  db.exec(/CREATE TABLE login_codes[\s\S]*?\);/.exec(auth)![0])
  db.exec(/CREATE TABLE sessions[\s\S]*?\);/.exec(auth)![0])
  db.exec(migration("0017_login_send_ledger.sql"))
  // The sweep takes `error_logs` too now, so the harness has to carry it — a
  // missing table would be swallowed by the per-table catch and the assertions
  // about it would pass against nothing.
  db.exec(/CREATE TABLE error_logs[\s\S]*?\);/.exec(migration("0012_error_logs.sql"))![0])
  const now = new Date().toISOString()
  db.prepare("INSERT INTO users (id, email, created_at, updated_at) VALUES ('U1','u@example.com',?,?)").run(now, now)
  return db
}

/** The D1 slice the sweep uses, over real SQLite. */
function binding(db: DatabaseSync) {
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

function harness() {
  const db = coreDb()
  let seq = 0
  const code = (createdAt: string) =>
    db
      .prepare(
        "INSERT INTO login_codes (id, email, code_hash, expires_at, created_at) VALUES (?,?,?,?,?)"
      )
      .run(`c${seq++}`, "u@example.com", "h", createdAt, createdAt)
  const send = (createdAt: string) =>
    db.prepare("INSERT INTO login_sends (id, ip, created_at) VALUES (?,?,?)").run(`s${seq++}`, "1.2.3.4", createdAt)
  const session = (expiresAt: string) =>
    db
      .prepare(
        "INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (?,?,?,?,?,?)"
      )
      .run(`x${seq++}`, "U1", `t${seq}`, ago(1), expiresAt, ago(1))
  const errorLog = (at: string) =>
    db
      .prepare("INSERT INTO error_logs (id, at, source, place, message) VALUES (?,?,?,?,?)")
      .run(`e${seq++}`, at, "content", "GET /x", "boom")
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
  return { db, code, send, session, errorLog, count, sweep: () => sweepCoreRetention(binding(db)) }
}

describe("the sweep takes what is spent and leaves what is live", () => {
  it("removes sign-in codes past the retention window, keeps recent ones", async () => {
    const h = harness()
    h.code(ago(AUTH_RETENTION_HOURS + 1))
    h.code(ago(AUTH_RETENTION_HOURS + 100))
    h.code(ago(1)) // still inside the hour the throttle counts

    const report = await h.sweep()

    expect(h.count("login_codes"), "only the fresh one is left").toBe(1)
    expect(report.deleted.login_codes).toBe(2)
  })

  it("removes ledger rows past the window, keeps the ones the send budget reads", async () => {
    const h = harness()
    h.send(ago(AUTH_RETENTION_HOURS + 2))
    h.send(ago(0.5)) // inside the budget's one-hour window — deleting it refunds a send

    await h.sweep()

    expect(h.count("login_sends")).toBe(1)
  })

  it("removes EXPIRED sessions and never a live one", async () => {
    const h = harness()
    h.session(ago(1)) // already expired
    h.session(ahead(24 * 30)) // a person signed in right now

    await h.sweep()

    expect(h.count("sessions"), "a live cookie survives its own housekeeping").toBe(1)
  })

  it("judges a session by its EXPIRY, not its age", async () => {
    // A session slides expires_at forward while it is used, so "created a month
    // ago" says nothing about whether someone is signed in. An age-based sweep
    // would sign out every long-lived user in the platform.
    const h = harness()
    h.db
      .prepare(
        "INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at) VALUES ('old','U1','tok',?,?,?)"
      )
      .run(ago(24 * 365), ahead(24 * 29), ago(0.1))

    await h.sweep()

    expect(h.count("sessions"), "a year-old session still in use is untouched").toBe(1)
  })
})

describe("the sweep does bounded work, and says when it did not finish", () => {
  it("keeps going past ONE statement's ceiling — a night is not a statement", async () => {
    // THE CAP BOUNDS A STATEMENT, NOT A NIGHT. This suite used to assert the
    // opposite ("at most the ceiling in one night"), and that was the finding: at
    // 5,000 rows a night against a database taking sign-ins from every tenant, a
    // quarter-million-person tenant adds more before lunch than a night could
    // remove, and the table grows for ever while the cron reports success.
    const h = harness()
    for (let i = 0; i < RETENTION_DELETE_CAP + 25; i++) h.code(ago(AUTH_RETENTION_HOURS + 1))

    const report = await h.sweep()

    expect(report.deleted.login_codes, "the whole backlog, over several statements").toBe(
      RETENTION_DELETE_CAP + 25
    )
    expect(h.count("login_codes"), "nothing spent is left behind").toBe(0)
    expect(report.capped, "and it finished, so it does not claim otherwise").toEqual([])
  })

  it("stops at the PASS ceiling and names the table", async () => {
    // Bounded work is still bounded: the tick runs at most
    // RETENTION_PASSES_PER_TICK statements per table. Proving that with real rows
    // would mean inserting 200,001 of them, so the ceiling is proved on the
    // arithmetic and the loop's own shape instead — and the un-finished flag is
    // proved below on a stub that never runs short.
    let calls = 0
    const alwaysFull = {
      prepare: () => ({
        bind: () => ({
          async run() {
            calls++
            return { meta: { changes: RETENTION_DELETE_CAP } }
          },
        }),
      }),
    }
    const report = await sweepCoreRetention(alwaysFull)

    const tables = Object.keys(report.deleted).length
    expect(calls, "at most the pass ceiling, per table").toBe(RETENTION_PASSES_PER_TICK * tables)
    // A full last pass is not a finished sweep. Without this, a table that never
    // catches up is indistinguishable from one with nothing left to take.
    expect(report.capped, "and the run says it has not caught up").toContain("login_codes")
    expect(report.deleted.login_codes).toBe(RETENTION_DELETE_CAP * RETENTION_PASSES_PER_TICK)
  })

  it("takes error logs past their documented window, and leaves recent ones", async () => {
    // db/core/0012 has called this a "90-day-ish owned history" since the day the
    // table was created, and nothing had ever deleted a row: a rate ceiling (0019)
    // bounds how fast it fills, not how full it gets.
    const h = harness()
    h.errorLog(ago(24 * (ERROR_LOG_RETENTION_DAYS + 1)))
    h.errorLog(ago(24 * 3)) // last week's crash is still what somebody is reading

    const report = await h.sweep()

    expect(report.deleted.error_logs).toBe(1)
    expect(h.count("error_logs"), "recent diagnostics survive").toBe(1)
  })

  it("a run with room to spare does not claim it was capped", async () => {
    const h = harness()
    h.code(ago(AUTH_RETENTION_HOURS + 1))
    const report = await h.sweep()
    expect(report.capped).toEqual([])
  })

  it("one table's failure does not cost the others their sweep", async () => {
    const h = harness()
    h.db.exec("DROP TABLE login_codes")
    h.send(ago(AUTH_RETENTION_HOURS + 2))

    const report = await h.sweep()

    expect(report.deleted.login_codes).toBe(0)
    expect(h.count("login_sends"), "the sweep carried on past the broken table").toBe(0)
  })
})

describe("the nightly cron actually runs it", () => {
  const handler = readFileSync(join(__dirname, "../src/index.ts"), "utf8")

  /** The body of `async scheduled(...)`, brace-balanced. */
  function scheduledBody(): string {
    const at = handler.indexOf("async scheduled(")
    expect(at, "the cron handler must exist").toBeGreaterThan(-1)
    const open = handler.indexOf("{", at)
    let depth = 0
    for (let i = open; i < handler.length; i++) {
      if (handler[i] === "{") depth++
      else if (handler[i] === "}" && --depth === 0) return handler.slice(open + 1, i)
    }
    return ""
  }

  it("calls the sweep", () => {
    // Presence FIRST, and on its own line: an ordering assertion built on
    // indexOf passes loudest when the thing it is ordering has been deleted,
    // because indexOf answers -1 and -1 is less than everything.
    expect(scheduledBody(), "an unswept database is the whole finding").toMatch(/sweepCoreRetention\(/)
  })

  it("records a sweep that hit its ceiling, rather than only logging it", () => {
    const body = scheduledBody()
    const at = body.indexOf("swept.capped")
    expect(at, "the capped flag must be consulted").toBeGreaterThan(-1)
    const branch = body.slice(at, at + 700)
    expect(branch, "R12: unattended work that stopped early must reach the error store").toMatch(
      /recordWorkerError/
    )
    expect(branch.toLowerCase()).toMatch(/not fully swept|still hold/)
  })

  it("keeps the sweep and the size check in separate try blocks", () => {
    // Two independent jobs. Sharing one catch means a failing sweep hides an 80%
    // alarm — the exact silence both R12 clauses exist to prevent.
    const body = scheduledBody()
    expect(body.match(/\btry\s*\{/g)?.length, "one try each").toBeGreaterThanOrEqual(2)
  })
})
