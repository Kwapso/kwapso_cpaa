"use client"

// Record-an-app dialog — the system we built, the thing with its own address.
//
// Two fields on this form are worth a sentence each. The ACCOUNT is written once
// and never edited: moving an app to another client would silently republish its
// whole map, its savings and its conversation into somebody else's portal, so
// there is no move-app door and this is the only place it is decided. The
// MONTHLY COST is what the system costs US to keep running, and the form says so
// — it is one of the two figures a client never sees, under any flag.
//
// FormShell (R4) + a per-session draft (R7), like every other write.

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
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { Pencil, Plus } from "lucide-react"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { ApiFailure } from "@/lib/api"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

export type AppFormValues = {
  name: string
  accountId: string
  url: string
  stage: string
  /** whole cents a month — converted from the amount the form asks for */
  toolCostCentsPerMonth: number
}

const nameField = { ...defaultFieldConfig, label: "What it's called", required: true }
const accountField = {
  ...defaultFieldConfig,
  label: "Whose system it is",
  required: false,
  hint: "Set once. Leave it blank for one of our own.",
}
const urlField = { ...defaultFieldConfig, label: "Address", required: false }
const stageField = { ...defaultFieldConfig, label: "Stage", required: false }
const costField = {
  ...defaultFieldConfig,
  label: "What it costs us a month",
  required: false,
  hint: "Hosting and the services behind it. Ours alone — a client never sees this.",
}

export function AppFormDialog({
  open,
  onOpenChange,
  accounts,
  initial,
  draftKey,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: { id: string; name: string }[]
  /** Present = editing an existing app. The ACCOUNT picker disappears in that
   * mode rather than being disabled: whose system it is was decided once, there
   * is no door to change it, and a greyed-out control that can never be used is
   * a question the form should not be asking. */
  initial?: AppFormValues
  draftKey?: string
  onSubmit: (values: AppFormValues) => Promise<void>
}) {
  const t = useT()
  const editing = initial !== undefined
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    initial
      ? {
          name: initial.name,
          accountId: initial.accountId,
          url: initial.url,
          stage: initial.stage,
          cost: initial.toolCostCentsPerMonth ? String(initial.toolCostCentsPerMonth / 100) : "",
        }
      : { name: "", accountId: "", url: "", stage: "", cost: "" },
    open
  )
  const [busy, setBusy] = React.useState(false)
  const ready = values.name.trim() !== ""

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      // Whole units in, whole cents out — the same conversion the step form makes
      // between minutes and seconds, for the same reason: a person types what
      // they would say, and the arithmetic keeps the unit it can add up.
      const amount = Number(values.cost.trim())
      await onSubmit({
        name: values.name.trim(),
        accountId: values.accountId,
        url: values.url.trim(),
        stage: values.stage.trim(),
        toolCostCentsPerMonth:
          values.cost.trim() !== "" && Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : 0,
      })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't save the app.")
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
      title={<DialogTitle>{editing ? "Edit app" : "Record an app"}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {editing
            ? "Change what it's called, where it lives, or what it costs us."
            : "A system we built — the thing with its own address. Process maps live inside one."}
        </DialogDescription>
      }
      footer={
        <Button type="submit" disabled={busy || !ready} className="gap-1.5">
          {busy ? <Spinner /> : editing ? <Pencil className="size-4" /> : <Plus className="size-4" />}
          {busy ? "Saving…" : editing ? "Save changes" : "Record it"}
        </Button>
      }
    >
      <Field config={nameField} htmlFor="app-name" className={fieldSpacing}>
        <Input
          id="app-name"
          value={values.name}
          onChange={(e) => setValues((s) => ({ ...s, name: e.target.value }))}
          placeholder={t("e.g. Dispatch")}
          disabled={busy}
          autoFocus
        />
      </Field>
      {!editing && (
      <Field config={accountField} htmlFor="app-account" className={fieldSpacing}>
        <Select
          value={values.accountId}
          onValueChange={(v) => setValues((s) => ({ ...s, accountId: v }))}
          disabled={busy}
        >
          <SelectTrigger id="app-account">
            <SelectValue placeholder={t("One of ours")} />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      )}
      <Field config={urlField} htmlFor="app-url" className={fieldSpacing}>
        <Input
          id="app-url"
          value={values.url}
          onChange={(e) => setValues((s) => ({ ...s, url: e.target.value }))}
          placeholder="https://…"
          disabled={busy}
        />
      </Field>
      <Field config={stageField} htmlFor="app-stage" className={fieldSpacing}>
        <Input
          id="app-stage"
          value={values.stage}
          onChange={(e) => setValues((s) => ({ ...s, stage: e.target.value }))}
          placeholder={t("e.g. live")}
          disabled={busy}
        />
      </Field>
      <Field config={costField} htmlFor="app-cost" className={fieldSpacing}>
        <Input
          id="app-cost"
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          value={values.cost}
          onChange={(e) => setValues((s) => ({ ...s, cost: e.target.value }))}
          placeholder="0.00"
          disabled={busy}
        />
      </Field>
    </FormShellDialog>
  )
}
