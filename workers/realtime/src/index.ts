// kwapso REALTIME worker — the live "switchboard".
//
// ONE Durable Object per team (TeamChannel, addressed by name "team:<id>") holds
// that team's open WebSocket connections and fans out tiny "X changed" pings.
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
import { accountScope, mayHearChange, scopeStamp, type ScopeStamp } from "@shared/workers/account-scope"
import { d1ConfigFrom, GuardError, requireMember } from "@shared/workers/gating"
import { fail, json } from "@shared/workers/http"
import { recordWorkerError } from "@shared/workers/error-log"
import { requireText, TEXT_LIMITS } from "@shared/workers/validate"

export type Env = {
  /** The per-team live channels (one Durable Object instance per team). */
  CHANNELS: DurableObjectNamespace<TeamChannel>
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

/** One team's live channel: holds its members' sockets, relays change pings. */
export class TeamChannel extends DurableObject<Env> {
  /** A browser joins. Accept the socket via the Hibernation API so the runtime
   *  keeps it (even after this object sleeps) and we don't pay while idle.
   *  The listener's FENCE (if any) is serialized onto the socket, so it survives
   *  hibernation and every later broadcast can honour it without a DB read. */
  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)
    const stamp = request.headers.get(SCOPE_HEADER)
    if (stamp) {
      try {
        server.serializeAttachment(JSON.parse(stamp) as ScopeStamp)
      } catch {
        // Unreadable stamp = we can't prove what they may hear. Attach the empty
        // fence rather than none: none means STAFF, and a wrong guess that way
        // would broadcast the agency's world to a client login.
        server.serializeAttachment({ accountIds: [] })
      }
    }
    return new Response(null, { status: 101, webSocket: client })
  }

  /** Fan a tiny message out to everyone on this channel who may hear it. A ping
   * carries a ROW ID — and, for a resource a client login is meant to hear, the
   * ACCOUNT that row belongs to — so "may hear" is the account fence, not just
   * membership. See mayHearChange (shared/workers/account-scope.ts). */
  broadcast(message: string): void {
    let event: { resource?: string; id?: string; scope?: string } | null = null
    try {
      event = JSON.parse(message) as { resource?: string; id?: string; scope?: string }
    } catch {
      // Unparsable event: staff still get it (this worker wrote it), fenced
      // listeners don't — a ping nobody can check is a ping nobody fenced.
    }
    for (const ws of this.ctx.getWebSockets()) {
      try {
        const stamp = ws.deserializeAttachment() as ScopeStamp
        if (stamp && !(event && mayHearChange(stamp, event))) continue
        ws.send(message)
      } catch {
        // Dead socket — the runtime drops it on close; nothing to do here.
      }
    }
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
  }
  async webSocketError(): Promise<void> {}
}

/** The upgrade request, carrying the listener's fence to the channel. Staff
 * (`null`) carry no header at all, so the DO attaches nothing and they hear the
 * whole team — the shape it has always had, byte for byte.
 *
 * A header the CALLER sent is never allowed to survive: the fence is resolved
 * here from their session, so an inbound `x-listener-scope` is either overwritten
 * or deleted. (It could only ever narrow what its sender hears, but a security
 * header that a request can carry is a habit worth not forming.) */
function stamped(request: Request, stamp: ScopeStamp): Request {
  if (!stamp && !request.headers.has(SCOPE_HEADER)) return request
  const headers = new Headers(request.headers)
  if (stamp) headers.set(SCOPE_HEADER, JSON.stringify(stamp))
  else headers.delete(SCOPE_HEADER)
  return new Request(request, { headers })
}

/** Ask the auth worker (one session system, one master) who this is. */
async function whoAmI(request: Request, env: Env): Promise<SessionUser | null> {
  const res = await env.AUTH.fetch("https://auth/api/auth/me", {
    headers: { Cookie: request.headers.get("Cookie") ?? "" },
  })
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
      await recordWorkerError(env.DB, "realtime", new URL(request.url).pathname, e).catch(() => null)
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
      await env.CHANNELS.getByName(channel).broadcast(JSON.stringify(body.event))
      return json({ ok: true })
    }

    if (url.pathname === "/api/realtime/health") return json({ ok: true })

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

      const userId = url.searchParams.get("user")
      if (userId) {
        // Identity channel: you may only join your OWN.
        if (userId !== user.id)
          return fail(403, "forbidden", "That isn't your channel.")
        return env.CHANNELS.getByName(`user:${userId}`).fetch(request)
      }

      const teamId = url.searchParams.get("team")
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
        return env.CHANNELS.getByName(`team:${teamId}`).fetch(stamped(request, stamp))
      }

      return fail(400, "invalid_input", "team or user is required.")
    }

    return fail(404, "not_found", "No such realtime action.")
}
