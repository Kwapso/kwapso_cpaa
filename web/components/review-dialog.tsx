"use client"

// READY FOR REVIEW (CHECKLIST 6.9) — the panel that collects what a story has to
// say for itself before somebody else is asked to look at it.
//
// ALL THREE ARE REQUIRED NOW (owner, 19 Aug 2026): "An explanation text plus one
// or more files or images are required to send a story for review."
//
//   • every TIMER on the story must be stopped. Not asked for here at all — the
//     door checks it, because a form cannot know about the colleague who is still
//     clocking the same piece of work in another tab. "Review" means "I have
//     stopped, come and look", and a running clock says the opposite;
//   • an EXPLANATION, required. A story arriving in somebody's review queue with
//     no sentence attached is a story they have to go and ask about;
//   • something to SHOW, required, and as many as there are. Files or links.
//
// THIS REVERSES AURORA'S RULING, which is worth recording rather than quietly
// overwriting. Hers was: "a required upload on work with nothing to show is a
// rule people satisfy with a blank image", and that risk is real — the day
// somebody finds a folder of blank screenshots, this is the sentence that
// explains them. The owner overruled it knowing so.
//
// THE ATTACHMENTS ARE NOT PART OF THIS FORM'S PAYLOAD. Each one is uploaded to
// the story the moment it is chosen, through the story's own attachment door, so
// what the review request sends is only the words — and the door counts what the
// story CARRIES. That is what lets somebody upload on Tuesday, press the button
// on Thursday, and not be refused for sending no files with the move.
//
// Through the shared FormShell (Law R4) with a per-session draft (Law R7).

import * as React from "react"

import { DialogDescription, DialogTitle } from "@shared/ui/registry/primitives/dialog/dialog"
import { Field } from "@shared/web/field"
import { Input } from "@shared/ui/registry/primitives/input/input"
import { Textarea } from "@shared/ui/registry/primitives/textarea/textarea"
import { toast } from "@shared/ui/registry/primitives/sonner/sonner"
import { ClipboardCheck, Link as LinkIcon, Paperclip, Plus, X } from "lucide-react"
import { defaultFieldConfig } from "@shared/ui/lib/config"

import { Button } from "@shared/ui/registry/primitives/button/button"
import { FileUpload } from "@shared/ui/registry/primitives/file-upload/file-upload"
import type { StoryAttachment } from "@shared/types"
import { readFileAsDataUrl } from "@shared/web/file"
import { ApiFailure, content as contentApi } from "@/lib/api"
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
  required: true,
  hint: "At least one. A screenshot, a recording, a link to the page it changed.",
}
const linkField = {
  ...defaultFieldConfig,
  label: "Or paste a link",
  required: false,
  hint: "A recording, a page, a document somebody can open.",
}

export function ReviewDialog({
  open,
  onOpenChange,
  storyId,
  initial,
  draftKey,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The story these attachments belong to. Each file is uploaded to it as it is
   * chosen rather than carried in this form's payload — see the header. */
  storyId: string
  /** Whatever the story already carries — an explanation typed on Tuesday is
   * still the explanation on Thursday. */
  initial: ReviewFormValues
  draftKey?: string
  onSubmit: (values: ReviewFormValues) => Promise<void>
}) {
  const t = useT()
  const [values, setValues, clearDraft] = useFormDraft(draftKey, initial, open)
  const [busy, setBusy] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [shown, setShown] = React.useState<StoryAttachment[] | null>(null)

  // WHAT THE STORY ALREADY CARRIES, read when the dialog opens. The submit
  // button is disabled on this rather than on anything in the form, because the
  // DOOR counts the story's attachments and a form that disagreed with the door
  // would be a button that fails.
  React.useEffect(() => {
    if (!open) return
    let live = true
    setShown(null)
    void contentApi
      .storyAttachments(storyId)
      .then((r) => live && setShown(r.attachments))
      .catch(() => live && setShown([]))
    return () => {
      live = false
    }
  }, [open, storyId])

  async function attachFiles(files: File[]) {
    if (files.length === 0) return
    setUploading(true)
    try {
      let latest = shown ?? []
      for (const file of files) {
        const fileDataUrl = await readFileAsDataUrl(file)
        const res = await contentApi.addStoryAttachment({
          id: storyId,
          kind: "file",
          label: file.name,
          fileDataUrl,
        })
        latest = res.attachments
      }
      setShown(latest)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't attach that."))
    } finally {
      setUploading(false)
    }
  }

  async function attachLink() {
    const url = values.reviewFileUrl.trim()
    if (!url) return
    setUploading(true)
    try {
      const res = await contentApi.addStoryAttachment({
        id: storyId,
        kind: "link",
        label: values.reviewFileName.trim() || url,
        url,
      })
      setShown(res.attachments)
      setValues((v) => ({ ...v, reviewFileUrl: "", reviewFileName: "" }))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't attach that."))
    } finally {
      setUploading(false)
    }
  }

  async function detach(attachmentId: string) {
    try {
      const res = await contentApi.removeStoryAttachment(storyId, attachmentId)
      setShown(res.attachments)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't take that off."))
    }
  }

  // BOTH HALVES, which is the whole of the new rule.
  const ready = values.reviewNote.trim() !== "" && (shown?.length ?? 0) > 0

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
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't send that for review."))
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
      submit={{
        busy: busy,
        disabled: !ready,
        icon: <ClipboardCheck className="size-4" />,
      }}
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
          {/* WHAT IS ALREADY ON THE STORY, including anything attached days ago.
              Listed first because it is what the door will count. */}
          {shown === null ? (
            <p className="text-muted-foreground text-sm">{t("Reading what's attached…")}</p>
          ) : shown.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("Nothing attached yet.")}</p>
          ) : (
            <ul className="divide-border divide-y rounded-xl border">
              {shown.map((a) => (
                <li key={a.id} className="flex items-center gap-2 px-3 py-2">
                  {a.kind === "file" ? (
                    <Paperclip className="text-muted-foreground size-3.5 shrink-0" />
                  ) : (
                    <LinkIcon className="text-muted-foreground size-3.5 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm">{a.label}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label={t("Take it off")}
                    disabled={busy || uploading}
                    onClick={() => void detach(a.id)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <FileUpload
            multiple
            onChange={(files) => void attachFiles(files)}
            className={busy || uploading ? "pointer-events-none opacity-60" : undefined}
          />
        </div>
      </Field>
      <Field config={linkField} htmlFor="review-file" className={fieldSpacing}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="review-file"
            value={values.reviewFileUrl}
            onChange={(e) => setValues((v) => ({ ...v, reviewFileUrl: e.target.value }))}
            placeholder="https://…"
            disabled={busy || uploading}
          />
          <Input
            value={values.reviewFileName}
            onChange={(e) => setValues((v) => ({ ...v, reviewFileName: e.target.value }))}
            placeholder={t("What it is")}
            disabled={busy || uploading}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={busy || uploading || values.reviewFileUrl.trim() === ""}
            onClick={() => void attachLink()}
            className="shrink-0 gap-1"
          >
            <Plus className="size-3.5" />
            {t("Add")}
          </Button>
        </div>
      </Field>
    </FormShellDialog>
  )
}
