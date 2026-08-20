# scaling-review.md. Brimba / kwapso, 14 August 2026

Every number below is recomputable from this file plus
`~/.claude/skills/scaling_review/assets/rubric.md`.

**Score: 53 → 78 / 100.** The acceptance target was 94. It was not reached, and the
reason is not a shortage of effort: **every remaining point is behind a locked
architectural decision, a Law of the Base, or an endpoint-contract change.** The
arithmetic for that claim is in §7. Nothing below moves a number by redefining what
it measures.

> ## DIMENSION 9 WAS REOPENED AND PARTLY CLOSED, 79 → 85
>
> The owner reversed the acceptance on 14 Aug 2026 and asked for 94. The live layer's
> channel is now **split across 4 objects with subscription scoping** (§4.13), which
> takes dimension 9 from **0 to 84** and the total to **85**. The per-team listener
> ceiling moved from ~3,000–5,000 to ~12,000–20,000.
>
> **And measuring it properly showed 94 is not reachable, for arithmetic reasons rather
> than permission ones.** My own "~90" ceiling for dimension 9 in §7 was optimistic:
> sharding divides the work by N, so a 250,000-person tenant needs ~128 shards and at
> that point the publish side becomes the bottleneck. Detail and the table in §4.13.
> Every remaining ceiling in §7 is an *estimate* of the same kind, so treat that table
> as a direction, not a promise.
>
> ## THE EARLIER FRAMING, kept because the reasoning still holds for this deployment
>
> **[ARCHITECTURE.md §7](ARCHITECTURE.md) (LOCKED 2026-08-14)** records the score as
> accepted for THIS deployment (78 when it was written; 79 since alarm delivery landed,
> which changes nothing about the decision): what the limiting decision is, the load it actually
> carries, and the three signals that mean it is time to revisit. The short version:
> the ceiling is ~3,000–5,000 concurrent sockets on one team channel, and kwapso, one
> agency, 20 client companies, 104 contacts, 6 staff, peaks around **40**.
>
> §7 of THIS file (the +1,713 arithmetic) is now evidence for a decision that has been
> made, not a to-do list. Do not re-derive it. Two items are genuinely still open and
> named as such in §6.6 and §6.7.
>
> **The acceptance is about kwapso, not about Brimba.** A fork whose one tenant is a
> company rather than an agency will hit the same ceiling for real. BASE-MANUAL §5.

---

## 0 · Re-measured against `main`, 14 August 2026

Re-run after the branch merged and three further features landed (knowledge files,
agent drawings, the R2 backup). **78 holds. No dimension moved.** 527 source files
now (was 506); `npm run check` exits 0 with 1,754 tests (was 1,686).

**Dimension 12 was checked specifically, because the R2 backup work
(`33e08db`) landed since the first run. It does not move: 51.** The backup makes the
bucket its own inventory and cross-checks every key a database row names, a real
gain, and a *recoverability* property, which is
[architecture_review](RESILIENCE.md)'s dimension and not one of this rubric's ten
storage signals (presigned upload · multipart · no bucket listing on a user-facing
path · tenant key prefix · no hot prefix · metadata in the database · objects cached ·
lifecycle rules · streamed to storage · range reads). Specifically:

- The bucket listing it adds is in `scripts/backup.mjs`, not on a request path, and it
  is cursor-followed to the last page and **throws** rather than returning a partial
  list. The rubric penalises bucket listing *on a user-facing path*; this is the
  legitimate use.
- It lists **whole buckets, not by prefix**, so the minor still stands unchanged: a
  deactivated team's objects still accumulate for ever and there is still no lifecycle
  rule. What the backup proves is that enumeration *works*, not that anything reclaims.
- The new leading-wildcard `LIKE` and the new query-in-a-loop the scanner flags are
  both in the same script, a once-per-backup reconciliation, not a search endpoint.

Also checked and unchanged: the new **knowledge-files upload** is another instance of
the same base64-through-the-worker major at the same 25 MB cap, so dimension 12's major
neither deepens nor multiplies (it was always about the pattern, not one route). It is
in one way better than its siblings, the request envelope is checked against
`Content-Length` *before* the body is parsed, but that is the `timeout` signal, which
was already present. The knowledge-files migration adds columns to an existing table,
so it introduces no new growing table and no new unindexed sort. My own repairs are all
present on `main` (migrations renumbered to `0021_retention_scan_indexes`,
`0022_db_growth`, and team `0023_activity_feed_index`).

---

## 1 · The platform, and the limits that bind

Cloudflare Workers (serverless isolates) · one **D1** database per team over the REST
door + one global core D1 on a native binding · **R2** for files · one **Durable
Object** class (`TeamChannel`) for the live layer · **Vectorize** for the knowledge
base. No queues, no KV, no infrastructure-as-code. 506 source files, ~101k lines.

Limits looked up live from Cloudflare's docs on **14 August 2026** (not from memory,
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
signals are **N/A** rather than missing. See §3.

---

## 2 · The yardstick, answered on both levels

> Any single tenant may reach **250,000 people**, ~10% peak concurrency (**25,000
> simultaneous sessions in one tenant**), five years of history (largest tables in the
> **tens of millions of rows**), power users holding one tab open all day, **and the
> app hosts dozens of such tenants** alongside a long tail.

**Across tenants (level 1): it holds, and it now holds for a reason rather than by
luck.** Every tenant gets a real D1 database, so the per-tenant data path genuinely
scales sideways to the platform's 50,000-database limit. The exposure is everything
*shared*: the core database carries users, sessions, memberships, error logs and usage
for every tenant at once, inside one 10 GB ceiling, with no split path. Before this
review its retention sweep removed 5,000 rows a night against a sign-in volume of
hundreds of thousands a day, arithmetic pointing one way, under a green cron. That is
fixed (§4.5). Two things starve it still: the shared database has no shard story of its
own, and the crons that serve tenants were visiting the same 200 teams for ever (§4.3).

**Inside one tenant (level 2): the live layer fails first, and it fails by a factor of
about a hundred.** Everything else in one tenant is genuinely fine at the yardstick,
per-team D1, keyset paging, bounded reads, atomic counters. But **one Durable Object
per team broadcasts serially to every open socket**, and every mutation publishes (R1).
At 25,000 sockets a single broadcast is a half-second to a second of single-threaded
work; at the yardstick's mutation rate (~170/s average, higher at peak) the object
needs one to two hundred seconds of CPU per second. Cloudflare's own soft ceiling for
one object is ~1,000 requests/s and the publish rate alone approaches it. **This is a
Tier C, ARCHITECTURE.md-locked item and it is untouched. See §6.1.**

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
| 4 | Growth triggers & headroom | 8 | 59 | **96** | +37 | 4/4 = 100 − minor 4, delivery landed 14 Aug, §6.6 |
| 5 | Client data volume & lazy loading | 9 | 63 | **75** | +12 | 3/4 = 75 − 0 |
| 6 | Client cache freshness & bounds | 9 | 35 | **100** | +65 | 5/5 = 100 − 0 |
| 7 | Surge self-protection | 6 | 36 | **68** | +32 | 4/5 = 80 − major 12 |
| 8 | Sequential, atomic & contended ops | 11 | 100 | **100** | 0 | 4/4 = 100 − 0 |
| 9 | Write fan-out & realtime | 7 | 0 | **84** | +84 | 3/3 = 100 − (major 12 + minor 4). See §4.13 |
| 10 | Bulk paths, migrations & lifecycle | 5 | 43 | **92** | +49 | 3/3 = 100 − (minor 4 + minor 4) |
| 11 | Elastic response time | 5 | 100 | **100** | 0 | 2/2 = 100 − 0 (4 signals N/A on isolates) |
| 12 | File & object storage | 8 | 36 | **51** | +15 | 6/9 = 67 − (major 12 + minor 4) |

**Before:** (12·63 + 13·19 + 7·88 + 8·59 + 9·63 + 9·35 + 6·36 + 11·100 + 7·0 + 5·43 +
5·100 + 8·36) / 100 = 5292/100 = **53**

**After:** (12·76 + 13·88 + 7·88 + 8·96 + 9·75 + 9·100 + 6·68 + 11·100 + 7·**84** + 5·92 +
5·100 + 8·51) / 100 = 8479/100 = **85**

The +1 over the re-measured 78 is dimension 4's alarm delivery, shipped after the
re-measure (§6.6). **It does not move the accepted ceiling**: ARCHITECTURE.md §7 is about
the fan-out topology, and 79 is the same decision as 78, the gap is still ~+1,600
weighted and still concentrated in the locked +630.

Dimension 11's N/A signals: warm/minimum capacity, autoscaling configuration,
connection pooling, and per-instance setup reuse. None can exist on isolates against
HTTP-native stores; counting them as missing would be scoring a different platform.

**A caveat that qualifies every number above:** nothing in this codebase measures p95
latency per endpoint. Every performance claim here is derived from code shape, row
counts and published platform limits, not from observation.

---

## 4 · What was repaired

All 12 changes below are in the working tree on `audit/scaling`. `npm run check` exits
**0**: lint clean, TypeScript clean across all 10 workspaces, **1,686 tests pass**
(1,644 before, 42 new assertions across 6 new suites).

### 4.1 Four statements bound more parameters than D1 accepts, dim 2
`workers/content/test/d1-parameter-cap.test.ts` has guarded this exact shape since a
production 500, and it walked **one worker's `src`**. The same shape lived outside it
with worse bounds:

- **The account fence** (`shared/workers/account-scope.ts`) bound one parameter per
  account in reach. `SCOPE_HARD_CAP` is **500**, and `accountActivityClause` carried
  the set **three times in one statement**. So a client login standing at a company
  with 34 businesses nested under it could not read its own activity feed, and one with
  101 could not read anything at all. Not slow: a 500 on every fenced door.
- `withEmails` bound one per row of a list capped at `LIST_HARD_CAP` (**1,000**), the
  client-login list for any company with 100+ people.
- The ticket-stakeholder lookup bound one per watcher, capped at **500**.
- `ROOTS_SQL` (the portal switcher) had **no `LIMIT` at all**, an unbounded read
  feeding an unbounded parameter list.

Every local suite passed all four, because local SQLite's limit is **999**, a harness
ten times more permissive than the thing it stands in for.

**Fixed:** the fence renders its server-owned ids through `sqlString` (the pattern that
suite already prescribes); the two core-DB lookups batch under a new
`idBatches()`/`D1_MAX_BOUND_PARAMS` seam; `ROOTS_SQL` gets `PORTAL_ROOTS_CAP` (50);
and the guard now walks **`shared/` plus every worker's `src`**, keyed by file as well
as variable.

### 4.2 The activity feed had no index for its own paging, dim 2
`activity` is the fastest-growing table in a team database by construction (R1 + R18),
so at the yardstick it is the tens-of-millions one. It has paged by keyset since R14.
`ORDER BY created_at DESC, id DESC`, and its only index since `0001` led with
`related_table`. The record scope was indexed; **the team scope, the feed everybody
opens, was not.** Every page scanned and sorted the whole table to return fifty rows,
and page two paid it again. `meetings` has carried exactly this index for exactly this
reason since `0021`.

**Fixed:** team migration `0023_activity_feed_index` adds
`(created_at DESC, id DESC)` and `(related_table, created_at DESC, id DESC)`.

Also: `sessions`, the biggest, fastest-growing table in the *shared* database, had no
index on `expires_at`, the predicate its nightly sweep selects on. The sweep meant to
keep that database under 10 GB was full-scanning the largest thing in it, every night.
`db/core/0021` adds it, plus `error_logs (at)` for §4.5.

### 4.3 Both crons starved every tenant past the 200th, dim 10
The knowledge sweep and the morning digest each read
`ORDER BY id LIMIT CRON_TEAM_CAP` and each said, in a comment, that the rest "wait for
the next tick". They did not: the order never changed and neither did the window, so
the same 200 teams were served on every fire and **every team past the 200th got
nothing, not late, never.** Team ids are ULIDs, so "the first 200 by id" is "the 200
oldest": the newest tenants were the starved ones.

**Fixed:** one `teamSlice()` helper rotates the window from `controller.scheduledTime ÷
the tick's own period`, modulo the number of windows, bounded work per tick, no state,
no migration, deterministic on a re-fire, and it `console.warn`s the lap length so
"late" is visible. The honest cost is named in `OPERATIONS.md`: past one window the
sweep's lap is 15 min × N and **the digest's is N days**, which is not a daily digest
and wants a work queue (§6.4).

### 4.4 The one relief valve could not survive the size it exists for, dim 1
`moveModuleToOwnDatabase` is what an 80% alarm tells you to run, so it only ever sees a
table too big for its database. Two steps could not survive that:

- the copy paged `LIMIT 250 OFFSET n`, quadratic reads on the very table this tool is
  for, and a window that shifts under a concurrent write (rows copied twice or skipped,
  discovered only by the count check afterwards);
- the emptying was one `DELETE FROM <table>;`. **D1 refuses a statement past 30
  seconds**, so on a multi-million-row table that DELETE was the step guaranteed to
  fail, *after* the routing flip had committed. Routing flipped means every read is a
  merged read over both databases, so a row left behind is a row **returned twice**: a
  doubled list, a doubled count, doubled money, and nothing saying so.

**Fixed:** the copy walks the primary key forward (`WHERE id > ? ORDER BY id`); the
emptying runs `RETENTION_DELETE_CAP`-sized deletes, counts what remains, and **throws
`move_drain_incomplete` naming the table and the database still holding rows** rather
than leaving silent duplicates. It is still one non-resumable request. See §6.2.

### 4.5 The retention sweep could not keep up, and the error log had none, dim 10
`RETENTION_DELETE_CAP` bounds a **statement**, which is the right unit, a statement is
what times out. It is not the right unit for a **night**, and only the first existed.
5,000 rows a night against a database taking sign-ins from every tenant is not
retention; at the yardstick the tables grew monotonically while a green cron reported
success. Separately, `error_logs` had been documented as a "90-day-ish owned history"
since `db/core/0012` with **nothing ever deleting a row**, a rate ceiling bounds how
fast a store fills, never how full it gets.

**Fixed:** `RETENTION_PASSES_PER_TICK` (40) bounded statements per table per night,
stopping the moment one comes back short, 200,000 rows/table/night, no statement any
bigger than the one that already worked. `error_logs` joins the sweep at
`ERROR_LOG_RETENTION_DAYS` (90), implementing the window its own migration already
claimed. **The audit tables were deliberately left alone**. See §6.5.

### 4.6 The morning digest could not finish, dim 7
`Promise.all` over up to 500 team members, inside a loop over up to 200 teams, in one
cron invocation: 100,000 email subrequests against a 10,000 cap. And `Promise.all` does
not parallelise them, **a Worker has six simultaneous outgoing connections**, so 494
queue behind six. 500 sends at ~200 ms, six at a time, is ~17 s for *one* team; ×200
teams is ~56 minutes against a **15-minute** cron limit. It died partway, every day.

**Fixed:** one `sendToMany()` seam, concurrency matched to the platform's own six, a
`SEND_FAN_CAP` (100) per call, and recipients past the cap **dropped and named** rather
than silently trimmed. All four fan-out sites route through it.

### 4.7 The client cache was unbounded, unexpiring and never cleared, dim 6
`shared/web/store.ts` was a plain `Map` that only ever grew. CACHING.md said it was
"cleared on sign-out / team switch (different keys)" and neither half was true: nothing
cleared it, and *different keys* is not *dropped keys*. The user that document is
written for keeps one tab open all day, so a morning accumulated every list ever opened
(up to `LIST_HARD_CAP` rows each) plus every page `loadMore` had appended, and a
signed-out tab could still paint a member list out of memory.

**Fixed:** three ceilings (`MAX_CACHED_KEYS` 120, `MAX_CACHED_ROWS` 20,000,
`MAX_CACHE_AGE_MS` 10 min), LRU eviction that **never takes a subscribed key** (that
would blank a live list), age measured from the write, and `clearCache()` at all three
identity boundaries, sign-out, team switch, company switch.

The portal's company switch previously named **nine cache keys one at a time**, each
added after somebody noticed a stale screen. That is the hand-kept-list shape R21 has
been bitten by twice; it is now one `clearCache()`, and its test was rewritten to lock
the stronger invariant (*no* `cacheKeys.` in the switch body) rather than to re-derive
the list.

### 4.8 `loadMore` accumulated for ever, dim 5
R14 caps what one request returns; nothing capped what a *session* accumulated, and
appending is the whole point of `<LoadMore>`. **Fixed:** `CLIENT_PAGE_ROWS_CAP` (1,000)
on both front ends, checked before the fetch, with the button replaced by a sentence at
the ceiling, a disabled Load-more reads as a bug, and there *is* more; this is the
wrong tool for reaching it.

### 4.9 The merged read path would page, sort and count wrongly, dim 3
`d1QueryAcross` concatenates per-shard answers. Right for "give me the rows", quietly
wrong for three shapes that all *look* correct while there is one database, which is
every environment until the mover runs: `LIMIT n` returns the top n **of each** shard
and hands `toPage` a cursor that is a position in no shard's ordering (page two repeats
and skips); `ORDER BY` is sorted within shards and unsorted between them; `COUNT(…)`
returns one row per shard and **every caller here reads `rows[0].n`**, so R16's *exact*
count would report the first shard's total as the whole.

**Fixed as a tripwire, not as a solution:** it now **throws** on all three when handed
more than one database. One database is untouched, that is every read today. Making it
correct is §6.3.

### 4.10 `/media/*` was not seekable or resumable, dim 12
`serveMedia` read whole objects and answered 200, with no `Accept-Ranges` and no
handling of `Range:`. An attachment may be a 25 MB video (the upload door's own cap), so
dragging a scrub bar re-downloaded from byte zero and an interrupted download restarted.
**Fixed:** `Accept-Ranges: bytes`, a single-byte-range parser covering all three askable
forms, and 206 + `Content-Range` describing **what was sent** (R2 may narrow a request).
A range it cannot understand is served whole with a 200. Never a 206 describing bytes
nobody asked for. Key validation still runs first: a probe never reaches the bucket.

### 4.11 "How long have I got" had no answer, dim 4
80% of a cap is a **position, not a warning**. Two databases at 8.1 GB raise the
identical alarm and are in completely different trouble, one having sat there a year,
the other having crossed 6 GB last week. The mover takes a while and needs a person, and
nothing recorded the two readings a rate needs.

**Fixed:** `db/core/0022` adds `db_growth`, **one row per database, not one per night**
(a sample table would make the growth watch the thing that grows), holding tonight's
reading beside the previous one, shifted **inside one upsert** so there is no
read-then-write to race. The **interval is stored, not assumed**, because a rate against
a presumed 24 hours is wrong exactly when the cron has been late. `daysUntilFull()`
measures headroom from the **cap**, not from the alarm line, and returns **null** rather
than a number when it cannot answer honestly. Surfaced as `filling` on the owner-gated
`db-sizes` read, soonest first; bounded at `CRON_GROWTH_CAP` (200), biggest first;
written on quiet nights too; and wrapped so a failed reading can never cost somebody the
alarm that a database is nearly full.

### 4.13 The live channel is split, and listeners declare what they want, dim 9
**The owner reopened this on 14 Aug 2026** after accepting it earlier the same day. It
was the whole of dimension 9 and the app's first ceiling: one `TeamChannel` per team,
broadcasting serially to every socket, with every mutation publishing (R1).

**Two changes.** The channel is **split across `REALTIME_SHARDS` (4)** objects, and
listeners **declare which resources they want**.

- **The fan-out lives in the realtime worker's `/publish` door**, so a publisher still
  makes one call naming `team:<id>` and all hundred-odd `publishChange` sites are
  untouched. Written at the publisher it would have been a hundred chances to write it
  differently. Listeners join `shardFor(userId)`, so one person's devices land together
  and a reconnect returns to the same object. `user:` channels are not split, one
  person's devices are a handful, and splitting the most frequent ping in the product
  would multiply its cost to buy headroom nobody needs.
- **Subscriptions** ride the socket URL (`?sub=`), sit on the attachment beside the
  fence, and a broadcast skips a socket that did not ask for that resource. **The two
  filters fail in opposite directions on purpose**: the fence decides what may be heard
  (session-resolved, fails closed) and the subscription decides what was asked for
  (client-declared, fails open), which is exactly why one is safe to take from a
  request. A client on an older build sends no subscription and is over-served.
- **The portal narrows to 9 resources**, derived from `PORTAL_LISTENERS` so the two
  cannot drift. Its own comment had named the waste for months: "the team channel
  carries every module the agency uses, and most of them are none of the portal's
  business", and it received all of them and discarded most, at a cost paid inside a
  single-threaded object per socket per ping.
- **The agency app is deliberately NOT narrowed**, and this is the one place I chose not
  to take points. Its shell refreshes the activity feed on *any* resource, so a derived
  subscription would make that feed stale for everything outside the two listener maps.
  I could not prove a narrowing complete. `ACTIVITY_GATE_MAP`'s keys are activity
  `relatedTable` names, which are not publish resource names, and a narrowing that
  cannot be proved is a screen that goes quietly out of date. That is the remaining
  **minor**.

**My own test caught a bug in my own code**, which is worth recording: `Promise.allSettled`
does not settle a *synchronous* throw, so one shard failing sync escaped the whole loop
and 500'd a best-effort publish. An `async` arrow converts it to a rejection.

**WHERE THE CEILING ACTUALLY LANDED, and why this is a major rather than nothing.**
Wall-clock per broadcast falls by the shard count, so the per-team listener ceiling goes
from ~3,000–5,000 to **~12,000–20,000**. But the work is
`publishes/sec × sockets × per-socket cost`, and sharding divides only by N:

| shards | sockets/shard at 25,000 | CPU-seconds per second, per shard |
|---|---|---|
| 1 | 25,000 | ~130, over by 130× |
| **4 (today)** | **6,250** | **~33** |
| 8 | 3,125 | ~16 |
| 128 | 195 | ~1, and the publish side is now the bottleneck (~22,000 object calls/sec) |

So **sharding alone cannot reach a 250,000-person tenant and never will**: it needs ~128
shards, at which point the cost has moved rather than gone. Getting there needs a
different shape, routing a ping only to shards holding interested listeners instead of
broadcasting every ping to every shard. Not built, not planned; it is the thing to design
if a tenant ever approaches the yardstick. Hence dimension 9 scores **84, not ~90**: the
blocker is downgraded to a major, not removed.

For kwapso the answer is unambiguous: ~40 concurrent sockets at peak against
12,000–20,000. Locked by 20 new assertions in `workers/realtime/test/team-channel.test.ts`
and `web-portal/test/switcher-invalidation.test.ts`.

**Deploy risk, stated plainly.** The socket URL and the DO attachment both changed shape.
Local tests cover the logic against a stub; only a real deploy exercises the runtime.
Two things make it safe to roll: a socket carrying no subscription hears everything (so
an old client is unaffected), and `LISTENER_MAX_AGE_MS` is 15 minutes, so every
pre-existing socket reconnects onto the new shape within a quarter of an hour by itself.

### 4.12 Documentation, part of the repair, not an afterthought
- **CACHING.md**, rule 9 rewritten with the three ceilings, the eviction rule, and the
  `clearCache()` boundary; rule 12 gains `CLIENT_PAGE_ROWS_CAP`.
- **DATA-MODEL.md**, `activity`'s indexes and why; the retention table gains
  `error_logs`, the statement-vs-night distinction, and the "every predicate has an
  index" rule; the new `db_growth` section.
- **EDGE-CASES.md §10**, the three shapes a concatenation cannot answer, and the
  mover's two failures.
- **OPERATIONS.md**, a new *Growth watch* section: five alarms, the number behind each,
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

**Inside one tenant**, today → 250,000 people:

| rung | what breaks | dimension |
|---|---|---|
| ~500 sockets | nothing. Comfortable. |, |
| ~3,000 sockets | broadcast latency becomes visible; pings arrive seconds late | 9 |
| ~10,000 sockets | the DO cannot keep up with the publish rate; live sync silently degrades to "reload to see it" | 9 |
| ~25,000 sockets | past the object's soft request ceiling, **the yardstick is not reachable without a topology change** | 9 |
| ~5M activity rows | the R16 `COUNT(*)` on every feed page becomes the slowest query in the app (an index scan now, not a table scan) | 2 |
| ~8 GB in a team DB | the alarm fires; the mover is the only answer and is one long non-resumable request | 1, 4 |
| ~25 MB attachments | already at the edge of a 128 MB isolate, on the request path | 12 |

**Across tenants**, today → dozens of large tenants:

| rung | what breaks | dimension |
|---|---|---|
| ~200 teams | the crons start lapping; the *daily* digest becomes every-N-days | 10 |
| ~1,000 teams | the digest is a weekly at best; needs a queue | 10 |
| ~8 GB in core | no shard path for the shared database, the one ceiling with no relief valve | 1 |
| ~10,000 databases | the nightly size scan goes blind (platform allows 50,000) | 4 |
| any tenant with an unswept estate | now catches up in a few nights instead of never | 10 ✔ |

---

## 6 · What I judged too risky to change

Each of these is either a locked decision, a Law, or an observable-contract change. All
are written up so the next person starts from a plan rather than a discovery.

### 6.1 The realtime fan-out topology. **Tier C, and the whole first ceiling**
One DO per team, broadcasting serially, unscoped by subscription (every socket receives
every team ping subject only to the account fence). Both the blocker and the major in
dimension 9 are here, and fixing it means changing DO topology, which ARCHITECTURE.md
locks and CLAUDE.md says not to relitigate without the owner.

*The plan.* (a) **Shard the channel**: `team:<id>:<bucket>` over N objects, with the
publisher writing to all N and each holding ~1/N of the sockets. Broadcast cost per
object falls by N; publish cost rises by N. Contract unchanged, the client's socket URL
gains a bucket it computes from its own session id. (b) **Scope by subscription**: the
client declares which resources its mounted screens read; the object filters on that
before `send`. Cuts per-message work by roughly the ratio of resources to screens, and
is the cheaper half to do first. (c) **Coalesce** under rapid change: a 50 ms window per
resource, so a bulk write is one ping rather than n. Rollback for all three: the socket
URL is versioned, so an old client keeps the old shape.

### 6.2 A resumable mover. **Tier C**
Now safe and no longer quadratic, but still one request copying a whole module. Making
it resumable means a job table, a progress cursor per table, and a cron or alarm to
drive it, new machinery with a decision about who owns it. Until then it is an
operator-run tool that may need re-running, and it now fails loudly instead of silently.

### 6.3 A real cross-shard merge. **Tier C**
The prerequisite for wiring any **paged** module onto the split path: a cursor token
encoding a position per shard, a merge sort over per-shard pages, and folding aggregates.
Today the seam refuses instead of answering wrongly, which is the right interim state.

### 6.4 A work queue for the crons. **Tier C**
Rotation turns "never" into "late", which is correct for a 15-minute sweep and wrong for
a *daily* digest past a few hundred teams. The real answer is Cloudflare Queues: one
message per team, consumers bounded by the platform. That adds a binding, a consumer
worker and a deploy-order change.

### 6.5 A retention window for the audit tables, **owner's decision, not mine**
`account_activity`, the per-team `activity` feed and the usage ledgers grow for ever in
the shared core database. They are rate-bounded and never swept, and `retention.ts` is
explicit that it never takes "anything anyone might have to answer for later". Choosing
how long a record somebody may be asked about is kept is a business decision. I swept
`error_logs` only because its own migration already named 90 days.

### 6.6 Delivering the alarms. **DONE 14 Aug 2026** (was: blocked on one owner decision)

**Resolved.** The owner named both addresses, chose *once per new alarm*, and chose to
carry the trend inside the alarm mail rather than as a separate early warning. Shipped as
`ALERT_TO` on the tenancy worker + `alertNewAlarms()` beside the check it describes, with
`workers/tenancy/test/size-alert-delivery.test.ts` locking all three choices. The cadence
needed no code: `checkDatabaseSizes` already suppresses a database with an open alert, so
"new tonight" is the set it hands over. **Dimension 4: 84 → 96**, its major becomes a
minor, because the alarm now reaches a person and what is still absent is an on-call/page
path rather than any delivery at all. **Total: 78 → 79.**

The original finding, kept for the record:

`db_alerts` and now `filling` land in a table and a `console.error`, readable through an
owner-gated route nobody polls. Until it is wired to an email or a page, "we have
alarms" means "we have a table". The mechanism (the branded sender in `auth`) already
exists, and the nightly cron is already the right place to call it from.

**Re-examined 2026-08-14. Everything about this is ready except the recipient, and the
recipient cannot be derived, it has to be named.**

- There is **no operator address configured anywhere**. `EMAIL_FROM`
  (`kwapso <alerts@kwapso.app>`) is the SENDER. `SEED_OWNER_EMAIL` is a seed script's
  default, not production config. `INVENTORY.md` records the owner's two addresses as a
  handover fact, which is not the same thing as an alerting setting.
- It **cannot be derived from the data** either, and this is the part that settles it:
  `db_alerts` is a PLATFORM alarm about the Cloudflare account's databases,
  including the shared core database, which belongs to no team. So there is no team
  whose admin role could be resolved into a recipient. "Email whoever holds
  `admin` on the affected team" answers the team-database case and has no answer at all
  for the one that takes the whole product down.
- Two further choices ride along with the address: whether it mails **once per new
  alarm** or **every night an alarm stays open** (the check is idempotent per database,
  so either is implementable), and whether `filling`, a database that is not yet at 80%
  but is heading there fast, is worth a mail of its own or only a line in the nightly
  one.

So: an `ALERT_TO` var on `workers/tenancy/wrangler.jsonc`, a call to the existing sender
in the cron's existing `capped`/`alerted` branch, and a test. Half an hour's work behind
one sentence from the owner.

### 6.7 Per-caller rate limiting on ordinary doors. **Tier B, and NOT config-level**
Auth, the AI agent, the error log and account activity are all throttled. Ordinary reads
and writes are not: a signed-in member can hammer `GET /api/tenancy/activity?scope=team`,
whose R16 `COUNT(*)` is O(rows), as fast as they like.

**Re-examined 2026-08-14 on the question "is this genuinely config-level?" The answer is
no, and the reason is worth more than the +132 would have been.**

Cloudflare's Rate Limiting binding looks like config, a `ratelimits` block in
`wrangler.jsonc`, then `env.LIMIT.limit({ key })`. The block is the easy part. **The key
is not**, and the key is the whole design:

- **Per USER is the limit you actually want, and the gateways cannot key on a user.**
  Both are pure routers: they check the origin, serve static assets and media, and
  forward `/api/*` with the cookie attached. Neither ever decodes a session, the
  domain workers do that behind them (`workers/gateway/src/index.ts`). So a per-user
  limiter at the door needs a session lookup *the door does not currently do, on every
  request including the cheap ones*. That is a new subrequest on the hot path, not a
  config block.
- **Per IP is config-shaped and wrong for this deployment in particular.** A dozen staff
  in one office share one NAT address, so the limit that stops one abusive caller
  throttles the whole agency. Getting that number wrong is a self-inflicted outage.
- **The MCP surface needs a different number.** An outside tool on a bearer token has a
  legitimately higher steady rate than a browser, and it comes through the same gateway.
- **And the limits themselves are a product decision**, what a legitimate power user
  does in sixty seconds is a question about people, not about code. The binding's period
  is also fixed at 10 or 60 seconds and is per-colo rather than global, so the number
  chosen is not the number enforced globally.

**The genuinely config-level version of this exists and is not in the repo**:
zone-level WAF rate-limiting rules, set in the Cloudflare dashboard, with no code, no
binding and no 429 path in the app. That is the cheap first move if the owner wants
protection now, and it needs no deploy.

### 6.8 Presigned direct-to-R2 uploads. **Tier C**
Every upload is a base64 data URL POSTed through the worker: a 25 MB attachment is ~33 MB
of base64 in the JSON body, plus the parsed string, plus the `atob` string, plus the
`Uint8Array`, well over 100 MB of allocation in a 128 MB isolate, on the request path.
Presigned direct-to-storage is the fix and it changes both the client contract and the
security model of a bucket whose keys *are* its credentials (SCOPE ch.06's recorded
capability-URL decision). That is an owner-level change.

### 6.9 R2 lifecycle rules and per-tenant object cleanup. **Tier B/C**
No lifecycle rule anywhere; a deactivated team's objects live for ever. Keys *are*
prefixed per tenant, so a prefixed delete is possible, but "deactivate, never delete"
means there is no flow that should be deleting them, and a lifecycle rule is bucket
config rather than code.

### 6.10 R16's exact `COUNT(*)`, **a Law of the Base**
The team activity feed runs an exact `COUNT(*)` on every page load. On a
tens-of-millions-row table that is O(n) per request, and it is the largest remaining
query cost in the app. R16 mandates it ("an exact server `COUNT(*)` through the one
`formatCount` seam"), so a cached or approximate count would need RULES.md, the registry
and the check changed together. The new composite index makes it an index-only scan
rather than a scan of the widest table, a large constant-factor win, not a complexity
one.

### 6.11 List virtualisation, **not this repo's to change**
Dimension 5's one missing signal. Primitives and collections come from `@kwapso/ui`,
which CLAUDE.md forbids editing from here. `CLIENT_PAGE_ROWS_CAP` bounds the damage
(1,000 rows, not 50,000); real virtualisation is a library change to surface upstream.

---

## 7 · Why 94 was not reachable, and why it is no longer the target

The gap from 78 to 94 is +16 total, or **+1,600 weighted points**. Here is every place
they could come from, with the tier of the work required:

| dimension | now | realistic ceiling | weighted gain | blocked by |
|---|---|---|---|---|
| 9 fan-out | ~~0~~ **84** | **~84 is the honest ceiling, not ~90** | ~~+630~~ **+588 taken** | **DONE**, §4.13. The rest needs a different shape, not more shards |
| 12 storage | 51 | ~90 | +312 | Tier C, presigned uploads change the client contract + SCOPE ch.06 |
| 1 partitioning | 76 | ~90 | +168 | Tier C, core database split, resumable mover |
| 2 queries | 88 | 100 | +156 | **a Law**. R16's exact count |
| 5 client volume | 75 | ~90 | +135 | `@kwapso/ui`, forbidden from here |
| 7 surge | 68 | ~90 | +132 | Tier B, rate-limiting bindings on 8 workers |
| 3 contract | 88 | 100 | +84 | Tier C, a real cross-shard merge |
| 4 headroom | ~~84~~ **96** | ~96 | **taken** | **DONE**, delivered 14 Aug 2026, §6.6 |

Sum of **every** item: ~+1,713 → about 95. So 94 requires doing essentially all of
them, and there is no subset that reaches it without at least one Tier C architectural
change or one Law amendment. Every point left on the table is a decision, not an
omission, which is why the score stops at 78 rather than the number being adjusted to
meet the target.

> **This table is now the evidence behind a decision, not a plan.** The owner read it
> on 14 Aug 2026 and accepted 78. See **[ARCHITECTURE.md §7](ARCHITECTURE.md)**, which
> is LOCKED and holds the load figures and the revisit signals. The reasoning that
> settles it: the largest single line here is dimension 9's +630, that line *is* the
> Durable Object topology, and the ceiling it imposes (~3,000–5,000 concurrent sockets
> on one team channel) sits about seventy-five times above what this deployment peaks
> at. Chasing it would buy points and no perceptible improvement.
>
> Of the eight rows, six are now locked as accepted. The two that are not are **§6.6**
> (alarm delivery, blocked on naming a recipient) and **§6.7** (rate limiting, which
> on re-examination is *not* the config-level change this table implied it was; the
> gateways cannot key a limiter on a user without a session lookup they do not do).

If a revisit signal ever fires, the cheapest genuine route is unchanged in order:
**(1)** scope the broadcast by subscription and shard `TeamChannel` (§6.1, one change,
+630, and it also removes the app's first ceiling); **(2)** alarm delivery (§6.6, +96,
the sender exists, one decision outstanding); **(3)** zone-level WAF rate limiting
(§6.7, the config-level half of what that section used to claim); **(4)** presigned
uploads (§6.8, +312). What has changed since this was written is only item 2 and 3's
description: (2) is smaller than it looked and (3) is larger.

---

## 8 · Files changed

**Migrations (new, must be applied before deploy):**
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
