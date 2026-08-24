// WHAT A CLIENT'S OWN PEOPLE COST, AND WHO AT THE CLIENT MAY SEE IT.
//
// THE OWNER, 24 Aug 2026, settling his disagreement with Aurora:
//
//   "everybody from the Kwapso system can see this, but from the client portal
//    site, the main stakeholder of that app could see it."
//
// Aurora said every contact should see it — it is their own payroll. He said
// none should, and gave the reason: "they could just get to know each other's
// salary, given that we are having cost per hour on roles, so it's not
// advisable." The person who signed the contract can check our arithmetic;
// nobody else at their company learns a colleague's rate from a screen we built.
//
// WHY THIS SUITE EXISTS AT ALL, said plainly: the hourly cost arrived on the
// impact payload the same night the money did, and the portal reads that door.
// Every contact would have seen every role's rate, on a screen that looked
// finished, because the field rode along with a figure everybody wanted. A leak
// does not have to be a mistake in a fence — it can be a new field on an old
// door.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import {
  addStep,
  createProcess,
  cutVersion,
  getProcess,
  linkProcesses,
  listProcessLinks,
  listSavings,
  mapAsOf,
  updateStep,
} from "../src/lib/processes"
import { listRoles } from "../src/lib/client-org"
import { buildSpineDb, IDS } from "./spine-harness"

const cfg = { accountId: "a", apiToken: "t" } as never
const actor = { id: IDS.staffUser, email: "staff@kwapso.app", name: "Staff" }
const guard = { userId: IDS.staffUser, teamId: IDS.team, roleId: IDS.adminRole, databaseId: "db_team" }
const staff = { kind: "staff" } as const

/** A portal caller, as the fence describes one. `personAccountId` is the contact
 * row they sign in as — the same id `app_stakeholders.contact_id` names. */
const portal = (personAccountId: string) =>
  ({
    kind: "portal",
    personAccountId,
    appRestriction: null,
    appIds: null,
    roots: [IDS.victimAccount],
    currentAccountId: IDS.victimAccount,
    accountIds: [IDS.victimAccount, personAccountId],
  }) as never

async function aPricedMap(): Promise<string> {
  const db = holder.db as DatabaseSync
  db.exec(`
    INSERT INTO client_roles (id, account_id, name, cents_per_hour, created_at)
      VALUES ('ROLE_CLERK', '${IDS.victimAccount}', 'Dispatch clerk', 6000, '2026-01-01');
  `)
  const processId = await createProcess(cfg, guard, staff, actor, {
    appId: IDS.victimApp,
    name: "Recording a damage case",
  })
  await addStep(cfg, guard, staff, actor, {
    processId,
    name: "Take the call",
    secondsPerRun: 1500,
    runsPerPeriod: 30,
    roleId: "ROLE_CLERK",
  })
  await cutVersion(cfg, guard, staff, actor, { processId, label: "After" })
  const [live] = (holder.db as DatabaseSync)
    .prepare(
      `SELECT s.id FROM process_steps s
        WHERE s.process_id = ? AND s.version_id = (SELECT v.id FROM process_versions v
          WHERE v.process_id = s.process_id ORDER BY v.version_no DESC LIMIT 1) LIMIT 1`
    )
    .all(processId) as { id: string }[]
  await updateStep(cfg, guard, staff, actor, live.id, {
    name: "Take the call",
    secondsPerRun: 300,
    runsPerPeriod: 30,
    roleId: "ROLE_CLERK",
  })
  return processId
}

/** Name a contact as the main stakeholder of the victim's app. */
function makeMainStakeholder(contactId: string): void {
  ;(holder.db as DatabaseSync).exec(
    `INSERT INTO app_stakeholders (id, app_id, contact_id, is_main, created_at)
       VALUES ('AS_MAIN', '${IDS.victimApp}', '${contactId}', 1, '2026-02-01')`
  )
}

beforeEach(() => {
  holder.db = buildSpineDb()
})

describe("an hourly cost in the client portal", () => {
  it("reaches OUR OWN people in full — everybody in the Kwapso system sees it", async () => {
    const processId = await aPricedMap()
    const view = await listSavings(cfg, guard, staff, { processId })
    expect(view.savedCentsPerMonth).toBe(60000)
    expect(view.apps[0].processes[0].steps[0].roleCentsPerHour).toBe(6000)
  })

  it("reaches the app's MAIN STAKEHOLDER — the person who signed the contract can check the arithmetic", async () => {
    const processId = await aPricedMap()
    makeMainStakeholder(IDS.victimPerson)
    const view = await listSavings(cfg, guard, portal(IDS.victimPerson), { processId })
    expect(view.savedCentsPerMonth).toBe(60000)
    expect(view.apps[0].processes[0].steps[0].roleCentsPerHour).toBe(6000)
  })

  it("does NOT reach any other contact at the same company", async () => {
    // The whole point of the owner's objection: a colleague must not learn what
    // another colleague costs from a screen we built.
    const processId = await aPricedMap()
    makeMainStakeholder(IDS.victimPerson)
    const view = await listSavings(cfg, guard, portal(IDS.victimContact), { processId })
    const step = view.apps[0].processes[0].steps[0]
    expect(step.roleCentsPerHour, "the rate never crosses the wire").toBeNull()
    expect(step.savedCentsPerMonth, "and the money it would have produced comes out null").toBeNull()
    expect(view.savedCentsPerMonth, "so the total is zero money, not a wrong number").toBe(0)
  })

  it("…and the HOURS still reach them in full — the saving is still theirs to read", async () => {
    // Withholding the rate must not withhold the work. A client who cannot see
    // the money should still see that twenty minutes a run became five.
    const processId = await aPricedMap()
    makeMainStakeholder(IDS.victimPerson)
    const view = await listSavings(cfg, guard, portal(IDS.victimContact), { processId })
    expect(view.savedSecondsPerMonth).toBe(20 * 60 * 30)
    expect(view.apps[0].processes[0].steps[0].baselineSecondsPerRun).toBe(1500)
  })

  it("an app with NO main stakeholder shows the money to no client at all", async () => {
    // The safe direction. Nobody named means nobody is the person who signed, so
    // the rate stays ours until somebody says who it is.
    const processId = await aPricedMap()
    const view = await listSavings(cfg, guard, portal(IDS.victimPerson), { processId })
    expect(view.apps[0].processes[0].steps[0].roleCentsPerHour).toBeNull()
  })

  it("the screen can tell WITHHELD from UNPRICED, because it is told how many are priced", async () => {
    // Both read as "no money", and they are different facts: one is "we have not
    // asked what a clerk costs" and the other is "this is not yours to see".
    // `pricedSteps` is what lets a screen say the first without claiming the
    // second.
    const processId = await aPricedMap()
    makeMainStakeholder(IDS.victimPerson)
    const main = await listSavings(cfg, guard, portal(IDS.victimPerson), { processId })
    const other = await listSavings(cfg, guard, portal(IDS.victimContact), { processId })
    expect(main.pricedSteps).toBe(1)
    expect(other.pricedSteps).toBe(0)
    expect(other.totalSteps).toBe(1)
  })
})

describe("the same rule, at every door that carries the number", () => {
  // THE FINDING THAT MADE THIS BLOCK EXIST, 25 Aug 2026. The rule shipped in
  // `listSavings` alone. The SAME field rode `listProcessSteps` and `mapAsOf`,
  // both reached through `GET /api/tenancy/processes/detail` — a door that
  // FENCES a client login rather than refusing one, which is R21's whole
  // premise. So one response carried the redaction and the leak together: the
  // saving's steps had a null rate and the map's steps did not.
  //
  // A ruling enforced at one door is not enforced.

  it("the MAP's steps withhold it, not just the saving's", async () => {
    const processId = await aPricedMap()
    makeMainStakeholder(IDS.victimPerson)
    const d = await getProcess(cfg, guard, portal(IDS.victimContact), processId)
    expect(d.saving?.steps[0].savedCentsPerMonth, "the saving was already right").toBeNull()
    expect(
      d.steps[0].roleCentsPerHour,
      "…and the map's own steps, in the SAME payload, must be too"
    ).toBeNull()
  })

  it("the DATE SLIDER withholds it — history is not a way around a fence", async () => {
    const processId = await aPricedMap()
    makeMainStakeholder(IDS.victimPerson)
    const today = new Date().toISOString().slice(0, 10)
    const then = await mapAsOf(
      cfg,
      guard,
      portal(IDS.victimContact),
      processId,
      today,
      new Set<string>(),
      IDS.victimApp
    )
    expect(then[0]?.roleCentsPerHour ?? null).toBeNull()
  })

  it("…and the main stakeholder still gets it on both", async () => {
    const processId = await aPricedMap()
    makeMainStakeholder(IDS.victimPerson)
    const d = await getProcess(cfg, guard, portal(IDS.victimPerson), processId)
    expect(d.steps[0].roleCentsPerHour).toBe(6000)
    expect(d.saving?.steps[0].savedCentsPerMonth).toBeGreaterThan(0)
  })

  it("the CLIENT-ROLES door withholds it from every contact", async () => {
    // One hop away, gated on the same right, and it needs no process id at all:
    // a contact could simply ask for their company's roles and read every rate.
    await aPricedMap()
    const staffRoles = await listRoles(cfg, guard, staff)
    expect(staffRoles.find((r) => r.id === "ROLE_CLERK")?.centsPerHour).toBe(6000)
    const theirs = await listRoles(cfg, guard, portal(IDS.victimPerson))
    expect(
      theirs.find((r) => r.id === "ROLE_CLERK")?.centsPerHour,
      "a role is not attached to an app, so there is no stakeholder test to ask — no rate here at all"
    ).toBeNull()
  })
})

describe("a connection between two maps", () => {
  it("REFUSES two different clients — reaching both is not the same as their belonging together", async () => {
    const mine = await aPricedMap()
    ;(holder.db as DatabaseSync).exec(`
      INSERT INTO accounts (id, account_type, name, created_at)
        VALUES ('A_OTHER', 'entity', 'Somebody else', '2026-01-01');
      INSERT INTO apps (id, account_id, name, created_at)
        VALUES ('AP_OTHER', 'A_OTHER', 'Their system', '2026-01-01');
    `)
    const theirs = await createProcess(cfg, guard, staff, actor, {
      appId: "AP_OTHER",
      name: "Their own way of working",
    })
    await expect(
      linkProcesses(cfg, guard, staff, actor, { fromProcessId: mine, toProcessId: theirs })
    ).rejects.toThrow(/different clients/)
  })

  it("and the READ fences the table it joins, so a historic cross-client row cannot leak a name", async () => {
    // The write refuses one now. A row written before it did — or by any other
    // path — must still not hand another client's process NAME back through a
    // query that only fenced the link row.
    const mine = await aPricedMap()
    ;(holder.db as DatabaseSync).exec(`
      INSERT INTO accounts (id, account_type, name, created_at)
        VALUES ('A_OTHER', 'entity', 'Somebody else', '2026-01-01');
      INSERT INTO apps (id, account_id, name, created_at)
        VALUES ('AP_OTHER', 'A_OTHER', 'Their system', '2026-01-01');
      INSERT INTO processes (id, app_id, account_id, name, created_at)
        VALUES ('PR_OTHER', 'AP_OTHER', 'A_OTHER', 'Their secret way of working', '2026-01-01');
      INSERT INTO process_links (id, account_id, from_process_id, to_process_id, created_at)
        VALUES ('LNK_BAD', '${IDS.victimAccount}', '${mine}', 'PR_OTHER', '2026-02-01');
    `)
    const seen = await listProcessLinks(cfg, guard, portal(IDS.victimPerson), mine)
    expect(
      seen.map((l) => l.name),
      "the other client's process name must not come back"
    ).not.toContain("Their secret way of working")
  })
})
