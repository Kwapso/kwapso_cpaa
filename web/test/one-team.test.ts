// The button can't come back on its own.
//
// The server refuses to create a team (workers/tenancy/test/team-cap.test.ts).
// This is the other half: the UI must not OFFER it. A menu item that always ends
// in "this app runs as one team" is worse than no menu item — it advertises a
// feature, then blames the person for wanting it.
//
// Source-scan, like the rule tests, because the thing being checked is that the
// guard is written at all. A component that renders the create path without
// consulting shared/product.ts fails here rather than in someone's sidebar.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { TEAM_CREATION_CLOSED, TEAM_SCREENS_HIDDEN } from "@shared/product"
import { stripComments } from "@shared/rules/source-scan"

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..")
const read = (p: string) => readFileSync(join(WEB, "components", p), "utf8")

/** The file's CODE — comments gone, and the import statements with them.
 *
 * Both halves are load-bearing and each was proved by deleting the real guard
 * and watching this suite stay green (27 Aug 2026):
 *
 *  • COMMENTS. Every file guarded here explains its flag in prose beside the
 *    guard, so a plain `includes` is answered by the explanation. Deleting the
 *    `if (TEAM_SCREENS_HIDDEN)` early return from team-switcher.tsx, and the
 *    `{!TEAM_SCREENS_HIDDEN && (` wrapper from settings-screen.tsx, both left
 *    this green — the header comment naming the flag was doing the work.
 *  • IMPORTS. A flag that is merely IMPORTED is not a flag that GATES. The
 *    TEAM_CREATION_CLOSED pair has always caught that with its own `!FLAG`
 *    assertion; TEAM_SCREENS_HIDDEN had no such companion, and its two shapes
 *    (`if (FLAG)` and `{!FLAG && (`) are too different for one regex. Dropping
 *    the import is what makes a bare mention mean something.
 */
const code = (src: string) =>
  stripComments(src).replace(/^import\s[\s\S]*?from\s+"[^"]*"/gm, "")

describe("one team: the UI offers no way to make another", () => {
  it("is actually closed (the checks below mean nothing otherwise)", () => {
    expect(TEAM_CREATION_CLOSED).toBe(true)
  })

  // The teamless onboarding screen is the third surface — it offered "Start my
  // own team" against a server that refuses the creation, so pressing it looped
  // back silently for ever. The guard is positive there (show the closed-product
  // sentence INSTEAD of the form), so it is asserted separately below.
  it("the teamless onboarding screen withdraws the form under the flag", () => {
    const src = readFileSync(join(WEB, "app", "onboarding", "page.tsx"), "utf8")
    expect(
      src.includes("teamless && TEAM_CREATION_CLOSED"),
      "onboarding's teamless branch must hide the create form under TEAM_CREATION_CLOSED"
    ).toBe(true)
    expect(
      src.includes("Start my own team"),
      "the dead promise is back — the button's label returned"
    ).toBe(false)
    // …and the OTHER half of its own sentence: "ask for a new invite" needs a
    // place to ACCEPT one, and every teamless person is bounced to exactly this
    // screen. Withdrawing the form without mounting the panel stranded
    // removed-then-reinvited members with no in-product way back in.
    // BOTH HALVES INSIDE THE BRANCH, not merely somewhere in the file.
    // `tenancy.bootstrap()` is called twice in this component — the other is the
    // effect that works out whether you are teamless at all — so asking the whole
    // file whether it mentions it proved nothing: emptying the panel\'s refresh
    // handler left this green while a person accepting an invite stayed stranded,
    // which is the bug the assertion is named after.
    const stripped = stripComments(src)
    const from = stripped.indexOf("{teamless && TEAM_CREATION_CLOSED ? (")
    const to = stripped.indexOf(") : (", from)
    expect(
      from >= 0 && to > from,
      "could not find the teamless branch in onboarding/page.tsx — if its shape changed, " +
        "re-scope this check rather than widening it back to the whole file"
    ).toBe(true)
    const teamlessBranch = stripped.slice(from, to)
    expect(
      teamlessBranch.includes("<InvitationsPanel"),
      "the teamless branch must mount the accept surface (InvitationsPanel)"
    ).toBe(true)
    expect(
      teamlessBranch.includes("tenancy.bootstrap()"),
      "accepting must re-check bootstrap so a fresh team routes them home — the call has to be " +
        "in the branch\'s own wiring, not merely somewhere else in the file"
    ).toBe(true)
  })

  for (const [file, what] of [
    ["team-switcher.tsx", "the sidebar's Create team item"],
    ["app-shell.tsx", "the create-team dialog"],
  ] as const) {
    it(`${what} is guarded by the product flag`, () => {
      const src = read(file)
      expect(
        src.includes("TEAM_CREATION_CLOSED"),
        `${file} renders a team-creation path — guard it with TEAM_CREATION_CLOSED from @shared/product`
      ).toBe(true)
      // The guard has to NEGATE the flag; importing it and ignoring it would
      // pass a naive check while still showing the button.
      expect(
        /!TEAM_CREATION_CLOSED/.test(src),
        `${file} imports the flag but doesn't gate on it`
      ).toBe(true)
    })
  }
})

// ONE TEAM ON SCREEN, AND EVERY BIT OF THE PLUMBING STILL THERE.
//
// A tester asked for teams to be removed altogether. The owner overruled it
// TWICE, and the reason is the product rather than the code: the multi-team
// machinery is what gets forked for a paying client, so hiding two controls is
// the whole change and deleting the spine would be the expensive mistake.
//
// This suite is the guard on BOTH halves — that the controls really are hidden,
// and that hiding them did not turn into removing them. It is a source scan for
// the same reason the block above is: what is being checked is that the decision
// is written down where the next person will meet it.
describe("the team screens are hidden, and nothing underneath moved", () => {
  it("is actually hidden (the checks below mean nothing otherwise)", () => {
    expect(TEAM_SCREENS_HIDDEN).toBe(true)
  })

  for (const [file, what] of [
    ["team-switcher.tsx", "the switcher in the sidebar and the mobile bar"],
    ["screens/settings-screen.tsx", "the Teams list on Settings"],
  ] as const) {
    it(`${what} reads the product flag`, () => {
      const src = code(read(file))
      expect(
        src.includes("TEAM_SCREENS_HIDDEN"),
        `${file} still shows a team control — gate it on TEAM_SCREENS_HIDDEN from @shared/product`
      ).toBe(true)
    })
  }

  it("the plumbing is untouched — switching a team still works in code", () => {
    // The four things somebody 'finishing the removal' would take out next. Each
    // is load-bearing for the fork this decision exists to protect, and none of
    // them is reachable from a control any more — which is exactly why a test
    // has to hold them rather than a reader noticing.
    const active = readFileSync(join(WEB, "lib", "use-active-team.ts"), "utf8")
    expect(active, "switchTeam is how /t/<id> resolves a team from the URL").toContain("switchTeam")
    const routeTeam = readFileSync(join(WEB, "components", "deep-link", "use-route-team.ts"), "utf8")
    expect(routeTeam, "a team-scoped URL still switches to its team").toContain("switchTeam")
    // THE DOOR, not the word. This file opens with a comment listing "teams,
    // members, roles, invites…", so `toContain("teams")` was answered by its own
    // header: replacing every CODE mention of teams in the file left this green.
    const api = stripComments(readFileSync(join(WEB, "lib", "api", "tenancy.ts"), "utf8"))
    expect(
      /\bteams:\s*\([^)]*\)\s*=>/.test(api),
      "the teams list accessor is gone from web/lib/api/tenancy.ts — the switcher has no door to call"
    ).toBe(true)
    // And the switcher itself is still a whole component, not a stub: flipping
    // the flag back has to give the menu back, not a placeholder.
    expect(read("team-switcher.tsx"), "the dropdown is still written").toContain("DropdownMenu")
  })
})
