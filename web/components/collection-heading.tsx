"use client"

// CollectionHeading (R16 ii) — the count's home on a screen with NO counted tab
// strip. A real <h1> (title from the module registry) with the exact server
// total as a chip, built through the ONE formatCount seam. Scoping counts to
// tabs was the original loophole: a sidebar page renders no tab strip, so those
// screens "obeyed the law" showing no count anywhere. The target list is DERIVED
// from the registry (every section with a countCacheKey whose placement isn't
// "tab") — never hand-listed. And the count never depends on an unrelated
// permission: the heading renders for anyone who can see the screen.
//
// IT ALSO CARRIES THE SECTION'S OWN GLYPH, and that is not decoration: the
// heading is the top of a page reached from a rail where that page already wears
// this exact icon, and a destination that changes its face between the rail and
// the screen is a destination somebody has to re-recognise. It is DERIVED from
// `CONCEPT_ICON` — the one icon vocabulary (UI-CONVENTIONS §4) — keyed by the
// same section key the title comes from, so a heading can never pick an icon its
// nav entry does not use, and a section with no entry in the vocabulary simply
// gets no glyph rather than a wrong one.

import * as React from "react"
import { Icon, type IconName } from "@shared/web/screen-engine/icon"

import { formatCount } from "@shared/web/format-count"
import { CONCEPT_ICON, TEAM_SECTIONS } from "@/lib/pages"
import { useCountStandsDown } from "@/components/counted-tabs"
import { useT } from "@shared/web/language"

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
  const t = useT()
  const standsDown = useCountStandsDown()
  if (standsDown) return null

  const title = TEAM_SECTIONS.find((s) => s.key === sectionKey)?.title ?? sectionKey
  const badge = formatCount(total)
  // The vocabulary is keyed by concept, and every section key is one — but the
  // lookup is defensive rather than asserted: a section that outgrows the map
  // should lose its glyph, not its heading.
  const icon = (CONCEPT_ICON as Record<string, string>)[sectionKey]
  return (
    <h1 className="flex items-center gap-2 text-2xl font-medium tracking-tight">
      {icon ? (
        // aria-hidden: the WORD beside it is the name of the page, and a screen
        // reader announcing "route, Processes" is one label read twice.
        <span aria-hidden className="text-muted-foreground shrink-0">
          <Icon name={icon as IconName} className="size-5" />
        </span>
      ) : null}
      {t(title)}
      {badge ? (
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
          {badge}
        </span>
      ) : null}
    </h1>
  )
}
