// AN OUTAGE IS NOT A SIGN-OUT.
//
// Earned on 2026-08-14. The owner rotated the Cloudflare API token; that token
// is the CF_D1_TOKEN secret on eight worker deployments, so every read over the
// D1 REST door started failing. Sign-in itself stayed healthy — the auth worker
// reaches the core database through its own native binding and never touches
// that token — so the shape of the failure was this:
//
//   sign in  ->  succeeds  ->  /home  ->  GET /api/tenancy/active 500s
//            ->  session cleared, bounced to /login  ->  sign in again  ->  loop
//
// Three people were locked out of a working application for forty minutes, and
// because one of them was mid-form when the token died, it read as "submitting
// the form logged me out". Nothing was wrong with any of their accounts.
//
// The defect was one bare `catch` in use-active-team.ts that could not tell a
// 401 from a 500 and treated both as "you are signed out". The distinction is
// the whole fix, and it is what this file pins:
//
//   401           -> really signed out -> clear the session, go to /login
//   500/503/other -> the app is unwell -> keep the session, stay put
//
// The second line is the one that matters. Sending a signed-in person to a
// sign-in door that works cannot fix a data door that doesn't; it just hides an
// outage behind what looks like an account problem, which is the most expensive
// way to be wrong about a five-minute fix.

import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const replace = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }))

const me = vi.fn()
const active = vi.fn()
vi.mock("@/lib/api", () => ({
  auth: { me: () => me() },
  tenancy: { active: () => active() },
}))

const user = {
  id: "u1",
  email: "aurora@kwapso.com",
  firstName: "Aurora",
  lastName: "Thalassa",
  imageUrl: null,
  onboardingComplete: true,
  currentTeamId: "t1",
}
const withTeam = {
  team: { id: "t1", name: "Kwapso" },
  role: null,
  memberCount: 3,
  teams: [{ id: "t1", name: "Kwapso" }],
}

/** The hook caches the session at MODULE level, so a test that wants a COLD
 * start has to reset the module registry — otherwise the previous test's
 * session is still there and the case under test never runs.
 *
 * AND IT MUST HAND BACK `ApiFailure` FROM THE SAME GRAPH. `resetModules` gives
 * the hook a fresh copy of every module it imports, including the one that
 * declares ApiFailure — so a class imported at the top of this file is a
 * DIFFERENT class object from the one the hook is testing `instanceof` against,
 * and every `instanceof` inside the hook quietly returns false. That is not a
 * curiosity: it made three of these four tests pass for the wrong reason on the
 * first run. They asserted "does not redirect", and the hook was not redirecting
 * because its type check was failing, not because it had recognised a server
 * error. The one test that could not be faked this way — the 401 that MUST
 * redirect — is what exposed it. Same graph, or these tests measure nothing. */
async function freshHook() {
  vi.resetModules()
  const [hook, api] = await Promise.all([
    import("@/lib/use-active-team"),
    import("@shared/web/api"),
  ])
  return { useActiveTeam: hook.useActiveTeam, ApiFailure: api.ApiFailure }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("a failing API is not a signed-out person", () => {
  it("a 500 from the active-team door does NOT bounce to /login", async () => {
    const { useActiveTeam: hook, ApiFailure } = await freshHook()
    me.mockResolvedValue({ user })
    active.mockRejectedValue(new ApiFailure(500, "internal", "Something went wrong on our side."))

    renderHook(() => hook())

    await waitFor(() => expect(active).toHaveBeenCalled())
    // The exact regression: forty minutes of a healthy sign-in door being
    // offered as the cure for a broken data door.
    expect(replace, "a server error must never send a signed-in person to /login").not.toHaveBeenCalledWith("/login")
  })

  it("a 503 cloud_key_rejected — the real outage code — does not bounce either", async () => {
    const { useActiveTeam: hook, ApiFailure } = await freshHook()
    me.mockResolvedValue({ user })
    // This is the code the workers now return when the Cloudflare token has been
    // rotated away (shared/workers/d1-rest.ts). It is the honest name for what
    // happened, and it is emphatically not a sign-out.
    active.mockRejectedValue(
      new ApiFailure(503, "cloud_key_rejected", "Kwapso can't reach its databases right now.")
    )

    renderHook(() => hook())

    await waitFor(() => expect(active).toHaveBeenCalled())
    expect(replace).not.toHaveBeenCalledWith("/login")
  })

  it("a 401 still signs you out — the fix must not break the real case", async () => {
    const { useActiveTeam: hook, ApiFailure } = await freshHook()
    me.mockRejectedValue(new ApiFailure(401, "unauthenticated", "Sign in to continue."))

    renderHook(() => hook())

    // Without this the fix would be "never sign anybody out", which is worse
    // than the bug it replaces.
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"))
  })

  it("a cached session keeps painting through an outage, instead of emptying", async () => {
    const { useActiveTeam: hook, ApiFailure } = await freshHook()
    // Paint once, successfully — this is what fills the module-level cache.
    me.mockResolvedValue({ user })
    active.mockResolvedValue(withTeam)
    const first = renderHook(() => hook())
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    expect(first.result.current.ctx?.team?.name).toBe("Kwapso")

    // Now the token dies underneath a person who is already working.
    active.mockRejectedValue(new ApiFailure(503, "cloud_key_rejected", "Can't reach the databases."))
    const second = renderHook(() => hook())

    await waitFor(() => expect(second.result.current.loading).toBe(false))
    // CACHING.md is cache-first: the screens they already have keep working and
    // only writes fail. Clearing here is what made the app look destroyed rather
    // than briefly unwell.
    expect(second.result.current.user, "an outage must not empty the session").not.toBeNull()
    expect(replace).not.toHaveBeenCalledWith("/login")
  })

  // SABOTAGE: remove the try/catch from `refresh` →
  //   × a background refresh during the outage does not become a second error
  //     AssertionError: promise rejected "Error: Something went wrong on our
  //     side. { …(2) }" instead of resolving
  it("a background refresh during the outage does not become a second error", async () => {
    const { useActiveTeam: hook, ApiFailure } = await freshHook()
    me.mockResolvedValue({ user })
    active.mockResolvedValue(withTeam)
    const view = renderHook(() => hook())
    await waitFor(() => expect(view.result.current.loading).toBe(false))

    // A live ping arrives mid-outage. app-shell.tsx calls this as
    // `void active.refresh()` — six times over — so a rejection here reaches
    // `unhandledrejection`, and the global reporter beacons it into the central
    // error store as a BROWSER crash. The server had already logged the same
    // failure from its own side; the second row explains nothing and costs a
    // slot in a table with an hourly ceiling.
    active.mockRejectedValue(new ApiFailure(500, "internal", "Something went wrong on our side."))
    await expect(view.result.current.refresh()).resolves.toBeUndefined()

    // …and the failed top-up left the session it could not refresh alone.
    expect(view.result.current.user).not.toBeNull()
    expect(replace).not.toHaveBeenCalledWith("/login")
  })
})
