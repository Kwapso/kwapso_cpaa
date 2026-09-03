"use client"

// WHERE EACH SCROLLED AREA WAS — the one piece of "where she was" that cannot be
// held as a React value, because the thing holding it is the DOM.
//
// THE PAGE IS NOT THE SCROLLER ANY MORE, AND THAT IS THE WHOLE OF THIS FILE'S
// 2026-09-02 REWRITE. `ScreenShell` (kit v1.2.28) draws the window as `h-dvh
// overflow-hidden` and gives each column its own scroller; the screen's own
// vertical position is now `scrollTop` on ONE element — the card's body,
// `[data-slot="screen-shell-body"]` — and `window.scrollY` is permanently 0.
// Every read and every write in this file used to be the window's. Left alone,
// the file would have kept working in the sense that nothing threw: it would
// have written 0 on the way out, restored 0 on the way in, and silently stopped
// putting anybody back where they were.
//
// AND IT WOULD HAVE TAKEN THE OTHER HALF WITH IT — "a new screen starts at the
// top" is the same `scrollTo` call (see `SCROLLER` and the restore below), so a
// dead one leaves you four hundred rows down a section you have never opened.
// That failure is silent and looks like a rendering fault, which is exactly how
// it went unnoticed the first time.
//
// ONE MORE THING WAS ALREADY DEAD BEFORE THIS CHANGE, and it is fixed here
// rather than carried: the inner walk was rooted at `document.querySelector(
// "main")`, and this shell has drawn no `<main>` since the rail moved inside
// the kit's `ScreenShell`. That query returned `null` on every signed-in
// screen, so `scrollers()` returned an empty list and no inner box has been
// remembered for weeks. The root is the body pane now — the one element that is
// guaranteed to exist wherever this hook runs, published by the kit under a
// stable slot name rather than inferred from a tag.
//
// Everything else that scrolls is INSIDE that pane: a wide table
// (`overflow-x-auto`, the kit's own Table), a tab strip too long for the width,
// a capped panel with its own scrollbar. Those are kit components —
// `shared/ui/` is a pinned dependency and hand-editing it turns the build red —
// so this does not ask them to remember anything. It reads them off the page.
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
// arithmetic wrong. A missing element is skipped. A missing PANE is skipped:
// every function below opens by asking for it and returns quietly when there is
// none, so this hook is inert rather than broken on a screen that draws no
// shell. A snapshot that will not serialise is never stored. There is no branch
// in this file that can strand somebody on a blank screen.

import * as React from "react"

import { readSlot, writeSlot } from "@/lib/nav-memory"

/** Scrolled areas remembered for one screen. The pane's own position is one
 * number and is always kept; this bounds the INNER ones, which is the list that
 * could in principle grow with the page. Twenty is far more scrollable boxes
 * than any screen in this app has, and a hard stop in front of one that
 * generates them. */
const MAX_REMEMBERED_SCROLLERS = 20

/** How long we keep trying to put a screen back where it was. The rows arrive
 * from a cache or a fetch AFTER the first paint, so the pane is short when we
 * land and grows underneath us — restoring once, immediately, would clamp to
 * near-zero and look exactly like the bug this feature is about. Each attempt
 * assigns `scrollTop`; the schedule stops early the moment the position sticks. */
const RESTORE_ATTEMPTS_MS = [0, 120, 300, 600, 1000]

/** The pane's own offset, plus `[index, left, top]` for every inner box that was
 * not at its origin. The shape is unchanged from when `y` meant the window's
 * own offset — a remembered snapshot written by the old build still reads, and
 * lands the pane where the page used to be, which is the same place. */
type ScrollSnapshot = { y: number; inner: [number, number, number][] }

const SLOT = "scroll"

/** THE SCREEN'S SCROLLER. The kit publishes it as a slot name on the card's
 * body (`screen-shell.tsx`, `BODY`), which is a stable interface in a file this
 * repo may not hand-edit — the alternative, matching on a class or a tag, would
 * be reading the kit's private layout and would break on its next release.
 *
 * `null` whenever no shell is mounted (the login screen, onboarding, the error
 * boundary — all three still own their own document-scrolled page), and every
 * caller below treats that as "nothing to do". */
function pane(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-slot="screen-shell-body"]')
}

/** Every element INSIDE the screen's scroller that can itself scroll, in
 * document order. The pane itself is excluded — its position is `y`, and
 * counting it here would store one number in two places and let them disagree.
 * Walked only when something is being remembered or restored — never on every
 * scroll event. */
function scrollers(root: HTMLElement): HTMLElement[] {
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

function snapshot(root: HTMLElement): ScrollSnapshot {
  const inner: [number, number, number][] = []
  scrollers(root).forEach((el, i) => {
    if (el.scrollLeft || el.scrollTop) inner.push([i, el.scrollLeft, el.scrollTop])
  })
  return { y: root.scrollTop, inner }
}

/** Remembering and re-finding the scroll positions of one screen.
 *
 * `capture` is handed back rather than run on a timer, because the moment to
 * read a screen's scroll position is the instant BEFORE it is replaced — while
 * its DOM is still on the page. The host calls it from `go`/`replace`, which is
 * every deliberate move in the app (R37 makes that the only kind there is). */
export function useScrollMemory(teamId: string | null, path: string): () => void {
  // True while we are the ones scrolling. Without it, the sequence of
  // assignments below would be read back as "the person moved" by anything
  // watching, and a restore would overwrite the memory it was restoring from.
  const restoring = React.useRef(false)
  const here = React.useRef(path)
  here.current = path

  const capture = React.useCallback(() => {
    if (restoring.current) return
    if (typeof window === "undefined") return
    const root = pane()
    if (!root) return
    writeSlot(teamId, here.current, SLOT, snapshot(root))
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
      //
      // IT IS THE PANE THAT GOES BACK TO THE TOP NOW, not the window. The pane
      // SURVIVES the move — it is the kit's element, inside a shell that mounts
      // once (R37) — so its `scrollTop` carries across a navigation exactly as
      // the document's used to, and this line is what stops it.
      if (!first) pane()?.scrollTo(0, 0)
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
    // Still listened for on `window`: all four of these bubble, whichever box
    // inside the shell they started in.
    const surrender = () => stop()
    const events = ["wheel", "touchstart", "keydown", "pointerdown"] as const
    for (const e of events) window.addEventListener(e, surrender, { passive: true, once: true })

    const timers: number[] = []
    const attempt = (last: boolean) => {
      if (done) return
      const root = pane()
      // NO PANE, NOTHING TO PUT BACK — and no reason to keep trying, because a
      // screen that is not drawing the shell is not the screen this memory is
      // about. Ends the schedule rather than burning the remaining timers.
      if (!root) {
        stop()
        return
      }
      root.scrollTop = remembered.y
      const boxes = scrollers(root)
      for (const [i, left, top] of remembered.inner) {
        const el = boxes[i]
        if (!el) continue
        el.scrollLeft = left
        el.scrollTop = top
      }
      // Stuck at the target (or as close as the pane allows)? Then the content
      // has finished growing and there is nothing left to wait for.
      //
      // AND THE LAST ATTEMPT ENDS IT WHETHER OR NOT IT WORKED. Without this the
      // flag stays raised for a target the pane never grew tall enough to reach
      // — and a raised flag makes `capture` stand down, so the NEXT time she
      // left that screen its position would not be written down. A restore that
      // failed would quietly stop the screen ever being remembered again.
      if (last || Math.abs(root.scrollTop - remembered.y) < 2) stop()
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
  //
  // THE PANE'S OWN SCROLL COMES THROUGH HERE TOO NOW, and that is an
  // improvement rather than a leak: `capture` writes the WHOLE snapshot, so a
  // screen's vertical position is written down as she reads it rather than only
  // at the instant she leaves. The document-target guard the old version needed
  // is gone with the document scroller it was filtering out.
  React.useEffect(() => {
    if (typeof window === "undefined") return
    let timer = 0
    const onScroll = () => {
      if (restoring.current) return
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
