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

import { Field } from "@shared/web/field"
import { Input } from "@shared/ui/controls/input/input"
import { defaultFieldConfig } from "@shared/web/screen-engine/config"

import { FormShell, fieldSpacing } from "@shared/web/form-shell"
import { useFormDraft } from "@shared/web/use-form-draft"
import { invalidate } from "@shared/web/store"
import { ApiFailure, auth } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"
import { useT } from "@shared/web/language"

const firstConfig = { ...defaultFieldConfig, label: "First name", required: true }
const lastConfig = { ...defaultFieldConfig, label: "Last name", required: true }

export function NeedsName({ onDone }: { onDone: () => void }) {
  const t = useT()
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
    // No px here: FormShell states its own padding on every region now, so a
    // gutter at this level would double it on a phone.
    <main className="mx-auto flex min-h-[100svh] max-w-md flex-col justify-center">
      <FormShell
        title={<h1 className="text-2xl font-medium tracking-tight">{t("What should we call you?")}</h1>}
        subtitle={
          <p className="text-muted-foreground">
            {t("Your name goes on anything you send us, so we know who we're talking to.")}
          </p>
        }
        onSubmit={save}
        submit={{
          busy: busy,
          disabled: !ready,
        }}
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
