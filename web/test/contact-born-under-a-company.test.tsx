// A PERSON IS BORN ON A COMPANY'S CONTACTS TAB, and this drives the real screen
// to prove it — the two writes it makes, the words it fills in, and what it says
// when the second one fails.
//
// It is a companion to accounts-are-companies.test.tsx, which holds the OTHER
// half of the same ruling (18 Aug 2026: every account somebody creates is a
// company). The two halves are one decision and the second one is load-bearing:
// taking the Type selector off the account form removed the only way to create a
// person in the whole app, so if this tab ever stops making one, the Add contact
// search beside it becomes a picker over a set nobody can add to.
//
// SEPARATE FILE because it needs a whole screen's worth of mocked seams, and a
// blanket `useCached` in the file next door would make those dialog tests lie
// about which read they were answering.
//
// It drives the screen rather than reading its source for two reasons. "Fills in
// individual" is a value that has to REACH the door, and "creates the person,
// then links her, then keeps its head when the link fails" is a sequence — source
// can show both lines are present and nothing about the order or the recovery.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Account, AccountDetail } from "@shared/types"
import { SAVINGS_CAPTION } from "@shared/workers/savings"

const BERGMAN: Account = {
  id: "acct-bergman",
  accountType: "entity",
  parentAccountId: null,
  name: "Bergman S.A.",
  email: null,
  phone: null,
  street: null,
  postalCode: null,
  city: null,
  country: null,
  industry: null,
  about: null,
  logoUrl: null,
  coverUrl: null,
  code: "BERG",
  currency: null,
  locale: null,
  timezone: null,
  commercialsVisible: null,
  active: true,
  createdAt: "2026-08-18T09:00:00.000Z",
  createdByName: null,
  updatedAt: null,
  editedByName: null,
}

const DETAIL: AccountDetail = {
  account: BERGMAN,
  parent: null,
  links: [],
  companies: [],
  portalUsers: [],
  linksTotal: 0,
  companiesTotal: 0,
  portalUsersTotal: 0,
}

// The screen's writes. Re-made for every case so one case's calls can't be read
// as another's.
const api = vi.hoisted(() => ({
  createAccount: vi.fn(),
  linkPerson: vi.fn(),
}))

// EVERY READ THIS SCREEN MAKES, answered by key. Keyed rather than blanket
// because the record detail, the accounts list, the rates and the savings are
// four different shapes and one answer for all of them is a fixture lying.
vi.mock("@shared/web/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/web/store")>()
  return {
    ...actual,
    useCached: (key: string | null) => ({
      data: key?.startsWith("account:")
        ? DETAIL
        : key?.startsWith("value:")
          ? { savedSecondsPerMonth: 0, apps: [], caption: SAVINGS_CAPTION }
          : [],
      error: undefined,
    }),
    useCachedValue: () => 0,
    invalidate: () => {},
    primeCache: () => {},
  }
})

// Every right on, so the buttons are drawn. What a role WITHOUT them sees is the
// panel's own question, not this one's.
vi.mock("@/lib/perms", () => ({ usePermissions: () => ({ can: () => true }) }))

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    tenancy: {
      ...actual.tenancy,
      createAccount: api.createAccount,
      linkPerson: api.linkPerson,
      accountDetail: async () => DETAIL,
      selectable: async () => ({ values: [] }),
    },
  }
})

// The toasts are the screen's honesty about a half-done write, so they are read
// rather than silenced.
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("@shared/ui/components/sonner/sonner", () => ({
  toast: toasts,
  Toaster: () => null,
}))

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

import { AccountDetailScreen } from "@/components/account-detail"

afterEach(cleanup)
beforeEach(() => {
  api.createAccount.mockReset().mockResolvedValue({ id: "acct-marta" })
  api.linkPerson.mockReset().mockResolvedValue({ id: "link-1" })
  toasts.success.mockReset()
  toasts.error.mockReset()
})

/** Open the Contacts tab, then the New contact form, and fill in a person. */
async function newContact(name = "Marta Bergman") {
  render(<AccountDetailScreen teamId="team-1" accountId="acct-bergman" basePath="/accounts" />)
  fireEvent.mouseDown(await screen.findByRole("tab", { name: /contacts/i }))
  fireEvent.click(await screen.findByRole("button", { name: "New contact" }))
  fireEvent.change(await screen.findByLabelText(/name/i), { target: { value: name } })
  fireEvent.change(screen.getByLabelText(/relationship/i), { target: { value: "Operations" } })
  fireEvent.submit(document.querySelector("form") as HTMLFormElement)
}

describe("creating a contact under a company", () => {
  it("offers both ways in — a new person, and one we already hold", async () => {
    render(<AccountDetailScreen teamId="team-1" accountId="acct-bergman" basePath="/accounts" />)
    fireEvent.mouseDown(await screen.findByRole("tab", { name: /contacts/i }))
    // Two buttons, because they are two different acts. Losing the second is how
    // somebody ends up typing a second Marta when the first one is right there.
    expect(await screen.findByRole("button", { name: "New contact" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Add contact" })).toBeTruthy()
  })

  it("makes a person, not a company — and the code is what says so", async () => {
    await newContact()
    await waitFor(() => expect(api.createAccount).toHaveBeenCalled())
    const sent = api.createAccount.mock.calls[0][0]
    expect(sent.accountType).toBe("individual")
    expect(sent.name).toBe("Marta Bergman")
    // THE PARENT POINTER: she sits under Bergman. This is the tree the record
    // header draws, and it is NOT the same fact as the link below.
    expect(sent.parentAccountId).toBe("acct-bergman")
  })

  it("also LINKS her, because a parent pointer is not a contact", async () => {
    await newContact()
    await waitFor(() => expect(api.linkPerson).toHaveBeenCalled())
    // The person the first call made, on the company we are standing on. Without
    // this second write the tab she was created on would not list her — and one
    // person can be a contact at several companies, which is the whole reason
    // this row exists and a single pointer cannot stand in for it.
    expect(api.linkPerson.mock.calls[0][0]).toMatchObject({
      accountId: "acct-bergman",
      personAccountId: "acct-marta",
      relationship: "Operations",
      isMainStakeholder: false,
    })
    expect(toasts.success).toHaveBeenCalledWith("Contact added.")
    expect(toasts.error).not.toHaveBeenCalled()
  })

  it("says so plainly when the person is made but the link fails", async () => {
    // THE PARTIAL FAILURE. She exists and is not a contact. Nothing is rolled
    // back — undoing it means archiving an account, a right this caller may not
    // hold and itself a write that can fail — so the screen's whole job here is
    // to be honest about where she ended up. A person created into silence is
    // the bad outcome this case exists to refuse.
    const { ApiFailure } = await import("@/lib/api")
    api.linkPerson.mockRejectedValue(new ApiFailure(403, "forbidden", "You can't do that."))
    await newContact()
    await waitFor(() => expect(toasts.error).toHaveBeenCalled())
    const said = String(toasts.error.mock.calls[0][0])
    // Her name, what DID happen, why it stopped, and where to finish it — and
    // the name is FILLED, so the sentence is a catalogue key rather than a
    // template literal that could never be translated (R28).
    expect(said).toContain("Marta Bergman")
    expect(said).not.toContain("{name}")
    expect(said).toContain("is now in your accounts")
    expect(said).toContain("You can't do that.")
    expect(said).toContain("Add contact")
    // Never announced as done.
    expect(toasts.success).not.toHaveBeenCalled()
  })
})
