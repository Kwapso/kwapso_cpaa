// WHO THE AGENCY APP OFFERS WHEN IT ASKS "WHO?"
//
// A client-portal login is an ordinary team member, so every picker built from
// the members list was offering the agency's own clients: "Who's doing it" on a
// new task, the assignee on a story, an app's staff, triage duty, the people you
// can tag on a ticket. The owner opened one and read his clients' names back.
//
// Two halves, checked separately. The DOOR says which members are client logins
// (workers/tenancy/test/members-are-ours.test.ts). This is the other half: what
// the front door does with that, and — the part that actually holds over time —
// that there is only ONE place doing it.
//
// The behaviour test would pass with the rule copied into nine screens. The
// SOURCE test is the one that catches the tenth.

import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"
import type { TeamMember } from "@shared/types"
import { assignableMembers } from "@/lib/members"

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, "..")

const person = (over: Partial<TeamMember> & { userId: string }): TeamMember => ({
  email: `${over.userId}@kwapso.app`,
  firstName: "Someone",
  lastName: "Else",
  imageUrl: null,
  roleId: "r1",
  roleTitle: "Member",
  isYou: false,
  isAdmin: false,
  isClient: false,
  joinedAt: "2026-01-01",
  ...over,
})

describe("assignableMembers — our people, and only ours", () => {
  it("leaves a client contact out of the list entirely", () => {
    const out = assignableMembers([
      person({ userId: "u-staff", firstName: "Alaap", lastName: "K" }),
      person({
        userId: "u-client",
        firstName: "Aurora",
        lastName: "Thalassa",
        isClient: true,
        roleTitle: "Client",
      }),
    ])
    expect(out.map((p) => p.id)).toEqual(["u-staff"])
    expect(JSON.stringify(out)).not.toContain("Aurora")
  })

  it("drops a client even when their role is not called Client", () => {
    // The role is a word an owner typed; the portal grant is the fact. A client
    // given the Viewer role by mistake is still a client.
    const out = assignableMembers([
      person({ userId: "u-client", roleTitle: "Viewer", isClient: true }),
    ])
    expect(out).toEqual([])
  })

  it("tells two people with the same name apart", () => {
    // THE DUPLICATE IN THE SCREENSHOT. "Alaap Kanchwala" twice in one dropdown —
    // not one row drawn twice (membership is unique on team + user) but two
    // different people with the same display name. Dropping clients removes that
    // particular pair; a name that is not unique still has to be pickable.
    const out = assignableMembers([
      person({ userId: "u-1", firstName: "Alaap", lastName: "Kanchwala", email: "alaap@kwapso.app" }),
      person({ userId: "u-2", firstName: "Alaap", lastName: "Kanchwala", email: "ak@kwapso.app" }),
      person({ userId: "u-3", firstName: "Aurora", lastName: "Thalassa" }),
    ])
    expect(out.map((p) => p.name)).toEqual([
      "Alaap Kanchwala (alaap@kwapso.app)",
      "Alaap Kanchwala (ak@kwapso.app)",
      // Untouched: most of the time a name is a name, not a record.
      "Aurora Thalassa",
    ])
    expect(new Set(out.map((p) => p.name)).size).toBe(3)
  })

  it("counts duplicates AFTER the clients are gone", () => {
    // Otherwise a staff member would carry an email in their name forever
    // because a client happens to share it — a disambiguation against somebody
    // who is not in the list is just noise.
    const out = assignableMembers([
      person({ userId: "u-staff", firstName: "Alaap", lastName: "Kanchwala" }),
      person({ userId: "u-client", firstName: "Alaap", lastName: "Kanchwala", isClient: true }),
    ])
    expect(out.map((p) => p.name)).toEqual(["Alaap Kanchwala"])
  })

  it("falls back to the email when there is no name yet, and survives no list", () => {
    expect(
      assignableMembers([person({ userId: "u-1", firstName: null, lastName: null, email: "new@kwapso.app" })])
      // `photo` rides along now (R35) — a person's face is carried to every
      // picker that offers them, rather than dropped one line before it.
    ).toEqual([{ id: "u-1", name: "new@kwapso.app", photo: null }])
    expect(assignableMembers(undefined)).toEqual([])
  })
})

/* ------------------------------------------------------------------------- */

/**
 * The screens that read the members list and are NOT asking "who can do this
 * work". A client login is a member: the screens that MANAGE members have to
 * show them, or nobody could see a grant, change a role, or take one away.
 * Every one is a visible line with a reason; anything else must go through the
 * one seam.
 */
const NOT_A_WORK_PICKER: Record<string, string> = {
  "screens/kwapso-screen.tsx":
    "the team roster on the agency's own record — a list of who is here, not a list of who can be given something",
}

describe("one seam decides it, and every picker uses that seam", () => {
  it("no screen builds its own members list", () => {
    const files = sourceFiles([join(WEB, "components")], { extensions: [".tsx"], skipTests: true })
    expect(files.length, "the component walk found nothing — it has gone blind").toBeGreaterThan(40)

    // Derived, not hand-listed: a screen that READS the members list is a screen
    // that offers people, whatever it is called and wherever it is filed.
    const readers = files.filter((f) => /useCached<TeamMember\[\]>/.test(stripComments(f.source)))
    expect(
      readers.length,
      "no screen reads the members list at all — the derivation is looking at the wrong thing"
    ).toBeGreaterThan(2)

    const offenders = readers
      .map((f) => f.rel)
      .filter((rel) => !(rel in NOT_A_WORK_PICKER))
      .filter((rel) => {
        const src = stripComments(readers.find((f) => f.rel === rel)?.source ?? "")
        return !/\bassignableMembers\s*\(/.test(src)
      })
    expect(
      offenders,
      `these screens turn the members list into members to pick without going through lib/members — call assignableMembers(), or add a reasoned NOT_A_WORK_PICKER entry: ${offenders.join(", ")}`
    ).toEqual([])

    // ROT CHECK: an exemption for a screen that no longer reads members is a
    // permission nobody needs, and stale permissions are how the next one passes.
    const live = new Set(readers.map((f) => f.rel))
    const stale = Object.keys(NOT_A_WORK_PICKER).filter((k) => !live.has(k))
    expect(stale, `NOT_A_WORK_PICKER names screens that no longer read members: ${stale.join(", ")}`).toEqual([])
  })

  it("the hook every app screen uses is the filtered one", () => {
    // The four app screens ask a hook rather than the raw cache. It lives beside
    // the filter so it cannot answer a different question from it.
    const members = sourceFiles([join(WEB, "lib")], { extensions: [".ts"], skipTests: true }).find(
      (f) => f.rel === "members.ts"
    )
    expect(members, "web/lib/members.ts is the seam and it is not there").toBeTruthy()
    expect(stripComments(members?.source ?? "")).toContain("return assignableMembers(membersQ.data)")

    const users = sourceFiles([join(WEB, "components")], { extensions: [".tsx"], skipTests: true }).filter(
      (f) => /useAssignableMembers\s*\(/.test(stripComments(f.source))
    )
    expect(
      users.length,
      "nothing uses the hook — either it was inlined again, or the four app screens went back to the raw list"
    ).toBeGreaterThan(3)
  })
})
