"use client"

// Give someone at this account a login (portal access). You pick a PERSON we
// already hold — a contact of the account, or the account itself when it is a
// person — never a typed-in address: the door reads that person's own email off
// their record and matches it to their sign-in. So staff can only ever switch on
// access for people already on their own books.
//
// The person has to have signed in here at least once; if they haven't, the door
// says so by name and the message tells staff what to ask them to do. Shared
// FormShell (R4) + a per-session draft (R7).

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
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
import { KeyRound } from "lucide-react"

import { ApiFailure } from "@/lib/api"
import { FormShell, fieldSpacing } from "@shared/web/form-shell"
import { useFormDraft } from "@shared/web/use-form-draft"

const personField = { ...defaultFieldConfig, label: "Person", required: true }

export function PortalAccessDialog({
  open,
  onOpenChange,
  accountName,
  candidates,
  onSubmit,
  draftKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountName: string
  /** who can be given a login here: the account's contacts (and itself, if it's a
   * person), each with the email their access will be matched to. */
  candidates: { id: string; name: string; email: string | null }[]
  onSubmit: (personAccountId: string) => Promise<void>
  draftKey?: string
}) {
  const [values, setValues, clearDraft] = useFormDraft(draftKey, { personAccountId: "" }, open)
  const [busy, setBusy] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!values.personAccountId) return
    setBusy(true)
    try {
      await onSubmit(values.personAccountId)
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      // The door's sentence is the useful one here — it names the person and says
      // whether they need an email or a first sign-in.
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't switch on access.")
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
          title={<DialogTitle>Give someone access</DialogTitle>}
          subtitle={
            <DialogDescription>
              They&apos;ll be able to sign in and see {accountName}&apos;s own work. You can take
              it away again at any time, and nothing they&apos;re attached to is lost.
            </DialogDescription>
          }
          footer={
            <Button type="submit" disabled={busy || !values.personAccountId} className="gap-1.5">
              {busy ? <Spinner /> : <KeyRound className="size-4" />}
              {busy ? "Switching on…" : "Give access"}
            </Button>
          }
        >
          <Field config={personField} htmlFor="portal-person" className={fieldSpacing}>
            <Select
              value={values.personAccountId}
              onValueChange={(personAccountId) => setValues({ personAccountId })}
              disabled={busy || candidates.length === 0}
            >
              <SelectTrigger id="portal-person">
                <SelectValue
                  placeholder={candidates.length ? "Choose a person" : "Add a contact first"}
                />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {/* The email is shown only where we hold it on the record —
                     * never guessed. If the person has none, the door says so by
                     * name when you try. */}
                    {c.email ? ` · ${c.email}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FormShell>
      </DialogContent>
    </Dialog>
  )
}
