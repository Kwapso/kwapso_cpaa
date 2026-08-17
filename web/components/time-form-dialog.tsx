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
//
// AND IT CORRECTS ONE TOO (`initial`). Every number this app can show about how
// long something took is a sum of these rows, so a mistyped hour is a wrong
// figure on somebody's screen until it is fixed — and until now it could only be
// fixed by asking the assistant. The one thing the correction cannot change is
// WHAT the time was against: the door does not move a row between a story and a
// ticket, so the form shows it as a fact rather than offering a picker that
// would silently do nothing.

import * as React from "react"

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
import { Switch } from "@kwapso/ui/registry/primitives/switch/switch"
import { Textarea } from "@kwapso/ui/registry/primitives/textarea/textarea"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { ApiFailure } from "@/lib/api"
import { helpKey, listFetch, storiesKey } from "@/lib/live-resources"
import { useActiveTeam } from "@/lib/use-active-team"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { toLocalInput, toMoment } from "@shared/web/format"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useCached } from "@shared/web/store"
import type { HelpTicket, Story, WorkLog } from "@shared/types"
import { useT } from "@shared/web/language"

export type TimeFormValues = {
  targetTable: string
  targetId: string
  startedAt: string
  endedAt: string
  note: string
  /** the kind of work, so a margin can group by it. Free text on purpose: the
   * kinds an agency bills are its own vocabulary, and a picker fed from the
   * internal rate card would show what our hours cost to anybody who may log
   * time — a different permission entirely. */
  kind: string
  billable: boolean
}

const workField = { ...defaultFieldConfig, label: "What you worked on", required: true }
const startField = { ...defaultFieldConfig, label: "Started", required: true }
const endField = { ...defaultFieldConfig, label: "Finished", required: true }
const kindField = { ...defaultFieldConfig, label: "Kind of work", required: false }
const noteField = { ...defaultFieldConfig, label: "Note", required: false }
const billableField = {
  ...defaultFieldConfig,
  label: "Billable",
  required: false,
  hint: "On unless you say otherwise.",
}

export function TimeFormDialog({
  open,
  onOpenChange,
  draftKey,
  initial,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  draftKey?: string
  /** present = CORRECT this row (prefilled, target fixed); absent = log new time */
  initial?: WorkLog | null
  onSubmit: (values: TimeFormValues) => Promise<void>
}) {
  const t = useT()
  const isEdit = !!initial
  const teamId = useActiveTeam().ctx?.team?.id ?? null
  // A correction needs neither list: what it is against cannot move, so the two
  // pickers would be two requests to fill a control nobody can use.
  const storiesQ = useCached<Story[]>(teamId && !isEdit ? storiesKey(teamId) : null, () =>
    listFetch.stories(teamId as string)
  )
  const ticketsQ = useCached<HelpTicket[]>(teamId && !isEdit ? helpKey(teamId, "all") : null, () =>
    listFetch.help(teamId as string)
  )
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    {
      target: initial ? `${initial.targetTable}:${initial.targetId}` : "",
      startedAt: toLocalInput(initial?.startedAt ?? null),
      endedAt: toLocalInput(initial?.endedAt ?? null),
      note: initial?.note ?? "",
      kind: initial?.kind ?? "",
      billable: initial ? initial.billable : true,
    },
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
        startedAt: toMoment(values.startedAt),
        endedAt: toMoment(values.endedAt),
        note: values.note.trim(),
        kind: values.kind.trim(),
        billable: values.billable,
      })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof ApiFailure
          ? err.message
          : isEdit
            ? "Couldn't save that correction."
            : "Couldn't log that time."
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
      title={<DialogTitle>{isEdit ? "Correct this time" : "Log time"}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {isEdit
            ? "Fix what was written down. The change is kept in the record's history, with your name on it."
            : "For work already finished. Say when it started and when it stopped, we work out the rest."}
        </DialogDescription>
      }
      submit={{
        busy: busy,
        disabled: !ready,
      }}
    >
      <Field config={workField} htmlFor="time-target" className={fieldSpacing}>
        {isEdit ? (
          // A FACT, NOT A CONTROL. The door corrects a row; it never moves one
          // from a story to a ticket, so offering the picker here would be
          // offering a change the server would quietly drop.
          <p id="time-target" className="text-muted-foreground border-border/60 rounded-md border px-3 py-2 text-sm">
            {initial?.targetLabel ?? "—"}
          </p>
        ) : (
          <Select
            value={values.target}
            onValueChange={(v) => setValues((s) => ({ ...s, target: v }))}
            disabled={busy}
          >
            <SelectTrigger id="time-target">
              <SelectValue placeholder={t("Pick a story or a ticket")} />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
      <Field config={kindField} htmlFor="time-kind" className={fieldSpacing}>
        <Input
          id="time-kind"
          value={values.kind}
          onChange={(e) => setValues((s) => ({ ...s, kind: e.target.value }))}
          placeholder={t("Development, design, project management…")}
          disabled={busy}
        />
      </Field>
      <Field config={noteField} htmlFor="time-note" className={fieldSpacing}>
        <Textarea
          id="time-note"
          value={values.note}
          onChange={(e) => setValues((s) => ({ ...s, note: e.target.value }))}
          placeholder={t("What you actually did.")}
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
