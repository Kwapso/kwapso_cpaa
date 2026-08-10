"use client"

// Edit-team dialog: the team's name + optional logo. The logo lands in R2 (via
// the tenancy worker) and is served at /media/teams/<id>. Library primitives.

import * as React from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@kwapso/ui/registry/primitives/avatar/avatar"
import { Button } from "@kwapso/ui/registry/primitives/button/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { FormShell, fieldSpacing } from "@shared/web/form-shell"
import { FileUpload } from "@kwapso/ui/registry/primitives/file-upload/file-upload"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import type { TeamSummary } from "@shared/types"
import { ApiFailure, tenancy } from "@/lib/api"
import { useFormDraft } from "@shared/web/use-form-draft"
import { letterMark } from "@/lib/identity"
import { fileToDataUrl } from "@/lib/image"

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
      toast.error("Couldn't read that image — try another one.")
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
      toast.success("Team updated.")
    } catch (err) {
      toast.error(
        err instanceof ApiFailure ? err.message : "Couldn't save the team."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return
        if (!o) clearDraft() // dismissing the form (Esc / backdrop / close) discards the draft
        onOpenChange(o)
      }}
    >
      <DialogContent>
        <FormShell
          onSubmit={submit}
          title={<DialogTitle>Edit your team</DialogTitle>}
          subtitle={
            <DialogDescription>
              Change your team&apos;s name or add a logo. This is what everyone sees.
            </DialogDescription>
          }
          footer={
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? <Spinner /> : null}
              {busy ? "Saving…" : "Save changes"}
            </Button>
          }
        >
          <div className="flex flex-col items-center gap-3">
            <Avatar className="size-20">
              {(logo || team?.logoUrl) && (
                <AvatarImage src={logo || (team?.logoUrl as string)} alt="Team logo" />
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
        </FormShell>
      </DialogContent>
    </Dialog>
  )
}
