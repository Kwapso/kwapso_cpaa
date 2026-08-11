// Team + session routes: onboarding bootstrap, the active context, the team
// switcher, creating a team, editing it, the Overview metadata + Activity feed.

import { fail, json, pagedJson } from "@shared/workers/http"
import { queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { logActivity } from "@shared/workers/activity"
import { getActivity } from "../lib/activity-read"
import { getMyPermissions } from "../lib/roles"
import { ACTIVITY_GATE_MAP, ACTIVITY_TABLE_EXEMPT } from "@shared/rules/registry"
import { requireMember, requireRight } from "../lib/permissions"
import {
  acceptPendingInvites,
  createTeam,
  d1Config,
  getActiveContext,
  getTeamMeta,
  listMyTeams,
  switchTeam,
  updateTeamDetails,
} from "../lib/teams"
import { MAX_TEAMS_PER_USER, numberVar } from "@shared/workers/limits"
import { TEAM_CREATION_CLOSED } from "@shared/product"
import { accountScope, refusePortalCaller } from "@shared/workers/account-scope"
import { gatedBody } from "@shared/workers/route"
import { teamContext, toActor, whoAmI } from "../context"
import type { Env } from "../env"

/**
 * The locked onboarding flow: active invites? -> join those teams (no personal
 * team). Otherwise -> create "{First name}'s team" with its own database.
 * Idempotent: if the user already belongs somewhere, just report.
 */
export async function bootstrap(request: Request, env: Env): Promise<Response> {
  const user = await whoAmI(request, env)
  if (!user) return fail(401, "signed_out", "Not signed in.")
  if (!user.onboardingComplete)
    return fail(409, "onboarding_incomplete", "Finish onboarding first.")

  const actor = toActor(user)

  let teams = await listMyTeams(env, user.id)
  if (teams.length === 0) {
    const accepted = await acceptPendingInvites(env, actor)
    // With creation closed, an invitation is the ONLY way in. Someone who signs
    // in without one gets no team rather than a private world of their own —
    // the onboarding screen then tells them to ask for an invite, which is the
    // true answer instead of a team nobody meant them to have.
    if (accepted === 0 && !TEAM_CREATION_CLOSED) {
      await createTeam(env, actor, `${user.firstName ?? "My"}'s team`, user.imageUrl)
    }
    teams = await listMyTeams(env, user.id)
  }

  // THE SAME REFUSAL THE REST OF THIS FILE MAKES, and it belongs here because
  // this door hands back the SAME `TeamSummary` rows: the agency's name, its
  // logo, and `db_status` — an internal provisioning state no client has any use
  // for. Refused only once a team is resolved: a caller with none cannot be a
  // client login (portal-ness is a row in a TEAM database), and refusing before
  // that would lock the very first sign-in out of onboarding.
  await refuseClientOnTeams(env, user.id, teams)

  const current = await env.DB.prepare("SELECT current_team_id FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ current_team_id: string | null }>()

  return json({ teams, currentTeamId: current?.current_team_id ?? null })
}

/** A CLIENT LOGIN IS REFUSED THE TEAM LIST TOO.
 *
 * `/active` was closed against a client login because it answers with the team's
 * name, its logo, the caller's role title and the agency's member count — and the
 * comment above says why the refusal had to live on the door rather than on the
 * portal gateway's allow-list. Then the two doors that hand back the team ROWS
 * kept answering: `GET /teams` and the onboarding bootstrap both return
 * `TeamSummary[]`, which is the name and the logo again, plus `dbStatus`. Two of
 * the five fields `/active` was closed for, out of its siblings, to the same
 * person, at the same origin — "a door that returns a payload another door guards
 * is that payload's second front door", written twelve lines below where it kept
 * happening.
 *
 * The R21 exemption these doors carried said "the caller's own membership list",
 * and that sentence is true about the QUESTION and silent about the ANSWER. A
 * client knows perfectly well which team they belong to; what they were being
 * handed is what the team LOOKS LIKE from the inside. The exemption is gone from
 * the registry with this. */
async function refuseClientOnTeams(env: Env, userId: string, teams: { id: string }[]): Promise<void> {
  // Which team they are STANDING in, resolved the same way `active` resolves it
  // (stored pointer if it is still one of theirs, else the first) — so the two
  // doors can never disagree about who is being asked about.
  const stored = await env.DB.prepare("SELECT current_team_id FROM users WHERE id = ?")
    .bind(userId)
    .first<{ current_team_id: string | null }>()
  const current = teams.find((t) => t.id === stored?.current_team_id) ?? teams[0]
  if (!current) return
  const cfg = d1Config(env)
  await refusePortalCaller(cfg, await requireMember(env, userId, current.id))
}

export async function myTeams(request: Request, env: Env): Promise<Response> {
  const user = await whoAmI(request, env)
  if (!user) return fail(401, "signed_out", "Not signed in.")
  const teams = await listMyTeams(env, user.id)
  await refuseClientOnTeams(env, user.id, teams)
  return json({ teams, currentTeamId: user.currentTeamId })
}

/** THE AGENCY'S OWN DOORS — the ones that answer with the AGENCY rather than
 * with anybody's records, and are therefore gated by nothing but identity.
 *
 * A client login is a member of the agency's team (that is how the fence knows
 * them at all), so identity alone let them ask — and be told the team's name and
 * logo, their role title, the team's ACTIVE MEMBER COUNT, and on the metadata
 * door the owner's own name and email address. None of that is a client's
 * business. The client portal's gateway refuses to forward these doors and says
 * so in its door table; the agency origin serves the same person, so the refusal
 * has to live on the door rather than on one gateway's list.
 *
 * Refused, not trimmed: there is no version of these answers a client needs. The
 * one field the portal ever wanted (the team id its live channel is keyed by)
 * `/api/auth/me` already carries. Costs the portal_users miss, the same toll
 * every fenced door pays.
 *
 * ONE REFUSAL, not two. This file used to carry its own private copy of the
 * shared `refusePortalCaller` — same sentence, same 403, same code — under a
 * second name. Two spellings of one security decision is one that can be fixed
 * in the wrong place, and a guard that scans for the shared name cannot see the
 * private one. The copy is gone; this reads the seam beside the fence. */

async function agencyContext(env: Env, userId: string) {
  const cfg = d1Config(env)
  const ctx = await getActiveContext(env, cfg, userId)
  // Resolved from the ANSWER, never from the stored pointer — getActiveContext
  // self-heals a stale current team, and a guard built from the un-healed value
  // would refuse a member who is simply looking at a different team today.
  if (ctx.team) await refusePortalCaller(cfg, await requireMember(env, userId, ctx.team.id))
  return ctx
}

/** The active context: current team + your role + member count + all teams. */
export async function active(request: Request, env: Env): Promise<Response> {
  const user = await whoAmI(request, env)
  if (!user) return fail(401, "signed_out", "Not signed in.")
  return json(await agencyContext(env, user.id))
}

/** Switch the active team (one team session at a time, validated). */
export async function switchActiveTeam(request: Request, env: Env): Promise<Response> {
  const user = await whoAmI(request, env)
  if (!user) return fail(401, "signed_out", "Not signed in.")

  const body = (await request.json().catch(() => ({}))) as { teamId?: unknown }
  const teamId = requireText(body.teamId, "Team", TEXT_LIMITS.short)

  const ok = await switchTeam(env, user.id, teamId)
  if (!ok) return fail(403, "not_member", "You're not a member of that team.")
  // The SAME answer as /active, so it carries the same refusal — a door that
  // returns a payload another door guards is that payload's second front door.
  return json(await agencyContext(env, user.id))
}

/** Create a brand-new team (its own database, you as Admin) and switch to it. */
export async function createNamedTeam(request: Request, env: Env): Promise<Response> {
  const user = await whoAmI(request, env)
  if (!user) return fail(401, "signed_out", "Not signed in.")
  // Closed for everyone who can ask — a person at the keyboard, the agent acting
  // as them, a personal access token. The refusal comes BEFORE the identity
  // checks below so it reads the same to all three (shared/product.ts).
  if (TEAM_CREATION_CLOSED)
    return fail(
      403,
      "team_creation_closed",
      "This app runs as one team. Ask an admin to invite you to it."
    )
  if (!user.onboardingComplete)
    return fail(409, "onboarding_incomplete", "Finish onboarding first.")

  const body = (await request.json().catch(() => ({}))) as { name?: unknown }
  // Validate at the boundary: a non-string name would otherwise crash .trim() → 500.
  // requireText type-checks + trims + caps, throwing the clean 400 the catch maps.
  const name = requireText(body.name, "Team name", TEXT_LIMITS.short)

  // CAP the door. Every team provisions a REAL database, so an uncapped create
  // is an unbounded resource-creation door for anyone who can sign up — one
  // account could exhaust the Cloudflare account's database quota. Counted by
  // who CREATED the team (that's what provisions), never by membership, so
  // being invited to many teams costs nobody anything. The owner raises it per
  // deploy with MAX_TEAMS_PER_USER; onboarding's first team is far below it.
  const cap = numberVar(env.MAX_TEAMS_PER_USER, MAX_TEAMS_PER_USER)
  const mine = await env.DB.prepare("SELECT COUNT(*) AS n FROM teams WHERE creator_id = ?")
    .bind(user.id)
    .first<{ n: number }>()
  if ((mine?.n ?? 0) >= cap)
    return fail(
      403,
      "team_limit",
      `You've created ${cap} teams, which is the limit on this account. Ask an admin if you need more.`
    )

  await createTeam(env, toActor(user), name, null)
  return json(await agencyContext(env, user.id))
}

export async function postUpdateTeam(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ name?: unknown; logoDataUrl?: unknown }>(
    request, env, "teams", "edit"
  )
  const name = requireText(body.name, "Name", TEXT_LIMITS.short)
  // A data URL is bytes, not prose — parseDataUrl caps and refuses it downstream,
  // so the boundary's job here is only to prove it IS a string (a number would
  // reach .exec() as a coerced value and a bad logo would look like a good one).
  if (body.logoDataUrl !== undefined && typeof body.logoDataUrl !== "string")
    return fail(400, "invalid_input", "The logo must be an image.")
  await updateTeamDetails(env, guard.teamId, name, body.logoDataUrl)
  // Record the edit on the team's Activity feed (was missing — team-edit feedback).
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Team details updated",
    description: `${actor.name} updated the team details`,
    relatedTable: "teams",
    relatedRowId: guard.teamId,
  })
  await publishChange(env, guard.teamId, "team")
  return json({ ok: true })
}

/** The activity feed for the active team, or one record (?scope=team|user|role
 * &id=). Gated by read-right: role scope needs member_roles:read, the rest
 * team_members:read — and the TEAM scope additionally subtracts the caller's
 * denied modules (R18): the feed is the one read that returns every module's
 * rows behind a single gate, and its rows name records and their before/after,
 * so a caller who can't read a module can't read its history either. The
 * table→module map + the pinned exemptions live as DATA in the rules registry. */
export async function getActivityFeed(request: Request, env: Env): Promise<Response> {
  // ONE response shape for every scope (R14): the rows, the TRUE total, hasMore,
  // and the opaque cursor the client hands straight back for the next page. A
  // scope that resolves to nothing answers in the same shape — never a bare [].
  const feed = (p: { rows: unknown[]; total: number; hasMore: boolean; nextCursor: string | null }) =>
    pagedJson("activity", p)
  const emptyFeed = () => pagedJson("activity", { rows: [], total: 0, hasMore: false, nextCursor: null })
  const { cfg, guard } = await teamContext(request, env)
  const url = new URL(request.url)
  // VALIDATED, not cast: an unrecognised scope used to fall past every branch
  // here AND in getActivity, leaving an unfiltered whole-feed read behind.
  const SCOPES = ["team", "user", "role", "invite", "record"] as const
  const raw = queryText(url.searchParams.get("scope"), "Scope") ?? "team"
  const scope = (SCOPES as readonly string[]).includes(raw)
    ? (raw as (typeof SCOPES)[number])
    : null
  if (!scope) return fail(400, "invalid_input", "Unknown activity scope.")
  // Every query parameter through the ONE boundary seam (queryText): capped, so a
  // multi-megabyte ?id= or ?cursor= is a clean 400, not a giant statement / atob.
  let id = queryText(url.searchParams.get("id"), "Id")
  // The OPAQUE cursor from the previous page (R14) — decoded (and 400-checked)
  // inside getActivity, never parsed here.
  const cursor = queryText(url.searchParams.get("cursor"), "Cursor") ?? null

  // Generic record scope: any module's activity by (table, id), gated by THAT
  // module's read right (resolved from the SAME registry map the team scope
  // subtracts through — an unknown table returns empty, never the whole feed).
  if (scope === "record") {
    const table = queryText(url.searchParams.get("table"), "Table")
    if (!id || !table) return emptyFeed()
    const module = ACTIVITY_GATE_MAP[table]
    if (!module) return emptyFeed()
    await requireRight(cfg, guard, module, "read")
    return feed((await getActivity(cfg, guard, "record", id, table, null, cursor, await accountScope(cfg, guard))))
  }

  await requireRight(cfg, guard, scope === "role" ? "member_roles" : "team_members", "read")

  // An id-scope with no id is a request for one record's history that names no
  // record — answer with nothing, never with everyone's.
  if (scope !== "team" && !id) return emptyFeed()

  // R18: the team feed carries the caller's module rights — build the allowed
  // related_table list from their per-module read rights + the pinned exemptions.
  if (scope === "team") {
    const perms = await getMyPermissions(cfg, guard)
    const allowed = [
      ...Object.entries(ACTIVITY_GATE_MAP)
        .filter(([, module]) => perms[module]?.read)
        .map(([table]) => table),
      ...Object.keys(ACTIVITY_TABLE_EXEMPT),
    ]
    return feed((await getActivity(cfg, guard, "team", undefined, undefined, allowed, cursor, await accountScope(cfg, guard))))
  }
  // Invite scope: the client passes the GLOBAL invite id; map it to the team-local
  // invite_logs row id the activity rows reference. Bail to an empty feed if it
  // doesn't resolve, so a bad/missing id never falls through to the whole-team feed.
  if (scope === "invite") {
    if (!id) return emptyFeed()
    const idx = await env.DB.prepare(
      "SELECT invite_row_id FROM invite_index WHERE id = ? AND team_id = ?"
    )
      .bind(id, guard.teamId)
      .first<{ invite_row_id: string }>()
    if (!idx?.invite_row_id) return emptyFeed()
    id = idx.invite_row_id
  }
  return feed((await getActivity(cfg, guard, scope, id, undefined, null, cursor, await accountScope(cfg, guard))))
}

/** The active team's Overview metadata (any member of the AGENCY may read it —
 * it names who created the team, by name and email address). */
export async function getTeamMetaFeed(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await refusePortalCaller(cfg, guard)
  return json(await getTeamMeta(env, guard.teamId))
}
