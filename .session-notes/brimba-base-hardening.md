# Brimba — Base Hardening (R13–R19 + B/C fixes)

Workstream: porting 20 downstream (Acrymold ERP) defects into the base as machine-checked laws + security/agent/UI fixes. **Mission is COMPLETE** — final Part-H report delivered. This file is the durable record + the owner-gated remainder.

## CURRENT STATE — DONE + SHIPPED TO STAGING (not production)

- All 5 slices merged to `main` (`--no-ff`) and **pushed to GitHub**. Latest main includes the merge of `harden/docs-cleanup` + the reports/exclusion commits (HEAD ≈ `3bebf0b`+ the interface/exclusion commit).
- **Deployed to STAGING** (all 7 workers realtime-first, gateway last). Core migration **0014 applied to `brimba-core-staging`**.
- `npm run check` GREEN: **342 tests** (19 auth · 69 tenancy · 25 content · 84 data-ops · 19 mcp · 5 realtime · 121 web), 0 type errors.
- Gates all pass: lean **94/A**, interface-lessness **96/A**, security **0 critical/0 high** (1 documented LOW), story **2 issues found + reconciled**. Every new check **sabotage-proven**.
- Branch at handoff: `harden/docs-cleanup` (merged to main already). Working tree clean.

## WHAT SHIPPED (7 new laws R13–R19 + B/C)

- **R13 catalog-coverage** — import catalogue self-heals against code on READ (`reconcileCatalog` in `data-ops/lib/import.ts`, INSERT-only `ON CONFLICT DO NOTHING`; picker does NOT pre-filter is_active in SQL — filters in memory; by-key door heals on miss only; seed door = labels only, no longer re-activates). `CATALOG_EXEMPT` in registry pins non-importable modules. Check: `workers/data-ops/test/catalog-coverage.test.ts`.
- **R14 bounded-lists** — every `list*`/`search*` worker read caps via `shared/workers/limits.ts` (LIST_HARD_CAP 1000, EXPORT_HARD_CAP 10000, THREAD_HARD_CAP 500, BULK_IDS_LIMIT 500). Check: source-scan in `web/test/rules.test.ts`.
- **R15 live-collections** — `TEAM_RESOURCES` MOVED from app-shell.tsx to `web/lib/live-resources.ts` (+ a `selectable_data` entry — was deaf before); `SIMPLE_INVALIDATIONS` {team,screens}; `DEAF_EXEMPT` {help_threads,agent_usage} in registry. New `web/lib/live-bus.ts` + `use-live-refetch.ts` for paged screens. Check derives publisher set from `publishChange` calls.
- **R16 counted-collections** — exact server COUNT(*) via ONE seam `web/lib/format-count.ts` (floored abbrev; zero/loading render nothing; only capped SEARCH total gets "+"). List doors return `total` (+ help `mineTotal`, thread `total`). `total:<prefix>:<teamId>` cache sidecar primed by list fetchers, ±1 on add/remove. Arbitration: `web/components/counted-tabs.tsx` (CountedTabs/CountedAbove context) + `collection-heading.tsx` (stands down when a tab wins). Check in rules.test.ts + `web/test/format-count.test.ts`.
- **R17 idempotent-transitions** — the 4 transition writers (setRoleActive, setSelectableActive, setLearningActive, help setStatus) carry current-status predicate INLINE + `RETURNING id`, return boolean; routes publish only when a row moved; bulk counts no-op as skipped. Check: source-scan.
- **R18 activity-gate-coverage** — team activity feed subtracts denied modules via `activityVisibilityClause` (tenancy/lib/activity-read.ts); `ACTIVITY_GATE_MAP` + `ACTIVITY_TABLE_EXEMPT` registry data; routes/team.ts record scope resolves through same map. Check: source-scan.
- **R19 agent-filter-parity** — 5 list tools + help expose+forward door `?id=`/scope; check derives door params from routes' searchParams.get. Check: `workers/mcp/test/filter-parity.test.ts`.
- **R10 widened** — `workers/mcp/test/gating-seam.test.ts` (identity-gated non-GET routes).
- **B1** — login codes inbox-only: DEV_ECHO_CODES deleted (code+var+.dev.vars+.example+wrangler); admin test-login door `POST /api/auth/admin/test-login` (x-admin-key = ADMIN_KEY on auth, STAGING ONLY, fails closed). `auth/lib/login-codes.ts` mint shared by both doors. smoke + e2e use it. Check: `workers/auth/test/login-door.test.ts`.
- **B2** — internal doors (send-email, log-error, mcp-session) FAIL CLOSED (`!env.INTERNAL_KEY ||`).
- **B3** — atomic attempt cap (one UPDATE `WHERE ... AND attempts < ? AND consumed_at IS NULL`), login + email-change.
- **B4** — `preview_urls:false` on all 6 non-gateway workers (top-level + env.staging).
- **B5** — exemption sets are DATA in registry (DEAF_EXEMPT, ACTIVITY_TABLE_EXEMPT, CATALOG_EXEMPT).
- **C1** — ErrorBoundary MOUNTED in `web/app/layout.tsx` (around routed screens + AgentHost); `web/test/hooks-order.test.ts` fails any hook after a depth-1 early return.
- **C2** — `AGENT_MAX_TOKENS=4096` (data-ops/lib/model.ts) both providers; new set-shaped `set_help_status_by_filter` → door `POST /api/content/help/bulk-status-by-filter` (facets only, dryRun counts first, idempotent, one activity row, coarse publish if moved); bulk cap declared in tool schemas (maxItems); dropdown-never-invents rule (tool desc + SYSTEM prompt).
- **C3** — core mig **0014** adds `agent_usage_log.kind` (action|prompt|NULL). Visibility `kind='action' OR actor_id=?`; fold APPENDS (`summary || ' · ' || ?`), sets kind='action'; usage dialog renders via library ActivityFeed; teammate redacted row = "A question they asked (private)". `credit-reconcile.test.ts` updated to the append contract.
- **C4/C5** — action rows flex-wrap+ml-auto (import-screen, access-tokens, install-prompt); brand-mark object-contain; gen-icons LOGO_SAFE_RATIO=0.76.

## KEY DECISIONS + WHY

- **R8 text AMENDED** (not replaced): R8 owns WHICH collection a tab describes (countCacheKey); R16 owns the NUMBER; R16 prevails on conflict.
- **Arbitration is a React CONTEXT, not a prop** — "does a counted tab strip exist?" is per-permission; a prop would be silently wrong for untested roles.
- **set_help_status_by_filter is AGENT-ONLY (not MCP)** — confirm-gated mass writes have no MCP confirm panel; documented as intentional exclusion in MCP.md + tool-catalog header. Interface meter counts it as intentional, not a gap.
- **ADMIN_KEY on auth is STAGING-ONLY** — its holder can sign in as any account; production auth must NEVER have it (verified: prod auth has only INTERNAL_KEY + RESEND).
- **God-files NOT split** (Part D) — agent.ts 649, deep-link-screen 548 etc. are cohesive single-responsibility; splitting = shuffling to move a number. Deleted dead abbreviateCount only.
- **Sabotage caught 2 scanner bugs** in hooks-order.test (React.-prefixed hooks; destructured-param braces mistaken for body) — both fixed; proves the sabotage step's value.

## BROWSER VERIFICATION DONE (staging, throwaway `basecheck-<ts>@swiftstruck.com` via test-login)

- B1: "Code sent — check your email" toast, NO code echoed (old TEMP gone).
- Auth end-to-end: test-login → verify → onboarding → team created → /active WORKS.
- R16: tabs showed Members 1 · Member roles 2 · Dropdown values 14 (exact server totals); Invites showed nothing (0); no duplicate count (arbitration).
- C3: redesigned Assistant usage dialog renders (empty state).

## OPEN / EXCEPTIONS (documented in the report §5–7)

1. **Smoke's FIXED account 500s** — `delivered@resend.dev`'s team row points at a DELETED D1 database (stale pointer from a prior reset). NOT a code regression (fresh account works). 2/18 smoke checks fail on this. Error confirmed via admin errors endpoint: "Cloudflare D1 API failed: The database 9d4eb79c-... could not be found" on GET /api/tenancy/active.
2. **Gate 7 (separate clean-clone security review)** — folded into the security_sentry refute-by-default pass (a helper agent hit the session limit). New surface adversarially verified (params-bound SQL, fail-closed door, R18 clause, usage visibility).
3. **Real server-paging** not built — R14 caps at hard ceiling; paging is documented next step.

## OWNER MUST DECIDE
- Reset-all staging (or NULL the smoke account's current_team_id) to make the fixed-account smoke pass. Code already proven via throwaway account. Recommendation: reset-all staging (owner-gated, destructive).
- Accept the staging test-login tradeoff (recommended).

## PRODUCTION READINESS (owner-gated — DO NOT deploy prod myself)
- Apply core **0014_usage_log_kind** to `brimba-core` (production) BEFORE deploying data-ops (else usage-log writes silently fail).
- **Do NOT set ADMIN_KEY on production auth.** All INTERNAL_KEYs already set every env (verified).
- Deploy order unchanged: realtime → auth → tenancy → content → data-ops → mcp → gateway.
- Everything is on GitHub main + live on staging.

## DOWNSTREAM IMPACT (apps already on the base adopting v8)
- MOVED seam: `TEAM_RESOURCES` app-shell.tsx → `web/lib/live-resources.ts` (repoint imports).
- New build-red per-module requirements: R13 TargetDef/exempt, R14 caps, R15 listener, R16 total+formatCount, R17 predicate, R18 gate-map, R19 filter parity (checklist in BUILD-A-MODULE.md).
- Apply db/core/0014. Tests switch sign-in to admin test-login door.
- Additive: list doors return total/mineTotal; the 4 transition writers return boolean (was void — safe to ignore).

## FILES TOUCHED (major)
- NEW: shared/workers/limits.ts · web/lib/{format-count,live-resources,live-bus,use-live-refetch}.ts · web/components/{counted-tabs,collection-heading}.tsx · workers/auth/src/lib/login-codes.ts · db/core/0014_usage_log_kind.sql · tests: login-door, gating-seam(mcp), filter-parity(mcp), catalog-coverage(data-ops), hooks-order(web), format-count(web).
- CHANGED: shared/rules/registry.ts (R13-R19 + exempt maps) · RULES.md · CLAUDE.md · shared/workers/tool-catalog.ts (id filters, exclusion note) · workers/auth/src/index.ts + lib/email-change.ts + env.ts + wrangler.jsonc · workers/{tenancy,content}/src/lib/*.ts + routes/*.ts (caps, R17, counts) · workers/data-ops/src/lib/{agent,credits,import,model,tools}.ts · web/components/app-shell.tsx, deep-link-screen.tsx, deep-link/module-content.tsx, help-detail.tsx, agent-usage-dialog.tsx, brand-mark.tsx · web/lib/{store,api,use-screen-data}.ts · scripts/{smoke-staging,gen-icons}.mjs · web/e2e/{README,team-flows.spec}.ts · canon docs (CACHING, DATA-MODEL, CONCURRENCY, ERROR-HANDLING, CONVENTIONS, UI-CONVENTIONS, EDGE-CASES, BUILD-A-MODULE, BASE-MANUAL, BOOTSTRAP, MCP, AGENTIC-IMPORT, OPERATIONS, README, BASE-IMPROVEMENTS) · reports (lean-mean, interface-lessness).

## NEXT STEPS (if resumed)
1. (Owner) decide reset-all staging → re-run `npm run smoke:staging` with `export ADMIN_KEY=<from workers/tenancy/.dev.vars>` (it's the same value set on auth-staging).
2. (Owner-gated) production: apply core 0014 to brimba-core, deploy realtime-first, keep ADMIN_KEY OFF prod auth.
3. Optional: verify a live usage-log ROW (action vs prompt) in browser (only the empty state was shown).
4. `.session-notes/` — decide commit vs gitignore (currently just written locally).
