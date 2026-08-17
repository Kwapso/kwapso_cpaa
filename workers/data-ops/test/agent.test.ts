// Guards on the agent's safety surface (pure logic — no model/DB/network):
//  • the confirm rule — removals (remove a member, revoke an invite), the four PRIVILEGE
//    GRANTS (who-can-do-what never changes silently),
//    deactivations (a role/article/dropdown value, only when switching OFF), and
//    deactivations and bulk/import writes pause for the yes/no panel; every OTHER
//    constructive write (article, ticket, reply, team details, reactivate) runs free,
//  • the catalog is OPT-IN (only listed actions are tools), and
//  • the agent acts AS the user with the user's EXACT rights (the server re-checks each
//    call); it still cannot control device sessions or delete the team. Managing
//    existing members (set a role, remove someone) IS allowed — normal, re-gated CRUD.

import { describe, expect, it } from "vitest"

import { getTool, requiresConfirm, toolSpecs, TOOL_CATALOG } from "../src/lib/tools"
import { isPrivilegeWrite, TOOL_GATES } from "@shared/workers/tool-gates"

describe("step/confirm summaries resolve ids to human names", () => {
  const names = { "01ROLE": "Sub Admin", "01USER": "Jane Doe" }

  it("names a role by title (not a ULID) when resolved", () => {
    expect(getTool("set_role_active")!.summarize({ roleId: "01ROLE", active: false }, names)).toBe(
      "Deactivate the Sub Admin role"
    )
    expect(getTool("set_role_permissions")!.summarize({ roleId: "01ROLE", value: {} }, names)).toBe(
      "Set access rights for the Sub Admin role"
    )
    expect(getTool("invite_member")!.summarize({ email: "sam@x.com", roleId: "01ROLE" }, names)).toBe(
      "Invite sam@x.com as Sub Admin"
    )
    expect(
      getTool("set_member_role")!.summarize({ userId: "01USER", roleId: "01ROLE" }, names)
    ).toBe("Change Jane Doe to Sub Admin")
  })

  it("falls back to the raw id when a name can't be resolved (never throws)", () => {
    expect(getTool("set_role_active")!.summarize({ roleId: "01ROLE", active: true })).toBe(
      "Activate role 01ROLE"
    )
    expect(getTool("invite_member")!.summarize({ email: "sam@x.com", roleId: "01ROLE" })).toBe(
      "Invite sam@x.com as role 01ROLE"
    )
  })
})

describe("agent tool catalog + confirm rule (destructive + privilege grants)", () => {
  // THE RULE, in two halves. (1) DESTRUCTIVE acts confirm — removing a member,
  // revoking an invite, deactivating a record. (2) So do PRIVILEGE GRANTS, and
  // only these four: the model reaches them while reading team data an attacker
  // can author (a ticket description is 20,000 characters of someone else's
  // text), so a silent grant is a silent privilege escalation. Everything else
  // constructive still runs straight away — that is the deliberate UX.
  // The set is written out so it cannot quietly GROW back into "confirm
  // everything", which is the friction this rule was written to remove.
  const DESTRUCTIVE = ["remove_member", "revoke_invite"]
  // NOT here any more, and worth saying why: `raise_help_ticket` and
  // `update_help_ticket`. Both carry `accountId`, which decides WHICH CLIENT CAN
  // READ THE TICKET — the update door sets it on a ticket that had none, handing
  // over the whole reply history, and the raise door can post agency content into
  // a named client's portal from birth. Both are reachable from a model that has
  // just been reading ticket text a client wrote, so both stop for the panel now.
  // See workers/content/test/fence-row-confirm.test.ts and FENCED_ROW_OWNERS.
  const RUNS_FREELY = [
    "update_team",
    "create_brand_asset",
    "update_brand_asset",
    "reply_help_ticket",
    "create_dropdown_value",
    "update_dropdown_value",
  ]

  it("confirms destructive acts", () => {
    for (const name of DESTRUCTIVE)
      expect(requiresConfirm(getTool(name)!), `${name} must confirm (destructive)`).toBe(true)
  })

  // DERIVED, never a name list: every catalogued WRITE whose gate lands on
  // member_roles or team_members must confirm. A name list locks the tools you
  // thought of and waves through the next one — deriving it is what caught
  // update_role sitting at confirm:false beside four that confirmed.
  it("confirms every write that touches who-can-do-what — derived from the catalog", () => {
    const privilege = TOOL_CATALOG.filter((t) => isPrivilegeWrite(t))
    expect(privilege.length, "the derivation must actually find the privilege writes").toBeGreaterThanOrEqual(6)
    for (const t of privilege) {
      expect(
        t.confirm,
        `${t.name} writes to a privilege table (${TOOL_GATES[t.name] ?? t.path}) — it must DECLARE confirm: true, not a predicate and not false`
      ).toBe(true)
      expect(requiresConfirm(t, { active: true }), `${t.name} must confirm whatever its input`).toBe(true)
      expect(requiresConfirm(t, { active: false }), `${t.name} must confirm whatever its input`).toBe(true)
    }
    // …and the derivation must not sweep up ordinary content writes.
    for (const name of RUNS_FREELY)
      expect(isPrivilegeWrite(getTool(name)!), `${name} is not a privilege write`).toBe(false)
  })

  it("every OTHER constructive write still runs freely (the friction stays gone)", () => {
    for (const name of RUNS_FREELY)
      expect(requiresConfirm(getTool(name)!), `${name} runs freely (constructive)`).toBe(false)
  })

  it("(de)activate toggles confirm ONLY when turning something OFF (input-aware)", () => {
    // Deactivating an existing record is destructive → confirm; reactivating is not.
    // set_role_active is NOT in this list: it writes to member_roles, so the
    // derived privilege rule makes it confirm both ways (a reactivated role hands
    // its rights back to everyone holding it).
    for (const name of ["set_brand_asset_active", "set_dropdown_active"]) {
      const t = getTool(name)!
      expect(requiresConfirm(t, { active: false }), `${name} deactivate must confirm`).toBe(true)
      expect(requiresConfirm(t, { active: true }), `${name} activate runs freely`).toBe(false)
      // A missing/omitted `active` deactivates (buildBody sends active:false), so it
      // must confirm too — the predicate mirrors buildBody's `active === true`.
      expect(requiresConfirm(t, {}), `${name} with no active deactivates → confirm`).toBe(true)
    }
  })

  it("never confirms a read", () => {
    for (const t of TOOL_CATALOG.filter((t) => !t.write)) {
      expect(requiresConfirm(t)).toBe(false)
    }
  })

  it("can set + read a role's access rights (parity with the Roles screen)", () => {
    expect(getTool("set_role_permissions")).toBeDefined()
    expect(getTool("get_role_permissions")).toBeDefined()
    expect(getTool("set_role_permissions")!.write).toBe(true)
    expect(getTool("get_role_permissions")!.write).toBe(false)
  })

  it("bulk tools change many records at once — write, confirm (high-blast), via CONTENT", () => {
    // A bulk change hits many rows, so it's always confirmed with a count-bearing summary.
    for (const name of ["bulk_set_help_status"]) {
      const t = getTool(name)
      expect(t, `tool "${name}" must be defined`).toBeDefined()
      expect(t!.write).toBe(true)
      expect(t!.confirm).toBe(true)
      expect(requiresConfirm(t!)).toBe(true)
      expect(t!.binding).toBe("CONTENT")
      expect(t!.path.startsWith("/api/")).toBe(true)
    }
  })

  it("can LIST invites — so it can find a pending invite's id to revoke it", () => {
    // The gap that broke 'revoke sabiha's invite': revoke_invite needs an inviteId, but
    // there was no tool to list pending invites (list_members only shows joined members).
    const t = getTool("list_invites")
    expect(t, "list_invites must exist").toBeDefined()
    expect(t!.write).toBe(false)
    expect(t!.binding).toBe("TENANCY")
    expect(t!.path).toBe("/api/tenancy/invites")
    // revoke_invite (the tool it feeds) is still there.
    expect(getTool("revoke_invite")).toBeDefined()
  })

  it("manages members AS the user — set_member_role + remove_member are present", () => {
    // The agent acts AS the user with their EXACT rights (the server re-checks each
    // call), so member management is allowed. Removing a member is destructive and
    // re-assigning a role is a privilege grant — both stop for the confirm panel.
    expect(getTool("remove_member")).toBeDefined()
    expect(getTool("set_member_role")).toBeDefined()
    expect(requiresConfirm(getTool("remove_member")!)).toBe(true)
    expect(requiresConfirm(getTool("set_member_role")!)).toBe(true)
  })

  it("exposes a spec for every catalogued tool, and nothing else is callable", () => {
    const specs = toolSpecs()
    expect(specs.map((s) => s.name).sort()).toEqual(TOOL_CATALOG.map((t) => t.name).sort())
    // Catastrophic acts stay out of the catalog: deleting the team, signing out devices.
    expect(getTool("delete_team")).toBeUndefined()
    expect(getTool("sign_out")).toBeUndefined()
    expect(getTool("change_my_email")).toBeUndefined()
  })

  it("still cannot control device sessions or delete the team (catastrophic acts blocked)", () => {
    // Device-session control and team deletion are catastrophic, not normal CRUD, so
    // they stay out of the catalog by name and by surface.
    const banned = /delete_team|sign_out/i
    for (const t of TOOL_CATALOG) {
      expect(banned.test(t.name), `tool "${t.name}" must not be a catastrophic act`).toBe(false)
    }
    // No tool may touch the device-sessions surface.
    for (const t of TOOL_CATALOG) {
      expect(/sessions/.test(t.path), `tool "${t.name}" path ${t.path}`).toBe(false)
    }
  })

  it("every write tool declares how it's gated (a module the real door checks)", () => {
    for (const t of TOOL_CATALOG) {
      if (t.binding === "SELF") {
        // A SELF tool runs inside data-ops — its gate is its own handler, which
        // must exist (it re-opens teamContext + requireRight from the request).
        expect(typeof t.run, `SELF tool "${t.name}" must carry a run handler`).toBe("function")
        continue
      }
      expect(t.binding === "CONTENT" || t.binding === "TENANCY").toBe(true)
      expect(t.path.startsWith("/api/")).toBe(true)
    }
  })

  it("the chat-import runner always confirms (writing a whole file is high-blast)", () => {
    const t = TOOL_CATALOG.find((x) => x.name === "run_import_batch")
    expect(t).toBeDefined()
    expect(t?.confirm).toBe(true)
    expect(t?.write).toBe(true)
  })
})
