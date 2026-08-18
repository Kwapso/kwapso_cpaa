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
} from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { richTextValue } from "@shared/web/rich-text"
import { Notes } from "@kwapso/ui/registry/primitives/notes/notes"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kwapso/ui/registry/primitives/select/select"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"
import { X } from "lucide-react"

import { ApiFailure, tenancy } from "@/lib/api"
import { accountsKey, appsKey, listFetch } from "@/lib/live-resources"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useCached } from "@shared/web/store"
import { ManageDropdownsLink } from "@/components/manage-dropdowns-link"
import type { Account, AppRow } from "@shared/types"
import { useT } from "@shared/web/language"

const descField = { ...defaultFieldConfig, label: "What do you need help with?", required: true }
const typeField = { ...defaultFieldConfig, label: "Type", required: false }
const accountField = {
  ...defaultFieldConfig,
  label: "Client",
  required: false,
  hint: "The company this is for. Their people see it in their portal; leave it off for our own questions.",
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
const contactField = {
  ...defaultFieldConfig,
  label: "Raised by",
  required: false,
  hint: "The person at that client who asked. Not always whoever types it in.",
}

// Radix Select can't hold an empty value, so "no type" uses a sentinel.
const NONE = "__none__"

export function HelpFormDialog({
  open,
  onOpenChange,
  onSubmit,
  helpTypeOptions,
  fixedApp,
  initial,
  draftKey,
  teamId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: {
    description: string
    helpType?: string
    accountId?: string
    appId?: string
    raisedByContactId?: string
  }) => Promise<void>
  /** The team's active "Ticket type" dropdown values. */
  helpTypeOptions: string[]
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
    raisedByContactId?: string | null
  }
  /** stable id for per-session draft persistence (CACHING.md §11); omit to disable */
  draftKey?: string
  /** active team — drives the gated "Manage dropdowns" link */
  teamId?: string | null
}) {
  const t = useT()
  const isEdit = !!initial
  // THE PICKER FETCHES ITS OWN LIST, and that is the half a passed-in prop would
  // have got wrong: the screen-level `accountsQ` is only loaded on the ACCOUNTS
  // section (use-screen-data.ts), so a ticket form handed that list would render
  // an empty dropdown on the one screen it is opened from. Same seam and same
  // cache key the accounts screen reads (page one is plenty for a picker), and
  // the same shape SprintFormDialog uses for exactly this reason.
  const accountsQ = useCached<Account[]>(teamId ? accountsKey(teamId) : null, () =>
    listFetch.accounts(teamId as string)
  )
  const accountOptions = (accountsQ.data ?? []).filter((a) => a.active && a.accountType === "entity")
  // The apps this ticket could be about. Same cache key the Apps screen reads,
  // so a person who has been there pays nothing for this picker.
  const appsQ = useCached<AppRow[]>(teamId ? appsKey(teamId) : null, () =>
    listFetch.apps(teamId as string)
  )
  // The client already on the ticket — the one value on this form that is a fact
  // rather than a question, because the door will refuse any attempt to change it.
  const fixedAccount = initial?.accountId
    ? (accountOptions.find((a) => a.id === initial.accountId) ?? { id: initial.accountId, name: "this client" })
    : null
  const initialValues = {
    description: initial?.description ?? "",
    helpType: initial?.helpType || NONE,
    accountId: initial?.accountId || NONE,
    appId: initial?.appId || fixedApp?.id || NONE,
    raisedByContactId: initial?.raisedByContactId || NONE,
  }
  // Per-session draft: restores what you typed if you navigate away and reopen.
  const [values, setValues, clearDraft] = useFormDraft(draftKey, initialValues, open)
  const [busy, setBusy] = React.useState(false)
  // WHICH CLIENT THE CONTACT LIST BELONGS TO — the one already on the ticket, or
  // the one being picked. Read from the same door the account screen reads, so
  // "who is a contact here" has one answer in the app.
  const chosenAccountId = fixedAccount?.id ?? (values.accountId === NONE ? null : values.accountId)
  const detailQ = useCached(chosenAccountId ? `account-detail:${chosenAccountId}` : null, () =>
    tenancy.accountDetail(chosenAccountId as string)
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await onSubmit({
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
        raisedByContactId:
          values.raisedByContactId === NONE ? undefined : values.raisedByContactId,
      })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof ApiFailure
          ? err.message
          : isEdit
            ? "Couldn't save the ticket."
            : "Couldn't raise the ticket."
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
      title={<DialogTitle>{isEdit ? "Edit this ticket" : "Raise a ticket"}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {isEdit
            ? "Update what you're asking for. Everyone on the ticket will see the change."
            : "Describe the problem you're facing. Chat with others, or use this ticket as a forum to discuss solutions."}
        </DialogDescription>
      }
      submit={{
        busy: busy,
        disabled: !richTextValue(values.description),
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
      <Field config={typeField} htmlFor="help-type" className={fieldSpacing}>
        <div className="relative">
          <Select
            value={values.helpType}
            onValueChange={(helpType) => setValues((v) => ({ ...v, helpType }))}
            disabled={busy}
          >
            <SelectTrigger id="help-type">
              <SelectValue placeholder={t("Choose a type (optional)")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("No type")}</SelectItem>
              {helpTypeOptions.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Clear (X): reset to NONE without scrolling up to "No type". */}
          {values.helpType !== NONE && !busy && (
            <button
              type="button"
              aria-label={t("Clear type")}
              onClick={() => setValues((v) => ({ ...v, helpType: NONE }))}
              className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-8 my-auto flex size-5 items-center justify-center rounded-sm"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <ManageDropdownsLink teamId={teamId ?? null} />
      </Field>
      {/* WHICH SYSTEM (CHECKLIST 5.8). Above the client picker in the markup but
          BELOW it in meaning: the contact list under it depends on which client
          is chosen, so the three read top to bottom as one sentence. */}
      <Field config={appField} htmlFor="help-app" className={fieldSpacing}>
        {fixedApp ? (
          <p className="text-muted-foreground text-sm" id="help-app">
            {fixedApp.name}
          </p>
        ) : (
          <Select
            value={values.appId || NONE}
            onValueChange={(appId) => setValues((v) => ({ ...v, appId }))}
            disabled={busy}
          >
            <SelectTrigger id="help-app">
              <SelectValue placeholder={t("No app")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("No app")}</SelectItem>
              {(appsQ.data ?? [])
                .filter((a) => a.active)
                .map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      {/* The picker reads `values.accountId || NONE` rather than the bare value:
          a draft saved in this tab before this field existed restores an object
          without it, and an undefined value would quietly make the Select
          uncontrolled. */}
      <Field config={accountField} htmlFor="help-account" className={fieldSpacing}>
        {fixedAccount ? (
          <p className="text-muted-foreground text-sm" id="help-account">
            {fixedAccount.name}, a ticket can&apos;t be moved to another client.
          </p>
        ) : (
          <Select
            value={values.accountId || NONE}
            onValueChange={(accountId) => setValues((v) => ({ ...v, accountId }))}
            disabled={busy}
          >
            <SelectTrigger id="help-account">
              <SelectValue placeholder={t("Ours, no client")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("Ours, no client")}</SelectItem>
              {accountOptions.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      {/* WHO ASKED (CHECKLIST 5.9), narrowed to that account's own contacts —
          which is also what the door enforces, so the picker can never offer a
          person the server would refuse. Hidden until a client is chosen: a
          contact belongs to a company, and offering the field first would be a
          question with no possible answer. */}
      {chosenAccountId && (
        <Field config={contactField} htmlFor="help-contact" className={fieldSpacing}>
          <Select
            value={values.raisedByContactId || NONE}
            onValueChange={(raisedByContactId) => setValues((v) => ({ ...v, raisedByContactId }))}
            disabled={busy}
          >
            <SelectTrigger id="help-contact">
              <SelectValue placeholder={t("Not said")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("Not said")}</SelectItem>
              {(detailQ.data?.links ?? [])
                .filter((l) => l.active)
                .map((l) => (
                  <SelectItem key={l.personAccountId} value={l.personAccountId}>
                    {l.personName}
                    {l.isMainStakeholder ? ", main contact" : ""}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    </FormShellDialog>
  )
}
