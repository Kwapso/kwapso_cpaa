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
// NO GLYPH — client ruling: a main screen's title is text only. It used to
// carry the section's own `CONCEPT_ICON` glyph beside the word; that glyph is
// gone from here (the rail is still where a section's icon lives).
//
// THE EYEBROW — client ruling, 2026-09-01: a main screen's title had no
// eyebrow at all, while a detail screen's title always carries one (the
// record-TYPE word, record-chrome.tsx's `eyebrow` prop). The client's own
// mapping — Apps → "Build", Sprints → "Build", Contacts → "Accounts",
// Accounts → "Accounts" — is not a record-type word for each screen, it's
// the NAV SECTION each screen's own sidebar entry already sits under
// (`NavGroup`, lib/pages.ts). So it is never hand-listed here: this screen's
// own `TEAM_SECTIONS` entry already carries that `group`, the exact field
// `app-shell.tsx`'s rail reads to draw its own section headings, and
// `NAV_GROUP_LABELS[group]` is the same label the rail already shows above
// this very screen's row — so the eyebrow can never name a section this
// screen doesn't actually sit in. A section with no `group` (a tab, not a
// sidebar page) renders no eyebrow, same as before. Styled with the exact
// three classes a detail screen's own eyebrow uses (record-chrome.tsx's
// `eyebrowLine`) so the two read as one convention, not two.
//
// THE CONDENSED STICKY TITLE (condensed-title.tsx) — once this heading scrolls
// out of view, a smaller stand-in takes its place at the top of the page, the
// same mechanism a record detail screen uses for its own sticky tab strip.
// `useCondensedTitle` watches the OUTER block below (eyebrow + title
// together, `record-chrome.tsx`'s own "titleRef sits on the OUTER node"
// precedent) rather than the heading alone, so the eyebrow has fully left the
// viewport too before the condensed bar takes over — and `CondensedTitleBar`
// is handed the same `eyebrow` so the stand-in never drops it.
//
// THE TAB STRIP STAYS VISIBLE TOO, NOW — client ruling, 2026-09-01: a
// collection screen's own tab strip (Apps' Active/Inactive, Accounts',
// Tickets'…) used to scroll away with the rest of the page once this heading
// condensed, the one thing a record detail screen's own `STICKY_TABS` had
// already solved. `usePublishCondensedHeight` measures this heading's own
// condensed bar and publishes it to `--collection-tabs-top`, which
// `STICKY_FOLDER_TABS` (shared/web/screen-engine/tabs-view.tsx) reads — the
// SAME seam both `SectionWithCreate`'s `folderTabs` slot and `PagedFind`'s
// `tabs` draw a collection's strip through, several layers below and a plain
// SIBLING of this component in every `*-screen.tsx` file, never a descendant
// of it — see `usePublishCondensedHeight`'s own doc for why that rules out a
// CSS custom property declared on a shared ancestor here.

import * as React from "react"

import { Badge } from "@shared/ui/components/badge/badge"
import { Headline } from "@shared/ui/components/typography/typography"
import { formatCount } from "@shared/web/format-count"
import { TEAM_SECTIONS, NAV_GROUP_LABELS } from "@/lib/pages"
import { useCountStandsDown } from "@/components/counted-tabs"
import {
  useCondensedTitle,
  CondensedTitleBar,
  usePublishCondensedHeight,
} from "@/components/condensed-title"
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
  const { titleRef, condensed } = useCondensedTitle<HTMLDivElement>()
  const condensedBarRef = React.useRef<HTMLDivElement>(null)
  usePublishCondensedHeight("--collection-tabs-top", condensed, condensedBarRef)

  const section = TEAM_SECTIONS.find((s) => s.key === sectionKey)
  const title = section?.title ?? sectionKey
  const eyebrow = section?.group ? t(NAV_GROUP_LABELS[section.group]) : null
  const badge = countStandsDown ? "" : formatCount(total)
  return (
    <>
      <CondensedTitleBar
        ref={condensedBarRef}
        eyebrow={eyebrow}
        title={t(title)}
        condensed={condensed}
      />
      {/* CLIENT CORRECTION, 2026-08-31, verbatim: "title on main screens still
          way too small! it's currently smaller than in detail screens. makes
          no sense." The reference "Kwapso UI Kit.dc.html" scale names this
          step outright — display-m / 56 / 500 is "Page title" — and a main
          screen's own title is exactly that role. The earlier pass moved this
          from h3 (24) to h2 (32), which was still one step short of the kit's
          own named step, and a detail screen's title (record-chrome.tsx, now
          h1/44) was left the larger of the two. This closes that gap:
          display-m is genuinely bigger than a record's own h1, matching the
          client's own stated expectation. */}
      <div ref={titleRef} className="flex flex-col gap-1">
        {eyebrow ? (
          <span className="text-micro font-[var(--font-weight-medium)] uppercase text-ink-tertiary">
            {eyebrow}
          </span>
        ) : null}
        <Headline as="h1" size="display-m" className="flex items-center gap-2">
          {t(title)}
          {badge ? <Badge variant="secondary">{badge}</Badge> : null}
        </Headline>
      </div>
    </>
  )
}
