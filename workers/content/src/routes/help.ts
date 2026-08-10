// Help routes: list tickets (My/All tabs = a creator filter), read one ticket's
// thread, raise a ticket, edit it, move its fixed status, and reply. Mirrors the
// learning routes: open with the shared gated opening (teamContext + requireRight
// on the `help` module + defensive body read), parse + 400 on bad input, then
// publishChange (row id + op) so open lists + the thread patch just that row.
// Locked module rules live in lib/help; the reply notify (raiser + @mentions) is
// best-effort in lib/notify.

import { fail, json, pagedJson } from "../../../../shared/workers/http"
import { optionalText, queryText, requireText, TEXT_LIMITS } from "../../../../shared/workers/validate"
import { MENTIONS_LIMIT } from "../../../../shared/workers/limits"
import { publishChange } from "../../../../shared/workers/realtime"
import { accountScope } from "../../../../shared/workers/account-scope"
import { gated, gatedBody } from "../../../../shared/workers/route"
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

/** Is this caller a client login rather than staff? Resolved ONCE per request,
 * the same sentence every help door speaks — and now the same sentence the
 * WRITES speak, because three of them answered with a page and none of them
 * asked. */
async function isPortal(
  cfg: Parameters<typeof listTickets>[0],
  guard: Parameters<typeof listTickets>[1]
): Promise<boolean> {
  return (await accountScope(cfg, guard)).kind === "portal"
}

/** EVERY ticket response is a PAGE (R14) — including the one a mutation returns,
 * so a client re-priming its list from a write still learns where page two
 * starts. One seam: rows + exact totals + hasMore + the opaque cursor.
 *
 * `portal` is REQUIRED, and that is the whole fix for the worst bug this file
 * has had: it used to default to false, so `postCreateHelp` — a door the client
 * portal forwards untouched — answered a client's brand-new question with EVERY
 * ticket in the team, other clients' included, description text and all. Nothing
 * was crafted; that was the happy path. A defaulted fence is a fence that fails
 * open the moment someone writes a new door, so there is no default here now. */
async function ticketPage(
  cfg: Parameters<typeof listTickets>[0],
  guard: Parameters<typeof listTickets>[1],
  scope: "mine" | "all",
  cursor: string | null,
  portal: boolean
): Promise<Response> {
  const [page, counts] = await Promise.all([
    listTickets(cfg, guard, scope, cursor, portal),
    countTickets(cfg, guard, portal),
  ])
  return pagedJson("tickets", { ...page, total: counts.total }, { mineTotal: counts.mineTotal })
}

/** GET /api/content/help?scope=mine|all  (?id=<ticketId> → just that one). */
export async function getHelp(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "help", "read")
  // Portal-ness decides WHOSE tickets, exactly as it decides whose accounts.
  const portal = await isPortal(cfg, guard)
  const url = new URL(request.url)
  const scope = queryText(url.searchParams.get("scope"), "Scope") === "mine" ? "mine" : "all"
  const id = queryText(url.searchParams.get("id"), "Id")
  // One ticket by id is a LOOKUP, not a page — answer it directly rather than
  // filtering a page (which could legitimately not contain it once paged).
  if (id) {
    const one = await getTicket(cfg, guard, id, portal)
    const counts = await countTickets(cfg, guard, portal)
    return pagedJson(
      "tickets",
      { rows: one ? [one] : [], total: counts.total, hasMore: false, nextCursor: null },
      { mineTotal: counts.mineTotal }
    )
  }
  // R14: tickets are a GROWING collection, so the door pages by key — the opaque
  // cursor comes straight back from the previous response. R16: the exact server
  // totals (All + the caller's My) ride every list response.
  return ticketPage(cfg, guard, scope, queryText(url.searchParams.get("cursor"), "Cursor") ?? null, portal)
}

/** GET /api/content/help/thread?id=<ticketId> → the ticket's replies (oldest first).
 * Portal-ness decides WHOSE conversation, exactly as it decides whose tickets —
 * the fence rides the thread's own WHERE (lib/help threadFence). */
export async function getHelpThread(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "help", "read")
  const portal = await isPortal(cfg, guard)
  const id = queryText(new URL(request.url).searchParams.get("id"), "Id")
  if (!id) return fail(400, "invalid_input", "A ticket id is required.")
  return json({
    replies: await listReplies(cfg, guard, id, portal),
    total: await countReplies(cfg, guard, id, portal),
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
  const portal = await isPortal(cfg, guard)
  const id = await createTicket(cfg, guard, actor, body)
  await publishChange(env, guard.teamId, "help", id, "add")
  // HOOK (Phase 3): the agent drafts the first reply here; a no-op today, so the
  // ticket simply opens awaiting a human (per "ticket always opens").
  await maybeDraftFirstReply(cfg, guard, id, description)
  return ticketPage(cfg, guard, "all", null, portal)
}

/** POST /api/content/help/update — edit a ticket (help:edit). */
export async function postUpdateHelp(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<TicketInput & { id?: string }>(request, env, "help", "edit")
  const id = requireText(body.id, "Ticket", TEXT_LIMITS.short)
  requireText(body.description, "Description", TEXT_LIMITS.long)
  const portal = await isPortal(cfg, guard)
  await updateTicket(cfg, guard, actor, id, body, portal)
  await publishChange(env, guard.teamId, "help", id)
  return ticketPage(cfg, guard, "all", null, portal)
}

/** POST /api/content/help/status — move a ticket along its fixed lifecycle.
 * Gated PURELY by help:edit (every status move, including reopen — no raiser exception). */
export async function postHelpStatus(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown; status?: unknown }>(request, env, "help", "edit")
  const id = requireText(body.id, "Ticket", TEXT_LIMITS.short)
  if (typeof body.status !== "string" || !(HELP_STATUSES as readonly string[]).includes(body.status))
    return fail(400, "invalid_input", "id and a valid status are required.")
  const status = body.status as HelpStatus

  const portal = await isPortal(cfg, guard)
  const ticket = await getTicket(cfg, guard, id, portal)
  if (!ticket) return fail(404, "help_not_found", "That ticket doesn't exist.")

  // R17: already at that status → zero rows moved → no ping, no duplicate history.
  const changed = await setStatus(cfg, guard, actor, id, status, portal)
  if (changed) await publishChange(env, guard.teamId, "help", id)
  return ticketPage(cfg, guard, "all", null, portal)
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
    cfg, guard, actor, filter, body.toStatus as HelpStatus, body.dryRun === true,
    await isPortal(cfg, guard)
  )
  // ONE coarse list-ping for the whole set — and only when something moved.
  if (result.changed > 0) await publishChange(env, guard.teamId, "help")
  return json(result)
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
    cfg, guard, actor, ids, body.status as HelpStatus, await isPortal(cfg, guard)
  )
  // Row-level live-sync: one ping per changed ticket (same row shape the single
  // endpoint patches) — no list refetch.
  for (const id of changed) await publishChange(env, guard.teamId, "help", id)
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
  const portal = await isPortal(cfg, guard)
  const ticket = await getTicket(cfg, guard, helpId, portal)
  if (!ticket) return fail(404, "help_not_found", "That ticket doesn't exist.")

  // A CLIENT DOES NOT @MENTION. This is the one door on the client portal that
  // makes the app SEND EMAIL, from the team's own verified sender, carrying the
  // caller's text — and a mention is what aims it. Everything a client needs is
  // already here without one: the reply lands on their ticket and the agency
  // reads it in Help. What a mention adds is a list of staff ids to fire at, and
  // a client has no way to legitimately know one (the portal serves no member
  // list, and the stakeholder door — which NAMES staff — is deliberately off its
  // surface). So an array here can only have been hand-written, and it is
  // refused rather than quietly dropped: silence would teach a script to keep
  // trying. Staff keep mentions; the cap above still bounds them.
  if (portal && Array.isArray(body.taggedUserIds) && body.taggedUserIds.length)
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

  const replyId = await addReply(cfg, guard, actor, helpId, replyBody, tagged, false, portal)
  await publishChange(env, guard.teamId, "help_threads", replyId, "add")
  await publishChange(env, guard.teamId, "help", helpId, "edit")
  await notifyReplyAndMentions(
    env,
    guard.teamId,
    { id: ticket.id, raiserId: ticket.raiserId },
    { id: actor.id, name: actor.name },
    replyBody,
    tagged
  )
  return json({
    replies: await listReplies(cfg, guard, helpId, portal),
    total: await countReplies(cfg, guard, helpId, portal),
  })
}

/** GET /api/content/help/stakeholders?id=<ticketId> — the full derived ∪ added
 * set (raiser + admins + @mentions + manual adds). help:read gates it, and the
 * fence decides whether the ticket is theirs to ask about at all: a stakeholder
 * list NAMES people (staff admins included), so an unfenced one was the same
 * leak as the thread, in its most personal form. */
export async function getHelpStakeholders(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "help", "read")
  const portal = await isPortal(cfg, guard)
  const id = queryText(new URL(request.url).searchParams.get("id"), "Id")
  if (!id) return fail(400, "invalid_input", "A ticket id is required.")
  return json({ stakeholders: await listStakeholders(cfg, env, guard, id, portal) })
}

/** POST /api/content/help/stakeholders — manually add a stakeholder (help:read;
 * any member who can see a ticket may pull a teammate in). Add-only — never
 * removes anyone. SEAM LAW: this mutation publishes the help row change. */
export async function postAddStakeholder(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown; userId?: unknown }>(request, env, "help", "read")
  const id = requireText(body.id, "Ticket", TEXT_LIMITS.short)
  const userId = requireText(body.userId, "Person", TEXT_LIMITS.short)
  const portal = await isPortal(cfg, guard)
  const ticket = await getTicket(cfg, guard, id, portal)
  if (!ticket) return fail(404, "help_not_found", "That ticket doesn't exist.")
  const stakeholders = await addStakeholder(cfg, env, guard, actor, id, userId, portal)
  await publishChange(env, guard.teamId, "help", id, "edit")
  return json({ stakeholders })
}
