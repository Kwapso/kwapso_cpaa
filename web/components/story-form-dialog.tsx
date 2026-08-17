"use client"

// Write-a-story dialog — one piece of work we do. Through the shared FormShell
// (Law R4) with a per-session draft (Law R7), like every other write in the base.
//
// WHAT IS ON THIS FORM AND WHAT IS NOT. A story carries the assignee and the due
// date — it is the ONLY place either lives (.plans/BUILD-1 §2), so they are here.
// There is no TYPE field and there will not be one: the owner settled it, the
// ticket carries the type and the process step carries the classification that
// matters.
//
// The request behind it is OPTIONAL, and the placeholder says so, because four
// out of five stories in the real history stand on their own.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
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
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { Textarea } from "@kwapso/ui/registry/primitives/textarea/textarea"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { Pencil, Plus } from "lucide-react"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { ApiFailure } from "@/lib/api"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

export type StoryFormValues = {
  title: string
  detail: string
  sprintId: string
  /** THE SYSTEM THE WORK IS ON. A story hangs off an app ALWAYS and a sprint only
   * sometimes (the owner's ruling), so this is the field that says where the work
   * belongs — and the one the app's own screen reads back to show its other work. */
  appId: string
  ticketId: string
  assigneeId: string
  dueOn: string
}

/** "Nothing chosen" as a real Select value: an empty string is not selectable in
 * the library's Select, so the absence of a sprint has to be a value of its own
 * rather than a blank the control silently rejects. */
const NONE = "__none__"

const titleField = { ...defaultFieldConfig, label: "What needs doing", required: true }
const detailField = { ...defaultFieldConfig, label: "Detail", required: false }
const sprintField = { ...defaultFieldConfig, label: "Sprint", required: false }
const appField = {
  ...defaultFieldConfig,
  label: "App",
  required: false,
  hint: "The system this work is on. Unsprinted work still belongs somewhere.",
}
const ticketField = {
  ...defaultFieldConfig,
  label: "Request behind it",
  required: false,
  hint: "Optional — most work stands on its own.",
}
const assigneeField = { ...defaultFieldConfig, label: "Who's doing it", required: false }
const dueField = { ...defaultFieldConfig, label: "Due", required: false }

export function StoryFormDialog({
  open,
  onOpenChange,
  sprints,
  apps,
  fixedApp,
  fixedTicket,
  tickets,
  members,
  initial,
  draftKey,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sprints: { id: string; name: string }[]
  apps: { id: string; name: string }[]
  /** Set when the form is opened FROM an app's own screen — the app is then a
   * fact about where you are standing rather than a question, so the picker is
   * replaced by its name and cannot be changed by accident. */
  fixedApp?: { id: string; name: string }
  /** The same, from a TICKET: "turn this request into a piece of work". It is
   * the first of the three ways a ticket becomes a story, and the request behind
   * the work is the one thing about it nobody should be able to mistype. */
  fixedTicket?: { id: string; label: string }
  tickets: { id: string; label: string }[]
  members: { id: string; name: string }[]
  /** Present = editing an existing story. */
  initial?: StoryFormValues
  draftKey?: string
  onSubmit: (values: StoryFormValues) => Promise<void>
}) {
  const t = useT()
  const editing = initial !== undefined
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    initial ?? { title: "", detail: "", sprintId: "", appId: "", ticketId: "", assigneeId: "", dueOn: "" },
    open
  )
  const [busy, setBusy] = React.useState(false)
  const ready = values.title.trim() !== ""

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      await onSubmit({
        title: values.title.trim(),
        detail: values.detail.trim(),
        sprintId: values.sprintId,
        appId: fixedApp ? fixedApp.id : values.appId,
        ticketId: fixedTicket ? fixedTicket.id : values.ticketId,
        assigneeId: values.assigneeId,
        dueOn: values.dueOn.trim(),
      })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't save the story.")
    } finally {
      setBusy(false)
    }
  }

  /** One picker, three times over — sprint, request, person. Each may be left
   * empty, which the door reads as "not set" rather than "cleared to nothing". */
  const picker = (
    id: string,
    value: string,
    placeholder: string,
    options: { id: string; label: string }[],
    set: (v: string) => void
  ) => (
    <Select value={value || NONE} onValueChange={(v) => set(v === NONE ? "" : v)} disabled={busy}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <FormShellDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      clearDraft={clearDraft}
      onSubmit={submit}
      title={<DialogTitle>{editing ? "Edit story" : "New story"}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {editing
            ? "Change what it says, who has it, or when it's due."
            : "One piece of work, on one app. It's the only place an owner and a date live."}
        </DialogDescription>
      }
      footer={
        <Button type="submit" disabled={busy || !ready} className="gap-1.5">
          {busy ? <Spinner /> : editing ? <Pencil className="size-4" /> : <Plus className="size-4" />}
          {busy ? "Saving…" : editing ? "Save changes" : "Add it"}
        </Button>
      }
    >
      <Field config={titleField} htmlFor="story-title" className={fieldSpacing}>
        <Input
          id="story-title"
          value={values.title}
          onChange={(e) => setValues((s) => ({ ...s, title: e.target.value }))}
          placeholder={t("e.g. Move dispatch onto the driver app")}
          disabled={busy}
          autoFocus
        />
      </Field>
      <Field config={detailField} htmlFor="story-detail" className={fieldSpacing}>
        <Textarea
          id="story-detail"
          value={values.detail}
          onChange={(e) => setValues((s) => ({ ...s, detail: e.target.value }))}
          placeholder={t("What good looks like when it's finished.")}
          disabled={busy}
          rows={3}
        />
      </Field>
      <Field config={sprintField} htmlFor="story-sprint" className={fieldSpacing}>
        {picker(
          "story-sprint",
          values.sprintId,
          "No sprint yet",
          sprints.map((s) => ({ id: s.id, label: s.name })),
          (v) => setValues((s) => ({ ...s, sprintId: v }))
        )}
      </Field>
      <Field config={appField} htmlFor="story-app" className={fieldSpacing}>
        {fixedApp ? (
          <p className="text-muted-foreground text-sm" id="story-app">
            {fixedApp.name}
          </p>
        ) : (
          picker(
            "story-app",
            values.appId,
            "No app yet",
            apps.map((a) => ({ id: a.id, label: a.name })),
            (v) => setValues((s) => ({ ...s, appId: v }))
          )
        )}
      </Field>
      <Field config={ticketField} htmlFor="story-ticket" className={fieldSpacing}>
        {fixedTicket ? (
          <p className="text-muted-foreground text-sm" id="story-ticket">
            {fixedTicket.label}
          </p>
        ) : (
          picker(
            "story-ticket",
            values.ticketId,
            "No request behind it",
            tickets,
            (v) => setValues((s) => ({ ...s, ticketId: v }))
          )
        )}
      </Field>
      <Field config={assigneeField} htmlFor="story-assignee" className={fieldSpacing}>
        {picker(
          "story-assignee",
          values.assigneeId,
          "Nobody yet",
          members.map((m) => ({ id: m.id, label: m.name })),
          (v) => setValues((s) => ({ ...s, assigneeId: v }))
        )}
      </Field>
      <Field config={dueField} htmlFor="story-due" className={fieldSpacing}>
        <Input
          id="story-due"
          type="date"
          value={values.dueOn}
          onChange={(e) => setValues((s) => ({ ...s, dueOn: e.target.value }))}
          disabled={busy}
        />
      </Field>
    </FormShellDialog>
  )
}
