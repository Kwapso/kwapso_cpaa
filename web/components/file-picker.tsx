"use client"

// CHOOSE A FILE — the one upload control, for every form that has one.
//
// It exists because four forms need the same forty lines: read the file, refuse
// one that is too big, send the base64 up, put the URL the server hands back
// into the field, and show what was chosen with a way to take it off again. Four
// copies would be four caps that drift apart and four different sentences for
// the same refusal — and three of those four forms had NO file control at all,
// which is the gap this closes: an article could be uploaded, a certificate, a
// staff photo and a brand asset could only be LINKED, so the piece of paper
// behind them lived somewhere else or nowhere.
//
// It is a CONTROL, not a field: each caller wraps it in its own `<Field>` with
// its own label, because "Photo", "The certificate itself" and "File" are three
// different questions with one answer shape.
//
// WHICH DOOR IT POSTS TO IS THE CALLER'S BUSINESS. Every upload door is gated on
// the module that owns the thing being uploaded (a staff photo needs
// `staff_profiles:create`, a brand asset needs `brand_assets:create`), so this
// control never picks one — it takes the upload as a function and stays a
// picker.

import * as React from "react"

import { Button } from "@shared/ui/controls/button/button"
import { Spinner } from "@shared/ui/controls/spinner/spinner"
import { toast } from "@shared/ui/controls/sonner/sonner"
import { Paperclip } from "@shared/ui/icons"

import { ApiFailure } from "@/lib/api"
// No canvas re-encode: a certificate is a document, and a PDF put through an
// image pipeline is not a PDF. The seam says so once, for both front doors.
import { readFileAsDataUrl } from "@shared/web/file"
import { useT } from "@shared/web/language"

/** The client-side cap. The doors have their own — this one exists so a person
 * who picked a 400 MB video is told before they spend two minutes uploading it. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export function FilePicker({
  id,
  value,
  onChange,
  upload,
  accept = "*/*",
  disabled = false,
}: {
  id: string
  /** the URL currently held by the field — "" when nothing is attached */
  value: string
  onChange: (url: string) => void
  /** post the bytes and answer with the URL the app will serve them from */
  upload: (dataUrl: string, fileName: string) => Promise<string>
  accept?: string
  disabled?: boolean
}) {
  const t = useT()
  const [uploading, setUploading] = React.useState(false)
  // The chosen file's name, for the chip. It is display only — the FIELD holds
  // the URL, so a page reopened later shows "Uploaded file" rather than a name
  // this component never knew.
  const [fileName, setFileName] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)

  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // let the same file be re-picked after a remove
    if (!file) return
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(t("That file is over 25 MB, please pick a smaller one."))
      return
    }
    setUploading(true)
    try {
      onChange(await upload(await readFileAsDataUrl(file), file.name))
      setFileName(file.name)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't upload that file."))
    } finally {
      setUploading(false)
    }
  }

  if (value)
    return (
      <div className="bg-card flex items-center gap-2 rounded-[var(--radius)] border p-2 text-sm">
        <Paperclip className="text-muted-foreground size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{fileName || t("Uploaded file")}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onChange("")
            setFileName("")
          }}
          disabled={disabled || uploading}
          className="text-muted-foreground h-auto shrink-0 px-2 py-1"
        >
          {t("Remove")}
        </Button>
      </div>
    )

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        onChange={(e) => void handle(e)}
        disabled={disabled || uploading}
        className="hidden"
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading}
        className="gap-1"
      >
        {uploading ? <Spinner /> : <Paperclip className="size-3.5" />}
        {uploading ? t("Uploading…") : t("Choose a file")}
      </Button>
      <span className="text-muted-foreground text-xs">{t("Up to 25 MB.")}</span>
    </div>
  )
}
