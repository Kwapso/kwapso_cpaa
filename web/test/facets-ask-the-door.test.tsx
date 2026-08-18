// THE CLIENT HALF OF A FILTER THAT PAGES.
//
// `workers/content/test/paged-facets.test.ts` proves the DOOR narrows the whole
// collection — a row that is not on page one is found by the facet. This proves
// the four things the SCREEN has to get right for that to reach anybody, and each
// is a way to have a working door and a lying list:
//
//   1. THE FACETS CARRY THE DOOR'S NAMES AND THE DOOR'S VALUES. `kind=meeting`,
//      never `kind=From a meeting`, and never the shaped row's column.
//   2. PICKING ONE ASKS THE DOOR, from page one, in a cache key of its own —
//      so nothing has to remember to reset, and the collection's own rows and
//      cursor are untouched underneath.
//   3. TWO FILTERS ARE ONE QUESTION, one key, one request.
//   4. AN UNTOUCHED SCREEN ASKS NOTHING, and looks exactly as it did before any
//      of this existed.
//
// EVERY ASSERTION HERE IS ABOUT WHAT THE DOOR WAS ASKED after a person operates
// the real control, and that is deliberate. The lane that shipped sorting the day
// before wrote checks that asked whether the pieces were present and consistent —
// the screen's option names against the door's menu, the recipe's control, the
// comparator's output — and every one of them passed while the column headers
// reordered nothing at all. None of them asked whether anything moves when
// somebody presses the thing. This file asks nothing else.
//
// THE TWO CONTROLS ARE DRIVEN DIFFERENTLY because the library draws them
// differently: past eight options a `control:"select"` facet becomes a searchable
// popover over cmdk, and under it a plain Radix Select. So `Kind` (eighteen
// kinds) opens on a click and `Filed under` on a pointerdown. Driving both is the
// point rather than an inconvenience — they are two different code paths to one
// `onChange`, and a screen can have one working and the other not.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { PagedFind, type FindQuery } from "@/components/paged-find"
import { COLLECTION_FILTERS, translatedFacets } from "@/lib/collection-filters"
import { cursorKey } from "@/lib/live-resources"
import { readCache } from "@shared/web/store"

type Row = { id: string; name: string }

/** WHAT JSDOM HAS NOT GOT. Radix's popovers measure themselves and capture the
 * pointer; neither exists here, and without them a trigger simply never opens —
 * which would make every assertion below pass by never running. */
beforeAll(() => {
  Object.assign(window.HTMLElement.prototype, {
    scrollIntoView: () => {},
    hasPointerCapture: () => false,
    releasePointerCapture: () => {},
    setPointerCapture: () => {},
  })
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

/** A door that remembers what it was asked, and pages. */
function fakeDoor() {
  const asked: { query: FindQuery; cursor: string | null }[] = []
  const fetchPage = async (query: FindQuery, cursor: string | null) => {
    asked.push({ query: { ...query }, cursor })
    return { rows: [{ id: "a", name: "x" }] as Row[], nextCursor: "CURSOR-A", total: 52 }
  }
  return { asked, fetchPage }
}

// The cache is a module singleton — a fresh key per test so nothing bleeds.
let n = 0
const freshKey = () => `knowledge:team-${++n}`

/** The knowledge base's own find bar, with the accounts a screen would have
 * loaded. The identity for `t`, so the English in COLLECTION_FILTERS renders. */
function renderFind(listKey: string, fetchPage: ReturnType<typeof fakeDoor>["fetchPage"]) {
  return render(
    <PagedFind<Row>
      listKey={listKey}
      placeholder="Search the knowledge base…"
      noun="sources"
      facets={translatedFacets("knowledge", (s) => s, {
        compartment: [{ value: "account:A_1", label: "Bergman S.A." }],
      })}
      fetchPage={fetchPage}
    >
      {(found) => <div data-testid="listkey">{found.listKey ?? "(the collection's own)"}</div>}
    </PagedFind>
  )
}

/** Open a facet and choose one of its words. The two controls open on different
 * events; `open` says which, and both end at the same `role="option"`. */
async function pick(label: string, option: string, open: "click" | "pointer") {
  const trigger = screen.getByLabelText(label)
  if (open === "click") fireEvent.click(trigger)
  else fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" })
  await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0))
  fireEvent.click(screen.getByRole("option", { name: option }))
}

const shownKey = () => screen.getByTestId("listkey").textContent as string

afterEach(cleanup)

describe("a filter on a paged collection asks the door", () => {
  it("the facets carry the DOOR's parameter names, and the door's values", () => {
    // RUN, not read — R22's lesson said about a filter. `{ field: "kind" }` on a
    // recipe and `{ field: "kind" }` in COLLECTION_FILTERS are the same five
    // characters meaning two different things (the loaded row's property, and the
    // door's query parameter), and the whole fault was that nobody could tell
    // them apart by looking at either one.
    const facets = translatedFacets("knowledge", (s) => s, {
      compartment: [{ value: "account:A_1", label: "Bergman S.A." }],
    })
    expect(facets.map((f) => f.field).sort()).toEqual(["active", "compartment", "kind"])
    const kind = facets.find((f) => f.field === "kind")
    expect(
      kind?.options?.find((o) => o.label === "From a meeting")?.value,
      "the door matches `meeting` — the words are for the person"
    ).toBe("meeting")
    // …and a facet with nothing to offer is DROPPED rather than drawn empty.
    expect(
      translatedFacets("knowledge", (s) => s).map((f) => f.field),
      "the compartment facet has no options without the team's accounts"
    ).not.toContain("compartment")
  })

  it("every declared facet is one a person can actually pick from", () => {
    // A blind derivation reports "all clear" exactly like a passing one.
    expect(Object.keys(COLLECTION_FILTERS).length).toBeGreaterThan(3)
    for (const [key, facets] of Object.entries(COLLECTION_FILTERS)) {
      expect(facets.length, `${key} declares no filters`).toBeGreaterThan(0)
      for (const f of facets) {
        expect(f.label.trim(), `${key}.${f.field} needs words`).not.toBe("")
        // A CLOSED vocabulary declares its own options; a row-backed one declares
        // none and is filled in by the screen. A single-option dropdown is a
        // control that can only agree with itself.
        if (f.options)
          expect(f.options.length, `${key}.${f.field} declares a vocabulary of one`).toBeGreaterThan(1)
      }
    }
  })

  it("an untouched screen asks the door NOTHING", async () => {
    const door = fakeDoor()
    renderFind(freshKey(), door.fetchPage)
    expect(shownKey()).toBe("(the collection's own)")
    await new Promise((r) => setTimeout(r, 20))
    expect(door.asked, "no filter picked is no question asked").toEqual([])
  })

  it("PICKING ONE ASKS THE DOOR FOR IT, from page one, in a key of its own", async () => {
    const door = fakeDoor()
    const listKey = freshKey()
    renderFind(listKey, door.fetchPage)

    // The owner's own filter, on the owner's own screen.
    await pick("Kind", "From a meeting", "click")

    await waitFor(() => expect(door.asked.length).toBe(1))
    const first = door.asked[0]
    expect(first.query.kind, "the door's own parameter, with the door's own value").toBe("meeting")
    // PAGE ONE. There is no cursor to carry, and nothing had to remember to clear
    // one — a changed filter is simply a different question.
    expect(first.cursor).toBeNull()

    const key = await waitFor(() => {
      const k = shownKey()
      expect(k).not.toBe("(the collection's own)")
      return k
    })
    expect(key).toContain(listKey)
    expect(key).toContain("kind=meeting")
    await waitFor(() => expect(readCache(cursorKey(key))).toBe("CURSOR-A"))
    expect(readCache(cursorKey(listKey)), "the collection's own cursor must not have moved").toBeUndefined()
  })

  it("two filters are ONE question — one key, one request, both parameters", async () => {
    const door = fakeDoor()
    renderFind(freshKey(), door.fetchPage)

    await pick("Kind", "From a meeting", "click")
    await waitFor(() => expect(door.asked.length).toBe(1))
    await pick("Filed under", "Bergman S.A.", "pointer")

    await waitFor(() => expect(door.asked.length).toBe(2))
    expect(door.asked[1].query).toEqual({ kind: "meeting", compartment: "account:A_1" })
    expect(door.asked[1].cursor, "a second filter is a new question, so page one again").toBeNull()
    expect(shownKey()).toContain("compartment=account:A_1")
  })

  it("…and the filtered TOTAL is the door's, said out loud beside the box", async () => {
    // The number that made the original report so hard to see: the badge above
    // the list was exact and about the whole collection, while the rows under it
    // were a narrowed page. Two numbers, both true, neither about what was asked.
    // The find bar now says the second one, labelled.
    const door = fakeDoor()
    renderFind(freshKey(), door.fetchPage)
    await pick("Kind", "From a meeting", "click")
    await waitFor(() => expect(screen.getByText("52 sources match")).toBeTruthy())
  })
})
