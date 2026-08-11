// The data door's failure behavior: retries on server blips, fails fast on
// our own mistakes (4xx), surfaces clean errors.
import { afterEach, describe, expect, it, vi } from "vitest"

import { d1ListDatabases, d1Query } from "@shared/workers/d1-rest"
import { D1_LIST_PAGE_CAP } from "@shared/workers/limits"

const CFG = { accountId: "acct", apiToken: "tok" }

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

afterEach(() => vi.unstubAllGlobals())

describe("d1 REST door", () => {
  it("retries a 500 and succeeds on the next attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, {}))
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, errors: [], result: [{ results: [{ ok: 1 }] }] })
      )
    vi.stubGlobal("fetch", fetchMock)

    const rows = await d1Query(CFG, "db1", "SELECT 1")
    expect(rows).toEqual([{ ok: 1 }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("does NOT retry a 4xx (our request is wrong) and reports the message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        success: false,
        errors: [{ code: 7500, message: "no such table: nope" }],
        result: null,
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(d1Query(CFG, "db1", "SELECT * FROM nope")).rejects.toThrow(
      "no such table"
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("gives up after exhausting retries on persistent 5xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(503, {}))
    vi.stubGlobal("fetch", fetchMock)

    await expect(d1Query(CFG, "db1", "SELECT 1")).rejects.toThrow("503")
    expect(fetchMock).toHaveBeenCalledTimes(3) // 1 try + 2 retries
  })

  // The database listing pages until a SHORT page says "that's all". An upstream
  // that always answers with a full page — a paging bug, a `page` parameter it
  // quietly ignores — used to spin that loop forever, growing an array until the
  // worker died. This is that upstream. If the ceiling is gone, this test hangs
  // rather than fails, which is exactly the production symptom.
  it("stops at the page ceiling when the API never returns a short page", async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({
      uuid: `u${i}`,
      name: `team-${i}`,
      file_size: 1,
    }))
    // A FRESH Response per call — a single shared one can only be read once.
    const fetchMock = vi
      .fn()
      .mockImplementation(() => jsonResponse(200, { success: true, errors: [], result: fullPage }))
    vi.stubGlobal("fetch", fetchMock)

    const all = await d1ListDatabases(CFG)
    expect(fetchMock).toHaveBeenCalledTimes(D1_LIST_PAGE_CAP)
    expect(all.length).toBe(D1_LIST_PAGE_CAP * 100)
  })

  it("still stops early on a short page (the normal, complete answer)", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        jsonResponse(200, { success: true, errors: [], result: [{ uuid: "u1", name: "team-1", file_size: 1 }] })
      )
    vi.stubGlobal("fetch", fetchMock)

    expect((await d1ListDatabases(CFG)).length).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
