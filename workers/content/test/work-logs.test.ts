// WORK LOGS AND TIMERS, driven through the SHIPPED route handlers against a real
// SQLite database running the real team migrations.
//
// The rules here are the ones a source scan cannot see, and every one of them is
// a way a plausible timesheet goes quietly wrong: two clicks producing two timers
// on the same work, a caller telling the server how long something took, an hour
// vanishing without a trace, a binned timer still counted in a total.
//
// THE ALLOW-LIST CASES ARE DERIVED from WORK_LOG_TARGETS itself, so adding a
// fourth loggable thing is one line in the lib and is held to the same rules the
// day it lands — and the case that matters most, that a TO-DO can never be one,
// is written against the list rather than against today's contents.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
import { RUNAWAY_HOURS, WORK_LOG_TARGETS, secondsBetween } from "../src/lib/work-logs"
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

const logRows = () =>
  db().prepare(`SELECT * FROM work_logs ORDER BY started_at`).all() as Record<
    string,
    string | number | null
  >[]

const historyFor = (id: string): string[] =>
  (db().prepare(`SELECT type FROM activity WHERE related_row_id = ?`).all(id) as { type: string }[])
    .map((h) => h.type)
    .sort()

/** A story to log against. */
async function addStory(title: string): Promise<string> {
  const res = await call(IDS.staffUser, "POST /api/content/stories", { title })
  expect(res.status).toBe(200)
  return (db().prepare(`SELECT id FROM stories WHERE title = ?`).get(title) as { id: string }).id
}

/** A SECOND member of the agency, added here rather than to the shared fixture
 * because only this suite needs one: "a timer belongs to the person running it"
 * cannot be proved by a caller who is also its owner. They hold the same Admin
 * role, so their role is not what stops them — the door is. */
const OTHER_STAFF = "U_STAFF_2"

beforeEach(() => {
  holder.db = buildSpineDb()
  db().exec(`
    INSERT INTO users (id, email, first_name, current_team_id)
      VALUES ('${OTHER_STAFF}', 'ana@kwapso.app', 'Ana', '${IDS.team}');
    INSERT INTO team_members (id, team_id, user_id, role_id, created_at)
      VALUES ('m5', '${IDS.team}', '${OTHER_STAFF}', '${IDS.adminRole}', '2026-01-01');
  `)
})

describe("what time may be logged against", () => {
  it("accepts every target the allow-list names, and nothing else", async () => {
    // DERIVED: the list is the spec, so a fourth target joins these cases for
    // free and a target quietly removed from the list fails here rather than in
    // production.
    expect(Object.keys(WORK_LOG_TARGETS).length).toBeGreaterThan(0)
    const story = await addStory("Something to work on")
    const ticket = (
      (await (
        await call(IDS.staffUser, "POST /api/content/help", { description: "Something to read" })
      ).json()) as { tickets: { id: string }[] }
    ).tickets[0].id
    const ids: Record<string, string> = { stories: story, help: ticket }
    for (const table of Object.keys(WORK_LOG_TARGETS)) {
      const res = await call(IDS.staffUser, "POST /api/content/work-logs/start", {
        targetTable: table,
        targetId: ids[table],
      })
      expect(res.status, `the allow-list names ${table} but the door refused it`).toBe(200)
    }
  })

  // THE RULE THE OWNER SETTLED (.plans/BUILD-1 §5): "no work log ever attaches to
  // a to-do — it is somebody else's time, not ours." Written against the list
  // rather than against today's tables, so it still bites the day to-dos exist.
  it("refuses a to-do, an account, and anything else not on the list", async () => {
    expect(
      Object.prototype.hasOwnProperty.call(WORK_LOG_TARGETS, "todos"),
      "a to-do is the CLIENT's time — it must never be loggable against"
    ).toBe(false)
    expect(
      Object.prototype.hasOwnProperty.call(WORK_LOG_TARGETS, "accounts"),
      "an account-level-only log is a figure with no work behind it"
    ).toBe(false)
    for (const table of ["todos", "accounts", "sprints", "help_threads"]) {
      const res = await call(IDS.staffUser, "POST /api/content/work-logs/start", {
        targetTable: table,
        targetId: IDS.victimAccount,
      })
      expect(res.status, `${table} was accepted as a place to log time`).toBe(400)
    }
    expect(logRows()).toHaveLength(0)
  })

  it("refuses a target id that does not exist, rather than minting hours against nothing", async () => {
    const res = await call(IDS.staffUser, "POST /api/content/work-logs/start", {
      targetTable: "stories",
      targetId: "01NOTASTORY",
    })
    expect(res.status).toBe(404)
    expect(logRows()).toHaveLength(0)
  })
})

describe("a timer is a work log with no end yet", () => {
  it("starts in one call, with the SERVER's clock and the story's own client", async () => {
    const story = await addStory("Dispatch on the driver app")
    db().exec(`UPDATE stories SET account_id = '${IDS.victimAccount}' WHERE id = '${story}'`)
    const res = await call(IDS.staffUser, "POST /api/content/work-logs/start", {
      targetTable: "stories",
      targetId: story,
    })
    expect(res.status).toBe(200)
    const [row] = logRows()
    expect(row.ended_at).toBe(null)
    expect(row.seconds).toBe(0)
    // Billable is ON by default — a plain switch, and the default is the
    // ordinary case rather than the cautious one.
    expect(row.billable).toBe(1)
    expect(row.account_id).toBe(IDS.victimAccount)
    // The started moment is the server's, not something a caller could send.
    expect(Date.parse(row.started_at as string)).toBeLessThanOrEqual(Date.now() + 1000)
  })

  it("allows PARALLEL timers on different work, and refuses a second on the same", async () => {
    const a = await addStory("One thing")
    const b = await addStory("Another thing")
    expect(
      (await call(IDS.staffUser, "POST /api/content/work-logs/start", { targetTable: "stories", targetId: a }))
        .status
    ).toBe(200)
    // A different piece of work is a real parallel day, and it is allowed.
    expect(
      (await call(IDS.staffUser, "POST /api/content/work-logs/start", { targetTable: "stories", targetId: b }))
        .status
    ).toBe(200)
    // The SAME piece of work twice is a double count nobody would spot in a
    // total. The database refuses it, so two clicks in the same instant cannot
    // both win — and it is a clean sentence, not a 500 and not a silent success.
    const again = await call(IDS.staffUser, "POST /api/content/work-logs/start", {
      targetTable: "stories",
      targetId: a,
    })
    expect(again.status).toBe(409)
    expect((await again.json()) as { error: string }).toMatchObject({ error: "already_running" })
    expect(logRows()).toHaveLength(2)
  })

  it("stops in whole seconds computed from the two moments, never from the caller", async () => {
    const story = await addStory("Timed work")
    await call(IDS.staffUser, "POST /api/content/work-logs/start", { targetTable: "stories", targetId: story })
    const id = logRows()[0].id as string
    // Back-date the start so there is a real duration to compute.
    db().exec(`UPDATE work_logs SET started_at = '2026-08-12T09:00:00.000Z' WHERE id = '${id}'`)
    const res = await call(IDS.staffUser, "POST /api/content/work-logs/stop", {
      id,
      endedAt: "2026-08-12T10:30:00.000Z",
    })
    expect(res.status).toBe(200)
    expect(logRows()[0].seconds).toBe(5400)
  })

  it("R17 — stopping an already-stopped timer changes nothing", async () => {
    const story = await addStory("Stop me twice")
    await call(IDS.staffUser, "POST /api/content/work-logs/start", { targetTable: "stories", targetId: story })
    const id = logRows()[0].id as string
    await call(IDS.staffUser, "POST /api/content/work-logs/stop", { id, endedAt: "2026-08-12T10:00:00.000Z" })
    const first = logRows()[0]
    await call(IDS.staffUser, "POST /api/content/work-logs/stop", { id, endedAt: "2027-01-01T00:00:00.000Z" })
    expect(logRows()[0].ended_at).toBe(first.ended_at)
    expect(logRows()[0].seconds).toBe(first.seconds)
  })

  it("a timer belongs to the person running it — nobody else may stop it", async () => {
    const story = await addStory("Mine")
    await call(IDS.staffUser, "POST /api/content/work-logs/start", { targetTable: "stories", targetId: story })
    const id = logRows()[0].id as string
    // A second staff member, with every right on the module, is still refused:
    // stopping somebody else's timer puts a number on their week they did not.
    const res = await call(OTHER_STAFF, "POST /api/content/work-logs/stop", { id })
    expect(res.status).toBe(403)
    expect(logRows()[0].ended_at).toBe(null)
  })
})

describe("manual entry is always available", () => {
  it("computes the duration from the two moments, and refuses no time at all", async () => {
    const story = await addStory("Remembered work")
    const ok = await call(IDS.staffUser, "POST /api/content/work-logs", {
      targetTable: "stories",
      targetId: story,
      startedAt: "2026-08-11T09:00:00.000Z",
      endedAt: "2026-08-11T11:15:00.000Z",
      note: "Wrote the run sheet",
    })
    expect(ok.status).toBe(200)
    expect(logRows()[0].seconds).toBe(8100)

    // An end before the start is a typo or a clock, and either way it is not
    // negative hours — it is no hours, and a refusal rather than a zero row.
    const backwards = await call(IDS.staffUser, "POST /api/content/work-logs", {
      targetTable: "stories",
      targetId: story,
      startedAt: "2026-08-11T11:00:00.000Z",
      endedAt: "2026-08-11T09:00:00.000Z",
    })
    expect(backwards.status).toBe(400)
    expect(logRows()).toHaveLength(1)
  })

  it("refuses a start or a finish that is not a date and time", async () => {
    const story = await addStory("Bad dates")
    const res = await call(IDS.staffUser, "POST /api/content/work-logs", {
      targetTable: "stories",
      targetId: story,
      startedAt: "yesterday afternoon",
      endedAt: "2026-08-11T11:00:00.000Z",
    })
    expect(res.status).toBe(400)
    expect(logRows()).toHaveLength(0)
  })
})

describe("an edit to time always leaves a trail", () => {
  it("records what the figure was and what it became", async () => {
    const story = await addStory("Corrected later")
    await call(IDS.staffUser, "POST /api/content/work-logs", {
      targetTable: "stories",
      targetId: story,
      startedAt: "2026-08-11T09:00:00.000Z",
      endedAt: "2026-08-11T10:00:00.000Z",
    })
    const id = logRows()[0].id as string
    await call(IDS.staffUser, "POST /api/content/work-logs/update", {
      id,
      endedAt: "2026-08-11T11:00:00.000Z",
    })
    expect(logRows()[0].seconds).toBe(7200)
    // Time is the one record here that turns into money, so an edit that left no
    // mark would be the one edit worth making quietly.
    expect(historyFor(id)).toEqual(["Work log edited"])
  })
})

describe("a runaway timer is answered, never stopped for you", () => {
  it("is flagged after the runaway threshold and not before", async () => {
    const story = await addStory("Left running on Friday")
    await call(IDS.staffUser, "POST /api/content/work-logs/start", { targetTable: "stories", targetId: story })
    const id = logRows()[0].id as string
    const before = (await (await call(IDS.staffUser, "GET /api/content/work-logs/running")).json()) as {
      timers: { runaway: boolean }[]
    }
    expect(before.timers[0].runaway).toBe(false)

    const longAgo = new Date(Date.now() - (RUNAWAY_HOURS + 1) * 3600 * 1000).toISOString()
    db().exec(`UPDATE work_logs SET started_at = '${longAgo}' WHERE id = '${id}'`)
    const after = (await (await call(IDS.staffUser, "GET /api/content/work-logs/running")).json()) as {
      timers: { runaway: boolean }[]
    }
    // Flagged, and STILL RUNNING. Nothing stopped it: a number a person did not
    // choose is a number nobody can defend.
    expect(after.timers[0].runaway).toBe(true)
    expect(logRows()[0].ended_at).toBe(null)
  })

  it("binning one keeps the row, zeroes the hours, and names who decided", async () => {
    const story = await addStory("Nothing actually happened")
    await call(IDS.staffUser, "POST /api/content/work-logs/start", { targetTable: "stories", targetId: story })
    const id = logRows()[0].id as string
    db().exec(`UPDATE work_logs SET started_at = '2026-08-07T17:00:00.000Z' WHERE id = '${id}'`)
    const res = await call(IDS.staffUser, "POST /api/content/work-logs/runaway", { id, answer: "discard" })
    expect(res.status).toBe(200)

    const row = logRows()[0]
    // Deactivate-never-delete, in the shape a timesheet needs: an hour that
    // vanished without trace is exactly what one must never contain.
    expect(row.discarded_at).not.toBe(null)
    expect(row.discarder_name).toBe("Staff")
    expect(row.seconds).toBe(0)
    expect(historyFor(id)).toEqual(["Work log binned"])

    // …and every total subtracts it.
    const listed = (await (await call(IDS.staffUser, "GET /api/content/work-logs")).json()) as {
      logs: unknown[]
      total: number
      totalSeconds: number
    }
    expect(listed.logs).toHaveLength(0)
    expect(listed.total).toBe(0)
    expect(listed.totalSeconds).toBe(0)
  })

  it("stopping it AT a named moment keeps the hours up to then, and no more", async () => {
    const story = await addStory("Home at five")
    await call(IDS.staffUser, "POST /api/content/work-logs/start", { targetTable: "stories", targetId: story })
    const id = logRows()[0].id as string
    db().exec(`UPDATE work_logs SET started_at = '2026-08-07T14:00:00.000Z' WHERE id = '${id}'`)
    await call(IDS.staffUser, "POST /api/content/work-logs/runaway", {
      id,
      answer: "stopAt",
      at: "2026-08-07T17:00:00.000Z",
    })
    expect(logRows()[0].seconds).toBe(10800)
  })
})

describe("auto-stop is the caller's own choice, and off by default", () => {
  it("leaves other timers alone until it is switched on", async () => {
    const a = await addStory("First")
    const b = await addStory("Second")
    await call(IDS.staffUser, "POST /api/content/work-logs/start", { targetTable: "stories", targetId: a })
    await call(IDS.staffUser, "POST /api/content/work-logs/start", { targetTable: "stories", targetId: b })
    expect(logRows().filter((r) => r.ended_at === null)).toHaveLength(2)

    await call(IDS.staffUser, "POST /api/content/work-logs/auto-stop", { on: true })
    const c = await addStory("Third")
    await call(IDS.staffUser, "POST /api/content/work-logs/start", { targetTable: "stories", targetId: c })
    // Now exactly one runs: the one they just started.
    const running = logRows().filter((r) => r.ended_at === null)
    expect(running).toHaveLength(1)
    expect(running[0].target_id).toBe(c)
  })
})

describe("the list pages and totals what it is showing (R14 + R16)", () => {
  it("answers with both exact totals over the same filter", async () => {
    const story = await addStory("Counted")
    const other = await addStory("Not in the filter")
    for (const [target, mins] of [
      [story, 60],
      [other, 30],
    ] as const) {
      await call(IDS.staffUser, "POST /api/content/work-logs", {
        targetTable: "stories",
        targetId: target,
        startedAt: "2026-08-11T09:00:00.000Z",
        endedAt: `2026-08-11T${mins === 60 ? "10" : "09"}:${mins === 60 ? "00" : "30"}:00.000Z`,
      })
    }
    const all = (await (await call(IDS.staffUser, "GET /api/content/work-logs")).json()) as {
      total: number
      totalSeconds: number
    }
    expect(all.total).toBe(2)
    expect(all.totalSeconds).toBe(5400)

    const one = (await (
      await call(IDS.staffUser, "GET /api/content/work-logs", undefined, `?targetTable=stories&targetId=${story}`)
    ).json()) as { total: number; totalSeconds: number }
    expect(one.total).toBe(1)
    expect(one.totalSeconds).toBe(3600)
  })
})

describe("secondsBetween", () => {
  it("is whole, never negative, and zero for nonsense", () => {
    expect(secondsBetween("2026-08-11T09:00:00.000Z", "2026-08-11T09:00:01.900Z")).toBe(1)
    expect(secondsBetween("2026-08-11T10:00:00.000Z", "2026-08-11T09:00:00.000Z")).toBe(0)
    expect(secondsBetween("not a time", "2026-08-11T09:00:00.000Z")).toBe(0)
  })
})

// R21, behaviourally — the derived scan proves every door SAYS refusePortalCaller;
// this proves one MEANS it, against a real client login holding every right.
describe("a client login cannot reach time at all", () => {
  it("is refused the list, the running timers and the door that starts one", async () => {
    for (const route of [
      "GET /api/content/work-logs",
      "GET /api/content/work-logs/running",
    ]) {
      expect((await call(IDS.clientUser, route)).status, route).toBe(403)
    }
    const start = await call(IDS.clientUser, "POST /api/content/work-logs/start", {
      targetTable: "stories",
      targetId: "anything",
    })
    expect(start.status).toBe(403)
    expect(logRows()).toHaveLength(0)
  })
})
