// AN ACCOUNT'S RATE CARD — what this client is charged per hour, by kind of work.
//
// THIS FILE IS ONE HALF OF A DELIBERATE SPLIT, and the split is the security
// control. The other half — what an hour of our own work COSTS us, and the margin
// computed from it — lives in lib/internal-money.ts and is never imported by
// anything a client login can reach. The two numbers are the same shape (a label
// and a rate per hour) and opposite audiences, so keeping them in one file behind
// a flag would put the figure SCOPE says a client must NEVER see one forgotten
// predicate away from the one they may.
//
// A file cannot be forgotten the way a WHERE clause can. Law R24 walks the portal
// gateway's own door table through to the code behind it and fails the build if
// any of it reaches the internal file — so "internal rates and margin never
// render in the portal" is a fact about the import graph, not a condition
// somebody can invert later.
//
// The account fence applies here exactly as it does on the accounts spine: a
// caller pinned to one company reads that company's rate card and no other's.

import { logActivity, describeChanges, type Actor } from "@shared/workers/activity"
import { accountScopeClause, requireAccountInScope, type AccountScope } from "@shared/workers/account-scope"
import { d1Query, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { LIST_HARD_CAP } from "@shared/workers/limits"
import type { AccountRate } from "@shared/types"
import { GuardError, type MemberGuard } from "./permissions"

function where(parts: (string | undefined)[]): string {
  const live = parts.filter((p): p is string => !!p && p.length > 0)
  return live.length ? ` WHERE ${live.join(" AND ")}` : ""
}

/** A UNIQUE INDEX REFUSING A ROW IS BAD INPUT, NOT A CRASH — the same seam
 * lib/accounts.ts keeps for the spine's three unique indexes. One live rate per
 * (account, kind of work) is the rule; the index is the authority and it rides
 * the write, so two people naming "Development" on one account at the same
 * instant get a clean 409 rather than a 500 and an error-log row. */
async function refusingDuplicate<T>(message: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (e) {
    if (!/UNIQUE constraint/i.test(String((e as Error)?.message ?? ""))) throw e
    throw new GuardError(409, "duplicate", message)
  }
}

const RATE_TAKEN = "That kind of work already has a rate on this account. Edit the one that's there."

/** ONE ACCOUNT'S RATE CARD, AS A QUESTION — the fence plus the account, written
 * once so the rows below and the count beside them cannot be asked differently
 * (R16: a badge counting rows its list withholds is the leak). */
function rateCardWhere(scope: AccountScope, accountId: string): { sql: string; params: string[] } {
  const fence = accountScopeClause(scope, "account_id")
  return { sql: where([fence.sql, "account_id = ?"]), params: [...fence.params, accountId] }
}

/** R16: the exact server COUNT(*) the Rates tab badges, over the SAME question
 * the card asks. Bounded by nature rather than by a ceiling — a rate card is
 * kinds of work, not hours, so `account_rates` is not a GROWING_COLLECTIONS row.
 *
 * It exists apart from the list because the badge is now answered BEFORE the tab
 * is opened (shared/record-counts.ts): a screen asking "how many are there" must
 * not have to pull the rows to find out. */
export async function countAccountRates(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  accountId: string
): Promise<number> {
  requireAccountInScope(scope, accountId)
  const q = rateCardWhere(scope, accountId)
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM account_rates${q.sql}`,
    q.params
  )
  return rows[0]?.n ?? 0
}

/** One account's rate card. BOUNDED: a rate card is a handful of lines — kinds
 * of work, not hours. */
export async function listAccountRates(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  accountId: string
): Promise<{ rows: AccountRate[]; total: number }> {
  requireAccountInScope(scope, accountId)
  const { sql, params } = rateCardWhere(scope, accountId)
  const [rows, counted] = await Promise.all([
    d1Query<{
      id: string
      account_id: string
      label: string
      cents_per_hour: number
      currency: string | null
      deactivated_at: string | null
      created_at: string
      creator_name: string | null
      updated_at: string | null
      editor_name: string | null
    }>(
      cfg,
      guard.databaseId,
      // R14 hard cap — a rate card is bounded by how many kinds of work exist.
      `SELECT id, account_id, label, cents_per_hour, currency, deactivated_at,
              created_at, creator_name, updated_at, editor_name
         FROM account_rates${sql} ORDER BY (deactivated_at IS NULL) DESC, label ASC
        LIMIT ${LIST_HARD_CAP}`,
      params
    ),
    // R16 — the exact server total through the same fence. ONE expression,
    // shared with the eager badge above.
    countAccountRates(cfg, guard, scope, accountId),
  ])
  return {
    rows: rows.map((r) => ({
      id: r.id,
      accountId: r.account_id,
      label: r.label,
      centsPerHour: r.cents_per_hour,
      currency: r.currency,
      active: r.deactivated_at == null,
      createdAt: r.created_at,
      // Which staff member set the price is the agency's own record — the same
      // sentence toAccount makes about the audit block one table over.
      createdByName: scope.kind === "portal" ? null : r.creator_name,
      updatedAt: r.updated_at,
      editedByName: scope.kind === "portal" ? null : r.editor_name,
    })),
    total: counted,
  }
}

export async function createAccountRate(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { accountId: string; label: string; centsPerHour: number; currency?: string }
): Promise<string> {
  requireAccountInScope(scope, input.accountId)
  const id = ulid()
  await refusingDuplicate(RATE_TAKEN, () =>
    d1Query(
      cfg,
      guard.databaseId,
      `INSERT INTO account_rates (id, account_id, label, cents_per_hour, currency,
         created_at, creator_id, creator_email, creator_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.accountId,
        input.label,
        input.centsPerHour,
        input.currency ?? null,
        new Date().toISOString(),
        actor.id,
        actor.email,
        actor.name,
      ]
    )
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Rate added",
    description: `${actor.name} set a rate for ${input.label}`,
    relatedTable: "account_rates",
    relatedRowId: id,
  })
  return id
}

export async function updateAccountRate(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  input: { label: string; centsPerHour: number; currency?: string | null }
): Promise<string> {
  const before = await rateOrThrow(cfg, guard, scope, id)
  const fence = accountScopeClause(scope, "account_id")
  const now = new Date().toISOString()
  const changed = await refusingDuplicate(RATE_TAKEN, () =>
    d1Query<{ account_id: string }>(
      cfg,
      guard.databaseId,
      `UPDATE account_rates SET label = ?, cents_per_hour = ?, currency = ?,
         updated_at = ?, editor_id = ?, editor_email = ?, editor_name = ?
       ${where([fence.sql, "id = ?"])} RETURNING account_id`,
      [
        input.label,
        input.centsPerHour,
        input.currency === undefined ? before.currency : input.currency,
        now,
        actor.id,
        actor.email,
        actor.name,
        ...fence.params,
        id,
      ]
    )
  )
  if (!changed[0]) throw new GuardError(404, "not_found", "That rate doesn't exist.")
  const changes = describeChanges([
    { label: "Kind of work", from: before.label, to: input.label },
    { label: "Rate", from: String(before.centsPerHour), to: String(input.centsPerHour) },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Rate edited",
    description: `${actor.name} edited the rate for ${input.label}${changes ? `, ${changes}` : ""}`,
    relatedTable: "account_rates",
    relatedRowId: id,
  })
  return changed[0].account_id
}

/** Deactivate / activate a rate (deactivate-never-delete: what an account was charged
 * last year has to stay true). R17 predicate; zero rows moved = silence. */
export async function setAccountRateActive(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  id: string,
  active: boolean
): Promise<string | null> {
  const before = await rateOrThrow(cfg, guard, scope, id)
  const fence = accountScopeClause(scope, "account_id")
  const now = new Date().toISOString()
  const changed = await d1Query<{ account_id: string }>(
    cfg,
    guard.databaseId,
    active
      ? `UPDATE account_rates SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL,
           deactivator_name = NULL, updated_at = ?
         ${where([fence.sql, "id = ?", "deactivated_at IS NOT NULL"])} RETURNING account_id`
      : `UPDATE account_rates SET deactivated_at = ?, deactivator_id = ?, deactivator_email = ?,
           deactivator_name = ?, updated_at = ?
         ${where([fence.sql, "id = ?", "deactivated_at IS NULL"])} RETURNING account_id`,
    active ? [now, ...fence.params, id] : [now, actor.id, actor.email, actor.name, now, ...fence.params, id]
  )
  if (!changed[0]) return null
  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "Rate restored" : "Rate retired",
    description: `${actor.name} ${active ? "restored" : "retired"} the rate for ${before.label}`,
    relatedTable: "account_rates",
    relatedRowId: id,
  })
  return changed[0].account_id
}

/** One rate inside the fence, or a clean 404 (identical to a made-up id). */
async function rateOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  id: string
): Promise<{ id: string; accountId: string; label: string; centsPerHour: number; currency: string | null }> {
  const fence = accountScopeClause(scope, "account_id")
  const rows = await d1Query<{
    id: string
    account_id: string
    label: string
    cents_per_hour: number
    currency: string | null
  }>(
    cfg,
    guard.databaseId,
    `SELECT id, account_id, label, cents_per_hour, currency FROM account_rates${where([fence.sql, "id = ?"])} LIMIT 1`,
    [...fence.params, id]
  )
  if (!rows[0]) throw new GuardError(404, "not_found", "That rate doesn't exist.")
  return {
    id: rows[0].id,
    accountId: rows[0].account_id,
    label: rows[0].label,
    centsPerHour: rows[0].cents_per_hour,
    currency: rows[0].currency,
  }
}
