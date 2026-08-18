"use client"

// MEETING FORM — arrange a conversation, or write it up afterwards.
//
// THE TWO LONG FIELDS ARE THE POINT. Everything above them (who with, when, why,
// where) is the kind of thing every diary holds; the agenda and the notes are
// what the previous system had nowhere to put, so it folded 350 meetings into
// work logs and kept only the hours. The form asks for them in the order they
// happen: the agenda before, the notes after.
//
// ITS DRAFT MATTERS more than most (R7). An agenda is typed while somebody is
// still on the phone agreeing it, and notes are typed in the ten minutes before
// the next call — both are moments where a mis-tap costs a conversation rather
// than a field. FormShell (R4) + a per-session draft.

import * as React from "react"

import { DialogDescription, DialogTitle } from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Textarea } from "@kwapso/ui/registry/primitives/textarea/textarea"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { ApiFailure } from "@/lib/api"
import { pickerKey, searchAccounts } from "@/lib/picker-sources"
import { RecordPicker } from "@/components/record-picker"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { toMoment } from "@shared/web/format"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

/** A picker can't hold an empty value, so "nobody in particular" needs a
 * sentinel — the same one the knowledge form uses for the agency's own material. */
const NONE = "__none__"

const titleField = { ...defaultFieldConfig, label: "What it is about", required: true }
const whenField = { ...defaultFieldConfig, label: "When", required: true }
const untilField = { ...defaultFieldConfig, label: "Until", required: false }
const clientField = { ...defaultFieldConfig, label: "Who it is with", required: false }
// WHICH SYSTEM IT WAS ABOUT. Optional on purpose: plenty of meetings are about
// the account rather than one of its systems, and the first kickoff call is one
// of them. It is what fills the app record's own Meetings tab.
const appField = { ...defaultFieldConfig, label: "Which app", required: false }
const purposeField = { ...defaultFieldConfig, label: "Why we are meeting", required: false }
const whereField = { ...defaultFieldConfig, label: "Where", required: false }
const agendaField = { ...defaultFieldConfig, label: "Agenda", required: false }
const notesField = { ...defaultFieldConfig, label: "Notes", required: false }

export type MeetingFormValues = {
  title: string
  startsAt: string
  endsAt: string
  accountId: string
  appId: string
  purposeId: string
  location: string
  agenda: string
  notes: string
}

export function MeetingFormDialog({
  open,
  onOpenChange,
  onSubmit,
  teamId,
  accountOptions,
  appOptions,
  purposeOptions,
  initial,
  draftKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: MeetingFormValues) => Promise<void>
  /** the team whose clients the picker searches. Accounts PAGE (R14), so the
   * question goes to the door rather than to the loaded page. */
  teamId: string | null
  /** the clients the screen already holds — painted while the door's first
   * answer arrives, and where an edited meeting's client gets its NAME. */
  accountOptions: { id: string; name: string }[]
  /** the systems a meeting can be filed against — the same bounded apps list
   * every other form in the work engine picks from. */
  appOptions: { id: string; name: string }[]
  /** why we meet, out of the settled taxonomy under Delivery method. */
  purposeOptions: { id: string; name: string }[]
  /** Present = EDIT mode (prefilled). */
  initial?: Partial<MeetingFormValues>
  draftKey?: string
}) {
  const t = useT()
  const isEdit = !!initial
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    {
      title: initial?.title ?? "",
      startsAt: initial?.startsAt ?? "",
      endsAt: initial?.endsAt ?? "",
      accountId: initial?.accountId || NONE,
      appId: initial?.appId || NONE,
      purposeId: initial?.purposeId || NONE,
      location: initial?.location ?? "",
      agenda: initial?.agenda ?? "",
      notes: initial?.notes ?? "",
    },
    open
  )
  const [busy, setBusy] = React.useState(false)
  const ready = values.title.trim() !== "" && values.startsAt !== ""

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      await onSubmit({
        title: values.title.trim(),
        startsAt: toMoment(values.startsAt),
        endsAt: toMoment(values.endsAt),
        accountId: values.accountId === NONE ? "" : values.accountId,
        appId: values.appId === NONE ? "" : values.appId,
        purposeId: values.purposeId === NONE ? "" : values.purposeId,
        location: values.location.trim(),
        agenda: values.agenda.trim(),
        notes: values.notes.trim(),
      })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof ApiFailure ? err.message : isEdit ? "Couldn't save the meeting." : "Couldn't arrange that."
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
      clearDraft={clearDraft}
      onSubmit={submit}
      title={<DialogTitle>{isEdit ? "Edit this meeting" : "New meeting"}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {isEdit
            ? "Write up what was decided while it is still fresh, the notes are the part worth keeping."
            : "A conversation, with what you mean to cover. You can add it to your own calendar afterwards."}
        </DialogDescription>
      }
      submit={{
        busy: busy,
        disabled: !ready,
      }}
    >
      <Field config={titleField} htmlFor="meeting-title" className={fieldSpacing}>
        <Input
          id="meeting-title"
          value={values.title}
          onChange={(e) => setValues((s) => ({ ...s, title: e.target.value }))}
          placeholder={t("e.g. Quarterly review with Bergman")}
          disabled={busy}
          autoFocus
        />
      </Field>
      <Field config={whenField} htmlFor="meeting-when" className={fieldSpacing}>
        <Input
          id="meeting-when"
          type="datetime-local"
          value={values.startsAt}
          onChange={(e) => setValues((s) => ({ ...s, startsAt: e.target.value }))}
          disabled={busy}
        />
      </Field>
      <Field config={untilField} htmlFor="meeting-until" className={fieldSpacing}>
        <Input
          id="meeting-until"
          type="datetime-local"
          value={values.endsAt}
          onChange={(e) => setValues((s) => ({ ...s, endsAt: e.target.value }))}
          disabled={busy}
        />
      </Field>
      <Field config={clientField} htmlFor="meeting-client" className={fieldSpacing}>
        <RecordPicker
          id="meeting-client"
          value={values.accountId}
          onChange={(v) => setValues((s) => ({ ...s, accountId: v }))}
          search={(term) => searchAccounts(term)}
          searchKey={pickerKey("accounts", teamId)}
          options={accountOptions.map((a) => ({ value: a.id, label: a.name }))}
          emptyOption={{ value: NONE, label: t("Nobody, it is ours") }}
          placeholder={t("Nobody, it is ours")}
          searchPlaceholder={t("Search clients…")}
          emptyText={t("No client matched.")}
          disabled={busy}
        />
      </Field>
      <Field config={appField} htmlFor="meeting-app" className={fieldSpacing}>
        <RecordPicker
          id="meeting-app"
          value={values.appId}
          onChange={(v) => setValues((s) => ({ ...s, appId: v }))}
          options={appOptions.map((a) => ({ value: a.id, label: a.name }))}
          emptyOption={{ value: NONE, label: t("Not about one app") }}
          placeholder={t("Not about one app")}
          searchPlaceholder={t("Search apps…")}
          emptyText={t("No app matched.")}
          disabled={busy}
        />
      </Field>
      <Field config={purposeField} htmlFor="meeting-purpose" className={fieldSpacing}>
        <RecordPicker
          id="meeting-purpose"
          value={values.purposeId}
          onChange={(v) => setValues((s) => ({ ...s, purposeId: v }))}
          options={purposeOptions.map((p) => ({ value: p.id, label: p.name }))}
          emptyOption={{ value: NONE, label: t("Not said") }}
          placeholder={t("Not said")}
          searchPlaceholder={t("Search reasons…")}
          emptyText={t("Nothing matched.")}
          disabled={busy}
        />
      </Field>
      <Field config={whereField} htmlFor="meeting-where" className={fieldSpacing}>
        <Input
          id="meeting-where"
          value={values.location}
          onChange={(e) => setValues((s) => ({ ...s, location: e.target.value }))}
          placeholder={t("e.g. Their office, or a video call")}
          disabled={busy}
        />
      </Field>
      <Field config={agendaField} htmlFor="meeting-agenda" className={fieldSpacing}>
        <Textarea
          id="meeting-agenda"
          value={values.agenda}
          onChange={(e) => setValues((s) => ({ ...s, agenda: e.target.value }))}
          placeholder={t("What we mean to cover.")}
          disabled={busy}
          rows={3}
        />
      </Field>
      <Field config={notesField} htmlFor="meeting-notes" className={fieldSpacing}>
        <Textarea
          id="meeting-notes"
          value={values.notes}
          onChange={(e) => setValues((s) => ({ ...s, notes: e.target.value }))}
          placeholder={t("What was said and decided.")}
          disabled={busy}
          rows={4}
        />
      </Field>
    </FormShellDialog>
  )
}
