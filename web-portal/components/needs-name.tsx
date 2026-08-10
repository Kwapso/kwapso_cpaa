"use client"

// First visit: what should we call you?
//
// The agency app's onboarding asks for a name and a photo and then walks someone
// into a team. A client is already where they're going, so this asks the one
// question whose answer is used (their name appears on the tickets they raise)
// and gets out of the way. No photo — nobody in the portal ever sees an avatar.
//
// R4: through the shared FormShell — the SAME one the agency app uses, imported
// rather than copied, because "one form layout" is the law and a second copy
// would be a second layout the day either drifted.
// R7: the draft survives a reload, like every other form in the base.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { FormShell, fieldSpacing } from "@shared/web/form-shell"
import { useFormDraft } from "@shared/web/use-form-draft"
import { invalidate } from "@shared/web/store"
import { ApiFailure, auth } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"

const firstConfig = { ...defaultFieldConfig, label: "First name", required: true }
const lastConfig = { ...defaultFieldConfig, label: "Last name", required: true }

export function NeedsName({ onDone }: { onDone: () => void }) {
  const [values, setValues, clearDraft] = useFormDraft(
    "portal:name",
    { firstName: "", lastName: "" },
    true
  )
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | undefined>()

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await auth.updateProfile({ firstName: values.firstName, lastName: values.lastName })
      clearDraft()
      invalidate(cacheKeys.session)
      onDone()
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : "Couldn't save that. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const ready = values.firstName.trim() !== "" && values.lastName.trim() !== ""

  return (
    <main className="mx-auto flex min-h-[100svh] max-w-md flex-col justify-center px-6">
      <FormShell
        title={<h1 className="text-2xl font-semibold tracking-tight">What should we call you?</h1>}
        subtitle={
          <p className="text-muted-foreground">
            Your name goes on anything you send us, so we know who we&apos;re talking to.
          </p>
        }
        onSubmit={save}
        footer={
          <Button type="submit" className="w-full" disabled={busy || !ready}>
            {busy ? <Spinner /> : null}
            Continue
          </Button>
        }
      >
        <Field config={firstConfig} htmlFor="firstName" className={fieldSpacing}>
          <Input
            id="firstName"
            value={values.firstName}
            onChange={(e) => setValues({ ...values, firstName: e.target.value })}
            disabled={busy}
            autoFocus
          />
        </Field>
        <Field config={lastConfig} htmlFor="lastName" className={fieldSpacing} error={error}>
          <Input
            id="lastName"
            value={values.lastName}
            onChange={(e) => setValues({ ...values, lastName: e.target.value })}
            disabled={busy}
          />
        </Field>
      </FormShell>
    </main>
  )
}
