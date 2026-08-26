// READING A PROCESS MAP — the order its steps happen in, and the versions
// underneath it — against a real SQLite database running the real migration.
//
// Both of these were reported by a tester on 17 Aug 2026, and both are about
// BELIEVABILITY rather than convenience. A map's step times are what the savings
// figure on the client's own portal is computed from (R25), and the subtraction
// is the first version minus the latest — so a reader who cannot tell what
// follows what, or cannot open the version being subtracted FROM, cannot check
// the number a client is being shown.
//
//   "Order is unclear."  A step added with no position took position 0, and 0
//   sorts first — so every step typed into the app landed above the whole map
//   and the sequence grew backwards. The seeded maps set an explicit position
//   and looked perfect, which is exactly why it survived.
//
//   "I am missing to see the detail of the old version."  The door only ever
//   returned the LATEST version's steps. Versions were listed and could not be
//   opened.
//
// The third suite is the one that has to stay true for ever: the figure a map's
// own screen shows is the figure the value screen and the portal show, because
// it is the same statement and the same pure function. A second implementation
// of the subtraction — even a correct-looking one — is how "the numbers stop
// being believable" starts.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import { savedHours } from "@shared/workers/savings"
import {
  addStep,
  createProcess,
  cutVersion,
  deleteStep,
  getProcess,
  listProcessSteps,
  listSavings,
  removeStep,
  updateStep,
} from "../src/lib/processes"
import { buildSpineDb, IDS } from "./spine-harness"

const cfg = { accountId: "a", apiToken: "t" } as never
const actor = { id: IDS.staffUser, email: "staff@kwapso.app", name: "Staff" }
const guard = { userId: IDS.staffUser, teamId: IDS.team, roleId: IDS.adminRole, databaseId: "db_team" }
const staff = { kind: "staff" } as const

/** A map whose steps are deliberately NOT in alphabetical order: Collect, Type,
 * Set. Sorted by name they would come back Collect, Set, Type — so any test that
 * passes here is a statement about the sequence somebody entered, not about the
 * alphabet. The times are the ones a client would recognise: half an hour of
 * chasing documents, forty times a month. */
async function mapWithThreeSteps(): Promise<string> {
  const processId = (await createProcess(cfg, guard, staff, actor, {
    appId: IDS.victimApp,
    name: "Taking on a new client",
    description: "How it is done now, and how it was done before.",
    baselineLabel: "Before us",
  })).id
  await addStep(cfg, guard, staff, actor, {
    processId,
    name: "Collect the documents",
    secondsPerRun: 1800,
    runsPerPeriod: 40,
  })
  await addStep(cfg, guard, staff, actor, {
    processId,
    name: "Type them into the system",
    secondsPerRun: 900,
    runsPerPeriod: 40,
  })
  await addStep(cfg, guard, staff, actor, {
    processId,
    name: "Set the renewal reminder",
    secondsPerRun: 300,
    runsPerPeriod: 40,
  })
  return processId
}

beforeEach(() => {
  holder.db = buildSpineDb()
})

describe("the order steps happen in", () => {
  it("a step added with no position goes on the END, not the top", async () => {
    const processId = await mapWithThreeSteps()
    const steps = await listProcessSteps(cfg, guard, staff, processId)
    expect(steps.map((s) => s.name)).toEqual([
      "Collect the documents",
      "Type them into the system",
      "Set the renewal reminder",
    ])
    // …and the positions really are 1, 2, 3 — the order is in the DATA, not an
    // accident of how the rows happened to come back.
    expect(steps.map((s) => s.position)).toEqual([1, 2, 3])
  })

  // THE BUG THIS SUITE WAS WRITTEN FOR. Every step defaulted to position 0, so
  // the read fell through to its name tie-break and a person watched their map
  // sort itself alphabetically as they typed it.
  it("is the sequence somebody entered, never the alphabet", async () => {
    const processId = await mapWithThreeSteps()
    const names = (await listProcessSteps(cfg, guard, staff, processId)).map((s) => s.name)
    expect(names).not.toEqual([...names].sort())
  })

  // A caller who KNOWS where a step goes says so, and is obeyed. This is the
  // half the alphabet used to override: a step explicitly placed at the front
  // still came back wherever its name fell.
  it("puts an explicitly-placed step exactly where it was put", async () => {
    const processId = await mapWithThreeSteps()
    await addStep(cfg, guard, staff, actor, {
      processId,
      // Named to sort LAST alphabetically, placed FIRST — so only the position
      // can be what this assertion is reading.
      name: "Warn the client we need their papers",
      secondsPerRun: 120,
      runsPerPeriod: 40,
      position: 0,
    })
    const names = (await listProcessSteps(cfg, guard, staff, processId)).map((s) => s.name)
    expect(names[0]).toBe("Warn the client we need their papers")
  })
})

describe("opening an older version", () => {
  /** The map, cut, and then made faster — the shape every savings figure in the
   * app is a subtraction across. Version 1 keeps the old times; version 2 gets
   * the new ones, and one step stops happening altogether. */
  async function mapWithTwoVersions(): Promise<{ processId: string; v1: string; v2: string }> {
    const processId = await mapWithThreeSteps()
    const v1 = (await getProcess(cfg, guard, staff, processId)).shownVersionId
    const cut = await cutVersion(cfg, guard, staff, actor, { processId, label: "After us" })
    expect(cut).not.toBeNull()
    const now = await listProcessSteps(cfg, guard, staff, processId)
    const byName = (n: string) => now.find((s) => s.name === n)!
    await updateStep(cfg, guard, staff, actor, byName("Collect the documents").id, {
      name: "Collect the documents",
      secondsPerRun: 300,
      runsPerPeriod: 40,
    })
    await updateStep(cfg, guard, staff, actor, byName("Type them into the system").id, {
      name: "Type them into the system",
      secondsPerRun: 120,
      runsPerPeriod: 40,
    })
    // The app now sets the reminder itself — the whole of that work is gone.
    await removeStep(cfg, guard, staff, actor, byName("Set the renewal reminder").id)
    return { processId, v1, v2: cut!.versionId }
  }

  it("defaults to the current version, exactly as it always did", async () => {
    const { processId, v2 } = await mapWithTwoVersions()
    const detail = await getProcess(cfg, guard, staff, processId)
    expect(detail.shownVersionId).toBe(v2)
    expect(detail.steps.find((s) => s.name === "Collect the documents")?.secondsPerRun).toBe(300)
  })

  // THE THING THE TESTER COULD NOT DO. Version 1's steps, at version 1's times,
  // in version 1's order.
  it("reads the baseline's own steps and its own times", async () => {
    const { processId, v1 } = await mapWithTwoVersions()
    const detail = await getProcess(cfg, guard, staff, processId, { versionId: v1 })
    expect(detail.shownVersionId).toBe(v1)
    expect(detail.steps.map((s) => [s.name, s.secondsPerRun])).toEqual([
      ["Collect the documents", 1800],
      ["Type them into the system", 900],
      ["Set the renewal reminder", 300],
    ])
    // A step we later removed is still HERE, at its old duration — the baseline
    // is what the saving is measured from, so dropping it would report no saving
    // at all for the work we took away entirely.
    expect(detail.steps.find((s) => s.name === "Set the renewal reminder")?.removed).toBe(false)
  })

  // R16 on a screen whose collection changes underneath the badge: the Steps tab
  // counts the version being SHOWN. A badge counting today's steps over version
  // 1's list is the quietly-wrong number the law exists to prevent.
  it("counts the version being shown, not always the latest", async () => {
    const { processId, v1, v2 } = await mapWithTwoVersions()
    // Version 2 grew a step that version 1 never had.
    await addStep(cfg, guard, staff, actor, {
      processId,
      name: "Send the welcome pack",
      secondsPerRun: 60,
      runsPerPeriod: 40,
    })
    expect((await getProcess(cfg, guard, staff, processId, { versionId: v2 })).shownStepCount).toBe(4)
    expect((await getProcess(cfg, guard, staff, processId, { versionId: v1 })).shownStepCount).toBe(3)
  })

  // A version id is a handle on somebody's steps. The account fence would refuse
  // another CLIENT's; this is the clause that refuses another MAP of the same
  // client's, which the fence cannot see the difference of. It must be a refusal
  // and not an empty list — "this version had no steps" is a different and much
  // worse sentence than "no such version".
  it("refuses a version belonging to another map", async () => {
    const mine = await mapWithThreeSteps()
    const theirs = (await createProcess(cfg, guard, staff, actor, {
      appId: IDS.victimApp,
      name: "Another way of working",
    })).id
    const theirVersion = (await getProcess(cfg, guard, staff, theirs)).shownVersionId
    await expect(getProcess(cfg, guard, staff, mine, { versionId: theirVersion })).rejects.toThrow(
      /doesn't exist/
    )
  })
})

// A FROZEN VERSION IS FROZEN AGAINST EVERY WRITE, not just the ones a button
// offered. `updateStep` has always carried the predicate; `removeStep` had not,
// and nothing but the absence of a screen was keeping callers off it — the
// version selector is exactly the screen that would have arrived. The write sets
// a duration to ZERO, so against a baseline it manufactures the largest saving
// the app can report, on the figure a client reads.
describe("an older version cannot be changed", () => {
  it("refuses to record a baseline step as stopped, and says why", async () => {
    const processId = await mapWithThreeSteps()
    const baselineSteps = await listProcessSteps(cfg, guard, staff, processId)
    await cutVersion(cfg, guard, staff, actor, { processId, label: "After us" })

    await expect(
      removeStep(cfg, guard, staff, actor, baselineSteps[0].id)
    ).rejects.toThrow(/older version/)

    // …and the baseline is untouched: the time it was agreed at is still there.
    const stillThere = await getProcess(cfg, guard, staff, processId, {
      versionId: baselineSteps[0].versionId,
    })
    expect(stillThere.steps[0].secondsPerRun).toBe(1800)
    expect(stillThere.steps[0].removed).toBe(false)
  })

  // R17 must survive the new refusal: removing the SAME current step twice is
  // still silence, not an error — nothing is wrong, it is already recorded.
  it("still answers a repeat removal with silence, not a refusal", async () => {
    const processId = await mapWithThreeSteps()
    const steps = await listProcessSteps(cfg, guard, staff, processId)
    expect(await removeStep(cfg, guard, staff, actor, steps[0].id)).toEqual({ processId, accountId: "A_VICTIM" })
    expect(await removeStep(cfg, guard, staff, actor, steps[0].id)).toBeNull()
  })
})

describe("the map's own figure is the client's figure", () => {
  it("is the same number the value screen computes, from the same seam", async () => {
    const processId = await mapWithThreeSteps()
    await cutVersion(cfg, guard, staff, actor, { processId, label: "After us" })
    const now = await listProcessSteps(cfg, guard, staff, processId)
    const byName = (n: string) => now.find((s) => s.name === n)!
    await updateStep(cfg, guard, staff, actor, byName("Collect the documents").id, {
      name: "Collect the documents",
      secondsPerRun: 300,
      runsPerPeriod: 40,
    })
    await removeStep(cfg, guard, staff, actor, byName("Set the renewal reminder").id)

    const detail = await getProcess(cfg, guard, staff, processId)
    const everything = await listSavings(cfg, guard, staff, {})
    const sameMap = everything.apps
      .flatMap((a) => a.processes)
      .find((p) => p.processId === processId)

    expect(detail.saving?.savedSecondsPerMonth).toBe(sameMap?.savedSecondsPerMonth)
    // …and the arithmetic said out loud: half an hour became five minutes forty
    // times a month (60,000s), and the reminder we no longer set was five
    // minutes forty times a month on top (12,000s).
    expect(detail.saving?.savedSecondsPerMonth).toBe(72_000)
    expect(savedHours(detail.saving!.savedSecondsPerMonth)).toBe(20)
  })

  // R25's half of the payload: the sentence travels WITH the number, from the
  // file that computes it, so no screen has to remember to write it.
  it("carries the caption the figure must be quoted with", async () => {
    const processId = await mapWithThreeSteps()
    const detail = await getProcess(cfg, guard, staff, processId)
    expect(detail.savingsCaption).toContain("estimates we agreed")
  })

  // A step we REMOVED is the largest saving there is and the easiest to leave
  // off a screen — so the comparison the map renders has to contain it.
  it("keeps a removed step in the comparison, with the whole of its time saved", async () => {
    const processId = await mapWithThreeSteps()
    await cutVersion(cfg, guard, staff, actor, { processId })
    const now = await listProcessSteps(cfg, guard, staff, processId)
    await removeStep(cfg, guard, staff, actor, now.find((s) => s.name === "Set the renewal reminder")!.id)

    const detail = await getProcess(cfg, guard, staff, processId)
    const dropped = detail.saving?.steps.find((s) => s.name === "Set the renewal reminder")
    expect(dropped?.removed).toBe(true)
    expect(dropped?.savedSecondsPerMonth).toBe(300 * 40)
  })
})


// ── DELETE, the verb for a mistake ───────────────────────────────────────────
//
// `removeStep` records a FACT (the work stopped; the row stays and its time
// becomes a saving). `deleteStep` retracts a MISTAKE: the row and its history
// go, and the door refuses whenever going would bend an agreed number — which
// is exactly the two refusals proved here. Owner's ruling, 25 Aug 2026.
describe("deleting a step that should never have existed", () => {
  it("a just-added step deletes completely — the row and its history", async () => {
    const processId = await mapWithThreeSteps()
    await addStep(cfg, guard, staff, actor, {
      processId,
      name: "Added by mistake",
      secondsPerRun: 60,
      runsPerPeriod: 1,
    })
    const before = await listProcessSteps(cfg, guard, staff, processId)
    const mistake = before.find((x) => x.name === "Added by mistake")!
    const out = await deleteStep(cfg, guard, staff, actor, mistake.id)
    expect(out).toEqual({ processId, accountId: "A_VICTIM" })
    const after = await listProcessSteps(cfg, guard, staff, processId)
    expect(after.map((x) => x.name)).not.toContain("Added by mistake")
    // The slider must not keep drawing it: its revision rows went with it.
    const left = (holder.db as DatabaseSync)
      .prepare("SELECT COUNT(*) AS n FROM process_step_revisions WHERE step_key = ?")
      .get(mistake.stepKey) as { n: number }
    expect(left.n).toBe(0)
  })

  it("deleting it twice is quiet — null, no second history line (R17)", async () => {
    const processId = await mapWithThreeSteps()
    await addStep(cfg, guard, staff, actor, { processId, name: "Twice", secondsPerRun: 60, runsPerPeriod: 1 })
    const step = (await listProcessSteps(cfg, guard, staff, processId)).find((x) => x.name === "Twice")!
    await deleteStep(cfg, guard, staff, actor, step.id)
    expect(await deleteStep(cfg, guard, staff, actor, step.id)).toBeNull()
  })

  it("a step cut into an agreed version refuses, and says to switch it off", async () => {
    const processId = await mapWithThreeSteps()
    await cutVersion(cfg, guard, staff, actor, { processId, label: "Agreed" })
    const step = (await listProcessSteps(cfg, guard, staff, processId))[0]
    await expect(deleteStep(cfg, guard, staff, actor, step.id)).rejects.toMatchObject({
      code: "step_agreed",
    })
  })

  it("a loop's target refuses while the loop stands, and deletes once it is gone", async () => {
    const processId = await mapWithThreeSteps()
    const steps = await listProcessSteps(cfg, guard, staff, processId)
    const target = steps[2] // "Set the renewal reminder"
    await addStep(cfg, guard, staff, actor, {
      processId,
      name: "Check it went out",
      secondsPerRun: 120,
      runsPerPeriod: 40,
      loopsBackTo: target.stepKey,
    })
    // Wait — the LOOPER is deletable; the TARGET is not. Prove both ways round.
    const looper = (await listProcessSteps(cfg, guard, staff, processId)).find(
      (x) => x.name === "Check it went out"
    )!
    await expect(deleteStep(cfg, guard, staff, actor, target.id)).rejects.toMatchObject({
      code: "step_looped",
    })
    // Point the loop away and the target frees up.
    await updateStep(cfg, guard, staff, actor, looper.id, {
      name: looper.name,
      secondsPerRun: looper.secondsPerRun,
      runsPerPeriod: looper.runsPerPeriod,
      loopsBackTo: null,
    })
    expect(await deleteStep(cfg, guard, staff, actor, target.id)).toEqual({ processId, accountId: "A_VICTIM" })
  })

  it("one branch of a fork deletes; its sibling stands alone again", async () => {
    const processId = await mapWithThreeSteps()
    const second = (await listProcessSteps(cfg, guard, staff, processId))[1]
    await addStep(cfg, guard, staff, actor, {
      processId,
      name: "The other way",
      secondsPerRun: 300,
      runsPerPeriod: 40,
      position: second.position,
      branchLabel: "if it is urgent",
    })
    const branch = (await listProcessSteps(cfg, guard, staff, processId)).find(
      (x) => x.name === "The other way"
    )!
    expect(await deleteStep(cfg, guard, staff, actor, branch.id)).toEqual({ processId, accountId: "A_VICTIM" })
    const after = await listProcessSteps(cfg, guard, staff, processId)
    expect(after.filter((x) => x.position === second.position)).toHaveLength(1)
  })
})
