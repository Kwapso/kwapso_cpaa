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
      "knowledge",
      "selectable_data",
      "screens",
      "agent",
      // The map and the money, kept apart on purpose. `processes` is CUSTOMER
      // material — a contact reads their own company's maps, so its doors are
      // fenced rather than refused. `commercials` is the agency's own books, and
      // no client login passes one of its doors at all.
      "processes",
      "commercials",
      // THE WORK ENGINE — stories, the sprints they sit in, and the time logged
      // against them. Agency material: a client login never holds it, and every
      // door on it refuses a portal caller rather than fencing one.
      "work",
      // TO-DOS are the exception in this list: the one module a CLIENT login is
      // meant to hold rights on, because a to-do is aimed at them and they
      // complete it themselves. That is why it is not four more rights on
      // `work`, which no client holds at all.
      "todos",
      // THE AGENCY'S OWN HOUSEKEEPING — the four modules carrying the seven
      // legacy tables that describe how the agency runs ITSELF rather than what
      // it does for a client. None of them is customer material, so unlike
      // `processes` every door on all four REFUSES a client login rather than
      // fencing one (the refusal-symmetry suite holds both halves of each).
      //
      // Two of the seven legacy tables are deliberately not here: `departments`
      // and `channels` are bare labels, and the base already has one home for a
      // team's editable vocabulary. A module built to hold a word is ceremony.
      "marketing",
      "brand_assets",
      "delivery",
      "staff_profiles",
    ])
  })
})

// THE SIXTEEN UNGROUPED LEGACY VALUES, AND THE OWNER'S RULING ABOUT THEM.
//
// Sixteen of the legacy app's 154 dropdown values carried no group at all: ten
// country names, five company-size bands and one stray hyphen. The reconciliation
// recommended making them two FIELDS on the account; the owner overruled it and
// asked for two GROUPS, and the reason holds up — a country typed free into an
// address is a country spelled five ways by five people, which is the exact
// failure the dropdown module exists to prevent.
//
// A group is not a row: the table holds (type, value) pairs, so a group EXISTS
// only once it has a value. That is why this is testable at all, and why it has
// to be: "we created two groups" is a claim about DATA, and the way a claim about
// data gets quietly undone is somebody tidying a seed list.
describe("the two dropdown groups the legacy migration lands in", () => {
  const groups = new Set(DEFAULT_SELECTABLE.map((v) => v.type))

  it("a new team starts with both groups, so the picker is never empty", () => {
    expect(groups, "the owner ruled for a Country GROUP, not a field on the account").toContain("Country")
    expect(groups, "the owner ruled for a Company size GROUP, not a field on the account").toContain(
      "Company size"
    )
  })

  it("the size bands are the five the legacy data has", () => {
    const bands = DEFAULT_SELECTABLE.filter((v) => v.type === "Company size")
    expect(bands.length, "five bands, as the legacy data has").toBe(5)
  })

  it("the stray hyphen is NOT carried across — it is a typo, not a value", () => {
    // The sixteenth ungrouped value. Importing it would put a dash in a picker
    // somebody then chooses by accident, and a record whose country is "-" is
    // worse than one with no country at all, because it looks answered.
    const junk = DEFAULT_SELECTABLE.filter((v) => /^[-–—\s]*$/.test(v.value))
    expect(junk, `a blank or dash value is not a value: ${JSON.stringify(junk)}`).toEqual([])
  })

  it("an EXISTING team gets the same two groups, and gets them idempotently", () => {
    const sql = TEAM_MIGRATIONS.find((m) => m.version === "0018_agency_internal")?.sql ?? ""
    expect(sql, "the agency-internal migration has moved or been renamed").not.toBe("")
    expect(sql, "existing teams need the Country group too").toContain("'Country'")
    expect(sql, "existing teams need the Company size group too").toContain("'Company size'")
    // Idempotent: the migration runner applies a version once, but a team that
    // already types its own country values must not end up with duplicates when
    // the legacy import arrives on top.
    expect(sql, "the value seed must not duplicate a group a team already has").toContain(
      "WHERE NOT EXISTS"
    )
  })
})

// THE SEVEN LEGACY TABLES, AND WHERE EACH ONE LANDED.
//
// Six tables and two vocabulary groups carry all seven. This locks the SHAPE of
// that answer, because the shape is the decision: a table that quietly became a
// dropdown value, or a dropdown value that quietly became a table, is the
// migration answering a question the owner already answered.
describe("the agency-internal migration", () => {
  const sql = TEAM_MIGRATIONS.find((m) => m.version === "0018_agency_internal")?.sql ?? ""

  it("creates the six tables the four modules own", () => {
    for (const table of [
      "marketing_posts",
      "brand_assets",
      "programs",
      "meeting_purposes",
      "staff_profiles",
      "staff_certificates",
    ])
      expect(sql, `${table} must be created`).toContain(`CREATE TABLE ${table} (`)
  })

  it("gives every one of them the deactivate-not-delete column, and no DELETE", () => {
    // ARCHITECTURE §4: the row is retired, never removed. Six tables, six audit
    // blocks — a table that shipped without one would be the only place in the
    // app where history can be destroyed.
    expect((sql.match(/deactivated_at TEXT/g) ?? []).length).toBe(6)
    expect(sql, "there is no delete in this model").not.toMatch(/\bDELETE\b/)
  })

  it("holds ONE live profile per person, in the database rather than in a handler", () => {
    // CONCURRENCY rule 2: two tabs saving a colleague's profile at the same
    // instant must settle into one row, not two. A read-then-write in the
    // handler cannot promise that; a partial unique index can.
    expect(sql).toContain("CREATE UNIQUE INDEX idx_staff_profiles_user")
    expect(sql, "partial, so a retired profile can be replaced").toContain(
      "ON staff_profiles (user_id) WHERE deactivated_at IS NULL"
    )
  })

  it("hands the four new modules to the locked Admin role and to nobody else", () => {
    // Same shape as 0007 and 0013, for the same reason: a migration must never
    // hand out sight of the agency's own material that nobody granted. The
    // rights come from `r.is_default`, which is 1 for the locked Admin role and
    // 0 for every role somebody built by hand.
    const backfill = sql.slice(sql.indexOf("INSERT INTO role_permissions"))
    for (const m of ["marketing", "brand_assets", "delivery", "staff_profiles"])
      expect(backfill, `${m} must reach existing teams`).toContain(`'${m}'`)
    expect(backfill, "every other role must gain nothing").toContain("r.is_default")
    expect(backfill, "and it must not re-grant what a team already has").toContain("WHERE NOT EXISTS")
  })

  it("carries NO account column — there is nothing here for a fence to fence", () => {
    // The structural half of the promise the doors make in words. Every table in
    // the process-map build carries `account_id` because its rows belong to a
    // customer; not one of these does, because they belong to the agency. A
    // column that isn't there cannot be joined to an account-fenced read by
    // somebody who assumed it meant the same thing here.
    const tables = sql.slice(sql.indexOf("CREATE TABLE marketing_posts"), sql.indexOf("INSERT INTO role_permissions"))
    expect(tables, "an agency-internal table with an account column is a category error").not.toContain(
      "account_id"
    )
  })
})
