// ONE place for the read/write size caps every worker shares (R14: no unbounded
// list endpoint). A cap is a hard ceiling with a comment at the query — beyond
// it, the screen must move to real server paging (LIMIT ? OFFSET ? + a total).
// WHY: one unbounded read stalls a worker at 100k rows; scale is a law, not a
// per-screen choice — the failure that earned it was a 24,000-row catalogue.

/** Hard cap on any collection list read (rows a screen loads in one go). */
export const LIST_HARD_CAP = 1000

/** Hard cap on a CSV export read — larger than a screen load (an export is a
 * deliberate download), still bounded so one request can't stream a whole shard. */
export const EXPORT_HARD_CAP = 10_000

/** Hard cap on a conversation/derived read (a ticket's replies, a chat thread's
 * messages, a per-member progress matrix). */
export const THREAD_HARD_CAP = 500

// ── the platform's own ceiling on one statement ───────────────────────────────
// The caps above are OURS: numbers we chose. This one is D1's, and it is the
// reason a read can be perfectly bounded by the caps above and still fail.

/** Bound parameters D1 accepts in ONE statement (checked against Cloudflare's
 * published D1 limits, 14 Aug 2026). Named here rather than repeated at each
 * door because it is the ceiling the caps above have to fit UNDER: a read capped
 * at LIST_HARD_CAP that then looks its 1,000 ids up with `IN (?, ?, …)` is a
 * bounded read that D1 refuses outright.
 *
 * WHY IT KEPT BEING MISSED: every suite in this repo runs its SQL against local
 * SQLite, whose limit is 999 — a harness ten times MORE permissive than the thing
 * it stands in for, so a statement binding 500 values passes every test and 500s
 * in production. It has, twice (`workers/content/test/d1-parameter-cap.test.ts`
 * records the first). */
export const D1_MAX_BOUND_PARAMS = 100

/** Slice an id list into batches that fit under D1's ceiling, so a lookup over
 * more ids than one statement may carry becomes several statements instead of an
 * error. `reserved` is how many parameters the statement binds BESIDE the ids
 * (a team id, a status) — counted, not guessed, because the ceiling is on the
 * whole statement.
 *
 * The alternative — interpolating the ids through `sqlString` — is what the fence
 * does (shared/workers/account-scope.ts), and it is right there because the SQL
 * is assembled as text anyway. On the core database the house style is a bound
 * `env.DB.prepare(...).bind(...)`, and batching keeps it that way rather than
 * teaching a second habit. */
export function idBatches(ids: string[], reserved = 0): string[][] {
  const size = Math.max(1, D1_MAX_BOUND_PARAMS - reserved)
  const out: string[][] = []
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size))
  return out
}

/** Companies one client login may STAND IN (the portal switcher's list).
 *
 * Different from SCOPE_HARD_CAP, which bounds how far the fence REACHES DOWN from
 * whichever one they are standing in. This bounds how many they can choose
 * between, and it exists for two reasons: the roots read had no LIMIT at all
 * (R14), and the switcher's own lookup binds one parameter per root — so an
 * uncapped set was both an unbounded read and a statement D1 would refuse. Far
 * above "a person belongs to a handful of companies", and under
 * D1_MAX_BOUND_PARAMS with room for the rest of the statement. Past it the set is
 * short in the SAFE direction, like every other fence ceiling: fewer companies,
 * never someone else's. */
export const PORTAL_ROOTS_CAP = 50

// ── bounds on the work a single request or tick may do ───────────────────────
// R14 caps the ROWS a read returns. These cap the WORK a path does: how many
// pages it will pull, how many round-trips it will fan out, how deep it will
// recurse. Same reasoning, other axis — an unbounded loop stalls a worker just as
// surely as an unbounded SELECT, and it does it without a single big query to
// blame.

/** Pages the D1 REST database listing will walk (100 per page → 10,000 databases).
 * The paging loop is `for (;;)` — a door that kept answering "full page" would
 * otherwise spin forever and never return. A ceiling turns "impossible" into
 * "incomplete", which the caller can at least survive. */
export const D1_LIST_PAGE_CAP = 100

/** Teams one knowledge-sweep tick will visit. The sweep runs every 15 minutes
 * and does a BOUNDED slice per team (INGEST_SOURCES_PER_TICK), so this is the
 * ceiling on the whole tick's work: past it the remaining teams wait for the
 * next one, which starts from each kind's own cursor and loses nothing. A cron
 * that would run for an hour is a cron that gets killed halfway. */
export const CRON_TEAM_CAP = 200

/** Alarm rows one nightly size-check tick will write. The scan itself is cheap
 * (a size field per database), but every ALARMING database costs a core-DB read
 * plus an insert — so the tick's write work is bounded and the rest waits for
 * tomorrow's run, which re-finds them (the check is idempotent per database). */
export const CRON_ALERT_CAP = 50

/** Databases one nightly tick records a GROWTH reading for (`db_growth`).
 *
 * Bounded for the same reason CRON_ALERT_CAP is: the scan is one listing, but each
 * reading is a write, and an estate near the platform's 50,000-database limit would
 * turn a growth watch into the thing that grows. The tick takes the LARGEST this
 * many, because a trend only matters where there is a ceiling to reach — a 4 MB
 * database filling twice as fast as another 4 MB database is not news.
 *
 * Sized above CRON_TEAM_CAP so the watch is never narrower than the estate the
 * crons work through, and well under the alarm ceiling's cost per row (an upsert,
 * no read). */
export const CRON_GROWTH_CAP = 200

/** Pending invitations one sign-in sweep will accept in a single pass. Each one is
 * three core-DB writes plus two live pings, and the list is keyed on an EMAIL
 * ADDRESS — anyone may invite any address, so the row count is attacker-influenced.
 * The rest stay pending and are accepted from the Invitations inbox. */
export const INVITE_SWEEP_CAP = 25

/** @mentions one help reply may carry. Each mention becomes a row in an `IN (...)`
 * lookup AND an email, so an uncapped list is both an unbounded statement and an
 * unbounded send from a trusted sender. */
export const MENTIONS_LIMIT = 50

/** Bytes one agent chat request may declare. The per-file caps (8 files × ~5 MB)
 * are real, and they were all enforced AFTER `request.json()` had already parsed
 * the whole body — so the caps described what could be imported while the parse
 * described what could be sent, and the parse was 40 MB into a 128 MB isolate.
 * A ceiling is only a ceiling if it is checked BEFORE the expensive step. Sized
 * to fit the caps it guards plus the envelope around them. */
export const AGENT_CHAT_MAX_BYTES = 42 * 1024 * 1024

/** Bytes one attached CSV may carry into a chat import. Named here beside the
 * request ceiling rather than inline at the door, because the two numbers are a
 * pair: the outer one is only correct while it is bigger than 8 × this. */
export const AGENT_FILE_MAX_BYTES = 5_000_000

/** Files one agent chat message may attach. */
export const AGENT_MAX_FILES = 8

/** How far up the account tree the loop guard will walk. The tree is self-nesting,
 * so the ancestor walk is the only unbounded recursion in the base. Past this depth
 * the guard cannot PROVE a move is ring-free, so it refuses — fails closed, never
 * open. Far deeper than any real org chart. */
export const MAX_ACCOUNT_DEPTH = 64

// ── the agent's reply ceiling, and the bulk cap DERIVED from it ───────────────
// A cap the model is TOLD but cannot physically EMIT is a promise the runtime
// breaks silently, mid-JSON: the tool call truncates, the turn dies, nothing
// changed. So the two numbers come from ONE place and the relationship below is
// asserted by workers/data-ops/test/reply-ceiling.test.ts.

/** The agent's output budget per model turn (both providers). Raised from 4,096
 * after a downstream run proved a full bulk call doesn't fit under it. */
export const AGENT_MAX_TOKENS = 8192

/** What one id costs the model to emit inside a JSON array: a 26-char ULID plus
 * its quotes, comma and space. ~12 in practice; budgeted generously because the
 * failure it prevents is silent. */
export const TOKENS_PER_EMITTED_ID = 15

/** Everything else in that same reply: the tool-call envelope, the argument
 * names, and the sentence the assistant says alongside the call. */
export const AGENT_REPLY_ENVELOPE_TOKENS = 512

/** Max ids in one bulk write — DERIVED, not hand-picked: it is what the model can
 * actually write at AGENT_MAX_TOKENS. The bulk doors and the agent's tool schemas
 * both declare THIS constant, so the number the model is told, the number the door
 * enforces, and the number that physically fits are one number. */
export const BULK_IDS_LIMIT = Math.floor((AGENT_MAX_TOKENS - AGENT_REPLY_ENVELOPE_TOKENS) / TOKENS_PER_EMITTED_ID)

// ── what one caller may add to the SHARED core database ──────────────────────
// The per-team databases are a tenant's own problem: fill one and you have filled
// YOURS. The core database is everybody's. So every write a signed-in person can
// repeat at will against it carries a ceiling, and — CONCURRENCY.md — the ceiling
// rides the INSERT rather than being read first.

/** Account-activity rows one PERSON may write in an hour. Every identity edit
 * (name, photo, email) appends a row to the shared core database AND pings that
 * person's live channel, so a session alternating its own first name grows the one
 * database every team depends on, for free, from an ordinary signed-in door.
 * Generous for a real person tidying their profile; a wall for a loop. */
export const ACCOUNT_ACTIVITY_PER_HOUR = 60

/** Rows one retention sweep will delete PER TABLE per nightly tick. A DELETE is
 * as unbounded as a SELECT: an estate that has never been swept would otherwise
 * try to remove millions of rows in one statement and time out, night after
 * night, deleting nothing at all. Bounded work catches up over a few nights and
 * always finishes. */
export const RETENTION_DELETE_CAP = 5_000

/** How many BOUNDED deletes one table gets per nightly tick.
 *
 * The cap above bounds one STATEMENT, which is the right unit — a statement is
 * what times out. It is not the right unit for the NIGHT, and the difference is
 * the whole finding: at 5,000 rows a night one table can absorb 5,000 sign-ins a
 * day, and the yardstick this base is built for is a quarter of a million people
 * in ONE tenant, plus every other tenant on the same shared core database. A
 * sweep that removes 5,000 while the day adds 300,000 is not retention, it is
 * arithmetic pointing one way.
 *
 * So the tick runs the same bounded statement up to this many times, stopping
 * early the moment one comes back short (nothing left to take). 40 × 5,000 =
 * 200,000 rows per table per night, per statement none of which is any bigger
 * than the one that already worked — and the loop is what makes "catching up
 * takes a few nights and always finishes" true instead of aspirational. Sized to
 * stay far inside a cron's 15 minutes: forty statements against an indexed
 * predicate is seconds, not minutes. */
export const RETENTION_PASSES_PER_TICK = 40

/** How long the central error log keeps a row.
 *
 * db/core/0012 has described `error_logs` as a "90-day-ish owned history" since
 * the day it was created, and nothing ever deleted a row — so the ninety days
 * was a sentence in a comment rather than a property of the table, and the store
 * that exists to tell you what broke was itself unbounded on the one database
 * every tenant shares. 0019 added a per-caller RATE ceiling, which is a different
 * promise: a rate bounds how fast it fills, a sweep bounds how full it gets.
 *
 * NOT the audit tables. `account_activity`, the team activity feed and the usage
 * ledgers stay forever on purpose (retention.ts: "anything anyone might have to
 * answer for later"). This one is diagnostics, its own comment already named the
 * window, and implementing a documented window is not the same decision as
 * choosing a new one. */
export const ERROR_LOG_RETENTION_DAYS = 90

/** How long a spent or expired sign-in artefact is kept before the sweep takes
 * it. Everything that reads these tables looks back ONE hour (the send budget,
 * the per-address code cap), and a code lives ten minutes — so a day is already
 * far past the last moment any rule can still see the row. */
export const AUTH_RETENTION_HOURS = 24

/** Roles one team may hold. A role is cheap on its own and expensive in company:
 * every one adds a row per module to `role_permissions` (the export's biggest
 * read), a row to the roles list, and an entry to the title lookup two hot member
 * screens do on every open. None of those was capped at the CREATE end, so the
 * size of three reads was set by whoever held `member_roles:create` — the
 * ordinary grant an office manager gets. Far above any real org chart, low enough
 * that the reads it feeds stay reads. */
export const MAX_ROLES_PER_TEAM = 200

/** Per-user ceiling on CREATED teams. Every team provisions a REAL database, so
 * an uncapped create door lets one signed-up person exhaust the platform's
 * database quota. Low on purpose — a person runs a handful of teams, not fifty;
 * the owner raises it per environment with MAX_TEAMS_PER_USER. */
export const MAX_TEAMS_PER_USER = 5

// ── the machine surface's keys (MCP.md) ──────────────────────────────────────
// A personal access token acts AS its owner, in one team, forever — so "forever"
// was the problem: a secret pasted into a CI config outlives the contract, the
// laptop and often the job. Two numbers bound it: how long one lives, and how
// many one person can hold at once.

/** How long a new access token lives before it must be re-issued. Long enough
 * that a working integration isn't churned, short enough that an abandoned
 * secret stops being a key. */
export const MCP_TOKEN_TTL_DAYS = 90

/** Live tokens one person may hold. The cap is what makes a token REACHABLE:
 * the settings list is hard-capped like every list (R14), so an uncapped minter
 * could bury a live token past the cap and never be able to revoke it again. */
export const MAX_ACTIVE_MCP_TOKENS_PER_USER = 10

/** THE ONE numeric env-var parse. Two bugs of the same family live in the obvious
 * spellings, in opposite directions:
 *   • `Number(env.X) || DEFAULT` turns a deliberate **0** into the default — set
 *     the AI allowance to zero and you silently grant the full daily quota.
 *   • `Number(env.X)` with no empty test turns **unset** into 0 — a team cap that
 *     refuses every person their very first team.
 * Both are invisible until someone deliberately chooses the boundary value, which
 * is exactly when it matters. So: unset, empty or unparseable → the fallback;
 * every real number, INCLUDING zero and negatives, is honoured as written. */
export function numberVar(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}
