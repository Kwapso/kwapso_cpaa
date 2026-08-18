"use client"

// IS THIS A PHONE? — one media query, one hook, one answer.
//
// It was written inside record-picker.tsx, where a phone gets a sheet instead of
// a popover. The calendar needs the same fact for a different reason (a month
// grid at 375px is six rows of cells three characters wide, so a phone opens on
// the agenda instead), and two copies of "what counts as a phone" is two numbers
// that drift — the same argument shared/web/format.ts opens with about dates.
//
// `useSyncExternalStore` rather than an effect so the FIRST render already knows.
// An effect would paint the desktop answer and then swap it, and the swap is
// visible: a month grid that appears for one frame on a phone before the agenda
// replaces it reads as a bug.

import * as React from "react"

/** Tailwind's `sm` breakpoint, from below. One number, named once, so the sheet,
 * the calendar and any future phone behaviour cannot drift apart from the CSS. */
const PHONE_QUERY = "(max-width: 639px)"

/** The live query, or null where there is no such thing — the static export's
 * render pass has no window at all, and jsdom (every suite in `web/test`) has a
 * window with no `matchMedia` on it. Both answer "not a phone", which is the
 * right answer: neither one is. */
function phoneQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null
  return window.matchMedia(PHONE_QUERY)
}

function subscribePhone(onChange: () => void): () => void {
  const mq = phoneQuery()
  mq?.addEventListener("change", onChange)
  return () => mq?.removeEventListener("change", onChange)
}

/** Is this a phone-width screen? The server snapshot is `false` because the
 * static export has no window; hydration corrects it in the same commit. */
export function useIsPhone(): boolean {
  return React.useSyncExternalStore(
    subscribePhone,
    () => phoneQuery()?.matches ?? false,
    () => false
  )
}
