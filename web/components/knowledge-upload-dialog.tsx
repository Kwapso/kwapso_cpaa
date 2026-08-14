"use client"

// UPLOAD A FILE INTO THE KNOWLEDGE BASE — the third way in, as a person meets it.
//
// It is a separate dialog from `knowledge-form-dialog` even though the two share
// three fields, and the reason is the one sentence at the top of each: that one
// asks "what should the assistant know?", this one asks "which file?". Folding a
// file picker into the typed-note form would make the most common act on that
// form (writing a sentence) share a screen with the least common one, and would
// leave a form where two different things are the material.
//
// WHY IT DOES NOT USE `FilePicker`. That control's contract is "post the bytes,
// hand back a URL" — an upload door that answers with a link, which the form
// then saves in a second call. This door writes the FILE AND THE ROW IN ONE
// CALL on purpose (see the route's header: two calls would leave an orphan in
// the bucket every time somebody closed the tab in between). So the file is held
// here, in the form, until Save — which is also why the drop zone is written out
// rather than borrowed.
//
// THE DRAFT KEEPS THE WORDS, NOT THE FILE (R7). A File cannot go into session
// storage, so what survives navigating away is the title and the filing — and
// the form says the file has to be chosen again rather than pretending it is
// still there. FormShell + useFormDraft, like every other form (R4 + R7).

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { DialogDescription, DialogTitle } from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
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
import { Paperclip, Upload } from "lucide-react"

import { ApiFailure } from "@/lib/api"
import { useFormDraft } from "@shared/web/use-form-draft"

/** The client-side cap, matching the door's `KNOWLEDGE_FILE_MAX_BYTES`. It is
 * here so that a person who picked a 400 MB video is told before they spend two
 * minutes uploading it — the door still enforces its own, because a browser is
 * not a boundary. */
const MAX_FILE_BYTES = 25 * 1024 * 1024

const fileField = { ...defaultFieldConfig, label: "Which file?", required: true }
const titleField = { ...defaultFieldConfig, label: "What should we call it?", required: false }
const filedField = { ...defaultFieldConfig, label: "Filed under", required: false }
const visibilityField = { ...defaultFieldConfig, label: "Who can use it", required: false }

/** Radix Select can't hold an empty value, so "the agency's own" uses a sentinel
 * — the same one the typed-note form uses, for the same reason. */
const AGENCY = "__agency__"

/** Read a File to a raw base64 data URL. No re-encode of any kind: whatever was
 * dropped is what gets stored, byte for byte. */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error("read failed"))
    reader.readAsDataURL(file)
  })
}

export function KnowledgeUploadDialog({
  open,
  onOpenChange,
  onSubmit,
  accountOptions,
  draftKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** post the file and its filing; resolves once the source exists */
  onSubmit: (values: {
    fileName: string
    fileDataUrl: string
    title: string
    accountId: string
    visibility: "team" | "private"
  }) => Promise<void>
  /** the accounts this caller may file under — already fenced by their own read */
  accountOptions: { id: string; name: string }[]
  /** stable id for per-session draft persistence (CACHING.md §11) */
  draftKey?: string
}) {
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    { title: "", accountId: AGENCY, visibility: "team" as "team" | "private" },
    open
  )
  // The FILE lives outside the draft — see the header. It is cleared whenever the
  // dialog opens, so a reopened form never claims to still be holding something
  // the browser has forgotten.
  const [file, setFile] = React.useState<File | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (open) setFile(null)
  }, [open])

  function take(picked: File | null | undefined) {
    if (!picked) return
    if (picked.size > MAX_FILE_BYTES) {
      toast.error("That file is over 25 MB — please pick a smaller one.")
      return
    }
    setFile(picked)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setBusy(true)
    try {
      await onSubmit({
        fileName: file.name,
        fileDataUrl: await readFileAsDataUrl(file),
        title: values.title.trim(),
        accountId: values.accountId === AGENCY ? "" : values.accountId,
        visibility: values.visibility,
      })
      clearDraft()
      setFile(null)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't add that file.")
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
      title={<DialogTitle>Add a file to the knowledge base</DialogTitle>}
      subtitle={
        <DialogDescription>
          Any file from your computer. We read the words out of documents, spreadsheets,
          PDFs and pictures so the assistant can answer from them and name the file when
          it does. Anything we can&apos;t read is still kept here, and we&apos;ll say so.
        </DialogDescription>
      }
      footer={
        <Button type="submit" disabled={busy || !file}>
          {busy ? <Spinner /> : null}
          {busy ? "Reading it…" : "Add file"}
        </Button>
      }
    >
      <Field config={fileField} htmlFor="knowledge-file" className={fieldSpacing}>
        {/* The drop zone IS the picker: dropping and clicking land in the same
            place, because the owner's sentence was "drops a file on the page" and
            a control that only accepts one of the two is half a control. */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            take(e.dataTransfer.files?.[0])
          }}
          className={`flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30"
          }`}
        >
          <input
            ref={inputRef}
            id="knowledge-file"
            type="file"
            onChange={(e) => {
              take(e.target.files?.[0])
              e.target.value = "" // let the same file be re-picked after a change
            }}
            disabled={busy}
            className="hidden"
          />
          {file ? (
            <div className="flex w-full min-w-0 items-center gap-2 text-sm">
              <Paperclip className="text-muted-foreground size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{file.name}</span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {Math.max(1, Math.round(file.size / 1000)).toLocaleString()} KB
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setFile(null)}
                disabled={busy}
                className="text-muted-foreground h-auto shrink-0 px-2 py-1"
              >
                Remove
              </Button>
            </div>
          ) : (
            <>
              <Upload className="text-muted-foreground size-5" aria-hidden />
              <p className="text-muted-foreground text-sm">Drop a file here, or</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="gap-1.5"
              >
                <Paperclip className="size-3.5" />
                Choose a file
              </Button>
            </>
          )}
        </div>
      </Field>
      <Field config={titleField} htmlFor="knowledge-file-title" className={fieldSpacing}>
        <Input
          id="knowledge-file-title"
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          placeholder={file ? file.name : "Leave this blank to use the file's own name"}
          disabled={busy}
        />
      </Field>
      <Field config={filedField} htmlFor="knowledge-file-filed" className={fieldSpacing}>
        <Select
          value={values.accountId}
          onValueChange={(accountId) => setValues((v) => ({ ...v, accountId }))}
          disabled={busy}
        >
          <SelectTrigger id="knowledge-file-filed">
            <SelectValue placeholder="The agency's own" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AGENCY}>The agency&apos;s own</SelectItem>
            {accountOptions.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground mt-1 text-xs">
          Filing it under a client is how a question about them finds it first.
        </p>
      </Field>
      <Field config={visibilityField} htmlFor="knowledge-file-visibility" className={fieldSpacing}>
        <Select
          value={values.visibility}
          onValueChange={(visibility) =>
            setValues((v) => ({ ...v, visibility: visibility === "private" ? "private" : "team" }))
          }
          disabled={busy}
        >
          <SelectTrigger id="knowledge-file-visibility">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="team">Anyone who can read the knowledge base</SelectItem>
            <SelectItem value="private">Only me</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </FormShellDialog>
  )
}
