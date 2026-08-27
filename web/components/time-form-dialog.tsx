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

import { DialogDescription, DialogTitle } from "@shared/ui/controls/dialog/dialog"
import { Field } from "@shared/web/field"
import { Input } from "@shared/ui/controls/input/input"
import { Switch } from "@shared/ui/controls/switch/switch"
import { Textarea } from "@shared/ui/controls/textarea/textarea"
import { toast } from "@shared/ui/controls/sonner/sonner"
import { defaultFieldConfig } from "@shared/web/screen-engine/config"

import { ApiFailure } from "@/lib/api"
import { pickerKey, searchWorkTargets } from "@/lib/picker-sources"
import { RecordPicker } from "@/components/record-picker"
import { useActiveTeam } from "@/lib/use-active-team"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { toLocalInput, toMoment } from "@shared/web/format"
import { useFormDraft } from "@shared/web/use-form-draft"
import type { WorkLog } from "@shared/types"
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
  fixedTarget,
  initial,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  draftKey?: string
  /** Set when the form is opened FROM the record's own Work logs tab — what the
   * time is against is then a fact about where you are standing rather than a
   * question, so the picker is replaced by its name.
   *
   * It is also the ONLY way to log time against a task or a meeting by hand: the
   * picker below offers stories and tickets, because a list of every task in the
   * agency is not a control anybody could use. Standing on the record answers
   * that question better than any dropdown could. */
  fixedTarget?: { table: string; id: string; label: string }
  /** present = CORRECT this row (prefilled, target fixed); absent = log new time */
  initial?: WorkLog | null
  onSubmit: (values: TimeFormValues) => Promise<void>
}) {
  const t = useT()
  const isEdit = !!initial
  const teamId = useActiveTeam().ctx?.team?.id ?? null
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    {
      target: initial
        ? `${initial.targetTable}:${initial.targetId}`
        : fixedTarget
          ? `${fixedTarget.table}:${fixedTarget.id}`
          : "",
      startedAt: toLocalInput(initial?.startedAt ?? null),
      endedAt: toLocalInput(initial?.endedAt ?? null),
      note: initial?.note ?? "",
      kind: initial?.kind ?? "",
      billable: initial ? initial.billable : true,
    },
    open
  )
  const [busy, setBusy] = React.useState(false)
  // The target is read off the prop rather than the draft when it is fixed: a
  // draft saved on ANOTHER record before this form knew about fixed targets
  // would otherwise restore that record's id under this record's label.
  const target = fixedTarget ? `${fixedTarget.table}:${fixedTarget.id}` : values.target
  const ready = target !== "" && values.startedAt !== "" && values.endedAt !== ""

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    const [targetTable, targetId] = target.split(":")
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
            ? t("Couldn't save that correction.")
            : t("Couldn't log that time.")
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
      onSubmit={submit}
      title={<DialogTitle>{isEdit ? t("Correct this time") : t("Log time")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {isEdit
            ? t("Fix what was written down. The change is kept in the record's history, with your name on it.")
            : t("For work already finished. Say when it started and when it stopped, we work out the rest.")}
        </DialogDescription>
      }
      submit={{
        busy: busy,
        disabled: !ready,
      }}
    >
      <Field config={workField} htmlFor="time-target" className={fieldSpacing}>
        {isEdit || fixedTarget ? (
          // A FACT, NOT A CONTROL. On a correction because the door never moves a
          // row from a story to a ticket, so a picker here would offer a change
          // the server would quietly drop; on a new entry opened from a record
          // because the record IS the answer.
          <p id="time-target" className="text-muted-foreground border-border/60 rounded-[var(--radius)] border px-3 py-2 text-sm">
            {fixedTarget ? fixedTarget.label : (initial?.targetLabel ?? "—")}
          </p>
        ) : (
          // BOTH HALVES PAGE (R14), so both are asked of their own door. This
          // used to read the two list caches, which hold page one each — so an
          // agency past its newest fifty stories could not log time against the
          // fifty-first, and the control gave no sign of it.
          <RecordPicker
            id="time-target"
            value={values.target}
            onChange={(v) => setValues((s) => ({ ...s, target: v }))}
            search={(term) => searchWorkTargets(term, { story: t("Story"), ticket: t("Ticket") })}
            searchKey={pickerKey("work", teamId)}
            placeholder={t("Pick a story or a ticket")}
            searchPlaceholder={t("Search work…")}
            emptyText={t("Nothing matched.")}
            disabled={busy}
          />
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
