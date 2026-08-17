"use client"

// TIME — the week as it actually went, and the two ways of adding to it.
//
// TWO PIECES, because they belong in two places. `StartTimerStrip` is the one
// click and the Monday-morning question, and it sits beside the WORK (the
// Stories page): starting a timer is something you do while looking at what you
// are about to do, and "you left this running since Friday" is something you
// need answered wherever you happen to be. `TimePanel` is the TIMESHEET — what
// has already been logged, the manual entry that is "always available" because
// half of real time is remembered rather than clocked, and the correction — and
// that belongs on a page of its own.
//
// It did not have one. The whole list lived under the backlog at the foot of the
// Stories page, which is how a tester with 115 logged entries came to report
// that she could not find logged time at all. See the `time` section in
// lib/pages.ts.
//
// ONE CLICK IS THE ACCEPTANCE BAR (.plans/BUILD-1 §5). The RUNAWAY prompt is not
// in the header for a reason: the header's job is a glance, and "what do you
// want done about it?" is a question with three answers.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { AlarmClockOff, CircleStop, Clock, Pencil, Play, Plus, Trash2 } from "lucide-react"

import { LoadMore } from "@/components/load-more"
import { clockFrom } from "@/components/timer-bar"
import { TimeFormDialog, type TimeFormValues } from "@/components/time-form-dialog"
import { ApiFailure, content as contentApi } from "@/lib/api"
import {
  TIME_SLICE_PREFIX,
  listFetch,
  runningTimersKey,
  storiesKey,
  totalKey,
  workLogsKey,
} from "@/lib/live-resources"
import { useActiveTeam } from "@/lib/use-active-team"
import type { RunningTimer, Story, WorkLog } from "@shared/types"
import { invalidate, invalidatePrefix, useCached, useCachedValue } from "@shared/web/store"
import { useT } from "@shared/web/language"

/** One row of time, in a sentence: what it was on, who, how long, and whether we
 * are charging for it. */
function line(l: WorkLog): string {
  return [
    l.userName,
    l.startedAt.slice(0, 10),
    l.billable ? null : "not billable",
    l.kind,
    l.note,
  ]
    .filter(Boolean)
    .join(" · ")
}

/** Everything a row of time touches: the team's list and its totals, the header
 * bar, the backlog (whose stories now have more hours against them), and the
 * Time tab of whatever the row was logged against. One place, because three
 * screens do this and a screen that forgets one of them is a stale screen. */
function refreshTime(teamId: string): void {
  invalidate(workLogsKey(teamId))
  invalidate(runningTimersKey(teamId))
  invalidate(storiesKey(teamId))
  invalidatePrefix(TIME_SLICE_PREFIX)
}

/** THE ONE CLICK, and the Monday morning question — beside the WORK.
 *
 * The caller's OWN open stories, with a Start next to each: the acceptance bar
 * BUILD-1 §5 sets, and the reason this exists rather than a "log time" form
 * being the only way in. Their own, because a list of everybody's work would
 * need reading before it could be clicked. */
export function StartTimerStrip({ teamId, canCreate }: { teamId: string; canCreate: boolean }) {
  const t = useT()
  const timersQ = useCached<RunningTimer[]>(runningTimersKey(teamId), () =>
    contentApi.runningTimers().then((r) => r.timers)
  )
  const me = useActiveTeam().user?.id ?? null
  const storiesQ = useCached<Story[]>(storiesKey(teamId), () => listFetch.stories(teamId))
  const runningIds = new Set((timersQ.data ?? []).map((t) => `${t.targetTable}:${t.targetId}`))
  const mine = (storiesQ.data ?? [])
    .filter((s) => s.status !== "done" && s.assigneeId === me && !runningIds.has(`stories:${s.id}`))
    .slice(0, 5)
  const runaways = (timersQ.data ?? []).filter((t) => t.runaway)

  async function start(storyId: string) {
    try {
      await contentApi.startTimer("stories", storyId)
      refreshTime(teamId)
      toast.success(t("Timer started."))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't start that timer.")
    }
  }

  async function answerRunaway(id: string, answer: "keep" | "discard") {
    try {
      await contentApi.resolveRunaway(id, answer)
      refreshTime(teamId)
      toast.success(answer === "discard" ? "Binned — nothing was counted." : "Stopped, kept in full.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't do that.")
    }
  }

  if (mine.length === 0 && runaways.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      {canCreate && mine.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {mine.map((s) => (
            <li key={s.id}>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => start(s.id)}>
                <Play className="size-3.5" />
                {s.title.length > 34 ? `${s.title.slice(0, 34)}…` : s.title}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <RunawayPrompts runaways={runaways} onAnswer={answerRunaway} />
    </section>
  )
}

/** THE MONDAY MORNING PROMPT. Never automatic: a timer that stopped itself at
 * some clever hour is a number a person did not choose. Two of the three answers
 * are one tap here; "stop it at five o'clock" is the third, and it is the stop
 * control on the header bar with a time. */
function RunawayPrompts({
  runaways,
  onAnswer,
}: {
  runaways: RunningTimer[]
  onAnswer: (id: string, answer: "keep" | "discard") => void
}) {
  return (
    <>
      {runaways.map((t) => (
        <div
          key={t.id}
          className="border-destructive/40 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <span>
            <AlarmClockOff className="mr-1.5 inline size-3.5" />A timer on{" "}
            <strong>{t.targetLabel ?? "something"}</strong> has been running for{" "}
            {clockFrom(t.elapsedSeconds)}.
          </span>
          <span className="flex gap-1.5">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onAnswer(t.id, "keep")}>
              <CircleStop className="size-3.5" />
              Keep it all
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => onAnswer(t.id, "discard")}
            >
              <Trash2 className="size-3.5" />
              Bin it
            </Button>
          </span>
        </div>
      ))}
    </>
  )
}

/** THE TIMESHEET — what has already been logged, on the Time page.
 *
 * It renders no heading of its own: the page above it carries the section
 * heading and the exact ROW count (R16), and the hours below are a second,
 * different number that this panel says itself. Two numbers, said once each. */
export function TimePanel({
  teamId,
  canCreate,
  canEdit,
}: {
  teamId: string
  canCreate: boolean
  /** `work:edit` — a step above logging your own, because correcting a row of
   * time changes a number somebody else may already have read. */
  canEdit: boolean
}) {
  const t = useT()
  const logsQ = useCached<WorkLog[]>(workLogsKey(teamId), () => listFetch.workLogs(teamId))
  const timersQ = useCached<RunningTimer[]>(runningTimersKey(teamId), () =>
    contentApi.runningTimers().then((r) => r.timers)
  )
  // R16: the exact server totals, primed by the same fetch that loaded page one —
  // never the loaded page's length, which on a paged list is just "50" for ever.
  const totalSeconds = useCachedValue<number>(totalKey("work-seconds", teamId))
  const [addOpen, setAddOpen] = React.useState(false)
  // THE ROW BEING CORRECTED. Held rather than routed through the URL because a
  // correction is a thing you do to a line you are looking at — Back should
  // close the form, not walk you through every line you opened.
  const [editing, setEditing] = React.useState<WorkLog | null>(null)

  async function logManually(values: TimeFormValues) {
    await contentApi.logTime({
      targetTable: values.targetTable,
      targetId: values.targetId,
      startedAt: values.startedAt,
      endedAt: values.endedAt,
      note: values.note || undefined,
      kind: values.kind || undefined,
      billable: values.billable,
    })
    refreshTime(teamId)
    toast.success(t("Time logged."))
  }

  /** CORRECT A ROW. Every figure this app shows about how long something took is
   * a sum of these lines, so a mistyped hour is a wrong number on somebody's
   * screen until somebody fixes it. The door keeps the trail (who corrected
   * what, and when), which is why nothing here is a silent overwrite. */
  async function correct(values: TimeFormValues) {
    if (!editing) return
    await contentApi.updateWorkLog({
      id: editing.id,
      startedAt: values.startedAt,
      endedAt: values.endedAt,
      note: values.note,
      kind: values.kind,
      billable: values.billable,
    })
    refreshTime(teamId)
    toast.success(t("Time corrected."))
  }

  async function answerRunaway(id: string, answer: "keep" | "discard") {
    try {
      await contentApi.resolveRunaway(id, answer)
      refreshTime(teamId)
      toast.success(answer === "discard" ? "Binned — nothing was counted." : "Stopped, kept in full.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't do that.")
    }
  }

  if (logsQ.data === undefined) return <Skeleton variant="list" lines={3} />
  const logs = logsQ.data
  const runaways = (timersQ.data ?? []).filter((t) => t.runaway)

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        {/* THE HOURS. Not the collection's count (the heading above says that) —
            the number anybody reading a timesheet actually came for. */}
        <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <Clock className="size-3.5" />
          {totalSeconds ? `${clockFrom(totalSeconds)} logged` : "Nothing logged yet"}
        </p>
        {canCreate && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" />
            {t("Log time")}
          </Button>
        )}
      </div>

      <RunawayPrompts runaways={runaways} onAnswer={answerRunaway} />

      {logs.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("No time logged yet.")}</p>
      ) : (
        <ul className="divide-border divide-y rounded-md border">
          {logs.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.targetLabel ?? "—"}</p>
                <p className="text-muted-foreground truncate text-xs">{line(l)}</p>
              </div>
              <span className="shrink-0 text-sm tabular-nums">
                {l.endedAt ? clockFrom(l.seconds) : "running"}
              </span>
              {/* FIX A LINE. Only on time that has FINISHED: a running timer is
                  corrected by stopping it, and a start time you can edit while
                  the clock is still counting is two people writing the same
                  number. */}
              {canEdit && l.endedAt && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(l)}
                  className="shrink-0 gap-1.5"
                >
                  <Pencil className="size-3.5" />
                  {t("Edit")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* R14: 2,940 rows arrived from two years of the previous system, and every
          piece of work produces several more. */}
      <LoadMore
        listKey={workLogsKey(teamId)}
        label={t("Load more time")}
        fetchPage={(c: string) =>
          contentApi.workLogs({ cursor: c }).then((r) => ({ rows: r.logs, nextCursor: r.nextCursor }))
        }
      />

      <TimeFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        draftKey={`work-log:add:${teamId}`}
        onSubmit={logManually}
      />
      <TimeFormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        draftKey={editing ? `work-log:edit:${editing.id}` : undefined}
        initial={editing}
        onSubmit={correct}
      />
    </section>
  )
}
