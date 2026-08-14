// THE CORE DATABASE'S RETENTION SWEEP — the nightly delete that stops the ONE
// shared database growing forever on rows nothing will ever read again.
//
// The base is careful about GROWTH everywhere it can see it: every list is
// capped, every collection that grows pages, every repeatable write into core
// now carries a per-caller ceiling. None of that is retention. A ceiling bounds
// the RATE; only a sweep bounds the TOTAL — and three tables here are written by
// callers who are not signed in at all (a sign-in code and its ledger row are
// minted for anyone who types an email address), so their total was bounded by
// nothing but the size of the internet's patience.
//
// WHAT IT TAKES, AND WHY EACH IS SAFE TO TAKE:
//   • login_codes  — a code lives ten minutes and the per-address hourly cap
//                    looks back one hour. A day-old row cannot change any answer.
//   • login_sends  — the send budget's whole window is one hour (limits.ts).
//   • sessions     — rows already PAST their own expires_at. The cookie they
//                    describe is already dead: every read re-checks expiry, so
//                    deleting the row signs nobody out who was still signed in.
//
// WHAT IT NEVER TAKES: anything anyone might have to answer for later. Activity,
// account activity, error logs, usage and the audit blocks all stay — "deactivate,
// never delete" is about the RECORD, and a spent sign-in code is not a record.
//
// BOUNDED, LIKE EVERY OTHER PIECE OF UNATTENDED WORK (R14's other axis). A DELETE
// is exactly as unbounded as a SELECT: an estate swept for the first time after a
// year would try to remove millions of rows in one statement, time out, delete
// nothing — and do the same again tomorrow, forever. So each STATEMENT takes at
// most RETENTION_DELETE_CAP rows, chosen by an inner SELECT with its own LIMIT
// (SQLite only accepts LIMIT on DELETE in builds compiled for it; D1's is not
// one).
//
// AND THE TICK RUNS THAT STATEMENT MORE THAN ONCE, which is the part that was
// missing. A cap on the statement is a cap on what can time out; it is not a cap
// on the night, and this sweep used to have only the first. One pass of 5,000 rows
// a night against a shared database taking sign-ins from every tenant is not
// retention — a quarter-million-person tenant produces more sign-in artefacts
// before lunch than a night could remove, and the tables grew monotonically while
// a green nightly job reported success. Now each table gets up to
// RETENTION_PASSES_PER_TICK bounded statements and stops the moment one comes back
// short, so "catching up takes a few nights and always finishes" is a property of
// the code rather than a hope about volume.
//
// WHAT IT NOW ALSO TAKES: `error_logs`, past ERROR_LOG_RETENTION_DAYS — the window
// db/core/0012 has claimed since the table was created and nothing had ever
// enforced. Diagnostics, not a record: the audit tables above stay untouched.

import {
  AUTH_RETENTION_HOURS,
  ERROR_LOG_RETENTION_DAYS,
  RETENTION_DELETE_CAP,
  RETENTION_PASSES_PER_TICK,
} from "./limits"

/** The slice of a D1 binding this seam uses — structural, so shared/ compiles in
 * every workspace (the web tsconfig has no Workers types). The real `env.DB`
 * satisfies it. */
type CoreDb = {
  prepare(sql: string): {
    bind(...values: unknown[]): { run(): Promise<{ meta: { changes?: number } }> }
  }
}

/** What one nightly sweep removed, per table — reported so the cron can say it
 * out loud, and so a sweep that hits its ceiling is visible rather than silent. */
export type SweepReport = { deleted: Record<string, number>; capped: string[] }

/** One bounded delete. The predicate names the rows; the inner SELECT bounds how
 * many of them go tonight. */
const boundedDelete = (table: string, predicate: string) =>
  `DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} WHERE ${predicate} LIMIT ?)`

/** The sweeps, as data — so adding another is a line here rather than a new loop,
 * and so the test can walk the same list the sweep does. Every predicate below has
 * an index behind it (db/core/0015, 0017 and 0021); a sweep whose predicate has to
 * scan the table is the timeout this whole file exists to avoid, wearing a LIMIT. */
const SWEEPS: { table: string; sql: string; args: (cutoff: string, now: string) => unknown[] }[] = [
  {
    table: "login_codes",
    sql: boundedDelete("login_codes", "created_at < ?"),
    args: (cutoff) => [cutoff, RETENTION_DELETE_CAP],
  },
  {
    table: "login_sends",
    sql: boundedDelete("login_sends", "created_at < ?"),
    args: (cutoff) => [cutoff, RETENTION_DELETE_CAP],
  },
  {
    // Expiry, not age: a session slides its own expires_at forward while it is
    // being used, so "created a month ago" says nothing about whether the person
    // is signed in right now. Only a row that has already expired is dead.
    table: "sessions",
    sql: boundedDelete("sessions", "expires_at < ?"),
    args: (_cutoff, now) => [now, RETENTION_DELETE_CAP],
  },
  {
    // ITS OWN WINDOW, not AUTH_RETENTION_HOURS: the sign-in artefacts above are
    // spent in minutes, and an error log is read weeks later by whoever is asking
    // what broke. ERROR_LOG_RETENTION_DAYS is the number db/core/0012 already
    // named — this is the code that finally makes it true.
    table: "error_logs",
    sql: boundedDelete("error_logs", "at < ?"),
    args: (_cutoff, now) => [
      new Date(new Date(now).getTime() - ERROR_LOG_RETENTION_DAYS * 86_400_000).toISOString(),
      RETENTION_DELETE_CAP,
    ],
  },
]

/** Sweep the core database once. Never throws: one table's failure must not stop
 * the other two, and the caller (a cron) records what came back. */
export async function sweepCoreRetention(db: CoreDb, now: Date = new Date()): Promise<SweepReport> {
  const nowIso = now.toISOString()
  const cutoff = new Date(now.getTime() - AUTH_RETENTION_HOURS * 60 * 60 * 1000).toISOString()
  const deleted: Record<string, number> = {}
  const capped: string[] = []

  for (const sweep of SWEEPS) {
    let total = 0
    try {
      // UP TO RETENTION_PASSES_PER_TICK bounded statements, stopping the moment
      // one comes back short — a short pass means the predicate found fewer rows
      // than it was allowed to take, which is the only honest signal that there is
      // nothing left. Serial on purpose: these are DELETEs against one database,
      // and running them together would just be the same work with contention.
      for (let pass = 0; pass < RETENTION_PASSES_PER_TICK; pass++) {
        const out = await db.prepare(sweep.sql).bind(...sweep.args(cutoff, nowIso)).run()
        const n = out.meta.changes ?? 0
        total += n
        if (n < RETENTION_DELETE_CAP) break
        // A FULL last pass is not a finished sweep. Reaching the pass ceiling means
        // there is more to take, so it is named — otherwise a table that never
        // catches up looks identical to one that had nothing left.
        if (pass === RETENTION_PASSES_PER_TICK - 1) capped.push(sweep.table)
      }
      deleted[sweep.table] = total
    } catch (e) {
      // Whatever earlier passes removed is already committed and still counted —
      // a sweep that failed on pass 30 did 29 passes of real work, and reporting
      // zero would make a partly-successful night look like a broken one.
      console.error(`retention sweep failed for ${sweep.table}:`, e)
      deleted[sweep.table] = total
    }
  }
  return { deleted, capped }
}
