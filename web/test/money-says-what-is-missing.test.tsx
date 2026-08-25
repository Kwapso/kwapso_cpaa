// A BLANK WHERE A NUMBER SHOULD BE IS THE BUG.
//
// The owner opened an app's Value tab: "I did open it, and I was able to see
// hours, but I was not able to see money given back." The money was on screen —
// it said 0.00 — and nothing said why, or what to do about it. Since 25 Aug
// 2026 the money is the ONE savings seam's own step arithmetic (each step's
// saving times the client-role rate frozen onto it — the same figure the map
// shows), so exactly one link can be missing: a map none of whose steps names
// a role. The screen has to name it and offer the door to it, and say partial
// coverage on the row it qualifies.
//
// The door's half is proved against a real database
// (workers/tenancy/test/app-money-chain.test.ts). This is the screen's half: it
// mounts the real panel over each state of the payload and reads what a person
// would actually see. A test that scanned the source for a sentence would pass
// on a sentence rendered inside a branch nobody reaches.

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { AppMoneyBack } from "@shared/types"

const holder = vi.hoisted(() => ({ view: null as AppMoneyBack | null }))

vi.mock("@shared/web/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/web/store")>()
  return { ...actual, useCached: () => ({ data: holder.view, error: undefined }) }
})

import { AppMoneyPanel } from "@/components/app-money-panel"

afterEach(cleanup)

type Line = AppMoneyBack["lines"][number]

const line = (over: Partial<Line> & { processId: string }): Line => ({
  name: "Invoice approval",
  savedSecondsPerMonth: 36000,
  moneyCentsPerMonth: null,
  pricedSteps: 0,
  totalSteps: 3,
  ...over,
})

function show(over: Partial<AppMoneyBack>) {
  holder.view = {
    appId: "app-1",
    savedSecondsPerMonth: 36000,
    moneyCentsPerMonth: 0,
    unpricedProcesses: 1,
    lines: [line({ processId: "p-1" })],
    caption: "The times in these steps are estimates we agreed with you. The subtraction is arithmetic.",
    ...over,
  }
  return render(<AppMoneyPanel appId="app-1" host={{ base: "/t/T" }} />)
}

describe("the Value tab says which link is missing", () => {
  it("names the missing link when a map has no role on any step", () => {
    show({})
    expect(screen.getByText(/no role on any of its steps, so there is no rate to price/i)).toBeTruthy()
    // …and the way to close it: the map itself, by name.
    expect(screen.getByRole("button", { name: /Invoice approval/ })).toBeTruthy()
  })

  it("says partial coverage ON THE ROW, where the number it qualifies is", () => {
    show({
      moneyCentsPerMonth: 45000,
      unpricedProcesses: 0,
      lines: [
        line({ processId: "p-1", moneyCentsPerMonth: 45000, pricedSteps: 4, totalSteps: 9 }),
      ],
    })
    expect(screen.getByText(/4 of 9 steps priced/)).toBeTruthy()
    // Fully-missing is the only thing the fix-it box exists for.
    expect(screen.queryByText(/no role on any of its steps/i)).toBeNull()
  })

  it("says it even when the total is only PARTLY missing", () => {
    // A partial figure that does not say what it left out reads as the whole
    // answer — the same bug, quieter.
    show({
      moneyCentsPerMonth: 45000,
      lines: [
        line({ processId: "p-1", moneyCentsPerMonth: 45000, pricedSteps: 3, totalSteps: 3 }),
        line({ processId: "p-2", name: "Dispatch run" }),
      ],
    })
    expect(screen.getByText(/Part of these hours has no price on it yet/)).toBeTruthy()
    expect(screen.getByRole("button", { name: /Dispatch run/ })).toBeTruthy()
  })

  it("says nothing about missing links when every map is priced", () => {
    show({
      moneyCentsPerMonth: 45000,
      unpricedProcesses: 0,
      lines: [line({ processId: "p-1", moneyCentsPerMonth: 45000, pricedSteps: 3, totalSteps: 3 })],
    })
    expect(screen.queryByText(/no role on any of its steps/i)).toBeNull()
    expect(screen.queryByText(/waiting on/)).toBeNull()
  })

  it("tells a deliberate zero apart from a broken one", () => {
    // A step priced at a rate of zero is legal: the seam reports it PRICED with
    // zero money, so the row shows 0.00 and the fix-it box stays away — the
    // panel must not send somebody off to fix a chain that is already whole.
    show({
      moneyCentsPerMonth: 0,
      unpricedProcesses: 0,
      lines: [line({ processId: "p-1", moneyCentsPerMonth: 0, pricedSteps: 3, totalSteps: 3 })],
    })
    expect(screen.queryByText(/waiting on/)).toBeNull()
    expect(screen.queryByText(/no role on any of its steps/i)).toBeNull()
  })

  it("still renders the hours, the money and R25's caption in every state", () => {
    show({})
    expect(screen.getByText(/Hours given back, every month/)).toBeTruthy()
    expect(screen.getByText(/What those hours are worth/)).toBeTruthy()
    expect(screen.getByText(/The subtraction is arithmetic/)).toBeTruthy()
  })
})
