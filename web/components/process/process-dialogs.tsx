"use client"

// THE TWO DIALOGS A PROCESS MAP OPENS — moved out of `process-detail.tsx` on
// 26 Aug 2026, when that file passed 1,400 lines.
//
// They were always separate FUNCTIONS at the foot of the screen; what they were
// not was a separate FILE, so every reader of the map's own logic scrolled past
// 160 lines of form to reach the end of it. Nothing about either changed in the
// move: same props, same copy, same behaviour. That is the whole point of
// taking these two first — a screen with a genuine seam already in it is the
// one place a split can be proved by the type checker alone.

import * as React from "react"
import { DialogDescription, DialogTitle } from "@shared/ui/controls/dialog/dialog"
import { Input } from "@shared/ui/controls/input/input"
import { Field } from "@shared/web/field"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { defaultFieldConfig } from "@shared/web/screen-engine/config"
import { toast } from "@shared/ui/controls/sonner/sonner"
import { RecordPicker } from "@/components/record-picker"
import { ApiFailure } from "@/lib/api"
import { useT } from "@shared/web/language"

/** MOVE THE DAY THE SAVING IS MEASURED FROM.
 *
 * It warns, in the sentence rather than in a tone: this is the only control in
 * the module that changes a number a client is already looking at without
 * changing a single minute on the map, and somebody who does not know that will
 * move it to tidy something up.
 *
 * The stops it offers are the days the map actually changed, plus a free date —
 * because the audit date is Alex's VISIT, which may be a day nothing was
 * recorded on. */
export function AuditDateDialog({
  open,
  onOpenChange,
  current,
  stops,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  current: string
  stops: string[]
  onSubmit: (day: string) => Promise<void>
}) {
  const t = useT()
  const [day, setDay] = React.useState(current)
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    if (open) setDay(current)
  }, [open, current])

  return (
    <FormShellDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      onSubmit={async (e: React.FormEvent) => {
        e.preventDefault()
        setBusy(true)
        try {
          await onSubmit(day)
          onOpenChange(false)
        } catch (err) {
          toast.error(err instanceof ApiFailure ? err.message : t("Couldn't move the date."))
        } finally {
          setBusy(false)
        }
      }}
      title={<DialogTitle>{t("Change the audit date")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {t("Every saving on this map is measured from this day, here and on the client's own portal. Moving it changes those figures without changing a single step.")}
        </DialogDescription>
      }
      submit={{ busy, disabled: !day || day === current }}
    >
      <Field
        config={{ ...defaultFieldConfig, label: "The day the audit happened", required: true }}
        htmlFor="audit-date"
        className={fieldSpacing}
      >
        <Input
          id="audit-date"
          type="date"
          value={day}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDay(e.target.value)}
          disabled={busy}
        />
      </Field>
      {stops.length > 1 && (
        <p className="text-muted-foreground text-xs">
          {t("This map changed on")}: {stops.join(", ")}
        </p>
      )}
    </FormShellDialog>
  )
}

/** CONNECT ONE MAP TO ANOTHER. Loose, by the owner's ruling — the note says what
 * the connection IS, and nothing about either map moves because of it. */
export function ConnectProcessDialog({
  open,
  onOpenChange,
  options,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: { value: string; label: string }[]
  onSubmit: (toProcessId: string, note: string) => Promise<void>
}) {
  const t = useT()
  const [to, setTo] = React.useState("")
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    if (open) {
      setTo("")
      setNote("")
    }
  }, [open])

  return (
    <FormShellDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      onSubmit={async (e: React.FormEvent) => {
        e.preventDefault()
        if (!to) return
        setBusy(true)
        try {
          await onSubmit(to, note.trim())
          onOpenChange(false)
        } catch (err) {
          toast.error(err instanceof ApiFailure ? err.message : t("Couldn't connect those."))
        } finally {
          setBusy(false)
        }
      }}
      title={<DialogTitle>{t("Connect a process")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {t("A signpost, not a rule. Nothing about either map's times or savings changes because of it.")}
        </DialogDescription>
      }
      submit={{ busy, disabled: !to }}
    >
      <Field
        config={{ ...defaultFieldConfig, label: "It hands its work to", required: true }}
        htmlFor="link-to"
        className={fieldSpacing}
      >
        <RecordPicker
          value={to}
          onChange={setTo}
          options={options}
          placeholder={t("Pick a process")}
          searchPlaceholder={t("Search processes…")}
          emptyText={t("Nothing matched.")}
          className="w-full"
        />
      </Field>
      <Field
        config={{ ...defaultFieldConfig, label: "What the connection is", required: false }}
        htmlFor="link-note"
        className={fieldSpacing}
      >
        <Input
          id="link-note"
          value={note}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNote(e.target.value)}
          placeholder={t("e.g. the last step here is the first step there")}
          disabled={busy}
        />
      </Field>
    </FormShellDialog>
  )
}
