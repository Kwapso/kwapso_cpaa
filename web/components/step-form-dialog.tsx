"use client"

// Add-or-edit-a-step dialog — the two numbers every savings figure in the app is
// built from, and the one form that collects them.
//
// THEY ARE ASKED FOR IN MINUTES, and stored in whole seconds. Nobody says "a
// step takes 2,400 seconds"; they say forty minutes. The conversion happens
// here, once, on the way in and on the way out, so the person types what they
// would say out loud and the arithmetic keeps the unit it can add up without
// rounding drift.
//
// The form says plainly what the number IS: an estimate the two of you agreed,
// not a measurement. That is the same sentence the client reads under the
// savings figure (R25), and it belongs on the form that produces it — a person
// typing "40" should know it will be quoted back to a client.
//
// FormShell (R4) + a per-session draft (R7), like every other write.

import * as React from "react"

import { DialogDescription, DialogTitle } from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@shared/web/field"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Notes } from "@kwapso/ui/registry/primitives/notes/notes"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { ApiFailure } from "@/lib/api"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { richTextValue } from "@shared/web/rich-text"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

export type StepFormValues = {
  name: string
  description: string
  /** whole seconds — converted from the minutes the form asks for */
  secondsPerRun: number
  runsPerMonth: number
}

const nameField = { ...defaultFieldConfig, label: "Step", required: true }
const descField = { ...defaultFieldConfig, label: "What happens in it", required: false }
const minutesField = {
  ...defaultFieldConfig,
  label: "Minutes it takes, each time",
  required: true,
  hint: "The time you agreed with them, not a measurement.",
}
const runsField = {
  ...defaultFieldConfig,
  label: "Times a month it happens",
  required: true,
}

export function StepFormDialog({
  open,
  onOpenChange,
  versionLabel,
  initial,
  draftKey,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** which version this lands in — a step is always added to the current one */
  versionLabel: string
  initial?: { name: string; description: string; secondsPerRun: number; runsPerMonth: number }
  draftKey?: string
  onSubmit: (values: StepFormValues) => Promise<void>
}) {
  const t = useT()
  const editing = initial !== undefined
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    {
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      minutes: initial ? String(Math.round(initial.secondsPerRun / 60)) : "",
      runs: initial ? String(initial.runsPerMonth) : "",
    },
    open
  )
  const [busy, setBusy] = React.useState(false)

  /** A whole, non-negative number, or null. The door refuses anything else with
   * a plain sentence (R20); this stops the button before it gets there. */
  const whole = (raw: string): number | null => {
    const n = Number(raw.trim())
    return raw.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
  }
  const minutes = whole(values.minutes)
  const runs = whole(values.runs)
  const ready = values.name.trim() !== "" && minutes !== null && runs !== null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || minutes === null || runs === null) return
    setBusy(true)
    try {
      await onSubmit({
        name: values.name.trim(),
        description: richTextValue(values.description),
        secondsPerRun: minutes * 60,
        runsPerMonth: runs,
      })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't save the step."))
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
      title={<DialogTitle>{editing ? t("Edit step") : t("Add a step")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {t("It goes into")} {versionLabel}. Older versions stay exactly as they were agreed.
        </DialogDescription>
      }
      submit={{
        busy: busy,
        disabled: !ready,
      }}
    >
      <Field config={nameField} htmlFor="step-name" className={fieldSpacing}>
        <Input
          id="step-name"
          value={values.name}
          onChange={(e) => setValues((s) => ({ ...s, name: e.target.value }))}
          placeholder={t("e.g. Check the invoice against the order")}
          disabled={busy}
          autoFocus
        />
      </Field>
      <Field config={descField} htmlFor="step-description" className={fieldSpacing}>
        <Notes
          key={open ? "open" : "shut"}
          defaultValue={values.description}
          onChange={(html) => setValues((s) => ({ ...s, description: html }))}
          placeholder={t("Anything worth remembering about how it's done.")}
          className="min-h-32"
        />
      </Field>
      <Field config={minutesField} htmlFor="step-minutes" className={fieldSpacing}>
        <Input
          id="step-minutes"
          type="number"
          min={0}
          inputMode="numeric"
          value={values.minutes}
          onChange={(e) => setValues((s) => ({ ...s, minutes: e.target.value }))}
          placeholder="40"
          disabled={busy}
        />
      </Field>
      <Field config={runsField} htmlFor="step-runs" className={fieldSpacing}>
        <Input
          id="step-runs"
          type="number"
          min={0}
          inputMode="numeric"
          value={values.runs}
          onChange={(e) => setValues((s) => ({ ...s, runs: e.target.value }))}
          placeholder="20"
          disabled={busy}
        />
      </Field>
    </FormShellDialog>
  )
}
