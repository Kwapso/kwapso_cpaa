"use client"

// A qualification somebody on the team holds.
//
// THE TWO DATE FIELDS ARE THE WHOLE POINT of this form being its own. The server
// refuses anything that is not a real calendar day (`optionalDate`, lib/
// internal-fields.ts) rather than storing something that half parses — because
// an expiry that half parses is a certificate that silently never lapses — so
// the inputs are real date pickers, and the browser hands the server exactly the
// YYYY-MM-DD it asks for. A form that can only submit valid dates and a door
// that refuses invalid ones are the same rule said twice, on purpose: the form
// is the courtesy, the door is the guarantee.
//
// Library primitives, FormShell, per-session draft (R4 + R7).

import * as React from "react"

import { DialogDescription, DialogTitle } from "@shared/ui/components/dialog/dialog"
import { Field } from "@shared/web/field"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { Input } from "@shared/ui/components/input/input"
import { toast } from "@shared/ui/components/sonner/sonner"
import { defaultFieldConfig } from "@shared/web/screen-engine/config"

import { ApiFailure, content } from "@/lib/api"
import { FilePicker } from "@/components/file-picker"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

export type CertificateValues = {
  title: string
  issuer: string
  issuedOn: string
  expiresOn: string
  fileUrl: string
}

const EMPTY: CertificateValues = { title: "", issuer: "", issuedOn: "", expiresOn: "", fileUrl: "" }

export function CertificateFormDialog({
  open,
  onOpenChange,
  onSubmit,
  subjectName,
  initial,
  draftKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: CertificateValues) => Promise<void>
  subjectName: string
  /** Present = EDIT mode (prefilled). */
  initial?: Partial<CertificateValues>
  draftKey?: string
}) {
  const t = useT()
  const isEdit = !!initial
  const [values, setValues, clearDraft] = useFormDraft(draftKey, { ...EMPTY, ...initial }, open)
  const [busy, setBusy] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await onSubmit({
        title: values.title.trim(),
        issuer: values.issuer.trim(),
        issuedOn: values.issuedOn.trim(),
        expiresOn: values.expiresOn.trim(),
        fileUrl: values.fileUrl.trim(),
      })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't save the certificate."))
    } finally {
      setBusy(false)
    }
  }

  const input = (key: keyof CertificateValues, label: string, type: string, placeholder?: string, required = false) => (
    <Field
      config={{ ...defaultFieldConfig, label, required }}
      htmlFor={`cert-${key}`}
      className={fieldSpacing}
    >
      <Input
        id={`cert-${key}`}
        type={type}
        value={values[key]}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
        placeholder={placeholder}
        disabled={busy}
        autoFocus={key === "title"}
      />
    </Field>
  )

  return (
    <FormShellDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      onSubmit={submit}
      title={<DialogTitle>{isEdit ? t("Edit certificate") : `Record a certificate for ${subjectName}`}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {t("What they hold, who issued it, and when it lapses. The team can see this; no client can.")}
        </DialogDescription>
      }
      submit={{
        busy: busy,
        disabled: !values.title.trim(),
      }}
    >
      {input("title", "What is it?", "text", "e.g. Cloudflare Workers certified", true)}
      {input("issuer", "Who issued it?", "text", "e.g. Cloudflare")}
      {input("issuedOn", "Granted on", "date")}
      {input("expiresOn", "Lapses on", "date")}
      {/* THE PIECE OF PAPER. A certificate recorded without it is somebody's
          word for it — and until now that was the only thing this form could
          hold, because the upload door had no control anywhere. */}
      <Field
        config={{ ...defaultFieldConfig, label: t("The certificate itself"), required: false }}
        htmlFor="cert-file"
        className={fieldSpacing}
      >
        <FilePicker
          id="cert-file"
          value={values.fileUrl}
          onChange={(url) => setValues((v) => ({ ...v, fileUrl: url }))}
          upload={(dataUrl) => content.uploadStaffFile(dataUrl).then((r) => r.url)}
          disabled={busy}
        />
      </Field>
    </FormShellDialog>
  )
}
