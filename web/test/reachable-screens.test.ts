// THE SCREENS ARE REACHABLE, AND A DOOR HAS A BUTTON.
//
// Three invariants, all earned by things this repo actually shipped:
//
//   1. EVERY SIDEBAR DESTINATION DECLARES WHICH HALF OF THE RAIL IT IS IN, and
//      the shell partitions the rail from that field rather than naming pages.
//      The owner's ruling is two groups with a divider — daily on top,
//      occasional below — and he rejected both alternatives put to him. A rule
//      like that survives exactly as long as the next person adding a section
//      remembers it, unless the registry makes it un-forgettable.
//
//   2. EVERY SIDEBAR DESTINATION ACTUALLY RESOLVES. A section in the registry is
//      a link in the rail, and a link needs four things to work: a permission
//      module, a place in TOP_LEVEL_MODULES (or tapping it leaves the History
//      API and full-reloads, throwing away the warm cache the entire caching
//      model stands on), a page shell under web/app (or a reload 404s), and the
//      gateway forwarding its sub-paths (or a deep link to a record 404s).
//      Every one of those four was broken for at least one live section when
//      this check was written: Knowledge base and Work were missing from
//      TOP_LEVEL_MODULES, and Marketing, Brand library, Delivery method and
//      Meeting purposes had no page shell at all — four sidebar links that
//      404'd on reload, in a green build.
//
//   3. A SHIPPED DOOR HAS A CONTROL. The work engine shipped a ticket's
//      reference number, its archive door and its drag-rank door, and a person
//      could reach none of the three: the reference rendered on no screen, and
//      the two doors had no caller anywhere in the front end. Nothing was
//      broken — the tests passed, the machine surface worked, and the
//      capability did not exist for the people the app is for. So every
//      non-GET route on the two workers the agency app talks to must be CALLED
//      from web/ or web-portal/, or be a named line saying who it is for.

import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { sourceFiles } from "@shared/rules/source-scan"

import { NAV, TEAM_SECTIONS } from "../lib/pages"
import { MODULE_PERMISSION } from "../lib/screens"
import { TOP_LEVEL_MODULES } from "../components/deep-link/route"

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, "..")
const ROOT = join(WEB, "..")
const read = (p: string) => readFileSync(p, "utf8")

/** Every destination in the left rail — the universal anchors plus the team's
 * own sidebar pages. Derived from the two registries, never listed here. */
const RAIL = [
  ...NAV.filter((n) => !n.need).map((n) => ({ what: `NAV "${n.slug}"`, group: n.group })),
  ...TEAM_SECTIONS.filter((s) => s.placement === "sidebar").map((s) => ({
    what: `section "${s.key}"`,
    group: s.group,
  })),
]

describe("the screens are reachable", () => {
  // 1 — THE RAIL IS TWO GROUPS, and the registry is what says which.
  it("nav-groups: every rail destination declares its half, and the shell derives them", () => {
    expect(RAIL.length, "the rail derivation found nothing — it has gone blind").toBeGreaterThan(5)
    const ungrouped = RAIL.filter((d) => d.group !== "daily" && d.group !== "occasional")
    expect(
      ungrouped.map((d) => d.what),
      `a rail destination with no group lands in the occasional half by accident rather than by decision — give it \`group: "daily"\` or \`group: "occasional"\` in lib/pages.ts: ${ungrouped.map((d) => d.what).join(", ")}`
    ).toEqual([])

    // BOTH halves have to be occupied, or the divider the owner asked for never
    // draws and the ruling is silently undone by a registry edit.
    for (const half of ["daily", "occasional"] as const)
      expect(
        RAIL.filter((d) => d.group === half).length,
        `the ${half} half of the rail is empty — the divider only exists between two groups`
      ).toBeGreaterThan(0)

    // …and the SHELL must partition by that field rather than naming pages. A
    // hand-listed group in the component would leave the registry describing a
    // rail it no longer controls.
    const shell = read(join(WEB, "components", "app-shell.tsx"))
    expect(shell, "app-shell must build the rail groups from each destination's own group field").toContain(
      'i.group === g'
    )
  })

  // 2 — A LINK IN THE RAIL GOES SOMEWHERE.
  it("sidebar-destinations: every sidebar section resolves end to end", () => {
    const gateway = read(join(ROOT, "workers", "gateway", "src", "index.ts"))
    const sidebar = TEAM_SECTIONS.filter((s) => s.placement === "sidebar")
    expect(sidebar.length, "the sidebar scan found no sections — it has gone blind").toBeGreaterThan(5)

    for (const s of sidebar) {
      // (a) the URL segment maps to the permission module the server enforces —
      // without it the deep-link host NotFounds the page it just linked to.
      expect(
        MODULE_PERMISSION[s.segment],
        `sidebar section "${s.key}" (/${s.segment}) has no MODULE_PERMISSION entry — the host would refuse the page the rail links to`
      ).toBe(s.module)

      // (b) it is an in-app path, so `go()` moves to it through the History API.
      expect(
        TOP_LEVEL_MODULES,
        `"/${s.segment}" is a sidebar page but not a TOP_LEVEL_MODULE — every tap on it leaves the History API and FULL-RELOADS, throwing away the warm cache`
      ).toContain(s.segment)

      // (c) the static export has a shell for it, or a reload / a pasted link 404s.
      expect(
        existsSync(join(WEB, "app", s.segment, "[[...rest]]", "page.tsx")),
        `"/${s.segment}" is a sidebar page with no web/app/${s.segment}/[[...rest]]/page.tsx — the link works inside the app and 404s on reload`
      ).toBe(true)

      // (d) the gateway serves that shell for any sub-path, or a deep link to a
      // record under it 404s.
      expect(
        new RegExp(`"${s.segment}"`).test(gateway),
        `the gateway does not forward /${s.segment}/* to its shell — a deep link to one of its records 404s on load`
      ).toBe(true)
    }
  })

  // 3 — A DOOR THAT CHANGES SOMETHING HAS SOMETHING THAT PRESSES IT.
  //
  // TWO HOPS, and the second one is the whole point. Hop one is the api layer:
  // which method names the door's path. Hop two is a COMPONENT calling that
  // method — because `rankStory` sat in the api layer for weeks with the path
  // written out in full and no screen calling it, so a one-hop check ("is the
  // path mentioned anywhere?") would have reported the drag-rank gap as fine.
  // A control is a thing a person can press, and a person presses components.
  //
  // WHAT IT DOES NOT CATCH, said plainly so nobody over-trusts it: a handler in
  // a component with no button wired to it still reads as a call. It measures
  // "does a screen reach this door", not "can a person see the control" — the
  // second is a question about pixels, and this is a source scan. It catches the
  // failure this repo actually had (the capability absent from every screen) and
  // it would not catch a button someone later deleted from around a live handler.
  it("doors-have-controls: every write door is called from a screen, or says who it is for", () => {
    // Hop one: the api layer's method → the path it posts to. Read as one blob
    // per file and split on the method boundaries, because a method's body is
    // where its path literal lives.
    const apiSrc = sourceFiles([join(WEB, "lib", "api"), join(ROOT, "web-portal", "lib")], {
      extensions: [".ts"],
      skipTests: true,
    })
      .map((f) => f.source)
      .join("\n")
    expect(apiSrc.length, "the api-layer scan read nothing — it has gone blind").toBeGreaterThan(5000)
    // `name: (args) => …` up to the next method at the same indent. The path may
    // sit several lines down (a query builder, a then-chain), so the window runs
    // to the next declaration rather than to the end of the line.
    const methods = [...apiSrc.matchAll(/^ {2}(\w+):\s*[(<]/gm)]
    expect(methods.length, "the api-method scan found almost nothing").toBeGreaterThan(40)
    const bodyOf = new Map<string, string>()
    methods.forEach((m, i) => {
      const from = m.index as number
      const to = (methods[i + 1]?.index as number | undefined) ?? apiSrc.length
      bodyOf.set(m[1], (bodyOf.get(m[1]) ?? "") + apiSrc.slice(from, to))
    })

    // Hop two: the SCREENS — every component in both front ends, plus the
    // handful of non-component callers a screen genuinely delegates to (the
    // pre-auth onboarding flow, the host's own write layer).
    const screens =
      sourceFiles(
        [
          join(WEB, "components"),
          join(WEB, "app"),
          join(ROOT, "web-portal", "components"),
          join(ROOT, "web-portal", "app"),
        ],
        { extensions: [".ts", ".tsx"], skipTests: true }
      )
        .map((f) => f.source)
        .join("\n") +
      // The host's own write layer — a named action dispatched from a screen's
      // button is still that button pressing the door.
      read(join(WEB, "lib", "use-screen-actions.ts"))
    expect(screens.length, "the screen scan read nothing — it has gone blind").toBeGreaterThan(10000)

    const unpressed: string[] = []
    let doors = 0
    for (const worker of ["content", "tenancy"]) {
      const index = read(join(ROOT, "workers", worker, "src", "index.ts"))
      const table = /export const ROUTES[^=]*=\s*\{([\s\S]*?)\n\}/.exec(index)
      expect(table, `workers/${worker} has no ROUTES table — did it move?`).toBeTruthy()
      for (const [, method, path] of (table as RegExpExecArray)[1].matchAll(
        /"([A-Z]+) (\/[^"]+)":\s*\{\s*handler:/g
      )) {
        if (method === "GET") continue // a read is pressed by opening the screen
        // Key-gated ops doors (adminGuard): no session reaches them at all, so
        // there is no screen they could have and no person to give a button to.
        // They are run from scripts with the owner's key — a different kind of
        // caller, not a missing control.
        if (path.startsWith("/api/tenancy/admin/")) continue
        doors++
        // Which api method posts to this door, and is that method called from a
        // screen? Either hop missing is the same failure with two faces: no
        // plumbing, or plumbing nobody can reach.
        const callers = [...bodyOf].filter(([, body]) => body.includes(path)).map(([name]) => name)
        if (!callers.some((name) => new RegExp(`\\.${name}\\s*\\(`).test(screens)))
          unpressed.push(`${method} ${path}`)
      }
    }
    expect(doors, "the write-door census found almost nothing — it has gone blind").toBeGreaterThan(30)

    const unlisted = unpressed.filter((d) => !(d in NO_CONTROL))
    expect(
      unlisted,
      `these doors change something and nothing a person can click calls them — give them a control, or write down here who they ARE for: ${unlisted.join(", ")}`
    ).toEqual([])

    // THE RATCHET: an excuse in front of a door that now HAS a control is a line
    // nobody reread. Wire one up and its line must go, so this list can only shrink.
    const stale = Object.keys(NO_CONTROL).filter((d) => !unpressed.includes(d))
    expect(
      stale,
      `NO_CONTROL names doors that are called from a front end now — delete these lines: ${stale.join(", ")}`
    ).toEqual([])
  })
})

/** WRITE DOORS NOTHING A PERSON CAN PRESS REACHES YET. Two kinds of line, and
 * they are labelled, because pretending a gap is a decision is how a gap
 * survives a review.
 *
 *   • FOR A MACHINE — the door exists for the assistant, the MCP surface or the
 *     import engine, and a person does the same thing another way. Nothing is
 *     missing.
 *   • A GAP — the capability shipped and the people the app is for cannot use
 *     it. Named here so it is a list somebody can work through rather than a
 *     silence. Every one of these belongs to a lane other than screens.
 *
 * The list is a RATCHET: wire a door up and its line must be deleted, or the
 * build goes red. So it can only ever shrink, and it can never quietly describe
 * a screen that now exists. */
const NO_CONTROL: Record<string, string> = {
  /* ── for a machine ─────────────────────────────────────────────────────── */
  "POST /api/content/learning/bulk-active":
    "FOR A MACHINE. The SET-shaped write — 'switch these forty articles off'. It exists for the assistant and the machine surface, where a caller names a set; a person switches one article off on its own screen, which is the door beside this one.",
  "POST /api/content/help/bulk-status":
    "FOR A MACHINE. The same shape for tickets: a set of ids moved together. A person moves one ticket with the stepper on its own screen.",
  "POST /api/content/help/bulk-status-by-filter":
    "FOR A MACHINE. 'Move everything matching this filter' is a sentence somebody says to the assistant, not a control that could be drawn safely: a button whose blast radius is however many rows the filter happened to match is a button nobody can check before pressing.",
  "POST /api/content/work-logs/auto-stop":
    "FOR A MACHINE. A private preference about how the caller's own timers behave, set by asking the assistant. It changes no record anybody else can see, which is also why it is the content worker's one housekeeping write.",
  "POST /api/content/knowledge/sync":
    "FOR A MACHINE, and deliberately: the sweep runs itself every fifteen minutes. A button that says 'catch up now' invites people to press it when nothing is behind — the owner's own comprehension answer was that eleven new tickets need no hand-adding at all. The knowledge-base lane owns whether a status line ever earns one.",
  "POST /api/tenancy/config/screens":
    "FOR A MACHINE. A team's screen-recipe override is app furniture rather than a record: the assistant writes one, and a screen for editing screens is a screen nobody asked for.",

  /* ── a gap, owned by another lane ──────────────────────────────────────── */
  "POST /api/content/work-logs/update":
    "A GAP (the time lane). Correcting a row of time — its duration, its kind of work, whether it is billable — has a door and no control: the time panel lists the week and cannot fix a line in it, so a mistyped hour can only be repaired by the assistant.",
  "POST /api/content/brand-assets/upload":
    "A GAP (the housekeeping lane). The brand library holds the material everything else is made with, and its form has no file field — an asset can be described here and only uploaded through the machine surface.",
  "POST /api/content/staff/profiles/active":
    "A GAP (the staff lane). A profile can be written and edited on the member's page and never retired, so a colleague who leaves keeps a live profile.",
  "POST /api/content/staff/upload":
    "A GAP (the staff lane). The same form's file half — a certificate can be recorded without the piece of paper behind it.",
  "POST /api/tenancy/rates":
    "A GAP (the money lane). The ACCOUNT rate card — what a client is charged per hour, by kind of work — has three doors, a live-sync listener, a cache key and no screen at all. Nobody at the agency can see or set a price without asking the assistant.",
  "POST /api/tenancy/rates/update": "A GAP (the money lane) — see POST /api/tenancy/rates above.",
  "POST /api/tenancy/rates/active": "A GAP (the money lane) — see POST /api/tenancy/rates above.",
  "POST /api/tenancy/internal-rates":
    "A GAP (the money lane). The agency's OWN cost card, which the margin is computed from. It is the half of the money that R24 keeps out of the portal, and it has no screen on our side either — so the figure every margin depends on can only be set by a machine.",
  "POST /api/tenancy/internal-rates/update":
    "A GAP (the money lane) — see POST /api/tenancy/internal-rates above.",
  "POST /api/tenancy/internal-rates/active":
    "A GAP (the money lane) — see POST /api/tenancy/internal-rates above.",
}
