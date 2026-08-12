"use client"

// THE RUNNING TIMER, in the header of every screen (.plans/BUILD-1 §5: "a running
// timer appears in the header of EVERY screen, and clicking it returns to what it
// is timing").
//
// It counts up in the BROWSER, from the moment the server said it started. The
// alternative — asking the server every second — is a request per second per open
// tab, per person, for the whole working day, to display a number arithmetic can
// produce for free. The server's `startedAt` is the truth; the clock is a
// rendering of it.
//
// It shows NOTHING when nothing is running, which is most of the time and is the
// whole reason it can live in the header at all. And it never renders for a
// client login: the door it reads refuses one (R21), and a portal caller has no
// timers by construction — the shell that mounts it is the agency app's.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { CircleStop, Timer } from "lucide-react"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"

import { ApiFailure, content as contentApi } from "@/lib/api"
import { runningTimersKey, storiesKey, workLogsKey } from "@/lib/live-resources"
import type { RunningTimer } from "@shared/types"
import { invalidate, useCached } from "@shared/web/store"

/** Whole seconds as a clock a person reads at a glance: 1:04:09, or 4:09 under an
 * hour. Never "3849s", and never a decimal — a timer is read, not calculated. */
export function clockFrom(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/** Where clicking a timer goes. A story lives on the Work page and a ticket on
 * its own screen — "returns to what it is timing" means the screen the work is
 * on, not a screen about the timer. */
function targetPath(t: RunningTimer, teamId: string): string {
  return t.targetTable === "help" ? `/t/${teamId}/tickets/${t.targetId}` : `/t/${teamId}/work`
}

export function TimerBar({
  teamId,
  onNavigate,
}: {
  teamId: string
  onNavigate?: (href: string) => void
}) {
  const timersQ = useCached<RunningTimer[]>(runningTimersKey(teamId), () =>
    contentApi.runningTimers().then((r) => r.timers)
  )
  // One tick a second, and only while something is actually running — an interval
  // that keeps firing over an empty bar is a wake-up per second for nothing.
  const running = timersQ.data ?? []
  const [, tick] = React.useState(0)
  React.useEffect(() => {
    if (running.length === 0) return
    const h = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(h)
  }, [running.length])

  if (running.length === 0) return null

  async function stop(id: string) {
    try {
      await contentApi.stopTimer(id)
      invalidate(runningTimersKey(teamId))
      invalidate(workLogsKey(teamId))
      invalidate(storiesKey(teamId))
      toast.success("Timer stopped.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't stop that timer.")
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {running.map((t) => {
        // Elapsed at the moment the SERVER answered, plus the wall time since —
        // so a tab left open overnight is right, not an hour of re-renders out.
        const since = Math.max(0, Math.floor((Date.now() - Date.parse(t.startedAt)) / 1000))
        const elapsed = Number.isFinite(since) ? since : t.elapsedSeconds
        return (
          <div
            key={t.id}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
              t.runaway ? "border-destructive/40 text-destructive" : ""
            }`}
          >
            <button
              type="button"
              className="flex items-center gap-1 font-medium tabular-nums"
              title={t.targetLabel ?? "Open what this is timing"}
              onClick={() => onNavigate?.(targetPath(t, teamId))}
            >
              <Timer className="size-3.5" />
              {clockFrom(elapsed)}
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label="Stop the timer"
              onClick={() => stop(t.id)}
            >
              <CircleStop className="size-3.5" />
            </Button>
          </div>
        )
      })}
    </div>
  )
}
