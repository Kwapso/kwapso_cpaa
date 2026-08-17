// THE MOVER, RESUMED — behaviourally, because resumption is not a shape.
//
// mover-drain.test.ts reads the source, and it is right to: "does it page by key"
// and "does it chunk the DELETE" are shapes, and proving them behaviourally would
// mean two real D1 databases with a million rows in them. Resumption is different.
// The question is what the SECOND call does, and the only way to answer it is to
// interrupt the first one and make it.
//
// So this file stands up an in-memory core database and an in-memory D1 REST door,
// puts more rows in the source than one call's budget will copy, and runs the mover
// until it says it is finished. What it asserts is what a person who ran the tool,
// watched their Worker die, and ran it again would need to be true:
//
//   • the second call does NOT create a second database (the orphan bug),
//   • it does NOT copy from row one (the never-finishes bug),
//   • every source row lands exactly once — no duplicates from the resume overlap,
//     and none skipped at the seam,
//   • two calls at the same time do not both copy (the claim), and a claim left by
//     a killed Worker is reclaimable rather than permanent,
//   • routing is still flipped LAST, so an interrupted move is never a doubled read.

import { beforeEach, describe, expect, it, vi } from "vitest"

/** THE FAKE D1 REST DOOR. Tables are arrays of rows; `d1ExecScript` understands
 * exactly the three statements the mover writes (CREATE, INSERT OR IGNORE, DELETE)
 * and refuses anything else, so a change in the mover's SQL shows up here as a
 * failure rather than as a silent no-op. */
const cloud = vi.hoisted(() => ({
  dbs: {} as Record<string, Record<string, Record<string, string | number | null>[]>>,
  created: [] as string[],
  inserts: [] as { db: string; table: string; rows: number; ignore: boolean }[],
  scripts: [] as string[],
}))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    d1CreateDatabase: async (_cfg: unknown, name: string) => {
      cloud.created.push(name)
      const id = `db-${cloud.created.length}`
      cloud.dbs[id] = {}
      return id
    },
    d1Query: async (_cfg: unknown, dbId: string, sql: string) => {
      const db = cloud.dbs[dbId] ?? {}
      // the DDL probe
      let m = /SELECT sql FROM sqlite_master WHERE name = \? AND type = 'table'/.exec(sql)
      if (m) return [{ sql: "CREATE TABLE activity (id TEXT PRIMARY KEY, note TEXT)" }]
      if (/sqlite_master/.test(sql)) return [] // no indexes
      // the verify / drain counts
      m = /SELECT COUNT\(\*\) AS n FROM (\w+)/.exec(sql)
      if (m) return [{ n: (db[m[1]] ?? []).length }]
      // the keyset copy read
      m = /SELECT \* FROM (\w+) WHERE id > '([^']*)' ORDER BY id LIMIT (\d+)/.exec(sql)
      if (m) {
        const [, table, after, limit] = m
        return (db[table] ?? [])
          .filter((r) => String(r.id) > after)
          .sort((a, b) => String(a.id).localeCompare(String(b.id)))
          .slice(0, Number(limit))
      }
      throw new Error(`fake d1Query got SQL it does not model: ${sql}`)
    },
    d1ExecScript: async (_cfg: unknown, dbId: string, script: string) => {
      cloud.scripts.push(script)
      const db = (cloud.dbs[dbId] ??= {})
      let m = /CREATE TABLE (\w+)/.exec(script)
      if (m) {
        db[m[1]] ??= []
        return
      }
      m = /INSERT( OR IGNORE)? INTO (\w+) \(([^)]+)\) VALUES\n([\s\S]*);/.exec(script)
      if (m) {
        const ignore = !!m[1]
        const table = m[2]
        const cols = m[3].split(",").map((c) => c.trim())
        const tuples = m[4].split("),\n").map((t) => t.replace(/^\(|\)$/g, ""))
        const rows = tuples.map((t) => {
          const vals = t.split(", ").map((v) => (v === "NULL" ? null : v.replace(/^'|'$/g, "")))
          return Object.fromEntries(cols.map((c, i) => [c, vals[i]]))
        })
        db[table] ??= []
        cloud.inserts.push({ db: dbId, table, rows: rows.length, ignore })
        for (const r of rows) {
          // OR IGNORE is the whole point: a primary-key clash is skipped, not doubled.
          const clash = db[table].some((e) => e.id === r.id)
          if (clash && ignore) continue
          if (clash && !ignore) db[table].push(r) // a plain INSERT would duplicate
          else db[table].push(r)
        }
        return
      }
      m = /DELETE FROM (\w+) WHERE id IN \(SELECT id FROM \1 LIMIT (\d+)\);/.exec(script)
      if (m) {
        const [, table, limit] = m
        db[table] = (db[table] ?? []).slice(Number(limit))
        return
      }
      throw new Error(`fake d1ExecScript got a statement it does not model: ${script}`)
    },
  }
})

import { moveModuleToOwnDatabase } from "../src/lib/sharding"
import type { Env } from "../src/env"

/** THE FAKE CORE DATABASE — just enough of D1's prepare/bind API to hold the two
 * tables the mover reads and writes, with real `meta.changes` on the UPDATE
 * because the claim depends on it. */
function coreDb() {
  const teams = [{ id: "t1", database_id: "src-db", db_status: "ready" }]
  const moves: Record<string, string | number | null>[] = []
  const routes: Record<string, string | number | null>[] = []
  const alerts: Record<string, string | number | null>[] = []

  const run = (sql: string, p: unknown[]) => {
    if (/INSERT INTO team_module_moves/.test(sql)) {
      moves.push({
        id: p[0] as string,
        team_id: p[1] as string,
        module: p[2] as string,
        database_id: p[3] as string,
        source_database_id: p[4] as string,
        tables_json: p[5] as string,
        status: "copying",
        cursors_json: "{}",
        verified_json: "[]",
        drained_json: "[]",
        rows_copied: 0,
        claimed_at: p[6] as string,
      })
      return { meta: { changes: 1 } }
    }
    if (/UPDATE team_module_moves SET claimed_at = \? WHERE id = \? AND \(claimed_at IS NULL OR claimed_at < \?\)/.test(sql)) {
      const [now, id, stale] = p as string[]
      const row = moves.find((m) => m.id === id)
      if (!row) return { meta: { changes: 0 } }
      const free = row.claimed_at === null || String(row.claimed_at) < stale
      if (!free) return { meta: { changes: 0 } }
      row.claimed_at = now
      return { meta: { changes: 1 } }
    }
    if (/^UPDATE team_module_moves SET/.test(sql)) {
      const id = p[p.length - 1] as string
      const row = moves.find((m) => m.id === id)
      if (!row) return { meta: { changes: 0 } }
      const cols = [...sql.matchAll(/(\w+) = \?/g)].map((m) => m[1])
      cols.forEach((c, i) => {
        row[c] = p[i] as string | number | null
      })
      return { meta: { changes: 1 } }
    }
    if (/INSERT OR IGNORE INTO team_module_databases/.test(sql)) {
      if (!routes.some((r) => r.team_id === p[1] && r.module === p[2]))
        routes.push({ id: p[0] as string, team_id: p[1] as string, module: p[2] as string, database_id: p[3] as string })
      return { meta: { changes: 1 } }
    }
    if (/UPDATE db_alerts/.test(sql)) return { meta: { changes: 0 } }
    throw new Error(`fake core DB got SQL it does not model: ${sql}`)
  }

  const first = (sql: string, p: unknown[]) => {
    if (/FROM team_module_databases/.test(sql))
      return routes.find((r) => r.team_id === p[0] && r.module === p[1]) ?? null
    if (/FROM team_module_moves/.test(sql))
      return moves.find((m) => m.team_id === p[0] && m.module === p[1] && m.status !== "done") ?? null
    if (/FROM teams/.test(sql)) return teams.find((t) => t.id === p[0]) ?? null
    throw new Error(`fake core DB got a read it does not model: ${sql}`)
  }

  return {
    moves,
    routes,
    alerts,
    binding: {
      prepare: (sql: string) => ({
        bind: (...p: unknown[]) => ({
          first: async () => first(sql, p),
          run: async () => run(sql, p),
        }),
      }),
    },
  }
}

/** MORE THAN ONE COPY BATCH, deliberately: COPY_BATCH is 250, so a fixture under
 * that finishes in a single batch and proves nothing about resuming. 600 rows is
 * three batches, so `batchesPerCall: 1` is guaranteed to run out mid-table — which
 * is the state every assertion in this file is about. */
const SOURCE_ROWS = 600

function seedSource(n: number): void {
  cloud.dbs["src-db"] = {
    activity: Array.from({ length: n }, (_, i) => ({
      id: `row${String(i).padStart(4, "0")}`,
      note: `n${i}`,
    })),
  }
}

beforeEach(() => {
  cloud.dbs = {}
  cloud.created = []
  cloud.inserts = []
  cloud.scripts = []
  seedSource(SOURCE_ROWS)
})

/** The mover, driven to completion the way a person would drive it: call, look at
 * `done`, call again. Returns how many calls it took. */
async function driveToDone(env: Env, batchesPerCall: number, max = 50) {
  let calls = 0
  for (;;) {
    calls++
    const r = await moveModuleToOwnDatabase(
      env,
      {} as never,
      "t1",
      "activity",
      ["activity"],
      { batchesPerCall }
    )
    if (r.done) return { calls, result: r }
    expect(calls, "the move must converge, not loop").toBeLessThan(max)
  }
}

describe("the mover is resumable across calls", () => {
  it("one batch at a time: several calls, ONE database, every row exactly once", async () => {
    const core = coreDb()
    const env = { DB: core.binding } as unknown as Env

    // A budget of one batch per call, against a source with more rows than a batch
    // — so the first call is guaranteed to run out and have to be called again.
    const { calls, result } = await driveToDone(env, 1)

    expect(calls, "a bounded call must need more than one pass here").toBeGreaterThan(1)
    expect(result.done).toBe(true)

    // THE ORPHAN BUG: the second call must reuse the database the first one made.
    expect(cloud.created, "exactly one database, however many calls it took").toHaveLength(1)

    // THE NEVER-FINISHES BUG: no call restarted from row one. Every row landed once.
    const copied = cloud.dbs[result.databaseId].activity
    expect(copied, "every source row is in the new database").toHaveLength(SOURCE_ROWS)
    expect(new Set(copied.map((r) => r.id)).size, "…exactly once, no duplicate at the resume seam").toBe(
      SOURCE_ROWS
    )

    // …and the source is drained, which is what makes a merged read honest.
    expect(cloud.dbs["src-db"].activity, "the old home is emptied").toHaveLength(0)
  })

  it("resumes from the recorded cursor rather than the beginning", async () => {
    const core = coreDb()
    const env = { DB: core.binding } as unknown as Env

    const first = await moveModuleToOwnDatabase(env, {} as never, "t1", "activity", ["activity"], {
      batchesPerCall: 1,
    })
    expect(first.done, "one batch cannot finish 30 rows").toBe(false)
    expect(first.copying).toBe("activity")

    const cursorAfterFirst = JSON.parse(String(core.moves[0].cursors_json)) as Record<string, string>
    expect(cursorAfterFirst.activity, "the cursor is recorded, not held in a stack frame").toBeTruthy()

    const copiedByFirst = cloud.dbs[first.databaseId].activity.length
    cloud.inserts = []

    const second = await moveModuleToOwnDatabase(env, {} as never, "t1", "activity", ["activity"], {
      batchesPerCall: 1,
    })
    // The second call's read started past the first call's last row: it inserted
    // new rows, and the total moved on rather than being re-done.
    expect(second.movedRows, "progress accumulates ACROSS calls").toBeGreaterThan(copiedByFirst)
    expect(cloud.inserts.length, "the second call did copy something").toBeGreaterThan(0)
    expect(
      cloud.dbs[first.databaseId].activity.length,
      "and nothing was copied twice"
    ).toBe(new Set(cloud.dbs[first.databaseId].activity.map((r) => r.id)).size)
  })

  it("copies with OR IGNORE, so a retried batch is a no-op rather than a duplicate", async () => {
    // This stopped being optional on 2026-08-17: d1-rest now retries a transient
    // "internal error" that Cloudflare reports inside an HTTP 200, so one logical
    // batch can genuinely be sent twice.
    const core = coreDb()
    const env = { DB: core.binding } as unknown as Env
    await driveToDone(env, 1)
    expect(cloud.inserts.length).toBeGreaterThan(0)
    expect(
      cloud.inserts.every((i) => i.ignore),
      "every copy INSERT must be OR IGNORE"
    ).toBe(true)
  })

  it("routing is flipped only at the END — an interrupted move is never a doubled read", async () => {
    const core = coreDb()
    const env = { DB: core.binding } as unknown as Env
    const first = await moveModuleToOwnDatabase(env, {} as never, "t1", "activity", ["activity"], {
      batchesPerCall: 1,
    })
    expect(first.done).toBe(false)
    // Nothing routed yet: resolveModuleDatabases returns one home, so reads are
    // still the source alone and no row is returned twice.
    expect(core.routes, "no routing row while the copy is unfinished").toHaveLength(0)
    await driveToDone(env, 99)
    expect(core.routes, "…and exactly one once it finishes").toHaveLength(1)
  })
})

describe("the mover will not let two calls copy at once", () => {
  it("refuses a second call while a fresh claim is held", async () => {
    const core = coreDb()
    const env = { DB: core.binding } as unknown as Env
    await moveModuleToOwnDatabase(env, {} as never, "t1", "activity", ["activity"], { batchesPerCall: 1 })
    // A call that stops for budget RELEASES its claim (claimed_at = null), which is
    // what makes "call me again" work. Simulate the other case: a call still running.
    core.moves[0].claimed_at = new Date().toISOString()
    await expect(
      moveModuleToOwnDatabase(env, {} as never, "t1", "activity", ["activity"], { batchesPerCall: 1 })
    ).rejects.toThrow(/move_in_progress/)
  })

  it("reclaims a STALE claim — a killed Worker cannot release its own", async () => {
    const core = coreDb()
    const env = { DB: core.binding } as unknown as Env
    await moveModuleToOwnDatabase(env, {} as never, "t1", "activity", ["activity"], { batchesPerCall: 1 })
    // Eleven minutes ago: the shape of a Worker that died holding the move.
    core.moves[0].claimed_at = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    const next = await moveModuleToOwnDatabase(env, {} as never, "t1", "activity", ["activity"], {
      batchesPerCall: 99,
    })
    expect(next.done, "a stranded move must be finishable").toBe(true)
    expect(cloud.created, "and still without a second database").toHaveLength(1)
  })

  it("a call that runs out of budget releases its claim, so the next one may take it", async () => {
    const core = coreDb()
    const env = { DB: core.binding } as unknown as Env
    const r = await moveModuleToOwnDatabase(env, {} as never, "t1", "activity", ["activity"], {
      batchesPerCall: 1,
    })
    expect(r.done).toBe(false)
    expect(core.moves[0].claimed_at, "stopping for budget is not holding the lock").toBeNull()
  })
})

describe("the mover refuses to move what is already moved", () => {
  it("throws module_already_moved once a routing row exists", async () => {
    const core = coreDb()
    const env = { DB: core.binding } as unknown as Env
    await driveToDone(env, 99)
    seedSource(5)
    await expect(
      moveModuleToOwnDatabase(env, {} as never, "t1", "activity", ["activity"])
    ).rejects.toThrow(/module_already_moved/)
  })

  it("the move's own table list wins over a caller who names fewer", async () => {
    // A second call passing a shorter list would otherwise "finish" a move that had
    // not moved everything — the move row is the record of what this move covers.
    const core = coreDb()
    const env = { DB: core.binding } as unknown as Env
    cloud.dbs["src-db"].other = [{ id: "o1", note: "x" }]
    await moveModuleToOwnDatabase(env, {} as never, "t1", "activity", ["activity", "other"], {
      batchesPerCall: 1,
    })
    expect(JSON.parse(String(core.moves[0].tables_json))).toEqual(["activity", "other"])
    const done = await driveToDone(env, 99)
    expect(done.result.done).toBe(true)
    expect(cloud.dbs[done.result.databaseId].other, "the forgotten table still moved").toHaveLength(1)
  })
})
