// A BLANK WHERE A NUMBER SHOULD BE IS THE BUG.
//
// The owner opened an app's Value tab: "I did open it, and I was able to see
// hours, but I was not able to see money given back." The money was on screen —
// it said 0.00 — and nothing said why, or what to do about it. The chain the
// figure hangs on is process → role → rate, and any of the three links can be
// missing, so the screen has to name WHICH one and offer the door to it.
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
  roleName: null,
  savedSecondsPerMonth: 36000,
  centsPerHour: null,
  moneyCentsPerMonth: null,
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
  it("names the FIRST link when a map has no role on it", () => {
    show({})
    expect(screen.getByText(/no role attached, so there is no rate to price/i)).toBeTruthy()
    // …and the way to close it: the map itself, by name.
    expect(screen.getByRole("button", { name: /Invoice approval/ })).toBeTruthy()
  })

  it("names the SECOND link, and the role, when nobody has priced it", () => {
    show({
      lines: [line({ processId: "p-1", roleName: "Bookkeeper" })],
    })
    // The ROLE, not a count. "Bookkeeper has no rate" is a sentence somebody can
    // act on; "1 process is unpriced" is one they have to go and investigate.
    // Named twice on purpose — once in the sentence that says what is missing,
    // once on the row it is missing from — so getAllByText, not getByText.
    expect(screen.getByText(/No hourly cost is set for:/)).toBeTruthy()
    expect(screen.getAllByText(/Bookkeeper/).length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: /Price a role/ })).toBeTruthy()
  })

  it("says it even when the total is only PARTLY missing", () => {
    // A partial figure that does not say what it left out reads as the whole
    // answer — the same bug, quieter.
    show({
      moneyCentsPerMonth: 45000,
      lines: [
        line({ processId: "p-1", roleName: "Bookkeeper", centsPerHour: 4500, moneyCentsPerMonth: 45000 }),
        line({ processId: "p-2", name: "Dispatch run" }),
      ],
    })
    expect(screen.getByText(/Part of these hours has no price on it yet/)).toBeTruthy()
    expect(screen.getByRole("button", { name: /Dispatch run/ })).toBeTruthy()
  })

  it("says nothing about missing links when the chain is whole", () => {
    show({
      moneyCentsPerMonth: 45000,
      unpricedProcesses: 0,
      lines: [line({ processId: "p-1", roleName: "Bookkeeper", centsPerHour: 4500, moneyCentsPerMonth: 45000 })],
    })
    expect(screen.queryByText(/no role attached/i)).toBeNull()
    expect(screen.queryByText(/No hourly cost is set/)).toBeNull()
    expect(screen.queryByRole("button", { name: /Price a role/ })).toBeNull()
  })

  it("tells a deliberate zero apart from a broken one", () => {
    // A rate of zero is legal and the door reports it as PRICED, so the panel
    // must not send somebody off to fix a chain that is already whole. The row
    // says the price is nothing, and the fix-it block stays away.
    show({
      unpricedProcesses: 0,
      lines: [line({ processId: "p-1", roleName: "Volunteer", centsPerHour: 0, moneyCentsPerMonth: 0 })],
    })
    expect(screen.getByText(/priced at nothing/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Price a role/ })).toBeNull()
  })

  it("still renders the hours, the money and R25's caption in every state", () => {
    show({})
    expect(screen.getByText(/Hours given back, every month/)).toBeTruthy()
    expect(screen.getByText(/What those hours are worth/)).toBeTruthy()
    expect(screen.getByText(/The subtraction is arithmetic/)).toBeTruthy()
  })
})
