# BASE-IMPROVEMENTS.md — the honest backlog

The living list of known base issues and their status, from an **objective third-party
review** (2026-07-09): a fresh multi-agent `security_sentry` on this repo + an independent
four-audit pass (`lean_mean_check` · `security_sentry` · `error_analyst` · `story_checks_out`)
run against a *pristine* clone by the first real `new-app` fork (testco). Two reviewers with
no prior context converging on the same findings is the signal to trust.

Keep this current: when an item ships, move it to **Fixed** with the commit.

---

## Fixed (2026-08-04, follow-up) — the independent security review

Three no-prior-context auditors read a clean clone (no session notes, no prior
reports, no explanation of why anything was built) and refuted by default. Nine
findings survived; all nine are fixed below. 371 tests.

| Sev | Issue | Fix |
|---|---|---|
| HIGH | **Stored prompt injection reached UNCONFIRMED privilege grants.** Any member with `help:create` writes instructions into a 20,000-character ticket description; an admin later asks the assistant anything that lists tickets; `set_role_permissions` / `set_member_role` / `create_role` / `invite_member` then run AS the admin with no panel. | Those four now confirm — see EDGE-CASES §5 (this REVERSES the 2026-07-10 destructive-only decision, narrowly: every other constructive write still runs free). |
| MED | **`?scope=user` with no `id` returned the WHOLE team feed, unfiltered** — it matched no branch, leaving an empty WHERE. Exactly the leak R18 exists to stop, arrived at by omission; the source-scan stayed green because the clause still *existed*. | Fails closed at both layers (the route validates the scope and refuses an id-scope with no id; the reader returns nothing rather than widening), locked by `activity-scope.test.ts`, which RUNS the reader over every scope shape. |
| MED | **A role could grant ITSELF every right** — `member_roles:edit` + your own role id = admin in one call. | `setRolePermissions` refuses a self-grant, matching the sibling "you can't change your own role" invariant. |
| MED | **An unauthenticated request could write into the GLOBAL core DB** — the client-error beacon's gate was `Cookie.includes("session")`, a substring test on an attacker-controlled header, next to a comment claiming a drive-by couldn't fill the table. | The gateway resolves the session with auth before forwarding; a forged cookie now writes nothing (verified live on staging). |
| MED | **The daily AI allowance was advisory** — read-then-check, so N simultaneous chats all passed. | The cap rides the UPDATE, like the paid-credit path beside it. |
| MED | **The impersonation door shared a name with the maintenance key.** `ADMIN_KEY` is set on tenancy + data-ops in BOTH environments, so one mistyped `wrangler secret put` directory would have armed sign-in-as-anyone on production. | Its own `TEST_LOGIN_KEY` secret **and** a hard refusal when `ENVIRONMENT` is production — two independent locks, neither a runbook sentence. `ADMIN_KEY` deleted from staging auth. |
| LOW | **R10 claimed three gating-seam suites that did not exist** (tenancy, content, data-ops) — a documented control, absent. | The three suites now exist and are sabotage-proven. (Writing them found a bug in my own scanner: no word boundary, so `ungatedBody(` matched `gatedBody(` and the check passed its own sabotage.) |
| LOW | **The email-change door was an enumeration oracle** — the "already in use?" check ran before the throttle, and a rejected probe counted toward nothing. | Throttle first; probes count. |
| LOW | **A double-clicked CSV import could write every row twice** — read-then-write, while CONCURRENCY.md claimed it was guarded. | The session is claimed atomically, like its batch sibling. |
| LOW | **Learning `body` + `contentLink` skipped the boundary seam** — a NUL byte was a 500, and the body had no length cap. | Both go through `optionalText` first, then the XSS scrub. |

---

## Fixed (2026-08-04, follow-up) — the five close-out items

The hardening round's own review found five loose ends. 354 tests (up from 342).

| Sev | Issue | Fix |
|---|---|---|
| SCALE | **A hard cap is an honest refusal, not an answer.** R14 capped growing collections at 1,000 rows and called cursor paging a "next step"; a downstream product had already shipped keyset paging on its growing collections and proved it at 24,000 rows. | R14 WIDENED: a collection that grows with ordinary use must PAGE by key — `shared/workers/paging.ts` (opaque cursor, id tiebreak, `LIMIT+1` for `hasMore`) answered through the one `pagedJson` seam. Support tickets + the team activity feed page end to end; the My/All tabs became SERVER scopes (a client filter over a page disagrees with its exact badge). `GROWING_COLLECTIONS` is registry DATA; the check asserts the lib seam, the response, and that the client can reach page two. |
| BUG | **The agent was told a bulk cap it could not physically write.** The reply ceiling was 4,096 tokens while the declared cap was 500 ids (~8,000 tokens) — the tool call truncates mid-JSON, the turn dies, nothing changed, no error. | `AGENT_MAX_TOKENS` raised to 8,192 and `BULK_IDS_LIMIT` DERIVED from it (512). `reply-ceiling.test.ts` asserts the arithmetic and that every bulk schema declares the derived number. |
| BUG | **The hooks-order scanner had a third blind spot**: a guard written the ordinary way (`if (!ready) {` newline `return null` newline `}`) put its return at brace depth 2, so it never registered as an early return — switching the white-screen check OFF for that whole file. | Rewritten around the real semantic: a return counts unless it is inside a NESTED FUNCTION. Arrow components are scanned too, and fixtures now lock the scanner's own blind spots (a check that cannot fail is not a check). |
| BUG | **The dropdown-ordering rule was stated but not locked** — nothing stopped either surface losing it. | The rule is pinned as `DROPDOWN_ORDER_RULE` and asserted on BOTH surfaces the model reads (the tool description and the system rule wall), including that CREATE is the step named first (R9's vocabulary half). |
| OPS | **Staging's smoke was red (16/18)** on a stale team-database pointer — indistinguishable, to the next reader, from a real regression. | Staging reset (3 of 4 team-DB pointers were dangling), re-deployed, smoke back to **18/18**. |

---

## Fixed (2026-08-04) — the base hardening round (7 new laws + security/UI)

Ported the twenty defects a downstream product (Acrymold) found under real load —
each was a base defect. Seven became machine-checked Laws (R13–R19), each
sabotage-proven; the rest are security/agent/UI fixes. 342 tests (up from 302).

| Sev | Issue | Fix |
|---|---|---|
| DESIGN | **A capability shipped in code was invisible until a catalogue ROW existed** — staging could import modules production (byte-identical code) could not. | R13 widened: the import catalogue reconciles itself against the code on READ (INSERT-only; an owner's OFF stays off; the picker filters is_active in memory). Shipping the code now ships the capability. (`catalog-coverage`) |
| SCALE | **Unbounded list reads** would stall a worker at 100k rows. | R14: every `list*`/`search*` carries a hard cap from `shared/workers/limits.ts` with its comment (`bounded-lists`). *Widened in the follow-up round above: a GROWING collection must page, not cap.* |
| BUG | **Deaf publishers / stale paged screens** — a worker pinged `selectable_data` and nothing listened; paged rows live outside the row caches. | R15: the live registry (`web/lib/live-resources.ts`) + a ping bus + `useLiveRefetch`; every published resource reaches a listener or a reasoned `DEAF_EXEMPT`. (`live-collections`) |
| BUG | **A 24,011-row catalogue advertised "1000"** (a capped list's length) and the same count showed twice on one screen. | R16: exact server COUNT(*) through the one `formatCount` seam; tab-vs-heading arbitration by React context. (`counted-collections`) |
| BUG | **A double-clicked Deactivate wrote two history rows** 2s apart. | R17: the current-status predicate rides the UPDATE; zero rows moved = no activity, no ping. (`idempotent-transitions`) |
| LEAK | **The team activity feed showed every module's before/after behind one gate.** | R18: it subtracts the caller's denied modules through one clause; every relatedTable resolves through `ACTIVITY_GATE_MAP` or a pinned exemption. (`activity-gate-coverage`) |
| BUG | **The agent answered a DIFFERENT question** — free-text fallback matched 3,465 mentions instead of 134 records. | R19: every list tool exposes + forwards its door's filters, derived from the door's own source. (`agent-filter-parity`) |
| SEC | **Login codes echoed in API responses + a toast** on staging. | B1: echo + var DELETED (inbox-only, every env); ADMIN_KEY-gated staging test-login door mints a normal code for tests. |
| SEC | **Internal doors waved callers through** when `INTERNAL_KEY` was unset. | B2: send-email / log-error / mcp-session all FAIL CLOSED. |
| SEC | **The 5-try attempt cap was burstable** (read-then-write). | B3: one atomic UPDATE checks + consumes a slot (login + email-change). |
| SEC | **Preview URLs were a second public door.** | B4: `preview_urls: false` beside `workers_dev: false` on every non-gateway worker. |
| CRASH | **A hook below an early return white-screened the app** (React #310), and the ErrorBoundary was never mounted. | C1: the boundary is mounted at the root; `hooks-order.test.ts` makes the class unshippable. |
| AGENT | **Bulk tool JSON truncated mid-call** (1024 max_tokens); no set-shaped tool. | C2: `AGENT_MAX_TOKENS` 4096 *(superseded — see the follow-up round above: 8,192, with the bulk cap derived from it)*; a filter-shaped `set_help_status_by_filter` (dry-run counts first, idempotent); the bulk cap is one declared constant; dropdown-never-invents rule. |
| BUG | **The usage log showed an admin four blank rows** with a teammate's name. | C3: `agent_usage_log.kind` (0014) — action rows team-visible, prompt rows the author's; the fold APPENDS its actions, never replaces. |
| UI | **Action rows clipped off the left edge**; the brand mark lost its corners. | C4/C5: flex-wrap + ml-auto; object-contain at `LOGO_SAFE_RATIO` 0.76. |

Also this round: R10 widened with an mcp gating-seam suite (identity-gated writes); every exemption is DATA in the rules registry (B5). Core migration **0014** (`agent_usage_log.kind`) applies before deploy.

## Fixed (2026-07-13) — the invite + credit-fairness round (team testing on staging)

Three real bugs a teammate (chilavert) hit exercising the AI co-pilot's invite flow.
(A fourth report — "chat creates a role but also opens an empty form" — was already fixed
by the one-shell round; re-verified live, no change needed.)

| Sev | Issue | Fix |
|---|---|---|
| MED | **Agent accepted a self / existing-member invite** — asked "which role?" and only failed at the door, wasting a turn (and credits). No explicit self-invite guard existed (blocked only transitively via already-member). | Added a `self_invite` guard in `createInvite` (clear "you can't invite yourself" message) + system-prompt guidance so the agent checks membership and refuses UPFRONT. Verified live: it now says "that's your own email — you're already on the team." (`workers/tenancy/src/lib/invites.ts`, `agent.ts` SYSTEM; `integration.test.ts`) |
| MED | **Dishonest email narration** — the invite email was fire-and-forget, and the agent's "no email was sent" line was free model text, not bound to the real outcome; a *successful* invite mis-narrated as a duplicate would send an email while the bot claimed it hadn't. | `createInvite` now AWAITS the send and returns `emailSent`; the route returns it (first); the agent is told to report it honestly and never claim an email was sent when it wasn't. The invite still succeeds if mail fails (the invite_index row routes acceptance; accept in-app). (`invites.ts`, `routes/invites.ts`, `tool-catalog.ts`, `agent.ts`; `integration.test.ts`) |
| MED | **Charged for refused actions + mislabeled** — a turn that only asked a clarifying question or hit a refused action still cost credits and was titled by the read it ran ("List roles"), not what the user did. | A turn that changed NOTHING (a refused action or a model hiccup) now REFUNDS its metered units (`refundAiUnits` reverses both pools) — a blocked action costs 0. Usage rows title by WRITES only, so a read-only clarify turn reads as the question. Verified live in the credit log (a failed invite → **0 credits**). (`credits.ts`, `agent.ts`; `credit-reconcile.test.ts`) |

## Fixed (2026-07-10) — the unification + one-shell round

The two big structural moves the owner asked for after the hardening round.

| Sev | Issue | Fix |
|---|---|---|
| P1 #2 | **Two tool catalogs drift.** The agent (data-ops) + MCP each hand-declared the same ~two dozen tenancy/content endpoints, so a capability had to be added twice and they could diverge (the drift the owner hit adding list_invites). | Collapsed the 24 overlapping endpoints into ONE `shared/workers/tool-catalog.ts` (SHARED_TOOLS); each surface PROJECTS them (`toAgentTool` / `toMcpTool`) + adds its surface-only tools. `mcpName` preserves the 3 external MCP names. Bonus: the agent gained `list_dropdown_values` (a parity gap). Adding a CRUD tool is now one edit. |
| P1 (new) | **Navigating into a team screen HARD-RELOADED** (static-export boundary), tearing down the SPA + a running agent; the agent's screen-trace couldn't drive across it. | The **whole post-auth app is now ONE shell** — `/home`, `/settings`, `/invitations` render `<DeepLinkScreen/>` like `/t`, `/learning`, `/help`; all in-app nav is soft History-API (`softNavigate` / `go()`), no reload anywhere. Only pre-auth (`/login`, `/onboarding`) is a real navigation. The trace now soft-drives from any screen (EDGE-CASES §1). |

## Fixed (2026-07-10) — the agent hardening round (team testing on staging)

A sweep of real bugs surfaced by the team exercising the AI co-pilot on staging.

| Sev | Issue | Fix |
|---|---|---|
| HIGH | **Agent panel died when the trace entered `/t`** — the off-host screen-trace `router.push`ed into a deep `/t` path, a hard reload (static export) that tore down the running agent + its live steps | The co-pilot is mounted once at the ROOT (`agent-host.tsx`) + its open state mirrors to `sessionStorage` (survives a real refresh; `agent-host.test.ts`). Trace first NARRATED off-host — then **superseded by the one-shell round (above): with no reload boundary left, the trace soft-drives from anywhere** (EDGE-CASES §1). |
| HIGH | **First-turn confirm buttons dead** — a brand-new chat's first dangerous action paused at a confirm whose Go-ahead/Not-now no-op'd (the event omitted `threadId`) | `threadId` added to the `confirm` stream event; client adopts it (EDGE-CASES §6; `stream.test.ts`) |
| MED | **Credit history didn't reconcile** — a confirmed command split into a row + a cryptic "(continued)" row, so it didn't sum to the balance | The confirm turn FOLDS its units into the command's one row; rows are titled by the ACTION taken, not the prompt (DATA-MODEL; `credit-reconcile.test.ts`) |
| MED | **Screen-trace opened a blank input form** and left it open after the record already existed | Trace lands on the RESULT (detail/list), never a dialog; `TraceTarget` has no query field by construction (`trace-parity.test.ts`) |
| MED | **Agent over-confirmed** — it asked before ordinary building (create a role, invite) | Confirm relaxed to **destructive-only** (removals + deactivations + bulk); constructive writes run free (EDGE-CASES §5) |
| MED | **Agent couldn't revoke an invite by email** — `revoke_invite` needs an id but there was no way to list pending invites | Added a `list_invites` read tool to the agent + MCP catalogs (`agent.test.ts`) |
| LOW | **Launcher needed a reload on first login** — the root host mounts before login and its non-reactive session copy never updated | `useActiveTeam` session cache made reactive (pub-sub); the launcher appears the instant you sign in (`agent-host.test.ts`) |
| LOW | **"Blank pills"** — empty tool-only assistant turns painted as empty bubbles on resume | `toChatItems` drops blank-content assistant turns (kept server-side for replay) |

---

## Fixed (2026-07-09)

| Sev | Issue | Fix |
|---|---|---|
| HIGH | Agent could make privilege/identity writes (rename team, change roles, set permissions, invite) with **no confirmation** — reproduced live (a read-only question silently renamed a team) | `confirm: true` on the 7 privilege/identity tools; `agent.test.ts` flipped to the safe contract (`workers/data-ops/src/lib/tools.ts`). **Superseded 2026-07-10:** by owner decision the confirm rule was relaxed to **destructive-only** (removals + deactivations + bulk); the privilege-confirm defense-in-depth was traded for a smoother agent — the fence (untrusted content as DATA) + act-as-user gating + audit remain the primary defenses. See EDGE-CASES §5. |
| HIGH | **Stored XSS**: `parseUploadDataUrl` accepted any MIME (`text/html`, `svg`); gateway served `/media/learning/*` back with it on the app origin (worker-built response, so `_headers` didn't apply) → attacker JS rides a viewer's session, cross-team | Allow-listed inline-safe MIME at the boundary + `mediaHeaders()` adds `CSP: default-src 'none'; sandbox` + `nosniff` on both gateway media branches (`shared/workers/image.ts`, `workers/gateway/src/index.ts`) |
| MEDIUM | AI usage-log returned **every member's raw prompt** to any teammate who opened it | `readUsageLog` redacts the summary to the viewer's own rows (`workers/data-ops/src/lib/credits.ts`) |
| MEDIUM | No anti-clickjacking / MIME / referrer headers served | `X-Frame-Options: DENY` + `nosniff` + `Referrer-Policy` in `web/public/_headers` |
| LOW | Boundary validation gaps: role `description`, team `name`, member/invite ids not type-checked → a non-string body was a **500, not a 400** | `optionalText` / `requireText` / `typeof` guards (tenancy routes) |
| CRIT (forks) | `mcp` binds the core DB but docs said "**five** core-bound workers" → a fork on a shared account silently binds mcp to the ORIGINAL core DB (cross-tenant) | "SIX core-bound workers" everywhere (BOOTSTRAP, OPERATIONS, new-app); OPERATIONS now lists migration 0013 + mcp in the `INTERNAL_KEY` set |
| — | Fork sweep left `brimba.swift-struck.workers.dev` host URLs in the MCP docs | new-app sweep now treats host URLs as live references, not history |

---

## Open — ranked (the "three moves that each kill several findings" first)

### P1 · resilience + leanness — high leverage, real refactors
1. **One `callInternal(path, {cookie, timeout})` seam** (`shared/workers/`). Kills THREE findings at once: the cookie-forward internal-fetch dance is copy-pasted 5+ times (DRY), **no `fetch` has an `AbortSignal`** anywhere — the D1 REST door (`cf()`), cross-worker calls, and the agent's model calls all lack a timeout, so one hung socket stalls a whole worker (resilience) — and the forward executors flatten 403/409/500 into one generic string (status preservation; also the cause of the agent's "stuck pending step"). **Highest-leverage single change.**
2. ~~**Unify the two tool catalogs.**~~ **DONE 2026-07-10** — one `shared/workers/tool-catalog.ts` both surfaces project from (see Fixed above).
3. **Idempotency + partial-failure cleanup on the fleet writes.** `import-confirm` has no idempotency (retry → duplicate rows); `migrateTeams` aborts the whole fleet on the first bad team and leaves schema drift; the module-mover can orphan a DB / double-count on interruption. Add an idempotency guard + per-item try/catch + cleanup.
4. **Close the two error-log blind spots.** The nightly cron catch and the agent model-call catch swallow unexpected errors (console-only / nothing) — invisible in the 90-day `error_logs` table meant to catch exactly those. Add `recordWorkerError` in both.
5. **`d1QueryAcross` uses `Promise.all`** → one slow/failed shard fails an entire split-module read. Use `allSettled` + record the degraded shard.

### P2 · deploy + docs
6. **realtime↔auth cold-start cut.** A genuinely fresh-account first deploy dies `code 10143` (realtime binds auth, auth binds realtime). Document the one-time binding cut as a first-class BOOTSTRAP step AND make `deploy:*` tolerate it — not the current footnote ("in practice auth already exists" — false for `new-app`).
7. ~~**`DEV_ECHO_CODES=1` on staging** echoes login codes in API responses.~~ **DONE 2026-08-04** — the echo (code path + config var) is DELETED, code appears inbox-only in every env; automated sign-in uses the ADMIN_KEY-gated staging test-login door (B1, see Fixed below).

### P3 · structure / honesty
8. **Eight god-files >400 LOC** (`agent.ts` ~570, both `tools.ts`, `api.ts` ~535…) — split by seam. Largely dissolved by #1 + #2.
9. **Reconcile the lean score.** A fresh honest `lean_mean_check` scores **~84–90 (B/A-)**, not the committed report's 93 — the leanness dimension (~73) is dragged by #1 + #2 + the god-files. Either land #1/#2 (which genuinely raises it) or regenerate the report honestly. Don't ship an over-stated score.

---

## The meta-lesson (worth its own guardrail)

Two of the worst issues (the agent confirm gap, the fork-sweep leaving live URLs) **slipped past our own checks because a check encoded the wrong intent** — a test that asserted the vulnerable behaviour as correct, and a sweep rule that treated a live URL as "history." An incumbent review rationalises what's already there. **Schedule a periodic fresh, no-prior-context review** (a clean clone, independent agents) — it finds what the incumbent gate accepts. This is why the base now recommends running the audits against a *pristine* clone, not the working tree.
