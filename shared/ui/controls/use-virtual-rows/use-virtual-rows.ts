/* ============================================================================
   useVirtualRows · VIRTUALIZE_THRESHOLD · SPACER_ATTR
   Behaviour only, no design (commission §6).

   DESIGN SOURCE
   None, and that is correct: this primitive draws nothing. It decides WHICH
   rows a collection renders; the collection decides what a row looks like.

   WHAT IT IS FOR
   A list of forty rows should be forty elements in the DOM — plain, findable
   by the browser's own find-in-page, printable, and cheap. A list of four
   thousand should not. `VIRTUALIZE_THRESHOLD` is where this hook stops
   rendering everything and starts rendering a window, and below it the hook
   deliberately does nothing at all: virtualising a short list costs more than
   it saves and breaks find-in-page for no reason.

   THE TWO SPACERS
   A window is held in place by an element above it and an element below it,
   each as tall as the rows it stands in for. Both carry `SPACER_ATTR` so a
   collection, a test or a screenshot differ can tell a spacer from a row
   without guessing, and both are `aria-hidden` — they stand for nothing a
   reader can act on. The count is on the list container as `aria-setsize`
   with `aria-posinset` per row, which is how a screen reader is told "row 12
   of 4,000" when only 20 rows exist in the DOM.

   THE LAW THIS FILE OBEYS
   · SSR-SAFE. No `window`, no `document`, no `ResizeObserver` at module
     scope; every browser API is reached inside an effect and guarded. On the
     server the hook reports "not virtualised", so the first HTML is the
     complete list and the browser narrows it after mount — which is also the
     honest answer for a crawler.
   · IT CLEANS UP. The scroll listener, the two observers and the pending
     animation frame are all torn down on unmount and on every re-target.
   · The row height is a NUMBER OF CSS PIXELS, not a design value. It is
     measured from a real row where possible and is never written into a
     stylesheet — no px reaches a class name from this file. GAPS-G.md VRT-2.

   RENDERING CONTEXT
   `"use client"`. It is a hook.
   ========================================================================= */

"use client";

import * as React from "react";

/**
 * Below this many rows, nothing is virtualised. 100 is chosen, not kit-stated
 * (GAPS-G.md VRT-1): it is comfortably more than any list a reader scans by
 * eye, and comfortably less than the point where a plain list starts to cost
 * a frame. Override per call with `threshold`.
 */
export const VIRTUALIZE_THRESHOLD = 100;

/**
 * Marks the two spacer elements. Present on both; the value says which end,
 * so `[data-virtual-spacer="start"]` selects one of them.
 */
export const SPACER_ATTR = "data-virtual-spacer";

/** Sensible default before a real row has been measured: the kit's table row. */
const FALLBACK_ROW_HEIGHT = 56;

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

export interface UseVirtualRowsOptions {
  /** How many rows exist in total — not how many are rendered. */
  count: number;
  /**
   * The height of one row in CSS pixels. An estimate is fine: the hook
   * measures the first real row and takes over from there. Left off, it
   * starts at the kit's table-row height (56) and corrects on the first
   * measurement.
   */
  rowHeight?: number;
  /**
   * Extra rows rendered above and below the window, so a fast scroll does not
   * show a band of nothing. Default 6.
   */
  overscan?: number;
  /** Where virtualisation starts. Defaults to `VIRTUALIZE_THRESHOLD`. */
  threshold?: number;
  /**
   * Force it on or off. Left undefined, `count > threshold` decides. `false`
   * is the escape hatch for print, for a test, or for a list whose rows have
   * wildly different heights — this hook assumes one height for all of them.
   */
  enabled?: boolean;
}

/** What a spacer element needs. Spread it onto a `<div>`, `<tr>` or `<li>`. */
export interface VirtualSpacerProps {
  style: React.CSSProperties;
  "aria-hidden": true;
  [SPACER_ATTR]: "start" | "end";
}

export interface UseVirtualRowsResult<TScroll extends HTMLElement = HTMLElement> {
  /** Put this on the element that scrolls. */
  scrollRef: (node: TScroll | null) => void;
  /**
   * Put this on any ONE rendered row. It measures the real row height and
   * keeps it current when the text scale changes. Optional — without it the
   * `rowHeight` estimate is used as given.
   */
  measureRef: (node: HTMLElement | null) => void;
  /** Whether a window is being rendered, or the whole list is. */
  virtualized: boolean;
  /** The indices to render, in order. */
  rows: number[];
  /** First and last index in `rows`. Equal to 0 / count-1 when not virtualised. */
  startIndex: number;
  endIndex: number;
  /** The height of the whole list, in CSS pixels. */
  totalSize: number;
  /** The two spacer heights, in CSS pixels. */
  paddingStart: number;
  paddingEnd: number;
  /** Ready-made props for the two spacers. Zero-height ones still render. */
  startSpacerProps: VirtualSpacerProps;
  endSpacerProps: VirtualSpacerProps;
  /** The measured (or estimated) row height currently in use. */
  rowHeight: number;
  /** Scroll a row into view by index. */
  scrollToIndex: (index: number, align?: "start" | "center" | "end") => void;
}

/**
 * Render a window of a long list.
 *
 * ```tsx
 * const v = useVirtualRows({ count: rows.length, rowHeight: 56 });
 * <div ref={v.scrollRef} className="overflow-y-auto">
 *   <div {...v.startSpacerProps} />
 *   {v.rows.map((i) => <Row key={i} ref={i === v.startIndex ? v.measureRef : undefined} … />)}
 *   <div {...v.endSpacerProps} />
 * </div>
 * ```
 *
 * Everything above the threshold is a window; everything below it is the
 * plain list, with both spacers at zero height so the markup does not change
 * shape when a list grows past the line.
 */
export function useVirtualRows<TScroll extends HTMLElement = HTMLElement>({
  count,
  rowHeight: estimatedRowHeight = FALLBACK_ROW_HEIGHT,
  overscan = 6,
  threshold = VIRTUALIZE_THRESHOLD,
  enabled,
}: UseVirtualRowsOptions): UseVirtualRowsResult<TScroll> {
  const [scrollElement, setScrollElement] = React.useState<TScroll | null>(null);
  const [rowElement, setRowElement] = React.useState<HTMLElement | null>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewport, setViewport] = React.useState(0);
  const [measuredRowHeight, setMeasuredRowHeight] = React.useState<number | null>(null);

  const scrollRef = React.useCallback((node: TScroll | null) => {
    setScrollElement(node);
  }, []);

  const measureRef = React.useCallback((node: HTMLElement | null) => {
    setRowElement(node);
  }, []);

  /* --- the scroll position, read at most once per frame -------------------- */
  React.useEffect(() => {
    if (!scrollElement) return;

    let frame: number | null = null;
    const read = () => {
      frame = null;
      setScrollTop(scrollElement.scrollTop);
    };
    const onScroll = () => {
      // One read per frame. A scroll event can fire many times between two
      // paints, and each one would otherwise be a React render.
      if (frame === null) frame = window.requestAnimationFrame(read);
    };

    setScrollTop(scrollElement.scrollTop);
    scrollElement.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      scrollElement.removeEventListener("scroll", onScroll);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [scrollElement]);

  /* --- how tall the viewport is ------------------------------------------- */
  useIsomorphicLayoutEffect(() => {
    if (!scrollElement) return;
    setViewport(scrollElement.clientHeight);

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setViewport(scrollElement.clientHeight);
    });
    observer.observe(scrollElement);
    return () => observer.disconnect();
  }, [scrollElement]);

  /* --- how tall a row really is ------------------------------------------- */
  useIsomorphicLayoutEffect(() => {
    if (!rowElement) return;
    const read = () => {
      const height = rowElement.getBoundingClientRect().height;
      // A row mid-transition can measure zero; that would divide the list into
      // an infinity of rows, so it is ignored rather than stored.
      if (height > 0) setMeasuredRowHeight(height);
    };
    read();

    if (typeof ResizeObserver === "undefined") return;
    // The text-size control changes every row height at once. Watching one row
    // is enough to notice, and cheaper than watching all of them.
    const observer = new ResizeObserver(read);
    observer.observe(rowElement);
    return () => observer.disconnect();
  }, [rowElement]);

  const rowHeight =
    measuredRowHeight && measuredRowHeight > 0 ? measuredRowHeight : estimatedRowHeight;

  const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  const virtualized = (enabled ?? safeCount > threshold) && safeCount > 0 && rowHeight > 0;

  const { startIndex, endIndex } = React.useMemo(() => {
    if (!virtualized || safeCount === 0) {
      return { startIndex: 0, endIndex: Math.max(safeCount - 1, 0) };
    }
    // Before the viewport has been measured, render one screen's worth rather
    // than one row: a browser that restores a scroll position on load would
    // otherwise show a single row until the first frame lands.
    const visibleRows = viewport > 0 ? Math.ceil(viewport / rowHeight) : overscan * 2;
    const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const last = Math.min(safeCount - 1, first + visibleRows + overscan * 2);
    return { startIndex: first, endIndex: last };
  }, [virtualized, safeCount, viewport, rowHeight, scrollTop, overscan]);

  const rows = React.useMemo(() => {
    if (safeCount === 0) return [];
    const list: number[] = [];
    for (let index = startIndex; index <= endIndex; index += 1) list.push(index);
    return list;
  }, [safeCount, startIndex, endIndex]);

  const totalSize = safeCount * rowHeight;
  const paddingStart = virtualized ? startIndex * rowHeight : 0;
  const paddingEnd = virtualized ? Math.max(0, (safeCount - 1 - endIndex) * rowHeight) : 0;

  const scrollToIndex = React.useCallback(
    (index: number, align: "start" | "center" | "end" = "start") => {
      if (!scrollElement) return;
      const clamped = Math.min(Math.max(index, 0), Math.max(safeCount - 1, 0));
      const top = clamped * rowHeight;
      const offset =
        align === "center"
          ? top - Math.max(0, (scrollElement.clientHeight - rowHeight) / 2)
          : align === "end"
            ? top - Math.max(0, scrollElement.clientHeight - rowHeight)
            : top;
      scrollElement.scrollTo({ top: Math.max(0, offset) });
    },
    [scrollElement, safeCount, rowHeight],
  );

  return {
    scrollRef,
    measureRef,
    virtualized,
    rows,
    startIndex,
    endIndex,
    totalSize,
    paddingStart,
    paddingEnd,
    // React turns a bare number into a pixel length itself, so no unit string
    // is written anywhere in this file.
    startSpacerProps: {
      style: { height: paddingStart },
      "aria-hidden": true,
      [SPACER_ATTR]: "start",
    },
    endSpacerProps: {
      style: { height: paddingEnd },
      "aria-hidden": true,
      [SPACER_ATTR]: "end",
    },
    rowHeight,
    scrollToIndex,
  };
}
