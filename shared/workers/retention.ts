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
// nothing — and do the same again tomorrow, forever. So each table gives up at
// most RETENTION_DELETE_CAP rows a night, chosen by an inner SELECT with its own
// LIMIT (SQLite only accepts LIMIT on DELETE in builds compiled for it; D1's is
// not one). Catching up takes a few nights and always finishes.

import { AUTH_RETENTION_HOURS, RETENTION_DELETE_CAP } from "./limits"

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

/** The three sweeps, as data — so adding a fourth is a line here rather than a
 * new loop, and so the test can walk the same list the sweep does. */
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
]

/** Sweep the core database once. Never throws: one table's failure must not stop
 * the other two, and the caller (a cron) records what came back. */
export async function sweepCoreRetention(db: CoreDb, now: Date = new Date()): Promise<SweepReport> {
  const nowIso = now.toISOString()
  const cutoff = new Date(now.getTime() - AUTH_RETENTION_HOURS * 60 * 60 * 1000).toISOString()
  const deleted: Record<string, number> = {}
  const capped: string[] = []

  for (const sweep of SWEEPS) {
    try {
      const out = await db.prepare(sweep.sql).bind(...sweep.args(cutoff, nowIso)).run()
      const n = out.meta.changes ?? 0
      deleted[sweep.table] = n
      // A FULL sweep is not a finished one. Hitting the ceiling means there is
      // more to take, so it is named — otherwise a table that never catches up
      // looks identical to one that had nothing left.
      if (n >= RETENTION_DELETE_CAP) capped.push(sweep.table)
    } catch (e) {
      console.error(`retention sweep failed for ${sweep.table}:`, e)
      deleted[sweep.table] = 0
    }
  }
  return { deleted, capped }
}
