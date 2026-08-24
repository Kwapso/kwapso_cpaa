// THE BADGE DOOR, tenancy's half — the systems built for a client, the process
// maps inside a system, and what that client is charged. Driven through the
// SHIPPED route handler against a real SQLite database running the real team
// migrations.
//
// The reasoning is written once, on content's half
// (workers/content/test/record-counts.test.ts). What is worth locking HERE is
// the same four things and one more that only this worker can get wrong:
//
//   THE RATE CARD IS BEHIND ITS OWN MODULE, and it is the one collection on a
//   client's record whose count is a fact about money. `commercials` is not on
//   the shared fixture's role, so the honest answer is `null` — and a `0` there
//   would tell a developer, in a badge, that this client has no agreed prices.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
import { buildSpineDb, IDS, makeEnv } from "./spine-harness"
import { childrenFor, RECORD_CHILDREN, type RecordCounts } from "@shared/record-counts"

const db = () => holder.db as DatabaseSync

const ask = (userId: string, table: string, id: string) =>
  worker.fetch(
    new Request(
      `https://tenancy/api/tenancy/record-counts?table=${encodeURIComponent(table)}&id=${encodeURIComponent(id)}`,
      { headers: { Cookie: "session=x" } }
    ),
    makeEnv(() => db(), userId) as never
  )

const counts = async (userId: string, table: string, id: string) =>
  ((await (await ask(userId, table, id)).json()) as RecordCounts).counts

beforeEach(() => {
  holder.db = buildSpineDb()
})

describe("the record-counts door (tenancy)", () => {
  it("refuses a client login outright (R21)", async () => {
    const res = await ask(IDS.contactUser, "accounts", IDS.victimAccount)
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error: string }).error).toBe("client_login")
  })

  it("answers only for a record kind the registry knows (R20)", async () => {
    expect((await ask(IDS.staffUser, "invoices", IDS.victimAccount)).status).toBe(400)
  })

  // THE ONE THE OWNER REPORTED, at the door: the fixture's client already has a
  // system built for it, so its Apps badge is answerable before anybody has
  // opened the tab.
  it("counts the systems built for one client", async () => {
    const body = await counts(IDS.staffUser, "accounts", IDS.victimAccount)
    expect(body["apps-account"]).toBe(1)
    // Nothing here for a collection this worker does not own — the sprints and
    // to-dos are content's, and the screen merges the two answers.
    expect("sprints-account" in body).toBe(false)
  })

  it("counts the ways of working mapped inside one system", async () => {
    const body = await counts(IDS.staffUser, "apps", IDS.victimApp)
    // TWO maps on the victim's system — the invoice approval and the goods
    // receipt. The second exists so the process-LINK door can be attacked with
    // two real records rather than being refused for self-connection.
    expect(body["processes-app"]).toBe(2)
    // A system nobody has mapped yet answers 0 rather than nothing — "we have
    // mapped none of this" is a fact, and the badge renders it as no badge.
    db()
      .prepare(
        `INSERT INTO apps (id, account_id, name, tool_cost_cents_per_month, created_at, creator_id)
         VALUES ('AP_FRESH', ?, 'Fresh system', 0, '2026-03-01', ?)`
      )
      .run(IDS.victimAccount, IDS.staffUser)
    expect((await counts(IDS.staffUser, "apps", "AP_FRESH"))["processes-app"]).toBe(0)
  })

  // R18, and the reason this door has no single gate of its own. The shared
  // fixture's role holds `processes` and has never held `commercials` — a role
  // somebody built for other reasons, which is what makes the assertion worth
  // anything.
  it("hands back null — never zero — for the rate card a role may not see (R18)", async () => {
    db()
      .prepare(
        `INSERT INTO account_rates (id, account_id, label, cents_per_hour, created_at, creator_id)
         VALUES ('AR1', ?, 'Development', 9000, '2026-02-01', ?)`
      )
      .run(IDS.victimAccount, IDS.staffUser)
    const body = await counts(IDS.staffUser, "accounts", IDS.victimAccount)
    expect(body["account-rates"]).toBeNull()
    // …and the apps figure beside it, on a module they DO hold, is a number. One
    // right per collection, never one standing in for three.
    expect(body["apps-account"]).toBe(1)

    // Grant it, and the same call now says how many lines the card holds. The
    // count is real rather than a placeholder — a `null` that never becomes a
    // number is a permission nobody can tell from a broken counter.
    db()
      .prepare(
        `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
         VALUES ('R_COMM', ?, 'commercials', 1, 1, 1, 1)`
      )
      .run(IDS.adminRole)
    expect((await counts(IDS.staffUser, "accounts", IDS.victimAccount))["account-rates"]).toBe(1)
  })

  // The registry is the contract between three surfaces (this door, the screen,
  // the live layer). A line with no counter behind it would answer `null` and
  // read exactly like a missing permission — which is the failure this door was
  // built to end — so every line this worker owes is proved to produce a NUMBER
  // for a caller holding every right, derived from the registry itself.
  it("answers every collection the registry says this worker owes", async () => {
    db()
      .prepare(
        `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
         VALUES ('R_COMM', ?, 'commercials', 1, 1, 1, 1)`
      )
      .run(IDS.adminRole)
    const ids: Record<string, string> = {
      accounts: IDS.victimAccount,
      apps: IDS.victimApp,
      help: IDS.victimTicket,
      sprints: "SP_NONE",
    }
    const owed = Object.keys(RECORD_CHILDREN).flatMap((table) =>
      childrenFor(table, "tenancy").map((c) => [table, c.key] as const)
    )
    expect(owed.length, "the registry scan found nothing — it has gone blind").toBeGreaterThan(2)
    for (const [table, key] of owed) {
      const body = await counts(IDS.staffUser, table, ids[table])
      expect(typeof body[key], `${table}.${key} has no counter behind it`).toBe("number")
    }
  })
})
