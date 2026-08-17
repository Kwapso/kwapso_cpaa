# MCP.md — the machine door (how outside tools use Kwapso)

Kwapso has an **external machine surface**: an AI agent, a script, or an automation
can do the same things a person can — invite/manage members, read and write learning
and tickets, run imports, pull CSV exports, even talk to the in-app assistant — over the
**Model Context Protocol (MCP)**. This is the `mcp` worker (ARCHITECTURE → the MCP
front desk). This doc is for the **developer** who wants to connect a tool to it.

The one sentence to remember: **a machine acts AS a real person, in ONE team, capped
by that person's live role — never more.** There is no separate "API key with god
powers." A token is just that person, reached by a machine.

---

## 1 · Who can use it

Anyone on **your team** who holds a role that allows the actions they want. There is no
separate developer sign-up — the machine borrows a human's rights.

**Your clients cannot.** A client-portal contact is an ordinary team member by
construction (grant → invite → accept is the only way to make a working portal login),
so "can they sign in?" was never the right question — see §5. They are refused at both
doors: they cannot make a token, and a token cannot act for one.

So to give a teammate/contractor machine access:

1. **Invite them to the team** (Settings → Members → Invite, or the app's invite flow).
   They sign in with **email + a 6-digit code** (no passwords). Hand them the app URL:
   - Staging: `https://agency-staging.kwapso.app`
   - Production: `https://agency.kwapso.app`
2. **Give them the right role.** The token can only do what their role allows (see the
   cost note in §4 — a role *without* the AI-agent right can't spend any AI budget).
   For a pure "read + import + export" integration, a role with those rights and **no
   agent access** is the safe, zero-AI-cost choice.
3. They **make their own token** (next section). You never see or handle their secret.

Prefer a **dedicated service login** for an unattended integration: make one app
login (e.g. `ci@yourco.com`), invite it with a tightly-scoped role, and let it hold the
token — so a person leaving doesn't break the automation, and you can revoke it alone.

---

## 2 · Get a token (once, in the app)

1. Sign in → **Settings → Access tokens → New token**.
2. Give it a name (what will use it — "CI importer", "Zapier", "Claude Desktop").
3. Copy the secret **immediately** — it's shown **once** and never again (only its hash
   is stored). It looks like `kwapso_mcp_<64 hex chars>`.
4. The token is **pinned to the team you were in** when you made it, and **capped by
   your role at call time** (change the role later and the token's power changes with
   it). Revoke it any time from the same screen — revocation takes effect on the very
   next call.
5. **It expires after 90 days**, and you can hold **10 live tokens at once**. The
   screen shows each token's "works until" date; past it, calls come back
   `401 token_expired` and you make a new one (there is no renewal — a new secret is
   the point). Trying to mint an eleventh live token is a clean refusal: revoke one
   you no longer use first. Both limits exist for the same reason — a key with no end
   date is a key forever, and an unbounded pile of them is a pile you stop watching.

Treat the secret like a password. Anyone holding it can act as you, in that team.

---

## 3 · Connect a tool

The endpoint is **`POST https://<app-host>/mcp`** (JSON-RPC 2.0), authenticated with
`Authorization: Bearer <your token>`. It speaks standard MCP: `initialize`,
`tools/list`, `tools/call`.

**Quick check with curl:**

```bash
# List the tools this token can call
curl -s https://agency.kwapso.app/mcp \
  -H "Authorization: Bearer kwapso_mcp_XXXX" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call one — who am I, and which team is this token pinned to?
curl -s https://agency.kwapso.app/mcp \
  -H "Authorization: Bearer kwapso_mcp_XXXX" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"whoami","arguments":{}}}'
```

**An MCP client that speaks HTTP + a bearer header** (e.g. an agent framework, or a
custom client) points at that URL with the header. For clients that only launch a
local stdio command (e.g. **Claude Desktop**), put a thin MCP-over-HTTP bridge in
front with the standard `mcp-remote` shim — drop this into the client's MCP config:

```json
{
  "mcpServers": {
    "kwapso": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://agency.kwapso.app/mcp",
        "--header", "Authorization: Bearer kwapso_mcp_YOUR_TOKEN"
      ]
    }
  }
}
```

### Hand it to any AI (Claude / Gemini / GPT) — copy-paste prompt

The app does this for you: after you create a token, **Settings → Access tokens** shows
a **"Copy setup prompt for any AI"** button (and an **Instructions** button on every
active token) that copies the block below with the live host filled in. Paste it into
any assistant that can speak MCP:

```
Connect to my Kwapso workspace over MCP (Model Context Protocol).

Endpoint: https://agency.kwapso.app/mcp
Auth header: Authorization: Bearer kwapso_mcp_YOUR_TOKEN
Protocol: MCP over HTTP — JSON-RPC 2.0 (initialize, tools/list, tools/call)

Then call tools/list to see what I can do. You act as me, in one team, capped by my
role — reads, exports and imports are free; only the assistant tools (agent_chat,
agent_confirm, plan_import) use the team's AI quota.
```

(Staging is the same, on `https://agency-staging.kwapso.app/mcp`.)

### The tools

Confirm the live list with `tools/list` (it's generated, so it's always current).
Today it covers:

- **Read** — 57 tools, grouped the way the app groups them:
  - identity and rights — `whoami`, `my_permissions`, `get_team`
  - people and access — `list_members`, `list_roles`, `list_invites`,
    `list_portal_access`
  - customers — `list_accounts`, `get_account`
  - vocabulary — `list_dropdown_values`
  - learning — `list_learning`, `list_learning_progress`
  - tickets — `list_help_tickets`, `get_help_thread`, `list_help_stakeholders`
  - the work engine — `list_stories`, `list_sprints`, `list_todos`, `list_tasks`,
    `get_triage`, `list_work_logs`, `list_running_timers`
  - meetings — `list_meetings`
  - process maps and the money — `list_apps`, `list_processes`, `get_process`,
    `list_process_comments`, `read_value`, `list_account_rates`,
    `list_internal_rates`, `read_margin`
  - the knowledge base — `ask_knowledge`, `list_knowledge_sources`,
    `get_knowledge_status`
  - the agency's own housekeeping — `list_marketing_posts`, `list_brand_assets`,
    `list_programmes`, `list_meeting_purposes`, `list_staff_profiles`,
    `list_staff_certificates`
  - importing — `list_import_targets`, `get_import_sample`, `list_imports`,
    `get_import`
  - the AI allowance and saved conversations — `get_ai_allowance`, `list_ai_usage`,
    `list_agent_threads`, `get_agent_thread`
  - the nine CSV exports, listed under **Export** below.

  Each list tool that sits on a door with an
  `?id=` filter EXPOSES + FORWARDS it (R19 parity) — pass `id` to fetch one record
  instead of pulling the whole collection (`list_help_tickets` also takes `scope`,
  `view` — the everyday list or the archive drawer — and `q`; `list_accounts` takes
  `q`, `type`, `status`, `archived` and `parentId`; `list_stories` takes `q` beside
  its five). On every paged list the `total` counts the SAME filtered question the
  rows answer, so a narrowed call answers "how many are there?" in one round trip.

  **`my_permissions` is the one to call first.** `whoami` says who the token is and
  which team it is pinned to; `my_permissions` says what that person may DO there,
  module by module. Every door re-checks the same rights on every call regardless —
  this is simply how a client can know before it asks, instead of learning from a 403.

  **R19 now starts at the DOORS, and at ALL of them.** The parity check used to walk
  the tool catalogue, so a door with no tool wasn't a failure — it was invisible, which
  is how the whole customer spine sat off this surface with a green build. Moving the
  scan to the doors fixed that for doors that take a QUERY PARAMETER — and left every
  parameterless door just as invisible, which is where twenty capabilities were sitting
  (what may I do here, how much of the app's own daily AI allowance is left, what may I
  import into, what did that import plan say).

  So the census is now every non-admin door on tenancy, content, data-ops and auth —
  filtered or not, GET or POST. Each one has a tool on some machine surface or is a
  named, reasoned line in the check's `TOOLLESS_DOORS`, and a door that is neither is a
  red build. Today: **210 doors, 174 with a tool, 36 with a written reason** — the
  reasons being the team-pin doors (§3.2 below), the client-portal standing doors
  (§3.3), the sign-in and personal-identity doors on auth, the screen-recipe store,
  the three media uploads, the knowledge-base file upload (a data URL of an
  arbitrary document, which is not a shape a tool argument should carry), the seven
  Google doors that are a person's own decision, the timesheet correction, one
  invite's audit trail and the cross-module activity feed. Of the 174, **157 are on THIS surface** and 17 are the in-app assistant's
  alone — the thirteen Google tools, the three confirm-panel bulk writes and the role
  permission matrix read, each reasoned in §3. Those three numbers are asserted
  against the live census in `workers/mcp/test/filter-parity.test.ts`, so this
  sentence cannot quietly go stale again — it did, at 87 / 66 / 21, while the app
  grew to two and a half times the size.

  **One asymmetry worth stating plainly.** The in-app assistant now stops for a yes/no
  panel before every write that decides who-can-do-what — derived from the gate map,
  so anything gated on `member_roles:` or `team_members:` is included (EDGE-CASES §5). The MCP
  surface has **no such panel and cannot have one**: the confirming UI belongs to your
  client, not to Kwapso. That is not a capability gap — the same door, the same gate, the
  same audit row — but it means the operator of an MCP client is the one deciding when to
  confirm. If your client drives an LLM that reads team data (tickets, articles), treat
  those tools the way Kwapso does and put a human in front of them.

  **`list_help_tickets` is PAGED** (R14 — tickets are a growing collection). One call
  returns one page plus `total` (the exact server count, not the page length),
  `hasMore`, and an opaque `nextCursor`. To read further, call again passing that
  value as `cursor`; never construct or mutate one — a cursor the server didn't issue
  is refused with a 400. When `hasMore` is false you have reached the end. A client
  that ignores the cursor still works: it simply sees the newest page.
  **A result is whole, or it is an error.** One `tools/call` answer is capped at
  400,000 characters. Over that the call comes back `isError: true` with a
  `result_too_large` body telling you to filter, page, or use the export tool — it is
  never sliced and handed back as a success. (It used to be: half a JSON document,
  reported `ok`, which a client has no way to notice and no reason to re-ask.)

  **An argument of the wrong type is refused, not coerced.** The type each tool
  declares in its `inputSchema` is the type enforced, checked before the call is built:
  `{"name": {}}` comes back a clean `invalid_input` naming the field. It used to be
  coerced with `String(v)` and arrive at the door as the perfectly valid 17-character
  string `"[object Object]"` — a browser form cannot produce that, and a JSON-RPC
  client can send anything.

  **A call has a deadline.** A tool that doesn't answer within 30 seconds (2 minutes
  for `run_import`, `plan_import`, `agent_chat` and `agent_confirm`, which are supposed
  to take a while) comes back `door_timeout` rather than holding your call open with
  nothing to read. A timeout is not a rollback: read before retrying a write.
- **File uploads are not on this surface — three doors, one reason.**
  `/api/content/learning/upload`, `/api/content/brand-assets/upload` and
  `/api/content/staff/upload` each take up to 25 MB of base64 data URL, on a
  surface whose whole ANSWER is capped at 400,000 characters. The RECORD half of
  each is fully machine-writable — `create_brand_asset`, `save_staff_profile` and
  `create_staff_certificate` all carry the URL field — so a machine writes the row
  and references a file it already has a URL for. Uploading the bytes is a screen
  action.
- **Export (full-field CSV):** `export_roles_csv`, `export_learning_csv`,
  `export_dropdown_values_csv`, `export_accounts_csv`, `export_marketing_posts_csv`,
  `export_brand_assets_csv`, `export_programmes_csv`, `export_meeting_purposes_csv`,
  `export_certificates_csv`.

  **Staff PROFILES have no export, on purpose.** A credential register is the kind
  of thing somebody hands an auditor; a one-click spreadsheet of what each of your
  colleagues is bad at is not a capability anybody asked for, and the write door
  that fills those fields is confirm-gated for the same reason.

  **An export is ONE WHOLE DOCUMENT — never a page, and never a short file.** That is
  the deliberate answer to "why doesn't an export take a cursor?", and it is R14's own
  answer: all but one of these sit on **bounded** collections (a team's roles, its
  how-to articles, its dropdown vocabulary, its programmes, its meeting purposes, its
  brand assets, its staff certificates and what it has published about itself are all
  curated by hand and stop growing), and the law says in as many words that a bounded
  collection doesn't need a cursor to be
  honest. **Accounts is the one that grows** — every company and every person an agency
  works with — so `export_accounts_csv` narrows by the same five filters as
  `list_accounts` (`q`, `type`, `status`, `archived`, `parentId`), and past what one
  file can carry the door
  answers `export_too_large` rather than handing back the first rows as though they
  were all of them. The browser's Export CSV button gets exactly the same sentence from
  exactly the same door: a truncated export re-imported is data loss that looks like a
  round trip, and the columns lead with the import format precisely so it can be
  re-imported.
- **Write — deterministic create / edit / deactivate** (free, no AI; each needs the
  matching role right, e.g. `member_roles:create`):
  - the team — `update_team` (rename the team this token is pinned to; needs `teams:edit`)
  - learning progress — `mark_learning_done` (for yourself only)
  - roles — `create_role`, `update_role`, `set_role_active`, `set_role_permissions`
  - members — `set_member_role`, `remove_member` (people join via **invite**)
  - invites — `create_invite`, `revoke_invite`
  - accounts — `create_account`, `update_account`, `set_account_parent`,
    `set_account_active`, `link_contact`, `set_contact_link_active`
  - portal access — `grant_portal_access`, `set_portal_access_active`
  - dropdown values — `create_dropdown_value`, `update_dropdown_value`, `set_dropdown_value_active`
  - process maps — `create_app`, `update_app`, `set_app_active`, `create_process`,
    `update_process`, `set_process_active`, `add_process_step`, `update_process_step`,
    `remove_process_step`, `cut_process_version`, `comment_on_process` (all need
    `processes:*`). `read_value` beside them is the savings drilled App → Process →
    Step, with the caption that says what the numbers are made of — the times are
    estimates the agency and the client agreed, the subtraction is arithmetic. A step
    that got SLOWER is included and counted; nothing filters one out.
  - rates and margin — `create_account_rate`, `update_account_rate`,
    `set_account_rate_active` (what a client is charged) and `create_internal_rate`,
    `update_internal_rate`, `set_internal_rate_active` (what our own hour costs us),
    all needing `commercials:*`. **`read_margin` and `list_internal_rates` answer with
    the agency's own figures**: a token acts as its owner, and no client login can hold
    a token or be acted for at all, but if you are building a client-facing integration
    on somebody's staff token, these two are the calls not to relay. Law **R24** makes
    the same statement about the app's own client portal structurally — the file those
    figures live in cannot be reached from any door the portal opens. (R24, not R23 —
    R23 is the knowledge base's citation law.)
  - learning — `create_learning`, `update_learning`, `set_learning_active`
  - tickets — `create_help_ticket`, `update_help_ticket`, `set_help_status`,
    `resolve_help_ticket`, `rank_help_ticket`, `archive_help_ticket`,
    `reply_help_ticket`, `add_help_stakeholder`. (The module is Tickets; the tool NAMES carry the old
    `help` spelling because they are a published contract outside developers
    already call by name, so the rename of the section a person reads
    deliberately stopped at them — DATA-MODEL.md says why it never moves.)
    `rank_help_ticket` is how priority is expressed — the list's ORDER is the
    priority, and there is no priority field to set. `archive_help_ticket` puts a
    ticket away without deleting anything; read them back with
    `list_help_tickets` and `view: 'archived'`.
  - the work engine, stories and sprints — `create_story`, `update_story`,
    `set_story_status`, `rank_story` (`work:create` / `work:edit`), `create_sprint`,
    `update_sprint` and `complete_sprint`. `update_sprint` is where a sprint's flat
    PRICE is set or corrected — it is the revenue half of every margin, and until
    that door existed it could be typed only in the moment the sprint was started.
    It will not move a sprint to another client or another app: the reference the
    client quotes was minted against the account, and completing the sprint cuts a
    version of every process map inside its app.
    Priority here is the ORDER, exactly as it is on a ticket:
    `rank_story` moves a story, there is no priority field. No client login holds
    `work:*` and the doors refuse a portal caller outright, so unlike the ticket
    doors the question "what if a contact reaches this?" has a one-word answer.
  - to-dos and tasks — `raise_todo`, `complete_todo`, `cancel_todo`
    (`todos:create` / `:edit` / `:delete` — what we need FROM a client), and
    `create_task`, `set_task_done` (`work:create` / `work:edit` — what we owe
    ourselves).
  - time — `start_timer`, `stop_timer`, `log_time`, `resolve_runaway_timer`,
    `set_timer_auto_stop`, all on `work:create`. Logging your OWN hours is a create,
    not an edit: a person who may do the work may say how long it took them.
    CORRECTING a row that already exists is `work:edit` and has deliberately no tool
    at all — see the exclusions below.
  - the triage rota — `set_triage_duty` (`help:edit`), beside the `get_triage` read.
  - meetings — `create_meeting`, `update_meeting`, `set_meeting_held`,
    `set_meeting_active` (`meetings:create` / `:edit` / `:edit` / `:delete`;
    cancelling IS this module's delete and the row survives it), and
    `add_meeting_to_calendar`, which opens on `meetings:read` and then demands
    `google:edit` and the events switch at the door itself.
  - the agency's own housekeeping — `create_marketing_post`, `update_marketing_post`,
    `set_marketing_post_active` (`marketing:*`); `create_brand_asset`,
    `update_brand_asset`, `set_brand_asset_active` (`brand_assets:*`);
    `create_programme`, `update_programme`, `set_programme_active` and
    `create_meeting_purpose`, `update_meeting_purpose`, `set_meeting_purpose_active`
    (both `delivery:*`); `save_staff_profile`, `set_staff_profile_active`,
    `create_staff_certificate`, `update_staff_certificate`,
    `set_staff_certificate_active` (`staff_profiles:*`).
  - the knowledge base — `add_knowledge_source`, `update_knowledge_source`,
    `set_knowledge_source_active`, `sync_knowledge`, `sync_google_knowledge`. The
    same acts a person has on the Knowledge base screen, gated by the same
    `knowledge:create` / `:edit` / `:delete` rights — so a token whose role cannot
    take a source away cannot ask the assistant to take one away either.
    `sync_knowledge` brings the base into step with the app's own rows one bounded
    slice at a time (call it while `caughtUp` is false); the 15-minute sweep does the
    same unattended. `sync_google_knowledge` does the same for the Google material
    the CALLER has already connected — their own Drive folders, the mail with a
    known contact, their diary — acting as that person and gated `knowledge:create`
    **and** `google:read`. Read the Google paragraph below before you use it: it and
    `add_meeting_to_calendar` are the two tools on this surface that touch Google,
    and the posture around them is under review.

  **`ask_knowledge` never writes prose.** It answers with the passages it found and
  the SOURCES they came from, plus the compartment it searched and the sentence
  explaining why that one. When it finds nothing it says so — `found:false`, no
  passages, and a line to repeat instead of answering from memory (Law R23). A client
  building an answer out of it should quote the source titles; an answer with no
  citation is the exact failure that law exists to prevent.
- **Bulk create:** the import pipeline — `start_import` → `add_import_file` →
  `plan_import` → `run_import`. Accounts are importable AND exportable (they were
  importable only, which made the customer spine a one-way street).
- **The in-app assistant:** `agent_chat`, `agent_confirm`.

**Intentionally NOT on the machine surface — reasoned exclusions, not gaps.**

1. **The multi-row *mutation* tools** the in-app assistant uses —
   `bulk_set_help_status`, `bulk_set_learning_active`, and the set-shaped
   `set_help_status_by_filter` — are agent-only. They're built around the app's yes/no
   CONFIRM panel (a person approves the true count before a high-blast write runs); a
   headless MCP client has no such panel, so exposing them would be a blind mass-write.
   A machine client that needs the same effect composes the single-record writes above
   (each gated + audited identically). The bulk READ path — filtering a list to one
   record via `id` — IS on MCP (R19 parity).
2. **Teams — the PIN, not the word "team".** `list_teams`, `create_team` and
   `switch_team` are off both machine surfaces: a token is PINNED to one team by design
   (§5), and a tool that moved or made one would be the only way to widen that pin,
   which is the thing the pin exists to prevent. The two received-invitation doors are
   off for the same reason and more directly — accepting an invite JOINS another team
   and SWITCHES the session to it.

   RENAMING the pinned team is not that, and `update_team` is on this surface. It was
   agent-only on a reading of this exclusion that its own reason never supported: a
   rename moves nothing and reaches nowhere new. The same door, the same `teams:edit`
   gate, the same audit row.
3. **The client-portal standing doors** — `GET /api/tenancy/portal/context` and
   `POST /api/tenancy/portal/switch-account` — are off it too, and the reason is
   structural rather than a judgement call: they answer "which of *your own* companies
   are you standing in?", which is a question only a CLIENT login has, and a client
   login cannot hold a token at all (§5). For staff, both doors are already an honest
   empty answer. Adding them would be adding tools that no caller who can reach them
   has any use for.
4. **One invite's AUDIT trail and the cross-module ACTIVITY feed** are named, reasoned
   lines in the R19 census's `TOOLLESS_DOORS` — respectively: an invite's own state is
   already in `list_invites` and the audit is the forensic strip a person reads on its
   detail; and the activity feed is the one door whose answer is assembled by
   subtracting the caller's denied modules (R18), so putting the merged stream on this
   surface is a separate decision for the owner, not a parity default.

   The **role permission MATRIX** read is a surface asymmetry rather than a gap: the
   in-app assistant has `get_role_permissions`, and this surface reads the same matrix,
   flattened across every role and module, in `export_roles_csv`. One question, one way
   to ask it per surface.

5. **Auth's personal doors** — signing in, changing your login address, editing your
   name and photo, reading that identity history, and logging out — are off this
   surface. They write who the PERSON is, across every team they belong to; no team
   role gates any of them, so they sit outside the one-team, role-capped envelope a
   token promises. `whoami` and `my_permissions` are the machine's read of the same
   ground, inside it.

6. **The screen-recipe store and the learning media upload.** A recipe describes what
   the agency app RENDERS, and the only way to judge one is to look at the screen it
   draws; the upload is a base64 data URL up to 25 MB, two orders of magnitude past
   what one call here is built to carry. A machine writes the article and references
   media it already has a URL for.

7. **Four BODY FIELDS, across three doors that are otherwise fully here.** A tool
   may offer a narrower contract than its door accepts — but only in writing, and
   only for a reason. All of them are the same reason as item 6: **bytes, not
   prose.**
   - **`update_team` takes `name`, not `logoDataUrl`.** A logo is a base64 image data
     URL up to 2.5 MB — around 3.4 million characters of *argument* on a surface whose
     whole *answer* is capped at 400,000. Renaming is unaffected: the door treats an
     absent logo as "leave it as it is", so a machine rename can never blank a logo it
     cannot send. Set the logo in the app, on the Team screen.
   - **`complete_todo` takes `id`, not `fileDataUrl` or `fileName`.** A to-do's
     attachment is a base64 data URL up to 10 MB — around 14 million characters of
     argument on that same 400,000-character surface. And the file is the CLIENT's:
     "send us the signed contract" is answered by the person who has it, from their
     own portal. Marking the to-do done from a machine is a legitimate act — the
     thing arrived by email and somebody is tidying up — so `id` is exposed and
     forwarded and the capability is whole. `fileName` is read only inside the
     `if (body.fileDataUrl …)` branch, so offering it alone would be a field that
     changes nothing, which is worse than an absent one.
   - **`agent_chat` takes `message`, not `files`.** Attaching up to 8 CSVs of 5 MB each
     is up to 40 MB on the same surface — and the capability is already here in a
     better machine shape: `start_import` → `add_import_file` → `plan_import` →
     `run_import` is deterministic, resumable, and re-readable for free through
     `get_import` when a client loses a plan. Conversational file-drop is the shape a
     person supervises on a screen.

   Two other narrowings **were** here and are now closed, because neither had a reason
   that survived being written down: `create_role` takes its `permissions` matrix (the
   door demands `member_roles:edit` on top of `member_roles:create` when one arrives —
   its own double gate is the control, and the two-call path via `set_role_permissions`
   reached the same end state anyway), and `reply_help_ticket` takes `taggedUserIds` (a
   client login is refused mentions at the door and cannot hold a token at all, so every
   caller here is staff, inside the envelope the door already reasons about; the ids come
   from `list_members`, and the door still de-dupes them, strips your own, caps the list
   at 50 and resolves each through `team_members` so no address outside the team is
   reachable). **Law R22 keeps this list honest**: every field a write door reads must be
   in its tool's schema and forwarded by its `buildBody`, or be a named line beside the
   check — derived from the door's own source, so a fifth narrowing cannot land unseen.

Every tool is a thin forward to the **same gated door the app's own screens use** — so
input is validated, **your live role is re-checked** (a Viewer's `create_role` is
refused, exactly as in the UI), and the change gets the same audit trail and live-sync
as if a person had done it in the UI. The **deactivate-not-delete** model holds (nothing
is hard-deleted) and the locked guards fire even here (you can't remove yourself or the
last admin). A test (`workers/mcp/test/catalog.test.ts`) fails the build if the catalog
ever drifts from those real doors.

There is deliberately **no confirm step on the direct write tools** — calling
`remove_member` *is* the intent (like clicking through the UI's confirm). Route
genuinely uncertain, natural-language actions through `agent_chat` instead: it proposes,
you approve with `agent_confirm`.

**Google is almost entirely off this surface, and that is on purpose — but read
the exception.** The thirteen tools that BROWSE a person's Drive, Gmail, Calendar
and Chat (`google_drive_files`, `google_mail_search`, `google_send_mail`,
`google_chat_post` and the rest) belong to the **in-app assistant** and to nothing
else: no MCP tool forwards to any of those doors. A personal access token is a
secret pasted into somebody's CI config, and the blast radius of a leaked one
must not include a mailbox. If you need Google material browsed through a
machine, ask the assistant — `agent_chat` reaches those tools under the same
rights, with the same confirm rules (mail always asks), and spends the team's AI
allowance while doing so.

**Two tools DO cross that line, and the sentence above used to deny it.** They
are gated exactly as their doors are and neither reaches anybody else's account,
but both belong in front of you rather than in a catalogue you skim:

- **`add_meeting_to_calendar`** forwards to `POST /api/content/google/calendar/meeting`
  — a real Google door. It writes one entry, for a meeting already booked in
  kwapso, into the CALLER's own calendar, behind `meetings:read` + `google:edit` +
  the events switch, refusing a portal caller, and claiming the event id under a
  `google_event_id IS NULL` predicate so pressing it twice makes one entry. Its
  identical twin `google_sprint_to_calendar` — the same act for a sprint, the same
  three gates — is assistant-only. **One of those two placements is wrong and it is
  the owner's call which:** either a sprint should be pushable from a machine too,
  or a meeting should not be.
- **`sync_google_knowledge`** does not browse Google, but it does READ it: gated
  `knowledge:create` **and** `google:read`, it sweeps the caller's own connected
  Drive folders, the mail with a known contact and their diary into the knowledge
  base — from which `ask_knowledge`, also on this surface, hands the passages back.
  A leaked token therefore reaches its OWN owner's Google material by that route,
  which is narrower than the browse tools (nobody else's account, no send, no
  delete) but is not nothing, and is not what "the MCP catalogue exposes none of
  them" led a reader to expect.

Both are recorded here rather than quietly removed because taking a capability off
a published surface breaks somebody's script, and that is a decision with an owner.

Three Google doors have no tool on **either** surface, for a reason that is not
about caution: connecting an account is a person standing at Google's own consent
screen, and the credential it produces travels in an HttpOnly cookie no bearer
caller holds. Four more — disconnecting, and changing which folders and spaces
are shared — are decisions about **who can read what**, which is the one thing
this module exists to keep conscious. All seven are written down with their
reasons in `TOOLLESS_DOORS` (`workers/mcp/test/filter-parity.test.ts`), and the
check fails if one of them quietly grows a tool.

---

## 4 · Who pays? (the cost model — read this)

**Most tools cost you nothing beyond a normal API request.** Reads, exports, imports,
and token management are just calls to our Cloudflare Workers + databases — cheap, no
AI involved. The developer does **not** bring their own AI billing, and does **not**
pay Anthropic — they're hitting our endpoints.

**Two kinds of tool DO draw the team's AI budget** (because they use the assistant):

| Tool | AI cost | Bounded by |
|---|---|---|
| `agent_chat`, `agent_confirm` | Yes — one assistant turn each | The **team's AI quota** (free per day + purchased credits) AND needs the **AI-agent right** |
| `plan_import` | Yes — one assistant unit per plan | The team's AI quota |
| everything else | No | — |

**Where the knowledge tools fall.** `ask_knowledge` is a READ and sits on the free
side of that table: it spends ONE embedding of the question — a rounding error beside
an assistant turn — and no model writes a word. `sync_knowledge` spends one embedding
per CHANGED chunk and nothing at all for a row whose text has not moved, so filling the
base for the first time over an agency's entire history measured at roughly a cent, and
the steady state at about nothing. `agent_chat` and `agent_confirm` remain the only
tools here that draw a whole assistant turn.

That AI cost lands on **the team's quota** (our Anthropic key), **not** on the
developer. So two levers keep it under control:

1. **The quota is the ceiling.** All AI use — humans in the app + every machine token
   on the team — draws the same daily allowance (`AGENT_FREE_DAILY`, plus any
   top-up). When it's spent, `agent_chat` / `plan_import` return a clean "out of AI
   requests" (HTTP 429) until it resets or an admin adds credits. A runaway script
   can't run up an unbounded bill — it hits the quota wall.
2. **Scope the role.** A token can only call `agent_chat` / `agent_confirm` if its
   role holds the **AI-agent create right**. Give a developer a role **without** it and
   those tools return 403 — their token literally cannot spend agent AI budget. Reads,
   exports, and running a *pre-planned* import stay available. (`plan_import` is the one
   import step that uses AI — bounded by the quota like everything else.)

So your instinct is right for the cheap tools ("they're just hitting our endpoints") —
and for the AI tools, the allowance + the role are how you keep the cost yours-but-bounded,
or zero, by choice.

**And you can now read the allowance before you spend it.** `get_ai_allowance` returns
what the team has left of the app's own daily allowance (the free daily amount plus any
credits an admin has added); `list_ai_usage` shows where it went, one row per turn. Both
are free reads needing `agent:read`. Until they existed, 429 was the documented failure
mode of this surface and nothing on it could see 429 coming — a client learned the
allowance was gone by being refused. (Note what this is *not*: it is the app's own daily
allowance, set here, shared by everyone on the team. It is not your Anthropic account and
not a bill anyone outside this app sees.)

**A lost plan is recoverable without re-spending it.** `plan_import` costs one request
of that allowance; `get_import` re-reads the same plan for free. A client that dropped a
`plan_import` response should come here rather than plan again.

---

## 5 · Security posture (what a token can't do)

- **It is the agency's surface, not its clients'.** A client-portal login is refused
  both a new token and a session for an existing one.

  This is worth spelling out, because nothing was ever *bypassed* here. A client
  contact **is** a team member — that is how the portal works — so they hold a role,
  and their role holds `learning:read` for the ordinary reason that their own doors
  need nothing from it. Signing in at the AGENCY address and minting a token therefore
  let them call `list_learning` and `export_learning_csv` and receive every internal
  how-to article, in full, as a CSV. The gate ran and PASSED. What kept those articles
  private was that the client portal's own gateway refuses that door outright — "the
  team's how-to articles are INTERNAL and carry no account fence" — i.e. the protection
  was a **door-level** decision, and the machine surface had no door-level opinion at
  all.

  So it has one, in one sentence, asked in one place. Before minting, and before
  bridging a token to a session, the `mcp` worker asks **tenancy** — the worker that
  owns the fence — which kind of caller this is. It cannot answer that itself: the
  `portal_users` row lives in the per-team database and this worker holds no D1
  credential, and inventing a second way to decide who is a client is the exact thing
  interface-parity exists to prevent. The check **fails closed** in both directions: a
  caller who reads as a client is refused, *and so is one tenancy could not answer for*
  — a door that assumed "staff" whenever the check itself broke would hand the surface
  back to precisely the caller it excludes, on precisely the day something is wrong.
  Revoked grants count as client too: portal-ness is decided by the PRESENCE of the
  row, never by its absence.
  **How fresh is that answer?** The bridge mints one short-lived team-pinned session
  per token and re-uses it for **60 seconds**, so a burst of tool calls in one
  conversation shares one session instead of writing a session row each time —
  and nothing is cached until the staff check has passed. For that minute, then,
  a passed authorization decision stands without being re-asked, which is worth
  being precise about rather than waving at. The decision has **no transition to
  miss**: to hold a working token you must be an *active member* of the pinned
  team (auth's mint refuses anyone else, every time), and to read as a *client*
  you must have a portal-access row — which the only door that writes one refuses
  to give an active team member, because a client login would fence a colleague
  out of the agency app. The two states are mutually exclusive at every instant.
  That refutation isn't a paragraph to be taken on trust: `staff-only.test.ts`
  reads tenancy's and auth's own source and turns red if either refusal relaxes,
  which is the moment the cache goes rather than quietly becoming the hole.
  (Everything else stays live regardless: the token is re-verified per request, a
  revoke drops the cached session immediately, and every door re-runs
  `requireRight`, the account fence and the internal-material refusal on each
  call.)
- **Acts AS the owner, capped by their LIVE role** — re-checked on every call. Demote
  the person and the token weakens the same instant.
- **One team only.** The token is pinned to the team it was made in; it can never read
  or write another team's data (isolation by physics — separate databases).
- **No god mode.** The tool catalog is **opt-in** — only the listed, gated actions are
  exposed. Internal/maintenance endpoints, other people's device sessions, deleting the
  team: not in the catalog, structurally unreachable. Every write route gates on a
  permission (machine-checked — Law R10), so a tool can't skip the gate.
- **Writes are reversible + audited.** The write tools deactivate, never hard-delete;
  every change stamps an audit block (who + when) and the locked guards fire even here —
  you can't remove yourself or the last admin.
- **An assistant turn records that a MACHINE ran it.** `agent_chat` and `agent_confirm`
  reach the same handler the in-app assistant does, and that handler used to stamp every
  turn "in-app" — so a token-driven conversation was written into the team's history as
  if somebody had typed it. It now records the calling surface, derived from the session
  itself (a token's session is team-pinned; a browser's never is), so it is not something
  a caller can state about itself in a header. Nothing about rights changed; what changed
  is that after a leaked token, "did a token do this, or did a person?" has an answer.
- **Revoke bites immediately.** The token is re-verified on every request, so revoking
  it stops the next call — even if a session was mid-flight.
- **It runs out on its own.** Every token carries a deadline (90 days), checked beside
  the revoke check on every call, so a secret forgotten in an old CI config stops being
  a key whether or not anyone remembers it. A token row with no deadline is refused
  rather than trusted.
- **And it stays reachable.** One person holds at most 10 live tokens, and the settings
  list shows unrevoked ones first — so a token that still works is always on the
  screen, and always revocable. (It was previously possible to bury a live token behind
  more than 1,000 revoked ones and lose the ability to revoke it from the app.)
- **Hashed at rest.** Only the token's hash is stored; the secret is shown once.

**Two honest limits:**

1. **No per-token rate limit yet.** The non-AI tools (reads, exports, **and now
   writes**) aren't application-rate-limited — they lean on a token being a trusted,
   role-scoped, instantly-revocable party behind Cloudflare, and every write is
   reversible (deactivate-not-delete), audited, and one-team. If you hand a token to a
   *less*-trusted integration, prefer a tightly-scoped role, watch `last_used_at`, and
   a per-token rate limit is a small future add.
2. **`member_roles:edit` is a powerful right.** Anyone who can edit roles can grant
   permissions — including to their own role — exactly as in the UI (there's no separate
   admin tier). So give a machine token that right only when the integration genuinely
   manages roles; a read/import/export integration never needs it.

### An open question, decided — the calendar tool on this surface

`add_meeting_to_calendar` is on the machine catalogue. `google_sprint_to_calendar`
is not — it is the in-app assistant's only. The two do the same kind of act,
open with the same three gates, and were written the same day, and nothing
recorded which placement was intended. That asymmetry was raised with the owner
on 2026-08-14.

**The decision is to leave both where they are, for now, and the reason is a
measurement rather than a preference.** Nothing can reach that tool today: the
team holds **zero** Google connections (verification is still with Google) and
**zero** live machine tokens, and the tool additionally needs a connected
Calendar account and the "Calendar on your behalf" right. So the exposure is not
small, it is nil — while taking the tool off this surface is genuinely not a
small change. There is no opt-out in the catalogue: every `SHARED_TOOLS` entry
becomes an MCP tool (`workers/mcp/src/lib/tools.ts`, `MCP_TOOLS`), so removing
one means a new field on the shared type, a filter, and amendments to the R9,
R19 and R22 parity checks plus the tool census in this file. That is four laws
moved to close a door nobody is standing at, on the surface that is hardest to
test.

**Revisit the day Google verification lands** — before the first person connects
a Calendar, not after. The question to answer then is the one the owner should
answer with the facts in front of him: *should an outside developer holding a
personal access token be able to write into a colleague's calendar?* If the
answer is no, the work above is what it costs, and it is much cheaper to do
while the answer is still hypothetical than once integrations depend on it.

---

## 6 · For maintainers (where it lives)

`workers/mcp/` — `POST /mcp` (JSON-RPC) + session-gated token management under
`/api/mcp/tokens*`; the staff-only rule is `workers/mcp/src/lib/staff.ts` (called from
`postToken` and from the session bridge, held by `test/staff-only.test.ts`); the
human-facing card is `web/components/access-tokens.tsx`
(Settings → Access tokens). Tokens live in the core DB (`mcp_tokens`, migrations
`0013` + `0016` — `expires_at`, backfilled so applying it gives every existing token a
full term rather than killing it); the TTL and the per-person cap are
`MCP_TOKEN_TTL_DAYS` / `MAX_ACTIVE_MCP_TOKENS_PER_USER` in
`shared/workers/limits.ts`, and `workers/mcp/test/tokens.test.ts` runs the real
migrations against a real SQLite database to hold all three fixes in place.
A token is bridged to a **short-lived team-pinned session** via auth's
`/internal/mcp-session` (INTERNAL_KEY, fail-closed). The **agency** gateway routes
`/mcp` + `/api/mcp/*` to the worker; the mcp worker itself is `workers_dev:false`,
so that gateway is the only way in. The client portal's gateway does NOT bind the
mcp worker at all and refuses `/mcp` outright — the machine surface is not on the
client internet. See ARCHITECTURE.md (the `mcp` row) and DATA-MODEL.md
(`mcp_tokens` + `sessions.team_pin`).
