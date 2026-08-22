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
