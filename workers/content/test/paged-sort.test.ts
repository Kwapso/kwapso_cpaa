// SORTING A LIST THAT PAGES — and the only demonstration that means anything.
//
// The library's collection engine sorts the rows the frame is HOLDING. On a
// paged collection (R14) that is page one, so a test that sorts fifty loaded
// rows and finds them in order proves nothing at all about the bug: fifty rows
// arranged correctly is exactly what the broken version does. The owner's words
// were "the sort actually doesn't work… I don't see the order changing, even
// though I can see that there are different values", which is what it looks like
// when a control reorders a window you cannot see the edges of.
//
// So this file insists on ONE thing, over and over: a row that is NOT on page one
// arrives at the top when you sort by it. Sixty tickets, PAGE_SIZE fifty, and the
// row that has to appear is the sixtieth — unreachable by any amount of sorting
// in the browser.
//
// Driven through the SHIPPED route handlers against a real SQLite database, like
// its sibling paged-search.test.ts, because the three things that must agree
// about an order (the ORDER BY, the keyset predicate and the cursor's key) live
// in three different files and only a real walk proves they do.

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

type Page = { ids: string[]; titles: string[]; total: number; nextCursor: string | null; hasMore: boolean }

async function page(path: string): Promise<Page> {
  const res = await get(path)
  expect(res.status, `${path} refused (${await res.clone().text()})`).toBe(200)
  const body = (await res.json()) as {
    tickets: { id: string; description: string }[]
    total: number
    nextCursor: string | null
    hasMore: boolean
  }
  return {
    ids: body.tickets.map((r) => r.id),
    titles: body.tickets.map((r) => r.description),
    total: body.total,
    nextCursor: body.nextCursor,
    hasMore: body.hasMore,
  }
}

/** Walk the whole collection through the cursor, one page at a time, exactly as
 * <LoadMore> does. This is the half a single request cannot show: an ORDER BY
 * that agrees with the keyset predicate returns every row once, and one that
 * does not silently drops rows at the page boundary rather than failing. */
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

/** SIXTY TICKETS, so page one is fifty of them and ten are reachable only past
 * the cursor. `rank` counts up with the row number, so the list's DEFAULT order
 * (rank descending) is H060 first and H001 last — page one is H060…H011.
 *
 * The descriptions are a PERMUTATION of the rank order rather than its reverse,
 * and that is the fixture's whole design. Reversed would make "sorted by title"
 * and "the default, backwards" the same list, so a door that ignored the sort
 * entirely could still pass. 17 is coprime with 60, so `(17n + 9) mod 60` walks
 * every value exactly once and scatters them: the alphabetically FIRST ticket
 * lands on H003 and the LAST on H010 — both ten-odd rows past where the
 * browser's copy stops, so BOTH directions have to reach past the cursor to be
 * right. */
const ROWS = 60
const titleNo = (n: number) => (17 * n + 9) % ROWS
const desc = (n: number) => `Ticket ${String(titleNo(n)).padStart(3, "0")}`
/** Where those two land, asserted below rather than assumed. */
const FIRST_ALPHABETICALLY = "H003"
const LAST_ALPHABETICALLY = "H010"

beforeEach(() => {
  holder.db = buildSpineDb()
  const values = Array.from({ length: ROWS }, (_, i) => {
    const n = i + 1
    const day = String((n % 28) + 1).padStart(2, "0")
    return `('H${String(n).padStart(3, "0")}', '${desc(n)}', 'T-${n}', ${
      // Three kinds and two stages, cycling, so an order that groups is visibly
      // an order rather than a coincidence.
      `'${["question", "problem", "change"][n % 3]}'`
    }, '${["new", "triaged"][n % 2]}', '2026-01-${day}', '${IDS.staffUser}', 'Staff', '${String(n).padStart(3, "0")}')`
  })
  // The harness seeds a ticket of its own; this file is about sixty rows in a
  // known order, so it starts from an empty table rather than sixty-one in a
  // nearly-known one.
  db().exec(
    `DELETE FROM help;
     INSERT INTO help (id, description, ref, help_type, status, created_at, creator_id, creator_name, rank)
     VALUES ${values.join(",\n")};`
  )
})

const LIST = "/api/content/help?scope=all&view=live"

describe("a sort on a paged collection is a question for the door", () => {
  it("page one is a page — the proof rests on there being rows it cannot see", async () => {
    const first = await page(LIST)
    expect(first.ids).toHaveLength(PAGE_SIZE)
    expect(first.total, "R16: the exact server count, not the page's length").toBe(ROWS)
    expect(first.hasMore).toBe(true)
    // The two rows this whole file is about. Nothing the browser can do to the
    // fifty it is holding will ever put either at the top, because neither is here.
    expect(first.ids, "the alphabetically first ticket must be OFF page one").not.toContain(
      FIRST_ALPHABETICALLY
    )
    expect(first.ids, "and so must the alphabetically last one").not.toContain(LAST_ALPHABETICALLY)
  })

  it("A ROW THAT IS NOT ON PAGE ONE ARRIVES AT THE TOP WHEN YOU SORT BY IT", async () => {
    const sorted = await page(`${LIST}&sort=title&dir=asc`)
    expect(sorted.ids[0], "the first ticket alphabetically is not on page one of the default order").toBe(
      FIRST_ALPHABETICALLY
    )
    expect(sorted.titles[0]).toBe("Ticket 000")
    // …and the other way round, so the direction is doing work rather than the
    // sort happening to agree with the default. This one is off page one too.
    const back = await page(`${LIST}&sort=title&dir=desc`)
    expect(back.ids[0]).toBe(LAST_ALPHABETICALLY)
    expect(back.titles[0]).toBe(`Ticket ${String(ROWS - 1).padStart(3, "0")}`)
  })

  it("the COUNT does not move when the order does (R16)", async () => {
    for (const q of ["", "&sort=title&dir=asc", "&sort=created&dir=desc", "&sort=status"])
      expect((await page(`${LIST}${q}`)).total, `sorting must not change what there is (${q})`).toBe(ROWS)
  })

  it("the whole collection walks in order, every row exactly once", async () => {
    // The keyset half. An ORDER BY that disagrees with the predicate does not
    // fail — it drops rows at the page boundary, which is invisible in page one.
    const walked = await walk(`${LIST}&sort=title&dir=asc`)
    expect(walked, "every row, once").toHaveLength(ROWS)
    expect(new Set(walked).size, "no row repeated across the boundary").toBe(ROWS)
    const titles = walked.map((id) => desc(Number(id.slice(1))))
    expect(titles, "and in the order that was asked for").toEqual([...titles].sort())

    // Descending walks the other way and is a different code path in the
    // predicate (`>` becomes `<`, and the id tiebreak turns with it).
    const down = await walk(`${LIST}&sort=title&dir=desc`)
    expect(down).toHaveLength(ROWS)
    expect(down).toEqual([...walked].reverse())
  })

  it("a sort with ties still pages — the id breaks them, in the same direction", async () => {
    // Only two distinct values across sixty rows, so almost every page boundary
    // falls INSIDE a tie. This is the case a missing (or wrongly-directed) id
    // tiebreak loses rows on.
    const walked = await walk(`${LIST}&sort=status&dir=asc`)
    expect(walked).toHaveLength(ROWS)
    expect(new Set(walked).size).toBe(ROWS)
  })

  it("the default order is exactly what it always was — an untouched screen asks for nothing", async () => {
    expect((await page(LIST)).ids).toEqual((await page(`${LIST}&sort=rank&dir=desc`)).ids)
  })

  it("a name the door does not know is a clean 400, never a silent fall back", async () => {
    // Falling back would be an ordering quietly answering a different question —
    // the defect R19 exists for, one control along.
    for (const bad of ["secret_column", "rank; DROP TABLE help", "internal_rate"]) {
      const res = await get(`${LIST}&sort=${encodeURIComponent(bad)}`)
      expect(res.status, `"${bad}" must be refused`).toBe(400)
    }
    expect((await get(`${LIST}&dir=sideways`)).status).toBe(400)
  })

  it("a cursor minted under one order is refused by another", async () => {
    // The client re-keys its cache on every sort change, so nothing should ever
    // reach this. That is the point of having it: page two of an alphabetical
    // list, handed to a newest-first read, would not fail — it would skip an
    // arbitrary slice and hand back a page that reads like an answer.
    const first = await page(`${LIST}&sort=title&dir=asc`)
    const stale = encodeURIComponent(first.nextCursor as string)
    expect((await get(`${LIST}&cursor=${stale}`)).status).toBe(400)
    expect((await get(`${LIST}&sort=title&dir=desc&cursor=${stale}`)).status).toBe(400)
    expect((await get(`${LIST}&sort=created&cursor=${stale}`)).status).toBe(400)
    // …and its own order still walks.
    expect((await get(`${LIST}&sort=title&dir=asc&cursor=${stale}`)).status).toBe(200)
  })

  it("the order narrows nothing — a filtered sort is still the filter's rows", async () => {
    // R18/R21's half: an ordering must never widen (or narrow) what a caller can
    // see. The rows a sorted read returns are the SAME set, rearranged.
    const plain = await walk(`${LIST}&helpType=question`)
    const sorted = await walk(`${LIST}&helpType=question&sort=title&dir=asc`)
    expect([...sorted].sort()).toEqual([...plain].sort())
    expect(sorted, "…and genuinely rearranged, not returned as-is").not.toEqual(plain)
  })
})
