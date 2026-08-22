"use client"

// useVirtualRows — windowed rendering for any collection that lays its rows out
// as a vertical stack (a list, a table body, a responsive card grid).
//
// WHAT IT DOES: keeps only the rows near the viewport in the DOM and replaces
// the rest with empty space, so a 2,000-row screen holds ~30 nodes instead of
// 2,000. Total height, scroll position and the scrollbar are unchanged.
//
// WHAT IT DOESN'T DO: it never changes a component's public props, never
// requires a fixed height, and never imposes its own scroll container. It finds
// whichever ancestor is already scrolling (falling back to the page) and windows
// against that — so a host recipe needs no edits, and a collection that sits in
// a normal, page-scrolled layout keeps behaving exactly as it looks.
//
// Two things are measured from the real DOM rather than configured:
//   • PITCH — the distance from one visual row's top to the next. A pitch, not a
//     height, because it must include the grid gap.
//   • COLUMNS — how many items share a visual row, found by counting the
//     children that share the first child's offsetTop. That is what makes the
//     same hook work for a 1-column list and a grid whose column count changes
//     at every breakpoint, with no prop to keep in sync.

import * as React from "react"

import { initialWindow, windowSlice } from "../../../lib/virtual"

/** Rows above this count get windowed; below it nothing changes at all. Set so
 *  that ordinary screens (a 20-row list, a paginated table) are byte-identical
 *  to before, and only genuinely large collections pay for the machinery. */
export const VIRTUALIZE_THRESHOLD = 100

/** Marks the spacer nodes a consumer inserts, so measurement skips them. */
export const SPACER_ATTR = "data-virtual-spacer"

export interface UseVirtualRowsOptions {
  /** Total items in the collection. */
  count: number
  /** Row pitch to assume until a real one is measured. Only affects the first
   *  paint — get it roughly right and there is no visible settle. */
  estimatePitch: number
  /** Visual rows kept mounted above and below the viewport. */
  overscan?: number
  /** Force windowing on or off. Left undefined it turns itself on past
   *  VIRTUALIZE_THRESHOLD, which is what keeps the props API unchanged. */
  enabled?: boolean
}

export interface VirtualRows {
  /** Put on the element that directly contains the row elements. */
  containerRef: (node: HTMLElement | null) => void
  /** Render `items.slice(start, end)`. */
  start: number
  end: number
  /** Empty space to leave above / below, in px. Apply however the layout
   *  demands — padding on a flex or grid container, spacer rows in a table. */
  padTop: number
  padBottom: number
  /** false = windowing is off; render every row exactly as before. */
  active: boolean
}

interface Measured {
  pitch: number
  columns: number
}

/** Distance to the next visual row, and how many items share one row. */
function measureRows(container: HTMLElement): Measured | null {
  const rows: HTMLElement[] = []
  for (const child of Array.from(container.children)) {
    if (!(child instanceof HTMLElement)) continue
    if (child.hasAttribute(SPACER_ATTR)) continue
    rows.push(child)
  }
  if (rows.length === 0) return null

  const firstTop = rows[0].offsetTop
  let columns = 1
  let pitch = 0
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].offsetTop === firstTop) columns++
    else {
      pitch = rows[i].offsetTop - firstTop
      break
    }
  }
  // Only one visual row is mounted, so there is no next row to measure against.
  // The row's own height is the best available answer; any gap is picked up as
  // soon as a second row renders.
  if (pitch <= 0) pitch = rows[0].offsetHeight
  if (pitch <= 0) return null
  return { pitch, columns }
}

// These components are server-rendered before they hydrate, and React warns
// about useLayoutEffect on the server. There is no layout to read there anyway,
// so fall back to useEffect — the browser still gets the pre-paint version.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect

/**
 * The nearest ancestor that actually scrolls, or null meaning "the page".
 *
 * `<html>` and `<body>` are deliberately excluded, and getting that wrong is not
 * cosmetic. This library sets `html { overflow-x: hidden }`, and CSS computes the
 * other axis of a hidden overflow to `auto` — so the root ALWAYS looked like a
 * scroll container. It would then be measured like one, and for the root element
 * `getBoundingClientRect().top` is not 0 but `-scrollTop`: subtracting that from
 * the list's top cancels the scroll out exactly, so the window would sit still
 * while the user scrolled the page. Page scrolling is the null branch instead.
 */
function findScroller(el: HTMLElement): HTMLElement | null {
  const root = el.ownerDocument.documentElement
  const body = el.ownerDocument.body
  for (let n = el.parentElement; n; n = n.parentElement) {
    if (n === root || n === body) break
    const overflow = getComputedStyle(n).overflowY
    if (
      (overflow === "auto" ||
        overflow === "scroll" ||
        overflow === "overlay") &&
      n.scrollHeight > n.clientHeight
    )
      return n
  }
  return null
}

/** The scrolling viewport's top edge and height, in client coordinates. */
function viewportOf(scroller: HTMLElement | null): {
  top: number
  height: number
} {
  if (scroller)
    return {
      top: scroller.getBoundingClientRect().top,
      height: scroller.clientHeight,
    }
  // The page. `documentElement.clientHeight` is the layout viewport and is the
  // more dependable of the two — `innerHeight` includes browser chrome on some
  // mobile browsers and reads 0 in some headless harnesses.
  return {
    top: 0,
    height: document.documentElement.clientHeight || window.innerHeight,
  }
}

export function useVirtualRows({
  count,
  estimatePitch,
  overscan = 6,
  enabled,
}: UseVirtualRowsOptions): VirtualRows {
  const active = enabled ?? count > VIRTUALIZE_THRESHOLD

  const [node, setNode] = React.useState<HTMLElement | null>(null)
  const [measured, setMeasured] = React.useState<Measured | null>(null)
  // The first paint must be identical on the server and the client or React
  // throws a hydration mismatch, so it is derived from props alone.
  const [slice, setSlice] = React.useState(() =>
    initialWindow(count, estimatePitch, 1, overscan)
  )

  // Everything below reads layout, so it belongs in a layout effect: the
  // corrected window is in place before the browser paints, and the first frame
  // never flashes the estimate.
  useIsomorphicLayoutEffect(() => {
    if (!active || !node) return

    const scroller = findScroller(node)
    let current = measured

    const remeasure = () => {
      const next = measureRows(node)
      if (!next) return
      if (
        !current ||
        next.pitch !== current.pitch ||
        next.columns !== current.columns
      ) {
        current = next
        setMeasured(next)
      }
    }

    const recompute = () => {
      const view = viewportOf(scroller)
      const next = windowSlice({
        count,
        columns: current?.columns ?? 1,
        pitch: current?.pitch ?? estimatePitch,
        listTop: node.getBoundingClientRect().top - view.top,
        viewportHeight: view.height,
        overscan,
      })
      // Bail out on an unchanged window so a scroll event that moves less than
      // one row does not re-render the collection.
      setSlice((prev) =>
        prev.start === next.start &&
        prev.end === next.end &&
        prev.padTop === next.padTop &&
        prev.padBottom === next.padBottom
          ? prev
          : next
      )
    }

    remeasure()
    recompute()

    const onScroll = () => recompute()
    // A resize can change the COLUMN COUNT (a grid re-flowing at a breakpoint)
    // and the row height, so it re-measures rather than just recomputing.
    const onResize = () => {
      remeasure()
      recompute()
    }

    const scrollTarget: EventTarget = scroller ?? window
    scrollTarget.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onResize)
    return () => {
      scrollTarget.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onResize)
    }
    // `measured` is listed so the closure never goes stale. It only ever
    // changes when the pitch or column count genuinely differs (remeasure
    // compares before setting), so the listeners are rebuilt once on mount and
    // then only at a breakpoint — not on every scroll.
  }, [active, node, count, estimatePitch, overscan, measured])

  if (!active)
    return {
      containerRef: setNode,
      start: 0,
      end: count,
      padTop: 0,
      padBottom: 0,
      active: false,
    }

  return {
    containerRef: setNode,
    start: slice.start,
    end: slice.end,
    padTop: slice.padTop,
    padBottom: slice.padBottom,
    active: true,
  }
}
