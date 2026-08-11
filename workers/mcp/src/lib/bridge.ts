// The token → session BRIDGE. A verified token is exchanged (via auth's
// INTERNAL_KEY-gated /internal/mcp-session) for a short-lived session PINNED to
// the token's team — so every tool call flows through the SAME gated doors a
// browser uses: live membership + role re-checked per request, input validated
// at the boundary, activity + audit written identically. Minted cookies are
// cached per isolate (~10 min) to avoid a session INSERT per call; the token
// itself is re-verified on EVERY request, so revocation bites immediately.

import { GuardError } from "../../../../shared/workers/gating"
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
 *   • to read as a CLIENT you must have a `portal_users` row, and the only door
 *     that writes one refuses an active team member outright — a 409 `is_staff`,
 *     because a client login would fence a colleague out of the agency app.
 *
 * The two are mutually exclusive at every instant, so "staff at mint, client a
 * moment later" is not a state this app can reach. That refutation is not a
 * paragraph to be taken on trust: `test/staff-only.test.ts` reads tenancy's own
 * source and fails if that refusal ever relaxes, at which point this cache has
 * to go rather than quietly become the hole.
 *
 * It was ten minutes, on the reasoning that anything inside the 60-minute
 * pinned-session TTL is safe. "Safe" was the wrong measure — the right one is
 * how long a decision may stand unasked, and a minute is what the cache is
 * actually FOR (a burst of tool calls in one conversation shares one session).
 * Ten minutes bought a rounding error of extra sharing and held an answer for
 * ten times as long. */
const CACHE_MS = 60 * 1000

const cache = new Map<string, { cookie: string; expires: number }>()

/** The Cookie header for acting AS this token's owner IN the token's team. */
export async function sessionCookieFor(env: Env, token: McpTokenRow): Promise<string> {
  const hit = cache.get(token.id)
  if (hit && hit.expires > Date.now()) return hit.cookie

  const res = await env.AUTH.fetch("https://internal/internal/mcp-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": env.INTERNAL_KEY ?? "",
    },
    body: JSON.stringify({ userId: token.user_id, teamId: token.team_id }),
  })
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
  await requireStaff(env, cookie)
  cache.set(token.id, { cookie, expires: Date.now() + CACHE_MS })
  return cookie
}

/** Forget a token's cached session (used right after a revoke). */
export function dropCachedSession(tokenId: string): void {
  cache.delete(tokenId)
}
