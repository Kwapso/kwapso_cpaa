// PAGEDFIND'S OWN TRACK GETS THE SAME "ONE CONTAINER" FIX `ToolbarRow` DOES.
//
// CLIENT RULING, 2026-09-03, verbatim: "what this is doing is creating a new
// card underneath... it kind of creates a second toolbar. This is not the
// behaviour I want. I want it to look together, so merge this with the main
// toolbar so that it's one single background or container, more like expand
// behaviour rather than open-a-new-one behaviour."
//
// `web/test/filter-row-is-the-kits.test.tsx` already locks this property for
// `ToolbarRow` (screen-bits.tsx). `PagedFind` (this file's own subject) draws
// the IDENTICAL track by hand — its own header comment says so verbatim,
// "same treatment as `ToolbarRow`" — and until this pass it had NOT received
// the fix: the track kept `rounded-pill bg-background` unconditionally, and
// the open panel sat one `gap-2` below it as a second sibling, which is
// exactly the two-same-toned-boxes-with-air-between-them shape the ruling
// above is naming. Since `paged-find.tsx` backs Tickets, Stories, Processes,
// Meetings, Contacts and more, that was the regression showing on every one
// of them, not merely a cosmetic gap in one screen.
//
// This proves the same three properties `filter-row-is-the-kits.test.tsx`
// proves for `ToolbarRow`, against `PagedFind`'s own DOM: the track never
// moves when the panel opens, the panel is a normal-flow sibling that paints
// no surface of its own, and the single merged container is the only element
// that switches radius, off `Boolean` of the panel and never off a measured
// height.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { PagedFind, type FindQuery } from "@/components/paged-find"

type Row = { id: string; name: string }

/** Radix measures itself and captures the pointer; jsdom does neither, and
 * without these the facet panel's own trigger never opens. */
beforeAll(() => {
  Object.assign(window.HTMLElement.prototype, {
    scrollIntoView: () => {},
    hasPointerCapture: () => false,
    releasePointerCapture: () => {},
    setPointerCapture: () => {},
  })
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

afterEach(cleanup)

/** THE TRACK'S SHAPE, with the one attribute that is SUPPOSED to change
 * normalised away.
 *
 * This assertion exists for the client's "one container" ruling: opening the
 * filter panel must not make the pill move, resize or repaint. `outerHTML`
 * was a fair proxy for that — until the add-filter button gained
 * `aria-expanded` (kit v1.2.42), which flips false→true precisely BECAUSE the
 * panel opened. That is a state announcement for a screen reader, not a
 * visual change: a person watching the pill sees nothing move, and a person
 * listening finally hears that the control expands something.
 *
 * So the comparison drops `aria-expanded` and keeps everything else byte for
 * byte — a class, a style, a structural change or a second attribute flipping
 * still fails it. Normalising the whole attribute (rather than asserting one
 * expected value) is deliberate: the point here is that the track did not
 * move, and the aria state has its own test elsewhere. */
const trackShape = (el: HTMLElement) =>
  el.outerHTML.replace(/ aria-expanded="(?:true|false)"/g, "")


const fetchPage = async (_query: FindQuery, _cursor: string | null) => ({
  rows: [{ id: "a", name: "x" }] as Row[],
  nextCursor: null,
  total: 1,
})

function renderFind() {
  return render(
    <PagedFind<Row>
      listKey={`test:${Math.random()}`}
      placeholder="Search…"
      matches={{ none: "No matches", one: "1 match", many: "{count} matches" }}
      facets={[
        {
          field: "kind",
          label: "Type",
          control: "select",
          options: [
            { value: "meeting", label: "From a meeting" },
            { value: "note", label: "A note" },
          ],
        },
      ]}
      // R50 — this suite exercises the toolbar's own merged-container shape,
      // which only exists to test while the row is actually drawn.
      restingEmpty={false}
      fetchPage={fetchPage}
    >
      {() => <div data-testid="rows" />}
    </PagedFind>
  )
}

const openPanel = () => fireEvent.click(screen.getByRole("button", { name: /^Filter/ }))

describe("PagedFind's toolbar is one container, exactly like ToolbarRow's", () => {
  it("the track never moves, the panel paints no surface, and one container switches radius", async () => {
    renderFind()

    const column = document.querySelector('[data-slot="toolbar-row-column"]')
    expect(column, "the toolbar must be wrapped in its own merged container").toBeTruthy()
    const track = document.querySelector('[data-slot="toolbar-row-track"]') as HTMLElement
    expect(track, "the track is a named child of the merged container").toBeTruthy()
    expect(column!.contains(track), "the track lives inside the merged container").toBe(true)

    // i · CLOSED: one container, pill-shaped, one fill — the track itself
    // carries neither.
    expect(document.querySelector('[data-slot="filter-bar-row"]'), "nothing is open yet").toBeNull()
    expect(column!.className).toContain("bg-[var(--surface-raised)]")
    expect(column!.className, "collapsed reads as the pill every other toolbar wears").toContain(
      "rounded-pill"
    )
    expect(
      column!.className,
      "the two radii never both apply — collapsed is pill-only"
    ).not.toContain("rounded-[var(--radius)]")
    expect(
      track.className,
      "the track paints no fill or shape of its own — the merged container does"
    ).not.toMatch(/rounded-pill|bg-background|bg-\[var\(--surface-raised\)\]/)
    const closedTrack = trackShape(track)

    openPanel()
    const panel = await screen.findByRole("group", { name: "Type" })
    const panelRow = panel.closest('[data-slot="filter-bar-row"]') as HTMLElement
    expect(panelRow, "the panel opens").toBeTruthy()

    // ii · THE TRACK ITSELF DID NOT MOVE.
    expect(
      trackShape(track),
      "opening the panel must not change the track's own markup"
    ).toBe(closedTrack)
    expect(track.contains(panelRow), "the panel must never be inside the track").toBe(false)

    // iii · THE PANEL IS IN FLOW, UNDER THE TRACK, AND PAINTS NOTHING OF ITS OWN.
    expect(
      panelRow.className,
      "an in-flow panel positions nothing — no overlay"
    ).not.toMatch(/(?:^|\s)(?:absolute|fixed|sticky|top-full|inset-x-0|z-\d+)(?:\s|$)/)
    expect(column!.contains(panelRow), "the panel lives in the merged container").toBe(true)
    expect(
      track.compareDocumentPosition(panelRow) & Node.DOCUMENT_POSITION_FOLLOWING,
      "…and beneath it, never before it"
    ).toBeTruthy()
    expect(
      panelRow.className,
      "the open panel must not paint its own background — one surface, not two"
    ).not.toMatch(/bg-background|bg-\[var\(--surface-raised\)\]/)
    expect(
      panelRow.className,
      "the open panel must not round its own corners — the merged container does"
    ).not.toMatch(/rounded-\[var\(--radius\)\]/)

    // iv · OPEN: the SAME container switches shape.
    expect(column!.className, "the container still owns the single background").toContain(
      "bg-[var(--surface-raised)]"
    )
    expect(
      column!.className,
      "a panel is open — the container must switch to the box radius"
    ).toContain("rounded-[var(--radius)]")
    expect(
      column!.className,
      "the two radii never both apply — expanded drops the pill"
    ).not.toMatch(/(?:^|\s)rounded-pill(?:\s|$)/)

    // v · AND IT CLOSES BACK TO EXACTLY THE SAME PILL.
    openPanel()
    await waitFor(() =>
      expect(document.querySelector('[data-slot="filter-bar-row"]')).toBeNull()
    )
    expect(trackShape(track)).toBe(closedTrack)
    expect(column!.className).toContain("rounded-pill")
    expect(column!.className).not.toContain("rounded-[var(--radius)]")
  })
})
