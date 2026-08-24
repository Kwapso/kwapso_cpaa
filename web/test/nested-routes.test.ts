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

// ── THE TRAIL A PERSON READS ─────────────────────────────────────────────────
//
// The owner, 24 Aug 2026, answering which repair he meant and removing the cap:
// "If I share a link where I've gone into an app, then into a sprint, and into a
// ticket, and from that ticket I've gone to a team member, and I share that link
// with someone, they should literally go in through the same nest. They should
// be able to see the breadcrumbs. But the nesting must be unlimited."

import { buildCrumbs } from "@/components/deep-link/crumbs"

const NO_RECORDS = {
  accounts: [{ id: "CONFIA", name: "Confia" }],
  members: undefined,
  roles: [],
  invites: undefined,
  knowledge: undefined,
  apps: [{ id: "A1", name: "CONFIA" }],
  sprints: [{ id: "S1", ref: "BERG-SP12", name: "Sprint 12" }],
  stories: [{ id: "ST1", ref: "BERG-S0188", title: "The story" }],
  tasks: undefined,
  meetings: undefined,
} as never

const crumbs = (path: string) =>
  buildCrumbs({
    topLevel: true,
    module: parseRoute(path, "").module,
    recordId: parseRoute(path, "").recordId,
    levels: parseRoute(path, "").levels,
    teamName: "Kwapso",
    teamPath: "/t/TEAM1",
    sectionPath: "/" + parseRoute(path, "").module,
    records: NO_RECORDS,
    t: (s: string) => s,
  })

describe("the breadcrumb walks the whole way in, however deep", () => {
  it("two levels name the ancestor and the record — and nothing in between", () => {
    // The owner, 24 Aug 2026, on the rung that used to sit here: "it is behaving
    // and showing me the word 'story' like I went to the stories page and then
    // did it". He did not. He opened a client and went in from there, so a rung
    // saying otherwise recites a route nobody walked.
    expect(crumbs("/accounts/CONFIA/stories/ST1").map((c) => c.label)).toEqual([
      "Confia",
      "BERG-S0188",
    ])
  })

  it("no crumb above the record points at the record's OWN page", () => {
    // The same rung was also dead: it linked to the address already open, so
    // clicking it "has no response, no output". Any crumb whose href equals the
    // current path is that bug returning under another name.
    const here = "/accounts/CONFIA/stories/ST1"
    for (const crumb of crumbs(here))
      expect(crumb.href, `${crumb.label} links to the page it is already on`).not.toBe(here)
  })

  it("a nested COLLECTION keeps its name, because there it is the destination", () => {
    // "/accounts/CONFIA/stories" really is this client's stories — the level is
    // a place rather than a description of the record below it.
    expect(crumbs("/accounts/CONFIA/stories").map((c) => c.label)).toEqual(["Confia", "Stories"])
  })

  it("clicking the client goes back to the client", () => {
    const [client] = crumbs("/accounts/CONFIA/stories/ST1")
    expect(client.href, "the first crumb must land on the record it names").toBe("/accounts/CONFIA")
  })

  it("the page you are on is not a link", () => {
    const trail = crumbs("/accounts/CONFIA/stories/ST1")
    expect(trail[trail.length - 1].href, "you are already here").toBeUndefined()
  })

  it("FOUR levels — the owner's own example, uncapped", () => {
    const trail = crumbs("/apps/A1/sprints/S1/stories/ST1/accounts/CONFIA")
    expect(trail.map((c) => c.label)).toEqual([
      "CONFIA",
      "BERG-SP12",
      "BERG-S0188",
      "Confia",
    ])
    // Every step above the last is a link that lands where it says.
    expect(trail[0].href).toBe("/apps/A1")
    expect(trail[1].href).toBe("/apps/A1/sprints/S1")
    expect(trail[2].href).toBe("/apps/A1/sprints/S1/stories/ST1")
  })

  it("a shared link opened cold still shows an unbroken trail", () => {
    // Nothing is loaded yet, so no record can be named. The trail must still
    // have a rung for every level rather than gaps somebody cannot click.
    const trail = buildCrumbs({
      topLevel: true,
      module: "stories",
      recordId: "ST1",
      levels: [
        { module: "accounts", id: "CONFIA" },
        { module: "stories", id: "ST1" },
      ],
      teamName: "Kwapso",
      teamPath: "/t/TEAM1",
      sectionPath: "/stories",
      records: {
        accounts: undefined, members: undefined, roles: [], invites: undefined,
        knowledge: undefined, apps: undefined, sprints: undefined, stories: undefined,
        tasks: undefined, meetings: undefined,
      } as never,
      t: (s: string) => s,
    })
    expect(trail.map((c) => c.label)).toEqual(["Account", "Story"])
    expect(trail[0].href).toBe("/accounts/CONFIA")
  })

  it("a flat address is untouched — one level still means what it meant", () => {
    expect(crumbs("/stories/ST1").map((c) => c.label)).toEqual(["Stories", "BERG-S0188"])
  })
})
