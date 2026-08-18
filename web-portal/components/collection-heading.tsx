"use client"

// R16 on the portal: a collection shows its count, EXACTLY ONCE, and the number
// is an exact server COUNT(*) rendered through the ONE `formatCount` seam —
// imported from the host, never re-implemented (a second copy of the rules would
// be a second set of rules the day either changed).
//
// The agency app arbitrates between two possible places for that number, because
// its screens have counted tabs AND headings and only one may win. The portal has
// no counted tabs, so the arbitration collapses to a rule instead of a context:
// THIS is the only place a count is rendered. A portal screen that wants a count
// renders one of these; a portal component that wants to print a number itself is
// a bug the portal's rules test catches.
//
// `total` is the server's number, straight off the door. Zero or still-loading
// renders nothing at all — never a "0" that reads as an empty collection while
// the rows are still on their way.

import { formatCount } from "@shared/web/format-count"

export function CollectionHeading({
  label,
  total,
  action,
}: {
  label: string
  /** the door's exact server total — never a loaded list's length */
  total: number | null | undefined
  action?: React.ReactNode
}) {
  const count = formatCount(total)
  return (
    <div className="mb-4 flex items-baseline justify-between gap-2">
      <h2 className="text-lg font-medium">
        {label}
        {count ? <span className="text-muted-foreground ml-2 font-normal">{count}</span> : null}
      </h2>
      {action}
    </div>
  )
}
