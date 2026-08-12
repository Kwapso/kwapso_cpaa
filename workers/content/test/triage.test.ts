// TRIAGE — whose week it is, and what has been sitting (.plans/BUILD-1 §6).
//
// The two sentences the suite holds:
//   • ONE named person per week, enforced by the database rather than by a check
//     two writers race past;
//   • three days, counted from when the request was RAISED, over tickets nobody
//     has read — and never, on any door, visible to the client whose request it
//     is. That last one is the difference between an internal prompt and a
//     service-level promise nobody made.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
import { TRIAGE_AFTER_DAYS, weekStart } from "../src/lib/triage"
import { buildSpineDb, IDS, makeEnv } from "../../tenancy/test/spine-harness"

const db = () => holder.db as DatabaseSync

function env(userId: string) {
  const base = makeEnv(() => db(), userId) as unknown as Record<string, unknown>
  return {
    ...base,
    INTERNAL_KEY: "k",
    PUBLIC_APP_URL: "https://kwapso.example",
    REALTIME: { fetch: async () => new Response("{}") },
  } as never
}

const call = (userId: string, route: string, body?: unknown, query = "") => {
  const [method, path] = route.split(" ")
  return worker.fetch(
    new Request(`https://content${path}${query}`, {
      method,
      headers: { Cookie: "session=x", "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    }),
    env(userId) as never
  )
}

type TriageBody = {
  onDuty: { userId: string; userName: string | null } | null
  waiting: { id: string; days: number }[]
  total: number
}

/** Raise a ticket and back-date it by `days`, which is the only way to make a
 * "has been sitting" test about anything other than the clock. */
async function ticketAgedDays(description: string, days: number): Promise<string> {
  await call(IDS.staffUser, "POST /api/content/help", { description })
  const id = (db().prepare(`SELECT id FROM help WHERE description = ?`).get(description) as { id: string }).id
  const when = new Date(Date.now() - days * 86_400_000).toISOString()
  // Straight back to `new`: raising it as staff locks it, which is a different
  // fact from having READ it, and this suite is about the latter.
  db().exec(`UPDATE help SET created_at = '${when}', status = 'new' WHERE id = '${id}'`)
  return id
}

beforeEach(() => {
  holder.db = buildSpineDb()
  // The shared fixture seeds one old ticket of the victim's, for the fence
  // suites. It is genuinely "sitting", which is correct — and it would be a
  // silent extra row in every count below. Marked as read here so each case
  // counts only the tickets it wrote itself.
  db().exec(`UPDATE help SET status = 'triaged' WHERE id = '${IDS.victimTicket}'`)
})

describe("whose week it is", () => {
  it("is one named person, and naming a second replaces the first", async () => {
    const first = await call(IDS.staffUser, "POST /api/content/triage", { userId: IDS.staffUser })
    expect(first.status).toBe(200)
    expect(((await first.json()) as TriageBody).onDuty?.userId).toBe(IDS.staffUser)

    const second = await call(IDS.staffUser, "POST /api/content/triage", { userId: IDS.contactUser })
    expect(second.status).toBe(200)
    // ONE ROW for the week — "visible whose week it is" has no answer if two rows
    // claim it, and the database is what makes it one rather than a check.
    const rows = db().prepare(`SELECT * FROM triage_duty`).all() as { user_id: string }[]
    expect(rows).toHaveLength(1)
    expect(rows[0].user_id).toBe(IDS.contactUser)
  })

  it("refuses somebody who isn't on the team", async () => {
    const res = await call(IDS.staffUser, "POST /api/content/triage", { userId: "U_NOBODY" })
    expect(res.status).toBe(400)
    expect(db().prepare(`SELECT COUNT(*) AS n FROM triage_duty`).get()).toEqual({ n: 0 })
  })

  it("keys the rota by the MONDAY of whatever date is given", async () => {
    // A Wednesday and the Friday of the same week are the same week, and a rota
    // that disagreed about that would show two owners depending on which day you
    // set it from.
    await call(IDS.staffUser, "POST /api/content/triage", {
      userId: IDS.staffUser,
      week: "2026-08-12T00:00:00.000Z", // a Wednesday
    })
    await call(IDS.staffUser, "POST /api/content/triage", {
      userId: IDS.contactUser,
      week: "2026-08-14T00:00:00.000Z", // the Friday after it
    })
    const rows = db().prepare(`SELECT week_start, user_id FROM triage_duty`).all() as {
      week_start: string
      user_id: string
    }[]
    expect(rows).toHaveLength(1)
    expect(rows[0].week_start).toBe("2026-08-10")
    expect(rows[0].user_id).toBe(IDS.contactUser)
  })

  it("weekStart snaps every day of a week to the same Monday — Sunday included", () => {
    // Sunday is the trap: getUTCDay() calls it 0, so the naive arithmetic puts it
    // in the week that is about to START rather than the one just ending.
    const days = ["2026-08-10", "2026-08-12", "2026-08-15", "2026-08-16"]
    for (const d of days) expect(weekStart(new Date(`${d}T12:00:00.000Z`)), d).toBe("2026-08-10")
    expect(weekStart(new Date("2026-08-17T00:00:00.000Z"))).toBe("2026-08-17")
  })
})

describe("what has been sitting", () => {
  it("lists only unread requests past the threshold, oldest first", async () => {
    const old = await ticketAgedDays("Sat for a week", TRIAGE_AFTER_DAYS + 4)
    const justOver = await ticketAgedDays("Sat just past the line", TRIAGE_AFTER_DAYS + 1)
    await ticketAgedDays("Raised this morning", 0)
    // Read, and therefore not waiting — the list is about what nobody has looked
    // at, not about what is unfinished.
    const read = await ticketAgedDays("Read on the day", TRIAGE_AFTER_DAYS + 2)
    await call(IDS.staffUser, "POST /api/content/help/status", { id: read, status: "triaged" })

    const body = (await (await call(IDS.staffUser, "GET /api/content/triage")).json()) as TriageBody
    expect(body.waiting.map((w) => w.id)).toEqual([old, justOver])
    expect(body.total).toBe(2)
    expect(body.waiting[0].days).toBeGreaterThanOrEqual(TRIAGE_AFTER_DAYS)
  })

  it("leaves an ARCHIVED ticket out — putting one away is having looked at it", async () => {
    const id = await ticketAgedDays("Put away deliberately", TRIAGE_AFTER_DAYS + 2)
    await call(IDS.staffUser, "POST /api/content/help/archive", { id, archived: true })
    // Archiving is a staff touch, so the status moved off `new` too — the point
    // of the case is that neither route back into this list exists.
    db().exec(`UPDATE help SET status = 'new' WHERE id = '${id}'`)
    const body = (await (await call(IDS.staffUser, "GET /api/content/triage")).json()) as TriageBody
    expect(body.waiting).toHaveLength(0)
    expect(body.total).toBe(0)
  })
})

// §6's own words: "internal nudge only — nothing client-facing, no SLA promise".
// A client seeing "your request has been sitting untouched for four days" IS the
// promise, whatever the screen calls it.
describe("a client login is never shown any of it", () => {
  it("is refused both doors, even holding every right their role can hold", async () => {
    await ticketAgedDays("Sitting, and theirs", TRIAGE_AFTER_DAYS + 2)
    const read = await call(IDS.contactUser, "GET /api/content/triage")
    expect(read.status).toBe(403)
    expect(await read.text()).not.toContain("Sitting, and theirs")

    const write = await call(IDS.contactUser, "POST /api/content/triage", { userId: IDS.contactUser })
    expect(write.status).toBe(403)
    expect(db().prepare(`SELECT COUNT(*) AS n FROM triage_duty`).get()).toEqual({ n: 0 })
  })
})
