// THE SPACING SCALE IS A CLOSED SET, AND THIS IS WHAT CLOSES IT.
//
// The design kit's ruling 28 gives layout eleven steps on a 4px grid — 4, 8, 12,
// 16, 20, 24, 32, 48, 64, 96, 128 — plus four half-steps on a 2px sub-grid for
// inside a component (6, 10, 14, 18), "and there is no fifth". Only 1px and 2px
// live off the scale, as grid lines and optical nudges, never as layout.
//
// Tailwind's default spacing ramp is a SUPERSET of that: it also offers 28, 36,
// 40, 44, 56, 80 and more, all one keystroke away and none of them in the
// system. So the kit's scale is not something to configure, it is something to
// refuse — which needs a check, because nothing about typing `gap-10` looks
// wrong and the result is a 40px gap in a system that has no 40.
//
// WHAT IT FOUND WHEN IT WAS WRITTEN: seventeen sites, and one of them had an
// argument attached. `lg:px-10` was the shell's page gutter, with a comment
// saying it was "exactly the brand site's own 40px --margin--m". It snapped to
// 32 anyway, because the kit IS the brand's design system now and its page
// padding step is 32; a value inherited from the old site is exactly the kind of
// thing a re-theme is for. Every snap is listed in RESKIN-REPORT.md.
//
// IT DELIBERATELY DOES NOT POLICE h-* / w-* / size-*. A control's height is not
// layout rhythm — the kit fixes those separately (32 dense, 38 field-in-a-row,
// 40 control, 44 touch row, 56 table row), and folding them in here would report
// every one of them as a violation of a scale they were never on.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"

const ROOT = join(import.meta.dirname, "..", "..")

/** The steps ruling 28 admits, as Tailwind's own multiplier names.
 *  1 = 4px, so 1.5 = 6, 2 = 8 … 12 = 48, 16 = 64, 24 = 96, 32 = 128. */
const ADMITTED = new Set([
  "0",
  "px",
  "0.5", // 2px — an optical nudge, named by the ruling as one of the two exceptions
  "1", // 4
  "1.5", // 6   half-step
  "2", // 8
  "2.5", // 10  half-step
  "3", // 12
  "3.5", // 14  half-step
  "4", // 16
  "4.5", // 18  half-step
  "5", // 20
  "6", // 24
  "8", // 32
  "12", // 48
  "16", // 64
  "24", // 96
  "32", // 128
])

/** Gaps, padding and margin — the properties that make layout rhythm. */
const SPACING = /(?:^|[\s"'`:])-?(gap|gap-x|gap-y|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|space-x|space-y)-(\[[^\]]+\]|[0-9]+(?:\.5)?)\b/g

describe("the spacing scale", () => {
  it("design-scale: every gap, padding and margin is a step the kit admits", () => {
    const roots = [join(ROOT, "web"), join(ROOT, "web-portal"), join(ROOT, "shared")]
    const lawBook = join(ROOT, "shared", "rules") // it quotes what it forbids
    const offenders: string[] = []
    let seen = 0

    for (const f of sourceFiles(roots, { extensions: [".tsx", ".ts"], relativeTo: ROOT, skipTests: true })) {
      if (f.path.startsWith(lawBook)) continue
      for (const [, prop, step] of stripComments(f.source).matchAll(SPACING)) {
        seen++
        if (ADMITTED.has(step)) continue
        offenders.push(`${f.rel}: ${prop}-${step}`)
      }
    }

    // A census that matches nothing reports the same all-clear as one that
    // matched everything and found no fault.
    expect(seen, "the spacing census found almost nothing — the pattern has gone blind").toBeGreaterThan(500)
    expect(
      offenders,
      `these use a spacing step the kit does not have (ruling 28: 4/8/12/16/20/24/32/48/64/96/128, plus 6/10/14/18 inside a component, and there is no fifth). Snap each to the nearest admitted step:\n  ${offenders.join("\n  ")}`
    ).toEqual([])
  })
})

// THE GAP BETWEEN A TAB STRIP AND WHAT IT LABELS HAS ONE OWNER.
//
// Client ruling, 2026-09-03, on the live app: "there needs to be space between
// the tabs and the start of the container. This is already correct on detail
// screens... Go and uniform that, and make sure that you don't hard-code page
// by page, but rather you change the rule and you apply it everywhere."
//
// It had drifted because it was two decisions. A detail screen held the space
// as `--record-tab-gap` (record-chrome.tsx); a main screen held a deliberate
// ZERO, written out at three separate call sites for a folder-tab overlap that
// no longer exists. Now both read one custom property, and this is what stops
// either side quietly reverting to a number of its own — the failure is SILENT
// in both directions: an undeclared `var()` computes to nothing and simply
// removes the space again, and a hard-coded step back in either file would
// still pass the scale check above, because 20px is a perfectly legal step.
// Only "the same value, from one place" is the thing that broke.
describe("the tab-to-content gap", () => {
  const read = (rel: string) => stripComments(readFileSync(join(ROOT, rel), "utf8"))

  it("design-scale: the gap is declared exactly once, and both strips read it", () => {
    expect(
      /--tab-content-gap:\s*var\(--space-\d+\)/.test(read("web/app/globals.css")),
      "web/app/globals.css must declare --tab-content-gap from a kit space token — it is the one place this number lives"
    ).toBe(true)

    expect(
      read("shared/web/screen-engine/tabs-view.tsx"),
      "STICKY_FOLDER_TABS (every main/collection strip, through renderFolderTabs) must read --tab-content-gap as PADDING on the sticky strip's own box, not a margin on whatever comes after it — a margin between two siblings is never painted and stops meaning anything once the strip pins on scroll"
    ).toContain("pb-[var(--tab-content-gap)]")

    expect(
      read("web/components/record-chrome.tsx"),
      "a detail screen's --record-tab-gap must resolve to the same --tab-content-gap, or the two halves of the app can drift apart again"
    ).toContain("[--record-tab-gap:var(--tab-content-gap)]")
  })

  it("design-scale: no collection strip is drawn outside the one seam", () => {
    // `renderFolderTabs` is where the sticky rule AND the gap are applied, so a
    // MAIN screen hand-rolling its own <TabsView> above its rows silently opts
    // out of both — which is exactly what tickets-collection.tsx did until
    // 2026-09-03 (its strip never pinned, and it carried the fourth copy of the
    // zero gap).
    //
    // NARROW, ON PURPOSE, IN TWO WAYS. It reads only the files that ARE a main
    // screen (`*-screen.tsx` / `*-collection.tsx`, this app's own naming for
    // one), so an inner strip inside a record's panel (work-panels.tsx,
    // process/steps-panel.tsx) and the team's own section NAV (team-section-nav
    // .tsx, a strip whose "panel" is a routed page) are not candidates at all —
    // none of them sits above a collection. And a strip that hands `TabsView` a
    // `renderPanel` is drawing its own content directly underneath, which is
    // the kit's own gap to own (settings-screen.tsx, kwapso-screen.tsx), not
    // this rule's.
    const offenders: string[] = []
    let mainScreens = 0
    for (const f of sourceFiles([join(ROOT, "web", "components")], {
      extensions: [".tsx"],
      relativeTo: ROOT,
      skipTests: true,
    })) {
      if (!/(?:-screen|-collection)\.tsx$/.test(f.rel)) continue
      mainScreens++
      const src = stripComments(f.source)
      if (!/<TabsView/.test(src)) continue
      if (/renderPanel/.test(src)) continue // draws its own panel: the kit owns that gap
      offenders.push(f.rel)
    }
    // A census that reads nothing reports the same all-clear as one that read
    // every screen and found no fault.
    expect(
      mainScreens,
      "the main-screen census found almost nothing — the derivation has gone blind"
    ).toBeGreaterThanOrEqual(15)
    expect(
      offenders,
      `these draw a bare <TabsView> that is neither a record's inner strip nor a panelled one — a collection's strip goes through renderFolderTabs so the sticky rule and the tab-to-content gap reach it:\n  ${offenders.join("\n  ")}`
    ).toEqual([])
  })
})
