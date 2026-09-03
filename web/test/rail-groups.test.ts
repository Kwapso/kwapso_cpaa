// THE RAIL'S COLLAPSIBLE GROUPS — and the two controls that must not be confused.
//
// The owner asked why the collapsible sidebar groups had been removed. NOBODY
// REMOVED THEM: they were never built. The rail has drawn named groups since
// grouping landed, and no heading or chevron ever shipped in any bundle. What
// Aurora specified is `shared/ui/compositions/templates/rail.tsx` ch.26.02:
// "Grouped sections with a collapse chevron per group", and "Group collapse
// (chevron, left) is separate and persists per user". This locks that it is
// now what the app does.
//
// R45 (composition adoption) is why the disclosure itself lives INSIDE the
// vendored `Rail` composition rather than a hand-rolled `<Collapsible>` in
// this file: `Rail` renders every named group itself, inside one `<nav>`
// (COMPOSITION_EXEMPT["templates/rail.tsx"] was deleted the day this shipped
// — a composition genuinely reached is stale as an exemption). So what this
// file can assert is structural on the APP's side of that seam: which prop
// wires the group state, what it is keyed on, and that the collapsed rail
// degrades to the divider it has always been rather than losing its entries.
//
// TWO CONTROLS, AND THE CHAPTER SAYS SO ITSELF:
//   · the GROUP fold — per group, persisted under `ss-rail-closed-groups`;
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
/** THE CODE, WITHOUT THE PROSE ABOUT IT — a check that reads its own
 * explanation is a check measuring the wrong text. */
const SHELL = stripComments(RAW)

describe("the group fold rides the kit's own Rail composition", () => {
  it("is the vendored Rail, not a hand-rolled show/hide", () => {
    expect(SHELL).toMatch(/from "@shared\/ui\/compositions\/templates\/rail"/)
    expect(SHELL, "the app hands Rail its groups").toMatch(/<Rail\b/)
    expect(SHELL, "…and reports every fold back to persist it").toMatch(/onGroupToggle=\{persistGroupToggle\}/)
    expect(SHELL, "no hand-rolled Collapsible survives beside it").not.toMatch(/<Collapsible[TC]/)
  })

  it("persists per user, under its OWN key", () => {
    expect(SHELL).toMatch(/ss-rail-closed-groups/)
    // OPEN IS THE DEFAULT and only a CLOSED group is stored, so somebody who has
    // never pressed a chevron carries nothing — and a group added tomorrow
    // arrives open rather than shut for everyone who ever collapsed one.
    expect(SHELL).toMatch(/closedGroups/)
  })

  it("reads that stored value defensively — it is the reader's own browser", () => {
    const at = SHELL.indexOf("ss-rail-closed-groups")
    const around = SHELL.slice(Math.max(0, at - 400), at + 400)
    expect(around, "a half-written value must leave the rail whole").toMatch(/try \{/)
    expect(around, "…and never throw under the shell").toMatch(/catch/)
  })
})

describe("and the RAIL collapse is a different control, untouched", () => {
  it("keeps its own key, and is still threaded to whatever draws the control", () => {
    expect(SHELL, "the owner's words: don't break that").toMatch(/ss-sidebar-collapsed/)
    expect(SHELL).toMatch(/persistCollapsed/)
    // THE CONTROL ITSELF IS THE KIT'S SINCE 2026-09-02, AND IT HAS NO GLYPH.
    // This used to assert `PanelLeftOpen|PanelLeftClose` — the two chevrons of
    // the app's own floating half-in-half-out toggle. `ScreenShell` (kit
    // v1.2.28) draws the collapse as a 3px edge handle whose whole affordance
    // is WHERE it stands (the column's outer rim when open, its inner edge when
    // shut), and the kit says why there is no glyph in as many words: one does
    // not fit in three pixels. So a check for an icon name is now a check that
    // the app has NOT adopted the kit's control.
    //
    // WHAT IS ASSERTED INSTEAD IS THE THING THAT CAN ACTUALLY BREAK. The shell
    // holds the collapsed state and drives only the rail it built itself; this
    // app hands it a rail NODE, so the value has to go down and every change
    // has to come back, or the handle draws open for ever while the column
    // beside it narrows. Both halves, plus the thread into the app's own rail.
    expect(SHELL, "the shell must be told which way the rail is").toMatch(
      /railCollapsed=\{collapsed\}/
    )
    expect(SHELL, "…and every press of its handle must come back here to be persisted").toMatch(
      /onRailCollapsedChange=\{persistCollapsed\}/
    )
    expect(SHELL, "…and the app's own rail must be told too — the shell cannot reach inside a node").toMatch(
      /collapsed=\{collapsed\}/
    )
  })

  it("does not draw a second collapse control beside the kit's handle", () => {
    // Two controls for one decision is what the adoption removed. The app's own
    // toggle was the only thing in this file that drew either chevron, so their
    // absence is the honest proof it is gone.
    expect(SHELL, "the kit's edge handle is the one collapse control now").not.toMatch(
      /PanelLeftOpen|PanelLeftClose/
    )
  })
})

/** THE HEADINGS THE SHELL ACTUALLY DRAWS, read out of `NAV_GROUP_LABELS` in
 * pages.ts rather than typed here — so this file follows a rename or a
 * regroup instead of failing on one. */
function headings(): string[] {
  const pages = stripComments(readFileSync(join(__dirname, "..", "lib", "pages.ts"), "utf8"))
  const at = pages.indexOf("NAV_GROUP_LABELS")
  const map = pages.slice(at, pages.indexOf("}", at))
  return [...map.matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1])
}

describe("the headings are copy, and are treated as copy", () => {
  it("every group's word asks for its translation (R33)", () => {
    // NAV_GROUP_LABELS itself is a module-level constant (can't call `t()`
    // there — see the file's own note on why field configs are positional);
    // the shell reads it through `t(NAV_GROUP_LABELS[...])` when it draws a
    // heading, which is the seam this asserts.
    expect(SHELL, "the shell asks for the heading's translation at the draw site").toMatch(
      /t\(NAV_GROUP_LABELS\[/
    )
  })

  it("there is one heading per group and they are not the same word", () => {
    expect(headings().length, "a group with no heading has no chevron to press").toBe(3)
    expect(new Set(headings()).size, "two groups called the same thing is one group").toBe(3)
  })

  // ── AND THE ASSISTANT READS THE SAME SOURCE THE SCREEN DOES ───────────────
  //
  // `scripts/seed-knowledge-about-the-app.mjs` writes the app's own description
  // of itself into the knowledge base — it is what the assistant reads when
  // somebody asks what is in the menu. It used to name the sidebar's headings
  // as LITERAL STRINGS in its own prose, so a rename or a regroup could update
  // the rail and silently leave the assistant's description behind — the
  // owner renamed the two-group "Frequent"/"Occasional" split and the seed
  // script kept saying "Frequent" for a live half-day.
  //
  // Rebuilt 1 Sep 2026 to read `NAV_GROUP_ORDER`/`NAV_GROUP_LABELS` straight off
  // `web/lib/pages.ts` at RUN TIME instead — the same registry the rail itself
  // reads — so the two can no longer drift: there is only one place the words
  // are typed. That also means the words never appear as a literal in the
  // seed script's OWN source any more, so what this checks is the SEAM
  // instead of the string: the script parses the same two exports the rail
  // does, by name.
  it("the app's own description of its menu reads pages.ts, not a copy of it", () => {
    const seed = readFileSync(
      join(__dirname, "..", "..", "scripts", "seed-knowledge-about-the-app.mjs"),
      "utf8"
    )
    const body = stripComments(seed)
    expect(body, "reads the group order off pages.ts rather than typing it again").toMatch(
      /NAV_GROUP_ORDER/
    )
    expect(body, "reads the group labels off pages.ts rather than typing them again").toMatch(
      /NAV_GROUP_LABELS/
    )
    // …and it is reading the SAME FILE the rail's own headings come from.
    expect(body).toMatch(/"web",\s*"lib",\s*"pages\.ts"/)
    // A heading word the rail actually draws must never be hand-typed here —
    // the day it is, it can drift again the exact way it did before.
    for (const word of headings())
      expect(
        body.includes(word),
        `"${word}" is one of the rail's own headings and must not be typed literally in the seed script — read it off pages.ts instead`
      ).toBe(false)
  })
})
