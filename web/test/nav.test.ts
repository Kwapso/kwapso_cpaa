// The navigation order is a locked owner decision: Home first, then the team pages
// (Knowledge base, Tickets), Settings last — the SAME order on the desktop rail and the
// mobile bottom bar (no centre-pinning). These lock the mobile derivation.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { NAV, TEAM_SECTIONS, bottomNavItems } from "@/lib/pages"
import { MODULE_PERMISSION } from "@/lib/screens"
import { TEAM_MODULES } from "@shared/team-modules"

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

  it("caps the bar at 5 destinations", () => {
    const many = [...composed, { slug: "a" }, { slug: "b" }]
    expect(bottomNavItems(many)).toHaveLength(5)
  })
})

// THE RAIL'S ORDER IS THE OWNER'S, AND IT IS NOT A COMMENT.
//
// It was written down in a comment in pages.ts and nowhere else, which means any
// change — a new page appended, a group flipped, a line moved while editing
// something nearby — would have reordered his sidebar with a green build.
//
// This composes the rail the way app-shell.tsx does (Home first, the sidebar
// sections in registry order, Settings last, then partitioned by group with the
// divider between the halves) and asserts the sequence he fixed. It reads the
// registry rather than the shell's JSX, so it stays true if the shell is
// rewritten — but the composition is duplicated here, and that is the one thing
// to keep honest: if app-shell's `inOrder` changes shape, change it here too.
describe("the sidebar sequence the owner fixed", () => {
  const composeLikeTheShell = () => {
    const universal = NAV.filter((i) => !i.need)
    const sidebar = TEAM_SECTIONS.filter((s) => s.placement === "sidebar").map((s) => ({
      slug: s.key,
      group: s.group ?? ("occasional" as const),
    }))
    const inOrder = [
      ...universal.filter((i) => i.slug === "home"),
      ...sidebar,
      ...universal.filter((i) => i.slug !== "home"),
    ]
    return (["daily", "occasional"] as const).map((g) => inOrder.filter((i) => i.group === g).map((i) => i.slug))
  }

  // SEVEN since Time joined them. It is the fourth work-engine destination and
  // it sits with the other two dailies — a timesheet is opened on the days you
  // fill it in, which is most of them. It had no place on the rail at all
  // before: the whole list of logged time was a panel at the foot of the Stories
  // page, which is how a tester with 115 entries came to report that she could
  // not find any of it.
  it("puts the seven daily destinations above the divider, in his order", () => {
    expect(composeLikeTheShell()[0]).toEqual([
      "home",
      "accounts",
      "knowledge",
      "tickets",
      "stories",
      "tasks",
      "time",
    ])
  })

  it("puts the occasional ones below it, in his order", () => {
    // FIVE, not nine, since 17 Aug 2026. Marketing and Learning were purged, the
    // Delivery method page went with its programmes folded onto the sprint type,
    // and Process maps became contextual — a map is read inside the app it
    // belongs to. None of the four lost a screen; three lost a module and one
    // lost only its line on the rail.
    expect(composeLikeTheShell()[1]).toEqual([
      "meetings",
      "apps",
      "sprints",
      "brand",
      "settings",
    ])
  })

  it("lists every sidebar page exactly once, so nothing was lost in the reorder", () => {
    const rail = composeLikeTheShell().flat()
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
  const src = readFileSync(join(ROOT, "web/components/app-shell.tsx"), "utf8")
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
    const src = readFileSync(join(ROOT, "workers", "gateway", "src", "index.ts"), "utf8")
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
