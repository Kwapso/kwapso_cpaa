// ONE FOCUS RING, AND NOTHING MAY TURN IT OFF (ruling 24).
//
// The design kit withdrew an earlier no-ring departure from WCAG 2.4.7 — "it was
// an accessibility gap and a procurement risk" — and it came back as exactly one
// spec for every control at once: a 2px outline at 2px offset, on
// `:focus-visible` only, defined once in the base layer.
//
// TWO THINGS ARE BANNED, and the second is the one that bites.
//
// A PER-COMPONENT RING is a second opinion about a decision the system already
// made. 150 of them existed across 38 files, and they disagreed: some rang at
// `ring-2` with an offset, some without, some on `focus:` rather than
// `focus-visible:` so a mouse click lit them up too.
//
// `outline-none` IS THE DANGEROUS ONE. Every one of those rings sat beside an
// `outline-none` that suppressed the browser's own indicator, because the ring
// was replacing it. Take the rings out and leave the suppression behind and the
// control has NO focus indicator at all — strictly worse than before anyone
// touched it, invisible to anyone using a mouse, and total for anyone who is
// not. So the two are checked together and neither may come back.
//
// It reads the SOURCE rather than the built CSS on purpose: `outline-none` in a
// className is the mistake, and it is a mistake whether or not that component is
// currently rendered.
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"
import { readFileSync } from "node:fs"

const ROOT = join(import.meta.dirname, "..", "..")

const BANNED =
  /\b(?:focus-visible:ring-[a-z0-9/[\]-]+|focus:ring-[a-z0-9/[\]-]+|focus-visible:ring-offset-[a-z0-9-]+|focus:ring-offset-[a-z0-9-]+|focus-visible:outline-none|focus:outline-none|outline-none)\b/g

describe("the focus ring", () => {
  it("focus-ring: no component defines its own, and nothing suppresses the outline", () => {
    const roots = [join(ROOT, "web"), join(ROOT, "web-portal"), join(ROOT, "shared")]
    const lawBook = join(ROOT, "shared", "rules") // it quotes what it forbids
    const offenders: string[] = []
    let scanned = 0

    for (const f of sourceFiles(roots, { extensions: [".tsx", ".ts"], relativeTo: ROOT, skipTests: true })) {
      if (f.path.startsWith(lawBook)) continue
      scanned++
      for (const hit of stripComments(f.source).match(BANNED) ?? []) offenders.push(`${f.rel}: ${hit}`)
    }

    expect(scanned, "the focus census found almost no files — the walk has gone blind").toBeGreaterThan(200)
    expect(
      offenders,
      `ruling 24: the ring is ONE rule in shared/ui/styles.css, and nothing focusable may set outline: none. Delete these:\n  ${offenders.join("\n  ")}`
    ).toEqual([])
  })

  it("focus-ring: …and the one rule that replaced them is still there", () => {
    // A census of absences passes perfectly against an app that has no focus
    // styling at all, which is precisely the state this check exists to prevent.
    const css = readFileSync(join(ROOT, "shared", "ui", "tokens", "tokens.css"), "utf8")
    expect(css, "the one :focus-visible rule is gone — every control now has no ring at all").toMatch(
      /:focus-visible\s*\{[^}]*outline:\s*var\(--focus-width\)\s+solid\s+var\(--focus\)/
    )
    expect(css, "the ring must be held off the edge").toMatch(
      /:focus-visible\s*\{[^}]*outline-offset:\s*var\(--focus-offset\)/
    )
    for (const token of ["--focus:", "--focus-width:", "--focus-offset:"])
      expect(css, `${token} must be defined for the ring to resolve`).toContain(token)
  })
})
