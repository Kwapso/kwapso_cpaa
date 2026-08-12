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
