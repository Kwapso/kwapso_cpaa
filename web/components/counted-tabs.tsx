"use client"

// The count ARBITRATION seam (R16 iii). Two surfaces can carry a collection's
// count — a tab badge and a CollectionHeading — and a screen must show it
// EXACTLY once (ours once showed "24k" on the tab and "24k" in the heading
// directly beneath). The rule: a tab carrying the count WINS; the heading
// stands down. It is a React CONTEXT, not a prop, because whether a counted
// tab strip exists is a PER-PERMISSION answer (the strip may render null for
// this viewer) — a prop would make every caller re-derive that and be silently
// wrong for the roles nobody tests with.

import * as React from "react"

const CountedContext = React.createContext(false)

/** Does a counted tab strip wrap (or stand above) this spot? The heading calls
 * this ABOVE its early return and renders null when true. */
export function useCountStandsDown(): boolean {
  return React.useContext(CountedContext)
}

/** Wrap the PANEL of a tab whose strip carries the collection's count badge —
 * only badged panels are marked, so an uncounted tab's panel still lets a
 * heading show its number. */
export function CountedTabs({
  badged,
  children,
}: {
  /** whether the strip actually renders a count badge for THIS panel's tab
   * (per-permission: pass the same condition that produced the badge). */
  badged: boolean
  children: React.ReactNode
}) {
  return <CountedContext.Provider value={badged}>{children}</CountedContext.Provider>
}

/** The sibling case: a counted scope strip (My/All, Articles/Progress) rendered
 * INSIDE the panel, above where a heading would sit — same arbitration, explicit
 * provider because nothing wraps the heading. */
export function CountedAbove({
  active,
  children,
}: {
  /** whether the sibling strip above is actually showing a count badge. */
  active: boolean
  children: React.ReactNode
}) {
  return <CountedContext.Provider value={active}>{children}</CountedContext.Provider>
}
