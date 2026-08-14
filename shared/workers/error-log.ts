// The ONE server-side error-RECORDING seam (ERROR-HANDLING.md). Every worker's
// central catch calls `logError` right after its console.error, so an unexpected
// crash lands in the core `error_logs` table (90-day-ish owned history + the
// resolve workflow) as well as Cloudflare's short-lived console logs. The gateway
// forwards client beacons into the same table via auth's /internal/log-error.
//
// Contract: RECORDING AN ERROR MUST NEVER THROW and never change the response —
// everything is capped and wrapped. Clean GuardError refusals (4xx) are never
// logged; this table is for the unexpected only.

import { ulid } from "./id"

/** The slice of a D1 binding this seam uses — structural, so shared/ compiles in
 * every workspace (the web tsconfig has no Workers types). The real `env.DB`
 * satisfies it. */
export type CoreDb = {
  prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown> } }
}

export type ErrorReport = {
  source: string
  place: string
  message: string
  stack?: string
  teamId?: string
  userId?: string
  url?: string
  /** The id the public door minted for this request, carried on every internal
   * hop (shared/workers/trace.ts). Optional because a cron tick is not a
   * request and has no id to carry — and inventing one there would suggest a
   * click that never happened. */
  requestId?: string
}

/** How many rows one BUCKET may write to the store in a trailing hour.
 *
 * A bucket is the caller a row is charged to: the signed-in person whose browser
 * beaconed it, or — for a worker's own central catch, which has no user — the
 * worker that crashed. Per-bucket rather than global, so a flood of client
 * beacons can never spend the budget a crashing worker needs to report itself.
 *
 * The number is deliberately generous for a HUMAN and useless for a LOOP. Two a
 * minute is far more than any real debugging session produces; nobody diagnoses
 * anything from row 121 of the same hour, and the live console tail still has
 * every one of them. What it buys is that `POST /api/log/client` — whose body is
 * entirely the caller's — can no longer grow the GLOBAL core database without
 * limit. Field lengths were already capped; the row COUNT was not. */
export const MAX_ERROR_LOGS_PER_HOUR = 120

export async function logError(db: CoreDb, r: ErrorReport): Promise<void> {
  try {
    const now = new Date()
    // THE BUDGET RIDES THE WRITE (CONCURRENCY.md, and the same shape as the
    // login-send ledger): the ceiling sits in the INSERT's own WHERE, so a burst
    // of beacons cannot all read "under the line" and all write. Over the line
    // the statement simply moves zero rows — which is not an error and must not
    // become one: this seam's whole contract is that recording never throws and
    // never changes the response, so a dropped row is silence, exactly as a
    // failed insert already was.
    await db
      .prepare(
        `INSERT INTO error_logs (id, at, source, place, message, stack, team_id, user_id, url, request_id)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE (SELECT COUNT(*) FROM error_logs
                  WHERE COALESCE(user_id, source) = ? AND at > ?) < ?`
      )
      .bind(
        ulid(),
        now.toISOString(),
        String(r.source).slice(0, 40),
        String(r.place).slice(0, 200),
        String(r.message).slice(0, 500),
        r.stack ? String(r.stack).slice(0, 2000) : null,
        r.teamId ?? null,
        r.userId ?? null,
        r.url ? String(r.url).slice(0, 300) : null,
        // Capped like every other caller-influenced field: the id may have come
        // from an outside tool's own header (trace.ts keeps a sane one).
        r.requestId ? String(r.requestId).slice(0, 64) : null,
        // The bucket, matching the row this statement would write — and matching
        // idx_error_logs_bucket_at (core 0019), so the count is an index seek and
        // not a scan of the one table built to grow.
        r.userId ?? String(r.source).slice(0, 40),
        new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
        MAX_ERROR_LOGS_PER_HOUR
      )
      .run()
  } catch {
    /* recording must never break the request */
  }
}

/** The central-catch one-liner: console (for live tails) + the table (for history).
 * `e` is whatever was thrown; `place` is "<METHOD> <pathname>".
 *
 * `requestId` is what makes the console line and the row FILTERABLE together —
 * pass the id off the request (`requestId(request)`) so this worker's row joins
 * the rows every other worker wrote for the same click. A cron tick has none,
 * and passes nothing. */
export async function recordWorkerError(
  db: CoreDb,
  source: string,
  place: string,
  e: unknown,
  requestId?: string
): Promise<void> {
  const err = e instanceof Error ? e : new Error(String(e))
  await logError(db, { source, place, message: err.message, stack: err.stack, requestId })
}
