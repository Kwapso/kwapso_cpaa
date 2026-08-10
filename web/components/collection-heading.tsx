"use client"

// CollectionHeading (R16 ii) — the count's home on a screen with NO counted tab
// strip. A real <h1> (title from the module registry) with the exact server
// total as a chip, built through the ONE formatCount seam. Scoping counts to
// tabs was the original loophole: a sidebar page renders no tab strip, so those
// screens "obeyed the law" showing no count anywhere. The target list is DERIVED
// from the registry (every section with a countCacheKey whose placement isn't
// "tab") — never hand-listed. And the count never depends on an unrelated
// permission: the heading renders for anyone who can see the screen.

import * as React from "react"

import { formatCount } from "@shared/web/format-count"
import { TEAM_SECTIONS } from "@/lib/pages"
import { useCountStandsDown } from "@/components/counted-tabs"

export function CollectionHeading({
  sectionKey,
  total,
}: {
  /** the module-registry key — the title comes from there, never a literal. */
  sectionKey: string
  /** the exact server total (undefined while loading → the chip renders nothing). */
  total: number | undefined
}) {
  // ARBITRATION (R16 iii): the hook is called ABOVE the early return — a counted
  // tab strip wins and this heading stands down entirely.
  const standsDown = useCountStandsDown()
  if (standsDown) return null

  const title = TEAM_SECTIONS.find((s) => s.key === sectionKey)?.title ?? sectionKey
  const badge = formatCount(total)
  return (
    <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
      {title}
      {badge ? (
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
          {badge}
        </span>
      ) : null}
    </h1>
  )
}
