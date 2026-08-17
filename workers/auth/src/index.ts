// kwapso AUTH worker — every login-related action lives here, each as its own
// small handler (these become MCP-catalogued actions via the gateway later).
//
//   POST /api/auth/email/start          { email }        -> sends a 6-digit code
//   POST /api/auth/email/verify         { email, code }  -> logs in (sets cookie)
//   GET  /api/auth/google/start                          -> bounce to Google
//   GET  /api/auth/google/callback                       -> back from Google, logs in
//   POST /api/auth/email/change/start   { email }        -> code to the NEW email
//   POST /api/auth/email/change/verify  { email, code }  -> switch email + log it
//   GET  /api/auth/me                                    -> who am I?
//   GET  /api/auth/activity                              -> my account history (name/photo/email)
//   POST /api/auth/logout                                -> forget me
//   GET  /api/auth/health                                -> is this worker alive?

import { fail, json } from "@shared/workers/http"
import { GuardError } from "@shared/workers/gating"
import { optionalText, queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { logError, recordWorkerError } from "@shared/workers/error-log"
import { requestId } from "@shared/workers/trace"
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
import {
  buildGoogleStart,
  exchangeGoogleCode,
  googleCredentials,
  googleRedirectUri,
  googleSigningKeys,
  oauthCookie,
  OAUTH_COOKIE,
  resolveFrontDoor,
  verifyGoogleIdToken,
} from "./lib/google"
import { listAccountActivity } from "./lib/account-activity"
import { setLanguage, updateProfile, type ProfileInput } from "./lib/profile"
import { isLanguage } from "@shared/i18n"
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
        // "Continue with Google" — the SECOND way to prove the SAME identity,
        // never a second identity. Both halves are GET because Google's flow is
        // a browser redirect: see lib/google.ts for why the Identity-Services
        // POST button is the wrong shape behind refuseForeignOrigin.
        case "GET /api/auth/google/start":
          return await googleStart(request, env)
        case "GET /api/auth/google/callback":
          return await googleCallback(request, env)
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
        case "POST /api/auth/language":
          return await language(request, env)
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
      await recordWorkerError(env.DB, "auth", `${request.method} ${new URL(request.url).pathname}`, e, requestId(request))
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
    userId?: unknown
    requestId?: unknown
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
      // WHO the gateway's session check named — the bucket logError's hourly
      // ceiling charges the row to, and the only reason a client beacon can be
      // bounded per person at all. It arrives from the gateway, never from the
      // browser's body; a caller who reached this door already holds INTERNAL_KEY
      // and could write anything, so there is nothing further to prove here.
      userId: typeof b.userId === "string" ? b.userId : undefined,
      // The thread back to the click. Like `userId`, it arrives from the DOOR
      // (off the `x-request-id` header it stamped) and never from the browser's
      // body — a beacon that could name its own request id could staple a
      // client crash onto somebody else's trace. Type-checked here, capped in
      // logError. See shared/workers/trace.ts.
      requestId: typeof b.requestId === "string" ? b.requestId : undefined,
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

/** "Continue with Google", step 1: bounce the browser to Google's account picker.
 *
 * WHY THIS DOOR IS NOT ON THE SEND LEDGER. The login throttle and the send ledger
 * (lib/login-codes.ts) meter one scarce thing: emails leaving the product. This
 * door sends none, writes no row and makes no outbound call — it mints a cookie
 * and redirects. Charging it to the same buckets would not add a defence; it
 * would let anyone burn a real person's code budget by clicking a button that
 * costs us nothing. The thing this path could actually be walked down — minting
 * sessions — is bounded by Google's own assertion, which is exactly how the code
 * path is bounded by the code. */
async function googleStart(request: Request, env: Env): Promise<Response> {
  // The redirect_uri is derived from WHICH FRONT DOOR the person is standing at
  // (there are two hostnames), then required to be one of ours. Deriving without
  // checking would make this an open redirect that hands out a session cookie.
  const origin = resolveFrontDoor(env, request)
  if (!origin) return fail(400, "unknown_front_door", "Sign in from the app's own address.")
  // Not configured = say so quietly and let the person use the code instead.
  // BOTH halves are checked here, not at the callback, so nobody is sent to
  // Google only to fail on the way back.
  const creds = googleCredentials(env)
  if (!creds) return Response.redirect(`${origin}/login?error=google_not_ready`, 302)

  const { url, setCookie } = await buildGoogleStart(env, creds, origin)
  return new Response(null, { status: 302, headers: { Location: url, "Set-Cookie": setCookie } })
}

/** "Continue with Google", step 2: Google sends the browser back here. Finish the
 * handshake, VERIFY the assertion, and sign the person in as the same user the
 * email code would have signed in.
 *
 * IDENTITY-GATED, exactly like emailVerify: the gate is not a permission but a
 * proof of who the caller is — Google's signature here, a 6-digit code there.
 * Both then go through the ONE identity seam, findOrCreateUserByEmail, so a
 * person who used a code yesterday and Google today is one row, not two.
 *
 * SIGNING IN IS NOT GETTING IN (SCOPE ch.06). A Google account whose address is
 * not a member gets what a stranger gets from the code door: a user row with no
 * team, and the "nothing here yet" screen. The invite creates access; this
 * doesn't, and there is deliberately no second onboarding branch for it. */
async function googleCallback(request: Request, env: Env): Promise<Response> {
  const origin = resolveFrontDoor(env, request)
  if (!origin) return fail(400, "unknown_front_door", "Sign in from the app's own address.")

  /** Back to the sign-in screen with a reason, and ALWAYS without the one-shot
   * cookie — a state that survives its round-trip is a replay waiting to happen.
   * The reason is encoded even though every caller passes a fixed word: the
   * origin is fixed by the allow-list above, so this is the only part of the
   * Location a future edit could make writable, and it costs one call. */
  const back = (reason: string) =>
    new Response(null, {
      status: 302,
      headers: {
        Location: `${origin}/login?error=${encodeURIComponent(reason)}`,
        "Set-Cookie": oauthCookie(env, "", 0),
      },
    })

  const creds = googleCredentials(env)
  if (!creds) return back("google_not_ready")

  const url = new URL(request.url)
  // The QUERY half of the boundary (R20). Google's own values are small, but this
  // door is unauthenticated and anyone can call it with a multi-megabyte `?code=`
  // — which without a cap is a 500 and a row in the GLOBAL error log per request.
  const code = queryText(url.searchParams.get("code"), "Code", TEXT_LIMITS.link)
  const state = queryText(url.searchParams.get("state"), "State", TEXT_LIMITS.short)
  const cookie = readCookie(request, OAUTH_COOKIE)
  if (!code || !state || !cookie) return back("google_failed")

  const [cookieState, verifier] = cookie.split(".")
  if (!verifier || state !== cookieState) return back("google_failed")

  try {
    const idToken = await exchangeGoogleCode(creds, code, verifier, googleRedirectUri(origin))
    const identity = await verifyGoogleIdToken(idToken, {
      clientId: creds.clientId,
      keys: await googleSigningKeys(),
    })

    const { user } = await findOrCreateUserByEmail(env, identity.email)
    if (user.deactivated_at !== null) return back("deactivated")

    const { setCookie } = await createSession(env, user.id)
    const headers = new Headers({ Location: `${origin}/` })
    headers.append("Set-Cookie", setCookie)
    headers.append("Set-Cookie", oauthCookie(env, "", 0))
    return new Response(null, { status: 302, headers })
  } catch (e) {
    // One sentence to the person, the detail to the log. Which claim failed is
    // useful to us and is an oracle to anyone probing the door.
    console.error("google callback failed:", e)
    return back("google_failed")
  }
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

  // R20 AT THE DOOR, not one frame down. This handler used to read the body with
  // a bare cast and hand the WHOLE object to updateProfile, which did
  // `(input.firstName ?? "").trim()` — and `??` does not catch a number, so
  // {"firstName": 1} was a TypeError, a 500, and an error_logs row in the GLOBAL
  // core database, from any signed-in caller, at BOTH front doors (this route is
  // on the portal's allow-list too).
  //
  // It is also the reason the law's own scanner never saw it: `validated-bodies`
  // follows `<binding>.<field>` reads in the file that bound the body, and this
  // file read no fields at all — the door contributed ZERO fields to the census
  // and reported clean. Validating here fixes the crash AND puts the three fields
  // back in the scanner's field of view, which is the half that stays fixed.
  const body = (await request.json().catch(() => ({}))) as {
    firstName?: unknown
    lastName?: unknown
    imageDataUrl?: unknown
  }
  const input: ProfileInput = {
    firstName: optionalText(body.firstName, "First name", TEXT_LIMITS.short),
    lastName: optionalText(body.lastName, "Last name", TEXT_LIMITS.short),
    // Through the SAME seam, not a `typeof` — auth's own boundary rule
    // (test/boundary.test.ts) is stricter than R20's and admits only the three
    // validators, because a cast walked past its first version. The cap is in
    // CHARACTERS and deliberately generous: a data URL is measured in bytes, and
    // dataUrlBytes + parseDataUrl enforce MAX_IMAGE_BYTES (2.5 MB) a moment
    // later. This one only has to stop a non-string and an absurd string.
    imageDataUrl: optionalText(body.imageDataUrl, "Photo", 4_000_000),
  }
  const result = await updateProfile(env, user, input)
  if ("error" in result) return fail(400, result.error, result.message)
  return json(result)
}

/** The language this person reads kwapso in. Reached from BOTH front doors —
 * this route is on the portal gateway's allow-list, because a client choosing
 * German in their own portal is the whole point of the feature.
 *
 * R20, positionally: `body.language` sits as `isLanguage`'s only argument, and
 * `isLanguage` is a real type check against the LANGUAGES list rather than a
 * truthiness guard. An unknown code is a clean 400 here, never a value that
 * reaches the database and turns somebody's screen into fallback English
 * forever. The body is read field by field and never destructured. */
async function language(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(env, request)
  if (!user) return fail(401, "signed_out", "Not signed in.")

  // TWO CHECKS, AND THE FIRST ONE IS NOT REDUNDANT. `requireText` is auth's own
  // boundary rule (test/boundary.test.ts), which is stricter than R20's and
  // admits only the three shared validators — because a cast walked past its
  // first version, and the fix for that must not be loosened by the next door
  // that finds it inconvenient. So the field passes through the seam every other
  // auth door uses, which also buys the NUL strip and the clean 400 mapping.
  // `isLanguage` then decides the only question that matters: is this string one
  // of the four we actually speak. An unrecognised code stops here rather than
  // living on a user row for ever, matching no catalogue entry, leaving somebody
  // reading fallback English with no way to explain why.
  const body = (await request.json().catch(() => ({}))) as { language?: unknown }
  const chosen = requireText(body.language, "Language", 8)
  if (!isLanguage(chosen))
    return fail(400, "bad_language", "That is not a language kwapso speaks.")

  return json(await setLanguage(env, user, chosen))
}

async function logout(request: Request, env: Env): Promise<Response> {
  const { setCookie } = await destroySession(env, request)
  return json({ ok: true }, 200, { "Set-Cookie": setCookie })
}
