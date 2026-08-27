"use client"

// Ticket form dialog — raise a NEW ticket, or EDIT one (when `initial` is present).
// Description is required; Type is an optional DROPDOWN drawn from the team's
// "Ticket type" dropdown values (selectable_data). Every member can see every ticket
// (the My/All tabs are just a raiser filter), so there's no audience picker.
// Library primitives.
//
// WHO IT IS FOR. A staff ticket may NAME the client it is raised on behalf of, and
// that is the field this form was missing: the door has accepted `accountId` from a
// staff caller since the customer spine landed, and the machine surface has offered
// it all along (`create_help_ticket`, whose own note says that without it "a machine
// can only raise tickets that no client will ever see") — while the screen offered
// no way to say it at all. So every ticket typed in the agency app belonged to
// nobody, and never appeared in the portal of the company that asked for it.
//
// It is SET ONCE. A ticket that already carries a client cannot be moved to another
// (lib/help.ts `updateTicket` refuses with `account_fixed`), because moving it would
// hand a conversation, replies and all, to strangers. So on a ticket that already
// has one the picker is replaced by the client's name — the same shape the sprint
// form uses for a fixed app, and for the same reason: a control that can only be
// refused should not be a control.
//
// A PORTAL caller never reaches this form. Theirs is web-portal's own
// raise-ticket-dialog, which has no picker and needs none — `createTicket` takes a
// client's account from the guard corridor and never consults the body.

import * as React from "react"

import {
  DialogDescription,
  DialogTitle,
} from "@shared/ui/controls/dialog/dialog"
import { Button } from "@shared/ui/controls/button/button"
import { FileUpload } from "@shared/ui/controls/file-upload/file-upload"
import { Paperclip, X } from "@shared/ui/icons"
import { Field } from "@shared/web/field"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { richTextValue } from "@shared/web/rich-text"
import { Notes } from "@shared/web/notes-editor/notes-editor"
import { toast } from "@shared/ui/controls/sonner/sonner"
import { defaultFieldConfig } from "@shared/web/screen-engine/config"

import { ApiFailure, content, tenancy } from "@/lib/api"
import { appModulesKey, appsKey, listFetch } from "@/lib/live-resources"
import { pickerKey, searchAccounts } from "@/lib/picker-sources"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useCached } from "@shared/web/store"
import { ManageDropdownsLink } from "@/components/manage-dropdowns-link"
import { RecordPicker } from "@/components/record-picker"
import type { AppModule, AppRow } from "@shared/types"
import { readFileAsDataUrl } from "@shared/web/file"
import { useT } from "@shared/web/language"

const descField = { ...defaultFieldConfig, label: "What do you need help with?", required: true }
const typeField = { ...defaultFieldConfig, label: "Type", required: false }
const accountField = {
  ...defaultFieldConfig,
  label: "Client",
  required: false,
  hint: "The company this is for. Their contacts see it in their portal; leave it off for our own questions.",
}
// CHECKLIST 5.8 and 5.9. Neither is `required: true` on the FORM, and that is
// deliberate rather than a shortcut: the agency's own housekeeping questions are
// about no system and were raised by nobody outside the building, so a hard
// requirement here would make the internal ticket unraisable. What the two fields
// change is that a client's ticket can finally SAY which app it is about and who
// asked, which is what routes it and who gets told when it is answered.
const appField = {
  ...defaultFieldConfig,
  label: "App",
  required: false,
  hint: "Which system this is about. It is what routes the request and who gets told when it is answered.",
}
// WHICH SECTION OF IT (Aurora, 19 Aug 2026). It sits directly under the app
// because it is meaningless without one, and the hint says so rather than
// leaving somebody to discover it by finding the list empty.
// REQUIRED, BUT ONLY WHERE IT CAN BE ANSWERED — and the two exceptions are not
// softenings of the rule, they are the rule staying true.
//
// Aurora asked for it required and 94% of the legacy tickets carried one, so the
// default is required. But a ticket about NO APP has no section to name — the
// agency's own housekeeping questions are exactly that, and the app field is
// optional for the same reason ("a hard requirement here would make the internal
// ticket unraisable"). And an app whose modules nobody has written down yet has
// nothing to offer, so requiring one would be a door with no handle.
//
// So: required once an app with modules is chosen, and silent otherwise. It
// tightens by itself as the apps get their sections written down, which is the
// opposite of a rule somebody has to remember to switch on.
const moduleField = (required: boolean) => ({
  ...defaultFieldConfig,
  label: "Module",
  required,
  hint: "Which part of the app it is about, like Settings or Documents. Choose the app first.",
})
const contactField = {
  ...defaultFieldConfig,
  label: "Raised by",
  required: false,
  hint: "The person at that client who asked. Not always whoever types it in.",
}

// Radix Select can't hold an empty value, so "no type" uses a sentinel.
const NONE = "__none__"

/** THE SCREENSHOT FIELD. Same words as the story form's, because it is the same
 * act and a second phrasing would be a second idea. */
const fileField = {
  ...defaultFieldConfig,
  label: "Something to show",
  required: false,
  hint: "A screenshot, a recording, a document somebody can open.",
}

export function HelpFormDialog({
  open,
  onOpenChange,
  onSubmit,
  helpTypeOptions,
  typeMarks,
  fixedApp,
  initial,
  draftKey,
  teamId,
  helpId,
  canAttach = true,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: {
    description: string
    helpType?: string
    accountId?: string
    appId?: string
    moduleId?: string
    raisedByContactId?: string
    /** RETURNS THE NEW TICKET'S ID on a create, when the caller has one.
     *
     * An attachment needs a ticket to belong to, and on a create there is no
     * ticket until the door answers — so the id comes back out rather than the
     * form guessing which row is new (the list is drag-ranked, so the newest is
     * not reliably first). An edit already knows it, as `helpId`. */
  }) => Promise<string | void>
  /** The team's active "Ticket type" dropdown values. */
  helpTypeOptions: string[]
  /** THE GLYPH BESIDE EACH WORD (R35). A map rather than richer options,
   * because the words come from the door and the marks come from the team's
   * own vocabulary cache — two reads the screen already holds, and joining
   * them here would make the dialog fetch. */
  typeMarks?: Map<string, string>
  /** Set when the form is opened FROM an app's own screen — the system the
   * request is about is then a fact about where you are standing rather than a
   * question, so the picker is replaced by its name. Separate from `initial`,
   * which means EDIT: this is a create with one field already answered, and
   * folding the two together would make a new ticket claim to be an edit. */
  fixedApp?: { id: string; name: string }
  /** Present = EDIT mode (prefilled). */
  initial?: {
    description: string
    helpType?: string | null
    accountId?: string | null
    appId?: string | null
    moduleId?: string | null
    raisedByContactId?: string | null
  }
  /** stable id for per-session draft persistence (CACHING.md §11); omit to disable */
  draftKey?: string
  /** active team — drives the gated "Manage dropdowns" link */
  teamId?: string | null
  /** THE TICKET BEING EDITED, when one is. Attachments hang off it; on a create
   * the id arrives from `onSubmit`'s answer instead. */
  helpId?: string
  /** Whether this person may attach at all. The door gates on `help:edit`, so a
   * control that always refused would be worse than none. */
  canAttach?: boolean
}) {
  const t = useT()
  const isEdit = !!initial
  // THE CLIENT PICKER ASKS THE DOOR, and page one is exactly why. This used to
  // read `accountsKey(teamId)` — the accounts LIST cache, whose fetcher primes a
  // cursor, because accounts is a GROWING_COLLECTIONS row (R14). So the picker
  // offered the newest fifty companies and had no opinion about the rest, which
  // is the owner's own report from a phone: "not all clients or contacts are
  // showing per account". `searchAccounts` puts the question to the accounts
  // door's `q`, the same door and the same gate the accounts screen reads.
  //
  // The apps this ticket could be about stay a loaded list: apps are BOUNDED (a
  // team's systems, not a feed), so the browser can match them for nothing.
  const appsQ = useCached<AppRow[]>(teamId ? appsKey(teamId) : null, () =>
    listFetch.apps(teamId as string)
  )
  // EVERY MODULE THE TEAM HAS, narrowed below to the app in hand. One bounded
  // read held whole, so changing the app above re-filters instantly instead of
  // putting a spinner inside a form somebody is halfway through.
  const modulesQ = useCached<AppModule[]>(teamId ? appModulesKey(teamId) : null, () =>
    tenancy.appModules().then((r) => r.modules)
  )
  const initialValues = {
    description: initial?.description ?? "",
    helpType: initial?.helpType || NONE,
    accountId: initial?.accountId || NONE,
    appId: initial?.appId || fixedApp?.id || NONE,
    moduleId: initial?.moduleId || NONE,
    raisedByContactId: initial?.raisedByContactId || NONE,
  }
  // Per-session draft: restores what you typed if you navigate away and reopen.
  const [values, setValues, clearDraft] = useFormDraft(draftKey, initialValues, open)
  const [busy, setBusy] = React.useState(false)
  /** WHAT SOMEBODY PICKED, held until there is a ticket to hang it on.
   *
   * THE OWNER, 26 Aug 2026: "add the ability to attach screenshots and files to
   * tickets while adding or editing them, just like we have at the story level."
   *
   * The doors have existed since attachments shipped — the detail screen has a
   * Files and links tab reading them — but the FORM never offered one, so the
   * moment a person is most likely to have the screenshot in hand (while
   * describing the fault) was the one moment they could not add it.
   *
   * They wait here rather than riding the create payload because storage is
   * addressed by ticket id, and on a create that id does not exist until the
   * door answers. Deliberately NOT in the draft: a File cannot be serialised
   * into sessionStorage, and a draft that silently dropped them would be worse
   * than one that never held them. */
  const [pending, setPending] = React.useState<File[]>([])
  React.useEffect(() => {
    if (!open) setPending([])
  }, [open])
  // WHICH CLIENT THE CONTACT LIST BELONGS TO — the one already on the ticket, or
  // the one being picked. Read from the same door the account screen reads, so
  // "who is a contact here" has one answer in the app.
  const chosenAccountId = initial?.accountId ?? (values.accountId === NONE ? null : values.accountId)
  // WHICH APP THE MODULE LIST BELONGS TO — the one pinned by the screen this
  // form was opened from, or the one being picked.
  const chosenAppId = fixedApp?.id ?? (values.appId === NONE ? null : values.appId)
  const appModules = (modulesQ.data ?? []).filter((m) => m.active && m.appId === chosenAppId)
  // Only demanded once there is something to demand — see `moduleField`.
  const moduleRequired = Boolean(chosenAppId) && appModules.length > 0
  const moduleMissing = moduleRequired && values.moduleId === NONE
  const detailQ = useCached(chosenAccountId ? `account-detail:${chosenAccountId}` : null, () =>
    tenancy.accountDetail(chosenAccountId as string)
  )
  // The client already on the ticket — the one value on this form that is a fact
  // rather than a question, because the door will refuse any attempt to change
  // it. Its NAME now comes from the account's own record rather than from a page
  // of the list: the detail is already being read for the contacts below it, and
  // a company past page one used to be shown to its own ticket as "this client".
  const fixedAccount = initial?.accountId
    ? { id: initial.accountId, name: detailQ.data?.account.name ?? t("this client") }
    : null

  /** ONE FILE AT A TIME, and a failure here never fails the ticket.
   *
   * The ticket is already raised by the time this runs. Turning a rejected
   * upload into a thrown submit would close nothing, clear no draft, and tell
   * somebody their request was not saved when it was — so the toast names the
   * attachment and the ticket stands. The same argument the story form settled. */
  async function attach(target: string, files: File[]) {
    for (const file of files) {
      try {
        await content.addHelpAttachment({
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
    setBusy(true)
    try {
      const madeId = await onSubmit({
        description: richTextValue(values.description),
        helpType: values.helpType === NONE ? undefined : values.helpType,
        // On a ticket that already has a client, send the one it has — the door
        // accepts naming the SAME client and refuses naming a different one, so
        // this is the value that can never be a surprise.
        accountId: fixedAccount
          ? fixedAccount.id
          : values.accountId === NONE
            ? undefined
            : values.accountId,
        appId: fixedApp ? fixedApp.id : values.appId === NONE ? undefined : values.appId,
        moduleId: values.moduleId === NONE ? undefined : values.moduleId,
        raisedByContactId:
          values.raisedByContactId === NONE ? undefined : values.raisedByContactId,
      })
      // THE FILES, ONCE THERE IS SOMETHING TO HANG THEM ON. `helpId` on an edit,
      // the id the create door just handed back otherwise.
      const target = helpId ?? (typeof madeId === "string" ? madeId : null)
      if (target && pending.length) await attach(target, pending)
      setPending([])
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof ApiFailure
          ? err.message
          : isEdit
            ? t("Couldn't save the ticket.")
            : t("Couldn't raise the ticket.")
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
      title={<DialogTitle>{isEdit ? t("Edit this ticket") : t("Raise a ticket")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {isEdit
            ? t("Update what you're asking for. Everyone on the ticket will see the change.")
            : t("Describe the problem you're facing. Chat with others, or use this ticket as a forum to discuss solutions.")}
        </DialogDescription>
      }
      submit={{
        busy: busy,
        disabled: !richTextValue(values.description) || moduleMissing,
      }}
    >
      <Field config={descField} htmlFor="help-desc" className={fieldSpacing}>
        <Notes
          key={open ? "open" : "shut"}
          defaultValue={values.description}
          onChange={(html) => setValues((v) => ({ ...v, description: html }))}
          placeholder={t("Tell us what's going on, e.g. I can't invite a new member, the button is greyed out.")}
          className="min-h-32"
        />
      </Field>
      {/* THE SCREENSHOT, BESIDE THE WORDS THAT DESCRIBE IT — and on BOTH halves
          of this dialog, which is the whole of the owner's ask: "while adding or
          editing them, just like we have at the story level." One field, one
          code path; the upload simply knows a different id on an edit.
          Behind `help:edit`, because that is what the attachments door gates on
          and a control that always refused would be worse than none. */}
      {canAttach && (
        <Field config={fileField} htmlFor="help-files" className={fieldSpacing}>
          <div className="flex flex-col gap-2">
            {pending.length > 0 && (
              <ul className="divide-border divide-y rounded-[var(--radius)] border">
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
              onFilesSelected={(files) => setPending((f) => [...f, ...files])}
              className={busy ? "pointer-events-none opacity-60" : undefined}
            />
          </div>
        </Field>
      )}
      {/* The type vocabulary is the team's own and grows on the Dropdown values
          screen, so it gets the search box too — and the picker's own clear X
          replaces the one this field used to draw by hand. */}
      <Field config={typeField} htmlFor="help-type" className={fieldSpacing}>
        <RecordPicker
          id="help-type"
          value={values.helpType}
          onChange={(helpType) => setValues((v) => ({ ...v, helpType }))}
          options={helpTypeOptions.map((v) => ({ value: v, label: v, mark: typeMarks?.get(v) ?? null }))}
          emptyOption={{ value: NONE, label: t("No type") }}
          placeholder={t("Choose a type (optional)")}
          searchPlaceholder={t("Search types…")}
          emptyText={t("No type matched.")}
          disabled={busy}
        />
        <ManageDropdownsLink teamId={teamId ?? null} />
      </Field>
      {/* WHICH SYSTEM (CHECKLIST 5.8). Above the client picker in the markup but
          BELOW it in meaning: the contact list under it depends on which client
          is chosen, so the three read top to bottom as one sentence. */}
      <Field config={appField} htmlFor="help-app" className={fieldSpacing}>
        <RecordPicker
          id="help-app"
          value={values.appId || NONE}
          onChange={(appId) => setValues((v) => ({ ...v, appId, moduleId: NONE }))}
          options={(appsQ.data ?? [])
            .filter((a) => a.active)
            .map((a) => ({ value: a.id, label: a.name }))}
          emptyOption={{ value: NONE, label: t("No app") }}
          placeholder={t("No app")}
          searchPlaceholder={t("Search apps…")}
          emptyText={t("No app matched.")}
          disabled={busy}
        />
      </Field>
      {/* WHICH SECTION OF IT. Offered only once an app is chosen, because a
          module belongs to one and the door refuses a pair that does not match —
          a picker that can only produce a refusal is worse than no picker.
          Changing the app CLEARS it, which is the one behaviour that keeps the
          two honest: a section of the old app is not a section of the new one. */}
      <Field config={moduleField(moduleRequired)} htmlFor="help-module" className={fieldSpacing}>
        <RecordPicker
          id="help-module"
          value={values.moduleId || NONE}
          onChange={(moduleId) => setValues((v) => ({ ...v, moduleId }))}
          options={appModules.map((m) => ({ value: m.id, label: m.name, mark: m.mark }))}
          emptyOption={{ value: NONE, label: t("No module") }}
          placeholder={chosenAppId ? t("No module") : t("Choose an app first")}
          searchPlaceholder={t("Search modules…")}
          emptyText={chosenAppId ? t("This app has no modules yet.") : t("Choose an app first.")}
          disabled={busy || !chosenAppId}
        />
      </Field>
      {/* The picker reads `values.accountId || NONE` rather than the bare value:
          a draft saved in this tab before this field existed restores an object
          without it, and an undefined value would quietly make the control
          uncontrolled. The COMPANIES only (`type: "entity"`), which is the same
          narrowing the old in-memory filter did, asked of the door instead. */}
      <Field config={accountField} htmlFor="help-account" className={fieldSpacing}>
        {fixedAccount ? (
          <p className="text-muted-foreground text-sm" id="help-account">
            {fixedAccount.name}, a ticket can&apos;t be moved to another client.
          </p>
        ) : (
          <RecordPicker
            id="help-account"
            value={values.accountId || NONE}
            onChange={(accountId) => setValues((v) => ({ ...v, accountId }))}
            search={(term) => searchAccounts(term, { type: "entity" })}
            searchKey={pickerKey("companies", teamId)}
            emptyOption={{ value: NONE, label: t("Ours, no client") }}
            placeholder={t("Ours, no client")}
            searchPlaceholder={t("Search companies…")}
            emptyText={t("No company matched.")}
            disabled={busy}
          />
        )}
      </Field>
      {/* WHO ASKED (CHECKLIST 5.9), narrowed to that account's own contacts —
          which is also what the door enforces, so the picker can never offer a
          person the server would refuse. Hidden until a client is chosen: a
          contact belongs to a company, and offering the field first would be a
          question with no possible answer. */}
      {chosenAccountId && (
        <Field config={contactField} htmlFor="help-contact" className={fieldSpacing}>
          {/* CLIENT-SIDE on purpose, and this is the picker where that is the
              SAFE answer rather than the lazy one. A company's contact list is
              BOUNDED (`listAccountLinks`, one hard-capped read), so the browser
              holds all of it — nothing is hidden past a cursor. And it must stay
              this list: the narrowing to one company's own people is the fence
              the door enforces, so searching a wider one would offer names the
              server would refuse. Search finds a contact faster; it does not
              widen who may be named. */}
          <RecordPicker
            id="help-contact"
            value={values.raisedByContactId || NONE}
            onChange={(raisedByContactId) => setValues((v) => ({ ...v, raisedByContactId }))}
            options={(detailQ.data?.links ?? [])
              .filter((l) => l.active)
              .map((l) => ({
                value: l.personAccountId,
                label: l.personName,
                hint: l.isMainStakeholder ? t("Main contact") : (l.relationship ?? undefined),
              }))}
            emptyOption={{ value: NONE, label: t("Not said") }}
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
