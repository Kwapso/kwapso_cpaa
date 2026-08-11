// A THREAD THAT READS LIKE A CONVERSATION — the scroll half.
//
// The portal appended replies at the bottom and never moved the view: you opened
// a request with a dozen replies, landed on the oldest, and sent a reply into a
// part of the page you couldn't see (owner, staging, Aug 2026).
//
// Two halves, and the second is the one that is easy to get wrong. Following the
// newest message is trivial; NOT following it while someone is reading history
// is the part both library thread components get wrong (Chat and Comments both
// set scrollTop = scrollHeight on every change). So the decision is a named
// function with its own cases, and the hook is mounted for real — a source scan
// would pass just as happily on a hook that decided correctly and then scrolled
// anyway.
//
// No testing-library: the portal declares react + react-dom and nothing else,
// and a hook probe is a dozen lines of createRoot.

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FOLLOW_SLACK, shouldFollow, useFollowNewest } from "@shared/web/follow-newest"

describe("shouldFollow — when the view moves, and when it must not", () => {
  const at = (o: Partial<Parameters<typeof shouldFollow>[0]>) =>
    shouldFollow({ first: false, mine: false, nearBottom: false, ...o })

  it("lands on the newest message when the thread first opens", () => {
    expect(at({ first: true })).toBe(true)
  })

  it("follows a reply you just sent, even from the top of a long thread", () => {
    expect(at({ mine: true })).toBe(true)
  })

  it("follows anything new if you were already at the end", () => {
    expect(at({ nearBottom: true })).toBe(true)
  })

  it("LEAVES YOU ALONE when someone else replies while you're reading history", () => {
    // The whole reason this is a function. A live reply from the agency must not
    // yank a client who has scrolled up to re-read what they asked for.
    expect(at({})).toBe(false)
  })
})

describe("useFollowNewest — the hook actually moves the page", () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null
  let scrollTo: ReturnType<typeof vi.fn>

  /** Pretend the page is longer than the window, and say where we're parked. */
  function pageAt(scrollY: number, scrollHeight = 5000, innerHeight = 800) {
    Object.defineProperty(document.documentElement, "scrollHeight", {
      value: scrollHeight,
      configurable: true,
    })
    Object.defineProperty(window, "innerHeight", { value: innerHeight, configurable: true })
    Object.defineProperty(window, "scrollY", { value: scrollY, configurable: true })
  }

  function Probe({ id, mine }: { id: string | null; mine: boolean }) {
    useFollowNewest(id, mine)
    return null
  }

  async function show(id: string | null, mine = false) {
    await act(async () => {
      root?.render(React.createElement(Probe, { id, mine }))
    })
  }

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    scrollTo = vi.fn()
    Object.defineProperty(window, "scrollTo", { value: scrollTo, configurable: true })
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    pageAt(0)
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    host?.remove()
    root = null
  })

  it("does nothing while the thread is still loading", async () => {
    await show(null)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it("jumps to the end when the thread arrives — instantly, not as an animation", async () => {
    await show("m1")
    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo.mock.calls[0][0]).toMatchObject({ top: 5000, behavior: "auto" })
  })

  it("does not re-scroll on a re-render that brought nothing new", async () => {
    await show("m1")
    await show("m1")
    await show("m1")
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })

  it("does not re-scroll when only WHO wrote the newest message is re-decided", async () => {
    // The test above is carried by the dep array; this one is carried by the id
    // guard, and they are not the same claim. help-detail derives `mine` from a
    // prop that can arrive after the thread does, so the flag flips under a
    // message id that never changed. That is a re-decision about an old message,
    // not a new message, and it must not move the page again.
    await show("m1", false)
    await show("m1", true)
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })

  it("FOLLOWS AN APPENDED MESSAGE, and glides so you see it arrive", async () => {
    await show("m1")
    pageAt(4200) // they were at the end
    await show("m2")
    expect(scrollTo).toHaveBeenCalledTimes(2)
    expect(scrollTo.mock.calls[1][0]).toMatchObject({ behavior: "smooth" })
  })

  it("follows the reply YOU send, from wherever you are", async () => {
    await show("m1")
    pageAt(0) // scrolled right back up
    await show("mine", true)
    expect(scrollTo).toHaveBeenCalledTimes(2)
  })

  it("does NOT follow someone else's reply while you're reading history", async () => {
    await show("m1")
    pageAt(0) // 5000 - 0 - 800 = 4200 from the end
    await show("m2")
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })

  it("counts a hair off the bottom as still being at the end", async () => {
    await show("m1")
    pageAt(5000 - 800 - (FOLLOW_SLACK - 1))
    await show("m2")
    expect(scrollTo).toHaveBeenCalledTimes(2)
  })
})
