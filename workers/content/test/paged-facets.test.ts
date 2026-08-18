// FILTERING A LIST THAT PAGES — and the only demonstration that means anything.
//
// THE REPORT, in the owner's hands on 18 Aug 2026: filter the knowledge base by
// "From a meeting" and it answers TWO. The door, asked properly, answers 52. The
// app holds 170 meetings. Nothing had crashed and nothing looked wrong: the
// library's frame filters the array it is HOLDING, page one happened to carry
// exactly two meetings, and the screen reported two — under a badge (R16)
// correctly counting all 3,000-odd sources.
//
// So a test that filters fifty loaded rows and finds the right ones proves
// nothing whatsoever about that bug: fifty rows correctly narrowed is exactly
// what the broken version already did. The whole question is whether the answer
// can reach past the cursor.
//
// This file therefore insists on ONE thing, over and over: A ROW THAT IS NOT ON
// PAGE ONE IS FOUND BY THE FACET. Sixty sources, PAGE_SIZE fifty, and the only
// meeting in the base is the sixtieth — unreachable by any amount of filtering in
// the browser. Its siblings say the same sentence about the search box
// (paged-search.test.ts) and about the order (paged-sort.test.ts); this is the
// third control on the same collection and the third time it was found the hard
// way.
//
// Driven through the SHIPPED route handlers against a real SQLite database, like
// both of them, because a filter is three things that must agree — the rows'
// WHERE, the COUNT's WHERE (R16), and the keyset predicate that walks the rest of
// them — and only a real walk proves they do.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
import { PAGE_SIZE } from "@shared/workers/paging"
import { buildSpineDb, IDS, makeEnv } from "../../tenancy/test/spine-harness"

const db = () => holder.db as DatabaseSync

function env(userId: string) {
  const base = makeEnv(() => db(), userId) as unknown as Record<string, unknown>
  return {
    ...base,
    INTERNAL_KEY: "k",
    PUBLIC_APP_URL: "https://kwapso.example",
    REALTIME: { fetch: async () => new Response("{}") },
  } as never
}

const get = (path: string) =>
  worker.fetch(
    new Request(`https://content${path}`, { headers: { Cookie: "session=x" } }),
    env(IDS.staffUser) as never
  )

type Page = { ids: string[]; total: number; nextCursor: string | null; hasMore: boolean }

async function page(path: string): Promise<Page> {
  const res = await get(path)
  expect(res.status, `${path} refused (${await res.clone().text()})`).toBe(200)
  const body = (await res.json()) as {
    sources: { id: string }[]
    total: number
    nextCursor: string | null
    hasMore: boolean
  }
  return {
    ids: body.sources.map((r) => r.id),
    total: body.total,
    nextCursor: body.nextCursor,
    hasMore: body.hasMore,
  }
}

/** Walk the whole narrowed collection through the cursor, exactly as <LoadMore>
 * does — because a filter that is applied to the ROWS but not to the keyset
 * predicate does not fail, it drops rows at the page boundary. */
async function walk(path: string): Promise<string[]> {
  const ids: string[] = []
  let cursor: string | null = null
  for (let guard = 0; guard < 20; guard++) {
    const p: Page = await page(cursor ? `${path}&cursor=${encodeURIComponent(cursor)}` : path)
    ids.push(...p.ids)
    if (!p.hasMore) return ids
    cursor = p.nextCursor
    expect(cursor, "hasMore with no cursor is a list that cannot be finished").toBeTruthy()
  }
  throw new Error("the walk never ended — a cursor is repeating a page")
}

/** SIXTY SOURCES, so page one is fifty and ten are reachable only past the
 * cursor. The list's default order is `touched` descending, and `updated_at`
 * counts UP with the row number, so page one is K060…K011 and the deep end of
 * this fixture is K010…K001.
 *
 * The three rows that matter are all down there, on purpose:
 *
 *   K001  the ONE `meeting`, and the whole report in one row — a kind with
 *         exactly one instance, which the browser's copy of the list does not
 *         contain, so "how many meetings?" is 1 or 0 and nothing in between;
 *   K002  the one source filed under a CLIENT rather than the agency;
 *   K003  the one source somebody has TAKEN AWAY from the assistant.
 *
 * Everything on page one is an agency `note`, in use — so every filter below has
 * to reach past the cursor to answer anything at all, and a filter that quietly
 * narrowed the loaded page would answer "none" to all three. */
const ROWS = 60
const id = (n: number) => `K${String(n).padStart(3, "0")}`
const THE_MEETING = id(1)
const THE_CLIENT_ONE = id(2)
const THE_WITHDRAWN_ONE = id(3)

beforeEach(() => {
  holder.db = buildSpineDb()
  // The staff role holds every knowledge right — asserted below rather than
  // assumed, because a suite whose premise quietly stopped being true would fail
  // (or pass) for a reason that has nothing to do with filtering.
  db().exec(
    `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
     VALUES ('${IDS.adminRole}_knowledge', '${IDS.adminRole}', 'knowledge', 1, 1, 1, 1);`
  )
  const values = Array.from({ length: ROWS }, (_, i) => {
    const n = i + 1
    const kind = n === 1 ? "meeting" : "note"
    const compartment = n === 2 ? `account:${IDS.victimAccount}` : "agency"
    const accountId = n === 2 ? `'${IDS.victimAccount}'` : "NULL"
    const off = n === 3 ? `'2026-02-01'` : "NULL"
    const touched = `2026-02-${String((n % 28) + 1).padStart(2, "0")}T00:00:0${n % 10}.000Z`
    return `('${id(n)}', '${kind}', '${compartment}', ${accountId}, 'Source ${String(n).padStart(3, "0")}',
             '2026-01-01', '${touched}', ${off})`
  })
  // The harness seeds sources of its own; this file is about sixty rows in a
  // known order, so it starts from an empty table.
  db().exec(
    `DELETE FROM knowledge_sources;
     INSERT INTO knowledge_sources
       (id, kind, compartment, account_id, title, created_at, updated_at, deactivated_at)
     VALUES ${values.join(",\n")};`
  )
})

const LIST = "/api/content/knowledge?"

describe("a filter on a paged collection is a question for the door", () => {
  it("page one is a page — the proof rests on there being rows it cannot see", async () => {
    const first = await page(LIST)
    expect(first.ids).toHaveLength(PAGE_SIZE)
    expect(first.total, "R16: the exact server count, not the page's length").toBe(ROWS)
    expect(first.hasMore).toBe(true)
    // The three rows this whole file is about. Nothing the browser can do to the
    // fifty it is holding will ever produce one of them, because none is here.
    for (const missing of [THE_MEETING, THE_CLIENT_ONE, THE_WITHDRAWN_ONE])
      expect(first.ids, `${missing} must be OFF page one`).not.toContain(missing)
  })

  it("A ROW THAT IS NOT ON PAGE ONE IS FOUND BY THE FACET", async () => {
    // THE REPORTED FAULT, exactly: one kind, one instance, and it is past the
    // cursor. The frame's answer to this was "none"; the owner's was "two".
    const meetings = await page(`${LIST}kind=meeting`)
    expect(meetings.ids, "the only meeting in the base is the sixtieth row").toEqual([THE_MEETING])
    expect(meetings.total, "…and the count is the count of THAT question").toBe(1)
    expect(meetings.hasMore, "one row is one page").toBe(false)
  })

  it("…and so is the one filed under a client, and the one taken away", async () => {
    const client = await page(`${LIST}compartment=account%3A${IDS.victimAccount}`)
    expect(client.ids).toEqual([THE_CLIENT_ONE])
    expect(client.total).toBe(1)

    const withdrawn = await page(`${LIST}active=no`)
    expect(withdrawn.ids).toEqual([THE_WITHDRAWN_ONE])
    expect(withdrawn.total).toBe(1)
    // …and its complement is everything else, which is the half a filter that
    // silently matched nothing would also pass.
    expect((await page(`${LIST}active=yes`)).total).toBe(ROWS - 1)
  })

  it("two filters compose, and so do a filter and the search box", async () => {
    // A narrowing that only ever ANDs correctly one at a time is a filter bar
    // that answers a different question every time somebody adds a second one.
    expect((await page(`${LIST}kind=note&active=no`)).ids).toEqual([THE_WITHDRAWN_ONE])
    expect((await page(`${LIST}kind=meeting&active=no`)).ids, "no row is both").toEqual([])
    expect((await page(`${LIST}kind=meeting&q=Source%20001`)).ids).toEqual([THE_MEETING])
    expect(
      (await page(`${LIST}kind=meeting&q=Source%20002`)).ids,
      "the search and the facet narrow together, never one instead of the other"
    ).toEqual([])
  })

  it("THE COUNT ANSWERS THE SAME QUESTION AS THE ROWS (R16)", async () => {
    // The half that made the original report so hard to see: the badge above the
    // list was exact and correct about the WHOLE collection while the rows under
    // it were a filtered page. Both numbers true, neither about what was asked.
    for (const [q, expected] of [
      ["kind=meeting", 1],
      ["kind=note", ROWS - 1],
      ["active=no", 1],
      [`compartment=account%3A${IDS.victimAccount}`, 1],
      ["", ROWS],
    ] as const) {
      const p = await page(`${LIST}${q}`)
      expect(p.total, `${q || "(no filter)"} must count what it listed`).toBe(expected)
      if (!p.hasMore) expect(p.ids.length, `${q}: a finished list is its own count`).toBe(expected)
    }
  })

  it("a filtered list still PAGES, every row exactly once", async () => {
    // 59 notes over a page size of 50: the filter has to ride the keyset
    // predicate as well as the WHERE, or the second page starts somewhere the
    // first one did not stop.
    const walked = await walk(`${LIST}kind=note`)
    expect(walked, "every note, once").toHaveLength(ROWS - 1)
    expect(new Set(walked).size, "no row repeated across the boundary").toBe(ROWS - 1)
    expect(walked, "and the meeting is not among them").not.toContain(THE_MEETING)
  })

  it("a filter and a SORT compose — the third control on the same question", async () => {
    // The narrowing and the ordering are answered in the same place and must not
    // undo each other. Title ascending over the notes puts K002 first (K001 is
    // the meeting, and is filtered out).
    const sorted = await walk(`${LIST}kind=note&sort=title&dir=asc`)
    expect(sorted[0]).toBe(THE_CLIENT_ONE)
    expect(sorted).toHaveLength(ROWS - 1)
    expect(new Set(sorted).size).toBe(ROWS - 1)
  })

  it("a word that is not a value NARROWS NOTHING, rather than emptying the list", async () => {
    // A filter is a narrowing. Refusing would be defensible; answering "no
    // sources" as if the base were empty is the one behaviour that reads as an
    // answer and is not.
    for (const q of ["kind=not_a_kind", "active=maybe", "active=true"])
      expect((await page(`${LIST}${q}`)).total, `${q} must not empty the list`).toBe(ROWS)
  })
})
