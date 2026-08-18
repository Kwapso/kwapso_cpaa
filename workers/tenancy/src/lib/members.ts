// Members module — manage who's on a team and what role they hold.
// Membership is GLOBAL (team_members); identity is read FRESH from the global
// users table (one source of truth, locked); role titles come from the team's
// own database. All guard rules (>=1 admin, no self-lockout, remove =
// deactivate) live here.

import type { TeamMember, TeamRole } from "@shared/types"
import { logActivity, type Actor } from "@shared/workers/activity"
import { d1Query, type D1Rest } from "@shared/workers/d1-rest"
import type { AccountScope } from "@shared/workers/account-scope"
import type { Env } from "../env"
import { listPortalUsers } from "./accounts"
import { GuardError, type MemberGuard } from "./permissions"
import { notifyRemoved, notifyRoleChanged } from "./notify"
import { audienceOf, clientUserIds } from "@shared/workers/record-link"
import { LIST_HARD_CAP } from "@shared/workers/limits"

type RoleRow = {
  id: string
  title: string
  description: string | null
  is_default: number
}

/** The team's locked Admin role id (is_default = 1). */
async function adminRoleId(cfg: D1Rest, guard: MemberGuard): Promise<string | null> {
  const rows = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    "SELECT id FROM member_roles WHERE is_default = 1 LIMIT 1"
  )
  return rows[0]?.id ?? null
}

/** Count active members holding a given role in this team. */
async function countRole(env: Env, teamId: string, roleId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM team_members WHERE team_id = ? AND role_id = ? AND deactivated_at IS NULL"
  )
    .bind(teamId, roleId)
    .first<{ n: number }>()
  return row?.n ?? 0
}

/** Everyone on the team: membership + fresh identity + role title + whether this
 * login belongs to a client. The scope is the caller's, and it is here because
 * the last of those four is a read of the customer spine. */
export async function listMembers(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope
): Promise<TeamMember[]> {
  const members = await env.DB.prepare(
    `SELECT tm.user_id, tm.role_id, tm.created_at,
            u.email, u.first_name, u.last_name, u.image_url
     FROM team_members tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = ? AND tm.deactivated_at IS NULL
     ORDER BY tm.created_at LIMIT ${LIST_HARD_CAP}` // R14 hard cap
  )
    .bind(guard.teamId)
    .all<{
      user_id: string
      role_id: string
      created_at: string
      email: string
      first_name: string | null
      last_name: string | null
      image_url: string | null
    }>()

  const roles = await d1Query<RoleRow>(
    cfg,
    guard.databaseId,
    // R14 hard cap. A title lookup is not exempt from the law just because it is
    // a lookup: `member_roles` is a table any holder of `member_roles:create` can
    // add to without limit, so an uncapped read of it is an uncapped read
    // somebody else controls the size of — on the members screen, which everyone
    // opens. (The create door is capped too now; both halves, or neither works.)
    `SELECT id, title, is_default FROM member_roles LIMIT ${LIST_HARD_CAP}`
  )
  const roleById = new Map(roles.map((r) => [r.id, r]))

  // WHICH OF THESE MEMBERS IS A CLIENT. A portal login is an ordinary team
  // member (grant → invite → accept is the only way to make one that works), so
  // there is no flag on the membership row to read — the fact is a `portal_users`
  // row in the team's own database.
  //
  // THROUGH THE FENCED READER, not a query of our own. lib/accounts.ts owns every
  // statement against the spine's three tables and each of its doors takes the
  // caller's scope, so "was this query fenced?" has one place to look. A select
  // written here would have been correct today and outside that boundary forever,
  // which is the shape the law exists to refuse — and the check reads raw text, so
  // it refuses the SQL even in a comment. Rightly: an example is how a copy starts.
  //
  // PRESENCE, not liveness, exactly as the fence decides the caller's own kind
  // (account-scope.ts): a revoked grant still means "this login belongs to a
  // client", and reviving it is one click. Reading only the live ones would put a
  // client whose access was paused back into the agency's assignee lists.
  const clientIds = new Set((await listPortalUsers(cfg, guard, scope)).map((p) => p.userId))

  return (members.results ?? []).map((m) => {
    const role = roleById.get(m.role_id)
    return {
      userId: m.user_id,
      email: m.email,
      firstName: m.first_name,
      lastName: m.last_name,
      imageUrl: m.image_url,
      roleId: m.role_id,
      roleTitle: role?.title ?? "Unknown role",
      isYou: m.user_id === guard.userId,
      isAdmin: role?.is_default === 1,
      isClient: clientIds.has(m.user_id),
      joinedAt: m.created_at,
    }
  })
}

/** Every role in the team, with how many members hold each. */
/** R16: the exact server COUNT(*) a count badge shows — NEVER a loaded list's
 * length (a capped list's length is a ceiling, not a total). */
export async function countRoles(cfg: D1Rest, guard: MemberGuard): Promise<number> {
  const rows = await d1Query<{ n: number }>(cfg, guard.databaseId, "SELECT COUNT(*) AS n FROM member_roles")
  return rows[0]?.n ?? 0
}

export async function listRoles(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard
): Promise<TeamRole[]> {
  // Include deactivated roles (active-first) so they can be seen + reactivated;
  // deactivate-only means the row + its permissions are never deleted.
  const roles = await d1Query<{
    id: string
    title: string
    description: string | null
    is_default: number
    deactivated_at: string | null
    created_at: string | null
    creator_name: string | null
    updated_at: string | null
    editor_name: string | null
  }>(
    cfg,
    guard.databaseId,
    `SELECT id, title, description, is_default, deactivated_at, created_at, creator_name, updated_at, editor_name FROM member_roles ORDER BY (deactivated_at IS NULL) DESC, is_default DESC, title LIMIT ${LIST_HARD_CAP}` // R14 hard cap
  )
  const counts = await env.DB.prepare(
    "SELECT role_id, COUNT(*) AS n FROM team_members WHERE team_id = ? AND deactivated_at IS NULL GROUP BY role_id"
  )
    .bind(guard.teamId)
    .all<{ role_id: string; n: number }>()
  const countBy = new Map((counts.results ?? []).map((c) => [c.role_id, c.n]))

  return roles.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    isDefault: r.is_default === 1,
    memberCount: countBy.get(r.id) ?? 0,
    active: r.deactivated_at == null,
    // The audit block, for the role detail's Overview tab (audit-overview parity).
    createdAt: r.created_at,
    createdByName: r.creator_name,
    updatedAt: r.updated_at,
    editedByName: r.editor_name,
  }))
}

/** The membership row for a target user (active only), with their identity
 * (email + name) joined from the global users table — so activity rows can name
 * the affected person, not just "a member". */
async function membership(env: Env, teamId: string, userId: string) {
  return env.DB.prepare(
    `SELECT tm.id, tm.role_id, u.email, u.first_name, u.last_name
     FROM team_members tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = ? AND tm.user_id = ? AND tm.deactivated_at IS NULL`
  )
    .bind(teamId, userId)
    .first<{
      id: string
      role_id: string
      email: string
      first_name: string | null
      last_name: string | null
    }>()
}

/** A target member's display name = "First Last" or, lacking a name, their
 * email (so the email serves as the name with no duplicate parenthetical). */
function targetDisplayName(t: { email: string; first_name: string | null; last_name: string | null }) {
  const name = [t.first_name, t.last_name].filter(Boolean).join(" ")
  return { name: name || t.email, email: t.email, hasName: name !== "" }
}

/** Change a member's role. Guards: not yourself, target exists, role exists,
 * and never demote the last admin. */
export async function changeMemberRole(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  targetUserId: string,
  newRoleId: string
): Promise<void> {
  if (targetUserId === guard.userId)
    throw new GuardError(409, "self", "You can't change your own role.")

  const target = await membership(env, guard.teamId, targetUserId)
  if (!target) throw new GuardError(404, "target_not_member", "That person isn't on this team.")

  const roles = await d1Query<RoleRow>(
    cfg,
    guard.databaseId,
    "SELECT id, title FROM member_roles WHERE id = ? AND deactivated_at IS NULL",
    [newRoleId]
  )
  if (!roles[0]) throw new GuardError(400, "role_not_found", "That role doesn't exist.")
  if (target.role_id === newRoleId) return // no-op

  const adminId = await adminRoleId(cfg, guard)
  if (target.role_id === adminId && newRoleId !== adminId) {
    if ((await countRole(env, guard.teamId, adminId)) <= 1)
      throw new GuardError(409, "last_admin", "A team must keep at least one admin.")
  }

  // The count above is the friendly/fast path. This UPDATE re-checks the admin
  // floor INSIDE the statement, so two simultaneous demotions can't both slip
  // past the count and zero out the team's admins — D1 serializes the write, so
  // no Durable Object is needed (see CONCURRENCY.md). Allowed when: the new role
  // IS admin, OR the target isn't currently admin, OR more than one admin remains.
  const res = await env.DB.prepare(
    `UPDATE team_members SET role_id = ?, updated_at = ?
     WHERE id = ? AND deactivated_at IS NULL
       AND ( ? = ? OR role_id != ?
             OR (SELECT COUNT(*) FROM team_members
                 WHERE team_id = ? AND role_id = ? AND deactivated_at IS NULL) > 1 )`
  )
    .bind(newRoleId, new Date().toISOString(), target.id, newRoleId, adminId, adminId, guard.teamId, adminId)
    .run()
  if (!res.meta?.changes)
    throw new GuardError(409, "last_admin", "A team must keep at least one admin.")

  const t = targetDisplayName(target)
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Member role changed",
    // Point-in-time snapshot. When there's no name yet, the email IS the name —
    // drop the parenthetical duplicate.
    description: t.hasName
      ? `${actor.name} changed ${t.name}'s role to ${roles[0].title} (${t.email})`
      : `${actor.name} changed ${t.name}'s role to ${roles[0].title}`,
    // Point at the affected USER so it shows on their detail + the team feed.
    relatedTable: "users",
    relatedRowId: targetUserId,
  })

  // Tell the member — they didn't make this change but it affects them. WHICH
  // FRONT DOOR they read us through decides whether the mail can carry a link
  // back to their membership at all: a client login is an ordinary team member
  // holding an ordinary role, so this path reaches both kinds of person, and the
  // portal has no members screen to send one of them to.
  const clients = await clientUserIds(cfg, guard.databaseId, [targetUserId])
  await notifyRoleChanged(env, guard.teamId, t.email, actor.name, roles[0].title, {
    userId: targetUserId,
    audience: audienceOf(clients, targetUserId),
  })
}

/** Remove a member = deactivate the membership (reversible; never hard-delete).
 * Guards: not yourself, target exists, never remove the last admin. */
export async function removeMember(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  targetUserId: string
): Promise<void> {
  if (targetUserId === guard.userId)
    throw new GuardError(409, "self", "You can't remove yourself.")

  const target = await membership(env, guard.teamId, targetUserId)
  if (!target) throw new GuardError(404, "target_not_member", "That person isn't on this team.")

  const adminId = await adminRoleId(cfg, guard)
  if (target.role_id === adminId && (await countRole(env, guard.teamId, adminId)) <= 1)
    throw new GuardError(409, "last_admin", "A team must keep at least one admin.")

  // Atomic backstop (same reasoning as changeMemberRole): the WHERE re-checks
  // the admin floor at write time so two simultaneous removals can't both pass
  // the count above and leave the team with zero admins.
  const res = await env.DB.prepare(
    `UPDATE team_members SET deactivated_at = ?
     WHERE id = ? AND deactivated_at IS NULL
       AND ( ? IS NULL OR role_id != ?
             OR (SELECT COUNT(*) FROM team_members
                 WHERE team_id = ? AND role_id = ? AND deactivated_at IS NULL) > 1 )`
  )
    .bind(new Date().toISOString(), target.id, adminId, adminId, guard.teamId, adminId)
    .run()
  if (!res.meta?.changes)
    throw new GuardError(409, "last_admin", "A team must keep at least one admin.")

  const t = targetDisplayName(target)
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Member removed",
    description: t.hasName
      ? `${actor.name} removed ${t.name} (${t.email}) from the team`
      : `${actor.name} removed ${t.name} from the team`,
    relatedTable: "users",
    relatedRowId: targetUserId,
  })

  // Tell the removed member — they didn't make this change but it affects them.
  await notifyRemoved(env, guard.teamId, t.email, actor.name)
}
