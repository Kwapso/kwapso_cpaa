// NO GRANTING WHAT YOU WERE NOT GIVEN — the invariant `setRolePermissions` has
// stated in words since it was written, now enforced on every door that hands
// rights to somebody.
//
// The hole this suite was written for: `member_roles:edit` was guarded against
// the caller widening their OWN role (`roleId === guard.roleId`), and that guard
// names ONE role id, so two doors walked straight around it.
//
//   • INVITE. `POST /api/tenancy/invites` gates on `team_members:create` — an
//     ordinary grant — and applies the named role verbatim on accept. `GET
//     /members` hands out every role id with an `isAdmin` flag on
//     `team_members:read` alone. So: read the Admin role's id, invite a second
//     address you own to it, accept, and you hold every right in the team,
//     without ever touching a member_roles right.
//   • CREATE A ROLE with a full matrix. The self-grant check compares against the
//     caller's role id, and a role that did not exist a moment ago never matches.
//
// Run against a REAL team database with the REAL migrations and the REAL seed,
// because the guard's whole question is "what does role_permissions actually
// say" — a mocked sheet would agree with the guard whether it was right or not.

import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})
vi.mock("@shared/workers/activity", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
  describeChanges: vi.fn().mockReturnValue(""),
}))

import { buildTeamSeed, TEAM_MIGRATIONS } from "../src/team-schema"
import {
  requireGrantableRights,
  requireGrantableRole,
  setRolePermissions,
} from "../src/lib/roles"

const cfg = { accountId: "a", apiToken: "t" } as never
const actor = { id: "U", email: "u@x.com", name: "U" }
const db = () => holder.db as DatabaseSync

/** Ids the seed mints are random, so the suite reads them back by title. */
function roleIdByTitle(title: string): string {
  return (db().prepare("SELECT id FROM member_roles WHERE title = ?").get(title) as { id: string }).id
}

/** A role holding exactly the rights named, and nothing else. */
function makeRole(id: string, title: string, rights: Record<string, string[]>) {
  db().exec(
    `INSERT INTO member_roles (id, title, description, is_default, created_at, creator_id, creator_email, creator_name)
     VALUES ('${id}', '${title}', '', 0, '2026-01-01', 'U', 'u@x.com', 'U');`
  )
  for (const [module, list] of Object.entries(rights))
    db().exec(
      `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
       VALUES ('P_${id}_${module}', '${id}', '${module}',
         ${list.includes("read") ? 1 : 0}, ${list.includes("create") ? 1 : 0},
         ${list.includes("edit") ? 1 : 0}, ${list.includes("delete") ? 1 : 0});`
    )
}

beforeEach(() => {
  holder.db = new DatabaseSync(":memory:")
  for (const m of TEAM_MIGRATIONS) db().exec(m.sql)
  db().exec(buildTeamSeed(actor, "2026-01-01").script)
  // The attacker: "can invite people", and nothing else. The most ordinary
  // grant there is, and the one the escalation only ever needed.
  makeRole("R_INVITER", "Office manager", { team_members: ["read", "create"] })
  // A second victim role for the create-a-role half.
  makeRole("R_ROLEMAKER", "Role maker", {
    team_members: ["read", "create"],
    member_roles: ["read", "create", "edit"],
  })
})

const guardFor = (roleId: string) => ({ userId: "U", teamId: "T", roleId, databaseId: "db" })

describe("an invite cannot hand out rights the inviter does not hold", () => {
  it("REFUSES an office manager inviting somebody to Admin", async () => {
    const admin = roleIdByTitle("Admin")
    await expect(requireGrantableRole(cfg, guardFor("R_INVITER"), admin)).rejects.toMatchObject({
      status: 403,
      code: "grant_exceeds_own",
    })
  })

  it("names the rights that are missing, so the refusal is actionable", async () => {
    const admin = roleIdByTitle("Admin")
    const err = await requireGrantableRole(cfg, guardFor("R_INVITER"), admin).catch((e) => e)
    // Every module the Admin role holds and the inviter does not must be named.
    expect(err.message).toContain("Accounts")
    expect(err.message).toContain("Roles & permissions")
  })

  it("ALLOWS an admin inviting somebody to Admin — the ceiling is the caller's own sheet", async () => {
    const admin = roleIdByTitle("Admin")
    await expect(requireGrantableRole(cfg, guardFor(admin), admin)).resolves.toBeUndefined()
  })

  it("ALLOWS an office manager inviting somebody to a role no stronger than theirs", async () => {
    makeRole("R_WEAKER", "Helper", { team_members: ["read"] })
    await expect(
      requireGrantableRole(cfg, guardFor("R_INVITER"), "R_WEAKER")
    ).resolves.toBeUndefined()
  })
})

describe("a NEW role cannot be minted stronger than its maker", () => {
  it("REFUSES a full matrix from a role that holds member_roles but not accounts", async () => {
    // The self-grant guard cannot fire here: the role being written is not the
    // caller's. This is the door that made the invite escalation possible
    // without ever needing to know the Admin role's id.
    makeRole("R_NEW", "Minted", {})
    await expect(
      setRolePermissions(cfg, guardFor("R_ROLEMAKER"), actor, "R_NEW", {
        accounts: { read: true, create: true, edit: true, delete: true },
      })
    ).rejects.toMatchObject({ status: 403, code: "grant_exceeds_own" })
  })

  it("ALLOWS a matrix inside the maker's own rights", async () => {
    makeRole("R_NEW2", "Minted too", {})
    await expect(
      setRolePermissions(cfg, guardFor("R_ROLEMAKER"), actor, "R_NEW2", {
        team_members: { read: true, create: true, edit: false, delete: false },
      })
    ).resolves.toBeUndefined()
  })

  it("compares AFTER the auto-flip-read rule, so a write-only ask is judged as written", async () => {
    // The door forces read on whenever a write is on. Judging the raw request
    // would refuse a `read` the caller never asked for and the door would grant
    // anyway — the guard has to see the same sheet the statement writes.
    makeRole("R_CREATE_ONLY", "Creator", { help: ["read", "create"] })
    makeRole("R_NEW3", "Minted three", {})
    await expect(
      setRolePermissions(cfg, guardFor("R_CREATE_ONLY"), actor, "R_NEW3", {
        help: { read: false, create: true, edit: false, delete: false },
      })
    ).resolves.toBeUndefined()
  })
})

describe("the ceiling fails closed", () => {
  it("a caller whose own sheet is empty can grant nothing", async () => {
    makeRole("R_NOTHING", "Nothing", {})
    await expect(
      requireGrantableRights(cfg, guardFor("R_NOTHING"), {
        help: { read: true, create: false, edit: false, delete: false },
      })
    ).rejects.toMatchObject({ code: "grant_exceeds_own" })
  })
})

// THE SEAM, not just the behaviour. The guard above is only worth having if the
// two doors actually call it — and the invite door is the one that had no such
// line for the whole of the product's life. Read off disk, so deleting the call
// turns this red even though every behaviour test above still passes.
describe("both granting doors carry the ceiling", () => {
  const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8")

  /** WHERE the call is, refusing -1. `indexOf` answers -1 for "absent", and -1 is
   * less than every real offset — so a bare `expect(indexOf(call)).toBeLessThan(
   * indexOf(write))` passes LOUDEST when the call has been deleted. That is the
   * hollow-green shape this repo has been bitten by before; the assertion has to
   * prove presence first. (Found by sabotaging this very test.) */
  function callAt(src: string, call: string): number {
    const at = src.indexOf(call)
    expect(at, `${call} is not called at all`).toBeGreaterThan(-1)
    return at
  }

  it("createInvite asks before it writes the invite", () => {
    const s = src("lib/invites.ts")
    // Before the INSERT that makes the invite real — a check after the write is
    // not a check.
    expect(callAt(s, "await requireGrantableRole(cfg, guard, roleId)")).toBeLessThan(
      callAt(s, "INSERT INTO invite_index")
    )
  })

  it("setRolePermissions asks before it writes the sheet", () => {
    const s = src("lib/roles.ts")
    expect(callAt(s, "await requireGrantableRights(cfg, guard, value)")).toBeLessThan(
      callAt(s, "INSERT INTO role_permissions (id, role_id, module")
    )
  })
})
