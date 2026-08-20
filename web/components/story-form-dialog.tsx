"use client"

// Write-a-story dialog — one piece of work we do. Through the shared FormShell
// (Law R4) with a per-session draft (Law R7), like every other write in the base.
//
// THE APP COMES FIRST, and that is CHECKLIST 6.1 rather than a layout preference.
// Three of the fields below are NARROWED BY IT: the sprints are that app's, the
// open tickets are that app's, and the processes are that app's maps. Asking for
// the app last meant every one of those pickers offered the whole agency's
// inventory until the very field that could narrow them had been answered. First
// the system, then the work on it.
//
// AND THE EDIT SCREEN IS THIS SCREEN. The owner's standing rule — "any change to
// a form must be reflected in the edit screen unless he says otherwise" — is kept
// here by construction rather than by discipline: there is one dialog, `initial`
// decides whether it is a create or an edit, and both call sites hand it the same
// four option lists. A field added below appears on both, or on neither.
//
// WHAT IS ON IT NOW AND WHAT IS NOT:
//   • a TYPE, required (6.2) — Fix, Feature, Change, editable on the Dropdown
//     values screen. The old note here said a story deliberately had none; the
//     owner reversed that on 17 Aug 2026;
//   • the SPRINT list, narrowed to that app and to blocks still worth putting
//     work into, each carrying its mark (6.3);
//   • "Request behind it" is now TICKETS (6.4), narrowed to that app and to the
//     ones still open — a resolved request is not something to hang new work on;
//   • the PROCESSES this work touches, one or more, with an explicit "it changes
//     none" that has to be TICKED rather than left blank (6.5, Aurora's ts4);
//   • NO DUE DATE. A story is due when the block it was sold inside is due (3.15).

import * as React from "react"

import { Paperclip, X } from "lucide-react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Checkbox } from "@kwapso/ui/registry/primitives/checkbox/checkbox"
import { FileUpload } from "@kwapso/ui/registry/primitives/file-upload/file-upload"
import { DialogDescription, DialogTitle } from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@shared/web/field"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Label } from "@kwapso/ui/registry/primitives/label/label"
import { Notes } from "@kwapso/ui/registry/primitives/notes/notes"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { ApiFailure, content as contentApi } from "@/lib/api"
import { pickerKey, searchTickets } from "@/lib/picker-sources"
import { RecordPicker } from "@/components/record-picker"
import type { PickableRecord } from "@/lib/pickable"
import type { PickablePerson } from "@/lib/members"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { readFileAsDataUrl } from "@shared/web/file"
import { richTextValue } from "@shared/web/rich-text"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

export type StoryFormValues = {
  title: string
  detail: string
  sprintId: string
  /** THE SYSTEM THE WORK IS ON. A story hangs off an app ALWAYS and a sprint only
   * sometimes (the owner's ruling), so this is the field that says where the work
   * belongs — and the one every other picker on this form is narrowed by. */
  appId: string
  ticketId: string
  assigneeId: string
  /** Fix / Feature / Change — required (CHECKLIST 6.2). */
  storyType: string
  /** Every map this work touches (CHECKLIST 6.5). */
  processIds: string[]
  /** …or the explicit statement that it touches none. Aurora's ruling: it has to
   * be CHOSEN, not left blank, so the door refuses an empty list without it. */
  changesNoStep: boolean
}

/** "Nothing chosen" as a real Select value: an empty string is not selectable in
 * the library's Select, so the absence of a sprint has to be a value of its own
 * rather than a blank the control silently rejects. */
const NONE = "__none__"

/** A sprint, with the mark CHECKLIST 6.3 asks for. Derived from the two facts the
 * row already carries rather than stored: a mark computed on the fly can never
 * disagree with the dates it came from. */
export type SprintOption = { id: string; name: string; mark: "Active" | "Upcoming" | "Completed" }

const appField = {
  ...defaultFieldConfig,
  label: "App",
  required: true,
  hint: "The system this work is on. Everything below is narrowed by it.",
}
const titleField = { ...defaultFieldConfig, label: "What needs doing", required: true }
const typeField = {
  ...defaultFieldConfig,
  label: "Type",
  required: true,
  hint: "Editable on the Dropdown values screen.",
}
const detailField = { ...defaultFieldConfig, label: "Detail", required: false }
const sprintField = {
  ...defaultFieldConfig,
  label: "Sprint",
  required: false,
  hint: "Blocks on this app that are still running or still to come.",
}
const ticketField = {
  ...defaultFieldConfig,
  label: "Tickets",
  required: false,
  hint: "Open requests on this app. Most work stands on its own.",
}
const processField = {
  ...defaultFieldConfig,
  label: "Processes",
  required: true,
  hint: "Every way of working this changes, or tick that it changes none.",
}
const fileField = {
  ...defaultFieldConfig,
  label: "Something to show",
  required: false,
  hint: "A recording, a page, a document somebody can open.",
}
const assigneeField = { ...defaultFieldConfig, label: "Who's doing it", required: false }

export function StoryFormDialog({
  open,
  onOpenChange,
  teamId,
  sprints,
  apps,
  fixedApp,
  fixedTicket,
  tickets,
  members,
  appStaff,
  processes,
  storyTypes,
  typeMarks,
  storyId,
  initial,
  draftKey,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The team whose tickets the request picker searches — tickets PAGE (R14), so
   * that one question goes to the door rather than to the loaded page. */
  teamId: string | null
  /** Every sprint the caller could pick, each tagged with which app it is on and
   * its mark. Narrowed to the CHOSEN app here rather than by the caller, so the
   * list updates as the person changes their mind about the app. */
  sprints: (SprintOption & { appId: string | null })[]
  apps: PickableRecord[]
  /** Set when the form is opened FROM an app's own screen — the app is then a
   * fact about where you are standing rather than a question, so the picker is
   * replaced by its name and cannot be changed by accident. */
  fixedApp?: { id: string; name: string }
  /** The same, from a TICKET's own Related stories tab: NEW work that answers
   * this request.
   *
   * READ THE VERB. This is not "turn this request into a piece of work" — that
   * control (and the prompt after triage) went on 17 Aug 2026 and is not coming
   * back, because a ticket never BECOMES a story. This is the other sentence,
   * which survives: a request may need several stories and a story may answer
   * several requests, so writing another one changes nothing about the ticket at
   * all. Removing the conversion took this create action with it by accident,
   * and it is the only way to get a request to triaged from its own record — so
   * if the two ever look like the same button again, they are not.
   *
   * Fixed rather than picked for the ordinary reason: the request behind the
   * work is a fact about where you are standing, and the one thing about a new
   * story nobody should be able to mistype. */
  fixedTicket?: { id: string; label: string }
  /** OPEN tickets only (6.4), each tagged with the app it is about. */
  tickets: { id: string; label: string; appId: string | null }[]
  members: PickablePerson[]
  /** WHO IS ON EACH APP (CHECKLIST 6.6) — app id → the staff user ids on it. The
   * assignee picker narrows to the chosen app's people, and the DOOR refuses
   * anybody else, so this is the courtesy half of a rule that is enforced on the
   * server. An app nobody has been staffed to narrows to nobody, so the picker
   * falls back to the whole team rather than becoming unusable — the same
   * fail-open the door takes, said in the same place. */
  appStaff: Map<string, string[]>
  /** The team's process maps, each tagged with the app it sits inside (6.5). */
  processes: { id: string; name: string; appId: string | null }[]
  /** The team's own `Story type` dropdown values (6.2). */
  storyTypes: string[]
  /** THE GLYPH BESIDE EACH WORD (R35). A map rather than richer options,
   * because the words come from the door and the marks come from the team's
   * own vocabulary cache — two reads the screen already holds, and joining
   * them here would make the dialog fetch. */
  typeMarks?: Map<string, string>
  /** THE STORY BEING EDITED, when this is an edit. Present here for one
   * reason: the file field below has to know where to hang what somebody
   * picked, and on an edit that is known before the submit rather than after
   * it. See `onSubmit` for the create half. */
  storyId?: string
  /** Present = editing an existing story. */
  initial?: StoryFormValues
  draftKey?: string
  /** RETURNS THE NEW STORY'S ID on a create, when the caller has one.
   *
   * An attachment needs a story to belong to, and on a create there is no
   * story until the submit returns — so the id comes back out rather than the
   * form guessing which row is new (rank ordering means the newest is not
   * reliably first). An edit already knows it, as `storyId`, and returns
   * nothing; the upload below reads whichever of the two it has. */
  onSubmit: (values: StoryFormValues) => Promise<string | void>
}) {
  const t = useT()
  const editing = initial !== undefined
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    initial ?? {
      title: "",
      detail: "",
      sprintId: "",
      appId: "",
      ticketId: "",
      assigneeId: "",
      storyType: "",
      processIds: [],
      changesNoStep: false,
    },
    open
  )
  const [busy, setBusy] = React.useState(false)
  const appId = fixedApp ? fixedApp.id : values.appId
  // THE THREE NARROWED LISTS. Everything with no app at all stays offered: an
  // unfiled sprint or a request nobody attributed yet is still a legitimate
  // answer, and hiding it would make the form unable to describe the data.
  const onThisApp = <T extends { appId: string | null }>(rows: T[]): T[] =>
    appId ? rows.filter((r) => r.appId === appId || r.appId === null) : rows
  const sprintOptions = onThisApp(sprints)
  const ticketOptions = onThisApp(tickets)
  const processOptions = onThisApp(processes)
  // WHO'S DOING IT, narrowed to the staff on the chosen app (CHECKLIST 6.6).
  // FAIL-OPEN on an app nobody is staffed to, exactly as the door does: a rule
  // that made the assignee un-pickable on precisely the apps nobody has been
  // assigned to would stop the work being recorded at all.
  const staffHere = appId ? (appStaff.get(appId) ?? []) : []
  const assignable = staffHere.length ? members.filter((m) => staffHere.includes(m.id)) : members
  // A story is describable once it has a name, a kind, and an answer about which
  // maps it changes — the same three the door insists on, so the button is never
  // enabled into a refusal.
  const ready =
    values.title.trim() !== "" &&
    values.storyType !== "" &&
    (values.changesNoStep || values.processIds.length > 0)

  // WHAT SOMEBODY PICKED, held until there is a story to hang it on.
  //
  // A developer reading a story needs to SEE the thing being described, and a
  // screenshot chosen while writing it is the moment they are most likely to
  // get one. The files wait here rather than riding the create payload because
  // R2 storage is addressed by story id, and on a create that id does not exist
  // until the door answers.
  const [pending, setPending] = React.useState<File[]>([])

  /** ONE FILE AT A TIME, and a failure here never fails the story.
   *
   * The story is already written by the time this runs. Turning a rejected
   * upload into a thrown submit would close nothing, clear no draft, and tell
   * somebody their work was not saved when it was — so the toast names the
   * attachment and the story stands. */
  async function attach(target: string, files: File[]) {
    for (const file of files) {
      try {
        await contentApi.addStoryAttachment({
          id: target,
          kind: "file",
          label: file.name,
          fileDataUrl: await readFileAsDataUrl(file),
        })
      } catch (err) {
        toast.error(err instanceof ApiFailure ? err.message : t("Couldn't attach that."))
      }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      const madeId = await onSubmit({
        title: values.title.trim(),
        detail: richTextValue(values.detail),
        sprintId: values.sprintId,
        appId,
        ticketId: fixedTicket ? fixedTicket.id : values.ticketId,
        assigneeId: values.assigneeId,
        storyType: values.storyType,
        processIds: values.changesNoStep ? [] : values.processIds,
        changesNoStep: values.changesNoStep,
      })
      // THE FILES, ONCE THERE IS SOMETHING TO HANG THEM ON. `storyId` on an
      // edit, the id the create door just handed back otherwise.
      const target = storyId ?? (typeof madeId === "string" ? madeId : null)
      if (target && pending.length) await attach(target, pending)
      setPending([])
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't save the story."))
    } finally {
      setBusy(false)
    }
  }

  /** One picker, three times over — app, sprint, person. Each may be left empty,
   * which the door reads as "not set" rather than "cleared to nothing".
   *
   * All three are BOUNDED lists the screen already holds (a team's systems, the
   * sprints that are open, the staff on this app), so their search runs in the
   * browser and costs nothing. The REQUEST picker below is the odd one out: it
   * reads tickets, which page, so it asks the door instead. */
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
      title={<DialogTitle>{editing ? t("Edit story") : t("New story")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {editing
            ? t("Change what it says, who has it, or what it touches.")
            : t("One piece of work, on one app. Start with the app and the rest narrows to it.")}
        </DialogDescription>
      }
      submit={{
        busy: busy,
        disabled: !ready,
      }}
    >
      {/* FIRST, and everything below is narrowed by it (CHECKLIST 6.1). */}
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
            t("Search apps…"),
            apps.map((a) => ({ id: a.id, label: a.name })),
            (v) => setValues((s) => ({ ...s, appId: v }))
          )
        )}
      </Field>
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
      <Field config={typeField} htmlFor="story-type" className={fieldSpacing}>
        <RecordPicker
          id="story-type"
          value={values.storyType || NONE}
          onChange={(v) => setValues((s) => ({ ...s, storyType: v === NONE ? "" : v }))}
          options={storyTypes.map((v) => ({ value: v, label: v, mark: typeMarks?.get(v) ?? null }))}
          // THE PICKER HAS TO BE TOLD WHAT "NOTHING" IS. It decides whether
          // something is chosen by comparing the value against `emptyOption`,
          // so a sentinel passed without one is a value it has never heard of:
          // it looks for a row with that id, finds none, and falls all the way
          // through to painting the id. This field shipped reading `__none__`
          // to a person opening the story form — the helper at the top of this
          // file has always passed it, and this one field was written by hand.
          emptyOption={{ value: NONE, label: t("Pick one") }}
          placeholder={t("Pick one")}
          searchPlaceholder={t("Search types…")}
          emptyText={t("Nothing matched.")}
          disabled={busy}
        />
      </Field>
      <Field config={detailField} htmlFor="story-detail" className={fieldSpacing}>
        <Notes
          key={open ? "open" : "shut"}
          defaultValue={values.detail}
          onChange={(html) => setValues((s) => ({ ...s, detail: html }))}
          placeholder={t("What good looks like when it's finished.")}
          className="min-h-32"
        />
      </Field>
      {/* THE SCREENSHOT, beside the words that describe it. On BOTH halves of
          this dialog, which the header above makes a rule: one field, one code
          path, and the upload simply knows a different id on an edit. */}
      <Field config={fileField} htmlFor="story-files" className={fieldSpacing}>
        <div className="flex flex-col gap-2">
          {pending.length > 0 && (
            <ul className="divide-border divide-y rounded-xl border">
              {pending.map((file, i) => (
                <li key={`${file.name}-${i}`} className="flex items-center gap-2 px-3 py-2">
                  <Paperclip className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label={t("Take it off")}
                    disabled={busy}
                    onClick={() => setPending((f) => f.filter((_, j) => j !== i))}
                  >
                    <X className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <FileUpload
            multiple
            onChange={(files) => setPending((f) => [...f, ...files])}
            className={busy ? "pointer-events-none opacity-60" : undefined}
          />
        </div>
      </Field>
      <Field config={sprintField} htmlFor="story-sprint" className={fieldSpacing}>
        {picker(
          "story-sprint",
          values.sprintId,
          "No sprint yet",
          t("Search sprints…"),
          // THE MARK RIDES THE LABEL (CHECKLIST 6.3). A person picking a sprint is
          // choosing between "the one running now" and "the one starting in
          // October", and the two are otherwise two names.
          sprintOptions.map((s) => ({ id: s.id, label: `${s.name}, ${s.mark.toLowerCase()}` })),
          (v) => setValues((s) => ({ ...s, sprintId: v }))
        )}
      </Field>
      <Field config={ticketField} htmlFor="story-ticket" className={fieldSpacing}>
        {fixedTicket ? (
          <p className="text-muted-foreground text-sm" id="story-ticket">
            {fixedTicket.label}
          </p>
        ) : (
          /* TICKETS PAGE (R14), so this one asks the DOOR — narrowed to the
             same app the rest of the form is narrowed to, which is what the
             in-memory `onThisApp` was doing over a loaded page. `ticketOptions`
             stays as the list painted before anything is typed. */
          <RecordPicker
            id="story-ticket"
            value={values.ticketId || NONE}
            onChange={(v) => setValues((s) => ({ ...s, ticketId: v === NONE ? "" : v }))}
            search={(term) => searchTickets(term, { appId: appId || undefined })}
            searchKey={pickerKey(`tickets:${appId || "any"}`, teamId)}
            options={ticketOptions.map((o) => ({ value: o.id, label: o.label }))}
            emptyOption={{ value: NONE, label: t("No ticket") }}
            placeholder={t("No ticket")}
            searchPlaceholder={t("Search tickets…")}
            emptyText={t("No ticket matched.")}
            disabled={busy}
          />
        )}
      </Field>
      {/* CHECKLIST 6.5. The tick is the explicit "no process" Aurora asked for:
          an empty list on its own is refused by the door, so a person cannot skip
          the question by not answering it. Ticking it hides the list, because a
          list you have just said you are not using is noise. */}
      <Field config={processField} shape="group" htmlFor="story-processes" className={fieldSpacing}>
        <div className="flex flex-col gap-2" id="story-processes">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={values.changesNoStep}
              onCheckedChange={(c) => setValues((s) => ({ ...s, changesNoStep: c === true }))}
              disabled={busy}
            />
            {t("This changes no process")}
          </label>
          {!values.changesNoStep &&
            (processOptions.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t("No processes on this app yet. Tick the box above if it changes none.")}
              </p>
            ) : (
              processOptions.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={values.processIds.includes(p.id)}
                    onCheckedChange={(c) =>
                      setValues((s) => ({
                        ...s,
                        processIds:
                          c === true
                            ? [...s.processIds, p.id]
                            : s.processIds.filter((x) => x !== p.id),
                      }))
                    }
                    disabled={busy}
                  />
                  {p.name}
                </label>
              ))
            ))}
        </div>
      </Field>
      <Field config={assigneeField} htmlFor="story-assignee" className={fieldSpacing}>
        {picker(
          "story-assignee",
          values.assigneeId,
          "Nobody yet",
          t("Search members…"),
          assignable.map((m) => ({ id: m.id, label: m.name })),
          (v) => setValues((s) => ({ ...s, assigneeId: v }))
        )}
      </Field>
      {/* A hidden anchor so the label above always has a control to point at even
          when the process list is empty. Keeps the field accessible without
          inventing a second layout for the empty case. */}
      <Label htmlFor="story-processes" className="sr-only">
        {t("Processes")}
      </Label>
    </FormShellDialog>
  )
}
