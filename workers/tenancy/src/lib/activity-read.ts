// Read side of the activity log (the write side is shared/workers/activity.ts).
// One feed table per team; the SAME rows are surfaced in three scopes by the
// relation each row carries: the whole team, one user, or one role. See
// the activity ruleset in ARCHITECTURE.md.

import type { ActivityItem } from "../../../../shared/types"
import { d1Query, type D1Rest } from "../../../../shared/workers/d1-rest"
import {
  accountActivityClause,
  portalActivityClause,
  type AccountScope,
} from "../../../../shared/workers/account-scope"
import type { MemberGuard } from "./permissions"
import { decodeCursor, keysetAfter, PAGE_SIZE, toPage, type Page } from "../../../../shared/workers/paging"

type ActivityRow = {
  id: string
  type: string
  description: string
  created_at: string
  creator_name: string | null
}

/** The fixed-table scopes, as what they actually are: the generic (table, id)
 * read with the table named by the scope. Exported so the fence's own coverage
 * check can read the set off this file rather than retyping it — a scope added
 * here without a line in PORTAL_ACTIVITY_FENCE turns the build red. */
export const FIXED_SCOPE_TABLES: Record<string, string> = {
  user: "users",
  role: "member_roles",
  invite: "invite_logs",
}

/** R18 — the ONE visibility clause for the cross-module team feed. The feed's
 * rows name records and their before/after, so the team scope must subtract the
 * caller's denied modules — and ANY count over the feed must go through THIS
 * same builder, because a badge counting more than its list shows is itself the
 * leak. `null` = unrestricted (the single-table scopes the route already gated
 * per-module). Rows with no related_table name nothing, so they stay visible. */
export function activityVisibilityClause(
  allowedTables: string[] | null
): { sql: string; params: string[] } {
  if (allowedTables === null) return { sql: "", params: [] }
  if (allowedTables.length === 0) return { sql: " WHERE related_table IS NULL", params: [] }
  const marks = allowedTables.map(() => "?").join(", ")
  return { sql: ` WHERE (related_table IS NULL OR related_table IN (${marks}))`, params: allowedTables }
}

/** The team's activity, newest first — optionally scoped to one record:
 *  • team   → everything that happened in the team THAT THE CALLER MAY SEE —
 *             the route passes `allowedTables` built from their module rights
 *             plus the pinned exemptions (R18: a cross-module read carries the
 *             caller's module rights)
 *  • user   → events about that member (role changes, removal, join)
 *  • role   → events about that role (created, renamed, permissions changed)
 *  • invite → events about that invite (sent, revoked) — `id` is the team-local
 *             invite_logs row id (the caller maps invite_index.id → it first)
 *  • record → GENERIC: any module's record, by (`table`, `id`). user/role/invite
 *             are just fixed-`table` aliases of this; `record` lets a NEW module
 *             (help, learning, products…) surface its activity with zero new code. */
export async function getActivity(
  cfg: D1Rest,
  guard: MemberGuard,
  scope: "team" | "user" | "role" | "invite" | "record",
  // Every argument is STATED at every call site — no optionals, no defaults. The
  // last one is the fence, and TypeScript will not let a required parameter
  // follow an optional one, which is exactly the right trade: a little noise at
  // four call sites buys "you cannot call this read without deciding the fence".
  id: string | undefined,
  table: string | undefined,
  allowedTables: string[] | null,
  cursor: string | null,
  /** The caller's account fence, and REQUIRED — a caller who may omit it is a
   * caller who may forget it, and this read is the one that gets forgotten.
   * Staff → `{ kind: "staff" }`, no clause. A PORTAL caller sees only what is
   * theirs, on every scope: the record scope because an id from outside the
   * fence must read as "doesn't exist", and the team scope because a whole-team
   * feed is exactly the leak in convenient form. */
  accountScope: AccountScope
): Promise<Page<ActivityItem> & { total: number }> {
  // FAIL CLOSED. An id-scope with no id used to match NO branch below, leaving the
  // WHERE empty — so `?scope=user` with no `id` returned the entire team's
  // cross-module history, unfiltered, to anyone with team_members:read. That is
  // precisely the leak R18 exists to stop, arrived at by omission rather than by
  // a missing gate. An unresolved scope now returns nothing at all.
  if (scope !== "team" && !id) return { rows: [], hasMore: false, nextCursor: null, total: 0 }
  if (scope === "record" && !table) return { rows: [], hasMore: false, nextCursor: null, total: 0 }

  // ONE where-clause, shared by the page read and the COUNT — a total that didn't
  // pass through the same visibility filter would over-count what it can't show.
  const clauses: string[] = []
  const params: string[] = []
  // user / role / invite ARE the generic (table, id) read with the table supplied
  // by the scope name (R5: one path, any module's history) — so they resolve to a
  // table here and share the ONE branch below. As four branches they shared no
  // fence, and the one that got it was the one somebody remembered.
  const target = scope === "record" ? table : FIXED_SCOPE_TABLES[scope]
  if (target && id) {
    clauses.push("related_table = ? AND related_row_id = ?")
    params.push(target, id)
    // A record is fenced by WHO MAY SEE IT, not by the module right that got the
    // caller this far — and WHICH fence is decided by the table (see
    // PORTAL_ACTIVITY_FENCE). Staff get no clause; a client login gets their own
    // world or nothing. Out of fence, the feed is empty — the same answer a
    // made-up id gets, so it can't be used to test what exists.
    const fence = portalActivityClause(accountScope, target)
    if (fence.sql) {
      clauses.push(fence.sql)
      params.push(...fence.params)
    }
  } else {
    // `else`, not `else if (scope === "team")` — anything that reaches here is
    // the whole-team read and MUST carry the R18 filter. A scope string the route
    // didn't recognise must never widen into an unfiltered feed.
    const clause = activityVisibilityClause(allowedTables)
    if (clause.sql) clauses.push(clause.sql.replace(/^\s*WHERE\s*/, ""))
    params.push(...clause.params)
    // R18 subtracts the modules a caller may not read. It does NOT know about
    // the account fence, and a portal caller holds real module rights — so the
    // whole-team feed handed them every client's history until this line.
    if (accountScope.kind === "portal") {
      const fence = accountActivityClause(accountScope)
      clauses.push(fence.sql)
      params.push(...fence.params)
    }
  }
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""

  // R14 GROWING collection: the feed gains a row on EVERY mutation, so it pages by
  // key rather than stopping at a ceiling. PAGE_SIZE + 1 reveals hasMore.
  const after = keysetAfter(decodeCursor(cursor), "created_at")
  const pageWhere = after.sql ? `${where ? `${where} AND` : " WHERE"} ${after.sql}` : where
  const [rows, counted] = await Promise.all([
    d1Query<ActivityRow>(
      cfg,
      guard.databaseId,
      `SELECT id, type, description, created_at, creator_name FROM activity${pageWhere}
       ORDER BY created_at DESC, id DESC LIMIT ${PAGE_SIZE + 1}`,
      [...params, ...after.params]
    ),
    // R16: the exact total of what this caller may see — never the page's length.
    d1Query<{ n: number }>(cfg, guard.databaseId, `SELECT COUNT(*) AS n FROM activity${where}`, params),
  ])
  const page = toPage(rows, PAGE_SIZE, (r) => [r.created_at, r.id])
  return {
    ...page,
    rows: page.rows.map((r) => ({
      id: r.id,
      type: r.type,
      description: r.description,
      actorName: r.creator_name,
      createdAt: r.created_at,
    })),
    total: counted[0]?.n ?? 0,
  }
}
