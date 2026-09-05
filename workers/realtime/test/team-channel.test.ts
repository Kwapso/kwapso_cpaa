// THE REALTIME WORKER, RUN — not read.
//
// TeamChannel is the base's only Durable Object and its subtlest piece: one
// instance per channel, holding N hibernatable sockets, fanning a ping out to
// every one of them that may hear it. Everything about it happens BETWEEN
// listeners — a fence that belongs to one socket and not its neighbour, a socket
// that closed after getWebSockets() returned it, an event nobody can parse — and
// none of that is visible to a source scan. realtime.test.ts checks the WIRING
// with regexes (the gate is called, the stamp is attached); this file checks the
// BEHAVIOUR, by constructing the class against a DurableObjectState the test
// controls (vitest.config.ts aliases `cloudflare:workers` to a two-line shim).
//
// What is being defended, in one sentence: a broadcast must reach everyone
// entitled to it, reach nobody else, and never be stopped by one bad socket.
// CONCURRENCY.md is explicit that this DO is pub/sub and NOT a lock — so the
// invariant is not serialization, it is that the fan-out is per-socket and
// total.

import { describe, expect, it, vi } from "vitest"

import type { ScopeStamp } from "@shared/workers/account-scope"
import { REALTIME_SHARD_WATCH_SOCKETS, REALTIME_SHARDS, teamShardName } from "@shared/workers/realtime"
import { TEXT_LIMITS } from "@shared/workers/validate"
import worker, { LISTENER_MAX_AGE_MS, TeamChannel } from "../src/index"

/** One hibernatable socket, as the runtime hands it back from getWebSockets(). */
type FakeSocket = {
  sent: string[]
  closed: number
  attachment: unknown
  send(message: string): void
  close(): void
  serializeAttachment(value: unknown): void
  deserializeAttachment(): unknown
}

/** A socket. `breaks` makes it behave like one that died between the runtime
 * listing it and us writing to it — the ordinary race on a busy channel. */
function socket(options: { breaks?: "send" | "read" | "close" } = {}): FakeSocket {
  const ws: FakeSocket = {
    sent: [],
    closed: 0,
    attachment: undefined,
    send(message) {
      if (options.breaks === "send") throw new Error("socket is closed")
      ws.sent.push(message)
    },
    close() {
      if (options.breaks === "close") throw new Error("already closing")
      ws.closed++
    },
    serializeAttachment(value) {
      ws.attachment = value
    },
    deserializeAttachment() {
      if (options.breaks === "read") throw new Error("attachment unreadable")
      return ws.attachment
    },
  }
  return ws
}

/** A socket as `fetch()` leaves it: a fence (null = staff) and the moment the
 * gate resolved it. `ageMs` ages the authorization — that is the whole subject
 * of the deadline suite at the bottom of this file. Every fixture below goes
 * through here, because a socket with no issue time is not a state the DO can
 * hand out any more: it is the pre-deadline shape, and it is closed on sight. */
function listener(scope: ScopeStamp = null, ageMs = 0): FakeSocket {
  const ws = socket()
  ws.serializeAttachment({ scope, at: Date.now() - ageMs })
  return ws
}

/** A socket that has DECLARED a subscription — the resources its screens read.
 * Separate from `listener()` because the two answer different questions and the
 * suite below has to be able to say which one it is testing. */
function subscriber(subs: string[] | undefined, scope: ScopeStamp = null): FakeSocket {
  const ws = socket()
  ws.serializeAttachment({ scope, at: Date.now(), ...(subs ? { subs } : {}) })
  return ws
}

/** The FENCE a socket is carrying, without the issue time beside it — so the
 * assertions below say the same thing they always said about the stamp. */
function fenceOf(attachment: unknown): unknown {
  return (attachment as { scope?: unknown } | undefined)?.scope
}

/** A channel holding the given sockets, plus whatever fetch() accepts later. */
function channel(sockets: FakeSocket[] = []) {
  const accepted: FakeSocket[] = []
  const ctx = {
    acceptWebSocket: (ws: FakeSocket) => {
      accepted.push(ws)
      sockets.push(ws)
    },
    getWebSockets: () => sockets,
  }
  return {
    accepted,
    channel: new TeamChannel(ctx as never, {} as never),
  }
}

/** A client login standing in Bergman — the same fixture realtime.test.ts uses. */
const CLIENT: ScopeStamp = { accountIds: ["BERGMAN", "BERGMAN_SUB"] }

describe("broadcast: the fan-out is per socket, and total", () => {
  it("reaches every listener on the channel", () => {
    const a = listener()
    const b = listener()
    const c = listener()
    const { channel: ch } = channel([a, b, c])

    ch.broadcast(JSON.stringify({ resource: "members", id: "M1" }))

    for (const ws of [a, b, c]) expect(ws.sent).toHaveLength(1)
  })

  it("applies each socket's OWN fence — one call, different subsets", () => {
    // The whole reason the stamp rides the socket instead of the channel: one
    // team channel carries staff and client logins at the same time.
    const staff = listener()
    const bergman = listener(CLIENT)
    const delaval = listener({ accountIds: ["DELAVAL"] })
    const { channel: ch } = channel([staff, bergman, delaval])

    ch.broadcast(JSON.stringify({ resource: "accounts", id: "BERGMAN_SUB" }))

    expect(staff.sent, "staff carry no stamp and hear the whole team").toHaveLength(1)
    expect(bergman.sent, "the row is inside their fence").toHaveLength(1)
    expect(delaval.sent, "another client's row id is silence").toHaveLength(0)
  })

  it("a socket that died mid-broadcast does not silence the ones after it", () => {
    // THE RACE. getWebSockets() returns a snapshot; a browser can close between
    // that line and the send. If the loop let the throw escape, one closing tab
    // would stop the ping for every listener listed after it — a whole team's
    // screens quietly stale, with nothing in any log.
    const before = listener()
    const dead = socket({ breaks: "send" })
    dead.serializeAttachment({ scope: null, at: Date.now() })
    const after = listener()
    const { channel: ch } = channel([before, dead, after])

    ch.broadcast(JSON.stringify({ resource: "members", id: "M1" }))

    expect(before.sent).toHaveLength(1)
    expect(dead.sent).toHaveLength(0)
    expect(after.sent, "the listener AFTER the dead one still gets the ping").toHaveLength(1)
  })

  it("a socket whose fence cannot be read is skipped, not trusted", () => {
    // Fail-closed, and it must not take the broadcast down with it.
    const broken = socket({ breaks: "read" })
    const fine = listener()
    const { channel: ch } = channel([broken, fine])

    ch.broadcast(JSON.stringify({ resource: "accounts", id: "BERGMAN" }))

    expect(broken.sent, "no stamp we can read = nothing we can prove they may hear").toHaveLength(0)
    expect(fine.sent).toHaveLength(1)
  })

  it("an unparsable event reaches staff and no fenced listener", () => {
    // The comment in the source says exactly this, and it is the fail-closed
    // direction: a ping nobody can check is a ping nobody fenced.
    const staff = listener()
    const client = listener(CLIENT)
    const { channel: ch } = channel([staff, client])

    ch.broadcast("not json at all")

    expect(staff.sent).toEqual(["not json at all"])
    expect(client.sent).toHaveLength(0)
  })

  it("sends the message through untouched — the DO stores and rewrites nothing", () => {
    // It holds NO application data (ARCHITECTURE.md); the databases stay the
    // source of truth. The relay must not become a place state can hide.
    const ws = listener()
    const { channel: ch } = channel([ws])
    const message = JSON.stringify({ resource: "help", id: "H1", scope: "BERGMAN" })

    ch.broadcast(message)

    expect(ws.sent[0]).toBe(message)
  })

  it("an empty channel is not an error", () => {
    const { channel: ch } = channel([])
    expect(() => ch.broadcast(JSON.stringify({ resource: "members" }))).not.toThrow()
  })
})

describe("fetch: joining the channel stamps the socket", () => {
  /** The Workers globals this method needs. `Response` is stubbed because a 101
   * is illegal in Node's Response and legal in the runtime — the one place the
   * two genuinely disagree. */
  // ASYNC-AWARE ON PURPOSE. `fetch` is an async method, so `run()` hands back a
  // promise — and unstubbing in a synchronous `finally` tore the globals down
  // before the method reached `new Response(101)`. It only ever passed because
  // nothing was awaited BEFORE that line; the first real await (reporting shard
  // interest, which must happen before the socket goes live) turned a latent
  // harness bug into five red tests. Awaiting the result is what the harness
  // always meant.
  async function withWorkerGlobals<T>(run: () => T | Promise<T>): Promise<T> {
    const pair = { 0: socket(), 1: socket() }
    vi.stubGlobal(
      "WebSocketPair",
      class {
        constructor() {
          return pair
        }
      }
    )
    vi.stubGlobal(
      "Response",
      class {
        constructor(
          readonly body: unknown,
          readonly init: { status?: number; webSocket?: unknown } = {}
        ) {}
      }
    )
    try {
      return await run()
    } finally {
      vi.unstubAllGlobals()
    }
  }

  it("accepts through the HIBERNATION api, so an idle channel costs nothing", async () => {
    // ctx.acceptWebSocket, never server.accept(). This is the cost model:
    // 10,000 quiet teams stay affordable only because the runtime owns the
    // socket and the instance is evicted.
    const { accepted, channel: ch } = channel([])
    await withWorkerGlobals(() => ch.fetch(new Request("https://do/")))
    expect(accepted, "the server half must be handed to the runtime").toHaveLength(1)
  })

  it("a staff listener is stamped with NO FENCE, and hears the whole team", async () => {
    const { accepted, channel: ch } = channel([])
    await withWorkerGlobals(() => ch.fetch(new Request("https://do/")))

    expect(fenceOf(accepted[0].attachment), "no header = no fence = staff").toBeNull()
    ch.broadcast(JSON.stringify({ resource: "members", id: "M1" }))
    expect(accepted[0].sent).toHaveLength(1)
  })

  it("a client login's fence is serialized onto the socket, so it survives hibernation", async () => {
    const { accepted, channel: ch } = channel([])
    await withWorkerGlobals(() =>
      ch.fetch(
        new Request("https://do/", { headers: { "x-listener-scope": JSON.stringify(CLIENT) } })
      )
    )

    expect(fenceOf(accepted[0].attachment)).toEqual(CLIENT)
    // And it is really in force: a row outside the fence is silence.
    ch.broadcast(JSON.stringify({ resource: "accounts", id: "DELAVAL" }))
    expect(accepted[0].sent).toHaveLength(0)
  })

  it("an UNREADABLE stamp attaches the EMPTY fence, never none", async () => {
    // The inversion this guards is the dangerous one: `none` means STAFF, so a
    // stamp we failed to parse must not be dropped — it must become a fence that
    // hears nothing. Attaching none would broadcast the agency's whole world to
    // a client login.
    const { accepted, channel: ch } = channel([])
    await withWorkerGlobals(() =>
      ch.fetch(new Request("https://do/", { headers: { "x-listener-scope": "{not json" } }))
    )

    expect(fenceOf(accepted[0].attachment)).toEqual({ accountIds: [] })
    ch.broadcast(JSON.stringify({ resource: "accounts", id: "BERGMAN" }))
    expect(accepted[0].sent, "a fence with no accounts hears nothing at all").toHaveLength(0)
  })

  it("EVERY socket is stamped with the moment it was authorized — staff too", async () => {
    // The issue time is what gives the authorization a deadline, so a socket
    // without one is a socket that never expires. Staff are the case worth
    // pinning: they carry no fence, and it would be easy to read "no fence" as
    // "nothing to attach" and hand them the immortal socket back.
    const before = Date.now()
    const { accepted, channel: ch } = channel([])
    await withWorkerGlobals(() => ch.fetch(new Request("https://do/")))

    const at = (accepted[0].attachment as { at?: unknown }).at
    expect(typeof at, "a staff socket carries an issue time").toBe("number")
    expect(at as number).toBeGreaterThanOrEqual(before)
  })
})

// AN AUTHORIZATION HAS A DEADLINE.
//
// The gate runs once, at the handshake. A hibernatable socket outlives the
// object that accepted it, so "once" used to mean for ever: somebody removed
// from the team, or a client login whose portal access was revoked, kept hearing
// that team's pings — resource, row id, account — until they chose to close the
// tab. Signing out did not end it either. No row DATA travels on a ping, but
// this file's own fence exists because row ids are not nothing.
//
// So the broadcast closes an over-age socket instead of sending to it, and the
// client's own reconnect walks back through the gate. These are the tests that
// stop the deadline being quietly widened, dropped, or applied after the fence
// instead of before it.
describe("broadcast: the deadline on a live socket", () => {
  const ping = JSON.stringify({ resource: "members", id: "M1" })

  it("a socket inside its deadline still hears — the rule is a deadline, not a kill switch", () => {
    const fresh = listener(null, LISTENER_MAX_AGE_MS - 1000)
    const { channel: ch } = channel([fresh])

    ch.broadcast(ping)

    expect(fresh.sent, "one second inside the window is inside the window").toHaveLength(1)
    expect(fresh.closed).toBe(0)
  })

  it("a socket past its deadline is CLOSED, and hears nothing on the way out", () => {
    const stale = listener(null, LISTENER_MAX_AGE_MS + 1000)
    const { channel: ch } = channel([stale])

    ch.broadcast(ping)

    expect(stale.sent, "the ping it aged out on must not be the one it receives").toHaveLength(0)
    expect(stale.closed, "closed, so the client reconnects through the gate").toBe(1)
  })

  it("the deadline is checked BEFORE the fence — an expired client login is closed, not merely filtered", () => {
    // Order matters. Filtering first would leave a revoked login holding an open
    // socket for ever, silently, and it would come back to life the moment
    // somebody touched a row that was inside its stale fence.
    const stale = listener(CLIENT, LISTENER_MAX_AGE_MS + 1)
    const { channel: ch } = channel([stale])

    ch.broadcast(JSON.stringify({ resource: "accounts", id: "BERGMAN" }))

    expect(stale.sent).toHaveLength(0)
    expect(stale.closed, "a row inside the OLD fence is still an expired authorization").toBe(1)
  })

  it("a socket carrying no issue time is closed, not trusted", () => {
    // The shape a socket accepted by an older build has — and the shape anything
    // that skipped fetch() has. Fail-closed, in the same direction as an
    // unreadable stamp: we cannot prove when this was authorized, so we don't.
    const old = socket()
    old.serializeAttachment({ accountIds: [] }) // the pre-deadline attachment
    const none = socket() // never stamped at all
    const { channel: ch } = channel([old, none])

    ch.broadcast(ping)

    expect(old.sent).toHaveLength(0)
    expect(old.closed).toBe(1)
    expect(none.sent).toHaveLength(0)
    expect(none.closed).toBe(1)
  })

  it("one expired socket does not stop the ping reaching the live ones after it", () => {
    // The same invariant the dead-socket test defends, said about the new branch:
    // the fan-out is per socket and total, and closing one must not cost the rest.
    const stale = listener(null, LISTENER_MAX_AGE_MS * 2)
    const live = listener()
    const { channel: ch } = channel([stale, live])

    ch.broadcast(ping)

    expect(stale.sent).toHaveLength(0)
    expect(live.sent, "the listener AFTER the expired one still gets the ping").toHaveLength(1)
  })

  it("the window is bounded in minutes, not days — a deadline nobody reaches is not one", () => {
    // A guard on the constant itself. The whole finding was an authorization that
    // stood for ever; widening this to a session's lifetime would restore it
    // while leaving every test above green.
    expect(LISTENER_MAX_AGE_MS).toBeGreaterThanOrEqual(60_000)
    expect(LISTENER_MAX_AGE_MS).toBeLessThanOrEqual(60 * 60 * 1000)
  })
})

// THE DOOR THAT CAN REACH ANY CHANNEL.
//
// /publish is internal — service binding only, never routed by either gateway.
// That is network isolation, and network isolation is a configuration away from
// being wrong, which is why the door is ALSO keyed and fails closed. Nothing
// exercised this: the publisher's side was tested (it sends the key) and the
// door's side was not, so an unset secret waving everyone through would have
// been invisible here.
describe("/publish — the one door that reaches every team's channel", () => {
  function env(overrides: Record<string, unknown> = {}) {
    const broadcasts: { channel: string; message: string }[] = []
    return {
      broadcasts,
      env: {
        INTERNAL_KEY: "shhh",
        CHANNELS: {
          getByName: (channel: string) => ({
            broadcast: (message: string) => broadcasts.push({ channel, message }),
          }),
        },
        ...overrides,
      } as never,
    }
  }

  const post = (body: unknown, key?: string) =>
    new Request("https://realtime/publish", {
      method: "POST",
      headers: key === undefined ? {} : { "x-internal-key": key },
      body: JSON.stringify(body),
    })

  it("FANS a team ping out to every shard — one publisher call, N objects", async () => {
    // THE PUBLISHER'S CONTRACT IS UNCHANGED and that is the point of doing the
    // split here: a hundred-odd `publishChange` call sites still name `team:<id>`,
    // and this door is the one place that knows a team's channel is more than one
    // object. A fan-out written at the publisher would have been a hundred chances
    // to write it differently.
    const { env: e, broadcasts } = env()
    const res = await worker.fetch(post({ channel: "team:T1", event: { resource: "members" } }, "shhh"), e)

    expect(res.status).toBe(200)
    expect(broadcasts.map((b) => b.channel).sort()).toEqual(
      Array.from({ length: REALTIME_SHARDS }, (_, i) => teamShardName("T1", i)).sort()
    )
    for (const b of broadcasts) expect(b.message).toBe(JSON.stringify({ resource: "members" }))
    expect(
      broadcasts.map((b) => b.channel),
      "and never the un-sharded name — a listener is on a shard, so a ping there reaches nobody"
    ).not.toContain("team:T1")
  })

  it("does NOT split a user channel — one person's devices are a handful", async () => {
    // Splitting the most frequent ping in the product to buy headroom nobody needs
    // would multiply its cost for nothing.
    const { env: e, broadcasts } = env()
    await worker.fetch(post({ channel: "user:U1", event: { resource: "profile" } }, "shhh"), e)
    expect(broadcasts).toEqual([
      { channel: "user:U1", message: JSON.stringify({ resource: "profile" }) },
    ])
  })

  it("passes an explicitly-named shard straight through", async () => {
    // A caller who was specific is not second-guessed — the door only expands a
    // BARE team name. This is what keeps a one-shard broadcast reachable for tests
    // and for any future caller that wants exactly one object.
    const { env: e, broadcasts } = env()
    await worker.fetch(post({ channel: "team:T1#2", event: { resource: "members" } }, "shhh"), e)
    expect(broadcasts.map((b) => b.channel)).toEqual(["team:T1#2"])
  })

  it("one dead shard does not cost the others their ping", async () => {
    // Best-effort by contract: the write this ping describes has already
    // committed, so a shard that throws must be logged and stepped over, never
    // raced (Promise.all would have hidden three successes behind one failure).
    const broadcasts: { channel: string; message: string }[] = []
    const e = {
      INTERNAL_KEY: "shhh",
      CHANNELS: {
        getByName: (channel: string) => ({
          broadcast: (message: string) => {
            if (channel.endsWith("#1")) throw new Error("shard down")
            broadcasts.push({ channel, message })
          },
        }),
      },
    } as never
    const res = await worker.fetch(post({ channel: "team:T1", event: { resource: "members" } }, "shhh"), e)
    expect(res.status, "a dead shard is not a failed publish").toBe(200)
    expect(broadcasts.length).toBe(REALTIME_SHARDS - 1)
  })

  it("refuses a wrong key, and broadcasts nothing", async () => {
    const { env: e, broadcasts } = env()
    const res = await worker.fetch(post({ channel: "team:T1", event: {} }, "guess"), e)

    expect(res.status).toBe(403)
    expect(broadcasts).toEqual([])
  })

  it("refuses when the key header is absent", async () => {
    const { env: e, broadcasts } = env()
    expect((await worker.fetch(post({ channel: "team:T1", event: {} }), e)).status).toBe(403)
    expect(broadcasts).toEqual([])
  })

  it("FAILS CLOSED when INTERNAL_KEY is unset — never waves everyone through", async () => {
    // The direction matters. An unset secret must refuse everyone, not accept
    // everyone: this door can address ANY team's channel, so reading "no key
    // configured" as "no key required" is a cross-tenant broadcast.
    const { env: e, broadcasts } = env({ INTERNAL_KEY: undefined })
    expect((await worker.fetch(post({ channel: "team:T1", event: {} }, "shhh"), e)).status).toBe(403)
    expect((await worker.fetch(post({ channel: "team:T1", event: {} }), e)).status).toBe(403)
    expect(broadcasts).toEqual([])
  })

  it("checks the key BEFORE reading the body", async () => {
    // An unauthenticated caller must cost a header comparison, not a JSON parse
    // of whatever they sent.
    const { env: e } = env()
    let read = false
    const request = new Request("https://realtime/publish", {
      method: "POST",
      headers: { "x-internal-key": "guess" },
      body: "{}",
    })
    Object.defineProperty(request, "json", {
      value: async () => {
        read = true
        return {}
      },
    })
    expect((await worker.fetch(request, e)).status).toBe(403)
    expect(read, "the body must not be parsed for a caller who failed the key").toBe(false)
  })

  it("caps the channel name — it NAMES a Durable Object", async () => {
    // The key-holder is trusted to be a worker, not to be well-formed. An
    // unbounded string here is an unbounded object name.
    const { env: e, broadcasts } = env()
    const res = await worker.fetch(
      post({ channel: "t".repeat(TEXT_LIMITS.short + 1), event: {} }, "shhh"),
      e
    )
    expect(res.status, "an over-long channel is a 400, never a 500").toBe(400)
    expect(broadcasts).toEqual([])
  })

  it("refuses a body with no channel or no event", async () => {
    const { env: e, broadcasts } = env()
    expect((await worker.fetch(post({ event: {} }, "shhh"), e)).status).toBe(400)
    expect((await worker.fetch(post({ channel: "team:T1" }, "shhh"), e)).status).toBe(400)
    expect(broadcasts).toEqual([])
  })

  it("a WebSocket-less GET on the live endpoint is a refusal, not a crash", async () => {
    const { env: e } = env()
    const res = await worker.fetch(new Request("https://realtime/api/realtime?team=T1"), e)
    expect(res.status).toBe(426)
  })

  it("health answers without a key (it is the only open door)", async () => {
    const { env: e } = env()
    expect((await worker.fetch(new Request("https://realtime/api/realtime/health"), e)).status).toBe(200)
  })
})

describe("the hibernation handlers", () => {
  it("ignores anything a client sends — the channel is listen-only", async () => {
    const { channel: ch } = channel([])
    await expect(ch.webSocketMessage()).resolves.toBeUndefined()
  })

  it("closes the socket on disconnect", async () => {
    const ws = socket()
    const { channel: ch } = channel([ws])
    await ch.webSocketClose(ws as never)
    expect(ws.closed).toBe(1)
  })

  it("a socket already closing is not an error", async () => {
    // The other half of the same race: the runtime calls webSocketClose for a
    // socket the browser has already torn down. Throwing here would surface as a
    // Durable Object exception on an ordinary tab close.
    const ws = socket({ breaks: "close" })
    const { channel: ch } = channel([ws])
    await expect(ch.webSocketClose(ws as never)).resolves.toBeUndefined()
  })

  it("an error on a socket does not take the channel down", async () => {
    const { channel: ch } = channel([])
    await expect(ch.webSocketError()).resolves.toBeUndefined()
  })
})

// A SUBSCRIPTION IS WHAT A LISTENER ASKED FOR; A FENCE IS WHAT IT MAY HAVE.
//
// Every socket used to receive every ping its fence allowed, so somebody looking
// at one screen was woken by every other module in the team — and that cost is
// paid inside a single-threaded object, per socket, per ping. Narrowing it is one
// half of moving the ceiling (the other is the shard split above).
//
// The two filters fail in OPPOSITE directions on purpose, and that is most of what
// this suite is about: a fence that cannot be checked sends nothing, and a
// subscription that cannot be read sends everything. Getting those the wrong way
// round would either break a screen or leak an id.
describe("subscription scoping — what a listener asked to hear", () => {
  const ping = (resource: string) => JSON.stringify({ resource })

  it("sends a resource a socket subscribed to", () => {
    const ws = subscriber(["help", "todos"])
    const { channel: ch } = channel([ws])
    ch.broadcast(ping("help"))
    expect(ws.sent).toEqual([ping("help")])
  })

  it("SKIPS a resource nobody on that socket is looking at", () => {
    const ws = subscriber(["help"])
    const { channel: ch } = channel([ws])
    ch.broadcast(ping("member_roles"))
    expect(ws.sent, "the whole point: one screen open, one module's pings").toEqual([])
    expect(ws.closed, "and skipping is not closing — the socket stays live").toBe(0)
  })

  it("a socket with NO subscription still hears everything", () => {
    // FAIL OPEN. This is the shape every client had before subscriptions existed,
    // and the shape an older build still sends. Over-serving costs bandwidth;
    // under-serving costs a screen its correctness.
    const ws = subscriber(undefined)
    const { channel: ch } = channel([ws])
    ch.broadcast(ping("anything-at-all"))
    expect(ws.sent).toEqual([ping("anything-at-all")])
  })

  it("an unparsable event reaches a subscriber rather than being filtered out", () => {
    // No resource to match against. The fence's answer to that is silence; the
    // subscription's answer must be the opposite, or a malformed ping would go to
    // un-narrowed sockets only and quietly skip every narrowed one.
    const ws = subscriber(["help"])
    const { channel: ch } = channel([ws])
    ch.broadcast("not json")
    expect(ws.sent).toEqual(["not json"])
  })

  it("the subscription NARROWS a fence, it never widens one", () => {
    // A client login subscribed to a resource its fence does not allow must still
    // hear nothing. The two filters are ANDed, and the fence is the one that
    // decides — asserted because the cheap filter runs FIRST, and a reader could
    // reasonably wonder whether running first also means winning.
    const fenced = subscriber(["accounts"], { accountIds: ["A_MINE"] })
    const { channel: ch } = channel([fenced])
    ch.broadcast(JSON.stringify({ resource: "accounts", id: "A_SOMEONE_ELSE" }))
    expect(fenced.sent, "subscribing to a resource is not permission to see a row").toEqual([])
  })

  it("both filters together: subscribed AND inside the fence", () => {
    const fenced = subscriber(["accounts"], { accountIds: ["A_MINE"] })
    const { channel: ch } = channel([fenced])
    ch.broadcast(JSON.stringify({ resource: "accounts", id: "A_MINE" }))
    expect(fenced.sent.length).toBe(1)
  })

  it("one socket's narrow subscription does not silence another's", () => {
    const narrow = subscriber(["help"])
    const wide = subscriber(undefined)
    const { channel: ch } = channel([narrow, wide])
    ch.broadcast(ping("member_roles"))
    expect(narrow.sent).toEqual([])
    expect(wide.sent.length, "a per-socket filter must stay per-socket").toBe(1)
  })

  it("an EXPIRED socket is closed whatever it subscribed to", () => {
    // The deadline is checked before either filter, so a subscription cannot be
    // used to keep a stale authorization quietly alive.
    const stale = subscriber(["help"])
    stale.serializeAttachment({ scope: null, at: Date.now() - LISTENER_MAX_AGE_MS - 1, subs: ["help"] })
    const { channel: ch } = channel([stale])
    ch.broadcast(ping("help"))
    expect(stale.sent).toEqual([])
    expect(stale.closed).toBe(1)
  })
})

describe("the upgrade carries the subscription onto the socket", () => {
  /** The two Workers globals `fetch()` needs — the same stubs the stamping suite
   * above builds, for the same reason (a 101 is legal in the runtime and illegal
   * in Node's Response). */
  async function join(headers: Record<string, string> = {}) {
    const pair = { 0: socket(), 1: socket() }
    vi.stubGlobal("WebSocketPair", class { constructor() { return pair } })
    vi.stubGlobal(
      "Response",
      class {
        constructor(
          readonly body: unknown,
          readonly init: { status?: number; webSocket?: unknown } = {}
        ) {}
      }
    )
    try {
      const { channel: ch, accepted } = channel([])
      await ch.fetch(new Request("https://do/", { headers }))
      return accepted[0].attachment as { subs?: string[]; at?: number; scope?: unknown }
    } finally {
      vi.unstubAllGlobals()
    }
  }

  it("attaches what the door declared, beside the fence and the issue time", async () => {
    const held = await join({ "x-listener-subs": "help, todos ,help" })
    expect(held.subs, "trimmed, de-duplicated, in order").toEqual(["help", "todos"])
    expect(typeof held.at, "and the deadline still rides along").toBe("number")
  })

  it("OMITS the key entirely when nothing was declared", async () => {
    // Not `subs: null`, not `subs: []`. One absent key, one meaning — so a socket
    // from before subscriptions and a socket that declared nothing are the same
    // object, and the fail-open branch has one shape to check rather than three.
    const held = await join()
    expect(Object.hasOwn(held, "subs")).toBe(false)
  })

  it("ignores a declaration too large to be a screen's needs", async () => {
    // A subscription is walked per message, so an unbounded list turns the
    // optimisation into the cost. Past the ceiling the listener is un-narrowed,
    // never refused — the fail-open direction, again.
    const huge = Array.from({ length: 200 }, (_, i) => `r${i}`).join(",")
    const held = await join({ "x-listener-subs": huge })
    expect(Object.hasOwn(held, "subs")).toBe(false)
  })
})

// ── THE SHARD'S OWN CEILING, AND THE MEASUREMENT NOBODY HAD ─────────────────
//
// `REALTIME_SHARDS = 4` carries a comment stating a ceiling ("~12–20k concurrent
// listeners per team… clears the yardstick's 25,000 only once combined with
// subscription scoping") and, until 5 Sep 2026, nothing beneath it. A Durable
// Object is single-threaded and a broadcast is a serial loop, so past a few
// thousand sockets every publish on that team queues behind the last — and the
// first symptom of that is "the app feels slow", on the one team big enough to
// matter, pointing at nothing.
//
// So the loop counts, and the row it writes carries both numbers: how many
// sockets the shard is holding, and how many of them the ping actually went to.
// The second is the only observation anybody has of what subscription scoping
// removes on a real tenant, which is the number the whole shard-count arithmetic
// rests on.
describe("a crowded shard says so, and says how crowded", () => {
  /** A channel whose env records what `logError` was handed. */
  function watched(sockets: FakeSocket[]) {
    const rows: unknown[][] = []
    const env = {
      DB: {
        prepare: () => ({
          bind: (...params: unknown[]) => {
            rows.push(params)
            return { run: async () => ({}) }
          },
        }),
      },
    }
    const ctx = { acceptWebSocket: () => {}, getWebSockets: () => sockets }
    return { rows, channel: new TeamChannel(ctx as never, env as never) }
  }

  /** `n` sockets, all subscribed to something the ping is NOT about — so the
   * shard is crowded and the broadcast sends to nobody, which is the healthy
   * shape and the one the ratio has to be able to describe. */
  const crowd = (n: number) =>
    Array.from({ length: n }, () => subscriber(["something_else"]))

  it("says nothing while the shard is comfortable", async () => {
    // THE CANARY for the assertion below: the same code path, an ordinary
    // channel, and no row. Without it a watch that fired unconditionally would
    // pass the crowded test.
    const { rows, channel: ch } = watched([listener(), listener()])
    ch.broadcast(JSON.stringify({ resource: "members", id: "M1" }))
    await Promise.resolve()
    expect(rows, "two listeners is not a crowd").toHaveLength(0)
  })

  it("records the shard's size AND how many the ping reached", async () => {
    const sockets = crowd(REALTIME_SHARD_WATCH_SOCKETS)
    const { rows, channel: ch } = watched(sockets)
    ch.broadcast(JSON.stringify({ resource: "members", id: "M1" }))
    await Promise.resolve()
    await Promise.resolve()

    expect(rows, "a shard at the watch line must be reported").toHaveLength(1)
    // `logError` binds (id, at, source, place, message, …) — the message is where
    // the two numbers are, and both have to be in it or the row is an alarm
    // without a measurement.
    const message = String(rows[0][4])
    expect(message).toContain(`holding ${REALTIME_SHARD_WATCH_SOCKETS} sockets`)
    expect(message, "the scoping measurement is the point").toContain("went to 0 of them")
  })

  it("reports once an hour, not once a ping", async () => {
    // A busy team publishes constantly. A row per ping would spend `logError`'s
    // whole hourly budget on this one shard and starve every other worker's
    // crash report — the exact failure MAX_ERROR_LOGS_PER_HOUR is bucketed to
    // prevent, arriving from inside.
    const { rows, channel: ch } = watched(crowd(REALTIME_SHARD_WATCH_SOCKETS))
    for (let i = 0; i < 5; i++) ch.broadcast(JSON.stringify({ resource: "members", id: `M${i}` }))
    await Promise.resolve()
    await Promise.resolve()
    expect(rows).toHaveLength(1)
  })
})
