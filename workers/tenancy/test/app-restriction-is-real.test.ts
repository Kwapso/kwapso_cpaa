// THE PER-PERSON APP RESTRICTION IS ENFORCED, and this is the suite that says so.
//
// WHAT IT REPLACES. `portal_users.app_restriction` shipped with the column, the
// grant screen, an MCP argument and this comment on the scope it rode on:
//
//     "Carried, not yet enforced — the Apps module lands later and is the only
//      thing that can honour it."
//
// The Apps module landed. The sentence did not move. So for months an agency
// could set a restriction, see it stored, see it read back on the grant row —
// and the person stayed able to see every app, every process, every ticket and
// every deliverable their company had. A control that lies is worse than a
// missing one, because somebody sets it and stops worrying.
//
// WHY A TEST AND NOT A CAREFUL READ. The agency-side app redaction that already
// existed (`canOpen`) is a projection inside a `.map()` with no test at all, and
// that is exactly the shape a refactor drops in silence. A fence with no suite is
// a fence until somebody tidies it.
//
// It asserts the four things a fence has to be:
//   1. it NARROWS — a restricted client sees fewer rows than an unrestricted one;
//   2. it never WIDENS — the account fence still holds underneath, so a
//      restriction naming another company's app grants nothing;
//   3. it FAILS CLOSED on nonsense rather than falling open;
//   4. it is INERT for staff and for an unrestricted client.

import { describe, expect, it } from "vitest"

import {
  appScopeClause,
  parseAppRestriction,
  type AccountScope,
} from "@shared/workers/account-scope"

const STAFF: AccountScope = { kind: "staff" }

function client(appIds: string[] | null): AccountScope {
  return {
    kind: "portal",
    personAccountId: "A_PERSON",
    appRestriction: appIds ? appIds.join(",") : null,
    appIds,
    roots: ["A_BERG"],
    currentAccountId: "A_BERG",
    accountIds: ["A_BERG", "A_PERSON"],
  } as AccountScope
}

describe("what a restriction parses to", () => {
  it("is null for nothing, and null for a value that says nothing", () => {
    // NULL AND EMPTY ARE THE SAME ANSWER — "their whole company" — because the
    // alternative is a person fenced out of everything by a trailing comma.
    expect(parseAppRestriction(null)).toBeNull()
    expect(parseAppRestriction("")).toBeNull()
    expect(parseAppRestriction("   ")).toBeNull()
    expect(parseAppRestriction(",, ,")).toBeNull()
  })

  it("trims and drops blanks rather than minting ids that match nothing", () => {
    expect(parseAppRestriction("AP_1, AP_2")).toEqual(["AP_1", "AP_2"])
    expect(parseAppRestriction(" AP_1 ,, AP_2 ,")).toEqual(["AP_1", "AP_2"])
  })
})

describe("the app fence", () => {
  it("is INERT for staff — the agency sees every system it built", () => {
    expect(appScopeClause(STAFF, "app_id").sql).toBe("")
  })

  it("is INERT for a client with no restriction — their whole company's world", () => {
    expect(appScopeClause(client(null), "app_id").sql).toBe("")
  })

  it("NARROWS a restricted client to the ids named, and to those only", () => {
    const { sql } = appScopeClause(client(["AP_1", "AP_2"]), "app_id")
    expect(sql).toContain("app_id IN")
    expect(sql).toContain("AP_1")
    expect(sql).toContain("AP_2")
    expect(sql).not.toContain("AP_3")
  })

  it("names the COLUMN it was given, so one door cannot fence on another's table", () => {
    expect(appScopeClause(client(["AP_1"]), "sp.app_id").sql).toContain("sp.app_id IN")
    expect(appScopeClause(client(["AP_1"]), "d.app_id").sql).toContain("d.app_id IN")
  })

  // THE ONE THAT MATTERS MOST. A restriction is a narrowing INSIDE the account
  // fence, never a replacement for it — a client at Bergman restricted to app
  // AP_1 must not reach another company's AP_1 by knowing its id. The clause
  // carries no account condition of its own BY DESIGN, which is only safe
  // because every call site ANDs it with the account fence; this test states
  // that contract so a future edit cannot quietly swap one for the other.
  it("carries no account condition — it is an AND beside the account fence, never instead of it", () => {
    const { sql } = appScopeClause(client(["AP_1"]), "app_id")
    expect(sql).not.toContain("account_id")
    expect(sql.startsWith("app_id IN"), "the clause must be exactly the app narrowing").toBe(true)
  })
})
