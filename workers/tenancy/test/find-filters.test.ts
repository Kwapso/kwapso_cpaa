// THE FILTERED COUNT — "filter by type, and the count doesn't change".
//
// That sentence, from a manager on staging, is two defects standing on each
// other. The screen's filters were the library frame's, so they narrowed the
// fifty rows the browser had loaded; and the count above them was the door's
// exact COUNT(*) over the whole collection, which is correct and which therefore
// never moved. Both numbers true, neither about the question being asked.
//
// The filters are the DOOR's now, and this proves the half a source scan cannot
// see: that narrowing an accounts read narrows its `total` by exactly the same
// sentence. Against a real SQLite database running the real team migrations,
// because "do the rows and the count agree" is a question only the engine can
// answer — the two clauses are built once (`accountsWhere`) precisely so they
// cannot drift, and a test that trusted that would be testing the comment.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import { listAccounts, listAccountsForExport } from "../src/lib/accounts"
import { buildSpineDb, IDS } from "./spine-harness"

const db = () => holder.db as DatabaseSync
const cfg = { accountId: "a", apiToken: "t" } as never
const guard = { userId: IDS.staffUser, teamId: IDS.team, roleId: IDS.adminRole, databaseId: "db_team" }
const staff = { kind: "staff" } as const

/** Four accounts: two companies and two people, one of each archived, and two
 * different words for where they stand. Small enough to reason about by hand,
 * varied enough that every filter below has something to leave out. */
beforeEach(() => {
  holder.db = buildSpineDb()
  db().exec(
    `INSERT INTO accounts (id, account_type, name, code, status, deactivated_at, created_at, creator_id) VALUES
       ('A_LIVE_CO',   'entity',     'Confia Group',  'C1', 'client',      NULL,         '2026-01-01', '${IDS.staffUser}'),
       ('A_GONE_CO',   'entity',     'Bergman S.A.',  'B1', 'past_client', '2026-02-02', '2026-01-02', '${IDS.staffUser}'),
       ('A_LIVE_ONE',  'individual', 'Ana Confia',    'P1', 'client',      NULL,         '2026-01-03', '${IDS.staffUser}'),
       ('A_GONE_ONE',  'individual', 'Piet Bergman',  'P2', 'past_client', '2026-02-03', '2026-01-04', '${IDS.staffUser}');`
  )
})

/** What the door answered: its rows, with the one assertion this file exists for
 * — the number beside them counts the SAME question. (One page: the harness's
 * whole book is far inside PAGE_SIZE, so `total` and the rows are comparable.) */
async function findAccounts(filters: Parameters<typeof listAccounts>[4]): Promise<string[]> {
  const page = await listAccounts(cfg, guard, staff, SEES_PEOPLE, filters)
  expect(page.total, "the exact total must count the rows the door just filtered").toBe(page.rows.length)
  return page.rows.map((r) => r.id).sort()
}

/** A caller holding `contacts:read` — the whole book, companies and people. The
 * narrowing this parameter exists for has its own cases in accounts.test.ts;
 * here it is held constant so a FILTER's arithmetic is what is being measured. */
const SEES_PEOPLE = { mayListPeople: true }

/** The same question asked of the database directly, in SQL this file wrote. The
 * door builds its own; comparing the two is what makes this a test rather than a
 * reading of the implementation back to itself. (The harness seeds a customer
 * spine of its own — it exists to prove fences, so it has somebody to keep out —
 * and those rows are deliberately left in: a filter that is only correct on a
 * book of four is not correct.) */
function inTheDatabase(where: string): string[] {
  return (db().prepare(`SELECT id FROM accounts WHERE ${where}`).all() as { id: string }[])
    .map((r) => r.id)
    .sort()
}

describe("an accounts filter narrows the rows AND the count", () => {
  it("unfiltered, it is the whole book — archived rows included", async () => {
    const all = await findAccounts({})
    expect(all).toEqual(inTheDatabase("1 = 1"))
    expect(all, "deactivate-never-delete: a put-away account is still listable").toContain("A_GONE_CO")
  })

  it("type: companies only, and the count moves with it", async () => {
    const companies = await findAccounts({ type: "entity" })
    expect(companies).toEqual(inTheDatabase("account_type = 'entity'"))
    expect(companies).toContain("A_LIVE_CO")
    expect(companies).not.toContain("A_LIVE_ONE")
  })

  it("archived: either pile on its own", async () => {
    expect(await findAccounts({ archived: "yes" })).toEqual(inTheDatabase("deactivated_at IS NOT NULL"))
    expect(await findAccounts({ archived: "no" })).toEqual(inTheDatabase("deactivated_at IS NULL"))
  })

  it("they compose — a search AND two filters is still one question", async () => {
    // "Confia" matches a company and a person; the type narrows it to the person,
    // and both of them are live.
    expect(await findAccounts({ q: "Confia", type: "individual", archived: "no" })).toEqual(["A_LIVE_ONE"])
  })

  it("a filter that matches nothing says nothing — not everything", async () => {
    expect(await findAccounts({ parentId: "no_such_account" })).toEqual([])
  })

  it("the EXPORT narrows by the same sentence — one filter, two doors", async () => {
    // The list and the CSV are built from one `accountsWhere`, so "export what
    // I'm looking at" cannot mean something else. Proved on `archived`, as
    // search-literal.test.ts proves it for `q`. It used to be proved on `status`,
    // which 0042 retired — the sentence this test makes is about the SEAM, so it
    // holds on whichever filter is asked through it.
    const { rows } = await listAccountsForExport(cfg, guard, staff, SEES_PEOPLE, { archived: "yes" })
    expect(rows.map((r) => r.id).sort()).toEqual(inTheDatabase("deactivated_at IS NOT NULL"))
  })
})
