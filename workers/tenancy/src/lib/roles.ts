// Roles & permissions module — read and edit a role's permission "tall sheet"
// (role × module × read/create/edit/delete) inside the team's OWN database, and
// create new roles. Locked rules enforced HERE on the server (never just the UI):
//   • the default Admin role can't be edited;
//   • auto-flip-read — turning on any write right (create/edit/delete) forces
//     Read on (you can't have write without read).

import { describeChanges, logActivity, type Actor } from "@shared/workers/activity"
import {
  d1ExecScript,
  d1Query,
  sqlString,
  type D1Rest,
} from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { TEAM_MODULE_CATALOG } from "../team-schema"
import { GuardError, hasRight, type MemberGuard } from "./permissions"
import { EXPORT_HARD_CAP } from "@shared/workers/limits"

/** The four switches for one module (matches the library PermissionMatrix). */
export type RightSet = {
  read: boolean
  create: boolean
  edit: boolean
  delete: boolean
}
/** A whole role's sheet: one RightSet per module key. */
export type PermissionValue = Record<string, RightSet>

type PermRow = {
  module: string
  can_read: number
  can_create: number
  can_edit: number
  can_delete: number
}
type RoleRow = { id: string; title: string; description: string | null; is_default: number }

/** Build a full PermissionValue (every module present; missing DB rows → all-
 * off) from raw permission rows — ONE source for getRolePermissions,
 * getMyPermissions and the CSV export, so they can't shape the value differently. */
export function buildPermissionValue(rows: PermRow[]): PermissionValue {
  const byModule = new Map(rows.map((r) => [r.module, r]))
  const value: PermissionValue = {}
  for (const m of TEAM_MODULE_CATALOG) {
    const r = byModule.get(m.key)
    value[m.key] = {
      read: r?.can_read === 1,
      create: r?.can_create === 1,
      edit: r?.can_edit === 1,
      delete: r?.can_delete === 1,
    }
  }
  return value
}

/** Export-only reader: every role's FULL audit block (the export carries every
 * captured field — the owner's rule). The list type stays lean; this is read
 * only by the CSV export route. */
export type RoleAuditRow = {
  id: string
  created_at: string | null
  creator_name: string | null
  updated_at: string | null
  editor_name: string | null
  deactivated_at: string | null
  deactivator_name: string | null
}
export async function listRoleAudit(cfg: D1Rest, guard: MemberGuard): Promise<RoleAuditRow[]> {
  return d1Query<RoleAuditRow>(
    cfg,
    guard.databaseId,
    // R14 hard cap (export tier). ORDERED, because an unordered cap truncates a
    // DIFFERENT arbitrary set on every call — the roles door refuses past its own
    // ceiling (countRoles vs the list) long before this one bites, and a
    // deterministic tail is what makes that refusal reproducible rather than lucky.
    `SELECT id, created_at, creator_name, updated_at, editor_name, deactivated_at, deactivator_name FROM member_roles ORDER BY id LIMIT ${EXPORT_HARD_CAP}`
  )
}

/** Export-only reader: the whole team's permission sheet in ONE read, shaped into
 * a PermissionValue per role id (missing modules → all-off via the one builder).
 *
 * AND IT SAYS WHETHER IT GOT ALL OF IT. This read is roles × modules, so it is
 * the one that outruns the export ceiling first — and it is the one where
 * truncation is not an omission but a REVERSAL. A role whose permission rows fell
 * off the end resolves through `buildPermissionValue([])` in the export, which
 * renders every right as `no`; re-import that file and the role is stripped. So
 * the read takes the cap PLUS ONE and hands `complete` back to the door, which
 * refuses rather than shipping a sheet that says "off" where the database says
 * "on". `ORDER BY role_id, module` on top: a truncated read then loses whole
 * roles off the tail instead of scattering half-matrices through the middle. */
export async function listAllRolePermissions(
  cfg: D1Rest,
  guard: MemberGuard
): Promise<{ byRole: Map<string, PermissionValue>; complete: boolean }> {
  const rows = await d1Query<PermRow & { role_id: string }>(
    cfg,
    guard.databaseId,
    // R14 hard cap (roles × modules). +1 is how "there was more" is known without
    // a second query — the same trick listAccountsForExport uses.
    `SELECT role_id, module, can_read, can_create, can_edit, can_delete FROM role_permissions ORDER BY role_id, module LIMIT ${EXPORT_HARD_CAP + 1}`
  )
  const byRole = new Map<string, PermRow[]>()
  for (const row of rows.slice(0, EXPORT_HARD_CAP)) {
    const list = byRole.get(row.role_id) ?? []
    list.push(row)
    byRole.set(row.role_id, list)
  }
  const out = new Map<string, PermissionValue>()
  for (const [roleId, list] of byRole) out.set(roleId, buildPermissionValue(list))
  return { byRole: out, complete: rows.length <= EXPORT_HARD_CAP }
}

/** Fetch an active role in this team, or throw a clean 404. */
async function roleOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  roleId: string
): Promise<RoleRow> {
  const rows = await d1Query<RoleRow>(
    cfg,
    guard.databaseId,
    "SELECT id, title, description, is_default FROM member_roles WHERE id = ? AND deactivated_at IS NULL",
    [roleId]
  )
  if (!rows[0]) throw new GuardError(404, "role_not_found", "That role doesn't exist.")
  return rows[0]
}

/** A role's permission matrix: the module rows, the saved value, and whether
 * it's the locked Admin role (so the screen shows it view-only). */
export async function getRolePermissions(
  cfg: D1Rest,
  guard: MemberGuard,
  roleId: string
): Promise<{
  modules: { key: string; label: string }[]
  value: PermissionValue
  isDefault: boolean
  title: string
  /** does the CALLER hold member_roles:edit? drives the screen's edit/view mode */
  canEdit: boolean
}> {
  // Three INDEPENDENT team-DB reads — the role row, its permission sheet, and the
  // caller's own member_roles:edit right (none consumes another's result) — so run
  // them as one round-trip instead of three serial ones. Promise.all rejects on
  // the first error, so a missing role still surfaces roleOrThrow's 404, same as
  // before. (This is called AFTER the route's requireRight gate; canEdit only
  // drives the screen's edit/view mode — the gate itself is untouched.)
  const [role, rows, canEdit] = await Promise.all([
    roleOrThrow(cfg, guard, roleId),
    d1Query<PermRow>(
      cfg,
      guard.databaseId,
      "SELECT module, can_read, can_create, can_edit, can_delete FROM role_permissions WHERE role_id = ?",
      [roleId]
    ),
    hasRight(cfg, guard, "member_roles", "edit"),
  ])

  return {
    modules: TEAM_MODULE_CATALOG,
    value: buildPermissionValue(rows),
    isDefault: role.is_default === 1,
    title: role.title,
    canEdit,
  }
}

/** The CALLER's own effective rights for every module in this team — powers the
 * client's page-visibility guard and which nav/tabs to show. Any member may read
 * their own rights (no requireRight needed). */
export async function getMyPermissions(
  cfg: D1Rest,
  guard: MemberGuard
): Promise<PermissionValue> {
  const rows = await d1Query<PermRow>(
    cfg,
    guard.databaseId,
    "SELECT module, can_read, can_create, can_edit, can_delete FROM role_permissions WHERE role_id = ?",
    [guard.roleId]
  )
  return buildPermissionValue(rows)
}

/** NO GRANTING WHAT YOU WERE NOT GIVEN — the general form of the no-self-grant
 * rule below, applied to whoever is on the receiving end.
 *
 * `setRolePermissions` already refuses to widen the caller's OWN role, with the
 * sentence "member_roles:edit must not be a ladder to every right you weren't
 * given". That guard names the caller's role id, so it only ever caught the most
 * direct spelling. Two doors walked around it:
 *
 *   • CREATE a role with a full matrix. The self-grant check compares against
 *     `guard.roleId`, and a role that did not exist a moment ago never matches —
 *     so a caller holding member_roles:{create,edit} could mint Admin's twin.
 *   • INVITE someone to a role. `team_members:create` is a perfectly ordinary
 *     grant (an office manager invites people), and `GET /members` hands out
 *     every role id with an `isAdmin` flag on `team_members:read` alone. Invite a
 *     second address you own to the Admin role, accept it, and you hold every
 *     right in the team — no member_roles right involved at any point.
 *
 * So the ceiling is checked against the RIGHTS, not the role id: whatever sheet
 * you are handing out, every switch on it must already be on in your own. An
 * Admin holds everything, so an Admin is unaffected; nobody else can hand out a
 * right they do not personally hold. Fails closed — a caller whose own sheet
 * cannot be read grants nothing. */
export async function requireGrantableRights(
  cfg: D1Rest,
  guard: MemberGuard,
  wanted: PermissionValue
): Promise<void> {
  const mine = await getMyPermissions(cfg, guard)
  const over: string[] = []
  for (const m of TEAM_MODULE_CATALOG) {
    // normalizeRights on BOTH sides: the auto-flip-read rule is what the door
    // will actually write, so comparing the raw request against a normalized
    // sheet would refuse a grant nobody asked for.
    const want = normalizeRights(wanted?.[m.key])
    const have = normalizeRights(mine[m.key])
    for (const right of ["read", "create", "edit", "delete"] as const)
      if (want[right] && !have[right]) over.push(`${m.label} — ${right}`)
  }
  if (over.length)
    throw new GuardError(
      403,
      "grant_exceeds_own",
      `You can only give someone rights you hold yourself, and your role is missing: ${over.join(", ")}.`
    )
}

/** The same ceiling, for a door that names a ROLE rather than a sheet (the
 * invite). Reads the target role's sheet, then asks the question above. */
export async function requireGrantableRole(
  cfg: D1Rest,
  guard: MemberGuard,
  roleId: string
): Promise<void> {
  const rows = await d1Query<PermRow>(
    cfg,
    guard.databaseId,
    "SELECT module, can_read, can_create, can_edit, can_delete FROM role_permissions WHERE role_id = ?",
    [roleId]
  )
  await requireGrantableRights(cfg, guard, buildPermissionValue(rows))
}

/** Normalize one module's rights with the locked "any write needs read" rule:
 * if any of create/edit/delete is on, read is forced on. */
export function normalizeRights(r: Partial<RightSet> | undefined): RightSet {
  const create = !!r?.create
  const edit = !!r?.edit
  const del = !!r?.delete
  return { read: !!r?.read || create || edit || del, create, edit, delete: del }
}

/** Save a role's permission sheet (upsert one row per module). Refuses the
 * locked Admin role; enforces auto-flip-read on every module. */
export async function setRolePermissions(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  roleId: string,
  value: PermissionValue
): Promise<void> {
  const role = await roleOrThrow(cfg, guard, roleId)
  if (role.is_default === 1)
    throw new GuardError(
      409,
      "locked_role",
      "The Admin role is locked — its permissions can't be changed."
    )
  // NO SELF-GRANT. member_roles:edit lets you shape OTHER people's access; it
  // must not be a ladder to every right you weren't given. Without this, a
  // custom role holding member_roles:edit could POST its OWN role id with every
  // module true and become an admin in one call. Same invariant as "you can't
  // change your own role" on the members path.
  if (roleId === guard.roleId)
    throw new GuardError(
      403,
      "self_grant",
      "You can't change your own role's access rights — ask an admin."
    )
  // …AND NO GRANTING WHAT YOU WERE NOT GIVEN. The line above names one role id,
  // so it only ever caught the caller widening THEMSELVES; a role created a
  // moment ago never matches it. See requireGrantableRights.
  await requireGrantableRights(cfg, guard, value)

  const statements = TEAM_MODULE_CATALOG.map((m) => {
    const n = normalizeRights(value?.[m.key])
    const bit = (b: boolean) => (b ? 1 : 0)
    return `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
VALUES (${sqlString(ulid())}, ${sqlString(roleId)}, ${sqlString(m.key)}, ${bit(n.read)}, ${bit(n.create)}, ${bit(n.edit)}, ${bit(n.delete)})
ON CONFLICT(role_id, module) DO UPDATE SET
  can_read = excluded.can_read, can_create = excluded.can_create,
  can_edit = excluded.can_edit, can_delete = excluded.can_delete;`
  })

  await d1ExecScript(cfg, guard.databaseId, statements.join("\n"))

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Role permissions changed",
    description: `${actor.name} updated permissions for the ${role.title} role`,
    relatedTable: "member_roles",
    relatedRowId: roleId,
  })
}

/** Rename / re-describe a role. Refuses the locked Admin (default) role; needs
 * a non-empty title. (Permissions are edited separately via setRolePermissions.) */
export async function updateRole(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  roleId: string,
  title: string,
  description: string
): Promise<void> {
  const role = await roleOrThrow(cfg, guard, roleId)
  if (role.is_default === 1)
    throw new GuardError(409, "locked_role", "The Admin role is locked — it can't be renamed.")
  const cleanTitle = title.trim()
  if (!cleanTitle) throw new GuardError(400, "invalid_input", "A role needs a name.")

  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `UPDATE member_roles SET title = ${sqlString(cleanTitle)}, description = ${sqlString(description.trim() || null)}, updated_at = ${sqlString(now)}, editor_id = ${sqlString(actor.id)}, editor_email = ${sqlString(actor.email)}, editor_name = ${sqlString(actor.name)} WHERE id = ${sqlString(roleId)};`
  )

  // Name exactly what changed, old -> new (the activity ruleset: edits carry
  // their field diffs, not just "edited").
  const changes = describeChanges([
    { label: "Name", from: role.title, to: cleanTitle },
    { label: "Description", from: role.description, to: description.trim() || null },
  ])
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Role edited",
    description: `${actor.name} edited the ${cleanTitle} role${changes ? ` — ${changes}` : ""}`,
    relatedTable: "member_roles",
    relatedRowId: roleId,
  })
}

/** Deactivate or reactivate a role. Deactivate-only model (ARCHITECTURE §4): the
 * row + its permission sheet are NEVER deleted, so holders keep their access —
 * deactivating just retires the role (hidden from new assignment). Refuses the
 * locked Admin. Gated by member_roles:delete (deactivate is the closest thing to
 * "delete" in our model). */
export async function setRoleActive(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  roleId: string,
  active: boolean
): Promise<boolean> {
  // Find the role regardless of status — we may be reactivating a deactivated one.
  const rows = await d1Query<RoleRow>(
    cfg,
    guard.databaseId,
    "SELECT id, title, is_default FROM member_roles WHERE id = ?",
    [roleId]
  )
  const role = rows[0]
  if (!role) throw new GuardError(404, "role_not_found", "That role doesn't exist.")
  if (role.is_default === 1)
    throw new GuardError(409, "locked_role", "The Admin role is locked — it can't be deactivated.")

  // R17: the UPDATE carries the current-status predicate, so a repeat (a double
  // click, a retried request) moves ZERO rows — and a record's history then says
  // what happened, not how many times a button was pressed: no rows moved means
  // no activity row and (in the route) no live ping.
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    active
      ? `UPDATE member_roles SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL, deactivator_name = NULL, updated_at = ? WHERE id = ? AND deactivated_at IS NOT NULL RETURNING id`
      : `UPDATE member_roles SET deactivated_at = ?, deactivator_id = ${sqlString(actor.id)}, deactivator_email = ${sqlString(actor.email)}, deactivator_name = ${sqlString(actor.name)}, updated_at = ? WHERE id = ? AND deactivated_at IS NULL RETURNING id`,
    active ? [now, roleId] : [now, now, roleId]
  )
  if (!changed[0]) return false

  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "Role activated" : "Role deactivated",
    description: `${actor.name} ${active ? "activated" : "deactivated"} the ${role.title} role`,
    relatedTable: "member_roles",
    relatedRowId: roleId,
  })
  return true
}

/** Create a new (non-default) role. It starts with NO rights — the admin grants
 * them via the matrix. Returns the new role id. */
export async function createRole(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  title: string,
  description: string
): Promise<string> {
  const cleanTitle = title.trim()
  if (!cleanTitle) throw new GuardError(400, "invalid_input", "A role needs a name.")

  const roleId = ulid()
  const now = new Date().toISOString()
  const desc = description.trim() || null

  const statements = [
    `INSERT INTO member_roles (id, title, description, is_default, created_at, creator_id, creator_email, creator_name)
VALUES (${sqlString(roleId)}, ${sqlString(cleanTitle)}, ${sqlString(desc)}, 0, ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`,
    ...TEAM_MODULE_CATALOG.map(
      (m) =>
        `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete) VALUES (${sqlString(ulid())}, ${sqlString(roleId)}, ${sqlString(m.key)}, 0, 0, 0, 0);`
    ),
  ]

  await d1ExecScript(cfg, guard.databaseId, statements.join("\n"))

  await logActivity(cfg, guard.databaseId, actor, {
    type: "Role created",
    description: `${actor.name} created the ${cleanTitle} role`,
    relatedTable: "member_roles",
    relatedRowId: roleId,
  })

  return roleId
}
