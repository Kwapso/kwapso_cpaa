// THE QUERY DOOR ANSWERS IN THE WORDS IT PUBLISHED.
//
// `query_records` is the ONE read the assistant has for most of this app: nine
// `list_*` tools were retired into it (REPLACED_BY_QUERY), and no screen on
// either front door reads this route at all — its only callers are the two
// machine surfaces. So the vocabulary it publishes IS its contract, and there is
// no human looking at a screen who would notice the contract being broken.
//
// TWO THINGS DRIFTED, both invisible to every other check here, both found by
// driving the real door on staging on 30 Aug 2026:
//
//   1 · THE ROWS CAME BACK IN THE DATABASE'S SPELLING. `describe_module`
//       advertises `accountType`, `helpType`, `resolvedAt`; filters, `sort` and
//       `groupBy` all take those names; and the ROWS came back keyed
//       `account_type`, `help_type`, `resolved_at`, `title_en`. The grouped
//       answer already mapped back (`[f.name, r[f.column]]`) — ten lines above
//       the row path that did not — which is what says this was an omission and
//       never a decision. A caller that asks for `fields: ["accountType"]` and
//       reads `row.accountType` gets `undefined` from a 200.
//
//   2 · A DECLARED VALUE THE COLUMN NEVER HOLDS. `accountType` was declared
//       `["entity", "person"]`; the column holds `entity` and `individual` —
//       the spelling the create door validates, the seed writes and the door's
//       own `groupBy` hands back. So the assistant, told to filter by `person`,
//       got `200 total=0` with no `unmatched` beside it: a confident, false
//       "this team has no contacts" over 108 real people. Asking for
//       `individual` — the value the same door had just returned — was a 400.
//
// WHAT MAKES THESE CHECKS RATHER THAN CLAIMS. Each is grounded in an oracle the
// grammar does not control: the ROW test reads the keys the real door really
// returned, and the VALUES test reads `SELECT DISTINCT` off the database the
// harness seeded. Both were run against the unfixed code first and both went
// red, naming `account_type` and `individual` respectively.
//
// SCOPE, said plainly: the values test can only judge a column the fixture
// actually fills, so it is a floor and not a census. The wider instrument is
// scripts/query-vocabulary-audit.mjs, which asks the same question of live
// staging data and is what found this one.

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

const db = () => holder.db as DatabaseSync

beforeEach(() => {
  holder.db = buildSpineDb()
  // Every module on the sheet, so a refusal below is never what makes a module
  // look clean. The harness's own role already holds the spine; this widens it
  // to the rest so the vocabulary of EVERY module is exercised.
  db().exec(`
    INSERT OR IGNORE INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
    SELECT '${IDS.adminRole}_' || m.module, '${IDS.adminRole}', m.module, 1, 1, 1, 1
      FROM (SELECT 'commercials' AS module UNION ALL SELECT 'work'
            UNION ALL SELECT 'knowledge' UNION ALL SELECT 'meetings'
            UNION ALL SELECT 'todos' UNION ALL SELECT 'deliverables'
            UNION ALL SELECT 'selectable_data') m;
  `)
})

async function ask(qs: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const request = new Request(`https://tenancy/api/tenancy/query${qs}`, {
    headers: { Cookie: "session=x" },
  })
  const res = await worker.fetch(request, makeEnv(() => holder.db as DatabaseSync, IDS.staffUser))
  return { status: res.status, body: JSON.parse(await res.text()) as Record<string, unknown> }
}

describe("query-vocabulary: the rows come back in the names the grammar published", () => {
  it("no row carries a key that is not a declared field name", async () => {
    const offenders: string[] = []
    let modulesWithRows = 0
    for (const [key, mod] of Object.entries(QUERY_MODULES)) {
      const declared = new Set(["id", ...mod.fields.map((f) => f.name)])
      const r = await ask(`?module=${key}`)
      if (r.status !== 200) continue
      const rows = (r.body.records ?? []) as Record<string, unknown>[]
      if (!rows.length) continue
      modulesWithRows++
      for (const k of Object.keys(rows[0]))
        if (!declared.has(k)) offenders.push(`${key}: row key "${k}" is not a field this module publishes`)
    }
    expect(
      modulesWithRows,
      "no module returned a row — this check would pass on an empty database, which is not a pass"
    ).toBeGreaterThan(3)
    expect(
      offenders,
      `The query door answered in words it never published. \`describe_module\` names a field one ` +
        `way and the rows come back another, so a caller reading the field it asked for gets ` +
        `undefined out of a 200:\n${offenders.join("\n")}`
    ).toEqual([])
  })

  it("a narrowed read carries exactly the fields that were asked for", async () => {
    // The half a caller feels first: `fields` is how a model keeps a page cheap,
    // so a renamed key here is a page of rows that reads as entirely empty.
    const r = await ask(`?module=accounts&fields=${encodeURIComponent(JSON.stringify(["name", "accountType"]))}`)
    expect(r.status).toBe(200)
    const rows = (r.body.records ?? []) as Record<string, unknown>[]
    expect(rows.length, "the accounts fixture must really have rows").toBeGreaterThan(0)
    expect(Object.keys(rows[0]).sort()).toEqual(["accountType", "id", "name"])
  })
})

describe("query-vocabulary: a declared value is one the column can hold", () => {
  it("every value in a column appears in that field's declared list", async () => {
    const offenders: string[] = []
    let columnsRead = 0
    for (const mod of Object.values(QUERY_MODULES)) {
      for (const f of mod.fields) {
        if (f.type !== "enum" || !Array.isArray(f.values) || !f.values.length) continue
        const rows = db()
          .prepare(`SELECT DISTINCT ${f.column} AS v FROM ${mod.table} WHERE ${f.column} IS NOT NULL`)
          .all() as { v: unknown }[]
        if (!rows.length) continue
        columnsRead++
        const declared = new Set(f.values as string[])
        for (const { v } of rows)
          if (typeof v === "string" && !declared.has(v))
            offenders.push(
              `${mod.table}.${f.column} holds "${v}", which ${f.name} does not declare ` +
                `(it declares ${(f.values as string[]).map((x) => `"${x}"`).join(", ")})`
            )
      }
    }
    expect(
      columnsRead,
      "no enum column had a value to read — this check would pass on an empty database"
    ).toBeGreaterThan(0)
    expect(
      offenders,
      `A field advertises values the column never holds. Filtering by the declared value answers ` +
        `200 with a total of 0 and no \`unmatched\` beside it — a confident, false "there are none" ` +
        `— and filtering by the REAL value is refused as invalid:\n${offenders.join("\n")}`
    ).toEqual([])
  })
})
