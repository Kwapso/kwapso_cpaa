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

/** WHERE COUNTING STOPS — the one ceiling on every total this app reports, for a
 * filtered SEARCH and (since R16 was amended on 2026-08-14) for a COLLECTION too.
 *
 * ONE number rather than two, deliberately. A filtered search has always counted
 * exactly to a million and then said "1m+"; the amendment gives a collection total
 * the same ceiling and the same sentence, so there is one place in the product
 * where counting stops instead of two that could drift apart. A door that stopped
 * counting at one number while the badge started hedging at another would produce
 * precisely the output this seam exists to prevent: a total that is quietly wrong
 * and looks exact.
 *
 * It lives HERE, beside the other read ceilings, because both sides need it and
 * neither may own it — `shared/workers/count.ts` bounds the scan with it and
 * `shared/web/format-count.ts` renders the "+" from it. This file is pure
 * constants with no imports, so the browser pays nothing to read it. */
export const TOTAL_COUNT_CAP = 1_000_000

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
 * The rest stay pending and are accepted from the invites inbox. */
export const INVITE_SWEEP_CAP = 25

/* ---- How far into somebody's Drive a share actually reaches ---------------- */

/** HOW MANY LISTING CALLS ONE DRIVE WALK MAY SPEND.
 *
 * Until 20 Aug 2026 a named folder meant its DIRECT CHILDREN and one page of
 * fifty, and that is the whole reason the owner's transcripts were not in the
 * knowledge base. Google Meet files a recording as a FOLDER PER MEETING — so his
 * shared `Google Meet` folder contained nothing but subfolders, every one of them
 * excluded by the query, and the folder that looked shared contributed zero
 * documents. Measured: 15 shared folders yielded 54 files.
 *
 * So the walk descends. The budget is in CALLS rather than files because a call
 * is what costs time and quota: a folder of ten files and a folder of five
 * hundred are both one call per page, and the thing that runs away is the number
 * of FOLDERS, which nobody controls. Breadth-first and newest-first, so when the
 * budget does run out it has spent it on the material somebody is most likely to
 * ask about. */
export const DRIVE_WALK_CALL_BUDGET = 120

/** HOW DEEP. A share is a statement about a folder and everything filed under it,
 * which is how a person means it — but a cycle-free tree can still be pathological,
 * and six levels is deeper than any filing anybody defends. */
export const DRIVE_WALK_MAX_DEPTH = 6

/** PAGES PER FOLDER, so a big folder is read rather than sampled. Five pages of
 * fifty is 250 files from one folder; past that the walk moves on rather than
 * spending the whole budget in one place. */
export const DRIVE_PAGES_PER_FOLDER = 5

/** THE CEILING ON ONE LISTING, whatever the shape of the tree. R14's hard cap for
 * this read: a number the worker can hold and the sweep can page through. */
export const DRIVE_WALK_MAX_FILES = 3000

/* ---- Google brings itself in, on a schedule (owner, 19 Aug 2026) ----------- */

/** HOW MANY CONNECTED PEOPLE one team's tick acts as. Every Google read in this
 * app uses ONE PERSON'S OWN connection, so an automatic sweep has to be a loop
 * over people rather than a single team-wide call — there is no team-wide Google
 * credential and deliberately never was. Small, because the loop is per team and
 * the tick is every fifteen minutes: five people is twenty a hour each, which is
 * far more often than anybody's calendar changes. */
export const GOOGLE_SWEEP_PEOPLE_PER_TICK = 5

/** HOW MANY MEETINGS one person's tick tries a transcript for. A try that finds
 * nothing writes nothing and costs one Google round trip, so this is the number
 * that keeps a quiet tick cheap. */
export const TRANSCRIPT_SWEEP_PER_PERSON = 3

/** THE HORIZON — how far back the sweep keeps looking for a transcript.
 *
 * This is the number that stops it hunting forever. A meeting whose transcript
 * never appears (nobody recorded it; Gemini was off; it was a phone call) would
 * otherwise be retried every fifteen minutes for the life of the product, and
 * the cost of that is not the compute, it is that the queue never drains and the
 * newest meetings sit behind a permanent backlog of ones that will never resolve.
 * Fourteen days is well past when Google posts a recording — it is usually
 * minutes and occasionally hours — and past it the manual button on the meeting
 * is still there for the one somebody actually wants. */
export const TRANSCRIPT_HORIZON_DAYS = 14

/** @mentions one help reply may carry. Each mention becomes a row in an `IN (...)`
 * lookup AND an email, so an uncapped list is both an unbounded statement and an
 * unbounded send from a trusted sender. */
export const MENTIONS_LIMIT = 50

/** Rows the ticket sub-tab tally may return (R14). It is a GROUP BY over
 * (`help_type`, `status`) — two collections that cannot run away, since one is a
 * team's own dropdown vocabulary and the other is the seven-value fixed
 * lifecycle — so the ceiling is generous and exists to make the bound VISIBLE at
 * the query rather than implied by the shape of the data. */
export const TICKET_FACET_CAP = 500

/** Files AND links one ticket may carry (CHECKLIST 5.10). "Several" is the ask,
 * from both front doors; a ceiling turns "several" into something a list can be
 * read to the end of and a count can be trusted. */
export const TICKET_ATTACHMENT_CAP = 50

/** WHAT A STORY MAY SHOW FOR ITSELF. Smaller than a ticket's fifty on purpose:
 * a ticket accumulates evidence over a conversation that can run for weeks, and
 * a story's attachments are what one person put up to say "come and look". Past
 * this the door refuses in words rather than truncating a list. */
export const STORY_ATTACHMENT_CAP = 20

/** Rows the work-log summary's two grouped reads may return (R14) — time BY
 * PERSON and time BY KIND OF WORK, on one record. Both group over sets that
 * cannot run away: the people are the team's members and the kinds are the
 * team's own dropdown vocabulary. So the ceiling is generous and exists to make
 * the bound VISIBLE at the query rather than implied by the shape of the data —
 * the same argument TICKET_FACET_CAP makes, at the size those two sets actually
 * are. A chart with fifty bars on it is already unreadable; this is the point
 * past which it also stops being bounded. */
export const WORK_LOG_GROUP_CAP = 50

/** Processes one story may link to (CHECKLIST 6.5). "One or more" is the ask; a
 * ceiling is what makes the `IN (...)` proof a bounded statement rather than one
 * with as many placeholders as somebody types. */
export const STORY_PROCESS_CAP = 20

/** Bytes one file attached to a ticket may carry, before base64. The same 10 MB a
 * to-do's evidence gets (routes/todos.ts) — the ask is the same ask, "a photo of
 * the thing I mean", and two different ceilings for the same act is two different
 * refusals a person has to learn. */
export const TICKET_FILE_MAX_BYTES = 10 * 1024 * 1024

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

// ── translating what a PERSON typed, on demand ───────────────────────────────
// FOUR NUMBERS, AND THEY ARE A SET WITH A PURPOSE: one press of "Translate" is
// ONE unit of the team's AI allowance, so these are what stop a screen with a
// long thread on it turning that promise into a request no model can answer. A
// screen with more text than this translates what fits and leaves the rest in
// the language it was written in, which is the same degradation the whole
// language engine is built on: untranslated is a sentence, a failed request is
// not.
//
// ONE PRESS IS ONE UNIT, AND NO LONGER ONE CALL. It used to be both, and the
// second half was never true of a long source: a 3.3 KB meeting write-up needs
// more than a thousand tokens of answer, and a single call carrying a whole
// screen's worth would have to write tens of thousands. So a press is CUT INTO
// BATCHES here, each one small enough for the model to finish, and the spend
// stays one — which is the half of the promise a person actually feels.

/** Pieces of human-typed text one press of "Translate" may carry. */
export const TRANSLATE_MAX_TEXTS = 40

/** Characters of ONE of those pieces. Longer is truncated rather than refused —
 * a paragraph and a half of somebody's ticket in their own language is more use
 * than a refusal, and the original is always one press away. */
export const TRANSLATE_MAX_CHARS = 4_000

/** Characters ONE model call carries. Equal to the per-piece cap on purpose, so
 * the largest piece the door accepts is always a batch it can also answer —
 * pieces are packed whole and never split, because half a paragraph translated
 * out of context is worse than the paragraph left alone. */
export const TRANSLATE_BATCH_CHARS = 4_000

/** Batches ONE press may make. The ceiling on what a press costs and how long a
 * person waits: six calls of four thousand characters is 24,000 characters of
 * somebody else's writing, more than any real screen holds, and the pieces past
 * it come back as what was typed — and the answer SAYS it was partial, so the
 * screen can tell them rather than quietly showing German. */
export const TRANSLATE_MAX_BATCHES = 6

/** Answer tokens to allow per character of a batch. MEASURED, not guessed: on
 * 2026-08-18 the model spent 0.30 tokens per input character translating German
 * into English, and 0.34 into Thai — the worst of the twenty-nine languages the
 * app speaks, because its script tokenises badly. Doubled, because a ceiling
 * costs nothing unless the model actually reaches it and an answer cut off at
 * the ceiling is the whole fault this exists to prevent. */
export const TRANSLATE_TOKENS_PER_CHAR = 0.7

// ── a file dropped into the knowledge base ───────────────────────────────────
// TWO NUMBERS, AND THEY ARE A PAIR — the same shape as the agent-chat ceiling
// above, and for the same reason it was written: a per-file cap enforced AFTER
// `request.json()` describes what may be stored while the parse describes what
// may be SENT, and the parse is the expensive step. So the door checks the
// envelope against `Content-Length` before it reads a byte, and the file cap
// afterwards, once there is a file to measure.

/** Bytes one uploaded file may carry into the knowledge base.
 *
 * 25 MB is the number the product already teaches: it is the cap on every other
 * upload door, so the sentence a person meets when they pick something enormous
 * is the one they have already met once. It is a ceiling on the FILE, not on the
 * material — a 25 MB scanned PDF may convert to a few hundred kilobytes of text,
 * and a 3 MB spreadsheet may convert to more than the row can hold. The text has
 * its own, separate ceiling (`DOCUMENT_LIMIT_BYTES` in validate.ts), because the
 * two are ceilings on different things: this one is what we will accept and
 * store, that one is what one database row can hold. */
export const KNOWLEDGE_FILE_MAX_BYTES = 25 * 1024 * 1024

/** Bytes one upload REQUEST may declare. A base64 data URL is ~4/3 of the file
 * it carries, so the envelope is the file cap times four thirds plus room for
 * the title, the filing and the JSON around them. Checked against
 * `Content-Length` BEFORE the body is parsed — a cap is only a cap if it is
 * checked before the expensive step. */
export const KNOWLEDGE_UPLOAD_MAX_BYTES = Math.ceil(KNOWLEDGE_FILE_MAX_BYTES * (4 / 3)) + 64 * 1024

// ── the STREAMED upload, and why its ceiling is a different number ────────────
// The caps above bound a file that is BUFFERED: a base64 data URL inside a JSON
// body, which `request.json()` materialises whole before a single validation
// runs. At 25 MB that is ~33 MB of base64, plus the decoded copy, plus the JSON
// string around them — well over 100 MB of a 128 MB isolate, on the request path.
// So 25 MB was never a judgement about files; it was the largest number that fits
// in memory three times. Every upload door in the base wore it for that reason and
// explained it to people as if it described documents.
//
// The streamed door does not buffer. The body goes to R2 as it arrives
// (`put(key, request.body)`), so the isolate holds a window rather than a file
// and the memory ceiling stops being the binding constraint.
//
// WHAT BINDS IT INSTEAD IS THE PLATFORM, and it is worth naming precisely rather
// than discovering: Cloudflare caps the REQUEST BODY a Worker may receive — 100 MB
// on this plan. No amount of streaming gets past that, because the limit is on the
// request, not on our handling of it. The only door past it is a client PUT
// straight to R2 on a presigned URL, which needs an R2 S3 access key and bucket
// CORS (see the report of 17 Aug 2026); that is a different decision with a
// credential in it, and it is not taken here.
//
// So this sits deliberately UNDER the platform wall, with headroom for headers
// and the query string: refused by us, with a sentence a person can act on,
// rather than cut off mid-body by the edge with nothing useful to say.
// ONE NUMBER FOR EVERY STREAMING DOOR — the knowledge base, staff files and
// brand assets. They differ in which bucket they write and in whether the bytes
// are ever served back under their declared type; they do not differ in what the
// platform will carry, and that is the only thing this number is about. A
// constant each would be a chance to raise one and forget the rest.
//
// Decimal megabytes, not binary, because `mb()` renders the refusal by dividing
// by 1,000,000 — so this way the number in the code and the number the person is
// told are the same number. (90 MiB would be refused with the words "94 MB".)
export const STREAM_UPLOAD_MAX_BYTES = 90 * 1_000_000

/** How large a streamed file we will still READ (convert to text for the
 * assistant). Extraction needs the bytes in memory — that is what conversion IS —
 * so it keeps the ceiling the buffered door always had, and it is read back from
 * R2 once, rather than held alongside a base64 copy and a JSON string.
 *
 * Past it the file is STORED AND LISTED and says it was not read, which is the
 * behaviour the knowledge base already has for a file it cannot convert
 * (`unreadableNote`). Storing a 60 MB archive nobody can search is a better
 * answer than refusing it: the alternative is that the material does not exist in
 * the product at all. */
export const KNOWLEDGE_EXTRACT_MAX_BYTES = KNOWLEDGE_FILE_MAX_BYTES

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

// ── what one CALLER may ask for, per worker, per minute ──────────────────────
// The caps above bound one request's work. This one bounds how many requests one
// person gets, which is the axis nothing covered: every read door in the app was
// unthrottled, and a read of the activity feed or the accounts list is real work
// on a database the whole team shares.

/** Requests one CALLER may make to ONE worker in a minute (shared/workers/rate-limit.ts).
 *
 * CHOSEN FROM THIS APP'S REAL SHAPE, not from a round number. The estate is 20
 * client companies, 104 contacts and 6 staff, and realistic peak concurrency is
 * about 40 sockets (ARCHITECTURE.md §7). The heaviest honest moment a single person
 * produces is a cold open of the app — priming the caches behind a screen is on the
 * order of twenty requests — and then navigation, which is a handful per screen.
 * Somebody working hard, clicking constantly, with a page refreshing behind them,
 * is tens per minute. Not hundreds.
 *
 * So 600 is roughly ten times the busiest real person and about ten requests a
 * second sustained: generous enough that no human and no ordinary screen can reach
 * it — including a screen that is retrying because something is wrong, which is the
 * case that must NOT be throttled, because that person is already having a bad time
 * — and low enough that a loop hits a wall in the first second rather than after it
 * has read a database ten thousand times.
 *
 * PER WORKER, because the binding is per worker: a person's budget on content and
 * their budget on tenancy are separate, which is the honest shape — they are
 * separate databases' worth of work, and a busy Tickets screen should not spend the
 * allowance the Accounts screen needs.
 *
 * The period is 60 seconds because Cloudflare's rate-limiting binding allows 10 or
 * 60 and nothing else; the number here and the `period` in each wrangler.jsonc are
 * the same decision written in two places, which is why every one of them says
 * this constant's name in a comment beside it. */
export const CALLER_REQUESTS_PER_MINUTE = 600

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
