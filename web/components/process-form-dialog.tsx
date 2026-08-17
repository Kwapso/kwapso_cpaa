"use client"

// Map-a-process dialog — the form overlay for creating or renaming a process.
// Through the shared FormShell (Law R4) with a per-session draft (Law R7), like
// every other write in the base.
//
// THE BASELINE NAME IS ON THE CREATE FORM, and that is deliberate. A process is
// created together with its version 1 — the way the work was done before we
// touched anything — because a process with no baseline can never produce a
// saving and would report zero for ever while looking perfectly healthy. Asking
// for its name here is what makes that visible to the person doing it.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { DialogDescription, DialogTitle } from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kwapso/ui/registry/primitives/select/select"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { Textarea } from "@kwapso/ui/registry/primitives/textarea/textarea"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { Pencil, Plus } from "lucide-react"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { ApiFailure } from "@/lib/api"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

export type ProcessFormValues = {
  appId: string
  name: string
  description: string
  baselineLabel: string
}

const appField = { ...defaultFieldConfig, label: "App", required: true }
const nameField = { ...defaultFieldConfig, label: "Process name", required: true }
const descField = { ...defaultFieldConfig, label: "What it is", required: false }
const baselineField = {
  ...defaultFieldConfig,
  label: "Name for how it worked before",
  required: false,
  hint: "Version 1 is the way they worked before us. Every saving is measured from it.",
}

export function ProcessFormDialog({
  open,
  onOpenChange,
  apps,
  initial,
  draftKey,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The systems we've built — a process lives inside one. */
  apps: { id: string; name: string }[]
  /** Present = editing an existing map (the app and the baseline are settled). */
  initial?: { name: string; description: string }
  draftKey?: string
  onSubmit: (values: ProcessFormValues) => Promise<void>
}) {
  const t = useT()
  const editing = initial !== undefined
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    {
      appId: "",
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      baselineLabel: "",
    },
    open
  )
  const [busy, setBusy] = React.useState(false)

  const ready = values.name.trim() !== "" && (editing || values.appId !== "")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      await onSubmit({
        appId: values.appId,
        name: values.name.trim(),
        description: values.description.trim(),
        baselineLabel: values.baselineLabel.trim(),
      })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't save the process map.")
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
      title={<DialogTitle>{editing ? "Edit process" : "Map a process"}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {editing
            ? "Rename it or say more about what it covers."
            : "A way of working inside one of your apps. You'll add its steps next."}
        </DialogDescription>
      }
      footer={
        <Button type="submit" disabled={busy || !ready} className="gap-1.5">
          {busy ? <Spinner /> : editing ? <Pencil className="size-4" /> : <Plus className="size-4" />}
          {busy ? "Saving…" : editing ? "Save changes" : "Map it"}
        </Button>
      }
    >
      {!editing && (
        <Field config={appField} htmlFor="process-app" className={fieldSpacing}>
          <Select
            value={values.appId}
            onValueChange={(v) => setValues((s) => ({ ...s, appId: v }))}
            disabled={busy}
          >
            <SelectTrigger id="process-app">
              <SelectValue placeholder={t("Pick the app")} />
            </SelectTrigger>
            <SelectContent>
              {apps.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <Field config={nameField} htmlFor="process-name" className={fieldSpacing}>
        <Input
          id="process-name"
          value={values.name}
          onChange={(e) => setValues((s) => ({ ...s, name: e.target.value }))}
          placeholder={t("e.g. Approving a supplier invoice")}
          disabled={busy}
          autoFocus
        />
      </Field>
      <Field config={descField} htmlFor="process-description" className={fieldSpacing}>
        <Textarea
          id="process-description"
          value={values.description}
          onChange={(e) => setValues((s) => ({ ...s, description: e.target.value }))}
          placeholder={t("Who does it, when, and what it's for.")}
          disabled={busy}
          rows={3}
        />
      </Field>
      {!editing && (
        <Field config={baselineField} htmlFor="process-baseline" className={fieldSpacing}>
          <Input
            id="process-baseline"
            value={values.baselineLabel}
            onChange={(e) => setValues((s) => ({ ...s, baselineLabel: e.target.value }))}
            placeholder={t("How it worked before")}
            disabled={busy}
          />
        </Field>
      )}
    </FormShellDialog>
  )
}
