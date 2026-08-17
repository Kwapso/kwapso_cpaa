// THE SHARED COMPONENTS ARE STYLED, AND THE FORM CANNOT SPILL.
//
// Two findings from one bug report on 17 Aug 2026, in the order they were found.
//
// 1 · Tailwind v4 discovers its sources from the project it is built inside, and
//     both front doors are their own npm workspaces. `shared/web/` is outside
//     both, so every class used ONLY there was silently dropped from the output.
//     Measured on staging: `form-shell.tsx`'s `pt-6` — the value an eleven-line
//     comment called "the ONE value that governs it everywhere" — computed to
//     0px, because `.pt-6` was in no stylesheet the app shipped. The documented
//     fix had never run, which is why the tester still saw the separator and the
//     submit button touching.
//
// 2 · The shell had no height bound, so a form taller than the window grew off
//     both ends of a centred dialog with nothing to scroll. On a 1280×640 window
//     the Edit story dialog measured 738px with its Save button below the fold.
//
// Both are structural, so both are checked structurally: a source directive that
// must exist in the one stylesheet both doors import, and a shell shape that must
// keep the three-row grid, the scrolling middle and the two padded edges. Reading
// the source off disk is this repo's house style for exactly this — a rule about
// how a file is written can only be held by reading it.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

const OVERRIDES = "shared/web/library-overrides.css"
const GLOBALS = ["web/app/globals.css", "web-portal/app/globals.css"]

describe("shared/web is a Tailwind source in both front doors", () => {
  it("the shared stylesheet declares itself a source", () => {
    const css = read(OVERRIDES)
    expect(
      /@source\s+["'][^"']*["']/.test(css),
      `${OVERRIDES} must carry an @source for shared/web — without it every utility ` +
        `used only by a shared component (FormShell, the language menu, the splash ` +
        `screen) is dropped from the built CSS and silently does nothing`
    ).toBe(true)
  })

  for (const g of GLOBALS) {
    it(`${g} imports it, so the directive reaches that door`, () => {
      expect(read(g), `${g} must @import ${OVERRIDES}`).toContain("library-overrides.css")
    })
  }
})

describe("FormShell cannot spill out of its dialog (UI-RULEBOOK F2/F3)", () => {
  const src = read("shared/web/form-shell.tsx")

  it("bounds its own height and scrolls the FIELDS, not the dialog", () => {
    expect(src, "the form needs a height cap, or a tall form grows off both ends").toContain(
      "max-h-[85dvh]"
    )
    expect(src, "three rows: header auto, fields 1fr, action bar auto").toContain(
      "grid-rows-[auto_1fr_auto]"
    )
    expect(src, "the middle row is the only scroller").toContain("overflow-y-auto")
  })

  it("has no free-standing separator — each edge belongs to a padded region", () => {
    // The import, not the word: the header comment explains why the separator
    // left, and a rule that forbids saying so would be a rule against comments.
    expect(
      /^\s*import\b.*\bfrom\s+["'][^"']*primitives\/separator/m.test(src),
      "a hairline with a gap under it can always collide with the button below at some " +
        "type scale; a border-t on a padded bar cannot"
    ).toBe(false)
    const edged = (src.match(/className="[^"]*\bborder-t\b[^"]*"/g) ?? []).length
    expect(edged, "one edge above the fields, one above the action bar").toBe(2)
  })

  it("is the last use of the separator primitive in either front door", () => {
    // F3 says so out loud, and it is worth holding: a separator divides peers,
    // and a form's action bar is not a peer of its fields.
    expect(src).not.toContain("<Separator")
  })
})
