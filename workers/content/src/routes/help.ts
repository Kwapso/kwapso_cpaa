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
import { requireIdList } from "../lib/bulk"
import {
  addReply,
  bulkSetStatus,
  createTicket,
  getTicket,
  HELP_STATUSES,
  listReplies,
  listTickets,
  maybeDraftFirstReply,
  setStatus,
  updateTicket,
  type HelpStatus,
  type TicketInput,
  countTickets,
  countReplies,
  bulkSetStatusByFilter,
} from "../lib/help"
import { notifyReplyAndMentions } from "../lib/notify"
import { addStakeholder, listStakeholders } from "../lib/stakeholders"
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
  tab: "mine" | "all",
  cursor: string | null
): Promise<Response> {
  const [page, counts] = await Promise.all([
    listTickets(cfg, guard, scope, tab, cursor),
    countTickets(cfg, guard, scope),
  ])
  return pagedJson("tickets", { ...page, total: counts.total }, { mineTotal: counts.mineTotal })
}

/** GET /api/content/help?scope=mine|all  (?id=<ticketId> → just that one). */
export async function getHelp(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "help", "read")
  // The caller's account world decides WHOSE tickets, exactly as it decides
  // whose accounts: their company, and everything nested beneath it.
  const scope = await callerScope(cfg, guard)
  const url = new URL(request.url)
  const tab = queryText(url.searchParams.get("scope"), "Scope") === "mine" ? "mine" : "all"
  const id = queryText(url.searchParams.get("id"), "Id")
  // One ticket by id is a LOOKUP, not a page — answer it directly rather than
  // filtering a page (which could legitimately not contain it once paged).
  if (id) {
    const one = await getTicket(cfg, guard, scope, id)
    const counts = await countTickets(cfg, guard, scope)
    return pagedJson(
      "tickets",
      { rows: one ? [one] : [], total: counts.total, hasMore: false, nextCursor: null },
      { mineTotal: counts.mineTotal }
    )
  }
  // R14: tickets are a GROWING collection, so the door pages by key — the opaque
  // cursor comes straight back from the previous response. R16: the exact server
  // totals (All + the caller's My) ride every list response.
  return ticketPage(cfg, guard, scope, tab, queryText(url.searchParams.get("cursor"), "Cursor") ?? null)
}

/** GET /api/content/help/thread?id=<ticketId> → the ticket's replies (oldest first).
 * Portal-ness decides WHOSE conversation, exactly as it decides whose tickets —
 * the fence rides the thread's own WHERE (lib/help threadFence). */
export async function getHelpThread(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "help", "read")
  const scope = await callerScope(cfg, guard)
  const id = queryText(new URL(request.url).searchParams.get("id"), "Id")
  if (!id) return fail(400, "invalid_input", "A ticket id is required.")
  return json({
    replies: await listReplies(cfg, guard, scope, id),
    total: await countReplies(cfg, guard, scope, id),
  })
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
  const scope = await callerScope(cfg, guard)
  const { id, accountId } = await createTicket(cfg, guard, scope, actor, body)
  // The ping carries the ACCOUNT as well as the row, so the raiser's colleagues
  // hear their company's new question appear and nobody else hears a thing.
  await publishChange(env, guard.teamId, "help", id, "add", accountId ?? undefined)
  // HOOK (Phase 3): the agent drafts the first reply here; a no-op today, so the
  // ticket simply opens awaiting a human (per "ticket always opens").
  await maybeDraftFirstReply(cfg, guard, id, description)
  return ticketPage(cfg, guard, scope, "all", null)
}

/** POST /api/content/help/update — edit a ticket (help:edit). */
export async function postUpdateHelp(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<TicketInput & { id?: string }>(request, env, "help", "edit")
  const id = requireText(body.id, "Ticket", TEXT_LIMITS.short)
  requireText(body.description, "Description", TEXT_LIMITS.long)
  const scope = await callerScope(cfg, guard)
  const accountId = await updateTicket(cfg, guard, scope, actor, id, body)
  await publishChange(env, guard.teamId, "help", id, undefined, accountId ?? undefined)
  return ticketPage(cfg, guard, scope, "all", null)
}

/** POST /api/content/help/status — move a ticket along its fixed lifecycle.
 * Gated PURELY by help:edit (every status move, including reopen — no raiser exception). */
export async function postHelpStatus(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown; status?: unknown }>(request, env, "help", "edit")
  const id = requireText(body.id, "Ticket", TEXT_LIMITS.short)
  if (typeof body.status !== "string" || !(HELP_STATUSES as readonly string[]).includes(body.status))
    return fail(400, "invalid_input", "id and a valid status are required.")
  const status = body.status as HelpStatus

  const scope = await callerScope(cfg, guard)
  const ticket = await getTicket(cfg, guard, scope, id)
  if (!ticket) return fail(404, "help_not_found", "That ticket doesn't exist.")

  // R17: already at that status → zero rows moved → no ping, no duplicate history.
  const { moved, accountId } = await setStatus(cfg, guard, scope, actor, id, status)
  if (moved) await publishChange(env, guard.teamId, "help", id, undefined, accountId ?? undefined)
  return ticketPage(cfg, guard, scope, "all", null)
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
  if (typeof body.toStatus !== "string" || !(HELP_STATUSES as readonly string[]).includes(body.toStatus))
    return fail(400, "invalid_input", "A valid toStatus is required.")
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
  const ids = requireIdList(body.ids)
  if (typeof body.status !== "string" || !(HELP_STATUSES as readonly string[]).includes(body.status))
    return fail(400, "invalid_input", "A valid status is required.")
  const { changed, skipped } = await bulkSetStatus(
    cfg, guard, await callerScope(cfg, guard), actor, ids, body.status as HelpStatus
  )
  // Row-level live-sync: one ping per changed ticket (same row shape the single
  // endpoint patches) — no list refetch.
  // Each ping carries its own account, so a batch spanning two clients reaches
  // each of them with only their own row.
  for (const row of changed)
    await publishChange(env, guard.teamId, "help", row.id, undefined, row.accountId ?? undefined)
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
    return fail(403, "no_mentions", "Just write your reply — we'll make sure the right people see it.")

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
  return json({
    replies: await listReplies(cfg, guard, scope, helpId),
    total: await countReplies(cfg, guard, scope, helpId),
  })
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
