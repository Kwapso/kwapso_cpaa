// Windowed rendering — the pure math.
//
// A collection holding 2,000 rows puts 2,000 nodes in the DOM even though a
// viewport shows ~15. Windowing renders only the visible slice plus a buffer,
// and replaces the rest with empty space so the scrollbar and page height are
// EXACTLY what they were. Nothing about the caller's data or props changes.
//
// This file is deliberately DOM-free so the arithmetic can be tested on its own
// (the same split as lib/collection and lib/range). The hook that measures real
// elements and subscribes to scroll lives in
// registry/primitives/use-virtual-rows — a primitive may import lib, never the
// other way round.

export interface WindowInput {
  /** Total number of items in the collection. */
  count: number
  /** Items per visual row: 1 for a list or table, N for a responsive grid. */
  columns: number
  /** Distance from the top of one visual row to the top of the next, in px.
   *  This is a PITCH, not a height — it includes any gap between rows, which is
   *  what makes the same math work for a gapped grid and a flush list. */
  pitch: number
  /** Where the list's top edge sits relative to the scroll viewport's top, in
   *  px. Positive while the list starts below the fold; negative once it has
   *  scrolled up past it. This is exactly
   *  `listRect.top - viewportRect.top`, so the caller never has to know whether
   *  it is scrolling the window or a nested container. */
  listTop: number
  /** Height of the scrolling viewport, in px. */
  viewportHeight: number
  /** Visual rows rendered above and below the viewport. Absorbs fast scrolling
   *  and, more importantly, keeps keyboard focus and in-page anchors landing on
   *  real nodes slightly out of view. */
  overscan: number
}

export interface WindowSlice {
  /** First item index to render (inclusive). */
  start: number
  /** Item index to stop before (exclusive) — use with `Array.prototype.slice`. */
  end: number
  /** Empty space to leave above the rendered rows, in px. */
  padTop: number
  /** Empty space to leave below the rendered rows, in px. */
  padBottom: number
}

/** Everything rendered, no spacers — the honest answer when we cannot yet
 *  measure, and the guaranteed-correct fallback. */
function renderAll(count: number): WindowSlice {
  return { start: 0, end: Math.max(0, count), padTop: 0, padBottom: 0 }
}

/**
 * Work out which slice of a collection is worth putting in the DOM.
 *
 * Degenerate inputs deliberately fall back to rendering EVERYTHING rather than
 * guessing: an unmeasured pitch or a non-finite viewport means we don't know
 * enough to window safely, and a complete list is always correct — just slower.
 */
export function windowSlice({
  count,
  columns,
  pitch,
  listTop,
  viewportHeight,
  overscan,
}: WindowInput): WindowSlice {
  if (!Number.isFinite(count) || count <= 0)
    return { start: 0, end: 0, padTop: 0, padBottom: 0 }

  // A pitch we haven't measured (or a nonsense one) would divide the list into
  // infinite rows. Render everything instead of windowing wrongly.
  if (!Number.isFinite(pitch) || pitch <= 0) return renderAll(count)
  // A zero viewport means we cannot know what is on screen (an unmeasured
  // harness, a display:none container). Windowing to a single row there would
  // be visibly broken if the container then appeared without a resize event.
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0)
    return renderAll(count)
  if (!Number.isFinite(listTop)) return renderAll(count)

  const cols =
    Number.isFinite(columns) && columns >= 1 ? Math.floor(columns) : 1
  const buffer =
    Number.isFinite(overscan) && overscan > 0 ? Math.ceil(overscan) : 0
  const rows = Math.ceil(count / cols)

  // Translate the viewport into "distance down the list". `listTop` is negative
  // once the list has scrolled up past the viewport top, so -listTop is how far
  // into the list the viewport's top edge has reached.
  const from = -listTop
  const to = from + viewportHeight

  let firstRow = Math.floor(from / pitch) - buffer
  let lastRow = Math.ceil(to / pitch) + buffer

  firstRow = Math.min(Math.max(firstRow, 0), rows)
  lastRow = Math.min(Math.max(lastRow, 0), rows)

  // Always keep at least one real row mounted, even when the list is entirely
  // off-screen. It costs one node and it means there is always something to
  // measure the pitch from — an empty window can never re-measure itself back
  // to life.
  if (lastRow <= firstRow) {
    if (firstRow >= rows) firstRow = Math.max(0, rows - 1)
    lastRow = Math.min(rows, firstRow + 1)
  }

  return {
    start: firstRow * cols,
    end: Math.min(count, lastRow * cols),
    padTop: firstRow * pitch,
    padBottom: (rows - lastRow) * pitch,
  }
}

/**
 * The slice rendered on the very first paint, before anything can be measured.
 *
 * It must be a PURE function of props: the server and the client both render it,
 * and if they disagree React throws a hydration mismatch. So it deliberately
 * ignores the real viewport and assumes a tall one — too many rows for one frame
 * is invisible, too few would flash a short page and jump the scrollbar.
 */
export function initialWindow(
  count: number,
  estimatedPitch: number,
  columns: number,
  overscan: number
): WindowSlice {
  return windowSlice({
    count,
    columns,
    pitch: estimatedPitch,
    listTop: 0,
    // A generous fixed viewport: taller than most screens, so the first paint
    // is never short. Constant on purpose — see the hydration note above.
    viewportHeight: 1200,
    overscan,
  })
}
