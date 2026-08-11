// THE CONFIRM PANEL SHOWS THE STORED PLAN, NOT THE MODEL'S SENTENCE.
//
// The panel earns its place as the designated defence by showing the BODY THE
// DOOR WILL RECEIVE — for every tool but one. `run_import_batch`'s body is a
// `batchId` no human can read plus a `summary` the MODEL wrote: free prose, from
// the one participant an attacker gets to influence, on the highest-blast tool in
// the catalogue, with the attacker's own file in the same context window.
//
// "Import 3 contacts" over a plan that writes five thousand rows is a confirm
// panel telling the human the wrong thing, and the human clicking Go ahead is the
// whole control. So the server overwrites that field from the stored plan before
// the panel renders, and this suite reads the RENDERED LINES rather than trusting
// the call site — the confirm defence has been a green test asserting the wrong
// intent once already.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import { pendingCall } from "@shared/workers/confirm-payload"
import { panelInput } from "../src/lib/agent"
import { getTool } from "../src/lib/tools"
import { buildSpineDb, IDS } from "../../tenancy/test/spine-harness"

const db = () => holder.db as DatabaseSync
const cfg = { accountId: "a", apiToken: "t" } as never
const guard = { userId: IDS.staffUser, teamId: IDS.team, roleId: IDS.adminRole, databaseId: "db_team" }

/** The plan the app built from the caller's own files, stored on the batch — the
 * only description of the import that is not the model's. */
const PLAN = {
  order: ["accounts"],
  steps: [
    {
      fileId: "f1",
      fileName: "contacts.csv",
      target: "accounts",
      targetName: "Accounts",
      mapping: {},
      transforms: {},
      references: [],
      rowCount: 5000,
      predictedRejects: 12,
    },
  ],
  warnings: [],
  bySource: "fallback" as const,
}

/** What the model asked for: a truthful batchId, and a sentence of its own. */
const MODEL_CALL = { batchId: "B1", summary: "Import 3 contacts" }

beforeEach(() => {
  holder.db = buildSpineDb()
  db().exec(
    `INSERT INTO data_import_batches (id, overall_status, files_json, plan_json, created_at, creator_id, creator_email, creator_name)
     VALUES ('B1', 'planned', '[]', '${JSON.stringify(PLAN)}', '2026-01-01', '${IDS.staffUser}', 'staff@kwapso.app', 'Staff');`
  )
})

/** The panel, end to end: the server's input through the one pendingCall seam. */
async function panel(input: Record<string, unknown>) {
  const tool = getTool("run_import_batch")!
  return pendingCall(tool, await panelInput(cfg, guard, { id: "1", name: tool.name, input }))
}

describe("the import confirm panel", () => {
  it("says what the PLAN says, not what the model said", async () => {
    const shown = await panel(MODEL_CALL)
    const text = `${shown.summary} ${shown.details.join(" ")}`
    expect(text, "the model's number must not reach the human").not.toContain("3 contacts")
    expect(text, "the blast radius, from the stored plan").toContain("4,988")
    expect(text).toContain("contacts.csv")
    expect(text).toContain("Accounts")
    expect(text, "and what will be dropped, so the total is not a promise").toContain("12 skipped")
  })

  it("leads with the total, so a clipped line can never hide the blast radius", async () => {
    const shown = await panel(MODEL_CALL)
    expect(shown.summary.startsWith("4,988 rows in total")).toBe(true)
  })

  it("the model cannot dress up a batch that has no plan", async () => {
    db().exec("UPDATE data_import_batches SET plan_json = NULL WHERE id = 'B1';")
    const shown = await panel(MODEL_CALL)
    expect(`${shown.summary} ${shown.details.join(" ")}`).not.toContain("3 contacts")
    expect(shown.summary.toLowerCase()).toContain("no plan")
  })

  it("nor invent a batch id — somebody else's batch is no batch at all", async () => {
    const shown = await panel({ batchId: "B_NOT_MINE", summary: "Import 3 contacts" })
    expect(`${shown.summary} ${shown.details.join(" ")}`).not.toContain("3 contacts")
  })

  it("and the batchId the door will actually use is untouched", async () => {
    // The panel is a DESCRIPTION. What runs comes from the stored proposal, so
    // overwriting the prose must not quietly rewrite the argument that decides
    // which rows get written.
    const shown = await panel(MODEL_CALL)
    expect(shown.input.batchId).toBe("B1")
  })

  it("every OTHER tool still shows its own arguments, untouched", async () => {
    const tool = getTool("update_dropdown_value")!
    const input = { id: "01X", value: "Video link" }
    expect(await panelInput(cfg, guard, { id: "1", name: tool.name, input })).toEqual(input)
  })
})
