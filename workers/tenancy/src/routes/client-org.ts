// THE CLIENT'S OWN ORGANISATION — the doors. Departments, roles, the people
// holding them, and the tools they use.
//
// EVERY DOOR HERE IS OPEN TO A CLIENT LOGIN, deliberately, and that is the one
// thing to read carefully. R21's usual answer is `refusePortalCaller`; here the
// owner ruled the other way in round two, ticking all four: a contact sees "the
// departments and roles we recorded for them", "the people we have listed
// against each role", "their tools and what those tools cost" and their waves.
//
// So these doors resolve the ACCOUNT FENCE instead of refusing — `callerScope`
// on every one, handed to every read and every write, and the lib asserts the
// record's own account is inside that scope before it writes. Staff see every
// client; a contact sees their own company and nothing else. The fence is the
// permission here, which is why it is never optional and never defaulted.
//
// WHAT A CLIENT STILL DOES NOT SEE: the history. Every activity row here names
// the staff member who made the change, and a role's carries what an hour costs
// — costs that sit side by side across one company. Both are withheld by
// PORTAL_ACTIVITY_FENCE, which says why at length.
//
// THE MODULE IS `processes`, because that is the only reason any of this exists:
// a role carries an hourly cost so a step's minutes can become money, and a tool
// carries a price so a step that replaces it can be subtracted. Whoever may read
// a client's process map is exactly whoever may read its cast list.

import { json } from "@shared/workers/http"
import { publishChange } from "@shared/workers/realtime"
import { accountScope, type AccountScope } from "@shared/workers/account-scope"
import { gated, gatedBody } from "@shared/workers/route"
import { queryText, requireText, optionalText, TEXT_LIMITS } from "@shared/workers/validate"
import { GuardError, type MemberGuard } from "../lib/permissions"
import type { D1Rest } from "@shared/workers/d1-rest"
import {
  countDepartments,
  countRoles,
  countTools,
  createDepartment,
  createRole,
  createTool,
  listDepartments,
  listRoles,
  listToolPrices,
  listTools,
  setDepartmentActive,
  setRoleActive,
  setRoleDepartments,
  setRolePerson,
  setToolActive,
  setToolPrice,
  updateDepartment,
  updateRole,
  updateTool,
} from "../lib/client-org"
import type { Env } from "../env"

/** The caller's account world — which clients they may see. A `function`
 * declaration on purpose: the portal-fence walk follows route-local helpers by
 * reading function declarations off disk, and a helper it cannot see through is
 * a fence it cannot prove. */
async function callerScope(cfg: D1Rest, guard: MemberGuard): Promise<AccountScope> {
  return accountScope(cfg, guard)
}

/** WHICH CLIENT, off the query string — optional, because staff read the whole
 * estate on the collection screens and one client on a client's screen. */
function accountFilter(request: Request): string | null {
  return queryText(new URL(request.url).searchParams.get("accountId"), "Client") || null
}

/** MONEY, from a value a caller has ALREADY had type-checked at the read.
 *
 * R20 is POSITIONAL — a body field must sit where something is visibly checking
 * it, at the read, and a helper of ours is invisible to that census. Rightly so:
 * a helper can be rewritten without a single call site changing, which is
 * exactly the shape that lets a check quietly stop happening. So every door
 * below does its own `typeof` / `Number()` / `Array.isArray` on the body, and
 * these take a value whose type is already known.
 *
 * `null` is a real answer for a ROLE and means "not known yet". It is not the
 * same as zero, which would read as "this person is free" and would come out of
 * the arithmetic as a saving of nothing with nothing to say it was missing. */
function cents(n: number, field: string): number {
  if (!Number.isFinite(n) || n < 0)
    throw new GuardError(400, "invalid_input", `${field} has to be a number, and never less than zero.`)
  return Math.round(n)
}

/** A DAY, as YYYY-MM-DD, from text that has already been through `requireText`.
 * A price is filed under the day it started being true, so a map set to March
 * reads March's price — which only works if every row carries the same shape. */
function asDay(text: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text))
    throw new GuardError(400, "invalid_input", `${field} has to be a date, like 2026-03-01.`)
  return text
}

/** Every element of an ALREADY-CHECKED array through the text validator, so a
 * number or an object inside the list is a clean 400 rather than something that
 * reaches a statement. */
function ids(list: unknown[], field: string): string[] {
  return list.map((v) => requireText(v, field, TEXT_LIMITS.short))
}

/* ------------------------------- departments ------------------------------- */

/** GET /api/tenancy/client/departments?accountId= */
export async function getDepartments(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "processes", "read")
  const scope = await callerScope(cfg, guard)
  const accountId = accountFilter(request)
  // These are independent reads — one wait, not 2.
  const [departments, total] = await Promise.all([
    listDepartments(cfg, guard, scope, accountId),
    // R16: the badge shows the door's exact COUNT(*), never the list's length.
    countDepartments(cfg, guard, scope, accountId),
  ])
  return json({ departments, total })
}

/** POST /api/tenancy/client/departments */
export async function postCreateDepartment(request: Request, env: Env): Promise<Response> {
  const { cfg, guard, actor, body } = await gatedBody<{ accountId?: unknown; name?: unknown }>(
    request,
    env,
    "processes",
    "create"
  )
  const scope = await callerScope(cfg, guard)
  const accountId = requireText(body.accountId, "Client", TEXT_LIMITS.short)
  const name = requireText(body.name, "Name", TEXT_LIMITS.short)
  const { id } = await createDepartment(cfg, guard, scope, actor, { accountId, name })
  await publishChange(env, guard.teamId, "client_departments", id, "add", accountId)
  return json({ id })
}

/** POST /api/tenancy/client/departments/update */
export async function postUpdateDepartment(request: Request, env: Env): Promise<Response> {
  const { cfg, guard, actor, body } = await gatedBody<{ id?: unknown; name?: unknown }>(
    request,
    env,
    "processes",
    "edit"
  )
  const scope = await callerScope(cfg, guard)
  const id = requireText(body.id, "Id", TEXT_LIMITS.short)
  const name = requireText(body.name, "Name", TEXT_LIMITS.short)
  await updateDepartment(cfg, guard, scope, actor, { id, name })
  await publishChange(env, guard.teamId, "client_departments", id, "edit")
  return json({ ok: true })
}

/** POST /api/tenancy/client/departments/active */
export async function postDepartmentActive(request: Request, env: Env): Promise<Response> {
  const { cfg, guard, actor, body } = await gatedBody<{ id?: unknown; active?: unknown }>(
    request,
    env,
    "processes",
    "delete"
  )
  const scope = await callerScope(cfg, guard)
  const id = requireText(body.id, "Id", TEXT_LIMITS.short)
  const active = body.active === true
  const { moved, accountId } = await setDepartmentActive(cfg, guard, scope, actor, { id, active })
  // R17: zero rows moved = nothing happened, so nothing is announced.
  if (moved) await publishChange(env, guard.teamId, "client_departments", id, "edit", accountId)
  return json({ ok: true, moved })
}

/* ---------------------------------- roles ---------------------------------- */

/** GET /api/tenancy/client/roles?accountId= */
export async function getClientRoles(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "processes", "read")
  const scope = await callerScope(cfg, guard)
  const accountId = accountFilter(request)
  // These are independent reads — one wait, not 2.
  const [roles, total] = await Promise.all([
    listRoles(cfg, guard, scope, accountId),
    countRoles(cfg, guard, scope, accountId),
  ])
  return json({ roles, total })
}

/** POST /api/tenancy/client/roles */
export async function postCreateClientRole(request: Request, env: Env): Promise<Response> {
  const { cfg, guard, actor, body } = await gatedBody<{
    accountId?: unknown
    name?: unknown
    centsPerHour?: unknown
    departmentIds?: unknown
  }>(request, env, "processes", "create")
  const scope = await callerScope(cfg, guard)
  const accountId = requireText(body.accountId, "Client", TEXT_LIMITS.short)
  const name = requireText(body.name, "Name", TEXT_LIMITS.short)
  const centsPerHour =
    typeof body.centsPerHour === "number" ? cents(body.centsPerHour, "Cost an hour") : null
  const departmentIds = Array.isArray(body.departmentIds) ? ids(body.departmentIds, "Departments") : []
  const { id } = await createRole(cfg, guard, scope, actor, {
    accountId,
    name,
    centsPerHour,
    departmentIds,
  })
  await publishChange(env, guard.teamId, "client_roles", id, "add", accountId)
  return json({ id })
}

/** POST /api/tenancy/client/roles/update */
export async function postUpdateClientRole(request: Request, env: Env): Promise<Response> {
  const { cfg, guard, actor, body } = await gatedBody<{
    id?: unknown
    name?: unknown
    centsPerHour?: unknown
    departmentIds?: unknown
  }>(request, env, "processes", "edit")
  const scope = await callerScope(cfg, guard)
  const id = requireText(body.id, "Id", TEXT_LIMITS.short)
  const name = requireText(body.name, "Name", TEXT_LIMITS.short)
  const centsPerHour =
    typeof body.centsPerHour === "number" ? cents(body.centsPerHour, "Cost an hour") : null
  await updateRole(cfg, guard, scope, actor, { id, name, centsPerHour })
  // The departments are part of the same form, so they are part of the same
  // save — sending them separately is how a half-applied form leaves a role
  // filed somewhere the person just unticked.
  if (Array.isArray(body.departmentIds))
    await setRoleDepartments(cfg, guard, scope, actor, {
      id,
      departmentIds: ids(body.departmentIds, "Departments"),
    })
  await publishChange(env, guard.teamId, "client_roles", id, "edit")
  return json({ ok: true })
}

/** POST /api/tenancy/client/roles/people — attach or detach one person. */
export async function postClientRolePerson(request: Request, env: Env): Promise<Response> {
  const { cfg, guard, actor, body } = await gatedBody<{
    id?: unknown
    personAccountId?: unknown
    attached?: unknown
  }>(request, env, "processes", "edit")
  const scope = await callerScope(cfg, guard)
  const id = requireText(body.id, "Id", TEXT_LIMITS.short)
  const personAccountId = requireText(body.personAccountId, "Person", TEXT_LIMITS.short)
  const attached = body.attached === true
  const { accountId } = await setRolePerson(cfg, guard, scope, actor, {
    id,
    personAccountId,
    attached,
  })
  await publishChange(env, guard.teamId, "client_roles", id, "edit", accountId)
  return json({ ok: true })
}

/** POST /api/tenancy/client/roles/active */
export async function postClientRoleActive(request: Request, env: Env): Promise<Response> {
  const { cfg, guard, actor, body } = await gatedBody<{ id?: unknown; active?: unknown }>(
    request,
    env,
    "processes",
    "delete"
  )
  const scope = await callerScope(cfg, guard)
  const id = requireText(body.id, "Id", TEXT_LIMITS.short)
  const active = body.active === true
  const { moved, accountId } = await setRoleActive(cfg, guard, scope, actor, { id, active })
  if (moved) await publishChange(env, guard.teamId, "client_roles", id, "edit", accountId)
  return json({ ok: true, moved })
}

/* ---------------------------------- tools ---------------------------------- */

/** GET /api/tenancy/client/tools?accountId=&asOf=
 *
 * `asOf` is the whole reason prices are a table rather than a column: a map set
 * to 1 March must read March's price. Absent means today. */
export async function getTools(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "processes", "read")
  const scope = await callerScope(cfg, guard)
  const url = new URL(request.url)
  const accountId = queryText(url.searchParams.get("accountId"), "Client") || null
  const asOf = queryText(url.searchParams.get("asOf"), "Date") || null
  // These are independent reads — one wait, not 2.
  const [tools, total] = await Promise.all([
    listTools(cfg, guard, scope, { accountId, asOf }),
    countTools(cfg, guard, scope, accountId),
  ])
  return json({ tools, total })
}

/** GET /api/tenancy/client/tools/prices?id= — what one tool has cost over time. */
export async function getToolPrices(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "processes", "read")
  const scope = await callerScope(cfg, guard)
  const id = queryText(new URL(request.url).searchParams.get("id"), "Id")
  if (!id) throw new GuardError(400, "invalid_input", "A tool id is required.")
  return json({ prices: await listToolPrices(cfg, guard, scope, id) })
}

/** POST /api/tenancy/client/tools */
export async function postCreateTool(request: Request, env: Env): Promise<Response> {
  const { cfg, guard, actor, body } = await gatedBody<{
    accountId?: unknown
    name?: unknown
    mark?: unknown
  }>(request, env, "processes", "create")
  const scope = await callerScope(cfg, guard)
  const accountId = requireText(body.accountId, "Client", TEXT_LIMITS.short)
  const name = requireText(body.name, "Name", TEXT_LIMITS.short)
  const mark = optionalText(body.mark, "Icon", TEXT_LIMITS.short) ?? null
  const { id } = await createTool(cfg, guard, scope, actor, { accountId, name, mark })
  await publishChange(env, guard.teamId, "client_tools", id, "add", accountId)
  return json({ id })
}

/** POST /api/tenancy/client/tools/update */
export async function postUpdateTool(request: Request, env: Env): Promise<Response> {
  const { cfg, guard, actor, body } = await gatedBody<{
    id?: unknown
    name?: unknown
    mark?: unknown
  }>(request, env, "processes", "edit")
  const scope = await callerScope(cfg, guard)
  const id = requireText(body.id, "Id", TEXT_LIMITS.short)
  const name = requireText(body.name, "Name", TEXT_LIMITS.short)
  const mark = optionalText(body.mark, "Icon", TEXT_LIMITS.short) ?? null
  await updateTool(cfg, guard, scope, actor, { id, name, mark })
  await publishChange(env, guard.teamId, "client_tools", id, "edit")
  return json({ ok: true })
}

/** POST /api/tenancy/client/tools/price — what it costs, from a given day. */
export async function postToolPrice(request: Request, env: Env): Promise<Response> {
  const { cfg, guard, actor, body } = await gatedBody<{
    toolId?: unknown
    cents?: unknown
    billingPeriod?: unknown
    effectiveOn?: unknown
  }>(request, env, "processes", "edit")
  const scope = await callerScope(cfg, guard)
  const toolId = requireText(body.toolId, "Tool", TEXT_LIMITS.short)
  const amount = cents(Number(body.cents), "Cost")
  // R20: an allow-list `.includes` is a checking position; a cast is not.
  const period = requireText(body.billingPeriod, "Billing period", TEXT_LIMITS.short)
  if (!["month", "year"].includes(period))
    throw new GuardError(400, "invalid_input", "A price is per month or per year.")
  const effectiveOn = asDay(requireText(body.effectiveOn, "From", TEXT_LIMITS.short), "From")
  const { accountId } = await setToolPrice(cfg, guard, scope, actor, {
    toolId,
    cents: amount,
    billingPeriod: period as "month" | "year",
    effectiveOn,
  })
  await publishChange(env, guard.teamId, "client_tools", toolId, "edit", accountId)
  return json({ ok: true })
}

/** POST /api/tenancy/client/tools/active */
export async function postToolActive(request: Request, env: Env): Promise<Response> {
  const { cfg, guard, actor, body } = await gatedBody<{ id?: unknown; active?: unknown }>(
    request,
    env,
    "processes",
    "delete"
  )
  const scope = await callerScope(cfg, guard)
  const id = requireText(body.id, "Id", TEXT_LIMITS.short)
  const active = body.active === true
  const { moved, accountId } = await setToolActive(cfg, guard, scope, actor, { id, active })
  if (moved) await publishChange(env, guard.teamId, "client_tools", id, "edit", accountId)
  return json({ ok: true, moved })
}
