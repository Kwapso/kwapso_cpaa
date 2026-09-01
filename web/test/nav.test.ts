// The navigation order is a locked owner decision: Home first, then the team pages
// (Knowledge base, Tickets), Settings last — the SAME order on the desktop rail and the
// mobile bottom bar (no centre-pinning). These lock the mobile derivation.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { sectionFor } from "@/components/deep-link/route"
import { BOTTOM_NAV_SLOTS, NAV, NAV_GROUP_ORDER, TEAM_SECTIONS, bottomNavItems, overflowNavItems } from "@/lib/pages"
import { MODULE_PERMISSION } from "@/lib/screens"
import { TEAM_MODULES } from "@shared/team-modules"
import { stripComments } from "@shared/rules/source-scan"

const ROOT = join(__dirname, "..", "..")

const composed = [
  { slug: "home" },
  { slug: "knowledge" },
  { slug: "tickets" },
  { slug: "settings" },
]

describe("bottomNavItems — Home, Knowledge base, Tickets, Settings", () => {
  it("keeps the composed order (Home FIRST, not centre-pinned)", () => {
    expect(bottomNavItems(composed).map((i) => i.slug)).toEqual([
      "home",
      "knowledge",
      "tickets",
      "settings",
    ])
  })

  it("shows all of them when they fit", () => {
    expect(bottomNavItems(composed)).toHaveLength(4)
    expect(overflowNavItems(composed)).toEqual([])
  })

  it("gives the last slot to More once there are more sections than slots", () => {
    // Five sections still fit — the fifth is a section, not a More.
    const five = [...composed, { slug: "a" }]
    expect(bottomNavItems(five)).toHaveLength(5)
    expect(overflowNavItems(five)).toEqual([])

    // Six do not. The bar shows four and hands the fifth slot to More.
    const six = [...five, { slug: "b" }]
    expect(bottomNavItems(six)).toHaveLength(BOTTOM_NAV_SLOTS - 1)
    expect(overflowNavItems(six).map((i) => i.slug)).toEqual(["a", "b"])
  })

  it("NOTHING FALLS BETWEEN THEM, at any length", () => {
    // THE INVARIANT THIS FILE EXISTS FOR. `bottomNavItems` used to be
    // `items.slice(0, 5)` and there was no second function at all: every
    // section past the fifth was dropped on the floor, and since the desktop
    // rail is `hidden md:flex` those sections could not be reached on a phone
    // or a tablet by any route. Five of the ten real ones were unreachable.
    //
    // So the property is not "the bar is capped" — a cap was never the
    // problem. It is that the two halves PARTITION the list, whatever its
    // length, so a section added in ten years' time lands in one of them.
    for (let n = 0; n <= 12; n++) {
      const items = Array.from({ length: n }, (_, i) => ({ slug: `s${i}` }))
      expect(
        [...bottomNavItems(items), ...overflowNavItems(items)],
        `${n} sections`
      ).toEqual(items)
    }
  })
})

describe("the phone can actually reach the overflow", () => {
  // The partition being right is not the same as the shell USING it — that gap
  // is exactly how this shipped: pages.ts even carried a comment promising
  // extras "would fold into a More entry", and nothing folded them anywhere. A
  // comment describing the catch is not the catch, so this reads the shell.
  const shell = readFileSync(join(ROOT, "web", "components", "app-shell.tsx"), "utf8")

  it("the shell computes the overflow", () => {
    expect(shell).toContain("overflowNavItems(navLinks)")
  })

  it("the shell renders a control for it, and it opens something", () => {
    expect(shell, "no More control in the bottom bar").toMatch(/overflowNav\.length > 0/)
    expect(shell, "the More control opens nothing").toMatch(/setMoreOpen\(true\)/)
  })

  it("what it opens lists EVERY section, not only the leftovers", () => {
    // railBlocks is the whole rail (the standalone anchors plus every named
    // section). Listing only `overflowNav` here would mean "where is Tickets?"
    // has a different answer on a phone than on a laptop.
    const sheet = shell.slice(shell.indexOf("<Sheet open={moreOpen}"))
    expect(sheet).toContain("railBlocks.map(")
  })
})

// THE RAIL'S ORDER IS THE CLIENT'S, AND IT IS NOT A COMMENT.
//
// It was written down in a comment in pages.ts and nowhere else, which means any
// change — a new page appended, a group flipped, a line moved while editing
// something nearby — would have reordered the sidebar with a green build.
//
// This composes the rail the way app-shell.tsx does (Home standalone first,
// then the team's sidebar sections AND any grouped NAV entry — none today,
// Kwapso included: it went through a rail section of its own and back out
// again the same day, see the note on NavGroup in pages.ts — partitioned into
// the three named groups in registry order) and asserts the sequence the
// client's 31 Aug 2026 feedback fixed. It reads the registry rather than the
// shell's JSX, so it stays true if the shell is rewritten — but the
// composition is duplicated here, and that is the one thing to keep honest:
// if app-shell's derivation changes shape, change it here too.
describe("the sidebar sequence the client fixed", () => {
  const composeLikeTheShell = () => {
    const universal = NAV.filter((i) => !i.need && i.inRail !== false)
    const sidebar = TEAM_SECTIONS.filter((s) => s.placement === "sidebar").map((s) => ({
      slug: s.key,
      group: s.group ?? ("my-work" as const),
    }))
    const grouped = [
      ...sidebar,
      ...universal.filter((i) => i.group !== "none").map((i) => ({ slug: i.slug, group: i.group as string })),
    ]
    const home = universal.filter((i) => i.slug === "home").map((i) => i.slug)
    const named = NAV_GROUP_ORDER.map((g) => grouped.filter((i) => i.group === g).map((i) => i.slug))
    return { home, named }
  }

  it("puts My work first among the named sections, in the client's order", () => {
    // Tasks and Meetings are the client's own explicit pair ("My work: today,
    // tasks, meetings" — "today" is Home, standalone, not repeated here — see
    // the note on NavGroup in pages.ts). Knowledge base, Tickets and Work logs
    // were not named; they keep the closest reading of the daily half they used
    // to sit in, after the two the client did name.
    expect(composeLikeTheShell().named[0]).toEqual(["tasks", "meetings", "knowledge", "tickets", "time"])
  })

  it("puts Build second, in the client's own explicit order", () => {
    // "build: Apps, sprints, stories" — that is this list's real order now, not
    // a derived one. Waves was not named; it keeps the closest reading of the
    // occasional half it used to sit in, appended after the three the client did
    // name.
    expect(composeLikeTheShell().named[1]).toEqual(["apps", "sprints", "stories", "waves"])
  })

  it("puts Accounts third, both pages the client named", () => {
    // "accounts: accounts, contacts" — Contacts had no first-class page to
    // point a rail entry at when this suite first named the gap (it was a tab
    // on the account record, gated by its own `contacts` right); the client
    // later answered the flag explicitly ("contacts as a real sidebar page,
    // also remove the tab from inside accounts", 31 Aug 2026), so both of the
    // client's own words now name a real page.
    expect(composeLikeTheShell().named[2]).toEqual(["accounts", "contacts"])
  })

  it("has exactly three named sections — Kwapso is not a fourth", () => {
    // Kwapso WAS a fourth named section, last, for part of one day (client,
    // 31 Aug 2026: "create a new section called kwapso, pages inside (under):
    // team, branding. put this section the last one") — then, later the same
    // day, it wasn't: "remove the whole kwapso section from the sidebar and
    // move with your profile and settings." So `named` has three entries, not
    // four, and none of them is named "kwapso" — see ProfileMenu for where
    // the destination actually lives now.
    const { named } = composeLikeTheShell()
    expect(named).toHaveLength(3)
    expect(named.flat()).not.toContain("kwapso")
  })

  it("has no standalone entry at all — Home left the rail entirely", () => {
    // "kwapso, welcome have no section" was true for a few hours on 31 Aug
    // 2026, with Home standalone in the meantime — then the client asked for
    // Home to leave the rail altogether ("remove home from navbar, make that
    // when we click the icon kwapso on top of sidebar it takes us there"), so
    // `home` in NAV now carries `inRail: false` like Settings and Kwapso, and
    // the brand mark is its only door (NavBrandHeader, app-shell.tsx). This
    // composition reads the same `inRail` field the shell does, so an empty
    // array here is the correct answer, not a regression.
    expect(composeLikeTheShell().home).toEqual([])
  })

  it("lists every sidebar page exactly once, so nothing was lost in the reorder", () => {
    const { home, named } = composeLikeTheShell()
    const rail = [...home, ...named.flat()]
    const sidebarKeys = TEAM_SECTIONS.filter((s) => s.placement === "sidebar").map((s) => s.key)
    for (const key of sidebarKeys)
      expect(rail, `the "${key}" section is in the registry but not on the rail`).toContain(key)
    expect(new Set(rail).size, "a destination appears twice on the rail").toBe(rail.length)
  })
})

// EVERY PAGE ON THE RAIL HAS ITS OWN GLYPH, AND THE FALLBACK IS NOT ONE.
//
// `SECTION_ICONS` in app-shell.tsx maps a sidebar section to its lucide component
// and falls back to Home for anything missing. A fallback that renders is a
// fallback nobody sees: `time` and `meetings` shipped without a line, so the rail
// drew the house three times and a tester reported that Meetings and Time share
// an icon. Both concepts already had a glyph in CONCEPT_ICON; only this map had
// not been told, and nothing could tell.
//
// The keys are DERIVED from the registry, so a new sidebar page has to bring its
// icon with it, and the values must all be different, so the next one cannot
// quietly land on somebody else's.
describe("the rail's icons", () => {
  // COMMENTS OFF BEFORE THE TABLE IS READ. `SECTION_ICONS` is written with
  // explanatory lines between its entries, and the pair regex below matches any
  // indented `key: Value,` — so an entry commented OUT with a block comment is
  // still counted as an entry. Proved 27 Aug 2026: wrapping `waves: SeaWaves,`
  // in a /* */ left this suite green while the rail had no icon for waves.
  const src = stripComments(readFileSync(join(ROOT, "web/components/app-shell.tsx"), "utf8"))
  const block = src.match(/const SECTION_ICONS[^{]*\{([^}]*)\}/)?.[1] ?? ""
  const pairs = [...block.matchAll(/^\s*"?([\w-]+)"?:\s*(\w+),/gm)].map(([, key, icon]) => ({ key, icon }))

  it("names an icon for every sidebar section in the registry", () => {
    expect(pairs.length, "SECTION_ICONS could not be read out of app-shell.tsx").toBeGreaterThan(0)
    const named = new Set(pairs.map((p) => p.key))
    const missing = TEAM_SECTIONS.filter((s) => s.placement === "sidebar" && !named.has(s.key)).map(
      (s) => s.key
    )
    expect(
      missing,
      "these rail pages fall back to the Home icon, so they are indistinguishable from Home and from each other"
    ).toEqual([])
  })

  it("gives each one a DIFFERENT icon, Home included", () => {
    // Home is not in SECTION_ICONS (it is a NAV entry), but it is on the same
    // rail and it is what the fallback resolved to — so it counts here.
    const icons = ["Home", ...pairs.map((p) => p.icon)]
    const seen = new Map<string, string[]>()
    pairs.forEach((p) => seen.set(p.icon, [...(seen.get(p.icon) ?? []), p.key]))
    seen.set("Home", [...(seen.get("Home") ?? []), "home"])
    const shared = [...seen.entries()].filter(([, keys]) => keys.length > 1)
    expect(
      shared.map(([icon, keys]) => `${icon}: ${keys.join(" + ")}`),
      "two rail pages wearing one glyph — one concept, one icon (UI-CONVENTIONS §4)"
    ).toEqual([])
    expect(new Set(icons).size).toBe(icons.length)
  })
})

// A section's URL segment and the right the server enforces used to be the same
// word everywhere, so nothing had to check that they agreed. They no longer are:
// the Tickets section is addressed at /tickets and gated by `help` — the string
// already written into every role's permission sheet in every team database, which
// a rename could only ever take somebody's access away.
//
// That makes MODULE_PERMISSION load-bearing in a way it wasn't. `module-content`
// looks the segment up there and renders NotFound when the lookup misses, so
// deleting one line would 404 a whole section — silently, with every other test
// still green, because nothing walks a section from its URL through to its right.
// This does, for every section, derived from the registry.
describe("every navigable section is reachable from its own URL", () => {
  it("maps each section's URL segment to the permission module it declares", () => {
    for (const s of TEAM_SECTIONS) {
      // Import is reached from a button, not an address, and is gated per-target
      // (module-content handles it before the lookup) — it owns no module key.
      if (s.placement === "contextual") continue
      // The team overview sits at the bare /t/<teamId>, which the URL grammar
      // reads as the module "team" (route.ts) rather than an empty segment.
      const segment = s.segment === "" ? "team" : s.segment
      expect(
        MODULE_PERMISSION[segment],
        `/${s.segment} has no MODULE_PERMISSION entry — the "${s.key}" section would render NotFound`
      ).toBe(s.module)
    }
  })

  it("declares a module that really is one of the team's modules", () => {
    for (const s of TEAM_SECTIONS) {
      if (s.placement === "contextual") continue
      expect(
        (TEAM_MODULES as readonly string[]).includes(s.module),
        `the "${s.key}" section gates on "${s.module}", which no role's permission sheet carries`
      ).toBe(true)
    }
  })

  // The static export emits ONE page per sidebar section, so the gateway has to
  // serve that page's shell for every depth beneath it — otherwise a link to
  // /tickets/<id> 404s at the asset layer before the app can resolve it (the
  // static-export reload trap, EDGE-CASES.md). That list lives in the gateway
  // and the sections live here, and nothing joined them: renaming a segment left
  // the gateway serving the old word, which no test could see because the
  // gateway's own suite hand-listed the same three strings.
  //
  // Both ends derived: the sections from this registry, the served list from the
  // gateway's own source.
  //
  // THIS PASSED WHILE FOURTEEN OF THE FIFTEEN 404'd, and that is worth writing
  // down. The handler's list was complete and always had been; what was missing
  // was `run_worker_first` in the gateway's wrangler.jsonc, which decides whether
  // a request reaches the handler AT ALL. A green test about the right half of a
  // two-part contract reads as coverage of the whole. The other half is now held
  // by workers/gateway/test/shell-routing.test.ts.
  it("the gateway serves a shell for every sidebar section's sub-paths", () => {
    // COMMENTS OFF, same reason and a sharper edge: the entries are bare quoted
    // strings, so ANY double-quoted word in a comment inside the array reads as a
    // served module. Proved 27 Aug 2026 — deleting `"meetings",` and leaving a
    // comment that says `the "meetings" page` left this green, i.e. a reload at
    // /meetings/<id> would have 404'd with this test still reporting cover.
    // (The gateway's own suite does catch that deletion; this one had stopped.)
    const src = stripComments(
      readFileSync(join(ROOT, "workers", "gateway", "src", "index.ts"), "utf8")
    )
    const list = src.match(/export const SHELL_MODULES = \[([\s\S]*?)\]/)?.[1] ?? ""
    const served = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1])
    expect(
      served.length,
      "the gateway's top-level-module list was not found — this scan is reading the wrong shape"
    ).toBeGreaterThan(0)
    for (const s of TEAM_SECTIONS) {
      if (s.placement !== "sidebar") continue
      expect(
        served,
        `workers/gateway must serve the "${s.segment}" shell for /${s.segment}/<id>, or every deep link into ${s.title} 404s on reload`
      ).toContain(s.segment)
    }
  })
})

// THE TAB STRIP BELONGS TO THE TAB SECTIONS, and to nothing else.
//
// `teamTabStrip` resolves a URL module segment to a section, and the section's
// own `placement` decides whether the Settings tab strip is drawn above it.
// That resolution used to be a hand-written list of segments inside
// deep-link-screen.tsx. `time` was never added to it, so Work logs — a sidebar
// page — resolved to `overview`, whose placement is "tab", and shipped with the
// Members / Roles / Invites strip across the top of it.
//
// The missing line was the symptom. The list was the defect: a table of
// sections and a second, hand-kept list of the same sections is a promise that
// somebody will remember, and the twentieth section is where they don't. So the
// resolution is DERIVED from the table (`sectionFor`), and this holds it there:
// every section resolves to itself, and no section can quietly borrow another
// one's placement again.
describe("sectionFor — the section table is the only list of sections", () => {
  it("resolves every section's own URL segment to that section", () => {
    for (const s of TEAM_SECTIONS) {
      if (s.segment === "") continue // the team overview itself has no segment
      expect(sectionFor(s.segment), `/${s.segment} must resolve to the "${s.key}" section`).toBe(s.key)
    }
  })

  it("draws the tab strip on the tab sections and NOWHERE else", () => {
    for (const s of TEAM_SECTIONS) {
      if (s.segment === "") continue
      const resolved = TEAM_SECTIONS.find((x) => x.key === sectionFor(s.segment))
      expect(
        resolved?.placement,
        `/${s.segment} is a "${s.placement}" section — it must not resolve to a section whose placement is "${resolved?.placement}", ` +
          `or ${s.title} draws the team tab strip it is not part of`
      ).toBe(s.placement)
    }
  })

  it("falls back to the overview for a segment that is no section at all", () => {
    expect(sectionFor("")).toBe("overview")
    expect(sectionFor("team")).toBe("overview")
    expect(sectionFor("not-a-section")).toBe("overview")
  })
})
