// THE REFERENCE NUMBER — the short code a client quotes on the phone and in
// every email we send them (SCOPE ch.02: "BERG-T0412", "BERG-S0188").
//
// ONE implementation, for every noun that carries one: tickets, stories, tasks,
// to-dos and sprints (BUILD-1 §4). It started life private inside lib/help.ts,
// which was correct while a ticket was the only thing with a number; the moment
// a second noun needed one, a copy would have been a second counter with the
// same name and its own race.
//
// PER ACCOUNT, not global. Glide's numbers are global and fully interleaved
// (CONFIA runs 61–3447 while Padelbase runs 721–3444), so continuity was never
// on offer — and a number a client quotes should count THEIR requests, not ours
// and every other client's.

import { d1Query, type D1Rest } from "@shared/workers/d1-rest"
import type { MemberGuard } from "@shared/workers/gating"

/** The kinds of thing that carry a reference, and the letter each one wears.
 * Named here rather than passed as a free string so a typo cannot mint a second
 * counter beside the real one — `BERG-t0001` and `BERG-T0001` would be two
 * sequences, both plausible, and nobody would notice for months. */
export const REF_KINDS = { ticket: "T", story: "S", task: "K", todo: "D", sprint: "SPR", meeting: "M" } as const
export type RefKind = (typeof REF_KINDS)[keyof typeof REF_KINDS]

/** Allocate the next reference for one account, race-safely.
 *
 * ONE STATEMENT, and that is the whole design. The obvious version reads
 * `MAX(ref)` and writes the next one, and two people raising a ticket on the
 * same account in the same second both read 11 and both write 12 — a number the
 * client quotes, pointing at two different requests. `INSERT … ON CONFLICT DO
 * UPDATE … RETURNING` is atomic in SQLite (CONCURRENCY.md rule 1: the counter
 * rides the write), so the two callers are serialized by the database and get 12
 * and 13.
 *
 * The insert path seeds `next_no` at 2 and returns 2, the conflict path returns
 * the incremented value — so in both cases the number just allocated is one less
 * than what came back. Reading that off the RETURNING rather than from a second
 * query is what keeps it one statement.
 *
 * Returns null when there is nothing to build a reference OUT of: an account
 * with no short code, or no account at all (the agency's own work). A reference
 * nobody can quote is worse than none — it looks like it means something. */
export async function nextRef(
  cfg: D1Rest,
  guard: MemberGuard,
  accountId: string | null,
  kind: RefKind
): Promise<string | null> {
  if (!accountId) return null
  const codes = await d1Query<{ code: string | null }>(
    cfg,
    guard.databaseId,
    `SELECT code FROM accounts WHERE id = ? LIMIT 1`, // R14: one row by primary key
    [accountId]
  )
  const code = codes[0]?.code
  if (!code) return null
  const taken = await d1Query<{ next_no: number }>(
    cfg,
    guard.databaseId,
    `INSERT INTO ref_counters (account_id, kind, next_no) VALUES (?, ?, 2)
     ON CONFLICT(account_id, kind) DO UPDATE SET next_no = next_no + 1
     RETURNING next_no`,
    [accountId, kind]
  )
  const no = (taken[0]?.next_no ?? 2) - 1
  return `${code}-${kind}${String(no).padStart(4, "0")}`
}
