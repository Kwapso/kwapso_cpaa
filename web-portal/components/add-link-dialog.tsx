"use client"

// ADD A LINK TO A TICKET — a name and an address (CHECKLIST 5.10).
//
// A file is picked, so it needs no form; a link is TYPED, so it does. Two fields
// is the whole of it: what the thing is called, and where it lives. The client
// side of a support conversation is often "look at this page" — a staging URL, a
// shared document, a recording — and until now there was nowhere to put one.
//
// R4: renders through the shared FormShell, imported rather than copied — the
// same one the agency app and the raise-ticket dialog use.
// R7: the draft survives navigating away, because somebody pasting a long URL on
// a phone must not lose it to a stray tap.
//
// UI-RULEBOOK F1 and F4 on the footer: the submit button says "Submit" and its
// busy label is "Submitting…", with Cancel beside it — right-aligned after
// Submit on a desktop, and to the LEFT of it on a phone, so the option that
// throws work away is never under the thumb's resting position. (The portal's
// other form, raise-ticket-dialog, still says "Send it" with no Cancel; F1's own
// instruction is to fix that class of drift by giving FormShell a footer it
// renders itself, which is a change to shared/ and not this file's to make.)

import * as React from "react"

import { Button } from "@shared/ui/controls/button/button"
import { DialogDescription, DialogTitle } from "@shared/ui/controls/dialog/dialog"
import { Field } from "@shared/web/field"
import { Input } from "@shared/ui/controls/input/input"
import { Spinner } from "@shared/ui/controls/spinner/spinner"
import { toast } from "@shared/ui/controls/sonner/sonner"
import { defaultFieldConfig } from "@shared/web/screen-engine/config"
import { Plus } from "@shared/ui/icons"

import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"
import { ApiFailure } from "@/lib/api"

export function AddLinkDialog({
  open,
  onOpenChange,
  onSubmit,
  draftKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: { label: string; url: string }) => Promise<void>
  /** stable id for per-session draft persistence (CACHING.md §11) */
  draftKey: string
}) {
  const t = useT()
  const [values, setValues, clearDraft] = useFormDraft(draftKey, { label: "", url: "" }, open)
  const [busy, setBusy] = React.useState(false)

  // Built HERE rather than at module level, which is the whole reason the two
  // configs are inside the component: a label composed once when the module
  // loads is frozen in whichever language the tab started in, and the language
  // switcher changes React state without re-mounting anything.
  const labelField = { ...defaultFieldConfig, label: t("What is it?"), required: true }
  const urlField = { ...defaultFieldConfig, label: t("The link"), required: true }

  const ready = values.label.trim().length > 0 && values.url.trim().length > 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    try {
      await onSubmit({ label: values.label.trim(), url: values.url.trim() })
      clearDraft()
      onOpenChange(false)
      toast.success(t("Added. We can see it now."))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't add that. Try again."))
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
      title={<DialogTitle>{t("Add a link")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {t("Point us at a page, a document or a recording, and give it a name we'll recognise.")}
        </DialogDescription>
      }
      footer={
        <div className="flex w-full gap-2 sm:w-auto sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="flex-1 sm:order-2 sm:flex-none"
            disabled={busy}
            onClick={() => {
              clearDraft()
              onOpenChange(false)
            }}
          >
            {t("Cancel")}
          </Button>
          <Button
            type="submit"
            size="lg"
            className="flex-1 sm:order-1 sm:flex-none"
            disabled={busy || !ready}
          >
            {busy ? <Spinner /> : <Plus className="size-3.5" />}
            {busy ? t("Submitting…") : t("Submit")}
          </Button>
        </div>
      }
    >
      <Field config={labelField} htmlFor="attachment-label" className={fieldSpacing}>
        <Input
          id="attachment-label"
          value={values.label}
          onChange={(e) => setValues((v) => ({ ...v, label: e.target.value }))}
          placeholder={t("For example: the booking page that's wrong")}
          disabled={busy}
          autoFocus
        />
      </Field>
      <Field config={urlField} htmlFor="attachment-url" className={fieldSpacing}>
        {/* type="url" so a phone offers the right keyboard. The browser's own
         * validation is a courtesy, not the check: the door caps and type-checks
         * the string, and the list only turns a web address into something
         * clickable (ticket-attachments.tsx says why). */}
        <Input
          id="attachment-url"
          type="url"
          inputMode="url"
          value={values.url}
          onChange={(e) => setValues((v) => ({ ...v, url: e.target.value }))}
          placeholder="https://"
          disabled={busy}
        />
      </Field>
    </FormShellDialog>
  )
}
