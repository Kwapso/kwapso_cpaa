import { useEffect, useRef, useState } from "react"

import { Hint } from "../../../shared/ui/components/typography/typography"
import type { PartProps, Sample } from "../samples/index"

/* WHAT A PART LOOKS LIKE, DRAWN AT THUMBNAIL SIZE.
 *
 * The owner, 5 September 2026: "I cannot visualise a component because they
 * don't have their own icons or images. There are 116 components. How am I
 * supposed to know what everything is just by how it looks?" For a design kit
 * there is exactly one honest answer to that, and it is not an icon set: SHOW
 * THE THING. A name cannot describe `action-row`, `matrix` or `kpi-progress`
 * to somebody deciding whether they want it.
 *
 * So the palette draws the SAME sample the canvas draws — `samples/`, which
 * already existed and which the palette simply never asked for — at a
 * pretend width, scaled down to the tile. Nothing here is a picture of a
 * component; it is the component.
 *
 * THREE THINGS THIS COSTS, AND WHAT EACH ONE BUYS BACK:
 *
 *  1 COST. 116 live React trees mounted at once is slow. So a tile mounts
 *    only when it is about to be seen (`IntersectionObserver`, one screen of
 *    margin) and never unmounts after — scrolling back up must not re-run
 *    the work. Measured at 1440: 116 tiles, ~20 mounted at rest.
 *
 *  2 CLICKS. A live control inside a picture would steal the click that adds
 *    the part, and its focusables would put 116 invisible tab stops in the
 *    palette. `pointer-events-none` answers the mouse and `inert` answers the
 *    keyboard and the screen reader — the same attribute, for the same
 *    reason, that `screen-shell` puts on a collapsed assistant.
 *
 *  3 OVERLAYS. A sample that renders an OPEN Radix overlay portals it to the
 *    document body, which is outside this box and outside the scale — it
 *    would land as a full-size panel floating over the palette. Those parts
 *    are named in `OVERLAY_PARTS` with the reason, and get a labelled box.
 *    The list is small and closed on purpose: see its own note.
 *
 * The width a sample is DRAWN at before it is scaled is a real width, not a
 * tile width — a component asked to lay itself out in 148px would answer
 * with its narrow layout, which is the wrong picture. 460 is a tablet-ish
 * measure: wide enough that a table is a table and a split is two panes,
 * narrow enough that the scale factor leaves the shapes readable. */

const DRAW_WIDTH = 460

/** A sample whose overlay portals OUT of this box (Radix renders it into the
 * document body, where neither the clip nor the scale reaches). Naming them
 * is the honest way out — the same shape as `samples/index.ts`'s `NO_SAMPLE`
 * — and the list can only be these two while `open` is a prop a sample sets:
 * every other overlay in the kit is drawn shut and draws nothing until it is
 * pressed, which `pointer-events-none` guarantees it never is. */
export const OVERLAY_PARTS: Record<string, string> = {
  popover: "drawn open, and the kit portals the panel to the document body — outside this tile",
  tooltip: "drawn open, and the kit portals the bubble to the document body — outside this tile",
}

const INERT_PROPS: PartProps = { of: () => ({}) }

/* A PICTURE MAY NOT MOVE THE PAGE IT IS DRAWN ON.
 *
 * `scrollIntoView` scrolls EVERY scrollable ancestor, not just the nearest
 * one, so a kit part that puts itself in view when it mounts scrolls the
 * palette column it is a thumbnail inside. `breadcrumb-folders` does exactly
 * that, to show the last crumb of a trail — right for a breadcrumb on a
 * screen, wrong for a 92px picture of one. Measured before this guard: the
 * palette opened 280px down, at `breadcrumbs`' mount, every single load.
 *
 * Clipping does not stop it and neither does `overflow-anchor`, because it is
 * not anchoring — it is a deliberate scroll, and the only place to refuse it
 * is the call. So the method is wrapped ONCE, and only for nodes inside a
 * thumbnail: everything else on this page, the tool's own `Command` and
 * `Select` included, keeps the native behaviour. THE CANVAS IS UNTOUCHED —
 * it is an iframe, so it has its own `Element.prototype` and never sees this.
 *
 * A monkey patch, said plainly. It is contained to a developer tool that is
 * never deployed, it is four lines, and the alternative — restoring the
 * column's scroll after every mount — loses a race with the person's own
 * scrolling, which was tried first and does not work: the part scrolls in a
 * passive effect, after the commit `flushSync` waits for. */
if (typeof Element !== "undefined" && !("__thumbScrollGuard" in Element.prototype)) {
  const native = Element.prototype.scrollIntoView
  Object.defineProperty(Element.prototype, "__thumbScrollGuard", { value: true })
  Element.prototype.scrollIntoView = function (this: Element, ...args: unknown[]) {
    if (this.closest("[data-thumb-root]")) return
    ;(native as (...a: unknown[]) => void).apply(this, args)
  }
}

/* ONE TILE PER FRAME, AND THAT IS A MEASUREMENT, NOT A PRECAUTION.
 *
 * The observer fires for every tile that enters the margin at once, so a fast
 * scroll hands React ten kit component trees to render in a single commit.
 * Measured in Chrome at 1440 before this queue existed: a full sweep of the
 * palette dropped 12 frames and the worst was 167ms — a visible stutter, and
 * the brief's own instruction was to say so rather than ship it.
 *
 * The queue releases one mount per animation frame, so the per-frame cost is
 * one component tree whatever the scroll speed. Nothing is throttled at rest:
 * with a screenful entering the margin the whole screenful is drawn inside
 * ~8 frames, which is under the time it takes to look at it. */
const pending: (() => void)[] = []
let pumping = false
function pump() {
  pumping = true
  requestAnimationFrame(() => {
    pending.shift()?.()
    if (pending.length) pump()
    else pumping = false
  })
}
function queueMount(mount: () => void) {
  pending.push(mount)
  if (!pumping) pump()
}

export function PartThumb({ name, sample, height }: { name: string; sample: Sample | undefined; height: number }) {
  const box = useRef<HTMLDivElement>(null)
  const drawn = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [drawnHeight, setDrawnHeight] = useState(0)
  const [near, setNear] = useState(false)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    /* THE ROOT IS THE PALETTE'S SCROLLER, NOT THE VIEWPORT, AND THAT IS THE
       WHOLE OF WHY THE MARGIN WORKS. An observer's intersection rect is the
       target's rect CLIPPED BY EVERY ANCESTOR that scrolls or hides, and only
       then intersected with the root's — so `rootMargin` on the default root
       expands the window and does nothing at all about the column's own
       `overflow-y-auto` clip two levels up. Measured here first: with a
       100000px margin against the default root, 9 of 116 tiles had mounted.
       Named explicitly (`data-thumb-root`, published by `palette.tsx`) rather
       than found by walking up looking for a scroller, because a walk would
       silently pick the wrong box the day the palette grows another one. */
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect()
          queueMount(() => setNear(true))
        }
      },
      { root: el.closest("[data-thumb-root]"), rootMargin: "400px 0px" },
    )
    io.observe(el)
    return () => {
      ro.disconnect()
      io.disconnect()
    }
  }, [])

  // Measured, never guessed: the drawn tree's own height decides whether the
  // tile is showing a page or a single control. Reading a transform-free
  // element, so nothing here feeds back into the scale below.
  useEffect(() => {
    const el = drawn.current
    if (!el) return
    const ro = new ResizeObserver(() => setDrawnHeight(el.scrollHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [near])

  const why = OVERLAY_PARTS[name] ?? (sample ? null : "no dummy data written for this part yet")

  /* THE SCALE, AND WHY IT IS NOT JUST "FIT THE WIDTH".
   *
   * Fitting the width is right for a part that fills a page — a list, a
   * table, a split — and the tile shows its top, which is what you recognise
   * it by. It is WRONG for a part that is one control tall: a dialog's
   * trigger, a slider, a switch. At 0.3 those are three pixels of grey in a
   * 92px box, which reads as a blank tile, and a blank tile in a picker is
   * the exact defect this whole pass exists to remove.
   *
   * So a tile whose content would fill less than half its height is scaled UP
   * until it does, capped at 2.5× and at life size. Derived from the drawn
   * height rather than from a list of "small parts", because a list would be
   * wrong the first time a sample grew a second row. */
  const fit = width > 0 ? width / DRAW_WIDTH : 0
  const boost = drawnHeight > 0 && drawnHeight * fit < height * 0.5 ? Math.min(2.5, height / (drawnHeight * fit)) : 1
  const scale = Math.min(1, fit * boost)

  /* AND THE BOX SHRINKS TO WHAT IS IN IT. `height` is the tallest a picture
     may be, not the height every picture takes: a part that draws one control
     was leaving two thirds of its tile white, which is the "very incomplete
     look" the owner named, arriving from the other direction. Tiles are
     therefore different heights and the grid is `items-start`. */
  const drawnBox = drawnHeight > 0 ? Math.min(height, Math.max(24, Math.round(drawnHeight * scale))) : height

  return (
    <div ref={box} className="relative w-full overflow-hidden rounded-[var(--radius)] bg-[var(--surface-raised)]" style={{ height: why ? height : drawnBox }}>
      {why ? (
        <div className="flex h-full items-center justify-center p-[var(--space-3)] text-center">
          <Hint>{why}</Hint>
        </div>
      ) : (
        near &&
        scale > 0 && (
          <div
            ref={drawn}
            aria-hidden="true"
            inert
            className="pointer-events-none absolute top-0 left-0 origin-top-left"
            style={{ width: DRAW_WIDTH, transform: `scale(${scale})` }}
          >
            {sample!.render(INERT_PROPS)}
          </div>
        )
      )}
    </div>
  )
}
