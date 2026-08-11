# Operations — kwapso

How this project ships. /ship-staging and /ship-production read the config below.

## Deploy config

- platform: cloudflare-workers (TWO gateway workers — one per front door — each serving its own static export + routing /api)
- staging_url: https://agency-staging.kwapso.app
- production_url: https://agency.kwapso.app
- portal_staging_url: https://staging-client.kwapso.app
- portal_production_url: https://client.kwapso.app
  (the custom domains are attached and serving — see "Custom domains" below. The
  `*.workers.dev` names still resolve as the workers' own subdomains; nothing
  advertises them any more, and two scripts still DEFAULT to the staging one:
  `scripts/smoke-staging.mjs` and `scripts/smoke-mcp.mjs` read `SMOKE_BASE`, so
  export it to run either against a custom domain.)
- build_command: npm run build (root; builds BOTH static exports — web/ → web/out and web-portal/ → web-portal/out). `npm run build:portal` builds the portal alone.
- deploy_staging_command: npm run deploy:staging (root; builds both frontends then deploys ALL eight workers realtime-first: realtime → auth → tenancy → content → data-ops → mcp → gateway → portal-gateway, staging names)
- deploy_production_command: npm run deploy:production (root; same eight-worker realtime-first order, production names)
- github_remote: origin (https://github.com/Kwapso/kwapso_cpaa.git)

## Reset config

The /reset-all skill reads this. DESTRUCTIVE — wipes data back to empty.

- reset_command: node scripts/reset-all.mjs <staging|production|both>
- global_db_staging: kwapso-core-staging
- global_db_production: kwapso-core
- what it does: deletes every team database THIS project's global `teams` table
  references (never other projects' DBs), then removes all rows from the global
  core DB while keeping the schema + d1_migrations. Self-tests with a read-back.

## Seed config — the staging sandbox

The other half of reset-all: fill an empty staging back up with one believable,
obviously fictional client world so there is something to click around.

- seed_command: `TEST_LOGIN_KEY=… ADMIN_KEY=… node scripts/seed-staging.mjs staging`
  (both keys live in `~/.config/kwapso/keys.env` — export them, never paste them)
- what it seeds: the "Kwapso sandbox" team, a **Client** role, two sandbox
  companies (one with two accounts nested under it), four contacts — one of whom
  belongs to *both* companies, which is the only way to exercise the account
  switcher — three portal logins on plus-addressed variants of the owner's own
  inbox, six tickets raised by the people who would really raise them, three
  learning articles and two extra Help types.
- how it writes: every row goes through a real gated endpoint, signed in as a
  real person — never straight into D1. Seeding through the front door is what
  proves the doors work and leaves genuine activity rows and live pings behind.
- idempotent: every record is matched on a natural key first (an account's
  reference, a person's email, an article's title, a ticket's description), so a
  second run writes nothing and says so.
- it checks the fence afterwards: signs in as a seeded client login and proves it
  sees its own company's world and nothing from the other one — eight PASS/FAIL
  lines, non-zero exit if any fails.
- STAGING ONLY (SCOPE ch.13: staging holds only the sandbox account; real client
  accounts are only ever invited on production). `production` needs an explicit
  `--confirm-production`, and auth's test-login door refuses production anyway,
  so the sign-in would fail even then.

## The pieces

| Worker | Staging name | Production name | What it is |
|---|---|---|---|
| gateway (`workers/gateway`) | kwapso-staging | kwapso | The AGENCY front door: serves web/out (marks `/_next/static/**` immutable) + routes /api/* (incl. the /api/realtime WebSocket) via service bindings, by PREFIX |
| portal-gateway (`workers/portal-gateway`) | kwapso-portal-staging | kwapso-portal | BUILT 2026-08-10. The CLIENT front door: serves web-portal/out + forwards a NAMED, CLOSED set of /api doors (an allow-list keyed `METHOD /path`, not a prefix fan-out) to auth / tenancy / content / realtime. Binds only those four — no DATAOPS, no MCP — so import, the assistant and the machine surface are unreachable from the client internet by construction. Its closed-door suite (`workers/portal-gateway/test`) derives the agency's whole /api surface off `web/lib/api.ts` and asserts every door the portal does not name 404s |
| auth (`workers/auth`) | kwapso-auth-staging | kwapso-auth | Login (strict email codes only), sessions, users |
| realtime (`workers/realtime`) | kwapso-realtime-staging | kwapso-realtime | The live switchboard: one `TeamChannel` Durable Object per **channel** fans out row-level `{resource,id,op}` pings over WebSockets. TWO channel scopes — `team:<id>` (per active team) and `user:<id>` (per signed-in user) — so each open browser holds two sockets; idle channels hibernate (≈ free). Binds AUTH + the core DB (to gate connections); holds no app data |
| tenancy (`workers/tenancy`) | kwapso-tenancy-staging | kwapso-tenancy | Members/roles/invites/config: team membership, role permissions, invitations + the nightly team-DB sizing cron + the per-team screen-recipe config store (served at GET/POST `/api/tenancy/config/screens`). UPDATED 2026-06-21: the planned `workers/config` worker was folded into tenancy — there is NO separate config worker |
| content (`workers/content`) | kwapso-content-staging | kwapso-content | BUILT 2026-06-23. The team-DB content modules: **Learning** (how-to items + per-user "mark done" progress) + **Help** (team-wide tickets + threaded replies, fixed status lifecycle). Routes `/api/content/*`. Binds AUTH + REALTIME + the core DB (gating) + two R2 buckets (`LEARNING_MEDIA`, `HELP_MEDIA`). No cron |
| mcp (`workers/mcp`) | kwapso-mcp-staging | kwapso-mcp | BUILT 2026-07-07. The external machine surface: personal access tokens (core `mcp_tokens`) bridged to team-pinned sessions (auth `/internal/mcp-session`), exposing the gated doors as MCP tools over JSON-RPC at `/mcp` (+ token management at `/api/mcp/tokens*`). Binds AUTH + TENANCY + CONTENT + DATAOPS + the core DB. Secret: `INTERNAL_KEY` (same value as auth/tenancy/content/gateway). No cron |
| data-ops (`workers/data-ops`) | kwapso-data-ops-staging | kwapso-data-ops | BUILT 2026-06-23. **CSV import** — the 3-stage single-target session AND the agentic multi-file **batch** import (analyze → plan → ordered run with foreign-key resolution; AGENTIC-IMPORT.md), both INSERT-ONLY + act-as-user through the gated create endpoints — plus full-field CSV **export** (`/api/content/learning/export`, `/api/tenancy/roles/export`) + **the AI agent** (swappable model, act-as-user executor, confirm rule, identity blocks, fenced data, step cap, saved threads, credit quota). Routes `/api/data-ops/*`. Binds AUTH + REALTIME + CONTENT + TENANCY + the Workers AI binding (`AI`) + the core DB. No cron |

| D1 database | Bound to | Migrations |
|---|---|---|
| kwapso-core-staging | kwapso-auth-staging | `cd workers/auth && npx wrangler d1 migrations apply kwapso-core-staging --env staging --remote` |
| kwapso-core | kwapso-auth | `cd workers/auth && npx wrangler d1 migrations apply kwapso-core --remote` |

Deploy order when several change: **realtime → auth → tenancy → content → data-ops → mcp → gateway → portal-gateway** (root scripts do this — both gateways go LAST, for the same reason: each service-binds the domain workers it forwards to — realtime FIRST because every other worker service-binds it: auth/tenancy/content/data-ops publish change pings, the gateway routes the WebSocket. Deploying a binder before its target fails with "Worker not found" — this bit us on the first production deploy, when `kwapso-realtime` didn't exist yet; FIXED 2026-06-22). content and data-ops slot in before the gateway because the gateway routes `/api/content/*` and `/api/data-ops/*` to them, and **data-ops binds CONTENT + TENANCY** (so both must exist before data-ops). **COLD-START (a genuinely fresh account — every `new-app` fork):** realtime also binds AUTH, so `realtime → auth` and `auth → realtime` form a cycle; the very first deploy dies with **`code 10143`** ("Worker not found" for the not-yet-deployed side). This is NOT a "usually auth already exists" footnote — on a fresh account NEITHER exists. Break it once: in `workers/realtime/wrangler.jsonc` **temporarily remove the AUTH service binding**, run `npm run deploy:*` (realtime deploys, then auth, …), then **restore the binding and redeploy realtime**. Do it on staging AND production. (A future improvement automates this in the deploy script — BASE-IMPROVEMENTS.) The realtime worker defines the `TeamChannel` Durable Object (a one-time `migrations` tag in its wrangler.jsonc; no team-DB migration involved — the DO holds no app data). Durable Objects need the Workers Paid plan.
A nightly cron (03:10 UTC, tenancy worker) sizes every team DB and alarms at 80% of the 10GB cap.
New migrations must be applied to BOTH databases before deploying workers that need them. The agent-modules build (2026-06-23) adds **core migrations 0008 (`importable_databases`) / 0009 (`agent_usage`) / 0010 (`agent_credits`)**, the credit-usage view (2026-07-01) adds **0011 (`agent_usage_log` — the per-command "why" trail)**, the error store (2026-07-03) adds **0012 (`error_logs` — the central error log, ERROR-HANDLING.md)**, and the MCP front desk (2026-07-07) adds **0013 (`mcp_tokens` + `sessions.team_pin`)** — WITHOUT 0013 the whole MCP surface hits a missing table — and the honest usage log (2026-08-04) adds **0014 (`agent_usage_log.kind` — action rows team-visible, prompt rows the author's; WITHOUT it every usage write fails its best-effort insert, so the log silently stops filling)**, and the send/token hardening (2026-08-10) adds **0015 (`login_codes.sent_ip` + `sends` — the send throttle's ledger; WITHOUT it every sign-in code request 500s on a missing column)** and **0016 (`mcp_tokens.expires_at`, backfilled so live tokens keep a full term; WITHOUT it every MCP call 500s)** — apply them to `kwapso-core` + `kwapso-core-staging` (same command as below, any of the core-bound workers can run it; 0011 is applied on staging, production is owner-gated) — and the **team-schema migrations, `0001_team_base` … `0008_portal_current_account`** (the live list is `TEAM_MIGRATIONS` in `workers/tenancy/src/team-schema.ts`; the recent ones are **`0004_modules`** — learning, learning_progress, help, help_threads, data_import_sessions, agent_threads, agent_messages — **`0005_help_stakeholders`**, **`0006_import_batches`** (the agentic multi-file import shell, AGENTIC-IMPORT.md), **`0007_customer_spine`** (accounts + account_links + portal_users — the customer spine the whole client portal reads; WITHOUT it every account and portal route hits a missing table) and **`0008_portal_current_account`** (`portal_users.current_account_id` — the pointer the account switcher stands on; WITHOUT it switching companies fails and a client who belongs to two is stuck in the first one)) — rolled to every team DB via `POST /api/tenancy/admin/migrate-teams` (x-admin-key). Apply BOTH before deploying content/data-ops. Two more core migrations landed after 0016 and belong in the same pass: **0017 (`login_sends` — the send ledger the login budget reads; WITHOUT it every sign-in code request 500s on a missing table)** and **0018 (an index on `email_change_codes (new_email, …)` — the email-change throttle counts by TARGET address now as well as by caller; WITHOUT it the door still refuses correctly, it just scans a table an attacker can grow)**.

## Secrets (set once per env, never in git)

- `cd workers/auth && npx wrangler secret put RESEND_API_KEY --env staging` (and again without `--env` for production)
- `CF_D1_TOKEN` (Account→D1→Edit) on kwapso-tenancy + kwapso-tenancy-staging — SET 2026-06-12 (team creation live). `ADMIN_KEY` (maintenance endpoints: migrate-teams, db-sizes, move-module) — SET on both envs 2026-06-12; rotate anytime with `wrangler secret put ADMIN_KEY`.
- `INTERNAL_KEY` — shared secret guarding auth's `/internal/send-email` (tenancy sends it; auth enforces it). UPDATED 2026-08-04: every internal door now **FAILS CLOSED** — send-email, log-error and mcp-session all REFUSE every caller while `INTERNAL_KEY` is unset (a half-finished bootstrap must not run with the doors open), and a mismatch is a hard reject. The key MUST match across `kwapso-auth*` + `kwapso-tenancy*` + `kwapso-content*` (help/notify emails via auth) + `kwapso`/`kwapso-staging` (the AGENCY GATEWAY — it forwards client error beacons to auth's /internal/log-error; ADDED 2026-07-03) + `kwapso-portal*` (the PORTAL GATEWAY — same beacon door, same seam; ADDED 2026-08-10 — without it a crash on a client's phone is console-only) + `kwapso-mcp*` (it mints team-pinned sessions via auth's `/internal/mcp-session`; ADDED 2026-07-07 — omit it and the whole MCP surface can't authenticate), and it MUST be set in EVERY env before the member-notification email feature ships (so "when set" is not an optional/skippable path in production). Defense-in-depth alongside `workers_dev:false`.
- `PUBLIC_APP_URL` — a **var** (not a secret) in `workers/tenancy/wrangler.jsonc`, set per env (staging + production, SET 2026-07-01): the absolute origin used in outbound email links (invites). Without it an agent-sent invite email would link to the internal binding host — see EDGE-CASES §4.
- `CF_D1_TOKEN` on **kwapso-realtime + kwapso-realtime-staging** (ADDED 2026-08-10 — the live-channel fence). A joining socket now resolves the caller's account scope through the same guard corridor the API uses, so a client-portal login hears only its own world instead of every account id in the agency (DURABLE-OBJECTS §2). Same scoped Account→D1→Edit token as tenancy/content/data-ops; `CF_ACCOUNT_ID` rides along as a var in `workers/realtime/wrangler.jsonc`. **Set it before deploying realtime**: with no token the team channel refuses every socket (fail-closed — we cannot tell staff from a client login), which costs live sync until it's set. `cd workers/realtime && npx wrangler secret put CF_D1_TOKEN --env staging` (and again without `--env`).

### Agent-modules secrets + vars (BUILT 2026-06-23 — `kwapso-content*` + `kwapso-data-ops*`)

- `CF_D1_TOKEN` (Account→D1→Edit) on **kwapso-content + kwapso-content-staging** AND **kwapso-data-ops + kwapso-data-ops-staging** — both reach per-team databases over the one REST door, same as tenancy. Set per env: `cd workers/content && npx wrangler secret put CF_D1_TOKEN` (and `--env staging`); same for `workers/data-ops`.
- `INTERNAL_KEY` on **kwapso-content*** (it calls auth's `/internal/send-email` for help reply/@mention notifications) — same value as auth/tenancy.
- `ADMIN_KEY` on **kwapso-data-ops*** (guards the two owner-only endpoints below) — same as the tenancy maintenance key. data-ops also forwards the caller's session cookie to content/tenancy (act-as-user), so no extra cross-worker secret is needed for the import/agent executor.
- `ANTHROPIC_API_KEY` on **kwapso-data-ops*** — OPTIONAL. When set, the AI agent's brain is Claude (this is what the owner runs — SET on staging 2026-06-30; production is owner-gated); when unset, it falls back to Cloudflare Workers AI. **BOTH brains do full tool use** — the key changes which model thinks, never whether the agent can act. (Claude also streams word-by-word; Workers AI replies arrive at once but still emits live step events.) Set per env with `wrangler secret put ANTHROPIC_API_KEY`.
- **Vars (in `workers/data-ops/wrangler.jsonc`, not secrets):** `AGENT_MODEL` (the Claude model id, default **`claude-sonnet-5`**, used only when `ANTHROPIC_API_KEY` is set) + `AGENT_EFFORT` (Claude reasoning effort, default **`low`** — the cheap setting; raise when more capability is worth the tokens) + `AGENT_FREE_DAILY` (**the app's own daily allowance** — how many free assistant actions a team gets each day inside kwapso. The code default is 25, but **both environments ship 50** in the checked-in wrangler vars, so 50 is what a team actually gets. This is not your Anthropic bill or any provider limit; it is a number this app enforces on itself) + `WORKERS_AI_MODEL` (the fallback model, default **`@cf/meta/llama-4-scout-17b-16e-instruct`**, verified live: chats, answers from real team data, takes actions). Swap the brain by editing one var or `selectModel()` — "model is a battery". Other good Workers AI swaps: `@cf/openai/gpt-oss-20b` / `gpt-oss-120b` (agentic), `@cf/moonshotai/kimi-k2.6` (frontier, premium, best chat). `cheapText` (inline jobs) always uses the Workers AI var. **HISTORY / GOTCHAS:** (1) the old default `@cf/meta/llama-3.1-8b-instruct` was DEPRECATED+removed 5/30/2026 — calling it threw and crashed the agent on EVERY message (even "hi"); always check a model id is still served. (2) Workers AI models need the **OpenAI-wrapped tools format** `{type:"function",function:{…}}` (a flat shape 400s); the seam handles this. (3) Never send `temperature`/`top_p`/`budget_tokens` to Claude Sonnet 5 — each is a 400; effort is the one knob. Docs: developers.cloudflare.com/workers-ai/function-calling/ + /models/llama-4-scout-17b-16e-instruct/.
- **Workers AI binding:** `kwapso-data-ops*` declares `"ai": { "binding": "AI" }` in its wrangler.jsonc — no secret, just the binding (Workers AI is metered on the account). This is what powers the swappable model's fallback path + every `cheapText` call.

### R2 buckets (BUILT 2026-06-23 — bound to `kwapso-content*`)

One bucket PER MODULE, per-team key prefix inside (the R2 golden rule). Create both per env before deploying content:

- `kwapso-learning-media` + `kwapso-learning-media-staging` — learning item media (bound `LEARNING_MEDIA`).
- `kwapso-help-media` + `kwapso-help-media-staging` — help attachments (bound `HELP_MEDIA`; the attachment UI hook itself is deferred — see AGENT-MODULES-PLAN).
- `kwapso-media` + `kwapso-media-staging` — profile photos + team logos (bound `MEDIA` on the gateway, which serves them at `GET /media/*`). Pre-dates the module buckets; created with the base.

Create with `npx wrangler r2 bucket create <name>` (run once per bucket per account). (Import has NO bucket of its own — CSV text is uploaded into the import session, not R2.)

### Owner-only endpoints (data-ops, x-admin-key — same key as the tenancy maintenance actions)

- `POST /api/data-ops/admin/seed-targets` — refresh the GLOBAL `importable_databases` catalog's LABELS (display names / descriptions / schemas). **No longer a step anyone must remember**: the catalogue reconciles itself against the code on read (R13 — a fresh env's picker heals on first open; a target the owner switched off stays off, and this door no longer re-activates it either).
- `GET /api/data-ops/admin/errors?status=open|resolved|all&limit=N` — read the central error log (newest first). `POST /api/data-ops/admin/errors/resolve` `{ id, note }` — mark one resolved with the what-went-wrong note. See ERROR-HANDLING.md.
- `POST /api/data-ops/admin/grant-credits` — top up a team's AI credit balance (the purchasable half of the agent quota; the free half is **the app's own daily allowance**, `AGENT_FREE_DAILY` — code default 25, but both environments ship **50**). This is the seam real payments wire into later.

### Public surface (LOCKED): only the two gateways are public

auth, tenancy, realtime, content, data-ops and mcp — the six domain workers — all set `"workers_dev": false` **and `"preview_urls": false`** (BOTH, top-level AND env.staging — envs don't inherit, and a per-version preview URL would be another public door), so they have NO public `*.workers.dev` URL and are reachable ONLY via service bindings. The two public addresses are the **agency gateway** (`kwapso` / `kwapso-staging`) and the **portal gateway** (`kwapso-portal` / `kwapso-portal-staging`) — one per front door, and no more. That is what makes `/internal/send-email` (and the agent/import act-as-user surface) safe: no public route can reach `/internal/*`, the agent, or the act-as-user surface. Never add a public route/`workers_dev` to a worker that isn't one of the two gateways.
- **Both environments are on the same commit as of 2026-08-06** — production was
  brought up from the pre-hardening build in one rollout: core migration `0014`
  applied to `kwapso-core` first, then every worker then on disk, realtime-first
  (seven at the time; the portal gateway landed on 2026-08-10 and made it eight).
  Verified
  on production: four worker healths, the test-login door refused (403) even when
  handed the staging key (`ENVIRONMENT: "production"` ships in the config), the
  activity door gating before scope resolution, and a forged-cookie beacon writing
  zero rows. Production auth holds only `INTERNAL_KEY` + `RESEND_API_KEY` — no
  `TEST_LOGIN_KEY`, and the door would refuse it anyway.
- **Sign-in codes: a 60-second cooldown, never an hour-long lockout.** Asking for
  a code twice inside a minute returns `429 too_soon`. Past the hourly cap the
  live code is ROTATED in place (fresh secret, fresh TTL, fresh attempt budget)
  rather than refused — so nobody, including an operator retrying a flaky email,
  can be locked out of their own account. A CONSUMED code doesn't hold the
  cooldown: signing in on a laptop and then a phone works straight away.
- **The send door also throttles the CALLER, not just the address.** Every rule
  above is per email address, so one anonymous caller could still walk a mailing
  list. A caller (`CF-Connecting-IP`) may cause **30 codes an hour**, and the whole
  environment **300** — both counted as SENDS (a rotation is an email too) and both
  enforced inside the INSERT/UPDATE, so a burst can't outrun them. A request with
  no edge IP header joins ONE shared "unknown" bucket — absent never means
  unlimited. Refusals are `429 too_many_sends`. Raising either number is a
  one-line change in `workers/auth/src/lib/constants.ts` plus a deploy.
- **Access tokens expire and are capped.** An MCP personal access token lives
  `MCP_TOKEN_TTL_DAYS` (90) days and an account may hold 10 live ones
  (`shared/workers/limits.ts`); minting past the cap is a clean `409`, and an
  expired token is a clean `401 token_expired` on the very next call. Migration
  0016 gives every EXISTING token a full 90-day term from the moment it is
  applied, so applying it never breaks a working integration — but it does start
  the clock, so tell token holders before a long-idle environment is upgraded.
- **Team creation is capped per user** — `MAX_TEAMS_PER_USER` (default 5) counts
  teams the account CREATED, not teams it belongs to, and **deactivated teams
  still count** (their database still exists, so "create five, switch them off,
  repeat" would otherwise be an unbounded database generator). Raise it per
  environment as a var. Setting it to `0` means zero, not the default.
- **`AGENT_FREE_DAILY=0` means zero free AI**, not "fall back to 50". Every
  numeric var behaves that way now (`numberVar`).
- **Uploaded files are capability URLs (a reasoned exception).** `/media/*` serves
  any object whose unguessable key you hold — no session, no membership check, no
  expiry. An ex-member who saved a link keeps it. Fine for photos and logos;
  fix it before launch if your product stores invoices, IDs or anything personal
  (BASE-MANUAL §5 has the patch).
- **Three reads return identity data behind a neighbouring right (a reasoned
  exception).** Stakeholder emails, the team creator's email, and learning-progress
  user ids ride `help:read` / any member / `learning:read`. Tenant-scoped, so it is
  a wrong-right mismatch inside one team, never a cross-customer leak.
- Login codes: **a code appears NOWHERE but the user's inbox — in any environment.** The old `DEV_ECHO_CODES` echo (code in the response + a toast) is DELETED, code path and config var both, so configuration can't re-enable it. Automated runs (the smoke, the e2e suite) sign in through the **test-login door** instead: `POST /api/auth/admin/test-login` `{email}` with an `x-admin-key` header mints a NORMAL hashed-at-rest code (same TTL, same attempt cap, same per-hour throttle as the real send path) and returns it once; the normal verify door consumes it. Its holder can sign in as ANY account on that environment, so it carries **two independent locks**: (1) its OWN `TEST_LOGIN_KEY` secret on the auth worker, which FAILS CLOSED when unset — deliberately NOT the `ADMIN_KEY` maintenance key this same page tells you to set on tenancy and data-ops in BOTH environments, so one mistyped directory can never arm impersonation; and (2) a hard refusal when the worker's `ENVIRONMENT` var is `production`, which ships with the deploy. **Set it on STAGING only** (`cd workers/auth && npx wrangler secret put TEST_LOGIN_KEY --env staging`) — production would refuse it anyway. The smoke + e2e read it from the environment: `export TEST_LOGIN_KEY=…` before `npm run smoke:staging` / the e2e suite.

### Resend (real login emails) — production wiring

The send code is built (`workers/auth/src/lib/email.ts`); it needs two things,
both owner-only:

1. **API key** — create at resend.com → API Keys (Sending access). Set it:
   `cd workers/auth && npx wrangler secret put RESEND_API_KEY` (prod) and again
   with `--env staging`. The moment it's set, real emails send and the staging
   echo stops.
2. **Verified sender domain** — `EMAIL_FROM` in `workers/auth/wrangler.jsonc` is
   `kwapso <alerts@kwapso.app>` in both environments. Resend's own
   `onboarding@resend.dev` only delivers to the Resend account owner's inbox, so
   it is fine for our own testing and NOT for real users. To send from a new
   domain: add it in Resend, add the DKIM/SPF records it shows to that domain's
   DNS in Cloudflare, then set `EMAIL_FROM` to an address on it and redeploy.
   See "Email sending — the domain split" below for which domains are ours.

## Verify before shipping

- CI runs the same on every push (.github/workflows/ci.yml)
- deploy:staging ends with scripts/smoke-staging.mjs — the LIVE login→team journey must pass or the deploy is considered failed

## Local dev

- `npm run dev:auth` (auth worker on :8787, local DB; first time: apply migrations with `--local`)
- `npm run dev` (the agency app on :3000; /api proxies to :8787)
- `npm run dev:portal` (the client portal on :3001; /api proxies to auth :8787, tenancy :8788, content :8789)

## Notes

- The UI library (`@kwapso/ui`) installs from GitHub. Update: `npm install github:Kwapso/kwapso_ui`.
- `web/app/globals.css` is a COPY of the library theme (master: kwapso_ui repo, www/app/globals.css). Its `@source` points at the ROOT node_modules (workspaces hoist).
- Missing UI components are placeholdered in `web/components/temp/` and tracked in UI-GAPS.md — the library absorbs them, then placeholders get deleted.

## Custom domains — the agreed naming (decided 2026-08-08)

Cloudflare's free Universal SSL covers `kwapso.app` plus ONE level (`*.kwapso.app`).
Two-level names like `clients.staging.kwapso.app` would need Advanced Certificate
Manager (paid per zone), so staging uses a hyphen instead of a dot.

| Surface | Environment | Custom domain | Gateway worker |
|---|---|---|---|
| Client portal | production | `client.kwapso.app` | `kwapso-portal` |
| Client portal | staging | `staging-client.kwapso.app` | `kwapso-portal-staging` |
| Agency app | production | `agency.kwapso.app` | `kwapso` |
| Agency app | staging | `agency-staging.kwapso.app` | `kwapso-staging` |

(The portal's two names were revised on 10 Aug 2026 — see "Client portal hostnames"
below, which is the decision this table follows. The earlier `clients.kwapso.app` /
`clients-staging.kwapso.app` pair was never attached.)

**All four are attached and serving** (agency: production + staging; client portal:
staging on `staging-client.kwapso.app`, production on `client.kwapso.app`). These are
the addresses to hand anyone — the `*.workers.dev` names are no longer advertised
anywhere in the docs. Attach a new one from the gateway worker: Workers & Pages → the
worker → Settings → Domains & Routes → Add custom domain. Cloudflare writes the DNS
record and issues the cert.

NOTE: `portal.kwapso.app` is NOT ours — it is the legacy Glide client portal, live and
serving clients. It stays untouched until cutover, which is a single DNS record change.

## Email sending — the domain split (decided 2026-08-08)

**kwapso.com is NOT ours to touch.** It carries the website and Google Workspace mail
for the business. Nothing in this project writes DNS there.

**kwapso.app is the app domain.** It has no mail of its own, so it is where the
application sends from: `kwapso <alerts@kwapso.app>`, verified in Resend (EU region).
The three Resend records live on their own subdomains (`resend._domainkey`, `send`) and
cannot affect kwapso.com in any way.

## Secret hygiene — a lesson learned the hard way (2026-08-09)

Worker secrets are COPIES, not references. When a credential is replaced, every
worker holding it keeps the old value until the secret is pushed again.

This bit us once: `CF_D1_TOKEN` was set on tenancy/content/data-ops from an early
Cloudflare token that was later replaced. Deploys kept succeeding, health checks
kept passing, and the smoke suite kept going green — because it reused an existing
team. The only symptom was real team creation failing with an opaque 500.

Rule: after replacing ANY credential, re-push it to every worker that holds it,
then verify with a path that actually exercises it (a FRESH signup, not a reused
one). The smoke suite passing is not proof that provisioning works.

### Client portal hostnames (decided 10 Aug 2026)

`portal.kwapso.app` is **taken** — it points at the live Glide client portal and
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
is retired — it is a DNS change plus a custom-domain swap, nothing in code.
