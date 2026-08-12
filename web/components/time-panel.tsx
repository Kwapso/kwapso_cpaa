"use client"

// TIME, on the Work page — the week as it actually went, and the two ways of
// adding to it.
//
// ONE CLICK IS THE ACCEPTANCE BAR (.plans/BUILD-1 §5). The Start button on each
// backlog row is that click; this panel is the other half — what has already been
// logged, and the manual entry that is "always available", because half of real
// time is remembered rather than clocked.
//
// The RUNAWAY prompt lives here too rather than in the header, deliberately: the
// header's job is a glance, and "you left this running since Friday, what do you
// want done about it?" is a question with three answers.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { AlarmClockOff, CircleStop, Clock, Play, Plus, Trash2 } from "lucide-react"

import { LoadMore } from "@/components/load-more"
import { clockFrom } from "@/components/timer-bar"
import { TimeFormDialog, type TimeFormValues } from "@/components/time-form-dialog"
import { ApiFailure, content as contentApi } from "@/lib/api"
import { listFetch, runningTimersKey, storiesKey, totalKey, workLogsKey } from "@/lib/live-resources"
import { useActiveTeam } from "@/lib/use-active-team"
import type { RunningTimer, Story, WorkLog } from "@shared/types"
import { invalidate, useCached, useCachedValue } from "@shared/web/store"

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

export function TimePanel({ teamId, canCreate }: { teamId: string; canCreate: boolean }) {
  const logsQ = useCached<WorkLog[]>(workLogsKey(teamId), () => listFetch.workLogs(teamId))
  const timersQ = useCached<RunningTimer[]>(runningTimersKey(teamId), () =>
    contentApi.runningTimers().then((r) => r.timers)
  )
  // R16: the exact server totals, primed by the same fetch that loaded page one —
  // never the loaded page's length, which on a paged list is just "50" for ever.
  const totalSeconds = useCachedValue<number>(totalKey("work-seconds", teamId))
  const [addOpen, setAddOpen] = React.useState(false)
  // THE ONE CLICK. The caller's own open work, with a Start beside each — the
  // acceptance bar BUILD-1 §5 sets, and the reason this strip exists rather than
  // a "log time" form being the only way in. Their OWN, because a list of
  // everybody's work would need reading before it could be clicked.
  const me = useActiveTeam().user?.id ?? null
  const storiesQ = useCached<Story[]>(storiesKey(teamId), () => listFetch.stories(teamId))
  const runningIds = new Set((timersQ.data ?? []).map((t) => `${t.targetTable}:${t.targetId}`))
  const mine = (storiesQ.data ?? [])
    .filter((s) => s.status !== "done" && s.assigneeId === me && !runningIds.has(`stories:${s.id}`))
    .slice(0, 5)

  async function start(storyId: string) {
    try {
      await contentApi.startTimer("stories", storyId)
      refresh()
      toast.success("Timer started.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't start that timer.")
    }
  }

  const refresh = () => {
    invalidate(workLogsKey(teamId))
    invalidate(runningTimersKey(teamId))
    invalidate(storiesKey(teamId))
  }

  async function logManually(values: TimeFormValues) {
    await contentApi.logTime({
      targetTable: values.targetTable,
      targetId: values.targetId,
      startedAt: values.startedAt,
      endedAt: values.endedAt,
      note: values.note || undefined,
      billable: values.billable,
    })
    refresh()
    toast.success("Time logged.")
  }

  async function answerRunaway(id: string, answer: "keep" | "discard") {
    try {
      await contentApi.resolveRunaway(id, answer)
      refresh()
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
        <h2 className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
          <Clock className="size-3.5" />
          Time
          {totalSeconds ? (
            <span className="bg-muted rounded-full px-2 py-0.5 text-xs tabular-nums">
              {clockFrom(totalSeconds)}
            </span>
          ) : null}
        </h2>
        {canCreate && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" />
            Log time
          </Button>
        )}
      </div>

      {mine.length > 0 && (
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

      {/* THE MONDAY MORNING PROMPT. Never automatic: a timer that stopped itself
          at some clever hour is a number a person did not choose. Two of the
          three answers are one tap here; "stop it at five o'clock" is the third,
          and it is the stop control on the header bar with a time. */}
      {runaways.map((t) => (
        <div
          key={t.id}
          className="border-destructive/40 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <span>
            <AlarmClockOff className="mr-1.5 inline size-3.5" />
            A timer on <strong>{t.targetLabel ?? "something"}</strong> has been running for{" "}
            {clockFrom(t.elapsedSeconds)}.
          </span>
          <span className="flex gap-1.5">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => answerRunaway(t.id, "keep")}>
              <CircleStop className="size-3.5" />
              Keep it all
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => answerRunaway(t.id, "discard")}
            >
              <Trash2 className="size-3.5" />
              Bin it
            </Button>
          </span>
        </div>
      ))}

      {logs.length === 0 ? (
        <p className="text-muted-foreground text-sm">No time logged yet.</p>
      ) : (
        <ul className="divide-border divide-y rounded-md border">
          {logs.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{l.targetLabel ?? "—"}</p>
                <p className="text-muted-foreground truncate text-xs">{line(l)}</p>
              </div>
              <span className="shrink-0 text-sm tabular-nums">
                {l.endedAt ? clockFrom(l.seconds) : "running"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* R14: 2,940 rows arrived from two years of the previous system, and every
          piece of work produces several more. */}
      <LoadMore
        listKey={workLogsKey(teamId)}
        label="Load more time"
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
    </section>
  )
}
