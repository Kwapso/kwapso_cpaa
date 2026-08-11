// Help module — team-wide support tickets + threaded replies, inside the team's
// OWN database. Locked model rules enforced HERE on the server:
//   • status is a FIXED lifecycle the code trusts (open / in_progress / resolved /
//     reopened) — help_type is a cosmetic selectable, never the source of truth;
//   • tickets are team-wide: the My/All tabs are just a creator filter, no
//     row-level privacy (a mention is notify-only — see lib/notify);
//   • resolving stamps the resolver audit block + resolved flag; reopening clears
//     it. Every status move (incl. reopen) is gated purely by help:edit;
//   • the AI agent's first-draft reply is a HOOK (maybeDraftFirstReply) left off
//     until the agent worker exists — a ticket always opens regardless.

import { accountScopeClause, type AccountScope } from "@shared/workers/account-scope"
import { describeChanges, logActivity, type Actor } from "@shared/workers/activity"
import { d1ExecScript, d1Query, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { HELP_STATUSES, type HelpMessage, type HelpStatus, type HelpTicket } from "@shared/types"
import { GuardError, type MemberGuard } from "@shared/workers/gating"
import { optionalText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { BULK_IDS_LIMIT, THREAD_HARD_CAP } from "@shared/workers/limits"
import { decodeCursor, keysetAfter, PAGE_SIZE, toPage, type Page } from "@shared/workers/paging"

// The fixed status lifecycle the code trusts (the team-editable dropdown is
// display-only) — Anything outside this set is rejected. It lives in shared/types
// beside HelpTicket, because the stepper and the ticket row need the same list;
// re-exported here so this worker's routes still read it off its own module.
export { HELP_STATUSES, type HelpStatus }

type TicketRow = {
  id: string
  help_type: string | null
  description: string
  screen_recording_link: string | null
  source_screen: string | null
  status: string
  resolved: number
  resolved_at: string | null
  account_id: string | null
  creator_id: string
  creator_name: string | null
  editor_name: string | null
  created_at: string
  updated_at: string | null
}

function toTicket(r: TicketRow): HelpTicket {
  return {
    id: r.id,
    helpType: r.help_type,
    description: r.description,
    screenRecordingLink: r.screen_recording_link,
    sourceScreen: r.source_screen,
    status: (HELP_STATUSES as readonly string[]).includes(r.status)
      ? (r.status as HelpStatus)
      : "open",
    resolved: r.resolved === 1,
    resolvedAt: r.resolved_at,
    raiserId: r.creator_id,
    raiserName: r.creator_name,
    editorName: r.editor_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    accountId: r.account_id,
  }
}

type ReplyRow = {
  id: string
  help_id: string
  message_body: string
  tagged_user_ids: string | null
  is_agent: number
  creator_id: string
  creator_name: string | null
  created_at: string
}

/** Parse the tagged_user_ids JSON safely (untrusted text → string[] or []). */
function parseTagged(json: string | null): string[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

function toMessage(r: ReplyRow): HelpMessage {
  return {
    id: r.id,
    ticketId: r.help_id,
    body: r.message_body,
    taggedUserIds: parseTagged(r.tagged_user_ids),
    isAgent: r.is_agent === 1,
    authorId: r.creator_id,
    authorName: r.creator_name,
    createdAt: r.created_at,
  }
}

const TICKET_COLS =
  "id, help_type, description, screen_recording_link, source_screen, status, resolved, resolved_at, account_id, creator_id, creator_name, editor_name, created_at, updated_at"

/** Fetch one ticket (the raw row the gating + notify need), or throw a clean 404.
 *
 * THE FENCE RIDES THE WRITE PATH TOO. This is the row every help WRITE resolves
 * before it changes anything (edit, status move, reply), so an unfenced version
 * of it is an unfenced version of all three: outside the caller's world the row
 * must be indistinguishable from a made-up id. `creator_id` never changes, so
 * resolving here and updating next is not a race — but the UPDATEs carry the
 * clause as well, because a fence you can only see by reading the caller is a
 * fence the next reader will delete. */
async function ticketOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string
): Promise<TicketRow> {
  const fence = ticketFence(guard, scope, "all")
  const rows = await d1Query<TicketRow>(
    cfg,
    guard.databaseId,
    `SELECT ${TICKET_COLS} FROM help WHERE id = ?${fence.sql ? ` AND ${fence.sql}` : ""}`,
    [id, ...fence.params]
  )
  if (!rows[0]) throw new GuardError(404, "help_not_found", "That ticket doesn't exist.")
  return rows[0]
}

/** The sort a ticket list is keyed by: newest activity first, id breaking ties. */
const TICKET_ORDER = "COALESCE(updated_at, created_at)"

/** Tickets for the team, newest-activity first. `scope: "mine"` returns only the
 * caller's own raised tickets (the My tab); "all" returns everyone's (All tab).
 * R14 GROWING collection: keyset-PAGED, not capped — tickets accumulate forever,
 * so the door answers "here's a page and where the next one starts" instead of
 * refusing past a ceiling. `cursor` is the opaque one from the previous page. */
/** THE HELP FENCE. "All tickets" means all of the AGENCY's tickets — it was
 * never meant to mean "every client's". A client login raises tickets like
 * anyone else, and the team-wide default handed them everyone else's: names,
 * problems, and whatever they pasted into the description.
 *
 * WHAT A CLIENT SEES, since the owner's ruling of 11 Aug 2026: their COMPANY's
 * questions, not merely their own. The first version of this fence pinned a
 * portal caller to `creator_id = <them>`, and at a real client that made the
 * finance person and the ops person invisible to each other — two people at the
 * same company, each told the other's question does not exist. So the fence is
 * now the ORDINARY account fence (`accountScopeClause`) over the account the
 * ticket was raised for: the company they are standing in, everything nested
 * beneath it, and nothing else. It cannot reach further than the account scope
 * because it IS the account scope — the same clause the accounts list is built
 * from, reading a column instead of a second idea of who the caller is.
 *
 * The agency's own tickets carry NO account, and NULL never matches an IN list,
 * so they stay the agency's. Staff get no clause at all.
 *
 * `tab` is the My/All choice, and it is now a real choice for a client too:
 * "mine" adds `creator_id`, on top of the fence and never instead of it.
 *
 * `table` prefixes the columns for a joined/EXISTS read (the thread fence).
 *
 * Returned as a clause rather than a pre-check so it rides the same WHERE as the
 * page AND the count — a total that didn't pass the same filter would say how
 * many tickets it is refusing to show.
 *
 * NO DEFAULT ANYWHERE BELOW, deliberately. Every reader in this file used to
 * take `portal = false`, which is a fence that fails OPEN when a call site
 * forgets it — and one did: the door that RAISES a ticket answered with the
 * whole team's list, so a client asking a question was handed every other
 * client's. A required parameter turns that miss into a compile error, which is
 * the only kind of reminder that never gets tired. */
export function ticketFence(
  guard: MemberGuard,
  scope: AccountScope,
  tab: "mine" | "all",
  table = ""
): { sql: string; params: string[] } {
  const col = (name: string) => (table ? `${table}.${name}` : name)
  const parts = [
    accountScopeClause(scope, col("account_id")),
    tab === "mine" ? { sql: `${col("creator_id")} = ?`, params: [guard.userId] } : { sql: "", params: [] },
  ].filter((p) => p.sql)
  return { sql: parts.map((p) => p.sql).join(" AND "), params: parts.flatMap((p) => p.params) }
}

export async function listTickets(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  tab: "mine" | "all",
  cursor: string | null
): Promise<Page<HelpTicket>> {
  const pos = decodeCursor(cursor)
  const after = keysetAfter(pos, TICKET_ORDER)
  const fence = ticketFence(guard, scope, tab)
  const clauses = [...(fence.sql ? [fence.sql] : []), ...(after.sql ? [after.sql] : [])]
  const params = [...fence.params, ...after.params]
  const rows = await d1Query<TicketRow>(
    cfg,
    guard.databaseId,
    // LIMIT is PAGE_SIZE + 1 — the extra row is how hasMore is known (R14).
    `SELECT ${TICKET_COLS} FROM help ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
     ORDER BY ${TICKET_ORDER} DESC, id DESC LIMIT ${PAGE_SIZE + 1}`,
    params
  )
  const page = toPage(rows, PAGE_SIZE, (r) => [r.updated_at ?? r.created_at, r.id])
  return { ...page, rows: page.rows.map(toTicket) }
}

/** R16: exact server COUNT(*) for the badges — the All total and the caller's
 * own (My) total in one read; never a loaded list's length. */
export async function countTickets(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope
): Promise<{ total: number; mineTotal: number }> {
  // R16 says the count is exact; the fence says exact ABOUT WHAT THEY MAY SEE.
  // An unfenced total would tell a client how many tickets exist that it is
  // refusing to show them — a smaller leak, but the same leak. Both totals ride
  // the SAME clause: "All" is their company's, "My" is the part they raised, and
  // for a client login those two numbers now genuinely differ.
  const fence = ticketFence(guard, scope, "all")
  const rows = await d1Query<{ total: number; mine: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS total, SUM(CASE WHEN creator_id = ? THEN 1 ELSE 0 END) AS mine FROM help${
      fence.sql ? ` WHERE ${fence.sql}` : ""
    }`,
    [guard.userId, ...fence.params]
  )
  return { total: rows[0]?.total ?? 0, mineTotal: rows[0]?.mine ?? 0 }
}

/** One ticket by id (or null). */
export async function getTicket(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string
): Promise<HelpTicket | null> {
  // The fence rides the WHERE here too: a by-id lookup that skipped it would be
  // the leak in its most convenient form (one id, one ticket, no list to page).
  const fence = ticketFence(guard, scope, "all")
  const rows = await d1Query<TicketRow>(
    cfg,
    guard.databaseId,
    `SELECT ${TICKET_COLS} FROM help WHERE id = ?${fence.sql ? ` AND ${fence.sql}` : ""}`,
    [id, ...fence.params]
  )
  return rows[0] ? toTicket(rows[0]) : null
}

/** THE THREAD FENCE — the same fence, one table along.
 *
 * A reply belongs to a ticket, so "may I read this conversation?" is exactly
 * "may I read this ticket?". `getTicket` has carried that answer since the help
 * fence landed; the THREAD doors did not, and read `help_threads WHERE help_id
 * = ?` on a caller-supplied id with nothing else on the WHERE. Row ids are not
 * secret — the live channel broadcasts them — so a client login holding
 * `help:read` (which they must hold to use their own support screen at all)
 * could hand back another client's ticket id and read the whole conversation.
 *
 * Expressed as a subquery rather than a pre-check so it rides the SAME WHERE as
 * the rows AND the count: a total that didn't pass the same filter would say how
 * many replies it is refusing to show. The fence reads columns on `help`, not on
 * `help_threads` — hence the alias it is built with. */
function threadFence(guard: MemberGuard, scope: AccountScope): { sql: string; params: string[] } {
  const fence = ticketFence(guard, scope, "all", "h")
  if (!fence.sql) return { sql: "", params: [] }
  return {
    sql: ` AND EXISTS (SELECT 1 FROM help h WHERE h.id = help_id AND ${fence.sql})`,
    params: fence.params,
  }
}

/** Every reply on a ticket, oldest first (the conversation order).
 *
 * WHOSE NAME TRAVELS. "The portal shows work status but never which staff member
 * is doing it" (SCOPE ch.06), and the portal used to keep that promise in the
 * BROWSER: it printed "You" for the signed-in person and the agency's name for
 * everyone else, on the reasoning that a client could only ever see their own
 * tickets, so "everyone else" meant staff. The staff member's real name was on
 * the wire the whole time; only the component declined to draw it.
 *
 * Both halves of that changed at once. Now that a contact sees their COMPANY's
 * questions, "everyone else" includes their own colleagues — and calling a
 * colleague "kwapso" is worse than a leak, it is a lie about who is talking. So
 * the decision moves to the server, where the caller's kind is known: a client
 * login is told the names of the people on THEIR side of the fence and nothing
 * about ours. A reply from someone with no portal login is the agency, and it
 * arrives with no name at all for the portal to render as us.
 *
 * Anyone who could reply on this ticket had to pass the same fence to see it, so
 * "has a portal login" is exactly "is one of this company's people". Staff
 * readers are unaffected — the agency app shows every name, as it must. */
export async function listReplies(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  ticketId: string
): Promise<HelpMessage[]> {
  const fence = threadFence(guard, scope)
  const rows = await d1Query<ReplyRow & { from_client: number }>(
    cfg,
    guard.databaseId,
    `SELECT id, help_id, message_body, tagged_user_ids, is_agent, creator_id, creator_name, created_at,
            EXISTS (SELECT 1 FROM portal_users pu WHERE pu.user_id = help_threads.creator_id) AS from_client
       FROM help_threads WHERE help_id = ?${fence.sql} ORDER BY created_at ASC LIMIT ${THREAD_HARD_CAP}`, // R14 hard cap
    [ticketId, ...fence.params]
  )
  return rows.map((r) =>
    toMessage(scope.kind === "portal" && r.from_client !== 1 ? { ...r, creator_name: null } : r)
  )
}

/** R16: the thread's exact reply COUNT(*) — the Conversation badge shows this,
 * never the loaded (THREAD_HARD_CAP-bounded) list's length. */
export async function countReplies(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  ticketId: string
): Promise<number> {
  const fence = threadFence(guard, scope)
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM help_threads WHERE help_id = ?${fence.sql}`,
    [ticketId, ...fence.params]
  )
  return rows[0]?.n ?? 0
}

/** Fields a create / update accepts. */
export type TicketInput = {
  description?: string
  helpType?: string
  screenRecordingLink?: string
  sourceScreen?: string
  sourceRelatedTable?: string
  sourceRelatedRowId?: string
  /** STAFF ONLY: the client this ticket is raised FOR. Ignored outright for a
   * portal caller, whose account is never taken from the body. See
   * `accountForStaffTicket`. */
  accountId?: string
}

/** WHICH CLIENT IS THIS TICKET FOR, when the agency raises it?
 *
 * A ticket's `account_id` is what the account fence reads, so a ticket with none
 * belongs to nobody and no client will ever see it. That is correct for the
 * agency's own internal questions, and it was silently wrong for everything else:
 * most of a client's history is typed in by US, on the phone, on their behalf —
 * 220 of the 221 requests the staging seed wrote were staff-raised, and a client
 * signed in to look at their own history saw zero of them.
 *
 * So a staff caller may NAME the client. A portal caller may not, ever: their
 * account comes from the guard corridor and the body is not consulted, or a
 * client could raise a ticket into another company's world by typing an id.
 *
 * The id is proved to be a live account in the caller's OWN team database before
 * it is written — an unchecked string here would mint a ticket fenced to
 * something that does not exist, which is a row nobody can ever reach again. */
async function accountForStaffTicket(cfg: D1Rest, guard: MemberGuard, raw: unknown): Promise<string | null> {
  const id = optionalText(raw, "Client", TEXT_LIMITS.short)
  if (!id) return null
  const rows = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `SELECT id FROM accounts WHERE id = ${sqlString(id)} AND deactivated_at IS NULL LIMIT 1`
  )
  if (!rows[0]) throw new GuardError(400, "invalid_input", "That client isn't on your books any more.")
  return rows[0].id
}

/** Raise a ticket. Description is required; everything else optional. Opens in the
 * `open` status. Returns the new ticket's id AND the account it was raised for —
 * the live ping needs the account to reach the raiser's colleagues and nobody
 * else.
 *
 * WHICH ACCOUNT. The one the caller is STANDING IN, taken from the guard
 * corridor and never from the body: a client raises a question for the company
 * they are looking at, which is the same company every other read on that screen
 * was fenced to. Staff raise the agency's own questions, which belong to no
 * client and are stamped NULL. */
export async function createTicket(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: TicketInput
): Promise<{ id: string; accountId: string | null }> {
  const description = requireText(input.description, "Description", TEXT_LIMITS.long)

  const id = ulid()
  // A CLIENT's ticket belongs to the company they are standing in — from the
  // guard corridor, never from the body. THE AGENCY's ticket belongs to whichever
  // client it names, or to nobody when it is our own internal question.
  const accountId =
    scope.kind === "portal" ? scope.currentAccountId : await accountForStaffTicket(cfg, guard, input.accountId)
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO help (id, help_type, description, screen_recording_link, source_screen, source_related_table, source_related_row_id, status, resolved, account_id, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString((optionalText(input.helpType, "Type", TEXT_LIMITS.short) ?? null))}, ${sqlString(description)}, ${sqlString((optionalText(input.screenRecordingLink, "Screen recording link", TEXT_LIMITS.link) ?? null))}, ${sqlString((optionalText(input.sourceScreen, "Source", TEXT_LIMITS.short) ?? null))}, ${sqlString((optionalText(input.sourceRelatedTable, "Source table", TEXT_LIMITS.short) ?? null))}, ${sqlString((optionalText(input.sourceRelatedRowId, "Source row", TEXT_LIMITS.short) ?? null))}, 'open', 0, ${sqlString(accountId)}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Help ticket raised",
    description: `${actor.name} raised a support ticket`,
    relatedTable: "help",
    relatedRowId: id,
  })

  return { id, accountId }
}

/** Edit a ticket's content (description / type / screen recording / source). Stamps
 * the editor audit block + updated_at (which also re-sorts it to the top).
 * Returns the account the ticket belongs to, for the live ping. */
export async function updateTicket(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  input: TicketInput
): Promise<string | null> {
  const before = await ticketOrThrow(cfg, guard, scope, id)
  const description = requireText(input.description, "Description", TEXT_LIMITS.long)

  // NAMING THE CLIENT ON A TICKET THAT HAS NONE — set once, never moved.
  //
  // A ticket raised without a client (ours, or one we forgot to attribute) can be
  // given one. A ticket that already HAS a client cannot be moved to another:
  // that would retroactively take a conversation away from the people reading it
  // and hand it, replies and all, to strangers. If we ever want that, it is a
  // deliberate feature with a confirm panel, not a quiet field on an edit form.
  // A portal caller never reaches this: their own ticket already carries their
  // company, so the branch below is unreachable for them by construction.
  const namedAccount =
    scope.kind === "portal" ? null : await accountForStaffTicket(cfg, guard, input.accountId)
  if (namedAccount && before.account_id && namedAccount !== before.account_id) {
    throw new GuardError(409, "account_fixed", "This ticket already belongs to another client, and can't be moved.")
  }
  const accountAfter = before.account_id ?? namedAccount

  const now = new Date().toISOString()
  // The fence rides the UPDATE as well as the read above — same sentence, same
  // statement, so neither can be removed while the other keeps the door honest.
  // Parameterised (the house shape for a fenced UPDATE, as in lib/accounts):
  // the clause carries a placeholder PER account id, so it cannot be spelled out
  // by hand and cannot drift from the one the read used.
  const fence = ticketFence(guard, scope, "all")
  await d1Query(
    cfg,
    guard.databaseId,
    `UPDATE help SET help_type = ?, description = ?, screen_recording_link = ?, source_screen = ?,
       account_id = ?, updated_at = ?, editor_id = ?, editor_email = ?, editor_name = ?
     WHERE id = ?${fence.sql ? ` AND ${fence.sql}` : ""}`,
    [
      optionalText(input.helpType, "Type", TEXT_LIMITS.short) ?? null,
      description,
      optionalText(input.screenRecordingLink, "Screen recording link", TEXT_LIMITS.link) ?? null,
      optionalText(input.sourceScreen, "Source", TEXT_LIMITS.short) ?? null,
      accountAfter,
      now,
      actor.id,
      actor.email,
      actor.name,
      id,
      ...fence.params,
    ]
  )

  const changes = describeChanges([
    { label: "Type", from: before.help_type, to: optionalText(input.helpType, "Type", TEXT_LIMITS.short) ?? null },
    { label: "Description", from: before.description, to: description },
    {
      label: "Screen recording",
      from: before.screen_recording_link,
      to: optionalText(input.screenRecordingLink, "Screen recording link", TEXT_LIMITS.link) ?? null,
      hideValues: true,
    },
    { label: "Source", from: before.source_screen, to: optionalText(input.sourceScreen, "Source", TEXT_LIMITS.short) ?? null },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Help ticket edited",
    description: `${actor.name} edited a support ticket${changes ? ` — ${changes}` : ""}`,
    relatedTable: "help",
    relatedRowId: id,
  })
  // The ping names the account the ticket has AFTER the edit — otherwise the
  // moment a ticket is finally attributed to a client, the one ping that would
  // have told their people it exists is addressed to nobody.
  return accountAfter
}

/** Move a ticket along its fixed lifecycle. Resolving stamps the resolver block +
 * resolved flag; any non-resolved status clears it. Caller-permission lives in the
 * route — every status move (incl. reopen) needs help:edit. Reports whether a row
 * actually moved (R17) and which account's ticket it was (for the live ping). */
export async function setStatus(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  status: HelpStatus
): Promise<{ moved: boolean; accountId: string | null }> {
  const before = await ticketOrThrow(cfg, guard, scope, id)
  // R17: the `status <> ?` predicate makes the move idempotent — re-resolving an
  // already-resolved ticket moves zero rows, so it writes no duplicate history,
  // re-stamps no editor/updated_at (no phantom re-sort), and pings nothing.
  const now = new Date().toISOString()
  const resolved = status === "resolved"
  const resolveBlock = resolved
    ? `resolved = 1, resolved_at = ${sqlString(now)}, resolver_id = ${sqlString(actor.id)}, resolver_email = ${sqlString(actor.email)}, resolver_name = ${sqlString(actor.name)}`
    : "resolved = 0, resolved_at = NULL, resolver_id = NULL, resolver_email = NULL, resolver_name = NULL"
  // The fence rides the move itself, beside the R17 predicate.
  const fence = ticketFence(guard, scope, "all")
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE help SET status = ?, ${resolveBlock}, updated_at = ?, editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)} WHERE id = ? AND status <> ?${fence.sql ? ` AND ${fence.sql}` : ""} RETURNING id`,
    [status, now, id, status, ...fence.params]
  )
  if (!changed[0]) return { moved: false, accountId: before.account_id }

  await logActivity(cfg, guard.databaseId, actor, {
    type: `Help ticket ${status === "resolved" ? "resolved" : status === "reopened" ? "reopened" : "updated"}`,
    description: `${actor.name} set a support ticket to ${status.replace("_", " ")}`,
    relatedTable: "help",
    relatedRowId: id,
  })
  return { moved: true, accountId: before.account_id }
}

/** Move MANY tickets to the same status in one call (the bulk sibling of
 * setStatus). Applies the SAME per-row change — same UPDATE, same resolver block,
 * same activity row — and reports how many actually changed vs. were skipped
 * (an id with no matching ticket, or one ALREADY at the target status — R17:
 * a re-run bulk writes no duplicate history and pings nothing). Returns the rows
 * that really changed — id AND the account each belongs to — so the route
 * publishes one row-level ping EACH, aimed at the people who may hear it. */
export async function bulkSetStatus(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  ids: string[],
  status: HelpStatus
): Promise<{ changed: { id: string; accountId: string | null }[]; skipped: number }> {
  const changed: { id: string; accountId: string | null }[] = []
  let skipped = 0
  for (const id of ids) {
    try {
      const { moved, accountId } = await setStatus(cfg, guard, scope, actor, id, status)
      if (moved) changed.push({ id, accountId })
      else skipped++ // already at the target status — a no-op, not an event
    } catch (e) {
      // A missing ticket is skipped, not fatal — the rest of the batch still applies.
      if (e instanceof GuardError && e.status === 404) {
        skipped++
        continue
      }
      throw e
    }
  }
  return { changed, skipped }
}

/** The FILTER-shaped bulk (the set-shaped job): "move every ticket matching
 * these facets to <toStatus>" in ONE call — the agent has no variables, only
 * words, so passing it rows means re-saying every id; passing the FILTER is 2
 * calls where 10 round-trips were. It counts FIRST (so a confirm can state the
 * TRUE number), refuses past BULK_IDS_LIMIT, is idempotent by construction
 * (`status <> ?` — a re-run matches nothing), writes ONE activity row for the
 * whole set, and the route publishes only when something moved. Facets ONLY,
 * never free text — a fuzzy ranked match is not something a person can approve
 * honestly. `dryRun` returns the count without writing (the count-first step). */
export async function bulkSetStatusByFilter(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  filter: { status?: HelpStatus; helpType?: string },
  toStatus: HelpStatus,
  dryRun: boolean
): Promise<{ matched: number; changed: number; accounts: string[] }> {
  // The same facet set the Help screen sends (status / type). The R17 predicate
  // (`status <> ?`) is INLINE in both statements below — source-visible for the
  // idempotent-transitions scan — so "matched" is already "would change".
  //
  // The fence leads the extras: a set-shaped write must not reach a ticket the
  // caller cannot even see, and the COUNT it confirms with must be a count of
  // the same rows the UPDATE will touch.
  const authored = ticketFence(guard, scope, "all")
  const extra: string[] = authored.sql ? [authored.sql] : []
  const extraParams: (string | number)[] = [...authored.params]
  if (filter.status) {
    extra.push("status = ?")
    extraParams.push(filter.status)
  }
  if (filter.helpType) {
    extra.push("help_type = ?")
    extraParams.push(filter.helpType)
  }
  const extraSql = extra.length ? ` AND ${extra.join(" AND ")}` : ""

  const countRows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM help WHERE status <> ?${extraSql}`,
    [toStatus, ...extraParams]
  )
  const matched = countRows[0]?.n ?? 0
  if (dryRun || matched === 0) return { matched, changed: 0, accounts: [] }
  if (matched > BULK_IDS_LIMIT)
    throw new GuardError(
      400,
      "too_many",
      `That filter matches ${matched} tickets — the bulk ceiling is ${BULK_IDS_LIMIT}. Narrow the filter.`
    )

  const now = new Date().toISOString()
  const resolved = toStatus === "resolved"
  const resolveBlock = resolved
    ? `resolved = 1, resolved_at = ${sqlString(now)}, resolver_id = ${sqlString(actor.id)}, resolver_email = ${sqlString(actor.email)}, resolver_name = ${sqlString(actor.name)}`
    : "resolved = 0, resolved_at = NULL, resolver_id = NULL, resolver_email = NULL, resolver_name = NULL"
  // `account_id` rides the RETURNING beside the id: ONE activity row and ONE
  // coarse ping is right for the agency's screens, but a client login hears only
  // its own world, so the route needs to know WHICH worlds this set touched.
  const changedRows = await d1Query<{ id: string; account_id: string | null }>(
    cfg,
    guard.databaseId,
    `UPDATE help SET status = ?, ${resolveBlock}, updated_at = ?, editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)} WHERE status <> ?${extraSql} RETURNING id, account_id`,
    [toStatus, now, toStatus, ...extraParams]
  )
  const changed = changedRows.length
  if (changed > 0)
    // ONE activity row for the set — history says what happened, not per-row noise.
    await logActivity(cfg, guard.databaseId, actor, {
      type: `Help tickets ${toStatus === "resolved" ? "resolved" : "updated"} (bulk)`,
      description: `${actor.name} set ${changed} support ticket${changed === 1 ? "" : "s"}${filter.helpType ? ` of type "${filter.helpType}"` : ""}${filter.status ? ` from ${filter.status.replace("_", " ")}` : ""} to ${toStatus.replace("_", " ")}`,
      relatedTable: "help",
    })
  return {
    matched,
    changed,
    accounts: [...new Set(changedRows.map((r) => r.account_id).filter((a): a is string => !!a))],
  }
}

/** Add a reply to a ticket's thread, and bump the ticket's updated_at so it
 * re-sorts to the top of both tabs. `taggedUserIds` are notify-only mentions (the
 * notify happens in the route). `isAgent` marks the AI-drafted reply. Returns the
 * new reply's id. */
export async function addReply(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  ticketId: string,
  body: string,
  taggedUserIds: string[],
  isAgent: boolean
): Promise<string> {
  const clean = body.trim()
  if (!clean) throw new GuardError(400, "invalid_input", "A reply can't be empty.")
  await ticketOrThrow(cfg, guard, scope, ticketId)

  const id = ulid()
  const now = new Date().toISOString()
  const tagged = taggedUserIds.length ? sqlString(JSON.stringify(taggedUserIds)) : "NULL"
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO help_threads (id, help_id, message_body, tagged_user_ids, is_agent, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(ticketId)}, ${sqlString(clean)}, ${tagged}, ${isAgent ? 1 : 0}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});
UPDATE help SET updated_at = ${sqlString(now)} WHERE id = ${sqlString(ticketId)};`
  )

  return id
}

/** HOOK (Phase 3) — the AI agent drafts the FIRST reply here, labelled "Drafted by
 * the kwapso assistant" (is_agent = 1), built from Learning content + the team's
 * data. Until the data-ops/agent worker exists this stays a no-op, so a ticket
 * always opens awaiting a human reply (per the locked "ticket always opens" rule).
 * When implemented it will addReply(..., isAgent=true) and publish help_threads. */
export async function maybeDraftFirstReply(
  _cfg: D1Rest,
  _guard: MemberGuard,
  _ticketId: string,
  _description: string
): Promise<string | null> {
  return null
}
