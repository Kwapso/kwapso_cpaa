// A STALE TAB HEALS ITSELF, AND SAYS SO.
//
// Earned on 2026-08-17, on staging, three rows in `error_logs` forty seconds
// apart: `Loading chunk 67631 failed.`, place `ErrorBoundary`, all three on
// `/apps/01KZXD6DQZSEYS5D39QHHDAM9T`, the middle one with a hand-typed `?v=2`
// on the URL. That query string is the whole bug report — it is what somebody
// does when an app is broken, reloading has not helped, and they are trying to
// out-think the cache.
//
// The app SHIPPED a guard for exactly this (`version-watch.tsx`) and the guard
// never fired, because it was listening to `window.onerror` and
// `unhandledrejection` while the failure arrives through React's RENDER phase —
// a lazy route's import rejects, React consumes the rejection, and neither
// event is ever dispatched. The ErrorBoundary is the only thing in the tree
// that sees it, and all it did was print the chunk id at a manager.
//
// So the invariant is not "chunk errors are handled". It is: THE ONE THING THAT
// SEES A STALE SHELL HANDS IT TO THE ONE THING THAT HEALS IT — and having done
// so, never spins.

import { cleanup, render, screen } from "@testing-library/react"
import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The reporter is the seam, not the subject: silence the beacon so the test is
// about the reload, and assert the crash still LEAVES a row.
const reported = vi.fn()
vi.mock("@shared/web/log", () => ({ reportError: (...a: unknown[]) => reported(...a) }))

import { ErrorBoundary } from "@/components/error-boundary"

const reload = vi.fn()

/** A component that throws on render — the only honest way to reach a React
 * error boundary, which cannot be triggered from outside the render phase. */
function Throws({ error }: { error: Error }): React.ReactNode {
  throw error
}

function chunkError(): Error {
  const e = new Error("Loading chunk 67631 failed.")
  e.name = "ChunkLoadError"
  return e
}

beforeEach(() => {
  reload.mockClear()
  reported.mockClear()
  sessionStorage.clear()
  // jsdom's own Location refuses to have `reload` redefined on it, so the whole
  // object is stood in for. Nothing under test reads anything else off it.
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { reload, href: "https://agency.kwapso.app/apps/01KZXD6DQZSEYS5D39QHHDAM9T" },
  })
  // React shouts about every caught render error; the noise is not the test.
  vi.spyOn(console, "error").mockImplementation(() => {})
})

// No global setup file in this workspace, so the tree has to be taken down by
// hand — otherwise the next test queries two boundaries and finds both.
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("a stale shell reaching for a deploy that is gone", () => {
  // SABOTAGE: delete the `healStaleShell(error)` line from componentDidCatch →
  //   × replaces the tab instead of showing the crash
  //     AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
  it("replaces the tab instead of showing the crash", () => {
    render(
      <ErrorBoundary>
        <Throws error={chunkError()} />
      </ErrorBoundary>
    )
    expect(reload).toHaveBeenCalledTimes(1)
    // …and it still left a row. A self-healing failure that reports nothing is
    // a deploy problem nobody can count.
    expect(reported).toHaveBeenCalledTimes(1)
  })

  // SABOTAGE: drop the isStaleShellError branch from render() →
  //   × says a new version is ready, not a chunk id
  //     TestingLibraryElementError: Unable to find an element with the text:
  //     A new version of the app is ready.
  it("says a new version is ready, not a chunk id", () => {
    render(
      <ErrorBoundary>
        <Throws error={chunkError()} />
      </ErrorBoundary>
    )
    expect(screen.getByText("A new version of the app is ready.")).toBeTruthy()
    expect(screen.queryByText(/Loading chunk/)).toBeNull()
    // The way out is still there for the cooldown case, where nothing reloaded.
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy()
  })

  // SABOTAGE: drop the cooldown check from healStaleShell (which is what the
  // old flag amounted to, since the fresh load cleared it before reaching the
  // route that was still broken) →
  //   × having reloaded once, does not spin
  //     AssertionError: expected "vi.fn()" to be called 1 times, but got 2 times
  it("having reloaded once, does not spin", () => {
    const first = render(
      <ErrorBoundary>
        <Throws error={chunkError()} />
      </ErrorBoundary>
    )
    expect(reload).toHaveBeenCalledTimes(1)
    first.unmount()

    // The fresh shell hit the same wall. Reloading again would be a loop, and a
    // loop is the one failure worse than the crash card.
    render(
      <ErrorBoundary>
        <Throws error={chunkError()} />
      </ErrorBoundary>
    )
    expect(reload).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy()
  })

  it("leaves an ordinary render error exactly as it was", () => {
    render(
      <ErrorBoundary label="the apps list">
        <Throws error={new Error("account_id is not defined")} />
      </ErrorBoundary>
    )
    // No reload — a bug in a screen is not healed by fetching the screen again.
    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByText("account_id is not defined")).toBeTruthy()
    expect(screen.getByText(/Something broke in the apps list/)).toBeTruthy()
  })
})
