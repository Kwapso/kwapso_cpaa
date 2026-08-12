"use client"

// ANSWER A TICKET — the second and last thing in the product that emails a
// client (.plans/BUILD-1 §7). Through the shared FormShell (Law R4) with a
// per-session draft (Law R7).
//
// IT OPENS PRE-FILLED, and that is the whole point of the ticket's draft
// resolution: each story's closing note has been appended to it as the work
// finished, so the person answering is editing a paragraph rather than
// composing one at the end of a fortnight. What they send is what they edited —
// the door takes the words as an argument and never reads the draft itself,
// because a draft is our working text and a resolution is a sentence somebody
// chose to say.
//
// The button says what it does. There is no un-sending an email.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { DialogDescription, DialogTitle } from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { Textarea } from "@kwapso/ui/registry/primitives/textarea/textarea"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { Send } from "lucide-react"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { ApiFailure } from "@/lib/api"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { useFormDraft } from "@shared/web/use-form-draft"

export type ResolveFormValues = { resolution: string }

const resolutionField = {
  ...defaultFieldConfig,
  label: "What we're telling them",
  required: true,
  hint: "This is emailed to the client and added to the conversation.",
}

export function ResolveDialog({
  open,
  onOpenChange,
  draft,
  draftKey,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** the ticket's accumulated draft — each story's closing note, in order. */
  draft: string | null
  draftKey?: string
  onSubmit: (values: ResolveFormValues) => Promise<void>
}) {
  const [values, setValues, clearDraft] = useFormDraft(draftKey, { resolution: draft ?? "" }, open)
  const [busy, setBusy] = React.useState(false)
  const ready = values.resolution.trim() !== ""

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      await onSubmit({ resolution: values.resolution.trim() })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't send that.")
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
      title={<DialogTitle>Answer this ticket</DialogTitle>}
      subtitle={
        <DialogDescription>
          It resolves the ticket, joins the conversation, and goes to the client by email.
        </DialogDescription>
      }
      footer={
        <Button type="submit" disabled={busy || !ready} className="gap-1.5">
          {busy ? <Spinner /> : <Send className="size-4" />}
          {busy ? "Sending…" : "Send and resolve"}
        </Button>
      }
    >
      <Field config={resolutionField} htmlFor="resolve-text" className={fieldSpacing}>
        <Textarea
          id="resolve-text"
          value={values.resolution}
          onChange={(e) => setValues((s) => ({ ...s, resolution: e.target.value }))}
          placeholder="What we did, in the words they'd use."
          disabled={busy}
          rows={6}
          autoFocus
        />
      </Field>
    </FormShellDialog>
  )
}
