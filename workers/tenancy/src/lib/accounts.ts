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

import { logActivity, describeChanges, type Actor } from "../../../../shared/workers/activity"
import {
  accountScopeClause,
  requireAccountInScope,
  requireStandableRoot,
  type AccountScope,
} from "../../../../shared/workers/account-scope"
import { d1Query, type D1Rest } from "../../../../shared/workers/d1-rest"
import { ulid } from "../../../../shared/workers/id"
import { LIST_HARD_CAP } from "../../../../shared/workers/limits"
import { decodeCursor, keysetAfter, PAGE_SIZE, toPage, type Page } from "../../../../shared/workers/paging"
import type { Account, AccountDetail, AccountLink, PortalUser } from "../../../../shared/types"
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

function toAccount(r: AccountRow): Account {
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
    commercialsVisible: r.commercials_visible === 1,
    status: r.status,
    active: r.deactivated_at == null,
    createdAt: r.created_at,
    createdByName: r.creator_name,
    updatedAt: r.updated_at,
    editedByName: r.editor_name,
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
 * It is not in GROWING_COLLECTIONS yet only because that registry entry also
 * asserts a client that can reach page two, and the accounts screens land with
 * the UI build — add the entry the day the screen ships.
 *
 * `q` searches name, code and email. `type` narrows to entities or individuals.
 * Archived rows are included and carry `active` (the manager greys them with a
 * Restore button — the same shape as a retired role). */
export async function listAccounts(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  opts: { q?: string; type?: "entity" | "individual"; parentId?: string; cursor?: string | null } = {}
): Promise<Page<Account> & { total: number }> {
  const fence = accountScopeClause(scope, "id")
  const filters: string[] = []
  const params: string[] = [...fence.params]

  if (opts.q) {
    filters.push("(name LIKE ? OR code LIKE ? OR email LIKE ?)")
    const like = `%${opts.q}%`
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

  const base = where([fence.sql, ...filters])
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
  return { ...page, rows: page.rows.map(toAccount), total: counted[0]?.n ?? 0 }
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
  const account = toAccount(rows[0])

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
    parent: parentRows[0] ? toAccount(parentRows[0]) : null,
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
  await insertRow(cfg, guard, "accounts", {
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

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Account created",
    description: `${actor.name} added the account "${input.name}"`,
    relatedTable: "accounts",
    relatedRowId: id,
  })
  return id
}

/** Edit an account's own fields (never its parent — that's setAccountParent, which
 * has a cycle to answer for). The fence rides the UPDATE. */
export async function updateAccount(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  input: {
    name: string
    email?: string
    phone?: string
    address?: string
    code?: string
    currency?: string
    locale?: string
    timezone?: string
    status?: string
    commercialsVisible?: boolean
  }
): Promise<void> {
  const before = await accountOrThrow(cfg, guard, scope, id)
  const fence = accountScopeClause(scope, "id")
  const audit = editedBy(actor, new Date().toISOString())

  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE accounts SET name = ?, email = ?, phone = ?, address = ?, code = ?, currency = ?,
       locale = ?, timezone = ?, status = ?, commercials_visible = ?, ${audit.sql}
     ${where([fence.sql, "id = ?"])} RETURNING id`,
    [
      input.name,
      input.email ?? null,
      input.phone ?? null,
      input.address ?? null,
      input.code ?? null,
      input.currency ?? null,
      input.locale ?? null,
      input.timezone ?? null,
      input.status ?? before.status,
      input.commercialsVisible === undefined ? (before.commercialsVisible ? 1 : 0) : input.commercialsVisible ? 1 : 0,
      ...audit.params,
      ...fence.params,
      id,
    ]
  )
  if (!changed[0]) throw new GuardError(404, "not_found", "That account doesn't exist.")

  const changes = describeChanges([
    { label: "Name", from: before.name, to: input.name },
    { label: "Reference", from: before.code, to: input.code ?? null },
    { label: "Email", from: before.email, to: input.email ?? null },
    { label: "Phone", from: before.phone, to: input.phone ?? null },
    { label: "Status", from: before.status, to: input.status ?? before.status },
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
    `WITH RECURSIVE ancestors(id) AS (
       SELECT ?
       UNION
       SELECT a.parent_account_id FROM accounts a JOIN ancestors an ON a.id = an.id
        WHERE a.parent_account_id IS NOT NULL
     )
     UPDATE accounts SET parent_account_id = ?, ${audit.sql}
     ${where([
       fence.sql,
       "id = ?",
       // the new parent must exist and be inside the same fence…
       `(? IS NULL OR EXISTS (SELECT 1 FROM accounts p ${where([parentFence.sql, "p.id = ?"])}))`,
       // …and must not already sit beneath us (that is the ring).
       "NOT EXISTS (SELECT 1 FROM ancestors WHERE id = ?)",
     ])}
     RETURNING id`,
    [
      parentAccountId,
      parentAccountId,
      ...audit.params,
      ...fence.params,
      id,
      parentAccountId,
      ...parentFence.params,
      parentAccountId,
      id,
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
  // same contact at once); this read just turns the raced loser's constraint
  // error into a sentence a person can act on.
  const dup = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    "SELECT id FROM account_links WHERE account_id = ? AND person_account_id = ? AND deactivated_at IS NULL LIMIT 1",
    [input.accountId, input.personAccountId]
  )
  if (dup[0]) throw new GuardError(409, "duplicate", `${person.name} is already a contact of ${account.name}.`)

  const id = ulid()
  const now = new Date().toISOString()
  await insertRow(cfg, guard, "account_links", {
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
    grantedByName: r.creator_name,
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
  input: { accountId: string; userId: string; appRestriction?: string }
): Promise<string> {
  requireAccountInScope(scope, input.accountId)
  const account = await accountOrThrow(cfg, guard, scope, input.accountId)

  const live = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    "SELECT id FROM portal_users WHERE user_id = ? AND deactivated_at IS NULL LIMIT 1",
    [input.userId]
  )
  // The partial unique index enforces this under a race; the read makes the
  // refusal readable. One live grant per person is what pins them to one fence.
  if (live[0]) throw new GuardError(409, "duplicate", "That person already has portal access.")

  const id = ulid()
  const now = new Date().toISOString()
  await insertRow(cfg, guard, "portal_users", {
    id,
    account_id: input.accountId,
    user_id: input.userId,
    app_restriction: input.appRestriction ?? null,
    created_at: now,
    creator_id: actor.id,
    creator_email: actor.email,
    creator_name: actor.name,
  })

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

/** One account inside the fence, or a clean 404 (identical to a made-up id). */
async function accountOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string
): Promise<Account> {
  const fence = accountScopeClause(scope, "id")
  const rows = await d1Query<AccountRow>(
    cfg,
    guard.databaseId,
    `SELECT ${ACCOUNT_COLUMNS} FROM accounts${where([fence.sql, "id = ?"])} LIMIT 1`,
    [...fence.params, id]
  )
  if (!rows[0]) throw new GuardError(404, "not_found", "That account doesn't exist.")
  return toAccount(rows[0])
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
