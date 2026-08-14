# Architecture review — kwapso

**2026-08-14 · branch `audit/architecture` · 529 code files, 12 components, 8 workers**

> **69 → 93 / 100.** The shape is sound and unusually disciplined: no dependency
> cycles, no layer violations, staging that mirrors production binding for
> binding, and a genuinely cheap path to the next module. What it could not do
> on a bad day was **explain itself** — eight components handled a request and
> nothing tied their error rows together — and it had **no way to get the rows
> back**. Both are now built.

> **The single worst structural risk:** `kwapso-auth` is depended on by seven of
> the eight workers with no fallback identity path, so an auth deploy that goes
> wrong is a total outage rather than a degraded one.

---

## The eight criteria, before and after

| # | criterion | weight | before | after | how it moved |
|---|---|---|---|---|---|
| 1 | Dependencies point one way | 16 | **100** | **100** | already clean — confirmed, not assumed |
| 2 | Blast radius is contained | 18 | **50** | **80** | ceilings on every internal hop; auth named as the SPOF |
| 3 | Every fact has one owner | 16 | **83** | **94** | owners written down; the `users` split machine-checked |
| 4 | A request can be followed end to end | 12 | **25** | **95** | request id minted at both doors, propagated, stored |
| 5 | Environments match | 10 | **100** | **100** | clean before and after — a real result |
| 6 | Live data can be recovered | 12 | **15** | **83** | backup script, restore runbook, rehearsed |
| 7 | The next module is cheap | 10 | **100** | **100** | verified against real commits |
| 8 | The platform is a choice, not a cage | 6 | **100** | **100** | PLATFORMS.md already does this properly |

### The arithmetic

```
BEFORE  (100×16)+(50×18)+(83×16)+(25×12)+(100×10)+(15×12)+(100×10)+(100×6)
      = 1600+900+1328+300+1000+180+1000+600 = 6908 / 100 = 69.08  ->  69

AFTER   (100×16)+(80×18)+(94×16)+(95×12)+(100×10)+(83×12)+(100×10)+(100×6)
      = 1600+1440+1504+1140+1000+996+1000+600 = 9280 / 100 = 92.80  ->  93
```

**The gate did not bite.** Criterion 2 is 80, far above the 40 that would cap the
total at 65. No cap applied; capped and uncapped figures are the same.

### It is 93, not 94 — and here is the one thing that buys the point

I did not close the **R2 gap**. `scripts/backup.mjs` captures the core database
and every team database; it does not capture the four R2 buckets, so criterion 6
scores 20/30 on "a documented way to back up *each* stateful store" rather than
30/30. That last 10 points is worth exactly 1.2 on the total — 93 → 94.

I stopped because doing it safely is a task, not a review side-effect. R2 has no
`wrangler r2 object list`, so a backup has to enumerate keys from the databases,
and the keys are written by **six** upload routes into columns with three
different names (`image_url`, `logo_url`, `photo_url`, plus the learning,
brand-asset and to-do attachment columns). An inventory assembled by guessing
which columns hold keys produces a backup that **reports success while being
incomplete** — precisely the failure `backup.mjs` verifies against on every other
store. Writing that badly would have bought a number and lost the thing the
number is for.

---

## Criterion 1 — dependencies point one way · 100

**0 cycles. 0 layer violations.** Over production edges, with `import type`
dropped and test files excluded.

This is the criterion where mechanical output is most often wrong, and it was
wrong here too. The raw probe reports **six worker-to-worker edges**. Every one
of them is a test file borrowing a fixture:

| edge | reality |
|---|---|
| content → tenancy (5) | `test/export-whole`, `google-ingest`, `help-fence` importing `tenancy/test/d1-sqlite` + `spine-harness` |
| data-ops → tenancy (5) | same two harnesses |
| mcp → data-ops (4) | `catalog.test.ts` reading the target's own ROUTES to verify forwarding |
| mcp → tenancy / mcp → content (2) | same test |
| gateway → portal-gateway (1) | `cross-site.test.ts`, one door checking the other |
| data-ops → web (1) | `trace-parity.test.ts` |

**Production worker-to-worker imports: zero.** Workers talk through service
bindings, which is exactly what the rubric asks for. The `web → root` and
`root → lib` edges are intra-workspace path aliases (`@/components`, `@/lib`) the
probe cannot resolve; not violations.

## Criterion 2 — blast radius is contained · 50 → 80 · GATE

```
points  row                                                     before  after
  30    every cross-service call guarded (no unhandled rejection)   30     30
  20    calls carry a timeout                                        0     15
  20    a non-critical dependency degrades gracefully               20     20
  15    highest fan-in named in docs as a SPOF, with consequence     0     15
  15    no single component depended on by all, without a fallback   0      0
                                                                   ---    ---
                                                                    50     80
```

**Read, not counted.** The probe reported `guardedPct: 54`, then 31% once I
excluded test files. Both are artefacts of a 500-character window. Reading all
**13** production cross-service call sites: every one already ended in a
controlled response — the seven gateway forwards sit under a top-level
`try/catch` that returns `recordGatewayCrash`, and the rest handle their own
error path. Nothing was throwing into the void. That row was 30 before my
changes and is 30 after; I did not move it and will not claim I did.

**The real gap was time, not errors.** Not one service-binding call carried a
ceiling. R11 exempts them ("Cloudflare-bounded"), which is true of the socket and
not true of the worker on the other end — which can be redeploying, throwing, or
stuck on its own D1 call. Six hops now carry one. The remaining 5 points are
withheld honestly: the agency gateway's seven pass-through forwards still have
none, and cannot, because `/api/realtime` is a WebSocket upgrade and
`/api/data-ops/` carries the agent's SSE stream. A blanket ceiling there would
break both, and a per-prefix one would break large uploads on a slow connection.

**Degradation is a genuine strength, and it predates this review.**
`publishChange` swallows its own failure, the realtime fence fails closed to
cache-first reads with backoff, and member-notification email is best-effort
behind a committed state change. Full 20 points, earned before I arrived.

### The worst case, stated

> **If `kwapso-auth` is down, seven of the eight workers stop serving anything
> gated.** Both front doors still answer and cached screens still paint, but
> every API call returns `503 auth_unavailable` — an app that renders and cannot
> do anything. Sign-in is down too, so nobody can get in behind them.

```
   gateway ─┐                             portal-gateway ─┐
            │                                             │
  tenancy ─┐│  content ─┐  data-ops ─┐  mcp ─┐  realtime ─┤
           └┴───────────┴────────────┴───────┴────────────┘
                              ▼
                        kwapso-auth        fan-in 7 of 8   <-- SPOF
                              ▼
                      kwapso-realtime      fan-in 6 of 8   (degrades)
```

| worker | fan-in | public | if it dies |
|---|---|---|---|
| **kwapso-auth** | **7** | no | everything gated stops; nobody can sign in |
| kwapso-realtime | 6 | no | screens lose live refresh only — writes still commit |
| kwapso-content | 4 | no | learning, tickets, knowledge, Google |
| kwapso-tenancy | 4 | no | teams, roles, invites, the customer spine, money |
| kwapso-data-ops | 2 | no | import + the assistant |
| kwapso-mcp | 1 | no | the external machine surface only |
| kwapso / kwapso-portal | 0 | **yes** | that front door |

### An observation worth recording: the binding cycle

`auth` binds `realtime` and `realtime` binds `auth`. This is **not** a criterion-1
violation — service bindings are what the rubric wants instead of imports — but it
has a real cost, already documented in OPERATIONS.md: on a genuinely fresh
account the first deploy dies with `code 10143` and needs a human to temporarily
remove one binding. Every `new-app` fork pays it. Worth automating in the deploy
script; it is already on BASE-IMPROVEMENTS.

## Criterion 3 — every fact has one owner · 83 → 94

**The probe reported 18 shared-write tables. Reading reduced that to three.**

Ten of the eighteen evaporated because the probe counts test files. Five more
evaporated on reading: the `help`, `knowledge_sources`, `knowledge_terms`,
`knowledge_chunks` and `sprints` writes attributed to tenancy are all
`TEAM_MIGRATIONS` SQL inside `workers/tenancy/src/team-schema.ts`. Tenancy owns
rolling team schema forward — that *is* its job, and a migration is not a runtime
writer. `mcp_tokens` was a migration file in `db/core/`.

The three that survived:

| table | owner | other writer | the split | before | after |
|---|---|---|---|---|---|
| `users` (core) | **auth** | tenancy | auth owns identity (the row, `email`, profile); tenancy writes exactly `current_team_id` + `updated_at`, at 5 sites in `lib/teams.ts`. Disjoint columns — no field has two opinions. | medium (−7) | **0** |
| `selectable_data` (team) | **tenancy** | content | tenancy owns the vocabulary screen; content only INSERTs an absent value via `ensureSelectableValue`, never updates or deactivates. | medium (−7) | minor (−3) |
| `error_logs` (core) | **shared seam** | data-ops | `logError` is the only INSERT; data-ops' admin door only UPDATEs `status`/`resolved_at`/`resolution_note`. | minor (−3) | minor (−3) |

Not one of these is two authoritative writers on one field — the splits were
clean. What was missing is that **no document anywhere stated who owned what**,
which is the rubric's definition of medium. RESILIENCE.md §2 now states all
three, and `users` — the only one where a pair of workers both write a core table
in anger — is machine-checked by `workers/tenancy/test/ownership.test.ts`.

`selectable_data` keeps a minor penalty because it is now *stated* but not
*enforced*, and `error_logs` keeps one because it remains a logging table written
from two places. Score: 100 − 3 − 3 = **94**.

**The test is real, not decorative.** I verified it goes red: adding
`UPDATE users SET email = ?` to `tenancy/src/lib/teams.ts` fails it with
`tenancy/src/lib/teams.ts writes users.email`. It also asserts the pointer write
still exists, so the rule cannot quietly become a rule about nothing.

## Criterion 4 — a request can be followed end to end · 25 → 95

This was the largest real gap. Eight components handle one request between them,
and the only thing tying their `error_logs` rows together was a timestamp —
which does not distinguish two people clicking at once.

```
points  row                                        before  after
  30    a request id generated at the edge             0     30
  25    propagated across every internal hop           0     20
  20    logs structured / filterable by that id        0     20
  15    errors recorded somewhere durable             15     15
  10    platform observability on every component     10     10
                                                     ---    ---
                                                      25     95
```

Built: `shared/workers/trace.ts` (mint or keep a caller's `x-request-id`,
boundary-validated and capped), both public doors stamping it,
`error_logs.request_id` behind core migration `0020`, and every worker's central
catch recording it. **The door that mints the id records it on its own crash
too** — I caught that hole in my own change and closed it; without it the one row
naming where a request entered the system would be the one row the trace cannot
find.

The withheld 5 points are honest: `sendBrandedEmail` and `publishChange` take
`env`, not a request, so those two fire-and-forget hops carry no id. Threading it
through would mean touching ~50 call sites for a side-effect that already logs
its own failure locally.

*Note the probe still reports `propagatedHeaders: false` and
`structuredLogging: false` after the change. Both are regex blind spots — the
header name lives behind a constant, and this codebase's structure is typed
columns rather than JSON console lines, which is strictly more filterable. Scored
by reading, as the rubric requires.*

## Criterion 5 — environments match · 100

**Clean, and a clean result is a real result.** `envParity` returns empty across
all eight workers. Spot-checking `workers/content/wrangler.jsonc` confirms it:
staging mirrors production binding for binding and kind for kind — D1, four R2
buckets, two service bindings, the AI binding, the Vectorize index, both cron
triggers, `observability.enabled` — with only names and URLs differing, which is
expected and not a penalty. Nothing to fix.

## Criterion 6 — live data can be recovered · 15 → 83

**Before this review there was no backup and no restore path — anywhere.** Not a
script, not a runbook, not a paragraph. The probe's optimism was three false
positives: `restoreScripts` matched `import.ts` and the seed scripts,
`mentionsPointInTime` matched a sentence in DATA-MODEL.md about *actor name
snapshots*, and `exportScripts` was correctly empty.

```
points  row                                              before  after
  30    a documented backup of each stateful store           0     20   (R2 excluded)
  25    a documented restore path + when last tested         0     18   (partly rehearsed)
  20    point-in-time recovery available, window stated      0     20
  15    per-tenant restore without restoring everyone       15     15
  10    what is NOT backed up is written down                0     10
                                                            ---    ---
                                                             15     83
```

`scripts/backup.mjs` is read-only, carries `reset-all.mjs`'s account guard
verbatim, and dumps core plus every team database core points at. Each dump is
**read back and must contain real statements** before it counts — a zero-byte
file in a backup folder is the most expensive kind of success.

**Per-tenant restore was always the strong point** and nobody had written it
down: because each team has its own database, one team's rows come back without
touching anyone else's. That is the per-team-database decision paying out on the
bad day.

**The restore was actually rehearsed, and the rehearsal's limits are stated.** On
2026-08-14 all 20 core migrations were replayed into a scratch SQLite database,
filled, dumped and reloaded: 18 tables, 44 indexes and every row survived. It did
**not** exercise `wrangler d1 export --remote` or Time Travel, which need a live
environment. That partialness is priced into the 18/25 rather than double-counted
as a cap.

## Criterion 7 — the next module is cheap · 100

Checked against real commits rather than the documentation's claim, as the rubric
demands. The last four feature commits touched **6, 1, 3 and 17 files** — and the
17 was a three-part merge (onboarding, migration, money), not one feature. A
capability plugs into a registry rather than being scattered: `shared/rules/registry.ts`,
`shared/workers/tool-catalog.ts`, the import `TargetDef`s, `web/lib/screens.ts`
recipes, `web/lib/live-resources.ts`. BUILD-A-MODULE.md is the followed path and
every seam is named with a file and a function. Full marks, earned.

## Criterion 8 — the platform is a choice, not a cage · 100

Informational, per the rubric — Cloudflare is a locked decision in
ARCHITECTURE.md, and the finding here is never "you should not have chosen this".
PLATFORMS.md already does the whole job: five named seams (`d1-rest.ts` is the
**only** place SQL runs; `realtime.ts` the **only** broadcast seam), the top-10
providers mapped, and the cost of moving written down as Turnkey / Moderate /
Heavy. Business rules are testable without the runtime — the `d1-sqlite` +
`spine-harness` fixtures run the real logic over in-process SQLite.

---

## Priority list

### Fixed in this branch

| # | criterion | finding | tier |
|---|---|---|---|
| 1 | 4 | no request/correlation id anywhere — eight components, one timestamp to join them | 2 |
| 2 | 6 | no backup script, no restore path, no statement of what is not backed up | 2 |
| 3 | 2 | no service-binding call carried a ceiling; a hung dependency held requests open | 1 |
| 4 | 2 | an auth outage returned `null`, indistinguishable from "signed out" — would have logged everyone out of a healthy app, into the worker already struggling | 1 |
| 5 | 2 | highest fan-in component not named anywhere as a single point of failure | 1 |
| 6 | 3 | three tables written from two components each, with no stated owner | 1 |
| 7 | 4 | the gateway minted the id and did not record it on its own crash (found in my own change) | 2 |

### Left as recommendations

| # | criterion | recommendation | tier | cost of leaving it |
|---|---|---|---|---|
| A | 6 | **Add R2 to the backup.** Enumerate keys from the databases across the six upload routes and fetch each object. | 2 | Losing a bucket permanently loses every photo, logo, attachment and internal file. The rows survive; the images 404. This is the real remaining hole. |
| B | 2 | **A read-through identity cache in the gating seam** — a short-lived signed copy of `/api/auth/me`, so signed-in people keep working through an auth outage. | **3** | An auth deploy that goes wrong is a total outage rather than a degraded one. |
| C | 2 | **Automate the auth ↔ realtime cold-start break** in the deploy script. | 1 | Every fresh fork hits `code 10143` and needs a human to remove a binding and put it back. |
| D | 6 | **Rehearse the restore against staging**, exercising `--remote` and Time Travel, then update the date in RESILIENCE.md. | 1 | The remote half of the restore path has still never been run. |
| E | 3 | **Machine-check the `selectable_data` split** the way `users` now is. | 1 | Stated but not enforced; the next writer will not know. |

**B is Tier 3 and I did not touch it.** Who may answer "who is this?" is a change
to how the permission spine decides, and that belongs to the owner. Availability
is not bought with a weaker fence without somebody saying so out loud.

---

## Files changed

**New (5)**

| file | why |
|---|---|
| `shared/workers/trace.ts` | the request-id seam — mint, keep, propagate |
| `db/core/0020_error_request_id.sql` | `error_logs.request_id` + a partial index |
| `scripts/backup.mjs` | read-only backup of core + every team database |
| `workers/tenancy/test/ownership.test.ts` | pins the `users` column split |
| `RESILIENCE.md` | the SPOF and its consequence, the ownership map, the recovery runbook |

**Edited — code (13)**

`shared/workers/gating.ts` · `shared/workers/error-log.ts` ·
`shared/workers/notify.ts` · `shared/workers/realtime.ts` ·
`shared/workers/front-door.ts` · `workers/gateway/src/index.ts` ·
`workers/portal-gateway/src/index.ts` · `workers/auth/src/index.ts` ·
`workers/tenancy/src/index.ts` · `workers/content/src/index.ts` ·
`workers/data-ops/src/index.ts` · `workers/mcp/src/index.ts` ·
`workers/realtime/src/index.ts`

Plus `workers/data-ops/src/routes/admin.ts` (expose `request_id` on the error
read — an id written and never read is the same as not having it),
`workers/data-ops/src/lib/agent.ts` and `workers/mcp/src/lib/bridge.ts`.

**Edited — tests (2)**

`workers/auth/test/error-log-bound.test.ts` (fixture builds from migrations —
added `0020`) · `workers/auth/test/profile-media.test.ts` (hand-written fixture
table gained the column).

**Edited — docs (2, both minimal, both named by findings above)**

`OPERATIONS.md` — the `0020` apply-before-deploy note and a backup section.
`README.md` — one line in the doc map pointing at RESILIENCE.md.

*Three other sessions are editing docs on parallel branches. My doc footprint is
deliberately one new file plus two small additions; I did not touch
ARCHITECTURE.md, RULES.md, BASE-MANUAL.md, DATA-MODEL.md or the registry.*

## Locked decisions: unchanged

Nothing in ARCHITECTURE.md was altered. The eight workers, two public doors, the
live layer and the Durable Object code-vs-runtime model are as they were.
Recommendation B would touch the permission spine and is left for the owner.

## Verification

`npm run check` — **exit 0**. Lint, TypeScript across all ten workspaces, and the
full suite: 1,645 tests passing, 3 skipped, 0 failing. Baseline before any change
was also exit 0, so the green is mine to claim rather than inherited. Nothing
deployed, nothing pushed, nothing committed.
