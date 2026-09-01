// THE RELATIONSHIP MAP, on the two things a drawing like this gets wrong.
//
// The fence is not here — the door removes an edge whose far end the caller may
// not read, both ends checked, and does not count it either
// (workers/content/test/record-map.test.ts). This component draws what it is
// given. What IT can get wrong is everything about being a picture:
//
//   1. A FORCE SIMULATION IS ANIMATION. The layout runs to convergence BEFORE
//      the first paint and the settled positions are what is drawn, so there is
//      no convergence to watch, for anybody. A reader with a vestibular disorder
//      gets the same map as everybody else rather than a quieter version of it,
//      and there is no second code path to drift.
//   2. POSITION IS THE INFORMATION, AND POSITION DOES NOT NARRATE. Focusable
//      circles are necessary and nowhere near sufficient: a screen reader handed
//      this control gets a bag of names and no relationships. So the same payload
//      is rendered a second time as sentences, REACHABLE rather than hidden —
//      a text equivalent nobody without a screen reader can find is one nobody
//      ever checks, and it is also the only rendering you can click to GO
//      somewhere, because a line between two circles is not a link.

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { layout, RelationshipMap } from "@/components/relationship-map"

afterEach(cleanup)

const NODES = [
  { table: "apps", id: "APP", label: "Dispatch" },
  { table: "accounts", id: "ACC", label: "Mapland GmbH" },
  { table: "help", id: "T1", label: "The screen logs drivers out" },
]
const LINKS = [
  { from: "apps:APP", to: "accounts:ACC", relation: "is built for" },
  { from: "help:T1", to: "apps:APP", relation: "is about" },
]

const draw = (over: Partial<React.ComponentProps<typeof RelationshipMap>> = {}) =>
  render(
    <RelationshipMap
      teamId="TEAM"
      focus={NODES[0]}
      nodes={NODES}
      links={LINKS}
      total={2}
      capped={false}
      {...over}
    />
  )

describe("the layout is settled before anything is painted", () => {
  it("is deterministic — the same map twice, not a new arrangement each visit", () => {
    const a = layout(NODES, LINKS, "apps:APP")
    const b = layout(NODES, LINKS, "apps:APP")
    expect(a.map((n) => [n.key, Math.round(n.x), Math.round(n.y)])).toEqual(
      b.map((n) => [n.key, Math.round(n.x), Math.round(n.y)])
    )
  })

  it("pins the focus at the centre — the map may not lose its own subject", () => {
    const placed = layout(NODES, LINKS, "apps:APP")
    const focus = placed.find((n) => n.key === "apps:APP")
    expect(Math.round(focus!.x)).toBe(500)
    expect(Math.round(focus!.y)).toBe(320)
  })

  it("separates the nodes it is given — a picture, not a pile", () => {
    const placed = layout(NODES, LINKS, "apps:APP")
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++)
        expect(
          Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y),
          `${placed[i].label} and ${placed[j].label} are on top of each other`
        ).toBeGreaterThan(30)
  })

  it("draws no animation at all — not a reduced one, none", () => {
    const { container } = draw()
    // BY ITS OWN NAME, NOT BY `querySelector("svg")`. The first svg on this
    // screen is the zoom-out BUTTON'S ICON, so the obvious selector asserted
    // that an icon has no motion class — a check that passed with the map
    // animating, which is the vacuous shape this file exists to avoid. Caught by
    // mutating the component and watching the test stay green.
    const map = container.querySelector('svg[role="img"]')
    expect(map, "the map itself is drawn").toBeTruthy()
    expect(map!.querySelectorAll("circle").length, "…with its nodes in it").toBe(NODES.length)
    // A class that animates would have to appear somewhere in the drawn subtree.
    // `motion-safe:` is the shape that LOOKS like it honours the query and still
    // moves for everybody else; both are refused here, because the settled
    // layout means there is nothing to move.
    expect(map!.outerHTML).not.toMatch(/motion-|animate-|transition-/)
  })
})

describe("the same map, as sentences", () => {
  it("renders one readable line per link, in the edge's own words", () => {
    const { container } = draw()
    const text = container.textContent ?? ""
    expect(text).toContain("Dispatch is built for Mapland GmbH")
    expect(text).toContain("The screen logs drivers out is about Dispatch")
  })

  it("and each destination is a real link, reachable and not hidden", () => {
    const { container } = draw()
    const links = [...container.querySelectorAll("a[href]")]
    expect(links.length, "a line between two circles is not a link; a sentence is").toBe(2)
    expect(links.map((a) => a.getAttribute("href"))).toContain("/t/TEAM/accounts/ACC")
    // NOT HIDDEN. `sr-only`, `hidden` or `aria-hidden` here would make this a
    // text equivalent nobody without a screen reader can find — and therefore
    // one nobody checks.
    for (const a of links) {
      expect(a.closest("[aria-hidden='true']")).toBeNull()
      expect(a.closest(".sr-only")).toBeNull()
    }
  })

  it("says so plainly when there is nothing to draw", () => {
    const { container } = draw({ nodes: [NODES[0]], links: [], total: 0 })
    expect(container.textContent).toContain("Nothing is linked to this yet.")
  })

  it("and says so when it is showing only the closest few", () => {
    // A map that draws forty of three hundred and does not say so has answered a
    // different question.
    const { container } = draw({ capped: true, total: 312 })
    expect(container.textContent).toContain("312")
    expect(container.textContent).toMatch(/closest few/)
  })
})
