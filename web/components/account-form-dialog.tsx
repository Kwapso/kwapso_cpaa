"use client"

// Account form dialog — add a company or a person, or edit one. `initial` present
// = edit mode (prefilled). Companies and people are ONE list (SCOPE ch.03), told
// apart by Type, so this is the one form for both; on an existing account the type
// is settled and the door won't change it, so the field only shows when creating.
//
// The parent account is edited here too, because "who does this sit under" is part
// of the record, not a separate errand. The caller decides what that means: on an
// edit it moves the account FIRST (that's the move the server can refuse — putting
// an account inside itself), so a refusal changes nothing at all.
//
// Shared FormShell layout (Law R4) + a per-session draft (Law R7 · CACHING.md §11).

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@kwapso/ui/registry/primitives/dialog/dialog"
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
import { defaultFieldConfig } from "@kwapso/ui/lib/config"
import { Plus } from "lucide-react"

import { ApiFailure } from "@/lib/api"
import { FormShell, fieldSpacing } from "@/components/form-shell"
import { useFormDraft } from "@/lib/use-form-draft"

const typeField = { ...defaultFieldConfig, label: "Type", required: true }
const nameField = { ...defaultFieldConfig, label: "Name", required: true }
const parentField = { ...defaultFieldConfig, label: "Parent account", required: false }
const codeField = { ...defaultFieldConfig, label: "Reference", required: false }
const emailField = { ...defaultFieldConfig, label: "Email", required: false }
const phoneField = { ...defaultFieldConfig, label: "Phone", required: false }
const addressField = { ...defaultFieldConfig, label: "Address", required: false }
const statusField = { ...defaultFieldConfig, label: "Status", required: false }

// Radix Select can't hold an empty value, so "sits under nothing" is a sentinel.
const TOP = "__top__"

/** What the form prefills from and submits — the editable surface of an account. */
export type AccountFormValues = {
  accountType: "entity" | "individual"
  name: string
  /** "" = top level */
  parentAccountId: string
  code: string
  email: string
  phone: string
  address: string
  status: string
}

const EMPTY: AccountFormValues = {
  accountType: "entity",
  name: "",
  parentAccountId: "",
  code: "",
  email: "",
  phone: "",
  address: "",
  status: "",
}

export function AccountFormDialog({
  open,
  onOpenChange,
  initial,
  parentOptions,
  statusOptions,
  onSubmit,
  draftKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** present = edit mode (prefilled); absent = create mode */
  initial?: AccountFormValues | null
  /** the accounts this one may sit under (the caller leaves out the record itself;
   * a move that would close a loop is refused by the server, in plain words). */
  parentOptions: { id: string; name: string }[]
  /** statuses already in use on this team, offered as a pick-or-type list. */
  statusOptions: string[]
  onSubmit: (values: AccountFormValues) => Promise<void>
  /** stable id for per-session draft persistence; omit to disable. */
  draftKey?: string
}) {
  const isEdit = !!initial
  const [values, setValues, clearDraft] = useFormDraft(draftKey, initial ?? EMPTY, open)
  const [busy, setBusy] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!values.name.trim()) return
    setBusy(true)
    try {
      await onSubmit(values)
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      // The server's own sentence wins — it's the one that knows WHY (a duplicate
      // reference, a move that would put the account inside itself).
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't save the account.")
    } finally {
      setBusy(false)
    }
  }

  const set = (patch: Partial<AccountFormValues>) => setValues((v) => ({ ...v, ...patch }))

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return
        if (!o) clearDraft() // dismissing the form discards the draft
        onOpenChange(o)
      }}
    >
      <DialogContent>
        <FormShell
          onSubmit={submit}
          title={<DialogTitle>{isEdit ? "Edit this account" : "Add an account"}</DialogTitle>}
          subtitle={
            <DialogDescription>
              {isEdit
                ? "Update the details you hold for them."
                : "A company or a person — both live in the same list."}
            </DialogDescription>
          }
          footer={
            <Button type="submit" disabled={busy || !values.name.trim()} className="gap-1.5">
              {busy ? <Spinner /> : isEdit ? null : <Plus className="size-4" />}
              {busy ? "Saving…" : isEdit ? "Save changes" : "Add account"}
            </Button>
          }
        >
          {!isEdit && (
            <Field config={typeField} htmlFor="account-type" className={fieldSpacing}>
              <Select
                value={values.accountType}
                onValueChange={(v) => set({ accountType: v === "individual" ? "individual" : "entity" })}
                disabled={busy}
              >
                <SelectTrigger id="account-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entity">Company</SelectItem>
                  <SelectItem value="individual">Person</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field config={nameField} htmlFor="account-name" className={fieldSpacing}>
            <Input
              id="account-name"
              value={values.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Bergman S.A."
              disabled={busy}
              autoFocus
            />
          </Field>

          <Field config={parentField} htmlFor="account-parent" className={fieldSpacing}>
            <Select
              value={values.parentAccountId || TOP}
              onValueChange={(v) => set({ parentAccountId: v === TOP ? "" : v })}
              disabled={busy}
            >
              <SelectTrigger id="account-parent">
                <SelectValue placeholder="Sits on its own" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TOP}>Sits on its own</SelectItem>
                {parentOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field config={codeField} htmlFor="account-code" className={fieldSpacing}>
            <Input
              id="account-code"
              value={values.code}
              onChange={(e) => set({ code: e.target.value })}
              placeholder="BERG"
              disabled={busy}
            />
          </Field>

          <Field config={emailField} htmlFor="account-email" className={fieldSpacing}>
            <Input
              id="account-email"
              type="email"
              value={values.email}
              onChange={(e) => set({ email: e.target.value })}
              placeholder="hola@bergman.example"
              disabled={busy}
            />
          </Field>

          <Field config={phoneField} htmlFor="account-phone" className={fieldSpacing}>
            <Input
              id="account-phone"
              value={values.phone}
              onChange={(e) => set({ phone: e.target.value })}
              placeholder="+34 600 000 000"
              disabled={busy}
            />
          </Field>

          <Field config={addressField} htmlFor="account-address" className={fieldSpacing}>
            <Textarea
              id="account-address"
              value={values.address}
              onChange={(e) => set({ address: e.target.value })}
              placeholder="Where they are (optional)."
              disabled={busy}
              rows={2}
            />
          </Field>

          <Field config={statusField} htmlFor="account-status" className={fieldSpacing}>
            <Input
              id="account-status"
              list="account-statuses"
              value={values.status}
              onChange={(e) => set({ status: e.target.value })}
              placeholder="client"
              disabled={busy}
            />
            <datalist id="account-statuses">
              {statusOptions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
        </FormShell>
      </DialogContent>
    </Dialog>
  )
}
