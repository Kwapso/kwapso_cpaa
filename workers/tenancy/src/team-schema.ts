// THE master definition of what lives inside every team's own database, plus
// the seed rows a newborn team starts with (mirrors the user's Glide Base v3).
// Adding a future team-table = appending a migration here; the migration
// runner (POST /api/tenancy/admin/migrate-teams) rolls it to every team.

import { sqlString } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { TASK_DEPARTMENTS } from "@shared/departments"
import { APP_STAGES } from "@shared/app-stages"
import { DELIVERABLE_KINDS, SELECTABLE_GROUPS } from "@shared/selectable-groups"

// The module list itself lives in shared/team-modules.ts — data-ops builds the
// import/export permission-matrix columns from the SAME list, so the matrix a
// role screen shows and the matrix a CSV carries can never drift apart.
// Re-exported here so tenancy code keeps its one habitual import site.
import { TEAM_MODULES } from "@shared/team-modules"
export { TEAM_MODULES, TEAM_MODULE_CATALOG } from "@shared/team-modules"

/** The two groups the legacy app never had, as data rather than as a UNION ALL
 * chain — see the comment in 0018. Countries are the ones the customer records
 * themselves evidence; the ten legacy labels pick-or-create into the same group
 * when the choices import runs. */
const INTERNAL_VOCABULARY: { type: string; value: string }[] = [
  { type: "Country", value: "Germany" },
  { type: "Country", value: "Austria" },
  { type: "Country", value: "Switzerland" },
  { type: "Country", value: "Spain" },
  { type: "Country", value: "Andorra" },
  { type: "Country", value: "United Kingdom" },
  { type: "Company size", value: "1–10" },
  { type: "Company size", value: "11–50" },
  { type: "Company size", value: "51–200" },
  { type: "Company size", value: "201–500" },
  { type: "Company size", value: "More than 500" },
]

/** The vocabulary a COMPANY record picks from — the industry it is in, and the
 * word for where the relationship stands. Both are ordinary dropdown values a
 * team edits on its own screen; these are a starting set, not an enum. The three
 * statuses are the words the front end reads (SCOPE: an active client, a past
 * client, one that is put away) — stored as written, tidied for display by
 * `accountStatus` rather than mapped through a table that would need keeping in
 * step with whatever a team renames them to. */
const COMPANY_VOCABULARY: { type: string; value: string }[] = [
  { type: "Industry", value: "Manufacturing" },
  { type: "Industry", value: "Retail" },
  { type: "Industry", value: "Hospitality" },
  { type: "Industry", value: "Professional services" },
  { type: "Industry", value: "Construction" },
  { type: "Account status", value: "active_client" },
  { type: "Account status", value: "past_client" },
  { type: "Account status", value: "archived" },
]

/** THE SPRINT-TYPE CATALOGUE — the ten ways the agency runs an engagement.
 *
 * These rows used to be the `programs` table behind the Delivery method page.
 * The page went on 17 Aug 2026 and the DATA did not: a programme was never
 * anything but "the kind of block this sprint is", which is the question the
 * sprint type already answers, so the two were one idea wearing two names. What
 * the programme carried and the sprint type did not is here — the mark somebody
 * recognises it by, the German name the agency already uses with its German
 * clients, the sentence that explains what the block includes, and how long one
 * normally runs. That is what lets a sprint say "Implementation, 21 days".
 *
 * A STARTING vocabulary, like the ticket types: every field is editable on the
 * team's own Dropdown values screen, and a team that has retired one keeps it
 * retired (the seed and migration 0025 are both pick-or-create).
 *
 * `standardDays` is a suggestion, never a rule — a sprint's real dates are the
 * ones somebody agreed with the client. `nameDe` is the ONE curated label
 * carried across from the legacy catalogue, because these words were already in
 * front of German clients; every other language comes from the translation
 * layer, which is why there is no third column here and never will be.
 * `Assessment` arrives bare — the legacy row had no mark, no German name and no
 * length, and inventing three would be worse than carrying a thin row honestly. */
export const SPRINT_TYPE_CATALOGUE: {
  value: string
  mark: string | null
  nameDe: string | null
  description: string | null
  standardDays: number | null
}[] = [
  { value: "Assessment", mark: null, nameDe: null, description: null, standardDays: null },
  { value: "Diagnostic", mark: "🔎", nameDe: "Prozessanalyse", description: "We map the organisation around the solution, the tool stack, the data architecture, the way the work is done today and the main user stories behind it, and we set out what it costs in time and money now, alongside the needs and expectations.", standardDays: 14 },
  { value: "Process Optimization", mark: "🎯", nameDe: "Prozessoptimierung", description: "Working from the diagnostic, we design the improved process, removing steps, simplifying them, automating them, and produce the assets and the solution paper that meet the needs and expectations and bring the running cost down.", standardDays: 7 },
  { value: "Data Migration", mark: "🗂️", nameDe: "Datenpflege", description: null, standardDays: 7 },
  { value: "Foundation", mark: "🛠️", nameDe: "Fundament", description: "Your data, in your app. This is the foundation everything else is built on.", standardDays: 7 },
  { value: "Implementation", mark: "💎", nameDe: "Umsetzung", description: "We build everything designed during the process optimization, on top of the foundation.", standardDays: 21 },
  { value: "Validation", mark: "👀", nameDe: "Validierung", description: "The stakeholders watch the walkthrough, and at the end of the week we meet so you can show us how you use the app. We answer your questions, find what can still be improved, and write the tickets together, though you can raise one at any moment.", standardDays: 14 },
  { value: "Refinement", mark: "✨", nameDe: "Anpassung", description: null, standardDays: 14 },
  { value: "Training", mark: "🎓", nameDe: "Schulung", description: "One live online training with the main stakeholders, and a follow-up meeting a few days later to answer what came up.", standardDays: 7 },
  { value: "Enhancement", mark: "🚀", nameDe: "Erweiterung", description: "An enhancement cycle adds new steps around what is already live, better automations, new screens, new user stories. It covers a fixed number of tickets and is priced on its own. It opens with one clarification and ideation meeting where we adjust the process map and agree expectations, and closes with a recording of what was built and one follow-up meeting for questions and training.", standardDays: 21 },
]

export const TEAM_MIGRATIONS: { version: string; sql: string }[] = [
  {
    version: "0001_team_base",
    sql: `
CREATE TABLE _migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE member_roles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);

-- Tall permission sheet (locked): role | module | the four switches.
CREATE TABLE role_permissions (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES member_roles (id),
  module TEXT NOT NULL,
  can_read INTEGER NOT NULL DEFAULT 0,
  can_create INTEGER NOT NULL DEFAULT 0,
  can_edit INTEGER NOT NULL DEFAULT 0,
  can_delete INTEGER NOT NULL DEFAULT 0,
  UNIQUE (role_id, module)
);

CREATE TABLE selectable_data (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);

-- Activity log (locked rule: edits, deactivations, activations ONLY —
-- creations live on each row's own audit columns, deletes don't happen).
CREATE TABLE activity (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  related_table TEXT,
  related_row_id TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT
);
CREATE INDEX idx_activity_related ON activity (related_table, related_row_id);
`,
  },
  {
    // Screen-engine config: a team's per-screen recipe OVERRIDES. The base
    // recipes ship in app code (one definition every team inherits); a row here
    // overrides one screen for THIS team — the runtime-editable layer that lets
    // an admin/agent reshape a screen with no deploy. `recipe` is opaque JSON to
    // the worker (the web app owns the ScreenRecipe shape + validates it).
    version: "0002_screens",
    sql: `
CREATE TABLE screens (
  module TEXT PRIMARY KEY,          -- the screen/recipe key, e.g. "members" | "member_roles"
  recipe TEXT NOT NULL,             -- a ScreenRecipe as JSON (overrides the base)
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT
);
`,
  },
  {
    // Per-team invite audit (DATA-MODEL §invite_logs). The full record for an
    // invite lives HERE in the team DB: a frozen inviter snapshot + the invitee +
    // the proposed role + shelf life + acceptance stamp. The GLOBAL invite_index
    // stays the thin routing copy (find invites by email without opening team DBs);
    // its `invite_row_id` is this row's id. `shelf_life_in_hours` defaults to 168
    // (the 7-day expiry). Acceptance is stamped when the invite is accepted.
    version: "0003_invite_logs",
    sql: `
CREATE TABLE invite_logs (
  id TEXT PRIMARY KEY,                       -- = invite_index.invite_row_id
  inviter_user_row_id TEXT,
  inviter_email TEXT,
  inviter_full_name TEXT,
  inviter_image TEXT,
  invitee_user_row_id TEXT,                  -- null if they have no account yet
  invitee_email TEXT NOT NULL,
  proposed_member_role_id TEXT NOT NULL,
  created_on TEXT NOT NULL,
  shelf_life_in_hours INTEGER NOT NULL DEFAULT 168,
  invite_accepted INTEGER NOT NULL DEFAULT 0,
  invite_acceptance_timestamp TEXT
);
`,
  },
  {
    // The next-build modules (help + import + the agent's saved conversations),
    // all per-team. See AGENT-MODULES-PLAN.md + the design notes.
    // Tickets are team-wide (My/All tabs = a creator filter, no row-level privacy).
    // Agent conversations get their OWN tables (not help's). Module file storage
    // lives in per-module R2 buckets with a per-team key prefix (not in D1).
    //
    // THIS MIGRATION USED TO CREATE `learning` AND `learning_progress` TOO.
    // The Learning module was purged on 17 Aug 2026 (the owner's ruling: the
    // material had already been indexed into the knowledge base, so the module
    // was a second home for words that had a first one). The CREATEs are gone
    // from HISTORY rather than merely dropped afterwards, because a fresh clone
    // must not rebuild the module even for a moment — and 0025 drops the tables
    // for the teams that already ran this version. Git history keeps the shape
    // for anyone who needs to read it; this file is what a new database becomes.
    version: "0004_modules",
    sql: `
-- Tickets (team-wide). The built-in status (open/in_progress/resolved/
-- reopened) is the source of truth the code trusts; help_type is a cosmetic
-- selectable value. source_* captures the screen/record a ticket was raised from.
CREATE TABLE help (
  id TEXT PRIMARY KEY,
  help_type TEXT,
  description TEXT NOT NULL,
  screen_recording_link TEXT,
  source_screen TEXT,
  source_related_table TEXT,
  source_related_row_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  resolved INTEGER NOT NULL DEFAULT 0,
  resolved_at TEXT,
  resolver_id TEXT, resolver_email TEXT, resolver_name TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT
);
CREATE INDEX idx_help_creator ON help (creator_id);
CREATE INDEX idx_help_status ON help (status);

-- Threaded replies on a ticket. tagged_user_ids = JSON array (mention = notify
-- only). is_agent marks the AI-drafted first reply.
CREATE TABLE help_threads (
  id TEXT PRIMARY KEY,
  help_id TEXT NOT NULL REFERENCES help (id),
  message_body TEXT NOT NULL,
  tagged_user_ids TEXT,
  is_agent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT
);
CREATE INDEX idx_help_threads_help ON help_threads (help_id);

-- The 3-stage data import (file validation -> extraction -> import via API) +
-- completion. table_id/name point at the GLOBAL importable_databases target;
-- preview_json is what the owner reviews before the write.
CREATE TABLE data_import_sessions (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  table_name TEXT,
  required_columns_json TEXT,
  auto_populate_columns_json TEXT,
  column_mapping_json TEXT,
  overall_status TEXT NOT NULL DEFAULT 'started',
  uploaded_file_url TEXT,
  file_validated INTEGER NOT NULL DEFAULT 0,
  extraction_response TEXT,
  extraction_status_code INTEGER,
  preview_json TEXT,
  extraction_complete INTEGER NOT NULL DEFAULT 0,
  import_response TEXT,
  import_initiated INTEGER NOT NULL DEFAULT 0,
  import_response_code INTEGER,
  import_complete INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT
);

-- Saved agent conversations (per-team, the agent's memory). OWN tables, distinct
-- from help_threads (ticket-shaped). agent_messages records each turn + the
-- tool-calls (actions) the agent took, and the source (in-app vs which MCP client).
CREATE TABLE agent_threads (
  id TEXT PRIMARY KEY,
  title TEXT,
  last_message_at TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT
);
CREATE INDEX idx_agent_threads_creator ON agent_threads (creator_id);

CREATE TABLE agent_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES agent_threads (id),
  role TEXT NOT NULL,
  content TEXT,
  tool_calls_json TEXT,
  source TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_agent_messages_thread ON agent_messages (thread_id);
`,
  },
  {
    // Manually-added ticket stakeholders. Add-only by design (no edit/remove path):
    // the raiser, team admins, and thread @mentions are DERIVED at read time and are
    // not stored here — only explicit manual adds live as rows.
    version: "0005_help_stakeholders",
    sql: `
CREATE TABLE help_stakeholders (
  id TEXT PRIMARY KEY,
  help_id TEXT NOT NULL REFERENCES help (id),
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  UNIQUE (help_id, user_id)              -- adding the same person twice is a no-op
);
CREATE INDEX idx_help_stakeholders_help ON help_stakeholders (help_id);
`,
  },
  {
    // Agentic multi-file import (AGENTIC-IMPORT.md). A BATCH groups several uploaded
    // files, the agent-built PLAN (targets, mappings, normalization, references,
    // dependency order), and the per-row REPORT — all as JSON here. Per-file parsing
    // reuses the single-target session engine; this table is the batch shell.
    // Creator-scoped like data_import_sessions (a batch belongs to who started it).
    version: "0006_import_batches",
    sql: `
CREATE TABLE data_import_batches (
  id TEXT PRIMARY KEY,
  overall_status TEXT NOT NULL DEFAULT 'draft',   -- draft|analyzing|planned|running|complete
  files_json TEXT,          -- [{fileId,name,headers,sampleRows,rowCount,rawRows}]
  plan_json TEXT,           -- the agent plan (steps, order) the user reviews
  report_json TEXT,         -- the per-target result + rejections
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, completed_at TEXT
);
CREATE INDEX idx_import_batches_creator ON data_import_batches (creator_id, created_at DESC);
`,
  },
  {
    // THE CUSTOMER SPINE (SCOPE ch.03 "People — one table" + ch.05 "Data model").
    // Every company and every person is ONE row in `accounts`; `account_type`
    // says which. Nothing else in the app gets a second people-table.
    version: "0007_customer_spine",
    sql: `
-- The hierarchy is a SELF-POINTER with unlimited depth (a holding company's
-- businesses, a business's divisions). A move that would close a loop is refused
-- by the write itself — the cycle test rides the UPDATE's WHERE (lib/accounts.ts
-- setAccountParent), so two people re-parenting at the same instant cannot
-- co-operate their way into a ring that makes roll-ups count twice or run forever.
--
-- \`code\` is the human REFERENCE staff assign when work starts (BERG). Unique so
-- two people can't mint the same one at the same instant (CONCURRENCY rule 2),
-- nullable because most rows never earn one — and NEVER an identifier: every
-- route addresses a row by its ULID \`id\`, so re-coding an account can never
-- re-point its tickets, its files or its history.
--
-- \`status\` is the commercial lifecycle (prospect → client → past client), an
-- editable vocabulary. \`deactivated_at\` is ARCHIVE — the everyday remove, which
-- keeps the row, its children and its history intact.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  account_type TEXT NOT NULL CHECK (account_type IN ('entity', 'individual')),
  parent_account_id TEXT REFERENCES accounts (id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  code TEXT,
  currency TEXT,
  locale TEXT,
  timezone TEXT,
  commercials_visible INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT,
  CHECK (parent_account_id IS NULL OR parent_account_id <> id)
);
-- The race guard: two staff assigning "BERG" at the same instant. Partial, so the
-- (many) rows with no code don't collide with each other.
CREATE UNIQUE INDEX idx_accounts_code ON accounts (code) WHERE code IS NOT NULL;
CREATE INDEX idx_accounts_parent ON accounts (parent_account_id);
CREATE INDEX idx_accounts_name ON accounts (name);

-- A PERSON's relationship to an account. This is what the parent pointer cannot
-- say: Marta is a contact of Bergman AND of Delaval, and a single parent has room
-- for only one of them. "Contact" is a role word, not a table — it is THIS row.
CREATE TABLE account_links (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id),        -- the company side
  person_account_id TEXT NOT NULL REFERENCES accounts (id), -- the person's own row
  relationship TEXT,                                        -- "Operations manager"…
  is_main_stakeholder INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT,
  CHECK (account_id <> person_account_id)
);
-- Race guard: two staff adding the same person to the same company at once. Partial
-- on ACTIVE rows, so unlinking and re-linking later is allowed (the old row stays).
CREATE UNIQUE INDEX idx_account_links_pair ON account_links (account_id, person_account_id) WHERE deactivated_at IS NULL;
CREATE INDEX idx_account_links_person ON account_links (person_account_id);

-- THE LOGIN SWITCH. Linking and logging in are fully independent: an individual can
-- be linked with no login, and a freelancer can hold a login on their own account
-- with no parent. Granting writes a row here and sends the invite; REVOKING
-- deactivates it — login dies, every record stays (SCOPE ch.06 offboarding). The
-- audit block IS the grant record: creator_* is who granted it, deactivator_* is
-- who revoked it, so there is no second granted_by column to keep in step.
-- app_restriction: null = the whole account's world.
CREATE TABLE portal_users (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id),
  user_id TEXT NOT NULL,
  app_restriction TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);
-- Race guard AND the pin itself: at most ONE live grant per person, so the guard
-- corridor always resolves a caller to exactly one account set. Two concurrent
-- grants can't leave a person straddling two fences.
CREATE UNIQUE INDEX idx_portal_users_user ON portal_users (user_id) WHERE deactivated_at IS NULL;
CREATE INDEX idx_portal_users_account ON portal_users (account_id);

-- Existing teams: the locked Admin role gains the two new modules in full (it is
-- DEFINED as full access, and it can't be edited afterwards to grant them). Every
-- other role gains nothing — a migration must never hand out sight of customer
-- data that nobody granted. \`is_default\` is 1 on Admin alone, so it doubles as
-- the bit. New teams don't reach this: their seed writes the rows already.
INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
SELECT lower(hex(randomblob(16))), r.id, m.module, r.is_default, r.is_default, r.is_default, r.is_default
  FROM member_roles r
  CROSS JOIN (SELECT 'accounts' AS module UNION ALL SELECT 'portal_users') m
 WHERE NOT EXISTS (
   SELECT 1 FROM role_permissions p WHERE p.role_id = r.id AND p.module = m.module
 );
`,
  },
  {
    version: "0008_portal_current_account",
    sql: `
-- A client login stands in ONE company at a time and switches between them
-- (owner decision, 10 Aug 2026) — the same bargain the team switcher makes.
-- This is that pointer, and nothing more: it NARROWS the fence to one of the
-- companies the person already belongs to, it can never widen it. NULL means
-- "not chosen yet", which the guard corridor reads as their first company, so
-- every existing grant keeps working without a backfill.
ALTER TABLE portal_users ADD COLUMN current_account_id TEXT REFERENCES accounts (id);
`,
  },
  {
    version: "0009_help_account",
    sql: `
-- WHOSE QUESTION IS THIS? (owner decision, 11 Aug 2026.) A client contact used
-- to see only the tickets they personally raised, because the only thing on the
-- row that could fence them was \`creator_id\`. At a real client the finance
-- person and the ops person were invisible to each other, which is not what a
-- company's portal means. The owner's ruling: a contact sees their COMPANY's
-- world — the company they are standing in and everything nested beneath it,
-- which is the account fence, already written, already tested.
--
-- So the ticket carries the account it was raised for, and the fence becomes the
-- ORDINARY one (\`accountScopeClause\`) instead of a second idea of who you are.
-- A staff-raised ticket stays NULL: it belongs to no client, and NULL never
-- matches an IN list, so the agency's own questions stay the agency's.
ALTER TABLE help ADD COLUMN account_id TEXT REFERENCES accounts (id);
CREATE INDEX idx_help_account ON help (account_id);

-- BACKFILL, in the SAFE direction. An existing ticket has no record of which
-- company it was raised for (the raiser may belong to two), so guessing a
-- company could hand one client another's question — the exact failure this
-- change exists to end. Instead each old ticket lands on its raiser's OWN person
-- row, which is inside that person's fence and nobody else's unless their record
-- genuinely hangs under the company. Old tickets therefore keep EXACTLY today's
-- visibility; the widening starts with the next question raised.
UPDATE help SET account_id = (
  SELECT pu.account_id FROM portal_users pu WHERE pu.user_id = help.creator_id
   ORDER BY (pu.deactivated_at IS NULL) DESC LIMIT 1
) WHERE account_id IS NULL AND creator_id IS NOT NULL;
`,
  },
  {
    version: "0010_ticket_vocabulary",
    sql: `
-- THE SECTION IS CALLED TICKETS (owner ruling, 11 Aug 2026). The dropdown
-- vocabulary carried the old name in its DATA, not its code: every team's
-- selectable_data holds rows typed 'Help type' and 'Help status', and that
-- string is what the Dropdown values screen prints as a group heading and what
-- the ticket form filters on. Renaming the seed alone would rename it for teams
-- created AFTER this deploy and leave every existing team's type picker empty,
-- because the reader looks for the new name and the rows still say the old one.
--
-- So the rows move too. Only the LABEL changes — each value ('Bug report',
-- 'resolved') and each id is untouched, so a ticket that already names a type
-- goes on naming it.
UPDATE selectable_data SET type = 'Ticket type' WHERE type = 'Help type';
UPDATE selectable_data SET type = 'Ticket status' WHERE type = 'Help status';

-- The same sentence about the screen-recipe store, which is keyed by the recipe
-- key and whose key changed with the URL segment ('help.list' -> 'tickets.list').
-- A team that had reshaped its ticket list would find its override silently
-- ignored: the resolver would ask for a key nobody wrote and fall back to the
-- base recipe. INSERT OR IGNORE-shaped on purpose — if somebody has already
-- written the new key, theirs wins and the stale row is dropped.
UPDATE OR IGNORE screens SET module = 'tickets.list' WHERE module = 'help.list';
DELETE FROM screens WHERE module = 'help.list';
`,
  },
  {
    // THE WORK ENGINE, part one: the ticket grows into the thing SCOPE ch.07
    // describes. Columns on the table that already exists, never a second ticket
    // beside it — a second one means a second conversation, a second fence, a
    // second activity trail and two things called a ticket forever.
    version: "0011_ticket_work_engine",
    sql: `
-- The five states (SCOPE ch.07: new -> triaged -> in progress -> ready ->
-- resolved). The two old names move onto the two new ones that mean the same
-- thing: 'open' was a ticket nobody had read yet, which is 'new'; 'reopened' was
-- one a staff member had deliberately pulled back into play, which is 'triaged'
-- — it has been read, and it is not being worked on yet.
--
-- The redundant \`status <> \` half of each predicate is not decoration. A
-- migration is recorded in _migrations and runs once, but the one time anybody
-- types these statements again is during a recovery, by hand, under pressure —
-- and a status move that is safe to re-run is one less thing to be frightened of
-- then. It is also the law the rest of the file lives under (R17).
UPDATE help SET status = 'new' WHERE status = 'open' AND status <> 'new';
UPDATE help SET status = 'triaged' WHERE status = 'reopened' AND status <> 'triaged';

-- THE REFERENCE NUMBER (SCOPE ch.02, "BERG-T0412"). Per ACCOUNT, not global:
-- Glide's are global and fully interleaved, so continuity was never on offer, and
-- a number a client quotes should count THEIR requests, not ours and every other
-- client's. Nullable because most of the agency's own tickets have no account and
-- no code to build one from — a ticket with no client has nobody to quote it to.
ALTER TABLE help ADD COLUMN ref TEXT;
-- The race guard AND the promise: two people raising a ticket on one account at
-- the same instant cannot end up quoting the same number. Partial, so the many
-- rows with no ref don't collide with each other.
CREATE UNIQUE INDEX idx_help_ref ON help (ref) WHERE ref IS NOT NULL;

-- DRAG-RANK — the only priority signal there is (SCOPE ch.07: no priority
-- dropdown, ever). Sparse text keys, so moving one ticket writes one row; see
-- shared/workers/rank.ts for why it is a string.
ALTER TABLE help ADD COLUMN rank TEXT;
-- Every existing ticket starts ranked by its own id, which is a ULID and
-- therefore already in the order they were raised. So the list looks EXACTLY as
-- it did the moment before this migration ran, and the first drag is the first
-- change anybody sees.
UPDATE help SET rank = id WHERE rank IS NULL;
CREATE INDEX idx_help_rank ON help (rank);

-- THE LOCK (SCOPE ch.07: "editing and ranking lock at first staff touch"). The
-- account owns the wording while nobody here has read it; once we have, the
-- record of what they asked for stops moving under the conversation about it.
-- A timestamp rather than a flag, because "when" is the question anyone asks.
ALTER TABLE help ADD COLUMN locked_at TEXT;
-- A ticket that has already been worked is already locked — its wording was
-- settled long ago, and back-dating that to the row's own last edit is the
-- closest true answer available.
UPDATE help SET locked_at = COALESCE(updated_at, created_at) WHERE status <> 'new';

-- THE DRAFT REPLY the closing note of each story appends to (SCOPE ch.07,
-- "story close is a transaction"). It is a draft, not a message: it becomes a
-- reply only when a person sends it.
ALTER TABLE help ADD COLUMN draft_resolution TEXT;

-- ARCHIVE, available from any state (SCOPE ch.07) — the base's deactivate-never-
-- delete, wearing the word the glossary already uses for it.
ALTER TABLE help ADD COLUMN archived_at TEXT;
ALTER TABLE help ADD COLUMN archiver_id TEXT;
ALTER TABLE help ADD COLUMN archiver_email TEXT;
ALTER TABLE help ADD COLUMN archiver_name TEXT;

-- BOTH TITLES, kept (build brief §8). 1,764 of the tickets coming from Glide have
-- a German title, 1,010 English, and 788 exist ONLY in German. The original is
-- never overwritten by a translation — that is the whole reason there are two
-- columns rather than one column and a language flag.
ALTER TABLE help ADD COLUMN title_de TEXT;
ALTER TABLE help ADD COLUMN title_en TEXT;

-- THE REFERENCE COUNTER, one row per (account, kind of thing). Allocation is a
-- SINGLE statement — INSERT … ON CONFLICT DO UPDATE … RETURNING — so two
-- simultaneous writers cannot both read "11" and both write "12" (CONCURRENCY.md
-- rule 1: the counter rides the write, never a read-then-write).
CREATE TABLE ref_counters (
  account_id TEXT NOT NULL REFERENCES accounts (id),
  kind TEXT NOT NULL,                -- 'T' ticket, 'S' story, 'SPR' sprint, …
  next_no INTEGER NOT NULL,
  PRIMARY KEY (account_id, kind)
);

-- THE FOUR TICKET TYPES SCOPE names (feedback / bug / question / extra). Added,
-- never swapped: SCOPE calls this an EDITABLE list, and a team's existing types
-- are on tickets already — deleting them would blank the type of every ticket
-- that names one. The old values stay pickable until somebody retires them on
-- the Dropdown values screen, which is what that screen is for.
INSERT INTO selectable_data (id, type, value, is_default, created_at, creator_name)
SELECT lower(hex(randomblob(16))), 'Ticket type', v.value, 1, datetime('now'), 'kwapso'
  FROM (SELECT 'Feedback' AS value UNION ALL SELECT 'Bug' UNION ALL SELECT 'Question' UNION ALL SELECT 'Extra') v
 WHERE NOT EXISTS (
   SELECT 1 FROM selectable_data s WHERE s.type = 'Ticket type' AND s.value = v.value
 );
`,
  },
  {
    // THE KNOWLEDGE BASE — one knowledge base, many COMPARTMENTS, chosen for the
    // reader rather than by them (.plans/BUILD-2-knowledge-base.md §1).
    //
    // WHY THE VECTORS LIVE HERE, in the team's own database, rather than in one
    // account-wide index: "every vector, every chunk and every source row belongs
    // to exactly one team, and retrieval can never cross that line." A per-team
    // database makes that STRUCTURAL — a caller's guard resolves one database id
    // and the SQL cannot name another. An account-global index with a team id in
    // the metadata makes it a filter somebody wrote correctly today. The whole
    // argument, and what would change our mind, is at the top of
    // workers/content/src/lib/knowledge.ts.
    version: "0012_knowledge",
    sql: `
-- A SOURCE is one piece of material the assistant may read. Two families in one
-- table, because a person edits them in the same list:
--   • TYPED here (kind 'note') — the body IS the truth, written in the app;
--   • MIRRORED from a row we already own (kind 'ticket' / 'article' / 'account')
--     — the ROW is the truth and the sweep keeps the body in step with it.
-- Deactivating either means "stop reading this": the sweep SKIPS an excluded
-- source rather than re-adding it, which is what makes "take out something
-- wrong" stick. Deactivate-never-delete, so the decision and who made it survive.
--
-- \`compartment\` is the design in one column: 'agency' for our own material,
-- 'account:<id>' for one client's. DERIVED on write from the row the source
-- mirrors, correctable by hand, never free-typed.
--
-- \`owner_user_id\` is the second fence, and the one a personal Google connection
-- will land on: NULL means the team's (what the organisation can see), a value
-- means one person's. Retrieval ANDs it, so material that arrived through one
-- member's own sight of it cannot be read out of somebody else's answer.
CREATE TABLE knowledge_sources (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  origin_table TEXT,
  origin_row_id TEXT,
  compartment TEXT NOT NULL DEFAULT 'agency',
  account_id TEXT REFERENCES accounts (id),
  title TEXT NOT NULL,
  body TEXT,
  source_url TEXT,
  owner_user_id TEXT,
  content_hash TEXT,
  indexed_at TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);
-- The mirror's identity: ONE source per row mirrored, so a sweep that runs twice
-- — or two sweeps at once — updates rather than duplicates. Partial, because a
-- typed note has no origin and they must not collide with each other.
CREATE UNIQUE INDEX idx_knowledge_sources_origin ON knowledge_sources (origin_table, origin_row_id) WHERE origin_row_id IS NOT NULL;
CREATE INDEX idx_knowledge_sources_compartment ON knowledge_sources (compartment);

-- A CHUNK is a readable piece of a source: what retrieval scores, and what an
-- answer cites. \`embedding\` is the quantised vector (lib/knowledge-vector.ts);
-- NULL means "not embedded yet", which retrieval survives by falling back to the
-- lexical score alone — an index half-built still answers, it just ranks worse.
CREATE TABLE knowledge_chunks (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES knowledge_sources (id),
  compartment TEXT NOT NULL,
  owner_user_id TEXT,
  seq INTEGER NOT NULL,
  text TEXT NOT NULL,
  embedding TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_knowledge_chunks_source ON knowledge_chunks (source_id);
CREATE INDEX idx_knowledge_chunks_compartment ON knowledge_chunks (compartment, id);

-- THE INVERTED INDEX — retrieval's first stage, as an ordinary indexed table
-- rather than an FTS5 virtual one. Deliberate, and the reason is the DELETE: a
-- re-index removes a source's postings, and on FTS5 that is a scan of every
-- posting in the team (a virtual table has no index on a non-text column), while
-- here it is one keyed delete. It also behaves identically in the test harness
-- and in D1, which a virtual table kept in step by triggers does not — and a
-- search path that cannot be run in a test is a search path we cannot prove.
--
-- \`compartment\` and \`owner_user_id\` are COPIES of the chunk's, so stage one is
-- a single-table read. They can only change when the chunk is rewritten, which
-- rewrites these rows too.
CREATE TABLE knowledge_terms (
  term TEXT NOT NULL,
  chunk_id TEXT NOT NULL REFERENCES knowledge_chunks (id),
  compartment TEXT NOT NULL,
  owner_user_id TEXT,
  weight INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (term, chunk_id)
);
CREATE INDEX idx_knowledge_terms_chunk ON knowledge_terms (chunk_id);

-- WHERE THE SWEEP GOT TO. One row per source kind: the position it reached, when
-- it last ran, when it last SUCCEEDED, and what went wrong when it didn't (R12 —
-- unattended work has nobody watching, so a failure has to leave a mark someone
-- can find). The cursor is what makes ingestion resumable: a tick that dies
-- halfway, or a source that is an hour behind, costs the next tick nothing but
-- the rows it has not reached yet.
CREATE TABLE knowledge_ingest (
  kind TEXT PRIMARY KEY,
  cursor TEXT,
  last_run_at TEXT,
  last_ok_at TEXT,
  last_error TEXT,
  runs INTEGER NOT NULL DEFAULT 0,
  sources_indexed INTEGER NOT NULL DEFAULT 0
);

-- Existing teams: the locked Admin role gains the new module in full (it IS full
-- access by definition, and it cannot be edited afterwards to grant it). Every
-- other role gains nothing — a migration must never hand out sight of the
-- agency's own material that nobody granted. \`is_default\` is 1 on Admin alone.
INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
SELECT lower(hex(randomblob(16))), r.id, 'knowledge', r.is_default, r.is_default, r.is_default, r.is_default
  FROM member_roles r
 WHERE NOT EXISTS (
   SELECT 1 FROM role_permissions p WHERE p.role_id = r.id AND p.module = 'knowledge'
 );
`,
  },
  {
    // PROCESS MAPS, THEIR VERSIONS, AND THE MONEY (SCOPE ch.02 + .plans/BUILD-3).
    //
    // The number 0012 leaves 0011 to the work-engine lane, which is building
    // alongside this one and has already taken it (`0011_ticket_work_engine`).
    // The runner applies this array in order and records each `version` string,
    // so a gap is a key that never existed, not a missing step — and when the two
    // lanes merge the order is already right.
    //
    // WHAT THIS BUILD OWNS, and what it borrows: it owns the chain App → Process
    // → Step, the versions cut over it, the comments a client leaves on a map,
    // and the two rate cards. It borrows exactly two facts from the work engine —
    // a story's `step` (which step a piece of work changed) and a sprint's
    // `sold_price` (what was sold) — and it never writes either.
    version: "0013_process_maps_and_money",
    sql: `
-- AN APP is the built system: the thing with its own address and its own stage
-- (SCOPE ch.02). Not the goal — a client wanting dispatch fixed, served by a
-- driver app and a back-office screen, is TWO rows here.
--
-- \`account_id\` is whose system it is, and it is written once at creation and
-- never edited: every process, version, step and comment beneath it carries the
-- same account so the fence rides one clause with no join (the shape
-- \`help.account_id\` already has). There is deliberately no "move this app to
-- another account" door — moving one would silently re-publish a whole map, its
-- savings and its conversation into somebody else's portal. NULL is the agency's
-- own system, which belongs to no client and so appears in no portal.
--
-- \`tool_cost_cents_per_month\` is what this app costs US to keep running
-- (hosting, the services behind it). It is a column rather than a table because
-- a cost line with no history is one number about one app, and margin is the
-- only thing that reads it — internal, always.
CREATE TABLE apps (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts (id),
  name TEXT NOT NULL,
  url TEXT,
  stage TEXT,
  tool_cost_cents_per_month INTEGER NOT NULL DEFAULT 0 CHECK (tool_cost_cents_per_month >= 0),
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);
CREATE INDEX idx_apps_account ON apps (account_id);

-- A PROCESS is a way of working inside an app. It is the thing that is VERSIONED
-- — v1 is the pre-kwapso baseline, and every later version is what we changed it
-- to — so the process row itself carries no durations at all. They live on the
-- steps of each version, which is what makes "where does 208 hours come from?"
-- answerable rather than assertable.
CREATE TABLE processes (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps (id),
  account_id TEXT REFERENCES accounts (id),
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);
CREATE INDEX idx_processes_app ON processes (app_id);
CREATE INDEX idx_processes_account ON processes (account_id);

-- A VERSION is the process as it stood at one moment. Version 1 is the BASELINE
-- (how they worked before us) and is created with the process itself, because a
-- process with no baseline can never produce a saving and would quietly report
-- zero forever.
--
-- \`cut_from_sprint_id\` is the work engine's sprint whose completion cut this
-- version; NULL is the manual button. The partial unique index below is R17 for
-- a write that is an INSERT rather than an UPDATE: a sprint that completes twice
-- (a double click, a retried job, a replayed hook) cannot cut two versions,
-- because the second INSERT is refused by the index rather than by a check
-- somebody could race past.
CREATE TABLE process_versions (
  id TEXT PRIMARY KEY,
  process_id TEXT NOT NULL REFERENCES processes (id),
  account_id TEXT REFERENCES accounts (id),
  version_no INTEGER NOT NULL CHECK (version_no >= 1),
  label TEXT,
  cut_from_sprint_id TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT
);
CREATE UNIQUE INDEX idx_process_versions_no ON process_versions (process_id, version_no);
CREATE UNIQUE INDEX idx_process_versions_sprint
  ON process_versions (process_id, cut_from_sprint_id) WHERE cut_from_sprint_id IS NOT NULL;

-- A STEP is one part of a process, in ONE version. Two identifiers, and the
-- difference between them is the whole savings calculation:
--   • \`id\`       — this row, in this version.
--   • \`step_key\` — THE SAME STEP, across every version. Minted when the step
--                  first appears and copied forward by the cut, so "the baseline
--                  duration" and "the latest duration" are two rows that can be
--                  subtracted rather than two names that have to be matched.
--
-- \`removed_at\` is how a step that STOPPED HAPPENING stays honest. Deleting the
-- row would drop it out of the join and report no saving at all for the work we
-- removed entirely — the largest saving there is. So the cut carries it forward
-- with its frequency intact and its duration at zero, and the plain sentence
-- from SCOPE still holds: the baseline minus the latest, times how often it runs.
CREATE TABLE process_steps (
  id TEXT PRIMARY KEY,
  process_id TEXT NOT NULL REFERENCES processes (id),
  version_id TEXT NOT NULL REFERENCES process_versions (id),
  account_id TEXT REFERENCES accounts (id),
  step_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  seconds_per_run INTEGER NOT NULL DEFAULT 0 CHECK (seconds_per_run >= 0),
  runs_per_month INTEGER NOT NULL DEFAULT 0 CHECK (runs_per_month >= 0),
  removed_at TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT
);
-- One row per step per version: the cut copies forward, it never doubles up.
CREATE UNIQUE INDEX idx_process_steps_version_key ON process_steps (version_id, step_key);
CREATE INDEX idx_process_steps_process ON process_steps (process_id, step_key);

-- A CLIENT MAY COMMENT ON A PROCESS MAP (SCOPE ch.06 — one of the six things a
-- contact can do). A comment is a CONVERSATION, never an edit: it changes no
-- duration and cuts no version.
--
-- \`explains_step_key\` is the other half of the regression rule. Internal
-- dashboards ALWAYS show a step that got slower, because that is information;
-- the portal shows one only when a staff member has attached the explanation,
-- and this is that attachment. It is a comment, deliberately — an explanation
-- the client can reply to, rather than a field they can only read.
CREATE TABLE process_comments (
  id TEXT PRIMARY KEY,
  process_id TEXT NOT NULL REFERENCES processes (id),
  account_id TEXT REFERENCES accounts (id),
  body TEXT NOT NULL,
  explains_step_key TEXT,
  is_staff INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT
);
CREATE INDEX idx_process_comments_process ON process_comments (process_id, created_at);

-- ── THE TWO RATE CARDS, AND WHY THEY ARE TWO TABLES ──────────────────────────
--
-- One is what an ACCOUNT IS CHARGED. The other is what an hour of our own work
-- COSTS US. They are the same shape — a label and a number per hour — which is
-- exactly the danger: one table with a \`kind\` column would put both numbers a
-- single wrong WHERE clause apart, and the wrong one of them is the one figure
-- SCOPE says a client must never see under any flag, ever.
--
-- Two tables cannot be confused by a forgotten predicate. A door that reads
-- \`account_rates\` cannot accidentally return an internal rate, because the
-- internal rate is not in the table it named. The same reasoning splits the code
-- (lib/rates.ts vs lib/internal-money.ts) and is the law R24 checks.
CREATE TABLE account_rates (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id),
  label TEXT NOT NULL,
  cents_per_hour INTEGER NOT NULL CHECK (cents_per_hour >= 0),
  currency TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);
-- Race guard: two people naming the same kind of work on one account at once.
CREATE UNIQUE INDEX idx_account_rates_label
  ON account_rates (account_id, label) WHERE deactivated_at IS NULL;

-- WHAT AN HOUR COSTS US. No account column, on purpose: an internal rate is a
-- fact about the agency, not about a client — and a table with an account on it
-- is a table somebody eventually joins to an account-fenced read.
-- \`is_default\` is the rate margin applies to an hour of logged time while the
-- work log does not yet say WHICH kind of work it was. It is one column rather
-- than a guess: a margin that silently blended every rate on the card would be a
-- number nobody could check, which is the one thing this build exists to avoid.
CREATE TABLE internal_rates (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  cents_per_hour INTEGER NOT NULL CHECK (cents_per_hour >= 0),
  currency TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);
CREATE UNIQUE INDEX idx_internal_rates_label
  ON internal_rates (label) WHERE deactivated_at IS NULL;
-- At most ONE default, enforced by the database rather than by whoever writes the
-- next screen: two defaults would make the margin depend on row order.
CREATE UNIQUE INDEX idx_internal_rates_default
  ON internal_rates (is_default) WHERE is_default = 1 AND deactivated_at IS NULL;

-- Existing teams: the locked Admin role gains both new modules in full (it is
-- DEFINED as full access and cannot be edited afterwards to grant them). Every
-- other role gains nothing — a migration must never hand out sight of an
-- agency's margin, or of a client's world, that nobody granted. Same shape as
-- 0007, for the same reason. New teams don't reach this: their seed already
-- writes the rows.
INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
SELECT lower(hex(randomblob(16))), r.id, m.module, r.is_default, r.is_default, r.is_default, r.is_default
  FROM member_roles r
  CROSS JOIN (SELECT 'processes' AS module UNION ALL SELECT 'commercials') m
 WHERE NOT EXISTS (
   SELECT 1 FROM role_permissions p WHERE p.role_id = r.id AND p.module = m.module
 );
`,
  },
  {
    // THE WORK ENGINE, part two: what WE DO about a ticket (.plans/BUILD-1 §2).
    //
    // A ticket is what an account ASKS FOR. A story is one piece of work we do,
    // and it is the only place an assignee and a due date live — the ticket
    // deliberately has neither and derives its picture from its stories
    // (BUILD-1 §2, "no assignee and no due date on a ticket… do not add them").
    //
    // A SPRINT is the block of work sold to one account. It carries the flat
    // price, which is the revenue half of the margin the money lane already
    // reads (workers/tenancy/src/lib/work-engine.ts declares the contract from
    // the other side: `sprints.sold_price_cents` and `work_logs.seconds`). Whole
    // CENTS, like every other money column in this database — a price in major
    // units loses a half-penny somewhere between a float and a subtraction.
    version: "0014_stories_and_sprints",
    sql: `
-- A SPRINT belongs to ONE app or goal, and an account may have several running
-- at once (BUILD-1 §3). \`sprint_type\` is the editable vocabulary Planning /
-- Implementation / Iteration — a "blueprint" is a PRICED PLANNING sprint, not a
-- fourth type, so it is a price on a planning row and not a value here.
--
-- \`completed_at\` rather than a status word for "finished": the money lane's
-- version cut keys off the MOMENT a sprint completed (process_versions
-- .cut_from_sprint_id), and a moment is the thing that question actually asks.
CREATE TABLE sprints (
  id TEXT PRIMARY KEY,
  ref TEXT,
  account_id TEXT REFERENCES accounts (id),
  app_id TEXT REFERENCES apps (id),
  name TEXT NOT NULL,
  sprint_type TEXT,
  goal TEXT,
  starts_on TEXT,
  ends_on TEXT,
  sold_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (sold_price_cents >= 0),
  currency TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);
-- The same race guard the ticket's reference carries: two sprints sold on one
-- account in the same instant cannot end up quoting the same number.
CREATE UNIQUE INDEX idx_sprints_ref ON sprints (ref) WHERE ref IS NOT NULL;
CREATE INDEX idx_sprints_account ON sprints (account_id);
CREATE INDEX idx_sprints_app ON sprints (app_id);

-- A STORY is one piece of work we do. The field list is BUILD-1 §2's, and that
-- list is the spec:
--   ref, ticket?, app?, process?, step?, sprint_id, assignee, due dates,
--   reviewer?, status, closing_note.
--
-- STORIES HAVE NO TYPE, settled by the owner: the ticket carries the type and
-- the process step carries the classification that matters. Do not add one.
--
-- \`ticket_id\` IS NULLABLE, also settled: four out of five stories in the real
-- history stand on their own, with no request behind them.
--
-- \`step_key\` and \`changes_no_step\` are the pair BUILD-1 §2 requires: "a story
-- cannot close without naming the process step it changes, or explicitly saying
-- it changes none". Two columns rather than one nullable one, because "nobody
-- filled this in" and "we looked, and it changes no step" are different answers
-- and the savings maths later has to be able to tell them apart. It is a step
-- KEY rather than a step id on purpose — a key is the same step across every
-- version of a map (see process_steps), and a story outlives the version it was
-- written against.
--
-- \`title\` is not in §2's list and is added deliberately: a piece of work with
-- no name cannot be read in a list, assigned, or said out loud on a call. It is
-- the only field here the plan does not name.
CREATE TABLE stories (
  id TEXT PRIMARY KEY,
  ref TEXT,
  account_id TEXT REFERENCES accounts (id),
  ticket_id TEXT REFERENCES help (id),
  app_id TEXT REFERENCES apps (id),
  process_id TEXT REFERENCES processes (id),
  step_key TEXT,
  changes_no_step INTEGER NOT NULL DEFAULT 0,
  sprint_id TEXT REFERENCES sprints (id),
  title TEXT NOT NULL,
  detail TEXT,
  assignee_id TEXT,
  assignee_name TEXT,
  reviewer_id TEXT,
  reviewer_name TEXT,
  starts_on TEXT,
  due_on TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  closed_at TEXT,
  closing_note TEXT,
  rank TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT
);
CREATE UNIQUE INDEX idx_stories_ref ON stories (ref) WHERE ref IS NOT NULL;
-- The two reads that matter most: "what is left on this ticket" (the Ready flip
-- asks it on every story close) and "what is in this sprint".
CREATE INDEX idx_stories_ticket ON stories (ticket_id);
CREATE INDEX idx_stories_sprint ON stories (sprint_id);
CREATE INDEX idx_stories_account ON stories (account_id);
CREATE INDEX idx_stories_assignee ON stories (assignee_id);
CREATE INDEX idx_stories_rank ON stories (rank);

-- The sprint vocabulary SCOPE names, seeded the same way the ticket types were:
-- ADDED, never swapped, because a team's existing values are on rows already.
INSERT INTO selectable_data (id, type, value, is_default, created_at, creator_name)
SELECT lower(hex(randomblob(16))), 'Sprint type', v.value, 1, datetime('now'), 'kwapso'
  FROM (SELECT 'Planning' AS value UNION ALL SELECT 'Implementation' UNION ALL SELECT 'Iteration') v
 WHERE NOT EXISTS (
   SELECT 1 FROM selectable_data s WHERE s.type = 'Sprint type' AND s.value = v.value
 );

-- Existing teams: the locked Admin role gains the new module in full (it IS full
-- access by definition and cannot be edited afterwards to grant it). Every other
-- role gains nothing — a migration must never hand out sight of the agency's own
-- delivery plan, its assignees or its dates that nobody granted.
INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
SELECT lower(hex(randomblob(16))), r.id, 'work', r.is_default, r.is_default, r.is_default, r.is_default
  FROM member_roles r
 WHERE NOT EXISTS (
   SELECT 1 FROM role_permissions p WHERE p.role_id = r.id AND p.module = 'work'
 );
`,
  },
  {
    // WORK LOGS — the row of time this whole build is measured by.
    //
    // The owner named "logging time takes too many clicks" as the single thing
    // most likely to make him quietly abandon this and go back to a spreadsheet
    // (.plans/BUILD-1 §5). Everything about the shape below is downstream of
    // that: a timer is a work log with no end yet, so starting one is ONE insert
    // and stopping it is ONE update, and there is no second table, no session
    // object and no state machine between a person and a click.
    version: "0015_work_logs",
    sql: `
-- A ROW OF TIME: who, what they worked on, and how long, in whole seconds.
--
-- WHAT IT MAY ATTACH TO — a story, a ticket or a task, and nothing else (BUILD-1
-- §5, settled by the owner). NOT a to-do: that is somebody else's time, not ours.
-- NOT an account on its own: the owner was explicit that an account-level-only
-- log must not exist, because a figure with no work behind it is a figure nobody
-- can check. TICKETS are in the list deliberately — reading, triaging and
-- resolving a request is real work and has to be loggable against the request.
--
-- There is NO CHECK constraint on \`target_table\`, and that is a decision rather
-- than an omission. The allow-list is WORK_LOG_TARGETS in
-- workers/content/src/lib/work-logs.ts, which is also where the 400 comes from
-- and where each target's existence is proved before a row is written. A CHECK
-- would be a second copy of the same list that only SQLite can see — and in
-- SQLite a CHECK cannot be altered, so the day a fourth thing becomes loggable
-- the migration would be a full table rebuild of the largest table here.
--
-- \`kind\` is the kind of work, and it is nullable ON PURPOSE. BUILD-1 §5 says a
-- work log will eventually name it so the margin can group by it; until then
-- lib/internal-money.ts applies the DEFAULT internal rate and says so on screen,
-- which is the honest answer while the column is empty.
--
-- \`discarded_at\` is how a runaway timer is binned without deleting anything
-- (BUILD-1 §5: somebody starts one on Friday and goes home). Deactivate-never-
-- delete: the row, and the fact that somebody chose to bin it, both survive —
-- every sum in the app subtracts it instead.
CREATE TABLE work_logs (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts (id),
  target_table TEXT NOT NULL,
  target_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT,
  kind TEXT,
  note TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  seconds INTEGER NOT NULL DEFAULT 0 CHECK (seconds >= 0),
  billable INTEGER NOT NULL DEFAULT 1,
  discarded_at TEXT, discarder_id TEXT, discarder_email TEXT, discarder_name TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT
);
-- THE ONE THING A TIMER MAY NOT DO: run twice on the same work, for the same
-- person. Parallel timers on DIFFERENT targets are allowed (BUILD-1 §5) — that
-- is a real day — but the same person clocking the same story twice is a double
-- count nobody would ever notice in a total. A partial unique index, so the
-- database refuses it rather than a read-then-write racing itself.
CREATE UNIQUE INDEX idx_work_logs_running
  ON work_logs (user_id, target_table, target_id) WHERE ended_at IS NULL;
CREATE INDEX idx_work_logs_target ON work_logs (target_table, target_id);
CREATE INDEX idx_work_logs_account ON work_logs (account_id);
CREATE INDEX idx_work_logs_user ON work_logs (user_id, started_at);

-- ONE PERSON'S OWN PREFERENCES about their timers. One row per person, and today
-- one column: whether starting a timer stops the ones they already have running.
-- OFF by default, because parallel timers are legitimate and a setting that
-- silently stopped your other work would be discovered by losing an hour.
CREATE TABLE work_prefs (
  user_id TEXT PRIMARY KEY,
  auto_stop INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);
`,
  },
  {
    // THE OTHER TWO NOUNS (.plans/BUILD-1 §2). The owner's own test for telling
    // them apart: "Aurora spends forty minutes writing kwapso's own quarterly VAT
    // return" is a TASK; "Marta at Bergman still hasn't sent us her brand logo and
    // we can't finish without it" is a TO-DO.
    //
    // TWO TABLES, NOT ONE WITH A `kind` COLUMN, and the reason is the same one
    // that split the two rate cards in 0013: they are the same SHAPE and opposite
    // AUDIENCES. A to-do is aimed at the client and appears in their portal; a
    // task is our own admin and must never leave the building. One table with a
    // flag would put both a wrong WHERE clause apart, and the wrong one of them
    // is a list of the agency's internal chores rendered on a client's screen.
    // Two tables cannot be confused by a forgotten predicate.
    version: "0016_todos_and_tasks",
    sql: `
-- A TO-DO is something we are waiting on the CLIENT for. It is the only row in
-- the work engine a client login can WRITE to, and one of only two things in the
-- whole product that emails them (BUILD-1 §7).
--
-- \`account_id\` is NOT NULL, unlike everywhere else in this build: a to-do with
-- no client is a to-do aimed at nobody, and the fence that decides who may see it
-- reads exactly this column. There is no such thing as an agency to-do — that is
-- a task, in the table below.
--
-- \`file_url\` is what they uploaded against it. One file, not a collection: the
-- request is "send us the logo", and a second attachment is a second to-do or a
-- comment on the ticket it hangs off.
--
-- NO WORK LOG EVER ATTACHES TO ONE (BUILD-1 §5, settled by the owner) — it is
-- somebody else's time, not ours. That is enforced in
-- workers/content/src/lib/work-logs.ts by \`todos\` not being in WORK_LOG_TARGETS,
-- and asserted against the list itself so it survives this table existing.
CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  ref TEXT,
  account_id TEXT NOT NULL REFERENCES accounts (id),
  ticket_id TEXT REFERENCES help (id),
  story_id TEXT REFERENCES stories (id),
  title TEXT NOT NULL,
  detail TEXT,
  due_on TEXT,
  completed_at TEXT, completer_id TEXT, completer_name TEXT,
  file_url TEXT,
  file_name TEXT,
  cancelled_at TEXT, canceller_id TEXT, canceller_email TEXT, canceller_name TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT
);
CREATE UNIQUE INDEX idx_todos_ref ON todos (ref) WHERE ref IS NOT NULL;
CREATE INDEX idx_todos_account ON todos (account_id, completed_at);
CREATE INDEX idx_todos_ticket ON todos (ticket_id);

-- A TASK is kwapso's own internal admin. Nobody outside the agency ever sees one,
-- so unlike every other table in this build it carries no fence and no portal
-- story at all — every door on it refuses a client login outright.
--
-- \`account_id\` is nullable and usually null: our own VAT return belongs to no
-- client. A task that IS about a client (chasing an invoice, preparing a review)
-- may name one, which is what lets its time land in the right margin.
--
-- WORK LOGS DO ATTACH (BUILD-1 §2), which is the whole reason this is a table
-- rather than a checklist somewhere: forty minutes on the VAT return is real
-- time, it is ours, and it costs us the same as forty minutes of delivery.
--
-- The reference number is nullable here for a duller reason than elsewhere: a
-- reference is built out of an ACCOUNT's short code, and most tasks have no
-- account. A number nobody can quote is worse than none.
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  ref TEXT,
  account_id TEXT REFERENCES accounts (id),
  title TEXT NOT NULL,
  detail TEXT,
  assignee_id TEXT,
  assignee_name TEXT,
  due_on TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  completed_at TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT
);
CREATE UNIQUE INDEX idx_tasks_ref ON tasks (ref) WHERE ref IS NOT NULL;
CREATE INDEX idx_tasks_status ON tasks (status, due_on);
CREATE INDEX idx_tasks_assignee ON tasks (assignee_id);

-- Existing teams: the locked Admin role gains the to-do module in full. Every
-- other role gains nothing — including, deliberately, the Client role an owner
-- may already have built: handing a client sight of their to-dos is a decision
-- somebody makes on the Roles screen, not one a migration makes for them.
-- (Tasks need no row: they live under \`work\`, which 0014 already granted.)
INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
SELECT lower(hex(randomblob(16))), r.id, 'todos', r.is_default, r.is_default, r.is_default, r.is_default
  FROM member_roles r
 WHERE NOT EXISTS (
   SELECT 1 FROM role_permissions p WHERE p.role_id = r.id AND p.module = 'todos'
 );
`,
  },
  {
    // TRIAGE DUTY (.plans/BUILD-1 §6). "One named person is on triage duty, and
    // it is visible whose week it is."
    //
    // A ROTA, not a flag on a member. Whose week it is changes every Monday and
    // the answer to "whose week was it when this was missed?" has to survive —
    // so it is a row per week, and the week is the key.
    version: "0017_triage_duty",
    sql: `
CREATE TABLE triage_duty (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT
);
-- ONE NAMED PERSON, and the database is what makes it one. "Visible whose week
-- it is" has no answer if two rows claim the same week, and a check in code is a
-- check two simultaneous writers race past.
CREATE UNIQUE INDEX idx_triage_duty_week ON triage_duty (week_start);
`,
  },
  {
    // THE AGENCY'S OWN HOUSEKEEPING — the seven Glide tables that describe how
    // the agency runs itself. Six tables here, four permission modules, and two
    // legacy tables that deliberately became dropdown GROUPS instead (see the
    // INSERT at the bottom): a table of bare labels is a vocabulary, and the base
    // already has one place for those.
    //
    // WHAT EVERY TABLE HERE HAS IN COMMON, and it is the whole security story:
    // no `account_id` column, anywhere. These rows belong to the agency, not to a
    // customer, so there is nothing for the account fence to fence — and a fence
    // that could be forgotten is worse than one that was never needed. The
    // defence is at the door instead: every handler on all four modules opens
    // with `refusePortalCaller` (R21), and the refusal-symmetry suite holds both
    // halves of each module to the same answer.
    version: "0018_agency_internal",
    sql: `
-- THIS MIGRATION USED TO CREATE \`marketing_posts\` AND \`programs\` TOO.
-- Both were purged on 17 Aug 2026 by the owner's ruling — Marketing the MODULE
-- goes (Marketing the task DEPARTMENT stays, and it is a dropdown value, not a
-- table), and the Delivery method PAGE goes with its programme half folded onto
-- the sprint type a person actually picks. The CREATEs are gone from HISTORY
-- rather than merely dropped afterwards, so that a fresh clone never builds
-- either one; 0025 drops them for the teams that already ran this version, after
-- carrying every programme field across.

-- THE BRAND LIBRARY: 74 rows of the material everything else is made with —
-- logos, decks, templates. \`file_url\` is either an object we host (a
-- /media/internal/… URL minted by the upload door) or a link somewhere else, and
-- the column does not care which: the legacy rows arrive as Google-hosted links
-- that have to be re-hosted before Glide is switched off, and a schema that
-- insisted on one shape would make that migration a rewrite instead of a copy.
CREATE TABLE brand_assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  file_url TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);
CREATE INDEX idx_brand_assets_category ON brand_assets (category);

-- A MEETING PURPOSE is why we meet — and it is the one legacy lookup that could
-- NOT become a dropdown value, because a purpose belongs to a department and a
-- dropdown row is a single label with nowhere to put the second fact. Dropping
-- the link to make the table fit the vocabulary seam would have been a silent
-- loss of the only structure the table has. So the purpose is a record, and the
-- DEPARTMENT it belongs to is the dropdown value (pick-or-created against the
-- "Department" group) — each of the two facts stored the way its own shape asks.
CREATE TABLE meeting_purposes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT,
  description TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);
CREATE INDEX idx_meeting_purposes_department ON meeting_purposes (department);

-- THE PERSON BEHIND THE MEMBER ROW. Six staff rows in the legacy app carry a
-- personality profile — strengths, weaknesses, the people they look up to — and
-- the reconciliation's recommendation was to leave them behind as "a team page,
-- not a system record". The owner overruled it and asked for real storage, so
-- this is a table with an audit block and a history like every other record.
--
-- \`user_id\` is the GLOBAL user id, held as plain TEXT with no REFERENCES — the
-- members themselves live in the core database, so a foreign key here would name
-- a table this database does not have. \`google_connections.user_id\` has exactly
-- the same shape for exactly the same reason.
--
-- The partial unique index is the invariant: ONE live profile per person. It
-- rides the database rather than a read-then-write in a handler, so two tabs
-- saving a profile at the same instant cannot make two of them (CONCURRENCY
-- rule 2) — and it is partial so that deactivating a profile and writing a fresh
-- one is still allowed, which a plain UNIQUE would refuse.
CREATE TABLE staff_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  headline TEXT,
  personality_type TEXT,
  strengths TEXT,
  weaknesses TEXT,
  role_models TEXT,
  about TEXT,
  photo_url TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);
CREATE UNIQUE INDEX idx_staff_profiles_user
  ON staff_profiles (user_id) WHERE deactivated_at IS NULL;

-- A CERTIFICATE a member holds. Five rows in the legacy app, described there as
-- course completions — which is why the columns are a CREDENTIAL's rather than a
-- completion's (an issuer, the day it was granted, the day it lapses, the paper
-- itself). A completion fits inside a credential; the reverse does not, and a
-- credential is the fact that outlives the course it came from.
CREATE TABLE staff_certificates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  issuer TEXT,
  issued_on TEXT,
  expires_on TEXT,
  file_url TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);
CREATE INDEX idx_staff_certificates_user ON staff_certificates (user_id);

-- Existing teams: the locked Admin role gains all four new modules in full (it
-- is DEFINED as full access and cannot be edited afterwards to grant them).
-- Every other role gains nothing — a migration must never hand out sight of the
-- agency's own material that nobody granted. Same shape as 0007 and 0013, for
-- the same reason. New teams don't reach this: their seed already writes the rows.
INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
SELECT lower(hex(randomblob(16))), r.id, m.module, r.is_default, r.is_default, r.is_default, r.is_default
  FROM member_roles r
  CROSS JOIN (
    SELECT 'marketing' AS module
    UNION ALL SELECT 'brand_assets'
    UNION ALL SELECT 'delivery'
    UNION ALL SELECT 'staff_profiles'
  ) m
 WHERE NOT EXISTS (
   SELECT 1 FROM role_permissions p WHERE p.role_id = r.id AND p.module = m.module
 );

-- THE SIXTEEN UNGROUPED LEGACY VALUES, ANSWERED AS TWO GROUPS.
--
-- Sixteen of the legacy app's 154 dropdown values carried no group at all: ten
-- country names, five company-size bands and one stray hyphen. The alternative
-- was to make them two FIELDS on the account; the owner overruled it, and the
-- reason holds up — a country typed free into an address is a country spelled
-- five ways by five people, and the whole point of the dropdown module is that
-- the fifth person picks what the first one wrote.
--
-- So the two groups are created here, seeded with the bands (five, as the legacy
-- data has) and with the countries the customer records themselves evidence: the
-- language field is German, Spanish, Catalan or English, and the addresses are
-- European. The legacy labels arrive with the migration and pick-or-create into
-- these same two groups, which is the part that was at risk — a group that
-- exists is a group the import lands IN, instead of sixteen more homeless rows.
-- The stray hyphen is not carried across: it is not a value, it is a typo.
-- ONE STATEMENT PER VALUE, and that is not style — it is D1's hard limit.
-- This was a single INSERT feeding off an eleven-term UNION ALL chain, which is
-- ordinary SQLite and which D1 REFUSES: its compound-SELECT ceiling is FIVE
-- terms, not SQLite's 500. The whole migration rolled back with "too many terms
-- in compound SELECT" and every existing team stayed on the previous schema
-- while the code above it had already shipped. Generated from
-- INTERNAL_VOCABULARY below so the chain can never grow back.
${INTERNAL_VOCABULARY.map(
  (v) => `INSERT INTO selectable_data (id, type, value, is_default, created_at, creator_id, creator_email, creator_name)
SELECT lower(hex(randomblob(16))), '${v.type}', '${v.value}', 1, datetime('now'), NULL, NULL, 'System'
 WHERE NOT EXISTS (SELECT 1 FROM selectable_data s WHERE s.type = '${v.type}' AND s.value = '${v.value}');`
).join("\n")}
`,
  },
  {
    version: "0019_google_connections",
    sql: `
-- GOOGLE, CONNECTED ONE PERSON AT A TIME.
--
-- The decision the whole shape follows: each person connects their OWN Google
-- account, and the assistant acting for them sees exactly what they can see and
-- nothing else. There is no team-wide service account anywhere in this module,
-- and there is deliberately nowhere to put one — the row hangs off a USER id, so
-- "connect the agency's Drive once and let everybody read it" is not a
-- configuration mistake somebody could make, it is a column that does not exist.
--
-- \`user_id\` is the GLOBAL user id, plain TEXT with no REFERENCES, for the same
-- reason \`staff_profiles.user_id\` is: the
-- members themselves live in the core database, so a foreign key here would name
-- a table this database does not have.
--
-- THE TOKENS ARE ENCRYPTED IN THE COLUMN, not merely at rest under Cloudflare's
-- own disk encryption. A refresh token is a standing key to somebody's mailbox
-- that survives every password change, and this database is reachable by
-- anything holding the account's D1 REST token — a backup, an export, a debug
-- query. So both token columns hold AES-GCM ciphertext, and the one key lives in
-- a secret the database has no copy of (workers/content/src/lib/google-crypto.ts).
-- A dump of this table without that secret is a table of email addresses.
--
-- \`scopes\` is what Google ACTUALLY granted, not what we asked for. A person can
-- untick a box at the consent screen, and a connection that quietly works for
-- less than it claims is how an assistant ends up saying "there is nothing in
-- that folder" about a folder full of things.
CREATE TABLE google_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  service TEXT NOT NULL,
  google_email TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '',
  access_token TEXT,
  access_expires_at TEXT,
  refresh_token TEXT NOT NULL,
  last_used_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);

-- ONE LIVE CONNECTION PER PERSON PER SERVICE — on the database, not in a
-- handler. Connecting is a browser round-trip that a person can genuinely finish
-- twice (two tabs, an impatient second click on "Connect"), and a read-then-write
-- in the handler would make two rows holding two different refresh tokens, one of
-- which nothing would ever revoke (CONCURRENCY rule 2). Partial, so that
-- disconnecting and connecting again is still allowed — which a plain UNIQUE
-- would refuse, and which is the ordinary way somebody fixes a broken grant.
CREATE UNIQUE INDEX idx_google_connections_live
  ON google_connections (user_id, service) WHERE deactivated_at IS NULL;
CREATE INDEX idx_google_connections_user ON google_connections (user_id);

-- THE FOLDERS AND SPACES SOMEBODY NAMED. Drive is not "your Drive" and Chat is
-- not "your Chat": both are reached only through rows in this table, so the
-- unnamed rest of a person's Drive is out of reach by construction rather than
-- by a filter somebody has to remember to write. Gmail and Calendar have no rows
-- here because there is nothing to name — mail is narrowed to known contacts and
-- the calendar is the person's own diary.
--
-- \`shelf\` is the answer to the question the design round said we must answer at
-- the moment of sharing: who will be able to read this? 'private' means this
-- person alone (and the assistant acting as them); 'team' means anybody whose
-- role can read it. It is stored on the SOURCE rather than inferred later,
-- because "I thought that folder was just mine" is the failure this column
-- exists to make impossible.
--
-- \`user_id\` is denormalised off the connection on purpose: every read here is
-- "mine", and a join to answer that on every list is a join to answer the
-- cheapest question in the module.
CREATE TABLE google_sources (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES google_connections(id),
  user_id TEXT NOT NULL,
  service TEXT NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  shelf TEXT NOT NULL DEFAULT 'private',
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);
CREATE UNIQUE INDEX idx_google_sources_live
  ON google_sources (connection_id, external_id) WHERE deactivated_at IS NULL;
CREATE INDEX idx_google_sources_user ON google_sources (user_id, service);

-- Existing teams: the locked Admin role gains all three new modules in full (it
-- is DEFINED as full access and cannot be edited afterwards to grant them).
-- Every other role gains nothing — including, deliberately, the Client role an
-- owner may have made, which must never hold one of these: clients get no
-- assistant and no Google surface at all. Same shape as 0007, 0013 and 0018.
INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
SELECT lower(hex(randomblob(16))), r.id, m.module, r.is_default, r.is_default, r.is_default, r.is_default
  FROM member_roles r
  CROSS JOIN (
    SELECT 'google' AS module
    UNION ALL SELECT 'google_mail'
    UNION ALL SELECT 'google_events'
  ) m
 WHERE NOT EXISTS (
   SELECT 1 FROM role_permissions p WHERE p.role_id = r.id AND p.module = m.module
 );
`,
  },
  {
    // THE KNOWLEDGE BASE MOVES ITS SEARCH TO VECTORIZE, and grows the two things
    // 0012 could not give it: a record's own SUMMARY (so the router knows what
    // each record is ABOUT before it searches anything), and a size ceiling that
    // is a product decision rather than an accident of a validator.
    //
    // 0012's own note said the vectors lived here because a per-team database
    // makes tenancy structural. That argument is answered, not abandoned — see
    // the header of workers/content/src/lib/knowledge-vectors.ts: the namespace
    // is the partition, and the passages an answer is built from are still read
    // out of THIS database under the caller's own fence. What changed is that the
    // SEARCH no longer has to fit in a SQL statement.
    version: "0020_knowledge_vectors",
    sql: `
-- WHAT A RECORD IS ABOUT, in a sentence or two. Written by the sweep from the
-- row itself (never by a model — see knowledge-summary.ts), embedded, and
-- searched FIRST: the router reads the summaries to decide which records to look
-- inside, which is the difference between routing and guessing. It is also what
-- a list screen shows instead of dragging a 300-page body over the wire.
ALTER TABLE knowledge_sources ADD COLUMN summary TEXT;
ALTER TABLE knowledge_sources ADD COLUMN summary_embedding TEXT;

-- THE LABELS THE ROUTER NARROWS BY. \`account_id\` and \`compartment\` were
-- already here; these are the rest of the notebook the owner asked for, each one
-- a metadata index on the vector as well as a column here.
ALTER TABLE knowledge_sources ADD COLUMN app_id TEXT;
ALTER TABLE knowledge_sources ADD COLUMN ticket_id TEXT;
ALTER TABLE knowledge_sources ADD COLUMN sprint_id TEXT;
-- WHEN THE MATERIAL IS FROM, which is not when we indexed it: a transcript of
-- Tuesday's call filed on Friday is Tuesday's. Kept as an ISO string here (it is
-- read by people) and as whole seconds on the vector (it is filtered by ranges).
ALTER TABLE knowledge_sources ADD COLUMN record_date TEXT;

-- STAGED INGEST — how far through a source the indexer got, and why it stopped.
-- A 300-page contract cannot be embedded inside one request: the work is done in
-- slices and this is the resume point, so a source that is half-indexed is
-- FINISHED by the next slice rather than started again. \`indexed_chunks\` = 0
-- with a chunk_count above it is the readable form of "still going".
ALTER TABLE knowledge_sources ADD COLUMN indexed_chunks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE knowledge_sources ADD COLUMN index_error TEXT;
-- The size of the material, in bytes, so a screen can say what it is holding and
-- the ceiling can be explained rather than just enforced.
ALTER TABLE knowledge_sources ADD COLUMN body_bytes INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_knowledge_sources_pending ON knowledge_sources (indexed_chunks, id) WHERE deactivated_at IS NULL;

-- NO "WHAT CHANGED" TABLE, DELIBERATELY — the sweep's own cursor already IS one.
--
-- The obvious build for "instant re-index" is a dirty queue every write marks.
-- It was rejected: it is an invariant fifty call sites have to remember, across
-- three workers, and the one that forgets is silent. The cursor cannot be
-- forgotten. Each kind is read in \`COALESCE(updated_at, created_at)\` order, so
-- a row that changes sorts AFTER the cursor by construction — whoever changed
-- it, through whichever door, including an import and the agent. What made it
-- feel periodic was only WHEN it ran. So now it runs on a write, on a read, and
-- on the cron (see knowledge-ingest.ts), and the cron's job shrinks to the one
-- thing an event cannot do: notice what nobody was there to tell us about.

-- THE OLD INDEX IS DISCARDED, DELIBERATELY AND ONCE.
--
-- Chunk ids are now DERIVED (\`<sourceId>:<seq>\`) so that a vector can be
-- overwritten and deleted without a lookup table, and the old rows carry random
-- ids that no vector will ever match. Blanking the content hash is what makes
-- the base rebuild itself: every source now looks changed, so the next drain and
-- the next sweep re-chunk, re-embed and re-upsert it. Nothing is lost — a
-- mirrored source's truth is the row it mirrors and a typed note's is its own
-- body, both of which are untouched here.
DELETE FROM knowledge_terms;
DELETE FROM knowledge_chunks;
UPDATE knowledge_sources SET content_hash = NULL, indexed_at = NULL, chunk_count = 0, indexed_chunks = 0;
`,
  },
  {
    version: "0021_meetings",
    sql: `
-- MEETINGS — the section the owner asked for, and the one noun the legacy import
-- had nowhere to put.
--
-- Glide held 350 of them and the reconciliation folded every one into a WORK LOG,
-- because a work log was the only row that carried a date, a duration and a
-- client. That kept the hours and threw away the meeting: what was on the agenda,
-- what was decided, and who it was with. A work log answers "how long did that
-- take"; it has no field that can answer "what did we agree in March".
--
-- So this is a record of its own, and the two things on it that nothing else in
-- the app holds are \`agenda\` and \`notes\`. Time still goes on a work log — a
-- meeting is not a timesheet — and the two are joined by nothing on purpose: a
-- meeting that ran long is two facts, not one.
--
-- WHY IT IS ITS OWN MODULE and not four more rights on \`delivery\`:
-- \`meeting_purposes\` is a TAXONOMY of why we meet (a settled list somebody
-- curates once a year). A meeting is a record that accumulates forever. Sharing
-- one permission row would mean granting the right to read every note ever taken
-- in order to let somebody see the list of purposes.
--
-- \`purpose_id\` points at that taxonomy, so "why did we meet" is a dropdown value
-- rather than a fifth spelling typed into a title.
--
-- \`status\` is two words, not five: a meeting is scheduled, or it has been held.
-- Cancelling is \`deactivated_at\` like every other retirement in the base — the
-- row survives, so a client asking "didn't we have a call in March?" is answerable
-- either way.
--   SUPERSEDED 18 Aug 2026 (see 0037): the held status is retired and nothing
--   reads \`status\` or \`held_at\` any more — a meeting's own \`starts_at\` says
--   whether it has happened. The columns stay, because what people ticked while
--   the idea existed is still history. The sentence about cancelling still holds.
--
-- \`google_event_id\` is what makes the calendar push idempotent. Pressing "put it
-- in my calendar" twice must not make two entries, and the row is the only place
-- that memory can live (SCOPE ch.03: Google being an hour behind breaks nothing —
-- Google holding two copies of one meeting is not the same kind of harmless).
--   SUPERSEDED 18 Aug 2026: there is no calendar push, the calendar is one-way.
--   The column and its unique index do the same work from the other direction —
--   they are how the sweep recognises an entry it has already made a record of.
CREATE TABLE meetings (
  id TEXT PRIMARY KEY,
  ref TEXT,
  account_id TEXT REFERENCES accounts(id),
  purpose_id TEXT REFERENCES meeting_purposes(id),
  title TEXT NOT NULL,
  agenda TEXT,
  notes TEXT,
  location TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  held_at TEXT,
  google_event_id TEXT,
  google_event_url TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);
-- The list's own sort (newest first, id breaking ties) — the keyset the paged
-- read walks, so page two is an index seek rather than an offset scan.
CREATE INDEX idx_meetings_when ON meetings (starts_at DESC, id DESC);
CREATE INDEX idx_meetings_account ON meetings (account_id);
-- ONE meeting per calendar entry, on the database rather than in a handler: two
-- tabs pressing "add to my calendar" at the same instant would otherwise write
-- two ids over each other and leave an orphan event nothing in kwapso names
-- (CONCURRENCY rule 2). Partial, so the overwhelming majority of rows — which
-- have no event at all — are not competing for one NULL.
CREATE UNIQUE INDEX idx_meetings_event ON meetings (google_event_id) WHERE google_event_id IS NOT NULL;

-- WHICH CLIENT A NAMED FOLDER OR SPACE IS ABOUT. Nullable, and null means the
-- agency's own — the same sentence \`knowledge_sources.account_id\` already
-- speaks, which is what lets a Drive folder and a typed note land in the same
-- compartment by the same rule.
--
-- ASKED, NOT GUESSED. The alternative was to read the folder's contents and
-- match a client's name in them, and that is the failure the compartment idea
-- exists to prevent: a document filed under the wrong client is worse than one
-- filed under nobody, because the assistant will quote it confidently at the
-- wrong person. The person naming the folder knows whose it is; the screen asks
-- them, beside the question about who may read it.
ALTER TABLE google_sources ADD COLUMN account_id TEXT;
CREATE INDEX idx_google_sources_account ON google_sources (account_id);

-- Existing teams: the locked Admin role gains the new module in full (it is
-- DEFINED as full access and cannot be edited afterwards to grant it). Every
-- other role gains nothing — including the Client role an owner may have made,
-- which must never hold this one: a meeting's notes are our own record of a
-- conversation, and no client login reaches any door on it. Same shape as 0007,
-- 0013, 0018 and 0019.
INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
SELECT lower(hex(randomblob(16))), r.id, 'meetings', r.is_default, r.is_default, r.is_default, r.is_default
  FROM member_roles r
 WHERE NOT EXISTS (
   SELECT 1 FROM role_permissions p WHERE p.role_id = r.id AND p.module = 'meetings'
 );
`,
  },
  {
    version: "0022_knowledge_files",
    sql: `
-- A FILE IS THE THIRD WAY INTO THE KNOWLEDGE BASE, and it is a fourth family in
-- a table that already holds three:
--   • TYPED here (kind 'note') — the body is the truth;
--   • MIRRORED from a row we own — the row is the truth, the sweep keeps up;
--   • ARRIVED through somebody's Google connection — their shelf, their answers;
--   • UPLOADED (kind 'file') — THE FILE is the truth, and the body is a READING
--     of it. That last sentence is why these columns exist rather than the
--     upload being a note with a link glued to it: the words in \`body\` were
--     produced by a converter, and a reader who disagrees with an answer has to
--     be able to open the thing the words came from and check.
--
-- \`file_url\` is a capability URL into the agency's OWN media bucket
-- (/media/internal/ — served by the agency gateway and by no other door), for
-- the reason SCOPE ch.06 records about every other upload in the product.
--
-- \`file_type\` is the type the browser DECLARED. It is a LABEL and nothing else:
-- the object itself is stored as application/octet-stream, so this string is
-- never handed to a renderer (shared/workers/image.ts says why at length).
--
-- \`file_note\` is the honest half. Some files cannot be read — a deck, an
-- archive, a design file — and the ruling was that those are still STORED and
-- still LISTED rather than refused, because "any type of file" was the ask and
-- refusing half of them is not that. What must never happen is pretending one
-- was indexed, so the reason lives on the row, in words, and every screen that
-- shows the source shows it. It is a separate column from \`index_error\` on
-- purpose: that one belongs to the INDEXER and is rewritten on every pass, and a
-- fact about the file would be wiped by the next re-index of the text.
ALTER TABLE knowledge_sources ADD COLUMN file_url TEXT;
ALTER TABLE knowledge_sources ADD COLUMN file_name TEXT;
ALTER TABLE knowledge_sources ADD COLUMN file_type TEXT;
ALTER TABLE knowledge_sources ADD COLUMN file_bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE knowledge_sources ADD COLUMN file_note TEXT;
`,
  },
  {
    // THE FEED GETS THE INDEX ITS OWN PAGING ASKS FOR.
    //
    // `activity` is the fastest-growing table in a team's database by
    // construction: R1 makes every mutation publish and R18's feed records one
    // row for each, so at the yardstick this table is the tens-of-millions one.
    // It has paged by keyset since R14 — `ORDER BY created_at DESC, id DESC`,
    // with `created_at < ? OR (created_at = ? AND id < ?)` as the cursor — and
    // the only index on it since 0001 leads with `related_table`.
    //
    // So the record scope (`related_table = ? AND related_row_id = ?`) was
    // indexed and the TEAM scope, which is the feed everybody opens, was not:
    // every page did a full scan and a sort of the whole table to hand back
    // fifty rows, and page two paid it again. `meetings` already carries exactly
    // this index for exactly this reason ("the keyset the paged read walks, so
    // page two is an index seek rather than an offset scan") — the feed that
    // grows fastest was the one missing it.
    //
    // TWO INDEXES, because the feed has two shapes and they are not the same
    // seek. The plain one serves an unfiltered page; the composite one serves
    // R18's `related_table IN (…)` page AND lets the R16 COUNT(*) beside it read
    // an index rather than the table. Neither makes that COUNT cheaper than
    // O(rows-it-counts) — that is R16's price and it is named in the scaling
    // report — but an index-only scan over one narrow column is a different
    // order of cost from a scan of the widest table in the database.
    version: "0023_activity_feed_index",
    sql: `
CREATE INDEX IF NOT EXISTS idx_activity_feed ON activity (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_activity_table_feed ON activity (related_table, created_at DESC, id DESC);
`,
  },
  {
    // COMPANIES AND CONTACTS: ONE TABLE, TWO SCREENS, TWO PERMISSIONS.
    //
    // The owner ruled twice that a company and a person stay ONE row shape in
    // `accounts` — two tables would cap a person at one company, and the agency
    // has contacts who sit at two (Marta is at Bergman and at Delaval). So this
    // migration splits nothing in the database. It splits the two things that
    // were actually being complained about:
    //
    //   • the SIGHT of people, which becomes its own module (`contacts`), off
    //     for every role but Admin — "people of the development team does not
    //     need to know who are the contacts" (Aurora);
    //   • the SHAPE of a company, which gains the fields a company record was
    //     always missing: a real postal address rather than one free-text line,
    //     the industry it is in, a paragraph about it, a logo, a cover image.
    //
    // THE ADDRESS IS SPLIT AND THE OLD COLUMN IS BACKFILLED, NOT DROPPED.
    // `street` starts life holding whatever `address` held, so nothing anybody
    // typed is lost and no read has to know which of the two it is looking at.
    // `address` stops being written and stops being read the day this ships —
    // every surface (the form, the CSV export, the import target, the machine
    // tools) names the four fields instead. It is left in the table because
    // dropping a column is the one migration you cannot take back, and there is
    // nothing to gain by taking it back.
    //
    // `locale` is not re-invented here: the LANGUAGE an account is written to is
    // the column that has held it since 0007, and this only puts a control on it.
    version: "0024_contacts_and_company_shape",
    sql: `
ALTER TABLE accounts ADD COLUMN street TEXT;
ALTER TABLE accounts ADD COLUMN postal_code TEXT;
ALTER TABLE accounts ADD COLUMN city TEXT;
ALTER TABLE accounts ADD COLUMN country TEXT;
ALTER TABLE accounts ADD COLUMN industry TEXT;
ALTER TABLE accounts ADD COLUMN about TEXT;
ALTER TABLE accounts ADD COLUMN logo_url TEXT;
ALTER TABLE accounts ADD COLUMN cover_url TEXT;

-- The one line anybody ever typed becomes the street line. Chosen over guessing
-- at commas: a postal code parsed out of free text wrongly is worse than one
-- somebody types once, and this way every character survives somewhere visible.
UPDATE accounts SET street = address WHERE address IS NOT NULL AND address <> '';

-- Existing teams: the locked Admin role gains the new module in full (it is
-- DEFINED as full access and cannot be edited afterwards to grant it). Every
-- other role gains nothing — which is the whole point of this one: an address
-- book is a separate grant, and a migration must never hand out sight of
-- somebody's people that nobody granted. Same shape as 0007, 0013, 0018, 0019
-- and 0021. New teams don't reach this: their seed writes the rows already.
INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
SELECT lower(hex(randomblob(16))), r.id, 'contacts', r.is_default, r.is_default, r.is_default, r.is_default
  FROM member_roles r
 WHERE NOT EXISTS (
   SELECT 1 FROM role_permissions p WHERE p.role_id = r.id AND p.module = 'contacts'
 );

-- The two vocabularies the company form now picks from. Country already had a
-- group (0018); Industry and Account status are new, and all three are ordinary
-- dropdown values a team edits on its own Dropdown values screen. Pick-or-create,
-- so a team that already typed its own words keeps them.
--
-- ONE STATEMENT PER VALUE, generated from an array — D1's compound-SELECT
-- ceiling is FIVE terms, and 0018 is the migration that learned it the hard way.
${COMPANY_VOCABULARY.map(
  (v) => `INSERT INTO selectable_data (id, type, value, is_default, created_at, creator_id, creator_email, creator_name)
SELECT lower(hex(randomblob(16))), '${v.type}', '${v.value}', 1, datetime('now'), NULL, NULL, 'System'
 WHERE NOT EXISTS (SELECT 1 FROM selectable_data s WHERE s.type = '${v.type}' AND s.value = '${v.value}');`
).join("\n")}
`,
  },
  {
    // THE PURGE, AND THE ONE THING IT REFUSED TO THROW AWAY.
    //
    // The owner's ruling of 17 Aug 2026 retires three things: Marketing the
    // MODULE (Marketing the task DEPARTMENT stays — it is a dropdown value and
    // always was), Learning, and the Delivery method PAGE. The CREATE statements
    // are already gone from 0004 and 0018, so a database built from this file
    // today never has these four tables at all; this migration is for the teams
    // that were built before the ruling.
    //
    // NOTHING READABLE IS LOST BY EITHER DROP:
    //   • Learning's 41 articles were indexed into the knowledge base before the
    //     module was retired (measured, not assumed) — the sources survive with
    //     kind `article`, which is why lib/knowledge.ts keeps that kind with no
    //     sweep behind it any more;
    //   • the ten programmes were the sprint types wearing a second name, and
    //     everything they carried is folded onto the sprint type below;
    //   • marketing posts are the one genuine loss, and the ruling is explicit
    //     that the module goes. An owner who wants the 251 legacy posts still
    //     has them in the Glide export.
    //
    // THE FOUR COLUMNS GO ON `selectable_data` RATHER THAN ON A SPRINT-TYPE
    // TABLE, because a sprint type is a dropdown value and a table for it would
    // be a second vocabulary seam beside the one that already exists. Every one
    // of them is nullable and every one is meaningful beyond sprint types: a
    // mark is what UI-RULEBOOK's type mark reads, a description is what a
    // picker's hint line shows, a curated foreign label is what an agency writes
    // once for a client who reads another language. `standard_days` is the only
    // narrow one, and it is a number nobody else has to look at.
    version: "0025_purge_learning_marketing_programmes",
    sql: `
ALTER TABLE selectable_data ADD COLUMN mark TEXT;
ALTER TABLE selectable_data ADD COLUMN name_de TEXT;
ALTER TABLE selectable_data ADD COLUMN description TEXT;
ALTER TABLE selectable_data ADD COLUMN standard_days INTEGER;

-- THE FOLD. One statement per value, generated from the catalogue — D1's
-- compound-SELECT ceiling is FIVE terms, and 0018 is the migration that learned
-- it the hard way. Pick-or-create for the row, then a plain UPDATE for the
-- enrichment: a team that already has "Implementation" keeps its own row, its
-- own id and its own history, and simply gains the mark, the German name, the
-- sentence and the length. A team that retired one keeps it retired.
${SPRINT_TYPE_CATALOGUE.map(
  (t) => `INSERT INTO selectable_data (id, type, value, is_default, created_at, creator_id, creator_email, creator_name)
SELECT lower(hex(randomblob(16))), 'Sprint type', ${sqlString(t.value)}, 1, datetime('now'), NULL, NULL, 'System'
 WHERE NOT EXISTS (SELECT 1 FROM selectable_data s WHERE s.type = 'Sprint type' AND s.value = ${sqlString(t.value)});
UPDATE selectable_data
   SET mark = ${sqlString(t.mark)}, name_de = ${sqlString(t.nameDe)},
       description = COALESCE(description, ${sqlString(t.description)}),
       standard_days = ${t.standardDays === null ? "NULL" : t.standardDays}
 WHERE type = 'Sprint type' AND value = ${sqlString(t.value)};`
).join("\n")}

-- AND THE TABLES GO. IF EXISTS on every one: a database built after the CREATEs
-- left 0004 and 0018 reaches this migration with none of them, and a migration
-- that only works on the old shape is a migration that breaks every new team.
-- learning_progress first — it is the one with the foreign key.
DROP TABLE IF EXISTS learning_progress;
DROP TABLE IF EXISTS learning;
DROP TABLE IF EXISTS marketing_posts;
DROP TABLE IF EXISTS programs;
`,
  },
  {
    // THE 26 DUPLICATES EVERY TEAM BORN BEFORE THE SEED WAS GUARDED IS CARRYING.
    //
    // `createTeam` applies every migration and THEN runs the seed. Several
    // migrations back-fill a default vocabulary into existing teams (0009's four
    // ticket types, 0016's three sprint types, 0018's six countries and five
    // company-size bands) and they guard themselves with WHERE NOT EXISTS,
    // because they have to be safe against a team that already has the value.
    // The seed did not, because when it was written it ran into an empty table —
    // so a brand-new team got each of those 26 values twice, and every picker in
    // the app offered each word twice. That is exactly what a tester meant by
    // "ticket types appear two, three and four times".
    //
    // The seed is guarded now, so no NEW team can be born with them. This is the
    // other half: the teams that already were.
    //
    // WHICH COPY SURVIVES, and why it cannot be "the one with the most
    // references". A dropdown value is referenced by its STRING, everywhere in
    // this app — a ticket's \`help_type\` holds the word "Question", not the id
    // of a row. Two live rows reading (Ticket type, Question) are therefore
    // indistinguishable to every reference in the database: there is no count to
    // compare. So the rule is the only one that can be applied honestly — the
    // OLDEST row survives, ties broken by id, which is the row every earlier
    // reference was looking at anyway.
    //
    // DEACTIVATED, NEVER DELETED (ARCHITECTURE §4). A retired duplicate keeps
    // its id, its audit block and its history, shows up greyed on the Dropdown
    // values screen with an Activate button, and can be brought back by anybody
    // who thinks this was wrong. \`deactivator_name\` says 'System' because that
    // is who did it.
    //
    // IDEMPOTENT: run it twice and the second pass finds nothing live to retire,
    // because the survivor of each group is the only row still matching.
    version: "0026_retire_duplicate_dropdown_values",
    sql: `
UPDATE selectable_data
   SET deactivated_at = datetime('now'),
       deactivator_id = NULL,
       deactivator_email = NULL,
       deactivator_name = 'System',
       updated_at = datetime('now')
 WHERE deactivated_at IS NULL
   AND EXISTS (
     SELECT 1 FROM selectable_data keeper
      WHERE keeper.type = selectable_data.type
        AND keeper.value = selectable_data.value
        AND keeper.id <> selectable_data.id
        AND keeper.deactivated_at IS NULL
        AND (keeper.created_at < selectable_data.created_at
             OR (keeper.created_at = selectable_data.created_at AND keeper.id < selectable_data.id))
   );
`,
  },
  {
    // TASKS, REBUILT (CHECKLIST §4). Six columns on the table we already have,
    // because every one of them is a fact ABOUT a task rather than a record of
    // its own — the shape rule this file has followed since 0016.
    //
    // `important` + `urgent` REPLACE a priority word. The score they make is
    // `(important × 2) + urgent + 1`, 1 to 4, and it is computed in
    // shared/departments.ts rather than stored: a derived number in a column is
    // a number that can disagree with the two ticks it came from. The old
    // high/medium/low never reached this table, so there is nothing to migrate.
    //
    // `department` is a WORD, not a foreign key — the five live in the
    // `Department` dropdown group (seeded below), which is the one home this base
    // has for a team's editable vocabulary. A department renamed on that screen
    // leaves old rows reading truthfully, exactly as a renamed ticket status does.
    //
    // `app_id` is the second field a Production task asks for; the account column
    // 0016 already added is the one Sales and Admin ask for. Both nullable: a
    // department that asks nothing leaves both empty, and NOT NULL here would
    // make the form's rule a schema fact that the next department breaks.
    //
    // `file_url` / `file_name` are the one attachment a task carries, the same
    // pair and the same reasoning as a to-do's: the ask is "a photo of the
    // letter", and a second file is a second task or a note on the one it is on.
    // It lands in INTERNAL_MEDIA, which only the AGENCY gateway serves (R21) —
    // a task is our own admin and its evidence must not be redeemable at the
    // client's hostname.
    //
    // The due-date index is what the six views cost: Overdue, Upcoming and the
    // "due today or earlier" progress bar all ask about `due_on` on every read.
    version: "0027_task_admin",
    sql: `
ALTER TABLE tasks ADD COLUMN important INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN urgent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN department TEXT;
ALTER TABLE tasks ADD COLUMN app_id TEXT REFERENCES apps (id);
ALTER TABLE tasks ADD COLUMN file_url TEXT;
ALTER TABLE tasks ADD COLUMN file_name TEXT;
CREATE INDEX idx_tasks_due_on ON tasks (due_on);

-- The five departments the agency already runs on, as ordinary dropdown values
-- so they are editable (the owner's answer to c1). Pick-or-create, like every
-- other vocabulary this file seeds: a team that already typed "Marketing" for a
-- meeting purpose keeps the row it has, and the two nouns share one word.
--
-- ONE STATEMENT PER VALUE, generated from the shared list — D1's compound-SELECT
-- ceiling is FIVE terms, which 0018 learned the hard way.
${TASK_DEPARTMENTS.map(
  (d) => `INSERT INTO selectable_data (id, type, value, is_default, created_at, creator_id, creator_email, creator_name)
SELECT lower(hex(randomblob(16))), '${SELECTABLE_GROUPS.department}', '${d.name}', 1, datetime('now'), NULL, NULL, 'System'
 WHERE NOT EXISTS (SELECT 1 FROM selectable_data s WHERE s.type = '${SELECTABLE_GROUPS.department}' AND s.value = '${d.name}');`
).join("\n")}
`,
  },
  {
    // A STATUS IS A FACT, NOT A BUTTON (CHECKLIST §5 and §6, 17 Aug 2026).
    //
    // Everything below exists so that the app can REPORT what happened instead of
    // asking somebody to declare it. The two lifecycles gained the facts they were
    // missing, and the two records gained the relations that make those facts
    // computable at all.
    //
    // ON THE TICKET:
    //   `app_id`                which system it is about (5.8). Without it a
    //                           request cannot be routed, scheduled or told to the
    //                           right stakeholder;
    //   `raised_by_contact_id`  WHO ASKED (5.9), which is not who typed it: 220 of
    //                           the 221 seeded requests were typed by staff on a
    //                           client's behalf. It points at an `accounts` row of
    //                           type `individual` — a contact is a person's own
    //                           account row (there is no contacts table, and 15.1
    //                           says why);
    //   `validated_at`          when the client's main stakeholder said yes (5.13).
    //                           Only the kinds that WAIT ever carry one.
    //
    // ON THE STORY:
    //   `story_type`            Fix / Feature / Change, editable like every other
    //                           vocabulary here (6.2). Nullable, because 3,677
    //                           stories arrived from the previous system with no
    //                           type and a NOT NULL would have made the import the
    //                           first thing this migration broke;
    //   `review_note` + the two file columns  what was done, and optionally
    //                           something to show for it (6.9 — Aurora's ruling
    //                           that the file is required only when there IS one).
    //
    // AND TWO TABLES, because both are genuinely many:
    //   `help_attachments`      several files AND several links on one ticket, from
    //                           both front doors (5.10). One shape for both kinds:
    //                           "here is the thing I mean" is one act, and a
    //                           second table would have meant two lists, two
    //                           counts and two ways to be wrong about the order;
    //   `story_processes`       a story links to one or MORE processes (6.5). The
    //                           `process_id` column on `stories` stays and is the
    //                           first of these — the savings maths and the import
    //                           both address a story's map by one id, and dropping
    //                           a column is the one migration you cannot take back.
    //
    // THE TWO NEW STATUSES ARE NOT SCHEMA. `status` is a free TEXT column the code
    // validates against `HELP_STATUSES`, so `awaiting_validation` and `scheduled`
    // need no DDL — and no back-fill either, deliberately: an existing ticket sits
    // in a state somebody genuinely put it in, and quietly re-deciding history is
    // how a report stops being believable. New tickets get the new ladder.
    //
    // TWO TICKET TYPES ARE ADDED, never swapped. The sub-tabs (5.1) are DERIVED
    // from the team's own live `Ticket type` values, so this migration only has to
    // make sure the two words the feedback names — Issue and Request — exist.
    // Retiring Feedback and Bug is CHECKLIST 2.1 and belongs to the words lane;
    // adding here and retiring there compose, whichever order they land in.
    version: "0028_ticket_and_story_facts",
    sql: `
ALTER TABLE help ADD COLUMN app_id TEXT REFERENCES apps (id);
ALTER TABLE help ADD COLUMN raised_by_contact_id TEXT REFERENCES accounts (id);
ALTER TABLE help ADD COLUMN validated_at TEXT;
CREATE INDEX idx_help_app ON help (app_id);

ALTER TABLE stories ADD COLUMN story_type TEXT;
ALTER TABLE stories ADD COLUMN review_note TEXT;
ALTER TABLE stories ADD COLUMN review_file_url TEXT;
ALTER TABLE stories ADD COLUMN review_file_name TEXT;

-- FILES AND LINKS ON A TICKET. \`kind\` is checked in the schema rather than in
-- code because it decides how \`url\` is READ — a key inside the tickets bucket,
-- or an address a browser follows — and a third value would be a row nothing
-- knows how to render.
CREATE TABLE help_attachments (
  id TEXT PRIMARY KEY,
  help_id TEXT NOT NULL REFERENCES help (id),
  kind TEXT NOT NULL CHECK (kind IN ('file', 'link')),
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);
CREATE INDEX idx_help_attachments_help ON help_attachments (help_id);

-- EVERY PROCESS ONE STORY TOUCHES. The pair is unique on LIVE rows only, so
-- unlinking a map and linking it again later is allowed and the old row stays.
CREATE TABLE story_processes (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories (id),
  process_id TEXT NOT NULL REFERENCES processes (id),
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT
);
CREATE UNIQUE INDEX idx_story_processes_pair ON story_processes (story_id, process_id);
CREATE INDEX idx_story_processes_story ON story_processes (story_id);

-- The story types SCOPE names, seeded the way every other vocabulary here is:
-- ADDED, never swapped, and one statement per value (D1's compound-SELECT
-- ceiling is five terms, which 0018 learned the hard way).
${["Fix", "Feature", "Change"]
  .map(
    (v) => `INSERT INTO selectable_data (id, type, value, is_default, created_at, creator_id, creator_email, creator_name)
SELECT lower(hex(randomblob(16))), 'Story type', ${sqlString(v)}, 1, datetime('now'), NULL, NULL, 'System'
 WHERE NOT EXISTS (SELECT 1 FROM selectable_data s WHERE s.type = 'Story type' AND s.value = ${sqlString(v)});`
  )
  .join("\n")}

-- The two ticket types the sub-tabs need a word for.
${["Issue", "Request"]
  .map(
    (v) => `INSERT INTO selectable_data (id, type, value, is_default, created_at, creator_id, creator_email, creator_name)
SELECT lower(hex(randomblob(16))), 'Ticket type', ${sqlString(v)}, 1, datetime('now'), NULL, NULL, 'System'
 WHERE NOT EXISTS (SELECT 1 FROM selectable_data s WHERE s.type = 'Ticket type' AND s.value = ${sqlString(v)});`
  )
  .join("\n")}
`,
  },
  {
    // ── AN APP BECOMES A RECORD, not a name with a URL on it ──────────────────
    //
    // FOUR CONTEXT FIELDS, and they are the reason this migration exists. An app
    // row carried a name, an address and a free-typed stage: enough to list one,
    // nowhere near enough to brief anybody. The tester was emphatic that these
    // earn their keep twice over, for onboarding a person and for the assistant
    // answering a question about the system. They are long prose, so they are
    // TEXT columns rather than a table — one app has exactly one answer to each,
    // and a table would be four rows pretending to be a collection.
    //
    // \`key_actors\` is prose too, deliberately. "Who this is for" is a sentence
    // about the CLIENT's world ("the two dispatchers, and whoever is on the
    // counter"), not a list of our users — the people an app is about rarely
    // hold a login here at all.
    //
    // STAGE STOPS BEING TYPED. The column does not change; what changes is that
    // the eight names the agency already uses arrive as ordinary dropdown values
    // with the mark it already recognises each one by, so the form offers them
    // instead of asking somebody to remember whether they wrote "live" or "Live"
    // last time. Pick-or-create like every other vocabulary this file seeds: a
    // team that typed its own stage keeps it, and the eight sit beside it. The
    // names, marks and order are read off the legacy data, not invented — see
    // shared/app-stages.ts, which also carries the one thing a dropdown row
    // cannot say: whether a stage means the app is still being worked on.
    //
    // WHICH APP A MEETING WAS ABOUT. Nullable: plenty of meetings are about the
    // account rather than one of its systems, and NOT NULL here would make the
    // diary refuse the first kickoff call.
    version: "0029_app_record",
    sql: `
ALTER TABLE apps ADD COLUMN about TEXT;
ALTER TABLE apps ADD COLUMN client_context TEXT;
ALTER TABLE apps ADD COLUMN solution TEXT;
ALTER TABLE apps ADD COLUMN key_actors TEXT;

ALTER TABLE meetings ADD COLUMN app_id TEXT REFERENCES apps (id);
CREATE INDEX idx_meetings_app ON meetings (app_id);

-- ONE STATEMENT PER VALUE, generated from the shared list — D1's compound-SELECT
-- ceiling is FIVE terms, which 0018 learned the hard way.
${APP_STAGES.map(
  (s) => `INSERT INTO selectable_data (id, type, value, mark, is_default, created_at, creator_id, creator_email, creator_name)
SELECT lower(hex(randomblob(16))), ${sqlString(SELECTABLE_GROUPS.appStage)}, ${sqlString(s.name)}, ${sqlString(s.mark)}, 1, datetime('now'), NULL, NULL, 'System'
 WHERE NOT EXISTS (SELECT 1 FROM selectable_data s WHERE s.type = ${sqlString(SELECTABLE_GROUPS.appStage)} AND s.value = ${sqlString(s.name)});`
).join("\n")}
`,
  },
  {
    // WHO IS ON AN APP, AND WHO THE CLIENT'S PERSON IS (CHECKLIST 8.10 + 8.5).
    //
    // Two tables and not one, because the two questions are about two different
    // populations that live in two different databases. STAFF are our own people
    // — a `user_id` from the GLOBAL core's `team_members`, which is why there is
    // no foreign key here and cannot be. STAKEHOLDERS are the client's people —
    // an `accounts` row of type individual, in THIS database, which is why that
    // one does carry its reference. A single table with a "kind" column would
    // have had one pointer meaning two incompatible things, which is the shape
    // that produces a join nobody can write.
    //
    // WHY THEY MATTER MORE THAN THEY LOOK. Three separate asks were blocked on
    // the staff table alone: "my tickets" means tickets on the apps I am staffed
    // to (2.3), a story's assignee narrows to that app's staff (6.6), and the
    // Done button belongs to the app's team lead (6.10). None of them is a
    // feature on its own — each is one clause once this row exists.
    //
    // ONE LEAD, ONE MAIN, ENFORCED BY THE INDEX RATHER THAN BY A CHECK. A
    // partial unique index is the only version of "exactly one" that survives
    // two people pressing save at the same moment (CONCURRENCY.md): a read-then-
    // write check would let both through. The partial clause is what lets a
    // RETIRED lead's row stay on the record — deactivate, never delete — without
    // occupying the one live slot.
    //
    // THE MEMBERSHIP INDEX IS UNIQUE ACROSS BOTH STATES, deliberately: adding
    // somebody who was taken off the app again re-activates the row they already
    // have rather than inserting a second one, so the record keeps one history
    // per person instead of a pile of tombstones.
    version: "0030_app_staff_and_stakeholders",
    sql: `
CREATE TABLE app_staff (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps (id),
  user_id TEXT NOT NULL,
  is_lead INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);
CREATE UNIQUE INDEX idx_app_staff_person ON app_staff (app_id, user_id);
CREATE INDEX idx_app_staff_user ON app_staff (user_id);
CREATE UNIQUE INDEX idx_app_staff_lead ON app_staff (app_id) WHERE is_lead = 1 AND deactivated_at IS NULL;

CREATE TABLE app_stakeholders (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps (id),
  contact_id TEXT NOT NULL REFERENCES accounts (id),
  is_main INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);
CREATE UNIQUE INDEX idx_app_stakeholders_person ON app_stakeholders (app_id, contact_id);
CREATE UNIQUE INDEX idx_app_stakeholders_main ON app_stakeholders (app_id) WHERE is_main = 1 AND deactivated_at IS NULL;
`,
  },
  {
    // WHAT AN HOUR OF A ROLE COSTS US, AND WHICH ROLE DOES A PROCESS (8.13).
    //
    // Aurora's model for "hours and money given back", settled over the owner's:
    // the money is the hours saved times THE RATE OF THE ROLE THAT DOES THE WORK,
    // before minus after. The app had two rate cards and neither could answer it
    // — `rates` is what an ACCOUNT is charged, `internal_rates` is what a KIND OF
    // WORK costs us — so this is the third: a price per role.
    //
    // IT IS AN INTERNAL NUMBER AND R24 IS ABSOLUTE ABOUT IT. The table is read
    // only from workers/tenancy/src/lib/internal-money.ts, every door that reads
    // it refuses a portal caller, and nothing in web-portal/ may name it. The
    // rule's own sentence is why it lives beside the internal rate card rather
    // than beside the account one: a condition can be inverted, an import cannot
    // be forgotten.
    //
    // \`role_name\` ON THE PROCESS, not on the step. The feedback's sentence is
    // "for each process, record which role does it" — one process is one kind of
    // work done by one kind of person, and a role per step would ask somebody to
    // answer the same question eleven times to get one number. Free text against
    // the team's own role vocabulary rather than a foreign key to `member_roles`:
    // the person who does a client's invoicing is THEIR bookkeeper, not one of
    // our logins, so the roles being priced are not roles anybody here holds.
    version: "0031_role_rate_card",
    sql: `
CREATE TABLE internal_role_rates (
  id TEXT PRIMARY KEY,
  role_name TEXT NOT NULL,
  cents_per_hour INTEGER NOT NULL DEFAULT 0 CHECK (cents_per_hour >= 0),
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);
CREATE UNIQUE INDEX idx_internal_role_rates_role ON internal_role_rates (role_name) WHERE deactivated_at IS NULL;

ALTER TABLE processes ADD COLUMN role_name TEXT;
`,
  },
  {
    // THE DIARY LEARNS THREE THINGS (CHECKLIST 9.2, 9.4 and 9.7).
    //
    // \`transcript_file_id\` + \`transcript_captured_at\` — WHICH transcript was
    // read off Drive and WHEN. Two columns rather than one because they answer
    // two different questions: the id is what a person opens, and the timestamp
    // is the idempotence predicate. Capturing a transcript ticks "held" and
    // writes a work log per participant, and both of those are things that must
    // happen exactly once however many times the button is pressed — so the
    // write rides \`transcript_captured_at IS NULL\`, which is R17 for a job
    // rather than a status.
    //
    // \`recurring_event_id\` — the Google series an entry belongs to. It was
    // being thrown away: the calendar read asks for \`singleEvents=true\`, which
    // expands a series into instances and hands back the parent's id on each
    // one, and nothing kept it. Without it the app cannot tell the eleventh
    // Monday stand-up from a one-off, which is the whole of 9.7.
    //
    // NOT A UNIQUE INDEX, unlike \`google_event_id\` beside it: a series has many
    // instances and every one of them carries the same parent id. The instance's
    // own id is what stays unique, and it already is.
    //
    // AND A WORK LOG MAY NOW POINT AT A MEETING. The allow-list is code
    // (\`WORK_LOG_TARGETS\`), not schema — the column deliberately has no CHECK —
    // so this migration adds the INDEX that makes the new target cheap to read
    // and the allow-list is widened in the same commit.
    version: "0032_meeting_transcripts_and_series",
    sql: `
ALTER TABLE meetings ADD COLUMN transcript_file_id TEXT;
ALTER TABLE meetings ADD COLUMN transcript_captured_at TEXT;
ALTER TABLE meetings ADD COLUMN recurring_event_id TEXT;
CREATE INDEX idx_meetings_recurring ON meetings (recurring_event_id);
`,
  },
  {
    // WHO MAY READ WHAT, IN TWO PLACES THAT ASK THE SAME QUESTION (12.3 + 4.9).
    //
    // ── ONE COLUMN, AND WHY IT IS NOT \`app_id\` ─────────────────────────────
    // The knowledge base had exactly two settings: the team's, or one person's
    // (\`owner_user_id\`). The owner asked to "choose what information in the
    // knowledge base is accessible by whom", and the gap was the middle: a source
    // somebody wants kept off a wider audience INSIDE the agency without making
    // it answerable to themselves alone.
    //
    // The answer rides a fence the app already has rather than inventing an
    // access-control list. 8.11 already decided that only the staff on an app
    // (plus an admin) open it, and \`app_staff\` is where that lives — so a source
    // can now say "the people on this app", and the sentence a reader has to
    // learn is one they already know.
    //
    // A SECOND COLUMN RATHER THAN A MEANING ON \`app_id\`, and this is the load-
    // bearing bit: \`app_id\` is the SWEEP's. It says what a mirrored source is
    // ABOUT and is rewritten on every pass (knowledge-ingest.ts's upsert sets
    // \`app_id = excluded.app_id\`). A person's decision about who may read
    // something cannot live in a column a background job overwrites. Two columns,
    // two owners, no collision.
    //
    // NULL means the team's, so every row that exists keeps exactly the reach it
    // had. No back-fill: the absence IS the old behaviour.
    //
    // ── AND THE PERMISSION ROW BESIDE IT ───────────────────────────────────
    // "Everything with permissions should be configurable" (Aurora, 17 Aug). Who
    // may see everyone ELSE's tasks was hard-coded to "everybody" — so it becomes
    // an ordinary module row on the tall sheet, and the door narrows a caller
    // without it to their own name through the \`assigneeId\` filter it already
    // parses. \`is_default\` is 1 on the locked Admin role alone, so it doubles as
    // the bit: Admin gains it in full, every other role gains nothing. The same
    // shape as 0007, 0013, 0018, 0019, 0021 and 0024. New teams don't reach this
    // — their seed writes the rows already, and it writes this one OFF.
    version: "0033_knowledge_visibility_and_task_sight",
    sql: `
ALTER TABLE knowledge_sources ADD COLUMN visible_to_app_id TEXT REFERENCES apps (id);

INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
SELECT lower(hex(randomblob(16))), r.id, 'all_tasks', r.is_default, r.is_default, r.is_default, r.is_default
  FROM member_roles r
 WHERE NOT EXISTS (
   SELECT 1 FROM role_permissions p WHERE p.role_id = r.id AND p.module = 'all_tasks'
 );
`,
  },
  {
    // ── THE WORDS, AND THE GLYPH BESIDE EACH ONE ──────────────────────────────
    //
    // CHECKLIST 2.1 and 2.2 settle the vocabulary: a ticket is a Question, an
    // Issue, a Request, an Extra or Requirements, and a story is a Fix, a
    // Feature or a Change. Two of the old ticket words go — Aurora retired
    // Feedback and Bug, and this is a "what", so hers is the answer.
    //
    // RETIRED, NEVER DELETED. Every ticket ever filed as a Bug still says Bug:
    // the row is deactivated, so it vanishes from the pickers and from its
    // sub-tab while every historic record reads exactly as it was written. That
    // is deactivate-not-delete applied to a WORD, and it is the whole reason the
    // Dropdown values screen has an Activate button.
    //
    // AND THE MARK (CHECKLIST 11.8, UI-RULEBOOK G2). One glyph per type, in the
    // slot an icon would take, so a list of forty is readable without reading.
    // It is set as DATA rather than written into a component, which is the
    // fourth of the four conditions UI-CONVENTIONS §5 puts on a type mark: a
    // team changes any of these on its own Dropdown values screen. Only rows
    // with no glyph yet are touched, so a team that has already chosen one keeps
    // it. Sprint types already carry theirs (0025).
    //
    // Extra and Requirements deliberately get none: the agency's legacy data has
    // no pictograph for either, and an invented one would be a guess wearing the
    // authority of a seeded default. A missing mark costs nothing — the WORD is
    // always beside it (condition three), so it is never the only thing carrying
    // the meaning.
    version: "0034_ticket_and_story_vocabulary",
    sql: `
INSERT INTO selectable_data (id, type, value, is_default, created_at, creator_id, creator_email, creator_name)
SELECT lower(hex(randomblob(16))), 'Ticket type', 'Requirements', 1, datetime('now'), NULL, NULL, 'System'
 WHERE NOT EXISTS (SELECT 1 FROM selectable_data s WHERE s.type = 'Ticket type' AND s.value = 'Requirements');

UPDATE selectable_data SET deactivated_at = datetime('now'), deactivator_name = 'System'
 WHERE type = 'Ticket type' AND value IN ('Feedback', 'Bug') AND deactivated_at IS NULL;

UPDATE selectable_data SET mark = '❓' WHERE type = 'Ticket type' AND value = 'Question' AND mark IS NULL;
UPDATE selectable_data SET mark = '⚠️' WHERE type = 'Ticket type' AND value = 'Issue' AND mark IS NULL;
UPDATE selectable_data SET mark = '💭' WHERE type = 'Ticket type' AND value = 'Request' AND mark IS NULL;
UPDATE selectable_data SET mark = '🐛' WHERE type = 'Story type' AND value = 'Fix' AND mark IS NULL;
UPDATE selectable_data SET mark = '✨' WHERE type = 'Story type' AND value = 'Feature' AND mark IS NULL;
UPDATE selectable_data SET mark = '🔀' WHERE type = 'Story type' AND value = 'Change' AND mark IS NULL;
`,
  },
  {
    // THE WHOLE CALENDAR ENTRY, NOT A LINK TO IT — and a Drive share that can be
    // one FILE.
    //
    // ── WHY THE MIRROR COLUMNS ────────────────────────────────────────────────
    // The owner: "All the other information, like location, stakeholders, or any
    // other calendar data or metadata, should be pulled in and organised
    // correctly." Until now a meeting kept two facts about its diary entry — the
    // id and the link — and every other fact (who was invited, who accepted, who
    // called it, where to join, what was attached) was reachable only by asking
    // Google again, live, with the reader's own token.
    //
    // That is not a small inconvenience. It means the facts are unavailable to
    // ANYBODY BUT THE PERSON WHOSE CONNECTION PUSHED THE MEETING, unreadable when
    // Google is slow, and impossible to put in a list — fifty rows would be fifty
    // calls. A meeting record that cannot say who was in the room is a record of
    // a conversation with the conversation left out.
    //
    // THEY ARE A MIRROR AND THEY SAY SO. Every one is prefixed \`google_\`, and
    // \`google_synced_at\` says when it was last true. Nothing in the app WRITES
    // to Google through these columns — the four calendar doors do that, against
    // the live entry — so there is no direction in which they can disagree with
    // Google and win. If they are stale, the sweep is behind; the entry is right.
    //
    // TWO OF THEM ARE JSON, which this database already does in a dozen places
    // (\`files_json\`, \`plan_json\`, \`tool_calls_json\`, \`preview_json\`) and for the
    // same reason: a guest list is a LIST OF THE EVENT, not a table of its own.
    // Nothing joins to it, nothing sorts by it, and nothing outside the meeting
    // ever asks a question of it — an \`event_attendees\` table would be five
    // hundred rows a week whose only reader is the row above them.
    //
    // ── \`from_calendar\`, AND WHY IT DECIDES WHAT A RE-SYNC MAY OVERWRITE ──────
    // Two kinds of meeting carry a \`google_event_id\` and they are NOT the same
    // record. One was typed in kwapso and pushed out; the other was read IN off
    // somebody's diary. A re-sync that rewrote the title of both would quietly
    // undo a person's own words the moment Google's copy differed — which it
    // will, because the push writes "BERG-M0007 · Kickoff" and the diary says
    // "Kickoff".
    //
    // So the flag records WHERE THE ROW CAME FROM, once, at insert. Google owns
    // the words of a row it authored; kwapso owns the words of a row it authored;
    // and the \`google_*\` mirror is refreshed on both, because those are Google's
    // facts either way. \`notes\` is never touched by a sync at all — it is the one
    // column in this module that only a person writes.
    //
    // ── AND A SHARE THAT IS ONE FILE ─────────────────────────────────────────
    // \`google_sources.kind\` splits what was one word. The owner: "In Drive, why
    // is it that it's only folder-wise? What if it had to be file-wise?" It did
    // not have to — a folder was only ever the thing the form could spell, which
    // made sharing one contract mean sharing everything filed beside it. The
    // fence does not change shape: what is named is the only thing readable, and
    // a named file is exactly one file.
    version: "0035_calendar_depth_and_file_shares",
    sql: `
ALTER TABLE meetings ADD COLUMN google_join_url TEXT;
ALTER TABLE meetings ADD COLUMN google_organizer TEXT;
ALTER TABLE meetings ADD COLUMN google_attendees_json TEXT;
ALTER TABLE meetings ADD COLUMN google_attachments_json TEXT;
ALTER TABLE meetings ADD COLUMN google_status TEXT;
ALTER TABLE meetings ADD COLUMN google_recurrence TEXT;
ALTER TABLE meetings ADD COLUMN google_time_zone TEXT;
ALTER TABLE meetings ADD COLUMN google_updated_at TEXT;
ALTER TABLE meetings ADD COLUMN google_synced_at TEXT;
ALTER TABLE meetings ADD COLUMN from_calendar INTEGER NOT NULL DEFAULT 0;

-- WHAT WAS SAID, ON THE MEETING ITSELF.
--
-- The owner: "For older meetings, the call transcript should automatically be
-- here." HERE is the word that decides these four columns. A transcript reachable
-- only by whoever holds the Drive connection, only while Google answers, is not
-- on the meeting — it is a link to somewhere else, and the reason this module
-- exists at all is that \`agenda\` and \`notes\` had nowhere else to live either.
--
-- AND IT IS WHAT MAKES THE TRANSCRIPT ANSWERABLE WITHOUT A SECOND INGESTION
-- PATH. The knowledge base sweeps rows of THIS database on a cron, as nobody in
-- particular; everything Google is swept per person, with that person's token,
-- only when they are here (lib/knowledge-google.ts's header says why that
-- separation is load-bearing). Text sitting in a column is on the near side of
-- that line: the ordinary \`meeting\` ingest kind reads it like any other row, in
-- the client's own compartment, with no token and no special case.
--
-- \`transcript_text\` is CUT to what one row may hold and \`transcript_note\` says
-- so when it was — the same rule and the same words a knowledge file uses
-- (\`capToRow\`), because "never silently trimmed" is the promise, not "never
-- trimmed".
--
-- \`transcript_found_by\` records WHICH of the three hunts found it — the event's
-- own attachments, a shared Drive folder, or a Google notice in the mail. It is
-- kept because the three are not equally trustworthy and a person asking "how do
-- you know that is the transcript of THIS call" deserves an answer.
ALTER TABLE meetings ADD COLUMN transcript_text TEXT;
ALTER TABLE meetings ADD COLUMN transcript_note TEXT;
ALTER TABLE meetings ADD COLUMN transcript_url TEXT;
ALTER TABLE meetings ADD COLUMN transcript_found_by TEXT;

-- EXISTING ROWS THAT CAME OUT OF A CALENDAR. Before this migration the only
-- writer of \`recurring_event_id\` was the series sweep, so a row carrying one is
-- a row Google authored — which makes this back-fill a reading of history rather
-- than a guess about it. A meeting pushed OUT of kwapso never had one.
UPDATE meetings SET from_calendar = 1 WHERE recurring_event_id IS NOT NULL;

-- The backward sweep asks "which of these event ids do I already have?" over a
-- window of a few dozen. The unique index on \`google_event_id\` already serves
-- that lookup; this one is for the OTHER question the sweep asks — which rows
-- Google owns the words of — on a table where nearly every row answers no.
CREATE INDEX idx_meetings_from_calendar ON meetings (from_calendar) WHERE from_calendar = 1;

-- A FOLDER, A FILE, OR A SPACE. Defaulting to 'folder' keeps every Drive row
-- exactly what it already was; the one UPDATE names the Chat rows for what they
-- have always been, so no row is left describing itself wrongly.
ALTER TABLE google_sources ADD COLUMN kind TEXT NOT NULL DEFAULT 'folder';
UPDATE google_sources SET kind = 'space' WHERE service = 'chat';
`,
  },
  {
    // WHAT WE HAND OVER (CHECKLIST 8.7). A DELIVERABLE is a piece of material we
    // hand over on an app: a handover doc, an API reference, a recorded
    // walkthrough, an SOP. The owner's own list, and the reason the item sat
    // parked for weeks is that nobody had said what the word meant.
    //
    // IT BELONGS TO AN APP, NOT TO AN ACCOUNT, and \`app_id\` is NOT NULL because
    // of it. The legacy app hung these off the app too (glide/RECONCILIATION.md:
    // 8 rows, "Name, type, a content URL and a thumbnail"), and the reason is the
    // one that whole file opens with: the customer is the owner, the APP is the
    // unit of work. A handover doc with no system to hand over is not a record
    // anybody could file.
    //
    // \`account_id\` IS DENORMALISED FROM THE APP, exactly as \`processes\`,
    // \`process_versions\` and \`process_steps\` carry it: written once from the
    // app at creation, never edited, so the account fence rides ONE clause with
    // no join the day a client is ever shown these. It is the fence built now,
    // switched off now (R21: every door on this module refuses a portal caller);
    // what it is NOT is a column somebody has to back-fill later under pressure.
    //
    // \`url\` IS ONE COLUMN FOR TWO SHAPES — an object we host (a
    // /media/internal/… URL the upload door mints) or a link we do not (a Loom
    // recording, a Google Doc, an API reference). The same sentence
    // \`brand_assets.file_url\` makes, and for the same reason help_attachments
    // gives at length: "here is the thing I mean" is ONE act, and two columns
    // would be two lists, two counts and two ways to be wrong about which is set.
    //
    // \`image_url\` is the picture on the card. Separate from \`url\` because a
    // Loom link has no thumbnail of its own and a PDF is not its own preview —
    // "some have a picture worth showing" is a fact about the deliverable, not
    // about its material.
    //
    // \`kind\` is the word in small caps on the card (VIDEO, SOP). A dropdown
    // vocabulary rather than an enum, like every other word this app lets a team
    // choose: the five below are the starting set, and a team that hands over
    // something we have not thought of adds it on its own Dropdown values screen.
    //
    // \`dated_on\` is a calendar DAY, written YYYY-MM-DD through \`optionalDate\` —
    // nobody hands a deck over at 14:32:07.
    version: "0036_deliverables",
    sql: `
CREATE TABLE deliverables (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps (id),
  account_id TEXT REFERENCES accounts (id),
  title TEXT NOT NULL,
  kind TEXT,
  dated_on TEXT,
  url TEXT,
  image_url TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);
-- The one question this table is ever asked: what has been handed over on this
-- app, newest first. The date leads the index because it leads the order.
CREATE INDEX idx_deliverables_app ON deliverables (app_id, dated_on);
CREATE INDEX idx_deliverables_account ON deliverables (account_id);

-- ONE STATEMENT PER VALUE, generated from the shared list — D1's compound-SELECT
-- ceiling is FIVE terms, which 0018 learned the hard way. Guarded by WHERE NOT
-- EXISTS so a team that already types one of these words keeps its own row.
${DELIVERABLE_KINDS.map(
  (v) => `INSERT INTO selectable_data (id, type, value, is_default, created_at, creator_id, creator_email, creator_name)
SELECT lower(hex(randomblob(16))), ${sqlString(SELECTABLE_GROUPS.deliverableKind)}, ${sqlString(v)}, 1, datetime('now'), NULL, NULL, 'System'
 WHERE NOT EXISTS (SELECT 1 FROM selectable_data s WHERE s.type = ${sqlString(SELECTABLE_GROUPS.deliverableKind)} AND s.value = ${sqlString(v)});`
).join("\n")}
`,
  },
  {
    // THE ONE RECORD IN THIS APP A PERSON RECOGNISES BY SIGHT, and the only one
    // whose picture had nowhere to live.
    //
    // The apps screen is a wall of tiles precisely because an app is known by
    // its mark (\`app-tiles.tsx\`, UI-RULEBOOK K9) — and every tile drew the same
    // stage glyph, because the column this migration adds did not exist. The
    // legacy app it replaced showed the client's real logo on all twenty-eight,
    // which is how the gap was noticed: two screens side by side, one of them
    // full of gears.
    //
    // The data settles the argument rather than taste: 26 of Glide's 28 apps
    // carry a picture (glide/RECONCILIATION.md § the work engine), so this is a
    // column with rows waiting for it, not a field somebody might one day fill.
    //
    // ONE COLUMN, NOT TWO. An account has a logo AND a cover because a company
    // record has a masthead to fill; an app is only ever seen as a square in a
    // grid or a square on its own heading, so a second image would be a column
    // no screen has a place for.
    //
    // It holds what the two doors that write it produce: a \`/media/<key>\` path
    // minted by \`storeImageDataUrl\`, the same seam the account logo has used
    // since 0024. Nothing else — the picker downsizes in the browser, the door
    // puts the bytes in R2, and the row keeps the path.
    version: "0037_app_logo",
    sql: `
ALTER TABLE apps ADD COLUMN logo_url TEXT;
`,
  },
  {
    // THE CALENDAR BECOMES ONE-WAY, AND THE WALK THAT MAKES "EVERYTHING" TRUE.
    //
    // The owner, 18 August 2026: "disable the ability to create, edit, or delete
    // anything in the calendar from the frontend… just make it one-way so we only
    // grab and update the information", and beside it "anything in my calendar
    // should be up to date here. That's all."
    //
    // ── \`calendar_swept_through\` ─────────────────────────────────────────────
    // ONE column, holding ONE moment: how far a forward-only walk over the whole
    // calendar has read. The live window (a fortnight back, four weeks on) is
    // swept on every call and keeps the diary current; this cursor is what lets a
    // FIVE-YEAR window be read a ninety-day slice at a time without any single
    // request being unbounded (R14). It sits on the CONNECTION because the walk
    // is one person's own diary read with one person's own token — a team-level
    // cursor would mean one colleague's progress deciding another's.
    //
    // NULL means "never walked", which the reader turns into the floor. There is
    // deliberately no back-fill: a null that reads as "start at the beginning" is
    // the only value that cannot be wrong.
    //
    // ── AND THE SWITCH THAT NOW SWITCHES NOTHING ────────────────────────────
    // \`google_events\` ("Calendar on your behalf") existed to carry one right:
    // may kwapso put an event in your calendar. Nothing can, on any surface, so
    // the row is deleted rather than left on the Roles screen offering a
    // capability the code does not have. That is the same reasoning R24 makes
    // structurally: a permission somebody can grant, guarding nothing, is a
    // sentence the app cannot keep.
    //
    // Deleting a permission ROW is not deleting data about the agency's work —
    // the deactivate-never-delete rule is about records, and this is a column of
    // the permission matrix being retired. Same shape as 0025, which purged two
    // whole modules.
    version: "0038_calendar_one_way",
    sql: `
ALTER TABLE google_connections ADD COLUMN calendar_swept_through TEXT;

DELETE FROM role_permissions WHERE module = 'google_events';
`,
  },
]

export type Actor = { id: string; email: string; name: string }

/** Default dropdown values every new team starts with (from Base v3). The four
 * optional fields are the enrichment 0025 folded onto the sprint types — a mark,
 * the German label, the sentence that explains the block, and how long one
 * normally runs. Absent on every other group, which is the honest shape: a file
 * type has no standard length. */
export type DefaultSelectable = {
  type: string
  value: string
  mark?: string | null
  nameDe?: string | null
  description?: string | null
  standardDays?: number | null
}

export const DEFAULT_SELECTABLE: DefaultSelectable[] = [
  { type: "File type", value: "Image file" },
  { type: "File type", value: "Image link" },
  { type: "File type", value: "Video file" },
  { type: "File type", value: "Video link" },
  { type: "File type", value: "Other file" },
  { type: "File type", value: "Other link" },
  // THE FIVE WORDS THE AGENCY ACTUALLY USES (CHECKLIST 2.1), each carrying the
  // mark it is recognised by (11.8, UI-RULEBOOK G2). "Feedback" and "Bug" are
  // gone from the starting vocabulary: Aurora retired them, and a "bug" is an
  // Issue and "feedback" is a Request in the words of the people who file them.
  // Existing teams keep their rows — migration 0034 DEACTIVATES those two rather
  // than deleting them, so every historic ticket still reads correctly.
  //
  // It is still an EDITABLE list, not an enum: a team adds its own on the
  // Dropdown values screen, and sets its own glyph beside each word there.
  { type: "Ticket type", value: "Question", mark: "❓" },
  { type: "Ticket type", value: "Issue", mark: "⚠️" },
  { type: "Ticket type", value: "Request", mark: "💭" },
  { type: "Ticket type", value: "Extra" },
  { type: "Ticket type", value: "Requirements" },
  // THE THREE KINDS OF WORK (CHECKLIST 2.2), same shape and same reason. They
  // reached existing teams through migration 0028 and were never in the seed, so
  // a brand-new team's story form offered an empty picker.
  { type: "Story type", value: "Fix", mark: "🐛" },
  { type: "Story type", value: "Feature", mark: "✨" },
  { type: "Story type", value: "Change", mark: "🔀" },
  // Display-only labels for the five built-in states. The status the code trusts
  // is HELP_STATUSES in shared/types.ts — these rows are what a team may reword
  // on screen, and renaming one can never move a ticket.
  { type: "Ticket status", value: "New" },
  { type: "Ticket status", value: "Triaged" },
  { type: "Ticket status", value: "In progress" },
  { type: "Ticket status", value: "Ready" },
  { type: "Ticket status", value: "Resolved" },
  // THE SPRINT TYPES: the two SCOPE ch.02 names that the delivery catalogue has
  // no word of its own for, and then the catalogue itself. A "blueprint" is a
  // PRICED PLANNING sprint, not a type (BUILD-1 §3), so it is a price on a
  // Planning row rather than a value here.
  //
  // The ten catalogue rows are the old `programs` table — the ways this agency
  // actually runs an engagement, each with its mark, its German name, what the
  // block includes and how long it normally runs. Implementation appears in both
  // SCOPE's three and the catalogue's ten, so it is listed ONCE and the
  // catalogue's richer row is the one that survives. Editable like every other
  // dropdown value: this is a starting vocabulary, not an enum, and a team that
  // runs three kinds of sprint retires the rest on its own screen.
  { type: "Sprint type", value: "Planning" },
  { type: "Sprint type", value: "Iteration" },
  ...SPRINT_TYPE_CATALOGUE.map((t) => ({ type: "Sprint type", ...t })),
  // Display-only labels for the four story states. The states the code trusts
  // are STORY_STATUSES in shared/types.ts — rewording a row here can never move
  // a story, exactly as with the ticket labels above.
  { type: "Story status", value: "Open" },
  { type: "Story status", value: "In progress" },
  { type: "Story status", value: "In review" },
  { type: "Story status", value: "Done" },
  // THE TWO GROUPS THE LEGACY APP NEVER HAD. Sixteen of its 154 dropdown values
  // carried no group: ten countries, five company-size bands and one stray
  // hyphen. They could have become two FIELDS on the account; the owner ruled
  // for two GROUPS instead, and the reason is the one the whole module exists
  // for — a country typed free into an address is a country spelled five ways.
  //
  // These are a STARTING vocabulary, like the ticket types above: the ten legacy
  // country labels arrive with the migration and pick-or-create into this same
  // group (a label already here is a no-op, a new spelling is a new row), and a
  // team adds or retires any of them on the Dropdown values screen. The hyphen
  // is not carried across — it is not a value, it is a typo.
  { type: "Country", value: "Germany" },
  { type: "Country", value: "Austria" },
  { type: "Country", value: "Switzerland" },
  { type: "Country", value: "Spain" },
  { type: "Country", value: "Andorra" },
  { type: "Country", value: "United Kingdom" },
  { type: "Company size", value: "1–10" },
  { type: "Company size", value: "11–50" },
  { type: "Company size", value: "51–200" },
  { type: "Company size", value: "201–500" },
  { type: "Company size", value: "More than 500" },
  // The company record's other two vocabularies, written once in
  // COMPANY_VOCABULARY so a NEW team's seed and an EXISTING team's migration
  // (0024) can never offer two different starting sets.
  ...COMPANY_VOCABULARY,
  // THE FIVE DEPARTMENTS a task belongs to, from the same shared list migration
  // 0027 hands to teams that already exist — so a newborn team and an upgraded
  // one offer the same five words. Their mark and colour are NOT here: a
  // dropdown row has nowhere to put them, and they live beside the rule each
  // department implies (shared/departments.ts).
  ...TASK_DEPARTMENTS.map((d) => ({ type: SELECTABLE_GROUPS.department, value: d.name })),
  // WHERE AN APP HAS GOT TO — the eight stages the agency already uses, each
  // with the mark it recognises the stage by. Same shape as the departments
  // above and the sprint types before them: a newborn team and a team upgraded
  // by migration 0029 offer the same eight words, and either can add a ninth on
  // its own Dropdown values screen. The active/inactive answer each stage
  // implies is not here, because a dropdown row has nowhere to put it — it
  // lives beside the vocabulary in shared/app-stages.ts.
  ...APP_STAGES.map((s) => ({ type: SELECTABLE_GROUPS.appStage, value: s.name, mark: s.mark })),
  // WHAT KIND OF THING WE HANDED OVER — the five words a deliverable's card
  // shows in small caps. Same shape and same reason as the stages above: a
  // newborn team and a team upgraded by migration 0036 offer the same starting
  // set, and either can add a sixth on its own Dropdown values screen.
  ...DELIVERABLE_KINDS.map((v) => ({ type: SELECTABLE_GROUPS.deliverableKind, value: v })),
]

/**
 * Build the one seed script a newborn team database runs: the locked Admin
 * role, the read-only Viewer role, their permission sheets, and the default
 * dropdown values. Returns the script plus the Admin role id (the creator's
 * membership points at it).
 */
export function buildTeamSeed(
  actor: Actor,
  now: string
): { script: string; adminRoleId: string; viewerRoleId: string } {
  const adminRoleId = ulid()
  const viewerRoleId = ulid()
  const a = (extra: string[]) =>
    [sqlString(now), sqlString(actor.id), sqlString(actor.email), sqlString(actor.name), ...extra].join(", ")

  const statements: string[] = [
    `INSERT INTO member_roles (id, title, description, is_default, created_at, creator_id, creator_email, creator_name) VALUES (${sqlString(adminRoleId)}, 'Admin', 'Default role, full access, can''t be edited.', 1, ${a([])});`,
    `INSERT INTO member_roles (id, title, description, is_default, created_at, creator_id, creator_email, creator_name) VALUES (${sqlString(viewerRoleId)}, 'Viewer', 'Read-only, can view everything, change nothing.', 0, ${a([])});`,
  ]

  for (const module of TEAM_MODULES) {
    // Default Viewer rights are read-only everywhere, with two exceptions.
    //
    // THE AGENT: everyone may USE it out of the box (read+create) — it still
    // can't exceed the user's other rights, so a Viewer's agent is read-only in
    // practice anyway.
    //
    // EVERYONE ELSE'S TASKS: off, like every right that widens what one person
    // sees of another's work. 4.9's ruling is "off by default for every role
    // except Admin", and the Admin row below is the one that says 1, 1, 1, 1 to
    // everything. A Viewer without it still sees their own tasks — the door
    // narrows, it does not refuse.
    const [vr, vc, ve, vd] =
      module === "agent" ? [1, 1, 0, 0] : module === "all_tasks" ? [0, 0, 0, 0] : [1, 0, 0, 0]
    statements.push(
      `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete) VALUES (${sqlString(ulid())}, ${sqlString(adminRoleId)}, ${sqlString(module)}, 1, 1, 1, 1);`,
      `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete) VALUES (${sqlString(ulid())}, ${sqlString(viewerRoleId)}, ${sqlString(module)}, ${vr}, ${vc}, ${ve}, ${vd});`
    )
  }

  // THE SEED RUNS AFTER THE MIGRATIONS, AND SOME OF THEM SEED TOO.
  //
  // `createTeam` applies every TEAM_MIGRATION and then runs this script, so any
  // value that appears BOTH in a migration's back-fill and in DEFAULT_SELECTABLE
  // was inserted twice into a brand-new team: the four ticket types (0009), the
  // three sprint types (0016), the six countries and five company-size bands
  // (0018). Every picker in the app then offered each of those words twice, which
  // is what a tester meant by "ticket types appear two, three and four times".
  //
  // The migrations already guard themselves with WHERE NOT EXISTS, because they
  // have to be safe against a team that already has the value. The seed did not,
  // because when it was written it ran into an empty table. It does now: this is
  // the migrations' own guard, said the same way, and it makes the seed safe to
  // run in any order against any state. A team that has genuinely retired a
  // default keeps its (deactivated) row rather than being handed a fresh live
  // copy of it — the same reason R13's catalogue reconcile is INSERT-only.
  //
  // Existing teams keep the duplicate rows they were born with; a duplicate is an
  // ordinary value and it is retired on the Dropdown values screen, which is what
  // that screen is for. workers/tenancy/test/team-schema.test.ts runs the real
  // migrations and this seed into SQLite and fails on any repeated (type, value).
  for (const item of DEFAULT_SELECTABLE) {
    statements.push(
      `INSERT INTO selectable_data (id, type, value, is_default, mark, name_de, description, standard_days, created_at, creator_id, creator_email, creator_name)
SELECT ${sqlString(ulid())}, ${sqlString(item.type)}, ${sqlString(item.value)}, 1, ${sqlString(item.mark ?? null)}, ${sqlString(item.nameDe ?? null)}, ${sqlString(item.description ?? null)}, ${item.standardDays == null ? "NULL" : item.standardDays}, ${a([])}
 WHERE NOT EXISTS (SELECT 1 FROM selectable_data s WHERE s.type = ${sqlString(item.type)} AND s.value = ${sqlString(item.value)});`
    )
  }

  return { script: statements.join("\n"), adminRoleId, viewerRoleId }
}
