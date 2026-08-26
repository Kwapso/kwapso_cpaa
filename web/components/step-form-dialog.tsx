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
import { Settings2 } from "@shared/ui/icons"

import { InAppLink } from "@/components/in-app-link"

import { ApiFailure } from "@/lib/api"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { richTextValue, safeHref } from "@shared/web/rich-text"
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
  /** THE ROLE — one of the client's own, or null for nobody named. */
  roleId: string | null
  /** THE TOOL — exactly ONE (both respondents' ruling). */
  toolId: string | null
  /** WHERE IT GOES. Undefined = after everything else, which is what a step
   * ordinarily is. A NUMBER puts it at that position — and a position another
   * step already holds is a FORK, which is the only way to draw one. */
  position?: number
  /** the word on a fork, when this step is one branch of a decision */
  branchLabel: string | null
  /** the step key of the branch head this step CONTINUES, for an arm that
   * carries on instead of joining the sides back up */
  branchOf: string | null
  /** the step this one can send the work back to */
  loopsBackTo: string | null
}

export type StepRoleOption = { id: string; name: string; centsPerHour: number | null }
export type StepToolOption = { id: string; name: string }
export type StepPeerOption = { stepKey: string; name: string; position: number }

/** NOBODY NAMED, as a value a picker can hold. A Select cannot carry `null`,
 * so the sentinel is written once here rather than spelled differently at each
 * end. */
const NONE = "__none__"
/** WHERE A NEW STEP LANDS by default: at the end, on its own. */
const AFTER_ALL = "__after_all__"
/** The two answers to "does the work split here?". */
const STRAIGHT = "__straight__"
const SPLIT = "__split__"
/** THE THIRD SHAPE, added 26 Aug 2026. A step can now also CONTINUE one side of
 * a split rather than joining the sides back up — the owner's "I don't want it
 * to be a join step". It is the same question the other two answer (what shape
 * is this step?), so it is a third option on the one control and not a second
 * control beside it. */
const ON_ARM = "__on_arm__"

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
  label: "Role",
  required: false,
  hint: "Who does it. The role's hourly cost is what turns these minutes into money.",
}
const toolField = {
  ...defaultFieldConfig,
  label: "Tool",
  required: false,
  hint: "One. A step done in two systems has a handoff in the middle of it, and that is two steps.",
}
const shapeField = {
  ...defaultFieldConfig,
  label: "Where does this step sit?",
  required: false,
  hint: "A split is two things that can happen next, and which one happens depends on something. A step added after a split joins the two sides back up — unless you say it carries on from one of them.",
}
const armField = {
  ...defaultFieldConfig,
  label: "It carries on from",
  required: false,
  hint: "The side of the split this step continues. It hangs under that one instead of joining the two back together.",
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
  manageHref = null,
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
    branchOf: string | null
    loopsBackTo: string | null
    /** where it sits — a position a PEER also holds means this step is one
     * branch of a fork, and the shape question opens showing exactly that. */
    position: number
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
  /** The client's record, Organisation tab — the ONE place roles and tools are
   * added and edited. Null when the map has no client. */
  manageHref?: string | null
  draftKey?: string
  onSubmit: (values: StepFormValues) => Promise<void>
}) {
  const t = useT()
  const editing = initial !== undefined
  /** The step is CURRENTLY one branch of a fork exactly when a peer holds its
   * position — the same derivation the picture draws from, so the form can
   * never open disagreeing with the map. */
  const besideNow = editing ? peers.find((x) => x.position === initial.position) : undefined
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    {
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      minutes: initial ? String(Math.round(initial.secondsPerRun / 60)) : "",
      runs: initial ? String(initial.runsPerPeriod) : "",
      period: (initial?.frequencyPeriod ?? "month") as string,
      roleId: initial?.roleId ?? NONE,
      toolId: initial?.toolId ?? NONE,
      place: besideNow?.stepKey ?? AFTER_ALL,
      branch: initial?.branchLabel ?? "",
      arm: initial?.branchOf ?? NONE,
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
  /** A DRAFT CAN OUTLIVE THE STEP IT POINTED AT — the exact class of bug round
   * six shipped: a stale key makes the Select show its placeholder while the
   * submit sends nothing. So the place is normalised HERE, once, and everything
   * below — the question, the pickers, the submit — reads the normalised one. */
  const place =
    values.place === AFTER_ALL || peers.some((x) => x.stepKey === values.place)
      ? values.place
      : AFTER_ALL
  const splitting = place !== AFTER_ALL && place !== undefined
  /** WHICH STEPS ARE THE SIDES OF A SPLIT — a peer whose position another peer
   * also holds. Derived, like everything else about shape here, so the picker
   * can never offer an arm the picture does not draw. */
  const armHeads = peers.filter((x) => peers.some((y) => y !== x && y.position === x.position))
  /** …and normalised the same way `place` is: a draft can outlive the step it
   * named, and a Select holding a dead value shows its placeholder while the
   * submit sends nothing (round six's bug, in the other picker). */
  const arm = armHeads.some((x) => x.stepKey === values.arm) ? values.arm : NONE
  const onArm = !splitting && arm !== NONE
  /** Editing a branch back to "it carries on" DETACHES it — it needs a position
   * of its own, and the one that changes nothing else is the end of the map. */
  const detaching = editing && besideNow !== undefined && !splitting && !onArm
  const minutes = whole(values.minutes)
  const runs = whole(values.runs)
  const ready = values.name.trim() !== "" && minutes !== null && runs !== null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || minutes === null || runs === null) return
    setBusy(true)
    try {
      // WHERE IT GOES, in both modes — the door's update takes a position too.
      //   adding, carries on      -> undefined: after everything else
      //   adding, splits          -> the chosen peer's position (a shared
      //                              position IS the fork)
      //   editing, joins a fork   -> that peer's position
      //   editing, detaches       -> one past the last position, said out loud
      //                              in the helper under the question
      //   editing, shape untouched-> undefined: the door leaves it alone
      const position = splitting
        ? peers.find((x) => x.stepKey === place)?.position
        // ON AN ARM: the end of the map. Position only ORDERS it within its arm
        // (the picture pulls arm steps out of the ranks entirely), so the one
        // value that cannot be mistaken for anything else is past everything.
        : onArm && !editing
          ? Math.max(0, ...peers.map((x) => x.position)) + 1
        : detaching
          ? Math.max(initial?.position ?? 0, ...peers.map((x) => x.position)) + 1
          : undefined
      await onSubmit({
        name: values.name.trim(),
        description: richTextValue(values.description),
        secondsPerRun: minutes * 60,
        runsPerPeriod: runs,
        frequencyPeriod: values.period as StepFormValues["frequencyPeriod"],
        roleId: values.roleId === NONE ? null : values.roleId,
        toolId: values.toolId === NONE ? null : values.toolId,
        position,
        // A condition belongs to a branch. A straight step carries none — which
        // is also what clears a stale "if it is a letter" off a detached one.
        branchLabel: splitting ? values.branch.trim() || null : null,
        // Exclusive by construction: a step is a side of a split, OR on one, OR
        // neither. Clearing it on the other two shapes is what lets somebody take
        // a step off an arm again.
        branchOf: onArm ? arm : null,
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

      {/* THE ROLE. Always rendered, even with no roles recorded — the link
          under the tool picker is the signpost to where one is added. */}
      <Field config={roleField} htmlFor="step-role" className={fieldSpacing}>
        {hasClient ? (
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
            </SelectContent>
          </Select>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("File this map under a client and their roles can be named here.")}
          </p>
        )}
      </Field>

      {/* THE TOOL — one, by ruling. */}
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
              </SelectContent>
            </Select>
            {/* THE SIGNPOST — the same shape ManageDropdownsLink draws under a
                dropdown. Roles and tools are records on the client, managed on
                the client's record, and this is the door there. The half-filled
                step survives the trip: the draft is per-session (R7). */}
            {manageHref && (
              <InAppLink
                href={safeHref(manageHref) ?? ""}
                className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-xs underline-offset-2 hover:underline"
              >
                <Settings2 className="size-3" aria-hidden />
                {t("Add or edit their roles and tools")}
              </InAppLink>
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
      {/* THE SHAPE, in BOTH modes. It was add-only, and the owner found the
          hole the same day the split shipped: a step that landed in a fork by
          mistake could not be taken out of it — "I think something is wrong…
          and I can't even edit it." Editing now opens showing the truth
          (derived from positions, the same way the picture is) and can change
          it: join a fork, switch forks, or leave one. */}
      {peers.length > 0 && (
        <Field config={shapeField} htmlFor="step-shape" className={fieldSpacing}>
          <Select
            value={splitting ? SPLIT : onArm ? ON_ARM : STRAIGHT}
            onValueChange={(v) =>
              setValues((st) => ({
                ...st,
                // THE THREE ARE EXCLUSIVE, and each choice clears the others'
                // answers — so a half-answered fork, or a step that is somehow
                // both a side of a split and on one, can never be submitted.
                place:
                  v === SPLIT
                    ? (st.place === AFTER_ALL || !peers.some((x) => x.stepKey === st.place)
                        ? (besideNow?.stepKey ?? peers[0].stepKey)
                        : st.place)
                    : AFTER_ALL,
                branch: v === SPLIT ? st.branch : "",
                arm:
                  v === ON_ARM
                    ? (armHeads.some((x) => x.stepKey === st.arm) ? st.arm : (armHeads[0]?.stepKey ?? NONE))
                    : NONE,
              }))
            }
            disabled={busy}
          >
            <SelectTrigger id="step-shape">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* Three shapes, and they are the three things the picture can
                  draw. "It carries on" is offered only when there is a split to
                  carry on FROM — an option that can name nothing is a control
                  that teaches people the feature is broken. */}
              <SelectItem value={STRAIGHT}>{t("It carries on after everything")}</SelectItem>
              <SelectItem value={SPLIT}>{t("It is one side of a split")}</SelectItem>
              {armHeads.length > 0 && (
                <SelectItem value={ON_ARM}>{t("It carries on from one side of a split")}</SelectItem>
              )}
            </SelectContent>
          </Select>
          {detaching && (
            /* Detaching needs a position of its own and takes the end of the
               map — SAID before it happens, never discovered after. */
            <p className="text-muted-foreground mt-1 text-xs">
              {t("It leaves the split and moves to the end of the map.")}
            </p>
          )}
        </Field>
      )}

      {onArm && (
        /* WHICH SIDE IT CARRIES ON FROM. Indented like the split's own halves,
           because it is the same kind of answer: a shape that only means
           something once you say which step it points at. */
        <div className="border-primary/40 ml-1 flex flex-col gap-4 border-l-2 pl-4">
          <Field config={armField} htmlFor="step-arm">
            <Select
              value={arm === NONE ? (armHeads[0]?.stepKey ?? NONE) : arm}
              onValueChange={(v) => setValues((st) => ({ ...st, arm: v }))}
              disabled={busy}
            >
              <SelectTrigger id="step-arm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {armHeads.map((x) => (
                  <SelectItem key={x.stepKey} value={x.stepKey}>
                    {x.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}

      {splitting && (
        /* The two halves of a split, together and indented, because neither one
           means anything without the other: WHICH step this is an alternative
           to, and WHEN this way is taken instead. */
        <div className="border-primary/40 ml-1 flex flex-col gap-4 border-l-2 pl-4">
          <Field config={insteadField} htmlFor="step-place">
            <Select
              value={place === AFTER_ALL ? peers[0].stepKey : place}
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

    </FormShellDialog>
  )
}
