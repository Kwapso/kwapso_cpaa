// A CLIENT LOGIN IS A MEMBER, AND IT MUST NOT BE AN ASSIGNEE.
//
// Grant → invite → accept is the only way to make a working portal login, so a
// client contact holds an ordinary role and sits in `team_members` beside our own
// staff. Nothing on the membership row says which is which — and every people
// picker in the agency app is built from that list, so "Who's doing it" on a new
// task was offering the agency's clients by name. The owner found it by opening
// one.
//
// The fix has two halves and they are checked in two places: the DOOR says which
// members are client logins (here), and the front door decides what to do about
// it (web/test/assignable-people.test.ts). This suite is the first half — the
// fact has to be true before anything can act on it.
//
// It runs the REAL handler against a real SQLite database with the real
// migrations, through the shared spine harness, because the fact comes off the
// customer spine and a mocked query would only prove the mock.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import type { TeamMember } from "@shared/types"
import worker from "../src/index"
import { buildSpineDb, IDS, makeEnv, req } from "./spine-harness"

const asStaff = () => makeEnv(() => holder.db as DatabaseSync, IDS.staffUser)

async function members(): Promise<TeamMember[]> {
  const res = await worker.fetch(req("GET /api/tenancy/members"), asStaff())
  expect(res.status, await res.clone().text()).toBe(200)
  return ((await res.json()) as { members: TeamMember[] }).members
}

describe("the members list says which logins belong to a client", () => {
  beforeEach(() => {
    holder.db = buildSpineDb()
  })

  it("marks every member with a portal grant, and nobody else", async () => {
    const rows = await members()
    // The harness seeds four members: one of ours and three client logins
    // (Bergman's Marta, her colleague Luis under the same company, and Delaval's
    // Diego). A guard on the fixture, so a harness change cannot quietly turn
    // this into an assertion about an empty list.
    expect(rows.length).toBe(4)

    const clients = rows.filter((m) => m.isClient).map((m) => m.userId).sort()
    expect(clients).toEqual([IDS.burglarUser, IDS.contactUser, IDS.victimUser].sort())

    const ours = rows.filter((m) => !m.isClient).map((m) => m.userId)
    expect(ours).toEqual([IDS.staffUser])
  })

  it("keeps saying so when the client's access is switched off", async () => {
    // PRESENCE, not liveness. A revoked grant still means "this login belongs to
    // a client" — the account fence decides the caller's own kind the same way —
    // and reading only the live grants would put a client whose access was paused
    // back into the agency's assignee lists, which is the bug wearing a hat.
    holder.db?.exec(
      `UPDATE portal_users SET deactivated_at = '2026-03-01' WHERE user_id = '${IDS.victimUser}';`
    )
    const marta = (await members()).find((m) => m.userId === IDS.victimUser)
    expect(marta?.isClient).toBe(true)
  })

  it("still lists them — the screen that manages members has to show them", async () => {
    // The door does not filter. A client login IS a member: if this list dropped
    // them, nobody could see the grant, change the role, or take it away. The
    // decision about who can be given WORK belongs to the screen asking, and it
    // needs the whole list plus the fact to make it.
    const rows = await members()
    expect(rows.map((m) => m.userId)).toContain(IDS.victimUser)
  })
})
