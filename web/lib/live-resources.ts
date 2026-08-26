"use client"

// The LIVE-LISTENER registry (R15): every resource string any worker publishes
// must REACH a listener here — a row-level entry (TEAM_RESOURCES), a coarse
// invalidation (SIMPLE_INVALIDATIONS), or a reasoned DEAF_EXEMPT entry in the
// rules registry. Publishing to nobody is the silent half of the stale-screen
// bug, so the check derives the publisher set by scanning publishChange calls
// and fails the build on any resource no listener claims. Lives in lib (not the
// shell component) so the check can import it as data.
import { waves as wavesApi, waveOneKey, wavesKey } from "@/lib/api/waves"
//
// The list fetchers here ALSO prime the `total:` sidecar each door now returns
// (R16): a badge shows the server COUNT(*), never rows.length, so whoever pulls
// a list primes its total in the same round-trip.

import { content as contentApi, tenancy } from "@/lib/api"
import { TASK_VIEWS, type HelpTicket, type Meeting, type TaskViewName } from "@shared/types"
import { RECORD_CHILDREN } from "@shared/record-counts"
import { cachedKeys, primeCache, readCache } from "@shared/web/store"

/** The sidecar cache key holding a collection's exact server total (R16). */
export function totalKey(prefix: string, teamId: string): string {
  return `total:${prefix}:${teamId}`
}

/** The sidecar holding a PAGED collection's next opaque cursor (R14), keyed off
 * the list's own cache key. `null` in the sidecar means "that was the last page";
 * `undefined` means nothing has loaded yet. */
export function cursorKey(listKey: string): string {
  return `cursor:${listKey}`
}

/** How many rows one paged list may hold in the browser at once.
 *
 * `loadMore` APPENDS, which is what makes "load more" feel like one list — and
 * with nothing stopping it, a growing collection (the activity feed, tickets) had
 * no ceiling at all on the client side: page after page went into one array, in
 * memory and in the DOM, for as long as the tab stayed open. R14 caps what one
 * REQUEST returns; nothing capped what a session ACCUMULATED, and the two are
 * different numbers.
 *
 * Twenty pages of PAGE_SIZE (50). Nobody reads a thousand rows looking for
 * something — they search, or they filter — and past this the honest answer is to
 * say so rather than to keep growing a list the browser will choke on. It is also
 * comfortably inside the row budget the cache itself now enforces
 * (MAX_CACHED_ROWS in shared/web/store.ts), so one list can never spend the whole
 * tab's allowance and evict every other screen. */
export const CLIENT_PAGE_ROWS_CAP = 1000

/** Fetch the NEXT page of a paged collection and APPEND it to the loaded prefix —
 * never a refetch of what's already on screen. Returns false when there was
 * nothing more to load, or when the loaded list has reached
 * CLIENT_PAGE_ROWS_CAP (so the caller can stop asking, and say why). The cursor
 * is opaque: it only ever travels cache → door → cache. */
export async function loadMore<T>(
  listKey: string,
  fetchPage: (cursor: string) => Promise<{ rows: T[]; nextCursor: string | null }>
): Promise<boolean> {
  const cursor = readCache<string | null>(cursorKey(listKey))
  if (!cursor) return false
  const loaded = readCache<T[]>(listKey) ?? []
  // The ceiling is checked BEFORE the fetch — a page nobody may keep is a request
  // nobody should make.
  if (loaded.length >= CLIENT_PAGE_ROWS_CAP) return false
  const next = await fetchPage(cursor)
  primeCache(listKey, [...loaded, ...next.rows])
  primeCache(cursorKey(listKey), next.nextCursor)
  return true
}

/** List fetchers that prime their collection's `total:` sidecar as they load —
 * shared by the screen reads (use-screen-data) and reconnect catch-up below, so
 * a total can never go stale while its list is fresh. */
/** HOW MANY PAGES ONE MONTH OF THE MEETINGS LIST MAY COST. Five, which at the door's
 * page size is far past any real month — August 2026, the busiest in the test
 * data, is 61 meetings and fits in two. It exists so a runaway import cannot
 * turn one calendar square into a hundred requests. */
const CALENDAR_MONTH_PAGES = 5

export const listFetch = {
  roles: (teamId: string) =>
    tenancy.roles().then((r) => {
      primeCache(totalKey("member_roles", teamId), r.total)
      return r.roles
    }),
  invites: (teamId: string) =>
    tenancy.invites().then((r) => {
      primeCache(totalKey("invites", teamId), r.total)
      return r.invites
    }),
  selectable: (teamId: string) =>
    tenancy.selectable().then((r) => {
      primeCache(totalKey("selectable", teamId), r.total)
      return r.values
    }),
  // R14: accounts are PAGED — every company AND every person an agency works with
  // is a row here, so the door answers with a cursor rather than a ceiling. Page
  // one lands in the cache, its next cursor in the sidecar <LoadMore> reads.
  accounts: (teamId: string) =>
    tenancy.accounts().then((r) => {
      primeCache(totalKey("accounts", teamId), r.total)
      // The two tab badges (R16), exact and from the same read as the rows. Both
      // are the COLLECTION's counts, not this call's — see the note on them in
      // workers/tenancy/src/lib/accounts.ts.
      primeCache(totalKey("accounts-entity", teamId), r.entityTotal)
      primeCache(totalKey("accounts-individual", teamId), r.individualTotal)
      primeCache(cursorKey(accountsKey(teamId)), r.nextCursor)
      return r.accounts
    }),
  // R14: help is PAGED — the fetchers below load page ONE and park the next
  // cursor in its sidecar; <LoadMore> appends from there. A fresh load (or a
  // reconnect catch-up) resets to page one, which is what a reconnect should do.
  // R14: sources are PAGED — the agency's own history is thousands of rows on
  // day one. Page one lands in the cache, its next cursor in the sidecar
  // <LoadMore> reads, exactly like accounts and tickets.
  knowledge: (teamId: string) =>
    contentApi.knowledge().then((r) => {
      primeCache(totalKey("knowledge", teamId), r.total)
      primeCache(cursorKey(knowledgeKey(teamId)), r.nextCursor)
      return r.sources
    }),
  help: (teamId: string) =>
    contentApi.help().then((r) => {
      primeCache(totalKey("help", teamId), r.total)
      primeCache(totalKey("help-mine", teamId), r.mineTotal)
      primeCache(cursorKey(helpKey(teamId, "all")), r.nextCursor)
      // The sub-tab badges (CHECKLIST 5.1). One grouped read on the server rides
      // every ticket page, so the strip costs nothing extra to draw.
      primeCache(`help-by-type:${teamId}`, r.byType)
      primeCache(`help-by-status:${teamId}`, r.byStatus)
      return r.tickets
    }),
  // PUT AWAY, AND FINDABLE. The archived view is its own paged read, and it has
  // to exist: archive shipped as a door with no button, and giving it a button
  // without giving the put-away pile a screen would only move the dead end one
  // step along. Its `total` is the count over THIS view (the door counts the
  // same question it listed), so it never collides with the live badge.
  helpArchived: (teamId: string) =>
    contentApi.help({ view: "archived" }).then((r) => {
      primeCache(totalKey("help-archived", teamId), r.total)
      primeCache(cursorKey(helpKey(teamId, "archived")), r.nextCursor)
      return r.tickets
    }),
  /** ONE SUB-TAB'S PAGE (CHECKLIST 5.1). Same door, same paging, same exact
   * totals — the narrowing is the door's, not the browser's, because the list
   * pages and filtering a loaded page would answer "the questions among the
   * newest fifty" under a badge counting all of them (R14 + R16).
   *
   * `byType` / `byStatus` are primed from EVERY ticket read, including this one:
   * they are counted over the list ignoring the kind and stage facets, so the
   * strip's badges stay right whichever sub-tab is open. */
  helpFacet: (teamId: string, scope: HelpScope, facet: HelpFacet) => {
    const f = helpFacetFilter(facet)
    return contentApi
      .help({
        view: scope === "archived" ? "archived" : "live",
        helpType: f.helpType,
        status: f.status,
      })
      .then((r) => {
        primeCache(totalKey(`help-facet:${scope}:${facet}`, teamId), r.total)
        primeCache(cursorKey(helpFacetKey(teamId, scope, facet)), r.nextCursor)
        primeCache(`help-by-type:${teamId}`, r.byType)
        primeCache(`help-by-status:${teamId}`, r.byStatus)
        return r.tickets
      })
  },
  // R14: process maps are PAGED — every app of every client grows them, and none
  // is ever deleted (the savings computed from a baseline have to stay checkable
  // years later). Page one lands in the cache, its next cursor in the sidecar
  // <LoadMore> reads.
  // Waves are BOUNDED, not paged — a package is something an agency SELLS, so
  // this list grows at the speed of contracts. Just the exact total to prime.
  waves: (teamId: string) =>
    wavesApi.list().then((r) => {
      primeCache(totalKey("waves", teamId), r.total)
      return r.waves
    }),
  processDrafts: (teamId: string) =>
    tenancy.processDrafts().then((r) => {
      primeCache(totalKey("process_drafts", teamId), r.total)
      return r.drafts
    }),
  processes: (teamId: string) =>
    tenancy.processes().then((r) => {
      primeCache(totalKey("processes", teamId), r.total)
      primeCache(cursorKey(processesKey(teamId)), r.nextCursor)
      return r.processes
    }),
  // R14: stories are PAGED — the backlog only grows, and the 3,677 rows arriving
  // from the previous system are there on day one. Page one lands in the cache,
  // its next cursor in the sidecar <LoadMore> reads.
  stories: (teamId: string) =>
    contentApi.stories().then((r) => {
      // The total prefix is `stories`, which is also the RESOURCE name the
      // worker publishes — that is what lets the shell's ±1 bump on an add/remove
      // land on the sidecar this screen reads. It used to be `work`, so a
      // colleague adding a story moved a badge nobody was looking at.
      primeCache(totalKey("stories", teamId), r.total)
      primeCache(totalKey("stories-mine", teamId), r.mineTotal)
      primeCache(cursorKey(storiesKey(teamId)), r.nextCursor)
      return r.stories
    }),
  // R14: time is PAGED — 2,940 rows arrived from two years of the previous
  // system and every piece of work produces several more.
  workLogs: (teamId: string) =>
    contentApi.workLogs().then((r) => {
      primeCache(totalKey("work-logs", teamId), r.total)
      primeCache(totalKey("work-seconds", teamId), r.totalSeconds)
      primeCache(cursorKey(workLogsKey(teamId)), r.nextCursor)
      return r.logs
    }),
  // Both BOUNDED (R14): a to-do is a thing we are WAITING on and a task is admin,
  // so each shrinks as fast as it grows — a ceiling is an honest answer rather
  // than an eventual refusal, and neither has a cursor sidecar to prime.
  todos: (teamId: string) =>
    contentApi.todos().then((r) => {
      primeCache(totalKey("todos", teamId), r.total)
      return r.todos
    }),
  // EVERY count comes back from ANY view's fetch (R16), because the badge on a
  // tab you are not looking at cannot be counted from the rows in front of you —
  // and the progress bar's pair rides along for the same reason: it is pinned to
  // the top of all six tabs, so it must be true on whichever one is open.
  tasks: (teamId: string, view: TaskView = "open") =>
    contentApi.tasks(view).then((r) => {
      primeCache(totalKey("tasks", teamId), r.openTotal)
      primeCache(totalKey("tasks-all", teamId), r.allTotal)
      primeCache(totalKey("tasks-overdue", teamId), r.overdueTotal)
      primeCache(totalKey("tasks-upcoming", teamId), r.upcomingTotal)
      primeCache(totalKey("tasks-completed", teamId), r.completedTotal)
      primeCache(totalKey("tasks-calendar", teamId), r.calendarTotal)
      primeCache(totalKey("tasks-due-today", teamId), r.dueTodayTotal)
      primeCache(totalKey("tasks-due-today-done", teamId), r.dueTodayDone)
      return r.tasks
    }),
  // R14: meetings are PAGED — an event is never curated away, so the door answers
  // with a cursor rather than a ceiling. Page one lands in the cache, its next
  // cursor in the sidecar <LoadMore> reads, exactly like tickets and sources.
  meetings: (teamId: string, view?: MeetingListView) =>
    contentApi.meetings(view === "week" ? { view: "week" } : {}).then((r) => {
      if (view === "week") {
        // THE WEEK ASKED OF THE DOOR, as its own read (19 Aug 2026). It used to
        // be the newest page filtered in the browser, on the stated assumption
        // that "the week sits inside the newest page for any agency that has not
        // held fifty meetings since Monday". The meetings list is ordered by START TIME,
        // DESCENDING, so the newest page is the furthest-out FUTURE — and once
        // the calendar sweep brought in repeating entries, page one ran from
        // June 2027 to August 2027 and not one of its fifty rows was in this
        // week. The badge said 11 and the list was empty.
        //
        // `total` here IS the week's count: the door counted the same question
        // it listed. One answer, which is what R16 asks for.
        primeCache(totalKey("meetings-week", teamId), r.total)
        primeCache(cursorKey(meetingsKey(teamId, "week")), r.nextCursor)
        return r.meetings
      }
      primeCache(totalKey("meetings", teamId), r.total)
      // THE WEEK'S OWN EXACT TOTAL, off the same response (9.1). The badge on a
      // tab nobody has opened still has to be exact, so the whole meetings list's read
      // carries the week's count beside its own (R16).
      primeCache(totalKey("meetings-week", teamId), r.weekTotal)
      primeCache(cursorKey(meetingsKey(teamId)), r.nextCursor)
      return r.meetings
    }),
  /** ONE MONTH, WHOLE — every meeting in it, not the first page of it.
   *
   * The door pages, and a month can exceed one page (August 2026 holds 61), so
   * this follows the cursor until the month is complete. Bounded at
   * CALENDAR_MONTH_PAGES: a month past that is not a calendar, it is an import
   * gone wrong, and drawing 500 chips in a grid would help nobody. What it
   * cannot show it does not pretend to — the count above the calendar is the
   * door's own and stays honest either way. */
  meetingsMonth: async (_teamId: string, month: string) => {
    const rows: Meeting[] = []
    let cursor: string | null = null
    for (let page = 0; page < CALENDAR_MONTH_PAGES; page++) {
      const r = await contentApi.meetings({ view: "all", month, cursor })
      rows.push(...r.meetings)
      cursor = r.nextCursor ?? null
      if (!cursor) break
    }
    return rows
  },
  // Sprints are BOUNDED, not paged (a block of sold work grows at the speed of
  // contracts), so there is no cursor sidecar to prime — just the exact total.
  sprints: (teamId: string) =>
    contentApi.sprints().then((r) => {
      primeCache(totalKey("sprints", teamId), r.total)
      return r.sprints
    }),
  // THE SYSTEMS WE HAVE BUILT. Bounded like the sprints (an agency has tens of
  // apps), read whole for the team — the same set backs the Apps page, the app
  // picker on a map, and the app NAME beside a sprint or a story.
  apps: (teamId: string) =>
    tenancy.apps().then((r) => {
      primeCache(totalKey("apps", teamId), r.total)
      return r.apps
    }),
  // THE AGENCY'S OWN HOUSEKEEPING — two capped collections (R14: an authored
  // library and a settled taxonomy, not feeds), so each fetcher primes its
  // exact `total:` sidecar and there is no cursor to park.
  brandAssets: (teamId: string) =>
    contentApi.brandAssets().then((r) => {
      primeCache(totalKey("brand_assets", teamId), r.total)
      return r.assets
    }),
  purposes: (teamId: string) =>
    contentApi.meetingPurposes().then((r) => {
      primeCache(totalKey("purposes", teamId), r.total)
      return r.purposes
    }),
  // Read WHOLE rather than per-member: one profile each and a handful of
  // certificates, so the team's whole set is smaller than one page of tickets —
  // and a member page that pulled its own would refetch on every colleague you
  // clicked through to.
  staffProfiles: (teamId: string) =>
    contentApi.staffProfiles().then((r) => {
      primeCache(totalKey("staff_profiles", teamId), r.total)
      return r.profiles
    }),
  staffCertificates: (teamId: string) =>
    contentApi.staffCertificates().then((r) => {
      primeCache(totalKey("staff_certificates", teamId), r.total)
      return r.certificates
    }),
}


/** The backlog's cache key (the paged stories list) and the sprint list beside
 * it. Two keys, because they are two collections with two different R14 answers:
 * one pages, one is capped. */
export function storiesKey(teamId: string): string {
  return `stories:${teamId}`
}
export function sprintsKey(teamId: string): string {
  return `sprints:${teamId}`
}

/** The paged list of TIME, and — separately — the caller's running timers, which
 * the header of every screen holds. Two keys because they answer two questions
 * with two lifetimes: a page of somebody's week is opened deliberately, and the
 * header's question is asked everywhere. */
export function workLogsKey(teamId: string): string {
  return `work-logs:${teamId}`
}
/** What we are waiting on clients for, and our own admin. Two keys, because they
 * are two collections with two audiences — the same reason they are two tables. */
export function todosKey(teamId: string): string {
  return `todos:${teamId}`
}
/** Which pile of our own admin a screen is showing. A SERVER view, not a client
 * filter: the list is capped (R14), so sieving the loaded rows for the done ones
 * would show "the finished tasks among the newest N" under a badge counting all
 * of them (R16) — the same reason the ticket strip is a server scope.
 *
 * Six of them now, one per tab (shared/types.ts TASK_VIEWS is the wire word for
 * each). `open` is the everyday pile and keeps the bare key it has always had, so
 * every listener, sidecar and prewarm that names `tasks:<team>` still lands on
 * the list the strip opens on. */
export type TaskView = TaskViewName
export function tasksKey(teamId: string, view: TaskView = "open"): string {
  return view === "open" ? `tasks:${teamId}` : `tasks-${view}:${teamId}`
}

/** WHICH SLICE OF THE MEETINGS LIST A KEY NAMES. The whole meetings list, or the week the reader
 * is standing in — the one view whose rows the whole meetings list's newest page cannot
 * be trusted to contain (see `listFetch.meetings`). */
export type MeetingListView = "week"

/** The meetings list's cache key (the paged meetings list). The WHOLE meetings list keeps the
 * bare key it has always had, so every listener, sidecar, prewarm and detail
 * screen that names `meetings:<team>` still lands on it — the same arrangement
 * `tasksKey` makes for its everyday pile. The week's own list sits under
 * `meetings-week:`, which the registry's `slicePrefix: "meetings-"` already
 * drops and re-reads on any meetings ping, so it stays live (R15). */
export function meetingsKey(teamId: string, view?: MeetingListView): string {
  return view === "week" ? `meetings-week:${teamId}` : `meetings:${teamId}`
}

/** ONE MONTH OF THE MEETINGS LIST, for the calendar grid and its agenda.
 *
 * Its own key, under the `meetings-` prefix the registry already slices on, so a
 * meeting that moves patches the month a person is looking at without anything
 * new being registered (R15).
 *
 * WHY A MONTH IS ITS OWN READ. The meetings list is ordered by start time DESCENDING and
 * it PAGES, so "the newest fifty" is the furthest-out FUTURE. On 19 Aug 2026 that
 * page ran from June 2027 to August 2027, while the month the calendar was
 * DRAWING — August 2026 — held 61 meetings it had never asked for. The grid and
 * the agenda both showed an empty month over a badge reading 436. The week view
 * had exactly this fault and was fixed on its own; the calendar reads the same
 * page and was not, which is why this comment names the shape rather than the
 * instance. */
export function meetingsMonthKey(teamId: string, month: string): string {
  return `meetings-month:${teamId}:${month}`
}

/** WHICH OF ONE MEETING'S GUESTS WE KNOW — its own key because it is its own
 * read: who was invited is on the row, and who they are TO US is a question with
 * a different lifetime (a contact added next week should light up on a meeting
 * held last week). */
export function meetingPeopleKey(id: string): string {
  return `meeting:people:${id}`
}

/** ONE MEETING'S TRANSCRIPT — its own key because it is its own read, and that
 * is a size decision: a page of meetings is fifty and a transcript is
 * up to a megabyte. */
export function meetingTranscriptKey(id: string): string {
  return `meeting:transcript:${id}`
}

/** The triage strip: whose week it is, and the requests nobody has read. One
 * key, because the screen asks them as one question. */
export function triageKey(teamId: string): string {
  return `triage:${teamId}`
}

/** THE PULSE — Home's big numbers and its two charts, in one cache entry.
 *
 * ONE KEY FOR ALL THREE SECTIONS, because it is one round trip and one answer:
 * the door hands back tickets, work and meetings together, and splitting them
 * into three keys would be three cache entries able to hold three different
 * moments of the same week.
 *
 * It is a DERIVED cache, so it is dropped and re-read rather than patched —
 * there is no row in it to patch. Every collection it counts names this key in
 * its `deps` below, which is the seam the savings drill-down already uses to
 * stay live (see `apps`): the row-level patch keeps the LIST honest, and the
 * coarse drop keeps the NUMBER computed off it honest. It costs one small read
 * when a ticket moves, and only when a screen is actually showing it — an
 * invalidated key nobody is subscribed to fetches nothing at all. */
export function insightsKey(teamId: string): string {
  return `insights:${teamId}`
}

/** THE BADGES ON ONE RECORD'S TABS — how many apps, sprints, to-dos, tickets,
 * meetings or files hang off it, fetched when the record OPENS rather than when
 * a tab is clicked (shared/record-counts.ts says why, and which).
 *
 * Its own cache key, and not merely the sidecars it primes, because the LIVE
 * layer has to be able to NAME something: a count fetched once and never re-read
 * would replace "blank until you click" with "stale for ever", which is worse
 * because it looks right. Dropping this key re-reads every one of that record's
 * badges in one round trip — the same shape the pulse above already has. */
export function recordCountsKey(table: string, id: string): string {
  return `counts:record:${table}:${id}`
}

/** THE PREFIX over that family, so the listener below and the key above cannot
 * drift apart. */
const RECORD_COUNTS_PREFIX = "counts:record:"

/** WHICH LOADED RECORDS' BADGES THIS RESOURCE MOVES (R15).
 *
 * A ping carries the CHILD row's id — a new sprint, a withdrawn to-do — and the
 * record it hangs off is on the row, which the listener has not read and may
 * never read. So the parent cannot be derived from the ping; it can only be
 * found by looking at which record screens are open. `cachedKeys` answers that,
 * and the registry answers "does this record's badge count that resource?", so
 * a story landing drops the counts of the app, sprint and ticket screens on
 * display and leaves a client's record — which badges no stories — alone.
 *
 * DERIVED, never hand-listed: a new child collection in RECORD_CHILDREN is live
 * the day it is added, which is R8's sentence about badges applied to the layer
 * that keeps them true. Cache-first, so this is normally nothing at all — a
 * record nobody has open has no entry to drop. */
function recordCountDeps(resource: string): string[] {
  return cachedKeys(RECORD_COUNTS_PREFIX).filter((key) => {
    // `counts:record:<table>:<id>` — the table is the one segment we need, and
    // an id may itself contain nothing that breaks this, since it is a ULID.
    const table = key.slice(RECORD_COUNTS_PREFIX.length).split(":")[0]
    return (RECORD_CHILDREN[table] ?? []).some((child) => child.resource === resource)
  })
}

/** EVERY MODULE THE TEAM HAS. ONE key, not one per app, and that is what makes
 * the collection live: a ping names a MODULE, and the app it hangs off is on the
 * row the listener has not read — so per-app keys could only ever be dropped
 * blindly, while one key is patched exactly. The screens narrow it themselves. */
export function appModulesKey(teamId: string): string {
  return `app-modules:${teamId}`
}

export function runningTimersKey(teamId: string): string {
  return `running-timers:${teamId}`
}

/** THE TIME LOGGED AGAINST ONE RECORD — the Time tab on a story, and any record
 * that grows one (a ticket and a task are the other two things time may sit
 * against). Keyed by the record, because it is that record's own slice of a
 * collection the whole team shares, read through the door's own target filter
 * rather than sieved out of the team-wide page.
 *
 * They all share ONE PREFIX on purpose. A `work_logs` ping carries the work
 * log's id and nothing else — the story it belongs to is on the row — so a
 * listener cannot name the one slice that went stale. It drops the family and
 * the slice on screen re-reads (see TEAM_RESOURCES.work_logs below). This is
 * the bug the tester found: a timer stopped from the header stayed "running" on
 * the story's Time tab for ever, because that key reached no listener at all —
 * and a row that reads as running is a row the screen refuses to let you edit. */
export const TIME_SLICE_PREFIX = "time-of:"
export function recordTimeKey(targetTable: string, targetId: string): string {
  return `${TIME_SLICE_PREFIX}${targetTable}:${targetId}`
}
/** THE NUMBERS ABOVE THAT SAME LIST — the aggregate the Work logs tab draws.
 *
 * Deliberately INSIDE the same prefix. It is a second read of the same question,
 * so it goes stale on exactly the same events, and putting it in the family means
 * the family drop above already covers it — no second listener, no second thing
 * to remember. A key outside the prefix would be the original bug wearing a new
 * hat: a stopped timer would update the rows and leave the total above them
 * reading the number from before. */
export function recordTimeSummaryKey(targetTable: string, targetId: string): string {
  return `${TIME_SLICE_PREFIX}${targetTable}:${targetId}:summary`
}
/** The agency-internal collections' cache keys. Named functions rather than
 * inline templates for the same reason the accounts and ticket keys are: the
 * live registry, the screen read and the count sidecar all have to say the same
 * string, and three places typing it is three places to mistype it. */
export function brandAssetsKey(teamId: string): string {
  return `brand_assets:${teamId}`
}
/** WHAT WE HANDED OVER, ON ONE APP. Its rows live ONLY in a per-app slice,
 * because a deliverable is never read anywhere but the app it belongs to —
 * spelled the way `sliceKey` spells every nested collection (`<kind>-of:<id>`),
 * but written HERE rather than at the call site for the reason the accounts and
 * ticket keys are: the live registry, the screen read and the count sidecar all
 * have to say the same string, and three places typing it is three places to
 * mistype it. */
export function deliverablesKey(appId: string): string {
  return `deliverables-app-of:${appId}`
}
export function purposesKey(teamId: string): string {
  return `purposes:${teamId}`
}
/** Staff profiles and certificates are read on a MEMBER's page, so they are
 * keyed by the team (the whole set is small — one profile per member) and the
 * member page picks its own out. */
export function staffProfilesKey(teamId: string): string {
  return `staff_profiles:${teamId}`
}
export function staffCertificatesKey(teamId: string): string {
  return `staff_certificates:${teamId}`
}

/** The process-map list's cache key (the paged maps list). */
/** The drafts list. TEAM-WIDE on purpose, like the client-organisation lists: a
 * draft is one call about one process, the read is bounded (R14), and a
 * per-process key is one a listener handed only a team could not name. */
export function processDraftsKey(teamId: string): string {
  return `process_drafts:${teamId}`
}
/** One opened proposal — read on its own review screen, so its own key. */
export function processDraftKey(draftId: string): string {
  return `process-draft:${draftId}`
}
export function processesKey(teamId: string): string {
  return `processes:${teamId}`
}

/** One map's own caches: the opened record (its versions, its current steps and
 * its exact comment total) and the conversation on it. Keyed by the PROCESS, so
 * moving between maps never clobbers the one you came from. */
export function processKey(processId: string): string {
  return `process:${processId}`
}
export function processCommentsKey(processId: string): string {
  return `process-comments:${processId}`
}
/** AN OLDER VERSION of a map, read on its own. The record cache above holds the
 * CURRENT version — the one a live ping is about, and the one every other screen
 * means when it says "the process" — so an older version gets a slice of its own
 * rather than taking that key's place: selecting version 1 must not leave the
 * next reader of `process:<id>` holding last year's steps.
 *
 * Older versions are frozen (the server refuses an edit to anything but the
 * latest), so these slices go stale in exactly one way: a cut turns today's
 * version into an old one. That is a `processes` ping, and PROCESS_VERSION_SLICES
 * below is how it reaches every loaded slice — the ping names a map, not a
 * version, which is the same shape the work-log/time slices have. */
export function processVersionKey(processId: string, versionId: string): string {
  return `${PROCESS_VERSION_SLICES}${processId}:${versionId}`
}
export const PROCESS_VERSION_SLICES = "process-version:"
/** The savings drill-down, per team — the one number a client is most likely to
 * ask about, so it re-reads whenever any step under it moves. */
export function impactKey(teamId: string): string {
  return `impact:${teamId}`
}
/** The same drill-down NARROWED to one client — what their work has given them
 * back, summed across their apps. Its own key beside the team-wide one, because
 * they are two different questions and one cache cannot hold both answers. */
export function accountImpactKey(accountId: string): string {
  return `impact:account:${accountId}`
}
/** The systems we've built (bounded, team-wide) — a filter and a heading on the
 * maps screen, and the names inside the value drill-down. */
export function appsKey(teamId: string): string {
  return `apps:${teamId}`
}
/** THE CLIENT'S OWN ORGANISATION, keyed by TEAM rather than by client.
 *
 * A department, a role and a tool each belong to one client, so the obvious key
 * is the account — and it is the wrong one here, because the live listener that
 * drops these (SIMPLE_INVALIDATIONS) is handed a team and nothing else. A key it
 * cannot name is a screen that goes quietly stale, which is precisely the
 * failure R15 exists to stop. Team-wide, bounded (R14) and small — a company has
 * a handful of each — so the screen narrows to the client it is showing and the
 * door fences by scope regardless. */
export function clientDepartmentsKey(teamId: string): string {
  return `client_departments:${teamId}`
}
export { waveOneKey, wavesKey } from "@/lib/api/waves"

export function clientRolesKey(teamId: string): string {
  return `client_roles:${teamId}`
}
export function clientToolsKey(teamId: string): string {
  return `client_tools:${teamId}`
}

/** One account's rate card, and the margin computed on it. Both keyed by the
 * ACCOUNT: a card is read on its account's screen, and a margin is about one
 * account. */
export function ratesKey(accountId: string): string {
  return `rates:${accountId}`
}
export function marginKey(accountId: string): string {
  return `margin:${accountId}`
}
/** The agency's own cost card — team-wide, because an internal rate is a fact
 * about us and not about any client. */
/** What an hour of each ROLE costs (8.13) — one small settled list, team-wide,
 * read whole on the internal rates screen. */
export function roleRatesKey(teamId: string): string {
  return `role-rates:${teamId}`
}

/** What ONE app has given back — hours and money. Its own key per app, because
 * it is read on that app's record and nowhere else. */
export function appMoneyKey(appId: string): string {
  return `app-money:${appId}`
}

export function internalRatesKey(teamId: string): string {
  return `internal-rates:${teamId}`
}

/** The accounts list's cache key (the paged customers list). */
export function accountsKey(teamId: string): string {
  return `accounts:${teamId}`
}

/** EVERY COMPANY, for the pickers that sell to one (a wave's client). Its own
 * key because the accounts list is PAGED and its page one is newest-first —
 * which is how the wave form's client picker offered 107 contacts and could
 * not find Confia (25 Aug 2026): the oldest companies were past the page and
 * people flooded what remained. This read asks the door the narrow question
 * (`type=entity`, 24 rows today, capped by the door) and stays live through
 * the accounts registry entry's deps below. */
export function companiesKey(teamId: string): string {
  return `companies:${teamId}`
}

/** One account's own cache: the opened record, with its people, its logins and
 * their exact totals. Keyed by the ACCOUNT, so moving between records never
 * clobbers the one you came from. (There was a second key here — the accounts
 * nested under this one — and it went with the tab that read it, 7.2.) */
export function accountKey(accountId: string): string {
  return `account:${accountId}`
}

/** ONE DROPDOWN VALUE'S OWN CACHE — the opened record, read through the
 * single-row door rather than found inside the vocabulary list.
 *
 * Keyed by TEAM as well as by row for the same reason `accountKey` is keyed by
 * record: a ULID says which row and never which fence it was read under, so a
 * team switch would otherwise hand the new team a row the old one's session
 * fetched. It is a SECOND key beside `selectable:<teamId>` on purpose — the list
 * door selects the vocabulary, the detail door also selects the audit block, so
 * the two answers are genuinely different rows and neither can stand in for the
 * other. R15 keeps both live: the `selectable_data` resource patches the list by
 * id and names this key in its `deps`. */
export function selectableOneKey(teamId: string, valueId: string): string {
  return `selectable:one:${teamId}:${valueId}`
}

/** The knowledge-source list's cache key. */
export function knowledgeKey(teamId: string): string {
  return `knowledge:${teamId}`
}

/** The ticket list's cache key. My/All is a SERVER scope, not a client filter:
 * once a list is paged, filtering the loaded page by raiser would show "my
 * tickets in the newest 50" under a badge counting all of them (R16). */
export function helpKey(teamId: string, scope: HelpScope): string {
  if (scope === "archived") return `help-archived:${teamId}`
  return `help:${teamId}`
}

/** Which pile of tickets a screen is showing. Two of these are a raiser filter
 * (`mine` / `all`) and one is a VIEW (`archived`), and they are one type because
 * a screen shows exactly one of the three at a time — the strip is one strip. */
/** Which pile of tickets the agency's Tickets screen shows.
 *
 * "MINE" WENT ON 18 AUG 2026, at the owner's word: "there's no such thing as my
 * tickets.. that tab does not make sense". In an agency nobody on staff HAS a
 * ticket — a client raises it and staff answer it through a story. The tab had
 * already been redefined once (CHECKLIST 2.3, from "tickets I typed" to "tickets
 * on the apps I am staffed to") because the first meaning was wrong; the owner's
 * ruling is that the question itself is the wrong one.
 *
 * THE DOOR KEEPS `scope=mine`, and deliberately: the CLIENT PORTAL asks it for
 * "what I raised", which is the one place the question does mean something — a
 * contact really did raise those, and without it their list would be every
 * ticket their company ever sent. So `mineClause` in workers/content stays. */
export type HelpScope = "all" | "archived"

/** THE SECOND STRIP (CHECKLIST 5.1): sub-tabs by TYPE beneath All / My /
 * Archived, plus the two stage tabs and the triage queue.
 *
 * ONE STRING FOR TWO KINDS OF NARROWING, and the prefix is what tells them apart:
 * `type:Question` is the team's own `Ticket type` vocabulary (so the strip is
 * DERIVED from their values — retiring a word on the Dropdown values screen
 * retires its tab) and `status:ready` is the fixed lifecycle. `all` is neither.
 * `triage` is not a filter at all: it swaps the collection for the triage queue,
 * which is a different screen wearing the same tab strip (5.11).
 *
 * A string rather than an object because it is a TAB VALUE — the library's
 * `TabsView` hands back the value it was given, and an object would have to be
 * encoded into one anyway. */
export type HelpFacet = string

/** Split a facet token into the two filters the door parses. `triage` and `all`
 * narrow nothing; the caller decides what to render for the first. */
export function helpFacetFilter(facet: HelpFacet): {
  helpType?: string
  status?: HelpTicket["status"]
} {
  if (facet.startsWith("type:")) return { helpType: facet.slice(5) }
  // The ONE cast, where the value is built. The two stage tabs are named after
  // real statuses (`status:ready`, `status:resolved`) and a `slice` cannot know
  // that — so it is asserted here rather than at each call site, which is what
  // was happening and is how two places came to spell the same fact differently.
  if (facet.startsWith("status:")) return { status: facet.slice(7) as HelpTicket["status"] }
  return {}
}

/** The cache key for one sub-tab of one scope. It carries BOTH, because the two
 * strips compose: "my questions" and "all questions" are different pages, and a
 * key that named only the facet would show one under the other's badge. */
export function helpFacetKey(teamId: string, scope: HelpScope, facet: HelpFacet): string {
  return `${helpKey(teamId, scope)}::${facet}`
}

/** Row-level live registry: a "<resource> row <id> changed" ping → re-pull JUST
 * that row and patch it into the cached list (never refetch the whole list);
 * then refresh the small dependent aggregations/feeds coarsely. Adding a module
 * = ONE entry here; the shell's handler stays generic. */
export const TEAM_RESOURCES: Record<
  string,
  {
    key: (teamId: string) => string
    idField: string
    fetchOne: (id: string) => Promise<Record<string, unknown> | null>
    /** re-pull the WHOLE list — used by reconnect catch-up to diff-patch it. */
    fetchList: (teamId: string) => Promise<Record<string, unknown>[]>
    /** small dependent caches to coarse-invalidate (aggregations / feeds). */
    deps?: (teamId: string, id: string) => string[]
    /** A cache-key PREFIX covering this collection's record-scoped slices, for
     * the collections that have them. `deps` is given the ping's row id, which
     * is enough to name a key derived from THAT row; it is not enough when the
     * slice is keyed by a DIFFERENT record (the story a work log sits against).
     * Everything under the prefix is dropped and re-read. */
    slicePrefix?: string
    /** refresh the active-team context (e.g. the section member count). */
    refreshCtx?: boolean
  }
> = {
  members: {
    key: (t) => `members:${t}`,
    idField: "userId",
    fetchOne: (id) => tenancy.member(id),
    fetchList: () => tenancy.members().then((r) => r.members),
    deps: (t, id) => [`member_roles:${t}`, `activity:user:${id}`],
    refreshCtx: true,
  },
  member_roles: {
    key: (t) => `member_roles:${t}`,
    idField: "id",
    fetchOne: (id) => tenancy.role(id),
    fetchList: (t) => listFetch.roles(t),
    deps: (t, id) => [`my-perms:${t}`, `role-perms:${id}`],
  },
  invites: {
    key: (t) => `invites:${t}`,
    idField: "id",
    fetchOne: (id) => tenancy.invite(id),
    fetchList: (t) => listFetch.invites(t),
    // The invite detail also shows the invite_logs audit + that invite's activity;
    // refresh both when the invite row changes (revoke/accept) so the detail stays live.
    deps: (_t, id) => [`invite-audit:${id}`, `activity:invite:${id}`],
  },
  // Dropdown values — row-level live (was a DEAF publisher before R15: the worker
  // pinged `selectable_data` and nothing listened, so a teammate's edit left the
  // manager stale until a reload).
  // THE SECTIONS OF AN APP — row-level, so renaming one reaches the ticket form,
  // the ticket list's filter and the app's own Modules tab without any of them
  // refetching a list. The tab badge follows through `deps`: adding a section
  // moves the number on whichever app screen is open.
  app_modules: {
    key: (t) => appModulesKey(t),
    idField: "id",
    fetchOne: (id) => tenancy.appModuleOne(id),
    fetchList: () => tenancy.appModules().then((r) => r.modules),
    deps: (_t, id) => [`activity:record:app_modules:${id}`, ...recordCountDeps("app_modules")],
  },
  selectable_data: {
    key: (t) => `selectable:${t}`,
    idField: "id",
    fetchOne: (id) => tenancy.selectableOne(id),
    fetchList: (t) => listFetch.selectable(t),
    // R15 REACHES THE OPEN RECORD TOO, not just the list. The detail screen
    // reads its own single-row key and its own activity feed, and neither is the
    // list row the patch above replaces — so a teammate renaming a value while
    // somebody has it open would leave that screen stale, which is the exact
    // deafness this resource was written to fix one level up.
    deps: (t, id) => [selectableOneKey(t, id), `activity:record:selectable_data:${id}`],
  },
  // THE CUSTOMER SPINE — three resources, one row-level target. `accounts` pings
  // carry the account id, and so do `account_links` / `portal_users`: a contact
  // and a login are read ONLY on their account's detail (neither has a list of
  // its own), so the account is the one row a listener can act on. All three
  // therefore patch the same accounts list and refresh the same open record —
  // which is why none of them needs a DEAF_EXEMPT line any more.
  accounts: {
    key: (t) => accountsKey(t),
    idField: "id",
    fetchOne: (id) => tenancy.accountRow(id),
    fetchList: (t) => listFetch.accounts(t),
    // `companiesKey` rides as a dep rather than a second resource: a renamed or
    // deactivated company must reach the client pickers too, and a coarse
    // invalidate is honest for a 24-row list.
    deps: (t, id) => [accountKey(id), `activity:record:accounts:${id}`, companiesKey(t)],
  },
  account_links: {
    key: (t) => accountsKey(t),
    idField: "id",
    fetchOne: (id) => tenancy.accountRow(id),
    fetchList: (t) => listFetch.accounts(t),
    // The contacts list + its badge live inside the opened record's cache.
    deps: (_t, id) => [accountKey(id), `activity:record:accounts:${id}`],
  },
  portal_users: {
    key: (t) => accountsKey(t),
    idField: "id",
    fetchOne: (id) => tenancy.accountRow(id),
    fetchList: (t) => listFetch.accounts(t),
    deps: (_t, id) => [accountKey(id), `activity:record:accounts:${id}`],
  },
  // The knowledge base — row-level live. Adding a source, correcting one or
  // taking one away patches just that row in the cached list; the SWEEP's ping
  // carries no id (a slice touches many rows and no one row is the change),
  // which the shell reads as "re-read this collection" instead.
  knowledge: {
    key: (t) => knowledgeKey(t),
    idField: "id",
    fetchOne: (id) => contentApi.knowledgeOne(id),
    fetchList: (t) => listFetch.knowledge(t),
    // The source's own history — the Activity tab on its screen — and the
    // by-id read the detail falls back to when the row is past page one.
    deps: (_t, id) => [`activity:record:knowledge_sources:${id}`, `knowledge:one:${id}`],
  },
  // Tickets — row-level live. A status change / new reply (postHelpReply
  // pings `help` too) patches just that ticket in the cached "all" set.
  help: {
    key: (t) => `help:${t}`,
    idField: "id",
    fetchOne: (id) => contentApi.helpOne(id),
    fetchList: (t) => listFetch.help(t),
    // A status change / edit / reply / stakeholder-add on a ticket also refreshes
    // its Activity tab + Stakeholders tab. The My list is a SERVER-scoped page, so
    // it can't be row-patched from here — drop it and it reloads page one.
    // …and the PULSE, whose open-ticket number and stage chart are counted off
    // this collection. A derived cache has no row to patch, so it is dropped and
    // re-read — and only actually re-read when a screen is showing it.
    // …and the TAB BADGES of any record counting tickets — an app's Tickets tab,
    // a contact's — which are now answered when the record opens rather than
    // when the tab is clicked, so nothing else would ever re-read them (R15).
    deps: (t, id) => [
      `activity:record:help:${id}`,
      `help-stakeholders:${id}`,
      // THE OPEN CONVERSATION. A reply pings help_threads (deaf on this door —
      // its id is the REPLY's) and the parent help row (this ping, whose id IS
      // the ticket) — so the thread cache drops here, and somebody watching the
      // conversation sees the answer land without reopening the tab. Earned the
      // day the composer was fixed and the thread still only moved on reload.
      `help-thread:${id}`,
      `total:help-thread:${id}`,
      `help-mine:${t}`,
      insightsKey(t),
      ...recordCountDeps("help"),
    ],
    // …and every per-account slice of the ticket list — a contact's Tickets tab
    // is one of those, and a slice nobody drops is a tab that goes stale the
    // moment somebody else raises a ticket.
    slicePrefix: "tickets-account-of:",
  },
  // PROCESS MAPS — row-level live. A step edited on somebody else's screen
  // patches just that map in the cached list; the deps carry the parts of the
  // record that move with it: the opened map, its conversation, its history, and
  // the SAVINGS, because a duration changing is precisely when a value figure
  // stops being true.
  // A WAVE — what a client bought. A ping patches the wave row in the list; the
  // deps carry the two things that move with it: the record's own screen (which
  // reads its sprints and their clashes, and is not a row out of this list) and
  // its history. A wave's dates move when a SPRINT moves, and the door publishes
  // `waves` on exactly those writes — so this is how the list and the open
  // record both learn about a change neither of them made.
  // WHAT A CALL PROPOSED — row-level live. Applying or discarding on somebody
  // else's screen patches just that draft in the cached list; the deps carry the
  // open review screen, the MAP whose steps just changed, and the SAVINGS, because
  // steps landing is exactly when a value figure stops being true.
  process_drafts: {
    key: (t) => processDraftsKey(t),
    idField: "id",
    fetchOne: (id) => tenancy.processDraftRow(id) as Promise<Record<string, unknown> | null>,
    fetchList: (t) => listFetch.processDrafts(t) as Promise<Record<string, unknown>[]>,
    deps: (t, id) => [processDraftKey(id), processesKey(t), impactKey(t)],
  },
  waves: {
    key: (t) => wavesKey(t),
    idField: "id",
    fetchOne: (id) => wavesApi.one(id).then((r) => r.wave as unknown as Record<string, unknown>),
    fetchList: (t) => listFetch.waves(t),
    deps: (_t, id) => [waveOneKey(id), `activity:record:waves:${id}`],
  },
  processes: {
    key: (t) => processesKey(t),
    idField: "id",
    fetchOne: (id) => tenancy.processRow(id),
    fetchList: (t) => listFetch.processes(t),
    deps: (t, id) => [
      processKey(id),
      processCommentsKey(id),
      `activity:record:processes:${id}`,
      impactKey(t),
      // …and the per-ACCOUNT Impact tab, which was in no deps list at all: the
      // stamp map made the CLIENT's Impact screen live while the agency's own
      // view of the same figures stayed still (round-three realtime review).
      // The ping names the map, not the account, so the family is dropped and
      // whatever is on screen re-reads — cache-first, so nothing costs.
      ...cachedKeys("impact:account:"),
      // …and the Process maps badge on whichever app screen is open (R15).
      ...recordCountDeps("processes"),
    ],
    // …and any OLDER version somebody has open. A cut is a `processes` ping, and
    // it is the one event that changes what an old version IS — the version that
    // was current a moment ago is now one of these. The ping names the map, not
    // the version, so the honest answer is to drop the family and let whatever is
    // on screen re-read (cache-first: a slice nobody is looking at costs nothing).
    slicePrefix: PROCESS_VERSION_SLICES,
  },
  // A comment carries the PROCESS id — a conversation is only ever read on its
  // own map, so that is the one row a listener can act on. It refreshes the
  // value too: a staff explanation attached to a step is what the client's side
  // shows beside a step that got slower.
  process_comments: {
    key: (t) => processesKey(t),
    idField: "id",
    fetchOne: (id) => tenancy.processRow(id),
    fetchList: (t) => listFetch.processes(t),
    deps: (t, id) => [processKey(id), processCommentsKey(id), impactKey(t)],
  },
  // THE WORK ENGINE — row-level live. Somebody else moving a story to in review
  // patches just that row in the cached backlog; the deps carry the parts of the
  // record that move with it: the story's own history, and the SPRINT list,
  // whose per-sprint "3 of 8 done" counts are computed from exactly these rows.
  stories: {
    key: (t) => storiesKey(t),
    idField: "id",
    fetchOne: (id) => contentApi.storyOne(id),
    fetchList: (t) => listFetch.stories(t),
    // …and the Stories badge on whichever app, sprint or ticket is open (R15).
    //
    // AND THE STORY'S OWN SCREEN. `story-detail.tsx` does not read its row out of
    // the list — it fetches the one story into `story:one:<id>`, which the row
    // patch above cannot reach. So starting a timer moved the story to In
    // progress on the server, published the ping, patched the list, refreshed the
    // activity feed — and left the open record showing "Open" until somebody
    // reloaded. Reported 19 Aug 2026 by the owner, who watched exactly that.
    //
    // `knowledge` had this right (`knowledge:one:<id>` is in its own deps) and
    // this did not, which is why the census beside R15 now reads every
    // `<module>:one:` key a component holds and demands it appear here.
    deps: (t, id) => [
      `activity:record:stories:${id}`,
      `story:one:${id}`,
      sprintsKey(t),
      insightsKey(t),
      ...recordCountDeps("stories"),
    ],
  },
  // A sprint has a list of its own, and its rows carry counts of the stories
  // inside it — so a sprint ping patches the sprint row and leaves the backlog
  // alone. (A story ping does the reverse, above.)
  sprints: {
    key: (t) => sprintsKey(t),
    idField: "id",
    fetchOne: (id) => contentApi.sprintOne(id),
    fetchList: (t) => listFetch.sprints(t),
    // …and the Sprints badge on whichever client or app record is open (R15).
    deps: (_t, id) => [`activity:record:sprints:${id}`, ...recordCountDeps("sprints")],
  },
  // TIME — row-level live, and the one resource whose ping most often lands on
  // the person who caused it: the header timer is on every screen, so starting
  // one in a dialog has to show up in the bar above it without a reload. The deps
  // carry the two things a row of time changes besides itself — the running-timer
  // bar, and the backlog, whose stories now have more hours against them.
  work_logs: {
    key: (t) => workLogsKey(t),
    idField: "id",
    fetchOne: (id) => contentApi.workLogOne(id),
    fetchList: (t) => listFetch.workLogs(t),
    deps: (t, id) => [
      runningTimersKey(t),
      storiesKey(t),
      `activity:record:work_logs:${id}`,
      // …and the hours-per-week chart, which is a SUM over exactly these rows.
      insightsKey(t),
      // …and the Time BADGE on whichever story, ticket, task or meeting is open
      // (R15). The rows below it are dropped by the slice prefix; the number
      // above it is a different cache key, and a count fetched once and never
      // re-read is worse than a blank one because it looks right.
      ...recordCountDeps("work_logs"),
    ],
    // …and the Time tab on whichever record this row was logged against, which
    // the ping cannot name (recordTimeKey above says why it is a family drop).
    slicePrefix: TIME_SLICE_PREFIX,
  },
  // TO-DOS — row-level live, and the one work-engine resource a CLIENT hears
  // about too (the portal has its own listener map). A contact completing one in
  // their portal has to appear on our screen without a reload, because the next
  // thing somebody here does is act on it.
  todos: {
    key: (t) => todosKey(t),
    idField: "id",
    fetchOne: (id) => contentApi.todoOne(id),
    fetchList: (t) => listFetch.todos(t),
    // …and the To-dos badge on whichever client's record is open (R15) — the one
    // of these a CLIENT can move, from their own portal, while we are looking.
    deps: (_t, id) => [`activity:record:todos:${id}`, ...recordCountDeps("todos")],
  },
  // TASKS — our own admin, agency-side only. The row-level patch lands on the
  // OPEN list; the OTHER FIVE views are dropped instead, because a task that has
  // just been ticked leaves one collection and joins another, and "patch the row
  // in place" has no answer for a row that changed which list it belongs to.
  // R15: every one of the six is named here, so a view that gained a tab did not
  // silently gain a list nothing keeps live.
  tasks: {
    key: (t) => tasksKey(t, "open"),
    idField: "id",
    fetchOne: (id) => contentApi.taskOne(id),
    fetchList: (t) => listFetch.tasks(t, "open"),
    deps: (t, id) => [
      ...TASK_VIEWS.filter((v) => v !== "open").map((v) => tasksKey(t, v)),
      `activity:record:tasks:${id}`,
      insightsKey(t),
    ],
  },
  // MEETINGS — row-level live. A paged list's rows live in a cache key with its
  // cursor in a sidecar, so the same registry keeps it live (R15's own words).
  // The calendar push moves this row too, which is why "it is in Meetings"
  // appears without a reload on the screen that asked for it.
  meetings: {
    key: (t) => meetingsKey(t),
    idField: "id",
    fetchOne: (id) => contentApi.meetingOne(id),
    fetchList: (t) => listFetch.meetings(t),
    // THE THREE READS A MEETING'S DETAIL SCREEN MAKES BESIDE THE ROW. Its
    // activity feed, who on the invitation we know, and what was said. All three
    // hang off the meeting rather than being fetched with it — a page of
    // meetings is fifty and a transcript is up to a megabyte — so a ping
    // about this row has to drop them too, or a re-synced guest list would sit
    // stale behind a record that had visibly just changed (R15).
    //
    // …and the team's own pulse, which counts THIS WEEK'S meetings: a meeting
    // that appears or is cancelled moves a number on Home, and a stale
    // headline beside a list that just changed is the same fault one line up.
    //
    // …and the Meetings badge on whichever app or contact record is open, for
    // the same reason one line up: the badge is answered when the record opens,
    // so nothing else would ever re-read it (R15).
    // …AND THE MEETING'S OWN SCREEN, when it is reading one. `meeting-detail.tsx`
    // takes its row from the meetings list's page when the meeting is on it and falls
    // back to `meeting:one:<id>` when it is not — so the row patch above covered
    // the meetings somebody browses to and missed every one they deep-link into.
    // The same fault as the story timer, in a branch, which is why the census
    // beside R15 reads the KEY rather than the screen.
    deps: (t, id) => [
      ...recordCountDeps("meetings"),
      `activity:record:meetings:${id}`,
      `meeting:one:${id}`,
      meetingPeopleKey(id),
      meetingTranscriptKey(id),
      insightsKey(t),
    ],
    // THE PER-OWNER SLICES OF THE MEETINGS LIST — a contact's Meetings tab
    // (`meetings-account-of:`) and an app's (`meetings-app-of:`). One prefix
    // covers both because `sliceKey` spells every slice `<kind>-of:<id>` and
    // both kinds start with the module's own name. It cannot reach the list key
    // itself, which is `meetings:<teamId>` — a colon where this has a hyphen.
    slicePrefix: "meetings-",
  },
  // A rate card ping carries the ACCOUNT it sits on — a card is only ever read on
  // its account's own screen, so the account is the row a listener can act on.
  // The same shape `account_links` and `portal_users` already have, and for the
  // same reason: neither has a list of its own.
  // ── THE AGENCY'S OWN HOUSEKEEPING ────────────────────────────────────────
  // Four resources, row-level, one per table. Each patches just the changed row
  // in its own list and refreshes that record's history — the same shape every
  // other content module here has.
  brand_assets: {
    key: (t) => brandAssetsKey(t),
    idField: "id",
    fetchOne: (id) => contentApi.brandAssetOne(id),
    fetchList: (t) => listFetch.brandAssets(t),
    deps: (_t, id) => [`activity:record:brand_assets:${id}`],
  },
  meeting_purposes: {
    key: (t) => purposesKey(t),
    idField: "id",
    fetchOne: (id) => contentApi.meetingPurposeOne(id),
    fetchList: (t) => listFetch.purposes(t),
    deps: (_t, id) => [`activity:record:meeting_purposes:${id}`],
  },
  // A profile and a certificate have no by-id read door of their own, because
  // neither is ever opened on a screen of its own — both are read on the
  // MEMBER's page, from the whole (small, one-per-member) set. So the row-level
  // fetchOne re-reads the set and picks the row out, which is the honest way to
  // patch one row when the door answers in collections.
  staff_profiles: {
    key: (t) => staffProfilesKey(t),
    idField: "id",
    fetchOne: (id) => contentApi.staffProfiles().then((r) => r.profiles.find((p) => p.id === id) ?? null),
    fetchList: (t) => listFetch.staffProfiles(t),
    deps: (_t, id) => [`activity:record:staff_profiles:${id}`],
  },
  staff_certificates: {
    key: (t) => staffCertificatesKey(t),
    idField: "id",
    fetchOne: (id) => contentApi.staffCertificates().then((r) => r.certificates.find((c) => c.id === id) ?? null),
    fetchList: (t) => listFetch.staffCertificates(t),
    deps: (_t, id) => [`activity:record:staff_certificates:${id}`],
  },
  // WHAT WE HANDED OVER — and the ping carries the APP it sits on, not the
  // deliverable's own id. The same shape `account_rates`, `account_links` and
  // `portal_users` already have, for the same reason: a deliverable has no list
  // and no screen of its own, it is only ever read on the app it belongs to, so
  // the APP is the one row a listener can act on. A ping naming the deliverable
  // would name a row nothing holds, and the app it hangs off is on that row —
  // which the listener has not read and never will.
  deliverables: {
    key: (t) => appsKey(t),
    idField: "id",
    fetchOne: (id) => tenancy.apps().then((r) => r.apps.find((a) => a.id === id) ?? null),
    fetchList: (t) => listFetch.apps(t),
    // The shelf itself, and the badge above it. Both are named exactly, because
    // the ping said which app.
    deps: (_t, appId) => [deliverablesKey(appId), ...recordCountDeps("deliverables")],
  },
  account_rates: {
    key: (t) => accountsKey(t),
    idField: "id",
    fetchOne: (id) => tenancy.accountRow(id),
    fetchList: (t) => listFetch.accounts(t),
    // The ping carries the ACCOUNT, so the record's own counts key is nameable
    // directly — but it goes through the same derivation as everything else, so
    // there is one answer to "which badges does this resource move" rather than
    // one general one and one special case (R15).
    deps: (_t, id) => [ratesKey(id), marginKey(id), accountKey(id), ...recordCountDeps("account_rates")],
  },
  // APPS — row-level live now that they have a list and a record screen of their
  // own. Like the staff profiles above, an app has no by-id read door (it is
  // never opened from anywhere but the whole, small, bounded set), so the
  // row-level fetchOne re-reads the set and picks the row out — the honest way
  // to patch one row when the door answers in collections. The deps carry what
  // moves with an app: the savings drilled through it, and the sprints and
  // stories whose rows say its name.
  apps: {
    key: (t) => appsKey(t),
    idField: "id",
    fetchOne: (id) => tenancy.apps().then((r) => r.apps.find((a) => a.id === id) ?? null),
    fetchList: (t) => listFetch.apps(t),
    // …and the Apps badge on whichever client's record is open (R15).
    deps: (t, id) => [
      impactKey(t),
      // THE APP'S OWN MONEY PANEL, keyed by the app — which is the row this
      // ping names. The `apps` ping fires when a process's role changes
      // (routes/processes.ts), and that figure is computed from exactly that:
      // the panel was left re-reading only on its own mount, so a colleague's
      // edit moved a number nobody's open screen heard about (round-three
      // realtime review).
      appMoneyKey(id),
      sprintsKey(t),
      storiesKey(t),
      `activity:record:apps:${id}`,
      ...recordCountDeps("apps"),
    ],
  },
}

/** Coarse listeners for resources with no row-shaped cache: the ping just drops
 * these keys (cache-first refetch on next read). Part of the R15 listener set. */
/** THE KEYS THE LIVE LAYER DEMONSTRABLY MOVES, for this team.
 *
 * `useCached` uses this to decide whether it may paint from cache without
 * re-asking the server (shared/web/store.ts `registerLiveCoverage`). The whole
 * point of the socket is that it tells us when something changed; revalidating
 * on every mount anyway is asking a question we are already being sent the
 * answer to, and it is why moving between two screens the app already had in
 * memory still waited on the network.
 *
 * IT IS DELIBERATELY CONSERVATIVE, and under-claiming is the safe direction. It
 * names the COLLECTION keys — every `TEAM_RESOURCES` entry's own key, every
 * `SIMPLE_INVALIDATIONS` target, and the team feed that any change refreshes —
 * and it does NOT try to name the record-scoped `deps` or `slicePrefix` keys,
 * which are parameterised by a row id this function does not have. Those simply
 * keep revalidating exactly as they did before, which costs a request and can
 * never be wrong. A key that is not here is not a bug; a key that is here
 * wrongly is a screen that goes quietly stale, so the list is derived from the
 * registry itself and never hand-written.
 *
 * Derived, not listed, for the same reason R15 makes the registry the one
 * source: a resource added tomorrow is covered without anybody remembering
 * this function exists. */
export function liveCoveredKeys(teamId: string): Set<string> {
  const keys = new Set<string>([`activity:team:${teamId}`])
  for (const r of Object.values(TEAM_RESOURCES)) keys.add(r.key(teamId))
  for (const simple of Object.values(SIMPLE_INVALIDATIONS))
    for (const k of simple(teamId)) keys.add(k)
  return keys
}

export const SIMPLE_INVALIDATIONS: Record<string, (teamId: string) => string[]> = {
  // Team name/logo — the shell also refreshes the active context (see app-shell).
  team: (t) => [`team-meta:${t}`],
  // Per-team screen-recipe overrides (was a deaf publisher before R15).
  screens: (t) => [`screens:${t}`],
  // The agency's own cost card is TEAM-wide (an internal rate belongs to the
  // agency, not to any account), so a coarse drop is the whole of it. The MARGIN
  // caches it feeds are keyed per account and cannot be enumerated from here —
  // the margin panel closes that itself by re-reading when the rate card it also
  // shows changes underneath it (see margin-panel.tsx).
  internal_rates: (t) => [internalRatesKey(t)],
  // The ROLE rate card, beside it and for the same reason: it is one small
  // settled list read whole on one screen, so a coarse drop is the whole of the
  // answer. The per-app money it feeds is keyed by app and cannot be enumerated
  // from here — that panel re-reads when the card it is computed from changes,
  // exactly as the margin panel does.
  role_rates: (t) => [roleRatesKey(t)],
  // THE CLIENT'S OWN ORGANISATION — departments, roles and tools. A coarse drop
  // for the same reason as the two rate cards above: each is a small, bounded,
  // settled list (R14 hard cap, and a company has a handful of each), read whole
  // on the client's own record. There is nothing here that a row-level patch
  // would save that re-reading the list does not.
  //
  // THE KEY IS TEAM-WIDE, not per client, and that is what makes the coarse drop
  // possible at all: `SIMPLE_INVALIDATIONS` is handed a team and nothing else, so
  // a per-client key would be one this function could not name — it would have
  // to guess an account id, and a listener that names the wrong key is a screen
  // that goes quietly stale, which is the exact failure R15 exists to stop. The
  // screen narrows to the client it is showing; the door fences by scope either
  // way, so a client login still only ever receives its own.
  client_departments: (t) => [clientDepartmentsKey(t)],
  client_roles: (t) => [clientRolesKey(t)],
  client_tools: (t) => [clientToolsKey(t)],
  // The rota has no list of its own: it is one line above the ticket list saying
  // whose week it is, read together with the backlog it is about. A ping drops
  // both, because the answer to "is anything sitting?" moves with the answer to
  // "whose job is it?".
  triage_duty: (t) => [triageKey(t)],
  // `work` is not a table — it is the MODULE the import engine pings after it
  // writes a file of stories, and a file writes many rows with no one row to
  // patch. So the backlog is dropped and re-read, and the sprint list with it,
  // because a sprint row carries the counts of the stories inside it.
  // …and the pulse with them: a file of stories moves the backlog number Home
  // shows, and an import is the one write that moves it by hundreds at once.
  // …and the tab badges of any record open at the time. An import is the one
  // write that moves those by hundreds at once, and it is also the one that
  // carries no row id — so the per-row `deps` path below never runs for it, and
  // this is the only place the badges hear about it (R15).
  work: (t) => [storiesKey(t), sprintsKey(t), insightsKey(t), ...recordCountDeps("stories")],
  // THE IMPORT'S OWN PINGS. The import engine publishes each TargetDef's MODULE
  // key (never a row id — a batch touches many rows and no one row is the
  // change), so one module name reaches the live layer that no single table
  // owns: `delivery`, whose table is `meeting_purposes`. A coarse drop is the
  // whole of the answer, and it is the same shape the knowledge sweep's ping
  // already has. (`brand_assets` needs no line: its module key and its table
  // name are one word, so the row-level listener above already claims it.)
  delivery: (t) => [purposesKey(t)],
  // GOOGLE CONNECTIONS. A coarse drop rather than a row-level patch, because the
  // card holds ONE answer (your connections AND the folders and spaces under
  // them) rather than a list of rows: a connection changing means the sources
  // under it may have changed too, and there is no row-shaped cache to patch.
  //
  // It is pinged on the TEAM channel like everything else, so every member's
  // cache is dropped when any member connects — a cheap and slightly wasteful
  // honesty. It is not wrong: the key is per team and the door answers about the
  // CALLER, so a colleague's ping only ever makes somebody re-read their own
  // (unchanged) connections. Publishing to a person's own channel instead would
  // be more precise and would leave the resource with no listener here at all,
  // which is the shape R15 exists to prevent.
  google: (t) => [googleKey(t)],
}

/** The one cache key the Google settings card lives in. */
export function googleKey(teamId: string): string {
  return `google:${teamId}`
}
