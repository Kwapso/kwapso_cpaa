// GOOGLE SIGN-IN, ADVERSARIALLY.
//
// Google's assertion is the ONLY thing standing between a stranger and a session
// on this path — there is no code to type, no inbox to own. So the suite is
// written from the attacker's side: every test below is a forged, stale or
// misaddressed token that MUST be refused, and only one of them is a token that
// should work.
//
// The tokens are REAL. A 2048-bit RSA key is generated in the suite and used to
// sign genuine JWTs, so the signature check is exercised by actual RSASSA-PKCS1
// verification rather than by a stub agreeing with itself. A second key pair
// plays the forger: same `kid`, different key — which is precisely the token an
// attacker can mint at will, and precisely what the deleted June version of this
// file would have accepted, because it never verified a signature at all.
//
// The last two tests are the OTHER half of the promise: one person, two ways in.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { beforeAll, describe, expect, it } from "vitest"

import { GuardError } from "@shared/workers/gating"
import { sourceFiles } from "@shared/rules/source-scan"

import type { Env } from "../src/env"
import { normalizeEmail } from "../src/lib/email"
import { findOrCreateUserByEmail } from "../src/lib/users"
import {
  frontDoors,
  googleCredentials,
  googleRedirectUri,
  type Jwk,
  resolveFrontDoor,
  verifyGoogleIdToken,
} from "../src/lib/google"
import { d1, migration } from "./core-sqlite"

const CLIENT_ID = "1234567890-kwapsosignin.apps.googleusercontent.com"
const KID = "kwapso-test-key"

type Pair = { privateKey: CryptoKey; jwk: Jwk }

/** A signing key plus the public JWK Google would publish for it. */
async function keyPair(kid: string): Promise<Pair> {
  const pair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair
  const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as Jwk
  return { privateKey: pair.privateKey, jwk: { ...jwk, kid, alg: "RS256", use: "sig" } }
}

const b64url = (bytes: Uint8Array) => {
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}
const segment = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)))

/** Mint a real, signed JWT. `signWith` defaults to the key the header names —
 * hand it another pair to forge. */
async function mintToken(
  pair: Pair,
  claims: Record<string, unknown>,
  header: Record<string, unknown> = {},
  signWith: Pair = pair
): Promise<string> {
  const head = segment({ alg: "RS256", kid: pair.jwk.kid, typ: "JWT", ...header })
  const body = segment(claims)
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signWith.privateKey,
    new TextEncoder().encode(`${head}.${body}`) as BufferSource
  )
  return `${head}.${body}.${b64url(new Uint8Array(signature))}`
}

const NOW = Date.UTC(2026, 7, 11, 12, 0, 0)
const seconds = Math.floor(NOW / 1000)

/** The claims Google actually stamps on a good day. */
const goodClaims = (over: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: CLIENT_ID,
  sub: "104729183746510293847",
  email: "Marta@Bergstrom.example",
  email_verified: true,
  iat: seconds - 30,
  exp: seconds + 3600,
  ...over,
})

/** Assert a refusal, and that it is an ANSWER (a coded GuardError) rather than a
 * crash — this runs on the unauthenticated sign-in door, where a 500 writes a
 * row to the global error log for every attempt. */
async function refusedWith(code: string, token: string, keys: Jwk[]) {
  const thrown = await verifyGoogleIdToken(token, { clientId: CLIENT_ID, keys, now: NOW }).then(
    () => null,
    (e: unknown) => e
  )
  expect(thrown, "the token was ACCEPTED — it must be refused").toBeInstanceOf(GuardError)
  expect((thrown as GuardError).code).toBe(code)
  expect((thrown as GuardError).status).toBe(401)
}

describe("google id token verification", () => {
  let google: Pair
  let forger: Pair
  let keys: Jwk[]

  beforeAll(async () => {
    google = await keyPair(KID)
    // The forger publishes NOTHING; they simply sign with their own key and put
    // Google's kid in the header, hoping nobody checks.
    forger = await keyPair(KID)
    keys = [google.jwk]
  }, 30_000)

  it("accepts a genuine token and takes only the verified email", async () => {
    const identity = await verifyGoogleIdToken(await mintToken(google, goodClaims()), {
      clientId: CLIENT_ID,
      keys,
      now: NOW,
    })
    expect(identity.sub).toBe("104729183746510293847")
    // Lower-cased, so Marta@ and marta@ are one person — the same normalisation
    // the email door applies before it ever mints a code.
    expect(identity.email).toBe("marta@bergstrom.example")
  })

  it("refuses a FORGED SIGNATURE — the right kid, the wrong key", async () => {
    await refusedWith(
      "bad_signature",
      await mintToken(google, goodClaims(), {}, forger),
      keys
    )
  })

  it("refuses a token whose payload was edited after signing", async () => {
    // The exact attack the signature exists to stop: take a real token for a
    // stranger's own Google account and swap in the address they want to be.
    const real = await mintToken(google, goodClaims({ email: "stranger@example.net" }))
    const [head, , sig] = real.split(".")
    const tampered = `${head}.${segment(goodClaims({ email: "owner@kwapso.app" }))}.${sig}`
    await refusedWith("bad_signature", tampered, keys)
  })

  it("refuses a WRONG AUDIENCE — a token minted for another Google app", async () => {
    await refusedWith(
      "bad_audience",
      await mintToken(google, goodClaims({ aud: "999-someone-else.apps.googleusercontent.com" })),
      keys
    )
  })

  it("refuses an EXPIRED token", async () => {
    await refusedWith("expired_token", await mintToken(google, goodClaims({ exp: seconds - 120 })), keys)
  })

  it("refuses a MISMATCHED ISSUER, including one that merely contains Google's", async () => {
    await refusedWith("bad_issuer", await mintToken(google, goodClaims({ iss: "https://evil.example" })), keys)
    // THE REGRESSION THIS FILE EXISTS FOR. The deleted June version tested the
    // issuer with `.includes("accounts.google.com")`, which this string passes.
    await refusedWith(
      "bad_issuer",
      await mintToken(google, goodClaims({ iss: "https://accounts.google.com.evil.example" })),
      keys
    )
  })

  it("refuses an UNVERIFIED Google email — the claim the whole path rests on", async () => {
    await refusedWith("email_unverified", await mintToken(google, goodClaims({ email_verified: false })), keys)
    await refusedWith("email_unverified", await mintToken(google, goodClaims({ email: "" })), keys)
  })

  it("refuses an algorithm downgrade and an unsigned token", async () => {
    await refusedWith("bad_algorithm", await mintToken(google, goodClaims(), { alg: "none" }), keys)
    await refusedWith("bad_algorithm", await mintToken(google, goodClaims(), { alg: "HS256" }), keys)
  })

  it("refuses a key Google does not publish", async () => {
    const other = await keyPair("some-other-kid")
    await refusedWith("unknown_key", await mintToken(other, goodClaims()), keys)
  })

  it("refuses rubbish without crashing", async () => {
    await refusedWith("malformed_token", "not-a-token", keys)
    await refusedWith("malformed_token", "aaa.bbb.ccc", keys)
  })

  it("refuses a GARBAGE SIGNATURE as an answer, not as a 500", async () => {
    // Found by reviewing this file against itself: the signature segment is
    // decoded OUTSIDE any JSON guard, so an unpaddable, non-base64 third part
    // behind a perfectly good header used to escape as a raw DOMException — a
    // 500 and a GLOBAL error-log row per attempt, on a door anyone can call.
    // A real header naming Google's real kid is what makes it reachable.
    const real = await mintToken(google, goodClaims())
    const [head, body] = real.split(".")
    await refusedWith("malformed_token", `${head}.${body}.!!!not base64!!!`, keys)
    // …and an EMPTY signature is not "unreadable" — it is perfectly good base64
    // for zero bytes, which is a signature that simply doesn't verify. Written
    // down because the first draft of this test asserted the wrong one, and a
    // refusal that blames the wrong thing sends someone hunting a phantom.
    await refusedWith("bad_signature", `${head}.${body}.`, keys)
  })
})

describe("the two front doors", () => {
  const env = {
    APP_ORIGIN: "https://agency.kwapso.app",
    PORTAL_ORIGIN: "https://client.kwapso.app",
  } as Env

  it("bounces back only to an origin we named", () => {
    const at = (url: string) => resolveFrontDoor(env, new Request(url))
    expect(at("https://agency.kwapso.app/api/auth/google/start")).toBe("https://agency.kwapso.app")
    expect(at("https://client.kwapso.app/api/auth/google/start")).toBe("https://client.kwapso.app")
    // An open redirect that hands out a session cookie is the failure this
    // prevents — including from a hostname that merely looks like ours.
    expect(at("https://agency.kwapso.app.evil.example/api/auth/google/start")).toBeNull()
    expect(at("https://portal.kwapso.app/api/auth/google/start")).toBeNull()
  })

  it("names both callbacks — these are the two URIs Google must have registered", () => {
    expect(frontDoors(env).map(googleRedirectUri)).toEqual([
      "https://agency.kwapso.app/api/auth/google/callback",
      "https://client.kwapso.app/api/auth/google/callback",
    ])
  })

  it("offers no Google door until BOTH halves of the credential are set", () => {
    expect(googleCredentials({ ...env } as Env)).toBeNull()
    expect(googleCredentials({ ...env, GOOGLE_CLIENT_ID: "id" } as Env)).toBeNull()
    expect(googleCredentials({ ...env, GOOGLE_CLIENT_SECRET: "shh" } as Env)).toBeNull()
    expect(googleCredentials({ ...env, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "shh" } as Env)).toEqual({
      clientId: "id",
      clientSecret: "shh",
    })
  })
})

describe("one person, two ways in", () => {
  /** The real core database, real migrations — the same helper the throttle
   * suites use, because what is being tested is what the UNIQUE index does.
   * 0003 is applied deliberately: it is the migration that DROPPED google_sub,
   * and the point of this block is that the identity survives without it. */
  function coreDb() {
    const db = new DatabaseSync(":memory:")
    db.exec(migration("0001_core_auth.sql"))
    db.exec(migration("0002_teams.sql"))
    db.exec(migration("0003_remove_google.sql"))
    return { DB: d1(db) } as unknown as Env
  }

  /** What the CODE door does to an address before the seam ever sees it. The
   * Google path has to arrive at the same string or the two make two rows —
   * which is why verifyGoogleIdToken lower-cases, and why this suite spells the
   * Google address with capitals. */
  const asTheCodeDoorWouldStoreIt = (raw: string) => normalizeEmail(raw)

  it("a code yesterday and Google today is ONE user row", async () => {
    const env = coreDb()
    const google = await keyPair(KID)

    // Monday: they type a six-digit code. emailVerify's exact two lines.
    const byCode = await findOrCreateUserByEmail(
      env,
      asTheCodeDoorWouldStoreIt("marta@bergstrom.example")
    )
    expect(byCode.isNew).toBe(true)

    // Tuesday: they click Continue with Google — and Google spells their address
    // with capitals, as it really does. The callback hands the SAME seam the
    // address the ASSERTION carried; there is no second identity path.
    const identity = await verifyGoogleIdToken(
      await mintToken(google, goodClaims({ email: "Marta@Bergstrom.Example" })),
      { clientId: CLIENT_ID, keys: [google.jwk], now: NOW }
    )
    const byGoogle = await findOrCreateUserByEmail(env, identity.email)

    expect(byGoogle.isNew).toBe(false)
    expect(byGoogle.user.id).toBe(byCode.user.id)
  })

  it("and it converges the other way round too", async () => {
    const env = coreDb()
    const google = await keyPair(KID)
    const identity = await verifyGoogleIdToken(
      await mintToken(google, goodClaims({ email: "Alex@Kwapso.app" })),
      { clientId: CLIENT_ID, keys: [google.jwk], now: NOW }
    )
    const byGoogle = await findOrCreateUserByEmail(env, identity.email)
    const byCode = await findOrCreateUserByEmail(env, asTheCodeDoorWouldStoreIt(" Alex@kwapso.app "))
    expect(byGoogle.isNew).toBe(true)
    expect(byCode.isNew).toBe(false)
    expect(byCode.user.id).toBe(byGoogle.user.id)
  })

  /** THE HALF THE TWO TESTS ABOVE CANNOT REACH. They prove the seam converges;
   * they say nothing about whether the CALLBACK uses it — and "someone writes a
   * second identity path" is exactly the regression the brief names, and exactly
   * what the deleted June file did (findOrCreateUserFromGoogle, keyed on
   * google_sub). The real handler can't be driven here without a live round-trip
   * to Google, so the seam is pinned where every other law in this repo pins
   * one: read the handler's own source off disk. */
  it("the callback resolves its user through the ONE identity seam", () => {
    const src = readFileSync(join(__dirname, "../src/index.ts"), "utf8")
    const at = src.indexOf("async function googleCallback(")
    expect(at, "googleCallback moved — this seam check is now checking nothing").toBeGreaterThan(-1)
    const handler = src.slice(at, src.indexOf("\n}", src.indexOf("catch (e)", at)))

    expect(handler, "the Google callback must go through findOrCreateUserByEmail").toContain(
      "findOrCreateUserByEmail(env, identity.email)"
    )
    // …and `identity` must be what verifyGoogleIdToken returned, not anything the
    // request carried. An email read off the query string would sign anyone in
    // as anyone.
    expect(handler, "the email must come from the VERIFIED assertion").toMatch(
      /const identity = await verifyGoogleIdToken\(/
    )
    // No second identity function anywhere in the worker.
    for (const { source } of sourceFiles(join(__dirname, "..", "src"), { extensions: [".ts"] }))
      expect(
        /findOrCreateUserFrom|createUserFromGoogle|google_sub/.test(source),
        "a second identity path (or a google_sub column) is back — one person must stay one row"
      ).toBe(false)
  })

  it("a Google account nobody invited is a stranger, exactly as the code door leaves them", async () => {
    const env = coreDb()
    // SCOPE ch.06: signing in with Google never creates access; the invite does.
    // So the row it makes is teamless — the same row, and the same "nothing here
    // yet" landing, that a stranger typing a code would get.
    const { user, isNew } = await findOrCreateUserByEmail(env, "nobody@example.net")
    expect(isNew).toBe(true)
    expect(user.current_team_id).toBeNull()
    expect(user.onboarding_completed_at).toBeNull()
  })
})
