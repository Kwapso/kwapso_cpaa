"use client"

// Create-team dialog — a name, then the tenancy worker spins up a brand-new
// team with its OWN database (and switches you into it). Library primitives.

import * as React from "react"

import { Button } from "@shared/ui/components/button/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/components/dialog/dialog"
import { Field } from "@shared/web/field"
import { Input } from "@shared/ui/components/input/input"
import { Spinner } from "@shared/ui/components/spinner/spinner"
import { toast } from "@shared/ui/components/sonner/sonner"
import { defaultFieldConfig } from "@shared/web/screen-engine/config"

import { ApiFailure } from "@/lib/api"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

const nameField = { ...defaultFieldConfig, label: "Team name", required: true }

export function CreateTeamDialog({
  open,
  onOpenChange,
  onCreate,
  draftKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (name: string) => Promise<void>
  /** stable id for per-session draft persistence (CACHING.md §11); omit to disable */
  draftKey?: string
}) {
  const t = useT()
  const initialValues = { name: "" }
  // Per-session draft: restores what you typed if you navigate away and reopen.
  const [values, setValues, clearDraft] = useFormDraft(draftKey, initialValues, open)
  const [busy, setBusy] = React.useState(false)
  const { name } = values

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await onCreate(name.trim())
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof ApiFailure ? err.message : t("Couldn't create the team.")
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
        <DialogHeader>
          <DialogTitle>{t("Create a team")}</DialogTitle>
          <DialogDescription>
            {t("It gets its own private space. You'll be its admin.")}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <Field config={nameField} htmlFor="team-name">
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              placeholder={t("Acme Inc.")}
              disabled={busy}
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? <Spinner /> : null}
              {busy ? t("Creating…") : t("Create team")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
