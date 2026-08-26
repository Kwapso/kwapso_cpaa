// THE CROSS-DEVICE SYNC LEASE — the server-side half of "never two of the same
// syncs at once" (see migration 0057_one_control_where_there_were_two for the
// owner's own words and why a per-tab map could never answer this).
//
// A short-lived row, not a flag: a claim that never expired would survive a
// worker killed mid-sweep and lock that act out for good, so every claim is a
// LEASE — it takes the row over the moment it is stale, atomically, in the same
// UPSERT that takes it in the first place (CONCURRENCY.md's rule 1). Two
// concurrent claims can't both win: D1 serializes the write, so the loser's
// `WHERE` clause simply matches nothing and it gets nothing back.

import { sqlString, d1Query, type D1Rest } from "@shared/workers/d1-rest"

/** Long enough to cover one bounded tick's Google reads and D1 writes with
 * margin; short enough that a crashed holder's lease clears itself well inside
 * the time a person would notice and press the button again. */
export const SYNC_LEASE_TTL_MS = 3 * 60 * 1000

/**
 * Run `work` under `key`, but only if no other caller holds the lease right
 * now. `ran: false` means someone else — another tab, another device — is
 * doing this act this moment; the caller must do no Google reads and no
 * writes, and should say so honestly rather than claiming "nothing new".
 *
 * The lease is released the instant `work` settles, win or lose, matched on
 * the exact expiry THIS call set — so a lease this call overran (and that a
 * later caller has since taken over) is left alone rather than deleted out
 * from under them.
 */
export async function withSyncLease<T>(
  cfg: D1Rest,
  databaseId: string,
  key: string,
  work: () => Promise<T>,
  ttlMs: number = SYNC_LEASE_TTL_MS
): Promise<{ ran: true; result: T } | { ran: false }> {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString()
  const won = await d1Query(
    cfg,
    databaseId,
    `INSERT INTO sync_leases (lease_key, expires_at) VALUES (${sqlString(key)}, ${sqlString(expiresAt)})
     ON CONFLICT (lease_key) DO UPDATE SET expires_at = excluded.expires_at
       WHERE sync_leases.expires_at < ${sqlString(now.toISOString())}
     RETURNING lease_key;`
  )
  if (won.length === 0) return { ran: false }
  try {
    const result = await work()
    return { ran: true, result }
  } finally {
    await d1Query(
      cfg,
      databaseId,
      `DELETE FROM sync_leases WHERE lease_key = ${sqlString(key)} AND expires_at = ${sqlString(expiresAt)};`
    )
  }
}
