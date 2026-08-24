// A NESTED ADDRESS KEEPS ITS TRAIL — the half of deep linking that was parsed
// and then thrown away.
//
// THE OWNER'S REPORT, 24 Aug 2026: "when I click into related records, instead
// of opening in a nested format, it just goes to that page and opens that link,
// so there's no way to go back and see my breadcrumbs or nesting."
//
// He was right, and it was broken at BOTH ends of the same feature:
//
//   • `parseScreenPath` has always returned an ARRAY of levels — the grammar
//     supported `/accounts/BERG/stories/S12` from the beginning. `parseRoute`
//     read `levels[0]` and dropped the rest, so a nested address parsed
//     perfectly and then rendered the OUTERMOST screen.
//   • and the panels never built one anyway: they stripped the collection
//     segment off the path (`basePath.replace(/\/accounts$/, "")`) before
//     appending, so opening a story from a client deliberately left the client
//     behind.
//
// Half a feature at each end is why this reads as "we cannot resolve it" — each
// half looks reasonable on its own and neither one works without the other.
//
// These lock the parsing half. The DEEPEST level is what renders, because that
// is what the person asked for; the trail is kept because that is what says
// where they asked for it from.

import { describe, expect, it } from "vitest"

import { parseRoute } from "@/components/deep-link/route"

describe("a flat address still means exactly what it did", () => {
  it("a collection", () => {
    const r = parseRoute("/accounts", "")
    expect(r.module).toBe("accounts")
    expect(r.recordId).toBe("")
    expect(r.topLevel).toBe(true)
  })

  it("one record", () => {
    const r = parseRoute("/accounts/BERG", "")
    expect(r.module).toBe("accounts")
    expect(r.recordId).toBe("BERG")
    expect(r.levels).toEqual([{ module: "accounts", id: "BERG" }])
  })

  it("a team-scoped record", () => {
    const r = parseRoute("/t/TEAM1/dropdowns/V1", "")
    expect(r.teamId).toBe("TEAM1")
    expect(r.module).toBe("dropdowns")
    expect(r.recordId).toBe("V1")
    expect(r.topLevel).toBe(false)
  })

  it("the team overview", () => {
    const r = parseRoute("/t/TEAM1", "")
    expect(r.teamId).toBe("TEAM1")
    expect(r.module, "an empty path is the team overview").toBe("team")
    expect(r.recordId).toBe("")
  })
})

describe("a nested address renders the innermost level and remembers the way in", () => {
  it("a story opened from a client shows the STORY", () => {
    const r = parseRoute("/accounts/BERG/stories/S12", "")
    // What you clicked is what you get. Reading levels[0] showed the account.
    expect(r.module).toBe("stories")
    expect(r.recordId).toBe("S12")
  })

  it("…and still knows it was opened inside that client", () => {
    const r = parseRoute("/accounts/BERG/stories/S12", "")
    expect(r.levels).toEqual([
      { module: "accounts", id: "BERG" },
      { module: "stories", id: "S12" },
    ])
  })

  it("three deep works too — nothing caps the trail", () => {
    const r = parseRoute("/accounts/BERG/apps/A1/processes/P9", "")
    expect(r.module).toBe("processes")
    expect(r.recordId).toBe("P9")
    expect(r.levels).toHaveLength(3)
    expect(r.levels[0]).toEqual({ module: "accounts", id: "BERG" })
  })

  it("the team-scoped form nests the same way, and keeps the team", () => {
    const r = parseRoute("/t/TEAM1/accounts/BERG/stories/S12", "")
    expect(r.teamId).toBe("TEAM1")
    expect(r.module).toBe("stories")
    expect(r.recordId).toBe("S12")
    expect(r.levels).toHaveLength(2)
    expect(r.topLevel).toBe(false)
  })

  it("a nested COLLECTION lands on the collection, inside its parent", () => {
    // "/accounts/BERG/stories" — every story of this client, rather than one.
    const r = parseRoute("/accounts/BERG/stories", "")
    expect(r.module).toBe("stories")
    expect(r.recordId).toBe("")
    expect(r.levels[0], "the client is still the way in").toEqual({ module: "accounts", id: "BERG" })
  })

  it("the query survives nesting", () => {
    const r = parseRoute("/accounts/BERG/stories/S12", "?panel=edit")
    expect(r.module).toBe("stories")
    expect(r.query).toBeTruthy()
  })
})
