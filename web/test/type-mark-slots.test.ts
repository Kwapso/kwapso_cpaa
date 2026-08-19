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
// in `@kwapso/ui`, which is a SEPARATE repo this one never edits.
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
// IT READS `node_modules`, DELIBERATELY. The library is pinned in package.json
// and installed from GitHub, so what is on disk is what this app is built
// against — asking a published changelog what version we run would be asking a
// different question from the one that matters.
// ══════════════════════════════════════════════════════════════════════════════

import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const UI = join(ROOT, "node_modules", "@kwapso", "ui")

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
  it("#16 · List HAS a leading slot, and renderList still passes nothing to it", () => {
    // The half that makes the fix one line. If this ever fails, the entry's
    // "the library already HAS the slot" has gone false and the plan changes.
    const list = library("registry", "collections", "list", "list.tsx")
    expect(list, "ListItem must still declare `leading` — UI-GAPS #16 stands on it").toMatch(
      /leading\?:\s*React\.ReactNode/
    )

    const body = renderListBody()
    // It builds a `<List>`, or this is not the function the gap is about.
    expect(body, "renderList must still render the library List").toContain("<List")
    expect(
      /leading\s*:/.test(body),
      "GOOD NEWS: `renderList` now passes a `leading` to List. Feed it the type mark " +
        "(web/lib/type-marks.ts + shared/web/record-mark.tsx), close CHECKLIST 11.8's row half, " +
        "and delete UI-GAPS #16 in the same commit."
    ).toBe(false)
  })

  // ── #18 · A TAB ──────────────────────────────────────────────────────────
  // The Tickets strip has a tab per TICKET TYPE, and a type is exactly the thing
  // §5 gives a mark to — the same glyph the ticket's own header band draws.
  // `TabsView` resolves `icon` as a lucide NAME, so a pictograph in that slot
  // renders nothing at all.
  it("#18 · TabsTrigger takes a node, and TabsView still narrows it to a lucide name", () => {
    const tabs = library("registry", "primitives", "tabs", "tabs.tsx")
    // The half that makes the fix one line: the trigger's own slot is already a
    // node, so only the config-driven wrapper narrows it.
    expect(tabs, "TabsTrigger must still take `icon?: React.ReactNode`").toMatch(
      /icon\?:\s*React\.ReactNode/
    )
    // …and the wrapper still turns a STRING into an icon and nothing else.
    expect(
      /icon:\s*string/.test(tabs),
      "GOOD NEWS: `TabItem.icon` is no longer typed `string`. Put the team's type mark on the " +
        "Tickets type tabs (web/components/tickets-collection.tsx) and delete UI-GAPS #18."
    ).toBe(true)
    expect(tabs, "TabsView must still resolve the name through DynamicIcon").toContain("DynamicIcon")
  })

  // ── #19 · AN EMPTY STATE ─────────────────────────────────────────────────
  // Every empty state the host composes itself leads with a glyph
  // (components/deep-link/screen-bits.tsx), because a lone line of grey text
  // reads as a screen that FAILED rather than one with nothing on it yet — and
  // that is precisely the screen a brand-new team sees on every page. A recipe
  // cannot say it.
  it("#19 · the collection frame's empty state is still a bare string", () => {
    const config = library("lib", "config.ts")
    expect(config, "CollectionConfig must still declare emptyText").toMatch(/emptyText:\s*string/)
    expect(
      /emptyIcon/.test(config),
      "GOOD NEWS: the collection config now takes an `emptyIcon`. Give every recipe collection the " +
        "section's own CONCEPT_ICON (web/lib/pages.ts) and delete UI-GAPS #19."
    ).toBe(false)
  })

  // ── #20 · A BIG NUMBER ───────────────────────────────────────────────────
  // The Home band's four cards are Open tickets, Work in hand, Admin due and
  // Hours this week — every one of them a CONCEPT that already owns an icon in
  // `CONCEPT_ICON`. Writing a glyph into `label` would be emoji in copy, which
  // §5 forbids outright.
  it("#20 · a stat card still has no slot but the trend arrow", () => {
    const grid = library("registry", "collections", "stat-grid", "stat-grid.tsx")
    // The census must not go blind: this is the interface the gap is about.
    expect(grid, "StatItem must still be the shape UI-GAPS #20 describes").toContain(
      "export interface StatItem"
    )
    const from = grid.indexOf("export interface StatItem")
    const item = grid.slice(from, grid.indexOf("}", from))
    expect(
      /icon/.test(item),
      "GOOD NEWS: `StatItem` now takes an icon. Give the pulse band its concept icons " +
        "(web/components/pulse.tsx) and delete UI-GAPS #20."
    ).toBe(false)
  })

  // …and the flag list itself cannot drift away from the four checks above. An
  // entry silently deleted here would leave the check standing over nothing;
  // an entry marked shipped would leave the check contradicting the document.
  it("UI-GAPS.md still carries all four, flagged for the library", () => {
    const gaps = readFileSync(join(ROOT, "UI-GAPS.md"), "utf8")
    for (const n of [16, 18, 19, 20]) {
      const row = gaps.split("\n").find((line) => line.startsWith(`| ${n} |`))
      expect(row, `UI-GAPS.md has no row ${n} — this suite is checking a gap nobody records`).toBeTruthy()
      expect(
        (row as string).includes("flag for the library"),
        `UI-GAPS #${n} is no longer flagged for the library, but the slot is still missing here`
      ).toBe(true)
    }
  })
})
