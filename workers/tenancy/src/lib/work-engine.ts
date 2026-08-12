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
// The probe is ONE round trip and it reads the schema the tables were actually
// created with, so the second thing it settles is the ONE contract ambiguity
// between the lanes: BUILD-1 writes `sold_price`, and every money column on this
// side is whole cents (`_cents`). Whichever of the two the work engine ships,
// this reads it and converts once, here, rather than in four callers.

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

/** Does this database have the work engine yet, and what did it call its price
 * column? One query against sqlite_master — the table list and the DDL text that
 * created each one. */
async function borrowedSchema(
  cfg: D1Rest,
  guard: MemberGuard
): Promise<{ ready: boolean; priceColumn: "sold_price_cents" | "sold_price" | null }> {
  const rows = await d1Query<{ name: string; sql: string | null }>(
    cfg,
    guard.databaseId,
    // Bounded by construction: two names, one row each.
    `SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name IN (${BORROWED.map(() => "?").join(", ")})`,
    [...BORROWED]
  )
  const found = new Set(rows.map((r) => r.name))
  if (!BORROWED.every((t) => found.has(t))) return { ready: false, priceColumn: null }
  const sprintDdl = rows.find((r) => r.name === "sprints")?.sql ?? ""
  // Cents first: if the work engine ships both spellings, the integer one is the
  // one that cannot lose a half-penny on the way through a float.
  const priceColumn = /\bsold_price_cents\b/.test(sprintDdl)
    ? "sold_price_cents"
    : /\bsold_price\b/.test(sprintDdl)
      ? "sold_price"
      : null
  return { ready: priceColumn !== null, priceColumn }
}

/** The two borrowed numbers for ONE account.
 *
 * `accountId` is resolved by the CALLER through the account fence before it gets
 * here — this file reads two aggregate sums and returns no rows, so there is
 * nothing here for a fence to protect, and there must be nothing: a SUM is not a
 * disclosure, and the only door that reaches it is refused to client logins
 * outright (lib/internal-money.ts, R23). */
export async function workEngineFacts(
  cfg: D1Rest,
  guard: MemberGuard,
  accountId: string
): Promise<WorkEngineFacts> {
  const schema = await borrowedSchema(cfg, guard)
  if (!schema.ready || !schema.priceColumn) return { ready: false, soldCents: 0, loggedSeconds: 0 }

  const [sold, logged] = await Promise.all([
    d1Query<{ n: number | null }>(
      cfg,
      guard.databaseId,
      // The column name is a code literal chosen from a fixed pair above — never
      // a request value — and the account id is bound.
      `SELECT SUM(${schema.priceColumn}) AS n FROM sprints WHERE account_id = ?`,
      [accountId]
    ),
    d1Query<{ n: number | null }>(
      cfg,
      guard.databaseId,
      `SELECT SUM(seconds) AS n FROM work_logs WHERE account_id = ?`,
      [accountId]
    ),
  ])

  const rawSold = sold[0]?.n ?? 0
  return {
    ready: true,
    // ONE conversion, here. A price stored in major units becomes whole cents;
    // one already in cents is passed through. Rounded rather than truncated, so
    // 49.99 is 4999 and not 4998.
    soldCents: schema.priceColumn === "sold_price_cents" ? Math.round(rawSold) : Math.round(rawSold * 100),
    loggedSeconds: Math.max(0, Math.round(logged[0]?.n ?? 0)),
  }
}
