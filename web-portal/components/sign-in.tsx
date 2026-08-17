"use client"

// SIGN IN — an email address and a six-digit code, or Google, and nothing else
// on screen.
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
// GOOGLE IS THE SECOND WAY TO PROVE THE SAME THING, not a second account: the
// verified Google address goes through the one identity seam the code path uses
// (findOrCreateUserByEmail), so the person who used a code last week and Google
// today is one row. It creates access no more than the code does — SCOPE ch.06
// is explicit: "signing in with Google never creates access; the invite does."
// The wording of a failure and the brand mark are shared with the agency door
// (shared/web/google-sign-in.tsx) so the two can't drift apart.

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { brand } from "@shared/brand"
import { CodeInput } from "@shared/web/code-input"
import { GoogleMark, useSignInError } from "@shared/web/google-sign-in"
import { invalidate } from "@shared/web/store"
import { useEmailSignIn } from "@shared/web/use-email-sign-in"
import { auth } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"
import { useT } from "@shared/web/language"

const emailConfig = { ...defaultFieldConfig, label: "Your email", required: true }

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const t = useT()
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
  // Google sends someone back here with a `?error=` when the round-trip failed.
  const googleError = useSignInError()

  return (
    <div className="w-full max-w-sm">
      <div className="flex flex-col items-center gap-2 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logoUrl ?? "/icons/icon.svg"} alt="" className="size-12 rounded-xl" />
        <h1 className="text-2xl font-semibold tracking-tight">{t("Sign in to")} {brand.name}</h1>
        <p className="text-muted-foreground">
          {step === "email"
            ? "We'll email you a six-digit code, or you can use Google. No password to remember."
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
              {t("Email me a code")}
            </Button>
            {/* BESIDE the code, never instead of it — the same two ways in that
                the agency door offers, landing on the same person either way. */}
            <div className="flex items-center gap-3">
              <span className="bg-border h-px flex-1" />
              <span className="text-muted-foreground text-sm">or</span>
              <span className="bg-border h-px flex-1" />
            </div>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={() => window.location.assign(auth.googleStartUrl)}
            >
              <GoogleMark />
              {t("Continue with Google")}
            </Button>
            {googleError ? (
              <p className="text-destructive text-center text-sm">{googleError}</p>
            ) : null}
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
              {t("Use a different email")}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
