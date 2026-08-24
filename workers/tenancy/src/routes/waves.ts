// WAVES — the doors. What a client bought, and which sprints are inside it.
//
// EVERY DOOR HERE REFUSES A CLIENT LOGIN, and that is a decision rather than a
// default. The client-organisation doors beside this file go the other way — the
// owner ticked all four, so a contact reads their own departments, roles, people
// and tools — and a wave looks superficially similar: it is a package THEY
// bought, on THEIR account.
//
// It is refused anyway, for the reason `work` is refused everywhere else. A wave
// is made of SPRINTS, and a sprint row is the agency's own delivery record: what
// we sold, when we are doing it, and (on the sprint itself) what it cost. Every
// read door on `work` already refuses a portal caller, and a module answers the
// same way on both halves or on neither — a module whose reads refuse and whose
// writes do not is one checkbox on somebody's client role away from a leak
// (`web/test/module-refusal-symmetry.test.ts` says so at length).
//
// WHAT THE CLIENT PORTAL SHOWS INSTEAD is the owner's ruling on the portal side
// — a wave's NAME AND ITS DATES, and never a price. It is served by the portal's
// own fenced door on the portal gateway's own allow-list, not by opening one of
// these: a door the portal forwards is a door a client can reach, and none of
// these should be.
//
// THE FENCE IS STILL RESOLVED AND STILL PASSED DOWN, on every door including the
// refusing ones. `refusePortalCaller` hands back the caller's scope, the lib
// applies `accountScopeClause` with it, and a write asserts the row's own account
// sits inside it. Defence in depth: the refusal is the door's answer, the fence
// is the rows'.
//
// THE MODULE IS `work`, because a wave is a package of sprints and a sprint is
// `work`. Its `active` door gates on `edit` rather than `delete` for the same
// reason the sprint doors do: `work` offers three rights, and a door written
// against a fourth would refuse everybody, Admin included (R36).

import { json } from "@shared/workers/http"
import { publishChange } from "@shared/workers/realtime"
import { refusePortalCaller, type AccountScope } from "@shared/workers/account-scope"
import { gated, gatedBody } from "@shared/workers/route"
import { queryText, requireText, optionalText, TEXT_LIMITS } from "@shared/workers/validate"
import { GuardError, type MemberGuard } from "../lib/permissions"
import type { D1Rest } from "@shared/workers/d1-rest"
import {
  countWaves,
  createWave,
  getWave,
  listWaves,
  setSprintWave,
  setWaveActive,
  updateWave,
} from "../lib/waves"
import type { Env } from "../env"

/** THE CALLER, PROVED NOT TO BE A CLIENT LOGIN — and their account world handed
 * back for the lib to fence with. A `function` declaration on purpose: the
 * portal-fence walk follows route-local helpers by reading function declarations
 * off disk, and a helper it cannot see through is a fence it cannot prove. */
async function agencyScope(cfg: D1Rest, guard: MemberGuard): Promise<AccountScope> {
  return refusePortalCaller(cfg, guard)
}

/** WHICH CLIENT, off the query string — optional, because staff read every
 * client's waves on the collection screen and one client's on their record. */
function accountFilter(request: Request): string | null {
  return queryText(new URL(request.url).searchParams.get("accountId"), "Client") || null
}

/* ------------------------------- reading them ------------------------------ */

/** GET /api/tenancy/waves?accountId= — every wave this caller may see. */
export async function getWaves(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "work", "read")
  const scope = await agencyScope(cfg, guard)
  const accountId = accountFilter(request)
  // These are independent reads — one wait, not 2.
  const [waves, total] = await Promise.all([
    listWaves(cfg, guard, scope, accountId),
    // R16: the badge shows the door's exact COUNT(*), never the list's length.
    countWaves(cfg, guard, scope, accountId),
  ])
  return json({ waves, total })
}

/** GET /api/tenancy/waves/one?id= — one wave, the sprints in it, and any overlap
 * between their dates. Three answers because they are one screen. */
export async function getWaveOne(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "work", "read")
  const scope = await agencyScope(cfg, guard)
  const id = queryText(new URL(request.url).searchParams.get("id"), "Id")
  if (!id) throw new GuardError(400, "invalid_input", "A wave id is required.")
  const found = await getWave(cfg, guard, scope, id)
  if (!found) throw new GuardError(404, "not_found", "That's not there anymore.")
  return json(found)
}

/* ------------------------------- writing them ------------------------------ */

/** POST /api/tenancy/waves — sell a wave. It is born with no sprints, which is
 * ordinary: "Alex sells the wave, sprints get planned afterwards." */
export async function postCreateWave(request: Request, env: Env): Promise<Response> {
  const { cfg, guard, actor, body } = await gatedBody<{
    accountId?: unknown
    name?: unknown
    goal?: unknown
  }>(request, env, "work", "create")
  const scope = await agencyScope(cfg, guard)
  const accountId = requireText(body.accountId, "Client", TEXT_LIMITS.short)
  const name = requireText(body.name, "Name", TEXT_LIMITS.short)
  const goal = optionalText(body.goal, "What it's for", TEXT_LIMITS.long) ?? null
  const { id } = await createWave(cfg, guard, scope, actor, { accountId, name, goal })
  await publishChange(env, guard.teamId, "waves", id, "add", accountId)
  return json({ id })
}

/** POST /api/tenancy/waves/update — rename it, or re-word what it is for.
 *
 * THE DATES ARE NOT HERE and cannot be sent: they are the sprints' answer, not a
 * field somebody types over. A wave that could be dated by hand would disagree
 * with the sprints inside it the moment one of them moved, and the disagreement
 * would look exactly like a fact. */
export async function postUpdateWave(request: Request, env: Env): Promise<Response> {
  const { cfg, guard, actor, body } = await gatedBody<{
    id?: unknown
    name?: unknown
    goal?: unknown
  }>(request, env, "work", "edit")
  const scope = await agencyScope(cfg, guard)
  const id = requireText(body.id, "Id", TEXT_LIMITS.short)
  const name = requireText(body.name, "Name", TEXT_LIMITS.short)
  const goal = optionalText(body.goal, "What it's for", TEXT_LIMITS.long) ?? null
  const { accountId } = await updateWave(cfg, guard, scope, actor, { id, name, goal })
  await publishChange(env, guard.teamId, "waves", id, "edit", accountId)
  return json({ ok: true })
}

/** POST /api/tenancy/waves/active — switch a wave off, or bring it back.
 *
 * `work` offers read / create / edit and no `delete` (shared/team-modules.ts), so
 * this gates on `edit` like the sprint doors it sits beside. Deactivate, never
 * delete: the package a two-year-old sprint was sold inside is still the answer
 * to "what did they buy?". */
export async function postWaveActive(request: Request, env: Env): Promise<Response> {
  const { cfg, guard, actor, body } = await gatedBody<{ id?: unknown; active?: unknown }>(
    request,
    env,
    "work",
    "edit"
  )
  const scope = await agencyScope(cfg, guard)
  const id = requireText(body.id, "Id", TEXT_LIMITS.short)
  const active = body.active === true
  const { moved, accountId } = await setWaveActive(cfg, guard, scope, actor, { id, active })
  // R17: zero rows moved = nothing happened, so nothing is announced.
  if (moved) await publishChange(env, guard.teamId, "waves", id, "edit", accountId)
  return json({ ok: true, moved })
}

/** POST /api/tenancy/waves/sprint — put a sprint in a wave, or take it out.
 *
 * `waveId: null` is the take-out, through the same door, because it is the same
 * decision said the other way round.
 *
 * THE OVERLAP RIDES THE RESPONSE. Two sprints of one package whose dates cross
 * is a WARNING and never a refusal — "warn, but we can save it (it can
 * happen…)". The write has already landed by the time the caller reads this, so
 * the screen says what it now knows rather than asking again.
 *
 * TWO RESOURCES MOVED, so two are announced: the SPRINT row, whose wave changed,
 * and the WAVE, whose dates were just recalculated from the sprints in it — and
 * on a move, the wave it LEFT as well, for the same reason. */
export async function postWaveSprint(request: Request, env: Env): Promise<Response> {
  const { cfg, guard, actor, body } = await gatedBody<{ sprintId?: unknown; waveId?: unknown }>(
    request,
    env,
    "work",
    "edit"
  )
  const scope = await agencyScope(cfg, guard)
  const sprintId = requireText(body.sprintId, "Sprint", TEXT_LIMITS.short)
  // NULL IS A REAL ANSWER and means "take it out of whatever wave it is in", so
  // this is `optionalText` rather than `requireText`: the field is absent, null
  // or blank for a removal, and a wave id for a placement.
  const waveId = optionalText(body.waveId, "Wave", TEXT_LIMITS.short) ?? null
  const result = await setSprintWave(cfg, guard, scope, actor, { sprintId, waveId })
  if (result.moved) {
    await publishChange(env, guard.teamId, "sprints", sprintId, "edit", result.accountId ?? undefined)
    for (const id of [result.previousWaveId, waveId].filter((x): x is string => Boolean(x)))
      await publishChange(env, guard.teamId, "waves", id, "edit", result.accountId ?? undefined)
  }
  return json({ ok: true, moved: result.moved, overlaps: result.overlaps })
}
