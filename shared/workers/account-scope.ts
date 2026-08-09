// THE GUARD CORRIDOR — session → person → account set (SCOPE ch.06, "Access and
// the fence"). Every account-scoped query is built from THIS stamp; none is ever
// built from a request parameter. A door that reads `?accountId=` and trusts it
// is the whole leak, so the shape here is deliberate: you cannot get a WHERE
// clause out of this file without first having resolved a caller.
//
// Two caller kinds, and only two:
//   • STAFF   — a team member with no portal row: the agency side, fenced by the
//               permission matrix alone (they are meant to see every account).
//   • PORTAL  — a client-side person: PINNED to one account set, no matter which
//               door they knock on, no matter what their role says.
//
// FAIL CLOSED, and note WHICH way: portal-ness is decided by the PRESENCE of a
// portal_users row, never by its absence. A revoked row still makes you portal —
// pinned to the EMPTY set (they see nothing) rather than silently promoting you
// to staff the moment access is withdrawn. "Deactivate, never delete" is what
// makes that safe: the row that proves you are a client outlives your login.

import { d1Query, type D1Rest } from "./d1-rest"
import { GuardError, type MemberGuard } from "./gating"

/** The caller's stamp. `accountIds` is the closed set a portal caller may touch:
 * their own account row, every account they are LINKED to, and everything nested
 * under those (a holding company's stakeholder sees its businesses). */
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
      accountIds: string[]
    }

/** R14 — the reach walk is bounded. A pathological hierarchy must not turn one
 * permission check into an unbounded read; past this, the account set is wrong
 * in the SAFE direction (it stops early, granting less). */
const SCOPE_HARD_CAP = 500

/** Their own row + every account they're linked to + everything under those.
 * Two `?` for the same person id (positional binding — the D1 REST door and
 * node:sqlite both take an ordered array, so no named parameters here). */
const REACH_SQL = `
WITH RECURSIVE roots(id) AS (
  SELECT ?
  UNION
  SELECT l.account_id FROM account_links l
   WHERE l.person_account_id = ? AND l.deactivated_at IS NULL
), reach(id) AS (
  SELECT id FROM roots
  UNION
  SELECT a.id FROM accounts a JOIN reach r ON a.parent_account_id = r.id
)
SELECT id FROM reach LIMIT ${SCOPE_HARD_CAP}`

/** Resolve the caller's account set — the ONE place it is decided. Costs one
 * read for staff (the portal_users miss) and two for a portal caller. */
export async function accountScope(cfg: D1Rest, guard: MemberGuard): Promise<AccountScope> {
  // Active grant first: a person re-granted access after a revoke has both rows,
  // and the live one is the one that speaks.
  const rows = await d1Query<{ account_id: string; app_restriction: string | null; deactivated_at: string | null }>(
    cfg,
    guard.databaseId,
    `SELECT account_id, app_restriction, deactivated_at FROM portal_users
      WHERE user_id = ? ORDER BY (deactivated_at IS NULL) DESC LIMIT 1`,
    [guard.userId]
  )
  const row = rows[0]
  if (!row) return { kind: "staff" }
  if (row.deactivated_at != null)
    return { kind: "portal", personAccountId: row.account_id, appRestriction: null, accountIds: [] }

  const reach = await d1Query<{ id: string }>(cfg, guard.databaseId, REACH_SQL, [
    row.account_id,
    row.account_id,
  ])
  return {
    kind: "portal",
    personAccountId: row.account_id,
    appRestriction: row.app_restriction,
    accountIds: reach.map((r) => r.id),
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
