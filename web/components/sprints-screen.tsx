"use client"

// SPRINTS — the blocks of delivery work sold, each covering one app for one
// account. Its own section now (the owner's ruling), where it used to be a strip
// under the backlog: completing a sprint is what cuts a version of every process
// map beneath it, and a consequence that size should not live in somebody's
// peripheral vision.
//
// Completing and reopening live on the SPRINT'S OWN SCREEN rather than as a
// button on every row here — one deliberate place for a deliberate act.
//
// ── THREE VIEWS, ONE READ ────────────────────────────────────────────────────
//
// Overview, Calendar, All sprints. They are NOT three server piles the way the
// tasks screen's six are, and the difference is the collection rather than a
// preference: a sprint is a contract, so this list is BOUNDED and read whole
// (R14), and all three views are three arrangements of the one array already in
// hand. Nothing here fetches a second time.
//
// Which is also why all three tabs carry the SAME badge — the door's exact
// COUNT(*) for the collection (R16). A sprint does not stop existing because
// somebody opened a month grid, and a badge counted off the rows a view happened
// to draw would be a loaded length wearing a total's clothes.

import * as React from "react"

import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { List } from "@kwapso/ui/registry/collections/list/list"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import {
  ScreenRenderer,
  type ScreenActionContext,
  type ScreenIntent,
} from "@kwapso/ui/registry/collections/screen-renderer/screen-renderer"
import type { ScreenRecipe, ScreenRights } from "@kwapso/ui/lib/recipe"

import { CollectionHeading } from "@/components/collection-heading"
// The picture comes from pulse.tsx, which holds the agency shell's ONE lazy
// boundary onto the chart module — a second dynamic() here would be a second
// loader for one library, and the shell is the chunk every page in the app pays
// for. Nothing in this file may import the library's chart module directly; see
// the header of pulse-charts.tsx for the 114 kB that costs.
import { BandCard, SprintBurndownChart } from "@/components/pulse"
import { CountedAbove } from "@/components/counted-tabs"
import { RecordCalendar, type CalendarEntry } from "@/components/record-calendar"
import { SectionWithCreate } from "@/components/deep-link/screen-bits"
import {
  SprintFormDialog,
  sprintTypeName,
  useSprintTypes,
  type SprintFormValues,
  type SprintTypeOption,
} from "@/components/sprint-form-dialog"
import { sprintLine, sprintLineInKindGroup } from "@/components/work-panels"
import { content as contentApi } from "@/lib/api"
import { appsKey, listFetch, sprintsKey } from "@/lib/live-resources"
import { CONCEPT_ICON } from "@/lib/pages"
import { withDataDrivenCollection } from "@/lib/screens"
import type { AppRow, Sprint } from "@shared/types"
import { RecordMark } from "@shared/web/record-mark"
import { formatCount } from "@shared/web/format-count"
import { invalidate, useCached } from "@shared/web/store"
import { useLanguage } from "@shared/web/language"

/* --------------------------- where a sprint is up to ---------------------- */

/** THE THREE STATES, DERIVED. A sprint has no status column, on purpose: the
 * table records two MOMENTS instead — the one it was completed at, and the one
 * it was switched off at — and everything else is arithmetic against today. */
type SprintState = "running" | "upcoming" | "wrapped"

/** Running FIRST, deliberately. The whole point of this view is that what is
 * live right now is the first thing on the screen, before anything that has not
 * started and anything that is over. */
const SPRINT_STATES: SprintState[] = ["running", "upcoming", "wrapped"]

const STATE_HEADING: Record<SprintState, string> = {
  running: "Running now",
  upcoming: "Coming up",
  wrapped: "Wrapped",
}

/** Today, as the day it is where the READER is sitting, in the shape a stored
 * date column already has. Lexical order on YYYY-MM-DD is chronological order,
 * which is why the comparison below is a string compare rather than a parse —
 * and it is the same slice the month grid keys its squares on, so the grouping
 * and the calendar can never disagree about which day today is. */
function todayKey(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function sprintState(s: Sprint, today: string): SprintState {
  // WRAPPED is TWO endings, which is why it is not called "completed": a sprint
  // somebody switched off was cancelled, and it is over too. An overview that
  // quietly dropped those would show fewer sprints than the badge above it
  // counts, so they are here and their own row says which ending it was.
  if (s.completedAt || !s.active) return "wrapped"
  const starts = s.startsOn ? s.startsOn.slice(0, 10) : ""
  // RUNNING is a start day that has arrived, on a sprint nobody has closed. An
  // end date in the past does NOT move it out: work that overran is still the
  // work in front of the team, and a late sprint quietly leaving the screen is
  // the exact thing this view exists to stop.
  if (starts && starts <= today) return "running"
  // Everything else has not begun — including a sprint nobody has dated yet,
  // which is a block that has been agreed and not scheduled. It is still coming,
  // so it sits with the rest of what is coming rather than in a fourth pile
  // nobody asked for.
  return "upcoming"
}

/* ------------------------------ kinds and marks --------------------------- */

/** ONE KIND'S ROWS inside one state: the mark somebody recognises the kind by,
 * the WORD that always travels with it (UI-CONVENTIONS §5 — a type mark is never
 * alone and never inside a sentence), and the sprints filed under it. */
type KindGroup = { key: string; word: string; mark: string | null; sprints: Sprint[] }

function groupByKind(
  sprints: Sprint[],
  kinds: Map<string, SprintTypeOption>,
  lang: string,
  noKind: string
): KindGroup[] {
  const groups = new Map<string, KindGroup>()
  for (const s of sprints) {
    const key = s.sprintType ?? ""
    let group = groups.get(key)
    if (!group) {
      // A kind the team has since RETIRED is no longer in the vocabulary, so it
      // carries no mark and its own word is the honest label — the same courtesy
      // a retired ticket type gets. A sprint nobody typed a kind on says that
      // rather than sitting under a blank heading.
      const option = kinds.get(key)
      group = {
        key,
        word: option ? sprintTypeName(option, lang) : key || noKind,
        mark: option?.mark ?? null,
        sprints: [],
      }
      groups.set(key, group)
    }
    group.sprints.push(s)
  }
  return [...groups.values()]
}

/** WHICH ENDING, on a row that has one. "Wrapped" holds both a sprint somebody
 * completed and a sprint somebody cancelled, and a row that said neither would
 * read as delivered work either way. Completed wins when a record carries both,
 * exactly as `sprintState` reads them: a block that was delivered and later
 * switched off was still delivered. A sprint still to run needs no badge — its
 * heading already said where it is. */
function endingBadge(s: Sprint, t: (english: string) => string): React.ReactNode {
  if (s.completedAt) return <Badge variant="secondary">{t("Complete")}</Badge>
  if (!s.active) return <Badge variant="outline">{t("Cancelled")}</Badge>
  return undefined
}

/** WHAT SITS AT THE END OF AN OVERVIEW ROW: how much of the sprint is done, and
 * the badge if it has stopped.
 *
 * "3 of 11 done" used to be the fifth fact on the row's summary sentence, where
 * it read as prose and had to be decoded a row at a time. It is a NUMBER, and T4
 * says a number goes in the trailing slot in `tabular-nums` so a column of them
 * lines up and can be compared without reading any of them. The two states are
 * mutually exclusive with each other and nearly always absent, so on a running
 * sprint this slot holds exactly one thing. */
function progressTrailing(s: Sprint, t: (english: string) => string): React.ReactNode {
  const badge = endingBadge(s, t)
  const done = s.storyCount - s.openStoryCount
  if (s.storyCount === 0) return badge
  return (
    <span className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs tabular-nums">
        {done} {t("of")} {s.storyCount} {t("done")}
      </span>
      {badge}
    </span>
  )
}

/* --------------------------------- the rows -------------------------------- */

/** One sprint, as a row. Everything a person would say about one out loud. */
function shapeSprints(sprints: Sprint[], today: string) {
  return {
    rows: sprints.map((s) => ({
      id: s.id,
      name: s.ref ? `${s.ref} · ${s.name}` : s.name,
      detail: sprintLine(s),
      // Facet columns (read by the filter engine, not the renderer). The status
      // facet says the SAME three words the Overview groups under, so narrowing
      // this list and reading that one are one question asked twice rather than
      // two vocabularies for one idea.
      account: s.accountName ?? "No client",
      app: s.appName ?? "No app",
      state: STATE_HEADING[sprintState(s, today)],
    })),
  }
}

/** Start a sprint through the door and re-read what changed. Shared with the
 * app's own screen, which can start one for itself. */
export async function createSprintFrom(
  teamId: string,
  values: SprintFormValues,
  /** The caller's language — see `createAppFrom`. */
  t: (english: string) => string
): Promise<void> {
  await contentApi.createSprint({
    name: values.name,
    goal: values.goal || undefined,
    sprintType: values.sprintType || undefined,
    accountId: values.accountId || undefined,
    appId: values.appId || undefined,
    startsOn: values.startsOn || undefined,
    endsOn: values.endsOn || undefined,
    soldPriceCents: values.soldPriceCents,
    currency: values.currency || undefined,
  })
  invalidate(sprintsKey(teamId))
  toast.success(t("Sprint started."))
}

export function SprintsScreen({
  teamId,
  recipe,
  rights,
  total,
  canCreate,
  onAction,
  onIntent,
}: {
  teamId: string
  recipe: ScreenRecipe
  rights: ScreenRights
  /** the exact server total (R16) — never the loaded list's length */
  total: number | undefined
  canCreate: boolean
  onAction: (actionId: string, ctx: ScreenActionContext) => void
  onIntent: (intent: ScreenIntent) => void
}) {
  const { t, lang } = useLanguage()
  const sprintsQ = useCached<Sprint[]>(sprintsKey(teamId), () => listFetch.sprints(teamId))
  // The apps a sprint can cover. Bounded and already held by three other screens,
  // so opening this one costs nothing extra.
  const appsQ = useCached<AppRow[]>(appsKey(teamId), () => listFetch.apps(teamId))
  // The team's own sprint-type vocabulary — where a kind's MARK comes from. The
  // same cache the start-a-sprint form reads, so the picker and these rows can
  // never show two different pictures for one word.
  const kinds = useSprintTypes(teamId)
  const [view, setView] = React.useState("overview")
  const [addOpen, setAddOpen] = React.useState(false)

  if (sprintsQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the sprints.")}</p>
  if (sprintsQ.data === undefined) return <Skeleton variant="list" lines={4} />

  const sprints = sprintsQ.data
  const today = todayKey()
  const byKind = new Map(kinds.map((k) => [k.value, k]))
  const data = shapeSprints(sprints, today)
  const listRecipe = withDataDrivenCollection(recipe, data.rows)

  // R16: ONE number, on all three tabs, and it is the door's exact COUNT(*) —
  // see the note at the top of this file for why three views of one bounded
  // collection do not get three different counts.
  const badge = formatCount(total)
  const tabsConfig = {
    ...defaultTabsConfig,
    variant: "line" as const,
    tabs: [
      {
        value: "overview",
        label: t("Overview"),
        icon: CONCEPT_ICON.overview,
        badge,
        badgeVariant: "" as const,
      },
      { value: "calendar", label: t("Calendar"), icon: "calendar", badge, badgeVariant: "" as const },
      { value: "all", label: t("All sprints"), icon: "list", badge, badgeVariant: "" as const },
    ],
  }

  // THE CALENDAR — the host's own (components/record-calendar.tsx), given the
  // same rows. It is SINGLE-DATE: one day, one square, so it cannot draw the span
  // between a sprint's start and its end. A sprint therefore sits on the day it
  // STARTS, which is the date a team actually plans around; both dates are still
  // on the row's own line everywhere else, and on the agenda's second line here.
  // A sprint nobody has given a start date is left off rather than parked on a
  // day it has no claim to, and the kind colour-codes the entry — the one thing
  // you can read from across a room.
  //
  // AND EVERY ONE OF THEM OPENS, by the same `open` intent the overview list
  // below already fires: a calendar is a way IN to sprints, not a picture of them.
  const calendarEntries: CalendarEntry[] = sprints
    .filter((s) => s.startsOn)
    .map((s) => ({
      id: s.id,
      day: (s.startsOn as string).slice(0, 10),
      title: s.ref ? `${s.ref} · ${s.name}` : s.name,
      accent: s.sprintType ?? "",
      detail: sprintLine(s),
    }))

  // THE OVERVIEW — state first, kind second. Two levels because the two
  // questions a person opens this page with are "what is live?" and "what kind
  // of work are we selling?", and answering them in that order puts the running
  // blocks at the top of the screen every time.
  // HOW FULL THE RUNNING BLOCKS ARE — a stacked bar per live sprint, done under
  // open. Free: `storyCount` and `openStoryCount` are exact server counts already
  // on every row (the collection is bounded and read whole), so this costs no
  // request and no new door. It is the one thing the list underneath cannot show
  // at a glance — "3 of 11 done" reads the same on a sprint that is nearly
  // finished and one that has barely started, until you do the arithmetic on
  // every line.
  //
  // ONLY THE RUNNING ONES, and only where there is work to show. A chart of
  // wrapped sprints is history nobody is deciding anything from, and a row of
  // empty columns is a picture of nothing.
  const burndown = sprints
    .filter((s) => sprintState(s, today) === "running" && s.storyCount > 0)
    .map((s) => ({
      label: s.ref ?? s.name,
      done: s.storyCount - s.openStoryCount,
      open: s.openStoryCount,
    }))

  const overview = (
    <div className="flex flex-col gap-10">
      {sprints.length === 0 && <p className="text-muted-foreground text-sm">{t("No sprints yet.")}</p>}
      {SPRINT_STATES.map((state) => {
        const inState = sprints.filter((s) => sprintState(s, today) === state)
        if (inState.length === 0) return null
        return (
          <section key={state} className="flex flex-col gap-4">
            {/* K6: a plain state heading — no chip, no rule and no count of its
                own. The collection's one number is on the strip above (R16). */}
            <h2 className="text-lg font-medium">{t(STATE_HEADING[state])}</h2>
            {groupByKind(inState, byKind, lang, t("No kind said")).map((group) => (
              <div key={group.key} className="flex flex-col gap-2">
                <p className="text-muted-foreground text-xs font-medium tracking-[0.5px] uppercase">
                  {group.word}
                </p>
                <List
                  surface="none"
                  items={group.sprints.map((s) => ({
                    id: s.id,
                    leading: group.mark ? <RecordMark mark={group.mark} /> : undefined,
                    title: s.ref ? `${s.ref} · ${s.name}` : s.name,
                    // The kind is the heading above; how much is done is the
                    // number on the right. What is left is the three facts a
                    // status line may carry (D5): whose, which app, and when.
                    subtitle: sprintLineInKindGroup(s),
                    trailing: progressTrailing(s, t),
                  }))}
                  onItemClick={(item) => onIntent({ kind: "open", module: "sprints", id: item.id })}
                />
              </div>
            ))}
          </section>
        )
      })}

      {/* HOW FULL THE RUNNING BLOCKS ARE — UNDER the groups, not above them.
          It was the first thing on the screen, which put a chart between the
          heading and the first sprint and made this the fifth block a reader
          crossed before reaching the list they came for (N2). It is a picture
          OF the rows below it, so it reads perfectly well after them, and the
          person who came to find a sprint finds one first. */}
      {burndown.length > 0 && (
        <BandCard title={t("Work inside the running sprints")}>
          <SprintBurndownChart rows={burndown} doneLabel={t("Done")} openLabel={t("Still open")} />
        </BandCard>
      )}
    </div>
  )

  return (
    <CountedAbove active={badge !== ""}>
      <div className="flex flex-col gap-6">
        {/* R16: the strip below badges all three views, so the heading stands
            down through the arbitration context rather than saying the same
            number twice. */}
        <CollectionHeading sectionKey="sprints" total={total} />

        <SectionWithCreate
          show={canCreate}
          label={t("Start a sprint")}
          icon="plus"
          onCreate={() => setAddOpen(true)}
          // The view strip scopes what the collection card shows, so it sits
          // above the card rather than inside it.
          aboveCard={<TabsView config={tabsConfig} value={view} onValueChange={setView} />}
        >
          {view === "overview" ? (
            overview
          ) : view === "calendar" ? (
            <RecordCalendar
              entries={calendarEntries}
              onOpen={(id) => onIntent({ kind: "open", module: "sprints", id })}
              emptyText={t("No sprints start this month.")}
            />
          ) : (
            // ALL SPRINTS — the engine's own flat list, with the search and the
            // Client / App / Status filters the recipe declares. Its rows carry
            // no mark: the renderer maps a row to a title and a subtitle and has
            // no leading slot to put one in, and a mark pushed into the title
            // string would be a pictograph inside a sentence, which is the one
            // shape UI-CONVENTIONS §5 refuses. The kind is still the first word
            // of every row's summary line, so nothing is lost but the picture.
            <ScreenRenderer
              recipe={listRecipe}
              data={data}
              rights={rights}
              onAction={onAction}
              onIntent={onIntent}
            />
          )}
        </SectionWithCreate>

        {/* R14: BOUNDED, not paged — a sprint is a contract, so this collection
            grows at the speed of signatures and the door's cap is an honest answer
            rather than an eventual refusal. No <LoadMore>, on purpose. */}

        <SprintFormDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          apps={(appsQ.data ?? []).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
          draftKey={`sprint:add:${teamId}`}
          onSubmit={(v) => createSprintFrom(teamId, v, t)}
        />
      </div>
    </CountedAbove>
  )
}
