# BOOTSTRAP.md — rebuild Brimba from zero on a fresh Cloudflare account

This is the **day-zero runbook**. Assume you have *only this repository* and an
empty Cloudflare account, and you want a running Brimba — staging first, then
production. Every command is here, in order. If you follow it top to bottom you
end with a live base you can sign into and build on.

> **Who this is for.** A developer, or an AI agent, standing the base up from
> scratch. You do not need any prior context beyond this repo — that is the whole
> point of this file. When something here disagrees with reality, **ARCHITECTURE.md
> is the master** and OPERATIONS.md holds the live deploy config.

> **The mental model in one paragraph.** Brimba is **eight Cloudflare Workers** behind
> **two public doors** — the agency gateway (`web/`) and the client portal's gateway
> (`web-portal/`). The other six are private. Global identity/billing lives in **one
> core D1 database** (`kwapso-core`), reached by the native `env.DB` binding. Every
> *team* gets its **own D1 database**, created at runtime and reached over the **D1
> REST API** (a scoped token, `CF_D1_TOKEN`). Uploaded files live in **R2**. Live
> updates fan out through **one Durable Object** (`TeamChannel`) in the realtime
> worker. Each front end is a **Next.js static export** served by its own gateway.
> Read BASE-MANUAL.md for the *why*; this file is the *how to stand it up*.

---

## 0 · Prerequisites (once per machine)

**Software, on your machine:**

- **Node 22** — pinned in `.nvmrc` and in `package.json` `engines`; this is the
  version CI runs. Node 20 works today but is not what anything is tested on.
- **npm 10+** (ships with Node 22). The repo is an npm **workspace** — install
  from the root, never inside a worker directory.
- **Wrangler** — comes via `npx wrangler`, pinned at `^4.0.0` in the root
  `package.json`. No global install needed.
- **`git`**, and read access to `github.com/Kwapso/kwapso_cpaa` (private). The UI
  library `github.com/Kwapso/kwapso_ui` is public, so `npm install` needs no
  extra credential.

**Accounts, before you can deploy anything.** INVENTORY.md is the full list with
who issues each credential; these are the ones that block this runbook:

- **A Cloudflare account on the Workers Paid plan** — Durable Objects require
  Paid. Everything else here lives inside it: the workers, both D1 tiers, the R2
  buckets and the Vectorize index.
- **A [Resend](https://resend.com) account** for login-code and notification
  emails (or another provider — see OPERATIONS.md; auth is the only sender).
  **Without it nobody can sign in**, because codes appear only in an inbox.
- **A Google Cloud project** if you want either Google feature. It needs **two
  separate OAuth clients** — a basic-scope one for the sign-in button, and a
  sensitive-scope one for per-person Drive/Gmail/Calendar/Chat connections, which
  goes through Google's verification and therefore takes calendar time. Neither is
  required for a working base; INVENTORY.md § 3 has both, and mixing them up is a
  named hazard.
- **A domain** on Cloudflare if you want custom URLs; otherwise the free
  `*.workers.dev` subdomains are fine (that's what the defaults use). Where the
  domain is *registered* is not something this repo can tell you — INVENTORY.md
  § 2.
- *(Optional)* an **Anthropic API key** if you want the AI agent's brain to be
  Claude rather than the keyless Cloudflare Workers AI fallback.

```bash
git clone <this-repo> brimba && cd brimba
npm install            # also pulls @kwapso/ui from GitHub (a public repo)
npm run check          # sanity: lint + TypeScript across every workspace + the full test suite
npx wrangler login     # authenticate wrangler to your Cloudflare account
npx wrangler whoami    # CHECK IT. See the warning below before you go further
```

`npm run check` green on a clean clone proves the code is intact before you touch
any cloud resource. **What green looks like: exit code 0**, ten workspaces, every
suite passing — roughly 149 test files and 1,600-odd tests at the time of writing,
but check the exit code, not the count, because the suite grows. Nothing in this
step contacts Cloudflare, so it works before you have an account at all — which
makes it the one step you can use to prove the code arrived intact.

**One suite will report itself skipped, and on your machine that is correct.**
`workers/content/test/knowledge-backfill.test.ts` measures retrieval over the
agency's real Glide history, which is git-ignored customer data and is in no clone
(INVENTORY.md § 6) — so the content worker ends `32 passed | 1 skipped`. Don't go
looking for the missing file. A skip in any *other* suite is a real one.

> **WHICH ACCOUNT AM I ABOUT TO BUILD IN?** `wrangler` acts on whatever account
> the machine is logged into, and **no worker in this repo pins `account_id`**.
> If your login points somewhere else, every command below silently builds in the
> wrong place — and on the machine this base was written on, the default login
> was a different client's account. Run `npx wrangler whoami` and read it. This is
> the same hazard `scripts/reset-all.mjs` refuses to start without checking, and
> RUNBOOK.md § 0 covers it for every later operation.

---

## 1 · The eight workers (what you are about to create)

Each worker is its own `wrangler.jsonc` under `workers/<name>/`. Only the **two
gateways** are public; every other worker sets `"workers_dev": false` and is reachable
**only** over service bindings (this is the locked "only the two gateways are public"
rule — never add a public route to a worker that isn't one of them, because no public
route may reach `/internal/*`, the agent, or the act-as-user surface).

| Worker | Public? | Does |
|---|---|---|
| `realtime` | no | the `TeamChannel` Durable Object — fans out live change pings |
| `auth` | no | email-code and Google login, sessions, the email sender |
| `tenancy` | no | teams, members, Member roles + permissions, invites, dropdown values, the customer spine |
| `content` | no | Learning + Tickets |
| `data-ops` | no | CSV import + the AI agent |
| `mcp` | no | the external machine surface: personal access tokens → team-pinned sessions → the MCP tool catalog at `/mcp` (routed only via the agency gateway) |
| `gateway` | **YES** | the AGENCY front desk: serves `web/out` + routes `/api/*` (incl. `/mcp` + `/api/mcp/*`) by PREFIX + serves `/media/*` |
| `portal-gateway` | **YES** | the CLIENT portal's front desk: serves `web-portal/out` + forwards a NAMED, CLOSED allow-list of `/api` doors (never a prefix fan-out) + serves `/media/*`. Binds only auth/tenancy/content/realtime, so data-ops and mcp are unreachable from the client internet by construction |

### The shape, drawn

```
        agency staff                                   a client's contact
              │                                                │
              ▼                                                ▼
   ┌──────────────────────┐                       ┌──────────────────────────┐
   │  gateway   (PUBLIC)  │                       │ portal-gateway  (PUBLIC) │
   │  serves web/out      │                       │ serves web-portal/out    │
   │  routes /api/* by    │                       │ forwards a NAMED, CLOSED │
   │  PREFIX              │                       │ allow-list of doors      │
   └───────┬──────────────┘                       └────────┬─────────────────┘
           │  service bindings (no public URL beyond here) │
   ┌───────┴──────────┬──────────┬───────────┬─────────────┴──┐
   ▼                  ▼          ▼           ▼                ▼
 auth             tenancy     content    data-ops           mcp
 login,           teams,      learning,  CSV import,   tokens → team-pinned
 sessions,        roles,      tickets,   the AI agent  sessions → MCP tools
 the sender       the money   the work                 (bound only to the
                              engine, KB               agency gateway)
   │                  │          │           │                │
   └──────────────────┴────┬─────┴───────────┴────────────────┘
                           ▼
                        realtime  ── TeamChannel (Durable Object)
                        fans out {resource, id, op} pings; holds no data

  DATA                                        FILES            SEARCH
  ────                                        ─────            ──────
  kwapso-core  (one, global)                  4 R2 buckets     1 Vectorize index
    identity, teams, billing                  per-team key       every team is a
    native env.DB binding                     prefixes inside    NAMESPACE inside
  one D1 per TEAM (created at runtime)                           it
    all content, reached over the
    D1 REST API with CF_D1_TOKEN
```

The portal gateway binds only auth, tenancy, content and realtime — **not**
data-ops and **not** mcp. That is why import, the assistant and the machine
surface are unreachable from the client internet by construction rather than by a
condition somebody could invert.

**Deploy order is `realtime → auth → tenancy → content → data-ops → mcp → gateway →
portal-gateway`** and it matters: realtime is FIRST because every other worker
service-binds it (deploying a binder before its target fails with "Worker not found"),
and both gateways go LAST because each service-binds the domain workers it forwards to.
The root `npm run deploy:*` scripts already encode this order.

---

## 2 · The core database (global identity + billing)

One global D1 database holds users, teams, the team→member→role index, and the agent
quota tables. Create it for each environment and apply the core migrations in
`db/core/` (they are numbered `0001` … and applied in order; `0012` adds the central error log).

> **CRITICAL — the checked-in ids are the ORIGINAL author's, overwrite them.** The
> `wrangler.jsonc` files ship with a real `database_id` (and `CF_ACCOUNT_ID`, §4)
> pinned to the account this base was built on. On YOUR account those are wrong, and
> wrangler binds D1 by `database_id` when present — so a stale id silently binds to
> nothing and **every per-team DB write fails**. WORSE, if you fork onto an account
> that ALREADY hosts the original base, the stale id binds to the ORIGINAL core DB —
> a cross-tenant data leak. After creating each core DB below, paste its returned
> `database_id` into the `d1_databases` block of **all SIX core-bound workers — auth,
> tenancy, content, data-ops, realtime, AND mcp** (mcp binds the core DB for
> `mcp_tokens`; it's the easy one to miss). Top-level = production, `env.staging` =
> staging.

```bash
# Create the core DB for each env, then paste each returned database_id into ALL
# SIX core-bound workers' wrangler.jsonc (auth, tenancy, content, data-ops, realtime, mcp).
# Six, not eight: neither gateway binds a database — they forward and serve files.
npx wrangler d1 create kwapso-core-staging
npx wrangler d1 create kwapso-core

# Apply EVERY core migration to each env — the command applies whatever is in
# db/core/, so it needs no number from you. Any core-bound worker can run it;
# auth is the canonical one. Run WITHOUT --env for production.
cd workers/auth
npx wrangler d1 migrations apply kwapso-core-staging --env staging --remote
npx wrangler d1 migrations apply kwapso-core --remote
cd ../..
```

**`db/core/` on disk is the live list — count it there, never here.** As of this
writing it holds `0001`–`0019`: users, teams, team_members, the email-change
security records, account activity, the import catalog, the three agent quota
tables (`agent_usage` / `agent_credits` / `agent_usage_log`), the central error log
`error_logs`, the MCP front desk (`mcp_tokens` + `sessions.team_pin` + token
expiry), and the sign-in send throttle's ledger and indexes. DATA-MODEL.md lists
every table and OPERATIONS.md says what breaks without each of the recent ones.
**Migrations are additive — never edit an applied one.** A bad migration is rolled
*forward* with a new one, never edited or removed; RUNBOOK.md § 1 says why.

> **Per-team databases are NOT created here.** Each team's database is created at
> runtime when the team is created — `applyTeamSchema` runs the `TEAM_MIGRATIONS`
> array in `workers/tenancy/src/team-schema.ts`, which starts at `0001_team_base`
> and today runs to `0021_meetings`. **That file is the live list; any count
> written here is a copy that will go stale, so open it.** You only apply
> *team-schema* migrations to *existing* teams later, via the migrate-teams robot
> (§7) — new teams always get all of them. DATA-MODEL.md says what each adds and
> what breaks without it; the customer spine (`0007_customer_spine`) and the
> portal's account pointer (`0008_portal_current_account`) are the two the whole
> client portal stands on.

---

## 3 · R2 buckets (uploaded files)

Four buckets, each with a staging twin — **eight in total**. Create them all
before deploying content/gateway:

```bash
npx wrangler r2 bucket create kwapso-media                    # profile photos + team logos (gateway MEDIA)
npx wrangler r2 bucket create kwapso-media-staging
npx wrangler r2 bucket create kwapso-learning-media           # learning attachments (content LEARNING_MEDIA)
npx wrangler r2 bucket create kwapso-learning-media-staging
npx wrangler r2 bucket create kwapso-help-media               # ticket attachments — name follows the table (content HELP_MEDIA)
npx wrangler r2 bucket create kwapso-help-media-staging
npx wrangler r2 bucket create kwapso-internal-media            # the agency's OWN files: brand assets, staff photos, certificate PDFs (content INTERNAL_MEDIA)
npx wrangler r2 bucket create kwapso-internal-media-staging
```

Inside each bucket, keys are prefixed per team (`teams/<id>`, `learning/<teamId>/<fileId>`, …).
`/media/*` is served by the gateway **without a session check** — safe for the current
low-sensitivity uploads because learning keys carry an unguessable file id; see the
ARCHITECTURE.md `/media/*` note before storing anything sensitive.

---

## 3b · The knowledge base's vector index

ONE index for the account. Every team is a NAMESPACE inside it — Vectorize applies
a namespace before the search, so a query cannot reach another team's vectors
(Law R26; the full argument is at the top of
`workers/content/src/lib/knowledge-vectors.ts`).

**The metadata indexes must exist BEFORE anything is ingested.** Vectorize does
not index metadata retrospectively: "vectors upserted before a metadata index was
created won't have their metadata contained in that index". Create the index,
then all nine, then deploy content — in that order. Getting it wrong is not an
error, it is a knowledge base whose compartments silently do not narrow.

```bash
# 1024 dimensions because the embedding model is @cf/baai/bge-m3 (multilingual —
# half the agency's tickets are in German). Change the model and this changes.
npx wrangler vectorize create kwapso-knowledge --dimensions=1024 --metric=cosine
npx wrangler vectorize create kwapso-knowledge-staging --dimensions=1024 --metric=cosine

for INDEX in kwapso-knowledge kwapso-knowledge-staging; do
  # The nine labels the router narrows by — the list is METADATA_INDEXES in
  # workers/content/src/lib/knowledge-vectors.ts, and the tenth slot of ten is
  # deliberately left free.
  npx wrangler vectorize create-metadata-index $INDEX --property-name=level      --type=string
  npx wrangler vectorize create-metadata-index $INDEX --property-name=compartment --type=string
  npx wrangler vectorize create-metadata-index $INDEX --property-name=owner      --type=string
  npx wrangler vectorize create-metadata-index $INDEX --property-name=kind       --type=string
  npx wrangler vectorize create-metadata-index $INDEX --property-name=account    --type=string
  npx wrangler vectorize create-metadata-index $INDEX --property-name=app        --type=string
  npx wrangler vectorize create-metadata-index $INDEX --property-name=ticket     --type=string
  npx wrangler vectorize create-metadata-index $INDEX --property-name=sprint     --type=string
  npx wrangler vectorize create-metadata-index $INDEX --property-name=date       --type=number
done
```

The binding is `KNOWLEDGE_INDEX` on the content worker and it is OPTIONAL: without
it the knowledge base answers from its word index alone rather than refusing every
question. That is a real degradation and a visible one (`reason` on every answer
says what it searched), not a silent one.

---

## 4 · Secrets + vars (per env, never in git)

**Secrets** (set with `wrangler secret put <NAME>` in the worker's directory; add
`--env staging` for staging). Store the values in each worker's git-ignored
`.dev.vars` for local dev too.

| Secret | On workers | Why |
|---|---|---|
| `RESEND_API_KEY` | auth | send login codes + notifications. Login codes are NEVER echoed in an API response, in any environment — until this is set, sign-in emails simply don't send. Automated tests sign in through the non-production test-login door (`POST /api/auth/admin/test-login`, its own `TEST_LOGIN_KEY` secret; see OPERATIONS.md § secrets).
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | auth | *optional* — "Continue with Google" (the `kwapso-signin` OAuth client; SCOPE ch.03). Set BOTH or neither: with either missing the button isn't offered and the email-code path is untouched. Register `<APP_ORIGIN>/api/auth/google/callback` **and** `<PORTAL_ORIGIN>/api/auth/google/callback` as Authorized redirect URIs on that client — one per front door, per environment (OPERATIONS.md § secrets has the four for this project). |
| `CF_D1_TOKEN` | tenancy, content, data-ops, **realtime** | the scoped D1 REST token (Cloudflare → D1 → Edit) that reaches per-team databases. realtime needs it to fence a joining socket (a client-portal login must not hear the agency's row ids — DURABLE-OBJECTS §2); with no token the team channel refuses every socket, which is the fail-closed direction but costs live sync until it's set. |
| `ADMIN_KEY` | tenancy, data-ops | guards the maintenance endpoints (migrate-teams, db-sizes, grant credits). Set it in both environments. |
| `TEST_LOGIN_KEY` | auth (**NON-PRODUCTION ONLY**) | the test-login door's own secret — its holder can sign in as ANY account on that environment. Deliberately a different name from `ADMIN_KEY` so the maintenance-key rollout can never arm it, and the door refuses outright when the worker's `ENVIRONMENT` var is `production`. |
| `INTERNAL_KEY` | auth, tenancy, content, gateway, mcp | shared secret gating auth's `/internal/*` doors. tenancy + content call `/internal/send-email`; the **gateway** forwards client error beacons to `/internal/log-error` (a DIFFERENT reason — the gateway sends no email but still needs the key, or web errors never reach `error_logs`). The **mcp** worker uses it to mint team-pinned sessions (`/internal/mcp-session`). MUST match across all five. |
| `ANTHROPIC_API_KEY` | data-ops | *optional* — when set, the agent's brain is Claude; unset falls back to Workers AI. Both do full tool use. |

**Vars** (plain config in `wrangler.jsonc`, not secret):

- **`CF_ACCOUNT_ID`** on **five workers** — `tenancy`, `content`, `data-ops`,
  `realtime` and `mcp`. **Your Cloudflare account id.** Load-bearing: it builds the
  per-team D1 REST URL (`/accounts/<id>/d1/…`), so a wrong value fails EVERY
  per-team DB operation (team creation, every content/import/agent write, and the
  live channel's fence). The checked-in value is the original author's account —
  **overwrite it** in both the top-level and `env.staging` vars blocks of all five.
  Grep for it rather than trusting this list: `grep -rn CF_ACCOUNT_ID workers/*/wrangler.jsonc`.
- `tenancy` → `PUBLIC_APP_URL` = the environment's absolute origin (e.g.
  `https://agency-staging.kwapso.app`). Outbound email links use it;
  leave it unset and agent-sent invite links point at the internal binding host.
- `auth` → `APP_ORIGIN` / `EMAIL_FROM` — pinned to the author's URLs/domain; update
  them if yours differ.
- `data-ops` → `AGENT_MODEL` (default `claude-sonnet-5`), `AGENT_EFFORT` (default
  `low`), `AGENT_FREE_DAILY` (**the app's own daily allowance** — how many free assistant
  actions a team gets each day; code default 25, but the checked-in wrangler var sets
  **50** in both environments, so 50 is what a team really gets), `WORKERS_AI_MODEL` (the keyless fallback).
- `content` → `KNOWLEDGE_EMBED_MODEL` (the embedding model, `@cf/baai/bge-m3` —
  **it must agree with the dimension count you created the Vectorize index with in
  §3b**, so changing one means recreating the other) and `KNOWLEDGE_MIN_SCORE` (the
  similarity floor below which a passage is not offered as an answer). Both have
  code defaults and neither needs setting to get a working base.
- `tenancy` → `MAX_TEAMS_PER_USER` (default 5, counting teams the account
  *created* — deactivated ones still count, because their database still exists).
  `0` means zero, not "fall back to the default"; every numeric var behaves that
  way.
- `auth` → `ENVIRONMENT`. Ships as `production` in the top-level block, which is
  what makes the test-login door refuse outright there. Do not set it to anything
  else in production.

**The scripts in `scripts/` read their own set of variables** — the reset, the
smokes, the seeds and the Glide pull. They are not worker config and are not set
with `wrangler secret`; they are exported in your shell. `.env.example` in the
repo root names every one of them, and INVENTORY.md § 4 says who issues each.
`node scripts/reset-all.mjs` in particular will refuse to start until
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are exported.

---

## 5 · Deploy (realtime-first) + the web builds

The root scripts build **both** static exports (`web/out` and `web-portal/out`) and
deploy all eight workers in the correct order:

```bash
npm run deploy:staging      # build web/ + web-portal/ → deploy realtime,auth,tenancy,content,data-ops,mcp,gateway,portal-gateway (staging) → smoke
npm run deploy:production   # same order, production names (run only after staging is verified)
```

(`npm run build` alone builds both front ends; `npm run build:portal` builds the
client portal on its own.)

The realtime worker defines the `TeamChannel` Durable Object via a one-time
`migrations` tag in its `wrangler.jsonc` — no data migration, the DO holds no app
data. Durable Objects require the Workers Paid plan.

---

## 6 · The import catalog — self-healing (no manual step needed)

The CSV-import feature reads a global catalog of allowed target tables. As of R13 the
catalogue **reconciles itself against the code on read** — a fresh environment's target
picker heals on first open, so you do NOT need to seed it. The owner seed door still
exists to refresh LABELS (display names / descriptions) if you edit them:

```bash
# OPTIONAL — refreshes labels only; the picker already works without it.
curl -X POST https://<gateway-url>/api/data-ops/admin/seed-targets -H "x-admin-key: <ADMIN_KEY>"
```

---

## 7 · Create the first team + migrate-teams

1. Open the AGENCY gateway's URL and sign in with an email code (a code appears ONLY in the
   inbox now, in every environment — set `RESEND_API_KEY`; for automated/dev sign-in on a
   NON-PRODUCTION environment use the test-login door `POST /api/auth/admin/test-login` +
   `x-admin-key`, gated by the auth worker's own `TEST_LOGIN_KEY` secret and refused
   outright when its `ENVIRONMENT` var is `production`). Complete onboarding — this
   creates your first
   **team**, which creates that team's own D1 database and runs every `TEAM_MIGRATIONS`
   entry on it.
2. Whenever you later ship a NEW team-schema migration, roll it to all existing teams:

```bash
curl -X POST https://<gateway-url>/api/tenancy/admin/migrate-teams -H "x-admin-key: <ADMIN_KEY>"
```

That robot diffs each team's `_migrations` against `TEAM_MIGRATIONS` and applies the gap.

---

## 8 · Verify

```bash
npm run smoke:staging     # scripted end-to-end: health, login, team, context, logout
```

Or by hand: the agency gateway's URL returns the app (HTTP 200); you can sign in, land
in a team, see Home / Accounts / Learning / Tickets / Settings, and open the AI assistant. Then the
portal gateway's URL: a client login lands in its own company's world. If the smoke's
login step reports `too_soon`, that's the 60-second cooldown between code requests, and
`too_many_sends` is the hourly cap on the address or the caller — both are the send
throttle doing its job after repeated test logins. Wait it out; the deploy itself is
fine.

---

## 9 · Reset (wipe data back to empty, keep the schema)

Destructive — deletes every per-team database and blanks the core DB (rows gone,
schema kept). Confirm production explicitly.

```bash
node scripts/reset-all.mjs staging          # or: production | both
```

After a reset, re-seed the import catalog (§6) and create a fresh first team (§7).

---

## 10 · Teardown (delete everything the base created)

The inverse of this runbook — for a **throwaway test** of `new-app`, or retiring a
product. **Destructive and irreversible.** Everything the base makes carries the
product's name prefix, so a teardown is "delete each `<name>-…` resource" — nothing
outside the prefix is touched.

**The safest option: use a throwaway Cloudflare account for the test.** Then cleanup is
just deleting that account's resources below (or closing the account) — zero risk to any
real product. Run each step from the clone's root (`<name>/`); replace `<name>`.

**Order matters** — remove per-team databases *before* the core DB (the reset reads the
core `teams` table to find them).

1. **Per-team databases + core rows** (must run while the core DB still exists):

   ```bash
   node scripts/reset-all.mjs both
   ```

2. **The eight workers, both envs** (16 deployments). The two GATEWAYS are the two
   public ones, so a teardown that misses either leaves a live public address serving
   a half-deleted product — that is the one mistake worth checking twice. Their
   deployed names do not follow the `<name>-<folder>` pattern the others do (the
   agency gateway is just `<name>`, the portal gateway is `<name>-portal`), so they
   are listed separately rather than swept by the loop:

   ```bash
   for w in auth tenancy realtime content data-ops mcp; do
     npx wrangler delete --name <name>-$w
     npx wrangler delete --name <name>-$w-staging
   done
   npx wrangler delete --name <name>                  # the AGENCY gateway (public)
   npx wrangler delete --name <name>-staging
   npx wrangler delete --name <name>-portal           # the CLIENT portal gateway (public)
   npx wrangler delete --name <name>-portal-staging
   ```

3. **The two core databases:**

   ```bash
   npx wrangler d1 delete <name>-core
   npx wrangler d1 delete <name>-core-staging
   ```

4. **The eight R2 buckets** (empty each first, then delete):

   ```bash
   for b in media learning-media help-media internal-media; do
     npx wrangler r2 bucket delete <name>-$b
     npx wrangler r2 bucket delete <name>-$b-staging
   done
   ```

5. **The GitHub repo** (needs `gh` with the `delete_repo` scope):

   ```bash
   gh repo delete <owner>/<name> --yes
   ```

6. **The local clone:**

   ```bash
   cd .. && rm -rf <name>
   ```

**Verify it's gone:** `npx wrangler d1 list` and `npx wrangler r2 bucket list` show no
`<name>-…` entries, and **all four** public URLs — the agency's two and the client
portal's two — return an error (no worker). Secrets
die with their workers — nothing to scrub. (Note: `wrangler d1 list` can throw a
transient auth error; just retry.)

---

## The one-screen summary

```
prereqs → npm install → wrangler login → npm run check
  → d1 create (core, both envs) → migrations apply (core 0001–00NN)
  → r2 bucket create (media × 4 × 2 envs)
  → vectorize create + 9 metadata indexes × 2 envs (BEFORE any ingest)
  → secret put (RESEND, CF_D1_TOKEN, ADMIN_KEY, INTERNAL_KEY, [ANTHROPIC], [TEST_LOGIN_KEY on non-prod auth]) + set vars (PUBLIC_APP_URL, AGENT_*)
  → npm run deploy:staging  (builds web/ + web-portal/, then
                             realtime→auth→tenancy→content→data-ops→mcp→gateway→portal-gateway) → smoke
  → sign in (test-login on staging) → first team (creates its DB) → migrate-teams as needed  (catalog self-heals; seed-targets optional)
  → verify BOTH doors → (repeat for production, owner-gated)
```

If you can run this list, you can rebuild Brimba from nothing. To then *build a new
product on it*, read **BASE-MANUAL.md → "Fork the base for a new product"** and
**BUILD-A-MODULE.md**.

---

## What this runbook cannot give you

Everything above is inside the repository. These are not, and no document can
make them so — they are the things you have to be *given*:

| What | Where it is written down |
|---|---|
| The Cloudflare account login (the account **id** is in the repo; the credential is not) | INVENTORY.md § 1 |
| The Google Cloud project and its two OAuth clients | INVENTORY.md § 3 |
| Who registered `kwapso.app`, and who holds that login | INVENTORY.md § 2 — **not currently recorded anywhere** |
| Every secret's value (the *names* are all here and in `.dev.vars.example`) | INVENTORY.md § 4 |
| `~/.config/kwapso/keys.env`, which eight files tell you to source | INVENTORY.md § 4 — it lived on one machine; recreate it |
| The legacy Glide rows and files (git-ignored on purpose — customer data) | INVENTORY.md § 6, glide/README.md |

The D1 database ids and the Cloudflare account id **are** checked in, in the
`wrangler.jsonc` files — which is why §2 and §4 tell you to overwrite them rather
than to go and find them.

**Once it is running**, RUNBOOK.md is the other half of this file: rolling a
change back out, getting data back with D1 Time Travel, and what to check when
something breaks at two in the morning.
