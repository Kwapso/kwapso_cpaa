// A CONTROL THAT OPENS OVER A DIALOG MUST BE ABOVE IT.
//
// The kit portals its floating surfaces to the document root, which is right:
// a list that escapes the form's `overflow` can never be clipped by it. The
// cost is that its z-index then competes with every other overlay in the app
// rather than with the form it belongs to — and one number, set once, decides
// whether a control works.
//
// `Select` was at 50 against a dialog at 60. Inside a dialog the list rendered
// BEHIND the dialog it was opened from: the options were painted, and every
// click landed on the surface in front of them. That is the worst shape a bug
// can take, because the control looks broken rather than hidden.
//
// It was invisible on every desktop review — a short list opens below a field
// with the dialog's own body behind it, so it reads fine — and unmissable on a
// phone, where the list fills the screen. It was reported from a handset as a
// form with three pickers that could not be used at all, on `Add a step`:
// how often, who does it, and what it is done in. Eleven files in the two front
// doors put a Select inside a dialog, so it was never one form.
//
// WHY THIS TEST LIVES HERE AND NOT UPSTREAM. `shared/ui/` is hash-pinned and
// this repo may not edit it (fixed in kit v1.0.2). What this repo CAN do is
// refuse a sync that drops a portalled surface back under the overlay line.
//
// Nothing here is hand-listed. The overlay layers are read out of the files
// that set them, the portalled surfaces are the files that render a Radix
// `Portal`, and the comparison is arithmetic.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"

const HERE = dirname(fileURLToPath(import.meta.url)) // web/test
const ROOT = join(HERE, "..", "..")
const CONTROLS = join(ROOT, "shared/ui/controls")

/** Every `z-[N]` / `z-N` a file actually SETS, as numbers. Tailwind writes the
 * arbitrary form in brackets and the scale form bare; both are the same
 * property.
 *
 * COMMENTS ARE STRIPPED FIRST, and that is not tidiness — this check failed to
 * bite the first time it was pointed at the real regression, because the fix's
 * own comment upstream explains the layers in prose ("…at 70") and the prose
 * satisfied the regex. A file that DISCUSSES a layer is not a file that sets
 * one. Same reason every seam scan in this repo strips comments first. */
function layers(source: string): number[] {
  const out: number[] = []
  for (const m of stripComments(source).matchAll(/\bz-(?:\[(\d+)\]|(\d+)\b)/g)) {
    out.push(Number(m[1] ?? m[2]))
  }
  return out
}

/** A file's TOP layer — the one its outermost floating surface sits on. The
 * small numbers inside a component (a close button at `z-[1]`, a sticky header
 * at `z-10`) are scoped to that component's own box and are not overlay
 * layers, so the maximum is the one that competes. */
const top = (source: string) => Math.max(0, ...layers(source))

describe("a portalled surface clears the dialog it opens from", () => {
  const controls = sourceFiles(CONTROLS, { extensions: [".tsx"], skipTests: true, relativeTo: ROOT })

  /** THE OVERLAY LINE, derived: the highest layer a DIALOG claims — the
   * surface a form lives in, which is what everything anchored must clear.
   *
   * Sheet left this derivation on 25 Aug 2026: it now holds TWO layers — 55
   * as a page drawer (correctly under a dialog) and an opt-in 70 when it is
   * an input surface opened from inside one (`overDialog`, kit v1.0.5) — so
   * "the file's max z" stopped meaning "the page overlay layer" for it. It
   * stays in the STACK set below (it is still not an anchored control), and
   * its elevated branch gets its own assertion at the end. */
  const OVERLAY_FILES = ["dialog/dialog.tsx", "alert-dialog/alert-dialog.tsx", "sheet/sheet.tsx"]
  const overlayLine = Math.max(
    ...["dialog/dialog.tsx", "alert-dialog/alert-dialog.tsx"].map((rel) =>
      top(readFileSync(join(CONTROLS, rel), "utf8")),
    ),
  )

  it("the overlay line is a real, single number", () => {
    // Guards the derivation itself: if the kit stops setting a z-index on its
    // dialogs, every assertion below would pass vacuously.
    expect(overlayLine).toBeGreaterThan(0)
  })

  it("nothing anchored to a control sits under it", () => {
    const under: string[] = []
    /* The overlay STACK itself is not the subject. A sheet is 55 and a dialog
       is 60 on purpose — they are peers ordering themselves, not controls
       opening over a form. Everything else that portals is anchored to a
       trigger, and a trigger can be inside a dialog. */
    const stack = new Set(OVERLAY_FILES.map((rel) => `shared/ui/controls/${rel}`))
    for (const file of controls) {
      if (stack.has(file.rel)) continue
      // Portalled = it renders through a Radix Portal, so it leaves the form's
      // stacking context and lands beside the dialog rather than inside it.
      if (!/\.Portal\b/.test(file.source)) continue
      const z = top(file.source)
      // A portalled surface that sets no layer at all inherits document order,
      // which is its own bug — but not this one, and not this test's subject.
      if (z === 0) continue
      if (z < overlayLine) under.push(`${file.rel} (z-${z} < z-${overlayLine})`)
    }
    expect(
      under,
      "these portal to the document root and sit UNDER the dialog line, so " +
        "inside a dialog they render behind it and every click lands on the " +
        "dialog. Raise them to the anchored layer in Kwapso/design and re-sync.",
    ).toEqual([])
  })

  it("Select in particular, because this is the one that shipped broken", () => {
    const select = readFileSync(join(CONTROLS, "select/select.tsx"), "utf8")
    expect(/\.Portal\b/.test(select), "Select still portals").toBe(true)
    expect(top(select)).toBeGreaterThan(overlayLine)
  })

  it("a sheet asked to open over a dialog clears it (overDialog, kit v1.0.5)", () => {
    // The second handset report: the client picker's SEARCH SHEET painted
    // behind the Sell-a-wave dialog — a page drawer under a dialog is right,
    // an input surface under the form asking for it is not. The elevated
    // branch must exist and must clear the line.
    const sheet = readFileSync(join(CONTROLS, "sheet/sheet.tsx"), "utf8")
    expect(/overDialog/.test(sheet), "the overDialog branch went missing from the kit's sheet").toBe(true)
    expect(top(sheet)).toBeGreaterThan(overlayLine)
  })
})
