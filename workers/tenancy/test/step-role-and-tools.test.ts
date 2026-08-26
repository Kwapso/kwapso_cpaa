// WHERE MINUTES MEET AN HOURLY COST — a step names WHO does it and WHAT IN.
//
// 0052 gave a whole MAP one role, which is the wrong altitude for a real
// process: "Recording a damage case" is a clerk taking the call, an adjuster
// assessing it and a bookkeeper paying it, at three different hourly costs
// inside one map. Priced at the map's single role, the saving is wrong by
// whatever the mix is — and wrong in a direction nobody can see, because the
// screen only ever displays a role's NAME.
//
// THREE THINGS HAVE TO HOLD, and each of them fails silently if it does not.
//
//   1 · A CUT CARRIES BOTH FORWARD. Cutting a version copies every step to a new
//       row with a new id and the same key. If the role did not travel, version
//       2's hours would price at nothing while version 1 still had a rate — which
//       reads on the client's own screen as the saving having GROWN, on a version
//       where not one minute changed. The tools join is keyed on
//       (version_id, step_key) precisely so it can travel in one statement.
//
//   2 · A ROLE FROM ANOTHER CLIENT IS REFUSED. The account fence stops a caller
//       REACHING another client's rows. It does not stop them WRITING one
//       client's role id onto another client's step, because a staff member can
//       see both. That would price Bergman's work at Confia's rates and leave no
//       trace, since the step displays the role's name and the name would simply
//       be the other client's.
//
//   3 · A STEP WITH NO ROLE IS ORDINARY. You map a process in the room, before
//       anybody has looked up who sits at which desk. A read that dropped those
//       steps, or a write that refused them, would break the session this whole
//       module exists to support.
//
// Real migrations, real SQLite, real lib functions.

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

/** The client's own roles and tools, written straight in — they are step 2's
 * doors and this is step 3's suite, so seeding them keeps the two apart. */
function seedOrg(): void {
  const db = holder.db as DatabaseSync
  db.exec(`
    INSERT INTO client_roles (id, account_id, name, cents_per_hour, created_at)
      VALUES ('ROLE_CLERK', '${IDS.victimAccount}', 'Dispatch clerk', 4200, '2026-01-01T00:00:00.000Z'),
             ('ROLE_ADJ',   '${IDS.victimAccount}', 'Adjuster',       7500, '2026-01-01T00:00:00.000Z'),
             ('ROLE_NOCOST','${IDS.victimAccount}', 'Bookkeeper',     NULL, '2026-01-01T00:00:00.000Z');
    INSERT INTO client_tools (id, account_id, name, mark, created_at)
      VALUES ('TOOL_SHEET', '${IDS.victimAccount}', 'The spreadsheet', NULL, '2026-01-01T00:00:00.000Z'),
             ('TOOL_MAIL',  '${IDS.victimAccount}', 'Email',           NULL, '2026-01-01T00:00:00.000Z');
  `)
}

/** A SECOND client, with a role of their own. This is the one that must never
 * reach the first client's step. */
function seedOtherClient(): void {
  const db = holder.db as DatabaseSync
  db.exec(`
    INSERT INTO accounts (id, account_type, name, created_at)
      VALUES ('OTHER_ACCT', 'entity', 'Somebody else', '2026-01-01T00:00:00.000Z');
    INSERT INTO client_roles (id, account_id, name, cents_per_hour, created_at)
      VALUES ('ROLE_THEIRS', 'OTHER_ACCT', 'Their own clerk', 99900, '2026-01-01T00:00:00.000Z');
    INSERT INTO client_tools (id, account_id, name, mark, created_at)
      VALUES ('TOOL_THEIRS', 'OTHER_ACCT', 'Their own system', NULL, '2026-01-01T00:00:00.000Z');
  `)
}

async function aMap(): Promise<string> {
  return (
    await createProcess(cfg, guard, staff, actor, {
      appId: IDS.victimApp,
      name: "Recording a damage case",
    })
  ).id
}

beforeEach(() => {
  holder.db = buildSpineDb()
  seedOrg()
  seedOtherClient()
})

describe("a step names who does it", () => {
  it("saves the role and reads it back with its hourly cost", async () => {
    const processId = await aMap()
    await addStep(cfg, guard, staff, actor, {
      processId,
      name: "Take the call",
      secondsPerRun: 600,
      runsPerPeriod: 40,
      roleId: "ROLE_CLERK",
    })
    const [step] = await listProcessSteps(cfg, guard, staff, processId)
    expect(step.roleId).toBe("ROLE_CLERK")
    expect(step.roleName).toBe("Dispatch clerk")
    // THE POINT OF THE WHOLE STEP: the price of an hour of the person spending
    // these minutes arrives in the same row as the minutes.
    expect(step.roleCentsPerHour).toBe(4200)
  })

  it("a role whose hourly cost nobody has looked up reads as null, never zero", async () => {
    // Zero would be a saving of nothing, reported as if it were known. Null is
    // "not said yet", which the screens render as hours with no money beside
    // them — the honest incompleteness 0052 chose and step 4 depends on.
    const processId = await aMap()
    await addStep(cfg, guard, staff, actor, {
      processId,
      name: "Pay it",
      secondsPerRun: 300,
      runsPerPeriod: 40,
      roleId: "ROLE_NOCOST",
    })
    const [step] = await listProcessSteps(cfg, guard, staff, processId)
    expect(step.roleName).toBe("Bookkeeper")
    expect(step.roleCentsPerHour).toBeNull()
  })

  it("a step with nobody named is ordinary — it saves, and it lists", async () => {
    const processId = await aMap()
    await addStep(cfg, guard, staff, actor, {
      processId,
      name: "Something nobody has assigned yet",
      secondsPerRun: 120,
      runsPerPeriod: 5,
      roleId: null,
    })
    const [step] = await listProcessSteps(cfg, guard, staff, processId)
    expect(step.roleId).toBeNull()
    expect(step.roleName).toBeNull()
    expect(step.roleCentsPerHour).toBeNull()
  })

  it("a new step inherits the MAP's role when the caller says nothing", async () => {
    const db = holder.db as DatabaseSync
    const processId = await aMap()
    db.exec(`UPDATE processes SET role_id = 'ROLE_ADJ' WHERE id = '${processId}'`)
    await addStep(cfg, guard, staff, actor, {
      processId,
      name: "Assess it",
      secondsPerRun: 900,
      runsPerPeriod: 40,
    })
    const [step] = await listProcessSteps(cfg, guard, staff, processId)
    expect(step.roleName).toBe("Adjuster")
  })

  it("REFUSES another client's role — the fence lets a staff member see both", async () => {
    const processId = await aMap()
    await expect(
      addStep(cfg, guard, staff, actor, {
        processId,
        name: "Take the call",
        secondsPerRun: 600,
        runsPerPeriod: 40,
        roleId: "ROLE_THEIRS",
      })
    ).rejects.toThrow(/live roles/)
  })

  it("clearing the role is different from leaving it alone", async () => {
    const processId = await aMap()
    await addStep(cfg, guard, staff, actor, {
      processId,
      name: "Take the call",
      secondsPerRun: 600,
      runsPerPeriod: 40,
      roleId: "ROLE_CLERK",
    })
    const [before] = await listProcessSteps(cfg, guard, staff, processId)

    // Editing the TIMES without mentioning the role must not un-name anybody.
    await updateStep(cfg, guard, staff, actor, before.id, {
      name: before.name,
      secondsPerRun: 300,
      runsPerPeriod: 40,
    })
    const [kept] = await listProcessSteps(cfg, guard, staff, processId)
    expect(kept.roleName).toBe("Dispatch clerk")

    // …and null really does clear it.
    await updateStep(cfg, guard, staff, actor, kept.id, {
      name: kept.name,
      secondsPerRun: 300,
      runsPerPeriod: 40,
      roleId: null,
    })
    const [cleared] = await listProcessSteps(cfg, guard, staff, processId)
    expect(cleared.roleId).toBeNull()
  })
})

describe("a step names what it is done in — exactly ONE", () => {
  // BOTH RESPONDENTS RULED ONE, not several, and Aurora's reason is the better
  // one: "if it's multiple tools, it's multiple steps". A step done in two
  // systems has a handoff in the middle of it, and the handoff is the thing a
  // process map exists to show. Migration 0053 built a joining table before
  // anybody re-read the answers; 0054 put the tool back on the step.

  it("saves the tool and reads it back", async () => {
    const processId = await aMap()
    await addStep(cfg, guard, staff, actor, {
      processId,
      name: "Type it up",
      secondsPerRun: 600,
      runsPerPeriod: 40,
      toolId: "TOOL_SHEET",
    })
    const [step] = await listProcessSteps(cfg, guard, staff, processId)
    expect(step.toolName).toBe("The spreadsheet")
  })

  it("changing the tool replaces it", async () => {
    const processId = await aMap()
    await addStep(cfg, guard, staff, actor, {
      processId,
      name: "Type it up",
      secondsPerRun: 600,
      runsPerPeriod: 40,
      toolId: "TOOL_SHEET",
    })
    const [step] = await listProcessSteps(cfg, guard, staff, processId)
    await updateStep(cfg, guard, staff, actor, step.id, {
      name: step.name,
      secondsPerRun: 600,
      runsPerPeriod: 40,
      toolId: "TOOL_MAIL",
    })
    const [after] = await listProcessSteps(cfg, guard, staff, processId)
    expect(after.toolName).toBe("Email")
  })

  it("saving the same tool twice is saving it once", async () => {
    const processId = await aMap()
    await addStep(cfg, guard, staff, actor, {
      processId,
      name: "Type it up",
      secondsPerRun: 600,
      runsPerPeriod: 40,
      toolId: "TOOL_SHEET",
    })
    const [step] = await listProcessSteps(cfg, guard, staff, processId)
    for (let i = 0; i < 3; i++)
      await updateStep(cfg, guard, staff, actor, step.id, {
        name: step.name,
        secondsPerRun: 600,
        runsPerPeriod: 40,
        toolId: "TOOL_SHEET",
      })
    const [after] = await listProcessSteps(cfg, guard, staff, processId)
    expect(after.toolName).toBe("The spreadsheet")
  })

  it("REFUSES another client's tool — and writes nothing on the way to the refusal", async () => {
    // A partial save is the worst answer available: the map would look finished
    // and be wrong, with three tools where the person named four.
    const processId = await aMap()
    await expect(
      addStep(cfg, guard, staff, actor, {
        processId,
        name: "Type it up",
        secondsPerRun: 600,
        runsPerPeriod: 40,
        toolId: "TOOL_THEIRS",
      })
    ).rejects.toThrow(/live tools/)
    const steps = await listProcessSteps(cfg, guard, staff, processId)
    // …and nothing was written on the way to the refusal.
    expect(steps).toHaveLength(0)
  })
})

describe("a version cut carries both forward", () => {
  it("the new version's steps keep who does them and what in", async () => {
    const processId = await aMap()
    await addStep(cfg, guard, staff, actor, {
      processId,
      name: "Take the call",
      secondsPerRun: 600,
      runsPerPeriod: 40,
      roleId: "ROLE_CLERK",
      toolId: "TOOL_SHEET",
    })
    const cut = await cutVersion(cfg, guard, staff, actor, { processId, label: "After" })
    expect(cut).toBeTruthy()

    const [now] = await listProcessSteps(cfg, guard, staff, processId, cut?.versionId)
    expect(now.roleName).toBe("Dispatch clerk")
    expect(now.roleCentsPerHour).toBe(4200)
    expect(now.toolName).toBe("The spreadsheet")
  })

  it("…and the OLD version still says what IT was mapped with", async () => {
    // The reason the join is keyed on (version_id, step_key). A client reading
    // last year's baseline should see last year's tools, even after the work
    // moved into a different system.
    const processId = await aMap()
    await addStep(cfg, guard, staff, actor, {
      processId,
      name: "Take the call",
      secondsPerRun: 600,
      runsPerPeriod: 40,
      roleId: "ROLE_CLERK",
      toolId: "TOOL_SHEET",
    })
    const before = await listProcessSteps(cfg, guard, staff, processId)
    const baselineVersion = before[0].versionId

    const cut = await cutVersion(cfg, guard, staff, actor, { processId, label: "After" })
    const [current] = await listProcessSteps(cfg, guard, staff, processId, cut?.versionId)
    await updateStep(cfg, guard, staff, actor, current.id, {
      name: current.name,
      secondsPerRun: 60,
      runsPerPeriod: 40,
      roleId: "ROLE_ADJ",
      toolId: "TOOL_MAIL",
    })

    const [baseline] = await listProcessSteps(cfg, guard, staff, processId, baselineVersion)
    expect(baseline.roleName).toBe("Dispatch clerk")
    expect(baseline.toolName).toBe("The spreadsheet")

    const [after] = await listProcessSteps(cfg, guard, staff, processId, cut?.versionId)
    expect(after.roleName).toBe("Adjuster")
    expect(after.toolName).toBe("Email")
  })
})
