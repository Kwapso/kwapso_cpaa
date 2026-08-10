// THE MACHINE SURFACE IS THE AGENCY'S. A client-portal login must not mint a
// personal access token, and a token must not act for one.
//
// The finding this locks: a client-portal contact IS an ordinary team member —
// grant → invite → accept is the only way to make a working portal login. So
// "are you signed in?" never told the two apart, and a client who signed in at
// the AGENCY address could mint a token and call `list_learning` /
// `export_learning_csv` with their Client role's rights: every internal how-to
// article, in full, as a CSV. Nothing was bypassed. The gate ran and passed —
// the reason those articles are safe is that the client's own gateway REFUSES
// that door, and the machine surface had no door-level opinion at all.
//
// Driven through the worker's real handlers, with tenancy answering the way the
// real door does: `{ kind: "staff" | "portal", accounts, currentAccountId }`.

import { describe, expect, it } from "vitest"

import worker from "../src/index"
import { sessionCookieFor } from "../src/lib/bridge"
import { requireStaff } from "../src/lib/staff"

/** Tenancy's portal-standing answer, as the real door shapes it. */
const standing = (kind: "staff" | "portal", ok = true) => ({
  fetch: async () =>
    new Response(JSON.stringify(kind === "staff" ? { kind: "staff", accounts: [], currentAccountId: null } : { kind: "portal", accounts: [{ id: "A1", name: "Bergman S.A." }], currentAccountId: "A1" }), {
      status: ok ? 200 : 503,
    }),
})

/** Just enough env for the token-minting door: whoAmI answers from AUTH, the
 * core DB is never reached because the refusal lands first. */
function env(kind: "staff" | "portal", tenancyOk = true) {
  let inserted = 0
  return {
    env: {
      DB: {
        prepare: () => ({
          bind: () => ({
            run: async () => {
              inserted++
              return { meta: { changes: 1 } }
            },
            first: async () => null,
            all: async () => ({ results: [] }),
          }),
        }),
      },
      CF_ACCOUNT_ID: "acct",
      AUTH: {
        fetch: async () =>
          new Response(
            JSON.stringify({
              user: { id: "U1", email: "marta@bergman.example", firstName: "Marta", onboardingComplete: true, currentTeamId: "T1" },
            })
          ),
      },
      TENANCY: standing(kind, tenancyOk),
      CONTENT: { fetch: async () => new Response("{}") },
      DATAOPS: { fetch: async () => new Response("{}") },
      INTERNAL_KEY: "k",
    } as never,
    writes: () => inserted,
  }
}

const mint = (e: { env: never }) =>
  worker.fetch(
    new Request("https://mcp/api/mcp/tokens", {
      method: "POST",
      headers: { Cookie: "kwapso_session=x", "Content-Type": "application/json" },
      body: JSON.stringify({ label: "CI importer" }),
    }),
    e.env
  )

describe("minting a token: staff only", () => {
  it("a client-portal login is refused, and no token row is written", async () => {
    const e = env("portal")
    const res = await mint(e)
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error: string }).error).toBe("portal_login")
    expect(e.writes(), "a refused mint must not reach the INSERT").toBe(0)
  })

  it("staff still mint normally (the refusal is a fence, not a wall)", async () => {
    const res = await mint(env("staff"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { secret?: string }
    expect(body.secret).toMatch(/^kwapso_mcp_[0-9a-f]{64}$/)
  })

  it("the answer is read BEFORE the label — a refusal costs no work", async () => {
    // A body that would fail validation still comes back as the 403, not a 400:
    // proof the standing check runs first.
    const res = await worker.fetch(
      new Request("https://mcp/api/mcp/tokens", {
        method: "POST",
        headers: { Cookie: "kwapso_session=x", "Content-Type": "application/json" },
        body: JSON.stringify({ label: "" }),
      }),
      env("portal").env
    )
    expect(res.status).toBe(403)
  })
})

// A token that already exists — minted before the grant, or minted before this
// rule existed — must stop working the moment its owner becomes a client. The
// refusal therefore lives where a tool call gets its session, not only at the
// mint door: a per-tool check would be a list, and a list is a thing a new tool
// can be missing from.
describe("acting with a token: staff only, on every session it mints", () => {
  const token = (id: string) =>
    ({ id, user_id: "U1", team_id: "T1", label: "l", created_at: "", expires_at: "9999-01-01", last_used_at: null, revoked_at: null })

  /** auth mints the team-pinned session; tenancy says whose it is. */
  const bridgeEnv = (kind: "staff" | "portal") =>
    ({
      AUTH: { fetch: async () => new Response(JSON.stringify({ token: "sess" })) },
      TENANCY: standing(kind),
      INTERNAL_KEY: "k",
    }) as never

  it("refuses to bridge a session for a client-portal login", async () => {
    await expect(sessionCookieFor(bridgeEnv("portal"), token("TK_PORTAL") as never)).rejects.toMatchObject({
      status: 403,
      code: "portal_login",
    })
  })

  it("caches nothing on a refusal — the next call asks again rather than holding a cookie it may not use", async () => {
    const refused = bridgeEnv("portal")
    await expect(sessionCookieFor(refused, token("TK_TWICE") as never)).rejects.toMatchObject({ code: "portal_login" })
    await expect(sessionCookieFor(refused, token("TK_TWICE") as never)).rejects.toMatchObject({ code: "portal_login" })
  })

  it("staff get their bridged cookie", async () => {
    await expect(sessionCookieFor(bridgeEnv("staff"), token("TK_STAFF") as never)).resolves.toBe(
      "kwapso_session=sess"
    )
  })
})

describe("requireStaff fails closed", () => {
  it("refuses when tenancy can't answer — never assumes staff", async () => {
    await expect(requireStaff(env("staff", false).env, "kwapso_session=x")).rejects.toMatchObject({
      status: 502,
      code: "standing_unknown",
    })
  })

  it("refuses an answer with no `kind` at all (an older door, a proxy, a truncated body)", async () => {
    const e = { TENANCY: { fetch: async () => new Response(JSON.stringify({ accounts: [], currentAccountId: null })) } }
    await expect(requireStaff(e as never, "kwapso_session=x")).rejects.toMatchObject({ code: "portal_login" })
  })

  it("lets staff through", async () => {
    await expect(requireStaff(env("staff").env, "kwapso_session=x")).resolves.toBeUndefined()
  })
})
