"use client"

// Start-a-sprint dialog — a block of delivery work sold to one account. Through
// the shared FormShell (Law R4) with a per-session draft (Law R7).
//
// THE PRICE IS TYPED IN WHOLE UNITS AND SENT IN CENTS, converted once, here. Every
// money column in this database is an integer number of cents on purpose (a float
// price loses a half-penny somewhere between a form and a margin), and the person
// filling this in thinks in euros. One of those two facts has to bend, and it is
// not going to be the database.

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
import { Plus } from "lucide-react"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { ApiFailure } from "@/lib/api"
import { accountsKey, listFetch } from "@/lib/live-resources"
import { useActiveTeam } from "@/lib/use-active-team"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useCached } from "@shared/web/store"
import type { Account } from "@shared/types"

export type SprintFormValues = {
  name: string
  goal: string
  sprintType: string
  accountId: string
  /** THE SYSTEM IT COVERS. A sprint covers ONE app (the owner's ruling), which is
   * what lets the app's own screen show the blocks of work sold against it. */
  appId: string
  startsOn: string
  endsOn: string
  /** whole cents — converted from the major units the form collects */
  soldPriceCents: number
  currency: string
}

/** "Nothing chosen" as a real Select value — an empty string is not selectable. */
const NONE = "__none__"

/** The three SCOPE names. A "blueprint" is a PRICED PLANNING sprint, not a fourth
 * type (.plans/BUILD-1 §3), so it is a price on a Planning row and not an option
 * here. The vocabulary is editable on the Dropdown values screen; these are the
 * ones every team starts with, which is what a form should offer before anybody
 * has been to that screen. */
const SPRINT_TYPES = ["Planning", "Implementation", "Iteration"]

const nameField = { ...defaultFieldConfig, label: "Sprint name", required: true }
const typeField = { ...defaultFieldConfig, label: "Kind", required: false }
const accountField = { ...defaultFieldConfig, label: "Client", required: false }
const appField = {
  ...defaultFieldConfig,
  label: "App",
  required: false,
  hint: "The system this block of work covers.",
}
const goalField = { ...defaultFieldConfig, label: "What it's for", required: false }
const startField = { ...defaultFieldConfig, label: "Starts", required: false }
const endField = { ...defaultFieldConfig, label: "Ends", required: false }
const priceField = {
  ...defaultFieldConfig,
  label: "Price sold",
  required: false,
  hint: "The flat price for this block of work. Leave it at zero if it isn't sold separately.",
}

export function SprintFormDialog({
  open,
  onOpenChange,
  apps,
  fixedApp,
  draftKey,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  apps: { id: string; name: string }[]
  /** Set when the form is opened FROM an app's own screen — the app is then a
   * fact about where you are standing rather than a question, so the picker is
   * replaced by the app's name and the value cannot be changed by accident. */
  fixedApp?: { id: string; name: string }
  draftKey?: string
  onSubmit: (values: SprintFormValues) => Promise<void>
}) {
  const teamId = useActiveTeam().ctx?.team?.id ?? null
  // Page one of the accounts list is plenty for a picker, and it is the SAME
  // cache the accounts screen holds.
  const accountsQ = useCached<Account[]>(teamId ? accountsKey(teamId) : null, () =>
    listFetch.accounts(teamId as string)
  )
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    { name: "", goal: "", sprintType: "", accountId: "", appId: "", startsOn: "", endsOn: "", price: "", currency: "" },
    open
  )
  const [busy, setBusy] = React.useState(false)
  const ready = values.name.trim() !== ""

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    // Major units → whole cents, rounded rather than truncated so 49.99 is 4999
    // and not 4998. A blank price is zero, not NaN.
    const major = Number(values.price.trim().replace(",", "."))
    const cents = Number.isFinite(major) && major > 0 ? Math.round(major * 100) : 0
    setBusy(true)
    try {
      await onSubmit({
        name: values.name.trim(),
        goal: values.goal.trim(),
        sprintType: values.sprintType,
        accountId: values.accountId,
        appId: fixedApp ? fixedApp.id : values.appId,
        startsOn: values.startsOn,
        endsOn: values.endsOn,
        soldPriceCents: cents,
        currency: values.currency.trim(),
      })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't start the sprint.")
    } finally {
      setBusy(false)
    }
  }

  const companies = (accountsQ.data ?? []).filter((a) => a.active && a.accountType === "entity")

  return (
    <FormShellDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      clearDraft={clearDraft}
      onSubmit={submit}
      title={<DialogTitle>Start a sprint</DialogTitle>}
      subtitle={
        <DialogDescription>
          A block of delivery work for one client, with a start, an end and a price.
        </DialogDescription>
      }
      footer={
        <Button type="submit" disabled={busy || !ready} className="gap-1.5">
          {busy ? <Spinner /> : <Plus className="size-4" />}
          {busy ? "Saving…" : "Start it"}
        </Button>
      }
    >
      <Field config={nameField} htmlFor="sprint-name" className={fieldSpacing}>
        <Input
          id="sprint-name"
          value={values.name}
          onChange={(e) => setValues((s) => ({ ...s, name: e.target.value }))}
          placeholder="e.g. Dispatch, sprint 4"
          disabled={busy}
          autoFocus
        />
      </Field>
      <Field config={typeField} htmlFor="sprint-type" className={fieldSpacing}>
        <Select
          value={values.sprintType || NONE}
          onValueChange={(v) => setValues((s) => ({ ...s, sprintType: v === NONE ? "" : v }))}
          disabled={busy}
        >
          <SelectTrigger id="sprint-type">
            <SelectValue placeholder="Not said" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Not said</SelectItem>
            {SPRINT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field config={accountField} htmlFor="sprint-account" className={fieldSpacing}>
        <Select
          value={values.accountId || NONE}
          onValueChange={(v) => setValues((s) => ({ ...s, accountId: v === NONE ? "" : v }))}
          disabled={busy}
        >
          <SelectTrigger id="sprint-account">
            <SelectValue placeholder="Ours, no client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Ours, no client</SelectItem>
            {companies.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field config={appField} htmlFor="sprint-app" className={fieldSpacing}>
        {fixedApp ? (
          <p className="text-muted-foreground text-sm" id="sprint-app">
            {fixedApp.name}
          </p>
        ) : (
          <Select
            value={values.appId || NONE}
            onValueChange={(v) => setValues((s) => ({ ...s, appId: v === NONE ? "" : v }))}
            disabled={busy}
          >
            <SelectTrigger id="sprint-app">
              <SelectValue placeholder="No app yet" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No app yet</SelectItem>
              {apps.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field config={goalField} htmlFor="sprint-goal" className={fieldSpacing}>
        <Textarea
          id="sprint-goal"
          value={values.goal}
          onChange={(e) => setValues((s) => ({ ...s, goal: e.target.value }))}
          placeholder="What this block of work is meant to achieve."
          disabled={busy}
          rows={2}
        />
      </Field>
      <Field config={startField} htmlFor="sprint-start" className={fieldSpacing}>
        <Input
          id="sprint-start"
          type="date"
          value={values.startsOn}
          onChange={(e) => setValues((s) => ({ ...s, startsOn: e.target.value }))}
          disabled={busy}
        />
      </Field>
      <Field config={endField} htmlFor="sprint-end" className={fieldSpacing}>
        <Input
          id="sprint-end"
          type="date"
          value={values.endsOn}
          onChange={(e) => setValues((s) => ({ ...s, endsOn: e.target.value }))}
          disabled={busy}
        />
      </Field>
      <Field config={priceField} htmlFor="sprint-price" className={fieldSpacing}>
        <Input
          id="sprint-price"
          inputMode="decimal"
          value={values.price}
          onChange={(e) => setValues((s) => ({ ...s, price: e.target.value }))}
          placeholder="e.g. 4500"
          disabled={busy}
        />
      </Field>
    </FormShellDialog>
  )
}
