"use client"

// Map-a-process dialog — the form overlay for creating or renaming a process.
// Through the shared FormShell (Law R4) with a per-session draft (Law R7), like
// every other write in the base.
//
// THE BASELINE NAME IS ON THE CREATE FORM, and that is deliberate. A process is
// created together with its version 1 — the way the work was done before we
// touched anything — because a process with no baseline can never produce a
// saving and would report zero for ever while looking perfectly healthy. Asking
// for its name here is what makes that visible to the person doing it.

import * as React from "react"

import { DialogDescription, DialogTitle } from "@shared/ui/components/dialog/dialog"
import { Field } from "@shared/web/field"
import { Input } from "@shared/ui/components/input/input"
import { Notes } from "@shared/web/notes-editor/notes-editor"
import { toast } from "@shared/ui/components/sonner/sonner"
import { defaultFieldConfig } from "@shared/web/screen-engine/config"

import { ApiFailure } from "@/lib/api"
import { RecordPicker } from "@/components/record-picker"
import type { PickableRecord } from "@/lib/pickable"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { richTextValue } from "@shared/web/rich-text"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

export type ProcessFormValues = {
  appId: string
  name: string
  description: string
  /** WHO DOES THIS WORK (CHECKLIST 8.13) — the role whose hours the saving is
   * measured in. Free text in the team's own words: the person who does a
   * client's invoicing is THEIR bookkeeper, not one of our logins. */
  roleName: string
  baselineLabel: string
}

const appField = { ...defaultFieldConfig, label: "App", required: true }
const nameField = { ...defaultFieldConfig, label: "Process name", required: true }
const descField = { ...defaultFieldConfig, label: "What it is", required: false }
const roleField = {
  ...defaultFieldConfig,
  label: "Who does it",
  required: false,
  hint: "The role whose hours this takes. It is what prices the saving.",
}
const baselineField = {
  ...defaultFieldConfig,
  label: "Name for how it worked before",
  required: false,
  hint: "Version 1 is the way they worked before us. Every saving is measured from it.",
}

export function ProcessFormDialog({
  open,
  onOpenChange,
  apps,
  fixedApp,
  initial,
  draftKey,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The systems we've built — a process lives inside one. */
  apps: PickableRecord[]
  /** Opened FROM an app, so which app is a fact rather than a question
   * (CHECKLIST 8.12). The picker disappears and a sentence takes its place —
   * the same shape the sprint and story forms already use. */
  fixedApp?: { id: string; name: string }
  /** Present = editing an existing map (the app and the baseline are settled). */
  initial?: { name: string; description: string; roleName: string }
  draftKey?: string
  onSubmit: (values: ProcessFormValues) => Promise<void>
}) {
  const t = useT()
  const editing = initial !== undefined
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    {
      appId: fixedApp?.id ?? "",
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      roleName: initial?.roleName ?? "",
      baselineLabel: "",
    },
    open
  )
  const [busy, setBusy] = React.useState(false)

  const ready = values.name.trim() !== "" && (editing || values.appId !== "")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      await onSubmit({
        appId: values.appId,
        name: values.name.trim(),
        description: richTextValue(values.description),
        roleName: values.roleName.trim(),
        baselineLabel: values.baselineLabel.trim(),
      })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't save the process."))
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
      title={<DialogTitle>{editing ? t("Edit process") : t("Map a process")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {editing
            ? t("Rename it or say more about what it covers.")
            : t("A way of working inside one of your apps. You'll add its steps next.")}
        </DialogDescription>
      }
      submit={{
        busy: busy,
        disabled: !ready,
      }}
    >
      {!editing && fixedApp && (
        <p className="text-muted-foreground text-sm">
          {t("Inside")} <span className="text-foreground font-medium">{fixedApp.name}</span>
        </p>
      )}
      {!editing && !fixedApp && (
        <Field config={appField} htmlFor="process-app" className={fieldSpacing}>
          <RecordPicker
            id="process-app"
            value={values.appId}
            onChange={(v) => setValues((s) => ({ ...s, appId: v }))}
            options={apps.map((a) => ({ value: a.id, label: a.name, picture: a.logoUrl }))}
            placeholder={t("Pick the app")}
            searchPlaceholder={t("Search apps…")}
            emptyText={t("No app matched.")}
            disabled={busy}
          />
        </Field>
      )}
      <Field config={nameField} htmlFor="process-name" className={fieldSpacing}>
        <Input
          id="process-name"
          value={values.name}
          onChange={(e) => setValues((s) => ({ ...s, name: e.target.value }))}
          placeholder={t("e.g. Approving a supplier invoice")}
          disabled={busy}
          autoFocus
        />
      </Field>
      {/* WHOSE HOURS THESE ARE (8.13). It is what turns the time this map gives
          back into money: the saving is priced at the rate of the role that used
          to spend it. Free text against the team's own words, and an unpriced
          role is a legal answer — the hours still count and the money says it
          could not be worked out, rather than being invented. */}
      <Field config={roleField} htmlFor="process-role" className={fieldSpacing}>
        <Input
          id="process-role"
          value={values.roleName}
          onChange={(e) => setValues((s) => ({ ...s, roleName: e.target.value }))}
          placeholder={t("e.g. Bookkeeper")}
          disabled={busy}
        />
      </Field>
      <Field config={descField} htmlFor="process-description" className={fieldSpacing}>
        <Notes
          key={open ? "open" : "shut"}
          defaultValue={values.description}
          onChange={(html) => setValues((s) => ({ ...s, description: html }))}
          placeholder={t("Who does it, when, and what it's for.")}
          className="min-h-32"
        />
      </Field>
      {!editing && (
        <Field config={baselineField} htmlFor="process-baseline" className={fieldSpacing}>
          <Input
            id="process-baseline"
            value={values.baselineLabel}
            onChange={(e) => setValues((s) => ({ ...s, baselineLabel: e.target.value }))}
            placeholder={t("How it worked before")}
            disabled={busy}
          />
        </Field>
      )}
    </FormShellDialog>
  )
}
