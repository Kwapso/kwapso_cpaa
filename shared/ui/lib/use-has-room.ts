/* ============================================================================
   `useHasRoom` — is there room beside the content, or does the overlay come
   from the bottom?

   WHY THIS FILE EXISTS
   Three files had written this same hook independently — `split.tsx`,
   `quick-view.tsx` and `bulk-edit.tsx` — each with its own copy of the query
   string. A fourth was about to. Three copies of a breakpoint is three chances
   for two overlays to part company at different widths on the same screen,
   which a reader would experience as one panel sliding in from the side while
   another rises from the bottom.

   THE THRESHOLD
   45rem, and it is deliberately not one of the three Tailwind breakpoints the
   components use. This is not "is this a phone" — it is "is there room for a
   420 panel beside the thing it is editing", which is a different question and
   lands between `sm:` and `lg:`.

   THE SERVER ANSWER IS THE WIDE ONE
   `useSyncExternalStore`'s third argument is the server snapshot. It returns
   `true`, so a server render draws the side panel and a phone corrects to the
   sheet on hydration. The other way round, every desktop reader would see a
   sheet flash into a panel on load.

   RENDERING CONTEXT
   A hook, so any file importing it is a client file. `matchMedia` is read
   through a subscription rather than in render, so nothing is decided during
   a render pass.
   ========================================================================= */

import * as React from "react";

/** The width at which a 420 side panel still leaves the content readable. */
export const HAS_ROOM_QUERY = "(min-width: 45rem)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const query = window.matchMedia(HAS_ROOM_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function read(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia(HAS_ROOM_QUERY).matches;
}

/**
 * `true` when there is room for a side panel; `false` when the overlay should
 * rise from the bottom instead. Server and first paint answer `true`.
 */
export function useHasRoom(): boolean {
  return React.useSyncExternalStore(subscribe, read, () => true);
}
