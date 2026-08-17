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

/** HOW MANY OBJECTS ONE TEAM'S CHANNEL IS SPREAD ACROSS.
 *
 * A Durable Object is single-threaded and a broadcast is a serial loop over its
 * sockets, so ONE object per team made the team's socket count the ceiling: at a
 * few thousand listeners a ping costs hundreds of milliseconds of one object's
 * only thread, and every later publish queues behind it. Cloudflare's soft
 * ceiling for one instance is ~1,000 requests/second and each publish is one
 * request, so the publish rate reached it before the loop did.
 *
 * Splitting the channel divides the sockets — and therefore the per-ping work AND
 * the per-object request rate — by this number. It is the one change that moves
 * the ceiling rather than shaving the constant in front of it.
 *
 * THE COST IS PAID BY THE PUBLISHER, and it is paid INSIDE the realtime worker
 * rather than here: a publisher still makes ONE call naming `team:<id>`, and
 * realtime fans that out to the shards. Every one of the hundred-odd
 * `publishChange` call sites is therefore untouched, which is the whole reason the
 * split is shaped this way — a fan-out written at the publisher would have been a
 * hundred chances to write it differently.
 *
 * WHY FOUR. Each shard is a real object with real per-request overhead, so this
 * trades publish work for broadcast headroom and the trade only pays while the
 * broadcast is the expensive side. Four takes the ceiling from ~3–5k concurrent
 * listeners per team to ~12–20k, which clears the yardstick's 25,000 peak only
 * once combined with subscription scoping below — and it keeps a quiet team's
 * publish cost to four hibernating objects instead of one, which is nearly free
 * (an idle object is evicted). Raising it is a one-line change; the number is here
 * rather than inline so the client and the fan-out can never disagree about it. */
export const REALTIME_SHARDS = 4

/** WHICH shard a listener joins — stable per person, so their own devices land
 * together and a reconnect returns to the same object.
 *
 * A cheap non-cryptographic hash: this decides load distribution, not
 * authorization, and a listener who forced themselves onto another shard would
 * gain nothing (the shards are identical and the account fence rides the socket,
 * not the shard). It must be IDENTICAL on the client and in the worker, which is
 * why it lives in the seam both import rather than being written twice. */
export function shardFor(key: string, shards = REALTIME_SHARDS): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return Math.abs(h) % shards
}

/** The DO name for one shard of a team's channel. `#` because a Durable Object
 * name is an opaque string and `#` appears in no team id (a ULID is base32), so
 * the two halves can never be confused for one another. */
export function teamShardName(teamId: string, shard: number): string {
  return `team:${teamId}#${shard}`
}

/** The DO name for a team's INTEREST REGISTRY — one instance per team, holding
 * which shards currently hold a listener for which resource. `!` for the same
 * reason `#` is used above: it appears in no ULID, so a registry name can never
 * collide with a shard's. */
export function teamInterestName(teamId: string): string {
  return `team:${teamId}!interest`
}

/** WHY A REGISTRY, AND THE HONEST ARITHMETIC.
 *
 * A publish fans out to every shard whether or not anybody there is listening
 * for that resource. The registry lets the door ask once and skip the shards
 * with nobody interested.
 *
 * At REALTIME_SHARDS = 4 this is roughly a wash and can cost one extra call:
 * 1 registry read + K interested shards, against 4 unconditional shard calls.
 * It wins at K ≤ 2 and loses at K = 4. That is not the reason it exists.
 *
 * IT EXISTS TO REMOVE THE CEILING ON THE SHARD COUNT ITSELF. Sharding divides
 * broadcast work by N but multiplies publish work by N, so ARCHITECTURE.md §7's
 * own table shows 128 shards failing on the publish side at ~22,000 object calls
 * a second — the fan-out becomes the bottleneck exactly when the sharding starts
 * to matter. With interest routing the publish side stops scaling with N and
 * starts scaling with how many shards actually care, which is what makes a
 * larger N worth having. Raising REALTIME_SHARDS is the follow-on decision this
 * unlocks; it is deliberately NOT taken here, because that number is a locked
 * one and this change is the prerequisite, not the change itself.
 *
 * FAIL OPEN, ALWAYS. Every unknown answers "interested": an unregistered shard,
 * an entry older than a listener's own deadline, an unreachable registry, a
 * malformed reply. The cost of a wrong "yes" is one wasted object call. The cost
 * of a wrong "no" is a screen that goes quietly out of date, which is the single
 * failure the live layer exists to prevent. */
export const INTEREST_STALE_MS = 15 * 60 * 1000

/** One shard's declared interest, as the registry stores it. `all: true` means
 * that shard holds at least one listener that declared no subscription — the
 * pre-subscription client, which must hear everything. */
export type ShardInterest = { resources: string[]; all: boolean; at: number }

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
