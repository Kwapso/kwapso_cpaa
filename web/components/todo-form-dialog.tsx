"use client"

// ASK A CLIENT FOR SOMETHING — the one form in the agency app whose Save button
// reaches into a customer's inbox. Through the shared FormShell (Law R4) with a
// per-session draft (Law R7).
//
// The subtitle says the email out loud rather than burying it in a tooltip: a
// to-do is one of only two things in the whole product that emails a client
// (.plans/BUILD-1 §7), and somebody typing one should know that before they
// finish typing, not after.

import * as React from "react"

import { DialogDescription, DialogTitle } from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Notes } from "@kwapso/ui/registry/primitives/notes/notes"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { Send } from "lucide-react"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { ApiFailure } from "@/lib/api"
import { pickerKey, searchAccounts } from "@/lib/picker-sources"
import { useActiveTeam } from "@/lib/use-active-team"
import { RecordPicker } from "@/components/record-picker"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { richTextValue } from "@shared/web/rich-text"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

export type TodoFormValues = { accountId: string; title: string; detail: string; dueOn: string }

const accountField = { ...defaultFieldConfig, label: "Which client", required: true }
const titleField = { ...defaultFieldConfig, label: "What we need from them", required: true }
const detailField = { ...defaultFieldConfig, label: "Anything else they should know", required: false }
const dueField = { ...defaultFieldConfig, label: "By when", required: false }

export function TodoFormDialog({
  open,
  onOpenChange,
  fixedAccount,
  draftKey,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Set when the form is opened FROM a client's own record — the client is then
   * a fact about where you are standing rather than a question, so the picker is
   * replaced by their name and cannot be changed by accident. The same shape
   * SprintFormDialog and StoryFormDialog use for a fixed app, and for the same
   * reason: the relation is the whole point of creating it from here. */
  fixedAccount?: { id: string; name: string }
  draftKey?: string
  onSubmit: (values: TodoFormValues) => Promise<void>
}) {
  const t = useT()
  const teamId = useActiveTeam().ctx?.team?.id ?? null
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    { accountId: "", title: "", detail: "", dueOn: "" },
    open
  )
  const [busy, setBusy] = React.useState(false)
  const accountId = fixedAccount ? fixedAccount.id : values.accountId
  const ready = accountId !== "" && values.title.trim() !== ""

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      await onSubmit({
        accountId,
        title: values.title.trim(),
        detail: richTextValue(values.detail),
        dueOn: values.dueOn,
      })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't ask for that.")
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
      title={<DialogTitle>{t("Ask a client for something")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {t("This lands in their portal with a due date, and we email them about it. Only for something we genuinely can't get on without.")}
        </DialogDescription>
      }
      submit={{
        busy: busy,
        disabled: !ready,
        icon: <Send className="size-4" />,
      }}
    >
      <Field config={accountField} htmlFor="todo-account" className={fieldSpacing}>
        {/* THE DOOR ANSWERS THIS, because accounts PAGE (R14): the list cache
            this used to read holds page one, so an agency past fifty companies
            could not ask the fifty-first for anything. */}
        <RecordPicker
          id="todo-account"
          value={values.accountId}
          onChange={(v) => setValues((s) => ({ ...s, accountId: v }))}
          search={(term) => searchAccounts(term)}
          searchKey={pickerKey("accounts", teamId)}
          placeholder={t("Pick the client")}
          searchPlaceholder={t("Search accounts…")}
          emptyText={t("No account matched.")}
          disabled={busy}
        />
      </Field>
      <Field config={titleField} htmlFor="todo-title" className={fieldSpacing}>
        <Input
          id="todo-title"
          value={values.title}
          onChange={(e) => setValues((s) => ({ ...s, title: e.target.value }))}
          placeholder={t("e.g. Send us your brand logo as an SVG")}
          disabled={busy}
          autoFocus
        />
      </Field>
      <Field config={detailField} htmlFor="todo-detail" className={fieldSpacing}>
        <Notes
          key={open ? "open" : "shut"}
          defaultValue={values.detail}
          onChange={(html) => setValues((s) => ({ ...s, detail: html }))}
          placeholder={t("Where to find it, what format, who to ask.")}
          className="min-h-32"
        />
      </Field>
      <Field config={dueField} htmlFor="todo-due" className={fieldSpacing}>
        <Input
          id="todo-due"
          type="date"
          value={values.dueOn}
          onChange={(e) => setValues((s) => ({ ...s, dueOn: e.target.value }))}
          disabled={busy}
        />
      </Field>
    </FormShellDialog>
  )
}
