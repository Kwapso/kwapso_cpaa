"use client"

// Add-or-edit-a-step dialog — everything a savings figure is built from, and the
// one form that collects it.
//
// THEY ARE ASKED FOR IN MINUTES, and stored in whole seconds. Nobody says "a
// step takes 2,400 seconds"; they say forty minutes. The conversion happens
// here, once, on the way in and on the way out.
//
// AND HOW OFTEN, IN THE PERIOD THEY SAY IT IN. "Twice a day" and "sixty times a
// month" are the same fact, and asking a person to convert it in their head at
// the moment they are describing their own job is how a wrong number gets typed.
// The pair is stored; the monthly figure is derived once, in the arithmetic.
//
// WHO DOES IT AND WHAT IN ARE PICK-OR-CREATE, and that is not a convenience.
// They were plain pickers first, and the fields HID THEMSELVES when a client had
// no roles recorded — which on 24 Aug 2026 was every client but one. The owner
// opened the form and reported four fields where there should have been six:
//
//   "I don't think the map edit screen has the ability for us to capture who
//    does it, like the rule."
//
// He was right, and hiding a control because its list is empty is the same
// defect as an archive with no button: the feature is invisible and there is no
// signpost to where you would create the thing. You map a process live in a room
// while somebody says "then it goes to the dispatch clerk" — so you type that,
// and it becomes a role there and then, with its cost filled in later.
//
// The form says plainly what the numbers ARE: estimates the two of you agreed,
// not measurements. That is the same sentence the client reads under the savings
// figure (R25), and it belongs on the form that produces it.
//
// FormShell (R4) + a per-session draft (R7), like every other write.

import * as React from "react"

import { DialogDescription, DialogTitle } from "@shared/ui/controls/dialog/dialog"
import { Field } from "@shared/web/field"
import { Input } from "@shared/ui/controls/input/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/controls/select/select"
import { Notes } from "@shared/web/notes-editor/notes-editor"
import { toast } from "@shared/ui/controls/sonner/sonner"
import { defaultFieldConfig } from "@shared/web/screen-engine/config"
import { Plus } from "@shared/ui/icons"

import { ApiFailure } from "@/lib/api"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { richTextValue } from "@shared/web/rich-text"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"
import { periodLabel } from "@shared/web/frequency"
import { PERIODS } from "@shared/workers/savings"

export type StepFormValues = {
  name: string
  description: string
  /** whole seconds — converted from the minutes the form asks for */
  secondsPerRun: number
  /** how many times, in the period below */
  runsPerPeriod: number
  frequencyPeriod: "day" | "week" | "month" | "year"
  /** WHO DOES IT — one of the client's own roles, or null for nobody named. */
  roleId: string | null
  /** A ROLE THAT DOES NOT EXIST YET. The caller creates it and passes the new id
   * back — pick-or-create, and the reason the field is never empty. */
  newRoleName: string | null
  /** WHAT IT IS DONE IN — exactly ONE (both respondents' ruling). */
  toolId: string | null
  newToolName: string | null
  /** WHERE IT GOES. Undefined = after everything else, which is what a step
   * ordinarily is. A NUMBER puts it at that position — and a position another
   * step already holds is a FORK, which is the only way to draw one. */
  position?: number
  /** the word on a fork, when this step is one branch of a decision */
  branchLabel: string | null
  /** the step this one can send the work back to */
  loopsBackTo: string | null
}

export type StepRoleOption = { id: string; name: string; centsPerHour: number | null }
export type StepToolOption = { id: string; name: string }
export type StepPeerOption = { stepKey: string; name: string; position: number }

/** NOBODY NAMED, and ADD A NEW ONE, as values a picker can hold. A Select cannot
 * carry `null`, so the two sentinels are written once here rather than spelled
 * differently at each end. */
const NONE = "__none__"
const NEW = "__new__"
/** WHERE A NEW STEP LANDS by default: at the end, on its own. */
const AFTER_ALL = "__after_all__"
/** The two answers to "does the work split here?". */
const STRAIGHT = "__straight__"
const SPLIT = "__split__"

const nameField = { ...defaultFieldConfig, label: "Step", required: true }
const descField = { ...defaultFieldConfig, label: "What happens in it", required: false }
const minutesField = {
  ...defaultFieldConfig,
  label: "Minutes it takes, each time",
  required: true,
  hint: "The time you agreed with them, not a measurement.",
}
const runsField = { ...defaultFieldConfig, label: "How often it happens", required: true }
const roleField = {
  ...defaultFieldConfig,
  label: "Who does it",
  required: false,
  hint: "Their role, and what an hour of it costs them, is what turns these minutes into money.",
}
const toolField = {
  ...defaultFieldConfig,
  label: "What it is done in",
  required: false,
  hint: "One. A step done in two systems has a handoff in the middle of it, and that is two steps.",
}
const shapeField = {
  ...defaultFieldConfig,
  label: "Does the work split here?",
  required: false,
  hint: "A split is two things that can happen next, and which one happens depends on something. The next step you add afterwards joins them back up on its own.",
}
const insteadField = {
  ...defaultFieldConfig,
  label: "It is an alternative to",
  required: false,
  hint: "The step this one happens INSTEAD of. The two sit side by side in the picture.",
}
const branchField = {
  ...defaultFieldConfig,
  label: "This way is taken when",
  required: false,
  hint: "The words that decide it — written the way somebody would say it out loud.",
}
const loopField = { ...defaultFieldConfig, label: "Sends the work back to", required: false }

export function StepFormDialog({
  open,
  onOpenChange,
  versionLabel,
  initial,
  roles = [],
  tools = [],
  peers = [],
  hasClient = true,
  draftKey,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** which version this lands in — a step is always added to the current one */
  versionLabel: string
  initial?: {
    name: string
    description: string
    secondsPerRun: number
    runsPerPeriod: number
    frequencyPeriod: StepFormValues["frequencyPeriod"]
    roleId: string | null
    toolId: string | null
    branchLabel: string | null
    loopsBackTo: string | null
  }
  /** The client's live roles and tools. EMPTY IS ORDINARY — the fields render
   * anyway and offer to create one, which is the whole point of this rewrite. */
  roles?: StepRoleOption[]
  tools?: StepToolOption[]
  /** the other steps on this map, for the loop-back picker */
  peers?: StepPeerOption[]
  /** A map with no client has nobody's roles and no tools to choose from, and
   * the door refuses either. The form says so rather than offering an empty
   * picker that fails on save. */
  hasClient?: boolean
  draftKey?: string
  onSubmit: (values: StepFormValues) => Promise<void>
}) {
  const t = useT()
  const editing = initial !== undefined
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    {
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      minutes: initial ? String(Math.round(initial.secondsPerRun / 60)) : "",
      runs: initial ? String(initial.runsPerPeriod) : "",
      period: (initial?.frequencyPeriod ?? "month") as string,
      roleId: initial?.roleId ?? NONE,
      newRole: "",
      toolId: initial?.toolId ?? NONE,
      newTool: "",
      place: AFTER_ALL,
      branch: initial?.branchLabel ?? "",
      loop: initial?.loopsBackTo ?? NONE,
    },
    open
  )
  const [busy, setBusy] = React.useState(false)

  /** A whole, non-negative number, or null. The door refuses anything else with
   * a plain sentence (R20); this stops the button before it gets there. */
  const whole = (raw: string): number | null => {
    const n = Number(raw.trim())
    return raw.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
  }
  // SPLITTING IS DERIVED, never stored: a step is one branch of a fork exactly
  // when it has been placed beside another one. Two facts that could disagree
  // would eventually disagree.
  const splitting = values.place !== AFTER_ALL && values.place !== undefined
  const minutes = whole(values.minutes)
  const runs = whole(values.runs)
  const namingRole = values.roleId === NEW
  const namingTool = values.toolId === NEW
  const ready =
    values.name.trim() !== "" &&
    minutes !== null &&
    runs !== null &&
    (!namingRole || values.newRole.trim() !== "") &&
    (!namingTool || values.newTool.trim() !== "")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || minutes === null || runs === null) return
    setBusy(true)
    try {
      await onSubmit({
        name: values.name.trim(),
        description: richTextValue(values.description),
        secondsPerRun: minutes * 60,
        runsPerPeriod: runs,
        frequencyPeriod: values.period as StepFormValues["frequencyPeriod"],
        roleId: namingRole ? null : values.roleId === NONE ? null : values.roleId,
        newRoleName: namingRole ? values.newRole.trim() : null,
        toolId: namingTool ? null : values.toolId === NONE ? null : values.toolId,
        newToolName: namingTool ? values.newTool.trim() : null,
        // WHERE IT GOES. Only on a new step: moving an existing one is a
        // different verb and a different door. `undefined` means "after
        // everything else", which is what the door does with no position at all.
        position: editing
          ? undefined
          : values.place === AFTER_ALL
            ? undefined
            : peers.find((x) => x.stepKey === values.place)?.position,
        branchLabel: values.branch.trim() || null,
        loopsBackTo: values.loop === NONE ? null : values.loop,
      })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't save the step."))
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
      title={<DialogTitle>{editing ? t("Edit step") : t("Add a step")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {t("It goes into")} {versionLabel}. {t("Older versions stay exactly as they were agreed.")}
        </DialogDescription>
      }
      submit={{ busy: busy, disabled: !ready }}
    >
      <Field config={nameField} htmlFor="step-name" className={fieldSpacing}>
        <Input
          id="step-name"
          value={values.name}
          onChange={(e) => setValues((s) => ({ ...s, name: e.target.value }))}
          placeholder={t("e.g. Check the invoice against the order")}
          disabled={busy}
          autoFocus
        />
      </Field>
      <Field config={descField} htmlFor="step-description" className={fieldSpacing}>
        <Notes
          key={open ? "open" : "shut"}
          defaultValue={values.description}
          onChange={(html) => setValues((s) => ({ ...s, description: html }))}
          placeholder={t("Anything worth remembering about how it's done.")}
          className="min-h-32"
        />
      </Field>
      <Field config={minutesField} htmlFor="step-minutes" className={fieldSpacing}>
        <Input
          id="step-minutes"
          type="number"
          min={0}
          inputMode="numeric"
          value={values.minutes}
          onChange={(e) => setValues((s) => ({ ...s, minutes: e.target.value }))}
          placeholder="40"
          disabled={busy}
        />
      </Field>
      {/* HOW OFTEN, AS A PAIR. The number and the period sit on one line because
          they are one sentence — "twice a day" — and splitting them across two
          fields is how somebody reads back "twice" and forgets the "a day". */}
      <Field config={runsField} htmlFor="step-runs" className={fieldSpacing}>
        <div className="flex items-center gap-2">
          <Input
            id="step-runs"
            type="number"
            min={0}
            inputMode="numeric"
            value={values.runs}
            onChange={(e) => setValues((s) => ({ ...s, runs: e.target.value }))}
            placeholder="20"
            disabled={busy}
            className="w-28"
          />
          {/* THE OPTION IS THE PHRASE, NOT THE NOUN. "day" on its own is not a
              sentence, no translator can place it, and R28 refuses it — see
              shared/web/frequency.ts for the day that was caught. */}
          <Select
            value={values.period}
            onValueChange={(v) => setValues((s) => ({ ...s, period: v }))}
            disabled={busy}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p} value={p}>
                  {periodLabel(p, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Field>

      {/* WHO DOES IT. Always rendered, even with no roles recorded — see the note
          at the top of this file for the day that mattered. */}
      <Field config={roleField} htmlFor="step-role" className={fieldSpacing}>
        {hasClient ? (
          <div className="flex flex-col gap-2">
            <Select
              value={values.roleId}
              onValueChange={(v) => setValues((s) => ({ ...s, roleId: v }))}
              disabled={busy}
            >
              <SelectTrigger id="step-role">
                <SelectValue placeholder={t("Nobody named yet")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("Nobody named yet")}</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                    {r.centsPerHour === null ? ` — ${t("no hourly cost yet")}` : ""}
                  </SelectItem>
                ))}
                <SelectItem value={NEW}>{t("Add a role…")}</SelectItem>
              </SelectContent>
            </Select>
            {namingRole && (
              <Input
                value={values.newRole}
                onChange={(e) => setValues((s) => ({ ...s, newRole: e.target.value }))}
                placeholder={t("e.g. Dispatch clerk")}
                disabled={busy}
                autoFocus
              />
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("File this map under a client and their roles can be named here.")}
          </p>
        )}
      </Field>

      {/* WHAT IT IS DONE IN — one, by ruling. */}
      <Field config={toolField} htmlFor="step-tool" className={fieldSpacing}>
        {hasClient ? (
          <div className="flex flex-col gap-2">
            <Select
              value={values.toolId}
              onValueChange={(v) => setValues((s) => ({ ...s, toolId: v }))}
              disabled={busy}
            >
              <SelectTrigger id="step-tool">
                <SelectValue placeholder={t("Nothing named yet")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("Nothing named yet")}</SelectItem>
                {tools.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW}>{t("Add a tool…")}</SelectItem>
              </SelectContent>
            </Select>
            {namingTool && (
              <Input
                value={values.newTool}
                onChange={(e) => setValues((s) => ({ ...s, newTool: e.target.value }))}
                placeholder={t("e.g. The shared spreadsheet")}
                disabled={busy}
                autoFocus
              />
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("File this map under a client and their tools can be named here.")}
          </p>
        )}
      </Field>

      {/* THE SHAPE OF THE WORK, asked as ONE question instead of three fields a
          person had to assemble in their head.

          It was "Where it goes" + "Only when" + "Sends the work back to", three
          unrelated-looking pickers at the bottom of a form, and the owner's
          verdict was fair: "how the fuck do you split something and join
          something, and what is a condition?" The controls were right and the
          QUESTION was never asked. So it is asked now, in the words somebody
          would use about their own business, and the two fields a split needs
          appear together underneath it only once the answer is yes.

          A SPLIT IS STILL TWO STEPS AT ONE POSITION — the owner's own model, and
          what the picture draws. Nothing about the data changed; what changed is
          that the form says so. And a REJOIN still needs no control: the next
          step added the ordinary way lands on its own, and one box after two IS
          the join. The helper line says that out loud rather than leaving
          somebody hunting for a button that should not exist. */}
      {!editing && peers.length > 0 && (
        <Field config={shapeField} htmlFor="step-shape" className={fieldSpacing}>
          <Select
            value={splitting ? SPLIT : STRAIGHT}
            onValueChange={(v) =>
              setValues((st) => ({
                ...st,
                // Choosing "it carries on" clears BOTH halves of the split, so a
                // half-answered fork can never be submitted.
                place: v === SPLIT ? (st.place === AFTER_ALL ? peers[0].stepKey : st.place) : AFTER_ALL,
                branch: v === SPLIT ? st.branch : "",
              }))
            }
            disabled={busy}
          >
            <SelectTrigger id="step-shape">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={STRAIGHT}>{t("No — it just carries on")}</SelectItem>
              <SelectItem value={SPLIT}>{t("Yes — this is one of the ways it can go")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      )}

      {splitting && (
        /* The two halves of a split, together and indented, because neither one
           means anything without the other: WHICH step this is an alternative
           to, and WHEN this way is taken instead. */
        <div className="border-primary/40 ml-1 flex flex-col gap-4 border-l-2 pl-4">
          <Field config={insteadField} htmlFor="step-place">
            <Select
              value={values.place === AFTER_ALL ? peers[0].stepKey : values.place}
              onValueChange={(v) => setValues((st) => ({ ...st, place: v }))}
              disabled={busy}
            >
              <SelectTrigger id="step-place">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {peers.map((x) => (
                  <SelectItem key={x.stepKey} value={x.stepKey}>
                    {x.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field config={branchField} htmlFor="step-branch">
            <Input
              id="step-branch"
              value={values.branch}
              onChange={(e) => setValues((st) => ({ ...st, branch: e.target.value }))}
              placeholder={t("e.g. if the claim is rejected")}
              disabled={busy}
            />
          </Field>
        </div>
      )}

      {/* EDITING a step keeps the plain condition box: the shape question above
          is about where a NEW step lands, and moving an existing one is a
          different verb with a different door. */}
      {editing && (
        <Field config={branchField} htmlFor="step-branch" className={fieldSpacing}>
          <Input
            id="step-branch"
            value={values.branch}
            onChange={(e) => setValues((st) => ({ ...st, branch: e.target.value }))}
            placeholder={t("e.g. if the claim is rejected")}
            disabled={busy}
          />
        </Field>
      )}

      {peers.length > 0 && (
        <Field config={loopField} htmlFor="step-loop" className={fieldSpacing}>
          <Select
            value={values.loop}
            onValueChange={(v) => setValues((st) => ({ ...st, loop: v }))}
            disabled={busy}
          >
            <SelectTrigger id="step-loop">
              <SelectValue placeholder={t("Nowhere — it carries on")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("Nowhere — it carries on")}</SelectItem>
              {peers.map((x) => (
                <SelectItem key={x.stepKey} value={x.stepKey}>
                  {x.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      {/* The add-a-role and add-a-tool rows are the only place this form creates
          anything of its own, and the icon says so (the house mapping: create =
          Plus). It is a hint rather than a button because the Select above IS
          the control — two ways to do one thing is how a form gets confusing. */}
      {(namingRole || namingTool) && (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Plus className="size-3.5" aria-hidden />
          {t("It will be added to this client's organisation when you save.")}
        </p>
      )}
    </FormShellDialog>
  )
}
