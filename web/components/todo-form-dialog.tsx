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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kwapso/ui/registry/primitives/select/select"
import { Textarea } from "@kwapso/ui/registry/primitives/textarea/textarea"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { Send } from "lucide-react"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { ApiFailure } from "@/lib/api"
import { accountsKey, listFetch } from "@/lib/live-resources"
import { useActiveTeam } from "@/lib/use-active-team"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useCached } from "@shared/web/store"
import type { Account } from "@shared/types"
import { useT } from "@shared/web/language"

export type TodoFormValues = { accountId: string; title: string; detail: string; dueOn: string }

const accountField = { ...defaultFieldConfig, label: "Which client", required: true }
const titleField = { ...defaultFieldConfig, label: "What we need from them", required: true }
const detailField = { ...defaultFieldConfig, label: "Anything else they should know", required: false }
const dueField = { ...defaultFieldConfig, label: "By when", required: false }

export function TodoFormDialog({
  open,
  onOpenChange,
  draftKey,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  draftKey?: string
  onSubmit: (values: TodoFormValues) => Promise<void>
}) {
  const t = useT()
  const teamId = useActiveTeam().ctx?.team?.id ?? null
  const accountsQ = useCached<Account[]>(teamId ? accountsKey(teamId) : null, () =>
    listFetch.accounts(teamId as string)
  )
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    { accountId: "", title: "", detail: "", dueOn: "" },
    open
  )
  const [busy, setBusy] = React.useState(false)
  const ready = values.accountId !== "" && values.title.trim() !== ""

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      await onSubmit({
        accountId: values.accountId,
        title: values.title.trim(),
        detail: values.detail.trim(),
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

  const companies = (accountsQ.data ?? []).filter((a) => a.active)

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
        <Select
          value={values.accountId}
          onValueChange={(v) => setValues((s) => ({ ...s, accountId: v }))}
          disabled={busy}
        >
          <SelectTrigger id="todo-account">
            <SelectValue placeholder={t("Pick the client")} />
          </SelectTrigger>
          <SelectContent>
            {companies.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <Textarea
          id="todo-detail"
          value={values.detail}
          onChange={(e) => setValues((s) => ({ ...s, detail: e.target.value }))}
          placeholder={t("Where to find it, what format, who to ask.")}
          disabled={busy}
          rows={3}
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
