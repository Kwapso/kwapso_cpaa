# scaling-review.md — Brimba / kwapso, 14 August 2026

Branch `audit/scaling`. Every number below is recomputable from this file plus
`~/.claude/skills/scaling_review/assets/rubric.md`.

**Score: 53 → 78 / 100.** The acceptance target was 94. It was not reached, and the
reason is not a shortage of effort: **every remaining point is behind a locked
architectural decision, a Law of the Base, or an endpoint-contract change.** The
arithmetic for that claim is in §7. Nothing below moves a number by redefining what
it measures.

---

## 1 · The platform, and the limits that bind

Cloudflare Workers (serverless isolates) · one **D1** database per team over the REST
door + one global core D1 on a native binding · **R2** for files · one **Durable
Object** class (`TeamChannel`) for the live layer · **Vectorize** for the knowledge
base. No queues, no KV, no infrastructure-as-code. 506 source files, ~101k lines.

Limits looked up live from Cloudflare's docs on **14 August 2026** (not from memory —
a remembered limit that has changed invalidates the whole review):

| limit | value | where it bites in this codebase |
|---|---|---|
| D1 max database size | **10 GB** | the ceiling the whole sharding machinery exists for; `ALERT_THRESHOLD_BYTES` is 80% of it |
| D1 **bound parameters per statement** | **100** | four statements were over it; §4.1 |
| D1 max SQL statement length | 100 KB | already respected (`CHUNK_WRITE_BATCH`) |
| D1 max SQL query duration | **30 s** | what killed the mover's unbounded `DELETE`; §4.4 |
| D1 databases per account | 50,000 | the size scan goes blind at **10,000** (`D1_LIST_PAGE_CAP × 100`) |
| Worker memory | **128 MB** | a 25 MB base64 upload allocates ~110 MB of it; §5.2 |
| Worker subrequests / invocation | 10,000 (paid) | 200 teams × 500 digest emails = 100,000 |
| **Simultaneous outgoing connections** | **6** | the real reason `Promise.all` over 500 sends does not parallelise; §4.6 |
| Cron trigger duration | **15 min** (CPU 30 s under an hour's interval) | what the digest fan-out overran |
| Durable Object soft request ceiling | **~1,000 req/s per object** | the fan-out wall; §5.1 |
| DO max WebSocket connections | **not published** | so §5.1 is argued from the request ceiling and per-broadcast CPU, not from a connection cap |

**Isolates change the shape of the review.** Capacity arrives in milliseconds, D1 is
HTTP-native so there is no connection pool to exhaust, and there is nothing expensive
to hoist per instance. Dimension 11 is therefore near-free here and four of its good
signals are **N/A** rather than missing — see §3.

---

## 2 · The yardstick, answered on both levels

> Any single tenant may reach **250,000 people**, ~10% peak concurrency (**25,000
> simultaneous sessions in one tenant**), five years of history (largest tables in the
> **tens of millions of rows**), power users holding one tab open all day — **and the
> app hosts dozens of such tenants** alongside a long tail.

**Across tenants (level 1): it holds, and it now holds for a reason rather than by
luck.** Every tenant gets a real D1 database, so the per-tenant data path genuinely
scales sideways to the platform's 50,000-database limit. The exposure is everything
*shared*: the core database carries users, sessions, memberships, error logs and usage
for every tenant at once, inside one 10 GB ceiling, with no split path. Before this
review its retention sweep removed 5,000 rows a night against a sign-in volume of
hundreds of thousands a day — arithmetic pointing one way, under a green cron. That is
fixed (§4.5). Two things starve it still: the shared database has no shard story of its
own, and the crons that serve tenants were visiting the same 200 teams for ever (§4.3).

**Inside one tenant (level 2): the live layer fails first, and it fails by a factor of
about a hundred.** Everything else in one tenant is genuinely fine at the yardstick —
per-team D1, keyset paging, bounded reads, atomic counters. But **one Durable Object
per team broadcasts serially to every open socket**, and every mutation publishes (R1).
At 25,000 sockets a single broadcast is a half-second to a second of single-threaded
work; at the yardstick's mutation rate (~170/s average, higher at peak) the object
needs one to two hundred seconds of CPU per second. Cloudflare's own soft ceiling for
one object is ~1,000 requests/s and the publish rate alone approaches it. **This is a
Tier C, ARCHITECTURE.md-locked item and it is untouched — see §6.1.**

---

## 3 · Scorecard

`coverage = good_signals_present / good_signals_applicable` ·
`penalty = Σ (blocker 25 | major 12 | minor 4)` ·
`dimension = clamp(0,100, round(100 × coverage − penalty))` ·
`total = round(Σ (dimension × weight) / 100)`

| # | dimension | w | before | after | Δ | after arithmetic |
|---|---|---|---|---|---|---|
| 1 | Data partitioning & sharding | 12 | 63 | **76** | +13 | 4/4 = 100 − (major 12 + major 12) |
| 2 | Query shape & indexing | 13 | 19 | **88** | +69 | 3/3 = 100 − major 12 |
| 3 | Endpoint contract stability | 7 | 88 | **88** | 0 | 4/4 = 100 − major 12 |
| 4 | Growth triggers & headroom | 8 | 59 | **84** | +25 | 4/4 = 100 − (major 12 + minor 4) |
| 5 | Client data volume & lazy loading | 9 | 63 | **75** | +12 | 3/4 = 75 − 0 |
| 6 | Client cache freshness & bounds | 9 | 35 | **100** | +65 | 5/5 = 100 − 0 |
| 7 | Surge self-protection | 6 | 36 | **68** | +32 | 4/5 = 80 − major 12 |
| 8 | Sequential, atomic & contended ops | 11 | 100 | **100** | 0 | 4/4 = 100 − 0 |
| 9 | Write fan-out & realtime | 7 | 0 | **0** | 0 | 1/3 = 33 − (blocker 25 + major 12) → clamped |
| 10 | Bulk paths, migrations & lifecycle | 5 | 43 | **92** | +49 | 3/3 = 100 − (minor 4 + minor 4) |
| 11 | Elastic response time | 5 | 100 | **100** | 0 | 2/2 = 100 − 0 (4 signals N/A on isolates) |
| 12 | File & object storage | 8 | 36 | **51** | +15 | 6/9 = 67 − (major 12 + minor 4) |

**Before:** (12·63 + 13·19 + 7·88 + 8·59 + 9·63 + 9·35 + 6·36 + 11·100 + 7·0 + 5·43 +
5·100 + 8·36) / 100 = 5292/100 = **53**

**After:** (12·76 + 13·88 + 7·88 + 8·84 + 9·75 + 9·100 + 6·68 + 11·100 + 7·0 + 5·92 +
5·100 + 8·51) / 100 = 7795/100 = **78**

Dimension 11's N/A signals: warm/minimum capacity, autoscaling configuration,
connection pooling, and per-instance setup reuse. None can exist on isolates against
HTTP-native stores; counting them as missing would be scoring a different platform.

**A caveat that qualifies every number above:** nothing in this codebase measures p95
latency per endpoint. Every performance claim here is derived from code shape, row
counts and published platform limits — not from observation.

---

## 4 · What was repaired

All 12 changes below are in the working tree on `audit/scaling`. `npm run check` exits
**0**: lint clean, TypeScript clean across all 10 workspaces, **1,686 tests pass**
(1,644 before — 42 new assertions across 6 new suites).

### 4.1 Four statements bound more parameters than D1 accepts — dim 2
`workers/content/test/d1-parameter-cap.test.ts` has guarded this exact shape since a
production 500, and it walked **one worker's `src`**. The same shape lived outside it
with worse bounds:

- **The account fence** (`shared/workers/account-scope.ts`) bound one parameter per
  account in reach — `SCOPE_HARD_CAP` is **500** — and `accountActivityClause` carried
  the set **three times in one statement**. So a client login standing at a company
  with 34 businesses nested under it could not read its own activity feed, and one with
  101 could not read anything at all. Not slow: a 500 on every fenced door.
- `withEmails` bound one per row of a list capped at `LIST_HARD_CAP` (**1,000**) — the
  client-login list for any company with 100+ people.
- The ticket-stakeholder lookup bound one per watcher, capped at **500**.
- `ROOTS_SQL` (the portal switcher) had **no `LIMIT` at all** — an unbounded read
  feeding an unbounded parameter list.

Every local suite passed all four, because local SQLite's limit is **999** — a harness
ten times more permissive than the thing it stands in for.

**Fixed:** the fence renders its server-owned ids through `sqlString` (the pattern that
suite already prescribes); the two core-DB lookups batch under a new
`idBatches()`/`D1_MAX_BOUND_PARAMS` seam; `ROOTS_SQL` gets `PORTAL_ROOTS_CAP` (50);
and the guard now walks **`shared/` plus every worker's `src`**, keyed by file as well
as variable.

### 4.2 The activity feed had no index for its own paging — dim 2
`activity` is the fastest-growing table in a team database by construction (R1 + R18),
so at the yardstick it is the tens-of-millions one. It has paged by keyset since R14 —
`ORDER BY created_at DESC, id DESC` — and its only index since `0001` led with
`related_table`. The record scope was indexed; **the team scope, the feed everybody
opens, was not.** Every page scanned and sorted the whole table to return fifty rows,
and page two paid it again. `meetings` has carried exactly this index for exactly this
reason since `0021`.

**Fixed:** team migration `0023_activity_feed_index` adds
`(created_at DESC, id DESC)` and `(related_table, created_at DESC, id DESC)`.

Also: `sessions` — the biggest, fastest-growing table in the *shared* database — had no
index on `expires_at`, the predicate its nightly sweep selects on. The sweep meant to
keep that database under 10 GB was full-scanning the largest thing in it, every night.
`db/core/0021` adds it, plus `error_logs (at)` for §4.5.

### 4.3 Both crons starved every tenant past the 200th — dim 10
The knowledge sweep and the morning digest each read
`ORDER BY id LIMIT CRON_TEAM_CAP` and each said, in a comment, that the rest "wait for
the next tick". They did not: the order never changed and neither did the window, so
the same 200 teams were served on every fire and **every team past the 200th got
nothing — not late, never.** Team ids are ULIDs, so "the first 200 by id" is "the 200
oldest": the newest tenants were the starved ones.

**Fixed:** one `teamSlice()` helper rotates the window from `controller.scheduledTime ÷
the tick's own period`, modulo the number of windows — bounded work per tick, no state,
no migration, deterministic on a re-fire, and it `console.warn`s the lap length so
"late" is visible. The honest cost is named in `OPERATIONS.md`: past one window the
sweep's lap is 15 min × N and **the digest's is N days**, which is not a daily digest
and wants a work queue (§6.4).

### 4.4 The one relief valve could not survive the size it exists for — dim 1
`moveModuleToOwnDatabase` is what an 80% alarm tells you to run, so it only ever sees a
table too big for its database. Two steps could not survive that:

- the copy paged `LIMIT 250 OFFSET n` — quadratic reads on the very table this tool is
  for, and a window that shifts under a concurrent write (rows copied twice or skipped,
  discovered only by the count check afterwards);
- the emptying was one `DELETE FROM <table>;`. **D1 refuses a statement past 30
  seconds**, so on a multi-million-row table that DELETE was the step guaranteed to
  fail — *after* the routing flip had committed. Routing flipped means every read is a
  merged read over both databases, so a row left behind is a row **returned twice**: a
  doubled list, a doubled count, doubled money, and nothing saying so.

**Fixed:** the copy walks the primary key forward (`WHERE id > ? ORDER BY id`); the
emptying runs `RETENTION_DELETE_CAP`-sized deletes, counts what remains, and **throws
`move_drain_incomplete` naming the table and the database still holding rows** rather
than leaving silent duplicates. It is still one non-resumable request — see §6.2.

### 4.5 The retention sweep could not keep up, and the error log had none — dim 10
`RETENTION_DELETE_CAP` bounds a **statement**, which is the right unit — a statement is
what times out. It is not the right unit for a **night**, and only the first existed.
5,000 rows a night against a database taking sign-ins from every tenant is not
retention; at the yardstick the tables grew monotonically while a green cron reported
success. Separately, `error_logs` had been documented as a "90-day-ish owned history"
since `db/core/0012` with **nothing ever deleting a row** — a rate ceiling bounds how
fast a store fills, never how full it gets.

**Fixed:** `RETENTION_PASSES_PER_TICK` (40) bounded statements per table per night,
stopping the moment one comes back short — 200,000 rows/table/night, no statement any
bigger than the one that already worked. `error_logs` joins the sweep at
`ERROR_LOG_RETENTION_DAYS` (90), implementing the window its own migration already
claimed. **The audit tables were deliberately left alone** — see §6.5.

### 4.6 The morning digest could not finish — dim 7
`Promise.all` over up to 500 team members, inside a loop over up to 200 teams, in one
cron invocation: 100,000 email subrequests against a 10,000 cap. And `Promise.all` does
not parallelise them — **a Worker has six simultaneous outgoing connections**, so 494
queue behind six. 500 sends at ~200 ms, six at a time, is ~17 s for *one* team; ×200
teams is ~56 minutes against a **15-minute** cron limit. It died partway, every day.

**Fixed:** one `sendToMany()` seam — concurrency matched to the platform's own six, a
`SEND_FAN_CAP` (100) per call, and recipients past the cap **dropped and named** rather
than silently trimmed. All four fan-out sites route through it.

### 4.7 The client cache was unbounded, unexpiring and never cleared — dim 6
`shared/web/store.ts` was a plain `Map` that only ever grew. CACHING.md said it was
"cleared on sign-out / team switch (different keys)" and neither half was true: nothing
cleared it, and *different keys* is not *dropped keys*. The user that document is
written for keeps one tab open all day, so a morning accumulated every list ever opened
(up to `LIST_HARD_CAP` rows each) plus every page `loadMore` had appended — and a
signed-out tab could still paint a member list out of memory.

**Fixed:** three ceilings (`MAX_CACHED_KEYS` 120, `MAX_CACHED_ROWS` 20,000,
`MAX_CACHE_AGE_MS` 10 min), LRU eviction that **never takes a subscribed key** (that
would blank a live list), age measured from the write, and `clearCache()` at all three
identity boundaries — sign-out, team switch, company switch.

The portal's company switch previously named **nine cache keys one at a time**, each
added after somebody noticed a stale screen. That is the hand-kept-list shape R21 has
been bitten by twice; it is now one `clearCache()`, and its test was rewritten to lock
the stronger invariant (*no* `cacheKeys.` in the switch body) rather than to re-derive
the list.

### 4.8 `loadMore` accumulated for ever — dim 5
R14 caps what one request returns; nothing capped what a *session* accumulated, and
appending is the whole point of `<LoadMore>`. **Fixed:** `CLIENT_PAGE_ROWS_CAP` (1,000)
on both front ends, checked before the fetch, with the button replaced by a sentence at
the ceiling — a disabled Load-more reads as a bug, and there *is* more; this is the
wrong tool for reaching it.

### 4.9 The merged read path would page, sort and count wrongly — dim 3
`d1QueryAcross` concatenates per-shard answers. Right for "give me the rows", quietly
wrong for three shapes that all *look* correct while there is one database — which is
every environment until the mover runs: `LIMIT n` returns the top n **of each** shard
and hands `toPage` a cursor that is a position in no shard's ordering (page two repeats
and skips); `ORDER BY` is sorted within shards and unsorted between them; `COUNT(…)`
returns one row per shard and **every caller here reads `rows[0].n`**, so R16's *exact*
count would report the first shard's total as the whole.

**Fixed as a tripwire, not as a solution:** it now **throws** on all three when handed
more than one database. One database is untouched — that is every read today. Making it
correct is §6.3.

### 4.10 `/media/*` was not seekable or resumable — dim 12
`serveMedia` read whole objects and answered 200, with no `Accept-Ranges` and no
handling of `Range:`. An attachment may be a 25 MB video (the upload door's own cap), so
dragging a scrub bar re-downloaded from byte zero and an interrupted download restarted.
**Fixed:** `Accept-Ranges: bytes`, a single-byte-range parser covering all three askable
forms, and 206 + `Content-Range` describing **what was sent** (R2 may narrow a request).
A range it cannot understand is served whole with a 200 — never a 206 describing bytes
nobody asked for. Key validation still runs first: a probe never reaches the bucket.

### 4.11 "How long have I got" had no answer — dim 4
80% of a cap is a **position, not a warning**. Two databases at 8.1 GB raise the
identical alarm and are in completely different trouble — one having sat there a year,
the other having crossed 6 GB last week. The mover takes a while and needs a person, and
nothing recorded the two readings a rate needs.

**Fixed:** `db/core/0022` adds `db_growth` — **one row per database, not one per night**
(a sample table would make the growth watch the thing that grows), holding tonight's
reading beside the previous one, shifted **inside one upsert** so there is no
read-then-write to race. The **interval is stored, not assumed**, because a rate against
a presumed 24 hours is wrong exactly when the cron has been late. `daysUntilFull()`
measures headroom from the **cap**, not from the alarm line, and returns **null** rather
than a number when it cannot answer honestly. Surfaced as `filling` on the owner-gated
`db-sizes` read, soonest first; bounded at `CRON_GROWTH_CAP` (200), biggest first;
written on quiet nights too; and wrapped so a failed reading can never cost somebody the
alarm that a database is nearly full.

### 4.12 Documentation — part of the repair, not an afterthought
- **CACHING.md** — rule 9 rewritten with the three ceilings, the eviction rule, and the
  `clearCache()` boundary; rule 12 gains `CLIENT_PAGE_ROWS_CAP`.
- **DATA-MODEL.md** — `activity`'s indexes and why; the retention table gains
  `error_logs`, the statement-vs-night distinction, and the "every predicate has an
  index" rule; the new `db_growth` section.
- **EDGE-CASES.md §10** — the three shapes a concatenation cannot answer, and the
  mover's two failures.
- **OPERATIONS.md** — a new *Growth watch* section: five alarms, the number behind each,
  and what to do when one trips.

---

## 5 · What breaks first, and at what size

**The live layer, at roughly 3,000–5,000 concurrent sockets in one tenant.** One
`TeamChannel` Durable Object per team fans out serially to every open socket, and every
mutation publishes (R1). A broadcast costs (sockets × per-socket `deserializeAttachment`
+ fence check); at 25,000 sockets that is ~0.5–1.25 s of single-threaded work, against a
mutation rate at the yardstick of ~170/s average. The object needs 100–200× the CPU it
has, and Cloudflare's soft ceiling for one object (~1,000 req/s) is reached by the
publish rate alone.

### The ceiling ladder

**Inside one tenant** — today → 250,000 people:

| rung | what breaks | dimension |
|---|---|---|
| ~500 sockets | nothing. Comfortable. | — |
| ~3,000 sockets | broadcast latency becomes visible; pings arrive seconds late | 9 |
| ~10,000 sockets | the DO cannot keep up with the publish rate; live sync silently degrades to "reload to see it" | 9 |
| ~25,000 sockets | past the object's soft request ceiling — **the yardstick is not reachable without a topology change** | 9 |
| ~5M activity rows | the R16 `COUNT(*)` on every feed page becomes the slowest query in the app (an index scan now, not a table scan) | 2 |
| ~8 GB in a team DB | the alarm fires; the mover is the only answer and is one long non-resumable request | 1, 4 |
| ~25 MB attachments | already at the edge of a 128 MB isolate, on the request path | 12 |

**Across tenants** — today → dozens of large tenants:

| rung | what breaks | dimension |
|---|---|---|
| ~200 teams | the crons start lapping; the *daily* digest becomes every-N-days | 10 |
| ~1,000 teams | the digest is a weekly at best; needs a queue | 10 |
| ~8 GB in core | no shard path for the shared database — the one ceiling with no relief valve | 1 |
| ~10,000 databases | the nightly size scan goes blind (platform allows 50,000) | 4 |
| any tenant with an unswept estate | now catches up in a few nights instead of never | 10 ✔ |

---

## 6 · What I judged too risky to change

Each of these is either a locked decision, a Law, or an observable-contract change. All
are written up so the next person starts from a plan rather than a discovery.

### 6.1 The realtime fan-out topology — **Tier C, and the whole first ceiling**
One DO per team, broadcasting serially, unscoped by subscription (every socket receives
every team ping subject only to the account fence). Both the blocker and the major in
dimension 9 are here, and fixing it means changing DO topology — which ARCHITECTURE.md
locks and CLAUDE.md says not to relitigate without the owner.

*The plan.* (a) **Shard the channel**: `team:<id>:<bucket>` over N objects, with the
publisher writing to all N and each holding ~1/N of the sockets. Broadcast cost per
object falls by N; publish cost rises by N. Contract unchanged — the client's socket URL
gains a bucket it computes from its own session id. (b) **Scope by subscription**: the
client declares which resources its mounted screens read; the object filters on that
before `send`. Cuts per-message work by roughly the ratio of resources to screens, and
is the cheaper half to do first. (c) **Coalesce** under rapid change: a 50 ms window per
resource, so a bulk write is one ping rather than n. Rollback for all three: the socket
URL is versioned, so an old client keeps the old shape.

### 6.2 A resumable mover — **Tier C**
Now safe and no longer quadratic, but still one request copying a whole module. Making
it resumable means a job table, a progress cursor per table, and a cron or alarm to
drive it — new machinery with a decision about who owns it. Until then it is an
operator-run tool that may need re-running, and it now fails loudly instead of silently.

### 6.3 A real cross-shard merge — **Tier C**
The prerequisite for wiring any **paged** module onto the split path: a cursor token
encoding a position per shard, a merge sort over per-shard pages, and folding aggregates.
Today the seam refuses instead of answering wrongly, which is the right interim state.

### 6.4 A work queue for the crons — **Tier C**
Rotation turns "never" into "late", which is correct for a 15-minute sweep and wrong for
a *daily* digest past a few hundred teams. The real answer is Cloudflare Queues: one
message per team, consumers bounded by the platform. That adds a binding, a consumer
worker and a deploy-order change.

### 6.5 A retention window for the audit tables — **owner's decision, not mine**
`account_activity`, the per-team `activity` feed and the usage ledgers grow for ever in
the shared core database. They are rate-bounded and never swept, and `retention.ts` is
explicit that it never takes "anything anyone might have to answer for later". Choosing
how long a record somebody may be asked about is kept is a business decision. I swept
`error_logs` only because its own migration already named 90 days.

### 6.6 Delivering the alarms — **Tier B, needs a decision**
`db_alerts` and now `filling` land in a table and a `console.error`, readable through an
owner-gated route nobody polls. Until it is wired to an email or a page, "we have
alarms" means "we have a table". Who gets paged, and how, is an owner's call — the
mechanism (the branded sender in `auth`) already exists.

### 6.7 Per-caller rate limiting on ordinary doors — **Tier B**
Auth, the AI agent, the error log and account activity are all throttled. Ordinary reads
and writes are not: a signed-in member can hammer `GET /api/tenancy/activity?scope=team`
— whose R16 `COUNT(*)` is O(rows) — as fast as they like. The fix is Cloudflare's Rate
Limiting binding on both gateways, which means wrangler config on 8 workers, new 429
paths, and a decision about the limits. It changes observable behaviour, so it is the
owner's to approve.

### 6.8 Presigned direct-to-R2 uploads — **Tier C**
Every upload is a base64 data URL POSTed through the worker: a 25 MB attachment is ~33 MB
of base64 in the JSON body, plus the parsed string, plus the `atob` string, plus the
`Uint8Array` — well over 100 MB of allocation in a 128 MB isolate, on the request path.
Presigned direct-to-storage is the fix and it changes both the client contract and the
security model of a bucket whose keys *are* its credentials (SCOPE ch.06's recorded
capability-URL decision). That is an owner-level change.

### 6.9 R2 lifecycle rules and per-tenant object cleanup — **Tier B/C**
No lifecycle rule anywhere; a deactivated team's objects live for ever. Keys *are*
prefixed per tenant, so a prefixed delete is possible — but "deactivate, never delete"
means there is no flow that should be deleting them, and a lifecycle rule is bucket
config rather than code.

### 6.10 R16's exact `COUNT(*)` — **a Law of the Base**
The team activity feed runs an exact `COUNT(*)` on every page load. On a
tens-of-millions-row table that is O(n) per request, and it is the largest remaining
query cost in the app. R16 mandates it ("an exact server `COUNT(*)` through the one
`formatCount` seam"), so a cached or approximate count would need RULES.md, the registry
and the check changed together. The new composite index makes it an index-only scan
rather than a scan of the widest table — a large constant-factor win, not a complexity
one.

### 6.11 List virtualisation — **not this repo's to change**
Dimension 5's one missing signal. Primitives and collections come from `@kwapso/ui`,
which CLAUDE.md forbids editing from here. `CLIENT_PAGE_ROWS_CAP` bounds the damage
(1,000 rows, not 50,000); real virtualisation is a library change to surface upstream.

---

## 7 · Why 94 was not reachable

The gap from 78 to 94 is +16 total, or **+1,600 weighted points**. Here is every place
they could come from, with the tier of the work required:

| dimension | now | realistic ceiling | weighted gain | blocked by |
|---|---|---|---|---|
| 9 fan-out | 0 | ~90 | +630 | Tier C — DO topology (ARCHITECTURE.md locked) |
| 12 storage | 51 | ~90 | +312 | Tier C — presigned uploads change the client contract + SCOPE ch.06 |
| 1 partitioning | 76 | ~90 | +168 | Tier C — core database split, resumable mover |
| 2 queries | 88 | 100 | +156 | **a Law** — R16's exact count |
| 5 client volume | 75 | ~90 | +135 | `@kwapso/ui` — forbidden from here |
| 7 surge | 68 | ~90 | +132 | Tier B — rate-limiting bindings on 8 workers |
| 3 contract | 88 | 100 | +84 | Tier C — a real cross-shard merge |
| 4 headroom | 84 | ~96 | +96 | Tier B — alarm delivery (who gets paged) |

Sum of **every** item: ~+1,713 → about 95. So 94 requires doing essentially all of
them, and there is no subset that reaches it without at least one Tier C architectural
change or one Law amendment. Every point left on the table is a decision, not an
omission — which is why the score stops at 78 rather than the number being adjusted to
meet the target.

The cheapest genuine route to 94, in order of impact ÷ effort: **(1)** scope the
broadcast by subscription and shard `TeamChannel` (§6.1 — one change, +630, and it also
removes the app's first ceiling); **(2)** rate limiting (§6.7, +132, mostly config);
**(3)** alarm delivery (§6.6, +96, the sender already exists); **(4)** presigned uploads
(§6.8, +312). Those four alone reach ~89, and the rest follows from the sharding work.

---

## 8 · Files changed

**Migrations (new — must be applied before deploy):**
`db/core/0021_retention_scan_indexes.sql` · `db/core/0022_db_growth.sql` ·
team migration `0023_activity_feed_index` in `workers/tenancy/src/team-schema.ts`
(rolled by `POST /api/tenancy/admin/migrate-teams`).

**Shared seams:** `shared/workers/limits.ts` (`D1_MAX_BOUND_PARAMS`, `idBatches`,
`PORTAL_ROOTS_CAP`, `RETENTION_PASSES_PER_TICK`, `ERROR_LOG_RETENTION_DAYS`,
`CRON_GROWTH_CAP`) · `shared/workers/account-scope.ts` · `shared/workers/d1-rest.ts` ·
`shared/workers/retention.ts` · `shared/workers/front-door.ts` · `shared/web/store.ts`

**Workers:** `workers/tenancy/src/lib/sharding.ts` ·
`workers/tenancy/src/lib/accounts.ts` · `workers/tenancy/src/routes/accounts.ts` ·
`workers/tenancy/src/routes/admin.ts` · `workers/tenancy/src/team-schema.ts` ·
`workers/content/src/index.ts` · `workers/content/src/lib/notify.ts` ·
`workers/content/src/lib/stakeholders.ts` · `workers/gateway/src/index.ts` ·
`workers/portal-gateway/src/index.ts`

**Front ends:** `web/lib/live-resources.ts` · `web/lib/use-active-team.ts` ·
`web/components/load-more.tsx` · `web-portal/lib/tickets.ts` ·
`web-portal/components/account-switcher.tsx` · `web-portal/components/portal-shell.tsx` ·
`web-portal/components/no-access.tsx`

**Tests (6 new):** `web/test/cache-bounds.test.ts` ·
`workers/content/test/cron-rotation.test.ts` ·
`workers/gateway/test/media-range.test.ts` · `workers/tenancy/test/db-growth.test.ts` ·
`workers/tenancy/test/merged-read-guard.test.ts` ·
`workers/tenancy/test/mover-drain.test.ts`
**(3 updated):** `workers/content/test/d1-parameter-cap.test.ts` (widened repo-wide) ·
`workers/tenancy/test/core-retention.test.ts` · `workers/tenancy/test/activity-scope.test.ts` ·
`web-portal/test/switcher-invalidation.test.ts`

**Docs:** `CACHING.md` · `DATA-MODEL.md` · `EDGE-CASES.md` · `OPERATIONS.md`

Nothing was deployed and nothing was pushed. `@kwapso/ui`, `glide/` and
`.session-notes/` were not touched.
