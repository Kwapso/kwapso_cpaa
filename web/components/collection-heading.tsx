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

import { Badge } from "@shared/ui/components/badge/badge"
import { Headline } from "@shared/ui/components/typography/typography"
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
  // ARBITRATION (R16 iii): a counted tab strip wins THE COUNT. It does not win
  // the page's name.
  //
  // This used to `return null` here, and that is how the Sprints screen shipped
  // with no title at all while every screen beside it had one — the owner found
  // it on 30 Aug 2026 and asked the right question: how did this get past rules
  // this strict. It got past them because it OBEYED them. R16 says a collection
  // shows its count exactly once, and deleting the entire heading satisfies that
  // sentence perfectly. Nothing anywhere said a page must have a name, so nothing
  // objected. A check right about what it checks and silent about what matters.
  //
  // So the badge stands down and the heading stays. Every tabbed screen —
  // sprints, tasks, and any other that grows a counted strip — gets its name
  // back, from one change, because they all came here for it.
  const t = useT()
  const countStandsDown = useCountStandsDown()

  const title = TEAM_SECTIONS.find((s) => s.key === sectionKey)?.title ?? sectionKey
  const badge = countStandsDown ? "" : formatCount(total)
  // The vocabulary is keyed by concept, and every section key is one — but the
  // lookup is defensive rather than asserted: a section that outgrows the map
  // should lose its glyph, not its heading.
  const icon = (CONCEPT_ICON as Record<string, string>)[sectionKey]
  return (
    <Headline as="h1" size="h3" className="flex items-center gap-2">
      {icon ? (
        // aria-hidden: the WORD beside it is the name of the page, and a screen
        // reader announcing "route, Processes" is one label read twice.
        <span aria-hidden className="text-muted-foreground shrink-0">
          <Icon name={icon as IconName} className="size-5" />
        </span>
      ) : null}
      {t(title)}
      {badge ? <Badge variant="secondary">{badge}</Badge> : null}
    </Headline>
  )
}
