"use client"

// useDebouncedCallback — the one debounce the library shares. Returns a stable
// wrapper that delays `fn` by `delay` ms, restarting the timer on each call and
// clearing it on unmount. `delay <= 0` fires immediately. The latest `fn` is
// always used (kept in a ref) so callers don't need to memoize it.
//
// Used by SearchInput (debounce the onChange callback) and FilterBar's
// searchable facet (debounce the async onSearch) — one implementation, no repeat.

import * as React from "react"

export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delay: number
): (...args: A) => void {
  // Track the latest fn without re-creating the debounced wrapper each render.
  const fnRef = React.useRef(fn)
  React.useEffect(() => {
    fnRef.current = fn
  })

  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  return React.useCallback(
    (...args: A) => {
      if (timer.current) clearTimeout(timer.current)
      if (delay <= 0) {
        fnRef.current(...args)
        return
      }
      timer.current = setTimeout(() => fnRef.current(...args), delay)
    },
    [delay]
  )
}
