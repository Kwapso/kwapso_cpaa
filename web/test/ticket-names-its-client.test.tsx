// THE FIELD THAT WAS ONLY EVER ON THE MACHINE SURFACE.
//
// `createTicket` has accepted a staff-named client since the customer spine
// landed, and workers/content/test/help-fence.test.ts proves the door means it:
// "a ticket the AGENCY raises for a client reaches that client's people". The MCP
// tool exposed it too, with its own note that without `accountId` "a machine can
// only raise tickets that no client will ever see".
//
// The screen never asked. So every ticket a person typed in the agency app
// belonged to nobody and appeared in no client's portal — with a green build the
// whole time, because no check has ever asked whether a form offers what its door
// accepts. This is that question, for this door.
//
// It drives the real dialog rather than scanning its source: a picker that renders
// and a value that reaches `onSubmit` are two different claims, and the second is
// the one the bug was about.
//
// WHERE "THE LIVE COMPANIES ONLY" IS NOW PROVED, and why it moved. This used to
// assert that a retired account and a person were absent from the rendered option
// rows — which was true of the options the browser had, and the browser had page
// one. Accounts PAGE (R14), so that assertion was about the newest fifty and
// silent about the rest, which is exactly the bug the owner then reported from a
// phone. The narrowing now rides the request, so the claim is asserted on the
// REQUEST: the door is asked for entities that are not archived, and the door
// answers for the whole collection.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

/** What the accounts door was asked, captured. Hoisted so `vi.mock`'s factory —
 * which runs before the module body — can close over it. */
const door = vi.hoisted(() => ({
  accounts: vi.fn(async (_opts: Record<string, unknown> = {}) => ({
    accounts: [
      { id: "acct-bergman", name: "Bergman", code: "BERG", email: null, active: true, accountType: "entity" },
    ],
    total: 1,
    entityTotal: 1,
    individualTotal: 0,
    nextCursor: null,
    hasMore: false,
  })),
}))

vi.mock("@/lib/live-resources", () => ({
  // WHICH SYSTEM the request is about (CHECKLIST 5.8) still reads a bounded list
  // through the store, so the key and its fetcher both have to exist here or the
  // dialog throws before any of these cases can look at it.
  appsKey: (t: string) => `apps:${t}`,
  listFetch: { apps: async () => [] },
}))

// The client picker asks the accounts door; the contact picker asks the accounts
// DETAIL door for the chosen company's own people. The detail also carries the
// company's NAME, which is what a ticket that already has a client shows.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    tenancy: {
      ...actual.tenancy,
      accounts: door.accounts,
      accountDetail: async () => ({ account: { id: "acct-bergman", name: "Bergman" }, links: [] }),
    },
  }
})

vi.mock("@/lib/perms", () => ({ usePermissions: () => ({ can: () => false }) }))

import { HelpFormDialog } from "@/components/help-form-dialog"
import { searchAccounts } from "@/lib/picker-sources"

afterEach(cleanup)

const type = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

/** The dialog renders in a PORTAL, so the form is on the document rather than in
 * render()'s own container. */
const submitForm = () => fireEvent.submit(document.querySelector("form") as HTMLFormElement)

describe("raising a ticket in the agency app", () => {
  it("asks which client it is for", () => {
    render(
      <HelpFormDialog
        open
        onOpenChange={() => {}}
        onSubmit={async () => {}}
        helpTypeOptions={[]}
        teamId="team-1"
      />
    )
    // The question is on the form at all — this is the half that was missing.
    expect(screen.getByText("Client")).toBeTruthy()
    // …and it is a real control a person can open, pointed at by that label.
    const control = screen.getByLabelText("Client")
    expect(control.getAttribute("role")).toBe("combobox")
  })

  it("asks the door for the live companies, not for a page of them", async () => {
    door.accounts.mockClear()
    await searchAccounts("berg", { type: "entity" })
    // A retired account can't be sold to and a contact is not a client, so
    // neither is a thing to file a ticket under — and both are refused by the
    // DOOR, over the whole collection, rather than by a filter over page one.
    expect(door.accounts).toHaveBeenCalledWith({ q: "berg", type: "entity", archived: "no" })
  })

  it("sends no client when the ticket is our own", async () => {
    const onSubmit = vi.fn(async (_input: { accountId?: string }) => {})
    render(
      <HelpFormDialog
        open
        onOpenChange={() => {}}
        onSubmit={onSubmit}
        helpTypeOptions={[]}
        teamId="team-1"
      />
    )
    type(/what do you need help with/i, "Internal: rotate the D1 token")
    submitForm()
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    // undefined, not the empty-picker sentinel — the door reads this straight.
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ accountId: undefined })
  })

  it("keeps the client a ticket already has, and does not offer to move it", async () => {
    // Set once: `updateTicket` refuses a DIFFERENT client with `account_fixed`,
    // so the form states the one it has instead of offering a refusal. It must
    // still SEND it — the door accepts the same id and leaves the row alone.
    const onSubmit = vi.fn(async (_input: { accountId?: string }) => {})
    render(
      <HelpFormDialog
        open
        onOpenChange={() => {}}
        onSubmit={onSubmit}
        helpTypeOptions={[]}
        teamId="team-1"
        initial={{ description: "Tuesday export is empty", accountId: "acct-bergman" }}
      />
    )
    expect(screen.getByText(/can't be moved to another client/i)).toBeTruthy()
    // The company is NAMED, from its own record — a client past page one used to
    // be shown to its own ticket as "this client".
    await waitFor(() => expect(screen.getByText(/^Bergman,/)).toBeTruthy())
    submitForm()
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ accountId: "acct-bergman" })
  })
})
