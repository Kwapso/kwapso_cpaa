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

import { Chart } from "@shared/ui/components/chart/chart"
import { moneyText } from "@shared/web/money"

/** The band height every chart on a page-band shares. Restated here rather than
 * imported from pulse.tsx, because an import BACK would put this module in the
 * shell's graph again and undo the whole split. Two literals, one comment each,
 * is the cheap half of that trade. */
const BAND_HEIGHT = 170

/** WHERE THE REQUESTS ARE SITTING — one bar per live stage.
 *
 * No legend: one series, and the heading already names it. Everything else the
 * kit draws by default stays on, and that is a correction rather than a taste.
 * This chart used to switch the y-axis and the grid off, on the stated grounds
 * that "the number sits ON the bar instead" — the kit's Chart has never drawn a
 * number on a bar, so what shipped was three bars of unlabelled height with
 * nothing at all to read them against. The scale and the hairlines ARE the
 * something to read them against. */
export function StageChart({ rows, label }: { rows: { label: string; count: number }[]; label: string }) {
  return (
    <Chart
      data={rows}
      type="bar"
      xKey="label"
      series={[{ key: "count", label, color: "var(--chart-1)" }]}
      legend={false}
      height={`${BAND_HEIGHT}px`}
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
      type="area"
      xKey="label"
      series={[{ key: "hours", label, color: "var(--chart-2)" }]}
      legend={false}
      height={`${BAND_HEIGHT}px`}
    />
  )
}

/** HOURS BY SOMETHING — who spent the time on one record, or what kind of work
 * it was. One bar per group, biggest first, read against the hours scale.
 *
 * The same shape as StageChart and deliberately not a pie: these are quantities
 * a person compares ("Marta did twice what I did"), and a bar is the only chart
 * anybody reads a comparison off reliably — which is also why the scale is back
 * on. A comparison needs a unit; "twice" is only visible against something.
 * The ORDER here is the tally's, not a lifecycle's — unlike the stages above,
 * there is no natural sequence for four colleagues, so biggest-first is the
 * ordering that carries information. */
export function HoursByChart({ rows, label }: { rows: { label: string; hours: number }[]; label: string }) {
  return (
    <Chart
      data={rows}
      type="bar"
      xKey="label"
      series={[{ key: "hours", label, color: "var(--chart-3)" }]}
      legend={false}
      height={`${BAND_HEIGHT}px`}
    />
  )
}

/** TICKETS BY CLIENT — one bar per account, open tickets, biggest first.
 *
 * The exact shape of HoursByChart, because it is the same question ("who has
 * the most") asked of a different collection: a comparison needs a scale, so
 * the axis stays on, and there is no natural sequence for a list of clients so
 * biggest-first (the door's own `ORDER BY open_n DESC`) is the ordering that
 * carries the information — never re-sorted here. */
export function TicketsByAccountChart({ rows, label }: { rows: { label: string; count: number }[]; label: string }) {
  return (
    <Chart
      data={rows}
      type="bar"
      xKey="label"
      series={[{ key: "count", label, color: "var(--chart-3)" }]}
      legend={false}
      height={`${BAND_HEIGHT}px`}
    />
  )
}

/** HOW FULL THE RUNNING SPRINTS ARE — done stacked under still-open.
 *
 * Done FIRST so it stacks at the bottom: a bar fills from the floor as the work
 * closes, which is the direction everybody already reads a progress bar in.
 *
 * The ONLY chart on the band that carries a legend, because it is the only one
 * with two series: two colours stacked in one bar and nothing saying which is
 * which is not a chart, it is a puzzle. The kit's rule is the same sentence
 * read the other way — "off with one series, a legend of one is a label". */
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
      type="bar"
      xKey="label"
      series={[
          { key: "done", label: doneLabel, color: "var(--chart-2)" },
          { key: "open", label: openLabel, color: "var(--chart-4)" },
        ]}
      legend
      height={`${BAND_HEIGHT}px`}
    />
  )
}

/** WHAT AN ACCOUNT LEAVES US, PIECE BY PIECE — sold, minus our own time (one bar
 * per role, so "our time" isn't one lump), minus tools, ending on the margin
 * itself. The margin panel used to say all of this as a column of `<Line>` rows
 * with a sign in front of the ones that subtract; the chart is that same
 * subtraction read at a glance, negative bars and all — the one thing on this
 * band that actually exercises Chart's negative-value handling
 * (`--chart-negative`, the automatic zero rule), because every other chart here
 * is a count or a duration and never goes below zero. `zeroLine` is forced on
 * rather than left to auto-detect, so the rule is there even for an account
 * whose margin happens to be positive this month.
 *
 * THE AXIS TAKES WHOLE-CURRENCY UNITS, NOT CENTS. `rows` still carries `cents`
 * (the unit every money figure in this codebase is stored and passed in), but
 * handing raw cents straight to the plot drew a "1,350,000" tick where a reader
 * expects "13,500" — recharts has no idea a value is money and draws exactly
 * what it is given. So the plotted value is divided down to whole units here,
 * once, and `formatValue` multiplies back before handing off to the one money
 * formatter (`moneyText`), so the axis and the tooltip agree on what they show. */
export function MarginChart({ rows, label }: { rows: { label: string; cents: number }[]; label: string }) {
  const data = rows.map((row) => ({ label: row.label, amount: row.cents / 100 }))
  return (
    <Chart
      data={data}
      type="bar"
      xKey="label"
      series={[{ key: "amount", label, color: "var(--chart-2)" }]}
      legend={false}
      zeroLine
      formatValue={(value) => moneyText(Math.round(value * 100))}
      height={`${BAND_HEIGHT}px`}
    />
  )
}
