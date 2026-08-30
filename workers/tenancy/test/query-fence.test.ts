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

import { TEAM_MODULES } from "@shared/team-modules"
import { canonicalModule, MODULE_ALIASES, QUERY_MODULES } from "@shared/workers/query-grammar"
import { DOORS, handlerBody } from "../../mcp/test/door-census"
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

  it("`commercials` reaches the CHARGE card and says which one it gave you", async () => {
    // WHERE THE LINE IS, stated as a test rather than left to reading. Since
    // aliases arrived, `commercials` — the RIGHT that gates money — resolves to
    // `account_rates`, what a client is CHARGED. That is correct and it is not a
    // hole: the alias lands on a module the allow-list already declared, and the
    // agency's own cost is not in that list to be landed on. What would be wrong
    // is answering silently, so the reply names the module it actually gave.
    const { status, text } = await query("?module=commercials")
    expect(status).toBe(200)
    const body = JSON.parse(text) as Record<string, unknown>
    expect(body.module, "the caller is told WHICH money they were given").toBe("account_rates")
    expect(body.askedAs).toBe("commercials")
    expect(text).toContain(CHARGED_LABEL)
    expect(text, "and not one word about our own cost").not.toContain(SECRET_LABEL)
    expect(text).not.toContain(String(SECRET_CENTS))
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

describe("an alias widens what a caller may SAY, never what they may READ", () => {
  // Aliases arrived on 29 Aug 2026 so `help` would reach `tickets`. They are the
  // one thing added since that could quietly re-open this door: a second map a
  // request value is looked up in. Two properties keep them harmless — every
  // alias resolves to a module that was ALREADY in the allow-list, and no alias
  // may name a table the allow-list does not already expose.
  it("every alias lands on a module the allow-list already declared", () => {
    for (const [alias, key] of Object.entries(MODULE_ALIASES))
      expect(Object.keys(QUERY_MODULES), `${alias} resolves to "${key}"`).toContain(key)
  })

  it("no alias names a table that is not already queryable", () => {
    const queryable = new Set(Object.values(QUERY_MODULES).map((m) => m.table))
    for (const alias of Object.keys(MODULE_ALIASES))
      if (alias.includes("_") || queryable.has(alias))
        expect(
          !alias.startsWith("internal"),
          `"${alias}" is an alias naming the agency's own money (R24)`
        ).toBe(true)
    // …said the other way round, which is the assertion that actually bites:
    // the internal tables resolve to nothing, by every route into the lookup.
    for (const name of ["internal_rates", "internal_role_rates", "internalRates", "internal-rates"])
      expect(canonicalModule(name), `"${name}" must resolve to no module at all`).toBeUndefined()
  })

  it("and the door still refuses them, through the alias path", async () => {
    // The behavioural half, because the two above are about the map and this is
    // about the door: a caller holding every right still gets nothing.
    for (const handle of ["internal_rates", "internal_role_rates", "INTERNAL_RATES", "internal-rates"]) {
      const { status, text } = await query(`?module=${encodeURIComponent(handle)}`)
      expect(text, "the agency's own cost came back through an alias").not.toContain(SECRET_LABEL)
      expect(text).not.toContain(String(SECRET_CENTS))
      expect(status).toBe(400)
    }
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

/** THE SECOND SWITCH — a right that narrows the ROWS rather than opening the door.
 *
 * The suite above proves the query door cannot reach a table it was never given.
 * This proves the harder half: it can reach `accounts` and `tasks`, and two
 * modules on this app are governed by TWO rights rather than one — the module's
 * own opens the collection, and a second decides how much of it you see.
 * `shared/team-modules.ts` calls them "a switch over a SIGHT, not over a record".
 *
 * The generic door asked for `module:read` and knew nothing about the second
 * switch, and it is the ONLY accounts read and the ONLY tasks read the assistant
 * has (nine `list_*` tools were retired into it, REPLACED_BY_QUERY). Measured
 * against live staging on 30 Aug 2026 as a real Developer — `accounts:read`
 * without `contacts:read`, `work:read` without `all_tasks:read`:
 *
 *   GET /api/tenancy/accounts   individualTotal 0     query_records  132, 108 people
 *                                                                    by name, email
 *                                                                    and phone
 *   GET /api/content/tasks      82 rows (their own)   query_records  256 — the same
 *                                                                    number the Admin
 *                                                                    gets
 *
 * Both 200s. Both silent. The screen was right and the assistant's only door was
 * not, which is the one direction that matters: the machine surface may never be
 * more permissive than the UI.
 *
 * WHAT MAKES THIS A CHECK. The same three things the suite above insists on:
 * the ROWS ARE REALLY THERE (each refusal is paired with a count off the
 * database proving the people and the other person's tasks exist); a POSITIVE
 * CONTROL (the same caller still gets the companies, and the same caller WITH
 * the right gets everything, so a door that refuses everybody cannot pass); and
 * the FORBIDDEN SET IS DERIVED — the last test reads every module's own list
 * door off disk and fails when a door narrows by a right the grammar does not
 * declare, so the next module of this shape is judged without editing this file.
 */
describe("the second switch: a right that narrows rows narrows them here too", () => {
  /** The same door as `query` above, with the body already parsed — every
   * assertion below is about WHICH ROWS came back, not about a status line. */
  const ask = async (qs: string): Promise<{ status: number; body: Record<string, unknown> }> => {
    const r = await query(qs)
    return { status: r.status, body: JSON.parse(r.text) as Record<string, unknown> }
  }

  /** A caller holding the module's own right and NOT the second one — the
   * Developer role this was measured on. Built by taking one row away from the
   * harness's everything role, so the caller is ordinary in every other way. */
  function withoutRight(module: string) {
    db().exec(`DELETE FROM role_permissions WHERE role_id = '${IDS.adminRole}' AND module = '${module}';`)
  }
  const count = (sql: string) => (db().prepare(sql).get() as { n: number }).n

  describe("contacts:read — the address book inside the customer spine", () => {
    it("the people are really there, and the companies are too", () => {
      expect(count("SELECT COUNT(*) AS n FROM accounts WHERE account_type = 'individual'")).toBeGreaterThan(0)
      expect(count("SELECT COUNT(*) AS n FROM accounts WHERE account_type = 'entity'")).toBeGreaterThan(0)
    })

    it("without contacts:read the query door returns companies only — rows, total and groups alike", async () => {
      withoutRight("contacts")
      const rows = await ask("?module=accounts")
      expect(rows.status).toBe(200)
      const records = rows.body.records as { accountType?: string }[]
      expect(records.length, "the companies must still come back — this is a narrowing, not a refusal").toBeGreaterThan(0)
      expect(
        records.filter((r) => r.accountType !== "entity"),
        "a person came back to a caller who may not enumerate people"
      ).toEqual([])
      expect(rows.body.total, "the TOTAL leaks the size of the address book even when the page does not").toBe(
        count("SELECT COUNT(*) AS n FROM accounts WHERE account_type = 'entity'")
      )
      const grouped = await ask(`?module=accounts&groupBy=${encodeURIComponent(JSON.stringify(["accountType"]))}`)
      expect(
        (grouped.body.groups as { key: Record<string, unknown> }[]).map((g) => g.key.accountType),
        "a grouped count is a read of the same rows and must be narrowed by the same clause"
      ).toEqual(["entity"])
    })

    it("naming the people explicitly does not get past it", async () => {
      withoutRight("contacts")
      const r = await ask(
        `?module=accounts&where=${encodeURIComponent(JSON.stringify([{ field: "accountType", op: "eq", value: "individual" }]))}`
      )
      expect(r.status).toBe(200)
      expect(r.body.records, "asking for people by name got past a fence that only filters the default view").toEqual([])
      expect(r.body.total).toBe(0)
    })

    it("`unmatched` does not become an existence oracle for the people", async () => {
      // THE FENCE'S OWN BLIND SPOT, and the reason the door hands the engine a
      // RESOLVER rather than one clause. `findUnmatched` exists to tell "no rows
      // matched" from "no such thing" — it looks the value up in the referenced
      // table. On a fenced module that lookup answers a question the caller may
      // not ask: filter `parentAccountId contains "Marta Ruiz"` and silence means
      // she is here; filter an invented name and `unmatched` comes back. One bit
      // per guess, about exactly the people this right withholds. Measured before
      // the fix, on this fixture, and it returned exactly that pair.
      withoutRight("contacts")
      const person = db().prepare("SELECT name FROM accounts WHERE account_type='individual' LIMIT 1").get() as { name: string }
      const probe = async (v: string) =>
        (await ask(`?module=accounts&countOnly=true&where=${encodeURIComponent(JSON.stringify([{ field: "parentAccountId", op: "contains", value: v }]))}`))
          .body.unmatched
      expect(person.name, "the fixture must really hold a person to hunt for").toBeTruthy()
      expect(
        await probe(person.name),
        `"${person.name}" is a person this caller may not enumerate — reporting her as MATCHED tells them she is here`
      ).toEqual([{ field: "parentAccountId", values: [person.name] }])
      expect(
        await probe("Zzyzx Nonexistent"),
        "a name that is genuinely absent must read the same way, or the difference is the leak"
      ).toEqual([{ field: "parentAccountId", values: ["Zzyzx Nonexistent"] }])
    })

    it("WITH contacts:read the same caller gets the people (the positive control)", async () => {
      const r = await ask("?module=accounts")
      expect(r.status).toBe(200)
      expect(
        (r.body.records as { accountType?: string }[]).some((x) => x.accountType === "individual"),
        "a door that refuses everybody is not a fence, it is a broken door"
      ).toBe(true)
    })
  })

  describe("all_tasks:read — whose tasks 'the tasks' means", () => {
    beforeEach(() => {
      // One task of the caller's own and one of somebody else's. Without the
      // second right the door must hand back exactly the first.
      db().exec(`
        INSERT INTO tasks (id, ref, title, status, assignee_id, created_at, creator_id)
          VALUES ('TK_MINE',   'TSK-0000001', 'Mine',      'open', '${IDS.staffUser}',   '2026-03-01', '${IDS.staffUser}'),
                 ('TK_THEIRS', 'TSK-0000002', 'Not mine',  'open', '${IDS.burglarUser}', '2026-03-02', '${IDS.staffUser}');
      `)
    })

    it("both tasks are really there", () => {
      expect(count("SELECT COUNT(*) AS n FROM tasks WHERE id IN ('TK_MINE','TK_THEIRS')")).toBe(2)
    })

    it("without all_tasks:read the query door returns only the caller's own", async () => {
      withoutRight("all_tasks")
      const r = await ask("?module=tasks")
      expect(r.status).toBe(200)
      const ids = (r.body.records as { id: string }[]).map((x) => x.id)
      expect(ids).toContain("TK_MINE")
      expect(ids, "somebody else's task reached a caller who may only see their own").not.toContain("TK_THEIRS")
      expect(r.body.total, "the count must mean the same rows the page does").toBe(1)
    })

    it("WITH all_tasks:read the same caller sees both (the positive control)", async () => {
      const r = await ask("?module=tasks")
      const ids = (r.body.records as { id: string }[]).map((x) => x.id)
      expect(ids).toContain("TK_MINE")
      expect(ids).toContain("TK_THEIRS")
    })
  })

  /** DERIVED, so the next module of this shape is judged without editing this file.
   *
   * Every module's own list door is read off disk and asked which rights it
   * consults. A door that opens with `requireRight(module, right)` is the gate;
   * a right it also tests with `hasRight` is a NARROWING — the door answers
   * either way and hands back less. Every one of those must be declared on the
   * query module, or the generic door is wider than the screen again. */
  it("every right a module's own list door narrows by is declared on its query module", () => {
    // THE REPO'S ONE DOOR CENSUS, not a second copy of it. `door-census.ts`
    // already reads every worker's own switchboard and every handler's own body
    // — R19, R22 and R27 all derive from it — and its own header says why a
    // second scan would be the thing to avoid: one rule and one thing that looks
    // like it, drifting apart under a green build.
    expect(DOORS.length, "the door census found nothing — a blind check passes like a clean one").toBeGreaterThan(60)

    /** THE DOORS THAT LIST *THIS* MODULE. Sharing a permission is not being the
     * same collection: `stories`, `sprints`, `work_logs` and `waves` all gate on
     * `work:read`, exactly as the TASKS door does, so a census keyed on the right
     * alone reported the tasks door's `all_tasks:read` narrowing against all four
     * — six findings, none of them real. A door belongs to a module when it gates
     * on that module's right AND its path names that module's own collection.
     *
     * SCOPE, said plainly: a list door whose path spells its collection
     * differently from the grammar is not matched, and this check is silent about
     * it. That is a floor, not a census — the behavioural tests above are what
     * prove the two known fences, and this is what stops a THIRD arriving unseen. */
    const doorsOf = (key: string, mod: (typeof QUERY_MODULES)[string]) =>
      DOORS.filter(
        (d) =>
          d.method === "GET" &&
          new RegExp(`"${mod.module}"\\s*,\\s*"read"`).test(handlerBody(d).replace(/\s+/g, " ")) &&
          (d.path.includes(`/${mod.table}`) || d.path.includes(`/${key}`) || d.path.includes(`/${key.replace(/_/g, "-")}`))
      )

    const undeclared: string[] = []
    let modulesWithADoor = 0
    for (const [key, mod] of Object.entries(QUERY_MODULES)) {
      const declared = mod.narrow ? `${mod.narrow.right[0]}:${mod.narrow.right[1]}` : null
      const doors = doorsOf(key, mod)
      if (doors.length) modulesWithADoor++
      for (const d of doors) {
        const body = handlerBody(d).replace(/\s+/g, " ")
        for (const m of body.matchAll(/hasRight\([^)]*?"([a-z_]+)"\s*,\s*"(read|create|edit|delete)"/g)) {
          const narrowed = `${m[1]}:${m[2]}`
          // The module's OWN right, tested rather than required, is a composite
          // dashboard deciding whether to include this module at all.
          if (m[1] === mod.module) continue
          // Only a READ right on a module the matrix offers: a write right
          // tested on a read door is a duty filter, not a fence.
          if (m[2] !== "read" || !TEAM_MODULES.includes(m[1] as (typeof TEAM_MODULES)[number])) continue
          if (narrowed === declared) continue
          if (!NOT_A_ROW_FENCE[`${key}:${narrowed}`])
            undeclared.push(`${key}: ${d.method} ${d.path} narrows by ${narrowed}, undeclared`)
        }
      }
    }
    expect(modulesWithADoor, "no query module matched a door of its own — the linking has gone blind").toBeGreaterThan(6)
    expect(
      [...new Set(undeclared)],
      `A module's own list door hands back fewer rows to a caller missing a second right, and the ` +
        `generic query door does not — so the assistant sees more than the screen. Declare it as ` +
        `\`narrow\` on the query module in shared/workers/query-grammar.ts, or pin it in ` +
        `NOT_A_ROW_FENCE with the reason it narrows something other than rows:\n${undeclared.join("\n")}`
    ).toEqual([])
  })
})

/** Rights a door tests with `hasRight` that do NOT narrow which rows of the
 * queried module come back. Each is a real, different act — pinned with its
 * reason so the list can only shrink, and rot-checked below. */
const NOT_A_ROW_FENCE: Record<string, string> = {
  "accounts:portal_users:read":
    "the account DETAIL door withholds the nested `portalUsers` array, a field of one record — the query grammar declares no portal-user field at all, so there is nothing here to narrow",
  "knowledge_sources:google:read":
    "the knowledge SYNC-STATUS door adds the Google connection's state beside the counts; it withholds an extra, not a row",
}

describe("the second-switch pins are still real", () => {
  it("every NOT_A_ROW_FENCE line names a module the grammar still has, with a reason", () => {
    for (const [pin, why] of Object.entries(NOT_A_ROW_FENCE)) {
      const [moduleKey] = pin.split(":")
      expect(QUERY_MODULES[moduleKey], `${pin} pins a query module that no longer exists`).toBeTruthy()
      expect(why.length, `${pin} needs a reason someone can disagree with`).toBeGreaterThan(40)
    }
  })
})
