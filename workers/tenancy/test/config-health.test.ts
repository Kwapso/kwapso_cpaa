// A WORKER THAT DEPLOYS PERFECTLY AND CANNOT WORK.
//
// On Cloudflare a module-scope throw fails the deploy, so genuine boot failures
// barely exist here. What does exist is the quieter one: every binding wired,
// every route registered, and a secret nobody set on a fresh environment or a
// token rotated at Cloudflare's end and not here. Nothing caught it. Six workers
// answered `GET /api/<worker>/health` with `{ ok: true }` unconditionally, and
// the first signal was somebody's request failing — 1,848 rows of
// `cloud_key_rejected` in the live staging store, out of 5,086.
//
// These hold the two properties that make the answer worth reading: it tells the
// truth about what is missing, and it never says what anything IS.

import { describe, expect, it } from "vitest"

import { configReport, healthBody } from "@shared/workers/config-health"

const REQUIRED = ["DB", "AUTH", "CF_D1_TOKEN", "ALERT_TO"] as const

describe("the health answer tells the truth about configuration", () => {
  it("a fully configured worker is ok and names nothing", () => {
    const env = { DB: {}, AUTH: {}, CF_D1_TOKEN: "tok", ALERT_TO: "a@b.c" }
    expect(configReport(env, REQUIRED)).toEqual({ ok: true, missing: [] })
    expect(healthBody("tenancy", env, REQUIRED).ok).toBe(true)
  })

  it("names what is absent, in the order it was asked for", () => {
    const env = { AUTH: {}, CF_D1_TOKEN: "tok" }
    expect(configReport(env, REQUIRED)).toEqual({ ok: false, missing: ["DB", "ALERT_TO"] })
  })

  it("a CLEARED secret is missing, because an outage does not care which it was", () => {
    // `wrangler secret put` with an empty value, or a var somebody emptied
    // rather than deleted. The worker is just as broken either way, and a check
    // that only looks for `undefined` passes on the half of it that looks tidier.
    const env = { DB: {}, AUTH: {}, CF_D1_TOKEN: "   ", ALERT_TO: "" }
    expect(configReport(env, REQUIRED).missing).toEqual(["CF_D1_TOKEN", "ALERT_TO"])
  })

  it("a BINDING counts as present by existing", () => {
    // D1, R2, a Fetcher, the AI binding: wrangler would have refused the deploy
    // if one were named and absent, so the only question here is whether the env
    // carries it at all. It must not be string-tested — an object is not empty
    // because it has no `trim`.
    expect(configReport({ DB: { prepare() {} } }, ["DB"])).toEqual({ ok: true, missing: [] })
  })

  it("NEVER reports a value, a length or a prefix", () => {
    // A health endpoint is reachable. "CF_D1_TOKEN is missing" is a complete
    // diagnosis and gives an outsider nothing; "CF_D1_TOKEN is 37 characters and
    // starts with abc" is a gift. The whole body is serialised and searched,
    // because the leak that matters is the one somebody adds later to be helpful.
    const secret = "super-secret-token-value-9f2a"
    const body = JSON.stringify(healthBody("tenancy", { CF_D1_TOKEN: secret }, REQUIRED))
    expect(body).not.toContain(secret)
    expect(body).not.toContain(secret.slice(0, 6))
    expect(body).not.toContain(String(secret.length))
    // …and it does still say the useful thing.
    expect(body).toContain("DB")
    expect(body).toContain("ALERT_TO")
  })

  it("an empty requirement list is ok, not a silent pass dressed as a check", () => {
    // A worker that declares nothing required answers ok — which is correct and
    // is exactly why every caller passes a real list. Asserted so that "ok" can
    // never mean "nobody asked" by accident in a suite that reads this.
    expect(configReport({}, [])).toEqual({ ok: true, missing: [] })
    expect(configReport({}, REQUIRED).missing).toHaveLength(REQUIRED.length)
  })
})
