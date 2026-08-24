// A RECORD YOU CAME IN THROUGH IS STILL ON SCREEN, AND IT HAS A NAME.
//
// THE OWNER, 24 Aug 2026, twice.
//
// First on `/accounts/01KZ…/sprints/01KZ…`: the breadcrumb read "Account ›
// Sprints › CONFIA-SPR0020" while the screen underneath displayed "CLIENT:
// Confia". Then, after that was fixed, on
// `/accounts/…/apps/…/processes/…`:
//
//   "does it not make sense that all of the breadcrumbs should hold the name of
//    the record of the detail screen which was open, rather than the name of the
//    module?"
//
// TWO CAUSES, one shape. A crumb's name was looked up inside whichever list
// happened to be in cache, so it was there when the collection was small and
// gone when it was not. `processes` had no entry at all, so the deepest crumb
// simply vanished; `accounts` had one, but the list is paged at fifty and Confia
// was row 118 of 131, so the lookup found nothing and the crumb said the generic
// word. Neither errored. Both just said less than they knew.
//
// WHY THE OLD VERSION OF THIS FILE MISSED THE SECOND ONE, which is the lesson
// worth keeping: it enumerated the modules to check BY READING `recordLabel` —
// the very function that was incomplete. A module absent from the labeller was
// therefore absent from the census, so the check could only ever confirm that
// what was already handled was handled. It is R21's substitution again:
// ENUMERATE BY WHAT A URL CAN CARRY, never by what the code that handles URLs
// happens to name.
//
// So the census now starts from the SECTION TABLE — every URL segment the app
// can put a record id after — and demands each one has a face. And a face must
// carry a by-id read, because a paged list is not a place a name can be relied
// on to live.

import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { buildCrumbs, type CrumbRecords, RECORD_FACE } from "@/components/deep-link/crumbs"
import { TEAM_SECTIONS } from "@/lib/pages"
import { sourceFiles, stripComments } from "@shared/rules/source-scan"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")

function read(rel: string): string {
  const [file] = sourceFiles(join(ROOT, dirname(rel)), {
    extensions: [rel.split("/").pop() as string],
    relativeTo: ROOT,
    recursive: false,
  })
  if (!file) throw new Error(`${rel} not found — did it move?`)
  return stripComments(file.source)
}

/** EVERY URL SEGMENT A RECORD ID CAN FOLLOW — the section table's own segments,
 * which is what `parseScreenPath` turns into trail levels. Derived, so a section
 * added next year is in this census the day it is added. */
function segments(): string[] {
  return [...new Set(TEAM_SECTIONS.map((s) => s.segment).filter(Boolean))]
}

/** Segments that never carry a record id, with the reason each. Data, and
 * rot-checked below, so the list can only shrink. */
const NO_RECORD_BEHIND_IT: Record<string, string> = {
  dropdowns: "a settings screen for the team's own vocabulary — the values are edited in place, none of them has a screen of its own.",
  time: "the work-log collection. A log is read on the record it was booked against, never at /time/<id>.",
  import: "the CSV importer — a workflow, not a collection. Nothing under it has an id.",
  brand: "brand assets open in a panel on the section itself rather than at an address of their own.",
  purposes: "meeting purposes are edited in place on their section, like dropdown values.",
  "internal-rates": "our own cost card — one settled list on a tab, with no per-row screen.",
}

/** Lists loaded across the WHOLE TEAM AREA rather than on their own section, and
 * the cache key each is loaded under. They back a tab's count badge, so they are
 * fetched whether or not anybody has opened them — which makes them present on a
 * nested address for free. Rot-checked below against that key's guard, so an
 * entry that stops being team-wide turns this red rather than going quiet. */
const TEAM_WIDE = new Map([
  ["roles", "member_roles"],
  ["invites", "invites"],
])

/** How `useScreenData` decides to load each module's list: the ancestor-aware
 * `onScreen("x")`, or the flat `module === "x"` that predates nesting. */
function loadingConditions(): { onScreen: Set<string>; flat: Set<string> } {
  const body = read("web/lib/use-screen-data.ts")
  return {
    onScreen: new Set([...body.matchAll(/onScreen\("([a-z_]+)"\)/g)].map((m) => m[1])),
    flat: new Set([...body.matchAll(/module === "([a-z_]+)"/g)].map((m) => m[1])),
  }
}

describe("every record a URL can name, the breadcrumb can name", () => {
  const segs = segments()

  it("there are segments to check — this cannot pass by finding nothing", () => {
    expect(segs.length).toBeGreaterThan(10)
  })

  it("every segment that can carry a record id has a face", () => {
    const faceless = segs.filter((s) => !RECORD_FACE[s] && !(s in NO_RECORD_BEHIND_IT))
    expect(
      faceless,
      `a URL can put a record id after these segments, and the breadcrumb has no ` +
        `way to say that record's name — it will show the section's generic word, ` +
        `or nothing at all if the crumb is the deepest one. Add a RECORD_FACE ` +
        `entry in web/components/deep-link/crumbs.ts, or a reasoned ` +
        `NO_RECORD_BEHIND_IT line here: ${faceless.join(", ")}`
    ).toEqual([])
  })

  it("every face can read its record BY ID, not only out of a loaded page", () => {
    // The half that the sprint fix missed. A list is paged, so "the name is in
    // the list" is true right up until a client has enough history for it not to
    // be — and then it is false silently, on exactly the busiest accounts.
    const body = read("web/lib/live-resources.ts")
    for (const [seg, face] of Object.entries(RECORD_FACE)) {
      const entry = body.indexOf(`\n  ${face.resource}: {`)
      expect(
        entry,
        `RECORD_FACE["${seg}"] points at the live resource "${face.resource}", which ` +
          `is not in TEAM_RESOURCES — so its name can never be read by id.`
      ).toBeGreaterThan(-1)
      const chunk = body.slice(entry, body.indexOf("\n  },", entry))
      expect(
        chunk.includes("fetchOne"),
        `the live resource "${face.resource}" has no fetchOne, so a "${seg}" record ` +
          `past page one of its list has no way to be named.`
      ).toBe(true)
    }
  })

  it("a face that names a loaded list is loaded when it is an ANCESTOR too", () => {
    // The fast path still has to work. A list that only loads on its own screen
    // sends every nested address through a by-id read it did not need.
    //
    // A list loaded across the WHOLE TEAM AREA (roles, invites — they back a tab
    // badge, so they are fetched whether or not their section is open) is never
    // blind, and it is spotted by the absence of any condition rather than by a
    // name on a list here: `flat` only holds modules whose read is gated on
    // `module === "x"` at all.
    const { onScreen, flat } = loadingConditions()
    const blind = Object.entries(RECORD_FACE)
      .filter(([, f]) => f.list)
      .map(([seg]) => seg)
      .filter((m) => !onScreen.has(m) && flat.has(m) && !TEAM_WIDE.has(m))
    expect(
      blind,
      `these name a breadcrumb out of a loaded list, but that list only loads when ` +
        `they are the DEEPEST level — so every nested address pays for a read it ` +
        `already had the answer to. Use onScreen("x") rather than module === "x" ` +
        `in use-screen-data.ts: ${blind.join(", ")}`
    ).toEqual([])
  })

  it("every team-wide list really is loaded without asking which module is open", () => {
    // The rot-check on TEAM_WIDE. If one of these is ever narrowed to its own
    // section, it stops being present on a nested address and the exemption above
    // starts hiding a real gap — so the guard is read rather than trusted.
    const body = read("web/lib/use-screen-data.ts")
    for (const [seg, cacheKey] of TEAM_WIDE)
      expect(
        body.includes(`enabled ? \`${cacheKey}:\${teamId}\``),
        `TEAM_WIDE says "${seg}" is loaded across the whole team area under the key ` +
          `"${cacheKey}", but use-screen-data.ts no longer loads it on \`enabled\` alone. ` +
          `Either give it onScreen("${seg}") or update this entry.`
      ).toBe(true)
  })

  it("the exemptions are all still real segments", () => {
    for (const s of Object.keys(NO_RECORD_BEHIND_IT))
      expect(
        segs,
        `NO_RECORD_BEHIND_IT names "${s}", which is no longer a section segment — delete the line.`
      ).toContain(s)
  })

  it("…and none of them has quietly gained a face", () => {
    for (const s of Object.keys(NO_RECORD_BEHIND_IT))
      expect(
        RECORD_FACE[s],
        `"${s}" now has a RECORD_FACE entry, so its NO_RECORD_BEHIND_IT reason is stale — delete the line.`
      ).toBeUndefined()
  })
})

// ── THE ADDRESS THE OWNER REPORTED, END TO END ────────────────────────────────
//
// `/accounts/01KZXBT5T6CVY065QVW9M2S47G/apps/01KZXD652HR0RPQF70BYJ09NQ8/processes/01KZXS7HAS2A3HQ25S3ESVDZZG`
// on staging, where the account is "Confia", the app is "CONFIA" and the process
// is "Recording a damage case". It rendered "Account › CONFIA" — the client
// unnamed, the process missing altogether.
//
// The accounts list here deliberately does NOT contain Confia, which is the real
// condition: 131 accounts, a page of fifty, Confia at row 118.

const LEVELS = [
  { module: "accounts", id: "ACCT" },
  { module: "apps", id: "APP" },
  { module: "processes", id: "PROC" },
]

const EMPTY_RECORDS: CrumbRecords = {
  accounts: [{ id: "SOMEONE-ELSE", name: "Aabar" }] as unknown as CrumbRecords["accounts"],
  members: undefined,
  roles: [],
  invites: undefined,
  knowledge: undefined,
  apps: [{ id: "APP", name: "CONFIA" }] as unknown as CrumbRecords["apps"],
  sprints: undefined,
  stories: undefined,
  tasks: undefined,
  meetings: undefined,
}

const crumbsFor = (resolved: Map<string, string>) =>
  buildCrumbs({
    topLevel: true,
    module: "processes",
    recordId: "PROC",
    levels: LEVELS,
    teamName: "Kwapso",
    teamPath: "/t/T1",
    sectionPath: "/accounts/ACCT/apps/APP/processes",
    records: EMPTY_RECORDS,
    resolved,
    t: (s) => s,
  })

describe("the address the owner reported", () => {
  it("names every level once the by-id reads have landed", () => {
    const crumbs = crumbsFor(
      new Map([
        ["accounts:ACCT", "Confia"],
        ["processes:PROC", "Recording a damage case"],
      ])
    )
    expect(crumbs.map((c) => c.label)).toEqual(["Confia", "CONFIA", "Recording a damage case"])
  })

  it("the deepest crumb EXISTS — a process used to resolve to nothing and vanish", () => {
    // Even with no name read yet, the record is on screen, so its crumb is on
    // screen. Before the face existed, recordLabel returned "" for a process and
    // the `else if (here)` branch simply dropped it.
    const crumbs = crumbsFor(new Map())
    expect(crumbs).toHaveLength(3)
    expect(crumbs[2].label).toBe("Process")
  })

  it("the ancestor a loaded page cannot reach still falls back to a word, never an id", () => {
    const crumbs = crumbsFor(new Map())
    expect(crumbs[0].label).toBe("Account")
    // …and the middle level, which IS in its loaded list, is named from it — the
    // fast path is still the fast path.
    expect(crumbs[1].label).toBe("CONFIA")
  })

  it("every crumb above the last is a link that lands where it says", () => {
    const crumbs = crumbsFor(new Map([["accounts:ACCT", "Confia"]]))
    expect(crumbs[0].href).toBe("/accounts/ACCT")
    expect(crumbs[1].href).toBe("/accounts/ACCT/apps/APP")
    expect(crumbs[2].href).toBeUndefined()
  })
})

describe("the shell actually asks for those names", () => {
  // THE WIRING, NOT THE FUNCTION. On 24 Aug 2026 a nesting test passed with the
  // bug still in it, because it proved trailPath while the defect sat in the
  // caller. So this reads the caller.
  const shell = read("web/components/deep-link-screen.tsx")

  it("calls useTrailNames over the whole trail", () => {
    expect(
      /useTrailNames\(\s*trail\s*,/.test(shell),
      "deep-link-screen.tsx must call useTrailNames(trail, …) — over the TRAIL, not " +
        "one level, or only the deepest record gets a name."
    ).toBe(true)
  })

  it("hands what it read to the crumbs", () => {
    expect(
      /resolved:\s*resolvedNames/.test(shell),
      "buildCrumbs is not being passed the names useTrailNames read, so every crumb " +
        "a loaded page cannot reach stays on its fallback word."
    ).toBe(true)
  })

  it("asks BEFORE the early returns, so the hook count never changes", () => {
    const call = shell.indexOf("useTrailNames(")
    const firstReturn = shell.indexOf("if (active.loading")
    expect(call).toBeGreaterThan(-1)
    expect(
      call,
      "useTrailNames sits below an early return — React will throw on the render " +
        "where the screen bails out early."
    ).toBeLessThan(firstReturn)
  })
})
