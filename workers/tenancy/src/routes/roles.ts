// Role routes: the caller's own rights (page guard), the team's roles, create /
// rename a role, and read / save a role's permission matrix. Locked rules
// (Admin is locked, auto-flip-read) live in lib/roles.

import { fail, json } from "@shared/workers/http"
import { csvResponse, exportTooLarge, toCsv } from "@shared/workers/csv"
import { LIST_HARD_CAP, MAX_ROLES_PER_TEAM } from "@shared/workers/limits"
import { optionalText, queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { listRoles, countRoles } from "../lib/members"
import { TEAM_MODULE_CATALOG } from "../team-schema"
import { requireRight } from "../lib/permissions"
import {
  createRole,
  getMyPermissions,
  getRolePermissions,
  setRoleActive,
  setRolePermissions,
  updateRole,
  type PermissionValue,
  buildPermissionValue,
  listAllRolePermissions,
  listRoleAudit,
} from "../lib/roles"
import { teamContext } from "../context"
import type { Env } from "../env"

export async function getMyPerms(request: Request, env: Env): Promise<Response> {
  // Your OWN rights for the active team — no requireRight (it's about you).
  const { cfg, guard } = await teamContext(request, env)
  return json({ permissions: await getMyPermissions(cfg, guard) })
}

export async function getRoles(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "member_roles", "read")
  const roles = await listRoles(env, cfg, guard)
  const id = queryText(new URL(request.url).searchParams.get("id"), "Id") // ?id= → one role
  // R16: every list response carries the exact server total — badges never use rows.length.
  return json({ roles: id ? roles.filter((r) => r.id === id) : roles, total: await countRoles(cfg, guard) })
}

/** GET /api/tenancy/roles/export — the team's roles as a CSV download carrying
 * EVERY captured field (the owner's export rule): the role row, the FULL
 * permission matrix flattened to one `<module>.<right>` yes/no column each
 * (spreadsheet-filterable), and the whole audit block. The cross-cutting rule:
 * EXPORT NEEDS READ (import needs create). Team-bound by construction
 * (teamContext → the caller's own team database). Leading columns still match
 * the import format (title, description) so the file round-trips.
 *
 * AND IT IS WHOLE, OR IT IS AN ERROR — the accounts door's rule, and this door
 * needed it more than any other. Three reads sit behind one file here, and two of
 * them could truncate: the role rows came back on the SCREEN cap (a thousand,
 * because the export borrowed the list reader), and the permission sheet is roles
 * × modules. The second one is the dangerous half. `buildPermissionValue` renders
 * a role with no rows as every right OFF, and the columns lead with the import
 * format — so a short file was not merely missing roles, it was an instruction to
 * REVOKE the ones it kept. Refused now, at the door, before a single line is
 * written: the exact server count against what the list returned, and the
 * permission read's own `complete`. */
export async function getRolesExport(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "member_roles", "read")
  const [roles, audit, perms, total] = await Promise.all([
    listRoles(env, cfg, guard),
    listRoleAudit(cfg, guard),
    listAllRolePermissions(cfg, guard),
    // R16's exact COUNT(*), read here as a COMPLETENESS signal: more roles in the
    // table than the capped list returned means the file would be short. It also
    // covers the audit read, whose ceiling is ten times the list's — if the roles
    // fit, the audit fit.
    countRoles(cfg, guard),
  ])
  if (total > roles.length || !perms.complete)
    return exportTooLarge(
      Math.min(total, LIST_HARD_CAP),
      "roles",
      "Retire the roles you no longer use, or read the Roles screen instead, a file this size would import back as a permission change nobody asked for."
    )
  const permsByRole = perms.byRole
  const auditBy = new Map(audit.map((a) => [a.id, a]))
  const RIGHTS = ["read", "create", "edit", "delete"] as const
  const header = [
    "title",
    "description",
    "active",
    "members",
    ...TEAM_MODULE_CATALOG.flatMap((m) => RIGHTS.map((rt) => `${m.key}.${rt}`)),
    "created_at",
    "created_by",
    "updated_at",
    "updated_by",
    "deactivated_at",
    "deactivated_by",
  ]
  const rows = roles.map((r) => {
    const a = auditBy.get(r.id)
    const value = permsByRole.get(r.id) ?? buildPermissionValue([])
    return [
      r.title,
      r.description,
      r.active,
      r.memberCount,
      ...TEAM_MODULE_CATALOG.flatMap((m) => RIGHTS.map((rt) => value[m.key]?.[rt] ?? false)),
      a?.created_at,
      a?.creator_name,
      a?.updated_at,
      a?.editor_name,
      a?.deactivated_at,
      a?.deactivator_name,
    ]
  })
  return csvResponse("member-roles.csv", toCsv(header, rows))
}

export async function getRolePerms(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "member_roles", "read")
  const roleId = queryText(new URL(request.url).searchParams.get("roleId"), "Role")
  if (!roleId) return fail(400, "invalid_input", "roleId is required.")
  return json(await getRolePermissions(cfg, guard, roleId))
}

export async function postRolePerms(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "member_roles", "edit")
  const body = (await request.json().catch(() => ({}))) as {
    roleId?: string
    value?: PermissionValue
  }
  const roleId = requireText(body.roleId, "Role", TEXT_LIMITS.short)
  // The matrix must be an OBJECT, not merely truthy: a string or a number here
  // would sail past `!body.value` and reach the permission writer as rubbish.
  if (typeof body.value !== "object" || body.value === null)
    return fail(400, "invalid_input", "roleId and value are required.")
  await setRolePermissions(cfg, guard, actor, roleId, body.value)
  await publishChange(env, guard.teamId, "member_roles", roleId)
  return json({ ok: true })
}

export async function postCreateRole(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "member_roles", "create")
  const body = (await request.json().catch(() => ({}))) as {
    title?: string
    description?: string
    permissions?: PermissionValue
  }
  const title = requireText(body.title, "Name", TEXT_LIMITS.short)
  // CAP THE DOOR. Every read of `member_roles` is bounded (R14), and every one of
  // those bounds was a promise about a table with no ceiling at the other end: a
  // role is one row here, a row per module in `role_permissions`, and an entry in
  // the title lookup the members list and the invitations list each do on open.
  // An uncapped create door is how an ordinary `member_roles:create` grant sets
  // the size of somebody else's screen — and the roles CSV export, which reads
  // roles × modules, is where it lands first. Counted exactly, through the seam
  // the count badge already uses.
  if ((await countRoles(cfg, guard)) >= MAX_ROLES_PER_TEAM)
    return fail(
      403,
      "role_limit",
      `This team already has ${MAX_ROLES_PER_TEAM} roles, which is the limit. Retire one you no longer use and try again.`
    )
  // Creating WITH a permission matrix (the import round-trip / a matrix-carrying
  // CSV) is create + edit in one move, so it demands BOTH rights — the same gate
  // setting a matrix on the Roles screen goes through. A plain create is unchanged.
  const withMatrix = typeof body.permissions === "object" && body.permissions !== null
  if (withMatrix) await requireRight(cfg, guard, "member_roles", "edit")
  const roleId = await createRole(cfg, guard, actor, title, (optionalText(body.description, "Description", TEXT_LIMITS.long) ?? ""))
  if (withMatrix) await setRolePermissions(cfg, guard, actor, roleId, body.permissions as PermissionValue)
  // Row-level: carry the new role's id so open role lists patch just that row.
  await publishChange(env, guard.teamId, "member_roles", roleId, "add")
  return json({ roles: await listRoles(env, cfg, guard), total: await countRoles(cfg, guard) })
}

export async function postUpdateRole(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "member_roles", "edit")
  const body = (await request.json().catch(() => ({}))) as {
    roleId?: string
    title?: string
    description?: string
  }
  const roleId = requireText(body.roleId, "Role", TEXT_LIMITS.short)
  const title = requireText(body.title, "Name", TEXT_LIMITS.short)
  await updateRole(cfg, guard, actor, roleId, title, (optionalText(body.description, "Description", TEXT_LIMITS.long) ?? ""))
  await publishChange(env, guard.teamId, "member_roles", roleId)
  return json({ roles: await listRoles(env, cfg, guard), total: await countRoles(cfg, guard) })
}

/** Deactivate / reactivate a role — never deleted (holders keep access). Gated
 * by member_roles:delete (deactivate is our "delete" in the deactivate-only model). */
export async function postSetRoleActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard } = await teamContext(request, env)
  await requireRight(cfg, guard, "member_roles", "delete")
  const body = (await request.json().catch(() => ({}))) as {
    roleId?: string
    active?: boolean
  }
  const roleId = requireText(body.roleId, "Role", TEXT_LIMITS.short)
  if (typeof body.active !== "boolean")
    return fail(400, "invalid_input", "roleId and active are required.")
  // R17: a repeat (double click / retry) moves zero rows — then nothing is
  // published and no duplicate history exists; the response is still the list.
  const changed = await setRoleActive(cfg, guard, actor, roleId, body.active)
  if (changed) await publishChange(env, guard.teamId, "member_roles", roleId)
  return json({ roles: await listRoles(env, cfg, guard), total: await countRoles(cfg, guard) })
}
