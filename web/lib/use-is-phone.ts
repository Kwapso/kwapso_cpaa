"use client"

// WHAT WIDTH IS THIS? — the two thresholds this app makes a DECISION on, each
// named once and read the same way.
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

/** Tailwind's `md` breakpoint, from above — and it is the KIT's number, not this
 * app's. `ScreenShell` draws both flat columns (the rail and the assistant's
 * aside) inside `hidden … md:flex` docks, so at exactly this width the shell
 * stops drawing a third column and the assistant has to be an overlay instead.
 *
 * 48rem RESOLVES TO 768px HERE AND NOT TO 720. A media query's `rem` is the
 * INITIAL font size (16px) by spec, never the root element's — which matters in
 * this app because tokens.css sets the root to 15px and `data-scale` moves it
 * again. So this query and Tailwind's own `md:` agree at every scale, which is
 * the only reason it is safe for JS to pick a presentation the CSS also picks. */
const COLUMNS_QUERY = "(min-width: 48rem)"

/** The live query, or null where there is no such thing — the static export's
 * render pass has no window at all, and jsdom (every suite in `web/test`) has a
 * window with no `matchMedia` on it. Both fall back to the query's stated
 * default below rather than guessing here. */
function query(q: string): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null
  return window.matchMedia(q)
}

function subscribe(q: string): (onChange: () => void) => () => void {
  return (onChange) => {
    const mq = query(q)
    mq?.addEventListener("change", onChange)
    return () => mq?.removeEventListener("change", onChange)
  }
}

const subscribePhone = subscribe(PHONE_QUERY)
const subscribeColumns = subscribe(COLUMNS_QUERY)

/** Is this a phone-width screen? The server snapshot is `false` because the
 * static export has no window; hydration corrects it in the same commit. */
export function useIsPhone(): boolean {
  return React.useSyncExternalStore(
    subscribePhone,
    () => query(PHONE_QUERY)?.matches ?? false,
    () => false
  )
}

/** Is the shell drawing its side columns — i.e. is there an aside for the
 * assistant to dock into? `false` on the server and in jsdom, which is the
 * honest answer for both: a render pass with no window draws the overlay form,
 * and hydration corrects it in the same commit. */
export function useShellColumns(): boolean {
  return React.useSyncExternalStore(
    subscribeColumns,
    () => query(COLUMNS_QUERY)?.matches ?? false,
    () => false
  )
}
