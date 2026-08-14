// THE OTHER END OF THE ACCOUNT FENCE — a machine write that moves a ROW ACROSS
// the fence must stop for the confirm panel, exactly as one that moves the fence
// itself already does.
//
// WHY THIS SUITE EXISTS. `workers/tenancy/test/fence-confirm.test.ts` derives the
// confirm set from `FENCE_INPUTS` — the tables `accountScope()` READS to work out
// where a caller stands — and walks TENANCY's routes. Both halves of that miss a
// support ticket:
//
//   • `help` is not a table the fence reads. It is a table the fence is APPLIED
//     TO (`ticketFence` → `accountScopeClause(scope, "account_id")`), so it could
//     never appear in FENCE_INPUTS without making that list untrue.
//   • the door lives in CONTENT, and the tenancy scan reads tenancy's routes.
//
// So `update_help_ticket` exposed `accountId`, forwarded it, and the door set it
// on any ticket that had none — with `confirm: false`. A ticket carries its whole
// reply history, so naming a client on an internal agency ticket published that
// conversation into their portal in one call, from a model that had just been
// reading ticket text a client wrote. That is the injection path the panel exists
// to interrupt.
//
// The fix is DATA plus a derivation, not a name list: `FENCED_ROW_OWNERS` (beside
// the fence, in account-scope.ts) says which column decides who owns a row, and
// `touchesAccountFence` consults it. This suite proves the derivation from the
// DOOR'S OWN SOURCE, so a new fenced column with a new tool goes red until it
// confirms.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { stripComments } from "@shared/rules/source-scan"
import { FENCED_ROW_OWNERS } from "@shared/workers/account-scope"
import { SHARED_TOOLS } from "@shared/workers/tool-catalog"
import { isPrivilegeWrite } from "@shared/workers/tool-gates"

const helpSrc = stripComments(readFileSync(join(__dirname, "..", "src", "lib", "help.ts"), "utf8"))

/** "account_id" → "accountId" (the body field a door reads the column from). */
const camel = (col: string) => col.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

describe("the fenced-row columns are really fenced", () => {
  it("declares at least one, and each is a column the fence clause is applied to", () => {
    expect(Object.keys(FENCED_ROW_OWNERS).length).toBeGreaterThan(0)
    // `help.account_id` must actually be the column ticketFence fences on — a
    // stale line here would be a confirm panel guarding nothing.
    expect(FENCED_ROW_OWNERS.help).toBe("account_id")
    expect(helpSrc).toContain(`accountScopeClause(scope, col("account_id"))`)
  })

  it("the help door really writes that column (the scan must not go blind)", () => {
    // updateTicket's UPDATE carries account_id — this is what makes it a fence
    // write rather than an ordinary edit.
    expect(helpSrc).toMatch(/UPDATE help SET[\s\S]*?account_id = \?/)
    expect(helpSrc).toContain("input.accountId")
  })
})

describe("every catalogued tool that can set a fenced-row column CONFIRMS", () => {
  /** Tools whose door writes a fenced-row column AND that expose the body field
   * carrying it — derived from the schema, never from a list of tool names. */
  const movers = SHARED_TOOLS.filter((t) => {
    if (t.method !== "POST") return false
    const fields = Object.keys((t.schema?.properties ?? {}) as Record<string, unknown>)
    return Object.entries(FENCED_ROW_OWNERS).some(
      ([table, column]) => t.path.includes(`/${table}`) && fields.includes(camel(column))
    )
  })

  it("finds the movers (the scan itself must not go blind)", () => {
    expect(
      movers.map((t) => t.name),
      "no tool exposes a fenced-row column — the derivation has stopped seeing them"
    ).toContain("update_help_ticket")
  })

  it("each one declares confirm — a panel, before the row changes hands", () => {
    for (const t of movers)
      expect(
        t.agent.confirm === true || typeof t.agent.confirm === "function",
        `${t.name} can set a column that decides which client can read the row (and its whole reply history) — it must stop for the confirm panel`
      ).toBe(true)
  })

  it("and the shared derivation agrees — isPrivilegeWrite sees them", () => {
    for (const t of movers)
      expect(
        isPrivilegeWrite({ name: t.name, path: t.path, write: true, schema: t.schema }),
        `isPrivilegeWrite must classify ${t.name} as an access write`
      ).toBe(true)
  })
})
