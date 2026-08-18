import type {
  Account,
  ActivityItem,
  HelpTicket,
  Invite,
  InviteAudit,
  TeamMember,
  TeamMeta,
  TeamRole,
} from "@shared/types"
import { describe, expect, it } from "vitest"

import {
  ACCOUNT_TYPE,
  HELP_STATUS,
  INVITE_STATUS,
  accountStatus,
  shapeAccountsList,
  shapeActivity,
  shapeHelpList,
  shapeInviteDetail,
  shapeInvitesList,
  shapeMemberDetail,
  shapeMembersList,
  shapeRolesList,
  shapeTeamDetail,
} from "@/components/deep-link/shape"

/* ------------------------------ fixtures ------------------------------ */

const member: TeamMember = {
  userId: "u1",
  email: "alaap@x.com",
  firstName: "Alaap",
  lastName: "Kanchwala",
  imageUrl: null,
  roleId: "r1",
  roleTitle: "Admin",
  isYou: true,
  isAdmin: true,
  isClient: false,
  joinedAt: "2026-06-13T10:00:00.000Z",
}

const role: TeamRole = {
  id: "r1",
  title: "Editor",
  description: null,
  isDefault: false,
  memberCount: 1,
  active: true,
}

const invite: Invite = {
  id: "i1",
  email: "guest@x.com",
  roleId: "r1",
  roleTitle: "Editor",
  status: "pending",
  createdAt: "2026-06-13T10:00:00.000Z",
  expiresAt: "2026-06-20T10:00:00.000Z",
}

const audit: InviteAudit = {
  inviterName: "Alaap Kanchwala",
  inviterEmail: "alaap@x.com",
  inviterImageUrl: null,
  inviteeHasAccount: false,
  accepted: false,
  acceptedAt: null,
  shelfLifeHours: 168,
}

const ticket: HelpTicket = {
  id: "h1",
  helpType: "Bug",
  description: "The invite button is greyed out and I can't add anyone to the team at all.",
  screenRecordingLink: null,
  sourceScreen: "members",
  status: "in_progress",
  resolved: false,
  resolvedAt: null,
  // Our unsent working text. Present on a STAFF read (this one) and always null
  // to a client login — lib/help.ts toTicket.
  draftResolution: null,
  // The two numbers a client is shown about the work on their request — and the
  // only two.
  storyCount: 0,
  doneStoryCount: 0,
  raiserId: "u1",
  raiserName: "Alaap",
  editorName: null,
  // Which system it is about and who asked (CHECKLIST 5.8 + 5.9). The agency's
  // own question is about no app and was asked by nobody outside the building,
  // so both are null here — which is the case the row shape has to survive.
  appId: null,
  appName: null,
  raisedByContactId: null,
  raisedByContactName: null,
  // Only a ticket that WAITED ever carries one, and this one never did.
  validatedAt: null,
  createdAt: "2026-06-13T10:00:00.000Z",
  updatedAt: null,
  // The agency's own question belongs to no client, so it names no account —
  // and with no account there is no short code to build a reference out of.
  accountId: null,
  ref: null,
  rank: "M",
  lockedAt: "2026-06-13T10:05:00.000Z",
  archivedAt: null,
  titleDe: null,
  titleEn: null,
}

const meta: TeamMeta = {
  name: "Acme",
  createdAt: "2026-06-01T10:00:00.000Z",
  creatorName: "Alaap Kanchwala",
  creatorEmail: "alaap@x.com",
  updatedAt: null,
}

const activity: ActivityItem[] = [
  {
    id: "a1",
    type: "Member role changed",
    description: "Alaap changed Bo's role to Editor",
    actorName: "Alaap",
    createdAt: "2026-06-14T09:00:00.000Z",
  },
]

/* ------------------------------- tests -------------------------------- */

describe("INVITE_STATUS", () => {
  it("maps every invite state to a display label", () => {
    expect(INVITE_STATUS).toMatchObject({
      pending: "Pending",
      accepted: "Accepted",
      revoked: "Revoked",
      expired: "Expired",
    })
  })
})

describe("shapeActivity", () => {
  it("maps each item to { id, description, actor, timestamp }", () => {
    const [row] = shapeActivity(activity)
    expect(row.id).toBe("a1")
    expect(row.description).toBe("Alaap changed Bo's role to Editor")
    expect(row.actor).toBe("Alaap")
    expect(row).toHaveProperty("timestamp")
  })

  it("leaves actor undefined when actorName is null", () => {
    const [row] = shapeActivity([{ ...activity[0], actorName: null }])
    expect(row.actor).toBeUndefined()
  })
})

describe("shapeMembersList", () => {
  it("maps userId→id, name via personName, and a 'role · joined …' detail", () => {
    const { rows } = shapeMembersList([member])
    expect(rows?.[0].id).toBe("u1")
    expect(rows?.[0].name).toBe("Alaap Kanchwala")
    expect(String(rows?.[0].detail)).toContain("Admin")
    expect(String(rows?.[0].detail)).toContain("joined")
  })
})

describe("shapeRolesList", () => {
  it('adds the "(inactive)" suffix when !active', () => {
    const { rows } = shapeRolesList([{ ...role, active: false }])
    expect(rows?.[0].name).toBe("Editor (inactive)")
  })

  it("keeps the plain title when active", () => {
    const { rows } = shapeRolesList([role])
    expect(rows?.[0].name).toBe("Editor")
  })

  it('falls back to a "N members" detail when there is no description', () => {
    expect(shapeRolesList([{ ...role, memberCount: 1 }]).rows?.[0].detail).toBe("1 member")
    expect(shapeRolesList([{ ...role, memberCount: 3 }]).rows?.[0].detail).toBe("3 members")
  })

  it("uses the description for the detail when present", () => {
    const { rows } = shapeRolesList([{ ...role, description: "Can edit content" }])
    expect(rows?.[0].detail).toBe("Can edit content")
  })
})

describe("shapeInvitesList", () => {
  it("puts the email + an INVITE_STATUS value in the detail", () => {
    const { rows } = shapeInvitesList([invite])
    expect(rows?.[0].email).toBe("guest@x.com")
    expect(String(rows?.[0].detail)).toContain("Editor")
    expect(String(rows?.[0].detail)).toContain(INVITE_STATUS.pending)
  })
})

describe("HELP_STATUS", () => {
  it("maps every status (underscore form) to a friendly label", () => {
    expect(HELP_STATUS).toMatchObject({
      new: "New",
      triaged: "Triaged",
      in_progress: "In progress",
      ready: "Ready",
      resolved: "Resolved",
    })
  })
})

describe("shapeHelpList", () => {
  // K1 / CHECKLIST 11.9: the title alone, then ONE line of two facts. The
  // reference used to be prefixed into the name and the line used to carry four
  // things; both are what made a page of tickets read as a wall of text.
  it("maps id, a truncated description→name, and a 'status · type' detail", () => {
    const { rows } = shapeHelpList([ticket])
    expect(rows?.[0].id).toBe("h1")
    expect(String(rows?.[0].name).length).toBeLessThanOrEqual(80)
    expect(rows?.[0].name).not.toContain(ticket.ref as string)
    expect(rows?.[0].detail).toBe(`${HELP_STATUS.in_progress} · Bug`)
  })

  it("ends a long description with an ellipsis", () => {
    const long = { ...ticket, description: "x".repeat(200) }
    expect(String(shapeHelpList([long]).rows?.[0].name).endsWith("…")).toBe(true)
  })

  // The untyped fallback is "General" — the SAME word the ticket detail's
  // Overview prints, so a ticket with no type doesn't read as two things. It used
  // to say "Help", which was the section's old name doing duty as a type.
  it('falls back the type to "General" when helpType is null', () => {
    const { rows } = shapeHelpList([{ ...ticket, helpType: null }])
    expect(String(rows?.[0].detail).endsWith(" · General")).toBe(true)
  })
})

describe("shapeMemberDetail", () => {
  it("shapes the record fields and a shaped activity set", () => {
    const data = shapeMemberDetail(member, activity)
    expect(data.record?.id).toBe("u1")
    expect(data.record?.name).toBe("Alaap Kanchwala")
    expect(data.record?.email).toBe("alaap@x.com")
    expect(data.record?.role).toBe("Admin")
    expect(data.record).toHaveProperty("joined")
    expect(data.sets?.activity?.[0].id).toBe("a1")
  })
})

describe("shapeInviteDetail", () => {
  it("shapes the record + uses INVITE_STATUS for status", () => {
    const data = shapeInviteDetail(invite, audit, activity)
    expect(data.record?.id).toBe("i1")
    expect(data.record?.email).toBe("guest@x.com")
    expect(data.record?.status).toBe(INVITE_STATUS.pending)
    expect(data.record?.invitedBy).toBe("Alaap Kanchwala")
    expect(data.sets?.activity?.[0].id).toBe("a1")
  })

  it('shows accepted as "—" when the invite was not accepted', () => {
    const data = shapeInviteDetail(invite, audit, activity)
    expect(data.record?.accepted).toBe("—")
  })

  it('falls back invitedBy to "—" when there is no audit', () => {
    const data = shapeInviteDetail(invite, null, activity)
    expect(data.record?.invitedBy).toBe("—")
    expect(data.record?.accepted).toBe("—")
  })
})

describe("shapeTeamDetail", () => {
  it("shapes the record fields and a shaped activity set", () => {
    const data = shapeTeamDetail({
      teamId: "t1",
      name: "Acme",
      logoUrl: null,
      meta,
      activity,
    })
    expect(data.record?.id).toBe("t1")
    expect(data.record?.name).toBe("Acme")
    expect(data.record?.image).toBe("")
    expect(data.record?.createdBy).toBe("Alaap Kanchwala")
    expect(data.record?.updated).toBe("—") // meta.updatedAt is null
    expect(data.sets?.activity?.[0].id).toBe("a1")
  })
})

/* ------------------------------- accounts ------------------------------- */

const account = (over: Partial<Account> & { id: string; name: string }): Account => ({
  accountType: "entity",
  parentAccountId: null,
  email: null,
  phone: null,
  street: null,
  postalCode: null,
  city: null,
  country: null,
  industry: null,
  about: null,
  logoUrl: null,
  coverUrl: null,
  code: null,
  currency: null,
  locale: null,
  timezone: null,
  commercialsVisible: false,
  status: "client",
  active: true,
  ...over,
})

describe("shapeAccountsList", () => {
  // K1: three facts at most. The reference CODE left the line on 17 Aug 2026 —
  // it is a lookup key, not something anybody scans a list for — and it leads
  // the eyebrow on the account's own screen instead.
  it("says what a row IS on one line — kind and status, never the code", () => {
    const rows = shapeAccountsList([
      account({ id: "a1", name: "Bergman S.A.", code: "BERG", status: "past_client" }),
    ]).rows
    expect(rows?.[0].name).toBe("Bergman S.A.")
    expect(rows?.[0].detail).toBe("Company · Past client")
    // Facet columns the filter bar reads.
    expect(rows?.[0].type).toBe(ACCOUNT_TYPE.entity)
    expect(rows?.[0].status).toBe("Past client")
    expect(rows?.[0].archived).toBe("No")
  })

  it("names the parent when it is on the page, and still says nested when it isn't", () => {
    const rows = shapeAccountsList([
      account({ id: "a1", name: "Bergman S.A." }),
      account({ id: "a2", name: "Bergman Workshop", parentAccountId: "a1" }),
      // Its parent sits on a later page — the line must not imply top level.
      account({ id: "a3", name: "Delaval Nord", parentAccountId: "off-page" }),
    ]).rows
    expect(rows?.[0].detail).not.toContain("under")
    expect(rows?.[1].detail).toContain("under Bergman S.A.")
    expect(rows?.[2].detail).toContain("under another account")
  })

  it("keeps an archived account visible, and flags it (archive-never-delete)", () => {
    const rows = shapeAccountsList([account({ id: "a1", name: "Old Co", active: false })]).rows
    expect(rows?.[0].name).toBe("Old Co (archived)")
    expect(rows?.[0].archived).toBe("Yes")
  })
})

describe("accountStatus", () => {
  it("tidies the team's own word without translating it", () => {
    expect(accountStatus("past_client")).toBe("Past client")
    expect(accountStatus("prospect")).toBe("Prospect")
    expect(accountStatus("")).toBe("")
    expect(accountStatus(null)).toBe("")
  })
})
