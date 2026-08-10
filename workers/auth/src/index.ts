// kwapso AUTH worker — every login-related action lives here, each as its own
// small handler (these become MCP-catalogued actions via the gateway later).
//
//   POST /api/auth/email/start          { email }        -> sends a 6-digit code
//   POST /api/auth/email/verify         { email, code }  -> logs in (sets cookie)
//   POST /api/auth/email/change/start   { email }        -> code to the NEW email
//   POST /api/auth/email/change/verify  { email, code }  -> switch email + log it
//   GET  /api/auth/me                                    -> who am I?
//   GET  /api/auth/activity                              -> my account history (name/photo/email)
//   POST /api/auth/logout                                -> forget me
//   GET  /api/auth/health                                -> is this worker alive?

import { fail, json } from "../../../shared/workers/http"
import { GuardError } from "../../../shared/workers/gating"
import { optionalText, requireText, TEXT_LIMITS } from "../../../shared/workers/validate"
import { logError, recordWorkerError } from "../../../shared/workers/error-log"
import type { Env } from "./env"
import { sha256Hex } from "./lib/crypto"
import { isValidEmail, normalizeEmail, sendEmail, sendLoginCode } from "./lib/email"
import { clientIp, mintLoginCode, verifyLoginCode } from "./lib/login-codes"
import { TEST_LOGIN_BUCKET } from "./lib/constants"
import { startEmailChange, verifyEmailChange } from "./lib/email-change"
import { createPinnedSession,
  createSession,
  destroySession,
  getSessionUser,
  readCookie,
  SESSION_COOKIE,
} from "./lib/sessions"
import { listAccountActivity } from "./lib/account-activity"
import { updateProfile, type ProfileInput } from "./lib/profile"
import {
  findOrCreateUserByEmail,
  toSessionUser,
} from "./lib/users"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    const route = `${request.method} ${pathname}`

    try {
      switch (route) {
        case "POST /api/auth/email/start":
          return await emailStart(request, env)
        case "POST /api/auth/email/verify":
          return await emailVerify(request, env)
        // NON-PRODUCTION test door (its OWN TEST_LOGIN_KEY secret, fails closed,
        // and refused outright when ENVIRONMENT is "production"): mints a normal
        // login code and returns it ONCE, so automated tests can sign in without
        // any code ever being echoed by the real send door. See adminTestLogin.
        case "POST /api/auth/admin/test-login":
          return await adminTestLogin(request, env)
        case "POST /api/auth/email/change/start":
          return await emailChangeStart(request, env)
        case "POST /api/auth/email/change/verify":
          return await emailChangeVerify(request, env)
        case "GET /api/auth/me":
          return await me(request, env)
        case "GET /api/auth/activity":
          return await activity(request, env)
        case "POST /api/auth/profile":
          return await profile(request, env)
        case "POST /api/auth/logout":
          return await logout(request, env)
        case "GET /api/auth/health":
          return json({ ok: true })
        // Internal: other workers send branded emails THROUGH auth (it owns the
        // Resend key). NOT under /api/ — the gateway never routes it publicly;
        // only a service binding (env.AUTH.fetch) can reach it.
        case "POST /internal/send-email":
          return await internalSendEmail(request, env)
        // Internal: the gateway forwards CLIENT error beacons here so web errors
        // land in the same central error_logs table the workers write to (auth
        // owns the door because it holds the core DB + the internal-key guard).
        case "POST /internal/log-error":
          return await internalLogError(request, env)
        // Internal: the mcp worker bridges a verified personal access token to a
        // short-lived session PINNED to the token's team (ARCHITECTURE: the MCP
        // front desk). Live membership is re-checked here at mint AND by every
        // downstream door per request.
        case "POST /internal/mcp-session":
          return await internalMcpSession(request, env)
        default:
          return fail(404, "not_found", "No such auth action.")
      }
    } catch (e) {
      // A refusal is an ANSWER, not a crash. Every sibling worker maps this
      // first; auth did not, so the moment its handlers started validating,
      // every intended 400 would have become a 500 — and a 500 on the
      // unauthenticated sign-in door writes a row to the GLOBAL core database
      // per request. The two changes only make sense together.
      if (e instanceof GuardError) return fail(e.status, e.code, e.message)
      console.error("auth worker error:", e)
      // Record the crash in the central error log (core DB) — best-effort,
      // never blocks the response. Clean GuardError refusals never reach here.
      await recordWorkerError(env.DB, "auth", `${request.method} ${new URL(request.url).pathname}`, e)
      return fail(500, "internal", "Something went wrong on our side. Try again.")
    }
  },
} satisfies ExportedHandler<Env>

/** Internal (service-binding only): mint a short-lived TEAM-PINNED session for a
 * verified MCP token. The mcp worker has already verified the token hash; this
 * door re-verifies the user is an ACTIVE member of the pinned team, then mints. */
async function internalMcpSession(request: Request, env: Env): Promise<Response> {
  // FAIL CLOSED: minting a session is the highest-blast internal door, so unlike
  // send-email it refuses outright when INTERNAL_KEY isn't configured (a fresh
  // bootstrap must set the secret BEFORE the MCP bridge can work).
  if (!env.INTERNAL_KEY || request.headers.get("x-internal-key") !== env.INTERNAL_KEY)
    return fail(403, "forbidden", "Bad internal key.")
  // Validated even though the caller proved itself with INTERNAL_KEY. This is
  // the highest-blast internal door in the product — it mints a session — and
  // "a trusted caller cannot send rubbish" is an assumption, not a guarantee.
  const body = (await request.json().catch(() => ({}))) as { userId?: unknown; teamId?: unknown }
  const userId = requireText(body.userId, "User", TEXT_LIMITS.short)
  const teamId = requireText(body.teamId, "Team", TEXT_LIMITS.short)
  const member = await env.DB.prepare(
    "SELECT id FROM team_members WHERE team_id = ? AND user_id = ? AND deactivated_at IS NULL"
  )
    .bind(teamId, userId)
    .first()
  if (!member)
    return fail(403, "not_a_member", "That account is no longer an active member of the token's team.")
  const { token } = await createPinnedSession(env, userId, teamId)
  return json({ token })
}

/** Internal (service-binding only): send a branded email composed by another
 * worker (e.g. tenancy's invite email). */
async function internalSendEmail(request: Request, env: Env): Promise<Response> {
  // FAIL CLOSED: every internal door refuses every caller while its secret is
  // unset — a half-finished bootstrap must not run with the doors open. (This
  // used to wave callers through when INTERNAL_KEY was missing.)
  if (!env.INTERNAL_KEY || request.headers.get("x-internal-key") !== env.INTERNAL_KEY)
    return fail(403, "forbidden", "Bad internal key.")
  // Validated for the same reason internalMcpSession is (R20): the INTERNAL_KEY
  // proves the caller is a worker, not that its payload is well-formed — and
  // this door AIMS AN EMAIL from the product's verified sender.
  const m = (await request.json().catch(() => ({}))) as {
    to?: unknown
    subject?: unknown
    html?: unknown
    text?: unknown
  }
  const sent = await sendEmail(env, {
    to: requireText(m.to, "Recipient", TEXT_LIMITS.short),
    subject: requireText(m.subject, "Subject", TEXT_LIMITS.short),
    html: optionalText(m.html, "Body", TEXT_LIMITS.long) ?? "",
    text: optionalText(m.text, "Body", TEXT_LIMITS.long) ?? "",
  })
  return json({ sent })
}

/** Internal (service-binding only): record a CLIENT-side error into the central
 * error_logs table. Same defense-in-depth key as send-email; every field is
 * capped inside logError, and a bad body is simply dropped (a log endpoint must
 * never become an error source itself). */
async function internalLogError(request: Request, env: Env): Promise<Response> {
  // FAIL CLOSED (same rule as send-email): no secret configured = no callers.
  if (!env.INTERNAL_KEY || request.headers.get("x-internal-key") !== env.INTERNAL_KEY)
    return fail(403, "forbidden", "Bad internal key.")
  const b = (await request.json().catch(() => ({}))) as {
    source?: unknown
    place?: unknown
    message?: unknown
    stack?: unknown
    url?: unknown
  }
  // Type-checked field by field rather than put through requireText, because
  // this door DROPS rubbish instead of refusing it (R20 is satisfied by an
  // explicit runtime check, not only by the text seam). A log endpoint that
  // answers 400 teaches a broken client to report its breakage as a second
  // error — it must never become an error source itself. logError caps every
  // length; this decides every type.
  const message = typeof b.message === "string" ? b.message : ""
  if (message)
    await logError(env.DB, {
      source: typeof b.source === "string" ? b.source : "web",
      place: typeof b.place === "string" ? b.place : "unknown",
      message,
      stack: typeof b.stack === "string" ? b.stack : undefined,
      url: typeof b.url === "string" ? b.url : undefined,
    })
  return new Response(null, { status: 204 })
}

/** Step 1 of email login: create + send a 6-digit code. The response NEVER
 * carries the code — a login code appears nowhere but the user's inbox, in any
 * environment (the old staging echo was deleted; tests use adminTestLogin).
 * The ONE unauthenticated door that sends mail and writes rows, so the send is
 * charged to the caller (clientIp) as well as to the address. */
async function emailStart(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { email?: unknown }
  const email = normalizeEmail(requireText(body.email, "Email", TEXT_LIMITS.short))
  if (!isValidEmail(email))
    return fail(400, "invalid_email", "Enter a valid email address.")

  const minted = await mintLoginCode(env, email, clientIp(request))
  if ("error" in minted) return fail(minted.status, minted.error, minted.message)

  const sent = await sendLoginCode(env, email, minted.code)
  if (sent) return json({ ok: true })
  // No email key configured → refuse rather than stranding the user.
  return fail(503, "email_not_configured", "Email sending isn't set up yet.")
}

/** NON-PRODUCTION ONLY: mint a login code through the SAME path as the real send
 * door (hashed at rest, same TTL, same per-hour throttle) and return it ONCE
 * instead of emailing — the sign-in door for automated tests now that no code is
 * ever echoed anywhere. Its holder can sign in as ANY account on the
 * environment, so it carries two independent locks (below) and production has
 * neither. See OPERATIONS.md § secrets. */
async function adminTestLogin(request: Request, env: Env): Promise<Response> {
  // TWO independent locks, because this door's holder can sign in AS ANYONE:
  //  1. its OWN secret. It deliberately does NOT reuse ADMIN_KEY — that name is
  //     the maintenance key OPERATIONS.md tells an operator to set on tenancy and
  //     data-ops in BOTH environments, so sharing it would turn one mistyped
  //     `wrangler secret put` directory into universal impersonation.
  //  2. the environment itself. Even if the secret were somehow set on
  //     production, the code refuses — the isolation is structural, not a
  //     sentence in a runbook.
  if (env.ENVIRONMENT === "production") return fail(403, "forbidden", "Not available.")
  if (!env.TEST_LOGIN_KEY || request.headers.get("x-admin-key") !== env.TEST_LOGIN_KEY)
    return fail(403, "forbidden", "Not available.")
  const body = (await request.json().catch(() => ({}))) as { email?: unknown }
  const email = normalizeEmail(requireText(body.email, "Email", TEXT_LIMITS.short))
  if (!isValidEmail(email))
    return fail(400, "invalid_email", "Enter a valid email address.")
  // Charged to the test door's OWN bucket, not to the machine's address. This
  // door sends no mail, so it is not what the caller budgets are guarding — and
  // sharing them meant running the smoke suite twice in an hour locked the smoke
  // suite out of the product it was checking.
  const minted = await mintLoginCode(env, email, TEST_LOGIN_BUCKET)
  if ("error" in minted) return fail(minted.status, minted.error, minted.message)
  // Returned exactly once, to the TEST_LOGIN_KEY holder; the normal verify door
  // consumes it like any other code (attempt cap + TTL apply unchanged).
  return json({ ok: true, code: minted.code })
}

/** Step 2 of email login: check the code, create the session. Unauthenticated and
 * keyed on the address alone — anyone who knows an email can post junk here — so
 * the try is charged to the CALLER (clientIp) as well as to the code, and a
 * stranger's wrong guesses can't spend the tries of the person who asked for it.
 * See verifyLoginCode for the two lanes and why. */
async function emailVerify(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string
    code?: string
  }
  const email = normalizeEmail(requireText(body.email, "Email", TEXT_LIMITS.short))
  const code = requireText(body.code, "Code", TEXT_LIMITS.short)
  if (!isValidEmail(email) || !/^\d{6}$/.test(code))
    return fail(400, "invalid_input", "Enter your email and the 6-digit code.")

  const checked = await verifyLoginCode(env, email, code, clientIp(request))
  if ("error" in checked) return fail(checked.status, checked.error, checked.message)

  const { user, isNew } = await findOrCreateUserByEmail(env, email)
  if (user.deactivated_at !== null)
    return fail(403, "deactivated", "This account is deactivated.")

  const { setCookie } = await createSession(env, user.id)
  return json({ user: toSessionUser(user), isNew }, 200, { "Set-Cookie": setCookie })
}

/** Email change, step 1: send a 6-digit code to the NEW email (signed-in only). */
async function emailChangeStart(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(env, request)
  if (!user) return fail(401, "signed_out", "Not signed in.")

  const body = (await request.json().catch(() => ({}))) as { email?: string }
  const r = await startEmailChange(env, user, requireText(body.email, "Email", TEXT_LIMITS.short))
  if ("error" in r) return fail(r.status, r.error, r.message)
  // Never a code in the response — same law as login (inbox only).
  return json({ ok: true })
}

/** Email change, step 2: verify the code, switch the email, log + secure it. */
async function emailChangeVerify(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(env, request)
  if (!user) return fail(401, "signed_out", "Not signed in.")

  const body = (await request.json().catch(() => ({}))) as {
    email?: string
    code?: string
  }
  // Keep THIS device signed in when we drop the others.
  const token = readCookie(request, SESSION_COOKIE)
  const currentTokenHash = token ? await sha256Hex(token) : ""
  const r = await verifyEmailChange(
    env,
    user,
    requireText(body.email, "Email", TEXT_LIMITS.short),
    requireText(body.code, "Code", TEXT_LIMITS.short),
    currentTokenHash
  )
  if ("error" in r) return fail(r.status, r.error, r.message)
  return json({ user: r.user })
}

/** Who is the cookie attached to this request? */
async function me(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(env, request)
  if (!user) return fail(401, "signed_out", "Not signed in.")
  return json({ user: toSessionUser(user) })
}

/** The signed-in person's own account history (name / photo / email changes). */
async function activity(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(env, request)
  if (!user) return fail(401, "signed_out", "Not signed in.")
  return json({ activity: await listAccountActivity(env, user.id) })
}

/** Onboarding / profile edit: names + optional photo (stored in R2). */
async function profile(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(env, request)
  if (!user) return fail(401, "signed_out", "Not signed in.")

  const input = (await request.json().catch(() => ({}))) as ProfileInput
  const result = await updateProfile(env, user, input)
  if ("error" in result) return fail(400, result.error, result.message)
  return json(result)
}

async function logout(request: Request, env: Env): Promise<Response> {
  const { setCookie } = await destroySession(env, request)
  return json({ ok: true }, 200, { "Set-Cookie": setCookie })
}
