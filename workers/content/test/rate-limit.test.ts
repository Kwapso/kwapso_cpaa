// THE PER-CALLER CEILING (shared/workers/rate-limit.ts) — and the property that
// matters most is not "does it refuse", it is "does it refuse ONLY when it should".
//
// A rate limiter is the one safety device in this app whose failure mode is worse
// than the thing it prevents. What it prevents is a loop reading a database too
// fast; what a broken one causes, if it fails closed, is every signed-in person
// locked out of a perfectly healthy app. So most of this file is about the ways it
// must NOT refuse: no binding, a throwing binding, a binding that answers slowly
// and then throws. Two tests cover the refusal itself.
//
// The other half is the KEY, which is what makes this per-CALLER rather than
// per-anything-else: it is the resolved user id, never a value off the request, and
// the machine surface's budget is a different key from the app's.

import { describe, expect, it, vi } from "vitest"

import { callerHasBudget, CALLER_REQUESTS_PER_MINUTE, TOO_FAST } from "@shared/workers/rate-limit"
import type { RateLimiter } from "@shared/workers/rate-limit"

/** A limiter that says yes, and remembers every key it was asked about. */
function allows(): { limiter: RateLimiter; keys: string[] } {
  const keys: string[] = []
  return {
    keys,
    limiter: {
      limit: async ({ key }) => {
        keys.push(key)
        return { success: true }
      },
    },
  }
}

const refuses: RateLimiter = { limit: async () => ({ success: false }) }
const broken: RateLimiter = {
  limit: async () => {
    throw new Error("rate limiting service unavailable")
  },
}

describe("the per-caller ceiling: it fails OPEN, every way it can fail", () => {
  it("no binding at all → allowed (an unconfigured environment behaves as before)", async () => {
    // The state every test in this repo runs in, and the state a deployment is in
    // between this code landing and the wrangler binding being added. That gap is
    // exactly why the binding is optional rather than required.
    expect(await callerHasBudget({}, "u1")).toBe(true)
  })

  it("a THROWING binding → allowed, and it says so rather than swallowing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await callerHasBudget({ CALLER_LIMIT: broken }, "u1")).toBe(true)
    // ERROR-HANDLING.md: never swallow. The request succeeded, so the request is
    // not the place to report it — but somebody has to be able to find out that
    // the app has been running without a limiter.
    expect(spy).toHaveBeenCalledTimes(1)
    expect(String(spy.mock.calls[0][0])).toMatch(/fail open/i)
    expect(String(spy.mock.calls[0][0])).toMatch(/rate limiting service unavailable/)
    spy.mockRestore()
  })

  it("a binding that returns nonsense → allowed, not a crash", async () => {
    // Defensive: the platform contract says `{ success }`, and a shape that does
    // not match must not take the app down. `undefined.success` would throw inside
    // the try, which the same catch turns into an allow.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const nonsense = { limit: async () => undefined } as unknown as RateLimiter
    expect(await callerHasBudget({ CALLER_LIMIT: nonsense }, "u1")).toBe(true)
    spy.mockRestore()
  })
})

describe("the per-caller ceiling: it refuses when it genuinely should", () => {
  it("a limiter saying no → refused", async () => {
    expect(await callerHasBudget({ CALLER_LIMIT: refuses }, "u1")).toBe(false)
  })

  it("the sentence a throttled person reads says nothing is lost and waiting fixes it", async () => {
    // A real person meeting this is almost always a stuck page retrying, not
    // somebody clicking — so the message must not read as an accusation, and must
    // not quote a number that means nothing to them.
    expect(TOO_FAST).toMatch(/try again/i)
    expect(TOO_FAST).toMatch(/nothing was lost/i)
    expect(TOO_FAST, "no raw ceiling in a person's message").not.toMatch(/\d/)
  })
})

describe("the per-caller ceiling: what it is keyed on", () => {
  it("the caller's own id — so one person's loop cannot throttle another", async () => {
    const a = allows()
    await callerHasBudget({ CALLER_LIMIT: a.limiter }, "user-alpha")
    await callerHasBudget({ CALLER_LIMIT: a.limiter }, "user-beta")
    expect(a.keys).toEqual(["app:user-alpha", "app:user-beta"])
  })

  it("the machine surface is a DIFFERENT key for the same person", async () => {
    // One JSON-RPC call can become several forwarded door calls, so the endpoint
    // gets its own budget in front of the per-worker ones behind it.
    const a = allows()
    await callerHasBudget({ CALLER_LIMIT: a.limiter }, "u1", "app")
    await callerHasBudget({ CALLER_LIMIT: a.limiter }, "u1", "machine")
    expect(a.keys).toEqual(["app:u1", "machine:u1"])
    expect(new Set(a.keys).size, "two budgets, not one shared between two surfaces").toBe(2)
  })

  it("spends exactly one unit per call — a ceiling is only the number if it counts once", async () => {
    const a = allows()
    for (let i = 0; i < 5; i++) await callerHasBudget({ CALLER_LIMIT: a.limiter }, "u1")
    expect(a.keys).toHaveLength(5)
  })
})

describe("the ceiling itself", () => {
  it("is written down as a number with a reason, not scattered at call sites", () => {
    expect(CALLER_REQUESTS_PER_MINUTE).toBe(600)
  })

  it("matches every wrangler binding, so config and code cannot drift", async () => {
    // The number lives in limits.ts and again in four wrangler files, because the
    // platform reads the config and the code reads the constant. That duplication
    // is unavoidable; going un-noticed is not.
    const { readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    const ROOT = join(__dirname, "..", "..", "..")
    const workers = ["tenancy", "content", "data-ops", "mcp"]
    for (const w of workers) {
      const raw = readFileSync(join(ROOT, "workers", w, "wrangler.jsonc"), "utf8")
      const cfg = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "")) as {
        ratelimits?: { name: string; simple: { limit: number; period: number } }[]
        env?: Record<string, { ratelimits?: { simple: { limit: number; period: number } }[] }>
      }
      const top = cfg.ratelimits?.find((r) => r.name === "CALLER_LIMIT")
      expect(top, `${w} must bind CALLER_LIMIT`).toBeTruthy()
      expect(top?.simple.limit, `${w}'s ceiling must be the one constant`).toBe(CALLER_REQUESTS_PER_MINUTE)
      // 10 or 60 are the only periods the binding accepts, and the constant is
      // named "per minute" — so anything but 60 makes the name a lie.
      expect(top?.simple.period, `${w}'s period must be 60s to match the constant's name`).toBe(60)
      const staging = cfg.env?.staging?.ratelimits?.[0]
      expect(staging, `${w} staging must bind it too — an unlimited staging is not a rehearsal`).toBeTruthy()
      expect(staging?.simple.limit).toBe(CALLER_REQUESTS_PER_MINUTE)
    }
  })

  it("gives each worker its OWN namespace, so budgets are independent", async () => {
    const { readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    const ROOT = join(__dirname, "..", "..", "..")
    const ids = ["tenancy", "content", "data-ops", "mcp"].map((w) => {
      const raw = readFileSync(join(ROOT, "workers", w, "wrangler.jsonc"), "utf8")
      const cfg = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "")) as {
        ratelimits: { namespace_id: string }[]
      }
      return cfg.ratelimits[0].namespace_id
    })
    // A shared namespace would mean a busy Tickets screen spending the allowance
    // the Accounts screen needs — one ceiling across four workers instead of four.
    expect(new Set(ids).size, "four workers, four namespaces").toBe(4)
  })
})

// AND IS IT PLUGGED IN? The tests above prove the seam DECIDES correctly; this one
// proves the decision reaches a request. A limiter nobody calls is the most
// expensive kind of safety device — it passes its own tests forever.
describe("the ceiling is wired into the one chokepoint", () => {
  it("teamContext refuses with a 429 GuardError when the caller is over", async () => {
    vi.resetModules()
    // whoAmI is the auth round trip; the point here is what happens AFTER it.
    vi.doMock("@shared/workers/trace", () => ({ requestId: () => "r1", traceHeaders: () => ({}) }))
    const { teamContext, GuardError } = await import("@shared/workers/gating")
    const env = {
      AUTH: {
        fetch: async () =>
          new Response(JSON.stringify({ user: { id: "u1", email: "a@b.c", name: "Ana", currentTeamId: "t1" } }), {
            headers: { "Content-Type": "application/json" },
          }),
      },
      DB: {
        prepare: () => ({ bind: () => ({ first: async () => ({ role_id: "r1", database_id: "db1" }) }) }),
      },
      CF_ACCOUNT_ID: "acct",
      CF_D1_TOKEN: "tok",
      CALLER_LIMIT: refuses,
    } as unknown as Parameters<typeof teamContext>[1]

    let thrown: unknown
    try {
      await teamContext(new Request("https://x/api/content/help"), env)
    } catch (e) {
      thrown = e
    }
    expect(thrown, "an over-budget caller must be refused").toBeInstanceOf(GuardError)
    expect((thrown as InstanceType<typeof GuardError>).status).toBe(429)
    expect((thrown as InstanceType<typeof GuardError>).message).toBe(TOO_FAST)
  })

  it("…and lets the same caller through when the limiter says yes", async () => {
    vi.resetModules()
    vi.doMock("@shared/workers/trace", () => ({ requestId: () => "r1", traceHeaders: () => ({}) }))
    const { teamContext } = await import("@shared/workers/gating")
    const env = {
      AUTH: {
        fetch: async () =>
          new Response(JSON.stringify({ user: { id: "u1", email: "a@b.c", name: "Ana", currentTeamId: "t1" } }), {
            headers: { "Content-Type": "application/json" },
          }),
      },
      DB: {
        prepare: () => ({ bind: () => ({ first: async () => ({ role_id: "r1", database_id: "db1" }) }) }),
      },
      CF_ACCOUNT_ID: "acct",
      CF_D1_TOKEN: "tok",
      CALLER_LIMIT: allows().limiter,
    } as unknown as Parameters<typeof teamContext>[1]
    const ctx = await teamContext(new Request("https://x/api/content/help"), env)
    expect(ctx.guard.userId).toBe("u1")
    expect(ctx.guard.databaseId).toBe("db1")
  })
})
