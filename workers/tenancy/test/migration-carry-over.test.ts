import { DatabaseSync } from "node:sqlite"
import { describe, expect, it } from "vitest"
import { TEAM_MIGRATIONS } from "../src/team-schema"

/** TWO VERSIONS CUT ON ONE DAY — the shape that rolled the real migration back.
 * The backfill must keep the LAST word for that day, not collide on it. */
describe("0054's carry-over survives two versions cut on one day", () => {
  it("keeps one revision per step per day, the later version's", () => {
    const db = new DatabaseSync(":memory:")
    for (const m of TEAM_MIGRATIONS) {
      if (m.version === "0054_the_audit_module_finished") break
      db.exec(m.sql)
    }
    db.exec(`
      INSERT INTO accounts (id, account_type, name, created_at) VALUES ('A1','entity','Client','2026-01-01');
      INSERT INTO apps (id, account_id, name, created_at) VALUES ('AP1','A1','System','2026-01-01');
      INSERT INTO processes (id, app_id, account_id, name, created_at) VALUES ('P1','AP1','A1','Map','2026-01-01');
      INSERT INTO process_versions (id, process_id, account_id, version_no, created_at)
        VALUES ('V1','P1','A1',1,'2026-03-01T09:00:00.000Z'),
               ('V2','P1','A1',2,'2026-03-01T17:00:00.000Z');
      INSERT INTO process_steps (id, process_id, version_id, account_id, step_key, name, position, seconds_per_run, runs_per_month, created_at)
        VALUES ('S1','P1','V1','A1','SK1','Take the call',0,1500,30,'2026-03-01'),
               ('S2','P1','V2','A1','SK1','Take the call',0,300,30,'2026-03-01');
    `)
    const m54 = TEAM_MIGRATIONS.find((m) => m.version === "0054_the_audit_module_finished")
    db.exec((m54 as { sql: string }).sql)
    const rows = db
      .prepare("SELECT effective_on, seconds_per_run FROM process_step_revisions WHERE step_key = 'SK1'")
      .all() as { effective_on: string; seconds_per_run: number }[]
    expect(rows, "one revision for that day, not two").toHaveLength(1)
    expect(rows[0].seconds_per_run, "the later version's description is the day's last word").toBe(300)
  })
})
