"use client"

// THE PULSE — the team's week as big numbers and pictures, and the two pictures
// on their own for the pages they belong to.
//
// THE OWNER'S PLACEMENT RULE, applied literally: aggregate a metric into a big
// number when there is enough data to aggregate, and reach for a chart when a lot
// of data arrives BY GROUP (the stages a request can sit in) or BY TIME (the
// hours a week). Everything here is one of those two shapes and nothing else is.
//
// AND THE SIZE RULE WITH IT: "not taking up the whole screen … part of the screen
// while the other data is shown". So a band is one grid row of numbers and one row
// of short charts at BAND_HEIGHT, and whatever the screen was already for starts
// underneath. Nothing here scrolls and nothing here is the hero.
//
// ── FOUR THINGS THAT ARE DELIBERATE ──────────────────────────────────────────
//
// 1. A SECTION THE CALLER MAY NOT READ IS ABSENT, NOT EMPTY. The door answers
//    `null` for a module their role cannot read (R18), and `null` renders NOTHING
//    — no card, no empty state, no "0". A zero would tell somebody there are no
//    tickets when the truth is that they may not look at them, and an empty state
//    would invite them to make one.
//
// 2. A CHART IS NEVER DRAWN ON ZEROS. A brand-new team has no work logs, and eight
//    flat weeks along the bottom of an axis is a picture of nothing wearing the
//    clothes of information. Every visual asks whether it has anything to say
//    first, and says an honest sentence instead when it does not.
//
// 3. THE NUMBERS ARE THE SAME NUMBERS AS EVERYWHERE ELSE. They come off the one
//    aggregate door, which is built from the very count functions the tab badges
//    are built from — so "12" here and "12" on the Tickets tab are one expression
//    rather than two that agree today. COUNTS render through the one `formatCount`
//    seam (R16); HOURS do not, because hours are not a collection count and
//    abbreviating them to "1.3k" would be nonsense.
//
// 4. THE TWO CHARTS ARE EXPORTED SEPARATELY, and every screen that draws one
//    reads the SAME cache key. The Tickets page and Home show the same stage
//    picture; the Work logs page and Home show the same eight weeks. One read,
//    one answer, so two screens can never be looking at two different Mondays.

import * as React from "react"

import dynamic from "next/dynamic"

import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { StatGrid, defaultStatGridConfig } from "@kwapso/ui/registry/collections/stat-grid/stat-grid"
import { ChartNoAxesColumn } from "lucide-react"

import { HELP_STATUS } from "@/components/deep-link/shape"
import { content as contentApi } from "@/lib/api"
import { insightsKey } from "@/lib/live-resources"
import type { TeamPulse } from "@shared/types"
import { formatCount } from "@shared/web/format-count"
import { formatDayMonth } from "@shared/web/format"
import { useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"

/** How tall a chart on a BAND is. Deliberately short: two of these plus the
 * numbers above them is about a third of a laptop screen, which leaves the
 * collection underneath still the thing the page is about. The library's own
 * default is 300, which is a chart that IS the screen. */
const BAND_HEIGHT = 170

/** THE THREE PICTURES, FETCHED ONLY WHEN A SCREEN ACTUALLY DRAWS ONE.
 *
 * The whole agency app is ONE static shell, so anything the shell's import graph
 * reaches is in the chunk EVERY page loads. Recharts in there measured at +114 kB
 * First Load on every route in the app, to draw a picture on four of them.
 *
 * `pulse-charts.tsx` is the only file that touches the library's Chart, and these
 * three `dynamic()` calls are the only way anything reaches it — so the shell's
 * graph never includes Recharts, and a screen that draws a chart fetches it when
 * it draws one. The file's own header explains why lazy-loading the COMPONENT
 * alone was not enough (the config lives in the same library module, so importing
 * it pulled the module anyway).
 *
 * `ssr: false` because a static export has no server to render on and Recharts
 * measures a DOM node it would not have. The `loading` placeholder is the band's
 * own height, so nothing on the page moves when the chunk lands. */
const chartModule = () => import("@/components/pulse-charts")
const chartLoading = () => (
  <Skeleton className="w-full rounded-xl" style={{ height: BAND_HEIGHT }} />
)

const StageChart = dynamic(() => chartModule().then((m) => m.StageChart), {
  ssr: false,
  loading: chartLoading,
})
const WeeksChart = dynamic(() => chartModule().then((m) => m.WeeksChart), {
  ssr: false,
  loading: chartLoading,
})
/** The sprints screen's own picture. Exported from HERE rather than imported
 * from pulse-charts directly, so the agency shell keeps exactly one lazy
 * boundary onto that module instead of two. */
export const SprintBurndownChart = dynamic(
  () => chartModule().then((m) => m.SprintBurndownChart),
  { ssr: false, loading: chartLoading }
)
/** The Work logs tab's two breakdowns — hours by person, hours by kind of work.
 * Exported from here for the same reason as the one above: every route into that
 * module goes through this file, so the shell's graph never touches Recharts. */
export const HoursByChart = dynamic(() => chartModule().then((m) => m.HoursByChart), {
  ssr: false,
  loading: chartLoading,
})
/** The weekly series, for a screen drawing it over ONE record rather than the
 * whole team. Same picture, same lazy boundary, rows the caller has shaped. */
export const RecordWeeksChart = dynamic(() => chartModule().then((m) => m.WeeksChart), {
  ssr: false,
  loading: chartLoading,
})

/** Whole seconds → the hours a person says out loud. One decimal below ten
 * ("6.5"), none above it ("41") — the same shape the count ladder uses and for
 * the same reason: precision nobody can act on reads as false precision. */
export function hoursSpoken(seconds: number): string {
  const hours = seconds / 3600
  if (hours === 0) return "0"
  if (hours < 10) return String(Math.round(hours * 10) / 10)
  return String(Math.round(hours))
}

/** One boxed visual on a band: a heading, and either the picture or the sentence
 * that says what would make a picture appear. */
export function BandCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border p-4">
      <h3 className="text-muted-foreground mb-2 text-sm font-medium">{title}</h3>
      {children}
    </section>
  )
}

/** What a visual shows INSTEAD of a chart when there is nothing yet. Always two
 * sentences: what is missing, and what would make it appear. "No data" on its own
 * reads as a broken screen rather than an empty one — and the glyph is there for
 * the same reason, so the box looks like a place something goes rather than like
 * a chart that failed to draw. `aria-hidden`, because the sentences beside it
 * carry the whole meaning (UI-CONVENTIONS §5). */
export function NothingYet({ what, how }: { what: string; how: string }) {
  return (
    <div
      className="text-muted-foreground flex flex-col items-start justify-center gap-1 rounded-xl border border-dashed p-4 text-sm"
      style={{ minHeight: BAND_HEIGHT }}
    >
      <ChartNoAxesColumn aria-hidden className="mb-1 size-5 opacity-60" />
      <p>{what}</p>
      <p className="text-xs">{how}</p>
    </div>
  )
}

/** The one read every visual on this page shares. A screen showing two of them
 * makes ONE request, because the cache key is the same key. */
function usePulse(teamId: string) {
  return useCached<TeamPulse>(insightsKey(teamId), () => contentApi.insights())
}

/* ------------------------------ the two pictures --------------------------- */

/** WHERE THE REQUESTS ARE SITTING — a bar per live stage of the ticket
 * lifecycle, in the lifecycle's own order.
 *
 * The order is the LIFECYCLE'S and never the tally's: bars that reordered
 * themselves as the numbers moved would be unreadable week to week, and a stage
 * nobody is in stays on the axis at zero because an empty column is information
 * ("nothing is waiting on a client this week"). */
export function TicketStagesCard({ teamId }: { teamId: string }) {
  const t = useT()
  const { data } = usePulse(teamId)
  const tickets = data?.tickets
  if (!tickets) return null

  const rows = tickets.byStage.map((s) => ({ label: t(HELP_STATUS[s.stage]), count: s.count }))
  const total = rows.reduce((n, r) => n + r.count, 0)
  return (
    <BandCard title={t("Where the requests are sitting")}>
      {total === 0 ? (
        <NothingYet
          what={t("Nothing is open right now.")}
          how={t("Every request a client raises shows here while it is being worked on.")}
        />
      ) : (
        <StageChart rows={rows} label={t("Tickets")} />
      )}
    </BandCard>
  )
}

/** HOURS LOGGED, WEEK BY WEEK. The eight buckets the door summed, oldest first,
 * labelled by the Monday that opens each one. */
export function HoursByWeekCard({ teamId }: { teamId: string }) {
  const t = useT()
  const { data } = usePulse(teamId)
  const work = data?.work
  if (!work) return null

  const rows = work.weeks.map((w) => ({
    label: formatDayMonth(w.weekStart),
    hours: Math.round((w.seconds / 3600) * 10) / 10,
  }))
  return (
    <BandCard title={t("Hours logged, the last eight weeks")}>
      {!rows.some((w) => w.hours > 0) ? (
        <NothingYet
          what={t("No time has been logged yet.")}
          how={t("Start a timer on a story, or log an hour by hand, and the weeks fill in here.")}
        />
      ) : (
        <WeeksChart rows={rows} label={t("Hours")} />
      )}
    </BandCard>
  )
}

/* --------------------------------- the band -------------------------------- */

/** HOME'S BAND — the numbers, then both pictures side by side.
 *
 * It renders `null` (not a skeleton, not a box) in three cases, and each is a
 * different sentence answered the same way: the read has not landed on a screen
 * that already has content below it, the caller may read none of the three
 * modules, or the team is brand new. In every one of them the band should be
 * absent rather than reserve space for something that is not coming. */
export function PulseBand({ teamId }: { teamId: string }) {
  const t = useT()
  const { data, loading } = usePulse(teamId)

  // First load on a cold cache: one short skeleton so the page below does not
  // jump when the numbers land. After that the cache paints instantly and this is
  // never seen again (CACHING.md — cache-first, revalidate behind).
  if (loading && !data) return <Skeleton className="h-24 w-full rounded-xl" />
  if (!data) return null

  const { tickets, work, meetings } = data

  // THE BIG NUMBERS, built by pushing rather than by a fixed array with holes in
  // it: somebody who reads tickets but not work gets a one-card grid, not four
  // cards three of which say nothing.
  const stats: { id: string; label: string; value: string; delta: string; trend: "flat" }[] = []
  if (tickets)
    stats.push({ id: "open", label: t("Open tickets"), value: formatCount(tickets.open) || "0", delta: "", trend: "flat" })
  if (work) {
    stats.push({ id: "stories", label: t("Work in hand"), value: formatCount(work.storiesOpen) || "0", delta: "", trend: "flat" })
    stats.push({
      id: "due",
      label: t("Admin due"),
      // The pair the Tasks screen's own progress bar shows, said as a fraction:
      // "3 of 8" is how somebody reads it out loud.
      value: work.tasksDue === 0 ? "0" : `${work.tasksDueDone} / ${work.tasksDue}`,
      delta: "",
      trend: "flat",
    })
    stats.push({
      id: "hours",
      label: t("Hours this week"),
      // The LAST bucket of the same series the chart draws — so the number above
      // the chart and its right-hand column can never disagree.
      value: hoursSpoken(work.weeks[work.weeks.length - 1]?.seconds ?? 0),
      delta: "",
      trend: "flat",
    })
  }
  if (meetings)
    stats.push({ id: "meetings", label: t("Meetings this week"), value: formatCount(meetings.thisWeek) || "0", delta: "", trend: "flat" })

  if (stats.length === 0) return null

  return (
    <div className="animate-rise flex flex-col gap-4">
      <StatGrid
        items={stats}
        config={{
          ...defaultStatGridConfig,
          // Up to five cards, two per row on a phone. The delta line is OFF across
          // the whole grid: these are today's numbers and nothing on the door
          // claims to know last week's, so an arrow beside them would be an
          // assertion nobody made (the rule the assistant's metric block follows).
          columns: 4,
          showDelta: false,
        }}
      />
      {(tickets || work) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TicketStagesCard teamId={teamId} />
          <HoursByWeekCard teamId={teamId} />
        </div>
      )}
    </div>
  )
}
