# Data model — Glide Base v3 → Brimba (the mental model)

Every table and column from the user's Glide "Base v3" export (14 CSVs),
re-read 2026-06-13, mapped to Brimba's design. Marks what we KEEP (real
persisted data), what we DROP (Glide UI/computed artifacts), our additions, and
OPEN questions. This is the canonical data-model reference — keep it accurate.

## Glide patterns that are NOT persisted data (dropped everywhere)

Glide columns are a mix of stored data and live "computed columns." These
recur across tables and are **not** real columns in our databases — they are
done at runtime, in the UI, or by an action:

- **Transformers / builders**: `Email transformer/*`, `*/Request body JSON
  object(/string)`, `*/New team JSON object(/string)`, `Onboarding JSON
  object(/string)`, `Accept pending invites JSON(/string)`, `Summary/JSON
  object string` — these built strings/JSON for Glide webhooks. Our workers
  build any payload in code.
- **UI/navigation state**: `*/Detail screen tab view`, `Home/Tab view`,
  `Edit screen/Type`, `Edit screen/Screen title`, `Identity/Current screen
  link`, `App information/*`, `*/Play link`, `Shortcuts/Total count`,
  `Device/Screen size`. This is per-session view state — it belongs to the
  screen engine's runtime state, never the database.
- **Clocks**: `Time/Now`, `Time/Now + 11 minutes` — Glide had no server clock;
  we use real timestamps in workers.
- **Derived values**: `Identity/Full name` (first+last), `Onboarding/Completion
  percentage`, `Profile is filled`, `Is complete`, `*/Is valid email`,
  `Change is available`, `Invite member is possible`, counts — all computed on
  read, not stored.

So: where a Glide table looks like it has 30 columns, most are computed; the
real persisted shape is small. Each table below lists only what we store.

## The audit block (standard, every table)

Glide put this on most tables; we standardize it. **OPEN Q1** = which tables.

- `created_at`, `creator_id`, `creator_email`, `creator_name`
- `updated_at`, `editor_id`, `editor_email`, `editor_name`
- `deactivated_at`, `deactivator_id`, `deactivator_email`, `deactivator_name`

Actor email+name are **snapshots at the time of the action** (so the trail
stays truthful even if that person later changes their name/email). "Archived"
in Glide = our `deactivated_at` (non-null = archived/deactivated).

---

## GLOBAL core (the card catalog — `kwapso-core`)

### users  — KEEP (built)
Real data: `id`, `email`, `image_url`, `first_name`, `last_name`,
`onboarding_completed_at`, `current_team_id`. Glide `Row owners/Team keys
string` (the teams a user belongs to) = our **team_members** table.
Dropped: all transformer/onboarding-JSON/tab-view/device columns.
**No-name fallback (2026-06-21):** members can exist pre-onboarding, so
`first_name`/`last_name` may both be empty — display the `email` as the name in
that case; with no `image_url`, show initials (or a placeholder avatar when even
initials aren't derivable).

### teams — KEEP (built)
Real data: `id`, `name` (`Identity/Team name`), `logo_url`. Brimba adds
`database_id`, `db_status`, `schema_version` (the per-team-DB architecture).

### team_members — KEEP (built, GLOBAL)
Real data: `team_id` (`Row owners/Team key`), `user_id`, `role_id`
(`Member roles/Member role ID`). Glide's `Change member role/Updated member
role ID` + `webhook complete` were async-webhook scaffolding — **dropped**;
role change is a direct server action. Membership is global (answers "which
teams am I in?" before we open any team DB).

### email_change_logs — KEEP (BUILT 2026-06-17, GLOBAL — no team key in the export; `db/core/0005_email_change.sql`)
Purpose: change a user's email safely. Real data: audit block + `current_email`,
`new_email`, `expires_at`, `verification_code` (numeric OTP to the NEW email),
`user_input_code`, `email_change_successful`, `email_change_timestamp`. Flow:
request → OTP to new email → match → swap on the user row.
**UPDATED 2026-06-21:** shipped in Phase 2 (`db/core/0005_email_change.sql`).
The login/email-change codes were **split out into a separate hashed
`email_change_codes` table** (the OTP is stored hashed, not in clear on the log
row); `email_change_logs` remains the human-readable security record (old/new
email, outcome, timestamps). The old address is warned on change.

### account_activity — KEEP (BUILT 2026-06-18, GLOBAL — `db/core/0007`)
Purpose: the person's OWN identity history, shown in Settings → Account. NOT
team-tied (per-team `activity` lives in each team DB; identity events belong to
the user across all teams). Real data: `id`, `user_id`, `type`
(`name_changed`/`photo_changed`/`email_changed`), `description` (human
sentence), `created_at`. No actor-snapshot block — the actor is always the user
themselves. Written best-effort by the auth worker on profile/email change
(`workers/auth/src/lib/account-activity.ts`); read via `GET /api/auth/activity`;
rendered with the library `ActivityFeed`. `email_change_logs` is kept alongside
it as the security record (old/new email).

### importable_databases — KEEP (BUILT 2026-06-23, GLOBAL reference — `db/core/0008`)
Purpose: the owner-maintained catalog for the data-import feature — which target
tables can be imported into. Real data: `id`, `table_key` (the target the import
writes into, unique), `display_name`, `description`, `required_columns_json` (the
schema the agent maps an uploaded file onto), `auto_populate_columns_json`
(columns the import may fill itself, e.g. creator + team key),
`reference_dataset_url` (both **unused today** — the code's `TARGETS` is the
truth), `is_active`, + the audit block (creator/editor). Shared across all teams,
so it lives in the global core DB. **The catalogue SELF-HEALS against the code on
read (LAW R13):** `reconcileCatalog` (`lib/import.ts`) INSERT-only upserts a row
for every code `TargetDef` (`ON CONFLICT DO NOTHING`), so a fresh environment's
picker is never empty and a target the owner deliberately switched OFF (its row
exists, `is_active=0`) stays off — the picker filters `is_active` **in memory**,
never in SQL, or "switched off" and "never existed" would look identical. The
by-key door heals on a miss only (the per-import path pays nothing). The owner
seed door (`POST /api/data-ops/admin/seed-targets`, x-admin-key) now only refreshes
LABELS (display name / description / schema) and never re-activates a switched-off
target — it is no longer a step anyone must remember. Three targets are wired
today: `selectable_data` (Dropdown values), `member_roles`, and `learning`
(`team_members`/`help`/`teams`/`screens`/`agent` are pinned non-importable in
`CATALOG_EXEMPT`); the agentic multi-file importer (AGENTIC-IMPORT.md) orders them
by their declared references.

### agent_usage — KEEP (BUILT 2026-06-23, GLOBAL — `db/core/0009`)
Purpose: the per-team **free** half of the AI agent quota. Real data: `team_id`,
`period` (the metering window, a `'YYYY-MM-DD'` day — the free counter resets
daily), `used` (AI units consumed this window), `updated_at`. One unit = one
model call, metered before EACH call inside a turn (a multi-step turn costs one
unit per step, capped by `MAX_STEPS`; declining a confirm costs nothing; running
dry mid-plan stops the turn with a saved, plain reply). **A unit is spent the
moment the model answers**, so exactly one thing is refundable: the unit metered
for a step whose model call THREW, which bought no completion at all
(`refundUnspentUnit`, and only from the paid pool — the free allowance is the
daily BOUND on how much model spend a team can cause, and a refund dissolves the
bound). A REFUSED ACTION IS NOT REFUNDED: it used to be, and that made the credit
lane the unbounded one — asking to invite someone already on the team fails on
demand, every time, burning real tokens and handing the credit straight back, so
the same turn could run forever for nothing. Once a team is over the app's own daily allowance (`AGENT_FREE_DAILY`:
code default **25/day**, but both environments ship **50**), the gate spends from
the credit balance instead. Lives in
the global core DB so the gate can check it without opening a team database.

### agent_credits — KEEP (BUILT 2026-06-23, GLOBAL — `db/core/0010`)
Purpose: the **purchasable** half of the AI agent quota (the owner's credit-based
model). Real data: `team_id`, `balance` (AI credits remaining, never negative),
`lifetime_granted` (total ever granted, for the admin view), `updated_at`. Once a
team's free daily allowance is used up it spends from this balance; when both are
empty the agent is blocked. Top-ups are an owner action today
(`POST /api/data-ops/admin/grant-credits`, x-admin-key); real payments wire in
later against this same balance (the grant action is the seam). Lives in the
global core DB so the gate can spend a unit without opening a team database.

### agent_usage_log — KEEP (BUILT 2026-07-01, GLOBAL — `db/core/0011`)
Purpose: the usage TRAIL behind the panel's "where did my credits go" view.
Real data: `id`, `team_id`, `actor_id`, `actor_name`, `created_at`, `credits`
(units this command consumed), `source` (`free` / `credit` / `mixed`), `summary`,
and **`kind`** (`db/core/0014`: `'action'` | `'prompt'` | NULL). **Visibility rides
`kind` (C3 — the log tells the TEAM where its credits went):** an `action` row's
summary is TEAM-VISIBLE (the team is entitled to see what was done in its name); a
`prompt` row's summary is the author's OWN (a teammate sees who spent how much and
when, never the question typed); a back-filled NULL row stays private (it can't be
classified after the fact, and a wrong guess publishes somebody's question). The
old "only my own rows" rule showed an admin four blank rows with a teammate's name
on them — withholding the one thing the team is owed. The summary is titled by the
**WRITE action(s) the assistant took** (e.g. `Create the role
"Test" · Invite alaap@… as Test`, with `(failed)` on a refused call), falling
back to the user's prompt for a plain question OR a read-only turn. A READ isn't
an action the user "did", so it never titles the row — a clarifying reply reads as
the question, not "List roles" (the credit-log-clarity feedback). A role-choice
reply like "anything" still leads to a write (the invite), so that write titles
the row; only a turn that makes no change is titled by the prompt. **One row per
user COMMAND**,
written best-effort (a
log hiccup never fails the turn). A command that pauses for a yes/no confirm runs
as two turns (propose + confirm); the confirm turn FOLDS its units into the
propose row (`credits.ts` `foldUsageIntoLatest`) rather than adding a second
row — so the history stays one entry per command and reconciles exactly with the
balance drop (fixed 2026-07-10: a confirmed command used to split into a row +
a cryptic "(continued)" row). The fold **APPENDS** its actions to the row's title,
never replaces — one command can pause for confirmation more than once, and
replacing left a 10-credit turn titled by its last step alone. Read newest-first, team-scoped, via
`GET /api/data-ops/agent/usage-log`. Lives in the global core DB beside the
quota tables it explains.

### mcp_tokens — KEEP (BUILT 2026-07-07, GLOBAL — `db/core/0013`)

Personal access tokens for the MCP front desk: `id, user_id, team_id, label,
token_hash (sha256; the secret is shown ONCE and never stored), created_at,
**`expires_at`** (`db/core/0016` — every token has a deadline,
`MCP_TOKEN_TTL_DAYS` = 90; a MISSING one counts as expired, so nothing is
immortal), `last_used_at`, `revoked_at` (deactivate-not-delete). An account may
hold **10 live tokens** (`MAX_ACTIVE_MCP_TOKENS_PER_USER`, enforced inside the
INSERT), and the settings list sorts unrevoked rows first — together that is what
keeps every usable token inside the 1,000-row list cap and therefore revocable
from the app. Verified on EVERY /mcp request. The same migration adds **`sessions.team_pin`** — a session minted for
a token is PINNED to the token's team (auth answers /me with the pinned team;
short-lived, never slid), so a token can never act outside the team it was
created for.

### error_logs — KEEP (BUILT 2026-07-03, GLOBAL — `db/core/0012`)
Purpose: the central error store (ERROR-HANDLING.md) — one row per UNEXPECTED
failure (worker crash or client-side error), never a clean GuardError refusal.
Real data: `id`, `at`, `source`, `place`, `message`, `stack` (capped), optional
`team_id`/`user_id`/`url`, and the resolve workflow (`status` open→resolved,
`resolved_at`, `resolution_note`). Owner-only doors (x-admin-key):
`GET /api/data-ops/admin/errors` + `POST /api/data-ops/admin/errors/resolve`.
Lives in the global core DB — system health is cross-team; each environment has
its own core DB so staging/production histories never mix.

### selectable_data_types — KEEP (TO BUILD) — Q2 RESOLVED (see Resolutions:
global standard GROUPS + per-team VALUES)
Glide: 3 rows (`File type`, `Learning category`, `Help type`), no team key, no
audit → a tiny GLOBAL reference of dropdown GROUPS. But the values table also
uses `Help status` (not listed as a type) and `Learning category` has no
values. (We seed those two groups as **`Ticket type`** and **`Ticket status`** —
the module is called Tickets, and team migration `0010_ticket_vocabulary`
relabelled the rows every existing team already had.) So the types list and the values were loosely coupled in Glide.

### Retention in core — the ONE place rows are actually deleted

"Deactivate, never delete" is a rule about **records**: a person, a role, an
account, a ticket. It has never been a rule about **spent sign-in artefacts**,
and treating it as one is how the shared database grew with no ceiling and no
sweep.

Three tables in core are written by callers who are not signed in — anyone who
types an email address mints a `login_codes` row and a `login_sends` row — so
their totals were bounded by nothing at all, in the one database whose 10GB cap
takes the whole product down rather than one tenant. A nightly sweep
(`shared/workers/retention.ts`, run from tenancy's cron beside the size alarms)
takes:

| table | what goes | why it is safe |
| --- | --- | --- |
| `login_codes` | older than `AUTH_RETENTION_HOURS` (24h) | a code lives ten minutes; the per-address cap looks back one hour |
| `login_sends` | older than `AUTH_RETENTION_HOURS` | the send budget's whole window is one hour |
| `sessions` | already past their own `expires_at` | that cookie is already dead — every read re-checks expiry |
| `error_logs` | older than `ERROR_LOG_RETENTION_DAYS` (90) | diagnostics, not a record — and 90 days is the window `db/core/0012` has claimed since the table was created |

Sessions are judged by **expiry, not age**: `expires_at` slides forward while a
session is in use, so an age-based sweep would sign out every long-lived user.

Nothing anyone might have to answer for is touched: activity, account activity,
`agent_usage_log`, invite audits and every audit block stay. `error_logs` is the
one that moved, and only because it was already documented as a 90-day history
with nothing enforcing it — a rate ceiling (`db/core/0019`) bounds how fast a
store fills, never how full it gets. **A retention window for `account_activity`
or the usage ledgers is an owner's decision, not an index's**, and it is still
open (scaling review 2026-08-14).

**A statement is bounded; a NIGHT is bounded separately** (scaling review
2026-08-14). Each delete takes at most `RETENTION_DELETE_CAP` rows — that is the
cap on what can time out — and the tick runs that statement up to
`RETENTION_PASSES_PER_TICK` (40) times per table, stopping the moment one comes
back short. Only the first of those existed, and the difference was the finding:
5,000 rows a night against a shared database taking sign-ins from every tenant is
not retention, and at the yardstick (a quarter of a million people in one tenant,
plus everyone else) the tables grew monotonically while a green nightly job
reported success. 40 × 5,000 = 200,000 rows per table per night, no statement any
larger than the one that already worked. A run that hits the PASS ceiling is
recorded to `error_logs`, not merely logged (R12).

### db_growth — KEEP (BUILT 2026-08-14, GLOBAL — `db/core/0022`) — HOW LONG HAVE I GOT
Purpose: the half of the growth watch the size alarm never had. `db_alerts` says a
database has crossed 80% of D1's 10 GB cap, and 80% is a POSITION, not a warning —
two databases at 8.1 GB raise the identical alarm and are in completely different
trouble, one having sat there a year and the other having crossed 6 GB last week.
The mover takes a while and needs a person, so the question that follows every alarm
is "how long have I got", and nothing recorded the two readings a rate needs.

**One row per database, not one per night.** A sample table is the obvious shape and
the wrong one: an estate near the platform's 50,000-database limit would add 50,000
rows a night to the very database this mechanism keeps small — a growth watch that is
itself the growth. Each row holds tonight's `size_bytes`/`at` and the previous
reading (`prev_size_bytes`/`prev_at`), and the nightly upsert shifts current into
previous **inside one statement** (`excluded` vs the bare columns), so there is no
read-then-write pair to race.

**The interval is stored, not assumed.** A rate computed against a presumed 24 hours
is quietly wrong exactly when the cron has been late, skipped or re-fired — which is
when you are most likely reading it. `daysUntilFull()` (one exported function, beside
the rows it reads) is headroom-from-the-CAP ÷ (Δsize ÷ Δtime), and it returns **null**
rather than a number whenever it cannot answer honestly: one reading only, no elapsed
time, or a database that held still or shrank. "Not growing" and "growing slowly" are
different answers and only one of them is a number.

Bounded at `CRON_GROWTH_CAP` (200) readings a night, taking the LARGEST databases —
a trend only matters where there is a ceiling to reach. Written on quiet nights too
(a trend you start measuring at 80% is a trend you measured too late), and wrapped so
a failed reading can never cost somebody the alarm that a database is nearly full.
Read through the owner-gated `GET /api/tenancy/admin/db-sizes` as `filling`, soonest
first. Locked by `workers/tenancy/test/db-growth.test.ts`.

**Every sweep predicate has an index behind it** (`db/core/0015`, `0017`, `0021`).
`sessions` did not: the only index on it led with `user_id`, so the sweep meant to
keep the shared database under D1's 10 GB cap was full-scanning the largest table in
it, every night, to find 5,000 rows — a sweep whose predicate scans is the timeout
this whole mechanism exists to avoid, wearing a `LIMIT`.

The other half of the same problem is RATE, and a sweep does not solve it: every
repeatable core write now carries a per-caller ceiling that rides its INSERT
(`ACCOUNT_ACTIVITY_PER_HOUR`, the login-send budget). And the nightly size alarm
watches **every** database in the account, core included — it used to filter
`team-*`, so `kwapso-core` could never raise one.

---

## PER-TEAM (each lives in that team's own database)

### member_roles + role_permissions — KEEP (built; we split Glide's WIDE → TALL)
Glide `Member roles` was WIDE: `Identity/Title`, `Description`, `Is default`,
then **24 boolean columns** = 6 modules × {read,create,edit,delete}. Modules:
**Teams, Team members, Member roles, Learning, Help, Selectable data** — exactly
our `TEAM_MODULES` (the module a person now reads as **Tickets** is still keyed
`help`, because that string sits in every role's permission sheet). We store the 24 booleans as a TALL `role_permissions` sheet
(role × module × 4 bits) so a new module = new rows, not new columns. `is_default`
flags the seeded Admin (locked) + Viewer. Roles are **edit-live + deactivate-only,
never delete** (holders keep the role). Q4 RESOLVED (see Resolutions): Admin
locked; Viewer is a normal editable role.

### selectable_data — KEEP (built, per-team)
Real data: audit block + `type`, `value`, `is_default`. Per-team dropdown
values, seeded from Base v3 defaults on team creation.

### learning + learning_progress — KEEP (BUILT 2026-06-23, team migration `0004_modules`)
Purpose: a team's own how-to content. `learning`: audit + `category` (a
`Learning category` selectable value, pick-or-create → `selectable_data`),
`content_title`, `content_description`, `content_type` (a `File type` value:
image/video/link…), `content_link`, an in-app `body`, `sequence` (manual
ordering); deactivate-not-delete. **`Details/Seen` is RESOLVED** by a separate
`learning_progress` table (the user×learning join the open question called for):
audit + `learning_id`, `user_id`, and the reversible "mark as done" state, so a
curator dashboard can show every member's done state. Per-module file storage is
R2 (`kwapso-learning-media`), not a DB column.

### help + help_threads — KEEP (BUILT 2026-06-23, team migration `0004_modules`, two-tier)

**This is the Tickets module.** There is no help section and there is no second
ticket module — one thing, wearing the name it was born with underneath. What a
person or a URL sees says **Tickets**: the sidebar, the heading, the breadcrumb,
the address (`/tickets`, `/t/<teamId>/tickets/<id>`, and `/tickets` in the
portal), the dropdown vocabulary (`Ticket type`, `Ticket status`) and the
glossary. It is not a place to report bugs about the app itself — a ticket is
something an account asked us for.

**Four things stay `help`, deliberately.** Each is data already written down or a
contract already published, so renaming it can only take something away:

| Still `help` | Why it stays |
|---|---|
| the permission module key (`help:read/create/edit/delete`) | it is the string sitting in `role_permissions` in every team database — renaming it takes somebody's access away |
| the tables `help` + `help_threads`, and `activity.related_table = 'help'` | renaming orphans every history row already written about a ticket |
| the API paths `/api/content/help*` | they are `PORTAL_DOORS` entries, `PORTAL_VISIBLE_READS/WRITES` keys and R21's derivation input |
| the MCP tool names (`list_help_tickets`, `create_help_ticket`, …) | a published external contract — outside developers call these by name |

The rule, in one line: **what a person or a URL sees says tickets; what the
database and the wire say stays `help`.** The two names meet in exactly one seam,
`MODULE_PERMISSION` in `web/lib/screens.ts` (`tickets: "help"`), and
`web/test/nav.test.ts` fails if it is removed. Do not "finish the rename".

`help` (parent ticket): audit + `help_type` (selectable), `description`,
`screen_recording_link`, the source screen/record capture, `status` on a FIXED
lifecycle, `resolved`, `resolved_on`, `resolver_id/email/name`.
`help_threads` (messages): audit + `help_id` (the parent ticket),
`tagged_team_member_user_ids` (@mention → email notify), `message_body`. A ticket
with a threaded conversation. (Ticket attachments to R2 `kwapso-help-media` — the
bucket name follows the table — are a deferred hook, see AGENT-MODULES-PLAN.)

**The work engine's ticket** (team migration `0011_ticket_work_engine`, BUILT
2026-08-11 — SCOPE ch.07). The same table, grown into the thing the scope
describes; there is no second ticket beside it, and there never will be.

- **The five states.** `status` now runs `new` → `triaged` → `in_progress` →
  `ready` → `resolved`. The two old names moved onto the two that mean the same
  thing: `open` → `new`, `reopened` → `triaged`. Reopening still happens — a
  staff member moves a resolved ticket back to `triaged` — it just is not a state
  of its own any more, and there is deliberately no client-side reopen button.
- **`ref`** — the number the client quotes (`BERG-T0412`): the account's own short
  code, a `T`, and a sequence counted PER ACCOUNT. Null when there is nothing to
  build one from (the agency's own tickets carry no account; a client may have no
  code yet). Unique where present.
- **`rank`** — drag-rank, the ONLY priority signal the product has. A sparse text
  key (`shared/workers/rank.ts`), so a drag writes one row and two people
  dragging different rows cannot collide. The list reads `ORDER BY COALESCE(rank,
  id) DESC, id DESC`, which is also the keyset the page is cut on.
- **`locked_at`** — when we first read it. The account owns the wording until
  then (a client may edit and re-rank their own unread ticket, and only their
  own); the first staff touch closes it, and never moves again.
- **`draft_resolution`** — the unsent working text each story's closing note will
  append to. Never sent to a client login.
- **`archived_at` + archiver block** — put away, available from any state.
  Nothing is deleted; the row drops out of the everyday list and its count, and
  is still reachable by id and in the archive view.
- **`title_de` / `title_en`** — both titles, and neither derived from the other.
  788 of the tickets arriving from Glide exist only in German, so a translation
  SETS the empty one and never overwrites the original.

### ref_counters — BUILT (per-team, team migration `0011_ticket_work_engine`)
One row per (`account_id`, `kind`) holding `next_no`. The reference numbers SCOPE
ch.02 describes are sequential **per account**, and allocation is a SINGLE
statement — `INSERT … ON CONFLICT DO UPDATE … RETURNING` — so two people raising a
ticket on one account in the same second are serialized by the database instead of
both reading the same number (CONCURRENCY.md rule 1: the counter rides the write).
`kind` is the letter the reference wears: `T` ticket today, `S` story and `SPR`
sprint when those land.

### invite_logs — BUILT (per-team, team migration `0003_invite_logs`) + invite_index (GLOBAL, built)
`invite_logs` (full record in the team DB): audit + a FROZEN inviter snapshot
(`inviter_user_row_id`, `inviter_email`, `inviter_full_name`, `inviter_image`),
invitee (`invitee_user_row_id` if they have an account, `invitee_email`,
`proposed_member_role_id`), `created_on`, `shelf_life_in_hours` (default 168h =
the 7-day expiry), `invite_accepted`, `invite_acceptance_timestamp`. Its `id` =
`invite_index.invite_row_id`. Written on invite-create, stamped accepted on
accept (both best-effort — the global index is the routing truth, so a team-DB
hiccup never fails the invite/join). Surfaced on the invite detail (inviter +
acceptance) and as the `invite` activity scope. The GLOBAL `invite_index`
(already built) is the thin routing copy so onboarding can find invites by email
without opening every team DB.

### activity (Glide "All activity") — KEEP (table BUILT, per-team; feed + read path shipped). **Q3 RESOLVED.**
Purpose: the human-readable change feed. Glide referenced the subject row via
**one relation column per table** (`Invite logs/Teams/Member roles/Team members/
Data import sessions Row ID`). Brimba uses a generic `(related_table,
related_row_id)` pair instead → scales to any module without new columns.

**Indexes (team migration `0023_activity_feed_index`, scaling review 2026-08-14).**
This is the fastest-growing table in a team database by construction: R1 makes every
mutation publish and this feed records a row for each, so at the yardstick it is the
tens-of-millions one. It pages by keyset (R14) on `ORDER BY created_at DESC, id DESC`
— and from `0001` until now its only index led with `related_table`. So the RECORD
scope was indexed and the TEAM scope, the feed everybody opens, was not: every page
scanned and sorted the whole table to hand back fifty rows, and page two paid it
again. `idx_activity_feed (created_at DESC, id DESC)` serves the unfiltered page;
`idx_activity_table_feed (related_table, created_at DESC, id DESC)` serves R18's
`related_table IN (…)` page and lets the R16 `COUNT(*)` beside it read an index
rather than the widest table in the database. (`meetings` has carried exactly this
index for exactly this reason since `0021`.) The count is still O(rows-it-counts) —
that is R16's price, and it is named in `scaling-review.md`. Per the
Q3 resolution below — **log EVERYTHING** (creations, edits, activations/
deactivations, milestones), superseding the earlier "edits/deactivations only" —
the SAME rows are surfaced four ways by the read path
(`?scope=team|user|role|invite`).

### data_import_sessions — KEEP (BUILT 2026-06-23, team migration `0004_modules`) — the 3-stage import
Real data: audit + the target (`table_key`/display), the column schema, a
`reference_dataset_url`, an `overall_status`, and the three stages of the
file → mapping → confirm session (uploaded CSV text + auto-mapped columns +
preview + the write result). In Brimba the data-ops worker drives the 3 stages
(read → auto-map/validate → INSERT-ONLY write), writing **act-as-user** through
the target's gated create endpoint (so each import respects the caller's
permissions + the module's own validation). Gated by the target's `create`
right — import has no key of its own. **Export needs READ, import needs CREATE**
(the cross-cutting rule). A partial run is NOT a transaction: each row is an
independent gated create, and confirm returns per-row truth — `{created,
skipped, failed}` counts + up to five error messages — recorded on the session
(rows missing required values are skipped at preview; a failed row never blocks
the rest).

### accounts + account_links + portal_users — KEEP (BUILT 2026-08-09, team migration `0007_customer_spine`) — THE CUSTOMER SPINE
Purpose: every company and every person kwapso works with, in **one** table
(SCOPE ch.03 "People — one table"). There is no second people-table anywhere.

`accounts`: audit block + `account_type` (`entity` | `individual`, CHECKed),
`parent_account_id` (a **self-pointer**: a holding company's businesses, a
business's divisions — nesting is deep, but not unlimited; the two ceilings are
below), `name`, `email`, `phone`, `address`, `code`,
`currency`, `locale`, `timezone`, `commercials_visible`, `status` (the commercial
lifecycle: prospect → client → past client). **`code` is a REFERENCE, never an
identifier** — staff assign it when work starts (BERG), it is unique-when-present
(a partial unique index, so two people can't mint the same one at the same
instant) and nullable, and every route addresses a row by its ULID `id`. Re-coding
an account therefore re-points nothing. **The loop guard is the write itself**: a
move rides a recursive `WITH … UPDATE … WHERE NOT EXISTS (ancestors)`, so two
admins re-parenting at the same instant cannot co-operate their way into a ring
(CONCURRENCY rule 1); zero rows changed is the refusal, reported as a plain 409.

**The two ceilings on the tree, said out loud** (R14's premise is that every read
states its cap): the accounts table is the one self-nesting structure in the base,
so it is the one place a walk could run away with itself, and both walks stop.
**`MAX_ACCOUNT_DEPTH` (64, `shared/workers/limits.ts`)** bounds the loop guard's
climb when a record is re-parented: past 64 ancestors the walk can no longer PROVE
the move is ring-free, so it **refuses the move** — fails closed, never open. Far
deeper than any real org chart, and a refusal you would only ever meet by building
a chain nobody meant. **`SCOPE_HARD_CAP` (500, `shared/workers/account-scope.ts`)**
bounds the other direction: the reach walk that decides which accounts a client may
see stops at 500 rows. Past that the account set is wrong in the SAFE direction —
it stops early and grants LESS, never more. Both numbers are one-line changes, and
both are deliberately generous rather than tuned.

`account_links`: audit block + `account_id` (the company side),
`person_account_id` (the person's own account row), `relationship`,
`is_main_stakeholder`. This is what the parent pointer **cannot** say — Marta is a
contact of Bergman *and* of Delaval, and a single parent has room for one. A
partial unique index on the active pair is the duplicate race guard. "Contact" is
a role word, not a table: it is this row.

`portal_users`: audit block + `account_id`, `user_id` (the GLOBAL users row),
`app_restriction`, and `current_account_id` (added by `0008`, below). **The login
switch, and independent of linking**: an individual can be linked with no login, a
freelancer can hold a login on their own parentless account.

> **`app_restriction` is CARRIED, NOT ENFORCED — read this before you rely on it.**
> The column is written and read back honestly, and the guard corridor
> (`shared/workers/account-scope.ts`) puts it on the caller's stamp. Nothing acts
> on it. It is the per-person "only these named Apps" narrowing from SCOPE ch.03,
> and the Apps module that is the only thing able to honour it has not landed yet,
> so today a value in this column changes **nothing** about what a client can see:
> their fence is their account's world, whole. Treat a non-null value as a note of
> intent, never as a restriction in force — a field that looks like a security
> control and is not is worse than no field at all, which is why the guard
> corridor says so at the field itself and why it is said plainly here. The grant
> door accepts it (`POST` accounts → `appRestriction`) and the read hands it back;
> neither narrows anything. When the Apps module lands, enforcing it is the work. The audit block IS the grant
record (creator_* = who granted, deactivator_* = who revoked), so there is no
second `granted_by` column to keep in step. **Revoke deactivates, never deletes**
— login dies, every record stays — and a partial unique index on `user_id` where
active means at most ONE live grant per person, which is what pins a caller to
exactly one account set.

**How a login is handed out.** Staff never type an address: the grant door takes
a `personAccountId` (a contact of the account, or the account itself when it is a
person), reads THAT row's email through the fence, and matches it to the global
`users` row. Identity is resolved outside the fence, so the email it is resolved
by has to come from inside it — staff can only ever switch access on for people
already on their own books. The person must have signed in here at least once
(there is no client invite yet); both refusals name them and say what to do next.
`userId` is still accepted directly for a machine caller that already holds one.

**The guard corridor** (`shared/workers/account-scope.ts`) is the one place a
caller's account set is decided: session → person → account set, and every
account-scoped statement ANDs its clause into the WHERE (reads *and* writes — the
fence rides the statement, it is never a pre-check). Portal-ness is decided by the
PRESENCE of a portal_users row, never by its absence: a revoked row still makes
you a portal caller, pinned to the EMPTY set, rather than silently promoting a
former client to staff. Enforced by `workers/tenancy/test/account-leak.test.ts`,
which derives the account-scoped routes off disk and sends a burglar at each.

### portal_users.current_account_id — KEEP (BUILT 2026-08-10, team migration `0008_portal_current_account`) — where a client is standing

One column, and the whole account switcher stands on it. A client login belongs to
one company at a time and switches between them (owner decision, 10 Aug 2026 — the
same bargain the team switcher makes: you own the data, it simply isn't fetched
while you're standing somewhere else). `current_account_id` is that pointer and
nothing more: it **NARROWS** the fence to one of the companies the person already
belongs to, and it can never widen it — the guard corridor re-derives the roots
first and only then honours the pointer, so a value naming a company they have no
grant on is ignored, not obeyed.

`NULL` means "not chosen yet", which the corridor reads as their first company
(roots are id-ordered, so the fallback pick is the same on every request — a
switcher that moved you on refresh would be a bug you could not reproduce). That is
why the migration needs no backfill: every grant that existed before it keeps
working untouched.

**WITHOUT `0008` applied to a team's database, the account switcher breaks**: every
read of `portal_users` hits a missing column, so switching companies fails and a
person who acts for two of the agency's clients is stuck in whichever one comes
first. Roll it with `POST /api/tenancy/admin/migrate-teams` (x-admin-key) before
deploying the portal — same rule as every team-schema migration.

### data_import_batches — KEEP (BUILT 2026-07-04, team migration `0006_import_batches`) — agentic multi-file import
Purpose: the shell for an AGENTIC, multi-file import (AGENTIC-IMPORT.md). Groups the
uploaded files, the agent-built PLAN (targets, column mappings, normalizations,
references, dependency order) and the per-row REPORT — all JSON columns here; per-file
parsing reuses the single-target session engine. Real data: `id`, `overall_status`
(draft→analyzing→planned→running→complete), `files_json`, `plan_json`, `report_json`,
the audit block, `completed_at`. Creator-scoped (a batch belongs to who started it),
like `data_import_sessions`. Lives in the TEAM database (the data being imported is the
team's). Execution writes every row through the module's gated create endpoint
(act-as-user → audit parity); the plan step is metered on the AI credit pool.

### agent_threads + agent_messages — KEEP (BUILT 2026-06-23, team migration `0004_modules`) — the AI agent's saved conversations
The agent gets its OWN tables (not help's). `agent_threads`: audit + the thread
title/owner — one saved conversation per row, scoped to its creator (a private
conversation, the audit trail). `agent_messages`: audit + `thread_id` (the
parent thread) + the turn (role + content + any tool calls/results). Every agent
turn is persisted here, so the conversation is replayable and auditable. The
agent acts AS the signed-in user through the same gated endpoints the UI uses, so
these rows are a record of intent, never a separate set of powers.

### knowledge_sources + knowledge_chunks + knowledge_terms + knowledge_ingest — KEEP (BUILT 2026-08-11, team migrations `0012_knowledge` + `0020_knowledge_vectors` + `0022_knowledge_files`) — THE KNOWLEDGE BASE
One knowledge base, many **compartments**, chosen for the reader rather than by
them. Four tables, one per job:

- **`knowledge_sources`** — one row per piece of material the assistant may read.
  Three families in one table, because a person edits them in one list: a `note`
  somebody typed here (the body IS the truth), a `file` somebody uploaded (THE
  FILE is the truth and the body is a READING of it), and a MIRROR of a row we
  already own — `ticket` / `article` / `account` / `app` / `story` / `sprint` —
  where the row is the truth and the sweep keeps the body in step. `compartment` is the design in one
  column (`agency`, or `account:<id>`), DERIVED on write and correctable by hand,
  never free-typed. `owner_user_id` is the second fence: NULL = the team's, a
  value = one person's (what THEY can see, through their own connection).
  `content_hash` + `indexed_chunks` are what let the sweep skip a row that is
  both unchanged AND finished, before it costs a model call — the hash says WHICH
  text is being indexed and is stamped at the start of a rebuild, so a source
  whose text changed halfway through starts again rather than finishing a
  document that no longer exists. `summary` is what the record is ABOUT, derived
  from the row itself and never generated (knowledge-summary.ts says why in
  four reasons); it is what a LIST carries instead of the material, because a
  source can be a 300-page contract and a page of fifty of them would be tens of
  megabytes on the way to a screen showing titles. `app_id` / `ticket_id` /
  `sprint_id` / `record_date` are the rest of the notebook a question is routed
  by. `body_bytes` is how much material there really is, so a screen can say
  "the first part of 412 KB" rather than presenting an excerpt as the whole
  thing. `index_error` is why a source could not be indexed whole, in words —
  nothing here is ever silently trimmed. Deactivating means "stop reading this":
  the row survives, its chunks and its vectors do not, and the sweep will not put
  it back — and a row that leaves the app (an archived ticket, a switched-off
  app) deactivates itself the same way, because the readers now RETURN those rows
  marked `retired` rather than filtering them out, which is what stopped an
  archived ticket answering questions forever.
- **`knowledge_chunks`** — a readable piece of a source: what retrieval scores
  and what an answer cites. Its id is DERIVED (`<sourceId>:<seq>`, zero-padded),
  which is what lets a vector be overwritten or deleted without a lookup table
  and lets a source that got shorter lose only its tail. `embedding` is the
  quantised vector (1024 dimensions → ~1,368 characters); it is no longer what
  the search reads — Vectorize is — and it is kept for two jobs the index cannot
  do: rebuilding the index without paying to re-embed everything, and answering
  at all when no index is bound. NULL means "not embedded yet", which retrieval
  survives by falling back to the word index alone.
- **`knowledge_terms`** — the inverted index, as an ORDINARY indexed table rather
  than an FTS5 virtual one. Deliberate, and the reason is the DELETE: a re-index
  removes a source's postings, and on FTS5 that is a scan of every posting in the
  team, while here it is one keyed delete. It also behaves identically in the
  test harness and in D1, which a virtual table kept in step by triggers does not.
- **`knowledge_ingest`** — one row per source KIND: the cursor it reached, when it
  last ran, when it last SUCCEEDED, and what went wrong when it didn't (R12). The
  cursor is what makes ingestion resumable — a tick that dies halfway costs the
  next one nothing but the rows it has not reached.

**Where the search lives, and why the tenancy argument survived the move.** The
SEARCH is Cloudflare Vectorize — one account-wide index, with every team in its
own NAMESPACE and every chunk carrying the labels a question is routed by. The
original decision kept vectors here precisely because a per-team database makes
tenancy structural where "one index with a team id in the metadata" makes it a
filter somebody wrote correctly today. That objection is answered rather than
dropped, and both halves are Law R26: a namespace is a PARTITION Vectorize
applies before the search, not a filter; and nothing readable ever comes out of
the index — it is asked for ids and scores alone, and every passage in every
answer is read back out of THIS database, under the caller's own owner clause,
with excluded sources gone. The vector store narrows; the database decides. The
full argument, and what would change our mind, is at the top of
`workers/content/src/lib/knowledge-vectors.ts`; the numbers that forced the move
are in `.plans/BUILD-4-knowledge-retrieval.md`.

---
### apps + processes + process_versions + process_steps + process_comments — KEEP (BUILT 2026-08-11, team migration `0013_process_maps_and_money`) — THE PROCESS MAP

**App → Process → Step**, and the versions cut over them (SCOPE ch.02). An **App**
is the built system — the thing with its own address and its own stage; a client
wanting dispatch fixed, served by a driver app and a back-office screen, is TWO
rows. A **Process** is a way of working inside one. A **Step** is one part of it,
and it carries the two numbers every savings figure in the app is computed from:
how long it takes each time, and how often it happens.

**Version 1 is the pre-kwapso baseline** — how the work was done before we touched
anything — and it is written WITH the process, because a process with no baseline
can never produce a saving and would report zero for ever while looking healthy.
Later versions are cut automatically when a sprint completes (`cut_from_sprint_id`)
or from a button (null). The partial unique index on
`(process_id, cut_from_sprint_id)` is **R17 for a transition that is an INSERT**:
the predicate cannot ride a WHERE, so the database refuses a second cut for the
same sprint rather than a check a retry could slip past.

**`process_steps.step_key` is the identity that makes a saving a SUBTRACTION**
rather than a name match: the row id belongs to one version, the key is the same
step across all of them, and a cut copies it forward. A step that STOPS happening
is carried forward with its frequency intact and its time at zero (`removed_at`) —
deleting the row would drop it out of the baseline join and report no saving at
all for the work we removed entirely, which is the largest saving there is.

Every table carries `account_id`, denormalised on purpose: the fence is then the
same one clause the accounts list uses, with no join for the next reader to
forget. An app's account is written once at creation and there is no move-app
door — moving one would silently republish a whole map, its savings and its
conversation into somebody else's portal.

`process_comments` is the conversation on a map: one of the six things a contact
can do (SCOPE ch.06), and a conversation rather than an edit — it changes no
duration and cuts no version. A STAFF comment carrying `explains_step_key` is the
explanation attached to a step that got slower; the client's own screen shows the
regression either way (no filter hides one) and shows our explanation beside it.

### account_rates + internal_rates — KEEP (BUILT 2026-08-11, same migration) — THE TWO RATE CARDS

**Two tables, never one with a `kind` column, and that is the security control.**
One is what an ACCOUNT IS CHARGED per hour; the other is what an hour of OUR OWN
work COSTS US. They are the same shape — a label and a rate — which is exactly the
danger: one table would put both numbers a single forgotten predicate apart, and
the wrong one of them is the one figure SCOPE says a client must never see under
any flag, ever. A door that reads `account_rates` cannot return an internal rate,
because the internal rate is not in the table it named. The same split runs
through the code (`lib/rates.ts` vs `lib/internal-money.ts`) and is what **Law
R23** checks: no door the client portal opens can reach the internal file.

`internal_rates.is_default` (at most one, by partial unique index) is the rate a
margin applies to logged time whose kind of work is not yet named. Tool costs are
a COLUMN on the app (`tool_cost_cents_per_month`) rather than a table: what a
system costs us to keep running is one number about one system, and the margin is
the only thing that reads it.

---

### stories + sprints — KEEP (BUILT 2026-08-12, team migration `0014_stories_and_sprints`) — WHAT WE DO

A ticket is what an account ASKS FOR. A **story** is one piece of work WE do
about it, and it is **the only place an assignee and a due date live** — a ticket
deliberately has neither and derives its picture from its stories
(.plans/BUILD-1 §2).

- **Stories have no type.** The owner settled it: the ticket carries the type,
  and the process step carries the classification that matters. There is no
  column for one and no door that accepts one.
- **`ticket_id` is nullable.** Four out of five stories in the real history stand
  on their own, with no request behind them.
- **`step_key` + `changes_no_step` are a PAIR, and one of them is required before
  a story can be marked done.** Two columns rather than one nullable one, because
  "nobody filled this in" and "we looked, and it changes no step" are different
  answers and the savings maths has to be able to tell them apart. It is a step
  KEY rather than a step id: a key is the same step across every version of a
  map, and a story outlives the version it was written against.
- **`title` is not in SCOPE's field list** and was added anyway: a piece of work
  with no name cannot be read in a list, assigned, or said out loud on a call.

A **sprint** is the block of delivery work sold to one account. It carries
`sold_price_cents` — **whole cents**, which settled the one open contract between
this build and the money lane (`workers/tenancy/src/lib/work-engine.ts` used to
probe `sqlite_master` for which of two spellings had shipped). `completed_at` is
a MOMENT rather than a status word, because the version cut on the money side
keys off exactly that.

### work_logs + work_prefs — KEEP (BUILT 2026-08-12, team migration `0015_work_logs`) — THE ROW OF TIME

**A timer is a work log with no end yet.** There is no second table, no session
object and no state machine: starting is one insert, stopping is one update, and
the header asks "what am I running?" with one indexed read. That shape is what
pays for the owner's own acceptance bar — "logging time takes too many clicks"
was the single thing he named as most likely to make him abandon this.

- **It attaches to a story, a ticket or a task, and nothing else.** Never a to-do
  (that is the client's time, not ours) and never an account on its own (a figure
  with no work behind it is one nobody can check). The allow-list is
  `WORK_LOG_TARGETS` in `workers/content/src/lib/work-logs.ts` — **there is
  deliberately no CHECK constraint**, because a CHECK would be a second copy only
  SQLite can see, and in SQLite it cannot be altered without rebuilding the
  largest table here.
- **One partial unique index on (user, target) WHERE `ended_at IS NULL`.**
  Parallel timers on different work are a real day and are allowed; the same
  person on the same work twice is a double count nobody would spot in a total,
  so the database refuses it rather than a check a race slips past.
- **`discarded_at` is how a runaway timer is binned** without deleting anything.
  The row and the name of whoever binned it survive; every sum subtracts it.
- **`kind` is nullable on purpose** — a work log will eventually name its kind of
  work so the margin can group by it. Until then `lib/internal-money.ts` applies
  the default internal rate and says so on screen.

`work_prefs` is one row per person and today one column: whether starting a timer
stops the ones they already have running. **Off by default** — a setting that
silently stopped your other work would be discovered by losing an hour.

### todos + tasks — KEEP (BUILT 2026-08-12, team migration `0016_todos_and_tasks`) — THE OTHER TWO NOUNS

**Two tables, not one with a `kind` column**, and the reason is the one that split
the two rate cards: they are the same SHAPE and opposite AUDIENCES. A **to-do**
is aimed at the client and appears in their portal; a **task** is our own admin
and must never leave the building. One table with a flag would put both a
forgotten `WHERE` clause apart, and the wrong one of them is a list of the
agency's internal chores rendered on a customer's screen.

- `todos.account_id` is **NOT NULL** — a to-do with no client is aimed at nobody,
  and that column is what the fence reads. It is the ONE row in the work engine a
  client login writes to: they complete it and attach one file.
- Raising one **emails them**. It is one of only two things in the whole product
  that reach a customer's inbox (the other is a ticket resolution).
- `tasks.account_id` is nullable and usually null. **Work logs attach to a task**
  and never to a to-do — forty minutes on our own VAT return costs us what forty
  minutes of delivery costs us.

### triage_duty — KEEP (BUILT 2026-08-12, team migration `0017_triage_duty`) — WHOSE WEEK IT IS

A rota keyed by the **Monday**, with a unique index on the week. "One named
person is on triage duty, and it is visible whose week it is" (.plans/BUILD-1 §6)
has no answer if two rows claim a week, and a check in code is a check two
simultaneous writers race past. A row per week rather than a flag on a member,
because "whose week was it when this was missed?" has to survive.
### marketing_posts + brand_assets + programs + meeting_purposes + staff_profiles + staff_certificates — KEEP (BUILT 2026-08-12, team migration `0018_agency_internal`) — THE AGENCY'S OWN HOUSEKEEPING

Six tables, four permission modules, and the seven agency-internal tables of the
legacy Glide app finally landed. What they have in common is the whole of their
security story: **none of them carries an `account_id`**, because none of these
rows belongs to a customer. There is nothing here for the account fence to fence
— so the defence is at the door instead, and it is a REFUSAL rather than a
filter: every handler on all four modules opens with `refusePortalCaller`, and
`workers/content/test/agency-internal.test.ts` proves three things off disk (none
of the doors is on the portal gateway's surface, every one of them refuses, and
no file in `web-portal/` names these tables, paths or fields). That is the same
structural shape R24 uses for margin, applied to a different secret.

| Table | Module | From (Glide) | Rows | What it is |
|---|---|---|---|---|
| `marketing_posts` | `marketing` | `content` | 251 | What the agency published about itself — title, channel, status, body, link, and the DAY it went out. |
| `brand_assets` | `brand_assets` | `branding` | 74 | The material everything else is made with: logos, decks, templates. `file_url` holds either an object we host or a link elsewhere. |
| `programs` | `delivery` | `program` | 10 | How the agency runs an engagement. `sequence` is display order only. |
| `meeting_purposes` | `delivery` | `purposes` | 27 | Why the agency meets, and the department it belongs to. |
| `staff_profiles` | `staff_profiles` | `users` (six profile columns) | 6 | The person behind the member row: personality type, what they are best at, what they find hard, who they look up to, a photo. |
| `staff_certificates` | `staff_profiles` | `certificates` | 5 | A qualification somebody holds — issuer, granted, lapses, the paper itself. |

**Two of the seven legacy tables are deliberately NOT tables here.**
`departments` (8 rows) and `channels` (6) are bare labels with no fields of their
own, and the base already has exactly one home for a team's editable vocabulary:
`selectable_data`, which carries its own permissions, screen, import, export and
machine tools. They became the dropdown GROUPS "Department" and "Marketing
channel", pick-or-created the way a learning article's category always has been
(`workers/content/src/lib/vocabulary.ts`). A module built to hold a word is
ceremony. `purposes` is the one that could NOT go the same way, and the reason is
worth keeping: it carries a department, and a dropdown row is a single label with
nowhere to put a second fact — so the purpose is a record and the department is
the dropdown value, each fact stored the way its own shape asks.

**`staff_profiles` holds ONE live profile per person**, and holds it in the
database rather than in a handler: a partial unique index on `user_id WHERE
deactivated_at IS NULL`, so two tabs saving a colleague's profile at the same
instant settle into one row (CONCURRENCY rule 2). The write is a single upsert
door for both "there wasn't one" and "there was" — a person either has a profile
or they don't, and the screen filling in the form has no way of knowing which.

**Dates are days, and a value that is nearly a day is refused** (`optionalDate`,
`workers/content/src/lib/internal-fields.ts`): `2026-02-31` rolls over into March
in every naive parser, and an expiry that half parses is a certificate that
silently never lapses.

**The two ungrouped legacy sets.** Sixteen of the legacy app's 154 dropdown
values carried no group at all — ten country names, five company-size bands and
one stray hyphen. The owner ruled for two GROUPS rather than two fields on the
account, because a country typed free into an address is a country spelled five
ways by five people. Both are seeded in `DEFAULT_SELECTABLE` and backfilled for
existing teams by the same migration; the hyphen is not carried across.

### google_connections + google_sources — KEEP (BUILT 2026-08-12, team migration `0019_google_connections`) — ONE PERSON'S OWN GOOGLE

Two tables, and the shape of the first one is the whole product decision: a
connection hangs off a **user id**, never a team. Each person connects their own
Google account, one service at a time, and the assistant acting for them sees
exactly what they can see. There is no service account anywhere in this module
and deliberately nowhere to put one — "connect the agency's Drive once and let
everybody read it" is not a mistake somebody could make here, it is a column that
does not exist.

**`google_connections`** — `user_id` (the GLOBAL user id, plain TEXT with no
`REFERENCES`, exactly like `learning_progress.user_id` and
`staff_profiles.user_id`: the members live in the core database, so a foreign key
would name a table this one does not have), `service` (`drive` / `gmail` /
`calendar` / `chat`), `google_email` (which account, so a person with two can
tell them apart), `scopes` (**what Google actually granted**, not what we asked
for — somebody can untick a box, and a connection that quietly works for less
than it claims is how an assistant ends up saying "there is nothing in that
folder" about a folder full of things), the two token columns, `last_used_at`,
`last_error`, and the audit block.

- **The tokens are ciphertext in the column**, not merely at rest under
  Cloudflare's disk encryption. A refresh token is a standing key to somebody's
  mailbox that survives their password change, and this database is reachable by
  anything holding the account's D1 REST token — a backup, an export, a debug
  query. AES-GCM with a fresh IV per value, the key in a secret the database has
  no copy of (`GOOGLE_TOKEN_KEY`). A dump of this table without that secret is a
  table of email addresses. One file reads them back
  (`workers/content/src/lib/google-crypto.ts`), and no read a screen sees can
  select one — the public column list is the enforcement, and a test proves it.
- **`UNIQUE (user_id, service) WHERE deactivated_at IS NULL`** — one live
  connection per person per service, on the database rather than in a handler.
  Connecting is a browser round-trip a person can genuinely finish twice (two
  tabs, an impatient second click), and a read-then-write would make two rows
  holding two refresh tokens, one of which nothing would ever revoke
  (CONCURRENCY rule 2). Partial, so disconnecting and connecting again — the
  ordinary way somebody fixes a broken grant — is still allowed.

**`google_sources`** — the Drive FOLDERS and Chat SPACES one person named. Drive
is not "your Drive" and Chat is not "your Chat": both are reached only through
rows here, so the unnamed rest is out of reach by construction rather than by a
filter somebody has to remember to write. Gmail and Calendar have no rows here
because there is nothing to name — mail is narrowed to a **known contact** (an
address on one of the team's `accounts`) and the calendar is the person's own
diary.

- **`shelf`** (`private` / `team`) is the answer to the question the design round
  said we must answer at the moment of sharing: who will be able to read this?
  It is stored on the source rather than inferred later, because "I thought that
  folder was just mine" is the failure the column exists to prevent. It defaults
  to `private` — the safe answer is the one you get by not deciding — and it
  rides the activity sentence as well as the row, so "who could read this?" is
  answerable six months later.
- `user_id` is denormalised off the connection: every read here is "mine", and a
  join to answer the cheapest question in the module would be a join on every
  list.

**Permissions: three modules, because the owner named three switches.** `google`
(read what you shared · **create = connect an account** and name a folder or
space · edit = write back through it · delete = disconnect or stop sharing),
plus `google_mail` and `google_events`, which exist to carry ONE right each —
may kwapso send mail as you, and may it put an event in your calendar. Separate
from each other and from `agent`, so granting somebody the assistant does not
grant the assistant their outbox. A module whose four rights are not all
meaningful is not new here: nothing reads `agent:edit` either.

**Not importable** (three `CATALOG_EXEMPT` lines). A connection is a CAPABILITY,
not a record — the row is worthless without the token inside it, and that token
can only be minted by a person standing at Google's consent screen saying yes.
The two switch modules have no rows at all.

**No client-portal exposure, on any door.** Clients get no assistant and no
Google surface; every handler opens with `refusePortalCaller` and both tables are
`fence: null` in `PORTAL_ACTIVITY_FENCE`.

---

## Status: what's built vs. to build

- **Built**: users, teams, team_members, invite_index, member_roles,
  role_permissions, selectable_data, activity (table only), team_module_databases,
  db_alerts, db_growth (GLOBAL core `0022` — see below), login_codes (+ `sent_ip` / `sends`, 0015 — the send throttle's own
  ledger: WHO asked for each code and how many emails that row has caused, so a
  rotation is counted like a mint), sessions (+ `team_pin`, 0013), account_activity, email_change_logs +
  email_change_codes (the hashed-OTP split; BUILT 2026-06-17), invite_logs
  (per-team audit; BUILT 2026-06-22, M4). **Agent-modules build (BUILT
  2026-06-23)**: importable_databases, agent_usage, agent_credits, mcp_tokens (GLOBAL core
  0008/0009/0010); learning, learning_progress, help, help_threads,
  data_import_sessions, agent_threads, agent_messages (per-team `0004_modules`).
  **Knowledge base (BUILT 2026-08-11, retrieval rebuilt 2026-08-12)**:
  knowledge_sources, knowledge_chunks, knowledge_terms, knowledge_ingest
  (per-team `0012_knowledge` + `0020_knowledge_vectors`). The search itself lives
  in Vectorize — see R26 and BOOTSTRAP.md §3b.
  **Since:** agent_usage_log (GLOBAL core `0011`, BUILT 2026-07-01), error_logs
  (GLOBAL core `0012`, the central error store, BUILT 2026-07-03),
  data_import_batches (per-team `0006_import_batches`, the agentic multi-file
  import, BUILT 2026-07-04), the customer spine — accounts + account_links +
  portal_users (per-team `0007_customer_spine`, BUILT 2026-08-09) — and
  `portal_users.current_account_id` (per-team `0008_portal_current_account`,
  BUILT 2026-08-10; see below). **The work engine (BUILT 2026-08-11):**
  `help.account_id` (`0009_help_account`), the Tickets rename's data half
  (`0010_ticket_vocabulary`), and the ticket's work-engine columns + `ref_counters`
  (`0011_ticket_work_engine`).
- **The per-team migration list is `TEAM_MIGRATIONS` in
  `workers/tenancy/src/team-schema.ts`** — eleven today, `0001_team_base` through
  `0011_ticket_work_engine`. A new team's database runs all of them at
  creation; existing teams get the gap rolled to them by `POST
  /api/tenancy/admin/migrate-teams`. That file is the source; any list written
  down elsewhere (here, OPERATIONS, BOOTSTRAP) is a copy of it.
- **To build (tables)**: selectable_data_types (the only remaining one) — the
  global authoritative dropdown-GROUP list.

Open questions Q1–Q4 (audit scope, selectable types, activity design, role
defaults) were resolved before the foundation build; the "(later)" questions are
now resolved too — learning `Seen` became `learning_progress` (the user×learning
join), import details are the 3-stage `data_import_sessions`, and
`importable_databases` stayed SEPARATE from the recipe/config system (an
owner-maintained catalog).

---

## Resolutions (2026-06-13) — cross-cutting model LOCKED

- **Q1 Audit block → full block on every DATA table** (global core + per-team).
  Pure system/auth tables (sessions, login_codes) stay light — no meaningful
  actor. Actor name+email are point-in-time snapshots.
- **Q2 Dropdowns → global standard GROUPS + per-team VALUES.** The group list
  (file type, help type, help status, learning category, + any the base needs)
  is global + standard so code can rely on a group existing; values inside each
  group are per-team and editable, seeded with defaults. (`selectable_data_types`
  = global; `selectable_data` = per-team, as built.)
- **Q3 Activity → log EVERYTHING (Glide breadth): creations, edits,
  activations/deactivations, and system milestones** (member joined, invite
  sent/accepted, import stage done). Reference the subject row by a **generic
  `(related_table, related_row_id)` pair** — assumption: generic over Glide's
  one-column-per-table, because it scales to any future module without schema
  changes and matches our anti-bloat rule. (Supersedes the earlier
  "edits/deactivations only" rule.)
- **Q4 Roles → Admin locked + team always keeps ≥1 Admin; Viewer is a normal
  editable/deactivatable role.** EDGE — sole admin: the server REFUSES any change
  that would drop a team below one active Admin, and no one can remove or demote
  themselves, so a SOLE admin can't currently leave or be offboarded until they
  promote another member to Admin first. An explicit transfer-ownership /
  leave-team flow (and what becomes of a fully-empty team) is future work — not
  designed, not scheduled, and deliberately not written down as a plan anywhere
  else (this paragraph is the record of it; ROADMAP.md is a closed build history
  and never covered it). Until then the team simply never reaches zero admins. Role changes are direct, instant server
  actions — Glide's async "updated role id + webhook complete" two-step is
  dropped (it was a Glide limitation we don't have).

Resolved in the agent-modules build (2026-06-23): learning `Seen` shipped as the
`learning_progress` user×learning join; the import-session details shipped as
`data_import_sessions` (the 3-stage session); and `importable_databases` stayed
SEPARATE from the recipe/config system (the locked decision above).
