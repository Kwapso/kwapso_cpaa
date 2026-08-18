"use client"

// RAISE A TICKET — one box, one button.
//
// The agency's version of this form also offers a Type dropdown (drawn from the
// team's editable "Ticket type" values) and a link to manage those values. Neither
// belongs here: choosing a category is a job the client shouldn't have to do to
// ask for help, and the dropdown door isn't on the portal's surface at all. The
// agency can type the ticket after it lands.
//
// R4: renders through the shared FormShell — the same one the agency app uses,
// imported rather than copied.
// R7: the draft survives navigating away. Someone typing a careful description
// on a phone must not lose it to a stray tap.

import * as React from "react"

import {
  DialogDescription,
  DialogTitle,
} from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@shared/web/field"
import { Notes } from "@kwapso/ui/registry/primitives/notes/notes"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"
import { Plus } from "lucide-react"

import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { richTextValue } from "@shared/web/rich-text"
import { useFormDraft } from "@shared/web/use-form-draft"
import { ApiFailure } from "@/lib/api"
import { useT } from "@shared/web/language"

const descField = { ...defaultFieldConfig, label: "What do you need?", required: true }

export function RaiseTicketDialog({
  open,
  onOpenChange,
  onSubmit,
  draftKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: { description: string }) => Promise<void>
  /** stable id for per-session draft persistence (CACHING.md §11) */
  draftKey: string
}) {
  const t = useT()
  const [values, setValues, clearDraft] = useFormDraft(draftKey, { description: "" }, open)
  const [busy, setBusy] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await onSubmit({ description: richTextValue(values.description) })
      clearDraft()
      onOpenChange(false)
      toast.success(t("Sent. We'll come back to you here."))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't send that. Try again."))
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
      title={<DialogTitle>{t("Ask us something")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {t("Tell us what's going on in your own words. You'll get the reply right here.")}
        </DialogDescription>
      }
      submit={{
        busy: busy,
        disabled: !richTextValue(values.description),
        icon: <Plus className="size-3.5" />,
      }}
    >
      <Field config={descField} htmlFor="ticket-desc" className={fieldSpacing}>
        <Notes
          key={open ? "open" : "shut"}
          defaultValue={values.description}
          onChange={(html) => setValues((v) => ({ ...v, description: html }))}
          placeholder={t("For example: the new booking page is showing last month's prices.")}
          className="min-h-32"
        />
      </Field>
    </FormShellDialog>
  )
}
