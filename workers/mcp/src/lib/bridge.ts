// The token → session BRIDGE. A verified token is exchanged (via auth's
// INTERNAL_KEY-gated /internal/mcp-session) for a short-lived session PINNED to
// the token's team — so every tool call flows through the SAME gated doors a
// browser uses: live membership + role re-checked per request, input validated
// at the boundary, activity + audit written identically. Minted cookies are
// cached per isolate (~10 min) to avoid a session INSERT per call; the token
// itself is re-verified on EVERY request, so revocation bites immediately.

import { AUTH_UNAVAILABLE_MS, GuardError } from "@shared/workers/gating"
import type { Env } from "../env"
import { requireStaff } from "./staff"
import type { McpTokenRow } from "./tokens"

const SESSION_COOKIE = "kwapso_session" // auth's cookie name (sessions.ts)

/** HOW LONG A PASSED STAFF CHECK MAY STAND.
 *
 * The cookie cache exists to avoid a session INSERT per tool call, and nothing
 * is cached until `requireStaff` has passed — so the window is also how long a
 * PASSED AUTHORIZATION DECISION stands without being re-asked. That is a posture
 * worth being precise about, even though the decision it caches has no
 * transition that could invalidate it:
 *
 *   • to hold a working token you must be an ACTIVE member of the pinned team
 *     (auth's /internal/mcp-session refuses anyone else, on every mint);
 *   • to read as a CLIENT you must have a `portal_users` row — and portal-ness
 *     is decided by the PRESENCE of that row, live or revoked (the fence reads
 *     `WHERE user_id = ?` with no liveness filter). Presence is permanent:
 *     revoking a grant keeps the row, so anyone who has EVER been a client
 *     reads as `portal` and `requireStaff` refuses them — which means they
 *     could never have minted a token in the first place. (The grant door's
 *     `is_staff` refusal still guards the FIRST grant against fencing a
 *     colleague out; since re-grants were allowed for prior clients it is a
 *     courtesy, not the carrier — presence is the carrier.)
 *
 * The two are mutually exclusive at every instant, so "staff at mint, client a
 * moment later" is not a state this app can reach. That refutation is not a
 * paragraph to be taken on trust: `test/staff-only.test.ts` reads the fence's
 * own source and fails if the presence rule ever relaxes, at which point this
 * cache has to go rather than quietly become the hole.
 *
 * It was ten minutes, on the reasoning that anything inside the 60-minute
 * pinned-session TTL is safe. "Safe" was the wrong measure — the right one is
 * how long a decision may stand unasked, and a minute is what the cache is
 * actually FOR (a burst of tool calls in one conversation shares one session).
 * Ten minutes bought a rounding error of extra sharing and held an answer for
 * ten times as long. */
const CACHE_MS = 60 * 1000

const cache = new Map<string, { cookie: string; expires: number }>()

/** WHAT AN EXPIRED ENTRY IS: a live session cookie for somebody the cache has
 * stopped answering for. Nothing used to remove one. `dropCachedSession` clears
 * a REVOKED token's entry and a fresh mint OVERWRITES its own, so an entry only
 * ever left this map if its own token came back — which means an isolate serving
 * many tokens accumulated one credential per token it had ever seen, past the
 * minute it was useful, for as long as the isolate lived. Small, but it is an
 * unbounded structure holding credentials, and both halves of that sentence are
 * the kind this codebase does not leave standing.
 *
 * Swept on the way past rather than on a timer: this function is the only thing
 * that writes to the map, so it is the only moment the map can grow, and a
 * linear pass over a map bounded by one isolate's live tokens costs nothing
 * beside the network call it precedes. */
function evictExpired(now: number): void {
  for (const [id, entry] of cache) if (entry.expires <= now) cache.delete(id)
}

/** The Cookie header for acting AS this token's owner IN the token's team. */
export async function sessionCookieFor(env: Env, token: McpTokenRow, traceId: string): Promise<string> {
  const hit = cache.get(token.id)
  if (hit && hit.expires > Date.now()) return hit.cookie
  // A miss means we are about to write, so this is the moment to drop what the
  // map is holding on to and no longer answering with.
  evictExpired(Date.now())

  let res: Response
  try {
    res = await env.AUTH.fetch("https://internal/internal/mcp-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": env.INTERNAL_KEY ?? "",
      },
      body: JSON.stringify({ userId: token.user_id, teamId: token.team_id }),
      // The same ceiling the gating seam puts on the identity read, because this
      // IS the identity read for the machine surface — and an outside tool
      // holding a request open is exactly the caller least likely to give up on
      // its own. AUTH_UNAVAILABLE_MS, so the two never drift apart.
      signal: AbortSignal.timeout(AUTH_UNAVAILABLE_MS),
    })
  } catch {
    // A CEILING HIT IS NOT A BAD TOKEN. Falling through to the 502 below would
    // be roughly right, but the code matters here: an outside tool that reads
    // `bridge_failed` may well delete a token it thinks has gone stale, when
    // nothing was ever wrong with it. Same code the human doors give.
    throw new GuardError(
      503,
      "auth_unavailable",
      "We can't act for this token right now. Try again in a moment."
    )
  }
  if (!res.ok) {
    // auth's clean reason (e.g. no longer an active member) passes straight out.
    const body = (await res.json().catch(() => null)) as { message?: string } | null
    throw new GuardError(
      res.status === 403 ? 403 : 502,
      "bridge_failed",
      body?.message ?? "Couldn't act for this token right now."
    )
  }
  const { token: session } = (await res.json()) as { token: string }
  const cookie = `${SESSION_COOKIE}=${session}`
  // THE ONE PLACE A TOOL CALL GETS ITS HANDS ON A SESSION — so it is the one
  // place worth asking whether this caller belongs on the machine surface at
  // all. A client login is refused here rather than at each tool, because a
  // per-tool check is a list, and a list is a thing you can be missing from.
  // Nothing is cached until it passes, so a refused token pays the question
  // again on its next call instead of holding a cookie it may not use.
  await requireStaff(env, cookie, traceId)
  cache.set(token.id, { cookie, expires: Date.now() + CACHE_MS })
  return cookie
}

/** Forget a token's cached session (used right after a revoke). */
export function dropCachedSession(tokenId: string): void {
  cache.delete(tokenId)
}
