// NO PLAINTEXT GOOGLE TOKEN EVER REACHES THE DATABASE — proved by RUNNING the
// two writers and reading everything they would have sent.
//
// This started life as a source scan in google-doors.test.ts, and the scan was
// worthless in the specific way this codebase keeps re-learning: it accepted a
// `sealToken` mention ANYWHERE in the 400 characters before a token assignment,
// so changing `sqlString(await sealToken(env, tokens.accessToken))` to
// `sqlString(tokens.accessToken)` left it green — the doc comment above the
// statement satisfied the rule the statement broke. Deliberately sabotaged, it
// did not go red.
//
// So the data door is replaced instead, both writers are called for real, and
// every SQL string and every bound parameter is searched for the plaintext. A
// refresh token is a standing key to somebody's mailbox that survives their
// password change; "it is encrypted" has to be a fact about what leaves this
// process, not about which helper is in scope.

import { beforeEach, describe, expect, it, vi } from "vitest"

/** Everything the writers would have sent to D1 — SQL and bound values alike. */
const sent: string[] = []

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const real = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  return {
    ...real,
    d1Query: vi.fn(async (_cfg: unknown, _db: unknown, sql: string, params?: unknown[]) => {
      sent.push(sql, JSON.stringify(params ?? []))
      // The UPSERT reads back the row id it wrote; the connection read hands back
      // one SEALED row so the refresh path has something to open. Both shapes are
      // harmless to over-return — the callers only take what they named.
      return [{ id: "CONN1", refresh_token: SEALED_REFRESH, access_token: null, access_expires_at: null }]
    }),
    d1ExecScript: vi.fn(async (_cfg: unknown, _db: unknown, script: string) => {
      sent.push(script)
    }),
  }
})

import { d1Query } from "@shared/workers/d1-rest"
import { accessTokenFor, saveConnection } from "../src/lib/google"
import { sealToken } from "../src/lib/google-crypto"

/** A real 32-byte key, so the sealing under test is the real sealing. */
const KEY = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i + 7)))
const ENV = {
  GOOGLE_TOKEN_KEY: KEY,
  GOOGLE_CONNECT_CLIENT_ID: "client-id",
  GOOGLE_CONNECT_CLIENT_SECRET: "client-secret",
  PUBLIC_APP_URL: "https://agency.example",
}
const CFG = { accountId: "acct", apiToken: "tok" }
const GUARD = { userId: "U1", teamId: "T1", roleId: "R1", databaseId: "DB1" }
const ACTOR = { id: "U1", email: "ana@agency.example", name: "Ana" }

const PLAIN_REFRESH = "1//PLAINTEXT-REFRESH-TOKEN-abcdef"
const PLAIN_ACCESS = "ya29.PLAINTEXT-ACCESS-TOKEN-abcdef"
/** Sealed once at module load so the refresh path has a readable stored value. */
let SEALED_REFRESH = ""

beforeEach(async () => {
  sent.length = 0
  vi.clearAllMocks()
  if (!SEALED_REFRESH) SEALED_REFRESH = await sealToken(ENV, PLAIN_REFRESH)
})

/** Everything that would have reached D1, as one haystack. */
const everythingSent = () => sent.join("\n")

describe("storing a completed handshake", () => {
  it("writes ciphertext — neither token appears in any statement or parameter", async () => {
    await saveConnection(ENV, CFG, GUARD, ACTOR, {
      service: "gmail",
      googleEmail: "ana@agency.example",
      tokens: {
        accessToken: PLAIN_ACCESS,
        refreshToken: PLAIN_REFRESH,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        grantedScopes: "openid email https://www.googleapis.com/auth/gmail.readonly",
      },
    })
    // The tripwire: a test that captured nothing would pass every assertion below.
    expect(d1Query, "the writer must have reached the data door at all").toHaveBeenCalled()
    expect(everythingSent().length).toBeGreaterThan(200)

    const haystack = everythingSent()
    expect(haystack, "the refresh token must never be written in the clear").not.toContain(PLAIN_REFRESH)
    expect(haystack, "the access token must never be written in the clear").not.toContain(PLAIN_ACCESS)
    // …and the sealed values really were written (a writer that dropped both
    // columns would also pass the two lines above).
    expect(haystack, "a versioned sealed value did reach the statement").toContain("v1.")
  })

  it("the audit row it writes names the account, never the token", async () => {
    await saveConnection(ENV, CFG, GUARD, ACTOR, {
      service: "drive",
      googleEmail: "ana@agency.example",
      tokens: {
        accessToken: PLAIN_ACCESS,
        refreshToken: PLAIN_REFRESH,
        expiresAt: new Date().toISOString(),
        grantedScopes: "openid email",
      },
    })
    const haystack = everythingSent()
    expect(haystack, "the history says what happened").toContain("Google account connected")
    expect(haystack).toContain("ana@agency.example")
    expect(haystack).not.toContain(PLAIN_REFRESH)
  })

  it("Google handing back no refresh token is a refusal, not a half-connection", async () => {
    // Without one, the connection dies silently an hour later — so it is refused
    // at the moment it would have been written, with the sentence that tells
    // somebody how to fix it (remove kwapso from their Google account first).
    await expect(
      saveConnection(ENV, CFG, GUARD, ACTOR, {
        service: "calendar",
        googleEmail: "ana@agency.example",
        tokens: {
          accessToken: PLAIN_ACCESS,
          refreshToken: null,
          expiresAt: new Date().toISOString(),
          grantedScopes: "openid email",
        },
      })
    ).rejects.toThrow(/lasting connection/i)
    expect(everythingSent(), "nothing may be written when the connection cannot last").not.toContain("INSERT INTO google_connections")
  })
})

describe("refreshing an expired access token", () => {
  it("re-seals the new one before storing it", async () => {
    const NEW_ACCESS = "ya29.FRESHLY-REFRESHED-ACCESS-TOKEN"
    const realFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ access_token: NEW_ACCESS, expires_in: 3600, scope: "openid email" }),
        { status: 200 }
      )
    ) as unknown as typeof fetch
    try {
      const got = await accessTokenFor(ENV, CFG, GUARD, "gmail")
      // The CALLER gets the plaintext — it has to, it is about to call Google —
      // and the DATABASE gets the sealed one. That distinction is the whole
      // point of the seam, so both halves are asserted.
      expect(got.token).toBe(NEW_ACCESS)
      const haystack = everythingSent()
      expect(haystack, "the refreshed token must be sealed before it is stored").not.toContain(NEW_ACCESS)
      expect(haystack).toContain("UPDATE google_connections SET access_token = 'v1.")
    } finally {
      globalThis.fetch = realFetch
    }
  })
})
