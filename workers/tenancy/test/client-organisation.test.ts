// THE CLIENT'S OWN ORGANISATION — and the one part of migration 0052 that can
// silently do nothing.
//
// A process map has always carried WHO does the work as a single free-typed word
// on the whole map (`processes.role_name`). Round two of the audit-module
// questions turned that word into a record, because a role has to carry an
// hourly cost before a saving can be money rather than only hours — and the
// owner ruled on 24 Aug 2026 that the words already typed become records rather
// than being thrown away.
//
// THAT CARRY-OVER IS WHERE THE RISK IS. Everything else in 0052 is CREATE TABLE,
// which fails loudly if it is wrong. A backfill that matches nothing succeeds
// just as quietly as one that matches everything: the migration applies, the
// build is green, and every map simply has no role — which nobody would notice
// until somebody opened one and asked where the name had gone.
//
// So these run the REAL migrations into SQLite, seed the shapes a real base
// actually holds, and read the rows back out.

import { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it } from "vitest"

import { TEAM_MIGRATIONS } from "../src/team-schema"

/** Every migration UP TO but not including the one under test, so a base can be
 * seeded in the state 0052 will actually meet. */
function dbBefore(version: string): DatabaseSync {
  const db = new DatabaseSync(":memory:")
  for (const m of TEAM_MIGRATIONS) {
    if (m.version === version) break
    db.exec(m.sql)
  }
  return db
}

function apply(db: DatabaseSync, version: string): void {
  const m = TEAM_MIGRATIONS.find((x) => x.version === version)
  expect(m, `${version} is not in TEAM_MIGRATIONS — did it get renamed?`).toBeTruthy()
  db.exec((m as { sql: string }).sql)
}

const V = "0052_the_client_organisation"

let db: DatabaseSync

/** A client, a system of theirs, and a map with a typed role on it. */
function seedMap(opts: { account: string; role: string | null; process: string }): void {
  db.exec(`
    INSERT OR IGNORE INTO accounts (id, account_type, name, created_at)
      VALUES ('${opts.account}', 'entity', '${opts.account}', '2026-01-01T00:00:00.000Z');
    INSERT OR IGNORE INTO apps (id, account_id, name, created_at)
      VALUES ('APP_${opts.account}', '${opts.account}', 'Their system', '2026-01-01T00:00:00.000Z');
    INSERT INTO processes (id, app_id, account_id, name, role_name, created_at)
      VALUES ('${opts.process}', 'APP_${opts.account}', '${opts.account}', 'Returns',
              ${opts.role === null ? "NULL" : `'${opts.role}'`}, '2026-01-01T00:00:00.000Z');
  `)
}

const roles = () =>
  db.prepare("SELECT account_id, name, cents_per_hour FROM client_roles ORDER BY name").all() as {
    account_id: string
    name: string
    cents_per_hour: number | null
  }[]

const roleOf = (processId: string) =>
  (
    db.prepare("SELECT role_id FROM processes WHERE id = ?").get(processId) as {
      role_id: string | null
    }
  ).role_id

beforeEach(() => {
  db = dbBefore(V)
})

describe("0052 — every role somebody already typed becomes a record", () => {
  it("carries the word over, and points the map at the record", () => {
    seedMap({ account: "BERG", role: "Dispatch clerk", process: "P1" })
    apply(db, V)

    expect(roles()).toEqual([{ account_id: "BERG", name: "Dispatch clerk", cents_per_hour: null }])
    expect(roleOf("P1"), "the map must point at the record it was carried into").toBeTruthy()
  })

  it("the cost is UNKNOWN, not zero — the difference the saving depends on", () => {
    seedMap({ account: "BERG", role: "Dispatch clerk", process: "P1" })
    apply(db, V)
    // A zero here would read as "this person is free", and the saving would come
    // out as EUR 0 with no sign that anything was missing.
    expect(roles()[0].cents_per_hour).toBeNull()
  })

  it("the same word on two maps is ONE role, not two", () => {
    seedMap({ account: "BERG", role: "Dispatch clerk", process: "P1" })
    seedMap({ account: "BERG", role: "Dispatch clerk", process: "P2" })
    apply(db, V)

    expect(roles()).toHaveLength(1)
    expect(roleOf("P1")).toBe(roleOf("P2"))
  })

  it("surrounding space does not make a second role", () => {
    seedMap({ account: "BERG", role: "Dispatch clerk", process: "P1" })
    seedMap({ account: "BERG", role: "  Dispatch clerk  ", process: "P2" })
    apply(db, V)

    expect(roles(), "the words are the same word — a stray space is not a role").toHaveLength(1)
    expect(roleOf("P2")).toBe(roleOf("P1"))
  })

  it("the same word for TWO clients is two roles — a role belongs to one of them", () => {
    seedMap({ account: "BERG", role: "Dispatch clerk", process: "P1" })
    seedMap({ account: "KENO", role: "Dispatch clerk", process: "P2" })
    apply(db, V)

    expect(roles().map((r) => r.account_id).sort()).toEqual(["BERG", "KENO"])
    expect(roleOf("P1")).not.toBe(roleOf("P2"))
  })

  it("a map with no role, and one with an empty one, make no record and point nowhere", () => {
    seedMap({ account: "BERG", role: null, process: "P1" })
    seedMap({ account: "BERG", role: "   ", process: "P2" })
    apply(db, V)

    expect(roles(), "blank is not a role").toEqual([])
    expect(roleOf("P1")).toBeNull()
    expect(roleOf("P2")).toBeNull()
  })

  it("a map with no client keeps its word and gains no role — nobody owns one", () => {
    db.exec(`
      INSERT INTO apps (id, name, created_at) VALUES ('APP_OURS', 'Our own thing', '2026-01-01T00:00:00.000Z');
      INSERT INTO processes (id, app_id, account_id, name, role_name, created_at)
        VALUES ('P_OURS', 'APP_OURS', NULL, 'Our onboarding', 'Delivery lead', '2026-01-01T00:00:00.000Z');
    `)
    apply(db, V)

    expect(roles(), "a role belongs to a client; a map with none has nobody to own one").toEqual([])
    expect(roleOf("P_OURS")).toBeNull()
    // …and the word is still there, so nothing was lost by not carrying it.
    const kept = db.prepare("SELECT role_name FROM processes WHERE id = 'P_OURS'").get() as {
      role_name: string
    }
    expect(kept.role_name).toBe("Delivery lead")
  })

  it("runs clean on a base that has no maps at all", () => {
    // A newborn team, and the shape every fresh environment is in.
    expect(() => apply(db, V)).not.toThrow()
    expect(roles()).toEqual([])
  })
})

describe("0052 — the shapes the module hangs off", () => {
  beforeEach(() => apply(db, V))

  it("a role can sit in several departments, and a department hold several roles", () => {
    db.exec(`
      INSERT INTO accounts (id, account_type, name, created_at) VALUES ('BERG','entity','Bergman','2026-01-01T00:00:00.000Z');
      INSERT INTO client_departments (id, account_id, name, created_at) VALUES ('D1','BERG','Operations','2026-01-01T00:00:00.000Z');
      INSERT INTO client_departments (id, account_id, name, created_at) VALUES ('D2','BERG','Finance','2026-01-01T00:00:00.000Z');
      INSERT INTO client_roles (id, account_id, name, created_at) VALUES ('R1','BERG','Office manager','2026-01-01T00:00:00.000Z');
      INSERT INTO client_role_departments (id, role_id, department_id, created_at) VALUES ('X1','R1','D1','2026-01-01T00:00:00.000Z');
      INSERT INTO client_role_departments (id, role_id, department_id, created_at) VALUES ('X2','R1','D2','2026-01-01T00:00:00.000Z');
    `)
    const n = db.prepare("SELECT COUNT(*) AS n FROM client_role_departments WHERE role_id = 'R1'").get() as {
      n: number
    }
    expect(n.n, "a smaller company runs one role across two departments").toBe(2)
    // …and the same pair twice is refused, so a double submit cannot double it.
    expect(() =>
      db.exec(
        "INSERT INTO client_role_departments (id, role_id, department_id, created_at) VALUES ('X3','R1','D1','2026-01-01T00:00:00.000Z')"
      )
    ).toThrow()
  })

  it("a person on a role is a CONTACT you already have, not a new person record", () => {
    // The whole reason there is no people table: a second address book is one
    // that goes out of step with the first.
    const cols = db.prepare("PRAGMA table_info(client_role_people)").all() as { name: string }[]
    expect(cols.map((c) => c.name)).toContain("person_account_id")
    expect(
      TEAM_MIGRATIONS.map((m) => m.sql).join("\n"),
      "there must be no separate person table for the audit module"
    ).not.toMatch(/CREATE TABLE client_people\b/)
  })

  it("a tool's price is dated, so a map set to March does not read today's price", () => {
    db.exec(`
      INSERT INTO accounts (id, account_type, name, created_at) VALUES ('KENO','entity','Keno','2026-01-01T00:00:00.000Z');
      INSERT INTO client_tools (id, account_id, name, created_at) VALUES ('T1','KENO','HubSpot','2026-01-01T00:00:00.000Z');
      INSERT INTO client_tool_prices (id, tool_id, cents, billing_period, effective_on, created_at)
        VALUES ('PR1','T1',24000,'month','2026-01-01','2026-01-01T00:00:00.000Z');
      INSERT INTO client_tool_prices (id, tool_id, cents, billing_period, effective_on, created_at)
        VALUES ('PR2','T1',30000,'month','2026-06-01','2026-06-01T00:00:00.000Z');
    `)
    const asOf = (day: string) =>
      (
        db
          .prepare(
            "SELECT cents FROM client_tool_prices WHERE tool_id = 'T1' AND effective_on <= ? ORDER BY effective_on DESC LIMIT 1"
          )
          .get(day) as { cents: number }
      ).cents
    expect(asOf("2026-03-01"), "March pays March's price").toBe(24000)
    expect(asOf("2026-08-01"), "…and today pays today's").toBe(30000)
    // The tool row itself must carry no price, or the two can disagree.
    const toolCols = (db.prepare("PRAGMA table_info(client_tools)").all() as { name: string }[]).map(
      (c) => c.name
    )
    expect(toolCols).not.toContain("cents")
    expect(toolCols).not.toContain("cents_per_period")
  })

  it("a role's cost may be unknown but never negative", () => {
    db.exec(
      "INSERT INTO accounts (id, account_type, name, created_at) VALUES ('BERG','entity','Bergman','2026-01-01T00:00:00.000Z')"
    )
    expect(() =>
      db.exec(
        "INSERT INTO client_roles (id, account_id, name, cents_per_hour, created_at) VALUES ('R9','BERG','Ghost',-1,'2026-01-01T00:00:00.000Z')"
      )
    ).toThrow()
  })
})
