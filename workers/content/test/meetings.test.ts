// MEETINGS, end to end, against a real SQLite database running the real team
// migrations — the shipped doors, the shipped gate, the shipped SQL. Only the D1
// REST transport is stubbed (pointed at the in-memory database), plus Google
// itself for the one door that reaches into a calendar.
//
// FIVE THINGS THIS SUITE IS FOR:
//   • a client login cannot reach ONE door of this module (R21), whatever their
//     role says — their role here holds every meeting right on purpose;
//   • a repeat is silent (R17): cancelling a cancelled meeting moves zero rows
//     and writes no second line of history;
//   • the meetings list PAGES (R14) and its badge is the exact server count (R16);
//   • THE CALENDAR IS READ-ONLY. Not one door in this app writes to Google's
//     calendar, and the suite asserts that by asking the seven that used to and
//     getting nothing back;
//   • READING A TRANSCRIPT TWICE DOES NOT DOUBLE ANYBODY'S HOURS. The claim
//     rides `transcript_captured_at IS NULL` and always did — which is why
//     retiring the `held` status could not weaken it — and this suite proves it
//     rather than trusting the reading.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))
/** What Google's calendar holds, per test — see "everything on the calendar" below. */
const googleCalendar = vi.hoisted(() => ({ events: [] as Record<string, unknown>[] }))
/** What the transcript hunt finds, per test, and how many times it was asked. */
const transcript = vi.hoisted(() => ({ found: null as Record<string, unknown> | null, hunts: 0 }))

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
    // A FAITHFUL WINDOW. The sweep reads four ranges (a fortnight back, four
    // weeks forward, one backfill slice and the horizon beyond), so a fixture
    // that answered them all with the same entry would hand the same event to
    // the loop four times and test a collision rather than the rule.
    calendarList: async (_t: string, range: { from?: string; to?: string }) => ({
      events: googleCalendar.events.filter((e) => {
        const at = Date.parse(e.start as string)
        return (!range.from || at >= Date.parse(range.from)) && (!range.to || at < Date.parse(range.to))
      }),
      truncated: false,
    }),
    // The transcript capture reads the entry before hunting for its transcript.
    calendarGet: async (_t: string, eventId: string) =>
      googleCalendar.events.find((e) => e.id === eventId) ?? { id: eventId, attendees: [] },
    // NOTHING ELSE IS MOCKED, AND THAT IS THE POINT: there is no `calendarCreate`
    // here because there is no `calendarCreate` in the module any more. The
    // read-only suite below asks the seven doors that used to write and asserts
    // the app no longer has one.
  }
})

vi.mock("../src/lib/google-transcript", () => ({
  findTranscript: async () => {
    transcript.hunts++
    return transcript.found
  },
}))

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
  googleCalendar.events = []
  transcript.found = null
  transcript.hunts = 0
  holder.db = buildSpineDb()
  // BOTH roles hold every meeting right and the Google one — so a refusal below
  // is the DOOR's and never the role's. Asserted, not assumed.
  for (const role of [IDS.adminRole, IDS.clientRole])
    for (const module of ["meetings", "google"])
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

describe("R21 — a client login cannot reach the meetings list at all", () => {
  const DOORS: [string, unknown, string][] = [
    ["GET /api/content/meetings", undefined, ""],
    ["POST /api/content/meetings", { title: "Theirs now", startsAt: "2026-09-14T10:00:00.000Z" }, ""],
    ["POST /api/content/meetings/update", { id: "x", title: "T", startsAt: "2026-09-14T10:00:00.000Z" }, ""],
    ["POST /api/content/meetings/active", { id: "x", active: false }, ""],
    ["POST /api/content/meetings/sync-calendar", {}, ""],
    ["POST /api/content/meetings/transcript", { id: "x" }, ""],
    ["GET /api/content/meetings/transcript", undefined, "?id=x"],
    ["GET /api/content/meetings/people", undefined, "?id=x"],
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

describe("the meetings list itself", () => {
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
    expect(page1.total, "the badge counts the WHOLE meetings list, not the page").toBe(55)
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

  // THE CLOCK DECIDES, NOT A TICK. `upcoming` used to mean "nobody has marked it
  // held", which answered a question about somebody's memory: a meeting from
  // March that nobody ticked sat in "upcoming" for ever, and one ticked early
  // vanished from a day it had not reached. Both meetings below are arranged the
  // same way and neither is touched afterwards — the only thing separating them
  // is when they are.
  it("the default view hides what has already started, and `all` shows the lot", async () => {
    await arrange({ title: "Already happened", startsAt: new Date(Date.now() - 86_400_000).toISOString() })
    await arrange({ title: "Still to come", startsAt: new Date(Date.now() + 86_400_000).toISOString() })

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

// ── THE CALENDAR IS READ-ONLY, AND THE PROOF IS AN ABSENCE ───────────────────
//
// The owner, 18 August 2026: "disable the ability to create, edit, or delete
// anything in the calendar from the frontend… just make it one-way so we only
// grab and update the information."
//
// Seven doors did it. Asking each one now must produce a 404 from the
// switchboard — NOT a 403, which would mean the door still exists and is merely
// refusing this caller. The distinction is the whole test: a permission can be
// granted back, a missing route cannot.
describe("a meeting that has no words SAYS so, and the list can find the ones that do", () => {
  // THE FAULT, MEASURED ON STAGING 28 Aug 2026. `get_meeting_transcript` answered
  // 200 with {"text":"","note":null,"url":null,"foundBy":null,"capturedAt":null}
  // for a meeting with nothing on file. To a model that is indistinguishable from
  // having guessed the wrong id, so it guessed again: 23 tool calls in one turn,
  // TWELVE of them list_meetings, and the turn ended without reading anything.
  // 36 of that base's 461 meetings have words, so a blind retry is right 8% of
  // the time — and the meeting it had been asked about, with 38,077 characters on
  // it, was never among the ones it saw.

  it("the empty answer says it is empty, in words, and says it is final", async () => {
    const m = await arrange({ title: "A call nobody recorded" })
    const res = await call(IDS.staffUser, "GET /api/content/meetings/transcript", undefined, `?id=${m.id}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { found: boolean; message: string; text: string; capturedAt: string | null }
    // R23's shape: the boolean and the sentence are one decision, so a caller can
    // branch on `found` and repeat `message` rather than inferring from "".
    expect(body.found).toBe(false)
    expect(body.text).toBe("")
    expect(body.capturedAt).toBeNull()
    // NOT AN EMPTY STRING, and not a shrug. It has to be actionable prose or the
    // model does what it did: try again.
    expect(body.message.length).toBeGreaterThan(40)
    // NEVER A TOOL'S NAME (defect 2, measured on staging 31 Aug 2026): this
    // message used to say "use read_meeting_transcript" and "ask
    // list_meetings", and the assistant relayed both verbatim to a person who
    // has no tool to run. A system-prompt rule against that lost to this
    // sentence every time it was tried (0/5, three phrasings) — a concrete
    // instruction sitting in the data the model is reading beat a general rule
    // about not repeating instructions. So the fact moved into the message
    // and the tool name moved out: what's true (it may still be captured from
    // Google; other meetings can be checked by whether theirs is captured),
    // never which identifier to call.
    expect(body.message).not.toMatch(/read_meeting_transcript/)
    expect(body.message).not.toMatch(/list_meetings/)
    expect(body.message).toMatch(/Google/)
    expect(body.message).toMatch(/captured/)
  })

  it("a captured transcript answers found: true, with the words", async () => {
    const m = await arrange({ title: "A call somebody recorded" })
    db()
      .prepare("UPDATE meetings SET transcript_text = ?, transcript_captured_at = ? WHERE id = ?")
      .run("Aparna: so how do we scope this", "2026-08-25T14:30:00.000Z", m.id)
    const res = await call(IDS.staffUser, "GET /api/content/meetings/transcript", undefined, `?id=${m.id}`)
    const body = (await res.json()) as { found: boolean; message: string; text: string }
    expect(body.found).toBe(true)
    expect(body.text).toContain("how do we scope this")
    expect(body.message).not.toMatch(/No transcript/)
  })

  it("a capture that came back EMPTY is still found: false — the case the stamp and the words disagree about", async () => {
    // THE ONLY CASE WHERE `found` HAS TWO PLAUSIBLE DEFINITIONS, so it is the
    // only case that proves which one shipped. A stamp with no text means we
    // went and looked and there was nothing; to a caller asking what was said
    // that is the same answer as never having looked, and `found: true` with an
    // empty string would put it straight back in the bind this whole change
    // exists to end. The stamp is not thrown away — it is what makes the two
    // empty messages different sentences.
    const m = await arrange({ title: "A silent call" })
    db()
      .prepare("UPDATE meetings SET transcript_text = '', transcript_captured_at = ? WHERE id = ?")
      .run("2026-08-25T14:30:00.000Z", m.id)
    const res = await call(IDS.staffUser, "GET /api/content/meetings/transcript", undefined, `?id=${m.id}`)
    const body = (await res.json()) as { found: boolean; message: string; capturedAt: string | null }
    expect(body.found).toBe(false)
    expect(body.capturedAt, "the stamp still rides the answer — it is history").not.toBeNull()
    expect(body.message).toMatch(/no words in it/)
    expect(body.message, "we already looked, so it must NOT send the caller looking").not.toMatch(/read_meeting_transcript/)
  })

  it("a meeting that does not exist is still a 404, not a 'found: false'", async () => {
    // The distinction the old shape could not draw, drawn from the other side:
    // "there is no such meeting" and "there are no words" are different answers
    // and a caller must be able to tell them apart.
    const res = await call(IDS.staffUser, "GET /api/content/meetings/transcript", undefined, "?id=01NOSUCHMEETING000000000000")
    expect(res.status).toBe(404)
  })

  it("transcript=yes keeps only the meetings that have words; 'no' keeps only the rest", async () => {
    const withWords = await arrange({ title: "Recorded", startsAt: "2026-09-01T10:00:00.000Z" })
    await arrange({ title: "Not recorded", startsAt: "2026-09-02T10:00:00.000Z" })
    db()
      .prepare("UPDATE meetings SET transcript_captured_at = ? WHERE id = ?")
      .run("2026-09-01T11:00:00.000Z", withWords.id)

    const yes = await call(IDS.staffUser, "GET /api/content/meetings", undefined, "?view=all&transcript=yes")
    const yesBody = (await yes.json()) as { meetings: Meeting[]; total: number }
    expect(yesBody.meetings.map((m) => m.title)).toEqual(["Recorded"])
    // R16: the badge counts the SAME question the rows answered. A filter that
    // narrowed the rows and not the count would read as "1 of 2 shown".
    expect(yesBody.total).toBe(1)

    const no = await call(IDS.staffUser, "GET /api/content/meetings", undefined, "?view=all&transcript=no")
    const noBody = (await no.json()) as { meetings: Meeting[]; total: number }
    expect(noBody.meetings.map((m) => m.title)).toEqual(["Not recorded"])
    expect(noBody.total).toBe(1)
  })

  it("a transcript filter nobody can spell narrows NOTHING — it never picks a side", async () => {
    const withWords = await arrange({ title: "Recorded", startsAt: "2026-09-01T10:00:00.000Z" })
    await arrange({ title: "Not recorded", startsAt: "2026-09-02T10:00:00.000Z" })
    db()
      .prepare("UPDATE meetings SET transcript_captured_at = ? WHERE id = ?")
      .run("2026-09-01T11:00:00.000Z", withWords.id)
    const res = await call(IDS.staffUser, "GET /api/content/meetings", undefined, "?view=all&transcript=maybe")
    const body = (await res.json()) as { total: number }
    expect(body.total, "a word outside the allow-list must mean 'I did not narrow'").toBe(2)
  })

  it("q finds a meeting by WHO WAS ON IT, which is how a person names a call", async () => {
    // Of the 458 live meetings on staging, 4 have an agenda and 75 have notes —
    // but 251 carry a guest list, because they arrive from Google with a title
    // and the people who were asked. Searching two nearly-always-empty columns
    // and skipping the populated one made `q` a filter that mostly found nothing.
    const m = await arrange({ title: "Strategy session", startsAt: "2026-09-03T10:00:00.000Z" })
    await arrange({ title: "Something else", startsAt: "2026-09-04T10:00:00.000Z" })
    db()
      .prepare("UPDATE meetings SET google_attendees_json = ? WHERE id = ?")
      .run(JSON.stringify([{ email: "aparna@gwventures.pro", name: "datla aparna" }]), m.id)
    const res = await call(IDS.staffUser, "GET /api/content/meetings", undefined, "?view=all&q=aparna")
    const body = (await res.json()) as { meetings: Meeting[]; total: number }
    expect(body.meetings.map((x) => x.title)).toEqual(["Strategy session"])
    expect(body.total).toBe(1)
  })

  it("the needle is never a pattern — a guest-list search cannot mean 'everything'", async () => {
    await arrange({ title: "Recorded", startsAt: "2026-09-01T10:00:00.000Z" })
    await arrange({ title: "Not recorded", startsAt: "2026-09-02T10:00:00.000Z" })
    const res = await call(IDS.staffUser, "GET /api/content/meetings", undefined, "?view=all&q=%25")
    const body = (await res.json()) as { total: number }
    expect(body.total, "a bare % must match nothing, not every meeting the agency ever held").toBe(0)
  })
})

describe("nothing in this app writes to a calendar", () => {
  const GONE: [string, unknown][] = [
    ["POST /api/content/google/calendar/events", { summary: "New", start: "x", end: "y" }],
    ["POST /api/content/google/calendar/event/update", { eventId: "E", summary: "Renamed" }],
    ["POST /api/content/google/calendar/event/guests", { eventId: "E", add: ["a@b.c"] }],
    ["POST /api/content/google/calendar/event/location", { eventId: "E", location: "Room 2" }],
    ["POST /api/content/google/calendar/event/cancel", { eventId: "E" }],
    ["POST /api/content/google/calendar/sprint", { sprintId: "S" }],
    ["POST /api/content/google/calendar/meeting", { meetingId: "M" }],
  ]

  it.each(GONE)("%s no longer exists", async (route, body) => {
    const res = await call(IDS.staffUser, route, body)
    expect(res.status, `${route} must be gone, not merely gated`).toBe(404)
  })

  it("and the module itself exports no function that could send one", async () => {
    const api = await import("../src/lib/google-api")
    for (const name of ["calendarCreate", "calendarUpdate", "calendarGuests", "calendarCancel", "calendarPatch"])
      expect(name in api, `${name} must not exist — a door can be re-added, an import cannot be forgotten`).toBe(
        false
      )
  })
})

describe("R1 — every write publishes", () => {
  it("a create, an edit and a cancel each ping the meetings list", async () => {
    const m = await arrange({ title: "Review" })
    expect(published.map((p) => p.resource)).toContain("meetings")
    published = []

    await call(IDS.staffUser, "POST /api/content/meetings/update", {
      id: m.id,
      title: "Review, moved",
      startsAt: "2026-09-15T10:00:00.000Z",
    })
    await call(IDS.staffUser, "POST /api/content/meetings/active", { id: m.id, active: false })
    expect(published.filter((p) => p.resource === "meetings").length).toBe(2)
    for (const p of published) expect(p.id, "row-level, so an open list patches ONE row").toBe(m.id)
  })
})

// ── EVERYTHING ON THE CALENDAR REACHES THE MEETINGS LIST ─────────────────────
//
// THE OWNER'S BUG, in his own calendar. He asked why "FluClinic: Client selectable
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

const meetingTitles = () =>
  (db().prepare("SELECT title FROM meetings ORDER BY title").all() as { title: string }[]).map((r) => r.title)

describe("the sweep brings in everything, not only the repeating entries", () => {
  beforeEach(connectCalendar)

  it("a ONE-OFF meeting becomes a record — the entry he could not find", async () => {
    // No `recurringEventId` anywhere on it. This is the whole bug.
    googleCalendar.events = [
      entry({
        attendees: [
          { email: "ishita@kwapso.com", name: "Ishita", response: "accepted", organizer: true, optional: false },
        ],
      }),
    ]

    const res = await call(IDS.staffUser, "POST /api/content/meetings/sync-calendar", {})

    expect(res.status).toBe(200)
    expect((await res.json()) as { created: number }).toMatchObject({ created: 1 })
    expect(meetingTitles()).toContain("FluClinic: Client selectable data")
  })

  it("an entry with no guests at all comes in too — 'everything' was meant literally", async () => {
    googleCalendar.events = [entry({ id: "E2", summary: "Write the deck" })]
    await call(IDS.staffUser, "POST /api/content/meetings/sync-calendar", {})
    expect(meetingTitles()).toContain("Write the deck")
  })

  it("a repeating instance still comes in, so nothing that worked stopped working", async () => {
    googleCalendar.events = [entry({ id: "E3", summary: "Monday stand-up", recurringEventId: "SERIES_1" })]
    await call(IDS.staffUser, "POST /api/content/meetings/sync-calendar", {})
    expect(meetingTitles()).toContain("Monday stand-up")
  })

  it("an entry already called off is NOT created just to be cancelled", async () => {
    googleCalendar.events = [entry({ id: "E4", summary: "Abandoned call", status: "cancelled" })]
    const res = await call(IDS.staffUser, "POST /api/content/meetings/sync-calendar", {})
    expect((await res.json()) as { created: number }).toMatchObject({ created: 0 })
    expect(meetingTitles()).toHaveLength(0)
  })

  it("an entry with no title gets words rather than a blank, and sweeping twice writes once (R17)", async () => {
    googleCalendar.events = [entry({ id: "E5", summary: "" })]
    await call(IDS.staffUser, "POST /api/content/meetings/sync-calendar", {})
    expect(meetingTitles()).toEqual(["A meeting with no title"])

    // IDEMPOTENT. Google's `updated` has not moved, so the second sweep must
    // touch nothing at all — no second row, no second activity line, no ping.
    const again = await call(IDS.staffUser, "POST /api/content/meetings/sync-calendar", {})
    expect((await again.json()) as { created: number; updated: number }).toMatchObject({ created: 0, updated: 0 })
    expect(meetingTitles()).toHaveLength(1)
  })

  // ── THE WALK THAT MAKES "EVERYTHING" TRUE ──────────────────────────────────
  //
  // The live window is a fortnight back and four weeks on. "Anything in my
  // calendar should be up to date here" reaches further than that, so a cursor
  // on the connection walks the wider window — five years back, a year on — one
  // ninety-day slice per call. Bounded per call (R14), complete by repetition.
  it("a meeting from years ago is reached by walking, one slice per call", async () => {
    const longAgo = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000)
    googleCalendar.events = [entry({ id: "OLD", summary: "The first kickoff", start: longAgo.toISOString(),
      end: new Date(longAgo.getTime() + 3_600_000).toISOString() })]

    // The first call starts at the FLOOR, five years back, so it cannot possibly
    // have reached a meeting from last year yet. That is the honest half of a
    // resumable walk and the half a fake cursor would skip.
    const first = (await (
      await call(IDS.staffUser, "POST /api/content/meetings/sync-calendar", {})
    ).json()) as { created: number; swept: string; caughtUp: boolean }
    expect(first.created).toBe(0)
    expect(first.caughtUp, "five years is not one slice").toBe(false)
    expect(meetingTitles()).toHaveLength(0)

    // Keep calling. Each one advances the cursor by a slice, and the meeting
    // arrives when the walk reaches the quarter it is in.
    let swept = first.swept
    for (let i = 0; i < 30 && !meetingTitles().length; i++) {
      const r = (await (
        await call(IDS.staffUser, "POST /api/content/meetings/sync-calendar", {})
      ).json()) as { swept: string }
      expect(Date.parse(r.swept), "the cursor only ever moves forward").toBeGreaterThan(Date.parse(swept))
      swept = r.swept
    }
    expect(meetingTitles()).toEqual(["The first kickoff"])
  })

  it("the cursor is kept on the caller's own calendar connection, so it survives the request", async () => {
    await call(IDS.staffUser, "POST /api/content/meetings/sync-calendar", {})
    const row = db()
      .prepare("SELECT calendar_swept_through FROM google_connections WHERE id = 'C_CAL'")
      .get() as { calendar_swept_through: string | null }
    expect(row.calendar_swept_through, "a walk that forgets where it got to is not resumable").toBeTruthy()
  })
})

// ── READING A TRANSCRIPT TWICE MUST NOT DOUBLE ANYBODY'S HOURS ───────────────
//
// The capture writes a work log per one of OUR OWN people in the room, and those
// hours reach a margin. So running it twice is the failure that would show up as
// money.
//
// THE PREDICATE IS `transcript_captured_at IS NULL`, riding the UPDATE that
// claims the row — a fact about the JOB rather than about the meeting. It was
// already that before the `held` status was retired, which is exactly why
// retiring the status could not weaken it; this suite proves that rather than
// reasoning about it.
describe("the transcript import is idempotent", () => {
  beforeEach(() => {
    connectCalendar()
    transcript.found = {
      fileId: "DOC_1",
      name: "Quarterly review — transcript",
      url: "https://docs.example/DOC_1",
      foundBy: "attachment",
      text: "We agreed to move the driver app forward.",
    }
  })

  const logCount = () =>
    (db().prepare("SELECT COUNT(*) n FROM work_logs WHERE target_table = 'meetings'").get() as { n: number }).n

  it("a second import writes no second work log, and says why", async () => {
    // A past entry with one of OUR OWN people on it — the intersection with the
    // team's membership is what decides whose hour is a cost.
    const ranAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    googleCalendar.events = [
      entry({
        id: "PAST_1",
        summary: "Quarterly review",
        start: ranAt.toISOString(),
        end: new Date(ranAt.getTime() + 3_600_000).toISOString(),
        attendees: [{ email: "staff@kwapso.app", name: "Staff", response: "accepted", organizer: true, optional: false }],
      }),
    ]
    await call(IDS.staffUser, "POST /api/content/meetings/sync-calendar", {})
    const id = (db().prepare("SELECT id FROM meetings LIMIT 1").get() as { id: string }).id

    const first = (await (
      await call(IDS.staffUser, "POST /api/content/meetings/transcript", { id })
    ).json()) as { captured: boolean; logsWritten: number; note: string | null }
    expect(first.captured).toBe(true)
    const written = logCount()
    expect(written, "the real import writes the hours").toBe(first.logsWritten)

    const second = (await (
      await call(IDS.staffUser, "POST /api/content/meetings/transcript", { id })
    ).json()) as { captured: boolean; logsWritten: number; note: string | null }
    expect(second.captured, "the claim moved zero rows, so nothing happened").toBe(false)
    expect(second.logsWritten).toBe(0)
    expect(second.note).toContain("already been read")
    expect(logCount(), "and nobody's week grew a second time").toBe(written)
  })
})

// THE OTHER HALF OF MIGRATION 0039. That migration converted the rows already
// stored; this is what keeps the next sweep from writing the same mixture back.
//
// `starts_at` is TEXT and the meetings list is ordered and PAGED by it, so the column is
// only chronological while every writer spells a moment the same way. The app's
// own forms always did — `requireMoment` returns `new Date(ms).toISOString()` —
// and the calendar sweep, the other door into the same column, stored whatever
// Google sent: an hour in the EVENT's offset, `2026-08-18T12:00:00+05:30`, which
// sorts as noon when it happens at 06:30Z.
describe("a moment from Google is stored in UTC, like every other moment", () => {
  it("converts an offset to UTC, byte for byte as the forms write it", async () => {
    const { utcMoment } = await import("../src/lib/meetings")
    expect(utcMoment("2026-08-18T12:00:00+05:30")).toBe(
      new Date("2026-08-18T12:00:00+05:30").toISOString()
    )
    expect(utcMoment("2026-08-18T09:00:00-08:00")).toBe(
      new Date("2026-08-18T09:00:00-08:00").toISOString()
    )
  })

  it("leaves a moment that is already UTC exactly as it is", async () => {
    const { utcMoment } = await import("../src/lib/meetings")
    expect(utcMoment("2026-08-18T09:00:00.000Z")).toBe("2026-08-18T09:00:00.000Z")
  })

  it("leaves an ALL-DAY entry as a day — midnight UTC would invent a time", async () => {
    const { utcMoment } = await import("../src/lib/meetings")
    // Google's `date` with no `dateTime`. It also needs no help: a date with no
    // `T` already sorts before every timed entry on its own day.
    expect(utcMoment("2026-08-18")).toBe("2026-08-18")
    expect(utcMoment(null)).toBeNull()
  })

  it("keeps a value it cannot read rather than losing the start time", async () => {
    const { utcMoment } = await import("../src/lib/meetings")
    // A null start would delete the meeting from every view keyed on it. A
    // strange value somebody can see beats a row that quietly disappears.
    expect(utcMoment("banana+05:30")).toBe("banana+05:30")
  })

  it("the sweep writes through it — both when it creates and when it mirrors", async () => {
    const src = readFileSync(join(__dirname, "..", "src", "lib", "meetings.ts"), "utf8")
    // Every `event.start` / `event.end` that reaches a statement goes through the
    // converter. Read off the source because the fault was a raw value in a
    // template literal, which is invisible to anything but a look at the write.
    for (const raw of ["sqlString(event.start)", "sqlString(event.end || null)"])
      expect(
        src.includes(raw),
        `the calendar sweep writes ${raw} straight into SQL — wrap it in utcMoment(), or the meetings list sorts strings instead of times`
      ).toBe(false)
    expect(src).toContain("sqlString(utcMoment(event.start))")
    expect(src).toContain("sqlString(utcMoment(event.end || null))")
  })
})
