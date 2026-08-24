"use client"

// Role form dialog — create a new role OR edit a role's name + description.
// `initial` present = edit mode. Permissions are edited in the matrix, not here.
// Library primitives.

import * as React from "react"

import {
  DialogDescription,
  DialogTitle,
} from "@shared/ui/controls/dialog/dialog"
import { Field } from "@shared/web/field"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { Input } from "@shared/ui/controls/input/input"
import { Textarea } from "@shared/ui/controls/textarea/textarea"
import { toast } from "@shared/ui/controls/sonner/sonner"
import { defaultFieldConfig } from "@shared/web/screen-engine/config"

import { ApiFailure } from "@/lib/api"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

const titleField = { ...defaultFieldConfig, label: "Role name", required: true }
const descField = { ...defaultFieldConfig, label: "Description", required: false }

export function RoleFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
  draftKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** present = edit mode (prefilled); absent = create mode */
  initial?: { title: string; description: string } | null
  onSubmit: (title: string, description: string) => Promise<void>
  /** stable id for per-session draft persistence (CACHING.md §11); omit to disable */
  draftKey?: string
}) {
  const t = useT()
  const isEdit = !!initial
  const initialValues = {
    title: initial?.title ?? "",
    description: initial?.description ?? "",
  }
  // Per-session draft: restores what you typed if you navigate away and reopen.
  const [values, setValues, clearDraft] = useFormDraft(draftKey, initialValues, open)
  const [busy, setBusy] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await onSubmit(values.title.trim(), values.description.trim())
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof ApiFailure ? err.message : t("Couldn't save the role.")
      )
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
      title={<DialogTitle>{isEdit ? t("Edit this role") : t("Create a role")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {isEdit
            ? t("Rename it or update what it's for. You set what it can do over in the grid.")
            : t("It starts with no access, you'll choose what it can do in the next step.")}
        </DialogDescription>
      }
      submit={{
        busy: busy,
        disabled: !values.title.trim(),
      }}
    >
      <Field config={titleField} htmlFor="role-title" className={fieldSpacing}>
        <Input
          id="role-title"
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          placeholder={t("Editor")}
          disabled={busy}
          autoFocus
        />
      </Field>
      <Field config={descField} htmlFor="role-desc" className={fieldSpacing}>
        <Textarea
          id="role-desc"
          value={values.description}
          onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
          placeholder={t("What this role is for (optional).")}
          disabled={busy}
          rows={3}
        />
      </Field>
    </FormShellDialog>
  )
}
