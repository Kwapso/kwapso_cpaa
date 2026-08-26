"use client"

// RUNNING JOBS — what the app is doing that OUTLIVES the screen that asked for it.
//
// THE OWNER, 26 Aug 2026, on the sync buttons: "If I switch pages after I hit the
// Sync button, but I don't reload the app and I come back, the button just shows
// me 'Bring it in' again. That means there is a high possibility that people
// would launch two simultaneous syncs."
//
// He is describing a hole with two halves, and they are the same hole:
//
//  1 · THE BUTTON FORGETS. "Am I running?" was React state inside the button, so
//     leaving the page unmounted the component and took the answer with it. The
//     sweep carried on at the door; the control came back saying it had never
//     started. Nothing was wrong except the only thing a person could see.
//
//  2 · SO THE SECOND PRESS IS A SECOND RUN. A control that has forgotten cannot
//     refuse, and each pass re-lists everything from Google — two runs is twice
//     the quota, twice the writes, and two answers racing to say what happened.
//
// The cure for both is one fact in one place: a promise, keyed by the ACT rather
// than by the button, that lives at module scope — outside React, outside every
// screen, for as long as the tab is open. A second caller does not start a
// second run, it JOINS the first and gets the same answer. Two different screens
// offering the same act therefore agree without knowing about each other, which
// is the property a per-component state can never have.
//
// WHY NOT THE CACHE (shared/web/store). Because that stores ANSWERS and this
// stores work in flight. Nothing here is a value anybody reads twice, nothing is
// invalidated, and putting a pending promise in a cache that other code may drop
// would leave a run nobody can join and a button that lies in the other
// direction. Different question, different seam, forty lines.
//
// WHAT IT IS NOT: durable. A reload starts a new page and this map is empty
// again, which is correct — the tab that pressed the button is gone, and the
// door's own five-minute floor is what stops the next one from re-running
// needlessly. This answers "is THIS TAB already doing it", which is the question
// the button is actually asking.

import * as React from "react"

/** The work in flight, keyed by the act. `unknown` because the map is shared by
 * every kind of job and the caller of `runExclusive` is the one that knows the
 * type — it gets its own promise back, correctly typed. */
const running = new Map<string, Promise<unknown>>()
const listeners = new Set<() => void>()

function announce(): void {
  for (const l of listeners) l()
}

/** Start `work` under `key` — or, if that act is already running, hand back the
 * run that is already going. The caller cannot tell the difference, which is the
 * whole point: joining is indistinguishable from starting, so no screen needs a
 * branch for "somebody else pressed this first".
 *
 * The key is the ACT, never the component: `google-calendar:<teamId>`, not
 * `meetings-screen-button`. Two controls offering the same act must collide. */
export function runExclusive<T>(key: string, work: () => Promise<T>): Promise<T> {
  const already = running.get(key)
  if (already) return already as Promise<T>
  // `work()` is called INSIDE the try so a synchronous throw becomes a rejected
  // promise rather than leaving the map holding nothing and the listeners
  // un-announced.
  let started: Promise<T>
  try {
    started = work()
  } catch (err) {
    return Promise.reject(err)
  }
  const held = started.finally(() => {
    running.delete(key)
    announce()
  })
  running.set(key, held)
  announce()
  return held
}

/** Is this act running right now, anywhere in this tab? */
export function isRunning(key: string): boolean {
  return running.has(key)
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Re-render this component whenever `key` starts or stops running.
 *
 * `null` for "no act to watch" (no team yet), so a caller never has to make the
 * hook conditional. The server snapshot is always false: nothing is running
 * during a static export, and claiming otherwise would ship a spinner into the
 * exported HTML of every screen that has one of these buttons. */
export function useRunning(key: string | null): boolean {
  const get = React.useCallback(() => (key ? running.has(key) : false), [key])
  return React.useSyncExternalStore(subscribe, get, () => false)
}
