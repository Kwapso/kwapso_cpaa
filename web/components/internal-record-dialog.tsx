"use client"

// ONE form for the four agency-internal RECORD kinds — a marketing post, a brand
// asset, a delivery programme, a meeting purpose.
//
// They are the same form: a name, an optional vocabulary field, some prose, and
// one or two extras. Four dialogs would be four copies of one draft rule, one
// submit path and one busy state — and the day the draft rule changes, three of
// them quietly stop matching. So the SHAPE lives here and each kind supplies its
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

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { DialogDescription, DialogTitle } from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Textarea } from "@kwapso/ui/registry/primitives/textarea/textarea"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { ApiFailure } from "@/lib/api"
import { useFormDraft } from "@shared/web/use-form-draft"

/** One field on the form. `kind` decides the control; `options` turns a text
 * input into a pick-or-create one (a datalist, so typing past the list is
 * allowed and is the point). */
export type InternalField = {
  key: string
  label: string
  kind: "text" | "prose" | "date" | "number"
  placeholder?: string
  options?: string[]
  required?: boolean
}

export type InternalRecordValues = Record<string, string>

export function InternalRecordDialog({
  open,
  onOpenChange,
  onSubmit,
  fields,
  title,
  subtitle,
  submitLabel,
  initial,
  draftKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: InternalRecordValues) => Promise<void>
  fields: InternalField[]
  title: string
  subtitle: string
  submitLabel: string
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
      footer={
        <Button type="submit" disabled={busy || !ready}>
          {busy ? <Spinner /> : null}
          {busy ? "Saving…" : submitLabel}
        </Button>
      }
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
            {f.kind === "prose" ? (
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

/* --------------------------- the four field sets --------------------------- */
// Kept beside the form rather than at each call site: the CREATE panel and the
// EDIT panel for one record kind have to offer the same fields, and two lists
// that must match are one list.

export const marketingFields = (channels: string[], statuses: string[]): InternalField[] => [
  { key: "title", label: "Title", kind: "text", required: true, placeholder: "What did we publish?" },
  { key: "channel", label: "Channel", kind: "text", options: channels, placeholder: "Newsletter, LinkedIn, the blog…" },
  { key: "status", label: "Status", kind: "text", options: statuses, placeholder: "Drafted, scheduled, published…" },
  { key: "publishedOn", label: "Published on", kind: "date" },
  { key: "summary", label: "Summary", kind: "text", placeholder: "One line, for the list" },
  { key: "link", label: "Link", kind: "text", placeholder: "https://…" },
  { key: "body", label: "The post", kind: "prose", placeholder: "What it said." },
]

export const brandAssetFields = (categories: string[]): InternalField[] => [
  { key: "name", label: "Name", kind: "text", required: true, placeholder: "Primary logo (dark)" },
  { key: "category", label: "Category", kind: "text", options: categories, placeholder: "Logos, decks, templates…" },
  { key: "fileUrl", label: "File", kind: "text", placeholder: "https://… or an uploaded file's link" },
  { key: "description", label: "Description", kind: "prose", placeholder: "When to use it, and when not to." },
]

export const programmeFields = (): InternalField[] => [
  { key: "name", label: "Name", kind: "text", required: true, placeholder: "Blueprint" },
  { key: "sequence", label: "Order", kind: "number", placeholder: "1" },
  { key: "description", label: "Description", kind: "prose", placeholder: "What happens, and how long it takes." },
]

export const purposeFields = (departments: string[]): InternalField[] => [
  { key: "name", label: "Name", kind: "text", required: true, placeholder: "Sprint review" },
  { key: "department", label: "Department", kind: "text", options: departments, placeholder: "Delivery, Sales…" },
  { key: "description", label: "Description", kind: "prose", placeholder: "Why we meet, and who is in the room." },
]
