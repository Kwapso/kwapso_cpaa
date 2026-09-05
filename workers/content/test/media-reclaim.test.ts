// A DELETE MAY NOT TAKE A FILE SOMEBODY ELSE IS STILL USING.
//
// `ownedMediaKey` proves a key belongs to the CALLER — their team, their module,
// one object and not a folder — and that is the right proof for "may this caller
// destroy this?". It is not the whole question. Within one team a module's
// objects all share one prefix, and every module stores its reference in an
// ordinary text column a caller may WRITE. So:
//
//   1. set account B's logo to the `/media/…` path account A is using,
//   2. change B's logo again.
//
// Step 2 supersedes a URL that passes every ownership test, and A's logo is gone.
// Same tenant, no disclosure, an image that 404s — but it is an integrity
// regression the code did not have before anything deleted at all, and it arrived
// WITH the reclaim. The same shape appears inside one row: an account whose logo
// and cover point at one object loses the cover when the logo is replaced.
//
// So the delete asks the DATABASE a second question. These are the answers it
// must give, including the direction it fails in when it cannot ask.

import { afterEach, describe, expect, it, vi } from "vitest"

import { unreferencedKeys } from "@shared/workers/media-reclaim"

const CFG = { accountId: "acct", apiToken: "tok" }

afterEach(() => vi.unstubAllGlobals())

const KEY = "T1/accounts/01J000000000000000000000"
const OTHER = "T1/accounts/01J111111111111111111111"

/** The REST door, answering with whatever rows the fixture wants and recording
 * the statements it was asked. `d1Query` reaches the door through the global
 * `fetch`, which is what every other suite here stubs. */
function door(rows: unknown[], onQuery?: (sql: string, params: unknown[]) => void) {
  vi.stubGlobal("fetch", async (_url: string, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? "{}") as { sql?: string; params?: unknown[] }
    onQuery?.(body.sql ?? "", body.params ?? [])
    return new Response(JSON.stringify({ success: true, errors: [], result: [{ results: rows }] }), {
      status: 200,
    })
  })
  return CFG as never
}

const REFS = [{ table: "accounts", columns: ["logo_url", "cover_url"] }]

describe("a reclaim asks whether anything still points at the object", () => {
  it("keeps a key nothing else names", async () => {
    const out = await unreferencedKeys(door([]), "db1", "/media/", [KEY], REFS)
    expect(out, "nobody is using it, so it is garbage and may go").toEqual([KEY])
  })

  it("DROPS a key another row still names", async () => {
    // The bug this file exists for. One row comes back, so somebody is using it.
    const out = await unreferencedKeys(door([{ hit: 1 }]), "db1", "/media/", [KEY], REFS)
    expect(out, "another record is still pointing at this object").toEqual([null])
  })

  it("matches the stored URL with and without its cache buster", async () => {
    // `storeImageDataUrl` returns `/media/<key>?v=<timestamp>`, so two rows can
    // hold the same object under different `?v=` values. A comparison that only
    // tested the bare URL would find nothing and delete a live file.
    const seen: { sql: string; params: unknown[] }[] = []
    await unreferencedKeys(
      door([], (sql, params) => seen.push({ sql, params })),
      "db1",
      "/media/",
      [KEY],
      REFS
    )
    expect(seen).toHaveLength(1)
    expect(seen[0].params).toContain(`/media/${KEY}`)
    expect(seen[0].params, "the ?v= form has to match too").toContain(`/media/${KEY}?%`)
    // Both columns are asked about, not just the first.
    expect(seen[0].sql).toContain("logo_url")
    expect(seen[0].sql).toContain("cover_url")
  })

  it("uses the module's own base, so an internal key is looked up as one", async () => {
    const seen: unknown[][] = []
    await unreferencedKeys(
      door([], (_sql, params) => seen.push(params)),
      "db1",
      "/media/internal/",
      [KEY],
      REFS
    )
    expect(seen[0]).toContain(`/media/internal/${KEY}`)
  })

  it("FAILS CLOSED — a database it cannot ask means nothing is deleted", async () => {
    // An orphan costs storage; deleting an object somebody is using costs a file.
    // Those are not the same size of mistake, and this is the one place that gets
    // to choose which way to be wrong.
    vi.stubGlobal("fetch", async () => {
      throw new Error("the REST door is unwell")
    })
    const broken = CFG as never
    expect(await unreferencedKeys(broken, "db1", "/media/", [KEY, OTHER], REFS)).toEqual([null, null])
  })

  it("passes nulls through and asks nothing about them", async () => {
    // `ownedMediaKey` already answered "not ours" for those — a pasted external
    // link, a foreign prefix. Re-asking would be a query per non-event.
    let asked = 0
    const out = await unreferencedKeys(
      door([], () => {
        asked++
      }),
      "db1",
      "/media/",
      [null, null],
      REFS
    )
    expect(out).toEqual([null, null])
    expect(asked, "nothing to prove, nothing to ask").toBe(0)
  })
})
