// A TRANSCRIPT IS ITS WORDS, OR IT IS NOT A TRANSCRIPT.
//
// ══════════════════════════════════════════════════════════════════════════════
// WHAT WENT WRONG, MEASURED RATHER THAN GUESSED
//
// On 2026-08-18, against a real account, the same Meet conversation read 13,128
// characters through route 1 (the calendar entry's own attachment) and 0 through
// route 2 (a folder somebody had shared). Route 2 still answered `found`, with a
// plausible name and a link that opened the right document in a browser.
//
// The folder held a SHORTCUT. Drive returns one from a listing exactly as it
// returns a file — same name, its own id, no content — and its mime type starts
// `application/vnd.google-apps`, which is the same prefix a Google Doc carries.
// So the reader sent it to `export`, Google refused (there is nothing to export
// from a pointer), and the refusal became the honest "" that an image or a zip
// gets. Every layer behaved exactly as designed and the result was a lie.
//
// AND THE LIE WAS DURABLE, which is the part that matters more than the shortcut.
// `captureTranscript` filed whatever came back and set `transcript_captured_at`
// — the column that means "do not look again". One unreadable file therefore
// ended the search for that conversation permanently, ticked the meeting held,
// and wrote a work log for everybody in the room.
//
// SO TWO THINGS ARE LOCKED HERE, and only the first is about shortcuts:
//   • a shortcut resolves to what it points at, and the id kept is the
//     DOCUMENT's, so anything re-reading the row later gets words too;
//   • a route that cannot READ its candidate has not found a transcript, and
//     falls through to the next route — which, on the day this was found, held
//     the same conversation and could read it.
// ══════════════════════════════════════════════════════════════════════════════

import { beforeEach, describe, expect, it, vi } from "vitest"

/** What each mocked Google call will answer. Set per test, so every case reads
 * as "this is the world, this is what the hunt should conclude". */
const world = {
  attachments: [] as { fileId: string; title: string; url: string | null }[],
  folders: [] as { id: string; active: boolean; kind: string; externalId: string }[],
  driveHits: [] as { id: string; name: string; webViewLink: string | null; targetId: string | null }[],
  byId: new Map<string, { id: string; name: string; webViewLink: string | null; targetId: string | null }>(),
  /** file id → its words. Absent means Google gave us nothing readable. */
  text: new Map<string, string>(),
  notices: [] as { id: string }[],
  noticeBody: "",
}

vi.mock("../src/lib/google", () => ({
  accessTokenFor: async () => ({ token: "tok" }),
  listNamedSources: async () => world.folders,
}))

vi.mock("../src/lib/google-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/google-api")>()
  return {
    ...actual,
    driveList: async () => world.driveHits,
    driveFilesById: async (_t: string, ids: string[]) =>
      ids.map((id) => world.byId.get(id)).filter(Boolean),
    driveFileText: async (_e: unknown, _t: string, id: string) => world.text.get(id) ?? "",
    gmailSearch: async () => world.notices,
    gmailMessage: async () => ({ text: world.noticeBody, snippet: "" }),
  }
})

import { findTranscript, notesCouldBelongTo } from "../src/lib/google-transcript"

const file = (
  id: string,
  name: string,
  targetId: string | null = null,
  modifiedTime: string | null = null
) => ({
  id,
  name,
  webViewLink: `https://drive.example/${id}`,
  targetId,
  modifiedTime,
})

/** A calendar entry, with only the fields the hunt reads. */
const meeting = (attachments = world.attachments, start = "") =>
  ({ id: "EV1", summary: "Weekly sync", meetingCode: "abc-defg-hij", attachments, start }) as never

const hunt = (start = "") =>
  findTranscript({} as never, {} as never, {} as never, meeting(world.attachments, start))

beforeEach(() => {
  world.attachments = []
  world.folders = []
  world.driveHits = []
  world.byId = new Map()
  world.text = new Map()
  world.notices = []
  world.noticeBody = ""
})

describe("route 2 — the shortcut that read as an empty transcript", () => {
  beforeEach(() => {
    world.folders = [{ id: "S1", active: true, kind: "folder", externalId: "FOLDER" }]
  })

  it("resolves a shortcut to the document and keeps the DOCUMENT's id", async () => {
    // The exact shape off the real account: the folder holds a pointer whose
    // name is the document's.
    world.driveHits = [file("SHORTCUT", "Weekly sync - Transcript", "REAL_DOC")]
    world.text.set("REAL_DOC", "what was actually said")
    // The pointer itself has nothing, which is what made this invisible.
    world.text.set("SHORTCUT", "")

    const found = await hunt()

    expect(found?.foundBy).toBe("drive")
    expect(found?.text).toBe("what was actually said")
    // The regression: this used to be "SHORTCUT", so the row named a file with
    // no words in it for ever.
    expect(found?.fileId).toBe("REAL_DOC")
  })

  it("a candidate with NO words is not a find — and route 3 still gets its turn", async () => {
    // Route 2 matches something unreadable...
    world.driveHits = [file("EMPTY", "Weekly sync - Transcript")]
    // ...and Google's own notice names the real document, which reads fine. This
    // is what should have happened on 2026-08-18 and could not, because route 2
    // returned a hit and the chain stopped there.
    world.notices = [{ id: "N1" }]
    world.noticeBody = "https://docs.google.com/document/d/REALDOCUMENTID12345/edit?usp=sharing"
    world.byId.set("REALDOCUMENTID12345", file("REALDOCUMENTID12345", "Weekly sync - Transcript"))
    world.text.set("REALDOCUMENTID12345", "the conversation")

    const found = await hunt()

    expect(found?.foundBy).toBe("mail")
    expect(found?.text).toBe("the conversation")
  })

  it("when NOTHING readable exists anywhere, the answer is null rather than an empty transcript", async () => {
    world.driveHits = [file("EMPTY", "Weekly sync - Transcript")]
    // The old code returned {fileId:"EMPTY", …} here and the caller filed it,
    // stamped the meeting as covered, and stopped looking for ever.
    expect(await hunt()).toBeNull()
  })
})

describe("route 1 — the strongest proof still has to be readable", () => {
  it("an attachment with words wins outright, and the hunt asks nothing else", async () => {
    world.attachments = [{ fileId: "ATT", title: "Weekly sync - Transcript", url: null }]
    world.byId.set("ATT", file("ATT", "Weekly sync - Transcript"))
    world.text.set("ATT", "thirteen thousand characters, morally")

    const found = await hunt()
    expect(found?.foundBy).toBe("attachment")
    expect(found?.text).toBe("thirteen thousand characters, morally")
  })

  it("an attachment we cannot read hands over to the next route", async () => {
    world.attachments = [{ fileId: "ATT", title: "Weekly sync - Transcript", url: null }]
    world.byId.set("ATT", file("ATT", "Weekly sync - Transcript"))
    world.folders = [{ id: "S1", active: true, kind: "folder", externalId: "FOLDER" }]
    world.driveHits = [file("DOC", "Weekly sync - Transcript")]
    world.text.set("DOC", "the folder had it after all")

    expect((await hunt())?.foundBy).toBe("drive")
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AND A TRANSCRIPT IS ITS OWN MEETING'S WORDS, WHICH IS A SECOND THING ENTIRELY.
//
// Reported by the owner on 2026-08-31 as "the assistant answered incorrectly"
// about that morning's ⏩ Week planning. It had not: it summarised the attached
// document faithfully, and the attached document was the notes from ⏩ Week
// planning SEVEN DAYS EARLIER. Route 2 searches by TITLE, a recurring meeting
// wears the same title every week, and the sort took the most recently MODIFIED
// hit — so every recurrence was handed a previous occurrence's notes.
//
// Measured on staging that day: seven of the seven transcripts this route had
// ever filed were the wrong document. 31 Aug got 24 Aug, 28 Aug got 21 Aug,
// 24 Aug got 17 Aug, 21 Aug got 14 Aug; and across different meetings with
// similar names, `FluClinic: Sync up` got `FluClinic: Phase 2 and 3 tasks sync
// up`, five days older. A hundred per cent failure rate, invisible: the door
// answered 200, a transcript was present, and the summary read perfectly.
describe("a meeting's notes cannot predate the meeting", () => {
  const start = "2026-08-31T10:00:00Z"

  it("rejects the previous occurrence of a recurring meeting", () => {
    // The exact case the owner hit: this week's meeting, last week's notes.
    expect(notesCouldBelongTo("2026-08-24T11:00:00Z", start)).toBe(false)
  })

  it("accepts notes written during or after the meeting", () => {
    expect(notesCouldBelongTo("2026-08-31T10:30:00Z", start)).toBe(true)
    expect(notesCouldBelongTo("2026-08-31T18:00:00Z", start)).toBe(true)
    expect(notesCouldBelongTo("2026-09-02T09:00:00Z", start)).toBe(true)
  })

  it("allows an hour of head start, because notes open as the meeting does", () => {
    expect(notesCouldBelongTo("2026-08-31T09:30:00Z", start)).toBe(true)
    expect(notesCouldBelongTo("2026-08-31T08:30:00Z", start)).toBe(false)
  })

  it("does not judge what it cannot read — a missing or unparsable stamp passes", () => {
    // Silence is not evidence of a mismatch. Let the routes that read WORDS
    // decide, rather than dropping a candidate on a stamp Google did not send.
    expect(notesCouldBelongTo(null, start)).toBe(true)
    expect(notesCouldBelongTo("2026-08-24T11:00:00Z", "")).toBe(true)
    expect(notesCouldBelongTo("not a date", start)).toBe(true)
  })

  it("leaves the route with NOTHING rather than with the wrong document", async () => {
    world.folders = [{ id: "S1", active: true, kind: "folder", externalId: "FOLDER" }]
    world.driveHits = [file("LAST_WEEK", "Weekly sync - Transcript", null, "2026-08-24T11:00:00Z")]
    world.text.set("LAST_WEEK", "notes from the meeting a week before this one")

    // Fails CLOSED. A visible absence is recoverable; a confident wrong answer
    // is what nobody can see.
    expect(await hunt(start)).toBeNull()
  })

  it("picks the nearest qualifying notes, not the most recently edited", async () => {
    world.folders = [{ id: "S1", active: true, kind: "folder", externalId: "FOLDER" }]
    world.driveHits = [
      // Someone edited an older week's notes today — newest modifiedTime of all,
      // and still the wrong meeting. The old sort chose exactly this one.
      file("EDITED_OLD", "Weekly sync - Transcript", null, "2026-09-20T12:00:00Z"),
      file("THIS_ONE", "Weekly sync - Transcript", null, "2026-08-31T10:45:00Z"),
    ]
    world.text.set("EDITED_OLD", "an older week, touched again later")
    world.text.set("THIS_ONE", "the words actually said at this meeting")

    const found = await hunt(start)
    expect(found?.text).toBe("the words actually said at this meeting")
  })
})
