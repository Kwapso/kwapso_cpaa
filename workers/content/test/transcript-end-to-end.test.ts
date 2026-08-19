// THE TRANSCRIPT, FROM GOOGLE TO A WORK LOG TO AN ANSWER — the write path
// nothing had ever run.
//
// ══════════════════════════════════════════════════════════════════════════════
// WHY THIS SUITE EXISTS
//
// CHECKLIST 9.2, 18.3 and 18.4 shipped as PART DONE, all three for one reason
// said three ways: none of the owner's seventeen repeating meetings is a
// recorded call, so no transcript existed to bring in, and the lane that built
// the three hunts could not reach the app's own Google connection. What was
// proved was the REFUSAL — "no transcript for this meeting yet" — and the
// arithmetic of a second press. What was never once executed, on any machine,
// was the sentence those three rows are actually about:
//
//     a transcript is found → its words land on the meeting → everybody of OURS
//     who was in the room gets a work log → and the conversation becomes
//     something the knowledge base can answer from, with a citation back to it.
//
// A green build over an unrun write path is the shape this repo has been bitten
// by before (the agent-confirm gap, and route 2's empty transcript). So the
// proof is a FIXTURE rather than a live call, which is the honest substitute:
// the recorded call we do not have is the only thing standing in for it, and
// everything downstream of the file — the hunt, the claim, the work logs, the
// sweep, the answer — is the shipped code running for real against a real
// SQLite database on the real team migrations.
//
// ── WHAT IS FAKED, AND WHAT DELIBERATELY IS NOT
//
// FAKED: Google. `google-api` is the whole of the outside world here — one
// calendar, one Drive, one mailbox, held in `world` below — and `d1-rest` points
// at the in-memory database, exactly as every other suite in this folder does.
//
// NOT FAKED, and this is the difference from `meetings.test.ts`: the HUNT.
// That suite mocks `findTranscript` wholesale, so it proves what `captureTranscript`
// does when something is handed to it and says nothing about whether any route
// can hand it one. Here the real `lib/google-transcript.ts` runs, so each of the
// three routes reaches the write path under its own power — which is precisely
// what 18.3 ("all three routes built… nothing was ingested end to end") is
// missing.
//
// ── THE THREE ROUTES ARE A TABLE, ON PURPOSE
//
// Each is set up so that ONLY that route can succeed: the attachment case has an
// empty Drive and an empty mailbox, the Drive case has no attachment, the mail
// case has neither. A route that quietly stopped working would otherwise be
// covered for by the one before it, which is exactly how route 2 shipped
// returning a document with no words in it.
// ══════════════════════════════════════════════════════════════════════════════

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DatabaseSync } from "node:sqlite"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

/** THE OUTSIDE WORLD, per test. One calendar, one Drive, one mailbox — set by
 * each case so that exactly one of the three routes can find anything. */
const world = vi.hoisted(() => ({
  events: [] as Record<string, unknown>[],
  /** file id → the file Drive would hand back for it. */
  files: new Map<string, Record<string, unknown>>(),
  /** what a folder listing returns, whatever the search term. */
  folderHits: [] as Record<string, unknown>[],
  /** file id → its words. Absent = Google gave us nothing readable. */
  text: new Map<string, string>(),
  /** what a Gmail search returns, and the body every one of them has. */
  notices: [] as { id: string }[],
  noticeBody: "",
}))

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
    // The window is honoured, as meetings.test.ts honours it: the sweep reads
    // four ranges, and a fixture that answered them all with the same entry
    // would hand one event to the loop four times.
    calendarList: async (_t: string, range: { from?: string; to?: string }) => ({
      events: world.events.filter((e) => {
        const at = Date.parse(e.start as string)
        return (!range.from || at >= Date.parse(range.from)) && (!range.to || at < Date.parse(range.to))
      }),
      truncated: false,
    }),
    calendarGet: async (_t: string, eventId: string) =>
      world.events.find((e) => e.id === eventId) ?? { id: eventId, attendees: [], attachments: [] },
    driveList: async () => world.folderHits,
    driveFilesById: async (_t: string, ids: string[]) =>
      ids.map((id) => world.files.get(id)).filter(Boolean),
    driveFileText: async (_t: string, id: string) => world.text.get(id) ?? "",
    gmailSearch: async () => world.notices,
    gmailMessage: async () => ({ text: world.noticeBody, snippet: "" }),
    // `documentIdInText` and `googleNoticeQuery` are NOT stubbed: the first is
    // the parse that reads a document id out of a robot's mail, which is the
    // whole of route 3's cleverness, and the second is the fence route 3 is
    // narrowed by. Faking either would be faking the thing under test.
  }
})

import worker from "../src/index"
import { fakeVectorize } from "./fake-vectorize"
import { buildSpineDb, IDS, makeEnv } from "../../tenancy/test/spine-harness"
import { tokenise } from "../src/lib/knowledge-text"
import { MEETING_LOG_KIND } from "../src/lib/work-logs"
import type { KnowledgeAnswer, Meeting } from "@shared/types"

const db = () => holder.db as DatabaseSync
let vectorIndex = fakeVectorize()

/** The same deterministic stand-in the knowledge suites use: 256 slots, one
 * token per slot, so two texts sharing words really do point the same way. */
function fakeVector(text: string): number[] {
  const v = Array.from({ length: 256 }, () => 0)
  for (const [term, weight] of tokenise(text)) {
    let h = 0
    for (let i = 0; i < term.length; i++) h = (h * 31 + term.charCodeAt(i)) >>> 0
    v[h % 256] += weight
  }
  return v
}

function env(userId: string) {
  const base = makeEnv(() => db(), userId) as unknown as Record<string, unknown>
  return {
    ...base,
    INTERNAL_KEY: "k",
    GOOGLE_CONNECT_CLIENT_ID: "id",
    GOOGLE_CONNECT_CLIENT_SECRET: "secret",
    GOOGLE_TOKEN_KEY: "key",
    KNOWLEDGE_INDEX: vectorIndex.binding,
    // The floor belongs to the model, and this one is a stand-in whose cosine is
    // on a different scale from bge-m3's — the same setting the other knowledge
    // suites make, for the same reason.
    KNOWLEDGE_MIN_SCORE: "0.2",
    AI: {
      run: async (_model: string, input: { text: string[] }) => ({ data: input.text.map(fakeVector) }),
    },
    REALTIME: {
      fetch: async (_url: string, init?: { body?: string }) => {
        const body = JSON.parse(init?.body ?? "{}") as { event?: Record<string, string> }
        if (body.event) published.push(body.event)
        return new Response("{}")
      },
    },
  } as never
}

/** Every live ping the worker published, captured instead of broadcast. */
let published: { resource?: string; id?: string; op?: string }[] = []

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

/* ------------------------------- the fixture ------------------------------- */

/** THE CALL ITSELF — three days ago, an hour long, with two people in the room:
 * one of OURS and one of the CLIENT's. That pairing is the whole of 9.2's
 * narrowing ("our own staff only"), and it is why the fixture cannot be one
 * person: a rule that only ever sees staff passes with the intersection deleted.
 *
 * `staff@kwapso.app` is a member of the team (spine-harness). `nadia@bergman.example`
 * is a real client — an account row with that address and deliberately NO
 * `team_members` row — so she is a stakeholder on the meeting and never a cost. */
const RAN_AT = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
const RAN_UNTIL = new Date(RAN_AT.getTime() + 3_600_000)
const OURS = "staff@kwapso.app"
const THEIRS = "nadia@bergman.example"

/** WHAT WAS SAID. One sentence nothing else in the fixture says, so an answer
 * built from it can only have come from the transcript. */
const WHAT_WAS_SAID =
  "Marta confirmed the dispatch desk will stop using the shared spreadsheet on the first Monday of April, " +
  "and asked us to keep the old supplier codes visible for one more quarter."

const TRANSCRIPT_NAME = "Quarterly review - Transcript"

const guest = (email: string, organizer = false) => ({
  email,
  name: email.split("@")[0],
  response: "accepted",
  organizer,
  optional: false,
  resource: false,
})

/** The diary entry the meeting is made from. `attachments` is the one thing the
 * three cases differ on. */
const pastEntry = (attachments: Record<string, unknown>[] = []) => ({
  id: "EV_QR",
  summary: "Quarterly review",
  description: "",
  start: RAN_AT.toISOString(),
  end: RAN_UNTIL.toISOString(),
  timeZone: "Europe/Madrid",
  allDay: false,
  url: "https://calendar.example/EV_QR",
  joinUrl: "https://meet.example/abc-defg-hij",
  organizer: { email: OURS, name: "Staff" },
  location: "",
  status: "confirmed",
  meetingCode: "abc-defg-hij",
  recurringEventId: "",
  recurrence: [],
  updatedAt: "2026-08-18T08:00:00.000Z",
  attendees: [guest(OURS, true), guest(THEIRS)],
  attachments,
})

/** A Drive file as `driveFilesById` / `driveList` hand one back. Only the fields
 * the hunt reads — a fixture carrying the other fourteen would be a fixture
 * about `DriveFile` rather than about the hunt. */
const driveFile = (id: string, name = TRANSCRIPT_NAME, targetId: string | null = null) => ({
  id,
  name,
  mimeType: "application/vnd.google-apps.document",
  modifiedTime: RAN_UNTIL.toISOString(),
  webViewLink: `https://docs.example/${id}`,
  targetId,
})

const connect = (service: string) =>
  db().exec(
    `INSERT INTO google_connections (id, user_id, service, google_email, scopes, access_token,
       access_expires_at, refresh_token, created_at, creator_id)
     VALUES ('C_${service}', '${IDS.staffUser}', '${service}', 'me@kwapso.app', 'scope', 'plain',
       '${new Date(Date.now() + 3_600_000).toISOString()}', 'plain-refresh', '2026-01-01', '${IDS.staffUser}');`
  )

/** A folder this person NAMED — route 2 searches nothing else, which is why the
 * fixture has to say it out loud rather than let the route roam. */
const nameAFolder = () =>
  db().exec(
    `INSERT INTO google_sources (id, connection_id, user_id, service, external_id, name, shelf, kind,
       created_at, creator_id)
     VALUES ('GS_1', 'C_drive', '${IDS.staffUser}', 'drive', 'FOLDER_MEET', 'Meet Recordings', 'team',
       'folder', '2026-01-01', '${IDS.staffUser}');`
  )

/** Bring the diary in, and hand back the meeting the sweep made. */
async function sweepTheDiary(): Promise<string> {
  const res = await call(IDS.staffUser, "POST /api/content/meetings/sync-calendar", {})
  expect(res.status, "the calendar sweep").toBe(200)
  const row = db().prepare("SELECT id FROM meetings WHERE google_event_id = 'EV_QR'").get() as
    | { id: string }
    | undefined
  expect(row, "the past entry should have become a meeting").toBeTruthy()
  return (row as { id: string }).id
}

type CaptureReply = {
  captured: boolean
  fileId: string | null
  fileName: string | null
  logsWritten: number
  note: string | null
  meeting: Meeting
}

const readTranscript = async (id: string): Promise<CaptureReply> => {
  const res = await call(IDS.staffUser, "POST /api/content/meetings/transcript", { id })
  expect(res.status, "the transcript door").toBe(200)
  return (await res.json()) as CaptureReply
}

/** WHAT THE SCREEN WOULD SHOW — the words, read back through the door the
 * meeting's own detail reads them through. Deliberately not a SELECT: the
 * transcript is the one column deliberately kept off the meeting row's own
 * shape (it is up to a megabyte), so "did the words land" and "can anybody
 * reach them" are the same question and this is where it is asked. */
async function transcriptOnScreen(id: string): Promise<{
  text: string | null
  note: string | null
  url: string | null
  foundBy: string | null
  capturedAt: string | null
}> {
  const res = await call(IDS.staffUser, "GET /api/content/meetings/transcript", undefined, `?id=${id}`)
  expect(res.status, "the transcript read door").toBe(200)
  return (await res.json()) as {
    text: string | null
    note: string | null
    url: string | null
    foundBy: string | null
    capturedAt: string | null
  }
}

const meetingLogs = () =>
  db()
    .prepare(
      `SELECT user_id, user_name, kind, seconds, billable, account_id, note, started_at, ended_at
         FROM work_logs WHERE target_table = 'meetings' ORDER BY user_name`
    )
    .all() as {
    user_id: string
    user_name: string
    kind: string
    seconds: number
    billable: number
    account_id: string | null
    note: string
    started_at: string
    ended_at: string
  }[]

beforeEach(() => {
  published = []
  vectorIndex = fakeVectorize()
  world.events = []
  world.files = new Map()
  world.folderHits = []
  world.text = new Map()
  world.notices = []
  world.noticeBody = ""
  holder.db = buildSpineDb()
  // Every right this lane needs, so a refusal below is the DOOR's and never the
  // role's. Asserted rather than assumed, exactly as meetings.test.ts does it.
  for (const module of ["meetings", "google", "work", "knowledge"])
    db().exec(
      `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
       VALUES ('${IDS.adminRole}_${module}', '${IDS.adminRole}', '${module}', 1, 1, 1, 1)
       ON CONFLICT (role_id, module) DO UPDATE SET
         can_read = 1, can_create = 1, can_edit = 1, can_delete = 1;`
    )
  const granted = db()
    .prepare(
      `SELECT COUNT(*) n FROM role_permissions WHERE role_id = ? AND module IN ('meetings','google')
        AND can_read = 1 AND can_edit = 1`
    )
    .get(IDS.adminRole) as { n: number }
  expect(granted.n, "the transcript door needs meetings:edit AND google:read").toBe(2)
  for (const service of ["calendar", "drive", "gmail"]) connect(service)
  world.events = [pastEntry()]
})

/* ───────────────────── 18.3 · all three routes, for real ───────────────────── */
//
// Each case leaves the other two routes with NOTHING to find, so a pass is that
// route working rather than the chain covering for it.

describe("18.3 · every route reaches the write path under its own power", () => {
  it("route 1 — the file Google put on the calendar entry itself", async () => {
    world.events = [pastEntry([{ fileId: "ATT_DOC", title: TRANSCRIPT_NAME, mimeType: "", iconUrl: null, url: null }])]
    world.files.set("ATT_DOC", driveFile("ATT_DOC"))
    world.text.set("ATT_DOC", WHAT_WAS_SAID)

    const id = await sweepTheDiary()
    const out = await readTranscript(id)

    expect(out.captured).toBe(true)
    expect(out.fileId).toBe("ATT_DOC")
    expect(out.meeting.transcriptFoundBy).toBe("attachment")
    expect((await transcriptOnScreen(id)).text).toContain("first Monday of April")
  })

  it("route 2 — a document in a folder somebody shared, resolved through its shortcut", async () => {
    // No attachment on the entry and no mail: the folder is the only way in. And
    // what the folder holds is a SHORTCUT, which is the exact shape that filed a
    // transcript of zero characters against a real account on 2026-08-18.
    nameAFolder()
    world.folderHits = [driveFile("SHORTCUT_1", TRANSCRIPT_NAME, "REAL_DOC")]
    world.text.set("REAL_DOC", WHAT_WAS_SAID)

    const id = await sweepTheDiary()
    const out = await readTranscript(id)

    expect(out.captured).toBe(true)
    expect(out.meeting.transcriptFoundBy).toBe("drive")
    // The DOCUMENT's id, never the pointer's — or anything re-reading this row
    // later gets the same nothing.
    expect(out.fileId).toBe("REAL_DOC")
    expect((await transcriptOnScreen(id)).text).toContain("supplier codes")
  })

  it("route 3 — the document id inside Google's own notice in the mail", async () => {
    // Nothing on the entry, no folder named. The only trace of this call is a
    // robot's message with a link in its body, parsed by the shipped regex.
    world.notices = [{ id: "N1" }]
    world.noticeBody =
      "Gemini took notes for Quarterly review.\n" +
      "https://docs.google.com/document/d/QUARTERLYREVIEWDOC1/edit?usp=sharing"
    world.files.set("QUARTERLYREVIEWDOC1", driveFile("QUARTERLYREVIEWDOC1"))
    world.text.set("QUARTERLYREVIEWDOC1", WHAT_WAS_SAID)

    const out = await readTranscript(await sweepTheDiary())

    expect(out.captured).toBe(true)
    expect(out.meeting.transcriptFoundBy).toBe("mail")
    expect(out.fileId).toBe("QUARTERLYREVIEWDOC1")
  })

  it("and a call with no transcript anywhere is left UNCLAIMED, so the next sweep tries again", async () => {
    // The honest empty answer — the half that WAS proved before this suite, kept
    // here because it is the other side of the same decision and because a
    // meeting wrongly stamped "read" is a search that ends for ever.
    const id = await sweepTheDiary()
    const out = await readTranscript(id)

    expect(out.captured).toBe(false)
    expect(out.note).toContain("No transcript for this meeting yet")
    expect(meetingLogs(), "nobody's week moved").toEqual([])
    const row = db()
      .prepare("SELECT transcript_captured_at FROM meetings WHERE id = ?")
      .get(id) as { transcript_captured_at: string | null }
    expect(row.transcript_captured_at, "an unread meeting must stay unclaimed").toBeNull()
  })
})

/* ─────────────── 9.2 · a work log per participant, ours only ──────────────── */

describe("9.2 · the transcript writes the room's time, and only ours", () => {
  beforeEach(() => {
    world.events = [pastEntry([{ fileId: "ATT_DOC", title: TRANSCRIPT_NAME, mimeType: "", iconUrl: null, url: null }])]
    world.files.set("ATT_DOC", driveFile("ATT_DOC"))
    world.text.set("ATT_DOC", WHAT_WAS_SAID)
  })

  it("writes ONE log, for the member in the room — the client in it is not a cost", async () => {
    const id = await sweepTheDiary()
    // THE TRIPWIRE FIRST. "No client on the timesheet" is a sentence that passes
    // loudly over a room with no client in it, which is how a narrowing check
    // goes blind without anything turning red. So the guest list is asserted
    // before the rule that reads it.
    const guests = JSON.parse(
      (db().prepare("SELECT google_attendees_json j FROM meetings WHERE id = ?").get(id) as { j: string }).j
    ) as { email: string }[]
    expect(guests.map((g) => g.email).sort(), "two people were in the room").toEqual([OURS, THEIRS].sort())

    const out = await readTranscript(id)

    expect(out.captured).toBe(true)
    expect(out.logsWritten, "two people in the room, one of them ours").toBe(1)
    const logs = meetingLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].user_id).toBe(IDS.staffUser)
    // …and she IS a person this app knows — she simply is not ours. A client who
    // was invisible to the database would satisfy the rule for the wrong reason.
    const known = db()
      .prepare("SELECT COUNT(*) n FROM accounts WHERE LOWER(email) = ?")
      .get(THEIRS) as { n: number }
    expect(known.n, "the client in the room is a real account row").toBe(1)
    // The client was on the entry and is not on the timesheet. This is the
    // assertion the whole intersection exists for.
    const names = logs.map((l) => l.user_name.toLowerCase()).join(" ")
    expect(names).not.toContain("nadia")
  })

  it("marks it as meeting time, for the meeting's own hour (9.3)", async () => {
    await readTranscript(await sweepTheDiary())

    const [log] = meetingLogs()
    // 9.3: the kind is what lets any figure be shown with meeting time, without
    // it, or only it — so a log written by a transcript that was not marked
    // would be indistinguishable from delivery work.
    expect(log.kind).toBe(MEETING_LOG_KIND)
    expect(log.billable).toBe(1)
    // The DIARY's hour, not an invented one: inventing a finer figure out of a
    // transcript's timestamps would be inventing a fact.
    expect(log.seconds).toBe(3600)
    expect(log.started_at).toBe(RAN_AT.toISOString())
    expect(log.ended_at).toBe(RAN_UNTIL.toISOString())
    expect(log.note).toContain("Quarterly review")
  })

  it("R1 — the meeting and the week both ping, and only when something changed", async () => {
    const id = await sweepTheDiary()
    published = []
    await readTranscript(id)
    expect(published.map((p) => p.resource)).toEqual(
      expect.arrayContaining(["meetings", "work_logs"])
    )

    // …and the second press moves nothing, so it says nothing.
    published = []
    const again = await readTranscript(id)
    expect(again.captured).toBe(false)
    expect(again.logsWritten).toBe(0)
    expect(meetingLogs(), "nobody's week grew a second time").toHaveLength(1)
    expect(published, "a repeat is silent (R17)").toEqual([])
  })
})

/* ────────── 18.4 · the conversation becomes something answerable ─────────── */

describe("18.4 · what was said is answerable, with a citation back to the call", () => {
  /** Run the sweep until every kind says it has caught up — the same loop the
   * backfill script runs against the same door. */
  async function sweepKnowledge(max = 40): Promise<void> {
    for (let tick = 1; tick <= max; tick++) {
      const res = await call(IDS.staffUser, "POST /api/content/knowledge/sync")
      expect(res.status).toBe(200)
      if (((await res.json()) as { caughtUp: boolean }).caughtUp) return
    }
    throw new Error(`the knowledge sweep never caught up in ${max} ticks`)
  }

  async function ask(question: string): Promise<KnowledgeAnswer> {
    const res = await call(
      IDS.staffUser,
      "GET /api/content/knowledge/ask",
      undefined,
      `?q=${encodeURIComponent(question)}&limit=12`
    )
    expect(res.status).toBe(200)
    return (await res.json()) as KnowledgeAnswer
  }

  beforeEach(async () => {
    // THE MOST INDIRECT ROUTE ON PURPOSE. If the mail route's words reach the
    // knowledge base, the other two — which hand back the same `text` on the
    // same object — cannot fail to. And it is the one 18.4 names in its own
    // sentence ("emails announcing a Doc was made for a meeting").
    world.notices = [{ id: "N1" }]
    world.noticeBody =
      "Gemini took notes for Quarterly review.\n" +
      "https://docs.google.com/document/d/QUARTERLYREVIEWDOC1/edit?usp=sharing"
    world.files.set("QUARTERLYREVIEWDOC1", driveFile("QUARTERLYREVIEWDOC1"))
    world.text.set("QUARTERLYREVIEWDOC1", WHAT_WAS_SAID)
    const out = await readTranscript(await sweepTheDiary())
    expect(out.captured, "the fixture must actually capture before we sweep").toBe(true)
    await sweepKnowledge()
  })

  it("the meeting's source carries the transcript, labelled as what was SAID", () => {
    const row = db()
      .prepare(
        "SELECT body, title FROM knowledge_sources WHERE origin_table = 'meetings' AND kind = 'meeting'"
      )
      .get() as { body: string; title: string } | undefined
    expect(row, "the captured meeting should have been indexed").toBeTruthy()
    // The LABEL matters as much as the words: an answer built out of a
    // transcript reads very differently from one built out of somebody's
    // written-up notes, and a reader has to be able to tell which they got.
    expect((row as { body: string }).body).toContain("What was said in the meeting:")
    expect((row as { body: string }).body).toContain("supplier codes")
  })

  it("…and without the transcript that same question has no answer", async () => {
    // THE TRIPWIRE. The check below is only worth anything if the words are the
    // reason it passes. So the same question is asked of a knowledge base built
    // from the SAME meeting with the transcript never captured: the title, the
    // date and the guest list are all still indexed, and none of them says when
    // the spreadsheet is retired.
    holder.db = buildSpineDb()
    vectorIndex = fakeVectorize()
    for (const module of ["meetings", "google", "work", "knowledge"])
      db().exec(
        `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
         VALUES ('${IDS.adminRole}_${module}', '${IDS.adminRole}', '${module}', 1, 1, 1, 1)
         ON CONFLICT (role_id, module) DO UPDATE SET
           can_read = 1, can_create = 1, can_edit = 1, can_delete = 1;`
      )
    for (const service of ["calendar", "drive", "gmail"]) connect(service)
    world.notices = []
    world.files = new Map()
    world.text = new Map()
    await sweepTheDiary()
    await sweepKnowledge()

    const answer = await ask("When does the dispatch desk stop using the shared spreadsheet?")
    expect(
      answer.passages.some((p) => p.text.includes("first Monday of April")),
      "nothing but the transcript says this — the check below is real"
    ).toBe(false)
  })

  it("answers a question ONLY the transcript can answer, and cites the meeting", async () => {
    // Nothing else in the fixture mentions supplier codes or the spreadsheet
    // being retired, so an answer carrying them came out of the conversation.
    const answer = await ask("When does the dispatch desk stop using the shared spreadsheet?")

    expect(answer.found, "the transcript should be answerable").toBe(true)
    // R23: no citation means no passage, and no answer. The pair is one decision
    // in one seam, so asserting both is asserting the seam held.
    expect(answer.citations.length).toBeGreaterThan(0)
    expect(answer.passages.length).toBeGreaterThan(0)
    const fromTheCall = answer.passages.filter((p) => p.kind === "meeting")
    expect(fromTheCall.length, "the meeting should be among the passages").toBeGreaterThan(0)
    expect(fromTheCall.map((p) => p.text).join(" ")).toContain("first Monday of April")
    // …and the reader can go and check it. A citation that names no record is a
    // quote somebody has to take on trust.
    const cited = answer.citations.find((c) => c.kind === "meeting")
    expect(cited, "the meeting must be cited, not merely quoted").toBeTruthy()
    expect(cited?.recordPath, "the citation must lead back to the meeting itself").toContain("meetings/")
  })

  it("and the words came out of the TEAM's own database, never back out of the index (R26)", async () => {
    await ask("When does the dispatch desk stop using the shared spreadsheet?")
    // The transcript is the most sensitive prose this app stores, so the shape
    // of the search matters as much as its answer: the index is asked for ids
    // and scores, and every passage is read back under the caller's own fence.
    const asked = vectorIndex.queries()
    // A search that never happened satisfies every assertion below.
    expect(asked.length, "the index was never searched — this check is reading nothing").toBeGreaterThan(0)
    for (const query of asked) {
      expect(query.returnValues, "the index must never hand back readable values").toBeFalsy()
      expect(query.returnMetadata, "…nor metadata").toBe("none")
      expect(query.namespace, "every search is namespaced to the team (R26)").toBe(IDS.team)
    }
  })
})
