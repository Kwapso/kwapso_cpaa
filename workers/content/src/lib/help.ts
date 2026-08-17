// The TICKETS module — team-wide support tickets + threaded replies, inside the team's
// OWN database. Locked model rules enforced HERE on the server:
//   • status is a FIXED lifecycle the code trusts (new / triaged / in_progress /
//     ready / resolved) — help_type is a cosmetic selectable, never the source of
//     truth (SCOPE ch.07 calls the type an EDITABLE list, so the code never
//     hard-codes the four values it seeds);
//   • the account owns the WORDING until we read it: a client may edit and re-rank
//     their own ticket while `locked_at` is null, and the first staff touch sets it
//     (SCOPE ch.07, "editing and ranking lock at first staff touch");
//   • the list's order IS the drag-rank — there is no priority dropdown and there
//     will not be one;
//   • tickets are team-wide: the My/All tabs are just a creator filter, no
//     row-level privacy (a mention is notify-only — see lib/notify);
//   • resolving stamps the resolver audit block + resolved flag; reopening clears
//     it. Every status move (incl. reopen) is gated purely by help:edit;
//   • the AI agent's first-draft reply is a HOOK (maybeDraftFirstReply) left off
//     until the agent worker exists — a ticket always opens regardless.

import { accountScopeClause, type AccountScope } from "@shared/workers/account-scope"
import { describeChanges, logActivity, type Actor } from "@shared/workers/activity"
import { countCollectionWith, reportedTotal } from "@shared/workers/count"
import { d1ExecScript, d1Query, likeLiteral, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import {
  HELP_STATUSES,
  ticketTypeWaitsForValidation,
  type HelpMessage,
  type HelpStatus,
  type HelpTicket,
} from "@shared/types"
import { GuardError, type MemberGuard } from "@shared/workers/gating"
import { optionalText, parseStringArray, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { BULK_IDS_LIMIT, THREAD_HARD_CAP, TICKET_FACET_CAP } from "@shared/workers/limits"
import { decodeCursor, keysetAfter, PAGE_SIZE, toPage, type Page } from "@shared/workers/paging"
import { rankAtTop, rankBetween } from "@shared/workers/rank"
// The reference number moved out to its own file the moment a second noun needed
// one (a story, a task, a to-do, a sprint). One counter, one race guard, one
// spelling of the format — see lib/refs.ts.
import { nextRef, REF_KINDS } from "./refs"

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
  app_id: string | null
  app_name: string | null
  raised_by_contact_id: string | null
  raised_by_contact_name: string | null
  validated_at: string | null
  ref: string | null
  rank: string | null
  locked_at: string | null
  archived_at: string | null
  draft_resolution: string | null
  story_count: number
  done_story_count: number
  title_de: string | null
  title_en: string | null
  creator_id: string
  creator_name: string | null
  editor_name: string | null
  created_at: string
  updated_at: string | null
  /** Computed in TICKET_COLS: does the person who raised / last edited this row
   * have a portal login? "Is one of the client's own people", in other words —
   * see toTicket. */
  raiser_is_client: number
  editor_is_client: number
}

/** WHOSE NAME TRAVELS ON A TICKET — the same promise `listReplies` keeps on a
 * thread, kept one table up, where it was not being kept at all.
 *
 * SCOPE ch.06: "the portal shows work status but never which staff member is
 * doing it." That sentence is why `/help/stakeholders` is withheld from the
 * portal surface entirely — and every ticket row was carrying the same fact for
 * free: `raiserName` and `editorName` are the staff member's real name, and
 * `raiserId` is their stable ULID, the same one against the same person on every
 * ticket they ever touch. The portal drew none of it and the wire sent all of
 * it, which is the version of this mistake that survives a UI rewrite.
 *
 * Not a hypothetical, and not an edge: 220 of the 221 seeded historical requests
 * are staff-raised, because staff raise a client's questions on their behalf
 * (SCOPE ch.07). Staff-authored is the majority case here.
 *
 * The rule is `listReplies`'s rule, for the same reason: a client login is told
 * the names of the people on THEIR side of the fence — a colleague who raised
 * the question is theirs to know, and calling them "kwapso" would be a lie about
 * who is talking — and nothing at all about ours. "Has a portal login" is
 * exactly "is one of this company's people"; anyone else is the agency, and
 * arrives with no name and no handle. Staff readers are unaffected.
 *
 * `scope` is REQUIRED rather than defaulted, for the reason written over
 * `ticketFence`: a redaction that defaults to "not a client" is a redaction that
 * fails open the day somebody writes a new reader. */
function toTicket(r: TicketRow, scope: AccountScope): HelpTicket {
  // Ours = the agency's. A portal caller learns nothing about our side of it.
  const hideRaiser = scope.kind === "portal" && r.raiser_is_client !== 1
  const hideEditor = scope.kind === "portal" && r.editor_is_client !== 1
  return {
    id: r.id,
    helpType: r.help_type,
    description: r.description,
    screenRecordingLink: r.screen_recording_link,
    sourceScreen: r.source_screen,
    // A status the code does not know reads as "new" — the state a ticket nobody
    // has dealt with sits in. It is the SAFE direction: an unrecognised value
    // shows up as work still to do rather than as work already finished, so a
    // row the migration somehow missed nags us instead of quietly disappearing.
    status: (HELP_STATUSES as readonly string[]).includes(r.status)
      ? (r.status as HelpStatus)
      : "new",
    resolved: r.resolved === 1,
    resolvedAt: r.resolved_at,
    // The HANDLE dies with the name. Blanking `raiserName` alone would leave a
    // per-staff-member pseudonym on every ticket, and a pseudonym is anonymity
    // only until one thing links it to a name once — which is precisely the
    // linkage the reply notification used to make (see listReplies).
    raiserId: hideRaiser ? null : r.creator_id,
    raiserName: hideRaiser ? null : r.creator_name,
    editorName: hideEditor ? null : r.editor_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    accountId: r.account_id,
    // The work-engine fields. Most of these are not a staff FACT the way a name
    // is, so most are not redacted: a client is meant to know their own reference
    // number, the order they dragged their requests into, whether their wording
    // is still theirs to change, and whether it has been put away.
    //
    // `draftResolution` is the ONE exception, and it goes out to staff only. It
    // is our unsent working text — each story's closing note, appended as the
    // work finishes (lib/ready-flip.ts) — so half of it may be wrong and all of
    // it is written in the register colleagues use with each other. The
    // resolution a client reads is the one a person SENDS.
    ref: r.ref,
    draftResolution: scope.kind === "portal" ? null : r.draft_resolution,
    // TWO NUMBERS, NEVER A LIST. This is the whole of what a client login learns
    // about the work on their request (BUILD-1 §7: "stories as a COUNT only —
    // never the titles"), and it is deliberately the same two numbers we show
    // ourselves: a count nobody can check against the list beside it is a count
    // somebody stops believing.
    storyCount: r.story_count,
    doneStoryCount: r.done_story_count,
    rank: r.rank,
    lockedAt: r.locked_at,
    archivedAt: r.archived_at,
    titleDe: r.title_de,
    titleEn: r.title_en,
    // WHICH SYSTEM, AND WHO ASKED. Neither is redacted: a client already knows
    // their own apps and their own colleagues — those are the two facts on this
    // row that are THEIRS. The redaction above is about our side of the fence.
    appId: r.app_id,
    appName: r.app_name,
    raisedByContactId: r.raised_by_contact_id,
    raisedByContactName: r.raised_by_contact_name,
    validatedAt: r.validated_at,
  }
}

type ReplyRow = {
  id: string
  help_id: string
  message_body: string
  tagged_user_ids: string | null
  is_agent: number
  /** Null only on the way OUT, and only to a client login — see listReplies. */
  creator_id: string | null
  creator_name: string | null
  created_at: string
}

function toMessage(r: ReplyRow): HelpMessage {
  return {
    id: r.id,
    ticketId: r.help_id,
    body: r.message_body,
    taggedUserIds: parseStringArray(r.tagged_user_ids),
    isAgent: r.is_agent === 1,
    authorId: r.creator_id,
    authorName: r.creator_name,
    createdAt: r.created_at,
  }
}

// The last two are computed, not stored: "does this person have a portal login",
// asked of the raiser and of the last editor. Exactly the subselect listReplies
// uses on an author, and it rides the SAME read as the row so a name and the
// answer about that name can never come from two different moments.
const TICKET_COLS = `id, help_type, description, screen_recording_link, source_screen, status, resolved, resolved_at,
  account_id, app_id, raised_by_contact_id, validated_at,
  ref, rank, locked_at, archived_at, draft_resolution, title_de, title_en,
  creator_id, creator_name, editor_name, created_at, updated_at,
  (SELECT ap.name FROM apps ap WHERE ap.id = help.app_id) AS app_name,
  (SELECT a.name FROM accounts a WHERE a.id = help.raised_by_contact_id) AS raised_by_contact_name,
  EXISTS (SELECT 1 FROM portal_users pu WHERE pu.user_id = help.creator_id) AS raiser_is_client,
  EXISTS (SELECT 1 FROM portal_users pu WHERE pu.user_id = help.editor_id) AS editor_is_client,
  (SELECT COUNT(*) FROM stories s WHERE s.ticket_id = help.id) AS story_count,
  (SELECT COUNT(*) FROM stories s WHERE s.ticket_id = help.id AND s.status = 'done') AS done_story_count`

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

/** THE SORT, and it is the drag-rank (SCOPE ch.07: "drag-rank is the only
 * priority signal"). It used to be newest-activity-first, which is a fine default
 * and a bad promise: a reply on an old ticket shoved it above the one somebody
 * deliberately dragged to the top, so the order a person arranged survived only
 * until the next comment.
 *
 * `COALESCE(rank, id)` so a row written before the rank column existed still
 * sorts sensibly — a ULID carries its own creation time, so an un-ranked backlog
 * reads newest-first exactly as it did. The id breaks ties, which makes the order
 * TOTAL, which is what the keyset cursor needs to page without repeating a row. */
const TICKET_ORDER = "COALESCE(rank, id)"

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
    tab === "mine" ? mineClause(guard, scope, col) : { sql: "", params: [] },
  ].filter((p) => p.sql)
  return { sql: parts.map((p) => p.sql).join(" AND "), params: parts.flatMap((p) => p.params) }
}

/** WHAT "MY TICKETS" MEANS, and it changed on 17 Aug 2026 (CHECKLIST 2.3).
 *
 * It used to mean "tickets I typed", which was the wrong question in an agency
 * where 220 of 221 requests were typed by staff on a client's behalf: the person
 * who typed it is rarely the person who has to do anything about it. Aurora's
 * answer, taken over the owner's, is **tickets on the apps I am staffed to** —
 * the systems I am actually responsible for. That is a real inbox.
 *
 * A CLIENT LOGIN KEEPS THE OLD MEANING, deliberately: staffing is our rota, a
 * contact is on nobody's, and "tickets on the apps you are staffed to" would
 * hand every client an empty tab forever. For them "mine" is still what they
 * raised, which is the only version of the word that means anything on their
 * side.
 *
 * A SUBQUERY rather than a resolved list of ids: the staffed set is read INSIDE
 * the statement, so the list and its count (which share this clause) can never
 * be asked about two different moments — and an id list would be one more
 * unbounded `IN (…)` to cap. A member staffed to nothing matches no ticket,
 * which is the honest empty answer rather than an error. */
function mineClause(
  guard: MemberGuard,
  scope: AccountScope,
  col: (name: string) => string
): { sql: string; params: string[] } {
  if (scope.kind === "portal") return { sql: `${col("creator_id")} = ?`, params: [guard.userId] }
  return {
    sql: `${col("app_id")} IN (SELECT app_id FROM app_staff WHERE user_id = ? AND deactivated_at IS NULL)`,
    params: [guard.userId],
  }
}

/** LIVE OR PUT AWAY — the everyday list against the archive drawer.
 *
 * A separate clause from `ticketFence` on purpose, and the distinction is worth
 * keeping straight: the fence decides what a caller MAY see and rides every read
 * AND every write, while this decides what they are LOOKING AT and rides only the
 * list and its count. Folding it into the fence would quietly make an archived
 * ticket unreplyable and un-unarchivable — you cannot take a record out of a
 * drawer you can no longer reach into. */
function archiveClause(view: "live" | "archived"): string {
  return view === "archived" ? "archived_at IS NOT NULL" : "archived_at IS NULL"
}

/** WHAT THE SEARCH BOX ON THE TICKETS SCREEN ASKS THE SERVER. It rides the list
 * AND the count, so the number beside the results counts the same question the
 * rows answer.
 *
 * It searches the reference and the words a person would recognise a ticket by —
 * the description they wrote and the title we made of it. ESCAPED for the same
 * two reasons the accounts search is (`workers/tenancy/src/lib/accounts.ts`): a
 * search box is not a pattern box, and an alternating `%a%a%…` needle is a
 * handful of bytes that costs the worker exponential time over the whole table. */
/** WHOSE TICKETS — narrowed to one account (a client's own company, or one
 * person's own row). A FILTER, not a fence: the fence has already decided which
 * accounts this caller may see at all, and this only says which of them they are
 * looking at. It rides the list AND its count, or the badge would answer a
 * different question from the rows (R16). */
function accountClause(accountId: string | undefined): { sql: string; params: string[] } {
  return accountId ? { sql: "account_id = ?", params: [accountId] } : { sql: "", params: [] }
}

/** WHICH SYSTEM — the app record's own Tickets tab (CHECKLIST 8.6). The same
 * shape as the account narrowing above and for the same reason: a filter on top
 * of the fence, riding the list AND its count so the badge and the rows answer
 * one question (R16). A ticket that names no app never matches, which is right —
 * "tickets about this system" cannot include the ones nobody said were. */
function appClause(appId: string | undefined): { sql: string; params: string[] } {
  return appId ? { sql: "app_id = ?", params: [appId] } : { sql: "", params: [] }
}

/** WHICH KIND, AND WHICH STAGE — the sub-tabs under All / My / Archived
 * (CHECKLIST 5.1: Ready, Issues, Questions, Requests, Extra, Closed, All).
 *
 * Two facets rather than one, because that strip is genuinely two questions
 * wearing one row of tabs: four of its tabs name a TYPE (the team's own editable
 * `Ticket type` vocabulary, so the strip is DERIVED from the team's values and
 * not hard-coded — retiring "Bug" on the Dropdown values screen retires its tab),
 * and two name a STATUS. "All" sends neither.
 *
 * The status one is deliberately a single value and not a list: every tab in the
 * strip that names a stage names exactly one, and a door that accepted several
 * would be a filter language nobody asked for.
 *
 * Both ride the list AND the count, or the badge answers a different question
 * from the rows beneath it (R16). */
function typeClause(helpType: string | undefined): { sql: string; params: string[] } {
  return helpType ? { sql: "help_type = ?", params: [helpType] } : { sql: "", params: [] }
}

function statusClause(status: HelpStatus | undefined): { sql: string; params: string[] } {
  return status ? { sql: "status = ?", params: [status] } : { sql: "", params: [] }
}

function searchClause(q: string | undefined): { sql: string; params: string[] } {
  if (!q) return { sql: "", params: [] }
  const needle = `%${likeLiteral(q.toLowerCase())}%`
  return {
    sql: `(LOWER(description) LIKE ? ESCAPE '\\' OR LOWER(ref) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(title_en, '')) LIKE ? ESCAPE '\\')`,
    params: [needle, needle, needle],
  }
}

/** THE FACETS THE TICKET DOOR PARSES. Declared as a type so the door, the count,
 * the machine surface and this file cannot drift about what a filter IS (R19) —
 * the same shape `StoryFilter` has had since the work engine landed, adopted here
 * the day the list grew a second row of tabs. */
export type TicketFilter = {
  /** the My/All choice — a raiser filter on top of the fence, never instead */
  tab: "mine" | "all"
  /** the everyday list, or the archive drawer */
  view: "live" | "archived"
  /** the search box, answered by the door (R14: the list pages) */
  q?: string
  /** one client's tickets — a FILTER on top of the fence */
  accountId?: string
  /** one system's tickets — the app record's Tickets tab (8.6) */
  appId?: string
  /** one kind — the sub-tab strip's four type tabs */
  helpType?: string
  /** one stage — the sub-tab strip's Ready and Closed tabs */
  status?: HelpStatus
}

/** Everything except the keyset cursor, written once so the page and its count
 * are asked the one question (R16). */
function ticketWhere(
  guard: MemberGuard,
  scope: AccountScope,
  filter: TicketFilter
): { sql: string[]; params: string[] } {
  const fence = ticketFence(guard, scope, filter.tab)
  const parts = [
    accountClause(filter.accountId),
    appClause(filter.appId),
    typeClause(filter.helpType),
    statusClause(filter.status),
    searchClause(filter.q),
  ].filter((p) => p.sql)
  return {
    sql: [archiveClause(filter.view), ...(fence.sql ? [fence.sql] : []), ...parts.map((p) => p.sql)],
    params: [...fence.params, ...parts.flatMap((p) => p.params)],
  }
}

export async function listTickets(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  filter: TicketFilter,
  cursor: string | null
): Promise<Page<HelpTicket>> {
  const pos = decodeCursor(cursor)
  const after = keysetAfter(pos, TICKET_ORDER)
  const where = ticketWhere(guard, scope, filter)
  const clauses = [...where.sql, ...(after.sql ? [after.sql] : [])]
  const params = [...where.params, ...after.params]
  const rows = await d1Query<TicketRow>(
    cfg,
    guard.databaseId,
    // LIMIT is PAGE_SIZE + 1 — the extra row is how hasMore is known (R14).
    `SELECT ${TICKET_COLS} FROM help WHERE ${clauses.join(" AND ")}
     ORDER BY ${TICKET_ORDER} DESC, id DESC LIMIT ${PAGE_SIZE + 1}`,
    params
  )
  // The page's key is the SORT, and the sort is the rank — keyed off anything
  // else and page two starts in a different place from where page one stopped.
  const page = toPage(rows, PAGE_SIZE, (r) => [r.rank ?? r.id, r.id])
  return { ...page, rows: page.rows.map((r) => toTicket(r, scope)) }
}

/** R16: exact server COUNT(*) for the badges — the All total and the caller's
 * own (My) total in one read; never a loaded list's length. */
export async function countTickets(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  filter: TicketFilter
): Promise<{ total: number; mineTotal: number }> {
  // R16 says the count is exact; the fence says exact ABOUT WHAT THEY MAY SEE.
  // An unfenced total would tell a client how many tickets exist that it is
  // refusing to show them — a smaller leak, but the same leak. Both totals ride
  // the SAME clause: "All" is their company's, "My" is the part they raised, and
  // for a client login those two numbers now genuinely differ.
  // …and it counts the SAME VIEW the list is showing. A total taken across live
  // and archived together would badge a number the list can never reach, which is
  // the R16 failure in its quietest form: both numbers true, neither about the
  // rows on screen.
  // …and it counts the SAME SEARCH, when there is one: a filtered list showing an
  // unfiltered total is the R16 failure the other way round.
  // …and the SAME account narrowing, the SAME kind and the SAME stage, for the
  // same reason: a tab badging one client's Questions over a total counting
  // everybody's everything is the R16 failure again, four times over.
  //
  // ONE `ticketWhere` CALL, shared with the list above, and that is the fix as
  // much as it is the tidying: this function used to rebuild the clause by hand
  // and had ALREADY drifted — it appended the account clause to the SQL and left
  // its parameter out of the array, so a tab narrowed to one client bound the
  // search needle into the account slot. The two questions are now literally the
  // same expression, so they cannot be asked differently.
  //
  // The count always reads the "all" tab: `mineTotal` is computed beside it from
  // the same rows, so narrowing to the caller's own first would make "my" the
  // denominator of itself.
  const where = ticketWhere(guard, scope, { ...filter, tab: "all" })
  // R16 (amended): counted exactly to TOTAL_COUNT_CAP through the one bounded
  // seam. Both numbers are BADGES, so both are clamped — "my" tickets cannot
  // exceed all tickets, and a partial tally beside a partial total tells the same
  // story at the same ceiling.
  //
  // The "mine" tally is the SAME expression the My tab filters by (mineClause),
  // not a second idea of the word — R16's whole point. When that sentence
  // changed from "tickets I typed" to "tickets on my apps", the badge changed
  // with it because there is only one place it is written.
  const mine = mineClause(guard, scope, (n) => n)
  const row = await countCollectionWith<{ total: number; mine: number }>(
    cfg,
    guard.databaseId,
    `SELECT (${mine.sql}) AS is_mine FROM help WHERE ${where.sql.join(" AND ")}`,
    "COUNT(*) AS total, SUM(is_mine) AS mine",
    [...mine.params, ...where.params]
  )
  return { total: reportedTotal(row?.total ?? 0), mineTotal: reportedTotal(row?.mine ?? 0) }
}

/** THE SUB-TAB BADGES, IN ONE READ (R16 + CHECKLIST 5.1).
 *
 * A tab strip of seven cannot cost seven counts: the strip is on the screen a
 * team lives in, and six extra bounded scans per page load is exactly the sort of
 * cost the count seam was capped to avoid. So this is ONE grouped read — the
 * server's own tally per type and per status over the same WHERE the list uses,
 * minus the type and status facets themselves (a strip whose Questions badge was
 * counted while narrowed to Questions would read "N" on every tab).
 *
 * BOUNDED like every other count here: the inner select carries the same ceiling,
 * so a team with a million tickets pays the same worst case as everywhere else. */
export async function countTicketFacets(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  filter: TicketFilter
): Promise<{ byType: Record<string, number>; byStatus: Record<string, number> }> {
  const where = ticketWhere(guard, scope, {
    ...filter,
    tab: "all",
    helpType: undefined,
    status: undefined,
  })
  const rows = await d1Query<{ help_type: string | null; status: string; n: number }>(
    cfg,
    guard.databaseId,
    // R14: bounded by GROUPING — at most (types × statuses) rows come back, and
    // both vocabularies are collections that cannot run away.
    `SELECT help_type, status, COUNT(*) AS n FROM help
      WHERE ${where.sql.join(" AND ")} GROUP BY help_type, status LIMIT ${TICKET_FACET_CAP}`,
    where.params
  )
  const byType: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  for (const r of rows) {
    if (r.help_type) byType[r.help_type] = (byType[r.help_type] ?? 0) + r.n
    byStatus[r.status] = (byStatus[r.status] ?? 0) + r.n
  }
  return { byType, byStatus }
}

/** The rank a new ticket takes: above every one the caller can already see.
 *
 * Read-then-write, deliberately, and safe because of what it is FOR. Two tickets
 * raised in the same instant can land on the same rank; both are "newest", the
 * `id DESC` tiebreak still gives the list a total order, and the first drag
 * separates them for good. See rankAtTop — the alternative is a lock nobody could
 * perceive the benefit of. */
async function topRank(cfg: D1Rest, guard: MemberGuard): Promise<string> {
  const rows = await d1Query<{ top: string | null }>(
    cfg,
    guard.databaseId,
    `SELECT MAX(COALESCE(rank, id)) AS top FROM help LIMIT 1` // R14: one aggregate row
  )
  return rankAtTop(rows[0]?.top ?? null)
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
  return rows[0] ? toTicket(rows[0], scope) : null
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
  // THE NAME AND THE HANDLE, not just the name. Blanking `creator_name` alone
  // left `creator_id` on every staff reply, which is a STABLE PSEUDONYM: the same
  // ULID against the same person on every ticket, for as long as they work here.
  // A pseudonym is anonymity only until something links it to a name once, and
  // the reply notification used to do exactly that ("Alice Smith replied to your
  // ticket") for the very reply the client is looking at. Two halves of one
  // promise; both are kept now, and this is the half that makes the linkage
  // worthless even if a name escapes somewhere else.
  return rows.map((r) =>
    toMessage(scope.kind === "portal" && r.from_client !== 1 ? { ...r, creator_id: null, creator_name: null } : r)
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
  /** BOTH TITLES, and neither is derived from the other. 788 of the requests
   * arriving from Glide exist only in German, so "the title" is not a single
   * field with a language attached — it is two fields, one of which may be empty
   * until somebody (or the translate door) fills it in. */
  titleDe?: string
  titleEn?: string
  /** STAFF ONLY: the client this ticket is raised FOR. Ignored outright for a
   * portal caller, whose account is never taken from the body. See
   * `accountForStaffTicket`. */
  accountId?: string
  /** WHICH SYSTEM IT IS ABOUT (CHECKLIST 5.8). Proved to be a live app before it
   * is written, exactly as the client is — an unchecked id here would route a
   * request at a system that does not exist. */
  appId?: string
  /** WHO ASKED (CHECKLIST 5.9) — a contact, meaning a person's own account row
   * linked to the client this ticket belongs to. Proved to be exactly that, so
   * "raised by" can never name a stranger. */
  raisedByContactId?: string
}

/** WHICH APP IS THIS REQUEST ABOUT? Null is allowed and common (the agency's own
 * housekeeping questions are about no system at all), but a NAMED app must be a
 * live row in the caller's own team database — the same proof the client gets,
 * for the same reason: a ticket pointed at an id that does not exist is a ticket
 * whose sub-tab, whose sprint and whose stakeholder can never be resolved. */
async function appForTicket(cfg: D1Rest, guard: MemberGuard, raw: unknown): Promise<string | null> {
  const id = optionalText(raw, "App", TEXT_LIMITS.short)
  if (!id) return null
  const rows = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `SELECT id FROM apps WHERE id = ${sqlString(id)} AND deactivated_at IS NULL LIMIT 1`
  )
  if (!rows[0]) throw new GuardError(400, "invalid_input", "That app isn't one of ours any more.")
  return rows[0].id
}

/** WHO RAISED IT — a contact ON THIS ACCOUNT, and the fence is the whole point.
 *
 * A contact is a person's own `accounts` row linked to a company through
 * `account_links` (there is no contacts table — CHECKLIST 15.1 says why: Marta is
 * a contact at two companies). So "a contact of this client" is a live link, and
 * checking it is what stops a ticket naming somebody at another company as the
 * person who asked — which would put a stranger's name on a record their own
 * portal will never show them, and ours will.
 *
 * A person may also raise a ticket on their OWN account (a freelancer with no
 * parent company), so the row itself counts as its own contact. */
async function contactForTicket(
  cfg: D1Rest,
  guard: MemberGuard,
  raw: unknown,
  accountId: string | null
): Promise<string | null> {
  const id = optionalText(raw, "Raised by", TEXT_LIMITS.short)
  if (!id) return null
  if (!accountId)
    throw new GuardError(400, "invalid_input", "Name the client first — a contact belongs to one.")
  const rows = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `SELECT p.id FROM accounts p
      WHERE p.id = ? AND p.deactivated_at IS NULL
        AND (p.id = ? OR EXISTS (
              SELECT 1 FROM account_links l
               WHERE l.person_account_id = p.id AND l.account_id = ? AND l.deactivated_at IS NULL))
      LIMIT 1`,
    [id, accountId, accountId]
  )
  if (!rows[0])
    throw new GuardError(400, "invalid_input", "That person isn't a contact at this client.")
  return rows[0].id
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
  const appId = await appForTicket(cfg, guard, input.appId)
  const raisedBy = await contactForTicket(cfg, guard, input.raisedByContactId, accountId)
  const helpType = optionalText(input.helpType, "Type", TEXT_LIMITS.short) ?? null
  const now = new Date().toISOString()
  // WHERE IT STARTS, and it is a FACT about the kind of thing being asked rather
  // than a choice anybody makes (CHECKLIST 5.13, Aurora's ap2).
  //
  // An EXTRA, a REQUEST or a piece of FEEDBACK is somebody asking for more work,
  // so the person who pays for it confirms they want it before we spend a day on
  // triage. A QUESTION or an ISSUE is somebody stuck, and making them ask their
  // own colleague for permission first is the version of this rule that gets the
  // feature switched off — Aurora's note, and it is the load-bearing half.
  //
  // The agency's own tickets never wait: there is no client-side stakeholder to
  // ask, so a ticket with no account would sit in `awaiting_validation` for ever
  // waiting on somebody who does not exist.
  const status = accountId && ticketTypeWaitsForValidation(helpType) ? "awaiting_validation" : "new"
  // The reference the client will quote, and the place in the list. Both are
  // resolved BEFORE the insert so the row is complete the first time anybody
  // reads it — a ticket that exists for a moment with no number is a ticket
  // somebody screenshots with no number.
  const ref = await nextRef(cfg, guard, accountId, REF_KINDS.ticket)
  const rank = await topRank(cfg, guard)
  // WHO IS RAISING IT decides whether the wording is still the account's. A
  // ticket a STAFF member types is locked the instant it exists: the first staff
  // touch has already happened — it is us. A client's own question stays theirs
  // to correct until we read it.
  const lockedAt = scope.kind === "portal" ? null : now
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO help (id, help_type, description, screen_recording_link, source_screen, source_related_table, source_related_row_id, status, resolved, account_id, app_id, raised_by_contact_id, ref, rank, locked_at, title_de, title_en, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(id)}, ${sqlString(helpType)}, ${sqlString(description)}, ${sqlString((optionalText(input.screenRecordingLink, "Screen recording link", TEXT_LIMITS.link) ?? null))}, ${sqlString((optionalText(input.sourceScreen, "Source", TEXT_LIMITS.short) ?? null))}, ${sqlString((optionalText(input.sourceRelatedTable, "Source table", TEXT_LIMITS.short) ?? null))}, ${sqlString((optionalText(input.sourceRelatedRowId, "Source row", TEXT_LIMITS.short) ?? null))}, ${sqlString(status)}, 0, ${sqlString(accountId)}, ${sqlString(appId)}, ${sqlString(raisedBy)}, ${sqlString(ref)}, ${sqlString(rank)}, ${sqlString(lockedAt)}, ${sqlString((optionalText(input.titleDe, "German title", TEXT_LIMITS.short) ?? null))}, ${sqlString((optionalText(input.titleEn, "English title", TEXT_LIMITS.short) ?? null))}, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Ticket raised",
    description: `${actor.name} raised ${ref ? `ticket ${ref}` : "a ticket"}`,
    relatedTable: "help",
    relatedRowId: id,
  })

  return { id, accountId }
}

/** IS THE WORDING STILL THEIRS? (SCOPE ch.07: "editing and ranking lock at first
 * staff touch".)
 *
 * The account owns what it asked for right up until we have read it; after that
 * the record of the request holds still while the conversation about it moves.
 * Staff are never stopped — they are the ones the lock is FOR.
 *
 * Expressed as a thrown refusal AND, at every call site, as a predicate on the
 * UPDATE itself. Both, on purpose: the throw is what tells the person why, and
 * the predicate is what makes it true when two requests arrive together — the
 * check and the write are otherwise two steps, and a client editing at the same
 * instant a staff member opens the ticket would pass the first and win the
 * second. */
function refuseIfLocked(scope: AccountScope, row: TicketRow, what: string): void {
  if (scope.kind !== "portal") return
  if (row.locked_at)
    throw new GuardError(
      409,
      "ticket_locked",
      `We've already picked this one up, so ${what} is fixed now — add a comment and we'll pick it up from there.`
    )
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
  // A client may correct their own question while it is still theirs. Two rules,
  // not one: the ticket must be UNREAD by us (the lock), and it must be THEIRS —
  // a contact sees their whole company's requests now, and being allowed to read
  // a colleague's question is not being allowed to rewrite it.
  refuseIfLocked(scope, before, "the wording")
  if (scope.kind === "portal" && before.creator_id !== guard.userId)
    throw new GuardError(403, "not_yours", "This one was raised by a colleague — add a comment instead.")

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
  // The app and the contact are ordinary editable facts — unlike the client, both
  // can legitimately be corrected (a request filed against the wrong system, a
  // colleague who actually raised it). An absent value means "leave it alone",
  // the same rule the two titles follow: a portal form that does not offer the
  // field must not blank ours.
  const appId = (await appForTicket(cfg, guard, input.appId)) ?? before.app_id
  const raisedBy =
    (await contactForTicket(cfg, guard, input.raisedByContactId, accountAfter)) ??
    before.raised_by_contact_id

  const now = new Date().toISOString()
  // The fence rides the UPDATE as well as the read above — same sentence, same
  // statement, so neither can be removed while the other keeps the door honest.
  // Parameterised (the house shape for a fenced UPDATE, as in lib/accounts):
  // the clause carries a placeholder PER account id, so it cannot be spelled out
  // by hand and cannot drift from the one the read used.
  const fence = ticketFence(guard, scope, "all")
  // THE LOCK RIDES THE WRITE, not just the check above. `refuseIfLocked` is what
  // explains the refusal to a person; this is what makes it true when a client's
  // edit and a staff member's first touch arrive in the same instant. For a
  // portal caller the statement only matches a row that is still unlocked and
  // still theirs, so losing the race means changing nothing.
  const ownership =
    scope.kind === "portal" ? " AND locked_at IS NULL AND creator_id = ?" : ""
  const ownershipParams = scope.kind === "portal" ? [guard.userId] : []
  // …and a STAFF edit IS the first staff touch. `COALESCE` so it records when we
  // first read it, never the last time anyone typed — the lock is a moment, and
  // re-stamping it would keep moving the moment the client's rights ended.
  const lockSet = scope.kind === "portal" ? "" : ", locked_at = COALESCE(locked_at, ?)"
  const lockParams = scope.kind === "portal" ? [] : [now]
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE help SET help_type = ?, description = ?, screen_recording_link = ?, source_screen = ?,
       title_de = ?, title_en = ?, app_id = ?, raised_by_contact_id = ?,
       account_id = ?, updated_at = ?, editor_id = ?, editor_email = ?, editor_name = ?${lockSet}
     WHERE id = ?${fence.sql ? ` AND ${fence.sql}` : ""}${ownership} RETURNING id`,
    [
      optionalText(input.helpType, "Type", TEXT_LIMITS.short) ?? null,
      description,
      optionalText(input.screenRecordingLink, "Screen recording link", TEXT_LIMITS.link) ?? null,
      optionalText(input.sourceScreen, "Source", TEXT_LIMITS.short) ?? null,
      // An absent title means "leave it alone", not "blank it": the translate
      // door writes ONE of these two and must not erase the other, and a portal
      // form that only knows about its own language must not delete ours.
      optionalText(input.titleDe, "German title", TEXT_LIMITS.short) ?? before.title_de,
      optionalText(input.titleEn, "English title", TEXT_LIMITS.short) ?? before.title_en,
      appId,
      raisedBy,
      accountAfter,
      now,
      actor.id,
      actor.email,
      actor.name,
      ...lockParams,
      id,
      ...fence.params,
      ...ownershipParams,
    ]
  )
  // Lost the race with the staff member who just opened it. Same sentence the
  // pre-check gives, so the person sees one explanation either way.
  if (!changed[0])
    throw new GuardError(
      409,
      "ticket_locked",
      "We've already picked this one up, so the wording is fixed now — add a comment and we'll pick it up from there."
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
    type: "Ticket edited",
    description: `${actor.name} edited ${before.ref ?? "a ticket"}${changes ? ` — ${changes}` : ""}`,
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
  // MOVING IT IS A STAFF TOUCH, so the lock closes here too — and it rides the
  // same statement as the move, so a ticket cannot end up "in progress" while
  // its wording is still the client's to change. COALESCE: the lock records when
  // we FIRST read it, so a later move never pushes that moment forward.
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE help SET status = ?, ${resolveBlock}, locked_at = COALESCE(locked_at, ?), updated_at = ?, editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)} WHERE id = ? AND status <> ?${fence.sql ? ` AND ${fence.sql}` : ""} RETURNING id`,
    [status, now, now, id, status, ...fence.params]
  )
  if (!changed[0]) return { moved: false, accountId: before.account_id }

  await logActivity(cfg, guard.databaseId, actor, {
    type: `Ticket ${status === "resolved" ? "resolved" : status === "ready" ? "ready" : "updated"}`,
    description: `${actor.name} set ${before.ref ?? "a ticket"} to ${status.replace("_", " ")}`,
    relatedTable: "help",
    relatedRowId: id,
  })
  return { moved: true, accountId: before.account_id }
}

/** RESOLVING IS NOT A STATUS MOVE (CHECKLIST 5.6 + 5.7).
 *
 * "Resolve is refused until a resolution has been written", and resolving emails
 * the client — so it cannot be reachable as one value in a dropdown of seven. It
 * has a door of its own (`/help/resolve`) which requires the words and sends
 * them; every other way to the word `resolved` is refused here, in one sentence,
 * called by all three status doors (single, bulk-by-id, bulk-by-filter).
 *
 * A FUNCTION AND NOT A CONDITION AT EACH DOOR, for R24's reason in miniature: a
 * condition can be forgotten by the next door somebody writes, and there are
 * already three of them. */
export function refuseDirectResolve(status: HelpStatus): void {
  if (status !== "resolved") return
  throw new GuardError(
    400,
    "resolution_required",
    "A ticket is resolved by sending the answer, not by setting a status — write the resolution and send it."
  )
}

/** THE CLIENT SAYS YES (CHECKLIST 5.13). Moves a waiting ticket into the ordinary
 * queue and stamps WHEN they said so.
 *
 * R17: `status = 'awaiting_validation'` rides the UPDATE, so a second press moves
 * zero rows — no duplicate history, no second ping. Validating a ticket that was
 * never waiting is not an error and not an event: it moves nothing.
 *
 * It does NOT close the wording lock. The client is confirming they want the
 * thing, not handing it over — and until somebody here reads it, the account
 * still owns what it says (SCOPE ch.07). */
export async function validateTicket(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string
): Promise<{ moved: boolean; accountId: string | null }> {
  const before = await ticketOrThrow(cfg, guard, scope, id)
  const now = new Date().toISOString()
  const fence = ticketFence(guard, scope, "all")
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    // R17: `status IN (…)` rather than `status = …`, which is the same sentence
    // and the spelling the rest of this module uses — the states a move is
    // allowed OUT OF, named in the statement rather than checked before it.
    `UPDATE help SET status = 'new', validated_at = ?, updated_at = ?
      WHERE id = ? AND status IN ('awaiting_validation')${fence.sql ? ` AND ${fence.sql}` : ""} RETURNING id`,
    [now, now, id, ...fence.params]
  )
  if (!changed[0]) return { moved: false, accountId: before.account_id }
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Ticket validated",
    description: `${actor.name} confirmed ${before.ref ?? "a ticket"} should go ahead`,
    relatedTable: "help",
    relatedRowId: id,
  })
  return { moved: true, accountId: before.account_id }
}

/** SOMEBODY READ IT (CHECKLIST 5.11) — the one act the triage screen performs.
 *
 * Triage is the only stage of the ladder a person genuinely does and a machine
 * cannot infer: "I have read this and it is a real piece of work" is a judgement.
 * So it is a door with its own word rather than a value in a status picker, and
 * the strip's waiting list is what it is pressed from.
 *
 * R17: `status = 'new'` rides the UPDATE. A ticket already triaged, already
 * scheduled or already in progress moves zero rows — reading it a second time is
 * not an event, and this must never drag a started ticket backwards. */
export async function markTriaged(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string
): Promise<{ moved: boolean; accountId: string | null }> {
  const before = await ticketOrThrow(cfg, guard, scope, id)
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    // The lock closes here: reading a request IS the first staff touch, which is
    // the sentence SCOPE ch.07 defines the lock by.
    // R17, same spelling: reading a request that has already been read, or one
    // somebody has since started, moves zero rows — it must never drag a started
    // ticket backwards.
    `UPDATE help SET status = 'triaged', locked_at = COALESCE(locked_at, ?), updated_at = ?,
       editor_id = ?, editor_email = ?, editor_name = ?
     WHERE id = ? AND status IN ('new') RETURNING id`,
    [now, now, actor.id, actor.email, actor.name, id]
  )
  if (!changed[0]) return { moved: false, accountId: before.account_id }
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Ticket triaged",
    description: `${actor.name} read ${before.ref ?? "a ticket"}`,
    relatedTable: "help",
    relatedRowId: id,
  })
  return { moved: true, accountId: before.account_id }
}

/** DRAG-RANK — put a ticket between two others (SCOPE ch.07: the only priority
 * signal there is).
 *
 * The caller names its NEIGHBOURS, not a position. A position would be a number
 * computed from a list the caller loaded some seconds ago, and by the time it
 * arrives the list has moved; two neighbours are a statement about the order that
 * is still true whatever else happened, and they are what a drag actually knows.
 *
 * Both neighbour ids are read through the FENCE, so a client cannot pin their
 * ticket next to one they cannot see — which would be a (very small) oracle for
 * whether an id exists, and a way to learn another company's ordering. */
export async function setTicketRank(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  afterId: string | null,
  beforeId: string | null
): Promise<{ moved: boolean; accountId: string | null }> {
  const row = await ticketOrThrow(cfg, guard, scope, id)
  // Ranking locks with the wording, and for the same reason: once we are working
  // on it, the order is ours to manage.
  refuseIfLocked(scope, row, "the order")

  // `afterId` sits ABOVE in the list (a higher rank) and `beforeId` BELOW, because
  // the list reads rank DESC — so the new rank goes between beforeId's and
  // afterId's, low bound first.
  const neighbour = async (nid: string | null): Promise<string | null> => {
    if (!nid) return null
    const found = await ticketOrThrow(cfg, guard, scope, nid)
    return found.rank ?? found.id
  }
  const rank = rankBetween(await neighbour(beforeId), await neighbour(afterId))

  const fence = ticketFence(guard, scope, "all")
  const ownership = scope.kind === "portal" ? " AND locked_at IS NULL" : ""
  // R17: `rank <> ?` — dropping a ticket back exactly where it was moves zero
  // rows, so it writes no history and pings nothing. A drag that ends where it
  // started is not an event.
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE help SET rank = ? WHERE id = ? AND COALESCE(rank, id) <> ?${
      fence.sql ? ` AND ${fence.sql}` : ""
    }${ownership} RETURNING id`,
    [rank, id, rank, ...fence.params]
  )
  if (!changed[0]) return { moved: false, accountId: row.account_id }

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Ticket reordered",
    description: `${actor.name} moved ${row.ref ?? "a ticket"} in the list`,
    relatedTable: "help",
    relatedRowId: id,
  })
  return { moved: true, accountId: row.account_id }
}

/** ARCHIVE / UNARCHIVE — available from any state (SCOPE ch.07). The base's
 * deactivate-never-delete under the word the glossary already uses: the row, its
 * conversation and its history all survive; it simply stops appearing in the
 * everyday list.
 *
 * R17: the current-state predicate rides the UPDATE (`archived_at IS NULL` /
 * `IS NOT NULL`), so a double-clicked Archive moves zero rows the second time and
 * writes no second sentence into the record's history. */
export async function setTicketArchived(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  archived: boolean
): Promise<{ moved: boolean; accountId: string | null }> {
  const row = await ticketOrThrow(cfg, guard, scope, id)
  const now = new Date().toISOString()
  const fence = ticketFence(guard, scope, "all")
  const set = archived
    ? `archived_at = ?, archiver_id = ${sqlString(actor.id)}, archiver_email = ${sqlString(actor.email)}, archiver_name = ${sqlString(actor.name)}`
    : `archived_at = NULL, archiver_id = NULL, archiver_email = NULL, archiver_name = NULL`
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE help SET ${set} WHERE id = ? AND archived_at IS ${archived ? "" : "NOT "}NULL${
      fence.sql ? ` AND ${fence.sql}` : ""
    } RETURNING id`,
    archived ? [now, id, ...fence.params] : [id, ...fence.params]
  )
  if (!changed[0]) return { moved: false, accountId: row.account_id }

  await logActivity(cfg, guard.databaseId, actor, {
    type: archived ? "Ticket archived" : "Ticket restored",
    description: `${actor.name} ${archived ? "archived" : "restored"} ${row.ref ?? "a ticket"}`,
    relatedTable: "help",
    relatedRowId: id,
  })
  return { moved: true, accountId: row.account_id }
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
  // The same facet set the Tickets screen sends (status / type). The R17 predicate
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
    // The lock closes on every ticket the set touches, exactly as it does on a
    // single move — a bulk is not a quieter kind of staff touch.
    `UPDATE help SET status = ?, ${resolveBlock}, locked_at = COALESCE(locked_at, ?), updated_at = ?, editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)} WHERE status <> ?${extraSql} RETURNING id, account_id`,
    [toStatus, now, now, toStatus, ...extraParams]
  )
  const changed = changedRows.length
  if (changed > 0)
    // ONE activity row for the set — history says what happened, not per-row noise.
    await logActivity(cfg, guard.databaseId, actor, {
      type: `Tickets ${toStatus === "resolved" ? "resolved" : "updated"} (bulk)`,
      description: `${actor.name} set ${changed} ticket${changed === 1 ? "" : "s"}${filter.helpType ? ` of type "${filter.helpType}"` : ""}${filter.status ? ` from ${filter.status.replace("_", " ")}` : ""} to ${toStatus.replace("_", " ")}`,
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
 * notify happens in the route). `isAgent` marks the AI-drafted reply.
 *
 * Returns the new reply's id AND THE RAISER'S, which is not tidiness: the route
 * has to email whoever asked the question, and since a client login is no longer
 * SENT the raiser's id (see toTicket) it cannot read one off the ticket it just
 * fetched. So the notify path takes it from the write path, which had already
 * read the row and was throwing the answer away. The redaction is about what
 * leaves the building; a staff raiser still gets told a client replied. */
export async function addReply(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  ticketId: string,
  body: string,
  taggedUserIds: string[],
  isAgent: boolean
): Promise<{ id: string; raiserId: string }> {
  const clean = body.trim()
  if (!clean) throw new GuardError(400, "invalid_input", "A reply can't be empty.")
  const ticket = await ticketOrThrow(cfg, guard, scope, ticketId)

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

  return { id, raiserId: ticket.creator_id }
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
