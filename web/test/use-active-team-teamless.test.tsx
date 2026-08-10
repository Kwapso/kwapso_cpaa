// What the shell shows when a person stops belonging anywhere.
//
// Being removed from your last team clears the shared session cache and bounces
// you to /onboarding. That bounce is a CLIENT navigation, so there is a window
// where the shell is still mounted with no person and no team behind it. It used
// to keep `loading` false through that window and paint a hollow shell — an
// empty nav and a profile button with no identity — which is what "the profile
// button seems broken" turned out to be. The rule locked here: no session means
// loading, exactly as it does on the very first render.
//
// The order matters and is the whole point. A cold render was ALREADY loading,
// so it proves nothing; the regression only shows itself once a session has been
// cached and painted, and a background revalidate then takes it away. This test
// paints first, then removes.

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

import { useActiveTeam } from "@/lib/use-active-team"

const user = {
  id: "u1",
  email: "someone@kwapso.app",
  firstName: "Alaap",
  lastName: "K",
  imageUrl: null,
  onboardingComplete: true,
  currentTeamId: "t1",
}
const withTeam = {
  team: { id: "t1", name: "Kwapso" },
  role: null,
  memberCount: 2,
  teams: [{ id: "t1", name: "Kwapso" }],
}
const teamless = { team: null, role: null, memberCount: 0, teams: [] }

beforeEach(() => {
  replace.mockClear()
  me.mockResolvedValue({ user })
})

describe("a person removed from their last team", () => {
  it("stops painting the shell instead of showing one with nobody in it", async () => {
    // 1 · A normal session: the shell has a person and a team, and has painted.
    active.mockResolvedValue(withTeam)
    const painted = renderHook(() => useActiveTeam())
    await waitFor(() => expect(painted.result.current.loading).toBe(false))
    expect(painted.result.current.user?.email).toBe("someone@kwapso.app")

    // 2 · Meanwhile an admin removes them. The next context read says so — and
    // this instance starts from the CACHE, so it renders painted-and-populated
    // before its own revalidate lands. That is the window under test.
    active.mockResolvedValue(teamless)
    const revalidating = renderHook(() => useActiveTeam())
    expect(revalidating.result.current.loading, "starts from the cache").toBe(false)

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding"))

    // 3 · Both instances — the one that revalidated AND the one already on
    // screen — must now show a skeleton, not a shell with nothing in it.
    for (const [which, r] of [
      ["the revalidating instance", revalidating],
      ["the instance already on screen", painted],
    ] as const) {
      await waitFor(() => expect(r.result.current.user, `${which}: no person`).toBeNull())
      expect(r.result.current.ctx, `${which}: no team`).toBeNull()
      expect(
        r.result.current.loading,
        `${which}: a shell with no person and no team must render its skeleton, not a hollow nav`
      ).toBe(true)
    }
  })
})
