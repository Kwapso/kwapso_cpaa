"use client"

// The /support resolver. Reads the REAL address rather than route params,
// because the static export served here is one shell emitted at `/support` —
// its params are always empty, whatever the browser's address bar says
// (EDGE-CASES.md, the static-export reload trap).
//
// It re-reads on every history move, because Next's client router changes the
// URL without remounting this component: without the popstate + pushState
// listeners, tapping a ticket would change the address and leave the list on
// screen, and Back would do the reverse.

import * as React from "react"

import { PortalShell } from "@/components/portal-shell"
import { SupportScreen } from "@/components/support-screen"
import { TicketScreen } from "@/components/ticket-screen"

/** "/support/01J…" → "01J…" ; "/support" (or "/support/") → null. */
export function ticketIdFromPath(pathname: string): string | null {
  const rest = pathname.replace(/^\/support\/?/, "").split("/").filter(Boolean)
  return rest[0] ?? null
}

export function SupportRoute() {
  const [ticketId, setTicketId] = React.useState<string | null>(null)

  React.useEffect(() => {
    const read = () => setTicketId(ticketIdFromPath(window.location.pathname))
    read()
    window.addEventListener("popstate", read)
    // A client-side push (tapping a ticket) fires no event of its own, so the
    // router's own navigation has to be observed. `navigation` where it exists,
    // a patched pushState everywhere else.
    const push = history.pushState
    history.pushState = function (...args: Parameters<typeof push>) {
      push.apply(this, args)
      read()
    }
    return () => {
      window.removeEventListener("popstate", read)
      history.pushState = push
    }
  }, [])

  return (
    <PortalShell>
      {(ready) =>
        ticketId ? (
          <TicketScreen ready={ready} ticketId={ticketId} />
        ) : (
          <SupportScreen ready={ready} />
        )
      }
    </PortalShell>
  )
}
