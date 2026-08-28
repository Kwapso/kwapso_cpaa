// TWENTY-ONE TOOLS BECAME ONE. THIS IS THE PROOF IT WAS A REFACTOR.
//
// On 29 Aug 2026 the agent's `set_account_active`, `set_role_active`,
// `set_app_active` … `set_staff_certificate_active` collapsed into a single
// `set_record_active` over `RECORD_TOGGLES`. The saving is real — about 2,500
// tokens of schema, re-sent on every model step of every turn — and so is the
// risk, because a collapse is the one refactor that can quietly change
// behaviour in twenty-one places at once while the build stays green.
//
// Four things are pinned here, and each is a different way the collapse could
// have gone wrong without anybody noticing:
//
//   1. EVERY DOOR IS STILL REACHABLE, proved by RUNNING `route` rather than by
//      reading the list beside it. The same standard R22 holds `buildBody` to,
//      and for the same reason: a list is a claim, a run is an observation.
//   2. EVERY DOOR STILL RECEIVES THE BODY IT READS — the right id field under
//      the right name, `roleId` where the roles door says `roleId`.
//   3. THE CONFIRM MATRIX IS UNCHANGED, both directions, all twenty-one,
//      against a table captured from the twenty-one tools BEFORE they were
//      deleted. This is the assertion the whole file exists for.
//   4. THE MCP SURFACE KEPT ITS NAMES. A tool name there is an external
//      contract; `set_${record}_active` reproduces every historical one exactly
//      — `set_dropdown_value_active` included, which is why the record is called
//      `dropdown_value` and not `dropdown`.

import { describe, expect, it } from "vitest"

import { RECORD_TOGGLES } from "@shared/workers/record-toggles"
import { alwaysConfirms, TOOL_GATES } from "@shared/workers/tool-gates"
import { getTool, requiresConfirm } from "../../data-ops/src/lib/tools"
import { ROUTES as TENANCY_ROUTES } from "../../tenancy/src/index"
import { ROUTES as CONTENT_ROUTES } from "../../content/src/index"
import { getMcpTool } from "../src/lib/tools"

const tool = () => getTool("set_record_active")!

/** WHAT THE TWENTY-ONE TOOLS ANSWERED, captured off the catalogue on 29 Aug 2026
 * before they were deleted, keyed by the record the collapsed tool now names.
 *
 * "always" = the panel opened whichever way the switch went (an access write);
 * "off" = only when switching something off; "never" = it ran straight through.
 * Three behaviours, not two — which is exactly the distinction a tidy-up loses,
 * because "they are all the same shape" is true of the SQL and false of the
 * question being asked of a person. */
const BEFORE: Record<string, "always" | "off" | "never"> = {
  account: "off",
  contact_link: "always",
  portal_access: "always",
  role: "always",
  dropdown_value: "off",
  app: "off",
  app_module: "off",
  process: "off",
  wave: "always",
  client_department: "never",
  client_role: "never",
  client_tool: "never",
  account_rate: "always",
  internal_rate: "always",
  meeting: "off",
  knowledge_source: "off",
  deliverable: "off",
  brand_asset: "off",
  meeting_purpose: "off",
  staff_profile: "always",
  staff_certificate: "off",
}

describe("the collapse covers exactly what it replaced", () => {
  it("twenty-one records, and the captured matrix names every one of them", () => {
    expect(Object.keys(RECORD_TOGGLES)).toHaveLength(21)
    expect(Object.keys(BEFORE).sort()).toEqual(Object.keys(RECORD_TOGGLES).sort())
  })

  it("the one tool declares every door in the family", () => {
    expect(new Set(tool().routes)).toEqual(
      new Set(Object.values(RECORD_TOGGLES).map((e) => e.path))
    )
  })
})

describe("every door is REACHABLE — run the router, do not read the list", () => {
  for (const [record, entry] of Object.entries(RECORD_TOGGLES))
    it(`"${record}" routes to ${entry.path}`, () => {
      const dest = tool().route!({ record, id: "01ROW", roleId: "01ROW", active: false })
      expect(dest).toEqual({ binding: entry.binding, path: entry.path })
      // …and that door really exists on that worker's own switchboard.
      const table = entry.binding === "TENANCY" ? TENANCY_ROUTES : CONTENT_ROUTES
      expect(
        Object.keys(table),
        `${entry.binding} must serve POST ${entry.path}`
      ).toContain(`POST ${entry.path}`)
    })

  it("an unrecognised record falls back to the canonical door rather than composing one", () => {
    for (const nonsense of ["", "__proto__", "constructor", "internal_rate_card", "../../admin"]) {
      const dest = tool().route!({ record: nonsense, id: "x", active: true })
      expect(dest.path, `"${nonsense}" must not build a path`).toBe("/api/tenancy/accounts/active")
      expect(dest.binding).toBe("TENANCY")
    }
  })
})

describe("every door still receives the body it reads", () => {
  for (const [record, entry] of Object.entries(RECORD_TOGGLES))
    it(`"${record}" sends ${entry.idField}${entry.needsAppId ? " + appId" : ""}`, () => {
      const body = tool().buildBody!({
        record,
        id: "01ROW",
        roleId: "01ROW",
        appId: "01APP",
        active: true,
      })
      expect(body[entry.idField]).toBe("01ROW")
      expect(body.active).toBe(true)
      expect("appId" in body, `${record} ${entry.needsAppId ? "needs" : "must not send"} appId`).toBe(
        Boolean(entry.needsAppId)
      )
      // The roles door reads `roleId` and nothing else — sending `id` beside it
      // would be a field the door ignores and a caller believes in.
      if (entry.idField === "roleId") expect("id" in body).toBe(false)
    })

  it("an id sent under the other spelling still arrives (a caller is not punished for it)", () => {
    expect(tool().buildBody!({ record: "role", id: "01ROLE", active: false }).roleId).toBe("01ROLE")
    expect(tool().buildBody!({ record: "account", roleId: "01ACC", active: false }).id).toBe("01ACC")
  })
})

describe("THE CONFIRM MATRIX IS UNCHANGED — both directions, all twenty-one", () => {
  for (const [record, was] of Object.entries(BEFORE)) {
    it(`"${record}" asks exactly when it used to`, () => {
      const offAsks = was !== "never"
      const onAsks = was === "always"
      expect(
        requiresConfirm(tool(), { record, active: false }),
        `switching "${record}" OFF used to ${offAsks ? "ask" : "run straight through"}`
      ).toBe(offAsks)
      expect(
        requiresConfirm(tool(), { record, active: true }),
        `switching "${record}" ON used to ${onAsks ? "ask" : "run straight through"}`
      ).toBe(onAsks)
    })
  }

  it("the derivation may only UPGRADE a declaration, never soften one", () => {
    // `alwaysConfirms` runs the same isPrivilegeWrite reasoning the individual
    // tools rode. Where it says yes, the entry must ask both ways whatever it
    // declared — so a toggle added tomorrow on a privilege module is safe even
    // if whoever added it wrote "off".
    for (const [record, entry] of Object.entries(RECORD_TOGGLES))
      if (alwaysConfirms(entry))
        expect(
          requiresConfirm(tool(), { record, active: true }),
          `${record} is derived as an access write and must ask both ways`
        ).toBe(true)
    // …and it really does fire for the access writes, or the clause above is
    // vacuous and this whole safety net is decoration.
    expect(alwaysConfirms(RECORD_TOGGLES.role)).toBe(true)
    expect(alwaysConfirms(RECORD_TOGGLES.portal_access)).toBe(true)
    expect(alwaysConfirms(RECORD_TOGGLES.account), "archiving a customer is not an access write").toBe(
      false
    )
  })

  it("an unrecognised record asks — the safe direction for a question with no answer", () => {
    expect(requiresConfirm(tool(), { record: "whatever", active: true })).toBe(true)
    expect(requiresConfirm(tool(), { active: true })).toBe(true)
  })
})

describe("the MCP surface kept its twenty-one names, and their gates", () => {
  for (const record of Object.keys(RECORD_TOGGLES))
    it(`still publishes set_${record}_active`, () => {
      const t = getMcpTool(`set_${record}_active`)
      expect(t, `set_${record}_active is an external contract — it may not be renamed`).toBeDefined()
      expect(t!.path).toBe(RECORD_TOGGLES[record].path)
      expect(t!.method).toBe("POST")
    })

  it("each entry's declared gate is the one TOOL_GATES already published", () => {
    // The entry carries its own gate because a collapsed tool has no single one
    // — and this is what stops the two copies drifting. TOOL_GATES is still the
    // map an owner reads and the MCP description still quotes it.
    for (const [record, entry] of Object.entries(RECORD_TOGGLES))
      expect(TOOL_GATES[`set_${record}_active`], `set_${record}_active's gate`).toBe(entry.gate)
  })

  it("the pinned external name is reproduced, not approximated", () => {
    // `set_dropdown_value_active` was an mcpName override before the collapse.
    // It comes out of `set_${record}_active` unchanged, which is why the record
    // is `dropdown_value` — the naming was chosen to fit the contract, not the
    // other way round.
    expect(getMcpTool("set_dropdown_value_active")).toBeDefined()
    expect(getMcpTool("set_dropdown_active")).toBeUndefined()
  })

  it("every published summary is a real sentence, not a placeholder", () => {
    for (const [record, entry] of Object.entries(RECORD_TOGGLES)) {
      expect(entry.summary.length, `${record} needs a description somebody can act on`).toBeGreaterThan(40)
      expect(getMcpTool(`set_${record}_active`)!.description).toContain(entry.summary)
    }
  })
})
