"use client"

// LOG TIME BY HAND — always available (.plans/BUILD-1 §5), because half of real
// time is remembered rather than clocked. Through the shared FormShell (Law R4)
// with a per-session draft (Law R7).
//
// TWO MOMENTS, NOT A DURATION. The form asks when the work started and when it
// finished, and the server computes the seconds between them. A "how many hours"
// box would be one field fewer and would produce a number nobody can check
// afterwards — "was that Tuesday morning or Tuesday afternoon?" has an answer
// here and none there.

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
import { Switch } from "@kwapso/ui/registry/primitives/switch/switch"
import { Textarea } from "@kwapso/ui/registry/primitives/textarea/textarea"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { Plus } from "lucide-react"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { ApiFailure } from "@/lib/api"
import { helpKey, listFetch, storiesKey } from "@/lib/live-resources"
import { useActiveTeam } from "@/lib/use-active-team"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useCached } from "@shared/web/store"
import type { HelpTicket, Story } from "@shared/types"

export type TimeFormValues = {
  targetTable: string
  targetId: string
  startedAt: string
  endedAt: string
  note: string
  billable: boolean
}

const workField = { ...defaultFieldConfig, label: "What you worked on", required: true }
const startField = { ...defaultFieldConfig, label: "Started", required: true }
const endField = { ...defaultFieldConfig, label: "Finished", required: true }
const noteField = { ...defaultFieldConfig, label: "Note", required: false }
const billableField = {
  ...defaultFieldConfig,
  label: "Billable",
  required: false,
  hint: "On unless you say otherwise.",
}

/** `<input type="datetime-local">` hands back "2026-08-12T09:00" in the browser's
 * own zone with no offset. Turning it into a real instant is the browser's job,
 * not the server's — `new Date(local)` reads it in the zone the person is sitting
 * in, which is the zone they meant. */
function toInstant(local: string): string {
  const ms = Date.parse(local)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : ""
}

export function TimeFormDialog({
  open,
  onOpenChange,
  draftKey,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  draftKey?: string
  onSubmit: (values: TimeFormValues) => Promise<void>
}) {
  const teamId = useActiveTeam().ctx?.team?.id ?? null
  const storiesQ = useCached<Story[]>(teamId ? storiesKey(teamId) : null, () =>
    listFetch.stories(teamId as string)
  )
  const ticketsQ = useCached<HelpTicket[]>(teamId ? helpKey(teamId, "all") : null, () =>
    listFetch.help(teamId as string)
  )
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    { target: "", startedAt: "", endedAt: "", note: "", billable: true },
    open
  )
  const [busy, setBusy] = React.useState(false)
  const ready = values.target !== "" && values.startedAt !== "" && values.endedAt !== ""

  // Both loggable kinds in ONE picker, each carrying its table — because the
  // question a person is answering is "what were you working on", not "which
  // table does the thing you were working on live in".
  const options = [
    ...(storiesQ.data ?? [])
      .filter((s) => s.status !== "done")
      .map((s) => ({ value: `stories:${s.id}`, label: s.ref ? `${s.ref} · ${s.title}` : s.title })),
    ...(ticketsQ.data ?? [])
      .filter((t) => t.status !== "resolved")
      .map((t) => ({
        value: `help:${t.id}`,
        label: t.ref ? `${t.ref} · ${t.description.slice(0, 60)}` : t.description.slice(0, 60),
      })),
  ]

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    const [targetTable, targetId] = values.target.split(":")
    setBusy(true)
    try {
      await onSubmit({
        targetTable,
        targetId,
        startedAt: toInstant(values.startedAt),
        endedAt: toInstant(values.endedAt),
        note: values.note.trim(),
        billable: values.billable,
      })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't log that time.")
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
      title={<DialogTitle>Log time</DialogTitle>}
      subtitle={
        <DialogDescription>
          For work already finished. Say when it started and when it stopped — we work out the rest.
        </DialogDescription>
      }
      footer={
        <Button type="submit" disabled={busy || !ready} className="gap-1.5">
          {busy ? <Spinner /> : <Plus className="size-4" />}
          {busy ? "Saving…" : "Log it"}
        </Button>
      }
    >
      <Field config={workField} htmlFor="time-target" className={fieldSpacing}>
        <Select
          value={values.target}
          onValueChange={(v) => setValues((s) => ({ ...s, target: v }))}
          disabled={busy}
        >
          <SelectTrigger id="time-target">
            <SelectValue placeholder="Pick a story or a ticket" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field config={startField} htmlFor="time-start" className={fieldSpacing}>
        <Input
          id="time-start"
          type="datetime-local"
          value={values.startedAt}
          onChange={(e) => setValues((s) => ({ ...s, startedAt: e.target.value }))}
          disabled={busy}
        />
      </Field>
      <Field config={endField} htmlFor="time-end" className={fieldSpacing}>
        <Input
          id="time-end"
          type="datetime-local"
          value={values.endedAt}
          onChange={(e) => setValues((s) => ({ ...s, endedAt: e.target.value }))}
          disabled={busy}
        />
      </Field>
      <Field config={noteField} htmlFor="time-note" className={fieldSpacing}>
        <Textarea
          id="time-note"
          value={values.note}
          onChange={(e) => setValues((s) => ({ ...s, note: e.target.value }))}
          placeholder="What you actually did."
          disabled={busy}
          rows={2}
        />
      </Field>
      <Field config={billableField} htmlFor="time-billable" className={fieldSpacing}>
        <Switch
          id="time-billable"
          checked={values.billable}
          onCheckedChange={(v: boolean) => setValues((s) => ({ ...s, billable: v }))}
          disabled={busy}
        />
      </Field>
    </FormShellDialog>
  )
}
