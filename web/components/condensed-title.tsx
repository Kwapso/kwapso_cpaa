"use client"

// THE CONDENSED STICKY TITLE — the second, smaller title that takes over the
// sticky slot at the top of the page once the real one has scrolled away.
//
// A detail screen's own title already scrolls past while its tab strip stays
// pinned (`STICKY_TABS`, record-chrome.tsx) — so past that point a reader saw
// tabs with nothing above them saying which record they belong to. A main/
// collection screen has the same gap: its own `CollectionHeading` scrolls
// away and nothing takes its place. This is that stand-in: a smaller line of
// text, and an eyebrow above it (both kinds of screen, since 2026-09-01 — a
// record-type word on a detail screen, a nav-section word on a main/
// collection one) — eyebrow and title, and NOTHING else.
//
// NO MARK, NO PILLS, ON EITHER KIND OF SCREEN — client ruling, 2026-09-01,
// verbatim: "for the detail replicate the main: turn the breadcrumb + title
// in eyebrow title. do not include image nor pills." This reverses "THE SPEC
// REVERSED, DETAIL ONLY", a same-day ruling this file used to carry right
// below, that had put a record's own header-band mark and its identity pills
// (`identityChips`) BACK into this bar for detail screens only. A detail
// screen's condensed bar now draws the exact same shape as a main screen's —
// eyebrow and title — so `CondensedTitleBar`'s two callers (`RecordScreen`,
// record-chrome.tsx, and `CollectionHeading`, collection-heading.tsx) finally
// build one node rather than two, and neither `mark` nor `pills` is a prop of
// this component any more.
//
// THE TRIGGER REUSES THE KIT'S OWN VISIBILITY PRIMITIVE
// (shared/ui/components/visibility/visibility.tsx) rather than a second
// IntersectionObserver — `useIsVisible` on the FULL title's own node,
// `once: false` (this is "is it on screen right now", not "was it ever seen" —
// scrolling back up must un-condense it) and `rootMargin: "0px"` so the
// trigger line is the viewport's own top edge, not the hook's default 25%
// reach-ahead (built for "about to arrive", the opposite of "just left").

import * as React from "react"
import { useIsVisible } from "@shared/ui/components/visibility/visibility"
import { Headline } from "@shared/ui/components/typography/typography"

/** Watches the real, full-size title. Attach `titleRef` to that title's own
 * node; `condensed` is exactly `!visible` — the stand-in shows if and only if
 * the real thing does not. */
export function useCondensedTitle<T extends HTMLElement = HTMLElement>() {
  const { ref, visible } = useIsVisible<T>({
    once: false,
    initialVisible: true,
    rootMargin: "0px",
  })
  return { titleRef: ref, condensed: !visible }
}

/**
 * PUBLISHES THE CONDENSED BAR'S OWN RENDERED HEIGHT as a CSS custom property
 * on the document root, `0px` whenever the bar is not showing.
 *
 * WHY THE DOCUMENT ROOT, NOT A CLASS ON A SHARED ANCESTOR. A record screen's
 * own tab strip (`STICKY_TABS`) lives inside the SAME component
 * (`RecordScreen`) as its condensed bar, so a class declared once on that
 * component's own wrapping node would already reach it — and used to be
 * exactly how this worked, back when the bar's height was a constant
 * (`--condensed-title-h`, a token matching the mark's own fixed box, from
 * when this bar still drew one). Even now that the bar draws only `eyebrow`
 * and `title` (this file's header), its real height is still not safely a
 * constant: a longer translated eyebrow word, or a title long enough to wrap,
 * changes its line count in a way that is not knowable until the browser has
 * laid it out. A main/collection screen's tab strip is a harder case again:
 * it is built by a WHOLLY SEPARATE component several layers below
 * `CollectionHeading` (`SectionWithCreate`'s `folderTabs` slot or
 * `PagedFind`'s `tabs`, `web/components/deep-link/screen-bits.tsx` /
 * `web/components/paged-find.tsx`), a plain SIBLING of it in every
 * `*-screen.tsx` file — there is no shared ancestor closer than the document
 * root for a CSS custom property to ride down from, the same reason
 * `shared/web/scale-section.tsx` already publishes a runtime style value to
 * `document.documentElement` rather than threading it through props.
 *
 * MEASURED, NOT GUESSED — a `ResizeObserver` on the bar's own node, so a
 * longer translated eyebrow word or title publishes the bar's REAL height
 * rather than a token that would drift the moment either changed. One
 * `--record-tabs-top` /
 * `--collection-tabs-top` value is ever live at a time (only one detail or
 * collection screen is mounted at once), so nothing here needs to be scoped
 * per-instance. */
export function usePublishCondensedHeight(
  cssVar: string,
  condensed: boolean,
  barRef: React.RefObject<HTMLElement | null>
) {
  React.useEffect(() => {
    if (!condensed) {
      document.documentElement.style.setProperty(cssVar, "0px")
      return
    }
    const el = barRef.current
    if (!el) return
    const publish = () =>
      document.documentElement.style.setProperty(cssVar, `${el.getBoundingClientRect().height}px`)
    publish()
    const resize = new ResizeObserver(publish)
    resize.observe(el)
    return () => resize.disconnect()
  }, [cssVar, condensed, barRef])
}

/**
 * THE STAND-IN ITSELF. `bg-background`, sticky at the page's own top edge,
 * `z-10` — the same layer `STICKY_TABS` draws its floating strip on
 * (record-chrome.tsx: "the shell owns z-20 … everything here takes z-10"), so
 * a mobile app bar still sits above it and the two never fight.
 *
 * Renders nothing while `condensed` is false — no reserved, invisible box —
 * so a screen that never scrolls this far never pays for it.
 *
 * EYEBROW AND TITLE, AND NOTHING ELSE — ONE SHAPE FOR BOTH CALLERS, per the
 * 2026-09-01 ruling quoted at this file's header. This component used to
 * carry a `mark` prop (a record's own header-band mark or logo) and, for a
 * few hours the same day, a DETAIL-only `pills` prop too (the SAME
 * `identityChips` node the full header renders as `chips` — see
 * `RecordScreen`, record-chrome.tsx). Both are gone: `RecordScreen` and
 * `CollectionHeading` (collection-heading.tsx) now hand this component only
 * `eyebrow` and `title`, so there is nothing left here to render a record's
 * mark or its identity pills — they stay in the FULL header, above the fold,
 * and never reach this stand-in. */
export const CondensedTitleBar = React.forwardRef<
  HTMLDivElement,
  {
    /** The bare record-TYPE word ("App", "Ticket"…) on a DETAIL screen, or the
     * nav-section word ("Build", "Accounts"…) on a main/collection screen
     * (`CollectionHeading`) — same slot, same styling, two callers. */
    eyebrow?: React.ReactNode
    /** The bare title. */
    title: React.ReactNode
    condensed: boolean
    className?: string
  }
>(function CondensedTitleBar({ eyebrow, title, condensed, className = "" }, ref) {
  if (!condensed) return null
  return (
    <div
      ref={ref}
      className={
        "bg-background sticky top-0 z-10 flex items-center py-3 " +
        "-mx-6 px-6 lg:-mx-[var(--space-7)] lg:px-[var(--space-7)] " +
        ` ${className}`
      }
    >
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow !== undefined && eyebrow !== null ? (
          <span className="text-micro font-[var(--font-weight-medium)] uppercase text-ink-tertiary">
            {eyebrow}
          </span>
        ) : null}
        <Headline as="span" size="h4" className="min-w-0 truncate">
          {title}
        </Headline>
      </div>
    </div>
  )
})
