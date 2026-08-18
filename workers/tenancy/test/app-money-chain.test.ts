// THE CHAIN THE MONEY HANGS ON: process → role → rate.
//
// The owner opened an app's Value tab and reported "I was able to see hours, but
// I was not able to see money given back". The arithmetic was right and the chain
// was broken at its first link: the New process form has asked "who does it"
// since the role rate card shipped, and the CREATE door never read the answer.
// So every map ever made was born with no role, a process with no role has no
// rate, and an app whose processes have no rate reports its hours and 0.00.
//
// It was invisible because nothing tested this chain end to end — appMoneyBack
// had no coverage at all, and the create door dropping a field is exactly the
// kind of gap a lib test cannot see. So the suite runs the REAL doors against a
// real SQLite database with the real migrations, and walks the chain link by
// link: a map with no role, a role with no rate, a rate of zero, and the whole
// thing joined up.

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

  it("counts the hours and reports NO money while the map names no role", async () => {
    const view = await money()
    expect(view.savedSecondsPerMonth).toBe(SAVED_SECONDS)
    expect(view.moneyCentsPerMonth).toBe(0)
    expect(view.unpricedProcesses).toBe(1)
    // The line carries WHICH link is missing, which is what the screen reads to
    // say so: no role at all, rather than a role nobody has priced.
    expect(view.lines[0].roleName).toBeNull()
    expect(view.lines[0].centsPerHour).toBeNull()
    expect(view.lines[0].moneyCentsPerMonth).toBeNull()
  })

  it("still reports no money when the role is named but nobody has priced it", async () => {
    await post("POST /api/tenancy/processes/update", {
      id: IDS.victimProcess,
      name: "Bergman invoice approval",
      roleName: "Bookkeeper",
    })
    const view = await money()
    expect(view.moneyCentsPerMonth).toBe(0)
    expect(view.unpricedProcesses).toBe(1)
    // …and the two states are DISTINGUISHABLE, which is the whole point: one is
    // fixed on the map, the other on the rate card, and a screen that could not
    // tell them apart could only say "unpriced" and leave somebody hunting.
    expect(view.lines[0].roleName).toBe("Bookkeeper")
    expect(view.lines[0].centsPerHour).toBeNull()
  })

  it("prices the hours once the role has a rate", async () => {
    await post("POST /api/tenancy/processes/update", {
      id: IDS.victimProcess,
      name: "Bergman invoice approval",
      roleName: "Bookkeeper",
    })
    await post("POST /api/tenancy/role-rates", {
      roleName: "Bookkeeper",
      centsPerHour: 4500,
      active: true,
    })
    const view = await money()
    expect(view.savedSecondsPerMonth).toBe(SAVED_SECONDS)
    expect(view.moneyCentsPerMonth).toBe(SAVED_HOURS * 4500)
    expect(view.unpricedProcesses).toBe(0)
    expect(view.lines[0].centsPerHour).toBe(4500)
    // R25 — the figure never travels without the sentence that says what it is
    // made of, and it comes back on the payload rather than being written here.
    expect(view.caption).toBeTruthy()
  })

  it("a rate of zero is priced, not unpriced — a zero somebody chose", async () => {
    // The nastiest of the four states: the money is 0.00 and `unpricedProcesses`
    // is 0, so the old screen showed a bare zero with no explanation at all. It
    // is a legal answer (the rate card's CHECK allows it), so the door keeps
    // saying it and the screen has to tell it apart from a broken chain — which
    // it can, because `centsPerHour` is 0 and not null.
    await post("POST /api/tenancy/processes/update", {
      id: IDS.victimProcess,
      name: "Bergman invoice approval",
      roleName: "Volunteer",
    })
    await post("POST /api/tenancy/role-rates", {
      roleName: "Volunteer",
      centsPerHour: 0,
      active: true,
    })
    const view = await money()
    expect(view.moneyCentsPerMonth).toBe(0)
    expect(view.unpricedProcesses).toBe(0)
    expect(view.lines[0].centsPerHour).toBe(0)
    expect(view.lines[0].moneyCentsPerMonth).toBe(0)
  })

  it("retiring a rate un-prices the hours rather than keeping a stale number", async () => {
    await post("POST /api/tenancy/processes/update", {
      id: IDS.victimProcess,
      name: "Bergman invoice approval",
      roleName: "Bookkeeper",
    })
    await post("POST /api/tenancy/role-rates", {
      roleName: "Bookkeeper",
      centsPerHour: 4500,
      active: true,
    })
    expect((await money()).moneyCentsPerMonth).toBe(SAVED_HOURS * 4500)

    await post("POST /api/tenancy/role-rates", {
      roleName: "Bookkeeper",
      centsPerHour: 4500,
      active: false,
    })
    const view = await money()
    expect(view.moneyCentsPerMonth).toBe(0)
    // And it says so, so the screen can point at the rate card instead of
    // leaving a number that quietly became a guess.
    expect(view.unpricedProcesses).toBe(1)
    expect(view.lines[0].roleName).toBe("Bookkeeper")
    expect(view.lines[0].centsPerHour).toBeNull()
  })
})
