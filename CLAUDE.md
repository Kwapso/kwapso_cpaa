# CLAUDE.md. Read this first

You are working on **Brimba**, the multi-tenant SaaS base by Swift Struck, the reusable Cloudflare-hosted foundation (auth, teams, member roles, invites, tickets, the knowledge base, dropdown management, CSV import, and an in-app AI agent) that every future app is built on. This file is the entry point for any agent working in this repo. It does not duplicate the docs, it tells you the **rules you must follow** and **where the canon lives**.

## The two prime directives

1. **Stay lean.** This codebase is deliberately small and well-layered. Add the least code that solves the problem; reuse the existing seams; don't introduce a dependency, a worker, a table, or an abstraction you don't need. "Too much code" is a defect here.
2. **Obey the Laws of the Base** (below). They are not suggestions, they are machine-checked. A change that breaks one turns the build red.

## The Laws of the Base (enforced, not aspirational)

The laws live in **[RULES.md](RULES.md)** (the human law-book) and are pinned to data in **`shared/rules/registry.ts`**. They are enforced by tests that read the source straight off disk, break a law and `npm run check` fails:

- **Every mutation publishes a live change.** Any non-GET route that changes state must call `publishChange` (cache-first + row-level live-sync, patch the changed row, never refetch the list). Enforced by `workers/*/test/publish-seam.test.ts` (tenancy, content, data-ops; auth's user-channel publishes and mcp's caller-private token rows are the reviewed exceptions. CACHING rule 5). See [CACHING.md](CACHING.md).
- **Every record detail exposes Overview + Activity tabs**, via the library `TabsView` + `ActivityFeed`. Enforced by `web/test/rules.test.ts` (`record-detail-tabs`).
- **No hand-rolled tab strips / toggles**, collection tabs use the library `TabsView`. (`no-handrolled-toggles`)
- **Every form renders through the shared `FormShell`.** (`forms-use-formshell`)
- **One generic record-activity read path.** (`generic-activity-path`)
- **The glossary is the single source of product terms**, `shared/glossary.ts`, one clear, brief definition each. Use those words in UI copy; never invent a synonym. (`glossary-wellformed`)
- **The agent knows what the app can do**, its system prompt carries a capability brief GENERATED from the import/export catalog + the glossary, so the UI and the agent can never disagree about a capability. (`agent-app-parity`, `workers/data-ops/test/agent-parity.test.ts`)
- **Input is validated at the boundary, and it is scanned (R20).** Never trust request bodies. Use `shared/workers/validate.ts` (`requireText` / `optionalText` / `queryText`: type-check, strip NUL bytes, cap length, throw the `GuardError` the workers map to a clean 400). Bad input is a 400, never a 500. The rule is **positional**: every body field must sit where something is CHECKING it (a validator's first argument, a `typeof` operand, `Array.isArray`/`Number`, a literal comparison, an allow-list `.includes`), a truthiness guard is not a type check and a cast is not a check at all; and a body is never destructured at the read. The QUERY string is held to the same positional rule by its own call-site census beside the body one, every `searchParams.get` must sit inside a checker, because "the query half is locked" used to mean the helper's behaviour was locked (`workers/content/test/validate.test.ts`), which is a different sentence from "every door uses it". (Both censuses are `validated-bodies` in `web/test/rules.test.ts`; the helpers' own behaviour stays in `workers/content/test/validate.test.ts`.)
- **Shipping the code ships the capability (R13)**, every module is an import TargetDef or a reviewed exemption, and the catalogue self-heals against the code on read (a fresh environment's picker is never empty; an owner's OFF stays off). (`catalog-coverage`)
- **No unbounded list endpoint, and no capped GROWING one (R14)**, every `list*`/`search*` read carries a hard cap from `shared/workers/limits.ts`, said in a comment; a collection that GROWS with use (`GROWING_COLLECTIONS`) must PAGE by key instead, opaque cursor + exact total + `hasMore` through `pagedJson`, with a client that can reach page two. (`bounded-lists`)
- **Every published resource reaches a listener (R15)**, the live registry (`web/lib/live-resources.ts`, or the portal's `PORTAL_LISTENERS`) or a reasoned `DEAF_EXEMPT` entry. A paged list's rows live in a cache key with its cursor in a sidecar, so the same registry keeps it live. R15's old `useLiveRefetch` clause is retired (RULES.md says why). (`live-collections`)
- **Every collection shows its count exactly once (R16)**, an exact server COUNT(*) through the one `formatCount` seam; tab badge wins, `CollectionHeading` stands down via the arbitration context. (`counted-collections`)
- **State transitions are idempotent (R17)**, the current-status predicate rides the UPDATE; zero rows moved = no activity row, no ping. (`idempotent-transitions`)
- **A cross-module read carries the caller's rights (R18)**, the team activity feed subtracts denied modules; every `relatedTable` resolves through `ACTIVITY_GATE_MAP` or a pinned exemption. (`activity-gate-coverage`)
- **Agent/MCP filter parity (R19)**, a tool on a list door exposes + forwards every filter the door parses, derived from the door's own source. (`agent-filter-parity`)
- **Every state-changing route gates (R10).** Any non-GET route opens with a permission gate, `requireRight` (or the `gated`/`gatedBody` wrapper / `requireAnyImportRight` / `adminGuard`), except a reviewed identity-gated write (teamless onboarding, own-pointer, ownership) that gates on `whoAmI`. The security counterpart to R1: enforced by a per-worker `gating-seam` suite (beside `publish-seam`) that reads handler source off disk, and the EXTERNAL machine surface (mcp) has its own suite asserting every non-GET route opens with token/user verification. No ungated door can ship, on either surface. (`gating-seam`)
- **A door on the agency's own material refuses a client login. AT THE DOOR (R21).** The client portal's gateway forwards a named allow-list and leaves the agency's doors out; the agency gateway forwards **by prefix**, and a client login is an ordinary team member holding an ordinary role. So every door the portal withheld was being served to the same person at the other hostname. Every route a Client-role caller can pass must refuse a portal caller, resolve the account fence, be a door the portal itself opens, or be a reasoned exemption. Nothing hand-listed: rights from the seed, routes from each `ROUTES` table, gates from handler source. **Enumerate by what a client can REACH, never by what a module owns**, that substitution is how it leaked the second time. (`client-reachable-doors`)
- **Agent/MCP body-field parity (R22)**. R19's sentence about the other half of the request. A tool on a WRITE door exposes and forwards every field that door reads off the **body**, derived from the door's own `body.<field>` reads and proved by RUNNING the tool's `buildBody`, not by reading it. R19 inspected only the query string, so four write tools offered a narrower contract than their door accepted for six weeks under a green build. (`agent-body-parity`)
- **An answer from the knowledge base carries its sources (R23).** Retrieval never writes prose, it hands back the passages and the sources they came from, and the assistant composes the reply with those in front of it. `found`, `passages` and `citations` are ONE decision in ONE seam (`knowledgeAnswer`): no citation means no passage and a sentence the assistant must say instead of inventing one. No door assembles that response by hand, the same shape as R14's `pagedJson`. The compartment searched, and the REASONING that chose it, ride the same object. (`cited-answers`)

- **An internal number cannot reach the client's side (R24).** What our own hour costs
  (`internal_rates`) and the margin computed from it live in ONE file,
  `workers/tenancy/src/lib/internal-money.ts`, and the check DERIVES the doors that call
  into it from that file's own exports: none of them is on the portal gateway's surface,
  every one opens with `refusePortalCaller`, and nothing in `web-portal/` names the
  internal table or those doors. SCOPE's ruling has no exceptions clause, so the defence
  is not a condition somebody can invert: a condition can be inverted and a permission can
  be granted, an import cannot be forgotten. The ACCOUNT rate card (what a client *is
  charged*) is a separate table and a separate file for the same reason.
  (`internal-money-never-in-portal`)
- **The vector index NARROWS; the team's database DECIDES (R26).** The knowledge
  base searches ONE account-wide Vectorize index, so two properties that used to
  be free are bought back explicitly. Tenancy is a PARTITION, every call passes
  `namespace: guard.teamId`, built in one function from the guard, and Vectorize
  applies a namespace before the search. And nothing readable comes out of the
  index: it is asked for ids and scores only (`returnValues:false`,
  `returnMetadata:"none"`), and every passage is read back out of the team's own
  database under the caller's own fence. A wrong label costs a relevant passage;
  it cannot produce one the caller may not read. (`vector-fence`)
- **A savings figure never renders without saying what it is made of (R25).** Every screen
  on either front door that shows a saving renders `SAVINGS_CAPTION` from
  `shared/workers/savings.ts`, word for word, the times are agreed estimates, the
  subtraction is arithmetic, and the screens are derived from the payload they read.
  (`savings-caption`)
- **Described contracts (R27)**, every `backticked` identifier in a tool description
  names something real: an argument the tool's own schema declares, a query param or
  body field its door reads (the same door census R19/R22 stand on), a field its
  response actually carries (the `pagedJson` contract + the door's own extras, the
  handler's `json({…})` literals, the row fields the module's libs map off a database
  row, R23's `knowledgeAnswer` seam), another tool's name, or a reasoned
  `DESCRIPTION_VOCABULARY` entry, rot-checked, so an unused or derivable entry turns
  the build red. R19/R22 prove the wiring and never the prose; on 2026-08-16 a
  description with a false promise, two invented parameters and a fake filter passed
  a green build, because the words a developer actually reads were the one unchecked
  surface. Identifiers, not sentences, an invented NAME can no longer ship.
  (`described-contracts`)
- **The translation catalogue cannot rot (R28).** `shared/i18n-strings.json` is
  EXACTLY the set of user-visible English sentences in `web/` and `web-portal/`,
  derived by re-running the one shared definition of what a person reads
  (`scripts/lib/i18n-source.mjs`). A sentence MISSING from it ships in English to
  somebody who chose German, silently, on a screen that looks finished, because
  English is the key. An entry matching no string in the app is an ORPHAN and goes
  red too: nothing breaks today, which is why it rots into a record of what the app
  used to say while being translated on every build. The whole pipeline is
  build-time, so "is the catalogue current?" was the assumption it all rested on
  and the only thing enforcing it was somebody remembering to run a script. Run
  `node scripts/i18n-extract.mjs` before you commit. (`catalogued-strings`)
- **The page has one width, and a screen does not get its own (R29).** Each front
  door owns exactly ONE page container, `web/components/deep-link-screen.tsx` at
  `max-w-[1600px]` and `web-portal/components/portal-shell.tsx` at `max-w-3xl`
  (narrower on purpose), and no other component sets a page-level width. A page
  container is identified POSITIONALLY, as R20 identifies a checked field: one line
  carrying `mx-auto`, `w-full` and a `max-w-*` together, which is the signature of a
  centred content column and of nothing else, so a dialog, a sheet, a door card or a
  capped line of prose keeps its own measure and is never caught. Exceptions are data
  in `SCREEN_WIDTH_EXEMPT` with a reason each, rot-checked, so a pin whose file no
  longer sets a width turns the build red and the list can only shrink. Earned by six
  screens capping themselves at 60% of the room they had, one of them the shell's own
  loading skeleton, under a green build, because a width is invisible to every other
  check here. (`one-page-width`. UI-RULEBOOK N8)
- **Two radii and no third (R31).** A rectangular surface is `rounded-xl`, a pill
  is `rounded-full`, and a sheet that meets the bottom of the screen is
  `rounded-t-xl`. Nothing else, because every step from `sm` to `3xl` already
  resolves to the same 24px here — so five spellings of one value were five
  decisions where there is one. Bare `rounded` is 4px and is deliberately outside
  the rule. (`two-radii`. UI-RULEBOOK N9)
- **Every colour resolves through a token (R32).** No Tailwind colour ramp and no
  hex literal in `web/`, `web-portal/` or `shared/`: what a colour MEANS has a
  token (`warning`, `success`, `destructive`, `chart-1`…`chart-5`), and a mark
  comes from the chart series. The six files that legitimately hold a literal —
  the branding seam, the email template, the two OS-level theme files, Google's
  own mark and a canvas fill — are data in `PALETTE_LITERAL_OK`, rot-checked.
  Earned by three breaches nobody would have filed as bugs: colour drift is only
  visible in aggregate, and nobody sees the aggregate. (`closed-palette`.
  UI-RULEBOOK N5)

A law cannot be added without its check (`registry-integrity`). When you add a rule, add it to RULES.md **and** the registry **and** a check, or the build fails.

## Before you build, the planning ritual

Answer these seven, in order, *before* you write code. It's the thinking that keeps a change in-rule and lean, the antidote to the failure mode that bit us (a change that looked fine but broke an unstated invariant, or rebuilt a seam that already existed).

1. **Say it in one glossary sentence.** What changes, in [the glossary's](shared/glossary.ts) words. Never a synonym. No word for it yet? That's a glossary decision first (Law R6).
2. **Which Laws bite?** Walk R1–R32: it reads a request body → every field through the validation seam, positionally (R20); a client login could reach it at the agency origin → it decides about portal callers at the door (R21); it mutates → gate (R10) + publish (R1) + a reachable listener (R15); renders a form → FormShell (R4) + draft (R7); a collection → tabs (R2/R3/R8), a bounded read, or real keyset paging if it GROWS (R14), and an exact, once-only count through the one seam (R16); a screen → ONE page width, and the pin deleted by the commit that fixes it (R29), `rounded-xl` or `rounded-full` and no third radius (R31), and every colour through a token and never a Tailwind ramp or a hex (R32); a deactivate/reactivate or status move → the idempotent predicate + zero-row silence (R17); writes activity → its relatedTable resolves through the gate map (R18); a new module → an import TargetDef or a reasoned exemption (R13); touches the agent/MCP → capability parity (R9), every door filter exposed + forwarded (R19), every BODY field too (R22), a description whose every backticked identifier names something real (R27), and the confirm rule; calls an external service → a fetch timeout (R11); runs on a cron → record failures (R12); answers from the knowledge base → the one answer seam, citations and all (R23), and its search is namespaced and its words come from D1 (R26); **it sends a person an email → that send is classified in the census, and if it names a record it carries a button to it, at the recipient's OWN front door (R30)**; **says a single word to a person → that sentence is in the catalogue (R28), which means running `node scripts/i18n-extract.mjs` before you commit**. Name them now, not in review.
3. **Which seams do I reuse, not rebuild?** The data door (`shared/workers/d1-rest`), gating (`requireRight`), validation (`shared/workers/validate`), `publishChange`, `FormShell`, the recipe engine, the tool catalog. If you're writing what a seam already does, stop.
4. **What's the smallest shape?** A route on an existing worker (not a new worker); a column (not a table); a recipe (not a bespoke screen); a flag (not a code path). "Too much code is a defect."
5. **What could break?** Name the failure path *before* the happy path: tenant isolation, ≥1 admin, a unique pending invite, a never-negative balance, a concurrent write, a partial failure, a hung fetch. Validate at the boundary; make retryable writes idempotent.
6. **What test locks it?** The seam/rule test that catches the regression. A new invariant → write the test first (red), then make it green. A green test must never assert the *wrong* intent (that's how the agent-confirm gap hid).
7. **Gate before ship.** `npm run check` + the quality trio (lean/story/security), and, for anything security-shaped, a **fresh, no-prior-context review** (a clean clone, independent eyes). An incumbent review rationalises what's already there.

## Build style, how code here is written

- **Workers (8):** six private brains, auth; tenancy (teams, members, Member roles + permissions, invites, the screen-recipe store, **the customer spine**, accounts, contact links, portal logins, **process maps** and **the money**: the two rate cards + margin); realtime; content (tickets + **the WORK ENGINE**, stories, sprints, work logs, to-dos, tasks, triage and meetings, + **the knowledge base**, with a 15-minute sweep and a morning digest, + the per-person Google connections + the agency's own housekeeping); data-ops (import + AI agent); mcp (the external machine surface: personal access tokens → team-pinned sessions → MCP tools over the same gated doors; reached only through the agency gateway at `/mcp` + `/api/mcp/*`), under **two public doors**: `gateway` (the agency app, `web/`, routes `/api/*` by prefix) and `portal-gateway` (the client portal, `web-portal/`, forwards a named allow-list only). **Only those two are public**; every other worker sets `workers_dev:false` + `preview_urls:false`, so no public route can reach `/internal/*`, the agent, or the act-as-user surface. Per-team D1 databases reached over the REST door (`CF_D1_TOKEN`); the global core DB via the native `env.DB` binding. Shared worker code lives in `shared/workers/` (gating, http, validate, …).
- **Worker handler shape:** a declarative `ROUTES` table (each route tagged read / mutation / housekeeping) → gate with `requireRight` from `shared/workers/gating` → team-DB CRUD via `d1Query` / `d1ExecScript` + `sqlString` + `ulid` → `publishChange` → return. Throw `GuardError(status, code, msg)`; the central catch maps it to a response.
- **Deactivate, never delete** (data + audit survive). Keep an audit block (actor + timestamp) on every write.
- **Permissions are the spine.** The AI agent **acts AS the signed-in user through the same gated endpoints** and never exceeds their rights. There is no separate agent role.
- **The screen engine:** `/t/<teamId>/<module>/<id>` is one client-resolved shell (`web/components/deep-link-screen.tsx`); recipes in `web/lib/screens.ts`; nav in `web/lib/pages.ts`. Tickets also has a clean top-level URL (`/tickets`). There is ONE ticket module and no help section: the section's URL segment and label say **tickets**, while the permission module, the tables, the API path and the MCP tool names are still `help` on purpose (the one seam is `MODULE_PERMISSION` in `web/lib/screens.ts`; DATA-MODEL.md § *help + help_threads* says why each stays). Don't "finish the rename". Engine-expressible screens → a recipe; bespoke screens → a host-composed component (like `role-detail.tsx`).
- **The UI library is lego, not this repo.** Primitives/collections come from `@kwapso/ui` (a separate repo). `web/` assembles recipes from them. **Do not edit the library from here**, if a primitive needs changing, surface it; don't fork it into the host.
- **Voice:** warm, plain, sentence case, no jargon, no emoji. Write for a 45–55-year-old manager. Use the glossary terms. See `shared/glossary.ts`.
- **Action buttons carry an icon** (lucide, ~`size-3.5`, before the label): edit = `Pencil`, switch off / deactivate = `Power`, remove = `UserMinus`, revoke = `Ban`, create = `Plus`, import = `Upload`. Destructive actions use the destructive (red) colour + a confirm. Keep the icon-for-action mapping consistent across the app; on narrow screens icon-only is acceptable.

## Where the canon lives. Read before building

Start with **[README.md](README.md)** (the doc map), then:

- **[ARCHITECTURE.md](ARCHITECTURE.md)**, the locked decisions (workers, the live layer, the Durable Object code-vs-runtime model). Do not relitigate without the user.
- **[OPERATIONS.md](OPERATIONS.md)**, how it builds, ships, and resets.
- **[CACHING.md](CACHING.md)**, cache-first + row-level live-sync (every screen follows it).
- **[CONCURRENCY.md](CONCURRENCY.md)**, race-safety (atomic writes, unique indexes, when a Durable Object is the lock).
- **[ERROR-HANDLING.md](ERROR-HANDLING.md)**, the one logging seam, the error boundary, never-swallow.
- **[DATA-MODEL.md](DATA-MODEL.md)**, every table (global core + per-team).
- **[SEARCH.md](SEARCH.md)**, the layered search / filter model.
- **[ROADMAP.md](ROADMAP.md)**. HISTORY, not a plan: the build record of the Phase-C round (closed 2026-07-02) and the contracts its phases plugged into. Don't read it for current state, that's README.md → BASE-MANUAL.md. Open work lives beside the thing it's open on (UI-GAPS.md, EDGE-CASES.md, AGENT-MODULES-PLAN.md, BASE-IMPROVEMENTS.md).

**The manual, to build on the base, or rebuild it from zero:**

- **[BOOTSTRAP.md](BOOTSTRAP.md)**, the day-zero, command-by-command runbook to stand the WHOLE base up on a fresh Cloudflare account (core DB + migrations → R2 buckets → secrets/vars → realtime-first deploy → seed → first team → verify). The concrete "rebuild from nothing" answer.
- **[BASE-MANUAL.md](BASE-MANUAL.md)**, how the base works AND *why*: the eight workers, the two-tier database, the permission spine, how a new module and the base influence each other, how to change foundational code + how a change ripples, **how to fork the base for a new product (§5)**, and **how each subsystem scales (§6)**. Read this to understand the whole.
- **[BUILD-A-MODULE.md](BUILD-A-MODULE.md)**, the end-to-end golden-path checklist to add a team module (table → permissions → worker → web → detail → tests).
- **[CONVENTIONS.md](CONVENTIONS.md)**, the code + comment house style (handler shape, data doors, gating, validation, deactivate-not-delete).
- **[UI-CONVENTIONS.md](UI-CONVENTIONS.md)**, how screens are built (library-is-lego, recipe vs bespoke, the enforced UI Laws, the action-icon mapping, the voice).
- **[DURABLE-OBJECTS.md](DURABLE-OBJECTS.md)**, the realtime Durable Object (`TeamChannel`), the code-vs-runtime model, and when a DO is the lock vs plain atomic D1.
- **[EDGE-CASES.md](EDGE-CASES.md)**, the non-obvious traps (static-export reload, list-cache-as-detail-source, REST-door round-trips, the confirm model, streaming, and more).
- **[AGENTIC-IMPORT.md](AGENTIC-IMPORT.md)**, the agent-driven multi-table import (normalize → map → order interdependent tables → resolve foreign keys → reject honestly → write through the gated door). How to declare an import target + references for a new module.
- **[MCP.md](MCP.md)**, the external machine surface for developers: how an outside tool connects (token → `Bearer` on `/mcp`), the opt-in tool catalogue, the act-as-user/one-team/live-role security posture, and the cost model (reads/exports/imports = free endpoint hits; only `agent_chat`/`agent_confirm`/`plan_import` draw the team's AI quota, a role without the agent right spends zero AI). **[mcp-quickstart.md](mcp-quickstart.md)** is the one-page version to hand an outside developer.
- **[SCOPE.html](SCOPE.html)**, the product's scope of work, chapter by chapter. Every "SCOPE ch.NN" reference in these docs points here: what kwapso is for, the account fence, the two front doors, what a client may see. Product decisions live here; this file is the book the rules defer to. (**[kwapso-the-system-explained.html](kwapso-the-system-explained.html)** is the plain-language owner walkthrough beside it.)
- **[glide/README.md](glide/README.md)**, the legacy Glide catalogue: the two apps kwapso ran on before this one, how to pull their rows, and the field reconciliation (`glide/RECONCILIATION.md`). `glide/data/` is git-ignored, it is customer data.

**The two front ends.** `web/` is the AGENCY app (served by `workers/gateway`); `web-portal/` is the CLIENT PORTAL (served by `workers/portal-gateway`). They are two permission-gated views of the same rows. Never copies, never synced. The portal has its own workspace and its own suites, including the account-fence test that walks every door it names through to the function behind it.

## Working agreement

- **`npm run check` must stay green** (the lint, then TypeScript across every workspace, then the full test suite including the rule + seam tests). Run it before you commit. It is the gate. The lint (`npm run lint`, oxlint, ~15ms over the whole repo) runs FIRST because it is the cheapest of the three: dead imports, unused dependencies in a hook's array, a React hook rule broken. Its first clean run found an `ErrorBoundary` imported into the root layout and rendered nowhere.
- **Ship gate** (before `/ship-staging`): `npm run check`, then the quality skills, `lean_mean` (≥ 92), `story_checks_out`, and `security_sentry` (no critical/high), then deploy. Adversarially verify your own findings.
- **Deploy order is realtime-FIRST**, then auth → tenancy → content → data-ops → mcp → gateway → portal-gateway. Both gateways go last, for the same reason: each service-binds the domain workers it forwards to. Production is owner-gated (apply new core + team migrations first). See OPERATIONS.md.
- **Commit messages** end with the Co-Authored-By line. Branch off `main`; don't commit straight to it.
- **Resetting data:** `node scripts/reset-all.mjs <staging|production|both>` (destructive; schema + migrations survive). Confirm production explicitly.

If a request conflicts with a Law of the Base or a locked decision in ARCHITECTURE.md, say so and propose the in-rule way. Don't quietly break the rule.
