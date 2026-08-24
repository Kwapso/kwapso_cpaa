"use client"

// Invite dialog — invite someone by email to an active role. Opened from the
// Invites screen (?panel=add) and closed via the URL (Back dismisses it). The
// caller does the actual create + cache refresh; this owns the form + busy +
// error toast. Library primitives.

import * as React from "react"

import {
  DialogDescription,
  DialogTitle,
} from "@shared/ui/controls/dialog/dialog"
import { Field } from "@shared/web/field"
import { RecordPicker } from "@/components/record-picker"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { Input } from "@shared/ui/controls/input/input"
import { toast } from "@shared/ui/controls/sonner/sonner"
import { Mail } from "@shared/ui/icons"
import { defaultFieldConfig } from "@shared/web/screen-engine/config"

import type { TeamRole } from "@shared/types"
import { ApiFailure } from "@/lib/api"
import { useFormDraft } from "@shared/web/use-form-draft"
import { reportError } from "@shared/web/log"
import { useT } from "@shared/web/language"

const emailField = { ...defaultFieldConfig, label: "Email", required: true }
const roleField = { ...defaultFieldConfig, label: "Role", required: true }

export function InviteDialog({
  open,
  onOpenChange,
  roles,
  onSubmit,
  draftKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Active roles only — the caller pre-filters (the server rejects inactive). */
  roles: TeamRole[]
  onSubmit: (email: string, roleId: string) => Promise<void>
  /** stable id for per-session draft persistence (CACHING.md §11); omit to disable */
  draftKey?: string
}) {
  const t = useT()
  // Default the role to the first non-Admin; the hook seeds this on open.
  const initialValues = {
    email: "",
    roleId: (roles.find((r) => !r.isDefault) ?? roles[0])?.id ?? "",
  }
  // Per-session draft: restores what you typed if you navigate away and reopen.
  const [values, setValues, clearDraft] = useFormDraft(draftKey, initialValues, open)
  const [busy, setBusy] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!values.email.trim() || !values.roleId) return
    setBusy(true)
    try {
      await onSubmit(values.email.trim(), values.roleId)
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      // ApiFailure carries the server's specific reason (e.g. "They're already on
      // this team."). Anything else is a network/runtime fault — log it so a
      // generic toast is never mistaken for a permission block.
      if (!(err instanceof ApiFailure)) reportError("invite:send", err)
      toast.error(
        err instanceof ApiFailure ? err.message : t("Couldn't send the invite, please try again.")
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
      title={<DialogTitle>{t("Invite someone to the team")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {t("We'll email them an invite to join in the role you pick.")}
        </DialogDescription>
      }
      submit={{
        busy: busy,
        disabled: !values.email.trim() || !values.roleId,
        icon: <Mail className="size-4" />,
      }}
    >
      <Field config={emailField} htmlFor="invite-email" className={fieldSpacing}>
        <Input
          id="invite-email"
          type="email"
          value={values.email}
          onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
          placeholder="name@company.com"
          disabled={busy}
          autoFocus
        />
      </Field>
      <Field config={roleField} htmlFor="invite-role" className={fieldSpacing}>
        <RecordPicker
          id="invite-role"
          value={values.roleId}
          onChange={(roleId) => setValues((v) => ({ ...v, roleId }))}
          options={roles.map((r) => ({ value: r.id, label: r.title }))}
          placeholder={t("Role")}
          searchPlaceholder={t("Search roles…")}
          emptyText={t("No role matched.")}
          disabled={busy}
        />
      </Field>
    </FormShellDialog>
  )
}
