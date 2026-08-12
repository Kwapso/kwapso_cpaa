// THE CLIENT'S HALF OF THE WORK ENGINE (.plans/BUILD-1 §7) — what a contact sees
// of the work we do for them, and what they can do about it.
//
// The whole file is one sentence tested from several sides: A CLIENT SEES A
// COUNT, NEVER A LIST. Their request says "3 pieces of work, 1 done"; the block
// they bought says "3 of 8 done"; and no title, no assignee, no date and no
// price crosses the wire on any door they can reach.
//
// The strongest cases here assert on the RESPONSE TEXT rather than on a parsed
// field, because that is the only way to catch the failure that matters: a story
// title arriving in a payload the component happens not to draw. That is the
// version of this mistake that survives a UI rewrite.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
import { buildSpineDb, IDS, makeEnv } from "../../tenancy/test/spine-harness"

const db = () => holder.db as DatabaseSync

function env(userId: string) {
  const base = makeEnv(() => db(), userId) as unknown as Record<string, unknown>
  return {
    ...base,
    INTERNAL_KEY: "k",
    PUBLIC_APP_URL: "https://kwapso.example",
    REALTIME: { fetch: async () => new Response("{}") },
    MEDIA: { put: async () => undefined },
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

/** The words that must never reach the client's side. Each one is on a real row
 * the fixture writes, so an assertion that they are absent is an assertion about
 * the wire and not about a string nobody set. */
const SECRET = {
  storyTitle: "Rewrite the dispatch queue by hand",
  assignee: "Ana",
  sprintGoal: "Get them off the spreadsheet before the audit",
  price: "450000",
}

async function seedWork(): Promise<{ ticketId: string; storyId: string }> {
  const ticket = (
    (await (
      await call(IDS.staffUser, "POST /api/content/help", {
        description: "The dispatch board stopped refreshing",
        accountId: IDS.victimAccount,
      })
    ).json()) as { tickets: { id: string }[] }
  ).tickets[0].id

  await call(IDS.staffUser, "POST /api/content/sprints", {
    name: "Dispatch, sprint 4",
    goal: SECRET.sprintGoal,
    accountId: IDS.victimAccount,
    sprintType: "Implementation",
    startsOn: "2026-08-03",
    endsOn: "2026-08-28",
    soldPriceCents: 450_000,
  })
  const sprintId = (db().prepare(`SELECT id FROM sprints LIMIT 1`).get() as { id: string }).id

  await call(IDS.staffUser, "POST /api/content/stories", {
    title: SECRET.storyTitle,
    ticketId: ticket,
    sprintId,
    changesNoStep: true,
  })
  const storyId = (
    db().prepare(`SELECT id FROM stories WHERE title = ?`).get(SECRET.storyTitle) as { id: string }
  ).id
  // An assignee, because a name on the work is half of what SCOPE ch.06 keeps
  // off this side and a fixture without one cannot prove it is kept off.
  db().exec(`UPDATE stories SET assignee_name = '${SECRET.assignee}' WHERE id = '${storyId}'`)

  await call(IDS.staffUser, "POST /api/content/stories", {
    title: "A second piece of work",
    ticketId: ticket,
    sprintId,
    changesNoStep: true,
  })
  return { ticketId: ticket, storyId }
}

beforeEach(() => {
  holder.db = buildSpineDb()
  db().exec(`UPDATE accounts SET code = 'BERG' WHERE id = '${IDS.victimAccount}';`)
})

describe("a client sees a COUNT of the work on their request", () => {
  it("carries two numbers and not one word of the work itself", async () => {
    const { ticketId, storyId } = await seedWork()
    await call(IDS.staffUser, "POST /api/content/stories/status", { id: storyId, status: "done" })

    const res = await call(IDS.contactUser, "GET /api/content/help", undefined, `?id=${ticketId}`)
    const text = await res.text()
    const ticket = (JSON.parse(text) as { tickets: { storyCount: number; doneStoryCount: number }[] })
      .tickets[0]
    expect(ticket.storyCount).toBe(2)
    expect(ticket.doneStoryCount).toBe(1)
    // THE WIRE, not the component. A title in a payload the screen declines to
    // draw is the version of this that survives a UI rewrite.
    expect(text).not.toContain(SECRET.storyTitle)
    expect(text).not.toContain(SECRET.assignee)
  })

  it("staff read the same two numbers — a count nobody can check is one nobody believes", async () => {
    const { ticketId, storyId } = await seedWork()
    await call(IDS.staffUser, "POST /api/content/stories/status", { id: storyId, status: "done" })
    const ours = (await (
      await call(IDS.staffUser, "GET /api/content/help", undefined, `?id=${ticketId}`)
    ).json()) as { tickets: { storyCount: number; doneStoryCount: number }[] }
    expect(ours.tickets[0]).toMatchObject({ storyCount: 2, doneStoryCount: 1 })
  })
})

describe("a client sees the block they bought, and nothing inside it", () => {
  it("answers with a name, its dates and two counts — no price, no goal, no titles", async () => {
    const { storyId } = await seedWork()
    await call(IDS.staffUser, "POST /api/content/stories/status", { id: storyId, status: "done" })

    const res = await call(IDS.contactUser, "GET /api/content/portal/delivery")
    expect(res.status).toBe(200)
    const text = await res.text()
    const body = JSON.parse(text) as {
      sprints: { name: string; startsOn: string; storyCount: number; doneStoryCount: number }[]
    }
    expect(body.sprints).toHaveLength(1)
    expect(body.sprints[0]).toMatchObject({
      name: "Dispatch, sprint 4",
      startsOn: "2026-08-03",
      storyCount: 2,
      doneStoryCount: 1,
    })
    // THE FOUR ABSENCES, on the wire.
    expect(text, "the price a client was charged has ONE door, and it is not this one").not.toContain(
      SECRET.price
    )
    expect(text, "the goal is written by us, for us").not.toContain(SECRET.sprintGoal)
    expect(text).not.toContain(SECRET.storyTitle)
    expect(text).not.toContain(SECRET.assignee)
  })

  it("shows a client at another company nothing of it", async () => {
    await seedWork()
    const res = await call(IDS.burglarUser, "GET /api/content/portal/delivery")
    expect(res.status).toBe(200)
    const text = await res.text()
    expect((JSON.parse(text) as { sprints: unknown[] }).sprints).toHaveLength(0)
    expect(text).not.toContain("Dispatch, sprint 4")
  })
})

// SCOPE ch.07 gives the account two powers over its own requests, and both are
// `help:edit` — which is why granting it made the four doors on the same right
// refuse a portal caller. These cases are the two halves of that decision.
describe("what a client may do to their own ticket, and what they may not", () => {
  /** A ticket the CLIENT raised, which is the only kind they may edit. */
  async function theirTicket(description: string): Promise<string> {
    await call(IDS.contactUser, "POST /api/content/help", { description })
    return (db().prepare(`SELECT id FROM help WHERE description = ?`).get(description) as { id: string })
      .id
  }

  it("corrects their own wording while it is still theirs", async () => {
    const id = await theirTicket("The dispatch bord stopped refreshing")
    const res = await call(IDS.contactUser, "POST /api/content/help/update", {
      id,
      description: "The dispatch board stopped refreshing",
    })
    expect(res.status).toBe(200)
    expect(
      (db().prepare(`SELECT description FROM help WHERE id = ?`).get(id) as { description: string })
        .description
    ).toBe("The dispatch board stopped refreshing")

    // …and stops the moment a staff member reads it. The lock is what makes the
    // `help:edit` grant safe, not the permission.
    await call(IDS.staffUser, "POST /api/content/help/status", { id, status: "triaged" })
    const after = await call(IDS.contactUser, "POST /api/content/help/update", {
      id,
      description: "Actually, something else entirely",
    })
    expect(after.status).toBe(409)
  })

  it("re-ranks their own company's requests", async () => {
    const first = await theirTicket("The first thing")
    const second = await theirTicket("The second thing")
    const res = await call(IDS.contactUser, "POST /api/content/help/rank", {
      id: second,
      afterId: null,
      beforeId: first,
    })
    expect(res.status).toBe(200)
  })

  it("cannot resolve it, bulk-move it or archive it — 'resolved' is our word", async () => {
    const id = await theirTicket("Not yours to close")
    for (const [route, body] of [
      ["POST /api/content/help/status", { id, status: "resolved" }],
      ["POST /api/content/help/archive", { id, archived: true }],
      ["POST /api/content/help/bulk-status", { ids: [id], status: "resolved" }],
      ["POST /api/content/help/bulk-status-by-filter", { toStatus: "resolved" }],
    ] as const) {
      const res = await call(IDS.contactUser, route, body)
      expect(res.status, route).toBe(403)
    }
    // Nothing moved, and nothing was put away.
    const row = db().prepare(`SELECT status, archived_at FROM help WHERE id = ?`).get(id) as {
      status: string
      archived_at: string | null
    }
    expect(row.status).toBe("new")
    expect(row.archived_at).toBe(null)
  })
})
