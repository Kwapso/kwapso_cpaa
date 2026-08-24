// A BULK MOVE IS WAVES, NOT A QUEUE.
//
// `bulkSetStatus` was a plain `for` loop: one ticket at a time, each a few trips
// to the database. That is fine when the database is next door and ruinous when
// it is not — and on 25 Aug 2026 it was not. The per-request timing header put
// one team-database trip at ~150ms, because the database sat in APAC while the
// workers ran in WEUR. A native binding removes the API round trip; it does not
// remove the distance.
//
// At that price, BULK_IDS_LIMIT (512) tickets × a few trips each is several
// MINUTES of wall clock. A Worker is killed long before that, so the person
// selecting eighty tickets and pressing Archive would have seen a spinner, then
// an error, with their tickets HALF MOVED — the worst of the three possible
// outcomes.
//
// WHAT THESE TESTS HOLD, and why each would fail silently otherwise:
//
//   • The batch really is concurrent. A wave that awaited each row in turn would
//     pass every behavioural test in the file above and still be the bug.
//   • And really is BOUNDED. Unbounded concurrency meets D1's own per-invocation
//     ceiling and fails looking like a database fault rather than an eager batch.
//   • The COUNTS stay true. A bulk job that reports the wrong number is worse
//     than one that is slow: a person reads "80 moved" and stops checking.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import { bulkSetStatus } from "../src/lib/help"
import { buildSpineDb, IDS } from "../../tenancy/test/spine-harness"

const cfg = { accountId: "a", apiToken: "t" } as never
const actor = { id: IDS.staffUser, email: "staff@kwapso.app", name: "Staff" }
const guard = { userId: IDS.staffUser, teamId: IDS.team, roleId: IDS.adminRole, databaseId: "db_team" }
const staff = { kind: "staff" } as const

/** N open tickets, so a bulk move has something real to move. */
function seedTickets(n: number): string[] {
  const db = holder.db as DatabaseSync
  const ids: string[] = []
  for (let i = 0; i < n; i++) {
    const id = `H_BULK_${String(i).padStart(3, "0")}`
    ids.push(id)
    db.exec(
      `INSERT INTO help (id, account_id, description, status, created_at, creator_id)
       VALUES ('${id}', '${IDS.victimAccount}', 'Ticket ${i}', 'open', '2026-02-01', '${IDS.staffUser}')`
    )
  }
  return ids
}

beforeEach(() => {
  holder.db = buildSpineDb()
})

describe("a bulk move runs in bounded waves", () => {
  it("moves every ticket, and reports the true count", async () => {
    const ids = seedTickets(40)
    const { changed, skipped } = await bulkSetStatus(cfg, guard, staff, actor, ids, "resolved")
    expect(changed).toHaveLength(40)
    expect(skipped).toBe(0)
    const rows = (holder.db as DatabaseSync)
      .prepare("SELECT COUNT(*) AS n FROM help WHERE status = 'resolved' AND id LIKE 'H_BULK_%'")
      .all() as { n: number }[]
    expect(rows[0].n).toBe(40)
  })

  // NO RUNTIME TEST OF OVERLAP, and the omission is deliberate rather than a
  // gap. `node:sqlite` is SYNCHRONOUS: a statement cannot be observed in flight
  // while another runs, so any "peak concurrency" assertion here would measure
  // the test double and not the code. What CAN be held honestly is the SHAPE —
  // that the batch slices into waves and never opens one Promise.all over every
  // id — which is the next test, and it is a source read for exactly that reason.
  it("is BOUNDED — the wave size is a real ceiling and not a suggestion", () => {
    // Read the source, because the runtime cannot show an upper bound that was
    // never exceeded. An unbounded Promise.all over `ids` is the shape this
    // forbids: it meets D1's per-invocation ceiling and fails looking like a
    // database fault rather than a batch that was too eager.
    const src = readSource()
    expect(src, "the batch must slice into waves").toMatch(/i \+= BULK_CONCURRENCY/)
    expect(
      /Promise\.all\(\s*ids\.map/.test(src),
      "an unbounded Promise.all over every id is exactly what the wave size prevents"
    ).toBe(false)
  })

  it("a ticket already at the target status is skipped, not moved twice (R17)", async () => {
    const ids = seedTickets(20)
    await bulkSetStatus(cfg, guard, staff, actor, ids, "resolved")
    const second = await bulkSetStatus(cfg, guard, staff, actor, ids, "resolved")
    expect(second.changed).toHaveLength(0)
    expect(second.skipped).toBe(20)
  })

  it("a missing ticket is skipped and the rest of the batch still applies", async () => {
    const ids = [...seedTickets(10), "H_DOES_NOT_EXIST"]
    const { changed, skipped } = await bulkSetStatus(cfg, guard, staff, actor, ids, "resolved")
    expect(changed).toHaveLength(10)
    expect(skipped).toBe(1)
  })
})

function readSource(): string {
  return readFileSync(join(__dirname, "..", "src", "lib", "help.ts"), "utf8")
}
