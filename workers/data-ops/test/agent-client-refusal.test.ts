// THE ASSISTANT IS AN AGENCY TOOL, AND IT SAYS SO AT ITS OWN DOORS (R21).
//
// The portal gateway forwards no /api/data-ops path at all, and its table says
// why: "import, the assistant and the machine surface are agency tools. The
// portal spends none of the team's AI allowance." That sentence was true of the
// portal hostname and false everywhere else — the AGENCY gateway forwards by
// prefix, a client login is an ordinary team member, and every sibling door in
// data-ops had already learned this (import.ts refuses a portal caller in six
// places). The six agent doors were the only ones that had not — SEVEN now: the
// translate button spends the same allowance and is refused the same way.
//
// And the role was never going to stop them. The DEFAULT Viewer template ships
// `agent: read + create` (workers/tenancy/src/team-schema.ts), so an owner who
// builds a client role the obvious way — clone Viewer, untick the obvious things
// — hands it over without deciding to. That is why the fixture below GRANTS the
// agent right to the client role before it knocks: if a green result depended on
// the right being absent, this suite would be asserting that a role was built
// carefully, which is exactly the thing a defence must not rest on.
//
// R21 (web/test/rules.test.ts, "client-reachable-doors") is the law; this is the
// same statement made against a real SQLite database through the shipped worker,
// because a source scan proves a call is written and not that a caller is turned
// away.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker, { ROUTES } from "../src/index"
import { buildSpineDb, IDS, makeEnv } from "../../tenancy/test/spine-harness"

const db = () => holder.db as DatabaseSync

const env = (userId: string) =>
  ({ ...(makeEnv(() => db(), userId) as unknown as Record<string, unknown>), INTERNAL_KEY: "k" }) as never

function call(userId: string, route: string, query = "") {
  const [method, path] = route.split(" ")
  return worker.fetch(
    new Request(`https://data-ops${path}${query}`, {
      method,
      headers: { Cookie: "session=x", "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify({ threadId: "TH", message: "hello", approve: true }),
    }),
    env(userId)
  )
}

/** Every agent door, read off the worker's OWN route table rather than retyped —
 * a seventh one added tomorrow is covered the day it lands. */
const AGENT_DOORS = Object.keys(ROUTES).filter((r) => r.includes("/agent/"))

beforeEach(() => {
  holder.db = buildSpineDb()
  // THE RIGHT IS GRANTED, ON PURPOSE. The shared fixture's grantAll covers the
  // spine's own modules and stops there, so without this the client role would
  // hold no `agent` right and every 403 below could be the ordinary permission
  // refusal wearing the fence's clothes. Granted to BOTH roles, because the staff
  // control has to get through the same gate the client is stopped in front of.
  db().exec(
    `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete) VALUES
       ('${IDS.adminRole}_agent', '${IDS.adminRole}', 'agent', 1, 1, 1, 1),
       ('${IDS.clientRole}_agent', '${IDS.clientRole}', 'agent', 1, 1, 1, 1);`
  )
})

describe("a client login never reaches the agency's assistant", () => {
  it("finds the agent doors (the scan must not go blind)", () => {
    expect(AGENT_DOORS.length, "data-ops serves seven agent doors").toBe(7)
  })

  // THE CONTROL, FIRST. Every refusal below is a status code, and a door that is
  // broken for everyone returns a status code too. This one proves the door
  // works, that the fixture's agent right is real, and that the SQLite harness is
  // genuinely answering — so the refusals mean refusal and not rubble.
  it("staff get through: the door, the right and the harness all work", async () => {
    const res = await call(IDS.staffUser, "GET /api/data-ops/agent/threads")
    expect(res.status, "a staff member with agent:read reads their own conversations").toBe(200)
    expect((await res.json()) as { threads: unknown[] }).toEqual({ threads: [] })
  })

  it("the client role really does hold the agent right (or the refusals prove nothing)", () => {
    const row = db()
      .prepare("SELECT can_read, can_create FROM role_permissions WHERE role_id = ? AND module = 'agent'")
      .get(IDS.clientRole) as { can_read: number; can_create: number } | undefined
    expect(row, "the fixture must grant the client role the agent right").toBeDefined()
    expect([row?.can_read, row?.can_create]).toEqual([1, 1])
  })

  for (const door of AGENT_DOORS) {
    it(`${door} refuses a client login`, async () => {
      // IDS.victimUser is a real portal user: an ordinary team_members row AND a
      // live portal_users grant. That is what a client login IS at the agency
      // origin — nothing about the request marks it as coming from the portal.
      const res = await call(IDS.victimUser, door, door.endsWith("/thread") ? "?id=TH" : "")
      expect(res.status, `${door} answered a client login`).toBe(403)
      expect((await res.json()) as { error: string }).toMatchObject({ error: "client_login" })
    })
  }

  it("the refusal lands BEFORE the AI allowance is touched", async () => {
    // The whole cost argument: a client login that reaches `chat` spends the
    // team's quota. The env here binds no AI at all, so a turn that actually ran
    // could not answer 403 with the fence's own code — it would crash first.
    const res = await call(IDS.victimUser, "POST /api/data-ops/agent/chat")
    expect(res.status).toBe(403)
    expect((await res.json()) as { error: string; message: string }).toMatchObject({ error: "client_login" })
  })
})
