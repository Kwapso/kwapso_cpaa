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

import { findTranscript } from "../src/lib/google-transcript"

const file = (id: string, name: string, targetId: string | null = null) => ({
  id,
  name,
  webViewLink: `https://drive.example/${id}`,
  targetId,
})

/** A calendar entry, with only the fields the hunt reads. */
const meeting = (attachments = world.attachments) =>
  ({ id: "EV1", summary: "Weekly sync", meetingCode: "abc-defg-hij", attachments }) as never

const hunt = () => findTranscript({} as never, {} as never, {} as never, meeting())

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
