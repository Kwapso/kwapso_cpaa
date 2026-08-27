// EVERYTHING HE CAN SEE, AND NOTHING THAT ISN'T THERE.
//
// ══════════════════════════════════════════════════════════════════════════════
// The owner's rule for every Google connection, in his words: "everything that I
// can visually see and access, whether it's owned by me or owned by somebody
// else, has to be synced."
//
// A live read of his real account on 2026-08-18 found four ways the app was
// quietly failing it. Not one of the four raised an error, showed a red box or
// broke a build — every one of them presented as a perfectly ordinary answer
// that happened to be missing something, which is why they had all survived. The
// four are one suite because they are one fault repeated: A BOUNDED READ THAT
// DOES NOT SAY IT IS BOUNDED, and its twin, A FIND THAT WAS NEVER CHECKED.
//
//   1. THE CALENDAR STOPPED AT FIFTY. `calendarList` asked for one page and never
//      looked at `nextPageToken`. Unlike Drive, Gmail and Chat — which are read
//      newest-first, so their tail is the material nobody wants — the calendar
//      is ordered by START TIME. Its tail is TOMORROW. A fortnight with
//      fifty-one entries in it silently lost the far end of the window, and the
//      sweep recorded a clean run.
//   2. A TRANSCRIPT WITH NO WORDS IN IT was filed as a transcript. Route 2 found
//      a Drive SHORTCUT — the document's name, its own id, no content — and
//      reported `found` with a plausible name and a working link. Measured: the
//      same conversation read 13,128 characters through route 1 and 0 through
//      route 2. Downstream ticked the meeting held and stopped looking.
//   3. SENDERS WERE RESOURCE IDS. The space names were put right in an earlier
//      round; `users/112978…` was still where every human being's name belonged,
//      because Google fills `displayName` for apps and leaves it empty for
//      people, and `displayName || name` reads like a sensible fallback.
//   4. NOTHING EVER LET GO. A Drive file, a mail or an event he DELETED stayed
//      answerable for ever: Google's kinds are a listing rather than a table, so
//      a deleted item is simply absent, and the sweep walks forward past a row
//      it will never be handed again.
//
// WHAT EACH TEST HERE IS REALLY ASSERTING is that the honest answer and the
// convenient one have stopped being the same. Every fix in this lane makes the
// app do MORE work in order to say a smaller, truer thing.
// ══════════════════════════════════════════════════════════════════════════════

import { afterEach, describe, expect, it, vi } from "vitest"

import { calendarList, chatMessages, driveFileText, driveList } from "../src/lib/google-api"

/** The reader env, reduced to the one binding a reader may touch. */
const readerEnv = { AI: { toMarkdown: async () => ({ data: "" }) } } as never

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Google, reduced to "what does the next request get". Each test states its own
 * sequence, because what is under test in every one of them is how many requests
 * are made and what is on them. */
function stubGoogle(reply: (url: string) => unknown) {
  const urls: string[] = []
  vi.stubGlobal("fetch", async (url: string) => {
    urls.push(String(url))
    const body = reply(String(url))
    return body instanceof Response ? body : new Response(JSON.stringify(body), { status: 200 })
  })
  return { urls }
}

const event = (id: string) => ({ id, summary: id, start: { dateTime: "2026-08-18T09:00:00Z" } })

describe("the calendar is read to the END of the window, not to the end of a page", () => {
  it("walks Google's pages and returns every entry, not the first fifty", async () => {
    const { urls } = stubGoogle((url) =>
      url.includes("pageToken=P2")
        ? { items: [event("C")] }
        : url.includes("pageToken=P1")
          ? { items: [event("B")], nextPageToken: "P2" }
          : { items: [event("A")], nextPageToken: "P1" }
    )

    const window = await calendarList("tok", { from: "2026-08-01T00:00:00Z", to: "2026-09-01T00:00:00Z" })

    // The regression, in one line: this used to be ["A"].
    expect(window.events.map((e) => e.id)).toEqual(["A", "B", "C"])
    expect(window.truncated, "it reached the end of the window, so this is the WHOLE answer").toBe(false)
    expect(urls).toHaveLength(3)
  })

  it("carries the window and the flags onto every page, not just the first", async () => {
    // A second page asked WITHOUT `showDeleted` would answer a different question
    // from the first — and the sweep would learn that entries are cancelled only
    // if they happen to fall in the first fifty.
    const { urls } = stubGoogle((url) =>
      url.includes("pageToken") ? { items: [] } : { items: [], nextPageToken: "P1" }
    )
    await calendarList("tok", { from: "2026-08-01T00:00:00Z", to: "2026-09-01T00:00:00Z", showDeleted: true })
    const second = urls[1] as string
    expect(second).toContain("showDeleted=true")
    expect(second).toContain("timeMin=2026-08-01")
    expect(second).toContain("singleEvents=true")
  })

  it("stops at its OWN ceiling and says so — a dropped tail is never silent", async () => {
    // Google that never runs out. Without a ceiling this walks for ever; without
    // the tail line it walks, gives up, and reports a clean read of a window it
    // only half saw — which is the fault R14 exists for.
    const { urls } = stubGoogle(() => ({ items: [event("X")], nextPageToken: "MORE" }))
    const said: string[] = []
    vi.stubGlobal("console", { ...console, error: (m: string) => said.push(String(m)) })

    const window = await calendarList("tok", { from: "2026-08-01T00:00:00Z" })

    expect(urls.length).toBeLessThanOrEqual(5)
    expect(window.events).toHaveLength(urls.length)
    expect(said.join(" ")).toContain("truncated")
    // AND IT SAYS SO TO THE CALLER, not only to the log. The backfill walk moves
    // a cursor over years of calendar; a truncated slice it could not see would be
    // a hole that closes behind it for ever.
    expect(window.truncated).toBe(true)
  })
})

describe("a shortcut is not a document, and the words say which", () => {
  /** The shape that caused it: a folder listing hands back a shortcut that
   * carries the document's NAME and the pointer's id. */
  const SHORTCUT = {
    id: "SHORTCUT_ID",
    name: "Weekly sync - Transcript",
    mimeType: "application/vnd.google-apps.shortcut",
    shortcutDetails: { targetId: "REAL_DOC" },
  }

  it("a listing says what the shortcut POINTS AT, so a caller can keep the real id", async () => {
    stubGoogle(() => ({ files: [SHORTCUT] }))
    const [file] = await driveList("tok", ["FOLDER"])
    expect(file?.id).toBe("SHORTCUT_ID")
    // Without this the transcript row keeps a pointer's id for ever, and anything
    // that re-reads it gets the same nothing.
    expect(file?.targetId).toBe("REAL_DOC")
    // And an ordinary file is not suddenly a pointer to itself.
    stubGoogle(() => ({ files: [{ id: "PLAIN", name: "notes", mimeType: "text/plain" }] }))
    expect((await driveList("tok", ["FOLDER"]))[0]?.targetId).toBeNull()
  })

  it("reading a shortcut reads the DOCUMENT — the 13,128-versus-0 bug", async () => {
    const { urls } = stubGoogle((url) => {
      if (url.includes("SHORTCUT_ID") && !url.includes("export")) return SHORTCUT
      if (url.includes("REAL_DOC") && !url.includes("export"))
        return { mimeType: "application/vnd.google-apps.document", name: "Weekly sync - Transcript" }
      if (url.includes("REAL_DOC") && url.includes("export")) return new Response("what was said", { status: 200 })
      // THE OLD BEHAVIOUR: exporting the shortcut itself. Google refuses, the
      // refusal became "", and "" was filed as a transcript.
      return new Response("", { status: 403 })
    })

    expect(await driveFileText(readerEnv, "tok", "SHORTCUT_ID")).toBe("what was said")
    // It read the TARGET, and asked Google about it rather than guessing.
    expect(urls.some((u) => u.includes("REAL_DOC") && u.includes("export"))).toBe(true)
  })

  it("a shortcut whose target we cannot read is still honestly EMPTY, never a throw", async () => {
    // The knowledge sweep walks a whole folder in an uncaught loop, so one
    // awkward file must not cost it the other thirty-nine (google-drive-text).
    stubGoogle((url) =>
      url.includes("export") || url.includes("alt=media")
        ? new Response("", { status: 403 })
        : url.includes("REAL_DOC")
          ? { mimeType: "application/vnd.google-apps.document" }
          : SHORTCUT
    )
    await expect(driveFileText(readerEnv, "tok", "SHORTCUT_ID")).resolves.toBe("")
  })
})

describe("who said it, in words, or an honest description of who", () => {
  const message = (sender: Record<string, unknown>) => ({
    messages: [{ name: "spaces/AAA/messages/1", text: "hello", createTime: "2026-08-18T09:00:00Z", sender }],
  })

  it("Google's own name wins, and is marked as Google's", async () => {
    stubGoogle(() => message({ name: "users/1", displayName: "Ana Ruiz", type: "HUMAN" }))
    const [m] = (await chatMessages("tok", "spaces/AAA")).messages
    expect(m?.sender).toBe("Ana Ruiz")
    expect(m?.senderNamed).toBe(true)
  })

  it("a person Google will not name is DESCRIBED, never rendered as users/112978…", async () => {
    // The bug the owner screenshotted, one layer below the one that was fixed.
    // `chat.spaces.readonly` returns no membership, so a name is not available at
    // any price short of a wider grant and a re-consent from everybody.
    stubGoogle(() => message({ name: "users/112978", type: "HUMAN" }))
    const [m] = (await chatMessages("tok", "spaces/AAA")).messages
    expect(m?.sender).not.toContain("users/")
    expect(m?.sender).toBe("Somebody in this space")
    // And the reader is TOLD it is our sentence rather than Google's.
    expect(m?.senderNamed).toBe(false)
  })

  it("an app is not a person — the two are worth telling apart in a transcript", async () => {
    stubGoogle(() => message({ name: "users/9", type: "BOT" }))
    expect(((await chatMessages("tok", "spaces/AAA")).messages)[0]?.sender).toBe("An app")
  })

  it("a sender Google described in NO way falls back to the id, labelled as one", async () => {
    stubGoogle(() => message({ name: "users/7" }))
    const [m] = (await chatMessages("tok", "spaces/AAA")).messages
    expect(m?.sender).toBe("users/7")
    expect(m?.senderNamed).toBe(false)
  })
})
