// WHAT A CLIENT SEES ON THEIR FIRST DAY — the portal's half of the cold walk.
//
// The agency half is web/test/cold-account.test.tsx; this is the same walk at
// the other front door, and it locks the one finding of the 2026-09-05 fresh-
// eyes review that belongs here.
//
// F12 · R50 COULD NOT SEE THIS SCREEN. "Never toolbar on an empty collection,
// not even the create button" is enforced through `<ToolbarRow>`'s and
// `<PagedFind>`'s required `empty` prop — and this screen draws its own search
// row instead, deliberately (the law is about the FUNCTION being present, and
// the two front doors are different shapes, UI-RULEBOOK L5). So the enforcement
// was structurally blind to it: a client with zero tickets got a search box
// over an empty list and a lone icon-only "+" floating above it, which is
// precisely the shape R50 was written after it recurred eight times on the
// agency door. Nothing was red, because nothing was looking.
//
// THE ACT DOES NOT VANISH, IT MOVES. Taking the "+" away without putting the
// act somewhere would be the worse bug — a client's whole reason for opening
// the portal is to ask us something. It is now a labelled button in the empty
// body, which is composition 27.21's own carved-out exception to "+ actions
// never have a word", and the same trade the agency door already makes.
//
// EVERY ABSENCE HERE IS PROVED AGAINST A POSITIVE FIRST. `queryByPlaceholderText`
// returning null is exactly what a component that rendered nothing at all looks
// like, so `mustRender` refuses an empty tree and each test finds real copy on
// screen before it believes a thing is missing.

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const tickets = vi.fn()
const raise = vi.fn()
/** The real `ApiFailure` beside the two mocked doors: `RaiseTicketDialog` (which
 * this screen mounts) imports it as a VALUE and catches on it, so a stub would
 * change what the dialog does with an error. */
vi.mock("@/lib/api", async () => {
  const real = await vi.importActual<typeof import("@shared/web/api")>("@shared/web/api")
  return {
    ApiFailure: real.ApiFailure,
    support: { tickets: (...a: unknown[]) => tickets(...a), raise: (i: unknown) => raise(i) },
    appModules: { list: async () => ({ modules: [] }) },
  }
})

import { TicketsScreen } from "@/components/tickets-screen"
import { clearCache } from "@shared/web/store"

const ready = {
  user: { firstName: "Sam" },
  accounts: [{ id: "a1", name: "Acme" }],
  currentAccountId: "a1",
} as never

function mustRender(ui: React.ReactElement) {
  const { container } = render(ui)
  expect(container.textContent?.trim().length ?? 0, "the screen rendered nothing at all").toBeGreaterThan(0)
}

beforeEach(() => {
  clearCache()
  tickets.mockReset()
  raise.mockReset()
})
afterEach(cleanup)

describe("F12 · the portal draws no toolbar over a collection with nothing in it", () => {
  it("hides the search box and the lone +, and offers the act in the body instead", async () => {
    tickets.mockResolvedValue({ tickets: [], total: 0, nextCursor: null })
    mustRender(<TicketsScreen ready={ready} />)

    // THE CANARY: the empty body really drew, so the two absences below are
    // absences rather than a blank render.
    expect(await screen.findByText("Nothing here yet.")).toBeTruthy()

    expect(
      screen.queryByPlaceholderText(/Search your tickets/i),
      "R50: a search box is drawn over a collection with zero rows in it"
    ).toBeNull()

    // The act, named, exactly once — in the body, not as a floating glyph.
    const asks = screen.getAllByText("Ask us something")
    expect(asks.length, "the empty body offers no way to ask us anything").toBe(1)
    expect(
      (asks[0].closest("button") ?? asks[0].closest("[role=button]")) !== null,
      "the empty body names the act in prose but gives nobody anything to press"
    ).toBe(true)
  })

  it("brings the toolbar back the moment there is something to search", async () => {
    tickets.mockResolvedValue({
      tickets: [
        {
          id: "t1",
          ref: "ACME-T0001",
          title: "The invoice screen is slow",
          description: "The invoice screen is slow",
          status: "new",
          createdAt: "2026-09-01T09:00:00.000Z",
          updatedAt: "2026-09-01T09:00:00.000Z",
        },
      ],
      total: 1,
      nextCursor: null,
    })
    mustRender(<TicketsScreen ready={ready} />)
    expect(await screen.findByPlaceholderText(/Search your tickets/i)).toBeTruthy()
    // …and the empty body is gone with it, so the two states cannot both draw.
    expect(screen.queryByText("Nothing here yet.")).toBeNull()
  })
})
