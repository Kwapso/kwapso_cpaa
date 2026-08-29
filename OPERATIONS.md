# Operations, kwapso

How this project ships. /ship-staging and /ship-production read the config below.

**Its two companions.** [RUNBOOK.md](RUNBOOK.md) is the other direction, rolling
a deploy back out, restoring data with D1 Time Travel, and what to check when it
breaks at two in the morning. [INVENTORY.md](INVENTORY.md) is everything the app
needs that is not in this repository: the accounts, the domains, the two Google
OAuth clients, every credential by name, the cron jobs, and what has no backup.
BOOTSTRAP.md stands the whole thing up from zero.

> **Before any command on this page: `npx wrangler whoami`.** No worker pins
> `account_id`, so wrangler acts on whatever account the machine is logged into.
> RUNBOOK.md § 0 explains why this is the first thing, not a footnote.
> The scripts that touch data (`backup.mjs`, `reset-all.mjs`, `wipe-knowledge.mjs`)
> enforce it for you: they refuse to start unless `CLOUDFLARE_ACCOUNT_ID` (matching
> this project) and `CLOUDFLARE_API_TOKEN` are exported. Run them through the
> `cf-exec` wrapper if your machine has one — it is NOT in this repository
> (RUNBOOK § 0) — or export both variables first (§ *Backups* below).

## Deploy config

- platform: cloudflare-workers (TWO gateway workers, one per front door, each serving its own static export + routing /api)
- staging_url: https://agency-staging.kwapso.app
- production_url: https://agency.kwapso.app
- portal_staging_url: https://staging-client.kwapso.app
- portal_production_url: https://client.kwapso.app
  (ALL FOUR domains are attached and serving, production included since
  20 Aug 2026. See "Custom domains" below for what is true and why.
  Staging also answers on its `*.workers.dev` names; production answers on none,
  by config. `scripts/smoke-staging.mjs` and `scripts/smoke-mcp.mjs` read
  `SMOKE_BASE` and default to the staging workers.dev name.
  `scripts/smoke-portal.mjs` reads BOTH `SMOKE_BASE` (the agency door, where its
  staff fixtures are built; same workers.dev default) and `SMOKE_PORTAL_BASE`
  (the client door, the surface it is actually proving) — and `SMOKE_PORTAL_BASE`
  defaults to `https://staging-client.kwapso.app`, the REAL hostname, because the
  Google sign-in door derives its redirect from the origin the caller stands at
  and answers 400 at the workers.dev alias BY DESIGN (an open-redirect defence;
  the comment above `scripts/smoke-portal.mjs`'s own default says so). Export
  them to run against other hosts.)
- account_gate: `npm run account:check` (`scripts/check-cloudflare-account.mjs`).
  FIRST in both deploy chains, ahead of everything. **Not one of the eight workers
  pins `account_id`**, so wrangler uploads to whatever account the machine is
  signed in to — which on the machine this is developed on is a different client's.
  The `cf-exec` convention at the top of this page has always been the fix; until
  27 Aug 2026 nothing enforced it for a deploy. It is first because it is the only
  gate here whose failure is not recoverable by re-running: the others refuse
  before anything has happened, this one guards the moment after which something
  has, and a worker left running in the wrong account is not an error anybody
  sees. The account is DERIVED from every `CF_ACCOUNT_ID` in the workers' own
  wrangler configs — every worker whose config names one, and they must agree — no
  literal, so a fork of the base follows its own configs instead of carrying
  kwapso's account number. `workers/tenancy/test/migration-gate.test.ts` holds its
  position down against the first `--workspace=` deploy, derived rather than named.
- migration_gate: `npm run migrations:check -- <staging|production>`
  (`scripts/check-team-migrations.mjs`). Reads the environment's core database and
  refuses if any live team's `schema_version` is behind the last entry in
  `TEAM_MIGRATIONS` — the sentence further down this page ("roll it out with
  migrate-teams first, then deploy") finally said by something that can fail a
  build. `npm run check` cannot catch this: the test suite replays the whole
  migration list every run, so only an environment with a HISTORY can be behind.
  It counts exactly the teams the migration robot counts (`db_status = 'ready'`,
  not deactivated — the clause is lifted from `migrateTeams`, not copied), so a
  stranded team the robot skips can never block a ship.
  **IT RUNS BETWEEN TENANCY AND CONTENT, and that position is the design.** The
  robot applies the migration list bundled into the DEPLOYED tenancy worker, so a
  gate standing ahead of tenancy's own deploy demands a migration only that deploy
  can deliver: it answers its own remedy with `{"teamsMigrated":0}` and refuses
  forever. That deadlock happened on 27 Aug 2026, hours after the gate shipped
  first-in-chain, and it would have blocked every schema change from then on. So
  tenancy lands, the robot can then do its job, and the gate guards the workers
  that actually READ the new columns. The cost is honest: it no longer fails
  before the build, and a deploy carrying a NEW migration takes two runs — refusal,
  robot, run again. `workers/tenancy/test/migration-gate.test.ts` holds the order
  down; do not move it earlier to "fail faster".
  When a live team genuinely cannot be migrated: deactivate it, or add a dated,
  rot-checked waiver — the script's header has the reasoning and says why there is
  deliberately no way to switch it off.
- build_command: npm run build (root; builds BOTH static exports, web/ → web/out and web-portal/ → web-portal/out). `npm run build:portal` builds the portal alone.
- language_sweep: `npm run lang` (extract every user-visible English string, then prune
  the catalogue and the seed to the languages `shared/i18n.ts` declares — English,
  German, Spanish and Catalan since 2026-08-20). Run it before you commit. BOTH deploy
  commands now open with `npm run lang:check` and REFUSE on a stale catalogue, so a
  ship can no longer carry a sentence nobody translated or a language nobody speaks.
  The check is a second apart and fails before the two-minute build rather than after it.
- deploy_staging_command: npm run deploy:staging (root; runs `account:check`, then `lang:check`, then `check:built` — build both frontends, then re-run both front-door suites against the real export — then deploys ALL eight workers realtime-first: realtime → auth → tenancy → **migrations:check** → content → data-ops → mcp → gateway → portal-gateway, staging names)
- deploy_production_command: npm run deploy:production (root; `account:check` then `lang:check` first, then the same eight-worker realtime-first order with `migrations:check` between tenancy and content, production names)
- github_remote: origin (https://github.com/Kwapso/kwapso_system.git — renamed from
  `kwapso_cpaa` on 2026-08-26; GitHub redirects the old URL, but the remote and every
  reference below point at the live name directly)

## Reset config

The /clean_slate skill reads this. DESTRUCTIVE, wipes data back to empty.

- reset_command: node scripts/reset-all.mjs <staging|production|both>
- global_db_staging: kwapso-core-staging
- global_db_production: kwapso-core
- what it does: deletes every team database THIS project's global `teams` table
  references (never other projects' DBs), then removes all rows from the global
  core DB while keeping the schema + d1_migrations. Self-tests with a read-back.

## Seed config, the staging sandbox

The other half of clean_slate: fill an empty staging back up with one believable,
obviously fictional client world so there is something to click around.

- seed_command: `TEST_LOGIN_KEY=… ADMIN_KEY=… node scripts/seed-staging.mjs staging`
  (both keys live in `~/.config/kwapso/keys.env`. Export them, never paste them)
- what it seeds: the "Kwapso sandbox" team, a **Client** role, two sandbox
  companies (one with two accounts nested under it), four contacts, one of whom
  belongs to *both* companies, which is the only way to exercise the account
  switcher, three portal logins on plus-addressed variants of the owner's own
  inbox, six tickets raised by the people who would really raise them, and two
  extra Ticket types.
- how it writes: every row goes through a real gated endpoint, signed in as a
  real person. Never straight into D1. Seeding through the front door is what
  proves the doors work and leaves genuine activity rows and live pings behind.
- idempotent: every record is matched on a natural key first (an account's
  reference, a person's email, a ticket's description), so a
  second run writes nothing and says so.
- it checks the fence afterwards: signs in as a seeded client login and proves it
  sees its own company's world and nothing from the other one, eight PASS/FAIL
  lines, non-zero exit if any fails.
- STAGING ONLY (SCOPE ch.13: staging holds only the sandbox account; real client
  accounts are only ever invited on production). `production` needs an explicit
  `--confirm-production`, and auth's test-login door refuses production anyway,
  so the sign-in would fail even then.

## The design system (a pinned dependency)

The UI lives in `shared/ui/` and is the kwapso design system, vendored from
`github.com/Kwapso/design` at a tag by `scripts/sync-design.mjs`. It is a
DEPENDENCY: `web/test/vendored-kit.test.ts` recomputes a content hash on every
check, so a hand-edit under `shared/ui/` turns the build red — kit changes are
made upstream and pulled. When Aurora ships a new tag:

    node scripts/sync-design.mjs v1.1.0     # replace shared/ui at the new tag
    node scripts/design-imports.mjs         # idempotent; converts any new old-path imports
    npm run check                           # the laws + the hand-edit guard
    # then ship as usual

Cloning needs the `alaap-kwapso` GitHub identity (the machine's default
credential is a different account); the sync script's URL carries it.

## The pieces

| Worker | Staging name | Production name | What it is |
|---|---|---|---|
| gateway (`workers/gateway`) | kwapso-staging | kwapso | The AGENCY front door: serves web/out (marks `/_next/static/**` immutable) + routes /api/* (incl. the /api/realtime WebSocket) via service bindings, by PREFIX |
| portal-gateway (`workers/portal-gateway`) | kwapso-portal-staging | kwapso-portal | BUILT 2026-08-10. The CLIENT front door: serves web-portal/out + forwards a NAMED, CLOSED set of /api doors (an allow-list keyed `METHOD /path`, not a prefix fan-out) to auth / tenancy / content / realtime. Binds only those four, no DATAOPS, no MCP, so import, the assistant and the machine surface are unreachable from the client internet by construction. Its closed-door suite (`workers/portal-gateway/test`) derives the agency's whole /api surface off `web/lib/api/` and asserts every door the portal does not name 404s |
| auth (`workers/auth`) | kwapso-auth-staging | kwapso-auth | Login (a 6-digit email code, or Google. UPDATED 2026-08-11), sessions, users |
| realtime (`workers/realtime`) | kwapso-realtime-staging | kwapso-realtime | The live switchboard: one `TeamChannel` Durable Object per **channel** fans out row-level `{resource,id,op}` pings over WebSockets, and a second class, `TeamInterest` (one per team), remembers which shards hold a listener for which resource so the fan-out only visits the shards that asked (ADDED Aug 2026). TWO channel scopes, `team:<id>` (per active team) and `user:<id>` (per signed-in user), so each open browser holds two sockets; idle channels hibernate (≈ free). Binds AUTH + the core DB (to gate connections); holds no app data |
| tenancy (`workers/tenancy`) | kwapso-tenancy-staging | kwapso-tenancy | Members/roles/invites/config: team membership, role permissions, invitations + the nightly team-DB sizing cron + the per-team screen-recipe config store (served at GET/POST `/api/tenancy/config/screens`). UPDATED 2026-06-21: the planned `workers/config` worker was folded into tenancy, there is NO separate config worker |
| content (`workers/content`) | kwapso-content-staging | kwapso-content | BUILT 2026-06-23. Everything a team AUTHORS: **Tickets** (account-fenced tickets + threaded replies, five-state lifecycle; the permission key, tables and path are still `help`. DATA-MODEL.md says why), **the work engine** (stories, sprints, work logs, to-dos, tasks, triage duty, meetings), **the knowledge base**, **the per-person Google connections** and **the agency's own housekeeping** (brand assets, meeting purposes, staff). Routes `/api/content/*` (the live list is its own `ROUTES` table). Binds AUTH + REALTIME + the core DB (gating) + **four** R2 buckets (`LEARNING_MEDIA`, `HELP_MEDIA`, `MEDIA`, `INTERNAL_MEDIA`. `LEARNING_MEDIA` is read-only now, see the bucket list below) + the `KNOWLEDGE_INDEX` **Vectorize** binding + Workers AI (`AI`, for embeddings). **TWO CRONS**. See the cron paragraph below |
| mcp (`workers/mcp`) | kwapso-mcp-staging | kwapso-mcp | BUILT 2026-07-07. The external machine surface: personal access tokens (core `mcp_tokens`) bridged to team-pinned sessions (auth `/internal/mcp-session`), exposing the gated doors as MCP tools over JSON-RPC at `/mcp` (+ token management at `/api/mcp/tokens*`). Binds AUTH + TENANCY + CONTENT + DATAOPS + the core DB. Secret: `INTERNAL_KEY` (same value as auth/tenancy/content/gateway). No cron |
| data-ops (`workers/data-ops`) | kwapso-data-ops-staging | kwapso-data-ops | BUILT 2026-06-23. **CSV import**, the 3-stage single-target session AND the agentic multi-file **batch** import (analyze → plan → ordered run with foreign-key resolution; AGENTIC-IMPORT.md), both INSERT-ONLY + act-as-user through the gated create endpoints, plus full-field CSV **export** (`/api/tenancy/roles/export`, `/api/content/brand-assets/export`) + **the AI agent** (swappable model, act-as-user executor, confirm rule, identity blocks, fenced data, step cap, saved threads, credit quota). Routes `/api/data-ops/*`. Binds AUTH + REALTIME + CONTENT + TENANCY + the Workers AI binding (`AI`) + the core DB. No cron |

| D1 database | Bound to | Migrations |
|---|---|---|
| kwapso-core-staging | kwapso-auth-staging | `cd workers/auth && npx wrangler d1 migrations apply kwapso-core-staging --env staging --remote` |
| kwapso-core | kwapso-auth | `cd workers/auth && npx wrangler d1 migrations apply kwapso-core --remote` |

Deploy order when several change: **realtime → auth → tenancy → content → data-ops → mcp → gateway → portal-gateway** (root scripts do this, both gateways go LAST, for the same reason: each service-binds the domain workers it forwards to, realtime FIRST because every other worker service-binds it: auth/tenancy/content/data-ops publish change pings, the gateway routes the WebSocket. Deploying a binder before its target fails with "Worker not found", this bit us on the first production deploy, when `kwapso-realtime` didn't exist yet; FIXED 2026-06-22). content and data-ops slot in before the gateway because the gateway routes `/api/content/*` and `/api/data-ops/*` to them, and **data-ops binds CONTENT + TENANCY** (so both must exist before data-ops). **COLD-START (a genuinely fresh account, every `new-app` fork):** realtime also binds AUTH, so `realtime → auth` and `auth → realtime` form a cycle; the very first deploy dies with **`code 10143`** ("Worker not found" for the not-yet-deployed side). This is NOT a "usually auth already exists" footnote, on a fresh account NEITHER exists. Break it once: in `workers/realtime/wrangler.jsonc` **temporarily remove the AUTH service binding**, run `npm run deploy:*` (realtime deploys, then auth, …), then **restore the binding and redeploy realtime**. Do it on staging AND production. (A future improvement automates this in the deploy script. BASE-IMPROVEMENTS.) The realtime worker defines two Durable Object classes, `TeamChannel` and `TeamInterest` (`migrations` tags `v1` and `v2` in its wrangler.jsonc; no team-DB migration involved, and neither holds app data — the interest registry holds only which shards are listening for what; fact updated 26 Aug 2026, this sentence used to name one class). Durable Objects need the Workers Paid plan.
**Scheduled work, tenancy AND content both run crons, not tenancy alone.**

- **tenancy, nightly at 03:10 UTC**, the estate's housekeeping: it sizes **every**
  D1 database in the account (`kwapso-core` included, which the old `team-`-prefix
  filter could never alarm on) at 80% of the 10GB cap, and sweeps the core
  database's spent sign-in rows (`login_codes`, `login_sends`, expired `sessions`;
  see DATA-MODEL.md "Retention in core"). Both jobs record a failure OR a hit
  ceiling to `error_logs` (R12), so "we stopped early" can never read as "there was
  nothing to find".
- **content, `*/15 * * * *` and `0 7 * * *`**, the knowledge base's **sweep** (every
  fifteen minutes, one bounded slice per kind, resuming from the cursor in
  `knowledge_ingest`) and the **morning digest** (07:00 UTC). This page said "No
  cron" for content until 12 Aug 2026, which is the worst possible thing for an
  operations doc to be wrong about: unattended work has no user watching it, so the
  only way anyone learns it broke is by looking, and nobody looks for a job the
  runbook says does not exist. Both handlers record their failures to `error_logs`
  under R12, and the ingest row also carries when each kind last SUCCEEDED, so a
  sweep that has been quietly failing for a week is visible in one read.
- **The Google autopilot rides the same `*/15` tick** (owner, 19 Aug 2026 — and
  this page said nothing about it until 26 Aug 2026, the exact failure the
  paragraph above names about itself, for the one job that touches a third
  party's API on a person's behalf). Inside each tick, content loops the team's
  CONNECTED people and acts as each in turn — there is no team-wide Google
  credential, deliberately — sweeping that person's own Drive documents, mail,
  calendar entries and Chat messages into the knowledge base, and hunting the
  transcript of each due meeting (calendar attachment, then a shared Drive
  folder, then Google's own notice in their mail). A capture publishes both
  `meetings` and `knowledge`, so the screens hear it. Bounded three ways (people
  per team per tick, meetings per person per tick, a horizon past which a meeting
  is abandoned), idempotent at the database (the claim rides
  `transcript_captured_at IS NULL`, so a tick racing the manual button captures
  once), and every failure is recorded per person per stage under R12. Since
  26 Aug 2026 a meeting Google keeps refusing also stops being selected after
  **8** thrown tries (`meetings.transcript_attempts`, capped by
  `TRANSCRIPT_ATTEMPT_CAP` in `shared/workers/limits.ts`; team migration `0055`),
  so one poisoned meeting cannot eat the sweep's budget every quarter hour.
  `workers/content/src/lib/google-autopilot.ts`'s header is the full posture
  statement, including the sentence somebody will want later: the server now uses
  a person's connection on a schedule, including while they are asleep, and the
  owner asked for exactly that.

**Where to look when a cron misfires:** `GET /api/data-ops/admin/errors?status=open`
(x-admin-key) for the recorded failure, and `GET /api/content/knowledge` for the
per-kind ingest state behind the sweep.
New migrations must be applied to BOTH databases before deploying workers that need them. The agent-modules build (2026-06-23) adds **core migrations 0008 (`importable_databases`) / 0009 (`agent_usage`) / 0010 (`agent_credits`)**, the credit-usage view (2026-07-01) adds **0011 (`agent_usage_log`, the per-command "why" trail)**, the error store (2026-07-03) adds **0012 (`error_logs`, the central error log, ERROR-HANDLING.md)**, and the MCP front desk (2026-07-07) adds **0013 (`mcp_tokens` + `sessions.team_pin`)**. WITHOUT 0013 the whole MCP surface hits a missing table, and the honest usage log (2026-08-04) adds **0014 (`agent_usage_log.kind`, action rows team-visible, prompt rows the author's; WITHOUT it every usage write fails its best-effort insert, so the log silently stops filling)**, and the send/token hardening (2026-08-10) adds **0015 (`login_codes.sent_ip` + `sends`, the send throttle's ledger; WITHOUT it every sign-in code request 500s on a missing column)** and **0016 (`mcp_tokens.expires_at`, backfilled so live tokens keep a full term; WITHOUT it every MCP call 500s)** and **0017 (`login_sends`, the send ledger the sign-in budget counts, since a budget kept on a column that changes hands is not a budget; WITHOUT it every sign-in code request 500s on a missing table)**, and the throttle + duplicate hardening (2026-08-11) adds **0018 (an index on `email_change_codes (new_email, …)`, the email-change throttle now counts by TARGET address as well as by caller, because sign-up is open and a per-account ceiling bounds nothing; WITHOUT it the door still refuses correctly, it just scans a table an attacker can grow)**, and the error-store ceiling (2026-08-11) adds **0019 (`idx_error_logs_bucket_at`, the index behind `logError`'s hourly per-caller bound, ERROR-HANDLING.md; WITHOUT it every error write full-scans `error_logs`, which is the one table built to grow, nothing breaks, it just gets slower and slower)**, apply them to `kwapso-core` + `kwapso-core-staging` (same command as below, any of the core-bound workers can run it; 0011 is applied on staging, production is owner-gated), and the **team-schema migrations, fifty-five today (26 Aug 2026), `0001_team_base` … `0055_transcript_gives_up`** (the live list is `TEAM_MIGRATIONS` in `workers/tenancy/src/team-schema.ts`. **read it there**, because this sentence is a copy and has now drifted twice — it said "… `0010_ticket_vocabulary`" for eleven migrations, then "… `0027_task_admin`" for twenty-eight more. The ones DATA-MODEL.md walks through individually stop at `0027`; from `0028` on, read the migration's own header comment in the file, each is written to be read. The ones between `0011` and `0027` are `0012_knowledge`, `0013_process_maps_and_money`, `0014_stories_and_sprints`, `0015_work_logs`, `0016_todos_and_tasks`, `0017_triage_duty`, `0018_agency_internal`, `0019_google_connections`, `0020_knowledge_vectors`, `0021_meetings`, `0022_knowledge_files`, `0023_activity_feed_index`, `0024_contacts_and_company_shape`, **`0025_purge_learning_marketing_programmes`** (the purge of 17 Aug 2026: it adds `mark` / `name_de` / `description` / `standard_days` to `selectable_data`, folds the ten retired programmes onto the **sprint types**, and drops `learning`, `learning_progress`, `marketing_posts` and `programs`. The CREATE statements for those four also left migrations `0004` and `0018` themselves, so a team built from the file today never has them, every DROP here is `IF EXISTS` for exactly that reason. WITHOUT it an existing team keeps four dead tables and every sprint type comes back bare: no mark, no German name, no standard length), **`0026_retire_duplicate_dropdown_values`** (WITHOUT it every team born before the seed was guarded keeps 26 duplicated dropdown values, and each of those words appears two, three or four times in every picker in the app; the oldest copy of each `(type, value)` survives, ties broken by id, and the losers are **deactivated, never deleted**, reversible from the Dropdown values screen) and `0027_task_admin`, each described in DATA-MODEL.md; the earlier recent ones are **`0004_modules`**, help, help_threads, data_import_sessions, agent_threads, agent_messages, **`0005_help_stakeholders`**, **`0006_import_batches`** (the agentic multi-file import shell, AGENTIC-IMPORT.md), **`0007_customer_spine`** (accounts + account_links + portal_users, the customer spine the whole client portal reads; WITHOUT it every account and portal route hits a missing table) and **`0008_portal_current_account`** (`portal_users.current_account_id`, the pointer the account switcher stands on; WITHOUT it switching companies fails and a client who belongs to two is stuck in the first one), **`0009_help_account`** (`help.account_id`, the column the ticket fence reads) and **`0010_ticket_vocabulary`** (the section a person reads became **Tickets**, and its dropdown vocabulary carried the old name in its DATA: this relabels every `Help type` / `Help status` row to `Ticket type` / `Ticket status`. WITHOUT it an existing team's ticket-type picker comes back EMPTY, the reader looks for the new name and the rows still say the old one)), rolled to every team DB via `POST /api/tenancy/admin/migrate-teams` (x-admin-key). Apply BOTH before deploying content/data-ops.

**Core migration 0020 (`error_logs.request_id`), apply BEFORE deploying any worker (2026-08-14).** Both public doors now mint a request id and every worker records it with its crash (`shared/workers/trace.ts`), so one failing click is one query instead of eight rows nobody can line up. **WITHOUT it the INSERT in `logError` names a column that does not exist, and because recording an error is contractually forbidden from throwing, it fails SILENTLY: the error store simply stops filling while every worker looks healthy.** That is the one failure mode in this list you would not notice, so apply it to `kwapso-core` and `kwapso-core-staging` first, then deploy in the usual order.

**Core migrations 0021–0026, absent from every apply note above until 26 Aug 2026** — they shipped between 14 and 18 Aug and each one's header comment in `db/core/` is the full story. In one breath: **0021** (`retention_scan_indexes`, the two indexes the nightly sweeps scan by — `sessions (expires_at)` and `error_logs (at)`; WITHOUT it nothing breaks, the sweep just full-scans the biggest table in core every night), **0022** (`db_growth`, tonight's size beside last night's, what `daysUntilFull` is computed from — see "Growth watch" below), **0023** (`team_module_moves`, the module mover's resumable ledger; WITHOUT it a move interrupted halfway leaves no record of how far it got), **0024** (`users.language`, the language a person reads the app in), **0025** (`team_legal`, the agency's own registered name, address, registration/tax numbers and phone on the team row), and **0026** (`users.scale`, how big a person wants the app — text and spacing together). Apply all six to `kwapso-core` + `kwapso-core-staging` with the same command as the rest.

**Core migration 0027 (`agent_usage_log` token columns), apply BEFORE deploying data-ops or content (2026-08-18).** The assistant's stable prefix — the tool catalogue plus the system prompt, about nine tenths of every turn's input — is now sent with an Anthropic prompt-cache breakpoint (`AGENT_PROMPT_CACHE`, `off` | `5m` | `1h`, unset means `5m`). Whether that saves anything depends entirely on the HIT RATE, and a hit rate cannot be reconstructed afterwards, so each usage row records what the turn actually cost: `input_tokens`, `output_tokens`, `cache_write_tokens`, `cache_read_tokens`. **WITHOUT it the INSERT in `logUsage` names columns that do not exist, and because recording usage is contractually best-effort it fails SILENTLY — the usage log simply stops filling while the assistant looks perfectly healthy** (the same failure shape as 0014 and 0020). The columns are nullable on purpose: rows written before it were never measured, and a back-filled zero would read as "measured, and it was free".

**Team migration `0037_app_logo`, apply BEFORE deploying tenancy (2026-08-18).**
`apps.logo_url`, the client's own mark on the app tile. **WITHOUT it every write
through the apps door 500s on a missing column**, which is the loud failure; the
quiet one is the other way round — a tenancy worker that predates the column
answers `POST /api/tenancy/apps/update` with a cheerful `{ ok: true }` and stores
nothing, so `scripts/glide-visuals.mjs` would report twenty-five logos moved onto
an apps screen still full of stage glyphs. That script reads every row back for
exactly this reason and says `UNPROVEN` rather than `moved`. Roll it out with
`POST /api/tenancy/admin/migrate-teams` (x-admin-key) first, then deploy.

## Backing up, and getting the rows back

`node scripts/backup.mjs <staging|production>`, read-only, refuses to run against the wrong Cloudflare account, and dumps the core database plus every team database core points at. **It needs `CLOUDFLARE_ACCOUNT_ID` (must equal kwapso's account id — the script carries it and refuses anything else) and `CLOUDFLARE_API_TOKEN` in the environment, and `scripts/reset-all.mjs` refuses without the same `CLOUDFLARE_ACCOUNT_ID` guard** — both documented commands fail on a clean shell until they are exported (run them through `cf-exec`, which sets both). The restore paths (Time Travel for a live database inside 30 days; a dump for one that is gone), what is deliberately NOT backed up, and the date the restore was last rehearsed all live in **[RESILIENCE.md](RESILIENCE.md)**.

**WARNING, before any usage pull or cleanup that lists D1 databases:** kwapso's per-team databases share the Cloudflare account with another product (rest-o) that uses the SAME `team-<ulid>` naming, one of them live production. Derive the list of kwapso's databases from the core `teams.database_id` column — the way `backup.mjs` and `reset-all.mjs` already do — never from a name-prefix filter, which excludes kwapso's own shards and includes somebody else's.

**The native-binding fast path is wired per team, by hand.** Every worker reaches team databases over the D1 REST door by default; a deployment that HOLDS a binding for a particular database uses it directly instead (single-digit-ms instead of an API round trip — `natives` in `shared/workers/d1-rest.ts`). The wiring is a paired declaration in the worker's `wrangler.jsonc`: a `d1_databases` binding named `TEAM_DB_<n>` plus a var `TEAM_DB_<n>_ID` carrying that database's id — `nativeTeamDatabases` in `shared/workers/gating.ts` matches the pairs up and `d1Query` picks the direct path whenever the id is in the map. When a tenant grows past REST-door comfort, add the pair (top-level AND under `env.staging`, envs don't inherit) and redeploy; nothing else changes, and removing the pair falls the worker back to the REST door with no code change.

## Secrets (set once per env, never in git)

- `cd workers/auth && npx wrangler secret put RESEND_API_KEY --env staging` (and again without `--env` for production)
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` on **kwapso-auth + kwapso-auth-staging** (ADDED 2026-08-11. "Continue with Google"). Both halves, both environments; wrangler envs do NOT inherit, and the door checks for BOTH before it offers the button, so a half-set environment simply shows the email code and says so. The id is not itself a secret (it rides the redirect URL) but is set the same way so neither value is ever committed. From the `kwapso-signin` OAuth client (SCOPE ch.03. External, basic scopes only, no Google review); **never** the `kwapso sync` client, which carries Drive/Gmail/Calendar scopes and has no business on the sign-in door.
  ```
  cd workers/auth
  npx wrangler secret put GOOGLE_CLIENT_ID     --env staging   # and again with no --env for production
  npx wrangler secret put GOOGLE_CLIENT_SECRET --env staging   # and again with no --env for production
  ```
  **The four redirect URIs to register in the Google console** (Authorized redirect URIs on the `kwapso-signin` client), one per front door per environment, character for character, because the callback must answer at the hostname the person started at:

  | Environment | Front door | Authorized redirect URI |
  |---|---|---|
  | production | agency app | `https://agency.kwapso.app/api/auth/google/callback` |
  | production | client portal | `https://client.kwapso.app/api/auth/google/callback` |
  | staging | agency app | `https://agency-staging.kwapso.app/api/auth/google/callback` |
  | staging | client portal | `https://staging-client.kwapso.app/api/auth/google/callback` |

  The two origins the worker will bounce a person back to are its `APP_ORIGIN` + `PORTAL_ORIGIN` **vars** (in `workers/auth/wrangler.jsonc`, per environment), anything else is refused before the request ever reaches Google, so the callback cannot become an open redirect carrying a session cookie. Change a hostname and you must change it in BOTH places: the var and the Google console.
- `CF_D1_TOKEN` (Account→D1→Edit) on kwapso-tenancy + kwapso-tenancy-staging. SET 2026-06-12 (team creation live). `ADMIN_KEY` (maintenance endpoints: migrate-teams, db-sizes, move-module, create-team — the ops door the seed and the smoke stand a team up through, since the user door is closed). SET on both envs 2026-06-12; rotate anytime with `wrangler secret put ADMIN_KEY`.
- `INTERNAL_KEY`, shared secret guarding auth's `/internal/send-email` (tenancy sends it; auth enforces it). UPDATED 2026-08-04: every internal door now **FAILS CLOSED**, send-email, log-error and mcp-session all REFUSE every caller while `INTERNAL_KEY` is unset (a half-finished bootstrap must not run with the doors open), and a mismatch is a hard reject. The key MUST match across `kwapso-auth*` + `kwapso-tenancy*` + `kwapso-content*` (help/notify emails via auth) + `kwapso`/`kwapso-staging` (the AGENCY GATEWAY, it forwards client error beacons to auth's /internal/log-error; ADDED 2026-07-03) + `kwapso-portal*` (the PORTAL GATEWAY, same beacon door, same seam; ADDED 2026-08-10, without it a crash on a client's phone is console-only) + `kwapso-mcp*` (it mints team-pinned sessions via auth's `/internal/mcp-session`; ADDED 2026-07-07, omit it and the whole MCP surface can't authenticate), and it MUST be set in EVERY env before the member-notification email feature ships (so "when set" is not an optional/skippable path in production). Defense-in-depth alongside `workers_dev:false`.
- `PUBLIC_APP_URL`, a **var** (not a secret) in `workers/tenancy/wrangler.jsonc`, set per env (staging + production, SET 2026-07-01): the absolute origin used in outbound email links (invites). Without it an agent-sent invite email would link to the internal binding host. See EDGE-CASES §4.
- `CF_D1_TOKEN` on **kwapso-realtime + kwapso-realtime-staging** (ADDED 2026-08-10, the live-channel fence). A joining socket now resolves the caller's account scope through the same guard corridor the API uses, so a client-portal login hears only its own world instead of every account id in the agency (DURABLE-OBJECTS §2). Same scoped Account→D1→Edit token as tenancy/content/data-ops; `CF_ACCOUNT_ID` rides along as a var in `workers/realtime/wrangler.jsonc`. **Set it before deploying realtime**: with no token the team channel refuses every socket (fail-closed, we cannot tell staff from a client login), which costs live sync until it's set. `cd workers/realtime && npx wrangler secret put CF_D1_TOKEN --env staging` (and again without `--env`).

### Agent-modules secrets + vars (BUILT 2026-06-23, `kwapso-content*` + `kwapso-data-ops*`)

- `CF_D1_TOKEN` (Account→D1→Edit) on **kwapso-content + kwapso-content-staging** AND **kwapso-data-ops + kwapso-data-ops-staging**, both reach per-team databases over the one REST door, same as tenancy. Set per env: `cd workers/content && npx wrangler secret put CF_D1_TOKEN` (and `--env staging`); same for `workers/data-ops`.
- `INTERNAL_KEY` on **kwapso-content*** (it calls auth's `/internal/send-email` for ticket reply/@mention notifications), same value as auth/tenancy.
- `ADMIN_KEY` on **kwapso-data-ops*** (guards the two owner-only endpoints below), same as the tenancy maintenance key. data-ops also forwards the caller's session cookie to content/tenancy (act-as-user), so no extra cross-worker secret is needed for the import/agent executor.
- ~~`ANTHROPIC_API_KEY`~~ **REMOVED 29 Aug 2026.** The assistant ran on Claude for two days. The owner disabled the key, the Anthropic transport was deleted, and the secret was removed from both environments. There is nothing to set: the brain is Workers AI over the `AI` binding, so a worker deployed with no secrets at all still has a working assistant. Remaining data-ops secrets are `ADMIN_KEY`, `CF_D1_TOKEN` and `INTERNAL_KEY`.
- **Vars (in `workers/data-ops/wrangler.jsonc`, not secrets):** `AGENT_MODEL` (a **Workers AI** model id, default **`@cf/zai-org/glm-5.3-flash`** — it bills a cached token at a fifth of a fresh one, which is why it was chosen over `@cf/openai/gpt-oss-120b`, which caches nothing at all) + `AGENT_EFFORT` (reasoning effort, default **`low`**; inert on Workers AI models, kept for the day a provider takes it again) + `AGENT_FREE_DAILY` (**the app's own daily allowance**, how many free assistant actions a team gets each day inside kwapso. The code default is 25, both environments ship 50 in the checked-in wrangler vars — and **staging also ships `AGENT_NO_DAILY_CAP: "true"`, so 50 is what a team actually gets on PRODUCTION only**: on staging the counters still fill and the usage log still writes, but the refusal door is propped open and nothing is ever refused for running out — `shared/workers/credits.ts` returns an unreachable cap. Never set that var to `"true"` on production; `credits-invariant.test.ts` fails the build if a production vars block it compares carries it — and what it compares is data-ops and content, the two spenders it was written for. *(Fact updated 26 Aug 2026: the one allowance now has THREE spenders, each refusing with a clean 429 `over_quota` when it is dry — the assistant and the import planner on data-ops, the composed knowledge answer on content (`knowledge.ts` calls `consumeAiUnit`), and the process-map extraction on tenancy (`process-drafts.ts`, the "propose a map (spends AI)" door). Tenancy sits OUTSIDE the invariant's comparison today; its wrangler carries the var as `"0"` in both env blocks, which is inert — only the literal `"true"` props the door open — but nothing machine-checks that third worker yet.)* This is not your Cloudflare bill or any provider limit; it is a number this app enforces on itself) + `WORKERS_AI_MODEL` (the model for the CHEAP INLINE jobs only — `cheapText`, the help-reply draft, the conversation title, the composed knowledge answer — default **`@cf/meta/llama-4-scout-17b-16e-instruct`**. It is a separate seam from `AGENT_MODEL`: this one drives the cheap inline jobs, that one drives the agent, and since 29 Aug 2026 both are Workers AI). Swap the AGENTIC brain by editing `AGENT_MODEL` or `selectModel()`, "model is a battery" — but note the battery is now required rather than optional. Other Workers AI models for the INLINE path: `@cf/openai/gpt-oss-20b` / `gpt-oss-120b` (agentic), `@cf/moonshotai/kimi-k2.6` (frontier, premium, best chat). `cheapText` (inline jobs) always uses the Workers AI var. **HISTORY / GOTCHAS:** (1) the old default `@cf/meta/llama-3.1-8b-instruct` was DEPRECATED+removed 5/30/2026, calling it threw and crashed the agent on EVERY message (even "hi"); always check a model id is still served. (2) Workers AI models need the **OpenAI-wrapped tools format** `{type:"function",function:{…}}` (a flat shape 400s); the seam handles this. (3) `env.AI.run` returns a PARSED OBJECT; only `{returnRawResponse:true}` returns a `Response`, and getting that backwards is a silent outage on every turn. (4) Cloudflare caches a prompt PREFIX only when the request carries `x-session-affinity`; without it the cache reports zero forever and nothing says so. Docs: developers.cloudflare.com/workers-ai/function-calling/ + /models/llama-4-scout-17b-16e-instruct/.
- **Workers AI binding:** `kwapso-data-ops*` declares `"ai": { "binding": "AI" }` in its wrangler.jsonc, no secret, just the binding (Workers AI is metered on the account). This powers every `cheapText` call. It no longer powers an agent fallback — that path was deleted on 2026-08-27.

### Google connections (per person. Drive, Gmail, Calendar, Chat)

Three secrets on **kwapso-content + kwapso-content-staging**, and none of them is
optional-in-parts: with any one missing, the Connect button is not offered and
the rest of the product is untouched. That is deliberate, a half-configured
environment must never walk somebody through a Google consent screen and then be
unable to keep what they granted.

- `GOOGLE_CONNECT_CLIENT_ID` + `GOOGLE_CONNECT_CLIENT_SECRET`, the **`kwapso sync`**
  OAuth client (SCOPE ch.03), the one that carries Drive/Gmail/Calendar/Chat
  scopes and goes through Google's verification. **Never** the `kwapso-signin`
  client, whose whole point is that it asks for nothing frightening; and never
  the reverse either, `workers/auth`'s `GOOGLE_CLIENT_ID` must stay the sign-in
  client. Two apps, two purposes, and mixing them makes everybody who wants to
  log in walk past a mailbox consent screen.
- `GOOGLE_TOKEN_KEY`, 32 random bytes, base64. The key the stored refresh and
  access tokens are encrypted under. It lives nowhere the database is, which is
  the whole point: a dump of `google_connections` without it is a list of email
  addresses. Mint one with `openssl rand -base64 32`. **Rotating it invalidates
  every stored connection**, people reconnect, which is one click each, and no
  data is lost.

```bash
cd workers/content
npx wrangler secret put GOOGLE_CONNECT_CLIENT_ID     --env staging   # and again with no --env for production
npx wrangler secret put GOOGLE_CONNECT_CLIENT_SECRET --env staging
npx wrangler secret put GOOGLE_TOKEN_KEY             --env staging
```

**Two redirect URIs to register on the `kwapso sync` client**, one per
environment, character for character. Google refuses a mismatch:
`https://agency.kwapso.app/api/content/google/callback` and
`https://agency-staging.kwapso.app/api/content/google/callback`. Only the AGENCY
origin, ever: the client portal forwards none of these doors and clients get no
Google surface at all.

**Scopes to request on the client** (each service is consented separately, so a
person connecting Drive is never shown a mailbox prompt): `drive.readonly` +
`drive.file`; `gmail.readonly` + `gmail.compose` + `gmail.send` + `gmail.modify`;
`calendar.readonly`; `chat.messages` + `chat.spaces.readonly`; plus `openid email`
on all four, to label which account was connected. The single source is
`GOOGLE_SCOPES` in `workers/content/src/lib/google-oauth.ts`; this list is a copy
for the person filling in Google's console.

**THE CALENDAR ASK IS READ-ONLY AS OF 19 AUGUST 2026**, and the reconnection this
page warned about was paid. What it warned about is worth keeping, because it is
the trap and it applies to every future scope change on this client:

**A grant at Google is an additive SET per OAuth client.** It does not remember
what the app asked for last time; it remembers what the person has ever approved.
So narrowing the string here narrows nothing on its own — an account that already
approved `calendar.events` goes on holding it, and the next connect returns a
token that STILL carries the write scope, past a consent screen that asks nothing
new. Three things together make a narrowing real, and none of them works alone:

1. **Disconnect revokes at Google** (`revokeAtGoogle`). Dropping our row stops US
   using a grant and does nothing to the grant. Revoking is what empties the set.
2. **Connect forces a fresh consent** — `prompt=consent`, and
   `include_granted_scopes=false` so Google does not mint the token over
   everything ever approved.
3. **The granted scopes are read back** off the token response and compared with
   the ask, both directions. A grant wider than the ask, or short of it, is
   written on the person's own Settings card in words. That is the only leg that
   produces evidence rather than confidence.

**AND THE FOUR SERVICES ARE ONE OAuth CLIENT.** Four consent screens, four rows,
one grant. So revoking any of them can end all four, and the operational
consequence is the one to hand somebody: **to change a scope, disconnect ALL FOUR
first, then connect them again.** Disconnecting only the one being narrowed leaves
the old scope in the set under the other three. If a warning survives that, the
last resort is removing kwapso at `myaccount.google.com/permissions` and
connecting again, which empties the set unconditionally.

It still cannot be staged: the scope list is one string on one OAuth client shared
by staging and production.

### R2 buckets (BUILT 2026-06-23, bound to `kwapso-content*`)

One bucket PER MODULE, per-team key prefix inside (the R2 golden rule). Create both per env before deploying content:

- `kwapso-learning-media` + `kwapso-learning-media-staging`, the bytes that outlived their module (bound `LEARNING_MEDIA` on content **and on the gateway**, which serves them at `GET /media/learning/*`). **Nothing writes here any more.** Learning was purged on 17 Aug 2026 and its upload doors went with it, but its 41 articles had already been indexed into the knowledge base and their bodies still name the images and clips uploaded alongside them. The bucket, the two bindings and the serving route all stay so that what was written before can still be read. Do not delete it; do not build anything new on it.
- `kwapso-help-media` + `kwapso-help-media-staging`, ticket attachments; the bucket name follows the table, which is still `help` (bound `HELP_MEDIA`; the attachment UI hook itself is deferred. See AGENT-MODULES-PLAN).
- `kwapso-media` + `kwapso-media-staging`, profile photos + team logos (bound `MEDIA` on the gateway **and on content**, which serves them at `GET /media/*`). Pre-dates the module buckets; created with the base.
- `kwapso-internal-media` + `kwapso-internal-media-staging`, the agency's OWN files: brand assets, staff photos, certificate PDFs (bound `INTERNAL_MEDIA` on content). ADDED 2026-08-12 with the agency-internal modules; this list omitted it, so BOOTSTRAP §3 created eight buckets while this page named six.

**Eight buckets, four names × two environments.** Create with `npx wrangler r2 bucket create <name>` (run once per bucket per account), the same eight BOOTSTRAP §3 lists, and the same eight §10 tears down. (Import has NO bucket of its own. CSV text is uploaded into the import session, not R2.)

### The knowledge base's vector index (Vectorize)

Not a bucket and not a database, so it is easy to miss on a fresh environment: the
content worker binds `KNOWLEDGE_INDEX` to `kwapso-knowledge` / `kwapso-knowledge-staging`.
**Create the index and all nine metadata indexes BEFORE anything is ingested**.
Vectorize does not index metadata retrospectively, and getting the order wrong is not
an error, it is a knowledge base whose compartments silently do not narrow. The
commands, the dimension count and the recovery path are BOOTSTRAP.md §3b. The binding
is OPTIONAL: without it the knowledge base answers from its word index alone rather
than refusing every question, a real degradation, and a visible one (`reason` on
every answer says what it searched).

### Owner-only endpoints (data-ops, x-admin-key, same key as the tenancy maintenance actions)

- `POST /api/data-ops/admin/seed-targets`, refresh the GLOBAL `importable_databases` catalog's LABELS (display names / descriptions / schemas). **No longer a step anyone must remember**: the catalogue reconciles itself against the code on read (R13, a fresh env's picker heals on first open; a target the owner switched off stays off, and this door no longer re-activates it either).
- `GET /api/data-ops/admin/errors?status=open|resolved|all&limit=N`. Read the central error log (newest first). `POST /api/data-ops/admin/errors/resolve` `{ id, note }`, mark one resolved with the what-went-wrong note. See ERROR-HANDLING.md.
- `POST /api/data-ops/admin/grant-credits`, top up a team's AI credit balance (the purchasable half of the agent quota; the free half is **the app's own daily allowance**, `AGENT_FREE_DAILY`, code default 25, but both environments ship **50**). This is the seam real payments wire into later.

### Public surface (LOCKED): only the two gateways are public

auth, tenancy, realtime, content, data-ops and mcp, the six domain workers, all set `"workers_dev": false` **and `"preview_urls": false`** (BOTH, top-level AND env.staging, envs don't inherit, and a per-version preview URL would be another public door), so they have NO public `*.workers.dev` URL and are reachable ONLY via service bindings. The two public addresses are the **agency gateway** (`kwapso` / `kwapso-staging`) and the **portal gateway** (`kwapso-portal` / `kwapso-portal-staging`), one per front door, and no more. That is what makes `/internal/send-email` (and the agent/import act-as-user surface) safe: no public route can reach `/internal/*`, the agent, or the act-as-user surface. Never add a public route/`workers_dev` to a worker that isn't one of the two gateways.

The two gateways set `"preview_urls": false` too, the reasoning above ("a per-version preview URL would be another public door") always applied to them and was simply never written down, so until 11 Aug 2026 every uploaded-but-undeployed version of BOTH front doors had a public address. They also set `"workers_dev": false` in production and `true` only under `env.staging`, so production is custom-domain-only. The whole posture is asserted per worker, per environment, in `workers/gateway/test/public-surface.test.ts`, a claim in this file is no longer the thing standing between a door and the internet.
- **Both environments are on the same commit as of 2026-08-06**, production was
  brought up from the pre-hardening build in one rollout: core migration `0014`
  applied to `kwapso-core` first, then every worker then on disk, realtime-first
  (seven at the time; the portal gateway landed on 2026-08-10 and made it eight).
  Verified
  on production: four worker healths, the test-login door refused (403) even when
  handed the staging key (`ENVIRONMENT: "production"` ships in the config), the
  activity door gating before scope resolution, and a forged-cookie beacon writing
  zero rows. Production auth holds only `INTERNAL_KEY` + `RESEND_API_KEY` (plus
  the two `GOOGLE_*` values once Google sign-in is switched on), no
  `TEST_LOGIN_KEY`, and the door would refuse it anyway.
- **Sign-in codes: a 60-second cooldown, never an hour-long lockout.** Asking for
  a code twice inside a minute returns `429 too_soon`. Past the hourly cap the
  live code is ROTATED in place (fresh secret, fresh TTL, fresh attempt budget)
  rather than refused, so nobody, including an operator retrying a flaky email,
  can be locked out of their own account. A CONSUMED code doesn't hold the
  cooldown: signing in on a laptop and then a phone works straight away.
- **The send door also throttles the CALLER, not just the address.** Every rule
  above is per email address, so one anonymous caller could still walk a mailing
  list. A caller (`CF-Connecting-IP`) may cause **30 codes an hour**, and the whole
  environment **300**, both counted as SENDS (a rotation is an email too) and both
  enforced inside the INSERT/UPDATE, so a burst can't outrun them. A request with
  no edge IP header joins ONE shared "unknown" bucket, absent never means
  unlimited. Refusals are `429 too_many_sends`. Raising either number is a
  one-line change in `workers/auth/src/lib/constants.ts` plus a deploy.
- **Access tokens expire and are capped.** An MCP personal access token lives
  `MCP_TOKEN_TTL_DAYS` (90) days and an account may hold 10 live ones
  (`shared/workers/limits.ts`); minting past the cap is a clean `409`, and an
  expired token is a clean `401 token_expired` on the very next call. Migration
  0016 gives every EXISTING token a full 90-day term from the moment it is
  applied, so applying it never breaks a working integration, but it does start
  the clock, so tell token holders before a long-idle environment is upgraded.
- **Team creation is capped per user**. `MAX_TEAMS_PER_USER` (default 5) counts
  teams the account CREATED, not teams it belongs to, and **deactivated teams
  still count** (their database still exists, so "create five, switch them off,
  repeat" would otherwise be an unbounded database generator). Raise it per
  environment as a var. Setting it to `0` means zero, not the default.
- **`AGENT_FREE_DAILY=0` means zero free AI**, not "fall back to 50". Every
  numeric var behaves that way now (`numberVar`). The one environment it cannot
  mean that in is one carrying `AGENT_NO_DAILY_CAP: "true"` — staging does — where
  the cap is not enforced at all, whatever the number says.
- **Uploaded files are capability URLs (a reasoned exception).** `/media/*` serves
  any object whose unguessable key you hold, no session, no membership check, no
  expiry. An ex-member who saved a link keeps it. Fine for photos and logos;
  fix it before launch if your product stores invoices, IDs or anything personal
  (BASE-MANUAL §5 has the patch).
- **Two reads return identity data behind a neighbouring right (a reasoned
  exception).** Stakeholder emails and the team creator's email ride `help:read`
  and plain membership. Tenant-scoped, so it is
  a wrong-right mismatch inside one team, never a cross-customer leak.
- Login codes: **a code appears NOWHERE but the user's inbox, in any environment.** The old `DEV_ECHO_CODES` echo (code in the response + a toast) is DELETED, code path and config var both, so configuration can't re-enable it. Automated runs (the smoke, the e2e suite) sign in through the **test-login door** instead: `POST /api/auth/admin/test-login` `{email}` with an `x-admin-key` header mints a NORMAL hashed-at-rest code (same TTL, same attempt cap, same per-hour throttle as the real send path) and returns it once; the normal verify door consumes it. Its holder can sign in as ANY account on that environment, so it carries **two independent locks**: (1) its OWN `TEST_LOGIN_KEY` secret on the auth worker, which FAILS CLOSED when unset, deliberately NOT the `ADMIN_KEY` maintenance key this same page tells you to set on tenancy and data-ops in BOTH environments, so one mistyped directory can never arm impersonation; and (2) a hard refusal when the worker's `ENVIRONMENT` var is `production`, which ships with the deploy. **Set it on STAGING only** (`cd workers/auth && npx wrangler secret put TEST_LOGIN_KEY --env staging`), production would refuse it anyway. The smoke + e2e read it from the environment: `export TEST_LOGIN_KEY=…` before `npm run smoke:staging` / the e2e suite. **`smoke:staging` also wants `ADMIN_KEY`** whenever its fixed account has no team — the state every reset leaves — because team creation is closed to users by design and the smoke stands one up through `POST /api/tenancy/admin/create-team`; without it the run stops with a clear FAIL naming exactly this.

### Resend (real login emails), production wiring

The send code is built (`workers/auth/src/lib/email.ts`); it needs two things,
both owner-only:

1. **API key**, create at resend.com → API Keys (Sending access). Set it:
   `cd workers/auth && npx wrangler secret put RESEND_API_KEY` (prod) and again
   with `--env staging`. The moment it's set, real emails send and the staging
   echo stops.
2. **Verified sender domain**. `EMAIL_FROM` in `workers/auth/wrangler.jsonc` is
   `kwapso <alerts@kwapso.app>` in both environments. Resend's own
   `onboarding@resend.dev` only delivers to the Resend account owner's inbox, so
   it is fine for our own testing and NOT for real users. To send from a new
   domain: add it in Resend, add the DKIM/SPF records it shows to that domain's
   DNS in Cloudflare, then set `EMAIL_FROM` to an address on it and redeploy.
   See "Email sending, the domain split" below for which domains are ours.

## Verify before shipping

- `npm run check` — lint, then TypeScript across every workspace, then every suite. Fast (no build), and it is what CI runs.
- `npm run check:built` — **builds both static exports, then re-runs both front-door suites against them.** Not the same check twice: a handful of assertions can only be true of a BUILT app, and until 18 Aug 2026 they quietly skipped whenever `web/out/` was absent, which on a fresh clone is always. The one they exist for is a minifier mangling — SWC constant-folds a template literal whose substitutions are compile-time constants, and folding the boot loader's mark once DROPPED text, so an SVG attribute reached the browser unterminated under a green build (`web/test/splash.test.ts`). Vitest compiles with a different toolchain and folds nothing, so no source-level test can see it. `REQUIRE_EXPORT=1` makes a missing export a failure rather than a skip. It costs one build plus about ten seconds, and `deploy:staging` / `deploy:production` call it in place of `npm run build` so the export these bytes are read out of is the one about to be uploaded.
- CI runs the same on every push (.github/workflows/ci.yml)
- Three more suites ship and are run by hand, none is part of `deploy:staging`:
  `npm run smoke:mcp` (the whole machine surface end to end, reads `SMOKE_BASE` +
  `TEST_LOGIN_KEY`), `npm run walk:mobile` (the scripted Playwright walk of both
  front doors at phone width), and `npm run test:e2e` (inside `web/`, the
  Playwright suite).
- deploy:staging ends with **two** live smokes, both must pass or the deploy is considered failed:
  - `scripts/smoke-staging.mjs` (`npm run smoke:staging`) — the AGENCY front door: the LIVE login → onboarding → team journey, plus the MCP front desk end to end.
  - `scripts/smoke-portal.mjs` (`npm run smoke:portal`) — the CLIENT front door, added 19 Aug 2026 because until then **half the product deployed unverified on every push**: the agency smoke never touched `kwapso-portal-staging`. It signs a client in at the portal's own hostname, knocks on **every** door in the gateway's `PORTAL_DOORS` allow-list (the census is derived from the table and from what the run actually called, so a door opened tomorrow is an untested door today and the run goes red), then attacks each of them with a second company's ids — list, search, by-id and by-write — with every negative's BAIT proved to exist first from the account that should see it. It also proves the two bugs of that week stay fixed: a deliverable whose visibility is revoked stops returning its file URL (grepped out of the whole response body, not read off one field), and no door reading the agency's own cost is reachable at the client's hostname (R24 — the doors are derived from `internal-money.ts`'s own exports, and each is asked twice: 404 at the client's hostname, 403 `client_login` at ours, to the same person).
  - It needs **both** base URLs: `SMOKE_BASE` (agency, staff build the fixtures there; defaults to the staging `*.workers.dev` name) and `SMOKE_PORTAL_BASE` (client; defaults to `https://staging-client.kwapso.app`, the REAL hostname — the Google sign-in door answers 400 at the workers.dev alias BY DESIGN, see the note under "Deploy config"), plus `TEST_LOGIN_KEY`. Its fixtures are fixed and found-or-created — the second run creates nothing.
  - `web-portal/test/portal-smoke.test.ts` guards the smoke itself at `npm run check`: that it is still wired into `deploy:staging`, that every door path it names is a real allow-list entry (a typo would 404, and a 404 is what half its checks are *looking* for), and that every resource in `PORTAL_LISTENERS` still has a door named for it, in both directions.

## Growth watch, the alarms, and what to do when one fires (scaling review 2026-08-14)

The nightly size check (`checkDatabaseSizes`, cron `10 3 * * *` on tenancy) sizes
**every** database in the account and writes a `db_alerts` row at 80% of D1's 10 GB
cap. Nothing DELIVERS that alarm: it lands in a table and a `console.error`, readable
through the owner-gated admin route, and nobody is polling either. **Until it is
wired to an email or a page, "we have alarms" means "we have a table". Check it
deliberately.** Recorded here rather than fixed because who gets paged, and how, is
an owner's decision.

| watch | where it comes from | the number | what to do when it trips |
|---|---|---|---|
| a database at 80% of 10 GB | `db_alerts` (nightly) | `ALERT_THRESHOLD_BYTES` | run the module mover for that team's biggest module; ~2 GB of headroom left |
| the size scan going blind | a `console.error` from `d1ListDatabases` | `D1_LIST_PAGE_CAP × 100` = 10,000 databases | the platform allows 50,000, raise the page cap before the estate passes 10,000, or the scan silently stops covering the rest |
| a cron lapping | a `console.warn` from `teamSlice` naming `window N/M` | `CRON_TEAM_CAP` = 200 teams | past one window a team is visited every M ticks: 15 min × M for the sweep, **M DAYS** for the morning digest. Two or three windows is late; more than that wants a work queue, not a bigger cap |
| a retention sweep not catching up | `error_logs`, recorded not just logged (R12) | `RETENTION_DELETE_CAP × RETENTION_PASSES_PER_TICK` = 200,000 rows/table/night | the shared core database is taking rows faster than a night can clear them, raise the passes, or shorten the window |
| the mover failing to drain | a thrown `move_drain_incomplete` naming the table | `MOVE_DRAIN_PASSES` | **urgent**: routing has already flipped, so reads are merged and those rows are duplicates. Empty the named table in the OLD database before the module is read again |

**And the trend, beside the position.** `GET /api/tenancy/admin/db-sizes` now also
returns `filling`: every watched database with its size and `daysUntilFull`, soonest
first. It comes from `db_growth` (one row per database, tonight's reading beside last
night's, `db/core/0022`), so the answer to "how long have I got" is computed from two
real measurements rather than eyeballed off an alarm. `daysUntilFull` is **null**
where it cannot be answered honestly, a database's first night, or one that is not
growing, because a very large number would read as a measurement. Bounded at
`CRON_GROWTH_CAP` (200) readings a night, biggest first.

**AND IT IS DELIVERED** (decided with the owner 14 Aug 2026). The nightly cron emails
`ALERT_TO` on the tenancy worker, `alaap@swiftstruck.com,alaap@kwapso.com`, staging and
production both, with one mail per TICK listing every database that crossed 80% and how
many days each has left at its current rate.

- **Once per NEW alarm**, not nightly while one is open. That is not a filter in the
  sender: `checkDatabaseSizes` already skips a database that has an open `db_alerts`
  row, so "new tonight" is the set it hands over. A standing problem stops mailing,
  because a nightly repeat is the mail people learn to filter and the one thing that
  must stay unfiltered is "something changed".
- **The trend rides inside the alarm**, not as a mail of its own. No mail while nothing
  is alarming.
- **A failed send is recorded, never swallowed**, `cron/size-alert` in `error_logs`
  (R12). The alarm ROW is the record and is already written; the mail is the
  notification, so a bad send must not fail the size check, and must not be quiet either.
- **`ALERT_TO` unset is itself recorded.** An environment with no recipient is a
  configuration state, but "a database crossed 80% and nobody was told" is exactly the
  silence this closes, so the cron records it rather than shrugging.

**Per-caller rate limiting is now on** (17 Aug 2026), and the thing that made it look
like config is worth keeping written down: neither gateway decodes a session, so
neither can key a limiter on a person, per-IP would put one client's whole office in
a single bucket, and a session lookup at the edge is an auth round trip on every good
request. So the limiter sits where the caller is ALREADY resolved: `teamContext`
(tenancy, content, data-ops, one call per request, every team-scoped door) and
`verifyToken` on the machine surface. `CALLER_LIMIT` is bound on those four workers in
both environments, 600 requests per caller per worker per minute
(`CALLER_REQUESTS_PER_MINUTE` in shared/workers/limits.ts says why 600).

- **It FAILS OPEN.** No binding, a throwing binding or a nonsense answer all allow the
  request, and the fail-open path logs rather than swallowing. A safety valve whose
  failure is an outage is worse than the surge it prevents.
- **Which means the binding can be added after the deploy**, in either order, with no
  window where the app is broken, and an environment that never gets it behaves
  exactly as the app did before.
- **Over the line is a 429** with one plain sentence: nothing was lost, wait a moment.
  No numbers in it, a real person meeting it is usually a stuck page retrying.
- **Auth's own doors are deliberately not covered here.** They have no session to key
  on (that is what they are for) and carry their own throttles already: the send
  budget, the per-address code cap and the OTP cooldown.
- **UNPROVEN UNTIL DEPLOYED:** the binding itself. `env.CALLER_LIMIT` does not exist in
  the local test runtime, so every test covers the seam's decisions and the config's
  shape, and none of them exercises Cloudflare's limiter. First deploy should watch for
  429s on ordinary reads, there should be none from real use.

## Local dev

- `npm run dev:auth` (auth worker on :8787, local DB; first time: apply migrations with `--local`)
- `npm run dev` (the agency app on :3000; /api proxies to :8787)
- `npm run dev:portal` (the client portal on :3001; /api proxies to auth :8787, tenancy :8788, content :8789)

## Notes

- The UI component library is **in this repo**, at `shared/ui/`, since 2026-08-22 — and
  since 2026-08-25 it is a PINNED dependency: `github.com/Kwapso/design` at the tag in
  `shared/ui/VERSION.json`, pulled by `scripts/sync-design.mjs`, with a hand-edit under
  `shared/ui/` turning the build red (`web/test/vendored-kit.test.ts` recomputes the
  content hash — see "The design system" above). There is
  nothing to install: it arrives with `git clone` like the rest of the
  source. It used to be the npm package `@kwapso/ui`, refreshed with
  `npm install github:Kwapso/kwapso_ui` — that command is now wrong and the package is gone
  from every `package.json`, from `node_modules` and from the lockfile. The library's own
  dependencies (Radix, recharts, sonner and the rest) live in the ROOT
  `package.json`, because `shared/` sits outside both npm
  workspaces and node resolution from a file in there walks up to the repo root.
  (This list said `cmdk` until 26 Aug 2026; nothing imports it any more.)
- Neither front door carries its own theme. `web/app/globals.css` and
  `web-portal/app/globals.css` both import the kit's `shared/ui/tokens/tokens.css` +
  `shared/ui/motion/motion.css` — one master copy, imported, never copied — and each
  carries its own `@source` lines pointing Tailwind at `shared/ui/controls`,
  `structures` and `icons`, because the kit's own stylesheet no longer carries one
  (in its own repo vite scans everything). **Those `@source` lines are load-bearing:**
  without them Tailwind decides every library class is unused and strips it, which
  shows up as a build that passes and an app with no styling. (This note has now been
  rewritten twice: it described the installed npm package, then the 2026-08-22
  vendoring's `shared/ui/styles.css` + `@source "./registry"`, and neither is true
  since the kit swap of 2026-08-25.)
- Missing UI components are still placeholdered in `web/components/temp/` and tracked in
  UI-GAPS.md. Closing one is a kit change: built upstream in `Kwapso/design`, tagged,
  pulled with `scripts/sync-design.mjs`, then the import is swapped and the placeholder
  deleted here — never built by hand under `shared/ui/`, which turns the build red.

## Custom domains, the agreed naming (decided 2026-08-08)

Cloudflare's free Universal SSL covers `kwapso.app` plus ONE level (`*.kwapso.app`).
Two-level names like `clients.staging.kwapso.app` would need Advanced Certificate
Manager (paid per zone), so staging uses a hyphen instead of a dot.

| Surface | Environment | Custom domain | Gateway worker |
|---|---|---|---|
| Client portal | production | `client.kwapso.app` | `kwapso-portal` |
| Client portal | staging | `staging-client.kwapso.app` | `kwapso-portal-staging` |
| Agency app | production | `agency.kwapso.app` | `kwapso` |
| Agency app | staging | `agency-staging.kwapso.app` | `kwapso-staging` |

(The portal's two names were revised on 10 Aug 2026. See "Client portal hostnames"
below, which is the decision this table follows. The earlier `clients.kwapso.app` /
`clients-staging.kwapso.app` pair was never attached.)

**All four names are attached and serving**, checked with `dig` on 20 Aug 2026:
`agency.kwapso.app` and `client.kwapso.app` both resolve to the zone's Cloudflare
addresses and both answer from the production gateways — the agency door 401s on
`/api/auth/me` exactly as staging does, and the client door 404s `/api/data-ops/agent/chat`,
which is the account fence holding at the production hostname.

THIS PARAGRAPH HAS NOW BEEN WRONG IN BOTH DIRECTIONS. It claimed all four were live
before 11 Aug 2026 when only two were; it then claimed production was deliberately
unattached, and stayed on that sentence past the day somebody attached them. Neither
error was catchable by a test, because a DNS record is not in this repository — which
is why the instruction below is the whole of the defence. **Check it with
`dig +short agency.kwapso.app` before you write the sentence, in either direction.**

Attach one from the gateway worker: Workers & Pages → the worker → Settings → Domains
& Routes → Add custom domain. Cloudflare writes the DNS record and issues the cert.

**The addresses production answers on: the two custom domains above, and nothing
else.** Both gateways set `"workers_dev": false` at the top level (production) and `true` only under
`env.staging`, and `"preview_urls": false` everywhere. Until 11 Aug 2026 neither
declared either setting, so both defaulted to ON and `kwapso.kwapso.workers.dev`
answered 200, a live production front door, with a live sign-in behind it, at an
address no document mentioned. A `*.workers.dev` name answers BEFORE anything bound to
the custom hostname (a rate limit, a WAF rule, a country rule, an Access policy), so
leaving it on undoes whatever is configured there. `workers/gateway/test/public-surface.test.ts`
now asks every config this question per environment, and fails if the answer moves.

NOTE: `portal.kwapso.app` is NOT ours, it is the legacy Glide client portal, live and
serving clients. It stays untouched until cutover, which is a single DNS record change.

## Email sending, the domain split (decided 2026-08-08)

**kwapso.com is NOT ours to touch.** It carries the website and Google Workspace mail
for the business. Nothing in this project writes DNS there.

**kwapso.app is the app domain.** It has no mail of its own, so it is where the
application sends from: `kwapso <alerts@kwapso.app>`, verified in Resend (EU region).
The three Resend records live on their own subdomains (`resend._domainkey`, `send`) and
cannot affect kwapso.com in any way.

## Secret hygiene, a lesson learned the hard way (2026-08-09)

Worker secrets are COPIES, not references. When a credential is replaced, every
worker holding it keeps the old value until the secret is pushed again.

This bit us once: `CF_D1_TOKEN` was set on tenancy/content/data-ops from an early
Cloudflare token that was later replaced. Deploys kept succeeding, health checks
kept passing, and the smoke suite kept going green, because it reused an existing
team. The only symptom was real team creation failing with an opaque 500.

Rule: after replacing ANY credential, re-push it to every worker that holds it,
then verify with a path that actually exercises it (a FRESH signup, not a reused
one). The smoke suite passing is not proof that provisioning works.

### Client portal hostnames (decided 10 Aug 2026)

`portal.kwapso.app` is **taken**, it points at the live Glide client portal and
must not be reused. Pointing this app at it broke that link once already and the
DNS had to be put back.

The client portal uses:

| environment | hostname |
|---|---|
| staging | `staging-client.kwapso.app` |
| production | `client.kwapso.app` |

Both are single-label subdomains, so Universal SSL covers them (the same reason
the agency app is `agency-staging.kwapso.app` and not `agency.staging.…`). Moving
the portal to `portal.kwapso.app` later is the owner's call, once the Glide app
is retired, it is a DNS change plus a custom-domain swap, nothing in code.
