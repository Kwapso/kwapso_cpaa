// THE GUARD CORRIDOR — session → person → the ONE account they are standing in
// (SCOPE ch.06, "Access and the fence"). Every account-scoped query is built
// from THIS stamp; none is ever built from a request parameter. A door that
// reads `?accountId=` and trusts it is the whole leak, so the shape here is
// deliberate: you cannot get a WHERE clause out of this file without first
// having resolved a caller.
//
// Two caller kinds, and only two:
//   • STAFF   — a team member with no portal row: the agency side, fenced by the
//               permission matrix alone (they are meant to see every account).
//   • PORTAL  — a client-side person: pinned to ONE account's world at a time,
//               no matter which door they knock on, no matter what their role
//               says.
//
// ONE AT A TIME, deliberately (owner decision, 10 Aug 2026). A person who acts
// for two of your clients belongs to both, but sees one at a time and switches
// between them — the same bargain the team switcher makes: you own the data,
// it simply isn't fetched while you're standing somewhere else. Mixing two
// clients' work into one screen is confusing at best and a disclosure at worst.
//
// WHICH WORLD IS THEIRS. A person reaches a company two ways, and both are the
// same sentence: "you belong to this company". Either their own row hangs UNDER
// it (`parent_account_id` — the contacts a company's record carries), or they
// are LINKED to it (the many-to-many, which is the only way one person belongs
// to two). From the company they are standing in, the fence then reaches DOWN
// through everything nested beneath — a holding company's stakeholder sees its
// businesses. It never climbs past the company itself: a person at a subsidiary
// does not inherit the parent group.
//
// FAIL CLOSED, and note WHICH way: portal-ness is decided by the PRESENCE of a
// portal_users row, never by its absence. A revoked row still makes you portal —
// standing nowhere, seeing nothing — rather than silently promoting you to staff
// the moment access is withdrawn. "Deactivate, never delete" is what makes that
// safe: the row that proves you are a client outlives your login.

import { PORTAL_ACTIVITY_FENCE } from "../rules/registry"
import { d1Query, sqlString, type D1Rest } from "./d1-rest"
import { GuardError, type MemberGuard } from "./gating"
import { PORTAL_ROOTS_CAP } from "./limits"

/** The caller's stamp. `accountIds` is the closed set a portal caller may touch
 * RIGHT NOW: the company they are standing in, everything nested under it, and
 * their own person row. `roots` is everywhere they could stand — the switcher's
 * list, never a fence in itself. */
export type AccountScope =
  | { kind: "staff" }
  | {
      kind: "portal"
      /** the account row that IS this person (null only if their grant is gone) */
      personAccountId: string | null
      /** null = the whole account's world; a value narrows them to named Apps
       * (SCOPE ch.03 "per-person restriction"). */
      appRestriction: string | null
      /** THE SAME FACT, PARSED — the app ids this person may see, or null for
       * "all of their company's".
       *
       * ENFORCED SINCE 19 Aug 2026, and the note it replaces is the reason this
       * field exists separately. It read: "Carried, not yet enforced — the Apps
       * module lands later and is the only thing that can honour it." The Apps
       * module landed; the sentence did not move; and the setting stayed on the
       * grant screen and in an MCP tool, accepting a value, storing it, showing
       * it back — and changing nothing. A control that lies is worse than a
       * missing one, because somebody sets it and believes a person is fenced.
       *
       * An EMPTY array is a real answer and means "no apps", not "all apps" —
       * fail-closed, the same shape `accountIds: []` already has. */
      appIds: string[] | null
      /** every company this person may stand in, id-ordered so the fallback pick
       * is the same on every request (a switcher that moved you on refresh would
       * be a bug you could not reproduce). */
      roots: string[]
      /** the one they are standing in; null only when they have no world at all */
      currentAccountId: string | null
      accountIds: string[]
    }

/** R14 — the reach walk is bounded. A pathological hierarchy must not turn one
 * permission check into an unbounded read; past this, the account set is wrong
 * in the SAFE direction (it stops early, granting less). */
const SCOPE_HARD_CAP = 500

/** The fence's ids, as a LITERAL id list rather than a bound-parameter list.
 *
 * D1 REFUSES A STATEMENT CARRYING MORE THAN 100 BOUND PARAMETERS, and the fence
 * was the one place in the base that could hand it more. `accountScopeClause`
 * bound one parameter per account in reach (up to SCOPE_HARD_CAP, 500) and
 * `accountActivityClause` bound the same set THREE times in one statement — so a
 * client login standing at a company with 34 businesses nested under it stopped
 * being able to read its own activity feed, and one with 101 stopped being able
 * to read anything at all. Not a slow path: a 500 on every fenced door, and the
 * local-SQLite harness (limit 999) could never see it. Exactly the failure
 * `workers/content/test/d1-parameter-cap.test.ts` was written for, in a file that
 * suite did not walk.
 *
 * Interpolation is the same answer that suite prescribes for the same shape:
 * these ids are SERVER-OWNED — they come out of the team's own `accounts`,
 * `account_links` and `portal_users` rows via `accountScope()`, never off a
 * request — and they go through `sqlString` like every other server-owned value
 * the script door carries (CONVENTIONS). Values off a request stay bound.
 *
 * An EMPTY list is never rendered: both callers answer `0 = 1` before reaching
 * here, because `IN ()` is not valid SQL. */
/** Ids, quoted and joined for an IN list. Exported so a door that has to PROVE
 * a set of ids exists can build the same list the fence does. */
export function idList(accountIds: string[]): string {
  return accountIds.map((id) => sqlString(id)).join(", ")
}

/** The companies this person belongs to: the one their own row hangs under, plus
 * every one they're actively linked to. Two `?` for the same person id
 * (positional binding — the D1 REST door and node:sqlite both take an ordered
 * array, so no named parameters here).
 *
 * BOUNDED (R14, PORTAL_ROOTS_CAP). This was the one read in the guard corridor
 * with no ceiling on it: anybody may be linked to any number of companies, and
 * every root then became a bound parameter in the switcher's own lookup. `ORDER
 * BY id` already made the set stable across requests, which is what makes a LIMIT
 * safe to add — the same fifty every time, not a different fifty per refresh. */
const ROOTS_SQL = `
SELECT parent_account_id AS id FROM accounts
 WHERE id = ? AND parent_account_id IS NOT NULL
UNION
SELECT l.account_id FROM account_links l
 WHERE l.person_account_id = ? AND l.deactivated_at IS NULL
ORDER BY id LIMIT ${PORTAL_ROOTS_CAP}`

/** From the company they're standing in, everything nested beneath it. */
const REACH_SQL = `
WITH RECURSIVE reach(id) AS (
  SELECT ?
  UNION
  SELECT a.id FROM accounts a JOIN reach r ON a.parent_account_id = r.id
)
SELECT id FROM reach LIMIT ${SCOPE_HARD_CAP}`

/** THE FENCE'S OWN INPUTS — everything the three statements above read to decide
 * which rows a client login may see. Declared HERE, beside them, so the two
 * cannot drift: change the SQL and this is the line you change with it.
 *
 * `[]` means the WHOLE ROW is an input; a list names the ONLY columns that are.
 *
 * WHO READS THIS. `shared/workers/tool-gates.ts` — to decide which machine-
 * surface writes must stop for a confirm panel. A write that changes one of
 * these changes WHO CAN SEE WHOSE, which is the same order of decision as a
 * permission grant, and the model reaches it while reading team text an attacker
 * can author. Deriving the confirm set from the fence's inputs is what stops it
 * being a hand-kept list of module names that forgets the next door: a link and
 * a re-parent both widen a client's world without touching a permission at all,
 * and both used to run silently. */
export const FENCE_INPUTS: Record<string, string[]> = {
  // The row that makes a caller PORTAL at all, the account they are pinned to,
  // the restriction they carry, and whether their login is live.
  portal_users: [],
  // Its very existence is a "you belong to this company" (ROOTS_SQL), and
  // deactivating it withdraws one — so the whole row is an input.
  account_links: [],
  // ONE column. The fence walks PARENTS and nothing else off an account row, so
  // editing a name, an address or a status is not a fence write and must not
  // spend a confirm panel on one.
  accounts: ["parent_account_id"],
}

/** COLUMNS THAT DECIDE **WHICH HUMAN** A GRANT LANDS ON — the third category,
 * and the one both earlier rounds of this bug were missing in their own way.
 *
 * `FENCE_INPUTS` says what the fence READS to work out where a caller stands.
 * `FENCED_ROW_OWNERS` says which column decides whose side of the fence a row
 * sits on. Neither can see THIS one, because the fence never reads it at all:
 * `accounts.email` is what `userIdForPerson` (workers/tenancy/src/routes/accounts.ts)
 * resolves a portal grant's PERSON from — account row → its email → the `users`
 * row with that email → the `user_id` the `portal_users` row is written for.
 *
 * So the sentence the three make together is: FENCE_INPUTS decides WHERE you
 * stand, FENCED_ROW_OWNERS decides WHICH ROWS stand with you, and this decides
 * WHO YOU ARE. Re-point the email and the next grant — approved in good faith,
 * on an account whose name never changed — hands the login to somebody else.
 * Anyone can put a `users` row behind an address of their choosing: signing in
 * once at the open front door is the whole of it.
 *
 * WHY IT IS NOT JUST A LINE IN FENCE_INPUTS. That list is machine-checked to
 * mean exactly "columns the corridor reads" — `fence-confirm.test.ts` walks the
 * SQL and fails on a declared column the fence no longer reads. `email` is not
 * one and never will be, so filing it there would have bought a confirm panel by
 * making a true list untrue, and the next reader would have deleted it as stale.
 *
 * WHO READS THIS. `shared/workers/tool-gates.ts`, beside the other two.
 * `workers/tenancy/test/grant-identity.test.ts` proves the door really resolves
 * a person this way, so the day it stops, the line goes red instead of quietly
 * guarding nothing. */
export const FENCE_IDENTITY_INPUTS: Record<string, string[]> = {
  // The address a portal grant resolves a human being from. Editing it is not
  // editing a contact detail; it is choosing who the next login belongs to.
  accounts: ["email"],
}

/** TABLES THE FENCE IS APPLIED **TO** — the other half of the sentence above.
 *
 * `FENCE_INPUTS` names what `accountScope()` READS to work out where a caller
 * stands. This names the rows the resulting clause is then ANDed into: the
 * column on each table that says which account owns the row, and therefore which
 * client login may read it. A ticket is the first and, today, the only one
 * (`ticketFence` → `accountScopeClause(scope, "account_id")`).
 *
 * Both change who can see whose; they just change it from opposite ends. Writing
 * `accounts.parent_account_id` MOVES THE FENCE. Writing `help.account_id` MOVES
 * A ROW ACROSS IT — and a ticket carries its whole reply history with it, so
 * naming a client on an agency ticket publishes that conversation into their
 * portal in one call.
 *
 * WHO READS THIS. `shared/workers/tool-gates.ts`, beside FENCE_INPUTS, to
 * decide which machine-surface writes must stop for a confirm panel. It is
 * declared HERE rather than there for the same reason FENCE_INPUTS is: the list
 * has to sit next to the clause it describes, or the next module to grow a
 * fenced column will be added to the fence and forgotten by the panel — which is
 * exactly what happened to `help`. `update_help_ticket` exposed `accountId`, the
 * door set it on any ticket that had none, and no panel ever opened, because the
 * derivation only knew about tables the fence READS. */
export const FENCED_ROW_OWNERS: Record<string, string> = {
  // Set once and never moved (workers/content/src/lib/help.ts), so the write
  // this guards is the ONE that takes an agency ticket and hands it to a client.
  help: "account_id",
}

/** Resolve the caller's account set — the ONE place it is decided. Costs one
 * read for staff (the portal_users miss) and three for a portal caller. */
export async function accountScope(cfg: D1Rest, guard: MemberGuard): Promise<AccountScope> {
  // Active grant first: a person re-granted access after a revoke has both rows,
  // and the live one is the one that speaks.
  const rows = await d1Query<{
    account_id: string
    app_restriction: string | null
    current_account_id: string | null
    deactivated_at: string | null
  }>(
    cfg,
    guard.databaseId,
    `SELECT account_id, app_restriction, current_account_id, deactivated_at FROM portal_users
      WHERE user_id = ? ORDER BY (deactivated_at IS NULL) DESC LIMIT 1`,
    [guard.userId]
  )
  const row = rows[0]
  if (!row) return { kind: "staff" }
  if (row.deactivated_at != null)
    return {
      kind: "portal",
      personAccountId: row.account_id,
      appRestriction: null,
      appIds: null,
      roots: [],
      currentAccountId: null,
      accountIds: [],
    }

  const found = await d1Query<{ id: string }>(cfg, guard.databaseId, ROOTS_SQL, [
    row.account_id,
    row.account_id,
  ])
  // A freelancer signs in as their own account: no parent, no link, and their
  // own row IS the world. Without this they would resolve to the empty set and
  // see nothing — a fence so tight it locks out the person it protects.
  const roots = found.length ? found.map((r) => r.id) : [row.account_id]

  // Their stored choice, but only if it is still one of their own — a company
  // they were unlinked from must not keep working because the pointer is stale.
  const current = row.current_account_id && roots.includes(row.current_account_id)
    ? row.current_account_id
    : roots[0]

  const reach = await d1Query<{ id: string }>(cfg, guard.databaseId, REACH_SQL, [current])
  const ids = new Set(reach.map((r) => r.id))
  ids.add(row.account_id) // their own person row travels with them

  return {
    kind: "portal",
    personAccountId: row.account_id,
    appRestriction: row.app_restriction,
    appIds: parseAppRestriction(row.app_restriction),
    roots,
    currentAccountId: current,
    accountIds: [...ids],
  }
}

/** The fence, as SQL: AND this into the WHERE of every read AND every write that
 * touches an account-owned row. Staff → empty (no clause). Portal → an IN list
 * over the pinned set; an EMPTY set becomes `0 = 1`, because `IN ()` is not
 * valid SQL and a clause that silently vanished would open the door it exists to
 * shut. `column` is always a code literal (`accounts.id`, `a.account_id`) —
 * never a request value. */
export function accountScopeClause(
  scope: AccountScope,
  column: string
): { sql: string; params: string[] } {
  if (scope.kind === "staff") return { sql: "", params: [] }
  if (scope.accountIds.length === 0) return { sql: "0 = 1", params: [] }
  // The ids are interpolated, not bound — see idList. `params` stays in the
  // return shape (always empty now) so every call site keeps spreading it and
  // nothing has to know which half of the clause carries values.
  return { sql: `${column} IN (${idList(scope.accountIds)})`, params: [] }
}

/** THE RESTRICTION, AS IDS. Stored as a comma-separated list on one TEXT column
 * — one column rather than a join table because it is at most a handful of ids
 * per login and it is read on every single portal request; a second table would
 * be a second round trip on the hot path to answer a question this size.
 *
 * A blank or absent value is null, which means "everything their company has".
 * Anything else is split, trimmed and emptied of blanks — so a trailing comma or
 * a stray space cannot silently produce an id that matches nothing and fence a
 * person out of their own world. */
export function parseAppRestriction(raw: string | null | undefined): string[] | null {
  if (raw == null) return null
  const ids = raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
  return ids.length ? ids : null
}

/** THE APP FENCE, beside the account fence and never instead of it.
 *
 * `column` is always a code literal naming an app id column. Returns an empty
 * clause for staff and for a client with no restriction — both of whom see their
 * whole world — and `0 = 1` can never happen here, because an empty restriction
 * parses to null rather than to an empty list (see `parseAppRestriction`).
 *
 * IT IS AN AND, NOT AN OR. A restricted client is still inside their account
 * fence: this narrows what they see WITHIN their company, and a call site that
 * used it instead of `accountScopeClause` would hand one company's app to
 * another company's contact who happened to be restricted to the same id. */
export function appScopeClause(
  scope: AccountScope,
  column: string
): { sql: string; params: string[] } {
  if (scope.kind === "staff" || !scope.appIds) return { sql: "", params: [] }
  return { sql: `${column} IN (${idList(scope.appIds)})`, params: [] }
}

/** Is this account inside the caller's fence? */
function inAccountScope(scope: AccountScope, accountId: string | null | undefined): boolean {
  if (scope.kind === "staff") return true
  return !!accountId && scope.accountIds.includes(accountId)
}

/** The pre-write check for an account id that arrives in a BODY (a parent to
 * attach to, an account to link into, an account to grant a login on).
 *
 * 404, deliberately, not 403: "you may not touch account 01J…" confirms that
 * account 01J… exists. Outside the fence, a real row and a made-up id must be
 * indistinguishable — the answer is the same sentence either way. */
export function requireAccountInScope(
  scope: AccountScope,
  accountId: string | null | undefined,
  what = "That account"
): void {
  if (!inAccountScope(scope, accountId))
    throw new GuardError(404, "not_found", `${what} doesn't exist.`)
}

/** Standing somewhere else is a MOVE, not a widening: the target must already be
 * one of their own companies. Same 404 as everything else outside the fence — a
 * switcher must not become an oracle for which account ids exist. */
export function requireStandableRoot(scope: AccountScope, accountId: string): void {
  if (scope.kind === "staff")
    throw new GuardError(400, "not_portal", "Only a client login stands in one account.")
  if (!scope.roots.includes(accountId))
    throw new GuardError(404, "not_found", "That account doesn't exist.")
}

/** The account-owned tables: rows whose visibility is decided by the fence, not
 * by a module right. Named once so a reader of the ACTIVITY feed and a reader of
 * the accounts list can never disagree about which rows are fenced.
 *
 * NOT the list to fence a feed BY. It answers "which rows does an account own?",
 * which is a fact about the accounts module — and a client login can reach rows
 * this list has never heard of (a support ticket, for one). Deciding a fence
 * from it is how the same leak happened twice; `PORTAL_ACTIVITY_FENCE` in the
 * rules registry enumerates by what a CLIENT CAN REACH, and is the list a new
 * table has to appear in. */
export const ACCOUNT_OWNED_TABLES = ["accounts", "account_links", "portal_users"] as const

/** What a LIVE LISTENER carries so a change ping can be fenced without another
 * database read: `null` = staff (the agency side hears its whole team), a set =
 * a client login, pinned to the world they are standing in. Small and plain on
 * purpose — it is serialized onto a hibernating WebSocket. */
export type ScopeStamp = { accountIds: string[] } | null

/** The caller's fence, reduced to what a socket needs to carry. */
export function scopeStamp(scope: AccountScope): ScopeStamp {
  return scope.kind === "staff" ? null : { accountIds: scope.accountIds }
}

/** Resources a CLIENT LOGIN may hear about that are NOT account-owned: a ticket
 * and its replies. The row id on those pings is a TICKET id, which says nothing
 * about whose ticket it is — so the publisher names the account instead
 * (`ChangeEvent.scope`), and this is the list of resources allowed to use it.
 *
 * This is the "one line at a time" the note below promised. Three lines now, and
 * each was added the same way: the portal has a screen that reads it, the owner
 * has ruled the client may see it, and a screen that cannot hear its own row
 * change is a screen that lies until you reload it. A resource NOT named here is
 * silence, whatever it carries.
 *
 * `process_comments` is the third. A client comments on their own process map
 * and a staff member answers — that is a conversation, and a conversation whose
 * other half only appears on refresh is not one. The ping carries a PROCESS id,
 * which says nothing about whose map it is, so the publisher names the account
 * (routes/processes.ts) and this line is what lets the fence read it. */
/* Six now, and the last three arrived together with the work engine.
 *
 * `todos` is the plainest: a to-do is aimed at the client, sits in their portal
 * and is completed by them, so a colleague completing one has to leave their
 * screen without a reload.
 *
 * `stories` and `sprints` are the interesting pair, because a client cannot see
 * either row. What they see is a COUNT of the work on their own request and a
 * named block with dates — and both are computed from rows that move without
 * them. A ping that says "a story on your account changed" carries a story id,
 * which tells a client nothing (it is not a row they can ask for: every story
 * door refuses a portal caller), and it is what turns "3 pieces of work, 1 done"
 * into "3 pieces of work, 2 done" while they are looking at it. Without these
 * lines the counts are correct on load and wrong for the rest of the session,
 * which is the exact failure this list exists to prevent. */
/* Seven, and the seventh is `deliverables`, which arrived the day the handover
 * shelf was opened to the client (18 Aug 2026, per-row: "only once we mark it as
 * visible").
 *
 * It is on this list for the reason `stories` and `sprints` are, not the reason
 * `todos` is. The ping carries an APP id — the row the agency's own listener
 * holds — and an app id tells a client nothing and identifies no owner, so there
 * is nothing on the event for `mayHearChange` to fence against. The publisher
 * therefore names the account (routes/deliverables.ts) and this line is what
 * lets the fence read it.
 *
 * WHAT A CLIENT LEARNS FROM HEARING ONE: that something about an app on their own
 * account changed. They already know their apps. They are NOT told which
 * deliverable, whether it was shared or hidden, or whether one exists at all —
 * the ping carries no row data, and the re-read it triggers goes back through
 * both fences. A deliverable created and never shared moves this ping and
 * changes nothing the client can see, which is a wasted fetch and not a
 * disclosure. */
const SCOPE_STAMPED_RESOURCES = [
  "help",
  "help_threads",
  "process_comments",
  "todos",
  "stories",
  "sprints",
  "deliverables",
] as const

/** The fence, for a LIVE CHANGE PING (`{resource, id, scope}` on a team's channel).
 *
 * A ping carries no row data, but it does carry a ROW ID — and row ids are how
 * the activity-feed leak was reachable in the first place ("row ids are not
 * secret: the live channel broadcasts them", above). So the channel gate can't
 * stop at "are you a member of this team": a client login is a member, and it
 * was hearing every account in the agency change, by id, in real time.
 *
 * Staff hear everything. A client login hears its OWN WORLD and nothing else,
 * and there are exactly two shapes of that:
 *   • an ACCOUNT-OWNED row, whose id IS an account inside their fence;
 *   • a SCOPE-STAMPED row (a ticket, a reply), whose publisher NAMED the account
 *     it belongs to, and that account is inside their fence.
 * Everything else — the agency's members, roles, invites, articles — is silence,
 * because a client has no screen in this app that reads any of it. Fail-closed
 * in both directions: a ping that names nothing is heard by nobody fenced. */
export function mayHearChange(
  stamp: ScopeStamp,
  event: { resource?: string; id?: string; scope?: string }
): boolean {
  if (!stamp) return true
  if (ACCOUNT_OWNED_TABLES.includes(event.resource as (typeof ACCOUNT_OWNED_TABLES)[number]))
    // Every account-owned publish carries the ACCOUNT the row hangs off (a contact
    // and a login are only ever read on their account's detail). No id = nothing to
    // check it against = not theirs to hear.
    return !!event.id && stamp.accountIds.includes(event.id)
  if (SCOPE_STAMPED_RESOURCES.includes(event.resource as (typeof SCOPE_STAMPED_RESOURCES)[number]))
    return !!event.scope && stamp.accountIds.includes(event.scope)
  return false
}

/** The fence, for a feed that stores a TABLE NAME and a ROW ID rather than an
 * account id — the activity feed being the one that matters.
 *
 * This is the hole the first security sweep found, and it is worth naming
 * precisely: the fence had been applied door by door to the ACCOUNT doors, and
 * the activity feed is a different door. It gates on "may you read the accounts
 * module?" — which a client login must hold to use their portal at all — and
 * then reads history by (table, id) with no fence, so one out-of-fence id read
 * back another client's history. Row ids are not secret: the live channel
 * broadcasts them.
 *
 * `related_row_id` points at a different table each time, so the clause resolves
 * each one to the account it hangs off:
 *   • accounts       → the row IS the account
 *   • account_links  → the account the link is on
 *   • portal_users   → the account the login is on
 * Staff get no clause. A portal caller sees their own world's history and
 * NOTHING else — not even the existence of a row outside it. */
export function accountActivityClause(scope: AccountScope): { sql: string; params: string[] } {
  if (scope.kind === "staff") return { sql: "", params: [] }
  if (scope.accountIds.length === 0) return { sql: "0 = 1", params: [] }
  // THREE copies of the same set in ONE statement — which is why this clause hit
  // D1's parameter ceiling at 34 accounts rather than 101, and why the ids are
  // interpolated (idList) instead of bound.
  const ids = idList(scope.accountIds)
  return {
    sql:
      `((related_table = 'accounts' AND related_row_id IN (${ids}))` +
      ` OR (related_table = 'account_links' AND related_row_id IN (SELECT id FROM account_links WHERE account_id IN (${ids})))` +
      ` OR (related_table = 'portal_users' AND related_row_id IN (SELECT id FROM portal_users WHERE account_id IN (${ids}))))`,
    params: [],
  }
}

/** The same fence for ONE NAMED TABLE — the (table, id) read of a single record's
 * history, which is the shape both leaks took.
 *
 * The table decides, and the decision is DATA (`PORTAL_ACTIVITY_FENCE`): the
 * account-owned tables get the clause above, everything else gets `0 = 1` —
 * silence, in the same fail-closed direction as `mayHearChange`. An UNKNOWN
 * table lands there too, so a module added to the feed before anyone has decided
 * what a client may read of it is closed, not open, while the build goes red for
 * the missing line. Staff, as everywhere, get no clause at all. */
export function portalActivityClause(
  scope: AccountScope,
  table: string
): { sql: string; params: string[] } {
  if (scope.kind === "staff") return { sql: "", params: [] }
  return PORTAL_ACTIVITY_FENCE[table]?.fence === "account"
    ? accountActivityClause(scope)
    : { sql: "0 = 1", params: [] }
}

/** Refuse a CLIENT LOGIN outright, for the agency's own material.
 *
 * The account fence answers "which of these rows are theirs". Some doors have no
 * such answer, because nothing behind them is any client's: the agency's how-to
 * articles, its dropdown vocabulary, its own team record. The client portal's
 * gateway already refuses those doors by not naming them — but the AGENCY origin
 * serves them to the same person, and a client login is an ordinary team member
 * by construction, so the module right alone lets them through.
 *
 * A 403 that says which door they want, rather than a 404 — they are a person we
 * know, signed in correctly, on the wrong front door.
 *
 * Hands BACK the scope it resolved (always staff, or it threw), so a door that
 * has both decisions to make — refuse a client, then fence what staff may read —
 * pays for the guard corridor once instead of twice. Ignoring the return value
 * is the ordinary case and stays correct. */
export async function refusePortalCaller(cfg: D1Rest, guard: MemberGuard): Promise<AccountScope> {
  const scope = await accountScope(cfg, guard)
  if (scope.kind === "portal")
    throw new GuardError(
      403,
      "client_login",
      "This sign-in is a client login, your company's work is on the client portal."
    )
  return scope
}
