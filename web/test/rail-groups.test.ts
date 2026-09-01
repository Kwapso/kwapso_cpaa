// THE RAIL'S COLLAPSIBLE GROUPS — and the two controls that must not be confused.
//
// The owner asked why the collapsible sidebar groups had been removed. NOBODY
// REMOVED THEM: they were never built. The rail has drawn two groups separated by
// a `Separator` since grouping landed — `git log -S NavGroup -- web/lib/pages.ts`
// names ONE commit and it INTRODUCED the type — and no heading or chevron ever
// shipped in any bundle. What Aurora specified is
// `shared/ui/compositions/templates/rail.tsx` ch.26.02: "Grouped sections with a
// collapse chevron per group", and "Group collapse (chevron, left) is separate
// and persists per user". This locks that it is now what the app does.
//
// TWO CONTROLS, AND THE CHAPTER SAYS SO ITSELF:
//   · the GROUP chevron — per group, persisted under `ss-rail-groups-shut`;
//   · the RAIL collapse — the whole rail to icons, persisted under
//     `ss-sidebar-collapsed`, and the one the owner said not to break.
// A test that only knew about one of them would go green while the other was
// deleted, which is precisely the confusion the chapter is warning about.
//
// Read off the disk rather than rendered: `AppShell` mounts a whole application
// — the team switcher, the permission sheet, the live socket — and a render here
// would be testing the harness. What is being asserted is structural: which
// control exists, what it is keyed on, and that the collapsed rail degrades to
// the divider it has always been rather than losing its entries.

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { stripComments } from "@shared/rules/source-scan"

const RAW = readFileSync(join(__dirname, "..", "components", "app-shell.tsx"), "utf8")
/** THE CODE, WITHOUT THE PROSE ABOUT IT. Both of the first draft's failures were
 * this: a comment SAYING `transition-transform` was refused as a hand-rolled
 * rotation, and a fixed-width window past the collapsed branch ran into the
 * `<Collapsible>` after it. A check that reads its own explanation is a check
 * measuring the wrong text. */
const SHELL = stripComments(RAW)

describe("the group collapse is a real disclosure", () => {
  it("is the kit's Collapsible, not a hand-rolled show/hide", () => {
    expect(SHELL).toMatch(/from "@shared\/ui\/components\/collapsible\/collapsible"/)
    expect(SHELL, "the heading row itself is the trigger").toMatch(/<CollapsibleTrigger/)
    expect(SHELL, "and the entries are its content").toMatch(/<CollapsibleContent/)
  })

  it("rotates with the KIT's motion, never a transition of its own", () => {
    // A second definition of how this app moves is how two things end up moving
    // differently. The motion law refused the first draft's
    // `transition-transform`; this is the kit's own marker, which reads the
    // `data-state` Radix already writes.
    expect(SHELL).toMatch(/motion-disclosure-marker/)
    expect(SHELL, "no hand-rolled rotation survives").not.toMatch(/transition-transform/)
  })

  it("persists per user, under its OWN key", () => {
    expect(SHELL).toMatch(/ss-rail-groups-shut/)
    // OPEN IS THE DEFAULT and only a CLOSED group is stored, so somebody who has
    // never pressed a chevron carries nothing — and a group added tomorrow
    // arrives open rather than shut for everyone who ever collapsed one.
    expect(SHELL).toMatch(/shutGroups/)
  })

  it("reads that stored value defensively — it is the reader's own browser", () => {
    const at = SHELL.indexOf("ss-rail-groups-shut")
    const around = SHELL.slice(Math.max(0, at - 400), at + 400)
    expect(around, "a half-written value must leave the rail whole").toMatch(/try \{/)
    expect(around).toMatch(/Array\.isArray/)
  })
})

describe("and the RAIL collapse is a different control, untouched", () => {
  it("keeps its own key and its own button", () => {
    expect(SHELL, "the owner's words: don't break that").toMatch(/ss-sidebar-collapsed/)
    expect(SHELL).toMatch(/toggleCollapsed/)
    expect(SHELL).toMatch(/PanelLeftOpen|PanelLeftClose/)
  })

  it("and when the rail IS collapsed, the groups degrade to the divider", () => {
    // A 3rem rail has no room for a small-caps heading, so there is no chevron to
    // press — and every entry must still be there. A group that hid its items
    // behind a heading nobody can see would be the one unacceptable outcome.
    const at = SHELL.indexOf("if (collapsed)")
    expect(at, "the collapsed rail takes its own branch").toBeGreaterThan(-1)
    // BOUNDED AT ITS OWN `return`, never at a character count — the branch that
    // follows is the one with the disclosure in it, and a window wide enough to
    // reach it makes the last assertion here impossible to satisfy.
    const branch = SHELL.slice(at, SHELL.indexOf("return (", SHELL.indexOf(")", SHELL.indexOf("</React.Fragment>", at))))
    expect(branch, "…drawing the divider it always drew").toMatch(/<Separator/)
    expect(branch, "…and every entry in the group").toMatch(/group\.map\(navButton\)/)
    expect(branch, "…with no disclosure to hide them behind").not.toMatch(/Collapsible/)
  })
})

/** THE HEADINGS THE SHELL ACTUALLY DRAWS, read out of `NAV_GROUP_TITLE` rather
 * than typed here — so this file follows a rename instead of failing on one. */
function headings(): string[] {
  const at = SHELL.indexOf("NAV_GROUP_TITLE")
  const map = SHELL.slice(at, SHELL.indexOf("}", at))
  return [...map.matchAll(/t\("([^"]+)"\)/g)].map((m) => m[1])
}

describe("the headings are copy, and are treated as copy", () => {
  it("every group's word asks for its translation (R33)", () => {
    const at = SHELL.indexOf("NAV_GROUP_TITLE")
    expect(at).toBeGreaterThan(-1)
    const map = SHELL.slice(at, SHELL.indexOf("}", at))
    for (const line of map.split("\n").filter((l) => l.includes(":") && !l.includes("Record<")))
      expect(line, `a rail heading that ships English: ${line.trim()}`).toMatch(/t\(/)
  })

  it("there is one heading per group and they are not the same word", () => {
    expect(headings().length, "a group with no heading has no chevron to press").toBe(2)
    expect(new Set(headings()).size, "two halves called the same thing is one half").toBe(2)
  })

  // ── AND THE ASSISTANT SAYS THE SAME WORDS THE SCREEN DOES ─────────────────
  //
  // `scripts/seed-knowledge-about-the-app.mjs` writes the app's own description
  // of itself into the knowledge base — it is what the assistant reads when
  // somebody asks what is in the menu. It described the two halves in PROSE
  // ("what somebody opens most days") while the rail drew headings, and when the
  // owner renamed the headings on 1 Sep 2026 the two silently disagreed: a person
  // could be told about a group called "Every day" and then look at a rail headed
  // "Frequent". A true sentence about an app that does not exist.
  //
  // Derived from the shell, so a future rename that updates only one of the two
  // fails here rather than shipping.
  it("the app's own description of its menu uses the screen's words", () => {
    const seed = readFileSync(
      join(__dirname, "..", "..", "scripts", "seed-knowledge-about-the-app.mjs"),
      "utf8"
    )
    const body = stripComments(seed)
    for (const word of headings())
      expect(
        body.includes(word),
        `the rail is headed "${word}" and the assistant's description of the sidebar never says it`
      ).toBe(true)
  })
})
