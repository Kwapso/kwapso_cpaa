"use client"

// THE PICTURES, AND NOTHING ELSE — the only file in the agency app that
// touches the library's Chart.
//
// WHY IT IS A FILE OF ITS OWN, because it is not tidiness. The whole agency app
// is ONE static shell (`/t/*` plus the clean top-level URLs), so everything the
// shell's import graph reaches is in the chunk that EVERY page loads: Accounts,
// Members, Roles, the knowledge base, all of them. `Chart` is built on Recharts,
// and importing it into the shell measured at **+114 kB First Load on every
// route in the app** (412 kB → 527 kB) to draw a picture on four of them.
//
// A `dynamic()` on the component ALONE does not fix that, and the reason is worth
// writing down because it looks like it should: `defaultChartConfig` lives in the
// same library module as `Chart`, so a static import of the config — which every
// caller needs, to spread it — pulls the module and Recharts with it. The lazy
// component is then a loadable for a chunk that has already been loaded.
//
// So the SPLIT is the fix: every static reference to that module lives in here,
// nothing else in the app imports it, and `pulse.tsx` reaches these three
// through `next/dynamic`. The shell's graph never touches Recharts; a screen
// that draws a chart fetches it when it draws one.
//
// These are PRESENTATIONAL and take rows already shaped: no fetch, no cache key,
// no permission. Everything that decides WHETHER to draw one — a section the
// caller may not read, a set that is all zeros — is decided in pulse.tsx, before
// this file is ever asked for.

import { Chart, defaultChartConfig } from "@shared/ui/registry/collections/chart/chart"

/** The band height every chart on a page-band shares. Restated here rather than
 * imported from pulse.tsx, because an import BACK would put this module in the
 * shell's graph again and undo the whole split. Two literals, one comment each,
 * is the cheap half of that trade. */
const BAND_HEIGHT = 170

/** WHERE THE REQUESTS ARE SITTING — one bar per live stage.
 *
 * No legend (a single series would name what the heading already names) and no
 * y-axis: the number sits ON the bar instead, which is what makes a 170px chart
 * legible without something to read it against. */
export function StageChart({ rows, label }: { rows: { label: string; count: number }[]; label: string }) {
  return (
    <Chart
      data={rows}
      config={{
        ...defaultChartConfig,
        type: "bar",
        xKey: "label",
        series: [{ key: "count", label, color: "chart-1" }],
        showLegend: false,
        showGrid: false,
        showYAxis: false,
        showDataLabels: true,
        height: BAND_HEIGHT,
      }}
    />
  )
}

/** HOURS LOGGED, WEEK BY WEEK — an area, because it is one quantity over time
 * and the shape of the trend is the whole point. Dots on, so a single busy week
 * in a quiet run is a point somebody can hover rather than a kink in a line. */
export function WeeksChart({ rows, label }: { rows: { label: string; hours: number }[]; label: string }) {
  return (
    <Chart
      data={rows}
      config={{
        ...defaultChartConfig,
        type: "area",
        xKey: "label",
        series: [{ key: "hours", label, color: "chart-2" }],
        showLegend: false,
        showDots: true,
        height: BAND_HEIGHT,
      }}
    />
  )
}

/** HOURS BY SOMETHING — who spent the time on one record, or what kind of work
 * it was. One bar per group, biggest first, the number ON the bar.
 *
 * The same shape as StageChart and deliberately not a pie: these are quantities
 * a person compares ("Marta did twice what I did"), and a bar is the only chart
 * anybody reads a comparison off reliably. The ORDER here is the tally's, not a
 * lifecycle's — unlike the stages above, there is no natural sequence for four
 * colleagues, so biggest-first is the ordering that carries information. */
export function HoursByChart({ rows, label }: { rows: { label: string; hours: number }[]; label: string }) {
  return (
    <Chart
      data={rows}
      config={{
        ...defaultChartConfig,
        type: "bar",
        xKey: "label",
        series: [{ key: "hours", label, color: "chart-3" }],
        showLegend: false,
        showGrid: false,
        showYAxis: false,
        showDataLabels: true,
        height: BAND_HEIGHT,
      }}
    />
  )
}

/** HOW FULL THE RUNNING SPRINTS ARE — done stacked under still-open.
 *
 * Done FIRST so it stacks at the bottom: a bar fills from the floor as the work
 * closes, which is the direction everybody already reads a progress bar in. */
export function SprintBurndownChart({
  rows,
  doneLabel,
  openLabel,
}: {
  rows: { label: string; done: number; open: number }[]
  doneLabel: string
  openLabel: string
}) {
  return (
    <Chart
      data={rows}
      config={{
        ...defaultChartConfig,
        type: "bar",
        xKey: "label",
        series: [
          { key: "done", label: doneLabel, color: "chart-2" },
          { key: "open", label: openLabel, color: "chart-4" },
        ],
        stacked: true,
        showGrid: false,
        showYAxis: false,
        height: BAND_HEIGHT,
      }}
    />
  )
}
