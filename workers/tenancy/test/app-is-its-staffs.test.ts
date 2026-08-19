// AN APP WITH PEOPLE ON IT KEEPS ITS MATERIAL FOR THEM.
//
// THE RULING, IN TWO STEPS, AND THE SECOND ONE IS THE RULE. Asked on 19 Aug 2026
// whether the agency side should be fenced too — any team member with the apps
// right seeing every app, running cost included — the owner said "yes of course",
// and the first reading of that hid the ROW: an app with staff on it disappeared
// from the list for everybody else. He read it back the same day and narrowed it:
//
//   "I just want to make it such that people who are not main stakeholders of the
//    app can see it. They just can't enter the details screen of it and stuff
//    like that... if somebody sends them a link to the app, it just throws them
//    out."
//
// So the fence is RECORD-LEVEL, not row-level. Everybody sees every app. What a
// non-staffed reader does not get is the app's own material: its address, its
// four context fields, its running cost, and the two people lists. That is
// decided on the row (`canOpen`) and the withheld fields are LEFT OUT of the
// payload — a field that never crosses the wire cannot be read out of the network
// tab, and "the screen doesn't render it" is not a permission.
//
// WHY UNASSIGNED IS NOT SECRET. On staging: 28 live apps, and exactly TWO with
// anybody staffed on them. Closing an app nobody is on would shut 26 of 28
// systems to everyone but an admin on the day this shipped — and a rule that
// locks almost everything gets switched off rather than filled in. So an app with
// nobody on it stays open, and the fence closes around it the moment somebody is
// put on it: the more of the rota is filled in, the tighter it gets.
//
// A CLIENT LOGIN IS NOT SUBJECT TO IT. The account fence has already decided which
// apps they may see, and every one is their own system; staffing is OUR rota, and
// applying it to them would close a client's own app because none of our people
// had been assigned yet.
//
// THIS FILE EXISTS BECAUSE THE REDACTION HAD NO TEST. It was a projection inside a
// `.map()` — exactly the shape a refactor drops in silence.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
import { buildSpineDb, IDS, makeEnv } from "./spine-harness"

const db = () => holder.db as DatabaseSync

type App = {
  id: string
  name: string
  url: string | null
  canOpen: boolean
  toolCostCentsPerMonth: number | null
  about: string | null
  staff: unknown[]
  stakeholders: unknown[]
}

const call = (userId: string) =>
  worker.fetch(
    new Request("https://tenancy/api/tenancy/apps", {
      headers: { Cookie: "session=x" },
    }),
    makeEnv(() => db(), userId) as never
  )

async function appsFor(userId: string): Promise<{ apps: App[]; total: number; body: string }> {
  const res = await call(userId)
  const body = await res.text()
  const parsed = JSON.parse(body) as { apps: App[]; total: number }
  return { apps: parsed.apps, total: parsed.total, body }
}

const victim = (apps: App[]) => apps.find((a) => a.id === IDS.victimApp)

/** A second staff member who is on nothing — the person this rule is about. */
const OUTSIDER = "U_STAFF_OUTSIDER"

beforeEach(() => {
  holder.db = buildSpineDb()
  // A colleague with the same rights and none of the assignments. Given a NON
  // default role, because `is_default = 1` is what marks the locked Admin role
  // and an admin opens everything by design.
  db().exec(`
    INSERT INTO users (id, email, first_name, current_team_id)
      VALUES ('${OUTSIDER}', 'dev@kwapso.app', 'Dev', '${IDS.team}');
    INSERT INTO member_roles (id, title, is_default, created_at) VALUES ('R_DEV', 'Developer', 0, '2026-01-01');
    INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
      VALUES ('RP_DEV', 'R_DEV', 'processes', 1, 1, 1, 1);
    INSERT INTO team_members (id, team_id, user_id, role_id, created_at)
      VALUES ('m_out', '${IDS.team}', '${OUTSIDER}', 'R_DEV', '2026-01-01');
  `)
})

describe("an app nobody is on", () => {
  it("opens for a colleague who is not on it — unassigned is not secret", async () => {
    const { apps } = await appsFor(OUTSIDER)
    const app = victim(apps)
    expect(app, "an app with no rota is everybody's until somebody is put on it").toBeDefined()
    expect(app?.canOpen).toBe(true)
    expect(app?.url, "and it opens with its material, not as a stub").toBe("https://dispatch.example")
  })

  // THE MONEY DOES NOT RIDE THE CARVE-OUT, and this is the assertion that says
  // so out loud. Two rulings meet on this row: reopen the app's PAGE (19 Aug),
  // and fence what an app costs us to run (the same day). Only the first was
  // relaxed. Without this split, "unassigned is not secret" would hand the
  // running cost of 26 of 28 systems to anybody holding `processes:read` — the
  // money fence undone as a side effect of a visibility change, which is exactly
  // the kind of quiet reversal R24 exists to stop.
  it("still withholds what it costs us to run — that carve-out is not the money's", async () => {
    const { apps, body } = await appsFor(OUTSIDER)
    expect(victim(apps)?.toolCostCentsPerMonth).toBeNull()
    expect(body).not.toContain("42000")
  })
})

describe("an app somebody IS on", () => {
  beforeEach(() => {
    db().exec(
      `INSERT INTO app_staff (id, app_id, user_id, is_lead, created_at)
       VALUES ('AS_1', '${IDS.victimApp}', '${IDS.staffUser}', 1, '2026-01-01');`
    )
  })

  // THE NARROWING, AS AN ASSERTION. This is the sentence that used to say the
  // opposite ("disappears for a colleague who is not on it"), and it is here in
  // its reversed form on purpose: the row-hiding fence shipped, the owner read it
  // and asked for less, and a test that merely stopped checking would leave the
  // next person unable to tell a decision from a regression.
  it("is still VISIBLE to a colleague who is not on it", async () => {
    const { apps, body } = await appsFor(OUTSIDER)
    expect(victim(apps), "you can see the app exists").toBeDefined()
    expect(body).toContain("Bergman dispatch")
  })

  it("withholds its material from them", async () => {
    const { apps, body } = await appsFor(OUTSIDER)
    const app = victim(apps)
    expect(app?.canOpen, "the flag the detail screen refuses on").toBe(false)
    expect(app?.url).toBeNull()
    expect(app?.about).toBeNull()
    expect(app?.staff).toEqual([])
    expect(app?.stakeholders).toEqual([])
    // WHAT IT COSTS US TO RUN is the one a whole agency should not be reading off
    // twenty-eight systems they are not on — R24's neighbourhood.
    expect(app?.toolCostCentsPerMonth).toBeNull()
    // OFF THE WIRE, not merely absent from the typed row: the assertion is on the
    // raw body, because a redaction that only holds in the projection is one a
    // network tab walks straight past.
    expect(body).not.toContain("dispatch.example")
    expect(body).not.toContain("42000")
  })

  it("keeps its material for the person who IS on it", async () => {
    const { apps } = await appsFor(IDS.staffUser)
    const app = victim(apps)
    expect(app?.canOpen).toBe(true)
    expect(app?.url).toBe("https://dispatch.example")
    expect(app?.toolCostCentsPerMonth).toBe(42000)
    expect(app?.staff.length, "and the rota it is fenced by").toBe(1)
  })

  // R16: a badge may never disagree with the list under it. Both run through the
  // same WHERE, and since the fence moved off the query onto the row, that WHERE
  // is now the same one for everybody — so the two callers see the same total.
  // The count is the easy thing to forget when a fence moves, which is why it is
  // asserted on the commit that moved it.
  it("is counted for everybody, because everybody can see it", async () => {
    const outsider = await appsFor(OUTSIDER)
    const insider = await appsFor(IDS.staffUser)
    expect(outsider.total).toBe(outsider.apps.length)
    expect(insider.total).toBe(insider.apps.length)
    expect(outsider.total, "same rows, different material").toBe(insider.total)
  })
})
