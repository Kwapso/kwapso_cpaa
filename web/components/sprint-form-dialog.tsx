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

import { DatePicker } from "@shared/ui/components/date-picker/date-picker"
import { DialogDescription, DialogTitle } from "@shared/ui/components/dialog/dialog"
import { Field } from "@shared/web/field"
import { Input } from "@shared/ui/components/input/input"
import { Notes } from "@shared/web/notes-editor/notes-editor"
import { toast } from "@shared/ui/components/sonner/sonner"
import { defaultFieldConfig } from "@shared/web/screen-engine/config"

import { ApiFailure, tenancy } from "@/lib/api"
import { pickerKey, searchAccounts } from "@/lib/picker-sources"
import { RecordPicker } from "@/components/record-picker"
import type { PickableRecord } from "@/lib/pickable"
import { useActiveTeam } from "@/lib/use-active-team"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { richTextValue } from "@shared/web/rich-text"
import { dateFromYMD, ymdFromDate } from "@shared/web/format"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useCached } from "@shared/web/store"
import type { SelectableValue } from "@shared/types"
import { useLanguage } from "@shared/web/language"

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

/** The two SCOPE names the delivery catalogue has no word of its own for. A
 * "blueprint" is a PRICED PLANNING sprint, not a type (.plans/BUILD-1 §3), so it
 * is a price on a Planning row and not an option here. These are a FALLBACK and
 * nothing more — what the picker offers before the team's own vocabulary has
 * loaded, so an empty dropdown never greets somebody on a cold cache. */
const FALLBACK_SPRINT_TYPES = ["Planning", "Iteration", "Implementation"]

/** ONE SPRINT TYPE, as the app reads it — the word, the mark somebody
 * recognises it by, the label a German client reads, and how long a block of
 * this kind normally runs.
 *
 * All three extras arrived with team-schema 0025, when the Delivery method page
 * was retired and its ten programmes were folded onto the sprint type they had
 * always been a second name for. They are OPTIONAL because a team adds its own
 * types on the Dropdown values screen and nobody should have to fill in four
 * fields to name one. */
export type SprintTypeOption = {
  value: string
  mark: string | null
  nameDe: string | null
  standardDays: number | null
}

/** THE TEAM'S OWN SPRINT TYPES, not a list in this file.
 *
 * The picker used to offer three hard-coded words, which meant the Dropdown
 * values screen — the ONE place a type is added (the owner's and Aurora's shared
 * answer) — could not actually add one. It reads the vocabulary now, active rows
 * only, exactly as every other pick-or-create field in the app does. */
export function useSprintTypes(teamId: string | null): SprintTypeOption[] {
  const q = useCached<SelectableValue[]>(teamId ? `selectable:${teamId}` : null, () =>
    tenancy.selectable().then((r) => r.values)
  )
  const rows = (q.data ?? [])
    .filter((v) => v.active && v.type === "Sprint type")
    .map((v) => ({ value: v.value, mark: v.mark, nameDe: v.nameDe, standardDays: v.standardDays }))
  return rows.length
    ? rows
    : FALLBACK_SPRINT_TYPES.map((value) => ({ value, mark: null, nameDe: null, standardDays: null }))
}

/** JUST THE WORD — the type's name in the reader's own language, with no mark on
 * the front of it. The German label is a CURATED word carried over from the
 * delivery catalogue, not a translation seam: everything the app itself says is
 * translated at build time from the string catalogue, and a team's own
 * vocabulary is not the app talking.
 *
 * It is its own function because a TYPE MARK has to be `aria-hidden` and sit
 * where an icon sits (UI-CONVENTIONS §5), which means the mark and the word are
 * two elements on a row rather than one string. This is the half `sprintTypeLabel`
 * puts second, so a screen that renders them apart and a picker that renders them
 * together can never disagree about which word a German client reads. */
export function sprintTypeName(option: SprintTypeOption, lang: string): string {
  return lang === "de" && option.nameDe ? option.nameDe : option.value
}

/** What a person reads for one type in a single string: its mark, then its name.
 * For a picker option and any other place a mark cannot have an element of its
 * own. */
export function sprintTypeLabel(option: SprintTypeOption, lang: string): string {
  const name = sprintTypeName(option, lang)
  return option.mark ? `${option.mark} ${name}` : name
}

const nameField = { ...defaultFieldConfig, label: "Sprint name", required: true }
const typeField = { ...defaultFieldConfig, label: "Type", required: false }
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
  fixedAccount,
  initial,
  draftKey,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  apps: PickableRecord[]
  /** Set when the form is opened FROM an app's own screen — the app is then a
   * fact about where you are standing rather than a question, so the picker is
   * replaced by the app's name and the value cannot be changed by accident. */
  fixedApp?: { id: string; name: string }
  /** Set when the form is opened FROM a client's own record — the same shape and
   * the same reason as `fixedApp` above. A sprint is sold TO somebody and cannot
   * be moved to another client afterwards (the update door refuses it), so being
   * on the right record when you write it down is the whole safeguard. */
  fixedAccount?: { id: string; name: string }
  /** Present = EDIT mode (prefilled; client and app shown, not offered). */
  initial?: SprintFormInitial
  draftKey?: string
  onSubmit: (values: SprintFormValues) => Promise<void>
}) {
  const { t, lang } = useLanguage()
  const isEdit = !!initial
  const teamId = useActiveTeam().ctx?.team?.id ?? null
  const sprintTypes = useSprintTypes(teamId)
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
        goal: richTextValue(values.goal),
        sprintType: values.sprintType,
        accountId: fixedAccount ? fixedAccount.id : values.accountId,
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
            ? t("Couldn't save the sprint.")
            : t("Couldn't start the sprint.")
      )
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
      title={<DialogTitle>{isEdit ? t("Edit this sprint") : t("Start a sprint")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {isEdit
            ? t("What it's called, when it runs, and what it was sold for. The client and the app it covers stay as they are.")
            : t("A block of delivery work for one client, with a start, an end and a price.")}
        </DialogDescription>
      }
      submit={{
        busy: busy,
        disabled: !ready,
      }}
    >
      <Field config={nameField} htmlFor="sprint-name" className={fieldSpacing}>
        <Input
          id="sprint-name"
          value={values.name}
          onChange={(e) => setValues((s) => ({ ...s, name: e.target.value }))}
          placeholder={t("e.g. Dispatch, sprint 4")}
          disabled={busy}
          autoFocus
        />
      </Field>
      <Field config={typeField} htmlFor="sprint-type" className={fieldSpacing}>
        <RecordPicker
          id="sprint-type"
          value={values.sprintType || NONE}
          onChange={(v) => setValues((s) => ({ ...s, sprintType: v === NONE ? "" : v }))}
          options={sprintTypes.map((option) => ({
            value: option.value,
            label: sprintTypeLabel(option, lang),
            hint: option.standardDays === null ? undefined : `${option.standardDays} days`,
            // The glyph was ON this object the whole time and stopped one line
            // short of the picker (R35) — the sprints screen draws it, the
            // dialog that chooses the same type drew a word.
            mark: option.mark,
          }))}
          emptyOption={{ value: NONE, label: t("Not said") }}
          placeholder={t("Not said")}
          searchPlaceholder={t("Search types…")}
          emptyText={t("Nothing matched.")}
          disabled={busy}
        />
      </Field>
      <Field config={accountField} htmlFor="sprint-account" className={fieldSpacing}>
        {initial || fixedAccount ? (
          <p className="text-muted-foreground text-sm" id="sprint-account">
            {fixedAccount ? fixedAccount.name : initial?.accountName || t("Ours, no client")}
          </p>
        ) : (
        <RecordPicker
          id="sprint-account"
          value={values.accountId || NONE}
          onChange={(v) => setValues((s) => ({ ...s, accountId: v === NONE ? "" : v }))}
          search={(term) => searchAccounts(term, { type: "entity" })}
          searchKey={pickerKey("companies", teamId)}
          emptyOption={{ value: NONE, label: t("Ours, no client") }}
          placeholder={t("Ours, no client")}
          searchPlaceholder={t("Search companies…")}
          emptyText={t("No company matched.")}
          disabled={busy}
        />
        )}
      </Field>
      <Field config={appField} htmlFor="sprint-app" className={fieldSpacing}>
        {initial ? (
          <p className="text-muted-foreground text-sm" id="sprint-app">
            {initial.appName || t("No app")}
          </p>
        ) : fixedApp ? (
          <p className="text-muted-foreground text-sm" id="sprint-app">
            {fixedApp.name}
          </p>
        ) : (
          <RecordPicker
            id="sprint-app"
            value={values.appId || NONE}
            onChange={(v) => setValues((s) => ({ ...s, appId: v === NONE ? "" : v }))}
            options={apps.map((a) => ({ value: a.id, label: a.name, picture: a.logoUrl }))}
            emptyOption={{ value: NONE, label: t("No app yet") }}
            placeholder={t("No app yet")}
            searchPlaceholder={t("Search apps…")}
            emptyText={t("No app matched.")}
            disabled={busy}
          />
        )}
      </Field>
      <Field config={goalField} htmlFor="sprint-goal" className={fieldSpacing}>
        <Notes
          key={open ? "open" : "shut"}
          defaultValue={values.goal}
          onChange={(html) => setValues((s) => ({ ...s, goal: html }))}
          placeholder={t("What this block of work is meant to achieve.")}
          className="min-h-32"
        />
      </Field>
      <Field config={startField} htmlFor="sprint-start" className={fieldSpacing}>
        <DatePicker
          id="sprint-start"
          mode="date"
          locale={lang}
          value={dateFromYMD(values.startsOn)}
          onValueChange={(d) => setValues((s) => ({ ...s, startsOn: ymdFromDate(d) }))}
          disabled={busy}
        />
      </Field>
      <Field config={endField} htmlFor="sprint-end" className={fieldSpacing}>
        <DatePicker
          id="sprint-end"
          mode="date"
          locale={lang}
          value={dateFromYMD(values.endsOn)}
          onValueChange={(d) => setValues((s) => ({ ...s, endsOn: ymdFromDate(d) }))}
          disabled={busy}
        />
      </Field>
      <Field config={priceField} htmlFor="sprint-price" className={fieldSpacing}>
        <Input
          id="sprint-price"
          inputMode="decimal"
          value={values.price}
          onChange={(e) => setValues((s) => ({ ...s, price: e.target.value }))}
          placeholder={t("e.g. 4500")}
          disabled={busy}
        />
      </Field>
    </FormShellDialog>
  )
}
