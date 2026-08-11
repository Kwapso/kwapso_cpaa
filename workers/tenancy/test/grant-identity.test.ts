// THE THIRD WAY INTO A CLIENT'S WORLD: not moving the fence, and not moving a row
// across it, but changing WHICH HUMAN a grant lets through it.
//
// WHY THIS SUITE EXISTS, precisely. Two suites already derive the confirm set from
// the fence, and neither can see this one:
//
//   • fence-confirm.test.ts reads FENCE_INPUTS — the columns accountScope() READS.
//     `accounts.email` is not one of them and never will be, so it could only have
//     been filed there by making a machine-checked list untrue.
//   • fence-row-confirm.test.ts reads FENCED_ROW_OWNERS — the column saying which
//     account owns a row. `accounts.email` says nothing about ownership.
//
// So `update_account` shipped `email` at confirm:false, while `create_account` —
// the SAME field — confirmed and said why in its own comment: an account's email
// "is how an email address enters the books, which is what a later portal grant
// resolves a login from". Only the CREATE half was ever guarded. The UPDATE half
// could re-point an existing customer contact's address in silence, from a model
// that had just been reading a support-ticket description an attacker wrote (20,000
// characters, raised through the client portal), and its whole trace line read
// "Edit account 01J…". The next portal grant on that person — a routine approval —
// then resolved the login to whoever owned the new address.
//
// The fix is DATA plus a derivation, in the shape the last two rounds settled on:
// FENCE_IDENTITY_INPUTS (beside the fence, in account-scope.ts) names the column,
// and touchesAccountFence consults it. This suite proves it from the DOOR'S OWN
// SOURCE, so the day the grant stops resolving people that way, the declaration
// goes red instead of quietly guarding nothing.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { stripComments } from "@shared/rules/source-scan"
import { FENCE_IDENTITY_INPUTS } from "@shared/workers/account-scope"
import { isPrivilegeWrite, SHARED_TOOLS } from "@shared/workers/tool-catalog"
import { TEAM_MIGRATIONS } from "../src/team-schema"

const accountsSrc = stripComments(
  readFileSync(join(__dirname, "..", "src", "routes", "accounts.ts"), "utf8")
)

/** "account_id" → "accountId" (the body field a door reads the column from). */
const camel = (col: string) => col.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

/** WHERE something is, refusing -1. `indexOf` answers -1 for "absent", and -1 is
 * less than every real offset — so a bare ordering assertion passes LOUDEST when
 * the thing has been deleted. Presence first, every time (the shape borrowed from
 * grant-ceiling.test.ts, which found it by sabotaging itself). */
function at(src: string, needle: string): number {
  const i = src.indexOf(needle)
  expect(i, `${needle} is not in the source at all`).toBeGreaterThan(-1)
  return i
}

describe("the identity column is really what a grant resolves a person from", () => {
  it("declares at least one, and each is a real column on its table", () => {
    expect(Object.keys(FENCE_IDENTITY_INPUTS).length).toBeGreaterThan(0)
    expect(FENCE_IDENTITY_INPUTS.accounts).toContain("email")
    // A declaration pointing at a column that does not exist would be a confirm
    // panel guarding nothing at all.
    const schema = TEAM_MIGRATIONS.map((m) => m.sql).join("\n")
    for (const [table, columns] of Object.entries(FENCE_IDENTITY_INPUTS)) {
      const create = schema.slice(schema.indexOf(`CREATE TABLE ${table}`))
      for (const col of columns)
        expect(
          new RegExp(`\\b${col}\\b`).test(create.slice(0, create.indexOf(");"))),
          `FENCE_IDENTITY_INPUTS pins ${table}.${col}, which is not a column on ${table}`
        ).toBe(true)
    }
  })

  it("the grant door resolves its person THROUGH that column (the scan must not go blind)", () => {
    // userIdForPerson: account row → its email → the platform user with that
    // email → the user_id the portal_users row is written for. Every link in that
    // chain is why editing the email is an access decision. If this stops being
    // true, the declaration above is stale and this goes red.
    const fn = accountsSrc.slice(at(accountsSrc, "async function userIdForPerson"))
    expect(fn.slice(0, at(fn, "return row.id"))).toContain("person.email")
    expect(fn).toMatch(/SELECT id FROM users WHERE email = \?/)
    // …and the grant door is what calls it, or the chain starts nowhere.
    expect(at(accountsSrc, "postGrantPortalAccess")).toBeLessThan(
      at(accountsSrc, "await userIdForPerson(")
    )
  })
})

describe("every catalogued tool that can write an identity column CONFIRMS", () => {
  /** Derived from each tool's own door and schema — never a list of tool names,
   * for the reason the last three rounds of this bug all shared: a name list locks
   * the tools you thought of and waves through the next one. */
  const setters = SHARED_TOOLS.filter((t) => {
    if (t.method !== "POST") return false
    const fields = Object.keys((t.schema?.properties ?? {}) as Record<string, unknown>)
    return Object.entries(FENCE_IDENTITY_INPUTS).some(
      ([table, columns]) => t.path.includes(`/${table}`) && columns.some((c) => fields.includes(camel(c)))
    )
  })

  it("finds them (the scan itself must not go blind)", () => {
    // BOTH halves of the pair. create_account was already guarded and update_account
    // was not; a derivation that sees only one of them has learnt nothing.
    expect(
      setters.map((t) => t.name),
      "no tool exposes an identity column — the derivation has stopped seeing them"
    ).toEqual(expect.arrayContaining(["create_account", "update_account"]))
  })

  it("each DECLARES confirm: true — a panel, before the address changes", () => {
    for (const t of setters)
      expect(
        t.agent.confirm,
        `${t.name} can re-point the email a portal grant resolves a login from — it must DECLARE confirm: true, not a predicate and not false`
      ).toBe(true)
  })

  it("and the shared derivation agrees — isPrivilegeWrite sees them", () => {
    for (const t of setters)
      expect(
        isPrivilegeWrite({ name: t.name, path: t.path, write: t.agent.write, schema: t.schema }),
        `isPrivilegeWrite must classify ${t.name} as an access write`
      ).toBe(true)
  })
})
