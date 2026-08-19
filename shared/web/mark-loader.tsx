"use client"

// MarkLoader — THE app's "we are starting" screen. There is exactly one, and
// this is it.
//
// It used to be the second of two. A fixed full-viewport overlay (`#ks-splash`)
// drew the same mark over the top of this one for the first 3.8 seconds of every
// boot, so two element pools and two requestAnimationFrame loops ran at once —
// about a third of the frame rate at 20× CPU throttle, and roughly 2.7 seconds
// of this copy drawn behind an opaque field where nobody could see it. The
// overlay is gone and this kept its job, which is why the notes below read as
// though this file grew: it did.
//
// WHY THIS BORROWS A GLOBAL INSTEAD OF IMPORTING AN ANIMATOR. The animator has
// to be in the exported HTML — that is the only way a boot loader can be moving
// before the bundle is. Publishing it a second time, as a module this component
// imports, would ship the same four kilobytes twice and give the two copies a
// way to disagree about the timing. So it is published ONCE as `window.__ksMark`
// (shared/web/mark-runtime.tsx) and this component asks for it. The React bundle
// carries the markup string and six lines of wiring, and nothing else.
//
// It cannot be missing: the layout that renders this app renders MarkRuntime
// too. But it can be REFUSED — `__ksMark` returns a no-op for reduced motion,
// for a browser with no requestAnimationFrame, and for markup it does not
// recognise — and in every one of those cases what stays on screen is the mark
// at rest, upright and correct, exactly as the parser drew it. There is no state
// in which this renders nothing.
//
// WHY THE MARKUP IS SERVER-RENDERED AGAIN, HAVING ONCE BEEN A BUG. This did
// render the SVG through `dangerouslySetInnerHTML`, and it was a frozen logo on
// the real build every time: React re-applies `dangerouslySetInnerHTML` on the
// FIRST update after hydration even when the string has not changed, and that
// update lands about two milliseconds after mount. It replaced the sixty-four
// element pool the animator had just installed with the three resting arcs, and
// the effect never ran again, because its dependency list is empty and the
// component never remounted. Nothing errored; the mark simply stopped.
//
// The fix at the time was to render EMPTY and let the effect own the subtree,
// which worked and cost one frame of an empty box. It is no longer the right
// trade, because the overlay used to be what the parser painted and now this is:
// an empty box in the HTML is a blank screen until the bundle arrives, which is
// the whole thing a boot loader exists to prevent. So the markup is back in the
// server render, and the fault is answered where it actually lives — the
// animator NOTICES its own group has been detached and takes the cast back
// (`take()` in splash.ts, written for the overlay, which had no other option).
// The cost is one frame, measured; the gain is a mark painted at 0ms on every
// route that waits.
//
// WHERE IN THE LOOP IT JOINS: the beginning, and it loops. It is the opening
// frame now, not a continuation of one, so it starts at the fly-in — and it runs
// for exactly as long as the app takes to arrive rather than for a fixed 3.8
// seconds, because it is the page's own content and React takes it away when
// there is something to show.

import * as React from "react"

import { splashInner } from "./splash"

declare global {
  interface Window {
    /** Published by the inline script (shared/web/splash.ts → MarkRuntime).
     * Drives an `.ks-cast` inside the host's <svg>; returns the function that
     * stops it. One run per host: a second caller gets the first run back. */
    __ksMark?: (host: Element, opts?: { loop?: boolean }) => () => void
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
    // Not necessarily a NEW run: on a cold load the inline script already
    // started this exact host at DOMContentLoaded, and gets handed back here so
    // that unmounting still stops it. On a client-side navigation there was no
    // inline start and this is the one that begins it.
    return window.__ksMark?.(node, { loop: true })
  }, [])

  return (
    // The field, the size and the centring are all in the one stylesheet
    // (splashStyle) rather than in Tailwind classes here, because the ident's
    // onyx and amber are colour LITERALS — the composition's own, not the app's
    // tokens — and R32 allows those in exactly one file, which is splash.ts.
    <div className={`ks-mark-host ${className}`} aria-busy="true">
      {/* Decorative, and announced separately: a screen reader should hear that
       * the app is starting, not a description of an animation. The animator
       * finds this by class from outside React, so the class is part of the
       * contract and not styling.
       *
       * `suppressHydrationWarning` because by the time React gets here the
       * animation has ALREADY been running for however long the bundle took:
       * the inline bootstrap started it at DOMContentLoaded and the animator
       * emptied `.ks-cast` and installed its own pool. So the DOM legitimately
       * does not match what the server rendered, and React logs a mismatch it
       * says it "won't patch up" — which is noise, and noise on the first screen
       * of the app is the kind that gets learned rather than fixed. It patches
       * it up anyway on the next update, and `take()` puts the pool back. */}
      <div
        ref={host}
        className="ks-mark-stage"
        aria-hidden="true"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: splashInner() }}
      />
      <span className="sr-only" aria-live="polite">
        {label}
      </span>
    </div>
  )
}
