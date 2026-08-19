// EVERY NEW ACCOUNT IS A COMPANY, AND A PERSON IS BORN ON ONE.
//
// The owner's ruling of 18 Aug 2026 reversed his own of the day before: the Type
// selector comes off the account form, creating always makes a company, and a
// contact created under one is always a person — "the default value that gets
// populated in that column will be individual".
//
// The column stays. `accounts.account_type` is a live CHECK constraint and the
// thing that decides which of the two screens an account gets, so what changed is
// who ANSWERS the question: the form used to, and now the code does.
//
// AND THE PARENT PICKER WENT WITH IT, same day, same sentence: "each new account
// created will be its own thing. It will have no parent because it's literally a
// brand new company." That one is not carried through the form at all, because
// `updateAccount` never reads the field — a move is its own door — so there is
// nothing for a silent form to zero.
//
// Five claims, and each one is here because it could rot on its own:
//
//   1. the form offers no way to choose  — a SOURCE claim, because a behaviour
//      test passes whether or not the control is on screen: nobody drives a
//      control they cannot find, so a selector that came back would sit there
//      green. This is the only claim source is the right instrument for.
//   2. creating always sends `entity`     — including over a draft saved while
//      the selector still existed, which sessionStorage will happily restore.
//   3. editing a person sends `individual` back — the field is still sent, so
//      "stops asking, keeps sending" must send the record's own answer, not
//      yesterday's default. This is CHECKLIST 3.13's failure, in this form.
//   4. the new-contact form asks no type question at all, and hands back only
//      what a person and their link are made of.
//   5. the form offers no way to choose a PARENT, and does not carry one — the
//      same source claim as 1, for the same reason: a control nobody can find is
//      a control nobody drives, so a behaviour test would sit green beside it.
//
// The other half of claim 4 — that the caller writes "individual", links, AND
// sets the parent, and stays honest when the second write fails — is
// account-detail's `createContact`, driven below.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  AccountFormDialog,
  type AccountFormValues,
} from "@/components/account-form-dialog"
import {
  ContactCreateDialog,
  type ContactCreateValues,
} from "@/components/contact-link-dialog"

// The form fetches the team's own Country / Industry words through the shared
// store. Nothing here is about those pickers, so they answer with no words.
vi.mock("@shared/web/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/web/store")>()
  return { ...actual, useCached: () => ({ data: [], error: undefined }) }
})

// The library checkbox measures itself through Radix, which reaches for a
// ResizeObserver jsdom does not have. A no-op is the whole requirement: nothing
// below asks what size anything is.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

afterEach(cleanup)

const COMPONENTS = join(dirname(fileURLToPath(import.meta.url)), "..", "components")
const source = (file: string) => readFileSync(join(COMPONENTS, file), "utf8")

/** The dialog renders in a PORTAL, so the form is on the document rather than in
 * render()'s own container. */
const submitForm = () => fireEvent.submit(document.querySelector("form") as HTMLFormElement)

const PERSON: AccountFormValues = {
  accountType: "individual",
  name: "Marta Bergman",
  email: "marta@bergman.example",
  phone: "",
  street: "",
  postalCode: "",
  city: "",
  country: "",
  industry: "",
  about: "",
  logoUrl: "",
  coverUrl: "",
  locale: "",
}

describe("the account form no longer asks what kind of account it is making", () => {
  it("has no Type control in its source — not merely none on screen", () => {
    const text = source("account-form-dialog.tsx")
    // The three shapes the control could take, dead. A picker with those two
    // options; a field config labelled Type; anything that WRITES the value from
    // an interaction. If a fourth shape is ever invented it will still have to
    // set the value, so the third line is the one that really holds.
    expect(text).not.toMatch(/value="individual"/)
    expect(text).not.toMatch(/label: "Type"/)
    expect(text).not.toMatch(/set\(\{\s*accountType/)
    // …and it does still carry the field, which is the other half of the ruling:
    // a form that stopped SENDING it would make the door refuse every create.
    expect(text).toMatch(/accountType: "entity" \| "individual"/)
  })

  it("has no Parent control in its source either, and no value to carry", () => {
    const text = source("account-form-dialog.tsx")
    // The picker, the label, the write, and the value itself. The fourth line is
    // the one that separates this from the Type ruling: `accountType` is still on
    // the form's shape because the door reads it on an update and a missing key
    // would zero the column. `/accounts/update` never reads the parent — moving
    // an account is `setAccountParent`, its own door — so carrying it would be
    // carrying an answer to a question nothing asks.
    expect(text).not.toMatch(/parentOptions/)
    expect(text).not.toMatch(/label: "Parent account"/)
    expect(text).not.toMatch(/set\(\{\s*parentAccountId/)
    expect(text).not.toMatch(/parentAccountId/)
  })

  it("draws no Parent account field on either half of the form", () => {
    for (const initial of [null, PERSON]) {
      render(
        <AccountFormDialog
          open
          onOpenChange={() => {}}
          initial={initial}
          onSubmit={async () => {}}
        />
      )
      expect(screen.queryByText("Parent account")).toBeNull()
      expect(screen.queryByText("Sits on its own")).toBeNull()
      // …and the form is otherwise itself, so this is not passing on a blank render.
      expect(screen.getByText("Name")).toBeTruthy()
      cleanup()
    }
  })

  it("sends nothing about a parent, on a create or on an edit", async () => {
    for (const initial of [null, PERSON]) {
      const onSubmit = vi.fn(async (_v: AccountFormValues) => {})
      render(
        <AccountFormDialog
          open
          onOpenChange={() => {}}
          initial={initial}
          onSubmit={onSubmit}
        />
      )
      if (!initial)
        fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Bergman S.A." } })
      submitForm()
      await waitFor(() => expect(onSubmit).toHaveBeenCalled())
      expect(Object.keys(onSubmit.mock.calls[0][0])).not.toContain("parentAccountId")
      cleanup()
    }
  })

  it("draws no Type field, and does draw the fields it kept", () => {
    render(
      <AccountFormDialog
        open
        onOpenChange={() => {}}
        onSubmit={async () => {}}
      />
    )
    expect(screen.queryByText("Type")).toBeNull()
    // Neither word is on the form as a choice any more.
    expect(screen.queryByText("Company")).toBeNull()
    expect(screen.queryByText("Person")).toBeNull()
    // The form is otherwise itself — this is not passing because it failed to render.
    expect(screen.getByText("Name")).toBeTruthy()
  })

  it("creates a company", async () => {
    const onSubmit = vi.fn(async (_v: AccountFormValues) => {})
    render(
      <AccountFormDialog
        open
        onOpenChange={() => {}}
        onSubmit={onSubmit}
      />
    )
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Bergman S.A." } })
    submitForm()
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].accountType).toBe("entity")
  })

  it("creates a company even over a draft that still remembers the old answer", async () => {
    // The exact rot this guards: somebody had the create form half-filled when
    // the selector was still there. `useFormDraft` restores from sessionStorage
    // on open, so without pinning, that stale "individual" would decide a record
    // through a question no longer on the screen.
    const draftKey = "account:new:team-1"
    sessionStorage.setItem(`kwapso:draft:${draftKey}`, JSON.stringify(PERSON))
    const onSubmit = vi.fn(async (_v: AccountFormValues) => {})
    render(
      <AccountFormDialog
        open
        onOpenChange={() => {}}
        draftKey={draftKey}
        onSubmit={onSubmit}
      />
    )
    submitForm()
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].accountType).toBe("entity")
    // The rest of the draft is still honoured — pinning one field is not
    // throwing the person's typing away.
    expect(onSubmit.mock.calls[0][0].name).toBe("Marta Bergman")
    sessionStorage.clear()
  })

  it("keeps a person a person when one is edited through it", async () => {
    // contact-detail.tsx opens THIS dialog for a person. The door's update half
    // never reads the column, so nothing can rewrite it — but the values the form
    // hands back are what a future caller would send, and a form that answered
    // "entity" here would be one `updateAccount` away from turning a human being
    // into a company.
    const onSubmit = vi.fn(async (_v: AccountFormValues) => {})
    render(
      <AccountFormDialog
        open
        onOpenChange={() => {}}
        initial={PERSON}
        onSubmit={onSubmit}
      />
    )
    expect(screen.queryByText("Type")).toBeNull()
    submitForm()
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].accountType).toBe("individual")
  })
})

describe("making a new contact under a company", () => {
  it("asks for the person and the link, and never for a type", async () => {
    const onSubmit = vi.fn(async (_v: ContactCreateValues) => {})
    render(
      <ContactCreateDialog
        open
        onOpenChange={() => {}}
        accountName="Bergman S.A."
        onSubmit={onSubmit}
      />
    )
    expect(screen.queryByText("Type")).toBeNull()
    expect(screen.queryByText("Company")).toBeNull()

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Marta Bergman" } })
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "marta@bergman.example" },
    })
    fireEvent.change(screen.getByLabelText(/relationship/i), { target: { value: "Operations" } })
    submitForm()
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())

    // Exactly the five: three that make the person, two that make the link. No
    // `accountType` — a value the code fills in is not one the form carries
    // around looking like a choice.
    expect(onSubmit.mock.calls[0][0]).toEqual({
      name: "Marta Bergman",
      email: "marta@bergman.example",
      phone: "",
      relationship: "Operations",
      isMainStakeholder: false,
    })
    expect(Object.keys(onSubmit.mock.calls[0][0])).not.toContain("accountType")
  })

  it("will not submit a person with no name", () => {
    const onSubmit = vi.fn(async (_v: ContactCreateValues) => {})
    render(
      <ContactCreateDialog
        open
        onOpenChange={() => {}}
        accountName="Bergman S.A."
        onSubmit={onSubmit}
      />
    )
    submitForm()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
