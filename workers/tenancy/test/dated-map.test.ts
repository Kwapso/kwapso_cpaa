// THE MAP ON ANY DAY, AND THE MONEY THE SAVING IS WORTH.
//
// Steps 4 and 5 of the audit module, and they are one suite because they are one
// mechanism: the saving is the map at the AUDIT DATE subtracted from the map
// NOW, and the slider is that same read at a day the person picks. Move the
// slider to the audit date and the "after" column becomes the "before" — if
// those were two mechanisms they could disagree, and the first client to catch
// them disagreeing would stop believing every other number in the app.
//
// FOUR THINGS THAT FAIL SILENTLY IF THEY ARE WRONG:
//
//   1 · A STEP ADDED AFTER THE AUDIT DATE MAKES THE SAVING SMALLER. It is new
//       time we added. Both respondents passed this comprehension check, and it
//       must hold as ARITHMETIC — a step with no revision at the audit date has
//       a null baseline, which is zero seconds of old work — rather than as a
//       rule somebody remembered to write.
//
//   2 · A RATE CORRECTED LATER DOES NOT MOVE AN OLD FIGURE. The owner's ruling:
//       "even if the cost changes, they have to be retained as they were at the
//       time we recorded them". A saving computed live from today's rate would
//       rewrite a number a client already agreed, the day somebody gave a
//       payroll rise.
//
//   3 · A ROLE WITH NO COST GIVES HOURS AND NO MONEY — never zero money. Zero
//       reads as "this person is free" and comes out of the arithmetic as a
//       saving of nothing with nothing to say a number is missing.
//
//   4 · THE PERIOD CONVERTS ONCE. "Twice a day" and "sixty times a month" are
//       the same fact, and a step whose frequency is stored per day must not be
//       counted as sixty times a month in one place and twice in another.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import { runsPerMonthFrom } from "@shared/workers/savings"
import {
  addStep,
  createProcess,
  cutVersion,
  listSavings,
  mapAsOf,
  removeStep,
  setAuditDate,
  updateStep,
} from "../src/lib/processes"
import { buildSpineDb, IDS } from "./spine-harness"

const cfg = { accountId: "a", apiToken: "t" } as never
const actor = { id: IDS.staffUser, email: "staff@kwapso.app", name: "Staff" }
const guard = { userId: IDS.staffUser, teamId: IDS.team, roleId: IDS.adminRole, databaseId: "db_team" }
const staff = { kind: "staff" } as const

function seedOrg(): void {
  ;(holder.db as DatabaseSync).exec(`
    INSERT INTO client_roles (id, account_id, name, cents_per_hour, created_at)
      VALUES ('ROLE_CLERK', '${IDS.victimAccount}', 'Dispatch clerk', 6000, '2026-01-01T00:00:00.000Z'),
             ('ROLE_FREE',  '${IDS.victimAccount}', 'Unpriced',       NULL, '2026-01-01T00:00:00.000Z');
  `)
}

/** Backdate a step's revision, which is how a test builds a history without
 * waiting a week. The LIVE row is left alone on purpose: the point of these
 * suites is that the two agree. */
function backdate(processId: string, stepKey: string, day: string): void {
  ;(holder.db as DatabaseSync).exec(
    `UPDATE process_step_revisions SET effective_on = '${day}'
      WHERE process_id = '${processId}' AND step_key = '${stepKey}'`
  )
}

async function aMap(): Promise<string> {
  return createProcess(cfg, guard, staff, actor, { appId: IDS.victimApp, name: "Recording a damage case" })
}

beforeEach(() => {
  holder.db = buildSpineDb()
  seedOrg()
})

describe("the period converts once, and correctly", () => {
  it("a month is 365.25/12 days, not 30 — thirty loses five days a year", () => {
    expect(runsPerMonthFrom(1, "day")).toBe(30)
    expect(runsPerMonthFrom(1, "week")).toBe(4)
    expect(runsPerMonthFrom(40, "month")).toBe(40)
    expect(runsPerMonthFrom(12, "year")).toBe(1)
  })

  it("an unknown period falls back to month rather than throwing mid-arithmetic", () => {
    expect(runsPerMonthFrom(5, "fortnight")).toBe(5)
  })

  it("a step stored per DAY reads back as its monthly figure", async () => {
    const processId = await aMap()
    await addStep(cfg, guard, staff, actor, {
      processId,
      name: "Check the inbox",
      secondsPerRun: 300,
      runsPerPeriod: 2,
      frequencyPeriod: "day",
    })
    const [step] = await mapAsOf(cfg, guard, staff, processId, "2099-01-01")
    expect(step.runsPerPeriod).toBe(2)
    expect(step.frequencyPeriod).toBe("day")
    expect(step.runsPerMonth).toBe(61)
  })
})

describe("the map on any day", () => {
  it("shows what the step said THEN, not what it says now", async () => {
    const processId = await aMap()
    await addStep(cfg, guard, staff, actor, {
      processId,
      name: "Take the call",
      secondsPerRun: 1500,
      runsPerPeriod: 30,
      roleId: "ROLE_CLERK",
    })
    const [first] = await mapAsOf(cfg, guard, staff, processId, "2099-01-01")
    backdate(processId, first.stepKey, "2026-01-10")

    await updateStep(cfg, guard, staff, actor, (await liveStepId(processId)), {
      name: "Take the call",
      secondsPerRun: 360,
      runsPerPeriod: 30,
    })

    const then = await mapAsOf(cfg, guard, staff, processId, "2026-02-01")
    expect(then[0].secondsPerRun, "February should still say 25 minutes").toBe(1500)
    const today = await mapAsOf(cfg, guard, staff, processId, "2099-01-01")
    expect(today[0].secondsPerRun, "today says 6 minutes").toBe(360)
  })

  it("a step that did not exist yet is simply absent, not zero", async () => {
    const processId = await aMap()
    await addStep(cfg, guard, staff, actor, {
      processId, name: "Added later", secondsPerRun: 600, runsPerPeriod: 30,
    })
    expect(await mapAsOf(cfg, guard, staff, processId, "2020-01-01")).toHaveLength(0)
  })

  it("a removed step says it stopped, on the day it stopped", async () => {
    const processId = await aMap()
    await addStep(cfg, guard, staff, actor, {
      processId, name: "No longer done", secondsPerRun: 600, runsPerPeriod: 30,
    })
    await removeStep(cfg, guard, staff, actor, await liveStepId(processId))
    const [step] = await mapAsOf(cfg, guard, staff, processId, "2099-01-01")
    expect(step.removed).toBe(true)
    expect(step.secondsPerRun, "removed work is zero seconds, keeping its frequency").toBe(0)
  })
})

describe("the saving, measured from the version in force at the audit date", () => {
  // AURORA RULED THE BASELINE ONTO A DATE rather than onto "version 1". What a
  // date SELECTS is the version that was agreed on or before it — and never the
  // current one, because you cannot subtract today from today. That last clause
  // is not pedantry: a version cut today is "on or before" an audit date of
  // today, so without it every map would report a saving of exactly zero, which
  // is the shape of a bug that looks like an honest answer.

  it("is the baseline minus today, in hours AND in the client's money", async () => {
    const processId = await aMap()
    await addStep(cfg, guard, staff, actor, {
      processId, name: "Take the call", secondsPerRun: 1500, runsPerPeriod: 30, roleId: "ROLE_CLERK",
    })
    await cutVersion(cfg, guard, staff, actor, { processId, label: "After" })
    await updateStep(cfg, guard, staff, actor, await liveStepId(processId), {
      name: "Take the call", secondsPerRun: 300, runsPerPeriod: 30, roleId: "ROLE_CLERK",
    })

    const view = await listSavings(cfg, guard, staff, { processId })
    const saving = view.apps[0].processes[0]
    // 25 min → 5 min, thirty times a month = 600 minutes = 10 hours.
    expect(saving.savedSecondsPerMonth).toBe(20 * 60 * 30)
    // …at EUR 60/hour = EUR 600.00, in cents.
    expect(saving.savedCentsPerMonth).toBe(60000)
    expect(view.savedCentsPerMonth).toBe(60000)
  })

  it("THE AUDIT DATE SELECTS WHICH VERSION IS THE BEFORE", async () => {
    // Three versions. The audit date sits between the first and the second, so
    // the FIRST is the baseline — even though a later one exists and would be
    // the obvious pick for "the previous version".
    const processId = await aMap()
    await addStep(cfg, guard, staff, actor, {
      processId, name: "Take the call", secondsPerRun: 1800, runsPerPeriod: 10, roleId: "ROLE_CLERK",
    })
    await cutVersion(cfg, guard, staff, actor, { processId, label: "Second" })
    backdateVersion(processId, 1, "2026-01-01")
    await updateStep(cfg, guard, staff, actor, await liveStepId(processId), {
      name: "Take the call", secondsPerRun: 900, runsPerPeriod: 10,
    })
    await cutVersion(cfg, guard, staff, actor, { processId, label: "Third" })
    backdateVersion(processId, 2, "2026-06-01")
    await updateStep(cfg, guard, staff, actor, await liveStepId(processId), {
      name: "Take the call", secondsPerRun: 600, runsPerPeriod: 10,
    })

    // Audit in March: version 1 (30 min) is the before. 30 → 10 min, ten times.
    await setAuditDate(cfg, guard, staff, actor, processId, "2026-03-01")
    expect(
      (await listSavings(cfg, guard, staff, { processId })).savedSecondsPerMonth
    ).toBe(20 * 60 * 10)

    // Audit in August: version 2 (15 min) is the before. 15 → 10 min.
    await setAuditDate(cfg, guard, staff, actor, processId, "2026-08-01")
    expect(
      (await listSavings(cfg, guard, staff, { processId })).savedSecondsPerMonth
    ).toBe(5 * 60 * 10)
  })

  it("a step ADDED after the baseline makes the saving SMALLER — new time we added", async () => {
    const processId = await aMap()
    await addStep(cfg, guard, staff, actor, {
      processId, name: "Was always there", secondsPerRun: 600, runsPerPeriod: 30, roleId: "ROLE_CLERK",
    })
    await cutVersion(cfg, guard, staff, actor, { processId, label: "After" })
    // …and a step that did not exist in the baseline at all.
    await addStep(cfg, guard, staff, actor, {
      processId, name: "Added later", secondsPerRun: 1200, runsPerPeriod: 30, roleId: "ROLE_CLERK",
    })

    const saving = (await listSavings(cfg, guard, staff, { processId })).apps[0].processes[0]
    // The old step is unchanged (saves nothing); the new one costs 20 min x 30.
    expect(saving.savedSecondsPerMonth).toBe(-1200 * 30)
  })

  it("a rate corrected LATER does not move a figure already agreed", async () => {
    const processId = await aMap()
    await addStep(cfg, guard, staff, actor, {
      processId, name: "Take the call", secondsPerRun: 1500, runsPerPeriod: 30, roleId: "ROLE_CLERK",
    })
    await cutVersion(cfg, guard, staff, actor, { processId, label: "After" })
    await updateStep(cfg, guard, staff, actor, await liveStepId(processId), {
      name: "Take the call", secondsPerRun: 300, runsPerPeriod: 30,
    })
    const before = (await listSavings(cfg, guard, staff, { processId })).savedCentsPerMonth
    expect(before).toBeGreaterThan(0)

    // Somebody gives the dispatch clerk a large rise.
    ;(holder.db as DatabaseSync).exec(`UPDATE client_roles SET cents_per_hour = 99999 WHERE id = 'ROLE_CLERK'`)

    const after = (await listSavings(cfg, guard, staff, { processId })).savedCentsPerMonth
    expect(after, "the client's agreed figure must not move because of their payroll").toBe(before)
  })

  it("a role with no hourly cost gives hours and NO money — never zero money", async () => {
    const processId = await aMap()
    await addStep(cfg, guard, staff, actor, {
      processId, name: "Take the call", secondsPerRun: 1500, runsPerPeriod: 30, roleId: "ROLE_FREE",
    })
    await cutVersion(cfg, guard, staff, actor, { processId, label: "After" })
    await updateStep(cfg, guard, staff, actor, await liveStepId(processId), {
      name: "Take the call", secondsPerRun: 300, runsPerPeriod: 30, roleId: "ROLE_FREE",
    })

    const saving = (await listSavings(cfg, guard, staff, { processId })).apps[0].processes[0]
    expect(saving.savedSecondsPerMonth).toBeGreaterThan(0)
    expect(saving.steps[0].savedCentsPerMonth, "unpriced means null, not 0").toBeNull()
    expect(saving.pricedSteps, "and the screen can tell the figure is incomplete").toBe(0)
    expect(saving.totalSteps).toBe(1)
  })

  it("moving the audit date twice to the same day writes one history line, not two", async () => {
    const processId = await aMap()
    await setAuditDate(cfg, guard, staff, actor, processId, "2026-06-01")
    await setAuditDate(cfg, guard, staff, actor, processId, "2026-06-01")
    const rows = (holder.db as DatabaseSync)
      .prepare(`SELECT COUNT(*) AS n FROM activity WHERE type = 'Audit date moved'`)
      .all() as { n: number }[]
    expect(rows[0].n).toBe(1)
  })
})

/** Backdate a VERSION, which is how a test builds a history without waiting six
 * months. The version number is what identifies it, because that is what the
 * baseline picker orders by. */
function backdateVersion(processId: string, versionNo: number, day: string): void {
  ;(holder.db as DatabaseSync).exec(
    `UPDATE process_versions SET created_at = '${day}T09:00:00.000Z'
      WHERE process_id = '${processId}' AND version_no = ${versionNo}`
  )
}

/** The live row's id — what an edit takes.
 *
 * IT MUST BE THE ROW IN THE CURRENT VERSION, not just the newest row. A cut
 * copies every step forward, so after one there are two rows per step and only
 * the newer one is editable — picking by `created_at` alone returns the old one
 * and the door correctly refuses it. `mapAsOf` hands back a step KEY rather than
 * an id for the same reason: a historic revision is a description, not an
 * editable row. */
async function liveStepId(processId: string): Promise<string> {
  const rows = (holder.db as DatabaseSync)
    .prepare(
      `SELECT s.id FROM process_steps s
        WHERE s.process_id = ?
          AND s.version_id = (SELECT v.id FROM process_versions v
                               WHERE v.process_id = s.process_id
                               ORDER BY v.version_no DESC LIMIT 1)
        ORDER BY s.position ASC, s.created_at ASC LIMIT 1`
    )
    .all(processId) as { id: string }[]
  return rows[0].id
}
