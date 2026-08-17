"use client"

// Start-a-sprint dialog — a block of delivery work sold to one account — and the
// EDIT form for one (when `initial` is present). Through the shared FormShell
// (Law R4) with a per-session draft (Law R7).
//
// EDITING EXISTS BECAUSE OF THE PRICE. A sprint's flat price is the revenue half
// of every margin the app computes, and it could be typed only in the seconds
// between deciding to start a sprint and starting it — which is not when a price
// is usually agreed. So a sprint's own screen now opens this form again.
//
// In edit mode the CLIENT and the APP become sentences rather than pickers. The
// door refuses to move either (workers/content/src/lib/stories.ts updateSprint:
// the reference was minted against the account, and completing the sprint cuts a
// version of every process map inside the app), so offering the choice would be
// offering a refusal.
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
import { Pencil, Plus } from "lucide-react"
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

/** What an EDIT form opens with. Money arrives in whole cents (the shape the rest
 * of the app holds it in) and is shown in major units, the same conversion the
 * submit does in reverse. `accountName` / `appName` are what the two fixed rows
 * SAY — the ids are not offered at all, because they cannot be changed. */
export type SprintFormInitial = {
  name: string
  goal: string | null
  sprintType: string | null
  accountName: string | null
  appName: string | null
  startsOn: string | null
  endsOn: string | null
  soldPriceCents: number
  currency: string | null
}

export function SprintFormDialog({
  open,
  onOpenChange,
  apps,
  fixedApp,
  initial,
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
  /** Present = EDIT mode (prefilled; client and app shown, not offered). */
  initial?: SprintFormInitial
  draftKey?: string
  onSubmit: (values: SprintFormValues) => Promise<void>
}) {
  const isEdit = !!initial
  const teamId = useActiveTeam().ctx?.team?.id ?? null
  // Page one of the accounts list is plenty for a picker, and it is the SAME
  // cache the accounts screen holds.
  const accountsQ = useCached<Account[]>(teamId ? accountsKey(teamId) : null, () =>
    listFetch.accounts(teamId as string)
  )
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    {
      name: initial?.name ?? "",
      goal: initial?.goal ?? "",
      sprintType: initial?.sprintType ?? "",
      accountId: "",
      appId: "",
      startsOn: initial?.startsOn ?? "",
      endsOn: initial?.endsOn ?? "",
      // Whole cents → the major units a person types. Zero shows as an empty box
      // rather than "0": "not sold separately" is the absence of a price, and a
      // typed zero and a blank must mean the same thing on the way back out.
      price: initial?.soldPriceCents ? (initial.soldPriceCents / 100).toString() : "",
      currency: initial?.currency ?? "",
    },
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
      toast.error(
        err instanceof ApiFailure
          ? err.message
          : isEdit
            ? "Couldn't save the sprint."
            : "Couldn't start the sprint."
      )
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
      title={<DialogTitle>{isEdit ? "Edit this sprint" : "Start a sprint"}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {isEdit
            ? "What it's called, when it runs, and what it was sold for. The client and the app it covers stay as they are."
            : "A block of delivery work for one client, with a start, an end and a price."}
        </DialogDescription>
      }
      footer={
        <Button type="submit" disabled={busy || !ready} className="gap-1.5">
          {busy ? <Spinner /> : isEdit ? <Pencil className="size-4" /> : <Plus className="size-4" />}
          {busy ? "Saving…" : isEdit ? "Save changes" : "Start it"}
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
        {initial ? (
          <p className="text-muted-foreground text-sm" id="sprint-account">
            {initial.accountName || "Ours, no client"}
          </p>
        ) : (
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
        )}
      </Field>
      <Field config={appField} htmlFor="sprint-app" className={fieldSpacing}>
        {initial ? (
          <p className="text-muted-foreground text-sm" id="sprint-app">
            {initial.appName || "No app"}
          </p>
        ) : fixedApp ? (
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
