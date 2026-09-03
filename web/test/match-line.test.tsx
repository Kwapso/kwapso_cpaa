// "1 TICKETS MATCH" — the sentence under every search box in the app.
//
// The find bar built its own line out of a number, a noun and the word "match":
// `` `${total} ${noun} match` ``. Correct exactly once — when the total was not
// one — and wrong on the reading a person is most likely to be looking at, on
// six screens, since the bar was written.
//
// The fix is not an `s`, and this file is here to keep it from becoming one. A
// sentence assembled at run time out of three pieces is a sentence no catalogue
// can hold (R28): the key IS the English, so a glued line has no key, and the
// six nouns rode in as bare props that no extractor ever saw — the whole line
// reached a German reader in English, plural bug and all. Whole sentences are
// the unit a translator can be handed, so the screen owns the words and this
// seam owns only the choice between them and the number that goes in the hole.
//
// DRIVEN RATHER THAN SCANNED. The defect was three characters of template
// literal that read perfectly well; what was wrong was what appeared on screen
// for one particular total, and nothing but rendering it at that total says so.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { PagedFind, type FindQuery } from "@/components/paged-find"

type Row = { id: string; name: string }

// The cache is a module singleton — a fresh key per test so nothing bleeds.
let n = 0
const freshKey = () => `tickets:team-${++n}`

/** A door that answers with the total it was built for. */
function doorWith(total: number) {
  return async (_query: FindQuery, _cursor: string | null) => ({
    rows: Array.from({ length: Math.min(total, 3) }, (_, i) => ({ id: `r${i}`, name: "x" })) as Row[],
    nextCursor: null,
    total,
  })
}

/** The tickets find bar, in the words the screen hands it. */
function renderFind(total: number) {
  return render(
    <PagedFind<Row>
      listKey={freshKey()}
      placeholder="Search tickets…"
      matches={{
        none: "No tickets match",
        one: "1 ticket matches",
        many: "{count} tickets match",
      }}
      // R50 — this suite exercises the match line over a resting collection
      // that already has rows (the search box has to be on screen to ask
      // anything of).
      restingEmpty={false}
      fetchPage={doorWith(total)}
    >
      {() => <div />}
    </PagedFind>
  )
}

/** Ask something. The box is debounced upstream (200ms), so the assertion waits
 * rather than assuming the question has reached the door. */
function ask(text = "board") {
  fireEvent.change(screen.getByPlaceholderText("Search tickets…"), { target: { value: text } })
}

afterEach(cleanup)

describe("the line under the search box", () => {
  it("says ONE ticket matches, in the singular", async () => {
    renderFind(1)
    ask()
    // The whole defect, in one assertion: this read "1 tickets match" on live
    // staging, on every paged screen in the app.
    await waitFor(() => expect(screen.getByText("1 ticket matches")).toBeTruthy())
  })

  it("says how many when there are more than one", async () => {
    renderFind(52)
    ask()
    await waitFor(() => expect(screen.getByText("52 tickets match")).toBeTruthy())
  })

  it("says none when nothing matched", async () => {
    renderFind(0)
    ask()
    await waitFor(() => expect(screen.getByText("No tickets match")).toBeTruthy())
  })

  it("keeps the big-number ceiling — the one line allowed to end in a +", async () => {
    // A filtered total is the one number in this app that may be approximate
    // (format-count.test.ts owns the ceiling itself); the sentence still has to
    // be a sentence around it.
    renderFind(3_465)
    ask()
    await waitFor(() => expect(screen.getByText("3.4k tickets match")).toBeTruthy())
  })

  it("says nothing at all until somebody asks something", () => {
    renderFind(52)
    // A bare screen is not a search, and a match count over an untouched box
    // reads as one.
    expect(screen.queryByText(/tickets match/)).toBeNull()
  })
})
