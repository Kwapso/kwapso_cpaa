// THE CHAIN THE MONEY HANGS ON: step → client role → frozen rate.
//
// The model moved on 25 Aug 2026. The first cut priced a process by ONE role
// named on the process against the internal rate card, and the step work then
// gave every STEP a client role whose rate is FROZEN onto the row when it is
// written — the one savings seam prices the subtraction step by step, and the
// process screen shows that figure. For six days appMoneyBack still ran the old
// arithmetic beside it, and the two disagreed on the owner's own screen:
// €2,766.35 on the map, 0.00 on the Value tab, "no role attached" about a map
// with four priced steps. One subtraction, one seam; this suite now proves the
// rollup IS the seam's answer, through the real doors against a real database:
// a map with no priced step, a step that gains a priced role, a rate of zero,
// and — the owner's ruling — a rate rise that must NOT move an agreed figure.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import type { AppMoneyBack } from "@shared/types"
import worker from "../src/index"
import { buildSpineDb, IDS, makeEnv, req } from "./spine-harness"

const asStaff = () => makeEnv(() => holder.db as DatabaseSync, IDS.staffUser)

/** The money doors gate on `commercials`, and the shared fixture's roles do not
 * hold it — deliberately: the harness exists to prove the account FENCE, and a
 * burglar holding the agency's own cost rights would be the wrong worst case
 * (R24 keeps them off the portal surface entirely). Granted here, to the STAFF
 * role only, because this suite is about the arithmetic rather than the fence. */
function letStaffSeeTheMoney() {
  holder.db?.exec(
    `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
     VALUES ('${IDS.adminRole}_commercials', '${IDS.adminRole}', 'commercials', 1, 1, 1, 1);`
  )
}

/** The saving the fixture below produces: 40 minutes a run became 10, twenty
 * runs a month. 48000s − 12000s = 36000s, which is exactly ten hours. */
const SAVED_SECONDS = 36000
const SAVED_HOURS = SAVED_SECONDS / 3600

/** A second version of the victim's map, with the same step done faster — the
 * "after" half of the subtraction, without which every saving is zero and every
 * assertion below would pass for the wrong reason. */
function speedItUp() {
  holder.db?.exec(`
    INSERT INTO process_versions (id, process_id, account_id, version_no, label, created_at, creator_id)
      VALUES ('PV2', '${IDS.victimProcess}', '${IDS.victimAccount}', 2, 'How it works now', '2026-03-01', '${IDS.staffUser}');
    INSERT INTO process_steps (id, process_id, version_id, account_id, step_key, name, position, seconds_per_run, runs_per_month, created_at, creator_id)
      VALUES ('PS2', '${IDS.victimProcess}', 'PV2', '${IDS.victimAccount}', 'SK_VICTIM', 'Check it against the order', 0, 600, 20, '2026-03-01', '${IDS.staffUser}');
  `)
}

async function money(): Promise<AppMoneyBack> {
  const res = await worker.fetch(
    req("GET /api/tenancy/app-money", undefined, `?appId=${IDS.victimApp}`),
    asStaff()
  )
  expect(res.status, await res.clone().text()).toBe(200)
  return (await res.json()) as AppMoneyBack
}

async function post(route: string, body: unknown) {
  const res = await worker.fetch(req(route, body), asStaff())
  expect(res.status, await res.clone().text()).toBe(200)
  return res
}

describe("mapping a process keeps the role the person named", () => {
  beforeEach(() => {
    holder.db = buildSpineDb()
  })

  it("stores roleName on CREATE, not only on edit", async () => {
    // THE BUG, in one assertion. The form collected "Bookkeeper", the door threw
    // it away, and the only way to attach a role was to save the map and then
    // edit it — which nobody knew they had to do, because the field was right
    // there on the form they had just filled in.
    await post("POST /api/tenancy/processes", {
      appId: IDS.victimApp,
      name: "Bergman supplier onboarding",
      roleName: "Bookkeeper",
    })
    const row = holder.db
      ?.prepare("SELECT role_name FROM processes WHERE name = ?")
      .get("Bergman supplier onboarding") as { role_name: string | null }
    expect(row.role_name).toBe("Bookkeeper")
  })

  it("still allows a map with no role — naming one is not compulsory", async () => {
    await post("POST /api/tenancy/processes", { appId: IDS.victimApp, name: "Unassigned work" })
    const row = holder.db
      ?.prepare("SELECT role_name FROM processes WHERE name = ?")
      .get("Unassigned work") as { role_name: string | null }
    expect(row.role_name).toBeNull()
  })
})

describe("an app's money, link by link", () => {
  beforeEach(() => {
    holder.db = buildSpineDb()
    letStaffSeeTheMoney()
    speedItUp()
  })

  /** A client role on the victim's account, priced, through the real door. */
  async function priceARole(name: string, centsPerHour: number): Promise<string> {
    const res = await post("POST /api/tenancy/client/roles", {
      accountId: IDS.victimAccount,
      name,
      centsPerHour,
    })
    const body = (await res.json()) as { id: string }
    return body.id
  }

  /** Attach a role to the current version's step through the steps door — the
   * moment the rate FREEZES onto the row. */
  async function saySomebodyDoesIt(roleId: string) {
    await post("POST /api/tenancy/processes/steps/update", {
      id: "PS2",
      name: "Check it against the order",
      secondsPerRun: 600,
      runsPerPeriod: 20,
      frequencyPeriod: "month",
      roleId,
    })
  }

  it("counts the hours and reports NO money while no step names a role", async () => {
    const view = await money()
    expect(view.savedSecondsPerMonth).toBe(SAVED_SECONDS)
    expect(view.moneyCentsPerMonth).toBe(0)
    expect(view.unpricedProcesses).toBe(1)
    // The line says WHICH link is missing in the seam's own terms: the money's
    // coverage, step by step — which is what the screen reads to say so.
    expect(view.lines[0].pricedSteps).toBe(0)
    expect(view.lines[0].totalSteps).toBeGreaterThan(0)
    expect(view.lines[0].moneyCentsPerMonth).toBeNull()
  })

  it("prices the hours once a step's role carries a rate", async () => {
    await saySomebodyDoesIt(await priceARole("Bookkeeper", 4500))
    const view = await money()
    expect(view.savedSecondsPerMonth).toBe(SAVED_SECONDS)
    expect(view.moneyCentsPerMonth).toBe(SAVED_HOURS * 4500)
    expect(view.unpricedProcesses).toBe(0)
    expect(view.lines[0].pricedSteps).toBe(1)
    // R25 — the figure never travels without the sentence that says what it is
    // made of, and it comes back on the payload rather than being written here.
    expect(view.caption).toBeTruthy()
  })

  it("a rate of zero is priced, not unpriced — a zero somebody chose", async () => {
    // The nastiest state: the money is 0.00 and nothing is missing. Legal (the
    // rate card's CHECK allows zero), and the payload keeps it distinguishable
    // from a broken chain: pricedSteps counts it, moneyCentsPerMonth is 0, not
    // null — so the screen shows an honest zero instead of a fix-it box.
    await saySomebodyDoesIt(await priceARole("Volunteer", 0))
    const view = await money()
    expect(view.moneyCentsPerMonth).toBe(0)
    expect(view.unpricedProcesses).toBe(0)
    expect(view.lines[0].pricedSteps).toBe(1)
    expect(view.lines[0].moneyCentsPerMonth).toBe(0)
  })

  it("a pay rise CANNOT move an agreed figure — the rate is frozen on the step", async () => {
    // The owner's ruling, proved at the rollup: what a client was told their
    // saving is worth must not drift when a rate is corrected next year. The
    // step froze 4500 when the role was attached; re-pricing the role moves
    // nothing already written.
    const roleId = await priceARole("Bookkeeper", 4500)
    await saySomebodyDoesIt(roleId)
    expect((await money()).moneyCentsPerMonth).toBe(SAVED_HOURS * 4500)

    await post("POST /api/tenancy/client/roles/update", {
      id: roleId,
      name: "Bookkeeper",
      centsPerHour: 9900,
    })
    const view = await money()
    expect(view.moneyCentsPerMonth).toBe(SAVED_HOURS * 4500)
    expect(view.unpricedProcesses).toBe(0)
  })

  it("partial coverage is said on the line — priced and total steps travel", async () => {
    await saySomebodyDoesIt(await priceARole("Bookkeeper", 4500))
    // A second, unpriced step in the current version: the money is now partial
    // and the line has to say so rather than reading as the whole answer.
    await post("POST /api/tenancy/processes/steps", {
      processId: IDS.victimProcess,
      name: "File the paperwork",
      secondsPerRun: 300,
      runsPerPeriod: 20,
      frequencyPeriod: "month",
      roleId: null,
    })
    const view = await money()
    expect(view.lines[0].pricedSteps).toBe(1)
    expect(view.lines[0].totalSteps).toBe(2)
    expect(view.moneyCentsPerMonth).toBe(SAVED_HOURS * 4500)
    // Partial is not "unpriced": the fix-it box is for a map with NOTHING.
    expect(view.unpricedProcesses).toBe(0)
  })
})
