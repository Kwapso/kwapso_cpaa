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

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { DialogDescription, DialogTitle } from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@shared/web/field"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kwapso/ui/registry/primitives/select/select"
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
  /** WHO DOES IT — one of the client's own roles, or null for nobody named. */
  roleId: string | null
  /** WHAT IT IS DONE IN — the whole set, every time (the door replaces it). */
  toolIds: string[]
}

/** The client's own roles and tools, as this form needs them: a name, and
 * whether an hour of the role has a price on it yet. */
export type StepRoleOption = { id: string; name: string; centsPerHour: number | null }
export type StepToolOption = { id: string; name: string }

/** NOBODY NAMED, as a value the picker can hold. A Select cannot carry `null`,
 * and an empty string is how it says "cleared" — so the sentinel is written once
 * rather than spelled differently at each end. */
const NO_ROLE = "__none__"

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
const roleField = {
  ...defaultFieldConfig,
  label: "Who does it",
  required: false,
  hint: "Their role, and what an hour of it costs them, is what turns these minutes into money.",
}
const toolsField = {
  ...defaultFieldConfig,
  label: "What it is done in",
  required: false,
}

export function StepFormDialog({
  open,
  onOpenChange,
  versionLabel,
  initial,
  roles = [],
  tools = [],
  draftKey,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** which version this lands in — a step is always added to the current one */
  versionLabel: string
  initial?: {
    name: string
    description: string
    secondsPerRun: number
    runsPerMonth: number
    roleId: string | null
    toolIds: string[]
  }
  /** The client's live roles. Empty when the map has no client filed against it
   * — the picker then says so rather than offering an empty list. */
  roles?: StepRoleOption[]
  tools?: StepToolOption[]
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
      roleId: initial?.roleId ?? NO_ROLE,
      // Joined, because a draft is stored as flat strings — an array would come
      // back from the draft store as "[object Object]" the first time somebody
      // reopened a half-typed step.
      toolIds: (initial?.toolIds ?? []).join(","),
    },
    open
  )
  const chosenTools = values.toolIds ? values.toolIds.split(",").filter(Boolean) : []
  const toggleTool = (id: string) =>
    setValues((s) => {
      const on = s.toolIds ? s.toolIds.split(",").filter(Boolean) : []
      const next = on.includes(id) ? on.filter((x) => x !== id) : [...on, id]
      return { ...s, toolIds: next.join(",") }
    })
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
        roleId: values.roleId === NO_ROLE ? null : values.roleId,
        toolIds: chosenTools,
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
      {/* WHO DOES IT. Optional on purpose: you map a process in the room, before
          anybody has looked up who is on which desk, and a form that refused to
          save without it would stop the session this whole module exists for. A
          role with no hourly cost yet says so beside its name, so the person
          typing knows why the money will read as incomplete. */}
      {roles.length > 0 ? (
        <Field config={roleField} htmlFor="step-role" className={fieldSpacing}>
          <Select
            value={values.roleId}
            onValueChange={(v) => setValues((s) => ({ ...s, roleId: v }))}
            disabled={busy}
          >
            <SelectTrigger id="step-role">
              <SelectValue placeholder={t("Nobody named yet")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ROLE}>{t("Nobody named yet")}</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                  {r.centsPerHour === null ? ` — ${t("no hourly cost yet")}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      {/* WHAT IT IS DONE IN — several, because a step usually is: open the
          spreadsheet, copy it into the portal, send the email. Chips rather than
          a multi-select, the same shape the client's own roles use one screen
          over, so the set is readable without opening anything. */}
      {tools.length > 0 ? (
        <Field config={toolsField} htmlFor="step-tools" className={fieldSpacing}>
          <div id="step-tools" className="flex flex-wrap items-center gap-1">
            {tools.map((x) => {
              const on = chosenTools.includes(x.id)
              return (
                <Button
                  key={x.id}
                  type="button"
                  size="sm"
                  variant={on ? "secondary" : "ghost"}
                  disabled={busy}
                  className="h-7 rounded-full px-3 text-xs"
                  onClick={() => toggleTool(x.id)}
                  aria-pressed={on}
                >
                  {x.name}
                </Button>
              )
            })}
          </div>
        </Field>
      ) : null}
    </FormShellDialog>
  )
}
