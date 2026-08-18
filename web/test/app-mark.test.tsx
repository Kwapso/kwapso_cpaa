// AN APP'S SQUARE DEGRADES TO THE MARK, NEVER TO A BROKEN-IMAGE GLYPH.
//
// The apps screen is a wall of tiles because an app is the one record a person
// recognises by sight, so the square is the whole screen's subject. Which makes
// the failure case worth a test rather than a shrug: `logoUrl` being SET is not
// the same fact as the bytes still being there, and the difference between the
// two on screen is a grid of grey torn-paper icons.
//
// It will happen. A stored path survives its object (nothing reclaims an app's
// old logo yet), the column also accepts a URL somebody pastes by hand, and the
// migration that filled it (`scripts/glide-visuals.mjs`) carries pictures from an
// account that is being cancelled. `null` is the easy half and a null check
// catches it; a 404 is the half that needs `onError`.
//
// The other claim here is the pair: the fallback is the SAME stage mark the tile
// drew before the column existed, so a logo that fails leaves the screen exactly
// as it was rather than blank.

import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { AppMark } from "@/components/app-tiles"
import type { AppRow } from "@shared/types"

afterEach(cleanup)

/** An app row with only the fields the mark reads — the rest is noise here. */
const app = (over: Partial<AppRow> = {}): AppRow =>
  ({
    id: "AP1",
    accountId: null,
    name: "Fuhrpark",
    url: null,
    stage: null,
    logoUrl: null,
    toolCostCentsPerMonth: 0,
    about: null,
    clientContext: null,
    solution: null,
    keyActors: null,
    canOpen: true,
    staff: [],
    stakeholders: [],
    active: true,
    createdAt: "2026-08-18",
    createdByName: null,
    updatedAt: null,
    editedByName: null,
    ...over,
  }) as AppRow

describe("the square an app is known by", () => {
  it("shows the logo when there is one", () => {
    const { container } = render(<AppMark app={app({ logoUrl: "/media/T/apps/01AAA" })} />)
    const img = container.querySelector("img")
    expect(img, "a stored path renders as a picture").not.toBeNull()
    expect(img?.getAttribute("src")).toBe("/media/T/apps/01AAA")
  })

  it("falls back to the mark when the picture fails to load", () => {
    const { container } = render(
      <AppMark app={app({ logoUrl: "/media/T/apps/01GONE", stage: "Live", name: "Fuhrpark" })} />
    )
    fireEvent.error(container.querySelector("img") as HTMLImageElement)

    expect(container.querySelector("img"), "the broken picture must be taken off the page").toBeNull()
    expect(
      container.textContent,
      "and the square keeps something in it — the stage mark, or the app's initial"
    ).not.toBe("")
  })

  it("shows the same thing with no logo as with a broken one", () => {
    const none = render(<AppMark app={app({ stage: "Live" })} />).container.textContent

    cleanup()
    const broken = render(<AppMark app={app({ stage: "Live", logoUrl: "/media/T/apps/01GONE" })} />)
    fireEvent.error(broken.container.querySelector("img") as HTMLImageElement)

    expect(
      broken.container.textContent,
      "a logo that fails leaves the screen exactly as it was before the column existed"
    ).toBe(none)
  })

  it("refuses a scheme safeSrc would not allow, without waiting for it to fail", () => {
    // A `data:` URL is the shape the door exists to prevent reaching the column,
    // and `javascript:` is the shape a pasted value could be. Neither may reach
    // `src` at all — the mark stands in from the first render, not after an error.
    for (const hostile of ["data:image/png;base64,AAAA", "javascript:alert(1)"]) {
      const { container } = render(<AppMark app={app({ logoUrl: hostile, stage: "Live" })} />)
      expect(container.querySelector("img"), `${hostile} must never reach src`).toBeNull()
      cleanup()
    }
  })
})
