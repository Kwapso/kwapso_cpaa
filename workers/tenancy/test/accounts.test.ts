// The customer spine's INVARIANTS, against a real SQLite database running the
// real migration. These are the rules that a second concurrent writer, a double
// click or a retried request would otherwise break — so each one is checked
// where it actually lives: in the statement, or in the index.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("../../../shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import { accountScope } from "../../../shared/workers/account-scope"
import {
  createAccount,
  grantPortalAccess,
  linkPerson,
  listAccounts,
  setAccountActive,
  setAccountParent,
} from "../src/lib/accounts"
import { buildSpineDb, IDS } from "./spine-harness"

const cfg = { accountId: "a", apiToken: "t" } as never
const actor = { id: IDS.staffUser, email: "staff@kwapso.app", name: "Staff" }
const guard = { userId: IDS.staffUser, teamId: IDS.team, roleId: IDS.adminRole, databaseId: "db_team" }
const staff = { kind: "staff" } as const

const db = () => holder.db as DatabaseSync
const parentOf = (id: string) =>
  (db().prepare("SELECT parent_account_id p FROM accounts WHERE id = ?").get(id) as { p: string | null }).p

beforeEach(() => {
  holder.db = buildSpineDb()
})

describe("the hierarchy: unlimited depth, but never a loop", () => {
  it("nests as deep as you like", async () => {
    let parent: string = IDS.victimAccount
    const chain: string[] = []
    for (let i = 0; i < 6; i++) {
      parent = await createAccount(cfg, guard, staff, actor, {
        accountType: "entity",
        name: `Level ${i}`,
        parentAccountId: parent,
      })
      chain.push(parent)
    }
    expect(parentOf(chain[5])).toBe(chain[4])
    // …and the deepest row is still inside the root's reach (the guard corridor
    // walks the whole chain, which is what makes deep nesting safe to allow).
    const scope = await accountScope(cfg, { ...guard, userId: IDS.victimUser })
    expect(scope.kind).toBe("portal")
    if (scope.kind === "portal") expect(scope.accountIds).toContain(chain[5])
  })

  it("refuses a link that would close a loop — at any depth", async () => {
    // Bergman → Workshop already exists. Putting Bergman under Workshop is a ring.
    await expect(
      setAccountParent(cfg, guard, staff, actor, IDS.victimAccount, IDS.victimChild)
    ).rejects.toMatchObject({ code: "would_loop" })
    expect(parentOf(IDS.victimAccount)).toBeNull()

    // …and a longer ring, three levels down, is refused just the same.
    const deep = await createAccount(cfg, guard, staff, actor, {
      accountType: "entity",
      name: "Deep",
      parentAccountId: IDS.victimChild,
    })
    await expect(
      setAccountParent(cfg, guard, staff, actor, IDS.victimAccount, deep)
    ).rejects.toMatchObject({ code: "would_loop" })
    expect(parentOf(IDS.victimAccount)).toBeNull()
  })

  it("refuses making an account its own parent", async () => {
    await expect(
      setAccountParent(cfg, guard, staff, actor, IDS.victimAccount, IDS.victimAccount)
    ).rejects.toMatchObject({ code: "would_loop" })
  })

  it("still allows a real move, and a move back to the top", async () => {
    await setAccountParent(cfg, guard, staff, actor, IDS.victimChild, IDS.burglarAccount)
    expect(parentOf(IDS.victimChild)).toBe(IDS.burglarAccount)
    await setAccountParent(cfg, guard, staff, actor, IDS.victimChild, null)
    expect(parentOf(IDS.victimChild)).toBeNull()
  })
})

describe("reference codes are labels, never identifiers", () => {
  it("lets two accounts have no code, but never the same one", async () => {
    await createAccount(cfg, guard, staff, actor, { accountType: "entity", name: "One", code: "BERG" })
    // The partial unique index is the race guard: the SECOND writer loses at the
    // database, not at an application check two statements earlier.
    await expect(
      createAccount(cfg, guard, staff, actor, { accountType: "entity", name: "Two", code: "BERG" })
    ).rejects.toThrow()
    // …while the many code-less rows coexist happily (that's what partial buys).
    await createAccount(cfg, guard, staff, actor, { accountType: "entity", name: "Three" })
    await createAccount(cfg, guard, staff, actor, { accountType: "entity", name: "Four" })
    const codeless = db().prepare("SELECT COUNT(*) n FROM accounts WHERE code IS NULL").get() as { n: number }
    expect(codeless.n).toBeGreaterThan(3)
  })

  it("re-coding an account changes nothing about what points at it", async () => {
    // The whole reason the code is not an identifier: its children, its links and
    // its logins all hold the ULID, so renaming the label moves no relationship.
    db().prepare("UPDATE accounts SET code = 'NEW' WHERE id = ?").run(IDS.victimAccount)
    expect(parentOf(IDS.victimChild)).toBe(IDS.victimAccount)
    const link = db().prepare("SELECT account_id a FROM account_links WHERE id = ?").get(IDS.victimLink) as {
      a: string
    }
    expect(link.a).toBe(IDS.victimAccount)
  })
})

describe("one live login per person", () => {
  it("refuses a second grant, then allows one after a revoke", async () => {
    await expect(
      grantPortalAccess(cfg, guard, staff, actor, {
        accountId: IDS.victimAccount,
        userId: IDS.victimUser,
      })
    ).rejects.toMatchObject({ code: "duplicate" })

    db().prepare("UPDATE portal_users SET deactivated_at = '2026-02-01' WHERE id = ?").run(IDS.victimPortal)
    const id = await grantPortalAccess(cfg, guard, staff, actor, {
      accountId: IDS.victimAccount,
      userId: IDS.victimUser,
    })
    expect(id).toBeTruthy()
    // The revoked row SURVIVES — that is what keeps a revoked person "portal",
    // pinned to nothing, instead of silently becoming staff.
    const rows = db().prepare("SELECT COUNT(*) n FROM portal_users WHERE user_id = ?").get(IDS.victimUser) as {
      n: number
    }
    expect(rows.n).toBe(2)
  })
})

describe("archiving is idempotent (R17)", () => {
  it("a double-clicked archive moves rows once and writes history once", async () => {
    expect(await setAccountActive(cfg, guard, staff, actor, IDS.victimAccount, false)).toBe(true)
    expect(await setAccountActive(cfg, guard, staff, actor, IDS.victimAccount, false)).toBe(false)
    const history = db()
      .prepare("SELECT COUNT(*) n FROM activity WHERE related_row_id = ? AND type = 'Account archived'")
      .get(IDS.victimAccount) as { n: number }
    expect(history.n).toBe(1)
    expect(await setAccountActive(cfg, guard, staff, actor, IDS.victimAccount, true)).toBe(true)
    expect(await setAccountActive(cfg, guard, staff, actor, IDS.victimAccount, true)).toBe(false)
  })

  it("an archived account keeps its children and its links", async () => {
    await setAccountActive(cfg, guard, staff, actor, IDS.victimAccount, false)
    expect(parentOf(IDS.victimChild)).toBe(IDS.victimAccount)
    const links = db().prepare("SELECT COUNT(*) n FROM account_links WHERE account_id = ?").get(
      IDS.victimAccount
    ) as { n: number }
    expect(links.n).toBe(1)
  })
})

describe("contacts", () => {
  it("lets one person be a contact of two companies", async () => {
    await linkPerson(cfg, guard, staff, actor, {
      accountId: IDS.burglarAccount,
      personAccountId: IDS.victimPerson,
      relationship: "Advisor",
    })
    const n = db().prepare("SELECT COUNT(*) n FROM account_links WHERE person_account_id = ?").get(
      IDS.victimPerson
    ) as { n: number }
    expect(n.n).toBe(2)
  })

  it("refuses the same person twice on the same company, and self-links", async () => {
    await expect(
      linkPerson(cfg, guard, staff, actor, {
        accountId: IDS.victimAccount,
        personAccountId: IDS.victimPerson,
      })
    ).rejects.toMatchObject({ code: "duplicate" })
    await expect(
      linkPerson(cfg, guard, staff, actor, {
        accountId: IDS.victimAccount,
        personAccountId: IDS.victimAccount,
      })
    ).rejects.toMatchObject({ code: "invalid_input" })
  })
})

describe("the paged list (R14/R16)", () => {
  it("returns an exact total and an opaque cursor that reaches page two", async () => {
    for (let i = 0; i < 60; i++)
      await createAccount(cfg, guard, staff, actor, { accountType: "individual", name: `Person ${i}` })

    const first = await listAccounts(cfg, guard, staff)
    expect(first.rows).toHaveLength(50)
    expect(first.total).toBe(65) // 5 seeded + 60 — the exact COUNT, not the page length
    expect(first.hasMore).toBe(true)
    expect(first.nextCursor).toBeTruthy()

    const second = await listAccounts(cfg, guard, staff, { cursor: first.nextCursor })
    expect(second.rows.length).toBeGreaterThan(0)
    const overlap = second.rows.filter((r) => first.rows.some((f) => f.id === r.id))
    expect(overlap, "keyset paging must not repeat a row on page two").toEqual([])
  })

  it("a pinned caller's total counts only their own world", async () => {
    const scope = await accountScope(cfg, { ...guard, userId: IDS.burglarUser })
    const page = await listAccounts(cfg, guard, scope)
    expect(page.total).toBe(2) // Delaval + Diego, and nothing of Bergman's
  })
})
