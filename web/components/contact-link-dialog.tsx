"use client"

// Link a person to an account — "Marta is a contact of Bergman". The person is
// always an account row we already hold (SCOPE ch.03: one table for everyone), so
// this picks one rather than typing a new name; add the person first if they're
// new. The same person can be a contact of more than one account, which is exactly
// what a parent pointer cannot say and this row can.
//
// The search runs on the SERVER (the accounts door's own `q`), so a team with
// thousands of people still finds the right one — a client-side filter over the
// first page would quietly hide the rest. Shared FormShell (R4) + draft (R7).
//
// It used to say that with two controls, a search box above a Select, because
// there was no one control that could do both. There is now: `RecordPicker` in
// its server mode IS this pairing, and this dialog was the sketch the app's nine
// other pickers were eventually built from.

import * as React from "react"

import { Checkbox } from "@kwapso/ui/registry/primitives/checkbox/checkbox"
import {
  DialogDescription,
  DialogTitle,
} from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"
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
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't add that contact.")
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
          {t("Pick the person who's a contact of")} {accountName}. If they&apos;re new, add them
          as a person first.
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
          searchKey={pickerKey("people", teamId)}
          placeholder={t("Choose a person")}
          searchPlaceholder={t("Search people…")}
          emptyText={t("No people found.")}
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
