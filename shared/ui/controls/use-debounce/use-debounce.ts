/* ============================================================================
   useDebouncedCallback — behaviour only, no design (commission §6).

   DESIGN SOURCE
   None, and that is correct: this primitive draws nothing. It is listed in
   commission §6 among the four that "are behaviour, not appearance — they
   must still exist and export those names, but they carry no design".

   WHAT IT IS FOR
   The search field that must not ask the server on every keystroke; the
   filter that must not re-query while a range is being typed; the resize
   handler that must not re-measure sixty times a second. All three want the
   same thing: run this, but not yet, and not more than once.

   THE LAW THIS FILE OBEYS
   · The returned function is STABLE across renders as long as the timing
     options are. Passing an unstable callback into an effect dependency array
     is the usual way a debounce turns into an infinite loop; the latest
     callback is held in a ref and swapped in place instead.
   · IT CLEANS UP. Every timer is cleared on unmount, and a trailing call
     never fires into an unmounted component — which is the actual bug this
     kind of hook exists to cause.
   · SSR-SAFE. Nothing touches `window` and nothing runs at module scope.
     `setTimeout` is used through the global that both a browser and a server
     runtime provide, and its handle is typed from the runtime rather than
     assumed to be a number.

   RENDERING CONTEXT
   `"use client"`. It is a hook.
   ========================================================================= */

"use client";

import * as React from "react";

/** `useLayoutEffect` warns when React renders on the server; the effect must
    still run before paint in a browser, so the choice is made once, here. */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

type TimerHandle = ReturnType<typeof setTimeout>;

export interface DebounceOptions {
  /**
   * Run on the FIRST call of a burst as well. Default `false`. Useful where
   * the first keystroke should show something immediately and the rest should
   * wait.
   */
  leading?: boolean;
  /**
   * Run after the burst has been quiet for `delay`. Default `true`. Setting
   * both `leading: true` and `trailing: false` gives a throttle-like "once per
   * burst, at the start" behaviour.
   */
  trailing?: boolean;
  /**
   * Never wait longer than this, in milliseconds, no matter how long the burst
   * runs. Without it, someone who types continuously for a minute gets no
   * result for a minute. Off by default.
   */
  maxWait?: number;
}

export interface DebouncedCallback<Args extends unknown[]> {
  (...args: Args): void;
  /** Drop anything pending. Nothing will run. */
  cancel: () => void;
  /** Run anything pending right now, with the arguments it was given. */
  flush: () => void;
  /** Is a call waiting? */
  pending: () => boolean;
}

/**
 * Debounce a callback, keeping the callback itself fresh.
 *
 * ```tsx
 * const search = useDebouncedCallback((query: string) => fetchResults(query), 250);
 * <SearchInput onChange={(e) => search(e.currentTarget.value)} />
 * ```
 *
 * The returned function carries `cancel`, `flush` and `pending`. A form that
 * submits while a debounced save is waiting should `flush()` first; a route
 * that unmounts mid-burst does not need to do anything, because unmounting
 * cancels.
 *
 * @param callback The work to defer. Re-read on every call, so a closure over
 *                 fresh props is always current and the returned function
 *                 still does not change identity.
 * @param delay    Milliseconds of quiet before the trailing call. Default 300,
 *                 which is chosen rather than kit-stated — GAPS-G.md DEB-1.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay = 300,
  options: DebounceOptions = {},
): DebouncedCallback<Args> {
  const { leading = false, trailing = true, maxWait } = options;

  const callbackRef = React.useRef(callback);
  const timerRef = React.useRef<TimerHandle | null>(null);
  const maxTimerRef = React.useRef<TimerHandle | null>(null);
  const argsRef = React.useRef<Args | null>(null);
  const mountedRef = React.useRef(true);

  // Swap the callback in place. Before paint, so a flush() in a layout effect
  // on the same commit runs the new one and not the previous render's.
  useIsomorphicLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useIsomorphicLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearTimers = React.useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (maxTimerRef.current !== null) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  }, []);

  const invoke = React.useCallback(() => {
    const args = argsRef.current;
    argsRef.current = null;
    clearTimers();
    // The guard that matters: a timer that survived one tick past unmount must
    // not call into a component that is gone.
    if (!mountedRef.current || args === null) return;
    callbackRef.current(...args);
  }, [clearTimers]);

  const debounced = React.useMemo<DebouncedCallback<Args>>(() => {
    const run = (...args: Args) => {
      if (!mountedRef.current) return;

      const isFirstOfBurst = timerRef.current === null;
      argsRef.current = args;

      if (isFirstOfBurst && leading) {
        argsRef.current = null;
        callbackRef.current(...args);
      }

      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (trailing && argsRef.current !== null) invoke();
        else {
          argsRef.current = null;
          clearTimers();
        }
      }, delay);

      if (maxWait !== undefined && maxTimerRef.current === null) {
        maxTimerRef.current = setTimeout(() => {
          maxTimerRef.current = null;
          if (argsRef.current !== null) invoke();
        }, maxWait);
      }
    };

    const api = run as DebouncedCallback<Args>;
    api.cancel = () => {
      argsRef.current = null;
      clearTimers();
    };
    api.flush = () => {
      if (argsRef.current !== null) invoke();
      else clearTimers();
    };
    api.pending = () => argsRef.current !== null;
    return api;
  }, [delay, leading, trailing, maxWait, invoke, clearTimers]);

  // Unmount, and any change of timing options: drop what is waiting rather
  // than let an old schedule fire against a new configuration.
  React.useEffect(() => clearTimers, [clearTimers, delay, leading, trailing, maxWait]);

  return debounced;
}
