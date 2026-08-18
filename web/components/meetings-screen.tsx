"use client"

// THE DIARY — every conversation we have had or are about to have, newest first.
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
// diary rather than on a rail of its own — it is the vocabulary behind this
// screen, not a second destination.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { CalendarSync } from "lucide-react"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import {
  ScreenRenderer,
  type ScreenActionContext,
  type ScreenIntent,
} from "@kwapso/ui/registry/collections/screen-renderer/screen-renderer"
import type { ScreenRecipe, ScreenRights } from "@kwapso/ui/lib/recipe"

import { CollectionHeading } from "@/components/collection-heading"
import { GoogleSyncButton } from "@/components/google-sync"
import { CountedAbove } from "@/components/counted-tabs"
import { SectionWithCreate } from "@/components/deep-link/screen-bits"
import { LoadMore } from "@/components/load-more"
import { PagedFind } from "@/components/paged-find"
import { COLLECTION_SORTS, translatedSorts } from "@/lib/collection-sorts"
import { MeetingFormDialog, type MeetingFormValues } from "@/components/meeting-form-dialog"
import { RecordCalendar, type CalendarEntry } from "@/components/record-calendar"
import { shapeMeetingsList } from "@/components/deep-link/shape"
import { ApiFailure, content as contentApi, tenancy } from "@/lib/api"
import { appsKey, cursorKey, listFetch, meetingsKey, totalKey } from "@/lib/live-resources"
import { field, withDataDrivenCollection } from "@/lib/screens"
import { usePermissions } from "@/lib/perms"
import { useGoogleCatchUp } from "@/lib/use-google-catch-up"
import type { Account, AppRow, Meeting, MeetingPurpose } from "@shared/types"
import { invalidate, useCached, useCachedValue } from "@shared/web/store"
import { formatCount } from "@shared/web/format-count"
import { formatDate, formatTime } from "@shared/web/format"
import { useT } from "@shared/web/language"

/** THE WEEK WE ARE IN, Monday to Sunday, in UTC — the same boundary
 * workers/content/src/lib/meetings.ts computes for the badge above the list, so
 * the number and the rows mean one week. */
function inThisWeek(startsAt: string): boolean {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 7)
  const at = Date.parse(startsAt)
  return at >= start.getTime() && at < end.getTime()
}

/** WHAT THE MONTH IN FRONT OF YOU DOES NOT SAY (R14).
 *
 * The diary PAGES, newest first, so the rows in hand run from the furthest-out
 * meeting back to wherever the cursor stopped. A month grid drawn over that is
 * honest about the months it has read and silently wrong about every month
 * before them: an empty square in March reads as "we did not meet", when what it
 * means is "nobody has read March yet". A calendar that quietly answers a
 * question it has not asked is worse than one that refuses.
 *
 * So the calendar renders this under the grid exactly on the months that start
 * before the oldest row loaded — and this renders NOTHING when the cursor says
 * the whole diary is already in hand, because then an empty March really is an
 * empty March. Its own component so the cursor can be read with a hook: the
 * calendar sits inside PagedFind's render prop, where a hook cannot go. */
function EarlierNotLoaded({
  listKey,
  fetchPage,
}: {
  listKey: string
  fetchPage: (cursor: string) => Promise<{ rows: Meeting[]; nextCursor: string | null }>
}) {
  const t = useT()
  const cursor = useCachedValue<string | null>(cursorKey(listKey))
  if (!cursor) return null
  return (
    <>
      <p className="text-muted-foreground text-sm">
        {t("Earlier meetings haven't been loaded yet, so this month may not be the whole of it.")}
      </p>
      <LoadMore listKey={listKey} fetchPage={fetchPage} label={t("Load more meetings")} />
    </>
  )
}

/** WHAT "ALL" SHOWS (CHECKLIST 9.1: "all, with far more columns"). The two-field
 * list is for scanning; this is the one somebody reads across, so it carries
 * every fact a meeting row can state without opening it. */
const ALL_COLUMNS = [
  field("name", "Meeting"),
  field("when", "When"),
  field("client", "Client"),
  field("app", "App"),
  field("purpose", "Why we met"),
  field("where", "Where"),
  field("state", "Status"),
  field("written", "Notes"),
  field("reference", "Reference"),
]

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
  // 9.7 — the repeating entries. `ahead` is the instances beyond the four-week
  // horizon: shown, never stored, because one that far out can still be moved or
  // called off in Google before it happens.
  const [syncing, setSyncing] = React.useState(false)
  const [ahead, setAhead] = React.useState<{ eventId: string; title: string; startsAt: string }[]>([])
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
      invalidate(meetingsKey(teamId))
      const moved = r.created + r.updated + r.cancelled
      toast.success(
        moved === 0
          ? "Nothing new to bring in."
          : // ALL THREE VERBS, because the sweep now does three things and a
            // sentence naming only the new records would leave somebody
            // wondering why a meeting they know changed said nothing happened.
            [
              r.created ? `${r.created} new` : "",
              r.updated ? `${r.updated} brought up to date` : "",
              r.cancelled ? `${r.cancelled} called off` : "",
            ]
              .filter(Boolean)
              .join(", ") + " in the diary."
      )
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't read your calendar.")
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
    toast.success(t("It's in the diary."))
  }

  if (meetingsQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the meetings.")}</p>
  if (meetingsQ.data === undefined) return <Skeleton variant="list" lines={4} />
  const loaded = meetingsQ.data

  return (
    <CountedAbove active>
    <div className="flex flex-col gap-4">
      {/* R16: the strip below badges two exact server counts, so the heading
          stands down through the arbitration context rather than saying a
          number twice. */}
      <CollectionHeading sectionKey="meetings" total={total} />

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

      {/* R14's other half: the diary pages, and the meeting somebody digs for is
          the OLD one — so the search box is answered by the door, over the whole
          diary rather than the page in the browser. */}
      <PagedFind<Meeting>
        listKey={meetingsKey(teamId)}
        placeholder={t("Search meetings…")}
        noun="meetings"
        sorts={translatedSorts("meetings", t)}
        defaultSort={COLLECTION_SORTS.meetings.defaultSort}
        fetchPage={(query, cursor) =>
          contentApi
            .meetings(cursor, "all", query.q, undefined, undefined, { sort: query.sort, dir: query.dir })
            .then((r) => ({ rows: r.meetings, nextCursor: r.nextCursor, total: r.total }))
        }
      >
        {(found) => {
          const rows = found.active ? found.rows : loaded
          if (rows === null) return <Skeleton variant="list" lines={4} />
          // THIS WEEK is narrowed HERE and not by a second read, deliberately:
          // the door has already told us how many there are (the badge above is
          // its exact count), and the week sits inside the newest page for any
          // agency that has not held fifty meetings since Monday. The date
          // boundary is the same one the door computes — Monday, in UTC.
          const shown = view === "week" ? rows.filter((m) => inThisWeek(m.startsAt)) : rows
          const data = shapeMeetingsList(shown)
          // THE CALENDAR'S ROWS — the shaper's, so a meeting reads the same in
          // the grid as it does in the list underneath (a cancelled one still
          // says so). The one thing the shaper has no column for is the CLOCK
          // TIME, which is the whole point of an agenda row, so it is looked up
          // beside it rather than shaped a second way.
          const startsAtById = new Map(shown.map((m) => [m.id, m.startsAt]))
          const calendarEntries: CalendarEntry[] = (data.rows ?? []).map((r) => ({
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
          const listRecipe =
            view === "all"
              ? withDataDrivenCollection(
                  { ...recipe, display: "table" as const, fields: ALL_COLUMNS },
                  data.rows ?? [],
                  found.emptyText
                )
              : withDataDrivenCollection(recipe, data.rows ?? [], found.emptyText)
          return (
            <>
              <SectionWithCreate show={canCreate} label={t("New meeting")} icon="plus" onCreate={() => setOpen(true)}>
                {view === "calendar" ? (
                  <RecordCalendar
                    entries={calendarEntries}
                    onOpen={(id) => onIntent({ kind: "open", module: "meetings", id })}
                    emptyText={t("Nothing in the diary this month.")}
                    unloaded={
                      <EarlierNotLoaded
                        listKey={found.listKey ?? meetingsKey(teamId)}
                        fetchPage={found.fetchPage}
                      />
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

              {/* R14: the heading counts the WHOLE diary, so the list under it has to be
                  able to reach all of it — page one, then Load more.
                  NOT ON THE CALENDAR, because the calendar carries its own: the
                  grid knows which month you are reading and can offer the button
                  on exactly the months that need it, beside the sentence saying
                  why. Two of the same button on one screen is one too many. */}
              {view !== "calendar" && (
                <LoadMore
                  listKey={found.listKey ?? meetingsKey(teamId)}
                  fetchPage={found.fetchPage}
                  label={t("Load more meetings")}
                />
              )}
            </>
          )
        }}
      </PagedFind>

      {/* THE CALENDAR, BOTH WAYS (9.7 and the owner's "it should also update
          consistently if it's a past event"). Still a button as well as an
          automatic pass: it reads a person's own Google calendar with their own
          token, and somebody who has just moved a meeting in Google wants to
          press something and see it. `ahead` is why this one is here rather than
          the shared control alone — the instances beyond the horizon come back
          in its answer and are shown underneath. */}
      {canCreate && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={syncing}
              onClick={() => void bringInSeries()}
              className="w-fit gap-1.5"
            >
              {syncing ? <Spinner /> : <CalendarSync className="size-3.5" />}
                {t("Bring in the calendar")}
            </Button>
            {/* And the material half, so the assistant can answer from what is in
                these meetings — the same control that is now on every screen
                showing Google material. */}
            <GoogleSyncButton teamId={teamId} scope="knowledge" />
          </div>
          {ahead.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {/* READ-ONLY, AND SAID SO. These are not records: they become one
                  four weeks before they happen, which is when there is somewhere
                  to write the notes. */}
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
