// A BRANCH THAT CARRIES ON ALONE — the third thing a map's shape can say.
//
// THE OWNER, 26 Aug 2026: "What if I want to add more steps under a branched
// step? … under the split step, which says 'Schedule stories', I then want to
// add step number four underneath it in the same split. I don't want it to be a
// join step. Is there a way to do that?"
//
// There was not. The shape came from `position` alone, which can say exactly two
// things — steps sharing a position are a fork, and a single step below them is
// the rejoin — so a fourth step meant to continue ONE arm got a row of its own,
// and a row with one step in it IS the rejoin by that model. It drew itself
// centred under both arms.
//
// `branch_of` is the missing fact: the step key of the branch HEAD a step
// continues. These lock it end to end through the real lib functions — written,
// read back, carried across a version cut, and taken off again — because a
// column that only the picture reads is a column that silently stops being
// written the first time somebody touches the write path. It nearly did: the
// UPDATE grew a `?` before its value, the binds shifted by one, and every step
// edit in the app answered "that step belongs to an older version".

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import { addStep, createProcess, cutVersion, listProcessSteps, updateStep } from "../src/lib/processes"
import { buildSpineDb, IDS } from "./spine-harness"

const cfg = { accountId: "a", apiToken: "t" } as never
const actor = { id: IDS.staffUser, email: "staff@kwapso.app", name: "Staff" }
const guard = { userId: IDS.staffUser, teamId: IDS.team, roleId: IDS.adminRole, databaseId: "db_team" }
const staff = { kind: "staff" } as const

const aMap = async (): Promise<string> =>
  (await createProcess(cfg, guard, staff, actor, { appId: IDS.victimApp, name: "Tickets" })).id

beforeEach(() => {
  holder.db = buildSpineDb()
})

const keyOf = async (processId: string, name: string) =>
  (await listProcessSteps(cfg, guard, staff, processId)).find((s) => s.name === name)!

describe("a step can continue one side of a split", () => {
  /** The owner's own example: raise → triage → (resolve | schedule) → review,
   * where review hangs under `schedule` and `resolve` simply ends. */
  async function ownersMap() {
    const processId = await aMap()
    await addStep(cfg, guard, staff, actor, { processId, name: "Triage", secondsPerRun: 300, runsPerPeriod: 5 })
    await addStep(cfg, guard, staff, actor, {
      processId, name: "Resolve", secondsPerRun: 180, runsPerPeriod: 2, position: 2, branchLabel: "if resolved",
    })
    await addStep(cfg, guard, staff, actor, {
      processId, name: "Schedule", secondsPerRun: 360, runsPerPeriod: 5, position: 2, branchLabel: "if not",
    })
    return processId
  }

  it("stores which arm it is on, and reads it back", async () => {
    const processId = await ownersMap()
    const schedule = await keyOf(processId, "Schedule")
    await addStep(cfg, guard, staff, actor, {
      processId, name: "Review", secondsPerRun: 2400, runsPerPeriod: 3, branchOf: schedule.stepKey,
    })
    const review = await keyOf(processId, "Review")
    expect(review.branchOf, "the arm did not survive the write").toBe(schedule.stepKey)
    // …and no other step gained one.
    const others = (await listProcessSteps(cfg, guard, staff, processId)).filter((s) => s.name !== "Review")
    expect(others.every((s) => s.branchOf === null)).toBe(true)
  })

  it("an edit can put a step on an arm, and take it off again", async () => {
    const processId = await ownersMap()
    const schedule = await keyOf(processId, "Schedule")
    await addStep(cfg, guard, staff, actor, { processId, name: "Review", secondsPerRun: 2400, runsPerPeriod: 3 })
    const review = await keyOf(processId, "Review")
    expect(review.branchOf).toBeNull()

    // `name`, `secondsPerRun` and `runsPerPeriod` are REQUIRED on this door — an
    // edit always re-states them — so a partial call is not a shape it supports.
    const same = { name: "Review", secondsPerRun: 2400, runsPerPeriod: 3 }
    await updateStep(cfg, guard, staff, actor, review.id, { ...same, branchOf: schedule.stepKey })
    expect((await keyOf(processId, "Review")).branchOf).toBe(schedule.stepKey)

    // BACK OFF AGAIN. Null is a value here, not "leave it alone" — a shape you
    // can get into and not out of is the fault the split itself had in August
    // ("I think something is wrong… and I can't even edit it").
    await updateStep(cfg, guard, staff, actor, review.id, { ...same, branchOf: null })
    expect((await keyOf(processId, "Review")).branchOf).toBeNull()
  })

  it("an edit that says nothing about the arm leaves it alone", async () => {
    // `undefined` means untouched, everywhere in this door. A form that saves a
    // step's minutes without mentioning its shape must not flatten the map.
    const processId = await ownersMap()
    const schedule = await keyOf(processId, "Schedule")
    await addStep(cfg, guard, staff, actor, {
      processId, name: "Review", secondsPerRun: 2400, runsPerPeriod: 3, branchOf: schedule.stepKey,
    })
    const review = await keyOf(processId, "Review")
    await updateStep(cfg, guard, staff, actor, review.id, { name: "Review", secondsPerRun: 1200, runsPerPeriod: 3 })
    const after = await keyOf(processId, "Review")
    expect(after.secondsPerRun).toBe(1200)
    expect(after.branchOf, "an unrelated edit flattened the map").toBe(schedule.stepKey)
  })

  it("a version cut carries the arm forward", async () => {
    // The same reason the role has to travel: version 2 drawn as a join where
    // version 1 was an arm is a shape change on a version where not one minute
    // moved, and nobody would know which one was right.
    const processId = await ownersMap()
    const schedule = await keyOf(processId, "Schedule")
    await addStep(cfg, guard, staff, actor, {
      processId, name: "Review", secondsPerRun: 2400, runsPerPeriod: 3, branchOf: schedule.stepKey,
    })
    await cutVersion(cfg, guard, staff, actor, { processId, label: "agreed" })
    const after = await keyOf(processId, "Review")
    expect(after.branchOf, "the cut flattened the map").toBe(schedule.stepKey)
  })
})
