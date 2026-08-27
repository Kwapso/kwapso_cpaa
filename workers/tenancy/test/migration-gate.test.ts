// THE DEPLOY'S MIGRATION GATE — what it promises, locked.
//
// `scripts/check-team-migrations.mjs` refuses a deploy while a live team database
// is behind `TEAM_MIGRATIONS`. It is a PIPELINE GATE, not a Law of the Base — it
// asks about the live estate — so it has no RULES.md entry and no registry row.
// What it does have is a fistful of properties that were each proved by hand on
// one afternoon (27 Aug 2026), and a proof nobody can re-run is a proof that
// decays. This is that afternoon, made repeatable, with no network in it.
//
// IT LIVES HERE, beside the robot rather than in web/test/ with the laws,
// because the ORACLE lives here. The gate parses `TEAM_MIGRATIONS` out of the
// file; this suite IMPORTS it. Two different routes to one answer is what makes
// the comparison worth anything — a test that re-derived it the same way would
// only prove the parser agrees with itself.
//
// The four properties, and what each one is standing in front of:
//
//   1. THE LATEST VERSION the gate computes is the one the ROBOT computes. If
//      these ever disagree the gate is measuring against a migration nobody is
//      rolling out.
//   2. A `version:` OUTSIDE the array is invisible. This is the accidental
//      adversarial test: the planning session's first mutation proof landed past
//      the array's close and the gate correctly reported OK. A regex would have
//      gone red for a reason nobody could have acted on, which is this repo's
//      other recurring failure — a check that fails for the wrong reason teaches
//      people to ignore it just as fast as one that never fails at all.
//   3. THE POPULATION IS THE ROBOT'S. Proved against real SQLite rather than by
//      matching text: a `failed` team and a deactivated team must be invisible
//      to the gate, because they are invisible to the remedy. This is the whole
//      trap — a gate that refuses over a team nobody can migrate is a gate
//      somebody switches off, and then the estate has neither.
//   4. A WAIVER CANNOT ROT. It is the one deliberate hole, so it is the one that
//      has to be nailed to the floor: wrong team, wrong version, past its date,
//      or belonging to the other environment, and it stops excusing anything.

import { describe, expect, it } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { TEAM_MIGRATIONS } from "../src/team-schema"
// @ts-expect-error — the gate is a plain .mjs script; it ships no types and the
// suite is the only thing that imports it.
import * as gate from "../../../scripts/check-team-migrations.mjs"

// `__dirname`, as spine-harness.ts reads the core migrations — this workspace
// compiles against workers-types, which has no node:url in it.
const ROOT = join(__dirname, "..", "..", "..")
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8")

describe("the latest team-schema migration, two ways", () => {
  it("agrees with the expression the robot itself uses", () => {
    // migrateTeams computes `TEAM_MIGRATIONS[TEAM_MIGRATIONS.length - 1].version`
    // and stamps it onto every team it carries forward. The gate reads the same
    // answer off the FILE. A gate measuring against a different "latest" than the
    // robot writes is a gate that refuses forever or never refuses at all.
    expect(gate.latestTeamMigration()).toBe(TEAM_MIGRATIONS[TEAM_MIGRATIONS.length - 1].version)
  })

  it("looks like a migration version at all (the scan has not gone blind)", () => {
    expect(gate.latestTeamMigration()).toMatch(/^\d{4}_\w+/)
  })

  it("takes the LAST entry, not the first and not the highest-numbered", () => {
    const source = `
      export const TEAM_MIGRATIONS = [
        { version: "0002_second", sql: \`\` },
        { version: "0009_highest", sql: \`\` },
        { version: "0003_last_in_the_array", sql: \`\` },
      ]`
    expect(gate.latestMigrationIn(source)).toBe("0003_last_in_the_array")
  })

  it("cannot see a `version:` that is not in the array — the accidental proof", () => {
    // Exactly what happened: a mutation pasted past the array's close. The gate
    // said OK and was RIGHT. Text matching would have answered "0058_stray".
    const source = `
      export const TEAM_MIGRATIONS = [
        { version: "0001_real", sql: \`\` },
      ]
      // a comment mentioning version: "0057_in_prose"
      export const SOMETHING_ELSE = { version: "0058_stray" }`
    expect(gate.latestMigrationIn(source)).toBe("0001_real")
  })

  it("throws rather than guessing when the array is not where it was", () => {
    // No fallback anywhere in this script, on purpose: a fallback is how a gate
    // goes quietly green while the estate is behind.
    expect(() => gate.latestMigrationIn("export const SOMETHING = []")).toThrow(/TEAM_MIGRATIONS/)
    expect(() => gate.latestMigrationIn("export const TEAM_MIGRATIONS = []")).toThrow()
    expect(() => gate.latestMigrationIn("export const TEAM_MIGRATIONS = [{ sql: `x` }]")).toThrow(
      /version/
    )
  })
})

describe("the gate counts exactly the teams the robot counts", () => {
  const fence = () => gate.robotTeamFence() as string

  it("is lifted from migrateTeams' own SQL, not typed twice", () => {
    expect(read("workers/tenancy/src/routes/admin.ts")).toContain(`FROM teams ${fence()}`)
  })

  it("throws if the robot's query changes shape (fail loud, never silently wide)", () => {
    expect(() => gate.robotFenceIn("export const x = 1")).toThrow(/migrateTeams/)
  })

  it("SKIPS a failed team and a deactivated one, against real SQLite", () => {
    // The property, not the wording of it. D1 is SQLite, so the clause the gate
    // will actually send is the clause run here.
    //
    // The `failed` row is not hypothetical: staging holds one — a leftover
    // "Smoke team" stranded with a null schema_version because CF_D1_TOKEN had
    // been rotated and the REST door was refusing. The robot skips it, so the
    // gate must skip it, or every deploy that morning would have been blocked by
    // something no remedy could fix.
    const db = new DatabaseSync(":memory:")
    db.exec(`CREATE TABLE teams (
      id TEXT PRIMARY KEY, name TEXT, db_status TEXT NOT NULL DEFAULT 'ready',
      schema_version TEXT, deactivated_at TEXT);`)
    db.exec(`INSERT INTO teams (id, name, db_status, schema_version, deactivated_at) VALUES
      ('T_LIVE',    'Live team',    'ready',    '0001_old', NULL),
      ('T_FAILED',  'Smoke team',   'failed',   NULL,       NULL),
      ('T_CREATING','Half-built',   'creating', NULL,       NULL),
      ('T_GONE',    'Retired team', 'ready',    '0001_old', '2026-08-01');`)

    const seen = db
      .prepare(`SELECT id FROM teams ${fence()}`)
      .all()
      .map((r) => (r as { id: string }).id)
    expect(seen).toEqual(["T_LIVE"])
  })

  it("and deactivating a stuck team is therefore a real way out", () => {
    // The first answer the script's header gives to "this team cannot be
    // migrated": deactivate it. That only works if the fence honours it, which
    // is the row above — asserted separately because it is a PROMISE the header
    // makes to somebody at two in the morning, not an incidental behaviour.
    expect(fence()).toContain("deactivated_at IS NULL")
    expect(fence()).toContain("db_status = 'ready'")
  })
})

describe("a waiver cannot rot", () => {
  const BEHIND = [{ id: "T1", name: "Stuck team", schema_version: "0055_old" }]
  const waiver = (over: Record<string, unknown> = {}) => ({
    env: "staging",
    teamId: "T1",
    name: "Stuck team",
    stuckAt: "0055_old",
    until: "2026-12-31",
    why: "its database answers nothing over the REST door",
    ...over,
  })
  const run = (waivers: unknown[], today = "2026-08-27") =>
    gate.waiverProblems("staging", waivers, BEHIND, today) as {
      problems: string[]
      waived: Set<string>
    }

  it("an honest, in-date waiver excuses its team and nothing else", () => {
    const { problems, waived } = run([waiver()])
    expect(problems).toEqual([])
    expect([...waived]).toEqual(["T1"])
  })

  it("goes red when the team it names is not behind any more", () => {
    const { problems, waived } = run([waiver({ teamId: "T_OTHER" })])
    expect(problems.join(" ")).toMatch(/not behind/)
    expect(waived.size).toBe(0)
  })

  it("goes red when it names a version the team is not at", () => {
    const { problems, waived } = run([waiver({ stuckAt: "0050_something_else" })])
    expect(problems.join(" ")).toMatch(/0050_something_else/)
    expect(waived.size).toBe(0)
  })

  it("goes red the day after it expires — it can only ever be renewed on purpose", () => {
    expect(run([waiver({ until: "2026-08-27" })], "2026-08-27").problems).toEqual([])
    const { problems, waived } = run([waiver({ until: "2026-08-26" })], "2026-08-27")
    expect(problems.join(" ")).toMatch(/expired on 2026-08-26/)
    expect(waived.size).toBe(0)
  })

  it("never leaks across environments — a staging waiver excuses nothing in production", () => {
    const { problems, waived } = gate.waiverProblems(
      "production",
      [waiver()],
      BEHIND,
      "2026-08-27"
    ) as { problems: string[]; waived: Set<string> }
    expect(problems).toEqual([])
    expect(waived.size).toBe(0)
  })

  it("every waiver actually shipped carries its reason and its expiry", () => {
    // Empty today, and that is the point of it. This is the guard for the day it
    // is not: a half-written waiver must not be a quiet one.
    for (const w of gate.MIGRATION_WAIVERS as Record<string, string>[]) {
      expect(["staging", "production"]).toContain(w.env)
      expect(w.teamId?.length, "a waiver names the team").toBeGreaterThan(0)
      expect(w.stuckAt?.length, "a waiver states the version it is stuck at").toBeGreaterThan(0)
      expect(w.until, "a waiver expires on an ISO date").toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(w.why?.length, "a waiver needs a real reason").toBeGreaterThan(20)
    }
  })
})

describe("where it sits in the pipeline", () => {
  const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>

  it("both deploy commands open with it", () => {
    // FIRST, ahead of lang:check and ahead of the build, for lang:check's own
    // stated reason (OPERATIONS.md): it is one read, and it must fail in a second
    // rather than after two minutes of building something that cannot ship.
    for (const [name, env] of [
      ["deploy:staging", "staging"],
      ["deploy:production", "production"],
    ]) {
      const cmd = scripts[name]
      expect(cmd, `${name} must run the migration gate`).toContain(`migrations:check -- ${env}`)
      expect(
        cmd.indexOf("migrations:check"),
        `${name} must check migrations before lang:check`
      ).toBeLessThan(cmd.indexOf("lang:check"))
      expect(
        cmd.indexOf("migrations:check"),
        `${name} must check migrations before the build`
      ).toBeLessThan(cmd.indexOf("check:built"))
    }
  })

  it("has no way to be switched off", () => {
    // Deliberate, and the header says why: an env-var escape hatch is the only
    // option that can disable this forever without leaving a mark in a diff.
    const source = read("scripts/check-team-migrations.mjs")
    const envReads = [...new Set(source.match(/process\.env\.\w+/g) ?? [])].sort()
    expect(envReads, "the only environment variable this reads is the account guard").toEqual([
      "process.env.CLOUDFLARE_ACCOUNT_ID",
    ])
  })
})
