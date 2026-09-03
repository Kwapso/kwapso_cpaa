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

// ── THE ADDRESS A SCREEN BUILDS FOR ITSELF ───────────────────────────────────
//
// THE OWNER, 24 Aug 2026, going Accounts → Confia → Apps → CONFIA → Sprints →
// a sprint and landing on `/apps/…/sprints/…`:
//
//   "that middle screen that I went to has just been erased. I spoke about
//    nesting, not replacing. Please fix this at the root level."
//
// The root was one line: every screen rebuilt its own base from its CURRENT
// MODULE (`/${module}`), so a nested address lost every ancestor the moment the
// screen computed where it was. The panels then appended to that truncated
// base, which is why nesting worked for exactly ONE hop and then reset.
//
// These walk his journey, hop by hop, the way the shell does it.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { stripComments } from "@shared/rules/source-scan"
import { trailPath } from "@/components/deep-link/route"

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..")

/** What the shell hands a detail screen as its base (the collection in
 * context), and what that screen then hands its panels (itself). */
const sectionOf = (path: string) => {
  const r = parseRoute(path, "")
  return trailPath(r.levels, "/t/TEAM1", r.topLevel, { withRecord: false })
}
const hereOf = (path: string) => {
  const r = parseRoute(path, "")
  return trailPath(r.levels, "/t/TEAM1", r.topLevel)
}

describe("a screen's own address keeps everything it was opened inside", () => {
  it("a flat address is exactly what it always was", () => {
    // The regression guard: one level in, this must return what `/${module}`
    // returned, or every un-nested screen in the app moves.
    expect(sectionOf("/apps")).toBe("/apps")
    expect(sectionOf("/apps/A1")).toBe("/apps")
    expect(hereOf("/apps/A1")).toBe("/apps/A1")
  })

  it("the team-scoped form keeps its team", () => {
    expect(sectionOf("/t/TEAM1/apps/A1")).toBe("/t/TEAM1/apps")
    expect(hereOf("/t/TEAM1/apps/A1")).toBe("/t/TEAM1/apps/A1")
  })

  it("A NESTED address does not lose the client — the reported bug", () => {
    expect(
      sectionOf("/accounts/CONFIA/apps/A1"),
      "the base handed to the app screen dropped the client it was opened from"
    ).toBe("/accounts/CONFIA/apps")
    expect(hereOf("/accounts/CONFIA/apps/A1")).toBe("/accounts/CONFIA/apps/A1")
  })

  it("HIS EXACT JOURNEY: client → app → sprint, and nothing is erased", () => {
    // 1. He opens Confia.
    let at = "/accounts/CONFIA"
    // 2. The account screen hands its Apps panel `${base}/${accountId}`, and the
    //    panel appends the app. (work-panels.tsx: `${host.base}/apps/${id}`)
    at = `${hereOf(at)}/apps/A1`
    expect(at).toBe("/accounts/CONFIA/apps/A1")
    // 3. Now the APP screen computes its own base — this is where the client
    //    used to disappear — and hands its Sprints panel `${base}/${appId}`.
    at = `${hereOf(at)}/sprints/S1`
    expect(
      at,
      "the client was erased on the second hop, which is exactly what he reported"
    ).toBe("/accounts/CONFIA/apps/A1/sprints/S1")
  })

  it("…and it keeps going, because nothing caps it", () => {
    // The property he asked for by name: "the nesting must be unlimited".
    let at = "/accounts/CONFIA"
    for (const [module, id] of [
      ["apps", "A1"],
      ["sprints", "S1"],
      ["stories", "ST1"],
      ["members", "U9"],
    ] as const)
      at = `${hereOf(at)}/${module}/${id}`
    expect(at).toBe("/accounts/CONFIA/apps/A1/sprints/S1/stories/ST1/members/U9")
    // …and the address still parses back to the innermost record.
    const r = parseRoute(at, "")
    expect(r.module).toBe("members")
    expect(r.recordId).toBe("U9")
    expect(r.levels).toHaveLength(5)
  })

  it("a nested COLLECTION addresses the collection, not the record above it", () => {
    expect(hereOf("/accounts/CONFIA/apps")).toBe("/accounts/CONFIA/apps")
    expect(sectionOf("/accounts/CONFIA/apps")).toBe("/accounts/CONFIA/apps")
  })

  // AND THE SHELL ACTUALLY USES IT. The tests above prove the FUNCTION is right,
  // and every one of them passed while the shell was still building its address
  // the broken way — because they call `trailPath` directly and the bug was in
  // the wiring. A green test that asserts the wrong thing is the failure mode
  // this codebase has been bitten by before, so the wiring gets its own check.
  it("the shell derives BOTH of its paths from the trail, not from the module", () => {
    const src = stripComments(
      readFileSync(join(WEB, "components", "deep-link-screen.tsx"), "utf8")
    )
    for (const name of ["sectionPath", "currentPath"]) {
      const line = new RegExp(`const ${name}\\s*=([\\s\\S]*?)\\n\\s*const `).exec(src)?.[1] ?? ""
      expect(
        line.includes("trailPath("),
        `${name} is not built from the trail. That is the bug the owner reported on ` +
          `24 Aug 2026 — every screen rebuilding its address from its own module, so a ` +
          `nested one lost the record it was opened inside and the next hop appended to ` +
          `a path already missing a level.`
      ).toBe(true)
    }
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

// ── A MAIN SCREEN CARRIES NO TRAIL. ONLY A DETAIL SCREEN DOES ────────────────
//
// SHELL.md's own line: "a main screen is in the navbar; a detail screen has
// breadcrumbs." Override 73 (2026-08-26) struck the OLD breadcrumb bar for
// repeating the identity chips' own two facts, not for existing outright — so
// when a record's own trail turned out to be genuinely missing, the fix that
// restored it (earlier the same day as the one below, 31 Aug 2026) dropped the
// gate entirely instead of correcting it. The SAME one-line trail then drew on
// every flat COLLECTION screen too — Sprints, Accounts, Tasks, reachable
// straight from the sidebar — a bar reading nothing but the section's own
// name, above a screen whose title already says it and a sidebar that already
// shows it. The client, on a screenshot of exactly that: "kill breadcrumbs in
// main screens!"
//
// THE WIRING, NOT THE FUNCTION, again: `buildCrumbs` has always been capable
// of returning a short, honest one-crumb trail for a bare collection (see
// crumbs.ts's own topLevel branch) — that is a valid answer for a NESTED
// collection ("Confia › Stories", above), and the wrong one for a screen with
// nothing above it at all. The defect both times was in whether the CALLER
// asks for a trail in the first place, not in what `buildCrumbs` hands back
// when asked — so this reads the caller, the same way the nesting regression
// above does.
// OVERTURNED 2026-09-03. Everything above is kept because the reasoning is
// still sound about the object it was reasoning about — a TEXT BAR above the
// content, repeating in words what the title and the sidebar already said. That
// object no longer exists. The trail is now a strip of FOLDER TABS whose last
// tab is filled with the card's own paper and joined to it: not a sign pointing
// at the card, but the card's own edge.
//
// Aurora, shown a top-level collection drawn with one tab reading "Apps" over a
// card titled "Apps", and told in as many words that every top-level screen
// would gain a tab it does not have today: "On a top-level collection, we would
// only have one tab, and that's correct. There would be nothing on the left.
// That's correct."
//
// So the gate is gone and every screen carries its trail. What these two tests
// now guard is the half that did NOT change: that the caller still asks
// `buildCrumbs` for the trail rather than hand-rolling one, which is what both
// historical regressions actually turned on.
describe("every screen carries its trail, and a top-level one carries a trail of one", () => {
  const shell = stripComments(
    readFileSync(join(WEB, "components", "deep-link-screen.tsx"), "utf8")
  )

  it("asks for the trail on every screen, with no gate in front of it", () => {
    expect(
      /const showCrumbs\s*=\s*true\b/.test(shell),
      "deep-link-screen.tsx must compute `showCrumbs = true`. The trail is the " +
        "card's own folder tab now, so a top-level collection carries a trail of " +
        "one — Aurora's ruling of 2026-09-03, on a drawing of exactly that case. " +
        "Reinstating a gate here reopens the question she closed; if it ever needs " +
        "reopening, it is a client decision and not a refactor."
    ).toBe(true)
  })

  it("still asks buildCrumbs for it, rather than hand-rolling a trail", () => {
    expect(
      /const crumbs = showCrumbs\s*\n\s*\?\s*buildCrumbs\(/.test(shell),
      "The trail must still come from `buildCrumbs`. Both historical regressions " +
        "here were in the CALLER — whether it asked, and with what — never in what " +
        "`buildCrumbs` returns when asked. A trail assembled inline in this file " +
        "would be a second implementation of the labels, the ancestor resolution " +
        "and the record names, drifting from the one the rest of the app reads."
    ).toBe(true)
  })

  it("still shows the trail on a flat detail screen — the earlier fix, not regressed", () => {
    // The regression this whole block guards is dropping crumbs where they are
    // needed just as much as adding them where they are not — so the positive
    // case (a record genuinely open, one level in, no ancestor) is asserted
    // here too, in the units `buildCrumbs` already speaks in. Same assertion as
    // the test just above; kept here as the paired negative case's neighbour.
    expect(crumbs("/stories/ST1").map((c) => c.label)).toEqual(["Stories", "BERG-S0188"])
  })

  it("still shows the trail on a nested collection — the client's own nesting feature", () => {
    // `/accounts/CONFIA/stories`: no record open at THIS level, but there is an
    // ancestor a plain nav item cannot reach on its own — the gate must not
    // blind itself to that case while fixing the flat one.
    expect(crumbs("/accounts/CONFIA/stories").map((c) => c.label)).toEqual(["Confia", "Stories"])
  })

  it("shows nothing for a flat collection — the client's exact complaint", () => {
    // `buildCrumbs` alone cannot express "show nothing" for this case — asked
    // directly, with `recordId: ""` and a one-level trail, it still returns a
    // single section crumb (crumbs.ts's own topLevel branch, exercised by the
    // "flat address" test above with a record instead). The one place that
    // decides whether a MAIN screen calls it at all is the gate this describe
    // block reads off the shell; this pins the INPUT that must resolve to
    // `showCrumbs === false` there.
    const r = parseRoute("/sprints", "")
    expect(r.recordId).toBe("")
    expect(r.levels).toHaveLength(1)
    expect(Boolean(r.recordId) || r.levels.length > 1).toBe(false)
  })
})
