// Unit tests for the team factory's pure logic: schema + seed building.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { sqlString } from "@shared/workers/d1-rest"
import {
  buildTeamSeed,
  DEFAULT_SELECTABLE,
  TEAM_MIGRATIONS,
  TEAM_MODULES,
} from "../src/team-schema"

const ROOT = join(__dirname, "..", "..", "..")

const ACTOR = { id: "01TEST", email: "chris@x.com", name: "Chris O'Brien" }

describe("buildTeamSeed", () => {
  const seed = buildTeamSeed(ACTOR, "2026-06-12T00:00:00.000Z")

  it("seeds 2 roles + a full tall permission sheet + all dropdown defaults", () => {
    const inserts = seed.script.match(/INSERT INTO/g) ?? []
    // 2 roles + (2 roles × modules) permissions + dropdown defaults
    expect(inserts.length).toBe(2 + 2 * TEAM_MODULES.length + DEFAULT_SELECTABLE.length)
  })

  it("Admin gets every switch; Viewer is read-only except the agent (use)", () => {
    const adminRows = seed.script
      .split("\n")
      .filter((l) => l.includes("role_permissions") && l.includes(seed.adminRoleId))
    const viewerRows = seed.script
      .split("\n")
      .filter((l) => l.includes("role_permissions") && l.includes(seed.viewerRoleId))
    expect(adminRows).toHaveLength(TEAM_MODULES.length)
    expect(viewerRows).toHaveLength(TEAM_MODULES.length)
    for (const row of adminRows) expect(row).toContain("1, 1, 1, 1")
    // Viewer is read-only everywhere, EXCEPT the agent: everyone may USE it
    // (read+create) — still capped by their other rights.
    for (const row of viewerRows) {
      if (row.includes("'agent'")) expect(row).toContain("1, 1, 0, 0")
      else expect(row).toContain("1, 0, 0, 0")
    }
  })

  it("escapes quotes in names (O'Brien) so the script can't break", () => {
    expect(seed.script).toContain("Chris O''Brien")
  })
})

describe("sqlString", () => {
  it("doubles single quotes and handles null", () => {
    expect(sqlString("it's")).toBe("'it''s'")
    expect(sqlString(null)).toBe("NULL")
  })
})

// A DROPDOWN GROUP'S NAME IS DATA, AND IT IS WRITTEN DOWN IN FOUR PLACES.
//
// The seed writes it into a fresh team. A migration relabels it in the teams that
// already exist. And the two screens that draw the picker filter on it by string.
// Nothing joined them, so renaming the Help section to Tickets could have moved
// three of the four and left the fourth reading a name that no longer exists —
// which does not throw, does not fail a type check, and does not go red. It shows
// an empty Type dropdown, and only to teams that already had data.
//
// So: the seed's group names, the migration's target names, and the names the app
// filters on all have to be the same strings. Derived on both ends — the seed from
// the module, the readers off disk.
describe("the ticket vocabulary is one name, everywhere it is written down", () => {
  /** The `type` values the ticket screens filter selectable_data by. */
  const filtered = ["web/lib/use-screen-data.ts", "web/components/help-detail.tsx"].map((f) => {
    const src = readFileSync(join(ROOT, f), "utf8")
    return { file: f, match: src.match(/v\.type === "([^"]+)"/)?.[1] }
  })

  it("the seed's group names are the ones the screens filter on", () => {
    const seeded = new Set(DEFAULT_SELECTABLE.map((v) => v.type))
    expect(seeded.has("Ticket type"), "the seed must ship a 'Ticket type' vocabulary").toBe(true)
    for (const { file, match } of filtered) {
      expect(match, `${file} does not filter selectable_data by a type at all`).toBeDefined()
      expect(
        seeded.has(match as string),
        `${file} filters on "${match}", which the seed never writes — a fresh team's ticket Type dropdown would be empty`
      ).toBe(true)
    }
  })

  it("the migration renames the OLD group to exactly the name the seed now uses", () => {
    const sql = TEAM_MIGRATIONS.map((m) => m.sql).join("\n")
    const renames = [...sql.matchAll(/UPDATE selectable_data SET type = '([^']+)' WHERE type = '([^']+)'/g)]
    expect(
      renames.length,
      "no vocabulary rename found — an existing team's rows still carry the old group name"
    ).toBeGreaterThan(0)
    const seeded = new Set(DEFAULT_SELECTABLE.map((v) => v.type))
    for (const [, to, from] of renames) {
      expect(
        seeded.has(to),
        `the migration renames '${from}' to '${to}', which the seed does not use — the two would disagree`
      ).toBe(true)
      expect(seeded.has(from), `'${from}' is being renamed AND still seeded`).toBe(false)
    }
  })
})

describe("team schema", () => {
  it("every migration creates the _migrations stamp table first", () => {
    expect(TEAM_MIGRATIONS[0].sql).toContain("CREATE TABLE _migrations")
  })
  it("covers the locked module list", () => {
    expect([...TEAM_MODULES]).toEqual([
      "teams",
      "team_members",
      "member_roles",
      "accounts",
      "portal_users",
      "learning",
      "help",
      "selectable_data",
      "screens",
      "agent",
      // The map and the money, kept apart on purpose. `processes` is CUSTOMER
      // material — a contact reads their own company's maps, so its doors are
      // fenced rather than refused. `commercials` is the agency's own books, and
      // no client login passes one of its doors at all.
      "processes",
      "commercials",
    ])
  })
})
