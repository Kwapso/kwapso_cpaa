// THE TRANSIENT FAILURE IN A success:false COSTUME.
//
// Cloudflare's D1 REST door sometimes fails ITS OWN way: HTTP 200, success:false,
// error code 7500 "internal error; reference = …". The one data door (d1-rest.ts)
// had a retry loop for 5xx and network blips — and classified 7500 as "our
// request is wrong, fail loudly", so the retry never fired for exactly the
// failure it exists for. On 2026-08-17 the staging error store held 36 of these
// across nine different read doors, every one a single-shot blip that a retry
// would have absorbed.
//
// These tests pin the CLASSIFICATION, which is the part that regressed silently:
// what retries (7500, 5xx), what fails immediately (a real request error), and
// what names itself (a rejected key). Through a stubbed global fetch — the seam
// is the fetch loop, not the network.

import { afterEach, describe, expect, it, vi } from "vitest"

import { d1Query } from "@shared/workers/d1-rest"

const CFG = { accountId: "acct", apiToken: "tok" }

type Reply = { status: number; body: unknown }
function fetchScript(replies: Reply[]): { calls: () => number } {
  let i = 0
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const r = replies[Math.min(i++, replies.length - 1)]
      return new Response(JSON.stringify(r.body), { status: r.status })
    })
  )
  return { calls: () => i }
}

const ok = { status: 200, body: { success: true, errors: [], result: [{ results: [{ n: 7 }] }] } }
const transient7500 = {
  status: 200,
  body: { success: false, errors: [{ code: 7500, message: "internal error; reference = abc123" }], result: null },
}

afterEach(() => vi.unstubAllGlobals())

describe("the D1 REST door's failure classification", () => {
  it("retries a 7500-in-a-200 and succeeds on the next attempt", async () => {
    const s = fetchScript([transient7500, ok])
    const rows = await d1Query<{ n: number }>(CFG, "db1", "SELECT 1")
    expect(rows).toEqual([{ n: 7 }])
    expect(s.calls(), "one blip, one retry — two calls").toBe(2)
  })

  it("gives up after the attempts are spent, with the real message", async () => {
    const s = fetchScript([transient7500])
    await expect(d1Query(CFG, "db1", "SELECT 1")).rejects.toThrow(/internal error; reference/)
    // 1 + RETRIES attempts — if this number changes, the constant moved, which
    // is a decision, not drift.
    expect(s.calls()).toBe(3)
  })

  it("a REAL request error still fails immediately — no retry can fix bad SQL", async () => {
    // The REAL shape, measured live 2026-08-17: D1 answers code 7500 for
    // everything, so the message is the only discriminator. This fixture is the
    // exact wire shape of a bad statement — if the classifier ever goes back to
    // matching the code, this retries and the call count goes red.
    const s = fetchScript([
      {
        status: 200,
        body: { success: false, errors: [{ code: 7500, message: "no such table: nope: SQLITE_ERROR" }], result: null },
      },
    ])
    await expect(d1Query(CFG, "db1", "SELECT * FROM nope")).rejects.toThrow(/no such table/)
    expect(s.calls(), "retrying a caller mistake just repeats it — one call").toBe(1)
  })

  it("a rejected key still names itself immediately (the 2026-08-14 lesson)", async () => {
    const s = fetchScript([
      { status: 401, body: { success: false, errors: [{ code: 10000, message: "Authentication error" }], result: null } },
    ])
    await expect(d1Query(CFG, "db1", "SELECT 1")).rejects.toThrow(/cloud_key_rejected/)
    expect(s.calls(), "a dead token must not be retried into slowness").toBe(1)
  })

  it("a plain 5xx still retries (the branch that always worked)", async () => {
    const s = fetchScript([{ status: 503, body: {} }, ok])
    const rows = await d1Query<{ n: number }>(CFG, "db1", "SELECT 1")
    expect(rows).toEqual([{ n: 7 }])
    expect(s.calls()).toBe(2)
  })
})
