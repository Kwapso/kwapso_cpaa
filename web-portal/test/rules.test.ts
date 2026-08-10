// THE LAWS OF THE BASE, ON THE SECOND FRONT DOOR.
//
// web/test/rules.test.ts scans `web/components`. Every UI law in the base is
// therefore enforced on exactly one surface — and the day a second front door
// shipped, every one of them silently stopped covering half the app. That is not
// a law being broken; it is a law quietly ceasing to apply, which is worse,
// because nothing goes red.
//
// So the portal enforces the same laws over its own source: R3 (no hand-rolled
// toggles), R4 (forms through the ONE FormShell), R7 (drafts survive), R16 (an
// exact server count, in one place, through the one seam), plus the two rules
// this surface adds — the reasoned R2 exemption, and staff anonymity.

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { PORTAL_ACTIVITY_EXEMPT } from "@shared/rules/registry"

const PORTAL = join(__dirname, "..")
const read = (p: string) => readFileSync(p, "utf8")

/** Every component file in the portal. */
function componentFiles(): string[] {
  const dir = join(PORTAL, "components")
  return readdirSync(dir)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => join(dir, f))
}

/** Portal components that render a form (a submit handler + fields). */
const FORM_COMPONENTS = ["raise-ticket-dialog", "needs-name"]

describe("portal UI laws", () => {
  it("guards the scan (the portal has components to check)", () => {
    expect(componentFiles().length).toBeGreaterThan(5)
  })

  // R3 — no component fakes a tab strip or a selected-state toggle out of Buttons
  // (the tell-tale is `variant={x === y ? … : …}`). The portal ships no tabs at
  // all, which satisfies R3 the honest way rather than the pretty way.
  it("no-handrolled-toggles: no portal component fakes a tab strip", () => {
    const offenders = componentFiles().filter((f) => /variant=\{[^}]*===[^}]*\?/.test(read(f)))
    expect(
      offenders.map((f) => f.split("/").pop()),
      "use the library TabsView instead of hand-rolled toggles"
    ).toEqual([])
  })

  // R4 — every form renders through the shared FormShell, and it is THE shared
  // one: imported from the host, not a portal-local copy. A second copy would be
  // a second form layout the first day either changed.
  it("forms-use-formshell: every portal form uses the ONE FormShell", () => {
    for (const c of FORM_COMPONENTS) {
      const src = read(join(PORTAL, "components", `${c}.tsx`))
      expect(src, `${c} must RENDER a FormShell, not merely import one`).toContain("<FormShell")
      expect(src, `${c} must import the SHARED FormShell, not a portal copy`).toContain(
        "@web/components/form-shell"
      )
    }
    const localCopy = componentFiles().some((f) => f.endsWith("form-shell.tsx"))
    expect(localCopy, "the portal must not carry its own FormShell (R4: there is one)").toBe(false)
  })

  // R7 — a half-typed request must survive a stray tap. More load-bearing here
  // than on the agency side: this is a phone, and the person typing is describing
  // a problem carefully.
  it("forms-persist-drafts: every portal form persists its draft", () => {
    for (const c of FORM_COMPONENTS) {
      const src = read(join(PORTAL, "components", `${c}.tsx`))
      expect(src, `${c} must CALL useFormDraft — an unused import is not a draft`).toMatch(
        /useFormDraft\(/
      )
    }
  })

  // R16 — the number is an exact server COUNT(*) through the ONE formatCount
  // seam, and the portal renders it in exactly ONE component. The agency app
  // needs a React context to arbitrate between a tab badge and a heading; the
  // portal has no counted tabs, so the arbitration is this assertion.
  it("counted-collections: one count seam, one place, no list lengths", () => {
    const heading = read(join(PORTAL, "components", "collection-heading.tsx"))
    expect(heading, "the count seam must be the host's formatCount, not a copy").toContain(
      "@web/lib/format-count"
    )
    // Nobody else formats a count.
    const others = componentFiles().filter(
      (f) => !f.endsWith("collection-heading.tsx") && read(f).includes("formatCount")
    )
    expect(
      others.map((f) => f.split("/").pop()),
      "counts are rendered by CollectionHeading alone (R16: exactly once)"
    ).toEqual([])
    // …and no count is ever built from a loaded list's length.
    const lengthCounts = componentFiles().filter((f) => /total=\{[^}]*\.length/.test(read(f)))
    expect(
      lengthCounts.map((f) => f.split("/").pop()),
      "a page's length is a ceiling, not a total (R16)"
    ).toEqual([])
  })

  // R14 — the ticket list GROWS, so the client must be able to reach page two.
  // The agency side learned this the hard way: a badge counting 240 over a list
  // that stopped at 50 is a truthful number and a broken screen.
  it("bounded-lists: the growing collection pages, and the client can walk it", () => {
    const tickets = read(join(PORTAL, "lib", "tickets.ts"))
    expect(tickets, "the ticket list must page by the opaque cursor").toContain("nextCursor")
    expect(tickets, "…and expose a way to load the next page").toContain("loadMore")
    const support = read(join(PORTAL, "components", "support-screen.tsx"))
    expect(support, "the support screen must CALL loadMore, not merely import it").toMatch(
      /loadMore\(\)/
    )
  })

  // R15 — the portal publishes nothing, so the "no deaf publishers" half is free.
  // The half that isn't: the screens must LISTEN, or a reply typed by the agency
  // sits unseen until the client reloads.
  it("live-collections: the shell consumes the live channel", () => {
    const shell = read(join(PORTAL, "components", "portal-shell.tsx"))
    expect(shell, "the shell must open the team channel").toMatch(/useRealtime\(/)
    expect(shell, "…fan every ping into the portal's listeners").toMatch(/applyLivePing\(/)
    expect(shell, "…and replay what it missed after a drop").toMatch(/replayAfterReconnect\(/)
  })
})

describe("portal rules the agency app doesn't have", () => {
  // R2's reasoned exemption. The registry says WHY these record screens ship no
  // Activity feed; this makes sure the reason stays true and the list stays real.
  it("portal-activity-exempt: every exempt screen still ships no Activity feed", () => {
    expect(Object.keys(PORTAL_ACTIVITY_EXEMPT).length).toBeGreaterThan(0)
    for (const [component, why] of Object.entries(PORTAL_ACTIVITY_EXEMPT)) {
      const src = read(join(PORTAL, "components", `${component}.tsx`))
      expect(src, `${component} is exempt from R2 but renders an ActivityFeed`).not.toContain(
        "ActivityFeed"
      )
      expect(why.length, `${component}'s exemption needs a real reason`).toBeGreaterThan(20)
    }
  })

  it("portal-activity-exempt: no portal screen reads an activity door", () => {
    const offenders = componentFiles().filter((f) => /activity/i.test(read(f).match(/["'`]\/api\/[^"'`]*/g)?.join() ?? ""))
    expect(offenders.map((f) => f.split("/").pop())).toEqual([])
  })

  // SCOPE ch.06 — "the portal shows work status but never which staff member is
  // doing it". The one place this could leak by accident is a reply's author, so
  // the ticket screen resolves anyone-but-you to the AGENCY's name.
  //
  // The scan is for the FIELDS that carry a staff person's name onto a screen —
  // not for the word "stakeholder", which is a legitimate thing to render about
  // the client's OWN people (their main contact is theirs to know). Comments are
  // stripped first, or stating the rule would break it.
  it("staff stay anonymous: a reply is either you or the agency, never a name", () => {
    const src = read(join(PORTAL, "components", "ticket-screen.tsx"))
    expect(src, "an agency reply must be attributed to the brand, not a person").toContain(
      "brand.name"
    )
    // Every server field that carries a staff person's name. `personName` (a
    // contact of the client's own company) is deliberately not on this list.
    const staffNaming = /\b(authorName|actorName|raiserName|creatorName|editorName|assigneeName|stakeholders)\b/
    const leaky: string[] = []
    for (const f of componentFiles()) {
      const visible = read(f)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
      if (staffNaming.test(visible)) leaky.push(f.split("/").pop() as string)
    }
    expect(leaky, "the portal shows work status, never which staff member is doing it").toEqual([])
  })

  // SCOPE ch.02, the iron rule: "account" NEVER means a login. People are portal
  // users or staff users; they never "have an account". The word survives as a
  // RECORD name in code (the accounts table, portal/context) — what must never
  // happen is a screen SAYING it to a person about signing in.
  it("account never means a login, in anything a client reads", () => {
    const banned = /(your|an|my|a|the)\s+account\s+(is|was|has|will|needs|can)|create an account|sign in to your account|account (password|login|sign-in)/i
    const offenders: string[] = []
    for (const f of componentFiles()) {
      // Only the words a person sees: strip comments first, or the explanation of
      // the rule would break the rule.
      const visible = read(f)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
      if (banned.test(visible)) offenders.push(f.split("/").pop() as string)
    }
    expect(offenders, "'account' is a company or a person we work for — never a login").toEqual([])
  })
})
