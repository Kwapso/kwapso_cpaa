"use client"

// THE SEAM A SCREEN REMEMBERS ITSELF THROUGH — `useRemembered`, which is
// `useState` with one extra property: what it holds survives the screen being
// unmounted and mounted again at the same address.
//
// WHY IT IS A CONTEXT AND NOT AN IMPORT. The thing that decides where a piece
// of state is parked is the ADDRESS of the screen holding it, and a search box
// three components deep has no idea what that is. The host knows — it is the
// one reading the URL — so it publishes a read/write pair scoped to the current
// path and everything under it just names a slot.
//
// WHY IT LIVES IN `shared/web/` AND STILL ONLY AFFECTS THE AGENCY APP. The
// collection chrome is shared code (`screen-engine/collection-frame.tsx`), so
// the hook has to be reachable from here. The MEMORY is not: the store, the
// ceilings and the provider are all in `web/lib/nav-memory.ts`, and this hook
// falls back to a plain `useState` when nothing has provided one. The client
// portal provides nothing, so the portal behaves today exactly as it did
// yesterday — which is the intended scope (the portal is a different shell and
// a much narrower surface; whether it wants the same is a decision for whoever
// asks for it, not a side effect of this).

import * as React from "react"

/** What the host publishes: where to park this screen's state and where to find
 * it again. `read` returns `undefined` for anything not remembered, and every
 * caller treats that as "use your own default". */
export type ScreenMemory = {
  read: (slot: string) => unknown
  write: (slot: string, value: unknown) => void
}

const MemoryContext = React.createContext<ScreenMemory | null>(null)

/** Mounted by the host around the routed screen, scoped to its address. */
export function RememberedScreen({
  memory,
  children,
}: {
  memory: ScreenMemory | null
  children: React.ReactNode
}) {
  return <MemoryContext.Provider value={memory}>{children}</MemoryContext.Provider>
}

/** `useState`, plus a memory.
 *
 * `revive` is the half that keeps this honest, and every corner this feature has
 * runs through it: a remembered value is data from a few minutes ago about a
 * world that has moved, so the caller is given the chance to say "not any more"
 * and get its own default instead. A filter whose option was retired, a tab that
 * no longer exists on this record, a shape that changed under a deploy — all of
 * them return `undefined` from `revive` and land on the default, which is the
 * screen's top. There is no path through this hook that produces an error or a
 * blank screen; the worst case it can reach is the behaviour from before it
 * existed.
 *
 * The setter writes through on every change rather than on unmount, because a
 * screen can leave in ways an effect cleanup does not see cleanly and a search
 * box that only remembers what you typed if you left politely is not a memory. */
export function useRemembered<T>(
  slot: string,
  initial: T | (() => T),
  revive?: (remembered: unknown) => T | undefined
): [T, (next: T | ((prev: T) => T)) => void] {
  const memory = React.useContext(MemoryContext)
  // Read ONCE, at mount. The host owns the address; while this screen is up, the
  // screen owns the value — a later write from anywhere else must not yank a
  // control out from under the person using it.
  const [value, setValue] = React.useState<T>(() => {
    const fallback = () => (typeof initial === "function" ? (initial as () => T)() : initial)
    if (!memory) return fallback()
    const found = memory.read(slot)
    if (found === undefined) return fallback()
    const revived = revive ? revive(found) : (found as T)
    return revived === undefined ? fallback() : revived
  })
  // THE SETTER TAKES A FUNCTION, exactly as `useState`'s does, and for exactly
  // the same reason: two controls can move one piece of state in a single tick.
  // A table's column header sets the sort column AND its direction from one
  // click, and a setter that only took a value would read the render's stale
  // copy for the second of the two and quietly undo the first. `latest` is
  // updated synchronously so a burst of calls composes, which a `useState`
  // value alone cannot do.
  const latest = React.useRef(value)
  latest.current = value
  const set = React.useCallback(
    (next: T | ((prev: T) => T)) => {
      const settled = typeof next === "function" ? (next as (prev: T) => T)(latest.current) : next
      latest.current = settled
      setValue(settled)
      memory?.write(slot, settled)
    },
    [memory, slot]
  )
  return [value, set]
}
