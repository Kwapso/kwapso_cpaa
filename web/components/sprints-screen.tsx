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

import { Badge } from "@shared/ui/components/badge/badge"
import { List } from "@shared/web/list-compat"
import { SearchInput } from "@shared/ui/components/search-input/search-input"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { toast } from "@shared/ui/components/sonner/sonner"
import { defaultTabsConfig } from "@shared/web/screen-engine/tabs-view"
import { FilterBar } from "@shared/web/screen-engine/filter-bar"
import { useRemembered } from "@shared/web/remembered"
import {
  ScreenRenderer,
  type ScreenActionContext,
  type ScreenIntent,
} from "@shared/web/screen-engine/screen-renderer"
import type { FilterFacet } from "@shared/web/screen-engine/config"
import type { ScreenRecipe, ScreenRights } from "@shared/web/screen-engine/recipe"

import { CollectionHeading } from "@/components/collection-heading"
// The picture comes from pulse.tsx, which holds the agency shell's ONE lazy
// boundary onto the chart module — a second dynamic() here would be a second
// loader for one library, and the shell is the chunk every page in the app pays
// for. Nothing in this file may import the library's chart module directly; see
// the header of pulse-charts.tsx for the 114 kB that costs.
import { BandCard, SprintBurndownChart } from "@/components/pulse"
import { CountedAbove } from "@/components/counted-tabs"
import { RecordCalendar, type CalendarEntry } from "@/components/record-calendar"
import { EmptyLine, SectionWithCreate, AddButton, ToolbarRow } from "@/components/deep-link/screen-bits"
import {
  SprintFormDialog,
  sprintTypeName,
  useSprintTypes,
  type SprintFormValues,
  type SprintTypeOption,
} from "@/components/sprint-form-dialog"
import { sprintLine, sprintLineInKindGroup } from "@/components/work-panels"
import { content as contentApi, tenancy } from "@/lib/api"
import { appsKey, listFetch, sprintsKey } from "@/lib/live-resources"
import { CONCEPT_ICON } from "@/lib/pages"
import { withDataDrivenCollection } from "@/lib/screens"
import type { AppRow, SelectableValue, Sprint } from "@shared/types"
import { RecordMark } from "@shared/web/record-mark"
import { type Translate } from "@shared/web/format"
import { formatCount } from "@shared/web/format-count"
import { invalidate, useCached } from "@shared/web/store"
import { MARK_GROUP, markMap } from "@/lib/type-marks"
import { useLanguage } from "@shared/web/language"
import type { Language } from "@shared/i18n"

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
function endingBadge(s: Sprint, t: Translate): React.ReactNode {
  if (s.completedAt) return <Badge variant="secondary">{t("Complete")}</Badge>
  if (!s.active) return <Badge variant="secondary">{t("Cancelled")}</Badge>
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
function progressTrailing(s: Sprint, t: Translate): React.ReactNode {
  const badge = endingBadge(s, t)
  const done = s.storyCount - s.openStoryCount
  if (s.storyCount === 0) return badge
  return (
    <span className="flex items-center gap-2">
      {/* ONE ENTRY WITH TWO HOLES (R28). It read `{done} {t("of")} {n} {t("done")}`,
          and `of` is two lowercase letters — which the extractor refuses as a
          non-sentence, so it was in no catalogue and every reader in every
          language got the English word in the middle of their own. Word order
          is the second half of the argument: a translator cannot move a
          fragment past a number that is not theirs to move. */}
      <span className="text-muted-foreground text-xs tabular-nums">
        {t("{done} of {total} done", { done, total: s.storyCount })}
      </span>
      {badge}
    </span>
  )
}

/* ------------------ search + filter (narrowing within the groups) --------- */
//
// Overview and Calendar are bespoke bodies (a grouped list, a month grid) that
// never touch `ScreenRenderer`/`CollectionFrame` — so, unlike the "All sprints"
// tab, neither ever got a search box or a filter. Bounded, client-side,
// deliberately (R14's other half — see wave-finder.tsx's own header for the
// argument): a sprint is a contract, the collection is read whole already, and
// everything that can match is already in front of us.
//
// ONE QUESTION, SHARED BY BOTH TABS — narrowing the same array the state/kind
// groups and the calendar squares are both drawn from, so a search typed on one
// tab is still narrowing when you flip to the other.

type SprintQuery = { q: string; state: SprintState | ""; kind: string }

const EMPTY_SPRINT_QUERY: SprintQuery = { q: "", state: "", kind: "" }

function sprintQueryIsActive(query: SprintQuery): boolean {
  return query.q.trim() !== "" || query.state !== "" || query.kind !== ""
}

/** SEARCH (name/app), then the two facets the view already groups by — state
 * and kind — over the whole bounded collection. */
function selectSprints(sprints: Sprint[], query: SprintQuery, today: string): Sprint[] {
  const needle = query.q.trim().toLowerCase()
  return sprints.filter((s) => {
    if (query.state && sprintState(s, today) !== query.state) return false
    if (query.kind && (s.sprintType ?? "") !== query.kind) return false
    if (!needle) return true
    return [s.name, s.appName ?? "", s.ref ?? ""].some((v) => v.toLowerCase().includes(needle))
  })
}

/** THE KIND FILTER'S OWN VOCABULARY — every kind actually IN the collection,
 * worded exactly as `groupByKind` words its own headings, so the filter offers
 * nothing the grouping itself would not show. Off the WHOLE collection, not the
 * narrowed one, so picking a kind can never make the option that picked it
 * disappear. */
function sprintKindOptions(
  sprints: Sprint[],
  kinds: Map<string, SprintTypeOption>,
  lang: string,
  noKind: string
): { value: string; label: string }[] {
  const words = new Map<string, string>()
  for (const s of sprints) {
    const key = s.sprintType ?? ""
    if (words.has(key)) continue
    const option = kinds.get(key)
    words.set(key, option ? sprintTypeName(option, lang) : key || noKind)
  }
  return [...words.entries()].map(([value, label]) => ({ value, label }))
}

/* --------------------------------- the rows -------------------------------- */

/** One sprint, as a row. Everything a person would say about one out loud.
 *
 * `marks` is the SPRINT TYPE's glyph, keyed by the word the row stores. The
 * Overview view has drawn it since v0.11.0 and this list did not, so the same
 * sprint led with a picture under one tab and with text under the next. */
function shapeSprints(sprints: Sprint[], today: string, lang: Language, marks?: Map<string, string>) {
  return {
    rows: sprints.map((s) => ({
      id: s.id,
      // THE GLYPH THE ROW IS KNOWN BY (recipe `leading`). A NODE, not a string.
      mark: <RecordMark mark={marks?.get(s.sprintType ?? "") ?? null} name={s.sprintType ?? "?"} />,
      name: s.ref ? `${s.ref} · ${s.name}` : s.name,
      detail: sprintLine(s, lang),
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
  // The SAME cache key `useSprintTypes` reads, so this is free — it wants the
  // raw rows rather than the sprint-type projection, because the state glyphs
  // live in a different group of the same vocabulary.
  const selectableQ = useCached<SelectableValue[]>(`selectable:${teamId}`, () =>
    tenancy.selectable().then((r) => r.values)
  )
  // Remembered with the screen — see web/lib/nav-memory.ts.
  const [view, setView] = useRemembered("view", "overview")
  // ONE search+filter question, shared by Overview and Calendar (see the note
  // above `selectSprints`) — `find`, the same slot name `<PagedFind>`/
  // `WaveFinder` remember their own question under, so this reads as the same
  // kind of state everywhere it appears.
  const [sprintQuery, setSprintQuery] = useRemembered<SprintQuery>("find", EMPTY_SPRINT_QUERY, (found) => {
    if (!found || typeof found !== "object") return undefined
    const was = found as Record<string, unknown>
    return {
      q: typeof was.q === "string" ? was.q : "",
      state: (SPRINT_STATES as string[]).includes(was.state as string)
        ? (was.state as SprintState)
        : "",
      // Not validated against today's kinds (unlike `state`, a closed
      // three-word vocabulary): the team's sprint-type list is a cached read
      // that may not have arrived yet at this hook's first render, and a kind
      // retired since simply matches nothing — a degraded answer, never a
      // wrong one, the same tradeoff `waves-screen.tsx` makes for its own
      // account filter.
      kind: typeof was.kind === "string" ? was.kind : "",
    }
  })
  const [addOpen, setAddOpen] = React.useState(false)

  if (sprintsQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the sprints.")}</p>
  if (sprintsQ.data === undefined) return <Skeleton variant="list" lines={4} />

  const sprints = sprintsQ.data
  const today = todayKey()
  const byKind = new Map(kinds.map((k) => [k.value, k]))
  // The same map the Overview groups read, in the shape `RecordMark` wants.
  const kindMarks = new Map(kinds.filter((k) => k.mark).map((k) => [k.value, k.mark as string]))
  // The glyph for the STATE a sprint is in, keyed by the heading word itself —
  // which is why the vocabulary holds exactly the three `STATE_HEADING` words.
  const stateMarks = markMap(selectableQ.data, MARK_GROUP.sprintStatus)
  const data = shapeSprints(sprints, today, lang, kindMarks)
  const listRecipe = withDataDrivenCollection(recipe, data.rows)

  // OVERVIEW AND CALENDAR BOTH DRAW FROM THIS, narrowed but never re-fetched —
  // see the header note above `selectSprints`.
  const narrowedSprints = selectSprints(sprints, sprintQuery, today)
  const askingSprints = sprintQueryIsActive(sprintQuery)
  const sprintFacets: FilterFacet[] = [
    {
      field: "state",
      // SAME WORD the "All sprints" tab's own filter uses for this column
      // (screens.ts's `sprintsListRecipe`) — one vocabulary for one idea (R34).
      label: t("Status"),
      control: "select",
      options: SPRINT_STATES.map((st) => ({ value: st, label: t(STATE_HEADING[st]) })),
    },
    {
      field: "kind",
      // SAME WORD the sprint form's own field uses for this column
      // (sprint-form-dialog.tsx's `typeField`).
      label: t("Type"),
      control: "select",
      options: sprintKindOptions(sprints, byKind, lang, t("No type said")),
    },
  ]
  // THE TOOLBAR ITSELF, shared by both bespoke tabs. Only where there is
  // something to search — a box over an empty collection cannot do anything,
  // so an empty sprints list falls back to the bare button-only toolbar it
  // always had (the same gate `waves-screen.tsx` puts on its own finder).
  const sprintToolbar =
    sprints.length > 0 ? (
      <div className="flex flex-col gap-3">
        <ToolbarRow
          search={
            <SearchInput
              value={sprintQuery.q}
              onChange={(e) => setSprintQuery((q) => ({ ...q, q: e.currentTarget.value }))}
              onClear={() => setSprintQuery((q) => ({ ...q, q: "" }))}
              // SAME PLACEHOLDER the "All sprints" tab's own search box uses
              // (screens.ts's `sprintsListRecipe`) — one search box in one
              // collection's words, wherever it appears.
              placeholder={t("Search sprints…")}
              className="w-56"
            />
          }
          actions={canCreate && <AddButton label={t("Start a sprint")} onClick={() => setAddOpen(true)} />}
        />
        <FilterBar
          facets={sprintFacets}
          values={{ state: sprintQuery.state, kind: sprintQuery.kind }}
          // Empty on purpose: both facets carry their own options above,
          // derived off the WHOLE collection rather than the narrowed one —
          // see `sprintKindOptions`'s own note on why.
          data={[]}
          onChange={(field, value) => setSprintQuery((q) => ({ ...q, [field]: value }))}
          onClearFacets={() => setSprintQuery((q) => ({ ...q, state: "", kind: "" }))}
          resultCount={narrowedSprints.length}
        />
      </div>
    ) : (
      canCreate && <ToolbarRow actions={<AddButton label={t("Start a sprint")} onClick={() => setAddOpen(true)} />} />
    )

  // R16: ONE number, on all three tabs, and it is the door's exact COUNT(*) —
  // see the note at the top of this file for why three views of one bounded
  // collection do not get three different counts.
  const badge = formatCount(total)
  const tabsConfig = {
    ...defaultTabsConfig,
    variant: "folder" as const,
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
  //
  // NARROWED, the same question the toolbar above draws (`selectSprints`) — a
  // search or a state/kind filter typed on this tab or the Overview one narrows
  // which sprints the calendar draws squares for, not just which ones the
  // grouped list shows.
  const calendarEntries: CalendarEntry[] = narrowedSprints
    .filter((s) => s.startsOn)
    .map((s) => ({
      id: s.id,
      day: (s.startsOn as string).slice(0, 10),
      title: s.ref ? `${s.ref} · ${s.name}` : s.name,
      accent: s.sprintType ?? "",
      detail: sprintLine(s, lang),
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
  //
  // NARROWED, same reason as the calendar above: it is a picture OF the rows
  // in the grouped list, so a search that narrows those rows narrows the chart
  // under them too.
  const burndown = narrowedSprints
    .filter((s) => sprintState(s, today) === "running" && s.storyCount > 0)
    .map((s) => ({
      label: s.ref ?? s.name,
      done: s.storyCount - s.openStoryCount,
      open: s.openStoryCount,
    }))

  const overview = (
    <div className="flex flex-col gap-12">
      {sprints.length === 0 && <EmptyLine concept="sprints">{t("No sprints yet.")}</EmptyLine>}
      {/* NOTHING MATCHED is a different, and truer, sentence than "no sprints
          yet" once a search or a filter is on — see the identical split
          `<PagedFind>`'s own `emptyText` makes for a paged collection. Every
          state section below is already keyed off `narrowedSprints`, so an
          active question with no matches leaves every one of them null and
          this is the only line left to say why the screen is blank. */}
      {sprints.length > 0 && askingSprints && narrowedSprints.length === 0 && (
        <EmptyLine concept="sprints">{t("Nothing matched.")}</EmptyLine>
      )}
      {SPRINT_STATES.map((state) => {
        const inState = narrowedSprints.filter((s) => sprintState(s, today) === state)
        if (inState.length === 0) return null
        return (
          <section key={state} className="flex flex-col gap-4">
            {/* K6: a plain state heading — no chip, no rule and no count of its
                own. The collection's one number is on the strip above (R16). */}
            <h2 className="flex items-center gap-2 text-lg font-medium">
                  {/* AURORA'S ASK: a mark on the state, not the bare word. It is
                      `aria-hidden` with the heading right beside it — the pair
                      UI-CONVENTIONS §5 requires — and it comes from the Dropdown
                      values screen, so changing it is two clicks and no deploy. */}
                  {stateMarks.get(STATE_HEADING[state]) && (
                    <span aria-hidden className="text-base leading-none">
                      {stateMarks.get(STATE_HEADING[state])}
                    </span>
                  )}
                  {t(STATE_HEADING[state])}
                </h2>
            {groupByKind(inState, byKind, lang, t("No type said")).map((group) => (
              <div key={group.key} className="flex flex-col gap-2">
                <p className="text-muted-foreground text-micro uppercase">
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
                    subtitle: sprintLineInKindGroup(s, lang),
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
          // above the card rather than inside it. TABS ALONE now (client
          // ruling, 2026-08-31, correcting the earlier fix that shared this
          // row with "Start a sprint") — see the button below instead.
          folderTabs={{ config: tabsConfig, value: view, onValueChange: setView }}
          // KIT PANEL ONLY ON THE "ALL SPRINTS" TAB. Overview and Calendar are
          // bespoke bodies (a grouped list, a month grid) that never touch
          // `CollectionFrame` at all — there is no toolbar and no create-button
          // context for the kit panel to draw there, so turning this on for
          // every tab would strip their `CollectionCard` box on two of three
          // views and leave them with no box and no create button at all. Only
          // the "all" tab renders through `ScreenRenderer`, so only that tab
          // gets the kit panel, matched below.
          useKitPanel={view === "all"}
        >
          {view === "overview" ? (
            <div className="flex flex-col gap-4">
              {/* THE TOOLBAR, carrying real search + filter now (by name/app,
                  by state, by kind) rather than only the button — Overview and
                  Calendar are bespoke bodies that never touch `CollectionFrame`,
                  so this is their own toolbar rather than the kit panel's (see
                  `sprintToolbar`'s own note). The button still lives below the
                  tabs rather than beside them (client ruling, 2026-08-31). */}
              {sprintToolbar}
              {overview}
            </div>
          ) : view === "calendar" ? (
            <div className="flex flex-col gap-4">
              {sprintToolbar}
              <RecordCalendar
                entries={calendarEntries}
                onOpen={(id) => onIntent({ kind: "open", module: "sprints", id })}
                emptyText={
                  askingSprints && narrowedSprints.length === 0
                    ? t("Nothing matched.")
                    : t("No sprints start this month.")
                }
              />
            </div>
          ) : (
            // ALL SPRINTS — the engine's own flat list, with the search and the
            // Client / App / Status filters the recipe declares. Its rows carry
            // the sprint type's mark in the leading slot, the same glyph the
            // Overview groups lead with. (This note used to say the renderer had
            // no leading slot to put one in. That stopped being true in library
            // v0.11.0, and the sentence outlived the fact by a release — which is
            // the failure mode UI-GAPS.md's own rot checks exist to catch.)
            <ScreenRenderer
              recipe={listRecipe}
              data={data}
              rights={rights}
              onAction={onAction}
              onIntent={onIntent}
              useKitPanel
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
