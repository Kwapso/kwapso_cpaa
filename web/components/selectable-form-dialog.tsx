"use client"

// Add-a-dropdown-value dialog — the form overlay for creating a Selectable value
// (a group + a value). Opened from the Dropdown values screen's "New value"
// button. Like every other create in the base it goes through the shared FormShell
// (Law R4: title/subtitle · separator · fields · separator · action) and persists a
// per-session draft (Law R7 · CACHING.md §11). The caller does the create + cache
// refresh; this owns the form + busy + error toast. Library primitives.

import * as React from "react"

import {
  DialogDescription,
  DialogTitle,
} from "@shared/ui/controls/dialog/dialog"
import { Field } from "@shared/web/field"
import { Input } from "@shared/ui/controls/input/input"
import { toast } from "@shared/ui/controls/sonner/sonner"
import { Plus } from "@shared/ui/icons"
import { defaultFieldConfig } from "@shared/web/screen-engine/config"

import { ApiFailure } from "@/lib/api"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

const groupField = { ...defaultFieldConfig, label: "Group", required: true }
const optionField = { ...defaultFieldConfig, label: "Value", required: true }
/** THE TYPE MARK (CHECKLIST 11.8, UI-RULEBOOK G2). One glyph, set HERE rather
 * than written into a component, which is the fourth condition UI-CONVENTIONS §5
 * puts on a type mark. Optional on purpose: most groups are plain labels, and a
 * missing glyph costs nothing because the word is always beside it. */
const markField = {
  ...defaultFieldConfig,
  label: "Emoji",
  required: false,
  hint: "One emoji shown beside this word, wherever the type appears. Leave it empty for a plain label.",
}

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
  onSubmit: (type: string, value: string, mark: string) => Promise<void>
  /** Stable id for per-session draft persistence (CACHING.md §11); omit to disable. */
  draftKey?: string
}) {
  const t = useT()
  const [values, setValues, clearDraft] = useFormDraft(draftKey, { type: "", value: "", mark: "" }, open)
  const [busy, setBusy] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!values.type.trim() || !values.value.trim()) return
    setBusy(true)
    try {
      await onSubmit(values.type.trim(), values.value.trim(), values.mark.trim())
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't add that value."))
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
      title={<DialogTitle>{t("New dropdown value")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {t("Pick an existing group or start a new one, then add the value.")}
        </DialogDescription>
      }
      submit={{
        busy,
        disabled: !values.type.trim() || !values.value.trim(),
        icon: <Plus className="size-4" />,
      }}
    >
      <Field config={groupField} htmlFor="selectable-group" className={fieldSpacing}>
        <Input
          id="selectable-group"
          list="dropdown-types"
          value={values.type}
          onChange={(e) => setValues((v) => ({ ...v, type: e.target.value }))}
          placeholder={t("e.g. Ticket type")}
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
          placeholder={t("e.g. Question")}
          disabled={busy}
        />
      </Field>
      <Field config={markField} htmlFor="selectable-mark" className={fieldSpacing}>
        <Input
          id="selectable-mark"
          value={values.mark}
          onChange={(e) => setValues((v) => ({ ...v, mark: e.target.value }))}
          placeholder={t("e.g. a question mark")}
          disabled={busy}
        />
      </Field>
    </FormShellDialog>
  )
}
