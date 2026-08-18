// THE CLIENT HALF OF A SORT THAT PAGES.
//
// `workers/content/test/paged-sort.test.ts` proves the door orders the whole
// collection. This proves the four things the SCREEN has to get right for that
// to reach anybody, and each is a way to have a working door and a broken list:
//
//   1. AN UNTOUCHED SCREEN ASKS FOR NOTHING. It reads the collection's own cache
//      key and pages the collection's own cursor, exactly as it did before
//      sorting existed. A screen that sent its default on mount would fetch the
//      same rows into a second cache key every time somebody opened it.
//   2. CHANGING THE ORDER ASKS THE DOOR, with the name and direction the door knows.
//   3. …AND STARTS AT PAGE ONE, because a changed order is a changed question and
//      lands in a cache key of its own, with its own cursor sidecar. This is the
//      one most likely to be got subtly wrong: a screen that carried the old
//      cursor over would ask for "everything after Bergman S.A." in a
//      newest-first read and get back a page that looks like an answer.
//   4. GOING BACK to the order it started in asks nothing again — the collection's
//      own rows are still there, untouched, underneath.
//
// It drives the DIRECTION TOGGLE rather than the field picker: the toggle is an
// ordinary button with an aria-label, while the picker is a Radix popover over
// cmdk, and a test that fights a portal proves less about this component than it
// does about jsdom. Flipping the direction is the same code path — one
// `onChange`, the same query, the same key.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { PagedFind, type FindQuery } from "@/components/paged-find"
import { COLLECTION_SORTS, translatedSorts } from "@/lib/collection-sorts"
import { cursorKey } from "@/lib/live-resources"
import { readCache } from "@shared/web/store"

type Row = { id: string; name: string }

/** A door that remembers what it was asked, and pages. */
function fakeDoor() {
  const asked: { query: FindQuery; cursor: string | null }[] = []
  const fetchPage = async (query: FindQuery, cursor: string | null) => {
    asked.push({ query: { ...query }, cursor })
    return { rows: [{ id: "a", name: "x" }] as Row[], nextCursor: "CURSOR-A", total: 254 }
  }
  return { asked, fetchPage }
}

// The cache is a module singleton — a fresh key per test so nothing bleeds.
let n = 0
const freshKey = () => `accounts:team-${++n}`

function renderFind(listKey: string, fetchPage: ReturnType<typeof fakeDoor>["fetchPage"]) {
  return render(
    <PagedFind<Row>
      listKey={listKey}
      placeholder="Search accounts…"
      matches={{
        none: "No accounts match",
        one: "1 account matches",
        many: "{count} accounts match",
      }}
      // The labels go through the reader's language at the call site; here it is
      // the identity, so the English in COLLECTION_SORTS is what renders.
      sorts={translatedSorts("accounts", (s) => s)}
      defaultSort={COLLECTION_SORTS.accounts.defaultSort}
      fetchPage={fetchPage}
    >
      {(found) => <div data-testid="listkey">{found.listKey ?? "(the collection's own)"}</div>}
    </PagedFind>
  )
}

/** The direction toggle, found by what it SAYS it will do. */
const flip = () => fireEvent.click(screen.getByRole("button", { name: /switch to/i }))
const shownKey = () => screen.getByTestId("listkey").textContent as string

afterEach(cleanup)

describe("a sort on a paged collection asks the door", () => {
  it("draws the control, seeded with the order the list is already in", () => {
    renderFind(freshKey(), fakeDoor().fetchPage)
    // Not a bare "Sort by": a control that opens on nothing answers "which way am
    // I sorted?" with a shrug, while the list is very much in an order.
    expect(screen.getByText("Newest first"), "the active order is named").toBeTruthy()
    expect(
      screen.getByRole("button", { name: /switch to ascending/i }),
      "…and the toggle shows the direction it is in, not a guess"
    ).toBeTruthy()
  })

  it("an untouched screen asks the door NOTHING", async () => {
    const door = fakeDoor()
    renderFind(freshKey(), door.fetchPage)
    expect(shownKey()).toBe("(the collection's own)")
    await new Promise((r) => setTimeout(r, 20))
    expect(door.asked, "the default order is never sent").toEqual([])
  })

  it("changing the order asks the door for it, from page one", async () => {
    const door = fakeDoor()
    const listKey = freshKey()
    renderFind(listKey, door.fetchPage)

    flip()

    await waitFor(() => expect(door.asked.length).toBe(1))
    const first = door.asked[0]
    expect(first.query.sort, "the name is the door's own, out of ACCOUNT_SORTS").toBe("created")
    expect(first.query.dir, "…and the direction that was asked for").toBe("asc")
    // PAGE ONE. There is no cursor to carry, and nothing had to remember to
    // clear one — a changed order is simply a different question.
    expect(first.cursor).toBeNull()
  })

  it("the answer lands in a cache key of its OWN, with its own cursor", async () => {
    const door = fakeDoor()
    const listKey = freshKey()
    renderFind(listKey, door.fetchPage)

    flip()

    const key = await waitFor(() => {
      const k = shownKey()
      expect(k).not.toBe("(the collection's own)")
      return k
    })
    // The question is IN the key, so the collection's own rows and cursor are
    // still exactly where they were.
    expect(key).toContain(listKey)
    expect(key).toContain("sort=created")
    expect(key).toContain("dir=asc")
    await waitFor(() => expect(readCache(cursorKey(key))).toBe("CURSOR-A"))
    expect(
      readCache(cursorKey(listKey)),
      "the collection's own cursor must not have moved"
    ).toBeUndefined()
  })

  it("going back to the order it started in asks the door nothing again", async () => {
    const door = fakeDoor()
    renderFind(freshKey(), door.fetchPage)

    flip()
    await waitFor(() => expect(door.asked.length).toBe(1))
    flip()

    // Back on the default: the screen reads the collection's own key again
    // rather than asking the door for the order it was already in.
    await waitFor(() => expect(shownKey()).toBe("(the collection's own)"))
    expect(door.asked.length, "no second request for the order we started in").toBe(1)
  })

  it("a bare sort is not a search — no 'N accounts match' line", async () => {
    const door = fakeDoor()
    renderFind(freshKey(), door.fetchPage)
    flip()
    await waitFor(() => expect(door.asked.length).toBe(1))
    // Ordering a list does not narrow it. "254 accounts match" over an untouched
    // search box is a count of everything, labelled as if it were a result.
    expect(screen.queryByText(/accounts match/)).toBeNull()
  })
})
