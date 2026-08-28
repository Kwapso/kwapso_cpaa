// Ticket routes: list tickets (My/All tabs = a creator filter), read one ticket's
// thread, raise a ticket, edit it, move its fixed status, and reply. Mirrors the
// learning routes: open with the shared gated opening (teamContext + requireRight
// on the `help` module + defensive body read), parse + 400 on bad input, then
// publishChange (row id + op) so open lists + the thread patch just that row.
// Locked module rules live in lib/help; the reply notify (raiser + @mentions) is
// best-effort in lib/notify.

import { fail, json, pagedJson } from "@shared/workers/http"
import { optionalText, queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { MENTIONS_LIMIT } from "@shared/workers/limits"
import { publishChange } from "@shared/workers/realtime"
import { accountScope, refusePortalCaller, type AccountScope } from "@shared/workers/account-scope"
import { gated, gatedBody } from "@shared/workers/route"
import { resolveOrdering } from "@shared/workers/sorting"
import { requireIdList } from "../lib/bulk"
import {
  addReply,
  bulkSetStatus,
  createTicket,
  getTicket,
  HELP_STATUSES,
  listReplies,
  listTickets,
  markTriaged,
  maybeDraftFirstReply,
  refuseDirectResolve,
  setStatus,
  setTicketArchived,
  setTicketRank,
  updateTicket,
  validateTicket,
  type HelpStatus,
  type TicketFilter,
  type TicketInput,
  countTickets,
  countTicketFacets,
  countReplies,
  bulkSetStatusByFilter,
  TICKET_SORTS,
} from "../lib/help"
import {
  addAttachment,
  countAttachments,
  listAttachments,
  removeAttachment,
} from "../lib/help-attachments"
import { notifyReplyAndMentions, notifyTicketResolved } from "../lib/notify"
import { addStakeholder, listStakeholders } from "../lib/stakeholders"
import { ANY_FILE_TYPE, dataUrlBytes, mediaKey, parseUploadDataUrl, storedContentType } from "@shared/workers/image"
import { safeExternalLink } from "../lib/internal-fields"
import { TICKET_FILE_MAX_BYTES } from "@shared/workers/limits"
import type { Env } from "../env"

/** WHOSE WORLD IS THIS CALLER STANDING IN? Resolved ONCE per request, the same
 * sentence every help door speaks — and the same sentence the WRITES speak,
 * because three of them answered with a page and none of them asked.
 *
 * It used to answer a mere yes/no ("is this a client login?"), because the fence
 * it fed pinned a client to their OWN tickets. Since the owner's ruling that a
 * contact sees their COMPANY's questions (11 Aug 2026) the door has to carry the
 * whole account scope: the company they are standing in, and everything nested
 * beneath it. Staff resolve to `{kind:"staff"}`, which every clause below reads
 * as "no clause at all".
 *
 * A `function`, deliberately, not a `const` arrow: the portal-fence walk follows
 * route-LOCAL helpers by reading function declarations off disk, and a helper it
 * cannot see through is a fence it cannot prove. (It told us so — this was an
 * arrow for about ten minutes and the guard went red.) */
async function callerScope(
  cfg: Parameters<typeof listTickets>[0],
  guard: Parameters<typeof listTickets>[1]
): Promise<AccountScope> {
  return accountScope(cfg, guard)
}

/** EVERY ticket response is a PAGE (R14) — including the one a mutation returns,
 * so a client re-priming its list from a write still learns where page two
 * starts. One seam: rows + exact totals + hasMore + the opaque cursor.
 *
 * `scope` is REQUIRED, and that is the whole fix for the worst bug this file has
 * had: its ancestor defaulted to "not a client login", so `postCreateHelp` — a
 * door the client portal forwards untouched — answered a client's brand-new
 * question with EVERY ticket in the team, other clients' included, description
 * text and all. Nothing was crafted; that was the happy path. A defaulted fence
 * is a fence that fails open the moment someone writes a new door, so there is
 * no default here now. */
async function ticketPage(
  cfg: Parameters<typeof listTickets>[0],
  guard: Parameters<typeof listTickets>[1],
  scope: AccountScope,
  filter: TicketFilter,
  cursor: string | null,
  ordering?: Parameters<typeof listTickets>[5],
  /** THE ROW THIS CALL JUST MADE, when it made one.
   *
   * The create door answers with a PAGE, which is right — every open list wants
   * the new state — but it meant the caller never learned WHICH ticket it had
   * raised. A form that lets somebody attach a screenshot while writing the
   * ticket needs that id: R2 storage is addressed by ticket id, and on a create
   * there is no id until the door answers. Finding it in the page is not an
   * option either, because the list is drag-ranked, so the newest is not
   * reliably first — the same reason the story door hands its id back rather
   * than letting the form guess. */
  createdId?: string
): Promise<Response> {
  const [page, counts, facets] = await Promise.all([
    listTickets(cfg, guard, scope, filter, cursor, ordering),
    // R16: the total is counted over the SAME view the page came from, or the
    // badge is a number the list cannot reach — and over the same SEARCH, the
    // same ACCOUNT, the same KIND and the same STAGE, for the same reason. One
    // `ticketWhere` builds both (lib/help), so they cannot be asked differently.
    countTickets(cfg, guard, scope, filter),
    // …and the SUB-TAB badges (CHECKLIST 5.1), which are the same question asked
    // once per facet. ONE grouped read rather than six counts: the strip is on
    // the screen the team lives in.
    countTicketFacets(cfg, guard, scope, filter),
  ])
  return pagedJson(
    "tickets",
    { ...page, total: counts.total },
    {
      mineTotal: counts.mineTotal,
      byType: facets.byType,
      byStatus: facets.byStatus,
      byAccount: facets.byAccount,
      // Only on the door that made one, so no read carries a field that means
      // nothing on it.
      ...(createdId ? { id: createdId } : {}),
    }
  )
}

/** THE FILTERS THIS DOOR PARSES — read once, in one place, so the list, its
 * count and its sub-tab tally can never be asked different questions (R16) and
 * the machine surface has ONE thing to mirror (R19). Every value goes through the
 * query half of the validation seam at the boundary, where the boundary is. */
function ticketFilterFrom(url: URL): TicketFilter {
  const status = queryText(url.searchParams.get("status"), "Status")
  return {
    tab: queryText(url.searchParams.get("scope"), "Scope") === "mine" ? "mine" : "all",
    view: ticketView(queryText(url.searchParams.get("view"), "View")),
    q: queryText(url.searchParams.get("q"), "Search"),
    // WHOSE tickets — one account's, when the caller names one. A FILTER on top
    // of the fence, never instead of it: naming somebody else's account narrows
    // to rows the fence has already excluded, which is an empty page rather than
    // a leak. It is what a client record's Tickets tab and a contact's own screen
    // ask, so the rows and the badge answer the same question (R16).
    accountId: queryText(url.searchParams.get("accountId"), "Client"),
    // WHICH SYSTEM — the app record's Tickets tab (8.6). Same reasoning as the
    // account narrowing above: a filter over the fence, asked of the SERVER
    // because the list pages, so "this app's tickets among the newest fifty" is
    // an answer that would look like an answer and not be one.
    appId: queryText(url.searchParams.get("appId"), "App"),
    // WHICH SECTION of it — the module. The same filter-over-the-fence reasoning
    // as the two above, and the reason the list can be grouped at all: a module
    // belonging to an app the caller cannot see narrows to rows already excluded.
    moduleId: queryText(url.searchParams.get("moduleId"), "Module"),
    // The sub-tab strip's two halves. The type is the team's OWN vocabulary, so
    // it is not checked against a list here — an unknown word narrows to nothing,
    // which is the honest answer for a type nobody uses.
    helpType: queryText(url.searchParams.get("helpType"), "Type"),
    status: (HELP_STATUSES as readonly string[]).includes(status ?? "")
      ? (status as HelpStatus)
      : undefined,
  }
}

/** LIVE, or the archive drawer. One word, decided in one place, so the list and
 * its count can never be asked different questions. Anything but the exact word
 * "archived" means the everyday list — a fail-safe default, because the everyday
 * list is the one a mistyped parameter should land you in.
 *
 * It takes an ALREADY-VALIDATED string: the `queryText` cap belongs at the call
 * site, on the `searchParams.get` itself, where the boundary actually is (and
 * where workers/content/test/validate.test.ts insists on seeing it — a seam one
 * function inside is a seam a reader of the door cannot see). */
function ticketView(raw: string | undefined): "live" | "archived" {
  return raw === "archived" ? "archived" : "live"
}

/** WHAT A MUTATION ANSWERS WITH: the everyday list, unfiltered. A write re-primes
 * the screen's cache, and the screen re-asks for whatever sub-tab it is on — so a
 * response narrowed to the facets of the request that CAUSED it would hand back a
 * page the caller never asked for. Named once so all five writes agree. */
const EVERYDAY_LIST: TicketFilter = { tab: "all", view: "live" }

/** GET /api/content/help?scope=mine|all  (?id=<ticketId> → just that one). */
export async function getHelp(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "help", "read")
  // The caller's account world decides WHOSE tickets, exactly as it decides
  // whose accounts: their company, and everything nested beneath it.
  const scope = await callerScope(cfg, guard)
  const url = new URL(request.url)
  const filter = ticketFilterFrom(url)
  const id = queryText(url.searchParams.get("id"), "Id")
  // One ticket by id is a LOOKUP, not a page — answer it directly rather than
  // filtering a page (which could legitimately not contain it once paged). It
  // deliberately ignores the view: opening an ARCHIVED ticket by id has to work,
  // or nothing could ever be restored.
  if (id) {
    const one = await getTicket(cfg, guard, scope, id)
    const counts = await countTickets(cfg, guard, scope, filter)
    return pagedJson(
      "tickets",
      { rows: one ? [one] : [], total: counts.total, hasMore: false, nextCursor: null },
      { mineTotal: counts.mineTotal }
    )
  }
  // R14: tickets are a GROWING collection, so the door pages by key — the opaque
  // cursor comes straight back from the previous response. R16: the exact server
  // totals (All + the caller's My) ride every list response.
  //
  // `q` is the screen's search box, answered HERE rather than in the browser: a
  // list that pages cannot be searched by filtering the page it loaded, or a
  // ticket raised last spring is unfindable while the badge above still counts it.
  // WHAT ORDER — asked of the door, for the reason `q` is: the list PAGES, so
  // ordering the loaded page orders the newest fifty tickets and says nothing
  // about the rest, under a badge counting all of them. The default is the
  // drag-rank, so a screen that asks for no ordering gets what it always got.
  return ticketPage(
    cfg,
    guard,
    scope,
    filter,
    queryText(url.searchParams.get("cursor"), "Cursor") ?? null,
    resolveOrdering(
      TICKET_SORTS,
      "rank",
      queryText(url.searchParams.get("sort"), "Sort"),
      queryText(url.searchParams.get("dir"), "Direction")
    )
  )
}

/** GET /api/content/help/thread?id=<ticketId> → the ticket's replies (oldest first).
 * Portal-ness decides WHOSE conversation, exactly as it decides whose tickets —
 * the fence rides the thread's own WHERE (lib/help threadFence). */
export async function getHelpThread(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "help", "read")
  const scope = await callerScope(cfg, guard)
  const id = queryText(new URL(request.url).searchParams.get("id"), "Id")
  if (!id) return fail(400, "invalid_input", "A ticket id is required.")
  // TWO AWAITS IN ONE OBJECT LITERAL ARE SEQUENTIAL, not concurrent — JavaScript
  // evaluates properties in order, so this shape reads as though both go at once
  // and queues them instead. Each is a separate HTTPS request to the D1 REST
  // API, and neither needs the other's answer, so the second was pure waiting.
  // On the single most common action in the app: opening a ticket.
  const [replies, total] = await Promise.all([
    listReplies(cfg, guard, scope, id),
    countReplies(cfg, guard, scope, id),
  ])
  return json({ replies, total })
}

/** POST /api/content/help — raise a ticket (help:create).
 *
 * The response is a PAGE, which makes this a READ door wearing a POST — and it
 * is on the client portal's surface. So it resolves the caller like every
 * sibling: a client asking their first question gets their own list back, not
 * the agency's book of everybody's problems. */
export async function postCreateHelp(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<TicketInput>(request, env, "help", "create")
  const description = requireText(body.description, "Description", TEXT_LIMITS.long)
  // R20 positional: every field this door reads sits inside a checker, here at
  // the boundary, before lib/help proves the two ids point at live rows.
  optionalText(body.appId, "App", TEXT_LIMITS.short)
  optionalText(body.moduleId, "Module", TEXT_LIMITS.short)
  optionalText(body.raisedByContactId, "Raised by", TEXT_LIMITS.short)
  const scope = await callerScope(cfg, guard)
  const { id, accountId } = await createTicket(cfg, guard, scope, actor, body)
  // The ping carries the ACCOUNT as well as the row, so the raiser's colleagues
  // hear their company's new question appear and nobody else hears a thing.
  await publishChange(env, guard.teamId, "help", id, "add", accountId ?? undefined)
  // HOOK (Phase 3): the agent drafts the first reply here; a no-op today, so the
  // ticket simply opens awaiting a human (per "ticket always opens").
  await maybeDraftFirstReply(cfg, guard, id, description)
  return ticketPage(cfg, guard, scope, EVERYDAY_LIST, null, undefined, id)
}

/** POST /api/content/help/update — edit a ticket (help:edit). */
export async function postUpdateHelp(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<TicketInput & { id?: string }>(request, env, "help", "edit")
  const id = requireText(body.id, "Ticket", TEXT_LIMITS.short)
  requireText(body.description, "Description", TEXT_LIMITS.long)
  optionalText(body.appId, "App", TEXT_LIMITS.short)
  optionalText(body.moduleId, "Module", TEXT_LIMITS.short)
  optionalText(body.raisedByContactId, "Raised by", TEXT_LIMITS.short)
  const scope = await callerScope(cfg, guard)
  const accountId = await updateTicket(cfg, guard, scope, actor, id, body)
  await publishChange(env, guard.teamId, "help", id, undefined, accountId ?? undefined)
  return ticketPage(cfg, guard, scope, EVERYDAY_LIST, null)
}

/** POST /api/content/help/status — move a ticket along its fixed lifecycle.
 * Gated PURELY by help:edit (every status move, including reopen — no raiser exception). */
export async function postHelpStatus(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown; status?: unknown }>(request, env, "help", "edit")
  // R21 AT THE DOOR, and it became necessary the day a client login was granted
  // `help:edit` so they could re-rank their own company's tickets (SCOPE ch.07).
  // That grant is safe for the ORDER and for the WORDING, both of which the lock
  // governs — and it would have been a disaster here: the same right would have
  // let a contact set their own request to `resolved`, or drag it back out of it,
  // which is precisely the client-side reopen button SCOPE says does not exist.
  // The portal gateway does not open this door; the AGENCY gateway forwards
  // /api/content/* by prefix, so leaving it at that would be defending it at the
  // wrong hostname. The refusal belongs here.
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Ticket", TEXT_LIMITS.short)
  if (typeof body.status !== "string" || !(HELP_STATUSES as readonly string[]).includes(body.status))
    return fail(400, "invalid_input", "id and a valid status are required.")
  const status = body.status as HelpStatus
  // CHECKLIST 5.6: resolving is not a status move. `/help/resolve` is the door,
  // and it refuses to send until a resolution is written.
  refuseDirectResolve(status)

  const scope = await callerScope(cfg, guard)
  const ticket = await getTicket(cfg, guard, scope, id)
  if (!ticket) return fail(404, "help_not_found", "That ticket doesn't exist.")

  // R17: already at that status → zero rows moved → no ping, no duplicate history.
  const { moved, accountId } = await setStatus(cfg, guard, scope, actor, id, status)
  if (moved) await publishChange(env, guard.teamId, "help", id, undefined, accountId ?? undefined)
  return ticketPage(cfg, guard, scope, EVERYDAY_LIST, null)
}

/** POST /api/content/help/bulk-status-by-filter — the SET-shaped bulk: move every
 * ticket matching the facet filter (status / type) to one status, in one call.
 * Counts first (dryRun returns just the count), refuses past the bulk ceiling,
 * idempotent by construction, ONE activity row, and publishes ONE coarse ping
 * only when something moved (R17: a no-op publishes nothing). Facets only —
 * free text is deliberately NOT a filter for a write. Gated by help:edit. */
export async function postBulkHelpStatusByFilter(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    toStatus?: unknown
    status?: unknown
    helpType?: unknown
    dryRun?: unknown
  }>(request, env, "help", "edit")
  // R21: the set-shaped sibling of the status door, refused for the same reason
  // — and more so, because one call moves many.
  await refusePortalCaller(cfg, guard)
  if (typeof body.toStatus !== "string" || !(HELP_STATUSES as readonly string[]).includes(body.toStatus))
    return fail(400, "invalid_input", "A valid toStatus is required.")
  // CHECKLIST 5.6, and it matters most here: one call moves many, so a set-shaped
  // route to `resolved` would be many client emails nobody wrote a word of.
  refuseDirectResolve(body.toStatus as HelpStatus)
  const filter: { status?: HelpStatus; helpType?: string } = {}
  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !(HELP_STATUSES as readonly string[]).includes(body.status))
      return fail(400, "invalid_input", "status must be a valid status facet.")
    filter.status = body.status as HelpStatus
  }
  const helpType = optionalText(body.helpType, "Type", TEXT_LIMITS.short)
  if (helpType) filter.helpType = helpType
  const result = await bulkSetStatusByFilter(
    cfg, guard, await callerScope(cfg, guard), actor, filter,
    body.toStatus as HelpStatus, body.dryRun === true
  )
  // ONE coarse list-ping for the whole set — and only when something moved.
  if (result.changed > 0) {
    await publishChange(env, guard.teamId, "help")
    // A coarse ping names no account, and a ping no listener can be CHECKED
    // against is one a client login never hears. So one more per WORLD the set
    // touched (usually one, never more than the batch) carries it to the people
    // whose own tickets just moved.
    for (const account of result.accounts)
      await publishChange(env, guard.teamId, "help", undefined, undefined, account)
  }
  return json({ matched: result.matched, changed: result.changed })
}

/** POST /api/content/help/bulk-status — move MANY tickets to the same status in one
 * call (the bulk sibling of the single status endpoint). Gated ONCE by the SAME
 * right (help:edit), validates ids at the boundary (non-empty array of non-empty
 * strings, cap 500 → clean 400) and the status against the same allowed set the
 * single endpoint uses, applies the same per-row change to every matching ticket,
 * and — the live-sync law — publishes ONE row-level ping per CHANGED row (patch
 * that row, never refetch the list). Returns { updated, skipped }. */
export async function postBulkHelpStatus(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ ids?: unknown; status?: unknown }>(request, env, "help", "edit")
  // R21: the many-ids sibling of the status door, refused for the same reason.
  await refusePortalCaller(cfg, guard)
  const ids = requireIdList(body.ids)
  if (typeof body.status !== "string" || !(HELP_STATUSES as readonly string[]).includes(body.status))
    return fail(400, "invalid_input", "A valid status is required.")
  // CHECKLIST 5.6 — the many-ids sibling, refused for the same reason.
  refuseDirectResolve(body.status as HelpStatus)
  const { changed, skipped } = await bulkSetStatus(
    cfg, guard, await callerScope(cfg, guard), actor, ids, body.status as HelpStatus
  )
  // ONE coarse list-ping for the whole set — the same shape as the by-filter
  // sibling above, for the same reason. This used to ping per changed row,
  // which reads as the row-level ideal but is one sequential HTTP hop to the
  // realtime worker PER TICKET: a full 512-id batch held the door open for
  // hundreds of serial round trips after the write itself was already one
  // statement. A set-shaped move gets a set-shaped ping; the single-ticket
  // door keeps its row-level patch.
  if (changed.length > 0) {
    await publishChange(env, guard.teamId, "help")
    // And one per WORLD the set touched (usually one, never more than the
    // batch), so a client login hears about their own tickets moving.
    const accounts = new Set(changed.map((r) => r.accountId).filter((a): a is string => !!a))
    for (const account of accounts)
      await publishChange(env, guard.teamId, "help", undefined, undefined, account)
  }
  return json({ updated: changed.length, skipped })
}

/** POST /api/content/help/reply — add a reply to a ticket's thread (help:read; any
 * member who can see tickets may join the conversation). Publishes the new reply
 * (thread view) AND the ticket (it re-sorts to the top), then notifies best-effort. */
export async function postHelpReply(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    helpId?: string
    body?: string
    taggedUserIds?: unknown
  }>(request, env, "help", "read")
  const helpId = requireText(body.helpId, "Ticket", TEXT_LIMITS.short)
  const replyBody = requireText(body.body, "Reply", TEXT_LIMITS.long)

  // The fence decides WHOSE ticket this is before a word is appended — a reply
  // cannot be un-appended, and 404 rather than 403 so "not yours" never confirms
  // the ticket exists.
  const scope = await callerScope(cfg, guard)
  const ticket = await getTicket(cfg, guard, scope, helpId)
  if (!ticket) return fail(404, "help_not_found", "That ticket doesn't exist.")

  // A CLIENT DOES NOT @MENTION. This is the one door on the client portal that
  // makes the app SEND EMAIL, from the team's own verified sender, carrying the
  // caller's text — and a mention is what aims it. Everything a client needs is
  // already here without one: the reply lands on their ticket and the agency
  // reads it in Tickets. What a mention adds is a list of staff ids to fire at, and
  // a client has no way to legitimately know one (the portal serves no member
  // list, and the stakeholder door — which NAMES staff — is deliberately off its
  // surface). So an array here can only have been hand-written, and it is
  // refused rather than quietly dropped: silence would teach a script to keep
  // trying. Staff keep mentions; the cap above still bounds them.
  if (scope.kind === "portal" && Array.isArray(body.taggedUserIds) && body.taggedUserIds.length)
    return fail(403, "no_mentions", "Just write your reply, we'll make sure the right people see it.")

  // Untrusted: only keep string ids, and never the author's own id (you can't
  // @mention yourself). A mention is notify-only — never an instruction.
  //
  // BOUNDED (MENTIONS_LIMIT): each surviving id becomes a placeholder in an
  // `IN (...)` lookup AND, if it resolves, an email — so an uncapped array was
  // both an unbounded statement (a 500) and an unbounded send from a trusted
  // sender. De-duped first, so 10,000 copies of one id is one mention, and the
  // cap counts PEOPLE. Over the cap is a clean 400, never a silent truncation:
  // a reply that quietly drops half its mentions is worse than one that refuses.
  const tagged = Array.isArray(body.taggedUserIds)
    ? [...new Set(body.taggedUserIds.filter((x): x is string => typeof x === "string" && x !== actor.id))]
    : []
  if (tagged.length > MENTIONS_LIMIT)
    return fail(400, "too_many_mentions", `A reply can mention up to ${MENTIONS_LIMIT} people.`)
  for (const id of tagged) requireText(id, "Mentioned person", TEXT_LIMITS.short)

  // `raiserId` comes back from the WRITE, not off the ticket above: a client
  // login is no longer sent the raiser's id (staff anonymity, lib/help toTicket),
  // and the person who asked the question still has to be told there's an answer.
  const { id: replyId, raiserId } = await addReply(cfg, guard, scope, actor, helpId, replyBody, tagged, false)
  // Both pings carry the ticket's account: a reply typed by the agency has to
  // land on the client's screen, and on their colleagues' — and on nobody else's.
  await publishChange(env, guard.teamId, "help_threads", replyId, "add", ticket.accountId ?? undefined)
  await publishChange(env, guard.teamId, "help", helpId, "edit", ticket.accountId ?? undefined)
  await notifyReplyAndMentions(
    env,
    cfg,
    guard,
    guard.teamId,
    { id: ticket.id, raiserId },
    { id: actor.id, name: actor.name },
    replyBody,
    tagged
  )
  // The same pair, on the other most common action: sending a reply.
  const [replies, total] = await Promise.all([
    listReplies(cfg, guard, scope, helpId),
    countReplies(cfg, guard, scope, helpId),
  ])
  return json({ replies, total })
}

/** POST /api/content/help/resolve — COME BACK TO THE CLIENT (help:edit).
 *
 * The second and last thing in the product that emails a client (BUILD-1 §7),
 * and the reason it is its own door rather than a side effect of the status
 * move: a resolution is SENT BY A PERSON. The words arrive in the body — the
 * screen pre-fills them from the ticket's draft, which each story's closing note
 * has been building as the work finished — and a person edits them and presses
 * send. A status that emailed on its own would make "resolved" a thing you can
 * do by accident.
 *
 * THREE THINGS, IN ONE CALL AND IN THIS ORDER:
 *   1. move the ticket to resolved. R17 gates everything after it — an already-
 *      resolved ticket moves zero rows, so the client is not emailed twice about
 *      the same answer, which is the failure this order exists to prevent;
 *   2. append the resolution to the conversation, so what we said lives where
 *      everything else about the request lives rather than only in an inbox;
 *   3. email their people.
 *
 * Refused to a client login (R21), like every other status move on this module. */
export async function postResolveHelp(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown; resolution?: unknown }>(
    request,
    env,
    "help",
    "edit"
  )
  const scope = await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Ticket", TEXT_LIMITS.short)
  const resolution = requireText(body.resolution, "Resolution", TEXT_LIMITS.long)

  const ticket = await getTicket(cfg, guard, scope, id)
  if (!ticket) return fail(404, "help_not_found", "That ticket doesn't exist.")

  // R17 IS THE SEND GUARD. Zero rows moved = already answered = nothing appended
  // and nobody emailed. A second press of a button is not a second answer.
  const { moved, accountId } = await setStatus(cfg, guard, scope, actor, id, "resolved")
  if (!moved) return json({ sent: false, alreadyResolved: true })

  const { id: replyId } = await addReply(cfg, guard, scope, actor, id, resolution, [], false)
  await publishChange(env, guard.teamId, "help_threads", replyId, "add", accountId ?? undefined)
  await publishChange(env, guard.teamId, "help", id, "edit", accountId ?? undefined)
  // Best-effort and last: a failed email must never fail the answer. It is on
  // their screen either way.
  await notifyTicketResolved(env, cfg, guard, id, resolution)
  return json({ sent: true, alreadyResolved: false })
}

/** POST /api/content/help/rank — put a ticket between two others (SCOPE ch.07:
 * drag-rank is the only priority signal there is, and there is no priority
 * dropdown to fall back on).
 *
 * Gated by help:EDIT — reordering is editing the ticket, and a client's own right
 * to do it is decided a layer down by the lock, not by a second permission. That
 * matters: `help:edit` is a right the seeded Client role does NOT hold, so this
 * door is closed to a client login today and opens the moment an owner grants it.
 * The lock is what keeps that grant safe.
 *
 * The body names NEIGHBOURS, never a position: a position is arithmetic over a
 * list the browser loaded seconds ago, and the list has moved since. */
export async function postHelpRank(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    id?: unknown
    afterId?: unknown
    beforeId?: unknown
  }>(request, env, "help", "edit")
  const id = requireText(body.id, "Ticket", TEXT_LIMITS.short)
  const afterId = optionalText(body.afterId, "Ticket above", TEXT_LIMITS.short) ?? null
  const beforeId = optionalText(body.beforeId, "Ticket below", TEXT_LIMITS.short) ?? null
  const scope = await callerScope(cfg, guard)
  // R17: dropped back where it started → zero rows moved → no history, no ping.
  const { moved, accountId } = await setTicketRank(cfg, guard, scope, actor, id, afterId, beforeId)
  if (moved) await publishChange(env, guard.teamId, "help", id, "edit", accountId ?? undefined)
  return ticketPage(cfg, guard, scope, EVERYDAY_LIST, null)
}

/** POST /api/content/help/archive — put a ticket away, or take it back out
 * (SCOPE ch.07: archive is available from any state). Nothing is deleted; the
 * conversation and the history survive exactly as they were.
 *
 * Gated by help:edit, like every other move along the row. */
export async function postHelpArchive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown; archived?: unknown }>(
    request,
    env,
    "help",
    "edit"
  )
  // R21: putting a request away is our filing, not theirs. A client who thinks a
  // ticket is finished says so in the conversation, and a staff member decides.
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Ticket", TEXT_LIMITS.short)
  if (typeof body.archived !== "boolean")
    return fail(400, "invalid_input", "archived must be true or false.")
  const scope = await callerScope(cfg, guard)
  // R17: archiving an archived ticket moves zero rows — no second history line.
  const { moved, accountId } = await setTicketArchived(cfg, guard, scope, actor, id, body.archived)
  if (moved) await publishChange(env, guard.teamId, "help", id, "edit", accountId ?? undefined)
  return ticketPage(cfg, guard, scope, EVERYDAY_LIST, null)
}

/** POST /api/content/help/validate — THE CLIENT SAYS YES (CHECKLIST 5.13).
 *
 * The one lifecycle door a portal caller may push, and the only one they ever
 * will: an extra, a request or a piece of feedback waits for the company that
 * pays for it to confirm they want it (Aurora's ap2). Questions and issues never
 * reach `awaiting_validation` at all, so this door has nothing to do to them.
 *
 * NOT `refusePortalCaller`, and it is the deliberate exception to R21's shape on
 * this module — every OTHER status move is ours. Two things keep it safe: the
 * account fence rides the UPDATE (a client can only validate a ticket their own
 * company raised), and R17's predicate means the ONLY transition it can make is
 * `awaiting_validation` → `new`. It cannot reopen, resolve, or move a started
 * request; a caller who sends it at a ticket in any other state moves zero rows.
 *
 * Gated by help:READ, not edit. A contact who can see their company's requests is
 * exactly the person being asked, and `help:edit` is a right the seeded Client
 * role deliberately does not hold — gating on it would make this door unreachable
 * by the only people it exists for. Staff may press it too, for the ordinary case
 * where the answer arrives by phone. */
export async function postValidateHelp(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown }>(request, env, "help", "read")
  const id = requireText(body.id, "Ticket", TEXT_LIMITS.short)
  const scope = await callerScope(cfg, guard)
  // R17: not waiting → zero rows moved → no ping, no duplicate history.
  const { moved, accountId } = await validateTicket(cfg, guard, scope, actor, id)
  if (moved) await publishChange(env, guard.teamId, "help", id, "edit", accountId ?? undefined)
  return ticketPage(cfg, guard, scope, EVERYDAY_LIST, null)
}

/** POST /api/content/help/triage-read — SOMEBODY HAS READ IT (CHECKLIST 5.11).
 *
 * The one act the triage screen performs, and the only stage of the ladder a
 * machine cannot infer: "I have read this and it is real" is a judgement. Every
 * stage after it happens by itself.
 *
 * Refused to a client login (R21): triage is our queue, and a request that has
 * been read is a fact about us rather than about them. */
export async function postHelpTriageRead(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown }>(request, env, "help", "edit")
  const scope = await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Ticket", TEXT_LIMITS.short)
  // R17: already read, already scheduled, already started → zero rows moved.
  const { moved, accountId } = await markTriaged(cfg, guard, scope, actor, id)
  if (moved) await publishChange(env, guard.teamId, "help", id, "edit", accountId ?? undefined)
  return ticketPage(cfg, guard, scope, EVERYDAY_LIST, null)
}

/** GET /api/content/help/attachments?id=<ticketId> — the files and links on a
 * ticket (CHECKLIST 5.10). ON BOTH FRONT DOORS: a client attaches the screenshot
 * of the thing that is wrong, and reads back what we attached.
 *
 * The ticket fence decides whose (lib/help-attachments), so `help:read` plus the
 * fence is the whole gate — the same pair the thread door stands on. */
export async function getHelpAttachments(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "help", "read")
  const scope = await callerScope(cfg, guard)
  const id = queryText(new URL(request.url).searchParams.get("id"), "Id")
  if (!id) return fail(400, "invalid_input", "A ticket id is required.")
  // These are independent reads — one wait, not 2.
  const [attachments, total] = await Promise.all([listAttachments(cfg, guard, scope, id), countAttachments(cfg, guard, scope, id)])
  return json({
    attachments,
    // R16: the tab badge shows the door's exact COUNT(*), never the (capped)
    // list's length.
    total,
  })
}

/** POST /api/content/help/attachments — attach a file or a link (help:read; a
 * person who can see a ticket can show you what they mean).
 *
 * THERE IS NO EDIT DOOR HERE, AND THAT IS A RULING RATHER THAN AN OMISSION.
 * Stories have one (`POST /api/content/stories/attachments/update`, renames and
 * replaces), and adding its twin here is the obvious next commit. Asked
 * 27 Aug 2026 — "may a client login rename or replace a file agency staff
 * attached?" — the owner answered "never". Not on `help:read`, not on any role
 * a client login can hold.
 *
 * So if that door is ever written, the refusal belongs IN IT and not on the
 * screen that calls it. `help:read` is held by clients, the agency gateway
 * forwards `/api/content/*` by PREFIX, and a client login is an ordinary team
 * member — which is how R21 was earned twice. A hidden button is not a fence.
 * Attaching your own and reading your own back are untouched; the line is on
 * somebody ELSE'S file.
 *
 * TWO KINDS, ONE DOOR, because it is one act. `kind: "link"` carries a URL and
 * nothing else; `kind: "file"` carries a data URL, which is parsed, capped and
 * put in the SHARED media bucket — the one both gateways serve, so the client
 * can read their own file back at their own hostname (lib/help-attachments says
 * why it is not `HELP_MEDIA`).
 *
 * The fence resolves the ticket BEFORE anything is written or stored: bytes put
 * in a bucket cannot be un-put, and 404 rather than 403 so "not yours" never
 * confirms the ticket exists. */
export async function postHelpAttachment(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    id?: unknown
    kind?: unknown
    label?: unknown
    url?: unknown
    fileDataUrl?: unknown
  }>(request, env, "help", "read")
  const id = requireText(body.id, "Ticket", TEXT_LIMITS.short)
  if (body.kind !== "file" && body.kind !== "link")
    return fail(400, "invalid_input", "kind must be file or link.")
  const label = requireText(body.label, "Name", TEXT_LIMITS.short)

  const scope = await callerScope(cfg, guard)
  const ticket = await getTicket(cfg, guard, scope, id)
  if (!ticket) return fail(404, "help_not_found", "That ticket doesn't exist.")

  let url: string
  let contentType: string | null = null
  let sizeBytes: number | null = null
  if (body.kind === "link") {
    // A LINK IS SOMETHING A COLLEAGUE WILL CLICK, so the SCHEME is checked here
    // and not only its length. `safeExternalLink` allows `mailto:` as well, which
    // is right for a contact's address field and wrong for this: what lands here
    // goes into an `href` on a page a staff member already trusts, and a client
    // login is one of the people who can put it there. `javascript:` in that
    // position is stored XSS with a two-line setup — refused at the door rather
    // than filtered at each of the two front ends, because there are two of them
    // and a filter somebody forgets is a filter that is not there.
    const raw = requireText(body.url, "Link", TEXT_LIMITS.link)
    const safe = safeExternalLink(raw)
    if (!safe || !/^https?:\/\//i.test(safe))
      return fail(400, "invalid_input", "A link has to start with http:// or https://.")
    url = safe
  } else {
    // ANY TYPE, STORED SO IT CANNOT RUN. The list used to be inline-safe media
    // only, which refused an .md, a .csv, a saved page — most of what somebody
    // actually attaches — and said "up to 10MB" while doing it, blaming a size
    // that was never the problem. `storedContentType` keeps the XSS boundary
    // where it belongs: on how the bytes are served back, not on whether they
    // are accepted (shared/workers/image.ts has the whole argument).
    const parsed = parseUploadDataUrl(body.fileDataUrl, TICKET_FILE_MAX_BYTES, ANY_FILE_TYPE)
    if (!parsed)
      // …AND THE REFUSAL NAMES THE REAL REASON. One sentence for three causes is
      // how somebody spends ten minutes shrinking a file that was never too big.
      return fail(
        400,
        "invalid_input",
        typeof body.fileDataUrl === "string" && dataUrlBytes(body.fileDataUrl) > TICKET_FILE_MAX_BYTES
          ? "That file is over 10MB. Try a smaller one."
          : "That file didn't come through. Try attaching it again."
      )
    // The key carries a ULID, which is what makes the capability URL unguessable;
    // the team id keeps one team's objects out of another's prefix.
    const key = mediaKey("ticket", guard.teamId)
    await env.MEDIA.put(key, parsed.bytes, { httpMetadata: { contentType: storedContentType(parsed.contentType) } })
    url = `/media/${key}`
    contentType = parsed.contentType
    sizeBytes = parsed.bytes.byteLength
  }

  const attachments = await addAttachment(cfg, guard, scope, actor, id, {
    kind: body.kind,
    label,
    url,
    contentType,
    sizeBytes,
  })
  await publishChange(env, guard.teamId, "help", id, "edit", ticket.accountId ?? undefined)
  return json({ attachments, total: attachments.length })
}

/** POST /api/content/help/attachments/remove — take a file or a link off
 * (help:EDIT — taking something off a ticket is a write, and gating a write on
 * the read right let any reader strip attachments staff had added; the story
 * sibling has always demanded work:edit). Deactivate, never delete: the row
 * keeps its audit block and the object stays in the bucket. */
export async function postRemoveHelpAttachment(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown; attachmentId?: unknown }>(
    request,
    env,
    "help",
    "edit"
  )
  const id = requireText(body.id, "Ticket", TEXT_LIMITS.short)
  const attachmentId = requireText(body.attachmentId, "Attachment", TEXT_LIMITS.short)
  const scope = await callerScope(cfg, guard)
  const ticket = await getTicket(cfg, guard, scope, id)
  if (!ticket) return fail(404, "help_not_found", "That ticket doesn't exist.")
  // R17: already off → zero rows moved → no ping, no second history line.
  const { moved, attachments } = await removeAttachment(cfg, guard, scope, actor, id, attachmentId)
  if (moved) await publishChange(env, guard.teamId, "help", id, "edit", ticket.accountId ?? undefined)
  return json({ attachments, total: attachments.length })
}

/** GET /api/content/help/stakeholders?id=<ticketId> — the full derived ∪ added
 * set (raiser + admins + @mentions + manual adds). help:read gates it, and the
 * fence decides whether the ticket is theirs to ask about at all: a stakeholder
 * list NAMES people (staff admins included), so an unfenced one was the same
 * leak as the thread, in its most personal form.
 *
 * AND IT IS NOT FOR A CLIENT LOGIN AT ALL. "The portal shows work status but
 * never which staff member is doing it" (SCOPE ch.06), which is why the portal
 * gateway's door table leaves this one out and says so. But the AGENCY gateway
 * forwards /api/content/* by PREFIX, a client login is an ordinary team member,
 * and the Client role holds help:read — so the invariant was defended only by an
 * allow-list on the OTHER door, which is to say not defended. The refusal
 * belongs here, beside the fence that decides everything else. */
export async function getHelpStakeholders(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "help", "read")
  const scope = await refusePortalCaller(cfg, guard)
  const id = queryText(new URL(request.url).searchParams.get("id"), "Id")
  if (!id) return fail(400, "invalid_input", "A ticket id is required.")
  return json({ stakeholders: await listStakeholders(cfg, env, guard, scope, id) })
}

/** POST /api/content/help/stakeholders — manually add a stakeholder (help:read;
 * any member who can see a ticket may pull a teammate in). Add-only — never
 * removes anyone. SEAM LAW: this mutation publishes the help row change.
 *
 * REFUSED TO A CLIENT LOGIN for the same reason as the GET, and it needed it
 * more: this door ANSWERS WITH THE SAME LIST. A client naming their own ticket
 * and their own user id got back every staff admin's name, email and photo — a
 * read wearing a POST, which is the exact shape the portal-fence walk was
 * rewritten to catch on the other door. */
export async function postAddStakeholder(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown; userId?: unknown }>(request, env, "help", "read")
  const scope = await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Ticket", TEXT_LIMITS.short)
  const userId = requireText(body.userId, "Person", TEXT_LIMITS.short)
  const ticket = await getTicket(cfg, guard, scope, id)
  if (!ticket) return fail(404, "help_not_found", "That ticket doesn't exist.")
  const stakeholders = await addStakeholder(cfg, env, guard, scope, actor, id, userId)
  await publishChange(env, guard.teamId, "help", id, "edit", ticket.accountId ?? undefined)
  return json({ stakeholders })
}
