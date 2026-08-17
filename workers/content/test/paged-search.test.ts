// SEARCHING A LIST THAT PAGES — the two doors that had no `q` at all.
//
// Tickets and the backlog both PAGE (R14, GROWING_COLLECTIONS) and both wore a
// search box that filtered the fifty rows the browser had loaded. Neither door
// could be asked, so there was nothing to wire the box to: a ticket raised last
// spring was unfindable by name while the badge above it still counted it.
//
// Driven through the SHIPPED route handlers against a real SQLite database, so
// what is proved is the whole sentence a screen depends on: the rows that come
// back match, the rows that don't are absent, and the `total` beside them counts
// the SAME question (which is the half that makes a filtered count honest).

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
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

/** What a paged door answered: the ids, and the exact total beside them. */
async function page(path: string): Promise<{ ids: string[]; total: number }> {
  const res = await get(path)
  expect(res.status, `${path} refused`).toBe(200)
  const body = (await res.json()) as { tickets?: { id: string }[]; stories?: { id: string }[]; total: number }
  const rows = body.tickets ?? body.stories ?? []
  return { ids: rows.map((r) => r.id).sort(), total: body.total }
}

beforeEach(() => {
  holder.db = buildSpineDb()
  // Three tickets and three stories, written straight in: this file is about the
  // WHERE clause, and going through the create doors would only add ceremony
  // between the words and the search that has to find them.
  db().exec(
    `INSERT INTO help (id, description, ref, title_en, status, created_at, creator_id, creator_name) VALUES
       ('H_FIND_DESC', 'The Confia export is missing March', 'T-101', NULL, 'new', '2026-03-01', '${IDS.staffUser}', 'Staff'),
       ('H_FIND_REF',  'Something else entirely',            'T-102', NULL, 'new', '2026-03-02', '${IDS.staffUser}', 'Staff'),
       ('H_FIND_EN',   'Iets in het Nederlands',             'T-103', 'The Confia handover', 'new', '2026-03-03', '${IDS.staffUser}', 'Staff');
     INSERT INTO stories (id, ref, title, detail, status, rank, created_at, creator_id, creator_name) VALUES
       ('S_TITLE',  'S-201', 'Confia onboarding', 'nothing to see',     'open', 'a', '2026-03-01', '${IDS.staffUser}', 'Staff'),
       ('S_DETAIL', 'S-202', 'Something else',    'chase Confia twice', 'open', 'b', '2026-03-02', '${IDS.staffUser}', 'Staff'),
       ('S_DONE',   'S-203', 'Confia handover',   'finished in March',  'done', 'c', '2026-03-03', '${IDS.staffUser}', 'Staff');`
  )
})

describe("the tickets door can be searched", () => {
  it("finds a ticket by its description, its reference and its title", async () => {
    const byWords = await page("/api/content/help?scope=all&view=live&q=Confia")
    expect(byWords.ids).toEqual(["H_FIND_DESC", "H_FIND_EN"])
    expect(byWords.total, "the total counts the SAME search, or a filtered list badges somebody else's number").toBe(2)

    expect((await page("/api/content/help?scope=all&view=live&q=T-102")).ids).toEqual(["H_FIND_REF"])
  })

  it("without a search it is still the whole (paged) list", async () => {
    const all = await page("/api/content/help?scope=all&view=live")
    expect(all.ids).toEqual(expect.arrayContaining(["H_FIND_DESC", "H_FIND_REF", "H_FIND_EN"]))
    expect(all.total).toBeGreaterThan(2)
  })

  it("a needle nobody wrote finds nothing, and says nothing rather than everything", async () => {
    const none = await page("/api/content/help?scope=all&view=live&q=zzzz-no-such-words")
    expect(none.ids).toEqual([])
    expect(none.total).toBe(0)
  })

  it("a search box is not a pattern box — % is a character", async () => {
    // The same escape the accounts search carries (workers/tenancy/test/
    // search-literal.test.ts). Unescaped, this would return the whole table.
    expect((await page("/api/content/help?scope=all&view=live&q=%25")).ids).toEqual([])
  })
})

describe("the backlog can be searched", () => {
  it("finds a story by its title, its detail and its reference", async () => {
    // `view=all` because the everyday backlog hides finished work — which is why
    // the screen's find bar passes it: somebody searching by name is as likely to
    // want the story that is already done.
    const found = await page("/api/content/stories?view=all&q=Confia")
    expect(found.ids).toEqual(["S_DETAIL", "S_DONE", "S_TITLE"])
    expect(found.total).toBe(3)

    expect((await page("/api/content/stories?view=all&q=S-202")).ids).toEqual(["S_DETAIL"])
  })

  it("the search and the view are one question, counted once", async () => {
    // The default view hides the done one, and the total has to agree with that
    // — the count is taken over the same filter object as the rows.
    const openOnly = await page("/api/content/stories?q=Confia")
    expect(openOnly.ids).toEqual(["S_DETAIL", "S_TITLE"])
    expect(openOnly.total).toBe(2)
  })

  it("a needle nobody wrote finds nothing", async () => {
    expect((await page("/api/content/stories?view=all&q=zzzz-no-such-words")).total).toBe(0)
  })

  it("% is a character here too", async () => {
    expect((await page("/api/content/stories?view=all&q=%25")).ids).toEqual([])
  })
})
