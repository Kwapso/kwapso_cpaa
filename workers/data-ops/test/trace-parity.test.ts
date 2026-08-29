// Screen-trace parity: every WRITE tool in the agent's catalog must map to a real
// screen (agent-trace.ts) or sit on the explicit SCREENLESS list with a reason —
// so the co-pilot's "watch it happen on the real screen" can never silently rot
// as tools are added. agent-trace.ts is deliberately pure/DOM-free so this
// worker-side test can import it.

import { describe, expect, it } from "vitest"

import { RECORD_TOGGLES } from "@shared/workers/record-toggles"
import { SCREENLESS_TOGGLE_RECORDS, SCREENLESS_WRITE_TOOLS, traceFor } from "../../../web/lib/agent-trace"
import { TOOL_CATALOG } from "../src/lib/tools"

/** The inputs a tool can be traced with. One per tool, EXCEPT the collapsed
 * `set_record_active`, which performs twenty-one different acts and therefore
 * owes twenty-one different screens — asking it once with no record named would
 * check one twenty-first of what it does, which is how a collapse loses a screen
 * quietly. */
const IDS = { id: "x", roleId: "x", userId: "x", inviteId: "x", helpId: "x", batchId: "x", appId: "x" }
function callsFor(name: string): { label: string; input: Record<string, unknown> }[] {
  if (name !== "set_record_active") return [{ label: name, input: IDS }]
  return Object.keys(RECORD_TOGGLES)
    .filter((r) => !SCREENLESS_TOGGLE_RECORDS.includes(r))
    .map((record) => ({ label: `${name} (record: ${record})`, input: { ...IDS, record } }))
}

describe("screen-trace parity: the co-pilot can show every write on a real screen", () => {
  it("every write tool traces to a screen (or is explicitly screenless)", () => {
    for (const t of TOOL_CATALOG) {
      if (!t.write || t.identityBlocked) continue
      if (SCREENLESS_WRITE_TOOLS.includes(t.name)) continue
      for (const call of callsFor(t.name)) {
        const target = traceFor(t.name, call.input, "team1")
        expect(target, `write tool "${call.label}" must map to a screen in agent-trace.ts (or join SCREENLESS_WRITE_TOOLS / SCREENLESS_TOGGLE_RECORDS with a reason)`).not.toBeNull()
        expect(target?.path.startsWith("/t/team1"), `"${call.label}" must target the team host`).toBe(true)
      }
    }
  })

  it("every record kind the collapsed toggle covers is judged (screened or reasoned)", () => {
    // The collapse's own tripwire: a record added to RECORD_TOGGLES that is
    // neither mapped nor reasoned would otherwise vanish from the loop above.
    const judged = new Set(Object.keys(RECORD_TOGGLES))
    expect(judged.size, "the toggle map has gone empty").toBeGreaterThan(15)
    for (const record of judged) {
      const screened = traceFor("set_record_active", { ...IDS, record }, "team1") !== null
      expect(
        screened !== SCREENLESS_TOGGLE_RECORDS.includes(record),
        `record "${record}" must EITHER map to a screen OR be listed in SCREENLESS_TOGGLE_RECORDS with a reason — never both, never neither`
      ).toBe(true)
    }
  })

  it("detail-target tools land on the RECORD when ids are present", () => {
    expect(traceFor("update_role", { roleId: "R1" }, "tm")?.path).toBe("/t/tm/roles/R1")
    expect(traceFor("set_member_role", { userId: "U1" }, "tm")?.path).toBe("/t/tm/members/U1")
    expect(traceFor("run_import_batch", { batchId: "B1" }, "tm")?.path).toBe("/t/tm/import")
  })

  // The systemic fix: a trace shows the RESULT, never re-opens an input form. Creates
  // land on the collection list (row-level live-sync shows the new row); a rename lands
  // on the overview. The `query`/`panel` capability is gone from TraceTarget entirely,
  // so a blank "new record" form can no longer be left open (the reported bug).
  it("creates + rename land where the change is visible, not on a form dialog", () => {
    expect(traceFor("create_role", {}, "tm")?.path).toBe("/t/tm/roles")
    expect(traceFor("invite_member", {}, "tm")?.path).toBe("/t/tm/invites")
    expect(traceFor("update_team", {}, "tm")?.path).toBe("/t/tm")
    // No trace may carry query params — the field doesn't exist, so no dialog can open.
    for (const t of TOOL_CATALOG) {
      if (!t.write || t.identityBlocked) continue
      for (const call of callsFor(t.name)) {
        const target = traceFor(t.name, call.input, "tm")
        expect(Object.keys(target ?? {}), `"${call.label}" trace must be path/highlight only (no dialog query)`).not.toContain("query")
      }
    }
  })

  it("reads stay quiet (no screen driving for list_*)", () => {
    expect(traceFor("list_roles", {}, "tm")).toBeNull()
  })
})
