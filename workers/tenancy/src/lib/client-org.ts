// THE CLIENT'S OWN ORGANISATION — who does the work, what it costs them, and
// what they use to do it.
//
// A process map has always carried a single free-typed word for who does the
// work. Round two of the audit-module questions turned that word into records,
// because a saving can only be MONEY if the person doing the work has an hourly
// cost, and a cost belongs to a role rather than to a sentence on a map.
//
// FOUR SHAPES, and the reasons they are four:
//
//   • a DEPARTMENT is a part of the client's company;
//   • a ROLE is a job in it — and it can sit in SEVERAL departments, which is
//     the owner's ruling and not a modelling flourish: "there is a chance that
//     one role is doing things across multiple departments, especially in
//     slightly smaller companies";
//   • a PERSON on a role is a CONTACT WE ALREADY HAVE. There is deliberately no
//     people table here — a second address book is one that goes out of step
//     with the first;
//   • a TOOL is anything a step uses, digital or physical, and its price is
//     DATED so a map set to March does not read today's price.
//
// EVERYTHING IS PER CLIENT. Every read takes the caller's account scope and
// every write checks the record belongs to an account the caller may touch, so
// a client login reaches its own company's organisation and nothing else. That
// is checked at the door AND here, because the fence that matters is the one
// closest to the rows.
//
// DEACTIVATE, NEVER DELETE (ARCHITECTURE §4). A retired role is still the role a
// two-year-old map was drawn against, and a saving computed from a deleted role
// would silently become zero.

import { logActivity, type Actor } from "@shared/workers/activity"
import { accountScopeClause, type AccountScope } from "@shared/workers/account-scope"
import { d1Query, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { LIST_HARD_CAP } from "@shared/workers/limits"
import type {
  ClientDepartment,
  ClientRole,
  ClientTool,
  ClientToolPrice,
} from "@shared/types"
import { getAccountRow } from "./accounts"
import { GuardError, type MemberGuard } from "./permissions"

/* ------------------------------- the shapes -------------------------------
 *
 * The four row shapes live in shared/types.ts, beside every other record the two
 * front doors read — they are re-exported here so this file still reads as the
 * one place the module is defined, and so a screen importing from either place
 * gets the same type rather than a copy that can drift. */

export type {
  ClientDepartment,
  ClientRole,
  ClientTool,
  ClientToolPrice,
} from "@shared/types"

/* ------------------------------ the audit block ---------------------------- */

const AUDIT_CREATE = "created_at, creator_id, creator_email, creator_name"

function auditCreateValues(actor: Actor, now: string): string {
  return `${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)}`
}

function auditEditSet(actor: Actor, now: string): string {
  return `updated_at = ${sqlString(now)}, editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)}`
}

/* --------------------------------- the fence -------------------------------- */

/** THE ACCOUNT THIS RECORD BELONGS TO MUST BE ONE THE CALLER MAY TOUCH.
 *
 * Every write here names an account — either directly (`accountId` on the body)
 * or through the record being edited — and this is the one place that is
 * checked. A door that forgot it would let a client login write into another
 * company's organisation, which is the exact failure R21 exists for, so it is
 * asserted per write rather than left to the door.
 *
 * Staff pass everything. A portal caller passes only the accounts their scope
 * names, and a scope naming nothing passes nothing. */
function assertAccountInScope(scope: AccountScope, accountId: string): void {
  if (scope.kind === "staff") return
  if (!scope.accountIds.includes(accountId))
    throw new GuardError(404, "not_found", "No such client.")
}

/** The account a record belongs to, read back before it is written to — because
 * the id on the body says which RECORD, and only the row says whose it is. */
async function ownerOf(
  cfg: D1Rest,
  guard: MemberGuard,
  table: string,
  id: string
): Promise<string> {
  const rows = await d1Query<{ account_id: string }>(
    cfg,
    guard.databaseId,
    `SELECT account_id FROM ${table} WHERE id = ${sqlString(id)}`
  )
  if (!rows.length) throw new GuardError(404, "not_found", "That's not there anymore.")
  return rows[0].account_id
}

/* ------------------------------- departments ------------------------------- */

/** Every department of the clients this caller may see, live ones first.
 *
 * `roleCount` rides along because the screen shows it beside each name and the
 * alternative is one count per row — the N+1 this module would otherwise be
 * born with. */
export async function listDepartments(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  accountId?: string | null
): Promise<ClientDepartment[]> {
  const fence = accountScopeClause(scope, "d.account_id")
  const where = [fence.sql, accountId ? `d.account_id = ${sqlString(accountId)}` : ""]
    .filter(Boolean)
    .join(" AND ")
  const rows = await d1Query<{
    id: string
    account_id: string
    name: string
    deactivated_at: string | null
    role_count: number
  }>(
    cfg,
    guard.databaseId,
    // R14 hard cap — a client's departments are a handful, never a growing feed.
    `SELECT d.id, d.account_id, d.name, d.deactivated_at,
            (SELECT COUNT(*) FROM client_role_departments rd WHERE rd.department_id = d.id) AS role_count
       FROM client_departments d
      ${where ? `WHERE ${where}` : ""}
      ORDER BY (d.deactivated_at IS NOT NULL), d.name
      LIMIT ${LIST_HARD_CAP}`
  )
  return rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    name: r.name,
    active: r.deactivated_at == null,
    roleCount: Number(r.role_count) || 0,
  }))
}

export async function countDepartments(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  accountId?: string | null
): Promise<number> {
  const fence = accountScopeClause(scope, "account_id")
  const where = [fence.sql, accountId ? `account_id = ${sqlString(accountId)}` : ""]
    .filter(Boolean)
    .join(" AND ")
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM client_departments ${where ? `WHERE ${where}` : ""}`
  )
  return Number(rows[0]?.n) || 0
}

export async function createDepartment(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { accountId: string; name: string }
): Promise<{ id: string }> {
  assertAccountInScope(scope, input.accountId)
  const id = ulid()
  const now = new Date().toISOString()
  // THE UNIQUENESS RIDES THE WRITE (CONCURRENCY.md): a partial unique index over
  // live rows means a duplicate name is refused by the database rather than by a
  // count-then-insert that two clicks can both pass.
  try {
    await d1Query(
      cfg,
      guard.databaseId,
      `INSERT INTO client_departments (id, account_id, name, ${AUDIT_CREATE})
       VALUES (${sqlString(id)}, ${sqlString(input.accountId)}, ${sqlString(input.name)}, ${auditCreateValues(actor, now)})`
    )
  } catch (e) {
    throw duplicateOr(e, "department", input.name)
  }
  await logActivity(cfg, guard.databaseId, actor, {
    type: "created",
    description: `Added the department ${input.name}`,
    relatedTable: "client_departments",
    relatedRowId: id,
  })
  return { id }
}

export async function updateDepartment(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { id: string; name: string }
): Promise<void> {
  assertAccountInScope(scope, await ownerOf(cfg, guard, "client_departments", input.id))
  const now = new Date().toISOString()
  try {
    await d1Query(
      cfg,
      guard.databaseId,
      `UPDATE client_departments SET name = ${sqlString(input.name)}, ${auditEditSet(actor, now)}
        WHERE id = ${sqlString(input.id)}`
    )
  } catch (e) {
    throw duplicateOr(e, "department", input.name)
  }
  await logActivity(cfg, guard.databaseId, actor, {
    type: "updated",
    description: `Renamed a department to ${input.name}`,
    relatedTable: "client_departments",
    relatedRowId: input.id,
  })
}

/** R17 — the current-status predicate rides the UPDATE, so a second click moves
 * zero rows, writes no activity row and pings nobody. */
export async function setDepartmentActive(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { id: string; active: boolean }
): Promise<{ moved: boolean; accountId: string }> {
  const accountId = await ownerOf(cfg, guard, "client_departments", input.id)
  assertAccountInScope(scope, accountId)
  const now = new Date().toISOString()
  const set = input.active
    ? "deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL, deactivator_name = NULL"
    : `deactivated_at = ${sqlString(now)}, deactivator_id = ${sqlString(actor.id)}, deactivator_email = ${sqlString(actor.email)}, deactivator_name = ${sqlString(actor.name)}`
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `UPDATE client_departments SET ${set}
      WHERE id = ${sqlString(input.id)}
        AND deactivated_at IS ${input.active ? "NOT NULL" : "NULL"};
     SELECT changes() AS n`
  )
  const moved = Number(rows[0]?.n) > 0
  if (moved)
    await logActivity(cfg, guard.databaseId, actor, {
    type: input.active ? "reactivated" : "deactivated",
    description: input.active ? "Brought a department back" : "Switched a department off",
    relatedTable: "client_departments",
    relatedRowId: input.id,
  })
  return { moved, accountId }
}

/* ---------------------------------- roles ---------------------------------- */

/** Every role of the clients this caller may see, with the departments it sits
 * in and the people holding it.
 *
 * THREE STATEMENTS, NOT ONE PER ROLE. The joins are read in full and stitched in
 * memory — a role has a handful of each, and a query per row is the shape that
 * makes a screen with forty roles cost forty-one round trips. */
export async function listRoles(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  accountId?: string | null
): Promise<ClientRole[]> {
  const fence = accountScopeClause(scope, "r.account_id")
  const where = [fence.sql, accountId ? `r.account_id = ${sqlString(accountId)}` : ""]
    .filter(Boolean)
    .join(" AND ")
  const roles = await d1Query<{
    id: string
    account_id: string
    name: string
    cents_per_hour: number | null
    deactivated_at: string | null
  }>(
    cfg,
    guard.databaseId,
    // R14 hard cap.
    `SELECT r.id, r.account_id, r.name, r.cents_per_hour, r.deactivated_at
       FROM client_roles r
      ${where ? `WHERE ${where}` : ""}
      ORDER BY (r.deactivated_at IS NOT NULL), r.name
      LIMIT ${LIST_HARD_CAP}`
  )
  if (!roles.length) return []
  const ids = roles.map((r) => sqlString(r.id)).join(", ")
  const [depts, people] = await Promise.all([
    d1Query<{ role_id: string; department_id: string }>(
      cfg,
      guard.databaseId,
      `SELECT role_id, department_id FROM client_role_departments WHERE role_id IN (${ids})`
    ),
    d1Query<{ role_id: string; person_account_id: string }>(
      cfg,
      guard.databaseId,
      `SELECT role_id, person_account_id FROM client_role_people WHERE role_id IN (${ids})`
    ),
  ])
  const byRole = <T extends { role_id: string }>(rows: T[], pick: (r: T) => string) => {
    const map = new Map<string, string[]>()
    for (const row of rows) map.set(row.role_id, [...(map.get(row.role_id) ?? []), pick(row)])
    return map
  }
  const deptMap = byRole(depts, (d) => d.department_id)
  const peopleMap = byRole(people, (p) => p.person_account_id)
  return roles.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    name: r.name,
    centsPerHour: r.cents_per_hour == null ? null : Number(r.cents_per_hour),
    active: r.deactivated_at == null,
    departmentIds: deptMap.get(r.id) ?? [],
    peopleIds: peopleMap.get(r.id) ?? [],
  }))
}

export async function countRoles(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  accountId?: string | null
): Promise<number> {
  const fence = accountScopeClause(scope, "account_id")
  const where = [fence.sql, accountId ? `account_id = ${sqlString(accountId)}` : ""]
    .filter(Boolean)
    .join(" AND ")
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM client_roles ${where ? `WHERE ${where}` : ""}`
  )
  return Number(rows[0]?.n) || 0
}

export async function createRole(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { accountId: string; name: string; centsPerHour: number | null; departmentIds: string[] }
): Promise<{ id: string }> {
  assertAccountInScope(scope, input.accountId)
  const id = ulid()
  const now = new Date().toISOString()
  try {
    await d1Query(
      cfg,
      guard.databaseId,
      `INSERT INTO client_roles (id, account_id, name, cents_per_hour, ${AUDIT_CREATE})
       VALUES (${sqlString(id)}, ${sqlString(input.accountId)}, ${sqlString(input.name)},
               ${input.centsPerHour == null ? "NULL" : Math.round(input.centsPerHour)},
               ${auditCreateValues(actor, now)})`
    )
  } catch (e) {
    throw duplicateOr(e, "role", input.name)
  }
  await setRoleDepartments(cfg, guard, scope, actor, { id, departmentIds: input.departmentIds })
  await logActivity(cfg, guard.databaseId, actor, {
    type: "created",
    description: `Added the role ${input.name}`,
    relatedTable: "client_roles",
    relatedRowId: id,
  })
  return { id }
}

export async function updateRole(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { id: string; name: string; centsPerHour: number | null }
): Promise<void> {
  assertAccountInScope(scope, await ownerOf(cfg, guard, "client_roles", input.id))
  const now = new Date().toISOString()
  try {
    await d1Query(
      cfg,
      guard.databaseId,
      `UPDATE client_roles
          SET name = ${sqlString(input.name)},
              cents_per_hour = ${input.centsPerHour == null ? "NULL" : Math.round(input.centsPerHour)},
              ${auditEditSet(actor, now)}
        WHERE id = ${sqlString(input.id)}`
    )
  } catch (e) {
    throw duplicateOr(e, "role", input.name)
  }
  await logActivity(cfg, guard.databaseId, actor, {
    type: "updated",
    description: `Updated the role ${input.name}`,
    relatedTable: "client_roles",
    relatedRowId: input.id,
  })
}

/** THE WHOLE SET AT ONCE, because "which departments is this role in" is one
 * decision on one form and sending it as adds and removes lets a half-applied
 * form leave a role somewhere the person just unticked. */
export async function setRoleDepartments(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { id: string; departmentIds: string[] }
): Promise<void> {
  assertAccountInScope(scope, await ownerOf(cfg, guard, "client_roles", input.id))
  const now = new Date().toISOString()
  const wanted = [...new Set(input.departmentIds)]
  // Every department named must belong to the SAME client as the role, or a
  // role could be filed under another company's department.
  if (wanted.length) {
    const owned = await d1Query<{ id: string }>(
      cfg,
      guard.databaseId,
      `SELECT d.id FROM client_departments d
         JOIN client_roles r ON r.account_id = d.account_id
        WHERE r.id = ${sqlString(input.id)}
          AND d.id IN (${wanted.map(sqlString).join(", ")})`
    )
    if (owned.length !== wanted.length)
      throw new GuardError(400, "invalid_input", "One of those departments isn't this client's.")
  }
  const rows = wanted
    .map(
      (d) =>
        `INSERT OR IGNORE INTO client_role_departments (id, role_id, department_id, ${AUDIT_CREATE})
         VALUES (${sqlString(ulid())}, ${sqlString(input.id)}, ${sqlString(d)}, ${auditCreateValues(actor, now)});`
    )
    .join("\n")
  await d1Query(
    cfg,
    guard.databaseId,
    `DELETE FROM client_role_departments WHERE role_id = ${sqlString(input.id)}
       ${wanted.length ? `AND department_id NOT IN (${wanted.map(sqlString).join(", ")})` : ""};
     ${rows}`
  )
}

export async function setRoleActive(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { id: string; active: boolean }
): Promise<{ moved: boolean; accountId: string }> {
  const accountId = await ownerOf(cfg, guard, "client_roles", input.id)
  assertAccountInScope(scope, accountId)
  const now = new Date().toISOString()
  const set = input.active
    ? "deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL, deactivator_name = NULL"
    : `deactivated_at = ${sqlString(now)}, deactivator_id = ${sqlString(actor.id)}, deactivator_email = ${sqlString(actor.email)}, deactivator_name = ${sqlString(actor.name)}`
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `UPDATE client_roles SET ${set}
      WHERE id = ${sqlString(input.id)}
        AND deactivated_at IS ${input.active ? "NOT NULL" : "NULL"};
     SELECT changes() AS n`
  )
  const moved = Number(rows[0]?.n) > 0
  if (moved)
    await logActivity(cfg, guard.databaseId, actor, {
    type: input.active ? "reactivated" : "deactivated",
    description: input.active ? "Brought a role back" : "Switched a role off",
    relatedTable: "client_roles",
    relatedRowId: input.id,
  })
  return { moved, accountId }
}

/** WHO HOLDS THIS ROLE — a contact we already have, never a new person record.
 *
 * "Loose linking" is the owner's ruling (24 Aug 2026): the person does not have
 * to be a contact ON that client, because it is a viewable relationship rather
 * than an assertion about employment. So this checks the person is an account
 * the CALLER may see, and stops there. */
export async function setRolePerson(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { id: string; personAccountId: string; attached: boolean }
): Promise<{ accountId: string }> {
  const accountId = await ownerOf(cfg, guard, "client_roles", input.id)
  assertAccountInScope(scope, accountId)
  const now = new Date().toISOString()
  if (input.attached) {
    // THROUGH THE SPINE'S OWN DOOR, never a SELECT of our own. `lib/accounts.ts`
    // owns every statement against `accounts`, so "was this query fenced?" has
    // one place to look — and this call is better than the raw existence check
    // it replaces, because `getAccountRow` applies the caller's scope: a person
    // they cannot see is a person they cannot attach.
    await getAccountRow(cfg, guard, scope, input.personAccountId)
    await d1Query(
      cfg,
      guard.databaseId,
      `INSERT OR IGNORE INTO client_role_people (id, role_id, person_account_id, ${AUDIT_CREATE})
       VALUES (${sqlString(ulid())}, ${sqlString(input.id)}, ${sqlString(input.personAccountId)}, ${auditCreateValues(actor, now)})`
    )
  } else {
    await d1Query(
      cfg,
      guard.databaseId,
      `DELETE FROM client_role_people
        WHERE role_id = ${sqlString(input.id)} AND person_account_id = ${sqlString(input.personAccountId)}`
    )
  }
  return { accountId }
}

/* ---------------------------------- tools ---------------------------------- */

/** Every tool of the clients this caller may see, each carrying the price in
 * force ON A GIVEN DAY.
 *
 * `asOf` is the whole reason prices are a table. A map set to 1 March must read
 * March's price — "€240, the price on that date" — so the price is not a column
 * on the tool but the newest row on or before the day being asked about. */
export async function listTools(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  opts: { accountId?: string | null; asOf?: string | null } = {}
): Promise<ClientTool[]> {
  const fence = accountScopeClause(scope, "t.account_id")
  const where = [fence.sql, opts.accountId ? `t.account_id = ${sqlString(opts.accountId)}` : ""]
    .filter(Boolean)
    .join(" AND ")
  const day = opts.asOf || new Date().toISOString().slice(0, 10)
  const rows = await d1Query<{
    id: string
    account_id: string
    name: string
    mark: string | null
    deactivated_at: string | null
    cents: number | null
    billing_period: string | null
    effective_on: string | null
  }>(
    cfg,
    guard.databaseId,
    // The correlated sub-select is the dated read: the newest price on or before
    // the day. R14 hard cap on the outer list.
    `SELECT t.id, t.account_id, t.name, t.mark, t.deactivated_at,
            p.cents, p.billing_period, p.effective_on
       FROM client_tools t
       LEFT JOIN client_tool_prices p
              ON p.id = (SELECT p2.id FROM client_tool_prices p2
                          WHERE p2.tool_id = t.id AND p2.effective_on <= ${sqlString(day)}
                          ORDER BY p2.effective_on DESC LIMIT 1)
      ${where ? `WHERE ${where}` : ""}
      ORDER BY (t.deactivated_at IS NOT NULL), t.name
      LIMIT ${LIST_HARD_CAP}`
  )
  return rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    name: r.name,
    mark: r.mark ?? null,
    active: r.deactivated_at == null,
    cents: r.cents == null ? null : Number(r.cents),
    billingPeriod: (r.billing_period as "month" | "year" | null) ?? null,
    effectiveOn: r.effective_on ?? null,
  }))
}

export async function countTools(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  accountId?: string | null
): Promise<number> {
  const fence = accountScopeClause(scope, "account_id")
  const where = [fence.sql, accountId ? `account_id = ${sqlString(accountId)}` : ""]
    .filter(Boolean)
    .join(" AND ")
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `SELECT COUNT(*) AS n FROM client_tools ${where ? `WHERE ${where}` : ""}`
  )
  return Number(rows[0]?.n) || 0
}

/** What this tool has cost over time, newest first — the record behind the one
 * number a map shows. */
export async function listToolPrices(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  toolId: string
): Promise<ClientToolPrice[]> {
  assertAccountInScope(scope, await ownerOf(cfg, guard, "client_tools", toolId))
  const rows = await d1Query<{
    id: string
    tool_id: string
    cents: number
    billing_period: string
    effective_on: string
  }>(
    cfg,
    guard.databaseId,
    // R14 hard cap — a price history is short, but "short" is not a bound.
    `SELECT id, tool_id, cents, billing_period, effective_on
       FROM client_tool_prices WHERE tool_id = ${sqlString(toolId)}
      ORDER BY effective_on DESC LIMIT ${LIST_HARD_CAP}`
  )
  return rows.map((r) => ({
    id: r.id,
    toolId: r.tool_id,
    cents: Number(r.cents),
    billingPeriod: r.billing_period as "month" | "year",
    effectiveOn: r.effective_on,
  }))
}

export async function createTool(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { accountId: string; name: string; mark: string | null }
): Promise<{ id: string }> {
  assertAccountInScope(scope, input.accountId)
  const id = ulid()
  const now = new Date().toISOString()
  try {
    await d1Query(
      cfg,
      guard.databaseId,
      `INSERT INTO client_tools (id, account_id, name, mark, ${AUDIT_CREATE})
       VALUES (${sqlString(id)}, ${sqlString(input.accountId)}, ${sqlString(input.name)},
               ${input.mark == null ? "NULL" : sqlString(input.mark)}, ${auditCreateValues(actor, now)})`
    )
  } catch (e) {
    throw duplicateOr(e, "tool", input.name)
  }
  await logActivity(cfg, guard.databaseId, actor, {
    type: "created",
    description: `Added the tool ${input.name}`,
    relatedTable: "client_tools",
    relatedRowId: id,
  })
  return { id }
}

export async function updateTool(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { id: string; name: string; mark: string | null }
): Promise<void> {
  assertAccountInScope(scope, await ownerOf(cfg, guard, "client_tools", input.id))
  const now = new Date().toISOString()
  try {
    await d1Query(
      cfg,
      guard.databaseId,
      `UPDATE client_tools
          SET name = ${sqlString(input.name)},
              mark = ${input.mark == null ? "NULL" : sqlString(input.mark)},
              ${auditEditSet(actor, now)}
        WHERE id = ${sqlString(input.id)}`
    )
  } catch (e) {
    throw duplicateOr(e, "tool", input.name)
  }
  await logActivity(cfg, guard.databaseId, actor, {
    type: "updated",
    description: `Updated the tool ${input.name}`,
    relatedTable: "client_tools",
    relatedRowId: input.id,
  })
}

/** A PRICE IS SET FROM A DAY, and setting one for a day that already has a price
 * REPLACES it — a person correcting a typo means "this is what it was", not
 * "here is a second truth about the same morning". Any other day is a new row,
 * which is what makes the history a history. */
export async function setToolPrice(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { toolId: string; cents: number; billingPeriod: "month" | "year"; effectiveOn: string }
): Promise<{ accountId: string }> {
  const accountId = await ownerOf(cfg, guard, "client_tools", input.toolId)
  assertAccountInScope(scope, accountId)
  const now = new Date().toISOString()
  await d1Query(
    cfg,
    guard.databaseId,
    `DELETE FROM client_tool_prices
       WHERE tool_id = ${sqlString(input.toolId)} AND effective_on = ${sqlString(input.effectiveOn)};
     INSERT INTO client_tool_prices (id, tool_id, cents, billing_period, effective_on, ${AUDIT_CREATE})
     VALUES (${sqlString(ulid())}, ${sqlString(input.toolId)}, ${Math.round(input.cents)},
             ${sqlString(input.billingPeriod)}, ${sqlString(input.effectiveOn)}, ${auditCreateValues(actor, now)})`
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: "updated",
    description: `Set a price from ${input.effectiveOn}`,
    relatedTable: "client_tools",
    relatedRowId: input.toolId,
  })
  return { accountId }
}

export async function setToolActive(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  actor: Actor,
  input: { id: string; active: boolean }
): Promise<{ moved: boolean; accountId: string }> {
  const accountId = await ownerOf(cfg, guard, "client_tools", input.id)
  assertAccountInScope(scope, accountId)
  const now = new Date().toISOString()
  const set = input.active
    ? "deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL, deactivator_name = NULL"
    : `deactivated_at = ${sqlString(now)}, deactivator_id = ${sqlString(actor.id)}, deactivator_email = ${sqlString(actor.email)}, deactivator_name = ${sqlString(actor.name)}`
  const rows = await d1Query<{ n: number }>(
    cfg,
    guard.databaseId,
    `UPDATE client_tools SET ${set}
      WHERE id = ${sqlString(input.id)}
        AND deactivated_at IS ${input.active ? "NOT NULL" : "NULL"};
     SELECT changes() AS n`
  )
  const moved = Number(rows[0]?.n) > 0
  if (moved)
    await logActivity(cfg, guard.databaseId, actor, {
    type: input.active ? "reactivated" : "deactivated",
    description: input.active ? "Brought a tool back" : "Switched a tool off",
    relatedTable: "client_tools",
    relatedRowId: input.id,
  })
  return { moved, accountId }
}

/* --------------------------------- errors ---------------------------------- */

/** A UNIQUE-INDEX COLLISION IS A SENTENCE, NOT A 500. The partial index means
 * two live rows cannot share a name, and the person who typed the second one
 * should be told which word is taken rather than shown "something went wrong". */
function duplicateOr(e: unknown, what: string, name: string): unknown {
  const message = e instanceof Error ? e.message : ""
  if (/UNIQUE constraint failed/i.test(message))
    return new GuardError(409, "duplicate", `There's already a ${what} called ${name}.`)
  return e
}
