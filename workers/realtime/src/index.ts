// kwapso REALTIME worker — the live "switchboard".
//
// TWO Durable Object classes. TeamChannel (addressed "team:<id>#0…N-1", one
// object per SHARD of a team) holds open WebSocket connections and fans out
// tiny "X changed" pings; TeamInterest (one per team) remembers which shards
// hold listeners for which resources, so a ping visits only the shards that
// care. (This header said "ONE Durable Object per team" for a year after the
// second class shipped — the file's own Env declared both the whole time.)
// Connections are accepted with the Hibernation API, so an idle team's object is
// evicted from memory while its sockets stay open — idle teams cost ~nothing.
// It stores NO application data; the databases remain the single source of truth.
//
//   GET  /api/realtime?team=<id>   (WebSocket upgrade) -> join a team's channel
//   POST /publish  { channel, event }                  -> broadcast (service-binding only)
//   GET  /api/realtime/health
//
// Reusable as-is by any app built on the kwapso base — it knows nothing about
// what "members" or "member_roles" mean; it just relays opaque resource tags.

import { DurableObject } from "cloudflare:workers"

import type { SessionUser } from "@shared/types"
import { healthBody } from "@shared/workers/config-health"
import { accountScope, mayHearChange, scopeStamp, type ScopeStamp } from "@shared/workers/account-scope"
import { AUTH_UNAVAILABLE_MS, d1ConfigFrom, GuardError, requireMember } from "@shared/workers/gating"
import {
  INTEREST_STALE_MS,
  REALTIME_SHARDS,
  type ShardInterest,
  shardFor,
  teamInterestName,
  teamShardName,
} from "@shared/workers/realtime"
import { fail, json } from "@shared/workers/http"
import { recordWorkerError } from "@shared/workers/error-log"
import { requestId, traceHeaders } from "@shared/workers/trace"
import { queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"

export type Env = {
  /** The per-team live channels (one Durable Object instance per team). */
  CHANNELS: DurableObjectNamespace<TeamChannel>
  /** The per-team INTEREST REGISTRY — which shards hold a listener for which
   * resource, so a publish can skip the rest. Holds no readable data and fences
   * nothing; see TeamInterest. */
  INTEREST: DurableObjectNamespace<TeamInterest>
  /** The auth worker — answers "who is opening this socket?". */
  AUTH: Fetcher
  /** Global core DB — read to confirm the connector is a team member (and to
   * find the team's own database, below). */
  DB: D1Database
  /** The Cloudflare D1 REST door, for the ONE extra read a socket needs: is this
   * listener a client login, and which accounts are theirs (the fence). */
  CF_ACCOUNT_ID: string
  CF_D1_TOKEN?: string
  /** Shared secret every internal caller presents on /publish. Fail-closed:
   * unset means the door refuses everyone. */
  INTERNAL_KEY?: string
}

/** The listener's fence, handed from the gate to the channel on the upgrade
 * request. Set by this worker only — the DO is reachable only from here. */
const SCOPE_HEADER = "x-listener-scope"

/** The listener's SUBSCRIPTION — the resources its mounted screens actually read.
 *
 * Carried like the fence, and it answers a DIFFERENT question. The fence decides
 * what a listener MAY hear: resolved from their session, never read off the URL,
 * and it fails CLOSED. This decides what it WANTS to hear: declared by the client,
 * and it fails OPEN. A client that lies about its subscription only makes its own
 * screens stale, which is why one of the two is safe to take from a request.
 *
 * WHAT IT BUYS. Every socket used to receive every ping its fence allowed, so a
 * person looking at one screen was woken by every other module in the team. The
 * cost of that is paid inside a single-threaded object, per socket, per ping — the
 * ceiling this whole channel is bounded by. Narrowing it is the other half of the
 * split below: sharding divides the sockets per object, this divides the sends per
 * socket. */
const SUBS_HEADER = "x-listener-subs"

/** WHICH SHARD THIS OBJECT IS, told to it by the door. A Durable Object cannot
 * read its own name, and the shard number is needed to report interest — so it
 * travels the same way the fence and the subscription do: written by this worker
 * on the upgrade, never accepted from a caller. It decides nothing about what a
 * listener may hear; getting it wrong costs a wasted publish, not a disclosure. */
const SHARD_HEADER = "x-listener-shard"

/** Resources one socket may name. A subscription is a list the object walks for
 * every message, so an unbounded one turns the optimisation into the cost. Far
 * above any real screen's needs; a client past it is un-narrowed rather than
 * refused, which is the same fail-open direction as everything else here. */
const MAX_SUBS = 64

/** Read a declared subscription off the upgrade. `null` means "everything" — a
 * missing, empty, malformed or oversized declaration all land there, because
 * over-serving a listener is harmless and under-serving one is a stale screen. */
function readSubs(raw: string | null): string[] | null {
  if (!raw) return null
  const list = [...new Set(raw.split(",").map((r) => r.trim()).filter(Boolean))]
  return list.length && list.length <= MAX_SUBS ? list : null
}

/**
 * HOW LONG ONE AUTHORIZATION MAY STAND — the deadline on a live socket.
 *
 * The gate in `handle()` runs ONCE, at the handshake: signed in, an ACTIVE
 * member of this team, and — for a client login — the fence they stand behind.
 * The answer is serialized onto the socket so that no later ping costs a
 * database read. What nothing ever re-asked was whether the answer was still
 * true.
 *
 * A hibernatable socket outlives the object that accepted it, and a browser tab
 * is patient, so "once" meant FOREVER. A member removed from the team, and a
 * client login whose portal access was revoked, kept hearing that team's change
 * pings — resource, row id and account, in real time — for as long as they left
 * the connection open. Signing out does not end it either: destroySession
 * clears a cookie and a row and touches no socket, and publishSignOut is wired
 * to the email-change flow on the `user:` channel alone.
 *
 * What that leaks is ids, not rows: the payload carries no content, and every
 * door refuses them the moment they try to read one. This codebase has already
 * ruled on whether that is nothing — it is not. `mayHearChange` exists because
 * "row ids are not secret: the live channel broadcasts them"
 * (shared/workers/account-scope.ts), and a fence that is correct at the
 * handshake and unexamined for ever after is the same sentence said about time
 * instead of about accounts.
 *
 * So an authorization EXPIRES, and the expiry is enforced where the decision is
 * spent: `broadcast` closes an over-age socket instead of sending to it. That
 * shape is deliberate on both counts. It needs no alarm and no list of "things
 * that ought to disconnect somebody" — a list is a thing the next module can be
 * missing from, which is the failure this file's own fence was written to
 * avoid. And it runs exactly when it matters: a channel with nothing to say has
 * nothing to leak, and the first ping after the deadline is the one that does
 * not go out.
 *
 * The client does the rest unaided. shared/web/realtime.ts reconnects with
 * backoff and calls `onReconnect`, so the socket comes back re-gated and the
 * screen resyncs whatever it missed — and a caller who is no longer a member
 * simply gets the 403 the API has been giving them all along. Fifteen minutes
 * is chosen against that cost: one extra handshake per listener per quarter of
 * an hour, against a stale-authorization window that used to have no end.
 */
export const LISTENER_MAX_AGE_MS = 15 * 60 * 1000

/** What a socket carries across hibernation: the fence resolved at the
 * handshake (`null` = staff, who hear the whole team) and WHEN it was resolved.
 * Every socket carries both halves, staff included — the issue time is what
 * makes the decision expire, so a socket without one is a socket with no
 * deadline, which is the hole above. */
type Listener = { scope: ScopeStamp; at: number; subs?: string[]; team?: string; shard?: number }

/** One team's live channel: holds its members' sockets, relays change pings. */
export class TeamChannel extends DurableObject<Env> {
  /** A browser joins. Accept the socket via the Hibernation API so the runtime
   *  keeps it (even after this object sleeps) and we don't pay while idle.
   *  The listener's FENCE (if any) and the moment it was resolved are serialized
   *  onto the socket, so both survive hibernation and every later broadcast can
   *  honour them without a DB read. */
  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)
    const stamp = request.headers.get(SCOPE_HEADER)
    let scope: ScopeStamp = null
    if (stamp) {
      try {
        scope = JSON.parse(stamp) as ScopeStamp
      } catch {
        // Unreadable stamp = we can't prove what they may hear. Attach the empty
        // fence rather than none: none means STAFF, and a wrong guess that way
        // would broadcast the agency's world to a client login.
        scope = { accountIds: [] }
      }
    }
    // `subs` is OMITTED rather than set to null when there is none, so a socket
    // from before subscriptions existed and a socket that declared nothing are the
    // same object — one absent key, one meaning: send me everything.
    const subs = readSubs(request.headers.get(SUBS_HEADER))
    const shardStamp = request.headers.get(SHARD_HEADER)
    const cut = shardStamp ? shardStamp.lastIndexOf(":") : -1
    server.serializeAttachment({
      scope,
      at: Date.now(),
      ...(subs ? { subs } : {}),
      // Kept on the socket so a close AFTER hibernation can still name the
      // registry to report to — the object has no memory of its own name.
      ...(cut > 0 ? { team: shardStamp!.slice(0, cut), shard: Number(shardStamp!.slice(cut + 1)) } : {}),
    } satisfies Listener)
    // TELL THE REGISTRY BEFORE ANSWERING, not after. The socket is live the
    // instant this response returns, so a report that happened later would leave
    // a window where a publish could skip a shard that already holds a listener
    // — the one failure direction that costs a stale screen. Awaited for the
    // same reason. A failure here is swallowed: the registry falls back to
    // "interested" for a shard it has not heard from, so the cost of not
    // reporting is a wasted call, never a missed ping.
    await this.reportInterest(request)
    return new Response(null, { status: 101, webSocket: client })
  }

  /** Fan a tiny message out to everyone on this channel who may hear it. A ping
   * carries a ROW ID — and, for a resource a client login is meant to hear, the
   * ACCOUNT that row belongs to — so "may hear" is the account fence, not just
   * membership. See mayHearChange (shared/workers/account-scope.ts).
   *
   * And "may hear" is also a question about TIME: an authorization has a
   * deadline (LISTENER_MAX_AGE_MS), and this is where it is spent. */
  broadcast(message: string): void {
    let event: { resource?: string; id?: string; scope?: string } | null = null
    try {
      event = JSON.parse(message) as { resource?: string; id?: string; scope?: string }
    } catch {
      // Unparsable event: staff still get it (this worker wrote it), fenced
      // listeners don't — a ping nobody can check is a ping nobody fenced.
    }
    const now = Date.now()
    for (const ws of this.ctx.getWebSockets()) {
      try {
        const listener = ws.deserializeAttachment() as Listener | null
        // THE DEADLINE, CHECKED BEFORE THE FENCE. Out of time — or carrying no
        // issue time at all, which is a socket from before this rule and gets
        // the same answer — means close, never send: the client reconnects
        // through the gate and comes back with a fence somebody has just
        // re-proved. Fail-closed in the same direction as everything else here.
        if (!listener || typeof listener.at !== "number" || now - listener.at > LISTENER_MAX_AGE_MS) {
          ws.close(1000, "reauthorize")
          continue
        }
        // THE SUBSCRIPTION, BEFORE THE FENCE, and the order is not arbitrary: this
        // filter can only ever REMOVE a send and is wrong at worst by being
        // generous, so it is cheap to run first and costs nothing if it is skipped.
        // The fence below is the one that has to be right.
        if (listener.subs && event?.resource && !listener.subs.includes(event.resource)) continue
        if (listener.scope && !(event && mayHearChange(listener.scope, event))) continue
        ws.send(message)
      } catch {
        // Dead socket — the runtime drops it on close; nothing to do here.
      }
    }
  }

  /** WHAT THIS SHARD CURRENTLY CARES ABOUT, computed from its live sockets.
   *
   * Recomputed from `getWebSockets()` rather than accumulated, so it is
   * self-healing: a socket that closed, hibernated, or was dropped by the
   * runtime simply is not in the answer, and no bookkeeping can drift from the
   * truth. A socket with no `subs` (the pre-subscription client) sets `all`,
   * which is the fail-open half — one such listener and this shard is interested
   * in everything, exactly as it is today. */
  /** Report this shard's interest to the team's registry.
   *
   * The TEAM ID comes off the upgrade request on join, and off any live socket
   * afterwards — a shard's own name is not readable from inside the object, and
   * inventing a way to pass it would be a second place for it to be wrong. On
   * close with no sockets left there is nothing to address and nothing to say:
   * the entry ages out on its own (INTEREST_STALE_MS), which is the same
   * fail-open answer as never having reported. */
  private async reportInterest(request?: Request): Promise<void> {
    try {
      let teamId: string | null = null
      let shard: number | null = null
      const stamp = request?.headers.get(SHARD_HEADER)
      if (stamp) {
        const cut = stamp.lastIndexOf(":")
        teamId = stamp.slice(0, cut)
        shard = Number(stamp.slice(cut + 1))
      }
      // On CLOSE there is no request, and after hibernation there is no memory —
      // so the answer is read back off a surviving socket, which carried it.
      if (teamId === null || shard === null || !Number.isInteger(shard)) {
        for (const ws of this.ctx.getWebSockets()) {
          const l = ws.deserializeAttachment() as Listener | null
          if (l?.team && typeof l.shard === "number") {
            teamId = l.team
            shard = l.shard
            break
          }
        }
      }
      if (!teamId || shard === null || !Number.isInteger(shard)) return
      await this.env.INTEREST.getByName(teamInterestName(teamId)).report(shard, this.currentInterest())
    } catch (e) {
      // An unreported shard is a shard the registry treats as interested, so
      // this failing costs a wasted object call and nothing else.
      console.error("realtime: interest report failed (shard will be treated as interested):", e)
    }
  }

  currentInterest(): ShardInterest {
    const resources = new Set<string>()
    let all = false
    for (const ws of this.ctx.getWebSockets()) {
      try {
        const l = ws.deserializeAttachment() as Listener | null
        if (!l?.subs) {
          all = true
          continue
        }
        for (const r of l.subs) resources.add(r)
      } catch {
        // Unreadable attachment: assume it wants everything. Same direction as
        // every other unknown here — a wasted send, never a missed one.
        all = true
      }
    }
    return { resources: [...resources], all, at: Date.now() }
  }

  // Clients only listen; inbound messages are ignored. These handlers keep the
  // object hibernation-eligible and tidy up on disconnect.
  async webSocketMessage(): Promise<void> {}
  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close()
    } catch {
      // already closing
    }
    // The socket is gone, so this shard may no longer care about what it wanted.
    // Recomputed from the survivors, so shrinking needs no bookkeeping.
    await this.reportInterest()
  }
  async webSocketError(): Promise<void> {}
}

/** ONE TEAM'S INTEREST REGISTRY — which shards hold a listener for which
 * resource, so a publish can skip the shards where nobody is listening.
 *
 * It stores only shard indexes and resource NAMES. No row ids, no account ids,
 * no session data: nothing here is a thing anybody may or may not see, which is
 * why it needs no fence of its own. The fence stays on the socket, in the shard,
 * where it always was — this object narrows WHERE a ping is sent, never WHO may
 * hear one. A wrong answer here costs a wasted object call or a stale screen,
 * never a disclosure.
 *
 * See INTEREST_STALE_MS in the shared seam for why every unknown answers yes. */
export class TeamInterest extends DurableObject<Env> {
  /** A shard reports what it is holding. Called on join and on close. */
  report(shard: number, interest: ShardInterest): void {
    this.ctx.storage.kv.put(`s${shard}`, interest)
  }

  /** Which shards should receive a ping for this resource.
   *
   * FAIL OPEN, three ways, and each is a real case: a shard that has never
   * reported (its first listener is mid-handshake), a report older than a
   * listener's own deadline (LISTENER_MAX_AGE_MS — past it every socket has
   * reconnected and re-reported anyway, so a stale entry describes nobody), and
   * a shard holding a listener that declared no subscription at all. */
  shardsFor(resource: string | null): number[] {
    const now = Date.now()
    const out: number[] = []
    for (let shard = 0; shard < REALTIME_SHARDS; shard++) {
      const entry = this.ctx.storage.kv.get(`s${shard}`) as ShardInterest | undefined
      if (
        !entry ||
        typeof entry.at !== "number" ||
        now - entry.at > INTEREST_STALE_MS ||
        entry.all ||
        !resource ||
        entry.resources.includes(resource)
      ) {
        out.push(shard)
      }
    }
    return out
  }
}

/** The upgrade request, carrying the listener's fence to the channel. Staff
 * (`null`) carry no header at all, so the DO attaches nothing and they hear the
 * whole team — the shape it has always had, byte for byte.
 *
 * A header the CALLER sent is never allowed to survive: the fence is resolved
 * here from their session, so an inbound `x-listener-scope` is either overwritten
 * or deleted. (It could only ever narrow what its sender hears, but a security
 * header that a request can carry is a habit worth not forming.) */
function stamped(
  request: Request,
  stamp: ScopeStamp,
  subs: string | null,
  teamId?: string,
  shard?: number
): Request {
  const headers = new Headers(request.headers)
  // Same hygiene as the two below: written here, and an inbound one dies.
  if (teamId && shard !== undefined) headers.set(SHARD_HEADER, `${teamId}:${shard}`)
  else headers.delete(SHARD_HEADER)
  if (stamp) headers.set(SCOPE_HEADER, JSON.stringify(stamp))
  else headers.delete(SCOPE_HEADER)
  // THE SUBSCRIPTION IS COPIED FROM THE QUERY STRING, NOT TRUSTED FROM A HEADER.
  // Same hygiene as the fence for a different reason: the fence must not be
  // caller-settable because it decides what may be SEEN, and this must not be
  // caller-settable *as a header* because a request that can set an internal
  // header is a shape worth never allowing — even where the value is harmless.
  // So the door reads `?sub=` and writes the header itself; an inbound one dies.
  if (subs) headers.set(SUBS_HEADER, subs)
  else headers.delete(SUBS_HEADER)
  return new Request(request, { headers })
}

/** Ask the auth worker (one session system, one master) who this is. */
async function whoAmI(request: Request, env: Env): Promise<SessionUser | null> {
  // The same shape as the shared seam's whoAmI, and for the same reasons: a
  // ceiling on the hop, and an auth OUTAGE told apart from a signed-out caller.
  // Returning null on an outage would refuse the socket with "Not signed in.",
  // which sends a signed-in person to the login screen because a different
  // worker was ill. AUTH_UNAVAILABLE_MS / the 503 both live in gating.ts.
  let res: Response
  try {
    res = await env.AUTH.fetch("https://auth/api/auth/me", {
      headers: { Cookie: request.headers.get("Cookie") ?? "", ...traceHeaders(requestId(request)) },
      signal: AbortSignal.timeout(AUTH_UNAVAILABLE_MS),
      // (one constant, one meaning — imported from the gating seam)
    })
  } catch {
    throw new GuardError(
      503,
      "auth_unavailable",
      "We can't check who you are right now. Try again in a moment."
    )
  }
  if (!res.ok) return null
  return ((await res.json()) as { user: SessionUser }).user
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, env)
    } catch (e) {
      // A REFUSAL IS NOT A CRASH, and it is mapped FIRST — the lesson auth paid
      // for: adding boundary validation to a worker whose catch had no
      // GuardError branch turns every intended 400 into exactly the 500 the
      // validation existed to prevent, and records a row for each one.
      if (e instanceof GuardError) return fail(e.status, e.code, e.message)
      // Never a bare 1101. Realtime binds the core database, so a crash here is
      // recorded like every other worker's (ERROR-HANDLING.md) instead of
      // vanishing into Cloudflare's exception counter.
      await recordWorkerError(
        env.DB,
        "realtime",
        new URL(request.url).pathname,
        e,
        requestId(request)
      ).catch(() => null)
      return fail(500, "server_error", "Something went wrong.")
    }
  },
} satisfies ExportedHandler<Env>

async function handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Internal only (reached via service binding, never the public gateway):
    // a worker tells a team's channel something changed.
    if (url.pathname === "/publish" && request.method === "POST") {
      // Keyed like every other internal door, and FAIL-CLOSED: no secret set
      // means no broadcasting, never "wave them through". This door can reach
      // ANY team's channel, so network isolation alone (workers_dev:false plus
      // the gateway never routing /publish) was one config regression away from
      // an unauthenticated cross-tenant broadcast. The header is checked before
      // the body is read.
      if (!env.INTERNAL_KEY || request.headers.get("x-internal-key") !== env.INTERNAL_KEY)
        return fail(403, "forbidden", "Bad internal key.")
      // Read as ONE object, never destructured (R20): a destructured body
      // scatters untrusted values into bare locals no scan — and no reader —
      // can follow back to the boundary they crossed.
      const body = (await request.json().catch(() => ({}))) as {
        channel?: unknown
        event?: unknown
      }
      // The channel NAMES a Durable Object, so an unbounded string here is an
      // unbounded object name; the key-holder is trusted to be a worker, not to
      // be well-formed.
      const channel = requireText(body.channel, "Channel", TEXT_LIMITS.short)
      if (body.event === undefined)
        return fail(400, "invalid_input", "channel and event are required.")
      // THE FAN-OUT LIVES HERE, and that is the whole reason a team's channel could
      // be split at all. A publisher names `team:<id>` — one call, exactly as it
      // always did — and this door spreads it over the shards. Written at the
      // publisher instead, it would have been a hundred call sites and a hundred
      // chances to write it differently; written here it is one loop that every
      // publisher inherits.
      //
      // A `user:` channel is NOT split: it holds one person's devices, which is a
      // handful, and splitting it would multiply the publish cost of the most
      // frequent ping in the product to buy headroom nobody needs.
      const payload = JSON.stringify(body.event)
      const teamId = channel.startsWith("team:") ? channel.slice("team:".length) : null
      if (teamId && !teamId.includes("#")) {
        // WHICH SHARDS ACTUALLY CARE. The registry narrows the fan-out to the
        // shards holding a listener for this resource; every unknown answers
        // "interested", so the worst case is exactly today's behaviour plus one
        // read. An unreachable registry is one of those unknowns — a live layer
        // that stops delivering because a bookkeeping object is unwell is a
        // worse failure than a wasted call, by a distance.
        let shards: number[] = Array.from({ length: REALTIME_SHARDS }, (_, i) => i)
        try {
          const resource =
            typeof (body.event as { resource?: unknown })?.resource === "string"
              ? (body.event as { resource: string }).resource
              : null
          const answer = await env.INTEREST.getByName(teamInterestName(teamId)).shardsFor(resource)
          // A malformed answer is an unknown too: only a non-empty array of real
          // shard indexes narrows anything. An EMPTY array is meaningful and
          // kept — it means nobody is listening for this, which is the whole
          // point — but it must be a genuine array to be believed.
          if (Array.isArray(answer) && answer.every((n) => Number.isInteger(n) && n >= 0 && n < REALTIME_SHARDS))
            shards = answer
        } catch (e) {
          console.error("realtime: interest registry unreachable, fanning out to every shard:", e)
        }
        // Concurrently, and settled rather than raced: one slow shard must not
        // hold the write that triggered this, and one dead shard must not cost the
        // other three their ping. The publish is best-effort by contract
        // (shared/workers/realtime.ts), so a rejection here is logged, not thrown.
        const results = await Promise.allSettled(
          // `async` on the arrow, deliberately: `allSettled` only settles what is
          // already a promise, so a SYNCHRONOUS throw — from `getByName`, or from a
          // stub that does not return one — escapes the whole thing and 500s a
          // best-effort publish. An async arrow turns any throw into a rejection,
          // which is the only shape this loop is allowed to see.
          shards.map(async (shard) =>
            env.CHANNELS.getByName(teamShardName(teamId, shard)).broadcast(payload)
          )
        )
        const failed = results.filter((r) => r.status === "rejected").length
        if (failed)
          console.error(
            `realtime: ${failed}/${shards.length} shard(s) of team:${teamId} did not receive a ping`
          )
      } else {
        // A `user:` channel, or a shard named explicitly (tests, and a future
        // caller that wants one shard). Named channels are passed through
        // untouched — the door does not second-guess a caller who was specific.
        await env.CHANNELS.getByName(channel).broadcast(payload)
      }
      return json({ ok: true })
    }

    // What this worker cannot work without, answered by NAME (config-health.ts).
    if (url.pathname === "/api/realtime/health")
      // THE BINDING NAMES, NOT THE CLASS NAMES. `TEAM_CHANNEL` was named here on
      // 5 Sep 2026 and does not exist: the wrangler config binds the Durable Objects
      // as CHANNELS and INTEREST, whose CLASS names are TeamChannel and TeamInterest.
      // So this door answered {"ok":false,"missing":["TEAM_CHANNEL"]} on a worker with
      // nothing wrong with it — and the staging smoke, which asserts `ok === true`,
      // failed the whole deploy on it. A health check that reports a healthy worker as
      // broken costs exactly what a missed outage costs, in the other direction: the
      // next person to see it red learns to ignore it.
      return json(healthBody("realtime", env, ["DB", "AUTH", "CHANNELS", "INTEREST", "INTERNAL_KEY"]))

    // Public: a browser joins a live channel (WebSocket only). Two scopes:
    //   ?user=<id>  — your OWN identity channel (account events + sign-out),
    //                 open for every signed-in user, even before joining a team.
    //   ?team=<id>  — a team's channel, gated by active membership of THAT team.
    if (url.pathname === "/api/realtime") {
      if (request.headers.get("Upgrade") !== "websocket")
        return fail(426, "upgrade_required", "This endpoint is WebSocket-only.")

      // Signed-in gate first (same session system as the API — one master).
      const user = await whoAmI(request, env)
      if (!user) return fail(401, "signed_out", "Not signed in.")

      // R20's QUERY half. These two were the only request inputs in the whole
      // worker fleet read raw, and both name something: `?user=` picks a Durable
      // Object, `?team=` is bound into a membership read and then picks one too.
      // Neither is exploitable as written — the first is compared to the
      // session's own id before it is used, and the second reaches getByName
      // only after requireMember has proved it is a real team this caller
      // belongs to — but that is a fact about today's two lines, not a property
      // of the door. `/publish`, sixty lines above, caps its channel name for
      // exactly this reason, in exactly these words: an unbounded string here is
      // an unbounded object name. The seam is what keeps the next edit honest.
      const userId = queryText(url.searchParams.get("user"), "User", TEXT_LIMITS.short)
      if (userId) {
        // Identity channel: you may only join your OWN.
        if (userId !== user.id)
          return fail(403, "forbidden", "That isn't your channel.")
        // AND IT GOES THROUGH `stamped` LIKE THE OTHER BRANCH, which is the whole
        // fix here: this line used to hand the DO the caller's RAW request.
        //
        // `stamped`'s own header says "a header the CALLER sent is never allowed to
        // survive", and it was true of the team branch and of nothing else. An
        // identity channel needs no fence, no shard and no subscription — the
        // object name IS the fence, and the line above proves the caller owns it —
        // so all three arguments are null and `stamped` DELETES all three headers.
        //
        // What it cost while it was missing: `x-listener-shard` is parsed inside
        // the DO into `{team, shard}` and used to address another team's interest
        // registry, so any signed-in person could open their OWN identity channel
        // with `x-listener-shard: <someone else's team>:0` and write into it —
        // no membership of that team involved anywhere. The registry decides which
        // shards a ping is sent to, so the result is a team's live layer going
        // quiet. Not a read of anything private; a write into somebody else's.
        //
        // It stayed green because nothing exercised this branch at all: the suite
        // beside this file covered `?team=` and the DO, never `?user=`. That is the
        // second half of the fix — see realtime/test/identity-channel.test.ts.
        return env.CHANNELS.getByName(`user:${userId}`).fetch(stamped(request, null, null))
      }

      const teamId = queryText(url.searchParams.get("team"), "Team", TEXT_LIMITS.short)
      if (teamId) {
        // Team channel: must be an active member of THIS team — the same
        // team_members + teams join the API gates on (requireMember), which also
        // hands back the team's database so the next line can resolve the fence.
        //
        // MEMBERSHIP IS NOT THE WHOLE GATE. A client-portal login IS a member of
        // the agency's team (that is how they reach any door at all), so
        // membership alone put them on a channel that names, by row id, every
        // account in the agency as it changes. Ids are the currency of the leak
        // this base already fixed once. So the caller's fence rides the socket.
        //
        // THE FENCE IS RESOLVED HERE, EVERY TIME, FROM THE SESSION. The client
        // also puts where it thinks it is standing in the query string (`?fence=`
        // — see shared/web/realtime.ts), and this worker deliberately never reads
        // it: it exists so that a client whose fence MOVES opens a new socket
        // instead of keeping one stamped with the world they have left. It is a
        // cache key on their side, and nothing at all on ours. Reading it would
        // turn a URL a client controls into the fence that decides what they may
        // hear, which is precisely the shape this stamp exists to refuse.
        let stamp: ScopeStamp
        try {
          const guard = await requireMember(env, user.id, teamId)
          stamp = scopeStamp(await accountScope(d1ConfigFrom(env), guard))
        } catch (e) {
          if (e instanceof GuardError) return fail(e.status, e.code, e.message)
          // FAIL CLOSED, and note which way: with no answer we cannot tell a
          // client login from staff, so nobody joins the TEAM channel until we
          // can. The user channel above is unaffected, so identity events and a
          // forced sign-out still reach every device; team screens fall back to
          // cache-first reads and the client retries with backoff.
          // Recorded, not just logged. A console line expires in a week, and
          // this is the refusal of a fail-closed gate on a token that HAS
          // failed in production before (the bootstrap D1 auth error). Learning
          // about it from a log tail is learning about it too late.
          console.error("realtime fence lookup failed:", e)
          await recordWorkerError(env.DB, "realtime", "GET /?team= (fence lookup)", e)
          return fail(503, "live_unavailable", "The live connection isn't available right now.")
        }
        // WHICH SHARD THEY JOIN — from their USER id, so all of one person's
        // devices land on the same object and a reconnect returns to it. Not from
        // the socket, not random: a listener who moved shard on every reconnect
        // would spread one person over four objects for no benefit, and every
        // shard would hold a slice of everybody.
        //
        // It is not a security decision and nothing here needs it to be: the
        // shards are identical, and what a listener may hear rides the socket as
        // the fence rather than being a property of which object holds it. A
        // caller who forced themselves onto another shard would be handed exactly
        // the same fence and exactly the same pings.
        const shardIndex = shardFor(user.id)
        const shard = teamShardName(teamId, shardIndex)
        return env.CHANNELS.getByName(shard).fetch(
          stamped(request, stamp, queryText(url.searchParams.get("sub"), "Subscription") ?? null, teamId, shardIndex)
        )
      }

      return fail(400, "invalid_input", "team or user is required.")
    }

    return fail(404, "not_found", "No such realtime action.")
}
