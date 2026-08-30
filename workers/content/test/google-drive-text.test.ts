// WHAT ONE UNREADABLE FILE MAY COST.
//
// A named Drive folder is somebody ELSE'S material. It holds files whose owner
// switched downloading off, Shared Drive items under a retention rule, files
// Google has flagged. Google answers 403 for THAT FILE and 200 for the forty
// beside it — so "one file refused" is the ordinary case, not the exception.
//
// On 2026-08-17 a real folder's sweep indexed NOTHING and recorded "Google
// wouldn't allow that any more — connect it again in Settings." against a grant
// that was perfectly alive: `driveFileText` threw on a per-file 403, and the
// loop in google-read.ts has no catch, so the first refused file took every
// readable file with it. Gmail, Calendar and Chat — which have no per-item
// content fetch that can 403 — indexed 25, 25 and 2 in the same minute. The
// error message blamed the person's Google account for our own control flow.
//
// THE DISTINCTION THIS SUITE LOCKS. The metadata call that runs first goes
// through `googleFetch`, which already throws `google_access_lost` on 401/403.
// So by the time the download runs, the token is PROVEN good on this very file:
// a 403 there is about the FILE, and the honest answer is the one the function
// already gives an image or a zip — nothing to read. A 401 is different and
// still throws, because that is a token dying mid-loop, which somebody must be
// told about rather than have silently turn forty files into empty strings.

import { describe, expect, it, vi } from "vitest"

import { driveFileText } from "../src/lib/google-api"

/** The reader env, reduced to the one binding a reader may touch. `toMarkdown`
 * answers nothing here on purpose: these tests are about Google's side of the
 * call, and a converter that returned text would hide a download that failed. */
const env = { AI: { toMarkdown: async () => ({ data: "" }) } } as never

/** Google, reduced to the two calls this function makes: metadata, then bytes.
 * `download` decides what the SECOND call answers — the whole point of the
 * suite is that its failures are graded, so each test states one. */
function stubGoogle(opts: {
  mimeType: string
  download: { status: number; body?: string }
}): { urls: string[] } {
  const urls: string[] = []
  vi.stubGlobal("fetch", async (url: string) => {
    urls.push(String(url))
    // The metadata read — always fine here. A metadata failure is a different
    // test's business (googleFetch owns it, and it SHOULD throw there).
    if (!String(url).includes("/export") && !String(url).includes("alt=media"))
      return new Response(JSON.stringify({ mimeType: opts.mimeType, name: "f" }), { status: 200 })
    return new Response(opts.download.body ?? "", { status: opts.download.status })
  })
  return { urls }
}

describe("driveFileText — one file's refusal is not the folder's", () => {
  it("returns a Google Doc's exported text, and asks for it across shared drives", async () => {
    const { urls } = stubGoogle({
      mimeType: "application/vnd.google-apps.document",
      download: { status: 200, body: "the minutes" },
    })

    expect(await driveFileText(env, "tok", "file1")).toBe("the minutes")

    const exportUrl = urls.find((u) => u.includes("/export"))
    expect(exportUrl, "a Google Doc is exported, not downloaded").toBeDefined()
    // Without this, every Google Doc living in a SHARED drive fails — the same
    // class of miss as the 403 above, one layer down.
    expect(exportUrl).toContain("supportsAllDrives=true")
  })

  it("downloads an ordinary file as-is", async () => {
    stubGoogle({ mimeType: "text/plain", download: { status: 200, body: "plain words" } })
    expect(await driveFileText(env, "tok", "file2")).toBe("plain words")
  })

  it("treats a file Google won't hand over as EMPTY, not as a lost connection", async () => {
    stubGoogle({ mimeType: "text/plain", download: { status: 403 } })
    // The regression. This threw, and the throw escaped the caller's loop.
    await expect(driveFileText(env, "tok", "locked")).resolves.toBe("")
  })

  it("still refuses loudly when the TOKEN is rejected mid-read", async () => {
    stubGoogle({ mimeType: "text/plain", download: { status: 401 } })
    await expect(driveFileText(env, "tok", "file3")).rejects.toMatchObject({
      code: "google_access_lost",
    })
  })

  // AND THE REFUSAL IS WRITTEN DOWN. The test above proves the caller hears it;
  // it passed for months while nobody else could. This is the only
  // `google_access_lost` raised outside `googleFetch`, so it was the only one
  // that reached a person without reaching a log — and on 30 Aug 2026 the owner
  // reported seeing its sentence repeatedly against connections that were
  // provably healthy (twelve live rows, every scope granted, `last_error` NULL,
  // the sweep green, and no `access_lost` in forty-eight hours of Workers Logs).
  // Every one of those readings was correct. The event simply had nowhere to go.
  //
  // What is asserted is the TAIL, not the throw — delete the `console.error` in
  // `driveFileText` and this goes red while the test above stays green, which is
  // the whole distinction being locked.
  it("and says so in the log, because this refusal used to reach a person and no diagnostic", async () => {
    stubGoogle({ mimeType: "text/plain", download: { status: 401 } })
    const said: string[] = []
    const real = console.error
    console.error = (...a: unknown[]) => void said.push(a.map(String).join(" "))
    try {
      await expect(driveFileText(env, "tok", "file4")).rejects.toMatchObject({
        code: "google_access_lost",
      })
    } finally {
      console.error = real
    }
    const line = said.find((s) => s.includes("401"))
    expect(line, "a 401 mid-read must leave a line naming the call and the file").toBeDefined()
    // The file id is what makes the line actionable: the 2026-08-17 incident was
    // ONE awkward file stopping a whole folder, and "which file" was the question
    // nobody could answer.
    expect(line).toContain("file4")
    // Never the token. The header carried it; the log must not.
    expect(said.join(" ")).not.toContain("tok")
  })

  it("keeps treating a file with no text representation as empty", async () => {
    stubGoogle({ mimeType: "image/png", download: { status: 415 } })
    expect(await driveFileText(env, "tok", "picture")).toBe("")
  })

  it("caps one file's text so a 400-page document is not a worker's memory budget", async () => {
    stubGoogle({ mimeType: "text/plain", download: { status: 200, body: "x".repeat(250_000) } })
    expect((await driveFileText(env, "tok", "huge")).length).toBe(100_000)
  })
})
