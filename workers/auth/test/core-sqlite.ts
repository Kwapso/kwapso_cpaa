// THE GLOBAL CORE DATABASE, FOR REAL, IN MEMORY. D1 *is* SQLite, so the throttle
// suites run their statements against node:sqlite with the ACTUAL migrations
// applied — a stub that "understands" the SQL would happily agree with a broken
// WHERE clause, and what these tests are about is what the database does when two
// requests arrive at once.
//
// Deliberately import-free apart from node built-ins: this is a leaf both auth
// throttle suites lean on (login-codes and email-change), and the whole point of
// it being one file is that they cannot disagree about what a D1 statement does.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { DatabaseSync, SqlValue } from "node:sqlite"

const CORE = join(__dirname, "..", "..", "..", "db", "core")

/** A core migration's SQL, read straight off disk — so a migration that forgets
 * a column fails in the suite, not in production. */
export function migration(name: string): string {
  return readFileSync(join(CORE, name), "utf8")
}

/** The slice of the D1 binding the throttles use, over real SQLite. Each
 * statement runs ATOMICALLY (as D1 does); the awaits in between are where
 * concurrent requests interleave — which is exactly the race being tested. */
export function d1(db: DatabaseSync) {
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
        async all<T>(): Promise<{ results: T[] }> {
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
