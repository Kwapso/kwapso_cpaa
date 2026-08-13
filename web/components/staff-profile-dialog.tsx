"use client"

// A colleague's profile — what they are like and how they work best.
//
// This is the longest form in the app and the hardest to retype, because its
// answers are a conversation somebody had with a colleague rather than facts
// they can look up again. That is why the draft rule (R7) matters more here than
// anywhere else: a mis-tap on a phone half way through writing up a personality
// conversation should not cost the conversation.
//
// The wording is deliberately plain and deliberately kind. "What they are best
// at" and "what they find hard" are the same two fields the legacy app called
// strengths and weaknesses, asked the way a manager would actually ask them —
// and the subtitle says out loud who can read the answer, because somebody
// writing this about a colleague should know before they write it, not after.
//
// Library primitives, FormShell, per-session draft (R4 + R7).

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { DialogDescription, DialogTitle } from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Textarea } from "@kwapso/ui/registry/primitives/textarea/textarea"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { ApiFailure, content } from "@/lib/api"
import { FilePicker } from "@/components/file-picker"
import { useFormDraft } from "@shared/web/use-form-draft"

export type StaffProfileValues = {
  headline: string
  personalityType: string
  strengths: string
  weaknesses: string
  roleModels: string
  about: string
  photoUrl: string
}

const EMPTY: StaffProfileValues = {
  headline: "",
  personalityType: "",
  strengths: "",
  weaknesses: "",
  roleModels: "",
  about: "",
  photoUrl: "",
}

export function StaffProfileDialog({
  open,
  onOpenChange,
  onSubmit,
  subjectName,
  initial,
  draftKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: StaffProfileValues) => Promise<void>
  /** whose profile this is — the form says the name out loud, because writing
   * one about the wrong colleague is the mistake this form can actually make. */
  subjectName: string
  initial?: Partial<StaffProfileValues>
  draftKey?: string
}) {
  const [values, setValues, clearDraft] = useFormDraft(draftKey, { ...EMPTY, ...initial }, open)
  const [busy, setBusy] = React.useState(false)

  const set = (key: keyof StaffProfileValues) => (v: string) =>
    setValues((prev) => ({ ...prev, [key]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await onSubmit({
        headline: values.headline.trim(),
        personalityType: values.personalityType.trim(),
        strengths: values.strengths.trim(),
        weaknesses: values.weaknesses.trim(),
        roleModels: values.roleModels.trim(),
        about: values.about.trim(),
        photoUrl: values.photoUrl.trim(),
      })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't save the profile.")
    } finally {
      setBusy(false)
    }
  }

  const text = (key: keyof StaffProfileValues, label: string, placeholder: string) => (
    <Field config={{ ...defaultFieldConfig, label }} htmlFor={`staff-${key}`} className={fieldSpacing}>
      <Input
        id={`staff-${key}`}
        value={values[key]}
        onChange={(e) => set(key)(e.target.value)}
        placeholder={placeholder}
        disabled={busy}
      />
    </Field>
  )

  const photoField = { ...defaultFieldConfig, label: "Photo", required: false }

  const prose = (key: keyof StaffProfileValues, label: string, placeholder: string) => (
    <Field config={{ ...defaultFieldConfig, label }} htmlFor={`staff-${key}`} className={fieldSpacing}>
      <Textarea
        id={`staff-${key}`}
        value={values[key]}
        onChange={(e) => set(key)(e.target.value)}
        placeholder={placeholder}
        disabled={busy}
        rows={4}
      />
    </Field>
  )

  return (
    <FormShellDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      clearDraft={clearDraft}
      onSubmit={submit}
      title={<DialogTitle>{subjectName}&apos;s profile</DialogTitle>}
      subtitle={
        <DialogDescription>
          Anyone on the team can read this. No client ever can — it doesn&apos;t appear in the portal,
          and no client login can reach it.
        </DialogDescription>
      }
      footer={
        <Button type="submit" disabled={busy}>
          {busy ? <Spinner /> : null}
          {busy ? "Saving…" : "Save profile"}
        </Button>
      }
    >
      {text("headline", "In one line", "How you would introduce them to a new client")}
      {text("personalityType", "Personality type", "From whichever test you use — Myers-Briggs, DISC, Enneagram")}
      {prose("strengths", "What they are best at", "The work you would give them first.")}
      {prose("weaknesses", "What they find hard", "Written kindly — this is here to help people work together.")}
      {text("roleModels", "Who they look up to", "People, or ways of working")}
      {prose("about", "Anything else", "The rest of the picture.")}
      {/* THE PHOTO ITSELF. This field used to ask for "a link, or the URL of a
          file you uploaded" — with nowhere in the app to upload one, so the
          only honest answer was a link to somewhere else. The door has always
          been there; this is the control for it. */}
      <Field config={photoField} htmlFor="staff-photo" className={fieldSpacing}>
        <FilePicker
          id="staff-photo"
          value={values.photoUrl}
          onChange={(url) => set("photoUrl")(url)}
          upload={(dataUrl) => content.uploadStaffFile(dataUrl).then((r) => r.url)}
          accept="image/*"
          disabled={busy}
        />
      </Field>
    </FormShellDialog>
  )
}
