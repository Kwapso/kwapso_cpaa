// THE SPINE IS OFFERED DURING ONBOARDING, AND SKIPPING IT WRITES NOTHING.
//
// Client ruling, 2026-09-02, verbatim: "default spine to mango, but everyone
// can change it during the onboarding or anytime at settings". Two halves, and
// this suite locks the half a screen can get wrong in silence.
//
// WHAT IS ACTUALLY AT RISK HERE, and why it is a suite rather than a glance:
//
// 1. THE DEFAULT ITSELF. `DEFAULT_SPINE` was paper until this ruling, on a
//    written argument that a person who never opened Settings should keep the
//    rail they always had. The argument was overruled, not forgotten
//    (shared/spine.ts keeps it), and a value that was reversed once by a person
//    is the kind that gets reversed back by a merge.
//
// 2. TAKING THE DEFAULT MUST WRITE NOTHING. `users.spine` NULL means "never
//    chosen" and is kept distinct from a deliberate mango, exactly as `scale`
//    and `language` are. A screen that posted the value it happened to be
//    showing would destroy that distinction for every person who ever onboards
//    — and it would do it invisibly, because the rail would look identical.
//
// 3. THE CHOICE RIDES THE ONE SUBMIT, AND GOES FIRST. Settings saves on press
//    because it can revert a failure into a screen the person is still standing
//    on; onboarding has no such screen, and the two calls after it are the
//    expensive ones (`updateProfile` mints a new R2 key for the photo every
//    run, `bootstrap` ACCEPTS pending invites). So the cheap reversible call
//    goes first and a refusal costs one retry with nothing left behind. Order
//    is a property no type can hold, which is why it is asserted here.
//
// Driven through the real component and the real submit, like its sibling
// `onboarding-dead-ends.test.tsx`: the risk is in what this page DOES with an
// ordinary answer, never in a helper.

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const replace = vi.fn()
// ONE router object, not a fresh one per call. The real `useRouter` is stable,
// and this screen's boot effect depends on it — hand back a new literal each
// render and the effect re-runs on every keystroke and every card press,
// re-reading `me` and putting the person's own edits back to what the server
// said. That is a property of the mock, not of the screen, and it would make
// this suite pass or fail on render timing rather than on behaviour.
const router = { replace }
vi.mock("next/navigation", () => ({ useRouter: () => router }))

const me = vi.fn()
const active = vi.fn()
const bootstrap = vi.fn()
const updateProfile = vi.fn()
const setSpine = vi.fn()

vi.mock("@/lib/api", async () => {
  const real = await vi.importActual<typeof import("@shared/web/api")>("@shared/web/api")
  return {
    ApiFailure: real.ApiFailure,
    auth: {
      me: () => me(),
      updateProfile: (i: unknown) => updateProfile(i),
      setSpine: (s: string) => setSpine(s),
    },
    tenancy: { active: () => active(), bootstrap: () => bootstrap() },
  }
})
vi.mock("@shared/ui/components/sonner/sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

import { DEFAULT_SPINE, toSpine } from "@shared/spine"
import OnboardingPage from "@/app/onboarding/page"

const fresh = {
  id: "u1",
  email: "someone@kwapso.app",
  firstName: "",
  lastName: "",
  imageUrl: null,
  onboardingComplete: false,
  currentTeamId: null,
  spine: null,
}

/** THE SPINE CARDS, AND ONLY THOSE. The `ModeToggle` pinned to the top-right of
 * this screen is a radiogroup too (Light / Dark / System), so an unscoped role
 * query returns six radios and three of them are the wrong control. Scoped to
 * the form, which the toggle sits outside of. */
function spineCards(): HTMLElement[] {
  const form = document.querySelector("form")
  if (!form) throw new Error("the onboarding form is not on screen")
  return within(form as HTMLElement).getAllByRole("radio")
}

/** One card, by the word a person reads on it. */
function card(label: string): HTMLElement {
  const found = spineCards().find((r) => (r.textContent ?? "").startsWith(label))
  if (!found) throw new Error(`no spine card labelled ${label}`)
  return found
}

const checkedOf = (label: string) => card(label).getAttribute("aria-checked")

/** Fill the name and press Continue, the way a person does. By TYPE, because
 * the photo picker renders a button of its own and a name match finds two. */
async function fillAndSubmit() {
  await screen.findByLabelText(/first name/i)
  fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Alaap" } })
  fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Kanchwala" } })
  const submit = document.querySelector("form button[type=submit]")
  if (!submit) throw new Error("the onboarding form has no submit button")
  fireEvent.click(submit)
}

beforeEach(() => {
  vi.clearAllMocks()
  cleanup()
  me.mockResolvedValue({ user: fresh })
  active.mockResolvedValue({ teams: [] })
  bootstrap.mockResolvedValue({ teams: [{ id: "t1" }] })
  updateProfile.mockResolvedValue({})
  setSpine.mockResolvedValue({})
})

describe("the ruling's first half — mango is what an unset spine means", () => {
  it("is the fallback, so a person who never chooses lands on the brand rail", () => {
    expect(DEFAULT_SPINE).toBe("mango")
    expect(toSpine(null)).toBe("mango")
    expect(toSpine(undefined)).toBe("mango")
    // …and an unrecognised value still costs a rail, never a screen.
    expect(toSpine("not-a-spine")).toBe("mango")
  })
})

describe("the ruling's second half — the choice is on the onboarding screen", () => {
  it("draws all three, with the default already set", async () => {
    render(<OnboardingPage />)
    await screen.findByLabelText(/first name/i)

    expect(spineCards()).toHaveLength(3)
    expect(checkedOf("Mango")).toBe("true")
    expect(checkedOf("Ink")).toBe("false")
    expect(checkedOf("Paper")).toBe("false")
  })

  it("opens on the spine this person already has, not on the default", async () => {
    me.mockResolvedValue({ user: { ...fresh, spine: "ink" } })
    render(<OnboardingPage />)
    await screen.findByLabelText(/first name/i)

    expect(checkedOf("Ink")).toBe("true")
  })
})

describe("what the submit posts", () => {
  it("writes NOTHING when the person just takes the default", async () => {
    render(<OnboardingPage />)
    await fillAndSubmit()

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1))
    // The whole point: `users.spine` stays null, so "never chosen" survives.
    expect(setSpine).not.toHaveBeenCalled()
  })

  it("writes nothing when they press the card that is already set", async () => {
    render(<OnboardingPage />)
    await screen.findByLabelText(/first name/i)
    fireEvent.click(card("Mango"))
    await fillAndSubmit()

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1))
    expect(setSpine).not.toHaveBeenCalled()
  })

  it("saves a moved choice, once, as part of the same press", async () => {
    render(<OnboardingPage />)
    await screen.findByLabelText(/first name/i)
    fireEvent.click(card("Ink"))
    // Pressing a card must not save on its own — that is Settings' contract,
    // and here it would persist a preference for somebody who may walk away
    // from a form they have not finished.
    expect(setSpine).not.toHaveBeenCalled()

    await fillAndSubmit()
    await waitFor(() => expect(setSpine).toHaveBeenCalledWith("ink"))
    expect(setSpine).toHaveBeenCalledTimes(1)
  })

  it("saves the spine BEFORE the photo upload and the invite acceptance", async () => {
    render(<OnboardingPage />)
    await screen.findByLabelText(/first name/i)
    fireEvent.click(card("Paper"))
    await fillAndSubmit()

    await waitFor(() => expect(bootstrap).toHaveBeenCalled())
    // The cheap, reversible call first: a refusal there leaves no orphaned R2
    // object and no already-accepted invitation behind it.
    expect(setSpine.mock.invocationCallOrder[0]).toBeLessThan(
      updateProfile.mock.invocationCallOrder[0]
    )
    expect(updateProfile.mock.invocationCallOrder[0]).toBeLessThan(
      bootstrap.mock.invocationCallOrder[0]
    )
  })

  it("stops the submit when the spine cannot be saved, before anything else runs", async () => {
    setSpine.mockRejectedValue(new Error("nope"))
    render(<OnboardingPage />)
    await screen.findByLabelText(/first name/i)
    fireEvent.click(card("Ink"))
    await fillAndSubmit()

    await waitFor(() => expect(setSpine).toHaveBeenCalled())
    expect(updateProfile).not.toHaveBeenCalled()
    expect(bootstrap).not.toHaveBeenCalled()
    // Still on the form, still able to press again — nothing to recover from.
    expect(replace).not.toHaveBeenCalled()
    expect(document.querySelector("form button[type=submit]")).not.toBeNull()
  })
})
