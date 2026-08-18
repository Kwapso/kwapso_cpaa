// THE NUMBERS ON TOP OF A RECORD'S TIME — the aggregate door the Work logs tab
// draws, driven through the SHIPPED route handler against a real SQLite database
// running the real team migrations.
//
// FIVE THINGS ARE WORTH LOCKING, and every one of them is a way this door could
// be quietly wrong while the screen above it looks perfectly finished:
//
//   1. IT REFUSES A CLIENT LOGIN (R21). A work log names the staff member who did
//      the work and how long they took — both halves of what SCOPE ch.06 keeps
//      off the client's side — and the door sits at the agency origin where an
//      ordinary Client-role session can reach it.
//
//   2. IT NARROWS TO THE RECORD IT WAS ASKED ABOUT. The screen shows this on ONE
//      record's tab, so a filter that quietly fell through would put the whole
//      agency's hours under a single ticket, with a completely plausible chart
//      on top of them.
//
//   3. THE HEADLINE FIGURES ARE THE LIST'S OWN FIGURES (R16). They come from the
//      same `countWorkLogs` the paged list door uses, so the badge and the header
//      cannot disagree — asserted by reading BOTH doors and comparing.
//
//   4. THE BREAKDOWNS COUNT SECONDS, NOT ROWS, AND KEEP THE UNNAMED BUCKET.
//      Most logged time carries no `kind` at all; a GROUP BY that dropped NULL
//      would draw a picture of the minority and label it the whole.
//
//   5. BINNED TIME IS NOT TIME. A discarded runaway timer is an hour somebody
//      deliberately threw away, and it must not appear in any of the four
//      figures — which is the same clause `logWhere` opens with, proved here
//      rather than assumed.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
import { PULSE_WEEKS, pulseWeekStarts } from "../src/lib/insights"
import { WORK_LOG_GROUP_CAP } from "@shared/workers/limits"
import { buildSpineDb, IDS, makeEnv } from "../../tenancy/test/spine-harness"
import type { WorkLogSummary } from "@shared/types"

const db = () => holder.db as DatabaseSync

function env(userId: string) {
  const base = makeEnv(() => db(), userId) as unknown as Record<string, unknown>
  return {
    ...base,
    INTERNAL_KEY: "k",
    PUBLIC_APP_URL: "https://kwapso.example",
    REALTIME: { fetch: async () => new Response("{}") },
    MEDIA: { put: async () => undefined },
    INTERNAL_MEDIA: { put: async () => undefined },
  } as never
}

const get = (userId: string, path: string) =>
  worker.fetch(
    new Request(`https://content${path}`, { headers: { Cookie: "session=x" } }),
    env(userId) as never
  )

const summary = (userId: string, query: string) =>
  get(userId, `/api/content/work-logs/summary?${query}`)

/** Write a finished work log straight onto the table — this door only READS, so
 * the fixture does not need the timer flow to prove the arithmetic. */
function logSeconds(
  id: string,
  row: {
    targetTable?: string
    targetId?: string
    userId?: string
    userName?: string | null
    kind?: string | null
    startedAt: string
    seconds: number
  }
): void {
  db()
    .prepare(
      `INSERT INTO work_logs
         (id, target_table, target_id, user_id, user_name, kind, started_at, ended_at, seconds, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      row.targetTable ?? "stories",
      row.targetId ?? "S1",
      row.userId ?? IDS.staffUser,
      row.userName ?? "Staff Person",
      row.kind ?? null,
      row.startedAt,
      row.startedAt,
      row.seconds,
      row.startedAt
    )
}

/** This week's Monday, which is the bucket a "now" log lands in. */
const thisWeek = () => pulseWeekStarts(new Date())[PULSE_WEEKS - 1].toISOString()

beforeEach(() => {
  holder.db = buildSpineDb()
})

describe("the work-log summary door", () => {
  it("refuses a client login outright (R21)", async () => {
    const res = await summary(IDS.contactUser, "targetTable=stories&targetId=S1")
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error: string }).error).toBe("client_login")
  })

  it("answers only about the record it was asked about", async () => {
    logSeconds("A", { targetId: "S1", startedAt: thisWeek(), seconds: 3600 })
    logSeconds("B", { targetId: "S1", startedAt: thisWeek(), seconds: 1800 })
    // …another story, and a ticket. Neither may appear in S1's numbers, and this
    // is the failure that would look most convincing on screen: a chart of the
    // whole agency's week under one record's title.
    logSeconds("C", { targetId: "S2", startedAt: thisWeek(), seconds: 99_999 })
    logSeconds("D", { targetTable: "help", targetId: "S1", startedAt: thisWeek(), seconds: 77_777 })

    const body = (await (
      await summary(IDS.staffUser, "targetTable=stories&targetId=S1")
    ).json()) as WorkLogSummary
    expect(body.total).toBe(2)
    expect(body.totalSeconds).toBe(5400)
    // The same target id under a DIFFERENT table is a different record — both
    // halves of the filter have to bite, not just the id.
    expect(body.weeks[PULSE_WEEKS - 1].seconds).toBe(5400)
  })

  it("agrees with the list door it sits above, figure for figure (R16)", async () => {
    logSeconds("A", { startedAt: thisWeek(), seconds: 3600 })
    logSeconds("B", { startedAt: thisWeek(), seconds: 900 })

    const q = "targetTable=stories&targetId=S1"
    const head = (await (await summary(IDS.staffUser, q)).json()) as WorkLogSummary
    const list = (await (await get(IDS.staffUser, `/api/content/work-logs?${q}`)).json()) as {
      total: number
      totalSeconds: number
    }
    // Not "both are 2" — the point is that they are the SAME number from the same
    // function, so a change to one can never leave the other behind.
    expect(head.total).toBe(list.total)
    expect(head.totalSeconds).toBe(list.totalSeconds)
  })

  it("splits by person and by kind in SECONDS, keeping the unnamed kind as its own bucket", async () => {
    logSeconds("A", { userId: "u-marta", userName: "Marta", kind: "Build", startedAt: thisWeek(), seconds: 7200 })
    logSeconds("B", { userId: "u-marta", userName: "Marta", kind: null, startedAt: thisWeek(), seconds: 1800 })
    logSeconds("C", { userId: "u-otto", userName: "Otto", kind: "Build", startedAt: thisWeek(), seconds: 600 })

    const body = (await (
      await summary(IDS.staffUser, "targetTable=stories&targetId=S1")
    ).json()) as WorkLogSummary

    // BIGGEST FIRST, and by seconds rather than by row count: Otto has one row of
    // ten minutes and Marta has two totalling two and a half hours. A GROUP BY
    // ordered on COUNT(*) would have put them the other way round, and the chart
    // would have read as "Otto did the most" while being technically about rows.
    expect(body.people.map((p) => [p.userName, p.seconds])).toEqual([
      ["Marta", 9000],
      ["Otto", 600],
    ])
    // The kind nobody set is a bucket with a name, not a dropped row — most
    // logged time has no kind, so dropping NULL would hide the majority.
    expect(body.kinds).toEqual([
      { kind: "Build", seconds: 7800 },
      { kind: null, seconds: 1800 },
    ])
    // And the splits add up to the headline, which is what makes them a SPLIT
    // rather than three separate reads that happen to be near each other.
    expect(body.people.reduce((n, p) => n + p.seconds, 0)).toBe(body.totalSeconds)
    expect(body.kinds.reduce((n, k) => n + k.seconds, 0)).toBe(body.totalSeconds)
  })

  // R16, AND THE ONE FIGURE ON THIS DOOR THAT WAS A CEILING WEARING A TOTAL'S
  // CLOTHES. "People on it" was rendered from `people.length`, and `people` is
  // the top `WORK_LOG_GROUP_CAP` by hours — so a record worked on by more than
  // fifty people read "50" for ever, with nothing on the screen saying it had
  // stopped. The array is still capped, because a bar chart of eighty bars is not
  // a picture; the COUNT beside it is now the door's own.
  it("counts every person who worked on it, past the cap on the chart under it", async () => {
    const people = WORK_LOG_GROUP_CAP + 3
    for (let i = 0; i < people; i++)
      logSeconds(`P${i}`, {
        userId: `u-${i}`,
        userName: `Person ${i}`,
        startedAt: thisWeek(),
        // Descending, so the cap keeps a stable top fifty rather than an
        // arbitrary one — the assertion is about the LENGTH, not about who.
        seconds: (people - i) * 60,
      })

    const body = (await (
      await summary(IDS.staffUser, "targetTable=stories&targetId=S1")
    ).json()) as WorkLogSummary
    expect(body.peopleTotal).toBe(people)
    // …and the two are DIFFERENT numbers here, which is the whole point: read the
    // count off the array and this record loses three people silently.
    expect(body.people).toHaveLength(WORK_LOG_GROUP_CAP)
    expect(body.peopleTotal).toBeGreaterThan(body.people.length)
    // One person's several entries are one person, not several — it is a count of
    // PEOPLE and the rows are grouped, so this is the other way to get it wrong.
    logSeconds("AGAIN", { userId: "u-0", userName: "Person 0", startedAt: thisWeek(), seconds: 60 })
    const after = (await (
      await summary(IDS.staffUser, "targetTable=stories&targetId=S1")
    ).json()) as WorkLogSummary
    expect(after.total).toBe(people + 1)
    expect(after.peopleTotal).toBe(people)
    // …and the total says whether it stopped early, in the same object (R16).
    // This door answers with `json`, so nothing derives the flag for it.
    expect(after.totalCapped).toBe(false)
  })

  it("never counts time somebody deliberately binned, in any of the four figures", async () => {
    logSeconds("KEPT", { userName: "Marta", kind: "Build", startedAt: thisWeek(), seconds: 600 })
    logSeconds("BINNED", { userName: "Otto", kind: "Fix", startedAt: thisWeek(), seconds: 600 })
    db().prepare(`UPDATE work_logs SET discarded_at = ? WHERE id = 'BINNED'`).run(new Date().toISOString())

    const body = (await (
      await summary(IDS.staffUser, "targetTable=stories&targetId=S1")
    ).json()) as WorkLogSummary
    expect(body.total).toBe(1)
    expect(body.totalSeconds).toBe(600)
    expect(body.people.map((p) => p.userName)).toEqual(["Marta"])
    // …the person count included: Otto's only row was binned, so he is not a
    // person who worked on this.
    expect(body.peopleTotal).toBe(1)
    expect(body.kinds.map((k) => k.kind)).toEqual(["Build"])
    expect(body.weeks[PULSE_WEEKS - 1].seconds).toBe(600)
  })

  it("hands back the shape even when the record has no time at all", async () => {
    const body = (await (
      await summary(IDS.staffUser, "targetTable=stories&targetId=S-EMPTY")
    ).json()) as WorkLogSummary
    // Zeroes and empty lists, never nulls or a missing key: the panel decides
    // what to draw from the numbers, and a chart drawn on an absent field is the
    // crash the honest-empty-state rule exists to avoid.
    expect(body.total).toBe(0)
    expect(body.totalSeconds).toBe(0)
    expect(body.peopleTotal).toBe(0)
    expect(body.people).toEqual([])
    expect(body.kinds).toEqual([])
    expect(body.weeks).toHaveLength(PULSE_WEEKS)
    expect(body.weeks.every((w) => w.seconds === 0)).toBe(true)
  })
})
