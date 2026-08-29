// WHAT THE QUERY DOOR CAN ACTUALLY ANSWER — against the real schema, through
// the real route table.
//
// The lane that built this door was opened by ONE measured question:
//
//   "how many open tickets from flu clinic, confia and HORSt combined and how
//    many resolved in july 2026 across all?"
//
// Under the old catalogue it cost 369,193 input tokens and gave up. Three
// clients meant three calls, and "resolved in July" was INEXPRESSIBLE — the
// ticket door parsed twelve filters, all single-valued, none of them a date —
// so the only route to it was paging 1,820 tickets by hand.
//
// The two halves of that question are the two hardest things a grammar has to
// get right, and each of them is a place a plausible implementation goes quietly
// wrong rather than loudly:
//
//   1. A DATE RANGE THAT INCLUDES ITS LAST DAY. `resolved_at` holds
//      `2026-07-31T16:04:00.000Z`, which sorts AFTER the bare string
//      `2026-07-31`. A between that compares the two directly drops the last day
//      of every month and looks perfect doing it.
//   2. THREE CLIENTS IN ONE FILTER, BY NAME. A model asking about "flu clinic"
//      does not have a ULID, and making it fetch one first is the round trip
//      this whole door exists to remove.
//
// So the last test here IS that question, asked in two calls, with the answer
// checked against rows counted by hand.

import { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import {
  canonicalModule,
  FIELD_ALIASES,
  MODULE_ALIASES,
  QUERY_MODULES,
  queryField,
  suggestModule,
} from "@shared/workers/query-grammar"
import { GROUP_CAP, MAX_CLAUSES, VALUES_PER_CLAUSE } from "../src/lib/query-engine"
import worker from "../src/index"
import { buildSpineDb, IDS, makeEnv } from "./spine-harness"

const db = () => holder.db as DatabaseSync

/** Three client companies with the awkward spellings the real question used. */
const CLIENTS = [
  { id: "A_FLU", name: "Flu Clinic GmbH" },
  { id: "A_CONFIA", name: "Confia Seguros" },
  { id: "A_HORST", name: "HORSt Logistik" },
  { id: "A_OTHER", name: "Delaval Nordic" },
]

/** The ticket book this suite counts. Written out row by row rather than
 * generated, because every assertion below is a number a reader has to be able
 * to check by eye — including the two 31 July tickets that a naive `between`
 * silently drops. */
const TICKETS: { id: string; account: string; status: string; resolvedAt: string | null }[] = [
  // Flu Clinic — 2 open, 2 resolved (one of them on the last day of July)
  { id: "T1", account: "A_FLU", status: "new", resolvedAt: null },
  { id: "T2", account: "A_FLU", status: "in_progress", resolvedAt: null },
  { id: "T3", account: "A_FLU", status: "resolved", resolvedAt: "2026-07-14T09:12:00.000Z" },
  { id: "T4", account: "A_FLU", status: "resolved", resolvedAt: "2026-07-31T16:04:00.000Z" },
  // Confia — 3 open, 1 resolved in July
  { id: "T5", account: "A_CONFIA", status: "new", resolvedAt: null },
  { id: "T6", account: "A_CONFIA", status: "triaged", resolvedAt: null },
  { id: "T7", account: "A_CONFIA", status: "ready", resolvedAt: null },
  { id: "T8", account: "A_CONFIA", status: "resolved", resolvedAt: "2026-07-02T08:00:00.000Z" },
  // HORSt — 1 open, 1 resolved in AUGUST (must not be counted as July)
  { id: "T9", account: "A_HORST", status: "scheduled", resolvedAt: null },
  { id: "T10", account: "A_HORST", status: "resolved", resolvedAt: "2026-08-01T00:30:00.000Z" },
  // Another client entirely — resolved in July, and "across all" must include it
  { id: "T11", account: "A_OTHER", status: "resolved", resolvedAt: "2026-07-31T23:10:00.000Z" },
  { id: "T12", account: "A_OTHER", status: "new", resolvedAt: null },
  // …and one resolved in JUNE, to prove the lower bound bites too
  { id: "T13", account: "A_OTHER", status: "resolved", resolvedAt: "2026-06-30T22:00:00.000Z" },
]

beforeEach(() => {
  holder.db = buildSpineDb()
  // The shared harness seeds one ticket of its own (the victim's, for the leak
  // suite). Every number below is counted by eye off TICKETS, so it starts from
  // an empty book rather than from "thirteen plus whatever else is in there".
  db().exec("DELETE FROM help;")
  const rows = CLIENTS.map(
    (c) =>
      `INSERT INTO accounts (id, account_type, name, created_at) VALUES ('${c.id}', 'entity', '${c.name}', '2026-01-01');`
  ).join("\n")
  const tickets = TICKETS.map(
    (t, i) =>
      `INSERT INTO help (id, ref, account_id, help_type, description, title_en, status, resolved, resolved_at, created_at, rank)
         VALUES ('${t.id}', 'TIC-${String(i + 1).padStart(7, "0")}', '${t.account}', 'Bug',
                 'something is wrong', 'Ticket ${i + 1}', '${t.status}',
                 ${t.resolvedAt ? 1 : 0}, ${t.resolvedAt ? `'${t.resolvedAt}'` : "NULL"},
                 '2026-05-0${(i % 9) + 1}T00:00:00.000Z', 'a${i}');`
  ).join("\n")
  db().exec(rows + "\n" + tickets)
})

async function ask(qs: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const request = new Request(`https://tenancy/api/tenancy/query${qs}`, {
    headers: { Cookie: "session=x" },
  })
  const res = await worker.fetch(request, makeEnv(() => holder.db as DatabaseSync, IDS.staffUser))
  const text = await res.text()
  return { status: res.status, body: JSON.parse(text) as Record<string, unknown> }
}

const q = (params: Record<string, unknown>): string =>
  "?" +
  Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(typeof v === "string" ? v : JSON.stringify(v))}`)
    .join("&")

describe("the fixture is what the assertions below claim it is", () => {
  it("thirteen tickets, four clients, four resolved in July", () => {
    expect(TICKETS).toHaveLength(13)
    expect(TICKETS.filter((t) => t.resolvedAt?.startsWith("2026-07"))).toHaveLength(4)
    expect(
      db().prepare("SELECT COUNT(*) AS n FROM help").get(),
      "the rows must really be in the database"
    ).toEqual({ n: 13 })
  })
})

describe("a date range includes the day it names — both ends", () => {
  it("July 2026 catches the 31st, and neither June nor August", async () => {
    const { status, body } = await ask(
      q({
        module: "tickets",
        where: [{ field: "resolvedAt", op: "between", value: ["2026-07-01", "2026-07-31"] }],
      })
    )
    expect(status).toBe(200)
    // T3, T4 (31 July, 16:04), T8, T11 (31 July, 23:10). NOT T10 (1 August) and
    // NOT T13 (30 June).
    expect(body.total).toBe(4)
    const ids = (body.records as { id: string }[]).map((r) => r.id).sort()
    expect(ids).toEqual(["T11", "T3", "T4", "T8"])
  })

  it("a naive comparison would have dropped the 31st — that is the whole point", () => {
    // The two rows the widening exists for, named so the failure is legible if
    // somebody ever "simplifies" dateBound away.
    const lastDay = TICKETS.filter((t) => t.resolvedAt?.startsWith("2026-07-31"))
    expect(lastDay.map((t) => t.id)).toEqual(["T4", "T11"])
    for (const t of lastDay) expect(t.resolvedAt! > "2026-07-31").toBe(true)
  })

  it("an exclusive bound means the whole day, not midnight on it", async () => {
    // gt "2026-07-14" is AFTER the 14th, so T3 (14 July, 09:12) is out.
    const { body } = await ask(
      q({ module: "tickets", where: [{ field: "resolvedAt", op: "gt", value: "2026-07-14" }] })
    )
    const ids = (body.records as { id: string }[]).map((r) => r.id).sort()
    expect(ids).toEqual(["T10", "T11", "T4"])
  })

  it("a precise instant is left exactly as the caller wrote it", async () => {
    // `lte` with a TIME must not be widened to the end of the day — if it were,
    // T11 (31 July, 23:10) would come back too and the caller would have been
    // answered a question they did not ask.
    const { body } = await ask(
      q({
        module: "tickets",
        where: [
          { field: "resolvedAt", op: "gte", value: "2026-07-01" },
          { field: "resolvedAt", op: "lte", value: "2026-07-31T20:00:00.000Z" },
        ],
      })
    )
    expect((body.records as { id: string }[]).map((r) => r.id).sort()).toEqual(["T3", "T4", "T8"])
  })
})

describe("a reference field takes the record's NAME, so no lookup comes first", () => {
  it("three clients, spelled as a person would, in ONE filter", async () => {
    const { body } = await ask(
      q({
        module: "tickets",
        where: [
          { field: "accountId", op: "contains", value: ["flu clinic", "confia", "HORSt"] },
          { field: "status", op: "ne", value: "resolved" },
        ],
      })
    )
    // Flu Clinic 2 + Confia 3 + HORSt 1 = 6 open. Delaval's is not counted.
    expect(body.total).toBe(6)
  })

  it("…and an id still works, because a caller who has one should not have to translate it", async () => {
    const { body } = await ask(
      q({ module: "tickets", where: [{ field: "accountId", op: "eq", value: "A_FLU" }] })
    )
    expect(body.total).toBe(4)
  })

  it("an exact NAME works on eq too", async () => {
    const { body } = await ask(
      q({ module: "tickets", where: [{ field: "accountId", op: "eq", value: "Confia Seguros" }] })
    )
    expect(body.total).toBe(4)
  })
})

describe("a filter may search several fields at once — that IS a search box", () => {
  it("one needle, three columns, any of them matching", async () => {
    // The ONE thing the old list doors did that a per-field grammar could not
    // say: `q` on the accounts door looks in the name, the code AND the email
    // and calls the three of them one filter.
    const { body } = await ask(
      q({
        module: "accounts",
        where: [{ field: ["name", "code", "email"], op: "contains", value: "confia" }],
      })
    )
    expect(body.total).toBe(1)
    expect((body.records as { name: string }[])[0].name).toBe("Confia Seguros")
  })

  it("…and the filters themselves still AND", async () => {
    const { body } = await ask(
      q({
        module: "tickets",
        where: [
          { field: ["title", "description"], op: "contains", value: "wrong" },
          { field: "status", op: "eq", value: "new" },
        ],
      })
    )
    expect(body.total).toBe(3)
  })

  it("a bad field inside the list is refused like any other", async () => {
    const { status } = await ask(
      q({ module: "accounts", where: [{ field: ["name", "salary"], op: "contains", value: "x" }] })
    )
    expect(status).toBe(400)
  })

  it("a filter may not search a whole row", async () => {
    const { status, body } = await ask(
      q({
        module: "tickets",
        where: [
          { field: ["id", "ref", "title", "description", "status", "helpType"], op: "contains", value: "x" },
        ],
      })
    )
    expect(status).toBe(400)
    expect(String(body.message)).toContain("at most")
  })
})

describe("a grouped count is one call, and it comes back labelled", () => {
  it("open tickets per client, most first, with the company's name on each", async () => {
    const { body } = await ask(
      q({
        module: "tickets",
        where: [{ field: "status", op: "ne", value: "resolved" }],
        groupBy: ["accountId"],
      })
    )
    const groups = body.groups as { key: Record<string, string>; label: string; count: number }[]
    expect(body.records, "a grouped answer carries no rows").toEqual([])
    // Seven not resolved: T1, T2 (Flu), T5, T6, T7 (Confia), T9 (HORSt), T12
    // (Delaval) — the same rows the groups add up to.
    expect(body.total, "the total still counts the same filtered question").toBe(7)
    expect(groups[0]).toEqual({ key: { accountId: "A_CONFIA" }, label: "Confia Seguros", count: 3 })
    expect(groups.map((g) => g.label).sort()).toEqual([
      "Confia Seguros",
      "Delaval Nordic",
      "Flu Clinic GmbH",
      "HORSt Logistik",
    ])
    expect(body.groupsTruncated).toBe(false)
  })

  it("…and by a plain value, where there is nothing to label", async () => {
    const { body } = await ask(q({ module: "tickets", groupBy: ["status"] }))
    const groups = body.groups as { key: Record<string, string>; count: number }[]
    const byStatus = Object.fromEntries(groups.map((g) => [g.key.status, g.count]))
    expect(byStatus).toEqual({
      new: 3,
      in_progress: 1,
      triaged: 1,
      ready: 1,
      scheduled: 1,
      resolved: 6,
    })
  })

  it("two dimensions at once, and never three", async () => {
    const two = await ask(q({ module: "tickets", groupBy: ["accountId", "status"] }))
    expect(two.status).toBe(200)
    expect((two.body.groups as unknown[]).length).toBeGreaterThan(4)
    const three = await ask(q({ module: "tickets", groupBy: ["accountId", "status", "helpType"] }))
    expect(three.status).toBe(400)
  })
})

describe("the grammar refuses what it cannot answer, in words a model can act on", () => {
  it("a wrong status names the seven it could have been", async () => {
    const { status, body } = await ask(
      q({ module: "tickets", where: [{ field: "status", op: "eq", value: "open" }] })
    )
    expect(status).toBe(400)
    expect(String(body.message)).toContain("awaiting_validation")
  })

  it("a wrong field says to call describe_module", async () => {
    const { status, body } = await ask(
      q({ module: "tickets", where: [{ field: "urgency", op: "eq", value: "high" }] })
    )
    expect(status).toBe(400)
    expect(String(body.message)).toContain("describe_module")
  })

  it("a wrong operator lists the operators", async () => {
    const { status, body } = await ask(
      q({ module: "tickets", where: [{ field: "status", op: "startsWith", value: "new" }] })
    )
    expect(status).toBe(400)
    expect(String(body.message)).toContain("notIn")
  })

  it("between takes exactly two values", async () => {
    const { status, body } = await ask(
      q({ module: "tickets", where: [{ field: "resolvedAt", op: "between", value: ["2026-07-01"] }] })
    )
    expect(status).toBe(400)
    expect(String(body.message)).toContain("from and to")
  })

  it("a wrongly typed value is a 400, never a statement", async () => {
    const { status } = await ask(
      q({ module: "tickets", where: [{ field: "resolved", op: "eq", value: "yes" }] })
    )
    expect(status).toBe(400)
  })
})

describe("R14: the read is bounded, and it pages by key", () => {
  it("more filters than one statement may bind is a clean refusal", async () => {
    const many = Array.from({ length: MAX_CLAUSES + 1 }, () => ({
      field: "status",
      op: "ne",
      value: "resolved",
    }))
    const { status, body } = await ask(q({ module: "tickets", where: many }))
    expect(status).toBe(400)
    expect(String(body.message)).toContain(String(MAX_CLAUSES))
  })

  it("so is a value list longer than one filter may carry", async () => {
    const values = Array.from({ length: VALUES_PER_CLAUSE + 1 }, (_, i) => `A${i}`)
    const { status, body } = await ask(
      q({ module: "tickets", where: [{ field: "accountId", op: "in", value: values }] })
    )
    expect(status).toBe(400)
    expect(String(body.message)).toContain(String(VALUES_PER_CLAUSE))
  })

  it("a page carries an opaque cursor that reaches page two", async () => {
    // Thirteen rows is under one page, so the cursor is exercised by asking for
    // an order and walking the whole collection with the door's own answer.
    const first = await ask(q({ module: "tickets", sort: "ref", dir: "asc" }))
    expect(first.body.hasMore).toBe(false)
    expect(first.body.nextCursor).toBeNull()
    expect(first.body.total).toBe(13)
    // A cursor the server did not issue is refused, never silently ignored.
    const bad = await ask(q({ module: "tickets", sort: "ref", dir: "asc", cursor: "not-a-cursor" }))
    expect(bad.status).toBe(400)
  })

  it("the group ceiling is a real number, said at the query", () => {
    expect(GROUP_CAP).toBeGreaterThan(50)
    expect(VALUES_PER_CLAUSE).toBeLessThan(100)
  })
})

describe("a module answers to the names it already has everywhere else", () => {
  // THE BUG THIS CLOSES, measured on staging on 29 Aug 2026 against the owner's
  // own question. The assistant opened with describe_module("help"), the grammar
  // calls that module `tickets`, and the door refused — so the turn died on its
  // first call. That was not the model guessing: `list_help_tickets`,
  // `set_help_status`, the path /api/content/help, the permission string on every
  // role's sheet and the MCP tool names ALL say help, deliberately (CLAUDE.md:
  // the LABEL is Tickets, everything else stays `help`). The grammar introduced
  // the one place where the label was the name.
  async function describe(qs: string) {
    const request = new Request(`https://tenancy/api/tenancy/query/describe${qs}`, {
      headers: { Cookie: "session=x" },
    })
    const res = await worker.fetch(request, makeEnv(() => holder.db as DatabaseSync, IDS.staffUser))
    return { status: res.status, body: JSON.parse(await res.text()) as Record<string, unknown> }
  }

  it("describe_module('help') answers about tickets, and says so", async () => {
    const { status, body } = await describe("?module=help")
    expect(status, "the name every other tool in the catalogue uses must work").toBe(200)
    expect(body.module, "the answer echoes the CANONICAL name so the caller learns it").toBe("tickets")
    expect(body.askedAs).toBe("help")
  })

  it("query_records('help') answers about tickets too", async () => {
    const { status, body } = await ask(q({ module: "help", countOnly: true }))
    expect(status).toBe(200)
    expect(body.total).toBe(13)
    expect(body.module).toBe("tickets")
    expect(body.askedAs).toBe("help")
  })

  it("every alias is DERIVED and resolves to a real module", () => {
    expect(Object.keys(MODULE_ALIASES).length, "the derivation went empty").toBeGreaterThan(3)
    for (const [alias, key] of Object.entries(MODULE_ALIASES)) {
      expect(QUERY_MODULES[key], `${alias} points at "${key}", which is not a module`).toBeDefined()
      expect(
        Object.keys(QUERY_MODULES),
        `${alias} is itself a module name — a key must always win over an alias`
      ).not.toContain(alias)
    }
  })

  it("THE AUDIT: every module whose grammar name differs from its own table or right is aliased", () => {
    // The planner's question, answered by derivation rather than by eye. A name
    // that differs and is NOT reachable is the next `help`.
    const unreachable: string[] = []
    for (const [key, mod] of Object.entries(QUERY_MODULES))
      for (const other of [mod.table, mod.module]) {
        if (other === key) continue
        // A name several modules claim is deliberately NOT an alias (`work` is
        // five of them). It must still lead somewhere: the refusal names them.
        const claimants = Object.entries(QUERY_MODULES).filter(
          ([, m]) => m.table === other || m.module === other
        )
        if (claimants.length > 1) {
          expect(suggestModule(other).sort(), `"${other}" covers several modules and must name them all`).toEqual(
            claimants.map(([k]) => k).sort()
          )
          continue
        }
        if (canonicalModule(other) !== key) unreachable.push(`${other} -> ${key}`)
      }
    expect(
      unreachable,
      `these modules answer to a name elsewhere in the app that the grammar refuses — the same trap "help" was: ${unreachable.join(", ")}`
    ).toEqual([])
  })

  it("a name nobody recognises gets a suggestion, or honestly none", async () => {
    const near = await ask(q({ module: "ticket" }))
    expect(near.status).toBe(400)
    expect(String(near.body.message)).toContain('Did you mean "tickets"')
    const shared = await ask(q({ module: "work" }))
    expect(String(shared.body.message), "a right covering five modules names the five").toContain("stories")
    const nonsense = await ask(q({ module: "tikets" }))
    expect(nonsense.status).toBe(400)
    expect(String(nonsense.body.message), "no confident wrong guess").not.toContain("Did you mean")
    expect(String(nonsense.body.message), "…but still the list").toContain("tickets")
  })

  it("case and separators do not decide whether a caller gets an answer", async () => {
    for (const spelling of ["Tickets", "TICKETS", "Help"])
      expect((await describe(`?module=${spelling}`)).body.module, spelling).toBe("tickets")
  })
})

describe("describe_module names the clients you can actually filter on", () => {
  async function describe(qs: string) {
    const request = new Request(`https://tenancy/api/tenancy/query/describe${qs}`, {
      headers: { Cookie: "session=x" },
    })
    const res = await worker.fetch(request, makeEnv(() => holder.db as DatabaseSync, IDS.staffUser))
    return { status: res.status, body: JSON.parse(await res.text()) as Record<string, unknown> }
  }

  it("lists the names IN USE, not every company in the book", async () => {
    // A_OTHER has tickets; the harness's own accounts do not. The point of "in
    // use" is that the list answers "what can I filter THIS module by".
    const { status, body } = await describe("?module=tickets")
    expect(status).toBe(200)
    const field = (body.fields as { name: string; inUse?: string[] }[]).find((f) => f.name === "accountId")!
    expect(field.inUse!.sort()).toEqual([
      "Confia Seguros",
      "Delaval Nordic",
      "Flu Clinic GmbH",
      "HORSt Logistik",
    ])
  })

  it("a caller who may not read the clients is not told their names", async () => {
    // The names belong to the accounts module, so they ride that module's own
    // read right — the field still describes itself, it simply says nothing it
    // has no business saying.
    db().exec(`UPDATE role_permissions SET can_read = 0 WHERE role_id = '${IDS.adminRole}' AND module = 'accounts';`)
    const { body } = await describe("?module=tickets")
    const field = (body.fields as { name: string; inUse?: string[] }[]).find((f) => f.name === "accountId")!
    expect(field.inUse, "the client list is the accounts module's to give").toBeUndefined()
    expect(field.name, "…and the field itself still describes itself").toBe("accountId")
  })

  it("a module with no client column simply has no list", async () => {
    const { body } = await describe("?module=roles")
    for (const f of body.fields as { inUse?: string[] }[]) expect(f.inUse).toBeUndefined()
  })
})

describe("'how many?' comes back as a number and nothing else", () => {
  it("countOnly answers with the total and no rows", async () => {
    const { status, body } = await ask(
      q({
        module: "tickets",
        countOnly: true,
        where: [{ field: "resolvedAt", op: "between", value: ["2026-07-01", "2026-07-31"] }],
      })
    )
    expect(status).toBe(200)
    expect(body.total).toBe(4)
    expect(body.records, "a page of rows is not part of the answer to 'how many'").toEqual([])
    expect(body.hasMore).toBe(false)
    expect(body.nextCursor).toBeNull()
  })

  it("…and the same question WITHOUT it costs a page of rows to say the same number", async () => {
    // The measurement that earned the flag: on real staging data this was 206
    // resolved tickets returned as 50 rows and 23,250 characters, to answer a
    // question whose whole answer is one integer.
    const withRows = await ask(
      q({
        module: "tickets",
        where: [{ field: "resolvedAt", op: "between", value: ["2026-07-01", "2026-07-31"] }],
      })
    )
    expect(withRows.body.total).toBe(4)
    expect((withRows.body.records as unknown[]).length).toBe(4)
    expect(JSON.stringify(withRows.body).length).toBeGreaterThan(
      JSON.stringify((await ask(q({ module: "tickets", countOnly: true, where: [{ field: "resolvedAt", op: "between", value: ["2026-07-01", "2026-07-31"] }] }))).body).length
    )
  })

  it("countOnly is a boolean, not a word", async () => {
    const { status } = await ask("?module=tickets&countOnly=yes")
    // Anything but the literal "true" simply means no — the door reads one
    // spelling and never guesses at another.
    expect(status).toBe(200)
  })
})

describe("the projection leaves the long columns out until they are asked for", () => {
  it("a default row carries the ticket's own facts and not its description", async () => {
    const { body } = await ask(q({ module: "tickets", where: [{ field: "id", op: "eq", value: "T1" }] }))
    const row = (body.records as Record<string, unknown>[])[0]
    expect(row.status).toBe("new")
    expect(row.description, "description is bulky — left out unless named").toBeUndefined()
  })

  it("…and carries it the moment somebody names it", async () => {
    const { body } = await ask(
      q({
        module: "tickets",
        fields: ["id", "description"],
        where: [{ field: "id", op: "eq", value: "T1" }],
      })
    )
    expect((body.records as Record<string, unknown>[])[0].description).toBe("something is wrong")
  })

  it("filtering on a bulky column still works — only the RETURN is narrowed", async () => {
    const { body } = await ask(
      q({ module: "tickets", where: [{ field: "description", op: "contains", value: "wrong" }] })
    )
    expect(body.total).toBe(13)
  })
})

describe("a field answers to the word the app uses for it, in any case", () => {
  // MEASURED ON STAGING, 29 Aug 2026, as a two-turn failure the owner will
  // repeat: the assistant found ticket BERG2-T0002, was asked to resolve it, and
  // replied that no ticket with that reference existed — one turn after naming
  // it. Probing the real book turned up three separate faults behind that, and
  // each one silently returned zero rather than saying anything.
  it("`reference` reaches `ref` — the word the app's own prose uses", async () => {
    // list_help_tickets' description says "`q` searches the REFERENCE, the
    // description and the title". The column is `ref`. Same class as help vs
    // tickets: the word in front of a person is not the word the field answered
    // to, and the refusal cost a whole turn.
    const { status, body } = await ask(
      q({ module: "tickets", where: [{ field: "reference", op: "eq", value: "TIC-0000001" }], countOnly: true })
    )
    expect(status).toBe(200)
    expect(body.total).toBe(1)
  })

  it("a field also answers to its own COLUMN, which needs no list", async () => {
    const { body } = await ask(
      q({ module: "tickets", where: [{ field: "title_en", op: "eq", value: "Ticket 1" }], countOnly: true })
    )
    expect(body.total).toBe(1)
  })

  it("case does not decide whether a record exists", async () => {
    // The trap that actually bit: a model that lowercases a reference it was
    // just given gets nothing back from an exact match. `contains` has always
    // compared without regard to case; now every string comparison does.
    for (const spelling of ["TIC-0000001", "tic-0000001", "Tic-0000001"]) {
      const { body } = await ask(
        q({ module: "tickets", where: [{ field: "ref", op: "eq", value: spelling }], countOnly: true })
      )
      expect(body.total, spelling).toBe(1)
    }
  })

  it("a number and a date are NOT folded (there is no case to fold)", async () => {
    const { body } = await ask(
      q({
        module: "tickets",
        where: [{ field: "resolvedAt", op: "between", value: ["2026-07-01", "2026-07-31"] }],
        countOnly: true,
      })
    )
    expect(body.total).toBe(4)
  })

  it("every field alias resolves somewhere, shadows nothing, and is NEEDED", () => {
    for (const [alias, target] of Object.entries(FIELD_ALIASES)) {
      const modules = Object.values(QUERY_MODULES).filter((m) => m.fields.some((f) => f.name === target))
      expect(modules.length, `"${alias}" points at "${target}", which is no module's field`).toBeGreaterThan(0)
      // A field's own COLUMN and a loose spelling of its name already resolve
      // without a line here. An alias that duplicates one of those is dead
      // weight, and a dead exemption is what every ratchet in this base forbids.
      const reachedAnyway = modules.some((m) =>
        m.fields.some((f) => f.name === target && (f.column === alias || f.name.toLowerCase() === alias))
      )
      expect(reachedAnyway, `"${alias}" already resolves as a column or a spelling — delete the line`).toBe(false)
      // …and where a module really HAS a field by the alias's own name, the
      // real one wins. Asserted rather than reasoned about.
      for (const mod of Object.values(QUERY_MODULES)) {
        const real = mod.fields.find((f) => f.name === alias)
        if (real) expect(queryField(mod, alias)).toBe(real)
      }
    }
  })
})

describe("THE NEWEST ROW IS REALLY THE NEWEST — the property, not the ticket", () => {
  // A CONFIDENTLY WRONG RECORD, PROPOSED FOR A WRITE. On staging on 29 Aug 2026
  // the assistant answered "which ticket was updated most recently?" with the
  // SECOND most recent — and then faithfully proposed resolving that one. Had
  // anybody confirmed, the wrong ticket would have been resolved, and the wrong
  // answer read perfectly: "no reference number and no title" was a true
  // statement about the record it found.
  //
  // A most-recent query that returns the second-most-recent reads as correct
  // forever unless something checks the actual maximum. So this checks the
  // maximum, for every date field on every module, against the same rows.
  it("sorting by any date field puts the real extreme first", async () => {
    let checked = 0
    for (const [name, mod] of Object.entries(QUERY_MODULES)) {
      for (const field of mod.fields.filter((f) => f.type === "date")) {
        const { status, body } = await ask(
          q({ module: name, sort: field.name, dir: "desc", fields: ["id", field.name] })
        )
        // The harness's role holds most rights but not every one; a module this
        // caller may not read is not this property's business. Refusals are the
        // gate working, and query-fence.test.ts is where they are proved.
        if (status === 403) continue
        expect(status, `${name}.${field.name}`).toBe(200)
        const rows = body.records as Record<string, unknown>[]
        if (rows.length < 2) continue
        const values = rows
          .map((r) => r[field.column] as string | null)
          .filter((v): v is string => typeof v === "string")
        if (values.length < 2) continue
        checked++
        expect(
          values[0],
          `${name} sorted by ${field.name} desc: the first row is not the greatest value in the page`
        ).toBe([...values].sort().reverse()[0])
      }
    }
    // A sweep that skipped everything passes exactly like a sweep that proved
    // something. This is the one line that tells them apart.
    expect(checked, "the ordering sweep compared nothing — it has gone blind").toBeGreaterThan(3)
  })

  it("the answer SAYS which order it used, so a default is never mistaken for a choice", async () => {
    // The trap that produced the wrong ticket is not a broken sort — it is an
    // ABSENT one. A caller who asks for no order gets the module's default, and
    // for tickets that is newest-by-CREATION, whose first row is a different
    // record from newest-by-UPDATE. Nothing can guess which they meant; the
    // answer can and does say which it gave.
    const defaulted = await ask(q({ module: "tickets", fields: ["id"] }))
    expect(defaulted.body.sort).toBe(QUERY_MODULES.tickets.defaultSort)
    const asked = await ask(q({ module: "tickets", sort: "updatedAt", dir: "desc", fields: ["id"] }))
    expect(asked.body.sort).toBe("updatedAt")
    expect(asked.body.dir).toBe("desc")
  })

  it("a sort name resolves exactly like a filter name — column, spelling, alias", async () => {
    // `where` accepted a field by its column and its other names from the day
    // aliases landed; `sort` did not. So `sort: "updated"` — the word
    // list_help_tickets documents — was REFUSED, and a refused ordering is how
    // "most recently updated" silently became "most recently created".
    const first = async (sort: string) => {
      const { status, body } = await ask(q({ module: "tickets", sort, dir: "desc", fields: ["id"] }))
      expect(status, sort).toBe(200)
      return (body.records as { id: string }[])[0]?.id
    }
    const canonical = await first("updatedAt")
    for (const spelling of ["updated_at", "updated", "updatedat"])
      expect(await first(spelling), `"${spelling}" must reach the same order`).toBe(canonical)
  })

  it("a sort name that is nothing at all still refuses, and lists what it could be", async () => {
    const { status, body } = await ask(q({ module: "tickets", sort: "whenever" }))
    expect(status).toBe(400)
    expect(String(body.message)).toContain("updatedAt")
  })
})

describe("a filter value that names nothing comes back WITH the number", () => {
  // THE SENTENCE THAT MADE THIS NECESSARY. Asked the owner's own question on
  // staging on 29 Aug 2026, the assistant answered: "There are 97 open tickets
  // for FluClinic, Confia and HORSt combined". Ninety-seven is right — it is 66
  // + 31 across TWO clients. The prose lists three names and says "combined",
  // which tells the reader a third client contributed to a total it is missing
  // from. A correct number wrapped in a false statement, which is worse than a
  // wrong number, because nothing about it looks wrong.
  //
  // The model had the information (describe_module lists the clients in use) and
  // used the caller's words anyway. So the fact has to ride the ANSWER.
  it("names the client that does not exist, beside the count", async () => {
    // The fixture HAS a HORSt (staging does not), so the third needle here is
    // one that names nobody in either — the shape is what is being tested.
    const { status, body } = await ask(
      q({
        module: "tickets",
        where: [{ field: "accountId", op: "contains", value: ["flu", "confia", "wanderlust"] }],
        countOnly: true,
      })
    )
    expect(status).toBe(200)
    expect(body.total, "the count is over the clients that DO exist").toBe(8)
    expect(body.unmatched).toEqual([{ field: "accountId", values: ["wanderlust"] }])
  })

  it("says nothing when everything the caller named exists", async () => {
    const { body } = await ask(
      q({
        module: "tickets",
        where: [{ field: "accountId", op: "contains", value: ["flu", "confia"] }],
        countOnly: true,
      })
    )
    expect(body.unmatched, "silence is for when there is nothing to report").toBeUndefined()
  })

  it("an id that matches nothing is reported too, not just a name", async () => {
    const { body } = await ask(
      q({ module: "tickets", where: [{ field: "accountId", op: "in", value: ["A_GHOST"] }], countOnly: true })
    )
    expect(body.total).toBe(0)
    expect(body.unmatched).toEqual([{ field: "accountId", values: ["A_GHOST"] }])
  })

  it("a HANDLE that names no record is reported — the hole the client case missed", async () => {
    // The two-turn failure, reduced. Both of these used to return a bare zero,
    // which reads as "there is no such ticket" and is how the assistant
    // contradicted itself one turn after naming the record.
    const absent = await ask(
      q({ module: "tickets", where: [{ field: "ref", op: "eq", value: "TIC-9999999" }], countOnly: true })
    )
    expect(absent.body.total).toBe(0)
    expect(absent.body.unmatched).toEqual([{ field: "ref", values: ["TIC-9999999"] }])

    // …and the id/ref confusion itself: a REFERENCE handed to the `id` field.
    // Saying so is what lets the model try the other handle instead of
    // announcing that the record does not exist.
    const wrongHandle = await ask(
      q({ module: "tickets", where: [{ field: "id", op: "eq", value: "TIC-0000001" }], countOnly: true })
    )
    expect(wrongHandle.body.total).toBe(0)
    expect(wrongHandle.body.unmatched).toEqual([{ field: "id", values: ["TIC-0000001"] }])
  })

  it("a handle that DOES name a record reports nothing", async () => {
    const { body } = await ask(
      q({ module: "tickets", where: [{ field: "ref", op: "eq", value: "TIC-0000001" }], countOnly: true })
    )
    expect(body.total).toBe(1)
    expect(body.unmatched).toBeUndefined()
  })

  it("a word the TEAM does not use is the same failure and is reported the same way", async () => {
    // "how many Bug tickets" when this team calls them Defects returns 0, which
    // reads as "none" rather than "not a word we use". The vocabulary is theirs
    // and changes without a deploy, so it cannot be refused at the boundary the
    // way a fixed status can — it has to be answered honestly instead.
    const { body } = await ask(
      q({ module: "tickets", where: [{ field: "helpType", op: "in", value: ["Bug", "Kerfuffle"] }], countOnly: true })
    )
    expect(body.unmatched).toEqual([{ field: "helpType", values: ["Kerfuffle"] }])
  })

  it("a fixed status is still refused outright, which is the same honesty earlier", async () => {
    // Where the answer is knowable without asking the database, the door says so
    // at the boundary instead of counting zero and reporting it afterwards.
    const { status } = await ask(
      q({ module: "tickets", where: [{ field: "status", op: "in", value: ["open"] }] })
    )
    expect(status).toBe(400)
  })

  it("a date range is never called unmatched (a range names no entity)", async () => {
    const { body } = await ask(
      q({
        module: "tickets",
        where: [{ field: "resolvedAt", op: "between", value: ["2030-01-01", "2030-12-31"] }],
        countOnly: true,
      })
    )
    expect(body.total).toBe(0)
    expect(body.unmatched, "an empty range is an answer, not a misspelling").toBeUndefined()
  })
})

describe("THE QUESTION THIS LANE WAS OPENED BY, in two calls", () => {
  it("'how many open tickets from flu clinic, confia and HORSt combined, and how many resolved in July 2026 across all?'", async () => {
    // CALL ONE — the three clients, by name, in one filter, grouped so the
    // per-client split comes back beside the combined total.
    const open = await ask(
      q({
        module: "tickets",
        where: [
          { field: "accountId", op: "contains", value: ["flu clinic", "confia", "HORSt"] },
          { field: "status", op: "ne", value: "resolved" },
        ],
        groupBy: ["accountId"],
      })
    )
    expect(open.status).toBe(200)
    expect(open.body.total, "six open across the three of them").toBe(6)
    const perClient = Object.fromEntries(
      (open.body.groups as { label: string; count: number }[]).map((g) => [g.label, g.count])
    )
    expect(perClient).toEqual({ "Confia Seguros": 3, "Flu Clinic GmbH": 2, "HORSt Logistik": 1 })

    // CALL TWO — resolved in July, across every client, which used to be
    // inexpressible at any price.
    const july = await ask(
      q({
        module: "tickets",
        where: [{ field: "resolvedAt", op: "between", value: ["2026-07-01", "2026-07-31"] }],
      })
    )
    expect(july.status).toBe(200)
    expect(july.body.total, "four resolved in July, the 31st included").toBe(4)

    // …and the answer a person would read.
    expect(`${open.body.total} open, ${july.body.total} resolved in July`).toBe(
      "6 open, 4 resolved in July"
    )
  })
})
