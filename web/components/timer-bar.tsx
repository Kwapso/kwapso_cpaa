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
import { CircleStop, Play, Timer } from "lucide-react"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"

import { ApiFailure, content as contentApi } from "@/lib/api"
import {
  TIME_SLICE_PREFIX,
  recordTimeKey,
  runningTimersKey,
  storiesKey,
  workLogsKey,
} from "@/lib/live-resources"
import type { RunningTimer } from "@shared/types"
import { invalidate, invalidatePrefix, useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"

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

/** Where clicking a timer goes: THE RECORD IT IS TIMING, not the list the record
 * is in. It used to land on the backlog for anything that was not a ticket,
 * because a story had no screen to land on — it does now, and "returns to what
 * it is timing" can finally mean the thing itself. The three tables a work log
 * may sit against each have a record screen; anything else falls back to the
 * backlog rather than to a dead URL. */
function targetPath(t: RunningTimer, teamId: string): string {
  const segment =
    t.targetTable === "help"
      ? "tickets"
      : t.targetTable === "stories"
        ? "stories"
        : t.targetTable === "tasks"
          ? "tasks"
          : // MEETINGS WERE MISSING, and they are a real work-log target
            // (`WORK_LOG_TARGETS` in workers/content/src/lib/work-logs.ts) — a
            // transcript capture writes one per attendee. So a meeting timer's
            // "return to what it is timing" quietly landed on the backlog.
            t.targetTable === "meetings"
            ? "meetings"
            : null
  return segment ? `/t/${teamId}/${segment}/${t.targetId}` : `/t/${teamId}/stories`
}

/** WHAT THE BADGE CALLS THE THING IT IS TIMING, shortest honest answer first.
 *
 * A person running two clocks saw two durations and nothing else — the label was
 * in the native `title` tooltip, which is invisible on a phone and needs a hover
 * everywhere else. The short reference is the right size for a pill and is the
 * name these records are already known by on their own screens.
 *
 * It is NULLABLE, and often null: a ref needs an account with a short code, so
 * the agency's own work has none. Then the label, clipped — a ticket's label is
 * its whole description, which is why nobody put it here in the first place.
 * Then the kind of record, which is always true and never nothing. */
function badgeName(t: RunningTimer): string {
  if (t.targetRef) return t.targetRef
  const label = t.targetLabel?.trim()
  if (label) return label.length > 18 ? `${label.slice(0, 17)}…` : label
  return t.targetTable === "help"
    ? "ticket"
    : t.targetTable === "stories"
      ? "story"
      : t.targetTable === "tasks"
        ? "task"
        : t.targetTable === "meetings"
          ? "meeting"
          : "work"
}

export function TimerBar({
  teamId,
  onNavigate,
}: {
  teamId: string
  onNavigate?: (href: string) => void
}) {
  const t = useT()
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
      // …and the Time tab of whatever this was timing. The realtime ping drops
      // these too, but the person who pressed Stop is the one who will look
      // straight at that tab, and a screen that waits on a round trip through
      // the live layer to stop saying "running" is the bug this fixes.
      invalidatePrefix(TIME_SLICE_PREFIX)
      toast.success(t("Timer stopped."))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't stop that timer."))
    }
  }

  return (
    <div className="flex items-center gap-1">
      {running.map((timer) => {
        // Elapsed at the moment the SERVER answered, plus the wall time since —
        // so a tab left open overnight is right, not an hour of re-renders out.
        const since = Math.max(0, Math.floor((Date.now() - Date.parse(timer.startedAt)) / 1000))
        const elapsed = Number.isFinite(since) ? since : timer.elapsedSeconds
        return (
          <div
            key={timer.id}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
              timer.runaway ? "border-destructive/40 text-destructive" : ""
            }`}
          >
            <button
              type="button"
              className="flex items-center gap-1 font-medium"
              title={timer.targetLabel ?? t("Open what this is timing")}
              onClick={() => onNavigate?.(targetPath(timer, teamId))}
            >
              <Timer className="size-3.5" />
              {/* WHICH RECORD, then how long. The name is what tells two running
                  clocks apart; the duration is what people watch. `tabular-nums`
                  stays on the DIGITS only, so the name is not letter-spaced like
                  a spreadsheet. */}
              <span className="max-w-[9ch] truncate sm:max-w-[14ch]">{badgeName(timer)}</span>
              <span className="tabular-nums">{clockFrom(elapsed)}</span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={t("Stop the timer")}
              onClick={() => stop(timer.id)}
            >
              <CircleStop className="size-3.5" />
            </Button>
          </div>
        )
      })}
    </div>
  )
}

/** Everything a start or a stop makes stale, in one place, because four screens
 * do it and a screen that forgets one of them shows a timer that isn't running.
 * `recordTimeKey` is the record's OWN Time tab — the family the live registry
 * drops when a row of time moves, and the one a generic refresh does not name. */
function refreshTimers(teamId: string, targetTable: string, targetId: string): void {
  invalidate(runningTimersKey(teamId))
  invalidate(workLogsKey(teamId))
  invalidate(storiesKey(teamId))
  invalidate(recordTimeKey(targetTable, targetId))
  invalidatePrefix(TIME_SLICE_PREFIX)
}

/** THE CLOCK ON ONE RECORD — start it, and stop the one you started.
 *
 * A record's own screen is where a person decides to begin working on it, so it
 * is where the control belongs, and it exists here rather than three times over
 * because it was written once and then not repeated: the ticket and the task had
 * NO way to start a timer at all, while the server has accepted all three targets
 * since work logs shipped (WORK_LOG_TARGETS: stories, help, tasks).
 *
 * IT SAYS WHICH WAY IT GOES. The story's button was a permanent "Start timer"
 * that did not know a timer was already running on that very story, so the second
 * press answered "You already have a timer running on this" — the door refusing
 * correctly, and the screen having asked the wrong question. It reads the same
 * running-timers cache the header bar reads, so the two can never disagree.
 *
 * The variant is CONSTANT on purpose: the label and the glyph carry the state,
 * and a `variant={running ? … : …}` is the shape R3's check hunts for. */
export function RecordTimerButton({
  teamId,
  targetTable,
  targetId,
  /** `work:edit` at the call site — the same right the door gates on. */
  canLog,
  /** A finished piece of work has nothing left to time. */
  disabled,
}: {
  teamId: string
  targetTable: "stories" | "help" | "tasks"
  targetId: string
  canLog: boolean
  disabled?: boolean
}) {
  const t = useT()
  const [busy, setBusy] = React.useState(false)
  const timersQ = useCached<RunningTimer[]>(runningTimersKey(teamId), () =>
    contentApi.runningTimers().then((r) => r.timers)
  )
  const mine = (timersQ.data ?? []).find(
    (x) => x.targetTable === targetTable && x.targetId === targetId
  )

  if (!canLog) return null

  async function toggle() {
    setBusy(true)
    try {
      if (mine) {
        await contentApi.stopTimer(mine.id)
        refreshTimers(teamId, targetTable, targetId)
        toast.success(t("Timer stopped."))
      } else {
        await contentApi.startTimer(targetTable, targetId)
        refreshTimers(teamId, targetTable, targetId)
        toast.success(t("Timer started."))
      }
    } catch (err) {
      toast.error(
        err instanceof ApiFailure ? err.message : mine ? t("Couldn't stop that timer.") : t("Couldn't start the timer.")
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1"
      disabled={busy || disabled}
      onClick={() => void toggle()}
    >
      {mine ? <CircleStop className="size-3.5" /> : <Play className="size-3.5" />}
      {mine ? t("Stop timer") : t("Start timer")}
    </Button>
  )
}
