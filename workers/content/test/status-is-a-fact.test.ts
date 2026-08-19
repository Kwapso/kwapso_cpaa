// A STATUS IS A FACT, NOT A BUTTON — the tester's sentence, made checkable.
//
// She said it more than any other thing: today she can click a ticket into any
// state, and marking a story "in progress" starts a timer. She wanted that
// inverted, so the status REPORTS what happened and what happened is that
// somebody started working. CHECKLIST 5.3, 5.4, 5.5, 6.7 and 5.12 are the five
// sentences that come out of it, and this suite is the four of them a scan cannot
// see plus the one that is a scan.
//
// BEHAVIOURAL, against a real SQLite database running the real team migrations,
// driven through the SHIPPED route handlers — because every rule here is about
// what happens WHEN, and a source scan can only see what is written.
//
// R17 IS THE LOAD-BEARING HALF of all four automatic moves, and it is asserted on
// every one of them: a second trigger must move zero rows, write no second
// history line and (the one that matters to a client watching) re-sort nothing.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { sourceFiles } from "@shared/rules/source-scan"

const REPO = join(__dirname, "..", "..", "..")

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

const ticketRow = (id: string) =>
  db().prepare(`SELECT status, updated_at FROM help WHERE id = ?`).get(id) as {
    status: string
    updated_at: string | null
  }
const storyRow = (id: string) =>
  db().prepare(`SELECT status FROM stories WHERE id = ?`).get(id) as { status: string }
const historyFor = (id: string): string[] =>
  (db().prepare(`SELECT type FROM activity WHERE related_row_id = ?`).all(id) as { type: string }[]).map(
    (h) => h.type
  )

beforeEach(() => {
  holder.db = buildSpineDb()
  db().exec(`
    INSERT INTO apps (id, name, created_at) VALUES ('APP_ONE', 'Dispatch', '2026-08-01T00:00:00.000Z');
    INSERT INTO sprints (id, name, starts_on, ends_on, sold_price_cents, created_at)
    VALUES ('SPR_ONE', 'August block', '2026-08-01', '2026-08-31', 450000, '2026-08-01T00:00:00.000Z');
  `)
})

/** A ticket of the agency's own — no account, so nothing here can email anybody
 * and no fixture needs a client's inbox to exist. */
async function ticket(description: string): Promise<string> {
  await call(IDS.staffUser, "POST /api/content/help", { description })
  return (db().prepare(`SELECT id FROM help WHERE description = ?`).get(description) as { id: string }).id
}

async function story(title: string, extra: Record<string, unknown> = {}): Promise<string> {
  await call(IDS.staffUser, "POST /api/content/stories", {
    title,
    storyType: "Fix",
    changesNoStep: true,
    appId: "APP_ONE",
    ...extra,
  })
  return (
    db().prepare(`SELECT id FROM stories WHERE title = ? ORDER BY id DESC LIMIT 1`).get(title) as {
      id: string
    }
  ).id
}

// CHECKLIST 5.3 — "a new state Scheduled, between Triage and In progress: stories
// exist AND are in a sprint". BOTH halves, because either alone is a different
// and wrong sentence.
/** Something to look at, through the shipped door — so these fixtures exercise
 * the same path a person does rather than writing the row by hand. */
async function attach(storyId: string) {
  const res = await call(IDS.staffUser, "POST /api/content/stories/attachments", {
    id: storyId,
    kind: "link",
    label: "The screen it changed",
    url: "https://example.test/before-and-after",
  })
  expect(res.status, "attaching must work, or every test under it is measuring the wrong thing").toBe(200)
}


describe("scheduled happens by itself", () => {
  it("does not move a ticket whose work exists but is booked into nothing", async () => {
    const id = await ticket("Work written down, nothing booked")
    await story("Unsprinted", { ticketId: id })
    expect(ticketRow(id).status).toBe("new")
    expect(historyFor(id)).not.toContain("Ticket scheduled")
  })

  it("moves it the moment its work lands in a sprint", async () => {
    const id = await ticket("This one gets booked in")
    const s = await story("To be booked", { ticketId: id })
    await call(IDS.staffUser, "POST /api/content/stories/update", {
      id: s,
      title: "To be booked",
      storyType: "Fix",
      changesNoStep: true,
      ticketId: id,
      sprintId: "SPR_ONE",
    })
    expect(ticketRow(id).status).toBe("scheduled")
    expect(historyFor(id)).toContain("Ticket scheduled")
  })

  it("R17 — a second sprinted story on the same request is not a second event", async () => {
    const id = await ticket("Two pieces of work, one booking")
    await story("First", { ticketId: id, sprintId: "SPR_ONE" })
    const stamp = ticketRow(id).updated_at
    await story("Second", { ticketId: id, sprintId: "SPR_ONE" })
    expect(historyFor(id).filter((h) => h === "Ticket scheduled")).toHaveLength(1)
    expect(ticketRow(id).updated_at, "the request re-sorted for nothing").toBe(stamp)
  })

  it("never drags a request that is already being worked on back to scheduled", async () => {
    const id = await ticket("Already started")
    const s = await story("Started", { ticketId: id })
    await call(IDS.staffUser, "POST /api/content/work-logs/start", {
      targetTable: "stories",
      targetId: s,
    })
    expect(ticketRow(id).status).toBe("in_progress")
    await story("A second one, booked", { ticketId: id, sprintId: "SPR_ONE" })
    expect(ticketRow(id).status).toBe("in_progress")
  })
})

// CHECKLIST 5.4 and 6.7 — the inversion itself. Marking a story "in progress"
// used to start a timer; starting a timer is now what marks it, on the story AND
// on the request behind it.
describe("a timer is what moves the work", () => {
  it("moves the story and the request behind it in one press", async () => {
    const id = await ticket("Somebody starts on this")
    const s = await story("The work", { ticketId: id })
    expect(storyRow(s).status).toBe("open")

    const res = await call(IDS.staffUser, "POST /api/content/work-logs/start", {
      targetTable: "stories",
      targetId: s,
    })
    expect(res.status).toBe(200)
    expect(storyRow(s).status).toBe("in_progress")
    expect(ticketRow(id).status).toBe("in_progress")
  })

  it("moves the request when the clock is started on the TICKET itself", async () => {
    // Reading, triaging and answering a request is real work and is loggable
    // against it (BUILD-1 §5) — so the ticket half must not depend on a story
    // existing at all.
    const id = await ticket("Logged against the request itself")
    await call(IDS.staffUser, "POST /api/content/work-logs/start", { targetTable: "help", targetId: id })
    expect(ticketRow(id).status).toBe("in_progress")
  })

  it("R17 — the second timer of the morning is not a second event", async () => {
    const id = await ticket("Two sittings")
    const s = await story("One piece of work", { ticketId: id })
    const start = { targetTable: "stories", targetId: s }
    await call(IDS.staffUser, "POST /api/content/work-logs/start", start)
    const stamp = ticketRow(id).updated_at
    const running = db().prepare(`SELECT id FROM work_logs WHERE ended_at IS NULL`).get() as { id: string }
    await call(IDS.staffUser, "POST /api/content/work-logs/stop", { id: running.id })
    await call(IDS.staffUser, "POST /api/content/work-logs/start", start)
    expect(historyFor(id).filter((h) => h === "Ticket in progress")).toHaveLength(1)
    expect(historyFor(s).filter((h) => h === "Story in progress")).toHaveLength(1)
    expect(ticketRow(id).updated_at).toBe(stamp)
  })

  it("never pulls reviewed work back out of review", async () => {
    const id = await ticket("Reviewed, then re-clocked")
    const s = await story("Finished work", { ticketId: id })
    await attach(s)
    await call(IDS.staffUser, "POST /api/content/stories/status", {
      id: s,
      status: "in_review",
      reviewNote: "Did the thing.",
    })
    expect(storyRow(s).status).toBe("in_review")
    await call(IDS.staffUser, "POST /api/content/work-logs/start", {
      targetTable: "stories",
      targetId: s,
    })
    expect(storyRow(s).status, "a clock un-reviewed reviewed work").toBe("in_review")
  })
})

// CHECKLIST 6.9 — "review is refused unless every timer is stopped and an
// explanation is written". The FILE is not required, which is Aurora's ruling
// over the owner's "all three always".
describe("review is refused until the work has stopped and said what it did", () => {
  it("refuses while a timer on it is still running", async () => {
    const s = await story("Still being clocked")
    // Something to look at, so this test measures the TIMER refusal rather
    // than tripping over the attachment one first. The two are checked in the
    // order a person fills the form in — say what you did, show it, then the
    // state of the work itself.
    await attach(s)
    await call(IDS.staffUser, "POST /api/content/work-logs/start", {
      targetTable: "stories",
      targetId: s,
    })
    const res = await call(IDS.staffUser, "POST /api/content/stories/status", {
      id: s,
      status: "in_review",
      reviewNote: "Ready, honest.",
    })
    expect(res.status).toBe(409)
    expect((await res.json()) as { error: string }).toMatchObject({ error: "timer_running" })
    expect(storyRow(s).status).toBe("in_progress")
  })

  // THE RULING CHANGED, AND SO DID THIS TEST (owner, 19 Aug 2026): "An
  // explanation text plus one or more files or images are required to send a
  // story for review." It used to assert the opposite — Aurora's "a file is only
  // required when there IS one" — and a test left asserting a superseded ruling
  // is worse than no test, because it goes green while the product has moved.
  it("refuses with no explanation, refuses with no file, and takes both together", async () => {
    const s = await story("Nothing to show for it")
    const bare = await call(IDS.staffUser, "POST /api/content/stories/status", {
      id: s,
      status: "in_review",
    })
    expect(bare.status).toBe(400)
    expect((await bare.json()) as { error: string }).toMatchObject({ error: "review_note_required" })

    // THE WORDS ALONE ARE NO LONGER ENOUGH. This is the exact request that used
    // to pass, kept verbatim so the reversal is legible in the diff.
    const said = await call(IDS.staffUser, "POST /api/content/stories/status", {
      id: s,
      status: "in_review",
      reviewNote: "Renamed the column and checked the two screens that read it.",
    })
    expect(said.status, "an explanation with nothing to look at is refused now").toBe(400)
    expect((await said.json()) as { error: string }).toMatchObject({ error: "review_file_required" })
    expect(storyRow(s).status, "a refused story does not move").toBe("open")

    await attach(s)
    const both = await call(IDS.staffUser, "POST /api/content/stories/status", {
      id: s,
      status: "in_review",
      reviewNote: "Renamed the column and checked the two screens that read it.",
    })
    expect(both.status).toBe(200)
    expect(storyRow(s).status).toBe("in_review")
  })

  // WHAT THE STORY CARRIES IS WHAT COUNTS, not what this request sends. Somebody
  // who uploaded on Tuesday and pressed the button on Thursday sends no files
  // with the move, and refusing them would be the rule punishing the orderly —
  // the same shape as the explanation's own `existingNote` fallback.
  it("counts files the story already had, not files sent with the move", async () => {
    const s = await story("Uploaded on Tuesday")
    await attach(s)
    const later = await call(IDS.staffUser, "POST /api/content/stories/status", {
      id: s,
      status: "in_review",
      reviewNote: "Explained on Thursday.",
    })
    expect(later.status).toBe(200)
    expect(storyRow(s).status).toBe("in_review")
  })

  it("keeps an explanation typed days ago rather than blanking it on a later move", async () => {
    const s = await story("Explained on Tuesday")
    await attach(s)
    await call(IDS.staffUser, "POST /api/content/stories/status", {
      id: s,
      status: "in_review",
      reviewNote: "Tuesday's explanation.",
    })
    await call(IDS.staffUser, "POST /api/content/stories/status", { id: s, status: "done" })
    const row = db().prepare(`SELECT review_note FROM stories WHERE id = ?`).get(s) as {
      review_note: string | null
    }
    expect(row.review_note).toBe("Tuesday's explanation.")
  })
})

// CHECKLIST 5.12 — "no automation ever unassigns the triage person".
//
// A SOURCE CENSUS, not a behaviour, because the promise is about code that does
// NOT exist: no sweep, no cron, no expiry, no clear. The only honest way to check
// "nothing else writes this table" is to look at everything that could.
describe("no automation ever unassigns the triage person (5.12)", () => {
  it("has exactly one writer of triage_duty, and it always names somebody", async () => {
    const roots = ["auth", "tenancy", "content", "data-ops", "mcp", "realtime"].map((w) =>
      join(REPO, "workers", w, "src")
    )
    const writers: string[] = []
    for (const root of roots)
      for (const file of sourceFiles(root, { extensions: [".ts"] }))
        // Any statement that could remove or blank a rota row. An INSERT that
        // names a person is the one legitimate writer; a DELETE, an UPDATE that
        // nulls the person, or any statement at all in a scheduled handler is not.
        if (/(DELETE\s+FROM\s+triage_duty|UPDATE\s+triage_duty)/i.test(file.source))
          writers.push(`${root}/${file.rel}`)
    expect(
      writers,
      "something other than `setDuty` writes triage_duty. 5.12 says no automation ever unassigns the " +
        "person on duty — the rota is only ever changed by somebody naming their replacement."
    ).toEqual([])

    // …and the one writer that DOES exist cannot write an empty name: it is an
    // upsert whose ON CONFLICT copies `excluded`, so both branches carry the
    // person the door proved against the team's membership.
    const lib = readFileSync(join(REPO, "workers", "content", "src", "lib", "triage.ts"), "utf8")
    expect(lib).toContain("ON CONFLICT(week_start) DO UPDATE SET user_id = excluded.user_id")
    expect(lib, "a rota row must never be cleared").not.toMatch(/user_id\s*=\s*NULL/i)
  })

  it("keeps the week's person when somebody re-names the same one", async () => {
    await call(IDS.staffUser, "POST /api/content/triage", { userId: IDS.staffUser })
    await call(IDS.staffUser, "POST /api/content/triage", { userId: IDS.staffUser })
    const rows = db().prepare(`SELECT user_id FROM triage_duty`).all() as { user_id: string }[]
    expect(rows).toHaveLength(1)
    expect(rows[0].user_id).toBe(IDS.staffUser)
  })
})

// CHECKLIST 5.11 — "only the person on duty sees what is waiting to be triaged".
// Decided at the DOOR: a screen that hid a list it had already been handed would
// be a curtain rather than a rule.
describe("the triage queue is one person's (5.11)", () => {
  it("hands the waiting list to the person on duty and nobody else", async () => {
    // A request old enough to be sitting: the threshold is three days.
    const id = await ticket("Nobody has read this")
    db().exec(`UPDATE help SET created_at = '2026-01-01T00:00:00.000Z' WHERE id = '${id}'`)

    await call(IDS.staffUser, "POST /api/content/triage", { userId: IDS.staffUser })
    const mine = (await (await call(IDS.staffUser, "GET /api/content/triage")).json()) as {
      yours: boolean
      total: number
      waiting: unknown[]
    }
    expect(mine.yours).toBe(true)
    expect(mine.total).toBeGreaterThan(0)

    // Hand the week to somebody else, and the list goes with it.
    await call(IDS.staffUser, "POST /api/content/triage", { userId: IDS.contactUser })
    const theirs = (await (await call(IDS.staffUser, "GET /api/content/triage")).json()) as {
      yours: boolean
      total: number
      waiting: unknown[]
      onDuty: { userName: string | null } | null
    }
    expect(theirs.yours).toBe(false)
    expect(theirs.waiting, "the queue is one person's").toEqual([])
    expect(theirs.total).toBe(0)
    // WHOSE week it is stays public: everybody needs to know who to ask.
    expect(theirs.onDuty).not.toBeNull()
  })
})
