// THE MACHINE SURFACE IS THE AGENCY'S. A client-portal login must not mint a
// personal access token, and a token must not act for one.
//
// The finding this locks: a client-portal contact IS an ordinary team member —
// grant → invite → accept is the only way to make a working portal login. So
// "are you signed in?" never told the two apart, and a client who signed in at
// the AGENCY address could mint a token and call the agency's own reads with
// their Client role's rights: the whole of an internal module, in full, as a
// CSV. Nothing was bypassed. The gate ran and PASSED — the reason that material
// is safe is that the client's own gateway REFUSES those doors, and the machine
// surface had no door-level opinion at all.
//
// (The module it was found on was Learning, which has since been purged. The
// finding was never about articles: it was about a door with no fence, no
// refusal, and a second front entrance nobody had asked the question at.)
//
// Driven through the worker's real handlers, with tenancy answering the way the
// real door does: `{ kind: "staff" | "portal", accounts, currentAccountId }`.

import { readFileSync } from "node:fs"
import { join } from "node:path"
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
    await expect(sessionCookieFor(bridgeEnv("portal"), token("TK_PORTAL") as never, "trace-test")).rejects.toMatchObject({
      status: 403,
      code: "portal_login",
    })
  })

  it("caches nothing on a refusal — the next call asks again rather than holding a cookie it may not use", async () => {
    const refused = bridgeEnv("portal")
    await expect(sessionCookieFor(refused, token("TK_TWICE") as never, "trace-test")).rejects.toMatchObject({ code: "portal_login" })
    await expect(sessionCookieFor(refused, token("TK_TWICE") as never, "trace-test")).rejects.toMatchObject({ code: "portal_login" })
  })

  it("staff get their bridged cookie", async () => {
    await expect(sessionCookieFor(bridgeEnv("staff"), token("TK_STAFF") as never, "trace-test")).resolves.toBe(
      "kwapso_session=sess"
    )
  })
})

// WHAT MAKES THE CACHED VERDICT SAFE — read off the fence's own source, not
// taken on trust.
//
// The bridge caches a PASSED staff check for a minute, so for that minute the
// question "is this caller staff or a client?" is answered from memory. That is
// only sound while the app cannot produce the transition it would miss: a token
// holder who becomes a client. It cannot — and the property that carries it is
// PRESENCE: portal-ness is decided by the existence of ANY `portal_users` row,
// live or revoked, and a revoke keeps the row, so once anyone reads as a client
// they read as one for ever and could never have minted a token at all. (This
// paragraph used to cite the grant door's `is_staff` refusal as the carrier;
// that refusal became CONDITIONAL when re-grants for prior clients shipped, and
// the assertion below survived the change while asserting the wrong intent — a
// green test on a stale premise. Presence is asserted first now, because it is
// the load-bearing half.)
describe("the cached staff verdict has no transition to miss", () => {
  const grantDoor = readFileSync(join(__dirname, "../../tenancy/src/routes/accounts.ts"), "utf8")
  const handler = grantDoor.slice(grantDoor.indexOf("export async function postGrantPortalAccess"))

  it("portal-ness is PRESENCE: the fence reads the row with no liveness filter", () => {
    // The one place the caller's kind is decided (shared/workers/account-scope):
    // any portal_users row for this user — revoked included — answers `portal`.
    const fence = readFileSync(join(__dirname, "../../../shared/workers/account-scope.ts"), "utf8")
    const at = fence.indexOf("FROM portal_users")
    expect(at, "the fence no longer reads portal_users — re-read this check").toBeGreaterThan(-1)
    const where = fence.slice(at, fence.indexOf("[guard.userId]", at))
    expect(where).toMatch(/WHERE user_id = \?/)
    // A liveness condition in the WHERE would turn presence into liveness and
    // reopen the transition (revoke → reads as staff → mints a token). The
    // deactivated column may be SELECTed and ORDERed on — never filtered on.
    expect(
      /WHERE[^;]*deactivated_at IS NULL(?![\s\S]*ORDER)/.test(where.split("ORDER BY")[0].split("WHERE")[1] ?? ""),
      "portal_users must be matched by PRESENCE — no deactivated_at filter in the WHERE"
    ).toBe(false)
    // And the bridge's own gatekeeper refuses anything that is not cleanly staff.
    const staff = readFileSync(join(__dirname, "../src/lib/staff.ts"), "utf8")
    expect(staff).toContain('kind !== "staff"')
  })

  it("the first grant still refuses an active team member (the courtesy half)", () => {
    const body = handler.slice(0, handler.indexOf("\n}\n"))
    // It asks whether the person is a live member of this team…
    expect(body).toMatch(/FROM team_members WHERE team_id = \? AND user_id = \? AND deactivated_at IS NULL/)
    // …and refuses a first grant for them, rather than fencing a colleague out.
    // (CONDITIONAL since re-grants shipped: a prior client's row already decides
    // their kind, so the staff check is skipped for them — presence, above, is
    // what the cache actually rests on.)
    expect(body).toContain('"is_staff"')
    // The refusal comes BEFORE the row is written — a grant that landed and then
    // apologised would still be the wrong order even for a courtesy.
    expect(body.indexOf('"is_staff"')).toBeLessThan(body.indexOf("grantPortalAccess("))
  })

  it("and a token cannot outlive its team membership either (the other half of the pair)", () => {
    // The bridge mints through auth's internal door, which refuses a caller who
    // is no longer an active member — so "reads as a client" and "holds a working
    // token" cannot both be true, whatever the cache remembers.
    const authSrc = readFileSync(join(__dirname, "../../auth/src/index.ts"), "utf8")
    const at = authSrc.indexOf("async function internalMcpSession")
    expect(at, "auth must still own the mint the bridge calls").toBeGreaterThan(-1)
    const mintDoor = authSrc.slice(at, authSrc.indexOf("\n}\n", at))
    expect(mintDoor).toMatch(/FROM team_members WHERE team_id = \? AND user_id = \? AND deactivated_at IS NULL/)
    expect(mintDoor).toContain('"not_a_member"')
    // Refused BEFORE the session exists — a minted-then-checked door would hand
    // out the very cookie this argument says cannot exist.
    expect(mintDoor.indexOf('"not_a_member"')).toBeLessThan(mintDoor.indexOf("createPinnedSession("))
  })
})

describe("requireStaff fails closed", () => {
  it("refuses when tenancy can't answer — never assumes staff", async () => {
    await expect(requireStaff(env("staff", false).env, "kwapso_session=x", "trace-test")).rejects.toMatchObject({
      status: 502,
      code: "standing_unknown",
    })
  })

  it("refuses an answer with no `kind` at all (an older door, a proxy, a truncated body)", async () => {
    const e = { TENANCY: { fetch: async () => new Response(JSON.stringify({ accounts: [], currentAccountId: null })) } }
    await expect(requireStaff(e as never, "kwapso_session=x", "trace-test")).rejects.toMatchObject({ code: "portal_login" })
  })

  it("lets staff through", async () => {
    await expect(requireStaff(env("staff").env, "kwapso_session=x", "trace-test")).resolves.toBeUndefined()
  })
})
