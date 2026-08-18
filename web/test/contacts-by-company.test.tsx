// CONTACTS ARE GROUPED UNDER THE COMPANY THEY SIT AT — and the grouping tells
// the truth about a list that pages.
//
// The owner asked for one thing ("grouped by company") and the risk in it is not
// the grouping, it is the PAGING: the accounts collection hands over fifty rows
// at a time, so a group drawn from what is loaded can be short. Three claims,
// and each is a way this could be quietly wrong:
//
//   1. a contact lands under HER OWN company, and the headings read in
//      alphabetical order — the arrangement somebody scans.
//   2. a company is ONE group no matter which page its contacts arrived on. The
//      map is built over every loaded row rather than per page, so pressing
//      "Load more" fills a group in; a per-page grouping would draw Bergman
//      twice, which is the failure that would look most like it worked.
//   3. THE SCREEN SAYS SO WHILE IT IS STILL SHORT, and stops saying it once the
//      cursor is spent. A caption that never appears is a lie; one that never
//      goes away is a different one.
//
// …plus the two groups that are not a company: a parent we are not holding (we
// can say she works somewhere, not where) and no parent at all.

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ContactsByCompany } from "@/components/contacts-by-company"
import { BASE_RECIPES } from "@/lib/screens"
import { cursorKey } from "@/lib/live-resources"
import { primeCache } from "@shared/web/store"
import type { Account } from "@shared/types"

afterEach(cleanup)

const LIST_KEY = "accounts:team-1"
const RECIPE = BASE_RECIPES["accounts.list"]

/** A contact, with only the fields the grouping and the row shaping read. */
const contact = (id: string, name: string, parentAccountId: string | null): Account =>
  ({
    id,
    accountType: "individual",
    parentAccountId,
    name,
    active: true,
  }) as Account

const COMPANIES = new Map([
  ["c-bergman", "Bergman S.A."],
  ["c-delaval", "Delaval Nord"],
])

/** The two headings that are not a company sit last, so "every heading" and
 * "the company headings" are two different reads of the same screen. */
const headings = () => screen.queryAllByRole("heading").map((h) => h.textContent)

function draw(rows: Account[]) {
  render(
    <ContactsByCompany
      rows={rows}
      companyNames={COMPANIES}
      recipe={RECIPE}
      // The recipe gates on `accounts: read` — with no rights the engine draws
      // nothing at all, which would make every claim below pass on an empty page.
      rights={{ accounts: { read: true, create: false, edit: false, delete: false } }}
      listKey={LIST_KEY}
      onAction={() => {}}
      onIntent={() => {}}
    />
  )
}

describe("contacts, grouped under the company each one sits at", () => {
  beforeEach(() => {
    // The cursor sidecar this component reads: null = that was the last page, so
    // by default nothing here is short and the caption stays off.
    primeCache(cursorKey(LIST_KEY), null)
  })

  it("files each contact under her own company, headings in alphabetical order", () => {
    draw([
      contact("p1", "Marta Bergman", "c-bergman"),
      contact("p2", "Ana Delaval", "c-delaval"),
      contact("p3", "Juan Ruiz", "c-bergman"),
    ])
    // Alphabetical, not the order the rows arrived in (Bergman's second contact
    // is last on the page).
    expect(headings()).toEqual(["Bergman S.A.", "Delaval Nord"])
    expect(screen.getByText("Marta Bergman")).toBeTruthy()
    expect(screen.getByText("Ana Delaval")).toBeTruthy()
    expect(screen.getByText("Juan Ruiz")).toBeTruthy()
  })

  it("draws a company ONCE however its contacts are interleaved", () => {
    // The shape a per-page grouping gets wrong: page two's Bergman contact must
    // join the group page one opened, not start a second one under the same name.
    draw([
      contact("p1", "Marta Bergman", "c-bergman"),
      contact("p2", "Ana Delaval", "c-delaval"),
      contact("p3", "Juan Ruiz", "c-bergman"),
      contact("p4", "Pau Delaval", "c-delaval"),
    ])
    expect(headings()).toEqual(["Bergman S.A.", "Delaval Nord"])
    expect(headings().filter((h) => h === "Bergman S.A.")).toHaveLength(1)
  })

  it("says the groups may be short while there is another page, and stops when there isn't", () => {
    primeCache(cursorKey(LIST_KEY), "opaque-cursor")
    draw([contact("p1", "Marta Bergman", "c-bergman")])
    expect(screen.queryByText(/Load more to fill a company in/)).toBeTruthy()

    cleanup()
    primeCache(cursorKey(LIST_KEY), null)
    draw([contact("p1", "Marta Bergman", "c-bergman")])
    // Everything is loaded, so a group IS the company's contacts — saying
    // otherwise would be the opposite lie.
    expect(screen.queryByText(/Load more to fill a company in/)).toBeNull()
  })

  it("keeps the two groups that are not a company, last and in that order", () => {
    draw([
      contact("p1", "Marta Bergman", "c-bergman"),
      // Her company is real and simply not among the accounts we hold.
      contact("p2", "Ines Ortiz", "c-off-page"),
      // Nobody has said where he works.
      contact("p3", "Tomas Roig", null),
    ])
    expect(headings()).toEqual(["Bergman S.A.", "Other companies", "No company yet"])
  })

  it("does not repeat the company on the rows underneath its own heading", () => {
    // K1: the summary line carries three facts, and "under Bergman S.A." beneath
    // a heading reading Bergman S.A. spends one of them on the reader's own eyes.
    draw([contact("p1", "Marta Bergman", "c-bergman")])
    expect(screen.queryByText(/under Bergman S\.A\./)).toBeNull()
  })

  it("falls back to the collection's own empty state when there is nothing to group", () => {
    draw([])
    expect(headings()).toEqual([])
    expect(screen.getByText("No accounts yet.")).toBeTruthy()
  })
})

// The host passes the accounts recipe straight through, so a contact row here is
// the row the other two tabs draw. If that recipe ever stops being a list, this
// component is drawing something else entirely and nothing above would notice.
describe("the grouped view renders the accounts collection, not one of its own", () => {
  it("is handed the accounts list recipe", () => {
    expect(RECIPE.type).toBe("list")
    expect(RECIPE.binding.module).toBe("accounts")
  })
})

// Nothing here needs a network; the component reads only what it is handed plus
// the cursor sidecar it shares with <LoadMore>.
vi.mock("@/lib/api", () => ({ tenancy: {}, content: {} }))
