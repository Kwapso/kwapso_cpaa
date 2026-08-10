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
  countAccountLinks,
  createAccount,
  getAccount,
  grantPortalAccess,
  linkPerson,
  listAccounts,
  setAccountActive,
  setAccountParent,
  setLinkActive,
  setPortalAccessActive,
  switchPortalAccount,
} from "../src/lib/accounts"
import worker from "../src/index"
import { buildSpineDb, IDS, makeEnv, req } from "./spine-harness"

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
    expect(n.n).toBe(3) // the two she starts with, plus the one just added
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

describe("what the detail's tabs badge (R16)", () => {
  it("counts contacts and logins on the SERVER, not from the capped lists", async () => {
    const detail = await getAccount(cfg, guard, staff, IDS.victimAccount)
    expect(detail.linksTotal).toBe(1)
    expect(detail.portalUsersTotal).toBe(0) // Marta's login sits on HER row, not the company's
    expect(await countAccountLinks(cfg, guard, staff, IDS.victimPerson)).toBe(0)

    // A second contact moves the count — and it is a COUNT, never links.length
    // (which a hard-capped list would silently cap).
    const ana = await createAccount(cfg, guard, staff, actor, { accountType: "individual", name: "Ana" })
    await linkPerson(cfg, guard, staff, actor, {
      accountId: IDS.victimAccount,
      personAccountId: ana,
    })
    expect((await getAccount(cfg, guard, staff, IDS.victimAccount)).linksTotal).toBe(2)
  })

  it("a pinned caller's counts see only their own world", async () => {
    const scope = await accountScope(cfg, { ...guard, userId: IDS.burglarUser })
    expect(await countAccountLinks(cfg, guard, scope, IDS.victimAccount)).toBe(0)
  })
})

describe("a contact / login change names the ACCOUNT it hangs off", () => {
  it("hands back the account when a row moved, and null when none did (R17)", async () => {
    expect(await setLinkActive(cfg, guard, staff, actor, IDS.victimLink, false)).toBe(IDS.victimAccount)
    // Second click: already unlinked → zero rows moved → nothing to publish.
    expect(await setLinkActive(cfg, guard, staff, actor, IDS.victimLink, false)).toBeNull()

    expect(await setPortalAccessActive(cfg, guard, staff, actor, IDS.victimPortal, false)).toBe(
      IDS.victimPerson
    )
    expect(await setPortalAccessActive(cfg, guard, staff, actor, IDS.victimPortal, false)).toBeNull()

    // …and the history says what happened, not how many times it was clicked.
    const history = db()
      .prepare("SELECT COUNT(*) n FROM activity WHERE type = 'Portal access revoked'")
      .get() as { n: number }
    expect(history.n).toBe(1)
  })
})

describe("granting a login: the person is picked off the account, never typed in", () => {
  const grant = async (body: unknown) => {
    const res = await worker.fetch(
      req("POST /api/tenancy/portal-users", body),
      makeEnv(() => db(), IDS.staffUser)
    )
    return { status: res.status, text: await res.text() }
  }

  it("resolves the person's OWN email to their platform account", async () => {
    const ana = await createAccount(cfg, guard, staff, actor, {
      accountType: "individual",
      name: "Ana",
      email: "nadia@bergman.example", // a CLIENT: a platform account, not a team member
    })
    await linkPerson(cfg, guard, staff, actor, { accountId: IDS.victimAccount, personAccountId: ana })

    const { status } = await grant({ accountId: IDS.victimAccount, personAccountId: ana })
    expect(status).toBe(200)
    const row = db()
      .prepare("SELECT user_id FROM portal_users WHERE account_id = ? AND deactivated_at IS NULL")
      .get(IDS.victimAccount) as { user_id: string }
    expect(row.user_id).toBe(IDS.clientUser)
  })

  it("refuses plainly when the person has no email, or has never signed in", async () => {
    const noEmail = await createAccount(cfg, guard, staff, actor, {
      accountType: "individual",
      name: "Nadia",
    })
    const blank = await grant({ accountId: IDS.victimAccount, personAccountId: noEmail })
    expect(blank.status).toBe(400)
    expect(blank.text).toContain("Add an email address to Nadia")

    const stranger = await createAccount(cfg, guard, staff, actor, {
      accountType: "individual",
      name: "Iker",
      email: "iker@nowhere.example",
    })
    const missing = await grant({ accountId: IDS.victimAccount, personAccountId: stranger })
    expect(missing.status).toBe(404)
    expect(missing.text).toContain("hasn't signed in here yet")
  })

  it("still cannot name a person outside the fence", async () => {
    // The resolution reads the person's email through the SAME fence, so a pinned
    // caller can't turn it into a lookup of somebody else's contact.
    const res = await worker.fetch(
      req("POST /api/tenancy/portal-users", {
        accountId: IDS.burglarAccount,
        personAccountId: IDS.victimPerson,
      }),
      makeEnv(() => db(), IDS.burglarUser)
    )
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(await res.text()).not.toContain(IDS.victimPerson)
  })
})

describe("the paged list (R14/R16)", () => {
  it("returns an exact total and an opaque cursor that reaches page two", async () => {
    for (let i = 0; i < 60; i++)
      await createAccount(cfg, guard, staff, actor, { accountType: "individual", name: `Person ${i}` })

    const first = await listAccounts(cfg, guard, staff)
    expect(first.rows).toHaveLength(50)
    expect(first.total).toBe(68) // 8 seeded + 60 — the exact COUNT, not the page length
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

// The owner's two rules for the client side (10 Aug 2026), each written as the
// example he gave rather than as an abstraction — a test that reads like the
// decision is a test someone can still check against the decision next year.
describe("standing in ONE company at a time", () => {
  const portalScope = (userId: string) => accountScope(cfg, { ...guard, userId })
  // The switch writes the CALLER's own pointer (`user_id` off the guard), so the
  // guard and the scope must belong to the same person — as they always do on
  // the route, where both come from the one session.
  const asVictim = { ...guard, userId: IDS.victimUser }

  it("a contact who hangs under a company sees that company's world", async () => {
    // Company A with A1/A2/A3 beneath it: whoever logs in as one of the children
    // is a person INSIDE that company, and they see what the company sees.
    const scope = await portalScope(IDS.contactUser)
    expect(scope.kind).toBe("portal")
    if (scope.kind !== "portal") return
    expect(scope.currentAccountId).toBe(IDS.victimAccount)
    expect(scope.accountIds).toContain(IDS.victimAccount) // the company itself
    expect(scope.accountIds).toContain(IDS.victimChild) // and everything under it
    expect(scope.accountIds).toContain(IDS.victimContact) // and their own row
  })

  it("…but never climbs past the company they belong to", async () => {
    // Put Bergman under a holding group. The contact belongs to Bergman, not to
    // the group — inheriting upward would hand them the whole family.
    const holding = await createAccount(cfg, guard, staff, actor, {
      accountType: "entity",
      name: "Bergman Holding",
    })
    await setAccountParent(cfg, guard, staff, actor, IDS.victimAccount, holding)

    const scope = await portalScope(IDS.contactUser)
    if (scope.kind !== "portal") throw new Error("expected a portal caller")
    expect(scope.accountIds).not.toContain(holding)
  })

  it("a person on two companies sees ONE of them, not both at once", async () => {
    const scope = await portalScope(IDS.victimUser)
    if (scope.kind !== "portal") throw new Error("expected a portal caller")
    // Both are offered by the switcher…
    expect(scope.roots).toEqual([IDS.victimAccount, IDS.victimSecond])
    // …but only the one they stand in is inside the fence.
    expect(scope.accountIds).toContain(IDS.victimAccount)
    expect(scope.accountIds).not.toContain(IDS.victimSecond)
  })

  it("switching moves the fence, and the old company goes dark", async () => {
    const before = await portalScope(IDS.victimUser)
    if (before.kind !== "portal") throw new Error("expected a portal caller")
    const moved = await switchPortalAccount(cfg, asVictim, before, IDS.victimSecond)
    expect(moved).toBe(true)

    const after = await portalScope(IDS.victimUser)
    if (after.kind !== "portal") throw new Error("expected a portal caller")
    expect(after.currentAccountId).toBe(IDS.victimSecond)
    expect(after.accountIds).toContain(IDS.victimSecond)
    expect(after.accountIds).not.toContain(IDS.victimAccount)
    expect(after.accountIds).not.toContain(IDS.victimChild)
  })

  it("standing where you already stand changes nothing (R17)", async () => {
    const scope = await portalScope(IDS.victimUser)
    if (scope.kind !== "portal") throw new Error("expected a portal caller")
    await switchPortalAccount(cfg, asVictim, scope, IDS.victimSecond)
    const again = await portalScope(IDS.victimUser)
    expect(await switchPortalAccount(cfg, asVictim, again, IDS.victimSecond)).toBe(false)
  })

  it("a switch into someone else's company is a 404, not a 403", async () => {
    const scope = await portalScope(IDS.victimUser)
    if (scope.kind !== "portal") throw new Error("expected a portal caller")
    // 403 would confirm the id exists. Outside the fence, a real company and a
    // made-up one must be the same sentence.
    await expect(switchPortalAccount(cfg, asVictim, scope, IDS.burglarAccount)).rejects.toMatchObject({
      status: 404,
    })
    await expect(switchPortalAccount(cfg, asVictim, scope, "A_NOT_A_REAL_ID")).rejects.toMatchObject({
      status: 404,
    })
  })

  it("a pointer at a company they've been unlinked from falls back, never sticks", async () => {
    const first = await portalScope(IDS.victimUser)
    if (first.kind !== "portal") throw new Error("expected a portal caller")
    await switchPortalAccount(cfg, asVictim, first, IDS.victimSecond)
    // Staff unlink them from Bergman Marine; the stale pointer must not keep working.
    await setLinkActive(cfg, guard, staff, actor, IDS.victimSecondLink, false)

    const after = await portalScope(IDS.victimUser)
    if (after.kind !== "portal") throw new Error("expected a portal caller")
    expect(after.roots).toEqual([IDS.victimAccount])
    expect(after.currentAccountId).toBe(IDS.victimAccount)
    expect(after.accountIds).not.toContain(IDS.victimSecond)
  })

  it("a revoked login stands nowhere and switches nowhere", async () => {
    const live = await portalScope(IDS.victimUser)
    if (live.kind !== "portal") throw new Error("expected a portal caller")
    await setPortalAccessActive(cfg, guard, staff, actor, IDS.victimPortal, false)

    const dead = await portalScope(IDS.victimUser)
    expect(dead.kind).toBe("portal") // still a client, never promoted to staff
    if (dead.kind !== "portal") return
    expect(dead.roots).toEqual([])
    expect(dead.currentAccountId).toBeNull()
    expect(dead.accountIds).toEqual([])
    await expect(switchPortalAccount(cfg, asVictim, dead, IDS.victimAccount)).rejects.toMatchObject({
      status: 404,
    })
  })

  it("a freelancer with no company still sees themselves", async () => {
    // Their own row IS the world (SCOPE ch.03). Without the fallback the fence
    // would resolve to nothing and lock out the person it exists to protect.
    const solo = await createAccount(cfg, guard, staff, actor, {
      accountType: "individual",
      name: "Solo Trader",
    })
    await grantPortalAccess(cfg, guard, staff, actor, { accountId: solo, userId: "U_SOLO" })
    const scope = await accountScope(cfg, { ...guard, userId: "U_SOLO" })
    if (scope.kind !== "portal") throw new Error("expected a portal caller")
    expect(scope.roots).toEqual([solo])
    expect(scope.accountIds).toEqual([solo])
  })
})
