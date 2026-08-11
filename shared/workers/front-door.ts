// WHAT BOTH FRONT DOORS DO IDENTICALLY — serve an uploaded file, and record a
// crash a browser posted home.
//
// The two gateways differ where they should: one forwards by prefix for the
// agency, one by a named allow-list for clients. They do NOT differ here, and
// when this code existed twice they did anyway — the portal's media door was
// written a second time and shipped WITHOUT the key validation the agency door
// had carried for weeks. That is the whole argument for this file: a security
// control that exists twice is a security control that holds until someone
// writes the second copy from memory.

import { fail } from "./http"
import { safeMediaKey } from "./image"

/** Anything with `.fetch()` — a service binding, in worker terms. */
type Upstream = { fetch(url: string, init?: RequestInit): Promise<Response> }

/** What an R2 object body looks like to us — just enough to serve it, so this
 * module needs no R2 types beyond what it actually touches. */
type MediaObject = { body: ReadableStream | null; httpMetadata?: { contentType?: string } }
type MediaBucket = { get(key: string): Promise<MediaObject | null> }

/** Headers for an R2 media object served on an app origin. These responses are
 * WORKER-built, so the app's public/_headers does not apply to them — the
 * security headers must live here. `sandbox` + `default-src 'none'` neuters any
 * script even if a script-capable file slipped past the upload allow-list
 * (defense in depth behind parseUploadDataUrl's INLINE_SAFE_UPLOAD check);
 * nosniff stops MIME sniffing. */
export function mediaHeaders(object: MediaObject): HeadersInit {
  return {
    "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=31536000, immutable",
  }
}

/**
 * Serve an uploaded file from R2 — a CAPABILITY URL, on purpose.
 *
 * This door serves any object whose key you know, with NO session and NO
 * membership check. That is a recorded, deliberate decision (SCOPE ch.06
 * "Files": uploaded media stays on unguessable no-login links, with the exposure
 * accepted in writing). It is re-stated as a fork decision in BASE-MANUAL §5: a
 * product that stores invoices, contracts, ID documents or anything a regulator
 * calls personal data must replace this with a session + membership check or
 * short-lived signed URLs BEFORE launch. Nothing here is an accident to be
 * tidied away.
 *
 * What the decision RESTS on is that the key is unguessable, so that is the part
 * this code has to keep true: every object is written under a random ULID
 * segment by mediaKey(), and the key still arrives from the URL, so it is
 * validated at the boundary like any other request value. A probe gets the same
 * 404 as a miss.
 *
 * `prefix` is the URL segment already matched (e.g. "/media/"); everything after
 * it is the candidate key.
 */
export async function serveMedia(
  bucket: MediaBucket,
  pathname: string,
  prefix: string
): Promise<Response> {
  const key = safeMediaKey(pathname.slice(prefix.length))
  const object = key && (await bucket.get(key))
  if (!object) return new Response("Not found", { status: 404 })
  return new Response(object.body, { headers: mediaHeaders(object) })
}

/**
 * The client error beacon → the console (Cloudflare observability, live tails)
 * AND the central error_logs table via auth's internal door, so a crash on a
 * user's phone is queryable + resolvable later, not just visible for a week.
 *
 * Only forwarded once the session is VERIFIED with auth: a Cookie header is
 * attacker-controlled, so `Cookie: kwapso_session=x` used to be enough to write
 * a row into the GLOBAL core database from an anonymous request. Recording is
 * best-effort — a failed lookup drops the row and keeps the console line.
 *
 * AND THE ROW IS CHARGED TO WHOEVER AUTH JUST NAMED. Every FIELD of a beacon is
 * length-capped in logError, but the number of ROWS was not: a signed-in caller
 * with a loop could grow the global core database until it hit its size alarm,
 * and the store that exists to say what broke would be the thing that broke. The
 * ceiling lives in logError (it has to — every path into the table needs it),
 * and it is per CALLER, so it needs a caller. The body cannot name one: it is
 * the attacker's. The `/me` answer can, and it is one call we already make. A
 * beacon we could not attribute is still RECORDED — it simply shares the door's
 * own bucket ("web" / "portal"), the same fail-toward-refusing bargain
 * login-codes' "unknown" IP bucket makes, so a change in auth's shape can never
 * silently stop the error log filling.
 *
 * `source` labels which door the crash came from ("web" / "portal"), which is
 * the only thing the two callers legitimately differ on. The swappable client
 * seam is shared/web/log.ts; the ruleset is ERROR-HANDLING.md.
 */
export async function recordClientError(
  request: Request,
  auth: Upstream,
  source: string,
  internalKey: string | undefined
): Promise<Response> {
  const raw = await request.text().catch(() => "")
  console.error(`${source}_client_error`, raw.slice(0, 4000))
  const cookie = request.headers.get("Cookie") ?? ""
  const me = cookie.includes("kwapso_session=")
    ? await auth.fetch("https://internal/api/auth/me", { headers: { Cookie: cookie } }).catch(() => null)
    : null
  if (me?.ok) {
    // Whose it is, best-effort: a session that verified but whose body we can't
    // read still gets its crash recorded, on the shared bucket.
    const who = await me
      .json()
      .then((d) => (d as { user?: { id?: unknown } })?.user?.id)
      .catch(() => undefined)
    let b: { where?: string; message?: string; stack?: string; url?: string } = {}
    try {
      b = JSON.parse(raw)
    } catch {
      /* an unparsable beacon stays console-only */
    }
    if (b.message)
      await auth
        .fetch("https://internal/internal/log-error", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal-key": internalKey ?? "" },
          body: JSON.stringify({
            source,
            place: b.where ?? "unknown",
            message: b.message,
            stack: b.stack,
            url: b.url,
            userId: typeof who === "string" ? who : undefined,
          }),
        })
        .catch(() => null) // recording must never break the beacon
  }
  return new Response(null, { status: 204 })
}

/** The other thing both doors do the same way: catch their OWN crash.
 *
 * A public door must never answer a stranger with Cloudflare's raw 1101. Neither
 * gateway binds a database, so the crash goes out the same internal pipe the
 * client beacon uses — best-effort, because a door that cannot report is still a
 * door that must answer.
 *
 * NOT `recordClientError`, deliberately: that one reads the request BODY (there
 * is no body here, only an exception), and it writes nothing for an anonymous
 * caller — which is exactly the 1101 case this exists to catch. Same pipe, two
 * honestly different jobs.
 *
 * `source` is the door's name ("gateway" / "portal-gateway") and also spells the
 * console prefix, so the two logs read as they always did. */
export async function recordGatewayCrash(
  request: Request,
  auth: Upstream,
  source: string,
  internalKey: string | undefined,
  e: unknown
): Promise<Response> {
  const place = new URL(request.url).pathname
  console.error(`${source.replaceAll("-", "_")}_error`, place, e)
  await auth
    .fetch("https://internal/internal/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": internalKey ?? "" },
      body: JSON.stringify({
        source,
        place,
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      }),
    })
    .catch(() => null)
  return fail(500, "server_error", "Something went wrong.")
}
