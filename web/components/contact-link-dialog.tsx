"use client"

// Link a person to an account — "Marta is a contact of Bergman". The person is
// always an account row we already hold (SCOPE ch.03: one table for everyone), so
// this picks one rather than typing a new name; add the person first if they're
// new. The same person can be a contact of more than one account, which is exactly
// what a parent pointer cannot say and this row can.
//
// The search runs on the SERVER (the accounts door's own `q`), so a team with
// thousands of people still finds the right one — a client-side filter over the
// first page would quietly hide the rest. Shared FormShell (R4) + draft (R7).

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Checkbox } from "@kwapso/ui/registry/primitives/checkbox/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
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
import { Plus, Search } from "lucide-react"

import type { Account } from "@shared/types"
import { ApiFailure, tenancy } from "@/lib/api"
import { FormShell, fieldSpacing } from "@/components/form-shell"
import { useCached } from "@/lib/store"
import { useFormDraft } from "@/lib/use-form-draft"

const personField = { ...defaultFieldConfig, label: "Person", required: true }
const relationshipField = { ...defaultFieldConfig, label: "Relationship", required: false }

export type ContactLinkValues = {
  personAccountId: string
  relationship: string
  isMainStakeholder: boolean
}

const EMPTY: ContactLinkValues = { personAccountId: "", relationship: "", isMainStakeholder: false }

export function ContactLinkDialog({
  open,
  onOpenChange,
  teamId,
  accountName,
  excludeIds,
  onSubmit,
  draftKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** the team whose people we're searching — every cache key is team-scoped, so a
   * team switch can never show the last team's results. */
  teamId: string
  /** the account they'll be a contact of — named in the copy so it's unmistakable. */
  accountName: string
  /** people already on this account (and the account itself), left out of the list. */
  excludeIds: string[]
  onSubmit: (values: ContactLinkValues) => Promise<void>
  draftKey?: string
}) {
  const [values, setValues, clearDraft] = useFormDraft(draftKey, EMPTY, open)
  const [query, setQuery] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  // Server-side search over people only. Keyed by the term so each search is
  // cached for the session; the door caps and pages, we show the first page.
  const term = query.trim()
  const peopleQ = useCached<Account[]>(
    open ? `account-people:${teamId}:${term}` : null,
    () => tenancy.accounts({ type: "individual", q: term || undefined }).then((r) => r.accounts)
  )
  const exclude = new Set(excludeIds)
  const people = (peopleQ.data ?? []).filter((p) => p.active && !exclude.has(p.id))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!values.personAccountId) return
    setBusy(true)
    try {
      await onSubmit(values)
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't add that contact.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return
        if (!o) clearDraft()
        onOpenChange(o)
      }}
    >
      <DialogContent>
        <FormShell
          onSubmit={submit}
          title={<DialogTitle>Add a contact</DialogTitle>}
          subtitle={
            <DialogDescription>
              Pick the person who&apos;s a contact of {accountName}. If they&apos;re new, add them
              as a person first.
            </DialogDescription>
          }
          footer={
            <Button type="submit" disabled={busy || !values.personAccountId} className="gap-1.5">
              {busy ? <Spinner /> : <Plus className="size-4" />}
              {busy ? "Adding…" : "Add contact"}
            </Button>
          }
        >
          <Field config={personField} htmlFor="contact-person" className={fieldSpacing}>
            <div className="relative">
              <Search
                className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people…"
                className="pl-8"
                disabled={busy}
                aria-label="Search people"
              />
            </div>
            <Select
              value={values.personAccountId}
              onValueChange={(personAccountId) => setValues((v) => ({ ...v, personAccountId }))}
              disabled={busy || people.length === 0}
            >
              <SelectTrigger id="contact-person">
                <SelectValue placeholder={people.length ? "Choose a person" : "No people found"} />
              </SelectTrigger>
              <SelectContent>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.email ? ` · ${p.email}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field config={relationshipField} htmlFor="contact-relationship" className={fieldSpacing}>
            <Input
              id="contact-relationship"
              value={values.relationship}
              onChange={(e) => setValues((v) => ({ ...v, relationship: e.target.value }))}
              placeholder="Operations"
              disabled={busy}
            />
          </Field>

          <div className="flex items-center gap-2">
            <Checkbox
              id="contact-main"
              checked={values.isMainStakeholder}
              onCheckedChange={(c) => setValues((v) => ({ ...v, isMainStakeholder: c === true }))}
              disabled={busy}
            />
            <label htmlFor="contact-main" className="text-sm">
              Main contact — the person you deal with first
            </label>
          </div>
        </FormShell>
      </DialogContent>
    </Dialog>
  )
}
