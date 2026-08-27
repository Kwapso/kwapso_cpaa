"use client"

// WHERE EACH SCROLLED AREA WAS — the one piece of "where she was" that cannot be
// held as a React value, because the thing holding it is the DOM.
//
// THE DOCUMENT IS THE SCROLLER (app-shell's `<main>` is `overflow-x-clip`,
// deliberately, so `position: sticky` works — see the note there), so the
// vertical position of a screen is `window.scrollY`. Everything else that
// scrolls is INSIDE the content: a wide table (`overflow-x-auto`, the kit's own
// Table), a tab strip too long for the width, a capped panel with its own
// scrollbar. Those are kit components — `shared/ui/` is a pinned dependency and
// hand-editing it turns the build red — so this does not ask them to remember
// anything. It reads them off the page.
//
// HOW A SCROLLER IS IDENTIFIED: by its position among the scrollers, in document
// order. Not by a selector, not by an id — a row's `<tr>` has neither, and the
// list under it is live (R15), so anything derived from the CONTENT would be
// stale by design. Position is stable for as long as the screen's SHAPE is
// stable, which is exactly as long as restoring is meaningful. When the shape
// has changed, the index lands on a different box or on nothing at all, and the
// worst that produces is a table that is not scrolled — which is where it would
// have been anyway.
//
// EVERY FAILURE HERE DEGRADES TO THE TOP. An offset past the end of a list that
// got shorter is clamped BY THE BROWSER (assigning 4000 to a `scrollTop` whose
// maximum is 900 stores 900) — we never compute a maximum, so we cannot get that
// arithmetic wrong. A missing element is skipped. A snapshot that will not
// serialise is never stored. There is no branch in this file that can strand
// somebody on a blank screen.

import * as React from "react"

import { readSlot, writeSlot } from "@/lib/nav-memory"

/** Scrolled areas remembered for one screen. The document's own position is one
 * number and is always kept; this bounds the INNER ones, which is the list that
 * could in principle grow with the page. Twenty is far more scrollable boxes
 * than any screen in this app has, and a hard stop in front of one that
 * generates them. */
const MAX_REMEMBERED_SCROLLERS = 20

/** How long we keep trying to put a screen back where it was. The rows arrive
 * from a cache or a fetch AFTER the first paint, so the page is short when we
 * land and grows underneath us — restoring once, immediately, would clamp to
 * near-zero and look exactly like the bug this feature is about. Each attempt
 * is a `scrollTo`; the schedule stops early the moment the position sticks. */
const RESTORE_ATTEMPTS_MS = [0, 120, 300, 600, 1000]

/** The document's own offset, plus `[index, left, top]` for every inner box
 * that was not at its origin. */
type ScrollSnapshot = { y: number; inner: [number, number, number][] }

const SLOT = "scroll"

/** Every element inside the content region that can actually scroll, in
 * document order. Walked only when something is being remembered or restored —
 * never on every scroll event. */
function scrollers(): HTMLElement[] {
  const root = document.querySelector("main")
  if (!root) return []
  const found: HTMLElement[] = []
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    const scrollsY = el.scrollHeight - el.clientHeight > 1
    const scrollsX = el.scrollWidth - el.clientWidth > 1
    if (!scrollsY && !scrollsX) continue
    const style = getComputedStyle(el)
    const overflows = `${style.overflowX} ${style.overflowY}`
    if (!overflows.includes("auto") && !overflows.includes("scroll")) continue
    found.push(el)
    if (found.length >= MAX_REMEMBERED_SCROLLERS) break
  }
  return found
}

function snapshot(): ScrollSnapshot {
  const inner: [number, number, number][] = []
  scrollers().forEach((el, i) => {
    if (el.scrollLeft || el.scrollTop) inner.push([i, el.scrollLeft, el.scrollTop])
  })
  return { y: window.scrollY, inner }
}

/** Remembering and re-finding the scroll positions of one screen.
 *
 * `capture` is handed back rather than run on a timer, because the moment to
 * read a screen's scroll position is the instant BEFORE it is replaced — while
 * its DOM is still on the page. The host calls it from `go`/`replace`, which is
 * every deliberate move in the app (R37 makes that the only kind there is). */
export function useScrollMemory(teamId: string | null, path: string): () => void {
  // True while we are the ones scrolling. Without it, the smooth-ish sequence of
  // `scrollTo` calls below would be read back as "the person moved" by anything
  // watching, and a restore would overwrite the memory it was restoring from.
  const restoring = React.useRef(false)
  const here = React.useRef(path)
  here.current = path

  const capture = React.useCallback(() => {
    if (restoring.current) return
    if (typeof window === "undefined") return
    writeSlot(teamId, here.current, SLOT, snapshot())
  }, [teamId])

  // Has this hook seen a move yet? The FIRST run is the document loading, and
  // where a freshly loaded document is scrolled to belongs to the browser (a
  // reload, a Back into the app, an anchor). Every run after it is a move
  // inside the one shell.
  const moved = React.useRef(false)

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const first = !moved.current
    moved.current = true
    const remembered = readSlot(teamId, path, SLOT) as ScrollSnapshot | undefined
    if (!remembered) {
      // NOTHING REMEMBERED IS THE SECTION'S TOP, said out loud rather than left
      // to the browser. A History-API move does not reset the scroll position —
      // that is the browser's rule for a single document, and this app is one
      // document — so leaving a long list at row four hundred and opening a
      // different section put you four hundred rows down a screen you had never
      // seen. It looked like a rendering fault and it was the shell's oldest
      // unnoticed one. "Degrade to the top" is the promise the whole memory
      // makes; this is the case where there is nothing to degrade FROM.
      if (!first) window.scrollTo(0, 0)
      return
    }
    restoring.current = true
    let done = false
    const stop = () => {
      done = true
      restoring.current = false
    }
    // THE PERSON WINS, ALWAYS. The instant they touch the page we stop putting
    // it back — a restore that fights a scroll wheel is worse than no restore.
    const surrender = () => stop()
    const events = ["wheel", "touchstart", "keydown", "pointerdown"] as const
    for (const e of events) window.addEventListener(e, surrender, { passive: true, once: true })

    const timers: number[] = []
    const attempt = (last: boolean) => {
      if (done) return
      window.scrollTo(0, remembered.y)
      const boxes = scrollers()
      for (const [i, left, top] of remembered.inner) {
        const el = boxes[i]
        if (!el) continue
        el.scrollLeft = left
        el.scrollTop = top
      }
      // Stuck at the target (or as close as the page allows)? Then the page has
      // finished growing and there is nothing left to wait for.
      //
      // AND THE LAST ATTEMPT ENDS IT WHETHER OR NOT IT WORKED. Without this the
      // flag stays raised for a target the page never grew tall enough to reach
      // — and a raised flag makes `capture` stand down, so the NEXT time she
      // left that screen its position would not be written down. A restore that
      // failed would quietly stop the screen ever being remembered again.
      if (last || Math.abs(window.scrollY - remembered.y) < 2) stop()
    }
    // PLAIN TIMERS, NOT `requestAnimationFrame`. rAF does not fire in a tab the
    // browser has backgrounded, and "she came back to the tab" is one of the
    // moments this feature exists for — the first version wrapped every attempt
    // in a frame callback and simply never restored anything in a hidden tab,
    // which looked exactly like the bug it was written to fix.
    RESTORE_ATTEMPTS_MS.forEach((delay, i) =>
      timers.push(
        window.setTimeout(() => attempt(i === RESTORE_ATTEMPTS_MS.length - 1), delay)
      )
    )

    return () => {
      stop()
      for (const id of timers) window.clearTimeout(id)
      for (const e of events) window.removeEventListener(e, surrender)
    }
  }, [teamId, path])

  // A box INSIDE the content is not covered by `capture` alone: the person can
  // scroll a wide table sideways and then leave through a control that does not
  // route (a dialog, a tab). Scroll events do not bubble, so this listens in the
  // capture phase, and it is debounced to the end of the gesture — the walk is
  // cheap but it is not free, and nobody needs it sixty times a second.
  React.useEffect(() => {
    if (typeof window === "undefined") return
    let timer = 0
    const onScroll = (e: Event) => {
      if (restoring.current) return
      if (e.target === document || e.target === document.documentElement) return
      window.clearTimeout(timer)
      timer = window.setTimeout(capture, 200)
    }
    document.addEventListener("scroll", onScroll, { capture: true, passive: true })
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("scroll", onScroll, { capture: true })
    }
  }, [capture])

  return capture
}
