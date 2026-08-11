// THE CUSTOMER SPINE — accounts, the links between them, and portal logins.
//
// This is the ONLY file in the worker that writes SQL against `accounts`,
// `account_links` or `portal_users`. That is not tidiness, it is the security
// boundary: every exported function here takes an `AccountScope` and ANDs its
// clause into the statement, so "did this query carry the caller's stamp?" is a
// question with one place to look — and a machine-checkable one
// (test/account-leak.test.ts asserts every exported reader/writer here takes the
// stamp, and then sends a burglar at every door that uses them).
//
// The fence rides the WHERE, it is never a pre-check. `SELECT … then UPDATE` is
// two steps a concurrent write can slip between; `UPDATE … WHERE id = ? AND
// <scope>` is one statement D1 runs atomically, and zero rows changed is the
// refusal. Same shape as the last-admin guard (CONCURRENCY rule 1).

import { logActivity, describeChanges, type Actor } from "@shared/workers/activity"
import {
  accountScopeClause,
  requireAccountInScope,
  requireStandableRoot,
  type AccountScope,
} from "@shared/workers/account-scope"
import { d1Query, likeLiteral, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { EXPORT_HARD_CAP, LIST_HARD_CAP, MAX_ACCOUNT_DEPTH } from "@shared/workers/limits"
import { decodeCursor, keysetAfter, PAGE_SIZE, toPage, type Page } from "@shared/workers/paging"
import type { Account, AccountDetail, AccountLink, PortalUser } from "@shared/types"
import { GuardError, type MemberGuard } from "./permissions"

type AccountRow = {
  id: string
  account_type: string
  parent_account_id: string | null
  name: string
  email: string | null
  phone: string | null
  address: string | null
  code: string | null
  currency: string | null
  locale: string | null
  timezone: string | null
  commercials_visible: number
  status: string
  deactivated_at: string | null
  created_at: string
  creator_name: string | null
  updated_at: string | null
  editor_name: string | null
}

/** The audit names ride along on every read: every record's Overview tab shows
 * the same block (who made it, who touched it last), and the list's keyset pages
 * on created_at, so it is selected once here rather than twice at the call site. */
const ACCOUNT_COLUMNS = `id, account_type, parent_account_id, name, email, phone, address, code,
  currency, locale, timezone, commercials_visible, status, deactivated_at,
  created_at, creator_name, updated_at, editor_name`

/** WHAT AN ACCOUNT ROW SAYS, AND TO WHOM.
 *
 * Most of this row is the client's own information, which is exactly why the
 * portal opens the door: their name, address, reference, the people in it. Four
 * fields on it are not theirs at all — they are the AGENCY'S RECORD ABOUT THEM:
 *
 *   • `status` — the commercial lifecycle. "prospect", "client", "past client"
 *     is our view of the relationship, and a client reading "prospect" about
 *     themselves has learned something we never chose to tell them.
 *   • `commercialsVisible` — our own switch governing what money they may see.
 *     A setting about somebody is not a setting for them to read.
 *   • `createdByName` / `editedByName` — which staff member opened the record and
 *     which one last touched it. The same promise the ticket row and the reply
 *     thread keep (SCOPE ch.06); there is no reason it changes table.
 *
 * THE REPO ALREADY SAYS THIS, ABOUT THE HISTORY OF THESE VERY FIELDS. The portal
 * has no activity feed, and shared/rules/registry.ts gives the reason: "an
 * account's history names the staff who edited the record and shows the agency's
 * own before/after values (status moves, commercial flags) — none of which is the
 * client's to read." The history was closed and the CURRENT values rode out on
 * the row underneath it, which is the whole finding: the portal drew none of
 * this, and the server sent all of it.
 *
 * The projection lives HERE rather than at the three call sites, because a
 * redaction you have to remember is one somebody forgets — the same argument
 * `ticketFence` makes for having no default. Every reader in this file goes
 * through this function, so the wire cannot disagree with it.
 *
 * The one thing that must NOT come through here is a WRITE's before-image: an
 * edit compares against what is stored, not against what the caller may see.
 * `accountRowOrThrow` below is the raw read updateAccount uses for that. */
function toAccount(r: AccountRow, scope: AccountScope): Account {
  const ours = scope.kind === "portal"
  return {
    id: r.id,
    accountType: r.account_type === "individual" ? "individual" : "entity",
    parentAccountId: r.parent_account_id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    address: r.address,
    code: r.code,
    currency: r.currency,
    locale: r.locale,
    timezone: r.timezone,
    commercialsVisible: ours ? null : r.commercials_visible === 1,
    status: ours ? null : r.status,
    active: r.deactivated_at == null,
    createdAt: r.created_at,
    createdByName: ours ? null : r.creator_name,
    updatedAt: r.updated_at,
    editedByName: ours ? null : r.editor_name,
  }
}

/** Glue a list of optional clauses into a WHERE (dropping the empty ones), so a
 * scope clause that is empty for staff can't leave a dangling `AND`. */
function where(parts: (string | undefined)[]): string {
  const live = parts.filter((p): p is string => !!p && p.length > 0)
  return live.length ? ` WHERE ${live.join(" AND ")}` : ""
}

/** The audit set-clause every edit shares (five columns, one place). */
function editedBy(actor: Actor, now: string): { sql: string; params: string[] } {
  return {
    sql: "updated_at = ?, editor_id = ?, editor_email = ?, editor_name = ?",
    params: [now, actor.id, actor.email, actor.name],
  }
}

// ── accounts ─────────────────────────────────────────────────────────────────

/** The team's accounts, newest first, PAGED by key.
 *
 * R14: accounts grow with ordinary use — every contact of every client is a row
 * here, so a hard cap would eventually become a refusal to answer. This door
 * therefore pages (opaque cursor + exact total + hasMore) rather than capping.
 * The screens shipped, so the registry entry is in place: `accounts` is a
 * GROWING_COLLECTIONS row in shared/rules/registry.ts, which also holds the
 * check to a client that can actually reach page two.
 *
 * `q` searches name, code and email. `type` narrows to entities or individuals.
 * Archived rows are included and carry `active` (the manager greys them with a
 * Restore button — the same shape as a retired role). */
/** WHAT A CALLER MAY NARROW an accounts read to — the fence plus the three
 * filters, built ONCE so the paged list and the CSV export can never disagree
 * about what a filter means. They are the same question asked for a screen and
 * for a file; two copies of this would be two answers waiting to drift. */
export type AccountFilters = { q?: string; type?: "entity" | "individual"; parentId?: string }

function accountsWhere(scope: AccountScope, opts: AccountFilters): { sql: string; params: string[] } {
  const fence = accountScopeClause(scope, "id")
  const filters: string[] = []
  const params: string[] = [...fence.params]

  if (opts.q) {
    // ESCAPED, because a search box is not a pattern box. `%` and `_` are LIKE's
    // own wildcards, so an unescaped needle meant a person searching for the
    // literal string "PO_1" silently matched "PO-1" and "POx1" — a filter quietly
    // answering a different question, which is the same defect R19 was written
    // for. It is also the cheap half of a denial: SQLite compares a LIKE pattern
    // by recursing on every `%`, so "%a%a%a%a%a%a%a%a%a%a%a%" is a handful of
    // bytes that costs the worker exponential time over the whole table. One
    // escape closes both. The backslash goes first or it would escape the escapes.
    filters.push("(name LIKE ? ESCAPE '\\' OR code LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')")
    const like = `%${likeLiteral(opts.q)}%`
    params.push(like, like, like)
  }
  if (opts.type) {
    filters.push("account_type = ?")
    params.push(opts.type)
  }
  if (opts.parentId) {
    filters.push("parent_account_id = ?")
    params.push(opts.parentId)
  }
  return { sql: where([fence.sql, ...filters]), params }
}

export async function listAccounts(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  opts: AccountFilters & { cursor?: string | null } = {}
): Promise<Page<Account> & { total: number }> {
  const { sql: base, params } = accountsWhere(scope, opts)
  const after = keysetAfter(decodeCursor(opts.cursor), "created_at")
  const pageWhere = after.sql ? `${base ? `${base} AND` : " WHERE"} ${after.sql}` : base

  const [rows, counted] = await Promise.all([
    // PAGE_SIZE + 1 is how hasMore is known without a second query.
    d1Query<AccountRow>(
      cfg,
      guard.databaseId,
      `SELECT ${ACCOUNT_COLUMNS} FROM accounts${pageWhere}
        ORDER BY created_at DESC, id DESC LIMIT ${PAGE_SIZE + 1}`,
      [...params, ...after.params]
    ),
    // R16: the exact total of what THIS caller may see — the same WHERE, so a
    // badge can never count rows the list withholds.
    d1Query<{ n: number }>(cfg, guard.databaseId, `SELECT COUNT(*) AS n FROM accounts${base}`, params),
  ])

  const page = toPage(rows, PAGE_SIZE, (r) => [r.created_at, r.id])
  return { ...page, rows: page.rows.map((r) => toAccount(r, scope)), total: counted[0]?.n ?? 0 }
}

/** Every account this caller may see — NARROWED the same way the list narrows —
 * as full rows for the CSV export.
 *
 * The SAME fence as the list (an export that skipped it would be the leak in its
 * most convenient form: one request, every row, in a file) and now the same
 * FILTERS, through the one `accountsWhere` above. Ordered by name so the
 * download is readable.
 *
 * AN EXPORT IS ONE WHOLE DOCUMENT, OR IT IS AN ERROR. R14 says a growing
 * collection must page rather than cap, and accounts is a GROWING_COLLECTIONS
 * row — but a CSV download is not a page, it is the file, and half a file is the
 * one answer nobody can act on. So this reads the cap PLUS ONE and hands back
 * `complete`, and the door refuses rather than serving a short file that looks
 * whole. That matters most here of all: these columns lead with the import
 * format so the file goes straight back in through the importer — a silently
 * truncated export, re-imported, is data loss that looks like a round trip.
 * Past the cap the caller narrows (q / type / parentId, the same three the
 * screen and `list_accounts` use) or reads the paged list. */
export async function listAccountsForExport(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  opts: AccountFilters = {}
): Promise<{ rows: Account[]; complete: boolean }> {
  const { sql, params } = accountsWhere(scope, opts)
  const rows = await d1Query<AccountRow>(
    cfg,
    guard.databaseId,
    // R14 hard cap — never unbounded (exports get the larger deliberate-download
    // cap). +1 is how "there was more" is known without a second query.
    `SELECT ${ACCOUNT_COLUMNS} FROM accounts${sql}
      ORDER BY name ASC, id ASC LIMIT ${EXPORT_HARD_CAP + 1}`,
    params
  )
  return { rows: rows.slice(0, EXPORT_HARD_CAP).map((r) => toAccount(r, scope)), complete: rows.length <= EXPORT_HARD_CAP }
}

/** One account with its people and its logins — the detail read. Outside the
 * fence it is a 404, identical to a made-up id.
 *
 * R16: the two counts ride along as exact server COUNT(*)s through the SAME
 * fence, because the detail's tabs badge them. Never `links.length` — that is a
 * capped read's ceiling wearing a total's clothes. */
export async function getAccount(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string
): Promise<AccountDetail> {
  const fence = accountScopeClause(scope, "id")
  const rows = await d1Query<AccountRow>(
    cfg,
    guard.databaseId,
    `SELECT ${ACCOUNT_COLUMNS} FROM accounts${where([fence.sql, "id = ?"])} LIMIT 1`,
    [...fence.params, id]
  )
  if (!rows[0]) throw new GuardError(404, "not_found", "That account doesn't exist.")
  const account = toAccount(rows[0], scope)

  // The parent is read through the SAME fence: a pinned caller who can see a
  // subsidiary must not learn its holding company's name by opening the child.
  const [parentRows, links, portalUsers, linksTotal, portalUsersTotal] = await Promise.all([
    account.parentAccountId
      ? d1Query<AccountRow>(
          cfg,
          guard.databaseId,
          `SELECT ${ACCOUNT_COLUMNS} FROM accounts${where([fence.sql, "id = ?"])} LIMIT 1`,
          [...fence.params, account.parentAccountId]
        )
      : Promise.resolve([] as AccountRow[]),
    listAccountLinks(cfg, guard, scope, id),
    listPortalUsers(cfg, guard, scope, id),
    countAccountLinks(cfg, guard, scope, id),
    countPortalUsers(cfg, guard, scope, id),
  ])

  return {
    account,
    parent: parentRows[0] ? toAccount(parentRows[0], scope) : null,
    links,
    portalUsers,
    linksTotal,
    portalUsersTotal,
  }
}

/** ONE account inside the fence — the row alone, no people, no logins.
 *
 * The portal grant reads a person's email through this before it may look them
 * up in the GLOBAL users table: identity lives outside the fence, so the row
 * that names the email has to come from inside it. */
export async function getAccountRow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string
): Promise<Account> {
  return accountOrThrow(cfg, guard, scope, id)
}

/** Create an account. A portal caller may only add people INSIDE their own
 * account set (a main stakeholder adding a colleague); staff may create a root. */
export async function createAccount(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: {
    accountType: "entity" | "individual"
    name: string
    parentAccountId?: string
    email?: string
    phone?: string
    address?: string
    code?: string
    currency?: string
    locale?: string
    timezone?: string
    status?: string
  }
): Promise<string> {
  if (input.parentAccountId) {
    requireAccountInScope(scope, input.parentAccountId, "That parent account")
    await accountOrThrow(cfg, guard, scope, input.parentAccountId)
  } else if (scope.kind === "portal") {
    // A pinned caller with no parent would be creating a row outside every
    // fence — including their own, which is the one thing the pin must forbid.
    throw new GuardError(403, "forbidden", "New accounts have to sit under one of your accounts.")
  }

  const id = ulid()
  const now = new Date().toISOString()
  await refusingDuplicate(REFERENCE_TAKEN, () =>
    insertRow(cfg, guard, "accounts", {
      id,
      account_type: input.accountType,
      parent_account_id: input.parentAccountId ?? null,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      code: input.code ?? null,
      currency: input.currency ?? null,
      locale: input.locale ?? null,
      timezone: input.timezone ?? null,
      status: input.status ?? "active",
      created_at: now,
      creator_id: actor.id,
      creator_email: actor.email,
      creator_name: actor.name,
    })
  )

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Account created",
    description: `${actor.name} added the account "${input.name}"`,
    relatedTable: "accounts",
    relatedRowId: id,
  })
  return id
}

/** A field the caller may have left out entirely. `undefined` = "say nothing
 * about it"; `null` = "clear it"; a string = "set it to this". */
type Patch = string | null | undefined

/** Edit an account's own fields (never its parent — that's setAccountParent, which
 * has a cycle to answer for). The fence rides the UPDATE.
 *
 * THIS IS A PATCH, NOT A REPLACE, AND IT DID NOT USED TO BE. Every optional field
 * was written as `input.X ?? null`, so a caller who sent only `{id, name}` did not
 * edit the name — it silently erased the email, phone, address, reference,
 * currency, language and time zone with it. Two callers were doing exactly that
 * every day. The assistant's `update_account` tool drops absent fields, so an
 * agent turn asked to "rename this account" destroyed the rest of the record and
 * showed the owner nothing to approve. And the app's OWN account form never sends
 * currency, language or time zone at all, so saving any edit from the screen wiped
 * all three — a data-loss bug that had nothing to do with the agent.
 *
 * So absence now means absence. `undefined` keeps what is there (`before`), and
 * clearing a field is something a caller has to SAY, by sending it empty. `status`
 * and `commercialsVisible` already worked this way; the other seven now agree
 * with them, which is the point — one rule for the whole record, not two. */
export async function updateAccount(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  input: {
    name: string
    email?: Patch
    phone?: Patch
    address?: Patch
    code?: Patch
    currency?: Patch
    locale?: Patch
    timezone?: Patch
    status?: Patch
    commercialsVisible?: boolean
  }
): Promise<void> {
  // THE STORED ROW, not the caller's view of it — see accountRowOrThrow.
  const before = await accountRowOrThrow(cfg, guard, scope, id)
  const fence = accountScopeClause(scope, "id")
  const audit = editedBy(actor, new Date().toISOString())

  /** What this field becomes: the caller's value when they mentioned it at all,
   * otherwise exactly what the row already holds. */
  const keep = (value: Patch, current: string | null): string | null =>
    value === undefined ? current : value

  const next = {
    email: keep(input.email, before.email),
    phone: keep(input.phone, before.phone),
    address: keep(input.address, before.address),
    code: keep(input.code, before.code),
    currency: keep(input.currency, before.currency),
    locale: keep(input.locale, before.locale),
    timezone: keep(input.timezone, before.timezone),
    // Status is the one field with no "cleared" state to reach: the column is NOT
    // NULL with a default, so an empty status is not a blank commercial stage, it
    // is a constraint violation and a 500. Absent OR empty both keep what's there
    // — the behaviour it has always had, said out loud rather than left to `??`.
    status: input.status ?? before.status,
  }

  const changed = await refusingDuplicate(REFERENCE_TAKEN, () =>
    d1Query<{ id: string }>(
      cfg,
      guard.databaseId,
      `UPDATE accounts SET name = ?, email = ?, phone = ?, address = ?, code = ?, currency = ?,
         locale = ?, timezone = ?, status = ?, commercials_visible = ?, ${audit.sql}
       ${where([fence.sql, "id = ?"])} RETURNING id`,
      [
        input.name,
        next.email,
        next.phone,
        next.address,
        next.code,
        next.currency,
        next.locale,
        next.timezone,
        next.status,
        input.commercialsVisible === undefined ? before.commercials_visible : input.commercialsVisible ? 1 : 0,
        ...audit.params,
        ...fence.params,
        id,
      ]
    )
  )
  if (!changed[0]) throw new GuardError(404, "not_found", "That account doesn't exist.")

  const changes = describeChanges([
    { label: "Name", from: before.name, to: input.name },
    { label: "Reference", from: before.code, to: next.code },
    { label: "Email", from: before.email, to: next.email },
    { label: "Phone", from: before.phone, to: next.phone },
    { label: "Status", from: before.status, to: next.status },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Account edited",
    description: `${actor.name} edited ${input.name}${changes ? ` — ${changes}` : ""}`,
    relatedTable: "accounts",
    relatedRowId: id,
  })
}

/**
 * Move an account under another (or to the top, with `parentAccountId: null`).
 *
 * THE LOOP GUARD, as one statement. Attaching X under P closes a ring exactly
 * when X is already an ancestor-or-self of P, so the recursive walk up from P is
 * the test — and it rides the UPDATE's own WHERE. Two admins re-parenting at the
 * same instant therefore cannot both pass a check and both write: D1 serializes
 * the statements, the second one re-walks the tree the first one left behind, and
 * a ring is refused rather than created (CONCURRENCY rule 1). Zero rows changed =
 * refused, and the caller is told plainly which of the three reasons it was.
 *
 * AND THE WALK IS BOUNDED. The accounts table is the one self-nesting structure in
 * the base, so this is the one unbounded recursion — a chain N deep costs N steps
 * every time anyone moves anything. `depth` rides the CTE and stops it at
 * MAX_ACCOUNT_DEPTH. Hitting the ceiling REFUSES the move (`OR depth >= ?` in the
 * ring test): past it the walk can no longer prove the tree is ring-free, and a
 * guard that can't prove safety must fail closed, not fall through to "fine".
 */
export async function setAccountParent(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  parentAccountId: string | null
): Promise<void> {
  const before = await accountOrThrow(cfg, guard, scope, id)
  if (parentAccountId) requireAccountInScope(scope, parentAccountId, "That parent account")

  const fence = accountScopeClause(scope, "id")
  const parentFence = accountScopeClause(scope, "p.id")
  const audit = editedBy(actor, new Date().toISOString())

  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `WITH RECURSIVE ancestors(id, depth) AS (
       SELECT ?, 0
       UNION
       SELECT a.parent_account_id, an.depth + 1 FROM accounts a JOIN ancestors an ON a.id = an.id
        WHERE a.parent_account_id IS NOT NULL AND an.depth < ?
     )
     UPDATE accounts SET parent_account_id = ?, ${audit.sql}
     ${where([
       fence.sql,
       "id = ?",
       // the new parent must exist and be inside the same fence…
       `(? IS NULL OR EXISTS (SELECT 1 FROM accounts p ${where([parentFence.sql, "p.id = ?"])}))`,
       // …and must not already sit beneath us (that is the ring) — or sit so deep
       // that the bounded walk couldn't reach the top and prove it isn't.
       "NOT EXISTS (SELECT 1 FROM ancestors WHERE id = ? OR depth >= ?)",
     ])}
     RETURNING id`,
    [
      parentAccountId,
      MAX_ACCOUNT_DEPTH,
      parentAccountId,
      ...audit.params,
      ...fence.params,
      id,
      parentAccountId,
      ...parentFence.params,
      parentAccountId,
      id,
      MAX_ACCOUNT_DEPTH,
    ]
  )
  if (!changed[0])
    throw new GuardError(
      409,
      "would_loop",
      "That would put the account inside itself — pick a parent that isn't already underneath it."
    )

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Account moved",
    description: `${actor.name} moved ${before.name} ${parentAccountId ? "under another account" : "to the top level"}`,
    relatedTable: "accounts",
    relatedRowId: id,
  })
}

/** Archive / restore an account. R17: the current-status predicate rides the
 * UPDATE, so a double-clicked Archive moves zero rows the second time — no
 * duplicate history row, and the route publishes nothing. */
export async function setAccountActive(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  active: boolean
): Promise<boolean> {
  const account = await accountOrThrow(cfg, guard, scope, id)
  const fence = accountScopeClause(scope, "id")
  const now = new Date().toISOString()

  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    active
      ? `UPDATE accounts SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL,
           deactivator_name = NULL, updated_at = ?
         ${where([fence.sql, "id = ?", "deactivated_at IS NOT NULL"])} RETURNING id`
      : `UPDATE accounts SET deactivated_at = ?, deactivator_id = ?, deactivator_email = ?,
           deactivator_name = ?, updated_at = ?
         ${where([fence.sql, "id = ?", "deactivated_at IS NULL"])} RETURNING id`,
    active
      ? [now, ...fence.params, id]
      : [now, actor.id, actor.email, actor.name, now, ...fence.params, id]
  )
  if (!changed[0]) return false

  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "Account restored" : "Account archived",
    description: `${actor.name} ${active ? "restored" : "archived"} ${account.name}`,
    relatedTable: "accounts",
    relatedRowId: id,
  })
  return true
}

// ── the people on an account (account_links) ─────────────────────────────────

/** Everyone linked to one account. Bounded: a company's contact list doesn't
 * grow without end the way its tickets do. */
export async function listAccountLinks(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  accountId: string
): Promise<AccountLink[]> {
  const fence = accountScopeClause(scope, "l.account_id")
  const rows = await d1Query<{
    id: string
    account_id: string
    person_account_id: string
    person_name: string
    relationship: string | null
    is_main_stakeholder: number
    deactivated_at: string | null
  }>(
    cfg,
    guard.databaseId,
    // R14 hard cap — a contact list is bounded; move to paging before this bites.
    `SELECT l.id, l.account_id, l.person_account_id, p.name AS person_name, l.relationship,
            l.is_main_stakeholder, l.deactivated_at
       FROM account_links l JOIN accounts p ON p.id = l.person_account_id
       ${where([fence.sql, "l.account_id = ?"])}
      ORDER BY l.is_main_stakeholder DESC, (l.deactivated_at IS NULL) DESC, p.name ASC
      LIMIT ${LIST_HARD_CAP}`,
    [...fence.params, accountId]
  )
  return rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    personAccountId: r.person_account_id,
    personName: r.person_name,
    relationship: r.relationship,
    isMainStakeholder: r.is_main_stakeholder === 1,
    active: r.deactivated_at == null,
  }))
}

/** R16 — the exact server total behind the contacts list above, through the SAME
 * fence, so the Contacts tab's badge can never advertise more people than the
 * list is willing to show. */
export async function countAccountLinks(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  accountId: string
): Promise<number> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM account_links${where([fence.sql, "account_id = ?"])}`,
    [...fence.params, accountId]
  )
  return rows[0]?.n ?? 0
}

/** Link a person to an account. BOTH sides are checked against the fence: the
 * company AND the person, or a pinned caller could staple a stranger's contact
 * row onto their own company and read the name back out of the list. */
export async function linkPerson(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { accountId: string; personAccountId: string; relationship?: string; isMainStakeholder?: boolean }
): Promise<string> {
  requireAccountInScope(scope, input.accountId)
  requireAccountInScope(scope, input.personAccountId, "That person")
  if (input.accountId === input.personAccountId)
    throw new GuardError(400, "invalid_input", "An account can't be its own contact.")

  const [account, person] = await Promise.all([
    accountOrThrow(cfg, guard, scope, input.accountId),
    accountOrThrow(cfg, guard, scope, input.personAccountId),
  ])

  // The partial unique index is the real duplicate guard (two people adding the
  // same contact at once); this read is the fast, friendly path. The INSERT
  // carries the same answer for the raced loser — see refusingDuplicate.
  const already = `${person.name} is already a contact of ${account.name}.`
  const dup = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    "SELECT id FROM account_links WHERE account_id = ? AND person_account_id = ? AND deactivated_at IS NULL LIMIT 1",
    [input.accountId, input.personAccountId]
  )
  if (dup[0]) throw new GuardError(409, "duplicate", already)

  const id = ulid()
  const now = new Date().toISOString()
  await refusingDuplicate(already, () =>
    insertRow(cfg, guard, "account_links", {
      id,
      account_id: input.accountId,
      person_account_id: input.personAccountId,
      relationship: input.relationship ?? null,
      is_main_stakeholder: input.isMainStakeholder ? 1 : 0,
      created_at: now,
      creator_id: actor.id,
      creator_email: actor.email,
      creator_name: actor.name,
    })
  )

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Contact linked",
    description: `${actor.name} linked ${person.name} to ${account.name}`,
    relatedTable: "account_links",
    relatedRowId: id,
  })
  return id
}

/** Unlink / relink a person (deactivate-never-delete: the row survives, so the
 * history of who was a contact when stays true). R17 predicate included.
 *
 * Returns the ACCOUNT the link hangs off when a row actually moved, else null —
 * the route publishes that account (a contact is the SHAPE of an account, never
 * a record with a list of its own, so the account id is what a listener can act
 * on). Null is the R17 silence: no row moved, no ping. */
export async function setLinkActive(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  active: boolean
): Promise<string | null> {
  // The fence check has to come BEFORE the idempotent write, because "zero rows
  // moved" answers two completely different questions: "it was already like
  // that" (a 200 no-op, R17) and "that row isn't yours" (a 404). Collapsing them
  // told a burglar's sabotage attempt "ok" — found by the leak suite, which is
  // exactly the kind of hole a refusal-shaped test would have missed.
  await rowInFenceOrThrow(cfg, guard, scope, "account_links", id)
  const fence = accountScopeClause(scope, "account_id")
  const now = new Date().toISOString()

  const changed = await d1Query<{ account_id: string }>(
    cfg,
    guard.databaseId,
    active
      ? `UPDATE account_links SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL,
           deactivator_name = NULL, updated_at = ?
         ${where([fence.sql, "id = ?", "deactivated_at IS NOT NULL"])} RETURNING account_id`
      : `UPDATE account_links SET deactivated_at = ?, deactivator_id = ?, deactivator_email = ?,
           deactivator_name = ?, updated_at = ?
         ${where([fence.sql, "id = ?", "deactivated_at IS NULL"])} RETURNING account_id`,
    active ? [now, ...fence.params, id] : [now, actor.id, actor.email, actor.name, now, ...fence.params, id]
  )
  if (!changed[0]) return null

  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "Contact relinked" : "Contact unlinked",
    description: `${actor.name} ${active ? "relinked" : "unlinked"} a contact`,
    relatedTable: "account_links",
    relatedRowId: id,
  })
  return changed[0].account_id
}

// ── portal logins (portal_users) ─────────────────────────────────────────────

/** Who can log in — for one account, or across the caller's whole fence. */
export async function listPortalUsers(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  accountId?: string
): Promise<PortalUser[]> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{
    id: string
    account_id: string
    user_id: string
    app_restriction: string | null
    created_at: string
    creator_name: string | null
    deactivated_at: string | null
  }>(
    cfg,
    guard.databaseId,
    // R14 hard cap — logins per account are few by nature.
    `SELECT id, account_id, user_id, app_restriction, created_at, creator_name, deactivated_at
       FROM portal_users${where([fence.sql, accountId ? "account_id = ?" : undefined])}
      ORDER BY (deactivated_at IS NULL) DESC, created_at DESC LIMIT ${LIST_HARD_CAP}`,
    accountId ? [...fence.params, accountId] : [...fence.params]
  )
  return rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    userId: r.user_id,
    // The email lives on the GLOBAL users row; the route joins it in when it has
    // a reason to (the team DB never mirrors identity).
    email: null,
    appRestriction: r.app_restriction,
    grantedAt: r.created_at,
    // WHICH STAFF MEMBER HANDED OUT THIS LOGIN is the agency's decision, not the
    // client's reading — the same sentence toAccount makes about the audit block
    // one table over, and the same one the ticket row and the reply thread make
    // about ours. The client portal draws no login list at all; the row went out
    // regardless, which is the version that survives a UI rewrite.
    grantedByName: scope.kind === "portal" ? null : r.creator_name,
    active: r.deactivated_at == null,
  }))
}

/** R16 — the exact server total behind the list above, through the SAME fence, so
 * a badge can never advertise more logins than the list is willing to show. Never
 * `rows.length`: that is a capped read's ceiling wearing a total's clothes. */
export async function countPortalUsers(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  accountId?: string
): Promise<number> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM portal_users${where([fence.sql, accountId ? "account_id = ?" : undefined])}`,
    accountId ? [...fence.params, accountId] : [...fence.params]
  )
  return rows[0]?.n ?? 0
}

/** Grant a login on an account. The person must already be an account row here —
 * a login is a switch on somebody we know, never a way to invent one. */
export async function grantPortalAccess(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: {
    /** The company the grant is made ON — used to check the granter's own reach
     * and to say what happened in the activity feed. It is NOT what gets stored. */
    onAccountId: string
    /** The PERSON's own account row. THIS is what `portal_users.account_id`
     * holds, because it is what the fence reads: `accountScope` walks from this
     * row UP to the companies the person belongs to (their parent pointer and
     * their links), then DOWN through everything nested.
     *
     * Handing it a COMPANY instead looks like it works and quietly widens the
     * fence: a company is nobody's contact, so the link half finds nothing and
     * the parent half returns the company's PARENT — and the walk down then
     * covers every sibling company under that parent. Top-level grants hide it,
     * because a top-level company has no parent to climb to. The agency screen
     * passed the company; the seed passed the person; both looked fine. */
    personAccountId: string
    userId: string
    appRestriction?: string
  }
): Promise<string> {
  requireAccountInScope(scope, input.onAccountId)
  const account = await accountOrThrow(cfg, guard, scope, input.onAccountId)
  // The person must be a person. A grant whose stored row is an entity is the
  // widening above, so it is refused here rather than resolved into a bigger fence.
  const person = await accountOrThrow(cfg, guard, scope, input.personAccountId)
  if (person.accountType !== "individual")
    throw new GuardError(
      400,
      "invalid_input",
      "A login belongs to a person, not to a company."
    )

  const live = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    "SELECT id FROM portal_users WHERE user_id = ? AND deactivated_at IS NULL LIMIT 1",
    [input.userId]
  )
  // The partial unique index enforces this under a race; the read makes the
  // refusal readable. One live grant per person is what pins them to one fence.
  const already = "That person already has portal access."
  if (live[0]) throw new GuardError(409, "duplicate", already)

  const id = ulid()
  const now = new Date().toISOString()
  await refusingDuplicate(already, () =>
    insertRow(cfg, guard, "portal_users", {
      id,
      account_id: input.personAccountId, // the PERSON — see the note above
      user_id: input.userId,
      app_restriction: input.appRestriction ?? null,
      created_at: now,
      creator_id: actor.id,
      creator_email: actor.email,
      creator_name: actor.name,
    })
  )

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Portal access granted",
    description: `${actor.name} gave portal access on ${account.name}`,
    relatedTable: "portal_users",
    relatedRowId: id,
  })
  return id
}

/** Revoke / restore a login. Revoking deactivates the row — the login dies, every
 * record the person is attached to stays exactly where it was. R17 predicate.
 * Returns the account the login sits on when a row moved, else null (see
 * setLinkActive for why the ACCOUNT is what comes back). */
export async function setPortalAccessActive(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  active: boolean
): Promise<string | null> {
  // Fence first, then the idempotent write — see setLinkActive for why the two
  // can't share an answer.
  await rowInFenceOrThrow(cfg, guard, scope, "portal_users", id)
  const fence = accountScopeClause(scope, "account_id")
  const now = new Date().toISOString()

  const changed = await d1Query<{ account_id: string }>(
    cfg,
    guard.databaseId,
    active
      ? `UPDATE portal_users SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL,
           deactivator_name = NULL, updated_at = ?
         ${where([fence.sql, "id = ?", "deactivated_at IS NOT NULL"])} RETURNING account_id`
      : `UPDATE portal_users SET deactivated_at = ?, deactivator_id = ?, deactivator_email = ?,
           deactivator_name = ?, updated_at = ?
         ${where([fence.sql, "id = ?", "deactivated_at IS NULL"])} RETURNING account_id`,
    active ? [now, ...fence.params, id] : [now, actor.id, actor.email, actor.name, now, ...fence.params, id]
  )
  if (!changed[0]) return null

  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "Portal access restored" : "Portal access revoked",
    description: `${actor.name} ${active ? "restored" : "revoked"} portal access`,
    relatedTable: "portal_users",
    relatedRowId: id,
  })
  return changed[0].account_id
}

// ── shared internals ─────────────────────────────────────────────────────────

/** One account inside the fence AS STORED, or a clean 404 (identical to a made-up
 * id). The raw row, deliberately: a WRITE's before-image has to be what is in the
 * database, not what this caller is allowed to be told about it — `toAccount`
 * withholds `status` and `commercialsVisible` from a client login, and an edit
 * that carried those forward from a redacted view would blank a NOT NULL column
 * and flip a commercial flag nobody touched. Readers want `accountOrThrow`. */
async function accountRowOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string
): Promise<AccountRow> {
  const fence = accountScopeClause(scope, "id")
  const rows = await d1Query<AccountRow>(
    cfg,
    guard.databaseId,
    `SELECT ${ACCOUNT_COLUMNS} FROM accounts${where([fence.sql, "id = ?"])} LIMIT 1`,
    [...fence.params, id]
  )
  if (!rows[0]) throw new GuardError(404, "not_found", "That account doesn't exist.")
  return rows[0]
}

/** One account inside the fence, as this caller may be told it. */
async function accountOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string
): Promise<Account> {
  return toAccount(await accountRowOrThrow(cfg, guard, scope, id), scope)
}

/** Does a row hang off an account inside the fence? Used by the archive/restore
 * toggles, which otherwise cannot separate "already done" from "not yours". 404
 * for both an unknown id and an out-of-fence one — the same sentence either way. */
async function rowInFenceOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  table: "account_links" | "portal_users",
  id: string
): Promise<void> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `SELECT id FROM ${table}${where([fence.sql, "id = ?"])} LIMIT 1`,
    [...fence.params, id]
  )
  if (!rows[0]) throw new GuardError(404, "not_found", "That record doesn't exist.")
}

/** WHERE this client login may stand, with names — the switcher's whole payload,
 * and the ONLY place the roots become readable text. Not a growing collection: a
 * person belongs to a handful of companies, and the guard corridor has already
 * bounded the set. LIMIT LIST_HARD_CAP anyway (R14), because "it can't get big"
 * is exactly the sentence every unbounded read was born from. */
export async function portalStandings(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope
): Promise<{ accounts: { id: string; name: string }[]; currentAccountId: string | null }> {
  if (scope.kind === "staff" || scope.roots.length === 0)
    return { accounts: [], currentAccountId: null }
  const rows = await d1Query<{ id: string; name: string }>(
    cfg,
    guard.databaseId,
    `SELECT id, name FROM accounts
      WHERE id IN (${scope.roots.map(() => "?").join(", ")})
      ORDER BY name LIMIT ${LIST_HARD_CAP}`,
    [...scope.roots]
  )
  return { accounts: rows, currentAccountId: scope.currentAccountId }
}

/** Move a client login to another of THEIR OWN companies — a narrowing, never a
 * widening: `requireStandableRoot` refuses anything outside the set the guard
 * corridor resolved, with the same 404 as any other stranger's id.
 *
 * Idempotent (R17): the current value rides the WHERE, so standing where you
 * already stand moves zero rows and the caller learns nothing changed. The
 * pointer is the caller's OWN — `user_id = ?` from the session, never a body
 * field — so one client can never re-seat another. */
export async function switchPortalAccount(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  accountId: string
): Promise<boolean> {
  requireStandableRoot(scope, accountId)
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE portal_users SET current_account_id = ?, updated_at = ?
      WHERE user_id = ? AND deactivated_at IS NULL
        AND (current_account_id IS NULL OR current_account_id <> ?)
      RETURNING id`,
    [accountId, new Date().toISOString(), guard.userId, accountId]
  )
  return !!changed[0]
}

/** A UNIQUE INDEX REFUSING A ROW IS BAD INPUT, NOT A CRASH.
 *
 * Three of the spine's rules are unique indexes (team-schema): one `reference`
 * per account, one live link per (account, person), one live login per person.
 * They are the authority and they ride the write — a pre-check is two steps a
 * concurrent write slips between. But the refusal arrived here as a raw Error,
 * which the worker's central catch turned into a 500 AND a row in the GLOBAL
 * error log. `accounts.code` had no pre-check at all, so retyping a reference
 * someone else already uses — an everyday mistake — was a repeatable 500 that
 * wrote a fresh error row every time: an ordinary typo, holding an attacker's
 * pen. Bad input is a clean refusal (R20), never a 500.
 *
 * So the pre-check and the index now give the SAME answer in the same words: the
 * check is the fast, friendly path, this is the one that cannot be raced.
 * ONLY a duplicate is caught; anything else is rethrown untouched, because a
 * swallowed database error is exactly what this must not become.
 *
 * Both data doors say it the same way — the native D1 binding raises
 * "D1_ERROR: UNIQUE constraint failed: …", the REST door wraps that same
 * sentence — which is why one test is enough for a write on either.
 * (createInvite in lib/invites.ts is the same shape on the core DB.) */
async function refusingDuplicate<T>(message: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (e) {
    if (!/UNIQUE constraint/i.test(String((e as Error)?.message ?? ""))) throw e
    throw new GuardError(409, "duplicate", message)
  }
}

/** What a caller is told when a reference is already taken. It names no other
 * account on purpose: a pinned portal caller can create accounts too, and the
 * refusal must not become a way to read a name from outside their fence. */
const REFERENCE_TAKEN = "Another account already uses that reference. Give this one a different reference."

/** A parameterised INSERT — the table name is a code literal, every value is
 * bound. Deliberately NOT d1ExecScript + sqlString: the spine's values are the
 * customer's own text (names with apostrophes, addresses with newlines), and
 * bound parameters are the door that can't be talked past. */
async function insertRow(
  cfg: D1Rest,
  guard: MemberGuard,
  table: "accounts" | "account_links" | "portal_users",
  row: Record<string, string | number | null>
): Promise<void> {
  const cols = Object.keys(row)
  await d1Query(
    cfg,
    guard.databaseId,
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    cols.map((c) => row[c])
  )
}
