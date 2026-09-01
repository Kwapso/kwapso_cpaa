// The one-shell routing invariants (source-scans). The whole post-auth app resolves in
// ONE deep-link shell, so ALL in-app navigation is soft History-API — an in-app
// `router.push` is the static-export hard reload that tears the SPA (and a running agent)
// down (EDGE-CASES §1). These lock the invariants that keep it that way.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { ACCOUNT_MODULES, TOP_LEVEL_MODULES } from "@/components/deep-link/route"
import { sourceFiles, stripComments } from "@shared/rules/source-scan"

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, "..")
const read = (p: string) => readFileSync(join(WEB, p), "utf8")

describe("the one shell — no reload on in-app navigation", () => {
  it("every account module is also a TOP_LEVEL_MODULE (else go() would hard-reload it)", () => {
    // If an account module isn't in TOP_LEVEL_MODULES, isInAppPath is false for it, so
    // go('/that') falls into the router.push branch — the reload that kills the agent.
    for (const m of ACCOUNT_MODULES) expect(TOP_LEVEL_MODULES, `"${m}" must be a TOP_LEVEL_MODULE`).toContain(m)
  })

  it("every account module has a render branch in the shell (no blank screen)", () => {
    const src = read("components/deep-link-screen.tsx")
    for (const m of ACCOUNT_MODULES)
      expect(src, `deep-link-screen must render a screen for module "${m}"`).toContain(`module === "${m}"`)
  })

  it("in-app nav goes through softNavigate/go(), never a router.push into the app", () => {
    // A router.push to an in-app path is the hard reload we removed. The deep nav
    // components + the account screens must use softNavigate instead. (router.replace to
    // a pre-auth route like /login on sign-out is fine — that's leaving the app.)
    const files = [
      "components/profile-menu.tsx",
      "components/team-switcher.tsx",
      "components/invitations.tsx",
      "components/screens/home-screen.tsx",
      "components/screens/settings-screen.tsx",
      "components/app-shell.tsx",
    ]
    for (const f of files) {
      const src = read(f)
      expect(/router\.push\(/.test(src), `${f} must not router.push (use softNavigate for in-app nav)`).toBe(false)
    }
  })

  // ENUMERATE BY WHAT NAVIGATES, NOT BY A LIST SOMEBODY MAINTAINS.
  //
  // The test above reads SIX hand-listed files for ONE spelling of the mistake.
  // The other spelling is a bare `<a href="/t/…">`, which no framework and no
  // check was watching, and there are two hundred components it could live in.
  // It reached production three times: the knowledge base (see the note in
  // deep-link/route.ts), "Manage dropdowns", and the internal rate card — whose
  // own comment says it copied the dropdowns one. Three occurrences of one
  // class, under a green build, because the guard enumerated files rather than
  // links.
  //
  // So this reads EVERY component off disk and asks the only question that
  // matters: does this anchor's href point INSIDE the app? An in-app href must
  // go through <InAppLink> (or carry its own softNavigate/onOpen interception,
  // which is the same thing written inline). An href to /api/…, to an external
  // site, or to a pre-auth route is not this rule's business.
  it("in-app-anchors: no component links into the app with a bare anchor", () => {
    const offenders: string[] = []
    // Off the DISK, so a component written tomorrow is held to this without
    // anybody adding it to a list.
    const files = sourceFiles(join(WEB, "components"), { extensions: [".tsx"] })
    expect(files.length, "the component census found nothing — it has gone blind").toBeGreaterThan(50)
    for (const { path: file, source } of files) {
      const src = stripComments(source)
      // Every anchor's href, whether written as a literal or a template.
      for (const m of src.matchAll(/<a\b[\s\S]{0,400}?href=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const href = m[1] ?? m[2] ?? ""
        // Not ours: an API door (export/download), an absolute URL, a mailto,
        // or an expression we cannot read statically.
        if (!href.startsWith("/") || href.startsWith("/api/")) continue
        // A pre-auth destination is a real navigation on purpose.
        if (/^\/(login|onboarding)\b/.test(href)) continue
        // The interception, written inline — app-tiles.tsx and the dropdown
        // list do this, and it is exactly what <InAppLink> wraps.
        const anchor = m[0]
        const after = src.slice(m.index ?? 0, (m.index ?? 0) + anchor.length + 500)
        if (/preventDefault\(\)/.test(after) && /(softNavigate|onOpen|onNavigate|go)\(/.test(after))
          continue
        offenders.push(`${file} → ${href}`)
      }
    }
    expect(
      offenders,
      `these anchors point inside the app and would reload the whole shell — use <InAppLink>: ${offenders.join(", ")}`
    ).toEqual([])
  })

  it("in-app-anchors: the InAppLink seam actually intercepts", () => {
    // A component everything is routed through, that forgot to preventDefault,
    // would turn the rule above into decoration.
    const src = read("components/in-app-link.tsx")
    expect(src, "InAppLink must render a real <a> so middle-click still works").toMatch(/<a\b/)
    expect(src, "InAppLink must cancel the browser's own navigation").toContain("preventDefault()")
    expect(src, "InAppLink must move through the soft-nav bus").toContain("softNavigate")
    expect(src, "InAppLink must leave a modified click to the browser").toContain("metaKey")
  })

  it("softNavigate is the one bus, backed by the host's registered go()", () => {
    const nav = read("lib/nav.ts")
    expect(nav).toContain("export function softNavigate")
    expect(nav).toContain("export function registerHostGo")
    // The shell registers its go() so softNavigate resolves to a soft History-API move.
    expect(read("components/deep-link-screen.tsx")).toContain("registerHostGo(go)")
  })
})

describe("the shell's own chrome stays on screen", () => {
  // The sidebar's LAST row — profile, theme, collapse — is placed with `mt-auto`,
  // i.e. "the bottom of the rail". That is only the bottom of the WINDOW while the
  // rail is exactly one window tall. As a bare flex child it stretches to the
  // tallest column instead, so on a long list the row sat at the bottom of a
  // several-thousand-pixel document and left the screen the moment the rows
  // arrived — visible on Home (short) and nowhere else. Height + sticky are what
  // make `mt-auto` mean what it reads as.
  // FOUND BY THE ELEMENT, NOT BY ITS TAG. This used to slice from `<aside`,
  // which stopped meaning anything the day the rail moved inside the kit's
  // ScreenShell and became a plain node in the shell's own column — the
  // PROPERTY held and the test failed anyway, which is a test measuring its
  // method rather than its subject. The rail is now identified by what makes
  // it the rail: one element carrying all three of the behaviours below. The
  // breakpoint prefix is gone with the `<aside>` too — the shell drops the
  // rail below `md` itself, so the classes no longer need `md:` to say so.
  const railClasses = () => {
    const src = read("components/app-shell.tsx")
    const line = src
      .split("\n")
      .find((l) => l.includes("sticky") && l.includes("h-[100svh]") && l.includes("overflow-y-auto"))
    expect(
      line,
      "one element must carry the rail's height, its pinning and its own scroll — whatever tag draws it"
    ).toBeDefined()
    return line ?? ""
  }

  it("the desktop rail is exactly one window tall, and pinned there", () => {
    const cls = railClasses()
    expect(cls, "the rail must be one window tall — without it, it stretches to the page")
      .toMatch(/h-\[100svh\]/)
    expect(cls, "the rail must stay pinned as the main column scrolls").toMatch(/sticky/)
  })

  it("a rail taller than the window scrolls inside itself, not off the bottom", () => {
    // Every new module adds a nav row. Past ~a dozen on a short screen the rail
    // overflows, and without this the bottom row is clipped exactly as before.
    expect(railClasses(), "the rail must scroll internally once the nav outgrows it")
      .toMatch(/overflow-y-auto/)
  })

  // THE NAV CONTENTS ARE THE KIT'S `Rail` NOW (R45) — the hand-rolled
  // `navButton`/`toggleCollapsed` pair this used to anchor on is gone with it,
  // by design: Rail draws its own rows and its own collapse control. What has
  // to survive the swap is the PROPERTY, not the old mechanism — the nav
  // region scrolls in its own wrapper so a long list can never push the team
  // switcher or the account menu off the bottom of the window.
  it("the nav region is a bounded, independently-scrolling wrapper around Rail", () => {
    const src = read("components/app-shell.tsx")
    // Substring, not the exact class list (31 Aug 2026): the wrapper also picked
    // up `overflow-x-clip` (a real bug fix — Rail's own row bleed made this
    // wrapper's un-set overflow-x compute to `auto`, letting the rail drag
    // sideways) — checking the vertical-scroll classes are PRESENT, not that
    // nothing else ever joins them, so the next legitimate addition here
    // doesn't retrigger this same false failure.
    const wrapper = src.indexOf('className="min-h-0 flex-1 overflow-y-auto')
    expect(wrapper, "Rail must sit inside a sized, scrollable wrapper — its own min-h-full needs one to fill").toBeGreaterThan(-1)
    expect(src.slice(wrapper, wrapper + 200), "the wrapper must actually hold <Rail").toContain("<Rail")
  })

  it("the account menu sits below the rail, still reachable at the bottom of the column", () => {
    // Rail's own member chip is ONE action (real name, `onSelect` only — see
    // the note in app-shell.tsx); the actual account menu (profile, settings,
    // appearance, sign out) has no Rail slot, so it stays a real,
    // separately-composed control rather than being dropped.
    const src = read("components/app-shell.tsx")
    const rail = src.indexOf("<Rail")
    expect(rail, "app-shell must render the kit's Rail").toBeGreaterThan(-1)
    // 1500 → 7000 (31 Aug 2026): the collapsed-state member row grew a real
    // `<ProfileMenu trigger=… tooltip=…>` composition (the avatar itself is
    // now the menu's trigger, replacing a separate dots button — see the
    // note in app-shell.tsx) BEFORE the expanded state's own
    // `<ProfileMenu … compact>` this assertion is really checking for, which
    // pushed the real distance from `<Rail` to ~5,974 chars. The window only
    // needs to be generous, not exact.
    const after = src.slice(rail, rail + 7000)
    expect(after, "the account menu must be composed after the rail, in the same column").toContain("<ProfileMenu")
    expect(after, "…compact, so it is not a second avatar beside Rail's own member chip").toMatch(/<ProfileMenu\s+active=\{active\}\s+compact/)
  })

  it("the theme control is in the profile menu, not the rail", () => {
    // It is a three-segment pill and the kit does not collapse it to an icon
    // (its set has no sun and no moon), so in a 240px rail it was the widest
    // thing there and the reason the rail grew a horizontal scrollbar. It is a
    // personal preference, so it sits with the person's other ones.
    //
    // Asserted BOTH ways on purpose: "it left the rail" alone would pass if it
    // had simply been deleted, and a theme control nobody can reach is worse
    // than a wide one.
    const shell = read("components/app-shell.tsx")
    expect(shell, "the shell must not draw it inline").not.toContain("<ModeToggle")
    expect(read("components/profile-menu.tsx"), "…and the menu must").toContain("<ModeToggle")
  })

  it("Rail never gets a real in-app href (its own <a> never calls preventDefault)", () => {
    // A kit-side finding, not a hypothetical: `templates/rail.tsx`'s row
    // renders a real <a onClick={...}> with no preventDefault, firing
    // onSelect ALONGSIDE the browser's own navigation rather than instead of
    // it. Wiring `RailItem.href` to an in-app path would hard-reload this
    // static-export shell on every click (EDGE-CASES.md's trap, R37). Every
    // row and the member chip must go through `onSelect` only.
    const src = read("components/app-shell.tsx")
    const groups = src.indexOf("const railGroups")
    const member = src.indexOf("const railMember")
    expect(groups, "railGroups must be built in app-shell.tsx").toBeGreaterThan(-1)
    expect(member, "railMember must be built in app-shell.tsx").toBeGreaterThan(-1)
    const groupsBlock = src.slice(groups, member)
    const memberBlock = src.slice(member, member + 700)
    expect(groupsBlock, "a RailItem must never carry href").not.toContain("href:")
    expect(memberBlock, "the member chip must never carry href").not.toContain("href:")
  })
})
