// A BUTTON THAT FORGETS IT IS RUNNING WILL BE PRESSED AGAIN.
//
// THE OWNER, 26 Aug 2026: "If I switch pages after I hit the Sync button, but I
// don't reload the app and I come back, the button just shows me 'Bring it in'
// again. That means there is a high possibility that people would launch two
// simultaneous syncs."
//
// "Am I running?" was React state inside each sync button, so leaving the screen
// unmounted the answer while the sweep carried on at the door. These lock the
// three properties the shared registry buys back: the fact outlives the
// component, a second caller JOINS rather than starts, and the flag clears
// itself for everybody when the work settles — including screens that only
// joined and are not in the calling function at all.

import { describe, expect, it } from "vitest"

import { isRunning, runExclusive } from "@shared/web/running-jobs"

/** A promise this test settles by hand, so "while it is running" is a state the
 * assertions can stand in rather than a race they have to win. */
function held<T>() {
  let settle: (v: T) => void = () => {}
  let fail: (e: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    settle = res
    fail = rej
  })
  return { promise, settle, fail }
}

describe("runExclusive — one act, however many buttons", () => {
  it("is running for anyone who asks, not only for the caller", async () => {
    const gate = held<number>()
    const key = "google-calendar:t1"
    expect(isRunning(key)).toBe(false)
    const joined = runExclusive(key, () => gate.promise)
    // THE WHOLE POINT: this is what the button on the OTHER page reads. Nothing
    // that unmounted took the answer with it.
    expect(isRunning(key)).toBe(true)
    gate.settle(7)
    expect(await joined).toBe(7)
    expect(isRunning(key)).toBe(false)
  })

  it("a second press joins the first run instead of starting a second", async () => {
    const gate = held<string>()
    let starts = 0
    const key = "google-knowledge:t1"
    const work = () => {
      starts++
      return gate.promise
    }
    const a = runExclusive(key, work)
    const b = runExclusive(key, work)
    expect(starts, "the second press started a second sweep — twice the quota, twice the writes").toBe(1)
    gate.settle("done")
    expect(await a).toBe("done")
    expect(await b, "the joiner got a different answer from the starter").toBe("done")
  })

  it("different acts do not block each other", async () => {
    const one = held<number>()
    const two = held<number>()
    const a = runExclusive("google-calendar:t2", () => one.promise)
    const b = runExclusive("google-knowledge:t2", () => two.promise)
    expect(isRunning("google-calendar:t2")).toBe(true)
    expect(isRunning("google-knowledge:t2")).toBe(true)
    one.settle(1)
    two.settle(2)
    expect(await Promise.all([a, b])).toEqual([1, 2])
  })

  it("a failed run clears too — the button must not be stuck busy forever", async () => {
    const gate = held<number>()
    const key = "google-calendar:t3"
    const p = runExclusive(key, () => gate.promise)
    expect(isRunning(key)).toBe(true)
    gate.fail(new Error("google said no"))
    await expect(p).rejects.toThrow("google said no")
    expect(isRunning(key), "a sync that failed left the control disabled for the life of the tab").toBe(false)
  })

  it("a synchronous throw leaves nothing behind", async () => {
    const key = "google-knowledge:t4"
    await expect(
      runExclusive(key, () => {
        throw new Error("no team")
      })
    ).rejects.toThrow("no team")
    expect(isRunning(key), "the registry is holding an act that never started").toBe(false)
  })
})

describe("the sync controls read the registry and not their own state", () => {
  // Derived, so a future button that hand-rolls `useState(false)` for "syncing"
  // is caught the day it lands rather than the day somebody double-syncs.
  it("no Google sync control keeps its own busy flag", async () => {
    const { readFileSync } = await import("node:fs")
    const { join, dirname } = await import("node:path")
    const { fileURLToPath } = await import("node:url")
    const HERE = dirname(fileURLToPath(import.meta.url))
    const files = ["../components/google-sync.tsx", "../components/meetings-screen.tsx"]
    for (const f of files) {
      const src = readFileSync(join(HERE, f), "utf8")
      expect(
        /setSyncing/.test(src),
        `${f} still owns a local busy flag — walking off the page will forget the run`
      ).toBe(false)
      expect(src, `${f} must read the shared registry`).toContain("useRunning(")
    }
  })
})
