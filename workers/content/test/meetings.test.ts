// MEETINGS, end to end, against a real SQLite database running the real team
// migrations — the shipped doors, the shipped gate, the shipped SQL. Only the D1
// REST transport is stubbed (pointed at the in-memory database), plus Google
// itself for the one door that reaches into a calendar.
//
// FOUR THINGS THIS SUITE IS FOR:
//   • a client login cannot reach ONE door of this module (R21), whatever their
//     role says — their role here holds every meeting right on purpose;
//   • a repeat is silent (R17): marking a held meeting held, or cancelling a
//     cancelled one, moves zero rows and writes no second line of history;
//   • the diary PAGES (R14) and its badge is the exact server count (R16);
//   • pressing "add to my calendar" twice makes ONE entry — the shape R17 asks
//     of a status move, applied to a write that lands in a system we do not own,
//     where a duplicate is not a stale screen but a real appointment somebody
//     has to go and delete.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))
const calendarCalls = vi.hoisted(() => ({ n: 0 }))
/** What Google's diary holds, per test — see "everything on the calendar" below. */
const diary = vi.hoisted(() => ({ events: [] as Record<string, unknown>[] }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

vi.mock("../src/lib/google-crypto", () => ({
  sealToken: async (_env: unknown, v: string) => v,
  openToken: async (_env: unknown, v: string) => v,
  tokenStorageReady: () => true,
}))

vi.mock("../src/lib/google-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/google-api")>()
  return {
    ...actual,
    // Every call makes a NEW entry, exactly as Google does — so if the door ever
    // stopped claiming the event id on the row, this fixture would happily hand
    // back a second one and the test below would see it.
    // A FAITHFUL WINDOW. The sweep reads three ranges (a fortnight back, four
    // weeks forward, and the horizon beyond), so a fixture that answered all
    // three with the same entry would hand the same event to the loop twice and
    // test a collision rather than the rule.
    calendarList: async (_t: string, range: { from?: string; to?: string }) =>
      diary.events.filter((e) => {
        const at = Date.parse(e.start as string)
        return (!range.from || at >= Date.parse(range.from)) && (!range.to || at < Date.parse(range.to))
      }),
    calendarCreate: async (_t: string, input: { summary: string; start: string; end: string }) => {
      calendarCalls.n++
      return {
        id: `EVENT_${calendarCalls.n}`,
        summary: input.summary,
        description: "",
        start: input.start,
        end: input.end,
        url: `https://calendar.example/EVENT_${calendarCalls.n}`,
        attendees: [],
      }
    },
  }
})

import worker from "../src/index"
import { buildSpineDb, IDS, makeEnv } from "../../tenancy/test/spine-harness"
import type { Meeting } from "@shared/types"

const db = () => holder.db as DatabaseSync

/** Every live ping the worker published, captured instead of broadcast. */
let published: { resource?: string; id?: string; op?: string }[] = []

function env(userId: string) {
  const base = makeEnv(() => db(), userId) as unknown as Record<string, unknown>
  return {
    ...base,
    INTERNAL_KEY: "k",
    GOOGLE_CONNECT_CLIENT_ID: "id",
    GOOGLE_CONNECT_CLIENT_SECRET: "secret",
    GOOGLE_TOKEN_KEY: "key",
    REALTIME: {
      fetch: async (_url: string, init?: { body?: string }) => {
        const body = JSON.parse(init?.body ?? "{}") as { event?: Record<string, string> }
        if (body.event) published.push(body.event)
        return new Response("{}")
      },
    },
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

/** Arrange a meeting through the DOOR (never a raw insert) and hand back its id. */
async function arrange(input: Record<string, unknown>): Promise<Meeting> {
  const res = await call(IDS.staffUser, "POST /api/content/meetings", {
    title: "Quarterly review",
    startsAt: "2026-09-14T10:00:00.000Z",
    ...input,
  })
  expect(res.status, `arranging "${String(input.title ?? "Quarterly review")}"`).toBe(200)
  return ((await res.json()) as { meeting: Meeting }).meeting
}

const historyCount = (id: string) =>
  (db().prepare("SELECT COUNT(*) n FROM activity WHERE related_row_id = ?").get(id) as { n: number }).n

beforeEach(() => {
  published = []
  calendarCalls.n = 0
  diary.events = []
  holder.db = buildSpineDb()
  // BOTH roles hold every meeting right, plus the two Google switches — so a
  // refusal below is the DOOR's and never the role's. Asserted, not assumed.
  for (const role of [IDS.adminRole, IDS.clientRole])
    for (const module of ["meetings", "google", "google_events"])
      db().exec(
        `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
         VALUES ('${role}_${module}', '${role}', '${module}', 1, 1, 1, 1);`
      )
  const granted = db()
    .prepare(
      `SELECT COUNT(*) n FROM role_permissions WHERE role_id = ? AND module = 'meetings'
        AND can_read = 1 AND can_create = 1 AND can_edit = 1 AND can_delete = 1`
    )
    .get(IDS.clientRole) as { n: number }
  expect(granted.n, "the client role must hold every meeting right for this suite to mean anything").toBe(1)
})

describe("R21 — a client login cannot reach the diary at all", () => {
  const DOORS: [string, unknown, string][] = [
    ["GET /api/content/meetings", undefined, ""],
    ["POST /api/content/meetings", { title: "Theirs now", startsAt: "2026-09-14T10:00:00.000Z" }, ""],
    ["POST /api/content/meetings/update", { id: "x", title: "T", startsAt: "2026-09-14T10:00:00.000Z" }, ""],
    ["POST /api/content/meetings/held", { id: "x", held: true }, ""],
    ["POST /api/content/meetings/active", { id: "x", active: false }, ""],
    ["POST /api/content/google/calendar/meeting", { meetingId: "x" }, ""],
  ]

  it("every door refuses them — reads and writes alike", async () => {
    for (const [route, body, query] of DOORS) {
      const res = await call(IDS.burglarUser, route, body, query)
      expect(res.status, `${route} must refuse a client login`).toBe(403)
      expect((await res.json()) as { error: string }).toMatchObject({ error: "client_login" })
    }
    const grants = db()
      .prepare("SELECT COUNT(*) n FROM portal_users WHERE user_id = ? AND deactivated_at IS NULL")
      .get(IDS.burglarUser) as { n: number }
    expect(grants.n, "the burglar must hold a live portal grant, or they were never a client login").toBe(1)
  })

  it("nothing they sent reached the database", async () => {
    await call(IDS.burglarUser, "POST /api/content/meetings", {
      title: "Theirs now",
      startsAt: "2026-09-14T10:00:00.000Z",
    })
    expect((db().prepare("SELECT COUNT(*) n FROM meetings").get() as { n: number }).n).toBe(0)
  })
})

describe("bad input is a 400, never a 500 (R20)", () => {
  const BAD: [string, Record<string, unknown>][] = [
    ["no title", { title: "", startsAt: "2026-09-14T10:00:00.000Z" }],
    ["a title that isn't a string", { title: { a: 1 }, startsAt: "2026-09-14T10:00:00.000Z" }],
    ["no start", { title: "Review" }],
    ["a start that isn't a moment", { title: "Review", startsAt: "next Tuesdayish" }],
    [
      "an end before the start",
      { title: "Review", startsAt: "2026-09-14T10:00:00.000Z", endsAt: "2026-09-14T09:00:00.000Z" },
    ],
    [
      "a client nobody has",
      { title: "Review", startsAt: "2026-09-14T10:00:00.000Z", accountId: "A_NOBODY" },
    ],
    [
      "a purpose nobody uses",
      { title: "Review", startsAt: "2026-09-14T10:00:00.000Z", purposeId: "P_NOBODY" },
    ],
  ]

  it.each(BAD)("%s is refused cleanly", async (_what, body) => {
    const res = await call(IDS.staffUser, "POST /api/content/meetings", body)
    expect(res.status).toBe(400)
    expect((db().prepare("SELECT COUNT(*) n FROM meetings").get() as { n: number }).n).toBe(0)
  })
})

describe("R17 — a repeat is silent", () => {
  it("marking a held meeting held again moves nothing and says nothing", async () => {
    const m = await arrange({})
    const before = historyCount(m.id)

    const first = await call(IDS.staffUser, "POST /api/content/meetings/held", { id: m.id, held: true })
    expect(first.status).toBe(200)
    expect(((await first.json()) as { meeting: Meeting }).meeting.status).toBe("held")
    const afterFirst = historyCount(m.id)
    expect(afterFirst, "the real move writes one line of history").toBe(before + 1)
    published = []

    const second = await call(IDS.staffUser, "POST /api/content/meetings/held", { id: m.id, held: true })
    expect(second.status).toBe(200)
    expect(historyCount(m.id), "the repeat writes none").toBe(afterFirst)
    expect(published, "and pings nobody").toEqual([])
  })

  it("cancelling a cancelled meeting moves nothing — and the row survives either way", async () => {
    const m = await arrange({ title: "Kick-off" })
    await call(IDS.staffUser, "POST /api/content/meetings/active", { id: m.id, active: false })
    const afterFirst = historyCount(m.id)
    published = []

    await call(IDS.staffUser, "POST /api/content/meetings/active", { id: m.id, active: false })
    expect(historyCount(m.id)).toBe(afterFirst)
    expect(published).toEqual([])

    // Deactivate-never-delete: "didn't we speak in March?" stays answerable.
    const row = db().prepare("SELECT title, deactivated_at FROM meetings WHERE id = ?").get(m.id) as {
      title: string
      deactivated_at: string | null
    }
    expect(row.title).toBe("Kick-off")
    expect(row.deactivated_at).not.toBeNull()
  })
})

describe("the diary itself", () => {
  it("keeps the agenda and the notes — the two fields a work log had nowhere to put", async () => {
    const m = await arrange({
      agenda: "What shipped, what is next, and the dispatch complaints.",
      notes: "Agreed to move the driver app forward and park the reporting work.",
      accountId: IDS.victimAccount,
    })
    const res = await call(IDS.staffUser, "GET /api/content/meetings", undefined, `?id=${m.id}`)
    const { meetings } = (await res.json()) as { meetings: Meeting[] }
    expect(meetings[0].agenda).toContain("dispatch complaints")
    expect(meetings[0].notes).toContain("park the reporting work")
    // The client and its name ride the read, so a list of fifty is one round trip.
    expect(meetings[0].accountName).toBe("Bergman S.A.")
  })

  it("a meeting with a client gets the reference that client quotes; ours gets none", async () => {
    db().exec(`UPDATE accounts SET code = 'BERG' WHERE id = '${IDS.victimAccount}';`)
    const theirs = await arrange({ title: "Review", accountId: IDS.victimAccount })
    const ours = await arrange({ title: "Our own planning" })
    expect(theirs.ref).toBe("BERG-M0001")
    expect(ours.ref, "a number nobody can quote is worse than none").toBeNull()
  })

  it("R14 + R16: the list PAGES and its total is the exact server count", async () => {
    for (let i = 0; i < 55; i++)
      await arrange({ title: `Meeting ${i}`, startsAt: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T10:00:00.000Z` })

    const first = await call(IDS.staffUser, "GET /api/content/meetings", undefined, "?view=all")
    const page1 = (await first.json()) as {
      meetings: Meeting[]
      total: number
      hasMore: boolean
      nextCursor: string | null
    }
    expect(page1.total, "the badge counts the WHOLE diary, not the page").toBe(55)
    expect(page1.meetings.length).toBe(50)
    expect(page1.hasMore).toBe(true)
    expect(page1.nextCursor).toBeTruthy()

    const second = await call(
      IDS.staffUser,
      "GET /api/content/meetings",
      undefined,
      `?view=all&cursor=${encodeURIComponent(page1.nextCursor as string)}`
    )
    const page2 = (await second.json()) as { meetings: Meeting[]; hasMore: boolean }
    expect(page2.meetings.length, "page two is reachable, and it is the REST of them").toBe(5)
    expect(page2.hasMore).toBe(false)
    // No row appears twice — the keyset is a position, not an offset.
    const ids = new Set([...page1.meetings, ...page2.meetings].map((m) => m.id))
    expect(ids.size).toBe(55)
  })

  it("the default view hides what has already been held, and `all` shows the lot", async () => {
    const held = await arrange({ title: "Already happened" })
    await arrange({ title: "Still to come" })
    await call(IDS.staffUser, "POST /api/content/meetings/held", { id: held.id, held: true })

    const upcoming = (await (
      await call(IDS.staffUser, "GET /api/content/meetings", undefined, "?view=upcoming")
    ).json()) as { meetings: Meeting[]; total: number }
    expect(upcoming.meetings.map((m) => m.title)).toEqual(["Still to come"])
    expect(upcoming.total, "R16: the count answers the SAME question the rows did").toBe(1)

    const all = (await (
      await call(IDS.staffUser, "GET /api/content/meetings", undefined, "?view=all")
    ).json()) as { meetings: Meeting[]; total: number }
    expect(all.total).toBe(2)
  })
})

describe("a meeting booked here shows up in a calendar — once", () => {
  function connectCalendar(userId: string) {
    const future = new Date(Date.now() + 3_600_000).toISOString()
    db().exec(
      `INSERT INTO google_connections (id, user_id, service, google_email, scopes, access_token,
         access_expires_at, refresh_token, created_at, creator_id)
       VALUES ('C_cal', '${userId}', 'calendar', 'me@kwapso.app', 'scope', 'plain', '${future}',
         'plain-refresh', '2026-01-01', '${userId}');`
    )
  }

  it("the first press creates an entry and the second answers with the one that exists", async () => {
    connectCalendar(IDS.staffUser)
    const m = await arrange({ title: "Quarterly review", accountId: IDS.victimAccount })

    const first = (await (
      await call(IDS.staffUser, "POST /api/content/google/calendar/meeting", { meetingId: m.id })
    ).json()) as { event: { id: string }; alreadyThere: boolean }
    expect(first.alreadyThere).toBe(false)
    expect(calendarCalls.n).toBe(1)

    const second = (await (
      await call(IDS.staffUser, "POST /api/content/google/calendar/meeting", { meetingId: m.id })
    ).json()) as { event: { id: string }; alreadyThere: boolean }
    expect(second.alreadyThere, "a second press is not a second appointment").toBe(true)
    expect(second.event.id).toBe(first.event.id)
    expect(calendarCalls.n, "and Google is not asked again at all").toBe(1)
  })

  it("a cancelled meeting is not pushed anywhere", async () => {
    connectCalendar(IDS.staffUser)
    const m = await arrange({ title: "Called off" })
    await call(IDS.staffUser, "POST /api/content/meetings/active", { id: m.id, active: false })
    const res = await call(IDS.staffUser, "POST /api/content/google/calendar/meeting", { meetingId: m.id })
    expect(res.status).toBe(409)
    expect(calendarCalls.n).toBe(0)
  })

  it("without the events switch the door refuses, however much else the role holds", async () => {
    connectCalendar(IDS.staffUser)
    const m = await arrange({ title: "Quarterly review" })
    db().exec(
      `UPDATE role_permissions SET can_create = 0 WHERE role_id = '${IDS.adminRole}' AND module = 'google_events';`
    )
    const res = await call(IDS.staffUser, "POST /api/content/google/calendar/meeting", { meetingId: m.id })
    expect(res.status).toBe(403)
    expect(calendarCalls.n).toBe(0)
  })
})

describe("R1 — every write publishes", () => {
  it("a create, an edit, a status move and a cancel each ping the diary", async () => {
    const m = await arrange({ title: "Review" })
    expect(published.map((p) => p.resource)).toContain("meetings")
    published = []

    await call(IDS.staffUser, "POST /api/content/meetings/update", {
      id: m.id,
      title: "Review, moved",
      startsAt: "2026-09-15T10:00:00.000Z",
    })
    await call(IDS.staffUser, "POST /api/content/meetings/held", { id: m.id, held: true })
    await call(IDS.staffUser, "POST /api/content/meetings/active", { id: m.id, active: false })
    expect(published.filter((p) => p.resource === "meetings").length).toBe(3)
    for (const p of published) expect(p.id, "row-level, so an open list patches ONE row").toBe(m.id)
  })
})

// ── EVERYTHING ON THE CALENDAR REACHES THE DIARY ─────────────────────────────
//
// THE OWNER'S BUG, in his own diary. He asked why "FluClinic: Client selectable
// data" — a real meeting on 18 August, organised by a colleague, him an accepted
// guest, on his primary calendar, at the right hour — was not in kwapso. It read
// back perfectly from Google every time anybody looked.
//
// The line was `if (!event.recurringEventId) continue`. `syncCalendar` only ever
// made a record for an instance of a REPEATING series, so of the 21 rows it had
// mirrored, 21 were recurring and 0 were one-offs. Worse than absent: the
// knowledge sweep reads every event, so the app could ANSWER questions about a
// meeting it refused to SHOW him.
//
// His instruction settles what replaces it, and it is not a narrower rule but
// the absence of one: "I want everything that's in my Google Calendar to sync
// here, whether they're past events, new events, whatever." A guest-list test
// was written first and thrown away — it would have kept out the block somebody
// puts in their own day, which is a judgement nobody asked us to make.

/** One entry as Google returns it, with only what the sweep reads.
 *
 * The times are RELATIVE to now — two days out, inside the sweep's forward
 * window — because the window straddles today and a fixture pinned to a date
 * would start failing on its own the week after it was written. */
const SOON = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
const entry = (over: Record<string, unknown>) => ({
  id: "E1",
  summary: "FluClinic: Client selectable data",
  description: "",
  start: SOON.toISOString(),
  end: new Date(SOON.getTime() + 3_600_000).toISOString(),
  timeZone: "Asia/Kolkata",
  allDay: false,
  url: "https://calendar.example/E1",
  joinUrl: null,
  organizer: { email: "ishita@kwapso.com", name: "Ishita" },
  location: "",
  status: "confirmed",
  meetingCode: "",
  // The bug, in one field: nothing repeats here.
  recurringEventId: "",
  recurrence: [],
  // Fixed on purpose: idempotence is decided by this stamp NOT moving.
  updatedAt: "2026-08-18T08:00:00.000Z",
  attendees: [],
  attachments: [],
  ...over,
})

const connectCalendar = () =>
  db().exec(
    `INSERT INTO google_connections (id, user_id, service, google_email, scopes, access_token,
       access_expires_at, refresh_token, created_at, creator_id)
     VALUES ('C_CAL', '${IDS.staffUser}', 'calendar', 'me@kwapso.app', 'scope', 'plain',
       '${new Date(Date.now() + 3_600_000).toISOString()}', 'plain-refresh', '2026-01-01', '${IDS.staffUser}');`
  )

const diaryTitles = () =>
  (db().prepare("SELECT title FROM meetings ORDER BY title").all() as { title: string }[]).map((r) => r.title)

describe("the sweep brings in everything, not only the repeating entries", () => {
  beforeEach(connectCalendar)

  it("a ONE-OFF meeting becomes a record — the entry he could not find", async () => {
    // No `recurringEventId` anywhere on it. This is the whole bug.
    diary.events = [
      entry({
        attendees: [
          { email: "ishita@kwapso.com", name: "Ishita", response: "accepted", organizer: true, optional: false },
        ],
      }),
    ]

    const res = await call(IDS.staffUser, "POST /api/content/meetings/sync-calendar", {})

    expect(res.status).toBe(200)
    expect((await res.json()) as { created: number }).toMatchObject({ created: 1 })
    expect(diaryTitles()).toContain("FluClinic: Client selectable data")
  })

  it("an entry with no guests at all comes in too — 'everything' was meant literally", async () => {
    diary.events = [entry({ id: "E2", summary: "Write the deck" })]
    await call(IDS.staffUser, "POST /api/content/meetings/sync-calendar", {})
    expect(diaryTitles()).toContain("Write the deck")
  })

  it("a repeating instance still comes in, so nothing that worked stopped working", async () => {
    diary.events = [entry({ id: "E3", summary: "Monday stand-up", recurringEventId: "SERIES_1" })]
    await call(IDS.staffUser, "POST /api/content/meetings/sync-calendar", {})
    expect(diaryTitles()).toContain("Monday stand-up")
  })

  it("an entry already called off is NOT created just to be cancelled", async () => {
    diary.events = [entry({ id: "E4", summary: "Abandoned call", status: "cancelled" })]
    const res = await call(IDS.staffUser, "POST /api/content/meetings/sync-calendar", {})
    expect((await res.json()) as { created: number }).toMatchObject({ created: 0 })
    expect(diaryTitles()).toHaveLength(0)
  })

  it("an entry with no title gets words rather than a blank, and sweeping twice writes once (R17)", async () => {
    diary.events = [entry({ id: "E5", summary: "" })]
    await call(IDS.staffUser, "POST /api/content/meetings/sync-calendar", {})
    expect(diaryTitles()).toEqual(["A meeting with no title"])

    // IDEMPOTENT. Google's `updated` has not moved, so the second sweep must
    // touch nothing at all — no second row, no second activity line, no ping.
    const again = await call(IDS.staffUser, "POST /api/content/meetings/sync-calendar", {})
    expect((await again.json()) as { created: number; updated: number }).toMatchObject({ created: 0, updated: 0 })
    expect(diaryTitles()).toHaveLength(1)
  })
})
