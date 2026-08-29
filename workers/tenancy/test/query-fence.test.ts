// THE QUERY DOOR'S FENCE — what a generic reader may name, and what it may not.
//
// R24 says the agency's own cost lives in one file and nothing a client can
// reach imports it. A GENERIC query door is the one shape that could undo that
// without importing anything at all: hand a model a table name and it will
// eventually name the interesting one. So this suite exists to prove the
// sentence the design rests on —
//
//   THE MODULE MAP IS AN ALLOW-LIST. `internal_rates` IS NOT IN IT.
//
// and to prove it the only way worth proving anything: BEHAVIOURALLY, against
// the real schema, through the real route table, as a caller who holds EVERY
// right in the team INCLUDING `commercials`. Permission is not what stops them
// here — nothing about their role stops them — so if a row comes back, the
// allow-list has failed, and that is the only thing being measured.
//
// ── WHAT MAKES THIS A CHECK RATHER THAN A CLAIM ──────────────────────────────
//
// Three things, and the first two matter more than the assertions:
//
//   1. THE SECRET IS REALLY THERE. Every refusal below is paired with a read
//      straight off the database proving the internal rate row EXISTS and
//      carries the number being hunted for. "No rows came back" is worthless if
//      there were no rows; that is how a fence test reports all-clear on an
//      empty table for a year.
//   2. THE POSITIVE CONTROL. The same caller, the same door, asks for the
//      ACCOUNT rate card — what a client is CHARGED, a different table and a
//      different file for exactly this reason — and gets it. A door that
//      refuses everybody is not a fence, it is a broken door, and it would pass
//      a refusal-only suite perfectly.
//   3. MUTATION-TESTED BY HAND, and recorded here so the next reader does not
//      have to take it on trust. On 29 Aug 2026 `internal_rates` was added to
//      QUERY_MODULES as a temporary edit; this suite went red on the first four
//      assertions below, naming the leaked label and the leaked number. The
//      entry was removed and it went green again. A check that passes with its
//      subject deleted is not a check.
//
// ── AND THE FORBIDDEN SET IS DERIVED ─────────────────────────────────────────
//
// Not hand-typed: the tables are read out of `internal-money.ts` itself, the
// same oracle R24's own check uses. Add a table to that file tomorrow and it is
// judged here today.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import { QUERY_MODULES } from "@shared/workers/query-grammar"
import worker from "../src/index"
import { buildSpineDb, IDS, makeEnv } from "./spine-harness"

/** What our own hour costs, in this team's database. The label and the number
 * are the two things that must never come out of the query door. */
const SECRET_LABEL = "Development (our cost)"
const SECRET_CENTS = 4207

/** What the CLIENT is charged — a different table, a different file, and the
 * positive control that proves the door is not simply broken. */
const CHARGED_LABEL = "Development (charged)"

const db = () => holder.db as DatabaseSync

beforeEach(() => {
  holder.db = buildSpineDb()
  // `commercials` ON TOP OF the harness's everything-on-the-spine role. It is
  // the right that decides whether a person may see money at all, and the whole
  // point of this suite is that holding it is not enough: the internal card is
  // unreachable because it was never declared queryable, not because the caller
  // lacks a permission. Granting it here is what makes the refusals below mean
  // something — without it they would be ordinary 403s proving nothing.
  db().exec(`
    INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
      VALUES ('${IDS.adminRole}_commercials', '${IDS.adminRole}', 'commercials', 1, 1, 1, 1);
  `)
  // The agency's own cost card, and a role rate beside it.
  db().exec(`
    INSERT INTO internal_rates (id, label, cents_per_hour, currency, created_at)
      VALUES ('IR1', '${SECRET_LABEL}', ${SECRET_CENTS}, 'EUR', '2026-01-01');
    INSERT INTO internal_role_rates (id, role_name, cents_per_hour, created_at)
      VALUES ('IRR1', 'Admin', ${SECRET_CENTS}, '2026-01-01');
    INSERT INTO account_rates (id, account_id, label, cents_per_hour, currency, created_at)
      VALUES ('AR1', '${IDS.victimAccount}', '${CHARGED_LABEL}', 9900, 'EUR', '2026-01-01');
  `)
})

/** A query, as the staff ADMIN — every right in the team, `commercials`
 * included. The one thing that can refuse them is the allow-list. */
async function query(qs: string): Promise<{ status: number; text: string }> {
  const request = new Request(`https://tenancy/api/tenancy/query${qs}`, {
    headers: { Cookie: "session=x" },
  })
  const res = await worker.fetch(request, makeEnv(() => holder.db as DatabaseSync, IDS.staffUser))
  return { status: res.status, text: await res.text() }
}

describe("the secret is really in the database (or every assertion below is empty)", () => {
  it("the internal rate card holds the label and the number being hunted for", () => {
    const row = db().prepare("SELECT label, cents_per_hour FROM internal_rates WHERE id = 'IR1'").get() as {
      label: string
      cents_per_hour: number
    }
    expect(row.label).toBe(SECRET_LABEL)
    expect(row.cents_per_hour).toBe(SECRET_CENTS)
    expect(
      db().prepare("SELECT COUNT(*) AS n FROM internal_role_rates").get(),
      "the role cost card must hold a row too"
    ).toEqual({ n: 1 })
  })
})

describe("R24: no query names the agency's own cost, by any handle", () => {
  /** Every way a caller could try to reach it: the table itself, the module that
   * gates it, the file's other table, the prototype trick that has bitten this
   * codebase four times, and a name assembled to look like SQL. */
  const HANDLES = [
    "internal_rates",
    "internal_role_rates",
    "internal-rates",
    "internalRates",
    "commercials",
    "rates",
    "__proto__",
    "constructor",
    "accounts; SELECT * FROM internal_rates",
    "internal_rates--",
  ]

  for (const handle of HANDLES)
    it(`refuses module "${handle}" and returns nothing`, async () => {
      const { status, text } = await query(`?module=${encodeURIComponent(handle)}`)
      // THE LEAK FIRST, then the status. Asserted in this order deliberately: a
      // status check that fires first hides the only failure anybody cares
      // about, and when this suite was mutation-tested the message that had to
      // name the leaked label was the one that never ran.
      expect(text, "the agency's own cost came back out of the query door").not.toContain(SECRET_LABEL)
      expect(text, "the agency's own hourly cost came back out of the query door").not.toContain(
        String(SECRET_CENTS)
      )
      expect(status, "a module that is not in the allow-list is a clean 400").toBe(400)
      // …and the refusal names what COULD have been asked for, so the next
      // attempt is an allowed one rather than another guess.
      expect(text).toContain("tickets")
    })

  it("a FIELD name cannot reach another table either", async () => {
    // The second surface a grammar offers: the module is allowed, the field is
    // the smuggling attempt. Every column comes from the module's declared
    // fields, so this is a 400 with no statement built at all.
    for (const field of ["cents_per_hour", "internal_rates.cents_per_hour", "id FROM internal_rates --"]) {
      const where = encodeURIComponent(JSON.stringify([{ field, op: "eq", value: "x" }]))
      const { status, text } = await query(`?module=account_rates&where=${where}`)
      expect(status, `"${field}" is not a field on account_rates`).toBe(400)
      expect(text).not.toContain(String(SECRET_CENTS))
    }
  })

  it("neither can a sort, a group, a projection or a cursor", async () => {
    const attempts = [
      "?module=account_rates&sort=cents_per_hour%20FROM%20internal_rates",
      `?module=account_rates&groupBy=${encodeURIComponent(JSON.stringify(["internal_rates"]))}`,
      `?module=account_rates&fields=${encodeURIComponent(JSON.stringify(["internal_rates.label"]))}`,
      "?module=account_rates&cursor=' UNION SELECT label FROM internal_rates --",
    ]
    for (const qs of attempts) {
      const { status, text } = await query(qs)
      expect(status, `${qs} must be refused`).toBe(400)
      expect(text).not.toContain(SECRET_LABEL)
      expect(text).not.toContain(String(SECRET_CENTS))
    }
  })

  it("THE POSITIVE CONTROL: the same caller reads what a client is CHARGED", async () => {
    // Different table, different file, and on the machine surface on purpose —
    // R24 is about our own cost, not about all money. If this ever fails, the
    // suite above is proving nothing: a door that refuses everything is not a
    // fence.
    const { status, text } = await query("?module=account_rates")
    expect(status).toBe(200)
    expect(text).toContain(CHARGED_LABEL)
    expect(JSON.parse(text).total).toBe(1)
    // …and it still says nothing about our own cost.
    expect(text).not.toContain(SECRET_LABEL)
  })

  it("describe_module will not describe it either", async () => {
    const request = new Request("https://tenancy/api/tenancy/query/describe?module=internal_rates", {
      headers: { Cookie: "session=x" },
    })
    const res = await worker.fetch(request, makeEnv(() => holder.db as DatabaseSync, IDS.staffUser))
    expect(res.status).toBe(400)
    const text = await res.text()
    expect(text).not.toContain("cents_per_hour")
    // The catalogue a caller CAN see must not name it either.
    const list = await worker.fetch(
      new Request("https://tenancy/api/tenancy/query/describe", { headers: { Cookie: "session=x" } }),
      makeEnv(() => holder.db as DatabaseSync, IDS.staffUser)
    )
    expect(await list.text()).not.toContain("internal")
  })
})

describe("the allow-list is derived-clean against the internal-money file itself", () => {
  /** The tables `internal-money.ts` touches, read off that file — the same
   * oracle R24's own check reads. Nothing hand-typed, so a table added there
   * tomorrow is judged here today. */
  const internalSrc = readFileSync(
    join(__dirname, "..", "src", "lib", "internal-money.ts"),
    "utf8"
  )
  const touched = [
    ...new Set([...internalSrc.matchAll(/(?:FROM|INTO|UPDATE|JOIN)\s+([a-z_]+)/g)].map((m) => m[1])),
  ]

  /** The one table `internal-money.ts` reads that is NOT the agency's own cost.
   * The margin reads `apps` for what a system costs us to run, and an app is a
   * client's own record — their value screen names it by design. Pinned with its
   * reason and rot-checked below, so the exemption cannot grow silently. */
  const SHARED_WITH_THE_ORDINARY_APP: Record<string, string> = {
    apps: "the margin reads an app's monthly tool cost, but an app is the client's own record and its query module exposes the app's own columns — not that one",
  }

  it("the derivation found the file (a blind scan reports all-clear like a passing one)", () => {
    expect(touched, "internal_rates is the table this law is about — did it move?").toContain(
      "internal_rates"
    )
    expect(touched.length).toBeGreaterThan(2)
  })

  it("no table the internal-money file touches is queryable, except the pinned one", () => {
    const queryable = new Set(Object.values(QUERY_MODULES).map((m) => m.table))
    const leaked = touched.filter(
      (t) => queryable.has(t) && !(t in SHARED_WITH_THE_ORDINARY_APP)
    )
    expect(
      leaked,
      `the query door's allow-list names a table the agency's own money file reads (R24): ${leaked.join(", ")}. It is an ALLOW-list — take the entry out, do not add a guard.`
    ).toEqual([])
  })

  it("every pinned exemption is still queryable and still touched (no rotting lines)", () => {
    const queryable = new Set(Object.values(QUERY_MODULES).map((m) => m.table))
    for (const [table, why] of Object.entries(SHARED_WITH_THE_ORDINARY_APP)) {
      expect(touched, `${table} is pinned here but the money file no longer reads it`).toContain(table)
      expect(queryable.has(table), `${table} is pinned here but is no longer queryable`).toBe(true)
      expect(why.length, `${table} needs a reason someone can disagree with`).toBeGreaterThan(40)
    }
  })

  it("no module's declared fields name a money column that isn't the client's own price", () => {
    // The finer half: `internal_rates` being absent is not enough if some other
    // module quietly exposes the same number under another name. Every declared
    // column is checked against the columns the internal file actually reads.
    const internalCols = new Set(
      [...internalSrc.matchAll(/\b(cents_per_hour|margin_cents|tool_cost_cents_per_month)\b/g)].map(
        (m) => m[1]
      )
    )
    expect(internalCols.size, "the column derivation went blind").toBeGreaterThan(1)
    for (const [name, mod] of Object.entries(QUERY_MODULES))
      for (const f of mod.fields)
        if (internalCols.has(f.column))
          expect(
            mod.table,
            `${name}.${f.name} exposes "${f.column}", a column the internal money file reads — only the ACCOUNT rate card (what a client is charged) may`
          ).toBe("account_rates")
  })
})
