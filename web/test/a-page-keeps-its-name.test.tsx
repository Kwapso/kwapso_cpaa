// A PAGE KEEPS ITS NAME, even when a counted tab strip takes its count.
//
// THE BUG, found by the owner on 30 Aug 2026. The Sprints screen had no title
// at all — the tab strip, then the rows, and nothing saying what page you were
// on. Accounts, Tickets, Tasks, Meetings and Apps were the same. Six of the
// app's fourteen screens were anonymous.
//
// HIS QUESTION WAS THE BETTER HALF: how did this get past rules this strict?
//
// It got past them because it OBEYED them. R16 says a collection shows its count
// exactly once, and `CollectionHeading` implemented the arbitration as
// `if (standsDown) return null` — which satisfies that sentence perfectly, and
// takes the title and the glyph with it. No law anywhere said a page must have a
// name, so nothing objected, and a screen losing its own name is invisible to a
// check that is counting counts.
//
// The distinction this file locks is small and exact: the BADGE stands down, the
// HEADING does not.

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { CollectionHeading } from "@/components/collection-heading"
import { CountedAbove } from "@/components/counted-tabs"

afterEach(cleanup)

describe("a collection screen says what it is", () => {
  it("shows its name AND its count when nothing else counts", () => {
    render(<CollectionHeading sectionKey="sprints" total={110} />)
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Sprints")
    expect(screen.getByText("110")).toBeTruthy()
  })

  it("KEEPS ITS NAME when a counted tab strip owns the count", () => {
    // `CountedAbove active` is the arbitration a tabbed screen switches on. This
    // is the exact configuration the Sprints screen shipped in.
    render(
      <CountedAbove active>
        <CollectionHeading sectionKey="sprints" total={110} />
      </CountedAbove>
    )
    const h1 = screen.queryByRole("heading", { level: 1 })
    expect(h1, "a tabbed screen is still a page and a page has a name").not.toBeNull()
    expect(h1?.textContent).toContain("Sprints")
  })

  it("…and gives the count up, so it is still said exactly once (R16)", () => {
    render(
      <CountedAbove active>
        <CollectionHeading sectionKey="sprints" total={110} />
      </CountedAbove>
    )
    // The strip above says 110. The heading must not say it a second time —
    // that is the law this arbitration exists for, and it is still kept.
    expect(screen.queryByText("110"), "the strip owns the count").toBeNull()
  })
})
