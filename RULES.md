# RULES.md — the Laws of the Base (machine-checked)

These are the **laws** every part of Brimba (and anything built on top of it) must
obey. They are not style suggestions — each one is enforced by a real test, so a
change that breaks a law turns the build **red**. This is how an agreed rule
actually sticks instead of quietly slipping over time.

The single source of truth is **`shared/rules/registry.ts`** (the laws as data).
This document is the human-readable twin; a check (`registry-integrity`, in
`web/test/rules.test.ts`) asserts this table lists **exactly** the law ids in the
registry — so the doc and the code can never drift. **You cannot add a law without
its check, and you cannot add a check without its law.**

Deny-lists (the reviewed exceptions for each law) live as DATA in the registry, so
every exception is a visible, conscious line — never a silent bypass.

## The client portal, and the exceptions it earns

`web-portal/` is the second front end (the client portal; `web/` is the agency app).
It obeys the same laws with three recorded differences, and they are written here
because an exception nobody can find is a bypass with better manners:

- **R2 on the portal — `PORTAL_ACTIVITY_EXEMPT`** (in the registry). Every record
  detail in the base carries Overview + Activity, because a record's history is what
  makes a shared workspace trustworthy. On the client's side that same feed is a
  disclosure: its rows name the staff who moved a ticket or edited an account, and the
  portal shows work status but never who inside the agency is doing it (SCOPE ch.06).
  Two components are listed — the ticket screen and the company screen — each with the
  sentence for why. The activity door is not on the portal gateway's surface at all,
  so this is not a hidden tab; it is a door that was never opened.
  `web-portal/test/rules.test.ts` fails if a listed component grows an activity feed,
  and if a listed component no longer exists.
- **The account fence — `PORTAL_VISIBLE_READS`** (in the registry). Every read a
  client can reach names the fence its lib function must carry.
  `web-portal/test/portal-fence.test.ts` walks the portal gateway's own door table
  through to the function behind each door and demands that function touch the
  caller's stamp — FUNCTION level, not file level, because this list once said a file
  was fenced while one of its readers was not.
- **`workers/portal-gateway/` has no `gating-seam` and no `publish-seam` suite** — a
  reasoned exemption, not an oversight. That worker owns no writes of its own and no
  tables: every `/api` request it accepts is forwarded, unchanged, to a door that is
  already gated (R10) and already publishes (R1) in the worker that owns it. There is
  nothing there for either seam test to read. What it *does* own is which doors exist
  at all, and that is checked instead by `workers/portal-gateway/test/portal-door.test.ts`,
  which derives the agency's whole `/api` surface off `web/lib/api.ts` and asserts every
  door the portal does not name returns a 404. A door-list worker is held to a
  door-list check.

| ID | Dimension | Law (plain English) | Check (test id) | Status |
|----|-----------|---------------------|-----------------|--------|
| R1 | arch | Every mutation route publishes a live change ping (so screens stay live). | `publish-seam` (per-worker tests: tenancy, content, data-ops; auth's two user-channel publishes and mcp's caller-private token rows are the reviewed, untested exceptions — CACHING rule 5) | enforced |
| R2 | ui | Every record-detail screen exposes Overview + Activity tabs. | `record-detail-tabs` | enforced |
| R3 | ui | Collection tab strips use the library TabsView (icon + count badge) — no hand-rolled button toggles. | `no-handrolled-toggles` | enforced |
| R4 | ui | Every form/dialog renders through the shared FormShell (title+subtitle · separator · fields · separator · action). | `forms-use-formshell` | enforced |
| R5 | arch | Record activity is read through ONE generic (table, id) path — any module's history, no per-module read SQL. | `generic-activity-path` | enforced |
| R6 | ui | Product terms live in ONE glossary (clear, brief, no over-explaining) — the app speaks one dictionary. | `glossary-wellformed` | enforced |
| R7 | ui | Every form dialog persists its draft per session (useFormDraft) — unsaved input survives navigating away (CACHING.md §11). | `forms-persist-drafts` | enforced |
| R8 | ui | **Every tab that reveals a collection carries that collection's count — on BOTH tab surfaces.** A team section tab (`placement:'tab'`) declares a `countCacheKey`; a **record-detail** tab is badged from the block it reveals — recipe details through the `withTabCounts` seam (which collection is DERIVED from the tab's own block: `activity` → its source, `list` → its module), bespoke details in their own tabs config. A tab that shows no collection (Overview, the article body, the permission grid) says so once, as a reviewed `RECORD_TAB_COUNT_EXCEPTIONS` entry. R8 owns WHICH collection a tab's badge describes (derived, never hand-listed). The NUMBER is owned by R16 (an exact server total through `formatCount`); where the two disagree, R16 prevails. *Earned by:* every record in the app shipping an Activity tab with no count at all — the check walked the team strip, and the record tabs were built somewhere else. | `tab-counts-derived` | enforced |
| R9 | arch | The agent knows what the app can do — its system prompt carries a capability brief GENERATED from the import/export catalog (+ the glossary), so the UI and the agent can never disagree about a capability. And it knows what the app REFUSES: a vocabulary-gated write states its call ORDER (create the dropdown value first, write the rows second, one turn) on BOTH surfaces the model reads — the tool's own description and the system rule wall. | `agent-app-parity` (workers/data-ops/test/agent-parity.test.ts) | enforced |
| R10 | arch | Every state-changing route opens with a permission gate (requireRight / gated / requireAnyImportRight / adminGuard) — unless it's a reviewed identity-gated write (teamless onboarding, own-pointer, ownership) that gates on whoAmI. No ungated door ships. | `gating-seam` (per-worker tests: tenancy, content, data-ops **and mcp** — the security counterpart to `publish-seam`. The mcp suite is the EXTERNAL machine surface's own: it asserts every non-GET route there opens with token or user verification, because a door reached by a machine is reached by a stranger) | enforced |
| R11 | arch | Every external `fetch()` (a bare global fetch to the internet — D1 REST door, email sender, AI model call) carries an `AbortSignal` timeout, so a hung socket can't stall a worker. Service-binding `X.fetch()` calls are Cloudflare-bounded and exempt. | `fetch-timeout` (source-scan in `web/test/rules.test.ts`) | enforced |
| R12 | arch | Every cron / `scheduled` handler records its failures to the error store (`recordWorkerError`) — unattended work has no user watching, so a swallowed background failure would vanish from the 90-day error log. (A user-facing catch that shows a friendly message should record too — a convention; see the agent's model-call catch.) | `cron-records` (source-scan in `web/test/rules.test.ts`) | enforced |
| R13 | arch | Shipping the code ships the capability: every module is an import TargetDef or a reviewed `CATALOG_EXEMPT` entry — AND the core catalogue reconciles itself against the code on READ (INSERT-only, `ON CONFLICT DO NOTHING`: a target the owner switched OFF stays off; only a never-existed row is created; the picker filters `is_active` in memory, never in SQL). *Earned by:* staging importing two modules that production, running byte-identical code, could not — rows are data, and no deploy carries data. | `catalog-coverage` (`workers/data-ops/test/catalog-coverage.test.ts`) | enforced |
| R14 | arch | **No unbounded list endpoint, and no capped GROWING one.** Every exported `list*`/`search*` function backing a collection applies a HARD CAP (`LIMIT n`, said in a comment; the caps live in `shared/workers/limits.ts`) — but a collection that GROWS with ordinary use (`GROWING_COLLECTIONS` in the registry: support tickets, the activity feed) must **PAGE** instead, and page by KEY not offset: an opaque cursor, an exact total and `hasMore` through the one `pagedJson` seam (`shared/workers/paging.ts`), with a client that can actually reach page two. A cap is an honest refusal to answer; paging is an answer. *Earned by:* one unbounded read stalling a worker under a 24,000-row catalogue — then the same catalogue proving a 1,000-row ceiling is just a slower refusal. | `bounded-lists` (source-scan in `web/test/rules.test.ts`) | enforced |
| R15 | arch | **No deaf publishers:** every resource string any worker publishes must reach a listener (`TEAM_RESOURCES` / `SIMPLE_INVALIDATIONS` in `web/lib/live-resources.ts`, or the portal's own `PORTAL_LISTENERS`) or a reasoned `DEAF_EXEMPT` entry — the publisher set DERIVED by scanning `publishChange` calls, never hand-listed. *Earned by:* a manager screen staling because its worker pinged a resource nothing listened to. **A half was retired, on purpose:** R15 also used to require every paged screen to subscribe via `useLiveRefetch`. That clause detected paged screens by matching `/search?` or `usePagedList` in `web/components` — **zero files matched**, so its offender list was permanently empty and it protected a hook with **no call sites**. The need was real when written and then went away: paging moved to opaque **cursors over the shared store**, so a paged list's rows now live in a cache key (`accounts:<team>`, `help:<team>`, `activity:record:…`) with its cursor in a sidecar — exactly the caches the row-level registry patches and the portal's listener map invalidates. No screen holds page state *outside* those caches any more, which was the hook's whole premise. So the clause and `web/lib/use-live-refetch.ts` were **retired** rather than re-detected: a law kept alive by a filter matching nothing buys confidence without paying for it. | `live-collections` (source-scan in `web/test/rules.test.ts`) | enforced |
| R16 | ui | Every screen showing a collection shows its count, exactly once. The NUMBER: an exact server COUNT(*) through the ONE `formatCount` seam (`shared/web/format-count.ts` — floored abbreviation at every magnitude, zero/loading render nothing, the only "+" is a capped SEARCH total; a paginated screen still badges the WHOLE collection). The PLACE: a tab badge where the screen has a counted tab, else a `CollectionHeading`. The ARBITRATION: a React context (`CountedTabs`/`CountedAbove`) — a counted tab WINS and the heading stands down, decided per-permission at render, never by a prop. R16 owns the number; R8 owns which collection a tab describes. *Earned by:* a 24,011-product catalogue advertising "1000" (a capped list's length), and the same "24k" shown twice on one screen. | `counted-collections` (source-scan in `web/test/rules.test.ts` + `format-count.test.ts`) | enforced |
| R17 | arch | State transitions are idempotent: every deactivate/reactivate UPDATE carries the current-status predicate (`AND deactivated_at IS [NOT] NULL`; status moves: `AND status <> ?`), reads the changed-row count back, and when ZERO rows moved writes no activity row and publishes no change. *Earned by:* a double-clicked Deactivate writing two "deactivated" rows 2.0s apart into one record's history — history says what happened, not how many times a button was pressed. | `idempotent-transitions` (source-scan in `web/test/rules.test.ts`) | enforced |
| R18 | arch | A cross-module read carries the caller's module rights: the team activity feed subtracts denied modules through ONE shared clause (`activityVisibilityClause` — any count over the feed must reuse it), and every `relatedTable` a worker writes resolves through `ACTIVITY_GATE_MAP` or a pinned, reasoned `ACTIVITY_TABLE_EXEMPT` entry. *Earned by:* a member with a single read right seeing every module's before/after ("changed BIG-0000001 price from 4,500 to 3,900") through the one ungated feed. | `activity-gate-coverage` (source-scan in `web/test/rules.test.ts`) | enforced |
| R19 | ai | Agent/MCP filter parity: any tool sitting on a screen's list/search door EXPOSES and FORWARDS every filter that door parses — the required set is DERIVED from the door's own parameter parsing, never hand-listed. *Earned by:* the assistant falling back to free text and answering a DIFFERENT question — 3,465 descriptions that mentioned the words instead of the 134 records carrying the value. | `agent-filter-parity` (`workers/mcp/test/filter-parity.test.ts`) | enforced |
| R20 | arch | **Input is validated at the boundary — and now it is SCANNED.** Every field a worker reads off a request body must sit in a **checking position**: the first argument of a validator from `shared/workers/validate.ts` (`requireText` / `optionalText` / `queryText` / `requireIdList`, plus `parseUploadDataUrl` — the same seam for bytes), the operand of `typeof`, inside `Array.isArray()` or `Number()`, a strict comparison against a literal, or the needle of an allow-list `.includes()`. Nothing else: **a truthiness guard is not a type check** (`if (!body.id)` lets `{}`, `[]`, `123` and a 10 MB string straight through), and a cast is not a check at all. A body may not be **destructured at the read** — that scatters untrusted values into bare locals nothing can follow back to the boundary. A door that genuinely cannot validate is a reasoned `RAW_BODY_EXEMPT` line in the registry, and the list is a **ratchet**: a listed line that is no longer an offender turns the build red, so it can only shrink. *Earned by:* `POST /api/auth/email/start` with `{"email": 123}` — an unauthenticated **500** that crashed *before* the send throttle and wrote an `error_logs` row into the **global core database** on every request. And earned twice over by how long it hid: this law lived for months as a sentence in CLAUDE.md claiming to be "locked by `workers/content/test/validate.test.ts`", which locks the helpers' behaviour and the **query** half and excludes `workers/auth` outright. Every other law had a scanner; the one about never trusting a request body had prose. | `validated-bodies` (source-scan in `web/test/rules.test.ts`) | enforced |
| R21 | arch | **A door on the agency's own material refuses a client login — at the door.** Every route reachable at the AGENCY origin that a caller holding only the **Client role's** rights can pass — including every door gated by nothing but membership — must do one of four things: refuse a portal caller (`refusePortalCaller`), resolve the caller's account fence (`accountScope`), be a door the **client portal itself opens** (`PORTAL_DOORS`), or be a reasoned `CLIENT_REACHABLE_EXEMPT` line whose reason is always the same shape — *the door answers about the caller themselves*. Nothing is hand-listed: the Client role's rights are read out of the seed, the routes out of each worker's own `ROUTES` table, the gate out of the handler source (following route-local helpers, so a refusal one frame down still counts), the portal's surface out of `PORTAL_DOORS`. *Earned twice.* The client portal's gateway forwards a NAMED allow-list and leaves the agency's own doors out, saying why; the agency gateway forwards **by prefix**, and a client login is an ordinary team member holding an ordinary role — so every door the portal withheld was served to the same person at the other hostname. First the learning library and the dropdown vocabulary. Then, because the enumeration that followed listed *what the accounts module owns* instead of *what a client can reach*, the help **stakeholder** list — which names the agency's staff admins with their email addresses, and answered on a POST as well as a GET. **Enumerate by what a client can reach, never by what a module owns.** | `client-reachable-doors` (source-scan in `web/test/rules.test.ts`) | enforced |

## How to add a new law

1. Add a row to `RULES_REGISTRY` in `shared/rules/registry.ts` with a real
   `checkId`.
2. Write the check (a per-worker test, or a case in `web/test/rules.test.ts`).
3. Add the matching row to the table above.

The `registry-integrity` check verifies steps 1 and 3 stay in sync. A rule with
no working check is not a law — delete it or write the check.

## Dimensions

Laws are cross-cutting: **arch** (architecture/data), **ui** (interface),
**workflow** (how we build), **ai** (the assistant). The agent/MCP tool surface is
already held to the doors it forwards to (`workers/mcp/test/catalog.test.ts` +
`workers/data-ops/test/trace-parity.test.ts`); a natural next row is a UI law once a
new interface pattern stabilises.
