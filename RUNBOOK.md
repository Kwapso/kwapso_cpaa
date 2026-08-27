# RUNBOOK.md, it is live, it is broken, and you were not here when it was built

BOOTSTRAP.md stands the base up. OPERATIONS.md ships a change. **This file is for
the other direction**: taking a change back out, getting data back after somebody
lost it, and working out what is wrong at two in the morning.

> **Read the first section before you touch anything.** Every command below acts
> on a real Cloudflare account, and the machine you are sitting at may be logged
> into the wrong one.

---

## 0 · Which Cloudflare account am I about to change?

`wrangler` picks an account from whatever the machine is logged into. **No worker
in this repo pins `account_id`**, so nothing in the code corrects a wrong login,
a deploy, a database delete or a secret push simply lands wherever the session
points. On the machine this project was written on, the default login was a
*different* client's account, and the only thing that ever prevented an accident
was a name lookup happening to fail.

So, before any command in this file:

```bash
npx wrangler whoami           # prints the account name + id you are about to act on
```

Compare the id against `CF_ACCOUNT_ID` in `workers/tenancy/wrangler.jsonc` (all
five core-bound workers carry the same value. See INVENTORY.md). If they differ,
stop and fix the login; do not "just try it".

`scripts/reset-all.mjs` enforces this for you and refuses to start unless
`CLOUDFLARE_ACCOUNT_ID` matches the id compiled into it. Its error message
mentions a wrapper called `cf-exec`, **that wrapper is not in this repository.**
It was a shell function on the original author's machine. Ignore it and export the
two variables yourself:

```bash
export CLOUDFLARE_ACCOUNT_ID=<the account id from any wrangler.jsonc>
export CLOUDFLARE_API_TOKEN=<a token with Account → D1 → Edit>
```

---

## 1 · Rolling back the code

Cloudflare keeps every uploaded version of a Worker, so a rollback is a pointer
move, not a rebuild. It takes seconds and needs no clean checkout.

```bash
cd workers/<name>
npx wrangler versions list --env staging      # the 10 most recent, newest first
npx wrangler rollback <version-id> --env staging -m "why"
```

Omit `--env staging` for production. `wrangler rollback` with no version id
returns to the previously-deployed version, which is what you want in a hurry.

### The order to roll back in, the reverse of the deploy order

Deploy is `realtime → auth → tenancy → content → data-ops → mcp → gateway →
portal-gateway`, innermost first, because each worker service-binds the ones
before it. **A rollback runs the other way round:**

```
portal-gateway → gateway → mcp → data-ops → content → tenancy → auth → realtime
```

The reason is the same reason in reverse. Both gateways are the only things
public traffic touches, so taking them back first stops anyone reaching the
broken contract at all, and every worker still standing behind them is one the
old gateway already knew how to call. Roll a domain worker back first and the
still-new gateway is calling an older shape of the thing it forwards to, which is
the failure you were trying to end.

**In practice you rarely need all eight.** Roll back only the workers whose
version actually changed, `npx wrangler versions list` shows the upload time.

### Named triggers, when to roll back rather than fix forward

Roll back immediately, without discussion, if any of these is true:

| Trigger | Why it is a rollback and not a fix |
|---|---|
| `npm run smoke:staging` fails after a production deploy | the live login → team journey is broken; every user is affected now |
| Either front door returns 5xx on `/` | the app is down, and a fix needs a build |
| Sign-in stops issuing codes | nobody new can get in, and the throttle tables make retries worse |
| A permission or fence check is behaving wrongly | a data-exposure bug outranks a feature outage every time |
| `error_logs` fills with the same new error at any rate | the change is generating errors faster than you can read them |

**Fix forward instead** when the break is cosmetic, affects one screen a role
rarely opens, or when the previous version has a *worse* bug. Say which you chose
in the rollback message or the commit, the next person needs to know a version
was skipped on purpose.

### What a rollback does NOT undo

- **Secrets.** They are per-worker values, not part of a version. A rolled-back
  worker keeps whatever secret was last pushed.
- **Migrations.** Both core and team migrations are additive and are never edited
  once applied. Rolling code back to before a migration is safe (the extra column
  is simply unread); rolling the *database* back is section 2.
- **Vars in `wrangler.jsonc`.** These ship with a version, so they do come back,
  which is worth remembering if you changed one deliberately.

---

## 2 · Getting data back

### The core database and every team database. D1 Time Travel

D1 keeps a continuous 30-day history. There is nothing to enable and nothing to
schedule; it is already on.

```bash
cd workers/auth
# What can I go back to, and what was there at that moment?
npx wrangler d1 time-travel info kwapso-core-staging --timestamp 2026-08-14T09:00:00Z
# Put it back.
npx wrangler d1 time-travel restore kwapso-core-staging --timestamp 2026-08-14T09:00:00Z
```

`--bookmark` takes the opaque marker `info` prints, which is exact; `--timestamp`
takes a Unix time or RFC3339 and is easier to reason about. Anything older than
30 days is gone.

**The trap that makes this dangerous here.** This project keeps identity in ONE
core database and every team's content in its OWN database. They are separate D1
databases, so Time Travel restores them separately. Roll the core database back
past a team's creation and that team's database still exists, full of rows, with
nothing pointing at it, and the reverse leaves members holding a team whose
content jumped backwards. **If you restore one, work out whether the other has to
move with it**, and restore both to the same moment.

Per-team database names come from the core `teams` table; `scripts/reset-all.mjs`
reads them the same way if you need the list.

### Taking a copy you can hold

Time Travel lives inside the Cloudflare account. If the risk you are guarding
against is *losing the account* rather than losing a row, take a file:

```bash
cd workers/auth
npx wrangler d1 export kwapso-core --remote --output ./core-$(date +%F).sql
```

There is no scheduled job doing this. **If an off-Cloudflare backup matters to
this product, that is a decision nobody has made yet**, it is listed in
INVENTORY.md § *What has no backup*.

### R2, the uploaded files

The four buckets (`kwapso-media`, `kwapso-learning-media`, `kwapso-help-media`,
`kwapso-internal-media`, each with a `-staging` twin) have **no point-in-time
restore and no versioning**. A deleted object is gone. Nothing in the app deletes
objects today, which is why this has not bitten anyone; treat any future bulk
delete as irreversible and copy the bucket out first.

`kwapso-learning-media` deserves a line of its own: nothing writes to it any more
(the Learning module was purged on 17 Aug 2026) but the gateway still serves it at
`/media/learning/*`, because the images inside the articles the knowledge base
kept still point there. It is the one bucket that can only ever lose objects, so
it is the one where a bulk delete is unrecoverable by definition, there is no
process left that would put anything back.

The rescued Glide files are a special case. See INVENTORY.md § *The legacy Glide
data*.

### The Durable Object, nothing to restore

`TeamChannel` fans out `{resource, id, op}` pings and holds no application data.
Losing it costs live updates until the next connection, never a row.

---

## 3 · What to check when it breaks

Work down this list. Each step is cheap and rules something out.

**1. Is it the app or the platform?**
`https://www.cloudflarestatus.com`. Workers, D1 and R2 are listed separately.

**2. Are the workers actually up?**
Each worker answers a health route through its gateway. The agency gateway is the
one to ask, because it is the path a user takes:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://agency-staging.kwapso.app/
curl -s https://agency-staging.kwapso.app/api/auth/health
```

**3. What did the app itself record?**
Every worker writes failures to the central `error_logs` table. Read it newest
first, this is usually the fastest answer in the building:

```bash
curl -s "https://agency-staging.kwapso.app/api/data-ops/admin/errors?status=open&limit=25" \
  -H "x-admin-key: $ADMIN_KEY"
```

Mark one dealt with as you go: `POST /api/data-ops/admin/errors/resolve`
`{ id, note }`. ERROR-HANDLING.md explains the seam.

**4. Watch it happen live.**

```bash
cd workers/<name> && npx wrangler tail --env staging
```

**5. Run the journey end to end.**

```bash
export TEST_LOGIN_KEY=…  SMOKE_BASE=https://agency-staging.kwapso.app
npm run smoke:staging
```

A `too_soon` or `too_many_sends` result is the sign-in send throttle doing its
job after repeated test logins, not a fault. Wait it out.

### Symptoms whose cause is not obvious

| What you see | Almost always |
|---|---|
| Team creation 500s, everything else fine | `CF_D1_TOKEN` is stale on tenancy. Secrets are copies, not references, re-push it to **every** worker that holds it, then test with a FRESH signup, not a reused team |
| The whole MCP surface 401s or 500s | a core migration was not applied, the MCP tables and the token-expiry column both live in core |
| Sign-in code request 500s | same: a core migration behind the send throttle has not been applied |
| Live updates stop for client logins only | `CF_D1_TOKEN` missing on **realtime**, the channel fails closed rather than leak row ids |
| An existing team's ticket-type picker is empty | a team-schema migration has not been rolled out. `POST /api/tenancy/admin/migrate-teams` with `x-admin-key` |
| The deploy refuses saying **team databases are behind** | working as intended, and it is the same cause as the row above, caught one step earlier. The check runs after tenancy deploys, so the robot already knows the migration: run it — `POST /api/tenancy/admin/migrate-teams` with `x-admin-key`, safe to re-run — then re-run the deploy. **Do not disable the gate.** If a team genuinely cannot be migrated, deactivate it or add a dated waiver; the header of `scripts/check-team-migrations.mjs` has both and says why there is no off switch |
| The migration robot answers `{"teamsMigrated":0}` and nothing changes | it applies the list bundled into the **deployed** tenancy worker, so it cannot roll out a migration that only exists in your working tree. Deploy tenancy first — `npm run deploy:<env>` sequences this correctly on its own. Pressing it again will not help |
| A worker "not found" on a first deploy | the cold-start binding cycle. OPERATIONS.md § deploy order has the one-time fix |
| The import target picker looks wrong | it self-heals on read; a target an owner switched off stays off on purpose |

---

## 4 · The changes that need a plan, not a command

- **A new core migration** goes on `kwapso-core-staging` and `kwapso-core` BEFORE
  the workers that read it are deployed. Apply first, deploy second, the reverse
  is an outage.
- **A new team-schema migration** ships in `workers/tenancy/src/team-schema.ts`
  and reaches existing teams only when the migrate-teams robot runs. New teams get
  it automatically. Until you run the robot the estate is split.
- **Rotating a shared secret** (`INTERNAL_KEY` above all) is not atomic. Every
  holder keeps the old value until it is pushed again, and the internal doors fail
  closed on a mismatch, so push to all holders and redeploy before you consider it
  done. INVENTORY.md lists who holds what.
- **Retiring a domain** is a DNS change plus a custom-domain detach, plus the
  matching redirect URI in the Google console. Change one and you must change all
  three.
