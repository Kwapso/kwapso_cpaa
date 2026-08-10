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
}

/** THE ACCOUNT-SCOPED MODULES — the ones whose rows belong to a CUSTOMER, not to
 * the team at large. A caller pinned to one account (a portal user) must never
 * reach another account's rows through ANY door on these modules, whatever their
 * role says. DATA, not a hand-list in a test: every route gating on a module
 * named here is derived off disk and must have a burglar attacking it
 * (workers/tenancy/test/account-leak.test.ts), and a module added here with no
 * attack turns the build red. */
export const ACCOUNT_SCOPED_MODULES = ["accounts", "portal_users"] as const

/** EVERY read a CLIENT LOGIN can reach that returns rows belonging to someone —
 * file → the fence it must carry, or a reasoned exemption.
 *
 * Earned the hard way. The fence was applied door by door to the ACCOUNT doors,
 * and the first security sweep found three other doors that return account-owned
 * rows and never got it: the record activity feed, the team activity feed, and
 * the help list. The burglar suite could not have caught them, because it derived
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
    fence: "authorScope",
    why: "a client raises tickets; the team-wide default handed them every other client's — the thread doors, one table along, had to be taught the same sentence, and the door that RAISES a ticket answered with the whole list until the check learned that a POST can be a read.",
  },
  "workers/content/src/lib/notify.ts": {
    fence: null,
    why: "it sends email and returns no rows to the caller: the only ids it resolves are the ticket's own raiser (read through the fence) and the mentions the route already refused from a client login, and the lookup joins team_members so an address outside the team can never be reached.",
  },
  "workers/content/src/lib/stakeholders.ts": {
    fence: "getTicket",
    why: "a stakeholder set is a PROPERTY of a ticket, so the fenced getTicket decides visibility first and an invisible ticket yields an empty set — otherwise the door names staff admins and another client's colleagues by ticket id alone.",
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
    why: "raises a NEW ticket, stamped with the caller as creator. There is no existing record to be fenced away from, and the fence that matters (who may read it back) is on the list door.",
  },
  "POST /api/content/help/reply": {
    fence: "accountScope",
    why: "appends to a ticket named by a caller-supplied id — so the fence decides whose ticket it is BEFORE a word is appended, and answers 404 rather than 403 so 'not yours' never confirms the ticket exists. A reply cannot be un-appended.",
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
    why: "a ticket's history names the staff who moved it and quotes the problem statement — the client is shown the STATUS instead (PORTAL_ACTIVITY_EXEMPT says the same thing about the screen). THE LEAK: help sat outside the deciding list, so another client's support history came back by ticket id.",
  },
  learning: { fence: null, why: "the agency's own knowledge base — a client has no screen on it" },
  selectable_data: { fence: null, why: "the agency's dropdown vocabulary — app furniture, and none of it is the client's" },
  users: { fence: null, why: "a member's joins, role changes and removals — the agency's staff, never a client's business" },
  member_roles: { fence: null, why: "the agency's permission structure — knowing its shape helps only an attacker" },
  invite_logs: { fence: null, why: "who the agency invited and when — the agency's own hiring, by another name" },
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
    listRecipe: "help.list",
    webKey: "helpKey(",
    why: "support tickets accumulate forever — a team that has raised 3,000 must still reach the oldest",
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
  "workers/mcp/src/index.ts::body.id":
    "the token-revoke door names a caller-PRIVATE token row and is scoped to the caller's own tokens, so an unrecognised value refuses rather than reaching anything. Left listed rather than fixed because workers/mcp/ is a separate lane's file — the ratchet above forces this line out the moment it is validated.",
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
] as const
