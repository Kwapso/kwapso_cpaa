// THE shared gating seam every domain worker (tenancy, content, data-ops, …)
// opens each request with: who is calling (one auth master), their ACTIVE team +
// role + database, and a permission check on the role's tall sheet. Locked rule:
// EVERY server request validates membership + rights — security is never just
// hiding UI. Lifted here so every worker gates IDENTICALLY with zero duplication.

import type { Fetcher, D1Database } from "@cloudflare/workers-types"

import type { SessionUser } from "../types"
import { d1Query, type D1Rest } from "./d1-rest"
import { LIST_HARD_CAP } from "./limits"
import { fail } from "./http"
import { readOrigin, type ActivityOrigin } from "./origin"
import { callerHasBudget, TOO_FAST, type RateLimitEnv } from "./rate-limit"
import { beginD1Timing, noteTeam } from "./timing"
import { requestId, traceHeaders } from "./trace"

/** The slice of a worker Env the gating needs. Every domain worker's Env
 * structurally satisfies this (the AUTH binding + the core DB + the Cloudflare
 * D1 credentials for reaching team databases). */
export type GatingEnv = {
  AUTH: Fetcher
  DB: D1Database
  CF_ACCOUNT_ID: string
  CF_D1_TOKEN?: string
  ADMIN_KEY?: string
  /** Cloudflare's rate-limiting binding, per worker. OPTIONAL on purpose — see
   * shared/workers/rate-limit.ts: an environment without it behaves exactly as
   * this app did before the limiter existed, which is what makes the binding safe
   * to add after the code that reads it. */
} & RateLimitEnv

export type Right = "read" | "create" | "edit" | "delete"
export type Actor = { id: string; email: string; name: string }
export type MemberGuard = {
  userId: string
  teamId: string
  roleId: string
  /** the team's main database id (modules also consult routing overrides) */
  databaseId: string
}
export type TeamCtx = { user: SessionUser; actor: Actor; cfg: D1Rest; guard: MemberGuard }

/** A handler-level rule failure that maps straight to an HTTP response. The
 * worker's central catch turns it into json({error, message}, status). */
export class GuardError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /** WHAT WE KNEW AND THE CALLER IS NOT TOLD — recorded, never returned.
     *
     * A GuardError is a CLEAN refusal, and every central catch answers it before
     * the recorder on purpose: this table is for the unexpected, and logging
     * every "you may not do that" would bury the rows that matter under the ones
     * that do not (error-log.ts's own contract says so).
     *
     * That reasoning is right for a permission refusal and it was silently WRONG
     * for the one class of refusal that carries a diagnosis. When Google answers
     * 401 because somebody revoked the grant, `googleFetch` turns it into a
     * GuardError — so the person reads "Google wouldn't allow that any more",
     * which is the correct sentence, and the STATUS and Google's own reason went
     * to `console.error` and nowhere else, by design. Measured on staging on
     * 2026-09-05: 1,900+ of 5,086 rows in the error store record the sentence we
     * showed somebody rather than the cause, and on the interactive path the
     * store learned nothing at all. Three weeks later "the Google sync stopped"
     * has no row that says why.
     *
     * So a refusal may now carry the thing the tail had. Setting it does not
     * change one byte of the caller's answer — `fail(status, code, message)` is
     * untouched — it only means the central catch has something worth recording.
     * Absent, which is the case for every permission gate in the codebase, and
     * nothing is recorded, exactly as before.
     *
     * NEVER a token, and never a query string: google-api.ts strips both before
     * it builds this, because that is where a person's search words live. */
    public detail?: string
  ) {
    super(message)
  }
}

/** WHAT TO RECORD ABOUT A THROWN THING — the diagnosis where there is one, the
 * message where there is not.
 *
 * The recording seam wants the sentence a developer can act on; the caller wants
 * the sentence a person can read. For everything except a diagnosed refusal
 * those are the same string, which is why this reads as a no-op most of the time
 * and is worth its own name anyway: `String(e)` at a recording site is exactly
 * how 327 cron rows came to say "Google couldn't answer that just now. Try
 * again." — our own words, quoted back at us, about a token Google had revoked.
 *
 * Use it at every site that turns a caught error into a row. */
export function causeOf(e: unknown): string {
  if (e instanceof GuardError) return e.detail ?? e.message
  return e instanceof Error ? e.message : String(e)
}

/** WHICH TEAM DATABASES THIS DEPLOYMENT CAN REACH DIRECTLY.
 *
 * A worker env carries a binding under a fixed name (`TEAM_DB_0`) and, beside
 * it, a plain var naming the database that binding points at (`TEAM_DB_0_ID`).
 * Two halves, because a D1 binding cannot be asked its own id at runtime and the
 * data door routes by id — the id is what `requireMember` puts on the guard.
 *
 * PAIRED OR IGNORED. A binding whose `_ID` var is missing is skipped in silence
 * at runtime rather than guessed at, because guessing would mean pointing a
 * query at a database nobody named. The pairing is not left to hope: the
 * `native-team-databases` check reads every wrangler config off disk and fails
 * the build when a binding and its var disagree, or when either is alone. The
 * runtime skip is the seatbelt; the check is the brake.
 *
 * An env with none of this behaves exactly as the app did before bindings
 * existed — every team over the REST door — which is what makes it safe to add
 * to one environment at a time. */
export function nativeTeamDatabases(env: GatingEnv): Record<string, D1Database> {
  const out: Record<string, D1Database> = {}
  for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
    const n = /^TEAM_DB_(\d+)$/.exec(key)
    if (!n) continue
    const id = (env as Record<string, unknown>)[`TEAM_DB_${n[1]}_ID`]
    if (typeof id !== "string" || !id) continue
    out[id] = value as D1Database
  }
  return out
}

/** The data-door config from a worker env. Team databases are reached DIRECTLY
 * where this deployment holds a binding for them and over the Cloudflare REST
 * door where it does not (see `natives` in d1-rest.ts). Throws
 * cloud_key_missing if the REST token isn't set yet — still required, because
 * the fall-through path and every database-management call go through it.
 *
 * `origin` is REQUIRED, and that is the point: every activity row written
 * through this config carries it, so a config built without deciding which
 * surface it serves is a config that writes history nobody can attribute. A
 * caller who may omit it is a caller who will — the same argument `getActivity`
 * makes for its own fence, held here by the compiler rather than by a comment.
 * A config assembled OUTSIDE a request — a cron sweep, the morning digest —
 * says `automation`, which is the truth: nobody clicked. */
export function d1ConfigFrom(env: GatingEnv, origin: ActivityOrigin): D1Rest {
  if (!env.CF_D1_TOKEN)
    throw new Error(
      "cloud_key_missing: the Cloudflare D1 token isn't set yet, so team databases can't be reached."
    )
  return {
    accountId: env.CF_ACCOUNT_ID,
    apiToken: env.CF_D1_TOKEN,
    natives: nativeTeamDatabases(env),
    // WHERE THIS DOOR'S SWALLOWED FAILURES ARE RECORDED (d1-rest.ts says why it
    // rides on the config). Every worker that builds a data-door config has the
    // core binding — it is in GatingEnv, because gating reads it on every
    // request — so the activity writer gets a durable store for free, at every
    // one of its call sites, without a fifth argument anybody can forget.
    core: env.DB,
    // WHICH FRONT DOOR THIS IS (origin.ts). Same reasoning as `core` above and
    // the same seam: the config is already everywhere the activity writer is.
    origin,
    // Where a NEW team's database is born. See d1CreateDatabase: measured on
    // staging, a database that landed in APAC while its workers sat in WEUR
    // cost about 150ms a trip, which a native binding does not fix — a binding
    // removes the API round trip, not the distance.
    location: (env as unknown as { D1_LOCATION?: string }).D1_LOCATION,
  }
}

/** How long a worker waits for auth to say who somebody is before it gives up.
 *
 * This is a same-colo service-binding call that normally answers in single-digit
 * milliseconds, so five seconds is not a tuning knob — it is a CEILING. R11
 * exempts service bindings from the timeout law because Cloudflare bounds them,
 * and that is true of the socket; it is not true of the worker on the other end,
 * which can be redeploying, throwing, or stuck on its own D1 call. Without a
 * ceiling, an unwell auth holds every gated request in five other workers open
 * for as long as it likes, and the queue behind them is the outage. */
export const AUTH_UNAVAILABLE_MS = 5_000

/** Ask the auth worker (one session system, one master) who this request is.
 *
 * THE HIGHEST-TRAFFIC CROSS-SERVICE CALL IN THE SYSTEM — every gated route in
 * five workers opens with it, which makes auth the component with the largest
 * blast radius (RESILIENCE.md). Two things follow from that, and they are the
 * whole reason this function is not a one-liner:
 *
 *   • A CEILING (above), so a slow auth degrades this request instead of the
 *     worker.
 *   • "AUTH IS DOWN" IS NOT "YOU ARE SIGNED OUT". `null` means the session was
 *     not recognised, and callers turn that into a 401 that signs somebody out
 *     of the app. An outage that returned `null` would therefore log every
 *     signed-in person out of a healthy app because a different worker was ill —
 *     and they would each try to sign in again, against the worker that is
 *     already struggling. So an outage throws a 503 instead: every worker maps
 *     GuardError first, the caller keeps their session, and the error store gets
 *     a row that says `auth_unavailable` rather than a generic 500.
 *
 * There is deliberately NO fallback answer here — no cached identity, no
 * "assume signed in". Guessing on the identity read is guessing on the gate. */
export async function whoAmI(request: Request, env: GatingEnv): Promise<SessionUser | null> {
  // The init is assembled apart and cast once. `shared/` is compiled by the two
  // WEB workspaces as well as the workers, and there the ambient `AbortSignal`
  // is the DOM one while the binding wants Cloudflare's — structurally the same
  // object, two declarations. Same reason `forwardToDoor` types its fetcher
  // structurally rather than as a `Fetcher`.
  const init = {
    headers: { Cookie: request.headers.get("Cookie") ?? "", ...traceHeaders(requestId(request)) },
    signal: AbortSignal.timeout(AUTH_UNAVAILABLE_MS),
  } as unknown as Parameters<typeof env.AUTH.fetch>[1]

  try {
    const res = await env.AUTH.fetch("https://auth/api/auth/me", init)
    if (!res.ok) return null
    return ((await res.json()) as { user: SessionUser }).user
  } catch {
    // Includes an unreadable body: auth answering nonsense is auth being
    // unwell, and it must not read to the caller as "you are signed out".
    throw new GuardError(
      503,
      "auth_unavailable",
      "We can't check who you are right now. Try again in a moment."
    )
  }
}

export function toActor(user: SessionUser): Actor {
  return {
    id: user.id,
    email: user.email,
    name: [user.firstName, user.lastName].filter(Boolean).join(" "),
  }
}

/** Active member of this team? Throws not_member if not. Returns the guard the
 * permission checks + module queries use. */
export async function requireMember(
  env: GatingEnv,
  userId: string,
  teamId: string
): Promise<MemberGuard> {
  const row = await env.DB.prepare(
    `SELECT tm.role_id, t.database_id
     FROM team_members tm
     JOIN teams t ON t.id = tm.team_id AND t.deactivated_at IS NULL AND t.db_status = 'ready'
     WHERE tm.team_id = ? AND tm.user_id = ? AND tm.deactivated_at IS NULL`
  )
    .bind(teamId, userId)
    .first<{ role_id: string; database_id: string }>()
  if (!row) throw new GuardError(403, "not_member", "You're not a member of this team.")
  return { userId, teamId, roleId: row.role_id, databaseId: row.database_id }
}

/** The standard opening every team-scoped handler shares: who are you, the
 * Cloudflare config, and a validated guard for your ACTIVE team. Throws
 * GuardError (mapped to a response centrally) on any failure. */
export async function teamContext(request: Request, env: GatingEnv): Promise<TeamCtx> {
  const user = await whoAmI(request, env)
  if (!user) throw new GuardError(401, "signed_out", "Not signed in.")

  // THE PER-CALLER CEILING, and this is the one place in the request path where it
  // can be applied honestly. The gateway cannot: it does not decode a session, so
  // it does not know who is asking, and the only keys available to it are an IP
  // (one client's whole office in one bucket) or a fresh auth round trip on every
  // good request. Here the caller has just been resolved, so keying on the person
  // costs nothing — and every team-scoped door on tenancy, content and data-ops
  // passes through this function exactly once, so the count is one per request
  // rather than one per permission check.
  //
  // BEFORE the membership read below, because that read is the work being
  // protected. It fails OPEN if the limiter is missing or unwell (rate-limit.ts
  // argues that at length): a broken safety valve must not become an outage.
  if (!(await callerHasBudget(env, user.id)))
    throw new GuardError(429, "too_many_requests", TOO_FAST)

  // whoAmI already carries the active team (auth /me reads it fresh from the
  // users row) — no need for a second native-DB read for the same value.
  if (!user.currentTeamId) throw new GuardError(409, "no_team", "No active team.")

  // The config carries this request's trip counter (timing.ts). Attached HERE
  // because this is the one function every team-scoped door passes through
  // exactly once — the same property that makes it the honest place for the
  // per-caller ceiling above makes it the honest place to start the clock.
  // …and the SURFACE rides on it from here too (origin.ts). Read off the header
  // the two gateways stamp and the two act-as-user executors carry, in the one
  // function every team-scoped door passes through exactly once — the same
  // property the three paragraphs above already lean on. Nothing gates on it; it
  // is a label on history, and a header we do not recognise reads as `unknown`
  // rather than turning a working request into a 400.
  const cfg: D1Rest = {
    ...d1ConfigFrom(env, readOrigin(request)),
    stats: beginD1Timing(request),
  }
  const guard = await requireMember(env, user.id, user.currentTeamId)
  // WHO WAS ASKING, for the central catch. error_logs has carried team_id and
  // user_id columns since core 0019 and 0 of 200 live rows held either,
  // because the catch sits outside the handler and never met the guard. Keyed
  // on the REQUEST (the same reasoning as the scope cache: a string key is a
  // cross-tenant bug, a request key dies with the request), written here
  // because this is the one function every team-scoped door passes exactly
  // once — the property the two paragraphs above already lean on twice.
  errorIdentity.set(request, { teamId: guard.teamId, userId: guard.userId })
  // …and to the SLOW-DOOR line, for the same reason and in the same place: a
  // door that is slow for the one team with ninety thousand rows printed
  // identically to a door that is slow for everybody (timing.ts).
  noteTeam(request, guard.teamId)
  return { user, actor: toActor(user), cfg, guard }
}

const errorIdentity = new WeakMap<Request, { teamId: string; userId: string }>()

/** The identity the central catch may attach to an error row — the resolved
 * caller when the request got that far, and honestly nothing when it did not
 * (a 401, a pre-team door, a cron). */
export function identityFor(request: Request): { teamId?: string; userId?: string } {
  return errorIdentity.get(request) ?? {}
}

type RightsRow = {
  can_read: number
  can_create: number
  can_edit: number
  can_delete: number
}

/** ONE PERMISSION ROW PER MODULE PER REQUEST.
 *
 * The read already returns all FOUR rights for a module — it always did — and
 * then threw three of them away, so a door checking `read` and a door checking
 * `edit` on the same module paid twice for the same row. One record screen opens
 * seven doors, and every one of them starts with a permission read: seven
 * separate HTTPS requests to the D1 REST API to ask questions the first answer
 * already contained.
 *
 * KEYED ON THE GUARD OBJECT, exactly as `accountScope` is, and for the same
 * tenant-isolation reason: a Worker isolate serves many callers, so a cache
 * keyed on `roleId` would outlive the request and could answer one caller with
 * another's permissions. `requireMember` returns a fresh object literal per
 * request, so the guard's identity is the request's identity and two requests
 * can never share a key. The inner Map is keyed on the MODULE, which is always a
 * code literal, never a request value.
 *
 * THE FRESHNESS BOUNDARY DOES NOT MOVE — it was "once per permission check",
 * it is now "once per module per request". A role edited mid-request would
 * previously have been half-applied across that request's own checks, which is
 * worse than a consistent snapshot, not better. Across requests nothing changes:
 * the next request reads the row again.
 *
 * A REJECTION IS NOT CACHED, so a failed read does not poison the rest of the
 * request. */
const rightsPerRequest = new WeakMap<MemberGuard, Map<string, Promise<RightsRow | null>>>()

function moduleRights(cfg: D1Rest, guard: MemberGuard, module: string): Promise<RightsRow | null> {
  let byModule = rightsPerRequest.get(guard)
  if (!byModule) {
    byModule = new Map()
    rightsPerRequest.set(guard, byModule)
  }
  const memo = byModule.get(module)
  if (memo) return memo
  const fresh = d1Query<RightsRow>(
    cfg,
    guard.databaseId,
    "SELECT can_read, can_create, can_edit, can_delete FROM role_permissions WHERE role_id = ? AND module = ?",
    [guard.roleId, module]
  )
    .then((rows) => rows[0] ?? null)
    .catch((err: unknown) => {
      byModule.delete(module)
      throw err
    })
  byModule.set(module, fresh)
  return fresh
}

/** THE WHOLE SHEET IN ONE READ — every right this role holds, as `module:right`.
 *
 * `moduleRights` above is one query PER MODULE, which is exactly right for a door
 * that checks one thing. It is exactly wrong for a caller that wants to know
 * what a role can do across the board: the assistant's tool list is gated on
 * about twenty modules, and twenty REST-door round trips at ~400ms each is not a
 * read, it is a page load.
 *
 * So this is the other shape of the same fact, and it is bounded by the module
 * catalogue rather than by anything a request can influence. Memoised on the
 * GUARD OBJECT for the same tenant-isolation reason as `moduleRights`: a
 * role-keyed cache in a Worker isolate can answer one caller with another
 * caller's permissions, and the guard is a fresh object per request.
 *
 * A failure is not cached and not swallowed — the caller decides what an
 * unreadable sheet means, and for the assistant it means "offer everything and
 * let the doors refuse", which is what it did before this existed. */
const sheetPerRequest = new WeakMap<MemberGuard, Promise<Set<string>>>()

export function rightsSheet(cfg: D1Rest, guard: MemberGuard): Promise<Set<string>> {
  const memo = sheetPerRequest.get(guard)
  if (memo) return memo
  const fresh = d1Query<RightsRow & { module: string }>(
    cfg,
    guard.databaseId,
    // Bounded by the number of MODULES, which is a property of the code and not
    // of any request (R14's reasoning, on a read too small to page).
    `SELECT module, can_read, can_create, can_edit, can_delete FROM role_permissions WHERE role_id = ? LIMIT ${LIST_HARD_CAP}`,
    [guard.roleId]
  )
    .then((rows) => {
      const held = new Set<string>()
      for (const r of rows)
        for (const right of ["read", "create", "edit", "delete"] as const)
          if (r[`can_${right}`] === 1) held.add(`${r.module}:${right}`)
      return held
    })
    .catch((err: unknown) => {
      sheetPerRequest.delete(guard)
      throw err
    })
  sheetPerRequest.set(guard, fresh)
  return fresh
}

/** Does the member's role hold this right on this module? (tall-sheet read) */
export async function hasRight(
  cfg: D1Rest,
  guard: MemberGuard,
  module: string,
  right: Right
): Promise<boolean> {
  const row = await moduleRights(cfg, guard, module)
  if (!row) return false
  return row[`can_${right}`] === 1
}

/** hasRight, but throws a 403 GuardError — the one-liner for handlers. */
export async function requireRight(
  cfg: D1Rest,
  guard: MemberGuard,
  module: string,
  right: Right
): Promise<void> {
  // Name the missing right in plain words — a person (or the agent explaining a
  // refused step) can then see WHICH permission their role lacks, not just "no".
  if (!(await hasRight(cfg, guard, module, right)))
    throw new GuardError(
      403,
      "forbidden",
      // String(module) defensively: a prototype-shaped lookup once handed this an
      // OBJECT as the module name and the refusal message itself crashed into a
      // 500 (live, 26 Aug 2026). The lookup bug is fixed at its site; a denial
      // message must still never be the thing that throws.
      `You don't have permission to do that, your role is missing the "${right}" right on ${String(module).replace(/_/g, " ")}.`
    )
}

/** Shared guard for the maintenance endpoints (x-admin-key header). */
export function adminGuard(request: Request, env: GatingEnv): Response | null {
  if (!env.ADMIN_KEY) return fail(503, "admin_key_missing", "Maintenance key not set.")
  if (request.headers.get("x-admin-key") !== env.ADMIN_KEY)
    return fail(403, "forbidden", "Bad maintenance key.")
  return null
}
