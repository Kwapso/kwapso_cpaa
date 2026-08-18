"use client"

// A PIECE OF OUR OWN ADMIN — the quarterly VAT return, a domain renewal, next
// week's review. Nobody outside the agency ever sees one, which is why this form
// has no Send in it. Through the shared FormShell (Law R4) with a per-session
// draft (Law R7).
//
// ── WHAT THE DEPARTMENT DECIDES ────────────────────────────────────────────────
//
// Picking a department REVEALS the second field it needs: Production names the
// app the work is on, Sales names the client it is for, Admin may name one. The
// field appears the moment the department is chosen rather than being discovered
// on save, which is the whole complaint — and the rule itself lives in
// shared/departments.ts, once, so what this form SHOWS and what the door
// REQUIRES cannot drift apart.
//
// ── WHY THE FILE IS NOT IN THE DRAFT ───────────────────────────────────────────
//
// The draft is session storage, and a 10 MB base64 attachment in session storage
// is a form that stops saving drafts at all. So the picked file lives in ordinary
// component state: reopening a half-finished task restores every word and asks
// for the file again, which is the honest half to lose.

import * as React from "react"

import { Checkbox } from "@kwapso/ui/registry/primitives/checkbox/checkbox"
import { DialogDescription, DialogTitle } from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Label } from "@kwapso/ui/registry/primitives/label/label"
import { Notes } from "@kwapso/ui/registry/primitives/notes/notes"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { Plus } from "lucide-react"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { FilePicker } from "@/components/file-picker"
import { ApiFailure } from "@/lib/api"
import { PRIORITY_LABEL, departmentAsks, departmentGlyph, priorityScore } from "@shared/departments"
import { pickerKey, searchAccounts } from "@/lib/picker-sources"
import { RecordPicker } from "@/components/record-picker"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { richTextValue } from "@shared/web/rich-text"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

export type TaskFormValues = {
  title: string
  detail: string
  /** WHEN IT HAS TO BE DONE. Called Deadline everywhere a person reads it. */
  dueOn: string
  assigneeId: string
  department: string
  /** the second field, whichever one the department asked for */
  appId: string
  accountId: string
  important: boolean
  urgent: boolean
  /** the picked file, as a data URL — never held in the draft (see above) */
  fileDataUrl: string
  fileName: string
}

/** "Nothing chosen" as a real Select value: an empty string is not selectable in
 * the library's Select, so the absence of a department has to be a value of its
 * own rather than a blank the control silently rejects. */
const NONE = "__none__"

const titleField = { ...defaultFieldConfig, label: "What needs doing", required: true }
const detailField = { ...defaultFieldConfig, label: "Detail", required: false }
const dueField = { ...defaultFieldConfig, label: "Deadline", required: false }
const assigneeField = {
  ...defaultFieldConfig,
  label: "Who's doing it",
  required: false,
  helpText: "Yours unless you say otherwise, an unassigned task is a task nobody picks up.",
}
const departmentField = { ...defaultFieldConfig, label: "Department", required: false }
const fileField = { ...defaultFieldConfig, label: "A photo or a file", required: false }
const priorityField = { ...defaultFieldConfig, label: "How it ranks", required: false }

export function TaskFormDialog({
  open,
  onOpenChange,
  draftKey,
  teamId,
  members,
  apps,
  accounts,
  departments,
  defaultAssigneeId,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  draftKey?: string
  /** the team whose clients the client picker searches — accounts PAGE (R14) */
  teamId: string | null
  members: { id: string; name: string }[]
  apps: { id: string; name: string }[]
  accounts: { id: string; name: string }[]
  departments: string[]
  /** whoever is opening the form — a new task is theirs until they say otherwise */
  defaultAssigneeId: string
  onSubmit: (values: TaskFormValues) => Promise<void>
}) {
  const t = useT()
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    {
      title: "",
      detail: "",
      dueOn: "",
      // THE DEFAULT THE TESTER ASKED FOR, in the draft's own initial value so it
      // survives a reopen: "if we don't assign a responsible when we create it
      // they're just gonna die in the unassigned folder."
      assigneeId: defaultAssigneeId,
      department: "",
      appId: "",
      accountId: "",
      important: false,
      urgent: false,
    },
    open
  )
  const [file, setFile] = React.useState<{ dataUrl: string; name: string } | null>(null)
  const [busy, setBusy] = React.useState(false)

  const asks = departmentAsks(values.department)
  const secondFieldMissing =
    asks.required &&
    ((asks.field === "app" && !values.appId) || (asks.field === "account" && !values.accountId))
  const ready = values.title.trim() !== "" && !secondFieldMissing

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      await onSubmit({
        title: values.title.trim(),
        detail: richTextValue(values.detail),
        dueOn: values.dueOn,
        assigneeId: values.assigneeId,
        department: values.department,
        // Only the field the department actually asked for is sent — switching
        // from Production to Sales half-way through must not quietly file the
        // task under an app nobody can see on it.
        appId: asks.field === "app" ? values.appId : "",
        accountId: asks.field === "account" ? values.accountId : "",
        important: values.important,
        urgent: values.urgent,
        fileDataUrl: file?.dataUrl ?? "",
        fileName: file?.name ?? "",
      })
      clearDraft()
      setFile(null)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't add that task.")
    } finally {
      setBusy(false)
    }
  }

  /** One picker, three times over — person, department, app. Each may be left
   * empty, which the door reads as "not set" rather than "cleared". All three are
   * BOUNDED lists the screen already holds, so the search runs in the browser.
   * The CLIENT picker below is the odd one out: accounts page, so it asks the
   * door. */
  const picker = (
    id: string,
    value: string,
    placeholder: string,
    searchPlaceholder: string,
    options: { id: string; label: string }[],
    set: (v: string) => void
  ) => (
    <RecordPicker
      id={id}
      value={value || NONE}
      onChange={(v) => set(v === NONE ? "" : v)}
      options={options.map((o) => ({ value: o.id, label: o.label }))}
      emptyOption={{ value: NONE, label: placeholder }}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyText={t("Nothing matched.")}
      disabled={busy}
    />
  )

  return (
    <FormShellDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      clearDraft={clearDraft}
      onSubmit={submit}
      title={<DialogTitle>{t("New task")}</DialogTitle>}
      subtitle={<DialogDescription>{t("Our own admin. Time can be logged against it.")}</DialogDescription>}
      submit={{
        busy: busy,
        disabled: !ready,
        icon: <Plus className="size-4" />,
      }}
    >
      <Field config={titleField} htmlFor="task-title" className={fieldSpacing}>
        <Input
          id="task-title"
          value={values.title}
          onChange={(e) => setValues((s) => ({ ...s, title: e.target.value }))}
          placeholder={t("e.g. File the quarterly VAT return")}
          disabled={busy}
          autoFocus
        />
      </Field>
      <Field config={detailField} htmlFor="task-detail" className={fieldSpacing}>
        <Notes
          key={open ? "open" : "shut"}
          defaultValue={values.detail}
          onChange={(html) => setValues((s) => ({ ...s, detail: html }))}
          className="min-h-32"
        />
      </Field>
      <Field config={assigneeField} htmlFor="task-assignee" className={fieldSpacing}>
        {picker(
          "task-assignee",
          values.assigneeId,
          "Nobody yet",
          t("Search people…"),
          members.map((m) => ({ id: m.id, label: m.name })),
          (v) => setValues((s) => ({ ...s, assigneeId: v }))
        )}
      </Field>
      <Field config={departmentField} htmlFor="task-department" className={fieldSpacing}>
        {picker(
          "task-department",
          values.department,
          "No department",
          t("Search departments…"),
          departments.map((d) => ({ id: d, label: `${departmentGlyph(d)} ${d}`.trim() })),
          (v) => setValues((s) => ({ ...s, department: v, appId: "", accountId: "" }))
        )}
      </Field>
      {/* THE SECOND FIELD, revealed by the first. It appears when the department
          is chosen, not on save. */}
      {asks.field === "app" && (
        <Field
          config={{ ...defaultFieldConfig, label: "App", required: asks.required }}
          htmlFor="task-app"
          className={fieldSpacing}
        >
          {picker(
            "task-app",
            values.appId,
            "Which app is it on?",
            t("Search apps…"),
            apps.map((a) => ({ id: a.id, label: a.name })),
            (v) => setValues((s) => ({ ...s, appId: v }))
          )}
        </Field>
      )}
      {asks.field === "account" && (
        <Field
          config={{
            ...defaultFieldConfig,
            label: "Client",
            required: asks.required,
            helpText: asks.required ? "" : "Optional. Leave it off for our own housekeeping.",
          }}
          htmlFor="task-account"
          className={fieldSpacing}
        >
          {/* ACCOUNTS PAGE (R14), so this one asks the door. `accounts` is the
              screen's own page one, painted before anything is typed. */}
          <RecordPicker
            id="task-account"
            value={values.accountId || NONE}
            onChange={(v) => setValues((s) => ({ ...s, accountId: v === NONE ? "" : v }))}
            search={(term) => searchAccounts(term)}
            searchKey={pickerKey("accounts", teamId)}
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            emptyOption={{ value: NONE, label: t("Which client is it for?") }}
            placeholder={t("Which client is it for?")}
            searchPlaceholder={t("Search clients…")}
            emptyText={t("No client matched.")}
            disabled={busy}
          />
        </Field>
      )}
      <Field config={dueField} htmlFor="task-due" className={fieldSpacing}>
        <Input
          id="task-due"
          type="date"
          value={values.dueOn}
          onChange={(e) => setValues((s) => ({ ...s, dueOn: e.target.value }))}
          disabled={busy}
        />
      </Field>
      {/* THE EISENHOWER PAIR. Two ticks, not a high/medium/low word: "important"
          and "urgent" are different questions and the old picker asked one. The
          line underneath says which of the four the two ticks make, so nobody has
          to know the arithmetic to use it. */}
      <Field config={priorityField} htmlFor="task-important" className={fieldSpacing}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="task-important"
              checked={values.important}
              onCheckedChange={(c) => setValues((s) => ({ ...s, important: c === true }))}
              disabled={busy}
            />
            <Label htmlFor="task-important" className="text-sm font-normal">
              {t("Important, it moves something that matters")}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="task-urgent"
              checked={values.urgent}
              onCheckedChange={(c) => setValues((s) => ({ ...s, urgent: c === true }))}
              disabled={busy}
            />
            <Label htmlFor="task-urgent" className="text-sm font-normal">
              {t("Urgent, it has to happen soon")}
            </Label>
          </div>
          <p className="text-muted-foreground text-xs">
            {`${t("Priority")} ${priorityScore(values.important, values.urgent)} · ${t(
              PRIORITY_LABEL[priorityScore(values.important, values.urgent)]
            )}`}
          </p>
        </div>
      </Field>
      <Field config={fileField} htmlFor="task-file" className={fieldSpacing}>
        <FilePicker
          id="task-file"
          value={file ? file.name : ""}
          onChange={(v) => {
            if (!v) setFile(null)
          }}
          // NOT AN UPLOAD DOOR OF ITS OWN. The bytes ride the create call, which
          // is the same shape a to-do's attachment uses — one door, one gate, one
          // cap, and nothing orphaned in a bucket if the form is abandoned.
          upload={async (dataUrl, fileName) => {
            setFile({ dataUrl, name: fileName })
            return fileName
          }}
          disabled={busy}
        />
      </Field>
    </FormShellDialog>
  )
}
