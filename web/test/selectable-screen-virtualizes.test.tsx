// A DROPDOWN CATEGORY CAN GROW PAST WHAT A BROWSER SHOULD RENDER AT ONCE.
//
// selectable-screen.tsx fetches every one of a team's dropdown values in one
// unpaginated GET (capped at LIST_HARD_CAP, 1,000) and used to map every row
// into the DOM regardless of how many came back. This locks in the fix:
// use-virtual-rows now windows any GROUP (the screen's own list is split by
// `type`) once that group crosses the hook's threshold — proven here by a
// synthetic 400-row group next to an untouched 3-row one, so the same render
// pass demonstrates both the windowing AND that a short group is unaffected.
//
// What jsdom cannot prove (no real layout, no real scroll physics) is left to
// a live-browser pass with real staging data — this is the cheap structural
// check that catches an invalid-markup or a wrong-aria bug before that.

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SelectableScreen } from "@/components/selectable-screen"
import type { SelectableValue } from "@shared/types"

afterEach(cleanup)

const BIG_GROUP = 400
const SMALL_GROUP = 3

function value(id: string, type: string, val: string): SelectableValue {
  return {
    id,
    type,
    value: val,
    mark: null,
    active: true,
    isDefault: false,
    nameDe: null,
    description: null,
    standardDays: null,
  } as SelectableValue
}

function makeValues(): SelectableValue[] {
  const rows: SelectableValue[] = []
  for (let i = 0; i < BIG_GROUP; i++) rows.push(value(`big-${i}`, "Big group", `Value ${i}`))
  for (let i = 0; i < SMALL_GROUP; i++) rows.push(value(`small-${i}`, "Small group", `Small ${i}`))
  return rows
}

vi.mock("@shared/web/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/web/store")>()
  return {
    ...actual,
    useCached: (key: string | null) => {
      if (key?.startsWith("selectable:")) return { data: makeValues(), error: undefined, loading: false }
      if (key?.startsWith("my-perms:")) return { data: {}, error: undefined, loading: false }
      return { data: undefined, error: undefined, loading: true }
    },
  }
})

describe("the dropdown-values screen windows a group that has grown", () => {
  it("renders far fewer than 400 rows for the big group, and every row for the small one", () => {
    render(<SelectableScreen teamId="t1" />)

    // THE SMALL GROUP IS UNTOUCHED. Every one of its three values is a real
    // row — proof that windowing is a per-group decision, not a global one.
    // `getByText` itself throws if the text is not found, so reaching the
    // next line already proves all three are on screen.
    screen.getByText("Small 0")
    screen.getByText("Small 1")
    screen.getByText("Small 2")

    // THE BIG GROUP IS WINDOWED. Not all 400 rows are in the DOM — jsdom
    // reports a zero-height viewport, so the hook falls back to rendering
    // one screen's worth around the top (its own documented behaviour
    // "before the viewport has been measured"), which is comfortably under
    // 400 either way.
    const renderedValueRows = screen.getAllByText(/^Value \d+$/)
    expect(renderedValueRows.length).toBeGreaterThan(0)
    expect(renderedValueRows.length).toBeLessThan(BIG_GROUP)

    // THE FULL COUNT IS STILL SAID, even though most rows are not present —
    // this is the whole reason `aria-setsize` exists (use-virtual-rows.ts's
    // own header: "row 12 of 4,000" when only 20 rows exist in the DOM).
    const bigGroupList = screen.getByText("Value 0").closest("ul")
    expect(bigGroupList).not.toBeNull()
    const firstRow = screen.getByText("Value 0").closest("li")
    expect(firstRow?.getAttribute("aria-setsize")).toBe(String(BIG_GROUP))
    expect(firstRow?.getAttribute("aria-posinset")).toBe("1")

    // THE SPACERS ARE REAL LIST ITEMS, not a `<div>` breaking the `<ul>`'s
    // only-valid-child rule — the bug this test would have caught directly.
    const spacers = bigGroupList!.querySelectorAll("li[data-virtual-spacer]")
    expect(spacers.length).toBe(2)
    for (const spacer of spacers) {
      expect(spacer.tagName).toBe("LI")
      expect(spacer.getAttribute("aria-hidden")).toBe("true")
    }

    // THE SMALL GROUP NEVER GETS THE SCROLL BOX — no spacers, no aria-setsize,
    // exactly the markup it always had.
    const smallGroupList = screen.getByText("Small 0").closest("ul")
    expect(smallGroupList!.querySelectorAll("li[data-virtual-spacer]").length).toBe(0)
    expect(screen.getByText("Small 0").closest("li")?.getAttribute("aria-setsize")).toBeNull()
  })
})
