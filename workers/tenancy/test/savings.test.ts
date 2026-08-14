// THE SAVINGS ARITHMETIC, checked the way a client would check it.
//
// "The numbers stop being believable" is one of the three things the owner named
// as what would make him abandon this and go back to a spreadsheet. So this
// suite is not about coverage — it is the working of the sum, written down, in
// the cases where an honest-looking implementation gets it wrong:
//
//   • a step we REMOVED entirely (the largest saving there is, and the easiest
//     one to report as zero);
//   • a step we ADDED (new work — a regression, and it must not be silently
//     dropped just because it is unflattering);
//   • a step that got SLOWER (the same, on purpose);
//   • a step that runs ZERO times a month (a saving nobody actually gets);
//   • the parts adding up to the total, which is the one thing a person checks
//     with their own eyes before they stop believing the rest of the screen.

import { describe, expect, it } from "vitest"

import {
  SAVINGS_CAPTION,
  savedHours,
  savingsView,
  stepSaving,
  type StepFigures,
} from "@shared/workers/savings"

/** A step, with the two numbers that matter and sensible defaults for the rest. */
function step(over: Partial<StepFigures> & { stepKey: string }): StepFigures {
  return {
    name: over.stepKey,
    baselineSecondsPerRun: 0,
    latestSecondsPerRun: 0,
    runsPerMonth: 0,
    removed: false,
    explained: false,
    ...over,
  }
}

describe("one step's saving is the plain sentence, out loud", () => {
  it("40 minutes became 8, twenty times a month → 10 hours and 40 minutes back", () => {
    const s = stepSaving(step({ stepKey: "check", baselineSecondsPerRun: 2400, latestSecondsPerRun: 480, runsPerMonth: 20 }))
    expect(s.savedSecondsPerRun).toBe(1920)
    expect(s.savedSecondsPerMonth).toBe(38_400)
    expect(savedHours(s.savedSecondsPerMonth)).toBe(10.7)
    expect(s.regression).toBe(false)
  })

  // THE ONE AN HONEST-LOOKING IMPLEMENTATION GETS WRONG. Work we removed
  // entirely is the biggest saving a client ever gets, and a model that dropped
  // the row (or zeroed its frequency with its duration) would report NOTHING for
  // it. The cut carries a removed step forward with its frequency intact and its
  // time at zero, so the plain sentence keeps being true.
  it("work we stopped doing altogether saves ALL of it, not none of it", () => {
    const s = stepSaving(
      step({ stepKey: "rekey", baselineSecondsPerRun: 900, latestSecondsPerRun: 0, runsPerMonth: 40, removed: true })
    )
    expect(s.savedSecondsPerMonth).toBe(36_000)
    expect(savedHours(s.savedSecondsPerMonth)).toBe(10)
    expect(s.regression).toBe(false)
  })

  it("a step that got SLOWER is a negative saving, and says so", () => {
    const s = stepSaving(step({ stepKey: "approve", baselineSecondsPerRun: 300, latestSecondsPerRun: 900, runsPerMonth: 10 }))
    expect(s.savedSecondsPerMonth).toBe(-6000)
    expect(s.regression).toBe(true)
  })

  it("NEW work — a step with no baseline — is a regression, never a free zero", () => {
    const s = stepSaving(step({ stepKey: "review", baselineSecondsPerRun: 0, latestSecondsPerRun: 600, runsPerMonth: 4 }))
    expect(s.savedSecondsPerMonth).toBe(-2400)
    expect(s.regression).toBe(true)
  })

  // A step that is slower but never runs costs nobody anything, and flagging it
  // would spend a client's attention on nothing. `toBe(0)` rather than a loose
  // equality on purpose: this case multiplies out to NEGATIVE zero, which every
  // arithmetic check treats as zero and `toLocaleString` renders as "-0" — so
  // the screen whose whole job is being believable would have shown a client
  // "-0 hours a month". Found by this line, fixed in the arithmetic.
  it("a step that never runs saves nothing, and not NEGATIVE nothing", () => {
    const s = stepSaving(step({ stepKey: "annual", baselineSecondsPerRun: 60, latestSecondsPerRun: 6000, runsPerMonth: 0 }))
    expect(s.savedSecondsPerMonth).toBe(0)
    expect(Object.is(s.savedSecondsPerMonth, -0), "a screen would render -0 as \"-0\"").toBe(false)
    expect(s.regression).toBe(false)
  })

  // A step present in only ONE version comes back from the join with a null on
  // the other side. `null - 3` is NaN, and NaN spreads silently all the way to
  // the figure at the top of the screen.
  it("a missing side is zero seconds, never NaN", () => {
    const s = stepSaving(
      step({ stepKey: "gap", baselineSecondsPerRun: null as never, latestSecondsPerRun: 300, runsPerMonth: 2 })
    )
    expect(Number.isFinite(s.savedSecondsPerMonth)).toBe(true)
    expect(s.savedSecondsPerMonth).toBe(-600)
  })
})

describe("the drill-down: App → Process → Step, and the parts add up", () => {
  const view = savingsView([
    {
      appId: "app_dispatch",
      name: "Dispatch",
      processes: [
        {
          processId: "p_invoice",
          name: "Approving an invoice",
          steps: [
            step({ stepKey: "check", baselineSecondsPerRun: 2400, latestSecondsPerRun: 480, runsPerMonth: 20 }),
            step({ stepKey: "rekey", baselineSecondsPerRun: 900, latestSecondsPerRun: 0, runsPerMonth: 40, removed: true }),
            step({ stepKey: "approve", baselineSecondsPerRun: 300, latestSecondsPerRun: 900, runsPerMonth: 10 }),
          ],
        },
        {
          processId: "p_dispatch",
          name: "Dispatching a driver",
          steps: [step({ stepKey: "call", baselineSecondsPerRun: 600, latestSecondsPerRun: 60, runsPerMonth: 100 })],
        },
      ],
    },
    {
      appId: "app_office",
      name: "Back office",
      processes: [
        {
          processId: "p_report",
          name: "The monthly report",
          steps: [step({ stepKey: "compile", baselineSecondsPerRun: 7200, latestSecondsPerRun: 1800, runsPerMonth: 1 })],
        },
      ],
    },
  ])

  it("a process totals its own steps", () => {
    const invoice = view.apps[0].processes.find((p) => p.processId === "p_invoice")
    // 38,400 saved + 36,000 saved − 6,000 lost.
    expect(invoice?.savedSecondsPerMonth).toBe(68_400)
  })

  it("an app totals its own processes, and the whole view totals the apps", () => {
    const byApp = Object.fromEntries(view.apps.map((a) => [a.appId, a.savedSecondsPerMonth]))
    expect(byApp.app_dispatch).toBe(68_400 + 54_000)
    expect(byApp.app_office).toBe(5400)
    expect(view.savedSecondsPerMonth).toBe(68_400 + 54_000 + 5400)
  })

  // THE ONE A PERSON CHECKS WITH THEIR OWN EYES. If the rounding happened at
  // every level, three steps of 0.4 hours would be a process of "1.2" beside an
  // app of "1.0" — and a figure whose own parts disagree is the exact shape of
  // an unbelievable number.
  it("the hours shown add up: every step, every process, every app, the total", () => {
    for (const app of view.apps) {
      const fromProcesses = app.processes.reduce((n, p) => n + p.savedSecondsPerMonth, 0)
      expect(app.savedSecondsPerMonth).toBe(fromProcesses)
      for (const process of app.processes)
        expect(process.savedSecondsPerMonth).toBe(
          process.steps.reduce((n, s) => n + s.savedSecondsPerMonth, 0)
        )
    }
    expect(view.savedSecondsPerMonth).toBe(view.apps.reduce((n, a) => n + a.savedSecondsPerMonth, 0))
  })

  it("the biggest saving comes first — it is the one they ask about", () => {
    expect(view.apps.map((a) => a.appId)).toEqual(["app_dispatch", "app_office"])
    expect(view.apps[0].processes.map((p) => p.processId)).toEqual(["p_invoice", "p_dispatch"])
  })

  // NO FILTER HIDES A REGRESSION — not from the list and not from the total.
  // "Build the attachment; do not build a filter that hides them" (BUILD-3 §3).
  it("a step that got slower is still in the list, and still in the total", () => {
    const invoice = view.apps[0].processes.find((p) => p.processId === "p_invoice")
    const slower = invoice?.steps.find((s) => s.stepKey === "approve")
    expect(slower, "the regression must still be a row").toBeDefined()
    expect(slower?.regression).toBe(true)
    // Its 6,000 lost seconds are subtracted from the process, not quietly dropped.
    expect(invoice?.savedSecondsPerMonth).toBe(38_400 + 36_000 - 6000)
  })

  // R25 — the caption travels WITH the number, from the one place it is written.
  it("every view carries the caption that makes it honest", () => {
    expect(view.caption).toBe(SAVINGS_CAPTION)
    expect(SAVINGS_CAPTION).toContain("estimates")
    expect(SAVINGS_CAPTION).toContain("arithmetic")
  })
})
