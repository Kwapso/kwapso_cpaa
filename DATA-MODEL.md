# Data model. Glide Base v3 → the Kwapso System (the mental model)

Every table and column from the user's Glide "Base v3" export (14 CSVs),
re-read 2026-06-13, mapped to the Kwapso System's design. Marks what we KEEP (real
persisted data), what we DROP (Glide UI/computed artifacts), our additions, and
OPEN questions. This is the canonical data-model reference. Keep it accurate.

## What's in here

Sixteen and a half thousand words (recounted 26 Aug 2026) is far too many to
scroll, so: the two tiers, in order.

**Preamble**, [Glide patterns that are NOT persisted data](#glide-patterns-that-are-not-persisted-data-dropped-everywhere) · [The audit block](#the-audit-block-standard-every-table)

**GLOBAL core** (`kwapso-core`, reached by `env.DB`), identity and billing across teams:
`users` · `teams` · `team_members` · `email_change_logs` · `account_activity` ·
`importable_databases` · `agent_usage` · `agent_credits` · `agent_usage_log` ·
`mcp_tokens` · `error_logs` · the sharding machinery, `team_module_databases` +
`team_module_moves` + `db_alerts` + `db_growth` (where a module lives, the mover's
resumable ledger, and the size + rate watch) ·
`selectable_data_types` (the one still to build) ·
*Retention in core*, the only place rows are really deleted.

**[PER-TEAM](#per-team-each-lives-in-that-teams-own-database)** (one D1 database per team, reached over the REST door), everything a team owns:

| Subsystem | Tables |
|---|---|
| Permissions + vocabulary | `member_roles` + `role_permissions` · `selectable_data` |
| Content | `help` + `help_threads` (**Tickets**) · `help_stakeholders` · `ref_counters` |
| History + invites | `activity` · `invite_logs` |
| Import | `data_import_sessions` · `data_import_batches` |
| The assistant | `agent_threads` + `agent_messages` |
| The customer spine | `accounts` + `account_links` + `portal_users` (+ `current_account_id`) |
| The knowledge base | `knowledge_sources` + `_chunks` + `_terms` + `_ingest` (+ Vectorize) |
| Process maps + the money | `apps` (+ `app_staff` + `app_stakeholders` + `app_modules`) + `processes` + `process_versions` + `process_steps` (+ `process_step_tools` + `process_step_revisions`) + `process_comments` · `process_links` · `process_drafts` · `account_rates` + `internal_rates` + `internal_role_rates` |
| The client's own organisation | `client_departments` · `client_roles` (+ `client_role_departments` + `client_role_people`) · `client_tools` + `client_tool_prices` |
| What we hand over | `deliverables` |
| The work engine | `stories` (+ `story_attachments` + `story_processes`) + `sprints` · `waves` · `work_logs` + `work_prefs` · `todos` + `tasks` · `triage_duty` · `meetings` |
| The agency's own housekeeping | `brand_assets` · `meeting_purposes` · `staff_profiles` · `staff_certificates` |
| One person's own Google | `google_connections` + `google_sources` · `chat_people` |

**Closing**, [Status: what's built vs. to build](#status-whats-built-vs-to-build) · *Resolutions (2026-06-13), cross-cutting model LOCKED*

## Glide patterns that are NOT persisted data (dropped everywhere)

Glide columns are a mix of stored data and live "computed columns." These
recur across tables and are **not** real columns in our databases, they are
done at runtime, in the UI, or by an action:

- **Transformers / builders**: `Email transformer/*`, `*/Request body JSON
  object(/string)`, `*/New team JSON object(/string)`, `Onboarding JSON
  object(/string)`, `Accept pending invites JSON(/string)`, `Summary/JSON
  object string`, these built strings/JSON for Glide webhooks. Our workers
  build any payload in code.
- **UI/navigation state**: `*/Detail screen tab view`, `Home/Tab view`,
  `Edit screen/Type`, `Edit screen/Screen title`, `Identity/Current screen
  link`, `App information/*`, `*/Play link`, `Shortcuts/Total count`,
  `Device/Screen size`. This is per-session view state, it belongs to the
  screen engine's runtime state, never the database.
- **Clocks**: `Time/Now`, `Time/Now + 11 minutes`. Glide had no server clock;
  we use real timestamps in workers.
- **Derived values**: `Identity/Full name` (first+last), `Onboarding/Completion
  percentage`, `Profile is filled`, `Is complete`, `*/Is valid email`,
  `Change is available`, `Invite member is possible`, counts, all computed on
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

## GLOBAL core (the card catalog, `kwapso-core`)

### users . KEEP (built)
Real data: `id`, `email`, `image_url`, `first_name`, `last_name`,
`onboarding_completed_at`, `current_team_id`. Glide `Row owners/Team keys
string` (the teams a user belongs to) = our **team_members** table.
Dropped: all transformer/onboarding-JSON/tab-view/device columns.
**No-name fallback (2026-06-21):** members can exist pre-onboarding, so
`first_name`/`last_name` may both be empty, display the `email` as the name in
that case; with no `image_url`, show initials (or a placeholder avatar when even
initials aren't derivable).

### teams. KEEP (built)
Real data: `id`, `name` (`Identity/Team name`), `logo_url`. The Kwapso System adds
`database_id`, `db_status`, `schema_version` (the per-team-DB architecture).

### team_members. KEEP (built, GLOBAL)
Real data: `team_id` (`Row owners/Team key`), `user_id`, `role_id`
(`Member roles/Member role ID`). Glide's `Change member role/Updated member
role ID` + `webhook complete` were async-webhook scaffolding, **dropped**;
role change is a direct server action. Membership is global (answers "which
teams am I in?" before we open any team DB).

### email_change_logs. KEEP (BUILT 2026-06-17, GLOBAL, no team key in the export; `db/core/0005_email_change.sql`)
Purpose: change a user's email safely. Real data: audit block + `current_email`,
`new_email`, `expires_at`, `verification_code` (numeric OTP to the NEW email),
`user_input_code`, `email_change_successful`, `email_change_timestamp`. Flow:
request → OTP to new email → match → swap on the user row.
**UPDATED 2026-06-21:** shipped in Phase 2 (`db/core/0005_email_change.sql`).
The login/email-change codes were **split out into a separate hashed
`email_change_codes` table** (the OTP is stored hashed, not in clear on the log
row); `email_change_logs` remains the human-readable security record (old/new
email, outcome, timestamps). The old address is warned on change.

### account_activity. KEEP (BUILT 2026-06-18, GLOBAL, `db/core/0007`)
Purpose: the person's OWN identity history, shown in Settings → Account. NOT
team-tied (per-team `activity` lives in each team DB; identity events belong to
the user across all teams). Real data: `id`, `user_id`, `type`
(`name_changed`/`photo_changed`/`email_changed`), `description` (human
sentence), `created_at`. No actor-snapshot block, the actor is always the user
themselves. Written best-effort by the auth worker on profile/email change
(`workers/auth/src/lib/account-activity.ts`); read via `GET /api/auth/activity`;
rendered with the library `ActivityFeed`. `email_change_logs` is kept alongside
it as the security record (old/new email).

**THE OTHER HALF OF A PERSON'S HISTORY** is the per-team `activity` table, and
the split is by DATABASE BOUNDARY rather than by feature — see *activity* below
for the two-read recipe that puts them back together, and why nothing joins them
server-side.

### importable_databases. KEEP (BUILT 2026-06-23, GLOBAL reference, `db/core/0008`)
Purpose: the owner-maintained catalog for the data-import feature, which target
tables can be imported into. Real data: `id`, `table_key` (the target the import
writes into, unique), `display_name`, `description`, `required_columns_json` (the
schema the agent maps an uploaded file onto), `auto_populate_columns_json`
(columns the import may fill itself, e.g. creator + team key),
`reference_dataset_url` (both **unused today**, the code's `TARGETS` is the
truth), `is_active`, + the audit block (creator/editor). Shared across all teams,
so it lives in the global core DB. **The catalogue SELF-HEALS against the code on
read (LAW R13):** `reconcileCatalog` (`lib/import.ts`) INSERT-only upserts a row
for every code `TargetDef` (`ON CONFLICT DO NOTHING`), so a fresh environment's
picker is never empty and a target the owner deliberately switched OFF (its row
exists, `is_active=0`) stays off, the picker filters `is_active` **in memory**,
never in SQL, or "switched off" and "never existed" would look identical. The
by-key door heals on a miss only (the per-import path pays nothing). The owner
seed door (`POST /api/data-ops/admin/seed-targets`, x-admin-key) now only refreshes
LABELS (display name / description / schema) and never re-activates a switched-off
target, it is no longer a step anyone must remember. Seven targets are wired
today: `selectable_data` (Dropdown values), `member_roles`, `accounts`,
`meetings`, `stories`, `brand_assets` and `meeting_purposes`
(`team_members`/`help`/`teams`/`screens`/`agent` and the rest are pinned
non-importable in `CATALOG_EXEMPT`, each with its reason); the agentic multi-file
importer (AGENTIC-IMPORT.md) orders them by their declared references.

### agent_usage. KEEP (BUILT 2026-06-23, GLOBAL, `db/core/0009`)
Purpose: the per-team **free** half of the AI agent quota. Real data: `team_id`,
`period` (the metering window, a `'YYYY-MM-DD'` day, the free counter resets
daily), `used` (AI units consumed this window), `updated_at`. One unit = one
model call, metered before EACH call inside a turn (a multi-step turn costs one
unit per step, capped by `MAX_STEPS`; declining a confirm costs nothing; running
dry mid-plan stops the turn with a saved, plain reply). **A unit is spent the
moment the model answers**, so exactly one thing is refundable: the unit metered
for a step whose model call THREW, which bought no completion at all
(`refundUnspentUnit`, and only from the paid pool, the free allowance is the
daily BOUND on how much model spend a team can cause, and a refund dissolves the
bound). A REFUSED ACTION IS NOT REFUNDED: it used to be, and that made the credit
lane the unbounded one, asking to invite someone already on the team fails on
demand, every time, burning real tokens and handing the credit straight back, so
the same turn could run forever for nothing. Once a team is over the app's own daily allowance (`AGENT_FREE_DAILY`:
code default **25/day**, but both environments ship **50**), the gate spends from
the credit balance instead. Lives in
the global core DB so the gate can check it without opening a team database.

### agent_credits. KEEP (BUILT 2026-06-23, GLOBAL, `db/core/0010`)
Purpose: the **purchasable** half of the AI agent quota (the owner's credit-based
model). Real data: `team_id`, `balance` (AI credits remaining, never negative),
`lifetime_granted` (total ever granted, for the admin view), `updated_at`. Once a
team's free daily allowance is used up it spends from this balance; when both are
empty the agent is blocked. Top-ups are an owner action today
(`POST /api/data-ops/admin/grant-credits`, x-admin-key); real payments wire in
later against this same balance (the grant action is the seam). Lives in the
global core DB so the gate can spend a unit without opening a team database.

### agent_usage_log. KEEP (BUILT 2026-07-01, GLOBAL, `db/core/0011`)
Purpose: the usage TRAIL behind the panel's "where did my credits go" view.
Real data: `id`, `team_id`, `actor_id`, `actor_name`, `created_at`, `credits`
(units this command consumed), `source` (`free` / `credit` / `mixed`), `summary`,
**`kind`** (`db/core/0014`: `'action'` | `'prompt'` | NULL), and the **four token
columns** (`db/core/0027`): `input_tokens`, `output_tokens`, `cache_write_tokens`,
`cache_read_tokens` — the provider's own `usage` block recorded per command, because
`credits` counts REQUESTS and two one-unit turns can differ tenfold in tokens, so
"what did this month cost" is a query rather than an estimate, and the prompt-cache
hit rate (`cache_read ÷ (cache_read + cache_write + input)`) can only be written
down while the turn is happening. All four NULLABLE on purpose: a row from before
the migration was never measured, and a back-filled 0 would read as "measured, and
it cost nothing". **Visibility rides
`kind` (C3, the log tells the TEAM where its credits went):** an `action` row's
summary is TEAM-VISIBLE (the team is entitled to see what was done in its name); a
`prompt` row's summary is the author's OWN (a teammate sees who spent how much and
when, never the question typed); a back-filled NULL row stays private (it can't be
classified after the fact, and a wrong guess publishes somebody's question). The
old "only my own rows" rule showed an admin four blank rows with a teammate's name
on them, withholding the one thing the team is owed. The summary is titled by the
**WRITE action(s) the assistant took** (e.g. `Create the role
"Test" · Invite alaap@… as Test`, with `(failed)` on a refused call), falling
back to the user's prompt for a plain question OR a read-only turn. A READ isn't
an action the user "did", so it never titles the row, a clarifying reply reads as
the question, not "List roles" (the credit-log-clarity feedback). A role-choice
reply like "anything" still leads to a write (the invite), so that write titles
the row; only a turn that makes no change is titled by the prompt. **One row per
user COMMAND**,
written best-effort (a
log hiccup never fails the turn). A command that pauses for a yes/no confirm runs
as two turns (propose + confirm); the confirm turn FOLDS its units into the
propose row (`credits.ts` `foldUsageIntoLatest`) rather than adding a second
row, so the history stays one entry per command and reconciles exactly with the
balance drop (fixed 2026-07-10: a confirmed command used to split into a row +
a cryptic "(continued)" row). The fold **APPENDS** its actions to the row's title,
never replaces, one command can pause for confirmation more than once, and
replacing left a 10-credit turn titled by its last step alone. Read newest-first, team-scoped, via
`GET /api/data-ops/agent/usage-log`. Lives in the global core DB beside the
quota tables it explains.

### mcp_tokens. KEEP (BUILT 2026-07-07, GLOBAL, `db/core/0013`)

Personal access tokens for the MCP front desk: `id, user_id, team_id, label,
token_hash (sha256; the secret is shown ONCE and never stored), created_at,
**`expires_at`** (`db/core/0016`, every token has a deadline,
`MCP_TOKEN_TTL_DAYS` = 90; a MISSING one counts as expired, so nothing is
immortal), `last_used_at`, `revoked_at` (deactivate-not-delete). An account may
hold **10 live tokens** (`MAX_ACTIVE_MCP_TOKENS_PER_USER`, enforced inside the
INSERT), and the settings list sorts unrevoked rows first, together that is what
keeps every usable token inside the 1,000-row list cap and therefore revocable
from the app. Verified on EVERY /mcp request. The same migration adds **`sessions.team_pin`**, a session minted for
a token is PINNED to the token's team (auth answers /me with the pinned team;
short-lived, never slid), so a token can never act outside the team it was
created for.

### error_logs. KEEP (BUILT 2026-07-03, GLOBAL, `db/core/0012`)
Purpose: the central error store (ERROR-HANDLING.md), one row per UNEXPECTED
failure (worker crash or client-side error), never a clean GuardError refusal.
Real data: `id`, `at`, `source`, `place`, `message`, `stack` (capped), optional
`team_id`/`user_id`/`url`, and the resolve workflow (`status` open→resolved,
`resolved_at`, `resolution_note`). Owner-only doors (x-admin-key):
`GET /api/data-ops/admin/errors` + `POST /api/data-ops/admin/errors/resolve`.
Lives in the global core DB, system health is cross-team; each environment has
its own core DB so staging/production histories never mix.

### selectable_data_types. KEEP (TO BUILD). Q2 RESOLVED (see Resolutions:
global standard GROUPS + per-team VALUES)
Glide: 3 rows (`File type`, `Learning category`, `Help type`), no team key, no
audit → a tiny GLOBAL reference of dropdown GROUPS. But the values table also
uses `Help status` (not listed as a type) and `Learning category` has no
values. (We seed the two `Help` ones as **`Ticket type`** and **`Ticket
status`**, the module is called Tickets, and team migration
`0010_ticket_vocabulary` relabelled the rows every existing team already had.
`Learning category` has no successor at all: it named a module that was purged on
17 Aug 2026, and it arrived with no values to carry across.) So the types list
and the values were loosely coupled in Glide.

### Retention in core, the ONE place rows are actually deleted

"Deactivate, never delete" is a rule about **records**: a person, a role, an
account, a ticket. It has never been a rule about **spent sign-in artefacts**,
and treating it as one is how the shared database grew with no ceiling and no
sweep.

Three tables in core are written by callers who are not signed in, anyone who
types an email address mints a `login_codes` row and a `login_sends` row, so
their totals were bounded by nothing at all, in the one database whose 10GB cap
takes the whole product down rather than one tenant. A nightly sweep
(`shared/workers/retention.ts`, run from tenancy's cron beside the size alarms)
takes:

| table | what goes | why it is safe |
| --- | --- | --- |
| `login_codes` | older than `AUTH_RETENTION_HOURS` (24h) | a code lives ten minutes; the per-address cap looks back one hour |
| `login_sends` | older than `AUTH_RETENTION_HOURS` | the send budget's whole window is one hour |
| `sessions` | already past their own `expires_at` | that cookie is already dead, every read re-checks expiry |
| `error_logs` | older than `ERROR_LOG_RETENTION_DAYS` (90) | diagnostics, not a record, and 90 days is the window `db/core/0012` has claimed since the table was created |

Sessions are judged by **expiry, not age**: `expires_at` slides forward while a
session is in use, so an age-based sweep would sign out every long-lived user.

Nothing anyone might have to answer for is touched: activity, account activity,
`agent_usage_log`, invite audits and every audit block stay. `error_logs` is the
one that moved, and only because it was already documented as a 90-day history
with nothing enforcing it, a rate ceiling (`db/core/0019`) bounds how fast a
store fills, never how full it gets. **A retention window for `account_activity`
or the usage ledgers is an owner's decision, not an index's**, and it is still
open (scaling review 2026-08-14).

**A statement is bounded; a NIGHT is bounded separately** (scaling review
2026-08-14). Each delete takes at most `RETENTION_DELETE_CAP` rows, that is the
cap on what can time out, and the tick runs that statement up to
`RETENTION_PASSES_PER_TICK` (40) times per table, stopping the moment one comes
back short. Only the first of those existed, and the difference was the finding:
5,000 rows a night against a shared database taking sign-ins from every tenant is
not retention, and at the yardstick (a quarter of a million people in one tenant,
plus everyone else) the tables grew monotonically while a green nightly job
reported success. 40 × 5,000 = 200,000 rows per table per night, no statement any
larger than the one that already worked. A run that hits the PASS ceiling is
recorded to `error_logs`, not merely logged (R12).

### db_growth. KEEP (BUILT 2026-08-14, GLOBAL, `db/core/0022`). HOW LONG HAVE I GOT
Purpose: the half of the growth watch the size alarm never had. `db_alerts` says a
database has crossed 80% of D1's 10 GB cap, and 80% is a POSITION, not a warning,
two databases at 8.1 GB raise the identical alarm and are in completely different
trouble, one having sat there a year and the other having crossed 6 GB last week.
The mover takes a while and needs a person, so the question that follows every alarm
is "how long have I got", and nothing recorded the two readings a rate needs.

**One row per database, not one per night.** A sample table is the obvious shape and
the wrong one: an estate near the platform's 50,000-database limit would add 50,000
rows a night to the very database this mechanism keeps small, a growth watch that is
itself the growth. Each row holds tonight's `size_bytes`/`at` and the previous
reading (`prev_size_bytes`/`prev_at`), and the nightly upsert shifts current into
previous **inside one statement** (`excluded` vs the bare columns), so there is no
read-then-write pair to race.

**The interval is stored, not assumed.** A rate computed against a presumed 24 hours
is quietly wrong exactly when the cron has been late, skipped or re-fired, which is
when you are most likely reading it. `daysUntilFull()` (one exported function, beside
the rows it reads) is headroom-from-the-CAP ÷ (Δsize ÷ Δtime), and it returns **null**
rather than a number whenever it cannot answer honestly: one reading only, no elapsed
time, or a database that held still or shrank. "Not growing" and "growing slowly" are
different answers and only one of them is a number.

Bounded at `CRON_GROWTH_CAP` (200) readings a night, taking the LARGEST databases,
a trend only matters where there is a ceiling to reach. Written on quiet nights too
(a trend you start measuring at 80% is a trend you measured too late), and wrapped so
a failed reading can never cost somebody the alarm that a database is nearly full.
Read through the owner-gated `GET /api/tenancy/admin/db-sizes` as `filling`, soonest
first. Locked by `workers/tenancy/test/db-growth.test.ts`.

**Every sweep predicate has an index behind it** (`db/core/0015`, `0017`, `0021`).
`sessions` did not: the only index on it led with `user_id`, so the sweep meant to
keep the shared database under D1's 10 GB cap was full-scanning the largest table in
it, every night, to find 5,000 rows, a sweep whose predicate scans is the timeout
this whole mechanism exists to avoid, wearing a `LIMIT`.

The other half of the same problem is RATE, and a sweep does not solve it: every
repeatable core write now carries a per-caller ceiling that rides its INSERT
(`ACCOUNT_ACTIVITY_PER_HOUR`, the login-send budget). And the nightly size alarm
watches **every** database in the account, core included, it used to filter
`team-*`, so `kwapso-core` could never raise one.

### team_module_databases + team_module_moves. KEEP (BUILT: routing `db/core/0004`, the resumable ledger `db/core/0023`). WHERE A MODULE LIVES, AND HOW IT GETS THERE
*(Sections added 26 Aug 2026 — both tables predate them, and "the canonical
data-model reference" was carrying two core tables it never named.)*

**`team_module_databases`** (`0004_sharding`) is the routing override: by default a
team's data lives in its one database (`teams.database_id`), and when a module gets
heavy the mover relocates that module's tables to a dedicated database and records
it here — `team_id`, `module`, `database_id`, `created_at`, `UNIQUE (team_id,
module)`. The data door consults this table to know where a (team, module) lives,
which is why the mover flips it LAST: no row, no re-routing, no doubled read.
`0004` also creates `db_alerts`, the 80%-of-10-GB size alarms `db_growth` above
turns into a rate.

**`team_module_moves`** (`0023_module_moves`) is what makes a killed move a
CONTINUATION rather than an orphaned second database (ARCHITECTURE §7 marks the
mover **RESUMED 2026-08-17** on the strength of it). One row per (team, module)
move: the `database_id` created for it (written BEFORE the first byte is copied, so
a retry reuses it — the field whose absence caused the orphan), `source_database_id`,
`tables_json` (the set the caller named, so a resume moves the SAME set), `status`
(`copying` → `copied` → `routed` → `drained` → `done`, named after what has ALREADY
happened), `cursors_json` (per-table last-id-copied — a cursor, not a row count,
because the copy walks by key and can stop at any moment), `verified_json` ("the
counts agreed" is a separate fact from "I reached the last row", and only it
licenses a drain), `drained_json`, `rows_copied`, `claimed_at` (the claim IS the
lock: an UPDATE with the current status in its WHERE, zero rows changed means
somebody else has it), `last_error`, and the audit timestamps. A partial unique
index (`status <> 'done'`) holds ONE live move per (team, module) — two rows would
mean two databases and a merged read counting everything twice.

---

## PER-TEAM (each lives in that team's own database)

Everything below this line is **per-team**: it lives in that team's own D1
database, reached over the REST door, and another team's rows are never in the
same file. Everything above it is GLOBAL core. That two-tier split is the thing
this document is organised around, and every other document defers to this one
for "which tier does this table live in" — so if you are scanning the outline,
this heading is the boundary.

*(The heading was lost on 2026-08-26 in commit `a9694fbe`, which inserted the
`team_module_databases` section over the top of it and left the index's link to
it pointing at nothing. Restored; the anchor
`#per-team-each-lives-in-that-teams-own-database` resolves again.)*

### member_roles + role_permissions. KEEP (built; we split Glide's WIDE → TALL)
Glide `Member roles` was WIDE: `Identity/Title`, `Description`, `Is default`,
then **24 boolean columns** = 6 modules × {read,create,edit,delete}. Modules:
**Teams, Team members, Member roles, Learning, Help, Selectable data**, the six
our `TEAM_MODULES` (`shared/team-modules.ts`) STARTED as. Five of them are still
there unchanged (the module a person now reads as **Tickets** is still keyed
`help`, because that string sits in every role's permission sheet); `learning`
was retired on 17 Aug 2026 with the module it named, which is the tall sheet
working as designed, a module leaves by dropping rows, and no other role's
permissions moved. The list has grown well past those six since, the customer
spine, the knowledge base, the work engine, the agency's own housekeeping and the
three Google switches all added rows, never columns, which is the whole point of
the tall sheet. Read the list in that file. We store the 24 booleans as a TALL `role_permissions` sheet
(role × module × 4 bits) so a new module = new rows, not new columns. `is_default`
flags the seeded Admin (locked) + Viewer. Roles are **edit-live + deactivate-only,
never delete** (holders keep the role). Q4 RESOLVED (see Resolutions): Admin
locked; Viewer is a normal editable role.

### selectable_data. KEEP (built, per-team)
Real data: audit block + `type`, `value`, `is_default`. Per-team dropdown
values, seeded from Base v3 defaults on team creation.

**Four optional columns of enrichment (team migration `0025`).** `mark`,
`name_de`, `description` and `standard_days`, every one nullable, and empty on
almost every group. They arrived when the Delivery method page was retired on
17 Aug 2026: a programme was never anything but "the kind of block this sprint
is", which is the question the **sprint type** already answers, so the two were
one idea wearing two names. What the ten programmes carried and the sprint type
did not is now carried by the sprint type itself, the `mark` somebody
recognises it by, the German `name_de` the agency already uses with its German
clients, the `description` that says what the block includes, and
`standard_days`, how long one normally runs. That is what lets a sprint read
"Implementation, 21 days".

They sit **on `selectable_data` rather than on a sprint-type table**, because a
sprint type is a dropdown value and a table for it would be a second vocabulary
seam beside the one that already exists. Three of the four are meaningful well
beyond sprint types: a mark is what a type mark renders, a description is what a
picker's hint line shows, and a curated foreign label is what an agency writes
once for a client who reads another language. `standard_days` is the only narrow
one, and it is a number nobody else has to look at. The starting values live in
`SPRINT_TYPE_CATALOGUE` (`workers/tenancy/src/team-schema.ts`), a starting
vocabulary like the ticket types, editable on the team's own Dropdown values
screen, and both the seed and the migration are pick-or-create, so a team that
already has "Implementation" keeps its own row, its own id and its own history
and simply gains the enrichment. `standard_days` is a suggestion, never a rule:
a sprint's real dates are the ones somebody agreed with the client. `name_de` is
the ONE curated label carried over from the legacy catalogue, because those
words were already in front of German clients; every other language comes from
the translation layer, which is why there is no third label column.

**Duplicates retired, never deleted (team migration `0026`).** `createTeam`
applies every migration and THEN runs the seed. Several migrations back-fill a
default vocabulary into existing teams and guard themselves with `WHERE NOT
EXISTS`, because they have to be safe against a team that already has the value.
The seed did not, because when it was written it ran into an empty table, so a
team born before the seed was guarded got 26 of those values twice, and every
picker offered each word twice. The seed is guarded now; `0026` is the other
half, for the teams that already were. A dropdown value is referenced by its
STRING everywhere in this app (a ticket's `help_type` holds the word
"Question", not a row id), so two live rows reading the same (type, value) are
indistinguishable to every reference in the database and there is no count to
compare, the OLDEST row survives, ties broken by id, which is the row every
earlier reference was looking at anyway. The losers are **deactivated, never
deleted**: each keeps its id, its audit block and its history, shows greyed on
the Dropdown values screen with an Activate button, and says `System` as its
deactivator. Running it twice is a no-op.

### help + help_threads. KEEP (BUILT 2026-06-23, team migration `0004_modules`, two-tier)

**This is the Tickets module.** There is no help section and there is no second
ticket module, one thing, wearing the name it was born with underneath. What a
person or a URL sees says **Tickets**: the sidebar, the heading, the breadcrumb,
the address (`/tickets`, `/t/<teamId>/tickets/<id>`, and `/tickets` in the
portal), the dropdown vocabulary (`Ticket type`, `Ticket status`) and the
glossary. It is not a place to report bugs about the app itself, a ticket is
something an account asked us for.

**Four things stay `help`, deliberately.** Each is data already written down or a
contract already published, so renaming it can only take something away:

| Still `help` | Why it stays |
|---|---|
| the permission module key (`help:read/create/edit/delete`) | it is the string sitting in `role_permissions` in every team database, renaming it takes somebody's access away |
| the tables `help` + `help_threads`, and `activity.related_table = 'help'` | renaming orphans every history row already written about a ticket |
| the API paths `/api/content/help*` | they are `PORTAL_DOORS` entries, `PORTAL_VISIBLE_READS/WRITES` keys and R21's derivation input |
| the MCP tool names (`list_help_tickets`, `create_help_ticket`, …) | a published external contract, outside developers call these by name |

The rule, in one line: **what a person or a URL sees says tickets; what the
database and the wire say stays `help`.** The two names meet in exactly one seam,
`MODULE_PERMISSION` in `web/lib/screens.ts` (`tickets: "help"`), and
`web/test/nav.test.ts` fails if it is removed. Do not "finish the rename".

`help` (parent ticket): audit + `help_type` (selectable), `description`,
`screen_recording_link`, the source screen/record capture, `status` on a FIXED
lifecycle, `resolved`, `resolved_on`, `resolver_id/email/name`.
`help_threads` (messages): audit + `help_id` (the parent ticket),
`tagged_team_member_user_ids` (@mention → email notify), `message_body`. A ticket
with a threaded conversation. (Ticket attachments to R2 `kwapso-help-media`, the
bucket name follows the table, are a deferred hook, see AGENT-MODULES-PLAN.)

**The work engine's ticket** (team migration `0011_ticket_work_engine`, BUILT
2026-08-11. SCOPE ch.07). The same table, grown into the thing the scope
describes; there is no second ticket beside it, and there never will be.

- **The seven states.** `status` runs `awaiting_validation` → `new` → `triaged`
  → `scheduled` → `in_progress` → `ready` → `resolved`. This line said FIVE for a
  year after two of them shipped, which is the quiet way a document goes wrong:
  nothing broke, and anybody reading it built on a state machine the code had
  already left behind. `awaiting_validation` is the client's main stakeholder not
  having said yes yet (Aurora's ruling: extras, requests and feedback wait;
  questions and issues go straight in). `scheduled` is stories existing AND at
  least one of them booked into a sprint — both halves in one read, because
  either alone is a different and wrong sentence — flipped by itself in
  `lib/ready-flip` `scheduledFlip`. **SCOPE ch.07 still shows five and calls
  "planned for sprint 4" a note rather than a state; the code and CHECKLIST 5.3
  are the current answer, and the figure there is the older one.**
- **`new` IS THE PRE-TRIAGE STATE** (owner, 19 Aug 2026). A ticket does not leave
  it until it names a ticket type, a client, an app and who raised it. One rule,
  `shared/triage-readiness.ts`, refused by `markTriaged` (so the agent and MCP
  obey it too) and reported field-by-field on the triage row. No `draft` status
  was added: `new` already meant "raised, nobody has read it", which is the same
  sentence, and what was missing was never the state but the REASON.
- The two old names moved onto the two that mean the same thing: `open` → `new`,
  `reopened` → `triaged`. Reopening still happens, a staff member moves a
  resolved ticket back to `triaged`, it just is not a state of its own any more,
  and there is deliberately no client-side reopen button.
- **`ref`**, the number the client quotes (`BERG-T0412`): the account's own short
  code, a `T`, and a sequence counted PER ACCOUNT. Null when there is nothing to
  build one from (the agency's own tickets carry no account; a client may have no
  code yet). Unique where present.
- **`rank`**, drag-rank, the ONLY priority signal the product has. A sparse text
  key (`shared/workers/rank.ts`), so a drag writes one row and two people
  dragging different rows cannot collide. The list reads `ORDER BY COALESCE(rank,
  id) DESC, id DESC`, which is also the keyset the page is cut on.
- **`locked_at`**, when we first read it. The account owns the wording until
  then (a client may edit and re-rank their own unread ticket, and only their
  own); the first staff touch closes it, and never moves again.
- **`draft_resolution`**, the unsent working text each story's closing note will
  append to. Never sent to a client login.
- **`archived_at` + archiver block**. Put away, available from any state.
  Nothing is deleted; the row drops out of the everyday list and its count, and
  is still reachable by id and in the archive view.
- **`title_de` / `title_en`**, both titles, and neither derived from the other.
  788 of the tickets arriving from Glide exist only in German, so a translation
  SETS the empty one and never overwrites the original.

### help_stakeholders. KEEP (BUILT, per-team, team migration `0005_help_stakeholders`). WHO ELSE IS WATCHING A TICKET

The extra STAFF people on one ticket, beside whoever raised and whoever answers
it: one row per (`help_id`, `user_id`), with a UNIQUE pair so adding the same
person twice is a no-op rather than a duplicate (R17 as a constraint). A
stakeholder is a colleague who should see the ticket move — they are read by
`list_help_stakeholders` and added through `add_help_stakeholder`, and the
notify path reads this table for who to tell. Creator block only: a stakeholder
row is a statement, and taking somebody off it is the row going, not a
deactivation ceremony on a join row.

### ref_counters. BUILT (per-team, team migration `0011_ticket_work_engine`)
One row per (`account_id`, `kind`) holding `next_no`. The reference numbers SCOPE
ch.02 describes are sequential **per account**, and allocation is a SINGLE
statement. `INSERT … ON CONFLICT DO UPDATE … RETURNING`, so two people raising a
ticket on one account in the same second are serialized by the database instead of
both reading the same number (CONCURRENCY.md rule 1: the counter rides the write).
`kind` is the letter the reference wears: `T` ticket today, `S` story and `SPR`
sprint when those land.

### invite_logs. BUILT (per-team, team migration `0003_invite_logs`) + invite_index (GLOBAL, built)
`invite_logs` (full record in the team DB): audit + a FROZEN inviter snapshot
(`inviter_user_row_id`, `inviter_email`, `inviter_full_name`, `inviter_image`),
invitee (`invitee_user_row_id` if they have an account, `invitee_email`,
`proposed_member_role_id`), `created_on`, `shelf_life_in_hours` (default 168h =
the 7-day expiry), `invite_accepted`, `invite_acceptance_timestamp`. Its `id` =
`invite_index.invite_row_id`. Written on invite-create, stamped accepted on
accept (both best-effort, the global index is the routing truth, so a team-DB
hiccup never fails the invite/join). Surfaced on the invite detail (inviter +
acceptance) and as the `invite` activity scope. The GLOBAL `invite_index`
(already built) is the thin routing copy so onboarding can find invites by email
without opening every team DB.

### activity (Glide "All activity"). KEEP (table BUILT, per-team; feed + read path shipped). **Q3 RESOLVED.**
Purpose: the human-readable change feed. Glide referenced the subject row via
**one relation column per table** (`Invite logs/Teams/Member roles/Team members/
Data import sessions Row ID`). The Kwapso System uses a generic `(related_table,
related_row_id)` pair instead → scales to any module without new columns.

**WHAT ONE ROW SAYS (team migration `0062`, activity review 2026-09-05).** `id`,
`type`, `verb`, `origin`, `description`, `(related_table, related_row_id)`,
`created_at`, and the frozen actor snapshot `(creator_id, creator_email,
creator_name)`. An audit row has to answer three questions — WHO did it, WHAT it
was about, and WHERE it came from — and for a year it answered two.

- **`origin` — which front door.** Four surfaces act as the SAME PERSON through
  the SAME gated doors: the agency app, the client portal, a personal access
  token on the MCP surface, and the in-app assistant acting as its caller. That
  identity is the security design and it is right — the agent never exceeds the
  rights of the person it acts for — but it made their rows byte-identical, so
  after a leaked token the first question an owner asks (*which of these did
  this?*) had no answer in the one table that exists to answer it. One of seven:
  `app`, `portal`, `mcp`, `assistant`, `import`, `automation`, `unknown`. Stamped
  at the two public gateways (which SET the header, so a browser cannot label its
  own request) and carried by `forwardToDoor` on every act-as-user hop. **Nothing
  gates on it** — it is a label on history, never an authorisation, deliberately,
  because the moment a surface label decides something, forging it becomes worth
  trying. See `shared/workers/origin.ts`.
- **`verb` — what kind of event.** `type` is a human sentence and stays one; it
  is what the feed shows. It is also 157 distinct free-text literals across 139
  call sites, so "every archive last quarter" was a `LIKE` over prose that
  silently missed `retired`, `withdrawn`, `taken down`, `switched off` and
  `binned` — one event in five coats. Eight values (`created`, `edited`,
  `status`, `archived`, `restored`, `deleted`, `viewed`, `other`), DERIVED from
  the sentence in the one writer so no call site had to change and none can
  forget. See `shared/workers/activity-verbs.ts`.

Both are NULL on every row written before `0062` and neither is backfilled: there
is nothing on an old row that says which surface wrote it, so a backfill would
have to invent it. A NULL means *written before the column existed*; the string
`unknown` means *we asked and could not tell*. Two different facts, two different
values, neither guessed.

**Indexes (team migrations `0023_activity_feed_index` and `0062`).**
This is the fastest-growing table in a team database by construction: R1 makes every
mutation publish and this feed records a row for each, so at the yardstick it is the
tens-of-millions one. It pages by keyset (R14) on `ORDER BY created_at DESC, id DESC`,
and from `0001` until `0023` its only index led with `related_table`. So the RECORD
scope was indexed and the TEAM scope, the feed everybody opens, was not: every page
scanned and sorted the whole table to hand back fifty rows, and page two paid it
again. `idx_activity_feed (created_at DESC, id DESC)` serves the unfiltered page;
`idx_activity_table_feed (related_table, created_at DESC, id DESC)` serves R18's
`related_table IN (…)` page and lets the R16 `COUNT(*)` beside it read an index
rather than the widest table in the database. (`meetings` has carried exactly this
index for exactly this reason since `0021`.) The count is still O(rows-it-counts),
that is R16's price, and it is settled in [ARCHITECTURE.md §7](ARCHITECTURE.md) (the scaling decision, LOCKED). *(It used to cite `scaling-review.md`, the audit report behind that section — deleted 29 Aug 2026 and in no clone; README item 27 says so.)*
`idx_activity_actor_feed (creator_id, created_at DESC, id DESC)` is the third, added
in `0062` for the question the other two cannot answer: **what has this person
done?** None of the first three led with `creator_id` and nothing queried the table
that way, so an actor-scoped read was a full scan and a sort of the largest table in
the database — guaranteed to time out at exactly the moment it is first needed, which
is the hour after a token leaks. With four write surfaces acting as one person, that
is the query that matters most and it was the one shape the table was not built for.
*The INDEX is here; the READ PATH is not — `getActivity` still scopes by
`(related_table, related_row_id)` only, and an actor-scoped door is an owner's
decision (it names what one colleague did to another's records, so it is a
permission question before it is an index question).*

**HOW FAST IT GROWS — rows per active record per month.** Derived from the
write census, not estimated: 150 mutation doors, 146 of which write exactly one
row (three write one row for a whole bulk move or sweep, which makes them
cheaper, not dearer). So the rate is **one row per mutation, and a record's
history is exactly as long as the number of times somebody changed it.** In the
agency's own shape that is roughly:

| record | changes per month, each | rows/month |
|---|---|---|
| an open ticket | raised, triaged, ready, scheduled, in progress, edited ×2, resolved | ~8 |
| a story in a live sprint | created, edited ×3, in progress, done | ~6 |
| a company record | edited ~1 | ~1 |
| a dormant record (archived, or nobody touched it) | — | 0 |

A team running 200 open tickets and 100 live stories writes on the order of
2,200 rows a month, ~26k a year — kilobytes, not gigabytes, at this size. The
number that matters is not the agency's, it is the **yardstick's**: the same
arithmetic at a quarter of a million people in one tenant is where "tens of
millions" comes from, and it is why every read over this table pages by key and
why `0062`'s index exists before anybody needs it. Growth is watched by
`db_growth` / `db_alerts` like every other table.

**RETENTION: FOREVER, DELIBERATELY.** The nightly retention sweep excludes this
table by name — "anything anyone might have to answer for later… stay" — and
nothing archives or destroys a row. That is a decision, not an omission: a trail
with a horizon answers "what happened to this record?" only for records younger
than the horizon, and nobody knows in advance which ones they will be asked
about. If it is ever revisited, the answer is an ARCHIVE (export the tail to R2
and drop it), never a delete.

**APPEND-ONLY.** Nothing in the application updates or deletes a row here, and
there is exactly one way in from outside a migration — `insertActivity`, private,
behind `logActivity` (swallows and records its own failure) and `writeActivity`
(throws, for the callers where the row IS the point: a user-authored note, and
the one hard delete). Stated in the schema comment on the table and asserted by
`workers/tenancy/test/activity-trail.test.ts`, which fails on any `UPDATE`
or `DELETE FROM` against it anywhere in the workers, and on a second `INSERT`.

**WHAT IS DELIBERATELY NOT LOGGED**, in one place rather than in nobody's head:
the reviewed silences live beside the worker they describe, in each
`activity-seam.test.ts` (`SILENT`), one line each with its reason, and the seam
fails both ways — a route that leaves no line and has no entry turns the build
red, and so does an entry whose route has quietly started logging. Today there
are four across 150 mutations: a ticket REPLY, a work log, stopping a timer
(each is itself the record rather than a change to one, and each carries its own
audit block and is displayed as history where it belongs) and the owner's
AI-credit grant, which changes no team record and so has no `related_table` to
hang on. Everything else writes a line.

**READING ONE PERSON'S OR ONE RECORD'S HISTORY ACROSS BOTH TABLES.** There are
two trails and they are split by DATABASE BOUNDARY, not by feature: identity
events live in the global `account_activity` (the person's own history, across
every team) and team events live in each team's `activity`. That is legitimate —
a per-team table cannot hold "you changed your email", which belongs to the
person and not to any one team — but it means a full history is two reads, and
until now nothing said how to do them:

1. **The team half** — `GET /api/tenancy/activity?scope=record&table=<t>&id=<id>`
   for one record, `?scope=team` for the whole team (R18 subtracts the caller's
   denied modules; R14 pages by keyset). `?scope=user|role|invite` are the same
   read with the table supplied by the scope name.
2. **The identity half** — `GET /api/auth/activity`, the signed-in person's own
   `account_activity`, newest 50.

They are joined on the PERSON (`activity.creator_id` = `account_activity.user_id`
= the core `users.id`) and ordered on `created_at`, which is an ISO-8601 UTC
string in both. Nothing joins them server-side today and nothing should without a
decision: the identity half is the person's own and is read under their own
session, while the team half is fenced per module and per account. **The reason
they are two doors is the reason they are two tables.**

Per the
Q3 resolution below, **log EVERYTHING** (creations, edits, activations/
deactivations, milestones), superseding the earlier "edits/deactivations only",
the SAME rows are surfaced four ways by the read path
(`?scope=team|user|role|invite`).

### data_import_sessions. KEEP (BUILT 2026-06-23, team migration `0004_modules`), the 3-stage import
Real data: audit + the target (`table_key`/display), the column schema, a
`reference_dataset_url`, an `overall_status`, and the three stages of the
file → mapping → confirm session (uploaded CSV text + auto-mapped columns +
preview + the write result). In the Kwapso System the data-ops worker drives the 3 stages
(read → auto-map/validate → INSERT-ONLY write), writing **act-as-user** through
the target's gated create endpoint (so each import respects the caller's
permissions + the module's own validation). Gated by the target's `create`
right, import has no key of its own. **Export needs READ, import needs CREATE**
(the cross-cutting rule). A partial run is NOT a transaction: each row is an
independent gated create, and confirm returns per-row truth, `{created,
skipped, failed}` counts + up to five error messages, recorded on the session
(rows missing required values are skipped at preview; a failed row never blocks
the rest).

### accounts + account_links + portal_users. KEEP (BUILT 2026-08-09, team migration `0007_customer_spine`). THE CUSTOMER SPINE
Purpose: every company and every person kwapso works with, in **one** table
(SCOPE ch.03 "People, one table"). There is no second people-table anywhere.

`accounts`: audit block + `account_type` (`entity` | `individual`, CHECKed),
`parent_account_id` (a **self-pointer**: a holding company's businesses, a
business's divisions, nesting is deep, but not unlimited; the two ceilings are
below), `name`, `email`, `phone`, `address`, `code`,
`currency`, `locale`, `timezone`, `commercials_visible`. **`code` is a REFERENCE,
never an identifier**, staff assign it when work starts (BERG), it is unique-when-present
(a partial unique index, so two people can't mint the same one at the same
instant) and nullable, and every route addresses a row by its ULID `id`. Re-coding
an account therefore re-points nothing. **The loop guard is the write itself**: a
move rides a recursive `WITH … UPDATE … WHERE NOT EXISTS (ancestors)`, so two
admins re-parenting at the same instant cannot co-operate their way into a ring
(CONCURRENCY rule 1); zero rows changed is the refusal, reported as a plain 409.
**`status` is kept and means nothing (0042, 19 Aug 2026).** It held the commercial
lifecycle — prospect → client → past client — as free text behind a pick-or-TYPE
box, and it was a second answer to a question `deactivated_at` already answered:
is this account live? The two drifted exactly as a second source of truth does.
On the live data the day it was retired, 24 companies held FOUR spellings of two
ideas (`client` 13, `past client` 6, `active` 4, `active_client` 1 — the raw token
copied out of the form's own placeholder), all 106 contacts said `active`, which
is 106 rows carrying no information and one word printed on every row of the list,
and not one of the 130 accounts had ever been archived, so the mechanism that DOES
answer the question had never been used. One of the three seeded dropdown values
was literally `archived`, competing with the flag underneath it.

Nothing reads the column now — not the row type, the SELECT, the sort menu, the
door's filter, create, update, the audit diff, the CSV column, the two MCP tools
or either detail screen. It survives because it records what people typed while
the idea existed, which is the same reason nothing here is ever deleted, and the
same shape `meetings.status` already has (§ *meetings*). The `Account status`
dropdown group is DEACTIVATED by the migration rather than deleted, so it stops
being offered on the Dropdown values screen without losing its history.

**And already-there is not a move** (R17): `setAccountParent` compares the stored
row's `parent_account_id` first and returns `false` without writing at all, so a
repeat costs no history row and no live ping. The no-op predicate cannot ride the
UPDATE the way the archive toggle's does, because on this statement zero rows
changed already MEANS the ring refusal, and a no-op reported as "that would put
the account inside itself" is a sentence that isn't true. **Who moves one**: a
CONTACT is moved from her own record (the parent-account control on her Overview,
`web/components/contact-detail.tsx`) — people change jobs; a COMPANY is moved by
the assistant (`set_account_parent`) or an import column, because a company an
agency takes on is its own thing and its create/edit form deliberately never asks.

**The two ceilings on the tree, said out loud** (R14's premise is that every read
states its cap): the accounts table is the one self-nesting structure in the base,
so it is the one place a walk could run away with itself, and both walks stop.
**`MAX_ACCOUNT_DEPTH` (64, `shared/workers/limits.ts`)** bounds the loop guard's
climb when a record is re-parented: past 64 ancestors the walk can no longer PROVE
the move is ring-free, so it **refuses the move**, fails closed, never open. Far
deeper than any real org chart, and a refusal you would only ever meet by building
a chain nobody meant. **`SCOPE_HARD_CAP` (500, `shared/workers/account-scope.ts`)**
bounds the other direction: the reach walk that decides which accounts a client may
see stops at 500 rows. Past that the account set is wrong in the SAFE direction,
it stops early and grants LESS, never more. Both numbers are one-line changes, and
both are deliberately generous rather than tuned.

`account_links`: audit block + `account_id` (the company side),
`person_account_id` (the person's own account row), `relationship`,
`is_main_stakeholder`. This is what the parent pointer **cannot** say. Marta is a
contact of Bergman *and* of Delaval, and a single parent has room for one. A
partial unique index on the active pair is the duplicate race guard. "Contact" is
a role word, not a table: it is this row.

`portal_users`: audit block + `account_id`, `user_id` (the GLOBAL users row),
`app_restriction`, and `current_account_id` (added by `0008`, below). **The login
switch, and independent of linking**: an individual can be linked with no login, a
freelancer can hold a login on their own parentless account.

> **`app_restriction` is CARRIED, NOT ENFORCED. Read this before you rely on it.**
> The column is written and read back honestly, and the guard corridor
> (`shared/workers/account-scope.ts`) puts it on the caller's stamp. Nothing acts
> on it. It is the per-person "only these named Apps" narrowing from SCOPE ch.03,
> and the Apps module that is the only thing able to honour it has not landed yet,
> so today a value in this column changes **nothing** about what a client can see:
> their fence is their account's world, whole. Treat a non-null value as a note of
> intent, never as a restriction in force, a field that looks like a security
> control and is not is worse than no field at all, which is why the guard
> corridor says so at the field itself and why it is said plainly here. The grant
> door accepts it (`POST` accounts → `appRestriction`) and the read hands it back;
> neither narrows anything. When the Apps module lands, enforcing it is the work. The audit block IS the grant
record (creator_* = who granted, deactivator_* = who revoked), so there is no
second `granted_by` column to keep in step. **Revoke deactivates, never deletes**,
login dies, every record stays, and a partial unique index on `user_id` where
active means at most ONE live grant per person, which is what pins a caller to
exactly one account set.

**How a login is handed out.** Staff never type an address: the grant door takes
a `personAccountId` (a contact of the account, or the account itself when it is a
person), reads THAT row's email through the fence, and matches it to the global
`users` row. Identity is resolved outside the fence, so the email it is resolved
by has to come from inside it, staff can only ever switch access on for people
already on their own books. The person must have signed in here at least once
(there is no client invite yet); both refusals name them and say what to do next.
`userId` is still accepted directly for a machine caller that already holds one.

**The guard corridor** (`shared/workers/account-scope.ts`) is the one place a
caller's account set is decided: session → person → account set, and every
account-scoped statement ANDs its clause into the WHERE (reads *and* writes, the
fence rides the statement, it is never a pre-check). Portal-ness is decided by the
PRESENCE of a portal_users row, never by its absence: a revoked row still makes
you a portal caller, pinned to the EMPTY set, rather than silently promoting a
former client to staff. Enforced by `workers/tenancy/test/account-leak.test.ts`,
which derives the account-scoped routes off disk and sends a burglar at each.

### portal_users.current_account_id. KEEP (BUILT 2026-08-10, team migration `0008_portal_current_account`), where a client is standing

One column, and the whole account switcher stands on it. A client login belongs to
one company at a time and switches between them (owner decision, 10 Aug 2026, the
same bargain the team switcher makes: you own the data, it simply isn't fetched
while you're standing somewhere else). `current_account_id` is that pointer and
nothing more: it **NARROWS** the fence to one of the companies the person already
belongs to, and it can never widen it, the guard corridor re-derives the roots
first and only then honours the pointer, so a value naming a company they have no
grant on is ignored, not obeyed.

`NULL` means "not chosen yet", which the corridor reads as their first company
(roots are id-ordered, so the fallback pick is the same on every request, a
switcher that moved you on refresh would be a bug you could not reproduce). That is
why the migration needs no backfill: every grant that existed before it keeps
working untouched.

**WITHOUT `0008` applied to a team's database, the account switcher breaks**: every
read of `portal_users` hits a missing column, so switching companies fails and a
person who acts for two of the agency's clients is stuck in whichever one comes
first. Roll it with `POST /api/tenancy/admin/migrate-teams` (x-admin-key) before
deploying the portal, same rule as every team-schema migration.

### data_import_batches. KEEP (BUILT 2026-07-04, team migration `0006_import_batches`), agentic multi-file import
Purpose: the shell for an AGENTIC, multi-file import (AGENTIC-IMPORT.md). Groups the
uploaded files, the agent-built PLAN (targets, column mappings, normalizations,
references, dependency order) and the per-row REPORT, all JSON columns here; per-file
parsing reuses the single-target session engine. Real data: `id`, `overall_status`
(draft→analyzing→planned→running→complete), `files_json`, `plan_json`, `report_json`,
the audit block, `completed_at`. Creator-scoped (a batch belongs to who started it),
like `data_import_sessions`. Lives in the TEAM database (the data being imported is the
team's). Execution writes every row through the module's gated create endpoint
(act-as-user → audit parity); the plan step is metered on the AI credit pool.

### agent_threads + agent_messages. KEEP (BUILT 2026-06-23, team migration `0004_modules`), the AI agent's saved conversations
The agent gets its OWN tables (not help's). `agent_threads`: audit + the thread
title/owner, one saved conversation per row, scoped to its creator (a private
conversation, the audit trail). `agent_messages`: audit + `thread_id` (the
parent thread) + the turn (role + content + any tool calls/results). Every agent
turn is persisted here, so the conversation is replayable and auditable. The
agent acts AS the signed-in user through the same gated endpoints the UI uses, so
these rows are a record of intent, never a separate set of powers.

**`agent_messages.content` is WRITE-ONCE, and that is the point rather than an
omission.** No door updates it; a turn is inserted and never revised. Said here
because it was the one immutable user-facing column in the base with no reason on
file — the other four each carry theirs where they are declared
(`knowledge_terms.term` is half the primary key, `client_tool_prices` is an
append-only price history so that March's arithmetic does not get rewritten, and
`google_connections.service` / `google_sources.service` are structural) — so the
next person auditing one-way columns had to re-derive this one, as a tidiness
review did on 5 Sep 2026. A conversation that can be edited afterwards is not a
record of what was asked and answered, which is the only thing these rows are
for. Correcting a turn means adding another one.

### knowledge_sources + knowledge_chunks + knowledge_terms + knowledge_ingest. KEEP (BUILT 2026-08-11, team migrations `0012_knowledge` + `0020_knowledge_vectors` + `0022_knowledge_files`). THE KNOWLEDGE BASE
One knowledge base, many **compartments**, chosen for the reader rather than by
them. Four tables, one per job:

- **`knowledge_sources`**, one row per piece of material the assistant may read.
  Three families in one table, because a person edits them in one list: a `note`
  somebody typed here (the body IS the truth), a `file` somebody uploaded (THE
  FILE is the truth and the body is a READING of it), and a MIRROR of a row we
  already own — `ticket` / `account` / `contact` / `app` / `process` / `sprint` /
  `story` / `meeting` / `todo` / `task`, where the row is the truth and the sweep
  keeps the body in step. **Every table that can carry an account id is on that
  list**, which is the point of it: a question about a client lands on whatever
  the client's world is made of, and until 18 Aug 2026 six of those ten were
  missing — most glaringly the process map, the record that says what we actually
  DO for a client. A kind must also be named in `KNOWLEDGE_KINDS`
  (`workers/content/src/lib/knowledge.ts`), or `toSource` coerces it to `note`
  and every source of it lists and filters as one; `meeting` shipped a reader
  before it was named there, and nothing about that was visible. **`article` is a kind with no
  mirror behind it any more, and deliberately kept:** the Learning module was
  purged on 17 Aug 2026 and its table went with it, but its 41 articles had
  already been indexed here, so the material outlived the module. Dropping the
  kind would orphan those rows, the sweep no longer writes one, nothing reads a
  learning table, and the word is now only what an existing source calls itself
  and what a person filters by to find one. `compartment` is the design in one
  column (`agency`, or `account:<id>`), DERIVED on write and correctable by hand,
  never free-typed. `owner_user_id` is the second fence: NULL = the team's, a
  value = one person's (what THEY can see, through their own connection).
  `content_hash` + `indexed_chunks` are what let the sweep skip a row that is
  both unchanged AND finished, before it costs a model call, the hash says WHICH
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
  thing. `index_error` is why a source could not be indexed whole, in words,
  nothing here is ever silently trimmed. Deactivating means "stop reading this":
  the row survives, its chunks and its vectors do not, and the sweep will not put
  it back, and a row that leaves the app (an archived ticket, a switched-off
  app) deactivates itself the same way, because the readers now RETURN those rows
  marked `retired` rather than filtering them out, which is what stopped an
  archived ticket answering questions forever.
- **`knowledge_chunks`**, a readable piece of a source: what retrieval scores
  and what an answer cites. Its id is DERIVED (`<sourceId>:<seq>`, zero-padded),
  which is what lets a vector be overwritten or deleted without a lookup table
  and lets a source that got shorter lose only its tail. `embedding` is the
  quantised vector (1024 dimensions → ~1,368 characters); it is no longer what
  the search reads. Vectorize is, and it is kept for two jobs the index cannot
  do: rebuilding the index without paying to re-embed everything, and answering
  at all when no index is bound. NULL means "not embedded yet", which retrieval
  survives by falling back to the word index alone.
- **`knowledge_terms`**, the inverted index, as an ORDINARY indexed table rather
  than an FTS5 virtual one. Deliberate, and the reason is the DELETE: a re-index
  removes a source's postings, and on FTS5 that is a scan of every posting in the
  team, while here it is one keyed delete. It also behaves identically in the
  test harness and in D1, which a virtual table kept in step by triggers does not.
- **`knowledge_ingest`**, one row per source KIND: the cursor it reached, when it
  last ran, when it last SUCCEEDED, and what went wrong when it didn't (R12). The
  cursor is what makes ingestion resumable, a tick that dies halfway costs the
  next one nothing but the rows it has not reached.

  **The cursor carries the TEXT BUILDER that wrote it** (`v<n>|<sort>|<id>`).
  The content hash answers "has this row changed?", which is a different question
  from "has the way we WRITE this row changed?" — and the cursor makes the second
  one fatal, because every row already behind it is invisible forever unless
  somebody touches it. So improving what a kind SAYS reaches every future ticket
  and not one existing one. A stored cursor whose version is not the kind's
  current `textVersion` reads as null, the kind walks its table again, and the
  hash then does its ordinary job. Bump the version when a reader's text changes;
  `workers/content/test/knowledge-coverage.test.ts` pins a digest of every reader
  (and of the helpers they share) to the number declared, so a change without a
  bump turns the build red.

  **A ROLLUP kind starts again when it catches up.** An account's source is built
  from rows its own cursor cannot see — its apps, sprints, tickets, maps, people
  — none of which moves `accounts.updated_at`. So `rollup: true` drops the
  position at the end of the table and the next tick starts over, refreshing every
  account's text on a rolling cycle. It is not `windowed`: a windowed kind
  re-walks in the same tick and therefore never reports `caughtUp`, which is the
  signal `scripts/knowledge-backfill.mjs` loops on.

**Where the search lives, and why the tenancy argument survived the move.** The
SEARCH is Cloudflare Vectorize, one account-wide index, with every team in its
own NAMESPACE and every chunk carrying the labels a question is routed by. The
original decision kept vectors here precisely because a per-team database makes
tenancy structural where "one index with a team id in the metadata" makes it a
filter somebody wrote correctly today. That objection is answered rather than
dropped, and both halves are Law R26: a namespace is a PARTITION Vectorize
applies before the search, not a filter; and nothing readable ever comes out of
the index, it is asked for ids and scores alone, and every passage in every
answer is read back out of THIS database, under the caller's own owner clause,
with excluded sources gone. The vector store narrows; the database decides. The
full argument, and what would change our mind, is at the top of
`workers/content/src/lib/knowledge-vectors.ts`; the numbers that forced the move
are in `.plans/BUILD-4-knowledge-retrieval.md`.

**The edge the move creates: a reset does NOT empty the index.**
`scripts/reset-all.mjs` deletes every team database and blanks the core, the two
things it can reach. Vectorize is a third store outside both, so after a reset the
account-wide index still holds the vectors of teams that no longer exist, and a
deleted team's namespace is still there with rows in it. **This is harmless to
READS, and R26 is exactly why**: nothing readable comes out of the index (ids and
scores only), so a stranded vector can at worst score a chunk id that the team
database no longer has a row for, and the passage read-back returns nothing. It
cannot produce text, and it cannot cross a namespace. What it does cost is
**storage you are paying for and a count that no longer means anything**, so treat
it as housekeeping, not as a leak:

- After a reset you intend to keep clean, delete and recreate the index rather than
  trying to prune it: `npx wrangler vectorize delete kwapso-knowledge-staging`, then
  re-run BOOTSTRAP §3b **including all nine metadata indexes** (they do not survive
  the delete, and Vectorize will not index metadata retrospectively).
- A team deleted on its own leaves its namespace behind. There is no per-namespace
  delete today; the next full index rebuild is when it goes.
- Nothing here is on a cron. It is deliberate: an automatic vector sweep keyed on
  "teams that no longer exist" would be a destructive job reading a table a reset
  has just emptied, which is the worst possible moment to trust it.

---
### apps + processes + process_versions + process_steps + process_comments. KEEP (BUILT 2026-08-11, team migration `0013_process_maps_and_money`). THE PROCESS MAP

**App → Process → Step**, and the versions cut over them (SCOPE ch.02). An **App**
is the built system, the thing with its own address and its own stage; a client
wanting dispatch fixed, served by a driver app and a back-office screen, is TWO
rows. A **Process** is a way of working inside one. A **Step** is one part of it,
and it carries the two numbers every savings figure in the app is computed from:
how long it takes each time, and how often it happens.

**Version 1 is the pre-kwapso baseline**, how the work was done before we touched
anything, and it is written WITH the process, because a process with no baseline
can never produce a saving and would report zero for ever while looking healthy.
Later versions are cut **by hand, from the button, and only there** (owner,
24 Aug 2026; migration `0051_a_version_is_cut_by_hand`). An earlier design had a
completing sprint cut one automatically (`cut_from_sprint_id`), and nothing was
ever wired to do it — the parameter, the column and its index existed and only
tests used them, so the decision was purged rather than switched off. The R17
shape survives the purge: a version cut is a transition that is an INSERT, the
predicate cannot ride a WHERE, so the unique index on `(process_id, version_no)`
is what refuses the second of two quick presses, and the door answers the loser
`alreadyCut: true` rather than an error.

**`process_steps.step_key` is the identity that makes a saving a SUBTRACTION**
rather than a name match: the row id belongs to one version, the key is the same
step across all of them, and a cut copies it forward. A step that STOPS happening
is carried forward with its frequency intact and its time at zero (`removed_at`),
deleting the row would drop it out of the baseline join and report no saving at
all for the work we removed entirely, which is the largest saving there is.

**Only the NEWEST version's steps can be written.** A baseline that can be edited
after the fact is a saving anybody can dial up, and every figure this app shows a
client is a subtraction from one. The predicate rides both writes' `UPDATE`
rather than sitting in front of them, so a version cut mid-request cannot leave a
check true and the write wrong. `removeStep` did not carry it until 2026-08-17,
the write that sets a duration to ZERO, and so the one that would have
manufactured the largest saving the app can report. Nothing but the absence of a
screen had been keeping callers off it; the process detail's version selector is
exactly the screen that would have arrived. A button is not a permission.

Every table carries `account_id`, denormalised on purpose: the fence is then the
same one clause the accounts list uses, with no join for the next reader to
forget. An app's account is written once at creation and there is no move-app
door, moving one would silently republish a whole map, its savings and its
conversation into somebody else's portal.

**`apps.logo_url` (team migration `0037_app_logo`)** is the client's own mark, and
it is the one column here whose absence was VISIBLE. The apps screen is a wall of
tiles precisely because an app is the record a person recognises by sight, and
every tile drew the same stage glyph, because there was nowhere to put a logo.
Twenty-six of the twenty-eight apps that came across from Glide carry one
(`glide/RECONCILIATION.md`), so the rows were waiting for the column rather than
the other way round; `scripts/glide-visuals.mjs` is what carried them.

It holds a `/media/<teamId>/apps/<ulid>` path and never the picture: the door
takes a data URL, `storeImageDataUrl` (`shared/workers/image.ts`, the same seam
`accounts.logo_url` has used since 0024) puts the bytes in R2, and the row keeps
the path. Storing the data URL instead would be wrong three ways over, and
`workers/tenancy/test/app-logo.test.ts` holds all three: `safeSrc` refuses a
`data:` scheme so nothing would render, a bounded list read whole would carry a
megabyte of base64, and the door's png/jpeg/webp allow-list is what keeps an SVG
— a script running on the app's own origin — out of the bucket. ONE image column,
not two: an account has a logo and a cover because a company record has a
masthead, and an app is only ever a square.

`process_comments` is the conversation on a map: one of the six things a contact
can do (SCOPE ch.06), and a conversation rather than an edit, it changes no
duration and cuts no version. A STAFF comment carrying `explains_step_key` is the
explanation attached to a step that got slower; the client's own screen shows the
regression either way (no filter hides one) and shows our explanation beside it.

### app_staff + app_stakeholders. KEEP (BUILT 2026-08-17, team migration `0030_app_staff_and_stakeholders`). WHO IS ON AN APP

The two answers an app tile could not give: who runs it on OUR side and who owns
it on THEIRS. `app_staff` is our people — `user_id` plus `is_lead`, so "who do I
ask" has one name — and `app_stakeholders` is the client's people, `contact_id`
pointing at the person's own `accounts` row (a stakeholder is a contact you
already have, never a new record) plus `is_main`, the one whose confirmation a
ticket's `awaiting_validation` stage waits on. Both carry the full audit block
and deactivate rather than delete, so "who USED to run this" stays answerable.

### app_modules. KEEP (BUILT 2026-08-20, team migration `0048_app_modules`). THE SECTIONS OF A BUILT SYSTEM

What a ticket says it is ABOUT: an app's own divisions (Settings, Documents,
Tasks), so tickets group by the part of the software they concern. `app_id` names
the system, `account_id` is copied on for the fence, and the row carries `name`,
a `mark` (the glyph shown beside it), `name_de`, a `description` and a `benefit`.
It is deliberately NOT a process: a process is a way of WORKING and belongs to
the account's world; a module is a division of the software we built. A ticket's
`module_id` must belong to the app its `app_id` names, and the door checks it.

### process_step_tools + the six step columns. KEEP (BUILT 2026-08-24, team migrations `0053_a_step_names_its_role_and_its_tools` + `0054_the_audit_module_finished`). WHAT A STEP IS MADE OF

The audit round's answer to "a step is a name and two numbers, and a saving
needs more than that". `0053` gives a step its ROLE — `client_role_id`, who at
the client does this work — and a join table, `process_step_tools`, for the
tools it touches, keyed `(version_id, step_key)` so the pair survives a version
cut, with `account_id` carried so the fence applies to this row and not only to
the step it hangs off. `0054` then adds five more columns to `process_steps`:
`client_tool_id` (the ONE tool on the step, backfilled from the join table's
oldest row), `frequency_period` (day / week / month / year — how often, in the
period somebody actually says it in, which is what lets a savings sum normalise
honestly), `role_cents_per_hour` (what an hour of that role cost WHEN THIS WAS
RECORDED — frozen, because a rate corrected in 2027 must not move a figure a
client agreed in 2026), and `branch_label` + `loops_back_to` (forks, the words
on them, and the way back). The same migration puts `audit_date` on `processes`,
the day a map's savings are measured FROM.

### process_step_revisions. KEEP (BUILT 2026-08-24, team migration `0054_the_audit_module_finished`). THE MAP, ON ANY DAY

The step across TIME: keyed by `step_key` (the identity a version cut copies
forward, not the per-version row id) plus `effective_on`, the day this
description of the step started being true. One description of one step per day
— saying it twice on one day is a correction, not a second truth. Each row
freezes the step's whole shape (name, position, the two numbers,
`frequency_period`, role, frozen `role_cents_per_hour`, tool, branch, loop) and
a `removed` flag meaning the work stopped happening on that date — never a
delete, because a removed step is the largest saving there is and deleting it
would report none. This is what lets a map be read AS OF a date and cost that
date correctly. Deleted only when a mistaken step is deleted with them (the one
hard-delete door, see `apps + processes` above and CONVENTIONS.md).

### process_links. KEEP (BUILT 2026-08-24, team migration `0054_the_audit_module_finished`). ONE MAP, CONNECTED TO ANOTHER

The last step of one map is very often the first step of another, and this row
says so: `from_process_id` → `to_process_id`, unique per pair, with a `note` in
the team's own words ("hands over to"). LOOSE by ruling — connecting two maps
alters no duration and no saving on either side, so the door does not gate it
like an edit to the numbers. Creator block only, and DISCONNECTING deletes the
row: the connection is a statement, not a record.

### process_drafts. KEEP (BUILT 2026-08-24, team migration `0054_the_audit_module_finished`). WHAT THE EXTRACTION PROPOSES, BEFORE ANYBODY AGREES

A call we held (`source_meeting_id`) or text somebody pasted (`source_text`),
read by a model into a proposed map or a proposed revision of one
(`process_id` null = a new map). The proposal itself is a JSON `payload`,
deliberately NOT normalised into the real tables: a draft that lived in
`process_steps` would be indistinguishable from the record the moment anybody
read it wrong, and "the draft is not the record" is the sentence this table
exists to keep true. `status` walks proposed → applied / discarded, and applying
one is a PERSON reviewing and confirming — always, no exception, which is also
why the draft doors are deliberately off the machine surface (MCP.md's
`TOOLLESS_DOORS` carries the reasoning).

### account_rates + internal_rates + internal_role_rates. KEEP (BUILT 2026-08-11 + 2026-08-17, migrations `0013` + `0031_role_rate_card`). THE THREE RATE CARDS

**Separate tables, never one with a `kind` column, and that is the security
control.** One is what an ACCOUNT IS CHARGED per hour; the other two are OURS:
what an hour of our own work costs us (`internal_rates`), and what an hour of a
named ROLE is worth (`internal_role_rates`, migration `0031_role_rate_card` —
`role_name` + `cents_per_hour` + the audit block, written by the one
`set_role_rate` door, where the role name is the key so add, re-price and retire
are one act). The role card is the number an app's money figure is computed
from, and its own comment in `internal-money.ts` says the load-bearing part: it
is a THIRD rate card and it belongs in that file, which is the whole of R24's
defence. They are the same shape, a label and a rate, which is exactly the
danger: one table would put both numbers a single forgotten predicate apart, and
the wrong one of them is the one figure SCOPE says a client must never see under
any flag, ever. A door that reads `account_rates` cannot return an internal rate,
because the internal rate is not in the table it named. The same split runs
through the code (`lib/rates.ts` vs `lib/internal-money.ts`) and is what **Law
R24** checks: no door the client portal opens can reach the internal file. (R24,
not R23. R23 is the knowledge base's citation law. This sentence named the wrong
one, which pointed anybody tracing the guarantee at a law that has nothing to do
with it.)

`internal_rates.is_default` (at most one, by partial unique index) is the rate a
margin applies to logged time whose kind of work is not yet named. Tool costs are
a COLUMN on the app (`tool_cost_cents_per_month`) rather than a table: what a
system costs us to keep running is one number about one system, and the margin is
the only thing that reads it.

### client_departments + client_roles + client_role_departments + client_role_people + client_tools + client_tool_prices. KEEP (BUILT 2026-08-24, team migration `0052_the_client_organisation`). THE CLIENT'S OWN ORGANISATION

Who does the work AT A CLIENT, what an hour of them costs, and what they run on
— the other side of the money from the internal cards above, and the side a
saving actually multiplies. Six tables, every one fenced by `account_id`:

- **`client_departments`**, the named parts of their business.
- **`client_roles`**, who does the work. `cents_per_hour` is what an hour of
  this role costs the CLIENT, and NULL is a real answer rather than a zero — a
  saving computed from it reads as incomplete instead of as nothing.
- **`client_role_departments`**, the join: a role can sit in SEVERAL
  departments, and the write is the WHOLE set — anything left out is removed
  (which is why the door's tool says so in as many words).
- **`client_role_people`**, who holds the role: `person_account_id` points at
  the person's own `accounts` row. A person on a role is a contact you already
  have, never a new record.
- **`client_tools`**, what they run on — a name and a `mark`.
- **`client_tool_prices`**, the DATED price history: `cents`, a
  `billing_period` of month or year, and `effective_on`, the day this price
  started being true. A map set to a date reads the newest row on or before it,
  which is what lets a map set to March cost March correctly; setting a price
  for a day that already has one REPLACES it (a correction means "this is what
  it was", not a second truth about the same morning), and that replace is one
  of the few genuine child-row deletes in the base (CONVENTIONS.md).

The join tables carry creator blocks only; the four record tables carry the full
audit block and deactivate, never delete.

---

### stories + sprints. KEEP (BUILT 2026-08-12, team migration `0014_stories_and_sprints`). WHAT WE DO

A ticket is what an account ASKS FOR. A **story** is one piece of work WE do
about it, and it is **the only place an assignee and a due date live**, a ticket
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
`sold_price_cents`, **whole cents**, which settled the one open contract between
this build and the money lane (`workers/tenancy/src/lib/work-engine.ts` used to
probe `sqlite_master` for which of two spellings had shipped). `completed_at` is
a MOMENT rather than a status word, because the version cut on the money side
keys off exactly that.

### story_attachments + story_processes. KEEP (BUILT 2026-08-19 + 2026-08-17, team migrations `0045_a_story_shows_its_work` + `0028_ticket_and_story_facts`). WHAT A STORY CARRIES

Two small tables that hang off a story. **`story_attachments`** is its files and
links — `kind` is `file` or `link`, with a `label`, the `url`, and
`content_type` + `size_bytes` when there are bytes behind it; a screenshot of
the work is the ordinary row. Deactivated, never deleted, so "what was attached
when we agreed this" survives (`add_story_link` is the machine half; the FILE
half is a screen action, the same bytes-not-prose ruling as everywhere else on
the machine surface). **`story_processes`** is the join saying which process
maps a piece of work touches — creator block only, a statement rather than a
record, which is what lets the impact screen walk from the work done to the maps
it changed.

### waves. KEEP (BUILT 2026-08-24, team migration `0054_the_audit_module_finished`). WHAT A CLIENT BOUGHT

A **wave** is several sprints sold together — the package, where a sprint is the
block inside it. It carries a `name` (unique per account among active rows), a
`goal`, and NO price: what a wave costs is deliberately out of this module's
first version. `starts_on` / `ends_on` are DERIVED from the sprints inside it
and STORED so a list does not recompute them per row — recalculated whenever a
sprint is added, moved or removed. The join is one column the same migration
puts on the sprint, `sprints.wave_id`, written by the one `set_sprint_wave` door
(tenancy's single-column write on a content-owned table — the ownership split is
recorded in RESILIENCE.md §2). Two sprints whose dates overlap are REPORTED and
never refused: the overlap is real, and a door that said no would be enforcing a
rule nobody agreed to.

### work_logs + work_prefs. KEEP (BUILT 2026-08-12, team migration `0015_work_logs`). THE ROW OF TIME

**A timer is a work log with no end yet.** There is no second table, no session
object and no state machine: starting is one insert, stopping is one update, and
the header asks "what am I running?" with one indexed read. That shape is what
pays for the owner's own acceptance bar, "logging time takes too many clicks"
was the single thing he named as most likely to make him abandon this.

- **It attaches to a story, a ticket or a task, and nothing else.** Never a to-do
  (that is the client's time, not ours) and never an account on its own (a figure
  with no work behind it is one nobody can check). The allow-list is
  `WORK_LOG_TARGETS` in `workers/content/src/lib/work-logs.ts`, **there is
  deliberately no CHECK constraint**, because a CHECK would be a second copy only
  SQLite can see, and in SQLite it cannot be altered without rebuilding the
  largest table here.
- **One partial unique index on (user, target) WHERE `ended_at IS NULL`.**
  Parallel timers on different work are a real day and are allowed; the same
  person on the same work twice is a double count nobody would spot in a total,
  so the database refuses it rather than a check a race slips past.
- **`discarded_at` is how a runaway timer is binned** without deleting anything.
  The row and the name of whoever binned it survive; every sum subtracts it.
- **`kind` is nullable on purpose**, a work log will eventually name its kind of
  work so the margin can group by it. Until then `lib/internal-money.ts` applies
  the default internal rate and says so on screen.

`work_prefs` is one row per person and today one column: whether starting a timer
stops the ones they already have running. **Off by default**, a setting that
silently stopped your other work would be discovered by losing an hour.

### todos + tasks. KEEP (BUILT 2026-08-12, team migration `0016_todos_and_tasks`). THE OTHER TWO NOUNS

**Two tables, not one with a `kind` column**, and the reason is the one that split
the rate cards: they are the same SHAPE and opposite AUDIENCES. A **to-do**
is aimed at the client and appears in their portal; a **task** is our own admin
and must never leave the building. One table with a flag would put both a
forgotten `WHERE` clause apart, and the wrong one of them is a list of the
agency's internal chores rendered on a customer's screen.

- `todos.account_id` is **NOT NULL**, a to-do with no client is aimed at nobody,
  and that column is what the fence reads. It is the ONE row in the work engine a
  client login writes to: they complete it and attach one file.
- Raising one **emails them**. It is one of only two things in the whole product
  that reach a customer's inbox (the other is a ticket resolution).
- `tasks.account_id` is nullable and usually null. **Work logs attach to a task**
  and never to a to-do, forty minutes on our own VAT return costs us what forty
  minutes of delivery costs us.

### triage_duty. KEEP (BUILT 2026-08-12, team migration `0017_triage_duty`). WHOSE WEEK IT IS

A rota keyed by the **Monday**, with a unique index on the week. "One named
person is on triage duty, and it is visible whose week it is" (.plans/BUILD-1 §6)
has no answer if two rows claim a week, and a check in code is a check two
simultaneous writers race past. A row per week rather than a flag on a member,
because "whose week was it when this was missed?" has to survive.

### meetings. KEEP (BUILT, per-team, team migration `0021_meetings`). WHAT WAS AGREED IN THE ROOM

The one noun the legacy import had nowhere to put. Glide held 350 meetings and the
reconciliation folded every one into a **work log**, because a work log was the only
row carrying a date, a duration and a client. That kept the hours and threw the
meeting away: a work log answers *"how long did that take"* and has no field that
can answer *"what did we agree in March"*.

- **`agenda` and `notes` are the two things nothing else in the app holds**, and
  they are why this is a record rather than a column on something else.
- **Time still goes on a work log**, and the two are joined by nothing on purpose,
  a meeting is not a timesheet, and a meeting that ran long is two facts, not one.
- **`purpose_id`** points at the `meeting_purposes` taxonomy (§ *the agency's own
  housekeeping*), so "why did we meet" is a dropdown value rather than a fifth
  spelling typed into a title.
- **`status` and `held_at` are kept and mean nothing (18 Aug 2026).** They held a
  meeting's `scheduled` / `held` flag, and the flag is retired: a meeting's own
  `starts_at` already says whether it has happened, so a column somebody had to
  tick was a second source of truth for a question the clock answers, and the two
  disagreed in both directions (a March meeting nobody ticked read as upcoming for
  ever; one ticked on Monday morning left the day it belonged to). Nothing reads
  either column now. They survive because they record what people ticked while the
  idea existed, which is the same reason nothing here is ever deleted. Cancelling
  was never one of the words: it is `deactivated_at`, like every other retirement
  here, so "didn't we have a call in March?" is answerable either way.
- **`google_event_id` is how the sweep recognises an entry it already has.** It is
  UNIQUE (partial, so the majority of rows with no entry are not competing for one
  NULL), which is what stops one calendar event becoming two meetings however many
  times the sweep runs. It was invented for a "put it in my calendar" button that
  no longer exists; the idempotence outlived the write it was invented for.
- **The `google_*` columns are a MIRROR of the calendar event** (team migration
  `0035_calendar_depth_and_file_shares`): the join link, the organiser, the guest
  list and what each person answered (`google_attendees_json`), whatever is
  attached (`google_attachments_json`), the status, the zone, the repeat rule, and
  `google_synced_at` saying when all of that was last true. They exist because the
  alternative is that a meeting can only say who was in the room to the one person
  whose connection pushed it, live, one call per meeting — a record of a
  conversation with the conversation left out. **Nothing writes to Google, from
  here or from anywhere**: the four calendar write doors that used to are gone
  (18 Aug 2026), so Google's calendar is the source and every one of these columns is
  a copy of it.
- **`from_calendar` decides what a re-sync may overwrite.** Two kinds of meeting
  carry an event id and they are not the same record: one was typed here, the other
  was read IN off somebody's calendar. Google owns the words of a row it authored,
  kwapso owns the words of a row it authored, and `notes` is never touched by any
  sync — it is the one column in this module that only a person writes.
- **`google_connections.calendar_swept_through` is how far the whole-calendar walk
  has read** (team migration `0038_calendar_one_way`). The sweep does two windows:
  a LIVE one every call (a fortnight back, four weeks on) and one ninety-day SLICE
  of the wider window — five years back to a year ahead — resuming from this
  moment. Forward-only, so it cannot leave a gap behind it, and it stops at the
  last entry actually read when a slice holds more than one bounded read will walk.
  It sits on the CONNECTION because the walk is one person's own calendar read with
  one person's own token. NULL means "never walked", read as the floor.
- **`transcript_text` is what was SAID, kept here rather than fetched.** That is
  what makes it readable by every colleague whose role can read meetings instead
  of only by whoever holds the Drive connection — and it is what makes it
  answerable **without a second ingestion path**: text in a column is swept by the
  ordinary `meeting` ingest kind, on the cron, in the client's own compartment,
  with no Google token in sight. It is cut to what one row may hold and
  `transcript_note` says so when it was, the same rule (and the same words) a
  knowledge file uses. `transcript_found_by` records which of the three hunts
  found it — the calendar entry's own attachment, a shared Drive folder, or a
  notice from Google in the mail — because the three do not prove the same thing.
- **`transcript_attempts` (`0055_transcript_gives_up`, 26 Aug 2026)** is the
  autopilot's give-up counter. A hunt that THROWS increments it; a quiet
  "nothing there yet" stays free to retry until the horizon passes. Past
  `TRANSCRIPT_ATTEMPT_CAP` (8, `shared/workers/limits.ts`) the sweep stops
  selecting the meeting, so one meeting Google keeps refusing cannot eat the
  tick's budget every quarter hour forever — the cap is the SWEEP's selection
  rule, not a refusal on the door, so a person pressing the read button can
  still try.

**Why it is its own permission module and not four more rights on `delivery`.**
`meeting_purposes` is a TAXONOMY of why we meet, a settled list somebody curates
once a year. A meeting is a record that accumulates forever. Sharing one permission
row would mean granting the right to read every note ever taken in order to let
somebody see the list of purposes.
### brand_assets + meeting_purposes + staff_profiles + staff_certificates. KEEP (BUILT 2026-08-12, team migration `0018_agency_internal`). THE AGENCY'S OWN HOUSEKEEPING

**A colour is not a picture of a colour (`0043`, 19 Aug 2026).** Twenty-four of
the twenty-five `Color` rows held a LINK to a flat rectangle rendered by another
website, and **nine were on `corhexa.com` — a typosquat of `colorhexa.com`**, a
domain we do not control, one letter from the one we meant, serving bytes into
the agency's own brand library. Every other category (46 rows across seven types)
was already hosted here, so colour was the whole of the library's external
surface — and the hex sat in the URL the entire time.

Nothing rendered those URLs as an image: a brand asset's file shows as TEXT, so
this was **dormant rather than live**. It would not have stayed dormant. The
collection row is getting a picture slot (UI-GAPS #16), and that entry names
`brand.list` carrying "the asset's own file" as one of the four lists that gain
one. The fix landed before the thing that would have made it matter.

`color_hex` is `#RRGGBB`, normalised on the way in by `safeColorHex` (three-digit
shorthand expanded, anything else dropped rather than refused — the same choice
`safeExternalLink` makes beside it, and for the same reason: the field is
optional and losing a bad value costs nothing). The migration converted both URL
shapes the two hosts wrote, cleared `file_url` on every row it touched, and left
the one colour we host and every non-colour row alone. Proved row by row in
`workers/tenancy/test/colour-is-not-a-picture.test.ts`, including the trap: a
logo whose URL happens to end in six valid hex digits.

Four tables, three permission modules, and the agency-internal side of the legacy
Glide app finally landed. What they have in common is the whole of their security
story: **none of them carries an `account_id`**, because none of these rows
belongs to a customer. There is nothing here for the account fence to fence, so
the defence is at the door instead, and it is a REFUSAL rather than a filter:
every handler on all three modules opens with `refusePortalCaller`, and
`workers/content/test/agency-internal.test.ts` proves three things off disk (none
of the doors is on the portal gateway's surface, every one of them refuses, and
no file in `web-portal/` names these tables, paths or fields). That is the same
structural shape R24 uses for margin, applied to a different secret.

| Table | Module | From (Glide) | Rows | What it is |
|---|---|---|---|---|
| `brand_assets` | `brand_assets` | `branding` | 74 | The material everything else is made with: logos, decks, templates. `file_url` holds either an object we host or a link elsewhere; `color_hex` (`0043`) holds a colour that IS the asset, and the two are exclusive — the migration cleared the URL on every row it converted. |
| `meeting_purposes` | `delivery` | `purposes` | 27 | Why the agency meets, and the department it belongs to. |
| `staff_profiles` | `staff_profiles` | `users` (six profile columns) | 6 | The person behind the member row: personality type, what they are best at, what they find hard, who they look up to, a photo. |
| `staff_certificates` | `staff_profiles` | `certificates` | 5 | A qualification somebody holds, issuer, granted, lapses, the paper itself. |

**The `delivery` module is now one table.** It was born holding two, a
`programs` table behind the Delivery method page, and `meeting_purposes`, and
the page went on 17 Aug 2026 (the ten programmes were the sprint types wearing a
second name; see `selectable_data` above for where their enrichment lives now).
The permission module key stays `delivery`, because that string sits in every
role's permission sheet and renaming it would take somebody's access away; its
LABEL is now "Meeting purposes", which is what it actually covers. The page is
reached from a link on the Meetings screen rather than from the sidebar, because
the taxonomy of why we meet is read where meetings are.

**Two of the legacy lookup tables are deliberately NOT tables here.**
`departments` (8 rows) and `channels` (6) are bare labels with no fields of their
own, and the base already has exactly one home for a team's editable vocabulary:
`selectable_data`, which carries its own permissions, screen, import, export and
machine tools. `departments` became the dropdown GROUP "Department",
pick-or-created the way every other vocabulary in this app is
(`workers/content/src/lib/vocabulary.ts`); `channels` had only the Marketing
module to serve and left with it. A module built to hold a word is ceremony.
`purposes` is the one that could NOT go the same way, and the reason is worth
keeping: it carries a department, and a dropdown row is a single label with
nowhere to put a second fact, so the purpose is a record and the department is
the dropdown value, each fact stored the way its own shape asks.

**`staff_profiles` holds ONE live profile per person**, and holds it in the
database rather than in a handler: a partial unique index on `user_id WHERE
deactivated_at IS NULL`, so two tabs saving a colleague's profile at the same
instant settle into one row (CONCURRENCY rule 2). The write is a single upsert
door for both "there wasn't one" and "there was", a person either has a profile
or they don't, and the screen filling in the form has no way of knowing which.

**Dates are days, and a value that is nearly a day is refused** (`optionalDate`,
`workers/content/src/lib/internal-fields.ts`): `2026-02-31` rolls over into March
in every naive parser, and an expiry that half parses is a certificate that
silently never lapses.

**The two ungrouped legacy sets.** Sixteen of the legacy app's 154 dropdown
values carried no group at all, ten country names, five company-size bands and
one stray hyphen. The owner ruled for two GROUPS rather than two fields on the
account, because a country typed free into an address is a country spelled five
ways by five people. Both are seeded in `DEFAULT_SELECTABLE` and backfilled for
existing teams by the same migration; the hyphen is not carried across.

### deliverables. KEEP (BUILT 2026-08-18, team migration `0036_deliverables`). WHAT WE HAND OVER

One table, hanging off an **app**, and the whole of it is the owner's own
sentence about what the word means: *"handover materials / handover docs / API
documentation / loom or teller reviews / SOPs of how to use the app, etc."* So a
deliverable is a piece of MATERIAL with a **kind**, a **title**, a **date** and
something it points at. CHECKLIST 8.7 sat parked for weeks because nobody had
said that; it is a module rather than a tab because a table, a permission row and
a machine surface are what a shelf needs to exist at all.

| Column | What it is |
|---|---|
| `app_id` | NOT NULL. The legacy app hung these off apps too (`glide/RECONCILIATION.md`: 8 rows, *Name, type, a content URL and a thumbnail*), and the reason is that file's own headline, the customer is the owner but the **app is the unit of work**. A handover doc with no system to hand over is not a record anybody could file. |
| `account_id` | Denormalised from the app at creation and never edited, exactly as `processes` and its three children carry it, so the account fence rides ONE clause with no join. |
| `title` · `kind` · `dated_on` | What the card shows: a name, the word in small caps, and the day. `kind` pick-or-creates into the **Deliverable kind** dropdown group (`shared/selectable-groups.ts`) — a vocabulary and not an enum, because the owner's list ends in "etc." `dated_on` is a calendar DAY through `optionalDate`. |
| `url` | ONE column for TWO shapes: an object we host (a `/media/internal/…` URL the upload door minted) or a link we do not (a Loom recording, a Google Doc, an API reference). The same sentence `brand_assets.file_url` makes, for the reason `help_attachments` gives at length — "here is the thing I mean" is one act, and two columns would be two ways to be wrong about which is set. Everything stored goes through `safeExternalLink`. |
| `image_url` | The picture on the card, when there is one. Separate from `url` because a Loom link carries no thumbnail of its own and a PDF is not its own preview. |

**THE FENCE IS BUILT, AND SWITCHED OFF.** This is the one table in the app whose
rows genuinely are the client's — the material is what we hand them — and it is
still agency-only today: no door is on the portal gateway's surface, every one of
the five opens with `refusePortalCaller` (R21), and nothing in `web-portal/`
names the table or the paths, proved off disk by
`workers/content/test/deliverables.test.ts`. Whether a client may see their own
handover shelf is a product decision the owner has not made, and the base's rule
is that an unmade decision is a closed door. `account_id` is what makes opening
it later a door change rather than a data migration.

**Its history gates on its own module** (`ACTIVITY_GATE_MAP.deliverables`), not on
`processes`: "Ana handed over the Payroll API reference" names a deliverable, and
a role that may open the app but not its shelf must not read that sentence out of
the feed either (R18). The live ping carries the **app's** id rather than the
deliverable's, the shape `account_rates` and `account_links` already have — a
deliverable has no list and no screen of its own, so the app is the one row a
listener can act on.

### google_connections + google_sources. KEEP (BUILT 2026-08-12, team migration `0019_google_connections`). ONE PERSON'S OWN GOOGLE

Two tables, and the shape of the first one is the whole product decision: a
connection hangs off a **user id**, never a team. Each person connects their own
Google account, one service at a time, and the assistant acting for them sees
exactly what they can see. There is no service account anywhere in this module
and deliberately nowhere to put one. "connect the agency's Drive once and let
everybody read it" is not a mistake somebody could make here, it is a column that
does not exist.

**`google_connections`**, `user_id` (the GLOBAL user id, plain TEXT with no
`REFERENCES`, exactly like `staff_profiles.user_id`: the members live in the core
database, so a foreign key would name a table this one does not have),
`service` (`drive` / `gmail` /
`calendar` / `chat`), `google_email` (which account, so a person with two can
tell them apart), `scopes` (**what Google actually granted**, not what we asked
for, somebody can untick a box, and a connection that quietly works for less
than it claims is how an assistant ends up saying "there is nothing in that
folder" about a folder full of things), the two token columns, `last_used_at`,
`last_error`, **`scope_mode` and `scope_event_types`** (below), and the audit
block.

- **`scope_mode`** (`everything` / `only`, migration
  `0058_what_this_person_lets_us_read`) is **how much of this connection kwapso
  may read**, and it exists because one table could not carry two opposite
  meanings of silence. The containers themselves are rows in `google_sources` —
  a calendar and a Gmail label sit beside the folder, the file and the space —
  but "this person has named nothing" already means *read nothing* there, and on
  Gmail and Calendar it has always meant *read everything*. Without the mode,
  switching off a last named label would hand somebody their whole mailbox back
  through a gesture that reads as a narrowing. `everything` is the default and is
  bit-for-bit what every connection did before the column existed; `only` reads
  the named containers and nothing else, and `only` with nothing named reads
  **nothing**, which the screen says in those words.

  It earned itself on **25 August 2026**: a live password was said out loud on a
  call, transcribed into the meeting notes and indexed. The fix offered was a
  credential SCANNER over transcripts and the owner refused it — "no it should
  not scan anything.. give content as it is" — because a scanner tuned to catch a
  spoken secret also silently drops real material. So the lever is scope: the
  answer to "that should never have been read" is "that source was never in
  scope".

- **`scope_event_types`** is a space-separated allow-list in **Google's own
  words** (`default`, `outOfOffice`, `focusTime`, `workingLocation`, `birthday`,
  `fromGmail`), the same shape as `scopes` above it, passed straight to
  `events.list` as repeated `eventTypes`. `''` means every kind and is the only
  way to spell it — the door refuses an *empty list*, because "untick them all"
  would otherwise round-trip back into "every kind" and be a second way for a
  narrowing gesture to widen. It is a column rather than a `google_sources` row
  because an event type is not a container: nobody shared it, it has no shelf, no
  client and nothing to link to.

- **The narrowing is applied by GOOGLE, never by us.** A label becomes `labelIds`
  on the search, a calendar becomes the calendar in the URL, a kind becomes
  `eventTypes` — so material out of scope is never fetched. A thing that was
  fetched and then discarded has still been fetched, and has still been through
  this worker's logs and memory on the way to being dropped. One seam reads the
  decision (`googleScope`) and every mail and calendar read in the worker goes
  through it — the knowledge sweep, the meetings sync, the events door and the
  mail door alike — proved by a census in
  `workers/content/test/google-scope.test.ts` rather than by convention.

- **The tokens are ciphertext in the column**, not merely at rest under
  Cloudflare's disk encryption. A refresh token is a standing key to somebody's
  mailbox that survives their password change, and this database is reachable by
  anything holding the account's D1 REST token, a backup, an export, a debug
  query. AES-GCM with a fresh IV per value, the key in a secret the database has
  no copy of (`GOOGLE_TOKEN_KEY`). A dump of this table without that secret is a
  table of email addresses. One file reads them back
  (`workers/content/src/lib/google-crypto.ts`), and no read a screen sees can
  select one, the public column list is the enforcement, and a test proves it.
- **`UNIQUE (user_id, service) WHERE deactivated_at IS NULL`**, one live
  connection per person per service, on the database rather than in a handler.
  Connecting is a browser round-trip a person can genuinely finish twice (two
  tabs, an impatient second click), and a read-then-write would make two rows
  holding two refresh tokens, one of which nothing would ever revoke
  (CONCURRENCY rule 2). Partial, so disconnecting and connecting again, the
  ordinary way somebody fixes a broken grant, is still allowed.

**`google_sources`**, the containers one person named: the Drive FOLDERS, the
individual Drive FILES, the Chat SPACES — and, since `0058`, the CALENDARS and
the Gmail LABELS. Drive is not "your Drive" and Chat is not "your Chat": both are
reached only through rows here, so the unnamed rest is out of reach by
construction rather than by a filter somebody has to remember to write.

**The two newer kinds are the mirror image, and the verb is the difference.** A
Drive folder is SHARED — nothing in a Drive is in reach until somebody hands it
over. A calendar or a label is SCOPED — everything is in reach the moment the
connection exists, and naming one is how a person says "this, and not the rest".
Same table, same audit, same switch; which meaning applies is
`google_connections.scope_mode`, above, and never the emptiness of this list.

Mail also still carries a second, older fence on the interactive door: only mail
to or from a **known contact** (an address on one of the team's `accounts`). That
one is the PRODUCT's rule about what that door is for; `scope_mode` is the
PERSON's rule about their own mailbox. They are different questions and both are
passed to Gmail. (The knowledge SWEEP does not apply the contact fence — the
owner opened his mailbox to it on 20 Aug 2026 — so the two doors disagree, which
predates scope and is written down here rather than quietly reconciled.)

- **`kind`** (`folder` / `file` / `space` / `calendar` / `label`, the last two
  from `0058_what_this_person_lets_us_read`; the split of the first two by
  `0035_calendar_depth_and_file_shares`) splits what used to be one word. Sharing
  was folder-wise only, which meant sharing one contract meant sharing everything
  filed beside it. The fence does not change shape — what is named is the only
  thing readable — and a named file is exactly one file, ignored by the search
  term because somebody who shared one document has already narrowed it as far as
  narrowing goes.

- **`shelf`** (`private` / `team`) is the answer to the question the design round
  said we must answer at the moment of sharing: who will be able to read this?
  A SCOPED row is always `private` and the form never asks: mail and a calendar
  are filed as one person's material everywhere else in the module, and offering
  a choice nothing downstream honours is the switch that decides nothing (R36).
  It is stored on the source rather than inferred later, because "I thought that
  folder was just mine" is the failure the column exists to prevent. It defaults
  to `private`, the safe answer is the one you get by not deciding, and it
  rides the activity sentence as well as the row, so "who could read this?" is
  answerable six months later.
- `user_id` is denormalised off the connection: every read here is "mine", and a
  join to answer the cheapest question in the module would be a join on every
  list.

**Permissions: two modules. It was three.** `google` (read what you shared ·
**create = connect an account**, name a folder or space, and say how much of a
mailbox or a calendar may be read · edit = write back
through it · delete = disconnect or stop sharing), plus `google_mail`, which
exists to carry ONE right: may kwapso send mail as you. Separate from `agent`, so
granting somebody the assistant does not grant the assistant their outbox. A
module whose four rights are not all meaningful is not new here: nothing reads
`agent:edit` either.

**`google_events` was the third and is gone** (migration
`0038_calendar_one_way`). It carried "kwapso may put an EVENT in your calendar",
and the calendar became read-only on 18 August 2026 — so it guarded nothing. A
switch that switches nothing is worse than no switch: somebody grants it, expects
a capability, and gets silence. The migration deletes its `role_permissions` rows
from every existing team.

**Not importable** (two `CATALOG_EXEMPT` lines). A connection is a CAPABILITY,
not a record, the row is worthless without the token inside it, and that token
can only be minted by a person standing at Google's consent screen saying yes.
The switch module has no rows at all.

**No client-portal exposure, on any door.** Clients get no assistant and no
Google surface; every handler opens with `refusePortalCaller` and both tables are
`fence: null` in `PORTAL_ACTIVITY_FENCE`.

### chat_people. KEEP (BUILT 2026-08-20, team migration `0049_chat_people`). THE NAMES CHAT ARRIVES WITHOUT

Google Chat names a message's sender `users/<number>` and offers no scope that
turns the number into a person — the roster comes back nameless, and the People
API answers only for the caller's own contacts. The ONE route to a name is the
conversation itself: when somebody writes an @mention, Google attaches an
annotation carrying the display name. This table remembers what was learned
(`user_id` → `display_name`, with `learned_at` and `learned_from`), so a
message filed into the knowledge base reads "a person said this" rather than a
number, and a name survives the request it was learned in. Four columns, no
audit ceremony: it grows with PEOPLE, not with messages, and a row is a cached
fact, not a record anybody curates.

---

## Status: what's built vs. to build

- **Built**: users, teams, team_members, invite_index, member_roles,
  role_permissions, selectable_data, activity (table only), team_module_databases,
  db_alerts, db_growth (GLOBAL core `0022`. See below), login_codes (+ `sent_ip` / `sends`, 0015, the send throttle's own
  ledger: WHO asked for each code and how many emails that row has caused, so a
  rotation is counted like a mint), sessions (+ `team_pin`, 0013), account_activity, email_change_logs +
  email_change_codes (the hashed-OTP split; BUILT 2026-06-17), invite_logs
  (per-team audit; BUILT 2026-06-22, M4). **Agent-modules build (BUILT
  2026-06-23)**: importable_databases, agent_usage, agent_credits, mcp_tokens (GLOBAL core
  0008/0009/0010); help, help_threads,
  data_import_sessions, agent_threads, agent_messages (per-team `0004_modules`).
  **Knowledge base (BUILT 2026-08-11, retrieval rebuilt 2026-08-12)**:
  knowledge_sources, knowledge_chunks, knowledge_terms, knowledge_ingest
  (per-team `0012_knowledge` + `0020_knowledge_vectors`). The search itself lives
  in Vectorize. See R26 and BOOTSTRAP.md §3b.
  **Since:** agent_usage_log (GLOBAL core `0011`, BUILT 2026-07-01), error_logs
  (GLOBAL core `0012`, the central error store, BUILT 2026-07-03),
  data_import_batches (per-team `0006_import_batches`, the agentic multi-file
  import, BUILT 2026-07-04), the customer spine, accounts + account_links +
  portal_users (per-team `0007_customer_spine`, BUILT 2026-08-09), and
  `portal_users.current_account_id` (per-team `0008_portal_current_account`,
  BUILT 2026-08-10; see below). **The work engine (BUILT 2026-08-11):**
  `help.account_id` (`0009_help_account`), the Tickets rename's data half
  (`0010_ticket_vocabulary`), and the ticket's work-engine columns + `ref_counters`
  (`0011_ticket_work_engine`). **And since (all per-team):** process maps + the two
  rate cards (`0013_process_maps_and_money`), stories + sprints
  (`0014_stories_and_sprints`), work logs (`0015_work_logs`), to-dos + tasks
  (`0016_todos_and_tasks`), triage duty (`0017_triage_duty`), the agency's own
  housekeeping (`0018_agency_internal`), Google connections
  (`0019_google_connections`), the knowledge base's vector columns
  (`0020_knowledge_vectors`) and meetings (`0021_meetings`).
  **The purge (17 Aug 2026):** `0025_purge_learning_marketing_programmes` adds
  the four enrichment columns to `selectable_data`, folds the ten programmes onto
  the sprint types and drops `learning`, `learning_progress`, `marketing_posts`
  and `programs`; `0026_retire_duplicate_dropdown_values` retires the 26
  duplicated dropdown values a team born before the seed was guarded still
  carries. Both are described in full under `selectable_data` above. The CREATE
  statements for those four tables also left migrations `0004` and `0018`
  themselves, so a database built from the file today never has them, `0025`
  drops them `IF EXISTS`, for the teams that ran the old versions.
- **The per-team migration list is `TEAM_MIGRATIONS` in
  `workers/tenancy/src/team-schema.ts`**, **fifty-five today (26 Aug 2026),
  `0001_team_base` through `0055_transcript_gives_up`** (this line has now
  drifted twice — it said "eleven, through `0011_ticket_work_engine`" while the
  sections above documented `0012` to `0020`, then "twenty-seven, through
  `0027_task_admin`" for another twenty-eight; a count in prose beside the list
  it counts is a copy that only ever drifts one way, so trust the file's own
  count over this sentence). A new team's database runs all of them at creation; existing
  teams get the gap rolled to them by `POST /api/tenancy/admin/migrate-teams`.
  **That file is the source; any list written down elsewhere, here, OPERATIONS,
  BOOTSTRAP, EDGE-CASES, is a copy of it, and the copy is the one to distrust.**
- **To build (tables)**: selectable_data_types (the only remaining one), the
  global authoritative dropdown-GROUP list.

Open questions Q1–Q4 (audit scope, selectable types, activity design, role
defaults) were resolved before the foundation build; the "(later)" questions are
now resolved too, import details are the 3-stage `data_import_sessions`, and
`importable_databases` stayed SEPARATE from the recipe/config system (an
owner-maintained catalog).

---

## Resolutions (2026-06-13), cross-cutting model LOCKED

- **Q1 Audit block → full block on every DATA table** (global core + per-team).
  Pure system/auth tables (sessions, login_codes) stay light, no meaningful
  actor. Actor name+email are point-in-time snapshots.
- **Q2 Dropdowns → global standard GROUPS + per-team VALUES.** The group list
  (file type, ticket type, ticket status, + any the base needs)
  is global + standard so code can rely on a group existing; values inside each
  group are per-team and editable, seeded with defaults. (`selectable_data_types`
  = global; `selectable_data` = per-team, as built.)
- **Q3 Activity → log EVERYTHING (Glide breadth): creations, edits,
  activations/deactivations, and system milestones** (member joined, invite
  sent/accepted, import stage done). Reference the subject row by a **generic
  `(related_table, related_row_id)` pair**, assumption: generic over Glide's
  one-column-per-table, because it scales to any future module without schema
  changes and matches our anti-bloat rule. (Supersedes the earlier
  "edits/deactivations only" rule.)
- **Q4 Roles → Admin locked + team always keeps ≥1 Admin; Viewer is a normal
  editable/deactivatable role.** EDGE, sole admin: the server REFUSES any change
  that would drop a team below one active Admin, and no one can remove or demote
  themselves, so a SOLE admin can't currently leave or be offboarded until they
  promote another member to Admin first. An explicit transfer-ownership /
  leave-team flow (and what becomes of a fully-empty team) is future work, not
  designed, not scheduled, and deliberately not written down as a plan anywhere
  else (this paragraph is the record of it; ROADMAP.md is a closed build history
  and never covered it). Until then the team simply never reaches zero admins. Role changes are direct, instant server
  actions. Glide's async "updated role id + webhook complete" two-step is
  dropped (it was a Glide limitation we don't have).

Resolved in the agent-modules build (2026-06-23): the import-session details
shipped as `data_import_sessions` (the 3-stage session); and
`importable_databases` stayed SEPARATE from the recipe/config system (the locked
decision above).
