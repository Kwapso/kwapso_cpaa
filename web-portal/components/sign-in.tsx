"use client"

// SIGN IN — an email address and a six-digit code, and nothing else on screen.
//
// This file is the portal door's CHROME. The behaviour behind it — email → code
// → signed in, and the rule that a cooldown moves you ON rather than stranding
// you — lives once, in shared/web/use-email-sign-in.ts, which the agency app's
// own sign-in screen renders too. It used to live here as well, in a second
// copy, and a bug had to be fixed in both on the same day.
//
// SIGNING IN IS NOT GETTING IN. Invite-only is absolute (SCOPE ch.06): a correct
// code proves who you are, it does not create access. So a stranger who signs in
// successfully lands on the "nothing here yet" screen rather than a new empty
// world of their own — and this component says nothing that promises otherwise.
//
// Google sign-in exists as a product decision (same person as long as the email
// matches) but is not wired in code yet, on either front door. It is deliberately
// NOT stubbed here: a button that doesn't work is worse than one that isn't there.

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { brand } from "@shared/brand"
import { CodeInput } from "@shared/web/code-input"
import { invalidate } from "@shared/web/store"
import { useEmailSignIn } from "@shared/web/use-email-sign-in"
import { auth } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"

const emailConfig = { ...defaultFieldConfig, label: "Your email", required: true }

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const { step, email, setEmail, code, busy, error, sendCode, enterCode, useDifferentEmail } =
    useEmailSignIn({
      startEmail: auth.startEmail,
      verifyEmail: auth.verifyEmail,
      onSignedIn: () => {
        // The session changed under us; nothing cached about the last person is
        // true any more.
        invalidate(cacheKeys.session)
        onSignedIn()
      },
      announce: toast.success,
    })

  return (
    <div className="w-full max-w-sm">
      <div className="flex flex-col items-center gap-2 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logoUrl ?? "/icons/icon.svg"} alt="" className="size-12 rounded-xl" />
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to {brand.name}</h1>
        <p className="text-muted-foreground">
          {step === "email"
            ? "We'll email you a six-digit code. No password to remember."
            : `Enter the code we sent to ${email}.`}
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-4">
        {step === "email" ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              void sendCode()
            }}
          >
            <Field config={emailConfig} htmlFor="email" error={error}>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@yourcompany.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                autoFocus
              />
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={busy || !email}>
              {busy ? <Spinner /> : null}
              Email me a code
            </Button>
          </form>
        ) : (
          <>
            <CodeInput value={code} disabled={busy} onChange={enterCode} />
            {error ? <p className="text-destructive text-center text-sm">{error}</p> : null}
            {busy ? (
              <div className="flex justify-center">
                <Spinner />
              </div>
            ) : null}
            <Button variant="ghost" className="w-full" disabled={busy} onClick={useDifferentEmail}>
              Use a different email
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
