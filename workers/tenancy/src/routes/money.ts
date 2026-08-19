// THE MONEY ROUTES — the two rate cards, and the margin.
//
// EVERY DOOR IN THIS FILE REFUSES A CLIENT LOGIN. Not most of them, not the
// internal ones: every one. That is why the file exists as its own file, beside
// routes/processes.ts rather than inside it — a reader can check the rule by
// counting `refusePortalCaller` against the number of handlers, and Law R24
// checks the harder half (that nothing the portal gateway opens can reach the
// internal figures at all).
//
// The account rate card is the softer of the two — a client MAY be shown what
// they are charged, when their price visibility is switched on — but they are
// shown it through the portal's own value door, projected, never by knocking on
// this one. A rate card door answers with the audit block, the inactive rows and
// every account's card in one place; the projection answers with the numbers
// that are theirs.

import { fail, json } from "@shared/workers/http"
import { optionalText, queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { gated, gatedBody } from "@shared/workers/route"
import { refusePortalCaller } from "@shared/workers/account-scope"
import { GuardError } from "@shared/workers/gating"
import {
  createAccountRate,
  listAccountRates,
  setAccountRateActive,
  updateAccountRate,
} from "../lib/rates"
import {
  appMoneyBack,
  createInternalRate,
  listInternalRates,
  listRoleRates,
  readMargin,
  setInternalRateActive,
  setRoleRate,
  updateInternalRate,
} from "../lib/internal-money"
import type { Env } from "../env"

type Body = Record<string, unknown>

/** €100,000 an hour is a typo, not a rate. The cap is the difference between a
 * mistyped figure and a margin nobody can explain. */
const MAX_CENTS_PER_HOUR = 10_000_000

/** A rate off a request body. The coercion is `Number()` at the call site (R20 is
 * positional — see the same note in routes/processes.ts); this is the range. */
function centsPerHour(value: number): number {
  if (!Number.isFinite(value) || value < 0)
    throw new GuardError(400, "invalid_input", "A rate is a whole number of cents an hour, zero or more.")
  if (value > MAX_CENTS_PER_HOUR)
    throw new GuardError(400, "invalid_input", "That rate is higher than this can be. Check the number.")
  return Math.floor(value)
}

// ── what an account is charged ───────────────────────────────────────────────

/** GET /api/tenancy/rates?accountId= — one account's rate card. */
export async function getAccountRates(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "commercials", "read")
  const scope = await refusePortalCaller(cfg, guard)
  const accountId = queryText(new URL(request.url).searchParams.get("accountId"), "Account")
  if (!accountId) return fail(400, "invalid_input", "Which account?")
  const { rows, total } = await listAccountRates(cfg, guard, scope, accountId)
  return json({ rates: rows, total })
}

export async function postCreateAccountRate(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "commercials", "create")
  const scope = await refusePortalCaller(cfg, guard)
  const accountId = requireText(body.accountId, "Account", TEXT_LIMITS.short)
  const id = await createAccountRate(cfg, guard, scope, actor, {
    accountId,
    label: requireText(body.label, "Kind of work", TEXT_LIMITS.short),
    centsPerHour: centsPerHour(Number(body.centsPerHour)),
    currency: optionalText(body.currency, "Currency", TEXT_LIMITS.short),
  })
  await publishChange(env, guard.teamId, "account_rates", accountId, "add")
  return json({ id })
}

export async function postUpdateAccountRate(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "commercials", "edit")
  const scope = await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Rate", TEXT_LIMITS.short)
  const accountId = await updateAccountRate(cfg, guard, scope, actor, id, {
    label: requireText(body.label, "Kind of work", TEXT_LIMITS.short),
    centsPerHour: centsPerHour(Number(body.centsPerHour)),
    currency: "currency" in body ? (optionalText(body.currency, "Currency", TEXT_LIMITS.short) ?? null) : undefined,
  })
  // The ACCOUNT is what a listener can act on — a rate is only ever read on its
  // account's own card, the same shape a contact and a login already have.
  await publishChange(env, guard.teamId, "account_rates", accountId)
  return json({ ok: true })
}

/** POST /api/tenancy/rates/active — deactivate / activate. Never delete: what an
 * account was charged last year has to stay true. */
export async function postAccountRateActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "commercials", "delete")
  const scope = await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Rate", TEXT_LIMITS.short)
  if (typeof body.active !== "boolean") return fail(400, "invalid_input", "Deactivate or activate?")
  // R17: null = zero rows moved = already like that → no ping, no history row.
  const accountId = await setAccountRateActive(cfg, guard, scope, actor, id, body.active)
  if (accountId) await publishChange(env, guard.teamId, "account_rates", accountId)
  return json({ ok: true })
}

// ── what our own hour costs, and what is left ────────────────────────────────

/** GET /api/tenancy/internal-rates — the agency's own cost card. */
export async function getInternalRates(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "commercials", "read")
  await refusePortalCaller(cfg, guard)
  const { rows, total } = await listInternalRates(cfg, guard)
  return json({ internalRates: rows, total })
}

export async function postCreateInternalRate(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "commercials", "create")
  await refusePortalCaller(cfg, guard)
  const id = await createInternalRate(cfg, guard, actor, {
    label: requireText(body.label, "Kind of work", TEXT_LIMITS.short),
    centsPerHour: centsPerHour(Number(body.centsPerHour)),
    currency: optionalText(body.currency, "Currency", TEXT_LIMITS.short),
    isDefault: body.isDefault === true,
  })
  await publishChange(env, guard.teamId, "internal_rates", id, "add")
  return json({ id })
}

export async function postUpdateInternalRate(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "commercials", "edit")
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Rate", TEXT_LIMITS.short)
  await updateInternalRate(cfg, guard, actor, id, {
    label: requireText(body.label, "Kind of work", TEXT_LIMITS.short),
    centsPerHour: centsPerHour(Number(body.centsPerHour)),
    currency: "currency" in body ? (optionalText(body.currency, "Currency", TEXT_LIMITS.short) ?? null) : undefined,
    isDefault: typeof body.isDefault === "boolean" ? body.isDefault : undefined,
  })
  await publishChange(env, guard.teamId, "internal_rates", id)
  return json({ ok: true })
}

export async function postInternalRateActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "commercials", "delete")
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Rate", TEXT_LIMITS.short)
  if (typeof body.active !== "boolean") return fail(400, "invalid_input", "Deactivate or activate?")
  const changed = await setInternalRateActive(cfg, guard, actor, id, body.active)
  if (changed) await publishChange(env, guard.teamId, "internal_rates", id)
  return json({ ok: true })
}

/** GET /api/tenancy/margin?accountId= — revenue, our own time, tool costs, and
 * what is left, with every line it was computed from.
 *
 * THE ONE FIGURE SCOPE SAYS A CLIENT MUST NEVER SEE, under any flag, ever. Three
 * things hold that: this door refuses a portal caller; the portal gateway does
 * not name it, so it is a 404 at the client hostname before a worker is reached;
 * and R24 fails the build if any portal-reachable code path ever imports the
 * file behind it. Three, because the owner's ruling was "structurally true rather
 * than a condition someone can invert later". */
export async function getMargin(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "commercials", "read")
  // ONE refusal, not two. There used to be a `scope.kind !== "staff"` check
  // below this line as belt-and-braces — and the sabotage round showed it was
  // worse than redundant: with `refusePortalCaller` deleted, the second guard
  // kept the behavioural suite green, so the test could no longer see the very
  // thing it exists to watch. A duplicate guard is a blindfold on the first one.
  await refusePortalCaller(cfg, guard)
  const accountId = queryText(new URL(request.url).searchParams.get("accountId"), "Account")
  if (!accountId) return fail(400, "invalid_input", "Which account?")
  return json(await readMargin(cfg, guard, accountId))
}

// ── what an hour of a ROLE costs, and what one app gave back ────────────────
//
// Three doors, and every one of them refuses a client login like the nine above.
// R24 derives that obligation from the file they call into rather than from this
// comment: `listRoleRates`, `setRoleRate` and `appMoneyBack` are exports of
// lib/internal-money.ts, so the law walks these handlers and fails the build if
// any of them forgets.

/** GET /api/tenancy/role-rates — what an hour of each role costs (8.13). */
export async function getRoleRates(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "commercials", "read")
  await refusePortalCaller(cfg, guard)
  const { rows, total } = await listRoleRates(cfg, guard)
  return json({ roleRates: rows, total })
}

/** POST /api/tenancy/role-rates — set what a role's hour costs, or switch it off.
 *
 * ONE door for add, re-price and deactivate, because the ROLE is the key and all
 * three are the same sentence about it. See setRoleRate for why that is the lean
 * shape rather than a shortcut. */
export async function postSetRoleRate(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(request, env, "commercials", "edit")
  await refusePortalCaller(cfg, guard)
  if (typeof body.active !== "boolean") return fail(400, "invalid_input", "Live rate, or deactivated?")
  const { id, moved } = await setRoleRate(cfg, guard, actor, {
    roleName: requireText(body.roleName, "Role", TEXT_LIMITS.short),
    centsPerHour: centsPerHour(Number(body.centsPerHour)),
    active: body.active,
  })
  // R17 — a re-save that changed nothing moves no row, so it rings no bell.
  if (moved) await publishChange(env, guard.teamId, "role_rates", id)
  return json({ id })
}

/** GET /api/tenancy/app-money?appId= — the hours one app gives back and what
 * they are worth (8.13). INTERNAL: the money half is computed from the role rate
 * card, so this door is agency-only and the portal gateway does not open it. The
 * HOURS half a client may see — that is `GET /api/tenancy/impact`, which is a
 * different door answering a different question with no price in it. */
export async function getAppMoney(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "commercials", "read")
  const scope = await refusePortalCaller(cfg, guard)
  const appId = requireText(queryText(new URL(request.url).searchParams.get("appId"), "App"), "App", TEXT_LIMITS.short)
  const money = await appMoneyBack(cfg, guard, scope, appId)
  // SPELLED OUT rather than spread, and that is R27 rather than fussiness: the
  // contract a tool description promises is derived from the literal a door
  // returns, so `return json(theObject)` is a door whose response nothing can
  // read. Naming the six fields here is what makes the promise checkable.
  return json({
    appId: money.appId,
    savedSecondsPerMonth: money.savedSecondsPerMonth,
    moneyCentsPerMonth: money.moneyCentsPerMonth,
    unpricedProcesses: money.unpricedProcesses,
    lines: money.lines,
    caption: money.caption,
  })
}
