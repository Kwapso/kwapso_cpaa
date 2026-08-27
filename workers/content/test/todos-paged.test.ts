// THE COMPLETED TO-DO, AND THE DOCUMENT ON IT — reachable at last, and reachable
// PAST PAGE ONE.
//
// The bug this file locks: `completeTodo` writes `file_url` and `completed_at` in
// the SAME UPDATE, so a to-do carries the document a client sent us if and only
// if it is completed — and every to-do list on both front doors filtered the
// completed out. The only rows that could hold a client's file were exactly the
// rows nobody could see.
//
// Making them visible makes the collection GROW (a completed to-do is kept for
// ever), so it PAGES (R14) — and paging is the half a single request cannot
// demonstrate. An ORDER BY that disagrees with its keyset predicate does not
// fail: it drops rows at the page boundary, which is invisible in page one and
// permanent. So every test here WALKS the cursor to the end, exactly as
// <LoadMore> does, and counts what came back.
//
// Two orderings, and therefore two cursor signatures: the open pile is ordered by
// when a thing is due (no date last) and the done pile by when it came back. A
// cursor is a position inside ONE order, so one minted in the open list must be
// REFUSED by the done list rather than tolerated — tolerated, it returns a page
// that reads like an answer and skips an arbitrary slice.
//
// Driven through the SHIPPED route handlers against a real SQLite database
// running the real team migrations, like its siblings paged-sort/paged-search,
// because the three things that must agree about an order (the ORDER BY, the
// keyset predicate and the cursor's key) live in three different files.

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
    MEDIA: { put: async () => undefined },
    INTERNAL_MEDIA: { put: async () => undefined },
  } as never
}

const get = (query: string, userId: string = IDS.staffUser) =>
  worker.fetch(
    new Request(`https://content/api/content/todos${query}`, { headers: { Cookie: "session=x" } }),
    env(userId) as never
  )

type Row = { id: string; dueOn: string | null; completedAt: string | null; fileUrl: string | null; fileName: string | null }
type Page = {
  rows: Row[]
  ids: string[]
  total: number
  openTotal: number
  doneTotal: number
  allTotal: number
  hasMore: boolean
  nextCursor: string | null
}

async function page(query: string, userId: string = IDS.staffUser): Promise<Page> {
  const res = await get(query, userId)
  expect(res.status, `${query} refused (${await res.clone().text()})`).toBe(200)
  const body = (await res.json()) as Omit<Page, "rows" | "ids"> & { todos: Row[] }
  return { ...body, rows: body.todos, ids: body.todos.map((r) => r.id) }
}

/** Walk the whole view through the cursor, one page at a time, exactly as the
 * panel's <LoadMore> and the portal's "Show older" do. THE POINT OF THIS FILE:
 * an ORDER BY that agrees with its predicate returns every row exactly once; one
 * that does not loses rows silently at the boundary. */
async function walk(query: string, userId: string = IDS.staffUser): Promise<string[]> {
  const ids: string[] = []
  let cursor: string | null = null
  for (let guard = 0; guard < 20; guard++) {
    const p = await page(cursor ? `${query}&cursor=${encodeURIComponent(cursor)}` : query, userId)
    ids.push(...p.ids)
    if (!p.hasMore) return ids
    cursor = p.nextCursor
    expect(cursor, "hasMore with no cursor is a list that cannot be finished").toBeTruthy()
  }
  throw new Error("the walk never ended — a cursor is repeating a page")
}

/** SIXTY OPEN AND SIXTY DONE, so each pile is a page and a bit: ten rows of each
 * are reachable ONLY past the cursor, which is where a broken keyset hides them.
 *
 * The due dates are a PERMUTATION of the row order rather than its reverse (17 is
 * coprime with 60, so `(17n + 9) mod 60` walks every value once and scatters
 * them), for the reason paged-sort.test.ts gives at its own fixture: reversed
 * would make "in due order" and "the insert order, backwards" the same list, so a
 * door ignoring the ordering entirely could still pass.
 *
 * A THIRD OF THE OPEN ONES HAVE NO DATE AT ALL, because "no date last" is half
 * of what the open pile's single sort key means, and a null is the value a keyset
 * predicate loses rows on if the expression is not null-safe.
 *
 * A THIRD, not a tenth, AND THAT NUMBER IS THE TEST. Twenty dateless rows sort
 * into positions 41–60, so the page boundary at fifty falls INSIDE them and the
 * one cursor this walk mints is minted from a null. At six dateless rows they sat
 * at 55–60, the boundary landed on a dated row, and the null key was never
 * exercised: breaking the sentinel in the cursor's own key (`?? "9999-12-31"`)
 * left this file green. Measured by breaking it, not reasoned about.
 *
 * ONE DONE ROW CARRIES A FILE and is deliberately the OLDEST, so it lands at the
 * very bottom of the done pile — off page one, in the one view that can hold it.
 * That is the bug, stated as a fixture: the document a client sent us, on the row
 * that used to render nowhere, behind a cursor that used not to exist. */
const ROWS = 60
const dueNo = (n: number) => (17 * n + 9) % ROWS
const openId = (n: number) => `O${String(n).padStart(3, "0")}`
const doneId = (n: number) => `D${String(n).padStart(3, "0")}`
/** Every third open row is dateless — `dueOn` null, sorted last. See above for
 * why the count matters rather than the existence. */
const dateless = (n: number) => n % 3 === 0
const dueFor = (n: number) =>
  dateless(n) ? null : `2026-${String((dueNo(n) % 12) + 1).padStart(2, "0")}-${String((dueNo(n) % 28) + 1).padStart(2, "0")}`
/** The oldest completion, so the row carrying the file is the LAST of the done
 * pile in its newest-first order — ten rows past where page one stops. */
const completedFor = (n: number) => `2026-06-${String(n).padStart(2, "0")}T09:00:00.000Z`
const FILE_ROW = doneId(1)
const FILE_URL = "/media/todo/01KZWXFD86N0K3RZRBHKMKRWYS/01M11AQG9GEBJNGEHZAG1ASZNN"

beforeEach(() => {
  holder.db = buildSpineDb()
  const rows: string[] = []
  for (let n = 1; n <= ROWS; n++) {
    const due = dueFor(n)
    rows.push(
      `('${openId(n)}', 'BERG-D${String(n).padStart(4, "0")}', '${IDS.victimAccount}', 'Open ${n}', ${
        due ? `'${due}'` : "NULL"
      }, NULL, NULL, NULL, '2026-01-01T00:00:00.000Z')`
    )
    rows.push(
      `('${doneId(n)}', 'BERG-E${String(n).padStart(4, "0")}', '${IDS.victimAccount}', 'Done ${n}', ${
        due ? `'${due}'` : "NULL"
      }, '${completedFor(n)}', ${n === 1 ? `'${FILE_URL}'` : "NULL"}, ${
        n === 1 ? `'invoice.png'` : "NULL"
      }, '2026-01-01T00:00:00.000Z')`
    )
  }
  // The harness seeds none of its own, but start from a known table rather than a
  // nearly-known one — this file is about exactly 120 rows.
  db().exec(
    `DELETE FROM todos;
     INSERT INTO todos (id, ref, account_id, title, due_on, completed_at, file_url, file_name, created_at)
     VALUES ${rows.join(",\n")};`
  )
})

describe("a completed to-do, and the document on it, is reachable (R14 · R40)", () => {
  it("THE BUG: the file lives on a row only the done view can return", async () => {
    const open = await page("?view=open")
    expect(
      open.rows.some((r) => r.fileUrl),
      "a to-do carrying a file is a COMPLETED to-do, and the open pile is where every list used to stop"
    ).toBe(false)

    // …and it is not merely "in the done view" — it is past the cursor, which is
    // the second half of the same bug and the one paging introduces.
    const first = await page("?view=done")
    expect(first.ids, "the fixture's file row must be OFF page one, or this proves nothing").not.toContain(
      FILE_ROW
    )
    const walked = await walk("?view=done")
    expect(walked, "every done to-do, reachable").toHaveLength(ROWS)
    expect(walked.at(-1), "the oldest completion is the last row of a newest-first walk").toBe(FILE_ROW)

    // The bytes' address comes back whole, on the row a person can now open.
    const found = (await page(`?id=${FILE_ROW}`)).rows[0]
    expect(found.fileUrl).toBe(FILE_URL)
    expect(found.fileName).toBe("invoice.png")
  })

  it("page one is a page — the proof rests on there being rows it cannot see", async () => {
    for (const view of ["open", "done"]) {
      const first = await page(`?view=${view}`)
      expect(first.ids, `${view}: page one is a page`).toHaveLength(PAGE_SIZE)
      expect(first.hasMore, `${view}: and it says there is more`).toBe(true)
      expect(first.total, `${view}: R16 — the exact server count, never the page's length`).toBe(ROWS)
    }
  })

  it("each pile walks in its own order, every row exactly once", async () => {
    // OPEN — no date last, then soonest first. One expression, and the two halves
    // of it are what a four-term ORDER BY collapsed into.
    const open = await walk("?view=open")
    expect(open, "every open to-do, once").toHaveLength(ROWS)
    expect(new Set(open).size, "no row repeated across a page boundary").toBe(ROWS)
    const dues = open.map((id) => dueFor(Number(id.slice(1))))
    const dated = dues.filter((d): d is string => d !== null)
    expect(dated, "the dated ones in soonest-first order").toEqual([...dated].sort())
    expect(
      dues.slice(dated.length).every((d) => d === null),
      "…and every dateless one after all of them, which is the other half of the key"
    ).toBe(true)

    // DONE — newest completion first, and a different direction through the
    // predicate (`<` rather than `>`, id tiebreak turning with it).
    const done = await walk("?view=done")
    expect(done, "every done to-do, once").toHaveLength(ROWS)
    expect(new Set(done).size).toBe(ROWS)
    const stamps = done.map((id) => completedFor(Number(id.slice(1))))
    expect(stamps, "newest first").toEqual([...stamps].sort().reverse())
  })

  it("a cursor is refused by the OTHER view — a clean 400, never a plausible page", async () => {
    // This is the failure that ships. The two views sort on different columns, so
    // a position inside one is nonsense inside the other — and nonsense that
    // returns rows rather than an error is worse than nonsense that does not.
    const openCursor = (await page("?view=open")).nextCursor as string
    const doneCursor = (await page("?view=done")).nextCursor as string
    expect(openCursor).toBeTruthy()
    expect(doneCursor).toBeTruthy()
    for (const [view, cursor] of [
      ["done", openCursor],
      ["open", doneCursor],
    ] as const) {
      const res = await get(`?view=${view}&cursor=${encodeURIComponent(cursor)}`)
      expect(res.status, `${view} must refuse a cursor minted in the other view`).toBe(400)
    }
    // …and each still walks with its own.
    expect((await page(`?view=open&cursor=${encodeURIComponent(openCursor)}`)).ids).toHaveLength(
      ROWS - PAGE_SIZE
    )
    expect((await page(`?view=done&cursor=${encodeURIComponent(doneCursor)}`)).ids).toHaveLength(
      ROWS - PAGE_SIZE
    )
  })

  it("all three counts ride every answer, and none of them moves with the view (R16)", async () => {
    for (const q of ["?view=open", "?view=done", "?view=open&cursor="]) {
      const p = await page(q.endsWith("cursor=") ? "?view=open" : q)
      expect(p.openTotal, `${q}: the open pile`).toBe(ROWS)
      expect(p.doneTotal, `${q}: the done pile`).toBe(ROWS)
      expect(p.allTotal, `${q}: both, which is what the record tab above badges`).toBe(ROWS * 2)
    }
    // `total` is the view that was asked for, so a tab badge and the list under it
    // are one answer rather than two.
    expect((await page("?view=open")).total).toBe(ROWS)
    expect((await page("?view=done")).total).toBe(ROWS)
  })

  it("a retired `view=all` answers the open pile rather than a different question", async () => {
    // The word is gone: the two views sort by different columns, so "everything,
    // in one order" has no honest keyset answer. It falls back to open — which is
    // what a caller got before `all` existed — rather than reaching SQL.
    expect((await page("?view=all")).ids).toEqual((await page("?view=open")).ids)
    expect((await page("?view=nonsense")).ids).toEqual((await page("?view=open")).ids)
  })

  it("R38: one to-do is asked of the DOOR, whichever page it would have been on", async () => {
    // The fault this pre-empts: `contentApi.todoOne` used to fetch the whole list
    // and `.find()` the row out of it. Inert while nothing drew a single to-do
    // and the list was capped; a silent "that no longer exists" for every row
    // past the cursor the moment either changed.
    for (const id of [openId(60), doneId(1), openId(10)]) {
      const p = await page(`?id=${id}`)
      expect(p.rows.map((r) => r.id), `${id} must be findable by name`).toEqual([id])
      expect(p.hasMore, "a lookup is not a page").toBe(false)
      expect(p.nextCursor).toBeNull()
    }
    // A to-do that is not there is an empty answer, not a page of something else.
    expect((await page("?id=01NOTATODO")).rows).toEqual([])
  })

  it("the fence holds on every page, not just the first (R21)", async () => {
    // A client login walking the same door. The victim's contact may see their own
    // company's; the burglar stands at another company and must see none of them,
    // page one or page four.
    const mine = await walk("?view=done", IDS.contactUser)
    expect(mine, "their own company's, all of it").toHaveLength(ROWS)

    const theirs = await page("?view=done", IDS.burglarUser)
    expect(theirs.rows, "another company's client sees nothing of these").toEqual([])
    expect(theirs.total, "…and is not told how many there are either").toBe(0)
    expect(theirs.allTotal).toBe(0)
    // …and cannot reach past a page they were never given, using ours.
    const ourCursor = (await page("?view=done")).nextCursor as string
    const past = await page(`?view=done&cursor=${encodeURIComponent(ourCursor)}`, IDS.burglarUser)
    expect(past.rows, "a cursor is a position, never a permission").toEqual([])
  })
})
