"use client"

// THE WORK LOGS TAB — one record's time, and the numbers on top of it.
//
// ONE COMPONENT, NOT FOUR. CHECKLIST 6.8 asked for "a work logs tab on the story,
// and on every other detail screen that captures time", and only the story ever
// got one — written inline, in the middle of that screen. Time can be logged
// against four things (WORK_LOG_TARGETS: a story, a ticket, a task and a
// meeting), so finishing that sentence by copying the list three more times would
// be four lists that agree today and drift the first time one of them is fixed.
// It is written once here and hung wherever the clock runs, exactly as
// work-panels.tsx does for the work engine's other nested collections.
//
// THE NUMBERS COME FROM THE SERVER, and that is the half a browser cannot fake.
// The list under them is a PAGE (R14) — a story worked on for a year has more
// rows of time than any page holds — so adding up what is loaded would answer
// "the newest fifty entries" while looking exactly like an answer about the
// record. Every figure here is a SQL aggregate over the whole filter, from a door
// that parses that filter with the very function the list door uses, so the
// header and the rows are one question (R16).
//
// AND NOTHING HERE IS MONEY. A work log is the input to the agency's own margin,
// but what an hour COSTS is derived in the one file R24 fences and never travels
// on this object — so no screen built on this panel can put an internal rate in
// front of anybody. The door refuses a client login outright besides (R21), and
// the client portal has no route to it at all.

import * as React from "react"

import { Badge } from "@shared/ui/registry/primitives/badge/badge"
import { Button } from "@shared/ui/registry/primitives/button/button"
import { Skeleton } from "@shared/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@shared/ui/registry/primitives/sonner/sonner"
import { DynamicIcon, type IconName } from "lucide-react/dynamic"
import { StatGrid, defaultStatGridConfig } from "@shared/ui/registry/collections/stat-grid/stat-grid"

import { CONCEPT_ICON } from "@/lib/pages"
import { Pencil } from "lucide-react"

import { AddButton, EmptyLine } from "@/components/deep-link/screen-bits"
import { LoadMore } from "@/components/load-more"
import { BandCard, HoursByChart, NothingYet, RecordWeeksChart, hoursSpoken } from "@/components/pulse"
import { TimeFormDialog, type TimeFormValues } from "@/components/time-form-dialog"
import { content as contentApi } from "@/lib/api"
import { cursorKey, recordTimeKey, recordTimeSummaryKey, totalKey } from "@/lib/live-resources"
import { recordTimeCountKey } from "@shared/record-counts"
import type { WorkLog, WorkLogSummary } from "@shared/types"
import { formatCount } from "@shared/web/format-count"
import { formatDayMonth } from "@shared/web/format"
import { invalidate, primeCache, useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"

/** WHERE THE EXACT ENTRY COUNT IS PARKED, for the tab badge above the panel to
 * read (R16 — the door's own COUNT(*), never the loaded page's length).
 *
 * Exported because the badge is drawn by the HOST, in its tabs config, and the
 * panel is what fetches the number. One function so the two cannot type the
 * string differently — which is the whole reason every key in this app is a
 * function rather than a template literal at each site.
 *
 * IT IS AN ORDINARY `totalKey` SIDECAR NOW, and that is the whole of the fix for
 * a badge that stayed blank until you opened the tab. The panel's own list fetch
 * used to be the only thing that ever primed it, and the panel does not mount
 * until the tab is active — so on a story, a ticket, a task and a meeting the
 * Time badge was missing exactly when a reader needed it to decide whether to
 * look. Composed through `recordTimeCountKey` it is a line in the record-counts
 * registry like any other, fetched when the record OPENS, and this fetch simply
 * refreshes the same key when the rows finally arrive. */
export function workLogsTotalKey(targetTable: string, targetId: string): string {
  return totalKey(recordTimeCountKey(targetTable), targetId)
}

/** Whole seconds → the hours and minutes a person would say out loud. */
function spell(seconds: number): string {
  const m = Math.round(seconds / 60)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`
}

/** BELOW THIS, A CHART IS NOISE. Three bars drawn from three rows is a picture
 * that takes more room than the list it summarises and says less — the owner's
 * own placement rule is "aggregate when there is enough to aggregate". So the
 * breakdowns appear when the record has a real history behind them and the list
 * speaks for itself until then.
 *
 * FOUR, because that is the smallest number at which a bar chart is doing work a
 * reader could not do by eye. */
const ENOUGH_TO_CHART = 4

/** THE NUMBERS ON TOP — total time, how many entries, and how many people it
 * took. Always shown, on any record with any time at all: a big number is honest
 * at one row in a way a chart is not.
 *
 * `hoursSpoken` FOR THE HOURS and never `formatCount`: hours are not a collection
 * tally and "1.3k hours" is nonsense (the rule the pulse band already follows).
 *
 * `formatCount` FOR THE OTHER TWO, and both of them used to bypass it (R16):
 *
 *   • ENTRIES rendered `String(summary.total)` while the tab strip directly above
 *     rendered `formatCount` of the identical collection. At 1,200 entries the tab
 *     read "1.2k" and the tile read "1200" — R16's origin story word for word,
 *     one collection wearing two numbers, and the tile's would have gone on
 *     reading "1000000" long after the door stopped counting.
 *   • PEOPLE ON IT rendered `summary.people.length`, and `people` is the top
 *     `WORK_LOG_GROUP_CAP` by hours. A record worked on by more than fifty people
 *     read "People on it: 50" for ever, with nothing on the screen saying it had
 *     stopped — a capped list's length wearing a total's clothes, which is the
 *     failure the law was written for. `peopleTotal` is the door's own bounded
 *     COUNT over the same filter; the array beside it stays the chart's top fifty.
 *
 * `|| "0"` because a tile is not a badge: `formatCount` renders nothing for a
 * zero, which is right above a tab (no rows, no badge) and wrong inside a card
 * that has already committed a label to the screen. The same expression the pulse
 * band's tiles use. */
function Numbers({ summary }: { summary: WorkLogSummary }) {
  const t = useT()
  const items = [
    // THE GLYPH BESIDE EACH NUMBER (library v0.11.0: `StatItem.icon`). Until it
    // shipped, a stat card's only graphic was the trend arrow — and the delta is
    // OFF here, so these three carried no mark at all while every concept they
    // name owns one in `CONCEPT_ICON`. Writing a glyph into the LABEL is the one
    // shape UI-CONVENTIONS §5 refuses, so they went without.
    //
    // `aria-hidden`: the label says the same thing in words, right beside it.
    {
      id: "hours",
      label: t("Hours logged"),
      value: hoursSpoken(summary.totalSeconds),
      icon: <DynamicIcon name={CONCEPT_ICON.time as IconName} className="size-4" aria-hidden />,
      delta: "",
      trend: "flat" as const,
    },
    {
      id: "entries",
      label: t("Entries"),
      value: formatCount(summary.total) || "0",
      icon: <DynamicIcon name={CONCEPT_ICON.dropdowns as IconName} className="size-4" aria-hidden />,
      delta: "",
      trend: "flat" as const,
    },
    {
      id: "people",
      label: t("Members on it"),
      value: formatCount(summary.peopleTotal) || "0",
      icon: <DynamicIcon name={CONCEPT_ICON.members as IconName} className="size-4" aria-hidden />,
      delta: "",
      trend: "flat" as const,
    },
  ]
  return (
    <StatGrid
      items={items}
      config={{
        // Three, and the delta line OFF across the whole grid: these are the
        // record's numbers as they stand and nothing on the door claims to know
        // last week's, so an arrow beside them would be an assertion nobody made.
        ...defaultStatGridConfig,
        columns: 3,
        showDelta: false,
      }}
    />
  )
}

/** THE THREE PICTURES, each of which asks whether it has anything to say first.
 *
 * A CHART IS NEVER DRAWN ON ZEROS or on a handful of rows. Eight flat weeks along
 * the bottom of an axis is a picture of nothing wearing the clothes of
 * information, and a bar chart of two bars is a sentence with a frame around it.
 * Every one of these three has its own test and its own honest sentence, because
 * they fail independently: a record can have plenty of hours spread over one
 * person (nothing to say about who), all of one kind (nothing to say about what),
 * and all of it before the window opened (nothing to say about when). */
function Pictures({ summary }: { summary: WorkLogSummary }) {
  const t = useT()
  if (summary.total < ENOUGH_TO_CHART) return null

  const weeks = summary.weeks.map((w) => ({
    label: formatDayMonth(w.weekStart),
    hours: Math.round((w.seconds / 3600) * 10) / 10,
  }))
  const people = summary.people.map((p) => ({
    label: p.userName ?? t("Someone who has left"),
    hours: Math.round((p.seconds / 3600) * 10) / 10,
  }))
  // A kind nobody set is the honest majority of logged time, so it is a bar with
  // a name rather than a row quietly dropped from the picture.
  const kinds = summary.kinds.map((k) => ({
    label: k.kind ?? t("Not said"),
    hours: Math.round((k.seconds / 3600) * 10) / 10,
  }))

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <BandCard title={t("Hours logged, the last eight weeks")}>
        {!weeks.some((w) => w.hours > 0) ? (
          <NothingYet
            what={t("None of this time was logged in the last eight weeks.")}
            how={t("The total above covers all of it. This picture fills in as new time lands.")}
          />
        ) : (
          <RecordWeeksChart rows={weeks} label={t("Hours")} />
        )}
      </BandCard>
      <BandCard title={t("Hours by person")}>
        {people.length < 2 ? (
          <NothingYet
            what={t("One person has worked on this.")}
            how={t("This picture appears once a second person logs time against it.")}
          />
        ) : (
          <HoursByChart rows={people} label={t("Hours")} />
        )}
      </BandCard>
      <BandCard title={t("Hours by kind of work")}>
        {kinds.length < 2 ? (
          <NothingYet
            what={t("Every entry here is the same kind of work.")}
            how={t("Say what kind an entry is when you log it, and the split shows here.")}
          />
        ) : (
          <HoursByChart rows={kinds} label={t("Hours")} />
        )}
      </BandCard>
    </div>
  )
}

/** THE TIME LOGGED AGAINST ONE RECORD — the numbers, the pictures, and the rows.
 *
 * `targetTable` is one of WORK_LOG_TARGETS (`stories`, `help`, `tasks`,
 * `meetings`), which is the door's own allow-list — a table this panel is hung on
 * that the door does not accept comes back a clean 400 rather than an empty list
 * pretending there is nothing there.
 *
 * TWO READS, ONE FAMILY. The rows and the summary are two questions about the
 * same thing, so they go stale on the same events and both live under the
 * `time-of:` prefix the live registry already drops whenever any row of time
 * moves (R15). That is why stopping a timer from the header bar updates this tab
 * without a reload, and why the total above the list can never be left reading
 * the number from before. */
export function WorkLogsPanel({
  targetTable,
  targetId,
  recordLabel,
  canEdit,
  canLog,
  onActivityChanged,
}: {
  targetTable: "stories" | "help" | "tasks" | "meetings"
  targetId: string
  /** What this record is called, for the "what you worked on" line of the log
   * form — the record is the answer to that question, so it is shown rather than
   * picked. */
  recordLabel: string
  /** `work:edit` at the call site — a step above logging your own, and the right
   * the correction door itself gates on. */
  canEdit: boolean
  /** `work:create` — the right the write door gates on. Absent = no Log time
   * button, and the door would refuse it anyway (R10). */
  canLog: boolean
  /** The host's own record-activity key, dropped when a correction lands: a
   * corrected row writes an activity line on the record it belongs to, and only
   * the host knows what that record's feed is keyed on. */
  onActivityChanged?: () => void
}) {
  const t = useT()
  const filter = React.useMemo(() => ({ targetTable, targetId }), [targetTable, targetId])
  const listKey = recordTimeKey(targetTable, targetId)
  const summaryKey = recordTimeSummaryKey(targetTable, targetId)

  const logsQ = useCached<WorkLog[]>(listKey, () =>
    contentApi.workLogs({ filter }).then((r) => {
      primeCache(workLogsTotalKey(targetTable, targetId), r.total)
      primeCache(cursorKey(listKey), r.nextCursor)
      return r.logs
    })
  )
  const summaryQ = useCached<WorkLogSummary>(summaryKey, () => contentApi.workLogSummary(filter))

  const [editingLog, setEditingLog] = React.useState<WorkLog | null>(null)
  const [adding, setAdding] = React.useState(false)

  /** After any write here: both halves of this tab, and the record's own feed. */
  function refresh() {
    invalidate(listKey)
    invalidate(summaryKey)
    onActivityChanged?.()
  }

  /** CORRECT A ROW OF TIME, on the record it was logged against. The door keeps
   * the trail (who corrected what, and when) — see lib/work-logs editWorkLog. */
  async function correct(values: TimeFormValues) {
    if (!editingLog) return
    await contentApi.updateWorkLog({
      id: editingLog.id,
      startedAt: values.startedAt,
      endedAt: values.endedAt,
      note: values.note,
      kind: values.kind,
      billable: values.billable,
    })
    refresh()
    toast.success(t("Time corrected."))
  }

  /** WRITE TIME DOWN BY HAND, against the record you are standing on. Half of
   * real time is remembered rather than clocked, which is why the door has always
   * accepted it; the target is fixed here, so an hour typed on a ticket cannot
   * land on a story by a mis-click. */
  async function log(values: TimeFormValues) {
    await contentApi.logTime({
      targetTable,
      targetId,
      startedAt: values.startedAt,
      endedAt: values.endedAt,
      note: values.note,
      kind: values.kind,
      billable: values.billable,
    })
    refresh()
    toast.success(t("Time logged."))
  }

  if (logsQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the time.")}</p>
  if (logsQ.data === undefined) return <Skeleton variant="list" lines={3} />
  const rows = logsQ.data

  return (
    <div className="flex flex-col gap-6">
      {canLog && (
        <div className="flex flex-wrap justify-end gap-2">
          {/* The same control every other collection tab in the app puts above
              its list, so "add one of these" looks like one act wherever a person
              meets it (UI-CONVENTIONS §4). */}
          <AddButton label={t("Log time")} onClick={() => setAdding(true)} />
        </div>
      )}

      {/* The numbers wait for the second read rather than flashing a zero: an
          "0 hours" that becomes "14 hours" a moment later is a number somebody
          might act on. */}
      {summaryQ.data && summaryQ.data.total > 0 && (
        <>
          <Numbers summary={summaryQ.data} />
          <Pictures summary={summaryQ.data} />
        </>
      )}

      {rows.length === 0 ? (
        <EmptyLine concept="time">{t("No time logged against this yet.")}</EmptyLine>
      ) : (
        <ul className="divide-border divide-y rounded-xl border">
          {rows.map((l) => (
            <li
              key={l.id}
              className={`flex flex-wrap items-center gap-2 px-3 py-2 ${
                l.discarded ? "opacity-60" : ""
              }`}
            >
              {/* WHO AND WHEN, and that is the whole sentence. It carried the
                  kind of work and the note as well — seven units with the
                  duration, the Discarded badge and the Edit button, which is the
                  same eight-fact row the Work logs SCREEN had and the same fix
                  (N1, K1). The kind is a STATE, so it is a badge at the end of
                  the line; the note is a paragraph somebody wrote, and a list is
                  not where anybody reads one — it is in the correction dialog,
                  which is where it was written.

                  Fixing it here fixes it FOUR times: this panel is hung on a
                  story, a ticket, a task and a meeting, which is the whole
                  reason the list was written once. */}
              <span className="min-w-0 flex-1 truncate text-sm">
                {[l.userName, l.startedAt.slice(0, 10)].filter(Boolean).join(" · ")}
              </span>
              {l.kind && (
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {l.kind}
                </Badge>
              )}
              {l.discarded && (
                <Badge variant="outline" className="text-muted-foreground shrink-0 text-[10px]">
                  {t("Discarded")}
                </Badge>
              )}
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {l.endedAt ? spell(l.seconds) : t("running")}
              </span>
              {/* FIX A LINE. Only on time that has FINISHED and has not been
                  binned: a running timer is corrected by stopping it (the control
                  for that is on the header bar, on every screen), and a start time
                  you can edit while the clock is still counting is two people
                  writing the same number.

                  Icon only, in the trailing slot, for the same reason as the Work
                  logs screen: the word "Edit" beside a pencil on every row is one
                  word repeated as many times as there are rows. */}
              {canEdit && l.endedAt && !l.discarded && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditingLog(l)}
                  className="shrink-0"
                  aria-label={t("Edit")}
                >
                  <Pencil className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* R14: the badge above counts ALL of this record's time, so the list under
          it has to be able to reach the rest of it. */}
      <LoadMore
        listKey={listKey}
        label={t("Load more time")}
        fetchPage={(c: string) =>
          contentApi.workLogs({ filter, cursor: c }).then((r) => ({ rows: r.logs, nextCursor: r.nextCursor }))
        }
      />
      <TimeFormDialog
        open={adding}
        onOpenChange={setAdding}
        draftKey={`work-log:add:${targetTable}:${targetId}`}
        fixedTarget={{ table: targetTable, id: targetId, label: recordLabel }}
        onSubmit={log}
      />
      <TimeFormDialog
        open={!!editingLog}
        onOpenChange={(o) => !o && setEditingLog(null)}
        draftKey={editingLog ? `work-log:edit:${editingLog.id}` : undefined}
        initial={editingLog}
        onSubmit={correct}
      />
    </div>
  )
}
