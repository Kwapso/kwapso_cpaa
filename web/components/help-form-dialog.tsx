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
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { ApiFailure, tenancy } from "@/lib/api"
import { appsKey, listFetch } from "@/lib/live-resources"
import { pickerKey, searchAccounts } from "@/lib/picker-sources"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useCached } from "@shared/web/store"
import { ManageDropdownsLink } from "@/components/manage-dropdowns-link"
import { RecordPicker } from "@/components/record-picker"
import type { AppRow } from "@shared/types"
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
  const initialValues = {
    description: initial?.description ?? "",
    helpType: initial?.helpType || NONE,
    accountId: initial?.accountId || NONE,
    appId: initial?.appId || NONE,
    raisedByContactId: initial?.raisedByContactId || NONE,
  }
  // Per-session draft: restores what you typed if you navigate away and reopen.
  const [values, setValues, clearDraft] = useFormDraft(draftKey, initialValues, open)
  const [busy, setBusy] = React.useState(false)
  // WHICH CLIENT THE CONTACT LIST BELONGS TO — the one already on the ticket, or
  // the one being picked. Read from the same door the account screen reads, so
  // "who is a contact here" has one answer in the app.
  const chosenAccountId = initial?.accountId ?? (values.accountId === NONE ? null : values.accountId)
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
        appId: values.appId === NONE ? undefined : values.appId,
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
      {/* The type vocabulary is the team's own and grows on the Dropdown values
          screen, so it gets the search box too — and the picker's own clear X
          replaces the one this field used to draw by hand. */}
      <Field config={typeField} htmlFor="help-type" className={fieldSpacing}>
        <RecordPicker
          id="help-type"
          value={values.helpType}
          onChange={(helpType) => setValues((v) => ({ ...v, helpType }))}
          options={helpTypeOptions.map((v) => ({ value: v, label: v }))}
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
          onChange={(appId) => setValues((v) => ({ ...v, appId }))}
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
            searchPlaceholder={t("Search clients…")}
            emptyText={t("No client matched.")}
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
            searchPlaceholder={t("Search people…")}
            emptyText={t("Nobody here matched.")}
            disabled={busy}
          />
        </Field>
      )}
    </FormShellDialog>
  )
}
