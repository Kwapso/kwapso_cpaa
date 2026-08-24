# INVENTORY.md, everything this app needs that is not in this repository

The code is complete. It still will not run, because it needs accounts somebody
owns, domains somebody registered, and credentials that live in people's heads
and keychains. **This file is the list of those things**, so a person holding only
the repository knows exactly what to go and ask for.

> **No secret value appears here, and none ever should.** This file names *which*
> credentials exist, *where* they are set, and *who* can issue a new one. That is
> the part that is genuinely lost when a laptop is, a secret can always be
> reissued, but only if you know it was needed.

---

## 1 · The accounts, and who to ask

| What | Detail | Without it |
|---|---|---|
| **Cloudflare account** | Workers **Paid** plan (Durable Objects require it). The account id is checked in as the `CF_ACCOUNT_ID` var in `workers/tenancy`, `content`, `data-ops`, `realtime` and `mcp`, so the id is recoverable from the repo; the **login is not** | nothing runs. Every worker, database, bucket and vector index lives here |
| **GitHub** | `github.com/Kwapso/kwapso_cpaa`, a **private** repository in the `Kwapso` organisation. The UI library `github.com/Kwapso/kwapso_ui` is **public**, so `npm install` works for anyone who can clone this one | no source. Org access must be granted by an owner |
| **Resend** | EU region, sending domain `kwapso.app`, from `kwapso <alerts@kwapso.app>` | no sign-in emails, so nobody can log in |
| **Google Cloud** | **Two** OAuth clients in the project (see §3) | the "Continue with Google" button and every Drive/Gmail/Calendar/Chat connection |
| **Anthropic** | Optional. Only sets which model the assistant thinks with | the assistant falls back to Cloudflare Workers AI and keeps working |
| **Domain registrar for `kwapso.app`** | The zone is on Cloudflare; **where the domain is registered, and who holds that login, is not recorded anywhere** | you cannot move or renew the domain |
| **Glide** | Business plan or above (that is the tier that issues an API token). Legacy only. See §6 | no route back to the pre-kwapso history |

**Owner and first point of contact for all of the above:**
Alaap, `alaap@swiftstruck.com` (also commits as `alaap@kwapso.com`), Swift Struck.
There is currently **no second person with independent access to any account in
this table.** That is the single largest recovery risk in this project, and no
document can fix it; see § *What has no backup*.

---

## 2 · The domains

`kwapso.com` is **not this project's**. It carries the business website and Google
Workspace mail. Nothing here writes DNS on it.

`kwapso.app` is the application domain, and the zone is on Cloudflare.

| Hostname | Points at | State |
|---|---|---|
| `agency-staging.kwapso.app` | `kwapso-staging` (agency gateway) | attached, serving |
| `staging-client.kwapso.app` | `kwapso-portal-staging` (portal gateway) | attached, serving |
| `agency.kwapso.app` | `kwapso` (agency gateway) | **not attached**, no DNS record, deliberately, until there is a real client |
| `client.kwapso.app` | `kwapso-portal` (portal gateway) | **not attached**, same reason |
| `portal.kwapso.app` | the legacy **Glide** portal | **NOT OURS TO TOUCH.** Live, serving real clients, until cutover |

Every name is a single label under `kwapso.app` on purpose: Cloudflare's free
Universal SSL covers the apex plus one level, and a two-level name would need paid
Advanced Certificate Manager.

Mail records for Resend (`resend._domainkey`, `send`) sit on their own subdomains
of `kwapso.app` and cannot affect `kwapso.com`.

Check before you write a sentence about any of this: `dig +short <hostname>`.

---

## 3 · The two Google OAuth clients. Do not mix them up

They exist for opposite reasons, and swapping them makes everyone who wants to log
in walk past a mailbox consent screen.

| Client | Used by | Scopes | Google review |
|---|---|---|---|
| **`kwapso-signin`** | `workers/auth`, the sign-in button | basic profile only | none needed |
| **`kwapso sync`** | `workers/content`, per-person Drive / Gmail / Calendar / Chat connections | `drive.readonly`, `drive.file`, `gmail.readonly`, `gmail.compose`, `gmail.send`, `gmail.modify`, `calendar.readonly`, `chat.messages`, `chat.spaces.readonly`, plus `openid email` on each | **yes**, these are sensitive scopes and the client goes through verification. The calendar ask is READ-ONLY as of 19 Aug 2026: the app has only read a calendar since 18 Aug, and the grant now says so too. It cost every connected person a reconnect, because a grant at Google is additive per OAuth client and a narrower ask alone changes nothing; OPERATIONS.md holds the whole procedure |

Rebuilding these from nothing means: create a Google Cloud project, configure the
OAuth consent screen (External), create each client as a Web application, register
its redirect URIs character for character, and, for `kwapso sync` only, submit
for verification, which takes real calendar time.

Redirect URIs are listed in OPERATIONS.md § *Secrets*: four for `kwapso-signin`
(one per front door per environment) and two for `kwapso sync` (agency origin
only, both environments). A hostname change means changing the console **and** the
worker's `APP_ORIGIN` / `PORTAL_ORIGIN` vars.

---

## 4 · Credentials, by name, by holder

Values are never here. `.dev.vars.example` in each worker directory names the same
set for local development.

| Credential | Issued by | Set on |
|---|---|---|
| `RESEND_API_KEY` | Resend → API Keys (Sending access) | auth |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | the `kwapso-signin` client | auth |
| `GOOGLE_CONNECT_CLIENT_ID` / `GOOGLE_CONNECT_CLIENT_SECRET` | the `kwapso sync` client | content |
| `GOOGLE_TOKEN_KEY` | you, `openssl rand -base64 32` | content |
| `CF_D1_TOKEN` | Cloudflare → API Tokens → Account · D1 · Edit | tenancy, content, data-ops, realtime |
| `INTERNAL_KEY` | you, any long random string | auth, tenancy, content, mcp, **both gateways** |
| `ADMIN_KEY` | you | tenancy, data-ops |
| `TEST_LOGIN_KEY` | you | auth, **non-production only** |
| `ANTHROPIC_API_KEY` | Anthropic console. Optional | data-ops |
| `GLIDE_API_KEY` | Glide, Business plan and above. Legacy only | nothing deployed, local scripts only |
| `CLOUDFLARE_API_TOKEN` | Cloudflare, same scope as `CF_D1_TOKEN` | nothing deployed, local scripts only |

`INTERNAL_KEY` must be **identical** across all six holders. The internal doors
fail closed on a mismatch, so a half-finished rotation is an outage, not a
degradation.

**Secrets are copies, not references.** Replacing a credential means pushing it to
every worker in its row again, then testing on a path that really exercises it,
for `CF_D1_TOKEN`, that means a *fresh* signup, because the smoke suite reuses an
existing team and will go green with a dead token.

### `~/.config/kwapso/keys.env`, the file that is not in the repository

Eight places in this codebase tell you to `source ~/.config/kwapso/keys.env`.
**That file lived on the author's machine and is not recoverable.** Recreate it;
it is a plain shell file of exports, and nothing is lost but the values, each of
which can be reissued from the table above:

```bash
# ~/.config/kwapso/keys.env   (chmod 600)
export ADMIN_KEY=…
export TEST_LOGIN_KEY=…            # staging only
export CLOUDFLARE_ACCOUNT_ID=…
export CLOUDFLARE_API_TOKEN=…
export GLIDE_API_KEY=…             # only if the Glide account still exists
```

The root `.env.example` lists every variable the scripts in `scripts/` read.

---

## 5 · The moving parts nobody can see

| What | Where | When |
|---|---|---|
| Estate housekeeping | `workers/tenancy` cron | `10 3 * * *`, sizes every D1 database in the account, alarms at 80% of the 10GB cap, sweeps spent sign-in rows |
| Knowledge sweep | `workers/content` cron | `*/15 * * * *` |
| Morning digest | `workers/content` cron | `0 7 * * *` |

Both cron jobs record a failure, or a hit ceiling, to `error_logs`, so "we
stopped early" can never be misread as "there was nothing to find".

There are **no inbound webhooks** and no third-party callbacks other than the two
Google OAuth redirects.

**Data that must exist before the app is usable:** none that a person has to load.
The import catalogue reconciles itself against the code on first read, and a team's
database is created and migrated the moment the team is. `scripts/seed-staging.mjs`
fills staging with one obviously fictional client world to click around;
production starts empty on purpose.

---

## 6 · The legacy Glide data

`glide/data/`, `glide/files/`, `glide/normalised.json` and `glide/r2-manifest.json`
are **git-ignored on purpose, they are real customer data and must never be
committed.** Their absence from the repository is correct, and it should stay that
way.

What survives in the repository is the *route back to them*: `glide/catalog.json`
(every table id in both legacy apps, collected by hand and impossible to collect
again from the Glide UI), `glide/README.md`, `glide/RECONCILIATION.md`, and the
scripts that fetch and shape the rows.

```bash
source ~/.config/kwapso/keys.env && node scripts/glide-pull.mjs
```

**This route has an expiry date.** It needs a live Glide account on the Business
plan. `glide/files/`, roughly 79 MB of clients' own logos, photos, PDFs and video,
was copied off Google's storage before the Glide account lapses, and once that
account is closed `scripts/glide-files.mjs` returns nothing. **Where that 79 MB is
backed up is not recorded anywhere.** If it exists in only one place, it is one
laptop away from gone.

---

## What has no backup

Stated plainly, because these are the answers a stranger most needs and the ones
no document currently gives:

1. **A second person with account access.** Every account in §1 has exactly one
   holder. This is the truck factor, and it is one.
2. **An off-Cloudflare copy of the databases.** D1 Time Travel covers 30 days
   *inside* the account. Nothing guards against losing the account itself.
   RUNBOOK.md § 2 has the one-line export if this becomes a decision.
3. **The R2 buckets.** No versioning, no point-in-time restore.
4. **The rescued Glide files.** 79 MB, one copy known, source expiring.
5. **The domain registrar login for `kwapso.app`.**
6. **A second git remote.** `origin` is the only copy off this machine.
