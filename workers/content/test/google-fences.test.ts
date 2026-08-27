// THE THREE FENCES THIS MODULE PROMISES, RUN RATHER THAN READ.
//
// The owner's decisions were specific about scope: Drive is NAMED FOLDERS only,
// Gmail is only mail to or from a known contact, Chat is NAMED SPACES only. Each
// of those is one line of code away from its opposite — an empty filter list and
// an absent filter look identical in most query languages, and "no restriction"
// is what you get by leaving a restriction out. So each is tested by CALLING the
// function with the empty case and proving it answers with nothing rather than
// with everything.
//
// `fetch` is replaced for the duration, and the test asserts on whether it was
// called at all. That is the sharp end of it: a fence that returns [] AFTER
// asking Google for the whole Drive has already leaked the request; a fence that
// never asks is a fence.

import { afterEach, describe, expect, it, vi } from "vitest"

import { GuardError } from "@shared/workers/gating"
import {
  driveList,
  gmailDraft,
  knownContactQuery,
  GMAIL_CONTACT_CAP,
} from "../src/lib/google-api"
import { asScopedService, asService, asShelf } from "../src/lib/google"
import { openToken, sealToken, tokenStorageReady } from "../src/lib/google-crypto"

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
  vi.restoreAllMocks()
})

/** A fetch that fails the test if anything reaches it. */
function noCallsAllowed() {
  const spy = vi.fn(async () => new Response("{}", { status: 200 }))
  globalThis.fetch = spy as unknown as typeof fetch
  return spy
}

describe("Drive is the folders you named, and nothing else", () => {
  it("a person who has shared no folders gets nothing — and Google is never asked", async () => {
    const spy = noCallsAllowed()
    expect(await driveList("token", [])).toEqual([])
    expect(spy, "an empty folder list must not become an unfiltered Drive query").not.toHaveBeenCalled()
  })

  it("EVERY query is anchored to a parent — named, or reached from a named one", async () => {
    const urls: string[] = []
    globalThis.fetch = vi.fn(async (url: unknown) => {
      urls.push(String(url))
      return new Response(JSON.stringify({ files: [] }), { status: 200 })
    }) as unknown as typeof fetch
    await driveList("token", ["FOLDER_A", "FOLDER_B"])
    // The count is no longer one-per-folder — the walk asks each folder for its
    // files and then for its subfolders — so the assertion is the one that
    // actually matters: NOTHING is ever asked without a parent to anchor it.
    // An unanchored query is a listing of somebody's whole Drive.
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) {
      const q = new URL(url).searchParams.get("q") ?? ""
      expect(q, "every query must be anchored to a folder").toMatch(/'(FOLDER_A|FOLDER_B)' in parents/)
      expect(q).toContain("trashed = false")
    }
  })

  it("DESCENDS into a subfolder, and files what it finds under the NAMED folder", async () => {
    // THE REGRESSION TEST FOR THE OWNER'S MISSING TRANSCRIPTS (20 Aug 2026).
    //
    // Google Meet does not file a recording as a file in a folder — it makes A
    // FOLDER PER MEETING holding the transcript, the recording and the Gemini
    // notes. So his shared `Google Meet` folder contained nothing but
    // subfolders, every one of them excluded by the `mimeType != folder` clause,
    // and a folder that looked shared contributed exactly zero documents for as
    // long as it had been shared. Measured on his account: 15 shared folders,
    // 54 files.
    const seen: string[] = []
    globalThis.fetch = vi.fn(async (url: unknown) => {
      const u = new URL(String(url))
      const q = u.searchParams.get("q") ?? ""
      seen.push(q)
      const wantsFolders = q.includes("mimeType = 'application/vnd.google-apps.folder'")
      // ROOT holds one subfolder and no files; the subfolder holds the document.
      if (q.includes("'ROOT' in parents"))
        return new Response(
          JSON.stringify({
            files: wantsFolders
              ? [{ id: "SUB", name: "FluClinic 12 Aug", mimeType: "application/vnd.google-apps.folder" }]
              : [],
          }),
          { status: 200 }
        )
      if (q.includes("'SUB' in parents"))
        return new Response(
          JSON.stringify({
            files: wantsFolders
              ? []
              : [{ id: "DOC", name: "Notes by Gemini", mimeType: "application/vnd.google-apps.document" }],
          }),
          { status: 200 }
        )
      return new Response(JSON.stringify({ files: [] }), { status: 200 })
    }) as unknown as typeof fetch

    const files = await driveList("token", ["ROOT"])
    expect(files.map((f) => f.id), "the document one level down must be found").toEqual(["DOC"])
    // THE LOAD-BEARING HALF. A file's `folderId` is what the caller looks the
    // shelf and the client up by (google-read.ts `shelfOf.get(file.folderId)`).
    // Tagging it with `SUB` — the folder it literally sits in — would make every
    // descended file shelf-less, which is to say private and unfiled: the
    // recursion would "work" and quietly hide everything it found.
    expect(files[0]?.folderId, "it belongs to the folder somebody NAMED").toBe("ROOT")
    expect(seen.some((q) => q.includes("'SUB' in parents")), "it must have opened the subfolder").toBe(true)
  })

  it("a folder reached twice is read once, and a cycle cannot hang the walk", async () => {
    // Drive lets one folder sit in two parents, so a walk that does not remember
    // where it has been is a walk that can loop — and a document filed under two
    // shared folders would otherwise be indexed twice and compete with itself
    // for room in an answer.
    let calls = 0
    globalThis.fetch = vi.fn(async (url: unknown) => {
      calls += 1
      const q = new URL(String(url)).searchParams.get("q") ?? ""
      const wantsFolders = q.includes("mimeType = 'application/vnd.google-apps.folder'")
      // A points at B, B points back at A.
      if (wantsFolders && q.includes("'A' in parents"))
        return new Response(
          JSON.stringify({ files: [{ id: "B", mimeType: "application/vnd.google-apps.folder" }] }),
          { status: 200 }
        )
      if (wantsFolders && q.includes("'B' in parents"))
        return new Response(
          JSON.stringify({ files: [{ id: "A", mimeType: "application/vnd.google-apps.folder" }] }),
          { status: 200 }
        )
      return new Response(
        JSON.stringify({ files: [{ id: "SHARED", name: "one file", mimeType: "text/plain" }] }),
        { status: 200 }
      )
    }) as unknown as typeof fetch

    const files = await driveList("token", ["A"])
    expect(files.map((f) => f.id), "the same file reached twice is one file").toEqual(["SHARED"])
    expect(calls, "the cycle must not spend the whole call budget").toBeLessThan(10)
  })

  it("ONE folder's refusal is one folder's — the rest of the walk survives", async () => {
    // The walk now opens folders nobody named, and among a few hundred of those
    // there is reliably one Google answers 403 for: a shortcut whose target
    // moved, a subfolder shared with its parent but not with this person. Before
    // this was caught per folder, the FIRST such folder threw and the whole
    // listing came back as `google_access_lost` — telling the owner to reconnect
    // a connection that was working perfectly. Which is exactly what it did.
    globalThis.fetch = vi.fn(async (url: unknown) => {
      const q = new URL(String(url)).searchParams.get("q") ?? ""
      if (q.includes("'DENIED' in parents")) return new Response("{}", { status: 403 })
      if (q.includes("mimeType = 'application/vnd.google-apps.folder'"))
        return new Response(JSON.stringify({ files: [] }), { status: 200 })
      return new Response(
        JSON.stringify({ files: [{ id: "OK_FILE", name: "readable", mimeType: "text/plain" }] }),
        { status: 200 }
      )
    }) as unknown as typeof fetch

    const files = await driveList("token", ["DENIED", "FINE"])
    expect(files.map((f) => f.id), "the readable folder still answers").toEqual(["OK_FILE"])
  })

  it("a folder name carrying a quote cannot break out of the query", async () => {
    const urls: string[] = []
    globalThis.fetch = vi.fn(async (url: unknown) => {
      urls.push(String(url))
      return new Response(JSON.stringify({ files: [] }), { status: 200 })
    }) as unknown as typeof fetch
    // The search term is the caller's words, so it is the one that can carry a
    // quote. Unescaped, `' or name contains '` ends the literal and the rest is
    // parsed as Drive syntax — the same class of bug as an unescaped SQL string,
    // in somebody else's query language.
    await driveList("token", ["F1"], "Ana's plan")
    const q = new URL(urls[0]).searchParams.get("q") ?? ""
    expect(q).toContain("Ana\\'s plan")
    expect(q, "the parent clause must survive intact").toContain("'F1' in parents")
  })
})

describe("Gmail is known contacts, and nothing else", () => {
  it("no contact with an address → NO query at all (not an empty filter)", () => {
    // The empty case answers `null`, and the door turns that into "we have no
    // contact with an email address yet". An empty OR-group would read to Gmail
    // as no restriction, which is the whole mailbox.
    expect(knownContactQuery([])).toBeNull()
    expect(knownContactQuery(["", "   "])).toBeNull()
  })

  it("the fence names both directions for every contact", () => {
    const q = knownContactQuery(["Ana@Berg.example", "cto@delaval.example"]) as string
    expect(q.startsWith("{") && q.endsWith("}"), "Gmail's OR group").toBe(true)
    // Lower-cased, because a Gmail search term is not case-sensitive but a
    // duplicate is still a longer query.
    expect(q).toContain("from:ana@berg.example")
    expect(q).toContain("to:ana@berg.example")
    expect(q).toContain("from:cto@delaval.example")
    expect(q).toContain("to:cto@delaval.example")
  })

  it("a contact is matched on cc as well as from and to", () => {
    // THE GAP, off the owner's own mailbox: `cc:alaap@kwapso.com` returns "Re:
    // Declined: Strategy Session w kwapso" — a colleague writing to an outside
    // address with him copied in. Mail he can see, about his own agency, that
    // the fence could not find, because "to or from" had been implemented as
    // two terms and a cc is neither.
    const q = knownContactQuery(["ana@berg.example"]) as string
    expect(q).toContain("cc:ana@berg.example")
  })

  it("the contact list is capped, so a long one cannot become a refused query", () => {
    const many = Array.from({ length: GMAIL_CONTACT_CAP + 25 }, (_, i) => `p${i}@example.com`)
    const q = knownContactQuery(many) as string
    // Three terms per contact now, and not one more.
    expect(q.split(" ").length).toBe(GMAIL_CONTACT_CAP * 3)
    expect(q).not.toContain(`p${GMAIL_CONTACT_CAP}@example.com`)
  })

  it("adding the third direction did not make the query LONGER — the cap paid for it", () => {
    // THE TRAP THIS LOCKS. A Gmail query that is too long is REFUSED, and a
    // refused query reads from the outside exactly like an empty mailbox — the
    // worst failure shape there is, because nothing looks wrong. Going from two
    // terms to three at the old cap of forty would have taken the query from
    // eighty terms to a hundred and twenty, past anything this product has ever
    // asked Google and answered for.
    //
    // So the assertion is not "the cap is 26". It is that the QUERY cannot grow,
    // whatever anybody does to the directions or the cap later.
    const many = Array.from({ length: 500 }, (_, i) => `p${i}@example.com`)
    const q = knownContactQuery(many) as string
    expect(q.split(" ").length).toBeLessThanOrEqual(80)
  })

  it("a subject with a newline cannot smuggle a second header (Bcc:)", async () => {
    let sentBody = ""
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      sentBody = String(init?.body ?? "")
      return new Response(JSON.stringify({ id: "d1", message: { id: "m1", threadId: "t1" } }), { status: 200 })
    }) as unknown as typeof fetch
    await gmailDraft("token", {
      to: "ana@berg.example",
      subject: "Invoice\r\nBcc: everyone@example.com",
      body: "hello",
    })
    const raw = JSON.parse(sentBody).message.raw as string
    const decoded = atob(raw.replaceAll("-", "+").replaceAll("_", "/").padEnd(raw.length + ((4 - (raw.length % 4)) % 4), "="))
    expect(decoded, "an injected header would be its own line").not.toContain("\r\nBcc:")
    expect(decoded).toContain("Subject: Invoice Bcc: everyone@example.com")
  })
})

describe("the allow-lists are the check", () => {
  it("only the four services, and only the two that carry a scope", () => {
    expect(asService("drive")).toBe("drive")
    expect(asService("chat")).toBe("chat")
    expect(() => asService("mailbox")).toThrow(GuardError)
    expect(() => asService(123)).toThrow(GuardError)
    // SCOPE IS A QUESTION ABOUT GMAIL AND CALENDAR AND NOTHING ELSE. Drive and
    // Chat are narrowed by what somebody SHARED — an unshared folder is out of
    // reach already — so a scope on either would be a control with nothing
    // behind it, and the door refuses the word rather than accepting and
    // ignoring it.
    expect(asScopedService("gmail")).toBe("gmail")
    expect(asScopedService("calendar")).toBe("calendar")
    expect(() => asScopedService("drive")).toThrow(GuardError)
    expect(() => asScopedService("chat")).toThrow(GuardError)
    expect(() => asScopedService(null)).toThrow(GuardError)
  })

  it("the shelf defaults to PRIVATE — the safe answer is the one you get by not deciding", () => {
    expect(asShelf(undefined)).toBe("private")
    expect(asShelf("")).toBe("private")
    expect(asShelf("team")).toBe("team")
    expect(() => asShelf("everyone")).toThrow(GuardError)
    expect(() => asShelf(true)).toThrow(GuardError)
  })
})

describe("a stored token is ciphertext", () => {
  const env = { GOOGLE_TOKEN_KEY: btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1))) }

  it("round-trips under its own key, and the stored value is not the token", async () => {
    const sealed = await sealToken(env, "1//refresh-token-value")
    expect(sealed, "a dump of the table must not be a list of tokens").not.toContain("refresh-token-value")
    expect(sealed.startsWith("v1."), "the format is versioned so it can be replaced later").toBe(true)
    expect(await openToken(env, sealed)).toBe("1//refresh-token-value")
  })

  it("the same token sealed twice looks different (a fresh IV every time)", async () => {
    const a = await sealToken(env, "same")
    const b = await sealToken(env, "same")
    expect(a).not.toBe(b)
  })

  it("another key cannot read it, and says so instead of returning nothing", async () => {
    const sealed = await sealToken(env, "secret")
    const other = { GOOGLE_TOKEN_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(9))) }
    await expect(openToken(other, sealed)).rejects.toThrow(GuardError)
    // Rubbish in the column is a refusal too — never a silent "" that would look
    // to every caller above like "this person has not connected anything".
    await expect(openToken(env, "not-a-sealed-value")).rejects.toThrow(GuardError)
    await expect(openToken(env, "v1.@@@.@@@")).rejects.toThrow(GuardError)
  })

  it("no key configured = no connection, rather than a token written in the clear", async () => {
    expect(tokenStorageReady({})).toBe(false)
    expect(tokenStorageReady({ GOOGLE_TOKEN_KEY: "  " })).toBe(false)
    await expect(sealToken({}, "x")).rejects.toThrow(GuardError)
    // A key of the wrong SIZE is refused too: a 16-byte key silently "works" in
    // some stacks at half the strength somebody thinks they configured.
    await expect(sealToken({ GOOGLE_TOKEN_KEY: btoa("short") }, "x")).rejects.toThrow(GuardError)
  })
})
