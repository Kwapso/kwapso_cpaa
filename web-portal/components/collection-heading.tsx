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

import { Badge } from "@shared/ui/components/badge/badge"
import { Headline } from "@shared/ui/components/typography/typography"
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
      {/* display-m — CLIENT CORRECTION, 2026-08-31, verbatim: "title on main
          screens still way too small! it's currently smaller than in detail
          screens. makes no sense." This used to sit at h3 (24, matching
          SHAPE_HEADING_SIZE.calm — itself a step short because the vendored
          `Title` primitive has no rung above h2/32 at all), then at a bare
          `text-lg` (18) before that. The reference kit names this step
          outright — display-m / 56 / 500 is "Page title" — and a portal main
          screen's title is exactly that role, the same as the agency app's own
          CollectionHeading. */}
      <Headline as="h2" size="display-m" className="flex items-center gap-2">
        {label}
        {count ? <Badge variant="secondary">{count}</Badge> : null}
      </Headline>
      {action}
    </div>
  )
}
