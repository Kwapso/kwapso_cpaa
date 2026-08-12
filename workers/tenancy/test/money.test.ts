// THE MONEY — the margin's arithmetic, the version cut's idempotence, and the
// two facts this build borrows from the work engine.
//
// Three things are proved here, and each one is a place a plausible
// implementation goes quietly wrong:
//
//   1. THE MARGIN ADDS UP, and it says so in lines a person can check. A margin
//      is the one number in this app nobody outside the agency can sanity-check,
//      which is exactly why its own suite has to.
//   2. A VERSION IS CUT ONCE PER SPRINT. The automatic cut is fired by something
//      that can fire twice — a double click, a retried job, a replayed hook — and
//      "the same thing happened twice" here is an INSERT, so the predicate cannot
//      ride a WHERE. It rides a partial unique index instead (R17), and this
//      proves the database is what refuses rather than a check a race slips past.
//   3. WHEN THE WORK ENGINE IS NOT HERE YET, the door says so instead of
//      presenting revenue-minus-nothing as a margin. The two lanes are being
//      built at the same time, and a team database is migrated one team at a time,
//      so "that table is not here yet" is a real state and not a hypothetical.

import { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import { margin } from "../src/lib/internal-money"
import { cutVersion, listProcessVersions, listProcessSteps, listSavings } from "../src/lib/processes"
import { workEngineFacts } from "../src/lib/work-engine"
import { buildSpineDb, IDS } from "./spine-harness"

const db = () => holder.db as DatabaseSync
const cfg = { accountId: "a", apiToken: "t" } as never
const guard = { userId: IDS.staffUser, teamId: IDS.team, roleId: IDS.adminRole, databaseId: "db_team" }
const actor = { id: IDS.staffUser, email: "staff@kwapso.app", name: "Staff" }
const staff = { kind: "staff" } as const

beforeEach(() => {
  holder.db = buildSpineDb()
})

describe("the margin is revenue minus our own time minus tool costs — in lines", () => {
  it("applies the right rate per kind of work and totals what it shows", () => {
    const result = margin({
      revenueCents: 1_000_000, // 10,000.00 sold
      loggedSeconds: [
        { label: "Development", seconds: 36_000 }, // 10 hours
        { label: "Design", seconds: 18_000 }, // 5 hours
      ],
      internalRates: [
        { label: "Development", centsPerHour: 4500 },
        { label: "Design", centsPerHour: 3000 },
      ],
      defaultCentsPerHour: 4000,
      toolCostCents: 42_000,
    })
    expect(result.lines.map((l) => l.costCents)).toEqual([45_000, 15_000])
    expect(result.timeCostCents).toBe(60_000)
    expect(result.marginCents).toBe(1_000_000 - 60_000 - 42_000)
    // The lines a person can check add up to the total they are checking.
    expect(result.lines.reduce((n, l) => n + l.costCents, 0)).toBe(result.timeCostCents)
    expect(result.revenueCents - result.timeCostCents - result.toolCostCents).toBe(result.marginCents)
    expect(result.marginPercent).toBe(89.8)
  })

  it("time with no matching rate falls back to the default one, and says which", () => {
    const result = margin({
      revenueCents: 100_000,
      loggedSeconds: [{ label: "Our time", seconds: 7200 }],
      internalRates: [{ label: "Development", centsPerHour: 4500 }],
      defaultCentsPerHour: 4000,
      toolCostCents: 0,
    })
    expect(result.lines).toEqual([{ label: "Our time", seconds: 7200, centsPerHour: 4000, costCents: 8000 }])
  })

  // "∞%" on zero revenue is the kind of number that makes somebody stop
  // believing the rest of the screen.
  it("a percentage of nothing is null, never infinity", () => {
    const result = margin({
      revenueCents: 0,
      loggedSeconds: [{ label: "Our time", seconds: 3600 }],
      internalRates: [],
      defaultCentsPerHour: 5000,
      toolCostCents: 0,
    })
    expect(result.marginCents).toBe(-5000)
    expect(result.marginPercent).toBeNull()
  })

  it("a margin with no logged time SAYS the time is missing rather than looking healthy", () => {
    const result = margin(
      { revenueCents: 500_000, loggedSeconds: [{ label: "Our time", seconds: 0 }], internalRates: [], defaultCentsPerHour: 4000, toolCostCents: 1000 },
      false
    )
    // 499,000 of "margin" with nothing subtracted for our own work is not a
    // margin, and the flag is how the screen knows to say so.
    expect(result.marginCents).toBe(499_000)
    expect(result.loggedTimeAvailable).toBe(false)
    expect(result.lines).toEqual([])
  })
})

describe("the two facts we borrow from the work engine", () => {
  // THE WORK ENGINE HAS LANDED (12 Aug 2026), so these cases changed shape. They
  // used to create a FAKE `sprints` table per case, because the real one did not
  // exist yet and the borrow was written against BUILD-1's declaration rather
  // than against code. Both tables are now in the team migrations, and with them
  // the one contract ambiguity is settled: the price column is
  // `sold_price_cents`, whole cents on both sides, so there is no longer a
  // spelling for the adapter to detect or a major-unit conversion to prove.
  it("answers 'not here yet' rather than a confident zero while HALF the lane has landed", async () => {
    // Exactly today's state, and it is the state the probe exists for: `sprints`
    // shipped with the stories migration and `work_logs` has not shipped yet. A
    // margin that read the price and silently subtracted nothing would report a
    // beautiful 100%, which is the failure this build exists to prevent.
    const facts = await workEngineFacts(cfg, guard, IDS.victimAccount)
    expect(facts.ready, "both work-engine tables must be present before a margin is claimed").toBe(false)
    expect(facts.soldCents).toBe(0)
    expect(facts.loggedSeconds).toBe(0)
  })

  it("reads the price in whole cents, and never multiplies it again", async () => {
    // The half that has not landed, stubbed here rather than waited for: this
    // case is about the CONVERSION, and the conversion is settled.
    db().exec(`
      CREATE TABLE work_logs (id TEXT PRIMARY KEY, account_id TEXT, seconds INTEGER);
      INSERT INTO sprints (id, account_id, name, sold_price_cents, created_at)
        VALUES ('S1', '${IDS.victimAccount}', 'Sprint 4', 499999, '2026-08-12T00:00:00.000Z');
      INSERT INTO work_logs (id, account_id, seconds) VALUES
        ('W1', '${IDS.victimAccount}', 3600), ('W2', '${IDS.victimAccount}', 1800);
    `)
    const facts = await workEngineFacts(cfg, guard, IDS.victimAccount)
    expect(facts.ready).toBe(true)
    expect(facts.soldCents).toBe(499_999)
    expect(facts.loggedSeconds).toBe(5400)
  })

  it("counts only the named account's money and nobody else's", async () => {
    db().exec(`
      CREATE TABLE work_logs (id TEXT PRIMARY KEY, account_id TEXT, seconds INTEGER);
      INSERT INTO sprints (id, account_id, name, sold_price_cents, created_at) VALUES
        ('S1', '${IDS.victimAccount}', 'Theirs', 10000, '2026-08-12T00:00:00.000Z'),
        ('S2', '${IDS.burglarAccount}', 'Somebody else''s', 90000, '2026-08-12T00:00:00.000Z');
    `)
    const facts = await workEngineFacts(cfg, guard, IDS.victimAccount)
    expect(facts.soldCents).toBe(10_000)
  })
})

describe("a version is cut once per sprint, whatever fires it twice", () => {
  it("copies every step forward, keeping the key that makes a saving a subtraction", async () => {
    const cut = await cutVersion(cfg, guard, staff, actor, {
      processId: IDS.victimProcess,
      label: "After the first sprint",
      sprintId: "SPRINT_1",
    })
    expect(cut?.versionNo).toBe(2)

    const versions = await listProcessVersions(cfg, guard, staff, IDS.victimProcess)
    expect(versions.map((v) => v.versionNo)).toEqual([2, 1])
    expect(versions.find((v) => v.versionNo === 1)?.isBaseline).toBe(true)

    // The step travelled forward as a NEW row under the SAME key.
    const steps = await listProcessSteps(cfg, guard, staff, IDS.victimProcess)
    expect(steps).toHaveLength(1)
    expect(steps[0].stepKey).toBe("SK_VICTIM")
    expect(steps[0].id).not.toBe(IDS.victimStep)
    expect(steps[0].versionId).toBe(cut?.versionId)
    expect(steps[0].secondsPerRun).toBe(2400)
  })

  // R17, for a transition that is an INSERT. The predicate cannot ride a WHERE,
  // so it rides the partial unique index — the database refuses, not a check.
  it("the SAME sprint completing twice cuts one version, and the second is silent", async () => {
    const first = await cutVersion(cfg, guard, staff, actor, { processId: IDS.victimProcess, sprintId: "SPRINT_1" })
    const second = await cutVersion(cfg, guard, staff, actor, { processId: IDS.victimProcess, sprintId: "SPRINT_1" })
    expect(first?.versionNo).toBe(2)
    expect(second, "a repeat cut moves nothing and says so with null").toBeNull()

    const versions = await listProcessVersions(cfg, guard, staff, IDS.victimProcess)
    expect(versions.map((v) => v.versionNo)).toEqual([2, 1])
    // Zero rows moved = no activity row, exactly like every other transition.
    const history = db()
      .prepare("SELECT COUNT(*) AS n FROM activity WHERE type = 'Version cut'")
      .get() as { n: number }
    expect(history.n, "history says what happened, not how many times it was fired").toBe(1)
  })

  it("a DIFFERENT sprint cuts the next version, and the manual button always may", async () => {
    await cutVersion(cfg, guard, staff, actor, { processId: IDS.victimProcess, sprintId: "SPRINT_1" })
    await cutVersion(cfg, guard, staff, actor, { processId: IDS.victimProcess, sprintId: "SPRINT_2" })
    // No sprint id at all is the manual cut — two in a row are two versions,
    // because a person pressing the button twice means it twice.
    await cutVersion(cfg, guard, staff, actor, { processId: IDS.victimProcess })
    await cutVersion(cfg, guard, staff, actor, { processId: IDS.victimProcess })
    const versions = await listProcessVersions(cfg, guard, staff, IDS.victimProcess)
    expect(versions.map((v) => v.versionNo)).toEqual([5, 4, 3, 2, 1])
  })
})

describe("the saving a client reads, end to end, against a real database", () => {
  it("subtracts the LATEST version from version 1 — not the other way round", async () => {
    // Cut a version, then make the step faster in it: 40 minutes → 8, 20× a month.
    const cut = await cutVersion(cfg, guard, staff, actor, { processId: IDS.victimProcess })
    db()
      .prepare("UPDATE process_steps SET seconds_per_run = 480 WHERE version_id = ?")
      .run(cut?.versionId as string)

    const view = await listSavings(cfg, guard, staff)
    const step = view.apps[0].processes[0].steps[0]
    expect(step.baselineSecondsPerRun).toBe(2400)
    expect(step.latestSecondsPerRun).toBe(480)
    expect(step.savedSecondsPerMonth).toBe(38_400)
    expect(view.savedSecondsPerMonth).toBe(38_400)
  })

  it("a step removed in the latest version saves all of its old time", async () => {
    const cut = await cutVersion(cfg, guard, staff, actor, { processId: IDS.victimProcess })
    db()
      .prepare("UPDATE process_steps SET seconds_per_run = 0, removed_at = '2026-03-01' WHERE version_id = ?")
      .run(cut?.versionId as string)

    const view = await listSavings(cfg, guard, staff)
    const step = view.apps[0].processes[0].steps[0]
    expect(step.removed).toBe(true)
    // 40 minutes × 20 a month, all of it.
    expect(step.savedSecondsPerMonth).toBe(48_000)
  })

  // The explanation is a STAFF comment naming the step. A client's own comment
  // naming one must never mark a regression as explained.
  it("a step counts as explained only when the TEAM has explained it", async () => {
    const cut = await cutVersion(cfg, guard, staff, actor, { processId: IDS.victimProcess })
    db()
      .prepare("UPDATE process_steps SET seconds_per_run = 9000 WHERE version_id = ?")
      .run(cut?.versionId as string)

    const before = await listSavings(cfg, guard, staff)
    expect(before.apps[0].processes[0].steps[0].regression).toBe(true)
    expect(before.apps[0].processes[0].steps[0].explained).toBe(false)

    // A CLIENT's comment naming the step — not an explanation.
    db()
      .prepare(
        `INSERT INTO process_comments (id, process_id, account_id, body, explains_step_key, is_staff, created_at, creator_id)
         VALUES ('PC_CLIENT', ?, ?, 'why is this slower now?', 'SK_VICTIM', 0, '2026-03-02', ?)`
      )
      .run(IDS.victimProcess, IDS.victimAccount, IDS.victimUser)
    const stillUnexplained = await listSavings(cfg, guard, staff)
    expect(stillUnexplained.apps[0].processes[0].steps[0].explained).toBe(false)

    // Ours is.
    db()
      .prepare(
        `INSERT INTO process_comments (id, process_id, account_id, body, explains_step_key, is_staff, created_at, creator_id)
         VALUES ('PC_STAFF', ?, ?, 'It now includes the approval we used to do separately.', 'SK_VICTIM', 1, '2026-03-03', ?)`
      )
      .run(IDS.victimProcess, IDS.victimAccount, IDS.staffUser)
    const after = await listSavings(cfg, guard, staff)
    expect(after.apps[0].processes[0].steps[0].explained).toBe(true)
    // And it is STILL a regression, still in the list, still in the total —
    // explaining one never hides it (BUILD-3 §3).
    expect(after.apps[0].processes[0].steps[0].regression).toBe(true)
    expect(after.savedSecondsPerMonth).toBeLessThan(0)
  })
})
