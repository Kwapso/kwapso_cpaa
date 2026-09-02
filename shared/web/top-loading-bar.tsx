"use client"

// TopLoadingBar — "I would like an animation on the top of the page that
// moves, kind of a fast progress bar attached to the very top of the screen"
// (client feedback, 31 Aug 2026, with a screenshot of the mango bar sitting
// flush against the viewport's own top edge, above the header/breadcrumb row,
// moving WHILE the page's usual skeleton is also showing). ADDITIVE: it draws
// beside the existing `state="loading"` skeletons, never instead of them.
//
// THE SIGNAL IT READS is `useIsAnyLoading()` (shared/web/store.ts) — the one
// place every screen's own skeleton already comes from, because every one of
// them is reading a `useCached` key and drawing `state="loading"` for exactly
// as long as that read has no answer yet. Mounting this once, here, needed no
// per-screen wiring and cannot disagree with a screen's own skeleton: they are
// the same boolean. It does NOT fire on the "quiet" half of cache-first +
// revalidate (a warm screen refetching in the background) — only on a wait a
// person would otherwise be staring at a bare skeleton for.
//
// WHY MANGO. `shared/ui/components/progress/progress.tsx` documents its own
// one exception to "mango is a brand fill, never a status colour": "the
// route-change bar under the header, which is a composition, not this
// primitive." This component IS that composition — the runner is repointed
// from the primitive's own charcoal (`--surface-inverse`) to `--primary`
// through a `data-slot` descendant selector on an ancestor this file owns,
// the same app-side repoint technique `web/app/layout.tsx` already uses to
// retarget a vendored default without touching `shared/ui/` (which stays
// pinned — R39).
//
// THE SHOW DELAY follows the primitive's own documented rule rather than a
// fresh guess: "under 200ms nothing should have been drawn at all — a flash
// is worse than a wait" (progress.tsx, state 7 in its own JSDoc). A read that
// resolves inside that window never draws the bar at all; the skeleton alone
// carries it, exactly as it always has.
//
// REDUCED MOTION needs nothing written here: `.motion-progress-indeterminate`
// already resolves to a static full-width track under `prefers-reduced-motion:
// reduce` (motion.css §18B), inherited for free by reusing the real
// primitive instead of hand-rolling a second sweep.
//
// DECORATIVE, ON PURPOSE. `aria-hidden` on the whole thing: the screen behind
// it already carries whatever accessible "this is loading" state its own
// skeleton/`RecordScreen` sets, so an unlabelled second `role="progressbar"`
// here would only be a duplicate announcement, not new information — the
// same reasoning against a redundant "Loading…" label the primitive's own
// JSDoc gives for state 7.

import * as React from "react"

import { Progress } from "@shared/ui/components/progress/progress"
import { useIsAnyLoading } from "./store"

/** How long a wait has to run before the bar draws at all (progress.tsx's own
 * "under 200ms nothing should have been drawn" rule, given a few ms of margin
 * so the timer firing doesn't itself race the 200ms line). */
const SHOW_DELAY_MS = 180

export function TopLoadingBar() {
  const loading = useIsAnyLoading()
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    if (!loading) {
      setVisible(false)
      return
    }
    const id = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [loading])

  if (!visible) return null

  return (
    <div
      aria-hidden="true"
      data-slot="top-loading-bar"
      className="pointer-events-none fixed inset-x-0 top-0 z-[45] [&_[data-slot=progress-runner]]:bg-primary"
    >
      <Progress indeterminate className="h-[3px] rounded-none border-0 bg-transparent" />
    </div>
  )
}
