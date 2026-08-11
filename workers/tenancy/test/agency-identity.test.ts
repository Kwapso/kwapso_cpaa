// THE AGENCY'S OWN IDENTITY IS NOT SERVED TO A CLIENT LOGIN — including out of
// the two doors that answer with the team ROWS rather than the team CONTEXT.
//
// `GET /api/tenancy/active` was closed against a client login because it answers
// with the team's name, its logo, the caller's role title and the agency's member
// count. Its own comment records why the refusal had to live on the door: the
// portal gateway refuses to forward it, the AGENCY gateway forwards by prefix,
// and a client login is an ordinary team member.
//
// Then two siblings kept answering. `GET /api/tenancy/teams` and the onboarding
// bootstrap both hand back `TeamSummary[]` — the name and the logo again, plus
// `dbStatus`, an internal provisioning state. Two of the five fields `/active`
// was closed for, out of the doors either side of it, to the same person, at the
// same origin. Both carried an R21 exemption whose reason ("the caller's own
// membership list") is true about the QUESTION and silent about the ANSWER.
//
// Staff must still get all of it, or the refusal is just an outage.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
import { CLIENT_REACHABLE_EXEMPT } from "@shared/rules/registry"
import { buildSpineDb, IDS, makeEnv, req } from "./spine-harness"

const db = () => holder.db as DatabaseSync

beforeEach(() => {
  holder.db = buildSpineDb()
  db().exec("UPDATE users SET current_team_id = 'T';")
})

/** Every door that hands back the agency's team rows, and the person asking. */
const TEAM_ROW_DOORS = ["GET /api/tenancy/teams", "POST /api/tenancy/bootstrap"] as const

describe("the team-row doors refuse a client login", () => {
  for (const door of TEAM_ROW_DOORS) {
    it(`${door} — 403, not a trimmed answer`, async () => {
      const res = await worker.fetch(req(door), makeEnv(db, IDS.burglarUser))
      expect(res.status).toBe(403)
      expect(((await res.json()) as { error: string }).error).toBe("client_login")
    })

    it(`${door} — and the refusal is what stops the disclosure, not a lucky empty row`, async () => {
      const res = await worker.fetch(req(door), makeEnv(db, IDS.burglarUser))
      const text = await res.text()
      // The three fields the sweep named, checked as VALUES in the response body.
      expect(text, "the agency's name").not.toContain("Kwapso")
      expect(text, "the agency's internal provisioning state").not.toContain("db_status")
      expect(text).not.toContain("dbStatus")
    })

    it(`${door} — staff still get the whole answer`, async () => {
      const res = await worker.fetch(req(door), makeEnv(db, IDS.staffUser))
      expect(res.status).toBe(200)
      const body = (await res.json()) as { teams: { name: string; dbStatus: string }[] }
      expect(body.teams.map((t) => t.name)).toContain("Kwapso")
      expect(body.teams[0].dbStatus).toBeTruthy()
    })
  }

  // R21's deny-list is a RATCHET: a line in front of a door that now refuses is
  // an excuse nobody is using, and it reads as a decision somebody made on
  // purpose. Both of these had one, and the reason each gave was a sentence about
  // the question rather than about the answer.
  it("and neither door carries an R21 exemption any more", () => {
    for (const door of TEAM_ROW_DOORS)
      expect(
        Object.keys(CLIENT_REACHABLE_EXEMPT),
        `${door} refuses a client login now — its exemption is an excuse nobody uses`
      ).not.toContain(door)
  })
})
