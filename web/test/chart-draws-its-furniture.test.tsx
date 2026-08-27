// A CHART IS ITS FURNITURE, NOT JUST ITS DATA — and for six weeks it was only
// its data.
//
// The kit's `Chart` built its grid, both axes, the zero line, the tooltip and
// the legend inside a fragment and handed that to the recharts chart. recharts
// does not read children the way React renders them: it walks them itself,
// matches each one by `displayName`, and DROPS what it cannot name. Its
// fragment-descent line is guarded by `isFragment` from `react-is@18`, which
// identifies an element by `Symbol.for("react.element")` — and React 19 stamps
// `Symbol.for("react.transitional.element")`. The guard answered false for
// every fragment React built, the fragment went into the list AS a child, its
// displayName matched nothing, and everything inside it was discarded.
//
// In silence. No warning, no error, no failing test. The bars drew, so the
// picture looked finished — on the home Pulse band, on the portal's impact
// chart, on every chart in both front doors.
//
// WHY THIS TEST EXISTS RATHER THAN A KIT TEST. `shared/ui/` is a hash-pinned
// dependency this repo may not edit, so the fix lives upstream (kit v1.0.1).
// What this repo CAN do is refuse a sync that takes the furniture away again —
// which is the failure that actually reached a user. It asserts the classes
// recharts itself emits, not our markup, so it stays true through any styling
// change and goes red only if the elements stop reaching the chart.
//
// It is also the guard against the general trap: nothing in this app may hand
// a fragment to a recharts chart. If a future kit reintroduces one anywhere in
// that tree, these classes vanish and this goes red.

import { render } from "@testing-library/react"
import { beforeAll, describe, expect, it } from "vitest"

import { Chart } from "@shared/ui/components/chart/chart"

// recharts measures its container, and jsdom reports every box as 0×0 — so a
// chart would render nothing at all and the test would pass for the wrong
// reason. These give the tree one real size to measure.
beforeAll(() => {
  for (const key of ["offsetWidth", "clientWidth"]) {
    Object.defineProperty(HTMLElement.prototype, key, { configurable: true, value: 800 })
  }
  for (const key of ["offsetHeight", "clientHeight"]) {
    Object.defineProperty(HTMLElement.prototype, key, { configurable: true, value: 400 })
  }
  HTMLElement.prototype.getBoundingClientRect = function () {
    return {
      width: 800, height: 400, top: 0, left: 0, bottom: 400, right: 800, x: 0, y: 0,
      toJSON() {},
    } as DOMRect
  }
})

const rows = [
  { label: "New", count: 4 },
  { label: "Open", count: 9 },
  { label: "Done", count: 2 },
]
const series = [{ key: "count", label: "Count" }]

/** Every `recharts-*` class in the tree. recharts names its own parts, so this
 * reads what the chart actually built rather than what we asked it to. */
function partsOf(root: HTMLElement): Set<string> {
  const found = new Set<string>()
  for (const node of root.querySelectorAll("*")) {
    for (const cls of (node.getAttribute("class") ?? "").split(/\s+/)) {
      if (cls.startsWith("recharts-")) found.add(cls)
    }
  }
  return found
}

describe("the kit Chart draws its furniture, not only its data", () => {
  it("a bar chart emits its axis, its ticks, its legend and its tooltip", () => {
    const { container } = render(
      <Chart data={rows} type="bar" xKey="label" series={series} legend />,
    )
    const parts = partsOf(container)

    // The data. If this is missing the test is measuring nothing.
    expect(parts.has("recharts-bar-rectangles")).toBe(true)

    // The furniture — every one of these was absent before kit v1.0.1.
    expect(parts.has("recharts-cartesian-axis")).toBe(true)
    expect(parts.has("recharts-cartesian-axis-tick")).toBe(true)
    expect(parts.has("recharts-cartesian-axis-tick-value")).toBe(true)
    expect(parts.has("recharts-xAxis")).toBe(true)
    expect(parts.has("recharts-legend-wrapper")).toBe(true)
    expect(parts.has("recharts-tooltip-wrapper")).toBe(true)
  })

  it("a line chart's axis reaches it too — the furniture is shared by all three shapes", () => {
    const { container } = render(
      <Chart
        data={[
          { label: "w1", hours: 3 },
          { label: "w2", hours: 8 },
        ]}
        type="line"
        xKey="label"
        series={[{ key: "hours", label: "Hours" }]}
      />,
    )
    const parts = partsOf(container)
    expect(parts.has("recharts-line")).toBe(true)
    expect(parts.has("recharts-cartesian-axis")).toBe(true)
    expect(parts.has("recharts-tooltip-wrapper")).toBe(true)
  })

  it("switching a piece of furniture off still switches it off", () => {
    const { container } = render(
      <Chart data={rows} type="bar" xKey="label" series={series} xAxis={false} legend={false} tooltip={false} />,
    )
    const parts = partsOf(container)
    expect(parts.has("recharts-bar-rectangles")).toBe(true)
    expect(parts.has("recharts-xAxis")).toBe(false)
    expect(parts.has("recharts-legend-wrapper")).toBe(false)
    expect(parts.has("recharts-tooltip-wrapper")).toBe(false)
  })
})
