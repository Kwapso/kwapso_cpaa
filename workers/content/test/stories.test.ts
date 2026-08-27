// STORIES AND SPRINTS — driven through the SHIPPED route handlers against a real
// SQLite database running the real team migrations.
//
// Behavioural, not source-scanning, on purpose. The rules here are the kind a
// scan cannot see: whether a story can be closed with nothing said about the
// process step it changed, whether two sprints sold on one account in the same
// instant can take the same reference, whether marking a done story done again
// writes a second line into its history.

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
    // The shared media bucket. A no-op is enough: what a replace has to prove is
    // that the ROW ends up pointing at a NEW key, and the row is in the database
    // this suite already reads.
    MEDIA: { put: async () => {} },
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

const storyRow = (id: string) =>
  db().prepare(`SELECT * FROM stories WHERE id = ?`).get(id) as Record<string, string | number | null>

/** The history written about one row, as a SORTED list of its sentences.
 *
 * Sorted rather than chronological, deliberately. Every id here is a ULID minted
 * inside the same millisecond, so their random tail — not the order the rows were
 * written — decides how `ORDER BY id` returns them. These cases are about HOW MANY
 * sentences history holds and WHICH, never about their sequence, so sorting is the
 * honest comparison; asserting an order the generator does not promise would make
 * the suite flake and teach the next person to re-run it until it passes. */
const historyFor = (id: string): string[] =>
  (db().prepare(`SELECT type FROM activity WHERE related_row_id = ?`).all(id) as { type: string }[])
    .map((h) => h.type)
    .sort()

/** A live process map to hang a story off. CHECKLIST 6.5 makes "which maps does
 * this change?" a question every story answers, so a case about anything else
 * needs one to exist — written straight into the team database, because this
 * suite is about stories and the process doors are another module's. */
function seedProcess(): string {
  const id = "01PROCESSFORSTORYTEST0001"
  db().exec(
    `INSERT INTO apps (id, name, created_at) VALUES ('01APPFORSTORYTEST00000001', 'Test app', '2026-08-17T00:00:00.000Z');
     INSERT INTO processes (id, app_id, name, created_at)
     VALUES ('${id}', '01APPFORSTORYTEST00000001', 'A way of working', '2026-08-17T00:00:00.000Z');`
  )
  return id
}

/** Write a story and hand back its id.
 *
 * TWO FIELDS ARE DEFAULTED IN, and both are new REFUSALS rather than conveniences
 * (CHECKLIST 6.2 and 6.5): a story must name its kind, and must either name the
 * processes it changes or tick that it changes none. Every case below is about
 * something else, so the helper supplies the ordinary answer and the two cases
 * that are about the refusals pass their own. */
async function addStory(body: Record<string, unknown>): Promise<string> {
  const res = await call(IDS.staffUser, "POST /api/content/stories", {
    storyType: "Fix",
    changesNoStep: true,
    ...body,
  })
  expect(res.status, "the story door refused a plain create").toBe(200)
  const found = db()
    .prepare(`SELECT id FROM stories WHERE title = ? ORDER BY id DESC LIMIT 1`)
    .get(body.title as string) as { id: string } | undefined
  expect(found, "the story was not written").toBeTruthy()
  return (found as { id: string }).id
}

beforeEach(() => {
  holder.db = buildSpineDb()
  // The victim's company carries a short code, which is what a reference number
  // is built out of. The shared fixture doesn't set one (it isn't about
  // references), so this suite gives it one.
  db().exec(`UPDATE accounts SET code = 'BERG' WHERE id = '${IDS.victimAccount}';`)
})

describe("a story is what WE do", () => {
  it("opens in `open`, and moves through in progress and in review", async () => {
    const id = await addStory({ title: "Walk the lifecycle" })
    expect(storyRow(id).status).toBe("open")
    // SOMETHING TO LOOK AT, because review now needs one as well as an
    // explanation (owner, 19 Aug 2026). Attached through the shipped door so
    // this walk exercises the same path a person takes.
    expect(
      (
        await call(IDS.staffUser, "POST /api/content/stories/attachments", {
          id,
          kind: "link",
          label: "The screen it changed",
          url: "https://example.test/before-and-after",
        })
      ).status
    ).toBe(200)
    for (const status of ["in_progress", "in_review"]) {
      // `reviewNote` rides both moves and only one of them reads it: a story
      // cannot go to review without saying what was done (CHECKLIST 6.9). It is
      // sent on the first move too because the door COALESCEs it — an
      // explanation typed on Tuesday is still the explanation on Thursday.
      const res = await call(IDS.staffUser, "POST /api/content/stories/status", {
        id,
        status,
        reviewNote: "Walked it end to end and checked it on a phone.",
      })
      expect(res.status).toBe(200)
      expect(storyRow(id).status).toBe(status)
    }
    // A fifth state does not exist, and a typo must not become one.
    const gone = await call(IDS.staffUser, "POST /api/content/stories/status", { id, status: "blocked" })
    expect(gone.status).toBe(400)
    expect(storyRow(id).status).toBe("in_review")
  })

  it("stands on its own with no ticket behind it — four out of five in the real history do", async () => {
    const id = await addStory({ title: "Tidy the deploy script" })
    expect(storyRow(id).ticket_id).toBe(null)
  })

  it("takes its account, and its reference number, from the ticket it answers", async () => {
    const ticket = (
      (await (
        await call(IDS.staffUser, "POST /api/content/help", {
          description: "Dispatch board stopped refreshing",
          accountId: IDS.victimAccount,
        })
      ).json()) as { tickets: { id: string; accountId: string | null }[] }
    ).tickets[0]
    const id = await addStory({ title: "Fix the refresh", ticketId: ticket.id })
    expect(storyRow(id).account_id).toBe(IDS.victimAccount)
    // Its own sequence, not the ticket's: BERG-T0001 and BERG-S0001 are two
    // different things and a client quotes both.
    expect(storyRow(id).ref).toBe("BERG-S0001")
  })

  it("refuses a made-up ticket rather than writing a story pointing at nothing", async () => {
    const res = await call(IDS.staffUser, "POST /api/content/stories", {
      title: "Answer a request that does not exist",
      storyType: "Fix",
      changesNoStep: true,
      ticketId: "01NOTATICKET",
    })
    expect(res.status).toBe(400)
    expect(db().prepare(`SELECT COUNT(*) AS n FROM stories`).get()).toEqual({ n: 0 })
  })
})

// THE RULE THE SAVINGS MATHS HANGS OFF (.plans/BUILD-1 §2): "a story cannot close
// without naming the process step it changes, or explicitly saying it changes
// none. Required. Do not make it optional 'for now'."
//
// A refusal rather than a default, and that is the whole point of the case below.
// Defaulting to "changes no step" would fill the savings maths with quiet zeroes,
// which is worse than an empty column because it looks like an answer.
describe("a story cannot close without saying what it changed", () => {
  it("refuses `done` when the story names no step and does not say it changes none", async () => {
    // THE TWO RULES ARE ABOUT TWO THINGS, and this case is about the second.
    // CHECKLIST 6.5 says a story must name the PROCESSES it changes or tick that
    // it changes none, and that is checked when it is written. This rule is about
    // the STEP inside one of those maps, and it is checked when it CLOSES. So the
    // fixture names a map and no step: legal to write, refused to close.
    const process = seedProcess()
    const id = await addStory({
      title: "Change something, unspecified",
      processIds: [process],
      changesNoStep: false,
    })
    const res = await call(IDS.staffUser, "POST /api/content/stories/status", { id, status: "done" })
    expect(res.status).toBe(400)
    expect((await res.json()) as { error: string }).toMatchObject({ error: "step_required" })
    // And it did not half-close: the row is untouched and the history is silent.
    expect(storyRow(id).status).toBe("open")
    expect(storyRow(id).closed_at).toBe(null)
    expect(historyFor(id)).toEqual(["Story created"])
  })

  it("allows `done` once the story names the step it changed", async () => {
    const id = await addStory({ title: "Automate the approval", stepKey: "STEP_APPROVE" })
    expect((await call(IDS.staffUser, "POST /api/content/stories/status", { id, status: "done" })).status).toBe(200)
    expect(storyRow(id).status).toBe("done")
    expect(storyRow(id).closed_at).not.toBe(null)
  })

  it("allows `done` when it explicitly changes NO step — a different answer from silence", async () => {
    const id = await addStory({ title: "Rename a button", changesNoStep: true })
    expect((await call(IDS.staffUser, "POST /api/content/stories/status", { id, status: "done" })).status).toBe(200)
    expect(storyRow(id).status).toBe("done")
    // Both facts survive on the row, so the savings maths can later tell "we
    // looked and it changed nothing" from "nobody filled this in".
    expect(storyRow(id).step_key).toBe(null)
    expect(storyRow(id).changes_no_step).toBe(1)
  })

  it("the closing note is what we will tell the client, and it is kept", async () => {
    const id = await addStory({ title: "Ship the driver app", changesNoStep: true })
    await call(IDS.staffUser, "POST /api/content/stories/status", {
      id,
      status: "done",
      closingNote: "Drivers now see the run sheet on the phone.",
    })
    expect(storyRow(id).closing_note).toBe("Drivers now see the run sheet on the phone.")
  })
})

describe("R17 — moving a story twice is not two events", () => {
  it("marking a done story done again writes no second history line", async () => {
    const id = await addStory({ title: "Do it once", changesNoStep: true })
    await call(IDS.staffUser, "POST /api/content/stories/status", { id, status: "done" })
    const first = storyRow(id).closed_at
    await call(IDS.staffUser, "POST /api/content/stories/status", { id, status: "done" })
    expect(historyFor(id)).toEqual(["Story created", "Story done"].sort())
    // …and it did not re-stamp the moment it closed, which is the fact anybody
    // reading a backlog later actually depends on.
    expect(storyRow(id).closed_at).toBe(first)
  })
})

describe("the list answers with a page and an exact total (R14 + R16)", () => {
  it("hides finished work by default, and counts what it is showing", async () => {
    const done = await addStory({ title: "Already finished", changesNoStep: true })
    await addStory({ title: "Still going" })
    await call(IDS.staffUser, "POST /api/content/stories/status", { id: done, status: "done" })

    const backlog = (await (await call(IDS.staffUser, "GET /api/content/stories")).json()) as {
      stories: { id: string }[]
      total: number
      hasMore: boolean
      nextCursor: string | null
    }
    expect(backlog.stories.map((s) => s.id)).not.toContain(done)
    // R16: the total counts the SAME question the page asked — not every row in
    // the table. A badge saying 2 over a list of 1 is the failure this prevents.
    expect(backlog.total).toBe(1)
    expect(backlog.hasMore).toBe(false)
    expect(backlog.nextCursor).toBe(null)

    const all = (await (await call(IDS.staffUser, "GET /api/content/stories", undefined, "?view=all")).json()) as {
      stories: { id: string }[]
      total: number
    }
    expect(all.stories.map((s) => s.id)).toContain(done)
    expect(all.total).toBe(2)
  })

  it("pages by key, and page two starts where page one stopped", async () => {
    // PAGE_SIZE is 50 — write one more than that so there genuinely is a page two.
    for (let i = 0; i < 51; i++) await addStory({ title: `Story ${String(i).padStart(3, "0")}` })
    const one = (await (await call(IDS.staffUser, "GET /api/content/stories")).json()) as {
      stories: { id: string }[]
      total: number
      hasMore: boolean
      nextCursor: string | null
    }
    expect(one.stories).toHaveLength(50)
    expect(one.total).toBe(51)
    expect(one.hasMore).toBe(true)
    expect(one.nextCursor).toBeTruthy()

    const two = (await (
      await call(IDS.staffUser, "GET /api/content/stories", undefined, `?cursor=${encodeURIComponent(one.nextCursor as string)}`)
    ).json()) as { stories: { id: string }[]; hasMore: boolean }
    expect(two.stories).toHaveLength(1)
    expect(two.hasMore).toBe(false)
    // No row appears on both pages — the whole reason the cursor is a KEY and
    // not an offset.
    const seen = new Set(one.stories.map((s) => s.id))
    expect(two.stories.every((s) => !seen.has(s.id))).toBe(true)
  })

  it("filters by the ticket a piece of work answers", async () => {
    const ticket = (
      (await (
        await call(IDS.staffUser, "POST /api/content/help", { description: "Two jobs on one request" })
      ).json()) as { tickets: { id: string }[] }
    ).tickets[0]
    await addStory({ title: "First half", ticketId: ticket.id })
    await addStory({ title: "Unrelated" })
    const res = (await (
      await call(IDS.staffUser, "GET /api/content/stories", undefined, `?ticketId=${ticket.id}`)
    ).json()) as { stories: { title: string }[]; total: number }
    expect(res.stories.map((s) => s.title)).toEqual(["First half"])
    expect(res.total).toBe(1)
  })
})

describe("a sprint is the block of work sold", () => {
  it("carries a whole-cent price, its own reference, and the counts of the work in it", async () => {
    await call(IDS.staffUser, "POST /api/content/sprints", {
      name: "Dispatch, sprint 4",
      accountId: IDS.victimAccount,
      sprintType: "Implementation",
      soldPriceCents: 450_000,
    })
    const sprint = db().prepare(`SELECT * FROM sprints LIMIT 1`).get() as Record<string, string | number>
    expect(sprint.sold_price_cents).toBe(450_000)
    expect(sprint.ref).toBe("BERG-SPR0001")

    const open = await addStory({ title: "In the sprint", sprintId: sprint.id as string })
    await addStory({ title: "Also in it", sprintId: sprint.id as string, changesNoStep: true })
    void open
    const listed = (await (await call(IDS.staffUser, "GET /api/content/sprints")).json()) as {
      sprints: { storyCount: number; openStoryCount: number }[]
      total: number
    }
    expect(listed.total).toBe(1)
    expect(listed.sprints[0].storyCount).toBe(2)
    expect(listed.sprints[0].openStoryCount).toBe(2)
  })

  it("refuses a price that is not a whole, non-negative number of cents", async () => {
    for (const soldPriceCents of [-1, 12.5, "4500"]) {
      const res = await call(IDS.staffUser, "POST /api/content/sprints", {
        name: `Bad price ${String(soldPriceCents)}`,
        soldPriceCents,
      })
      expect(res.status, `a price of ${String(soldPriceCents)} was accepted`).toBe(400)
    }
    expect(db().prepare(`SELECT COUNT(*) AS n FROM sprints`).get()).toEqual({ n: 0 })
  })

  // THE PRICE CAN BE SET AFTER THE FACT, which is the whole reason this door
  // exists: a sprint is usually agreed before its price is, and until now
  // `sold_price_cents` could be written only in the instant the sprint was
  // started — so the revenue half of every margin had no second chance.
  it("a sprint's price can be corrected after it was started", async () => {
    await call(IDS.staffUser, "POST /api/content/sprints", {
      name: "Priced later",
      accountId: IDS.victimAccount,
    })
    const id = (db().prepare(`SELECT id FROM sprints LIMIT 1`).get() as { id: string }).id
    expect(
      (db().prepare(`SELECT sold_price_cents FROM sprints WHERE id = ?`).get(id) as { sold_price_cents: number })
        .sold_price_cents
    ).toBe(0)

    const res = await call(IDS.staffUser, "POST /api/content/sprints/update", {
      id,
      name: "Priced later",
      soldPriceCents: 450_000,
      sprintType: "Implementation",
    })
    expect(res.status).toBe(200)
    const after = db().prepare(`SELECT * FROM sprints WHERE id = ?`).get(id) as Record<string, string | number>
    expect(after.sold_price_cents).toBe(450_000)
    expect(after.sprint_type).toBe("Implementation")
    expect(historyFor(id)).toEqual(["Sprint created", "Sprint edited"].sort())
  })

  // …and the two fields it must NOT move. The reference a client quotes was
  // minted against the account, and completing the sprint cuts a version of every
  // process map inside its app — so a body naming either is simply not read.
  it("will not move a sprint to another client or another app", async () => {
    await call(IDS.staffUser, "POST /api/content/sprints", {
      name: "Stays put",
      accountId: IDS.victimAccount,
    })
    const before = db().prepare(`SELECT * FROM sprints LIMIT 1`).get() as Record<string, string | number>
    await call(IDS.staffUser, "POST /api/content/sprints/update", {
      id: before.id,
      name: "Stays put",
      accountId: "some-other-account",
      appId: "some-other-app",
    })
    const after = db().prepare(`SELECT * FROM sprints WHERE id = ?`).get(before.id) as Record<
      string,
      string | number
    >
    expect(after.account_id).toBe(before.account_id)
    expect(after.app_id).toBe(before.app_id)
    expect(after.ref).toBe(before.ref)
  })

  it("refuses a price that is not whole cents on the EDIT door too", async () => {
    await call(IDS.staffUser, "POST /api/content/sprints", { name: "Edited badly" })
    const id = (db().prepare(`SELECT id FROM sprints LIMIT 1`).get() as { id: string }).id
    for (const soldPriceCents of [-1, 12.5, "4500"]) {
      const res = await call(IDS.staffUser, "POST /api/content/sprints/update", {
        id,
        name: "Edited badly",
        soldPriceCents,
      })
      expect(res.status, `a price of ${String(soldPriceCents)} was accepted`).toBe(400)
    }
    expect(
      (db().prepare(`SELECT sold_price_cents FROM sprints WHERE id = ?`).get(id) as { sold_price_cents: number })
        .sold_price_cents
    ).toBe(0)
  })

  it("R17 — completing a completed sprint changes nothing and cuts nothing", async () => {
    await call(IDS.staffUser, "POST /api/content/sprints", { name: "Once", accountId: IDS.victimAccount })
    const id = (db().prepare(`SELECT id FROM sprints LIMIT 1`).get() as { id: string }).id
    await call(IDS.staffUser, "POST /api/content/sprints/complete", { id, complete: true })
    const first = (db().prepare(`SELECT completed_at FROM sprints WHERE id = ?`).get(id) as { completed_at: string })
      .completed_at
    await call(IDS.staffUser, "POST /api/content/sprints/complete", { id, complete: true })
    // ONE history line, and the moment it completed did not move — which matters
    // more here than anywhere else in the module: that moment is what a process
    // map's next version is cut from.
    expect(historyFor(id)).toEqual(["Sprint created", "Sprint completed"].sort())
    expect(
      (db().prepare(`SELECT completed_at FROM sprints WHERE id = ?`).get(id) as { completed_at: string })
        .completed_at
    ).toBe(first)
  })
})

// R21, behaviourally. The derived scan in web/test/module-refusal-symmetry.test.ts
// proves every door in this module SAYS `refusePortalCaller`; this proves one of
// them MEANS it, against a real client login in a real database — the difference
// between a source match and a refusal.
describe("a client login cannot reach the work engine at all", () => {
  it("is refused the backlog, and refused the door that would write to it", async () => {
    const read = await call(IDS.clientUser, "GET /api/content/stories")
    expect(read.status).toBe(403)
    const write = await call(IDS.clientUser, "POST /api/content/stories", {
      title: "Not yours to write",
      storyType: "Fix",
      changesNoStep: true,
    })
    expect(write.status).toBe(403)
    expect(db().prepare(`SELECT COUNT(*) AS n FROM stories`).get()).toEqual({ n: 0 })
  })
})

// THE TICKET↔STORY TRANSACTION (.plans/BUILD-1 §2 + §4). SCOPE ch.07: a ticket
// flips to READY when the last of its stories closes — and the flip rides the
// SAME call as the close, because a client is watching the request and a portal
// that says "in progress" after the last piece of work is done is lying about
// the thing the portal is for.
describe("the Ready flip", () => {
  /** Raise a ticket and hand back its id. */
  async function addTicket(description: string): Promise<string> {
    const res = await call(IDS.staffUser, "POST /api/content/help", {
      description,
      accountId: IDS.victimAccount,
    })
    expect(res.status).toBe(200)
    return (db().prepare(`SELECT id FROM help WHERE description = ?`).get(description) as { id: string }).id
  }
  const ticketRow = (id: string) =>
    db().prepare(`SELECT * FROM help WHERE id = ?`).get(id) as Record<string, string | number | null>

  it("does NOT flip while any piece of work is still outstanding", async () => {
    const ticket = await addTicket("Two jobs to do")
    const a = await addStory({ title: "First", ticketId: ticket, changesNoStep: true })
    await addStory({ title: "Second", ticketId: ticket, changesNoStep: true })
    await call(IDS.staffUser, "POST /api/content/stories/status", { id: a, status: "done" })
    expect(ticketRow(ticket).status).toBe("new")
  })

  it("flips the moment the LAST one closes, in the same call", async () => {
    const ticket = await addTicket("One job to do")
    const only = await addStory({ title: "The only one", ticketId: ticket, changesNoStep: true })
    const res = await call(IDS.staffUser, "POST /api/content/stories/status", { id: only, status: "done" })
    expect(res.status).toBe(200)
    // One call. Nothing else has run in between, and the ticket is already there.
    expect(ticketRow(ticket).status).toBe("ready")
    expect(historyFor(ticket)).toContain("Ticket ready")
  })

  it("R17 — a re-run close moves no rows and writes no second 'Ticket ready'", async () => {
    const ticket = await addTicket("Do it once")
    const only = await addStory({ title: "Once", ticketId: ticket, changesNoStep: true })
    await call(IDS.staffUser, "POST /api/content/stories/status", { id: only, status: "done" })
    const stamp = ticketRow(ticket).updated_at
    await call(IDS.staffUser, "POST /api/content/stories/status", { id: only, status: "done" })
    expect(historyFor(ticket).filter((t) => t === "Ticket ready")).toHaveLength(1)
    // …and the ticket did not re-sort to the top of somebody's list for nothing.
    expect(ticketRow(ticket).updated_at).toBe(stamp)
  })

  it("never drags a RESOLVED ticket back out of resolved", async () => {
    const ticket = await addTicket("Answered already")
    const straggler = await addStory({ title: "Tidy up afterwards", ticketId: ticket, changesNoStep: true })
    // RESOLVING IS NOT A STATUS MOVE any more (CHECKLIST 5.6): `/help/status`
    // refuses the word outright, because answering a client requires the words to
    // send. The resolve door is the only way in, and it is the one a person uses.
    const byStatus = await call(IDS.staffUser, "POST /api/content/help/status", {
      id: ticket,
      status: "resolved",
    })
    expect(byStatus.status, "a status move must not be able to resolve a ticket").toBe(400)
    await call(IDS.staffUser, "POST /api/content/help/resolve", {
      id: ticket,
      resolution: "All done, here is what we changed.",
    })
    await call(IDS.staffUser, "POST /api/content/stories/status", { id: straggler, status: "done" })
    // The client has been told. Un-answering their request because a loose end
    // was tidied up afterwards would be the worst kind of "helpful".
    expect(ticketRow(ticket).status).toBe("resolved")
    expect(historyFor(ticket)).not.toContain("Ticket ready")
  })

  it("a ticket with no stories at all is never flipped by somebody else's close", async () => {
    const bare = await addTicket("Nobody has planned this yet")
    const other = await addTicket("A different request")
    const s = await addStory({ title: "Work on the other one", ticketId: other, changesNoStep: true })
    await call(IDS.staffUser, "POST /api/content/stories/status", { id: s, status: "done" })
    expect(ticketRow(bare).status).toBe("new")
    expect(ticketRow(other).status).toBe("ready")
  })

  it("each closing note lands in the ticket's DRAFT, in the order the work finished", async () => {
    const ticket = await addTicket("Two halves, two sentences")
    const a = await addStory({ title: "First half", ticketId: ticket, changesNoStep: true })
    const b = await addStory({ title: "Second half", ticketId: ticket, changesNoStep: true })
    await call(IDS.staffUser, "POST /api/content/stories/status", {
      id: a,
      status: "done",
      closingNote: "Drivers now see the run sheet on the phone.",
    })
    await call(IDS.staffUser, "POST /api/content/stories/status", {
      id: b,
      status: "done",
      closingNote: "The back-office screen shows the same list.",
    })
    expect(ticketRow(ticket).draft_resolution).toBe(
      "Drivers now see the run sheet on the phone.\n\nThe back-office screen shows the same list."
    )
  })

  it("the draft is OURS — a client reading their own ticket is never sent it", async () => {
    const ticket = await addTicket("A request from the client's own company")
    const s = await addStory({ title: "Work", ticketId: ticket, changesNoStep: true })
    await call(IDS.staffUser, "POST /api/content/stories/status", {
      id: s,
      status: "done",
      closingNote: "Internal wording: tell them the import is fixed, don't mention the retry loop.",
    })
    const staffRead = (await (
      await call(IDS.staffUser, "GET /api/content/help", undefined, `?id=${ticket}`)
    ).json()) as { tickets: { draftResolution: string | null }[] }
    expect(staffRead.tickets[0].draftResolution).toContain("don't mention the retry loop")

    // IDS.contactUser is a client login at the same company — they can read the
    // ticket, and the draft must not be on the wire, not merely undrawn.
    const clientRead = await call(IDS.contactUser, "GET /api/content/help", undefined, `?id=${ticket}`)
    const body = await clientRead.text()
    expect(body).not.toContain("retry loop")
    expect((JSON.parse(body) as { tickets: { draftResolution: string | null }[] }).tickets[0].draftResolution).toBe(
      null
    )
  })
})

// FIXING WHAT IS ALREADY ATTACHED — the door the module did not have, and the
// one decision inside it that a reader has to be able to check rather than take
// on trust: a RENAME edits the row and a REPLACE writes a new one beside a
// deactivated old one. The distinction is invisible from the outside (both leave
// the story showing exactly one attachment, which is the whole point), so it is
// asserted here against the table itself.
describe("a story's attachments can be fixed, not only added and taken off", () => {
  /** Attach a link and hand back its id, through the shipped door. */
  async function attachLink(storyId: string, label: string, url: string): Promise<string> {
    const res = await call(IDS.staffUser, "POST /api/content/stories/attachments", {
      id: storyId,
      kind: "link",
      label,
      url,
    })
    expect(res.status, "attaching must work, or the case under it measures nothing").toBe(200)
    const { attachments } = JSON.parse(await res.text()) as { attachments: { id: string; label: string }[] }
    return attachments.find((a) => a.label === label)!.id
  }

  /** Attach a real file the same way, so a replace has real bytes to replace. */
  async function attachFile(storyId: string, label: string): Promise<string> {
    const res = await call(IDS.staffUser, "POST /api/content/stories/attachments", {
      id: storyId,
      kind: "file",
      label,
      // A one-pixel PNG is a whole, well-formed, inline-safe upload — the door's
      // binary validator is the same one the app's uploads go through, so a
      // stand-in string would be testing the refusal path by accident.
      fileDataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    })
    expect(res.status, "attaching a file must work, or the case under it measures nothing").toBe(200)
    const { attachments } = JSON.parse(await res.text()) as { attachments: { id: string; label: string }[] }
    return attachments.find((a) => a.label === label)!.id
  }

  const rows = (storyId: string) =>
    db()
      .prepare(`SELECT label, url, deactivated_at FROM story_attachments WHERE story_id = ? ORDER BY created_at`)
      .all(storyId) as { label: string; url: string; deactivated_at: string | null }[]

  it("renames in place — one row, the new name, and nothing new in the bucket", async () => {
    const story = await addStory({ title: "Rename what I attached" })
    const attachmentId = await attachLink(story, "Untitled", "https://example.test/a")

    const res = await call(IDS.staffUser, "POST /api/content/stories/attachments/update", {
      id: story,
      attachmentId,
      label: "The before and after",
    })
    expect(res.status).toBe(200)
    // ONE row, still. A rename is not a replace, and the difference has to be
    // visible in the table or the distinction is only a comment.
    expect(rows(story)).toEqual([
      { label: "The before and after", url: "https://example.test/a", deactivated_at: null },
    ])
    expect(historyFor(story)).toContain("Story attachment renamed")
  })

  it("renaming it to what it already says moves nothing (R17)", async () => {
    const story = await addStory({ title: "Say the same thing twice" })
    const attachmentId = await attachLink(story, "The plan", "https://example.test/plan")
    const before = historyFor(story).length

    for (let i = 0; i < 2; i++) {
      const res = await call(IDS.staffUser, "POST /api/content/stories/attachments/update", {
        id: story,
        attachmentId,
        label: "The plan",
      })
      expect(res.status).toBe(200)
    }
    // Two presses, zero rows moved, zero lines of history.
    expect(historyFor(story).length).toBe(before)
    expect(historyFor(story)).not.toContain("Story attachment renamed")
  })

  it("replacing a file leaves ONE attachment listed and TWO rows in the table", async () => {
    const story = await addStory({ title: "I attached the wrong screenshot" })
    const attachmentId = await attachFile(story, "wrong.png")
    const wasUrl = rows(story)[0].url

    const res = await call(IDS.staffUser, "POST /api/content/stories/attachments/update", {
      id: story,
      attachmentId,
      label: "right.png",
      fileDataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    })
    expect(res.status).toBe(200)
    const { attachments, total } = JSON.parse(await res.text()) as {
      attachments: { label: string; url: string }[]
      total: number
    }
    // WHAT THE ASK ASKED FOR: the record does not show both.
    expect(attachments.map((a) => a.label)).toEqual(["right.png"])
    expect(total).toBe(1)

    // …and what deactivate-never-delete asked for: the wrong one is still on
    // record, still pointing at the object somebody actually uploaded, with the
    // deactivation stamped on it.
    const all = rows(story)
    expect(all.length).toBe(2)
    expect(all[0]).toMatchObject({ label: "wrong.png", url: wasUrl })
    expect(all[0].deactivated_at, "the old row must be deactivated, not deleted").not.toBe(null)
    expect(all[1].deactivated_at).toBe(null)
    // A NEW KEY. Overwriting the old one in place would leave the audit row
    // pointing at bytes that are no longer the bytes it names — and /media is
    // served immutable, so a rewritten key is a stale picture in a cache.
    expect(all[1].url).not.toBe(wasUrl)
    expect(all[1].url.startsWith("/media/story/")).toBe(true)

    // ONE line of history, saying what it was. A remove plus an add would read
    // as somebody deleting the evidence and then thinking better of it.
    expect(historyFor(story).filter((h) => h === "Story file replaced").length).toBe(1)
    expect(historyFor(story)).not.toContain("Story attachment removed")
  })

  it("keeps the old name when a replacement arrives without one", async () => {
    const story = await addStory({ title: "Swap the file, keep the name" })
    const attachmentId = await attachFile(story, "The signed contract")
    const res = await call(IDS.staffUser, "POST /api/content/stories/attachments/update", {
      id: story,
      attachmentId,
      fileDataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    })
    expect(res.status).toBe(200)
    const { attachments } = JSON.parse(await res.text()) as { attachments: { label: string }[] }
    expect(attachments.map((a) => a.label)).toEqual(["The signed contract"])
  })

  it("refuses the incoherent shapes rather than half-writing them", async () => {
    const story = await addStory({ title: "Ask for nonsense" })
    const link = await attachLink(story, "A link", "https://example.test/l")
    const file = await attachFile(story, "A file")
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

    // Bytes for a link, and a web address for a file: both are somebody's
    // mistake about WHICH row, and a silent half-write is the worst answer.
    for (const body of [
      { id: story, attachmentId: link, fileDataUrl: png },
      { id: story, attachmentId: file, url: "https://example.test/nope" },
      // Both at once — the door cannot know which one was meant.
      { id: story, attachmentId: file, url: "https://example.test/nope", fileDataUrl: png },
      // Nothing to do at all.
      { id: story, attachmentId: file },
      // A link that is not a link.
      { id: story, attachmentId: link, url: "javascript:alert(1)" },
    ])
      expect((await call(IDS.staffUser, "POST /api/content/stories/attachments/update", body)).status).toBe(400)

    // An id that is not on this story is a 404, not a 400 and not a silent 200.
    expect(
      (
        await call(IDS.staffUser, "POST /api/content/stories/attachments/update", {
          id: story,
          attachmentId: "01ZZZZZZZZZZZZZZZZZZZZZZZZ",
          label: "Nowhere",
        })
      ).status
    ).toBe(404)

    // Nothing moved through any of that.
    expect(rows(story).filter((r) => r.deactivated_at === null).length).toBe(2)
  })
})
