// THE LAWS OF THE BASE, as data. This is the single source of truth the human
// RULES.md and the machine-checks (shared/rules + the per-worker publish-seam
// tests + web/test/rules.test.ts) are both pinned to. A law may not be added
// without a check; a check may not exist without a law (enforced by L0 in
// web/test/rules.test.ts). Deny-lists are DATA here, so every exception is a
// reviewed, visible line — never a silent bypass (the proven publish-seam pattern).

export type Dimension = "arch" | "ui" | "workflow" | "ai"
export type RuleStatus = "enforced" | "aspirational"
export interface Rule {
  id: string
  dimension: Dimension
  law: string
  /** the test id that enforces it (a per-worker suite or a web rules.test case). */
  checkId: string
  status: RuleStatus
}

export const RULES_REGISTRY: Rule[] = [
  {
    id: "R1",
    dimension: "arch",
    law: "Every mutation route publishes a live change ping.",
    checkId: "publish-seam",
    status: "enforced",
  },
  {
    id: "R2",
    dimension: "ui",
    law: "Every record-detail screen exposes Overview + Activity tabs.",
    checkId: "record-detail-tabs",
    status: "enforced",
  },
  {
    id: "R3",
    dimension: "ui",
    law: "Collection tab strips use the library TabsView (icon + count badge) — no hand-rolled button toggles.",
    checkId: "no-handrolled-toggles",
    status: "enforced",
  },
  {
    id: "R4",
    dimension: "ui",
    law: "Every form/dialog renders through the shared FormShell (one title/subtitle · separator · fields · separator · action layout).",
    checkId: "forms-use-formshell",
    status: "enforced",
  },
  {
    id: "R5",
    dimension: "arch",
    law: "Record activity is read through ONE generic (table, id) path — any module's history, no per-module read SQL.",
    checkId: "generic-activity-path",
    status: "enforced",
  },
  {
    id: "R6",
    dimension: "ui",
    law: "Product terms live in ONE glossary (clear, brief, no over-explaining) — the app speaks one dictionary.",
    checkId: "glossary-wellformed",
    status: "enforced",
  },
  {
    id: "R7",
    dimension: "ui",
    law: "Every form dialog persists its draft per session (useFormDraft) — unsaved input survives navigating away (CACHING.md §11).",
    checkId: "forms-persist-drafts",
    status: "enforced",
  },
  {
    id: "R8",
    dimension: "ui",
    law: "Every tab that reveals a collection carries that collection's count, on BOTH tab surfaces: a team section tab (placement:'tab') declares a countCacheKey, and a RECORD-DETAIL tab is badged from the block it reveals — recipe details through the withTabCounts seam (the collection is derived from the tab's own block: activity → its source, list → its module), bespoke details in their own tabs config. A tab that shows no collection says so once, as a reviewed RECORD_TAB_COUNT_EXCEPTIONS entry. R8 owns WHICH collection a tab's badge describes (derived from the recipe/registry, never hand-listed). The NUMBER the badge shows is owned by R16 (an exact server total through formatCount); where the two disagree, R16 prevails. Earned by: every record in the app shipping an Activity tab with no count at all — the team strip was walked, the record tabs were built elsewhere and never were.",
    checkId: "tab-counts-derived",
    status: "enforced",
  },
  {
    id: "R9",
    dimension: "arch",
    law: "The agent knows what the app can do — its system prompt carries a capability brief GENERATED from the import/export catalog (+ the glossary), so the UI and the agent can never disagree about a capability. And it knows what the app REFUSES: a vocabulary-gated write states its call ORDER (create the dropdown value first, write the rows second, one turn) on BOTH surfaces the model reads — the tool's own description and the system rule wall. Earned by: a perfectly-planned single call refused by the vocabulary gate, ending a turn having changed nothing.",
    checkId: "agent-app-parity",
    status: "enforced",
  },
  {
    id: "R10",
    dimension: "arch",
    law: "Every state-changing route opens with a permission gate — requireRight (or the gated()/gatedBody() wrapper / requireAnyImportRight / adminGuard) — unless it is a reviewed identity-gated write (teamless onboarding, own-pointer, ownership) that gates on whoAmI instead. No ungated door can ship.",
    checkId: "gating-seam",
    status: "enforced",
  },
  {
    id: "R11",
    dimension: "arch",
    law: "Every external fetch (a bare global fetch() to the internet — the D1 REST door, the email sender, the AI model call) carries an AbortSignal timeout, so a hung socket can never stall a worker. Service-binding calls (X.fetch()) are Cloudflare-bounded and exempt.",
    checkId: "fetch-timeout",
    status: "enforced",
  },
  {
    id: "R12",
    dimension: "arch",
    law: "Every cron / scheduled handler records its failures to the error store (recordWorkerError) — unattended work has no user watching, so a swallowed background failure would be invisible in the 90-day error_logs. (A user-facing catch that shows a friendly message should record too — a documented convention, e.g. the agent's model-call catch.)",
    checkId: "cron-records",
    status: "enforced",
  },
  {
    id: "R13",
    dimension: "arch",
    law: "Shipping the code ships the capability: every module is a TargetDef in the import/export catalog or a reviewed CATALOG_EXEMPT entry — AND the core catalogue table reconciles itself against the code on READ (INSERT-only, ON CONFLICT DO NOTHING: a target the owner switched OFF stays off; only a row that never existed is created; the picker never pre-filters is_active in SQL). Earned by: staging importing two modules that production, running byte-identical code, could not — rows are data, and no deploy carries data.",
    checkId: "catalog-coverage",
    status: "enforced",
  },
  {
    id: "R14",
    dimension: "arch",
    law: "No unbounded list endpoint, and no capped GROWING one: every exported list*/search* function backing a collection route applies a HARD CAP (LIMIT n, said in a comment) — but a collection that GROWS with ordinary use (GROWING_COLLECTIONS) must PAGE instead, by KEY not offset: an opaque cursor, an exact total, and hasMore, with a client that can actually reach page two. A cap is an honest refusal to answer; paging is an answer. Earned by: one unbounded read stalling a worker under a 24,000-row catalogue — then the same catalogue proving a 1,000-row ceiling is just a slower refusal.",
    checkId: "bounded-lists",
    status: "enforced",
  },
  {
    id: "R15",
    dimension: "arch",
    law: "No deaf publishers: every resource string any worker publishes must reach a listener (TEAM_RESOURCES / SIMPLE_INVALIDATIONS in web/lib/live-resources.ts, or the portal's own PORTAL_LISTENERS) or a reasoned DEAF_EXEMPT entry — the publisher set DERIVED by scanning publishChange calls, never hand-listed. Earned by: the dropdown manager staling because its worker pinged a resource nothing listened to. RETIRED HALF: this law also used to require every paged screen to hold a useLiveRefetch subscription. That clause detected paged screens by matching '/search?' or 'usePagedList' in web/components — zero files matched, so it could never fail, and the hook it protected had no call sites. The need was real and then went away: paging moved to opaque cursors over the SHARED STORE, so a paged list's rows now live in a cache key with its cursor in a sidecar — the very caches the row-level registry patches and the portal's listener map invalidates. No screen holds page state outside them any more, which was the hook's whole premise, so the clause and web/lib/use-live-refetch.ts were retired rather than re-detected.",
    checkId: "live-collections",
    status: "enforced",
  },
  {
    id: "R16",
    dimension: "ui",
    law: "Every screen showing a collection shows its count, exactly once: the NUMBER is an exact server COUNT(*) rendered through the ONE formatCount seam (floored abbreviation at every magnitude, zero/loading render nothing, the only '+' is a capped SEARCH total); the PLACE is a tab badge where the screen has a counted tab, else a CollectionHeading; the ARBITRATION is a React context (CountedTabs / CountedAbove) — a counted tab WINS and the heading stands down, decided per-permission at render, never by a prop. Where R8 and R16 disagree about a number, R16 prevails (R8 owns WHICH collection a tab describes). Earned by: a 24,011-product catalogue advertising '1000' (a capped list's length), and the same '24k' shown twice on one screen.",
    checkId: "counted-collections",
    status: "enforced",
  },
  {
    id: "R17",
    dimension: "arch",
    law: "State transitions are idempotent: every deactivate/reactivate UPDATE carries the current-status predicate (deactivate: AND deactivated_at IS NULL; reactivate: IS NOT NULL — status moves: AND status <> ?), reads the changed-row count back, and when zero rows moved writes NO activity row and publishes NO change. Earned by: a double-clicked Deactivate writing two 'deactivated' rows 2.0s apart into one record's history — history says what happened, not how many times a button was pressed.",
    checkId: "idempotent-transitions",
    status: "enforced",
  },
  {
    id: "R18",
    dimension: "arch",
    law: "A cross-module read carries the caller's module rights: the team activity feed subtracts the caller's denied modules (ONE shared clause that any count over the feed must reuse), and every relatedTable a worker writes resolves to a module in ACTIVITY_GATE_MAP or a reasoned ACTIVITY_TABLE_EXEMPT entry. Earned by: a member with one read right seeing every module's before/after ('changed BIG-0000001 price from 4,500 to 3,900') through the one ungated feed.",
    checkId: "activity-gate-coverage",
    status: "enforced",
  },
  {
    id: "R19",
    dimension: "ai",
    law: "Agent/MCP filter parity: any tool sitting on a screen's list/search door EXPOSES and FORWARDS every filter that door parses — the required set is DERIVED from the door's own parameter parsing, never hand-listed. Earned by: the assistant falling back to free text and answering a DIFFERENT question — 3,465 descriptions that mentioned the words instead of the 134 records actually carrying the value.",
    checkId: "agent-filter-parity",
    status: "enforced",
  },
  {
    id: "R20",
    dimension: "arch",
    law: "Input is validated at the boundary — and it is SCANNED. Every field a worker reads off a request body must sit in a CHECKING position: the first argument of a validator from shared/workers/validate.ts (requireText / optionalText / queryText / requireIdList), the operand of typeof, inside Array.isArray() or Number(), a strict comparison against a literal, or the needle of an allow-list .includes(). Nothing else — a truthiness guard is not a type check, and a cast is not a check at all. A body may not be DESTRUCTURED at the read (that scatters untrusted values into bare locals nothing can follow). A door that genuinely cannot validate is a reasoned RAW_BODY_EXEMPT line, and the list may only SHRINK: a listed line that is no longer an offender turns the build red. Earned by: POST /api/auth/email/start with {\"email\": 123} — an unauthenticated 500 that crashed BEFORE the send throttle and wrote a row into the global core database on every request. This law existed as a sentence for months, claiming to be locked by a test that covers the query half and excludes auth outright.",
    checkId: "validated-bodies",
    status: "enforced",
  },
  {
    id: "R21",
    dimension: "arch",
    law: "A door on the AGENCY's own material refuses a client login, at the door. Every route reachable at the agency origin that a caller holding only the Client role's rights can pass — including every door gated by nothing but membership — must either refuse a portal caller (refusePortalCaller), resolve the caller's account fence (accountScope), be a door the client portal itself opens, or be a reasoned CLIENT_REACHABLE_EXEMPT line. The reachable set is DERIVED: the Client role's rights come from the seed, the routes from each worker's own ROUTES table, the gates from the handler source, the portal's surface from PORTAL_DOORS. Earned TWICE: the learning library and the dropdown vocabulary, then the ticket stakeholder list — each defended only by the OTHER gateway's allow-list, which is to say not defended, because the agency gateway forwards by prefix and a client login is an ordinary team member. Enumerate by WHAT A CLIENT CAN REACH, never by what a module owns.",
    checkId: "client-reachable-doors",
    status: "enforced",
  },
  {
    id: "R22",
    dimension: "ai",
    law: "Agent/MCP BODY-FIELD parity — R19's sentence about the other half of the request. A tool sitting on a WRITE door EXPOSES and FORWARDS every field that door reads off the request body: the required set is DERIVED from the door's own `body.<field>` reads — its handler plus any helper in the same file it calls, one level deep (R20 is what makes them legible — a body is never destructured at the read) — and the forwarding half is proved by RUNNING the tool's buildBody on a filled-in call rather than reading its source, so a builder that delegates to a helper is judged by what the door receives. The one level closed R19's blind spot in the same breath: while the scan read the handler alone, a door that factored its parsing into a helper beside it dropped out of the census entirely and its tool's obligations silently became none. A field deliberately left off is a named line in NARROWED_BODY_FIELDS with its reason, said again in developer English in MCP.md §3, and the list is a RATCHET: an excuse in front of a field the tool now exposes turns the build red. Earned by: R19 deriving its obligations from searchParams.get() only, so four write tools offered a narrower contract than their door accepted, for six weeks, under a green build — update_team could not set the logo, create_role could not carry its permission matrix, reply_help_ticket could not @mention, agent_chat could not attach a file. A law that only inspects the query string measures query strings.",
    checkId: "agent-body-parity",
    status: "enforced",
  },
  {
    id: "R23",
    dimension: "ai",
    law: "An answer from the knowledge base carries its sources, or it is not an answer. Retrieval never writes prose — it hands back the passages it found and the sources they came from, and the assistant composes the reply with those in front of it. So `found`, `passages` and `citations` are ONE decision made in ONE place (knowledgeAnswer): no citation means no passage, and a sentence the assistant must say instead of inventing one. No door may assemble that response by hand — the same shape as R14's pagedJson seam, and for the same reason: a door that builds half a contract ships half a contract, and here the missing half is the difference between \"we have nothing on that\" and a confident answer with nothing behind it. The compartment a question was answered from, and the REASONING that chose it, ride the same object, because a wrong compartment is invisible otherwise. Earned by: the owner's own sentence in the brief — \"an answer with no source is a bug, not a style choice\" — and by what a sourceless answer costs where this one is aimed: an agency repeating it to a client.",
    checkId: "cited-answers",
    status: "enforced",
  },
  {
    // Minted as R23 by its own lane, which was building beside the knowledge
    // base and could not see it. Two laws cannot share a number, and the
    // knowledge base's was already written into CLAUDE.md — so this one moved.
    id: "R24",
    dimension: "arch",
    law: "AN INTERNAL NUMBER CANNOT REACH THE CLIENT'S SIDE — structurally, not conditionally. What an hour of our own work costs (internal_rates) and the margin computed from it live in ONE file, workers/tenancy/src/lib/internal-money.ts, and every door that calls into it refuses a portal caller. The check derives the internal doors from that file's own exports and each handler's source, then asserts three things the portal cannot then get around: none of those doors is on the portal gateway's surface, every one of them opens with refusePortalCaller, and no file in web-portal/ names the internal table, the internal doors' paths or a margin field. SCOPE's ruling is absolute — internal rates and margin never render in the portal under any flag, ever: not behind a permission, not behind a feature toggle, not for an admin viewing the portal — and the instruction with it was to make that structurally true rather than a condition somebody can invert later. A condition can be inverted and a permission can be granted; an import cannot be forgotten. The account rate card — what a client IS charged, which they may be shown when their price visibility is on — is a SEPARATE file and a separate table for exactly this reason: two numbers of identical shape and opposite audiences must not share a WHERE clause.",
    checkId: "internal-money-never-in-portal",
    status: "enforced",
  },
  {
    id: "R25",
    dimension: "ui",
    law: "A SAVINGS FIGURE NEVER RENDERS WITHOUT SAYING WHAT IT IS MADE OF. Every screen on either front door that shows a saving renders SAVINGS_CAPTION from shared/workers/savings.ts, word for word: the times are estimates we agreed with you, the subtraction is arithmetic. The check derives the screens from the payload they read (savedSecondsPerMonth / savedHours) rather than a hand-list, so a new screen is held to it the day it is written. Earned by the sentence the owner used about what would make him abandon this and go back to a spreadsheet — 'the numbers stop being believable'. A client who understands that the inputs are agreed and the arithmetic is arithmetic trusts the figure; one who believes we held a stopwatch stops trusting every other number in the app the day one of them looks wrong. The caption is not decoration around the feature, it is half of it.",
    checkId: "savings-caption",
    status: "enforced",
  },
]

/** R13 — reviewed exemptions: modules that are deliberately NOT import targets,
 * each with its reason. Every other module must have a TargetDef in the catalog. */
export const CATALOG_EXEMPT: Record<string, string> = {
  teams: "team metadata is created by the team factory (one row per team), never imported",
  team_members: "membership arrives through invites (an identity flow) — a CSV cannot consent for a person",
  help: "tickets are conversations raised in-app; importing them would forge authorship and timelines",
  screens: "screen recipes are app furniture (config), not team data",
  agent: "the assistant's threads/usage are system records, not importable content",
  portal_users:
    "a login is a granted identity, not importable content — a CSV cannot consent for a person (the same reason team_members is exempt)",
  knowledge:
    "a source is either TYPED here — and indexed in the same call, because the owner asked for instant syncing, which costs one embedding per chunk — or MIRRORED from a row the app already owns and kept in step by the sweep. A CSV would be a third way in with the first one's cost and neither one's upkeep: the importer writes row by row through the module's own gated create door, so a 5,000-row file would be 5,000 chunkings and 5,000 model calls inside one request, against a €50/month ceiling. The in-rule answer to 'we have a spreadsheet of process notes' is to point the sweep at where they already live, or to import them into the module they belong to and let the mirror do it.",
  processes:
    "a process map's numbers are AGREED estimates — a time a client and a staff member settled together, in front of each other, about the client's own work. Every savings figure in the app is a subtraction of two of them, so a CSV would import estimates nobody agreed and produce figures nobody can defend, which is the exact failure this module exists to prevent. A map is authored a step at a time, with the person whose work it describes.",
  todos:
    "a to-do is a REQUEST WE MAKE OF A CLIENT, and raising one emails them. It is one of only two things in the whole product that reaches a client's inbox (BUILD-1 §7), and an import is the one shape of write that produces hundreds at once — a spreadsheet of forty rows would be forty emails into somebody's morning, from our own verified sender, before anybody had read the file back. The write it would replace is a title and a date typed while you are already talking to them. Stories ARE importable, for the opposite reason: nothing about a story leaves the building.",
  commercials:
    "a rate card is a commercial agreement and an internal rate is the agency's own cost. A bulk overwrite of either silently changes what a client is charged or what a margin says, with no conversation attached and no one row to point at afterwards — and the write it would replace is four fields typed once a year.",
}

/** R21 — the doors a CLIENT LOGIN can reach at the agency origin that neither
 * refuse them nor read a customer-owned module through the fence, each with the
 * reason that is fine.
 *
 * Only two shapes of reason belong here. **The door answers about the caller
 * themselves** (their own teams, their own rights, their own invitations), or
 * **the door carries a fence the check cannot see from the gate alone** — which
 * today means exactly one door, the activity feed, whose module is resolved from
 * the table being asked about rather than written at the gate.
 *
 * A door that answers about the AGENCY — its articles, its vocabulary, its
 * screens, its imports, its staff — does not belong on this list; it belongs
 * behind `refusePortalCaller`. If you are writing a new line here and the
 * sentence you want is "a client would never call it", stop: that is not a
 * reason, that is the assumption both leaks were built on.
 *
 * Enforced by web/test/rules.test.ts (`client-reachable-doors`), which also
 * fails on a line that no longer names a route — a rotting exemption is worse
 * than none, because it reads as a decision somebody made on purpose. */
export const CLIENT_REACHABLE_EXEMPT: Record<string, string> = {
  // GONE, both of them, and worth recording why the reasons READ so well.
  //
  // `POST /api/tenancy/bootstrap` said "it answers with the caller's OWN first
  // team". `GET /api/tenancy/teams` said "the caller's own membership list — the
  // teams THEY belong to, no id at all". Both sentences are true about the
  // QUESTION and say nothing about the ANSWER, which in both cases is a
  // `TeamSummary` row: the agency's name, its logo, and `dbStatus`. Two of the
  // five fields `/api/tenancy/active` had already been closed for, walking out of
  // its two siblings. Both doors now refuse a client login (routes/team.ts
  // refuseClientOnTeams) — which is why these lines are deleted rather than
  // reworded: an exemption is a claim about what is BEHIND a door, and "it is
  // about you" is not one.
  "GET /api/tenancy/my-permissions":
    "the caller's own rights, which they are entitled to know; it names no other person and no record",
  "GET /api/tenancy/invitations":
    "invitations addressed to the caller's own email address — theirs to see, and theirs alone (the lookup is by their identity, never by an id they pass)",
  "POST /api/tenancy/invitations/accept":
    "accepts an invitation addressed to the caller — ownership is re-checked inside acceptInvite against their own email, so the body can only name their own invitation or be refused",
  "GET /api/tenancy/activity":
    "its module gate is RESOLVED from the table being asked about (ACTIVITY_GATE_MAP), so no module is written at the door for the R21 scan to read — but the fence is there and it is the strictest one in the codebase: portalActivityClause answers `0 = 1` for every table PORTAL_ACTIVITY_FENCE does not mark account-owned, which is every table except the client's own company, its contacts and its logins. This is the door that leaked twice; the clause, its data table and the burglar suite in workers/tenancy/test/account-leak.test.ts are the three things holding it.",
}

/** THE ACCOUNT-SCOPED MODULES — the ones whose rows belong to a CUSTOMER, not to
 * the team at large. A caller pinned to one account (a portal user) must never
 * reach another account's rows through ANY door on these modules, whatever their
 * role says. DATA, not a hand-list in a test: every route gating on a module
 * named here is derived off disk and must have a burglar attacking it
 * (workers/tenancy/test/account-leak.test.ts), and a module added here with no
 * attack turns the build red. */
export const ACCOUNT_SCOPED_MODULES = ["accounts", "portal_users", "processes"] as const

/** EVERY read a CLIENT LOGIN can reach that returns rows belonging to someone —
 * file → the fence it must carry, or a reasoned exemption.
 *
 * Earned the hard way. The fence was applied door by door to the ACCOUNT doors,
 * and the first security sweep found three other doors that return account-owned
 * rows and never got it: the record activity feed, the team activity feed, and
 * the ticket list. The burglar suite could not have caught them, because it derived
 * its targets from the account routes — the very set that excluded them. The
 * lesson is the shape of this list: enumerate by WHAT A CLIENT CAN REACH, never
 * by what the account module happens to own.
 *
 * A file added here with `fence: null` must state why in `why`. A file that reads
 * one of these tables and is in neither state turns the build red.
 *
 * ENFORCED, at last, by web-portal/test/portal-fence.test.ts — and enforced at
 * FUNCTION level, not file level. This list sat here as data with no check for
 * its whole first life, which is how `help.ts` could be listed as fenced while
 * two of its exported readers (the ticket THREAD) carried no fence at all: the
 * file said "authorScope" and the leak was one function along. The check now
 * walks the portal gateway's own door table through to each lib function behind
 * it and demands that function touch the caller's stamp. */
export const PORTAL_VISIBLE_READS: Record<string, { fence: string | null; why: string }> = {
  "workers/tenancy/src/lib/accounts.ts": {
    fence: "accountScopeClause",
    why: "the spine itself — every exported reader takes the caller's AccountScope.",
  },
  "workers/tenancy/src/lib/activity-read.ts": {
    fence: "accountActivityClause",
    why: "history rows NAME records; the row id is not a secret (the live channel broadcasts it). WHICH fence each (table, id) read carries is decided by PORTAL_ACTIVITY_FENCE below — deciding it from the account module's own tables is what left `help` open.",
  },
  "workers/content/src/lib/help.ts": {
    fence: "ticketFence",
    why: "a client raises tickets; the team-wide default handed them every other client's — the thread doors, one table along, had to be taught the same sentence, and the door that RAISES a ticket answered with the whole list until the check learned that a POST can be a read. It is called ticketFence and no longer authorScope because it no longer fences by AUTHOR: the owner ruled on 11 Aug 2026 that a contact sees their COMPANY's questions, so the ticket carries the account it was raised for and this is accountScopeClause over that column — the same fence as the accounts list, reading a ticket.",
  },
  "workers/content/src/lib/notify.ts": {
    fence: null,
    why: "it sends email and returns no rows to the caller: the only ids it resolves are the ticket's own raiser (read through the fence) and the mentions the route already refused from a client login, and the lookup joins team_members so an address outside the team can never be reached.",
  },
  "workers/content/src/lib/stakeholders.ts": {
    fence: "getTicket",
    why: "a stakeholder set is a PROPERTY of a ticket, so the fenced getTicket decides visibility first and an invisible ticket yields an empty set — otherwise the door names staff admins and another client's colleagues by ticket id alone.",
  },
  "workers/content/src/lib/todos.ts": {
    fence: "accountScopeClause",
    why: "a to-do is the ONE row in the work engine a client login both reads and writes, so this is the only file in that build carrying a fence rather than a flat refusal. Every exported reader takes the caller's AccountScope and every statement — including the completing UPDATE, which a source-scan case in workers/content/test/todos-tasks.test.ts holds there — ANDs it in. `clientSprints` lives here for the same reason: it is the client's own SHAPE of a sprint (a named block with dates and two counts), with nowhere to put a price and no story titles in it, so a shape that cannot carry the number is doing half the fencing.",
  },
  "workers/tenancy/src/lib/rates.ts": {
    fence: "accountScopeClause",
    why: "what an account is CHARGED per hour. The rate-card DOOR refuses a client login outright — it answers with every account's card, the retired lines and the audit block naming who set the price — but the value door reads this file to PROJECT the live lines for one account, and only when that account's price visibility is switched on. So the same fence the accounts list carries rides these statements too: a client login can only ever be shown their own company's rates. What our own hour COSTS us is a different table in a different file, and no client-reachable path touches it (R23).",
  },
  "workers/tenancy/src/lib/work-engine.ts": {
    fence: null,
    why: "it returns no rows — two aggregate SUMs (what has been sold to one account, and how many seconds we have logged against it) over the work engine's own tables, for an account id the CALLER has already resolved through the fence before calling. A SUM discloses no record, and the one figure a client may be shown from it (what they bought) is projected by the value door behind their own account's price-visibility switch. The seconds half never reaches a client at all: it is only meaningful once an internal rate is applied to it, which happens in a file no portal-reachable path may import.",
  },
  "workers/tenancy/src/lib/processes.ts": {
    fence: "accountScopeClause",
    why: "the whole App → Process → Step chain, and the value drilled through it. Every table here carries `account_id` so the fence is the SAME clause the accounts list uses, with no join to forget — and every exported reader takes the caller's AccountScope, which the burglar suite (workers/tenancy/test/account-leak.test.ts) then tries the handle of. A map names how a client's own people work; another client's map is as far out of bounds as their account row.",
  },
}

/** EVERY WRITE a CLIENT LOGIN can reach — door → the fence its HANDLER resolves
 * before it changes anything, or a reasoned exemption.
 *
 * The reads above were guarded first, and thoroughly. The writes were not: the
 * fence walk started `if (!door.startsWith("GET ")) continue`, and the closed-
 * door suite only ever proves that an UNNAMED door is refused. Between them,
 * adding `"POST /api/tenancy/accounts"` to the portal gateway's allow-list
 * turned the build green — one line, and a client could edit the agency's books.
 *
 * A write is fenced in a different PLACE from a read, which is why this is its
 * own table. A read carries the fence down into the SQL (`accountScopeClause`);
 * a write resolves the caller's AccountScope in the handler and refuses the
 * record — 404, never 403 — before a row is touched. So the check walks the
 * handler body, not the lib functions.
 *
 * Every non-GET door in PORTAL_DOORS must appear here, with a fence or a stated
 * reason. That is the point: opening a write to clients cannot be one line in a
 * routing table any more. It is a line here too, and someone has to write down
 * why it is safe.
 *
 * Enforced by web-portal/test/portal-fence.test.ts. */
export const PORTAL_VISIBLE_WRITES: Record<string, { fence: string | null; why: string }> = {
  // ── identity: nothing to fence, because nothing is owned yet ────────────────
  "POST /api/auth/email/start": {
    fence: null,
    why: "asks for a code to be emailed. It touches no account-owned row, and it answers the same way whoever the address belongs to — an account fence here would be an account oracle.",
  },
  "POST /api/auth/email/verify": {
    fence: null,
    why: "proves WHO the caller is; the account set they may stand in is resolved afterwards, from the invite, never from this body. Signing in never creates access (SCOPE ch.06).",
  },
  "POST /api/auth/profile": {
    fence: null,
    why: "writes the caller's own name and photo on the GLOBAL user row — their own record, reached through no id but their session's.",
  },
  "POST /api/auth/logout": {
    fence: null,
    why: "ends the caller's own session; there is no record to be fenced from.",
  },

  // ── the client's own world ─────────────────────────────────────────────────
  "POST /api/tenancy/portal/switch-account": {
    fence: "accountScope",
    why: "flips the caller's OWN current-account pointer. The set they may stand in comes from the guard corridor, so the only thing the body can do is name one of their own companies or be refused.",
  },

  // ── support ────────────────────────────────────────────────────────────────
  "POST /api/content/help": {
    fence: null,
    why: "raises a NEW ticket. There is no existing record to be fenced away from — but the row it writes is stamped with the account the caller is STANDING IN, taken from the guard corridor and never from the body, because that stamp is what every later read of it is fenced by (and what a live ping names so their colleagues, and only their colleagues, hear it appear).",
  },
  "POST /api/content/help/reply": {
    fence: "accountScope",
    why: "appends to a ticket named by a caller-supplied id — so the fence decides whose ticket it is BEFORE a word is appended, and answers 404 rather than 403 so 'not yours' never confirms the ticket exists. A reply cannot be un-appended.",
  },

  "POST /api/content/help/update": {
    fence: "accountScope",
    why: "corrects a ticket named by a caller-supplied id — so the fence decides whose it is BEFORE a word changes, and two more rules ride the same UPDATE: it must still be UNLOCKED (nobody here has read it) and it must be THEIRS, because a contact now sees a colleague's question and being allowed to read one is not being allowed to rewrite it. SCOPE ch.07: the account owns the wording until the first staff touch.",
  },
  "POST /api/content/help/rank": {
    fence: "accountScope",
    why: "drags one of their company's requests into the order they want them in — SCOPE ch.07's 'a client may re-rank their own company's tickets'. Both NEIGHBOUR ids are resolved through the same fence, so a client cannot pin their ticket next to one they cannot see (which would be an oracle for whether an id exists, and a way to learn another company's ordering); and the LOCK rides the UPDATE, so the order stops being theirs the moment we pick it up. The right this needs — `help:edit` — is the reason the STATUS and ARCHIVE doors now refuse a portal caller outright: the same grant would otherwise have let a contact resolve their own request.",
  },
  "POST /api/content/todos/complete": {
    fence: "accountScope",
    why: "the client's own act, on a row we created and named their company on: they mark it done and attach the one file we asked for. The fence decides whose to-do it is before anything is written and answers 404 rather than 403, so 'not yours' never confirms it exists. The file is capped and parsed at the boundary through the same seam every upload in the base uses, and its key carries a random ULID segment because the gateways serve /media with no session.",
  },

  // ── the process map ────────────────────────────────────────────────────────
  "POST /api/tenancy/processes/comments": {
    fence: "accountScope",
    why: "comments on a map named by a caller-supplied id — so the fence decides whose map it is BEFORE a word is appended, and answers 404 rather than 403 so 'not yours' never confirms the map exists. It is the ONLY write in the process-map build a client login can reach: a comment is a conversation, never an edit, so it changes no duration, cuts no version and moves no savings figure. The one field that WOULD change what the portal shows — `explainsStepKey`, the staff explanation a regression must carry — is refused from a portal caller at the door.",
  },
}

/** THE ACTIVITY FEED'S OWN FENCE — for every table it will answer about, what a
 * CLIENT LOGIN may read of that table's history.
 *
 * Earned TWICE, the same way. The record scope reads history by (table, id) with
 * nothing on the WHERE but two caller-supplied values, so the fence has to be
 * decided by the TABLE. The first time, the deciding list was
 * `ACCOUNT_OWNED_TABLES` — what the accounts module owns — and `help` is not in
 * it, so a client login read another client's support history (the activity
 * sentence plus its before/after snippets) by naming a ticket id. Row ids are
 * not secret: the live channel broadcasts them.
 *
 * So the list is no longer "what the accounts module owns". It is EVERY table
 * the feed can be asked about, each with an answer:
 *   • "account" — fenced to the caller's own account world (accountActivityClause);
 *   • null      — a client login reads NOTHING of this table's history, and the
 *                 reason says why. That is the DEFAULT posture, not a gap: the
 *                 portal ships no activity feed at all (PORTAL_ACTIVITY_EXEMPT),
 *                 and silence is the same direction mayHearChange fails in.
 *
 * A table the feed can be asked about (ACTIVITY_GATE_MAP + the fixed-scope
 * aliases the reader names) that is missing here turns the build RED —
 * workers/tenancy/test/account-leak.test.ts. Adding a module to the gate map
 * without deciding this is exactly how `help` slipped through. */
export const PORTAL_ACTIVITY_FENCE: Record<string, { fence: "account" | null; why: string }> = {
  accounts: { fence: "account", why: "the row IS an account — theirs to read inside the fence" },
  account_links: { fence: "account", why: "a contact on an account they may stand in" },
  portal_users: { fence: "account", why: "a login granted on an account they may stand in" },
  help: {
    fence: null,
    why: "a ticket's history names the staff who moved it and quotes the problem statement — the client is shown the STATUS instead (PORTAL_ACTIVITY_EXEMPT says the same thing about the screen). THE LEAK: help sat outside the deciding list, so another client's support history came back by ticket id. STILL null after the 11 Aug 2026 widening: a contact now sees their whole company's TICKETS, which is a decision about the rows; their HISTORY is a different question, and its answer is the one SCOPE ch.06 gives — the portal never says which staff member is doing the work.",
  },
  learning: { fence: null, why: "the agency's own how-to library — a client has no screen on it" },
  knowledge_sources: {
    fence: null,
    why: "the knowledge base is the agency's own material — its process notes, its internal tickets, what it knows about each client — and a client login cannot reach a single door on it (every knowledge handler opens with refusePortalCaller). Its HISTORY would name what was filed under whom, which is a worse disclosure than the sources themselves: 'X filed \"the Delaval renewal\" under Delaval' tells a reader at another company that Delaval is a client. Silence, in the same fail-closed direction as everything else here.",
  },
  selectable_data: { fence: null, why: "the agency's dropdown vocabulary — app furniture, and none of it is the client's" },
  users: { fence: null, why: "a member's joins, role changes and removals — the agency's staff, never a client's business" },
  member_roles: { fence: null, why: "the agency's permission structure — knowing its shape helps only an attacker" },
  invite_logs: { fence: null, why: "who the agency invited and when — the agency's own hiring, by another name" },

  // THE PROCESS MAP'S SEVEN TABLES. The ROWS are the client's — a contact reads
  // their company's maps and the value drilled through them, fenced by
  // accountScopeClause on every statement. Their HISTORY is a different question,
  // and it has the answer SCOPE ch.06 gives every other feed on this side: the
  // portal shows work status and never which staff member is doing it. An
  // activity row here would say "Ana changed 'Approve the invoice' from 40
  // minutes to 8" — the client's own number, with our name on it, and the portal
  // ships no activity feed at all to put it in (PORTAL_ACTIVITY_EXEMPT).
  apps: { fence: null, why: "an app's history names the staff who recorded it and quotes what it costs US to run — the client sees the system, never our ledger about it" },
  processes: { fence: null, why: "a map's history names the staff who mapped and re-mapped it; the client is shown the map itself, which is the part that is theirs" },
  process_versions: { fence: null, why: "a cut names the staff member who cut it and the sprint it came from — the client sees the version and its date" },
  process_steps: { fence: null, why: "a step's history is our record of changing THEIR agreed number; the current number, and the saving from it, is what the portal shows" },
  process_comments: { fence: null, why: "the conversation itself is fenced and readable; its history would name the staff author of every line, which the ticket thread already withholds" },
  account_rates: { fence: null, why: "who set a client's price, and what it was before — the agency's own commercial record, even about their own rate" },
  internal_rates: { fence: null, why: "what our own hour costs. The one figure SCOPE says a client must never see under any flag, ever — its history least of all (R23)" },

  // THE WORK ENGINE. Not "a client may not see enough of this" — a client may
  // not see ANY of it, and the rows themselves are already refused at every door
  // (routes/stories.ts opens with refusePortalCaller). A story's history says
  // "Ana moved BERG-S0188 to in review", which is the staff member SCOPE ch.06
  // says the portal never names, attached to the work they are doing. What a
  // client sees of a story is a COUNT on their own ticket.
  stories: { fence: null, why: "a story's history names the staff member doing the work and what they were asked to change — the client sees a count of the work on their own request, never a title, an assignee or a date" },
  triage_duty: { fence: null, why: "the agency's own rota. Its rows say who was meant to be reading the client's questions in a given week, which is both a fact about our staff and a record of when we were slow — the two things SCOPE ch.06 and BUILD-1 §6 respectively keep off the client's side" },
  tasks: { fence: null, why: "our own internal admin — the quarterly VAT return, a domain renewal. A client login cannot reach a single door on the table, let alone its history" },
  todos: {
    fence: null,
    why: "a to-do's ROWS are the client's — they read theirs and complete them, fenced by accountScopeClause on every statement — but its HISTORY is ours: it names the staff member who asked for the thing and the one who withdrew it, which is the sentence SCOPE ch.06 keeps off the portal. The client is shown the to-do, its date and whether it is done, which is the part that is theirs; the portal ships no activity feed to put the rest in (PORTAL_ACTIVITY_EXEMPT).",
  },
  work_logs: { fence: null, why: "how long one of our people took over a piece of work, and who corrected the figure afterwards. It is the input to the agency's own margin, and the hours behind a price are never the client's to read — they see the VALUE the work produced (the savings drilled through their process map) and not what it cost us to produce it" },
  sprints: { fence: null, why: "a sprint's history names who priced it and what the price was before. The client is shown the sprint as a NAMED BLOCK WITH DATES because it is what they bought (BUILD-1 §7); the record of us changing our minds about it is ours" },
}

/** R2 on the CLIENT surface — the reasoned exemption, not a quiet skip.
 *
 * Every record detail in the base exposes Overview + Activity (R2), because a
 * record's history is the thing that makes a shared workspace trustworthy. On
 * the portal that same feed is a disclosure: its rows are sentences like
 * "<name> moved this to in progress", and "the portal shows work status but
 * never which staff member is doing it" (SCOPE ch.06). The activity door is not
 * on the portal gateway's surface at all, so this is not a hidden tab — it is a
 * door that was never opened.
 *
 * Component → why it ships no Activity feed. Held true by
 * web-portal/test/rules.test.ts, which fails if a listed component grows one (an
 * exemption nobody checks is a skip with better manners) AND if a component is
 * listed here that no longer exists. */
export const PORTAL_ACTIVITY_EXEMPT: Record<string, string> = {
  "ticket-screen":
    "a ticket's history names the staff who moved it; the client is shown the STATUS instead, which is the part that is theirs to know",
  "company-screen":
    "an account's history names the staff who edited the record and shows the agency's own before/after values (status moves, commercial flags) — none of which is the client's to read",
}

/** R18 — which permission module gates each activity `relatedTable` a worker
 * writes. The team feed (the ONE cross-module read) subtracts the caller's denied
 * modules through this map; the generic record scope resolves through it too. A
 * table a worker writes that is neither here nor exempt turns the build red —
 * a table the feed cannot NAME is a table it cannot withhold. */
export const ACTIVITY_GATE_MAP: Record<string, string> = {
  help: "help",
  learning: "learning",
  selectable_data: "selectable_data",
  member_roles: "member_roles",
  users: "team_members",
  invite_logs: "team_members",
  accounts: "accounts",
  account_links: "accounts",
  portal_users: "portal_users",
  knowledge_sources: "knowledge",
  // The map and the money. Five tables gate on `processes` because they are one
  // record from a reader's point of view — an app with maps inside it — and two
  // on `commercials`, which is the module a client login never holds.
  apps: "processes",
  processes: "processes",
  process_versions: "processes",
  process_steps: "processes",
  process_comments: "processes",
  account_rates: "commercials",
  internal_rates: "commercials",
  // Time gates on the same module as the work it is against — a row of hours is
  // not a separate kind of record from the story it belongs to, it is that
  // story's cost. A client login holds neither.
  work_logs: "work",
  // A TASK is our own admin, so it gates with the rest of the work engine. A
  // TO-DO is aimed at a client and is the one module in this build a client login
  // is meant to hold — so it gates on its own.
  tasks: "work",
  todos: "todos",
  // The rota is about TICKETS — whose week it is to read them — so its history
  // gates with the module the tickets themselves do.
  triage_duty: "help",
  // The work engine. A story and the sprint it sits in are one record from a
  // reader's point of view — a piece of work and the block it was sold inside —
  // so both gate on `work`, the module a client login never holds.
  stories: "work",
  sprints: "work",
}

/** R15 — reviewed DEAF exemptions: resources a worker publishes that reach NO
 * listener, each with its reason. Publishing to nobody is the silent half of the
 * stale-screen bug, so every exemption is a visible, conscious line. */
/** R14 — the GROWING collections: the ones that get bigger with ordinary use, so
 * a hard cap would eventually become a refusal to answer. Each must PAGE through
 * shared/workers/paging.ts (keyset cursor + exact total + hasMore) AND be reachable
 * past page one from the client. Every OTHER list may still cap — a bounded
 * collection (roles, members, dropdown values) doesn't need a cursor to be honest.
 * DATA, not a hand-list in a test: adding a growing module means adding a line here. */
export const GROWING_COLLECTIONS: Record<
  string,
  { lib: string; fn: string; routes: string; rowsKey: string; webKey: string; listRecipe?: string; why: string }
> = {
  help: {
    lib: "workers/content/src/lib/help.ts",
    fn: "listTickets",
    routes: "workers/content/src/routes/help.ts",
    rowsKey: "tickets",
    listRecipe: "tickets.list",
    webKey: "helpKey(",
    why: "tickets accumulate forever — a team that has raised 3,000 must still reach the oldest",
  },
  knowledge: {
    lib: "workers/content/src/lib/knowledge.ts",
    fn: "listSources",
    routes: "workers/content/src/routes/knowledge.ts",
    rowsKey: "sources",
    listRecipe: "knowledge.list",
    webKey: "knowledgeKey(",
    why: "one source per ticket, per article, per account, plus every note anybody writes — the agency's own history is thousands of rows on day one and the sweep only ever adds",
  },
  accounts: {
    lib: "workers/tenancy/src/lib/accounts.ts",
    fn: "listAccounts",
    routes: "workers/tenancy/src/routes/accounts.ts",
    rowsKey: "accounts",
    listRecipe: "accounts.list",
    webKey: "accountsKey(",
    why: "every company AND every person an agency works with is a row here — a contact list that only grows, so a ceiling would eventually become a refusal to answer",
  },
  activity: {
    lib: "workers/tenancy/src/lib/activity-read.ts",
    fn: "getActivity",
    routes: "workers/tenancy/src/routes/team.ts",
    rowsKey: "activity",
    webKey: "activity:team:",
    why: "the fastest-growing table in the base — EVERY mutation writes a row",
  },
  // The SAME door and the SAME rows, read through the generic (table, id) scope —
  // listed separately because "the server pages" and "the client can reach page
  // two" are different facts, and this half was the one missing: every record
  // detail badged the exact total (R16) over a feed frozen at its newest 50.
  recordActivity: {
    lib: "workers/tenancy/src/lib/activity-read.ts",
    fn: "getActivity",
    routes: "workers/tenancy/src/routes/team.ts",
    rowsKey: "activity",
    webKey: "useRecordActivity(",
    why: "one record's slice of the same ever-growing feed — a long-running ticket outgrows a page on its own",
  },
  processes: {
    lib: "workers/tenancy/src/lib/processes.ts",
    fn: "listProcesses",
    routes: "workers/tenancy/src/routes/processes.ts",
    rowsKey: "processes",
    listRecipe: "processes.list",
    webKey: "processesKey(",
    why: "every app of every client grows maps, and every map is kept rather than replaced — a process is archived, never deleted, because the savings computed from its baseline have to stay checkable years later. An agency two years in has more of these than it has clients, and the oldest is the one a client is most likely to ask about",
  },
  workLogs: {
    lib: "workers/content/src/lib/work-logs.ts",
    fn: "listWorkLogs",
    routes: "workers/content/src/routes/work-logs.ts",
    rowsKey: "logs",
    webKey: "workLogsKey(",
    why: "the fastest-growing row in the work engine — 2,940 arrived from two years of the previous system and the rate only goes up, because every piece of work produces several. A ceiling here would eventually be a refusal to show somebody their own week",
  },
  stories: {
    lib: "workers/content/src/lib/stories.ts",
    fn: "listStories",
    routes: "workers/content/src/routes/stories.ts",
    rowsKey: "stories",
    listRecipe: "work.list",
    webKey: "storiesKey(",
    why: "one piece of work per thing we do, kept forever — the two years arriving from Glide are 3,677 rows on day one, and a done story is never deleted because the savings and the margin computed from it have to stay checkable. SPRINTS are deliberately NOT here beside it: a sprint is a block of SOLD work, so that collection grows at the speed of contracts rather than of clicks and a hard ceiling is an honest answer",
  },
}

export const DEAF_EXEMPT: Record<string, string> = {
  help_threads:
    "a reply pings the parent help row too (op edit), whose row-level patch refreshes the open ticket's deps; the thread list itself re-pulls when the detail (re)opens",
  agent_usage:
    "the quota badge rides every chat response and the usage dialog fetches on open — there is no standing cache a ping could refresh",
}

/** R20 — reviewed exemptions: the request-body fields a door reads WITHOUT a
 * runtime check, keyed `<worker src path>::<var>.<field>` exactly as the scan
 * names them, each with the reason it is safe there.
 *
 * The list is a RATCHET, not a parking bay. A line that is no longer an offender
 * turns the build RED, so validating a listed field FORCES its line out and the
 * list can only ever shrink. That is the difference between a reviewed exception
 * and a quiet permanent bypass — and it is why this file is the right place for
 * it: an exception nobody can find is a bypass with better manners.
 *
 * Every line here today belongs to `workers/mcp/`, which is the EXTERNAL machine
 * surface and owns its own boundary suites. */
export const RAW_BODY_EXEMPT: Record<string, string> = {
  "workers/mcp/src/index.ts::rpc.id":
    "JSON-RPC 2.0 requires the request id be ECHOED BACK verbatim in the response envelope (`id` may be a string, a number or null by spec). It is never read as a value, never reaches a statement, and normalising it would break the protocol.",
  "workers/mcp/src/index.ts::rpc.params":
    "the params OBJECT itself is only ever indexed (`rpc.params?.name`, coerced with String()) and handed to the tool catalogue, which validates each argument against the tool's own schema before it reaches a door. The field read here is the envelope, not a value.",
}

/** R18 — reviewed exemptions, pinned EXACTLY: tables whose activity every member
 * may see, each with its reason. A new relatedTable must join the gate map above
 * or earn a visible line here — never a silent bypass. */
export const ACTIVITY_TABLE_EXEMPT: Record<string, string> = {
  teams: "team metadata (name/logo) is member-wide — the team screen itself has no module gate",
  screens: "screen-recipe changes are app furniture every member renders; the rows carry no record content",
  import: "an import summary names only counts + the target module; the imported rows' own activity is gated by their module",
}

/** Worker test suites that enforce R1. A new mutating worker without a
 * publish-seam test is a gap — track it here. */
export const MUTATING_WORKERS = ["tenancy", "content", "data-ops"] as const

/** R2 — the bespoke (host-composed) record-detail components that MUST render the
 * Overview + Activity tabs themselves (the engine-recipe details get them for free). */
export const RECORD_DETAIL_COMPONENTS = [
  "help-detail",
  "learning-detail",
  "role-detail",
  "account-detail",
  "knowledge-detail",
] as const

/** R2 — reviewed bypasses. Each MUST get tabs over time; the reason is mandatory.
 * (Empty today: role-detail — the last exception — grew its Permissions/Overview/
 * Activity tabs on 2026-07-06. Every record detail now carries the tabs.) */
export const RECORD_DETAIL_EXCEPTIONS: Record<string, string> = {}

/** R8 — reviewed bypasses: placement:"tab" sections that DON'T lead with a
 * collection, so they carry no count badge (and thus no countCacheKey). Each MUST
 * name its reason; every other tab section is forced to declare a countCacheKey. */
export const TAB_COUNT_EXCEPTIONS: Record<string, string> = {
  overview: "leads with team metadata (name, logo, audit) — not a collection, so no count.",
  import: "contextual per-target action reached from a button — not a collection tab.",
}

/** R8, the RECORD-DETAIL half: the tabs on one record's screen. A tab that
 * reveals a collection (a record's Activity feed, a ticket's conversation, its
 * stakeholders) MUST carry that collection's exact count; a tab that shows the
 * record ITSELF (an overview block, the article prose, the permission grid)
 * carries none — and says so HERE, once, with its reason. Keyed
 * `<recipe>.<tabKey>` for the engine details (BASE_RECIPES) and
 * `<component>.<tab value>` for the bespoke ones (RECORD_DETAIL_COMPONENTS), so
 * a team tab and a record tab that share the word "overview" can never bypass
 * each other. Separate from TAB_COUNT_EXCEPTIONS on purpose: these are two
 * different tab surfaces, and one flat namespace would let an exception written
 * for one silently excuse the other. */
export const RECORD_TAB_COUNT_EXCEPTIONS: Record<string, string> = {
  // Engine-recipe details (web/lib/screens.ts) — a `description` block is the
  // record's own fields, so there is no collection to count.
  "team.detail.overview": "the team's own metadata (created, created by, last updated) — one record, not a collection.",
  "members.detail.overview": "one member's role, joined date and email — one record, not a collection.",
  "invites.detail.overview": "one invite's role, status and dates — one record, not a collection.",
  // Bespoke details (host-composed) — the panel is the record itself.
  "role-detail.permissions":
    "the permission matrix is a fixed grid of the app's modules × four rights — app furniture that ships with the code, not a team collection that grows.",
  "role-detail.overview": "one role's description, member count and audit block — one record, not a collection.",
  "learning-detail.article": "the article's own prose + linked media — one record's body, not a collection.",
  "learning-detail.overview": "one article's category, type and audit block — one record, not a collection.",
  "help-detail.overview": "one ticket's type, source and audit block — one record, not a collection.",
  "account-detail.overview":
    "one account's own fields (type, reference, contact details, where it sits) — one record, not a collection. Its four collection tabs — contacts, children, portal access, activity — each carry a server count.",
  "knowledge-detail.source":
    "the source's own text — the exact words the assistant reads out of it, plus where they came from. One record's body, not a collection. (How many searchable pieces that text became is a FIELD on the Overview, not a tab: the pieces are derived from the text on this same panel, so a tab over them would be the same thing twice.)",
  "knowledge-detail.overview":
    "one source's kind, compartment, who may read it, how many pieces it was cut into and when it was last indexed — one record, not a collection.",
}

/** R4 — the form dialogs that MUST use FormShell. */
export const FORM_DIALOGS = [
  "help-form-dialog",
  "learning-form-dialog",
  "role-form-dialog",
  "invite-dialog",
  "team-edit-dialog",
  "selectable-form-dialog",
  "account-form-dialog",
  "contact-link-dialog",
  "portal-access-dialog",
  "knowledge-form-dialog",
  // Process maps and the numbers under them. The step form is the one that
  // matters most here: it collects the two figures every savings number in the
  // app is a subtraction between, so a draft lost to a mis-tap is an agreed
  // estimate somebody has to go and ask for again.
  "app-form-dialog",
  "process-form-dialog",
  "step-form-dialog",
  // The work engine. The story form is the one a person opens most often in a
  // day, so a draft lost to a mis-tap is the most expensive kind here; the
  // sprint form collects a PRICE, which is the other kind.
  "story-form-dialog",
  "sprint-form-dialog",
  // Logging time by hand. A draft matters here for a reason the others do not
  // have: the two moments are remembered, not looked up, and a person who loses
  // them to a mis-tap has to remember them again.
  "time-form-dialog",
  // The two nouns beside each other. The to-do form is the only one in the
  // agency app whose Save reaches into a customer's inbox, so it says so.
  "todo-form-dialog",
  "task-form-dialog",
  // Answering a ticket. It opens pre-filled from the draft each story's closing
  // note has been building, and pressing its button emails a customer — so
  // losing what somebody typed into it is the most expensive draft loss here.
  "resolve-dialog",
] as const
