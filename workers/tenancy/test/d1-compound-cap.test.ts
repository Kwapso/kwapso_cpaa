// D1 REFUSES A COMPOUND SELECT OF MORE THAN FIVE TERMS.
//
// SQLite's own ceiling is 500, so an eleven-term `SELECT … UNION ALL SELECT …`
// is unremarkable SQL and passes every local suite. D1 answers it with
// "too many terms in compound SELECT: SQLITE_ERROR", and a migration that
// throws leaves the team on the previous schema — while the code that needs the
// new tables has already shipped above it. That is exactly what happened on
// 2026-08-12: five staging teams sat on 0013 with 0014-0018 written, deployed,
// and unusable, and the door reported a bare 500.
//
// Measured, not assumed — probed against the live staging database:
//   3 terms ok · 5 terms ok · 8 terms REFUSED · 12 REFUSED · 20 REFUSED
//
// So a migration seeds many rows as many statements, never as one long chain.
// Generate them from an array (see INTERNAL_VOCABULARY) rather than writing the
// chain out, because a hand-written chain grows one line at a time and crosses
// the line without anybody noticing.

import { describe, expect, it } from "vitest"

import { TEAM_MIGRATIONS } from "../src/team-schema"

/** D1's hard ceiling on terms in one compound SELECT. Not SQLite's 500. */
const D1_COMPOUND_CAP = 5

describe("no migration sends D1 a compound SELECT it will refuse", () => {
  it("every statement in every team migration stays under the cap", () => {
    const over: string[] = []
    for (const m of TEAM_MIGRATIONS) {
      for (const statement of m.sql.split(";")) {
        // `UNION`, `UNION ALL`, `INTERSECT` and `EXCEPT` each add a term, and so
        // does a multi-row VALUES list — SQLite compiles that as a compound too.
        const compounds = (statement.match(/\b(UNION(\s+ALL)?|INTERSECT|EXCEPT)\b/gi) ?? []).length
        const valueRows = (statement.match(/\)\s*,\s*\(/g) ?? []).length
        const terms = Math.max(compounds + 1, valueRows + 1)
        if (terms > D1_COMPOUND_CAP)
          over.push(
            `${m.version}: ${terms} terms — ${statement.trim().split("\n").find((l) => /INSERT|SELECT/i.test(l))?.slice(0, 64) ?? ""}`
          )
      }
    }
    expect(
      over,
      `D1 refuses a compound SELECT past ${D1_COMPOUND_CAP} terms, and a refused migration leaves ` +
        `every existing team on the previous schema with the new code already deployed. Split these ` +
        `into one statement per row, generated from an array:\n` +
        over.join("\n")
    ).toEqual([])
  })

  it("the version strings are unique and ordered", () => {
    // The same rollout also proved the version STAMP is all-or-nothing while the
    // migrations are applied one at a time: a team can hold 0014-0017 in its own
    // _migrations table while `teams.schema_version` still reads 0013. Ordering
    // is what makes a re-run land the rest instead of guessing.
    const versions = TEAM_MIGRATIONS.map((m) => m.version)
    expect(new Set(versions).size, "two migrations share a version string").toBe(versions.length)
    expect([...versions].sort(), "migrations are not in ascending version order").toEqual(versions)
  })
})
