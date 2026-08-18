// THE PULSE — the handful of numbers a screen draws a picture out of, and the
// one series behind them.
//
// WHY THIS IS ITS OWN FILE AND NOT A SEVENTH COUNT ON A LIST DOOR. Every count in
// this worker rides the list it belongs to: `countTickets` comes back with a page
// of tickets, `countTasks` with a pile of tasks. That is exactly right for a
// badge — the number and the rows are one question, so they can never disagree
// (R16) — and exactly wrong for Home, which shows no list at all. Reaching those
// numbers the existing way would mean fetching five collections and throwing the
// rows away: five paged reads, ~250 rows, to render four numbers and a chart.
//
// So the pulse reuses the COUNT functions and none of the list ones. Nothing here
// invents a second way to count anything — `countTickets`, `countTicketFacets`,
// `countStories`, `countTasks` and `countMeetings` are the same functions the
// badges are built from, so a number on Home and the same number on its own page
// are one expression, not two that agree today.
//
// THE ONE GENUINELY NEW READ is the week-by-week series below, because no screen
// has ever asked "how did the last eight weeks go" before.

import { d1Query, type D1Rest } from "@shared/workers/d1-rest"
import type { MemberGuard } from "@shared/workers/gating"
import type { PulseWeek } from "@shared/types"

/** How many weeks of logged time the series carries.
 *
 * Eight is two months — long enough that a quiet fortnight reads as a dip rather
 * than as the whole picture, short enough to be legible on a phone without
 * scrolling. It is also the ceiling on the statement's cost: the query below
 * binds two parameters per week (see `weeklySeconds`), so this number times two
 * has to stay well under `D1_MAX_BOUND_PARAMS` — at 8 it is 16, with room to
 * spare for anything the fence adds later. */
export const PULSE_WEEKS = 8

/** THE MONDAY THAT OPENS THE WEEK a moment falls in, in UTC.
 *
 * UTC, and the cost is named rather than discovered: an agency in Berlin sees a
 * Monday 00:30 entry land in the right week and a Sunday 23:30 one land in the
 * next. It is the same choice `meetings.ts` already made for the same reason —
 * the SERVER decides which week a week is, so the number on the chart and the
 * number in the header can never mean two different Mondays. */
function mondayOf(when: Date): Date {
  const day = new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate()))
  // getUTCDay: 0 = Sunday. Monday is the start, so Sunday steps back six days.
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7))
  return day
}

/** The `PULSE_WEEKS` week-starts ending with the week we are in, oldest first. */
export function pulseWeekStarts(now: Date): Date[] {
  const thisMonday = mondayOf(now)
  const out: Date[] = []
  for (let back = PULSE_WEEKS - 1; back >= 0; back--) {
    const start = new Date(thisMonday)
    start.setUTCDate(start.getUTCDate() - back * 7)
    out.push(start)
  }
  return out
}

/** TIME LOGGED, WEEK BY WEEK — one statement, one row, eight numbers.
 *
 * THE SHAPE IS `countTasks`'s, deliberately, and it is the reason there is no
 * `GROUP BY` here. A grouped read would have to bucket by a SQL week expression
 * (`strftime('%Y-%W', …)`), which means the boundary between two weeks would be
 * written once in SQLite's dialect and once in JavaScript for the labels — two
 * definitions of "a week", drifting the first time one of them meets a year
 * boundary. Conditional sums put the boundary in ONE place: the window is
 * computed here, bound as parameters, and the label comes off the same object.
 *
 * R14: the result is ONE ROW by construction — a `SUM` per window with no
 * grouping key can return nothing else — and the statement carries `LIMIT 1` to
 * say so at the query rather than leaving it implied by the shape of the SQL.
 * The windows are the caller's, and there are `PULSE_WEEKS` of them, so the work
 * is bounded at both ends.
 *
 * `discarded_at IS NULL` is the same clause `logWhere` opens with: a binned
 * runaway timer is not time anybody worked, and a chart that counted one would
 * be showing an hour somebody deliberately threw away. */
export async function weeklySeconds(
  cfg: D1Rest,
  guard: MemberGuard,
  now: Date
): Promise<PulseWeek[]> {
  const starts = pulseWeekStarts(now)
  const sums: string[] = []
  const params: string[] = []
  starts.forEach((start, i) => {
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 7)
    sums.push(
      `SUM(CASE WHEN w.started_at >= ? AND w.started_at < ? THEN w.seconds ELSE 0 END) AS w${i}`
    )
    params.push(start.toISOString(), end.toISOString())
  })
  const rows = await d1Query<Record<string, number | null>>(
    cfg,
    guard.databaseId,
    // R14: one aggregate row — no GROUP BY, so there is nothing else it could be.
    `SELECT ${sums.join(", ")} FROM work_logs w WHERE w.discarded_at IS NULL LIMIT 1`,
    params
  )
  const row = rows[0] ?? {}
  return starts.map((start, i) => ({
    weekStart: start.toISOString().slice(0, 10),
    // SUM over no rows is NULL, not 0 — a brand-new team would otherwise get a
    // series of nulls where it should get a flat, honest zero line.
    seconds: Math.max(0, Math.round(Number(row[`w${i}`] ?? 0))),
  }))
}
