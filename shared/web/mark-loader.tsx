"use client"

// MarkLoader — the app's OWN "we are starting" screen, drawn by the same mark
// the splash draws.
//
// WHY THIS BORROWS A GLOBAL INSTEAD OF IMPORTING AN ANIMATOR. The composition is
// already in every exported page: `SplashScreen` inlines it in the <body> of the
// document, before React exists, because that is the only way a boot loader can
// be on screen before the bundle is. Publishing it a second time — as a module
// this component imports — would ship the same four kilobytes twice, once in the
// HTML and once in the JavaScript, and give the two copies a way to disagree
// about the timing. So the animator is published ONCE as `window.__ksMark`, and
// this component asks for it. The React bundle carries the markup string and
// eleven lines of wiring, and nothing else.
//
// It cannot be missing: the layout that renders this app renders SplashScreen
// too. But it can be REFUSED — `__ksMark` returns a no-op for reduced motion,
// for a browser with no requestAnimationFrame, and for markup it does not
// recognise — and in every one of those cases what stays on screen is the mark
// at rest, upright and correct, exactly as the parser drew it. There is no state
// in which this renders nothing.
//
// WHERE IN THE LOOP IT JOINS. `MARK_INAPP_START_MS`, the spin-up — not zero. A
// person reaching this has just watched the ident finish; starting the mark from
// the fly-in again would read as the app restarting rather than continuing.
//
// WHY THE EFFECT WRITES THE MARKUP AND THE JSX DOES NOT. This rendered the SVG
// through `dangerouslySetInnerHTML` first, and it was a frozen logo on the real
// build every time — while working perfectly in every test. React re-applies
// `dangerouslySetInnerHTML` on the FIRST update after hydration even when the
// string has not changed, and that update lands about two milliseconds after
// mount (whatever the session hook sets next). It replaced the sixty-four
// element pool the animator had just installed with the three resting arcs the
// server rendered, and the effect never ran again, because its dependency list
// is empty and the component never remounted. Nothing errored; the mark simply
// stopped.
//
// So React is not given the subtree at all: the host renders EMPTY, and the
// effect owns everything inside it. There is nothing for a re-render to
// re-apply, and it is one fewer dangerouslySetInnerHTML in a client component.
// The cost is one frame of an empty box on mount, inside a container that is
// already full height, so nothing moves.

import * as React from "react"

import { MARK_INAPP_START_MS, splashInner } from "./splash"

declare global {
  interface Window {
    /** Published by the splash's inline script (shared/web/splash.ts). Drives an
     * `.ks-cast` inside the host's <svg>; returns the function that stops it. */
    __ksMark?: (host: Element, opts?: { loop?: boolean; at?: number }) => () => void
  }
}

export function MarkLoader({
  /** What a screen reader says. Passed in, and translated by the CALLER, because
   * the string census that keeps the catalogue honest (R28) reads the two front
   * doors and not shared/ — a sentence written here would be translated nowhere
   * and nothing would go red. */
  label,
  /** Extra classes on the full-height frame. */
  className = "",
}: {
  label: string
  className?: string
}) {
  const host = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const node = host.current
    if (!node) return
    // The resting mark first, so there is something correct on screen even if
    // the animator refuses (reduced motion, no rAF) or has somehow not been
    // published. `splashInner` is a module constant built from constants —
    // there is no value from anywhere else in it.
    node.innerHTML = splashInner()
    return window.__ksMark?.(node, { loop: true, at: MARK_INAPP_START_MS })
  }, [])

  return (
    <div
      className={`flex min-h-[100svh] items-center justify-center p-6 ${className}`}
      aria-busy="true"
    >
      {/* Decorative, and announced separately: a screen reader should hear that
       * the app is starting, not a description of an animation. Empty in JSX —
       * see the header for why React is not allowed to own what is in here. */}
      <div ref={host} className="ks-mark-host" aria-hidden="true" />
      <span className="sr-only" aria-live="polite">
        {label}
      </span>
    </div>
  )
}
