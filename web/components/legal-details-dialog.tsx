"use client"

// THE AGENCY'S OWN DETAILS — the four facts that go on a contract.
//
// A separate dialog from the team-edit one, and the difference is the audience
// rather than the fields: team-edit is what the app calls itself in the rail,
// this is what the company is called on an invoice. Merging them would put a
// logo upload in front of somebody who came to copy a VAT number.
//
// It PATCHES: the door reads a field only when it is present in the body, so
// saving here cannot erase the logo, and saving the team-edit dialog cannot
// erase an address it never showed. The name is sent on both because the door
// requires it, and it is the same name either way.
//
// FormShell (R4) + a per-session draft (R7), like every other write.

import * as React from "react"

import { DialogDescription, DialogTitle } from "@shared/ui/registry/primitives/dialog/dialog"
import { Field } from "@shared/web/field"
import { Input } from "@shared/ui/registry/primitives/input/input"
import { Textarea } from "@shared/ui/registry/primitives/textarea/textarea"
import { toast } from "@shared/ui/registry/primitives/sonner/sonner"
import { Pencil } from "lucide-react"
import { defaultFieldConfig } from "@shared/ui/lib/config"

import { ApiFailure, tenancy } from "@/lib/api"
import type { TeamSummary } from "@shared/types"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

const legalNameField = {
  ...defaultFieldConfig,
  label: "Legal name",
  required: false,
  hint: "What goes on a contract, if it is not the short name.",
}
const addressField = { ...defaultFieldConfig, label: "Legal address", required: false }
const numbersField = {
  ...defaultFieldConfig,
  label: "Legal numbers",
  required: false,
  hint: "Company number, VAT number, whatever your country asks for.",
}
const phoneField = { ...defaultFieldConfig, label: "Phone", required: false }

export function LegalDetailsDialog({
  open,
  onOpenChange,
  team,
  draftKey,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  team: TeamSummary
  draftKey?: string
  onSaved: () => Promise<void>
}) {
  const t = useT()
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    {
      legalName: team.legalName ?? "",
      legalAddress: team.legalAddress ?? "",
      legalNumbers: team.legalNumbers ?? "",
      phone: team.phone ?? "",
    },
    open
  )
  const [busy, setBusy] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      // The logo argument is deliberately absent: the door leaves the column
      // alone when nothing is sent, so editing an address cannot cost a logo.
      await tenancy.updateTeam(team.name, undefined, {
        legalName: values.legalName.trim(),
        legalAddress: values.legalAddress.trim(),
        legalNumbers: values.legalNumbers.trim(),
        phone: values.phone.trim(),
      })
      await onSaved()
      clearDraft()
      onOpenChange(false)
      toast.success(t("Details saved."))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't save those details."))
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
      title={<DialogTitle>{t("Our details")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {t("What a client, an accountant or a supplier form asks for.")}
        </DialogDescription>
      }
      submit={{
        busy: busy,
        icon: <Pencil className="size-4" />,
      }}
    >
      <Field config={legalNameField} htmlFor="legal-name" className={fieldSpacing}>
        <Input
          id="legal-name"
          value={values.legalName}
          onChange={(e) => setValues((s) => ({ ...s, legalName: e.target.value }))}
          placeholder={t("e.g. Kwapso GmbH")}
          disabled={busy}
          autoFocus
        />
      </Field>
      <Field config={addressField} htmlFor="legal-address" className={fieldSpacing}>
        <Textarea
          id="legal-address"
          rows={3}
          value={values.legalAddress}
          onChange={(e) => setValues((s) => ({ ...s, legalAddress: e.target.value }))}
          placeholder={t("Street, postal code, city, country")}
          disabled={busy}
        />
      </Field>
      <Field config={numbersField} htmlFor="legal-numbers" className={fieldSpacing}>
        <Textarea
          id="legal-numbers"
          rows={3}
          value={values.legalNumbers}
          onChange={(e) => setValues((s) => ({ ...s, legalNumbers: e.target.value }))}
          placeholder={t("e.g. Firmenbuchnummer FN 123456a, UID ATU12345678")}
          disabled={busy}
        />
      </Field>
      <Field config={phoneField} htmlFor="legal-phone" className={fieldSpacing}>
        <Input
          id="legal-phone"
          value={values.phone}
          onChange={(e) => setValues((s) => ({ ...s, phone: e.target.value }))}
          placeholder={t("e.g. +43 1 234 5678")}
          disabled={busy}
        />
      </Field>
    </FormShellDialog>
  )
}
