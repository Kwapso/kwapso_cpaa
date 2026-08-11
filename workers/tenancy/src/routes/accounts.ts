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
import { csvResponse, toCsv } from "../../../../shared/workers/csv"
import { EXPORT_HARD_CAP } from "../../../../shared/workers/limits"
import { optionalText, queryText, requireText, TEXT_LIMITS } from "../../../../shared/workers/validate"
import { publishChange } from "../../../../shared/workers/realtime"
import { gated, gatedBody, openTeam } from "../../../../shared/workers/route"
import { accountScope, type AccountScope } from "../../../../shared/workers/account-scope"
import { GuardError, teamContext, whoAmI, type MemberGuard } from "../../../../shared/workers/gating"
import type { D1Rest } from "../../../../shared/workers/d1-rest"
import type { PortalUser } from "../../../../shared/types"
import {
  createAccount,
  getAccount,
  getAccountRow,
  grantPortalAccess,
  linkPerson,
  listAccounts,
  listAccountsForExport,
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
  const page = await listAccounts(cfg, guard, scope, {
    ...accountQuery(url),
    // Capped like every other query parameter — an opaque cursor is ~70 chars, so a
    // megabyte of it is a bad request, not an atob + JSON.parse of a megabyte.
    cursor: queryText(url.searchParams.get("cursor"), "Cursor") ?? null,
  })
  return pagedJson("accounts", page)
}

/** The three filters an accounts read accepts, parsed ONCE — the list door and
 * the export door narrow by the same words, so "export what I'm looking at" and
 * "list what I'm looking at" can never mean two different things. */
function accountQuery(url: URL): { q?: string; type?: "entity" | "individual"; parentId?: string } {
  const rawType = queryText(url.searchParams.get("type"), "Type")
  return {
    q: queryText(url.searchParams.get("q"), "Search"),
    type: rawType === "entity" || rawType === "individual" ? rawType : undefined,
    parentId: queryText(url.searchParams.get("parentId"), "Parent"),
  }
}

/** GET /api/tenancy/accounts/export — the caller's accounts as a full-field CSV
 * (EXPORT NEEDS READ, like every other export door). Same gate, same fence, same
 * FILTERS as the list — a machine caller pulls the same book the Export CSV
 * button does, and a client login pulls only their own.
 *
 * AND IT IS WHOLE, OR IT IS AN ERROR. Accounts grow with the business, so this
 * is the one export whose collection can outrun the deliberate-download ceiling
 * — and it used to answer that by handing back the first 10,000 rows with
 * nothing to say they weren't all of them. A short file that looks whole is the
 * worst of the three possible answers, and worse here than anywhere: the columns
 * lead with the import format, so re-importing a silently-truncated export is
 * data loss wearing a round trip's clothes. Over the cap the caller narrows with
 * q / type / parentId (the same three the screen and `list_accounts` take), or
 * reads the paged list. Both surfaces get this same sentence from this same
 * door. */
export async function getAccountsExport(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "accounts", "read")
  const scope = await accountScope(cfg, guard)
  const { rows, complete } = await listAccountsForExport(cfg, guard, scope, accountQuery(new URL(request.url)))
  if (!complete)
    return fail(
      413,
      "export_too_large",
      `That's more than ${EXPORT_HARD_CAP.toLocaleString("en-GB")} accounts, which is more than one file can carry. Narrow it — search for a name, pick companies or people, or ask for one parent's accounts — or read the list a page at a time.`
    )
  const csv = toCsv(
    [
      "name", "accountType", "code", "email", "phone", "address", "status",
      "parent_account_id", "currency", "locale", "timezone", "commercials_visible",
      "active", "created_at", "created_by", "updated_at", "updated_by",
    ],
    rows.map((r) => [
      r.name, r.accountType, r.code, r.email, r.phone, r.address, r.status,
      r.parentAccountId, r.currency, r.locale, r.timezone, r.commercialsVisible,
      r.active, r.createdAt, r.createdByName, r.updatedAt, r.editedByName,
    ])
  )
  return csvResponse("accounts.csv", csv)
}

/** GET /api/tenancy/accounts/detail?id= — one account, its people, its logins. */
export async function getAccountDetail(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "accounts", "read")
  const scope = await accountScope(cfg, guard)
  const id = queryText(new URL(request.url).searchParams.get("id"), "Id")
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
  const accountType = requireText(body.accountType, "Kind", TEXT_LIMITS.short)
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
  await publishChange(env, guard.teamId, "accounts", id, "add")
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
  await publishChange(env, guard.teamId, "accounts", id)
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
  await publishChange(env, guard.teamId, "accounts", id)
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
  if (changed) await publishChange(env, guard.teamId, "accounts", id)
  return json({ ok: true })
}

/** POST /api/tenancy/accounts/links — say that a person is a contact of an account.
 *
 * THE PING NAMES THE ACCOUNT, not the link row. A contact is the SHAPE of an
 * account, never a record with a list of its own — it is only ever read on its
 * account's detail — so the account id is the one id a listener can act on
 * (re-pull that row, refresh that open detail). Same for the login pings below. */
export async function postLinkPerson(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(
    request,
    env,
    "accounts",
    "create"
  )
  const scope = await accountScope(cfg, guard)
  const accountId = requireText(body.accountId, "Account", TEXT_LIMITS.short)
  const id = await linkPerson(cfg, guard, scope, actor, {
    accountId,
    personAccountId: requireText(body.personAccountId, "Person", TEXT_LIMITS.short),
    relationship: optionalText(body.relationship, "Relationship", TEXT_LIMITS.short),
    isMainStakeholder: body.isMainStakeholder === true,
  })
  await publishChange(env, guard.teamId, "account_links", accountId, "add")
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
  // R17: null = zero rows moved = already like that → no ping, no duplicate history.
  const accountId = await setLinkActive(cfg, guard, scope, actor, id, body.active)
  if (accountId) await publishChange(env, guard.teamId, "account_links", accountId)
  return json({ ok: true })
}

/** GET /api/tenancy/portal-users[?accountId=] — who can log in. */
export async function getPortalUsers(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "portal_users", "read")
  const scope = await accountScope(cfg, guard)
  const accountId = queryText(new URL(request.url).searchParams.get("accountId"), "Account")
  const [rows, total] = await Promise.all([
    listPortalUsers(cfg, guard, scope, accountId),
    countPortalUsers(cfg, guard, scope, accountId),
  ])
  return json({ portalUsers: await withEmails(env, rows), total })
}

/** POST /api/tenancy/portal-users — hand someone a login.
 *
 * The person is named ONE way, on every surface: `personAccountId`, a person
 * already on the account's own records (a contact, or the individual account
 * itself). The door reads that row's email THROUGH THE FENCE and resolves it
 * against the global users table. Identity is looked up outside the fence, so
 * the email it is looked up by has to come from inside it — a caller can only
 * ever resolve people already on their own records, never a typed-in address.
 *
 * There used to be a second way in: a caller "that already holds an identity"
 * could pass a bare `userId`. It is gone, and no surface has it back — a holder
 * of portal_users:create could turn ANY account on the platform into a fenced
 * portal caller, colleagues and the owner included. The machine surface reaches
 * this door through the same one parameter a person does. */
export async function postGrantPortalAccess(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<Body>(
    request,
    env,
    "portal_users",
    "create"
  )
  const scope = await accountScope(cfg, guard)
  const accountId = requireText(body.accountId, "Account", TEXT_LIMITS.short)
  // A login is granted to a PERSON ON THE BOOKS, resolved through the fence —
  // never to a bare platform id typed into a body. The raw-id path let a holder
  // of portal_users:create turn any account on the platform into a fenced portal
  // caller, including a colleague and including the owner: portal-ness is decided
  // by the PRESENCE of this row, so the grant is a demotion nobody consented to.
  const personAccountId = requireText(body.personAccountId, "Person", TEXT_LIMITS.short)
  const userId = await userIdForPerson(env, cfg, guard, scope, personAccountId)
  if (!userId) return fail(400, "invalid_input", "Pick the person this login is for.")
  // Staff are not clients. Granting a portal login to a team member would fence
  // them out of the agency side at the next request.
  const staff = await env.DB.prepare(
    "SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ? AND deactivated_at IS NULL"
  )
    .bind(guard.teamId, userId)
    .first()
  if (staff)
    return fail(
      409,
      "is_staff",
      "That person is a member of your team — a client login would lock them out of the agency app."
    )
  const id = await grantPortalAccess(cfg, guard, scope, actor, {
    onAccountId: accountId,
    personAccountId,
    userId,
    appRestriction: optionalText(body.appRestriction, "App restriction", TEXT_LIMITS.short),
  })
  await publishChange(env, guard.teamId, "portal_users", accountId, "add")
  return json({ id })
}

/** A person's account row (inside the fence) → their platform account. A client
 * has to have signed in at least once before a login can be switched on for
 * them; both refusals say plainly what to do next. */
async function userIdForPerson(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  scope: AccountScope,
  personAccountId: string
): Promise<string> {
  const person = await getAccountRow(cfg, guard, scope, personAccountId)
  const email = person.email?.trim().toLowerCase()
  if (!email)
    throw new GuardError(
      400,
      "no_email",
      `Add an email address to ${person.name} first — that's how they sign in.`
    )
  const row = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND deactivated_at IS NULL")
    .bind(email)
    .first<{ id: string }>()
  if (!row)
    throw new GuardError(
      404,
      "no_account",
      `${person.name} hasn't signed in here yet. Ask them to sign in once with ${email}, then switch their access on.`
    )
  return row.id
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
  // R17: null = the login was already in that state → no ping, no history row.
  const accountId = await setPortalAccessActive(cfg, guard, scope, actor, id, body.active)
  if (accountId) await publishChange(env, guard.teamId, "portal_users", accountId)
  return json({ ok: true })
}

/** GET /api/tenancy/portal/context — WHAT KIND of caller this is, where they may
 * stand, and where they stand now. Staff get an empty list, which is the honest
 * answer: the switcher is a client-side idea and there is nothing for staff to
 * switch.
 *
 * `kind` is the part another worker needs, and the reason it is here: an empty
 * list is AMBIGUOUS. Staff answer with nothing; so does a client whose access
 * was revoked, and so does one with no company yet. Any caller reading emptiness
 * as "staff" would fail OPEN on exactly the people the fence exists for — the
 * inversion `accountScope` warns about in its own header ("portal-ness is decided
 * by the PRESENCE of a portal_users row, never by its absence"). So the door says
 * which it is, out loud, and the machine surface asks THIS rather than inventing
 * a second opinion: `portal_users` lives in the team database, and tenancy is the
 * worker that owns the fence. */
export async function getPortalContext(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  const scope = await accountScope(cfg, guard)
  return json({ kind: scope.kind, ...(await portalStandings(cfg, guard, scope)) })
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
  // use is the one worth answering with. Same shape as the context door — one
  // response type, so a client never has to know which call it came from.
  const after = await accountScope(cfg, guard)
  return json({ kind: after.kind, ...(await portalStandings(cfg, guard, after)) })
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
