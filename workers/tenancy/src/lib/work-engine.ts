// THE TWO FACTS THIS BUILD BORROWS FROM THE WORK ENGINE — and the one place it
// borrows them.
//
// Process maps, savings, rate cards and margin hang off apps, processes and
// steps, all of which this build owns. The money needs exactly two numbers it
// does not own, both declared by .plans/BUILD-1:
//
//   • WHAT WAS SOLD — a flat price on the sprint row (BUILD-1 §3: "a sprint row
//     carries sold_price + currency"). This is revenue.
//   • HOW LONG IT TOOK US — whole seconds on the work log (BUILD-1 §5: "One
//     click to start. Whole seconds."). This is our own cost, once an internal
//     rate is applied to it (lib/internal-money.ts).
//
// THE TWO LANES ARE BEING BUILT AT THE SAME TIME, so this file is written
// against the declaration rather than against the code, and it says so out loud
// rather than crashing when the tables are not there yet. That is not defensive
// padding: a team database is migrated by an ops route (POST
// /api/tenancy/admin/migrate-teams), one team at a time, so "this database has
// not rolled that migration yet" is a real production state and not a
// hypothetical. A margin screen that answers "no logged time recorded yet" is
// honest; one that 500s is a broken page, and one that quietly reports 100%
// margin because nothing was subtracted is the exact failure this build exists
// to prevent.
//
// THE ONE CONTRACT AMBIGUITY IS NOW SETTLED, and this comment is what is left of
// it. This file used to probe `sqlite_master` for which of two spellings the work
// engine had shipped — `sold_price` (BUILD-1 §3's words) or `sold_price_cents`
// (every money column on this side) — and convert accordingly. The work engine
// landed on 12 Aug 2026 with `sold_price_cents`, for the reason this side already
// had: a price in major units is a float, and a float loses a half-penny
// somewhere between a form and a subtraction. So the fork is gone and the two
// lanes speak whole cents end to end.
//
// What is NOT gone is the `ready` probe. A team database is migrated by an ops
// route one team at a time, so "this database has not rolled that migration yet"
// stays a real production state — and a margin screen that answers "no logged
// time recorded yet" is honest, while one that quietly reports 100% margin
// because nothing was subtracted is the exact failure this build exists to
// prevent.

import { d1Query, type D1Rest } from "@shared/workers/d1-rest"
import type { MemberGuard } from "./permissions"

/** What the borrow found. `ready` false means the work engine's tables are not
 * in this database yet — every figure is zero and the caller SAYS SO on screen,
 * rather than presenting an unsubtracted number as a result. */
export type WorkEngineFacts = {
  ready: boolean
  /** flat prices sold to this account, in whole cents */
  soldCents: number
  /** whole seconds of our own time logged against this account's work */
  loggedSeconds: number
}

/** The tables this build reads and never writes. Named here so a reader can see
 * the whole borrowed surface in one line. */
const BORROWED = ["sprints", "work_logs"] as const

/** Does this database have the work engine yet? One query against sqlite_master:
 * both tables present, and the sprint one carrying the cents column the two lanes
 * settled on. Anything else is "not migrated here yet", answered honestly. */
async function borrowedSchema(cfg: D1Rest, guard: MemberGuard): Promise<{ ready: boolean }> {
  const rows = await d1Query<{ name: string; sql: string | null }>(
    cfg,
    guard.databaseId,
    // Bounded by construction: two names, one row each.
    `SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name IN (${BORROWED.map(() => "?").join(", ")})`,
    [...BORROWED]
  )
  const found = new Set(rows.map((r) => r.name))
  if (!BORROWED.every((t) => found.has(t))) return { ready: false }
  const sprintDdl = rows.find((r) => r.name === "sprints")?.sql ?? ""
  return { ready: /\bsold_price_cents\b/.test(sprintDdl) }
}

/** The two borrowed numbers for ONE account.
 *
 * `accountId` is resolved by the CALLER through the account fence before it gets
 * here — this file reads two aggregate sums and returns no rows, so there is
 * nothing here for a fence to protect, and there must be nothing: a SUM is not a
 * disclosure, and the only door that reaches it is refused to client logins
 * outright (lib/internal-money.ts, R24). */
export async function workEngineFacts(
  cfg: D1Rest,
  guard: MemberGuard,
  accountId: string
): Promise<WorkEngineFacts> {
  const schema = await borrowedSchema(cfg, guard)
  if (!schema.ready) return { ready: false, soldCents: 0, loggedSeconds: 0 }

  const [sold, logged] = await Promise.all([
    d1Query<{ n: number | null }>(
      cfg,
      guard.databaseId,
      `SELECT SUM(sold_price_cents) AS n FROM sprints WHERE account_id = ?`,
      [accountId]
    ),
    d1Query<{ n: number | null }>(
      cfg,
      guard.databaseId,
      `SELECT SUM(seconds) AS n FROM work_logs WHERE account_id = ?`,
      [accountId]
    ),
  ])

  return {
    ready: true,
    // No conversion left to make — the column is whole cents on the other side of
    // the fence too. Rounded anyway, because SUM over an integer column comes
    // back through JSON and a number is a number until somebody proves otherwise.
    soldCents: Math.max(0, Math.round(sold[0]?.n ?? 0)),
    loggedSeconds: Math.max(0, Math.round(logged[0]?.n ?? 0)),
  }
}
