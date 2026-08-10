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

/** Alarm rows one nightly size-check tick will write. The scan itself is cheap
 * (a size field per database), but every ALARMING database costs a core-DB read
 * plus an insert — so the tick's write work is bounded and the rest waits for
 * tomorrow's run, which re-finds them (the check is idempotent per database). */
export const CRON_ALERT_CAP = 50

/** Pending invitations one sign-in sweep will accept in a single pass. Each one is
 * three core-DB writes plus two live pings, and the list is keyed on an EMAIL
 * ADDRESS — anyone may invite any address, so the row count is attacker-influenced.
 * The rest stay pending and are accepted from the Invitations inbox. */
export const INVITE_SWEEP_CAP = 25

/** @mentions one help reply may carry. Each mention becomes a row in an `IN (...)`
 * lookup AND an email, so an uncapped list is both an unbounded statement and an
 * unbounded send from a trusted sender. */
export const MENTIONS_LIMIT = 50

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
