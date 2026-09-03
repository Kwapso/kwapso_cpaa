"use client"

// ANSWER IT FROM THE QUEUE — the second half of "they should be able to edit the
// ticket and change everything about it".
//
// Triage is where somebody reads a request for the first time, and a good number
// of requests are answered by one sentence. Sending that sentence used to mean
// leaving the queue, opening the ticket, scrolling to the thread and coming
// back — four moves to say "we shipped that on Tuesday". The composer on the
// ticket's own screen stays exactly where it is; this is the short way round for
// the short answer, and it posts through the SAME door.
//
// It is not a resolution. Resolving sends the client an email and is refused
// without a written answer (`/help/resolve`); this adds a message to the thread
// and nothing else, which is why it is gated on `help:read` like every other
// reply rather than on `help:edit`.
//
// Through the shared FormShell (Law R4) with a per-session draft (Law R7).

import * as React from "react"

import { DialogDescription, DialogTitle } from "@shared/ui/components/dialog/dialog"
import { Field } from "@shared/web/field"
import { Textarea } from "@shared/ui/components/textarea/textarea"
import { toast } from "@shared/ui/components/sonner/sonner"
import { PaperPlaneTilt } from "@shared/ui/foundations/icons"
import { defaultFieldConfig } from "@shared/web/screen-engine/config"

import { ApiFailure } from "@/lib/api"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

const bodyField = {
  ...defaultFieldConfig,
  label: "Your reply",
  required: true,
  hint: "It goes on the ticket's thread, where whoever raised it will see it.",
}

export function TriageReplyDialog({
  open,
  onOpenChange,
  draftKey,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  draftKey?: string
  onSubmit: (body: string) => Promise<void>
}) {
  const t = useT()
  const [values, setValues, clearDraft] = useFormDraft(draftKey, { body: "" }, open)
  const [busy, setBusy] = React.useState(false)
  const ready = values.body.trim() !== ""

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      await onSubmit(values.body.trim())
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't send that reply."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormShellDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      onSubmit={submit}
      title={<DialogTitle>{t("Reply")}</DialogTitle>}
      subtitle={<DialogDescription>{t("A message on the ticket. It does not resolve it.")}</DialogDescription>}
      submit={{ busy: busy, disabled: !ready, icon: <PaperPlaneTilt className="size-4" /> }}
    >
      <Field config={bodyField} htmlFor="triage-reply" className={fieldSpacing}>
        <Textarea
          id="triage-reply"
          value={values.body}
          onChange={(e) => setValues((v) => ({ ...v, body: e.target.value }))}
          placeholder={t("e.g. We shipped this on Tuesday — try it and tell us if it is still wrong.")}
          disabled={busy}
          rows={4}
          autoFocus
        />
      </Field>
    </FormShellDialog>
  )
}
