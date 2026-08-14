// WHAT BOTH FRONT DOORS DO IDENTICALLY — refuse a write that another site
// started, serve an uploaded file, and record a crash a browser posted home.
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

/**
 * THE WRITE HAS TO HAVE STARTED HERE. The cross-site request forgery check,
 * on both front doors, in front of everything they forward.
 *
 * WHY THE COOKIE ALONE WAS NOT ENOUGH. `SameSite=Lax` is same-SITE, and "site"
 * means the registrable domain — kwapso.app, not agency.kwapso.app. There is a
 * live third-party no-code SaaS parked on portal.kwapso.app (it resolves to
 * Glide's edge), so "any page on our site" is not a set we control. And a form
 * POST needs no JSON content type to reach a door that parses JSON regardless:
 * `<form enctype="text/plain">` shapes its own body, `name=value` becomes
 * `{"userId":"…","roleId":"<admin>","x":"…"}`, no preflight is triggered, the
 * session cookie rides along as a same-site request, `requireRight` passes on
 * the VICTIM's rights, and the member-role door promotes whoever asked. The
 * gates were all working; nobody had asked who started the request.
 *
 * THE RULE, AND WHY IT IS SHAPED THIS WAY. A browser sets `Origin` on EVERY
 * request whose method is not GET or HEAD — form submissions included, that
 * being the whole point of the header. So:
 *
 *   • Origin present → it must be this door's own origin, or the answer is 403.
 *     That is every browser-driven write, and it is the entire attack surface,
 *     because an attacker's page cannot forge the header or suppress it.
 *   • Origin ABSENT → allowed, deliberately. Nothing with a cookie jar omits it;
 *     an absent Origin is a NON-BROWSER caller — the MCP surface answering an
 *     outside tool on a bearer token, `scripts/seed-staging.mjs` building
 *     staging through the front door, the two smoke scripts, curl. None of them
 *     carries an ambient credential a third-party page could ride, which is the
 *     only thing this check exists to stop.
 *
 * The alternative — refuse an absent Origin and teach every script to send a
 * fake one — buys nothing (an attacker cannot get into that branch) and costs
 * the thing that matters: the seed IS how staging is built, so the day it 403s,
 * somebody switches the check off rather than the seed on. A control that makes
 * the ordinary path harder is a control with a short life.
 *
 * `Origin: null` (a sandboxed iframe, a data: URL) is PRESENT and not ours, so
 * it is refused — which is right: that is a browser, with a cookie jar.
 *
 * Deliberately not read: `Referer`. It is stripped by privacy tooling often
 * enough that trusting it means either a fallback that fails open or a door that
 * breaks for careful users. Origin survives that.
 */
export function refuseForeignOrigin(request: Request): Response | null {
  if (request.method === "GET" || request.method === "HEAD") return null
  const origin = request.headers.get("Origin")
  if (origin === null) return null // a non-browser caller: no cookie jar to ride
  if (origin === new URL(request.url).origin) return null
  return fail(403, "foreign_origin", "That request didn't come from this site.")
}

/** WHAT A RANGE IS, as R2 spells it: a UNION of three shapes, not one object with
 * three optional fields. "From here to the end", "this many bytes from here" and
 * "the last n bytes" are three different asks, and a single all-optional object
 * would also describe nonsense (a length with no offset and a suffix at once).
 * Writing the union is what lets `byteRange` return only the askable shapes — and
 * it is the shape the real binding hands BACK, so the response can describe what
 * was actually sent.
 *
 * `options?: unknown` on the bucket below is the other half of the same note:
 * `R2Bucket.get` is overloaded and one of its overloads requires `onlyIf`, so a
 * structural slice that names the options shape is checked against THAT overload
 * and the real binding stops being assignable. The option object is built one line
 * from where it is passed and fully typed there; what this door needs from the
 * bucket is the key and the answer. */
type MediaRange = { offset: number; length?: number } | { length: number } | { suffix: number }

/** What an R2 object body looks like to us — just enough to serve it, so this
 * module needs no R2 types beyond what it actually touches.
 *
 * `size` and `range` are what a RANGE read needs: the total length for the
 * `Content-Range` header, and which slice R2 actually returned (it may narrow a
 * request, and the header must describe what was sent, not what was asked for). */
type MediaObject = {
  // OPTIONAL, and the reason is R2's own types: one `get` overload can answer an
  // `R2Object` (metadata, no body) as well as an `R2ObjectBody`, so a slice that
  // REQUIRES `body` is not something the real binding satisfies. The serve path
  // treats a missing body as an empty one, which is what a 200 with no content is.
  body?: ReadableStream | null
  size?: number
  range?: MediaRange
  httpMetadata?: { contentType?: string }
}
/** The one method this door touches, still — now with the range option it needs. */
type MediaBucket = {
  get(key: string, options?: unknown): Promise<MediaObject | null>
}

/** The `Range:` header, as the one form that matters here — a single byte range.
 *
 * Multi-range requests are legal HTTP and no browser media player sends them, so
 * anything that is not one plain `bytes=a-b`, `bytes=a-` or `bytes=-n` is treated
 * as no range at all: the whole object comes back with a 200, which is exactly
 * what a client that could not be understood should receive. */
function byteRange(header: string | null): MediaRange | null {
  const m = header && /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null
  const [, rawStart, rawEnd] = m
  if (rawStart === "" && rawEnd === "") return null
  // `bytes=-500` is "the last 500 bytes", which R2 calls a suffix.
  if (rawStart === "") return { suffix: Number(rawEnd) }
  const offset = Number(rawStart)
  if (rawEnd === "") return { offset }
  const end = Number(rawEnd)
  if (end < offset) return null // a nonsense range is not a range
  return { offset, length: end - offset + 1 }
}

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
    // WHAT MAKES A RANGE REQUEST POSSIBLE AT ALL. Without this a browser does not
    // ask, and a media player that cannot ask cannot seek: an attachment may be a
    // 25 MB video, and dragging its scrub bar re-downloaded the whole file from
    // the start — a resumable, seekable object served as if it were a small image.
    "Accept-Ranges": "bytes",
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
  prefix: string,
  /** The caller's `Range:` header, when there is one. Optional so the two
   * gateways' existing whole-object calls keep working unchanged. */
  rangeHeader?: string | null
): Promise<Response> {
  const key = safeMediaKey(pathname.slice(prefix.length))
  if (!key) return new Response("Not found", { status: 404 })
  const range = byteRange(rangeHeader ?? null)
  const object = await bucket.get(key, range ? { range } : undefined)
  if (!object) return new Response("Not found", { status: 404 })
  const headers = new Headers(mediaHeaders(object))
  // A PARTIAL ANSWER MUST SAY SO, and say exactly which bytes it is. A 200 with a
  // slice of the file in it is the worst possible reply: the player believes it
  // has the whole thing. R2 may also narrow what it returns, so the header
  // describes `object.range` — what was SENT — never what was asked for.
  if (range && object.range && object.size !== undefined) {
    // Read off the union R2 handed back, in the same three shapes it accepts. A
    // suffix answer ("the last n bytes") has no offset of its own — it is the one
    // whose start has to be computed from the total.
    const sent = object.range
    const offset =
      "suffix" in sent ? Math.max(0, object.size - sent.suffix) : "offset" in sent ? sent.offset : 0
    const length =
      "suffix" in sent ? Math.min(sent.suffix, object.size) : (sent.length ?? object.size - offset)
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`)
    headers.set("Content-Length", String(length))
    return new Response(object.body ?? null, { status: 206, headers })
  }
  return new Response(object.body ?? null, { headers })
}

/**
 * The client error beacon → the console (Cloudflare observability, live tails)
 * AND the central error_logs table via auth's internal door, so a crash on a
 * user's phone is queryable + resolvable later, not just visible for a week.
 *
 * Only recorded — in EITHER store — once the session is VERIFIED with auth: a
 * Cookie header is attacker-controlled, so `Cookie: kwapso_session=x` used to be
 * enough to write a row into the GLOBAL core database from an anonymous request.
 * The console half was left in front of that check and so kept the hole open in
 * its cheaper form: an unauthenticated caller could still push 4,000 characters
 * of their own text per request into the log stream. Both writes now sit behind
 * the same door. Recording stays best-effort — a failed lookup drops the row —
 * but a caller auth cannot name gets neither.
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
  const cookie = request.headers.get("Cookie") ?? ""
  const me = cookie.includes("kwapso_session=")
    ? await auth.fetch("https://internal/api/auth/me", { headers: { Cookie: cookie } }).catch(() => null)
    : null
  if (me?.ok) {
    // THE CONSOLE LINE IS ALSO A WRITE, and it used to happen first. Four
    // thousand characters of attacker-authored text went into the observability
    // stream on an anonymous POST, before the session was checked — the same
    // unverified-caller hole the error_logs row was closed for, one line above
    // where it was closed. Nothing about an anonymous beacon is useful: no user,
    // no team, no team channel it belongs to. So the log line moved behind the
    // same door as the row, and the two now cost the same thing to reach.
    console.error(`${source}_client_error`, raw.slice(0, 4000))
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
