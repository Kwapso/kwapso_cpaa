"use client"

// A PIECE OF OUR OWN ADMIN — the quarterly VAT return, a domain renewal, next
// week's review. Nobody outside the agency ever sees one, which is why this form
// asks for nothing about a client and has no Send in it. Through the shared
// FormShell (Law R4) with a per-session draft (Law R7).

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { DialogDescription, DialogTitle } from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { Textarea } from "@kwapso/ui/registry/primitives/textarea/textarea"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { Plus } from "lucide-react"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { ApiFailure } from "@/lib/api"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

export type TaskFormValues = { title: string; detail: string; dueOn: string }

const titleField = { ...defaultFieldConfig, label: "What needs doing", required: true }
const detailField = { ...defaultFieldConfig, label: "Detail", required: false }
const dueField = { ...defaultFieldConfig, label: "By when", required: false }

export function TaskFormDialog({
  open,
  onOpenChange,
  draftKey,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  draftKey?: string
  onSubmit: (values: TaskFormValues) => Promise<void>
}) {
  const t = useT()
  const [values, setValues, clearDraft] = useFormDraft(draftKey, { title: "", detail: "", dueOn: "" }, open)
  const [busy, setBusy] = React.useState(false)
  const ready = values.title.trim() !== ""

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      await onSubmit({ title: values.title.trim(), detail: values.detail.trim(), dueOn: values.dueOn })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't add that task.")
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
      title={<DialogTitle>{t("New task")}</DialogTitle>}
      subtitle={<DialogDescription>{t("Our own admin. Time can be logged against it.")}</DialogDescription>}
      footer={
        <Button type="submit" disabled={busy || !ready} className="gap-1.5">
          {busy ? <Spinner /> : <Plus className="size-4" />}
          {busy ? "Saving…" : "Add it"}
        </Button>
      }
    >
      <Field config={titleField} htmlFor="task-title" className={fieldSpacing}>
        <Input
          id="task-title"
          value={values.title}
          onChange={(e) => setValues((s) => ({ ...s, title: e.target.value }))}
          placeholder={t("e.g. File the quarterly VAT return")}
          disabled={busy}
          autoFocus
        />
      </Field>
      <Field config={detailField} htmlFor="task-detail" className={fieldSpacing}>
        <Textarea
          id="task-detail"
          value={values.detail}
          onChange={(e) => setValues((s) => ({ ...s, detail: e.target.value }))}
          disabled={busy}
          rows={2}
        />
      </Field>
      <Field config={dueField} htmlFor="task-due" className={fieldSpacing}>
        <Input
          id="task-due"
          type="date"
          value={values.dueOn}
          onChange={(e) => setValues((s) => ({ ...s, dueOn: e.target.value }))}
          disabled={busy}
        />
      </Field>
    </FormShellDialog>
  )
}
