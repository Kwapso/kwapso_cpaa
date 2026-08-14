// Publish a "something changed" ping to a live channel — the call any worker
// makes after a successful write so every open screen refreshes ONLY the row
// that changed. Best-effort: a live-layer hiccup must never break the write it
// describes (callers don't await-throw). Reusable by every kwapso-based app.
//
// TWO channel scopes (the realtime worker fans each `event` to everyone on the
// named channel):
//   • team:<teamId>  — team-scoped data (members, roles, invites, …). Every
//     member of that team is connected.
//   • user:<userId>  — identity-scoped data for ONE person across their devices
//     (account activity, profile, email, their team-membership list) AND
//     session events (a forced sign-out). Every signed-in device is connected,
//     even before the user joins a team.
//
// The payload NEVER carries row data (`{resource,id}` only) — the client pulls
// that one row through the permission-checked endpoint, so nothing can leak.

import type { Fetcher } from "@cloudflare/workers-types"

/** What a publisher needs: the binding, and the shared internal key the realtime
 * worker checks. Taking the whole env (rather than just the binding) is what
 * lets the key travel with the call — a publisher that forgets it is a type
 * error here instead of a silent 403 at runtime. */
export type RealtimeEnv = { REALTIME: Fetcher; INTERNAL_KEY?: string }

/** One change ping. `op` is advisory; the client re-pulls the row and decides
 * whether it still belongs in the collection (keep-or-drop), so "edit" vs
 * "remove" need not be exact. A `session` event (no id) is the sign-out signal. */
export type ChangeEvent = {
  /** The module/collection tag, e.g. "members", "member_roles", "invites",
   * "account_activity", "teams". For a session event: "session". */
  resource: string
  /** The affected row id (omitted for collection-wide or session events). */
  id?: string
  /** add | edit | remove | session — advisory; the client verifies by re-pull. */
  op?: "add" | "edit" | "remove" | "session"
  /** WHOSE row this is: the account it belongs to, when the row is not itself an
   * account. A CLIENT LOGIN's socket carries the set of accounts they may hear
   * about (`mayHearChange`), and a ticket id tells that fence nothing — so a
   * resource a client is allowed to hear names its account here, or it is heard
   * only by staff. Never a secret in its own right: it is the id of a company
   * the listener already stands in, or the listener never receives it. */
  scope?: string
}

async function publish(env: RealtimeEnv, channel: string, event: ChangeEvent): Promise<void> {
  // THE PING MUST NOT OUTLIVE THE WRITE IT DESCRIBES. This hop is already
  // best-effort — the catch below is the whole degradation story, and a live
  // layer that is down costs a screen its instant refresh and nothing else. But
  // a HUNG realtime is worse than a dead one: without a ceiling the publish keeps
  // the mutation's request open, so an unwell live layer turns every successful
  // write into a slow one. Two seconds is a fan-out to a Durable Object in the
  // same colo; anything slower has already failed.
  // (Cast: see whoAmI in gating.ts — shared/ compiles in the web workspaces too.)
  const init = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // /publish can broadcast to ANY channel, so it is an internal door and
      // is keyed like every other one. Network isolation (workers_dev:false,
      // and the gateway never routing it) was its only protection before —
      // one config regression away from an open broadcast door.
      "x-internal-key": env.INTERNAL_KEY ?? "",
    },
    body: JSON.stringify({ channel, event }),
    signal: AbortSignal.timeout(2_000),
  } as unknown as Parameters<typeof env.REALTIME.fetch>[1]

  try {
    await env.REALTIME.fetch("https://realtime/publish", init)
  } catch (e) {
    console.error("realtime publish failed:", e)
  }
}

/** Tell a TEAM's channel that one row in `resource` changed. `scope` is the
 * account the row belongs to — pass it for anything a client login is meant to
 * hear, because their socket is fenced by account and cannot check a row id. */
export async function publishChange(
  env: RealtimeEnv,
  teamId: string,
  resource: string,
  id?: string,
  op?: ChangeEvent["op"],
  scope?: string
): Promise<void> {
  await publish(env, `team:${teamId}`, { resource, id, op, scope })
}

/** Tell ONE user's channel (all their devices) that one identity row changed. */
export async function publishUserChange(
  env: RealtimeEnv,
  userId: string,
  resource: string,
  id?: string,
  op?: ChangeEvent["op"]
): Promise<void> {
  await publish(env, `user:${userId}`, { resource, id, op })
}

/** Force-sign-out one user's OTHER devices (e.g. after an email change). Carries
 * no id — the client re-checks auth and, if its session is dead, redirects to
 * login. The acting device keeps its (still-valid) session. */
export async function publishSignOut(env: RealtimeEnv, userId: string): Promise<void> {
  await publish(env, `user:${userId}`, { resource: "session", op: "session" })
}
