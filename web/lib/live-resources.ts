"use client"

// The LIVE-LISTENER registry (R15): every resource string any worker publishes
// must REACH a listener here — a row-level entry (TEAM_RESOURCES), a coarse
// invalidation (SIMPLE_INVALIDATIONS), or a reasoned DEAF_EXEMPT entry in the
// rules registry. Publishing to nobody is the silent half of the stale-screen
// bug, so the check derives the publisher set by scanning publishChange calls
// and fails the build on any resource no listener claims. Lives in lib (not the
// shell component) so the check can import it as data.
//
// The list fetchers here ALSO prime the `total:` sidecar each door now returns
// (R16): a badge shows the server COUNT(*), never rows.length, so whoever pulls
// a list primes its total in the same round-trip.

import { content as contentApi, tenancy } from "@/lib/api"
import { TASK_VIEWS, type HelpTicket, type TaskViewName } from "@shared/types"
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
    contentApi.help("all").then((r) => {
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
    contentApi.help("all", null, "archived").then((r) => {
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
      .help(
        "all",
        null,
        scope === "archived" ? "archived" : "live",
        undefined,
        undefined,
        f.helpType,
        f.status as HelpTicket["status"] | undefined
      )
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
  meetings: (teamId: string) =>
    contentApi.meetings().then((r) => {
      primeCache(totalKey("meetings", teamId), r.total)
      // THE WEEK'S OWN EXACT TOTAL, off the same response (9.1). The three-view
      // strip badges two server counts and asks for one page — the week is
      // decided by the door, so the badge and the rows can never mean two
      // different weeks (R16).
      primeCache(totalKey("meetings-week", teamId), r.weekTotal)
      primeCache(cursorKey(meetingsKey(teamId)), r.nextCursor)
      return r.meetings
    }),
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

/** The diary's cache key (the paged meetings list). */
export function meetingsKey(teamId: string): string {
  return `meetings:${teamId}`
}

/** WHICH OF ONE MEETING'S GUESTS WE KNOW — its own key because it is its own
 * read: who was invited is on the row, and who they are TO US is a question with
 * a different lifetime (a contact added next week should light up on a meeting
 * held last week). */
export function meetingPeopleKey(id: string): string {
  return `meeting:people:${id}`
}

/** ONE MEETING'S TRANSCRIPT — its own key because it is its own read, and that
 * is a size decision: a page of the diary is fifty meetings and a transcript is
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
export function valueKey(teamId: string): string {
  return `value:${teamId}`
}
/** The same drill-down NARROWED to one client — what their work has given them
 * back, summed across their apps. Its own key beside the team-wide one, because
 * they are two different questions and one cache cannot hold both answers. */
export function accountValueKey(accountId: string): string {
  return `value:account:${accountId}`
}
/** The systems we've built (bounded, team-wide) — a filter and a heading on the
 * maps screen, and the names inside the value drill-down. */
export function appsKey(teamId: string): string {
  return `apps:${teamId}`
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

/** One account's own cache: the opened record, with its people, its logins and
 * their exact totals. Keyed by the ACCOUNT, so moving between records never
 * clobbers the one you came from. (There was a second key here — the accounts
 * nested under this one — and it went with the tab that read it, 7.2.) */
export function accountKey(accountId: string): string {
  return `account:${accountId}`
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
export function helpFacetFilter(facet: HelpFacet): { helpType?: string; status?: string } {
  if (facet.startsWith("type:")) return { helpType: facet.slice(5) }
  if (facet.startsWith("status:")) return { status: facet.slice(7) }
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
  selectable_data: {
    key: (t) => `selectable:${t}`,
    idField: "id",
    fetchOne: (id) => tenancy.selectableOne(id),
    fetchList: (t) => listFetch.selectable(t),
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
    deps: (_t, id) => [accountKey(id), `activity:record:accounts:${id}`],
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
  processes: {
    key: (t) => processesKey(t),
    idField: "id",
    fetchOne: (id) => tenancy.processRow(id),
    fetchList: (t) => listFetch.processes(t),
    deps: (t, id) => [
      processKey(id),
      processCommentsKey(id),
      `activity:record:processes:${id}`,
      valueKey(t),
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
    deps: (t, id) => [processKey(id), processCommentsKey(id), valueKey(t)],
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
    deps: (t, id) => [
      `activity:record:stories:${id}`,
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
  // The calendar push moves this row too, which is why "it is in your diary"
  // appears without a reload on the screen that asked for it.
  meetings: {
    key: (t) => meetingsKey(t),
    idField: "id",
    fetchOne: (id) => contentApi.meetingOne(id),
    fetchList: (t) => listFetch.meetings(t),
    // THE THREE READS A MEETING'S DETAIL SCREEN MAKES BESIDE THE ROW. Its
    // activity feed, who on the invitation we know, and what was said. All three
    // hang off the meeting rather than being fetched with it — a page of the
    // diary is fifty meetings and a transcript is up to a megabyte — so a ping
    // about this row has to drop them too, or a re-synced guest list would sit
    // stale behind a record that had visibly just changed (R15).
    //
    // …and the team's own pulse, which counts THIS WEEK'S meetings: a diary
    // entry that appears or is cancelled moves a number on Home, and a stale
    // headline beside a list that just changed is the same fault one line up.
    //
    // …and the Meetings badge on whichever app or contact record is open, for
    // the same reason one line up: the badge is answered when the record opens,
    // so nothing else would ever re-read it (R15).
    deps: (t, id) => [
      ...recordCountDeps("meetings"),
      `activity:record:meetings:${id}`,
      meetingPeopleKey(id),
      meetingTranscriptKey(id),
      insightsKey(t),
    ],
    // THE PER-OWNER SLICES OF THE DIARY — a contact's Meetings tab
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
      valueKey(t),
      sprintsKey(t),
      storiesKey(t),
      `activity:record:apps:${id}`,
      ...recordCountDeps("apps"),
    ],
  },
}

/** Coarse listeners for resources with no row-shaped cache: the ping just drops
 * these keys (cache-first refetch on next read). Part of the R15 listener set. */
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
