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

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const accounts = [
  { id: "acct-bergman", name: "Bergman", active: true, accountType: "entity" },
  { id: "acct-retired", name: "Long gone", active: false, accountType: "entity" },
  { id: "acct-person", name: "A person", active: true, accountType: "individual" },
]

// The picker fetches its own list through the shared store — the point of the
// fix, since the screen-level accounts query is only loaded on the accounts
// section. Warm it here rather than stubbing the component's internals.
vi.mock("@shared/web/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/web/store")>()
  // KEYED, not blanket. The form now holds three cached reads (accounts, apps,
  // and the chosen company's contacts) and answering all of them with the same
  // rows would put "Bergman" in two pickers, which is a fixture lying rather than
  // a screen failing.
  return {
    ...actual,
    useCached: (key: string | null) => ({
      data: key?.startsWith("accounts:") ? accounts : [],
      error: undefined,
    }),
  }
})

vi.mock("@/lib/live-resources", () => ({
  accountsKey: (t: string) => `accounts:${t}`,
  // The form gained two more pickers on 17 Aug 2026 — WHICH SYSTEM the request is
  // about (CHECKLIST 5.8) and WHO ASKED (5.9). Both read through the same store
  // seam the client picker does, so the mock has to answer for all three or the
  // dialog throws before any of these cases can look at it.
  appsKey: (t: string) => `apps:${t}`,
  listFetch: { accounts: async () => accounts, apps: async () => [] },
}))

// The contact picker asks the accounts DETAIL door for the chosen company's own
// people. Empty here: these cases are about the client field, and a contact list
// that answered would be a second thing to keep in step with them.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return { ...actual, tenancy: { ...actual.tenancy, accountDetail: async () => ({ links: [] }) } }
})

vi.mock("@/lib/perms", () => ({ usePermissions: () => ({ can: () => false }) }))

import { HelpFormDialog } from "@/components/help-form-dialog"

afterEach(cleanup)

/** Write the ticket's own words. The description is a RICH-TEXT field now, so it
 * is not a `<textarea>` with a value to set: it is the library `Notes` editor,
 * a contentEditable that emits its HTML on `input`. Drive the real control —
 * the point of this suite is that the dialog a person actually uses reaches
 * `onSubmit` with what they typed. */
const write = (html: string) => {
  const box = document.querySelector('[contenteditable="true"]') as HTMLElement
  box.innerHTML = html
  fireEvent.input(box)
}

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
    // …and it offers the live COMPANIES only. A retired account can't be sold to
    // and a contact is not a client, so neither is a thing to file a ticket under.
    expect(screen.getByText("Bergman")).toBeTruthy()
    expect(screen.queryByText("Long gone")).toBeNull()
    expect(screen.queryByText("A person")).toBeNull()
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
    write("<p>Internal: rotate the D1 token</p>")
    submitForm()
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    // undefined, not the empty-select sentinel — the door reads this straight.
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ accountId: undefined })
    // …and the words survive the round trip through the editor.
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      description: "<p>Internal: rotate the D1 token</p>",
    })
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
    submitForm()
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ accountId: "acct-bergman" })
  })
})
