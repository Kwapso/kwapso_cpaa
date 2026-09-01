// The customer spine's INVARIANTS, against a real SQLite database running the
// real migration. These are the rules that a second concurrent writer, a double
// click or a retried request would otherwise break — so each one is checked
// where it actually lives: in the statement, or in the index.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import { accountScope } from "@shared/workers/account-scope"
import { MAX_ACCOUNT_DEPTH } from "@shared/workers/limits"
import {
  countAccountLinks,
  createAccount,
  getAccount,
  grantPortalAccess,
  linkPerson,
  listAccounts,
  listAccountsForExport,
  listPersonCompanies,
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
    expect(await setAccountParent(cfg, guard, staff, actor, IDS.victimChild, IDS.burglarAccount)).toBe(true)
    expect(parentOf(IDS.victimChild)).toBe(IDS.burglarAccount)
    expect(await setAccountParent(cfg, guard, staff, actor, IDS.victimChild, null)).toBe(true)
    expect(parentOf(IDS.victimChild)).toBeNull()
  })

  // R17 — MOVING SOMEBODY TO WHERE THEY ALREADY ARE IS NOT A MOVE. It matters on
  // this door more than on a toggle, because the contact screen's control is what
  // a person opens to CHECK who somebody works for: they look at the picker,
  // decide it was right, and press Save. A record that grows an "Aurora moved
  // Marta under Bergman S.A." line every time somebody checks is a history nobody
  // can read — and the route publishes off this same answer, so a no-op is also a
  // live ping every open screen would pay for and no reader could see the point of.
  //
  // Said twice on purpose: once for a real parent, once for the top level, because
  // `null` is the value a careless `if (parent)` guard would get wrong.
  it("moves nothing, and writes no history, when it is already there", async () => {
    const history = () =>
      (db().prepare("SELECT COUNT(*) n FROM activity WHERE type = 'Account moved'").get() as { n: number }).n

    await setAccountParent(cfg, guard, staff, actor, IDS.victimChild, IDS.burglarAccount)
    const after = history()
    // A count that is zero either side proves nothing — this asserts the history
    // is being written at all before it asserts that a repeat does not add to it.
    expect(after, "no history row for a real move — this check has gone blind").toBeGreaterThan(0)

    expect(await setAccountParent(cfg, guard, staff, actor, IDS.victimChild, IDS.burglarAccount)).toBe(false)
    expect(parentOf(IDS.victimChild)).toBe(IDS.burglarAccount)
    expect(history(), "a repeat of the same move wrote a second history row").toBe(after)

    // …and the top level, where "already there" is a null rather than an id.
    await setAccountParent(cfg, guard, staff, actor, IDS.victimChild, null)
    const atTop = history()
    expect(await setAccountParent(cfg, guard, staff, actor, IDS.victimChild, null)).toBe(false)
    expect(history(), "sending an account to the top twice wrote it down twice").toBe(atTop)
  })

  // The ring test is a RECURSIVE walk up the tree, and the tree is the one
  // self-nesting structure in the base — so it is the one place recursion depth is
  // set by data rather than by code. The walk is capped at MAX_ACCOUNT_DEPTH, and
  // the cap must fail CLOSED: past it the walk can no longer see the top, so it
  // cannot prove the move is ring-free, so it refuses.
  it("bounds the ancestor walk, and refuses rather than guesses past the ceiling", async () => {
    // A chain deeper than the ceiling, built directly (createAccount would run the
    // same guard we're testing). Row 0 is the top; each row's parent is the one above.
    const chain: string[] = [IDS.burglarAccount]
    const insert = db().prepare(
      "INSERT INTO accounts (id, account_type, parent_account_id, name, created_at, creator_id, creator_email, creator_name) VALUES (?, 'entity', ?, ?, '2026-01-01', 'u', 'e', 'n')"
    )
    for (let i = 0; i < MAX_ACCOUNT_DEPTH + 5; i++) {
      const id = `deep-${i}`
      insert.run(id, chain[chain.length - 1], `Deep ${i}`)
      chain.push(id)
    }

    // A move UNDER the bottom of that chain can't be proven safe — the walk up
    // from it runs out of depth before it reaches the top — so it is refused.
    await expect(
      setAccountParent(cfg, guard, staff, actor, IDS.victimAccount, chain[chain.length - 1])
    ).rejects.toMatchObject({ code: "would_loop" })
    expect(parentOf(IDS.victimAccount)).toBeNull()

    // …while a move that sits comfortably inside the ceiling still works, so the
    // bound refuses the unprovable case only, not every deep tree.
    await setAccountParent(cfg, guard, staff, actor, IDS.victimAccount, chain[3])
    expect(parentOf(IDS.victimAccount)).toBe(chain[3])
  })
})

describe("reference codes are labels, never identifiers", () => {
  it("lets two accounts have no code, but never the same one", async () => {
    await createAccount(cfg, guard, staff, actor, { accountType: "entity", name: "One", code: "BERG" })
    // The partial unique index is the race guard: the SECOND writer loses at the
    // database, not at an application check two statements earlier.
    //
    // WHAT IT LOSES WITH MATTERS AS MUCH AS THAT IT LOSES. This assertion used
    // to be a bare `.rejects.toThrow()`, which the raw constraint error passed —
    // a green test agreeing with a 500. A duplicate reference is a TYPO, and a
    // typo must come back as an answer (R20).
    await expect(
      createAccount(cfg, guard, staff, actor, { accountType: "entity", name: "Two", code: "BERG" })
    ).rejects.toMatchObject({ status: 409, code: "duplicate" })
    // …while the many code-less rows coexist happily (that's what partial buys).
    await createAccount(cfg, guard, staff, actor, { accountType: "entity", name: "Three" })
    await createAccount(cfg, guard, staff, actor, { accountType: "entity", name: "Four" })
    const codeless = db().prepare("SELECT COUNT(*) n FROM accounts WHERE code IS NULL").get() as { n: number }
    expect(codeless.n).toBeGreaterThan(3)
  })

  // A TYPO MUST NOT BE ABLE TO WRITE TO THE ERROR LOG.
  //
  // Nothing checked the reference before the write and nothing caught the index
  // refusing it, so a duplicate came back through the central catch as a 500 —
  // and the central catch records every 500 in the GLOBAL core error_logs table.
  // Retype the same reference, get another row. An everyday mistake, holding the
  // pen. This is checked through the ROUTE, because "the handler throws the right
  // thing" is only half the sentence: the other half is what the worker's catch
  // does with it.
  describe("a duplicate reference is an answer, not a crash", () => {
    /** The core table the central catch writes 500s into (db/core/0012). It is not
     * in the spine harness's core fixtures — it is created here because counting
     * its rows IS the assertion. */
    const withErrorLog = () => {
      db().exec(
        `CREATE TABLE IF NOT EXISTS error_logs (id TEXT PRIMARY KEY, at TEXT NOT NULL,
           source TEXT NOT NULL, place TEXT NOT NULL, message TEXT NOT NULL, stack TEXT,
           team_id TEXT, user_id TEXT, url TEXT, status TEXT NOT NULL DEFAULT 'open',
           resolved_at TEXT, resolution_note TEXT);`
      )
    }
    const errorsLogged = () =>
      (db().prepare("SELECT COUNT(*) n FROM error_logs").get() as { n: number }).n
    const post = async (path: string, body: unknown) => {
      const res = await worker.fetch(req(`POST ${path}`, body), makeEnv(() => db(), IDS.staffUser))
      return { status: res.status, body: (await res.json()) as { error?: string; message?: string } }
    }

    it("creating with a taken reference answers 409 and logs nothing", async () => {
      withErrorLog()
      expect(await post("/api/tenancy/accounts", { accountType: "entity", name: "One", code: "BERG" })).toMatchObject({ status: 200 })

      const clash = await post("/api/tenancy/accounts", { accountType: "entity", name: "Two", code: "BERG" })
      expect(clash.status, "a duplicate reference is bad input, never a 500").toBe(409)
      expect(clash.body.error).toBe("duplicate")
      expect(
        clash.body.message,
        "and it is said in the words a manager uses — never the database's"
      ).not.toMatch(/UNIQUE|constraint|SQLITE|D1/i)
      expect(clash.body.message).toMatch(/reference/i)

      // The part that made a typo worth an attacker's time: every repeat wrote a
      // row to the GLOBAL error log.
      await post("/api/tenancy/accounts", { accountType: "entity", name: "Three", code: "BERG" })
      await post("/api/tenancy/accounts", { accountType: "entity", name: "Four", code: "BERG" })
      expect(errorsLogged(), "a refusal is not a crash, so it records no crash").toBe(0)
    })

    it("editing an account onto a taken reference answers the same way", async () => {
      withErrorLog()
      await post("/api/tenancy/accounts", { accountType: "entity", name: "One", code: "BERG" })

      const clash = await post("/api/tenancy/accounts/update", {
        id: IDS.victimAccount,
        name: "Bergman S.A.",
        code: "BERG", // already worn by the row above
      })
      expect(clash.status).toBe(409)
      expect(clash.body.error).toBe("duplicate")
      expect(errorsLogged()).toBe(0)
      // …and the edit did not half-happen.
      const row = db().prepare("SELECT code FROM accounts WHERE id = ?").get(IDS.victimAccount) as {
        code: string | null
      }
      expect(row.code).toBeNull()
    })
  })

  // THE COLUMN OUTLIVED THE QUESTION.
  //
  // On 18 Aug 2026 the Type selector came off the account form: every account
  // somebody creates in the agency app is a company, and a person is made on a
  // company's Contacts tab with the word filled in by the code. `account_type`
  // stays — it is a live CHECK constraint, it decides which of the two screens
  // an account gets, and the import file and the machine surface both still say
  // it out loud. So the door has to keep meaning what it always meant, with no
  // screen left in front of it to keep the value tidy.
  describe("the door still decides what an account may be", () => {
    const post = async (path: string, body: unknown) => {
      const res = await worker.fetch(req(`POST ${path}`, body), makeEnv(() => db(), IDS.staffUser))
      return { status: res.status, text: await res.text() }
    }

    it("refuses a third kind of account as bad input, not as a crash", async () => {
      // The CHECK constraint would refuse this too, and that refusal would arrive
      // through the central catch as a 500 with a row in the global error log.
      // The door decides first, so it is a 400 in the words a manager uses.
      const nonsense = await post("/api/tenancy/accounts", { accountType: "robot", name: "HAL" })
      expect(nonsense.status, "bad input is a 400, never a 500").toBe(400)
      expect(nonsense.text).toMatch(/company or a person/i)
      expect(nonsense.text, "said in our words, never the database's").not.toMatch(
        /CHECK|constraint|SQLITE|D1/i
      )
      // Nothing was written on the way to being refused.
      const made = db().prepare("SELECT COUNT(*) n FROM accounts WHERE name = 'HAL'").get() as {
        n: number
      }
      expect(made.n).toBe(0)
    })

    it("still accepts both kinds, because two surfaces still send both", async () => {
      // The CSV import declares Type as a required column and the `create_account`
      // tool declares `accountType` as a required argument. Neither was narrowed,
      // so neither may be quietly broken here.
      expect((await post("/api/tenancy/accounts", { accountType: "entity", name: "Bergman S.A." })).status).toBe(200)
      expect((await post("/api/tenancy/accounts", { accountType: "individual", name: "Marta" })).status).toBe(200)
    })

    it("makes what the Contacts tab asks it for: a person, under the company, linked to it", async () => {
      // The two writes that tab makes, in order, through the real doors. The
      // PARENT and the LINK are different facts and the screen sets both — one
      // person can be a contact of several companies, which is what the link row
      // can say and a single pointer cannot.
      const made = await post("/api/tenancy/accounts", {
        accountType: "individual",
        name: "Marta Bergman",
        parentAccountId: IDS.victimAccount,
      })
      expect(made.status).toBe(200)
      const personId = (JSON.parse(made.text) as { id: string }).id

      const linked = await post("/api/tenancy/accounts/links", {
        accountId: IDS.victimAccount,
        personAccountId: personId,
        relationship: "Operations",
      })
      expect(linked.status).toBe(200)

      const row = db()
        .prepare("SELECT account_type t, parent_account_id p FROM accounts WHERE id = ?")
        .get(personId) as { t: string; p: string | null }
      expect(row.t, "a contact is a person").toBe("individual")
      expect(row.p, "and she sits under the company she was made on").toBe(IDS.victimAccount)

      const link = db()
        .prepare("SELECT COUNT(*) n FROM account_links WHERE account_id = ? AND person_account_id = ?")
        .get(IDS.victimAccount, personId) as { n: number }
      expect(link.n, "the parent pointer is not a contact link — both had to happen").toBe(1)
    })
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
        onAccountId: IDS.victimAccount,
        personAccountId: IDS.victimPerson,
        userId: IDS.victimUser,
      })
    ).rejects.toMatchObject({ code: "duplicate" })

    db().prepare("UPDATE portal_users SET deactivated_at = '2026-02-01' WHERE id = ?").run(IDS.victimPortal)
    const id = await grantPortalAccess(cfg, guard, staff, actor, {
      onAccountId: IDS.victimAccount,
        personAccountId: IDS.victimPerson,
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
    // CHANGED DELIBERATELY, and it is a security change. This used to look the row
    // up by the COMPANY, which pinned `portal_users.account_id` as "the account
    // they'll see". The fence reads that column as the PERSON'S OWN ROW and walks
    // UP from it to their companies — so storing a company made the walk climb to
    // that company's PARENT and then down through every sibling. It only ever
    // looked right because a top-level company has no parent to climb to.
    const row = db()
      .prepare("SELECT user_id, account_id FROM portal_users WHERE user_id = ? AND deactivated_at IS NULL")
      .get(IDS.clientUser) as { user_id: string; account_id: string }
    expect(row.user_id).toBe(IDS.clientUser)
    expect(row.account_id, "the row must hold the PERSON, never the company").toBe(ana)
  })

  it("refuses to hang a login on a company — the row is a person's", async () => {
    // THE SHAPE THAT WIDENED THE FENCE. Stored against a company, the fence's
    // walk climbs to that company's PARENT and then down through every sibling.
    // The route happens to refuse a company earlier (a company has no email to
    // resolve), but that is an accident of the lookup, not a rule — so the rule
    // is asserted where it lives, on the writer itself.
    await expect(
      grantPortalAccess(cfg, guard, staff, actor, {
        onAccountId: IDS.victimAccount,
        personAccountId: IDS.victimChild, // a COMPANY, not a person
        userId: "U_SOMEONE",
      })
    ).rejects.toMatchObject({ status: 400 })
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

  it("a client whose login was switched off can be granted a new one — enrolment on the client role is not staff", async () => {
    // THE DEAD END THE PORTAL SMOKE FOUND (25 Aug 2026). A granted client
    // ACCEPTS an invite and becomes a team member on the client role — that is
    // R21's whole model. The staff refusal read "any live membership = staff",
    // so once enrolled, a client whose login was later switched off could never
    // be granted a new one: the door answered "that person is a member of your
    // team" about the very person it had made a member. Who is a client is
    // PRESENCE of a portal_users row, live or revoked (lib/members.ts's own
    // doctrine), and the staff refusal now stands behind that presence.
    const ana = await createAccount(cfg, guard, staff, actor, {
      accountType: "individual",
      name: "Enrolled Client",
      email: "nadia@bergman.example",
    })
    await linkPerson(cfg, guard, staff, actor, { accountId: IDS.victimAccount, personAccountId: ana })
    const first = await grant({ accountId: IDS.victimAccount, personAccountId: ana })
    expect(first.status).toBe(200)
    // …AND THE GRANT IS WHAT MADE THEM A MEMBER. This used to be a hand-rolled
    // INSERT standing in for "they accept the invite", because until 26 Aug 2026
    // no product path did it: the door wrote a portal_users row and stopped, so
    // the owner granted a login, watched the tab say "Can sign in", and was told
    // at the client door that somebody needed to switch his access on. The
    // simulation was the test quietly holding up the half the product was
    // missing. The door does it now, and this is the assertion that says so.
    const enrolled = db()
      .prepare("SELECT role_id, deactivated_at FROM team_members WHERE team_id = ? AND user_id = ?")
      .get(IDS.team, IDS.clientUser) as { role_id: string; deactivated_at: string | null } | undefined
    expect(enrolled?.role_id, "granting a login must put the person on the team (R21)").toBe(IDS.clientRole)
    expect(enrolled?.deactivated_at).toBe(null)
    // …and their pointer, or the portal cannot name a team to ask.
    expect(
      (db().prepare("SELECT current_team_id c FROM users WHERE id = ?").get(IDS.clientUser) as { c: string | null }).c,
      "a client with no current team has no portal, however valid their login"
    ).toBe(IDS.team)
    // …their login is switched off, as a pause.
    db().prepare("UPDATE portal_users SET deactivated_at = '2026-08-25' WHERE user_id = ?").run(IDS.clientUser)
    // The re-grant must not be told they are staff.
    const again = await grant({ accountId: IDS.victimAccount, personAccountId: ana })
    expect(again.status, again.text).toBe(200)
    // …while a person with NO client history who IS a member still refuses.
  })

  it("a staff member with no client history is still refused, with the staff sentence", async () => {
    const colleague = await createAccount(cfg, guard, staff, actor, {
      accountType: "individual",
      name: "A Colleague",
      email: "staff2@kwapso.example",
    })
    await linkPerson(cfg, guard, staff, actor, { accountId: IDS.victimAccount, personAccountId: colleague })
    // Their email resolves to a platform user who IS a live team member…
    db()
      .prepare("INSERT INTO users (id, email, first_name) VALUES ('U_COLLEAGUE', 'staff2@kwapso.example', 'Col')")
      .run()
    db()
      .prepare(
        "INSERT INTO team_members (id, team_id, user_id, role_id, created_at) VALUES ('TM_COL', ?, 'U_COLLEAGUE', ?, '2026-08-01')"
      )
      .run(IDS.team, IDS.adminRole)
    const res = await grant({ accountId: IDS.victimAccount, personAccountId: colleague })
    expect(res.status).toBe(409)
    expect(res.text).toContain("member of your team")
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

/** A caller holding `contacts:read`. The narrowing a caller WITHOUT it gets is
 * its own describe block below. */
const SEES_PEOPLE = { mayListPeople: true }

describe("the paged list (R14/R16)", () => {
  it("returns an exact total and an opaque cursor that reaches page two", async () => {
    for (let i = 0; i < 60; i++)
      await createAccount(cfg, guard, staff, actor, { accountType: "individual", name: `Person ${i}` })

    const first = await listAccounts(cfg, guard, staff, SEES_PEOPLE)
    expect(first.rows).toHaveLength(50)
    expect(first.total).toBe(68) // 8 seeded + 60 — the exact COUNT, not the page length
    expect(first.hasMore).toBe(true)
    expect(first.nextCursor).toBeTruthy()

    const second = await listAccounts(cfg, guard, staff, SEES_PEOPLE, { cursor: first.nextCursor })
    expect(second.rows.length).toBeGreaterThan(0)
    const overlap = second.rows.filter((r) => first.rows.some((f) => f.id === r.id))
    expect(overlap, "keyset paging must not repeat a row on page two").toEqual([])
  })

  it("a pinned caller's total counts only their own world", async () => {
    const scope = await accountScope(cfg, { ...guard, userId: IDS.burglarUser })
    const page = await listAccounts(cfg, guard, scope, SEES_PEOPLE)
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
    await grantPortalAccess(cfg, guard, staff, actor, { onAccountId: solo, personAccountId: solo, userId: "U_SOLO" })
    const scope = await accountScope(cfg, { ...guard, userId: "U_SOLO" })
    if (scope.kind !== "portal") throw new Error("expected a portal caller")
    expect(scope.roots).toEqual([solo])
    expect(scope.accountIds).toEqual([solo])
  })
})


// THE REFERENCE IS MINTED, NOT TYPED (owner + Aurora, 17 Aug 2026).
//
// "The reference is generated by the system, not staff. Therefore no-one would
// type." Which makes the collision case the whole feature: nobody is standing in
// front of a conflict dialog, so the SERVER has to resolve it, and it has to do
// so through the thing that cannot be raced — the partial unique index on
// accounts(code) that has been there since 0007.
describe("the reference code", () => {
  const codeOf = (id: string) =>
    (db().prepare("SELECT code FROM accounts WHERE id = ?").get(id) as { code: string | null }).code

  // 2026-08-31 ruling: CONSONANTS, not letters. "Padelbase" -> PDLB is the
  // client's own example.
  it("is the first four consonants of the name, uppercased", async () => {
    const id = await createAccount(cfg, guard, staff, actor, {
      accountType: "entity",
      name: "Padelbase",
    })
    expect(codeOf(id)).toBe("PDLB")
  })

  it("a second company with the same four consonants gets a numeric suffix", async () => {
    // Bergman, Bergmann and Bergmark all reduce to the same four consonants
    // (B, R, G, M) once the vowels are stripped, exactly the way the old
    // by-letters scheme collided on their first four letters.
    const first = await createAccount(cfg, guard, staff, actor, { accountType: "entity", name: "Bergman S.A." })
    const second = await createAccount(cfg, guard, staff, actor, { accountType: "entity", name: "Bergmann GmbH" })
    const third = await createAccount(cfg, guard, staff, actor, { accountType: "entity", name: "Bergmark Oy" })
    expect(codeOf(first)).toBe("BRGM")
    expect(codeOf(second)).toBe("BRGM2")
    expect(codeOf(third)).toBe("BRGM3")
  })

  it("fewer than four consonants pads with the name's own vowels, in order", async () => {
    // "Iowa" has exactly one consonant (W) — the fallback fills the rest from
    // the vowels I, O, A in the order they appear, "use what there is".
    const id = await createAccount(cfg, guard, staff, actor, { accountType: "entity", name: "Iowa" })
    expect(codeOf(id)).toBe("WIOA")
  })

  it("punctuation and accents are not part of it", async () => {
    const id = await createAccount(cfg, guard, staff, actor, { accountType: "entity", name: "Ñ&Co Ltd" })
    // The tilde is stripped to its base letter, the ampersand is not a letter,
    // and the O is a vowel — stripped from the four consonants (N, C, L, T)
    // the same as any other vowel.
    expect(codeOf(id)).toBe("NCLT")
  })

  it("a name with nothing usable in it mints nothing — the row still lands", async () => {
    const id = await createAccount(cfg, guard, staff, actor, { accountType: "entity", name: "!!!" })
    expect(codeOf(id)).toBeNull()
  })

  it("a caller who DOES supply one still gets theirs (the importer carries legacy codes)", async () => {
    const id = await createAccount(cfg, guard, staff, actor, {
      accountType: "entity",
      name: "Bergman S.A.",
      code: "LEGACY1",
    })
    expect(codeOf(id)).toBe("LEGACY1")
  })
})

// THE ADDRESS BOOK IS ITS OWN GRANT (`contacts`), and the narrowing is a fence on
// the READ, not a filter on the screen: the rows, the exact total beside them and
// the CSV export all go through one `accountsWhere`, so a role without the right
// cannot see a person by asking a different way.
describe("without the contacts right, the collection is the companies", () => {
  const BLIND = { mayListPeople: false }

  it("the list drops every person — and its total drops with them (R16)", async () => {
    const all = await listAccounts(cfg, guard, staff, SEES_PEOPLE)
    const companies = await listAccounts(cfg, guard, staff, BLIND)
    expect(all.rows.some((r) => r.accountType === "individual"), "the harness has people to withhold").toBe(true)
    expect(companies.rows.every((r) => r.accountType === "entity")).toBe(true)
    expect(companies.total, "the badge counts the same question the rows answer").toBe(companies.rows.length)
    expect(companies.total).toBeLessThan(all.total)
  })

  it("asking for people explicitly does not get round it", async () => {
    const asked = await listAccounts(cfg, guard, staff, BLIND, { type: "individual" })
    expect(asked.rows).toEqual([])
    expect(asked.total).toBe(0)
  })

  it("the CSV export is narrowed the same way — one book, not two", async () => {
    const { rows } = await listAccountsForExport(cfg, guard, staff, BLIND)
    expect(rows.every((r) => r.accountType === "entity")).toBe(true)
  })

  // THE PEOPLE TAB'S BADGE, and it is the same narrowing rather than a second
  // one: the screen hides the tab, and the number behind it is zero anyway. A
  // badge computed a different way is a badge that eventually disagrees with the
  // list under it, which is exactly the shape of the bug this right exists for.
  it("the People badge is zero, from the same clause the rows go through", async () => {
    const blind = await listAccounts(cfg, guard, staff, BLIND)
    expect(blind.individualTotal).toBe(0)
    expect(blind.entityTotal).toBe(blind.total)
  })
})

// THE ALL / COMPANIES / PEOPLE STRIP asks a different question from the list
// under it — "how many of each are there", not "how many matched" — so the two
// numbers are computed apart and must stay apart under a filter.
describe("the two tab badges beside the accounts list", () => {
  it("count the collection, and add up to it", async () => {
    const page = await listAccounts(cfg, guard, staff, SEES_PEOPLE)
    expect(page.entityTotal + page.individualTotal).toBe(page.total)
    expect(page.individualTotal, "the harness has people to count").toBeGreaterThan(0)
  })

  it("do NOT move when the list is narrowed — a badge on a tab you have not pressed", async () => {
    const whole = await listAccounts(cfg, guard, staff, SEES_PEOPLE)
    const narrowed = await listAccounts(cfg, guard, staff, SEES_PEOPLE, { type: "entity" })
    // `total` follows the question that was asked; the two badges do not.
    expect(narrowed.total).toBe(whole.entityTotal)
    expect(narrowed.entityTotal).toBe(whole.entityTotal)
    expect(narrowed.individualTotal).toBe(whole.individualTotal)
  })
})

// A CONTACT'S OWN SCREEN reads the link table from the PERSON's side. This is the
// read that made one table the right answer: Marta is a contact of two companies,
// and a parent pointer has room for one of them.
describe("the companies a person belongs to", () => {
  // Marta is seeded as a contact of TWO companies on purpose (spine-harness) —
  // she is the reason one table was the right answer.
  it("comes back from the person's own id, naming the company on each row", async () => {
    const companies = await listPersonCompanies(cfg, guard, staff, IDS.victimPerson)
    expect(companies).toHaveLength(2)
    // `personName` carries "the other end" — the COMPANY, read about the person.
    expect(companies.map((c) => c.personName).sort()).toEqual(["Bergman Marine", "Bergman S.A."])
    expect(companies.every((c) => c.personAccountId === IDS.victimPerson)).toBe(true)
  })

  it("a company has none — it is people who belong to companies, not the reverse", async () => {
    expect(await listPersonCompanies(cfg, guard, staff, IDS.victimAccount)).toEqual([])
  })

  it("it is fenced: a pinned caller cannot read another company's links this way", async () => {
    const burglar = await accountScope(cfg, { ...guard, userId: IDS.burglarUser })
    expect(await listPersonCompanies(cfg, guard, burglar, IDS.victimPerson)).toEqual([])
  })
})
