// THE ACCOUNT FENCE'S CONFIRM RULE — a machine-surface write that changes WHO
// CAN SEE WHOSE must stop for the agent's yes/no panel, exactly as a write that
// changes who can do what already does.
//
// WHY THIS SUITE EXISTS, precisely. The confirm set used to be derived from a
// list of three MODULE names (member_roles, team_members, portal_users). That
// derivation is honest about permissions and blind to the fence: `link_contact`
// is gated accounts:create and `set_account_parent` is gated accounts:edit, so
// neither looked like a privilege write — while both change an input the fence
// reads, and either one silently widens what an outside company's login can
// read. A green test that asserts the wrong intent is how the first confirm gap
// hid; this one asserts the intent from the DOORS' OWN SOURCE rather than from
// anybody's list.
//
// The scan, in one line: the fence declares its inputs (FENCE_INPUTS, beside the
// SQL that reads them) → a tenancy door announces what it changed by PUBLISHING
// that table (R1 guarantees every mutation publishes) → so a door whose publish
// names a fence input is a fence write → and any catalogued tool posting to it
// must DECLARE confirm: true. Add a door tomorrow that writes account_links and
// a tool that reaches it, and this goes red until the tool confirms — even if
// the runtime derivation's name-matching missed it.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { indexFunctions } from "@shared/rules/seam-scan"
import { stripComments } from "@shared/rules/source-scan"
import { FENCE_INPUTS } from "@shared/workers/account-scope"
import { SHARED_TOOLS } from "@shared/workers/tool-catalog"
import { isPrivilegeWrite } from "@shared/workers/tool-gates"
import { ROUTES } from "../src/index"

const SHARED = join(__dirname, "..", "..", "..", "shared", "workers")

/** "parent_account_id" → "parentAccountId" (the body field a door reads it from). */
const camel = (col: string): string => col.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

describe("the fence's declared inputs match the SQL that reads them", () => {
  // Everything from the first statement to the end of accountScope() — the three
  // reads that decide a portal caller's reach, and nothing else in the file.
  const scope = stripComments(readFileSync(join(SHARED, "account-scope.ts"), "utf8"))
  const corridor = scope.slice(scope.indexOf("const ROOTS_SQL"), scope.indexOf("export function accountScopeClause"))
  const ctes = new Set([...corridor.matchAll(/WITH\s+RECURSIVE\s+(\w+)/gi)].map((m) => m[1]))
  const read = [...corridor.matchAll(/\b(?:FROM|JOIN)\s+([a-z_]+)/gi)]
    .map((m) => m[1])
    .filter((t) => !ctes.has(t))

  it("finds the corridor's reads (the scan itself must not go blind)", () => {
    expect(corridor.length).toBeGreaterThan(200)
    expect(new Set(read).size).toBeGreaterThanOrEqual(3)
  })

  it("every table the fence reads is a declared input", () => {
    for (const table of new Set(read))
      expect(
        Object.keys(FENCE_INPUTS),
        `accountScope() reads ${table} — declare it in FENCE_INPUTS (and decide whether a write to it needs a confirm panel)`
      ).toContain(table)
  })

  it("every declared input is really read (a stale line must not linger)", () => {
    for (const [table, columns] of Object.entries(FENCE_INPUTS)) {
      expect(new Set(read), `FENCE_INPUTS names ${table}, which the fence no longer reads`).toContain(table)
      for (const col of columns)
        expect(corridor.includes(col), `FENCE_INPUTS pins ${table}.${col}, which the fence no longer reads`).toBe(true)
    }
  })
})

describe("every machine write that changes the account fence confirms", () => {
  const routeFns = indexFunctions(join(__dirname, "..", "src", "routes"))

  /** The doors that write a fence input, read off their own source: route → the
   * fence table they publish. A door that writes the WHOLE row of a fence table
   * qualifies on the publish alone; one that writes a table the fence reads only
   * ONE column of has to actually carry that column's body field. */
  const fenceDoors = new Map<string, string>()
  for (const [route, def] of Object.entries(ROUTES)) {
    if (route.startsWith("GET ")) continue
    const body = routeFns.get(def.handler.name)
    if (!body) continue
    const code = stripComments(body)
    for (const m of code.matchAll(/publishChange\(\s*env\s*,\s*[\w.]+\s*,\s*"([a-z_]+)"/g)) {
      const columns = FENCE_INPUTS[m[1]]
      if (!columns) continue
      if (columns.length === 0 || columns.some((c) => new RegExp(`\\b${camel(c)}\\b`).test(code)))
        fenceDoors.set(route, m[1])
    }
  }

  it("finds the fence-writing doors (the scan itself must not go blind)", () => {
    expect(fenceDoors.size, "the account spine writes the fence from several doors").toBeGreaterThanOrEqual(6)
  })

  it("every catalogued tool on one of those doors DECLARES confirm: true", () => {
    let checked = 0
    for (const [route, table] of fenceDoors) {
      const [method, path] = route.split(" ")
      const tool = SHARED_TOOLS.find((t) => t.method === method && t.path === path)
      if (!tool) continue // a door no machine surface reaches has no panel to show
      checked++
      expect(
        isPrivilegeWrite({ name: tool.name, path: tool.path, schema: tool.schema, write: tool.agent.write }),
        `${tool.name} posts to ${route}, which writes ${table} — the account fence reads that, so the runtime derivation must call it an access write`
      ).toBe(true)
      expect(
        tool.agent.confirm,
        `${tool.name} writes ${table}, an input to the account fence — a silent one widens what a client login can see. It must DECLARE confirm: true, not a predicate and not false`
      ).toBe(true)
    }
    expect(checked, "the machine surface must actually reach the fence doors").toBeGreaterThanOrEqual(6)
  })

  it("…and an account write that changes NO fence input still runs freely", () => {
    // The other half of the rule: over-firing would put a panel in front of
    // archiving a customer, which is the friction the confirm rule exists to
    // avoid. The derivation is column-precise for exactly this reason.
    //
    // `update_account` USED TO BE ON THIS LIST — and it was the hole, not the
    // control. It is quite true that it writes no FENCE input, which is all this
    // suite knows how to ask; but it carries `email`, and a portal grant resolves
    // the human it lets in from exactly that column. So this assertion sat green,
    // in the file whose own header warns that "a green test that asserts the wrong
    // intent is how the first confirm gap hid", pinning the very tool that could
    // re-point a client contact's address in silence. It is asserted from the
    // other side now, in grant-identity.test.ts, against FENCE_IDENTITY_INPUTS.
    for (const name of ["set_account_active"]) {
      const tool = SHARED_TOOLS.find((t) => t.name === name)!
      expect(fenceDoors.has(`${tool.method} ${tool.path}`), `${name} writes no fence input`).toBe(false)
      expect(
        isPrivilegeWrite({ name: tool.name, path: tool.path, schema: tool.schema, write: tool.agent.write }),
        `${name} touches no fence input and carries no identity column — it must not be swept up`
      ).toBe(false)
    }
  })
})
