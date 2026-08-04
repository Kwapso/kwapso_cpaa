"use client"

// useLiveRefetch (R15) — the subscription every server-PAGED collection screen
// must hold. A paged screen's rows live in page state fetched from its /search
// door, OUTSIDE the row-level caches the shell patches — so without this, a
// teammate's change leaves the page stale until a reload. On its module's ping
// (or a reconnect replay) it silently re-pulls the CURRENT page via the callback
// the screen provides. The shell fans every team ping into the bus; this filters.

import * as React from "react"

import { subscribeLive } from "@/lib/live-bus"

export function useLiveRefetch(resource: string | null, refetch: () => void): void {
  // Keep the latest refetch without resubscribing per render.
  const ref = React.useRef(refetch)
  ref.current = refetch
  React.useEffect(() => {
    if (!resource) return
    return subscribeLive((ev) => {
      if (ev.kind === "reconnect" || ev.resource === resource) ref.current()
    })
  }, [resource])
}
