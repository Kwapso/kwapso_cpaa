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
  const asideTag = () => {
    const src = read("components/app-shell.tsx")
    const open = src.indexOf("<aside")
    expect(open, "app-shell must still render an <aside> rail").toBeGreaterThan(-1)
    return src.slice(open, src.indexOf(">", open))
  }

  it("the desktop rail is exactly one window tall, and pinned there", () => {
    const tag = asideTag()
    expect(tag, "the rail must be one window tall — without it, it stretches to the page")
      .toContain("md:h-[100svh]")
    expect(tag, "the rail must stay pinned as the main column scrolls").toContain("md:sticky")
  })

  it("a rail taller than the window scrolls inside itself, not off the bottom", () => {
    // Every new module adds a nav row. Past ~a dozen on a short screen the rail
    // overflows, and without this the bottom row is clipped exactly as before.
    expect(asideTag(), "the rail must scroll internally once the nav outgrows it")
      .toContain("md:overflow-y-auto")
  })

  it("the bottom row is still the thing being held down there", () => {
    // If this ever stops being mt-auto the two tests above are guarding nothing.
    // Anchored on the class list, not the bare word — the comment above the
    // <aside> discusses mt-auto in prose, and matched first.
    const src = read("components/app-shell.tsx")
    const bottom = src.indexOf("mt-auto flex")
    expect(bottom, "the profile/theme/collapse row must still be bottom-anchored").toBeGreaterThan(-1)
    const row = src.slice(bottom, bottom + 700)
    expect(row).toContain("<ProfileMenu")
    expect(row).toContain("toggleCollapsed")
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
    const bottom = shell.indexOf("mt-auto flex")
    expect(shell.slice(bottom, bottom + 700), "the rail must not draw it").not.toContain("<ModeToggle")
    expect(read("components/profile-menu.tsx"), "…and the menu must").toContain("<ModeToggle")
  })
})
