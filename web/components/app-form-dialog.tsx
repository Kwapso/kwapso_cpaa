"use client"

// Record-an-app dialog — the system we built, the thing with its own address.
//
// The ACCOUNT is written once and never edited: moving an app to another client
// would silently republish its whole map, its savings and its conversation into
// somebody else's portal, so there is no move-app door and this is the only
// place it is decided.
//
// TWO FIELDS THIS FORM NO LONGER ASKS FOR, and the difference between them.
// The owner's ruling of 17 Aug 2026 took the ADDRESS off the form — an app's URL
// was one more thing to type at the moment somebody is trying to record that the
// app exists — and deferred WHAT IT COSTS US A MONTH to version two, in Aurora's
// own words: "it's a much more complex topic, not a single number".
//
// Both COLUMNS stay, and so do both values on this form's state. An app's monthly
// cost is an input to the agency's own margin (lib/internal-money.ts sums it),
// and a form that stopped asking for a number while still SENDING one would
// quietly zero every app it was used to edit. So `url` and `toolCostCentsPerMonth`
// ride through from `initial` untouched on an edit, and a newly recorded app
// simply starts without them.
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
import { Textarea } from "@kwapso/ui/registry/primitives/textarea/textarea"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { Pencil, Plus } from "lucide-react"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { ApiFailure } from "@/lib/api"
import { listFetch } from "@/lib/live-resources"
import { APP_STAGES, appStageMark } from "@shared/app-stages"
import { SELECTABLE_GROUPS } from "@shared/selectable-groups"
import type { SelectableValue } from "@shared/types"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { useCached } from "@shared/web/store"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

export type AppFormValues = {
  name: string
  accountId: string
  url: string
  stage: string
  /** whole cents a month — converted from the amount the form asks for */
  toolCostCentsPerMonth: number
  // THE FOUR CONTEXT FIELDS. They are on the form, not on a second "describe it"
  // screen, because the moment somebody records an app is the moment they know
  // the answers — a field asked for later is a field left empty.
  about: string
  clientContext: string
  solution: string
  keyActors: string
}

const nameField = { ...defaultFieldConfig, label: "What it's called", required: true }
const accountField = {
  ...defaultFieldConfig,
  label: "Whose system it is",
  required: false,
  hint: "Set once. Leave it blank for one of our own.",
}
const stageField = { ...defaultFieldConfig, label: "Stage", required: false, hint: "Where it has got to." }
const aboutField = { ...defaultFieldConfig, label: "About", required: false, hint: "What this system is, in a sentence or two." }
const contextField = {
  ...defaultFieldConfig,
  label: "Client context",
  required: false,
  hint: "The situation it was built into.",
}
const solutionField = { ...defaultFieldConfig, label: "Solution", required: false, hint: "What we did about it." }
const actorsField = {
  ...defaultFieldConfig,
  label: "Key actors",
  required: false,
  hint: "Who actually uses it, in their words.",
}

/** The team's App stage vocabulary, newest answer first: the rows somebody has
 * curated on the Dropdown values screen, and the eight the agency already uses
 * as the fallback while that read is in flight or a team has retired the lot.
 * The mark rides the label, never the stored value — a stage is its WORD, and
 * the pictograph is a mark in an icon slot (UI-CONVENTIONS §5). */
export function useAppStages(teamId: string): { value: string; mark: string }[] {
  const valuesQ = useCached<SelectableValue[]>(`selectable:${teamId}`, () => listFetch.selectable(teamId))
  const rows = (valuesQ.data ?? [])
    .filter((v) => v.active && v.type === SELECTABLE_GROUPS.appStage)
    .map((v) => ({ value: v.value, mark: v.mark ?? appStageMark(v.value) }))
  return rows.length > 0 ? rows : APP_STAGES.map((s) => ({ value: s.name, mark: s.mark }))
}

export function AppFormDialog({
  open,
  onOpenChange,
  accounts,
  initial,
  draftKey,
  onSubmit,
  teamId,
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
  /** the team, so the stage picker can read the team's own vocabulary */
  teamId: string
}) {
  const t = useT()
  const editing = initial !== undefined
  const stages = useAppStages(teamId)
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    initial
      ? {
          name: initial.name,
          accountId: initial.accountId,
          url: initial.url,
          stage: initial.stage,
          cost: initial.toolCostCentsPerMonth ? String(initial.toolCostCentsPerMonth / 100) : "",
          about: initial.about,
          clientContext: initial.clientContext,
          solution: initial.solution,
          keyActors: initial.keyActors,
        }
      : {
          name: "",
          accountId: "",
          url: "",
          stage: "",
          cost: "",
          about: "",
          clientContext: "",
          solution: "",
          keyActors: "",
        },
    open
  )
  const [busy, setBusy] = React.useState(false)
  const ready = values.name.trim() !== ""

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      // Whole units in, whole cents out. The form no longer ASKS for this, so on
      // a new app the amount is empty and lands as zero; on an edit it is the
      // app's existing cost, carried through the draft so saving a rename cannot
      // wipe a number nobody was shown.
      const amount = Number(values.cost.trim())
      await onSubmit({
        name: values.name.trim(),
        accountId: values.accountId,
        url: values.url.trim(),
        stage: values.stage.trim(),
        toolCostCentsPerMonth:
          values.cost.trim() !== "" && Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : 0,
        about: values.about.trim(),
        clientContext: values.clientContext.trim(),
        solution: values.solution.trim(),
        keyActors: values.keyActors.trim(),
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
            ? "Change what it's called, or where it has got to."
            : "A system we built for somebody. Process maps live inside one."}
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
      {/* STAGE IS A CHOICE, not a typed word. It was free text until 17 Aug 2026,
          which is how one inventory came to carry "live", "Live" and "in dev" for
          the same three systems. The mark rides the LABEL only. */}
      <Field config={stageField} htmlFor="app-stage" className={fieldSpacing}>
        <Select
          value={values.stage}
          onValueChange={(v) => setValues((s) => ({ ...s, stage: v }))}
          disabled={busy}
        >
          <SelectTrigger id="app-stage">
            <SelectValue placeholder={t("Not said")} />
          </SelectTrigger>
          <SelectContent>
            {stages.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.mark ? `${s.mark} ${t(s.value)}` : t(s.value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field config={aboutField} htmlFor="app-about" className={fieldSpacing}>
        <Textarea
          id="app-about"
          rows={3}
          value={values.about}
          onChange={(e) => setValues((s) => ({ ...s, about: e.target.value }))}
          placeholder={t("What this system does, and for whom.")}
          disabled={busy}
        />
      </Field>
      <Field config={contextField} htmlFor="app-client-context" className={fieldSpacing}>
        <Textarea
          id="app-client-context"
          rows={3}
          value={values.clientContext}
          onChange={(e) => setValues((s) => ({ ...s, clientContext: e.target.value }))}
          placeholder={t("How they were working before, and what it was costing them.")}
          disabled={busy}
        />
      </Field>
      <Field config={solutionField} htmlFor="app-solution" className={fieldSpacing}>
        <Textarea
          id="app-solution"
          rows={3}
          value={values.solution}
          onChange={(e) => setValues((s) => ({ ...s, solution: e.target.value }))}
          placeholder={t("What we built, and the decisions behind it.")}
          disabled={busy}
        />
      </Field>
      <Field config={actorsField} htmlFor="app-key-actors" className={fieldSpacing}>
        <Textarea
          id="app-key-actors"
          rows={2}
          value={values.keyActors}
          onChange={(e) => setValues((s) => ({ ...s, keyActors: e.target.value }))}
          placeholder={t("e.g. the two dispatchers, and whoever is on the counter")}
          disabled={busy}
        />
      </Field>
    </FormShellDialog>
  )
}
