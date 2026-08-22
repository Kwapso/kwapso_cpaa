// THE FOUR SLOTS THE TYPE MARK STILL CANNOT SIT IN — flagged, and now READ.
//
// ══════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS FOR
//
// UI-CONVENTIONS §5 (amended 17 Aug 2026) defines a TYPE MARK: one glyph, set as
// DATA on the team's own dropdown value, sitting in the slot a lucide icon would
// take and never inside a sentence. CHECKLIST 11.8 asks for one on every
// collection and 21.6 asks for glyphs on the main screens. Both shipped PART
// DONE, and both stop at the same wall in four places: the slot does not exist
// in the component library. That wall was a SEPARATE repo this one never edited;
// since 2026-08-22 the library is vendored into `shared/ui/` and the wall is
// ours, which changes what these four entries are asking for — not another
// repo's roadmap, but four slots this codebase can add whenever it decides to.
//
// UI-GAPS.md has carried those four as prose since. Prose is where a flag goes
// to rot in two directions at once:
//
//   • THE LIBRARY SHIPS THE SLOT and nobody here notices. The gap entry stays,
//     the screens stay bare, and the fix that arrived is a fix nobody applied.
//     This is the likelier of the two — the library is somebody else's release
//     note, and nothing in this repo reads it.
//   • THE ENTRY DESCRIBES A COMPONENT THAT HAS MOVED ON. A "one-line fix" that
//     names a function which no longer exists is a promise nobody can keep, and
//     it reads exactly like one that can.
//
// So each of the four is asserted against the INSTALLED library source, in both
// directions: the slot is still missing, AND the thing the entry says is already
// there really is there — because "the fix is one line" is the load-bearing half
// of every one of those entries, and it is the half that goes quietly false.
//
// A FAILURE HERE IS GOOD NEWS. It means the library shipped the slot, and the
// message says what to do: use it, and delete the UI-GAPS line in the same
// commit. This list can only shrink.
//
// IT READS THE LIBRARY SOURCE, DELIBERATELY — and since 2026-08-22 that source
// is `shared/ui/`, in this repo, rather than `node_modules/@kwapso/ui`. The
// reason is unchanged and is now simply more true: what is on disk is what this
// app is built against, and asking a published changelog what version we run
// would be asking a different question from the one that matters.
//
// One thing about these four entries DID change with the move, and it is worth
// saying plainly. "The fix is one line" used to mean "one line, in a repo we do
// not own, on their release schedule". It now means one line, here, today. So a
// failure below is no longer news about somebody else's library — it is a slot
// this repo added and has not yet used.
// ══════════════════════════════════════════════════════════════════════════════

import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const UI = join(ROOT, "shared", "ui")

function library(...parts: string[]): string {
  const path = join(UI, ...parts)
  // A missing file is not a passing check: it is this suite reading nothing.
  expect(existsSync(path), `the library file ${parts.join("/")} is gone — UI-GAPS needs re-reading`).toBe(true)
  return readFileSync(path, "utf8")
}

/** The `renderList` function's body, which is the whole of gap #16. Sliced out
 * so a `leading` anywhere ELSE in that 900-line file (the detail header has
 * one) cannot be mistaken for the row slot having arrived. */
function renderListBody(): string {
  const src = library("registry", "collections", "screen-renderer", "screen-renderer.tsx")
  const from = src.indexOf("function renderList(")
  expect(from, "screen-renderer no longer has a `renderList` — UI-GAPS #16 needs re-reading").toBeGreaterThan(-1)
  const to = src.indexOf("\nfunction renderDetail(", from)
  expect(to, "renderList is no longer followed by renderDetail — the slice is wrong").toBeGreaterThan(from)
  return src.slice(from, to)
}

describe("the type mark's four missing slots (UI-GAPS 16, 18, 19, 20)", () => {
  // ── #16 · A RECIPE-DRIVEN ROW ────────────────────────────────────────────
  // Every ticket, story, account and knowledge list in the app is drawn by
  // `ScreenRenderer`, which maps a row to `{ id, title, subtitle }`. The mark
  // has nowhere to go, and the workaround — writing the glyph into the title —
  // is the ONE shape §5 refuses. Widened 19 Aug 2026: the same missing slot
  // costs a PICTURE too, on four lists whose rows arrive carrying one.
  it("#16 · SHIPPED — renderList fills the leading slot, and the host feeds it", () => {
    const list = library("registry", "collections", "list", "list.tsx")
    expect(list, "ListItem must still declare `leading` — the slot the row is drawn in").toMatch(
      /leading\?:\s*React\.ReactNode/
    )
    // THE LIBRARY HALF, shipped in v0.11.0: the renderer reads a column off the
    // row and hands it to the slot.
    const body = renderListBody()
    expect(body, "renderList must still render the library List").toContain("<List")
    expect(
      /leading:\s*leadingOf\(row\)/.test(body),
      "renderList no longer passes a leading node to List — the row marks have gone dark"
    ).toBe(true)

    // AND THE HOST HALF, which is the part that actually puts a picture on a
    // screen. A recipe naming no `leading` column draws nothing, so the library
    // shipping the slot is worth exactly as much as the recipes that use it.
    const recipes = readFileSync(join(ROOT, "web", "lib", "screens.ts"), "utf8")
    const fed = [...recipes.matchAll(/leading:\s*"(\w+)"/g)].map((m) => m[1])
    expect(
      fed.length,
      "no list recipe names a `leading` column — the slot is open and every row is text again"
    ).toBeGreaterThan(0)

    // …and the column it names is a NODE the shaper builds, not a URL. Pointing
    // it at `logoUrl` renders the path as text in the slot, which is the one
    // failure mode the library's own note warns about.
    const shape = readFileSync(join(ROOT, "web", "components", "deep-link", "shape.tsx"), "utf8")
    for (const column of new Set(fed))
      expect(
        new RegExp(`${column}:\\s*<`).test(shape),
        `recipes name \`${column}\` as the leading column, but shape.tsx does not build a NODE for it — ` +
          "a bare string there renders as text in the slot rather than as a mark"
      ).toBe(true)
  })

  // ── #18 · A TAB ──────────────────────────────────────────────────────────
  // The Tickets strip has a tab per TICKET TYPE, and a type is exactly the thing
  // §5 gives a mark to — the same glyph the ticket's own header band draws.
  // `TabsView` resolves `icon` as a lucide NAME, so a pictograph in that slot
  // renders nothing at all.
  it("#18 · SHIPPED — a tab takes a node, and the ticket kinds carry their marks", () => {
    const tabs = library("registry", "primitives", "tabs", "tabs.tsx")
    expect(
      /icon\?:\s*(React\.)?ReactNode/.test(tabs),
      "TabItem no longer takes a node — the type marks on the ticket strip have gone dark"
    ).toBe(true)

    // The host half: the strip reads the glyph out of the TEAM'S vocabulary
    // rather than a map in the component, which is what makes an emoji edited on
    // the Dropdown values screen reach the tab without a deploy.
    const strip = readFileSync(join(ROOT, "web", "components", "tickets-collection.tsx"), "utf8")
    expect(
      /icon:\s*ticketMarks\.get\(/.test(strip),
      "the ticket type tabs no longer carry the team's own mark"
    ).toBe(true)
    expect(
      strip.includes("markMap("),
      "the strip must read its glyphs through the one type-mark seam (web/lib/type-marks.ts)"
    ).toBe(true)
  })

  it("#19 · SHIPPED — an empty state carries its concept glyph, and every recipe feeds one", () => {
    // The library half: the config declares the slot and the frame renders it.
    const config = library("lib", "config.ts")
    expect(config, "CollectionConfig must still declare emptyText").toMatch(/emptyText:\s*string/)
    expect(
      /emptyIcon/.test(config),
      "CollectionConfig no longer takes an `emptyIcon` — every recipe's empty state is a bare grey sentence again"
    ).toBe(true)
    const frame = library("registry", "collections", "collection-frame", "collection-frame.tsx")
    expect(
      /config\.emptyIcon/.test(frame),
      "the collection frame no longer reads `emptyIcon`, so the slot is declared and drawn by nobody"
    ).toBe(true)

    // AND THE HOST HALF, which is the part that puts a glyph on a screen. A
    // recipe that names none renders exactly what it rendered before, so the
    // library shipping the slot is worth precisely the recipes that use it.
    const recipes = readFileSync(join(ROOT, "web", "lib", "screens.ts"), "utf8")
    expect(
      /emptyIcon:\s*opts\.icon\s*\?\s*CONCEPT_ICON\[/.test(recipes),
      "listCollection no longer resolves its icon through CONCEPT_ICON — the empty state and the nav rail can now drift"
    ).toBe(true)

    // EVERY list recipe, not most of them. A brand-new team sees the empty state
    // of every screen in the app on its first day, and one bare sentence among
    // fourteen glyphs reads as the broken one.
    const calls = [...recipes.matchAll(/listCollection\([\s\S]*?\n\s*\)|listCollection\([^\n]*\)/g)]
      .map((m) => m[0])
      .filter((c) => !c.includes("emptyText: string") && !c.includes("…"))
    const bare = calls.filter((c) => !c.includes("icon:"))
    expect(
      bare.length,
      `${bare.length} list recipe(s) still have no concept glyph on their empty state:\n  ` +
        bare.map((c) => c.split("\n")[0].slice(0, 80)).join("\n  ")
    ).toBe(0)
  })

  // ── #20 · A BIG NUMBER ───────────────────────────────────────────────────
  it("#20 · SHIPPED — a stat card takes a glyph, and the numbers band carries one", () => {
    const grid = library("registry", "collections", "stat-grid", "stat-grid.tsx")
    expect(grid, "StatItem must still be the shape this check reads").toContain(
      "export interface StatItem"
    )
    const from = grid.indexOf("export interface StatItem")
    const item = grid.slice(from, grid.indexOf("}", from))
    expect(/icon/.test(item), "StatItem no longer takes an icon").toBe(true)

    const panel = readFileSync(join(ROOT, "web", "components", "work-logs-panel.tsx"), "utf8")
    expect(
      (panel.match(/icon:\s*<DynamicIcon name=\{CONCEPT_ICON\./g) ?? []).length,
      "the numbers band's cards no longer carry their concept icons"
    ).toBeGreaterThanOrEqual(3)
  })

  // …and the flag list itself cannot drift away from the four checks above. An
  // entry silently deleted here would leave the check standing over nothing;
  // an entry marked shipped would leave the check contradicting the document.
  it("UI-GAPS.md agrees with the four checks above — all four slots are closed", () => {
    const gaps = readFileSync(join(ROOT, "UI-GAPS.md"), "utf8")
    // ALL FOUR ARE NOW SHIPPED — #16, #18 and #20 in library v0.11.0 and #19 in
    // v0.12.0 (19 Aug 2026) — and each is asserted above as WIRED rather than as
    // missing. So this list is the other direction of the same bookkeeping: a
    // row still flagged for the library would be a flag pointing at nothing,
    // and a row deleted outright would leave its check standing over a gap
    // nobody records. Both are the rot this file exists to prevent.
    for (const n of [16, 18, 19, 20]) {
      const row = gaps.split("\n").find((line) => line.startsWith(`| ${n} |`))
      expect(row, `UI-GAPS.md has no row ${n} — this suite is checking a gap nobody records`).toBeTruthy()
      expect(
        (row as string).includes("flag for the library"),
        `UI-GAPS #${n} is still flagged for the library, but the check above asserts the slot is shipped AND fed`
      ).toBe(false)
      expect(
        /SHIPPED in the library/.test(row as string),
        `UI-GAPS #${n} does not record which library version closed it`
      ).toBe(true)
    }
  })
})
