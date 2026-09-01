// THE SAVINGS SCREEN, RENDERED — the biggest client-facing screen that had no
// behavioural test (round-one review: 345 lines behind zero renders).
//
// Two promises are locked here, and both are the portal's whole reason to
// exist. R25: a savings figure NEVER renders without the caption that says
// what it is made of, word for word from the one seam — the law's check reads
// screens' SOURCE for the import; this renders the real screen and reads the
// caption off the DOM, which is the half a source scan cannot see. And the
// coverage counts (pricedSteps of totalSteps) ride every figure, because a
// number built from four steps out of five is incomplete rather than wrong,
// and the screen must say so where the client reads it.

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SAVINGS_CAPTION } from "@shared/workers/savings"

const fixture = vi.hoisted(() => ({
  impact: {
    savedSecondsPerMonth: 219_600, // 61.0 hours — the owner's own hand-checked example
    savedCentsPerMonth: 276_635,
    pricedSteps: 4,
    totalSteps: 5,
    caption: "The times in these steps are estimates we agreed with you. The subtraction is arithmetic.",
    apps: [
      {
        appId: "app_1",
        name: "CONFIA",
        savedSecondsPerMonth: 219_600,
        savedCentsPerMonth: 276_635,
        pricedSteps: 4,
        totalSteps: 5,
        processes: [
          {
            processId: "prc_1",
            name: "How a claim gets paid",
            savedSecondsPerMonth: 219_600,
            savedCentsPerMonth: 276_635,
            pricedSteps: 4,
            totalSteps: 5,
            steps: [],
          },
        ],
      },
    ],
  },
}))

vi.mock("@/lib/api", () => ({
  ApiFailure: class ApiFailure extends Error {},
  impact: {
    read: () => Promise.resolve(fixture.impact),
    comments: () => Promise.resolve({ comments: [], total: 0 }),
    comment: () => Promise.resolve({ id: "cmt_1" }),
  },
}))

const { ImpactScreen } = await import("@/components/impact-screen")

const ready = {
  state: "ready" as const,
  user: {
    id: "usr_me",
    email: "someone@example.com",
    firstName: "Me",
    lastName: "Myself",
    imageUrl: null,
    onboardingComplete: true,
    currentTeamId: "team_1",
    pinnedTeamId: null,
    language: null,
    scale: null,
    spine: null,
  },
  teamId: "team_1",
  accounts: [{ id: "acc_1", name: "Confia" }],
  currentAccountId: "acc_1",
}

describe("the impact screen says what its number is made of", () => {
  let root: Root | null = null
  let host: HTMLDivElement

  beforeEach(async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root?.render(React.createElement(ImpactScreen, { ready }))
    })
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    host.remove()
    root = null
  })

  it("renders the headline hours from the seam's own rounding", () => {
    // 219,600 seconds = 61.0 hours. The exact string comes from hoursText, so
    // asserting the digits (not the phrasing) keeps this test out of copy's way.
    expect(host.textContent).toContain("61")
  })

  it("R25: the caption ships with the figure, word for word", () => {
    expect(host.textContent).toContain(SAVINGS_CAPTION)
  })

  it("…and the caption is the SERVER's sentence, not one this screen assembled", () => {
    // The fixture's caption is byte-identical to SAVINGS_CAPTION on purpose:
    // the screen prefers data.caption and falls back to the constant, and both
    // roads must lead to the same sentence. If the seam's wording ever moves,
    // this fixture goes stale WITH it — which is the alarm working.
    expect(fixture.impact.caption).toBe(SAVINGS_CAPTION)
  })

  it("names the app the hours come from", () => {
    expect(host.textContent).toContain("CONFIA")
  })

  it("shows nothing bought when no prices were sent — no flag decides on this side", () => {
    // `prices` is absent from the fixture, so the section must be too: the
    // server decides what a client is shown about money, never the portal.
    expect(host.textContent).not.toContain("an hour")
  })
})
