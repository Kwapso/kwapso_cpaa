// THE master definition of what lives inside every team's own database, plus
// the seed rows a newborn team starts with (mirrors the user's Glide Base v3).
// Adding a future team-table = appending a migration here; the migration
// runner (POST /api/tenancy/admin/migrate-teams) rolls it to every team.

import { sqlString } from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"

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
    // The next-build modules (learning + help + import + the agent's saved
    // conversations), all per-team. See AGENT-MODULES-PLAN.md + the design notes.
    // Tickets are team-wide (My/All tabs = a creator filter, no row-level privacy).
    // Agent conversations get their OWN tables (not help's). Module file storage
    // lives in per-module R2 buckets with a per-team key prefix (not in D1).
    version: "0004_modules",
    sql: `
-- Learning: a team's how-to content. content_body is the in-app text the agent
-- reads to answer help; content_link points at external material. sequence is
-- display order only (nothing locked).
CREATE TABLE learning (
  id TEXT PRIMARY KEY,
  category TEXT,
  content_title TEXT NOT NULL,
  content_description TEXT,
  content_type TEXT,
  content_link TEXT,
  content_body TEXT,
  sequence INTEGER NOT NULL DEFAULT 0,
  is_required INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);

-- Per-user learning progress: an explicit, reversible "mark as done".
CREATE TABLE learning_progress (
  id TEXT PRIMARY KEY,
  learning_id TEXT NOT NULL REFERENCES learning (id),
  user_id TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  done_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (learning_id, user_id)
);

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
-- (lib/rates.ts vs lib/internal-money.ts) and is the law R23 checks.
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
-- MARKETING: what the agency publishes about itself — 251 posts across six
-- channels in the legacy app. \`channel\` is a STRING, pick-or-created against the
-- "Marketing channel" dropdown group, exactly as a learning article's category is
-- pick-or-created against "Learning category". That is what makes six channels a
-- canonical six instead of six spellings, without a second table to join.
--
-- \`published_on\` is a DATE (YYYY-MM-DD), not a timestamp: a post goes out on a
-- day, and storing an instant would invent a precision nobody typed. NULL is a
-- post that has not gone out yet, which is a real and common state.
CREATE TABLE marketing_posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  channel TEXT,
  status TEXT,
  summary TEXT,
  body TEXT,
  link TEXT,
  published_on TEXT,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);
CREATE INDEX idx_marketing_posts_channel ON marketing_posts (channel);
CREATE INDEX idx_marketing_posts_published ON marketing_posts (published_on);

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

-- THE DELIVERY METHOD, in two tables under one module.
--
-- A PROGRAMME is a way we run an engagement — the ten rows the legacy app used
-- to describe how delivery works. \`sequence\` is display order only, the same
-- meaning it has on a learning article: nothing is locked to it.
CREATE TABLE programs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sequence INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, creator_id TEXT, creator_email TEXT, creator_name TEXT,
  updated_at TEXT, editor_id TEXT, editor_email TEXT, editor_name TEXT,
  deactivated_at TEXT, deactivator_id TEXT, deactivator_email TEXT, deactivator_name TEXT
);

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
-- a table this database does not have. \`learning_progress.user_id\` has exactly
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
-- learning completions — which is why the columns are a CREDENTIAL's rather than
-- a completion's (an issuer, the day it was granted, the day it lapses, the
-- paper itself). A completion fits inside a credential; the reverse does not,
-- and the base already records "this person finished this article" in
-- learning_progress, so shaping these five rows as completions would have been a
-- second, weaker copy of a thing that already exists.
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
-- reason \`learning_progress.user_id\` and \`staff_profiles.user_id\` are: the
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
--
-- \`google_event_id\` is what makes the calendar push idempotent. Pressing "put it
-- in my calendar" twice must not make two entries, and the row is the only place
-- that memory can live (SCOPE ch.03: Google being an hour behind breaks nothing —
-- Google holding two copies of one meeting is not the same kind of harmless).
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
]

export type Actor = { id: string; email: string; name: string }

/** Default dropdown values every new team starts with (from Base v3). */
export const DEFAULT_SELECTABLE: { type: string; value: string }[] = [
  { type: "File type", value: "Image file" },
  { type: "File type", value: "Image link" },
  { type: "File type", value: "Video file" },
  { type: "File type", value: "Video link" },
  { type: "File type", value: "Other file" },
  { type: "File type", value: "Other link" },
  // The four types SCOPE ch.07 names, and no more. It calls this an EDITABLE
  // list, so these are a starting vocabulary rather than a fixed set — a team
  // adds its own on the Dropdown values screen, and the migration that brought
  // these to existing teams left their older types alone for the same reason.
  { type: "Ticket type", value: "Feedback" },
  { type: "Ticket type", value: "Bug" },
  { type: "Ticket type", value: "Question" },
  { type: "Ticket type", value: "Extra" },
  // Display-only labels for the five built-in states. The status the code trusts
  // is HELP_STATUSES in shared/types.ts — these rows are what a team may reword
  // on screen, and renaming one can never move a ticket.
  { type: "Ticket status", value: "New" },
  { type: "Ticket status", value: "Triaged" },
  { type: "Ticket status", value: "In progress" },
  { type: "Ticket status", value: "Ready" },
  { type: "Ticket status", value: "Resolved" },
  // The three sprint types SCOPE ch.02 names, and no more. A "blueprint" is a
  // PRICED PLANNING sprint, not a fourth type (BUILD-1 §3), so it is a price on
  // a Planning row rather than a value here. Editable, like the ticket types:
  // these are a starting vocabulary a team adds to on the Dropdown values screen.
  { type: "Sprint type", value: "Planning" },
  { type: "Sprint type", value: "Implementation" },
  { type: "Sprint type", value: "Iteration" },
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
    `INSERT INTO member_roles (id, title, description, is_default, created_at, creator_id, creator_email, creator_name) VALUES (${sqlString(adminRoleId)}, 'Admin', 'Default role — full access, can''t be edited.', 1, ${a([])});`,
    `INSERT INTO member_roles (id, title, description, is_default, created_at, creator_id, creator_email, creator_name) VALUES (${sqlString(viewerRoleId)}, 'Viewer', 'Read-only — can view everything, change nothing.', 0, ${a([])});`,
  ]

  for (const module of TEAM_MODULES) {
    // Default Viewer rights are read-only everywhere, EXCEPT the agent: everyone
    // may USE it out of the box (read+create) — it still can't exceed the user's
    // other rights, so a Viewer's agent is read-only in practice anyway.
    const [vr, vc, ve, vd] = module === "agent" ? [1, 1, 0, 0] : [1, 0, 0, 0]
    statements.push(
      `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete) VALUES (${sqlString(ulid())}, ${sqlString(adminRoleId)}, ${sqlString(module)}, 1, 1, 1, 1);`,
      `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete) VALUES (${sqlString(ulid())}, ${sqlString(viewerRoleId)}, ${sqlString(module)}, ${vr}, ${vc}, ${ve}, ${vd});`
    )
  }

  for (const item of DEFAULT_SELECTABLE) {
    statements.push(
      `INSERT INTO selectable_data (id, type, value, is_default, created_at, creator_id, creator_email, creator_name) VALUES (${sqlString(ulid())}, ${sqlString(item.type)}, ${sqlString(item.value)}, 1, ${a([])});`
    )
  }

  return { script: statements.join("\n"), adminRoleId, viewerRoleId }
}
