// The sharding machinery (locked decision: built up front).
//
// Relief valves, in order of reach:
//  1. ALARM  — nightly cron sizes every database in the account (the team ones
//              AND the shared core); ≥80% of D1's 10GB cap writes a db_alerts
//              row + screams into the worker logs.
//  2. MOVER  — relocates one module's tables out of a team's database into a
//              dedicated database, recorded in team_module_databases.
//  3. SPLIT  — reads for a (team, module) COULD span several databases via
//              resolveModuleDatabases() + d1QueryAcross(). NOT WIRED: neither has
//              a caller outside this file, so valve 2 is refused at its door
//              (SPLIT_READS_WIRED, below) rather than left able to empty a module
//              out of the app while reporting success.

import {
  d1CreateDatabase,
  d1ExecScript,
  d1ListAllDatabases,
  d1Query,
  d1QueryAcross,
  sqlValue,
  type D1Rest,
} from "@shared/workers/d1-rest"
import { recordWorkerError } from "@shared/workers/error-log"
import { ulid } from "@shared/workers/id"
import { brand } from "@shared/brand"
import {
  CRON_ALERT_CAP,
  CRON_GROWTH_CAP,
  OWNED_DB_CAP,
  RETENTION_DELETE_CAP,
} from "@shared/workers/limits"
import { sendBrandedEmail } from "@shared/workers/notify"
import type { Env } from "../env"

/** D1's hard per-database ceiling (Cloudflare's published D1 limits, checked
 * 14 Aug 2026). Named rather than left implicit inside the 80% below, because the
 * growth arithmetic needs the ceiling itself: "how long have I got" is headroom
 * divided by a rate, and headroom is measured from HERE, not from the alarm. */
export const D1_MAX_DATABASE_BYTES = 10 * 1024 * 1024 * 1024

/** 80% of D1's 10GB per-database cap. */
export const ALERT_THRESHOLD_BYTES = 8 * 1024 * 1024 * 1024

/** D1's TOTAL STORAGE PER ACCOUNT — the ceiling nothing here was watching.
 * (Cloudflare's published D1 limits, checked live 5 Sep 2026: "Maximum storage
 * per account — 1 TB (Workers Paid)".)
 *
 * ── WHY THE PER-DATABASE WATCH IS NOT THIS WATCH ────────────────────────────
 *
 * `ALERT_THRESHOLD_BYTES` answers "is one tenant nearly full", and the estate can
 * be in serious trouble while every single one of those answers is a comfortable
 * no. At 8.5 GB each — under the per-database alarm line — about 120 databases
 * are 1.02 TB and the account is over. Every individual alarm would read "one
 * database at 85%, run the mover"; the thing that actually stops working is D1
 * refusing new writes and new database creation across EVERY tenant at once,
 * including `d1CreateDatabase` — which is the mover's own first step. The named
 * remedy for the per-database alarm SPENDS the resource this one measures.
 *
 * ── AND THE ACCOUNT IS SHARED, WHICH CUTS BOTH WAYS ─────────────────────────
 *
 * `ourDatabases` subtracts the other two products' databases so we never alarm on
 * their data, and that subtraction is right for every other reader. It is WRONG
 * here: the 1 TB is charged to the ACCOUNT, so their bytes fill our ceiling.
 * So this one figure is measured over the WHOLE listing — counted, never named,
 * the same bargain the skipped-count log line already makes. Our own share is
 * reported beside it, because "we are at 30% and the account is at 90%" and "we
 * are at 90%" need completely different phone calls. */
export const D1_MAX_ACCOUNT_BYTES = 1024 * 1024 * 1024 * 1024

/** 80% of the account ceiling — the same fraction as the per-database line, for
 * the same reason: the mover takes a while and needs a person, and at an account
 * level the relief (an owner deciding what to archive, or a second Cloudflare
 * account) takes longer than that. */
export const ACCOUNT_ALERT_THRESHOLD_BYTES = Math.floor(D1_MAX_ACCOUNT_BYTES * 0.8)

/** THE ACCOUNT'S OWN ROW in `db_alerts` and `db_growth`, so the estate-wide
 * ceiling is watched by the mechanism that already exists rather than by a second
 * one built beside it.
 *
 * Both tables key on a database id, and this is deliberately not one: a D1 uuid is
 * 36 hex-and-dashes, so a colon cannot collide with a real database however the
 * account grows. What it buys is everything those tables already do — the
 * open-alert suppression that stops a standing problem mailing every night, the
 * current/previous shift that makes `daysUntilFull` answerable, and the admin
 * read's shortlist — for one sentinel row instead of a migration and a second
 * cron. "A column, not a table" (CLAUDE.md), one level up. */
export const ACCOUNT_STORAGE_ID = "account:d1-storage"
/** What a person reads in the alarm mail and on the admin screen. It sits in the
 * same `database_name` column as a real name, so it has to be a phrase nobody
 * could mistake for one. */
export const ACCOUNT_STORAGE_NAME = "ALL D1 STORAGE ON THIS CLOUDFLARE ACCOUNT"
const COPY_BATCH = 250

/** Bounded DELETEs the mover will run to empty ONE moved table in the old home.
 * 200 × RETENTION_DELETE_CAP = a million rows, which is comfortably more than any
 * single table in a database that has only just crossed 8 GB. It is a ceiling on a
 * loop, not a budget: past it the mover REFUSES rather than leaving a half-emptied
 * source behind a flipped route (see the drain step). */
const MOVE_DRAIN_PASSES = 200

/** COPY BATCHES ONE CALL WILL RUN before it stops and asks to be called again.
 *
 * This is the number that turns the mover from one long request into a resumable
 * job. 400 × COPY_BATCH = 100,000 rows per call: enough that a normal move
 * finishes in one or two calls, small enough that a call comfortably completes
 * inside a Worker's limits on the table this tool exists for. The work is bounded
 * per CALL, not per move — the move itself is as big as it needs to be, and its
 * progress is a row in `team_module_moves` rather than a place in a stack frame.
 *
 * A ceiling on a loop that used to have none is the same fix retention.ts and the
 * drain below already had; the difference is that those two could finish their work
 * in later ticks, and this one could not finish it at all. */
const COPY_BATCHES_PER_CALL = 400

/** How long a claim on a move is honoured before another call may take it over.
 *
 * A Worker that is killed cannot release its own claim, so a claim that could only
 * be cleared by its holder would strand the move forever — which is the failure
 * this whole table exists to end, reintroduced one layer up. Ten minutes is far
 * longer than a bounded call takes and short enough that a person retrying after a
 * crash is not left waiting. */
const MOVE_CLAIM_STALE_MS = 10 * 60 * 1000

/** Nightly: size EVERY database in the account, alarm on anything ≥ the threshold.
 *
 * IT USED TO WATCH ONLY `team-*`, AND THAT WAS THE HOLE. The prefix filter read
 * like a tidy scope and was actually a blind spot over the one database that
 * matters most: `kwapso-core` holds every user, session, team, error log and
 * usage row in the platform, it is the ONLY database whose growth is driven by
 * strangers (sign-in codes come from an unauthenticated door), and it is the one
 * whose 10GB ceiling takes the whole product down rather than one tenant. It
 * could never raise an alarm, because it does not begin with "team-".
 *
 * So the `team-` filter is gone rather than widened. But what replaced it was
 * NO filter, on the reasoning that "an app owns its Cloudflare account
 * (BOOTSTRAP.md), so every database this listing returns IS every database we
 * run" — and that sentence is false here, which is how this shipped.
 *
 * ── THE ACCOUNT IS SHARED. MEASURED, 31 AUG 2026 ────────────────────────────
 *
 * 16 databases on the Kwapso account and ELEVEN belong to two other products
 * (rest-o and Base One). Our nightly cron was sizing all of them: 13 of the 17
 * rows in `db_growth` named a database that is not ours, in BOTH cores, and
 * three of those name databases the other company has since DELETED — our table
 * is the last remaining record of them. The alarm loop would have opened a
 * `db_alerts` row against a foreign id and logged "D1 SIZE ALARM: <their
 * database> … Run the module mover", which is an instruction pointed at another
 * company's production data. It has never fired: nothing on the account is
 * within 1.5% of the 8 GiB line. Metadata pollution today, that tomorrow.
 *
 * ── AND A NAME CANNOT SEPARATE THEM ─────────────────────────────────────────
 *
 * The other products' per-team databases are named `team-<ulid>` too — the same
 * convention, because they are forks of this same base. So the fix is not a
 * better prefix. Ownership is read from OUR OWN RECORD of what we made: the core
 * `teams` table, plus core itself. `ourDatabases` below.
 *
 * WHAT THAT COSTS, said plainly: a database of ours that is in no team row and
 * is not core — some future analytics or archive database — is NOT watched until
 * someone claims it, which is the maintenance burden the prefix filter was
 * removed to escape. The tick logs the count it did not claim so the gap is
 * visible rather than silent, and that is the honest trade: failing to watch a
 * database we have not built yet is recoverable, and telling a human to run a
 * data mover against another company's production database is not.
 *
 * BOUNDED WORK PER TICK. The scan itself is cheap, but every ALARMING database
 * costs a core-DB read plus an insert, and nobody is watching a cron: a tick that
 * tries to alarm on 5,000 databases at once simply dies partway and reports
 * nothing. So the tick stops at CRON_ALERT_CAP alarms and says so — the rest are
 * found by tomorrow's run, because the check is idempotent per database (an open
 * alert suppresses a second one). */
export async function checkDatabaseSizes(
  env: Env,
  cfg: D1Rest
): Promise<{
  checked: number
  alerted: string[]
  capped: boolean
  sampled: number
  /** Every byte D1 is holding for this Cloudflare ACCOUNT — ours and the other
   * two products' — against `D1_MAX_ACCOUNT_BYTES`. `complete` is false when the
   * listing itself was truncated, which makes `accountBytes` a LOWER BOUND. */
  accountBytes: number
  ourBytes: number
  accountComplete: boolean
}> {
  const { databases: everything, complete: accountComplete } = await d1ListAllDatabases(cfg)
  // OURS ONLY, AND BEFORE ANYTHING READS A SIZE. The subtraction sits here, above
  // both the growth write and the alarm loop, so neither can be given a database
  // we do not own — rather than in each of them, where a third reader added later
  // would start from the unfiltered list again.
  const databases = await ourDatabases(env, everything)
  const skipped = everything.length - databases.length
  if (skipped > 0)
    // COUNTED, NEVER NAMED. Knowing the listing held databases we did not claim is
    // ours to know; writing another company's database names into our logs is the
    // very thing this function stopped doing.
    console.log(
      `[sharding] sized ${databases.length} of ${everything.length} databases on the account; ${skipped} are not ours`
    )
  const alerted: string[] = []
  let capped = false
  // THE WHOLE ACCOUNT'S BYTES, measured over the UNFILTERED listing on purpose —
  // `databases` is the set we may alarm ABOUT, `everything` is the set that fills
  // the account's 1 TB. Summed before the growth write so the account's own trend
  // row is recorded on the same night as everybody else's.
  const accountBytes = everything.reduce((n, d) => n + (d.file_size ?? 0), 0)
  const ourBytes = databases.reduce((n, d) => n + (d.file_size ?? 0), 0)
  // The trend first, because it is what turns a POSITION into a WARNING — and
  // because it must be recorded even on a night when nothing alarms.
  const sampled = await recordGrowth(
    env,
    databases,
    // THE ACCOUNT RIDES IN THE SAME TABLE, so "how long have I got" is answerable
    // about the ceiling that takes every tenant down at once and not only about
    // the ones that take a single tenant down. It is not one of `databases` and
    // must not become one, for two reasons: `ourDatabases` decides what we may
    // NAME and this row names nobody, and it is by construction the LARGEST
    // reading of the night — so appending it to the list would let it take a slot
    // out of `CRON_GROWTH_CAP` and quietly narrow the estate's own trend coverage
    // by one database, for ever.
    { uuid: ACCOUNT_STORAGE_ID, name: ACCOUNT_STORAGE_NAME, file_size: accountBytes }
  )

  // ── THE ACCOUNT-LEVEL ALARM ───────────────────────────────────────────────
  // Raised BEFORE the per-database loop, because it outranks every row in it: a
  // database at 85% is one tenant's problem with a known remedy, and an account
  // at 80% is every tenant's problem whose remedy is the opposite of that one.
  // Same suppression rule as below (an open alert is not re-raised), so a
  // standing account problem mails once and not nightly.
  if (accountBytes >= ACCOUNT_ALERT_THRESHOLD_BYTES) {
    const openAccount = await env.DB.prepare(
      "SELECT id FROM db_alerts WHERE database_id = ? AND resolved_at IS NULL"
    )
      .bind(ACCOUNT_STORAGE_ID)
      .first<{ id: string }>()
    if (!openAccount) {
      await env.DB.prepare(
        `INSERT INTO db_alerts (id, database_id, database_name, size_bytes, threshold_bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(
          ulid(),
          ACCOUNT_STORAGE_ID,
          ACCOUNT_STORAGE_NAME,
          accountBytes,
          ACCOUNT_ALERT_THRESHOLD_BYTES,
          new Date().toISOString()
        )
        .run()
      console.error(
        `D1 ACCOUNT STORAGE ALARM: ${accountBytes} of ${D1_MAX_ACCOUNT_BYTES} bytes used across the whole Cloudflare account (${ourBytes} of them ours). Running the module mover CREATES another database and makes this worse.`
      )
      alerted.push(ACCOUNT_STORAGE_NAME)
    }
  } else if (!accountComplete) {
    // THE UNDER-COUNT, SAID OUT LOUD. A truncated listing sums to a number that is
    // too small, so "under the threshold" may mean "under the part we could see".
    // Recorded rather than logged, because the reassuring branch is the one nobody
    // re-reads.
    await recordWorkerError(
      env.DB,
      "tenancy",
      "cron/size-check (account storage)",
      new Error(
        `the database listing was truncated, so tonight's account-storage total (${accountBytes} bytes) is a LOWER BOUND and the account may be over ${ACCOUNT_ALERT_THRESHOLD_BYTES} without this alarming.`
      )
    )
  }

  for (const db of databases) {
    if ((db.file_size ?? 0) < ALERT_THRESHOLD_BYTES) continue
    if (alerted.length >= CRON_ALERT_CAP) {
      capped = true
      console.error(
        `D1 SIZE ALARM: stopped at the ${CRON_ALERT_CAP}-alarm ceiling for this run, more databases are over the threshold; tomorrow's run continues.`
      )
      break
    }

    const open = await env.DB.prepare(
      "SELECT id FROM db_alerts WHERE database_id = ? AND resolved_at IS NULL"
    )
      .bind(db.uuid)
      .first<{ id: string }>()
    if (open) continue // already alarmed, don't spam

    await env.DB.prepare(
      `INSERT INTO db_alerts (id, database_id, database_name, size_bytes, threshold_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(
        ulid(),
        db.uuid,
        db.name,
        db.file_size ?? 0,
        ALERT_THRESHOLD_BYTES,
        new Date().toISOString()
      )
      .run()
    console.error(
      `D1 SIZE ALARM: ${db.name} is at ${db.file_size} bytes (>=80% of cap). Run the module mover.`
    )
    alerted.push(db.name)
  }
  return { checked: databases.length, alerted, capped, sampled, accountBytes, ourBytes, accountComplete }
}

/**
 * WHICH OF THE ACCOUNT'S DATABASES ARE OURS — read from our own record of what
 * we made, never from a name.
 *
 * TWO SOURCES, AND THE SECOND IS NOT A SPECIAL CASE. Every team database we ever
 * created is a row in core's `teams` table, because creating one is what writes
 * the row (`createTeam`). Core ITSELF is in no team row and is the single most
 * important database to watch, so it is claimed from `CORE_DATABASE_ID` — the
 * uuid of the binding this worker is already talking through, spelled out in the
 * same wrangler file three lines from the binding, and held to it by
 * test/db-ownership.test.ts.
 *
 * DEACTIVATED TEAMS COUNT. A switched-off team's database still exists, still
 * holds its rows and still grows toward the same 10 GB ceiling — "deactivate,
 * never delete" is exactly why it must stay watched. So the read carries no
 * `deactivated_at` predicate, deliberately.
 *
 * FAILS CLOSED. If the teams read throws, this claims nothing beyond core rather
 * than falling back to the whole listing: a night with no growth readings is a
 * gap somebody can see in the table, and a night that alarms on somebody else's
 * production database is not recoverable by noticing it afterwards.
 */
export async function ourDatabases<T extends { uuid: string }>(
  env: Env,
  everything: T[]
): Promise<T[]> {
  const mine = new Set<string>()
  if (env.CORE_DATABASE_ID) mine.add(env.CORE_DATABASE_ID)
  try {
    // R14: hard cap — OWNED_DB_CAP, sized to the ceiling of the listing this
    // filters rather than to a screenful, because truncating here would drop one
    // of OUR databases out of the watch (limits.ts says why at length).
    const rows = await env.DB.prepare(
      `SELECT database_id FROM teams WHERE database_id IS NOT NULL LIMIT ${OWNED_DB_CAP}`
    ).all<{ database_id: string }>()
    const results = rows.results ?? []
    if (results.length >= OWNED_DB_CAP)
      console.error(
        `[sharding] ourDatabases hit the ${OWNED_DB_CAP} ceiling — the ownership set is INCOMPLETE and some of our own databases are going unwatched.`
      )
    for (const r of results) if (r.database_id) mine.add(r.database_id)
  } catch (e) {
    // THE WATCHER GOING BLIND, and until 2026-09-05 it went blind quietly. If
    // the teams table cannot be read, this returns CORE ONLY — so tonight's size
    // check watches not one team database, prints a cheerful
    // `size check: 1 team DBs, 0 alarm(s)`, and a team sitting at 95% is not
    // alarmed. "Nothing crossed the line" and "we looked at nothing" produce the
    // identical log line, which is the whole reason this needs a row of its own.
    // The pattern beside it was already right (`result.capped` is recorded);
    // this is the path that was missed.
    console.error(
      `[sharding] could not read the teams table to decide which databases are ours; claiming core only. ${String(e)}`
    )
    await recordWorkerError(
      env.DB,
      "tenancy",
      "cron/size-check (ourDatabases)",
      new Error(
        `could not read the teams table, so tonight's growth watch covers the CORE database only and NO team database was checked for size: ${e instanceof Error ? e.message : String(e)}`
      )
    )
  }
  return everything.filter((d) => mine.has(d.uuid))
}

/** TONIGHT'S SIZE, BESIDE LAST NIGHT'S — so "how long have I got" is answerable.
 *
 * 80% of a cap is a POSITION, not a warning. Two databases at 8.1 GB raise the
 * identical alarm and are in completely different trouble: one has been there a
 * year, the other crossed 6 GB last week. The mover takes a while and needs a
 * person, so the question that matters is always the rate — and nothing recorded
 * enough to compute one. This is the missing half of the growth watch, not a new
 * alarm: it writes on every night, alarming or not, because a trend you only start
 * measuring once you are already at 80% is a trend you measured too late.
 *
 * ONE UPSERT PER DATABASE, current shifted into previous. A sample-per-night table
 * would make the growth watch the thing that grows (see db/core/0022).
 *
 * BOUNDED (CRON_GROWTH_CAP) and biased to the LARGEST, because a trend only matters
 * where there is a ceiling to reach. Never throws: a growth reading is the least
 * important thing this cron does, and it runs BEFORE the alarms — a failure here
 * must not cost somebody the alert that a database is nearly full. */
async function recordGrowth(
  env: Env,
  databases: { uuid: string; name: string; file_size: number | null }[],
  /** A reading that is NOT one of the databases and is written unconditionally —
   * today, the account's own total. Outside the cap on purpose (see the call
   * site): it is always the largest number of the night, so inside the list it
   * would silently cost the estate one trend slot. */
  extra?: { uuid: string; name: string; file_size: number }
): Promise<number> {
  const biggest = [...databases]
    .sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0))
    .slice(0, CRON_GROWTH_CAP)
  if (extra) biggest.push(extra)
  const now = new Date().toISOString()
  let written = 0
  for (const db of biggest) {
    try {
      // The shift happens INSIDE the statement (`excluded` is the incoming row, the
      // bare columns are the stored one), so there is no read-then-write pair to
      // race — the same shape CONCURRENCY.md asks for everywhere else. A re-fired
      // tick therefore moves a real reading into `prev`, which is why `prev_at` is
      // stored rather than assumed to be 24 hours ago.
      await env.DB.prepare(
        `INSERT INTO db_growth (database_id, database_name, size_bytes, at, prev_size_bytes, prev_at)
         VALUES (?, ?, ?, ?, NULL, NULL)
         ON CONFLICT(database_id) DO UPDATE SET
           database_name   = excluded.database_name,
           prev_size_bytes = db_growth.size_bytes,
           prev_at         = db_growth.at,
           size_bytes      = excluded.size_bytes,
           at              = excluded.at`
      )
        .bind(db.uuid, db.name, db.file_size ?? 0, now)
        .run()
      // `sampled` is HOW MANY DATABASES got a trend reading, and the account's own
      // row is not a database. Counting it would inflate the number the cron log
      // prints by exactly one, for ever — the kind of drift that turns a count
      // into a thing nobody trusts.
      if (db.uuid !== ACCOUNT_STORAGE_ID) written++
    } catch (e) {
      // A HOLE IN ONE DATABASE'S TREND LINE. Not fatal — the alarm itself does
      // not depend on it — but `daysUntilFull` answers "no growth reading yet,
      // or it is not growing" for a database whose reading merely failed, and
      // those are opposite sentences. Recorded so the reassuring one can be
      // checked.
      console.error(`db growth reading failed for ${db.name}:`, e)
      await recordWorkerError(
        env.DB,
        "tenancy",
        `cron/size-check (growth reading, ${db.name})`,
        new Error(
          `tonight's size reading for ${db.name} was not stored, so its trend line has a gap and "days until full" cannot be answered for it: ${e instanceof Error ? e.message : String(e)}`
        )
      )
    }
  }
  return written
}

/** TELL A HUMAN — once per NEW alarm, with the trend inside it.
 *
 * The alarm row and the console line were the whole of it: `db_alerts` is readable
 * through an owner-gated route nobody polls, so "we have alarms" meant "we have a
 * table". ARCHITECTURE §7 records that as the gap; this closes it.
 *
 * ONCE PER NEW ALARM, and that is not a cadence this function implements — it is
 * the one `checkDatabaseSizes` already had. It skips a database that has an OPEN
 * alert, so `alerted` is exactly the set that crossed the line TONIGHT. A database
 * sitting at 85% for a month is not re-sent, which is the owner's choice (14 Aug
 * 2026): a nightly repeat of a standing problem is the mail people start filtering,
 * and the thing you want unfiltered is the one that says something CHANGED.
 *
 * ONE MAIL FOR THE WHOLE TICK, not one per database. Up to CRON_ALERT_CAP (50) can
 * alarm on the same night — a bad night for the estate is exactly when 50 separate
 * emails is the wrong answer.
 *
 * THE TREND RIDES ALONG (the owner's other choice): 80% is a position, and what a
 * person needs is how long they have. `daysUntilFull` is read for the alarming
 * databases only, and says so plainly when it cannot answer.
 *
 * FAILS SOFT, AND LOUDLY. The alarm ROW is the record and it is already written;
 * this is the notification. But a notification that silently fails is a database
 * nobody was told about, so the caller records it (R12) rather than shrugging. */
export async function alertNewAlarms(
  env: Env,
  alerted: string[]
): Promise<{ mailed: number; recipients: number }> {
  if (!alerted.length) return { mailed: 0, recipients: 0 }
  const to = (env.ALERT_TO ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
  if (!to.length) {
    // NOT a crash, and not silence either. An environment with no recipient is a
    // configuration state, but "a database crossed 80% and nobody was told" is
    // exactly what §7 says must never be quiet.
    throw new Error(
      `${alerted.length} database(s) crossed the size threshold and ALERT_TO is not set, so nobody was emailed: ${alerted.join(", ")}. Set ALERT_TO on the tenancy worker.`
    )
  }

  // The trend for the alarming databases only. `alerted` is bounded by
  // CRON_ALERT_CAP (50), which is under D1_MAX_BOUND_PARAMS (100) — the one thing
  // to check before binding a list in this repo, and it holds with room to spare.
  const marks = alerted.map(() => "?").join(", ")
  const trend = await env.DB.prepare(
    `SELECT database_name, size_bytes, at, prev_size_bytes, prev_at
       FROM db_growth WHERE database_name IN (${marks})`
  )
    .bind(...alerted)
    .all<{
      database_name: string
      size_bytes: number
      at: string
      prev_size_bytes: number | null
      prev_at: string | null
    }>()
  const byName = new Map((trend.results ?? []).map((r) => [r.database_name, r]))

  // THE ACCOUNT LINE IS NOT A DATABASE LINE, and the difference is the whole
  // point of raising it: every other line's remedy is "run the module mover",
  // and the mover's first step is `d1CreateDatabase` — it SPENDS the resource
  // this one is about. A single mail carrying both sentences would tell somebody
  // to make the worse problem worse, so the account row is lifted out of the
  // per-database wording rather than sharing it.
  const accountAlarmed = alerted.includes(ACCOUNT_STORAGE_NAME)

  const lines = alerted.map((name) => {
    const row = byName.get(name)
    if (name === ACCOUNT_STORAGE_NAME) {
      const days = row ? daysUntilFull(row, D1_MAX_ACCOUNT_BYTES) : null
      const gb = row ? (row.size_bytes / (1024 * 1024 * 1024)).toFixed(0) : "?"
      const when =
        days === null
          ? "no growth reading yet, or it is not growing"
          : days < 1
            ? "FULL WITHIN A DAY at the current rate"
            : `about ${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"} left at the current rate`
      return `EVERY D1 DATABASE ON THIS CLOUDFLARE ACCOUNT together, ${gb} GB of 1024 GB, ${when}. This account is shared with other products, so some of those bytes are not ours and are not ours to reclaim.`
    }
    const days = row ? daysUntilFull(row) : null
    const gb = row ? (row.size_bytes / (1024 * 1024 * 1024)).toFixed(1) : "?"
    // "Not answerable" is said in words rather than as a number, for the same
    // reason daysUntilFull returns null: a made-up figure reads as a measurement.
    const when =
      days === null
        ? "no growth reading yet, or it is not growing"
        : days < 1
          ? "FULL WITHIN A DAY at the current rate"
          : `about ${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"} left at the current rate`
    return `${name}, ${gb} GB of 10 GB, ${when}.`
  })

  let mailed = 0
  for (const address of to) {
    const ok = await sendBrandedEmail(
      env,
      address,
      accountAlarmed
        ? `${brand.name}: the Cloudflare account's D1 storage is filling up`
        : `${brand.name}: a database is filling up`,
      {
        heading: accountAlarmed
          ? "The whole account's D1 storage crossed 80%"
          : alerted.length === 1
            ? "A database crossed 80%"
            : `${alerted.length} databases crossed 80%`,
        intro: lines.join("\n"),
        // The action, not just the fact — the same rule the console line has always
        // followed. OPERATIONS.md § Growth watch is the runbook it points at.
        footnote: accountAlarmed
          ? "DO NOT RUN THE MODULE MOVER for this one. The mover's first step is creating another database, and the ceiling here is the account's TOTAL D1 storage (1 TB), so moving a module spends the very thing that is running out — and when it is gone, D1 refuses new writes and new databases across every tenant at once. The levers that actually work are archiving or deleting data (OPERATIONS.md, Growth watch), asking whether the other products sharing this account can reclaim theirs, or moving to a second Cloudflare account. Any per-database line above is a separate problem with its own, opposite remedy."
          : "Run the module mover for the biggest module in that team's database (OPERATIONS.md, Growth watch). If the team is also SLOW rather than just big, that is the moment to put its database on a native binding (OPERATIONS.md, the native-binding runbook) — the two fixes are independent. There is about 2 GB of headroom left above the alarm line.",
      }
    )
    if (ok) mailed++
  }
  if (!mailed)
    throw new Error(
      `the size alarm could not be emailed to any of ${to.length} recipient(s): ${alerted.join(", ")}`
    )
  return { mailed, recipients: to.length }
}

/** DAYS UNTIL A DATABASE IS FULL, from the two readings above — the sentence a
 * person actually needs, computed rather than eyeballed.
 *
 * `null` when it cannot be answered honestly: no previous reading (a database's
 * first night), no elapsed time between them, or a database that SHRANK or held
 * still. "Not growing" and "growing slowly" are different answers and only one of
 * them is a number; inventing a very large one would read as a measurement.
 *
 * Exported for the admin read and its own test — the arithmetic lives beside the
 * rows it reads, so nobody has to re-derive it at a call site. */
export function daysUntilFull(
  row: {
    size_bytes: number
    at: string
    prev_size_bytes: number | null
    prev_at: string | null
  },
  /** WHICH CEILING this reading is heading for. Defaults to the per-database one,
   * because that is what every existing caller means; the account row measures
   * against `D1_MAX_ACCOUNT_BYTES` instead. A parameter rather than a second
   * function, so the arithmetic that says "how long have I got" exists once —
   * and defaulted, so the ceiling is never silently the wrong one at a call site
   * that predates the account watch. */
  ceilingBytes: number = D1_MAX_DATABASE_BYTES
): number | null {
  if (row.prev_size_bytes === null || row.prev_at === null) return null
  const grew = row.size_bytes - row.prev_size_bytes
  if (grew <= 0) return null
  const days = (new Date(row.at).getTime() - new Date(row.prev_at).getTime()) / 86_400_000
  if (!(days > 0)) return null
  const headroom = ceilingBytes - row.size_bytes
  return Math.max(0, headroom / (grew / days))
}

/**
 * Where does (team, module) live? The team's main database plus any dedicated
 * database the mover created. Modules read with d1QueryAcross over this list.
 */
export async function resolveModuleDatabases(
  env: Env,
  teamId: string,
  module: string
): Promise<string[]> {
  const team = await env.DB.prepare(
    "SELECT database_id FROM teams WHERE id = ? AND db_status = 'ready'"
  )
    .bind(teamId)
    .first<{ database_id: string }>()
  if (!team) throw new Error(`team_not_ready: ${teamId}`)

  const override = await env.DB.prepare(
    "SELECT database_id FROM team_module_databases WHERE team_id = ? AND module = ?"
  )
    .bind(teamId, module)
    .first<{ database_id: string }>()

  // Override FIRST (it's where new writes go), main DB second (older rows
  // pre-move live there until fully relocated — merged reads see both).
  return override
    ? [override.database_id, team.database_id]
    : [team.database_id]
}

/** Merged read across everywhere a (team, module) lives. */
export async function queryModule<Row = Record<string, unknown>>(
  env: Env,
  cfg: D1Rest,
  teamId: string,
  module: string,
  sql: string,
  params: (string | number | null)[] = []
): Promise<Row[]> {
  const dbs = await resolveModuleDatabases(env, teamId, module)
  return d1QueryAcross<Row>(cfg, dbs, sql, params)
}

/** THE MOVE ROW — one per (team, module), the thing that makes a retry a
 * continuation rather than a fresh start. See db/core/0023 for the full argument. */
type MoveRow = {
  id: string
  database_id: string
  source_database_id: string
  tables_json: string
  status: string
  cursors_json: string
  verified_json: string
  drained_json: string
  rows_copied: number
  claimed_at: string | null
}

/** What one call to the mover accomplished. `done` false means exactly one thing:
 * call it again. Nothing is wrong, and nothing needs deciding. */
export type MoveProgress = {
  databaseId: string
  movedRows: number
  done: boolean
  status: string
  /** What this call was working on when it ran out of budget — for a person or a
   * script watching a big move go by. */
  copying?: string
}

const parseList = (json: string): string[] => {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}
const parseCursors = (json: string): Record<string, string> => {
  try {
    const v = JSON.parse(json)
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {}
  } catch {
    return {}
  }
}

/** Write progress back. Every field the caller advanced, in ONE statement, so a
 * call that dies between two writes cannot leave a cursor ahead of its own
 * verification. */
async function saveMove(
  env: Env,
  id: string,
  patch: {
    status?: string
    cursors?: Record<string, string>
    verified?: string[]
    drained?: string[]
    rowsCopied?: number
    claimedAt?: string | null
    lastError?: string | null
  }
): Promise<void> {
  const sets: string[] = ["updated_at = ?"]
  const params: (string | number | null)[] = [new Date().toISOString()]
  /** One column, one value, in step — the pairing is the whole point of the helper. */
  const set = (column: string, value: string | number | null): void => {
    sets.push(`${column} = ?`)
    params.push(value)
  }
  if (patch.status !== undefined) set("status", patch.status)
  if (patch.cursors !== undefined) set("cursors_json", JSON.stringify(patch.cursors))
  if (patch.verified !== undefined) set("verified_json", JSON.stringify(patch.verified))
  if (patch.drained !== undefined) set("drained_json", JSON.stringify(patch.drained))
  if (patch.rowsCopied !== undefined) set("rows_copied", patch.rowsCopied)
  if (patch.claimedAt !== undefined) set("claimed_at", patch.claimedAt)
  if (patch.lastError !== undefined) set("last_error", patch.lastError)
  await env.DB.prepare(`UPDATE team_module_moves SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...params, id)
    .run()
}

/** IS THE MERGED READ PATH ACTUALLY WIRED TO THE APP? — the question the mover
 * never asked, and the reason it must refuse to run.
 *
 * ── WHAT THE MOVER DOES, AND WHAT THE APP DOES ──────────────────────────────
 *
 * The mover copies a module's tables into a dedicated database, verifies the
 * counts, writes the routing row into `team_module_databases`, and then DRAINS
 * the old home — on the stated understanding that "routing has already flipped:
 * `resolveModuleDatabases` now returns both databases and every read is a MERGED
 * read over them" (its own comment, at the drain step).
 *
 * It does not. `requireMember` resolves `guard.databaseId` from `teams.database_id`
 * and consults `team_module_databases` nowhere; every module lib reads that one
 * id. `resolveModuleDatabases` and `queryModule` have no callers outside this
 * file. So the drain empties the database the app is still reading, the mover
 * reports `status: "done"`, the rows are intact in a database nothing queries,
 * and every screen, count, export, agent answer and MCP tool for that module
 * shows zero. On BOTH front doors, for every member of that team.
 *
 * Three documents stated the merged read as present fact (ARCHITECTURE.md,
 * BASE-MANUAL.md, and the mover's own comments); one test already knew better
 * and framed it as a tripwire for the future rather than as the relief valve
 * being unusable now. This is the correction, in the one form that cannot rot:
 * a REFUSAL, and a check that derives the flag's value from whether the read
 * path has production callers (`workers/tenancy/test/merged-read-guard.test.ts`).
 * Wire the reads and the census flips the flag; flip the flag without wiring the
 * reads and the build goes red.
 *
 * THE REFUSAL LIVES AT THE DOOR (`routes/admin.ts`, `moveModule`), not here, and
 * that is not laziness: the mechanics below — the resumable copy, the claim, the
 * OR IGNORE batches, the verify, the bounded drain — are correct and are covered
 * by `mover-resume.test.ts`, and locking the function would make the only proof
 * that they work unrunnable. What is broken is the app's half of the bargain, so
 * the refusal sits where the app is asked to perform it. The door is the mover's
 * ONLY caller, and a census in the guard test asserts that it stays so.
 *
 * ── WHY THE HONEST ANSWER IS "REFUSE", NOT "WIRE IT QUICKLY" ────────────────
 *
 * Because the wiring is not the whole job. `d1QueryAcross` deliberately REFUSES
 * `LIMIT`, `ORDER BY` and `COUNT` once more than one database is involved — a
 * concatenation cannot answer them — and every collection read in this app is
 * paged (R14), sorted at the door, and counted exactly (R16), usually all three.
 * So a merged read that "works" would throw on the first list request after a
 * move. Cross-shard paging is a cursor that encodes a position per shard, a
 * merged sort and a summed count: an architecture decision with an owner's name
 * on it, not a patch. Until that decision is taken, the relief valve is a
 * foot-gun and the safe state is a locked one. */
// Annotated `boolean` rather than left to infer `false`: an inferred literal
// makes the door's refusal a constant condition and the code after it
// unreachable to TypeScript, which is a lie about a branch that is meant to come
// back.
export const SPLIT_READS_WIRED: boolean = false

/**
 * MOVE A MODULE'S TABLES INTO A DATABASE OF THEIR OWN — resumably.
 *
 * This is the one relief valve for a team database that has outgrown D1's 10 GB,
 * and every individual step in it has been bounded for a while: the copy walks by
 * key rather than by offset, the drain deletes in chunks, the verify runs before
 * anything is destroyed. What was NOT bounded was the REQUEST. It is the tool you
 * reach for precisely because a table has millions of rows, so the one thing it
 * could be relied upon to do at that size was get killed halfway — and a killed
 * call left a new database holding part of the data, no routing flip (that is last,
 * deliberately, so the half-done state is the SAFE half), and nothing at all to say
 * it had happened. The only available response was to run it again, which created a
 * second database, orphaned the first, and started from row one.
 *
 * SO THE PROGRESS LIVES IN A ROW, NOT IN A STACK FRAME (`team_module_moves`, and
 * db/core/0023 argues each column). Each call:
 *
 *   1. finds or opens the move row, CLAIMING it so two calls cannot copy the same
 *      table into the same database;
 *   2. does at most COPY_BATCHES_PER_CALL batches of copying, saving the per-table
 *      cursor as it goes;
 *   3. stops and answers `done: false` when the budget runs out — which means "call
 *      me again", not "something went wrong";
 *   4. verifies, flips routing, drains and finishes, each recorded, once all tables
 *      are copied.
 *
 * THE COPY IS IDEMPOTENT, and that stopped being optional today. `INSERT OR IGNORE`
 * rather than `INSERT`: every team table has `id TEXT PRIMARY KEY`, so re-inserting
 * a batch already present is a no-op. It matters for two reasons that arrived from
 * different directions. A resumed call re-copies from the last SAVED cursor, and the
 * batch after that cursor may have landed before the save did. And as of 2026-08-17
 * `d1-rest` retries a transient "internal error" that Cloudflare reports inside an
 * HTTP 200 — so a batch INSERT can now genuinely run twice for one call, which under
 * plain INSERT is 250 duplicate rows that the verify step would catch as a mismatch
 * only after the whole table had been copied. A retry that can double a row is a
 * retry that needs an idempotent write, and this one is now the only kind here.
 *
 * ROUTING IS STILL FLIPPED LAST, and the drain still refuses rather than leaving a
 * half-emptied source behind a flipped route. Those two decisions are unchanged and
 * are the reason an interrupted move is recoverable at all.
 */
export async function moveModuleToOwnDatabase(
  env: Env,
  cfg: D1Rest,
  teamId: string,
  module: string,
  tables: string[],
  /** How many copy batches THIS call may run. Defaults to COPY_BATCHES_PER_CALL.
   *
   * A parameter rather than only a constant for two reasons, and the second is why
   * it is not just test scaffolding: a bounded job whose budget cannot be turned
   * down is a job you cannot slow when it is competing with real traffic, and the
   * person running a move on a busy morning is exactly the person who wants smaller
   * bites. It also makes resumption provable without a hundred thousand fake rows. */
  opts: { batchesPerCall?: number } = {}
): Promise<MoveProgress> {
  const now = new Date().toISOString()

  // Already moved and finished? That is the old error, and it stays an error: the
  // routing row is the fact, and a second move of a module that has one would put
  // its rows in a third place.
  const existing = await env.DB.prepare(
    "SELECT id FROM team_module_databases WHERE team_id = ? AND module = ?"
  )
    .bind(teamId, module)
    .first<{ id: string }>()
  if (existing) throw new Error(`module_already_moved: ${module}`)

  // ── 1 · find or open the move, and CLAIM it ────────────────────────────────
  let move = await env.DB.prepare(
    "SELECT id, database_id, source_database_id, tables_json, status, cursors_json, verified_json, drained_json, rows_copied, claimed_at FROM team_module_moves WHERE team_id = ? AND module = ? AND status <> 'done'"
  )
    .bind(teamId, module)
    .first<MoveRow>()

  if (!move) {
    const team = await env.DB.prepare(
      "SELECT database_id FROM teams WHERE id = ? AND db_status = 'ready'"
    )
      .bind(teamId)
      .first<{ database_id: string }>()
    if (!team) throw new Error(`team_not_ready: ${teamId}`)

    // The database is created FIRST and recorded IMMEDIATELY. The old code created
    // it and remembered it only in a local variable, which is precisely how a
    // killed call orphaned one.
    const newDbId = await d1CreateDatabase(
      cfg,
      `team-${teamId.toLowerCase()}-${module.replaceAll("_", "-")}`
    )
    const id = ulid()
    await env.DB.prepare(
      `INSERT INTO team_module_moves
         (id, team_id, module, database_id, source_database_id, tables_json, status, claimed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'copying', ?, ?)`
    )
      .bind(id, teamId, module, newDbId, team.database_id, JSON.stringify(tables), now, now)
      .run()
    move = {
      id,
      database_id: newDbId,
      source_database_id: team.database_id,
      tables_json: JSON.stringify(tables),
      status: "copying",
      cursors_json: "{}",
      verified_json: "[]",
      drained_json: "[]",
      rows_copied: 0,
      claimed_at: now,
    }
  } else {
    // THE CLAIM RIDES THE UPDATE (CONCURRENCY.md rule 1) — a read-then-write claim
    // is a suggestion under load. Zero rows changed means somebody else holds it
    // and their claim is still fresh.
    const stale = new Date(Date.now() - MOVE_CLAIM_STALE_MS).toISOString()
    const claimed = await env.DB.prepare(
      "UPDATE team_module_moves SET claimed_at = ? WHERE id = ? AND (claimed_at IS NULL OR claimed_at < ?)"
    )
      .bind(now, move.id, stale)
      .run()
    if ((claimed.meta?.changes ?? 0) === 0)
      throw new Error(
        `move_in_progress: another call is moving ${module} for ${teamId} (claimed ${move.claimed_at}). ` +
          `Wait for it to finish, or retry after ${Math.round(MOVE_CLAIM_STALE_MS / 60000)} minutes if it died.`
      )
    // The move's OWN table list wins over the caller's. A second call that named
    // fewer tables would otherwise "finish" a move that had not moved everything.
    const recorded = parseList(move.tables_json)
    if (recorded.length) tables = recorded
  }

  const newDbId = move.database_id
  const sourceDbId = move.source_database_id
  const cursors = parseCursors(move.cursors_json)
  const verified = parseList(move.verified_json)
  const drained = parseList(move.drained_json)
  let movedRows = move.rows_copied
  let budget = Math.max(1, opts.batchesPerCall ?? COPY_BATCHES_PER_CALL)

  // ── 2 · copy, bounded, saving the cursor as it goes ────────────────────────
  for (const table of tables) {
    if (verified.includes(table)) continue // done in an earlier call

    // The schema is recreated only when this table has not been started. `IF NOT
    // EXISTS` is not available for an arbitrary captured DDL string, so the cursor
    // is what says whether to run it — another reason progress is per table.
    if (cursors[table] === undefined) {
      const ddl = await d1Query<{ sql: string }>(
        cfg,
        sourceDbId,
        "SELECT sql FROM sqlite_master WHERE name = ? AND type = 'table'",
        [table]
      )
      if (!ddl[0]) throw new Error(`table_not_found: ${table}`)
      await d1ExecScript(cfg, newDbId, ddl[0].sql)
      const indexes = await d1Query<{ sql: string }>(
        cfg,
        sourceDbId,
        "SELECT sql FROM sqlite_master WHERE tbl_name = ? AND type = 'index' AND sql IS NOT NULL",
        [table]
      )
      for (const idx of indexes) await d1ExecScript(cfg, newDbId, idx.sql)
      cursors[table] = ""
      await saveMove(env, move.id, { cursors })
    }

    for (;;) {
      if (budget <= 0) {
        // OUT OF BUDGET, NOT OUT OF LUCK. Everything up to `cursors[table]` is in
        // the new database and recorded; the next call starts there.
        await saveMove(env, move.id, { cursors, rowsCopied: movedRows, claimedAt: null })
        return {
          databaseId: newDbId,
          movedRows,
          done: false,
          status: "copying",
          copying: table,
        }
      }
      const rows = await d1Query<Record<string, string | number | null>>(
        cfg,
        sourceDbId,
        `SELECT * FROM ${table} WHERE id > ${sqlValue(cursors[table])} ORDER BY id LIMIT ${COPY_BATCH}`
      )
      budget--
      if (rows.length === 0) break
      const cols = Object.keys(rows[0])
      const values = rows.map((r) => `(${cols.map((c) => sqlValue(r[c])).join(", ")})`).join(",\n")
      // OR IGNORE — see the header. A re-run batch is a no-op rather than 250
      // duplicates, which is what makes both a resume and a transport-level retry
      // safe here.
      await d1ExecScript(
        cfg,
        newDbId,
        `INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES\n${values};`
      )
      movedRows += rows.length
      cursors[table] = String(rows[rows.length - 1].id)
      await saveMove(env, move.id, { cursors, rowsCopied: movedRows })
      if (rows.length < COPY_BATCH) break
    }

    // ── 3 · verify this table before anything is destroyed ───────────────────
    const [src] = await d1Query<{ n: number }>(cfg, sourceDbId, `SELECT COUNT(*) AS n FROM ${table}`)
    const [dst] = await d1Query<{ n: number }>(cfg, newDbId, `SELECT COUNT(*) AS n FROM ${table}`)
    if (src.n !== dst.n) {
      const err = `copy_mismatch: ${table} src=${src.n} dst=${dst.n}`
      await saveMove(env, move.id, { lastError: err, claimedAt: null })
      throw new Error(err)
    }
    verified.push(table)
    await saveMove(env, move.id, { verified, cursors, rowsCopied: movedRows })
  }

  await saveMove(env, move.id, { status: "copied" })

  // ── 4 · flip routing, then empty the old home ─────────────────────────────
  // Unchanged in substance and still LAST: until this row exists nothing is routed
  // anywhere, which is what makes every interrupted call above recoverable.
  // Idempotent because a resumed call may already have written it.
  await env.DB.prepare(
    `INSERT OR IGNORE INTO team_module_databases (id, team_id, module, database_id, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(ulid(), teamId, module, newDbId, new Date().toISOString())
    .run()
  await saveMove(env, move.id, { status: "routed" })

  // THE OLD HOME IS EMPTIED IN BOUNDED BITES, and it MUST empty, because routing
  // has already flipped — WHEN THE READ PATH IS WIRED. This comment used to state
  // that as present fact ("`resolveModuleDatabases` now returns both databases and
  // every read is a MERGED read over them"), and it was the sentence that made the
  // whole mover unsafe: nothing consults `team_module_databases`, so this step
  // empties the database the app is still querying. The door refuses the mover for
  // exactly that reason (`SPLIT_READS_WIRED`), which is why this code is reachable
  // only from its own tests today. Once the reads ARE merged, the sentence below is
  // true again and a row left behind here is a row returned twice — a doubled
  // list, a doubled count, doubled money.
  //
  // `DELETE FROM <table>;` was one statement over a table this function only runs
  // on when it has grown too big for its database. D1 refuses a statement past 30
  // seconds, so on a multi-million-row table that DELETE was the one step
  // guaranteed to fail — and it failed AFTER the routing flip had committed,
  // leaving exactly the doubled state above with nothing to say so.
  //
  // So it is chunked, and it is VERIFIED. Not draining is not a warning here; it
  // is a state a person has to fix before the module is read again, and the only
  // honest thing to do is say which table and stop. Per-table progress is recorded
  // so a call killed mid-drain resumes instead of restarting the passes.
  for (const table of tables) {
    if (drained.includes(table)) continue
    let left = 0
    for (let pass = 0; ; pass++) {
      await d1ExecScript(
        cfg,
        sourceDbId,
        `DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} LIMIT ${RETENTION_DELETE_CAP});`
      )
      const [remaining] = await d1Query<{ n: number }>(
        cfg,
        sourceDbId,
        `SELECT COUNT(*) AS n FROM ${table}`
      )
      left = remaining?.n ?? 0
      if (left === 0) break
      if (pass >= MOVE_DRAIN_PASSES) {
        const err =
          `move_drain_incomplete: ${table} still holds ${left} rows in the OLD database after ` +
          `${MOVE_DRAIN_PASSES} passes. Routing is already pointing at ${newDbId}, so reads are ` +
          `MERGED and these rows are duplicates, empty ${table} in ${sourceDbId} before ` +
          `the module is read again.`
        await saveMove(env, move.id, { lastError: err, claimedAt: null })
        throw new Error(err)
      }
    }
    drained.push(table)
    await saveMove(env, move.id, { drained })
  }

  await env.DB.prepare(
    "UPDATE db_alerts SET resolved_at = ? WHERE database_id = ? AND resolved_at IS NULL"
  )
    .bind(new Date().toISOString(), sourceDbId)
    .run()

  await saveMove(env, move.id, { status: "done", claimedAt: null, lastError: null })
  return { databaseId: newDbId, movedRows, done: true, status: "done" }
}
