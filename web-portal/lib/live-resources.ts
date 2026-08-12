"use client"

// R15 on the CLIENT surface: every resource the portal's screens depend on has a
// listener here, so a reply typed by the agency lands on the client's screen
// without them reloading anything.
//
// The portal publishes NOTHING — it only reads and raises. So the "no deaf
// publishers" half of R15 is satisfied by construction: there is no new resource
// string on this surface. What this file owns is the other half — that the
// resources the portal READS are actually listened to.
//
// Coarse, not row-level, and that is a deliberate difference from the agency
// side. The agency's registry patches a single row into a cached list because
// its lists are long and its screens are dense. A client has one company and a
// handful of tickets; dropping the key and re-reading is simpler code, one
// round-trip, and indistinguishable to the person watching.

import { invalidate } from "@shared/web/store"

/** The portal's cache keys, named in one place so a listener and a screen can
 * never disagree about which string they mean. */
export const cacheKeys = {
  session: "portal:session",
  context: "portal:context",
  company: (accountId: string) => `portal:company:${accountId}`,
  tickets: "portal:tickets",
  ticketsTotal: "portal:tickets:total",
  ticketsCursor: "portal:tickets:cursor",
  thread: (ticketId: string) => `portal:thread:${ticketId}`,
  threadTotal: (ticketId: string) => `portal:thread:${ticketId}:total`,
  value: "portal:value",
  /** What we are waiting on them for, and what they bought. */
  todos: "portal:todos",
  delivery: "portal:delivery",
  processComments: (processId: string) => `portal:process-comments:${processId}`,
}

/** resource → the portal caches a ping on it invalidates. A resource the portal
 * does NOT read is simply absent: the shell ignores it rather than pretending to
 * care, which keeps this list readable as "what the client's screens are made
 * of". */
export const PORTAL_LISTENERS: Record<string, (currentAccountId: string | null) => string[]> = {
  // A reply or a status move on one of their tickets.
  help: () => [cacheKeys.tickets, cacheKeys.ticketsTotal],
  help_threads: () => [cacheKeys.tickets],
  // Their company's own record, its people, or a login on it.
  accounts: (a) => (a ? [cacheKeys.company(a)] : []),
  account_links: (a) => (a ? [cacheKeys.company(a)] : []),
  portal_users: (a) => (a ? [cacheKeys.company(a), cacheKeys.context] : []),
  // A to-do we raised, withdrew, or that a colleague of theirs just completed.
  todos: () => [cacheKeys.todos],
  // A story moving changes the two counts on their ticket rows AND the "3 of 8
  // done" on the sprint block they bought — neither of which they can see the
  // inside of, and both of which they watch.
  stories: () => [cacheKeys.tickets, cacheKeys.delivery],
  sprints: () => [cacheKeys.delivery],
  // A comment on one of their process maps — theirs or ours. The whole value
  // read is dropped rather than the one conversation, because the comment that
  // just landed may be the explanation for a step that got slower, and that
  // changes what the value screen says beside it.
  process_comments: () => [cacheKeys.value],
}

/** Apply one live ping. Unknown resources are ignored — the team channel carries
 * every module the agency uses, and most of them are none of the portal's
 * business. */
export function applyLivePing(resource: string, currentAccountId: string | null): void {
  for (const key of PORTAL_LISTENERS[resource]?.(currentAccountId) ?? []) invalidate(key)
}

/** A dropped-and-recovered socket: re-read everything the screens are showing,
 * because we cannot know what we missed while we were away. */
export function replayAfterReconnect(currentAccountId: string | null): void {
  for (const resource of Object.keys(PORTAL_LISTENERS)) applyLivePing(resource, currentAccountId)
}
