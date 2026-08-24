// ONE KEY, ONE REQUEST IN THE AIR — the third of a screen's requests that was
// the same question, asked again.
//
// THE OWNER'S REPORT, 24 Aug 2026: "the first-time loading of collections and
// details screens is a bit troubling… it's much slower than what was there
// before." Measured against staging that day, a story detail made 27 requests on
// a cold mount, and roughly a third were duplicates — the same cache key fetched
// two, three, four times in one tick because each subscriber checked the CACHE
// (empty) and nothing told it another subscriber was already on its way.
//
// The real ones, from the census:
//   • `useStoryFormOptions` makes six reads to fill a CLOSED dialog's pickers,
//     and is mounted by the stories collection, the story detail and the ticket
//     detail;
//   • the timer bar is mounted twice, one copy hidden with CSS;
//   • the ticket detail re-fetches the very list its host already fetched.
//
// Every duplicate is a full round trip to a worker and back. These lock the fix
// and, more importantly, lock the ONE case where deduping would be wrong.

import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { useCached } from "@shared/web/store"

let n = 0
const freshKey = () => `dedupe-${++n}`

/** A fetcher that counts its calls and only answers when told to, so a test can
 * hold several subscribers in the window that used to cost N requests. */
function deferred<T>(value: T) {
  let release: () => void = () => {}
  const gate = new Promise<void>((r) => (release = r))
  let calls = 0
  return {
    calls: () => calls,
    release,
    fetcher: async () => {
      calls++
      await gate
      return value
    },
  }
}

describe("subscribers arriving together share one request", () => {
  it("three components, one key, ONE fetch", async () => {
    const key = freshKey()
    const d = deferred(["a"])

    const one = renderHook(() => useCached<string[]>(key, d.fetcher))
    const two = renderHook(() => useCached<string[]>(key, d.fetcher))
    const three = renderHook(() => useCached<string[]>(key, d.fetcher))

    // All three are waiting, and only one question went out.
    expect(d.calls(), "the second and third joined the first").toBe(1)

    d.release()
    await waitFor(() => expect(one.result.current.data).toEqual(["a"]))
    await waitFor(() => expect(two.result.current.data).toEqual(["a"]))
    await waitFor(() => expect(three.result.current.data).toEqual(["a"]))
    expect(d.calls()).toBe(1)
  })

  it("every joiner gets the answer, not just the one that asked", async () => {
    const key = freshKey()
    const d = deferred(["shared"])
    const first = renderHook(() => useCached<string[]>(key, d.fetcher))
    const late = renderHook(() => useCached<string[]>(key, d.fetcher))
    d.release()
    await waitFor(() => expect(late.result.current.data).toEqual(["shared"]))
    expect(first.result.current.data).toEqual(["shared"])
  })

  it("a failure reaches every joiner — one request, one error, everybody told", async () => {
    const key = freshKey()
    let calls = 0
    const boom = async () => {
      calls++
      throw new Error("door said no")
    }
    const one = renderHook(() => useCached<string[]>(key, boom))
    const two = renderHook(() => useCached<string[]>(key, boom))

    await waitFor(() => expect(one.result.current.error).toBeTruthy())
    await waitFor(() => expect(two.result.current.error).toBeTruthy())
    expect(calls, "a shared failure is still one trip").toBe(1)
    // …and neither is left spinning, which is the bug this pairs with: a screen
    // that never stops loading looks identical to one that is merely slow.
    expect(one.result.current.loading).toBe(false)
    expect(two.result.current.loading).toBe(false)
  })

  it("the window CLOSES — a later mount asks again rather than joining a finished request", async () => {
    const key = freshKey()
    let calls = 0
    const fetcher = async () => {
      calls++
      return ["v" + calls]
    }
    const first = renderHook(() => useCached<string[]>(key, fetcher))
    await waitFor(() => expect(first.result.current.data).toEqual(["v1"]))
    first.unmount()
    expect(calls).toBe(1)
    // A stale in-flight entry left behind would serve this from a promise that
    // settled long ago and the screen would never see a change again.
    renderHook(() => useCached<string[]>(key, fetcher))
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(1))
  })
})

// ── THE CASE WHERE SHARING WOULD BE A LOST WRITE ─────────────────────────────

describe("a deliberate refresh never joins a request that left before it", () => {
  it("refresh() starts its OWN trip even while one is already in the air", async () => {
    const key = freshKey()
    const d = deferred(["old"])
    const hook = renderHook(() => useCached<string[]>(key, d.fetcher))
    expect(d.calls()).toBe(1)

    // The screen just changed something and wants the truth. Joining the request
    // that departed BEFORE the change would hand back the old row and look
    // exactly like a write that vanished.
    hook.result.current.refresh()
    expect(d.calls(), "a forced load does not join the in-flight one").toBe(2)

    d.release()
    await waitFor(() => expect(hook.result.current.data).toEqual(["old"]))
  })

  it("and it is the FORCED answer that later joiners get", async () => {
    const key = freshKey()
    let calls = 0
    let latest = "first"
    const fetcher = async () => {
      calls++
      return [latest]
    }
    const hook = renderHook(() => useCached<string[]>(key, fetcher))
    await waitFor(() => expect(hook.result.current.data).toEqual(["first"]))

    latest = "second"
    hook.result.current.refresh()
    await waitFor(() => expect(hook.result.current.data).toEqual(["second"]))
    expect(calls).toBe(2)
  })
})
