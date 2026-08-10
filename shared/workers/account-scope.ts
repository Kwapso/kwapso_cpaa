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

import { d1Query, type D1Rest } from "./d1-rest"
import { GuardError, type MemberGuard } from "./gating"

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
       * (SCOPE ch.03 "per-person restriction"). Carried, not yet enforced — the
       * Apps module lands later and is the only thing that can honour it. */
      appRestriction: string | null
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

/** The companies this person belongs to: the one their own row hangs under, plus
 * every one they're actively linked to. Two `?` for the same person id
 * (positional binding — the D1 REST door and node:sqlite both take an ordered
 * array, so no named parameters here). */
const ROOTS_SQL = `
SELECT parent_account_id AS id FROM accounts
 WHERE id = ? AND parent_account_id IS NOT NULL
UNION
SELECT l.account_id FROM account_links l
 WHERE l.person_account_id = ? AND l.deactivated_at IS NULL
ORDER BY id`

/** From the company they're standing in, everything nested beneath it. */
const REACH_SQL = `
WITH RECURSIVE reach(id) AS (
  SELECT ?
  UNION
  SELECT a.id FROM accounts a JOIN reach r ON a.parent_account_id = r.id
)
SELECT id FROM reach LIMIT ${SCOPE_HARD_CAP}`

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
  return {
    sql: `${column} IN (${scope.accountIds.map(() => "?").join(", ")})`,
    params: [...scope.accountIds],
  }
}

/** Is this account inside the caller's fence? */
export function inAccountScope(scope: AccountScope, accountId: string | null | undefined): boolean {
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
 * the accounts list can never disagree about which rows are fenced. */
export const ACCOUNT_OWNED_TABLES = ["accounts", "account_links", "portal_users"] as const

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
  const marks = scope.accountIds.map(() => "?").join(", ")
  return {
    sql:
      `((related_table = 'accounts' AND related_row_id IN (${marks}))` +
      ` OR (related_table = 'account_links' AND related_row_id IN (SELECT id FROM account_links WHERE account_id IN (${marks})))` +
      ` OR (related_table = 'portal_users' AND related_row_id IN (SELECT id FROM portal_users WHERE account_id IN (${marks}))))`,
    params: [...scope.accountIds, ...scope.accountIds, ...scope.accountIds],
  }
}
