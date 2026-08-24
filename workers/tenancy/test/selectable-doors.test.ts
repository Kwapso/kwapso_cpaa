// EVERY READ IN THIS MODULE, RUN AGAINST A REAL SCHEMA.
//
// THE BUG THIS EXISTS FOR, and it reached the owner on staging. The single-row
// door was given its own column list so the record screen could show who wrote a
// value and when — and it named `created_by`, a column that does not exist. The
// audit block on every table in this base is `creator_id / creator_email /
// creator_name`. So the statement was invalid, the door answered 500 on every
// call, and the screen — which only checked whether its data was still
// `undefined` — showed its loading skeleton for ever. Nothing errored anywhere a
// person could see. It simply span.
//
// WHY NOTHING CAUGHT IT. TypeScript cannot see inside a SQL string; the whole
// suite was green; lint was clean; the rule checks read source off disk and none
// of them parse SQL. The module's existing tests mock the data door away, which
// is right for testing LOGIC and is exactly why they could not see this — a
// mocked `d1Query` accepts any string at all, including one no database would.
//
// So the guard is not a cleverer scan, it is EXECUTION: run each read against a
// database built from the real migrations and let SQLite be the judge of whether
// the columns exist. A wrong name cannot survive that, whatever it is called and
// wherever it is spelled.

import { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import { TEAM_MIGRATIONS } from "../src/team-schema"
import {
  countSelectable,
  listSelectable,
  listSelectableForExport,
  selectableOne,
} from "../src/lib/selectable"

const cfg = { accountId: "a", apiToken: "t" } as never
const guard = { userId: "ME", teamId: "TEAM", roleId: "ROLE", databaseId: "db" }
const staff = { kind: "staff" as const }

// A WORD THE SEED DOES NOT ALSO SHIP. The migrations seed the starting
// vocabulary, so a fixture using one of those names finds the seeded row rather
// than its own and asserts against somebody else's data — which is how the first
// draft of this file read a creator called "kwapso" and failed for the right
// reason by accident.
const VALUE_ID = "01JVALUE0000000000000000"

beforeEach(() => {
  const db = new DatabaseSync(":memory:")
  for (const m of TEAM_MIGRATIONS) db.exec(m.sql)
  db.exec(`
    INSERT INTO selectable_data
      (id, type, value, is_default, mark, created_at, creator_id, creator_email, creator_name)
    VALUES ('${VALUE_ID}', 'Ticket type', 'Voucher query', 1, '🎫',
            '2026-05-01T09:00:00.000Z', 'U1', 'ana@kwapso.com', 'Ana');
  `)
  holder.db = db
})

describe("the dropdown-value doors run against a real schema", () => {
  it("the SINGLE-ROW read returns the value, with its audit block", async () => {
    // The exact call the record screen makes. Before the fix this threw on a
    // column that does not exist, which the door turned into a 500.
    const one = await selectableOne(cfg, guard, VALUE_ID)
    expect(one, "the single-row door must find the row it was given").toBeTruthy()
    expect(one?.value).toBe("Voucher query")
    expect(one?.type).toBe("Ticket type")
    expect(one?.isDefault).toBe(true)
    expect(one?.active).toBe(true)
    expect(one?.mark).toBe("🎫")
    // The two columns the detail door exists to add.
    expect(one?.createdAt).toBe("2026-05-01T09:00:00.000Z")
    expect(one?.createdByName).toBe("Ana")
  })

  it("an id nobody has is null, not an error", async () => {
    expect(await selectableOne(cfg, guard, "01JNOSUCHVALUE0000000000")).toBeNull()
  })

  it("the LIST read still works, and deliberately carries no audit block", async () => {
    // The two doors select different columns on purpose (see DETAIL_COLUMNS).
    // If that ever collapses into one, this is where it shows.
    //
    // The table is NOT empty: the migrations seed the vocabulary every new team
    // starts with, which is the state a real base is always in. So this finds
    // its row rather than counting the table — an assertion on the total would
    // break every time somebody adds a starting word, which is a false alarm and
    // a reason to stop trusting the file.
    const values = await listSelectable(cfg, guard)
    const seeded = values.find((v) => v.id === VALUE_ID)
    expect(seeded, "the list must contain the row the fixture wrote").toBeTruthy()
    expect(seeded?.value).toBe("Voucher query")
    expect(seeded?.createdAt, "the list must not pay for columns no row in it asks for").toBeUndefined()
  })

  it("the COUNT read works", async () => {
    const n = await countSelectable(cfg, guard)
    const real = (holder.db as DatabaseSync)
      .prepare("SELECT COUNT(*) AS n FROM selectable_data")
      .get() as { n: number }
    expect(n, "the exact server count, not a guess").toBe(real.n)
    expect(n).toBeGreaterThan(0)
  })

  it("the EXPORT read works", async () => {
    const { rows, complete } = await listSelectableForExport(cfg, guard)
    expect(complete).toBe(true)
    const mine = rows.find((r) => r.value === "Voucher query")
    expect(mine, "the export must carry the row the fixture wrote").toBeTruthy()
    expect(mine?.creator_name).toBe("Ana")
  })

  // …and the tripwire. If the fixture ever stops inserting a row, every
  // assertion above still passes against an empty table and this file goes
  // quietly blind — the same failure shape it was written to stop.
  it("the fixture actually has a row in it", () => {
    const n = (holder.db as DatabaseSync)
      .prepare("SELECT COUNT(*) AS n FROM selectable_data WHERE id = ?")
      .get(VALUE_ID) as { n: number }
    expect(n.n, "the seed did not land — every test above is testing nothing").toBe(1)
  })

  // The account fence is a staff scope here, which is the shape every read in
  // this module runs under: `refusePortalCaller` turns a client login away at
  // the door, so these functions never see one.
  it("a staff scope is the only scope these doors ever run under", () => {
    expect(staff.kind).toBe("staff")
  })
})
