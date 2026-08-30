// COMING BACK TO THE SAME QUESTION — the half of the nav memory a unit test
// cannot reach by reading the store, because it is about what a CONTROL does
// when it mounts for the second time.
//
// `nav-memory.test.ts` proves the store is bounded and forgets in the right
// order. This proves the two things that decide whether the feature is any use
// or actively harmful:
//
//   • the search she typed and the filters she set come BACK, and the door is
//     asked the same question it was asked before she left;
//   • a filter whose option has been retired while she was away does NOT come
//     back, and does not take the rest of her question down with it.
//
// The second is the corner this whole feature lives or dies on. A remembered
// value is a fact about a world that has moved: a dropdown value retired, a
// column no longer offered. Restoring one blindly asks the door for a word it
// does not know, which is a clean 400 on a screen that looks like a search.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PagedFind, type FindQuery } from "@/components/paged-find"
import { translatedFacets } from "@/lib/collection-filters"
import { forgetEverything, readSlot, writeSlot } from "@/lib/nav-memory"
import { RememberedScreen } from "@shared/web/remembered"

type Row = { id: string; name: string }

const TEAM = "team_01"
const PATH = "/knowledge"

/** The screen memory the shell publishes, backed by the real store — the point
 * is to exercise the store, not a stand-in for it. */
const memory = {
  read: (slot: string) => readSlot(TEAM, PATH, slot),
  write: (slot: string, value: unknown) => writeSlot(TEAM, PATH, slot, value),
}

function fakeDoor() {
  const asked: FindQuery[] = []
  const fetchPage = async (query: FindQuery) => {
    asked.push({ ...query })
    return { rows: [{ id: "a", name: "x" }] as Row[], nextCursor: null, total: 1 }
  }
  return { asked, fetchPage }
}

let n = 0
const freshKey = () => `knowledge:team-${++n}`

function renderFind(listKey: string, fetchPage: ReturnType<typeof fakeDoor>["fetchPage"]) {
  return render(
    <RememberedScreen memory={memory}>
      <PagedFind<Row>
        listKey={listKey}
        placeholder="Search knowledge base…"
        matches={{ none: "No sources match", one: "1 source matches", many: "{count} sources match" }}
        facets={translatedFacets("knowledge", (s) => s)}
        fetchPage={fetchPage}
      >
        {() => <div />}
      </PagedFind>
    </RememberedScreen>
  )
}

const box = () => screen.getByPlaceholderText("Search knowledge base…") as HTMLInputElement

beforeEach(() => forgetEverything())
afterEach(cleanup)

describe("she comes back to the question she left", () => {
  it("refills the search box and asks the door the same thing, with no typing", async () => {
    const listKey = freshKey()
    const first = fakeDoor()
    const { unmount } = renderFind(listKey, first.fetchPage)
    fireEvent.change(box(), { target: { value: "Confia" } })
    await waitFor(() => expect(first.asked.some((q) => q.q === "Confia")).toBe(true))

    // She leaves for To-dos: the shell keys its content region on the route, so
    // this whole screen is thrown away.
    unmount()
    cleanup()

    // …and comes back.
    const second = fakeDoor()
    renderFind(listKey, second.fetchPage)
    expect(box().value, "the box she typed in still says what she typed").toBe("Confia")
    await waitFor(() =>
      expect(second.asked.some((q) => q.q === "Confia"), "and the door was asked it").toBe(true)
    )
  })

  it("without a memory it behaves exactly as it did before any of this — the client portal's case", async () => {
    const listKey = freshKey()
    writeSlot(TEAM, PATH, `find:${listKey}`, { text: "Confia", values: {}, sortBy: "", sortDir: null })
    const door = fakeDoor()
    // No provider: `useRemembered` falls back to a plain `useState`.
    render(
      <PagedFind<Row>
        listKey={listKey}
        placeholder="Search knowledge base…"
        matches={{ none: "No sources match", one: "1 source matches", many: "{count} sources match" }}
        facets={translatedFacets("knowledge", (s) => s)}
        fetchPage={door.fetchPage}
      >
        {() => <div />}
      </PagedFind>
    )
    expect(box().value).toBe("")
  })
})

describe("a remembered filter whose option no longer exists", () => {
  it("is dropped, and does not take the rest of the question with it", async () => {
    const listKey = freshKey()
    // A dropdown value retired while she was away. The door has never heard of
    // it; asking would be a 400 on a screen that looks like a search.
    writeSlot(TEAM, PATH, `find:${listKey}`, {
      text: "Confia",
      values: { kind: "a-kind-that-was-retired" },
      sortBy: "",
      sortDir: null,
    })
    const door = fakeDoor()
    renderFind(listKey, door.fetchPage)

    await waitFor(() => expect(door.asked.length).toBeGreaterThan(0))
    const question = door.asked[door.asked.length - 1]
    expect(question.kind, "the retired word is never sent").toBeUndefined()
    expect(question.q, "and her search survived it").toBe("Confia")
    expect(box().value).toBe("Confia")
  })

  it("keeps a value the facet still offers", async () => {
    const listKey = freshKey()
    const kinds = translatedFacets("knowledge", (s) => s).find((f) => f.field === "kind")
    const stillOffered = kinds?.options?.[0]?.value as string
    expect(stillOffered, "the fixture needs a real option to be about anything").toBeTruthy()
    writeSlot(TEAM, PATH, `find:${listKey}`, {
      text: "",
      values: { kind: stillOffered },
      sortBy: "",
      sortDir: null,
    })
    const door = fakeDoor()
    renderFind(listKey, door.fetchPage)
    await waitFor(() => expect(door.asked.length).toBeGreaterThan(0))
    expect(door.asked[door.asked.length - 1].kind).toBe(stillOffered)
  })

  it("a shape it cannot read at all falls back to an empty question", async () => {
    const listKey = freshKey()
    writeSlot(TEAM, PATH, `find:${listKey}`, "this was a string in an older build")
    const door = fakeDoor()
    renderFind(listKey, door.fetchPage)
    expect(box().value, "degrade to the top, never to an error").toBe("")
  })
})
