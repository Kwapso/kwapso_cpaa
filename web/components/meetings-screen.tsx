"use client"

// THE MEETINGS LIST — every conversation we have had or are about to have, newest first.
//
// ONE COLLECTION, PAGED (R14). A meeting is an event: the rows accumulate with
// ordinary use and none is ever curated away, because a cancelled call in March
// is still the answer to "didn't we speak in March?". So the door hands back a
// page and a cursor, and Load more appends — the same shape Tickets and the
// knowledge base have.
//
// The heading carries the exact server COUNT(*) (R16) because a sidebar page has
// no tab strip to badge; the arbitration context makes sure only one of the two
// ever renders it.
//
// AND IT IS WHERE MEETING PURPOSES ARE REACHED FROM. The taxonomy of why we meet
// used to sit under the Delivery method page; that page went on 17 Aug 2026 with
// its programmes folded onto the sprint type, and a purpose belongs beside the
// meetings list rather than on a rail of its own — it is the vocabulary behind this
// screen, not a second destination.

import * as React from "react"

import { Button } from "@shared/ui/controls/button/button"
import { Skeleton } from "@shared/ui/controls/skeleton/skeleton"
import { Spinner } from "@shared/ui/controls/spinner/spinner"
import { CalendarSync } from "@shared/ui/icons"
import { TabsView, defaultTabsConfig } from "@shared/web/screen-engine/tabs-view"
import { toast } from "@shared/ui/controls/sonner/sonner"
import {
  ScreenRenderer,
  type ScreenActionContext,
  type ScreenIntent,
} from "@shared/web/screen-engine/screen-renderer"
import type { ScreenRecipe, ScreenRights } from "@shared/web/screen-engine/recipe"
import type { CollectionConfig } from "@shared/web/screen-engine/config"

import { CollectionHeading } from "@/components/collection-heading"
import { GoogleSyncButton } from "@/components/google-sync"
import { CountedAbove } from "@/components/counted-tabs"
import { SectionWithCreate } from "@/components/deep-link/screen-bits"
import { LoadMore } from "@/components/load-more"
import { PagedFind } from "@/components/paged-find"
import { COLLECTION_SORTS, translatedSorts } from "@/lib/collection-sorts"
import { translatedFacets } from "@/lib/collection-filters"
import { MeetingFormDialog, type MeetingFormValues } from "@/components/meeting-form-dialog"
import { RecordCalendar, type CalendarEntry } from "@/components/record-calendar"
import { RecordTable, visibleActions } from "@/components/record-table"
import { shapeMeetingsList } from "@/components/deep-link/shape"
import { ApiFailure, content as contentApi, tenancy } from "@/lib/api"
import { appsKey, listFetch, meetingsKey, meetingsMonthKey, totalKey } from "@/lib/live-resources"
import { field, translateFields, withDataDrivenCollection } from "@/lib/screens"
import { usePermissions } from "@/lib/perms"
import { useGoogleCatchUp } from "@/lib/use-google-catch-up"
import type { Account, AppRow, Meeting, MeetingPurpose } from "@shared/types"
import { invalidate, useCached, useCachedValue } from "@shared/web/store"
import { formatCount } from "@shared/web/format-count"
import { formatDate, formatTime } from "@shared/web/format"
import { useT } from "@shared/web/language"

/* THE "EARLIER NOT LOADED" NOTICE IS GONE, and its absence is the fix.
 *
 * It said: "Earlier meetings haven't been loaded yet, so this month may not be
 * the whole of it", under a calendar drawing whatever the paged prefix happened
 * to hold. That was an honest apology for a real limitation — and the limitation
 * has been removed rather than explained. The calendar asks the DOOR for the
 * month it is showing (`meetingsMonthKey` / `listFetch.meetingsMonth`), so the
 * month on screen IS the whole of it and the sentence would now be false.
 *
 * A caveat left standing over a screen that no longer needs one teaches a person
 * to distrust a correct answer, which costs more than the sentence ever bought.
 */


/** WHAT "ALL" SHOWS (CHECKLIST 9.1: "all, with far more columns"). The two-field
 * list is for scanning; this is the one somebody reads across.
 *
 * SIX COLUMNS, NOT NINE. "Every fact a meeting row can state" was the brief and
 * nine columns was the result — the widest table in either front door, against
 * N1's table budget of six. A table's column header does the labelling, which is
 * why it gets six where a list row gets four; past that the row stops being
 * scannable and becomes something you read, which is what the record is for.
 *
 * The three that went: `Why we met` and `Notes` are prose, and prose in a table
 * cell is a truncated sentence nobody can read either way; `Reference` already
 * rides the record's own eyebrow (D4), so it was the same string in two places.
 * All three are on the meeting, one click from the row they were crowding. */
const ALL_COLUMNS = [
  field("name", "Meeting"),
  field("when", "When"),
  field("client", "Client"),
  field("app", "App"),
  field("where", "Where"),
  field("state", "Status"),
]

/** WHAT THE DOOR CALLS EACH OF THOSE COLUMNS.
 *
 * The meetings list PAGES, so a column header orders it at the door or it does not order
 * it at all — arranging the fifty rows in the browser under a badge counting 254
 * is the lie `<PagedFind>` exists to stop, one control along (SEARCH.md § *The
 * third question*). So a header sends a NAME out of `MEETING_SORTS`, and the two
 * columns the door has no name for — App and Where — draw a plain header. A
 * header that cannot order is honest; one that looks like it can and does not is
 * the defect this whole lane is about.
 *
 * Hand-paired because it is a translation between two vocabularies (a shaped
 * row's column, and the door's menu name); the DIRECTION is not, it is read off
 * `COLLECTION_SORTS` so a header cannot land differently from the picker above
 * it offering the same order. */
const COLUMN_SORT: Record<string, string> = {
  name: "title",
  when: "when",
  client: "client",
  state: "status",
}
const ALL_COLUMN_HEADERS = ALL_COLUMNS.map((f) => {
  const sort = COLUMN_SORT[f.column]
  return {
    key: f.column,
    label: f.field.label,
    sort,
    defaultDir: COLLECTION_SORTS.meetings.options.find((o) => o.value === sort)?.defaultDir,
  }
})

export function MeetingsScreen({
  teamId,
  recipe,
  rights,
  total,
  purposeCount,
  canCreate,
  canReadPurposes,
  onPurposes,
  onAction,
  onIntent,
}: {
  teamId: string
  recipe: ScreenRecipe
  rights: ScreenRights
  /** the exact server total (R16) — never the loaded page's length */
  total: number | undefined
  /** the exact server total of the MEETING PURPOSES, for the link below */
  purposeCount: number | undefined
  canCreate: boolean
  /** `delivery:read` — the right the purposes screen itself gates on. */
  canReadPurposes: boolean
  onPurposes: () => void
  onAction: (actionId: string, ctx: ScreenActionContext) => void
  onIntent: (intent: ScreenIntent) => void
}) {
  const t = useT()
  const meetingsQ = useCached<Meeting[]>(meetingsKey(teamId), () => listFetch.meetings(teamId))
  // The two pickers the form needs. Both are read only when the dialog can be
  // opened at all — a person who cannot create a meeting has no use for either.
  const accountsQ = useCached<Account[]>(canCreate ? `accounts:${teamId}` : null, () =>
    tenancy.accounts().then((r) => r.accounts)
  )
  // WHICH SYSTEM A MEETING WAS ABOUT. Same condition as the accounts above, and
  // out of the SAME bounded cache the apps page holds — an agency has tens of
  // apps, so the picker costs nothing anybody has not already paid.
  const appsQ = useCached<AppRow[]>(canCreate ? appsKey(teamId) : null, () => listFetch.apps(teamId))
  // The purposes are read whenever this screen can offer them at all — the form
  // picker needs them, and so does the count on the link below.
  const purposesQ = useCached<MeetingPurpose[]>(canCreate || canReadPurposes ? `purposes:${teamId}` : null, () =>
    listFetch.purposes(teamId)
  )
  const [open, setOpen] = React.useState(false)
  // THE THREE VIEWS (CHECKLIST 9.1). This week is past AND upcoming, because
  // "this week" is the week somebody is in rather than the days left of it; the
  // calendar is the library's month grid over the same rows; and All shows far
  // more columns, which is what makes it worth being a separate view at all.
  const [view, setView] = React.useState<"week" | "calendar" | "all">("week")
  const weekTotal = useCachedValue<number>(totalKey("meetings-week", teamId))
  // THIS WEEK IS ITS OWN READ (19 Aug 2026) — the door's week, not a browser
  // filter over the meetings list's newest page. The comment that used to sit on that
  // filter argued the week was inside page one for any agency that had not held
  // fifty meetings since Monday; the meetings list is ordered by start time DESCENDING,
  // so page one is the furthest-out FUTURE, and once repeating calendar entries
  // were swept in it ran from June 2027 to August 2027 with nothing of this week
  // in it. Badge 11, list empty. A client-side filter underneath a server
  // COUNT(*) is the arrangement R16 exists to forbid, and the search box on this
  // very screen had already been moved to the door for that reason.
  //
  // It costs one extra read while this tab is showing, and there is no way round
  // it: the week's rows are genuinely not in the page the meetings list hands back.
  // Only while it is showing — the other two views read the meetings list itself.
  //
  // WHICH LIST THE RESTING SCREEN IS STANDING ON, as an argument rather than as
  // a second name for the key: `meetingsKey(teamId, weekView)` is written out at
  // the cursor sidecar, the find bar and both Load more buttons, because R14's
  // and R15's checks read the control's OWN props for this collection's key —
  // and they are right to. A const holding the resolved key satisfies a
  // reader and nothing
  // else; the four censuses went red on it within one run.
  const weekView = view === "week" ? ("week" as const) : undefined
  // THE MONTH THE CALENDAR IS DRAWING, and its own read.
  //
  // The grid told nobody which month it was on, so it drew whatever the paged
  // list happened to hold — and the meetings list pages newest-first, which on 19 Aug
  // 2026 meant June-to-August 2027 while the month on screen was August 2026
  // with 61 meetings in it. Grid and agenda both said "nothing in Meetings this
  // month" over a badge reading 436. The week view had the identical fault, was
  // fixed on its own, and this one reads the same page it was fixed away from.
  //
  // `null` until the calendar reports (it does so on mount), so the first render
  // asks for nothing rather than guessing at a month.
  const [calendarMonth, setCalendarMonth] = React.useState<string | null>(null)
  const monthQ = useCached<Meeting[]>(
    view === "calendar" && calendarMonth ? meetingsMonthKey(teamId, calendarMonth) : null,
    () => listFetch.meetingsMonth(teamId, calendarMonth as string)
  )
  const weekQ = useCached<Meeting[]>(weekView ? meetingsKey(teamId, weekView) : null, () =>
    listFetch.meetings(teamId, "week")
  )
  // 9.7 — the repeating entries. `ahead` is the instances beyond the four-week
  // horizon: shown, never stored, because one that far out can still be moved or
  // called off in Google before it happens.
  const [syncing, setSyncing] = React.useState(false)
  const [ahead, setAhead] = React.useState<{ eventId: string; title: string; startsAt: string }[]>([])
  // HAS THE WALK OVER THE WHOLE CALENDAR FINISHED? Null until somebody presses,
  // because the honest thing to say before the first press is nothing.
  const [caughtUp, setCaughtUp] = React.useState<boolean | null>(null)
  const { can } = usePermissions(teamId)

  // FRESHNESS ON ARRIVAL (the owner's "a way to sync more often to make it feel
  // instantaneous"). The shell already does this once when the app opens; a
  // person who walks here two hours later was reading a two-hour-old answer on a
  // screen that looks live. The hook's own header explains why calling it from a
  // dozen screens is cheap: the five-minute floor is the DOOR's, so an extra
  // mount is a round trip answered out of the last sweep, never an extra call to
  // Google.
  useGoogleCatchUp(teamId, can)

  async function bringInSeries() {
    setSyncing(true)
    try {
      const r = await contentApi.syncCalendar()
      setAhead(r.ahead)
      setCaughtUp(r.caughtUp)
      invalidate(meetingsKey(teamId))
      invalidate(meetingsKey(teamId, "week"))
      const moved = r.created + r.updated + r.cancelled
      // AND WHETHER THERE IS MORE OF THE PAST TO COME. The sweep walks the whole
      // calendar a slice at a time, so "nothing new" on the first press is an
      // honest answer about the last fortnight and a misleading one about 2023.
      // Saying so is what stops somebody pressing once and concluding their
      // history is not there.
      const more = r.caughtUp ? "" : " Press again to keep reaching further back."
      toast.success(
        (moved === 0
          ? "Nothing new to bring in."
          : // ALL THREE VERBS, because the sweep does three things and a
            // sentence naming only the new records would leave somebody
            // wondering why a meeting they know changed said nothing happened.
            [
              r.created ? `${r.created} new` : "",
              r.updated ? `${r.updated} brought up to date` : "",
              r.cancelled ? `${r.cancelled} called off` : "",
            ]
              .filter(Boolean)
              .join(", ") + " in Meetings.") + more
      )
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't read your calendar."))
    } finally {
      setSyncing(false)
    }
  }

  async function add(values: MeetingFormValues) {
    await contentApi.createMeeting({
      title: values.title,
      startsAt: values.startsAt,
      endsAt: values.endsAt || undefined,
      accountId: values.accountId || undefined,
      appId: values.appId || undefined,
      purposeId: values.purposeId || undefined,
      location: values.location || undefined,
      agenda: values.agenda || undefined,
      notes: values.notes || undefined,
    })
    invalidate(meetingsKey(teamId))
    invalidate(meetingsKey(teamId, "week"))
    toast.success(t("It's in Meetings."))
  }

  // EITHER READ FAILING IS THE SAME SENTENCE — whichever list this tab is
  // standing on, what the reader could not get is the meetings.
  if (meetingsQ.error || weekQ.error)
    return <p className="text-destructive text-sm">{t("Couldn't load the meetings.")}</p>
  if (meetingsQ.data === undefined) return <Skeleton variant="list" lines={4} />
  const loaded = meetingsQ.data
  const weekRows = weekQ.data

  return (
    <CountedAbove active>
    <div className="flex flex-col gap-6">
      {/* R16: the strip below badges two exact server counts, so the heading
          stands down through the arbitration context rather than saying a
          number twice. */}
      <CollectionHeading sectionKey="meetings" total={total} />

      {/* `line`, not the folder shape, for the reason spelled out in
          tickets-collection.tsx: the kit's folder tab is drawn to be attached
          to the card below it, and the search box sits between this strip and
          the list. */}
      <TabsView
        config={{
          ...defaultTabsConfig,
          variant: "line",
          tabs: [
            {
              value: "week",
              label: t("This week"),
              icon: "calendar-clock",
              badge: formatCount(weekTotal),
              badgeVariant: "" as const,
            },
            {
              value: "calendar",
              label: t("Calendar"),
              icon: "calendar",
              badge: formatCount(total),
              badgeVariant: "" as const,
            },
            {
              value: "all",
              label: t("All"),
              icon: "list",
              badge: formatCount(total),
              badgeVariant: "" as const,
            },
          ],
        }}
        value={view}
        onValueChange={(v) => setView(v as "week" | "calendar" | "all")}
      />

      {/* R14's other half: the meetings list pages, and the meeting somebody digs for is
          the OLD one — so the search box is answered by the door, over the whole
          meetings list rather than the page in the browser. */}
      <PagedFind<Meeting>
        listKey={meetingsKey(teamId, weekView)}
        placeholder={t("Search meetings…")}
        matches={{
          none: t("No meetings match"),
          one: t("1 meeting matches"),
          many: t("{count} meetings match"),
        }}
        sorts={translatedSorts("meetings", t)}
        defaultSort={COLLECTION_SORTS.meetings.defaultSort}
        // THE MEETINGS LIST'S FILTERS, asked of the door. They were the frame's until
        // 18 Aug 2026 — so "who we met" narrowed the fifty most recent meetings
        // and said nothing about the two years behind them, which is the exact
        // objection the comment above makes about the search box.
        //
        // The two picker-backed ones are filled from the caches this screen
        // already reads for its form, so they appear for whoever can see those
        // lists and are DROPPED rather than drawn empty for whoever cannot — the
        // same rule the bounded recipes follow about a facet with no options.
        facets={translatedFacets("meetings", t, {
          accountId: (accountsQ.data ?? []).map((a) => ({ value: a.id, label: a.name })),
          purposeId: (purposesQ.data ?? [])
            .filter((pp) => pp.active)
            .map((pp) => ({ value: pp.id, label: pp.name })),
        })}
        fetchPage={(query, cursor) =>
          contentApi
            .meetings({
              // The whole meetings list is what a find searches; the week and the
              // calendar are views on top of it. Here rather than in `fixed`,
              // because `fixed` makes a find ACTIVE and the resting screen would
              // then read a `find:` cache key the live registry does not patch
              // (R15).
              view: "all",
              // …then the question itself, spread whole: `listQuery` forwards
              // every key, so a filter cannot be lost on the way to the door.
              ...query,
              cursor,
            })
            .then((r) => ({ rows: r.meetings, nextCursor: r.nextCursor, total: r.total }))
        }
      >
        {(found) => {
          // WHICH ROWS THIS TAB IS SHOWING. A find answers over the whole meetings list
          // and outranks the tab; otherwise the week reads the week's own list
          // and the other two read the meetings list. `undefined` is "not back yet",
          // which the line below draws as the skeleton rather than as "none".
          const rows = found.active ? found.rows : view === "week" ? (weekRows ?? null) : loaded
          if (rows === null) return <Skeleton variant="list" lines={4} />
          // NOTHING IS NARROWED HERE. The week used to be, and the badge above
          // it disagreed for as long as it was: see the note on `weekQ`. Every
          // row on screen now came back from the door answering the question
          // this tab asks, which is the same door the count came from (R16).
          const shown = rows
          const data = shapeMeetingsList(shown)
          // THE CALENDAR'S ROWS — the shaper's, so a meeting reads the same in
          // the grid as it does in the list underneath (a cancelled one still
          // says so). The one thing the shaper has no column for is the CLOCK
          // TIME, which is the whole point of an agenda row, so it is looked up
          // beside it rather than shaped a second way.
          // THE CALENDAR'S OWN ROWS — the month the door answered for, shaped the
          // same way the list is so a meeting reads identically in both.
          const monthRows = monthQ.data ?? []
          const monthShaped = shapeMeetingsList(monthRows)
          const startsAtById = new Map(monthRows.map((m) => [m.id, m.startsAt]))
          const calendarEntries: CalendarEntry[] = (monthShaped.rows ?? []).map((r) => ({
            id: String(r.id),
            day: String(r.startsOn ?? ""),
            title: String(r.name ?? ""),
            accent: String(r.state ?? ""),
            detail: [formatTime(startsAtById.get(String(r.id))), String(r.client ?? "")]
              .filter(Boolean)
              .join(" · "),
          }))
          // ALL shows far more columns (9.1). The other two views stay the
          // two-line list a person scans, which is the rulebook's own rule about
          // a table being for scanning and a list for reading.
          // The display is decided BEFORE the collection is tuned, so the tuner
          // can see it is drawing a table (whose column headers are its own sort
          // control) and stand its picker down — see tasks-screen for the whole
          // sentence.
          // TRANSLATED HERE: these columns are the host's own, spread on AFTER
          // resolveRecipe translated the recipe, so they had never been through
          // the pass and every heading rendered in English whatever language the
          // reader chose.
          const tableRecipe = withDataDrivenCollection(
            { ...recipe, display: "table" as const, fields: translateFields(ALL_COLUMNS, t) },
            data.rows ?? [],
            found.emptyText
          )
          const listRecipe = withDataDrivenCollection(recipe, data.rows ?? [], found.emptyText)
          return (
            <>
              <SectionWithCreate show={canCreate} label={t("New meeting")} icon="plus" onCreate={() => setOpen(true)}>
                {view === "calendar" ? (
                  // NO `unloaded` SENTENCE ANY MORE. It said "earlier meetings
                  // haven't been loaded yet, so this month may not be the whole
                  // of it", which was true of a grid reading the paged prefix and
                  // is now false: the month on screen IS the whole of it, asked
                  // of the door. Leaving it would be an apology for a fault that
                  // no longer exists, which teaches a person to distrust a
                  // correct screen.
                  <RecordCalendar
                    entries={calendarEntries}
                    onOpen={(id) => onIntent({ kind: "open", module: "meetings", id })}
                    emptyText={
                      monthQ.data === undefined
                        ? t("Reading this month…")
                        : t("Nothing in Meetings this month.")
                    }
                    onMonthChange={setCalendarMonth}
                  />
                ) : view === "all" ? (
                  // THE MEETINGS LIST PAGES, so its headers ask the DOOR — `found.order`
                  // is the same handle the picker above the table holds, so the
                  // two controls are one question and the answer spans the whole
                  // meetings list instead of the fifty rows in the browser. The picker
                  // stays because it names orders that are not columns ("Recently
                  // added"); the headers cover the ones that are.
                  <RecordTable
                    columns={ALL_COLUMN_HEADERS}
                    rows={data.rows ?? []}
                    config={tableRecipe.collection as CollectionConfig}
                    order={found.order}
                    actions={visibleActions(tableRecipe, rights, onAction)}
                    onRowClick={(row) =>
                      onIntent({ kind: "open", module: "meetings", id: String(row.id) })
                    }
                  />
                ) : (
                  <ScreenRenderer
                    recipe={listRecipe}
                    data={data}
                    rights={rights}
                    onAction={onAction}
                    onIntent={onIntent}
                  />
                )}
              </SectionWithCreate>

              {/* R14: the heading counts the WHOLE meetings list, so the list under it has to be
                  able to reach all of it — page one, then Load more.
                  NOT ON THE CALENDAR, because the calendar carries its own: the
                  grid knows which month you are reading and can offer the button
                  on exactly the months that need it, beside the sentence saying
                  why. Two of the same button on one screen is one too many. */}
              {view !== "calendar" && (
                <LoadMore
                  listKey={found.listKey ?? meetingsKey(teamId, weekView)}
                  fetchPage={found.fetchPage}
                  label={t("Load more meetings")}
                />
              )}
            </>
          )
        }}
      </PagedFind>

      {/* THE CALENDAR, READ IN. ONE WAY — nothing here writes to a calendar.
          A button rather than only an automatic pass: it reads a person's own
          Google calendar with their own token, and somebody who has just moved a
          meeting in Google wants to press something and see it. It is also how
          the WALK over the whole calendar advances, one slice per press, which is
          why the line underneath says when there is more of the past to come.
          `ahead` is the other reason this control is here rather than the shared
          one — the entries beyond the horizon come back in its answer. */}
      {canCreate && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={syncing}
              onClick={() => void bringInSeries()}
              className="w-fit gap-1"
            >
              {syncing ? <Spinner /> : <CalendarSync className="size-3.5" />}
                {t("Bring in the calendar")}
            </Button>
            {/* And the material half, so the assistant can answer from what is in
                these meetings — the same control that is now on every screen
                showing Google material. */}
            <GoogleSyncButton teamId={teamId} scope="knowledge" />
            {/* HOW FAR BACK IT HAS GOT. Only after a press, and only while there
                is more: a line that always said something would be furniture, and
                one that never said anything would leave somebody believing their
                whole history was in after the first press. */}
            {caughtUp === false && (
              <span className="text-muted-foreground text-xs">
                {t("Still reading your older meetings, press again to go further back.")}
              </span>
            )}
          </div>
          {ahead.length > 0 && (
            <div className="flex flex-col gap-2">
              {/* NOT RECORDS YET, AND SAID SO. The live window reaches four
                  weeks ahead; these are further out. The walk will reach them
                  too, which is why the sentence says "yet". */}
              <p className="text-muted-foreground text-xs">
                {t("Further out, and not records yet, each becomes one four weeks before it happens.")}
              </p>
              <ul className="flex flex-col gap-1">
                {ahead.map((a) => (
                  <li key={a.eventId} className="text-muted-foreground flex flex-wrap gap-2 text-sm">
                    <span className="min-w-0 truncate">{a.title}</span>
                    <span className="tabular-nums">{formatDate(a.startsAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* WHY WE MEET, one level down. A link rather than a nav line: the purposes
          are the vocabulary this screen picks from, and a rail that lists both a
          page and the words behind it reads as two ideas. R16: the number is the
          door's exact total through the ONE seam, and an unloaded total renders
          nothing rather than a "0" that reads as "there are none". */}
      {canReadPurposes ? (
        <button
          type="button"
          onClick={onPurposes}
          className="text-muted-foreground hover:text-foreground w-fit text-sm underline-offset-4 hover:underline"
        >
          {t("Meeting purposes")}
          {formatCount(purposeCount) ? ` (${formatCount(purposeCount)})` : ""}
        </button>
      ) : null}

      <MeetingFormDialog
        open={open}
        onOpenChange={setOpen}
        draftKey={`meeting:add:${teamId}`}
        teamId={teamId}
        accountOptions={(accountsQ.data ?? []).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
        appOptions={(appsQ.data ?? []).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
        purposeOptions={(purposesQ.data ?? []).filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))}
        onSubmit={add}
      />
    </div>
    </CountedAbove>
  )
}
