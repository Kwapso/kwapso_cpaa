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
  /** WHY the law reads the way it does, where a future reader would otherwise
   * re-litigate a decision INSIDE it — the option that was considered and lost,
   * and what decided it. The `law` says what is enforced; this says what was
   * chosen. Optional: most laws are their own argument, and only a law that had a
   * genuine fork in it earns one. */
  why?: string
  /** the test id that enforces it (a per-worker suite or a web rules.test case). */
  checkId: string
  status: RuleStatus
}

/** ── WHOSE BOOK IS THIS? THE NUMBERS ARE NOT UNIQUE ACROSS THE ESTATE ────────
 *
 * THE OWNER, 26 Aug 2026, on the collision a review round surfaced: "pick the
 * law that overrides the other. The one that is the most recent and makes more
 * sense in the broader context, you figure out what."
 *
 * The ruling, and it is a governance decision rather than a fix:
 * **`alaap-swift-struck/brimba`'s R-series is canonical. This repository's is
 * the divergent one.** Two reasons, and they agree:
 *
 *   • MOST RECENT. The newest law either repository holds is brimba's R26
 *     (`fork-sweep-complete`, 25 Aug 2026). Every law of ours that competes with
 *     a brimba number was written on 10–12 Aug, before the divergence was
 *     visible to anybody.
 *   • BROADER CONTEXT. brimba is the base a future product FORKS. Its R-series
 *     travels into every app built on it; ours travels nowhere. When one of two
 *     namespaces has to yield, it is the one with a single reader.
 *
 * WHAT WAS ACTUALLY WRONG, which is bigger than the R26 that was reported. The
 * two books forked their numbering at R20 and both kept minting: SEVEN ids
 * (R20–R26) carry a completely different law in each repository, and we hold
 * eleven more (R27–R37) that brimba will mint over the top of the moment it
 * writes its twenty-seventh law. One collision was the visible edge of a
 * divergent series.
 *
 * WHAT IS NOT BEING DONE, and why it is a decision and not an omission.
 * Renumbering our seven would rewrite 847 references across the source, the
 * docs and the tests — a change with no user, no behaviour and real risk, on a
 * repository that shares no build with brimba and goes red for none of this.
 * The harm is not to a build; it is to a PERSON who reads "R24" and cannot tell
 * which book it came from. So the cure is to make the book say so, and to make
 * the NEXT collision impossible, which is the only harm still in front of us.
 *
 * `LAW_ID_ORIGIN` below is that record, and the check on it is the guard. */
export const BASE_REPOSITORY = "alaap-swift-struck/brimba"

/** The highest law id the canonical base had minted when this was last read
 * (26 Aug 2026, brimba@ab21e2b). A law WE mint must sit above it, so a number
 * this repository invents can never be one the base also invents.
 *
 * Raise it when the base mints more — and if raising it would swallow ids we
 * already hold, that is the divergence widening and it wants the owner, not a
 * bigger number. */
export const BASE_LAW_CEILING = 26

/** THE SEVEN THAT ALREADY COLLIDE, named so that nobody rediscovers them as a
 * surprise. `ours` is this repository's checkId for that number; `theirs` is
 * brimba's. Both are real, enforced laws in their own book.
 *
 * This list may only SHRINK — an entry goes when the two books agree on that
 * number again, which in practice means when one of the two laws is retired or
 * this repository is merged back into the base and renumbered as one act. */
export const LAW_ID_ORIGIN: { id: string; ours: string; theirs: string }[] = [
  { id: "R20", ours: "validated-bodies", theirs: "static-destinations" },
  { id: "R21", ours: "client-reachable-doors", theirs: "create-returns-row" },
  { id: "R22", ours: "agent-body-parity", theirs: "create-opens-record" },
  { id: "R23", ours: "cited-answers", theirs: "mutation-returns-row" },
  { id: "R24", ours: "internal-money-never-in-portal", theirs: "bulk-twin-declared" },
  { id: "R25", ours: "savings-caption", theirs: "activity-birth-to-death" },
  { id: "R26", ours: "vector-fence", theirs: "fork-sweep-complete" },
]

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
    law: "The agent knows what the app can do — its system prompt carries a capability brief GENERATED from the import/export catalog (+ the glossary), so the UI and the agent can never disagree about a capability. And it knows what the app REFUSES: a vocabulary-gated write states its call ORDER (create the dropdown value first, write the rows second, one turn) on BOTH surfaces the model reads — the tool's own description and the system rule wall. It also knows what the app can DRAW: the visual blocks it may emit are generated from ONE catalogue (shared/agent-blocks.ts), so the prompt can never advertise a shape the renderer refuses or hide one it draws, and every example in the prompt is proved by RUNNING the parser over it. Earned by: a perfectly-planned single call refused by the vocabulary gate, ending a turn having changed nothing.",
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
    law: "Every screen showing a collection shows its count, exactly once: the NUMBER is a server COUNT(*) rendered through the ONE formatCount seam (floored abbreviation at every magnitude, zero/loading render nothing), counted EXACTLY up to TOTAL_COUNT_CAP (1,000,000) and reported as \"at least\" beyond it — through the one bounded seam shared/workers/count.ts, for every GROWING_COLLECTIONS total; a total that stopped early SAYS SO in the same object, because pagedJson DERIVES totalCapped from the total itself; a number that feeds a DECISION rather than a display (billable seconds, an export's completeness) stays EXACT and does not come through the capped path; the PLACE is a tab badge where the screen has a counted tab, else a CollectionHeading; the ARBITRATION is a React context (CountedTabs / CountedAbove) — a counted tab WINS and the heading stands down, decided per-permission at render, never by a prop. Where R8 and R16 disagree about a number, R16 prevails (R8 owns WHICH collection a tab describes). Earned by: a 24,011-product catalogue advertising '1000' (a capped list's length), and the same '24k' shown twice on one screen.",
    why: "AMENDED 2026-08-14, and the amendment is narrower than 'allow an approximate count'. An unbounded COUNT(*) over a growing table was the one read in the product with no ceiling at all, on every page of every paged screen — while the exactness it bought above a thousand was precision the badge threw away immediately (24,011 and 24,499 both render '24k'). TWO OPTIONS WERE ARGUED. (b) keep the count exact and cache it briefly was the more obvious one and it LOST, for two reasons. First, a cache fights a mechanism that already exists: app-shell.tsx bumps the primed total sidecar by ±1 on every add/remove ping, so a 60-second server cache would be overwritten back to the stale value by the next list fetch — create a ticket and the badge goes 222 to 223, then jumps BACK to 222 for a minute, and a badge that moves backwards is worse than one that says 'at least'. Invalidation does not rescue it: the mutation runs in a different isolate from the one holding the cache, so cross-isolate invalidation costs a Durable Object round trip on every count read, which is MORE work than today. Second, the cache key would have to be the CALLER'S FENCE, not the collection — these counts vary with module rights (R18), the account fence, ticketFence, ownerClause — so keyed by collection it discloses one caller's count to another, and keyed correctly it fragments until the hit rate stops being the win. So (a), capped — at 1,000,000 rather than the 50,000 first proposed, because at 100,000 rows a badge reading '50k+' tells a manager LESS than '100k' does, and deliberately the SAME number as the search ceiling so the app has one place where counting stops rather than two. It can only ever do LESS work than before (the inner LIMIT stops a scan that previously ran to the end), which was the owner's condition, met by construction. Measured, not assumed: on 14 Aug 2026 the largest collection in the app is the activity feed at 2,253 rows, about 400x under the ceiling, so no screen renders differently today. Honest limitation: a bounded million-row scan is a CEILING, not a cheap query — a constant-time count needs a counter maintained by every write, named and not taken.",
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
    law: "Input is validated at the boundary — and it is SCANNED. Every field a worker reads off a request body must sit in a CHECKING position: the first argument of a validator from shared/workers/validate.ts (requireText / optionalText / queryText / requireIdList), the operand of typeof, inside Array.isArray() or Number(), a strict comparison against a literal, or the needle of an allow-list .includes(). Nothing else — a truthiness guard is not a type check, and a cast is not a check at all. A body may not be DESTRUCTURED at the read (that scatters untrusted values into bare locals nothing can follow). A door that genuinely cannot validate is a reasoned RAW_BODY_EXEMPT line, and the list may only SHRINK: a listed line that is no longer an offender turns the build red. The QUERY string is the other half of the same request and is censused the same way: every searchParams.get must sit inside a checker. That half was itself prose for months — \"locked separately by validate.test.ts\", which locks what queryText DOES and never asked whether a door calls it — and the census found the two that never did (realtime's ?user= and ?team=, each of which NAMES a Durable Object, sixty lines below a /publish door that caps its channel name for exactly that reason). Earned by: POST /api/auth/email/start with {\"email\": 123} — an unauthenticated 500 that crashed BEFORE the send throttle and wrote a row into the global core database on every request. This law existed as a sentence for months, claiming to be locked by a test that covers the query half and excludes auth outright.",
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
    law: "An answer from the knowledge base carries its sources, or it is not an answer. Retrieval never writes prose — it hands back the passages it found and the sources they came from, and the assistant composes the reply with those in front of it. So `found`, `passages` and `citations` are ONE decision made in ONE place (knowledgeAnswer): no citation means no passage, and a sentence the assistant must say instead of inventing one. No door may assemble that response by hand — the same shape as R14's pagedJson seam, and for the same reason: a door that builds half a contract ships half a contract, and here the missing half is the difference between \"we have nothing on that\" and a confident answer with nothing behind it. The compartment a question was answered from, and the REASONING that chose it, ride the same object, because a wrong compartment is invisible otherwise. And now the assistant writing it is sometimes US (2026-08-18): the Knowledge tab asks the door to compose the reply, one cheap model call, so the law's own sentence became a code path rather than a hope about a chat panel. It did not bend to make room. The prose is an INPUT to knowledgeAnswer, decided in the same expression as the citations (answer: found ? …), so a written answer cannot outlive its sources; the writer (lib/knowledge-compose.ts) is handed the settled passages and citations, reads nothing about found, and hands back a string; the door may not name answer: any more than it may name passages; and the passages reach the model FENCED, because half of them are words a client wrote. Earned by: the owner's own sentence in the brief — \"an answer with no source is a bug, not a style choice\" — and by what a sourceless answer costs where this one is aimed: an agency repeating it to a client.",
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
  {
    id: "R26",
    dimension: "arch",
    law: "THE VECTOR INDEX NARROWS; THE TEAM'S DATABASE DECIDES. The knowledge base searches one account-wide Vectorize index, so two properties that used to be free have to be bought back explicitly. First, tenancy is a PARTITION and not a filter: every call into the store passes `namespace: guard.teamId`, built in one function (namespaceFor) from the caller's own guard and never from a request — Vectorize applies a namespace before the search, so a query cannot see another tenant's vectors even if every metadata filter were wrong. Second, and this is the clause that makes the first one survivable: nothing readable ever comes out of the index. It is asked for ids and scores alone (`returnValues: false`, `returnMetadata: \"none\"`, and a hit type with no text field), and every passage in every answer is then read back out of the TEAM'S OWN DATABASE under the caller's own owner clause with excluded sources gone. A mislabelled or stale vector can therefore cost a relevant passage; it cannot produce one the caller was never allowed to read. The check reads knowledge-vectors.ts and knowledge.ts off disk AND runs the doors against an index deliberately planted with lying vectors — one claiming the team shelf for a private source, one left behind by a source somebody excluded, one belonging to another team — and asserts none of them reaches an answer.",
    checkId: "vector-fence",
    status: "enforced",
  },
  {
    id: "R27",
    dimension: "ai",
    law: "DESCRIBED CONTRACTS — every `backticked` identifier in a tool description names something real: an argument the tool's own schema declares; a query param or body field its door reads (the same census R19/R22 stand on); a field its response actually carries — the pagedJson contract and the door's own extras read out of the call itself, the handler's own json({...}) literals, the row fields the module's libs map off a database row, and R23's knowledgeAnswer seam; another tool's name on either machine surface; or a reasoned DESCRIPTION_VOCABULARY entry. The vocabulary is a deny-list in spirit: every entry carries a reason, an entry nothing uses turns the build red, and so does an entry a derived class already covers. Nothing hand-listed that can be derived: tools from the three catalogue files themselves, doors from each worker's own switchboard, reads from handler source, response keys from the seams and the module's own libs. Scope, stated honestly: the law checks IDENTIFIERS, not sentences — a false sentence built from real identifiers is R19/R22's to make pointless; what THIS law ends is a name that exists nowhere surviving review because only humans read prose, and humans assume a green build checked it. Earned by: 2026-08-16 — a session reverted a tool description to a false promise, added two parameters that do not exist and a fake filter claim, and npm run check passed, because every law on the machine surface read the wiring (schema, buildQuery, buildBody) and none read the words a developer actually reads.",
    checkId: "described-contracts",
    status: "enforced",
  },
  {
    id: "R28",
    dimension: "ui",
    law: "A STRING THE APP SAYS IS IN THE CATALOGUE, AND THE CATALOGUE SAYS NOTHING THE APP DOESN'T. `shared/i18n-strings.json` must be exactly the set of user-visible English sentences the two front doors say, derived by re-running the ONE shared definition of what a person reads (`scripts/lib/i18n-source.mjs` — the same walk the extractor writes from and the adoption codemod wraps). That definition answers TWO questions, and both are DERIVED: which POSITIONS a person reads (the seven), and which FILES — `appFiles()`, the front doors' own import closure. A file is walked because a front door imports it, not because of the folder it happens to sit in. Three failures. MISSING: a sentence in the source that is not in the catalogue — English is the key, so an uncatalogued string is translated nowhere and ships in English to a reader who chose German. ORPHAN: a catalogue entry that matches no string in the app — nothing breaks today, which is precisely why it rots into a record of what the app used to say while being paid for on every build. UNREACHABLE: a file under web/, web-portal/ or shared/ that says something a person reads and that the walk never opens — censused off the DISK rather than off the graph, so a resolver that missed an import cannot hide behind its own answer, with a reasoned UNWALKED_OK line the only way out and a rot check so the list can only shrink. The walk stops at ONE directory, `shared/ui/`, the vendored component library: `resolveImport` always refused it, by package name, as 'somebody else's code and not ours to translate', and vendoring changed its address rather than what it is — the app still says its own words through the props it translates. The reason, and the screen-reader residue it leaves as real debt, are in VENDORED_UI_SCOPE. And the same sentence from the other end: the call site and the definition never disagree — every `t(\"…\")` literal must be a string the walk accepts, because a developer wrapping `t(\"of\")` has DECLARED it copy while isUserVisible refuses it as a non-sentence, and the fix is never to widen the predicate but to write the whole sentence with a hole in it, which is also the only shape a translator can reorder.",
    why: "The translation pipeline is BUILD-TIME (13.5): every language the app speaks, produced once per deploy, costing nothing at runtime. That design's whole load-bearing assumption is that the catalogue is current, and its only enforcement was a person remembering to re-run a script — the weakest kind of rule in a codebase whose other twenty-seven are machine-checked. The extractor already had a `--check` mode and it was never wired to anything. Then, on 2026-08-19, the second half of the question: current AGAINST WHAT? The set was six hand-written folders, and three kinds of copy had been living outside them under a green build. `formatRelative` (shared/web/format.ts) returned \"just now\", \"5m ago\", \"3h ago\" and \"2d ago\" in ENGLISH to nine call sites across BOTH front doors, so a German reader read *Erstellt von Aurora · 5d ago* — the translated half and the untranslated half of one line, on every record in the app. The whole language settings screen and the whole text-size section live in shared/web/, already wrapped in `t(...)`, in no catalogue; they only looked finished because the SEED happened to carry by hand the three languages somebody here can actually read. And shared/scale.ts holds \"Compact\", \"Comfortable\" and \"Large\", rendered through `t(step.label)` with the English one directory outside the walk. A folder list cannot be made correct, only current — and \"current\" is exactly what nobody notices going stale. An import cannot be forgotten, which is R24's reasoning applied to words instead of money. The check re-runs the real walker rather than describing it: a check with its own idea of \"a string a person reads\" would be a second definition, and the day the two drifted the build would stay green while the app spoke English.",
    checkId: "catalogued-strings",
    status: "enforced",
  },
  {
    id: "R29",
    dimension: "ui",
    law: "THE PAGE HAS ONE WIDTH, AND A SCREEN DOES NOT GET ITS OWN. Each front door owns exactly one page container — `web/components/deep-link-screen.tsx` at `max-w-[1600px]`, `web-portal/components/portal-shell.tsx` at `max-w-3xl` — and no other component may set a page-level width. A page container is identified positionally, the way R20 identifies a checked field: one line carrying `mx-auto`, `w-full` and a `max-w-*` together, which is the exact signature of a centred content column and of nothing else. Anything else that needs a cap (a dialog, a sheet, a door card, a chat bubble, a line of prose) is not centred-and-full-width and is not caught. Exceptions are DATA in `SCREEN_WIDTH_EXEMPT`, each with its reason, and every one is rot-checked: an entry whose file no longer sets a width turns the build red, so the list can only shrink.",
    why: "The owner named this one himself, and named it as an inconsistency rather than a bug: work logs, tasks and meetings use the full width, and he could not see why other pages did not. The answer was that those three render through the one shell and six screens cap themselves narrower. One of the six is the shell's OWN loading skeleton (`app-shell.tsx:489`, `max-w-2xl`), so every cold load of the agency app visibly snapped sideways as 672px of skeleton became 1120px of content. That is the shape of failure this law exists for: not a rule anybody disagreed with — UI-RULEBOOK L1 already said 'one container, one cap', and round one of the feedback implemented it in `deep-link-screen.tsx` — but a rule that was implemented in the one place somebody happened to be looking and stayed unimplemented in six others, silently, under a green build. A width is invisible to every other check in this repo: TypeScript sees a string, the lint sees a string, and no test reads layout. It ships a screen that works, on which two thirds of a wide display is empty.",
    checkId: "one-page-width",
    status: "enforced",
  },
  {
    id: "R30",
    dimension: "workflow",
    law: "EVERY EMAIL IS CLASSIFIED, AND ONE THAT NAMES A RECORD CARRIES THE WAY BACK TO IT. Every function in workers/ that composes a branded message (the `brandedEmail` / `sendBrandedEmail` seams — derived from the source, never hand-listed) must appear in EMAIL_CENSUS as either `record` (it is about a specific record: it passes `ctaUrl`, built through the one helper, shared/workers/record-link.ts) or `none` with a real reason (and then it must NOT pass `ctaUrl` — an email that names no destination may not promise one). Both directions: an unclassified send fails the build, and a census entry matching no send is an orphan and fails too. No email may spell an origin: the two front doors arrive as configuration, because THE RECIPIENT DECIDES WHICH APP THE LINK OPENS — staff read the agency app, a client contact reads the portal, and the same ticket therefore has two addresses. Sending a client an agency URL hands them a link they cannot open and advertises a door they may not pass (R21).",
    why: "The mention email said, in prose, 'Open the ticket to read the full conversation and reply' — and contained no link of any kind. The copy instructed an action the message made impossible, and it had been doing so since the notification path was written, because nothing in the build could see the difference between an email that links and one that only talks about linking. Buttons alone would have fixed twelve emails and nothing else: the thirteenth, written next year, would ship the same way. So the deliverable is the CENSUS — the same shape as R27's vocabulary and R13's exemptions — and the buttons are what it forced. The classification is also where the front-door decision is recorded, which is why it is a law and not a lint: 'which hostname does this go to' is a security question wearing a formatting question's clothes.",
    checkId: "linked-emails",
    status: "enforced",
  },
  {
    id: "R31",
    dimension: "ui",
    law: "TWO RADII AND NO THIRD, SPELLED THE KIT’S WAY. A rectangular surface is `rounded-[var(--radius)]` and a pill is `rounded-pill`; a directional variant of the first (`rounded-t-xl`, for a sheet that meets the bottom of the screen) is the same word applied to one edge. No other step of the scale may be written in `web/`, `web-portal/` or `shared/`, and `shadow-*` stays at exactly one use. ONE further radius is admitted, as DATA with its reason in `RADIUS_EXCEPTION` and rot-checked so an exception nothing uses turns the build red: `rounded-select` (6px), on the mark of a selection control, because at `rounded-xl` a checkbox is a lozenge and at `rounded-full` it is a radio button. The kwapso kit admits a second (4px on a bar, on the grounds that a bar is not a box), and the kit's gantt, heatmap and flowchart now draw it as `rounded-[var(--radius-bar)]`. The kit vendored at `shared/ui/` SPELLS THE SAME TWO WORDS THROUGH ITS TOKENS: `rounded-pill` is its pill (`--radius-pill`, the themable spelling of `rounded-full` — data in `RADIUS_EXCEPTION` with the rest), and any `rounded-[…]` whose bracket RESOLVES THROUGH A RADIUS TOKEN — `var(--radius…)` plain, on one edge, `inherit`, or a `calc()` over the token for a concentric inner corner — is the same vocabulary spelled where a named step cannot reach. What stays forbidden is exactly what was always forbidden: a NAMED third step (`rounded-lg`, `rounded-md`, `rounded-2xl`…) or a bare number that answers to no token. A third BOX radius is still forbidden. Enforced by one grep, because every step from `sm` to `3xl` already resolves to the same 24px in this theme. NOTHING is out of scope: the vendored component library was excused for one day and the exemption's own rot check deleted it the moment the reskin collapsed those radii.",
    why: "It is the cheapest rule in the book to obey and it was the most broken: 63 of 125 radius classes were off-vocabulary — `rounded-lg` 52 times, `rounded-md` 7, `rounded-2xl` 2 — and changing every one of them moved NOTHING on screen, because `--radius-sm` through `--radius-3xl` are all `var(--radius)`. So five words were in use for one value, which means five decisions a developer can make where there is only one, and the day the theme gives those steps different values the app acquires five radii it never chose. The law could not be written before the fix, because a law that ships with a 57-line exemption list is a list and not a law. It ships the moment the grep is clean. THE ONE THING IT DOES NOT REACH is the bare `rounded` class: that is 4px here, not 24px, so it is a genuinely different value on an inline highlight and a 32px thumbnail, and folding it in would be a redesign wearing a sweep's clothes.",
    checkId: "two-radii",
    status: "enforced",
  },
  {
    id: "R32",
    dimension: "ui",
    law: "EVERY COLOUR RESOLVES THROUGH A TOKEN. No screen in `web/`, `web-portal/` or `shared/` may name a Tailwind colour ramp (`amber-*`, `emerald-*`, `red-*`, `green-*`, `blue-*`, `slate-*`, `gray-*`, `zinc-*` …) or write a hex literal. What a colour MEANS has a token — `warning`, `success`, `destructive`, `muted`, `primary`, `chart-1` to `chart-5` — and a mark comes from the chart series (UI-RULEBOOK C6). The five files that legitimately hold hexes are DATA in `PALETTE_LITERAL_OK`, each with its reason, and rot-checked so the list can only shrink.",
    why: "A hard-coded colour is invisible to a theme. `import-screen.tsx` said `amber-600` and `emerald-500` where it meant warning and success, so the one screen in the app that reports a result was the one screen a rebrand could not reach; `shared/departments.ts` held five hexes the LEGACY app had chosen, none of them one of kwapso's own seven, so a department dot was the single mark on screen that did not belong to this product's palette. Neither was a bug anybody would file — both look fine, in one theme, on one day. That is the whole argument for making it a law rather than a review note: colour drift is only ever visible in aggregate, and nobody sees the aggregate.",
    checkId: "closed-palette",
    status: "enforced",
  },
  {
    id: "R33",
    dimension: "ui",
    law: "EVERY EXTRACTED POSITION ASKS FOR ITS TRANSLATION. R28 makes the catalogue match the code; this makes the code READ the catalogue. Every position `scripts/lib/i18n-source.mjs` reports in `web/` or `web-portal/` — the same one definition, so the two laws can never disagree about what a sentence is — must sit inside a `t(...)` call, with exactly two ways out. A `label:` or `helpText:` on an object that spreads a field config is translated ON THE WAY TO THE SCREEN by `shared/web/field.tsx`, which is positional (the object says what it is) and is held shut by the second half of the check: NO file in either front door may import `Field` from the library directly, so the seam cannot be walked around. The ban is matched on the PATH TAIL of the kit's Field — `controls/field/field` since the design-kit swap renamed the tiers (it was `primitives/field/field` before, and the swap is exactly why the tail must move WITH the file: a ban matching a path nothing imports is a ban that passes vacuously, which it silently did for one evening until the story pass caught it). Everything else is a copy TABLE read through `t` somewhere else, and each one is DATA in `TRANSLATED_WHERE_READ` with the seam that reads it, rot-checked both ways — a pin that no longer has an unwrapped position of that kind turns the build red, and so does a `via` that no longer appears in the source, so the list can only shrink.",
    why: "R28 could be perfectly satisfied by an app that speaks English to everybody, and on 2026-08-18 it was: 666 of 2,001 extracted positions — every form field label in the app, 119 of the toasts, both error boundaries and every dialog title written as a ternary — were in the catalogue, translated at build time into every language the app speaks, and never asked for. The catalogue was current and the screens were English, because nothing had ever checked that an EXTRACTED position is a WRAPPED one. The field labels are the reason it went unnoticed for so long and the reason the fix is a seam rather than 138 edits: a field config is a module-level constant, `t` is a hook, so `t(...)` genuinely could not be written where those words are declared — the one class of string in this app that a developer could not have wrapped even if they had thought to. `translateRecipe` had already answered the identical question for the screen recipes (declare the English, translate on the way to the screen); this is that answer applied to the other half of the app, plus the import ban that makes it provable.",
    checkId: "wrapped-strings",
    status: "enforced",
  },
  {
    id: "R34",
    dimension: "ui",
    law: "THE GLOSSARY IS THE DICTIONARY THE SCREENS SPEAK. Every user-visible English sentence in the two front doors — `shared/i18n-strings.json`, which R28 makes exactly that set — is read for a KNOWN SYNONYM of a glossary term. The banned words are DATA (`GLOSSARY_SYNONYMS`), each naming the term it competes with, and a sentence that has a reason to keep one is an entry in `GLOSSARY_SYNONYM_OK` with that reason, rot-checked so the list can only shrink. The list is deliberately NARROW: a word earns a place only when it can mean nothing else in this app.",
    why: "R6 has always said two things and only one of them was checked. `glossary-wellformed` reads the glossary FILE — term non-empty, definition brief, no duplicates — and not one line of the app. So the half of the law a person actually experiences (\"use those words in UI copy; never invent a synonym\") was enforced by nobody, and the app shipped green saying \"Permissions\" on one screen and \"access rights\" on another, \"teammate\" for a member, \"cost card\" for the internal rates and \"Portal login\" for portal access. Two words for one thing is not a typo: a manager reading \"Permissions\" and \"Access right\" has to work out whether they are the same, every time, and the answer is not on the screen. WHY A DENY-LIST RATHER THAN A REQUIREMENT that every sentence use only glossary words: because most sentences are ordinary English, and a rule that flagged them would be turned off. This one may only get smaller — a word comes off the list when the term goes, never because a screen wanted it back.",
    checkId: "glossary-in-copy",
    status: "enforced",
  },
  {
    id: "R35",
    dimension: "ui",
    law: "A RECORD NEVER APPEARS WITHOUT ITS FACE. Wherever a record or a dropdown value is shown to be chosen or scanned — a picker option, a row in a collection, a row in a nested panel inside another record's screen — it is drawn with its visual beside its name: its own picture where it has one, its type's glyph where the type has one, and its initial where it has neither. Never nothing, and never the glyph written INTO the words (a pictograph inside a sentence is the one shape UI-CONVENTIONS §5 refuses). Enforced at the three places it can be lost rather than by inspecting markup: `PickerOption` and `PickableRecord` must DECLARE the visual fields, so a type cannot drop a picture before a component sees it; every list recipe must name its `leading` column; and the one shared nested row (`Row` in work-panels.tsx) takes its mark as a REQUIRED prop, with `null` a real and visible answer.",
    why: "A visual is a key identifier, not decoration on the main page — the owner said so three times across two rounds, and each time the fix was applied where he pointed and nowhere else. The census on 19 Aug 2026 found the true size: THIRTY-THREE pickers, not one of which could show a visual at all, because `PickerOption` had no field for one; ten of fourteen list recipes naming no leading column; around twenty nested panels drawing bare words for records that lead with a glyph on their own screen; and `PickablePerson` dropping `imageUrl` one line before every picker that offers a person. WHY THE CHECK IS POSITIONAL RATHER THAN VISUAL: there is no honest regex for 'this JSX is a record row' — `.map(x => <li>` matches attachments, replies, comments and steps, none of which are records. So the rule stands on the three CHOKEPOINTS instead, which is the same move `record-picker.tsx` being the only composer of `command` already makes: a field that is not carried cannot be forgotten later, it is already gone, and a required prop cannot be skipped by a twenty-first panel. TWO PICKERS HAD WORKED AROUND THE MISSING SLOT by concatenating the emoji into the label, which put a pictograph in the search index and on the trigger; both now pass it as a mark.",
    checkId: "records-carry-their-face",
    status: "enforced",
  },
  {
    id: "R36",
    dimension: "arch",
    law: "EVERY SWITCH ON THE PERMISSION MATRIX DECIDES SOMETHING. The matrix is a grid, so a module gets four boxes whether or not four decisions exist behind them — and a box that decides nothing is one an owner ticks, saves, and believes they granted by. The offered set is data (`MODULE_OFFERED_RIGHTS`, exceptions only, so it can only shrink), and the consulted set is DERIVED off the source: literal `requireRight`/`gated`/`gatedBody` pairs, the MCP `TOOL_GATES` strings, every module in `ACTIVITY_GATE_MAP` (which the record feed asks for `read` on) and every import `TARGETS` module (which the importer asks for `create` on). The check fails BOTH ways. Offered-but-unasked is theatre. Asked-but-unoffered is worse and is the half that matters: a door written against a right no role can be given refuses everybody, including the Admin role, which is locked and cannot be edited to fix it. Earned on 21 Aug 2026, when the owner asked what the twenty-three rows were for: fifteen of the eighty-eight boxes decided nothing, seven of them undocumented, and one whole module (`screens`) had four boxes and no door — its two doors gate on `teams:edit`. Two more modules, `learning` and `marketing`, still held permission rows six weeks after the product purged them, because a purge deletes forward and migration 0021 had CROSS JOINed them onto every role.",
    checkId: "offered-rights",
    status: "enforced",
  },
  {
    id: "R37",
    dimension: "arch",
    law: "A LINK INSIDE THE APP NEVER LEAVES THE SHELL. The whole post-auth app is ONE client-resolved shell that mounts once and never unmounts, so every move within it is a History-API push through the single soft-navigation bus (`softNavigate` / the host's `go()`) and nothing is fetched. A bare `<a href=\"/t/…\">` opts out of all of it: the browser discards the document, every module re-runs from nothing, the warm cache and any running agent are destroyed, and the boot mark plays again because the module-level session cache has reset to empty. So an in-app destination is written with `<InAppLink>` — a REAL anchor, so middle-click, copy-address and screen readers still work, with only the plain left click intercepted — or it carries that same interception inline. The check is a CENSUS OFF THE DISK of every component's anchors, classified by where the href points: inside the app, an `/api/` door, a pre-auth route, or elsewhere. Not a hand-list of files, and not one spelling of the mistake.",
    why: "Earned three times, by one class of bug, under a green build each time. First the knowledge base, which was missing from `TOP_LEVEL_MODULES` so every tap on a sidebar page left the History API — the note is still in `deep-link/route.ts`. Then \"Manage dropdowns\", which the owner reported himself on 24 Aug 2026 in the words that name the mechanism exactly: \"I can see the app reload because I see the boot loading animation\" — and the boot mark's trigger is a module-level `sessionCache` that only a fresh document can reset. Then the internal rate card, whose own comment says it copied the dropdowns link, which is what turns a typo into a pattern. THE GUARD THAT EXISTED COULD NOT SEE TWO OF THE THREE: `shell-nav.test.ts` read SIX hand-listed files for ONE spelling (`router.push`), and a bare anchor in any of two hundred other components is a different spelling in a file nobody listed. That is R21's lesson arriving in a second module — enumerate by what NAVIGATES, never by what somebody remembered to write down — and it is why the seam is a component rather than a convention: a bare anchor is now a red build, and there is exactly one way to write the right thing.",
    checkId: "in-app-anchors",
    status: "enforced",
  },
  {
    id: "R38",
    dimension: "ui",
    law: "A RECORD DETAIL MAY NOT LOOK ITS RECORD UP IN A PAGE. A screen that shows one record of a collection R14 makes PAGE (`GROWING_COLLECTIONS`) must read that record by ID — a dedicated per-record door, or a `<module>:one:<id>` fallback beside the list — never a `find` over the cached list, which holds only the loaded prefix. The check is POSITIONAL, as R20's is: it ties the `find` to the query VARIABLE built from a paged cache key, so a find over a BOUNDED collection (apps, member roles) — where page one IS the collection — is never caught. The by-id key then has to reach a listener like any other (R15), or a status change patches the list and leaves the open record showing yesterday.",
    why: "The owner opened a ticket from the triage queue on 26 Aug 2026 and was told 'That ticket no longer exists.' It existed: number 1,030 of 1,820 in staging, and the entire lookup was a `find` over the newest fifty rows. Every ticket past the cursor was unreachable by direct link, from an email button, from a bookmark — and the screen made the most alarming claim available to it, that the record was gone, on a collection whose whole point is that it grows. Nothing was red: the door had answered `?id` since paging landed and says why in its own comment, and the API client's `helpOne` had been written and never called. Three sibling screens already had it right — `meeting-detail` and `knowledge-detail` name the variable `inPage`, and `story:one:` was added to the live registry in August after the identical fault — so this was one screen left behind by a pattern the rest of the app knew. R14 made the lists page and nothing asked what that did to the screens that read them.",
    checkId: "details-ask-the-door",
    status: "enforced",
  },
  {
    id: "R39",
    dimension: "ui",
    law: "THE KIT SUPPLIES THE UI, AND NOTHING ELSE DOES. No file in `web/`, `web-portal/` or `shared/web/` imports a UI package. The kit at `shared/ui/` is the one source of a control, a structure, a glyph and a toast; its own dependencies (Radix, sonner, recharts, class-variance-authority) are ITS to import, and the app reaches them THROUGH it — `@shared/ui/components/sonner/sonner`, never `sonner`. The deny-list is DERIVED from the kit's own package.json peers plus the icon packs, so a dependency the kit adds tomorrow is covered without anyone editing this law. Exceptions are data in `UI_PACKAGE_EXEMPT` with a reason each, rot-checked so a pin whose file no longer imports the package turns the build red and the list can only shrink.",
    why: "A design system is a source of truth only for as long as nothing else can supply the same thing, and every breach of that starts as one import for one component the kit did not have that day. The icon swap of 2026-08-27 is the worked example: 96 kit glyphs were not enough, so five files imported lucide directly and a sixth reached for lucide's RUNTIME loader, which meant the app carried a second icon pack of 3,924 glyphs — and when the kit's art changed, thirty-seven names kept drawing the OLD pack beside the new one, on the same screen, under a green build. Nothing was wrong with any single import; the whole was a second design system nobody had decided to have. This law is the sentence that makes the next one impossible, written the day the last one was removed rather than after the next one arrives.",
    checkId: "kit-supplies-the-ui",
    status: "enforced",
  },
  {
    id: "R40",
    dimension: "arch",
    law: "A STORED FILE MUST REACH A PERSON. Every call that puts BYTES in a bucket — an `env.<BUCKET>.put(` on a binding the wrangler configs declare as an `r2_bucket`, or the one shared seam that does it for you (`storeImageDataUrl`) — is claimed by an entry in `STORED_FILES` naming the FIELD a person reads the reference back through and the front-door FILE that renders it. Both halves are DERIVED: the write census is read off disk, so a new upload door cannot ship unclaimed; and the render is proved by finding that field reaching a fetched ATTRIBUTE — `href=`, `src=` or `picture=` — in that file, directly or through a `const` assigned from `safeHref`/`safeSrc`. A field that only ever reaches a form's values is NOT a read: that subtraction is the whole discriminator, because a filename written back into an edit dialog is not a file anybody can open. Rot-checked both ways, so an entry whose door no longer writes bytes turns the build red and the list can only shrink.",
    why: "THREE INSTANCES OF ONE BUG, all green. R15 makes a published change reach a listener and R16 makes a count reach a screen; nothing made BYTES reach a person, so the app grew three doors that accepted a file, stored it perfectly and led nowhere. A story's attachments were written by one dialog and rendered by no screen at all. A client uploaded a document through the portal's \"Send a file\" and the agency was shown the FILENAME as plain text in a metadata line — the URL was on the row and read by nothing. A task's `file_url` was write-only from the day it shipped. In all three the door answered 200 and the bytes were in R2, which is exactly why no test and no reviewer caught it: everything worked except the last step, and the last step is the only one a person experiences. The check has to walk write-to-read, because that is the direction the failure runs, and it has to subtract form values, because a field round-tripped through an edit dialog looks like a read and is not one.",
    checkId: "reachable-bytes",
    status: "enforced",
  },
  {
    id: "R41",
    dimension: "arch",
    law: "A FILE SOMEBODY PICKED IS EITHER SENT OR REFUSED, NEVER DROPPED. R40's sibling, and the boundary is the point: R40 asks whether a STORED file reaches a person, so where nothing is stored it is silent by construction. A create dialog cannot upload while somebody types — R2 is addressed by the record's id and on a create that id does not exist yet — so the picked files wait and are hung on whatever `onSubmit` HANDS BACK. Every dialog that defers an upload that way is a line in `DEFERRED_UPLOAD_FORMS` naming the maker whose id it needs, rot-checked against the dialog still deferring; and every CREATE call site of it, censused off the disk, must actually return that id — either as a concise arrow whose body IS the maker call, or as a named value that is returned. A site passing the record's id is an EDIT and is skipped, read from the same prop the dialog itself switches on. Deliberately NARROW: the fault is a DISCARDED RESULT rather than a missing call, so there is no absent function to census, only a value that goes nowhere — an honest small law that can be checked beats a general one that cannot.",
    why: "Three of the four `<StoryFormDialog>` create sites did `await createStoryFrom(...)` and threw the id away, so `target` was null, the guarded upload never ran, and every file picked in those forms was dropped in silence: story created, success toast, no error, no row, no object, nothing to recover from. `createStoryFrom` had returned the id since the day the upload was written — the callers simply did not pass it on, and a discarded value looks exactly like correct code. It is the worse half of the class R40 names: R40's failures at least leave the bytes in the bucket. Found 2026-08-27 while answering a different question about the same dialog, which is the third time in one day this class was found by pulling on a thread rather than by any check.",
    checkId: "picked-files-are-sent",
    status: "enforced",
  },
  {
    id: "R42",
    dimension: "arch",
    law: "Every accepted source type resolves to a declared reader on EVERY door, or to an honest refusal — and no door chooses its own.",
    checkId: "declared-readers",
    status: "enforced",
  },
  {
    id: "R43",
    dimension: "ai",
    law: "Agent/MCP TOOL-SET parity. A tool that exists on the agent's own catalog exists on MCP's too, or the gap is a named, reasoned line — and the reverse.",
    why:
      "R19/R22's coverage census only asks whether a door has a tool on SOME machine surface, so a door with an agent tool and no MCP tool (or the reverse) passes that census trivially — the asymmetry the owner's own sentence names (\"same thing an agent can do, same thing from MCP\") was never itself checked. Every one of the 25 agent-only and 23 mcp-only tools turned out to be a real, written decision (MCP.md §3), but the comment introducing the agent's own AGENT_ONLY array had drifted to naming four of them while twenty-five existed — a law that stops looking when a block grows is a law that rewards growing it quietly.",
    checkId: "agent-mcp-tool-parity",
    status: "enforced",
  },
  {
    id: "R44",
    dimension: "ui",
    law: "A CATALOGUED STRING MUST BE ANSWERED, UP TO A CEILING THAT ONLY FALLS. R28 makes `shared/i18n-strings.json` exactly the set of English sentences the app says; R33 makes every one of those positions ask for its translation. Neither asks whether the ASKING is ever ANSWERED — a string can be extracted, wrapped in `t(...)`, and still have no entry anywhere in `overlay(CATALOGUE, SEED)` for a translated language, which is a silent English sentence on a screen that otherwise looks finished. Per translated language, the count of extracted strings with no non-empty entry — the same predicate `coverage()` already uses — is pinned in `TRANSLATION_CEILING`. The check computes the true count fresh, off the same three files, and requires it to equal the pin exactly: an untranslated string added past the ceiling fails the build (a regression), and a ceiling left higher than the true count after a translation lands fails it too (a stale pin hiding the next regression behind the improvement it never recorded). The pin can fall; it can never rise without the count behind it rising too.",
    why: "Not a hard zero. `shared/i18n-catalogue.ts` says a missing translation degrades to English on screen, which is a sentence rather than a bug — an app can ship one language ahead of the rest without being broken, and it does today by 307 strings in three languages, mostly the process-map and Google-connections screens built after the last translation pass. A hard zero here would turn every ordinary feature PR red the moment it adds one new label, and a red build that fires on unrelated work is a build people learn to route around — which is worse than no law, because the next accidental regression hides behind the routine one. A ceiling that can only fall keeps the debt VISIBLE and BOUNDED without making it un-shippable: adding untranslated copy is still free, but it is no longer free to hide, because the pin has to move in the same diff and a reviewer sees it move.",
    checkId: "translation-ceiling",
    status: "enforced",
  },
  {
    id: "R45",
    dimension: "ui",
    law: "EVERY KIT COMPOSITION IS DECIDED. All 47 files under `shared/ui/compositions/` (the pinned kit's screen-shaped assemblies, one directory level above its components) are derived off disk, and each one resolves to EITHER an adoption this app actually reaches — a direct `@shared/ui/compositions/...` import in `web/`, `web-portal/` or `shared/web/` — OR a reasoned entry in `COMPOSITION_EXEMPT`, naming why not: a genuine structural mismatch, a shape already assembled from other already-adopted kit parts under a different name, a real gap this app should or should never have, or a question left for the owner. The two acceptable outcomes are adopted, or DELIBERATELY not used for a stated reason — a composition nobody looked at, or hand-rolled screen UI that quietly duplicates one, is the only unacceptable result. Rot-checked both ways, so the exemption list can only shrink: a composition with neither an import nor an exemption turns the build red, and an exemption whose composition is now directly imported turns it red too.",
    why: "The owner's own words, 30 Aug 2026: \"make sure that we get 47 out of 47 compositions... if there are some compositions that we don't use, I completely get that, but flag those... there should be nothing that we have hard-coded unless it's some kind of composition that does not exist.\" Two lanes had worked through 37 of the 47 by hand, in prose, with no check behind it — which meant the count could regress the moment a new composition landed in a kit update, or the moment somebody hand-rolled a screen that duplicated one, and nothing would say so. The census is deliberately a DIRECT-IMPORT string match, the same shape as R39's: it undercounts a genuine transitive adoption (a composition reached only through another kit part), but an undercount fails safe into \"go write the exemption down\", where an over-count would let a real gap hide behind a stale claim.",
    checkId: "composition-coverage",
    status: "enforced",
  },
  {
    id: "R46",
    dimension: "ui",
    law: "EVERY KIT COMPONENT AND FOUNDATION RESOLVES TO A REACHED ADOPTION OR A REASONED, ROT-CHECKED EXEMPTION. The kit at `shared/ui/` ships 115 components and 3 foundations (icons, tokens, motion) — 118 named parts, the owner's own count, and his own instruction: \"all 118 components should be imported, and if you're not using some, I understand that, but there should be nothing hard-coded.\" A part is REACHED, not merely imported: `computeReachability` (`scripts/kit-coverage.mjs`) seeds from every kit reference either front door or `shared/web/` makes, in EITHER language the kit ships in — a JS/TS `from \"@shared/ui/…\"` or a CSS `@import \"…\"` — then closes over the kit's OWN cross-references (a component that imports another, a stylesheet that imports another) until nothing new appears, so a part reached only through another adopted part, or only through a stylesheet, still counts. Every part the walk does not reach is claimed by a line in `KIT_COMPONENT_EXEMPT` naming the one sentence a non-technical reader can check — no surface in the app has this shape, or adopting it would break another law. Rot-checked BOTH ways: a part the walk NOW reaches loses its exemption, and a part with no exemption and no reach fails the build — so the list can only shrink.",
    why: "Counting only JS/TS import lines undercounted in the SAME direction seven times in one day, and always by dropping a real adoption rather than inventing a false one: six parts reach the app only through another kit part it has already adopted (`notes` through Comments, `folder` through Tabs, `title` through the kit's own `record-detail`, `progress` through `file-upload`, `gallery` and `checklist` picked up by two other lanes overnight with nobody re-running the census to notice), and `motion` reaches both front doors only through a CSS `@import` in their own `globals.css` — a reference no JS-import grep can see in either direction, because there is no import LINE in that language for it to miss. Canaried both ways: deleting the `@import` from both `globals.css` drops the reached-foundations count from 3/3 to 2/3, and restoring it recovers 3/3. A census that misses seven real adoptions cannot tell an unimported part from a badly-walked one, so the exemption list this law rot-checks is only honest once the walk it is checked against actually follows both languages the kit speaks — the same lesson R39's own deny-list learned about a THIRD dependency (an icon pack) arriving by a route nobody grepped for, applied here to the SECOND language a stylesheet speaks.",
    checkId: "component-coverage",
    status: "enforced",
  },
]

/** R44 — the ceiling. Per translated language, the number of extracted strings
 * (`shared/i18n-strings.json`) with no non-empty entry in `overlay(CATALOGUE,
 * SEED)` — the exact predicate `coverage()` already uses to tell a person
 * choosing a language what to expect. Pinned rather than computed inline so a
 * change to it is a reviewed line in a diff: raising it silently is exactly the
 * drift the law exists to catch, so the check requires the true count to equal
 * this number exactly, in both directions. Measured 2026-08-30. */
export const TRANSLATION_CEILING: Record<string, number> = {
  de: 307,
  es: 307,
  ca: 307,
}

/** R46 — the reviewed exemptions. A component or foundation here is not
 * reached by the app today, each with the one sentence a non-technical reader
 * can check: no surface in the app has this shape, or adopting it would break
 * another law. Rot-checked both ways in `web/test/rules.test.ts` — an entry
 * the walk now reaches turns the build red until the line is deleted, and a
 * part with neither a reach nor a line here does the same. Keyed by the kit's
 * own directory name (`components/<name>` or `foundations/<name>`), the same
 * id `computeReachability` produces. */
export const KIT_COMPONENT_EXEMPT: Record<string, string> = {
  "components/gantt":
    "sprints render as a flat list plus one burndown bar (web/components/sprints-screen.tsx); nothing shows parallel per-app or per-owner lanes across periods for gantt's lane-per-record shape to draw.",
  "components/heatmap":
    "no screen aggregates \"which record did how much work each period\" as a grid — work-log views are single-series (one record's weeks, or one week's people, web/components/work-logs-panel.tsx), never a record×period matrix.",
  "components/pulse-band":
    "a confirmed name collision, not a gap: web/components/pulse.tsx exports its own PulseBand, a StatGrid-plus-two-bar-charts dashboard band with no day-of-week axis at all — unrelated in shape to the kit's day-by-week density strip. Nothing in the app tracks per-day-of-week workload.",
  "components/donut":
    "explicitly rejected in the app's own comment: web/components/pulse-charts.tsx documents that every comparison chart (hours by person, by app, by stage) stays a bar \"deliberately not a pie: … a bar is the only chart anybody reads a comparison off reliably.\"",
  "components/rings":
    "no single-KPI-against-a-target or part-of-a-whole metric exists anywhere that isn't already a bar comparison — the app's eleven charts are all multi-category bars or time-series areas (web/components/pulse-charts.tsx).",
  "components/radar":
    "no feature compares one record across several independent dimensions at once — every metric the app tracks (hours, margin, savings, stage counts) is a single measure over time or over a group, which the existing bar/area charts already cover.",
  "components/progress-toggle":
    "both progress readouts in the app are plain text (web/components/sprints-screen.tsx's \"3 of 11 done\") or a continuous bar (KpiProgress, web/components/tasks-screen.tsx) — never discrete done/undone segments for this pill row to draw.",
  "components/article-body":
    "a real duplicate exists (shared/web/rich-text-view.tsx's hand-rolled PROSE class, reused across 14 detail screens) but the swap is not mechanical: ArticleBody styles a `blockquote` as a 24px serif pull-quote, \"one per page\" by editorial rule, and this app's blockquotes are ordinary quoted replies inside a ticket or meeting note — applying the kit's pull-quote treatment to those would be wrong, not neutral. Needs a design decision (an override, or accepting the treatment) before the swap, not a blind one.",
  "components/container":
    "adopting it would break R29: web/components/deep-link-screen.tsx's own `max-w-[1600px]` line is the sole machine-checked page-width owner for the agency front door, and Container's own presets (app 1240 / marketing 1200 / document 960) don't even offer that width.",
  "components/signature":
    "the app's one approval flow, PortalApprovalBand (web-portal/components/ticket-screen.tsx), is a click-to-approve button with a caption — not a drawn, canvas signature capture. No sign-off flow in the app asks for one.",
  "components/rating":
    "no star icon and no rating concept exists anywhere in either front door's UI code.",
  "components/hover-card":
    "every floating panel in the app (web/components/record-picker.tsx and others) is deliberately click-triggered via the kit's own Popover — nothing opens a preview on hover, so there is no candidate to swap.",
  "components/aspect-ratio":
    "the one ratio-boxed image (web/components/deliverables-panel.tsx) applies the plain `aspect-video` Tailwind utility directly to a single thumbnail — one site, not a reusable wrapper's job.",
  "components/video":
    "no `<video>` element exists anywhere in web/, web-portal/, or shared/web/.",
  "components/web-embed":
    "the only `<iframe>` in the codebase is a sanitizer test fixture (web/test/stored-html.test.tsx) proving embeds get stripped — not a real embedded-content surface.",
  "components/visibility":
    "a confirmed name collision, not a gap: shared/web/screen-engine/visibility.tsx evaluates config-driven permission RULES against a row/user/app context; the kit's part answers a different question, \"is this on screen,\" via a shared IntersectionObserver. Different signatures, different jobs — CLAUDE.md documents the collision by name.",
  "components/data-preview-table":
    "the import flow's own locked law (AGENTIC-IMPORT.md, dated 2026-07-04) is \"one plan, one confirm,\" never a per-row checkbox grid — data-preview-table's whole shape is the interaction this app deliberately does not offer.",
  "components/progress-dashboard":
    "multi-metric displays are already assembled from StatGrid + KpiProgress + Chart (web/components/pulse.tsx, work-logs-panel.tsx, agent-blocks.tsx) — nothing needs this component's specific stacked-bars shape.",
  "components/tree":
    "no nested/hierarchical disclosure exists in the app — process branching (web/components/step-form-dialog.tsx) renders as a flowchart DAG through the kit's own Flowchart, not a tree, and the kit's own Comments is explicitly one level deep.",
  "components/notifications":
    "the app relies on the kit's own `sonner` toasts for the moment and `activity-feed` for the history — no bell icon or notification-center composition exists anywhere for this to replace.",
  "components/form":
    "adopting it would break R4: shared/web/form-shell.tsx (every dialog form's required shell) is built from Button + Dialog only and draws a pinned-footer DIALOG; the kit's form.tsx draws a page-section form with no dialog chrome at all. Different shapes solving different problems, not substitutes.",
  "components/import-wizard":
    "the flow structurally matches (AGENTIC-IMPORT.md's own upload→plan→review→run→report diagram), but web/components/import-screen.tsx is a 530-line working, critical flow carrying business logic the composite has no slot for (sample-file links, import history, CSV-injection-safe rejection export, per-step predicted rejections). Rebuilding it on the kit part is a large, risky rewrite, not a swap — deferred pending dedicated time, not rejected on fit.",
  "components/kanban":
    "zero drag-and-drop infrastructure (no dnd-kit or equivalent) exists anywhere in the app; sprints and stories deliberately track state by date rather than by status column (web/components/sprints-screen.tsx's own comment).",
  "components/calendar-view":
    "its documented blocker (no click prop, UI-GAPS.md #22) was fixed upstream in kit v1.2.9 — CalendarViewProps now carries onSelectDay/onSelectEvent/onSelectItem. Not yet adopted: web/components/record-calendar.tsx is 452 lines backing three screens (tasks, meetings, sprints), a bounded rebuild but not a same-sitting one. The gap moved from the library to here; UI-GAPS.md #22 records the update.",
  "components/spreadsheet":
    "rate cards and time logs (web/components/internal-rate-card.tsx, time-panel.tsx) are list-based with edits through a separate dialog, exactly the \"hours, invoices\" content the kit's own header names — but adopting it means re-architecting a working dialog-based edit flow into inline cell-editing, not a swap.",
  "components/matrix":
    "work-logs-panel.tsx deliberately renders hours by week/person/kind as three independent 1D bar charts, each failing on its own when it has nothing to say — no two-dimensional record×period cross-tab exists for this to replace.",
  "components/swimlane":
    "no two-axis grouping (a status column further split by a second axis like assignee) exists anywhere in the app — story and sprint state is shown one dimension at a time.",
  "components/timeline":
    "the app's only history surfaces are the vertical ActivityFeed (already adopted) and Chart-based burndown/line charts — nothing draws a horizontal dated-event spine.",
  "components/agenda":
    "record-calendar.tsx already hand-rolls its own day-by-day agenda mode instead of importing this part — the same deferred-adoption story as calendar-view, since Agenda is a thin wrapper over CalendarView's own agenda view.",
  "components/split":
    "architecturally inconsistent on purpose: the app's convention is a list screen navigating to a full-page deep-link detail (web/components/deep-link-screen.tsx); a persistent, non-URL-addressable two-pane master-detail contradicts that by design, not by oversight.",
  "components/queue":
    "the ticket triage tab (web/components/tickets-collection.tsx) is a plain filtered list with per-row Edit/Reply/Open buttons — not a one-record-at-a-time decide/skip sitting.",
  "components/chat":
    "no human-to-human messaging feature exists — the app's two thread UIs (the AI assistant, ticket conversations) are both already-adopted, different kit parts (agent-chat, ticket-thread) solving a different problem.",
  "components/tiles":
    "the home screen (web/components/screens/home-screen.tsx) uses PulseBand/StatGrid small KPI cards plus a links list — not a big-number wall-screen tile grid.",
  "components/map":
    "no lat/lng, address-mapping, or map integration exists anywhere in web/, web-portal/, or shared/web/.",
  "components/compare":
    "no 2-4 record side-by-side comparison screen exists anywhere in the app.",
  "components/flowdetail":
    "a fundamental mismatch: process steps are editable in this app (web/components/process/steps-panel.tsx has onEditStep/canEdit), and flowdetail's click-a-step panel is read-only by design — the app already adopted plain Flowchart directly instead (web/components/process-flowchart.tsx).",
  "components/copilot-overlay":
    "documented and deliberate: web/components/agent-host.tsx names copilot-overlay in its own comment, explaining that only the launcher's PLACEMENT was reused (it has to clear the phone's bottom nav bar, which the kit's own corner-pinned launcher does not account for) — the panel was rebuilt because agent-panel.tsx needs RunSteps and citation pills the kit's overlay does not model.",
  "components/detail-view":
    "a documented architecture choice, not an oversight: UI-CONVENTIONS.md §2b rules that bespoke `*-detail.tsx` screens are host-composed from TabsView + ActivityFeed + DescriptionList + Card precisely because each carries a control the screen engine (and this generic template) has no block for.",
}

/** R39 — the reviewed exceptions. A file here imports a UI package directly
 * because the kit does not expose what it needs. Each is a GAP IN THE KIT
 * stated out loud, not a preference: the fix is upstream, and when it lands the
 * pin goes red because the import is gone. */
export const UI_PACKAGE_EXEMPT: Record<string, string> = {
  "shared/web/screen-engine/screen-renderer.tsx":
    "ScreenLayer draws a dialog in four presentations — responsive (bottom sheet on a phone, centred card on a desktop), overlay, sheet and fullscreen — and the kit exposes neither: its DialogContent is centred only and its Sheet takes a fixed `side`. Radix is the kit's OWN dependency and this uses the very primitive the kit's Dialog and Sheet are built on, so the two can never disagree about behaviour — but it is still the app deciding a shape. UPSTREAM FIX: a `presentation` prop on the kit's DialogContent. Delete this line the day it ships.",
}

/** R33 — the copy TABLES: a file that declares words as data and reads them back
 * through `t` somewhere else, so the position where they are WRITTEN is not the
 * position where they are translated.
 *
 * They are not a loophole, they are the same ruling `translateRecipe` makes and
 * says out loud: the English stays where a developer typed it, because English
 * is the catalogue's KEY (shared/i18n.ts); a test and a team override still read
 * the English; and the translation happens once, at the one place the data
 * passes through, instead of at every declaration. What makes it safe to say
 * "not here" is `via` — the call that does the reading, which must still exist
 * in the source, or the pin goes red and somebody has to look.
 *
 * Keyed by file, narrowed by KIND, so a pin bought for a nav registry does not
 * also excuse a raw toast in the same file. Rot-checked in both directions: a
 * file with no unwrapped position of a pinned kind fails, and so does a `via`
 * string that no longer appears anywhere in the two front doors. The list can
 * only shrink. */
export const TRANSLATED_WHERE_READ: Record<
  string,
  { kinds: ("property" | "field-label" | "jsx-text" | "jsx-child" | "attribute" | "toast")[]; via: string[]; why: string }
> = {
  "shared/web/screen-engine/config.ts": {
    kinds: ["property"],
    via: ["t(config.emptyText)"],
    why: "The screen engine's collection defaults — `emptyText: \"Nothing here yet.\"` — are module-level DATA (the same shape as a field config: `t` is a hook and a default object is a constant), and the one place the sentence reaches a screen is CollectionFrame's empty state, which reads it through `t(config.emptyText)`. Declared English, translated on the way to the screen — the ruling R33's own law text makes for field configs, applied to the collection config the engine inherited when the old library moved app-side.",
  },
  "shared/scale.ts": {
    kinds: ["property"],
    via: ["t(step.label)"],
    why: "The three size steps are ONE table read three ways — the column's allow-list, the door's fallback and the picker — so the label sits beside the value it belongs to rather than in a component. `shared/web/scale-section.tsx` renders `{t(step.label)}`, which is the same ruling `translateRecipe` makes: declare the English where the data lives, ask for the translation on the way to the screen. It only became visible to this check when the walk stopped being a folder list and became the front doors' import closure — the file is one directory outside `shared/web/`, which is exactly the staleness a folder list cannot avoid.",
  },
  "shared/brand.ts": {
    kinds: ["property"],
    via: ["brand.description"],
    why: "NOT TRANSLATED, and it cannot be — said plainly rather than dressed as a seam. The one sentence here reaches a person only through `shared/web/pwa.ts`, as the PWA manifest description and a `<meta name=\"description\">`, both of which Next writes ONCE at build time with no reader and no language to ask about. Every other position in this file is a colour, a URL or a name. Pinned rather than exempted from the walk, because the day somebody renders this sentence inside the app it should be caught, and a pin is the thing a reader trips over.",
  },
  "web/lib/screens.ts": {
    kinds: ["property", "field-label"],
    via: ["translateRecipe", "translateFields"],
    why: "THE recipe store, and the original of this whole pattern. A recipe is data in a module with no React in it, it is also what a team OVERRIDES and what the rule scans read, and both of those want the English. `resolveRecipe` puts every rendered recipe through `translateRecipe` on the way to the screen — one function instead of two hundred call sites, and a recipe written next month is translated the day it is written.",
  },
  "web/lib/pages.ts": {
    kinds: ["property"],
    via: ["t(i.title)", "t(s.title)"],
    why: "the nav registry: one source for the app's destinations, their slugs and the permission each needs. The shell and the section rail each read `title` through `t` as they draw the link, which is also the only place a destination becomes words rather than routing.",
  },
  "web/lib/collection-sorts.ts": {
    kinds: ["property"],
    via: ["translatedSorts"],
    why: "the sort vocabulary per collection, beside the `value` each label belongs to — and the value is a DOOR PARAMETER, so the two must stay in one object. `translatedSorts(key, t)` is the one read.",
  },
  "web/lib/collection-filters.ts": {
    kinds: ["property"],
    via: ["translatedFacets"],
    why: "the same, for filter facets: each label sits beside the `field` and `value` the door parses, which are names of data and are never translated. `translatedFacets(key, t, rows)` is the one read.",
  },
  "web/components/tasks-screen.tsx": {
    kinds: ["field-label", "property"],
    via: ["translateFields(columns, t)", "t(tab.label)"],
    why: "a screen that composes its OWN table columns and its own six-tab strip. The columns are spread onto the recipe after `resolveRecipe` has run, so `translateRecipe` never sees them — `translateFields` is that same rule called at the place they are spread in; the tab labels are read through `t` where the strip is built.",
  },
  "web/components/meetings-screen.tsx": {
    kinds: ["field-label"],
    via: ["translateFields(ALL_COLUMNS, t)"],
    why: "the meetings All view, host-composed for the same reason and translated through the same one call.",
  },
  "web/components/google-connections.tsx": {
    kinds: ["property"],
    via: ["t(SERVICE_COPY[service].label)", "t(SERVICE_COPY[service].scope)"],
    why: "`SERVICE_COPY` — each Google service's name and the sentence saying WHAT CONNECTING IT LETS US SEE. It is keyed by the service the caller is drawing, so the words are looked up rather than written at the point of use, and all three reads go through `t`. The privacy sentence in particular is the one a person most needs in their own language.",
  },
  "web/components/google-scope-dialog.tsx": {
    kinds: ["property"],
    via: ["t(m.title)", "t(m.description)", "t(EVENT_KINDS[kind].title)"],
    why: "`MODES` and `EVENT_KINDS` — two closed vocabularies. MODES is keyed by SERVICE on purpose: the same two answers mean opposite things on the two connections (Gmail's 'only' takes mail away; Calendar's can hand more over, because kwapso reads only the primary calendar today), so the sentences cannot be shared and the table is what keeps them apart. EVENT_KINDS' `value` is Google's own event-type word, passed straight to events.list, so the table is a translation of an API constant and never a mapping. Every half is read through `t` in the same file.",
  },
  "web/components/google-source-dialog.tsx": {
    kinds: ["property"],
    via: ["t(k.title)", "t(s.description)"],
    why: "`SHELVES` and `KINDS` — two closed vocabularies whose `value` is a database column value and whose `title`/`description` are the words offered beside it. Both halves are read through `t` in the same file. (The FIELD configs in this file are not pinned: they are positional, through `shared/web/field.tsx`.)",
  },
  "web/components/internal-record-dialog.tsx": {
    kinds: ["property"],
    via: ["label: f.label", "t(f.placeholder)"],
    why: "one form for three record kinds, each supplying its FIELDS as data (`brandAssetFields`, `deliverableFields`, `purposeFields`). The label reaches the screen through this file's `<Field config={{ ...defaultFieldConfig, label: f.label }}>`, which is the translating seam; the placeholder is put through `t` beside it.",
  },
  "web-portal/components/ticket-row.tsx": {
    kinds: ["property"],
    via: ["t(status.label)"],
    why: "`STATUS_WORDS` — the client's words for each ticket status, keyed by the status the row holds (SCOPE ch.06). The key is our vocabulary and the label is theirs; the row reads it through `t`.",
  },
  "web-portal/components/portal-shell.tsx": {
    kinds: ["property"],
    via: ["{t(label)}"],
    why: "the portal's four destinations, as data beside the href and the icon each belongs to. The bottom bar reads every label through `t` as it draws the link.",
  },
}
/** R34 — WORDS THE APP MAY NOT SAY, and the glossary term each one competes with.
 *
 * `term` is a key of `GLOSSARY` (shared/glossary.ts), checked, so a synonym can
 * never outlive the word it was banned in favour of.
 *
 * THE BAR FOR A LINE HERE IS HIGH, and it is the whole reason this list is
 * usable. A word goes on it only when, in THIS app, it can mean nothing but the
 * record it is standing in for. That rules out most of what a careless writer
 * reaches for, and the exclusions are as considered as the entries:
 *
 *   • "client" is NOT here, and it is the most tempting one. `Account` is the
 *     RECORD, but "client" is the relationship — "no client login can reach it",
 *     "what clients have asked us for" — and it is the word the agency uses out
 *     loud. Banning it would flag twenty-six good sentences to catch one bad
 *     placeholder.
 *   • "option" is not here either, because the glossary's OWN definition of
 *     Dropdown values is "the options behind your team's dropdowns". A rule that
 *     contradicts the dictionary it enforces is a rule people learn to exempt.
 *   • "permission" (singular) is allowed and "permissions" is not: "you don't
 *     have permission to open that" is plain English about an act, while
 *     "Permissions" as a heading is a second name for Access rights.
 *   • "request" is not here. It means a ticket on five screens and an HTTP call
 *     or a unit of the assistant's allowance on three others, and no word list
 *     can tell those apart. That one needs eyes.
 *
 * Matched WHOLE and case-insensitively, exactly as written — no automatic
 * plural, so both forms are listed when both are wrong. Explicit data beats a
 * clever matcher that surprises somebody at midnight. */
export const GLOSSARY_SYNONYMS: { word: string; term: string; why: string }[] = [
  // ── Words the app was actually saying on 18 Aug 2026 ──────────────────────
  { word: "teammate", term: "member", why: "a person on your team is a Member — the word the Members screen, the invite and the role are all named after" },
  { word: "teammates", term: "member", why: "the plural of the above" },
  { word: "permissions", term: "permission", why: "the Roles screen headed a matrix \"Permissions\" while two other screens called the same thing an access right. The singular stays free: \"you don't have permission to\" is a sentence about an act, not a name for a record" },
  { word: "portal login", term: "portalAccess", why: "Portal access is the thing an admin grants and takes away; \"Portal login\" reads as the credential, which is not what the switch does" },
  { word: "cost card", term: "internalRate", why: "there are two rate cards in this product and neither is called a cost card — what our own hour costs us is the Internal rate, and what a client is charged is the Rate card (R24 keeps them apart in the code for the same reason)" },
  { word: "diary", term: "meeting", why: "a conversation we have had or are about to have is a Meeting — the screen, the module and the glossary are all named after it; the same word was also standing in for Google's own calendar, a second and different thing this product only ever reads" },
  // ── …and the ones nobody has written yet, which is the cheaper half ───────
  { word: "user", term: "member", why: "the standard SaaS word for the person this app calls a Member. It has never appeared in either front door and this is what keeps it that way" },
  { word: "users", term: "member", why: "the plural of the above" },
  { word: "customer", term: "account", why: "an Account is a company or a person you work with, prospect or client; \"customer\" narrows it to the ones who are paying and quietly excludes the rest" },
  { word: "customers", term: "account", why: "the plural of the above" },
  { word: "timesheet", term: "workLog", why: "a Work log is one row of time; \"timesheet\" names a weekly form this product does not have" },
  { word: "time entry", term: "workLog", why: "the same record under a second name" },
  { word: "work item", term: "story", why: "one piece of work we do is a Story. \"Work item\" is the word that would blur it back together with a Task and a To-do, which SCOPE ch.02 keeps apart on purpose" },
  { word: "helpdesk", term: "ticket", why: "what a client asks us for lives in Tickets; naming the module after the industry's word for it would put a third word beside Ticket and Conversation" },
  { word: "help desk", term: "ticket", why: "the spaced spelling of the above" },
  { word: "knowledge article", term: "source", why: "one piece of material in the knowledge base is a Source — a note, or something the app keeps in step. \"Article\" says somebody wrote it, which is true of about half of them" },
  { word: "subtask", term: "task", why: "a Task has no children in this product, and a word for a thing that does not exist is a promise on screen" },
  { word: "sub-task", term: "task", why: "the hyphenated spelling of the above" },
]

/** R33 — the sentences that keep a banned word, and why. Rot-checked in both
 * directions: an entry naming a sentence the app no longer says goes red, and so
 * does one whose sentence no longer contains the word it was excused for. An
 * exemption that has stopped being needed is a record of an argument nobody is
 * having any more.
 *
 * EMPTY IS THE RIGHT ANSWER TODAY, and it is worth saying why rather than
 * deleting the table. The five words the app really was saying were changed
 * rather than excused, because each was a straight swap for the term the
 * dictionary already had. The table exists for the case that is not — a sentence
 * where the banned word is genuinely the right one — and it costs a line of
 * prose to use, which is the correct price. */
export const GLOSSARY_SYNONYM_OK: Record<string, string> = {}

/** R31 — the radii admitted BESIDE `rounded-xl` and `rounded-full`, and why each
 * one earns a third number.
 *
 * The two-radius law is right about the thing it was written against: five
 * spellings of one pixel value are five decisions where there is one. It is not
 * right that two numbers can draw everything, and the kwapso design kit says so
 * outright — ruling 03 admits exactly two exceptions, "a bar is not a box", and
 * the kit's own specimen page calls the first of them "the ONE named exception
 * to the two-radius law: 6px. Nothing else may."
 *
 * So the vocabulary grows by data rather than by drift, in the shape R32 uses
 * for colour literals: one entry, one reason, and a rot check that turns the
 * build red when an entry stops describing anything. The list can only shrink,
 * and a third box radius is still forbidden — these are not box radii.
 *
 * WHY THE KIT'S SECOND EXCEPTION IS NOT HERE YET. It names 4px for a bar, a heat
 * cell or a rotated decision node. Nothing in either app draws one today, so an
 * entry for it would be an exception with no use — precisely what the ratchet
 * exists to catch. It gets added by the commit that needs it, which is the only
 * moment anyone can check the reason is true. */
export const RADIUS_EXCEPTION: Record<string, string> = {
  "rounded-select":
    "6px, on the mark of a selection control — the checkbox. It is the one place a third number is unavoidable rather than convenient: at `rounded-xl` a 16px checkbox is a lozenge, and at `rounded-full` it is a radio button, so the two-radius vocabulary cannot express 'a square box with softened corners' at this size. Fixed at 0.375rem rather than derived from `--radius`, because it is not a smaller box — it is a different shape doing a different job.",
}

/** THE VENDORED COMPONENT LIBRARY — the one directory in `shared/` that is not
 * this team's own screen code, and the laws whose SCOPE that changes.
 *
 * `shared/ui/` is Swift Struck UI v0.15.0, copied into this repo on 2026-08-22
 * and now owned by it (`shared/ui/README.md` says why, and says that upstream is
 * never edited from here). Nothing about the CODE changed in that move — it is
 * still a generic component library, consumed through props — but it moved from
 * `node_modules/` into a folder three laws scan, so three laws had to say which
 * side of the line it sits on. Saying nothing was not an option: the build went
 * red the moment the files landed, and the two honest answers were "hold it to
 * the law" and "say why it is out of scope". Both were taken, one each.
 *
 * HELD TO THE LAW, no exemption: R32 (closed palette). The library named a
 * Tailwind ramp in exactly one file — `container.tsx`, four `neutral-*` classes
 * — and that is the same fault R32 exists to catch, in a component neither door
 * renders. It was FIXED rather than excused, so R32 keeps its full reach into
 * `shared/ui/` and this table has no entry for it. That is the shape to prefer:
 * an exemption is the answer only when the alternative is worse.
 *
 * OUT OF SCOPE, with a reason: the one below. It is rot-checked by its own
 * law's test — if `shared/ui/` stops offending, the entry must be deleted — so
 * this table can only shrink.
 *
 * IT HELD TWO, AND THE RATCHET TOOK ONE BACK. `two-radii` was excused here on
 * 2026-08-22 because the library still wrote `rounded-sm/md/lg/2xl` at about
 * sixty sites, and collapsing them was a decision about SHAPE that belonged
 * with the kit's four radii in front of it rather than with the commit that
 * moved some files. When that stage landed the same day, the check went red
 * naming the entry, and the entry went with the commit that earned it. That is
 * the mechanism working exactly once, in public, which is the only evidence
 * worth having that it works at all. */
export const VENDORED_UI = "shared/ui/"

export const VENDORED_UI_SCOPE: Record<string, string> = {
  "two-radii":
    "R31 polices the RADIUS VOCABULARY of screens this team writes. The kit has the same law in its own book — `shared/ui/docs/RULES.md` §4.2, which forbids the Tailwind step names outright and is stricter than R31 was until 2026-08-27 — and its own gate to run it under. Scanning the vendored copy produces UNACTIONABLE red: the hand-edit guard forbids fixing it here, so the only honest response to a hit is a message upstream, which is a review comment wearing a build failure's clothes. This is the position CLAUDE.md already takes on lint for the same directory and the same reason: 'its own repo lints it; linting a vendored copy we may not edit would only produce unactionable red.' Earned at v1.2.0, when `compositions/screens/settings.tsx` arrived writing `rounded-full` twice — a real breach of the KIT's §4.2, reported upstream, and not ours to fix.",
  "closed-palette":
    "R32's subject is the same: a colour a SCREEN THIS TEAM WROTE names literally instead of resolving through a token. The kit's §2.2 says the same thing in its own book. And the first hit after vendoring v1.2.0 shows why the scan is worse than useless here rather than merely noisy — `compositions/screens/settings.tsx` holds nine hexes on purpose, because it draws a PREVIEW of the light and dark themes, and a swatch of what dark mode looks like must not flip when you are in dark mode. That is the one shape of literal a token cannot express, it is correct, and it would have to be pinned in `PALETTE_LITERAL_OK` forever with somebody else's reasoning copied into our law book.",
  "catalogued-strings":
    "R28 already had a reasoned position on this code and it has not changed — only the code's address has. `resolveImport` refused a bare `@kwapso/ui/...` specifier with the words 'somebody else's code and is not ours to translate', so the library's strings were never in the catalogue and never translated. They are component DEFAULTS: the app says its own words through the props it already translates (`emptyText`, `placeholder`, `label`, `empty`), and R28's subject is what the two front doors SAY. Vendoring must not silently reverse that, because the reversal is expensive in the one direction nobody would notice — the ~150 library strings would enter the catalogue in English, and the only thing that turns an English key into German is `scripts/i18n-translate.mjs`, which spends the owner's Anthropic key. So the walk stops at this directory by PATH now that it can no longer stop by package name. THE RESIDUE IS REAL DEBT AND IS NOT PRETENDED AWAY: a handful of these strings are screen-reader labels the app cannot override from a prop ('Close' on Dialog and Sheet, 'Loading' on Spinner, 'Toggle theme' on ModeToggle), and a blind reader who chose German hears them in English. They are written up in NEEDS-A-SPEC.md rather than left for somebody to rediscover.",
}

/** R32 — the files that may hold a colour LITERAL, and why. Everything else in
 * the two front doors and `shared/` resolves through a token. Rot-checked: an
 * entry whose file no longer holds one turns the build red. */
export const PALETTE_LITERAL_OK: Record<string, string> = {
  "shared/brand.ts":
    "the branding seam itself. It is where a fork of this base changes the palette, so it is the one file whose job is to hold the values the rest of the app resolves.",
  "shared/workers/email-template.ts":
    "an email. No CSS variable survives a mail client, so every colour in a message has to travel as a literal — and it is not a screen, so no theme reaches it anyway.",
  "shared/web/pwa.ts":
    "the OS-level theme colour, read by the browser chrome and the app switcher before any stylesheet exists.",
  "shared/web/splash.ts":
    "the launch screen, painted by the OS from a manifest before the app has loaded.",
  "shared/web/google-sign-in.tsx":
    "Google's own mark, whose colours are theirs and are specified by their brand terms.",
  "web/lib/image.ts":
    "a canvas fill. It is drawn into a bitmap, and a canvas has no cascade to read a variable out of.",
}

/** R29 — the ONE page container per front door, and the width it is allowed to set.
 * Everything else that matches the page-container signature is either in
 * SCREEN_WIDTH_EXEMPT below or is a breach. */
export const PAGE_WIDTH_OWNER: Record<string, string> = {
  "web/components/deep-link-screen.tsx": "max-w-[1600px]",
  // The portal's cap is NARROWER on purpose and it is a locked decision
  // (UI-RULEBOOK L5, "Do not do" #15): a client reads a handful of screens on a
  // phone, and 768px with larger type is the right measure for that. Three lines
  // in the one file (the header, the main region and the bottom nav) so all three
  // align to the same edge.
  "web-portal/components/portal-shell.tsx": "max-w-3xl",
}

/** R29 — reviewed exceptions. A file listed here matches the page-container
 * signature and is allowed to, WITH ITS REASON. Rot-checked in both directions:
 * an entry whose file no longer sets a width fails the build, so a screen that
 * gets fixed cannot leave its pin behind.
 *
 * The ratchet CLOSED on 18 Aug 2026. Six screens were pinned here as a work list
 * rather than as an approval (plan W1); the boot loader deleted `app-shell.tsx`'s
 * pin when it rewrote the skeleton, and the rearrangement lane deleted the other
 * five by widening Home, Settings, Profile, Invitations and Kwapso to the shell's
 * own container. What survives is one entry that is not a page at all, which is
 * what this list was always meant to hold. */
export const SCREEN_WIDTH_EXEMPT: Record<string, string> = {
  "web/components/install-prompt.tsx":
    "not a page. It is the install nudge's Sheet content, which is centred and full-width INSIDE the sheet, and a sheet is an overlay with its own measure.",
}

/** R13 — reviewed exemptions: modules that are deliberately NOT import targets,
 * each with its reason. Every other module must have a TargetDef in the catalog. */
export const CATALOG_EXEMPT: Record<string, string> = {
  teams: "team metadata is created by the team factory (one row per team), never imported",
  team_members: "membership arrives through invites (an identity flow) — a CSV cannot consent for a person",
  help: "tickets are conversations raised in-app; importing them would forge authorship and timelines",
  screens: "screen recipes are app furniture (config), not team data",
  agent: "the assistant's threads/usage are system records, not importable content",
  contacts:
    "not a table — the module is a SWITCH over rows the `accounts` target already imports. A company and a person are one row shape (SCOPE ch.03), so a file of people is a file of accounts with the Type column set to person, and the link between a person and a company is set on the account afterwards for the same reason the parent pointer is: a file's own rows cannot be resolved to ids until the file has been written. Giving this module a second import target would be two ways to load one table, and the second one would be the one nobody keeps in step.",
  portal_users:
    "a login is a granted identity, not importable content — a CSV cannot consent for a person (the same reason team_members is exempt)",
  all_tasks:
    "not a table — the module is a SWITCH over whose tasks a list answers about (4.9). The rows themselves are `tasks`, which the work engine's own target already imports; giving this module a second target would be two ways to load one table, and the second one would be the one nobody keeps in step. The same shape as `contacts`, one spine along.",
  knowledge:
    "a source is either TYPED here — and indexed in the same call, because the owner asked for instant syncing, which costs one embedding per chunk — or MIRRORED from a row the app already owns and kept in step by the sweep. A CSV would be a third way in with the first one's cost and neither one's upkeep: the importer writes row by row through the module's own gated create door, so a 5,000-row file would be 5,000 chunkings and 5,000 model calls inside one request, against a €50/month ceiling. The in-rule answer to 'we have a spreadsheet of process notes' is to point the sweep at where they already live, or to import them into the module they belong to and let the mirror do it.",
  processes:
    "a process map's numbers are AGREED estimates — a time a client and a staff member settled together, in front of each other, about the client's own work. Every savings figure in the app is a subtraction of two of them, so a CSV would import estimates nobody agreed and produce figures nobody can defend, which is the exact failure this module exists to prevent. A map is authored a step at a time, with the person whose work it describes.",
  todos:
    "a to-do is a REQUEST WE MAKE OF A CLIENT, and raising one emails them. It is one of only two things in the whole product that reaches a client's inbox (BUILD-1 §7), and an import is the one shape of write that produces hundreds at once — a spreadsheet of forty rows would be forty emails into somebody's morning, from our own verified sender, before anybody had read the file back. The write it would replace is a title and a date typed while you are already talking to them. Stories ARE importable, for the opposite reason: nothing about a story leaves the building.",
  staff_profiles:
    "both tables here name a PERSON — by their member id, which is the one thing a spreadsheet cannot supply. A CSV column of names or email addresses would have to be resolved to members, and resolving it wrongly files somebody's personality profile, or somebody's qualification, against the wrong colleague. That is the same reason team_members is exempt, arriving from the other direction: a file cannot say who somebody is. A profile is written on the member's own page, where the question never comes up.",
  google:
    "a connection is a CAPABILITY, not a record: the row is worthless without the refresh token inside it, and that token can only be minted by a person standing at Google's own consent screen and saying yes. A CSV of connections would either import rows that authorise nothing, or — if it carried tokens — be a spreadsheet of other people's mailboxes travelling through an upload form. The named folders and spaces are exempt for the second reason team_members is: each one has to be a folder THAT PERSON can actually open, and a file of ids nobody checked would either fail at Google or, worse, quietly share the wrong thing under a familiar name.",
  google_mail:
    "not a table at all — the module exists to carry ONE switch on the permission sheet (may kwapso send mail as you). There is nothing to import into a right; it is granted on the Roles screen, one role at a time, by somebody who understands what they are granting.",
  deliverables:
    "a deliverable is MATERIAL — a file we hold or a link we do not — and a CSV can carry the link but never the file, so a file of them would import half the shelf as titles pointing at nothing. And the row that matters cannot be resolved from a spreadsheet at all: a deliverable hangs off exactly one APP, which is an id here and a name in a file, and `apps` is not an import target (it belongs to `processes`, exempt above for its own reason), so there is nothing for a reference to resolve against and every row would have to be re-filed by hand — which is the entire write. The legacy set is EIGHT rows across twenty-eight apps (glide/RECONCILIATION.md), typed in the afternoon somebody decides to. The write an import would replace is: you finish a handover, and you attach it, once, standing on the app it belongs to.",
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
  "workers/content/src/lib/help-attachments.ts": {
    fence: "attachmentFence",
    why: "the files and links on a ticket (CHECKLIST 5.10), and the fence is the TICKET's fence one table along — `attachmentFence` wraps `ticketFence` as a subquery so it rides the same WHERE as the rows AND the count, exactly as `threadFence` does for a reply. It has to be here rather than merely be safe by accident: an attachment is the one thing on a ticket a CLIENT uploads, so it is the one place where the rows a caller may read and the rows a caller may write are being decided about the same table from two directions.",
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
    why: "what an account is CHARGED per hour. The rate-card DOOR refuses a client login outright — it answers with every account's card, the retired lines and the audit block naming who set the price — but the value door reads this file to PROJECT the live lines for one account, and only when that account's price visibility is switched on. So the same fence the accounts list carries rides these statements too: a client login can only ever be shown their own company's rates. What our own hour COSTS us is a different table in a different file, and no client-reachable path touches it (R24).",
  },
  "workers/tenancy/src/lib/work-engine.ts": {
    fence: null,
    why: "it returns no rows — two aggregate SUMs (what has been sold to one account, and how many seconds we have logged against it) over the work engine's own tables, for an account id the CALLER has already resolved through the fence before calling. A SUM discloses no record, and the one figure a client may be shown from it (what they bought) is projected by the value door behind their own account's price-visibility switch. The seconds half never reaches a client at all: it is only meaningful once an internal rate is applied to it, which happens in a file no portal-reachable path may import.",
  },
  "workers/tenancy/src/lib/processes.ts": {
    fence: "accountScopeClause",
    why: "the whole App → Process → Step chain, and the value drilled through it. Every table here carries `account_id` so the fence is the SAME clause the accounts list uses, with no join to forget — and every exported reader takes the caller's AccountScope, which the burglar suite (workers/tenancy/test/account-leak.test.ts) then tries the handle of. A map names how a client's own people work; another client's map is as far out of bounds as their account row.",
  },
  "workers/content/src/lib/deliverables-client.ts": {
    fence: "accountScopeClause",
    why: "what we handed over, as the CLIENT sees it. A file of its own, holding nothing else: the staff readers live in `deliverables.ts` and are reachable from no portal door, because this list is keyed by FILE and the one time it described a file rather than a function (`help.ts`) the leak was one function along. Two fences ride one clause here and neither is optional — `accountScopeClause` on the account the write copied off the app, AND `visible_to_client_at IS NOT NULL`, the owner's 18 Aug 2026 ruling that a deliverable is the client's only once somebody marks it so. A row on the right account that nobody shared is as absent as one belonging to somebody else, and the COUNT is taken over the same clause so the heading cannot advertise material the list withholds.",
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
  "POST /api/auth/language": {
    fence: null,
    why: "writes ONE column on the caller's own global user row — which language they read kwapso in — reached through no id but their session's, exactly as the profile door above. There is no account in the question at all: a language is a fact about a reader, not about a company, so there is no fence for it to resolve and nothing another account could learn from it. The value it accepts is one of four the code declares (shared/i18n.ts), so the body cannot carry a surprise either.",
  },
  "POST /api/auth/logout": {
    fence: null,
    why: "ends the caller's own session; there is no record to be fenced from.",
  },

  // ── showing us what they mean, and saying yes ──────────────────────────────
  "POST /api/content/help/attachments": {
    fence: "callerScope",
    why: "a client attaches the screenshot of the thing that is wrong (CHECKLIST 5.10). The ticket is resolved through `getTicket` under the caller's own scope BEFORE a byte is stored — bytes in a bucket cannot be un-put — and a miss answers 404 rather than 403, so 'not yours' never confirms the ticket exists. The file lands under a ULID key in the shared media bucket, which is a capability URL: unguessable, and the fence is what decides who is ever told it.",
  },
  "POST /api/content/help/attachments/remove": {
    fence: "callerScope",
    why: "the same door in reverse, and the same resolution first. Deactivate-never-delete: the row keeps its audit block and the object stays in the bucket, so taking a file off is reversible in the only sense that matters — nothing is destroyed.",
  },
  "POST /api/content/help/validate": {
    fence: "callerScope",
    why: "THE ONE LIFECYCLE DOOR A CLIENT MAY PUSH (CHECKLIST 5.13, Aurora's ap2), and the deliberate exception to this module's every-other-status-move-refuses-a-portal-caller rule. It is narrow by CONSTRUCTION rather than by a condition somebody could invert: the account fence rides the UPDATE, so it can only reach a ticket their own company raised, and R17's predicate is `status = 'awaiting_validation'`, so the only transition in it is into `new`. It cannot reopen, cannot resolve, and moves zero rows against a request somebody here has already started.",
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
  process_drafts: {
    fence: null,
    why: "a proposal is our own working — what a call suggested and what a person accepted or threw away. The client sees the map that resulted, never the eleven things a model guessed at. Every draft door refuses a portal caller outright; this is the second lock.",
  },
  waves: {
    fence: null,
    why: "a wave is what a client BOUGHT, and its history is our own selling and planning of it — who added which sprint, when the dates moved, what we switched off. The client sees the wave's name and its dates on their portal, which is the part that is theirs; the sentences about how it got that way are ours. Every wave door refuses a portal caller outright for the same reason (the module is `work`), so this fence is the second lock rather than the first.",
  },
  app_modules: { fence: null, why: "who renamed a section of their app, and when, is our record of our own work — the client picks the module on a ticket and never needs the history of how it got its name" },
  process_versions: { fence: null, why: "a cut names the staff member who cut it and the sprint it came from — the client sees the version and its date" },
  process_steps: { fence: null, why: "a step's history is our record of changing THEIR agreed number; the current number, and the saving from it, is what the portal shows" },
  process_comments: { fence: null, why: "the conversation itself is fenced and readable; its history would name the staff author of every line, which the ticket thread already withholds" },
  // THE CLIENT'S OWN ORGANISATION — departments, roles and tools. `null`, for
  // the same reason as the six above and one of its own.
  //
  // The ROWS are theirs and the portal shows them (the owner ticked all four in
  // round two: departments, the people against each role, their tools and what
  // those cost). Their HISTORY is our record of OUR work on their company, and
  // every line of it names a staff member — "Ana added the role Dispatch clerk",
  // "Ana switched a tool off" — which is exactly the sentence SCOPE ch.06 says
  // the portal never shows, and which the owner said again himself on 24 Aug
  // 2026: "Never show our staff names to the customer! We are all kwapso."
  //
  // The one of its own: a role's history carries WHAT AN HOUR COSTS THEM, and
  // those costs sit side by side across a company. Alaap's ruling on the rate
  // being visible turned on precisely that — "everybody who is a stakeholder
  // from the client side can see all the costs. They could just get to know each
  // other's salary… so it's not advisable." A feed of rate changes is that
  // disclosure with a timeline attached.
  client_departments: { fence: null, why: "our record of shaping their org chart — every line names the staff member who typed it, and the departments themselves are readable in the portal" },
  client_roles: { fence: null, why: "a role's history carries what an hour costs them, and those costs sit side by side across one company: a stakeholder reading the feed learns their colleagues' rates. The role and its people are shown; the trail of who set which number is not" },
  client_tools: { fence: null, why: "a tool's price history is our working note about their spend — the tool and its current price are shown, the record of us revising it is ours" },
  // WHAT WE HANDED OVER. `null` — and THE DAY THIS LINE ANTICIPATED HAS COME, so
  // it is worth saying what changed and what did not.
  //
  // It used to lean on the module's own doors: every deliverables handler opened
  // with refusePortalCaller, so a client reached no row here to have a history
  // of. That is no longer true. On 18 August 2026 the owner opened the shelf —
  // "the deliverables are for them! but only once we mark it as visible" — and a
  // client can now read their own company's SHARED rows through
  // `GET /api/content/portal/deliverables`.
  //
  // The old note ended: "If the shelf is ever opened to the portal, the ROWS are
  // the decision; this line is a separate one and stays `null` unless somebody
  // argues it down." Nobody has. The ROWS being theirs was never the argument for
  // showing them our record of CHANGING those rows: a history line reads "Ana
  // handed over the dispatch walkthrough" and then "Ana archived it", which names
  // the staff member doing the work (SCOPE ch.06) and shows the client us
  // changing our minds about what we gave them. Opening the shelf made this line
  // load-bearing rather than moot, which is a reason to keep it, not to soften it.
  deliverables: { fence: null, why: "a deliverable's history names the staff who filed, corrected, shared and archived it — the client is shown the material itself, which is the part that is theirs, and never our record of changing it (SCOPE ch.06). The rows ARE now reachable by a client login (the portal shelf, account-fenced and shared-only), which is what makes this line real rather than moot: `null` here is the difference between handing somebody a document and handing them our file about deciding to" },
  account_rates: { fence: null, why: "who set a client's price, and what it was before — the agency's own commercial record, even about their own rate" },
  internal_rates: { fence: null, why: "what our own hour costs. The one figure SCOPE says a client must never see under any flag, ever — its history least of all (R24)" },
  internal_role_rates: { fence: null, why: "what an hour of a ROLE is worth — the second internal rate card, and the number an app's money figure is computed from. The same ruling as the line above it, for the same reason: a client may not see what we think an hour of anybody's time costs, and a history line saying we re-priced it is the same disclosure spread over time (R24)" },

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
  // THE AGENCY'S OWN HOUSEKEEPING — four tables, one answer, and they are the
  // EASIEST entries in this table rather than the hardest. Everywhere else here
  // the question is genuinely difficult ("the rows are theirs but the history
  // names us"). Not here: the ROWS are not theirs either. A client login cannot
  // reach a single door on any of these three modules (every handler opens with
  // refusePortalCaller), so `null` is not a withholding — it is the same
  // sentence the door already said, repeated where the feed can hear it.
  brand_assets: { fence: null, why: "the agency's own brand material and who changed it — a client sees the work, never our library" },
  meeting_purposes: { fence: null, why: "why the agency meets and which department owns it — a description of our own organisation" },
  staff_profiles: { fence: null, why: "what a colleague is like and what they are bad at. The sharpest case of agency-only material in the app, and its HISTORY names both the subject and the person who wrote it down" },
  staff_certificates: { fence: null, why: "what our people are qualified in, and when a qualification was corrected — the agency's own credential register" },

  // MEETINGS. `null`, and it is the same sentence the module's doors already
  // speak: every meetings handler opens with refusePortalCaller, because the
  // NOTES are our record of a conversation — written for us, often ABOUT the
  // client rather than for them ("they are unhappy with the dispatch screen and
  // hinted at the renewal"). A history feed would say who wrote them and when
  // they were changed, which is a sharper disclosure than the meeting itself.
  meetings: { fence: null, why: "a meeting's history names the staff who arranged it and rewrote its notes — and the notes are the agency's own record of a conversation, often about the client rather than for them. A client login reaches no door on this module at all (every handler opens with refusePortalCaller), so silence here is the door's own sentence repeated where the feed can hear it" },

  // GOOGLE. `null` twice, and neither is a hard call: a client login cannot
  // reach a single door on this module (every handler opens with
  // refusePortalCaller — the clients get no assistant and no Google surface at
  // all), so silence here is the door's own sentence repeated where the feed can
  // hear it. The history is also the sharpest disclosure in the build if it ever
  // leaked: it names a colleague's own Google address, which folders of the
  // agency's Drive they opened to the assistant, and every time we sent mail or
  // booked something as them.
  google_connections: { fence: null, why: "a staff member's own Google account, and every act kwapso performed as them — whose mailbox, whose calendar, and when. Agency material about an agency person; a client has no door on it and no business in its history" },
  google_sources: { fence: null, why: "which of our own Drive folders and Chat spaces somebody opened to the assistant. Naming them would describe the shape of the agency's internal filing to an outsider, which is the same disclosure the knowledge base's own history is withheld for" },
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
  // What an hour of a ROLE costs (8.13). The same module as the two rate cards
  // it sits beside: `commercials` is the right that decides whether a person may
  // see money at all, and a role's price is money about us.
  internal_role_rates: "commercials",
  help: "help",
  selectable_data: "selectable_data",
  member_roles: "member_roles",
  users: "team_members",
  invite_logs: "team_members",
  accounts: "accounts",
  // WHO IS LINKED TO WHOM is the contacts module's own history, not the
  // account's. A role that may see a client but not its address book must not
  // read "Ana linked Marta to Bergman" out of the feed either — the sentence
  // names the person the right exists to withhold.
  account_links: "contacts",
  portal_users: "portal_users",
  knowledge_sources: "knowledge",
  // The map and the money. Five tables gate on `processes` because they are one
  // record from a reader's point of view — an app with maps inside it — and two
  // on `commercials`, which is the module a client login never holds.
  apps: "processes",
  // A MODULE is part of the app record, so it is read by whoever may read the
  // app — the same right, because "what sections does their system have" and
  // "what systems do they have" are one question asked at two depths.
  app_modules: "processes",
  processes: "processes",
  process_versions: "processes",
  process_steps: "processes",
  process_comments: "processes",
  // A PROPOSAL ABOUT A MAP is read by whoever may read the map. "Ana had a call
  // read for Bergman invoice approval: 11 steps proposed, none applied" is a
  // sentence about the process, and a role that may not see the process must not
  // read it out of the feed either.
  process_drafts: "processes",
  // THE CLIENT'S OWN ORGANISATION — who does the work, and what they use to do
  // it. Same module as the map, because that is the only reason any of it
  // exists: a role carries an hourly cost so a step's minutes can become money,
  // and a tool carries a price so a step that replaces it can be subtracted. A
  // person who may read a client's process map is exactly the person who may
  // read "Ana added the role Dispatch clerk" — the sentence is about the map.
  //
  // THE COST ITSELF IS A DIFFERENT QUESTION and is answered elsewhere: what an
  // hour costs the CLIENT is theirs and rides with the map; what an hour costs
  // US is `internal_rates` above, on `commercials`, which a client login never
  // holds (R24).
  // A WAVE is the package a client's sprints were sold inside — the same record
  // from a reader's point of view, so the same module. A client login holds
  // neither.
  waves: "work",
  client_departments: "processes",
  client_roles: "processes",
  client_tools: "processes",
  // WHAT WE HANDED OVER on an app. Its OWN module and not `processes`, which is
  // the whole point of it being a module: "Ana handed over the Payroll API
  // reference" names a deliverable, and a role that may read the app but not its
  // handover shelf must not read that sentence out of the feed either.
  deliverables: "deliverables",
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
  // A meeting gates on its OWN module — see shared/team-modules.ts for why the
  // notes are the thing being permissioned, and why `delivery` (the taxonomy of
  // why we meet) is not the same question.
  meetings: "meetings",
  // THE AGENCY'S OWN HOUSEKEEPING. Four tables, three modules — grouped the way
  // a reader meets them: two gate on `staff_profiles` because a person's profile
  // and their certificates are one record from the member page's point of view.
  brand_assets: "brand_assets",
  meeting_purposes: "delivery",
  staff_profiles: "staff_profiles",
  staff_certificates: "staff_profiles",
  // GOOGLE. Both tables gate on `google` — one connection and the folders and
  // spaces under it are one record from a reader's point of view, exactly as an
  // app and its maps are. The ACT module (google_mail) owns no table: it is a
  // switch, and what it permits is written into the connection's own history, so
  // a person reading "kwapso sent mail as Ana" needs the same right that lets
  // them see Ana has a connection at all.
  google_connections: "google",
  google_sources: "google",
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
  {
    lib: string
    fn: string
    routes: string
    rowsKey: string
    webKey: string
    listRecipe?: string
    /** WHERE PAGE TWO IS REACHED — the component holding THIS collection's own
     * `<LoadMore>`, relative to `web/`, and the string that must appear inside
     * that control's own props.
     *
     * Per-ENTRY because the check over it used to be per-BRANCH, and one branch
     * stood for three collections. It keyed on `!c.listRecipe`, which is true of
     * `recordActivity`, `activity` AND `workLogs`, and then asserted a
     * `<LoadMore listKey={activity.listKey}>` inside `activity-panel.tsx` — the
     * record feed's control, and nothing whatever to do with the team feed or the
     * work-log list. For those two the conjunct was a CONSTANT: deleting their
     * pagers outright left the build green, where the older, weaker-looking
     * sentence it replaced had gone red.
     *
     * `pagerKey` is usually the same string as `webKey`. On the record feed it is
     * not — that control reads `listKey={activity.listKey}`, a value the hook
     * hands it — and that difference is the reason this is named here rather than
     * inferred: the two halves of that pairing live in two files by construction,
     * so each has to be pointed at. */
    pagerFile: string
    pagerKey: string
    why: string
  }
> = {
  help: {
    lib: "workers/content/src/lib/help.ts",
    fn: "listTickets",
    routes: "workers/content/src/routes/help.ts",
    rowsKey: "tickets",
    listRecipe: "tickets.list",
    webKey: "helpKey(",
    pagerFile: "components/tickets-collection.tsx",
    pagerKey: "helpKey(",
    why: "tickets accumulate forever — a team that has raised 3,000 must still reach the oldest",
  },
  knowledge: {
    lib: "workers/content/src/lib/knowledge.ts",
    fn: "listSources",
    routes: "workers/content/src/routes/knowledge.ts",
    rowsKey: "sources",
    listRecipe: "knowledge.list",
    webKey: "knowledgeKey(",
    pagerFile: "components/deep-link/collection-content.tsx",
    pagerKey: "knowledgeKey(",
    why: "one source per ticket, per article, per account, plus every note anybody writes — the agency's own history is thousands of rows on day one and the sweep only ever adds",
  },
  accounts: {
    lib: "workers/tenancy/src/lib/accounts.ts",
    fn: "listAccounts",
    routes: "workers/tenancy/src/routes/accounts.ts",
    rowsKey: "accounts",
    listRecipe: "accounts.list",
    webKey: "accountsKey(",
    pagerFile: "components/deep-link/collection-content.tsx",
    pagerKey: "accountsKey(",
    why: "every company AND every person an agency works with is a row here — a contact list that only grows, so a ceiling would eventually become a refusal to answer",
  },
  activity: {
    lib: "workers/tenancy/src/lib/activity-read.ts",
    fn: "getActivity",
    routes: "workers/tenancy/src/routes/team.ts",
    rowsKey: "activity",
    webKey: "activity:team:",
    pagerFile: "components/deep-link/module-content.tsx",
    pagerKey: "activity:team:",
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
    pagerFile: "components/activity-panel.tsx",
    pagerKey: "activity.listKey",
    why: "one record's slice of the same ever-growing feed — a long-running ticket outgrows a page on its own",
  },
  processes: {
    lib: "workers/tenancy/src/lib/processes.ts",
    fn: "listProcesses",
    routes: "workers/tenancy/src/routes/processes.ts",
    rowsKey: "processes",
    listRecipe: "processes.list",
    webKey: "processesKey(",
    pagerFile: "components/processes-screen.tsx",
    pagerKey: "processesKey(",
    why: "every app of every client grows maps, and every map is kept rather than replaced — a process is archived, never deleted, because the savings computed from its baseline have to stay checkable years later. An agency two years in has more of these than it has clients, and the oldest is the one a client is most likely to ask about",
  },
  workLogs: {
    lib: "workers/content/src/lib/work-logs.ts",
    fn: "listWorkLogs",
    routes: "workers/content/src/routes/work-logs.ts",
    rowsKey: "logs",
    webKey: "workLogsKey(",
    pagerFile: "components/time-panel.tsx",
    pagerKey: "workLogsKey(",
    why: "the fastest-growing row in the work engine — 2,940 arrived from two years of the previous system and the rate only goes up, because every piece of work produces several. A ceiling here would eventually be a refusal to show somebody their own week",
  },
  meetings: {
    lib: "workers/content/src/lib/meetings.ts",
    fn: "listMeetings",
    routes: "workers/content/src/routes/meetings.ts",
    rowsKey: "meetings",
    listRecipe: "meetings.list",
    webKey: "meetingsKey(",
    pagerFile: "components/meetings-screen.tsx",
    pagerKey: "meetingsKey(",
    why: "an EVENT, which is the shape this law names first: a meeting happens, is written up and is never curated away, because a cancelled call in March is still the answer to 'didn't we speak in March?'. Glide's own two years are 350 rows before this app has held a single conversation of its own, and the oldest is the one somebody digs for",
  },
  todos: {
    lib: "workers/content/src/lib/todos.ts",
    fn: "listTodos",
    routes: "workers/content/src/routes/todos.ts",
    rowsKey: "todos",
    webKey: "todosKey(",
    pagerFile: "components/work-panels.tsx",
    pagerKey: "todosListKey(",
    why: "a to-do SHRINKS as fast as it grows while it is open, which is why this collection was capped for a year — and the moment the DONE pile is visible it stops being true, because a completed to-do is kept for ever. It has to be visible: `completeTodo` writes `file_url` and `completed_at` in the SAME UPDATE, so a to-do carries the document a client sent us if and ONLY if it is completed, and the open-only default meant the only rows that could hold a client's file were exactly the rows nobody could see, on either front door. NOT one list with both piles in it: the two views sort by different columns (due date ascending; completed descending), so each is its own ordering with its own cursor signature, and a cursor minted under one is refused by the other rather than silently skipping rows at the page boundary",
  },
  stories: {
    lib: "workers/content/src/lib/stories.ts",
    fn: "listStories",
    routes: "workers/content/src/routes/stories.ts",
    rowsKey: "stories",
    listRecipe: "stories.list",
    webKey: "storiesKey(",
    pagerFile: "components/stories-screen.tsx",
    pagerKey: "storiesKey(",
    why: "one piece of work per thing we do, kept forever — the two years arriving from Glide are 3,677 rows on day one, and a done story is never deleted because the savings and the margin computed from it have to stay checkable. SPRINTS are deliberately NOT here beside it: a sprint is a block of SOLD work, so that collection grows at the speed of contracts rather than of clicks and a hard ceiling is an honest answer",
  },
}

export const DEAF_EXEMPT: Record<string, string> = {
  help_threads:
    "a reply pings the parent help row too (op edit), whose deps now name the open conversation itself (`help-thread:<id>` + its total, web/lib/live-resources.ts) and whose portal listener drops the `portal:thread:` slice — so the thread updates live through the parent's ping, and this resource's own ping (whose id is the REPLY, which no cache is keyed by) stays deaf on purpose",
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

/** R2 / R8 — the components under `web/components` that are NOT record details,
 * though the census in `web/test/rules.test.ts` would otherwise read them as one.
 * Key = the file's basename, value = the reason, mandatory.
 *
 * THIS USED TO BE THE OTHER LIST. Until 18 Aug 2026 the registry held
 * `RECORD_DETAIL_COMPONENTS`, an INCLUSION list of the bespoke record details,
 * and R2 and R8 walked exactly the screens somebody had remembered to type into
 * it. That is a hole by construction, and it opened twice: `app-detail` and
 * `process-detail` were added on 17 Aug after a tester found faults on screens no
 * law had ever walked, and on 18 Aug `sprint-detail` and `story-detail` turned
 * out to have been missing the whole time — two record details with tabs and an
 * Activity panel that R2 and R8 had never once read, under a green build. Both
 * times the screen was correct-looking and the LAW was absent, which is the
 * failure that leaves no trace.
 *
 * So the census is DERIVED from the code now, exactly as R8 already derives which
 * collection a badge describes, and this list is the small reasoned residue that a
 * derivation always needs. It is a RATCHET like `RAW_BODY_EXEMPT`: an entry naming
 * a file the census would not have caught anyway turns the build red, so it can
 * only ever shrink.
 *
 * Empty today. Nothing under `web/components` is named `*-detail.tsx` or renders an
 * `<ActivityPanel>` without being a record detail — and the per-screen reasoning
 * that used to live in the old list has not been lost with it: every one of those
 * components opens with its own comment saying why it is host-composed rather than
 * a recipe, which is where a reader looks for it. */
export const RECORD_DETAIL_NOT: Record<string, string> = {}

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
  "selectable-detail.overview":
    "one dropdown value's own fields — its group, its word, whether it is active, whether it is one of the defaults, and the four enrichments (emoji, German label, description, standard days). One record, not a collection. It is the R2 MINIMUM on purpose: a dropdown value has no collection hanging off it at all, so Overview + Activity is the whole record and the second tab is the only one that can carry a number.",
  "help-detail.overview": "one ticket's type, source and audit block — one record, not a collection.",
  "account-detail.overview":
    "one company's own fields — its reference, its industry, its postal address, its language, where it sits, and the paragraph about it. One record, not a collection. Every collection tab beside it — contacts, children, apps, sprints, to-dos, rates, activity — carries a server count.",
  "account-detail.organisation":
    "THREE collections on one tab — the client's departments, their roles and their tools — so there is no single number a badge could carry. R16 badges ONE collection's exact count, and a total across three would be an arithmetic nobody asked for: 'this client has 11 things' answers no question. Each list carries its own heading, and a role row carries its own department and holder chips, which is where the counting actually happens. The tab exists at all because a role is what turns a process map's minutes into money — see the panel's own note.",
  "account-detail.impact":
    "what this client's apps have given back: the hours, their step-by-step derivation, and the same hours in money. It is one ARITHMETIC, not a set of rows — the steps under it are the workings of a single figure, so a count on the tab would number the sum's terms rather than anything a person asked for. It sat at the bottom of Overview until 19 Aug 2026, under the cover, eight fields and the About, which is where the headline number of the whole product had been living.",
  "account-detail.knowledge":
    "the knowledge base asked IN CONTEXT (12.1): a question box that already knows which client it is about, and the passages that answer it. Retrieval, not a collection — there is no set of rows to count.",
  "contact-detail.overview":
    "one person's own fields (their company, how to reach them, where they are, their language, their reference) — one record, not a collection. Its five collection tabs — companies, to-dos, tickets, meetings, portal login, activity — each carry a server count.",
  "knowledge-detail.source":
    "the source's own text — the exact words the assistant reads out of it, plus where they came from. One record's body, not a collection. (How many searchable pieces that text became is a FIELD on the Overview, not a tab: the pieces are derived from the text on this same panel, so a tab over them would be the same thing twice.)",
  // The agency's own housekeeping. Four engine-recipe details, each leading with
  // a `description` block of the record's own fields — so there is no collection
  // on the Overview tab to count, and its sibling Activity tab carries the exact
  // server total like every other record in the app.
  "brand.detail.overview": "one asset's category, description, file and audit block — one record, not a collection.",
  "purposes.detail.overview": "one meeting purpose's department, description and audit block — one record, not a collection.",
  "task-detail.overview":
    "one task's status, who has it, when it is due and the note under it — one record, not a collection. Its two sibling tabs, work logs and activity, each carry the exact server total like every other record in the app.",
  "meeting-detail.overview":
    "one meeting's client, purpose, when and where, and its audit block — one record, not a collection. Its sibling Activity tab carries the exact server total like every other record in the app.",
  "meeting-detail.notes":
    "the agenda we set and the notes we took — the two pieces of prose this module exists to keep. One record's body, not a collection.",
  // PINNED 18 Aug 2026, and the way it surfaced is the point. The tab's own
  // comment in meeting-detail.tsx says "the rule caught this rather than a
  // reviewer" — and the rule had never read the tab at all. R8's bespoke scan
  // allows 300 characters between a tab's `value:` and its `badge:`, and those six
  // lines of comment are longer than that, so the match simply did not happen. The
  // reasoning was written down in the one place no law reads. It is here now, and
  // the census strips comments before it matches so the window measures code.
  "meeting-detail.calendar":
    "the guest list mirrored from the calendar entry, which the calendar read CAPS — so its length is a ceiling, not a count (R16), and an invitation with sixty people on it would badge fifty. The tab lists them, and a list you can see the end of does not need a number on it. Shown only when the meeting is in a calendar at all.",
  "knowledge-detail.overview":
    "one source's kind, compartment, who may read it, how many pieces it was cut into and when it was last indexed — one record, not a collection.",
  // TWO VIEWS OF ONE COLLECTION, not two collections. The Steps tab already
  // carries the exact server count of the version on screen (`shownStepCount`),
  // and R16's whole sentence is "exactly once" — badging the switch would print
  // the same number twice on one screen, three lines apart, which is the fault
  // that law was written about rather than a way of obeying it.
  "process-detail.list":
    "the LIST view of a process's steps. It is a view switch inside the Steps tab, not a collection tab: the count belongs to the tab above it and is already shown there, and a number on both would be R16's own failure case (the same total, twice, on one screen).",
  "wave-detail.overview":
    "one package's own fields — whose it is, what it covers, when it runs, and how many sprints are in it. One record, not a collection. Its two sibling tabs, sprints and activity, each carry the exact server total. The dates on it are DERIVED from the sprints and stored, so they are a fact about the record rather than a count of anything.",
  "process-detail.flow":
    "the PICTURE of the same steps, drawn as a flowchart — the forks, the joins and the ways back that a list cannot show. Same collection, same count, same reason as `process-detail.list`: the Steps tab above already carries the exact server total for the version being shown, and repeating it on a view switch would number the same rows twice. It writes nothing, so there is not even a second thing to count.",
  "process-detail.compare":
    "the same steps beside ANOTHER version's, which is a subtraction rather than a collection. A count here would answer 'how many rows are in this comparison', which is not a question anybody asks of a before-and-after. Renamed from `process-detail.map` on 24 Aug 2026 when the switch grew a third view and the old word stopped saying which one it meant.",
  "app-detail.overview":
    "one system's own fields — whose it is, its stage, the four paragraphs of context, the four prose fields and the address, and its address. One record, not a collection. Its five collection tabs (sprints, stories, process maps, meetings, tickets) and its activity tab each carry a server count.",
  "app-detail.impact":
    "the hours this app gives back every month and what they are worth at the rate of the role that used to spend them (8.13). An arithmetic over the app's process maps, drilled process by process — the lines are the sum's own working, not a collection of records, and a badge over them would be counting the number of terms in an addition.",
  "app-detail.knowledge":
    "the knowledge base asked IN CONTEXT (8.9): a question box that already knows which system it is about, and the passages that answer it. Retrieval, not a collection — there is no set of rows to count, and a badge over it would be counting the whole base.",
  "process-detail.overview":
    "the map's own description — including the caveat saying whether its times have been agreed yet — plus its app, its current version, its baseline and its audit block. One record, not a collection. Its four siblings each carry a server count, and the Steps badge counts the VERSION being shown rather than always the current one.",
  // THE WORK ENGINE'S TWO RECORDS, pinned on 18 Aug 2026 — the day the census
  // stopped being a hand-kept list and read the code instead. Both screens had
  // carried tabs and an Activity panel since they were written, and neither R2 nor
  // R8 had ever walked either of them: they were simply not in the old
  // RECORD_DETAIL_COMPONENTS array. Nothing was wrong on the screens; the law was
  // absent, which is the failure that shows no colour at all.
  "sprint-detail.overview":
    "one block of sold work — what kind it is, when it runs, what it was sold for, and how much of the work inside it is done. One record, not a collection. Its two sibling tabs, stories and activity, each carry the exact server total.",
  "story-detail.overview":
    "one piece of work's own fields — its status, its kind, its reference, who has it, when the sprint it was sold inside is due, and the three pieces of prose somebody typed (the detail, what was done, what the client will be told). One record, not a collection. Its two sibling tabs, work logs and activity, each carry the exact server total.",
}

/** R4 — the form dialogs that MUST use FormShell. */
export const FORM_DIALOGS = [
  "help-form-dialog",
  "role-form-dialog",
  "invite-dialog",
  "team-edit-dialog",
  "selectable-form-dialog",
  "account-form-dialog",
  "contact-link-dialog",
  // portal-access-dialog left this list on 26 Aug 2026: superseded by
  // PortalAccessPanel (account-detail-panels.tsx) in the panel pivot and then
  // sat unmounted for weeks — a finished 121-line dialog no screen opened.
  "knowledge-form-dialog",
  // The third way into the knowledge base. Its draft is the interesting one:
  // what it persists is the TITLE and the FILING, never the file — a File cannot
  // go into session storage, and a form that pretended otherwise would silently
  // save a source with nothing behind it.
  "knowledge-upload-dialog",
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
  // The agency's own housekeeping. The staff-profile form is the one that most
  // needs its draft kept: it is the longest form in the app and the hardest to
  // retype, because its answers are a conversation somebody had with a colleague
  // rather than facts they can look up again.
  // ONE dialog for the four internal RECORD kinds (a post, a brand asset, a
  // programme, a meeting purpose). They are the same form with different labels
  // — a name, a vocabulary field, some prose — so four files would be four
  // copies of one draft rule, one submit path and one busy state to keep in
  // step. The two staff forms are separate because they are genuinely different
  // shapes: one is about a person, the other about a piece of paper.
  "internal-record-dialog",
  "staff-profile-dialog",
  "certificate-form-dialog",
  // Naming a Drive folder or a Chat space for the assistant. Short, but it is
  // the form that asks the question the whole module turns on — private, or the
  // team's? — so it gets the same shell and the same kept draft as every other:
  // a half-typed answer to "who may read this" must not be lost to a mis-tap and
  // re-guessed.
  "google-source-dialog",
  // THE MONEY. One rate form serving both cards — what an account is charged and
  // what our own hour costs us — because it is a label and a number and knows
  // nothing else: no door, no table, no audience. The two CARDS are two files
  // calling two door sets, which is where R24's separation actually lives (see
  // the header of rate-form-dialog.tsx for what would make sharing it wrong).
  "rate-form-dialog",
  // Writing a reply into somebody's own Gmail. It gets the draft rule for the
  // plainest reason of all: what is typed into it is a letter to a client, and
  // pressing its second button sends that letter out of the building.
  "mail-reply-dialog",
  // Arranging a meeting. Its draft matters for the same reason the time form's
  // does: the agenda is typed while somebody is still on the phone agreeing it,
  // and a mis-tap that loses it loses a conversation rather than a field.
  "meeting-form-dialog",
  // The agency's own details, on the Kwapso page. A separate dialog from
  // team-edit and the difference is the audience rather than the fields: one is
  // what the app calls itself in the rail, the other is what the company is
  // called on an invoice. Its draft earns its keep the way the staff profile's
  // does — a registered address and a pair of tax numbers are copied out of
  // somewhere else, and losing them to a mis-tap means going and finding them
  // again.
  "legal-details-dialog",
] as const

/** R29 — THE EMAIL CENSUS. Every message this product sends a person, and the one
 * question the owner asked about each of them: does it refer to a specific record?
 *
 * Keyed `<repo-relative file>::<function>`, and the KEYS ARE DERIVED, not typed:
 * `web/test/linked-emails.test.ts` finds every function in `workers/` that composes
 * a branded message and demands a line here for each. Add an email, the build goes
 * red until it is classified; delete one, the orphan entry goes red too.
 *
 * `refersToRecord: true` means the email is ABOUT something with a screen, so it
 * carries a button to it — built through shared/workers/record-link.ts, which
 * decides WHICH FRONT DOOR from the recipient. `link` names the destination for a
 * reader; the check reads the code, never this sentence.
 *
 * `false` is a real answer and it is written down, because "this one didn't need a
 * button" is exactly the sentence that gets said about the one that did. Four of
 * the five refusals here are refusals ON PURPOSE: a link a person cannot open, or
 * must not be taught to click, is worse than no link at all. */
export type EmailClassification =
  | { refersToRecord: true; link: string }
  | { refersToRecord: false; why: string }

export const EMAIL_CENSUS: Record<string, EmailClassification> = {
  /* ── auth: identity. Nothing here names a record, and nothing here gets a link ── */
  "workers/auth/src/lib/email.ts::sendLoginCode": {
    refersToRecord: false,
    why: "a six-digit code refers to the sign-in attempt in front of the person reading it and to nothing else — there is no record to open. It is also the one email that must NEVER carry a button: a sign-in mail with a link in it is the exact shape of the phishing mail people are told to watch for, and teaching our own users to click one is a security cost with no product gain.",
  },
  "workers/auth/src/lib/email.ts::sendEmailChangeCode": {
    refersToRecord: false,
    why: "the same code, for a different proof, sent TO AN ADDRESS NOBODY HAS CONFIRMED YET. It names no record; and until the code comes back, the recipient is a stranger who typed an address into a form, which is not somebody to send a link into the app to.",
  },
  "workers/auth/src/lib/email.ts::sendEmailChangedNotice": {
    refersToRecord: false,
    why: "a security notice to the OLD address, sent precisely because the person reading it may be the one who did NOT make the change. Their account is not a record with a screen, and a link into an app that address can no longer sign in to is a dead end — the action it asks for is to contact us, which is the one thing a button here could not do.",
  },

  /* ── tenancy: membership, invites, and the estate's own plumbing ── */
  "workers/tenancy/src/lib/invites.ts::createInvite": {
    refersToRecord: true,
    link: "invite → the in-app invites inbox (agency; the portal has none, and an invite is how a portal login comes into being in the first place)",
  },
  "workers/tenancy/src/lib/notify.ts::notifyRoleChanged": {
    refersToRecord: true,
    link: "member → their own membership in the team, for a STAFF recipient. A client login gets no button: the portal has no members screen, so the only link that could exist for them is an agency URL",
  },
  "workers/tenancy/src/lib/notify.ts::notifyRemoved": {
    refersToRecord: false,
    why: "it names a membership that has just been deactivated. Every link this base could build points at a screen the team they were removed from no longer lets them open, so a button would be a promise the app itself refuses one click later. The mail already names the only thing they can act on: ask an admin.",
  },
  "workers/tenancy/src/lib/notify.ts::notifyInviteRevoked": {
    refersToRecord: false,
    why: "the invite it names has been withdrawn, so the invites inbox the invite email points at would show them nothing. 'No action is needed' is the whole message, and a button under it would suggest otherwise.",
  },
  "workers/tenancy/src/lib/portal-welcome.ts::sendPortalWelcome": {
    refersToRecord: true,
    link: "portalHome → the client portal's own home, for a CLIENT recipient. It is the only email tenancy sends to somebody outside the agency, and the one destination in the map that is not a record: what it is about is the portal itself. The agency column is deliberately null — a colleague has no portal to be welcomed to, and a link to one would advertise a door they may not pass (R21). Opt-in at the moment of the grant, so what goes out is the agency's decision and not the software's.",
  },
  "workers/tenancy/src/lib/sharding.ts::alertNewAlarms": {
    refersToRecord: false,
    why: "a database crossing 80% is an operational record with no screen on EITHER front door — it lives in the core database's db_growth table, which no app screen reads. Its real destination is the runbook, which the footnote names (OPERATIONS.md, Growth watch), and inventing an admin screen to have somewhere to point at would be building a product out of an email.",
  },

  /* ── content: the work itself, and the two emails a client ever receives ── */
  "workers/content/src/lib/notify.ts::notifyReplyAndMentions": {
    refersToRecord: true,
    link: "ticket → the ticket that was replied to, at the RECIPIENT's own front door (one send reaches staff and clients at once)",
  },
  "workers/content/src/lib/notify.ts::notifyTodoRaised": {
    refersToRecord: true,
    link: "todo → the portal home, where to-dos sit ('Waiting on you'). The portal has no to-do detail screen and one is not invented here",
  },
  "workers/content/src/lib/notify.ts::sendTriageDigest": {
    refersToRecord: true,
    link: "ticketList → the team's Tickets list (agency). It is about many records, so it points at the list they are all in — and it is staff-only, which is what makes an agency URL the right one",
  },
  "workers/content/src/lib/notify.ts::notifyTicketResolved": {
    refersToRecord: true,
    link: "ticket → the answered ticket, in the client's portal",
  },
}

/** R40 — EVERY DOOR THAT STORES BYTES, AND WHERE A PERSON MEETS THEM AGAIN.
 *
 * The DATA half of `reachable-bytes`, and deliberately the smaller half. What a
 * machine cannot infer is the MAPPING — that the bytes `todos.ts` puts in the
 * bucket are the thing a person opens off `Todo.fileUrl` in `work-panels.tsx`.
 * Everything else is derived: the write census is read off disk against the
 * bucket bindings the wrangler configs declare, and whether `shownIn` actually
 * renders `field` is read off disk too. So an entry can lie about neither end.
 *
 * `writtenIn` is a repo-relative path that must still contain a byte-write.
 * `field` is `Type.property` — the property is what the render scan looks for.
 * `shownIn` is the front-door file that puts it in front of somebody.
 *
 * A DOOR MAY NEED TWO LINES. `staff.ts` is a generic upload endpoint: it stores
 * bytes and hands the URL back in its response, and the CALLER decides which
 * field it lands on. Two destinations, two lines, one write site — which is why
 * the census asks that every write site be CLAIMED rather than matched one-to-one. */
export const STORED_FILES: {
  writtenIn: string
  field: string
  shownIn: string
  why: string
}[] = [
  {
    writtenIn: "workers/auth/src/lib/profile.ts",
    field: "SessionUser.imageUrl",
    shownIn: "web/components/profile-menu.tsx",
    why: "a member's own photo, on the avatar in the rail they see on every screen",
  },
  {
    writtenIn: "workers/tenancy/src/lib/teams.ts",
    field: "TeamSummary.logoUrl",
    shownIn: "web/components/team-switcher.tsx",
    why: "the team's own logo, on the switcher at the top of the rail",
  },
  {
    writtenIn: "workers/tenancy/src/routes/accounts.ts",
    field: "Account.logoUrl",
    shownIn: "web/components/account-detail.tsx",
    why: "a client's mark, leading their record",
  },
  {
    writtenIn: "workers/tenancy/src/routes/accounts.ts",
    field: "Account.coverUrl",
    shownIn: "web/components/account-detail.tsx",
    why: "the wide image their record leads with — a second field on the same door",
  },
  {
    writtenIn: "workers/tenancy/src/routes/processes.ts",
    field: "AppRow.logoUrl",
    shownIn: "web/components/app-tiles.tsx",
    why: "a system's mark, on every tile and every row that names it. The door is called `processes` because that is the permission module; the record it writes is an APP",
  },
  {
    writtenIn: "workers/content/src/routes/help.ts",
    field: "HelpAttachment.url",
    shownIn: "web/components/help-attachments.tsx",
    why: "what somebody attached to a ticket, on the ticket's Files and links tab",
  },
  {
    writtenIn: "workers/content/src/routes/stories.ts",
    field: "StoryAttachment.url",
    shownIn: "web/components/story-attachments.tsx",
    why: "what a story shows for itself. Unrendered anywhere until 96ea8fe1 — the second of the three breaches this law exists for",
  },
  {
    writtenIn: "workers/content/src/routes/todos.ts",
    field: "Todo.fileUrl",
    shownIn: "web/components/work-panels.tsx",
    why: "the document a client sent back through the portal. Shown as an unclickable filename until this law landed — the worst of the three, because a person outside the company was on one end of it",
  },
  {
    writtenIn: "workers/content/src/routes/todos.ts",
    field: "Task.fileUrl",
    shownIn: "web/components/task-detail.tsx",
    why: "the photo of the letter on a piece of our own admin. Write-only from the day the door shipped — the third breach. Same file as the to-do above because one route module owns both doors",
  },
  {
    writtenIn: "workers/content/src/routes/knowledge.ts",
    field: "KnowledgeItem.fileUrl",
    shownIn: "web/components/knowledge-detail.tsx",
    why: "the material behind a source, on the source's own screen",
  },
  {
    writtenIn: "workers/content/src/routes/staff.ts",
    field: "StaffProfile.photoUrl",
    shownIn: "web/components/staff-panel.tsx",
    why: "a colleague's face on their profile. The door is a generic upload endpoint and this is one of the two fields its answer lands on",
  },
  {
    writtenIn: "workers/content/src/routes/staff.ts",
    field: "StaffCertificate.fileUrl",
    shownIn: "web/components/staff-panel.tsx",
    why: "the certificate itself, behind its title. The second destination of the same upload endpoint",
  },
  {
    writtenIn: "workers/content/src/routes/brand-assets.ts",
    field: "BrandAsset.fileUrl",
    shownIn: "web/components/deep-link/shape.tsx",
    why: "a logo or a typeface on the agency's own brand shelf, drawn as the row's mark by the screen recipe",
  },
  {
    writtenIn: "workers/content/src/routes/deliverables.ts",
    field: "Deliverable.url",
    shownIn: "web/components/deliverables-panel.tsx",
    why: "what we handed over on an app, opened from the app's own shelf",
  },
]

/** R45 — every one of the 47 files under `shared/ui/compositions/` that this app
 * does not directly import, with why. Full reasoning for each lives in
 * COMPOSITION-MISMATCHES.md; this is the rot-checked pointer the build reads.
 * Four shapes of reason, and the sentence says which:
 *   · MISMATCH — a genuine structural disagreement, checked against the file's
 *     own required props and documented behaviour, not just its name.
 *   · REALIZED DIFFERENTLY — this app already does the identical job, either by
 *     composing other already-adopted kit parts under other names, or natively —
 *     importing this exact file would duplicate working code, not add to it.
 *   · GAP — the app has nothing serving this job at all; the sentence says
 *     whether that is permanent (a navigation/product model that rules it out)
 *     or a real, unscoped finding.
 *   · OWNER'S CALL — a genuine two-sided question, with a recommendation.
 * Rot-checked both ways: an entry whose file becomes a direct import is stale
 * (delete it), and a direct import with no matching entry and no exemption is a
 * law nobody decided about. */
export const COMPOSITION_EXEMPT: Record<string, string> = {
  "overlays/access-denied.tsx":
    "MISMATCH. The optional `grantor` prop is real (a peer's render probe upstream confirmed `grantor={null}` draws no self-service well), but the composition's non-optional premise — a Dialog laid over the actual requested screen, blurred and scrimmed behind it — has no real call site: the agency's denial (`web/components/deep-link/screen-bits.tsx`'s `NoAccess`) is an inline sentence inside the persistent `AppShell`/`ScreenShell`, with no page-behind to blur and no dialog anywhere in the pattern; the portal's (`web-portal/components/no-access.tsx`) is a total, whole-session denial with literally no screen behind it to render. Neither door has the 'one blocked module inside an otherwise-working app, with a real page still open behind it' scenario this file is built for.",
  "overlays/assistant.tsx":
    "MISMATCH, reasoning corrected 2026-08-29: the composition's own ruling makes it non-modal by default (confirmed by a render probe — `role=\"dialog\"` with no `aria-modal`), while this app's `AgentPanel` is deliberately modal because it live-drives the screen underneath through a 'screen trace' mechanism the kit has no concept of. Letting someone edit the same table the agent is actively manipulating is a real correctness question (whose edit wins), not a styling preference.",
  "overlays/bulk-edit.tsx":
    "OWNER'S CALL. `BulkEditScreen` IS the selection primitive (7 marks + select-all rendered on an open composition, confirmed by render probe) — it is not blocked on anything unbuilt, the way the first read wrongly assumed. What is unresolved is a product question: does any collection in this app want bulk mutation at all. RECOMMENDATION: not yet — no collection today performs a bulk write (every mutation is per-record, gated per-record), and standing up selection UI across 20+ collections for a capability nobody has asked for is the kind of unearned surface area the base's 'stay lean' rule warns against. Revisit if one specific collection (bulk-deactivating stale roles, bulk-tagging tickets) becomes a real, named ask.",
  "overlays/delete-confirmation.tsx":
    "MISMATCH, corrected on a deeper check than the 2026-08-29 pass ran. `DeleteConfirmationDialog`'s `confirmWord={null}` opt-out is real, but `recordNumber` is a REQUIRED prop baked into the title's own sentence assembly ('{verb} {recordNumber} — {recordTitle}?') — a numbered-record vocabulary this app's actual deactivate targets (roles, accounts, members, invites) do not have. And the composition's whole premise is IRREVERSIBLE deletion escalating to a typed-word gate for high-stakes cases; this app's own law is deactivate-never-delete (every one of its confirm dialogts, all hand-built on the kit's plain `AlertDialog`, guards a reversible action with a Reactivate path). `ArchiveConfirmationDialog`, the file's other export, was already confirmed a mismatch for its mandatory reason field and its 'Archived tab' concept this app doesn't have.",
  "overlays/export.tsx":
    "MISMATCH, re-checked by rendering: `columns` is not optional and the whole premise (scope choice + column picker + format choice) has no reduced mode — `ExportScreen` with no `formats`/`columns` still draws the scope radio. This app's actual export is a one-click `<a href>` honouring the current filter querystring server-side, a deliberately simpler shape.",
  "overlays/filter-builder.tsx":
    "MISMATCH, re-checked by rendering: `operators={[]}` still renders two comboboxes per row, same as a real operators list — the AND-chained, add/remove-row interaction model has no escape hatch, and this app's facets are single-valued, closed-vocabulary chips (`shared/web/screen-engine/filter-bar.tsx`) with no analog to a condition row at all.",
  "overlays/import-proposal.tsx":
    "MISMATCH, same root as `overlays/import.tsx` — this app's import is agentic, multi-file, multi-table with dependency ordering and FK resolution (AGENTIC-IMPORT.md); there is no manual per-column mapping UI anywhere to plug a proposal review step into.",
  "overlays/import.tsx":
    "MISMATCH. The five-step wizard (`IMPORT_STEPS`: upload → map → check → run → report) is the composition's entire premise, not a configurable subset — no prop skips the manual per-column mapping step this app's agentic import has no place for. The RUN/REPORT steps' visual shape (a live progress rail, a per-row failure list) is a real reusable primitive worth lifting standalone for this app's own commit step, but that is separate, unscoped work.",
  "overlays/quick-view.tsx":
    "GAP, permanent by current design. The app's real row activation (`shared/web/screen-engine/screen-renderer.tsx:683`) is Enter/Space → navigate straight to the full record, with no peek-without-navigating pattern anywhere. Adopting this means introducing a second, competing way to open a record — a navigation-model change, not a missing screen. Will not need this unless that model itself changes.",
  "screens/brand.tsx":
    "GAP, a real finding. Nobody has built a staff-facing page listing the app's own design tokens (colours, type, marks) for reference — the Brand library (`web/app/brand/`) is a client-asset collection of logos and swatches, a different concept entirely, already correctly adopted via the kit's `gallery`. Worth building only if staff actually ask 'what's our poppy hex' more than never; not urgent enough to justify scope on its own.",
  "screens/company-hub.tsx":
    "MISMATCH. `web/components/account-detail.tsx` already covers this job with a genuinely different anatomy: tabs (Overview/Contacts/work/Rates/Knowledge/Activity), the companies-vs-people split, portal-access rules, `MarginPanel` — none of which the composition's single-page header-figures-lists shape has a slot for.",
  "screens/home.tsx":
    "MISMATCH. The kit's home embeds one live ticket queue inline (`CollectionScreen`, per its own doc, \"a dashboard that cannot be opened into its records is a poster\"); this app's real `/home` (`web/components/screens/home-screen.tsx`) deliberately shows summary figures plus permission-gated link-out cards to six different collections — a different product decision about what a dashboard is for, not a missing prop.",
  "screens/invite-acceptance.tsx":
    "MISMATCH. The composition assumes an unauthenticated person clicking one emailed link, shown one invite, handed to onboarding with no account yet. This app's real flow (`web/components/invitations.tsx`) is the opposite on purpose: sign in first however you like, then see an INBOX of every pending invite for that address — a stated fix for 'I was invited but have no way to see it', not a rendering of the same screen.",
  "screens/link-sent.tsx":
    "MISMATCH. Built entirely around a magic link opened on a possibly different device, with a resend countdown and no code. This app's sign-in (`shared/web/use-email-sign-in.ts`) sends a 6-digit code typed on the same device in the same form — there is no separate device, no link, and no waiting-room screen at all.",
  "screens/not-found.tsx":
    "MISMATCH. `NotFoundScreen` is built for one record missing inside an otherwise-fine collection (its own header states this three times) — a record number chip, a real collection eyebrow/count and the collection's own header actions all stay drawn. This app's `<NotFound />` fires when a URL segment names no module at all, so there is no collection context to put in those slots. `screens/page-failure.tsx` is the composition that matches a real case here instead.",
  "screens/onboarding.tsx":
    "MISMATCH. The kit's 3-step tour (who you are / how it should look / what you work on) has no analog: this app's real onboarding (`web/app/onboarding/page.tsx`) is a deliberately single-step name-and-photo form wired to closed-team-creation business logic (`TEAM_CREATION_CLOSED`, agency-vs-client bootstrap branching) the composition has no concept of.",
  "screens/portal-boot.tsx":
    "MISMATCH. Its 'booting' register is the same static `SignInSplash` this app rejected for `screens/splash.tsx` (see that entry); its 'boot failed' register is the same real condition `screens/page-failure.tsx` already covers, already adopted on the more specific textual match for a whole-page failure.",
  "screens/portal-home.tsx":
    "REALIZED DIFFERENTLY — inherits `templates/portal-home.tsx`'s finding. This file is the route wrapper around that exact template; `web-portal/components/home-screen.tsx` already implements the identical 'savings figure + waiting/delivered' spec natively, so importing either would duplicate rather than add.",
  "screens/portal-impact.tsx":
    "MISMATCH. The kit's `/impact` is a flat progress-bars-plus-savings-figure report; this app's real `/impact` (`web-portal/components/impact-screen.tsx`) is an interactive App → Process → Step drill-down accordion with per-step regression flags, comments and conditional pricing — structure the composition has no slot for.",
  "screens/profile.tsx":
    "MISMATCH. This app's real profile screen (`web/components/screens/profile-screen.tsx`) shows a summary plus an `ActivityFeed` and edits through a separate popup dialog; the composition is an inline full-page required/optional form with its own commit bar — a different editing model, not a missing prop.",
  "screens/session-expired.tsx":
    "GAP, a real unscoped finding — not a permanent exemption. Nothing today persists a signed-out user's identity or a return destination: a 401 clears the session cache and redirects to a bare `/login` with no context (`web/lib/use-active-team.ts`), and there is no redirect-back mechanism anywhere in the login flow to restore to. Worth a scoped brief (identity storage + a redirect-back contract the whole login flow honours) when auth UX gets dedicated attention — real, unstarted plumbing on the one path where a half-built screen locks somebody out of their own account.",
  "screens/settings.tsx":
    "MISMATCH. The kit assumes one Settings screen with six tabs; this app deliberately scattered the same settings across three destinations (a personal profile page, per-team tabs at `/t/<teamId>`, and one flat app-settings page) as a dated, named product decision (`web/components/screens/settings-screen.tsx`'s own comment: 'Your profile' moved off Settings on 17 Aug 2026).",
  "screens/sign-in-portal.tsx":
    "OWNER'S CALL. Everything but one line fits cleanly (the two-step email/code flow, resend countdown, 'Wrong address?' back). The one line: `PortalLoginRoute` states a client portal never shows a social sign-in row, and this app's portal shows Google on purpose per SCOPE ch.06 ('signing in with Google never creates access; the invite does'). RECOMMENDATION: keep the app's Google row — SCOPE ch.06's reasoning is a real, already-shipped security stance, not an oversight, and the kit's law reads as a generic default rather than a considered exception for an invite-gated portal; if this still bothers the owner, the in-rule fix is a documented exception upstream in the kit's own law (the shape RADIUS_EXCEPTION already uses), not silently dropping a working feature.",
  "screens/sign-in.tsx":
    "MISMATCH. `SignInScreen`'s own doc header states its shape as T3A-3: one field, magic link, no code — the same assumption `screens/link-sent.tsx` already fails on, and the opposite of what this app's entire sign-in depends on. Its sibling export `AuthShell` has exactly three consumers in the kit (`link-sent.tsx`, `invite-acceptance.tsx`, `session-expired.tsx`), all three already recorded as a mismatch or an unbuilt gap above, so it has no live route to stand under regardless of its own merits.",
  "screens/splash.tsx":
    "MISMATCH. Both its registers point at `SignInSplash`, a static mark with 'NO ANIMATION... it hands over; it does not fade'. This app's real boot screen (`shared/web/mark-loader.tsx`) is a continuously looping, pre-hydration SVG animation plus a dated, owner-motivated hold-until-complete fix — adopting the static mark would be a visible regression against two documented, deliberate decisions, not a lateral swap.",
  "states/archive.tsx":
    "REALIZED, in substance — not a direct import. Of the composition's three separable laws (a consequence-stating band, quiet-ink archived rows, a Status/Updated → Archived-by/Archived column swap), the first is now a real `band` prop on the shared `CollectionFrame` engine seam, live and shipped on Tickets' Archived tab. The other two need each collection's own column definitions to know it is rendering the archived view — real, deliberately per-collection, unscoped work for the other 19 collections that carry an archive tab, not a batch item.",
  "states/empty-collection.tsx":
    "REALIZED, in substance — not a direct import. The composition's own `emptyBody` register (Headline + Text + Button, no dashed placeholder) is assembled directly in the shared engine's kit-panel branch, live on real collections. The rest of the composition (a figure strip of zero-reading stats, per-tab zero-badges) is not adopted: `CollectionConfig` has no 'figures' or per-tab zero-badge concept, and inventing either is separate, unscoped scope.",
  "states/new-empty-record.tsx":
    "MISMATCH. There is no standalone screen to replace: every record-detail file (`role-detail.tsx`, `sprint-detail.tsx`, `story-detail.tsx`, and others) hand-rolls its own empty-copy into its own `CollectionFrame`/`ShapeStateBody` call. A real equivalent exists, just scattered across as many files as there are record types — not a gap, a different shape.",
  "states/no-results.tsx":
    "MISMATCH, a real but non-urgent one. The composition's register states the exact total count, the single narrowest-excluding facet, and a live would-show-if-cleared number for that one facet — genuinely richer than this app's plain sentence, but the middle claim requires the engine to answer a question it has never had to (re-running row selection per candidate facet, with real unresolved edge cases: ties, a facet excluding every row alone, a search term interacting with a facet). This app's existing 'Clear filters' button already works, so the plain sentence is not a dead end — plain-and-correct beats rich-and-speculative until a dedicated pass builds and tests the computation against real filtered data.",
  "templates/collection-screen.tsx":
    "REALIZED DIFFERENTLY — this file literally renders `MainScreen` internally, so it shares `templates/main-screen.tsx`'s finding: `ScreenShell` wrapping `CollectionFrame` in the exact `tone=\"bare\" inset={false}` shape this app's own engine already reached independently. The one open question the pair raises (a genuinely per-screen header vs. this app's in-body `CollectionHeading`) was decided not pursued — see `templates/main-screen.tsx`.",
  "templates/form-screen.tsx":
    "MISMATCH, on a sharper reason than the layout question. `surface=\"page\"` is confirmed (by render probe) to be a bare div, so the earlier dialog-vs-sheet objection is resolved — the remaining, real blocker is that the composition's actual value over `FormShell` is a required-fields-by-name summary sentence, a 'fields need attention' card and a changed-fields-by-name dirty band, none of which any of `FormShell`'s 32+ callers track today (every one disables Submit on an aggregate boolean, never a list of field names). Lighting that up is a real, scoped feature — instrumenting every field in every form with a name and an empty/dirty state — not a chrome swap behind one flag the way the already-adopted engine states were, because the state those adoptions needed already existed and this one does not.",
  "templates/import-flow.tsx":
    "MISMATCH, same root as the overlays import trio — a manual per-column mapping wizard this app's agentic, multi-table, FK-resolving import (AGENTIC-IMPORT.md) has no place for.",
  "templates/main-screen.tsx":
    "REALIZED DIFFERENTLY. Structure: `ScreenShell` wrapping `CollectionFrame` with `tone=\"bare\" inset={false}` — the exact shape this app's own engine (`shared/web/screen-engine/collection-frame.tsx`) already reached independently, confirmed correct by reading the kit's reference afterward. The one gap (`MainScreen`'s per-screen header vs. this app's `CollectionHeading` rendered in-body) was raised and explicitly decided not pursued: recomposing it is invisible to any adoption count either way, and widening `AppShell`'s generic header channel for a gain nobody could point at, mid-launch, was the wrong trade.",
  "templates/multi-step-form.tsx":
    "GAP, permanent. No wizard-style form exists anywhere in the app — every one of `FormShell`'s 32+ forms is single-step by design (one Dialog, one Submit). Confirmed independently by the kit's own component, which warns at runtime when no step depends on an earlier one — exactly this app's shape. Will not need this unless a future feature genuinely requires sequential, dependent steps.",
  "templates/portal-home.tsx":
    "REALIZED DIFFERENTLY. `web-portal/components/home-screen.tsx` already implements the identical spec (a savings figure, a waiting/delivered list, the scoped ambient field) natively, with its own components. Nothing here to adopt that isn't already built.",
  "templates/rail.tsx":
    "OWNER'S CALL, parked rather than scheduled per the owner's own review of staging live. With `AppShell`'s rail COLUMN now the kit's own `ScreenShell`, only the nav buttons' CONTENTS are still hand-rolled. RECOMMENDATION: adopt — a render probe already proved the team switcher fits `Rail`'s `mark`/`wordmark`/`tagline` slots (each takes an arbitrary node), so finishing the swap removes the last hand-rolled piece of a shell the kit already half-owns. The mobile top-bar/bottom-tab-bar stay bespoke regardless: `ScreenShell` drops the rail below `md` by design and draws no hamburger. NOTE, found checking this table for a 'motion'-shaped blind spot (a composition reached only through another already-adopted kit part): `templates/screen-shell.tsx` (already `[x]`) does import `Rail` directly (`import { Rail } from \"./rail\"`) as `rail`'s own default — `const railNode = rail === undefined ? <Rail spine={spine} /> : rail`. That import is real, but the branch is dead in this app: `AppShell` is `ScreenShell`'s one caller and always passes its own `rail` node, so `<Rail />` never actually renders here — reached at the module graph, never at render. Confirms the entry above rather than closing it: `Rail` is in the bundle but not on screen, which is exactly the gap the recommendation already names.",
  "templates/detail-screen.tsx":
    "REALIZED DIFFERENTLY. Read in full, this template is nothing but `ScreenShell` (header slot empty) wrapping `RecordChrome` — exactly what this app already assembles from the same, already-adopted parts under different file names: `AppShell` is now `ScreenShell`, and every record screen composes `RecordChrome` through the `RecordScreen` host seam. The one real difference — this app's persistent breadcrumb+timer header on record screens, where the template leaves that band empty — is a deliberate product choice (one header treatment everywhere), not a technical gap.",
  "templates/record-route.tsx":
    "REALIZED DIFFERENTLY. This template is nothing but `ScreenShell` (header empty) wrapping `RecordChrome`, additionally wiring stages into `StepperHero`'s hero slot — exactly what this app already assembles from the same, already-adopted parts (`AppShell`'s `ScreenShell`, `RecordChrome` via the `RecordScreen` host seam, `StepperHero` in the hero slot) under different file names. The one real difference — this app's persistent breadcrumb+timer header on record screens, where the template leaves that band empty — is a deliberate product choice (one header treatment everywhere), not a technical gap.",
  "templates/search-results.tsx":
    "GAP, a real finding. This app has no way to search across everything from anywhere — the only search-like control (`record-picker.tsx`) is a per-field relation picker scoped inside one form, not global search. Worth the owner's consideration as a genuinely useful, separately-scoped feature for a multi-module tool; not something to fold into a UI-adoption pass.",
  "templates/stat-strip.tsx":
    "REALIZED DIFFERENTLY. `pulse.tsx`'s `PulseBand` already draws its headline numbers through the kit's own `StatGrid` component directly — the exact primitive this composition is itself built on top of. The one thing this file adds beyond `StatGrid` is the optional per-tile `spark` mini-chart, and using it on these tiles is exactly the fusion `pulse.tsx`'s own law forbids ('aggregate into a big NUMBER or reach for a CHART, never fuse them') — the tiles that want a chart already draw one as a separate `BandCard`, by design.",
}
