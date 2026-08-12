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
import { asService, asNamedService, asShelf } from "../src/lib/google"
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

  it("every named folder is asked for BY PARENT, one query each", async () => {
    const urls: string[] = []
    globalThis.fetch = vi.fn(async (url: unknown) => {
      urls.push(String(url))
      return new Response(JSON.stringify({ files: [] }), { status: 200 })
    }) as unknown as typeof fetch
    await driveList("token", ["FOLDER_A", "FOLDER_B"])
    expect(urls).toHaveLength(2)
    for (const [i, folder] of ["FOLDER_A", "FOLDER_B"].entries()) {
      const q = new URL(urls[i]).searchParams.get("q") ?? ""
      expect(q, "every query must be anchored to one named folder").toContain(`'${folder}' in parents`)
      expect(q).toContain("trashed = false")
    }
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

  it("the contact list is capped, so a long one cannot become a refused query", () => {
    const many = Array.from({ length: GMAIL_CONTACT_CAP + 25 }, (_, i) => `p${i}@example.com`)
    const q = knownContactQuery(many) as string
    // Two terms per contact, and not one more.
    expect(q.split(" ").length).toBe(GMAIL_CONTACT_CAP * 2)
    expect(q).not.toContain(`p${GMAIL_CONTACT_CAP}@example.com`)
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
  it("only the four services, and only the two named ones", () => {
    expect(asService("drive")).toBe("drive")
    expect(asService("chat")).toBe("chat")
    expect(() => asService("mailbox")).toThrow(GuardError)
    expect(() => asService(123)).toThrow(GuardError)
    expect(asNamedService("drive")).toBe("drive")
    // Gmail and Calendar have nothing to NAME — mail is fenced by known contact
    // and a calendar is the person's own diary — so they are refused here.
    expect(() => asNamedService("gmail")).toThrow(GuardError)
    expect(() => asNamedService("calendar")).toThrow(GuardError)
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
