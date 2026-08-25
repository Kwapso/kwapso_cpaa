"use client"

// SELL A WAVE — the form overlay for recording a package a client bought, or
// re-wording one. Through the shared FormShell (R4) with a per-session draft
// (R7), like every other write in the base.
//
// TWO FIELDS AND NO THIRD, and each absence is a ruling rather than an omission:
//
//   • NO PRICE. The owner took the money out of the first version four separate
//     times — "leave the whole internal_rates and account_rates out of V1… This
//     is a fix decision" — and there is no price column on `waves` for a field
//     here to write to. A form that asked would be asking for something no door
//     accepts.
//
//   • NO KIND. "A wave consists of multiple sprints. Sprints consist of multiple
//     stories… It makes no sense to label a wave as a particular kind. A wave is
//     a wave."
//
//   • NO DATES. They are the sprints' answer (the wave's own screen recalculates
//     them whenever a sprint is added, moved or removed), so a pair of date
//     inputs here would let somebody type a wave into disagreeing with the work
//     inside it — and the disagreement would look exactly like a fact.

import * as React from "react"

import { DialogDescription, DialogTitle } from "@shared/ui/controls/dialog/dialog"
import { Field } from "@shared/web/field"
import { Input } from "@shared/ui/controls/input/input"
import { Notes } from "@shared/web/notes-editor/notes-editor"
import { toast } from "@shared/ui/controls/sonner/sonner"
import { defaultFieldConfig } from "@shared/web/screen-engine/config"

import { ApiFailure } from "@/lib/api"
import { RecordPicker } from "@/components/record-picker"
import { asOption, type PickableRecord } from "@/lib/pickable"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { richTextValue } from "@shared/web/rich-text"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

export type WaveFormValues = {
  accountId: string
  name: string
  goal: string
}

// The words on these three reach the screen through `shared/web/field.tsx`,
// which translates a field config's own `label` and `helpText` on the way (R33):
// `t` is a hook and a field config is a module-level constant, so this is the one
// class of string in the app that cannot be wrapped where it is declared.
const clientField = { ...defaultFieldConfig, label: "Client", required: true }
const nameField = { ...defaultFieldConfig, label: "Wave name", required: true }
const goalField = {
  ...defaultFieldConfig,
  label: "What the package is for",
  required: false,
  helpText: "What they bought, in the words you would say it in. The dates come from the sprints.",
}

export function WaveFormDialog({
  open,
  onOpenChange,
  clients,
  fixedClient,
  initial,
  draftKey,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The clients a wave can be sold to. Carries each one's face (R35). */
  clients: PickableRecord[]
  /** Opened FROM a client's record, so whose it is is a fact rather than a
   * question — the picker disappears and a sentence takes its place, the same
   * shape the sprint and process forms already use. */
  fixedClient?: { id: string; name: string }
  /** Present = editing an existing wave (whose it is, is settled). */
  initial?: { name: string; goal: string }
  draftKey?: string
  onSubmit: (values: WaveFormValues) => Promise<void>
}) {
  const t = useT()
  const editing = initial !== undefined
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    {
      accountId: fixedClient?.id ?? "",
      name: initial?.name ?? "",
      goal: initial?.goal ?? "",
    },
    open
  )
  const [busy, setBusy] = React.useState(false)

  const ready = values.name.trim() !== "" && (editing || values.accountId !== "")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      await onSubmit({
        accountId: values.accountId,
        name: values.name.trim(),
        goal: richTextValue(values.goal),
      })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't save the wave."))
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
      title={<DialogTitle>{editing ? t("Edit wave") : t("Sell a wave")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {editing
            ? t("Rename it, or say more about what the package covers.")
            : t("A package of sprints a client bought. You'll plan the sprints inside it next.")}
        </DialogDescription>
      }
      submit={{ busy: busy, disabled: !ready }}
    >
      {!editing && fixedClient && (
        <p className="text-muted-foreground text-sm">
          {t("For")} <span className="text-foreground font-medium">{fixedClient.name}</span>
        </p>
      )}
      {!editing && !fixedClient && (
        <Field config={clientField} htmlFor="wave-client" className={fieldSpacing}>
          <RecordPicker
            id="wave-client"
            value={values.accountId}
            onChange={(v) => setValues((s) => ({ ...s, accountId: v }))}
            options={clients.map(asOption)}
            placeholder={t("Pick the client")}
            searchPlaceholder={t("Search clients…")}
            emptyText={t("No client matched.")}
            disabled={busy}
          />
        </Field>
      )}
      <Field config={nameField} htmlFor="wave-name" className={fieldSpacing}>
        <Input
          id="wave-name"
          value={values.name}
          onChange={(e) => setValues((s) => ({ ...s, name: e.target.value }))}
          placeholder={t("e.g. Onboarding package")}
          disabled={busy}
          autoFocus
        />
      </Field>
      <Field config={goalField} htmlFor="wave-goal" className={fieldSpacing}>
        <Notes
          key={open ? "open" : "shut"}
          defaultValue={values.goal}
          onChange={(html) => setValues((s) => ({ ...s, goal: html }))}
          placeholder={t("Map the processes, build two automations, test, train.")}
          className="min-h-32"
        />
      </Field>
    </FormShellDialog>
  )
}
