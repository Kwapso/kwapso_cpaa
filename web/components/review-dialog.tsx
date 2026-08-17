"use client"

// READY FOR REVIEW (CHECKLIST 6.9) — the panel that collects what a story has to
// say for itself before somebody else is asked to look at it.
//
// TWO THINGS ARE REQUIRED AND ONE IS NOT, and the asymmetry is Aurora's ruling
// over the owner's "all three always":
//
//   • every TIMER on the story must be stopped. Not asked for here at all — the
//     door checks it, because a form cannot know about the colleague who is still
//     clocking the same piece of work in another tab. "Review" means "I have
//     stopped, come and look", and a running clock says the opposite;
//   • an EXPLANATION, required. A story arriving in somebody's review queue with
//     no sentence attached is a story they have to go and ask about;
//   • something to SHOW, optional. Plenty of real work has no screenshot, and a
//     required upload on work with nothing to show is a rule people satisfy with
//     a blank image.
//
// Through the shared FormShell (Law R4) with a per-session draft (Law R7).

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { DialogDescription, DialogTitle } from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { Textarea } from "@kwapso/ui/registry/primitives/textarea/textarea"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { ClipboardCheck } from "lucide-react"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { ApiFailure } from "@/lib/api"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

export type ReviewFormValues = {
  reviewNote: string
  reviewFileUrl: string
  reviewFileName: string
}

const noteField = {
  ...defaultFieldConfig,
  label: "What you did",
  required: true,
  hint: "A line or two. It is what the reviewer reads before they look.",
}
const fileField = {
  ...defaultFieldConfig,
  label: "Something to show",
  required: false,
  hint: "Only when there is something. A link to a recording, a screenshot, a page.",
}

export function ReviewDialog({
  open,
  onOpenChange,
  initial,
  draftKey,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Whatever the story already carries — an explanation typed on Tuesday is
   * still the explanation on Thursday. */
  initial: ReviewFormValues
  draftKey?: string
  onSubmit: (values: ReviewFormValues) => Promise<void>
}) {
  const t = useT()
  const [values, setValues, clearDraft] = useFormDraft(draftKey, initial, open)
  const [busy, setBusy] = React.useState(false)
  const ready = values.reviewNote.trim() !== ""

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      await onSubmit({
        reviewNote: values.reviewNote.trim(),
        reviewFileUrl: values.reviewFileUrl.trim(),
        reviewFileName: values.reviewFileName.trim(),
      })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      // THE TIMER REFUSAL LANDS HERE, in the door's own words ("Stop the timer on
      // this first"). Shown rather than translated into something vaguer: the
      // person needs to know which thing to go and do.
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't send that for review.")
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
      title={<DialogTitle>{t("Ready for review")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {t("Stop your timer first, then say what you did. A file only if there is one.")}
        </DialogDescription>
      }
      footer={
        <Button type="submit" disabled={busy || !ready} className="gap-1.5">
          {busy ? <Spinner /> : <ClipboardCheck className="size-4" />}
          {busy ? "Submitting…" : "Submit"}
        </Button>
      }
    >
      <Field config={noteField} htmlFor="review-note" className={fieldSpacing}>
        <Textarea
          id="review-note"
          value={values.reviewNote}
          onChange={(e) => setValues((v) => ({ ...v, reviewNote: e.target.value }))}
          placeholder={t("e.g. Moved the dispatch list onto the driver app and checked it on a phone.")}
          disabled={busy}
          rows={4}
          autoFocus
        />
      </Field>
      <Field config={fileField} htmlFor="review-file" className={fieldSpacing}>
        <div className="flex flex-col gap-2">
          <Input
            id="review-file"
            value={values.reviewFileUrl}
            onChange={(e) => setValues((v) => ({ ...v, reviewFileUrl: e.target.value }))}
            placeholder={t("https://…")}
            disabled={busy}
          />
          <Input
            value={values.reviewFileName}
            onChange={(e) => setValues((v) => ({ ...v, reviewFileName: e.target.value }))}
            placeholder={t("What it is")}
            disabled={busy}
          />
        </div>
      </Field>
    </FormShellDialog>
  )
}
