// THE THREE WAYS ONBOARDING USED TO TRAP SOMEBODY, all in one screen and all
// invisible from the server side, because every door involved was answering
// correctly and this page was not reading the answer.
//
// 1. FINISHING WITH NO TEAM. Team creation is closed product-wide
//    (TEAM_CREATION_CLOSED), so `bootstrap` succeeds and returns an EMPTY team
//    list for anybody with no invitation waiting. The page sent them to /home
//    regardless; /home found no team and sent them back here; for ever, with no
//    error to read. Reported as "it takes me into the main home screen and then
//    pushes me back to onboarding no matter what I try", and the reason it was
//    hard to see is that nothing failed.
//
// 2. A CLIENT LOGIN FINISHING. Their invitation email is built from the AGENCY's
//    address for everybody, so a client arrives here. `bootstrap` accepts their
//    invite — they really do join — and then refuses to describe the agency to a
//    client login (R21, `client_login`). The page showed that refusal as a red
//    toast on a form that could never complete.
//
// 3. A CLIENT LOGIN COMING BACK. `active` refuses them the same way, and the
//    page's catch-all treated any failure as "signed out" and bounced them to
//    /login — which bounces to onboarding, which bounces to /login.
//
// Each test drives the real component through the real submit, because the bug
// was never in a helper: it was in what this page did with an ordinary answer.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const replace = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }))

const me = vi.fn()
const active = vi.fn()
const bootstrap = vi.fn()
const updateProfile = vi.fn()
const error = vi.fn()

vi.mock("@/lib/api", async () => {
  const real = await vi.importActual<typeof import("@shared/web/api")>("@shared/web/api")
  return {
    ApiFailure: real.ApiFailure,
    auth: { me: () => me(), updateProfile: (i: unknown) => updateProfile(i) },
    tenancy: { active: () => active(), bootstrap: () => bootstrap() },
  }
})
vi.mock("@shared/ui/controls/sonner/sonner", () => ({
  toast: { error: (m: string) => error(m) },
}))

import { ApiFailure } from "@shared/web/api"
import OnboardingPage from "@/app/onboarding/page"

const fresh = {
  id: "u1",
  email: "someone@kwapso.app",
  firstName: "",
  lastName: "",
  imageUrl: null,
  onboardingComplete: false,
  currentTeamId: null,
}
const returning = { ...fresh, firstName: "Alaap", lastName: "K", onboardingComplete: true }

/** The refusal every agency door gives a client login. */
const clientLogin = () =>
  new ApiFailure(403, "client_login", "This sign-in is a client login — your company's work is on the client portal.")

/** Fill the form and press the button, the way a person does. */
async function fillAndSubmit() {
  await screen.findByLabelText(/first name/i)
  fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Alaap" } })
  fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Kanchwala" } })
  // By TYPE, not by name: the photo picker renders a button of its own, so a
  // name match finds two and the query throws before the test can start.
  const submit = document.querySelector("form button[type=submit]")
  if (!submit) throw new Error("the onboarding form has no submit button")
  fireEvent.click(submit)
}

beforeEach(() => {
  // Not decoration. Without it the previous test's screen is still in the
  // document, `querySelector` below finds ITS form, and a test happily drives a
  // component that is no longer the one under test — which is exactly what
  // happened, and it passed the wrong assertion while doing it.
  cleanup()
  replace.mockClear()
  error.mockClear()
  updateProfile.mockReset().mockResolvedValue({})
  me.mockReset().mockResolvedValue({ user: fresh })
  active.mockReset()
  bootstrap.mockReset()
})

describe("onboarding never leaves somebody with nowhere to go", () => {
  it("does NOT send you to the app when finishing produced no team", async () => {
    // The exact shape of the reported loop: nothing throws, and the answer is
    // an empty list.
    bootstrap.mockResolvedValue({ teams: [], currentTeamId: null })
    render(<OnboardingPage />)
    await fillAndSubmit()

    await waitFor(() => expect(bootstrap).toHaveBeenCalled())
    expect(
      replace,
      "sending a teamless person to /home is the loop — /home has nothing to show them and sends them straight back"
    ).not.toHaveBeenCalledWith("/home")
    // And they are told what happened rather than left on a form that did nothing.
    expect(await screen.findByText(/not in a team/i)).toBeTruthy()
  })

  it("still sends you to the app when a team really is waiting", async () => {
    // The other half — a fix that never navigates would be its own bug.
    bootstrap.mockResolvedValue({ teams: [{ id: "t1", name: "Kwapso" }], currentTeamId: "t1" })
    render(<OnboardingPage />)
    await fillAndSubmit()
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/home"))
  })

  it("tells a client login they are at the wrong door instead of failing their form", async () => {
    bootstrap.mockRejectedValue(clientLogin())
    render(<OnboardingPage />)
    await fillAndSubmit()

    expect(await screen.findByText(/client portal/i)).toBeTruthy()
    expect(
      error,
      "their invite was ACCEPTED before that refusal — a red toast says the opposite of what happened"
    ).not.toHaveBeenCalled()
    expect(replace, "and there is nowhere in this app to send them").not.toHaveBeenCalled()
  })

  it("does not bounce a returning client login to the sign-in page", async () => {
    me.mockResolvedValue({ user: returning })
    active.mockRejectedValue(clientLogin())
    render(<OnboardingPage />)

    expect(await screen.findByText(/client portal/i)).toBeTruthy()
    expect(
      replace,
      "/login sends them back here, which sends them back to /login — the refusal is not a signed-out session"
    ).not.toHaveBeenCalledWith("/login")
  })

  it("still treats a genuinely signed-out session as signed out", async () => {
    // The guard on the guard: reading ONE code specially must not swallow the
    // case the catch-all was there for.
    me.mockResolvedValue({ user: returning })
    active.mockRejectedValue(new ApiFailure(401, "signed_out", "Not signed in."))
    render(<OnboardingPage />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"))
  })
})
