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

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import {
  DialogDescription,
  DialogTitle,
} from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { Textarea } from "@kwapso/ui/registry/primitives/textarea/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kwapso/ui/registry/primitives/select/select"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"
import { X } from "lucide-react"

import { ApiFailure } from "@/lib/api"
import { accountsKey, listFetch } from "@/lib/live-resources"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useCached } from "@shared/web/store"
import { ManageDropdownsLink } from "@/components/manage-dropdowns-link"
import type { Account } from "@shared/types"

const descField = { ...defaultFieldConfig, label: "What do you need help with?", required: true }
const typeField = { ...defaultFieldConfig, label: "Type", required: false }
const accountField = {
  ...defaultFieldConfig,
  label: "Client",
  required: false,
  hint: "The company this is for. Their people see it in their portal; leave it off for our own questions.",
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
  onSubmit: (input: { description: string; helpType?: string; accountId?: string }) => Promise<void>
  /** The team's active "Ticket type" dropdown values. */
  helpTypeOptions: string[]
  /** Present = EDIT mode (prefilled). */
  initial?: { description: string; helpType?: string | null; accountId?: string | null }
  /** stable id for per-session draft persistence (CACHING.md §11); omit to disable */
  draftKey?: string
  /** active team — drives the gated "Manage dropdowns" link */
  teamId?: string | null
}) {
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
  // The client already on the ticket — the one value on this form that is a fact
  // rather than a question, because the door will refuse any attempt to change it.
  const fixedAccount = initial?.accountId
    ? (accountOptions.find((a) => a.id === initial.accountId) ?? { id: initial.accountId, name: "this client" })
    : null
  const initialValues = {
    description: initial?.description ?? "",
    helpType: initial?.helpType || NONE,
    accountId: initial?.accountId || NONE,
  }
  // Per-session draft: restores what you typed if you navigate away and reopen.
  const [values, setValues, clearDraft] = useFormDraft(draftKey, initialValues, open)
  const [busy, setBusy] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await onSubmit({
        description: values.description.trim(),
        helpType: values.helpType === NONE ? undefined : values.helpType,
        // On a ticket that already has a client, send the one it has — the door
        // accepts naming the SAME client and refuses naming a different one, so
        // this is the value that can never be a surprise.
        accountId: fixedAccount
          ? fixedAccount.id
          : values.accountId === NONE
            ? undefined
            : values.accountId,
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
      footer={
        <Button type="submit" disabled={busy || !values.description.trim()}>
          {busy ? <Spinner /> : null}
          {busy ? (isEdit ? "Saving…" : "Raising…") : isEdit ? "Save changes" : "Raise ticket"}
        </Button>
      }
    >
      <Field config={descField} htmlFor="help-desc" className={fieldSpacing}>
        <Textarea
          id="help-desc"
          value={values.description}
          onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
          placeholder="Tell us what's going on — e.g. I can't invite a new member, the button is greyed out."
          disabled={busy}
          rows={4}
          autoFocus
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
              <SelectValue placeholder="Choose a type (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No type</SelectItem>
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
              aria-label="Clear type"
              onClick={() => setValues((v) => ({ ...v, helpType: NONE }))}
              className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-8 my-auto flex size-5 items-center justify-center rounded-sm"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <ManageDropdownsLink teamId={teamId ?? null} />
      </Field>
      {/* The picker reads `values.accountId || NONE` rather than the bare value:
          a draft saved in this tab before this field existed restores an object
          without it, and an undefined value would quietly make the Select
          uncontrolled. */}
      <Field config={accountField} htmlFor="help-account" className={fieldSpacing}>
        {fixedAccount ? (
          <p className="text-muted-foreground text-sm" id="help-account">
            {fixedAccount.name} — a ticket can&apos;t be moved to another client.
          </p>
        ) : (
          <Select
            value={values.accountId || NONE}
            onValueChange={(accountId) => setValues((v) => ({ ...v, accountId }))}
            disabled={busy}
          >
            <SelectTrigger id="help-account">
              <SelectValue placeholder="Ours — no client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Ours — no client</SelectItem>
              {accountOptions.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
    </FormShellDialog>
  )
}
