// AN UNTESTED RESTORE IS NOT A RESTORE — so the rehearsal runs on every build.
//
// ── WHY THIS IS A TEST AND NOT A PARAGRAPH ──────────────────────────────────
//
// RESILIENCE.md § "When the restore was last tested" recorded a real rehearsal
// on 2026-08-14: the twenty core migrations that existed then were replayed into
// a scratch SQLite database, filled with rows, dumped, and reloaded into an empty
// one. It then said, in its own words, "re-run the rehearsal after any migration
// that changes a table's shape" — and ended, honestly, with: "that rule is
// enforced by nobody, which is how it came to be broken eight times."
//
// Eight migrations later the recorded rehearsal covered 20 of 28 files, five of
// the missing eight changed a table's shape, and the document had to carry a
// STALE banner over its own reassurance. That is the failure this file ends: the
// rehearsal is no longer a thing somebody remembers to do, it is a thing that
// happens, against however many migrations are on disk today.
//
// ── WHAT IT ACTUALLY PROVES, AND WHAT IT DOES NOT ───────────────────────────
//
// D1 *is* SQLite, so replaying the real migration files into `node:sqlite` and
// round-tripping the result exercises the part of a restore that is ours: that
// the schema this repo builds can be dumped and reloaded with every table, every
// index and every value intact. A migration that only works against a database
// that already has rows in it, one that leaves a constraint a reload cannot
// satisfy, or a dump/reload that quietly drops a partial index all fail here.
//
// It does NOT test `wrangler d1 export --remote` against live Cloudflare, and it
// does not test Time Travel; both need a real environment and stay a manual
// rehearsal. RESILIENCE.md says which half is which, and this suite is why the
// tested half can no longer go stale.

import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { describe, expect, it } from "vitest"

import { sourceFiles } from "@shared/rules/source-scan"

const CORE = join(__dirname, "..", "..", "..", "db", "core")

/** Every core migration, in the order the runner applies them: filename order,
 * because core migrations are applied BY DIRECTORY and the number prefix is the
 * order. Read off disk rather than listed, so a migration added tomorrow is
 * rehearsed tomorrow — which is the entire point. */
function migrations(): { name: string; sql: string }[] {
  // Through the shared walker, which sorts by path — and a core migration's path
  // IS its order, because the number prefix is how the directory is applied.
  return sourceFiles(CORE, { extensions: [".sql"], relativeTo: CORE }).map((f) => ({
    name: f.rel,
    sql: f.source,
  }))
}

/** A database with the whole of `db/core/` applied. */
function built(): DatabaseSync {
  const db = new DatabaseSync(":memory:")
  for (const m of migrations()) {
    try {
      db.exec(m.sql)
    } catch (e) {
      throw new Error(`${m.name} would not apply to an empty database: ${(e as Error).message}`)
    }
  }
  return db
}

type MasterRow = { type: string; name: string; tbl_name: string; sql: string | null }

/** The schema, as the database itself describes it. `sqlite_master` is the only
 * honest oracle here: a hand-written expectation would be a second description of
 * the schema and would drift from it silently. */
function schema(db: DatabaseSync): MasterRow[] {
  return (
    db
      .prepare(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
      )
      .all() as unknown as MasterRow[]
  ).filter((r) => r.sql !== null) // auto-indexes have no SQL and are recreated by their table
}

const tablesOf = (db: DatabaseSync) => schema(db).filter((r) => r.type === "table").map((r) => r.name)

type ColumnInfo = { name: string; type: string; notnull: number; dflt_value: unknown; pk: number }

/** ONE PLAUSIBLE ROW PER TABLE, generated from the table's own declared columns.
 *
 * A dump that carries the schema and no data proves half of a restore. The values
 * are deliberately dull — the question is whether they come back BYTE-IDENTICAL,
 * not whether they are realistic — but they are typed off `PRAGMA table_info` so
 * a NOT NULL INTEGER never receives a string, which is the shape SQLite would
 * accept and a stricter engine would not. */
function fill(db: DatabaseSync): void {
  // FOREIGN KEYS OFF WHILE FILLING, and that is what a restore does too: a dump
  // is reloaded table by table in schema order, so a child row lands before its
  // parent as a matter of course. `wrangler d1 execute --file` reads a dump whose
  // first line is `PRAGMA foreign_keys=OFF;` for exactly this reason, and so does
  // the dump below. Turning them off here keeps the fixture honest about the
  // procedure rather than about SQLite's defaults.
  db.exec("PRAGMA foreign_keys = OFF;")
  for (const table of tablesOf(db)) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as ColumnInfo[]
    const names: string[] = []
    const values: (string | number)[] = []
    for (const c of columns) {
      // A column with a default and no NOT NULL can be left to the schema — that
      // is part of what a reload has to reproduce.
      if (!c.notnull && !c.pk && c.dflt_value !== null) continue
      names.push(c.name)
      values.push(/INT|REAL|NUM/i.test(c.type) ? 7 : `${table}.${c.name} value`)
    }
    if (!names.length) continue
    db.prepare(
      `INSERT INTO ${table} (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`
    ).run(...values)
  }
}

/** The dump: the schema exactly as the database states it, then every row as an
 * INSERT. This is the shape `wrangler d1 export` produces and the shape
 * `wrangler d1 execute --file` reads back, which is what makes the round trip
 * below a rehearsal of the documented procedure rather than of an idea. */
function dump(db: DatabaseSync): string {
  const out: string[] = ["PRAGMA foreign_keys=OFF;"]
  // TABLES BEFORE EVERYTHING ELSE. `sqlite_master` is read here in a deterministic
  // order (type, then name) so the comparison below is stable, and that order puts
  // 'index' ahead of 'table' — reloading it verbatim fails on the first index,
  // naming a table the file has not created yet. A real dump orders by dependency,
  // so this one does too; it is the second thing a hand-written dumper gets wrong,
  // after forgetting the indexes altogether.
  const rank = (t: string) => (t === "table" ? 0 : t === "view" ? 1 : 2)
  for (const row of [...schema(db)].sort((a, b) => rank(a.type) - rank(b.type)))
    out.push(`${row.sql};`)
  for (const table of tablesOf(db)) {
    for (const r of db.prepare(`SELECT * FROM ${table}`).all() as unknown as Record<string, unknown>[]) {
      const cols = Object.keys(r)
      const vals = cols.map((c) => {
        const v = r[c]
        if (v === null || v === undefined) return "NULL"
        if (typeof v === "number" || typeof v === "bigint") return String(v)
        return `'${String(v).replaceAll("'", "''")}'`
      })
      out.push(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${vals.join(", ")});`)
    }
  }
  return out.join("\n")
}

const rowsOf = (db: DatabaseSync, table: string) =>
  db.prepare(`SELECT * FROM ${table}`).all() as unknown as Record<string, unknown>[]

describe("the core schema round-trips: dump → empty database → the same database", () => {
  it("rehearses every migration on disk, not a remembered subset", () => {
    // THE ROT CHECK, and the reason this file exists. The old rehearsal was a
    // date in a document; this one is a count taken from the directory at the
    // moment it runs, so "20 of 28" cannot happen again.
    const files = migrations()
    expect(files.length, "expected db/core to hold migrations").toBeGreaterThan(20)
    expect(files[0].name).toMatch(/^0001_/)
  })

  it("every migration applies to an empty database, in order", () => {
    // A restore starts from nothing. A migration that only works against a
    // database that already has rows in it is a migration a restore cannot use,
    // and the day you find that out is the worst possible day.
    const db = built()
    expect(tablesOf(db).length, "expected real tables").toBeGreaterThan(10)
    db.close()
  })

  it("the dump reloads into an empty database with the same schema", () => {
    const original = built()
    fill(original)
    const sql = dump(original)

    const restored = new DatabaseSync(":memory:")
    restored.exec(sql)

    // Compared as the database describes itself, both sides — tables AND indexes.
    // Indexes are the half a naive dump loses, and losing one is invisible until
    // a query that needed it runs on a full table.
    expect(schema(restored)).toEqual(schema(original))
    const indexes = schema(original).filter((r) => r.type === "index")
    expect(indexes.length, "expected the schema to carry indexes to lose").toBeGreaterThan(10)
    original.close()
    restored.close()
  })

  it("every row comes back byte-identical", () => {
    const original = built()
    fill(original)
    const restored = new DatabaseSync(":memory:")
    restored.exec(dump(original))

    let compared = 0
    for (const table of tablesOf(original)) {
      const before = rowsOf(original, table)
      expect(rowsOf(restored, table), `${table} did not survive the round trip`).toEqual(before)
      compared += before.length
    }
    // THE CANARY. Every assertion above is an equality between two things that
    // would also be equal if both were empty — a dump that wrote no INSERTs at
    // all would pass every one of them.
    expect(compared, "the rehearsal must actually have moved rows").toBeGreaterThan(10)
    original.close()
    restored.close()
  })
})
