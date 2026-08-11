// A SEARCH BOX IS NOT A PATTERN BOX.
//
// Binding a needle as a parameter stops it becoming SQL. It does NOT stop it
// becoming a LIKE PATTERN, and those are two different escapes — the accounts
// search wrapped the caller's text in `%…%` and handed it straight to LIKE.
//
// Two things follow, and both are here. A person searching for the literal
// "PO_1" silently matched "PO-1" and "POx1": a filter quietly answering a
// different question, which is the defect R19 exists for wearing a wildcard. And
// SQLite compares a LIKE pattern by RECURSING at every `%`, so a needle of
// alternating `%` and letters is a handful of bytes in a query string that costs
// the worker exponential time over the whole table.
//
// Against a real SQLite database, because "does LIKE treat this as a wildcard" is
// a question only the engine can answer.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import { likeLiteral } from "@shared/workers/d1-rest"
import { listAccounts, listAccountsForExport } from "../src/lib/accounts"
import { buildSpineDb, IDS } from "./spine-harness"

const db = () => holder.db as DatabaseSync
const cfg = { accountId: "a", apiToken: "t" } as never
const guard = { userId: IDS.staffUser, teamId: IDS.team, roleId: IDS.adminRole, databaseId: "db_team" }
const staff = { kind: "staff" } as const

/** Two codes one character apart — the underscore is the whole point: one row
 * has it literally, the other has an ordinary letter in the same place. */
beforeEach(() => {
  holder.db = buildSpineDb()
  db().exec(
    `INSERT INTO accounts (id, account_type, name, code, created_at, creator_id) VALUES
       ('A_UNDER', 'entity', 'Underscore Ltd', 'PO_1', '2026-01-01', '${IDS.staffUser}'),
       ('A_DECOY', 'entity', 'Decoy Ltd', 'POx1', '2026-01-01', '${IDS.staffUser}');`
  )
})

describe("the accounts search matches what was typed", () => {
  it("an underscore is a character, not 'any character'", async () => {
    const page = await listAccounts(cfg, guard, staff, { q: "PO_1" })
    expect(page.rows.map((r) => r.id)).toEqual(["A_UNDER"])
    // The exact total rides the SAME where clause (R16), so it must agree.
    expect(page.total).toBe(1)
  })

  it("a percent sign is a character too — it does not select the whole book", async () => {
    const page = await listAccounts(cfg, guard, staff, { q: "%" })
    expect(page.rows, "searching for a literal % finds rows containing one").toEqual([])
    expect(page.total).toBe(0)
  })

  it("a backslash is a character as well — the escape does not escape the escapes", async () => {
    db().exec(
      `INSERT INTO accounts (id, account_type, name, code, created_at, creator_id)
       VALUES ('A_SLASH', 'entity', 'Back\\slash Ltd', 'BS1', '2026-01-01', '${IDS.staffUser}');`
    )
    const page = await listAccounts(cfg, guard, staff, { q: "\\" })
    expect(page.rows.map((r) => r.id)).toEqual(["A_SLASH"])
  })

  it("ordinary text still searches — escaping is not refusing", async () => {
    const page = await listAccounts(cfg, guard, staff, { q: "Decoy" })
    expect(page.rows.map((r) => r.id)).toEqual(["A_DECOY"])
  })

  it("the EXPORT narrows by the same sentence — one filter, two doors", async () => {
    // The list and the CSV are built from one `accountsWhere` on purpose, so a
    // fix applied to one and not the other is impossible by construction. Proved,
    // not assumed: two answers to the same question is how they drift.
    const { rows } = await listAccountsForExport(cfg, guard, staff, { q: "PO_1" })
    expect(rows.map((r) => r.id)).toEqual(["A_UNDER"])
  })
})

describe("likeLiteral, the seam behind it", () => {
  it("escapes the backslash FIRST, then the two wildcards", () => {
    expect(likeLiteral("100%")).toBe("100\\%")
    expect(likeLiteral("a_b")).toBe("a\\_b")
    // If `\` were escaped last, this would come back as `\\%` — a literal
    // backslash followed by a live wildcard.
    expect(likeLiteral("\\%")).toBe("\\\\\\%")
  })

  it("leaves ordinary text alone", () => {
    expect(likeLiteral("Bergman S.A.")).toBe("Bergman S.A.")
  })
})
