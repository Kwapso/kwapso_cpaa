"use client"

// Keeps a long-lived tab honest across a deploy. kwapso is a static-export SPA
// with NO service worker, so an open tab holds the OLD shell + its hashed chunks
// indefinitely. Two failure modes follow a deploy, and this heals both:
//
//  1. A chunk the old shell asks for is gone (route the user hadn't visited yet,
//     or a lazy import). The dynamic import throws a ChunkLoadError. We reload
//     ONCE — the fresh shell names the new chunks — and a sessionStorage
//     timestamp stops a reload loop if the reload itself can't recover.
//  2. Nothing is broken yet, but a newer build exists. On focus/return we ask
//     the origin for the current shell and compare its build fingerprint to the
//     one we booted with; if it moved, we offer a gentle "reload" toast rather
//     than yanking the page out from under the user mid-task.
//
// WHERE (1) ARRIVES FROM IS THE PART THAT WAS WRONG. The two listeners below
// hear `window.onerror` and `unhandledrejection` — and a missing chunk almost
// never comes through either, because the promise that failed belongs to a lazy
// ROUTE and React consumes it: the throw lands in React's render phase, which
// fires neither event. So the healer was wired to two signals the failure does
// not use, and the ErrorBoundary — the one thing that does see it — showed a
// crash card and stopped. Three of them on staging on 2026-08-17, forty seconds
// apart, the last with a hand-typed `?v=2` on the URL, which is what somebody
// does when the app is broken and reloading has not helped. `healStaleShell` is
// exported for exactly that caller.
//
// The fingerprint is the hashed `main-app` chunk src (App-Router static export
// has no __NEXT_DATA__ / buildId in the HTML). Renders nothing.

import * as React from "react"

import { toast } from "@shared/ui/controls/sonner/sonner"
import { useT } from "@shared/web/language"

// Reload-loop guard: WHEN we last reloaded to heal a stale shell. It is a
// timestamp rather than a flag, and nothing clears it on mount, because the
// thing it has to survive IS the reload — a flag cleared by the fresh load is
// cleared before the fresh load reaches the route that is still broken, which
// makes it a loop guard that guards nothing.
const RELOAD_MARK = "version_watch_reloaded_at"
const RELOAD_COOLDOWN_MS = 30_000
// Don't poke the origin more than once a minute, however often focus fires.
const POLL_THROTTLE_MS = 60_000

// The build fingerprint = the hash on this build's `main-app` chunk. Pull it
// from a blob of HTML (our own document on mount, or the fetched shell on poll).
function buildIdFrom(html: string): string | null {
  const m = html.match(/\/_next\/static\/chunks\/main-app-[A-Za-z0-9]+\.js/)
  return m ? m[0] : null
}

/** A failed dynamic import / missing chunk — the signature of a stale shell
 * reaching for a deploy that's gone. Matches the modern bundler error shapes. */
export function isStaleShellError(err: unknown, message?: string): boolean {
  const name = err instanceof Error ? err.name : ""
  const msg = (err instanceof Error ? err.message : message) ?? ""
  return (
    name === "ChunkLoadError" ||
    /Loading chunk|dynamically imported module|importing a module script failed/i.test(
      msg
    )
  )
}

/** Heal a stale shell by replacing it: reload ONCE. Returns true when a reload
 * is on its way, so a caller can say "a new version is ready" instead of
 * "something broke". Refuses within the cooldown — if the fresh shell hit the
 * same wall, reloading again would only spin. */
export function healStaleShell(err: unknown, message?: string): boolean {
  if (!isStaleShellError(err, message)) return false
  const last = Number(sessionStorage.getItem(RELOAD_MARK) ?? 0)
  if (Date.now() - last < RELOAD_COOLDOWN_MS) return false
  sessionStorage.setItem(RELOAD_MARK, String(Date.now()))
  location.reload()
  return true
}

export function VersionWatch() {
  const t = useT()
  React.useEffect(() => {
    // (a) Heal a stale shell that hits a missing chunk: reload once. These two
    // catch the cases that DO reach the window — a bare `import()` in an event
    // handler, a script tag — while the ErrorBoundary catches the render-phase
    // one through the same seam.
    const onError = (ev: ErrorEvent) => void healStaleShell(ev.error, ev.message)
    const onRejection = (ev: PromiseRejectionEvent) => void healStaleShell(ev.reason)

    // (b) Notice a newer build on return-to-tab and offer a reload.
    const bootId = buildIdFrom(document.documentElement.outerHTML)
    let lastPoll = 0
    let notified = false

    const checkForUpdate = async () => {
      if (notified || document.visibilityState !== "visible") return
      const now = Date.now()
      if (now - lastPoll < POLL_THROTTLE_MS) return
      lastPoll = now
      try {
        const res = await fetch("/", { cache: "no-store" })
        if (!res.ok) return
        const liveId = buildIdFrom(await res.text())
        // Only act when we can compare two real ids and they differ.
        if (bootId && liveId && liveId !== bootId) {
          notified = true
          toast("A new version is available.", {
            duration: Infinity,
            action: { label: t("Reload"), onClick: () => location.reload() },
          })
        }
      } catch {
        // Offline / transient — the next focus will try again.
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") void checkForUpdate()
    }

    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)
    window.addEventListener("focus", checkForUpdate)
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
      window.removeEventListener("focus", checkForUpdate)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [t])

  return null
}
