"use client"

// The assistant's OPEN state. Two jobs:
//  1. Hoisted to a module-level store so it survives SOFT navigation — the panel is
//     mounted once at the root layout (agent-host.tsx), not per-route.
//  2. Mirrored to storage so it also survives a FULL PAGE RELOAD. The base is a
//     static export: crossing from a top-level route INTO the /t shell is a hard reload
//     (EDGE-CASES §1), which wipes all in-memory React state. Without this mirror the
//     panel vanished on that reload (the "panel reset" the owner hit); with it, the root
//     host reopens on load and useAgentChat resumes the saved thread, so the conversation
//     survives the reload even though the live stream was cut.
//
// ONE FLAG, TWO PRESENTATIONS. Since the assistant became `ScreenShell`'s third
// COLUMN (2026-09-03) this flag is what the shell's `asideOpen` is fed and what
// its edge handle toggles; below the shell's narrow breakpoint the same flag
// opens the floating panel instead (agent-host.tsx picks the presentation, this
// store holds the decision). It is one decision — "is the assistant showing" —
// so it is one flag, and the two presentations can never disagree about it.
//
// `localStorage`, AND THE KEY IS SHAPED LIKE THE RAIL'S. It used to be
// `sessionStorage` under `kwapso:agent:open`, which is same-tab only: the column
// would be gone the next morning while the rail's own collapse was still
// remembered, and a column that forgets is a broken mirror of one that does not.
// The kit says the collapse "persists per user" of BOTH columns, so this now
// sits beside `ss-sidebar-collapsed` and `ss-rail-closed-groups` in
// app-shell.tsx: same store, same `ss-` prefix, same per-device honesty (a
// preference about this screen's furniture, not a synced server preference like
// scale or spine).

import { useSyncExternalStore } from "react"

const KEY = "ss-assistant-open"

function readPersisted(): boolean {
  try {
    return localStorage.getItem(KEY) === "1"
  } catch {
    return false
  }
}

function persist(next: boolean): void {
  try {
    if (next) localStorage.setItem(KEY, "1")
    else localStorage.removeItem(KEY)
  } catch {
    /* private mode / storage blocked — the module var still carries it this session */
  }
}

let open = readPersisted()
const subscribers = new Set<() => void>()

/** Open (or close) the assistant from anywhere — the shell's edge handle, the phone's
 * launcher, Esc. Persisted so a reload (e.g. crossing into /t) reopens it instead of
 * dropping the conversation. */
export function setAgentOpen(next: boolean): void {
  if (open === next) return
  open = next
  persist(next)
  for (const fn of subscribers) fn()
}

/** Subscribe to the open state (the root-mounted host). SSR snapshot is always false —
 * the panel is client-only, so the server never renders it open (client hydration then
 * reflects the persisted value). */
export function useAgentOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
    () => open,
    () => false
  )
}

/* ---------------------------- asking it something --------------------------- */

// A QUESTION HANDED TO THE ASSISTANT FROM A SCREEN — the knowledge base's own
// ask box, and the same box on an account's or an app's knowledge tab.
//
// It lives here rather than in the panel for the reason the open flag does: the
// panel is mounted ONCE at the root and the screen doing the asking is somewhere
// else entirely, so the two can only meet at a module-level store. It is NOT
// mirrored to sessionStorage — an open panel should survive a reload, an
// unanswered question should not be asked twice.
//
// Taken exactly once. `useAgentChat` clears it the moment it sends, so a re-render
// (or a second panel, in a test) cannot re-ask and re-spend a credit.

let question: string | null = null

/** Open the assistant and ask it this. */
export function askAssistant(text: string): void {
  const q = text.trim()
  if (!q) return
  question = q
  for (const fn of subscribers) fn()
  setAgentOpen(true)
}

/** The question waiting to be asked, or null. */
export function usePendingQuestion(): string | null {
  return useSyncExternalStore(
    (cb) => {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
    () => question,
    () => null
  )
}

/** Sent — forget it, so it is never asked twice. */
export function clearPendingQuestion(): void {
  if (question === null) return
  question = null
  for (const fn of subscribers) fn()
}
