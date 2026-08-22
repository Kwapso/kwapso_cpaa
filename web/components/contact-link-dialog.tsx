"use client"

// THE TWO WAYS A PERSON GETS ONTO A COMPANY'S CONTACTS TAB, side by side because
// they are easy to confuse and one of them used to be the only one.
//
//   ContactLinkDialog   — someone we ALREADY hold is a contact of this company too
//   ContactCreateDialog — a brand new person, created and linked in one go
//
// Both end at the same fact: a link row saying "Marta is a contact of Bergman".
// A person is an account row (SCOPE ch.03: one table for everyone), and the same
// person can be a contact of more than one company — which is exactly what a
// parent pointer cannot say and this link row can. That is why LINKING an
// existing person had to survive: forcing a second Marta because the search did
// not find the first is how an address book rots.
// The link dialog's search runs on the SERVER (the accounts door's own `q`), so a
// team with thousands of people still finds the right one — a client-side filter
// over the first page would quietly hide the rest.
// NEITHER FORM ASKS WHAT KIND OF ACCOUNT IT IS MAKING. A contact is a person, so
// the create half fills `accountType` in as code (account-detail's
// `createContact`), the same ruling of 18 Aug 2026 that took the Type selector
// off the account form. Both are Shared FormShell (R4) + draft (R7).
// The search runs on the SERVER (the accounts door's own `q`), so a team with
// thousands of people still finds the right one — a client-side filter over the
// first page would quietly hide the rest. Shared FormShell (R4) + draft (R7).
// It used to say that with two controls, a search box above a Select, because
// there was no one control that could do both. There is now: `RecordPicker` in
// its server mode IS this pairing, and this dialog was the sketch the app's nine
// other pickers were eventually built from.

import * as React from "react"

import { Checkbox } from "@shared/ui/registry/primitives/checkbox/checkbox"
import {
  DialogDescription,
  DialogTitle,
} from "@shared/ui/registry/primitives/dialog/dialog"
import { Field } from "@shared/web/field"
import { Input } from "@shared/ui/registry/primitives/input/input"
import { toast } from "@shared/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@shared/ui/lib/config"
import { Plus } from "lucide-react"

import { ApiFailure } from "@/lib/api"
import { pickerKey, searchAccounts } from "@/lib/picker-sources"
import { RecordPicker } from "@/components/record-picker"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

const personField = { ...defaultFieldConfig, label: "Person", required: true }
const relationshipField = { ...defaultFieldConfig, label: "Relationship", required: false }

export type ContactLinkValues = {
  personAccountId: string
  relationship: string
  isMainStakeholder: boolean
}

const EMPTY: ContactLinkValues = { personAccountId: "", relationship: "", isMainStakeholder: false }

export function ContactLinkDialog({
  open,
  onOpenChange,
  teamId,
  accountName,
  excludeIds,
  onSubmit,
  draftKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** the team whose people we're searching — every cache key is team-scoped, so a
   * team switch can never show the last team's results. */
  teamId: string
  /** the account they'll be a contact of — named in the copy so it's unmistakable. */
  accountName: string
  /** people already on this account (and the account itself), left out of the list. */
  excludeIds: string[]
  onSubmit: (values: ContactLinkValues) => Promise<void>
  draftKey?: string
}) {
  const t = useT()
  const [values, setValues, clearDraft] = useFormDraft(draftKey, EMPTY, open)
  const [busy, setBusy] = React.useState(false)

  // Server-side search over PEOPLE only, with the ones already on this account
  // taken out of the answer — a list offering somebody who is already a contact
  // is a list with a row that can only fail.
  const exclude = new Set(excludeIds)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!values.personAccountId) return
    setBusy(true)
    try {
      await onSubmit(values)
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't add that contact."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormShellDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      clearDraft={clearDraft}
      onSubmit={submit}
      title={<DialogTitle>{t("Add a contact")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {t("Pick the person who's a contact of")} {accountName}.{" "}
          {t("Someone brand new goes in under New contact instead.")}
        </DialogDescription>
      }
      submit={{
        busy: busy,
        disabled: !values.personAccountId,
        icon: <Plus className="size-4" />,
      }}
    >
      <Field config={personField} htmlFor="contact-person" className={fieldSpacing}>
        <RecordPicker
          id="contact-person"
          value={values.personAccountId}
          onChange={(personAccountId) => setValues((v) => ({ ...v, personAccountId }))}
          search={(term) =>
            searchAccounts(term, { type: "individual" }).then((rows) =>
              rows.filter((r) => !exclude.has(r.value))
            )
          }
          searchKey={pickerKey("contacts", teamId)}
          placeholder={t("Choose a person")}
          searchPlaceholder={t("Search contacts…")}
          emptyText={t("No contacts found.")}
          disabled={busy}
        />
      </Field>

      <Field config={relationshipField} htmlFor="contact-relationship" className={fieldSpacing}>
        <Input
          id="contact-relationship"
          value={values.relationship}
          onChange={(e) => setValues((v) => ({ ...v, relationship: e.target.value }))}
          placeholder={t("Operations")}
          disabled={busy}
        />
      </Field>

      <div className="flex items-center gap-2">
        <Checkbox
          id="contact-main"
          checked={values.isMainStakeholder}
          onCheckedChange={(c) => setValues((v) => ({ ...v, isMainStakeholder: c === true }))}
          disabled={busy}
        />
        <label htmlFor="contact-main" className="text-sm">
          {t("Main contact, the person you deal with first")}
        </label>
      </div>
    </FormShellDialog>
  )
}

/** What the create form collects. The first three make the PERSON, the last two
 * make the LINK — two rows, one form, because "add Marta at Bergman" is one
 * errand to the person doing it. */
export type ContactCreateValues = {
  name: string
  email: string
  phone: string
  relationship: string
  isMainStakeholder: boolean
}

const CREATE_EMPTY: ContactCreateValues = {
  name: "",
  email: "",
  phone: "",
  relationship: "",
  isMainStakeholder: false,
}

const nameField = { ...defaultFieldConfig, label: "Name", required: true }
const emailField = { ...defaultFieldConfig, label: "Email", required: false }
const phoneField = { ...defaultFieldConfig, label: "Phone", required: false }

/**
 * Create a person and make them a contact of this company, in one form.
 *
 * DELIBERATELY THE SHORT VERSION OF THE ACCOUNT FORM. A name, and the two ways
 * to reach them — everything else a person's record carries (their address, the
 * paragraph about them, their language, their photo) is edited on their own
 * screen, which they now have. Asking for all of it here would put a fifteen
 * field form in front of somebody typing a name off a business card.
 *
 * NO TYPE QUESTION, and no `accountType` in these values at all: this form makes
 * a person, always, and the caller writes that word (account-detail's
 * `createContact`). A value the code fills in is not a value a form should carry
 * around looking like a choice.
 */
export function ContactCreateDialog({
  open,
  onOpenChange,
  accountName,
  onSubmit,
  draftKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** the company they'll be a contact of — named in the copy so it's unmistakable. */
  accountName: string
  onSubmit: (values: ContactCreateValues) => Promise<void>
  draftKey?: string
}) {
  const t = useT()
  const [values, setValues, clearDraft] = useFormDraft(draftKey, CREATE_EMPTY, open)
  const [busy, setBusy] = React.useState(false)
  const set = (patch: Partial<ContactCreateValues>) => setValues((v) => ({ ...v, ...patch }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!values.name.trim()) return
    setBusy(true)
    try {
      await onSubmit(values)
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      // The server's own sentence wins — it is the one that knows why (a right
      // this role does not hold, a reference that clashed).
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't add that contact."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormShellDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      clearDraft={clearDraft}
      onSubmit={submit}
      title={<DialogTitle>{t("New contact")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {/* ONE entry with a hole in it, not a fragment plus a name. The sentence
              used to end on "of" and have the company appended after it, which
              some languages cannot do — Hindi, Japanese,
              Korean, Chinese and five others put the possessed noun before the
              possessor, so there is nothing for a translator to end on. A
              placeholder can be moved; a dangling preposition cannot. */}
          {t("Add someone new to your accounts and make them a contact of {name}.", {
            name: accountName,
          })}
        </DialogDescription>
      }
      submit={{
        busy: busy,
        disabled: !values.name.trim(),
        icon: <Plus className="size-4" />,
      }}
    >
      <Field config={nameField} htmlFor="new-contact-name" className={fieldSpacing}>
        <Input
          id="new-contact-name"
          value={values.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={t("Marta Bergman")}
          disabled={busy}
          autoFocus
        />
      </Field>

      <Field config={emailField} htmlFor="new-contact-email" className={fieldSpacing}>
        <Input
          id="new-contact-email"
          type="email"
          value={values.email}
          onChange={(e) => set({ email: e.target.value })}
          placeholder="marta@bergman.example"
          disabled={busy}
        />
      </Field>

      <Field config={phoneField} htmlFor="new-contact-phone" className={fieldSpacing}>
        <Input
          id="new-contact-phone"
          value={values.phone}
          onChange={(e) => set({ phone: e.target.value })}
          placeholder="+34 600 000 000"
          disabled={busy}
        />
      </Field>

      <Field config={relationshipField} htmlFor="new-contact-relationship" className={fieldSpacing}>
        <Input
          id="new-contact-relationship"
          value={values.relationship}
          onChange={(e) => set({ relationship: e.target.value })}
          placeholder={t("Operations")}
          disabled={busy}
        />
      </Field>

      <div className="flex items-center gap-2">
        <Checkbox
          id="new-contact-main"
          checked={values.isMainStakeholder}
          onCheckedChange={(c) => set({ isMainStakeholder: c === true })}
          disabled={busy}
        />
        <label htmlFor="new-contact-main" className="text-sm">
          {t("Main contact, the person you deal with first")}
        </label>
      </div>
    </FormShellDialog>
  )
}
