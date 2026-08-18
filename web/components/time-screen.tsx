"use client"

// TIME — the destination a work log never had.
//
// A row of time is what every figure in this app is eventually built on, and
// until this page there was nowhere to go and look at one. The list lived in a
// panel at the FOOT of the Stories page, under the backlog, and a story's Time
// tab showed the few logged against that story. Both are the right place for
// what they do — a Start button belongs beside the work, and a story's hours
// belong on the story — and neither is where a person goes to find "the time I
// logged". A tester with 115 entries reported she could not find any of it.
//
// The screen is thin on purpose: the timesheet is one panel that already existed
// and already followed the rules, so this is a heading, a count and that panel.
// Its recipe would be a list of rows whose only control is a correction dialog,
// which is a screen the engine has no block for — the same reason the story
// detail is host-composed.

import { CollectionHeading } from "@/components/collection-heading"
import { HoursByWeekCard } from "@/components/pulse"
import { TimePanel } from "@/components/time-panel"

export function TimeScreen({
  teamId,
  total,
  canCreate,
  canEdit,
}: {
  teamId: string
  /** the exact server ROW total (R16) — never the loaded page's length, which on
   * a paged list is just "50" for ever. The HOURS are a different number, and
   * the panel says that one itself. */
  total: number | undefined
  canCreate: boolean
  canEdit: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* R16: a sidebar page has no tab strip to badge, so the count lives in the
          heading — and it is the door's exact COUNT(*). */}
      <CollectionHeading sectionKey="time" total={total} />
      {/* THE SHAPE OF THE LAST TWO MONTHS, above the rows it is summed from.
          A timesheet answers "what did I log"; it has never answered "are we
          busier or quieter than we were", which is the question a week of rows
          cannot show and eight weeks of totals can. Kept to a band so the
          timesheet stays the screen (the owner's size rule), and drawn off the
          same cached read Home uses so the two agree by construction. */}
      <HoursByWeekCard teamId={teamId} />
      <TimePanel teamId={teamId} canCreate={canCreate} canEdit={canEdit} />
    </div>
  )
}
