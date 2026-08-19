// THE SENTENCE THE WHOLE CHANGE RESTS ON — "why am I not able to create related
// stories from inside a ticket? How else will I get this to a triaged state?" —
// driven through the SHIPPED doors against a real SQLite database.
//
// He is right, and the arithmetic is worth pinning down because it is the reason
// the missing button was a LIFECYCLE bug rather than a convenience one. A ticket
// with no stories against it can be READ (`triaged`, which is one person opening
// it) and can go no further, ever: `scheduled` asks for a story on this ticket
// that is booked into a sprint, `in_progress` is a timer starting on one, and
// `ready` is the last one closing. Every stage after triage is a STORY doing
// something, so a request nobody can write work against is a request that stops.
//
// This suite proves both halves — the wall, and the door through it — so nobody
// can quietly take the create action away again and leave a green build behind.

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
  } as never
}

const call = (userId: string, route: string, body?: unknown) => {
  const [method, path] = route.split(" ")
  return worker.fetch(
    new Request(`https://content${path}`, {
      method,
      headers: { Cookie: "session=x", "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    }),
    env(userId) as never
  )
}

const status = (id: string) =>
  (db().prepare(`SELECT status FROM help WHERE id = ?`).get(id) as { status: string }).status

/** Raise a request, and read it — the furthest a ticket with no work can get. */
async function aTriagedTicket(): Promise<string> {
  // A COMPLETE ticket, because triage now refuses an incomplete one: a type, a
  // client, an app and who raised it (shared/triage-readiness.ts). This fixture
  // used to name only the client, which was enough when reading a request was
  // unconditional and is exactly what the gate exists to stop.
  const res = await call(IDS.staffUser, "POST /api/content/help", {
    description: "The dispatch board will not load on a phone",
    helpType: "Question",
    accountId: IDS.victimAccount,
    appId: IDS.victimApp,
    raisedByContactId: IDS.victimPerson,
  })
  const id = ((await res.json()) as { tickets: { id: string }[] }).tickets[0].id
  await call(IDS.staffUser, "POST /api/content/help/triage-read", { id })
  return id
}

/** A block of work to book the story into — `scheduled` is "stories exist AND are
 * in a sprint", and both halves have to be true. */
async function aSprint(): Promise<string> {
  const res = await call(IDS.staffUser, "POST /api/content/sprints", {
    name: "August iteration",
    accountId: IDS.victimAccount,
  })
  return ((await res.json()) as { sprints: { id: string }[] }).sprints[0].id
}

beforeEach(() => {
  holder.db = buildSpineDb()
})

describe("a story is what lets a request move on", () => {
  it("leaves a ticket with no work stuck at triaged, however the sprints move around it", async () => {
    const ticketId = await aTriagedTicket()
    expect(status(ticketId)).toBe("triaged")

    // A sprint exists, and a story exists, and the story is IN that sprint — but
    // it answers nothing. The request is untouched, which is the honest answer:
    // a sprint with no story on this request says nothing about it.
    const sprintId = await aSprint()
    await call(IDS.staffUser, "POST /api/content/stories", {
      title: "Unrelated work",
      storyType: "Fix",
      sprintId,
      changesNoStep: true,
    })
    expect(status(ticketId)).toBe("triaged")
  })

  it("moves it to scheduled the moment work is written against it and booked in", async () => {
    const ticketId = await aTriagedTicket()
    const sprintId = await aSprint()

    // THE EXACT CALL THE TICKET'S OWN "New story" BUTTON MAKES: a story with this
    // request's id on it. Nothing about the ticket is written by hand here — the
    // door flips it because the work now exists, which is the inversion CHECKLIST
    // 5.4 asked for ("a status is a fact, not a button").
    const res = await call(IDS.staffUser, "POST /api/content/stories", {
      title: "Make the board responsive",
      storyType: "Fix",
      ticketId,
      sprintId,
      changesNoStep: true,
    })
    expect(res.status).toBe(200)
    expect(status(ticketId)).toBe("scheduled")
  })

  it("says so in the ticket's own history, so the move has an author and a reason", async () => {
    const ticketId = await aTriagedTicket()
    const sprintId = await aSprint()
    await call(IDS.staffUser, "POST /api/content/stories", {
      title: "Make the board responsive",
      storyType: "Fix",
      ticketId,
      sprintId,
      changesNoStep: true,
    })
    const history = db()
      .prepare(`SELECT type FROM activity WHERE related_row_id = ? ORDER BY id`)
      .all(ticketId) as { type: string }[]
    // A status that moves itself has to leave a line, or the record shows a stage
    // nobody can account for.
    expect(history.map((h) => h.type)).toContain("Ticket scheduled")
  })

  // R10: THE DOOR DECIDES, THE BUTTON ONLY DECIDES WHAT TO DRAW. The ticket screen
  // hides "New story" from a role without `work:create` — but hiding a control is
  // a courtesy, and the only thing standing between a role and the team's backlog
  // is this refusal. Proved by taking the right away and knocking anyway.
  it("refuses the write outright to a role without work:create, whatever the screen drew", async () => {
    const ticketId = await aTriagedTicket()
    const sprintId = await aSprint()
    db()
      .prepare(`UPDATE role_permissions SET can_create = 0 WHERE role_id = ? AND module = 'work'`)
      .run(IDS.adminRole)

    const res = await call(IDS.staffUser, "POST /api/content/stories", {
      title: "Work this person may not book",
      storyType: "Fix",
      ticketId,
      sprintId,
      changesNoStep: true,
    })
    expect(res.status).toBe(403)
    // …and the request did NOT move, because nothing was written. A refusal that
    // flipped the ticket anyway would be the worse half of the same bug.
    expect(status(ticketId)).toBe("triaged")
  })

  it("is idempotent — a second story on the same request moves nothing twice (R17)", async () => {
    const ticketId = await aTriagedTicket()
    const sprintId = await aSprint()
    const write = () =>
      call(IDS.staffUser, "POST /api/content/stories", {
        title: "More of the same work",
        storyType: "Fix",
        ticketId,
        sprintId,
        changesNoStep: true,
      })
    await write()
    await write()
    expect(status(ticketId)).toBe("scheduled")
    const scheduled = (
      db()
        .prepare(`SELECT type FROM activity WHERE related_row_id = ?`)
        .all(ticketId) as { type: string }[]
    ).filter((h) => h.type === "Ticket scheduled")
    // One line, not two: the predicate rides the UPDATE, so the second write
    // moves zero rows and writes no history.
    expect(scheduled).toHaveLength(1)
  })
})
