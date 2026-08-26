// THE CROSS-DEVICE SYNC LEASE, against a real SQLite database running the real
// migration — the shipped table, the shipped UPSERT, the shipped release.
//
// THE OWNER, 26 Aug 2026: "never should there be 2 of the same syncs running
// simultaneously" — across DEVICES, not just tabs. A per-tab map (running-jobs)
// answers "is THIS TAB doing it" and cannot answer that; the fact has to live
// in a row both callers can see. This suite proves the three things that make a
// LEASE (not a permanent lock) correct: mutual exclusion while held, takeover
// once it expires, and a release that only ever clears the lease IT set.

import { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import { TEAM_MIGRATIONS } from "../../tenancy/src/team-schema"
import { withSyncLease } from "../src/lib/sync-lease"

const cfg = { accountId: "a", apiToken: "t" } as never
const db = () => holder.db as DatabaseSync

/** A promise this test settles by hand, so "while A is still running" is a
 * moment the test controls rather than a race against real time. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => {
  holder.db = new DatabaseSync(":memory:")
  const m = TEAM_MIGRATIONS.find((x) => x.version === "0057_one_control_where_there_were_two")
  expect(m, "migration 0057_one_control_where_there_were_two is missing").toBeTruthy()
  db().exec(m!.sql)
})

describe("the cross-device sync lease", () => {
  it("the table ships as a migration, not a hand-run script", () => {
    // Proves the table this suite runs against is the one production gets —
    // exercising a hand-rolled CREATE TABLE here would prove nothing about
    // what actually ships.
    expect(() => db().exec("INSERT INTO sync_leases (lease_key, expires_at) VALUES ('x', '2026-01-01')")).not.toThrow()
  })

  it("a second claim on the same key is refused while the first is still working", async () => {
    const gate = deferred<void>()
    const first = withSyncLease(cfg, "db1", "google-knowledge:U1", async () => {
      await gate.promise
      return "first"
    })
    // Give the first claim a tick to land before the second tries — the two
    // are not literally simultaneous in a single-threaded test, but the lease
    // is held across an `await`, which is the real shape a claimed-then-idle
    // HTTP request has.
    await Promise.resolve()
    const second = await withSyncLease(cfg, "db1", "google-knowledge:U1", async () => "second")
    expect(second).toEqual({ ran: false })
    gate.resolve()
    expect(await first).toEqual({ ran: true, result: "first" })
  })

  it("a DIFFERENT key is never blocked by another key's lease", async () => {
    const gate = deferred<void>()
    const knowledge = withSyncLease(cfg, "db1", "google-knowledge:U1", async () => {
      await gate.promise
      return "knowledge"
    })
    await Promise.resolve()
    const calendar = await withSyncLease(cfg, "db1", "google-calendar:U1", async () => "calendar")
    expect(calendar).toEqual({ ran: true, result: "calendar" })
    gate.resolve()
    await knowledge
  })

  it("a lease released after work claims cleanly for the next caller", async () => {
    const a = await withSyncLease(cfg, "db1", "google-knowledge:U1", async () => "a")
    expect(a).toEqual({ ran: true, result: "a" })
    const b = await withSyncLease(cfg, "db1", "google-knowledge:U1", async () => "b")
    expect(b).toEqual({ ran: true, result: "b" })
  })

  it("an EXPIRED lease is taken over, not honoured forever — a crashed holder can't lock the act out", async () => {
    // A holder that never got to release: the row is still there, but stale.
    db().exec(
      `INSERT INTO sync_leases (lease_key, expires_at) VALUES ('google-knowledge:U1', '2020-01-01T00:00:00.000Z')`
    )
    const result = await withSyncLease(cfg, "db1", "google-knowledge:U1", async () => "took it over")
    expect(result).toEqual({ ran: true, result: "took it over" })
  })

  it("release matches the exact lease this call set — it never deletes a lease a LATER caller has since taken over", async () => {
    // Simulate this call's own lease having overrun its TTL mid-work: a later
    // caller claimed the row and rewrote its expiry while this one was still
    // "working". Its `finally` must not delete that newer claim.
    const gate = deferred<void>()
    const overran = withSyncLease(
      cfg,
      "db1",
      "google-knowledge:U1",
      async () => {
        await gate.promise
        return "overran"
      },
      1 // a 1ms TTL — expired by the time we act below
    )
    await Promise.resolve()
    // Wait past the 1ms TTL, then simulate the takeover a later caller made.
    await new Promise((r) => setTimeout(r, 5))
    db().exec(
      `UPDATE sync_leases SET expires_at = '2099-01-01T00:00:00.000Z' WHERE lease_key = 'google-knowledge:U1'`
    )
    gate.resolve()
    await overran
    const row = db()
      .prepare("SELECT expires_at FROM sync_leases WHERE lease_key = 'google-knowledge:U1'")
      .get() as { expires_at: string } | undefined
    expect(row?.expires_at, "the later caller's lease must survive the earlier caller's release").toBe(
      "2099-01-01T00:00:00.000Z"
    )
  })
})
