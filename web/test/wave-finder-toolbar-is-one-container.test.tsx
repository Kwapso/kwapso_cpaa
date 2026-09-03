// WAVEFINDER'S OWN TRACK GETS THE SAME "ONE CONTAINER" FIX `ToolbarRow` DOES.
//
// See `web/test/paged-find-toolbar-is-one-container.test.tsx`'s own header for
// the client ruling (2026-09-03, verbatim: "merge this with the main toolbar
// so that it's one single background or container, more like expand behaviour
// rather than open-a-new-one behaviour") and the shape it forbids. `WaveFinder`
// (this file's own subject) is the THIRD hand-drawn copy of the same track —
// alongside `ToolbarRow` (screen-bits.tsx) and `PagedFind` — and it carried the
// identical unfixed shape: `rounded-pill bg-background` on the track itself,
// unconditionally, with the open panel one `gap-2` below it as a second
// sibling of the same tone. Waves is the one screen whose toolbar is this
// component rather than `ToolbarRow` or the frame's own, so nothing else
// caught it.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as React from "react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { WaveFinder, EMPTY_WAVE_QUERY } from "@/components/wave-finder"
import type { Account } from "@shared/types"

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

const CLIENTS: Account[] = [{ id: "a1", name: "Bergman S.A." } as Account]

function Harness() {
  const [query, setQuery] = React.useState(EMPTY_WAVE_QUERY)
  return <WaveFinder query={query} onChange={setQuery} clients={CLIENTS} />
}

const openPanel = () => fireEvent.click(screen.getByRole("button", { name: /^Filter/ }))

describe("WaveFinder's toolbar is one container, exactly like ToolbarRow's", () => {
  it("the track never moves, the panel paints no surface, and one container switches radius", async () => {
    render(<Harness />)

    const column = document.querySelector('[data-slot="toolbar-row-column"]')
    expect(column, "the toolbar must be wrapped in its own merged container").toBeTruthy()
    const track = document.querySelector('[data-slot="toolbar-row-track"]') as HTMLElement
    expect(track, "the track is a named child of the merged container").toBeTruthy()
    expect(column!.contains(track), "the track lives inside the merged container").toBe(true)

    expect(document.querySelector('[data-slot="filter-bar-row"]'), "nothing is open yet").toBeNull()
    expect(column!.className).toContain("bg-background")
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
    ).not.toMatch(/rounded-pill|bg-background/)
    const closedTrack = track.outerHTML

    openPanel()
    const panelRow = await waitFor(() => {
      const node = document.querySelector('[data-slot="filter-bar-row"]') as HTMLElement | null
      expect(node).toBeTruthy()
      return node!
    })

    expect(track.outerHTML, "opening the panel must not change the track's own markup").toBe(
      closedTrack
    )
    expect(track.contains(panelRow), "the panel must never be inside the track").toBe(false)
    expect(column!.contains(panelRow), "the panel lives in the merged container").toBe(true)
    expect(
      panelRow.className,
      "an in-flow panel positions nothing — no overlay"
    ).not.toMatch(/(?:^|\s)(?:absolute|fixed|sticky|top-full|inset-x-0|z-\d+)(?:\s|$)/)
    expect(
      panelRow.className,
      "the open panel must not paint its own background — one surface, not two"
    ).not.toMatch(/bg-background/)
    expect(
      panelRow.className,
      "the open panel must not round its own corners — the merged container does"
    ).not.toMatch(/rounded-\[var\(--radius\)\]/)

    expect(column!.className, "the container still owns the single background").toContain(
      "bg-background"
    )
    expect(
      column!.className,
      "a panel is open — the container must switch to the box radius"
    ).toContain("rounded-[var(--radius)]")
    expect(
      column!.className,
      "the two radii never both apply — expanded drops the pill"
    ).not.toMatch(/(?:^|\s)rounded-pill(?:\s|$)/)

    openPanel()
    await waitFor(() =>
      expect(document.querySelector('[data-slot="filter-bar-row"]')).toBeNull()
    )
    expect(track.outerHTML).toBe(closedTrack)
    expect(column!.className).toContain("rounded-pill")
    expect(column!.className).not.toContain("rounded-[var(--radius)]")
  })
})
