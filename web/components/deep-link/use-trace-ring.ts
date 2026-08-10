"use client"

// The assistant's screen trace. After a write step the agent panel names the screen
// it changed; we move there softly and ring the changed row for a moment, so the
// user can see WHERE the change landed. A glance, then gone — never a focus-steal.

import * as React from "react"

import { isInAppPath } from "@/components/deep-link/use-host-nav"
import { type TraceTarget } from "@/lib/agent-trace"
import { onHostTrace } from "@/lib/screen-trace"

/** Returns the CSS selector to ring right now, or null. The whole app is one shell,
 * so we honour a trace from ANY screen (Home included) — we only skip a trace for a
 * DIFFERENT team than the one shown (a safety net; the agent only acts in the
 * current team). */
export function useTraceRing({
  teamId,
  onTeam,
  go,
}: {
  teamId: string | null
  onTeam: boolean
  go: (path: string) => void
}): string | null {
  const [traceHighlight, setTraceHighlight] = React.useState<string | null>(null)

  React.useEffect(() => {
    return onHostTrace(({ teamId: traceTeam, target }: { teamId: string; target: TraceTarget }) => {
      if (!teamId || traceTeam !== teamId || !onTeam) return
      if (!isInAppPath(target.path)) return
      // Traces move the screen to the RESULT (no query → no dialog opens); the ring
      // draws attention to the changed row/record once it lands.
      go(target.path)
      setTraceHighlight(target.highlight ?? null)
    })
    // go is stable-enough; re-subscribe when the shown team/host changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, onTeam, go])

  // Clear the highlight shortly after it lands (a glance, then gone).
  React.useEffect(() => {
    if (!traceHighlight) return
    const t = setTimeout(() => setTraceHighlight(null), 2200)
    return () => clearTimeout(t)
  }, [traceHighlight])

  return traceHighlight
}
