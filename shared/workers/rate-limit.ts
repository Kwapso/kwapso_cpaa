// PER-CALLER RATE LIMITING ON ORDINARY DOORS — the last unguarded surge path.
//
// Auth, the agent, the error beacon and account activity have all been throttled
// for a while, each in its own way and each for its own reason. Ordinary reads
// were not throttled at all: any signed-in member could ask for the activity feed,
// the accounts list or a ticket page as fast as their laptop could post, and every
// one of those is a real D1 read on a database everybody in the team shares.
//
// WHY IT LOOKED LIKE CONFIG AND WAS NOT. The obvious place for a limiter is the
// gateway, and the gateway cannot do it: neither front door decodes a session, so
// neither knows WHO is asking. The alternatives were both wrong — per-IP puts one
// client's whole office behind a single bucket (they share an address, and the
// busiest office would be throttled first for being the best customer), and a
// session lookup at the gateway is an extra auth round trip on every request in the
// app, which is a real cost paid on every good request to catch a rare bad one.
//
// SO IT SITS WHERE THE CALLER IS ALREADY KNOWN. `teamContext` resolves the session
// once per request, for every team-scoped door on tenancy, content and data-ops.
// The user id is in hand at that moment and costs nothing to key on. That is the
// whole trick: the limiter is not at the edge because the edge does not know who
// you are, and it is not a new lookup because one already happened.
//
// IT FAILS OPEN, DELIBERATELY. A rate limiter is a safety valve; a broken safety
// valve must not become the outage it exists to prevent. If the binding is absent
// (an environment that has not been configured, every test in this repo) or the
// limit call throws, the request proceeds. The failure it protects against is a
// loop hammering a database; the failure of failing CLOSED is every signed-in
// person locked out because one edge component is unwell. Those are not
// comparable, so the choice is not close.
//
// It is not silent, though — a limiter that has stopped working is an
// infrastructure event somebody must hear about, and a request that succeeded is
// not the place to report it (ERROR-HANDLING.md: never swallow). It logs, and the
// request carries on.

import { CALLER_REQUESTS_PER_MINUTE } from "./limits"

/** Cloudflare's rate-limiting binding, as much of it as this seam uses.
 *
 * Declared here rather than taken from the platform types because it is one
 * method and because the binding is OPTIONAL: an environment without it must
 * typecheck, since that is the state every test runs in and the state a fresh
 * deployment is in until its wrangler config catches up. */
export type RateLimiter = { limit(options: { key: string }): Promise<{ success: boolean }> }

export type RateLimitEnv = { CALLER_LIMIT?: RateLimiter }

/** THE ONE SENTENCE a throttled caller reads. Plain, and it says the two things a
 * person needs: nothing is broken, and waiting is the fix. No numbers — "600 per
 * minute" is true and useless to somebody who has no idea how many requests a
 * screen makes, and a real person meeting this message is almost always a stuck
 * page retrying rather than a person clicking.
 *
 * The MESSAGE lives here and the THROW lives in gating.ts, which is not ceremony:
 * this file must not import GuardError, because gating.ts imports this file and a
 * cycle between the two would be a real import loop rather than a tidy one. So
 * this seam decides, and the seam that already owns every other refusal in the
 * request path is the one that refuses. */
export const TOO_FAST =
  "That's a lot of requests at once. Give it a few seconds and try again. Nothing was lost."

/** Has this caller got budget left? TRUE means carry on.
 *
 * It ANSWERS rather than throws, so the one place that turns a refusal into an
 * HTTP status stays the one place (gating.ts) — and so this file needs no import
 * from the module that imports it.
 *
 * `callerId` is the resolved user id (never anything off the request — a limiter
 * keyed on something a caller can change is a limiter a caller can reset). The
 * ceiling is per WORKER, because the binding is: a person's reads on content and
 * their reads on tenancy are separate budgets, which is right — they are separate
 * databases' worth of work.
 *
 * The `kind` prefix separates the MCP ENDPOINT's own budget from the app's, so a
 * token loop is refused at `/mcp` before it becomes a hundred forwarded requests.
 *
 * IT DOES NOT, AND SHOULD NOT, GIVE AN INTEGRATION A BUDGET OF ITS OWN ON THE
 * DOORS BEHIND IT. An MCP tool acts AS its owner over the same gated doors with
 * that person's own session, so those requests spend that person's app budget on
 * whichever worker answers them — which is the honest reading of "per caller". A
 * script somebody wrote is still them asking. The alternative would be a header
 * saying "count this differently", and `/api/*` is public through the gateway, so
 * that header would be a way for any caller to ask for a second budget. */
export async function callerHasBudget(
  env: RateLimitEnv,
  callerId: string,
  kind: "app" | "machine" = "app"
): Promise<boolean> {
  const limiter = env.CALLER_LIMIT
  // Not configured — the state every test runs in, and the state a deployment is
  // in between the code landing and the binding being added. Today's behaviour.
  if (!limiter) return true

  try {
    return (await limiter.limit({ key: `${kind}:${callerId}` })).success
  } catch (e) {
    // FAIL OPEN, and say so. A limiter that cannot answer must not be able to
    // refuse: the request it would have blocked is a hypothetical, and the
    // requests it would block by failing closed are everybody's.
    console.error(
      `rate limiter unavailable, request allowed through (fail open): ${e instanceof Error ? e.message : String(e)}`
    )
    return true
  }
}

/** What the ceiling is, re-exported so a caller reading this file does not have to
 * go and find it. The number itself, and the reasoning for it, live in limits.ts
 * with every other number this app chose. */
export { CALLER_REQUESTS_PER_MINUTE }
