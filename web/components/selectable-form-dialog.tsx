"use client"

// Add-a-dropdown-value dialog — the form overlay for creating a Selectable value
// (a group + an option). Opened from the Dropdown values screen's "New value"
// button. Like every other create in the base it goes through the shared FormShell
// (Law R4: title/subtitle · separator · fields · separator · action) and persists a
// per-session draft (Law R7 · CACHING.md §11). The caller does the create + cache
// refresh; this owns the form + busy + error toast. Library primitives.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import {
  DialogDescription,
  DialogTitle,
} from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { Plus } from "lucide-react"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { ApiFailure } from "@/lib/api"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { useFormDraft } from "@shared/web/use-form-draft"

const groupField = { ...defaultFieldConfig, label: "Group", required: true }
const optionField = { ...defaultFieldConfig, label: "Option", required: true }

export function SelectableFormDialog({
  open,
  onOpenChange,
  types,
  onSubmit,
  draftKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Existing group names, offered as a pick-or-create datalist. */
  types: string[]
  onSubmit: (type: string, value: string) => Promise<void>
  /** Stable id for per-session draft persistence (CACHING.md §11); omit to disable. */
  draftKey?: string
}) {
  const [values, setValues, clearDraft] = useFormDraft(draftKey, { type: "", value: "" }, open)
  const [busy, setBusy] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!values.type.trim() || !values.value.trim()) return
    setBusy(true)
    try {
      await onSubmit(values.type.trim(), values.value.trim())
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't add that option.")
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
      title={<DialogTitle>New dropdown value</DialogTitle>}
      subtitle={
        <DialogDescription>
          Pick an existing group or start a new one, then add the option.
        </DialogDescription>
      }
      footer={
        <Button
          type="submit"
          disabled={busy || !values.type.trim() || !values.value.trim()}
          className="gap-1.5"
        >
          {busy ? <Spinner /> : <Plus className="size-4" />}
          {busy ? "Adding…" : "Add value"}
        </Button>
      }
    >
      <Field config={groupField} htmlFor="selectable-group" className={fieldSpacing}>
        <Input
          id="selectable-group"
          list="dropdown-types"
          value={values.type}
          onChange={(e) => setValues((v) => ({ ...v, type: e.target.value }))}
          placeholder="e.g. Ticket type"
          disabled={busy}
          autoFocus
        />
        <datalist id="dropdown-types">
          {types.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </Field>
      <Field config={optionField} htmlFor="selectable-value" className={fieldSpacing}>
        <Input
          id="selectable-value"
          value={values.value}
          onChange={(e) => setValues((v) => ({ ...v, value: e.target.value }))}
          placeholder="New option"
          disabled={busy}
        />
      </Field>
    </FormShellDialog>
  )
}
