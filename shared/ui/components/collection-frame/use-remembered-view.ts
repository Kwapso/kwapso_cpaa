/* ============================================================================
   `useRememberedView` — the OPTIONAL half of decision D7-5.

   THE RULING, AND IT IS RULED
   Client, 2026-08-24, verbatim: **"no. this is individual"**, answering
   *"when you switch your view, should a colleague's screen change too?"*.
   That is option B on the page: the choice is REMEMBERED, PER PERSON. It
   follows the person who made it and no other screen moves. A reader who has
   never chosen gets the page's recommendation, which is **table-first**.

   Register row 69 in KWAPSO-SPEC.md carries the quote and the date.

   ─────────────────────────────────────────────────────────────────────────
   WHY THE COMPONENT STILL STORES NOTHING
   ─────────────────────────────────────────────────────────────────────────
   "Remembered, per person" is a sentence about a PERSON and about a PLACE TO
   PUT THINGS, and this repository owns neither. It is a design system,
   vendored into two Next.js applications. It does not know who is signed in,
   it does not know the workspace, and it has no opinion it is entitled to
   have about where a preference belongs.

   So `ViewSwitch` stays CONTROLLED — `value` in, `onValueChange` out — and
   the ruling is delivered as three things the kit can honestly own:

     1. THE CONTRACT. `view` / `onViewChange` on `CollectionScreen`, `value` /
        `onValueChange` on `ViewSwitch`. Both files now say what the app must
        do with them, and both say table-first.
     2. THE FIRST-RUN DEFAULT. `views[0]`, and the routes are told to put the
        table first. See below.
     3. THIS HOOK, which is OPTIONAL and which an app with a real per-user
        preference store should NOT use.

   THE ALTERNATIVE WAS WORSE. Had `ViewSwitch` reached for `localStorage`
   itself, an application that already keeps user preferences on its own
   server would have TWO stores answering the same question, and the one the
   kit owns would win on the first paint of every page. That is not a
   persistence feature, it is a bug with a nice name.

   ─────────────────────────────────────────────────────────────────────────
   WHAT A CONSUMING APP MUST DO
   ─────────────────────────────────────────────────────────────────────────
   · IF IT HAS A PER-USER PREFERENCE STORE — read the view out of it, pass it
     as `view`, and write it back in `onViewChange`. Do not import this file.
   · IF IT HAS NOTHING BETTER — call this hook and spread the result. It keeps
     the choice in THIS BROWSER PROFILE, which is one person, which is the
     ruling.
   · EITHER WAY the store must be keyed by the PERSON, never by the workspace,
     the team or the account. The ruling is one word long and it is
     "individual". A shared row in a shared table would move a colleague's
     screen, which is the thing the client said no to.
   · AND THE TABLE GOES FIRST in `views`. The kit cannot check this — which
     of a route's views is "the table" is that route's own vocabulary, and
     inventing product words is a thing this project has been corrected for —
     so it is a rule written down rather than a rule enforced.

   ─────────────────────────────────────────────────────────────────────────
   FOUR THINGS THIS HOOK DELIBERATELY DOES
   ─────────────────────────────────────────────────────────────────────────
   · THE FIRST RENDER IS ALWAYS THE DEFAULT. Storage is never read during
     render and never read in a `useState` initialiser. Both apps are Next.js,
     the server has no `localStorage`, and a value that appears in the client
     render and not the server one is a hydration mismatch. So the first paint
     is table-first for everybody, and a reader with a stored choice is moved
     to it in a layout effect before the browser paints.
   · A STORED VIEW THAT NO LONGER EXISTS IS IGNORED. A collection that drops
     `gallery` would otherwise strand every reader who had chosen it on a
     body the route no longer renders. The fallback is the default, silently.
   · IT LISTENS TO NOTHING. No `storage` event, no `BroadcastChannel`, no
     subscription of any kind. Another tab is the same person and may hold a
     different view quite happily; the ruling asks that nobody ELSE'S screen
     move, and the cheapest way to guarantee that is to have no channel over
     which a screen could be moved.
   · STORAGE FAILURE IS SILENT. Safari's private mode throws on `setItem`, a
     hardened browser can throw on read, and an embedded webview can have no
     `localStorage` at all. Every access is guarded; the failure mode is that
     the choice does not stick, which is exactly what the build did yesterday.

   RENDERING CONTEXT
   A hook, so the file that calls it is a client file. It touches `window`
   only inside effects and inside the guarded adapter.
   ========================================================================= */

import * as React from "react";

import type { CollectionViewOption } from "./view-switch";

/**
 * Where the choice is kept. Implement it to put the preference somewhere the
 * app already owns — but if the app owns a preference store it should skip
 * this hook entirely and drive `view` / `onViewChange` from it directly.
 *
 * BOTH METHODS MUST BE SAFE TO CALL AND SAFE TO FAIL. The hook does not
 * try/catch around a custom store: a store that throws is the app's bug and
 * swallowing it here would hide it.
 */
export interface RememberedViewStore {
  /** The stored view key, or `null`/`undefined` if this person has not chosen. */
  read: (key: string) => string | null | undefined;
  /** Keep the choice. Called only when the reader actually picks something. */
  write: (key: string, value: string) => void;
}

export interface UseRememberedViewOptions {
  /**
   * The bodies this collection offers — the same array passed to
   * `ViewSwitch`. Used for one thing only: a stored value naming a view that
   * is not in here is discarded.
   */
  views: readonly CollectionViewOption[];
  /**
   * What the preference is filed under. It must identify BOTH the collection
   * and the person: the default store is this browser profile, so the person
   * is already implied, but a `store` backed by anything shared must put the
   * user id in here. A workspace-wide key is the one thing the ruling forbids.
   */
  storageKey: string;
  /**
   * Where to keep it. Defaults to this browser profile's `localStorage`,
   * guarded — see the header.
   */
  store?: RememberedViewStore;
  /**
   * What a reader who has never chosen gets. Defaults to `views[0].value`,
   * and the routes are told to put the table first, which is the ruling's
   * table-first recommendation. Pass this only for a collection whose first
   * entry is deliberately not the default.
   */
  defaultView?: string;
}

export interface RememberedView {
  /** Pass straight to `CollectionScreen`'s `view` or `ViewSwitch`'s `value`. */
  view: string;
  /** Pass straight to `onViewChange` / `onValueChange`. */
  onViewChange: (value: string) => void;
}

/**
 * THIS DEVICE'S `localStorage`, AND NOTHING ELSE.
 *
 * Not `sessionStorage` — the ruling is "remembered", and a session store
 * forgets at the tab. Not a cookie — a cookie rides on every request to the
 * application's own server, which is how a per-person preference quietly
 * becomes something a server can get wrong for two people at once.
 */
const deviceStore: RememberedViewStore = {
  read(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  write(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* The choice does not stick. Nothing else changes. */
    }
  },
};

/**
 * Remember which body of a collection this person last chose.
 *
 * ```tsx
 * const { view, onViewChange } = useRememberedView({
 *   views: TICKET_VIEWS,          // the table first
 *   storageKey: "tickets.view",
 * });
 *
 * <CollectionScreen views={TICKET_VIEWS} view={view} onViewChange={onViewChange} … />
 * ```
 *
 * An application with its own per-user preference store should drive `view`
 * and `onViewChange` from that instead and not import this file at all.
 */
export function useRememberedView({
  views,
  storageKey,
  store = deviceStore,
  defaultView,
}: UseRememberedViewOptions): RememberedView {
  /* TABLE-FIRST. `views[0]` is the first-run view, and the rule the routes
     are given is that the first entry is the table. The empty-array case
     cannot draw a switcher at all (`ViewSwitch` renders nothing below two
     options), so the empty string never reaches a control. */
  const fallback = defaultView ?? views[0]?.value ?? "";

  const [view, setView] = React.useState(fallback);

  /* THE ONLY READ, AND IT IS AFTER MOUNT. `useLayoutEffect` rather than
     `useEffect` so the corrected view is committed before the browser paints
     — a reader who chose the board does not watch the table flash past on
     every navigation. It still runs client-side only, so the server render
     and the first client render agree and hydration is clean.

     React warns about `useLayoutEffect` during SSR, so this indirection picks
     the effect that exists on the platform it is running on. `useEffect` on
     the server is a no-op, which is what is wanted there. */
  const useIsomorphicLayoutEffect =
    typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

  /* The set of offered keys, so the effect below can reject a stale value
     without depending on the identity of the `views` array — routes build it
     inline and a new array every render would re-read storage every render. */
  const offered = views.map((option) => option.value).join(" ");

  useIsomorphicLayoutEffect(() => {
    const stored = store.read(storageKey);
    if (stored === null || stored === undefined || stored === "") return;
    /* A view the collection no longer offers is discarded rather than
       honoured. Otherwise dropping `gallery` from a collection leaves every
       reader who had chosen it looking at nothing. */
    if (!offered.split(" ").includes(stored)) return;
    setView(stored);
  }, [storageKey, offered, store]);

  /* If the route changes what it offers and the current view goes with it,
     fall back rather than render a body that is no longer in the list. */
  const stillOffered = offered.split(" ").includes(view);
  const resolved = stillOffered ? view : fallback;

  const onViewChange = React.useCallback(
    (next: string) => {
      setView(next);
      store.write(storageKey, next);
    },
    [storageKey, store],
  );

  return { view: resolved, onViewChange };
}
