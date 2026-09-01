"use client"

// WAVES — the sidebar page: every package a client bought.
//
// A WAVE IS WHAT A CLIENT BOUGHT: a package of sprints. The owner's example is
// the whole definition — "Alex sells Hogo a package — he maps their processes,
// builds two automations, they test it, he trains them. Three weeks later he
// sells a second, identical package." Two waves, told apart by their name and
// their dates.
//
// WHAT A ROW SAYS, AND WHAT IT DELIBERATELY DOES NOT. Whose it is, what it is
// called, when it runs and how many sprints are in it. No price: the owner ruled
// the money out of the first version, and there is no price column on the table
// for a row to read. No kind either — "a wave is a wave".
//
// THE DATES ARE THE SPRINTS' ANSWER. They are stored on the row and recalculated
// by the door whenever a sprint is added, moved or removed, so this screen reads
// them like any other column rather than working them out — which is what keeps
// a list of forty waves one round trip instead of eighty.
//
// Host-composed rather than a recipe, for the same reason the client's own
// organisation panel is: a row here pairs a date range with a count and an
// inline switch-off, and no engine block draws that.

import * as React from "react"
import { useRemembered } from "@shared/web/remembered"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@shared/ui/components/alert-dialog/alert-dialog"
import { Badge } from "@shared/ui/components/badge/badge"
import { Button } from "@shared/ui/components/button/button"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { toast } from "@shared/ui/components/sonner/sonner"
import { Pencil, Power, RotateCcw } from "@shared/ui/foundations/icons"
import { Gantt, GanttPeriodStepper, type GanttBar, type GanttLane } from "@shared/ui/components/gantt/gantt"

import { CollectionHeading } from "@/components/collection-heading"
import {
  EMPTY_WAVE_QUERY,
  type WaveOrder,
  type WaveView,
  WaveFinder,
  selectWaves,
  waveQueryIsActive,
  type WaveQuery,
} from "@/components/wave-finder"
import { AddButton, CollectionCard, ToolbarRow } from "@/components/deep-link/screen-bits"
import { InAppLink } from "@/components/in-app-link"
import { WaveFormDialog } from "@/components/wave-form-dialog"
import { ApiFailure, tenancy } from "@/lib/api"
import { waves as wavesApi, wavesKey } from "@/lib/api/waves"
import { companiesKey, totalKey } from "@/lib/live-resources"
import { softNavigate } from "@/lib/nav"
import { usePermissions } from "@/lib/perms"
import type { Account } from "@shared/types"
import type { Wave } from "@shared/waves"
import { formatDate, formatMonth } from "@shared/web/format"
import { RecordMark } from "@shared/web/record-mark"
import { invalidate, primeCache, useCached, useCachedValue } from "@shared/web/store"
import { useLanguage } from "@shared/web/language"
import type { Language } from "@shared/i18n"

/** WHEN A PACKAGE RUNS, from the two dates the door derived — or the sentence
 * that says nobody has planned it yet, which is an ordinary state and not a gap:
 * "Alex sells the wave, sprints get planned afterwards." */
export function waveDates(
  wave: { startsOn: string | null; endsOn: string | null },
  t: (s: string) => string,
  lang: Language
): string {
  if (wave.startsOn && wave.endsOn) return `${formatDate(wave.startsOn, lang)} → ${formatDate(wave.endsOn, lang)}`
  return formatDate(wave.startsOn, lang) || formatDate(wave.endsOn, lang) || t("No sprints planned yet")
}

/** SIX PERIODS IS THE KIT'S OWN CEILING (gantt.tsx, CH27.26: "Six periods,
 * then it steps"), and the periods here are MONTHS rather than weeks — the
 * Opus analysis's own call, 1 Sep 2026: six weeks shows almost nothing over a
 * two-year book of packages, six months shows a client's buying rhythm, which
 * is the question this view exists to answer. */
const TIMELINE_MONTHS = 6

function monthIndex(iso: string): number {
  const d = new Date(iso)
  return d.getFullYear() * 12 + d.getMonth()
}

/** The first of a month, from the same zero-based index `monthIndex` reads —
 * a plain ISO date, so `formatMonth` reads it exactly as it reads any other
 * stored date. */
function monthIso(index: number): string {
  const year = Math.floor(index / 12)
  const month = ((index % 12) + 12) % 12
  return `${year}-${String(month + 1).padStart(2, "0")}-01`
}

export type WaveTimeline = {
  periods: string[]
  lanes: GanttLane[]
  /** Older or newer waves sit outside this window — `GanttPeriodStepper` is
   * the only way to reach them, never a scrollbar (CH27.26 forbids one by
   * name: "A timeline never becomes a horizontal scroller inside the panel"). */
  hasEarlier: boolean
  hasLater: boolean
}

/**
 * THE ALREADY-LOADED WAVES (bounded, no pager — see the file header),
 * RESHAPED INTO THE SHAPE `components/gantt` ACTUALLY TAKES.
 *
 * PERIODS ARE MONTHS. `offset` counts months back from the most recent window
 * the data reaches (0 = the latest six months something in `rows` touches),
 * because a rolling book of packages is read for its RECENT rhythm first and
 * the stepper is how a reader goes further back — never the other way, which
 * would bury this quarter's waves behind however far the team's history runs.
 *
 * LANES ARE ONE PER ACCOUNT — CH27.26: "Lanes are apps, accounts or members".
 * `Gantt` itself does not sort or de-overlap a lane's own bars (gantt.tsx's
 * `GanttLane` doc: "They may not overlap … this file does not stack them and
 * does not sort"), so two waves of the same client that overlap in time are
 * packed into two SEPARATE lanes here, greedily, by start month — the same
 * "minimum rooms" shape a calendar uses, and the kit's own rule for it
 * ("two overlapping sprints mean two lanes").
 *
 * A WAVE WITH NO SPRINTS YET HAS NO DATES (`waveDates`'s own header) and
 * cannot sit on an axis of time, so it is left out here rather than drawn at
 * month zero — it is still on the List view, which is where it belongs.
 */
export function waveTimelineWindow(
  rows: Wave[],
  offset: number,
  t: (s: string) => string,
  lang: Language
): WaveTimeline {
  const dated = rows.filter((w) => w.startsOn && w.endsOn) as Array<
    Wave & { startsOn: string; endsOn: string }
  >
  if (dated.length === 0) return { periods: [], lanes: [], hasEarlier: false, hasLater: false }

  const dataStart = Math.min(...dated.map((w) => monthIndex(w.startsOn)))
  const dataEnd = Math.max(...dated.map((w) => monthIndex(w.endsOn)))
  const totalMonths = dataEnd - dataStart + 1
  const span = Math.min(TIMELINE_MONTHS, totalMonths)
  const maxOffset = Math.max(0, totalMonths - TIMELINE_MONTHS)
  const clampedOffset = Math.min(Math.max(0, offset), maxOffset)

  const windowEnd = dataEnd - clampedOffset
  const windowStart = windowEnd - span + 1

  const periods: string[] = []
  for (let i = windowStart; i <= windowEnd; i++) periods.push(formatMonth(monthIso(i), lang))

  const byAccount = new Map<string, Array<Wave & { startsOn: string; endsOn: string }>>()
  for (const w of dated) {
    const list = byAccount.get(w.accountId)
    if (list) list.push(w)
    else byAccount.set(w.accountId, [w])
  }

  const lanes: GanttLane[] = []
  for (const waves of byAccount.values()) {
    const sorted = [...waves].sort((a, b) => monthIndex(a.startsOn) - monthIndex(b.startsOn))
    // GREEDY LANE PACKING. `laneEnds[i]` is the last occupied month-index of
    // lane `i`; a wave joins the first lane whose last wave ends strictly
    // before it starts, or opens a new lane. Not necessarily the fewest
    // possible lanes — always non-overlapping ones, which is the rule.
    const laneEnds: number[] = []
    const laneBars: GanttBar[][] = []
    for (const w of sorted) {
      const s = monthIndex(w.startsOn)
      const e = monthIndex(w.endsOn)
      let lane = laneEnds.findIndex((end) => s > end)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(e)
        laneBars.push([])
      } else {
        laneEnds[lane] = e
      }
      // CLIP TO THE WINDOW HERE, ONCE. `Gantt`'s own `renderBar` clamps a
      // negative `start` to column 0 but keeps the UNCLAMPED `span`, so a
      // wave that began before the window would be drawn wider than the
      // months it still occupies inside it — clipping both ends before they
      // ever reach the component is the honest fix, not a workaround for a
      // bug: the component is telling the truth about a bar that starts at
      // column 0, and the caller is the one deciding a bar starts there.
      const relStart = s - windowStart
      const relEnd = e - windowStart
      if (relEnd < 0 || relStart >= periods.length) continue
      const clippedStart = Math.max(0, relStart)
      const clippedSpan = Math.min(periods.length, relEnd + 1) - clippedStart
      laneBars[lane].push({ id: w.id, label: w.name, start: clippedStart, span: clippedSpan })
    }
    laneBars.forEach((bars, i) => {
      if (bars.length === 0) return
      lanes.push({ id: `${sorted[0].accountId}:${i}`, label: sorted[0].accountName ?? t("No client"), bars })
    })
  }

  return { periods, lanes, hasEarlier: clampedOffset < maxOffset, hasLater: clampedOffset > 0 }
}

/** Page one of the team's waves, priming the exact server total the heading
 * badges (R16). One fetcher, so the badge and the rows always came from the same
 * round trip. */
export function fetchWaves(teamId: string): Promise<Wave[]> {
  return wavesApi.list().then((r) => {
    primeCache(totalKey("waves", teamId), r.total)
    return r.waves
  })
}

/**
 * THE WAVES COLLECTION, wherever it is drawn.
 *
 * The sidebar page and the client's own record show the SAME list with the same
 * search, the same sort and the same actions; the only difference is whether the
 * client is already decided. So it is one component with one optional argument,
 * rather than two lists that agree until somebody edits one of them.
 */
export function WaveCollection({
  teamId,
  basePath,
  accountId,
}: {
  teamId: string
  /** the waves list in the URL form we arrived through (/waves or /t/<team>/waves) */
  basePath: string
  /** set on a client's own record: the list is that client's, and the client
   * filter is not offered because it has already been answered */
  accountId?: string
}) {
  const { t, lang } = useLanguage()
  const { can } = usePermissions(teamId)
  // A wave is a package of SPRINTS, so it is the work engine's module — the same
  // right that lets somebody start a sprint. The doors gate; this only decides
  // what to draw, so a control we hide is never the defence.
  const canCreate = can("work", "create")
  const canEdit = can("work", "edit")

  const wavesQ = useCached<Wave[]>(wavesKey(teamId), () => fetchWaves(teamId))
  // The exact server total (R16) — never the loaded page's length.
  const total = useCachedValue<number>(totalKey("waves", teamId))
  // COMPANIES ONLY, and ALL of them. A wave is sold to a company, so the
  // people on the spine do not belong in this picker — and the paged accounts
  // list's page one cannot be trusted to hold every company (it is where
  // Confia went missing, 25 Aug 2026). The door answers the narrow question
  // itself, and the accounts registry entry keeps this key live.
  const clientsQ = useCached<Account[]>(companiesKey(teamId), () =>
    tenancy.accounts({ type: "entity" }).then((r) => r.accounts)
  )

  // WHAT SHE WAS ASKING THIS COLLECTION, remembered with the screen (see
  // web/lib/nav-memory.ts). The search, the client, the on/off filter and the
  // order are one question and are remembered as one slot.
  //
  // A REMEMBERED FILTER IS CHECKED AGAINST TODAY'S VOCABULARY. The two closed
  // lists — the on/off filter and the sort — are validated outright. The CLIENT
  // is validated only once the client list is actually loaded (it is a cached
  // read and this runs at mount); a client switched off while she was away and
  // not yet loaded therefore survives one render, and what she sees is her own
  // filter matching nothing, with "Clear all" beside it. That is a degraded
  // answer rather than a wrong one, and it is the honest limit of validating
  // against a list that arrives asynchronously.
  const [query, setQuery] = useRemembered<WaveQuery>("find", EMPTY_WAVE_QUERY, (found) => {
    if (!found || typeof found !== "object") return undefined
    const was = found as Record<string, unknown>
    const known = clientsQ.data
    const accountId =
      typeof was.accountId === "string" &&
      (!known || known.some((c) => c.id === was.accountId))
        ? was.accountId
        : ""
    return {
      q: typeof was.q === "string" ? was.q : "",
      accountId,
      status: was.status === "on" || was.status === "off" ? was.status : "",
      sortBy: (["name", "runs", "sprints", "client", "newest"] as const).includes(
        was.sortBy as WaveOrder
      )
        ? (was.sortBy as WaveOrder)
        : EMPTY_WAVE_QUERY.sortBy,
      dir: was.dir === "asc" || was.dir === "desc" ? was.dir : EMPTY_WAVE_QUERY.dir,
    }
  })
  // LIST OR TIMELINE — remembered the same way the search/filter/sort question
  // is, one slot per screen rather than folded into it: the view is "how she
  // wants to look", the query is "what she is looking for", and R16 already
  // has its one count above, so this slot adds a body, never a second badge.
  const [view, setView] = useRemembered<WaveView>("view", "list")
  // WHICH SIX-MONTH WINDOW THE TIMELINE SHOWS. Ephemeral, unlike `view` and
  // `query`: it is a scroll position over a window that only exists while the
  // Timeline is on screen, not "where she was" in the sense nav-memory.ts
  // means it, so a plain `useState` is the honest weight for it.
  const [timelineOffset, setTimelineOffset] = React.useState(0)
  const [addOpen, setAddOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Wave | null>(null)
  const [switchingOff, setSwitchingOff] = React.useState<Wave | null>(null)

  async function run(work: () => Promise<unknown>, whenItFails: string): Promise<void> {
    try {
      await work()
      invalidate(wavesKey(teamId))
    } catch (e) {
      toast.error(e instanceof ApiFailure ? e.message : whenItFails)
    }
  }

  // A FAILED READ SAYS SO. A skeleton that never resolves is indistinguishable
  // from a screen that is merely slow, and the person waits for something that
  // is never coming.
  if (wavesQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the waves.")}</p>
  if (wavesQ.data === undefined) return <Skeleton variant="list" lines={4} />

  // ON A CLIENT'S RECORD the list is narrowed before anything else is asked, so
  // the count under the search box and the empty state both speak about that
  // client rather than about the team.
  const all = accountId ? wavesQ.data.filter((w) => w.accountId === accountId) : wavesQ.data
  const rows = selectWaves(all, query)
  const clients = (clientsQ.data ?? []).filter((a) => a.active)
  const asking = waveQueryIsActive(query)

  // THE TIMELINE READS THE SAME NARROWED ROWS the List does — a search or a
  // filter narrows both bodies alike, so switching views mid-search never
  // silently widens what she was asking. Built only when it is actually on
  // screen: it is arithmetic over an in-memory array, not a fetch, but there
  // is no reason to pack every wave into lanes on a render where nobody reads
  // the result.
  const timeline = view === "timeline" ? waveTimelineWindow(rows, timelineOffset, t, lang) : null
  // THE STEPPER ONLY WHEN THERE IS SOMEWHERE ELSE TO GO — CH27.26's cap is a
  // ceiling to step past, not a permanent fixture on a book that already fits
  // inside six months. `GanttPeriodStepper` would draw nothing here anyway
  // (its own state 7/10), but the `undefined` keeps the toolbar row from
  // reserving space for a control with nothing to move.
  const timelineStepper =
    timeline && (timeline.hasEarlier || timeline.hasLater) ? (
      <GanttPeriodStepper
        onPrevious={timeline.hasEarlier ? () => setTimelineOffset((o) => o + TIMELINE_MONTHS) : undefined}
        onNext={timeline.hasLater ? () => setTimelineOffset((o) => Math.max(0, o - TIMELINE_MONTHS)) : undefined}
        windowLabel={
          timeline.periods.length > 0
            ? `${timeline.periods[0]} – ${timeline.periods[timeline.periods.length - 1]}`
            : undefined
        }
        previousLabel={t("Earlier")}
        nextLabel={t("Later")}
      />
    ) : undefined

  return (
    <div className="flex flex-col gap-6">
      {/* R16: the count lives in the heading ONLY on the sidebar page, which has
          no tab strip to badge, and it is the door's exact COUNT(*). On a
          client's record the tab badge is the count and it counts that CLIENT's
          waves — so the team-wide total must not be drawn beside it, which is
          the same figure saying two different things. */}
      {accountId ? null : <CollectionHeading sectionKey="waves" total={total} />}

      {/* THE CANONICAL SHAPE — title, then ONE card holding the toolbar and
          the rows, with "Sell a wave" at the FAR RIGHT of the toolbar's own
          first line rather than a row of its own above it (client ruling,
          2026-08-31: an action button never gets a separate row from the
          toolbar it belongs to). This screen has no tab strip (single-view,
          like Roles and Processes), so the toolbar is the first thing inside
          the card. */}
      <CollectionCard>
        {all.length > 0 ? (
          // Only once there is something to look through — a search box over
          // an empty collection is a control that cannot do anything, so the
          // button falls back to a bare `<ToolbarRow>` below instead.
          <div className="mb-4">
            <WaveFinder
              query={query}
              onChange={setQuery}
              clients={clients}
              showClientFilter={!accountId}
              resultCount={rows.length}
              view={view}
              onViewChange={(v) => {
                setView(v)
                // A fresh view starts at the most recent window — carrying
                // the old offset forward would land on a period the reader
                // never chose from this collection.
                setTimelineOffset(0)
              }}
              period={timelineStepper}
              actions={
                canCreate && clients.length > 0 && (
                  <AddButton label={t("Sell a wave")} onClick={() => setAddOpen(true)} />
                )
              }
            />
          </div>
        ) : (
          canCreate &&
          clients.length > 0 && (
            <ToolbarRow
              className="mb-4"
              actions={<AddButton label={t("Sell a wave")} onClick={() => setAddOpen(true)} />}
            />
          )
        )}
        {view === "timeline" && timeline ? (
          // ONE LANE PER ACCOUNT, one bar per wave, months across the top —
          // waveTimelineWindow's own header says why lanes are accounts and
          // periods are months rather than weeks. `Gantt` draws its own
          // empty register when `lanes` is empty (no dated wave in the
          // window matches what she is asking), so there is no second empty
          // sentence to keep in step with the List one above.
          <Gantt
            periods={timeline.periods}
            lanes={timeline.lanes}
            onBarSelect={(bar) => bar.id && softNavigate(`${basePath}/${bar.id}`)}
            label={t("Waves timeline")}
            emptyLabel={t("Nothing here")}
            emptyBody={
              asking
                ? t("No waves match that in this window.")
                : t("No waves have both a start and an end in this window yet.")
            }
          />
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm">
            {asking
              ? t("No waves match that.")
              : t("No waves yet. A wave is a package of sprints a client bought — sell it first, plan the sprints inside it afterwards.")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((w) => (
              <li key={w.id} className="bg-surface-panel flex flex-wrap items-center gap-3 rounded-[var(--radius)] p-3">
                {/* R35 — a record never appears without its face. A wave has no
                    picture of its own, so this is its initial. */}
                <RecordMark name={w.name} />
                <div className="min-w-0 flex-1 basis-[12rem]">
                  <InAppLink href={`${basePath}/${w.id}`} className="block truncate text-sm font-medium">
                    {w.name}
                  </InAppLink>
                  <p className="text-muted-foreground truncate text-xs">
                    {[
                      w.accountName,
                      waveDates(w, t, lang),
                      w.sprintCount === 1 ? t("1 sprint") : `${w.sprintCount} ${t("sprints")}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {w.active ? null : <Badge variant="secondary">{t("Switched off")}</Badge>}
                {/* ICON-ONLY, on every width now (client ruling, 2026-08-31:
                    "edit, only the pencil icon") — no more `sm:not-sr-only`
                    reveal. */}
                {canEdit ? (
                  <Button variant="ghost" size="icon" onClick={() => setEditing(w)} aria-label={t("Edit")}>
                    <Pencil className="size-3.5" />
                  </Button>
                ) : null}
                {canEdit && w.active ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive gap-1"
                    onClick={() => setSwitchingOff(w)}
                  >
                    <Power className="size-3.5" aria-hidden />
                    <span className="sr-only sm:not-sr-only">{t("Switch off")}</span>
                  </Button>
                ) : null}
                {canEdit && !w.active ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={() =>
                      void run(
                        () => wavesApi.setActive(w.id, true),
                        t("That didn't save. Try again, and tell us if it keeps happening.")
                      )
                    }
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                    <span className="sr-only sm:not-sr-only">{t("Bring back")}</span>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CollectionCard>

      <WaveFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        clients={clients}
        draftKey={`wave:add:${teamId}`}
        onSubmit={async (v) => {
          await wavesApi.create({ accountId: v.accountId, name: v.name, goal: v.goal || undefined })
          invalidate(wavesKey(teamId))
          toast.success(t("Wave sold."))
        }}
      />

      <WaveFormDialog
        open={editing !== null}
        onOpenChange={(open) => (open ? null : setEditing(null))}
        clients={clients}
        draftKey={editing ? `wave:edit:${editing.id}` : undefined}
        initial={editing ? { name: editing.name, goal: editing.goal ?? "" } : undefined}
        onSubmit={async (v) => {
          if (!editing) return
          await wavesApi.update({ id: editing.id, name: v.name, goal: v.goal || undefined })
          invalidate(wavesKey(teamId))
          invalidate(`activity:record:waves:${editing.id}`)
          toast.success(t("Wave updated."))
        }}
      />

      {/* SWITCHING A WAVE OFF ASKS FIRST — it is the destructive-coloured action
          on this screen, and the record stays (deactivate, never delete), which
          is the sentence the dialog says rather than implies. */}
      <AlertDialog open={switchingOff !== null} onOpenChange={(open) => (open ? null : setSwitchingOff(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Switch this wave off?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("It stops being offered when a sprint is filed, and stays on the record with everything already in it. You can bring it back.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Keep it")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const wave = switchingOff
                setSwitchingOff(null)
                if (wave)
                  void run(
                    () => wavesApi.setActive(wave.id, false),
                    t("That didn't save. Try again, and tell us if it keeps happening.")
                  )
              }}
            >
              {t("Switch it off")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** THE SIDEBAR PAGE. The heading with the door's exact COUNT(*) (R16 — a sidebar
 * page has no tab strip to badge), and the collection under it. */
export function WavesScreen({
  teamId,
  basePath,
}: {
  teamId: string
  basePath: string
}) {
  return <WaveCollection teamId={teamId} basePath={basePath} />
}
