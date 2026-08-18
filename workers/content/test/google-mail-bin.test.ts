// THE MAIL BIN — what kwapso can take back out of somebody's mailbox, and what
// it deliberately cannot.
//
// The owner asked for this in five words: "why is there no method for you to
// delete drafts?" The gap was real and it was the Drive bin's gap over again —
// the assistant could WRITE a draft into somebody's Gmail and had no way to take
// one back, so every draft it wrote by mistake was a letter the person had to go
// and tidy up themselves.
//
// TWO THINGS ARE UNDER TEST, and only one of them is the feature:
//
//   • THE BIN, NEVER A DELETE. Three Gmail endpoints, and not one of them
//     destroys anything: a binned letter keeps everything and comes back in one
//     click for thirty days. The half that makes that a guarantee rather than a
//     habit is in google-scopes.test.ts — this app cannot ask for the scope that
//     would let it delete outright — and the half here is that no call in this
//     module goes anywhere near one.
//   • R17: SOMETHING ALREADY IN THE BIN MOVES NOTHING. Not a nicety. The caller
//     writes a history row and rings a live-sync bell on `changed`, so a door
//     that reported a change for a second click would put a line in somebody's
//     own history describing an act that never happened.

import { afterEach, describe, expect, it, vi } from "vitest"

import { GOOGLE_MAIL_BIN_KINDS, gmailTrash } from "../src/lib/google-api"

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Google, reduced to "what does the next request get" — the same idiom
 * google-visibility.test.ts uses, because what is under test here is likewise
 * WHICH requests are made rather than what comes back. */
function stubGoogle(reply: (url: string, method: string) => unknown) {
  const calls: { url: string; method: string }[] = []
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET"
    calls.push({ url: String(url), method })
    const body = reply(String(url), method)
    return body instanceof Response ? body : new Response(JSON.stringify(body), { status: 200 })
  })
  return { calls }
}

describe("three shapes, one act", () => {
  it("covers every kind the door will accept (a scan over nothing proves nothing)", () => {
    expect([...GOOGLE_MAIL_BIN_KINDS]).toEqual(["draft", "message", "thread"])
  })

  it("a draft is DELETED as a draft — the letter never existed for anyone else", async () => {
    // Gmail answers this one 204 No Content. `res.json()` throws on an empty
    // body, so the one call in this module that succeeds without saying anything
    // used to fail at the parser AFTER the draft was already gone.
    const { calls } = stubGoogle(() => new Response(null, { status: 204 }))
    expect(await gmailTrash("tok", "draft", "D1")).toEqual({ changed: true })
    expect(calls).toEqual([
      { url: "https://gmail.googleapis.com/gmail/v1/users/me/drafts/D1", method: "DELETE" },
    ])
  })

  it("a message goes to Trash, and is READ first so a second click is silent", async () => {
    const { calls } = stubGoogle((url) => (url.includes("/trash") ? {} : { labelIds: ["INBOX"] }))
    expect(await gmailTrash("tok", "message", "M1")).toEqual({ changed: true })
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET https://gmail.googleapis.com/gmail/v1/users/me/messages/M1?format=minimal",
      "POST https://gmail.googleapis.com/gmail/v1/users/me/messages/M1/trash",
    ])
  })

  it("a whole conversation goes to Trash", async () => {
    const { calls } = stubGoogle((url) =>
      url.includes("/trash") ? {} : { messages: [{ labelIds: ["INBOX"] }, { labelIds: ["SENT"] }] }
    )
    expect(await gmailTrash("tok", "thread", "T1")).toEqual({ changed: true })
    expect(calls[1]).toEqual({
      url: "https://gmail.googleapis.com/gmail/v1/users/me/threads/T1/trash",
      method: "POST",
    })
  })
})

describe("R17 — already in the bin moves nothing", () => {
  it("a message that is already in Trash is not touched again", async () => {
    const { calls } = stubGoogle(() => ({ labelIds: ["TRASH"] }))
    expect(await gmailTrash("tok", "message", "M1")).toEqual({ changed: false })
    expect(calls, "it asked Gmail to bin a message that was already binned").toHaveLength(1)
  })

  it("a draft that is already gone answers 'nothing moved', not a refusal", async () => {
    // A deleted draft is not IN the bin, it is gone: Gmail keeps the message it
    // was drafting and never the draft. So absence is the only reading of
    // 'already done' there is, and a 404 has to come back as an answer rather
    // than as "Google couldn't answer that just now".
    stubGoogle(() => new Response(JSON.stringify({ error: {} }), { status: 404 }))
    expect(await gmailTrash("tok", "draft", "D-GONE")).toEqual({ changed: false })
  })

  it("a conversation already wholly in Trash is not touched again", async () => {
    const { calls } = stubGoogle(() => ({ messages: [{ labelIds: ["TRASH"] }, { labelIds: ["TRASH"] }] }))
    expect(await gmailTrash("tok", "thread", "T1")).toEqual({ changed: false })
    expect(calls).toHaveLength(1)
  })

  it("but a HALF-binned conversation is a real change, and is finished", async () => {
    // Somebody binned one reply. Reading that as "already done" would leave the
    // rest of the exchange in the inbox while the answer said it had gone.
    const { calls } = stubGoogle((url) =>
      url.includes("/trash") ? {} : { messages: [{ labelIds: ["TRASH"] }, { labelIds: ["INBOX"] }] }
    )
    expect(await gmailTrash("tok", "thread", "T1")).toEqual({ changed: true })
    expect(calls).toHaveLength(2)
  })
})

describe("never a permanent delete", () => {
  it("no call in this act reaches Gmail's destroying endpoints", async () => {
    const { calls } = stubGoogle((url, method) => {
      if (method === "DELETE" && url.includes("/messages/")) throw new Error("permanent delete")
      if (url.includes("batchDelete")) throw new Error("permanent delete")
      return url.includes("/trash") ? {} : { labelIds: ["INBOX"], messages: [{ labelIds: ["INBOX"] }] }
    })
    for (const kind of GOOGLE_MAIL_BIN_KINDS) await gmailTrash("tok", kind, "X")
    // The one DELETE here is a DRAFT's, which is not mail: a draft is a letter
    // nobody has seen, and Gmail keeps no bin for one.
    const deletes = calls.filter((c) => c.method === "DELETE")
    expect(deletes.map((c) => c.url)).toEqual([
      "https://gmail.googleapis.com/gmail/v1/users/me/drafts/X",
    ])
    for (const call of calls)
      expect(call.url, "a batch delete destroys mail outright").not.toContain("batchDelete")
  })
})
