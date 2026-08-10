// Customer-spine routes: the accounts themselves, the people linked to them, and
// who may log in to the portal. Gated by the `accounts` module (the records and
// their shape) and `portal_users` (handing out a login — a bigger decision, so a
// separate switch on the matrix).
//
// EVERY handler here does the same four things, in the same order:
//   gate on the caller's ROLE (R10)  →  resolve the caller's ACCOUNT SET (the
//   guard corridor)  →  validate at the boundary (R8)  →  publish (R1).
//
// The role says WHAT you may do; the account set says WHICH rows you may do it
// to. Neither substitutes for the other: a client-side person can hold every
// right on the matrix and still reach exactly one account's data.

import { fail, json, pagedJson } from "../../../../shared/workers/http"
import { optionalText, requireText, TEXT_LIMITS } from "../../../../shared/workers/validate"
import { publishChange } from "../../../../shared/workers/realtime"
import { gated, gatedBody, openTeam } from "../../../../shared/workers/route"
import { teamContext, whoAmI } from "../../../../shared/workers/gating"
import { accountScope } from "../../../../shared/workers/account-scope"
import type { PortalUser } from "../../../../shared/types"
import {
  createAccount,
  getAccount,
  grantPortalAccess,
  linkPerson,
  listAccounts,
  listPortalUsers,
  countPortalUsers,
  portalStandings,
  switchPortalAccount,
  setAccountActive,
  setAccountParent,
  setLinkActive,
  setPortalAccessActive,
  updateAccount,
} from "../lib/accounts"
import type { Env } from "../env"

/** A route body is untrusted JSON until each field is validated below — the
 * alias keeps the gate call free of nested angle brackets, which the gating-seam
 * scan (rightly) refuses to parse: a gate it cannot SEE is a gate that does not
 * count. */
type Body = Record<string, unknown>

/** The optional-text fields an account carries, validated identically on create
 * and edit so the two can't drift into different limits. */
function accountFields(body: Record<string, unknown>) {
  return {
    email: optionalText(body.email, "Email", TEXT_LIMITS.short),
    phone: optionalText(body.phone, "Phone", TEXT_LIMITS.short),
    address: optionalText(body.address, "Address", TEXT_LIMITS.long),
    code: optionalText(body.code, "Reference", TEXT_LIMITS.short),
    currency: optionalText(body.currency, "Currency", TEXT_LIMITS.short),
    locale: optionalText(body.locale, "Language", TEXT_LIMITS.short),
    timezone: optionalText(body.timezone, "Time zone", TEXT_LIMITS.short),
    status: optionalText(body.status, "Status", TEXT_LIMITS.short),
  }
}

/** GET /api/tenancy/accounts — the caller's accounts, paged (R14: this list grows
 * with ordinary use, so it answers with a cursor rather than a ceiling). */
export async function getAccounts(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "accounts", "read")
  const scope = await accountScope(cfg, guard)
  const url = new URL(request.url)
  const rawType = url.searchParams.get("type")
  const type = rawType === "entity" || rawType === "individual" ? rawType : undefined
  const page = await listAccounts(cfg, guard, scope, {
    q: optionalText(url.searchParams.get("q"), "Search", TEXT_LIMITS.short),
    type,
    parentId: optionalText(url.searchParams.get("parentId"), "Parent", TEXT_LIMITS.short),
    cursor: url.searchParams.get("cursor"),
  })
  return pagedJson("accounts", page)
}

/** GET /api/tenancy/accounts/detail?id= — one account, its people, its logins. */
export async function getAccountDetail(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "accounts", "read")
  const scope = await accountScope(cfg, guard)
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return fail(400, "invalid_input", "Which account?")
  const detail = await getAccount(cfg, guard, scope, id)
  return json({ ...detail, portalUsers: await withEmails(env, detail.portalUsers) })
}

export async function postCreateAccount(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(
    request,
    env,
    "accounts",
    "create"
  )
  const scope = await accountScope(cfg, guard)
  const accountType = body.accountType
  if (accountType !== "entity" && accountType !== "individual")
    return fail(400, "invalid_input", "An account is either a company or a person.")
  const name = requireText(body.name, "Name", TEXT_LIMITS.short)
  const id = await createAccount(cfg, guard, scope, actor, {
    accountType,
    name,
    parentAccountId: optionalText(body.parentAccountId, "Parent", TEXT_LIMITS.short),
    ...accountFields(body),
  })
  // Row-level: carry the new id so an open list patches just that row.
  await publishChange(env.REALTIME, guard.teamId, "accounts", id, "add")
  return json({ id })
}

export async function postUpdateAccount(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(
    request,
    env,
    "accounts",
    "edit"
  )
  const scope = await accountScope(cfg, guard)
  const id = requireText(body.id, "Account", TEXT_LIMITS.short)
  const name = requireText(body.name, "Name", TEXT_LIMITS.short)
  await updateAccount(cfg, guard, scope, actor, id, {
    name,
    ...accountFields(body),
    commercialsVisible: typeof body.commercialsVisible === "boolean" ? body.commercialsVisible : undefined,
  })
  await publishChange(env.REALTIME, guard.teamId, "accounts", id)
  return json({ ok: true })
}

/** POST /api/tenancy/accounts/parent — move an account (or send it to the top with
 * a null parent). The loop refusal comes back as a plain 409 sentence. */
export async function postAccountParent(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(
    request,
    env,
    "accounts",
    "edit"
  )
  const scope = await accountScope(cfg, guard)
  const id = requireText(body.id, "Account", TEXT_LIMITS.short)
  const parentAccountId = optionalText(body.parentAccountId, "Parent", TEXT_LIMITS.short) ?? null
  await setAccountParent(cfg, guard, scope, actor, id, parentAccountId)
  await publishChange(env.REALTIME, guard.teamId, "accounts", id)
  return json({ ok: true })
}

/** POST /api/tenancy/accounts/active — archive / restore (never delete). */
export async function postAccountActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(
    request,
    env,
    "accounts",
    "delete"
  )
  const scope = await accountScope(cfg, guard)
  const id = requireText(body.id, "Account", TEXT_LIMITS.short)
  if (typeof body.active !== "boolean") return fail(400, "invalid_input", "Archive or restore?")
  // R17: a repeat moves zero rows → no ping, no duplicate history.
  const changed = await setAccountActive(cfg, guard, scope, actor, id, body.active)
  if (changed) await publishChange(env.REALTIME, guard.teamId, "accounts", id)
  return json({ ok: true })
}

export async function postLinkPerson(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(
    request,
    env,
    "accounts",
    "create"
  )
  const scope = await accountScope(cfg, guard)
  const id = await linkPerson(cfg, guard, scope, actor, {
    accountId: requireText(body.accountId, "Account", TEXT_LIMITS.short),
    personAccountId: requireText(body.personAccountId, "Person", TEXT_LIMITS.short),
    relationship: optionalText(body.relationship, "Relationship", TEXT_LIMITS.short),
    isMainStakeholder: body.isMainStakeholder === true,
  })
  await publishChange(env.REALTIME, guard.teamId, "account_links", id, "add")
  return json({ id })
}

export async function postLinkActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(
    request,
    env,
    "accounts",
    "delete"
  )
  const scope = await accountScope(cfg, guard)
  const id = requireText(body.id, "Contact link", TEXT_LIMITS.short)
  if (typeof body.active !== "boolean") return fail(400, "invalid_input", "Unlink or relink?")
  const changed = await setLinkActive(cfg, guard, scope, actor, id, body.active)
  if (changed) await publishChange(env.REALTIME, guard.teamId, "account_links", id)
  return json({ ok: true })
}

/** GET /api/tenancy/portal-users[?accountId=] — who can log in. */
export async function getPortalUsers(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "portal_users", "read")
  const scope = await accountScope(cfg, guard)
  const accountId = optionalText(
    new URL(request.url).searchParams.get("accountId"),
    "Account",
    TEXT_LIMITS.short
  )
  const [rows, total] = await Promise.all([
    listPortalUsers(cfg, guard, scope, accountId),
    countPortalUsers(cfg, guard, scope, accountId),
  ])
  return json({ portalUsers: await withEmails(env, rows), total })
}

export async function postGrantPortalAccess(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(
    request,
    env,
    "portal_users",
    "create"
  )
  const scope = await accountScope(cfg, guard)
  const id = await grantPortalAccess(cfg, guard, scope, actor, {
    accountId: requireText(body.accountId, "Account", TEXT_LIMITS.short),
    userId: requireText(body.userId, "Person", TEXT_LIMITS.short),
    appRestriction: optionalText(body.appRestriction, "App restriction", TEXT_LIMITS.short),
  })
  await publishChange(env.REALTIME, guard.teamId, "portal_users", id, "add")
  return json({ id })
}

/** POST /api/tenancy/portal-users/active — the hard revoke, and its undo. The row
 * is deactivated, never deleted: the login dies, every record stays. */
export async function postPortalAccessActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(
    request,
    env,
    "portal_users",
    "delete"
  )
  const scope = await accountScope(cfg, guard)
  const id = requireText(body.id, "Portal access", TEXT_LIMITS.short)
  if (typeof body.active !== "boolean") return fail(400, "invalid_input", "Revoke or restore?")
  const changed = await setPortalAccessActive(cfg, guard, scope, actor, id, body.active)
  if (changed) await publishChange(env.REALTIME, guard.teamId, "portal_users", id)
  return json({ ok: true })
}

/** GET /api/tenancy/portal/context — where this client login may stand and where
 * they stand now. Staff get an empty list, which is the honest answer: the
 * switcher is a client-side idea and there is nothing for staff to switch. */
export async function getPortalContext(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  const scope = await accountScope(cfg, guard)
  return json(await portalStandings(cfg, guard, scope))
}

/** POST /api/tenancy/portal/switch-account — a client login moves to another of
 * their own companies, and the fence follows them.
 *
 * IDENTITY-gated, like switch-team: no role can grant or deny this, because the
 * question is WHO the caller is, not what they may do. The set they may stand in
 * comes from the guard corridor — never from the body — so the only thing the
 * body can do is name one of their own companies or be refused. */
export async function postSwitchPortalAccount(request: Request, env: Env): Promise<Response> {
  const user = await whoAmI(request, env)
  if (!user) return fail(401, "signed_out", "Not signed in.")

  const { cfg, guard, body } = await openTeam<Body>(request, env)
  const accountId = requireText(body.accountId, "Account", TEXT_LIMITS.short)
  const scope = await accountScope(cfg, guard)
  await switchPortalAccount(cfg, guard, scope, accountId)
  // Re-resolve rather than patch the old stamp: the fence the next request will
  // use is the one worth answering with.
  return json(await portalStandings(cfg, guard, await accountScope(cfg, guard)))
}

/** Identity lives in the GLOBAL users table and is never mirrored into a team
 * database, so the email is joined on the way out — for the ids the scoped read
 * already returned, and no others. */
async function withEmails(env: Env, rows: PortalUser[]): Promise<PortalUser[]> {
  if (!rows.length) return rows
  const marks = rows.map(() => "?").join(", ")
  const found = await env.DB.prepare(`SELECT id, email FROM users WHERE id IN (${marks})`)
    .bind(...rows.map((r) => r.userId))
    .all<{ id: string; email: string }>()
  const byId = new Map((found.results ?? []).map((u) => [u.id, u.email]))
  return rows.map((r) => ({ ...r, email: byId.get(r.userId) ?? null }))
}
