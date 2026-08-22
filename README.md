# Brimba

**The multi-tenant SaaS base by Swift Struck.** Not an app for one industry,
the reusable foundation every future app (ERP, CRM, portal…) is built on: login
(an email code or Google), teams, Member roles (module key `member_roles`), invites,
tickets, dropdown management, CSV data import, and an in-app **AI
agent** that acts AS the signed-in user through the same gated endpoints (never
exceeding their rights), all hosted on Cloudflare.

**Eight workers are on disk**, six shared brains (auth, tenancy, realtime,
**content** (tickets, the work engine, the knowledge base), **data-ops** (import + the AI agent), and **mcp**)
under **two front doors**: `gateway` (the agency app, `web/`) and `portal-gateway`
(the client portal, `web-portal/`). The mcp worker is the external machine
surface: personal access tokens (hashed, shown-once, team-pinned, revocable;
managed under Settings → Access tokens) bridged to short-lived team-pinned
sessions, exposing the gated doors as MCP tools at `/mcp`. The agent's model is
swappable: Claude when `ANTHROPIC_API_KEY` is set, else Cloudflare Workers AI
(both do full tool use); it confirms on destructive + bulk actions and is metered
by a credit quota, **the app's own daily allowance** (the `AGENT_FREE_DAILY` var:
code default 25, but both environments ship **50**) plus a purchasable balance.

The team area (Overview, Members, Member roles, Invites) lives at `/t/<teamId>/…`
deep-link URLs, rendered by the screen engine, not under Settings; top-level
`/members` and `/roles` are thin redirects there.

*This section says what is true now.* When each piece landed is in
[BASE-IMPROVEMENTS.md](BASE-IMPROVEMENTS.md) § *When each piece landed*: dated
stamps used to accumulate here, in the first thing every reader and every agent
opens, which is the one place current state should not have to be sifted out of
history.

The agency app and the client portal each have their own address:

| Surface | Production | Staging |
|---|---|---|
| Agency app | https://agency.kwapso.app | https://agency-staging.kwapso.app |
| Client portal | https://client.kwapso.app | https://staging-client.kwapso.app |

(`portal.kwapso.app` is **not** ours, it is the owner's live Glide portal, untouched
until cutover.)

## The documents

**New here, developer or agent? Read in this order:** [CLAUDE.md](CLAUDE.md) (the
rules) → [BASE-MANUAL.md](BASE-MANUAL.md) (how the base works and *why*, incl. how to
**fork it for a new product** and **how each part scales**) →
[ARCHITECTURE.md](ARCHITECTURE.md) (the locked decisions) →
[BUILD-A-MODULE.md](BUILD-A-MODULE.md) (add a module end to end) →
[CONVENTIONS.md](CONVENTIONS.md) + [UI-CONVENTIONS.md](UI-CONVENTIONS.md) (how code
and screens are written) → the reference docs below as you need them →
[EDGE-CASES.md](EDGE-CASES.md) before touching anything subtle →
[OPERATIONS.md](OPERATIONS.md) to ship.

**Already here, and just need to make ONE change?** That order is the whole tour.
This is the short way in, the minimum that keeps a change in-rule, by the kind of
change it is. CLAUDE.md is on every row because the Laws are, and the planning
ritual in it names the rest:

| You are changing… | Read these, then build |
|---|---|
| a screen or a form | [CLAUDE.md](CLAUDE.md) → [UI-CONVENTIONS.md](UI-CONVENTIONS.md) → [CACHING.md](CACHING.md) |
| a worker route | [CLAUDE.md](CLAUDE.md) → [CONVENTIONS.md](CONVENTIONS.md) → [DATA-MODEL.md](DATA-MODEL.md) |
| a whole new module | [BUILD-A-MODULE.md](BUILD-A-MODULE.md) (it lists its own prerequisites) |
| anything the agent or MCP can reach | [CLAUDE.md](CLAUDE.md) → [MCP.md](MCP.md) → [AGENTIC-IMPORT.md](AGENTIC-IMPORT.md) |
| a table, a column, or a migration | [DATA-MODEL.md](DATA-MODEL.md) → [OPERATIONS.md](OPERATIONS.md) |
| a Law, or anything a Law names | [RULES.md](RULES.md) + `shared/rules/registry.ts` + its check, all three, or the build fails |

Whatever the row, [EDGE-CASES.md](EDGE-CASES.md) is the one to open when something
behaves oddly rather than wrongly, it is where the non-obvious traps are written
down, and most of them cost somebody a day before they got there.

### One topic, one owner

Several documents legitimately touch the same subject at different **altitudes**.
ARCHITECTURE rules on it, BASE-MANUAL explains why it is that way, CONVENTIONS
tells you how to write it, and the data layer is a good example of all three
getting along. What is *not* legitimate is two documents describing the same
MECHANISM step by step, because then they can disagree and nothing says which is
right. This table names the owner for the topics where that has actually happened:

| Topic | Owner, the mechanism lives here | Everyone else |
|---|---|---|
| Which workers exist, what each owns and why | [BASE-MANUAL.md §1](BASE-MANUAL.md) | ARCHITECTURE §2 keeps the *decision* (split by domain, exactly two public doors); OPERATIONS keeps the bindings, crons and hostnames |
| `teamContext` → `requireRight`, step by step | [CONVENTIONS.md §4](CONVENTIONS.md) | BASE-MANUAL §2 keeps *why* the spine is shaped that way (the tall sheet, the module list) |
| Worker vs DO class vs DO instance | [DURABLE-OBJECTS.md §1](DURABLE-OBJECTS.md) | ARCHITECTURE §2 keeps the ruling on what gets an instance |
| Every table and column | [DATA-MODEL.md](DATA-MODEL.md) | everyone links to it; nobody re-lists columns |
| The Laws themselves | [RULES.md](RULES.md) + `shared/rules/registry.ts` | CLAUDE.md summarises them; BASE-MANUAL §4 explains the safety net |

**And a number in prose is a number nothing checks.** ARCHITECTURE described the
portal's allow-list as "fourteen named doors" long after it had grown to
twenty-four, and the same stale figure sat in `web-portal/lib/api.ts`, two copies,
neither of which anybody thought to correct. Where a count is derivable, point at
the thing that holds it (`PORTAL_DOORS` in the portal gateway) instead of writing
it down. The counts that *are* written down, the worker roster, the `R1–Rn` range,
are the ones `web/test/doc-claims.test.ts` checks against the code, which is why
they may be written down at all.

**Rebuilding the whole base from nothing?** Follow
**[BOOTSTRAP.md](BOOTSTRAP.md)**, the day-zero, command-by-command runbook that takes
a fresh Cloudflare account to a live staging + production Brimba. It is the concrete
answer to "with only these docs and the repo, could I recreate the base?", yes: run
that list. For the **one-command** version, the base ships its own build skill in
**[skills/new-app/](skills/new-app/SKILL.md)**, install it (`cp -R skills/new-app
~/.claude/skills/new-app`) and tell Claude Code "new app" to stand up a fresh, branded,
deployed fork automatically (see [skills/README.md](skills/README.md)).

**The rulebook, what governs the base (read before you change it).** Every rule for
modifying, recreating, or building on Brimba lives in one of these, and each is
concrete + checkable:

- **The global habits every Swift Struck build follows**, [SWIFT-STRUCK-WAY.md](SWIFT-STRUCK-WAY.md): the cross-app rules (lean, machine-checked laws, act-as-user, every route gates, deactivate-not-delete, the ship pipeline). Travels with every fork; the `new-app` skill reads it first.
- **The two prime directives** (stay lean; obey the Laws), [CLAUDE.md](CLAUDE.md), the entry point.
- **The Laws of the Base** (R1–R36), [RULES.md](RULES.md), *machine-checked*: pinned to `shared/rules/registry.ts` and enforced by tests that read the source off disk (`web/test/rules.test.ts`, the per-worker `publish-seam.test.ts` for live-sync R1, the `gating-seam` suites, incl. the external mcp surface, for R10, `fetch-timeout` R11, `cron-records` R12, plus the scale/safety round: R13 self-healing catalog, R14 bounded lists, R15 live listeners, R16 exact counts, R17 idempotent transitions, R18 cross-module activity gating, R19 agent/MCP filter parity, R20 scanned boundary validation, R21 no agency door for a client login, R22 agent/MCP body-field parity, R26 the vector index narrows and the team's database decides, R27 described contracts, every backticked identifier in a tool description names something real, R28 the translation catalogue is exactly the set of strings the app says: a sentence missing from it ships untranslated, and an entry nothing says any more is an orphan, R29 the page has one width per front door and a screen never sets its own). Break one → the build goes red. Adding a Law requires the rule, the registry entry, and a check, all three.  **And the check must be able to fail:** every source-scan strips comments before matching (this repo's comments discuss the very seams being scanned), matches a CALL not a word, boundaries each identifier, knows both export shapes, and carries a tripwire asserting it matched something. See CONVENTIONS.md § *Reading config, and writing a check that can fail*, each of those rules was earned by a check that passed its own sabotage.
- **Code house style**, [CONVENTIONS.md](CONVENTIONS.md): the handler shape, the two data doors, gating, boundary validation, deactivate-not-delete, the comment style.
- **UI conventions**, [UI-CONVENTIONS.md](UI-CONVENTIONS.md): library-is-lego, recipe vs bespoke, the enforced UI Laws, the action-icon mapping, the *action-button rows never clip* responsive rule, the voice.
- **How a screen is arranged**, [UI-RULEBOOK.md](UI-RULEBOOK.md): the layer above UI-CONVENTIONS. A *rearrangement* rule book, expressible with the components `shared/ui/` already ships and the tokens the theme already defines, so every rule in it can be applied from `web/`, `web-portal/` and `shared/` without changing a component.
- **What was asked for, and where each item stands**, [CHECKLIST.md](CHECKLIST.md): every request from the feedback round, with a status word beside it and, where something is not being done, the reason.
- **Import + export rules**, [AGENTIC-IMPORT.md](AGENTIC-IMPORT.md): audit parity, export-needs-read/import-needs-create, one-confirm, insert-only, and every import place offers a sample file (test-enforced).
- **Error rules**, [ERROR-HANDLING.md](ERROR-HANDLING.md): never swallow; one client seam; every worker records to the central store.
- **The bad day**, [RESILIENCE.md](RESILIENCE.md): auth named as the single point of failure and what falls over with it, which worker owns a table a pair of them write, and how the rows come back (backup, restore, and what is deliberately not backed up).
- **The single vocabulary**, `shared/glossary.ts` (Law R6, machine-checked): one word per concept, used in all UI copy.

- **The docs themselves are checked too**, `web/test/doc-claims.test.ts` derives the worker roster from `workers/` on disk, reads each `wrangler.jsonc` to see which are public, and reads the Laws' range off `shared/rules/registry.ts`, then fails if any doc (the root canon, the fork skills, or a `.plans/` build plan) states a worker count, a public-door count or a `R1–Rn` range that disagrees. Add a worker or a Law, and every stale sentence goes red the same day.

If a rule isn't machine-checked (e.g. a responsive-CSS convention), the doc says so and names where it's applied.

> **The completeness bar this doc set is held to:** a non-technical owner, an AI agent,
> or a new developer, armed with *only* the repository and these documents, can (1)
> understand exactly how the base works. BASE-MANUAL + ARCHITECTURE; (2) rebuild it
> from scratch. BOOTSTRAP + OPERATIONS; (3) edit it safely. CONVENTIONS + the Laws in
> CLAUDE/RULES; (4) reuse it as the foundation for a bigger product (an ERP, a portal)
>. BASE-MANUAL §5 + BUILD-A-MODULE; (5) read the ruleset. RULES + CLAUDE; (6) wire the
> base's core features into their app. BUILD-A-MODULE + the reference docs; and (7)
> scale every subsystem (teams, roles, permissions, invites, emails, realtime, the
> agent). BASE-MANUAL §6. If you hit something the docs can't answer, that gap is a
> bug in the docs, file it.

0. **[CLAUDE.md](CLAUDE.md)**. Read first if you're an agent (or a new
   developer): the **Laws of the Base** (machine-enforced rules), the build
   style, and this doc map. **[RULES.md](RULES.md)** is the law-book it enforces
   (pinned to `shared/rules/registry.ts`, checked by `web/test/rules.test.ts`).
   **[AGENTS.md](AGENTS.md)** is the cross-tool convention filename, one
   paragraph pointing here, so an agent that opens it by habit lands in the same
   place. It exists to have exactly that content and no more; anything it
   restated would be a second copy of the rules, drifting.
1. **[ARCHITECTURE.md](ARCHITECTURE.md)**, the locked decisions (incl. the
   workers, the live layer, and the Durable Object code-vs-runtime model). Read
   before building anything; do not relitigate without the user.
2. **[OPERATIONS.md](OPERATIONS.md)**, how it builds and ships.
   **[RUNBOOK.md](RUNBOOK.md)** is the other direction: rolling a change back out
   (with the named triggers that say when to roll back rather than fix forward),
   getting data back with D1 Time Travel, and what to check when it breaks at two
   in the morning. **[INVENTORY.md](INVENTORY.md)** is everything the app needs
   that is *not* in this repository, the accounts, the domains, the two Google
   OAuth clients, every credential by name, the cron jobs, and an honest list of
   what has no backup. **[CHANGELOG.md](CHANGELOG.md)** is the eras this project
   moved through, reconstructed from git history so a newcomer can read how it got
   here without reading 350 commits.
3. **[CACHING.md](CACHING.md)**, the system-wide caching + loading/feedback
   ruleset (cache-first, row-level live-sync, patch the changed row, never
   refetch the list, examples). Follow it for every screen/module.
4. **[CONCURRENCY.md](CONCURRENCY.md)**, the race-safety ruleset (atomic writes,
   unique indexes, when a Durable Object is the lock). Follow it for any write
   that protects an invariant (counts, balances, uniqueness).
5. **[ERROR-HANDLING.md](ERROR-HANDLING.md)**, the error-capture ruleset (the
   one swappable logging seam, the error boundary, never-swallow).
6. **[ROADMAP.md](ROADMAP.md)**, **history, not a plan.** The build record of ONE
   round (Phase C: members, roles & settings), closed 2026-07-02, with the
   type/endpoint contracts each of its phases plugged into. Kept so its decisions
   aren't re-argued; it does not describe the eras that shipped after it. There is
   deliberately no single "what's next" file. Open work lives beside the thing
   it's open on: **UI-GAPS.md** (library gaps), **EDGE-CASES.md** (the deferred
   perf wins), **AGENT-MODULES-PLAN.md** (the deferred agent hooks),
   **[ADVISORIES.md](ADVISORIES.md)** (every dependency advisory, and the proof
   of whether the code we deploy can reach it), and **BASE-IMPROVEMENTS.md**
   (what each audit round changed). For what is true today: this file →
   BASE-MANUAL.md.
7. **[SEARCH.md](SEARCH.md)**, the search + in-app-filter ruleset (the layered
   client-side → server `?q=` → per-team FTS5 model; recipe-declared).
8. **[DATA-MODEL.md](DATA-MODEL.md)**, every table (global core + per-team), what's
   built vs. to build, and the cross-cutting model resolutions.
9. **[SCREEN-ENGINE-PLAN.md](SCREEN-ENGINE-PLAN.md)**, the screen-recipe engine and
   the `/t/<teamId>/<module>/<id>` deep-link grammar the team area runs on.
10. **[UI-GAPS.md](UI-GAPS.md)**, the running list of things the component library
    still cannot do (a gap is fixed in the library, once, not worked around on
    each screen that hits it).
11. The UI comes ONLY from the component library, which lives **in this repo** at
    `shared/ui/` and is imported as `@shared/ui/…`. It was the npm package
    `@kwapso/ui`, installed from a separate repo, until it was vendored on
    2026-08-22 so the reskin could change component shape and not only colour.
    Missing a component? Build it in `shared/ui/` — never one-off UI in `web/`.
    Never edit the upstream `swift-struck-ui` repo, which other products depend
    on; `shared/ui/README.md` has the whole rationale.

### The manual, build on it, understand it, rebuild it from zero

12. **[BASE-MANUAL.md](BASE-MANUAL.md)**, how the whole base works AND *why*: the
    eight workers, the two-tier database, the permission spine, how a new module and
    the base influence each other, and how to change foundational code + how a
    change ripples. Start here to understand the system.
13. **[BUILD-A-MODULE.md](BUILD-A-MODULE.md)**, the golden-path checklist to add a
    team module end to end (table → permissions → worker → web → detail → tests),
    worked through a real module.
14. **[CONVENTIONS.md](CONVENTIONS.md)**, the code + comment house style (the
    handler shape, the data doors, gating, validation, deactivate-not-delete, the
    comment convention, how `npm run check` gates everything).
15. **[UI-CONVENTIONS.md](UI-CONVENTIONS.md)**, how screens are built: the
    library-is-lego rule, recipe vs. bespoke, the enforced UI Laws, the
    action-icon mapping, and the voice.
16. **[DURABLE-OBJECTS.md](DURABLE-OBJECTS.md)**, the realtime Durable Object
    (`TeamChannel`), the code-vs-runtime model, and when a DO is the lock vs. plain
    atomic D1.
17. **[EDGE-CASES.md](EDGE-CASES.md)**, the non-obvious traps a maintainer must
    know (the static-export reload, the list-cache-as-detail-source, the REST-door
    round-trips, the confirm model, streaming, and more).
18. **[AGENTIC-IMPORT.md](AGENTIC-IMPORT.md)**, the agent-driven, multi-table data
    import: dump old-system CSV exports, the agent normalizes + maps + orders
    interdependent tables + resolves foreign keys + rejects honestly, writing every
    row through the gated door (audit parity). How an app declares an import target
    + references. Read before building an import for a new module.
19. **[BOOTSTRAP.md](BOOTSTRAP.md)**, the day-zero, command-by-command runbook to
    rebuild the whole base from a fresh Cloudflare account (also linked at the top).
20. **[MCP.md](MCP.md)**, the machine door: how an outside developer/tool connects to
    the base over MCP (get a token → `Bearer` on `/mcp`), the tool catalogue, and the
    cost model (reads/exports/imports are free endpoint hits; only the assistant tools
    draw the team's AI quota — scope the role to control it).
21. **[PLATFORMS.md](PLATFORMS.md)**, where the base can run. **Cloudflare is
    recommended** (and `new-app` stands it up turnkey); this maps the base's five seams
    (per-team data · live layer · compute · storage · static web) onto the top-10 cloud
    providers (AWS, GCP, Azure, Vercel, Supabase, Fly.io, Render, DigitalOcean, Netlify)
    with an honest effort rating and the porting method (swap ~4 seam files, not the app).
22. **[mcp-quickstart.md](mcp-quickstart.md)**, the one-page version of MCP.md, meant
    to be handed straight to an outside developer. Deliberately a short overlap with
    MCP.md, not a second source: MCP.md is the full detail, this is the page you send.
23. **[SCOPE.html](SCOPE.html)**, the product's scope of work: what kwapso is for,
    chapter by chapter. The other docs defer to it by chapter ("SCOPE ch.06") for
    product decisions — the account fence, the two front doors, what the client may
    see — so when a rule here says "because SCOPE says so", this is the book it means.
    Open it in a browser.
24. **[kwapso-the-system-explained.html](kwapso-the-system-explained.html)**, the
    owner-facing walkthrough of the whole system in plain language. A companion to
    SCOPE, not a rule source.
25. **[glide/README.md](glide/README.md)**, the legacy Glide catalogue: the two apps
    kwapso ran on before this one, how to pull their rows, and the field
    reconciliation. `glide/data/` is git-ignored — it is customer data.
26. **`planning-answers/`**, the answered briefing forms behind SCOPE.html, one JSON
    file per round per respondent (`plan_with_questions` exports). Rounds 1–2 settled
    the shape of the system; round 3 was answered independently by three people
    (Alaap K, Alex, Aurora) so agreement could be told apart from misunderstanding;
    round 4 closed the open questions. **Tracked on purpose, and not to be deleted or
    edited:** SCOPE ch.13 states that every decision in it traces back here, so these
    files are the evidence for "we decided this, and here is who said so". They are a
    RECORD, never a spec — where a form answer and SCOPE.html disagree, SCOPE wins,
    and where SCOPE is silent, base law applies. They hold no customer data.
27. **`scaling-review.md`**, the scaling audit (14 Aug 2026): the twelve-dimension
    score, the platform limits looked up live, **what breaks first and at what size**
    (the live layer, at roughly 3,000–5,000 concurrent sockets in one team), the twelve
    repairs that landed, and the eleven items judged too risky to change, each written
    up as a plan with its tier. **The DECISION it produced is
    [ARCHITECTURE.md §7](ARCHITECTURE.md) — 78 accepted, LOCKED — and that section is
    self-sufficient**, because this file (like every audit report here) is git-ignored:
    a local artifact, not tracked canon, so a fresh clone will not have it. A REPORT,
    never a rule source: where it and RULES.md disagree, RULES.md wins.
    `scaling-review.html` is the same thing as a visual scorecard.

### Where the code lives

| Folder | What it is |
|---|---|
| `web/` | the AGENCY screens (Next.js static export → `web/out`, served by `workers/gateway`) |
| `web-portal/` | the CLIENT PORTAL screens (static export → `web-portal/out`, served by `workers/portal-gateway`). Its own workspace, its own tests, including the account-fence suite |
| `workers/` | the eight workers. Six private brains + the two public gateways |
| `shared/` | what every side agrees on. `shared/workers/`, the worker seams (gating, the data door, validation, publish); `shared/web/`, the front-end seams BOTH apps import (the cache `store.ts`, the live client `realtime.ts`, `log.ts`, `form-shell.tsx`, `format-count.ts`, `use-form-draft.ts`); plus the types, the glossary and the rules registry. A file lands in `shared/web/` the moment the second front end needs it, that is why several seams the docs used to place under `web/lib/` now live here |
| `db/core/` | the global core database's migrations (per-team schema lives in `workers/tenancy/src/team-schema.ts`) |
| `scripts/` | the operational scripts, reset, seed, the smokes, the Glide pull |
| `skills/` | the build skills that travel with the base (`new-app`) |
| `planning-answers/` | the answered briefing forms SCOPE.html traces its decisions to (see #26). A record, not a spec |

## Develop

**You need:** **Node 22** (pinned in `.nvmrc` and `package.json` `engines`, it is
what CI runs), npm 10+, and git. Nothing else, and no cloud account: the commands
below run entirely on your machine. Deploying is a different list. BOOTSTRAP.md
§ 0 has it, and INVENTORY.md names every account and credential involved.

```bash
npm install        # every dependency from npm; the UI library came with the clone, in shared/ui
npm run dev        # the agency app on http://localhost:3000
npm run dev:portal # the client portal on http://localhost:3001
npm run lint       # the fast half of the gate — oxlint over every workspace (~15ms)
npm run check      # THE GATE — lint, then types across every workspace, then the full test suite
```

`npm run check` is what you run before any commit. It lints, then type-checks both front
ends and all eight workers, then runs every test, including the law checks that read the
source off disk, a plain `npx tsc --noEmit` proves far less.

**What green looks like:** **exit code 0**, ten workspaces, every suite passing.
For scale, that is roughly 149 test files and 1,600-odd tests; don't compare
against those figures, compare against exit 0, because the suite grows every week.

**Exactly one suite skips itself, and that is correct**:
`workers/content/test/knowledge-backfill.test.ts` measures the knowledge base over
the agency's real Glide history, and that data is git-ignored customer material
(INVENTORY.md § 6). It is absent from every clone, so on your machine this run
ends `32 passed | 1 skipped` in the content worker. **That skip is green.** A skip
anywhere else is not, investigate it. The exact count for the commit you are
standing on:

```bash
npm run check 2>&1 | grep -E "Test Files|Tests "
```

Set a worker up for local dev by copying its `.dev.vars.example` to `.dev.vars`
(gitignored), every worker that takes a secret has one, and each names what
breaks when a value is missing.

Ship by saying **"ship to staging"** / **"ship to production"**, the skills
read OPERATIONS.md and handle GitHub + Cloudflare. To take a change back out
again, or to work out what is wrong while it is live, read
[RUNBOOK.md](RUNBOOK.md).

## Licence

Proprietary and confidential, copyright © 2026 Swift Struck, all rights
reserved. See [LICENSE](LICENSE). Access to this repository does not grant a
licence to use, copy or redistribute it. Third-party dependencies keep their own
licences, which are acknowledged in the same file.
