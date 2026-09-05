// THE READS THAT MUST NOT GO BACK TO SCANNING.
//
// speed_review, 5 Sep 2026, measured the two worst read SHAPES in the product
// with EXPLAIN QUERY PLAN: the team-wide time view answered `SCAN w | USE TEMP
// B-TREE FOR ORDER BY`, and every dropdown read in the app answered `SCAN
// selectable_data`. Both cost about two milliseconds at today's row counts —
// 240 work logs, 125 dropdown values — and that is exactly why nothing caught
// them and nothing would have caught them coming back. A missing index is
// invisible until the table is big, and by then it is a production incident
// rather than a migration.
//
// So the shape is asserted rather than the duration. Migration 0061 added the
// two indexes; this reads the planner's own answer for the statements the
// time screen actually issues and the four the dropdowns issue, and fails if any
// of them falls back to a table scan or re-grows a temp b-tree for its ORDER BY.
//
// WHY node:sqlite AND NOT STAGING. D1 is SQLite, `TEAM_MIGRATIONS` is the same
// list a real team database is built from, and the query planner's decision is a
// property of the schema and the statement — not of the rows. Replaying the
// migrations here gives the identical `EXPLAIN QUERY PLAN` output D1 gives
// (verified against staging on 5 Sep 2026, same strings), with no credentials
// and no network, so this runs in the ordinary suite.
//
// WHY THE STATEMENTS ARE SPELLED OUT. They are the shapes `logWhere` composes in
// workers/content/src/lib/work-logs.ts and the reads listed in tenancy's
// lib/selectable.ts — copied, not imported, because the point is to pin the
// planner's answer for a KNOWN statement. A helper that built the SQL would
// track a change in the composer and quietly stop testing the thing that
// regressed. If one of these stops matching its caller, this test is the wrong
// kind of green and the comment above the caller should say so.

import { describe, expect, it } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { TEAM_MIGRATIONS } from "../src/team-schema"

function freshTeamDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:")
  for (const m of TEAM_MIGRATIONS) db.exec(m.sql)
  return db
}

function plan(db: DatabaseSync, sql: string): string {
  return (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[])
    .map((r) => r.detail)
    .join(" | ")
}

/** The five statements the time screen issues that had NO usable index before
 * 0061. All of them share `logWhere`'s one always-present predicate,
 * `discarded_at IS NULL`, and none of the three pre-existing indexes leads with
 * it. */
const WORK_LOG_READS: Record<string, string> = {
  "the paged list, default sort":
    "SELECT w.id FROM work_logs w WHERE w.discarded_at IS NULL ORDER BY w.started_at DESC, w.id DESC LIMIT 51",
  "the bounded count and the exact sum":
    "SELECT (SELECT COUNT(*) FROM (SELECT 1 FROM work_logs w WHERE w.discarded_at IS NULL LIMIT 1000001)) AS n," +
    " (SELECT SUM(w.seconds) FROM work_logs w WHERE w.discarded_at IS NULL) AS s",
  "time by kind":
    "SELECT w.kind, SUM(w.seconds) AS s FROM work_logs w WHERE w.discarded_at IS NULL" +
    " GROUP BY w.kind ORDER BY s DESC LIMIT 50",
  "the eight week sums":
    "SELECT SUM(CASE WHEN w.started_at >= '2026-08-01' AND w.started_at < '2026-08-08'" +
    " THEN w.seconds ELSE 0 END) AS w0 FROM work_logs w WHERE w.discarded_at IS NULL LIMIT 1",
  "narrowed to a period":
    "SELECT w.id FROM work_logs w WHERE w.discarded_at IS NULL AND w.started_at >= '2026-08-01'" +
    " ORDER BY w.started_at DESC, w.id DESC LIMIT 51",
}

/** The dropdown reads, from tenancy's lib/selectable.ts, routes/query.ts and
 * content's lib/vocabulary.ts. */
const SELECTABLE_READS: Record<string, string> = {
  "one kind of dropdown value":
    "SELECT id, value FROM selectable_data WHERE type = 'x' AND deactivated_at IS NULL",
  "does this exact value already exist":
    "SELECT id FROM selectable_data WHERE type = 'x' AND value = 'y' AND deactivated_at IS NULL",
  "the whole vocabulary, ordered":
    "SELECT id FROM selectable_data ORDER BY type ASC, value ASC LIMIT 1000",
  "grouped by kind for the knowledge sweep":
    "SELECT type, MAX(COALESCE(updated_at, created_at)) AS sort_at FROM selectable_data" +
    " GROUP BY type ORDER BY sort_at, type LIMIT 50",
}

/** THE TWO THAT WERE NEVER SCANNING. speed_review's finding said the time
 * screen's six reads all fell back to a table scan; the planner disagrees about
 * these two. Both GROUP BY `user_id`, so SQLite walks `idx_work_logs_user`
 * (which leads with that column) and gets the grouping for free — a correction
 * to the review, made by asking the planner rather than by reading the index
 * list. They are kept here so a future change that DOES make them scan is
 * caught; they are simply not what 0061 is for. */
const ALREADY_INDEXED_BY_USER: Record<string, string> = {
  "how many people logged anything":
    "SELECT w.user_id FROM work_logs w WHERE w.discarded_at IS NULL GROUP BY w.user_id",
  "time by person":
    "SELECT w.user_id, MAX(w.user_name) AS user_name, SUM(w.seconds) AS s FROM work_logs w" +
    " WHERE w.discarded_at IS NULL GROUP BY w.user_id ORDER BY s DESC LIMIT 50",
}

describe("the hot reads resolve through an index", () => {
  const db = freshTeamDb()

  for (const [name, sql] of Object.entries(WORK_LOG_READS)) {
    it(`work_logs — ${name}`, () => {
      const detail = plan(db, sql)
      // A bare `SCAN w` with no index named is the finding this migration
      // answered. `SCAN … USING INDEX` and `SEARCH …` are both fine: one is an
      // index-only pass over the live rows, the other a range seek.
      expect(detail, detail).not.toMatch(/SCAN w(?! USING)/)
      expect(detail, detail).toContain("idx_work_logs_live")
    })
  }

  for (const [name, sql] of Object.entries(ALREADY_INDEXED_BY_USER)) {
    it(`work_logs — ${name} (served by idx_work_logs_user, before and after)`, () => {
      const detail = plan(db, sql)
      expect(detail, detail).toMatch(/USING INDEX idx_work_logs_/)
    })
  }

  it("work_logs — the list no longer sorts into a temp b-tree", () => {
    // The keyset ORDER BY is the index's own column order, so the sort is free.
    // This is the half a row count can hide: a temp b-tree over 240 rows is
    // invisible and over 240,000 is the screen.
    expect(plan(db, WORK_LOG_READS["the paged list, default sort"])).not.toContain(
      "USE TEMP B-TREE FOR ORDER BY"
    )
  })

  for (const [name, sql] of Object.entries(SELECTABLE_READS)) {
    it(`selectable_data — ${name}`, () => {
      const detail = plan(db, sql)
      expect(detail, detail).not.toMatch(/SCAN selectable_data(?! USING)/)
      expect(detail, detail).toContain("idx_selectable_type_value")
    })
  }

  it("the canary: these statements DO scan without the migration", () => {
    // WHAT WOULD THIS TEST SAY IF THE THING IT GUARDS WERE DELETED? Without this
    // it would say "green" for a schema that never had the indexes at all — the
    // planner names whatever index it finds, and an assertion that passes on an
    // unindexed table is an assertion about nothing. So the same statements are
    // run against the schema as it stood at 0060 and are REQUIRED to scan.
    const before = new DatabaseSync(":memory:")
    for (const m of TEAM_MIGRATIONS) {
      if (m.version === "0061_reads_that_can_use_an_index") break
      before.exec(m.sql)
    }
    expect(plan(before, WORK_LOG_READS["the paged list, default sort"])).toContain(
      "USE TEMP B-TREE FOR ORDER BY"
    )
    expect(plan(before, SELECTABLE_READS["one kind of dropdown value"])).toContain(
      "SCAN selectable_data"
    )
  })
})
