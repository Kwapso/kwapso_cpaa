"use client"

// THE SAVINGS, SEEN AT ONCE — the only file in the portal that touches the
// library's Chart, and the only reason it is a file of its own.
//
// The Value screen's headline is a NUMBER and the sentence that makes it honest
// (R25). Recharts is ~112 kB, and importing it into that screen puts it in front
// of both: a client on a phone would wait on a charting library to be told what
// the figure is made of. So the picture is behind a `dynamic()` in impact-screen,
// and every static reference to the library module lives in here — the same
// split, and the same reasoning, as web/components/pulse-charts.tsx.
// (Neither front door imports the other's; the two share `shared/` and nothing
// else, which is why this is a second small file rather than one shared one.)
//
// It is PRESENTATIONAL: rows already shaped, no fetch, no fence. Whether to draw
// it at all — one app is the headline figure drawn twice — is decided before
// this file is ever asked for.

import { Chart } from "@shared/ui/structures/chart/chart"

/** Hours a month, per app.
 *
 * THE AXIS AND THE GRID STAY ON, unlike the agency's compact bands, and that is
 * this screen's own rule rather than a style: a step that got slower is shown
 * here, always, so an app can total NEGATIVE — and a bar going the wrong way has
 * to be readable as one, which needs a zero line to go the wrong way from. */
export function AppSavingsChart({
  rows,
  label,
}: {
  rows: { label: string; hours: number }[]
  label: string
}) {
  return (
    <Chart
      data={rows}
      type="bar"
      xKey="label"
      series={[{ key: "hours", label, color: "var(--chart-2)" }]}
      legend={false}
      zeroLine
      height="190px"
    />
  )
}
