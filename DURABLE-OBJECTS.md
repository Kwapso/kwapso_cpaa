# Durable Objects, the live layer and the one lock (LOCKED 2026-06-15; ROW-LEVEL 2026-06-22)

Brimba uses two Durable Object classes today, both inside the **realtime**
worker (fact updated 26 Aug 2026: this sentence said "exactly one" from the day
it was locked until `TeamInterest` shipped in August 2026). `TeamChannel` is the
live "switchboard"; `TeamInterest` is the per-team interest registry beside it —
one small instance per team that remembers which shards hold a listener for
which resource, so the publish door fans a ping out only to the shards that
asked (a stale or unknown answer says yes, so the failure costs an extra send,
never a missed one). This doc explains what they are, how
their code is versioned and deployed, the end-to-end live-sync flow (a write →
`publishChange` → the DO → the client patches **one** row), and the separate
question of when a Durable Object is the right tool for a **contended write** (a
lock) versus when a plain D1 row is enough.

Two adjacent docs own the halves of the story this one connects:
[ARCHITECTURE.md](ARCHITECTURE.md) §2 (the code-vs-runtime model, locked) and
[CONCURRENCY.md](CONCURRENCY.md) (the race-safety ruleset). [CACHING.md](CACHING.md)
owns the client cache the live layer keeps honest. Read this before touching
`workers/realtime/**`, `shared/workers/realtime.ts`, or reaching for a DO in a
write path.

---

## 1 · Two different things called "Durable Object"

The confusion to retire first: **a worker count and a Durable-Object count are
different things**, and a DO *class* and a DO *instance* are different again.
This table is where that distinction is kept. ARCHITECTURE §2 rules on what gets
an instance and points here for what an instance IS.

| Thing | What it is | How many | Grows with teams? |
|---|---|---|---|
| **Worker** | Deployed code (auth, tenancy, realtime, content, data-ops, mcp, gateway, portal-gateway) | 8 built | No |
| **DO class** | A class *inside* a worker (`TeamChannel` + `TeamInterest`, both in realtime) | 2 today (26 Aug 2026) | No |
| **DO instance** | A *runtime* entity addressed by name (`team:<id>#0…3`, `team:<id>!interest`, `user:<id>`) | Unlimited | Yes — five per team (four `TeamChannel` shards + one `TeamInterest`) **and** one `TeamChannel` per signed-in user |

An instance is **not** a worker. Addressing one by name conjures it; idle ones
hibernate and cost ~nothing. Exactly like OOP: one `class` (code), millions of
objects (runtime). 10,000 teams + their members is still 8 workers + two DO
classes, but ~50,000 team-side instances (four channel shards and one interest
registry per team) plus one per signed-in user, almost all asleep. *(Fact
updated 26 Aug 2026: this paragraph used to count one class and one instance
per team. The class count moved when `TeamInterest` shipped; the instance
arithmetic moved with the shard split §2 describes.)*

This doc uses "the DO" for the runtime instance and "`TeamChannel`" for the class.

---

## 2 · What `TeamChannel` is and does

`TeamChannel` lives in `workers/realtime/src/index.ts`. It is a **pub/sub relay
and nothing else**:

- **One channel per team or per person — and a TEAM channel is four instances.**
  A person's identity channel is one instance, addressed `user:<id>`. A team's
  data channel is addressed `team:<id>` by every PUBLISHER, but since the split
  of 14 Aug 2026 (ARCHITECTURE §7 records the decision; this section is its
  mechanism) it is **spread across `REALTIME_SHARDS` (4) instances**, named by
  `teamShardName` as `team:<id>#0` … `team:<id>#3`. All three names —
  `REALTIME_SHARDS`, `shardFor` (a stable hash of the user id) and
  `teamShardName` — live in `shared/workers/realtime.ts`, the seam the client
  and the worker both import, so the two can never disagree about the count.
  The fan-out is owned by the realtime worker's `/publish` door, not by the
  publishers: a publisher still makes ONE call naming `team:<id>`, and the door
  asks the team's `TeamInterest` registry (`teamInterestName`,
  `team:<id>!interest`, one small instance per team remembering which shards
  hold a listener for which resource) which shards to send to — every unknown
  answers "all of them", so a stale entry costs an extra send, never a missed
  one. A listener joins the shard of `shardFor(userId)`, so one person's devices
  land together and a reconnect returns to the same object.
  `env.CHANNELS.getByName(name)` resolves an instance by name, creating it on
  first use — which is why nothing listens on a bare `team:<id>`: publish
  through the door, or address a shard. *(Fact updated 26 Aug 2026: this bullet
  said "one instance per channel" from the day the doc was locked until the
  split, and for twelve days after it.)*
- **It holds open WebSockets, not data.** The DO stores **no application data**;
  the databases (global core D1 + per-team D1) stay the single source of truth
  (`index.ts` header: *"Stores NO app data"*). It keeps a set of sockets and
  fans a message out to them.
- **It relays opaque tags.** It knows nothing about what "members" or
  "member_roles" mean, it just broadcasts whatever `{resource, id, op}` ping it
  is handed. That is why it is reusable as-is by any app built on this base.
- **It honours one fence.** The single exception to "opaque": a socket may carry
  a **scope stamp**, and an account-owned ping is only sent to a stamped socket
  whose fence contains that row (see "The listener's fence" below).

The whole class is ~50 lines:

```ts
export class TeamChannel extends DurableObject<Env> {
  // A browser joins. Accept via the Hibernation API so the runtime keeps the
  // socket even after this object sleeps — we don't pay while idle. The
  // listener's fence (if any) is serialized onto the socket, so it survives
  // hibernation and every later broadcast honours it with no extra DB read.
  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)
    const stamp = request.headers.get("x-listener-scope")
    // The fence (null = staff) AND the moment it was resolved. Both, on every
    // socket — see "An authorization has a deadline" below.
    server.serializeAttachment({ scope: stamp ? JSON.parse(stamp) : null, at: Date.now() })
    return new Response(null, { status: 101, webSocket: client })
  }

  // Fan a tiny message out to everyone on this channel WHO MAY HEAR IT — and
  // who still may, which is a question about time as well as about accounts.
  broadcast(message: string): void {
    const event = JSON.parse(message)
    const now = Date.now()
    for (const ws of this.ctx.getWebSockets()) {
      const listener = ws.deserializeAttachment()       // { scope, at }
      // Out of time (or from before the rule) → close, never send.
      if (!listener || typeof listener.at !== "number" || now - listener.at > LISTENER_MAX_AGE_MS) {
        try { ws.close(1000, "reauthorize") } catch {}
        continue
      }
      if (listener.scope && !mayHearChange(listener.scope, event)) continue
      try { ws.send(message) } catch { /* dead socket — runtime drops it */ }
    }
  }

  // Clients only listen; inbound frames are ignored. These handlers keep the
  // object hibernation-eligible and tidy up on disconnect.
  async webSocketMessage(): Promise<void> {}
  async webSocketClose(ws: WebSocket): Promise<void> { try { ws.close() } catch {} }
  async webSocketError(): Promise<void> {}
}
```

### The Hibernation API (why idle channels are free)

`this.ctx.acceptWebSocket(server)` uses the **WebSocket Hibernation API**, not a
plain `server.accept()`. The difference is the whole cost model:

- The **runtime** owns the socket, not this isolate. An idle channel's DO is
  **evicted from memory** while its members' sockets stay open.
- A `broadcast` wakes the instance, calls `getWebSockets()`, sends, and lets it
  sleep again. `webSocketMessage` / `webSocketClose` / `webSocketError` are
  handlers the *runtime* calls on the hibernatable object, they exist so the
  DO never has to hold a live JS closure per socket just to receive events.

So 10,000 teams with quiet channels use ~no memory. That is the property that
makes "five instances per team **and** one per user" affordable — the shard
split multiplied the instance count and hibernation is what made that free.
*(Fact updated 26 Aug 2026: this line used to say "one instance per team".)*

### The three entry points

`workers/realtime/src/index.ts`'s default `fetch` handler exposes:

| Route | Method | Who calls it | What it does |
|---|---|---|---|
| `/publish` | POST | Other workers, **service binding only** | For a bare `team:<id>`: ask `TeamInterest` which shards care, then `broadcast` to each interested `team:<id>#n`. For `user:<id>` (or an explicitly named shard): `env.CHANNELS.getByName(channel).broadcast(…)` |
| `/api/realtime?team=<id>` / `?user=<id>` | GET (WebSocket upgrade) | A browser, via the gateway | Gate, then hand the request to the caller's shard of the team's channel (`shardFor(user.id)`) or to the one `user:<id>` instance |
| `/api/realtime/health` | GET | Ops | `{ ok: true }` |

`/publish` is internal: it is reached only over the service binding
(`env.REALTIME`), never the public gateway. It is **still keyed**, every caller
presents `x-internal-key`, and an unset `INTERNAL_KEY` makes the door refuse
everyone (fail-closed). One door that can reach ANY team's channel is not
protected by network isolation alone.

### The connection gate, the same rule as the API

A socket is **gated at connect** exactly like an API request; a gate is an auth
check, not a lock. `fetch` in `index.ts`:

1. `whoAmI` asks the **auth** worker over its service binding (`env.AUTH`) who is
   opening the socket, forwarding the request's `Cookie`. No session → `401`.
2. `?user=<id>`: you may join **only your own** identity channel
   (`userId !== user.id` → `403`). Open for every signed-in user, even before
   they join a team.
3. `?team=<id>`: you must be an **active member of that team**,
   `requireMember(env, user.id, teamId)` (`shared/workers/gating.ts`), the very
   function every API door gates on. Not a member → `403`.

Because the socket is gated at connect, a listener never receives a ping it
could not already have earned through the API. (CACHING.md rule 8, and
CONCURRENCY.md's "What is NOT a lock".)

### The listener's fence, membership is not the whole gate

Team membership answers "may you be on this channel?". It does **not** answer
"may you hear about THAT row?", and a client-portal login is a member of the
agency's team (that is how their requests reach any door at all). So the channel
was naming, by row id, every account in the agency as it changed, to a listener
fenced out of all of them. A ping carries no row data, but **row ids are exactly
what made the activity-feed leak reachable**; the fence file says so in as many
words.

So the gate resolves the caller's account scope through the one guard corridor
(`accountScope`, `shared/workers/account-scope.ts`) and stamps the socket:

| Listener | Stamp | Hears |
|---|---|---|
| **Staff** (no `portal_users` row) | none | every ping on the team channel, unchanged |
| **Client login** | `{ accountIds }` | account-owned pings (`accounts`, `account_links`, `portal_users`) whose **row id** is inside their fence, plus scope-stamped pings (`help`, `help_threads`) whose **named account** is, and nothing else |

`mayHearChange(stamp, event)` is the whole rule, and it lives beside the SQL
fence so the two can never disagree. A client hears silence for the agency's
members, roles, invites and articles, they have no screen in this app that
reads any of them.

**The stamped list grows one reviewed line at a time — nine today** (fact
updated 26 Aug 2026: tickets were the first; `processes` and `account_rates`
joined in `a9694fb` so the client's Impact screen could hear its own subject).
A ping carries a row id, and a *ticket* id tells the fence nothing about whose
ticket it is, so such a ping additionally NAMES the account it belongs to
(`ChangeEvent.scope`); `SCOPE_STAMPED_RESOURCES` is the reviewed list of
resources allowed to be heard that way, and a census
(`workers/tenancy/test/stamped-publishers.test.ts`) fails the build when a
publisher on that list forgets its stamp. A forgotten stamp makes a screen
stale; a fence that guessed would make it a disclosure, so the unstamped case
is silence. That is the fail-closed direction, kept — the list opens for a
named resource at a time, rather than having been open to everything all
along.

### An authorization has a deadline

The gate above runs **once**, at the handshake: signed in, an active member of
*this* team, and, for a client login, the fence they stand behind. The answer
is stamped onto the socket so no later ping costs a database read. Nothing ever
re-asked whether the answer was still true.

A hibernatable socket outlives the object that accepted it, and a browser tab is
patient, so "once" meant **for ever**. A member removed from the team, and a
client login whose portal access was revoked, kept hearing that team's pings,
resource, row id and account, live, for as long as they left the connection
open. Signing out did not end it either: `destroySession` clears a cookie and a
row and touches no socket, and `publishSignOut` is wired to the email-change
flow on the `user:` channel alone. No row *data* travels on a ping and every
door refuses an ex-member the moment they try to read one, but this file has
already ruled that row ids are not nothing, which is why `mayHearChange` exists
at all. A fence that is correct at the handshake and unexamined afterwards is
the same sentence said about time instead of about accounts.

So an authorization **expires** (`LISTENER_MAX_AGE_MS`, 15 minutes), and the
expiry is spent where the decision is: `broadcast` closes an over-age socket
instead of sending to it. Both halves of that shape are deliberate.

- **No alarm, and no list.** Nothing has to enumerate "the things that ought to
  disconnect somebody", a list is a thing the next module can be missing from,
  which is the failure the fence itself was written to avoid.
- **It runs exactly when it matters.** A channel with nothing to say has nothing
  to leak; the first ping after the deadline is the one that does not go out.
- **The client does the rest unaided.** `shared/web/realtime.ts` reconnects with
  backoff and calls `onReconnect`, so the socket comes back re-gated and the
  screen resyncs what it missed. Somebody who is no longer a member simply gets
  the 403 the API has been giving them all along.
- **Fail-closed, like everything else here.** A socket carrying no issue time,
  one accepted by an older build, or by anything that skipped `fetch()`, is
  closed rather than trusted, and the deadline is checked **before** the fence,
  so a revoked login is disconnected rather than merely filtered.

`workers/realtime/test/team-channel.test.ts` pins both sides of the window, the
order of the two checks, the no-issue-time case, and the constant's own
magnitude, a deadline widened to a session's lifetime would restore the hole
while leaving every other test green.

Two consequences worth knowing:

- **It costs one read per connect.** The team channel needs `CF_D1_TOKEN` on the
  realtime worker (OPERATIONS.md § Secrets). With no token, or a failed lookup,
  the team channel **refuses the socket** (`503`): we cannot tell staff from a
  client login, so nobody joins. The `user:<id>` channel is unaffected, so
  identity events and a forced sign-out still reach every device.
- **The stamp is taken at connect, so a fence that MOVES has to force one.** This
  was written down once as a harmless caveat and it was not: the client re-opened
  only when `teamId` changed, and switching company does not change the team. So
  after a switch the socket carried the OLD company's account set and
  `mayHearChange` dropped the NEW company's pings, the portal went **silently
  deaf**, which is the worst failure shape available (nothing looks broken; the
  data is just quietly stale). The fence is therefore part of the socket's
  IDENTITY: `useRealtime(teamId, …, currentAccountId)` puts it in the query
  string, so a switch is a different URL, a different socket, and a fresh stamp.

  **The realtime worker never reads that parameter, and must never start.** It is
  a cache key on the client's side and nothing on ours, the stamp is always
  resolved server-side from the caller's session, so editing the value in the URL
  re-opens a socket and hands back exactly the same fence. Reading it would turn a
  string the client controls into the fence that decides what they may hear, which
  is the shape the stamp exists to refuse.

  **What is still bounded by socket lifetime:** a REVOKED grant. Withdrawing a
  portal login does not close the sockets that person already holds, so until the
  link drops (or their next session read moves them out of `ready`, which closes
  it) they keep hearing account-owned pings for the world they have just left,
  row ids only, and every door refuses them from the first request. Closing that
  properly needs a server-initiated close or a user-channel listener on the
  portal, which is an ARCHITECTURE decision, not a quiet patch.

### Two channel scopes

Defined in `shared/workers/realtime.ts` and consumed by `shared/web/realtime.ts`:

| Scope | Name | Members | Carries |
|---|---|---|---|
| **Team** | `team:<teamId>` | Every active member of that team | Team data pings (`members`, `member_roles`, `invites`, `help`, `stories`, `activity`, …) |
| **User** | `user:<userId>` | Every signed-in device of one person | Identity/cross-team events (`profile`, `account_activity`, `teams`) + a forced sign-out (`session`) |

A browser opens **two** sockets: the active team's channel
(`useRealtime(teamId, …)`) and its own user channel (`useUserRealtime(userId,
…)`). The user channel exists so identity changes (name/photo), cross-team
membership (joined / removed / new team), and a forced sign-out fan out across a
person's devices without depending on any one team's socket, and work even when
the user is teamless.

---

## 3 · The code-vs-runtime model, versioning, migrations, deploy order

`TeamChannel` is code; it is deployed and versioned like any worker. The runtime
instances are created on demand and never appear in config.

### The wrangler binding + migration

From `workers/realtime/wrangler.jsonc`:

```jsonc
"durable_objects": {
  "bindings": [
    { "name": "CHANNELS", "class_name": "TeamChannel" },
    { "name": "INTEREST", "class_name": "TeamInterest" }
  ]
},
"migrations": [
  { "tag": "v1", "new_sqlite_classes": ["TeamChannel"] },
  { "tag": "v2", "new_sqlite_classes": ["TeamInterest"] }
],
```

- **`bindings`** exposes the class to the worker as `env.CHANNELS`, a
  `DurableObjectNamespace<TeamChannel>`. Code addresses instances through it:
  `env.CHANNELS.getByName("team:…")`.
- **`migrations`** is the DO *class* lifecycle, not a D1 table migration. `v1`
  with `new_sqlite_classes: ["TeamChannel"]` registers the class on first
  deploy; `v2` did the same for `TeamInterest` when it landed in August 2026.
  `new_sqlite_classes` (rather than `new_classes`) gives each instance a
  SQLite-backed storage tier; `TeamChannel` never writes to it (it holds no
  data), but the base is registered SQLite-backed so a future stateful DO uses
  the same tier without a class rename. You add another migration entry
  (`v3`, …) when you **introduce**, **rename**, **delete**, or **transfer** a DO
  class — `v2` is what introducing one looks like — not for
  ordinary code edits, which ship as a normal worker version.
- **Staging repeats everything.** Wrangler envs don't inherit, so the
  `env.staging` block repeats the DO binding, the migration, its own `DB`, and
  its own `AUTH` service. Top-level = production.

### Why realtime deploys FIRST

Deploy order is **realtime-first**, then auth → tenancy → content → data-ops →
mcp → gateway → portal-gateway (OPERATIONS.md; the "base-completion" and
"agent-modules" builds both fixed regressions here). The reason is a dependency
direction:

- Every other worker holds a **service binding to realtime** and calls
  `publishChange` after a write. If realtime is deployed *last*, there is a
  window where a freshly-deployed writer publishes to a channel contract the old
  realtime worker doesn't yet understand.
- A DO **class migration** (a rename/transfer) must be live before code that
  addresses the new class runs. Shipping realtime first means the channel layer
  is always at least as new as the workers that publish to it.
- Failure is **best-effort by design** (see §4), a publish that lands on a
  not-yet-updated realtime can't corrupt a write, but deploying realtime first
  removes the window entirely rather than relying on the safety net.

The two gateways deploy **last** because they are the only public doors: nothing is
reachable by users, agency staff through `gateway`, clients through
`portal-gateway`, until every worker behind them is already updated.

---

## 4 · The live-sync flow, end to end

The rule (a Law of the Base): **every mutation publishes a live change**, and the
client **patches exactly one row, cache-first, never refetching the list**. Here
is one real write, an admin changing a member's role, from commit to the other
admin's screen.

### Step 1, the write commits (worker)

`changeMemberRole` in `workers/tenancy/src/lib/members.ts` does the gated,
race-safe D1 write (the atomic last-admin `UPDATE … WHERE … COUNT(*) > 1`, §5),
logs activity, then the route publishes:

```ts
// after the UPDATE succeeds, the route carries the affected row id:
await publishChange(env.REALTIME, guard.teamId, "members", targetUserId, "edit")
```

### Step 2, `publishChange` → `/publish` (shared seam)

`shared/workers/realtime.ts` turns that into a channel post. The payload is
`{resource, id, op}` and **never row data**:

```ts
export async function publishChange(realtime, teamId, resource, id?, op?) {
  await publish(realtime, `team:${teamId}`, { resource, id, op })
}

async function publish(realtime, channel, event) {
  try {
    await realtime.fetch("https://realtime/publish", {
      method: "POST",
      // Keyed like every internal door — /publish can reach ANY team's channel.
      headers: { "Content-Type": "application/json", "x-internal-key": INTERNAL_KEY },
      body: JSON.stringify({ channel, event }),
    })
  } catch (e) {
    console.error("realtime publish failed:", e)   // best-effort: never rethrow
  }
}
```

**Best-effort is load-bearing.** `publish` swallows its error. A live-layer
hiccup must never break the write it describes, the D1 write is already
committed and is the authority; a dropped ping only means someone's screen
revalidates a moment later (or on reconnect catch-up, §6). The realtime test
asserts this: `publishChange` *"never throws, a live-layer hiccup can't break
the write it describes"*.

Sibling helpers: `publishUserChange(userId, resource, id?, op?)` posts to
`user:<userId>`; `publishSignOut(userId)` posts a `{resource:"session",
op:"session"}` event with no id.

### Step 3, the door fans it out (realtime worker)

`/publish` looks at the channel name. A `user:<id>` (or an explicitly named
shard) resolves one instance and broadcasts. A bare `team:<id>` is the sharded
case (§2): the door asks the team's `TeamInterest` registry which shards hold a
listener for this resource — any unknown answers "all of them" — then
broadcasts to each interested shard concurrently, settled rather than raced, so
one dead shard cannot cost the other three their ping:

```ts
const answer = await env.INTEREST.getByName(teamInterestName(teamId)).shardsFor(resource)
// `shards` is the narrowed list, or all of 0…REALTIME_SHARDS-1 on any doubt
await Promise.allSettled(
  shards.map(async (shard) =>
    env.CHANNELS.getByName(teamShardName(teamId, shard)).broadcast(payload)
  )
)
```

`broadcast` loops `this.ctx.getWebSockets()` and `ws.send`s the JSON to every
socket on that one instance that MAY HEAR IT (staff: all of them; a client login:
its own accounts only. "The listener's fence", §2). Each DO is single-threaded,
so this is a clean fan-out; a dead socket throws on `send` and is ignored (the
runtime drops it on close).

### Step 4, the client patches ONE row (browser)

`shared/web/realtime.ts` receives the frame and calls the host's `onEvent`; the
registry-driven handler in `web/components/app-shell.tsx` decides what to do. It
is **not** a per-resource `switch`, every module is one entry in
`TEAM_RESOURCES`:

```ts
members: {
  key: (t) => `members:${t}`,
  idField: "userId",
  fetchOne: (id) => tenancy.member(id),               // gated single-row read
  fetchList: () => tenancy.members().then((r) => r.members), // reconnect catch-up
  deps: (t, id) => [`member_roles:${t}`, `activity:user:${id}`],
  refreshCtx: true,
}
```

The handler, given `{resource:"members", id, op:"edit"}`:

```ts
const r = TEAM_RESOURCES[event.resource]
if (!r) return
const id = event.id
void patchRow(r.key(teamId), r.idField, id, () => r.fetchOne(id))
for (const k of r.deps?.(teamId, id) ?? []) invalidate(k)
```

`patchRow` re-pulls **just that one row** through the gated single-row endpoint
(`tenancy.member(id)`) and swaps it into the cached list in place. It does
**not** refetch the collection. Key properties:

- **`op` is advisory.** The client re-pulls and decides keep-or-drop, so `add`
  vs `edit` vs `remove` need not be exact (`ChangeEvent` docstring). The
  single-row read passes the **same server filter** as the list, so a row that
  no longer belongs (a deactivated member) comes back `null` and is dropped,
  one mechanism for add / edit / remove / soft-delete.
- **Never trust the ping for data.** The re-pull goes through the
  permission-checked endpoint, so a cache can never hold something the viewer
  isn't allowed to see (a viewer with no rights just gets nothing back).
- **Derived numbers recompute client-side** ("N members", badges) from the
  patched rows. Never refetch a collection for a count.
- **A full-collection refetch happens only on first load and team switch.**

The identity channel is handled by a parallel `useUserRealtime` block: a
`session` event re-checks auth (`auth.me().catch(() => location.assign("/login"))`,
the acting device keeps its still-valid session, only truly-dead ones bounce);
`profile` / `teams` call `active.refresh()`; `account_activity` invalidates the
small own-account feed.

### The whole path

```
worker write (D1, committed)
  → publishChange(env.REALTIME, teamId, resource, id, op)   [best-effort]
    → POST https://realtime/publish { channel:"team:<id>", event:{resource,id,op} }
      → TeamInterest("team:<id>!interest").shardsFor(resource)   [any doubt ⇒ every shard]
        → TeamChannel("team:<id>#n").broadcast(json), each interested shard
          → ws.send to every open socket on that shard
            → client onEvent → patchRow(re-pull ONE row via gated endpoint) → swap in place
```

No row content ever leaves the database over this path. The ping says *what*
changed; the client earns the *content* through the same door it always uses.

---

## 5 · When a Durable Object is the right lock, and when it is NOT

`TeamChannel` is pub/sub; it is **not** in any write path and serializes nothing.
The *other* use of a DO, as a **lock** for contended, atomic writes, is a
separate decision governed by [CONCURRENCY.md](CONCURRENCY.md). Brimba's base
modules use **zero** DO locks today; here is the rule for when a future module
would need one.

A write that protects an **invariant** (a count, a balance, "keep ≥1 admin",
stock-on-hand, uniqueness) must be race-safe by **one** of three tools, in
order of preference:

### 1 · Atomic conditional SQL, the default

Re-check the invariant *inside* the write's `WHERE`, and treat "0 rows changed"
as "refused". D1/SQLite runs a single statement atomically and serializes writes
per database, so two concurrent statements can't both win, **no DO needed**.
This is the last-admin rule (`workers/tenancy/src/lib/members.ts`):

```ts
const res = await env.DB.prepare(
  `UPDATE team_members SET role_id = ?, updated_at = ?
   WHERE id = ? AND deactivated_at IS NULL
     AND ( ? = ? OR role_id != ?
           OR (SELECT COUNT(*) FROM team_members
               WHERE team_id = ? AND role_id = ? AND deactivated_at IS NULL) > 1 )`
).bind(/* … */).run()
if (!res.meta?.changes)
  throw new GuardError(409, "last_admin", "A team must keep at least one admin.")
```

The friendly `countRole(...) <= 1` pre-check above it is the fast path; the
`WHERE`-embedded `COUNT(*) > 1` is the **authority**. Two simultaneous demotions
can't both zero out the team's admins because D1 serializes the two `UPDATE`s and
the second one sees `changes === 0`. `removeMember` uses the identical backstop.

### 2 · A unique index, for uniqueness invariants

Let the database reject the duplicate; use a partial index when only some rows
are constrained. Example: at most one **pending** invite per (team, email),
`db/core/0006_invite_pending_unique.sql`; `createInvite` catches the violation
and reports it kindly. No DO.

### 3 · A per-entity Durable Object, the rare hot counter

**Only** for a **hot, multi-step, contended** entity where many writers hammer
one thing (an inventory cell, a ledger account, a booking slot) and a serialized
read-modify-write genuinely matters. The DO handles its requests one at a time
(single-threaded); apply the **operation** inside it ("decrement by 2", not "set
to 7") and **persist before you ack**. Cross-entity transactions use a
coordinator + idempotency keys. This is reserved for genuine hot counters, most
writes never need it, and Brimba's base has none.

### The decision table

| Invariant shape | Tool | DO? |
|---|---|---|
| Single-statement count / floor ("keep ≥1 admin", stock ≥ 0) | Atomic conditional SQL (`WHERE … COUNT(*) …`, `changes === 0` = refused) | No |
| "No duplicates" | Unique / partial-unique index; catch the violation | No |
| Hot, multi-step counter under heavy concurrent load | Per-entity Durable Object (serialized read-modify-write) | **Yes** |
| Team name, member list, roles, a record's descriptive fields | Plain D1 write + a channel ping | No |

**Don't reach for a DO just because a write touches shared data.** Renaming a
team is a D1 write + a `publishChange(…, "team")` ping, it does not get its own
DO. DO instances scale by key independent of D1 sharding; the two are orthogonal.

---

## 6 · Gotchas

**Deploy realtime first.** Every writer holds a service binding to realtime and
publishes after committing; a DO class migration must be live before code that
addresses it. Realtime-first closes both windows. Gateway last (it's the public
door). (§3, OPERATIONS.md.)

**A publish never blocks a write.** `publish` swallows its error and callers
don't `await`-throw it. The committed D1 write is the authority; a lost ping is
recovered by revalidation or reconnect catch-up. Never make a write's success
depend on the live layer.

**Reconnect re-syncs, pings can be missed.** A backoff-reconnecting socket
(`shared/web/realtime.ts`: 1s, 2s, 4s … capped at 15s) can't prove it saw every
ping while it was down. `onReconnect` fires only on a **re**-connect (not the
first open) and the host `reconcile`s each on-screen list, diff-patching changed
rows in, new rows in order, gone rows out, plus refreshes the small derived
caches. No page reload. So the live layer is *eventually* correct even across a
drop; don't design as if every ping is guaranteed.

**The socket rides the same worker path as any request. SSE/streaming caveat.**
The WebSocket upgrade is a normal `fetch` through the gateway to the realtime
worker to the DO. A DO is single-threaded: a long-lived connection is fine
(that's what Hibernation is for), but any *streaming* response is bounded by the
isolate/request lifetime of the worker carrying it, not the DO's lifetime.
Long-lived PUSH (hours-open, server-initiated) belongs on the hibernatable
WebSocket path, never a held-open HTTP stream. The agent chat DOES stream,
turn-length SSE straight from `data-ops` (seconds, one request's lifetime, the
DO never involved; see EDGE-CASES §6), which is fine precisely because it ends
with the turn; it is not a long-lived channel.

**`user:<id>` and `team:<id>` are both gated, neither is a lock.** Both scopes
are auth-checked at connect (your own id / active membership of that team) and
neither serializes anything. If you ever need to serialize a contended write,
that's a *different* DO instance chosen by CONCURRENCY.md rule 3. Never
`TeamChannel`.

**Idle is free, but a busy channel wakes the isolate.** Hibernation makes an
idle channel ~free; a burst of writes to one very hot team wakes its DO for each
`broadcast`. Pings are tiny (`{resource,id,op}`) and the client coalesces work
(one row re-pull), so this is cheap, but it is a real cost axis if a single
team fans out thousands of writes a second. That is a workload for the row-level
design (one ping, one row patched), which is exactly why the ping never carries
list-sized payloads.

**Bulk writes are the coarse exception.** (The full list of sanctioned coarse
pings, import per table + the `agent_usage` quota meter, is in CACHING.md.)
CSV import (`data-ops`) writes many
rows then publishes **one id-less** ping on the target table (`member_roles` /
`selectable_data`); the client refetches that one list via reconnect-style `reconcile`
rather than patching N rows. An id-less ping means "refetch this collection", not
"patch a row". See the `if (!event.id)` branch in the app-shell handler.

---

## 7 · Rebuilding this from scratch

To add the live layer to a new app on this base:

1. **The DO class**, a `TeamChannel` extending `DurableObject`, accepting
   sockets via `this.ctx.acceptWebSocket` (Hibernation) and a `broadcast` that
   loops `getWebSockets()`. Holds no data. (`workers/realtime/src/index.ts`.)
2. **The wrangler binding + migration**, `durable_objects.bindings`
   (`CHANNELS` → `TeamChannel`; add `INTEREST` → `TeamInterest` if you take the
   interest registry too) and `migrations` (`new_sqlite_classes`, one tag per
   class); repeat the block under `env.staging`.
3. **The gate**, `whoAmI` via the auth service binding, then `isActiveMember`
   for `team:` / own-id for `user:` before handing the request to the instance.
4. **The publish seam**, `shared/workers/realtime.ts`
   (`publishChange` / `publishUserChange` / `publishSignOut`), best-effort,
   posting `{resource, id, op}` to `/publish`.
5. **Classify every route** `read` / `mutation` / `housekeeping` in the worker's
   `ROUTES` table; the `publish-seam.test.ts` guard turns the build red if a
   `mutation` doesn't publish. (CACHING.md rule 4.)
6. **The client**, `shared/web/realtime.ts` (two sockets, backoff, reconnect) plus
   one `TEAM_RESOURCES` entry per module (`key` / `idField` / `fetchOne` /
   `fetchList` / `deps`); the generic handler does row-level `patchRow` +
   reconnect `reconcile`. No bespoke per-module code. (CACHING.md rule 3.)
7. **Deploy realtime first.**

For a contended write, do **not** touch any of the above. Pick the lock from
CONCURRENCY.md (atomic SQL → unique index → per-entity DO, in that order).
