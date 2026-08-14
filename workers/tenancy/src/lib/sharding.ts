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
        `D1 SIZE ALARM: stopped at the ${CRON_ALERT_CAP}-alarm ceiling for this run — more databases are over the threshold; tomorrow's run continues.`
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
    return `${name} — ${gb} GB of 10 GB, ${when}.`
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

/**
 * THE MOVER: relocate a module's tables from a team's main database into a
 * brand-new dedicated database. Copies schema + indexes + rows (batched),
 * verifies counts, flips routing, then empties the old tables. Any open size
 * alarm for the source database is marked resolved.
 */
export async function moveModuleToOwnDatabase(
  env: Env,
  cfg: D1Rest,
  teamId: string,
  module: string,
  tables: string[]
): Promise<{ databaseId: string; movedRows: number }> {
  const team = await env.DB.prepare(
    "SELECT database_id FROM teams WHERE id = ? AND db_status = 'ready'"
  )
    .bind(teamId)
    .first<{ database_id: string }>()
  if (!team) throw new Error(`team_not_ready: ${teamId}`)

  const existing = await env.DB.prepare(
    "SELECT id FROM team_module_databases WHERE team_id = ? AND module = ?"
  )
    .bind(teamId, module)
    .first<{ id: string }>()
  if (existing) throw new Error(`module_already_moved: ${module}`)

  const newDbId = await d1CreateDatabase(
    cfg,
    `team-${teamId.toLowerCase()}-${module.replaceAll("_", "-")}`
  )

  let movedRows = 0
  for (const table of tables) {
    // 1 · Recreate the table + its indexes exactly as they exist today.
    const ddl = await d1Query<{ sql: string }>(
      cfg,
      team.database_id,
      "SELECT sql FROM sqlite_master WHERE name = ? AND type = 'table'",
      [table]
    )
    if (!ddl[0]) throw new Error(`table_not_found: ${table}`)
    await d1ExecScript(cfg, newDbId, ddl[0].sql)

    const indexes = await d1Query<{ sql: string }>(
      cfg,
      team.database_id,
      "SELECT sql FROM sqlite_master WHERE tbl_name = ? AND type = 'index' AND sql IS NOT NULL",
      [table]
    )
    for (const idx of indexes) await d1ExecScript(cfg, newDbId, idx.sql)

    // 2 · Copy rows in batches (values inlined — the script API has no params;
    //     team tables hold text/numbers only, no blobs).
    //
    //     BY KEY, NOT BY OFFSET. This walked `LIMIT 250 OFFSET n`, and offset
    //     paging is wrong here twice over: SQLite reaches offset 4,000,000 by
    //     reading and discarding four million rows, so copying a big table costs
    //     O(n²) reads — and this is the tool you reach for precisely BECAUSE the
    //     table is big. Worse, the window shifts under a concurrent insert or
    //     delete, so rows could be copied twice or skipped, which step 3 would
    //     then report as a count mismatch after the whole copy had run.
    //
    //     Every team table has `id TEXT PRIMARY KEY`, so "everything after the
    //     last id I copied" is an index seek — constant cost per batch, and stable
    //     under writes. Exactly the reasoning shared/workers/paging.ts states for
    //     screens; the mover is the one place it mattered most and did not have it.
    let after = ""
    for (;;) {
      const rows = await d1Query<Record<string, string | number | null>>(
        cfg,
        team.database_id,
        `SELECT * FROM ${table} WHERE id > ${sqlValue(after)} ORDER BY id LIMIT ${COPY_BATCH}`
      )
      if (rows.length === 0) break
      const cols = Object.keys(rows[0])
      const values = rows
        .map((r) => `(${cols.map((c) => sqlValue(r[c])).join(", ")})`)
        .join(",\n")
      await d1ExecScript(
        cfg,
        newDbId,
        `INSERT INTO ${table} (${cols.join(", ")}) VALUES\n${values};`
      )
      movedRows += rows.length
      after = String(rows[rows.length - 1].id)
      if (rows.length < COPY_BATCH) break
    }

    // 3 · Verify before touching the source.
    const [src] = await d1Query<{ n: number }>(cfg, team.database_id, `SELECT COUNT(*) AS n FROM ${table}`)
    const [dst] = await d1Query<{ n: number }>(cfg, newDbId, `SELECT COUNT(*) AS n FROM ${table}`)
    if (src.n !== dst.n)
      throw new Error(`copy_mismatch: ${table} src=${src.n} dst=${dst.n}`)
  }

  // 4 · Flip routing, then empty the moved tables in the old home.
  await env.DB.prepare(
    `INSERT INTO team_module_databases (id, team_id, module, database_id, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(ulid(), teamId, module, newDbId, new Date().toISOString())
    .run()
  // THE OLD HOME IS EMPTIED IN BOUNDED BITES, and it MUST empty, because routing
  // has already flipped: `resolveModuleDatabases` now returns both databases and
  // every read is a MERGED read over them. A row left behind here is a row
  // returned twice — a doubled list, a doubled count, doubled money.
  //
  // `DELETE FROM <table>;` was one statement over a table this function only runs
  // on when it has grown too big for its database. D1 refuses a statement past 30
  // seconds, so on a multi-million-row table that DELETE was the one step
  // guaranteed to fail — and it failed AFTER the routing flip had committed,
  // leaving exactly the doubled state above with nothing to say so. The same
  // sentence shared/workers/retention.ts already had to learn: "a DELETE is
  // exactly as unbounded as a SELECT".
  //
  // So it is chunked, and it is VERIFIED. Not draining is not a warning here; it
  // is a state a person has to fix before the module is read again, and the only
  // honest thing to do is say which table and stop.
  for (const table of tables) {
    let left = 0
    for (let pass = 0; ; pass++) {
      await d1ExecScript(
        cfg,
        team.database_id,
        `DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} LIMIT ${RETENTION_DELETE_CAP});`
      )
      const [remaining] = await d1Query<{ n: number }>(
        cfg,
        team.database_id,
        `SELECT COUNT(*) AS n FROM ${table}`
      )
      left = remaining?.n ?? 0
      if (left === 0) break
      if (pass >= MOVE_DRAIN_PASSES)
        throw new Error(
          `move_drain_incomplete: ${table} still holds ${left} rows in the OLD database after ` +
            `${MOVE_DRAIN_PASSES} passes. Routing is already pointing at ${newDbId}, so reads are ` +
            `MERGED and these rows are duplicates — empty ${table} in ${team.database_id} before ` +
            `the module is read again.`
        )
    }
  }

  await env.DB.prepare(
    "UPDATE db_alerts SET resolved_at = ? WHERE database_id = ? AND resolved_at IS NULL"
  )
    .bind(new Date().toISOString(), team.database_id)
    .run()

  return { databaseId: newDbId, movedRows }
}
