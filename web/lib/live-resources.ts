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
import { primeCache, readCache } from "@shared/web/store"

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

/** Fetch the NEXT page of a paged collection and APPEND it to the loaded prefix —
 * never a refetch of what's already on screen. Returns false when there was
 * nothing more to load (so the caller can stop asking). The cursor is opaque: it
 * only ever travels cache → door → cache. */
export async function loadMore<T>(
  listKey: string,
  fetchPage: (cursor: string) => Promise<{ rows: T[]; nextCursor: string | null }>
): Promise<boolean> {
  const cursor = readCache<string | null>(cursorKey(listKey))
  if (!cursor) return false
  const next = await fetchPage(cursor)
  primeCache(listKey, [...(readCache<T[]>(listKey) ?? []), ...next.rows])
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
  learning: (teamId: string) =>
    contentApi.learning().then((r) => {
      primeCache(totalKey("learning", teamId), r.total)
      return r.learning
    }),
  // R14: accounts are PAGED — every company AND every person an agency works with
  // is a row here, so the door answers with a cursor rather than a ceiling. Page
  // one lands in the cache, its next cursor in the sidecar <LoadMore> reads.
  accounts: (teamId: string) =>
    tenancy.accounts().then((r) => {
      primeCache(totalKey("accounts", teamId), r.total)
      primeCache(cursorKey(accountsKey(teamId)), r.nextCursor)
      return r.accounts
    }),
  // The accounts nested UNDER one account — the same paged door, narrowed by
  // parent. Keyed by the ACCOUNT (not the team): it is that record's own list.
  accountChildren: (accountId: string) =>
    tenancy.accounts({ parentId: accountId }).then((r) => {
      primeCache(totalKey("account-children", accountId), r.total)
      primeCache(cursorKey(childrenKey(accountId)), r.nextCursor)
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
      return r.tickets
    }),
  helpMine: (teamId: string) =>
    contentApi.help("mine").then((r) => {
      primeCache(totalKey("help", teamId), r.total)
      primeCache(totalKey("help-mine", teamId), r.mineTotal)
      primeCache(cursorKey(helpKey(teamId, "mine")), r.nextCursor)
      return r.tickets
    }),
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
      primeCache(totalKey("work", teamId), r.total)
      primeCache(totalKey("work-mine", teamId), r.mineTotal)
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
  tasks: (teamId: string) =>
    contentApi.tasks().then((r) => {
      primeCache(totalKey("tasks", teamId), r.total)
      return r.tasks
    }),
  // Sprints are BOUNDED, not paged (a block of sold work grows at the speed of
  // contracts), so there is no cursor sidecar to prime — just the exact total.
  sprints: (teamId: string) =>
    contentApi.sprints().then((r) => {
      primeCache(totalKey("sprints", teamId), r.total)
      return r.sprints
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
export function tasksKey(teamId: string): string {
  return `tasks:${teamId}`
}

export function runningTimersKey(teamId: string): string {
  return `running-timers:${teamId}`
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
/** The savings drill-down, per team — the one number a client is most likely to
 * ask about, so it re-reads whenever any step under it moves. */
export function valueKey(teamId: string): string {
  return `value:${teamId}`
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
export function internalRatesKey(teamId: string): string {
  return `internal-rates:${teamId}`
}

/** The accounts list's cache key (the paged customers list). */
export function accountsKey(teamId: string): string {
  return `accounts:${teamId}`
}

/** One account's own caches: the opened record (with its people, its logins and
 * their exact totals) and the accounts nested under it. Keyed by the ACCOUNT, so
 * moving between records never clobbers the one you came from. */
export function accountKey(accountId: string): string {
  return `account:${accountId}`
}
export function childrenKey(accountId: string): string {
  return `account-children:${accountId}`
}

/** The knowledge-source list's cache key. */
export function knowledgeKey(teamId: string): string {
  return `knowledge:${teamId}`
}

/** The ticket list's cache key. My/All is a SERVER scope, not a client filter:
 * once a list is paged, filtering the loaded page by raiser would show "my
 * tickets in the newest 50" under a badge counting all of them (R16). */
export function helpKey(teamId: string, scope: "mine" | "all"): string {
  return scope === "mine" ? `help-mine:${teamId}` : `help:${teamId}`
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
  // Learning content — row-level live. An edit / (de)activate elsewhere patches
  // just that article in the cached list; the row read passes the team filter so a
  // genuinely-gone item drops out. (Done toggles are personal, not broadcast.)
  learning: {
    key: (t) => `learning:${t}`,
    idField: "id",
    fetchOne: (id) => contentApi.learningOne(id),
    fetchList: (t) => listFetch.learning(t),
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
    deps: (_t, id) => [accountKey(id), childrenKey(id), `activity:record:accounts:${id}`],
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
    deps: (t, id) => [`activity:record:help:${id}`, `help-stakeholders:${id}`, `help-mine:${t}`],
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
    deps: (t, id) => [processKey(id), processCommentsKey(id), `activity:record:processes:${id}`, valueKey(t)],
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
    deps: (t, id) => [`activity:record:stories:${id}`, sprintsKey(t)],
  },
  // A sprint has a list of its own, and its rows carry counts of the stories
  // inside it — so a sprint ping patches the sprint row and leaves the backlog
  // alone. (A story ping does the reverse, above.)
  sprints: {
    key: (t) => sprintsKey(t),
    idField: "id",
    fetchOne: (id) => contentApi.sprintOne(id),
    fetchList: (t) => listFetch.sprints(t),
    deps: (_t, id) => [`activity:record:sprints:${id}`],
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
    deps: (t, id) => [runningTimersKey(t), storiesKey(t), `activity:record:work_logs:${id}`],
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
    deps: (_t, id) => [`activity:record:todos:${id}`],
  },
  // TASKS — our own admin, agency-side only.
  tasks: {
    key: (t) => tasksKey(t),
    idField: "id",
    fetchOne: (id) => contentApi.taskOne(id),
    fetchList: (t) => listFetch.tasks(t),
    deps: (_t, id) => [`activity:record:tasks:${id}`],
  },
  // A rate card ping carries the ACCOUNT it sits on — a card is only ever read on
  // its account's own screen, so the account is the row a listener can act on.
  // The same shape `account_links` and `portal_users` already have, and for the
  // same reason: neither has a list of its own.
  account_rates: {
    key: (t) => accountsKey(t),
    idField: "id",
    fetchOne: (id) => tenancy.accountRow(id),
    fetchList: (t) => listFetch.accounts(t),
    deps: (_t, id) => [ratesKey(id), marginKey(id), accountKey(id)],
  },
}

/** Coarse listeners for resources with no row-shaped cache: the ping just drops
 * these keys (cache-first refetch on next read). Part of the R15 listener set. */
export const SIMPLE_INVALIDATIONS: Record<string, (teamId: string) => string[]> = {
  // Team name/logo — the shell also refreshes the active context (see app-shell).
  team: (t) => [`team-meta:${t}`],
  // Per-team screen-recipe overrides (was a deaf publisher before R15).
  screens: (t) => [`screens:${t}`],
  // An app has no list of its own — it is read on the maps screen (as a filter
  // and a heading) and inside the value drill-down, so a ping drops both.
  apps: (t) => [appsKey(t), valueKey(t)],
  // The agency's own cost card is TEAM-wide (an internal rate belongs to the
  // agency, not to any account), so a coarse drop is the whole of it. The MARGIN
  // caches it feeds are keyed per account and cannot be enumerated from here —
  // the margin panel closes that itself by re-reading when the rate card it also
  // shows changes underneath it (see margin-panel.tsx).
  internal_rates: (t) => [internalRatesKey(t)],
  // `work` is not a table — it is the MODULE the import engine pings after it
  // writes a file of stories, and a file writes many rows with no one row to
  // patch. So the backlog is dropped and re-read, and the sprint list with it,
  // because a sprint row carries the counts of the stories inside it.
  work: (t) => [storiesKey(t), sprintsKey(t)],
}
