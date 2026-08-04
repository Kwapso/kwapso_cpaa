"use client"

// The live-ping fan-out bus (R15). The app holds ONE team socket (app-shell);
// every ping it receives is re-emitted here so any screen — in particular a
// server-PAGED collection, whose rows live in page state OUTSIDE the row-level
// caches — can subscribe (useLiveRefetch) and silently re-pull its current page.
// Without this, a teammate's change leaves a paged screen stale until reload.
// "reconnect" replays to every subscriber after a dropped socket catches up.

export type LiveBusEvent =
  | { kind: "ping"; resource: string; id?: string; op?: string }
  | { kind: "reconnect" }

type Listener = (ev: LiveBusEvent) => void

const listeners = new Set<Listener>()

/** The shell calls this for every team ping (and once per reconnect). */
export function emitLive(ev: LiveBusEvent): void {
  for (const fn of listeners) fn(ev)
}

export function subscribeLive(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
