// "Continue with Google", spoken directly to Google — no Clerk, no middleman.
// The OAuth authorization-code flow with PKCE: the browser bounces to Google and
// back to us, and the code is traded for an id_token over OUR TLS connection.
//
// WHY THE REDIRECT FLOW AND NOT THE GOOGLE IDENTITY SERVICES BUTTON. The GIS
// button hands the browser a credential and asks it to POST it back — which is a
// CROSS-SITE POST from accounts.google.com, and both front doors kill those in
// front of every route (`refuseForeignOrigin`, shared/workers/front-door.ts).
// Loosening that check to admit Google would be trading a real, tested CSRF
// defence for a button style. Google's redirect back is a GET, so it walks in.
//
// WHY THE SIGNATURE IS CHECKED EVEN THOUGH THE TOKEN CAME OVER OUR OWN TLS. The
// version of this file deleted in June said decoding the payload without
// verifying was "the standard, safe pattern here". It is a defensible reading —
// but it made the whole of a person's identity rest on one unstated assumption
// (that nothing between us and Google can answer for Google), and it checked the
// issuer with `.includes("accounts.google.com")`, which happily accepts
// `https://accounts.google.com.example.net`. Verifying against Google's published
// keys costs one cached fetch and removes the assumption. See verifyGoogleIdToken.

import { GuardError } from "@shared/workers/gating"

import type { Env } from "../env"
import { base64Url, randomToken, sha256Bytes } from "./crypto"

/** The one-shot cookie carrying the CSRF state + the PKCE verifier across the
 * round-trip to Google. Ten minutes, HttpOnly, and cleared on the way back
 * whatever the outcome. */
export const OAUTH_COOKIE = "kwapso_oauth"

/** How long Google's signing keys are held in the isolate before we ask again.
 * Google rotates roughly daily and publishes a Cache-Control; an hour is well
 * inside it and turns the hot path into zero network calls. */
const KEYS_TTL_MS = 60 * 60 * 1000

/** A little slack for clock drift between Google's clock and ours. */
const CLOCK_SKEW_SECONDS = 60

/** Google's OpenID discovery endpoints, pinned rather than discovered: one fewer
 * external call on the sign-in path, and one fewer thing that can redirect us. */
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
const CERTS_ENDPOINT = "https://www.googleapis.com/oauth2/v3/certs"
const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"

/** The issuer Google actually stamps. Both spellings are legitimate; anything
 * else is not, and it is a SET so that no substring can sneak in. */
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"])

/** What we take from a verified Google assertion, and nothing more: who they are
 * to Google, and the verified address that IS the identity here. */
export type GoogleIdentity = { sub: string; email: string }

/** The `kwapso-signin` OAuth client, once both halves are actually set. */
export type GoogleCredentials = { clientId: string; clientSecret: string }

/** Is Google sign-in configured on this deploy? ONE answer, in one place, asked
 * by both halves of the flow — so nobody can be bounced to Google by a door that
 * checked the id and land on a callback that needed the secret. null = the
 * button is not offered and the email-code path carries on untouched. */
export function googleCredentials(env: Env): GoogleCredentials | null {
  const clientId = env.GOOGLE_CLIENT_ID
  const clientSecret = env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

/** A JSON Web Key as Google publishes it. The platform's `JsonWebKey` has no
 * `kid`/`alg`, and both are load-bearing here — the kid is how a token names its
 * key, and the alg is half of the downgrade defence. */
export type Jwk = JsonWebKey & { kid?: string; alg?: string }

/**
 * THE TWO FRONT DOORS, and the only origins this worker will ever bounce a
 * person back to. There are two hostnames (the agency app and the client
 * portal), so the redirect_uri cannot be a fixed var — but it must not be taken
 * from the request on trust either, or the callback becomes an open redirect
 * with a session cookie attached. So: derive it from the request, then require
 * it to be one of these. Anything else never reaches Google at all.
 */
export function frontDoors(env: Env): string[] {
  return [env.APP_ORIGIN, env.PORTAL_ORIGIN].filter((o): o is string => Boolean(o))
}

/** Which front door is this request standing at? null = not one of ours. */
export function resolveFrontDoor(env: Env, request: Request): string | null {
  const origin = new URL(request.url).origin
  return frontDoors(env).includes(origin) ? origin : null
}

/** The callback address for a given front door — the string that must ALSO be
 * registered in the Google console, character for character. */
export function googleRedirectUri(origin: string): string {
  return `${origin}/api/auth/google/callback`
}

/** Build Google's account-picker URL + the short-lived state cookie. */
export async function buildGoogleStart(
  env: Env,
  creds: GoogleCredentials,
  origin: string
): Promise<{ url: string; setCookie: string }> {
  const state = randomToken()
  const verifier = randomToken()
  const challenge = base64Url(await sha256Bytes(verifier))

  const url = new URL(AUTHORIZE_ENDPOINT)
  url.searchParams.set("client_id", creds.clientId)
  url.searchParams.set("redirect_uri", googleRedirectUri(origin))
  url.searchParams.set("response_type", "code")
  // Basic scopes only — this app is `kwapso-signin` (SCOPE ch.03), which asks for
  // nothing that needs a Google review. Drive/Gmail/Calendar belong to the OTHER
  // OAuth app entirely and must never be requested from the sign-in door.
  url.searchParams.set("scope", "openid email")
  url.searchParams.set("state", state)
  url.searchParams.set("code_challenge", challenge)
  url.searchParams.set("code_challenge_method", "S256")
  url.searchParams.set("prompt", "select_account")

  return { url: url.toString(), setCookie: oauthCookie(env, `${state}.${verifier}`, 600) }
}

/** The one-shot cookie, minted and cleared through the same function so the two
 * can never disagree about Path/SameSite (a cleared cookie with a different
 * Path is not cleared at all). `Lax` is required, not optional: Google's
 * redirect back is a cross-site top-level GET, and `Strict` would withhold the
 * cookie exactly when the callback needs it. */
export function oauthCookie(env: Env, value: string, maxAgeSeconds: number): string {
  const secure = env.INSECURE_COOKIE === "1" ? "" : "; Secure"
  return `${OAUTH_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${maxAgeSeconds}`
}

/** Trade Google's one-time code for the id_token. The `redirect_uri` MUST be the
 * same string the authorize request carried, or Google refuses — which is the
 * whole reason both front doors have to be registered separately. */
export async function exchangeGoogleCode(
  creds: GoogleCredentials,
  code: string,
  verifier: string,
  redirectUri: string
): Promise<string> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    // LAW R11: a hung token exchange must not stall the worker. The person is
    // watching a blank tab while this runs; fifteen seconds is already generous.
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  })
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`)
  const data = (await res.json()) as { id_token?: unknown }
  if (typeof data.id_token !== "string" || !data.id_token)
    throw new Error("Google returned no id_token")
  return data.id_token
}

/** Google's public signing keys, cached per isolate for KEYS_TTL_MS. */
let keyCache: { keys: Jwk[]; until: number } | null = null

export async function googleSigningKeys(now: number = Date.now()): Promise<Jwk[]> {
  if (keyCache && keyCache.until > now) return keyCache.keys
  const res = await fetch(CERTS_ENDPOINT, {
    // LAW R11: the key fetch is on the sign-in path too.
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Google key fetch failed (${res.status})`)
  const body = (await res.json()) as { keys?: unknown }
  if (!Array.isArray(body.keys) || body.keys.length === 0)
    throw new Error("Google published no signing keys")
  keyCache = { keys: body.keys as Jwk[], until: now + KEYS_TTL_MS }
  return keyCache.keys
}

/** Test seam: forget the cached keys. Never called by the worker. */
export function forgetGoogleKeys(): void {
  keyCache = null
}

/**
 * VERIFY GOOGLE'S ASSERTION. Signature first, then every claim that decides
 * whether this token is about US, about NOW, and about a REAL address:
 *
 *   • alg is RS256 and the kid names a key we fetched from Google — which is
 *     also how `alg: "none"` and an HS256 downgrade die, before any key lookup.
 *   • the RSA signature verifies over the exact bytes that were signed.
 *   • `iss` is one of Google's two spellings, by SET MEMBERSHIP. The deleted
 *     version used `.includes()`, which accepts any host with that substring in
 *     it — a forged issuer only has to be signed by a key we'd fetch, and the
 *     kid check is the only thing that was stopping it.
 *   • `aud` is OUR client id. A token minted for a different app is somebody
 *     else's assertion; without this, any Google app could sign people in here.
 *   • `exp` is in the future and `iat` is not in the future (both ±60s).
 *   • `email_verified` is TRUE. This is the one that decides whether Google
 *     sign-in is safe at all: the email IS the identity here, so an unverified
 *     address would let anyone claim any colleague's account by typing it into
 *     a fresh Google profile.
 *
 * Throws GuardError so a refusal is an answer with a stable code — the callback
 * turns it into a redirect, and if one ever escapes the switch it is a clean
 * 401, never a 500 on the unauthenticated sign-in door.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  opts: { clientId: string; keys: Jwk[]; now?: number }
): Promise<GoogleIdentity> {
  const nowSeconds = Math.floor((opts.now ?? Date.now()) / 1000)

  const parts = idToken.split(".")
  if (parts.length !== 3) throw refuse("malformed_token", "That sign-in token isn't readable.")
  const [rawHeader, rawPayload, rawSignature] = parts

  const header = decodeSegment(rawHeader) as { alg?: unknown; kid?: unknown }
  if (header.alg !== "RS256")
    throw refuse("bad_algorithm", "That sign-in token isn't signed the way Google signs.")
  if (typeof header.kid !== "string" || !header.kid)
    throw refuse("bad_algorithm", "That sign-in token names no signing key.")

  const jwk = opts.keys.find((k) => k.kid === header.kid)
  if (!jwk) throw refuse("unknown_key", "That sign-in token was signed by a key Google doesn't publish.")
  if (jwk.kty !== "RSA" || (jwk.alg !== undefined && jwk.alg !== "RS256"))
    throw refuse("unknown_key", "That sign-in token names an unusable signing key.")

  const key = await crypto.subtle.importKey(
    "jwk",
    { ...jwk, key_ops: ["verify"], ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  )
  const signed = new TextEncoder().encode(`${rawHeader}.${rawPayload}`)
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlBytes(rawSignature) as BufferSource,
    signed as BufferSource
  )
  if (!ok) throw refuse("bad_signature", "That sign-in token's signature doesn't check out.")

  const claims = decodeSegment(rawPayload) as {
    iss?: unknown
    aud?: unknown
    sub?: unknown
    exp?: unknown
    iat?: unknown
    email?: unknown
    email_verified?: unknown
  }

  if (typeof claims.iss !== "string" || !GOOGLE_ISSUERS.has(claims.iss))
    throw refuse("bad_issuer", "That sign-in token wasn't issued by Google.")
  if (typeof claims.aud !== "string" || claims.aud !== opts.clientId)
    throw refuse("bad_audience", "That sign-in token was issued for a different app.")
  if (typeof claims.exp !== "number" || nowSeconds >= claims.exp + CLOCK_SKEW_SECONDS)
    throw refuse("expired_token", "That sign-in took too long. Try again.")
  if (typeof claims.iat !== "number" || claims.iat > nowSeconds + CLOCK_SKEW_SECONDS)
    throw refuse("expired_token", "That sign-in token is dated in the future.")
  if (typeof claims.sub !== "string" || !claims.sub)
    throw refuse("no_identity", "Google didn't say who that account belongs to.")
  if (claims.email_verified !== true || typeof claims.email !== "string" || !claims.email.trim())
    throw refuse("email_unverified", "That Google account has no verified email address.")

  return { sub: claims.sub, email: claims.email.trim().toLowerCase() }
}

/** Every refusal in this file, one shape. 401 because the caller failed to prove
 * who they are — not 400, which would suggest they could fix the request. */
function refuse(code: string, message: string): GuardError {
  return new GuardError(401, code, message)
}

/** base64url → bytes. Padding is optional in JWTs; atob wants it.
 *
 * THE TRY IS THE POINT, and it was missing. `atob` raises on a character outside
 * the alphabet, and the SIGNATURE segment is decoded straight — not inside
 * decodeSegment's JSON guard. So rubbish in that third slot (reachable: a
 * well-formed header naming Google's real kid, then garbage) escaped as a raw
 * DOMException, became a 500, and wrote a row to the GLOBAL error log — per
 * attempt, from a door anyone on the internet can call. Now every way in
 * refuses in the product's own words. */
function base64UrlBytes(segment: string): Uint8Array {
  const b64 = segment.replaceAll("-", "+").replaceAll("_", "/")
  let binary: string
  try {
    binary = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "="))
  } catch {
    throw refuse("malformed_token", "That sign-in token isn't readable.")
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** One JWT segment → its JSON. A segment that isn't JSON is a malformed token,
 * not a crash — same reason as above. The decode sits OUTSIDE the try so a bad
 * base64 keeps its own refusal rather than being relabelled by this one. */
function decodeSegment(segment: string): unknown {
  const text = new TextDecoder().decode(base64UrlBytes(segment) as BufferSource)
  try {
    return JSON.parse(text)
  } catch {
    throw refuse("malformed_token", "That sign-in token isn't readable.")
  }
}
