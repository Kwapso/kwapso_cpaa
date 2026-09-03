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

import { Badge } from "@shared/ui/components/badge/badge"
import { Button } from "@shared/ui/components/button/button"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { toast } from "@shared/ui/components/sonner/sonner"
import { Alarm, StopCircle, Clock, PencilSimple, Play, Trash } from "@shared/ui/foundations/icons"

import { LoadMore } from "@/components/load-more"
import { PagedFind } from "@/components/paged-find"
import { clockFrom } from "@/components/timer-bar"
import { TimeFormDialog, type TimeFormValues } from "@/components/time-form-dialog"
import { ApiFailure, content as contentApi } from "@/lib/api"
import type { LogQuery } from "@/lib/api/content"
import {
  TIME_SLICE_PREFIX,
  listFetch,
  runningTimersKey,
  storiesKey,
  totalKey,
  workLogsKey,
} from "@/lib/live-resources"
import { COLLECTION_SORTS, translatedSorts } from "@/lib/collection-sorts"
import { translatedFacets } from "@/lib/collection-filters"
import { useAssignableMembers } from "@/lib/members"
import { useActiveTeam } from "@/lib/use-active-team"
import type { RunningTimer, Story, WorkLog } from "@shared/types"
import { invalidate, invalidatePrefix, useCached, useCachedValue } from "@shared/web/store"
import { useT } from "@shared/web/language"
import { AddButton } from "@/components/deep-link/screen-bits"
import { CollectionEmptyState } from "@shared/web/screen-engine/collection-frame"

/** THE META LINE OF A ROW OF TIME: who, and when. Two facts, and it used to be
 * five.
 *
 * The row was `targetLabel · userName · date · "not billable" · kind · note ·
 * duration · Edit` — eight things on one line, the worst row in the agency app
 * by the glance budget's own count (UI-RULEBOOK N1 caps a band at four). K1 is
 * the shape it takes instead: a title, ONE meta line, and the number the row is
 * for. So the two STATES (not billable, the kind of work) leave the sentence and
 * become a badge, which is what a state is; and the NOTE leaves the row
 * altogether, because a note is a paragraph somebody wrote and a list is not
 * where you read one — it is on the record, one click away, and the click is
 * cheaper than the crowd. */
function line(l: WorkLog): string {
  return [l.userName, l.startedAt.slice(0, 10)].filter(Boolean).join(" · ")
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
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't start that timer."))
    }
  }

  async function answerRunaway(id: string, answer: "keep" | "discard") {
    try {
      await contentApi.resolveRunaway(id, answer)
      refreshTime(teamId)
      toast.success(answer === "discard" ? t("Binned, nothing was counted.") : t("Stopped, kept in full."))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't do that."))
    }
  }

  if (mine.length === 0 && runaways.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      {canCreate && mine.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {mine.map((s) => (
            <li key={s.id}>
              <Button variant="secondary" size="sm" className="gap-1" onClick={() => start(s.id)}>
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
  // The timer used to be bound as `t` here, which shadowed the translate
  // function and is why every sentence in this block was still in English on a
  // German screen (R28). Renamed, not worked around.
  const t = useT()
  return (
    <>
      {runaways.map((timer) => (
        <div
          key={timer.id}
          className="bg-destructive/5 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] px-3 py-2 text-sm"
        >
          <span>
            <Alarm className="mr-1.5 inline size-3.5" />
            {t("A timer on")} <strong>{timer.targetLabel ?? t("something")}</strong>{" "}
            {t("has been running for")} {clockFrom(timer.elapsedSeconds)}.
          </span>
          <span className="flex gap-2">
            <Button variant="secondary" size="sm" className="gap-1" onClick={() => onAnswer(timer.id, "keep")}>
              <StopCircle className="size-3.5" />
              {t("Keep it all")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1"
              onClick={() => onAnswer(timer.id, "discard")}
            >
              <Trash className="size-3.5" />
              {t("Bin it")}
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
  // WHO MAY HAVE LOGGED IT — the team's own staff, for the "Who logged it"
  // facet below. Never a client login: `useAssignableMembers` already drops
  // one, which agrees with the door refusing a client login outright (R21).
  const members = useAssignableMembers(teamId)
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
      toast.success(answer === "discard" ? t("Binned, nothing was counted.") : t("Stopped, kept in full."))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't do that."))
    }
  }

  if (logsQ.data === undefined) return <Skeleton variant="list" lines={3} />
  const logs = logsQ.data
  const runaways = (timersQ.data ?? []).filter((t) => t.runaway)

  return (
    <section className="flex flex-col gap-6">
      {/* THE HOURS, above the toolbar rather than inside it: it is a second,
          different number from whatever the search box below is narrowing —
          the collection's own count (the heading above says that) is a third —
          and none of the three should read as an answer to the others. */}
      <p className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
        <Clock className="size-3.5" />
        {totalSeconds ? `${clockFrom(totalSeconds)} ${t("logged")}` : t("Nothing logged yet")}
      </p>

      <RunawayPrompts runaways={runaways} onAnswer={answerRunaway} />

      {/* SEARCH, FILTER, SORT AND "LOG TIME" — the same real pattern every
          other growing, paged main-screen collection draws through (tickets,
          the backlog, accounts): the DOOR answers all three, never the loaded
          page (R14 — 2,940 rows arrived from two years of the previous system
          and every piece of work produces several more; SEARCH.md layer 2). */}
      <PagedFind<WorkLog>
        listKey={workLogsKey(teamId)}
        placeholder={t("Search time…")}
        matches={{
          none: t("No time matches"),
          one: t("1 entry matches"),
          many: t("{count} entries match"),
        }}
        sorts={translatedSorts("workLogs", t)}
        defaultSort={COLLECTION_SORTS.workLogs.defaultSort}
        facets={translatedFacets("workLogs", t, {
          userId: members.map((m) => ({ value: m.id, label: m.name })),
        })}
        actions={() => (canCreate ? <AddButton label={t("Log time")} onClick={() => setAddOpen(true)} /> : null)}
        fetchPage={(query, cursor) => {
          // THE WHOLE QUESTION, read back off the door's own filter names —
          // `q` (the search box), `userId` and `targetTable` (the two facets
          // above) and `sort`/`dir` (the order control) — nothing here invents
          // a name the door does not know (SEARCH.md layer 2).
          const filter: LogQuery = {
            q: query.q,
            userId: query.userId,
            targetTable: query.targetTable,
            period: query.period,
            sort: query.sort,
            dir: query.dir,
          }
          return contentApi
            .workLogs({ filter, cursor })
            .then((r) => ({ rows: r.logs, nextCursor: r.nextCursor, total: r.total }))
        }}
      >
        {(found) => {
          const rows = found.active ? found.rows : logs
          if (rows === null || rows === undefined) return <Skeleton variant="list" lines={3} />
          return (
            <>
              {rows.length === 0 ? (
                // No `work_logs` import target — time is logged live, off a
                // running timer or a manual correction, never from a
                // spreadsheet. "Nothing matched" is a different, and
                // deliberately untrue, sentence over a resting empty list — it
                // follows what was actually asked, the same as every other
                // find bar in the app.
                <CollectionEmptyState
                  title={
                    found.active
                      ? t("Nothing matched. Try fewer words, or clear the filters.")
                      : t("No time logged yet.")
                  }
                  onCreate={!found.active && canCreate ? () => setAddOpen(true) : undefined}
                />
              ) : (
                <ul className="divide-border divide-y rounded-[var(--radius)] bg-surface-panel">
                  {rows.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{l.targetLabel ?? "—"}</p>
                        <p className="text-muted-foreground flex items-center gap-2 truncate text-xs">
                          {line(l)}
                          {/* THE STATES, at the END of the meta line, never
                              inside it — a badge is how the eye reads "this
                              row is unusual" without reading the row (N4).
                              Only the exceptions are drawn: nearly all time is
                              billable and most of it has no kind said, and a
                              badge on every row is a badge that says
                              nothing. */}
                          {!l.billable && (
                            <Badge variant="secondary" className="shrink-0">
                              {t("not billable")}
                            </Badge>
                          )}
                          {l.kind && (
                            <Badge variant="secondary" className="shrink-0">
                              {l.kind}
                            </Badge>
                          )}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums">
                        {l.endedAt ? clockFrom(l.seconds) : t("running")}
                      </span>
                      {/* FIX A LINE. Only on time that has FINISHED: a running
                          timer is corrected by stopping it, and a start time
                          you can edit while the clock is still counting is two
                          people writing the same number.

                          ICON ONLY, in the trailing slot. The word "Edit"
                          beside a pencil on every row of a 2,940-row timesheet
                          is the same word 2,940 times; the pencil is the
                          mapping this app uses everywhere (UI-CONVENTIONS §4)
                          and the label rides on `aria-label` for anybody who
                          needs it read out. */}
                      {canEdit && l.endedAt && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditing(l)}
                          className="shrink-0"
                          aria-label={t("Edit")}
                        >
                          <PencilSimple className="size-3.5" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* R14: 2,940 rows arrived from two years of the previous system,
                  and every piece of work produces several more. */}
              <LoadMore
                listKey={found.listKey ?? workLogsKey(teamId)}
                label={t("Load more time")}
                fetchPage={found.fetchPage}
              />
            </>
          )
        }}
      </PagedFind>

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
