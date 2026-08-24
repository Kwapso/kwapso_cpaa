"use client"

// Record-an-app dialog — the system we built, the thing with its own address.
//
// The ACCOUNT is written once and never edited: moving an app to another client
// would silently republish its whole map, its savings and its conversation into
// somebody else's portal, so there is no move-app door and this is the only
// place it is decided.
//
// TWO FIELDS THIS FORM NO LONGER ASKS FOR, and the difference between them.
// The owner's ruling of 17 Aug 2026 took the ADDRESS off the form — an app's URL
// was one more thing to type at the moment somebody is trying to record that the
// app exists — and deferred WHAT IT COSTS US A MONTH to version two, in Aurora's
// own words: "it's a much more complex topic, not a single number".
//
// Both COLUMNS stay, and so do both values on this form's state. An app's monthly
// cost is an input to the agency's own margin (lib/internal-money.ts sums it),
// and a form that stopped asking for a number while still SENDING one would
// quietly zero every app it was used to edit. So `url` and `toolCostCentsPerMonth`
// ride through from `initial` untouched on an edit, and a newly recorded app
// simply starts without them.
//
// FormShell (R4) + a per-session draft (R7), like every other write.

import * as React from "react"

import { Checkbox } from "@shared/ui/controls/checkbox/checkbox"
import { FileUpload } from "@shared/ui/controls/file-upload/file-upload"
import { DialogDescription, DialogTitle } from "@shared/ui/controls/dialog/dialog"
import { Field } from "@shared/web/field"
import { Input } from "@shared/ui/controls/input/input"
import { Notes } from "@shared/web/notes-editor/notes-editor"
import { Textarea } from "@shared/ui/controls/textarea/textarea"
import { toast } from "@shared/ui/controls/sonner/sonner"
import { defaultFieldConfig } from "@shared/web/screen-engine/config"

import { ApiFailure, tenancy } from "@/lib/api"
import { listFetch } from "@/lib/live-resources"
import { APP_STAGES, appStageMark } from "@shared/app-stages"
import { SELECTABLE_GROUPS } from "@shared/selectable-groups"
import type { SelectableValue } from "@shared/types"
import { pickerKey, searchAccounts } from "@/lib/picker-sources"
import { RecordPicker } from "@/components/record-picker"
import type { PickableRecord } from "@/lib/pickable"
import type { PickablePerson } from "@/lib/members"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { richTextValue, safeSrc } from "@shared/web/rich-text"
import { fileToDataUrl } from "@/lib/image"
import { useCached } from "@shared/web/store"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

export type AppFormValues = {
  name: string
  accountId: string
  url: string
  stage: string
  /** THE CLIENT'S OWN MARK. A data URL on the way out of this form (the picker
   * downsizes it in the browser) and a `/media/...` path on the way back in,
   * because the door stores the bytes and keeps the path. */
  logoUrl: string
  /** whole cents a month — converted from the amount the form asks for */
  toolCostCentsPerMonth: number
  // THE FOUR CONTEXT FIELDS. They are on the form, not on a second "describe it"
  // screen, because the moment somebody records an app is the moment they know
  // the answers — a field asked for later is a field left empty.
  about: string
  clientContext: string
  solution: string
  keyActors: string
  // ── WHO IS ON IT ───────────────────────────────────────────────────────────
  // CHECKLIST 8.10 and 8.5, and they are asked HERE rather than on a second
  // screen for the same reason the four context fields are: the moment somebody
  // records an app is the moment they know who is on it. Three other asks were
  // blocked on the answer — my tickets (2.3), who a story goes to (6.6), and
  // who may press Done (6.10) — so a field deferred is three features deferred.
  staffUserIds: string[]
  /** one of `staffUserIds`, or empty. The door refuses a lead who is not on it. */
  leadUserId: string
  stakeholderContactIds: string[]
  /** one of `stakeholderContactIds`, or empty. Who a resolved ticket is mailed to. */
  mainStakeholderContactId: string
}

const nameField = { ...defaultFieldConfig, label: "What it's called", required: true }
const accountField = {
  ...defaultFieldConfig,
  label: "Whose system it is",
  required: false,
  hint: "Set once. Leave it blank for one of our own.",
}
const stageField = { ...defaultFieldConfig, label: "Stage", required: false, hint: "Where it has got to." }
const logoField = {
  ...defaultFieldConfig,
  label: "Logo",
  required: false,
  hint: "The client's own mark. Without one the tile shows the stage.",
}
const aboutField = { ...defaultFieldConfig, label: "About", required: false, hint: "What this system is, in a sentence or two." }
const contextField = {
  ...defaultFieldConfig,
  label: "Client context",
  required: false,
  hint: "The situation it was built into.",
}
const solutionField = { ...defaultFieldConfig, label: "Solution", required: false, hint: "What we did about it." }
const actorsField = {
  ...defaultFieldConfig,
  label: "Key actors",
  required: false,
  hint: "Who actually uses it, in their words.",
}
const staffField = {
  ...defaultFieldConfig,
  label: "Who is on it",
  required: false,
  hint: "Our team. Only they and an admin open this app's page.",
}
const leadField = {
  ...defaultFieldConfig,
  label: "Team lead",
  required: false,
  hint: "The one who marks work on this app done.",
}
const stakeholderField = {
  ...defaultFieldConfig,
  label: "Their contacts",
  required: false,
  hint: "The client's own contacts for this system.",
}
const mainStakeholderField = {
  ...defaultFieldConfig,
  label: "Main stakeholder",
  required: false,
  hint: "Who hears back when a ticket on this app is answered.",
}

/** The word for nobody. A Select cannot hold an empty string as a value, so the
 * absence has to be spelled — the same sentinel the ticket form uses. */
const NOBODY = "__none__"

/** The team's App stage vocabulary, newest answer first: the rows somebody has
 * curated on the Dropdown values screen, and the eight the agency already uses
 * as the fallback while that read is in flight or a team has retired the lot.
 * The mark rides the label, never the stored value — a stage is its WORD, and
 * the pictograph is a mark in an icon slot (UI-CONVENTIONS §5). */
export function useAppStages(teamId: string): { value: string; mark: string }[] {
  const valuesQ = useCached<SelectableValue[]>(`selectable:${teamId}`, () => listFetch.selectable(teamId))
  const rows = (valuesQ.data ?? [])
    .filter((v) => v.active && v.type === SELECTABLE_GROUPS.appStage)
    .map((v) => ({ value: v.value, mark: v.mark ?? appStageMark(v.value) }))
  return rows.length > 0 ? rows : APP_STAGES.map((s) => ({ value: s.name, mark: s.mark }))
}


export function AppFormDialog({
  open,
  onOpenChange,
  accounts,
  members,
  initial,
  draftKey,
  onSubmit,
  teamId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: PickableRecord[]
  /** the team, for the "who is on it" list (8.10). Every member is offerable —
   * staffing is not a permission, it is a rota. */
  members: PickablePerson[]
  /** Present = editing an existing app. The ACCOUNT picker disappears in that
   * mode rather than being disabled: whose system it is was decided once, there
   * is no door to change it, and a greyed-out control that can never be used is
   * a question the form should not be asking. */
  initial?: AppFormValues
  draftKey?: string
  onSubmit: (values: AppFormValues) => Promise<void>
  /** the team, so the stage picker can read the team's own vocabulary */
  teamId: string
}) {
  const t = useT()
  const editing = initial !== undefined
  const stages = useAppStages(teamId)
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    initial
      ? {
          name: initial.name,
          accountId: initial.accountId,
          url: initial.url,
          stage: initial.stage,
          logoUrl: initial.logoUrl,
          cost: initial.toolCostCentsPerMonth ? String(initial.toolCostCentsPerMonth / 100) : "",
          about: initial.about,
          clientContext: initial.clientContext,
          solution: initial.solution,
          keyActors: initial.keyActors,
          staffUserIds: initial.staffUserIds,
          leadUserId: initial.leadUserId,
          stakeholderContactIds: initial.stakeholderContactIds,
          mainStakeholderContactId: initial.mainStakeholderContactId,
        }
      : {
          name: "",
          accountId: "",
          url: "",
          stage: "",
          logoUrl: "",
          cost: "",
          about: "",
          clientContext: "",
          solution: "",
          keyActors: "",
          staffUserIds: [] as string[],
          leadUserId: "",
          stakeholderContactIds: [] as string[],
          mainStakeholderContactId: "",
        },
    open
  )
  const [busy, setBusy] = React.useState(false)
  const ready = values.name.trim() !== ""
  // WHOSE PEOPLE THE STAKEHOLDER LIST IS — the account already on the app, or
  // the one being chosen. Read through the same door the account screen reads,
  // so "who is a contact here" has one answer in the app (the shape the ticket
  // form already has for the same question).
  const clientId = (editing ? initial.accountId : values.accountId) || null
  const contactsQ = useCached(clientId ? `account-detail:${clientId}` : null, () =>
    tenancy.accountDetail(clientId as string)
  )
  const contacts = (contactsQ.data?.links ?? [])
    .filter((l) => l.active)
    .map((l) => ({ id: l.personAccountId, name: l.personName }))
  /** A picked file becomes a data URL on the form, downsized in the browser
   * first — the same seam the account logo and the team logo use, so the body
   * that reaches the door is ~60 KB rather than a phone photo. */
  const pickLogo = async (files: File[]) => {
    if (!files[0]) return
    try {
      const dataUrl = await fileToDataUrl(files[0])
      setValues((s) => ({ ...s, logoUrl: dataUrl }))
    } catch {
      toast.error(t("Couldn't read that image. Try another one."))
    }
  }
  // The preview is either the file just picked (a `data:` URL that has not left
  // the browser) or the stored path the door minted, which goes through the URL
  // boundary like every other stored URL this app renders.
  const logoPreview = values.logoUrl.startsWith("data:") ? values.logoUrl : safeSrc(values.logoUrl)

  // A lead who has been unticked is no longer a lead — worked out on the fly so
  // the form can never send the pair the door would refuse.
  const lead = values.staffUserIds.includes(values.leadUserId) ? values.leadUserId : ""
  const mainHolder = values.stakeholderContactIds.includes(values.mainStakeholderContactId)
    ? values.mainStakeholderContactId
    : ""

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      // Whole units in, whole cents out. The form no longer ASKS for this, so on
      // a new app the amount is empty and lands as zero; on an edit it is the
      // app's existing cost, carried through the draft so saving a rename cannot
      // wipe a number nobody was shown.
      const amount = Number(values.cost.trim())
      await onSubmit({
        name: values.name.trim(),
        accountId: values.accountId,
        url: values.url.trim(),
        stage: values.stage.trim(),
        logoUrl: values.logoUrl,
        toolCostCentsPerMonth:
          values.cost.trim() !== "" && Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : 0,
        about: richTextValue(values.about),
        clientContext: richTextValue(values.clientContext),
        solution: richTextValue(values.solution),
        keyActors: values.keyActors.trim(),
        staffUserIds: values.staffUserIds,
        leadUserId: lead,
        stakeholderContactIds: values.stakeholderContactIds,
        mainStakeholderContactId: mainHolder,
      })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't save the app."))
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
      title={<DialogTitle>{editing ? t("Edit app") : t("Record an app")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {editing
            ? t("Change what it's called, or where it has got to.")
            : t("A system we built for somebody. Processes live inside one.")}
        </DialogDescription>
      }
      submit={{
        busy: busy,
        disabled: !ready,
      }}
    >
      <Field config={nameField} htmlFor="app-name" className={fieldSpacing}>
        <Input
          id="app-name"
          value={values.name}
          onChange={(e) => setValues((s) => ({ ...s, name: e.target.value }))}
          placeholder={t("e.g. Dispatch")}
          disabled={busy}
          autoFocus
        />
      </Field>
      {!editing && (
      <Field config={accountField} htmlFor="app-account" className={fieldSpacing}>
        {/* The COMPANIES, asked of the door (accounts PAGE, R14). `accounts` is
            still passed in: the screen's own page one, painted while the first
            answer arrives, and where an app already on a client gets its name. */}
        <RecordPicker
          id="app-account"
          value={values.accountId}
          onChange={(v) => setValues((s) => ({ ...s, accountId: v }))}
          search={(term) => searchAccounts(term, { type: "entity" })}
          searchKey={pickerKey("companies", teamId)}
          options={accounts.map((a) => ({ value: a.id, label: a.name, picture: a.logoUrl }))}
          placeholder={t("One of ours")}
          searchPlaceholder={t("Search companies…")}
          emptyText={t("No company matched.")}
          disabled={busy}
        />
      </Field>
      )}
      {/* STAGE IS A CHOICE, not a typed word. It was free text until 17 Aug 2026,
          which is how one inventory came to carry "live", "Live" and "in dev" for
          the same three systems. The mark rides the LABEL only. */}
      <Field config={stageField} htmlFor="app-stage" className={fieldSpacing}>
        <RecordPicker
          id="app-stage"
          value={values.stage}
          onChange={(v) => setValues((s) => ({ ...s, stage: v }))}
          // THE GLYPH IN THE SLOT, not in the sentence (R35). It used to be
          // concatenated into the label — `${mark} ${word}` — which is a
          // pictograph inside a sentence, the one shape UI-CONVENTIONS §5
          // refuses, and it also meant the trigger and the search index both
          // carried an emoji nobody typed.
          options={stages.map((s) => ({ value: s.value, label: t(s.value), mark: s.mark }))}
          placeholder={t("Not said")}
          searchPlaceholder={t("Search stages…")}
          emptyText={t("Nothing matched.")}
          disabled={busy}
        />
      </Field>
      {/* THE MARK, IN THE SQUARE IT WILL APPEAR IN. Same seam and same shape as
          the account logo: the picker downsizes in the browser, the fallback is
          the stage mark the tile draws today, and the preview is the tile.
          A `data:` preview cannot pass `safeSrc` — it is not a stored URL and
          never leaves the browser — so it is named rather than checked, exactly
          as the account form does. */}
      <Field config={logoField} htmlFor="app-logo" className={fieldSpacing}>
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="bg-muted grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl text-2xl leading-none"
          >
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreview} alt="" className="size-full object-contain" />
            ) : (
              appStageMark(values.stage) || values.name.slice(0, 1).toUpperCase()
            )}
          </span>
          <FileUpload accept="image/*" multiple={false} onFilesSelected={pickLogo} />
        </div>
      </Field>
      <Field config={aboutField} htmlFor="app-about" className={fieldSpacing}>
        <Notes
          key={open ? "open" : "shut"}
          defaultValue={values.about}
          onChange={(html) => setValues((s) => ({ ...s, about: html }))}
          placeholder={t("What this system does, and for whom.")}
          className="min-h-32"
        />
      </Field>
      <Field config={contextField} htmlFor="app-client-context" className={fieldSpacing}>
        <Notes
          key={open ? "open" : "shut"}
          defaultValue={values.clientContext}
          onChange={(html) => setValues((s) => ({ ...s, clientContext: html }))}
          placeholder={t("How they were working before, and what it was costing them.")}
          className="min-h-32"
        />
      </Field>
      <Field config={solutionField} htmlFor="app-solution" className={fieldSpacing}>
        <Notes
          key={open ? "open" : "shut"}
          defaultValue={values.solution}
          onChange={(html) => setValues((s) => ({ ...s, solution: html }))}
          placeholder={t("What we built, and the decisions behind it.")}
          className="min-h-32"
        />
      </Field>
      <Field config={actorsField} htmlFor="app-key-actors" className={fieldSpacing}>
        <Textarea
          id="app-key-actors"
          rows={2}
          value={values.keyActors}
          onChange={(e) => setValues((s) => ({ ...s, keyActors: e.target.value }))}
          placeholder={t("e.g. the two dispatchers, and whoever is on the counter")}
          disabled={busy}
        />
      </Field>
      {/* WHO IS ON IT (8.10). A tick list rather than a multi-select control,
          because the library ships no multi-select and the rulebook is explicit
          that nothing here edits the library — the same shape the story form
          already uses for the processes it touches. */}
      <Field config={staffField} shape="group" htmlFor="app-staff" className={fieldSpacing}>
        <div className="flex flex-col gap-2" id="app-staff">
          {members.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("Nobody on the team yet.")}</p>
          ) : (
            members.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={values.staffUserIds.includes(m.id)}
                  onCheckedChange={(c) =>
                    setValues((s) => ({
                      ...s,
                      staffUserIds:
                        c === true
                          ? [...s.staffUserIds, m.id]
                          : s.staffUserIds.filter((x) => x !== m.id),
                    }))
                  }
                  disabled={busy}
                />
                {m.name}
              </label>
            ))
          )}
        </div>
      </Field>
      {/* THE LEAD IS CHOSEN FROM THE PEOPLE ALREADY TICKED, and the field is not
          there until somebody is: a lead is one of the staff by definition, and
          a picker with nothing in it is a question with no possible answer. */}
      {values.staffUserIds.length > 0 && (
        <Field config={leadField} htmlFor="app-lead" className={fieldSpacing}>
          <RecordPicker
            id="app-lead"
            value={lead || NOBODY}
            onChange={(v) => setValues((s) => ({ ...s, leadUserId: v === NOBODY ? "" : v }))}
            options={members
              .filter((m) => values.staffUserIds.includes(m.id))
              .map((m) => ({ value: m.id, label: m.name, picture: m.photo, shape: "round" as const }))}
            emptyOption={{ value: NOBODY, label: t("Nobody yet") }}
            placeholder={t("Nobody yet")}
            searchPlaceholder={t("Search members…")}
            emptyText={t("Nobody here matched.")}
            disabled={busy}
          />
        </Field>
      )}
      {/* THEIR CONTACTS (8.5), from the client's own contacts. Absent entirely on
          one of our own systems, which has no client to have contacts at. */}
      {clientId && (
        <Field config={stakeholderField} shape="group" htmlFor="app-stakeholders" className={fieldSpacing}>
          <div className="flex flex-col gap-2" id="app-stakeholders">
            {contacts.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t("Nobody is on this client's books yet.")}
              </p>
            ) : (
              contacts.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={values.stakeholderContactIds.includes(c.id)}
                    onCheckedChange={(ch) =>
                      setValues((s) => ({
                        ...s,
                        stakeholderContactIds:
                          ch === true
                            ? [...s.stakeholderContactIds, c.id]
                            : s.stakeholderContactIds.filter((x) => x !== c.id),
                      }))
                    }
                    disabled={busy}
                  />
                  {c.name}
                </label>
              ))
            )}
          </div>
        </Field>
      )}
      {values.stakeholderContactIds.length > 0 && (
        <Field config={mainStakeholderField} htmlFor="app-main-stakeholder" className={fieldSpacing}>
          <RecordPicker
            id="app-main-stakeholder"
            value={mainHolder || NOBODY}
            onChange={(v) =>
              setValues((s) => ({ ...s, mainStakeholderContactId: v === NOBODY ? "" : v }))
            }
            options={contacts
              .filter((c) => values.stakeholderContactIds.includes(c.id))
              .map((c) => ({ value: c.id, label: c.name }))}
            emptyOption={{ value: NOBODY, label: t("Not said") }}
            placeholder={t("Not said")}
            searchPlaceholder={t("Search contacts…")}
            emptyText={t("Nobody here matched.")}
            disabled={busy}
          />
        </Field>
      )}
    </FormShellDialog>
  )
}
