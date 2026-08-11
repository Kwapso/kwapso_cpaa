// AN UNVERIFIED CALLER WRITES NOTHING — INCLUDING TO THE LOG.
//
// `/api/log/client` is the crash beacon a browser posts home. Its `error_logs`
// row was already closed against an anonymous caller, and the comment above it
// says exactly why: a Cookie header is attacker-controlled, so
// `Cookie: kwapso_session=x` used to be enough to write into the GLOBAL core
// database from a stranger.
//
// The console line was left in FRONT of that check, which kept the same hole open
// in its cheaper form: four thousand characters of the caller's own text, into the
// observability stream, on an unauthenticated POST, once per request. A log is a
// store; a store an anonymous caller can grow is the same defect whichever store
// it is.
//
// Both writes are behind one door now, and this suite drives the real function
// with a fake auth binding, because "which side of the session check is this line
// on" is a question about ORDER that only running it can answer.

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { recordClientError } from "@shared/workers/front-door"

/** What auth was asked, and what it answered. */
let asked: string[] = []
let logged: unknown[] = []
let consoleLines: unknown[][] = []
let realError: typeof console.error

/** An auth binding that recognises exactly one session token. */
function auth(known: boolean) {
  return {
    fetch: async (url: string, init?: RequestInit) => {
      asked.push(String(url))
      if (String(url).includes("/api/auth/me"))
        return known
          ? new Response(JSON.stringify({ user: { id: "U1" } }))
          : new Response("no", { status: 401 })
      logged.push(JSON.parse(String(init?.body ?? "{}")))
      return new Response("{}")
    },
  }
}

const beacon = (cookie?: string, body = '{"message":"boom","where":"app"}') =>
  new Request("https://gateway/api/log/client", {
    method: "POST",
    headers: cookie ? { Cookie: cookie } : {},
    body,
  })

beforeEach(() => {
  asked = []
  logged = []
  consoleLines = []
  realError = console.error
  console.error = (...args: unknown[]) => {
    consoleLines.push(args)
  }
})
afterEach(() => {
  console.error = realError
})

describe("the client error beacon", () => {
  it("writes NOTHING for a caller with no session — not the row, and not the log line", async () => {
    const res = await recordClientError(beacon(), auth(false) as never, "web", "k")
    expect(res.status).toBe(204) // the beacon still succeeds; it just records nothing
    expect(logged, "no row in the global core database").toEqual([])
    expect(consoleLines, "and no line in the log stream either").toEqual([])
  })

  it("writes NOTHING for a forged cookie — auth's answer decides, not the header", async () => {
    // The exact attack the row was closed for: a made-up session cookie. The
    // console line used to be written before this was ever asked.
    await recordClientError(beacon("kwapso_session=forged"), auth(false) as never, "web", "k")
    expect(asked.some((u) => u.includes("/api/auth/me"))).toBe(true)
    expect(logged).toEqual([])
    expect(consoleLines).toEqual([])
  })

  it("and the caller's text never reaches the log stream unverified", async () => {
    await recordClientError(
      beacon("kwapso_session=forged", '{"message":"MARKER-8842"}'),
      auth(false) as never,
      "web",
      "k"
    )
    expect(JSON.stringify(consoleLines)).not.toContain("MARKER-8842")
  })

  it("records BOTH for a verified session — the beacon still does its job", async () => {
    await recordClientError(
      beacon("kwapso_session=real", '{"message":"MARKER-8842","where":"app"}'),
      auth(true) as never,
      "web",
      "k"
    )
    expect(logged).toHaveLength(1)
    expect((logged[0] as { message: string; userId: string }).message).toBe("MARKER-8842")
    expect((logged[0] as { userId: string }).userId, "charged to whoever auth named").toBe("U1")
    expect(JSON.stringify(consoleLines)).toContain("MARKER-8842")
  })
})
