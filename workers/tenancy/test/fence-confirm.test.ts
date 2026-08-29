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
// must confirm BOTH WAYS. Add a door tomorrow that writes account_links and a
// tool that reaches it, and this goes red until the tool confirms — even if the
// runtime derivation's name-matching missed it.
//
// "MUST CONFIRM" USED TO MEAN "must declare the literal `true`", and on 29 Aug
// 2026 that stopped being expressible for two of these doors: twenty-one
// (de)activate tools collapsed into one `set_record_active` over RECORD_TOGGLES,
// so the tool on the contact-link and portal-login doors declares a PREDICATE —
// it has to, because the same tool also archives an account, which does not ask
// both ways. Reading a declared boolean is no longer the question.
//
// So the check RUNS the rule instead, through `requiresConfirm`, in both
// directions. That is strictly stronger than what it replaced: a literal `true`
// was a promise about the declaration, and this is the answer the agent will
// actually get at the moment somebody unlinks a company — the same move R22 made
// when it stopped reading `buildBody` and started running it.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { indexFunctions } from "@shared/rules/seam-scan"
import { stripComments } from "@shared/rules/source-scan"
import { FENCE_INPUTS } from "@shared/workers/account-scope"
import { RECORD_TOGGLES } from "@shared/workers/record-toggles"
import { alwaysConfirms, isPrivilegeWrite } from "@shared/workers/tool-gates"
import { requiresConfirm, TOOL_CATALOG } from "../../data-ops/src/lib/tools"
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

  it("every catalogued tool on one of those doors CONFIRMS, both ways", () => {
    /** Every input that reaches this door through a tool, filled in the way the
     * agent would fill it. A tool with one path takes one shape; the collapsed
     * `set_record_active` takes one per RECORD_TOGGLES entry pointing here, so a
     * multi-door tool is asked about the door in hand and not about the family. */
    const callsOn = (route: string): { name: string; input: Record<string, unknown> }[] => {
      const [method, path] = route.split(" ")
      const out: { name: string; input: Record<string, unknown> }[] = []
      for (const tool of TOOL_CATALOG) {
        if (tool.method !== method) continue
        if (tool.path === path && !tool.routes) out.push({ name: tool.name, input: {} })
        if (!tool.routes?.includes(path)) continue
        for (const [record, entry] of Object.entries(RECORD_TOGGLES))
          if (entry.path === path) out.push({ name: tool.name, input: { record } })
      }
      return out
    }

    let checked = 0
    for (const [route, table] of fenceDoors) {
      for (const call of callsOn(route)) {
        checked++
        const tool = TOOL_CATALOG.find((t) => t.name === call.name)!
        expect(tool, `${call.name} must be in the agent's own catalogue`).toBeTruthy()
        // BOTH DIRECTIONS. Unlinking takes a company away from a client login;
        // RELINKING hands it straight back, and a rule that only asked about
        // the destructive half ran the second one in silence.
        for (const active of [true, false])
          expect(
            requiresConfirm(tool, { ...call.input, active }),
            `${call.name}${call.input.record ? ` (record: ${String(call.input.record)})` : ""} posts to ${route}, which writes ${table} — an input to the account fence. A silent call widens what a client login can see, so it must stop for the panel with active:${active} as well.`
          ).toBe(true)
      }
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
    // ARCHIVING A CUSTOMER is the control: same tool, same door family, and it
    // must NOT be swept into asking both ways. Restoring one runs straight away.
    const entry = RECORD_TOGGLES.account
    expect(fenceDoors.has(`POST ${entry.path}`), "archiving an account writes no fence input").toBe(false)
    expect(
      alwaysConfirms(entry),
      "archiving an account touches no fence input and carries no identity column — it must not be swept up"
    ).toBe(false)
    expect(
      isPrivilegeWrite({ name: "", path: entry.path, schema: { properties: { id: {}, active: {} } }, write: true }),
      "the runtime derivation must still say no about the accounts/active door itself"
    ).toBe(false)
    const tool = TOOL_CATALOG.find((t) => t.name === "set_record_active")!
    expect(requiresConfirm(tool, { record: "account", active: true }), "restoring an account runs freely").toBe(false)
    expect(requiresConfirm(tool, { record: "account", active: false }), "archiving one still asks").toBe(true)
  })
})
