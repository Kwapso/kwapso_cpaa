// THE PULSE — the aggregate door Home draws its picture out of, driven through
// the SHIPPED route handler against a real SQLite database running the real team
// migrations.
//
// Three things are worth locking, and each is a way this door could be quietly
// wrong while looking right on screen:
//
//   1. IT REFUSES A CLIENT LOGIN (R21). It crosses three of the agency's own
//      modules and is reachable at the agency origin by anybody with a session,
//      so the refusal is the door's, not the screen's.
//
//   2. A MODULE THE CALLER CANNOT READ COMES BACK `null`, NOT ZERO (R18). This
//      is the one that would never be noticed: a section quietly counted for
//      somebody without the right renders a confident, wrong "0" — and a section
//      that answered 0 because the right was missing looks identical to a team
//      with no tickets.
//
//   3. THE WEEKS ARE MONDAYS, OLDEST FIRST, AND THE SECONDS LAND IN THE RIGHT
//      ONE. The bucketing is arithmetic on a boundary, which is exactly the kind
//      of code that is off by one for a year without anybody noticing, because
//      every bar still has a plausible height.

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
import { buildSpineDb, IDS, makeEnv } from "../../tenancy/test/spine-harness"
import { OPEN_HELP_STATUSES, type TeamPulse } from "@shared/types"

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

const pulse = (userId: string) =>
  worker.fetch(
    new Request("https://content/api/content/insights", {
      headers: { Cookie: "session=x" },
    }),
    env(userId) as never
  )

/** Write a finished work log straight onto the table — this door only READS, so
 * the fixture does not need the timer flow to prove the bucketing. */
function logSeconds(id: string, startedAt: string, seconds: number): void {
  db()
    .prepare(
      `INSERT INTO work_logs (id, target_table, target_id, user_id, started_at, ended_at, seconds, created_at)
       VALUES (?, 'stories', 'S1', ?, ?, ?, ?, ?)`
    )
    .run(id, IDS.staffUser, startedAt, startedAt, seconds, startedAt)
}

beforeEach(() => {
  holder.db = buildSpineDb()
})

describe("the pulse door", () => {
  it("refuses a client login outright (R21)", async () => {
    const res = await pulse(IDS.contactUser)
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error: string }).error).toBe("client_login")
  })

  it("answers the agency with exactly the sections their role can read", async () => {
    const res = await pulse(IDS.staffUser)
    expect(res.status).toBe(200)
    const body = (await res.json()) as TeamPulse
    expect(body.tickets).not.toBeNull()
    expect(body.work).not.toBeNull()
    // …and `meetings` is NULL here without anything being taken away: the shared
    // fixture's role holds `help` and `work` and has never held `meetings`, so
    // this is the law working on a role somebody built for other reasons rather
    // than on one arranged to prove it (R18).
    expect(body.meetings).toBeNull()
    // A brand-new team is all zeros — and the SHAPE is still there, because the
    // screen decides what to draw from the numbers, not from a missing key.
    expect(body.work?.weeks).toHaveLength(PULSE_WEEKS)

    // THE STAGE ARRAY IS THE WHOLE LIFECYCLE, always — a stage nobody is in must
    // still be on the axis at zero, or a bar chart silently changes shape between
    // two reads of the same screen.
    expect(body.tickets?.byStage.map((s) => s.stage)).toEqual([...OPEN_HELP_STATUSES])
    // …and the headline number is exactly what the stages under it add up to. The
    // two are computed differently on purpose (a total minus the resolved tally,
    // and a grouped count), which is what makes agreeing between them worth
    // asserting: a resolved ticket leaking into "open" is invisible on screen.
    const staged = (body.tickets?.byStage ?? []).reduce((n, s) => n + s.count, 0)
    expect(body.tickets?.open).toBe(staged)
  })

  it("hands back null — never zero — for a module the role cannot read (R18)", async () => {
    // Take `work` away from this role and leave the other two alone. A section
    // that came back `{ storiesOpen: 0, … }` here would tell somebody there is no
    // work in hand, which is a different sentence from "you may not look".
    db()
      .prepare(`UPDATE role_permissions SET can_read = 0 WHERE role_id = ? AND module = 'work'`)
      .run(IDS.adminRole)
    const body = (await (await pulse(IDS.staffUser)).json()) as TeamPulse
    expect(body.work).toBeNull()
    expect(body.tickets).not.toBeNull()
  })

  it("buckets logged time into Mondays, oldest first, with nothing falling between two weeks", async () => {
    // Two logs a fortnight apart, plus one in the week we are in. Written from
    // the door's OWN week starts, so the fixture and the query agree about which
    // Monday is which without either restating the arithmetic.
    const starts = pulseWeekStarts(new Date())
    const at = (weekIndex: number, dayOffset: number) => {
      const d = new Date(starts[weekIndex])
      d.setUTCDate(d.getUTCDate() + dayOffset)
      return d.toISOString()
    }
    logSeconds("W1", at(0, 0), 3600) // the very first Monday in range
    logSeconds("W2", at(3, 4), 1800)
    logSeconds("W3", at(PULSE_WEEKS - 1, 1), 7200) // this week
    // …and one that is OUT of range, six months back. It must not be swept into
    // the oldest bucket, which is what a `>=` with no upper bound would do.
    logSeconds("OLD", new Date(Date.now() - 180 * 86_400_000).toISOString(), 99_999)

    const body = (await (await pulse(IDS.staffUser)).json()) as TeamPulse
    const weeks = body.work?.weeks ?? []
    expect(weeks).toHaveLength(PULSE_WEEKS)
    // Oldest first, and every label is the Monday that opens its week.
    expect(weeks.map((w) => w.weekStart)).toEqual(starts.map((d) => d.toISOString().slice(0, 10)))
    for (const w of weeks) expect(new Date(`${w.weekStart}T00:00:00Z`).getUTCDay()).toBe(1)

    expect(weeks[0].seconds).toBe(3600)
    expect(weeks[1].seconds).toBe(0)
    expect(weeks[3].seconds).toBe(1800)
    expect(weeks[PULSE_WEEKS - 1].seconds).toBe(7200)
    // The out-of-range row landed nowhere, rather than in the first bucket.
    expect(weeks.reduce((n, w) => n + w.seconds, 0)).toBe(3600 + 1800 + 7200)
  })

  it("never counts time somebody deliberately binned", async () => {
    const starts = pulseWeekStarts(new Date())
    logSeconds("KEPT", starts[PULSE_WEEKS - 1].toISOString(), 600)
    logSeconds("BINNED", starts[PULSE_WEEKS - 1].toISOString(), 600)
    db()
      .prepare(`UPDATE work_logs SET discarded_at = ? WHERE id = 'BINNED'`)
      .run(new Date().toISOString())

    const body = (await (await pulse(IDS.staffUser)).json()) as TeamPulse
    const weeks = body.work?.weeks ?? []
    expect(weeks[PULSE_WEEKS - 1].seconds).toBe(600)
  })
})
