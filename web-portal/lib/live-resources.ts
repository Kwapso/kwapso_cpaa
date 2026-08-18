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
  /** ONE ticket, for a cold deep link out of an email — the ticket screen reads
   * the warm list first and only falls back to the by-id door. Named here with
   * the rest because a key spelled at its call site is a key the next screen
   * spells differently. */
  ticket: (ticketId: string) => `portal:ticket:${ticketId}`,
  thread: (ticketId: string) => `portal:thread:${ticketId}`,
  threadTotal: (ticketId: string) => `portal:thread:${ticketId}:total`,
  /** The files and links on one ticket, and the door's exact count beside them —
   * the same rows-plus-sidecar pair the thread uses, keyed the same way and for
   * the same reason (R16: the badge is the server's number, not the list's
   * length). Like the thread's, these are per-TICKET keys: a `help` ping carries
   * a ticket id the listener below is not handed, so an open ticket picks up an
   * attachment the agency added on its next read rather than mid-screen. Every
   * write from THIS side re-primes both keys from the response, so the person
   * doing the attaching never waits. */
  attachments: (ticketId: string) => `portal:attachments:${ticketId}`,
  attachmentsTotal: (ticketId: string) => `portal:attachments:${ticketId}:total`,
  value: "portal:value",
  /** What we are waiting on them for, and what they bought. */
  todos: "portal:todos",
  delivery: "portal:delivery",
  processComments: (processId: string) => `portal:process-comments:${processId}`,
  /** What we handed over. ONE key for the whole screen — the door answers about
   * the company they are standing in and takes no narrowing, so there is no
   * per-app slice to key by, and switching company clears the cache outright. */
  deliverables: "portal:deliverables",
  deliverablesTotal: "portal:deliverables:total",
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
  /** THE MOMENT SOMETHING IS SHARED WITH THEM, their screen says so — which is
   * the whole reason this resource is worth hearing. The agency presses "Show to
   * the client" and the card appears where the client is already looking, rather
   * than the next time they happen to reload.
   *
   * The ping carries an APP id, which names nothing a client holds, so the
   * publisher stamps the ACCOUNT on it and `mayHearChange` fences on that
   * (`deliverables` is in SCOPE_STAMPED_RESOURCES for exactly this). Both keys
   * go, rows and total together: they are two halves of one answer and a stale
   * badge over a fresh list is R16's failure mode arriving by the back door.
   *
   * It also fires for changes the client will never see — a deliverable filed
   * and not shared, a title corrected on a private one. That costs one re-read
   * that comes back identical, and the alternative is a publisher deciding what
   * is worth telling them, which is a fence built in the wrong place. */
  deliverables: () => [cacheKeys.deliverables, cacheKeys.deliverablesTotal],
}

/** WHAT THIS APP ASKS THE CHANNEL FOR — derived from the listener map, never typed.
 *
 * The comment below has always said the interesting part: the team channel carries
 * every module the agency uses and most of them are none of the portal's business.
 * Until now the portal RECEIVED all of them and threw most away — work paid for
 * inside a single-threaded Durable Object, per socket, per ping, on behalf of a
 * listener that was never going to use it. Nine resources instead of everything.
 *
 * Derived so it cannot drift: adding a line to PORTAL_LISTENERS subscribes to it in
 * the same edit. A resource this app handles but forgot to ask for would be a screen
 * that silently stops going live — the failure shape with no symptom. */
export const PORTAL_SUBSCRIPTIONS = Object.keys(PORTAL_LISTENERS)

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
