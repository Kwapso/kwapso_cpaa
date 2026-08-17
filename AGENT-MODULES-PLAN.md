# Agent + Modules, the build plan (LOCKED 2026-06-22; Phases 1–4 DONE 2026-06-23)

> **Status: SHIPPED (Phases 1–4).** Kept because OPERATIONS.md and DATA-MODEL.md
> cite it for the two deferred hooks (ticket attachments, agent auto-draft). For how
> the agent works TODAY, read MCP.md + EDGE-CASES §4–5; this file is the *why*.
>
> **"Help" below is the module now called Tickets.** It was renamed on
> 2026-08-11; there was never a help section *and* a ticket section, and there is
> no help section today. This file keeps the old word because it is the record of
> what was built under it. DATA-MODEL.md § *help + help_threads* has the current
> name and the four places `help` deliberately survives underneath.

The next big build on top of the shipped base: **learning + help + data import + the
AI agent + MCP**, as ONE continuous build on branch `agent-modules`, green at every
step, with a single staging ship at the end (owner gates production). The **54 product
decisions** behind this live in the design memory (two Q&A passes); this doc is the
ordered BUILD MAP. Don't relitigate decisions. See the design notes; ask only at a
genuine new fork.

**STATUS (2026-06-23):** Phases **1–4 are DONE** and green on branch `agent-modules`
(every worker of the day was on disk; learning + help + import + the in-app AI agent + the
UI wiring all shipped). **Phase 5 (quality + docs + ship) is IN PROGRESS**, these
docs are being reconciled now. **Still remaining:** ~~the external `mcp` worker~~ (SHIPPED 2026-07-07), a few small deferred hooks may remain (listed at the end).

> **HISTORICAL PLAN, where a detail below disagrees with the shipped truth, the
> manual wins** (BASE-MANUAL.md + EDGE-CASES.md). Details superseded since this
> was written: the confirm rule shipped NARROW (only the destructive acts —
> remove member, revoke invite, plus the bulk tools confirm-with-count; not the
> ">1 row OR delete-type OR dangerous table" heuristic in Phase 3A); Workers AI
> does FULL tool calling (not "text-only answers"); the chat later gained SSE
> streaming + a step log (Phase 2 of the round-4 overhaul); the brain is Claude
> Sonnet 5 when the key is set.

## Guiding rules (carried from the base build)
- **Green at every step**, `npm run check` passes after each phase.
- **The agent acts AS the signed-in user**, through the SAME gated endpoints the UI
  uses (no separate agent powers). Bounded by the invoker's permissions, always.
- **Agent = leverage, not a crutch**, the in-app experience is a VISIBLE co-pilot
  that drives the real screens (overlay + Stop); trivial use should feel slow.
- **R2 golden rule**, one bucket PER MODULE, per-team key prefix inside.
- **Live-sync**, every new mutation publishes a row-level ping; bulk = one list-ping.
- UI comes ONLY from `@kwapso/ui`, owner runs the library prompts; this repo
  wires what the library ships.

## Phases (in order)

### Phase 1. Foundation (no new UI). DONE
- **Team-schema migration `0004_modules`** (per-team, in `team-schema.ts`): `learning`,
  `learning_progress` (user×learning), `help`, `help_threads`, `data_import_sessions`,
  `agent_threads`, `agent_messages`. Each with the standard audit block.
- **Core migrations** (`db/core`): `0008 importable_databases` (GLOBAL
  owner-maintained import catalog) + `0009 agent_usage` (the free-daily quota
  counter) + `0010 agent_credits` (the purchasable balance, the credit-based
  quota landed as two tables: free 25/day + a top-up balance).
- **Permission matrix**. Add `screens` + `agent` to `TEAM_MODULES` + labels + seed
  (Admin full; others: agent read+create [use it], no screens, no edit/delete history
  beyond own). Import has NO key, gated by the target table's `create` right.
- **Shared types** for every new entity.
- Gate: `npm run check` green.

### Phase 2. Module server logic (no new UI). DONE
- **Learning** (`workers/content`): CRUD (editor-gated) + in-app body + sequence +
  pick-or-create category (→ `selectable_data`) + per-user `mark done` progress
  (curators see all). Keyword-searchable for the agent.
- **Help** (`workers/content`): ticket CRUD + threaded replies (@mention = notify) +
  fixed status lifecycle (open/in-progress/resolved/reopened; raiser reopens) + My/All
  tab queries + source screen/record capture. Email on reply/@mention. (The
  `kwapso-help-media` R2 bucket is bound, but the **attachment hook is DEFERRED** —
  see the remaining-work list.)
- **Import** (`workers/data-ops`): the 3-stage session against the global catalog;
  preview-then-write; one list-ping per table.
- All gated, all publish live pings; reuse `lib/notify.ts`.
- Gate: green + unit/integration tests for the guards.

### Phase 3. Agent brain + MCP

**3A/3B. Agent brain (`workers/data-ops`). DONE.** The swappable model interface
(Claude when `ANTHROPIC_API_KEY` is set, full tool use, so it can ACT; else Workers
AI, text-only answers; `cheapText` always Workers AI for cheap inline + the help-draft
fallback) ; the act-as-user executor calling the gated endpoints (forwarding the
caller's session cookie, never exceeding their rights) ; the confirm rule (>1 row OR
delete-type OR a dangerous table, roles/members/screens/import) ; the identity-act
hard-blocks (blocked by omission from the tool catalog + a backstop guard) ;
fence-untrusted-data (tool results return as fenced DATA, never instructions) ; the
credit-based quota gate (free 25/day + purchasable balance) ; agent-vs-human + source
audit ; saved threads in its own `agent_threads`/`agent_messages` tables ; a step cap +
multi-step stop-and-report.

**3C, `workers/mcp` (separate piece), ~~REMAINING~~ **SHIPPED 2026-07-07**.** personal access tokens (hashed,
shown-once, revocable, pinned to one team, live role-check) → bridged to a real
session ; the OPT-IN tool catalog (only tagged actions) ; abuse bounded by the quota.
NOT yet on disk (the gateway already exposes the in-app agent; this is the EXTERNAL
machine surface).

Gate: green + tests (token gating, confirm rule, fence, quota, tool catalog).

### Phase 4. UI wiring (depends on the library prompts landing). DONE
- The agent chat panel + the visible co-pilot overlay (drive real screens + Stop) ;
  learning screens (body + progress) ; the import wizard + preview ; help My/All tabs +
  ticket detail, all via the screen engine + the new library components. (Help
  attachments + the temporary-view recipes the agent generates are deferred, below.)

### Phase 5. Quality + docs + ship. IN PROGRESS
- Playwright e2e for the new flows ; lean-mean ≥92 ; story-check clean ; adversarial
  review of the diff → fix ; reconcile ARCHITECTURE/DATA-MODEL/CACHING/OPERATIONS/
  README (this pass) ; ONE `/ship-staging`. Owner tests, then gates production (apply
  new core 0008/0009/0010 + team `0004_modules` migs first; realtime-FIRST deploy
  order).

## Remaining work (after Phases 1–4)
- **The external `mcp` worker** (Phase 3C above), ~~not yet on disk~~ **SHIPPED 2026-07-07** (`workers/mcp`).
- **Help attachments**, the `kwapso-help-media` bucket is bound, but the upload hook
  isn't wired.
- **The agent's auto first-draft help reply**, the `cheapText` seam exists; the
  auto-draft-on-new-ticket hook is deferred.
- **The agent driving imports via chat**, import works as its own wizard; letting the
  agent run the import flow conversationally is deferred.
- **The agent generating temporary-view recipes**, deferred.

## New infra (BUILT 2026-06-23, except as noted)
- **R2 buckets**: `kwapso-help-media`, `kwapso-learning-media` (+ `-staging`), per-team
  key prefixes, bound to the content worker. (No `kwapso-import-media`. CSV text is
  uploaded into the import session, not R2.)
- **Workers**: `content` + `data-ops` BUILT ; `mcp` **BUILT 2026-07-07**, it routes the
  in-app agent and the external MCP surface, and it is not public: it is reached only
  through the agency gateway.
  **CORRECTED 2026-08-10:** this line used to call the gateway "the single public
  door". That stopped being true when the client portal shipped: there are two
  public doors now, the agency `gateway` and `portal-gateway`, and no more. It
  survived a month under the check written to catch exactly this sentence, because
  a line break landed in the middle of it (`web/test/doc-claims.test.ts` now
  collapses whitespace first). See OPERATIONS.md for the rule and BASE-MANUAL.md
  for why the portal's door is deliberately a different shape.
- Deploy order extends the realtime-first rule: realtime → auth → tenancy → content →
  data-ops → mcp → gateway → portal-gateway (anything a binder needs must exist first;
  data-ops binds content + tenancy, and both gateways bind the workers they forward
  to, so they go last). OPERATIONS.md is the live version of this order.
