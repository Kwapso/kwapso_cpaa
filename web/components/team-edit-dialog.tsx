"use client"

// Edit-team dialog: the team's name + optional logo. The logo lands in R2 (via
// the tenancy worker) and is served at /media/teams/<id>. Library primitives.

import * as React from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@shared/ui/registry/primitives/avatar/avatar"
import {
  DialogDescription,
  DialogTitle,
} from "@shared/ui/registry/primitives/dialog/dialog"
import { Field } from "@shared/web/field"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { FileUpload } from "@shared/ui/registry/primitives/file-upload/file-upload"
import { Input } from "@shared/ui/registry/primitives/input/input"
import { toast } from "@shared/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@shared/ui/lib/config"

import type { TeamSummary } from "@shared/types"
import { ApiFailure, tenancy } from "@/lib/api"
import { useFormDraft } from "@shared/web/use-form-draft"
import { letterMark } from "@/lib/identity"
import { fileToDataUrl } from "@/lib/image"
import { useT } from "@shared/web/language"

const nameField = { ...defaultFieldConfig, label: "Team name", required: true }

export function TeamEditDialog({
  open,
  onOpenChange,
  team,
  onSaved,
  draftKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  team: TeamSummary | null
  onSaved: () => Promise<void>
  /** stable id for per-session draft persistence (CACHING.md §11); omit to disable */
  draftKey?: string
}) {
  const t = useT()
  const initialValues: { name: string; logo?: string } = {
    name: team?.name ?? "",
    logo: undefined,
  }
  // Per-session draft: restores what you typed if you navigate away and reopen.
  const [values, setValues, clearDraft] = useFormDraft(draftKey, initialValues, open)
  const [busy, setBusy] = React.useState(false)
  const { name, logo } = values

  async function handlePhoto(files: File[]) {
    if (!files[0]) return
    try {
      const dataUrl = await fileToDataUrl(files[0])
      setValues((v) => ({ ...v, logo: dataUrl }))
    } catch {
      toast.error(t("Couldn't read that image. Try another one."))
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await tenancy.updateTeam(name.trim(), logo)
      await onSaved()
      clearDraft()
      onOpenChange(false)
      toast.success(t("Team updated."))
    } catch (err) {
      toast.error(
        err instanceof ApiFailure ? err.message : t("Couldn't save the team.")
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
      title={<DialogTitle>{t("Edit your team")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {t("Change your team's name or add a logo. This is what everyone sees.")}
        </DialogDescription>
      }
      submit={{
        busy: busy,
        disabled: !name.trim(),
      }}
    >
      <div className="flex flex-col items-center gap-4">
        <Avatar className="size-20">
          {(logo || team?.logoUrl) && (
            <AvatarImage src={logo || (team?.logoUrl as string)} alt={t("Team logo")} />
          )}
          <AvatarFallback className="text-xl">
            {letterMark(name)}
          </AvatarFallback>
        </Avatar>
        <FileUpload accept="image/*" multiple={false} onChange={handlePhoto} />
      </div>
      <Field config={nameField} htmlFor="team-name" className={fieldSpacing}>
        <Input
          id="team-name"
          value={name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          disabled={busy}
        />
      </Field>
    </FormShellDialog>
  )
}
