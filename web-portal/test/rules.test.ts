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
//
// The "ONE" in those laws now means shared/web/ — the browser half of the same
// shared/ the workers already use. It used to mean web/, reached through an
// alias into the sibling app's tree, which made the portal compile out of source
// it never declared a dependency on (and one of those files says, in its own
// header, that it gets deleted the day the library ships a replacement). The
// last describe below is what keeps that door shut.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { PORTAL_ACTIVITY_EXEMPT } from "@shared/rules/registry"
import { sourceFiles, stripComments } from "@shared/rules/source-scan"

const PORTAL = join(__dirname, "..")
const read = (p: string) => readFileSync(p, "utf8")

/** Every component file in the portal — RECURSIVELY, through the same walker the
 * agency app's laws use. This read one directory flat while web/test/rules.test.ts
 * recursed, so the two suites said "every component" and meant different sets. The
 * portal's folder is flat today, which is why nothing was red; the first component
 * to move into a subdirectory would have dropped out of R3, R4, R7 and R16 in
 * silence. */
function componentFiles(): string[] {
  return sourceFiles(join(PORTAL, "components"), { extensions: [".tsx"] }).map((f) => f.path)
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
  // one: imported from shared/web, not a portal-local copy. A second copy would
  // be a second form layout the first day either changed.
  it("forms-use-formshell: every portal form uses the ONE FormShell", () => {
    for (const c of FORM_COMPONENTS) {
      const src = read(join(PORTAL, "components", `${c}.tsx`))
      expect(src, `${c} must RENDER a FormShell, not merely import one`).toContain("<FormShell")
      expect(src, `${c} must import the SHARED FormShell, not a portal copy`).toContain(
        "@shared/web/form-shell"
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
    expect(heading, "the count seam must be the ONE shared formatCount, not a copy").toContain(
      "@shared/web/format-count"
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
  it("staff stay anonymous: a reply is you, a colleague, or the agency — never a staff name", () => {
    const src = read(join(PORTAL, "components", "ticket-screen.tsx"))
    expect(src, "an agency reply must be attributed to the brand, not a person").toContain(
      "brand.name"
    )
    // Every server field that carries a STAFF person's name. `personName` (a
    // contact of the client's own company) is deliberately not on this list —
    // and neither, since 11 Aug 2026, is `authorName`, for the same reason: a
    // contact now sees their COMPANY's questions, so a thread has colleagues on
    // it, and calling a colleague "kwapso" is not anonymity, it is a lie about
    // who is talking. What changed is WHERE the promise is kept, and it moved
    // the right way — the field used to arrive carrying a staff name and this
    // list stopped the screen drawing it; now the server never sends one, which
    // the assertion below pins so removing a name from this regex can never be
    // the whole edit.
    const staffNaming = /\b(actorName|raiserName|creatorName|editorName|assigneeName|stakeholders)\b/
    const leaky: string[] = []
    for (const f of componentFiles()) {
      if (staffNaming.test(stripComments(read(f)))) leaky.push(f.split("/").pop() as string)
    }
    expect(leaky, "the portal shows work status, never which staff member is doing it").toEqual([])

    // The wire, not the widget: a staff name must not reach a client login at
    // all. (workers/content/test/staff-anonymity.test.ts proves both halves
    // against a real database; this pins the seams so the source can't quietly
    // drop one.)
    //
    // TWO SEAMS, not one, and the second is why this assertion moved. A thread's
    // authors were decided in `listReplies` and this line watched it — while
    // `toTicket`, forty lines up the same file, emitted the staff RAISER's name,
    // their id and the last EDITOR's name on every ticket row, with no portal
    // branch at all. Watching one of two places that make the same decision is
    // how a rule reads as kept while half of it is broken; a promise with two
    // seams needs two lines here.
    const lib = read(join(PORTAL, "..", "workers", "content", "src", "lib", "help.ts"))
    const seamBody = (needle: string) => {
      const at = lib.indexOf(needle)
      expect(at, `${needle.trim()} is where names are decided — did it move?`).toBeGreaterThan(-1)
      // Comments stripped, or the prose ABOVE the seam explaining the rule would
      // satisfy the assertion in place of the code that implements it.
      return lib.slice(at, lib.indexOf("\n}", at)).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
    }
    expect(
      seamBody("export async function listReplies("),
      "a portal caller must be sent NO name for an author outside their world"
    ).toMatch(/scope\.kind === "portal"[\s\S]*creator_name: null/)

    // The ticket row: the NAME and the HANDLE, and the editor's name too. A ULID
    // is a stable pseudonym for one staff member across every ticket they touch,
    // so blanking only the name would leave the linkage that makes a name
    // recoverable (the reason listReplies kills both).
    const ticket = seamBody("function toTicket(")
    expect(ticket, "toTicket must decide about a client login at all").toContain('scope.kind === "portal"')
    for (const field of ["raiserId", "raiserName", "editorName"])
      expect(ticket, `${field} must be withheld from a client login, not just left off the screen`).toMatch(
        new RegExp(`${field}: hide\\w+ \\? null :`)
      )
  })

  // THE SAME SENTENCE, ONE TABLE OVER. An account row is mostly the client's own
  // information — which is why the portal opens the door — but four of its fields
  // are the agency's record ABOUT them: the commercial `status` (prospect /
  // client / past client), `commercialsVisible` (our switch governing what money
  // they see), and the two audit names. Plus `grantedByName` on a login row: which
  // staff member handed out the sign-in.
  //
  // The repo had already ruled on exactly these fields one layer up.
  // shared/rules/registry.ts closes the portal's activity feed because an
  // account's history "names the staff who edited the record and shows the
  // agency's own before/after values (status moves, commercial flags) — none of
  // which is the client's to read". The history was shut and the CURRENT values
  // rode out on the row underneath it.
  //
  // (workers/tenancy/test/account-leak.test.ts proves it against a real database
  // through both doors and the CSV export; this pins the seam so the source can't
  // quietly drop it.)
  it("an account row carries none of the agency's own view of the client", () => {
    const lib = read(join(PORTAL, "..", "workers", "tenancy", "src", "lib", "accounts.ts"))
    const seamBody = (needle: string) => {
      const at = lib.indexOf(needle)
      expect(at, `${needle.trim()} is where an account's fields are decided — did it move?`).toBeGreaterThan(-1)
      // Comments stripped, or the prose explaining the rule would satisfy the
      // assertion in place of the code that implements it.
      return lib.slice(at, lib.indexOf("\n}", at)).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
    }
    const account = seamBody("function toAccount(")
    expect(account, "toAccount must decide about a client login at all").toContain('scope.kind === "portal"')
    for (const field of ["commercialsVisible", "status", "createdByName", "editedByName"])
      expect(account, `${field} is the agency's, and must not be sent to a client login`).toMatch(
        new RegExp(`${field}: ours \\? null :`)
      )

    // The login row's own staff name, decided in the reader that builds it.
    expect(
      seamBody("export async function listPortalUsers("),
      "who granted a login is a staff decision with a staff name on it"
    ).toMatch(/grantedByName: scope\.kind === "portal" \? null :/)
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
      if (banned.test(stripComments(read(f)))) offenders.push(f.split("/").pop() as string)
    }
    expect(offenders, "'account' is a company or a person we work for — never a login").toEqual([])
  })
})

// THE PORTAL COMPILES OUT OF ITS OWN TREE, AND shared/. NOTHING ELSE.
//
// It used to reach 25 modules out of web/ through an `@web/*` alias that no
// package.json declared — including web/components/temp/code-input.tsx, whose
// own header says the file gets DELETED once the library ships a replacement. A
// planned deletion in one app would have broken the other, silently, with
// nothing in this app changed.
//
// The shared seams live in shared/web/ now (the browser half of the same shared/
// the workers use), so the dependency runs app → shared, the direction every
// other part of this repo already runs. This is the guard that keeps it there:
// it reads the config AND the source, because removing the alias is only half of
// it — a relative `../../web/lib/store` would compile just as happily.
describe("the portal does not compile out of the agency app's tree", () => {
  const portalFiles = (): string[] =>
    sourceFiles(PORTAL, { extensions: [".ts", ".tsx", ".mjs"] }).map((f) => f.path)

  it("sees the portal's own source (guards the walk)", () => {
    expect(portalFiles().length).toBeGreaterThan(20)
  })

  it("declares no alias into the sibling app", () => {
    for (const cfg of ["tsconfig.json", "vitest.config.ts"])
      expect(
        /["']@web["']?\s*[:/]/.test(read(join(PORTAL, cfg))),
        `${cfg} must not alias into web/ — put shared seams in shared/web/`
      ).toBe(false)
  })

  it("imports nothing from web/, by alias or by path", () => {
    const offenders: string[] = []
    for (const file of portalFiles()) {
      // Comments are not imports: this file explains the rule, and so do several
      // portal headers, so the prose must not read as a violation of itself.
      const code = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^\s*\/\/.*$/gm, "")
      for (const m of code.matchAll(/from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']/g)) {
        const spec = m[1] ?? m[2]
        if (/^@web\//.test(spec) || /(^|\/)\.\.\/web\//.test(spec))
          offenders.push(`${file.slice(PORTAL.length + 1)} → ${spec}`)
      }
    }
    expect(
      offenders,
      `the portal must not import from the agency app — promote the seam into shared/web/ instead: ${offenders.join(", ")}`
    ).toEqual([])
  })

  // The other half of "one implementation": the portal must not answer the move
  // by growing its own copy of a seam the laws say there is exactly one of.
  it("carries no second copy of a single-instance seam", () => {
    const single = ["form-shell", "format-count", "use-form-draft", "store", "use-email-sign-in"]
    const local = portalFiles()
      .map((f) => f.slice(PORTAL.length + 1))
      .filter((f) => single.some((s) => f.endsWith(`/${s}.ts`) || f.endsWith(`/${s}.tsx`)))
    expect(
      local,
      "these seams exist exactly once, in shared/web/ (R4, R7, R16) — the portal must import them, not re-declare them"
    ).toEqual([])
  })
})
