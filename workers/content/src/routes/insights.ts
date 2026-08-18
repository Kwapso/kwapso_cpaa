// THE PULSE DOOR — the numbers Home draws a picture out of, in one round trip.
//
// IT REFUSES A CLIENT LOGIN (R21), first and unconditionally. Everything below
// is the agency's own working week: how many requests are sitting unanswered, how
// far behind our own admin is, and how many hours our people logged. A client
// sees their own tickets and the time their work gives back; they never see how
// the agency is doing.
//
// IT HAS NO GATE OF ITS OWN, AND THAT IS THE DESIGN RATHER THAN AN OMISSION.
// R18's sentence is that a cross-module read carries the CALLER'S rights, and
// this read crosses three modules. Gating the whole door on one of them would
// pick a winner: gate it on `help` and somebody who does delivery work but never
// touches tickets loses their hours chart; gate it on `work` and the support
// manager loses the ticket picture. So each SECTION asks for its own module's
// read right and comes back `null` without it — the caller's own rights,
// section by section, never one right standing in for three. A role holding none
// of them gets an object of three nulls, which is the honest answer and not an
// error: the screen simply has nothing to draw.
//
// NOTHING HERE COUNTS ANYTHING ITSELF. Every number is one of the count
// functions the badges are already built from, so "12 open tickets" on Home and
// "12" on the Tickets tab are one expression rather than two that happen to
// agree. The only new read is the week-by-week series, which no screen had ever
// asked for.

import { json } from "@shared/workers/http"
import { hasRight, teamContext } from "@shared/workers/gating"
import { refusePortalCaller } from "@shared/workers/account-scope"
import { OPEN_HELP_STATUSES, type TeamPulse } from "@shared/types"
import { countTicketFacets, countTickets } from "../lib/help"
import { countStories } from "../lib/stories"
import { countTasks } from "../lib/tasks"
import { countMeetings } from "../lib/meetings"
import { weeklySeconds } from "../lib/insights"
import type { Env } from "../env"

/** GET /api/content/insights — the team's week in numbers.
 *
 * One request, three optional sections, and each section is at most two bounded
 * statements. A screen that assembled this out of the list doors instead would
 * pull five pages of rows it does not render.
 */
export async function getInsights(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  const scope = await refusePortalCaller(cfg, guard)

  const [canTickets, canWork, canMeetings] = await Promise.all([
    hasRight(cfg, guard, "help", "read"),
    hasRight(cfg, guard, "work", "read"),
    hasRight(cfg, guard, "meetings", "read"),
  ])

  const [tickets, work, meetings] = await Promise.all([
    canTickets ? ticketPulse(cfg, guard, scope) : null,
    canWork ? workPulse(cfg, guard) : null,
    // The SAME "week" the diary's own badge counts — its door owns that
    // boundary, and asking it here rather than rebuilding it is what keeps the
    // two numbers one number.
    canMeetings ? countMeetings(cfg, guard, { view: "week" }).then((n) => ({ thisWeek: n })) : null,
  ])

  return json({ tickets, work, meetings } satisfies TeamPulse)
}

/** WHERE THE REQUESTS ARE SITTING. Two reads: the open total, and the tally per
 * stage the ticket strip already draws its badges from. */
async function ticketPulse(
  cfg: Parameters<typeof countTickets>[0],
  guard: Parameters<typeof countTickets>[1],
  scope: Parameters<typeof countTickets>[2]
): Promise<NonNullable<TeamPulse["tickets"]>> {
  const filter = { tab: "all", view: "live" } as const
  const [counts, facets] = await Promise.all([
    countTickets(cfg, guard, scope, filter),
    countTicketFacets(cfg, guard, scope, filter),
  ])
  // The lifecycle's own order, not the tally's — a chart whose bars reordered
  // themselves as the numbers moved would be unreadable week to week. A stage
  // nobody is in is kept at zero on purpose: an empty column IS the information
  // ("nothing is waiting on the client this week").
  const byStage = OPEN_HELP_STATUSES.map((stage) => ({ stage, count: facets.byStatus[stage] ?? 0 }))
  const resolved = facets.byStatus.resolved ?? 0
  return { open: Math.max(0, counts.total - resolved), byStage }
}

/** WHAT WE ARE CARRYING. The backlog, our own admin, and the hours behind both.
 *
 * `countTasks` is asked WITHOUT an assignee filter, so this is the team's admin
 * rather than the caller's. That is deliberate and it is not a leak: `work:read`
 * is the right the Tasks screen itself opens on, and what comes back here is a
 * COUNT — never a title, never a name, never whose task it is. The narrowing
 * `all_tasks:read` performs on the tasks LIST is a narrowing of rows somebody can
 * read; there are no rows here to narrow.
 */
async function workPulse(
  cfg: Parameters<typeof countStories>[0],
  guard: Parameters<typeof countStories>[1]
): Promise<NonNullable<TeamPulse["work"]>> {
  const [stories, tasks, weeks] = await Promise.all([
    countStories(cfg, guard, { view: "open" }),
    countTasks(cfg, guard, {}),
    weeklySeconds(cfg, guard, new Date()),
  ])
  return {
    storiesOpen: stories.total,
    tasksDue: tasks.dueToday,
    tasksDueDone: tasks.dueTodayDone,
    weeks,
  }
}
