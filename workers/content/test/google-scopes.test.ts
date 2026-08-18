// THE GRANT, NOT THE INTENTION — what kwapso may actually do inside somebody's
// Google account, proved against the strings that are sent to Google.
//
// ══════════════════════════════════════════════════════════════════════════════
// THE FAULT THIS SUITE EXISTS FOR, in one sentence: on 18 August 2026 this
// product deleted every function that could write to a calendar, wrote it down
// in four documents, and went on asking Google for permission to write to a
// calendar. Nothing was broken. Every test passed. The owner's diary was one
// forgotten line of code away from being writable by an app that had promised in
// writing that it never would be, and no check anywhere could have noticed —
// because every check read our code, and the power lives at Google.
//
// AND THE TRAP UNDER THAT ONE. Changing the scope string does not narrow
// anything either. A grant at Google is an additive SET per OAuth client: an
// account that already approved `calendar.events` keeps holding it, so the next
// connect returns a token that still carries the write scope, past a consent
// screen that asks nothing new. A fix that looks done and is not. Three things
// together make it real, and this suite checks all three:
//
//   1. what we ASK for is read-only (and stays read-only, derived from the
//      string rather than compared to a list somebody keeps in step);
//   2. the flow FORCES a fresh consent and refuses incremental authorisation,
//      so nothing is silently reused;
//   3. we READ BACK what Google granted and can say when it is wrong — the only
//      leg that produces evidence, and therefore the only one that turns "the
//      narrowing worked" from a hope into something a person can look at.
//
// The fourth leg — that disconnecting REVOKES at Google, which is the only act
// that empties the set — is checked here too, because a revoke that quietly
// stopped happening would leave the other three describing a grant nobody had
// cleared.
// ══════════════════════════════════════════════════════════════════════════════

import { afterEach, describe, expect, it, vi } from "vitest"

import { GOOGLE_SERVICES, type GoogleService } from "@shared/types"
import {
  buildConnectStart,
  missingScopes,
  requestedScopes,
  revokeAtGoogle,
  unrequestedScopes,
} from "../src/lib/google-oauth"

afterEach(() => {
  vi.unstubAllGlobals()
})

/** The identity scopes ride every list and are not a power over anything. */
const IDENTITY = ["openid", "email", "profile"]
const isIdentity = (scope: string) => IDENTITY.includes(scope)

describe("1 · what kwapso asks for", () => {
  it("finds the scope lists (a scan over nothing passes every assertion below)", () => {
    for (const service of GOOGLE_SERVICES)
      expect(requestedScopes(service).length, `${service} asks for nothing — the table has gone blind`)
        .toBeGreaterThan(1)
  })

  // THE ONE THE OWNER ASKED FOR. Derived from Google's own naming convention
  // rather than from a list of forbidden scopes: a read-only Google scope ends
  // in `.readonly`, so any calendar scope that does not is a write, whatever it
  // is called and whenever it is added. A deny-list of write scopes would have
  // to be extended the day Google names a new one; this cannot rot.
  it("calendar: every scope is a READ, so a write could not succeed if one were written", () => {
    const calendar = requestedScopes("calendar").filter((s) => !isIdentity(s))
    expect(calendar.length, "the calendar asks for nothing at all").toBeGreaterThan(0)
    for (const scope of calendar)
      expect(
        scope.endsWith(".readonly"),
        `the calendar is one-way (18 Aug 2026) and ${scope} is not a read-only scope. The refusal in the code is an ABSENCE of functions, which a future edit can undo; this is the half Google enforces.`
      ).toBe(true)
  })

  // The counterpart, and the reason the one above is not merely a spelling rule:
  // the scope that used to be here must be gone from EVERY list, not moved.
  it("nothing anywhere asks to change a calendar", () => {
    for (const service of GOOGLE_SERVICES)
      expect(
        requestedScopes(service).some((s) => s.includes("calendar") && !s.endsWith(".readonly")),
        `${service} asks for a calendar write scope`
      ).toBe(false)
  })

  // THE MAIL BIN'S OWN PROMISE. Trashing is reversible for thirty days;
  // `https://mail.google.com/` is the scope that can destroy a message outright,
  // and the whole reason the bin door is safe is that this app cannot ask for it.
  it("nothing anywhere asks for total control of a mailbox", () => {
    for (const service of GOOGLE_SERVICES)
      for (const scope of requestedScopes(service))
        expect(
          scope === "https://mail.google.com/",
          `${service} asks for the full-mailbox scope, which can delete mail permanently. The bin doors are only safe because this scope is unreachable.`
        ).toBe(false)
  })

  // The permission CHECKLIST 14.5 was blocked on. Named explicitly because a
  // reconnect is being asked of a real person to obtain it, and quietly dropping
  // it later would make that reconnect a thing he did for nothing.
  it("gmail: still asks for the permission that files and bins a message", () => {
    expect(requestedScopes("gmail")).toContain("https://www.googleapis.com/auth/gmail.modify")
    expect(requestedScopes("gmail")).toContain("https://www.googleapis.com/auth/gmail.compose")
  })
})

describe("2 · the flow cannot silently reuse an old approval", () => {
  const creds = { clientId: "cid", clientSecret: "secret" }
  const env = { PUBLIC_APP_URL: "https://app.example" }

  async function authorizeUrl(service: GoogleService): Promise<URL> {
    const { url } = await buildConnectStart(env, creds, service)
    return new URL(url)
  }

  it("asks for consent every time, so a narrowed ask is actually SHOWN to a person", async () => {
    for (const service of GOOGLE_SERVICES)
      expect(
        (await authorizeUrl(service)).searchParams.get("prompt"),
        `${service} would let Google wave a returning person through on an approval given months ago`
      ).toContain("consent")
  })

  it("refuses incremental authorisation, which is the mechanism that would hand the old scope back", async () => {
    for (const service of GOOGLE_SERVICES)
      expect(
        (await authorizeUrl(service)).searchParams.get("include_granted_scopes"),
        `${service} would be minted over everything this person has ever approved for this client`
      ).toBe("false")
  })

  it("sends exactly the list above, and nothing it did not ask for", async () => {
    for (const service of GOOGLE_SERVICES)
      expect((await authorizeUrl(service)).searchParams.get("scope")?.split(" ")).toEqual(
        requestedScopes(service)
      )
  })
})

describe("3 · what Google actually granted, read back", () => {
  const CALENDAR_WRITE = "https://www.googleapis.com/auth/calendar.events"
  const CALENDAR_READ = "https://www.googleapis.com/auth/calendar.readonly"

  it("catches the trap: a reconnect that still carries the write scope", () => {
    // The exact shape of the failure this lane is about — a token response whose
    // `scope` says read-only AND write, because Google honoured the old approval.
    expect(unrequestedScopes(`openid email ${CALENDAR_READ} ${CALENDAR_WRITE}`)).toEqual([
      CALENDAR_WRITE,
    ])
  })

  it("says nothing about a clean grant", () => {
    expect(unrequestedScopes(`openid email ${CALENDAR_READ}`)).toEqual([])
  })

  it("is not fooled by Google's own rewriting of the identity scopes", () => {
    // Google returns `email` as `…/userinfo.email`. Read naively, every healthy
    // connection this app has ever made would report an extra permission — and a
    // warning that is always on is a warning nobody reads by the second week.
    expect(
      unrequestedScopes(
        `openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile ${CALENDAR_READ}`
      )
    ).toEqual([])
  })

  it("is not fooled by one service's scope appearing on another's row", () => {
    // The four services are four consent screens and ONE OAuth client, so Google
    // may echo the union of the grant on any of them. That is its model, not a
    // fault, and flagging it would put a false warning on every row for ever.
    expect(unrequestedScopes(`openid email ${CALENDAR_READ} https://www.googleapis.com/auth/drive.file`)).toEqual(
      []
    )
  })

  it("says nothing at all about a grant that said nothing", () => {
    expect(unrequestedScopes("")).toEqual([])
  })

  // THE OTHER DIRECTION — the owner's live case. His Gmail connection predates
  // `gmail.modify`, so filing a message under a label refused him with a
  // sentence about a grant nobody had touched (CHECKLIST 14.5).
  it("names the permission a connection is short of", () => {
    const old = "openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.send"
    expect(missingScopes("gmail", old)).toEqual(["https://www.googleapis.com/auth/gmail.modify"])
  })

  it("says nothing when the grant carries everything the service asks for", () => {
    expect(missingScopes("gmail", `openid email ${requestedScopes("gmail").join(" ")}`)).toEqual([])
    expect(missingScopes("calendar", `openid email ${CALENDAR_READ}`)).toEqual([])
  })
})

describe("4 · disconnecting empties the set at Google", () => {
  it("posts the token to Google's revoke endpoint, under a timeout (R11)", async () => {
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init })
      return new Response("{}", { status: 200 })
    })

    expect(await revokeAtGoogle("refresh-token")).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe("https://oauth2.googleapis.com/revoke")
    expect(String((calls[0].init.body as URLSearchParams).get("token"))).toBe("refresh-token")
    // R11 — a hung Google socket must not hold a worker open.
    expect(calls[0].init.signal, "the revoke call carries no timeout").toBeTruthy()
  })

  it("reads an already-revoked token as revoked, not as a failure", async () => {
    // The case this lane creates: one OAuth client behind four services, so the
    // first disconnect can take the whole grant, and the three after it would
    // each tell the person to go and remove an app that is already removed.
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ error: "invalid_token" }), { status: 400 })
    )
    expect(await revokeAtGoogle("already-gone")).toBe(true)
  })

  it("reports a genuine refusal honestly rather than claiming success", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "server_error" }), { status: 500 }))
    expect(await revokeAtGoogle("tok")).toBe(false)
  })

  it("survives a dead socket — a disconnect the person asked for must still finish", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("socket hung up")
    })
    expect(await revokeAtGoogle("tok")).toBe(false)
  })
})
