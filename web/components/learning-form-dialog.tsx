"use client"

// Learning form dialog — create a new article OR edit an existing one's content.
// `initial` present = edit mode (prefilled). Title is required. Category and Content
// type are pure DROPDOWNS from the team's dropdown values (with a gated "Manage
// dropdowns" link to add options). The single rich-text CONTENT field (library Notes
// editor → sanitized HTML) is the article — what your team reads and the assistant
// reads to answer a ticket. Shared FormShell layout; per-session draft (CACHING.md §11).

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import {
  DialogDescription,
  DialogTitle,
} from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Notes } from "@kwapso/ui/registry/primitives/notes/notes"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kwapso/ui/registry/primitives/select/select"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"
import { X } from "lucide-react"

import { ApiFailure, content } from "@/lib/api"
import { useFormDraft } from "@shared/web/use-form-draft"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { FilePicker } from "@/components/file-picker"
import { ManageDropdownsLink } from "@/components/manage-dropdowns-link"

const titleField = { ...defaultFieldConfig, label: "Title", required: true }
const categoryField = { ...defaultFieldConfig, label: "Category", required: false }
const typeField = { ...defaultFieldConfig, label: "Content type", required: false }
const linkField = { ...defaultFieldConfig, label: "External link", required: false }
const fileField = { ...defaultFieldConfig, label: "File", required: false }
const bodyField = { ...defaultFieldConfig, label: "Content", required: false }

// Radix Select can't hold an empty value, so "no choice" uses a sentinel.
const NONE = "__none__"

// A content type whose name contains "file" (e.g. "Video file") means the
// resource is an uploaded file, not an external link — show the uploader.
const isFileType = (t: string) => /file/i.test(t)

// Map the file-type keyword to an <input accept> so the picker pre-filters.
function acceptFor(t: string): string {
  const v = t.toLowerCase()
  if (v.includes("video")) return "video/*"
  if (v.includes("image")) return "image/*"
  if (v.includes("audio")) return "audio/*"
  return "*/*"
}

/** What the form prefills from / submits — the editable surface of a Learning. */
export type LearningFormValues = {
  title: string
  category: string
  contentType: string
  contentLink: string
  /** the article content — rich text as sanitized HTML */
  body: string
}

export function LearningFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
  draftKey,
  teamId,
  categoryOptions = [],
  contentTypeOptions = [],
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** present = edit mode (prefilled); absent = create mode */
  initial?: LearningFormValues | null
  onSubmit: (values: LearningFormValues) => Promise<void>
  /** stable id for per-session draft persistence (CACHING.md §11); omit to disable */
  draftKey?: string
  /** the active team — drives the gated "Manage dropdowns" link */
  teamId?: string | null
  /** existing "Learning category" values to pick from */
  categoryOptions?: string[]
  /** existing "File type" values to pick from */
  contentTypeOptions?: string[]
}) {
  const isEdit = !!initial
  const initialValues: LearningFormValues = {
    title: initial?.title ?? "",
    category: initial?.category || NONE,
    contentType: initial?.contentType || NONE,
    contentLink: initial?.contentLink ?? "",
    body: initial?.body ?? "",
  }
  // Per-session draft: restores what you typed if you navigate away and reopen.
  // `seed` re-keys the uncontrolled rich-text editor so it remounts with the draft.
  const [values, setValues, clearDraft, seed] = useFormDraft(draftKey, initialValues, open)
  const [busy, setBusy] = React.useState(false)
  // This content type is an uploaded file, so swap the link Input for the picker.
  const wantsFile = values.contentType !== NONE && isFileType(values.contentType)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await onSubmit({
        title: values.title.trim(),
        category: values.category === NONE ? "" : values.category,
        contentType: values.contentType === NONE ? "" : values.contentType,
        contentLink: values.contentLink.trim(),
        body: values.body,
      })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't save the article.")
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
      title={<DialogTitle>{isEdit ? "Edit this article" : "Write a how-to"}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {isEdit
            ? "Update what this article teaches. The content is also what the assistant reads to help your team."
            : "Share a how-to your team can read right here. The content also helps the assistant answer questions."}
        </DialogDescription>
      }
      footer={
        <Button type="submit" disabled={busy || !values.title.trim()}>
          {busy ? <Spinner /> : null}
          {busy ? "Saving…" : isEdit ? "Save changes" : "Create article"}
        </Button>
      }
    >
      <Field config={titleField} htmlFor="learning-title" className={fieldSpacing}>
        <Input
          id="learning-title"
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          placeholder="How to onboard a new client"
          disabled={busy}
          autoFocus
        />
      </Field>

      <Field config={categoryField} htmlFor="learning-category" className={fieldSpacing}>
        <div className="flex items-center gap-2">
          <Select
            value={values.category}
            onValueChange={(category) => setValues((v) => ({ ...v, category }))}
            disabled={busy}
          >
            <SelectTrigger id="learning-category" className="flex-1">
              <SelectValue placeholder="Choose a category (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No category</SelectItem>
              {categoryOptions.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {values.category !== NONE && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setValues((v) => ({ ...v, category: NONE }))}
              disabled={busy}
              className="text-muted-foreground shrink-0"
              aria-label="Clear category"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </Field>

      <Field config={typeField} htmlFor="learning-type" className={fieldSpacing}>
        <div className="flex items-center gap-2">
          <Select
            value={values.contentType}
            onValueChange={(contentType) => setValues((v) => ({ ...v, contentType }))}
            disabled={busy}
          >
            <SelectTrigger id="learning-type" className="flex-1">
              <SelectValue placeholder="Choose a type (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No type</SelectItem>
              {contentTypeOptions.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {values.contentType !== NONE && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setValues((v) => ({ ...v, contentType: NONE }))}
              disabled={busy}
              className="text-muted-foreground shrink-0"
              aria-label="Clear content type"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
        <ManageDropdownsLink teamId={teamId ?? null} />
      </Field>

      {wantsFile ? (
        // File-type content: upload the file itself (stored on R2, served from
        // /media) instead of pasting an external link — through the one upload
        // control every form in the app now shares (components/file-picker).
        <Field config={fileField} htmlFor="learning-file" className={fieldSpacing}>
          <FilePicker
            id="learning-file"
            value={values.contentLink}
            onChange={(url) => setValues((v) => ({ ...v, contentLink: url }))}
            upload={(dataUrl) => content.uploadLearningFile(dataUrl).then((r) => r.url)}
            accept={acceptFor(values.contentType)}
            disabled={busy}
          />
        </Field>
      ) : (
        <Field config={linkField} htmlFor="learning-link" className={fieldSpacing}>
          <Input
            id="learning-link"
            type="url"
            value={values.contentLink}
            onChange={(e) => setValues((v) => ({ ...v, contentLink: e.target.value }))}
            placeholder="https://… (optional)"
            disabled={busy}
          />
        </Field>
      )}

      <Field config={bodyField} htmlFor="learning-body" className={fieldSpacing}>
        <Notes
          key={seed}
          defaultValue={values.body}
          onChange={(html) => setValues((v) => ({ ...v, body: html }))}
          placeholder="Write the article — bold, italic, highlight, and lists are supported."
          className="min-h-40"
        />
      </Field>
    </FormShellDialog>
  )
}
