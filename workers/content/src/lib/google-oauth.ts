// CONNECTING A GOOGLE ACCOUNT — a different question from signing in with one,
// and therefore a different OAuth app.
//
// Sign-in (workers/auth/src/lib/google.ts) asks Google one thing: who is this
// person? It requests `openid email`, needs no Google review, and keeps nothing
// afterwards — the answer becomes a session and the token is thrown away. That
// file says so in as many words: "Drive/Gmail/Calendar belong to the OTHER OAuth
// app entirely and must never be requested from the sign-in door." This is that
// other app (GOOGLE_CONNECT_CLIENT_ID / _SECRET), and the separation is the
// point: an app that asks for a mailbox goes through Google's review and shows a
// frightening consent screen, and making everybody who just wants to log in walk
// past that screen is how people learn to click through consent screens.
//
// WHAT IS **NOT** DUPLICATED HERE, deliberately: the id_token verifier. Nothing
// on this path is an authentication decision — the person is already signed in,
// through a door that already proved who they are. What we want from Google is a
// LABEL ("connected as ana@…") so somebody with two accounts can tell them
// apart, and the honest way to ask that is to ask Google, with the access token
// it just gave us, over our own TLS connection (`userinfo`). A second JWT
// verifier written from memory beside the real one is exactly the failure
// shared/workers/front-door.ts exists to record: a security control that exists
// twice holds until somebody writes the second copy.
//
// R11 — every call in this file is a bare `fetch` to the internet, so every call
// carries an AbortSignal timeout. A hung Google socket must not hold a worker.

import { GuardError } from "@shared/workers/gating"
import type { GoogleService } from "@shared/types"

/** The one-shot cookie carrying the CSRF state, the PKCE verifier and which
 * service is being connected across the round-trip to Google — and then, on the
 * way back, the authorization code itself. HttpOnly, ten minutes, and cleared
 * whatever the outcome. */
export const CONNECT_COOKIE = "kwapso_google_connect"

/** Pinned rather than discovered — one fewer external call on the path, and one
 * fewer thing that can redirect us. */
const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke"

/** How long we will wait on Google before giving up (R11). Generous enough for a
 * slow handshake, short enough that a hung socket is an error somebody sees
 * rather than a worker nobody can use. */
export const GOOGLE_TIMEOUT_MS = 15_000

/**
 * THE SCOPES, PER SERVICE — asked for SEPARATELY, which is the whole shape of
 * this feature. Connecting Drive must not quietly hand over a mailbox, so each
 * service is its own consent screen, its own row, and its own disconnect.
 *
 * Each list is the NARROWEST scope that can do the job the owner asked for:
 *   • drive     — `drive.file` reads and writes only files this app created or
 *                 the user explicitly opened to it, plus `drive.readonly` for
 *                 the named folders. (`drive` full scope is not requested: the
 *                 decision was NAMED FOLDERS, not the whole drive, and asking
 *                 for the whole drive and then filtering would make the promise
 *                 a line of our code rather than a fact at Google.)
 *   • gmail     — read, compose (a DRAFT), send, and FILE (labels). Send is a
 *                 separate scope from compose at Google too, which is convenient:
 *                 the switch the owner asked for has a matching seam on the other
 *                 side. `gmail.modify` is the one that costs something and it is
 *                 asked for with open eyes: Gmail has no scope for "labels on a
 *                 message" alone — `gmail.labels` creates and renames labels but
 *                 cannot put one ON anything — so filing a message is `modify` or
 *                 it is nothing. What `modify` adds beyond what we already had is
 *                 the power to move and archive; what it still cannot do is
 *                 delete, which is the line worth keeping.
 *   • calendar  — READ ONLY, and the narrowest read there is. See the essay
 *                 below: this product stopped writing to a calendar on 18 August
 *                 2026, and asking for a scope we cannot use is asking for a
 *                 power somebody has to take on trust.
 *   • chat      — messages in named spaces, and the space list to name them from.
 *
 * `openid email` rides every one so we can label the connection. It costs
 * nothing at the consent screen — the person is choosing an account there anyway.
 *
 * ── THE CALENDAR DOWNGRADE, AND WHY CHANGING THIS STRING IS NOT THE FIX ──────
 *
 * A GRANT AT GOOGLE IS ADDITIVE, PER OAUTH CLIENT. Google does not store "what
 * kwapso asked for last time"; it stores what this person has ever approved for
 * this client id, as a set. So an account that already approved
 * `calendar.events` (read/WRITE) goes on holding it after this list is narrowed,
 * and the next connect returns a token that STILL carries the write scope — a
 * consent screen the person walks past without being asked anything new, and a
 * fix that looks done and is not. It is the failure this file is most able to
 * hide, because nothing about it is visible from inside the app: the code stops
 * calling a write endpoint (it already has), the string here says readonly, and
 * the access token quietly keeps the power.
 *
 * THREE THINGS TOGETHER MAKE THE NARROWING REAL, and no one of them does it
 * alone:
 *
 *   1. DISCONNECT REVOKES AT GOOGLE (`revokeAtGoogle` below, called by
 *      lib/google.ts `disconnect`). Dropping our row stops US using a grant and
 *      does nothing to the grant. Revoking is what empties the set, so the next
 *      consent starts from nothing.
 *   2. CONNECT FORCES A FRESH CONSENT — `prompt=consent` plus
 *      `include_granted_scopes=false` in `buildConnectStart`. The first stops
 *      Google reusing an approval silently; the second stops it minting a token
 *      over the whole previously-granted set.
 *   3. WE READ BACK WHAT GOOGLE ACTUALLY GAVE — the token response's `scope`,
 *      stored on the row and compared against this list by
 *      `unrequestedScopes` below. That is the part that makes the other two
 *      PROVABLE rather than hoped for: if a grant comes back carrying anything
 *      we did not ask for, the person's own settings card says so in words
 *      instead of the app pretending.
 *
 * The order matters to somebody holding an old grant: disconnect first (which
 * revokes), then connect. A connect on top of a live grant is the case step 3
 * exists to catch.
 */
const GOOGLE_SCOPES: Record<GoogleService, string[]> = {
  drive: [
    "openid",
    "email",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file",
  ],
  gmail: [
    "openid",
    "email",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
  ],
  calendar: ["openid", "email", "https://www.googleapis.com/auth/calendar.readonly"],
  chat: [
    "openid",
    "email",
    "https://www.googleapis.com/auth/chat.messages",
    "https://www.googleapis.com/auth/chat.spaces.readonly",
  ],
}

/** WHAT WE ASKED FOR, for anybody who needs to compare. Exported as a reader
 * rather than the object, so the one table above cannot be edited from
 * somewhere else. */
export function requestedScopes(service: GoogleService): string[] {
  return [...GOOGLE_SCOPES[service]]
}

/** EVERYTHING THIS APP EVER ASKS THIS OAUTH CLIENT FOR — the four lists, as one
 * set. It exists because Google's grant does: see `unrequestedScopes`. */
function everyRequestedScope(): Set<string> {
  return new Set(Object.values(GOOGLE_SCOPES).flat())
}

/**
 * SCOPES THAT SAY WHO SOMEBODY IS AND GIVE ACCESS TO NOTHING — tolerated on any
 * grant, whether we asked for them or not.
 *
 * Google rewrites the two short names on the way back: `email` is returned as
 * `…/auth/userinfo.email`, `profile` as `…/auth/userinfo.profile`. Without the
 * rewrite written down here, every connection this app has ever made would
 * report that Google granted something extra, and a warning that is always on is
 * a warning nobody reads. `profile` is tolerated although this app never asks
 * for it, for the same reason: it names a person and reaches none of their
 * material, so it is not the thing the check is looking for.
 */
const IDENTITY_SCOPES = new Set([
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
])

/**
 * WHAT GOOGLE GRANTED THAT THIS APP NEVER ASKS FOR — the third leg of the
 * downgrade defence in the essay above, and the only one that produces evidence.
 *
 * DERIVED from `GOOGLE_SCOPES` rather than compared against a list of "write
 * scopes". A list of the powers we are afraid of is a list that rots the day
 * Google names a new one; the difference between what we ASK for and what came
 * back cannot rot, because both halves move together. Narrow the calendar to
 * read-only and a leftover `calendar.events` shows up here the same hour, with
 * no second edit anywhere.
 *
 * MEASURED AGAINST ALL FOUR LISTS, NOT THIS SERVICE'S — and that is the whole
 * subtlety. The four services are four CONSENT SCREENS and four rows here, but
 * they are ONE OAuth client, so at Google they are ONE grant holding the union of
 * everything the person has approved. Google is entitled to echo that union back
 * on any one of the four token responses. Compared per service, a perfectly
 * healthy account would then report that its Gmail connection had been granted
 * Drive — a warning that is wrong, on every row, for ever, which is a warning
 * nobody reads by the second week.
 *
 * So the question this asks is the one that is actually answerable: does this
 * account's grant to kwapso contain anything kwapso does not ask for ANYWHERE?
 * A leftover `calendar.events` fails that as surely as it fails the narrower
 * version, because no list requests it any more. What it deliberately does not
 * flag is one service's scope appearing on another's row, which is Google's
 * model rather than a fault, and nothing we could prevent if we wanted to.
 *
 * `granted` is Google's own space-separated `scope` string, stored verbatim on
 * the row. An empty one answers empty: a grant that told us nothing is not a
 * grant we can accuse of anything.
 */
export function unrequestedScopes(granted: string): string[] {
  const asked = everyRequestedScope()
  return granted
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s && !asked.has(s) && !IDENTITY_SCOPES.has(s))
}

/**
 * THE OTHER DIRECTION: what this service needs and this grant does not carry.
 *
 * The failure it names is real and was live on the owner's own account
 * (CHECKLIST 14.5): `gmail.modify` was added to the Gmail list after he
 * connected, so filing a message under a label answered "Google wouldn't allow
 * that any more, the connection may have been removed in your Google account" —
 * a true refusal with a false diagnosis, pointing at a grant nobody had touched.
 * A grant is only ever widened by CONSENT, so an app that adds a scope leaves
 * every existing connection quietly short of it until the person connects again,
 * and nothing tells them.
 *
 * PER SERVICE here, where `unrequestedScopes` is deliberately not: an echoed
 * union can only ever ADD scopes, so it cannot cause a false "missing". The two
 * asymmetries are the same fact about Google's model read from its two ends.
 */
export function missingScopes(service: GoogleService, granted: string): string[] {
  const held = new Set(
    granted
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
  )
  return GOOGLE_SCOPES[service].filter((s) => !held.has(s) && !IDENTITY_SCOPES.has(s))
}

/** The connect app's credentials, once BOTH halves are set. One answer in one
 * place, asked before anybody is sent to Google — the same rule auth's sign-in
 * flow follows, for the same reason: nobody should complete a consent screen and
 * fail on the way back. */
export type ConnectCredentials = { clientId: string; clientSecret: string }
export type ConnectEnv = {
  GOOGLE_CONNECT_CLIENT_ID?: string
  GOOGLE_CONNECT_CLIENT_SECRET?: string
  PUBLIC_APP_URL?: string
}

export function connectCredentials(env: ConnectEnv): ConnectCredentials | null {
  const clientId = env.GOOGLE_CONNECT_CLIENT_ID
  const clientSecret = env.GOOGLE_CONNECT_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

/**
 * THE ONE ORIGIN THIS FLOW WILL EVER RETURN A PERSON TO — the AGENCY app, and
 * nothing else.
 *
 * Sign-in has two front doors and therefore has to derive its redirect from the
 * request and check it against an allow-list. This flow has ONE, because clients
 * get no Google surface at all: the portal gateway does not forward a single
 * door of this module, and there is no version of this feature a client login
 * reaches. So the redirect_uri is read from the deploy's own configuration
 * rather than from the request, which removes the open-redirect question instead
 * of answering it.
 */
function connectRedirectUri(env: ConnectEnv): string {
  const origin = (env.PUBLIC_APP_URL ?? "").replace(/\/+$/, "")
  if (!origin)
    throw new GuardError(
      503,
      "google_not_ready",
      "Google connections aren't set up on this environment yet."
    )
  return `${origin}/api/content/google/callback`
}

/** Google's account picker, plus the one-shot cookie that survives the trip.
 * `access_type=offline` + `prompt=consent` are what make Google hand over a
 * REFRESH token: without them a second connect of the same account returns an
 * access token only, and the connection silently stops working an hour later.
 *
 * `prompt=consent` now carries a SECOND job, and it is the one in the essay at
 * the top of this file: it stops Google waving a returning person through on an
 * approval they gave months ago. Somebody re-connecting a narrowed service has
 * to see the consent screen and read what it says, which is the only moment in
 * this whole flow where a human can notice that the ask has changed. */
export async function buildConnectStart(
  env: ConnectEnv,
  creds: ConnectCredentials,
  service: GoogleService
): Promise<{ url: string; setCookie: string }> {
  const state = randomToken()
  const verifier = randomToken()
  const challenge = base64Url(await sha256Bytes(verifier))

  const url = new URL(AUTHORIZE_ENDPOINT)
  url.searchParams.set("client_id", creds.clientId)
  url.searchParams.set("redirect_uri", connectRedirectUri(env))
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", GOOGLE_SCOPES[service].join(" "))
  url.searchParams.set("state", state)
  url.searchParams.set("code_challenge", challenge)
  url.searchParams.set("code_challenge_method", "S256")
  url.searchParams.set("access_type", "offline")
  url.searchParams.set("prompt", "consent select_account")
  // NOT INCREMENTAL, and that word is the whole of it. `include_granted_scopes`
  // is Google's flag for "mint this token over everything this person has ever
  // approved for this client" — the exact mechanism that would hand a narrowed
  // calendar connection its old write scope back. Off, so the token covers what
  // this request asked for and nothing else; and the granted scopes that come
  // back on the token response are then a real answer rather than an echo of
  // history, which is what makes `unrequestedScopes` worth reading at all.
  url.searchParams.set("include_granted_scopes", "false")

  return { url: url.toString(), setCookie: connectCookie(`${state}.${verifier}.${service}`, 600) }
}

/** The one-shot cookie, minted and cleared through ONE function so the two can
 * never disagree about Path/SameSite — a cleared cookie with a different Path is
 * not cleared at all. `Lax` is required rather than chosen: Google's redirect
 * back is a cross-site top-level GET, and `Strict` would withhold the cookie
 * exactly when the callback needs it. */
export function connectCookie(value: string, maxAgeSeconds: number, insecure?: string): string {
  const secure = insecure === "1" ? "" : "; Secure"
  return `${CONNECT_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${maxAgeSeconds}`
}

/** Read one cookie off a request. (Small enough that importing auth's copy would
 * mean binding two workers together for eight lines.) */
export function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("Cookie") ?? ""
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=")
    if (k === name) return rest.join("=")
  }
  return null
}

/** What Google hands back when a code (or a refresh token) is redeemed. */
export type GoogleTokens = {
  accessToken: string
  /** absent on a refresh — Google only issues one at first consent. */
  refreshToken: string | null
  expiresAt: string
  grantedScopes: string
}

/** Trade the one-time code for tokens. The `redirect_uri` must be the same
 * string the authorize request carried or Google refuses, which is why it comes
 * from the same function both times. */
export async function exchangeConnectCode(
  env: ConnectEnv,
  creds: ConnectCredentials,
  code: string,
  verifier: string
): Promise<GoogleTokens> {
  return redeem(creds, {
    code,
    redirect_uri: connectRedirectUri(env),
    grant_type: "authorization_code",
    code_verifier: verifier,
  })
}

/** Swap a refresh token for a fresh access token. Google does not return a new
 * refresh token here, which is why the caller keeps the one it has. */
export async function refreshAccessToken(
  creds: ConnectCredentials,
  refreshToken: string
): Promise<GoogleTokens> {
  return redeem(creds, { refresh_token: refreshToken, grant_type: "refresh_token" })
}

/** The one POST to Google's token endpoint, both directions through it. */
async function redeem(
  creds: ConnectCredentials,
  fields: Record<string, string>
): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    // R11: a hung token call must not stall the worker.
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...fields,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
  })
  if (!res.ok)
    throw new GuardError(
      // 502 rather than the status Google sent: the caller did nothing wrong and
      // must not be told to fix their request. A 400 from Google here means a
      // grant that has been revoked at Google's end, and the sentence says so.
      502,
      "google_refused",
      "Google wouldn't complete that connection. It may have been removed from your Google account. Connect it again."
    )
  const data = (await res.json()) as {
    access_token?: unknown
    refresh_token?: unknown
    expires_in?: unknown
    scope?: unknown
  }
  if (typeof data.access_token !== "string" || !data.access_token)
    throw new GuardError(502, "google_refused", "Google didn't return a usable connection.")
  const seconds = typeof data.expires_in === "number" ? data.expires_in : 3_600
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
    expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
    grantedScopes: typeof data.scope === "string" ? data.scope : "",
  }
}

/** Which Google account is this token for? A LABEL, not an authentication — see
 * the file header for why this is one call to Google rather than a second copy
 * of a JWT verifier. */
export async function connectedEmail(accessToken: string): Promise<string> {
  const res = await fetch(USERINFO_ENDPOINT, {
    // R11 again — every socket in this file is bounded.
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new GuardError(502, "google_refused", "Google didn't say which account that was.")
  const data = (await res.json()) as { email?: unknown }
  if (typeof data.email !== "string" || !data.email.trim())
    throw new GuardError(502, "google_refused", "Google didn't say which account that was.")
  return data.email.trim().toLowerCase()
}

/**
 * TELL GOOGLE TOO. Disconnecting deactivates our row, which stops US using the
 * grant — it does nothing at Google, where the app would sit in the person's
 * "third-party access" list forever looking live. So the disconnect door asks
 * Google to drop it as well.
 *
 * AND IT IS THE ONLY THING THAT CAN NARROW A SCOPE. This is leg 1 of the essay
 * at the top of this file: a grant is an additive SET at Google, so the only way
 * to stop holding a power is to empty the set and consent again. Everything else
 * — the scope list here, the code that no longer calls a write endpoint — is
 * this app's own behaviour, and the grant is Google's. A refresh token is what
 * is handed over rather than an access token because revoking a refresh token
 * takes its access tokens with it.
 *
 * Best-effort ON PURPOSE, and in the safe direction: our row is deactivated
 * first and is the authority, so a failure here leaves a grant Google still
 * honours but nothing in kwapso can reach — never the reverse. It returns a
 * boolean rather than throwing so the door can say "we've disconnected it here;
 * remove it in your Google account too" instead of failing a disconnect the
 * person asked for. The caller reports that word for word, because a revoke that
 * failed is the case where the next connect starts dirty.
 */
export async function revokeAtGoogle(refreshToken: string): Promise<boolean> {
  try {
    const res = await fetch(REVOKE_ENDPOINT, {
      method: "POST",
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
    })
    if (res.ok) return true
    // ALREADY GONE IS DONE. Google answers a token it no longer knows with 400
    // `invalid_token`, and reading that as a failure tells somebody to go and
    // remove an app that is already removed. It matters most in exactly the case
    // this whole lane is about: the four services share one OAuth client, so
    // revoking the first can take the grant behind all four with it, and the
    // three disconnects after it would each report a failure while describing
    // the state the person asked for. A token Google will not accept is a token
    // that cannot be used, which is the entire promise of a revoke.
    if (res.status === 400) {
      const said = (await res.json().catch(() => ({}))) as { error?: unknown }
      return said.error === "invalid_token"
    }
    return false
  } catch {
    return false
  }
}

// ── the small crypto this flow needs ─────────────────────────────────────────
// PKCE and a CSRF state, nothing more. Deliberately local: they are eight lines
// of standard base64url over WebCrypto, and reaching into the auth worker for
// them would bind two workers together to share what a reader can check at a
// glance.

function randomToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)))
}

async function sha256Bytes(text: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text) as BufferSource)
  return new Uint8Array(digest)
}

function base64Url(bytes: Uint8Array): string {
  let s = ""
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}
