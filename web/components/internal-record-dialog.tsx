"use client"

// ONE form for the two agency-internal RECORD kinds — a brand asset and a
// meeting purpose.
//
// They are the same form: a name, an optional vocabulary field, some prose, and
// one or two extras. Two dialogs would be two copies of one draft rule, one
// submit path and one busy state — and the day the draft rule changes, one of
// them quietly stops matching. So the SHAPE lives here and each kind supplies its
// FIELDS, which is the same trade the screen recipes make one layer up.
//
// The vocabulary fields (channel, status, category, department) are PICK-OR-
// CREATE: the picker offers what the team already uses, and typing something new
// adds it to the vocabulary rather than being refused. That is why they are a
// text input with a datalist rather than a Select — a Select can only ever offer
// what exists, which is the wrong answer for a field whose whole job is to grow.
//
// Library primitives, FormShell, per-session draft (R4 + R7).

import * as React from "react"

import { DialogDescription, DialogTitle } from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Textarea } from "@kwapso/ui/registry/primitives/textarea/textarea"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { ApiFailure, content } from "@/lib/api"
import { FilePicker } from "@/components/file-picker"
import { useFormDraft } from "@shared/web/use-form-draft"

/** One field on the form. `kind` decides the control; `options` turns a text
 * input into a pick-or-create one (a datalist, so typing past the list is
 * allowed and is the point). */
export type InternalField = {
  key: string
  label: string
  kind: "text" | "prose" | "date" | "number" | "file"
  placeholder?: string
  options?: string[]
  required?: boolean
  /** `kind: "file"` only — post the bytes and answer with the URL to store. It
   * lives on the FIELD rather than on the dialog because each upload door is
   * gated on the module that owns the thing being uploaded, and this one form
   * serves four modules. */
  upload?: (dataUrl: string, fileName: string) => Promise<string>
}

export type InternalRecordValues = Record<string, string>

export function InternalRecordDialog({
  open,
  onOpenChange,
  onSubmit,
  fields,
  title,
  subtitle,
  initial,
  draftKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: InternalRecordValues) => Promise<void>
  fields: InternalField[]
  title: string
  subtitle: string
  /** Present = EDIT mode (prefilled). */
  initial?: InternalRecordValues
  /** stable id for per-session draft persistence (CACHING.md §11). */
  draftKey?: string
}) {
  const blank = React.useMemo(
    () => Object.fromEntries(fields.map((f) => [f.key, initial?.[f.key] ?? ""])),
    [fields, initial]
  )
  const [values, setValues, clearDraft] = useFormDraft(draftKey, blank, open)
  const [busy, setBusy] = React.useState(false)

  // The first REQUIRED field is what the submit button waits for. Derived rather
  // than named, so a form whose required field moves cannot end up with a button
  // that enables on the wrong one.
  const gateField = fields.find((f) => f.required)?.key ?? fields[0]?.key ?? ""
  const ready = (values[gateField] ?? "").trim() !== ""

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await onSubmit(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()])))
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't save that.")
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
      title={<DialogTitle>{title}</DialogTitle>}
      subtitle={<DialogDescription>{subtitle}</DialogDescription>}
      submit={{
        busy: busy,
        disabled: !ready,
      }}
    >
      {fields.map((f, i) => {
        const id = `internal-${f.key}`
        const listId = f.options?.length ? `${id}-options` : undefined
        return (
          <Field
            key={f.key}
            config={{ ...defaultFieldConfig, label: f.label, required: !!f.required }}
            htmlFor={id}
            className={fieldSpacing}
          >
            {f.kind === "file" && f.upload ? (
              <FilePicker
                id={id}
                value={values[f.key] ?? ""}
                onChange={(url) => setValues((v) => ({ ...v, [f.key]: url }))}
                upload={f.upload}
                disabled={busy}
              />
            ) : f.kind === "prose" ? (
              <Textarea
                id={id}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                disabled={busy}
                rows={6}
              />
            ) : (
              <>
                <Input
                  id={id}
                  type={f.kind === "date" ? "date" : f.kind === "number" ? "number" : "text"}
                  list={listId}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  disabled={busy}
                  autoFocus={i === 0}
                />
                {listId && (
                  <datalist id={listId}>
                    {f.options?.map((o) => (
                      <option key={o} value={o} />
                    ))}
                  </datalist>
                )}
              </>
            )}
          </Field>
        )
      })}
    </FormShellDialog>
  )
}

/* --------------------------- the two field sets ---------------------------- */
// Kept beside the form rather than at each call site: the CREATE panel and the
// EDIT panel for one record kind have to offer the same fields, and two lists
// that must match are one list.

export const brandAssetFields = (categories: string[]): InternalField[] => [
  { key: "name", label: "Name", kind: "text", required: true, placeholder: "Primary logo (dark)" },
  { key: "category", label: "Category", kind: "text", options: categories, placeholder: "Logos, decks, templates…" },
  // THE MATERIAL ITSELF. The brand library holds what everything else is made
  // with, and this field used to ask for a link to somewhere else — the upload
  // door existed and nothing on any screen called it, so a logo could be
  // described here and only ever kept elsewhere. It is the one field on either
  // internal form that is a file, which is why `kind: "file"` carries its own
  // door rather than the dialog knowing about any.
  {
    key: "fileUrl",
    label: "File",
    kind: "file",
    upload: (dataUrl) => content.uploadBrandAssetFile(dataUrl).then((r) => r.url),
  },
  { key: "description", label: "Description", kind: "prose", placeholder: "When to use it, and when not to." },
]

export const purposeFields = (departments: string[]): InternalField[] => [
  { key: "name", label: "Name", kind: "text", required: true, placeholder: "Sprint review" },
  { key: "department", label: "Department", kind: "text", options: departments, placeholder: "Delivery, Sales…" },
  { key: "description", label: "Description", kind: "prose", placeholder: "Why we meet, and who is in the room." },
]
