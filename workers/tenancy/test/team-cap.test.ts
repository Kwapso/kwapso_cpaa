// ONE TEAM. Kwapso is a single agency on a base built for many tenants, so the
// create-a-team machinery exists in the code and would otherwise be reachable
// from three places at once: the sidebar, the API, and onboarding — which used
// to mint a private team for anyone who simply signed in. A second team is an
// empty world with its own database, its own roles and none of the customer
// data, and nobody would mean to make one.
//
// Closed means closed on every surface a person or a program can ask through.
// These tests hold each of the three shut, and hold the ops door — the one that
// needs the deployment's ADMIN_KEY and no session at all — open, because a fresh
// environment still has to be seeded and the smoke still has to prove that a
// token pinned to one team cannot read another.
//
// (The per-user cap that used to live here is now unreachable, so its tests went
// with it. The cap itself stays in the route: it is the guard that applies the
// moment TEAM_CREATION_CLOSED is ever flipped back.)

import { beforeEach, describe, expect, it, vi } from "vitest"

import { TEAM_CREATION_CLOSED } from "@shared/product"

const created: string[] = []
vi.mock("../src/context", () => ({
  whoAmI: vi.fn(async () => ({ id: "u1", email: "a@b.c", firstName: "A", onboardingComplete: true })),
  toActor: (u: { id: string }) => ({ id: u.id, email: "a@b.c", name: "A" }),
  teamContext: vi.fn(),
  adminGuard: () => null,
}))
vi.mock("../src/lib/teams", () => ({
  createTeam: vi.fn(async (_e: unknown, _a: unknown, name: string) => {
    created.push(name)
    return { id: "t1", name }
  }),
  d1Config: () => ({}),
  getActiveContext: async () => ({ ok: true }),
  listMyTeams: async () => [],
  acceptPendingInvites: async () => 0,
  switchTeam: async () => true,
  getTeamMeta: async () => ({}),
  updateTeamDetails: async () => undefined,
  applyMigration: async () => undefined,
}))

const { createNamedTeam, bootstrap } = await import("../src/routes/team")
const { adminCreateTeam } = await import("../src/routes/admin")

/** An env whose users table answers with one signed-in person. */
const env = () =>
  ({
    DB: {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () =>
            sql.includes("FROM users")
              ? { id: "u1", email: "a@b.c", first_name: "A", last_name: null, current_team_id: null }
              : { n: 0 },
          all: async () => ({ results: [] }),
          run: async () => ({ meta: { changes: 0 } }),
        }),
        first: async () => null,
      }),
    },
  }) as never

const post = (path: string, body: unknown) =>
  new Request(`https://x${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

beforeEach(() => (created.length = 0))

describe("one team: creation is closed on every surface", () => {
  it("is actually closed (the tests below mean nothing otherwise)", () => {
    expect(TEAM_CREATION_CLOSED).toBe(true)
  })

  it("refuses the API door — the same answer a person, the agent or a token gets", async () => {
    // Everything reaches this handler through the same gateway, so one refusal
    // covers all three surfaces the owner named.
    const res = await createNamedTeam(post("/api/tenancy/teams", { name: "Another team" }), env())
    expect(res.status).toBe(403)
    expect((await res.json()) as { error: string }).toMatchObject({ error: "team_creation_closed" })
    expect(created, "no database may be provisioned by a refused request").toHaveLength(0)
  })

  it("refuses BEFORE reading the body, so a malformed name can't change the answer", async () => {
    const res = await createNamedTeam(post("/api/tenancy/teams", { name: { not: "a string" } }), env())
    expect(res.status, "not a 400 about the name — the door is shut regardless").toBe(403)
    expect(created).toHaveLength(0)
  })

  it("onboarding no longer mints a team for someone with no invite", async () => {
    // The quiet one: this path had no button and no permission check, it just
    // ran. A stranger who signed in used to land in a private world of their own.
    const res = await bootstrap(post("/api/tenancy/bootstrap", {}), env())
    expect(res.status).toBe(200)
    expect(created, "no invite, no team").toHaveLength(0)
  })

  it("the ops door still seeds one — it needs the admin key, never a session", async () => {
    const res = await adminCreateTeam(
      post("/api/tenancy/admin/create-team", { name: "Seeded", email: "a@b.c" }),
      env()
    )
    expect(res.status).toBe(200)
    expect(created, "a fresh environment must still be standable").toEqual(["Seeded"])
  })
})
