"use client"

// ONE FORM FOR A RATE — a kind of work, what it costs an hour, in what currency.
//
// IT IS SHARED BY BOTH RATE CARDS, AND THAT IS SAFE PRECISELY BECAUSE IT KNOWS
// NOTHING. Law R24 keeps the agency's own cost away from a client login
// STRUCTURALLY — by which files can reach `internal-money.ts` — and this file
// reaches nothing: no door, no table, no cache key. It takes three strings and
// hands them back. The two CARDS are two files calling two different door sets
// (account-rate-card.tsx → /api/tenancy/rates, internal-rate-card.tsx →
// /api/tenancy/internal-rates), which is where the separation the law is about
// actually lives.
//
// What would make sharing it wrong, said plainly so the next person can check:
// the day this form fetches anything, names a door, or renders a figure computed
// FROM a rate (a margin, a total), it stops being a form and becomes a screen —
// and the two screens must stay two files. Until then, one label-and-a-number
// form written twice would just be two drafts rules that drift apart.
//
// The DEFAULT switch is the internal card's alone (`showDefault`), because only
// an internal rate answers "which rate applies to an hour nobody labelled" —
// there is no such question about what a client is charged.
//
// Library primitives, FormShell, per-session draft (R4 + R7).

import * as React from "react"

import { DialogDescription, DialogTitle } from "@shared/ui/controls/dialog/dialog"
import { Field } from "@shared/web/field"
import { Input } from "@shared/ui/controls/input/input"
import { Switch } from "@shared/ui/controls/switch/switch"
import { toast } from "@shared/ui/controls/sonner/sonner"
import { defaultFieldConfig } from "@shared/web/screen-engine/config"

import { ApiFailure } from "@/lib/api"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

/** What the form hands back. Cents, never a float: money in floats is how a
 * total disagrees with the sum of its own rows (the worker says the same thing
 * about the same numbers, in lib/internal-money.ts). */
export type RateFormValues = {
  label: string
  centsPerHour: number
  currency: string
  isDefault: boolean
}

const labelField = {
  ...defaultFieldConfig,
  label: "Kind of work",
  required: true,
  hint: "One rate per kind of work.",
}
const amountField = { ...defaultFieldConfig, label: "Rate an hour", required: true }
const currencyField = { ...defaultFieldConfig, label: "Currency", required: false }
const defaultField = {
  ...defaultFieldConfig,
  label: "Use this when the kind of work isn't named",
  required: false,
  hint: "Only one rate can be the fallback.",
}

export function RateFormDialog({
  open,
  onOpenChange,
  onSubmit,
  draftKey,
  title,
  subtitle,
  initial,
  showDefault = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: RateFormValues) => Promise<void>
  /** stable id for per-session draft persistence (R7 · CACHING.md §11) */
  draftKey?: string
  title: string
  subtitle: string
  /** present = EDIT mode (prefilled); absent = add mode */
  initial?: { label: string; centsPerHour: number; currency: string | null; isDefault?: boolean }
  /** the internal card's fallback switch — see the note at the top of the file */
  showDefault?: boolean
}) {
  const t = useT()
  // MAJOR UNITS IN THE BOX, CENTS ON THE WIRE. A person types what they would
  // say out loud; the arithmetic keeps the unit it can add up. Same trade the
  // sprint's price and an app's tool cost already make.
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    {
      label: initial?.label ?? "",
      amount: initial ? String(initial.centsPerHour / 100) : "",
      currency: initial?.currency ?? "",
      isDefault: initial?.isDefault ?? false,
    },
    open
  )
  const [busy, setBusy] = React.useState(false)

  const major = Number(values.amount.trim().replace(",", "."))
  const amountOk = values.amount.trim() !== "" && Number.isFinite(major) && major >= 0
  const ready = values.label.trim() !== "" && amountOk

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      await onSubmit({
        label: values.label.trim(),
        // Rounded rather than truncated, so 62.55 is 6255 and not 6254.
        centsPerHour: Math.round(major * 100),
        currency: values.currency.trim(),
        isDefault: showDefault && values.isDefault,
      })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't save that rate."))
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
      title={<DialogTitle>{title}</DialogTitle>}
      subtitle={<DialogDescription>{subtitle}</DialogDescription>}
      submit={{
        busy: busy,
        disabled: !ready,
      }}
    >
      <Field config={labelField} htmlFor="rate-label" className={fieldSpacing}>
        <Input
          id="rate-label"
          value={values.label}
          onChange={(e) => setValues((v) => ({ ...v, label: e.target.value }))}
          placeholder={t("Development, design, project management…")}
          disabled={busy}
          autoFocus
        />
      </Field>
      {/* Stacked on a phone, side by side from sm: — a rate and its currency are
          two narrow controls, and three characters of currency in a box shared
          with a price is a box showing neither (UI-CONVENTIONS §4). */}
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-2">
        <Field config={amountField} htmlFor="rate-amount" className={`${fieldSpacing} w-full`}>
          <Input
            id="rate-amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={values.amount}
            onChange={(e) => setValues((v) => ({ ...v, amount: e.target.value }))}
            placeholder="120.00"
            disabled={busy}
          />
        </Field>
        <Field config={currencyField} htmlFor="rate-currency" className={`${fieldSpacing} w-full`}>
          <Input
            id="rate-currency"
            value={values.currency}
            onChange={(e) => setValues((v) => ({ ...v, currency: e.target.value }))}
            placeholder={t("EUR")}
            disabled={busy}
          />
        </Field>
      </div>
      {showDefault && (
        <Field config={defaultField} htmlFor="rate-default" className={fieldSpacing}>
          <Switch
            id="rate-default"
            checked={values.isDefault}
            onCheckedChange={(v: boolean) => setValues((s) => ({ ...s, isDefault: v }))}
            disabled={busy}
          />
        </Field>
      )}
    </FormShellDialog>
  )
}
