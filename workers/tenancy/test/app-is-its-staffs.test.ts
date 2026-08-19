// AN APP WITH PEOPLE ON IT BELONGS TO THEM.
//
// THE RULING (owner, 19 Aug 2026), answering "should the agency side be fenced
// too — any team member with the apps right sees every app, including its
// running cost?": "yes of course."
//
// WHAT WAS THERE BEFORE. Staffing was a FIELD redaction and not a fence: every
// team member holding `processes:read` saw every app in the agency — its name,
// its client, its stage, its logo, its monthly running cost and its audit block
// — and being on the app only added the URL, four prose fields and the two
// people lists. It was a projection inside a `.map()` with NO TEST, which is
// exactly the shape a refactor drops in silence. That absence is why this file
// exists as much as the new rule is.
//
// THE MEASUREMENT THAT SHAPED IT. On staging: 28 live apps, and exactly TWO with
// anybody staffed on them. A straight "you see only what you are on" fence would
// have hidden 26 of 28 systems on the day it shipped — a wall, and a wall gets
// switched off. So an app with NOBODY on it is not a secret, it is unassigned:
// it stays visible, and the fence closes around it the moment somebody is put on
// it. That degrades in the right direction — the more the rota is filled in, the
// tighter it gets — and nothing has to be back-filled for the app to keep working.
//
// A CLIENT LOGIN IS NOT SUBJECT TO IT. The account fence has already decided
// which apps they may see, and every one is their own system; staffing is OUR
// rota, and applying it to them would hide a client's own app because none of
// our people had been assigned yet.

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

const call = (userId: string) =>
  worker.fetch(
    new Request("https://tenancy/api/tenancy/apps", {
      headers: { Cookie: "session=x" },
    }),
    makeEnv(() => db(), userId) as never
  )

async function appsFor(userId: string): Promise<{ ids: string[]; total: number; body: string }> {
  const res = await call(userId)
  const body = await res.text()
  const parsed = JSON.parse(body) as { apps: { id: string }[]; total: number }
  return { ids: parsed.apps.map((a) => a.id), total: parsed.total, body }
}

/** A second staff member who is on nothing — the person this rule is about. */
const OUTSIDER = "U_STAFF_OUTSIDER"

beforeEach(() => {
  holder.db = buildSpineDb()
  // A colleague with the same rights and none of the assignments. Given a NON
  // default role, because `is_default = 1` is what marks the locked Admin role
  // and an admin is meant to see everything.
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
  it("is visible to a colleague who is not on it — unassigned is not secret", async () => {
    const { ids } = await appsFor(OUTSIDER)
    expect(ids, "an app with no rota is everybody's until somebody is put on it").toContain(IDS.victimApp)
  })
})

describe("an app somebody IS on", () => {
  beforeEach(() => {
    db().exec(
      `INSERT INTO app_staff (id, app_id, user_id, is_lead, created_at)
       VALUES ('AS_1', '${IDS.victimApp}', '${IDS.staffUser}', 1, '2026-01-01');`
    )
  })

  it("disappears for a colleague who is not on it", async () => {
    const { ids, body } = await appsFor(OUTSIDER)
    expect(ids, "an app with a rota belongs to its rota").not.toContain(IDS.victimApp)
    // NOT MERELY REDACTED — the row itself is gone. A 200 that names the app and
    // strips its fields still tells you the system exists, who it is for and
    // what it is called.
    expect(body).not.toContain("Bergman dispatch")
  })

  it("still reaches the person who IS on it", async () => {
    const { ids } = await appsFor(IDS.staffUser)
    expect(ids).toContain(IDS.victimApp)
  })

  // R16: a badge may never advertise rows the list refuses to show. The count
  // and the list ran through the same WHERE before this change and they still
  // do — which is the assertion, because the count is the easy thing to forget
  // when a filter moves from the payload into the query.
  it("is not counted for somebody who cannot see it", async () => {
    const outsider = await appsFor(OUTSIDER)
    const insider = await appsFor(IDS.staffUser)
    expect(outsider.total).toBe(outsider.ids.length)
    expect(insider.total).toBe(insider.ids.length)
    expect(insider.total, "the person on the app sees more of them").toBeGreaterThan(outsider.total)
  })
})
