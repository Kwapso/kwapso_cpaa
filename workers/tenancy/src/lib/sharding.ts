// The sharding machinery (locked decision: built up front).
//
// Relief valves, in order of reach:
//  1. ALARM  — nightly cron sizes every database in the account (the team ones
//              AND the shared core); ≥80% of D1's 10GB cap writes a db_alerts
//              row + screams into the worker logs.
//  2. MOVER  — relocates one module's tables out of a team's database into a
//              dedicated database, recorded in team_module_databases.
//  3. SPLIT  — reads for a (team, module) can span several databases via
//              resolveModuleDatabases() + d1QueryAcross() (the merged-read
//              path modules will use).

import {
  d1CreateDatabase,
  d1ExecScript,
  d1ListDatabases,
  d1Query,
  d1QueryAcross,
  sqlValue,
  type D1Rest,
} from "@shared/workers/d1-rest"
import { ulid } from "@shared/workers/id"
import { brand } from "@shared/brand"
import { CRON_ALERT_CAP, CRON_GROWTH_CAP, RETENTION_DELETE_CAP } from "@shared/workers/limits"
import { sendBrandedEmail } from "@shared/workers/notify"
import type { Env } from "../env"

/** D1's hard per-database ceiling (Cloudflare's published D1 limits, checked
 * 14 Aug 2026). Named rather than left implicit inside the 80% below, because the
 * growth arithmetic needs the ceiling itself: "how long have I got" is headroom
 * divided by a rate, and headroom is measured from HERE, not from the alarm. */
export const D1_MAX_DATABASE_BYTES = 10 * 1024 * 1024 * 1024

/** 80% of D1's 10GB per-database cap. */
export const ALERT_THRESHOLD_BYTES = 8 * 1024 * 1024 * 1024
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
 * So the filter is gone rather than widened: an app owns its Cloudflare account
 * (BOOTSTRAP.md), so "every database this listing returns" IS "every database we
 * run", and a database added tomorrow is watched the day it exists instead of the
 * day someone remembers to add its prefix here.
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
): Promise<{ checked: number; alerted: string[]; capped: boolean; sampled: number }> {
  const databases = await d1ListDatabases(cfg)
  const alerted: string[] = []
  let capped = false
  // The trend first, because it is what turns a POSITION into a WARNING — and
  // because it must be recorded even on a night when nothing alarms.
  const sampled = await recordGrowth(env, databases)

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
  return { checked: databases.length, alerted, capped, sampled }
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
  databases: { uuid: string; name: string; file_size: number | null }[]
): Promise<number> {
  const biggest = [...databases]
    .sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0))
    .slice(0, CRON_GROWTH_CAP)
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
      written++
    } catch (e) {
      console.error(`db growth reading failed for ${db.name}:`, e)
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

  const lines = alerted.map((name) => {
    const row = byName.get(name)
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
    const ok = await sendBrandedEmail(env, address, `${brand.name}: a database is filling up`, {
      heading: alerted.length === 1 ? "A database crossed 80%" : `${alerted.length} databases crossed 80%`,
      intro: lines.join("\n"),
      // The action, not just the fact — the same rule the console line has always
      // followed. OPERATIONS.md § Growth watch is the runbook it points at.
      footnote:
        "Run the module mover for the biggest module in that team's database (OPERATIONS.md, Growth watch). There is about 2 GB of headroom left above the alarm line.",
    })
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
export function daysUntilFull(row: {
  size_bytes: number
  at: string
  prev_size_bytes: number | null
  prev_at: string | null
}): number | null {
  if (row.prev_size_bytes === null || row.prev_at === null) return null
  const grew = row.size_bytes - row.prev_size_bytes
  if (grew <= 0) return null
  const days = (new Date(row.at).getTime() - new Date(row.prev_at).getTime()) / 86_400_000
  if (!(days > 0)) return null
  const headroom = D1_MAX_DATABASE_BYTES - row.size_bytes
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
  // has already flipped: `resolveModuleDatabases` now returns both databases and
  // every read is a MERGED read over them. A row left behind here is a row
  // returned twice — a doubled list, a doubled count, doubled money.
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
